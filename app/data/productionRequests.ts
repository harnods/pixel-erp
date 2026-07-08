/**
 * Production requests — mock data for the Production ▸ Production request index.
 *
 * The index is an accordion grouped by PRODUCT:
 *   • Parent row  = a finished product. Aggregates its requests (Requested / Produced
 *     / Remaining or Rejected qty + Unit). Production-request no., date and memo are
 *     BLANK on the parent — they only make sense per request.
 *   • Child rows  = the individual production requests, grouped by the SOURCE
 *     transaction (e.g. a sales order) that raised them. Each request carries its own
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

/** A group of requests raised from the same source document (sales order, etc.). */
export interface PrSource {
  sourceNo: string
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

// ─── Pending ─────────────────────────────────────────────────────────────────
// Myanmar is the multi-request example (mirrors the Figma): three sales orders,
// the first bundling three production requests. The rest are single-request.
const pending: PrProduct[] = [
  product('pr-p-myanmar', P.myanmar, 'pending', [
    { sourceNo: 'Sales Order #20018', requests: [
      { requestNo: 'Production Request #20034', requestedQty: 1, producedQty: 0, rejectedQty: 0, dueDate: '2026-06-11' },
      { requestNo: 'Production Request #20033', requestedQty: 2, producedQty: 0, rejectedQty: 0, dueDate: '2026-06-10' },
      { requestNo: 'Production Request #20032', requestedQty: 7, producedQty: 0, rejectedQty: 0, dueDate: '2026-06-09' },
    ] },
    { sourceNo: 'Sales Order #20019', requests: [
      { requestNo: 'Production Request #20031', requestedQty: 5, producedQty: 5, rejectedQty: 0, dueDate: '2026-06-13' },
    ] },
    { sourceNo: 'Sales Order #20020', requests: [
      { requestNo: 'Production Request #20030', requestedQty: 5, producedQty: 5, rejectedQty: 0, dueDate: '2026-06-18' },
    ] },
  ]),
  ...[
    { ref: P.ethiopian,  so: 'Sales Order #20021', no: 'Production Request #20029', req: 10, prod: 5, due: '2026-07-16' },
    { ref: P.colombian,  so: 'Sales Order #20022', no: 'Production Request #20028', req: 10, prod: 4, due: '2026-07-18', memo: 'Hold single-origin lot' },
    { ref: P.guatemalan, so: 'Sales Order #20023', no: 'Production Request #20027', req: 10, prod: 3, due: '2026-07-11', memo: 'Awaiting green bean intake' },
    { ref: P.kenyan,     so: 'Sales Order #20024', no: 'Production Request #20026', req: 10, prod: 7, due: '2026-07-20' },
    { ref: P.brazilian,  so: 'Sales Order #20025', no: 'Production Request #20025', req: 10, prod: 6, due: '2026-07-22' },
    { ref: P.tanzanian,  so: 'Sales Order #20026', no: 'Production Request #20024', req: 10, prod: 2, due: '2026-07-15', memo: 'Peaberry sort by hand' },
    { ref: P.honduran,   so: 'Sales Order #20027', no: 'Production Request #20023', req: 10, prod: 5, due: '2026-07-24' },
    { ref: P.sumatra,    so: 'Sales Order #20028', no: 'Production Request #20022', req: 10, prod: 4, due: '2026-07-19' },
    { ref: P.costarican, so: 'Sales Order #20029', no: 'Production Request #20021', req: 10, prod: 3, due: '2026-07-26' },
  ].map((r, i) => product(`pr-p-${i + 2}`, r.ref, 'pending', [
    { sourceNo: r.so, requests: [
      { requestNo: r.no, requestedQty: r.req, producedQty: r.prod, rejectedQty: 0, dueDate: r.due, memo: r.memo },
    ] },
  ])),
]

// ─── Completed ───────────────────────────────────────────────────────────────
const completed: PrProduct[] = [
  { ref: P.myanmar,    so: 'Sales Order #19018', no: 'Production Request #19034', req: 20, prod: 20, done: '2026-06-28' },
  { ref: P.ethiopian,  so: 'Sales Order #19019', no: 'Production Request #19033', req: 10, prod: 10, done: '2026-06-27' },
  { ref: P.colombian,  so: 'Sales Order #19020', no: 'Production Request #19032', req: 10, prod: 10, done: '2026-06-26', memo: 'Split into two roast batches' },
  { ref: P.guatemalan, so: 'Sales Order #19021', no: 'Production Request #19031', req: 10, prod: 10, done: '2026-06-25' },
  { ref: P.kenyan,     so: 'Sales Order #19022', no: 'Production Request #19030', req: 10, prod: 10, done: '2026-06-24' },
  { ref: P.brazilian,  so: 'Sales Order #19023', no: 'Production Request #19029', req: 10, prod: 10, done: '2026-06-23' },
  { ref: P.tanzanian,  so: 'Sales Order #19024', no: 'Production Request #19028', req: 10, prod: 10, done: '2026-06-22' },
  { ref: P.honduran,   so: 'Sales Order #19025', no: 'Production Request #19027', req: 10, prod: 10, done: '2026-06-21', memo: 'Espresso profile signed off' },
  { ref: P.sumatra,    so: 'Sales Order #19026', no: 'Production Request #19026', req: 10, prod: 10, done: '2026-06-20' },
  { ref: P.costarican, so: 'Sales Order #19027', no: 'Production Request #19025', req: 10, prod: 10, done: '2026-06-19' },
].map((r, i) => product(`pr-c-${i + 1}`, r.ref, 'completed', [
  { sourceNo: r.so, requests: [
    { requestNo: r.no, requestedQty: r.req, producedQty: r.prod, rejectedQty: 0, completeDate: r.done, memo: r.memo },
  ] },
]))

// ─── Rejected ────────────────────────────────────────────────────────────────
const rejected: PrProduct[] = [
  { ref: P.myanmar,    so: 'Sales Order #18018', no: 'Production Request #18034', req: 27, rej: 12, on: '2026-06-18', memo: 'Moisture out of spec' },
  { ref: P.ethiopian,  so: 'Sales Order #18019', no: 'Production Request #18033', req: 43, rej: 37, on: '2026-06-17' },
  { ref: P.colombian,  so: 'Sales Order #18020', no: 'Production Request #18032', req: 58, rej: 48, on: '2026-06-16', memo: 'Roast too dark' },
  { ref: P.guatemalan, so: 'Sales Order #18021', no: 'Production Request #18031', req: 91, rej: 23, on: '2026-06-15' },
  { ref: P.kenyan,     so: 'Sales Order #18022', no: 'Production Request #18030', req: 34, rej: 34, on: '2026-06-14', memo: 'Contamination flagged in QC' },
  { ref: P.brazilian,  so: 'Sales Order #18023', no: 'Production Request #18029', req: 76, rej: 76, on: '2026-06-13' },
  { ref: P.tanzanian,  so: 'Sales Order #18024', no: 'Production Request #18028', req: 49, rej: 18, on: '2026-06-12' },
  { ref: P.honduran,   so: 'Sales Order #18025', no: 'Production Request #18027', req: 65, rej: 64, on: '2026-06-11', memo: 'Customer cancelled order' },
  { ref: P.sumatra,    so: 'Sales Order #18026', no: 'Production Request #18026', req: 82, rej: 29, on: '2026-06-10' },
  { ref: P.costarican, so: 'Sales Order #18027', no: 'Production Request #18025', req: 77, rej: 77, on: '2026-06-09' },
].map((r, i) => product(`pr-r-${i + 1}`, r.ref, 'rejected', [
  { sourceNo: r.so, requests: [
    { requestNo: r.no, requestedQty: r.req, producedQty: 0, rejectedQty: r.rej, rejectDate: r.on, memo: r.memo },
  ] },
]))

export const productionRequestProducts: PrProduct[] = [...pending, ...completed, ...rejected]

/** Products for a given lifecycle tab. */
export function productionRequestsByStatus(status: PrStatus): PrProduct[] {
  return productionRequestProducts.filter(p => p.status === status)
}

/** Badge count for the "Pending" tab (number of pending products). */
export function productionRequestPendingCount(): number {
  return productionRequestsByStatus('pending').length
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
