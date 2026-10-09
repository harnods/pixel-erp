/**
 * Work order approval — the mock DB + engine behind PRD "Work Order Approvals (Rev 3)",
 * with the MVP scope decided on 2026-10-05.
 *
 * Work order is a transaction type on the existing approval engine (Settings › Approval
 * workflows, `transactionType: 'work-order'`). MVP gates five production events: start
 * work order, adjustment, completion and cancel/close. Work order
 * creation and material consume / return are NOT gated — they execute immediately.
 * A gated event is saved as a REQUEST and nothing it would move or post is executed
 * until its final approval level approves; a rejected request is never applied.
 *
 * Material is reserved when the START is approved (the picks made on the create form
 * are held on the work order as `reservationPlan` until then). One Work order transaction
 * type can belong to only one workflow (see approvalWorkflows.ts).
 *
 * Everything the UI shows — the Awaiting approval list + badge, detail notices, the
 * action freeze and "waiting for approval" captions — is DERIVED from these request
 * records (never stored per row).
 *
 * FE/BE grooming (2026-10-09):
 *   • the work order status stays as-is — no Draft / Waiting approval display status;
 *   • while ANY request is pending the work order is FROZEN: every action refuses
 *     (inline) except Print and the requester's Cancel approval request;
 *   • an adjustment shows its new data right away (it's written to the work order at
 *     submission and reverted if the request is rejected or canceled);
 *   • the requester can cancel a request until the first approver approves it;
 *   • a rejection notice stays until the user dismisses it.
 */
import { reactive } from 'vue'
import { TODAY } from './master'
import { loadSnapshot, saveSnapshot } from './persist'
import { workOrders, persistWorkOrders, type WorkOrder, type WorkOrderActionReason } from './workOrders'
import { billOfMaterials } from './billOfMaterials'
import { recordsForWorkOrder } from './materialConsumeReturn'
import { formatIDR } from '~/utils/currency'
import { formatDateLong } from '~/utils/date'
import { warehouses } from './warehouses'
import { users, getUserById, findUserByName } from './users'
import {
  approvalWorkflows, woTransactionTypeLabel,
  type ApprovalWorkflowRule, type WoTransactionType,
} from './approvalWorkflows'
import type { ApprovalLog, ApprovalStage } from './warehouseTransfers'

export type { WoTransactionType } from './approvalWorkflows'
export { WO_TRANSACTION_TYPE_OPTIONS, woTransactionTypeLabel } from './approvalWorkflows'

// ── Types ────────────────────────────────────────────────────────────────────

export interface WoAdjustmentChange { field: string; from: string; to: string }

/** What the request carries — applied to the work order only on final approval. */
export interface WoRequestPayload {
  /** adjustment — revised planned output qty (the BOM is never touched) */
  plannedQty?: number
  changes?: WoAdjustmentChange[]
  /** adjustment — required reason; cancel/close — optional reason */
  note?: string
  /** adjustment — required adjustment date (ISO) */
  adjustmentDate?: string
  /** completion — final produced qty */
  producedQty?: number
  /** adjustment — planned qty before the request, restored if it's rejected or canceled */
  previousPlannedQty?: number
}

export interface WoApprovalEvent {
  /** 'skipped' — the level's only possible approver is the requester (no self-approval) */
  event: 'submitted' | 'resubmitted' | 'approved' | 'rejected' | 'skipped' | 'canceled'
  /** 1-based approval level (approved / rejected only) */
  level?: number
  user: string
  at: string
  reason?: string
}

export interface WoApprovalLevel {
  matchType: 'any' | 'all'
  /** approver names — snapshotted from the rule at submission */
  approvers: string[]
}

export interface WoApprovalRequest {
  id: string
  workOrderId: string
  type: WoTransactionType
  /** request ref shown in the log and notices, e.g. "ADJ-0007"; null for start */
  ref: string | null
  requester: string
  ruleId: string
  /** ISO date of the underlying transaction */
  transactionDate: string
  payload: WoRequestPayload
  /** 'canceled' — withdrawn by the requester before anyone approved it */
  status: 'pending' | 'executed' | 'rejected' | 'canceled'
  /** 1-based level awaiting a decision; null once decided */
  currentLevel: number | null
  levels: WoApprovalLevel[]
  /** oldest first */
  log: WoApprovalEvent[]
}

export interface WoComment {
  id: string
  requestId: string
  author: string
  timestamp: string
  text: string
}

// ── Seed (mapped onto the seeded work orders) ───────────────────────────────────

function at(dayOffset: number, hhmm: string): string {
  const d = new Date(TODAY)
  d.setDate(d.getDate() + dayOffset)
  const [h, m] = hhmm.split(':').map(Number)
  d.setHours(h!, m!, 0, 0)
  return d.toISOString()
}
function dateOnly(dayOffset: number): string {
  return at(dayOffset, '00:00').slice(0, 10)
}

