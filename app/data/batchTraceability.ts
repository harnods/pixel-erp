/**
 * Batch Traceability Report — data layer (plan Phase 0, PRD "[PRD] INV - Batch
 * Traceability Report"). Everything the report page and the Batch traceability detail
 * page read comes from here; the pages only filter, format and export.
 *
 * WHY A LEDGER OF ITS OWN. The product pages' batch history (`getBatchTransactions`)
 * is a generic movement list: no counterparty, no origin/destination warehouse, no
 * Work Order links, no attribute snapshot — exactly the fields traceability is about.
 * So this module seeds a movement per transaction that touches a batch, carrying all of
 * them. It is anchored to the same batches (`getProductBatches`): every batch's journey
 * ends at the batch's current on-hand, so the report never contradicts Product details.
 *
 * The per-warehouse split is derived from THIS ledger (receipts, transfers, issues per
 * warehouse), not from `getBatchWarehouseStock`, whose proportional split doesn't sum
 * back to the batch total. Totals agree; only the breakdown is new.
 *
 * Seeded story, per batch (deterministic from the batch id):
 *   receipt (Purchase delivery from its Vendor — or Work order output for a roasted
 *   batch) → optional Purchase return → Warehouse transfer to a second warehouse →
 *   Sales deliveries from both → Work order consumption (green beans roasted into a
 *   roasted batch) → optional Sales return / Stock in/out / Stock count.
 * Receipt quantities are solved backwards so the running balance lands on on-hand and
 * no warehouse ever goes negative.
 *
 * Attribute values are snapshotted per movement (PRD story 8). A graded batch's
 * receipt carries a different grade than the batch holds today ("graded on arrival,
 * regraded later"), so the snapshot indicator has something real to show.
 *
 * Not modelled (yet): Purchase/Sales invoice and Reversal movements are valid types and
 * follow the sign rule, but aren't seeded — invoice + delivery would double count the
 * same goods until the PM answers that question. Storage locations, deleted
 * transactions and the Jurnal "Unassigned warehouse" are out of Phase 0.
 */
import { warehouses } from './warehouses'
import { getWarehouseDetail } from './warehouseDetails'
import { vendors } from './vendors'
import { customers } from './customers'
import { productIndexRows } from './productsIndex'
import { getProductBatches, isProductBatchTracked, type ProductBatchSummary } from './productDetails'
import { DUI_PRODUCTS } from './dualUnitInventory'
import {
  BATCH_ATTRIBUTE_KEYS, SEED_GRADE_IDS, expiryEffectiveDate, getBatchAttributeConfig, isBatchAttributeKey,
  type BatchAttributeKey, type BatchAttributeValues,
} from './batchAttributes'
import { batchActivityFor } from './batchStore'
import { STAFF, TODAY_ISO, shiftDays } from './master'

// ── Transaction types & the sign rule ───────────────────────────────────────────
export type TraceTxType =
  | 'Purchase delivery' | 'Purchase invoice' | 'Purchase return'
  | 'Sales delivery' | 'Sales invoice' | 'Sales return'
  | 'Warehouse transfer' | 'Work order' | 'Stock in/out' | 'Stock count' | 'Reversal'

/** Every type the Transaction type filter offers, in the PRD's order. */
export const TRACE_TX_TYPES: readonly TraceTxType[] = [
  'Purchase delivery', 'Purchase invoice', 'Purchase return',
  'Sales delivery', 'Sales invoice', 'Sales return',
  'Warehouse transfer', 'Work order', 'Stock in/out', 'Stock count', 'Reversal',
]

/** The module a transaction belongs to — drives the Customer/Vendor filters and, in the
 *  UI, whether the user may open the transaction (PRD story 8 privilege rule). */
export type TraceModule = 'purchase' | 'sales' | 'inventory' | 'production'

export function txModule(type: TraceTxType): TraceModule {
  if (type.startsWith('Purchase')) return 'purchase'
  if (type.startsWith('Sales')) return 'sales'
  if (type === 'Work order') return 'production'
  return 'inventory'
}

const ORIGIN_TYPES: ReadonlySet<TraceTxType> = new Set<TraceTxType>([
  'Sales delivery', 'Sales invoice', 'Sales return', 'Warehouse transfer', 'Stock in/out', 'Stock count',
])
const DESTINATION_TYPES: ReadonlySet<TraceTxType> = new Set<TraceTxType>([
  'Purchase delivery', 'Purchase invoice', 'Purchase return', 'Warehouse transfer',
])

/** Warehouse origin only applies to the Sales module, Warehouse transfer, Stock in/out
 *  and Stock count — for any other type it's neither shown nor filterable. */
export function hasOriginWarehouse(type: TraceTxType): boolean { return ORIGIN_TYPES.has(type) }
/** Warehouse destination only applies to the Purchase module and Warehouse transfer. */
export function hasDestinationWarehouse(type: TraceTxType): boolean { return DESTINATION_TYPES.has(type) }

export type MutationDirection = 'in' | 'out' | 'neutral'

/**
 * The PRD sign rule (stories 5 and 8): which way a transaction moves a batch.
 * Work order depends on the batch's role (finished good = in, raw material = out);
 * Stock in/out and Reversal follow the entered quantity; Warehouse transfer and Stock
 * count never change the batch total.
 */
export function mutationDirection(
  type: TraceTxType,
  opts: { role?: 'input' | 'output'; delta?: number } = {},
): MutationDirection {
  switch (type) {
    case 'Purchase delivery':
    case 'Purchase invoice':
    case 'Sales return':
      return 'in'
    case 'Purchase return':
    case 'Sales delivery':
    case 'Sales invoice':
      return 'out'
    case 'Warehouse transfer':
    case 'Stock count':
      return 'neutral'
    case 'Work order':
      return opts.role === 'output' ? 'in' : 'out'
    case 'Stock in/out':
    case 'Reversal':
      return (opts.delta ?? 0) >= 0 ? 'in' : 'out'
  }
}

function signedQty(direction: MutationDirection, qty: number): number {
  return direction === 'in' ? qty : direction === 'out' ? -qty : 0
}

// ── Entitlement & cell states ───────────────────────────────────────────────────
/** What the company has access to. The ERP brand has both built in; the Jurnal brand
 *  without the Batch Attribute add-on keeps only Expiry date (PRD story 1). */
export interface TraceabilityAccess {
  batchAttribute: boolean
  dualUnit: boolean
}
export const FULL_ACCESS: TraceabilityAccess = { batchAttribute: true, dualUnit: true }

