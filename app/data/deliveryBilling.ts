import { reactive } from 'vue'
import type { SalesDelivery, SalesOrder } from './types'
import { salesOrders } from './salesOrders'
import { salesDeliveries, persistDeliveryBillingStatus, clearDeliveryBillingStatuses } from './salesDeliveries'
import { salesInvoices } from './salesInvoices'
import { loadCreated, saveCreated } from './persist'

/**
 * Partial & progress invoicing of deliveries — the billing engine behind
 * "New sales invoice" when it bills one or more sales deliveries.
 *
 * Source: [PRD] Partial & Progress Invoicing of Deliveries (PD 51301744716,
 * v1.3/v1.4 rules) and the calculation workbook partial-invoicing-simulation-v2
 * (case C5 is the seed below). Pure functions over the mock stores — no UI.
 *
 *  - Rule 3 / Rule 4: the cap is per DELIVERY LINE — billed ≤ delivered − already
 *    billed — summed over every invoice that touched it. Never an order-level cap.
 *  - Rule 12: a percentage is per ORDER LINE and resolves to a quantity:
 *    qty = order line qty × % (six decimals, truncated). Goods = qty × net price,
 *    i.e. % × the line's Amount column (after line discount, before the
 *    transaction discount). One % typed above the table fills every line.
 *  - Rule 5: the split across deliveries defaults to oldest-first by CREATION
 *    time (never transaction date) for qty and % alike; the user may set it per
 *    delivery instead (F-07).
 *  - Rule 10 / 11 / 13: each delivery owns a share of the order's transaction
 *    discount (D_k) and its own shipping (S_k). An invoice carries D_k in
 *    proportion to the goods it bills from that delivery LINE; the invoice that
 *    clears a delivery line takes that line's remaining discount. A delivery's
 *    shipping is billed in full on the first invoice that draws from it.
 *  - Rule 9: amounts keep full precision; rupiah rounding is cumulative per
 *    order so the last invoice absorbs the residue.
 *  - Rule 14: shipping reconciles to the deliveries, everything else to the order.
 */

export type BillingBasis = 'qty' | 'percent'
export type SplitMode = 'auto' | 'manual'

/** Tolerance for six-decimal quantity arithmetic. */
export const QTY_EPS = 1e-6
const PPN_RATE = 0.11

/** One delivery line's share of one invoice. Full precision, never rounded. */
export interface DeliveryBillingLine {
  orderLineIndex: number
  qty: number
  goods: number      // qty × net price
  discount: number   // share of the delivery's transaction discount
}

/**
 * What one invoice billed from one delivery (F-07 billing record). Written when
 * the invoice is saved and never recalculated afterwards (Rule 5).
 */
export interface DeliveryBillingRecord {
  invoiceId: string
  invoiceNumber: number
  orderId: string
  deliveryId: string
  lines: DeliveryBillingLine[]
  shipping: number
  createdAt: string  // ISO datetime
}

// ── Small helpers ────────────────────────────────────────────────────────────

/** Truncate to six decimals — the quantity precision (PRD % SD R-03, E-04). */
export function trunc6(n: number): number {
  return Math.trunc(n * 1e6 + (n >= 0 ? 1e-7 : -1e-7)) / 1e6
}
function clamp0(n: number): number { return Math.abs(n) < QTY_EPS ? 0 : n }

export function netPrice(order: SalesOrder, i: number): number {
  const it = order.items[i]!
  return it.unitPrice * (1 - it.discountPct / 100)
}

/** G — order goods after line discounts, before the transaction discount. */
export function orderGoods(order: SalesOrder): number {
  return order.items.reduce((s, _it, i) => s + order.items[i]!.qty * netPrice(order, i), 0)
}

/** Deliveries of an order, oldest CREATED first (Rule 5 — not by transaction date). */
export function orderDeliveries(orderId: string): SalesDelivery[] {
  return salesDeliveries
    .filter(d => d.orderId === orderId && d.items?.length)
    .sort((a, b) => creationKey(a).localeCompare(creationKey(b)))
}
export function creationKey(d: SalesDelivery): string {
  return `${d.createdAt ?? `${d.date}T00:00:00`}|${d.id}`
}