export const LEVEL_1 = 'Budi Santoso'
export const LEVEL_2 = ['Sari Indah', 'Dewi Rahayu']
export const PPIC = 'Andi Kusuma'
export const LINE_LEADER = 'Fajar Setiawan'

/** Work order workflows — level 1 Budi, level 2 Sari or Dewi. */
const PRODUCTION_LEVELS = (): WoApprovalLevel[] => [
  { matchType: 'any', approvers: [LEVEL_1] },
  { matchType: 'any', approvers: [...LEVEL_2] },
]

function buildSeed(): WoApprovalRequest[] {
  return [
    {
      id: 'wor-001', workOrderId: 'wo-25', type: 'start', ref: null,
      requester: PPIC, ruleId: 'awf-007', transactionDate: dateOnly(-1),
      payload: {}, status: 'pending', currentLevel: 2, levels: PRODUCTION_LEVELS(),
      log: [
        { event: 'submitted', user: PPIC, at: at(-1, '08:10') },
        { event: 'approved', level: 1, user: LEVEL_1, at: at(-1, '10:00') },
      ],
    },
    {
      id: 'wor-002', workOrderId: 'wo-2', type: 'start', ref: null,
      requester: LINE_LEADER, ruleId: 'awf-007', transactionDate: dateOnly(-1),
      payload: {}, status: 'pending', currentLevel: 1, levels: PRODUCTION_LEVELS(),
      log: [{ event: 'submitted', user: LINE_LEADER, at: at(-1, '14:00') }],
    },
    {
      id: 'wor-004', workOrderId: 'wo-26', type: 'start', ref: null,
      requester: PPIC, ruleId: 'awf-007', transactionDate: dateOnly(-2),
      payload: {}, status: 'rejected', currentLevel: null, levels: PRODUCTION_LEVELS(),
      log: [
        { event: 'submitted', user: PPIC, at: at(-2, '09:05') },
        { event: 'rejected', level: 1, user: LEVEL_1, at: at(-2, '16:22'), reason: "Planned qty doesn't match this week's production plan" },
      ],
    },
    {
      id: 'wor-005', workOrderId: 'wo-6', type: 'adjustment', ref: 'ADJ-0007',
      requester: PPIC, ruleId: 'awf-009', transactionDate: dateOnly(0),
      payload: {
        plannedQty: 180,
        previousPlannedQty: 200,
        changes: [{ field: 'Planned qty', from: '200', to: '180' }],
        note: 'Mixer 2 down, batch size reduced',
        adjustmentDate: dateOnly(0),
      },
      status: 'pending', currentLevel: 1, levels: PRODUCTION_LEVELS(),
      log: [{ event: 'submitted', user: PPIC, at: at(0, '06:40') }],
    },
    {
      id: 'wor-006', workOrderId: 'wo-7', type: 'completion', ref: 'CMP-0019',
      requester: LINE_LEADER, ruleId: 'awf-010', transactionDate: dateOnly(-1),
      payload: { producedQty: 148 },
      status: 'pending', currentLevel: 2, levels: PRODUCTION_LEVELS(),
      log: [
        { event: 'submitted', user: LINE_LEADER, at: at(-1, '17:30') },
        { event: 'approved', level: 1, user: LEVEL_1, at: at(-1, '18:05') },
      ],
    },
    {
      id: 'wor-007', workOrderId: 'wo-8', type: 'cancel', ref: 'CXL-0002',
      requester: LINE_LEADER, ruleId: 'awf-011', transactionDate: dateOnly(0),
      payload: { note: 'Customer order withdrawn, close the run' },
      status: 'pending', currentLevel: 1, levels: PRODUCTION_LEVELS(),
      log: [{ event: 'submitted', user: LINE_LEADER, at: at(0, '06:15') }],
    },
    {
      id: 'wor-008', workOrderId: 'wo-8', type: 'adjustment', ref: 'ADJ-0005',
      requester: LINE_LEADER, ruleId: 'awf-009', transactionDate: dateOnly(-2),
      payload: {
        plannedQty: 46,
        previousPlannedQty: 40,
        changes: [{ field: 'Planned qty', from: '40', to: '46' }],
        note: 'Scrap on shift 2, extra material needed',
        adjustmentDate: dateOnly(-2),
      },
      status: 'rejected', currentLevel: null, levels: PRODUCTION_LEVELS(),
      log: [
        { event: 'submitted', user: LINE_LEADER, at: at(-2, '21:50') },
        { event: 'rejected', level: 1, user: LEVEL_1, at: at(-1, '07:20'), reason: 'Attach the QC reject report before adding qty' },
      ],
    },
  ]
}

const SEED_COMMENTS: WoComment[] = [
  { id: 'woc-1', requestId: 'wor-002', author: LEVEL_1, timestamp: at(0, '07:32'), text: 'Is the line free tomorrow morning? Mixer 2 is still under maintenance.' },
  { id: 'woc-2', requestId: 'wor-002', author: LINE_LEADER, timestamp: at(0, '07:41'), text: 'Yes, we run it on Mixer 1.' },
  { id: 'woc-3', requestId: 'wor-005', author: PPIC, timestamp: at(0, '06:42'), text: 'Maintenance ticket MT-221 is attached to the work order.' },
]

