import { reactive } from 'vue'
import { warehouses } from './warehouses'
import { operatorForWarehouse } from './warehouseTeam'
import { warehouseProducts, PRODUCTS } from './inventory'
import { applyStockCount, applyStockInOut, getWarehouseDetail, stockOutViolation } from './warehouseDetails'
import { loadSnapshot, saveSnapshot } from './persist'
import { TODAY } from './master'
import {
  accountForCategory, accountCodeFor, addAdjustment, stockAdjustments,
  type AdjustmentKind, type AdjustmentCategory, type AdjustmentStatus,
  type StockAdjustment, type AdjustmentInput, type AdjustmentLine, type MisplacedSerial,
  IN_OUT_CATEGORIES, adjustmentLineItems,
} from './stockAdjustments'

export type { AdjustmentKind, AdjustmentCategory, AdjustmentStatus, StockAdjustment, AdjustmentInput, AdjustmentLine, MisplacedSerial }

/**
 * WMS stock adjustments — separate data store from ERP. No approval workflow:
 * records are created directly as 'completed' and stock is applied immediately.
 */

const WMS_WAREHOUSES = warehouses.filter((w) => !w.isDefault && w.status === 'active')
const WMS_COUNT_WAREHOUSES = WMS_WAREHOUSES.filter((w) => w.hasStorageLocations !== false)

function hash100(i: number): number {
  let x = ((i + 1) * 2654435761) >>> 0
  x ^= x >>> 15
  x = (x * 2246822519) >>> 0
  x ^= x >>> 13
  return (x >>> 0) % 100
}

