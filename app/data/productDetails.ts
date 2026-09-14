/**
 * Product details — everything the Product details page needs beyond the index row:
 * accounting defaults, a synthetic transaction (movement) ledger, and the per-warehouse
 * stock breakdown. Built on top of `productIndexRows` / `getWarehouseDetail` so the
 * numbers shown here always agree with the Products index and each warehouse's own
 * Products tab — never a second, drifting set of figures.
 */
import { reactive } from 'vue'
import { warehouses } from './warehouses'
import { getWarehouseDetail } from './warehouseDetails'
import { productIndexRows, type ProductIndexRow } from './productsIndex'
import { productTrackStockBy, isProductBatchTracked } from './trackStockBy'
import { vendors } from './vendors'
import { lastUpdatedFor } from '~/utils/lastUpdated'
import { TODAY } from './master'
import { loadSnapshot, saveSnapshot } from './persist'
import { generateNextBarcode } from './barcodeConfig'
import {
  BATCH_ATTRIBUTE_KEYS, getBatchAttributeConfig, isBatchAttributeKey, isValidAttributeDate, expiryEffectiveDate,
  type BatchAttributeKey, type BatchAttributeValues, type DataError, type DataResult,
} from './batchAttributes'
import { batchRecordsForSku, findBatchRecord, newBatchId, saveBatchRecord, type BatchRecord } from './batchStore'
import { gradeById } from './grades'

// How a product's stock is tracked lives in its own light module (trackStockBy.ts) so
// seed-data modules can share it; re-exported here for product-page callers.
export { productTrackStockBy, isProductBatchTracked, isProductSerialTracked, type TrackStockBy } from './trackStockBy'

export interface ProductDetail extends ProductIndexRow {
  productType: string
  trackStockBy: string
  defaultInventoryAccount: string
  defaultPurchaseAccount: string
  defaultPurchaseTax: string
  defaultSalesAccount: string
  defaultSalesTax: string
  createdBy: string
  createdAt: string
}

export function getProductDetail(sku: string): ProductDetail | undefined {
  const row = productIndexRows().find((r) => r.sku === sku)
  if (!row) return undefined
  const { at, by } = lastUpdatedFor(`created-${sku}`)
  return {
    ...row,
    productType: 'Single product',
    trackStockBy: productTrackStockBy(sku),
    defaultInventoryAccount: '1-10200 Inventory',
    defaultPurchaseAccount: '5-50000 Cost of Sales',
    defaultPurchaseTax: 'PPN 11%',
    defaultSalesAccount: '4-40000 Revenues',
    defaultSalesTax: 'PPN 11%',
    createdBy: by,
    createdAt: at,
  }
}

/** Per-warehouse stock rows for a single SKU (only warehouses that actually carry it). */
export interface ProductWarehouseStock {
  warehouseId: string
  warehouseName: string
  onHand: number
  reserved: number
  available: number
  onTheWay: number
  minStock: number
  unit: string
}

export function getProductWarehouseStock(sku: string): ProductWarehouseStock[] {
  const out: ProductWarehouseStock[] = []
  for (const wh of warehouses) {
    if (wh.isDefault || wh.status === 'archived') continue
    const detail = getWarehouseDetail(wh.id)
    const item = detail?.stock.find((s) => s.sku === sku)
    if (!detail || !item) continue
    out.push({
      warehouseId: wh.id,
      warehouseName: wh.name,
      onHand: item.onHand,
      reserved: item.reserved,
      available: item.available,
      onTheWay: item.onTheWay,
      minStock: item.minStock,
      unit: item.unit,
    })
  }
  return out
}

/** Per-warehouse serial-number counts for a single SKU (Stock by serial numbers
 *  tab) — unlike `getProductWarehouseStock`, this INCLUDES the default warehouse,
 *  since serial-tracked equipment is commonly held there rather than distributed. */
