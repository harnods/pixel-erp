/**
 * WMS Reports & Analytics — the computed metric layer behind the WMS → Overview
 * dashboard (docs/prd/wms-reports-analytics-prd.md).
 *
 * Everything here is DERIVED from the existing operational datasets (receipts +
 * receiving/put-away tasks on the inbound side, outgoing orders + picking/packing/
 * delivery tasks on the outbound side), so every number on the dashboard stays
 * coherent with what the Inbound/Outbound delivery lists actually show. Nothing
 * is faked — durations come from the tasks' real start/end timestamps, volumes
 * from their real qty fields, accuracy from received/shipped vs expected qty.
 *
 * The PRD splits the page in two:
 *   • Operational (live)  — "right now" counts per stage, bucketed on-time/late/early.
 *   • Post-operational    — duration, timeliness, volume and accuracy over a period.
 */
import { receipts } from './receipts'
import { receivingTasks } from './receivingTasks'
import { putAwayTasks } from './putAwayTasks'
import { outgoingOrders } from './outgoing'
import { pickingTasks } from './pickingTasks'
import { packingTasks } from './packingTasks'
import { deliveryTasks } from './deliveryTasks'
import { lineItemsForReceipt } from './receiptLineItems'
import { orderSkuLines } from './inventory'
import { TODAY } from './master'

// ── Filter shape ────────────────────────────────────────────────────────────
export interface AnalyticsFilter {
  /** warehouse id, or 'all' */
  warehouseId: string
  /** operator (assignee) name, or 'all' */
  operator: string
  /** performance period, inclusive, in days back from TODAY */
  periodDays: number
}

export const DEFAULT_FILTER: AnalyticsFilter = { warehouseId: 'all', operator: 'all', periodDays: 30 }

// ── Small date / stats helpers ────────────────────────────────────────────────
const MS_DAY = 86_400_000
function parse(d?: string): Date | null {
  if (!d) return null
  const t = new Date(d)
  return isNaN(t.getTime()) ? null : t
}
/** minutes between two ISO timestamps, floored at 0 (PRD: any duration ≤ 0 → 0). */
function durMin(from?: string, to?: string): number | null {
  const a = parse(from), b = parse(to)
  if (!a || !b) return null
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000))
}
/** signed minutes (can be negative) — for timeliness (closed vs expected). */
function signedMin(from?: string, to?: string): number | null {
  const a = parse(from), b = parse(to)
  if (!a || !b) return null
  return Math.round((b.getTime() - a.getTime()) / 60000)
}
function avg(xs: number[]): number | null { return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null }
function median(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}
function periodStart(days: number): Date { return new Date(TODAY.getTime() - days * MS_DAY) }

/** Format a minutes duration as "3h 12m" / "46m" / "2d 4h". "-" for null. */
export function fmtDur(min: number | null): string {
  if (min == null) return '-'
  const sign = min < 0 ? '-' : ''
  let m = Math.round(Math.abs(min))
  const d = Math.floor(m / 1440); m -= d * 1440
  const h = Math.floor(m / 60); m -= h * 60
  if (d) return `${sign}${d}d ${h}h`
  if (h) return `${sign}${h}h ${String(m).padStart(2, '0')}m`
  return `${sign}${m}m`
}
/** Signed duration for timeliness ("+2h 15m" / "-45m"). */
export function fmtSignedDur(min: number | null): string {
  if (min == null) return '-'
  if (min === 0) return '0m'
  return (min > 0 ? '+' : '') + fmtDur(min)
}

// ── Types returned to the page ────────────────────────────────────────────────
export interface StageCard {
  key: string
  label: string          // e.g. "On receiving"
  state: string          // e.g. "ACTIVE" / "PENDING" / "CLOSED"
  caption: string        // descriptive count line, e.g. "Active receiving"
  count: number
  /** on-time / late / early split; `early` omitted where it doesn't apply */
  onTime: number
  late: number
  early?: number
  tone: 'neutral' | 'active' | 'closed'
}
export interface NoActionCard {
  count: number
  rows: { label: string; value: number }[]
}
export interface StageDuration {
  key: string
  label: string
  desc: string
  avg: number | null
  median: number | null
  /** true for the summary "cycle time" row (rendered as the full-width bar) */
  total?: boolean
}
export interface TimelinessBlock {
  label: string
  desc: string
  avg: number | null
  median: number | null
  signed?: boolean
}
export interface VolumeCard {
  label: string
  hint?: string
  main: number
  rows: { label: string; value: string }[]
}
export interface CompletionState {
  refLabel: string
  refCount: number
  states: { key: 'match' | 'short' | 'over'; label: string; count: number; pct: number }[]
  qtyRows: { label: string; qty: number; pct: number | null }[]
}
export interface DirectionAnalytics {
  live: { asOf: string; stages: StageCard[]; noAction: NoActionCard }
  performance: {
    stages: StageDuration[]
    timeliness: TimelinessBlock[]
    volume: VolumeCard[]
    activityRatios: { label: string; value: number }[]
    accuracy: CompletionState
  }
}