/** Whether an attribute filter is selectable. Unavailable ones still render, greyed. */
export function isAttributeAvailable(key: BatchAttributeKey, access: TraceabilityAccess = FULL_ACCESS): boolean {
  return key === 'expiry_date' || access.batchAttribute
}

/** A product's attributes as the report's Attribute 1–3 columns show them: its configured
 *  set (max 3), minus the ones the company isn't entitled to; Expiry date when that
 *  leaves nothing. */
export function productTraceAttributes(sku: string, access: TraceabilityAccess = FULL_ACCESS): BatchAttributeKey[] {
  const keys = getBatchAttributeConfig(sku).map((a) => a.key).filter((k) => isAttributeAvailable(k, access))
  return keys.length ? keys : ['expiry_date']
}

/** The PRD's three cell states: NA (not used / no access), empty (used, no value), value. */
export type AttributeCell = { state: 'na' } | { state: 'empty' } | { state: 'value'; value: string }
export type QtyCell = { state: 'na' } | { state: 'empty' } | { state: 'value'; value: number }

/** One attribute cell. Expiry date is never NA — every batch can carry one. */
export function attributeCell(
  sku: string,
  values: BatchAttributeValues,
  key: BatchAttributeKey,
  access: TraceabilityAccess = FULL_ACCESS,
): AttributeCell {
  if (key !== 'expiry_date') {
    if (!access.batchAttribute) return { state: 'na' }
    if (!getBatchAttributeConfig(sku).some((a) => a.key === key)) return { state: 'na' }
  }
  const value = values[key]
  return value ? { state: 'value', value } : { state: 'empty' }
}

function attributeCells(sku: string, values: BatchAttributeValues, access: TraceabilityAccess): Record<BatchAttributeKey, AttributeCell> {
  const out = {} as Record<BatchAttributeKey, AttributeCell>
  for (const key of BATCH_ATTRIBUTE_KEYS) out[key] = attributeCell(sku, values, key, access)
  return out
}

// ── Date conditions (range / before / after) ────────────────────────────────────
export type DateCondition =
  | { op: 'between'; from: string; to: string }
  | { op: 'before'; date: string }
  | { op: 'after'; date: string }

/** ISO comparison; `between` is inclusive, `before`/`after` are strict. */
export function matchesDateCondition(value: string, cond: DateCondition): boolean {
  if (!value) return false
  switch (cond.op) {
    case 'between': return value >= cond.from && value <= cond.to
    case 'before': return value < cond.date
    case 'after': return value > cond.date
  }
}

