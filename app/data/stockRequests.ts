import { reactive } from 'vue'
import { STAFF, shiftDays, TODAY_ISO } from './master'
import { workOrders } from './workOrders'
import { billOfMaterials, catalogProduct } from './billOfMaterials'
import { getWarehouseDetail, isBatchTracked, isSerialized } from './warehouseDetails'
import { loadSnapshot, saveSnapshot } from './persist'

/**
 * Stock requests (Warehouses → Stock requests) — the warehouse/PPIC side of work
 * order material reservation. See the PRD "Work Order Material Reservation, Stock
 * Request & Project Stock" › UC-11 (requirement IDs W-1…W-8 are cited below).
 *
 * A request is never created by hand: saving a work order pushes one request per
 * WO carrying its component lines (PRD C-4), which is why the index has no create
 * action and its empty state has no CTA. Reservation itself is always on; the
 * production setting only chooses One-step (auto-reserve from the WO) or Two-step
 * (PPIC reserves here).
 *
 * The dashboard reads the same requests two ways (W-1):
 *   • **By product** (default) — {@link skuDemandGroups} aggregates the same
 *     component across every open WO into one row with a per-WO breakdown.
 *   • **By transaction** — one row per request. A request is raised by whatever
 *     transaction needs the material; the work order is simply the only kind
 *     that raises one today, which is why every row names its own type.
 */

/** One component line on a request — a raw material the work order needs. */
export interface StockRequestLine {
  /** catalog product id */
  productId: string
  /** denormalized for display + search */
  product: string
  sku: string
  unit: string
  /** qty the work order needs */
  qty: number
  /** qty already reserved out of warehouse stock */
  reserved: number
  /** qty already issued/picked to the shop floor (counts as covered) */
  consumed: number
  /** ISO date the component is required on the floor */
  requiredDate: string
  /** free stock in the destination warehouse right now */
  destAvailable: number
  /**
   * Warehouse this component must reach. Lines of one request can differ, and the
   * detail page groups by it so a single warehouse transfer covers a whole group.
   */
  destinationWarehouse: string
  /** id behind {@link destinationWarehouse} — the key for stock lookups. */
  destinationWarehouseId: string
  /**
   * Batch / serial tracking, when the component is tracked.
   *
   * `requested*` is what the WORK ORDER picked at creation; `reserved*` is what
   * PPIC actually reserved on the Stock requests side. PPIC may reserve different
   * units than the work order asked for — the two are kept apart so the work order
   * can be told when its pick was changed ({@link trackingChanged}).
   */
  tracking?: 'batch' | 'serial'
  requestedBatches?: { batchNo: string; qty: number }[]
  reservedBatches?: { batchNo: string; qty: number }[]
  requestedSerials?: string[]
  reservedSerials?: string[]
}

/** W-7 request tags — a request raised on top of the WO's original demand. */
export type StockRequestKind = 'additional' | 'adjustment'

export interface StockRequest {
  id: string
  /** Human-facing request number, e.g. SR-2026-0007 — the request's own identity. */
  number: string
  /** Work order this request was raised from — every request has one. */
  workOrderId: string
  /** Denormalized work order number (e.g. WO-2026-0004) for display + search. */
  workOrderNumber: string
  /** ISO date the request was raised. */
  requestDate: string
  /** Who raised it — a name from the shared STAFF list. */
  requestor: string
  /** 'additional' / 'adjustment' tag (W-7); absent on a plain WO-raised request. */
  kind?: StockRequestKind
  /** Rejected by the stockist — only additional/adjustment requests can be (W-7). */
  rejected?: boolean
  lines: StockRequestLine[]
}

/**
 * Material readiness (PRD W-3). `requested` replaces the older "To reserve"
 * wording — the PRD's status filter uses "Requested" (W-5).
 */
export type StockRequestStatus =
  | 'requested'
  | 'partially reserved'
  | 'reserved'
  | 'issued / picked'
  | 'rejected'

/**
 * What still has to reach the destination warehouse before this line can be
 * reserved in full: the outstanding need minus the stock already sitting there.
 * Drives the "To transfer" column and the warehouse-transfer action.
 */
export function lineToTransfer(line: StockRequestLine): number {
  return Math.max(0, line.qty - lineCovered(line) - line.destAvailable)
}

/** Qty on a line that counts as covered — reserved plus already-issued, capped at need. */
export function lineCovered(line: StockRequestLine): number {
  return Math.min(line.qty, line.reserved + line.consumed)
}

export function requestRequiredQty(req: StockRequest): number {
  return req.lines.reduce((s, l) => s + l.qty, 0)
}
export function requestCoveredQty(req: StockRequest): number {
  return req.lines.reduce((s, l) => s + lineCovered(l), 0)
}