export interface ProductSerialStock {
  warehouseId: string
  warehouseName: string
  availableCount: number
  reservedCount: number
}

export function getProductSerialStock(sku: string): ProductSerialStock[] {
  const out: ProductSerialStock[] = []
  for (const wh of warehouses) {
    if (wh.status === 'archived') continue
    const detail = getWarehouseDetail(wh.id)
    const item = detail?.stock.find((s) => s.sku === sku)
    if (!detail || !item || !item.serials) continue
    out.push({
      warehouseId: wh.id,
      warehouseName: wh.name,
      availableCount: item.serials.available.length,
      reservedCount: item.serials.reserved.length,
    })
  }
  return out
}

/** Every serial number for a SKU (available + reserved) across all warehouses —
 *  used to print a barcode label for each unit from the Stock by SN tab. */
export function getProductAllSerials(sku: string): string[] {
  const out: string[] = []
  for (const wh of warehouses) {
    if (wh.status === 'archived') continue
    const item = getWarehouseDetail(wh.id)?.stock.find((s) => s.sku === sku)
    if (!item?.serials) continue
    for (const u of item.serials.available) out.push(u.serial)
    for (const u of item.serials.reserved) out.push(u.serial)
  }
  return out
}

// ── Transaction (movement) ledger ───────────────────────────────────────────────
export interface ProductTransaction {
  id: string
  date: string
  number: string
  delta: number
  affects: string[]
  onHand: number
  reserved: number
  available: number
  onTheWay: number
  unit: string
  type: string
}

const MOVEMENT_TEMPLATES: { type: string; sign: 1 | -1; affects: string[] }[] = [
  { type: 'Manual Stock Out', sign: -1, affects: ['On hand', 'Available'] },
  { type: 'Sales Return', sign: 1, affects: ['On hand', 'Available'] },
  { type: 'Sales Delivery', sign: -1, affects: ['On hand', 'Available'] },
  { type: 'Sales Order', sign: -1, affects: ['Available', 'Reserved'] },
  { type: 'Purchase Delivery', sign: 1, affects: ['On hand', 'Available'] },
  { type: 'Purchase Order', sign: 1, affects: ['In transit'] },
  { type: 'Stock In/Out', sign: 1, affects: ['On hand', 'Available'] },
]

