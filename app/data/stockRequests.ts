import { reactive } from 'vue'
import { STAFF, shiftDays, TODAY_ISO } from './master'
import { workOrders, type WorkOrder, type WorkOrderStatus } from './workOrders'
import { billOfMaterials, catalogProduct } from './billOfMaterials'
import { getWarehouseDetail, isBatchTracked, isSerialized } from './warehouseDetails'
import { loadSnapshot, saveSnapshot } from './persist'
import type { PartialMode } from './productionSettings'

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
   * Who last CHANGED this line's demand — by creating the work order, editing this
   * line, or raising it through Adjust (v0.5 OPEN-17). Held per line, not per
   * request, because a request accumulates changes from several people.
   *
   * Reserving against a line does NOT change it: the requestor is whoever asked
   * for the material, not whoever found it.
   */
  requestor: string
  /**
   * W-7 — a line raised on top of the work order's original demand. Tagged lines
   * are the only ones the stockist may reject; an untagged line is demand the work
   * order itself committed to, so refusing it is not the warehouse's call.
   */
  tag?: StockRequestLineTag
  /** Declined by the stockist. Only ever set on a tagged line (W-7). */
  rejected?: boolean
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

/**
 * W-7 line tags — demand raised on top of the work order's original components.
 * A property of the LINE, not the request: an increase usually applies to only
 * some components, and the stockist may reject one without touching the rest.
 */
export type StockRequestLineTag = 'additional' | 'adjustment'

/**
 * The demand one transaction places on the warehouse.
 *
 * A work order raises EXACTLY ONE request, for its whole life (v0.5 C-4). Later
 * changes — an Adjust increase, an Additional stock request — append LINES to it;
 * they never raise a second request. That is why a product can legitimately appear
 * on more than one line here: an original line plus one or more tagged lines, each
 * with its own required date and its own rejectability.
 *
 * The request is a record of DEMAND, not of allocation: reserving against it moves
 * its status but never closes it. Status, readiness, overdue, remaining and
 * to-transfer are all derived — never stored — so they cannot drift apart.
 */
export interface StockRequest {
  id: string
  /** Human-facing request number, e.g. SR-2026-0007 — the request's own identity. */
  number: string
  /** Work order this request was raised from — a reference, not its identity. */
  workOrderId: string
  /** Denormalized work order number (e.g. WO-2026-0004) for display + search. */
  workOrderNumber: string
  /** ISO date the request was raised. */
  requestDate: string
  lines: StockRequestLine[]
}

/**
 * Material readiness (PRD v0.5 W-3). `requested` replaces the older "To reserve"
 * wording — the PRD's status filter uses "Requested" (W-5).
 *
 * The first three describe reservation PROGRESS and a line moves through them in
 * order; the last three are TERMINAL. That ordering is what `stockRequestStatus`
 * means by "the lowest status among its lines".
 */
export type StockRequestStatus =
  | 'requested'
  | 'partially reserved'
  | 'reserved'
  | 'issued / picked'
  | 'rejected'
  | 'canceled'

/**
 * Rank for "lowest status wins" (W-3). A request is only as good as its weakest
 * line: one untouched component means the warehouse still has work to do, however
 * complete the rest is.
 *
 * `canceled` outranks everything because it is decided by the work order, not by
 * reservation progress — a cancelled job's lines are moot whatever their qty says.
 */
const STATUS_RANK: Record<StockRequestStatus, number> = {
  'requested': 0,
  'partially reserved': 1,
  'rejected': 2,
  'reserved': 3,
  'issued / picked': 4,
  'canceled': 5,
}

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

/**
 * One line's status (W-3) — derived, never stored.
 *
 * `canceled` is passed in rather than read here because it is a property of the
 * raising work order, not of the line; see {@link stockRequestStatus}.
 */
export function stockRequestLineStatus(line: StockRequestLine): StockRequestStatus {
  if (line.rejected) return 'rejected'
  if (line.consumed >= line.qty && line.qty > 0) return 'issued / picked'
  const covered = lineCovered(line)
  if (covered === 0) return 'requested'
  return covered < line.qty ? 'partially reserved' : 'reserved'
}

/**
 * The request's badge — **the lowest status among its lines** (v0.5 W-3).
 *
 * This replaces v0.4's qty-weighted derivation, which could call a request
 * "partially reserved" when one line was untouched and another over-covered. Status
 * is about whether the warehouse still has work to do, and qty totals hide that.
 *
 * A cancelled or deleted work order makes the whole request Canceled (UC-09); its
 * lines keep their own figures so the record still reads truthfully.
 */
export function stockRequestStatus(req: StockRequest): StockRequestStatus {
  if (workOrderFor(req)?.status === 'canceled') return 'canceled'
  if (req.lines.length === 0) return 'requested'
  return req.lines
    .map(stockRequestLineStatus)
    .reduce((lowest, s) => (STATUS_RANK[s] < STATUS_RANK[lowest] ? s : lowest))
}

/**
 * W-7 — a request is overdue when a component's required date has passed and that
 * line still isn't fully covered. Derived, never stored, so it can't contradict
 * the status badge beside it (a fully reserved request is never overdue).
 */
export function isOverdue(req: StockRequest, today: string): boolean {
  return req.lines.some(l => isLineOverdue(l, today))
}