/** Delivered qty per order line on ONE delivery. */
function deliveredOn(d: SalesDelivery): Record<number, number> {
  const out: Record<number, number> = {}
  for (const l of d.items ?? []) out[l.orderLineIndex] = (out[l.orderLineIndex] ?? 0) + l.qty
  return out
}

export function deliveryGoods(d: SalesDelivery, order: SalesOrder): number {
  const q = deliveredOn(d)
  return Object.entries(q).reduce((s, [i, qty]) => s + qty * netPrice(order, Number(i)), 0)
}

/**
 * D_k for every delivery of an order (Rule 10). An explicit `discount` on the
 * delivery wins; otherwise TD × G_k ÷ G, and the delivery that completes the
 * order takes TD − Σ earlier so the deliveries add up to TD exactly.
 */
export function deliveryDiscounts(orderId: string): Record<string, number> {
  const order = salesOrders.find(o => o.id === orderId)
  const out: Record<string, number> = {}
  if (!order) return out
  const td = order.globalDiscount ?? 0
  const G = orderGoods(order)
  const cum: Record<number, number> = {}
  let used = 0
  for (const d of orderDeliveries(orderId)) {
    for (const [i, q] of Object.entries(deliveredOn(d))) cum[Number(i)] = (cum[Number(i)] ?? 0) + q
    const completes = order.items.every((it, i) => (cum[i] ?? 0) >= it.qty - QTY_EPS)
    const share = d.discount ?? (completes ? td - used : (G > 0 ? td * deliveryGoods(d, order) / G : 0))
    out[d.id] = share
    used += share
  }
  return out
}

/** S_k for every delivery (Rule 10 default: order shipping not yet used, never < 0). */
export function deliveryShipping(orderId: string): Record<string, number> {
  const order = salesOrders.find(o => o.id === orderId)
  const out: Record<string, number> = {}
  if (!order) return out
  let used = 0
  for (const d of orderDeliveries(orderId)) {
    const s = d.shippingFee ?? Math.max(0, (order.shippingFee ?? 0) - used)
    out[d.id] = s
    used += s
  }
  return out
}

// ── Billing records ──────────────────────────────────────────────────────────

/**
 * Seed: Sales Invoice #40202 billed 30% of every line of SO104, all of it from
 * Sales Delivery #20105 (workbook C5, INV1). Figures are produced by
 * `planBilling` — tests/delivery-billing.spec.ts asserts the seed invoice in
 * salesInvoices.ts matches them.
 */
function seedRecords(): DeliveryBillingRecord[] {
  const order = salesOrders.find(o => o.id === 'SO104')
  const sd = salesDeliveries.find(d => d.id === 'SD105')
  if (!order || !sd) return []
  const D = deliveryDiscounts('SO104')['SD105'] ?? 0
  const G1 = deliveryGoods(sd, order)
  const lines = order.items.map((it, i) => {
    const qty = trunc6(it.qty * 0.3)
    const goods = qty * netPrice(order, i)
    return { orderLineIndex: i, qty, goods, discount: G1 > 0 ? D * goods / G1 : 0 }
  })
  return [{
    invoiceId: 'SI201', invoiceNumber: 40202, orderId: 'SO104', deliveryId: 'SD105',
    lines, shipping: deliveryShipping('SO104')['SD105'] ?? 0, createdAt: '2026-07-06T10:00:00',
  }]
}

const RECORDS_KEY = 'sales-delivery-billing-records'
export const deliveryBillingRecords = reactive<DeliveryBillingRecord[]>([
  ...seedRecords(),
  ...loadCreated<DeliveryBillingRecord>(RECORDS_KEY),
])

function recordsFor(deliveryId: string, excludeInvoiceId?: string): DeliveryBillingRecord[] {
  return deliveryBillingRecords.filter(r => r.deliveryId === deliveryId && r.invoiceId !== excludeInvoiceId)
}

/**
 * A delivery marked `invoiced` by the old one-shot flow carries no records —
 * it was billed in full. Read it that way so it is never billed twice.
 */