function seedFrom(sku: string): number {
  let h = 0
  for (const ch of sku) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

/** Shared movement-ledger generator — deterministic history ending near the given
 *  starting totals. Used for both a product's full ledger and a single batch's
 *  (scoped to that batch's own totals + a distinct seed key so the two never collide). */
function buildTransactionLedger(
  seedKey: string, idPrefix: string,
  startOnHand: number, startReserved: number, startOnTheWay: number, unit: string,
): ProductTransaction[] {
  if (startOnHand === 0 && startReserved === 0 && startOnTheWay === 0) return []
  const seed = seedFrom(seedKey)
  let onHand = startOnHand
  let reserved = startReserved
  let onTheWay = startOnTheWay
  const out: ProductTransaction[] = []
  const baseDay = 24

  MOVEMENT_TEMPLATES.forEach((tpl, i) => {
    const magnitude = ((seed >> (i * 3)) % 4) + 1
    const delta = tpl.sign * magnitude
    if (tpl.affects.includes('On hand')) onHand -= delta
    if (tpl.affects.includes('Reserved')) reserved -= delta
    if (tpl.affects.includes('In transit')) onTheWay -= delta
    const available = Math.max(0, onHand - reserved)
    const day = Math.max(1, baseDay - i * 3 - (seed % 3))
    const date = `2026-01-${String(day).padStart(2, '0')}`
    const number = `${tpl.type} #${10120 - i * 10 - (seed % 7)}`
    out.push({
      id: `${idPrefix}-tx-${i}`,
      date,
      number,
      delta,
      affects: tpl.affects,
      onHand: Math.max(0, onHand),
      reserved: Math.max(0, reserved),
      available,
      onTheWay: Math.max(0, onTheWay),
      unit,
      type: tpl.type,
    })
  })
  return out
}

/** A short, deterministic movement history ending near the product's current totals. */
export function getProductTransactions(sku: string): ProductTransaction[] {
  const row = productIndexRows().find((r) => r.sku === sku)
  if (!row) return []
  // No stock anywhere (e.g. a product just created, never bought/sold/adjusted) →
  // nothing has happened to it yet. Fabricating a movement history here would
  // contradict the 0/0/0 shown everywhere else on the page.
  return buildTransactionLedger(sku, sku, row.onHand, row.reserved, row.onTheWay, row.unit)
}

// ── Batches (Track stock by = "Batch") ────────────────────────────────────────────
/** A product's batch (lot), aggregated across every warehouse that carries it —
 *  the Product details page shows one row per batch, not per warehouse. Only
 *  meaningful for batch-tracked products (see `isProductBatchTracked`); every other
 *  product returns an empty list. */
export interface ProductBatchSummary {
  /** Stable id — survives a batch-number rename (see batchStore.ts). */
  id: string
  batchNo: string
  /** The expiry as an ISO DAY — a month-precision expiry resolves to its last day —
   *  used to flag near/expired stock (see StockTables.vue's isExpiryWarning). '' when
   *  the batch has no expiry. The stored value itself is `attributes.expiry_date`. */
  expiryDate: string
  description: string
  onHand: number
  reserved: number
  available: number
  unit: string
  archived: boolean
  /** Auto-generated the first time this batch is ever read (see getProductBatches) —
   *  always present, no manual "Generate" step. '' for the Unassigned batch, which
   *  isn't a physical lot and never gets a label. */
  barcode: string
  /** Attribute values by key (batchAttributes.ts). Can still hold a value for an
   *  attribute the product has since dropped — that's purged on the batch's next save
   *  (story 7) — so render against getBatchAttributeConfig, not the keys present here. */
  attributes: BatchAttributeValues
  /** The product's system batch for stock that has no batch (PM answer A5): always
   *  listed last, never carries attributes, can't be edited or renamed. */
  isUnassigned: boolean
}

export const UNASSIGNED_BATCH_NO = 'Unassigned'

/** Stand-in for the signed-in user until the prototype has a session. */
const CURRENT_USER = 'Rizal Candra'

const BATCH_DESCRIPTIONS = [
  'Stock untuk gudang utama', 'Stock untuk gudang BSD', 'Produksi batch reguler', 'Stock cadangan',
]

// ── Persisted batch-barcode overlay — a batch has no barcode until generated ──────
type BatchBarcodeOverlay = Record<string, string> // `${sku}::${batchNo}` → barcode
const BATCH_BARCODE_KEY = 'batch-barcode-overlay-v1'
const batchBarcodeOverlay = reactive<BatchBarcodeOverlay>(loadSnapshot<BatchBarcodeOverlay>(BATCH_BARCODE_KEY) ?? {})
function persistBatchBarcodeOverlay() { saveSnapshot(BATCH_BARCODE_KEY, batchBarcodeOverlay) }
function batchBarcodeKey(sku: string, batchNo: string): string { return `${sku}::${batchNo}` }

/** The barcode assigned to one batch, if any (undefined until generated). */
export function getBatchBarcode(sku: string, batchNo: string): string | undefined {
  return batchBarcodeOverlay[batchBarcodeKey(sku, batchNo)]
}

/** Assign + persist a barcode for one batch (call once, from the "Generate" action). */
export function setBatchBarcode(sku: string, batchNo: string, barcode: string): void {
  batchBarcodeOverlay[batchBarcodeKey(sku, batchNo)] = barcode
  persistBatchBarcodeOverlay()
}

/** The batch's barcode, auto-generating it the first time the batch is ever read —
 *  no manual "Generate" step; once assigned it's persisted like every other barcode. */
function ensureBatchBarcode(sku: string, batchNo: string): string {
  let barcode = getBatchBarcode(sku, batchNo)
  if (!barcode) {
    barcode = generateNextBarcode('batch')
    setBatchBarcode(sku, batchNo, barcode)
  }
  return barcode
}

/** After a rename, move the barcode to the new number so it stays with the batch. */
function moveBatchBarcode(sku: string, fromBatchNo: string, toBatchNo: string): void {
  const barcode = getBatchBarcode(sku, fromBatchNo)
  if (barcode === undefined) return
  delete batchBarcodeOverlay[batchBarcodeKey(sku, fromBatchNo)]
  batchBarcodeOverlay[batchBarcodeKey(sku, toBatchNo)] = barcode
  persistBatchBarcodeOverlay()
}

/** Split `total` into `count` near-equal whole-number parts that sum back to `total`. */
function splitEven(total: number, count: number): number[] {
  if (count <= 1) return [total]
  const base = Math.floor(total / count)
  const remainder = total - base * count
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0))
}

