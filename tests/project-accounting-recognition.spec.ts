/**
 * Project accounting — the three recognition methods, the contract-addendum
 * rules and the Settings › Approval workflows gates (app/data/projectAccounting.ts).
 *
 * These are the numbers a controller would sign off on, so they are asserted
 * exactly as the source computes them:
 *
 *   tm     (Cost plus margin)          revenue = Σ entryFinal(x) over REVIEWED lines only
 *                    entryFinal: bill → cost×(1+margin), atcost → cost, absorb → 0
 *   input  (Percentage of completion)  revenue = recognizedBase + max(0, poc − pctAtVO)/100 × contractValue
 *                    poc = min(actualCost ÷ budget × 100, 100)
 *   output (Milestones)                revenue = Σ recognized over VERIFIED milestones (frozen at verification)
 *
 * Approvals come from the seeded Settings rules (app/data/approvalWorkflows.ts):
 *   Project creation  contract value above Rp500.000.000      → Rizal Candra or Budi Santoso
 *   Addendum          value change above Rp25.000.000         → Rizal Candra
 *   Milestone verification on Cikarang (e7), any amount       → Rizal Candra
 * The submitter can never decide their own request.
 *
 * The addendum cases encode PSAK 72's distinct test, which is the part most likely
 * to regress silently: whether added scope is distinct — not how the project earns —
 * decides if revenue already recognized is trued up.
 */
import { describe, it, expect } from 'vitest'
import {
  engagements, findEngagement, createEngagement,
  revenue, actualCost, pocPct, billed, collected, wipNet,
  entryAmount, entryFinal, openEntries, readyToInvoice, canClose, closeHint,
  ageBuckets, daysAgo, budgetReport, budgetOf, accountForEntry, workDoneShare, projectedMargin,
  decideEntries, addAddendum, approveAddendum, rejectAddendum, confirmWeights,
  addScopeMilestone, verifyMilestone, unverifyMilestone, saveInvoice, recordPayment,
  closeEngagement, saveExpense, projectOptions, portfolioTotals,
  invoiceLineAmount, invoiceLineTax, draftWeightSum, methodLabel,
  approveRequest, rejectRequest, approvalFor, pendingVos, submitMilestoneVerification,
  projectStatusLabel, projectStatusKey, resubmitEngagement, draftFromEngagement, formatIdrSigned,
  reopenEngagement, canReopen, billingStatusOf, formatPct,
  TODAY, type EngagementDraft, type RecognitionMethod,
} from '~/data/projectAccounting'

const APPROVER = 'Rizal Candra'
const PM = 'Rina Wulandari'

// A minimal draft; each test overrides just what it cares about.
function draft(over: Partial<EngagementDraft> = {}): EngagementDraft {
  return {
    name: 'Test project',
    client: 'PT Test',
    pm: 'Tester',
    method: 'input',
    value: '100000000',
    budget: '50000000',
    markup: '20',
    milestones: [],
    budgetLines: { revenue: [{ id: 'br1', account: '4-10000 Project revenue', amount: '' }], cost: [] },
    ...over,
  }
}

/** Raise an addendum and, when a rule gated it, have the approver decide it. */
function raiseAndApprove(id: string, newValue: number, reason: string, distinct: boolean) {
  const res = addAddendum(id, newValue, reason, distinct)!
  expect(res.status).toBe('pending')
  expect(approveRequest(id, res.approval!.id, APPROVER)).toBe(true)
  return res
}

/** Build a project of a given method with a known contract value and budget. */
function make(method: RecognitionMethod, over: Partial<EngagementDraft> = {}) {
  const e = createEngagement(draft({ method, ...over }))
  return findEngagement(e.id)!
}

describe('seed figures — the three engines side by side', () => {
  it('tm recognizes only REVIEWED lines, at cost + the agreed margin', () => {
    const e = findEngagement('e3')!            // Monthly Retainer, 20% margin
    expect(e.method).toBe('tm')
    // Two lines carry decision 'bill': 4,000,000 and 1,800,000 at +20%.
    expect(revenue(e)).toBe(4_000_000 * 1.2 + 1_800_000 * 1.2)
    expect(revenue(e)).toBe(6_960_000)
    // The other two are incurred cost but not yet revenue.
    expect(openEntries(e)).toHaveLength(2)
    expect(actualCost(e)).toBe(4_000_000 + 1_800_000 + 1_200_000 + 750_000)
  })

  it('tm with nothing reviewed recognizes nothing, however much cost is booked', () => {
    const e = findEngagement('e1')!
    expect(actualCost(e)).toBe(16_800_000)
    expect(revenue(e)).toBe(0)
  })

  it('input measures progress by cost spent ÷ cost planned', () => {
    const e = findEngagement('e5')!            // 45,000,000 contract on a 30,000,000 budget
    expect(actualCost(e)).toBe(18_500_000)
    expect(pocPct(e)).toBeCloseTo(61.6667, 3)
    expect(revenue(e)).toBeCloseTo(27_750_000, 0)
  })

  it('output recognizes nothing until a milestone is physically verified', () => {
    const e = findEngagement('e7')!
    expect(e.milestones!.every(m => !m.verified)).toBe(true)
    expect(revenue(e)).toBe(0)
    expect(actualCost(e)).toBe(815_000_000)
  })

  it('method labels', () => {
    expect([methodLabel('tm'), methodLabel('input'), methodLabel('output')]).toEqual(['Cost plus margin', 'Percentage of completion', 'Milestones'])
  })

  it('Home Terrace has its down payment as a real paid invoice on schedule row b1', () => {
    const e = findEngagement('e5')!
    expect(e.invoices).toEqual([{ id: 'INV-2190', label: 'Down payment (30%)', amount: 13_500_000, date: '2026-07-06', status: 'paid', paidDate: '2026-07-10' }])
    const b1 = e.billing!.find(b => b.id === 'b1')!
    expect(b1.invId).toBe('INV-2190')
    expect(billingStatusOf(e, b1)).toBe('paid')
    expect(b1.pct / 100 * e.contractValue).toBe(13_500_000)
    expect([billed(e), collected(e)]).toEqual([13_500_000, 13_500_000])
    // 27.750.000 recognized against 13.500.000 billed: 14.250.000 unbilled.
    expect(wipNet(e)).toBe(14_250_000)
  })

  it('Cikarang carries one addendum waiting on the Addendum rule, so it cannot close', () => {
    const e = findEngagement('e7')!
    expect(pendingVos(e).map(v => [v.id, v.oldValue, v.newValue, v.distinct, v.raisedBy])).toEqual([['v-e7-1', 2_400_000_000, 2_520_000_000, true, PM]])
    const a = approvalFor(e, 'addendum', 'v-e7-1')!
    expect([a.ruleName, a.amount, a.submittedBy, a.approvers]).toEqual(['Addendum Rule 001', 120_000_000, PM, [APPROVER]])
    expect(e.contractValue).toBe(2_400_000_000)
    expect(canClose(e)).toBe(false)
    expect(portfolioTotals().pendingAddenda).toBe(1)
  })

  // The seed covers every status a project can hold, so the Status column, its badge
  // intents and the Status filter all have something to render. Six working projects,
  // plus one of each terminal/gated state.
  it('the seed reaches all four statuses', () => {
    const byStatus = engagements.reduce<Record<string, string[]>>((acc, e) => {
      (acc[projectStatusLabel(e)] ??= []).push(e.id)
      return acc
    }, {})
    expect(byStatus).toEqual({
      'In progress': ['e1', 'e2', 'e3', 'e5', 'e6', 'e7', 'e11'],
      'Pending approval': ['e8'],
      Rejected: ['e9'],
      Closed: ['e10'],
    })
  })
})