function isoOffset(days: number): string {
  const d = new Date(TODAY)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function isoOffsetTs(days: number, hour: number, minute: number): string {
  const d = new Date(TODAY)
  d.setDate(d.getDate() + days)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

const TAG_POOL = ['Recount', 'Audit', 'Damaged', 'Expired', 'Promo', 'Year-end', 'Production', 'Correction']

function tagsFor(i: number): string[] {
  const n = hash100(i * 13) % 4
  const out: string[] = []
  for (let k = 0; k < n; k++) out.push(TAG_POOL[(hash100(i * 5 + k * 17)) % TAG_POOL.length]!)
  return [...new Set(out)]
}

function kindFor(i: number): AdjustmentKind {
  return hash100(i * 3 + 1) < 40 ? 'count' : 'in-out'
}

function countStatusFor(i: number): AdjustmentStatus {
  const v = hash100(i * 41 + 11)
  if (v < 25) return 'not_started'
  if (v < 55) return 'in_progress'
  if (v < 80) return 'counted'
  return 'completed'
}

function categoryFor(i: number, kind: AdjustmentKind): AdjustmentCategory {
  if (kind === 'count') return 'Stock count'
  return IN_OUT_CATEGORIES[hash100(i * 11 + 5) % IN_OUT_CATEGORIES.length]!
}

function generate(count = 24): StockAdjustment[] {
  const out: StockAdjustment[] = []
  const whCount = WMS_WAREHOUSES.length
  const countWhCount = WMS_COUNT_WAREHOUSES.length
  if (!whCount) return out
  let countSeq = 20090
  let inoutSeq = 20090
  for (let i = 0; i < count; i++) {
    const kind = kindFor(i)
    const category = categoryFor(i, kind)
    const whPool = kind === 'count' && countWhCount > 0 ? WMS_COUNT_WAREHOUSES : WMS_WAREHOUSES
    const wh = whPool[hash100(i * 9 + 2) % whPool.length]!
    const seq = kind === 'count' ? countSeq++ : inoutSeq++
    const startDaysAgo = (hash100(i * 17) % 40) + 1
    const durationDays = (hash100(i * 7 + 3) % 5) + 1
    const status = kind === 'count' ? countStatusFor(i) : 'completed'
    const record: StockAdjustment = {
      id: `${kind === 'count' ? 'cc' : 'wsa'}-${String(i + 1).padStart(3, '0')}`,
      kind,
      number: `${kind === 'count' ? 'Cycle Count' : 'Stock In/Out'} #${seq}`,
      date: isoOffset(-startDaysAgo),
      warehouseId: wh.id,
      warehouseName: wh.name,
      category,
      account: accountForCategory(category),
      status,
      tags: tagsFor(i),
    }
    if (kind === 'count') {
      record.assignee = operatorForWarehouse(wh.id, hash100(i * 19 + 7))
      const startHour = 7 + (hash100(i * 23 + 1) % 4)
      const startMin = (hash100(i * 29 + 2) % 4) * 15
      const endHour = 14 + (hash100(i * 31 + 3) % 5)
      const endMin = (hash100(i * 37 + 4) % 4) * 15
      if (status === 'in_progress' || status === 'counted' || status === 'completed') {
        record.startDate = isoOffsetTs(-startDaysAgo, startHour, startMin)
      }
      if (status === 'counted' || status === 'completed') {
        record.endDate = isoOffsetTs(-startDaysAgo + durationDays, endHour, endMin)
      }
    }
    out.push(record)
  }
  // Demo scenario — Cycle Count #20094 (cc-006) always carries 5 misplaced-serial
  // notes and sits "Counted" (Awaiting approval), so the manager-review bulk
  // actions have real data to exercise without walking a live count first. Split
  // across 3 origin→found-at pairs (2 + 2 + 1) so selecting one pair's rows while
  // a different pair's rows sit disabled is visible immediately.
  const demoRecord = out.find(r => r.id === 'cc-006')
  if (demoRecord) {
    demoRecord.status = 'counted'
    demoRecord.startDate ??= isoOffsetTs(-2, 8, 0)
    demoRecord.endDate ??= isoOffsetTs(-1, 15, 30)
    demoRecord.misplacedSerials = [
      // Bin 03 → Bin 01 (4)
      { sku: '2101', productName: 'Coffee Grinder On-Demand 64mm', serial: '210101150', systemLocation: 'Bin 03', countedLocation: 'Bin 01', scannedAt: isoOffsetTs(-1, 9, 12) },
      { sku: '2101', productName: 'Coffee Grinder On-Demand 64mm', serial: '210101172', systemLocation: 'Bin 03', countedLocation: 'Bin 01', scannedAt: isoOffsetTs(-1, 9, 18) },
      { sku: '2101', productName: 'Coffee Grinder On-Demand 64mm', serial: '210101179', systemLocation: 'Bin 03', countedLocation: 'Bin 01', scannedAt: isoOffsetTs(-1, 9, 24) },
      { sku: '2101', productName: 'Coffee Grinder On-Demand 64mm', serial: '210101186', systemLocation: 'Bin 03', countedLocation: 'Bin 01', scannedAt: isoOffsetTs(-1, 9, 31) },
      // Bin 02 → Bin 01 (3)
      { sku: '2103', productName: 'Coffee Grinder Filter Bulk 98mm', serial: '210301044', systemLocation: 'Bin 02', countedLocation: 'Bin 01', scannedAt: isoOffsetTs(-1, 10, 5) },
      { sku: '2201', productName: 'Batch Brewer 2.5L Thermal', serial: '220100091', systemLocation: 'Bin 02', countedLocation: 'Bin 01', scannedAt: isoOffsetTs(-1, 10, 41) },
      { sku: '2101', productName: 'Coffee Grinder On-Demand 64mm', serial: '210101194', systemLocation: 'Bin 02', countedLocation: 'Bin 01', scannedAt: isoOffsetTs(-1, 10, 47) },
      // Bin 01 → Bin 03 (2)
      { sku: '2101', productName: 'Coffee Grinder On-Demand 64mm', serial: '210101183', systemLocation: 'Bin 01', countedLocation: 'Bin 03', scannedAt: isoOffsetTs(-1, 11, 2) },
      { sku: '2103', productName: 'Coffee Grinder Filter Bulk 98mm', serial: '210301051', systemLocation: 'Bin 01', countedLocation: 'Bin 03', scannedAt: isoOffsetTs(-1, 11, 9) },
      // Bin 01 → Bin 02 (3)
      { sku: '2103', productName: 'Coffee Grinder Filter Bulk 98mm', serial: '210301058', systemLocation: 'Bin 01', countedLocation: 'Bin 02', scannedAt: isoOffsetTs(-1, 11, 20) },
      { sku: '2103', productName: 'Coffee Grinder Filter Bulk 98mm', serial: '210301065', systemLocation: 'Bin 01', countedLocation: 'Bin 02', scannedAt: isoOffsetTs(-1, 11, 26) },
      { sku: '2201', productName: 'Batch Brewer 2.5L Thermal', serial: '220100108', systemLocation: 'Bin 01', countedLocation: 'Bin 02', scannedAt: isoOffsetTs(-1, 11, 33) },
      // Bin 03 → Bin 02 (3)
      { sku: '2201', productName: 'Batch Brewer 2.5L Thermal', serial: '220100115', systemLocation: 'Bin 03', countedLocation: 'Bin 02', scannedAt: isoOffsetTs(-1, 12, 2) },
      { sku: '2201', productName: 'Batch Brewer 2.5L Thermal', serial: '220100122', systemLocation: 'Bin 03', countedLocation: 'Bin 02', scannedAt: isoOffsetTs(-1, 12, 9) },
      { sku: '2101', productName: 'Coffee Grinder On-Demand 64mm', serial: '210101201', systemLocation: 'Bin 03', countedLocation: 'Bin 02', scannedAt: isoOffsetTs(-1, 12, 15) },
    ]
  }

  // Demo scenario — an OPEN count task holding ONE SKU across three bins, which
  // the generated data can't produce on its own (the storage model tiles SKUs so
  // each one belongs to a single bin). Coffee Scale 2kg / 0.1g sits in Bin 01,
  // Bin 02 and Bin 03; Knock Box Drawer sits in Bin 01 only, so the contrast
  // between a multi-bin product and a single-bin one is visible side by side.
  // Left "not_started" (Open) because removing a product is a drafting decision.
  const multiBinDemo = out.find(r => r.kind === 'count' && r.warehouseId === 'wh-010' && r.id !== 'cc-006')
  if (multiBinDemo) {
    multiBinDemo.status = 'not_started'
    multiBinDemo.startDate = undefined
    multiBinDemo.endDate = undefined
    multiBinDemo.lines = [
      { sku: '3004', qty: 0, prevQty: 6, location: 'Bin 01' },
      { sku: '3004', qty: 0, prevQty: 4, location: 'Bin 02' },
      { sku: '3004', qty: 0, prevQty: 3, location: 'Bin 03' },
      { sku: '3006', qty: 0, prevQty: 14, location: 'Bin 01' },
    ]
  }
  return out
}

// Bumped to v8 — adds the multi-bin Open count task demo above.
const KEY = 'wms-stock-adjustments-v8'
const snapshot = loadSnapshot<StockAdjustment>(KEY)
export const wmsStockAdjustments = reactive<StockAdjustment[]>(snapshot ?? generate())

function persist(): void {
  saveSnapshot(KEY, wmsStockAdjustments)
}

const ACTOR = 'Rizal Candra'

// approveWmsAdjustment() guarantees every completed cycle count mirrors into the
// ERP Stock counts index (see below). Seed data generated directly as 'completed'
// skips that runtime flow, so without this backfill a cycle count that's
// "always been" completed (never actually approved this session) would show no
// linked Stock count — breaking that same guarantee. Idempotent: only fills in
// records that don't already have a mirror (from a prior run or real approval).
function backfillCompletedMirrors(): void {
  for (const a of wmsStockAdjustments) {
    if (a.kind !== 'count' || a.status !== 'completed') continue
    if (stockAdjustments.some((sa) => sa.linkedCycleCountId === a.id)) continue
    const lines = a.lines ?? adjustmentLineItems(a).map((l) => ({ sku: l.sku, qty: l.counted }))
    addAdjustment({
      kind: 'count',
      date: (a.endDate ?? a.date).slice(0, 10),
      warehouseId: a.warehouseId,
      warehouseName: a.warehouseName,
      category: 'Stock count',
      tags: [],
      lines,
      linkedCycleCountId: a.id,
      status: 'completed',
      approvedBy: a.approvedBy ?? ACTOR,
      approvedAt: a.approvedAt ?? a.endDate ?? a.date,
    })
  }
}
backfillCompletedMirrors()

export function getWmsAdjustment(id: string): StockAdjustment | undefined {
  return wmsStockAdjustments.find((a) => a.id === id)
}

export function wmsAdjustmentWarehouseOptions(): { value: string; label: string }[] {
  const seen = new Map<string, string>()
  for (const a of wmsStockAdjustments) seen.set(a.warehouseId, a.warehouseName)
  return [...seen.entries()].map(([value, label]) => ({ value, label }))
}

/** Count tasks still open (not yet counted, completed, or closed) — badge for the "Count task" tab. */
export function openWmsCountTaskCount(): number {
  return wmsStockAdjustments.filter((a) => a.kind === 'count' && a.status !== 'completed' && a.status !== 'counted' && a.status !== 'closed').length
}

/** Count tasks counted but not yet reviewed by a manager — badge for the "Awaiting approval" tab. */
export function awaitingWmsCountApprovalCount(): number {
  return wmsStockAdjustments.filter((a) => a.kind === 'count' && a.status === 'counted').length
}

/** A WMS Stock In/Out record is completed the instant it's created (stock applies
 *  immediately, no draft window) — nothing is ever cancelable there. A Cycle Count
 *  task is cancelable while not yet started or still being counted; once finished,
 *  applyStockCount has already run and the record is a permanent one. */
export function canCancelWmsAdjustment(a: StockAdjustment): boolean {
  return a.kind === 'count' && (a.status === 'not_started' || a.status === 'in_progress')
}

/** Cancel a not-yet-finished cycle count — it never gets counted/applied. Terminal
 *  state; the record itself is kept (never deleted) so it stays in the audit trail. */
export function cancelWmsAdjustment(id: string, reason?: string): void {
  const a = wmsStockAdjustments.find((x) => x.id === id)
  if (!a || !canCancelWmsAdjustment(a)) return
  a.status = 'canceled'
  a.canceledDate = new Date().toISOString()
  if (reason) a.canceledReason = reason
  persist()
}

/** Same eligibility as cancel — an operator can only close a count that hasn't
 *  been submitted for approval yet. */
export function canCloseWmsCount(a: StockAdjustment): boolean {
  return a.kind === 'count' && (a.status === 'not_started' || a.status === 'in_progress')
}

/** Close a cycle count task the operator is walking away from mid-count — any
 *  counted quantities saved so far are discarded (a.lines cleared) so the
 *  details page shows every SKU as uncounted, not a stale partial result.
 *  Terminal, view-only; the record itself is kept for the audit trail, same
 *  as cancel — just a distinct status/label so it doesn't read as "never
 *  happened" when real counting work may have gone into it. */
export function closeWmsCount(id: string, reason?: string): void {
  const a = wmsStockAdjustments.find((x) => x.id === id)
  if (!a || !canCloseWmsCount(a)) return
  a.status = 'closed'
  a.lines = undefined
  a.canceledDate = new Date().toISOString()
  if (reason) a.canceledReason = reason
  persist()
}

let addSeq = wmsStockAdjustments.length

function nextSeqFor(kind: AdjustmentKind): number {
  const prefix = kind === 'count' ? 'Cycle Count' : 'Stock In/Out'
  const used = wmsStockAdjustments
    .filter((a) => a.number.startsWith(prefix))
    .map((a) => Number(a.number.replace(/\D/g, '')) || 0)
  return Math.max(20089, ...used) + 1
}

/** Create a WMS adjustment — applied to stock immediately, no approval step.
 *  `skipStockMutation`: the caller already mutated stock itself (e.g. the
 *  inbound PO-cancellation cascade, which must reverse batch/serial-tracked
 *  SKUs via their own dedicated primitives — applyStockInOut only touches the
 *  aggregate onHand and would desync a batch/serial SKU's per-unit bookkeeping)
 *  — this just records the audited adjustment without mutating stock again. */
export function addWmsAdjustment(input: AdjustmentInput & { skipStockMutation?: boolean }): StockAdjustment {
  const n = addSeq++
  const adj: StockAdjustment = {
    id: `${input.kind === 'count' ? 'cc' : 'wsa'}-new-${n}`,
    kind: input.kind,
    number: `${input.kind === 'count' ? 'Cycle Count' : 'Stock In/Out'} #${nextSeqFor(input.kind)}`,
    date: input.date,
    warehouseId: input.warehouseId,
    warehouseName: input.warehouseName,
    category: input.category,
    account: accountForCategory(input.category),
    status: input.kind === 'count' ? 'not_started' : 'completed',
    tags: input.tags,
    memo: input.memo,
    lines: input.lines,
    assignee: input.assignee,
    startDate: input.startDate,
    endDate: input.endDate,
  }
  // Count tasks: stock applied when counting is completed, not on creation.
  if (input.kind === 'in-out' && !input.skipStockMutation) {
    applyStockInOut(input.warehouseId, input.lines)
  }
  wmsStockAdjustments.unshift(adj)
  persist()
  return adj
}

export type WmsInOutCheck = { ok: true } | { ok: false; reason: string }

/**
 * Can this stock in/out be applied? A negative ("out") line must not remove more
 * than is on hand, nor eat into stock already reserved for open orders — either
 * would break `available = onHand − reserved`. Positive ("in") lines are always
 * fine. Cycle-count adjustments don't mutate stock here, so they always pass.
 */
export function canApplyWmsInOut(input: Pick<AdjustmentInput, 'kind' | 'warehouseId' | 'lines'>): WmsInOutCheck {
  if (input.kind !== 'in-out') return { ok: true }
  const v = stockOutViolation(input.warehouseId, input.lines)
  if (v) {
    return { ok: false, reason: `STOCK_OUT_EXCEEDS_AVAILABLE: ${v.sku} (out ${v.requested}, on-hand ${v.onHand}, available ${v.available})` }
  }
  return { ok: true }
}

/**
 * Guarded `addWmsAdjustment`: for a stock in/out, refuses (without mutating
 * stock) when the out-quantities would drive a SKU negative or below reserved.
 * The UI calls this; the raw `addWmsAdjustment` stays for internal callers that
 * pass `skipStockMutation` (e.g. the inbound cancel cascade).
 */
export function addWmsAdjustmentSafe(
  input: AdjustmentInput & { skipStockMutation?: boolean },
): { ok: true; adjustment: StockAdjustment } | { ok: false; reason: string } {
  const check = canApplyWmsInOut(input)
  if (!check.ok) return check
  return { ok: true, adjustment: addWmsAdjustment(input) }
}

export function startWmsCount(id: string): StockAdjustment | undefined {
  const a = wmsStockAdjustments.find(x => x.id === id)
  if (!a || a.kind !== 'count' || a.status !== 'not_started') return a
  a.status = 'in_progress'
  a.startDate = new Date().toISOString()
  // Freeze the plan as explicit zero-qty lines the moment counting actually
  // starts — otherwise adjustmentLineItems() falls back to fabricating random
  // "counted" numbers for any count with no real a.lines yet (meant to keep
  // pre-seeded demo records looking busy), which would wrongly show up as if
  // real progress had been made on a task nobody has touched, the instant its
  // status flips to in_progress (even via Cancel, with nothing ever saved).
  if (!a.lines) {
    a.lines = adjustmentLineItems(a).map(l => ({ sku: l.sku, qty: 0, location: l.storageLocation }))
  }
  persist()
  return a
}

export function saveWmsCountDraft(
  id: string,
  lines: { sku: string; qty: number; location?: string }[],
  misplacedSerials?: MisplacedSerial[],
): StockAdjustment | undefined {
  const a = wmsStockAdjustments.find(x => x.id === id)
  if (!a || a.kind !== 'count') return a
  a.lines = lines
  a.misplacedSerials = misplacedSerials?.length ? misplacedSerials : undefined
  persist()
  return a
}

/** A manager (or whoever's reconciling the count) has raised a warehouse transfer
 *  for one or more misplaced-serial notes — drop them off the record, since the
 *  note's only job was to surface the mismatch until a transfer existed to fix it.
 *  Clearing the field entirely once nothing's left keeps the review page's "no
 *  misplaced serials" section hidden the same way it starts out (see
 *  saveWmsCountDraft/finishWmsCount, which apply the same undefined-when-empty rule). */
export function resolveMisplacedSerials(id: string, serials: string[]): StockAdjustment | undefined {
  const a = wmsStockAdjustments.find(x => x.id === id)
  if (!a?.misplacedSerials?.length) return a
  const remaining = a.misplacedSerials.filter(m => !serials.includes(m.serial))
  a.misplacedSerials = remaining.length ? remaining : undefined
  persist()
  return a
}

// Finishing a count doesn't apply stock yet — it moves the task to "Counted"
// (Awaiting approval tab) and waits for a manager to review it. Stock only
// changes once approveWmsAdjustment runs.
export function finishWmsCount(
  id: string,
  lines: { sku: string; qty: number; location?: string }[],
  misplacedSerials?: MisplacedSerial[],
): StockAdjustment | undefined {
  const a = wmsStockAdjustments.find(x => x.id === id)
  if (!a || a.kind !== 'count') return a
  a.status = 'counted'
  a.endDate = new Date().toISOString()
  a.lines = lines
  a.misplacedSerials = misplacedSerials?.length ? misplacedSerials : undefined
  persist()
  return a
}

/** Manager approves a "Counted" task — applies the count to stock, marks it completed,
 *  and mirrors it into the ERP Stock counts index as a completed record. */
export function approveWmsAdjustment(id: string): StockAdjustment | undefined {
  const a = wmsStockAdjustments.find((x) => x.id === id)
  if (!a || a.status !== 'counted') return a
  const lines = a.lines ?? adjustmentLineItems(a).map((l) => ({ sku: l.sku, qty: l.counted }))
  // Snapshot on-hand BEFORE applying the count — this is the "previous qty" the
  // mirrored ERP record shows, same as the real state at the moment of approval.
  const prevBySku = new Map((getWarehouseDetail(a.warehouseId)?.stock ?? []).map((s) => [s.sku, s.onHand]))
  applyStockCount(a.warehouseId, lines)
  a.status = 'completed'
  a.approvedBy = ACTOR
  a.approvedAt = new Date().toISOString()
  persist()
  addAdjustment({
    kind: 'count',
    date: new Date().toISOString().slice(0, 10),
    warehouseId: a.warehouseId,
    warehouseName: a.warehouseName,
    category: 'Stock count',
    tags: [],
    lines: lines.map((l) => ({ ...l, prevQty: prevBySku.get(l.sku) ?? 0 })),
    linkedCycleCountId: a.id,
    status: 'completed',
    approvedBy: a.approvedBy,
    approvedAt: a.approvedAt,
  })
  return a
}

export function updateWmsAdjustment(id: string, input: AdjustmentInput): StockAdjustment | undefined {
  const a = wmsStockAdjustments.find((x) => x.id === id)
  if (!a) return undefined
  Object.assign(a, {
    date: input.date,
    warehouseId: input.warehouseId,
    warehouseName: input.warehouseName,
    category: input.category,
    account: accountForCategory(input.category),
    tags: input.tags,
    memo: input.memo,
    lines: input.lines,
    // A count task's assignee is editable too — without this, reassigning on the
    // edit form would look saved and silently revert on the next read.
    ...(input.assignee !== undefined ? { assignee: input.assignee } : {}),
  })
  persist()
  return a
}

export function activeWmsAdjustmentsFor(warehouseId: string, assignee: string): StockAdjustment[] {
  return wmsStockAdjustments.filter(
    (a) => a.warehouseId === warehouseId && a.assignee === assignee && a.status !== 'completed',
  );
}

export function reassignWmsAdjustments(warehouseId: string, fromName: string, toName: string): void {
  for (const a of activeWmsAdjustmentsFor(warehouseId, fromName)) a.assignee = toName;
  persist();
}

export { accountForCategory, accountCodeFor, adjustmentLineItems }