function legacyFullyBilled(d: SalesDelivery): boolean {
  return d.billingStatus === 'invoiced' && !deliveryBillingRecords.some(r => r.deliveryId === d.id)
}

export interface DeliveryLineBalance {
  delivered: number
  billed: number
  available: number     // delivered − billed (the Rule 3 cap)
  discount: number      // D_k,i — this line's share of the delivery discount
  discountBilled: number
}

/** Rule 3 — per delivery line: delivered, billed so far and what is left. */
export function deliveryLineBalances(deliveryId: string, excludeInvoiceId?: string): Record<number, DeliveryLineBalance> {
  const d = salesDeliveries.find(x => x.id === deliveryId)
  const order = d?.orderId ? salesOrders.find(o => o.id === d.orderId) : undefined
  const out: Record<number, DeliveryLineBalance> = {}
  if (!d || !order) return out
  const Dk = deliveryDiscounts(order.id)[d.id] ?? 0
  const Gk = deliveryGoods(d, order)
  const legacy = legacyFullyBilled(d)
  for (const [k, q] of Object.entries(deliveredOn(d))) {
    const i = Number(k)
    const share = Gk > 0 ? Dk * q * netPrice(order, i) / Gk : 0
    let billed = 0
    let discountBilled = 0
    if (legacy) { billed = q; discountBilled = share } else {
      for (const r of recordsFor(d.id, excludeInvoiceId)) {
        for (const l of r.lines) if (l.orderLineIndex === i) { billed += l.qty; discountBilled += l.discount }
      }
    }
    out[i] = { delivered: q, billed, available: clamp0(q - billed), discount: share, discountBilled }
  }
  return out
}

export function shippingBilledOn(deliveryId: string, excludeInvoiceId?: string): number {
  const d = salesDeliveries.find(x => x.id === deliveryId)
  if (d && legacyFullyBilled(d)) return deliveryShipping(d.orderId ?? '')[d.id] ?? 0
  return recordsFor(deliveryId, excludeInvoiceId).reduce((s, r) => s + r.shipping, 0)
}

/** Billing status a delivery should show, derived from its records (F-07). */
export function deliveryBillingStatus(deliveryId: string): 'unbilled' | 'partially invoiced' | 'invoiced' {
  const d = salesDeliveries.find(x => x.id === deliveryId)
  if (!d) return 'unbilled'
  if (!d.orderId || !d.items?.length) return d.billingStatus === 'invoiced' ? 'invoiced' : 'unbilled'
  if (legacyFullyBilled(d)) return 'invoiced'
  const bal = Object.values(deliveryLineBalances(deliveryId))
  const billed = bal.some(b => b.billed > QTY_EPS)
  if (!billed) return 'unbilled'
  return bal.every(b => b.available <= QTY_EPS) ? 'invoiced' : 'partially invoiced'
}

/** Whether anything is left to bill on a delivery — fully billed ones are not offered. */
export function isBillable(deliveryId: string): boolean {
  return Object.values(deliveryLineBalances(deliveryId)).some(b => b.available > QTY_EPS)
}

/** Invoices that billed a delivery, oldest first — for "fully billed by …" captions. */
export function invoicesForDelivery(deliveryId: string): { id: string; number: number }[] {
  const seen = new Map<string, number>()
  for (const r of deliveryBillingRecords) if (r.deliveryId === deliveryId) seen.set(r.invoiceId, r.invoiceNumber)
  return [...seen].map(([id, number]) => ({ id, number }))
}

/** Billed to date per order line, across every invoice and delivery of the order. */
export function billedByLine(orderId: string, excludeInvoiceId?: string): Record<number, number> {
  const out: Record<number, number> = {}
  for (const d of orderDeliveries(orderId)) {
    for (const [i, b] of Object.entries(deliveryLineBalances(d.id, excludeInvoiceId))) out[Number(i)] = (out[Number(i)] ?? 0) + b.billed
  }
  return out
}
export function deliveredByOrderLine(orderId: string): Record<number, number> {
  const out: Record<number, number> = {}
  for (const d of orderDeliveries(orderId)) for (const [i, q] of Object.entries(deliveredOn(d))) out[Number(i)] = (out[Number(i)] ?? 0) + q
  return out
}