/** Derive the badge status from the line totals — the single source of truth (W-3). */
export function stockRequestStatus(req: StockRequest): StockRequestStatus {
  if (req.rejected) return 'rejected'
  const required = requestRequiredQty(req)
  const covered = requestCoveredQty(req)
  if (covered === 0) return 'requested'
  if (covered < required) return 'partially reserved'
  // Fully covered — "issued / picked" once every line has actually left the rack.
  return req.lines.every(l => l.consumed >= l.qty) ? 'issued / picked' : 'reserved'
}

/**
 * W-7 — a request is overdue when a component's required date has passed and that
 * line still isn't fully covered. Derived, never stored, so it can't contradict
 * the status badge beside it (a fully reserved request is never overdue).
 */
export function isOverdue(req: StockRequest, today: string): boolean {
  if (req.rejected) return false
  return req.lines.some(l => l.requiredDate < today && lineCovered(l) < l.qty)
}

/**
 * Does this request still need warehouse action? — the **Requested** tab (W-4:
 * "rows not fully covered").
 *
 * "Covered" means RESERVED, not "reservable". Free stock sitting in the warehouse
 * does not settle a request: somebody still has to reserve it. Counting available
 * stock here made every new request disappear from the default tab the moment the
 * warehouse happened to hold enough.
 */
export function needsAction(req: StockRequest): boolean {
  if (req.rejected) return false
  return req.lines.some(l => lineCovered(l) < l.qty)
}

/** Status options for the quick filter / All-filters drawer — no "All …" entry (W-5). */
export const stockRequestStatusOptions: { value: StockRequestStatus; label: string }[] = [
  { value: 'requested',          label: 'Requested'          },
  { value: 'partially reserved', label: 'Partially reserved' },
  { value: 'reserved',           label: 'Reserved'           },
  { value: 'issued / picked',    label: 'Issued / picked'    },
  { value: 'rejected',           label: 'Rejected'           },
]

/**
 * W-6 — backdated transactions that made a SKU's recalculated stock go negative.
 * Keyed by catalog product id; the SKU row shows the minus Available in red plus
 * a note naming the transaction.
 */
export const backdateRecalc: Record<string, { delta: number; transaction: string }> = {
  p03: { delta: -9, transaction: 'Stock adjustment #SA-0231, backdated 27 Mar' },
}

// ── Seed ───────────────────────────────────────────────────────────────────────
// Each request references a REAL work order and takes its component lines from
// that WO's bill of materials, so the dashboard and the WO pages never disagree.
type SeedLine = { reservedPct: number; consumedPct: number; destAvailable: number; requiredOffset: number }
type Seed = {
  woIndex: number
  dayOffset: number
  staffIndex: number
  kind?: StockRequestKind
  rejected?: boolean
  lines: SeedLine[]
}

/** Destination warehouses used by the seed — real names from the warehouse master. */
const SEED_WAREHOUSES = [
  { id: 'wh-001', name: 'Gudang Jakarta Pusat' },
  { id: 'wh-002', name: 'Gudang Surabaya Timur' },
  { id: 'wh-003', name: 'Gudang Bandung Selatan' },
]

const SEED: Seed[] = [
  // Nothing reserved yet, but warehouse stock covers every line — "Reserve stock"
  // on this row succeeds, which is the happy path the demo needs.
  { woIndex: 4, dayOffset: -2, staffIndex: 0, lines: [
    { reservedPct: 0, consumedPct: 0, destAvailable: 8, requiredOffset: 6 },
    { reservedPct: 0, consumedPct: 0, destAvailable: 6, requiredOffset: 9 },
    { reservedPct: 0, consumedPct: 0, destAvailable: 4, requiredOffset: 9 },
  ] },
  // Additional-stock request (W-7) — production asked for more on top of the WO.
  { woIndex: 3, dayOffset: -5, staffIndex: 1, kind: 'additional', lines: [
    { reservedPct: 0, consumedPct: 0, destAvailable: 1, requiredOffset: 3 },
    { reservedPct: 0, consumedPct: 0, destAvailable: 0, requiredOffset: 3 },
  ] },
  // Fully reserved.
  { woIndex: 2, dayOffset: -8, staffIndex: 2, lines: [
    { reservedPct: 1, consumedPct: 0, destAvailable: 5, requiredOffset: 1 },
    { reservedPct: 1, consumedPct: 0, destAvailable: 4, requiredOffset: 1 },
  ] },
  // Partially reserved and past its required date → overdue (W-7).
  { woIndex: 1, dayOffset: -11, staffIndex: 3, lines: [
    { reservedPct: 1,   consumedPct: 0, destAvailable: 6, requiredOffset: -3 },
    { reservedPct: 0.5, consumedPct: 0, destAvailable: 1,  requiredOffset: -3 },
    { reservedPct: 0,   consumedPct: 0, destAvailable: 0,  requiredOffset: -1 },
  ] },
  // Fully reserved. `consumed` is deliberately left at 0 on every seed: on a
  // work-order request, consumption is recorded through the work order's own
  // Material consume & return flow, and seeding it here would make the readiness
  // badge claim "Issued / picked" while the work order still shows 0 consumed.
  { woIndex: 0, dayOffset: -14, staffIndex: 4, lines: [
    { reservedPct: 1, consumedPct: 0, destAvailable: 9, requiredOffset: -6 },
    { reservedPct: 1, consumedPct: 0, destAvailable: 7, requiredOffset: -6 },
  ] },
  // Adjustment request the stockist rejected (W-7).
  { woIndex: 3, dayOffset: -16, staffIndex: 5, kind: 'adjustment', rejected: true, lines: [
    { reservedPct: 0, consumedPct: 0, destAvailable: 2, requiredOffset: -8 },
  ] },
]