/** W-7 per line — a rejected line is settled, so it is never overdue. */
export function isLineOverdue(line: StockRequestLine, today: string): boolean {
  if (line.rejected) return false
  return line.requiredDate < today && lineCovered(line) < line.qty
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
  return req.lines.some(l => !l.rejected && lineCovered(l) < l.qty)
}

/** Status options for the quick filter / All-filters drawer — no "All …" entry (W-5). */
export const stockRequestStatusOptions: { value: StockRequestStatus; label: string }[] = [
  { value: 'requested',          label: 'Requested'          },
  { value: 'partially reserved', label: 'Partially reserved' },
  { value: 'reserved',           label: 'Reserved'           },
  { value: 'issued / picked',    label: 'Issued / picked'    },
  { value: 'rejected',           label: 'Rejected'           },
  { value: 'canceled',           label: 'Canceled'           },
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
type SeedLine = {
  reservedPct: number
  consumedPct: number
  destAvailable: number
  requiredOffset: number
  /** W-7 — demand raised on top of the work order's original components. */
  tag?: StockRequestLineTag
  /** Declined by the stockist. Only legal on a tagged line. */
  rejected?: boolean
  /** Who last changed this line's demand; defaults to the request's raiser. */
  staffIndex?: number
  /**
   * Which of the work order's raw materials this line is for. Defaults to the
   * line's own position, so a plain request reads one line per component. A TAGGED
   * line points back at a component that already has a line, which is exactly the
   * case v0.5 introduces: an original line plus its Adjustment delta, same product,
   * different required dates, separately rejectable.
   */
  rawIndex?: number
}
type Seed = {
  woIndex: number
  dayOffset: number
  /** Who created the work order — the requestor of every untagged line. */
  staffIndex: number
  lines: SeedLine[]
}

/** Destination warehouses used by the seed — real names from the warehouse master. */
const SEED_WAREHOUSES = [
  { id: 'wh-001', name: 'Gudang Jakarta Pusat' },
  { id: 'wh-002', name: 'Gudang Surabaya Timur' },
  { id: 'wh-003', name: 'Gudang Bandung Selatan' },
]

/**
 * ONE request per work order (v0.5 C-4) — extra demand is extra LINES, never a
 * second request. The seed for WO index 3 is the worked case: an original line, an
 * Additional stock line and a rejected Adjustment line, all for the same component.
 */
const SEED: Seed[] = [
  // Nothing reserved yet, but warehouse stock covers every line — "Reserve stock"
  // on this row succeeds, which is the happy path the demo needs.
  { woIndex: 4, dayOffset: -2, staffIndex: 0, lines: [
    { reservedPct: 0, consumedPct: 0, destAvailable: 8, requiredOffset: 6 },
    { reservedPct: 0, consumedPct: 0, destAvailable: 6, requiredOffset: 9 },
    { reservedPct: 0, consumedPct: 0, destAvailable: 4, requiredOffset: 9 },
  ] },
  // One request carrying all three line kinds for the SAME component (W-7):
  // the original demand, an Additional stock line, and an Adjustment line the
  // stockist declined. Their requestors differ — each line names whoever last
  // changed it, which is the point of holding requestor per line (OPEN-17).
  { woIndex: 3, dayOffset: -5, staffIndex: 1, lines: [
    { reservedPct: 0, consumedPct: 0, destAvailable: 1, requiredOffset: 3 },
    { reservedPct: 0, consumedPct: 0, destAvailable: 0, requiredOffset: 3 },
    { reservedPct: 0, consumedPct: 0, destAvailable: 2, requiredOffset: 6, rawIndex: 0, tag: 'additional',  staffIndex: 5 },
    { reservedPct: 0, consumedPct: 0, destAvailable: 2, requiredOffset: 8, rawIndex: 0, tag: 'adjustment', staffIndex: 5, rejected: true },
  ] },
  // Fully reserved.
  { woIndex: 2, dayOffset: -8, staffIndex: 2, lines: [
    { reservedPct: 1, consumedPct: 0, destAvailable: 5, requiredOffset: 1 },
    { reservedPct: 1, consumedPct: 0, destAvailable: 4, requiredOffset: 1 },
  ] },
  // Partially reserved and past its required date → overdue (W-7).
  { woIndex: 1, dayOffset: -11, staffIndex: 3, lines: [
    { reservedPct: 1,   consumedPct: 0, destAvailable: 6, requiredOffset: -3 },
    { reservedPct: 0.5, consumedPct: 0, destAvailable: 1, requiredOffset: -3 },
    { reservedPct: 0,   consumedPct: 0, destAvailable: 0, requiredOffset: -1 },
  ] },
  // Fully reserved. `consumed` is deliberately left at 0 on every seed: on a
  // work-order request, consumption is recorded through the work order's own
  // Material consume & return flow, and seeding it here would make the readiness
  // badge claim "Issued / picked" while the work order still shows 0 consumed.
  { woIndex: 0, dayOffset: -14, staffIndex: 4, lines: [
    { reservedPct: 1, consumedPct: 0, destAvailable: 9, requiredOffset: -6 },
    { reservedPct: 1, consumedPct: 0, destAvailable: 7, requiredOffset: -6 },
  ] },
]

function buildSeed(): StockRequest[] {
  return SEED.map((s, i) => {
    const wo = workOrders[s.woIndex]
    const bom = billOfMaterials.find(b => b.id === wo?.bomId)
    // De-duplicate the BOM so each COMPONENT gets one original line; tagged lines
    // then point back at one of them by `rawIndex`.
    const raws = [...new Map((bom?.rawMaterials ?? []).map(r => [r.productId, r])).values()]
    const requestDate = shiftDays(TODAY_ISO, s.dayOffset)
    // A seed may describe more lines than its work order's BOM actually has
    // components; those have nothing real to point at, so they are dropped rather
    // than rendered as a placeholder "Raw material" row.
    const lines: StockRequestLine[] = s.lines.flatMap((sl, li) => {
      const ri = sl.rawIndex ?? li
      const raw = raws[ri]
      if (!raw) return []
      const product = catalogProduct(raw.productId)
      // The qty a request asks for is exactly the qty the work order's Raw
      // materials table calls "Needed qty" — the BOM line. Scaling it here would
      // make the two surfaces disagree about the same number. A tagged line
      // carries only its DELTA, so it asks for a fraction of that.
      const base = raw.needed
      const qty = sl.tag ? Math.max(1, Math.round(base * 0.2)) : base
      const consumed = Math.round(qty * sl.consumedPct)
      // A tagged line shares its component's destination, so the detail page still
      // groups all three under one warehouse and one transfer.
      const wh = SEED_WAREHOUSES[ri % SEED_WAREHOUSES.length]!
      return [{
        productId: raw.productId,
        product: product?.name ?? 'Raw material',
        sku: product?.sku ?? '—',
        unit: raw.unit || product?.unit || 'Unit',
        qty,
        reserved: Math.max(Math.round(qty * sl.reservedPct), consumed),
        consumed,
        requiredDate: shiftDays(requestDate, sl.requiredOffset),
        destAvailable: sl.destAvailable,
        destinationWarehouse: wh.name,
        destinationWarehouseId: wh.id,
        requestor: STAFF[sl.staffIndex ?? s.staffIndex] ?? STAFF[0]!,
        ...(sl.tag ? { tag: sl.tag } : {}),
        ...(sl.rejected ? { rejected: true } : {}),
      }]
    })
    return {
      id: `sr-${i + 1}`,
      workOrderId: wo?.id ?? `wo-${s.woIndex + 1}`,
      workOrderNumber: wo?.number ?? `WO-2026-${String(s.woIndex + 1).padStart(4, '0')}`,
      requestDate,
      number: `SR-2026-${String(i + 1).padStart(4, '0')}`,
      lines,
    }
  })
}

/**
 * Snapshot key is VERSIONED. PRD v0.5 moved requestor, tag and rejection onto the
 * line and collapsed a work order's several requests into one, so a snapshot
 * written by an earlier build cannot be read as a v0.5 request: its lines have no
 * requestor at all, and its extra requests would come back as duplicates. The
 * seed is deterministic demo data, so dropping the stale snapshot costs nothing
 * and is honest — reconstructing it would be guesswork presented as history.
 */
const SNAPSHOT_KEY = 'stockRequests.v2'

const snapshot = loadSnapshot<StockRequest>(SNAPSHOT_KEY)
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
  saveSnapshot(SNAPSHOT_KEY, stockRequests)
}