// ── The plan ─────────────────────────────────────────────────────────────────

export interface BillingInput {
  orderId: string
  /** Selected deliveries (the "Sales deliveries" field). Order is irrelevant — the
   *  engine sorts by creation time. */
  deliveryIds: string[]
  basis: BillingBasis
  /** Auto split: what the user typed per order line — qty, or % of the ordered qty. */
  lineInputs: Record<number, number>
  split: SplitMode
  /** Manual split: qty per delivery per order line. Cells not given start from the
   *  oldest-first default, so switching to manual never blanks the table. */
  manual?: Record<string, Record<number, number>>
  /** When editing an invoice, its own records are left out of "billed before". */
  excludeInvoiceId?: string
}

export interface PlanCell {
  deliveryId: string
  orderLineIndex: number
  delivered: number
  billedBefore: number
  available: number
  billNow: number
  leftAfter: number
  goodsNow: number
  discountNow: number
  /** Manual split only: billNow above this cell's available. */
  overCap: boolean
}

export interface PlanLine {
  orderLineIndex: number
  product: string
  sku: string
  description: string
  unit: string
  unitPrice: number
  discountPct: number
  netPrice: number
  orderedQty: number
  /** Order-wide progress (every delivery / every invoice of the order). */
  deliveredQty: number
  billedQty: number
  /** On the SELECTED deliveries: delivered − billed. The Rule 3 cap for this line. */
  availableQty: number
  /** What the user typed (qty or %). In manual split this is derived from the cells. */
  input: number
  /** Billed now, six decimals — the posting quantity. */
  qty: number
  /** qty as a share of the ordered qty (for display; may be fractional). */
  percent: number
  /** qty × unit price × (1 − line discount), rounded to the rupiah. */
  amount: number
  maxQty: number
  maxPercent: number
  /** Auto split: qty above the line's cap (Rule 4 rejection). */
  overCap: boolean
}

export interface PlanDelivery {
  deliveryId: string
  number: number
  date: string
  createdAt: string
  goodsDelivered: number
  discount: number           // D_k
  shipping: number           // S_k
  goodsBilledBefore: number
  discountBilledBefore: number
  shippingBilledBefore: number
  goodsNow: number
  discountNow: number
  shippingNow: number
  /** What stays unbilled on this delivery after this invoice — goods − discount + shipping. */
  leftAfter: number
  /** True when this invoice bills everything left on the delivery. */
  clears: boolean
  cells: PlanCell[]
}

export interface BillingPlan {
  orderId: string
  basis: BillingBasis
  split: SplitMode
  lines: PlanLine[]
  deliveries: PlanDelivery[]
  /** Totals, rupiah. subtotal = Σ qty × unit price; lineDiscount = subtotal − goods. */
  subtotal: number
  lineDiscount: number
  goods: number
  globalDiscount: number
  taxBase: number
  ppn: number
  shipping: number
  total: number
  /** One message per problem, naming the line and its maximum (Rule 4, R-07 style). */
  errors: string[]
  /** Nothing to bill: every line is 0. */
  isEmpty: boolean
}

/** Percent for captions: up to two decimals, trailing zeros trimmed, comma decimal. */
export function pctText(p: number): string {
  return `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(Math.round(p * 100) / 100)}%`
}
export function qtyText(q: number): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 6 }).format(q)
}

/**
 * The whole invoice, derived from the inputs. The form renders it and saves it;
 * nothing else computes billing. Pure — calling it never writes.
 */