// v5 — grooming 2026-10-09 (adjustments carry previousPlannedQty; canceled requests).
const REQ_KEY = 'wo-approval-requests-v5'
const COMMENT_KEY = 'wo-approval-comments-v2'
const DISMISSED_KEY = 'wo-approval-dismissed-v1'

export const woApprovalRequests = reactive<WoApprovalRequest[]>(loadSnapshot<WoApprovalRequest>(REQ_KEY) ?? buildSeed())
export const woApprovalComments = reactive<WoComment[]>(loadSnapshot<WoComment>(COMMENT_KEY) ?? [...SEED_COMMENTS])
/** Rejected request ids whose notice was dismissed (× on the banner). */
export const dismissedRejections = reactive<string[]>(loadSnapshot<string>(DISMISSED_KEY) ?? [])

export function persistWoApproval(): void {
  saveSnapshot(REQ_KEY, woApprovalRequests)
  saveSnapshot(COMMENT_KEY, woApprovalComments)
  saveSnapshot(DISMISSED_KEY, dismissedRejections)
}

// A pending adjustment is shown on the work order right away — make sure the seeded
// ones are reflected (the work orders are seeded / persisted separately).
// Same for the seeded Adjust / Cancel-close reasons (shown in a notice on the detail page).
for (const r of woApprovalRequests) {
  if (r.status !== 'pending') continue
  const wo = workOrders.find(w => w.id === r.workOrderId)
  if (!wo) continue
  if (r.type === 'adjustment' && r.payload.plannedQty != null && wo.plannedQty === r.payload.previousPlannedQty) wo.plannedQty = r.payload.plannedQty
  if ((r.type === 'adjustment' || r.type === 'cancel') && r.payload.note && !wo.actionReason) {
    wo.actionReason = { type: r.type, reason: r.payload.note, by: r.requester, at: r.log[0]?.at ?? r.transactionDate, requestId: r.id }
  }
}

// ── Users ───────────────────────────────────────────────────────────────────

/** Users without Work order access — never offered as Work order approvers. */
const NO_WORK_ORDER_ACCESS = new Set(['Maya Puspita', 'Wulan Sari'])

export function hasWorkOrderAccess(userId: string): boolean {
  const u = getUserById(userId)
  return !!u && !NO_WORK_ORDER_ACCESS.has(u.name)
}

export function workOrderApproverOptions() {
  return users.filter(u => hasWorkOrderAccess(u.id))
}

// ── Labels / formatting ─────────────────────────────────────────────────────

export function typeLabel(type: WoTransactionType): string {
  return woTransactionTypeLabel(type)
}

/** "A", "A and B", "A, B and C" — no serial comma. */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

export function workOrderOf(req: WoApprovalRequest): WorkOrder | undefined {
  return workOrders.find(w => w.id === req.workOrderId)
}

/** "Work order adjustment ADJ-0007" / "Start work order" */
export function requestTitle(req: WoApprovalRequest): string {
  return req.ref ? `${typeLabel(req.type)} ${req.ref}` : typeLabel(req.type)
}

/** Warehouse a request shows — where the work order's material is (or will be) reserved. */
export function requestWarehouseName(req: WoApprovalRequest): string {
  const wo = workOrderOf(req)
  const res = wo?.materialReservations ?? wo?.reservationPlan
  const id = res ? Object.values(res).find(r => r.warehouseId)?.warehouseId : undefined
  return (id && warehouses.find(w => w.id === id)?.name) || ''
}

// ── Rule matching (F-1) ─────────────────────────────────────────────────────

/** The active Work order rule that gates `type` for `requester` (a type belongs to one rule). */
export function findGatingRule(type: WoTransactionType, requester: string): ApprovalWorkflowRule | undefined {
  const requesterId = findUserByName(requester)?.id
  return approvalWorkflows.find((r) => {
    if (!r.isActive || r.appliesTo !== 'transaction' || r.transactionType !== 'work-order') return false
    const criteria = r.woCriteria ?? []
    if (criteria.length && !criteria.includes(type)) return false
    if (r.createdByScope === 'some' && !(requesterId && r.createdByUserIds.includes(requesterId))) return false
    return r.levels.length > 0
  })
}

function levelsFromRule(rule: ApprovalWorkflowRule): WoApprovalLevel[] {
  return rule.levels.map(l => ({
    matchType: l.matchType,
    approvers: l.approverIds.map(id => getUserById(id)?.name).filter((n): n is string => !!n),
  }))
}

/** Level-1 approver names for the pre-submit notice, or null when the transaction isn't gated. */
export function preSubmitApprovers(type: WoTransactionType, requester: string): string[] | null {
  const rule = findGatingRule(type, requester)
  if (!rule) return null
  return levelsFromRule(rule)[0]?.approvers ?? []
}