describe('entryFinal — what the customer is actually charged', () => {
  const line = { id: 'x', category: 'Labor', description: 'd', vendor: 'v', date: TODAY, amount: 1_000_000, markupPct: 20, src: 'Expense' as const, docNo: 'EXP-1', decision: null, invoiced: false, hours: null }

  it('bill charges cost plus the margin', () => {
    expect(entryFinal({ ...line, decision: 'bill' })).toBe(1_200_000)
    expect(entryAmount(line)).toBe(1_200_000)
  })

  it('atcost waives the margin', () => {
    expect(entryFinal({ ...line, decision: 'atcost' })).toBe(1_000_000)
  })

  it('absorb charges the customer nothing', () => {
    expect(entryFinal({ ...line, decision: 'absorb' })).toBe(0)
  })
})

// rule/format-idr: the sign goes before the symbol. Accounting parentheses are
// the cash module's multi-currency convention, never the house format.
describe('formatIdrSigned', () => {
  it('puts a minus before the symbol, not parentheses', () => {
    expect(formatIdrSigned(-965_000_000)).toBe('-Rp965.000.000,00')
    expect(formatIdrSigned(-1_000)).not.toContain('(')
  })

  it('leaves a positive and zero unsigned', () => {
    expect(formatIdrSigned(1_000)).toBe('Rp1.000,00')
    expect(formatIdrSigned(0)).toBe('Rp0,00')
  })
})

describe('formatPct', () => {
  it('uses a decimal comma and keeps a small share from reading as 0%', () => {
    expect(formatPct((48_000 / 16_848_000) * 100)).toBe('0,3%')
    expect(formatPct(15)).toBe('15%')
  })

  it('prints a fixed number of decimals when asked, so a column lines up', () => {
    expect([38.095238, 28.571429, 4.761905, 40].map(n => formatPct(n, 2, true)))
      .toEqual(['38,10%', '28,57%', '4,76%', '40,00%'])
  })
})

describe('pocPct', () => {
  it('caps at 100 — progress cannot exceed done', () => {
    const e = make('input', { value: '100000000', budget: '10000000' })
    e.entries.push({ id: 'c1', category: 'Material', description: 'over', vendor: 'v', date: TODAY, amount: 25_000_000, markupPct: 0, src: 'Expense', docNo: 'EXP-1', decision: null, invoiced: false, hours: null })
    expect(pocPct(e)).toBe(100)
    expect(revenue(e)).toBe(100_000_000)
  })

  it('is 0 when no budget was ever set', () => {
    const e = make('input', { budget: '', budgetLines: { revenue: [], cost: [] } })
    expect(e.budget).toBeNull()
    expect(pocPct(e)).toBe(0)
    expect(revenue(e)).toBe(0)
  })
})

describe('createEngagement', () => {
  it('an itemised cost plan wins over the single estimated-cost figure', () => {
    const e = make('input', {
      budget: '999',
      budgetLines: {
        revenue: [{ id: 'br1', account: '4-10000 Project revenue', amount: '100000000' }],
        cost: [{ id: 'bc0', account: '5-10000 Cost of materials', amount: '40000000' }, { id: 'bc1', account: '6-10001 Direct labor', amount: '20000000' }],
      },
    })
    expect(e.budget).toBe(60_000_000)
    expect(budgetOf(e).cost).toHaveLength(2)
  })

  it('tm derives the fee estimate from budget × (1 + margin), ignores a typed value, and defaults the margin to 20%', () => {
    const e = make('tm', { value: '75000000', budget: '50000000', markup: '' })
    expect(e.markupPct).toBe(20)
    expect(e.feeEstimate).toBe(60_000_000)              // 50.000.000 × 1,2 — the typed 75.000.000 is ignored
    expect(e.contractValue).toBe(0)

    const m = make('tm', { budget: '50000000', markup: '25' })
    expect(m.feeEstimate).toBe(62_500_000)
  })

  it('tm with no budget has no fee estimate', () => {
    const e = make('tm', { value: '75000000', budget: '', budgetLines: { revenue: [], cost: [] } })
    expect(e.budget).toBeNull()
    expect(e.feeEstimate).toBe(0)
  })

  it('tm seed fees are derived the same way', () => {
    expect([findEngagement('e1')!.feeEstimate, findEngagement('e2')!.feeEstimate, findEngagement('e3')!.feeEstimate]).toEqual([115_200_000, 33_600_000, 0])
    expect(findEngagement('e3')!.budget).toBeNull()
    expect(budgetOf(findEngagement('e1')!).revenue.map(l => l.amount)).toEqual([115_200_000])
  })

  it('input gets a 30/70 billing schedule; output gets its milestones', () => {
    const i = make('input')
    expect(i.billing!.map(b => b.pct)).toEqual([30, 70])
    expect(i.milestones).toBeNull()

    const o = make('output', { milestones: [{ id: 'd1', label: 'Phase 1', pct: '60' }, { id: 'd2', label: 'Phase 2', pct: '40' }] })
    expect(o.milestones!.map(m => m.pct)).toEqual([60, 40])
    expect(o.billing).toBeNull()
  })

  it('starts at execution — Setup is complete once the record exists', () => {
    expect(make('input').stage).toBe('execution')
  })
})