export function planBilling(input: BillingInput): BillingPlan {
  const order = salesOrders.find(o => o.id === input.orderId)
  const empty: BillingPlan = {
    orderId: input.orderId, basis: input.basis, split: input.split, lines: [], deliveries: [],
    subtotal: 0, lineDiscount: 0, goods: 0, globalDiscount: 0, taxBase: 0, ppn: 0, shipping: 0, total: 0,
    errors: [], isEmpty: true,
  }
  if (!order) return empty

  const selected = orderDeliveries(order.id).filter(d => input.deliveryIds.includes(d.id))
  const Dk = deliveryDiscounts(order.id)
  const Sk = deliveryShipping(order.id)
  const delivered = deliveredByOrderLine(order.id)
  const billed = billedByLine(order.id, input.excludeInvoiceId)
  const balances = Object.fromEntries(selected.map(d => [d.id, deliveryLineBalances(d.id, input.excludeInvoiceId)]))

  // Lines worth showing: any order line the selected deliveries delivered.
  const lineIdx = order.items.map((_it, i) => i).filter(i => selected.some(d => (balances[d.id]![i]?.delivered ?? 0) > 0))

  // 1) What each line bills now (auto), before splitting.
  const wanted: Record<number, number> = {}
  for (const i of lineIdx) {
    const it = order.items[i]!
    const v = Math.max(0, input.lineInputs[i] ?? 0)
    if (input.basis === 'qty') { wanted[i] = trunc6(v); continue }
    // % of the ORDERED qty (Rule 12). Landing on 100% takes the exact remainder.
    const billedPct = it.qty > 0 ? (billed[i] ?? 0) / it.qty * 100 : 0
    wanted[i] = billedPct + v >= 100 - 1e-9 ? clamp0(it.qty - (billed[i] ?? 0)) : trunc6(it.qty * v / 100)
  }

  // 2) Split into cells — oldest-first, or the user's own figures.
  const cellQty: Record<string, Record<number, number>> = {}
  const lineOver: Record<number, boolean> = {}
  for (const i of lineIdx) {
    let rest = wanted[i] ?? 0
    for (const d of selected) {
      const avail = balances[d.id]![i]?.available ?? 0
      const take = Math.min(avail, rest)
      ;(cellQty[d.id] ??= {})[i] = trunc6(take)
      rest = clamp0(rest - take)
    }
    lineOver[i] = input.split === 'auto' && rest > QTY_EPS
  }
  if (input.split === 'manual' && input.manual) {
    for (const d of selected) {
      for (const i of lineIdx) {
        const m = input.manual[d.id]?.[i]
        if (m !== undefined) (cellQty[d.id] ??= {})[i] = trunc6(Math.max(0, m))
      }
    }
  }

  // 3) Cells, with the discount each carries (Rule 11 per delivery line).
  const errors: string[] = []
  const deliveries: PlanDelivery[] = selected.map((d) => {
    const bal = balances[d.id]!
    const cells: PlanCell[] = []
    let goodsNow = 0
    let discountNow = 0
    for (const i of lineIdx) {
      const b = bal[i]
      if (!b) continue
      const now = cellQty[d.id]?.[i] ?? 0
      const goods = now * netPrice(order, i)
      const clears = now > 0 && b.billed + now >= b.delivered - QTY_EPS
      const disc = now <= 0 ? 0 : clears ? b.discount - b.discountBilled : (b.delivered > 0 ? b.discount * now / b.delivered : 0)
      const overCap = input.split === 'manual' && now > b.available + QTY_EPS
      if (overCap) {
        errors.push(`${order.items[i]!.product}: max ${qtyText(b.available)} ${order.items[i]!.unit} on Sales Delivery #${d.number}`)
      }
      cells.push({
        deliveryId: d.id, orderLineIndex: i, delivered: b.delivered, billedBefore: b.billed, available: b.available,
        billNow: now, leftAfter: clamp0(b.available - now), goodsNow: goods, discountNow: disc, overCap,
      })
      goodsNow += goods
      discountNow += disc
    }
    const goodsDelivered = deliveryGoods(d, order)
    const goodsBilledBefore = Object.entries(bal).reduce((s, [i, b]) => s + b.billed * netPrice(order, Number(i)), 0)
    const discountBilledBefore = Object.values(bal).reduce((s, b) => s + b.discountBilled, 0)
    const shippingBilledBefore = shippingBilledOn(d.id, input.excludeInvoiceId)
    const draws = cells.some(c => c.billNow > QTY_EPS)
    const shippingNow = draws ? Math.max(0, (Sk[d.id] ?? 0) - shippingBilledBefore) : 0
    const clears = cells.length > 0 && cells.every(c => c.leftAfter <= QTY_EPS && !c.overCap) && draws
    const leftAfter = (goodsDelivered - goodsBilledBefore - goodsNow)
      - ((Dk[d.id] ?? 0) - discountBilledBefore - discountNow)
      + ((Sk[d.id] ?? 0) - shippingBilledBefore - shippingNow)
    return {
      deliveryId: d.id, number: d.number, date: d.date, createdAt: d.createdAt ?? d.date,
      goodsDelivered, discount: Dk[d.id] ?? 0, shipping: Sk[d.id] ?? 0,
      goodsBilledBefore, discountBilledBefore, shippingBilledBefore,
      goodsNow, discountNow, shippingNow, leftAfter: Math.abs(leftAfter) < 0.005 ? 0 : leftAfter, clears, cells,
    }
  })

  // 4) Lines (rows of the main table).
  const lines: PlanLine[] = lineIdx.map((i) => {
    const it = order.items[i]!
    const qty = deliveries.reduce((s, d) => s + (d.cells.find(c => c.orderLineIndex === i)?.billNow ?? 0), 0)
    const maxQty = selected.reduce((s, d) => s + (balances[d.id]![i]?.available ?? 0), 0)
    const percent = it.qty > 0 ? qty / it.qty * 100 : 0
    const maxPercent = it.qty > 0 ? Math.floor(maxQty / it.qty * 100 * 100 + 1e-6) / 100 : 0
    const shownInput = input.split === 'auto' ? (input.lineInputs[i] ?? 0) : (input.basis === 'qty' ? qty : percent)
    if (lineOver[i]) {
      errors.push(input.basis === 'percent'
        ? `${it.product}: max ${pctText(maxPercent)} / ${qtyText(maxQty)} ${it.unit}`
        : `${it.product}: max ${qtyText(maxQty)} ${it.unit}`)
    }
    return {
      orderLineIndex: i, product: it.product, sku: it.sku, description: it.description, unit: it.unit,
      unitPrice: it.unitPrice, discountPct: it.discountPct, netPrice: netPrice(order, i), orderedQty: it.qty,
      deliveredQty: delivered[i] ?? 0, billedQty: billed[i] ?? 0, availableQty: maxQty,
      input: shownInput, qty, percent,
      amount: Math.round(qty * netPrice(order, i)), maxQty, maxPercent, overCap: !!lineOver[i],
    }
  })

  // 5) Totals. Rupiah rounding is cumulative per order (Rule 9): this invoice's
  //    discount = round(billed before + now) − round(billed before).
  const subtotal = Math.round(lines.reduce((s, l) => s + l.qty * l.unitPrice, 0))
  const goods = lines.reduce((s, l) => s + l.amount, 0)
  const discBefore = orderDeliveries(order.id).reduce((s, d) => s + Object.values(deliveryLineBalances(d.id, input.excludeInvoiceId)).reduce((a, b) => a + b.discountBilled, 0), 0)
  const discNow = deliveries.reduce((s, d) => s + d.discountNow, 0)
  const globalDiscount = Math.round(discBefore + discNow) - Math.round(discBefore)
  const taxBase = goods - globalDiscount
  const ppn = Math.round(taxBase * PPN_RATE)
  const shipping = Math.round(deliveries.reduce((s, d) => s + d.shippingNow, 0))
  return {
    orderId: order.id, basis: input.basis, split: input.split, lines, deliveries,
    subtotal, lineDiscount: subtotal - goods, goods, globalDiscount, taxBase, ppn, shipping,
    total: taxBase + ppn + shipping, errors, isEmpty: lines.every(l => l.qty <= QTY_EPS),
  }
}