/** One level of the rule as the requester will meet it — `skipped` when nobody but them can act. */
export interface WoRuleLevelPreview {
  level: number
  matchType: 'any' | 'all'
  approvers: string[]
  skipped: boolean
}

/** The gating rule's levels for a requester (what the VAL approval-rule service answers). */
export function ruleLevelsPreview(type: WoTransactionType, requester: string): { rule: ApprovalWorkflowRule; levels: WoRuleLevelPreview[] } | null {
  const rule = findGatingRule(type, requester)
  if (!rule) return null
  const levels = levelsFromRule(rule).map((l, i) => {
    const eligible = rule.allowSelfApproval ? l.approvers : l.approvers.filter(a => a !== requester)
    return { level: i + 1, matchType: l.matchType, approvers: l.approvers, skipped: !eligible.length }
  })
  return { rule, levels }
}

// ── Queries ─────────────────────────────────────────────────────────────────

export function requestsForWorkOrder(woId: string): WoApprovalRequest[] {
  return woApprovalRequests.filter(r => r.workOrderId === woId)
}

export function pendingForWorkOrder(woId: string): WoApprovalRequest[] {
  return requestsForWorkOrder(woId).filter(r => r.status === 'pending')
}

function submittedAt(req: WoApprovalRequest): string {
  return req.log[0]?.at ?? req.transactionDate
}
const newestFirst = (a: WoApprovalRequest, b: WoApprovalRequest) =>
  b.transactionDate.localeCompare(a.transactionDate) || submittedAt(b).localeCompare(submittedAt(a))

/** Approvals already given in the current level. */
function approvalsAtLevel(req: WoApprovalRequest, level: number): WoApprovalEvent[] {
  return req.log.filter(e => e.event === 'approved' && e.level === level)
}

function selfApprovalAllowed(req: WoApprovalRequest): boolean {
  return !!approvalWorkflows.find(r => r.id === req.ruleId)?.allowSelfApproval
}

/** Approvers who may act at a level — the requester is excluded unless self-approval is on. */
function eligibleApprovers(req: WoApprovalRequest, level: number): string[] {
  const l = req.levels[level - 1]
  if (!l) return []
  return selfApprovalAllowed(req) ? l.approvers : l.approvers.filter(a => a !== req.requester)
}

function levelSatisfied(req: WoApprovalRequest, level: number): boolean {
  const l = req.levels[level - 1]
  if (!l) return true
  const eligible = eligibleApprovers(req, level)
  if (!eligible.length) return true
  const approved = new Set(approvalsAtLevel(req, level).map(e => e.user))
  return l.matchType === 'any' ? eligible.some(a => approved.has(a)) : eligible.every(a => approved.has(a))
}

/**
 * Move past every level nobody can act on — the requester is that level's only approver and
 * self-approval is off — so a request is never stuck. Each skip is recorded in the log.
 * If no level is left, the request executes.
 */
function advanceSkippedLevels(req: WoApprovalRequest): void {
  while (req.status === 'pending' && req.currentLevel != null && !eligibleApprovers(req, req.currentLevel).length) {
    req.log.push({ event: 'skipped', level: req.currentLevel, user: req.requester, at: new Date().toISOString() })
    if (req.currentLevel >= req.levels.length) {
      req.status = 'executed'
      req.currentLevel = null
      execute(req)
    } else {
      req.currentLevel += 1
    }
  }
}

/**
 * Can `user` act on this request now? They approve its current level, haven't approved it
 * yet (under "All"), and aren't its requester unless the rule allows self-approval.
 */
export function canApprove(req: WoApprovalRequest, user: string): boolean {
  if (req.status !== 'pending' || req.currentLevel == null) return false
  if (req.requester === user && !selfApprovalAllowed(req)) return false
  if (!req.levels[req.currentLevel - 1]?.approvers.includes(user)) return false
  return !approvalsAtLevel(req, req.currentLevel).some(e => e.user === user)
}

/**
 * Who a pending request is waiting for at its current level — the approvers still to act
 * (the requester excluded unless self-approval is on): "A or B" under Any, "A and B" under All.
 */
export function waitingForText(req: WoApprovalRequest): string {
  if (req.status !== 'pending' || req.currentLevel == null) return ''
  const l = req.levels[req.currentLevel - 1]
  if (!l) return ''
  const approved = new Set(approvalsAtLevel(req, req.currentLevel).map(e => e.user))
  const left = eligibleApprovers(req, req.currentLevel).filter(a => !approved.has(a))
  return l.matchType === 'any' ? left.join(' or ') : joinNames(left)
}

/** Every request still waiting for approval, for all users — the Awaiting approval list. */
export function allPending(): WoApprovalRequest[] {
  return woApprovalRequests.filter(r => r.status === 'pending').sort(newestFirst)
}

/** Requests `user` can approve right now (Approve / Reject shown only on these). */
export function queueFor(user: string): WoApprovalRequest[] {
  return allPending().filter(r => canApprove(r, user))
}