// ── Seed helpers ────────────────────────────────────────────────────────────────
function hash(s: string): number {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

/** What each product is made from, one Work order per output batch (PRD story 10).
 *  Roasted beans are roasted from green beans; 1106 (a retail 250g bag) is packed from
 *  the 1102 roast — a second level, so a 1102 batch has both a source and a result batch
 *  on Related batch. 1106 takes two batches of the SAME product, so Related batch shows
 *  them as separate lines. Every green bean goes into at least one roast. */
const ROAST_SOURCES: Record<string, string[]> = {
  '1101': ['1001', '1002', '1003'],
  '1102': ['1002', '1008'],
  '1103': ['1001'],
  '1104': ['1005', '1007'],
  '1105': ['1006', '1004'],
  '1106': ['1102', '1102'],
}
/** Made from something that is itself made — its Work order runs after the first level. */
const isSecondLevel = (sku: string) => (ROAST_SOURCES[sku] ?? []).some((source) => source in ROAST_SOURCES)

function activeWarehouses() {
  return warehouses.filter((w) => !w.isDefault && w.status === 'active')
}

/** The batch's home warehouse and the one part of it is transferred to. */
function pickWarehouses(batchId: string): [string, string] {
  const list = activeWarehouses()
  const h = hash(batchId)
  const first = h % list.length
  let second = (h >>> 3) % list.length
  if (second === first) second = (first + 1) % list.length
  return [list[first]!.id, list[second]!.id]
}

// ── Ledger ──────────────────────────────────────────────────────────────────────
/** One transaction's effect on one batch. */
export interface TraceMovement {
  id: string
  batchId: string
  sku: string
  type: TraceTxType
  number: string
  date: string
  /** The warehouse whose stock changed — the SOURCE warehouse for a transfer. */
  warehouseId: string
  /** Transfer destination. */
  toWarehouseId?: string
  customerId?: string
  vendorId?: string
  /** Work order only: finished good (output) or raw material (input). */
  role?: 'input' | 'output'
  direction: MutationDirection
  /** Magnitude in base unit, never negative. For a Stock count: the counted quantity. */
  qty: number
  /** Attribute values recorded on the transaction (PRD story 8). */
  attributes: BatchAttributeValues
}

interface TracedBatch {
  sku: string
  productName: string
  unit: string
  /** Position within the product's batch list — also its Dual Unit batch index. */
  index: number
  batch: ProductBatchSummary
}

interface WorkOrderLink {
  number: string
  date: string
  output: TracedBatch
  /** Filled while building the output batch's receipt. */
  outputQty: number
  inputs: { ref: TracedBatch; qty: number }[]
}

interface Ledger {
  movements: TraceMovement[]
  links: WorkOrderLink[]
  /** Seeded attribute changes per batch id — the regrade behind a graded receipt snapshot. */
  changes: Map<string, AttributeChangeMarker[]>
}

/** Every batch of every batch-tracked product, as the product pages list it. */
function tracedBatches(): TracedBatch[] {
  const out: TracedBatch[] = []
  for (const row of productIndexRows()) {
    if (!isProductBatchTracked(row.sku)) continue
    getProductBatches(row.sku).forEach((batch, index) => {
      out.push({ sku: row.sku, productName: row.name, unit: row.unit, index, batch })
    })
  }
  return out
}

let ledgerCache: Ledger | null = null

/** The seeded ledger, built once. Batch numbers and current attributes are always read
 *  live from the batch store — only the seeded history is frozen. */
function ledger(): Ledger {
  if (!ledgerCache) ledgerCache = buildLedger()
  return ledgerCache
}

function buildLedger(): Ledger {
  const stocked = tracedBatches().filter((r) => r.batch.onHand > 0)
  const bySku = new Map<string, TracedBatch[]>()
  for (const r of stocked) bySku.set(r.sku, [...(bySku.get(r.sku) ?? []), r])

  const counters: Record<string, number> = {}
  const nextNumber = (prefix: string) => {
    counters[prefix] = (counters[prefix] ?? 0) + 1
    return `${prefix}-2026-${String(1000 + counters[prefix]!).padStart(4, '0')}`
  }
  const customerIds = customers.slice(0, 6).map((c) => c.id)
  const coffeeVendorIds = vendors.slice(0, 5).map((v) => v.id)

  // Pass 1 — Work orders: each roasted batch is produced from green-bean batches.
  const links: WorkOrderLink[] = []
  for (const r of stocked) {
    const sources = ROAST_SOURCES[r.sku]
    if (!sources) continue
    const inputs: WorkOrderLink['inputs'] = []
    sources.forEach((greenSku, j) => {
      const greens = bySku.get(greenSku) ?? []
      if (!greens.length) return
      const g = greens[(r.index + j) % greens.length]!
      if (inputs.some((i) => i.ref.batch.id === g.batch.id)) return
      inputs.push({ ref: g, qty: 2 + (hash(r.batch.id + g.batch.id) % 3) })
    })
    if (!inputs.length) continue
    links.push({
      number: nextNumber('WO'),
      // Roasting 60–79 days ago; packing the roast into retail bags 25–39 days ago.
      date: isSecondLevel(r.sku)
        ? shiftDays(TODAY_ISO, -(25 + (hash(r.batch.id) % 15)))
        : shiftDays(TODAY_ISO, -(60 + (hash(r.batch.id) % 20))),
      output: r,
      outputQty: 0,
      inputs,
    })
  }

  // A product with more batches than its roasts would leave one unused — add it to a
  // roast of that product so every source batch reaches Related batch.
  for (const [greenSku, greens] of bySku) {
    const users = links.filter((l) => ROAST_SOURCES[l.output.sku]?.includes(greenSku))
    if (!users.length) continue
    for (const g of greens) {
      if (links.some((l) => l.inputs.some((i) => i.ref.batch.id === g.batch.id))) continue
      const link = users[hash(g.batch.id) % users.length]!
      link.inputs.push({ ref: g, qty: 2 + (hash(link.output.batch.id + g.batch.id) % 3) })
    }
  }

  // Pass 2 — every stocked batch's own history, solved to end at its on-hand.
  const movements: TraceMovement[] = []
  const changes = new Map<string, AttributeChangeMarker[]>()
  for (const r of stocked) {
    const id = r.batch.id
    const h = hash(id)
    const onHand = r.batch.onHand
    const [home, second] = pickWarehouses(id)
    const current = r.batch.attributes
    const outputLink = links.find((l) => l.output.batch.id === id)
    const consumed = links.flatMap((l) => l.inputs.filter((i) => i.ref.batch.id === id).map((i) => ({ link: l, qty: i.qty })))

    const small = onHand < 5
    const transferQty = small ? 0 : Math.max(1, Math.floor(onHand * 0.3))
    const homeSalesQty = small ? 0 : Math.max(1, Math.floor(onHand * 0.15))
    const secondSalesQty = Math.floor(transferQty * 0.3)
    const returnQty = !small && h % 2 === 1 ? 1 : 0
    let adjustment = small ? 0 : ((h >>> 2) % 3) - 1
    if (transferQty - secondSalesQty + adjustment < 0) adjustment = 0
    const purchaseReturnQty = !outputLink && !small && h % 4 === 0 ? 1 : 0
    const consumedQty = consumed.reduce((sum, c) => sum + c.qty, 0)
    const receiptQty = onHand + homeSalesQty + secondSalesQty - returnQty - adjustment + purchaseReturnQty + consumedQty

    const receiptDate = outputLink?.date ?? shiftDays(TODAY_ISO, -(90 + (h % 30)))
    const day = (offset: number) => shiftDays(receiptDate, offset)
    // Receipts, transfers and deliveries run on shared days, so batches that move on the
    // same day through the same warehouse land in one transaction (bundled below).
    // Receipts only move earlier and the rest only later, so each batch's order holds.
    const receiptDay = snapDay(day(0), 7, 'down')
    const vendorId = current.supplier ?? coffeeVendorIds[h % coffeeVendorIds.length]!
    const homeCustomer = customerIds[h % customerIds.length]!
    const secondCustomer = customerIds[(h >>> 1) % customerIds.length]!

    const batchMovements: Omit<TraceMovement, 'id'>[] = []
    const add = (m: Omit<TraceMovement, 'id' | 'batchId' | 'sku' | 'attributes'> & { attributes?: BatchAttributeValues }) => {
      batchMovements.push({ ...m, batchId: id, sku: r.sku, attributes: m.attributes ?? { ...current } })
    }

    // Graded on arrival as a different grade than the batch holds now.
    const receiptAttributes: BatchAttributeValues = { ...current }
    if (current.grade) {
      receiptAttributes.grade = current.grade === SEED_GRADE_IDS.A ? SEED_GRADE_IDS.B : SEED_GRADE_IDS.A
      // …and the regrade that explains it, the day after receipt (PRD story 9).
      changes.set(id, [{
        id: `${id}::regrade`,
        date: day(1),
        user: STAFF[h % STAFF.length]!,
        channel: 'web',
        changes: [{ key: 'grade', from: receiptAttributes.grade, to: current.grade }],
      }])
    }

    if (outputLink) {
      outputLink.outputQty = receiptQty
      add({ type: 'Work order', number: outputLink.number, date: outputLink.date, warehouseId: home, role: 'output', direction: 'in', qty: receiptQty, attributes: receiptAttributes })
    } else {
      add({ type: 'Purchase delivery', number: nextNumber('PD'), date: receiptDay, warehouseId: home, vendorId, direction: 'in', qty: receiptQty, attributes: receiptAttributes })
    }
    if (purchaseReturnQty) add({ type: 'Purchase return', number: nextNumber('PR'), date: day(3), warehouseId: home, vendorId, direction: 'out', qty: purchaseReturnQty })
    if (transferQty) add({ type: 'Warehouse transfer', number: nextNumber('WT'), date: snapDay(day(7), 7, 'up'), warehouseId: home, toWarehouseId: second, direction: 'neutral', qty: transferQty })
    if (homeSalesQty) add({ type: 'Sales delivery', number: nextNumber('SD'), date: snapDay(day(15), 14, 'up'), warehouseId: home, customerId: homeCustomer, direction: 'out', qty: homeSalesQty })
    for (const c of consumed) {
      add({ type: 'Work order', number: c.link.number, date: c.link.date, warehouseId: home, role: 'input', direction: 'out', qty: c.qty })
    }
    if (secondSalesQty) add({ type: 'Sales delivery', number: nextNumber('SD'), date: snapDay(day(30), 14, 'up'), warehouseId: second, customerId: secondCustomer, direction: 'out', qty: secondSalesQty })
    if (returnQty) add({ type: 'Sales return', number: nextNumber('SR'), date: day(38), warehouseId: home, customerId: homeCustomer, direction: 'in', qty: returnQty })
    if (adjustment) {
      add({ type: 'Stock in/out', number: nextNumber('SA'), date: day(45), warehouseId: second, direction: mutationDirection('Stock in/out', { delta: adjustment }), qty: Math.abs(adjustment) })
    }
    const counted = !small && h % 3 === 0
    if (counted) add({ type: 'Stock count', number: nextNumber('SC'), date: day(50), warehouseId: home, direction: 'neutral', qty: 0 })

    // Chronological, then fill each Stock count with what was counted at that moment.
    batchMovements.sort((a, b) => a.date.localeCompare(b.date))
    const balances = new Map<string, number>()
    batchMovements.forEach((m, k) => {
      if (m.type === 'Stock count') m.qty = balances.get(m.warehouseId) ?? 0
      else applyToBalances(balances, m)
      movements.push({ ...m, id: `${id}::m${k}` })
    })
  }

  bundleTransactions(movements)
  return { movements, links, changes }
}

/** Move an ISO date onto a shared `every`-day grid, earlier ('down') or later ('up'). */
function snapDay(iso: string, every: number, way: 'down' | 'up'): string {
  const index = Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000)
  const rest = ((index % every) + every) % every
  return shiftDays(iso, way === 'down' ? -rest : (every - rest) % every)
}

