/**
 * Inbound operational quick view — live daily metrics for the Analytics page's
 * Operational section (WMS PRD 1.4). Everything is derived from the shared
 * mini-DB (receipts + receiving + put-away tasks), filtered by warehouse, a
 * single date, and an operator, so the cards always agree with the Inbound
 * delivery pages they drill into.
 *
 * Metric definitions follow the PRD:
 *  - Pending: receipt completion status PENDING with no non-cancelled receiving
 *    or put-away task. Operator filter does NOT apply. Split by estimated
 *    arrival == date (due) vs < date (overdue).
 *  - On receiving / on put-away: at least one task IN PROGRESS whose start date
 *    is the filtered date; the distinct parent receipts, classified due/late/
 *    early by the receipt's estimated arrival vs the date. Operator applies.
 *  - Closed: receipts completed/closed on the date. Operator does NOT apply.
 *  - No ongoing action: in-progress receipts with nothing actively worked on —
 *    plus open (not-started) receiving / put-away task counts. Operator applies.
 */
import { receipts, type Receipt } from './receipts'
import { receivingTasks, type ReceivingTask } from './receivingTasks'
import { putAwayTasks, type PutAwayTask } from './putAwayTasks'
import { warehouses } from './warehouses'

export interface QuickViewFilters {
  /** 'all' or a warehouse id (e.g. 'wh-001'). */
  warehouseId: string
  /** ISO date 'YYYY-MM-DD'. */
  date: string
  /** 'all' (no filter), 'none' (unassigned tasks), or an exact assignee name. */
  operator: string
}

export interface QuickViewMetrics {
  pending: { total: number; due: number; overdue: number }
  receiving: { total: number; due: number; late: number; early: number }
  putaway: { total: number; due: number; late: number; early: number }
  closed: { total: number; onTime: number; late: number; early: number }
  idle: { none: number; receivingOpen: number; putawayOpen: number }
}

const dayOf = (iso: string | undefined): string => (iso ? iso.slice(0, 10) : '')

/** Active, non-default warehouses — the Warehouse filter's option set. */
export function quickViewWarehouseOptions(): { value: string; label: string }[] {
  const opts = warehouses
    .filter((w) => !w.isDefault && w.status === 'active')
    .map((w) => ({ value: w.id, label: w.name }))
  return [{ value: 'all', label: 'All warehouses' }, ...opts]
}

/** Operator options — 'All', 'Not assigned', plus the real assignees present on
 *  inbound tasks (the mini-DB models operators as people, not roles). */
export function quickViewOperatorOptions(): { value: string; label: string }[] {
  const names = new Set<string>()
  for (const t of receivingTasks) if (t.assignee) names.add(t.assignee)
  for (const t of putAwayTasks) if (t.assignee) names.add(t.assignee)
  return [
    { value: 'all', label: 'All' },
    { value: 'none', label: 'Not assigned' },
    ...[...names].sort().map((n) => ({ value: n, label: n })),
  ]
}

function whMatch(warehouseId: string, filter: string): boolean {
  return filter === 'all' ? true : warehouseId === filter
}

function operatorMatch(assignee: string | undefined, operator: string): boolean {
  if (operator === 'all') return true
  if (operator === 'none') return !assignee
  return assignee === operator
}