/** Tab badge — every pending request, not only the viewer's. */
export function pendingCount(): number {
  return woApprovalRequests.filter(r => r.status === 'pending').length
}

export function rejectionOf(req: WoApprovalRequest): WoApprovalEvent | undefined {
  return req.log.find(e => e.event === 'rejected')
}

/** When a request was decided (its last event). */
function decidedAt(req: WoApprovalRequest): string {
  return req.log[req.log.length - 1]?.at ?? submittedAt(req)
}

/**
 * Latest rejected request on a work order — set when the newest decided request (canceled
 * ones aside) was rejected and nothing is pending. Drives the list's Approval status filter.
 */
export function latestRejectedRequest(woId: string): WoApprovalRequest | undefined {
  const all = requestsForWorkOrder(woId)
  if (all.some(r => r.status === 'pending')) return undefined
  const newest = all
    .filter(r => r.status === 'executed' || r.status === 'rejected')
    .sort((a, b) => decidedAt(b).localeCompare(decidedAt(a)))[0]
  return newest?.status === 'rejected' ? newest : undefined
}

/**
 * Rejection notices on the work order detail, newest first. A rejection notice is sticky:
 * it stays until the user dismisses it (×) or acts on it (Submit again / Create again).
 */
export function rejectedNotices(woId: string): WoApprovalRequest[] {
  return requestsForWorkOrder(woId)
    .filter(r => r.status === 'rejected' && !dismissedRejections.includes(r.id))
    .sort((a, b) => decidedAt(b).localeCompare(decidedAt(a)))
}

export function dismissRejection(id: string): void {
  if (dismissedRejections.includes(id)) return
  dismissedRejections.push(id)
  persistWoApproval()
}

/** Work order list filter — Approval status. */
export type WoApprovalStatus = 'waiting' | 'rejected' | null
export function workOrderApprovalStatus(wo: WorkOrder): WoApprovalStatus {
  if (pendingForWorkOrder(wo.id).length) return 'waiting'
  if (latestRejectedRequest(wo.id)) return 'rejected'
  return null
}

// ── Material quantities ─────────────────────────────────────────────────────

/** Consumed qty, net of returns (consume / return post immediately in MVP). */
export function approvedConsumedQty(woId: string, productId: string): number {
  return Math.max(0, recordsForWorkOrder(woId).filter(r => r.productId === productId).reduce((s, r) => s + r.qty, 0))
}

/** BOM needed (planned / reserved) qty of a material on a work order. */
export function plannedMaterialQty(woId: string, productId: string): number {
  const wo = workOrders.find(w => w.id === woId)
  const bom = billOfMaterials.find(b => b.id === wo?.bomId)
  return bom?.rawMaterials.find(r => r.productId === productId)?.needed ?? 0
}

/** Material Consume is capped at the planned qty; extra material / scrap goes through an adjustment. */
export function consumableQty(woId: string, productId: string): number {
  return Math.max(0, plannedMaterialQty(woId, productId) - approvedConsumedQty(woId, productId))
}

/**
 * Status the work order shows (list + detail badge). Grooming 2026-10-09: the work order
 * status stays as-is while a request is pending — there's no Draft / Waiting approval
 * status; the freeze notice and the Approval status filter carry the signal instead.
 */
export type WoDisplayStatus = WorkOrder['status']
export function displayStatus(wo: WorkOrder): WoDisplayStatus {
  return wo.status
}

// ── Freeze (F-3) ────────────────────────────────────────────────────────────

/** A work order with any request waiting for approval is frozen. */
export function isFrozen(woId: string): boolean {
  return pendingForWorkOrder(woId).length > 0
}

/** Actions that stay available on a frozen work order. */
export const FREEZE_EXEMPT_ACTIONS = ['Print', 'Cancel approval request'] as const

/**
 * Inline refusal for any action on a frozen work order (Start, Adjust, Complete, Cancel,
 * Edit, Delete, Replace attachment, material consume / return …), or null when it may
 * proceed. Buttons stay enabled (rule: never disabled) and explain themselves.
 */
export function guardMessage(woId: string): string | null {
  if (!isFrozen(woId)) return null
  return 'This work order is locked until its request is decided. Only Print is available.'
}

// ── Mutations ───────────────────────────────────────────────────────────────

let reqSeq = woApprovalRequests.length + 1
const REF_PREFIX: Record<WoTransactionType, string> = {
  start: '', adjustment: 'ADJ', completion: 'CMP', cancel: 'CXL',
}
function nextRef(type: WoTransactionType): string | null {
  if (type === 'start') return null
  const prefix = REF_PREFIX[type]
  let max = 0
  for (const r of woApprovalRequests) {
    const m = r.ref?.match(new RegExp(`^${prefix}-(\\d+)$`))
    if (m) max = Math.max(max, parseInt(m[1]!, 10))
  }
  return `${prefix}-${String(max + 1).padStart(4, '0')}`
}