/** A batch before barcode/availability are filled in — what the seed derives, or what
 *  a created batch starts from, before batchStore.ts overrides are applied. */
interface BatchBase {
  id: string
  batchNo: string
  description: string
  attributes: BatchAttributeValues
  onHand: number
  reserved: number
  unit: string
  isUnassigned?: boolean
}

/** The 2–4 batches a stocked product's on-hand is split across. None without stock. */
function seedBatches(row: ProductIndexRow): BatchBase[] {
  if (row.onHand === 0 && row.reserved === 0) return []
  const seed = seedFrom(row.sku)
  const count = 2 + (seed % 3) // 2–4 batches
  const onHandParts = splitEven(row.onHand, count)
  const reservedParts = splitEven(row.reserved, count)
  const out: BatchBase[] = []
  for (let i = 0; i < count; i++) {
    const onHand = onHandParts[i]!
    // Deterministic spread from 20 days expired to ~200 days out, so at least one
    // batch is realistically near/past expiry (StockTables.vue's < 30-day warning).
    const offsetDays = ((seed >> (i * 4)) % 220) - 20
    const exp = new Date(TODAY.getTime())
    exp.setDate(exp.getDate() + offsetDays)
    out.push({
      id: `${row.sku}::seed-${i}`,
      batchNo: `Batch #${String(i + 1).padStart(3, '0')}`,
      description: BATCH_DESCRIPTIONS[(seed + i) % BATCH_DESCRIPTIONS.length]!,
      attributes: { expiry_date: exp.toISOString().slice(0, 10) },
      onHand,
      reserved: Math.min(onHand, reservedParts[i] ?? 0),
      unit: row.unit,
    })
  }
  return out
}

/** Layer a person's edits over the base: number, description, and per-key attribute
 *  values (a null/empty override clears the value, even one the seed derived). */
function applyBatchRecord(base: BatchBase, rec: BatchRecord | undefined): BatchBase {
  if (!rec) return base
  const attributes: BatchAttributeValues = { ...base.attributes }
  for (const [key, value] of Object.entries(rec.attributes ?? {})) {
    if (!isBatchAttributeKey(key)) continue
    if (value) attributes[key] = value
    else delete attributes[key]
  }
  return {
    ...base,
    batchNo: rec.batchNo ?? base.batchNo,
    description: rec.description ?? base.description,
    attributes,
  }
}

function toBatchSummary(sku: string, base: BatchBase, rec?: BatchRecord): ProductBatchSummary {
  const b = applyBatchRecord(base, rec)
  return {
    id: b.id,
    batchNo: b.batchNo,
    expiryDate: expiryEffectiveDate(b.attributes.expiry_date),
    description: b.description,
    onHand: b.onHand,
    reserved: b.reserved,
    available: Math.max(0, b.onHand - b.reserved),
    unit: b.unit,
    archived: false,
    barcode: b.isUnassigned ? '' : ensureBatchBarcode(sku, b.batchNo),
    attributes: b.attributes,
    isUnassigned: !!b.isUnassigned,
  }
}