describe('project creation approval — above Rp500.000.000', () => {
  it('at or under the threshold the project starts at once', () => {
    const e = createEngagement(draft({ value: '500000000' }), PM)
    expect(e.approvals ?? []).toEqual([])
    expect(projectStatusLabel(e)).toBe('In progress')
  })

  it('above it the project waits as Pending approval until an approver other than the submitter approves', () => {
    const e = createEngagement(draft({ name: 'Big build', value: '750000000' }), PM)
    const a = approvalFor(e, 'project-creation', null)!
    expect([a.ruleName, a.amount, a.submittedBy, a.approvers]).toEqual(['Project Creation Rule 001', 750_000_000, PM, ['Rizal Candra', 'Budi Santoso']])
    expect(projectStatusKey(e)).toBe('pending approval')
    expect(projectStatusLabel(e)).toBe('Pending approval')

    expect(approveRequest(e.id, a.id, PM)).toBe(false)              // the submitter
    expect(approveRequest(e.id, a.id, 'Made Ardika')).toBe(false)    // not an approver
    expect(projectStatusLabel(e)).toBe('Pending approval')

    expect(approveRequest(e.id, a.id, APPROVER)).toBe(true)
    expect(projectStatusLabel(e)).toBe('In progress')
    expect(e.approvalLog!.at(-1)).toMatchObject({ action: 'project-creation', decision: 'approved', by: APPROVER, submittedBy: PM })
  })

  it('a rejected project reads Rejected, and resubmitting keeps the same id', () => {
    const e = createEngagement(draft({ name: 'Rejected build', value: '900000000' }), PM)
    const id = e.id
    const count = engagements.length
    const a = approvalFor(e, 'project-creation', null)!

    expect(rejectRequest(id, a.id, APPROVER, '')).toBe(false)         // reason required
    expect(rejectRequest(id, a.id, APPROVER, 'Scope not signed')).toBe(true)
    expect(projectStatusKey(e)).toBe('rejected')
    expect(projectStatusLabel(e)).toBe('Rejected')
    expect(approveRequest(id, a.id, APPROVER)).toBe(false)            // a rejected request cannot be approved

    // Only the submitter may resubmit.
    expect(resubmitEngagement(id, { ...draftFromEngagement(e), value: '450000000' }, APPROVER)).toBeNull()

    // Under the threshold the resubmitted project starts at once, on the same id.
    const again = resubmitEngagement(id, { ...draftFromEngagement(e), value: '450000000' }, PM)!
    expect(again.id).toBe(id)
    expect(engagements.length).toBe(count)
    expect(findEngagement(id)!.contractValue).toBe(450_000_000)
    expect(projectStatusLabel(findEngagement(id)!)).toBe('In progress')
  })

  it('resubmitting above the threshold opens a fresh request on the same id', () => {
    const e = createEngagement(draft({ name: 'Resubmit big', value: '900000000' }), PM)
    const first = approvalFor(e, 'project-creation', null)!
    rejectRequest(e.id, first.id, APPROVER, 'Price too high')
    const again = resubmitEngagement(e.id, { ...draftFromEngagement(e), value: '800000000' }, PM)!
    expect(again.id).toBe(e.id)
    const next = approvalFor(again, 'project-creation', null)!
    expect(next.id).not.toBe(first.id)
    expect([next.amount, next.rejectedBy]).toEqual([800_000_000, null])
    expect(projectStatusLabel(again)).toBe('Pending approval')
  })
})

describe('draftWeightSum', () => {
  it('sums the typed weights', () => {
    expect(draftWeightSum(draft({ milestones: [{ id: 'a', label: '', pct: '40' }, { id: 'b', label: '', pct: '30' }] }))).toBe(70)
  })
})

describe('decideEntries', () => {
  it('marks the selected lines and returns what they are worth to the client', () => {
    const e = make('tm', { value: '50000000' })
    e.entries.push(
      { id: 'k1', category: 'Labor', description: 'a', vendor: 'v', date: TODAY, amount: 1_000_000, markupPct: 20, src: 'Expense', docNo: 'E1', decision: null, invoiced: false, hours: null },
      { id: 'k2', category: 'Labor', description: 'b', vendor: 'v', date: TODAY, amount: 2_000_000, markupPct: 20, src: 'Expense', docNo: 'E2', decision: null, invoiced: false, hours: null },
    )
    const total = decideEntries(e.id, ['k1', 'k2'], 'bill')
    expect(total).toBe(3_600_000)
    expect(revenue(e)).toBe(3_600_000)
    expect(openEntries(e)).toHaveLength(0)
    expect(readyToInvoice(e)).toHaveLength(2)
  })

  it('absorbed lines are reviewed but never become billable', () => {
    const e = make('tm', { value: '50000000' })
    e.entries.push({ id: 'k3', category: 'Labor', description: 'c', vendor: 'v', date: TODAY, amount: 5_000_000, markupPct: 20, src: 'Expense', docNo: 'E3', decision: null, invoiced: false, hours: null })
    decideEntries(e.id, ['k3'], 'absorb')
    expect(revenue(e)).toBe(0)
    expect(openEntries(e)).toHaveLength(0)
    expect(readyToInvoice(e)).toHaveLength(0)
  })
})