// ── Defaults the form starts from ────────────────────────────────────────────

/** Every line's remaining billable on the selected deliveries, in the basis's unit
 *  ("Bill remaining"). In percent, the % of ordered that the remainder is. */
export function remainingInputs(plan: BillingPlan): Record<number, number> {
  const out: Record<number, number> = {}
  for (const l of plan.lines) out[l.orderLineIndex] = plan.basis === 'qty' ? l.maxQty : (l.orderedQty > 0 ? l.maxQty / l.orderedQty * 100 : 0)
  return out
}

/** The current split as a manual grid — what "Set per delivery" starts from. */
export function manualFromPlan(plan: BillingPlan): Record<string, Record<number, number>> {
  const out: Record<string, Record<number, number>> = {}
  for (const d of plan.deliveries) for (const c of d.cells) (out[d.deliveryId] ??= {})[c.orderLineIndex] = c.billNow
  return out
}

/** Deliveries a customer can bill now, grouped by their sales order. */
export function billableDeliveries(customerId: string): { orderId: string; orderNumber: number; deliveries: SalesDelivery[] }[] {
  const byOrder = new Map<string, SalesDelivery[]>()
  for (const d of salesDeliveries) {
    if (d.customer.id !== customerId || !d.orderId || !d.items?.length) continue
    if (!isBillable(d.id)) continue
    byOrder.set(d.orderId, [...(byOrder.get(d.orderId) ?? []), d])
  }
  return [...byOrder].map(([orderId, ds]) => ({
    orderId,
    orderNumber: salesOrders.find(o => o.id === orderId)?.number ?? 0,
    deliveries: ds.sort((a, b) => creationKey(a).localeCompare(creationKey(b))),
  }))
}