/** Every batch of this SKU: the seed batches its stock is split across, then batches
 *  created in-app (qty 0 until stock is received into them), then the Unassigned
 *  batch. Edits from batchStore.ts are applied on top. Empty for a product that
 *  isn't tracked by batch. */
export function getProductBatches(sku: string): ProductBatchSummary[] {
  const row = productIndexRows().find((r) => r.sku === sku)
  if (!row || !isProductBatchTracked(sku)) return []
  const records = batchRecordsForSku(sku)
  const out = seedBatches(row).map((base) => toBatchSummary(sku, base, records.find((r) => r.id === base.id)))
  for (const rec of records) {
    if (!rec.created) continue
    out.push(toBatchSummary(sku, {
      id: rec.id, batchNo: '', description: '', attributes: {}, onHand: 0, reserved: 0, unit: row.unit,
    }, rec))
  }
  out.push(toBatchSummary(sku, {
    id: `${sku}::unassigned`, batchNo: UNASSIGNED_BATCH_NO, description: '', attributes: {},
    onHand: 0, reserved: 0, unit: row.unit, isUnassigned: true,
  }))
  return out
}

export function getProductBatchById(sku: string, id: string): ProductBatchSummary | undefined {
  return getProductBatches(sku).find((b) => b.id === id)
}

/** Whether stock has ever moved through this batch. Once it has, its number is locked
 *  (PM answer A9 — interim until the PM decides; the stable id already supports
 *  renaming, so lifting the lock is just this guard). */
export function batchHasMovements(sku: string, id: string): boolean {
  const batch = getProductBatchById(sku, id)
  if (!batch) return false
  return batch.onHand > 0 || batch.reserved > 0 || getBatchTransactions(sku, batch.batchNo).length > 0
}

// ── Batch create / update (PRD stories 7, 8) ─────────────────────────────────────────
export type BatchField = 'batchNo' | 'description' | BatchAttributeKey
export type BatchError = DataError<
  'product-not-found' | 'not-batch-tracked' | 'batch-not-found' | 'unassigned-locked'
  | 'required' | 'reserved' | 'taken' | 'locked-in-use'
  | 'not-selected' | 'invalid-date' | 'vendor-not-found' | 'grade-not-found' | 'grade-inactive',
  BatchField
>

/** Attribute values as a form or import sends them: a string sets the value, `null`
 *  or '' clears it, and a key that's left out stays as it is. */
export type BatchAttributeInput = Partial<Record<BatchAttributeKey, string | null>>

function validateBatchNo(sku: string, batchNo: string, selfId?: string): BatchError | null {
  const n = batchNo.trim().toLowerCase()
  if (!n) return { code: 'required', field: 'batchNo' }
  if (n === UNASSIGNED_BATCH_NO.toLowerCase()) return { code: 'reserved', field: 'batchNo' }
  const clash = getProductBatches(sku).some((b) => b.id !== selfId && b.batchNo.toLowerCase() === n)
  return clash ? { code: 'taken', field: 'batchNo' } : null
}

/** One value against its attribute's type. A value the batch already holds passes
 *  unchanged even if it's no longer pickable — e.g. a grade deactivated after it was
 *  stored — so an unrelated edit to that batch can still be saved. */
function validateAttributeValue(key: BatchAttributeKey, value: string, previous: string | undefined): BatchError | null {
  if (value === previous) return null
  switch (key) {
    case 'expiry_date':
    case 'manufacturing_date':
    case 'best_before_date':
      return isValidAttributeDate(key, value) ? null : { code: 'invalid-date', field: key }
    case 'supplier':
      return vendors.some((v) => v.id === value) ? null : { code: 'vendor-not-found', field: key }
    case 'grade': {
      const grade = gradeById(value)
      if (!grade || grade.deleted) return { code: 'grade-not-found', field: key }
      return grade.status === 'active' ? null : { code: 'grade-inactive', field: key }
    }
  }
}