function buildSeed(): StockRequest[] {
  return SEED.map((s, i) => {
    const wo = workOrders[s.woIndex]
    const bom = billOfMaterials.find(b => b.id === wo?.bomId)
    // One line per DISTINCT raw material — a request never repeats a component,
    // so the SKU rollup gets one entry per (work order, component) pair.
    const raws = [...new Map((bom?.rawMaterials ?? []).map(r => [r.productId, r])).values()]
    const requestDate = shiftDays(TODAY_ISO, s.dayOffset)
    const lines: StockRequestLine[] = s.lines.slice(0, Math.max(1, raws.length)).map((sl, li) => {
      const raw = raws[li]
      const product = raw ? catalogProduct(raw.productId) : undefined
      // The qty a request asks for is exactly the qty the work order's Raw
      // materials table calls "Needed qty" — the BOM line. Scaling it here would
      // make the two surfaces disagree about the same number.
      const qty = raw?.needed ?? 1
      const consumed = Math.round(qty * sl.consumedPct)
      return {
        productId: raw?.productId ?? `p-100${li + 1}`,
        product: product?.name ?? 'Raw material',
        sku: product?.sku ?? `10${String(li + 1).padStart(2, '0')}`,
        unit: raw?.unit ?? product?.unit ?? 'Unit',
        qty,
        reserved: Math.max(Math.round(qty * sl.reservedPct), consumed),
        consumed,
        requiredDate: shiftDays(requestDate, sl.requiredOffset),
        destAvailable: sl.destAvailable,
        // Spread the seed across warehouses so the grouped table is visible.
        destinationWarehouse: SEED_WAREHOUSES[li % SEED_WAREHOUSES.length]!.name,
        destinationWarehouseId: SEED_WAREHOUSES[li % SEED_WAREHOUSES.length]!.id,
      }
    })
    return {
      id: `sr-${i + 1}`,
      workOrderId: wo?.id ?? `wo-${s.woIndex + 1}`,
      workOrderNumber: wo?.number ?? `WO-2026-${String(s.woIndex + 1).padStart(4, '0')}`,
      requestDate,
      number: `SR-2026-${String(i + 1).padStart(4, '0')}`,
      requestor: STAFF[s.staffIndex] ?? STAFF[0]!,
      ...(s.kind ? { kind: s.kind } : {}),
      ...(s.rejected ? { rejected: true } : {}),
      lines,
    }
  })
}

const snapshot = loadSnapshot<StockRequest>('stockRequests')
export const stockRequests = reactive<StockRequest[]>(snapshot ?? buildSeed())

const SR_NO_RE = /^SR-2026-(\d+)$/
/** Next request number, continuing from the highest already issued. */
function nextRequestNumber(): string {
  let max = 0
  for (const r of stockRequests) {
    const m = r.number?.match(SR_NO_RE)
    if (m) max = Math.max(max, parseInt(m[1]!, 10))
  }
  return `SR-2026-${String(max + 1).padStart(4, '0')}`
}

/** Persist the stock-request snapshot (call after any mutation). */
export function persistStockRequests(): void {
  saveSnapshot('stockRequests', stockRequests)
}

/** Requests still needing warehouse action — drives any count badge. */
export const stockRequestOpenCount = (): number =>
  stockRequests.filter(needsAction).length

// ── SKU aggregation (W-1, W-2, W-8) ────────────────────────────────────────────

/** One work order's share of a SKU row — the expandable per-WO breakdown. */
export interface SkuDemandEntry {
  requestId: string
  workOrderId: string
  workOrderNumber: string
  requestor: string
  kind?: StockRequestKind
  qty: number
  covered: number
  requiredDate: string
  destAvailable: number
}