describe('addenda — the contract is append-only, gated by the Addendum rule', () => {
  it('a change above Rp25.000.000 waits as Pending and does NOT move the contract value', () => {
    const e = make('input', { value: '100000000' })
    const res = addAddendum(e.id, 150_000_000, 'Extra scope requested', false)!
    expect(res.status).toBe('pending')
    expect(e.vos).toHaveLength(1)
    expect(e.vos[0]!.id).toBe(res.voId)
    expect(e.vos[0]!.status).toBe('Pending')
    expect(e.vos[0]!.oldValue).toBe(100_000_000)
    expect(e.contractValue).toBe(100_000_000)
    // No submitter given: the project manager raised it.
    expect(e.vos[0]!.raisedBy).toBe('Tester')
    expect([res.approval!.ruleName, res.approval!.amount, res.approval!.submittedBy, res.approval!.approvers])
      .toEqual(['Addendum Rule 001', 50_000_000, 'Tester', [APPROVER]])
  })

  it('a change of Rp25.000.000 or less is applied at once, with no approval', () => {
    const e = make('input', { value: '100000000' })
    const res = addAddendum(e.id, 125_000_000, 'Small change', false, PM)!
    expect(res.status).toBe('approved')
    expect(res.approval).toBeUndefined()
    expect(e.vos[0]!.status).toBe('Approved')
    expect(e.vos[0]!.raisedBy).toBe(PM)
    expect(e.contractValue).toBe(125_000_000)
    expect(e.approvals ?? []).toEqual([])
  })

  it('only an approver who is not the submitter can decide it', () => {
    const e = make('input', { value: '100000000' })
    const res = addAddendum(e.id, 150_000_000, 'Extra scope requested', false, APPROVER)!
    // The approver submitted it himself, so nobody on the rule can approve it.
    expect(approveRequest(e.id, res.approval!.id, APPROVER)).toBe(false)
    expect(approveAddendum(e.id, res.voId, APPROVER)).toBe(false)
    expect(approveAddendum(e.id, res.voId)).toBe(false)               // no approver named
    expect(approveRequest(e.id, res.approval!.id, PM)).toBe(false)    // not on the rule
    expect(e.vos[0]!.status).toBe('Pending')
    expect(e.contractValue).toBe(100_000_000)
  })

  it('rejecting keeps the addendum on the record — the refusal is part of the trail', () => {
    const e = make('input', { value: '100000000' })
    const res = addAddendum(e.id, 150_000_000, 'Extra scope requested', false, PM)!
    expect(rejectAddendum(e.id, res.voId, APPROVER)).toBe(false)      // a reason is required
    expect(rejectAddendum(e.id, res.voId, PM, 'Not mine to decide')).toBe(false)
    expect(rejectAddendum(e.id, res.voId, APPROVER, 'Customer has not signed')).toBe(true)
    expect(e.vos).toHaveLength(1)
    expect([e.vos[0]!.status, e.vos[0]!.rejectedBy, e.vos[0]!.rejectReason]).toEqual(['Rejected', APPROVER, 'Customer has not signed'])
    expect(e.contractValue).toBe(100_000_000)
    expect(approvalFor(e, 'addendum', res.voId)).toBeUndefined()
    expect(e.approvalLog!.at(-1)).toMatchObject({ action: 'addendum', refId: res.voId, decision: 'rejected', by: APPROVER, reason: 'Customer has not signed' })
  })

  it('input + NOT distinct → one-time cumulative catch-up on the new value', () => {
    const e = make('input', { value: '100000000', budget: '50000000' })
    e.entries.push({ id: 'a1', category: 'Material', description: 'm', vendor: 'v', date: TODAY, amount: 25_000_000, markupPct: 0, src: 'Expense', docNo: 'E', decision: null, invoiced: false, hours: null })
    expect(pocPct(e)).toBe(50)
    expect(revenue(e)).toBe(50_000_000)

    const res = addAddendum(e.id, 200_000_000, 'Same obligation, larger build', false)!
    expect(revenue(e)).toBe(50_000_000)                                // nothing moves while Pending
    expect(approveAddendum(e.id, res.voId, APPROVER)).toBe(true)

    // Whole thing remeasured: 50% of the NEW value.
    expect(e.contractValue).toBe(200_000_000)
    expect(revenue(e)).toBe(100_000_000)
    expect(e.vos[0]!.adjustment).toBe(50_000_000)
    expect(e.vos[0]!.approvedBy).toBe(APPROVER)
  })

  it('input + distinct → prospective: what is already earned is frozen', () => {
    const e = make('input', { value: '100000000', budget: '50000000' })
    e.entries.push({ id: 'a2', category: 'Material', description: 'm', vendor: 'v', date: TODAY, amount: 25_000_000, markupPct: 0, src: 'Expense', docNo: 'E', decision: null, invoiced: false, hours: null })

    raiseAndApprove(e.id, 200_000_000, 'Separate structure as well', true)

    // Nothing already recognized moves.
    expect(revenue(e)).toBe(50_000_000)
    expect(e.vos[0]!.adjustment).toBe(0)
    expect(e.recognizedBase).toBe(50_000_000)
    expect(e.pctAtVO).toBe(50)

    // Only progress made AFTER the addendum is measured on the new value.
    e.entries.push({ id: 'a3', category: 'Material', description: 'm2', vendor: 'v', date: TODAY, amount: 5_000_000, markupPct: 0, src: 'Expense', docNo: 'E', decision: null, invoiced: false, hours: null })
    expect(pocPct(e)).toBe(60)
    expect(revenue(e)).toBe(50_000_000 + 0.10 * 200_000_000)
  })

  it('output + NOT distinct → verified milestones stay locked, weights need reconfirming', () => {
    const e = make('output', { value: '100000000', milestones: [{ id: 'd1', label: 'A', pct: '50' }, { id: 'd2', label: 'B', pct: '50' }] })
    verifyMilestone(e.id, 'd1')
    expect(revenue(e)).toBe(50_000_000)

    raiseAndApprove(e.id, 200_000_000, 'Extended the same building', false)

    expect(e.weightsNeedConfirm).toBe(true)
    // The verified milestone keeps exactly what it recognized.
    expect(revenue(e)).toBe(50_000_000)
    // Verification is blocked until the weights are reconfirmed.
    expect(verifyMilestone(e.id, 'd2')).toBe(0)
    expect(e.milestones!.find(m => m.id === 'd2')!.verified).toBe(false)

    expect(confirmWeights(e.id, [{ id: 'd1', pct: '25' }, { id: 'd2', pct: '70' }])).toBe(false)
    expect(e.weightsNeedConfirm).toBe(true)
    expect(confirmWeights(e.id, [{ id: 'd1', pct: '25' }, { id: 'd2', pct: '75' }])).toBe(true)
    expect(e.weightsNeedConfirm).toBe(false)
    expect(verifyMilestone(e.id, 'd2')).toBe(150_000_000)
  })

  it('output + distinct → existing milestones keep their money; the addition gets its own', () => {
    const e = make('output', { value: '100000000', milestones: [{ id: 'd1', label: 'A', pct: '50' }, { id: 'd2', label: 'B', pct: '50' }] })

    const res = addAddendum(e.id, 250_000_000, 'Also build a separate guard house', true)!
    // While Pending nothing is restated.
    expect(e.milestones!.find(m => m.id === 'd1')!.pct).toBe(50)
    expect(e.scopePending).toBeNull()
    expect(approveRequest(e.id, res.approval!.id, APPROVER)).toBe(true)

    // Weights restate against the larger contract so the amounts are unchanged.
    const m1 = e.milestones!.find(m => m.id === 'd1')!
    expect(m1.pct).toBeCloseTo(20, 6)
    expect((e.contractValue * m1.pct) / 100).toBeCloseTo(50_000_000, 6)
    expect(e.scopePending!.added).toBe(150_000_000)
    expect(e.weightsNeedConfirm).toBe(false)

    const added = addScopeMilestone(e.id, 'Separate guard house handed over')
    expect(added).toBe(150_000_000)
    expect(e.scopePending).toBeNull()
    expect(e.milestones).toHaveLength(3)
    // The new milestone claims the remainder — weights sum back to 100.
    expect(e.milestones!.reduce((a, m) => a + m.pct, 0)).toBeCloseTo(100, 6)
    expect((e.contractValue * e.milestones![2]!.pct) / 100).toBeCloseTo(150_000_000, 6)
  })

  it('tm → the fee estimate stays derived: the new fee sets the budget it implies; reviewed work is not restated', () => {
    const e = make('tm', { budget: '50000000' })                    // fee 60.000.000 at 20%
    expect(e.feeEstimate).toBe(60_000_000)
    e.entries.push({ id: 'a4', category: 'Labor', description: 'l', vendor: 'v', date: TODAY, amount: 1_000_000, markupPct: 20, src: 'Expense', docNo: 'E', decision: 'bill', invoiced: false, hours: null })
    expect(revenue(e)).toBe(1_200_000)

    // A 6.000.000 change is under the Addendum rule, so it applies at once.
    const res = addAddendum(e.id, 66_000_000, 'Extended engagement letter', false)!
    expect(res.status).toBe('approved')

    expect(e.budget).toBe(55_000_000)                                // 66.000.000 ÷ 1,2
    expect(e.feeEstimate).toBe(66_000_000)
    expect(budgetOf(e).revenue.map(l => l.amount)).toEqual([66_000_000])
    expect(revenue(e)).toBe(1_200_000)
    expect(e.vos[0]!.adjustment).toBe(0)
  })

  it('tm above the threshold waits for the approver before the budget moves', () => {
    const e = make('tm', { budget: '50000000' })
    const res = addAddendum(e.id, 96_000_000, 'Second year of the retainer', false)!
    expect(res.status).toBe('pending')
    expect([e.budget, e.feeEstimate]).toEqual([50_000_000, 60_000_000])
    expect(approveRequest(e.id, res.approval!.id, APPROVER)).toBe(true)
    expect([e.budget, e.feeEstimate]).toEqual([80_000_000, 96_000_000])
  })
})

