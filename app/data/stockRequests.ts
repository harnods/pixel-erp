import { reactive } from 'vue'
import { STAFF, shiftDays, TODAY_ISO } from './master'
import { workOrders, workOrderRawMaterials, type WorkOrder, type WorkOrderStatus, type WorkOrderRawMaterial } from './workOrders'
import { billOfMaterials, catalogProduct } from './billOfMaterials'
import { getWarehouseDetail, isBatchTracked, isSerialized, onStockChange } from './warehouseDetails'
import { loadSnapshot, saveSnapshot } from './persist'
import { logActivityFor } from './reservationActivityLog'
import type { PartialMode } from './productionSettings'

/**
 * Stock requests (Warehouses → Stock requests) — the warehouse/PPIC side of work
 * order material reservation. See the PRD "Work Order Material Reservation, Stock
 * Request & Project Stock" › stock requests dashboard (requirement IDs
 * W-1…W-8 are cited below).
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
 * The demand one transaction places on the warehouse.
 *
 * A work order raises EXACTLY ONE request, for its whole life (C-4), with ONE
 * line per component. Later changes — Edit or Adjust — update that line IN PLACE
 * (v0.6 UC-06); only a component new to the work order adds a line. There are no
 * line tags and no stockist rejection (L-12): a request the warehouse cannot cover
 * stays open as Requested or Partially reserved.
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
  /**
   * UC-09 (v0.6) — the raising work order was DELETED. The request stays listed,
   * as Canceled, because a request that vanishes reads like one never raised.
   */
  workOrderDeleted?: boolean
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
  | 'open'
  | 'completed'
  | 'canceled'

/**
 * A LINE's status — the reservation progress of one component, which is a
 * different question from the request's. A request is open or it is not; a line
 * says how far the warehouse has got with that component.
 *
 */
export type StockRequestLineStatus =
  | 'requested'
  | 'partially reserved'
  | 'reserved'
  | 'fulfilled'

/**
 * Rank for "lowest status wins" (W-3). A request is only as good as its weakest
 * line: one untouched component means the warehouse still has work to do, however
 * complete the rest is.
 */