/**
 * Submit a gated transaction. Returns the request, or null when no rule gates it — the
 * caller then executes immediately exactly as today (normal flow).
 */
export function submitRequest(input: {
  workOrderId: string
  type: WoTransactionType
  requester: string
  payload: WoRequestPayload
  transactionDate?: string
}): WoApprovalRequest | null {
  const rule = findGatingRule(input.type, input.requester)
  if (!rule) return null
  const now = new Date().toISOString()
  const req: WoApprovalRequest = {
    id: `wor-new-${reqSeq++}`,
    workOrderId: input.workOrderId,
    type: input.type,
    ref: nextRef(input.type),
    requester: input.requester,
    ruleId: rule.id,
    transactionDate: input.transactionDate ?? now.slice(0, 10),
    payload: input.payload,
    status: 'pending',
    currentLevel: 1,
    levels: levelsFromRule(rule),
    log: [{ event: 'submitted', user: input.requester, at: now }],
  }
  // An adjustment shows its new data right away; reverted if rejected or canceled.
  const wo = workOrderOf(req)
  if (req.type === 'adjustment' && wo && req.payload.plannedQty != null) {
    req.payload.previousPlannedQty ??= wo.plannedQty
    wo.plannedQty = req.payload.plannedQty
    persistWorkOrders()
  }
  woApprovalRequests.push(req)
  advanceSkippedLevels(req)
  persistWoApproval()
  return req
}

/** Undo what was shown early (the adjusted planned qty) when a request won't be applied. */
function revert(req: WoApprovalRequest): void {
  const wo = workOrderOf(req)
  if (wo?.actionReason?.requestId === req.id) {
    wo.actionReason = undefined
    persistWorkOrders()
  }
  if (req.type !== 'adjustment' || !wo || req.payload.previousPlannedQty == null) return
  if (wo.plannedQty === req.payload.plannedQty) {
    wo.plannedQty = req.payload.previousPlannedQty
    persistWorkOrders()
  }
}

/**
 * Start a work order — status In progress, start date today, and the material planned on
 * the create form is reserved now (never earlier). Called directly when Start isn't gated,
 * or on final approval of a Start request.
 */
export function startWorkOrder(wo: WorkOrder): void {
  wo.status = 'in progress'
  wo.startDate = new Date().toISOString().slice(0, 10)
  if (wo.reservationPlan) {
    wo.materialReservations = wo.reservationPlan
    wo.reservationPlan = undefined
  }
  persistWorkOrders()
}

/** Apply what a request carries — only ever called at final-level approval. */
function execute(req: WoApprovalRequest) {
  const wo = workOrderOf(req)
  if (!wo) return
  const today = new Date().toISOString().slice(0, 10)
  switch (req.type) {
    case 'start':
      startWorkOrder(wo)
      return
    case 'adjustment':
      // Already shown on the work order since submission — the BOM is never touched.
      if (req.payload.plannedQty != null) wo.plannedQty = req.payload.plannedQty
      break
    case 'completion':
      if (req.payload.producedQty != null) wo.producedQty = req.payload.producedQty
      wo.status = 'completed'
      wo.endDate = today
      break
    case 'cancel':
      // Remaining reservation is released (WIP settlement is open with SCM-COS).
      wo.status = 'canceled'
      wo.endDate = today
      wo.materialReservations = undefined
      wo.reservationPlan = undefined
      break
  }
  persistWorkOrders()
}

export interface ApproveResult { outcome: 'next' | 'final'; nextLevel?: number }

/** One approval by `user` at the request's current level (bulk approve = one call per row). */
export function approveRequest(id: string, user: string): ApproveResult | null {
  const req = woApprovalRequests.find(r => r.id === id)
  // Concurrency guard: only an eligible approver at the current level, once, no skipping.
  if (!req || !canApprove(req, user)) return null
  const level = req.currentLevel!
  req.log.push({ event: 'approved', level, user, at: new Date().toISOString() })
  let result: ApproveResult = { outcome: 'next', nextLevel: level }
  if (levelSatisfied(req, level)) {
    if (level >= req.levels.length) {
      req.status = 'executed'
      req.currentLevel = null
      execute(req)
      result = { outcome: 'final' }
    } else {
      req.currentLevel = level + 1
      advanceSkippedLevels(req)
      result = req.status === 'executed' ? { outcome: 'final' } : { outcome: 'next', nextLevel: req.currentLevel! }
    }
  }
  persistWoApproval()
  return result
}

/** Reject at any level — stops the whole chain; nothing is applied. */
export function rejectRequest(id: string, user: string, reason: string): boolean {
  const req = woApprovalRequests.find(r => r.id === id)
  if (!req || !canApprove(req, user) || !reason.trim()) return false
  req.log.push({ event: 'rejected', level: req.currentLevel!, user, at: new Date().toISOString(), reason: reason.trim() })
  req.status = 'rejected'
  req.currentLevel = null
  revert(req)
  persistWoApproval()
  return true
}