describe('milestones', () => {
  it('verifying freezes the recognized amount at that moment', () => {
    const e = make('output', { value: '100000000', milestones: [{ id: 'd1', label: 'A', pct: '40' }, { id: 'd2', label: 'B', pct: '60' }] })
    expect(verifyMilestone(e.id, 'd1')).toBe(40_000_000)
    expect(e.milestones!.find(m => m.id === 'd1')!.recognized).toBe(40_000_000)
    // Verifying moves the project on to billing.
    expect(e.stage).toBe('billing')
  })

  it('unverify is allowed while uninvoiced and refused once invoiced', () => {
    const e = make('output', { value: '100000000', milestones: [{ id: 'd1', label: 'A', pct: '100' }] })
    verifyMilestone(e.id, 'd1')
    expect(unverifyMilestone(e.id, 'd1')).toBe(true)
    expect(revenue(e)).toBe(0)

    verifyMilestone(e.id, 'd1')
    saveInvoice({ engId: e.id, kind: 'output', label: 'A', milestoneId: 'd1', entryIds: null, date: TODAY, amount: 100_000_000 })
    expect(unverifyMilestone(e.id, 'd1')).toBe(false)
    expect(e.milestones![0]!.verified).toBe(true)
  })

  it('with no matching rule, submitMilestoneVerification verifies at once and keeps the details', () => {
    const e = make('output', { value: '100000000', milestones: [{ id: 'd1', label: 'A', pct: '100' }] })
    const res = submitMilestoneVerification(e.id, 'd1', { date: '2026-08-01', verifiedBy: 'Site inspector', document: 'BAST-1.pdf' }, PM)
    expect(res).toEqual({ status: 'verified', amount: 100_000_000 })
    expect(e.milestones![0]).toMatchObject({ verified: true, recognized: 100_000_000, verifiedAt: '2026-08-01', verifiedBy: 'Site inspector', recordedBy: PM, document: 'BAST-1.pdf' })
  })
})

describe('milestone verification approval — Cikarang (e7)', () => {
  it('verification waits for Rizal Candra; the submitter cannot approve it; approval recognizes with the stored details', () => {
    const e = findEngagement('e7')!
    const before = revenue(e)
    const res = submitMilestoneVerification('e7', 'm2', { date: '2026-08-02', verifiedBy: 'Site inspector', document: 'BAST-014.pdf' }, PM)
    expect(res.status).toBe('pending')
    if (res.status !== 'pending') return
    expect([res.approval.ruleName, res.approval.amount, res.approval.submittedBy, res.approval.approvers])
      .toEqual(['Milestone Verification Rule 001', 720_000_000, PM, [APPROVER]])
    expect(revenue(e)).toBe(before)
    // While the request is open the milestone cannot be verified another way, nor resubmitted.
    expect(verifyMilestone('e7', 'm2')).toBe(0)
    expect(submitMilestoneVerification('e7', 'm2', { date: TODAY, verifiedBy: 'x', document: null }, PM).status).toBe('blocked')

    expect(approveRequest('e7', res.approval.id, PM)).toBe(false)
    expect(approveRequest('e7', res.approval.id, APPROVER)).toBe(true)
    expect(revenue(e) - before).toBe(720_000_000)
    expect(e.milestones!.find(m => m.id === 'm2')).toMatchObject({ verified: true, recognized: 720_000_000, verifiedAt: '2026-08-02', verifiedBy: 'Site inspector', recordedBy: PM, document: 'BAST-014.pdf' })
    unverifyMilestone('e7', 'm2')
    expect(e.milestones!.find(m => m.id === 'm2')!.recordedBy).toBeNull()
    expect(revenue(e)).toBe(before)
  })

  it('a rejected verification leaves the milestone unverified, with the reason on the log', () => {
    const e = findEngagement('e7')!
    const res = submitMilestoneVerification('e7', 'm3', { date: TODAY, verifiedBy: 'Site inspector', document: null }, PM)
    if (res.status !== 'pending') throw new Error('expected a pending verification')
    expect(rejectRequest('e7', res.approval.id, APPROVER, 'BAST not signed')).toBe(true)
    expect(e.milestones!.find(m => m.id === 'm3')!.verified).toBe(false)
    expect(approvalFor(e, 'milestone-verification', 'm3')).toBeUndefined()
    expect(e.approvalLog!.at(-1)).toMatchObject({ refId: 'm3', decision: 'rejected', by: APPROVER, reason: 'BAST not signed' })
  })
})

describe('invoicing and collection', () => {
  it('a tm invoice marks its source lines invoiced and lands unpaid', () => {
    const e = make('tm', { value: '50000000' })
    e.entries.push({ id: 'i1', category: 'Labor', description: 'l', vendor: 'v', date: TODAY, amount: 1_000_000, markupPct: 20, src: 'Expense', docNo: 'E', decision: 'bill', invoiced: false, hours: null })
    const inv = saveInvoice({ engId: e.id, kind: 'tm', label: 'Progress billing', milestoneId: null, entryIds: ['i1'], date: TODAY, amount: 1_200_000 })!

    expect(inv.id).toMatch(/^INV-\d+$/)
    expect(inv.status).toBe('unpaid')
    expect(e.entries.find(x => x.id === 'i1')!.invoiced).toBe(true)
    expect(readyToInvoice(e)).toHaveLength(0)
    expect(billed(e)).toBe(1_200_000)
    expect(collected(e)).toBe(0)

    recordPayment(e.id, inv.id)
    expect(collected(e)).toBe(1_200_000)
    expect(e.invoices[0]!.paidDate).toBe(TODAY)
  })

  it('paying a billing-schedule invoice also settles its milestone', () => {
    const e = make('input', { value: '100000000' })
    const inv = saveInvoice({ engId: e.id, kind: 'billing', label: 'Down payment (30%)', milestoneId: 'b1', entryIds: null, date: TODAY, amount: 30_000_000 })!
    expect(e.billing!.find(b => b.id === 'b1')!.status).toBe('invoiced')
    recordPayment(e.id, inv.id)
    expect(e.billing!.find(b => b.id === 'b1')!.status).toBe('paid')
  })

  it('wipNet reports unbilled as positive and overbilled as negative', () => {
    const e = make('output', { value: '100000000', milestones: [{ id: 'd1', label: 'A', pct: '100' }] })
    verifyMilestone(e.id, 'd1')
    expect(wipNet(e)).toBe(100_000_000)                     // recognized, not yet invoiced
    saveInvoice({ engId: e.id, kind: 'output', label: 'A', milestoneId: 'd1', entryIds: null, date: TODAY, amount: 100_000_000 })
    expect(wipNet(e)).toBe(0)
  })

  it('invoice line maths: qty × unit price less discount, PPN on top', () => {
    const l = { id: 'l', product: 'p', description: '', qty: '2', unitPrice: '1000000', discount: '10', tax: 'PPN 11%', project: '' }
    expect(invoiceLineAmount(l)).toBe(1_800_000)
    expect(invoiceLineTax(l)).toBe(198_000)
    expect(invoiceLineTax({ ...l, tax: 'No tax' })).toBe(0)
  })
})

