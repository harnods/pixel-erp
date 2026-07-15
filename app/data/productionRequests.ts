import { reactive } from 'vue'
import { salesOrders } from './salesOrders'
import type { SalesOrder } from './types'
import { loadSnapshot, saveSnapshot } from './persist'
import { CATALOG } from './catalog'

/**
 * Production requests — Production ▸ Production request. A production request is
 * always raised FROM a real sales order: every {@link PrSource} carries `sourceId`,
 * the real {@link SalesOrder} id it came from (see addProductionRequest, called from
 * the Sales Order detail page's "Create production request" action).
 *
 * The index is an accordion grouped by PRODUCT:
 *   • Parent row  = a finished product. Aggregates its requests (Requested / Produced
 *     / Remaining or Rejected qty + Unit). Production-request no., date and memo are
 *     BLANK on the parent — they only make sense per request.
 *   • Child rows  = the individual production requests, grouped by the SOURCE
 *     transaction (the sales order) that raised them. Each request carries its own
 *     number, quantities, due/complete/reject date and memo.
 *
 * Three lifecycle states drive the three tabs: pending · completed · rejected.
 */

export type PrStatus = 'pending' | 'completed' | 'rejected'

export interface PrRequest {
  requestNo: string
  requestedQty: number
  producedQty: number
  rejectedQty: number
  dueDate?: string       // ISO — pending
  completeDate?: string  // ISO — completed
  rejectDate?: string    // ISO — rejected
  memo?: string
}

/** A group of requests raised from the same source document — a real sales order. */
export interface PrSource {
  sourceNo: string
  /** the real SalesOrder.id this group was raised from */
  sourceId: string
  requests: PrRequest[]
}

/** Accordion parent — one finished product with its source-grouped requests. */
export interface PrProduct {
  id: string
  productName: string
  sku: string
  image: string
  unit: string
  status: PrStatus
  sources: PrSource[]
}

export interface PrAggregate {
  requested: number
  produced: number
  rejected: number
  remaining: number
}

/** Flatten a product's requests across all source groups. */
export function prRequestsOf(p: PrProduct): PrRequest[] {
  return p.sources.flatMap(s => s.requests)
}

/** Roll a product's requests up into the parent-row totals. */
export function prAggregate(p: PrProduct): PrAggregate {
  const rs = prRequestsOf(p)
  const requested = rs.reduce((a, r) => a + r.requestedQty, 0)
  const produced = rs.reduce((a, r) => a + r.producedQty, 0)
  const rejected = rs.reduce((a, r) => a + r.rejectedQty, 0)
  return { requested, produced, rejected, remaining: Math.max(0, requested - produced) }
}

/** Remaining for a single request = requested − produced (never negative). */
export function prChildRemaining(r: PrRequest): number {
  return Math.max(0, r.requestedQty - r.producedQty)
}

/** Earliest due date across a product's requests — used for the Due date sort. */
export function prEarliestDue(p: PrProduct): string {
  return prRequestsOf(p).map(r => r.dueDate ?? '').filter(Boolean).sort()[0] ?? ''
}