/**
 * The requester may cancel (withdraw) their request until the first approver approves it.
 * Skipped levels don't count as an approval.
 */
export function canCancelRequest(req: WoApprovalRequest, user: string): boolean {
  return req.status === 'pending' && req.requester === user && !req.log.some(e => e.event === 'approved')
}

/** Cancel approval request — nothing is applied and the work order unfreezes. */
export function cancelRequest(id: string, user: string): boolean {
  const req = woApprovalRequests.find(r => r.id === id)
  if (!req || !canCancelRequest(req, user)) return false
  req.log.push({ event: 'canceled', level: req.currentLevel ?? undefined, user, at: new Date().toISOString() })
  req.status = 'canceled'
  req.currentLevel = null
  revert(req)
  persistWoApproval()
  return true
}

// ── Comments ────────────────────────────────────────────────────────────────

let commentSeq = woApprovalComments.length + 1
export function commentsFor(requestId: string): WoComment[] {
  return woApprovalComments.filter(c => c.requestId === requestId)
}
export function addComment(requestId: string, author: string, text: string): void {
  if (!text.trim()) return
  woApprovalComments.push({ id: `woc-new-${commentSeq++}`, requestId, author, timestamp: new Date().toISOString(), text: text.trim() })
  persistWoApproval()
}

// ── Approval log (feeds the shared ApprovalLogModal) ───────────────────────────

function stagesFor(req: WoApprovalRequest): ApprovalStage[] {
  const rejection = req.log.find(e => e.event === 'rejected')
  const stages: ApprovalStage[] = []
  req.levels.forEach((l, i) => {
    const level = i + 1
    const rejectedHere = rejection?.level === level ? rejection : undefined
    const skipped = req.log.some(e => e.event === 'skipped' && e.level === level)
    const canceledAt = req.log.find(e => e.event === 'canceled')?.level
    const reached = req.status === 'canceled'
      ? level <= (canceledAt ?? 0)
      : req.status !== 'pending'
        ? level <= (rejection?.level ?? req.levels.length)
        : level <= (req.currentLevel ?? 0)
    // A rejection or cancel stops the chain — later levels were never reached, so they're left out.
    if (!reached && (rejection || req.status === 'canceled')) return
    stages.push({
      title: `Approval level ${level}`,
      rule: l.matchType === 'all' ? 'everyone' : 'anyone',
      approvers: l.approvers,
      approvals: approvalsAtLevel(req, level).map(e => ({ user: e.user, date: e.at })),
      canceled: req.status === 'canceled' && canceledAt === level,
      rejection: rejectedHere ? { user: rejectedHere.user, date: rejectedHere.at, reason: rejectedHere.reason ?? '' } : undefined,
      waitingFor: reached ? undefined : `Waiting for level ${level - 1}`,
      skipped: skipped ? `Skipped — ${req.requester} requested this and is the only approver` : undefined,
    })
  })
  return stages
}

const pct = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 1 })

/** PRD Rev 3 Completion summary — output and cost against plan (out of MVP scope). */
export function completionSummary(req: WoApprovalRequest): { output: string; cost: string } | null {
  const wo = workOrderOf(req)
  const bom = billOfMaterials.find(b => b.id === wo?.bomId)
  if (!wo || !bom) return null
  const produced = req.payload.producedQty ?? wo.producedQty
  const unit = bom.finishedGoodUnit ?? 'Pcs'
  const fixed = bom.productionCost.reduce((s, c) => s + c.amount, 0) + bom.routing.reduce((s, r) => s + r.amount, 0)
  const planned = bom.rawMaterials.reduce((s, r) => s + r.needed * r.purchaseCost, 0) + fixed
  const actual = bom.rawMaterials.reduce((s, r) => s + approvedConsumedQty(wo.id, r.productId) * r.purchaseCost, 0) + fixed
  const diff = planned ? ((actual - planned) / planned) * 100 : 0
  return {
    output: `${produced.toLocaleString('id-ID')} / ${wo.plannedQty.toLocaleString('id-ID')} ${unit} (${pct(wo.plannedQty ? (produced / wo.plannedQty) * 100 : 0)}%)`,
    cost: `${formatIDR(actual)} / ${formatIDR(planned)} plan (${diff >= 0 ? '+' : ''}${pct(diff)}%)`,
  }
}

/** What the approver is deciding on — shown under the explanation line in the log. */
function requestDetails(req: WoApprovalRequest): { label: string; value: string; tag?: string }[] {
  const p = req.payload
  switch (req.type) {
    case 'adjustment':
      return [
        ...(p.changes ?? []).map(c => ({ label: c.field, value: `${c.from} → ${c.to}` })),
        ...(p.adjustmentDate ? [{ label: 'Adjustment date', value: formatDateLong(p.adjustmentDate) }] : []),
        ...(p.note ? [{ label: 'Reason for adjustment', value: p.note }] : []),
      ]
    case 'completion': {
      const sum = completionSummary(req)
      // PRD Rev 3 lists the Completion summary as SHOULD HAVE — tagged out of MVP scope.
      return sum ? [
        { label: 'Output', value: sum.output, tag: 'Out of scope for MVP' },
        { label: 'Cost', value: sum.cost, tag: 'Out of scope for MVP' },
      ] : []
    }
    case 'cancel':
      return p.note ? [{ label: 'Reason', value: p.note }] : []
    default:
      return []
  }
}