/**
 * Lines of one type, on one day, through the same warehouse(s) become ONE transaction —
 * so a delivery or transfer can carry several products and batches (By transaction).
 * A sales delivery goes to one customer (the first line's); a purchase delivery only
 * bundles lines from the same vendor. Numbers are then reissued in date order.
 */
function bundleTransactions(movements: TraceMovement[]) {
  const BUNDLED: Partial<Record<TraceTxType, string>> = {
    'Purchase delivery': 'PD', 'Warehouse transfer': 'WT', 'Sales delivery': 'SD',
  }
  const firstOf = new Map<string, TraceMovement>()
  for (const m of [...movements].sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number))) {
    if (!BUNDLED[m.type]) continue
    const key = [m.type, m.date, m.warehouseId, m.toWarehouseId ?? '', m.type === 'Purchase delivery' ? m.vendorId : ''].join('|')
    const first = firstOf.get(key)
    if (!first) { firstOf.set(key, m); continue }
    m.number = first.number
    if (m.type === 'Sales delivery') m.customerId = first.customerId
  }
  // Reissue each bundled prefix 1001, 1002, … oldest first, so no numbers go missing.
  for (const [type, prefix] of Object.entries(BUNDLED) as [TraceTxType, string][]) {
    const ofType = movements.filter((m) => m.type === type)
    const order = [...new Map(ofType.map((m) => [m.number, m.date])).entries()]
      .sort(([na, da], [nb, db]) => da.localeCompare(db) || na.localeCompare(nb))
    const renumber = new Map(order.map(([number], i) => [number, `${prefix}-2026-${1001 + i}`]))
    for (const m of ofType) m.number = renumber.get(m.number)!
  }
}

/** Move a batch's per-warehouse balances by one movement. */
function applyToBalances(balances: Map<string, number>, m: Pick<TraceMovement, 'type' | 'warehouseId' | 'toWarehouseId' | 'direction' | 'qty'>) {
  const add = (wh: string, qty: number) => balances.set(wh, (balances.get(wh) ?? 0) + qty)
  if (m.type === 'Warehouse transfer' && m.toWarehouseId) {
    add(m.warehouseId, -m.qty)
    add(m.toWarehouseId, m.qty)
  } else if (m.direction !== 'neutral') {
    add(m.warehouseId, signedQty(m.direction, m.qty))
  }
}

// ── Batch lookups ───────────────────────────────────────────────────────────────
function findBatch(sku: string, batchNo: string): TracedBatch | undefined {
  if (!isProductBatchTracked(sku)) return undefined
  const row = productIndexRows().find((r) => r.sku === sku)
  if (!row) return undefined
  const batches = getProductBatches(sku)
  const index = batches.findIndex((b) => b.batchNo === batchNo)
  if (index < 0) return undefined
  return { sku, productName: row.name, unit: row.unit, index, batch: batches[index]! }
}

function findBatchById(sku: string, batchId: string): TracedBatch | undefined {
  const row = productIndexRows().find((r) => r.sku === sku)
  if (!row) return undefined
  const batches = getProductBatches(sku)
  const index = batches.findIndex((b) => b.id === batchId)
  if (index < 0) return undefined
  return { sku, productName: row.name, unit: row.unit, index, batch: batches[index]! }
}

function movementsFor(batchId: string): TraceMovement[] {
  return ledger().movements.filter((m) => m.batchId === batchId)
}

/** Secondary inventory unit + this batch's conversion, or null when the product has none. */
function secondaryConversion(ref: TracedBatch, access: TraceabilityAccess): { unit: string; perBase: number } | null {
  if (!access.dualUnit) return null
  const product = DUI_PRODUCTS.find((p) => p.sku === ref.sku)
  const batch = product?.batches[ref.index]
  return product && batch ? { unit: product.secondaryUnit, perBase: batch.secondaryPerBase } : null
}

function warehouseName(id: string): string {
  return warehouses.find((w) => w.id === id)?.name ?? id
}

function originOf(m: TraceMovement): string | null {
  return hasOriginWarehouse(m.type) ? m.warehouseId : null
}

function destinationOf(m: TraceMovement): string | null {
  if (!hasDestinationWarehouse(m.type)) return null
  return m.type === 'Warehouse transfer' ? m.toWarehouseId ?? null : m.warehouseId
}

export type Counterparty = { kind: 'customer' | 'vendor'; id: string } | null

function counterpartyOf(m: TraceMovement): Counterparty {
  if (m.customerId) return { kind: 'customer', id: m.customerId }
  if (m.vendorId) return { kind: 'vendor', id: m.vendorId }
  return null
}

// ── Filter options ──────────────────────────────────────────────────────────────
/** Product filter: batch-tracked products, A–Z. */
export function traceProductOptions(): { sku: string; name: string }[] {
  return productIndexRows()
    .filter((r) => isProductBatchTracked(r.sku))
    .map((r) => ({ sku: r.sku, name: r.name }))
    .sort((a, b) => collator.compare(a.name, b.name))
}

