/**
 * Inventory valuation report — Reports › Inventory › Inventory valuation.
 * prod-parity: jurnal-frontend-app/src/pages/reports/inventory/valuation/
 *
 * One collapsible group per tracked product: a beginning-balance row, then every
 * stock movement in the period (sales invoices out, purchase invoices in) with
 * the running stock on hand and its value at average cost, closed by the
 * product's "Total stock on hand" / "Subtotal value" line.
 *
 * Numbers are never invented here:
 *   • Ending stock on hand (as of the data anchor) = the company-wide on-hand the
 *     Products index shows (productIndexRows → per-warehouse stock).
 *   • Movements = the seeded sales invoice lines (salesInvoiceLineItems) and the
 *     purchase invoice lines (purchaseInvoiceDetails), so every row links back to
 *     a document the user can open.
 *   • Average cost = the product master's moving-average cost (inventory.ts).
 * Stock at any earlier date is walked back from the anchor, so the report always
 * ends on the same quantity the Products index shows.
 */
import { CATALOG } from './catalog'
import { productIndexRows } from './productsIndex'
import { salesInvoices } from './salesInvoices'
import { salesInvoiceLineItems } from './salesInvoiceLineItems'
import { purchaseInvoices } from './purchaseInvoices'
import { getPurchaseInvoiceDetail } from './purchaseInvoiceDetails'
import { SIM_TODAY_ISO } from './simClock'

/** Data anchor — the on-hand quantities in productIndexRows are "as of" this day. */
export const INV_VALUATION_TODAY_ISO = SIM_TODAY_ISO

// ── Report period presets (prod: pages/reports/serial-number/constants/periods.ts) ──
// Shared by the three wave-3 report pages (inventory valuation, fixed asset
// summary, cash & bank) so their Period dropdowns resolve dates the same way.

export type RptPeriodPreset =
  | 'today' | 'this_week' | 'this_month' | 'this_quarter' | 'this_year'
  | 'yesterday' | 'last_week' | 'last_month' | 'last_quarter' | 'last_year' | 'custom'

export const RPT_PERIOD_PRESETS: { value: RptPeriodPreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This week' },
  { value: 'this_month', label: 'This month' },
  { value: 'this_quarter', label: 'This quarter' },
  { value: 'this_year', label: 'This year' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_week', label: 'Last week' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_quarter', label: 'Last quarter' },
  { value: 'last_year', label: 'Last year' },
  { value: 'custom', label: 'Custom' },
]

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d)
}

/** Inclusive [start, end] ISO range for a period preset, relative to `todayIso`. */
export function rptPresetRange(p: RptPeriodPreset, todayIso: string): [string, string] | null {
  const t = parseIso(todayIso)
  const y = t.getFullYear(); const m = t.getMonth(); const q = Math.floor(m / 3)
  const weekStart = (d: Date) => { const r = new Date(d); r.setDate(r.getDate() - ((r.getDay() + 6) % 7)); return r }
  const plus = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r }
  switch (p) {
    case 'today': return [todayIso, todayIso]
    case 'yesterday': { const d = isoOf(plus(t, -1)); return [d, d] }
    case 'this_week': { const s = weekStart(t); return [isoOf(s), isoOf(plus(s, 6))] }
    case 'last_week': { const s = plus(weekStart(t), -7); return [isoOf(s), isoOf(plus(s, 6))] }
    case 'this_month': return [isoOf(new Date(y, m, 1)), isoOf(new Date(y, m + 1, 0))]
    case 'last_month': return [isoOf(new Date(y, m - 1, 1)), isoOf(new Date(y, m, 0))]
    case 'this_quarter': return [isoOf(new Date(y, q * 3, 1)), isoOf(new Date(y, q * 3 + 3, 0))]
    case 'last_quarter': return [isoOf(new Date(y, q * 3 - 3, 1)), isoOf(new Date(y, q * 3, 0))]
    case 'this_year': return [`${y}-01-01`, `${y}-12-31`]
    case 'last_year': return [`${y - 1}-01-01`, `${y - 1}-12-31`]
    default: return null
  }
}