/** One aggregated component row — same SKU summed across every open work order. */
export interface SkuDemandGroup {
  productId: string
  product: string
  sku: string
  unit: string
  entries: SkuDemandEntry[]
  /** number of open work orders needing this component */
  openWorkOrders: number
  /** earliest required date across the entries */
  earliestRequired: string
  /** latest required date — SKU status follows this within the filtered range (W-5) */
  latestRequired: string
  required: number
  reserved: number
  /** still to cover after reservations AND on-hand warehouse stock */
  remaining: number
  /** free stock now, after any backdated recalculation (W-6) */
  available: number
  status: StockRequestStatus
  backdate?: { delta: number; transaction: string }
  /** true when nothing is outstanding — drives the Requested / All tabs (W-4) */
  sufficient: boolean
}

/**
 * Aggregate request lines into one row per component (W-2). Rejected requests are
 * excluded — their demand no longer stands. `lineFilter` lets the page drop lines
 * outside the selected required-date range before aggregating (W-5).
 */
export function skuDemandGroups(
  requests: StockRequest[],
  lineFilter?: (line: StockRequestLine, req: StockRequest) => boolean,
): SkuDemandGroup[] {
  const byProduct = new Map<string, { line: StockRequestLine; req: StockRequest }[]>()
  for (const req of requests) {
    if (req.rejected) continue
    for (const line of req.lines) {
      if (lineFilter && !lineFilter(line, req)) continue
      const bucket = byProduct.get(line.productId) ?? []
      bucket.push({ line, req })
      byProduct.set(line.productId, bucket)
    }
  }

  return [...byProduct.values()].map((bucket) => {
    const first = bucket[0]!.line
    const entries: SkuDemandEntry[] = bucket.map(({ line, req }) => ({
      requestId: req.id,
      workOrderId: req.workOrderId,
      workOrderNumber: req.workOrderNumber,
      requestor: req.requestor,
      ...(req.kind ? { kind: req.kind } : {}),
      qty: line.qty,
      covered: lineCovered(line),
      requiredDate: line.requiredDate,
      destAvailable: line.destAvailable,
    }))
    const required = entries.reduce((s, e) => s + e.qty, 0)
    const reserved = entries.reduce((s, e) => s + e.covered, 0)
    const backdate = backdateRecalc[first.productId]
    // One warehouse stock figure per SKU — the largest destination availability
    // seen on its lines, then the backdated recalculation applied on top (W-6).
    const available = Math.max(0, ...entries.map(e => e.destAvailable)) + (backdate?.delta ?? 0)
    const remaining = Math.max(0, required - reserved - Math.max(0, available))
    const dates = entries.map(e => e.requiredDate).sort()
    return {
      productId: first.productId,
      product: first.product,
      sku: first.sku,
      unit: first.unit,
      entries,
      openWorkOrders: new Set(entries.map(e => e.workOrderId)).size,
      earliestRequired: dates[0]!,
      latestRequired: dates[dates.length - 1]!,
      required,
      reserved,
      remaining,
      available,
      status: reserved >= required ? 'reserved' : reserved > 0 ? 'partially reserved' : 'requested',
      ...(backdate ? { backdate } : {}),
      // Fully RESERVED — not merely "enough stock exists" (see needsAction).
      sufficient: reserved >= required,
    }
  }).sort((a, b) =>
    Number(a.sufficient) - Number(b.sufficient) || a.latestRequired.localeCompare(b.latestRequired),
  )
}

// ── Actions ────────────────────────────────────────────────────────────────────

/**
 * Reserve every line of a request as far as destination stock allows — the
 * dashboard's "Reserve stock" action. Per-line all-or-nothing (PRD C-3): a line
 * is only reserved when warehouse stock covers its whole outstanding need.
 * Returns the reserved qty, or undefined when there was nothing to do.
 */
export function reserveStock(id: string): number | undefined {
  const req = stockRequests.find(r => r.id === id)
  if (!req || req.rejected) return undefined
  let reserved = 0
  for (const line of req.lines) {
    const outstanding = line.qty - lineCovered(line)
    if (outstanding <= 0 || line.destAvailable < outstanding) continue
    line.reserved += outstanding
    line.destAvailable -= outstanding
    reserved += outstanding
  }
  if (reserved === 0) return undefined
  persistStockRequests()
  return reserved
}

/** Reject an additional/adjustment request (W-7) — production is notified. */
export function rejectRequest(id: string): StockRequest | undefined {
  const req = stockRequests.find(r => r.id === id)
  if (!req || !req.kind || req.rejected) return undefined
  req.rejected = true
  persistStockRequests()
  return req
}