/** Batch number filter: distinct batch numbers, A–Z — across the company, or only the
 *  given products' batches when some are picked. */
export function traceBatchNumberOptions(productSkus: readonly string[] = []): string[] {
  const numbers = new Set(tracedBatches()
    .filter((r) => !r.batch.archived && (!productSkus.length || productSkus.includes(r.sku)))
    .map((r) => r.batch.batchNo))
  return [...numbers].sort(collator.compare)
}

/** Transaction number filter: distinct numbers of every transaction that touched a batch. */
export function traceTransactionNumberOptions(): string[] {
  return [...new Set(ledger().movements.map((m) => m.number))].sort(collator.compare)
}

// ── Search by batch (PRD stories 2, 3) ──────────────────────────────────────────
export interface BatchSearchFilter {
  productSkus?: string[]
  batchNos?: string[]
  /** 'all', undefined or [] = All warehouse: one line per batch, summed. */
  warehouseIds?: 'all' | string[]
  vendorIds?: string[]
  gradeIds?: string[]
  expiry?: DateCondition
  manufacturing?: DateCondition
  bestBefore?: DateCondition
}

export interface BatchSearchRow {
  key: string
  batchId: string
  sku: string
  productName: string
  batchNo: string
  unit: string
  /** null = the All warehouse line. */
  warehouseId: string | null
  attributes: Record<BatchAttributeKey, AttributeCell>
  onHandBase: QtyCell
  onHandSecondary: QtyCell
  secondaryUnit: string | null
}

function matchesAttributeFilters(ref: TracedBatch, filter: BatchSearchFilter, access: TraceabilityAccess): boolean {
  const cell = (key: BatchAttributeKey) => attributeCell(ref.sku, ref.batch.attributes, key, access)
  const inSet = (key: BatchAttributeKey, ids: string[] | undefined) => {
    if (!ids?.length || !isAttributeAvailable(key, access)) return true
    const c = cell(key)
    return c.state === 'value' && ids.includes(c.value)
  }
  const onDate = (key: BatchAttributeKey, cond: DateCondition | undefined) => {
    if (!cond || !isAttributeAvailable(key, access)) return true
    const c = cell(key)
    if (c.state !== 'value') return false
    // A month-precision expiry counts as its last day (Batch Attribute PM answer A2).
    return matchesDateCondition(key === 'expiry_date' ? expiryEffectiveDate(c.value) : c.value, cond)
  }
  return inSet('supplier', filter.vendorIds)
    && inSet('grade', filter.gradeIds)
    && onDate('expiry_date', filter.expiry)
    && onDate('manufacturing_date', filter.manufacturing)
    && onDate('best_before_date', filter.bestBefore)
}

/**
 * Batch lines matching the Batch info filters. Product and Batch number combine with
 * AND; multiple values within one filter combine with OR.
 *
 * With selected warehouses, a batch gets one line per selected warehouse it has ever
 * moved through — its on-hand there may be 0. Warehouses it never touched get no line.
 * (Interim reading of story 3's "never transacted → empty": listing every selected
 * warehouse for every batch would bury the answer.)
 */
export function searchBatches(filter: BatchSearchFilter = {}, access: TraceabilityAccess = FULL_ACCESS): BatchSearchRow[] {
  const allWarehouses = !filter.warehouseIds || filter.warehouseIds === 'all' || filter.warehouseIds.length === 0
  const activeIds = new Set(activeWarehouses().map((w) => w.id))
  const rows: BatchSearchRow[] = []

  for (const ref of tracedBatches()) {
    if (ref.batch.archived) continue
    if (filter.productSkus?.length && !filter.productSkus.includes(ref.sku)) continue
    if (filter.batchNos?.length && !filter.batchNos.includes(ref.batch.batchNo)) continue
    const history = movementsFor(ref.batch.id)
    if (ref.batch.onHand <= 0 && history.length === 0) continue
    if (!matchesAttributeFilters(ref, filter, access)) continue

    const conversion = secondaryConversion(ref, access)
    const base = {
      batchId: ref.batch.id,
      sku: ref.sku,
      productName: ref.productName,
      batchNo: ref.batch.batchNo,
      unit: ref.unit,
      attributes: attributeCells(ref.sku, ref.batch.attributes, access),
      secondaryUnit: conversion?.unit ?? null,
    }
    const qtyCells = (qty: number): Pick<BatchSearchRow, 'onHandBase' | 'onHandSecondary'> => ({
      onHandBase: { state: 'value', value: qty },
      onHandSecondary: conversion ? { state: 'value', value: round2(qty * conversion.perBase) } : { state: 'na' },
    })

    if (allWarehouses) {
      rows.push({ ...base, key: `${ref.batch.id}::all`, warehouseId: null, ...qtyCells(ref.batch.onHand) })
      continue
    }
    const balances = new Map<string, number>()
    const touched = new Set<string>()
    for (const m of history) {
      applyToBalances(balances, m)
      touched.add(m.warehouseId)
      if (m.toWarehouseId) touched.add(m.toWarehouseId)
    }
    for (const whId of filter.warehouseIds as string[]) {
      if (!activeIds.has(whId) || !touched.has(whId)) continue
      rows.push({ ...base, key: `${ref.batch.id}::${whId}`, warehouseId: whId, ...qtyCells(balances.get(whId) ?? 0) })
    }
  }

  return rows.sort((a, b) =>
    collator.compare(a.productName, b.productName)
    || collator.compare(a.batchNo, b.batchNo)
    || collator.compare(a.warehouseId ? warehouseName(a.warehouseId) : '', b.warehouseId ? warehouseName(b.warehouseId) : ''))
}

// ── Search by transaction (PRD stories 4, 5) ────────────────────────────────────
export interface TransactionSearchFilter {
  types?: TraceTxType[]
  numbers?: string[]
  /** Only matches Sales-module transactions. */
  customerIds?: string[]
  /** Only matches Purchase-module transactions. */
  vendorIds?: string[]
  date?: DateCondition
  /** 'all' keeps any origin but still limits to types that have one. */
  originWarehouseIds?: 'all' | string[]
  /** 'all' keeps any destination but still limits to types that have one. */
  destinationWarehouseIds?: 'all' | string[]
}