/** The preset whose range is exactly [start, end], else 'custom' (prod's setPeriod). */
export function rptPresetFor(startIso: string, endIso: string, todayIso: string): RptPeriodPreset {
  for (const o of RPT_PERIOD_PRESETS) {
    const r = rptPresetRange(o.value, todayIso)
    if (r && r[0] === startIso && r[1] === endIso) return o.value
  }
  return 'custom'
}

/** 'DD/MM/YYYY' ↔ ISO — MpDatePicker uses the display format as its value. */
export function rptIsoToDmy(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
export function rptDmyToIso(dmy: string): string {
  const [d, m, y] = dmy.split('/')
  return d && m && y ? `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` : ''
}

export type InvValuationTxType = 'Sales invoice' | 'Purchase invoice'

export interface InvValuationMovement {
  id: string
  date: string            // ISO
  type: InvValuationTxType
  /** Document id → detail route */
  docId: string
  number: string
  description: string
  /** signed: + in, − out */
  mutation: number
  /** buy/sell price per unit */
  price: number
}

export interface InvValuationRow extends InvValuationMovement {
  isBeginning: boolean
  stockOnHand: number
  averageCost: number
  value: number
}

export interface InvValuationGroup {
  productId: string
  sku: string
  name: string
  category: string
  unit: string
  averageCost: number
  beginningQty: number
  endingQty: number
  rows: InvValuationRow[]
  subtotalValue: number
}

export interface InvValuationFilter {
  startIso: string
  endIso: string
  categories: string[]
  /** 'all' = product must be in every chosen category (one category per product, so
   *  only meaningful for one pick); 'either' = any of them. Mirrors prod's radio. */
  categoryLogic: 'all' | 'either'
  /** product display labels ("1001 | Name") */
  products: string[]
}

export function invValuationProductLabel(p: { sku: string; name: string }): string {
  return p.sku ? `${p.sku} | ${p.name}` : p.name
}

const SKU_BY_ID = new Map(CATALOG.map((c) => [c.id, c.sku]))
const PRICE_BY_ID = new Map(CATALOG.map((c) => [c.id, c.price]))

/** Every stock movement up to the anchor, keyed by SKU, oldest first. */
function movementsBySku(): Map<string, InvValuationMovement[]> {
  const map = new Map<string, InvValuationMovement[]>()
  const push = (sku: string, m: InvValuationMovement) => {
    const arr = map.get(sku) ?? []
    arr.push(m)
    map.set(sku, arr)
  }
  const invById = new Map(salesInvoices.map((s) => [s.id, s]))
  salesInvoiceLineItems.forEach((li, i) => {
    const inv = invById.get(li.invoiceId)
    const sku = SKU_BY_ID.get(li.productId)
    if (!inv || !sku || inv.date > INV_VALUATION_TODAY_ISO) return
    const price = Math.round((PRICE_BY_ID.get(li.productId) ?? 0) * (1 - li.discountPct / 100))
    push(sku, {
      id: `si-${inv.id}-${i}`, date: inv.date, type: 'Sales invoice', docId: inv.id,
      number: String(inv.number), description: inv.customer.name, mutation: -li.qty, price,
    })
  })
  for (const pi of purchaseInvoices) {
    if (pi.date > INV_VALUATION_TODAY_ISO) continue
    getPurchaseInvoiceDetail(pi.id).lineItems.forEach((li, i) => {
      push(li.sku, {
        id: `pi-${pi.id}-${i}`, date: pi.date, type: 'Purchase invoice', docId: pi.id,
        number: pi.number, description: pi.vendor.name, mutation: li.qty, price: li.unitPrice,
      })
    })
  }
  for (const arr of map.values()) arr.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1))
  return map
}

/**
 * The seeded purchase invoices were generated independently of the warehouse
 * stock, so for a few slow-moving machines the invoiced quantity exceeds what
 * the warehouses hold plus what was sold — walking back would give a negative
 * opening stock. Those newest purchase lines are treated as goods not yet
 * received (still in transit) and left out of the stock movement, newest first,
 * until the opening stock is ≥ 0. Every other line is reported as-is.
 */