/** Only additional/adjustment requests can be rejected, and only once (W-7). */
export function canReject(req: StockRequest): boolean {
  return !!req.kind && !req.rejected
}

// ── Work order side (UC-01 … UC-04) ────────────────────────────────────────────
// The work order pages and this dashboard read the SAME request rows, so a
// reservation made on either surface is immediately true on the other.

/** The stock request raised by a work order, if it has one yet (C-4). */
export function requestForWorkOrder(workOrderId: string): StockRequest | undefined {
  return stockRequests.find(r => r.workOrderId === workOrderId && !r.kind)
}


/** How much of a component this work order has reserved (reserved + already issued). */
export function reservedForWorkOrder(workOrderId: string, productId: string): number {
  const line = requestForWorkOrder(workOrderId)?.lines.find(l => l.productId === productId)
  return line ? lineCovered(line) : 0
}

/** Material readiness of a whole work order — the badge on its detail header. */
export function workOrderReadiness(workOrderId: string): StockRequestStatus | undefined {
  const req = requestForWorkOrder(workOrderId)
  return req ? stockRequestStatus(req) : undefined
}

/**
 * D-8 / UC-04 — Start requires FULL reservation. A work order with no request at
 * all has nothing to reserve, so it passes.
 */
export function isFullyReserved(workOrderId: string): boolean {
  const req = requestForWorkOrder(workOrderId)
  if (!req) return true
  return req.lines.every(l => lineCovered(l) >= l.qty)
}

/** Why a work order cannot start yet — drives the message the user sees. */
export type StartBlockReason = 'none-reserved' | 'some-unreserved' | 'not-fully-reserved'

/**
 * The start gate (D-8), relaxed by the two Production readiness toggles. Both only
 * apply while reservation is on at all — with it off there is nothing to gate.
 *
 *  • **Allow partial production** — the most lenient: start as soon as ANY ONE
 *    component holds a reservation greater than zero.
 *  • **Can start work order with limited stock** — start once EVERY component
 *    holds a reservation greater than zero (each may still be partial).
 *  • neither — every component must be reserved in full.
 *
 * When both are on the more lenient rule wins.
 */
export function startGate(
  workOrderId: string,
  options: { reservationOn: boolean; allowPartialProduction: boolean; allowStartWithLimitedStock: boolean },
): { allowed: boolean; reason?: StartBlockReason } {
  if (!options.reservationOn) return { allowed: true }
  const req = requestForWorkOrder(workOrderId)
  if (!req || req.lines.length === 0) return { allowed: true }

  const lines = req.lines
  if (lines.every(l => lineCovered(l) >= l.qty)) return { allowed: true }

  if (options.allowPartialProduction) {
    return lines.some(l => lineCovered(l) > 0)
      ? { allowed: true }
      : { allowed: false, reason: 'none-reserved' }
  }
  if (options.allowStartWithLimitedStock) {
    return lines.every(l => lineCovered(l) > 0)
      ? { allowed: true }
      : { allowed: false, reason: 'some-unreserved' }
  }
  return { allowed: false, reason: 'not-fully-reserved' }
}

/**
 * Consumption draws DOWN the reservation: producing (partial or full) moves qty
 * out of `reserved` and into `consumed`, so a line never double-counts stock that
 * has already left the rack. Returns the qty actually applied.
 */
export function applyConsumption(workOrderId: string, productId: string, qty: number): number {
  const req = requestForWorkOrder(workOrderId)
  const line = req?.lines.find(l => l.productId === productId)
  if (!req || !line || qty <= 0) return 0
  const applied = Math.min(qty, line.reserved)
  line.reserved -= applied
  line.consumed += applied
  persistStockRequests()
  return applied
}

/** Readiness of one component line — drives the Reserve modal's pill (D-5). */
export type LineReadiness = 'ready' | 'partial' | 'out-of-stock' | 'reserved'
export function lineReadiness(line: StockRequestLine): LineReadiness {
  const outstanding = line.qty - lineCovered(line)
  if (outstanding <= 0) return 'reserved'
  if (line.destAvailable >= outstanding) return 'ready'
  return line.destAvailable > 0 ? 'partial' : 'out-of-stock'
}

/**
 * D-5 — reserve the SELECTED components of a work order. Per-line all-or-nothing
 * (C-3): a line is reserved only when destination stock covers its whole
 * outstanding need, so a partially covered line stays Requested for the stockist.
 * Returns what happened, so the caller can word the toast (C-3).
 */
export function reserveWorkOrderProducts(
  workOrderId: string,
  productIds: string[],
): { reservedProducts: number; reservedQty: number; skippedProducts: number; partialProducts: number } {
  return reserveRequestProducts(requestForWorkOrder(workOrderId)?.id ?? '', productIds)
}