export interface TransactionRow {
  number: string
  type: TraceTxType
  date: string
  module: TraceModule
  originWarehouseId: string | null
  destinationWarehouseId: string | null
  counterparty: Counterparty
}

function matchesWarehouse(
  selection: 'all' | string[] | undefined,
  applies: boolean,
  warehouseId: string | null,
): boolean {
  if (selection === undefined || (Array.isArray(selection) && selection.length === 0)) return true
  if (!applies) return false
  return selection === 'all' || (warehouseId !== null && selection.includes(warehouseId))
}

/** Transactions matching the Transaction filters — every line is one transaction, newest
 *  first. Not paginated: "select all" means all of these, not one page. */
export function searchTransactions(filter: TransactionSearchFilter = {}): TransactionRow[] {
  const byNumber = new Map<string, TraceMovement>()
  for (const m of ledger().movements) if (!byNumber.has(m.number)) byNumber.set(m.number, m)

  const rows: TransactionRow[] = []
  for (const m of byNumber.values()) {
    const row: TransactionRow = {
      number: m.number,
      type: m.type,
      date: m.date,
      module: txModule(m.type),
      originWarehouseId: originOf(m),
      destinationWarehouseId: destinationOf(m),
      counterparty: counterpartyOf(m),
    }
    if (filter.types?.length && !filter.types.includes(row.type)) continue
    if (filter.numbers?.length && !filter.numbers.includes(row.number)) continue
    if (filter.customerIds?.length && !(row.module === 'sales' && row.counterparty?.kind === 'customer' && filter.customerIds.includes(row.counterparty.id))) continue
    if (filter.vendorIds?.length && !(row.module === 'purchase' && row.counterparty?.kind === 'vendor' && filter.vendorIds.includes(row.counterparty.id))) continue
    if (filter.date && !matchesDateCondition(row.date, filter.date)) continue
    if (!matchesWarehouse(filter.originWarehouseIds, hasOriginWarehouse(row.type), row.originWarehouseId)) continue
    if (!matchesWarehouse(filter.destinationWarehouseIds, hasDestinationWarehouse(row.type), row.destinationWarehouseId)) continue
    rows.push(row)
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || collator.compare(a.number, b.number))
}

export interface TransactionBatchRow {
  key: string
  number: string
  type: TraceTxType
  date: string
  batchId: string
  sku: string
  productName: string
  batchNo: string
  unit: string
  /** The values recorded on the transaction, not the batch's current ones. */
  attributes: Record<BatchAttributeKey, AttributeCell>
  direction: MutationDirection
  qty: number
  baseDelta: number
  secondaryDelta: QtyCell
  secondaryUnit: string | null
}

/** The second result table: one line per transaction + product + batch across the
 *  selected transactions. A batch in two selected transactions is two lines. */
export function batchesInTransactions(numbers: readonly string[], access: TraceabilityAccess = FULL_ACCESS): TransactionBatchRow[] {
  if (!numbers.length) return []
  const selected = new Set(numbers)
  const rows = new Map<string, TransactionBatchRow>()
  for (const m of ledger().movements) {
    if (!selected.has(m.number)) continue
    const ref = findBatchById(m.sku, m.batchId)
    if (!ref) continue
    const key = `${m.number}::${m.batchId}`
    const conversion = secondaryConversion(ref, access)
    const existing = rows.get(key)
    const qty = (existing?.qty ?? 0) + m.qty
    const baseDelta = (existing?.baseDelta ?? 0) + signedQty(m.direction, m.qty)
    rows.set(key, {
      key,
      number: m.number,
      type: m.type,
      date: m.date,
      batchId: m.batchId,
      sku: m.sku,
      productName: ref.productName,
      batchNo: ref.batch.batchNo,
      unit: ref.unit,
      attributes: attributeCells(m.sku, m.attributes, access),
      direction: m.direction,
      qty,
      baseDelta,
      secondaryDelta: conversion ? { state: 'value', value: round2(baseDelta * conversion.perBase) } : { state: 'na' },
      secondaryUnit: conversion?.unit ?? null,
    })
  }
  return [...rows.values()].sort((a, b) =>
    collator.compare(a.productName, b.productName)
    || collator.compare(a.batchNo, b.batchNo)
    || b.date.localeCompare(a.date))
}

// ── Batch traceability detail (PRD stories 7–10) ────────────────────────────────
export interface BatchTraceIdentity {
  batchId: string
  sku: string
  productName: string
  batchNo: string
  description: string
  unit: string
  secondaryUnit: string | null
  /** Current values on the batch master. */
  attributes: BatchAttributeValues
  /** The first transaction in the batch's journey — null for a never-transacted batch. */
  createdDate: string | null
  createdByNumber: string | null
  createdByType: TraceTxType | null
}

export function getBatchTrace(sku: string, batchNo: string, access: TraceabilityAccess = FULL_ACCESS): BatchTraceIdentity | undefined {
  const ref = findBatch(sku, batchNo)
  if (!ref) return undefined
  const first = movementsFor(ref.batch.id)[0]
  return {
    batchId: ref.batch.id,
    sku,
    productName: ref.productName,
    batchNo: ref.batch.batchNo,
    description: ref.batch.description,
    unit: ref.unit,
    secondaryUnit: secondaryConversion(ref, access)?.unit ?? null,
    attributes: ref.batch.attributes,
    createdDate: first?.date ?? null,
    createdByNumber: first?.number ?? null,
    createdByType: first?.type ?? null,
  }
}

/** Total Received − Total Issued vs on-hand. Transfers and stock counts are neutral, so
 *  they count in neither. A non-zero difference is the mismatch warning. */
export function reconcile(
  movements: readonly Pick<TraceMovement, 'direction' | 'qty'>[],
  onHand: number,
): { received: number; issued: number; difference: number } {
  let received = 0
  let issued = 0
  for (const m of movements) {
    if (m.direction === 'in') received += m.qty
    else if (m.direction === 'out') issued += m.qty
  }
  return { received, issued, difference: onHand - (received - issued) }
}

export interface StockPosition {
  unit: string
  secondaryUnit: string | null
  totalBase: number
  totalSecondary: number | null
  /** Only warehouses where the batch holds stock now, A–Z. */
  warehouses: { warehouseId: string; onHandBase: number; onHandSecondary: number | null }[]
  received: number
  issued: number
  difference: number
}