/** Apply `input` to the batch's current values and check the result against the
 *  product's CURRENT attribute set (story 7): keys outside the set are rejected,
 *  values for attributes the set has dropped are left out (purged on save), and every
 *  required attribute must end up filled. */
function resolveBatchAttributes(
  sku: string,
  current: BatchAttributeValues,
  input: BatchAttributeInput,
): { values: BatchAttributeValues; errors: BatchError[] } {
  const config = getBatchAttributeConfig(sku)
  const selected = new Set(config.map((a) => a.key))
  const values: BatchAttributeValues = {}
  for (const key of selected) if (current[key]) values[key] = current[key]

  const errors: BatchError[] = []
  for (const [key, raw] of Object.entries(input)) {
    if (raw === undefined) continue
    if (!isBatchAttributeKey(key) || !selected.has(key)) {
      errors.push({ code: 'not-selected', field: key as BatchField })
      continue
    }
    const value = (raw ?? '').trim()
    if (!value) { delete values[key]; continue }
    const error = validateAttributeValue(key, value, current[key])
    if (error) errors.push(error)
    else values[key] = value
  }
  for (const a of config) {
    if (a.required && !values[a.key] && !errors.some((e) => e.field === a.key)) {
      errors.push({ code: 'required', field: a.key })
    }
  }
  return { values, errors }
}

/** Create a batch against a product — master data only: number, description and
 *  attribute values. It starts at qty 0; stock only enters through an inventory
 *  transaction. Batch number is unique per product, not across products. */
export function createBatch(
  sku: string,
  input: { batchNo: string; description?: string; attributes?: BatchAttributeInput },
  by = CURRENT_USER,
): DataResult<ProductBatchSummary, BatchError> {
  if (!productIndexRows().some((r) => r.sku === sku)) return { ok: false, errors: [{ code: 'product-not-found' }] }
  if (!isProductBatchTracked(sku)) return { ok: false, errors: [{ code: 'not-batch-tracked' }] }

  const errors: BatchError[] = []
  const batchNoError = validateBatchNo(sku, input.batchNo)
  if (batchNoError) errors.push(batchNoError)
  const { values, errors: attributeErrors } = resolveBatchAttributes(sku, {}, input.attributes ?? {})
  errors.push(...attributeErrors)
  if (errors.length) return { ok: false, errors }

  const at = new Date().toISOString()
  const id = newBatchId(sku)
  saveBatchRecord({
    id, sku, created: true,
    batchNo: input.batchNo.trim(),
    description: (input.description ?? '').trim(),
    attributes: { ...values },
    createdAt: at, updatedAt: at, updatedBy: by,
  })
  return { ok: true, value: getProductBatchById(sku, id)! }
}

/** Edit a batch. `batchNo` may change while the batch has no movements (A4 + A9);
 *  attributes follow `BatchAttributeInput` semantics and are reconciled with the
 *  product's current set. The Unassigned batch can't be edited (A5). */