/**
 * Which work-order statuses reach the dashboard (PRD INV — Stock Request
 * Dashboard, story 2):
 *  • the four ACTIVE statuses are the **Requested** tab;
 *  • **Done** (completed) still shows, on **All**, but offers no further action;
 *  • **Canceled / deleted** never show.
 */
const ACTIVE_WO_STATUSES = new Set<WorkOrderStatus>([
  'not started', 'in progress', 'partially produced', 'partially completed',
])

/** The work order behind a request, if it still exists. */
export function workOrderFor(req: StockRequest): WorkOrder | undefined {
  return workOrders.find(w => w.id === req.workOrderId)
}

/**
 * Every request stays listed, including a cancelled work order's (v0.5 UC-09 /
 * W-3): it shows with status **Canceled** rather than vanishing. A request that
 * disappears looks like a request that was never raised, which is precisely the
 * "orphaned stock artifact" this feature exists to stop.
 *
 * (This reverses the earlier INV-draft behaviour, where a canceled work order took
 * its request off the dashboard entirely.)
 */
export function isOnDashboard(_req: StockRequest): boolean {
  return true
}

/** A Done or canceled work order is read-only — no reserve / transfer / purchase. */
export function isActionable(req: StockRequest): boolean {
  const wo = workOrderFor(req)
  return !wo || ACTIVE_WO_STATUSES.has(wo.status)
}

/** The **Requested** tab: work orders still in an active status. */
export function isRequestedTab(req: StockRequest): boolean {
  return isOnDashboard(req) && isActionable(req)
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
  /** Who last changed THIS line's demand (OPEN-17) — per line, not per request. */
  requestor: string
  /** W-7 tag, when this entry is Additional stock or an Adjustment delta. */
  tag?: StockRequestLineTag
  /** Declined by the stockist (W-7) — only ever true on a tagged entry. */
  rejected?: boolean
  qty: number
  covered: number
  requiredDate: string
  destAvailable: number
  status: StockRequestStatus
}