export function batchStockPosition(sku: string, batchNo: string, access: TraceabilityAccess = FULL_ACCESS): StockPosition | undefined {
  const ref = findBatch(sku, batchNo)
  if (!ref) return undefined
  const history = movementsFor(ref.batch.id)
  const conversion = secondaryConversion(ref, access)
  const secondary = (qty: number) => (conversion ? round2(qty * conversion.perBase) : null)

  const balances = new Map<string, number>()
  for (const m of history) applyToBalances(balances, m)
  const warehouseRows = [...balances.entries()]
    .filter(([, qty]) => qty > 0)
    .map(([warehouseId, qty]) => ({ warehouseId, onHandBase: qty, onHandSecondary: secondary(qty) }))
    .sort((a, b) => collator.compare(warehouseName(a.warehouseId), warehouseName(b.warehouseId)))

  return {
    unit: ref.unit,
    secondaryUnit: conversion?.unit ?? null,
    totalBase: ref.batch.onHand,
    totalSecondary: secondary(ref.batch.onHand),
    warehouses: warehouseRows,
    ...reconcile(history, ref.batch.onHand),
  }
}

export interface JourneyRow {
  id: string
  date: string
  type: TraceTxType
  number: string
  module: TraceModule
  originWarehouseId: string | null
  destinationWarehouseId: string | null
  counterparty: Counterparty
  direction: MutationDirection
  qty: number
  baseDelta: number
  secondaryDelta: number | null
  /** Batch balance across ALL warehouses after this transaction. */
  balanceBase: number
  balanceSecondary: number | null
  /** Values recorded on this transaction. */
  attributes: BatchAttributeValues
  /** Keys whose recorded value differs from the batch master today. */
  changedAttributes: BatchAttributeKey[]
}

/** Every transaction that touched the batch, oldest first, with a running balance that
 *  always ends at the batch's on-hand. */
export function batchJourney(sku: string, batchNo: string, access: TraceabilityAccess = FULL_ACCESS): JourneyRow[] {
  const ref = findBatch(sku, batchNo)
  if (!ref) return []
  const conversion = secondaryConversion(ref, access)
  const secondary = (qty: number) => (conversion ? round2(qty * conversion.perBase) : null)
  const current = ref.batch.attributes
  let balance = 0
  return movementsFor(ref.batch.id).map((m) => {
    const baseDelta = signedQty(m.direction, m.qty)
    balance += baseDelta
    return {
      id: m.id,
      date: m.date,
      type: m.type,
      number: m.number,
      module: txModule(m.type),
      originWarehouseId: originOf(m),
      destinationWarehouseId: destinationOf(m),
      counterparty: counterpartyOf(m),
      direction: m.direction,
      qty: m.qty,
      baseDelta,
      secondaryDelta: secondary(baseDelta),
      balanceBase: balance,
      balanceSecondary: secondary(balance),
      attributes: m.attributes,
      changedAttributes: BATCH_ATTRIBUTE_KEYS.filter((k) => (m.attributes[k] ?? '') !== (current[k] ?? '')),
    }
  })
}

export interface RelatedBatchRow {
  sku: string
  productName: string
  batchNo: string
  unit: string
  workOrderNumber: string
  workOrderDate: string
  /** Consumed (source) or produced (result) in that Work order link. */
  qty: number
}

/** One level each way across Work orders (PRD story 10). Several batches of the same
 *  product in one Work order stay separate lines. */
export function relatedBatches(sku: string, batchNo: string): { sources: RelatedBatchRow[]; results: RelatedBatchRow[] } {
  const ref = findBatch(sku, batchNo)
  if (!ref) return { sources: [], results: [] }
  const id = ref.batch.id
  const toRow = (other: TracedBatch, link: WorkOrderLink, qty: number): RelatedBatchRow | null => {
    const live = findBatchById(other.sku, other.batch.id)
    if (!live) return null
    return {
      sku: live.sku,
      productName: live.productName,
      batchNo: live.batch.batchNo,
      unit: live.unit,
      workOrderNumber: link.number,
      workOrderDate: link.date,
      qty,
    }
  }
  const { links } = ledger()
  const sources = links
    .filter((l) => l.output.batch.id === id)
    .flatMap((l) => l.inputs.map((i) => toRow(i.ref, l, i.qty)))
  const results = links
    .filter((l) => l.inputs.some((i) => i.ref.batch.id === id))
    .map((l) => toRow(l.output, l, l.outputQty))
  return {
    sources: sources.filter((r): r is RelatedBatchRow => r !== null),
    results: results.filter((r): r is RelatedBatchRow => r !== null),
  }
}

export interface BatchStorageLocation {
  /** Bin path ("Rack A / Bin 3"), or '' when the warehouse has no storage tree. */
  location: string
  onHand: number
}

/** Share of a batch's warehouse stock per bin, by how many bins the product uses there. */
const BIN_SHARES: Record<number, number[]> = { 1: [1], 2: [0.6, 0.4], 3: [0.5, 0.3, 0.2] }

/**
 * Where a batch sits inside one warehouse (the Stock position "View locations" drawer).
 * The batch's on-hand in that warehouse comes from the ledger; it's spread over the bins
 * the product already occupies there (`getWarehouseDetail`), so the locations match the
 * warehouse's own storage tree. The parts always sum back to the warehouse on-hand.
 */
export function batchStorageLocations(sku: string, batchNo: string, warehouseId: string): BatchStorageLocation[] {
  const qty = batchStockPosition(sku, batchNo)?.warehouses.find((w) => w.warehouseId === warehouseId)?.onHandBase ?? 0
  if (qty <= 0) return []
  const item = getWarehouseDetail(warehouseId)?.stock.find((s) => s.sku === sku)
  const bins = (item?.bins.map((b) => b.location) ?? item?.locations ?? []).filter(Boolean).slice(0, 3)
  const list = bins.length ? bins : ['']
  const shares = BIN_SHARES[list.length]!
  const parts = shares.map((share) => Math.floor(qty * share))
  parts[0]! += qty - parts.reduce((sum, p) => sum + p, 0)
  return list
    .map((location, i) => ({ location, onHand: parts[i]! }))
    .filter((l) => l.onHand > 0)
}

// ── Attribute change trail (PRD story 9) ────────────────────────────────────────
/** Where a batch attribute was changed from. */
export type ChangeChannel = 'web' | 'import' | 'api'

/** One save that changed a batch's attributes — a marker line in the journey. */
export interface AttributeChangeMarker {
  id: string
  /** ISO date (seeded) or date-time (recorded edit). */
  date: string
  user: string
  channel: ChangeChannel
  changes: { key: BatchAttributeKey; from: string | null; to: string | null }[]
}