export function updateBatch(
  sku: string,
  id: string,
  patch: { batchNo?: string; description?: string; attributes?: BatchAttributeInput },
  by = CURRENT_USER,
): DataResult<ProductBatchSummary, BatchError> {
  const batch = getProductBatchById(sku, id)
  if (!batch) return { ok: false, errors: [{ code: 'batch-not-found' }] }
  if (batch.isUnassigned) return { ok: false, errors: [{ code: 'unassigned-locked' }] }

  const errors: BatchError[] = []
  const nextBatchNo = patch.batchNo === undefined ? batch.batchNo : patch.batchNo.trim()
  const renamed = nextBatchNo !== batch.batchNo
  if (renamed) {
    const batchNoError = validateBatchNo(sku, nextBatchNo, id)
    if (batchNoError) errors.push(batchNoError)
    else if (batchHasMovements(sku, id)) errors.push({ code: 'locked-in-use', field: 'batchNo' })
  }
  const { values, errors: attributeErrors } = resolveBatchAttributes(sku, batch.attributes, patch.attributes ?? {})
  errors.push(...attributeErrors)
  if (errors.length) return { ok: false, errors }

  // Store every key explicitly (null = no value) so the result no longer depends on
  // what the seed derives — a purged seeded expiry stays gone.
  const attributes: BatchAttributeInput = {}
  for (const key of BATCH_ATTRIBUTE_KEYS) attributes[key] = values[key] ?? null
  saveBatchRecord({
    ...(findBatchRecord(id) ?? { id, sku, created: false }),
    ...(renamed ? { batchNo: nextBatchNo } : {}),
    ...(patch.description !== undefined ? { description: patch.description.trim() } : {}),
    attributes,
    updatedAt: new Date().toISOString(),
    updatedBy: by,
  })
  if (renamed) moveBatchBarcode(sku, batch.batchNo, nextBatchNo)
  return { ok: true, value: getProductBatchById(sku, id)! }
}

export interface BatchDetail {
  /** Stable batch id (see ProductBatchSummary.id). */
  id: string
  sku: string
  productName: string
  batchNo: string
  expiryDate: string
  description: string
  onHand: number
  reserved: number
  available: number
  minStock: number
  unit: string
  updatedBy: string
  updatedAt: string
  barcode: string
  attributes: BatchAttributeValues
  isUnassigned: boolean
}

export function getBatchDetail(sku: string, batchNo: string): BatchDetail | undefined {
  const row = productIndexRows().find((r) => r.sku === sku)
  if (!row) return undefined
  const { at, by } = lastUpdatedFor(`batch-${sku}-${batchNo}`)
  const batch = getProductBatches(sku).find((b) => b.batchNo === batchNo)
  if (batch) {
    return {
      id: batch.id,
      sku,
      productName: row.name,
      batchNo: batch.batchNo,
      expiryDate: batch.expiryDate,
      description: batch.description,
      onHand: batch.onHand,
      reserved: batch.reserved,
      available: batch.available,
      minStock: row.minStock,
      unit: batch.unit,
      updatedBy: by,
      updatedAt: at,
      barcode: batch.barcode,
      attributes: batch.attributes,
      isUnassigned: batch.isUnassigned,
    }
  }
  // Fallback for a WAREHOUSE-LOT batch: Warehouse Details lists per-warehouse lots
  // whose batchNos differ from the product-level summary batches above. Aggregate the
  // lot's stock across every warehouse holding it so the same page/format renders
  // (instead of "batch not found") when the batch is opened from Warehouse Details.
  let onHand = 0, reserved = 0, available = 0, expiryDate = ''
  let found = false
  for (const w of warehouses) {
    const lot = getWarehouseDetail(w.id)?.stock.find((s) => s.sku === sku)?.batches?.find((b) => b.batchNo === batchNo)
    if (!lot) continue
    found = true
    onHand += lot.onHand; reserved += lot.reserved; available += lot.available
    if (!expiryDate) expiryDate = lot.expiryDate
  }
  if (!found) return undefined
  return {
    id: warehouseLotBatchId(sku, batchNo),
    sku,
    productName: row.name,
    batchNo,
    expiryDate,
    description: '',
    onHand,
    reserved,
    available,
    minStock: row.minStock,
    unit: row.unit,
    updatedBy: by,
    updatedAt: at,
    barcode: ensureBatchBarcode(sku, batchNo),
    attributes: expiryDate ? { expiry_date: expiryDate } : {},
    isUnassigned: false,
  }
}

/** Warehouse-lot batches (warehouseDetails.ts) are seed data outside the product's own
 *  batch list, so they get a read-only id of their own and are never edited. */