/** One aggregated component row — same SKU summed across every open work order. */
export interface SkuDemandGroup {
  /** unique key — one row per SKU **per destination warehouse** (story 2) */
  key: string
  productId: string
  product: string
  sku: string
  unit: string
  /** the destination warehouse this row's demand is for */
  destinationWarehouse: string
  destinationWarehouseId: string
  entries: SkuDemandEntry[]
  /** number of open work orders needing this component */
  openWorkOrders: number
  /** earliest required date across the entries */
  earliestRequired: string
  /** latest required date — SKU status follows this within the filtered range (W-5) */
  latestRequired: string
  required: number
  reserved: number
  /** qty already issued to the floor — counts as covered (W-2) */
  consumed: number
  /** W-2 — Required − Reserved − Consumed */
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
  // One bucket per SKU + destination warehouse: the same component wanted at two
  // warehouses is two different pieces of demand, fulfilled by two transfers.
  const byProduct = new Map<string, { line: StockRequestLine; req: StockRequest }[]>()
  for (const req of requests) {
    const canceled = workOrderFor(req)?.status === 'canceled'
    for (const line of req.lines) {
      // Rejected lines and a cancelled job's lines are settled — their demand no
      // longer stands, so they must not inflate the rollup. This is now per LINE:
      // rejecting an Adjustment delta leaves the original demand counted.
      if (line.rejected || canceled) continue
      if (lineFilter && !lineFilter(line, req)) continue
      const key = `${line.productId}::${line.destinationWarehouseId}`
      const bucket = byProduct.get(key) ?? []
      bucket.push({ line, req })
      byProduct.set(key, bucket)
    }
  }