/**
 * Every change to the batch's attributes, oldest first: the seeded regrade that
 * explains a graded receipt snapshot, plus the edits people saved (batchActivityFor —
 * the batch form or the Update batches import). Batch number and description edits
 * aren't attribute changes, so they stay in the Activity log only.
 */
export function batchAttributeChanges(sku: string, batchNo: string): AttributeChangeMarker[] {
  const ref = findBatch(sku, batchNo)
  if (!ref) return []
  const seeded = ledger().changes.get(ref.batch.id) ?? []
  // batchActivityFor is newest first — flip it so same-instant edits keep their order.
  const recorded = [...batchActivityFor(ref.batch.id)].reverse().flatMap((e, i): AttributeChangeMarker[] => {
    if (e.action !== 'updated') return []
    const attributeChanges = e.changes
      .filter((c) => isBatchAttributeKey(c.field))
      .map((c) => ({ key: c.field as BatchAttributeKey, from: c.from, to: c.to }))
    if (!attributeChanges.length) return []
    return [{ id: `${ref.batch.id}::activity-${i}`, date: e.date, user: e.user, channel: e.channel ?? 'web', changes: attributeChanges }]
  })
  return [...seeded, ...recorded].sort((a, b) => a.date.localeCompare(b.date))
}

export type JourneyEntry =
  | { kind: 'movement'; row: JourneyRow }
  | { kind: 'change'; change: AttributeChangeMarker; balanceBase: number; balanceSecondary: number | null }

/**
 * The journey with attribute-change markers placed by date (story 9). A marker moves no
 * stock, so it carries the balance of the line before it and never affects the running
 * balance. On the same day, markers follow that day's movements.
 */
export function batchJourneyTimeline(sku: string, batchNo: string, access: TraceabilityAccess = FULL_ACCESS): JourneyEntry[] {
  const rows = batchJourney(sku, batchNo, access)
  const markers = batchAttributeChanges(sku, batchNo)
  const out: JourneyEntry[] = []
  let next = 0
  let balanceBase = 0
  let balanceSecondary: number | null = null
  const flushBefore = (date: string | null) => {
    while (next < markers.length && (date === null || markers[next]!.date.slice(0, 10) < date)) {
      out.push({ kind: 'change', change: markers[next++]!, balanceBase, balanceSecondary })
    }
  }
  for (const row of rows) {
    flushBefore(row.date)
    out.push({ kind: 'movement', row })
    balanceBase = row.balanceBase
    balanceSecondary = row.balanceSecondary
  }
  flushBefore(null)
  return out
}

// ── Visual journey (PRD story 11): flow by counterparty ─────────────────────────
/** Who (or what) is on the other side of a flow node. */
export type FlowPartyKind = 'vendor' | 'customer' | 'work-order' | 'other'

/** One flow node: everything that moved between the batch and one party, one way. */
export interface FlowParty {
  key: string
  kind: FlowPartyKind
  /** Vendor / customer id, the Work order number, or the transaction type for `other`. */
  refId: string
  direction: 'in' | 'out'
  /** Transaction types behind the node, first-seen order (e.g. Purchase delivery). */
  types: TraceTxType[]
  /** Base-unit quantity across the node. */
  qty: number
  /** Oldest first. */
  transactions: { id: string; number: string; date: string; qty: number; type: TraceTxType }[]
  /** Work order nodes only: the batches on the other side of that Work order (story 10). */
  batches: RelatedBatchRow[]
}

export interface BatchFlowGraph {
  /** Where the batch came from, biggest quantity first. */
  incoming: FlowParty[]
  /** Where the batch went, biggest quantity first. */
  outgoing: FlowParty[]
  /** Moves that don't change the batch total — transfers, stock counts — oldest first. */
  internal: JourneyRow[]
  received: number
  issued: number
}

/**
 * The journey as parties, not transaction types: who the batch came from and who it
 * went to, sized by quantity — the recall question ("who got it?") and the root-cause
 * one ("where did it come from?"). A presentation of the journey (story 8) and related
 * batches (story 10): no new data, the History table stays the source of truth.
 * - A vendor or customer is one node per direction (a purchase return is its own node
 *   on the way out).
 * - Each Work order is its own node, carrying the batches on its other side.
 * - Lines with no counterparty (stock in/out, invoices, reversals) group by type.
 */
export function batchFlowGraph(sku: string, batchNo: string, access: TraceabilityAccess = FULL_ACCESS): BatchFlowGraph {
  const rows = batchJourney(sku, batchNo, access)
  const related = relatedBatches(sku, batchNo)
  const parties = new Map<string, FlowParty>()
  const internal: JourneyRow[] = []
  let received = 0
  let issued = 0
  for (const row of rows) {
    if (row.direction === 'neutral') { internal.push(row); continue }
    if (row.direction === 'in') received += row.qty
    else issued += row.qty
    const kind: FlowPartyKind = row.type === 'Work order' ? 'work-order' : row.counterparty?.kind ?? 'other'
    const refId = kind === 'work-order' ? row.number : row.counterparty?.id ?? row.type
    const key = `${row.direction}:${kind}:${refId}`
    let party = parties.get(key)
    if (!party) {
      const side = row.direction === 'in' ? related.sources : related.results
      party = {
        key, kind, refId, direction: row.direction, types: [], qty: 0, transactions: [],
        batches: kind === 'work-order' ? side.filter((b) => b.workOrderNumber === row.number) : [],
      }
      parties.set(key, party)
    }
    if (!party.types.includes(row.type)) party.types.push(row.type)
    party.qty += row.qty
    party.transactions.push({ id: row.id, number: row.number, date: row.date, qty: row.qty, type: row.type })
  }
  const all = [...parties.values()]
  const bySize = (a: FlowParty, b: FlowParty) => b.qty - a.qty
  return {
    incoming: all.filter((p) => p.direction === 'in').sort(bySize),
    outgoing: all.filter((p) => p.direction === 'out').sort(bySize),
    internal,
    received,
    issued,
  }
}

// ── Access (PRD story 1) ────────────────────────────────────────────────────────
/** Roles that can read, filter and export the report: Owner, Ultimate and Stockist. */
export const BATCH_TRACEABILITY_ROLES = ['owner', 'ultimate', 'stockist'] as const

/** Whether a user holding these roles can open the report (and a batch's detail page). */
export function canViewBatchTraceability(roleIds: readonly string[]): boolean {
  return roleIds.some((id) => (BATCH_TRACEABILITY_ROLES as readonly string[]).includes(id))
}