// ── Number formatting (Indonesian grouping to match the app) ──────────────────
function grp(n: number): string { return Math.round(n).toLocaleString('id-ID') }
function dec1(n: number): string { return (Math.round(n * 10) / 10).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }
function pct1(n: number): string { return (Math.round(n * 10) / 10).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%' }

// ── Scope filters ─────────────────────────────────────────────────────────────
function whOk(f: AnalyticsFilter, warehouseId: string): boolean {
  return f.warehouseId === 'all' || f.warehouseId === warehouseId
}
function opOk(f: AnalyticsFilter, assignee?: string): boolean {
  return f.operator === 'all' || f.operator === assignee
}
function inPeriod(f: AnalyticsFilter, d?: string): boolean {
  const dt = parse(d)
  if (!dt) return false
  return dt >= periodStart(f.periodDays) && dt <= TODAY
}

// A stage's on-time/late/early split relative to an expected date. Active work is
// judged against TODAY; closed work against its actual close date.
function timelinessBucket(expected?: string, actual?: string): 'onTime' | 'late' | 'early' {
  const exp = parse(expected)
  const act = parse(actual) ?? TODAY
  if (!exp) return 'onTime'
  const deltaDays = (act.getTime() - exp.getTime()) / MS_DAY
  if (deltaDays > 0.5) return 'late'
  if (deltaDays < -0.5) return 'early'
  return 'onTime'
}

// `foldEarly` — for not-yet-started (pending) work there is no "early"; a future
// expected date just means it isn't late yet, so early folds into on-time.
function splitCounts(items: { expected?: string; actual?: string }[], foldEarly = false): { onTime: number; late: number; early: number } {
  const out = { onTime: 0, late: 0, early: 0 }
  for (const it of items) {
    const b = timelinessBucket(it.expected, it.actual)
    if (foldEarly && b === 'early') out.onTime++
    else out[b]++
  }
  return out
}

const timeOfDay = (() => TODAY.toTimeString().slice(0, 5))()

// ══════════════════════════════════════════════════════════════════════════════
// INBOUND
// ══════════════════════════════════════════════════════════════════════════════
export function inboundAnalytics(f: AnalyticsFilter): DirectionAnalytics {
  const recs = receipts.filter((r) => whOk(f, r.warehouseId) && r.status !== 'canceled')
  const recById = new Map(recs.map((r) => [r.id, r]))
  const recvAll = receivingTasks.filter((t) => whOk(f, t.warehouseId) && t.status !== 'canceled' && opOk(f, t.assignee))
  const putAll = putAwayTasks.filter((t) => whOk(f, t.warehouseId) && t.status !== 'canceled' && opOk(f, t.assignee))

  // A receipt is "closed" once its receiving is fully concluded — every receiving
  // task ended (completed, or received & awaiting put-away). Put-away Start/End is
  // out of scope in the mock (tasks stay 'open'), so receipts rarely reach the
  // 'completed' status; receiving completion is the meaningful close event here.
  const recvByReceipt = new Map<string, typeof recvAll>()
  for (const t of recvAll) { const a = recvByReceipt.get(t.receiptId) ?? []; a.push(t); recvByReceipt.set(t.receiptId, a) }
  function receiptClosed(r: { id: string }): boolean {
    const ts = recvByReceipt.get(r.id) ?? []
    return ts.length > 0 && ts.every((t) => t.status === 'completed' || t.status === 'pending put-away')
  }
  function receiptCloseDate(r: { id: string }): string | undefined {
    return (recvByReceipt.get(r.id) ?? []).map((t) => t.endDate).filter(Boolean).sort().slice(-1)[0]
  }

  // ── Live operations (current open work) ────────────────────────────────────
  // Pending = receipts with no receiving activity yet (status pending/open).
  const pendingRecs = recs.filter((r) => r.status === 'pending' || r.status === 'open')
  const onReceiving = recvAll.filter((t) => t.status === 'in progress')
  const onPutaway = putAll.filter((t) => t.status === 'open' || t.status === 'in progress')
  const closedRecs = recs.filter((r) => receiptClosed(r))

  const pSplit = splitCounts(pendingRecs.map((r) => ({ expected: r.estimatedArrival })), true)
  const rSplit = splitCounts(onReceiving.map((t) => ({ expected: recById.get(t.receiptId)?.estimatedArrival })))
  const uSplit = splitCounts(onPutaway.map((t) => ({ expected: recById.get(recvAll.find((r) => t.receivingTaskIds.includes(r.id))?.receiptId ?? '')?.estimatedArrival })))
  const cSplit = splitCounts(closedRecs.map((r) => ({ expected: r.estimatedArrival, actual: receiptCloseDate(r) })))

  const stages: StageCard[] = [
    { key: 'pending', label: 'Has not started', state: 'PENDING', caption: 'Pending receipts', count: pendingRecs.length, onTime: pSplit.onTime, late: pSplit.late, tone: 'neutral' },
    { key: 'receiving', label: 'On receiving', state: 'ACTIVE', caption: 'Active receiving', count: onReceiving.length, onTime: rSplit.onTime, late: rSplit.late, early: rSplit.early, tone: 'active' },
    { key: 'putaway', label: 'On putaway', state: 'ACTIVE', caption: 'Active putaway', count: onPutaway.length, onTime: uSplit.onTime, late: uSplit.late, early: uSplit.early, tone: 'active' },
    { key: 'closed', label: 'Closed', state: 'CLOSED', caption: 'Closed receipts', count: closedRecs.length, onTime: cSplit.onTime, late: cSplit.late, early: cSplit.early, tone: 'closed' },
  ]
  const noAction: NoActionCard = {
    count: pendingRecs.length + recvAll.filter((t) => t.status === 'open').length,
    rows: [
      { label: 'No task', value: pendingRecs.length },
      { label: 'Open receiving', value: recvAll.filter((t) => t.status === 'open').length },
      { label: 'Open putaway', value: putAll.filter((t) => t.status === 'open').length },
    ],
  }

  // ── Performance (period) ───────────────────────────────────────────────────
  const recvDone = recvAll.filter((t) => (t.status === 'completed' || t.status === 'pending put-away') && inPeriod(f, t.endDate))
  const putDone = putAll.filter((t) => t.status === 'completed' && inPeriod(f, t.endDate))
  const closedInPeriod = closedRecs.filter((r) => inPeriod(f, receiptCloseDate(r)))

  // durations
  const waitMin = recvDone.map((t) => durMin(t.createdDate, t.startDate)).filter((x): x is number => x != null)
  const recvMin = recvDone.map((t) => durMin(t.startDate, t.endDate)).filter((x): x is number => x != null)
  const putMin = putDone.map((t) => durMin(t.startDate, t.endDate)).filter((x): x is number => x != null)
  // cycle: first receiving created → last putaway end, per closed receipt
  const cycleMin: number[] = []
  for (const r of closedInPeriod) {
    const rTasks = recvAll.filter((t) => t.receiptId === r.id)
    const created = rTasks.map((t) => t.createdDate).filter(Boolean).sort()[0]
    const puts = putAll.filter((p) => p.receivingTaskIds.some((id) => rTasks.some((t) => t.id === id)))
    const end = puts.map((p) => p.endDate).filter(Boolean).sort().slice(-1)[0] ?? rTasks.map((t) => t.endDate).filter(Boolean).sort().slice(-1)[0]
    const d = durMin(created, end)
    if (d != null) cycleMin.push(d)
  }

  const stageDur: StageDuration[] = [
    { key: 'wait', label: 'Inbound created → receiving started', desc: 'Waiting time before the goods are touched', avg: avg(waitMin), median: median(waitMin) },
    { key: 'receiving', label: 'Receiving', desc: 'Receiving start until receiving finish', avg: avg(recvMin), median: median(recvMin) },
    { key: 'putaway', label: 'Putaway', desc: 'Receiving finish until putaway finish', avg: avg(putMin), median: median(putMin) },
    { key: 'cycle', label: 'Inbound cycle time', desc: 'Inbound created until putaway finish', avg: avg(cycleMin), median: median(cycleMin), total: true },
  ]

  // timeliness
  const toExpected = recvDone.map((t) => durMin(t.createdDate, recById.get(t.receiptId)?.estimatedArrival)).filter((x): x is number => x != null)
  const closedGap = closedInPeriod.map((r) => signedMin(r.estimatedArrival, receiptCloseDate(r))).filter((x): x is number => x != null)
  const timeliness: TimelinessBlock[] = [
    { label: 'Inbound → expected arrival', desc: 'Inbound created until the expected arrival date', avg: avg(toExpected), median: median(toExpected) },
    { label: 'Inbound timeliness', desc: 'Expected closed time vs actual closed time', avg: avg(closedGap), median: median(closedGap), signed: true },
  ]

  // volume — created (all non-cancelled receipts in period), closed, receiving, putaway
  const createdRecs = recs.filter((r) => inPeriod(f, r.receivedDate) || inPeriod(f, r.estimatedArrival))
  const createdSku = new Set<string>(), createdQty = sumQty(createdRecs.map((r) => { const li = lineItemsForReceipt(r); li.forEach((l) => createdSku.add(l.sku)); return li.reduce((s, l) => s + l.purchaseQty, 0) }))
  const closedSku = new Set<string>(); closedInPeriod.forEach((r) => lineItemsForReceipt(r).forEach((l) => closedSku.add(l.sku)))
  const closedQty = closedInPeriod.reduce((s, r) => s + r.receivedQty, 0)
  const recvSku = new Set<string>(); recvDone.forEach((t) => t.items.forEach((i) => recvSku.add(i.sku)))
  const recvQty = recvDone.reduce((s, t) => s + t.receivedQty, 0)
  const putSku = new Set<string>(); putDone.forEach((t) => (t.completedItems ?? []).forEach((i) => putSku.add(i.skuCode)))
  const putQty = putDone.reduce((s, t) => s + t.itemQty, 0)

  const volume: VolumeCard[] = [
    { label: 'Total inbound created', hint: 'Not including cancelled inbound', main: createdRecs.length,
      rows: [{ label: 'Inbound', value: grp(createdRecs.length) }, { label: 'Distinct SKU', value: grp(createdSku.size) }, { label: 'Total qty', value: grp(createdQty) }] },
    { label: 'Total closed inbound', main: closedInPeriod.length,
      rows: [{ label: 'Inbound', value: grp(closedInPeriod.length) }, { label: 'Distinct SKU', value: grp(closedSku.size) }, { label: 'Total qty', value: grp(closedQty) }] },
    { label: 'Total receiving', main: recvDone.length,
      rows: [{ label: 'Receivings', value: grp(recvDone.length) }, { label: 'Distinct SKU', value: grp(recvSku.size) }, { label: 'Avg SKU / receiving', value: dec1(recvDone.length ? recvSku.size / recvDone.length : 0) }, { label: 'Total qty received', value: grp(recvQty) }, { label: 'Avg qty / receiving', value: dec1(recvDone.length ? recvQty / recvDone.length : 0) }, { label: 'Of inbound qty', value: createdQty ? pct1((recvQty / createdQty) * 100) : '-' }] },
    { label: 'Total putaway', main: putDone.length,
      rows: [{ label: 'Putaways', value: grp(putDone.length) }, { label: 'Distinct SKU', value: grp(putSku.size) }, { label: 'Avg SKU / putaway', value: dec1(putDone.length ? putSku.size / putDone.length : 0) }, { label: 'Total qty put away', value: grp(putQty) }, { label: 'Avg qty / putaway', value: dec1(putDone.length ? putQty / putDone.length : 0) }, { label: 'Of inbound qty', value: createdQty ? pct1((putQty / createdQty) * 100) : '-' }] },
  ]
  const activityRatios = [
    { label: 'Receiving / inbound', value: round1(createdRecs.length ? recvDone.length / createdRecs.length : 0) },
    { label: 'Putaway / receiving', value: round1(recvDone.length ? putDone.length / recvDone.length : 0) },
  ]

  // accuracy — completion state per closed receipt (received vs purchase qty)
  const acc = completionSplit(closedInPeriod.map((r) => ({ expected: r.purchaseQty, actual: r.receivedQty })))
  const accuracy: CompletionState = {
    refLabel: 'Total closed inbound', refCount: closedInPeriod.length,
    states: acc.states,
    qtyRows: [
      { label: 'Total receive qty', qty: recvQty, pct: createdQty ? (recvQty / createdQty) * 100 : null },
      { label: 'Total putaway qty', qty: putQty, pct: createdQty ? (putQty / createdQty) * 100 : null },
    ],
  }

  return { live: { asOf: timeOfDay, stages, noAction }, performance: { stages: stageDur, timeliness, volume, activityRatios, accuracy } }
}

// ══════════════════════════════════════════════════════════════════════════════
// OUTBOUND
// ══════════════════════════════════════════════════════════════════════════════
export function outboundAnalytics(f: AnalyticsFilter): DirectionAnalytics {
  const orders = outgoingOrders.filter((o) => whOk(f, o.warehouseId) && o.status !== 'canceled')
  const orderById = new Map(orders.map((o) => [o.id, o]))
  const pickAll = pickingTasks.filter((t) => whOk(f, t.warehouseId) && t.status !== 'canceled' && opOk(f, t.assignee))
  const packAll = packingTasks.filter((t) => whOk(f, t.warehouseId) && t.status !== 'canceled' && opOk(f, t.assignee))
  const shipAll = deliveryTasks.filter((t) => whOk(f, t.warehouseId) && t.status !== 'canceled' && opOk(f, t.assignee))

  const pendingOrders = orders.filter((o) => o.status === 'pending' || o.status === 'open')
  const onPicking = pickAll.filter((t) => t.status === 'in progress' || t.status === 'partially picked')
  const onPacking = packAll.filter((t) => t.status === 'in progress')
  const onShipping = shipAll.filter((t) => t.status === 'ready to ship' || t.status === 'out for delivery')
  const closedOrders = orders.filter((o) => o.status === 'completed')

  const expOf = (o?: { dueDate?: string }) => o?.dueDate
  const pSplit = splitCounts(pendingOrders.map((o) => ({ expected: o.dueDate })), true)
  const kSplit = splitCounts(onPicking.map((t) => ({ expected: expOf(orderById.get(t.salesOrderIds[0] ?? '')) })))
  const gSplit = splitCounts(onPacking.map((t) => ({ expected: expOf(orderById.get(t.salesOrderId)) })))
  const hSplit = splitCounts(onShipping.map((t) => ({ expected: expOf(orderById.get(t.salesOrderId)) })))
  const cSplit = splitCounts(closedOrders.map((o) => ({ expected: o.dueDate, actual: o.shippedDate })))

  const stages: StageCard[] = [
    { key: 'pending', label: 'Has not started', state: 'PENDING', caption: 'Pending orders', count: pendingOrders.length, onTime: pSplit.onTime, late: pSplit.late, tone: 'neutral' },
    { key: 'picking', label: 'On picking', state: 'ACTIVE', caption: 'Active picking', count: onPicking.length, onTime: kSplit.onTime, late: kSplit.late, early: kSplit.early, tone: 'active' },
    { key: 'packing', label: 'On packing', state: 'ACTIVE', caption: 'Active packing', count: onPacking.length, onTime: gSplit.onTime, late: gSplit.late, early: gSplit.early, tone: 'active' },
    { key: 'shipping', label: 'On shipping', state: 'ACTIVE', caption: 'Active shipping', count: onShipping.length, onTime: hSplit.onTime, late: hSplit.late, early: hSplit.early, tone: 'active' },
    { key: 'closed', label: 'Closed', state: 'CLOSED', caption: 'Closed orders', count: closedOrders.length, onTime: cSplit.onTime, late: cSplit.late, early: cSplit.early, tone: 'closed' },
  ]
  const noAction: NoActionCard = {
    count: pendingOrders.length + pickAll.filter((t) => t.status === 'open').length,
    rows: [
      { label: 'No task', value: pendingOrders.length },
      { label: 'Open picking', value: pickAll.filter((t) => t.status === 'open').length },
      { label: 'Open packing', value: packAll.filter((t) => t.status === 'open').length },
      { label: 'Open shipping', value: shipAll.filter((t) => t.status === 'ready to ship').length },
    ],
  }

  const pickDone = pickAll.filter((t) => t.status === 'completed' && inPeriod(f, t.endDate))
  const packDone = packAll.filter((t) => t.status === 'completed' && inPeriod(f, t.endDate))
  const shipDone = shipAll.filter((t) => t.status === 'shipped' && inPeriod(f, t.shippedDate))
  const closedInPeriod = closedOrders.filter((o) => inPeriod(f, o.shippedDate))

  // Seed orders carry no created timestamp — fall back to the order's earliest
  // linked picking start (a real timestamp) so cycle/wait derive from real data.
  const firstPickStart = (orderId: string): string | undefined =>
    pickAll.filter((t) => t.salesOrderIds.includes(orderId)).map((t) => t.startDate).filter(Boolean).sort()[0]
  const createdRef = (o?: { id: string; createdAt?: string; transactionDate?: string }): string | undefined =>
    o ? (o.createdAt ?? o.transactionDate ?? firstPickStart(o.id)) : undefined

  const waitMin = pickDone.map((t) => durMin(createdRef(orderById.get(t.salesOrderIds[0] ?? '')), t.startDate)).filter((x): x is number => x != null)
  const pickMin = pickDone.map((t) => durMin(t.startDate, t.endDate)).filter((x): x is number => x != null)
  const packMin = packDone.map((t) => durMin(t.startDate, t.endDate)).filter((x): x is number => x != null)
  const shipMin = shipDone.map((t) => durMin(packById(packAll, t)?.endDate, t.shippedDate)).filter((x): x is number => x != null)
  const cycleMin = closedInPeriod.map((o) => durMin(createdRef(o), o.shippedDate)).filter((x): x is number => x != null)

  const stageDur: StageDuration[] = [
    { key: 'wait', label: 'Outbound created → picking started', desc: 'Waiting time before picking begins', avg: avg(waitMin), median: median(waitMin) },
    { key: 'picking', label: 'Picking', desc: 'Picking start until picking finish', avg: avg(pickMin), median: median(pickMin) },
    { key: 'packing', label: 'Packing', desc: 'Picking finish until packing finish', avg: avg(packMin), median: median(packMin) },
    { key: 'shipping', label: 'Shipping', desc: 'Packing finish until handed to courier', avg: avg(shipMin), median: median(shipMin) },
    { key: 'cycle', label: 'Outbound cycle time', desc: 'Outbound created until shipped', avg: avg(cycleMin), median: median(cycleMin), total: true },
  ]

  const toExpected = pickDone.map((t) => durMin(createdRef(orderById.get(t.salesOrderIds[0] ?? '')), expOf(orderById.get(t.salesOrderIds[0] ?? '')))).filter((x): x is number => x != null)
  const closedGap = closedInPeriod.map((o) => signedMin(o.dueDate, o.shippedDate)).filter((x): x is number => x != null)
  const timeliness: TimelinessBlock[] = [
    { label: 'Outbound → expected completion', desc: 'Outbound created until the expected completion date', avg: avg(toExpected), median: median(toExpected) },
    { label: 'Outbound timeliness', desc: 'Expected closed time vs actual closed time', avg: avg(closedGap), median: median(closedGap), signed: true },
  ]

  const createdOrders = orders.filter((o) => inPeriod(f, o.shippedDate) || inPeriod(f, o.dueDate) || inPeriod(f, o.createdAt))
  const createdSku = new Set<string>(), createdQty = sumQty(createdOrders.map((o) => { const li = orderSkuLines(o); li.forEach((l) => createdSku.add(l.sku)); return li.reduce((s, l) => s + l.qty, 0) }))
  const closedSku = new Set<string>(), closedQty = sumQty(closedInPeriod.map((o) => { const li = orderSkuLines(o); li.forEach((l) => closedSku.add(l.sku)); return li.reduce((s, l) => s + l.qty, 0) }))
  const pickSku = new Set<string>(); pickDone.forEach((t) => (t.lines ?? []).forEach((l) => pickSku.add(l.sku)))
  const pickQty = pickDone.reduce((s, t) => s + t.pickedQty, 0)
  const packQty = packDone.reduce((s, t) => s + t.packedQty, 0)
  const shipQty = shipDone.reduce((s, t) => s + t.shippedQty, 0)

  const volume: VolumeCard[] = [
    { label: 'Total outbound created', hint: 'Not including cancelled outbound', main: createdOrders.length,
      rows: [{ label: 'Outbound', value: grp(createdOrders.length) }, { label: 'Distinct SKU', value: grp(createdSku.size) }, { label: 'Total qty', value: grp(createdQty) }] },
    { label: 'Total closed outbound', main: closedInPeriod.length,
      rows: [{ label: 'Outbound', value: grp(closedInPeriod.length) }, { label: 'Distinct SKU', value: grp(closedSku.size) }, { label: 'Total qty', value: grp(closedQty) }] },
    { label: 'Total picking', main: pickDone.length,
      rows: [{ label: 'Pickings', value: grp(pickDone.length) }, { label: 'Distinct SKU', value: grp(pickSku.size) }, { label: 'Avg SKU / picking', value: dec1(pickDone.length ? pickSku.size / pickDone.length : 0) }, { label: 'Total qty picked', value: grp(pickQty) }, { label: 'Of outbound qty', value: createdQty ? pct1((pickQty / createdQty) * 100) : '-' }] },
    { label: 'Total packing', main: packDone.length,
      rows: [{ label: 'Packings', value: grp(packDone.length) }, { label: 'Avg qty / packing', value: dec1(packDone.length ? packQty / packDone.length : 0) }, { label: 'Total qty packed', value: grp(packQty) }, { label: 'Of outbound qty', value: createdQty ? pct1((packQty / createdQty) * 100) : '-' }] },
    { label: 'Total shipping', main: shipDone.length,
      rows: [{ label: 'Shippings', value: grp(shipDone.length) }, { label: 'Total qty shipped', value: grp(shipQty) }, { label: 'Of outbound qty', value: createdQty ? pct1((shipQty / createdQty) * 100) : '-' }] },
  ]
  const activityRatios = [
    { label: 'Picking / outbound', value: round1(createdOrders.length ? pickDone.length / createdOrders.length : 0) },
    { label: 'Packing / picking', value: round1(pickDone.length ? packDone.length / pickDone.length : 0) },
    { label: 'Shipping / packing', value: round1(packDone.length ? shipDone.length / packDone.length : 0) },
  ]

  const acc = completionSplit(closedInPeriod.map((o) => ({ expected: o.orderQty, actual: o.shippedQty })))
  const accuracy: CompletionState = {
    refLabel: 'Total closed outbound', refCount: closedInPeriod.length,
    states: acc.states,
    qtyRows: [
      { label: 'Total picked qty', qty: pickQty, pct: createdQty ? (pickQty / createdQty) * 100 : null },
      { label: 'Total packed qty', qty: packQty, pct: createdQty ? (packQty / createdQty) * 100 : null },
      { label: 'Total shipped qty', qty: shipQty, pct: createdQty ? (shipQty / createdQty) * 100 : null },
    ],
  }

  return { live: { asOf: timeOfDay, stages, noAction }, performance: { stages: stageDur, timeliness, volume, activityRatios, accuracy } }
}

// ── shared bits ──────────────────────────────────────────────────────────────
function sumQty(perRecord: number[]): number { return perRecord.reduce((s, x) => s + x, 0) }
function round1(n: number): number { return Math.round(n * 10) / 10 }
function packById(packs: { salesOrderId: string; endDate?: string; status: string }[], ship: { salesOrderId: string }) {
  return packs.find((p) => p.salesOrderId === ship.salesOrderId && p.status === 'completed')
}
/** Split a set of {expected, actual} qty pairs into match / short / over. Blind
 *  activity (expected = 0) is excluded from the % base but not from totals. */
function completionSplit(pairs: { expected: number; actual: number }[]) {
  let match = 0, short = 0, over = 0
  for (const p of pairs) {
    if (p.expected <= 0) continue
    if (p.actual === p.expected) match++
    else if (p.actual < p.expected) short++
    else over++
  }
  const total = match + short + over
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0)
  return {
    states: [
      { key: 'match' as const, label: 'Match expected', count: match, pct: pct(match) },
      { key: 'short' as const, label: 'Short expected', count: short, pct: pct(short) },
      { key: 'over' as const, label: 'Over expected', count: over, pct: pct(over) },
    ],
  }
}

// ── Operator options (union of assignees for the filter dropdown) ─────────────
export function operatorOptions(direction: 'inbound' | 'outbound', warehouseId: string): string[] {
  const src = direction === 'inbound'
    ? [...receivingTasks, ...putAwayTasks]
    : [...pickingTasks, ...packingTasks, ...deliveryTasks]
  const names = new Set<string>()
  for (const t of src) {
    if ((warehouseId === 'all' || t.warehouseId === warehouseId) && t.assignee) names.add(t.assignee)
  }
  return [...names].sort()
}