describe('closure gate', () => {
  it('tm cannot close with an unreviewed line, an uninvoiced one, or an unpaid invoice', () => {
    const e = make('tm', { value: '50000000' })
    e.entries.push({ id: 'z1', category: 'Labor', description: 'l', vendor: 'v', date: TODAY, amount: 1_000_000, markupPct: 20, src: 'Expense', docNo: 'E', decision: null, invoiced: false, hours: null })

    expect(canClose(e)).toBe(false)
    expect(closeHint(e)).toMatch(/review and invoice every cost line/)

    decideEntries(e.id, ['z1'], 'bill')
    expect(canClose(e)).toBe(false)                          // reviewed but not invoiced

    const inv = saveInvoice({ engId: e.id, kind: 'tm', label: 'Final', milestoneId: null, entryIds: ['z1'], date: TODAY, amount: 1_200_000 })!
    expect(canClose(e)).toBe(false)                          // invoiced but not collected

    recordPayment(e.id, inv.id)
    expect(canClose(e)).toBe(true)
    expect(closeEngagement(e.id)).toBe(true)
    expect(e.stage).toBe('closed')
    expect(e.closedAt).toBe(TODAY)
  })

  it('a pending addendum blocks closure outright', () => {
    const e = make('output', { value: '100000000', milestones: [{ id: 'd1', label: 'A', pct: '100' }] })
    verifyMilestone(e.id, 'd1')
    const inv = saveInvoice({ engId: e.id, kind: 'output', label: 'A', milestoneId: 'd1', entryIds: null, date: TODAY, amount: 100_000_000 })!
    recordPayment(e.id, inv.id)
    expect(canClose(e)).toBe(true)

    // 30.000.000 is above the Addendum rule, so it stays Pending.
    expect(addAddendum(e.id, 130_000_000, 'Late change request', false)!.status).toBe('pending')
    expect(canClose(e)).toBe(false)
    expect(closeHint(e)).toMatch(/Approve or reject every pending addendum/)
    expect(closeEngagement(e.id)).toBe(false)
  })

  it('the seeded pending addendum keeps Cikarang open', () => {
    const e = findEngagement('e7')!
    expect(canClose(e)).toBe(false)
    expect(closeHint(e)).toMatch(/Approve or reject every pending addendum/)
  })

  it('milestones: billed must equal revenue — a short invoice blocks closing until the rest is billed', () => {
    const e = make('output', { value: '100000000', milestones: [{ id: 'd1', label: 'A', pct: '100' }] })
    verifyMilestone(e.id, 'd1')
    const part = saveInvoice({ engId: e.id, kind: 'output', label: 'A', milestoneId: 'd1', entryIds: null, date: TODAY, amount: 60_000_000 })!
    recordPayment(e.id, part.id)
    expect(wipNet(e)).toBe(40_000_000)
    expect(canClose(e)).toBe(false)
    expect(closeHint(e)).toBe('To close, invoice the Rp40.000.000,00 of recognized revenue not yet billed, then record payment.')

    const rest = saveInvoice({ engId: e.id, kind: 'adhoc', label: 'Balance', milestoneId: null, entryIds: null, date: TODAY, amount: 40_000_000 })!
    expect(canClose(e)).toBe(false)                          // invoiced but not collected
    recordPayment(e.id, rest.id)
    expect(wipNet(e)).toBe(0)
    expect(canClose(e)).toBe(true)
  })

  it('milestones: billing ahead of revenue blocks closing too', () => {
    const e = make('output', { value: '100000000', milestones: [{ id: 'd1', label: 'A', pct: '100' }] })
    verifyMilestone(e.id, 'd1')
    const inv = saveInvoice({ engId: e.id, kind: 'output', label: 'A', milestoneId: 'd1', entryIds: null, date: TODAY, amount: 110_000_000 })!
    recordPayment(e.id, inv.id)
    expect(wipNet(e)).toBe(-10_000_000)
    expect(canClose(e)).toBe(false)
  })

  it('milestones: every milestone must be invoiced, even when the money already ties', () => {
    const e = make('output', { value: '100000000', milestones: [{ id: 'd1', label: 'A', pct: '50' }, { id: 'd2', label: 'B', pct: '50' }] })
    verifyMilestone(e.id, 'd1')
    verifyMilestone(e.id, 'd2')
    const inv = saveInvoice({ engId: e.id, kind: 'adhoc', label: 'Everything', milestoneId: null, entryIds: null, date: TODAY, amount: 100_000_000 })!
    recordPayment(e.id, inv.id)
    expect(wipNet(e)).toBe(0)
    expect(canClose(e)).toBe(false)
    expect(e.milestones!.every(m => m.invId)).toBe(false)
  })

  it('percentage of completion: 100% complete, every schedule row paid, billed = revenue', () => {
    const e = make('input', { value: '100000000', budget: '50000000' })
    e.entries.push({ id: 'p1', category: 'Material', description: 'm', vendor: 'v', date: TODAY, amount: 50_000_000, markupPct: 0, src: 'Expense', docNo: 'E', decision: null, invoiced: false, hours: null })
    const dp = saveInvoice({ engId: e.id, kind: 'billing', label: 'Down payment (30%)', milestoneId: 'b1', entryIds: null, date: TODAY, amount: 30_000_000 })!
    recordPayment(e.id, dp.id)
    expect(canClose(e)).toBe(false)
    const fin = saveInvoice({ engId: e.id, kind: 'billing', label: 'Final payment (70%)', milestoneId: 'b2', entryIds: null, date: TODAY, amount: 70_000_000 })!
    recordPayment(e.id, fin.id)
    expect([revenue(e), billed(e), wipNet(e)]).toEqual([100_000_000, 100_000_000, 0])
    expect(canClose(e)).toBe(true)
  })
})