function warehouseLotBatchId(sku: string, batchNo: string): string {
  return `${sku}::lot::${batchNo}`
}

/** A batch's own movement history — scoped to its own (smaller) totals, not the
 *  whole product's. Batches don't carry an "in transit" figure of their own (a
 *  batch only exists once it's actually received), so that stays at 0 throughout. */
export function getBatchTransactions(sku: string, batchNo: string): ProductTransaction[] {
  const batch = getProductBatches(sku).find((b) => b.batchNo === batchNo)
  if (!batch) return []
  const seedKey = `${sku}-${batchNo}`
  return buildTransactionLedger(seedKey, seedKey, batch.onHand, batch.reserved, 0, batch.unit)
}

/** A batch's stock split across the same warehouses the product itself stocks in,
 *  proportional to each warehouse's existing share of the product's on-hand total —
 *  so a batch's numbers always sum back to its own totals above. */
/**
 * Batch details for ONE warehouse's lot — same BatchDetail shape as getBatchDetail,
 * but the qty fields are that warehouse's lot (not the product-wide total). Backs the
 * warehouse-scoped batch-details page reached from Warehouse Details (stays under the
 * /warehouses path, same page format).
 */
export function getWarehouseBatchDetail(warehouseId: string, sku: string, batchNo: string): BatchDetail | undefined {
  const row = productIndexRows().find((r) => r.sku === sku)
  const item = getWarehouseDetail(warehouseId)?.stock.find((s) => s.sku === sku)
  const lot = item?.batches?.find((b) => b.batchNo === batchNo)
  if (!row || !item || !lot) return undefined
  const { at, by } = lastUpdatedFor(`batch-${sku}-${batchNo}`)
  return {
    id: warehouseLotBatchId(sku, batchNo),
    sku,
    productName: row.name,
    batchNo,
    expiryDate: lot.expiryDate,
    description: '',
    onHand: lot.onHand,
    reserved: lot.reserved,
    available: lot.available,
    minStock: item.minStock,
    unit: item.unit,
    updatedBy: by,
    updatedAt: at,
    barcode: ensureBatchBarcode(sku, batchNo),
    attributes: lot.expiryDate ? { expiry_date: lot.expiryDate } : {},
    isUnassigned: false,
  }
}

export function getBatchWarehouseStock(sku: string, batchNo: string): ProductWarehouseStock[] {
  const batch = getProductBatches(sku).find((b) => b.batchNo === batchNo)
  if (!batch) {
    // Warehouse-lot batch (see getBatchDetail fallback) — list each warehouse that
    // actually holds this exact lot, from real warehouse stock.
    const out: ProductWarehouseStock[] = []
    for (const wh of warehouses) {
      if (wh.isDefault || wh.status === 'archived') continue
      const item = getWarehouseDetail(wh.id)?.stock.find((s) => s.sku === sku)
      const lot = item?.batches?.find((b) => b.batchNo === batchNo)
      if (!item || !lot || lot.onHand <= 0) continue
      out.push({
        warehouseId: wh.id, warehouseName: wh.name,
        onHand: lot.onHand, reserved: lot.reserved, available: lot.available,
        onTheWay: 0, minStock: item.minStock, unit: item.unit,
      })
    }
    return out
  }
  const productStock = getProductWarehouseStock(sku)
  const totalOnHand = productStock.reduce((sum, w) => sum + w.onHand, 0)
  if (totalOnHand === 0) return []
  return productStock
    .map((w) => {
      const ratio = w.onHand / totalOnHand
      const onHand = Math.round(batch.onHand * ratio)
      const reserved = Math.min(onHand, Math.round(batch.reserved * ratio))
      return {
        ...w,
        onHand,
        reserved,
        available: Math.max(0, onHand - reserved),
        onTheWay: 0,
      }
    })
    .filter((w) => w.onHand > 0)
}