/**
 * Reserve selected components of ONE request, by request id. A work order can
 * carry an additional/adjustment request alongside its primary one, so anything
 * acting on a request the user is looking at must address it directly rather than
 * re-deriving "the work order's request".
 */
export function reserveRequestProducts(
  requestId: string,
  productIds: string[],
): { reservedProducts: number; reservedQty: number; skippedProducts: number; partialProducts: number } {
  const req = stockRequests.find(r => r.id === requestId)
  const result = { reservedProducts: 0, reservedQty: 0, skippedProducts: 0, partialProducts: 0 }
  if (!req) return result
  for (const productId of productIds) {
    const line = req.lines.find(l => l.productId === productId)
    if (!line) continue
    const outstanding = line.qty - lineCovered(line)
    if (outstanding <= 0) continue
    // Reserve what the warehouse can actually give. PARTIAL is allowed here: the
    // all-or-nothing rule (C-3) governs AUTO-reserve at work order creation, not a
    // stockist reserving by hand — and the start gate's "partially reserved"
    // states only exist because a line can be reserved short.
    const take = Math.min(outstanding, line.destAvailable)
    if (take <= 0) { result.skippedProducts++; continue }
    line.reserved += take
    line.destAvailable -= take
    result.reservedProducts++
    result.reservedQty += take
    if (take < outstanding) result.partialProducts++
  }
  if (result.reservedQty > 0) persistStockRequests()
  return result
}

/**
 * A material RETURN undoes consumption: qty comes back out of `consumed` and is
 * held as `reserved` again, so the line reads as it did before it was issued.
 */
export function releaseConsumption(workOrderId: string, productId: string, qty: number): number {
  const req = requestForWorkOrder(workOrderId)
  const line = req?.lines.find(l => l.productId === productId)
  if (!req || !line || qty <= 0) return 0
  const applied = Math.min(qty, line.consumed)
  line.consumed -= applied
  line.reserved += applied
  persistStockRequests()
  return applied
}

/**
 * Whether a component is batch- or serial-tracked. DERIVED from the product's
 * category, so a line knows its tracking however the request was raised — the
 * stored `tracking` field is only a hint carried over from the work order.
 */
export function lineTracking(line: StockRequestLine): 'batch' | 'serial' | undefined {
  const category = catalogProduct(line.productId)?.category ?? ''
  if (isBatchTracked(category)) return 'batch'
  if (isSerialized(category)) return 'serial'
  return undefined
}

/** The batch/serial the warehouse actually reserved, falling back to the WO's pick. */
export function reservedTracking(line: StockRequestLine): { batches: { batchNo: string; qty: number }[]; serials: string[] } {
  return {
    batches: line.reservedBatches ?? line.requestedBatches ?? [],
    serials: line.reservedSerials ?? line.requestedSerials ?? [],
  }
}

/**
 * Did PPIC reserve different units than the work order picked? The work order
 * detail surfaces this so production is never silently handed other batches.
 */
export function trackingChanged(line: StockRequestLine): boolean {
  const tracking = lineTracking(line)
  if (!tracking) return false
  if (tracking === 'serial') {
    if (!line.reservedSerials || !line.requestedSerials) return false
    const a = [...line.requestedSerials].sort().join('|')
    const b = [...line.reservedSerials].sort().join('|')
    return a !== b
  }
  if (!line.reservedBatches || !line.requestedBatches) return false
  const key = (xs: { batchNo: string; qty: number }[]) =>
    [...xs].sort((x, y) => x.batchNo.localeCompare(y.batchNo)).map(x => `${x.batchNo}:${x.qty}`).join('|')
  return key(line.requestedBatches) !== key(line.reservedBatches)
}

/** Components on this request whose batch/serial the warehouse changed. */
export function changedTrackingLines(req: StockRequest): StockRequestLine[] {
  return req.lines.filter(trackingChanged)
}

/** PPIC reserves specific batches for a component (Stock request detail). */
export function setReservedBatches(requestId: string, productId: string, batches: { batchNo: string; qty: number }[]): void {
  const line = stockRequests.find(r => r.id === requestId)?.lines.find(l => l.productId === productId)
  if (!line) return
  line.reservedBatches = batches.map(b => ({ ...b }))
  persistStockRequests()
}

/** PPIC reserves specific serial numbers for a component (Stock request detail). */
export function setReservedSerials(requestId: string, productId: string, serials: string[]): void {
  const line = stockRequests.find(r => r.id === requestId)?.lines.find(l => l.productId === productId)
  if (!line) return
  line.reservedSerials = [...serials]
  persistStockRequests()
}