describe('reopen — approvers only', () => {
  it('only Rizal Candra or Budi Santoso may reopen, with a reason, and it is logged', () => {
    const e = make('tm', { budget: '10000000' })
    e.entries.push({ id: 'r1', category: 'Labor', description: 'l', vendor: 'v', date: TODAY, amount: 1_000_000, markupPct: 20, src: 'Expense', docNo: 'E', decision: 'bill', invoiced: false, hours: null })
    const inv = saveInvoice({ engId: e.id, kind: 'tm', label: 'Final', milestoneId: null, entryIds: ['r1'], date: TODAY, amount: 1_200_000 })!
    recordPayment(e.id, inv.id)
    expect(closeEngagement(e.id, PM)).toBe(true)
    expect([e.closedAt, e.closedBy, projectStatusLabel(e)]).toEqual([TODAY, PM, 'Closed'])

    expect(canReopen(PM)).toBe(false)
    expect(canReopen(APPROVER)).toBe(true)
    expect(canReopen('Budi Santoso')).toBe(true)
    expect(reopenEngagement(e.id, PM, 'Late cost arrived')).toBe(false)
    expect(reopenEngagement(e.id, APPROVER, '  ')).toBe(false)
    expect(e.closedAt).toBe(TODAY)

    expect(reopenEngagement(e.id, APPROVER, 'Late cost arrived')).toBe(true)
    expect([e.stage, e.closedAt, e.closedBy, projectStatusLabel(e)]).toEqual(['billing', null, null, 'In progress'])
    expect(e.reopenLog).toEqual([{ date: TODAY, by: APPROVER, reason: 'Late cost arrived' }])
    expect(reopenEngagement(e.id, APPROVER, 'Again')).toBe(false)   // it is not closed any more
  })
})

describe('cost aging', () => {
  it('buckets unreviewed value by age at cost + margin', () => {
    const e = make('tm', { value: '50000000' })
    e.entries.push(
      { id: 'g1', category: 'Labor', description: 'recent', vendor: 'v', date: '2026-07-20', amount: 1_000_000, markupPct: 20, src: 'Expense', docNo: 'E', decision: null, invoiced: false, hours: null },
      { id: 'g2', category: 'Labor', description: 'old', vendor: 'v', date: '2026-04-01', amount: 2_000_000, markupPct: 20, src: 'Expense', docNo: 'E', decision: null, invoiced: false, hours: null },
    )
    const b = ageBuckets(e)
    expect(daysAgo('2026-07-20')).toBe(14)
    expect(b['0–30 days']).toBe(1_200_000)
    expect(b['90+ days']).toBe(2_400_000)
    expect(b['31–60 days']).toBe(0)
  })

  it('a reviewed line leaves the aging report entirely', () => {
    const e = make('tm', { value: '50000000' })
    e.entries.push({ id: 'g3', category: 'Labor', description: 'x', vendor: 'v', date: '2026-07-20', amount: 1_000_000, markupPct: 20, src: 'Expense', docNo: 'E', decision: null, invoiced: false, hours: null })
    expect(ageBuckets(e)['0–30 days']).toBe(1_200_000)
    decideEntries(e.id, ['g3'], 'bill')
    expect(ageBuckets(e)['0–30 days']).toBe(0)
  })
})

describe('budgetReport', () => {
  const plan = (value: string, cost: string) => ({
    value,
    budgetLines: {
      revenue: [{ id: 'br1', account: '4-10000 Project revenue', amount: value }],
      cost: [{ id: 'bc0', account: '5-10000 Cost of materials', amount: cost }],
    },
  })
  const spend = (amount: number) => ({ id: `bx-${amount}`, category: 'Material', description: 'm', vendor: 'v', date: TODAY, amount, markupPct: 0, src: 'Expense' as const, docNo: 'E', decision: null, invoiced: false, hours: null })

  it('cost is compared with the LIFETIME budget; over it is adverse', () => {
    const e = make('input', plan('100000000', '40000000'))
    e.entries.push(spend(50_000_000))

    const rows = budgetReport(e)
    const cost = rows.find(r => r.label === '5-10000 Cost of materials')!
    expect([cost.budget, cost.lifetimeBudget, cost.actual, cost.variance]).toEqual([40_000_000, 40_000_000, 50_000_000, -10_000_000])
    expect(cost.adverse).toBe(true)
    expect(cost.tone).toBe('adverse')
    expect(cost.note).toBe('Over budget')
    const total = rows.find(r => r.label === 'Total project cost')!
    expect([total.budget, total.variance, total.tone]).toEqual([40_000_000, -10_000_000, 'adverse'])

    // The overrun pushed % complete onto its 100 cap, so revenue lands exactly on
    // plan even though cost blew through it — the two variances move independently.
    const totalRev = rows.find(r => r.label === 'Total revenue')!
    expect(pocPct(e)).toBe(100)
    expect(workDoneShare(e)).toBe(1)
    expect([totalRev.budget, totalRev.actual, totalRev.variance]).toEqual([100_000_000, 100_000_000, 0])
    expect(totalRev.adverse).toBe(false)
  })

  it('cost part-way through is under its lifetime budget, never against a to-date slice', () => {
    const e = make('input', plan('100000000', '40000000'))
    e.entries.push(spend(10_000_000))
    const cost = budgetReport(e).find(r => r.label === '5-10000 Cost of materials')!
    expect([cost.budget, cost.actual, cost.variance, cost.pct]).toEqual([40_000_000, 10_000_000, 30_000_000, 75])
    expect([cost.adverse, cost.tone, cost.note]).toEqual([false, 'default', ''])
  })

  it('revenue is compared with lifetime × work done (cost to date ÷ budget): on plan when progress tracks cost', () => {
    const e = make('input', plan('100000000', '40000000'))
    e.entries.push(spend(10_000_000))

    const totalRev = budgetReport(e).find(r => r.label === 'Total revenue')!
    expect(pocPct(e)).toBe(25)
    expect(workDoneShare(e)).toBe(0.25)
    expect([totalRev.budget, totalRev.lifetimeBudget, totalRev.actual, totalRev.variance]).toEqual([25_000_000, 100_000_000, 25_000_000, 0])
    expect([totalRev.adverse, totalRev.note]).toEqual([false, ''])
  })

  it('revenue behind the work done is timing: reported as Not yet recognized, never adverse', () => {
    const e = make('output', { ...plan('100000000', '40000000'), milestones: [{ id: 'd1', label: 'A', pct: '50' }, { id: 'd2', label: 'B', pct: '50' }] })
    e.entries.push(spend(10_000_000))

    let rows = budgetReport(e)
    let rev = rows.find(r => r.label === 'Total revenue')!
    expect([rev.budget, rev.actual, rev.variance, rev.pct]).toEqual([25_000_000, 0, -25_000_000, -100])
    expect([rev.adverse, rev.tone, rev.note]).toEqual([false, 'default', 'Not yet recognized'])
    let gm = rows.find(r => r.label === 'Gross margin')!
    // Margin to date: plan 25.000.000 − 10.000.000 cost = 15.000.000; actual 0 − 10.000.000.
    expect([gm.budget, gm.lifetimeBudget, gm.actual, gm.variance]).toEqual([15_000_000, 60_000_000, -10_000_000, -25_000_000])
    expect([gm.adverse, gm.tone, gm.note]).toEqual([false, 'default', 'Not yet recognized'])

    // Verifying the first milestone puts revenue ahead of the work done.
    verifyMilestone(e.id, 'd1')
    rows = budgetReport(e)
    rev = rows.find(r => r.label === 'Total revenue')!
    expect([rev.actual, rev.variance, rev.tone, rev.note]).toEqual([50_000_000, 25_000_000, 'positive', ''])
    gm = rows.find(r => r.label === 'Gross margin')!
    expect([gm.actual, gm.variance, gm.tone]).toEqual([40_000_000, 25_000_000, 'positive'])
  })

  it('a projected loss at completion turns the margin row adverse', () => {
    const e = make('input', plan('30000000', '40000000'))
    e.entries.push(spend(10_000_000))
    expect(projectedMargin(e).value).toBe(-10_000_000)
    const rows = budgetReport(e)
    const gm = rows.find(r => r.label === 'Gross margin')!
    expect([gm.adverse, gm.tone, gm.note]).toEqual([true, 'adverse', 'Loss at completion'])
    // Cost itself is still inside its budget, so its row is not red.
    expect(rows.find(r => r.label === 'Total project cost')!.adverse).toBe(false)
  })

  it('projected margin: contract less the larger of budget and cost; cost plus margin earns its markup on that cost', () => {
    expect(projectedMargin(findEngagement('e1')!).value).toBe(19_200_000)    // 96.000.000 × 20%
    expect(projectedMargin(findEngagement('e2')!).value).toBe(5_600_000)     // 28.000.000 × 20%
    expect(projectedMargin(findEngagement('e3')!).value).toBeNull()          // no budget
    expect(projectedMargin(findEngagement('e5')!).value).toBe(15_000_000)    // 45.000.000 − 30.000.000
  })

  it('with no budget set, cost rows are unmeasurable but actuals still post', () => {
    const e = make('input', { budget: '', budgetLines: { revenue: [], cost: [] } })
    e.entries.push({ id: 'b2', category: 'Material', description: 'm', vendor: 'v', date: TODAY, amount: 7_000_000, markupPct: 0, src: 'Expense', docNo: 'E', decision: null, invoiced: false, hours: null })

    const rows = budgetReport(e)
    const totalCost = rows.find(r => r.label === 'Total project cost')!
    expect(totalCost.budget).toBeNull()
    expect(totalCost.variance).toBeNull()
    expect(totalCost.actual).toBe(7_000_000)
    expect(rows.find(r => r.label === 'Gross margin')!.variance).toBeNull()
  })

  it('routes each cost line to its account', () => {
    const at = (category: string) => accountForEntry({ id: 'x', category, description: '', vendor: '', date: TODAY, amount: 0, markupPct: 0, src: 'Expense', docNo: '', decision: null, invoiced: false, hours: null })
    expect(at('Labor')).toBe('6-10001 Direct labor')
    // Records written before the US-spelling pass still route to the same account.
    expect(at('Labour')).toBe('6-10001 Direct labor')
    expect(at('Material')).toBe('5-10000 Cost of materials')
    expect(at('Subcontractor')).toBe('5-10001 Subcontractor expense')
    expect(at('Expense')).toBe('6-10002 Site expense')
  })
})