const LINE_STATUS_RANK: Record<StockRequestLineStatus, number> = {
  'requested': 0,
  'partially reserved': 1,
  'reserved': 2,
  'fulfilled': 3,
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
 * `fulfilled` means the qty asked for has been issued to production; up to that
 * point the line is requested, partially reserved or reserved by how much of it
 * the warehouse has committed.
 */
export function stockRequestLineStatus(line: StockRequestLine): StockRequestLineStatus {
  if (line.consumed >= line.qty && line.qty > 0) return 'fulfilled'
  const covered = lineCovered(line)
  if (covered === 0) return 'requested'
  return covered < line.qty ? 'partially reserved' : 'reserved'
}

/**
 * The request's own status — **open, completed or canceled**, which is a smaller
 * question than its lines': is there anything left for the warehouse to do?
 *
 * It is deliberately NOT the raising work order's status. The dashboard used to
 * show that, so a row could read "In progress" while every component on it was
 * still unreserved — the job had started, the request had not been touched. A
 * request answers for itself.
 *
 * `canceled` comes from the work order, because a cancelled job's demand is moot
 * whatever its lines say (UC-09). Otherwise a request is completed once nothing
 * is outstanding — every line fulfilled — and open until then. The Awaiting tab is exactly the open ones; Closed holds the other two.
 */
export function stockRequestStatus(req: StockRequest): StockRequestStatus {
  // UC-09 — a cancelled work order's request, and a DELETED one's (v0.6: "the
  // WO's stock request stays on the Stock requests page with status Canceled").
  if (req.workOrderDeleted || workOrderFor(req)?.status === 'canceled') return 'canceled'
  // The job is done: whatever it did not use has been released (UC-11 trigger a), so
  // nothing is left for the warehouse to do however much of the plan was consumed.
  if (workOrderFor(req)?.status === 'completed') return 'completed'
  if (req.lines.length === 0) return 'open'
  const outstanding = req.lines.filter(l => stockRequestLineStatus(l) !== 'fulfilled')
  return outstanding.length === 0 ? 'completed' : 'open'
}

/**
 * A line's status in the context of its request. Once the work order has completed
 * every line is settled — what was consumed is what the job used — so the badge
 * reads Fulfilled instead of "Requested" on a request the header calls Completed.
 */
export function requestLineStatus(req: StockRequest, line: StockRequestLine): StockRequestLineStatus {
  if (!req.workOrderDeleted && workOrderFor(req)?.status === 'completed') return 'fulfilled'
  return stockRequestLineStatus(line)
}

/** The lowest line status on a request — how far the warehouse has got overall. */
export function lowestLineStatus(req: StockRequest): StockRequestLineStatus {
  if (req.lines.length === 0) return 'requested'
  return req.lines
    .map(l => requestLineStatus(req, l))
    .reduce((lowest, s) => (LINE_STATUS_RANK[s] < LINE_STATUS_RANK[lowest] ? s : lowest))
}

/**
 * W-7 — a request is overdue when a component's required date has passed and that
 * line still isn't fully covered. Derived, never stored, so it can't contradict
 * the status badge beside it (a fully reserved request is never overdue).
 */
export function isOverdue(req: StockRequest, today: string): boolean {
  // A terminal request is settled: nothing is owed, so nothing can be late. A
  // canceled job's request kept reading "Overdue — reminder sent" long after the
  // job it belonged to had gone away.
  if (isTerminalRequest(req)) return false
  return req.lines.some(l => isLineOverdue(l, today))
}

/** W-7 per line — past its required date and not yet fully covered. */
export function isLineOverdue(line: StockRequestLine, today: string): boolean {
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
  return req.lines.some(l => lineCovered(l) < l.qty)
}

/**
 * Status options for the quick filter / All-filters drawer — no "All …" entry (W-5).
 *
 * These are the LINE statuses, because that is what a filter on this page is for:
 * "show me the components still to reserve". The request's own three — open,
 * completed, canceled — are the tabs, so offering them here as well would let a
 * user ask the Awaiting tab for completed rows, which by definition holds none.
 */
export const stockRequestStatusOptions: { value: StockRequestLineStatus; label: string }[] = [
  { value: 'requested',          label: 'Requested'          },
  { value: 'partially reserved', label: 'Partially reserved' },
  { value: 'reserved',           label: 'Reserved'           },
  { value: 'fulfilled',          label: 'Fulfilled'          },
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
  /** Who last changed this line's demand; defaults to the request's raiser. */
  staffIndex?: number
}
type Seed = {
  woIndex: number
  dayOffset: number
  /** Who created the work order — the requestor of every line not set otherwise. */
  staffIndex: number
  /** Hand-written lines, for the cases the demo has to be exact about. */
  lines?: SeedLine[]
  /**
   * …or take the work order's components as plain lines and let the generator
   * fill them in. The bulk of the seed uses this: a request's line count is its
   * work order's component count, which runs 1–10 across the BOM catalog, and
   * writing all of them out by hand would be ~300 lines of literal that say
   * nothing a rule cannot.
   */
  generate?: {
    /** 0 = nothing reserved, 1 = every line fully reserved. Default 0. */
    reservedPct?: number
    /** Shifts the required dates; negative values make the request overdue. */
    requiredFrom?: number
    /** Free stock at the destination, as a multiple of the line's qty. Default 1. */
    stockFactor?: number
  }
}

/** Destination warehouses used by the seed — real names from the warehouse master. */
const SEED_WAREHOUSES = [
  { id: 'wh-001', name: 'Gudang Jakarta Pusat' },
  { id: 'wh-002', name: 'Gudang Surabaya Timur' },
  { id: 'wh-003', name: 'Gudang Bandung Selatan' },
]

/** ONE request per work order (C-4), one line per component. */
const SEED: Seed[] = [
  // Nothing reserved yet, but warehouse stock covers every line — "Reserve stock"
  // on this row succeeds, which is the happy path the demo needs.
  { woIndex: 4, dayOffset: -2, staffIndex: 0, lines: [
    { reservedPct: 0, consumedPct: 0, destAvailable: 8, requiredOffset: 6 },
    { reservedPct: 0, consumedPct: 0, destAvailable: 6, requiredOffset: 9 },
    { reservedPct: 0, consumedPct: 0, destAvailable: 4, requiredOffset: 9 },
  ] },
  // Short at the destination, and its second line was last changed by someone
  // other than the work order's creator — requestor is held per line (OPEN-17).
  { woIndex: 3, dayOffset: -5, staffIndex: 1, lines: [
    { reservedPct: 0, consumedPct: 0, destAvailable: 1, requiredOffset: 3 },
    { reservedPct: 0, consumedPct: 0, destAvailable: 0, requiredOffset: 3, staffIndex: 5 },
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

  // ── Closed tab ────────────────────────────────────────────────
  // Two canceled work orders (seed indexes 20 and 21). UC-09: cancelling a work
  // order releases its reservation but LEAVES its request listed, as Canceled —
  // a request that disappears reads like one that was never raised.
  { woIndex: 20, dayOffset: -6, staffIndex: 2, lines: [
    { reservedPct: 0, consumedPct: 0, destAvailable: 4, requiredOffset: -1 },
    { reservedPct: 0, consumedPct: 0, destAvailable: 2, requiredOffset: -1 },
  ] },
  { woIndex: 21, dayOffset: -5, staffIndex: 5, lines: [
    { reservedPct: 0, consumedPct: 0, destAvailable: 3, requiredOffset: 0 },
  ] },
  { woIndex: 6, dayOffset: -9, staffIndex: 3, lines: [
    { reservedPct: 1, consumedPct: 0, destAvailable: 5, requiredOffset: 2 },
    { reservedPct: 1, consumedPct: 0, destAvailable: 3, requiredOffset: 2 },
  ] },

  // ── Volume ──────────────────────────────────────────────────────────────────
  // Enough open requests to page, sort and filter against, taking their line
  // counts from their work orders' bills — which run 1 to 10 components — so the
  // breakdown rows vary the same way. Every one of these is still awaiting
  // something, or it would not be on this tab at all.
  // Three of these land before today on their first line, so Overdue is visible
  // without being the state of every row.
  { woIndex: 5,  dayOffset: -1,  staffIndex: 0, generate: { requiredFrom: 5,  stockFactor: 2 } },
  { woIndex: 7,  dayOffset: -3,  staffIndex: 1, generate: { reservedPct: 0.5, requiredFrom: 5 } },
  { woIndex: 8,  dayOffset: -4,  staffIndex: 2, generate: { requiredFrom: 2,  stockFactor: 0 } },
  { woIndex: 9,  dayOffset: -6,  staffIndex: 3, generate: { reservedPct: 0.25, requiredFrom: 13, stockFactor: 2 } },
  { woIndex: 10, dayOffset: -7,  staffIndex: 4, generate: { requiredFrom: 8 } },
  { woIndex: 11, dayOffset: -9,  staffIndex: 5, generate: { reservedPct: 0.5, requiredFrom: 5, stockFactor: 0 } },
  { woIndex: 12, dayOffset: -10, staffIndex: 0, generate: { requiredFrom: 15, stockFactor: 3 } },
  { woIndex: 13, dayOffset: -12, staffIndex: 1, generate: { reservedPct: 0.75, requiredFrom: 15 } },
  { woIndex: 14, dayOffset: -13, staffIndex: 2, generate: { requiredFrom: 12, stockFactor: 2 } },
  { woIndex: 15, dayOffset: -15, staffIndex: 3, generate: { reservedPct: 0.5, requiredFrom: 23 } },

  // The six later work orders (indexes 24–29), weighted towards the blends: they
  // are what lets a By product row expand to ten open transactions, since that
  // number IS the count of open requests needing the component.
  { woIndex: 24, dayOffset: -2,  staffIndex: 1, generate: { requiredFrom: 6, stockFactor: 2 } },
  { woIndex: 25, dayOffset: -5,  staffIndex: 2, generate: { reservedPct: 0.5, requiredFrom: 9 } },
  { woIndex: 26, dayOffset: -3,  staffIndex: 3, generate: { requiredFrom: 7, stockFactor: 0 } },
  { woIndex: 27, dayOffset: -6,  staffIndex: 4, generate: { reservedPct: 0.25, requiredFrom: 11, stockFactor: 2 } },
  { woIndex: 28, dayOffset: -4,  staffIndex: 5, generate: { requiredFrom: 8 } },
  { woIndex: 29, dayOffset: -7,  staffIndex: 0, generate: { reservedPct: 0.5, requiredFrom: 10, stockFactor: 3 } },
  { woIndex: 30, dayOffset: -1,  staffIndex: 2, generate: { requiredFrom: 5, stockFactor: 2 } },

  // Two more canceled work orders, so Closed pages and sorts like a real tab
  // rather than showing the three rows it takes to prove the status exists.
  { woIndex: 22, dayOffset: -8,  staffIndex: 4, generate: { requiredFrom: 6 } },
  { woIndex: 23, dayOffset: -11, staffIndex: 5, generate: { reservedPct: 0.5, requiredFrom: 12, stockFactor: 2 } },
  { woIndex: 31, dayOffset: -7,  staffIndex: 0, generate: { requiredFrom: 4 } },
  { woIndex: 32, dayOffset: -9,  staffIndex: 1, generate: { reservedPct: 0.5, requiredFrom: 11, stockFactor: 2 } },
  { woIndex: 33, dayOffset: -10, staffIndex: 2, generate: { requiredFrom: 8, stockFactor: 0 } },
  { woIndex: 34, dayOffset: -12, staffIndex: 3, generate: { reservedPct: 0.25, requiredFrom: 14 } },
  { woIndex: 35, dayOffset: -13, staffIndex: 4, generate: { requiredFrom: 10, stockFactor: 3 } },
  { woIndex: 36, dayOffset: -15, staffIndex: 5, generate: { reservedPct: 0.5, requiredFrom: 17, stockFactor: 2 } },
]

function buildSeed(): StockRequest[] {
  return SEED.map((s, i) => {
    // By id, not position: a work order the user creates is added to the FRONT of
    // the list, which shifted every seeded request onto the wrong work order.
    const wo = workOrders.find(w => w.id === `wo-${s.woIndex + 1}`)
    const bom = billOfMaterials.find(b => b.id === wo?.bomId)
    // De-duplicate the BOM so each COMPONENT gets exactly one line.
    const raws = [...new Map((bom?.rawMaterials ?? []).map(r => [r.productId, r])).values()]
    const requestDate = shiftDays(TODAY_ISO, s.dayOffset)
    /**
     * `generate` means "one plain line per component of this work order". The
     * spread within a request is deterministic, not random, so the same row
     * always carries the same numbers: required dates fan out a few days at a
     * time, and every third line is left short of stock so each request shows a
     * mix of covered and uncovered demand rather than one flat state.
     */
    const seedLines: SeedLine[] = s.lines ?? raws.map((raw, li) => {
      const g = s.generate ?? {}
      const short = li % 3 === 2
      return {
        reservedPct: g.reservedPct ?? 0,
        consumedPct: 0,
        destAvailable: short ? 0 : raw.needed * (g.stockFactor ?? 1),
        requiredOffset: (g.requiredFrom ?? 2) + li * 2,
      }
    })
    // A seed may describe more lines than its work order's BOM actually has
    // components; those have nothing real to point at, so they are dropped rather
    // than rendered as a placeholder "Raw material" row.
    const lines: StockRequestLine[] = seedLines.flatMap((sl, li) => {
      const ri = li
      const raw = raws[ri]
      if (!raw) return []
      const product = catalogProduct(raw.productId)
      // The qty a request asks for is exactly the qty the work order's Raw
      // materials table calls "Needed qty" — the BOM line. Scaling it here would
      // make the two surfaces disagree about the same number.
      const qty = raw.needed
      const consumed = Math.round(qty * sl.consumedPct)
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
      }]
    })
    return {
      id: `sr-${i + 1}`,
      workOrderId: wo?.id ?? `wo-${s.woIndex + 1}`,
      workOrderNumber: wo?.number ?? `WO-2026-${String(s.woIndex + 1).padStart(4, '0')}`,
      requestDate,
      number: `SR-${TODAY_ISO.slice(0, 4)}-${String(i + 1).padStart(4, '0')}`,
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
 *
 * v3 adds the seeds behind the Closed tab. A snapshot written before
 * them is readable, but it would leave that tab permanently empty on every
 * machine that has one — which is exactly what the tab is being demoed for.
 *
 * v4 widens the bills of materials behind the seed (1–10 components each) and
 * adds the requests that fill both tabs. A v3 snapshot would still load, and
 * would quietly pin every machine that has one to the old five-row table.
 *
 * v5 — PRD v0.6 removes line tags and stockist rejection (L-12): a v4 snapshot
 * would bring back tagged and rejected lines nothing can act on any more.
 */
const SNAPSHOT_KEY = 'stockRequests.v5'

const snapshot = loadSnapshot<StockRequest>(SNAPSHOT_KEY)
export const stockRequests = reactive<StockRequest[]>(snapshot ?? buildSeed())

/**
 * W-9 / OPEN-15 — SR-YYYY-NNNN, per tenant, **reset yearly**, not gapless. The
 * year comes from the app's current date rather than being hard-coded, so the
 * series rolls over on its own; the counter continues from the highest number
 * already issued IN THAT YEAR, which is what "reset yearly" means.
 */
const SR_NO_RE = /^SR-(\d{4})-(\d+)$/
function nextRequestNumber(): string {
  const year = TODAY_ISO.slice(0, 4)
  let max = 0
  for (const r of stockRequests) {
    const m = r.number?.match(SR_NO_RE)
    if (m && m[1] === year) max = Math.max(max, parseInt(m[2]!, 10))
  }
  return `SR-${year}-${String(max + 1).padStart(4, '0')}`
}

/** Persist the stock-request snapshot (call after any mutation). */
export function persistStockRequests(): void {
  saveSnapshot(SNAPSHOT_KEY, stockRequests)
}

/**
 * Keep every line's "available at the destination" in step with the warehouse it reads
 * from. A stock adjustment, warehouse transfer, receipt or delivery moves on-hand, and
 * the stock request must show it: an out-of-stock line becomes reservable once stock is
 * adjusted in, and a transfer out of the destination takes availability with it.
 *
 * Delta-based on purpose — the figure is already net of what open requests hold
 * reserved, and reserving / unreserving moves it themselves, so only the stock change
 * is applied here. Consume / Return never touch warehouse stock, so they can't double up.
 */
onStockChange((warehouseId, sku, delta) => {
  let touched = false
  for (const req of stockRequests) {
    for (const l of req.lines) {
      if (l.destinationWarehouseId !== warehouseId || l.sku !== sku) continue
      l.destAvailable = Math.max(0, l.destAvailable + delta)
      touched = true
    }
  }
  if (touched) persistStockRequests()
})

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
  if (req.workOrderDeleted) return false
  const wo = workOrderFor(req)
  return !wo || ACTIVE_WO_STATUSES.has(wo.status)
}

/**
 * The **Awaiting** tab (W-4) — demand the warehouse still has to fulfil.
 *
 * A row leaves this tab only when its reserved plus consumed qty reaches its
 * required qty. Available stock at the destination does not settle it: available
 * stock is not an allocation until somebody reserves it.
 *
 * The work order's own status is a separate question — a Done or canceled work
 * order offers no actions (see {@link isActionable}) but is not what decides the
 * tab. An earlier build filtered on status alone, which both hid short lines on a
 * completed job and kept fully reserved rows sitting in a tab named for work left
 * to do.
 */
export function isAwaitingTab(req: StockRequest): boolean {
  return isOnDashboard(req) && stockRequestStatus(req) === 'open'
}

/**
 * The **Closed** tab — completed and canceled, the two statuses where nothing
 * further will happen. They stay listed, because a request that vanishes reads
 * like one that was never raised, but they are not work, so they live apart from
 * the tab the stockist works down.
 */
export function isTerminalRequest(req: StockRequest): boolean {
  return stockRequestStatus(req) !== 'open'
}

/** Requests still needing warehouse action — drives the sidebar count badge. */
export const stockRequestOpenCount = (): number =>
  stockRequests.filter(r => isAwaitingTab(r)).length

// ── SKU aggregation (W-1, W-2, W-8) ────────────────────────────────────────────

/** One work order's share of a SKU row — the expandable per-WO breakdown. */
/**
 * One breakdown row under a component: ONE STOCK REQUEST, not one line. A request
 * can hold several lines for the same component — the creation form lets one
 * product be drawn twice — and they are summed here, because the breakdown is read as "who is asking for this component", and
 * the same request number appearing twice reads as a duplicate rather than as two
 * kinds of demand. The request is also the unit the row's actions operate on.
 */
export interface SkuDemandEntry {
  requestId: string
  /** The request's own number (W-9) — what a breakdown row is identified by. */
  requestNumber: string
  workOrderId: string
  workOrderNumber: string
  /** Summed across the request's lines for this component. */
  qty: number
  /** Summed across the request's lines for this component. */
  covered: number
  /** Qty already issued to production, summed the same way. */
  consumed: number
  /** The earliest required date among the lines merged here. */
  requiredDate: string
  destAvailable: number
  /** The LOWEST line status among the lines merged here. */
  status: StockRequestLineStatus
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
  /** Lowest LINE status across this component's demand — the same vocabulary the
   *  breakdown rows use, so a product row and its transactions read alike. */
  status: StockRequestLineStatus
  /**
   * W-7 — any line behind this row past its required date and not fully covered.
   * The product view shows it exactly as the transaction view does: a product row
   * IS the demand, and demand nobody warned about is demand nobody chases.
   */
  overdue: boolean
  backdate?: { delta: number; transaction: string }
  /** true when nothing is outstanding — drives the Requested / All tabs (W-4) */
  sufficient: boolean
}

/**
 * Aggregate request lines into one row per component (W-2). A cancelled job's
 * lines are excluded — their demand no longer stands. `lineFilter` lets the page drop lines
 * outside the selected required-date range before aggregating (W-5).
 */
export function skuDemandGroups(
  requests: StockRequest[],
  lineFilter?: (line: StockRequestLine, req: StockRequest) => boolean,
  /**
   * Include settled lines — those of a cancelled job. Off for
   * the Awaiting tab, where settled demand would inflate a rollup of work still
   * to do. ON for the Closed tab, which is made OF settled requests: with it off
   * that tab's By product view came back all but empty while By transaction
   * listed eleven requests, and the two views are meant to be one data set seen
   * two ways, not two data sets.
   */
  includeSettled = false,
): SkuDemandGroup[] {
  // One bucket per SKU + destination warehouse: the same component wanted at two
  // warehouses is two different pieces of demand, fulfilled by two transfers.
  const byProduct = new Map<string, { line: StockRequestLine; req: StockRequest }[]>()
  for (const req of requests) {
    const canceled = stockRequestStatus(req) === 'canceled'
    for (const line of req.lines) {
      if (!includeSettled && canceled) continue
      if (lineFilter && !lineFilter(line, req)) continue
      const key = `${line.productId}::${line.destinationWarehouseId}`
      const bucket = byProduct.get(key) ?? []
      bucket.push({ line, req })
      byProduct.set(key, bucket)
    }
  }

  return [...byProduct.values()].map((bucket) => {
    const first = bucket[0]!.line
    // One entry per REQUEST: a request's several lines for this component are
    // summed, dated by the earliest of them and statused by the lowest.
    const byRequest = new Map<string, SkuDemandEntry>()
    for (const { line, req } of bucket) {
      const seen = byRequest.get(req.id)
      const status = requestLineStatus(req, line)
      if (!seen) {
        byRequest.set(req.id, {
          requestId: req.id,
          requestNumber: req.number,
          workOrderId: req.workOrderId,
          workOrderNumber: req.workOrderNumber,
          qty: line.qty,
          covered: lineCovered(line),
          consumed: line.consumed,
          requiredDate: line.requiredDate,
          destAvailable: line.destAvailable,
          status,
        })
        continue
      }
      seen.qty += line.qty
      seen.covered += lineCovered(line)
      seen.consumed += line.consumed
      if (line.requiredDate < seen.requiredDate) seen.requiredDate = line.requiredDate
      if (LINE_STATUS_RANK[status] < LINE_STATUS_RANK[seen.status]) seen.status = status
    }
    const entries: SkuDemandEntry[] = [...byRequest.values()]
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
    const overdue = bucket.some(({ line }) => isLineOverdue(line, TODAY_ISO))
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
      overdue,
      required,
      reserved,
      consumed,
      remaining,
      available,
      // Lowest status among the lines behind this row, same rule as a request (W-3).
      status: entries
        .map(e => e.status)
        .reduce((lowest, st) => (LINE_STATUS_RANK[st] < LINE_STATUS_RANK[lowest] ? st : lowest), 'fulfilled' as StockRequestLineStatus),
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
 * C-3 — what a line can reserve right now: its outstanding need, capped by the
 * free stock at its destination warehouse. Reservation is BY AVAILABLE QTY — a
 * line 30-of-40 covered reserves the 30 and stays Partially reserved for the
 * stockist, rather than reserving nothing until the full 40 turns up.
 *
 * (Earlier drafts made auto-reserve per-line all-or-nothing. The PRD's Key
 * Concepts now define One-step as reserving "by available qty", and that was the
 * only rule anywhere that made a reservation all-or-nothing, so every reserve
 * path — auto, manual, per request, per product — now goes through this.)
 */
export function reservableQty(line: StockRequestLine): number {
  return Math.max(0, Math.min(line.qty - lineCovered(line), line.destAvailable))
}

/**
 * Reserve every line of a request as far as destination stock allows — the
 * dashboard's "Reserve stock" action. Each line takes what the destination can
 * give, up to its outstanding need, and the rest stays open for a transfer or a
 * purchase (C-3, by available qty). Returns the reserved qty, or undefined when
 * there was nothing to reserve.
 */
export function reserveStock(id: string, ctx: ActivityContext = {}): number | undefined {
  const req = stockRequests.find(r => r.id === id)
  if (!req) return undefined
  let reserved = 0
  const touched: string[] = []
  for (const line of req.lines) {
    const take = reservableQty(line)
    if (take <= 0) continue
    line.reserved += take
    line.destAvailable -= take
    reserved += take
    if (!touched.includes(line.productId)) touched.push(line.productId)
  }
  if (reserved === 0) return undefined
  persistStockRequests()
  logRequestEvent(req, 'Reserved material', [
    { label: 'Components', value: productNames(req, touched) },
    { label: 'Qty reserved', value: `${reserved}` },
  ], ctx)
  return reserved
}

// ── Work order side (UC-01 … UC-04) ────────────────────────────────────────────
// The work order pages and this dashboard read the SAME request rows, so a
// reservation made on either surface is immediately true on the other.

/**
 * The stock request raised by a work order (C-4). There is exactly one, for the
 * work order's whole life — changes update its lines rather than raising a second
 * request, so this never has to pick between candidates.
 */
export function requestForWorkOrder(workOrderId: string): StockRequest | undefined {
  return stockRequests.find(r => r.workOrderId === workOrderId)
}

/**
 * Every line for one component on one request. Normally one (v0.6: one line per
 * component, updated in place), but the creation form lets the same product be
 * drawn from two warehouses, and each becomes its own line — so anything that
 * acts "on a product" acts on this list, never on the first match.
 */
export function linesForProduct(req: StockRequest, productId: string): StockRequestLine[] {
  return req.lines.filter(l => l.productId === productId)
}

/** A work order's raw-material row with its LIVE demand and reservation. */
export interface WorkOrderMaterial extends WorkOrderRawMaterial {
  product: string
  sku: string
  /** qty at creation — what a back-filled stock request is raised with */
  plannedNeeded: number
  /** reserved + already issued on this row's request lines */
  reserved: number
  /**
   * What is still held in the Reserved bucket for this row — total reserved minus
   * total consumed (v0.6 UC-05). 0 once the work order completes (R-3).
   */
  remainingReserved: number
}

/**
 * The work order's raw materials as they stand NOW — the rows it was created with
 * ({@link workOrderRawMaterials}), each carrying its live need from the stock
 * request.
 *
 * Edit and Adjust change demand on the request, not on the work order (UC-06): the
 * PRD's worked example ends "the WO now needs 24 + 8 = 32 MDF across two lines". So
 * while request lines exist for a row, their total is the need.
 *
 * A row is matched to its lines by product AND warehouse, because the creation
 * form lets the same product be drawn from two warehouses and each becomes its own
 * line. Seeded work orders store no warehouse, so theirs match by product alone.
 */
export function workOrderMaterials(wo: WorkOrder): WorkOrderMaterial[] {
  const req = requestForWorkOrder(wo.id)
  return workOrderRawMaterials(wo).map((r) => {
    const p = catalogProduct(r.productId)
    const lines = req?.lines.filter(l =>
      l.productId === r.productId
      && (r.warehouseId === undefined || l.destinationWarehouseId === r.warehouseId)) ?? []
    return {
      ...r,
      // Seeded work orders store no warehouse; their line's destination is it.
      warehouseId: r.warehouseId ?? lines[0]?.destinationWarehouseId,
      product: p?.name ?? '—',
      sku: p?.sku ?? '—',
      plannedNeeded: r.needed,
      needed: lines.length ? lines.reduce((sum, l) => sum + l.qty, 0) : r.needed,
      reserved: lines.reduce((sum, l) => sum + lineCovered(l), 0),
      remainingReserved: lines.reduce((sum, l) => sum + l.reserved, 0),
    }
  })
}

/** How much of a component this work order has reserved (reserved + already issued). */
export function reservedForWorkOrder(workOrderId: string, productId: string): number {
  const req = requestForWorkOrder(workOrderId)
  if (!req) return 0
  return linesForProduct(req, productId).reduce((s, l) => s + lineCovered(l), 0)
}

/**
 * Material readiness of a whole work order — the badge on its detail header. This
 * is the lowest LINE status, not the request's own: "is every component ready",
 * not "is the request still open".
 */
export function workOrderReadiness(workOrderId: string): StockRequestLineStatus | undefined {
  const req = requestForWorkOrder(workOrderId)
  return req ? lowestLineStatus(req) : undefined
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
 * The start gate — UC-04 / D-8, decided by the partial mode (S-3):
 *
 * | partialMode  | Start permitted when                      |
 * | ------------ | ----------------------------------------- |
 * | `consume`    | AT LEAST ONE component holds stock > 0     |
 * | `completion` | EVERY component holds stock > 0            |
 * | `none`       | EVERY component holds its full need        |
 *
 * There is no separate S-4 "start with limited stock" switch: it "is not
 * introduced as a separate toggle" and uses the partial consume / partial
 * completion setting instead.
 *
 * The rules protect different things. Partial consume lets work proceed with
 * whatever has arrived, so one secured component is enough to begin. Partial
 * completion posts output in tranches, and even one finished unit needs a complete
 * set of components — fabric without buttons produces nothing — so every line must
 * hold something.
 *
 * What "holds" means depends on the setting the work order was CREATED under (S-0):
 *  • reservation on — its RESERVATION, never availability: stock sitting free in
 *    the warehouse does not open the gate, because nobody has allocated it yet;
 *  • reservation off — stock ON HAND at each component's warehouse (v0.6: "the
 *    start gate checks stock on hand only"), through the same table.
 */
export function startGate(
  workOrderId: string,
  options: { reservationOn: boolean; partialMode: PartialMode },
): { allowed: boolean; reason?: StartBlockReason } {
  let held: { qty: number; have: number }[]
  if (options.reservationOn) {
    const req = requestForWorkOrder(workOrderId)
    if (!req || req.lines.length === 0) return { allowed: true }
    held = req.lines.map(l => ({ qty: l.qty, have: lineCovered(l) }))
  } else {
    const wo = workOrders.find(w => w.id === workOrderId)
    if (!wo) return { allowed: true }
    held = workOrderRawMaterials(wo).map(r => ({ qty: r.needed, have: onHandAt(r.productId, r.warehouseId) }))
    if (held.length === 0) return { allowed: true }
  }
  if (held.every(h => h.have >= h.qty)) return { allowed: true }

  switch (options.partialMode) {
    case 'consume':
      return held.some(h => h.have > 0)
        ? { allowed: true }
        : { allowed: false, reason: 'none-reserved' }
    case 'completion':
      return held.every(h => h.have > 0)
        ? { allowed: true }
        : { allowed: false, reason: 'some-unreserved' }
    default:
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
  for (const line of linesForProduct(req, productId)) {
    if (left <= 0) break
    const take = Math.min(left, line.reserved)
    if (take <= 0) continue
    line.reserved -= take
    line.consumed += take
    left -= take
    applied += take
  }
  // Consumed with nothing reserved against it (P-1 allows drawing on-hand stock): the
  // work order counts it, so the request must too, taken out of what was available.
  for (const line of linesForProduct(req, productId)) {
    if (left <= 0) break
    const take = Math.min(left, Math.max(0, line.qty - line.consumed - line.reserved))
    if (take <= 0) continue
    line.consumed += take
    line.destAvailable = Math.max(0, line.destAvailable - take)
    left -= take
    applied += take
  }
  if (applied > 0) persistStockRequests()
  return applied
}

/**
 * A Return on the work order: the qty comes back out of what the request shows as
 * consumed and goes to the warehouse's AVAILABLE stock (WIP → Available, UC-08), so
 * Consumed here matches the work order's net consumed and the stock can be reserved
 * again. Returns the qty applied.
 */
export function applyReturn(workOrderId: string, productId: string, qty: number): number {
  const req = requestForWorkOrder(workOrderId)
  if (!req || qty <= 0) return 0
  let left = qty
  let applied = 0
  // Last line first: the latest demand is the one most recently drawn against.
  for (const line of [...linesForProduct(req, productId)].reverse()) {
    if (left <= 0) break
    const take = Math.min(left, line.consumed)
    if (take <= 0) continue
    line.consumed -= take
    line.destAvailable += take
    left -= take
    applied += take
  }
  if (applied > 0) {
    persistStockRequests()
    logRequestEvent(req, 'Returned material', [
      { label: 'Components', value: productNames(req, [productId]) },
      { label: 'Qty returned', value: `${applied}` },
    ], { source: 'work-order' })
  }
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
 * D-5 — reserve the SELECTED components of a work order, each by available qty
 * (C-3): a component the destination can only partly cover reserves what there
 * is and stays Partially reserved. Returns what happened, so the caller can word
 * the toast.
 */
export function reserveWorkOrderProducts(
  workOrderId: string,
  productIds: string[],
  ctx: ActivityContext = { source: 'work-order' },
): { reservedProducts: number; reservedQty: number; skippedProducts: number; partialProducts: number } {
  return reserveRequestProducts(requestForWorkOrder(workOrderId)?.id ?? '', productIds, ctx)
}

/** Reserve selected components of ONE request, by request id. */
export function reserveRequestProducts(
  requestId: string,
  productIds: string[],
  ctx: ActivityContext = {},
): { reservedProducts: number; reservedQty: number; skippedProducts: number; partialProducts: number } {
  const req = stockRequests.find(r => r.id === requestId)
  const result = { reservedProducts: 0, reservedQty: 0, skippedProducts: 0, partialProducts: 0 }
  if (!req) return result
  for (const productId of productIds) {
    const lines = linesForProduct(req, productId)
    if (lines.length === 0) continue
    let productQty = 0
    let productShort = false
    for (const line of lines) {
      const outstanding = line.qty - lineCovered(line)
      if (outstanding <= 0) continue
      // Reserve what the warehouse can actually give (C-3, by available qty) — the
      // start gate's "partially reserved" states only exist because a line can be
      // reserved short.
      const take = reservableQty(line)
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
  if (result.reservedQty > 0) {
    persistStockRequests()
    logRequestEvent(req, 'Reserved material', [
      { label: 'Components', value: productNames(req, productIds) },
      { label: 'Qty reserved', value: `${result.reservedQty}` },
    ], ctx)
  }
  return result
}

/** UC-09 — the raising work order was deleted; its request stays, as Canceled. */
export function markWorkOrderDeleted(workOrderId: string): void {
  const req = requestForWorkOrder(workOrderId)
  if (!req) return
  req.workOrderDeleted = true
  persistStockRequests()
}

/**
 * UC-09 — the work order's stock adjustments were deleted (Cancel / Delete), so
 * nothing on its request counts as issued any more.
 */
export function clearConsumption(workOrderId: string): void {
  const req = requestForWorkOrder(workOrderId)
  if (!req) return
  for (const line of req.lines) line.consumed = 0
  persistStockRequests()
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
 * Applied to the component's first line — the demand the work order raised.
 */
export function setReservedBatches(requestId: string, productId: string, batches: { batchNo: string; qty: number }[]): void {
  const req = stockRequests.find(r => r.id === requestId)
  const line = req && linesForProduct(req, productId)[0]
  if (!line) return
  line.reservedBatches = batches.map(b => ({ ...b }))
  persistStockRequests()
}

/** PPIC reserves specific serial numbers for a component (Stock request detail). */
export function setReservedSerials(requestId: string, productId: string, serials: string[]): void {
  const req = stockRequests.find(r => r.id === requestId)
  const line = req && linesForProduct(req, productId)[0]
  if (!line) return
  line.reservedSerials = [...serials]
  persistStockRequests()
}

/** D-6 — where the released stock goes. Mandatory on unreserve. */
/**
 * ── Audit trail (UC-02, UC-03, UC-11 R-1/R-7, US-8) ───────────────────────────
 *
 * Reservation events are logged HERE, in the data layer, rather than by whichever
 * page triggered them. Every one of these transitions is reachable from two
 * surfaces — the work order page (Production) and the Stock requests dashboard
 * (PPIC/stockist) — and under Two-step the dashboard is the ONLY surface. Logging
 * from the pages meant the Two-step path, which is where the PRD puts all
 * reservation, wrote no trail at all.
 *
 * Every entry is written against BOTH the work order and its request: the two show
 * the same allocation, so a trail visible on only one sends whoever is reading the
 * other to the wrong conclusion.
 */

/** Where a reservation event came from — logged as its Source (UC-02). */
export type ActivitySource = 'work-order' | 'stock-request' | 'automatic'

const SOURCE_LABEL: Record<ActivitySource, string> = {
  'work-order': 'Work order page (Production)',
  'stock-request': 'Stock request (PPIC / stockist)',
  automatic: 'Automatic (one-step reservation)',
}

/** Who acted, from which surface, and why. Defaults to PPIC on the dashboard. */
export interface ActivityContext {
  user?: string
  source?: ActivitySource
  /** Free-text reason, where the action collects one (unreserve, adjust). */
  reason?: string
}

function logRequestEvent(
  req: StockRequest,
  activity: string,
  details: { label: string; value: string }[],
  ctx: ActivityContext = {},
): void {
  logActivityFor(
    [
      { type: 'stock-request' as const, id: req.id },
      ...(req.workOrderId ? [{ type: 'work-order' as const, id: req.workOrderId }] : []),
    ],
    {
      user: ctx.user ?? STAFF[0]!,
      activity,
      details: [...details, { label: 'Source', value: SOURCE_LABEL[ctx.source ?? 'stock-request'] }],
    },
  )
}

/**
 * A warehouse transfer or purchase request raised FROM a stock request leaves its
 * number on the request's log, so the trail from "short of stock" to the document
 * that answers it reads in one place. Called by the forms when they save.
 */
export function logRequestDocument(
  requestId: string,
  kind: 'warehouse-transfer' | 'purchase-request',
  number: string,
  lines: { product: string; qty: number; unit: string }[],
  extra: { label: string; value: string }[] = [],
): void {
  const req = stockRequests.find(r => r.id === requestId)
  if (!req) return
  logRequestEvent(
    req,
    kind === 'warehouse-transfer' ? 'Warehouse transfer created' : 'Purchase request created',
    [
      { label: kind === 'warehouse-transfer' ? 'Warehouse transfer' : 'Purchase request', value: number },
      ...extra,
      { label: 'Components', value: lines.map(l => `${l.product} (${l.qty} ${l.unit})`).join(', ') },
    ],
    { source: 'stock-request' },
  )
}

/** Component names for a log entry, in the order the caller selected them. */
function productNames(req: StockRequest, productIds: string[]): string {
  return productIds
    .map(id => req.lines.find(l => l.productId === id)?.product ?? id)
    .join(', ')
}

/**
 * UC-11 R-1 — what caused a release. All three write the SAME transition, which is
 * why they share one function: a release logged differently depending on how it
 * happened is a release nobody can reconcile against the stock ledger.
 */
export type ReleaseTrigger = 'unreserve' | 'completion' | 'cancellation'

const RELEASE_TRIGGER_LABEL: Record<ReleaseTrigger, string> = {
  unreserve: 'Manual unreserve',
  completion: 'Work order completion',
  cancellation: 'Work order cancellation',
}

/** What one release did, per component — enough to word the toast and the log. */
export interface ReleaseResult {
  qty: number
  products: { productId: string; product: string; qty: number }[]
}

/**
 * UC-11 — the Reserved → Available transition, in one place.
 *
 * Moves quantity between buckets and never moves stock physically: On Hand =
 * Available + Reserved holds before and after. Already-consumed qty is NEVER
 * released — it has left the rack and comes back, if at all, through a material
 * return (UC-08).
 *
 * Releases each line's FULL remaining reserved qty and never part of it (R-8):
 * components are selected individually, quantities are not.
 *
 * Released stock ALWAYS returns to the warehouse's available stock. UC-03 (12 Oct)
 * dropped the disposition choice ("Tickbox per product; Reason optional"), so the
 * "production defect" path — charged to production cost, never re-entering stock —
 * is gone with it; material that really was spoilt is recorded as consumption.
 */
export function releaseReservation(
  requestId: string,
  productIds: string[],
  trigger: ReleaseTrigger = 'unreserve',
  ctx: ActivityContext = {},
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
      line.destAvailable += line.reserved
      line.reserved = 0
    }
    if (productQty <= 0) continue
    result.qty += productQty
    result.products.push({ productId, product: name, qty: productQty })
  }
  if (result.qty > 0) {
    persistStockRequests()
    // R-7 — one entry shape for all three triggers, so they reconcile against the
    // stock ledger. The trigger is a field, not a turn of phrase in the activity.
    logRequestEvent(req, 'Released reservation', [
      { label: 'Components', value: result.products.map(p => p.product).join(', ') },
      { label: 'Qty released', value: `${result.qty}` },
      { label: 'Trigger', value: RELEASE_TRIGGER_LABEL[trigger] },
      ...(ctx.reason ? [{ label: 'Reason', value: ctx.reason }] : []),
    ], ctx)
  }
  return result
}

/** Every component on a request that still holds a reservation. */
export function reservedProductIds(req: StockRequest): string[] {
  return [...new Set(req.lines.filter(l => l.reserved > 0).map(l => l.productId))]
}

/**
 * UC-11 trigger (b) — a work order is cancelled or deleted. Its whole remaining
 * reservation goes back to available; no disposition is asked for, because the
 * cancellation reason already carries the context (R-2).
 */
export function releaseForCanceledWorkOrder(workOrderId: string, ctx: ActivityContext = {}): ReleaseResult {
  const req = requestForWorkOrder(workOrderId)
  if (!req) return { qty: 0, products: [] }
  return releaseReservation(req.id, reservedProductIds(req), 'cancellation', ctx)
}

/**
 * UC-11 trigger (a) — a work order COMPLETES with reserved qty above consumed.
 * Automatic and unapproved (R-2, R-3): holding a job's last step for a decision
 * nobody is making just strands the stock.
 *
 * Only on FULL completion. On a partial completion the remaining reserve stays
 * reserved, because the job still intends to use it.
 */
export function releaseOnCompletion(workOrderId: string, ctx: ActivityContext = {}): ReleaseResult {
  const req = requestForWorkOrder(workOrderId)
  if (!req) return { qty: 0, products: [] }
  return releaseReservation(req.id, reservedProductIds(req), 'completion', ctx)
}

/**
 * D-6 — release the FULL reserved qty of each selected component. There is no
 * partial-qty unreserve. Returns the released qty.
 */
export function unreserveWorkOrderProducts(
  workOrderId: string,
  productIds: string[],
  ctx: ActivityContext = { source: 'work-order' },
): number {
  return unreserveRequestProducts(requestForWorkOrder(workOrderId)?.id ?? '', productIds, ctx)
}

/** Release the full reserved qty of selected components of ONE request, by id. */
export function unreserveRequestProducts(
  requestId: string,
  productIds: string[],
  ctx: ActivityContext = {},
): number {
  return releaseReservation(requestId, productIds, 'unreserve', ctx).qty
}

/**
 * Reserve one component across EVERY open request that needs it — the product
 * perspective's counterpart to {@link reserveWorkOrderProducts}. Each line takes
 * what its destination can give (C-3); `skipped` counts lines that got nothing,
 * which is where a transfer or a purchase comes in.
 */
export function reserveProductEverywhere(productId: string): { transactions: number; qty: number; skipped: number } {
  const result = { transactions: 0, qty: 0, skipped: 0 }
  for (const req of stockRequests) {
    let touched = false
    // A product can hold SEVERAL lines on one request now (original + Adjustment),
    // so this reserves each of them rather than the first one found — but still
    // counts the request once, because the row the user clicked is a transaction.
    for (const line of req.lines.filter(l => l.productId === productId)) {
      if (line.qty - lineCovered(line) <= 0) continue
      const take = reservableQty(line)
      if (take <= 0) { result.skipped++; continue }
      line.reserved += take
      line.destAvailable -= take
      result.qty += take
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
    l.productId === productId && l.destinationWarehouseId === warehouseId
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

/**
 * On hand for one component at one warehouse — available + reserved (the quantity
 * model's `On Hand = Available + Reserved`). What the v0.6 consume limit (P-1) and
 * the reservation-off start gate (UC-04) read.
 */
export function onHandAt(productId: string, warehouseId: string | undefined): number {
  const sku = catalogProduct(productId)?.sku
  if (!sku || !warehouseId) return 0
  return getWarehouseDetail(warehouseId)?.stock.find(row => row.sku === sku)?.onHand ?? 0
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
 * C-3 — under One-step, every line reserves straight away BY AVAILABLE QTY: what
 * the destination can give, up to its need. A line reserved short stays Partially
 * reserved and one with no stock stays Requested, both for the stockist. Under
 * Two-step nothing auto-reserves.
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
): { request: StockRequest; created: boolean } & SettleResult {
  const existing = requestForWorkOrder(input.workOrderId)
  if (existing) return { request: existing, created: false, ...NOTHING_SETTLED }

  const request: StockRequest = {
    id: `sr-wo-${input.workOrderId}`,
    number: nextRequestNumber(),
    workOrderId: input.workOrderId,
    workOrderNumber: input.workOrderNumber,
    requestDate: input.requestDate,
    lines: buildLines(input.lines, input.requestor),
  }
  stockRequests.push(request)

  const settled = settleLines(request.lines, options.autoReserve)
  persistStockRequests()
  if (settled.reservedQty > 0) {
    // C-3 — the one-step auto-reserve is a reservation like any other, and the
    // only one with no human behind it, so it says so in its Source.
    logRequestEvent(request, 'Reserved material', [
      { label: 'Components', value: settled.reservedNames.join(', ') },
      { label: 'Qty reserved', value: `${settled.reservedQty}` },
    ], { user: input.requestor, source: 'automatic' })
  }
  return { request, created: true, ...settled }
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

/** What an auto-reserve did — enough for the toast to say which case applied (C-3). */
export interface SettleResult {
  /** lines that reserved anything */
  reservedProducts: number
  /** their component names — what the activity log names, rather than a count */
  reservedNames: string[]
  reservedQty: number
  /** of those, lines reserved SHORT — still Partially reserved for the stockist */
  partialProducts: number
  /** lines that reserved nothing — no stock at the destination, still Requested */
  shortProducts: number
}
const NOTHING_SETTLED: SettleResult = { reservedProducts: 0, reservedNames: [], reservedQty: 0, partialProducts: 0, shortProducts: 0 }

/**
 * C-3 (v0.6) — One-step auto-reserve takes each line UP TO the qty available at its
 * destination warehouse: a fully covered line becomes Reserved, a partly covered
 * one Partially reserved, an uncovered one stays Requested — and whatever is short
 * stays with the stockist as a request. (v0.5 made this all-or-nothing; OPEN-12
 * was re-decided in v0.6.) The same rule as the manual Reserve, so every reserve
 * path goes through `reservableQty`.
 */
function settleLines(lines: StockRequestLine[], autoReserve: boolean): SettleResult {
  const r: SettleResult = { ...NOTHING_SETTLED, reservedNames: [] }
  if (!autoReserve) return r
  for (const line of lines) {
    const outstanding = line.qty - lineCovered(line)
    const take = reservableQty(line)
    if (take <= 0) { if (outstanding > 0) r.shortProducts++; continue }
    line.reserved += take
    line.destAvailable -= take
    r.reservedProducts++
    if (!r.reservedNames.includes(line.product)) r.reservedNames.push(line.product)
    r.reservedQty += take
    if (lineCovered(line) < line.qty) r.partialProducts++
  }
  return r
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
  // A completed or canceled request has no need left, whatever its lines say.
  if (!req || isTerminalRequest(req)) return []
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
    if (isTerminalRequest(req)) continue
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

// ── UC-06 — WO Edit & Adjust (change management) ────────────────────────────────
// v0.6: Edit (Not started) and Adjust (In progress) reach the stock request the
// SAME way — the component's existing line is updated in place. There are no
// Adjustment lines any more: with stockist rejection gone (L-12) nothing needs the
// delta kept apart, and the line simply takes the new required date.

/** One component's new state, as an Edit or Adjust hands it over. */
export interface DemandChange {
  productId: string
  /** the component's TOTAL new qty across all its lines — not a delta */
  qty: number
  /** required date — the changed line takes it (Adjust: today or later) */
  requiredDate: string
  /**
   * A component NEW to the work order — the hand-off line to add ("New product
   * added to the WO → New line", UC-06). Ignored for a component already on it.
   */
  newLine?: WorkOrderMaterialLine
}

/** What a change did — enough to word the toast and the log entry. */
export interface DemandChangeResult {
  increased: { productId: string; product: string; delta: number }[]
  decreased: { productId: string; product: string; delta: number }[]
  /** remaining reservation released by the change (R-4) */
  released: ReleaseResult
  /**
   * What One-step reserved again on the same save (C-3, up to the qty available).
   * Always nothing under Two-step, where PPIC reserves from Stock requests.
   */
  reserved: SettleResult
}

/**
 * UC-06 / R-4 — apply demand changes to a work order's request.
 *
 * For every component whose qty changes, in Edit or Adjust alike:
 *  1. its full remaining reservation is released (R-8 — never part of it), as the
 *     table says: "System will unreserve remaining reserved qty";
 *  2. its line is updated IN PLACE — new qty, the change's required date, and the
 *     user making the change as requestor (OPEN-17);
 *  3. on the same save the line goes back through the reservation method — up to
 *     the qty available under One-step (C-3), by PPIC under Two-step (OPEN-31).
 *
 * A component new to the work order adds a line (`newLine`), with the user as its
 * requestor. A decrease never cuts a line below what has already been issued: that
 * material has left the rack, and comes back, if at all, through a material return
 * (UC-08). `phase` only labels the log; the rule is the same.
 */
export function applyDemandChanges(
  workOrderId: string,
  changes: DemandChange[],
  requestor: string,
  phase: 'edit' | 'adjust',
  options: { autoReserve: boolean; ctx?: ActivityContext } = { autoReserve: false },
): DemandChangeResult {
  const result: DemandChangeResult = {
    increased: [], decreased: [], released: { qty: 0, products: [] }, reserved: { ...NOTHING_SETTLED },
  }
  const req = requestForWorkOrder(workOrderId)
  if (!req) return result
  /** Lines to put through C-3 once every change is applied. */
  const toSettle: StockRequestLine[] = []
  const ctx = options.ctx ?? { source: 'work-order' as const }

  for (const change of changes) {
    const lines = linesForProduct(req, change.productId)
    if (lines.length === 0) {
      if (!change.newLine || change.qty <= 0) continue
      const [added] = buildLines([{ ...change.newLine, qty: change.qty, requiredDate: change.requiredDate }], requestor)
      req.lines.push(added!)
      toSettle.push(added!)
      result.increased.push({ productId: change.productId, product: added!.product, delta: change.qty })
      continue
    }
    const current = lines.reduce((s, l) => s + l.qty, 0)
    const delta = change.qty - current
    if (delta === 0) continue
    const product = lines[0]!.product

    if (lines.some(l => l.reserved > 0)) {
      const released = releaseReservation(req.id, [change.productId], 'unreserve', ctx)
      result.released.qty += released.qty
      result.released.products.push(...released.products)
    }

    if (delta > 0) {
      const target = lines[0]!
      target.qty += delta
    } else {
      let cut = -delta
      // Last line first, so a component drawn from two warehouses gives up its
      // later line before its first.
      for (const line of [...lines].reverse()) {
        if (cut <= 0) break
        const take = Math.min(cut, Math.max(0, line.qty - line.consumed))
        if (take <= 0) continue
        line.qty -= take
        cut -= take
      }
    }
    for (const line of lines) {
      line.requiredDate = change.requiredDate || line.requiredDate
      line.requestor = requestor
      toSettle.push(line)
    }
    if (delta > 0) result.increased.push({ productId: change.productId, product, delta })
    else result.decreased.push({ productId: change.productId, product, delta: -delta })
  }

  result.reserved = settleLines(toSettle, options.autoReserve)
  if (result.reserved.reservedQty > 0) {
    logRequestEvent(req, 'Reserved material', [
      { label: 'Components', value: result.reserved.reservedNames.join(', ') },
      { label: 'Qty reserved', value: `${result.reserved.reservedQty}` },
      { label: 'Trigger', value: phase === 'edit' ? 'Work order edited' : 'Work order adjusted' },
    ], { user: requestor, source: 'automatic' })
  }

  if (result.increased.length || result.decreased.length) persistStockRequests()
  return result
}