/** D-6 — where the released stock goes. Mandatory on unreserve. */
export type UnreserveDisposition = 'return-to-warehouse' | 'production-defect'

/**
 * D-6 — release the FULL reserved qty of each selected component. There is no
 * partial-qty unreserve. Already-consumed qty is never released — it has left the
 * rack. Returns the released qty.
 */
export function unreserveWorkOrderProducts(
  workOrderId: string,
  productIds: string[],
  disposition: UnreserveDisposition,
): number {
  return unreserveRequestProducts(requestForWorkOrder(workOrderId)?.id ?? '', productIds, disposition)
}

/** Release the full reserved qty of selected components of ONE request, by id. */
export function unreserveRequestProducts(
  requestId: string,
  productIds: string[],
  disposition: UnreserveDisposition,
): number {
  const req = stockRequests.find(r => r.id === requestId)
  if (!req) return 0
  let released = 0
  for (const productId of productIds) {
    const line = req.lines.find(l => l.productId === productId)
    if (!line || line.reserved <= 0) continue
    released += line.reserved
    // "Return to warehouse" puts the qty back on the shelf; "production defect"
    // is charged to production cost and never re-enters available stock.
    if (disposition === 'return-to-warehouse') line.destAvailable += line.reserved
    line.reserved = 0
  }
  if (released > 0) persistStockRequests()
  return released
}

/**
 * Reserve one component across EVERY open request that needs it — the product
 * perspective's counterpart to {@link reserveWorkOrderProducts}. Per-line
 * all-or-nothing still applies, so a transaction the warehouse can't cover in
 * full is left for a transfer or a purchase.
 */
export function reserveProductEverywhere(productId: string): { transactions: number; qty: number; skipped: number } {
  const result = { transactions: 0, qty: 0, skipped: 0 }
  for (const req of stockRequests) {
    if (req.rejected) continue
    const line = req.lines.find(l => l.productId === productId)
    if (!line) continue
    const outstanding = line.qty - lineCovered(line)
    if (outstanding <= 0) continue
    if (line.destAvailable < outstanding) { result.skipped++; continue }
    line.reserved += outstanding
    line.destAvailable -= outstanding
    result.transactions++
    result.qty += outstanding
  }
  if (result.qty > 0) persistStockRequests()
  return result
}

/** The aggregated demand row for one component, across every open request. */
export function skuDemandFor(productId: string): SkuDemandGroup | undefined {
  return skuDemandGroups(stockRequests).find(g => g.productId === productId)
}

/**
 * Free stock for a component at the destination warehouse: the catalog's on-hand
 * figure less everything open requests already hold reserved against it. Derived
 * rather than stored, so two surfaces can't disagree about what is available.
 */
/**
 * Allocatable stock per (warehouse, SKU), read ONCE per warehouse.
 *
 * `getWarehouseDetail()` regenerates a warehouse's whole stock table on every
 * call, so asking it per line is quadratic on a multi-line request. Build the
 * lookup once, then read every line off it.
 */
function availabilityLookup(warehouseIds: string[]): (warehouseId: string, sku: string) => number {
  const byWarehouse = new Map<string, Map<string, number>>()
  for (const id of new Set(warehouseIds)) {
    if (!id) continue
    const stock = getWarehouseDetail(id)?.stock ?? []
    byWarehouse.set(id, new Map(stock.map(row => [row.sku, row.available])))
  }
  return (warehouseId, sku) => byWarehouse.get(warehouseId)?.get(sku) ?? 0
}

/** Qty of a component already held by open requests drawing on the same warehouse. */
function reservedAtWarehouse(productId: string, warehouseId: string): number {
  return stockRequests.reduce((sum, r) => {
    if (r.rejected) return sum
    const line = r.lines.find(l => l.productId === productId && l.destinationWarehouseId === warehouseId)
    return sum + (line?.reserved ?? 0)
  }, 0)
}

/**
 * Free stock for one component at its destination warehouse: what the warehouse
 * can allocate, less what open requests already hold there. Prefer the bulk path
 * in {@link raiseStockRequestForWorkOrder} when resolving several lines at once.
 */
export function destinationAvailableFor(productId: string, warehouseId: string): number {
  const sku = catalogProduct(productId)?.sku
  if (!sku || !warehouseId) return 0
  const lookup = availabilityLookup([warehouseId])
  return Math.max(0, lookup(warehouseId, sku) - reservedAtWarehouse(productId, warehouseId))
}