/** Compute all quick-view card numbers for the given filters. */
export function inboundQuickView(f: QuickViewFilters): QuickViewMetrics {
  const inScopeReceipt = (r: Receipt) => r.status !== 'canceled' && whMatch(r.warehouseId, f.warehouseId)

  // Receiving/put-away tasks keyed to their parent receipt, for join lookups.
  const activeReceivingByReceipt = new Map<string, ReceivingTask[]>()
  for (const t of receivingTasks) {
    if (t.status === 'canceled') continue
    const list = activeReceivingByReceipt.get(t.receiptId) ?? []
    list.push(t)
    activeReceivingByReceipt.set(t.receiptId, list)
  }
  const receivingById = new Map(receivingTasks.map((t) => [t.id, t]))
  const receiptIdForPutaway = (p: PutAwayTask): string | undefined => {
    for (const rid of p.receivingTaskIds) {
      const rt = receivingById.get(rid)
      if (rt) return rt.receiptId
    }
    return undefined
  }

  // ── Pending (operator N/A) ────────────────────────────────────────────────
  const pendingReceipts = receipts.filter(
    (r) => inScopeReceipt(r) && r.status === 'pending' && !(activeReceivingByReceipt.get(r.id)?.length),
  )
  const pending = {
    total: pendingReceipts.length,
    due: pendingReceipts.filter((r) => dayOf(r.estimatedArrival) === f.date).length,
    overdue: pendingReceipts.filter((r) => dayOf(r.estimatedArrival) < f.date && !!r.estimatedArrival).length,
  }

  // ── On receiving (operator applies) ───────────────────────────────────────
  const receiptById = new Map(receipts.map((r) => [r.id, r]))
  const classify = (receiptIds: Set<string>) => {
    let due = 0, late = 0, early = 0
    for (const id of receiptIds) {
      const r = receiptById.get(id)
      const eta = dayOf(r?.estimatedArrival)
      if (!r || !whMatch(r.warehouseId, f.warehouseId)) continue
      if (eta === f.date) due++
      else if (eta && eta < f.date) late++
      else if (eta && eta > f.date) early++
    }
    return { due, late, early }
  }

  const receivingReceiptIds = new Set<string>()
  for (const t of receivingTasks) {
    if (
      t.status === 'in progress' &&
      dayOf(t.startDate) === f.date &&
      whMatch(t.warehouseId, f.warehouseId) &&
      operatorMatch(t.assignee, f.operator)
    ) {
      receivingReceiptIds.add(t.receiptId)
    }
  }
  const receiving = { total: receivingReceiptIds.size, ...classify(receivingReceiptIds) }

  // ── On put-away (operator applies) ────────────────────────────────────────
  const putawayReceiptIds = new Set<string>()
  for (const p of putAwayTasks) {
    if (
      p.status === 'in progress' &&
      dayOf(p.startDate) === f.date &&
      whMatch(p.warehouseId, f.warehouseId) &&
      operatorMatch(p.assignee, f.operator)
    ) {
      const rid = receiptIdForPutaway(p)
      if (rid) putawayReceiptIds.add(rid)
    }
  }
  const putaway = { total: putawayReceiptIds.size, ...classify(putawayReceiptIds) }

  // ── Closed (operator N/A) ─────────────────────────────────────────────────
  const closedReceipts = receipts.filter(
    (r) => inScopeReceipt(r) && r.status === 'completed' && dayOf(r.receivedDate) === f.date,
  )
  const closed = {
    total: closedReceipts.length,
    onTime: closedReceipts.filter((r) => dayOf(r.estimatedArrival) === f.date).length,
    late: closedReceipts.filter((r) => dayOf(r.estimatedArrival) < f.date && !!r.estimatedArrival).length,
    early: closedReceipts.filter((r) => dayOf(r.estimatedArrival) > f.date).length,
  }

  // ── No ongoing action (operator applies to the open-task counts) ──────────
  const receivingOpen = receivingTasks.filter(
    (t) => t.status === 'open' && whMatch(t.warehouseId, f.warehouseId) && operatorMatch(t.assignee, f.operator),
  ).length
  const putawayOpen = putAwayTasks.filter(
    (p) => p.status === 'open' && whMatch(p.warehouseId, f.warehouseId) && operatorMatch(p.assignee, f.operator),
  ).length
  // "No task at all": an in-progress-ish receipt with no task currently open or
  // in progress (stalled — nothing being worked on right now).
  const none = receipts.filter((r) => {
    if (!inScopeReceipt(r)) return false
    if (r.status !== 'in progress' && r.status !== 'partial reception') return false
    const tasks = activeReceivingByReceipt.get(r.id) ?? []
    const hasLiveReceiving = tasks.some((t) => t.status === 'open' || t.status === 'in progress')
    const hasLivePutaway = putAwayTasks.some(
      (p) => (p.status === 'open' || p.status === 'in progress') && receiptIdForPutaway(p) === r.id,
    )
    return !hasLiveReceiving && !hasLivePutaway
  }).length

  return { pending, receiving, putaway, closed, idle: { none, receivingOpen, putawayOpen } }
}