const REASON: Record<WoTransactionType, string> = {
  start: 'Starting this work order requires approval. Material is reserved once it\'s approved.',
  adjustment: 'This transaction requires approval because it\'s a work order adjustment on a work order.',
  completion: 'This transaction requires approval because it\'s a work order completion on a work order.',
  cancel: 'This transaction requires approval because it\'s a work order cancel/close on a work order.',
}

export function approvalLogFor(req: WoApprovalRequest): ApprovalLog {
  const first = req.log.find(e => e.event === 'submitted' || e.event === 'resubmitted')
  const wo = workOrderOf(req)
  return {
    details: requestDetails(req),
    heading: `${requestTitle(req)}${wo ? ` · ${wo.number}` : ''}`,
    reason: REASON[req.type],
    requestedBy: first?.user ?? req.requester,
    requestedAt: first?.at ?? req.transactionDate,
    requestedLabel: 'Requested by',
    stages: stagesFor(req),
    canceled: canceledEvent(req),
  }
}

function canceledEvent(req: WoApprovalRequest): { user: string; date: string } | undefined {
  const e = req.log.find(x => x.event === 'canceled')
  return e ? { user: e.user, date: e.at } : undefined
}

// ── Approval log tab (WO detail) ──────────────────────────────────────────────

export type WoRequestStatusLabel = 'Waiting for approval' | 'Approved' | 'Rejected' | 'Canceled'
export const REQUEST_STATUS_LABEL: Record<WoApprovalRequest['status'], WoRequestStatusLabel> = {
  pending: 'Waiting for approval', executed: 'Approved', rejected: 'Rejected', canceled: 'Canceled',
}

export interface WoApprovalHistoryRow {
  id: string
  /** submitted at (ISO) */
  date: string
  type: string
  ref: string
  requestedBy: string
  /** the approval workflow (rule) that held it */
  rule: string
  status: WoApprovalRequest['status']
  /** latest decision, e.g. "Rejected by Budi Santoso: <reason>" / "Waiting for Sari Indah or Dewi Rahayu (level 2)" */
  lastAction: string
}

function lastActionText(req: WoApprovalRequest): string {
  if (req.status === 'pending') return `Waiting for ${waitingForText(req)} (approval level ${req.currentLevel})`
  const last = [...req.log].reverse().find(e => e.event === 'approved' || e.event === 'rejected' || e.event === 'canceled' || e.event === 'skipped')
  if (!last) return ''
  if (last.event === 'rejected') return `Rejected by ${last.user}: ${last.reason ?? ''}`
  if (last.event === 'canceled') return `Canceled by ${last.user}`
  if (last.event === 'skipped') return 'Approved automatically (requester is the only approver)'
  return `Approved by ${last.user}`
}

/** Every request on a work order, newest first — the Approval log tab. */
export function approvalHistoryForWorkOrder(woId: string): WoApprovalHistoryRow[] {
  return requestsForWorkOrder(woId)
    .slice()
    .sort((a, b) => submittedAt(b).localeCompare(submittedAt(a)))
    .map(r => ({
      id: r.id,
      date: submittedAt(r),
      type: typeLabel(r.type),
      ref: r.ref ?? '—',
      requestedBy: r.requester,
      rule: approvalWorkflows.find(w => w.id === r.ruleId)?.name ?? '—',
      status: r.status,
      lastAction: lastActionText(r),
    }))
}

/** Keep the Adjust / Cancel-close reason on the work order — shown in a detail notice. */
export function recordActionReason(wo: WorkOrder, input: Omit<WorkOrderActionReason, 'at'>): void {
  wo.actionReason = { ...input, at: new Date().toISOString() }
  persistWorkOrders()
}

/** The request an action reason belongs to (to say whether it's still waiting). */
export function requestById(id: string | undefined): WoApprovalRequest | undefined {
  return id ? woApprovalRequests.find(r => r.id === id) : undefined
}

/** Logs for a work order: pending requests first, then the last 5 decided. */
export function approvalLogsForWorkOrder(woId: string, opts: { pendingOnly?: boolean } = {}): ApprovalLog[] {
  const all = requestsForWorkOrder(woId)
  const pending = all.filter(r => r.status === 'pending')
  const decided = opts.pendingOnly ? [] : all.filter(r => r.status !== 'pending')
    .sort((a, b) => (b.log[b.log.length - 1]?.at ?? '').localeCompare(a.log[a.log.length - 1]?.at ?? ''))
    .slice(0, 5)
  return [...pending, ...decided].map(approvalLogFor)
}