function receivedMovements(onHand: number, all: InvValuationMovement[]): InvValuationMovement[] {
  let opening = onHand - all.reduce((s, m) => s + m.mutation, 0)
  if (opening >= 0) return all
  const drop = new Set<string>()
  for (let i = all.length - 1; i >= 0 && opening < 0; i--) {
    const m = all[i]!
    if (m.mutation <= 0) continue
    drop.add(m.id)
    opening += m.mutation
  }
  return all.filter((m) => !drop.has(m.id))
}

/** All tracked products (filter options). */
export function invValuationProducts() {
  return productIndexRows().filter((p) => p.productType === 'single-tracked')
}

/** Build the report groups for a period. Throws in dev if the arithmetic drifts. */
export function inventoryValuationReport(f: InvValuationFilter): InvValuationGroup[] {
  const moves = movementsBySku()
  const catSet = new Set(f.categories)
  const prodSet = new Set(f.products)
  const groups: InvValuationGroup[] = []
  for (const p of invValuationProducts()) {
    if (catSet.size && !catSet.has(p.category)) continue
    if (f.categoryLogic === 'all' && catSet.size > 1) continue
    if (prodSet.size && !prodSet.has(invValuationProductLabel(p))) continue
    const all = receivedMovements(p.onHand, moves.get(p.sku) ?? [])
    // Walk back from the anchor's on-hand to the stock before the period starts.
    const afterStart = all.filter((m) => m.date >= f.startIso).reduce((s, m) => s + m.mutation, 0)
    const beginningQty = p.onHand - afterStart
    const inPeriod = all.filter((m) => m.date >= f.startIso && m.date <= f.endIso)
    const avg = p.averageCost
    const rows: InvValuationRow[] = [{
      id: `${p.sku}-begin`, date: f.startIso, type: 'Purchase invoice', docId: '', number: '-', description: '',
      mutation: 0, price: 0, isBeginning: true, stockOnHand: beginningQty, averageCost: avg, value: beginningQty * avg,
    }]
    let qty = beginningQty
    for (const m of inPeriod) {
      qty += m.mutation
      rows.push({ ...m, isBeginning: false, stockOnHand: qty, averageCost: avg, value: qty * avg })
    }
    groups.push({
      productId: p.id, sku: p.sku, name: p.name, category: p.category, unit: p.unit, averageCost: avg,
      beginningQty, endingQty: qty, rows, subtotalValue: qty * avg,
    })
  }
  if (import.meta.dev) assertInventoryValuation(groups)
  return groups
}

export function invValuationTotal(groups: InvValuationGroup[]): number {
  return groups.reduce((s, g) => s + g.subtotalValue, 0)
}

/** Dev-time arithmetic check: beginning + Σ mutations = ending; subtotal = ending × average cost;
 *  the last row's value = the subtotal; total value = Σ subtotals = Σ (last row value). */
export function assertInventoryValuation(groups: InvValuationGroup[]): void {
  const fail = (m: string) => { throw new Error(`[inventoryValuationReport] ${m}`) }
  let sumLast = 0
  for (const g of groups) {
    const net = g.rows.reduce((s, r) => s + (r.isBeginning ? 0 : r.mutation), 0)
    if (g.beginningQty + net !== g.endingQty) fail(`${g.sku}: beginning ${g.beginningQty} + ${net} ≠ ending ${g.endingQty}`)
    if (g.subtotalValue !== g.endingQty * g.averageCost) fail(`${g.sku}: subtotal ≠ ending × average cost`)
    const last = g.rows[g.rows.length - 1]!
    if (last.value !== g.subtotalValue) fail(`${g.sku}: last row value ${last.value} ≠ subtotal ${g.subtotalValue}`)
    sumLast += last.value
  }
  if (sumLast !== invValuationTotal(groups)) fail('total value ≠ Σ product subtotals')
}

/** End-of-period stock must match the Products index on-hand when the period reaches the anchor. */
if (import.meta.dev) {
  const g = inventoryValuationReport({ startIso: '2026-01-01', endIso: INV_VALUATION_TODAY_ISO, categories: [], categoryLogic: 'either', products: [] })
  const onHand = new Map(invValuationProducts().map((p) => [p.sku, p.onHand]))
  for (const x of g) if (x.endingQty !== onHand.get(x.sku)) throw new Error(`[inventoryValuationReport] ${x.sku} ending ≠ Products index on-hand`)
}