describe('saveExpense — project is tagged per line', () => {
  it('splits one document across projects and leaves untagged lines unassociated', () => {
    const a = make('input', { name: 'Split A', value: '100000000' })
    const b = make('input', { name: 'Split B', value: '100000000' })
    const beforeA = a.entries.length
    const beforeB = b.entries.length

    const res = saveExpense({
      beneficiary: 'PT Vendor',
      date: TODAY,
      lines: [
        { id: 'l1', account: 'Cost of materials', description: 'Steel', project: a.id, hours: '', tax: 'No tax', amount: '5000000' },
        { id: 'l2', account: 'Subcontractor expense', description: 'Crew', project: b.id, hours: '8', tax: 'No tax', amount: '3000000' },
        { id: 'l3', account: 'Site expense', description: 'No project line', project: '', hours: '', tax: 'No tax', amount: '1000000' },
        { id: 'l4', account: 'Site expense', description: 'Zero, ignored', project: a.id, hours: '', tax: 'No tax', amount: '' },
      ],
    })

    expect(res.docNo).toMatch(/^EXP-\d+$/)
    expect(res.taggedIds).toEqual([a.id, b.id])
    expect(res.untagged).toBe(1)
    expect(a.entries).toHaveLength(beforeA + 1)
    expect(b.entries).toHaveLength(beforeB + 1)
    expect(a.entries.at(-1)!.category).toBe('Material')
    expect(b.entries.at(-1)!.category).toBe('Subcontractor')
    expect(b.entries.at(-1)!.hours).toBe(8)
    // Hours are analytical only — they never change the amount.
    expect(b.entries.at(-1)!.amount).toBe(3_000_000)
  })

  it('inherits the project margin so the line is chargeable at cost + margin', () => {
    const e = make('tm', { name: 'Margin carrier', markup: '25' })
    saveExpense({ beneficiary: 'V', date: TODAY, lines: [{ id: 'm1', account: 'Professional fees', description: 'Work', project: e.id, hours: '', tax: 'No tax', amount: '4000000' }] })
    expect(entryAmount(e.entries.at(-1)!)).toBe(5_000_000)
  })
})

describe('projectOptions', () => {
  it('offers "No project" first and hides closed projects', () => {
    const e = make('input', { name: 'Closable' })
    const opts = projectOptions()
    expect(opts[0]).toEqual({ id: '', name: 'No project' })
    expect(opts.some(o => o.id === e.id)).toBe(true)

    e.stage = 'closed'
    expect(projectOptions().some(o => o.id === e.id)).toBe(false)
  })

  // Cost can only be booked against a live contract. A project still waiting on
  // its creation approval, or rejected, has none — its own tabs stay locked.
  it('hides projects that are pending approval or rejected', () => {
    const e = make('input', { name: 'Awaiting approval' })
    expect(projectOptions().some(o => o.id === e.id)).toBe(true)

    e.approvals = [{
      id: 'apr-x', action: 'project-creation', refId: null, ruleId: 'awf-005',
      ruleName: 'Project Creation Rule 001', amount: e.contractValue,
      submittedBy: 'Rina Wulandari', submittedAt: TODAY, approvers: ['Rizal Candra'],
    }]
    expect(projectStatusLabel(e)).toBe('Pending approval')
    expect(projectOptions().some(o => o.id === e.id)).toBe(false)

    e.approvals[0]!.rejectedBy = 'Rizal Candra'
    expect(projectStatusLabel(e)).toBe('Rejected')
    expect(projectOptions().some(o => o.id === e.id)).toBe(false)

    e.approvals = []
    expect(projectOptions().some(o => o.id === e.id)).toBe(true)
  })
})

describe('portfolioTotals', () => {
  it('rolls revenue, cost, outstanding invoices and pending addenda across every project', () => {
    const t = portfolioTotals()
    expect(t.revenue).toBe(engagements.reduce((a, e) => a + revenue(e), 0))
    expect(t.cost).toBe(engagements.reduce((a, e) => a + actualCost(e), 0))
    expect(t.outstanding).toBe(engagements.reduce((a, e) => a + e.invoices.filter(i => i.status === 'unpaid').reduce((b, i) => b + i.amount, 0), 0))
    expect(t.pendingAddenda).toBe(engagements.reduce((a, e) => a + e.vos.filter(v => v.status === 'Pending').length, 0))
  })
})
