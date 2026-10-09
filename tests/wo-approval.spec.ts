/**
 * Work order approval — the engine in app/data/woApproval.ts (PRD Work Order Approvals
 * Rev 3, MVP scope of 2026-10-08): Start work order, adjustment, completion and
 * cancel/close are gated; creation, material consume / return and partial completion are not.
 *
 * Seeded Work order workflows — exactly one work order transaction type each:
 *   awf-007 start (active) · awf-009 adjustment · awf-010 completion · awf-011 cancel/close
 *           (inactive) — level 1 Budi Santoso, level 2 Sari Indah or Dewi Rahayu (any).
 * Only ACTIVE workflows gate a transaction or block a type.
 *
 * Grooming 2026-10-09: status stays as-is; a pending request freezes the work order;
 * a pending adjustment shows its data right away; the requester can cancel a request
 * until someone approves; rejection notices are sticky until dismissed; VAL stand-in.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  woApprovalRequests, queueFor, allPending, pendingCount, canApprove, approveRequest, rejectRequest,
  submitRequest, findGatingRule, preSubmitApprovers, guardMessage, pendingForWorkOrder,
  approvedConsumedQty, joinNames, approvalLogFor, workOrderApprovalStatus, latestRejectedRequest,
  consumableQty, plannedMaterialQty, completionSummary, startWorkOrder, displayStatus,
  isFrozen, canCancelRequest, cancelRequest, rejectedNotices, dismissRejection, dismissedRejections,
  approvalHistoryForWorkOrder, recordActionReason, ruleLevelsPreview,
  LEVEL_1, LEVEL_2, PPIC, LINE_LEADER,
} from '~/data/woApproval'
import { workOrders } from '~/data/workOrders'
import { approvalWorkflows, woTypesTakenByOthers, woRuleTypes, activeWoConflicts } from '~/data/approvalWorkflows'
import { useValApprovalRule, valUnavailable } from '~/data/valApprovalRule'

const SARI = LEVEL_2[0]!
const wo = (id: string) => workOrders.find(w => w.id === id)!
const req = (id: string) => woApprovalRequests.find(r => r.id === id)!
const rule = (id: string) => approvalWorkflows.find(r => r.id === id)!

// Each test starts from the seed — the engine mutates shared reactive state.
const seedRequests = JSON.parse(JSON.stringify(woApprovalRequests))
const seedWorkOrders = JSON.parse(JSON.stringify(workOrders))
const seedRules = JSON.parse(JSON.stringify(approvalWorkflows))
beforeEach(() => {
  woApprovalRequests.splice(0, woApprovalRequests.length, ...JSON.parse(JSON.stringify(seedRequests)))
  workOrders.splice(0, workOrders.length, ...JSON.parse(JSON.stringify(seedWorkOrders)))
  approvalWorkflows.splice(0, approvalWorkflows.length, ...JSON.parse(JSON.stringify(seedRules)))
  dismissedRejections.splice(0)
})

describe('Awaiting approval list', () => {
  it('lists every pending request for everyone; the badge counts all of them', () => {
    expect(allPending().map(r => r.id).sort()).toEqual(['wor-001', 'wor-002', 'wor-005', 'wor-006', 'wor-007'])
    expect(pendingCount()).toBe(5)
  })

  it('Approve is only offered where the viewer is the current-level approver', () => {
    expect(queueFor(LEVEL_1).map(r => r.id).sort()).toEqual(['wor-002', 'wor-005', 'wor-007'])
    expect(req('wor-007').type).toBe('cancel')
    expect(queueFor(SARI).map(r => r.id).sort()).toEqual(['wor-001', 'wor-006'])
    expect(queueFor(LINE_LEADER)).toHaveLength(0)
    expect(canApprove(req('wor-001'), LEVEL_1)).toBe(false)
  })

  it('a level whose only approver is the requester is skipped, so the request never gets stuck', () => {
    rule('awf-009').isActive = true
    const r = submitRequest({ workOrderId: 'wo-5', type: 'adjustment', requester: LEVEL_1, payload: { plannedQty: 150 } })!
    expect(r.currentLevel).toBe(2)
    expect(r.log.some(e => e.event === 'skipped' && e.level === 1)).toBe(true)
    expect(canApprove(r, LEVEL_1)).toBe(false)
    expect(queueFor(SARI).some(q => q.id === r.id)).toBe(true)
    expect(approvalLogFor(r).stages[0]!.skipped).toMatch(/Skipped/)
    expect(approveRequest(r.id, SARI)).toEqual({ outcome: 'final' })
  })

  it('with self-approval on, the requester approves their own level', () => {
    rule('awf-009').isActive = true
    rule('awf-009').allowSelfApproval = true
    const r = submitRequest({ workOrderId: 'wo-5', type: 'adjustment', requester: LEVEL_1, payload: { plannedQty: 150 } })!
    expect(r.currentLevel).toBe(1)
    expect(approveRequest(r.id, LEVEL_1)).toEqual({ outcome: 'next', nextLevel: 2 })
  })
})

describe('rule matching — MVP scope', () => {
  it('gates each type through its own active workflow', () => {
    expect(findGatingRule('start', PPIC)?.id).toBe('awf-007')
    expect(findGatingRule('partial' as never, PPIC)).toBeUndefined()
    // seeded inactive → not gated until turned on
    expect(findGatingRule('adjustment', PPIC)).toBeUndefined()
    for (const id of ['awf-009', 'awf-010', 'awf-011']) rule(id).isActive = true
    expect(findGatingRule('adjustment', PPIC)?.id).toBe('awf-009')
    expect(findGatingRule('completion', PPIC)?.id).toBe('awf-010')
    expect(findGatingRule('cancel', PPIC)?.id).toBe('awf-011')
    expect(preSubmitApprovers('start', LINE_LEADER)).toEqual([LEVEL_1])
  })

  it('a type outside every active workflow executes immediately (normal flow)', () => {
    rule('awf-007').isActive = false
    expect(submitRequest({ workOrderId: 'wo-5', type: 'start', requester: LINE_LEADER, payload: {} })).toBeNull()
  })

  it('a requester outside "Some users" isn’t held', () => {
    const r = rule('awf-007')
    r.createdByScope = 'some'
    r.createdByUserIds = []
    expect(preSubmitApprovers('start', PPIC)).toBeNull()
  })
})

describe('one workflow per Work order type', () => {
  it('reports the types other workflows already cover', () => {
    // Only ACTIVE workflows block a type — adjustment, completion and cancel/close are seeded inactive.
    const taken = woTypesTakenByOthers('awf-009')
    expect([...taken.keys()]).toEqual(['start'])
    expect(taken.get('start')).toBe('Start work order approval')
    expect(approvalWorkflows.filter(r => r.transactionType === 'work-order').every(r => r.woCriteria?.length === 1)).toBe(true)
    expect([...woTypesTakenByOthers().keys()]).toEqual(['start'])
  })

  it('turning on a workflow whose type already has an active one reports the conflict', () => {
    approvalWorkflows.push({ ...rule('awf-007'), id: 'awf-x', name: 'Second start rule', isActive: false })
    expect(activeWoConflicts('awf-x').map(r => r.id)).toEqual(['awf-007'])
    expect(activeWoConflicts('awf-009')).toEqual([])
  })

  it('empty criteria means every type', () => {
    expect(woRuleTypes({ woCriteria: [] })).toEqual(['start', 'adjustment', 'completion', 'cancel'])
  })
})

describe('Start work order — reservation on approval', () => {
  it('reserves the planned material only when the start is approved', () => {
    const plan = { 'p-1': { warehouseId: 'wh-1', serialSelection: ['SN-1'] } }
    wo('wo-25').reservationPlan = plan
    expect(wo('wo-25').materialReservations).toBeUndefined()
    approveRequest('wor-001', SARI)
    expect(wo('wo-25').status).toBe('in progress')
    expect(wo('wo-25').materialReservations).toEqual(plan)
    expect(wo('wo-25').reservationPlan).toBeUndefined()
  })

  it('a not-gated start reserves immediately', () => {
    const plan = { 'p-2': { warehouseId: 'wh-1', serialSelection: ['SN-2'] } }
    wo('wo-1').reservationPlan = plan
    startWorkOrder(wo('wo-1'))
    expect(wo('wo-1').materialReservations).toEqual(plan)
  })

  it('a pending start blocks starting again; a rejected start reserves nothing', () => {
    expect(guardMessage('wo-25')).toMatch(/locked/)
    rejectRequest('wor-002', LEVEL_1, 'Line not free')
    expect(wo('wo-2').status).toBe('not started')
    expect(wo('wo-2').materialReservations).toBeUndefined()
    expect(latestRejectedRequest('wo-2')?.id).toBe('wor-002')
  })
})

describe('approve / reject — level by level', () => {
  it('level 1 moves to level 2 without executing; the final level executes', () => {
    expect(approveRequest('wor-005', LEVEL_1)).toEqual({ outcome: 'next', nextLevel: 2 })
    expect(req('wor-005').status).toBe('pending')
    expect(approveRequest('wor-005', SARI)).toEqual({ outcome: 'final' })
    expect(req('wor-005').status).toBe('executed')
    expect(wo('wo-6').plannedQty).toBe(180)
  })

  it('cannot skip a level or approve twice', () => {
    expect(approveRequest('wor-005', SARI)).toBeNull()
    approveRequest('wor-005', LEVEL_1)
    expect(approveRequest('wor-005', LEVEL_1)).toBeNull()
  })

  it('reject needs a reason, stops the chain and applies nothing', () => {
    expect(rejectRequest('wor-006', SARI, '  ')).toBe(false)
    expect(rejectRequest('wor-006', SARI, 'Count again')).toBe(true)
    expect(wo('wo-7').status).toBe('in progress')
    expect(approvalLogFor(req('wor-006')).stages[1]!.rejection).toMatchObject({ user: SARI, reason: 'Count again' })
  })

  it('cancel/close locks the work order and cancels it on final approval', () => {
    rule('awf-011').isActive = true
    const r = submitRequest({ workOrderId: 'wo-9', type: 'cancel', requester: PPIC, payload: { note: 'Order withdrawn' } })!
    expect(isFrozen('wo-9')).toBe(true)
    approveRequest(r.id, LEVEL_1)
    approveRequest(r.id, SARI)
    expect(wo('wo-9').status).toBe('canceled')
  })
})

describe('guards and quantities', () => {
  it('any pending request freezes the work order (only Print / Cancel approval request stay)', () => {
    for (const id of ['wo-6', 'wo-7', 'wo-8', 'wo-25']) expect(guardMessage(id)).toMatch(/Only Print is available/)
    expect(guardMessage('wo-3')).toBeNull()
    expect(isFrozen('wo-26')).toBe(false)
  })

  it('consume (not gated) is capped at planned − consumed', () => {
    const productId = 'p'
    expect(consumableQty('wo-5', productId)).toBe(Math.max(0, plannedMaterialQty('wo-5', productId) - approvedConsumedQty('wo-5', productId)))
  })
})

describe('derived list state and log', () => {
  it('the status stays as-is while a request is pending', () => {
    expect(displayStatus(wo('wo-25'))).toBe('not started')
    expect(displayStatus(wo('wo-6'))).toBe('in progress')
    expect(displayStatus(wo('wo-7'))).toBe(wo('wo-7').status)
    approveRequest('wor-001', SARI)
    expect(displayStatus(wo('wo-25'))).toBe('in progress')
    approveRequest('wor-005', LEVEL_1)
    approveRequest('wor-005', SARI)
    expect(displayStatus(wo('wo-6'))).toBe('in progress')
  })

  it('a rejection notice stays until it is dismissed', () => {
    expect(rejectedNotices('wo-8').map(r => r.id)).toEqual(['wor-008'])
    approveRequest('wor-007', LEVEL_1)
    approveRequest('wor-007', SARI)
    expect(pendingForWorkOrder('wo-8')).toHaveLength(0)
    expect(rejectedNotices('wo-8').map(r => r.id)).toEqual(['wor-008'])
    dismissRejection('wor-008')
    expect(rejectedNotices('wo-8')).toHaveLength(0)
  })

  it('indicator / approval status come from requests', () => {
    expect(pendingForWorkOrder('wo-8')).toHaveLength(1)
    expect(workOrderApprovalStatus(wo('wo-8'))).toBe('waiting')
    expect(workOrderApprovalStatus(wo('wo-26'))).toBe('rejected')
    expect(workOrderApprovalStatus(wo('wo-3'))).toBeNull()
  })

  it('the log shows adjustment reason/date and the completion summary', () => {
    expect(approvalLogFor(req('wor-005')).details!.map(d => d.label)).toEqual(['Planned qty', 'Adjustment date', 'Reason for adjustment'])
    expect(completionSummary(req('wor-006'))!.output).toMatch(/^148 \/ 150 /)
  })

  it('joins names without a serial comma', () => {
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B and C')
  })
})

describe('grooming 2026-10-09', () => {
  it('a pending adjustment shows its new planned qty now; reject restores it', () => {
    expect(wo('wo-6').plannedQty).toBe(180)
    rejectRequest('wor-005', LEVEL_1, 'Not this week')
    expect(wo('wo-6').plannedQty).toBe(200)
  })

  it('a submitted adjustment is applied to the work order straight away', () => {
    rule('awf-009').isActive = true
    const before = wo('wo-3').plannedQty
    const r = submitRequest({ workOrderId: 'wo-3', type: 'adjustment', requester: PPIC, payload: { plannedQty: before + 5, note: 'Extra' } })!
    expect(r.status).toBe('pending')
    expect(wo('wo-3').plannedQty).toBe(before + 5)
    expect(r.payload.previousPlannedQty).toBe(before)
  })

  it('the requester cancels a request until someone approves it', () => {
    expect(canCancelRequest(req('wor-005'), PPIC)).toBe(true)
    expect(canCancelRequest(req('wor-005'), LEVEL_1)).toBe(false)
    expect(canCancelRequest(req('wor-001'), PPIC)).toBe(false) // level 1 already approved
    expect(cancelRequest('wor-005', PPIC)).toBe(true)
    expect(req('wor-005').status).toBe('canceled')
    expect(wo('wo-6').plannedQty).toBe(200)
    expect(isFrozen('wo-6')).toBe(false)
    expect(approvalLogFor(req('wor-005')).canceled?.user).toBe(PPIC)
  })

  it('a canceled / rejected request clears the reason notice it set', () => {
    recordActionReason(wo('wo-6'), { type: 'adjustment', reason: 'Mixer 2 down', by: PPIC, requestId: 'wor-005' })
    cancelRequest('wor-005', PPIC)
    expect(wo('wo-6').actionReason).toBeUndefined()
  })

  it('the Approval log tab lists every request with its rule and latest action', () => {
    const rows = approvalHistoryForWorkOrder('wo-8')
    expect(rows.map(r => r.id).sort()).toEqual(['wor-007', 'wor-008'])
    expect(rows.find(r => r.id === 'wor-008')!.lastAction).toMatch(/^Rejected by Budi Santoso: /)
    expect(rows.find(r => r.id === 'wor-007')!.lastAction).toMatch(/^Waiting for Budi Santoso \(approval level 1\)/)
  })

  it('VAL previews the rule; every level skipped → approved automatically', async () => {
    expect(ruleLevelsPreview('start', PPIC)!.levels.map(l => l.skipped)).toEqual([false, false])
    const r = rule('awf-007')
    r.levels = [r.levels[0]!] // level 1 only — Budi
    const val = useValApprovalRule()
    const res = await val.load({ module: 'work-order', transactionType: 'start', requester: LEVEL_1 })
    expect(res).toMatchObject({ gated: true, autoApproved: true })
    const sub = submitRequest({ workOrderId: 'wo-1', type: 'start', requester: LEVEL_1, payload: {} })!
    expect(sub.status).toBe('executed')
  })

  it('VAL failure surfaces as an error state', async () => {
    valUnavailable.value = true
    const val = useValApprovalRule()
    expect(await val.load({ module: 'work-order', transactionType: 'start', requester: PPIC })).toBeNull()
    expect(val.error.value).toBe(true)
    valUnavailable.value = false
  })

  it('not gated → VAL says so', async () => {
    const val = useValApprovalRule()
    expect(await val.load({ module: 'work-order', transactionType: 'adjustment', requester: PPIC })).toMatchObject({ gated: false })
  })
})