  return [...byProduct.values()].map((bucket) => {
    const first = bucket[0]!.line
    const entries: SkuDemandEntry[] = bucket.map(({ line, req }) => ({
      requestId: req.id,
      workOrderId: req.workOrderId,
      workOrderNumber: req.workOrderNumber,
      requestor: line.requestor,
      ...(line.tag ? { tag: line.tag } : {}),
      ...(line.rejected ? { rejected: true } : {}),
      qty: line.qty,
      covered: lineCovered(line),
      requiredDate: line.requiredDate,
      destAvailable: line.destAvailable,
      status: stockRequestLineStatus(line),
    }))
    const required = entries.reduce((s, e) => s + e.qty, 0)
    const reserved = bucket.reduce((s, { line }) => s + line.reserved, 0)
    const consumed = bucket.reduce((s, { line }) => s + line.consumed, 0)
    const backdate = backdateRecalc[first.productId]
    // One warehouse stock figure per SKU — the largest destination availability
    // seen on its lines, then the backdated recalculation applied on top (W-6).
    const available = Math.max(0, ...entries.map(e => e.destAvailable)) + (backdate?.delta ?? 0)
    // W-2 — Remaining = Required − Reserved − Consumed. Consumption draws the
    // reservation down, so issued qty still counts as covered; without it a partly
    // consumed line would read as under-reserved and reappear as open demand.
    const remaining = Math.max(0, required - reserved - consumed)
    const dates = entries.map(e => e.requiredDate).sort()
    return {
      key: `${first.productId}::${first.destinationWarehouseId}`,
      productId: first.productId,
      product: first.product,
      sku: first.sku,
      unit: first.unit,
      destinationWarehouse: first.destinationWarehouse,
      destinationWarehouseId: first.destinationWarehouseId,
      entries,
      openWorkOrders: new Set(entries.map(e => e.workOrderId)).size,
      earliestRequired: dates[0]!,
      latestRequired: dates[dates.length - 1]!,
      required,
      reserved,
      consumed,
      remaining,
      available,
      // Lowest status among the lines behind this row, same rule as a request (W-3).
      status: entries
        .map(e => e.status)
        .reduce((lowest, st) => (STATUS_RANK[st] < STATUS_RANK[lowest] ? st : lowest), 'issued / picked' as StockRequestStatus),
      ...(backdate ? { backdate } : {}),
      // Fully covered — not merely "enough stock exists" (see needsAction).
      sufficient: remaining === 0,
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
  if (!req) return undefined
  let reserved = 0
  for (const line of req.lines) {
    if (line.rejected) continue
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

/**
 * Reject ONE line (W-7) — production is notified.
 *
 * Rejection is a line-level decision. The stockist may decline extra demand raised
 * on top of a work order without touching what the work order itself committed to,
 * which is why only a tagged line can be rejected — and why the guard lives here
 * rather than only in the UI that offers the button.
 */
export function rejectRequestLine(requestId: string, line: StockRequestLine): boolean {
  const req = stockRequests.find(r => r.id === requestId)
  if (!req || !canRejectLine(line)) return false
  line.rejected = true
  persistStockRequests()
  return true
}

/** Only a tagged line can be rejected, and only once (W-7). */
export function canRejectLine(line: StockRequestLine): boolean {
  return !!line.tag && !line.rejected
}

/** Does this request carry anything the stockist may still decline? */
export function canReject(req: StockRequest): boolean {
  return req.lines.some(canRejectLine)
}

// ── Work order side (UC-01 … UC-04) ────────────────────────────────────────────
// The work order pages and this dashboard read the SAME request rows, so a
// reservation made on either surface is immediately true on the other.

/**
 * The stock request raised by a work order (C-4). There is exactly one, for the
 * work order's whole life — extra demand appends lines to it rather than raising
 * a second request, so this never has to pick between candidates.
 */
export function requestForWorkOrder(workOrderId: string): StockRequest | undefined {
  return stockRequests.find(r => r.workOrderId === workOrderId)
}

/**
 * Every line for one component on one request.
 *
 * A component can hold more than one line — the original demand plus any
 * Adjustment deltas (UC-06) — so anything that acts "on a product" acts on this
 * list, never on the first match. Rejected lines are excluded: their demand has
 * been declined, so there is nothing left to reserve, consume or release.
 */
export function linesForProduct(req: StockRequest, productId: string): StockRequestLine[] {
  return req.lines.filter(l => l.productId === productId && !l.rejected)
}

/**
 * The order to DRAW DOWN a component's lines: original demand first, Adjustment
 * deltas after.
 *
 * Used by consumption and release. Material issued to the floor satisfies what the
 * work order originally committed to before it satisfies a later top-up, so the
 * original line is the one that closes first.
 *
 * Note this is the OPPOSITE of {@link reductionOrder}. The two are deliberately
 * separate functions so the asymmetry is visible at each call site.
 */
function drawdownOrder(lines: StockRequestLine[]): StockRequestLine[] {
  return [...lines].sort((a, b) => Number(!!a.tag) - Number(!!b.tag))
}

/**
 * The order to REDUCE a component's lines when demand falls: Adjustment deltas
 * first, original demand last (UC-06).
 *
 * Cutting a quantity should release the most recently added extra before it
 * touches demand the work order committed to at creation — and a stockist may
 * still reject an Adjustment line, so draining it first keeps the original intact.
 */
function reductionOrder(lines: StockRequestLine[]): StockRequestLine[] {
  return [...lines].sort((a, b) => Number(!!b.tag) - Number(!!a.tag))
}

/** How much of a component this work order has reserved (reserved + already issued). */
export function reservedForWorkOrder(workOrderId: string, productId: string): number {
  const req = requestForWorkOrder(workOrderId)
  if (!req) return 0
  return linesForProduct(req, productId).reduce((s, l) => s + lineCovered(l), 0)
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
 * The start gate — PRD v0.5 UC-04 / D-8.
 *
 * S-4 ("can start with limited stock") decides whether the gate relaxes at all;
 * the partial mode (S-3) decides HOW:
 *
 * | S-4 | partialMode  | Start permitted when                        |
 * | --- | ------------ | ------------------------------------------- |
 * | off | any          | every component is fully reserved            |
 * | on  | `consume`    | AT LEAST ONE component is reserved > 0       |
 * | on  | `completion` | EVERY component is reserved > 0              |
 * | on  | `none`       | every component is fully reserved            |
 *
 * The two rules protect different things. Partial consume lets work proceed with
 * whatever has arrived, so one secured component is enough to begin. Partial
 * completion posts output in tranches, and even one finished unit needs a complete
 * set of components — fabric without buttons produces nothing — so every line must
 * hold something.
 *
 * This counts RESERVATION, never availability: stock sitting free in the warehouse
 * does not open the gate, because nobody has allocated it to this job yet.
 *
 * Reservation is always on (L-12), so unlike v0.4 there is no "reservation off"
 * escape — a work order with no request at all has nothing to gate and passes.
 */
export function startGate(
  workOrderId: string,
  options: { partialMode: PartialMode; allowStartWithLimitedStock: boolean },
): { allowed: boolean; reason?: StartBlockReason } {
  const req = requestForWorkOrder(workOrderId)
  if (!req || req.lines.length === 0) return { allowed: true }

  const lines = req.lines
  if (lines.every(l => lineCovered(l) >= l.qty)) return { allowed: true }

  if (!options.allowStartWithLimitedStock) return { allowed: false, reason: 'not-fully-reserved' }

  switch (options.partialMode) {
    case 'consume':
      return lines.some(l => lineCovered(l) > 0)
        ? { allowed: true }
        : { allowed: false, reason: 'none-reserved' }
    case 'completion':
      return lines.every(l => lineCovered(l) > 0)
        ? { allowed: true }
        : { allowed: false, reason: 'some-unreserved' }
    default:
      // S-4 on but neither partial mode — S-4 has no effect (UC-04, row 4).
      return { allowed: false, reason: 'not-fully-reserved' }
  }
}

/**
 * Consumption draws DOWN the reservation: producing (partial or full) moves qty
 * out of `reserved` and into `consumed`, so a line never double-counts stock that
 * has already left the rack. Returns the qty actually applied.
 */
export function applyConsumption(workOrderId: string, productId: string, qty: number): number {
  const req = requestForWorkOrder(workOrderId)
  if (!req || qty <= 0) return 0
  let left = qty
  let applied = 0
  // Original line first, then Adjustment deltas — see `drawdownOrder`.
  for (const line of drawdownOrder(linesForProduct(req, productId))) {
    if (left <= 0) break
    const take = Math.min(left, line.reserved)
    if (take <= 0) continue
    line.reserved -= take
    line.consumed += take
    left -= take
    applied += take
  }
  if (applied > 0) persistStockRequests()
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
    const lines = linesForProduct(req, productId)
    if (lines.length === 0) continue
    let productQty = 0
    let productShort = false
    // Original demand before Adjustment deltas: scarce stock should settle what the
    // work order committed to first.
    for (const line of drawdownOrder(lines)) {
      const outstanding = line.qty - lineCovered(line)
      if (outstanding <= 0) continue
      // Reserve what the warehouse can actually give. PARTIAL is allowed here: the
      // all-or-nothing rule (C-3) governs AUTO-reserve at work order creation, not a
      // stockist reserving by hand — and the start gate's "partially reserved"
      // states only exist because a line can be reserved short.
      const take = Math.min(outstanding, line.destAvailable)
      if (take <= 0) { productShort = true; continue }
      line.reserved += take
      line.destAvailable -= take
      productQty += take
      if (take < outstanding) productShort = true
    }
    if (productQty === 0) { result.skippedProducts++; continue }
    result.reservedProducts++
    result.reservedQty += productQty
    if (productShort) result.partialProducts++
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
  if (!req || qty <= 0) return 0
  let left = qty
  let applied = 0
  // Undo consumption in the reverse of the order it was applied — the last line to
  // be drawn down is the first to be given back, so a return leaves the lines the
  // way they were before the issue.
  for (const line of drawdownOrder(linesForProduct(req, productId)).reverse()) {
    if (left <= 0) break
    const take = Math.min(left, line.consumed)
    if (take <= 0) continue
    line.consumed -= take
    line.reserved += take
    left -= take
    applied += take
  }
  if (applied > 0) persistStockRequests()
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

/**
 * PPIC reserves specific batches for a component (Stock request detail).
 *
 * Applied to the component's ORIGINAL line: the batch picker reserves against the
 * demand the work order raised, and an Adjustment delta carries its own pick.
 */
export function setReservedBatches(requestId: string, productId: string, batches: { batchNo: string; qty: number }[]): void {
  const req = stockRequests.find(r => r.id === requestId)
  const line = req && drawdownOrder(linesForProduct(req, productId))[0]
  if (!line) return
  line.reservedBatches = batches.map(b => ({ ...b }))
  persistStockRequests()
}

/** PPIC reserves specific serial numbers for a component (Stock request detail). */
export function setReservedSerials(requestId: string, productId: string, serials: string[]): void {
  const req = stockRequests.find(r => r.id === requestId)
  const line = req && drawdownOrder(linesForProduct(req, productId))[0]
  if (!line) return
  line.reservedSerials = [...serials]
  persistStockRequests()
}

/** D-6 — where the released stock goes. Mandatory on unreserve. */
export type UnreserveDisposition = 'return-to-warehouse' | 'production-defect'

/**
 * UC-15 R-1 — what caused a release. All three write the SAME transition, which is
 * why they share one function: a release logged differently depending on how it
 * happened is a release nobody can reconcile against the stock ledger.
 */
export type ReleaseTrigger = 'unreserve' | 'completion' | 'cancellation'

/** What one release did, per component — enough to word the toast and the log. */
export interface ReleaseResult {
  qty: number
  products: { productId: string; product: string; qty: number }[]
}

/**
 * UC-15 — the Reserved → Available transition, in one place.
 *
 * Moves quantity between buckets and never moves stock physically: On Hand =
 * Available + Reserved holds before and after. Already-consumed qty is NEVER
 * released — it has left the rack and comes back, if at all, through a material
 * return (UC-08).
 *
 * Releases each line's FULL remaining reserved qty and never part of it (R-8):
 * components are selected individually, quantities are not.
 *
 * `disposition` applies to the manual trigger only. "Production defect" is charged
 * to production cost and never re-enters available stock, so the qty leaves
 * `reserved` without arriving anywhere else; the two automatic triggers always
 * return the stock to the warehouse.
 */
export function releaseReservation(
  requestId: string,
  productIds: string[],
  disposition: UnreserveDisposition = 'return-to-warehouse',
): ReleaseResult {
  const result: ReleaseResult = { qty: 0, products: [] }
  const req = stockRequests.find(r => r.id === requestId)
  if (!req) return result
  for (const productId of productIds) {
    let productQty = 0
    let name = ''
    for (const line of linesForProduct(req, productId)) {
      if (line.reserved <= 0) continue
      productQty += line.reserved
      name = line.product
      if (disposition === 'return-to-warehouse') line.destAvailable += line.reserved
      line.reserved = 0
    }
    if (productQty <= 0) continue
    result.qty += productQty
    result.products.push({ productId, product: name, qty: productQty })
  }
  if (result.qty > 0) persistStockRequests()
  return result
}

/** Every component on a request that still holds a reservation. */
export function reservedProductIds(req: StockRequest): string[] {
  return [...new Set(req.lines.filter(l => l.reserved > 0).map(l => l.productId))]
}

/**
 * UC-15 trigger (b) — a work order is cancelled or deleted. Its whole remaining
 * reservation goes back to available; no disposition is asked for, because the
 * cancellation reason already carries the context (R-2).
 */
export function releaseForCanceledWorkOrder(workOrderId: string): ReleaseResult {
  const req = requestForWorkOrder(workOrderId)
  if (!req) return { qty: 0, products: [] }
  return releaseReservation(req.id, reservedProductIds(req))
}

/**
 * UC-15 trigger (a) — a work order COMPLETES with reserved qty above consumed.
 * Automatic and unapproved (R-2, R-3): holding a job's last step for a decision
 * nobody is making just strands the stock.
 *
 * Only on FULL completion. On a partial completion the remaining reserve stays
 * reserved, because the job still intends to use it.
 */
export function releaseOnCompletion(workOrderId: string): ReleaseResult {
  const req = requestForWorkOrder(workOrderId)
  if (!req) return { qty: 0, products: [] }
  return releaseReservation(req.id, reservedProductIds(req))
}

/**
 * D-6 — release the FULL reserved qty of each selected component. There is no
 * partial-qty unreserve. Returns the released qty.
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
  return releaseReservation(requestId, productIds, disposition).qty
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
    let touched = false
    // A product can hold SEVERAL lines on one request now (original + Adjustment),
    // so this reserves each of them rather than the first one found — but still
    // counts the request once, because the row the user clicked is a transaction.
    for (const line of req.lines.filter(l => l.productId === productId && !l.rejected)) {
      const outstanding = line.qty - lineCovered(line)
      if (outstanding <= 0) continue
      if (line.destAvailable < outstanding) { result.skipped++; continue }
      line.reserved += outstanding
      line.destAvailable -= outstanding
      result.qty += outstanding
      touched = true
    }
    if (touched) result.transactions++
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
  return stockRequests.reduce((sum, r) => sum + r.lines.reduce((s, l) => (
    l.productId === productId && l.destinationWarehouseId === warehouseId && !l.rejected
      ? s + l.reserved
      : s
  ), 0), 0)
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

  const request: StockRequest = {
    id: `sr-wo-${input.workOrderId}`,
    number: nextRequestNumber(),
    workOrderId: input.workOrderId,
    workOrderNumber: input.workOrderNumber,
    requestDate: input.requestDate,
    lines: buildLines(input.lines, input.requestor),
  }
  stockRequests.push(request)

  const { reservedProducts, reservedQty, shortProducts } = settleLines(request.lines, options.autoReserve)
  persistStockRequests()
  return { request, created: true, reservedProducts, reservedQty, shortProducts }
}

/**
 * Append demand to a work order's EXISTING request (v0.5 C-4) — an Adjust
 * increase, a new component, or an Additional stock request.
 *
 * A transaction never holds more than one request, so extra demand is extra LINES.
 * Each carries its own required date and its own requestor, and a tagged line is
 * separately rejectable — which is exactly why the delta cannot simply be added to
 * the original line's qty (UC-06).
 */
export function appendStockRequestLines(
  workOrderId: string,
  lines: WorkOrderMaterialLine[],
  requestor: string,
  tag: StockRequestLineTag,
  options: { autoReserve: boolean },
): { request: StockRequest; reservedProducts: number; reservedQty: number; shortProducts: number } | undefined {
  const request = requestForWorkOrder(workOrderId)
  if (!request || lines.length === 0) return undefined
  const added = buildLines(lines, requestor).map(l => ({ ...l, tag }))
  request.lines.push(...added)
  const settled = settleLines(added, options.autoReserve)
  persistStockRequests()
  return { request, ...settled }
}

/** Turn the work order's hand-off lines into request lines with live availability. */
function buildLines(lines: WorkOrderMaterialLine[], requestor: string): StockRequestLine[] {
  // One warehouse-stock read per distinct warehouse, shared by every line.
  const lookup = availabilityLookup(lines.map(l => l.destinationWarehouseId))
  return lines.map(l => ({
    ...l,
    reserved: 0,
    consumed: 0,
    requestor,
    destAvailable: Math.max(0,
      lookup(l.destinationWarehouseId, l.sku) - reservedAtWarehouse(l.productId, l.destinationWarehouseId)),
  }))
}

/** C-3 — auto-reserve the lines the destination covers IN FULL; leave the rest. */
function settleLines(lines: StockRequestLine[], autoReserve: boolean) {
  let reservedProducts = 0
  let reservedQty = 0
  let shortProducts = 0
  for (const line of lines) {
    if (line.destAvailable >= line.qty) {
      if (autoReserve) {
        line.reserved = line.qty
        line.destAvailable -= line.qty
        reservedProducts++
        reservedQty += line.qty
      }
    } else {
      shortProducts++
    }
  }
  return { reservedProducts, reservedQty, shortProducts }
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
  if (!req) return []
  return req.lines
    .filter(l => !l.rejected && lineToTransfer(l) > 0)
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
    for (const line of req.lines) {
      if (line.rejected) continue
      if (line.productId !== productId || lineToTransfer(line) <= 0) continue
      const key = line.destinationWarehouseId || line.destinationWarehouse
      const existing = byWarehouse.get(key)
      if (existing) existing.qty += lineToTransfer(line)
      else byWarehouse.set(key, toShortfallLine(line, req))
    }
  }
  return [...byWarehouse.values()]
}

// ── UC-06 — WO Edit & Adjust (change management) ────────────────────────────────
// How a demand change reaches the stock request depends on the work order's phase.
// EDIT (Not started) updates the line in place; ADJUST (In progress) keeps the
// delta on its own tagged line. The split is not decoration: a delta raised
// mid-run has its own required date, which one line cannot carry alongside the
// original's, and the stockist may reject the delta (W-7) without rejecting the
// original demand, which the work order has already committed to. Merging them
// would lose both.

/** One component's new state, as an Edit or Adjust hands it over. */
export interface DemandChange {
  productId: string
  /** the component's TOTAL new qty across all its lines — not a delta */
  qty: number
  /** required date; on an Adjust increase this becomes the new line's own date */
  requiredDate: string
}

/** What a change did — enough to word the toast and the log entry. */
export interface DemandChangeResult {
  increased: { productId: string; product: string; delta: number }[]
  decreased: { productId: string; product: string; delta: number }[]
  /** components whose reservation had to be released to make the cut (R-4) */
  released: ReleaseResult
}

/**
 * UC-06 — apply demand changes to a work order's request.
 *
 * `phase` decides how an INCREASE lands:
 *  • `edit` (Not started) — the existing line's qty is raised in place.
 *  • `adjust` (In progress) — a NEW line tagged Adjustment carries only the delta,
 *    with its own required date; the original line is left untouched.
 *
 * A DECREASE always reduces in place, taking from the Adjustment line FIRST and
 * the original last (`reductionOrder`), so the most recent extra demand is given
 * up before anything the work order originally committed to.
 *
 * Cutting below what is already reserved releases that component's FULL remaining
 * reservation first (R-4, R-8) — unreserve is never partial — and the updated line
 * then goes back to the request in the same save, to be reserved again by whatever
 * the reservation method is (C-3 under One-step, PPIC under Two-step). Callers
 * must therefore treat a decrease as possibly releasing stock, and log it.
 *
 * Either way, the user making the change becomes the requestor of every line they
 * touched (OPEN-17).
 */
export function applyDemandChanges(
  workOrderId: string,
  changes: DemandChange[],
  requestor: string,
  phase: 'edit' | 'adjust',
): DemandChangeResult {
  const result: DemandChangeResult = { increased: [], decreased: [], released: { qty: 0, products: [] } }
  const req = requestForWorkOrder(workOrderId)
  if (!req) return result

  for (const change of changes) {
    const lines = linesForProduct(req, change.productId)
    if (lines.length === 0) continue
    const current = lines.reduce((s, l) => s + l.qty, 0)
    const delta = change.qty - current
    if (delta === 0) continue
    const product = lines[0]!.product

    if (delta > 0) {
      if (phase === 'adjust') {
        // The delta gets its own line, with its own required date and its own
        // rejectability. `template` carries the component's identity and
        // destination; nothing else about the original line is copied.
        const template = drawdownOrder(lines)[0]!
        req.lines.push({
          ...template,
          qty: delta,
          reserved: 0,
          consumed: 0,
          requiredDate: change.requiredDate,
          requestor,
          tag: 'adjustment',
          rejected: false,
          destAvailable: destinationAvailableFor(change.productId, template.destinationWarehouseId),
        })
      } else {
        const target = drawdownOrder(lines)[0]!
        target.qty += delta
        target.requiredDate = change.requiredDate
        target.requestor = requestor
      }
      result.increased.push({ productId: change.productId, product, delta })
      continue
    }

    // ── Decrease ───────────────────────────────────────────────────────────────
    // R-4 — going below the reserved qty is only possible once that reservation is
    // released, and release is all-or-nothing per component (R-8).
    const reserved = lines.reduce((s, l) => s + l.reserved, 0)
    const covered = lines.reduce((s, l) => s + l.reserved + l.consumed, 0)
    if (change.qty < covered && reserved > 0) {
      const released = releaseReservation(req.id, [change.productId])
      result.released.qty += released.qty
      result.released.products.push(...released.products)
    }

    let cut = -delta
    for (const line of reductionOrder(lines)) {
      if (cut <= 0) break
      // Never cut below what has already been issued: that material has left the
      // rack, and a request line cannot un-ask for it (it comes back, if at all,
      // through a material return — UC-08).
      const floor = line.consumed
      const take = Math.min(cut, Math.max(0, line.qty - floor))
      if (take <= 0) continue
      line.qty -= take
      line.requestor = requestor
      cut -= take
    }
    // A tagged line cut to nothing is demand that no longer exists — drop it
    // rather than leave a zero-qty row cluttering the dashboard. An original line
    // stays even at zero, because the work order still lists that component.
    for (let i = req.lines.length - 1; i >= 0; i--) {
      const l = req.lines[i]!
      if (l.productId === change.productId && l.tag && l.qty <= 0) req.lines.splice(i, 1)
    }
    result.decreased.push({ productId: change.productId, product, delta: -delta })
  }

  if (result.increased.length || result.decreased.length) persistStockRequests()
  return result
}

/**
 * UC-06 guardrail for WO **Edit** (Not started): a component's qty cannot be set
 * below what is already reserved. The user is told to unreserve first, which they
 * can do because the work order has not started (UC-03).
 *
 * Adjust has no equivalent block — there the cut releases the reservation itself,
 * inside the modal, under the Adjust reason.
 */
export function blockedByReservation(workOrderId: string, changes: DemandChange[]): string[] {
  const req = requestForWorkOrder(workOrderId)
  if (!req) return []
  return changes
    .filter((c) => {
      const lines = linesForProduct(req, c.productId)
      if (lines.length === 0) return false
      return c.qty < lines.reduce((s, l) => s + l.reserved + l.consumed, 0)
    })
    .map(c => c.productId)
}