// ─── Product catalogue for the mock (name + SKU + photo mirror the Figma) ────────
interface ProductRef { name: string; sku: string; image: string }
const P = {
  myanmar:    { name: 'Myanmar Mya Ze Di Natural', sku: 'ID1790', image: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Single_China-Yunnan-Baoshan-2026.jpg?v=1779678647' },
  ethiopian:  { name: 'Ethiopian Sidamo Roast',    sku: 'ET2345', image: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Single_Kenya-Gatomboya-AB-2026.jpg?v=1779850609' },
  colombian:  { name: 'Colombian Supremo Beans',   sku: 'CO9821', image: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Premium-Colombia-Oscar-Hernandez-2026.jpg?v=1781072256' },
  guatemalan: { name: 'Guatemalan Antigua Ground', sku: 'GT4510', image: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Single_El-Salvador-Emerson-VasquezPacamara-2026.jpg?v=1776071969' },
  kenyan:     { name: 'Kenyan AA Medium Roast',    sku: 'KE3377', image: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Single_Kenya-Gatomboya-AB-2026.jpg?v=1779850609' },
  brazilian:  { name: 'Brazilian Santos Dark Roast', sku: 'BR7643', image: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Single_Fairfield-Dark.jpg?v=1779257290' },
  tanzanian:  { name: 'Tanzanian Peaberry Roast',  sku: 'TZ1911', image: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Single_Rwanda-Mbilima-Soil-Project-Lot.0704-2026.jpg?v=1779845863' },
  honduran:   { name: 'Honduran Marcala Espresso', sku: 'HO3462', image: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Single_Honduras-Norman-Castellanos-2026.jpg?v=1778641670' },
  sumatra:    { name: 'Sumatra Mandheling',        sku: 'SU5508', image: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Drip-Bag_Indonesia-Frinsa-Estate-Weninggalih.jpg?v=1779252798' },
  costarican: { name: 'Costa Rican Tarrazu Blend', sku: 'CR2289', image: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Blend-Haru-Kochi-2026.jpg?v=1774337981' },
} satisfies Record<string, ProductRef>

const UNIT = 'Pcs'

function product(id: string, ref: ProductRef, status: PrStatus, sources: PrSource[]): PrProduct {
  return { id, productName: ref.name, sku: ref.sku, image: ref.image, unit: UNIT, status, sources }
}

// Every seed source links to a REAL sales order — cycles deterministically through
// the real salesOrders catalog so re-running the generator always links the same way.
let soLinkSeq = 0
function soRef(): { sourceNo: string; sourceId: string } {
  const so = salesOrders[soLinkSeq % salesOrders.length]!
  soLinkSeq++
  return { sourceNo: `Sales Order #${so.number}`, sourceId: so.id }
}

// ─── Pending ─────────────────────────────────────────────────────────────────
// Myanmar is the multi-request example (mirrors the Figma): three sales orders,
// the first bundling three production requests. The rest are single-request.
const pending: PrProduct[] = [
  product('pr-p-myanmar', P.myanmar, 'pending', [
    { ...soRef(), requests: [
      { requestNo: 'Production Request #20034', requestedQty: 1, producedQty: 0, rejectedQty: 0, dueDate: '2026-06-11' },
      { requestNo: 'Production Request #20033', requestedQty: 2, producedQty: 0, rejectedQty: 0, dueDate: '2026-06-10' },
      { requestNo: 'Production Request #20032', requestedQty: 7, producedQty: 0, rejectedQty: 0, dueDate: '2026-06-09' },
    ] },
    { ...soRef(), requests: [
      { requestNo: 'Production Request #20031', requestedQty: 5, producedQty: 5, rejectedQty: 0, dueDate: '2026-06-13' },
    ] },
    { ...soRef(), requests: [
      { requestNo: 'Production Request #20030', requestedQty: 5, producedQty: 5, rejectedQty: 0, dueDate: '2026-06-18' },
    ] },
  ]),
  ...[
    { ref: P.ethiopian,  no: 'Production Request #20029', req: 10, prod: 5, due: '2026-07-16' },
    { ref: P.colombian,  no: 'Production Request #20028', req: 10, prod: 4, due: '2026-07-18', memo: 'Hold single-origin lot' },
    { ref: P.guatemalan, no: 'Production Request #20027', req: 10, prod: 3, due: '2026-07-11', memo: 'Awaiting green bean intake' },
    { ref: P.kenyan,     no: 'Production Request #20026', req: 10, prod: 7, due: '2026-07-20' },
    { ref: P.brazilian,  no: 'Production Request #20025', req: 10, prod: 6, due: '2026-07-22' },
    { ref: P.tanzanian,  no: 'Production Request #20024', req: 10, prod: 2, due: '2026-07-15', memo: 'Peaberry sort by hand' },
    { ref: P.honduran,   no: 'Production Request #20023', req: 10, prod: 5, due: '2026-07-24' },
    { ref: P.sumatra,    no: 'Production Request #20022', req: 10, prod: 4, due: '2026-07-19' },
    { ref: P.costarican, no: 'Production Request #20021', req: 10, prod: 3, due: '2026-07-26' },
  ].map((r, i) => product(`pr-p-${i + 2}`, r.ref, 'pending', [
    { ...soRef(), requests: [
      { requestNo: r.no, requestedQty: r.req, producedQty: r.prod, rejectedQty: 0, dueDate: r.due, memo: r.memo },
    ] },
  ])),
]

// ─── Completed ───────────────────────────────────────────────────────────────
const completed: PrProduct[] = [
  { ref: P.myanmar,    no: 'Production Request #19034', req: 20, prod: 20, done: '2026-06-28' },
  { ref: P.ethiopian,  no: 'Production Request #19033', req: 10, prod: 10, done: '2026-06-27' },
  { ref: P.colombian,  no: 'Production Request #19032', req: 10, prod: 10, done: '2026-06-26', memo: 'Split into two roast batches' },
  { ref: P.guatemalan, no: 'Production Request #19031', req: 10, prod: 10, done: '2026-06-25' },
  { ref: P.kenyan,     no: 'Production Request #19030', req: 10, prod: 10, done: '2026-06-24' },
  { ref: P.brazilian,  no: 'Production Request #19029', req: 10, prod: 10, done: '2026-06-23' },
  { ref: P.tanzanian,  no: 'Production Request #19028', req: 10, prod: 10, done: '2026-06-22' },
  { ref: P.honduran,   no: 'Production Request #19027', req: 10, prod: 10, done: '2026-06-21', memo: 'Espresso profile signed off' },
  { ref: P.sumatra,    no: 'Production Request #19026', req: 10, prod: 10, done: '2026-06-20' },
  { ref: P.costarican, no: 'Production Request #19025', req: 10, prod: 10, done: '2026-06-19' },
].map((r, i) => product(`pr-c-${i + 1}`, r.ref, 'completed', [
  { ...soRef(), requests: [
    { requestNo: r.no, requestedQty: r.req, producedQty: r.prod, rejectedQty: 0, completeDate: r.done, memo: r.memo },
  ] },
]))

// ─── Rejected ────────────────────────────────────────────────────────────────
const rejected: PrProduct[] = [
  { ref: P.myanmar,    no: 'Production Request #18034', req: 27, rej: 12, on: '2026-06-18', memo: 'Moisture out of spec' },
  { ref: P.ethiopian,  no: 'Production Request #18033', req: 43, rej: 37, on: '2026-06-17' },
  { ref: P.colombian,  no: 'Production Request #18032', req: 58, rej: 48, on: '2026-06-16', memo: 'Roast too dark' },
  { ref: P.guatemalan, no: 'Production Request #18031', req: 91, rej: 23, on: '2026-06-15' },
  { ref: P.kenyan,     no: 'Production Request #18030', req: 34, rej: 34, on: '2026-06-14', memo: 'Contamination flagged in QC' },
  { ref: P.brazilian,  no: 'Production Request #18029', req: 76, rej: 76, on: '2026-06-13' },
  { ref: P.tanzanian,  no: 'Production Request #18028', req: 49, rej: 18, on: '2026-06-12' },
  { ref: P.honduran,   no: 'Production Request #18027', req: 65, rej: 64, on: '2026-06-11', memo: 'Customer cancelled order' },
  { ref: P.sumatra,    no: 'Production Request #18026', req: 82, rej: 29, on: '2026-06-10' },
  { ref: P.costarican, no: 'Production Request #18025', req: 77, rej: 77, on: '2026-06-09' },
].map((r, i) => product(`pr-r-${i + 1}`, r.ref, 'rejected', [
  { ...soRef(), requests: [
    { requestNo: r.no, requestedQty: r.req, producedQty: 0, rejectedQty: r.rej, rejectDate: r.on, memo: r.memo },
  ] },
]))

function buildSeed(): PrProduct[] {
  soLinkSeq = 0
  return [...pending, ...completed, ...rejected]
}

// Persisted as a full snapshot (seed + live-created) — mirrors outgoing.ts.
const prSnapshot = loadSnapshot<PrProduct>('productionRequests')
export const productionRequestProducts = reactive<PrProduct[]>(prSnapshot ?? buildSeed())

/** Persist the production-request snapshot (call after any mutation). */
export function persistProductionRequests(): void {
  saveSnapshot('productionRequests', productionRequestProducts)
}

/** Products for a given lifecycle tab. */
export function productionRequestsByStatus(status: PrStatus): PrProduct[] {
  return productionRequestProducts.filter(p => p.status === status)
}

/** Badge count for the "Pending" tab (number of pending products). */
export function productionRequestPendingCount(): number {
  return productionRequestsByStatus('pending').length
}

let prAddSeq = 20035 + productionRequestProducts.filter(p => p.id.startsWith('pr-new-')).length

/**
 * Create production requests FROM a real sales order — one request per line item
 * that matches a registered CATALOG product (by SKU). Each item becomes/joins a
 * pending PrProduct (grouped by product, same accordion shape as the seed), with
 * its source pointing at the real sales order. Returns the created/updated products.
 */
export function addProductionRequest(order: SalesOrder): PrProduct[] {
  const touched: PrProduct[] = []
  const sourceNo = `Sales Order #${order.number}`
  for (const item of order.items) {
    const catalogItem = CATALOG.find(c => c.sku === item.sku)
    if (!catalogItem) continue // only registered products can be requested for production

    const requestNo = `Production Request #${prAddSeq++}`
    const request = {
      requestNo, requestedQty: item.qty, producedQty: 0, rejectedQty: 0,
      dueDate: order.dueDate,
    }
    const source: PrSource = { sourceNo, sourceId: order.id, requests: [request] }

    let p = productionRequestProducts.find(x => x.status === 'pending' && x.sku === catalogItem.sku)
    if (p) {
      p.sources.push(source)
    } else {
      const ref: ProductRef = { name: catalogItem.name, sku: catalogItem.sku, image: catalogItem.img }
      p = product(`pr-new-${catalogItem.id}-${Date.now()}`, ref, 'pending', [source])
      productionRequestProducts.unshift(p)
    }
    touched.push(p)
  }
  persistProductionRequests()
  return touched
}

export interface RejectProductionRequestInput {
  /** the pending PrProduct this request belongs to */
  productId: string
  sourceNo: string
  requestNo: string
  rejectedQty: number
  reason: string
  /** ISO — the mock "today" the caller is anchored to */
  rejectDate: string
}

/**
 * Reject some (or all) of a pending production request's remaining qty. Only
 * production REQUEST rows (children) can be rejected — never the product (parent)
 * row, which has no single request/due-date/memo of its own to reject.
 *
 * Partial rejection is allowed: the request's `requestedQty` shrinks by the
 * rejected amount, so it stays open in Pending for whatever's left (mirrors how
 * `producedQty` already narrows `remaining` — rejecting works the same way). The
 * rejected amount is recorded as its own line in the Rejected tab, grouped under
 * the same product + sales order (merged into an existing rejected entry if one's
 * already there, same merge-by-SKU rule as `addProductionRequest`).
 */
export function rejectProductionRequest(input: RejectProductionRequestInput): void {
  const p = productionRequestProducts.find(x => x.id === input.productId && x.status === 'pending')
  if (!p) return
  const src = p.sources.find(s => s.sourceNo === input.sourceNo)
  if (!src) return
  const req = src.requests.find(r => r.requestNo === input.requestNo)
  if (!req) return

  const remaining = prChildRemaining(req)
  const qty = Math.max(1, Math.min(Math.floor(input.rejectedQty), remaining))
  req.requestedQty -= qty

  let rejectedProduct = productionRequestProducts.find(x => x.status === 'rejected' && x.sku === p.sku)
  if (!rejectedProduct) {
    rejectedProduct = product(`pr-rej-${p.sku}-${Date.now()}`, { name: p.productName, sku: p.sku, image: p.image }, 'rejected', [])
    productionRequestProducts.push(rejectedProduct)
  }
  let rejectedSource = rejectedProduct.sources.find(s => s.sourceNo === input.sourceNo)
  if (!rejectedSource) {
    rejectedSource = { sourceNo: input.sourceNo, sourceId: src.sourceId, requests: [] }
    rejectedProduct.sources.push(rejectedSource)
  }
  rejectedSource.requests.push({
    requestNo: input.requestNo,
    requestedQty: qty,
    producedQty: 0,
    rejectedQty: qty,
    rejectDate: input.rejectDate,
    memo: input.reason,
  })

  persistProductionRequests()
}

// ─── Work orders (for the "Open preview" drawer) ─────────────────────────────
export interface WorkOrder {
  number: string
  startDate: string   // ISO
  endDate: string     // ISO
  producedQty: number
  unit: string
  status: 'in progress' | 'completed'
}

function seedHash(s: string): number {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h >>> 0
}

/**
 * Deterministic work orders raised for a production request. Newest first; the
 * latest is "in progress", the rest "completed". Stable per request number.
 */
export function workOrdersForRequest(requestNo: string): WorkOrder[] {
  const h = seedHash(requestNo)
  const count = 1 + (h % 4)            // 1–4 work orders
  const base = 10001 + (h % 800)
  const startBase = new Date('2026-06-13T00:00:00').getTime()
  const DAY = 86_400_000
  const list: WorkOrder[] = []
  for (let i = 0; i < count; i++) {
    const start = new Date(startBase + i * DAY * (1 + ((h >> i) & 1)))
    const end = new Date(start.getTime() + ((h >> (i + 2)) % 3) * DAY)
    const isLatest = i === count - 1
    list.push({
      number: `Work Order #${base + i}`,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      producedQty: isLatest ? 1 + (h % 2) : 1,
      unit: 'Pcs',
      status: isLatest ? 'in progress' : 'completed',
    })
  }
  return list.reverse()                // newest (highest number) first
}