/** Fully billed deliveries of an order — named under the field, not offered (PRD UX 1). */
export function fullyBilledDeliveries(orderId: string): SalesDelivery[] {
  return orderDeliveries(orderId).filter(d => !isBillable(d.id))
}

// ── Save ─────────────────────────────────────────────────────────────────────

/**
 * Writes the billing records for a saved invoice and refreshes each delivery's
 * billing status. Call only with a plan that has no errors.
 */
export function commitBilling(plan: BillingPlan, invoice: { id: string; number: number }): DeliveryBillingRecord[] {
  const now = new Date().toISOString().slice(0, 19)
  const written: DeliveryBillingRecord[] = []
  for (const d of plan.deliveries) {
    const lines = d.cells.filter(c => c.billNow > QTY_EPS)
      .map(c => ({ orderLineIndex: c.orderLineIndex, qty: c.billNow, goods: c.goodsNow, discount: c.discountNow }))
    if (!lines.length) continue
    const rec: DeliveryBillingRecord = {
      invoiceId: invoice.id, invoiceNumber: invoice.number, orderId: plan.orderId, deliveryId: d.deliveryId,
      lines, shipping: d.shippingNow, createdAt: now,
    }
    deliveryBillingRecords.push(rec)
    written.push(rec)
  }
  saveCreated(RECORDS_KEY, deliveryBillingRecords.filter(r => r.invoiceId !== 'SI201'))
  for (const d of plan.deliveries) {
    const sd = salesDeliveries.find(x => x.id === d.deliveryId)
    if (!sd) continue
    sd.billingStatus = deliveryBillingStatus(sd.id)
    persistDeliveryBillingStatus(sd.id, sd.billingStatus)
  }
  return written
}

/** Prototype demo reset — drops every user-made billing record. */
export function resetDeliveryBilling(): void {
  for (let i = deliveryBillingRecords.length - 1; i >= 0; i--) {
    if (deliveryBillingRecords[i]!.invoiceId !== 'SI201') deliveryBillingRecords.splice(i, 1)
  }
  saveCreated(RECORDS_KEY, [])
  clearDeliveryBillingStatuses()
  for (const sd of salesDeliveries) if (sd.orderId === 'SO104') sd.billingStatus = deliveryBillingStatus(sd.id)
}

/** The invoices of an order that came from deliveries (for SO / SD detail links). */
export function invoicesForOrder(orderId: string): { id: string; number: number }[] {
  const seen = new Map<string, number>()
  for (const r of deliveryBillingRecords) if (r.orderId === orderId) seen.set(r.invoiceId, r.invoiceNumber)
  return [...seen].map(([id, number]) => ({ id, number })).filter(x => salesInvoices.some(s => s.id === x.id))
}