/** One component line as a work order hands it over at save time. */
export interface WorkOrderMaterialLine {
  productId: string
  product: string
  sku: string
  unit: string
  /** qty the work order needs — the BOM line */
  qty: number
  requiredDate: string
  /** where this component has to land */
  destinationWarehouse: string
  destinationWarehouseId: string
  /** batch/serial the work order picked, shared with the warehouse */
  tracking?: 'batch' | 'serial'
  requestedBatches?: { batchNo: string; qty: number }[]
  requestedSerials?: string[]
}

/**
 * C-4 — work order creation pushes a stock request carrying its component lines.
 * C-3 — under One-step, every line the destination warehouse covers IN FULL is
 * reserved straight away; a partially covered line stays Requested for the
 * stockist. Under Two-step nothing auto-reserves.
 *
 * Idempotent: a work order that already has a request keeps it, so opening an
 * older work order never raises a duplicate.
 */
export function raiseStockRequestForWorkOrder(
  input: {
    workOrderId: string
    workOrderNumber: string
    requestor: string
    requestDate: string
    lines: WorkOrderMaterialLine[]
  },
  options: { autoReserve: boolean },
): { request: StockRequest; created: boolean; reservedProducts: number; reservedQty: number; shortProducts: number } {
  const existing = requestForWorkOrder(input.workOrderId)
  if (existing) return { request: existing, created: false, reservedProducts: 0, reservedQty: 0, shortProducts: 0 }

  // One warehouse-stock read per distinct warehouse, shared by every line.
  const lookup = availabilityLookup(input.lines.map(l => l.destinationWarehouseId))

  const request: StockRequest = {
    id: `sr-wo-${input.workOrderId}`,
    number: nextRequestNumber(),
    workOrderId: input.workOrderId,
    workOrderNumber: input.workOrderNumber,
    requestDate: input.requestDate,
    requestor: input.requestor,
    lines: input.lines.map(l => ({
      ...l,
      reserved: 0,
      consumed: 0,
      destAvailable: Math.max(0,
        lookup(l.destinationWarehouseId, l.sku) - reservedAtWarehouse(l.productId, l.destinationWarehouseId)),
    })),
  }
  stockRequests.push(request)

  let reservedProducts = 0
  let reservedQty = 0
  let shortProducts = 0
  for (const line of request.lines) {
    if (line.destAvailable >= line.qty) {
      if (options.autoReserve) {
        line.reserved = line.qty
        line.destAvailable -= line.qty
        reservedProducts++
        reservedQty += line.qty
      }
    } else {
      shortProducts++
    }
  }

  persistStockRequests()
  return { request, created: true, reservedProducts, reservedQty, shortProducts }
}

// ── Prefill for the documents a shortfall leads to ─────────────────────────────

/** One line a purchase request / warehouse transfer should be prefilled with. */
export interface ShortfallLine {
  /** request this shortfall came from — for the memo on the raised document */
  requestNumber: string
  productId: string
  product: string
  sku: string
  unit: string
  /** qty missing at the destination — what has to be bought or moved in */
  qty: number
  destinationWarehouse: string
  destinationWarehouseId: string
}

function toShortfallLine(line: StockRequestLine, req: StockRequest): ShortfallLine {
  return {
    requestNumber: req.number,
    productId: line.productId,
    product: line.product,
    sku: line.sku,
    unit: line.unit,
    qty: lineToTransfer(line),
    destinationWarehouse: line.destinationWarehouse,
    destinationWarehouseId: line.destinationWarehouseId,
  }
}

/**
 * The short lines of one request — what a purchase request or transfer raised
 * from it should carry. Pass `warehouseId` to scope to a single destination
 * group, which is how a warehouse transfer is raised (one document, one
 * destination).
 */
export function shortfallLinesForRequest(requestId: string, warehouseId?: string): ShortfallLine[] {
  const req = stockRequests.find(r => r.id === requestId)
  if (!req || req.rejected) return []
  return req.lines
    .filter(l => lineToTransfer(l) > 0)
    .filter(l => !warehouseId || l.destinationWarehouseId === warehouseId)
    .map(l => toShortfallLine(l, req))
}

/**
 * The short lines for one component across every open request — the product
 * grouping's counterpart, so one document covers the whole demand. Same
 * destination warehouse merges into a single line.
 */
export function shortfallLinesForProduct(productId: string): ShortfallLine[] {
  const byWarehouse = new Map<string, ShortfallLine>()
  for (const req of stockRequests) {
    if (req.rejected) continue
    for (const line of req.lines) {
      if (line.productId !== productId || lineToTransfer(line) <= 0) continue
      const key = line.destinationWarehouseId || line.destinationWarehouse
      const existing = byWarehouse.get(key)
      if (existing) existing.qty += lineToTransfer(line)
      else byWarehouse.set(key, toShortfallLine(line, req))
    }
  }
  return [...byWarehouse.values()]
}
