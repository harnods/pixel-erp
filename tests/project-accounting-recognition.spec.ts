/**
 * Project accounting — the three recognition engines and the contract-addendum
 * rules (app/data/projectAccounting.ts).
 *
 * These are the numbers a controller would sign off on, so they are asserted
 * exactly as the source computes them:
 *
 *   tm     revenue = Σ entryFinal(x) over REVIEWED lines only
 *                    entryFinal: bill → cost×(1+margin), atcost → cost, absorb → 0
 *   input  revenue = recognizedBase + max(0, poc − pctAtVO)/100 × contractValue
 *                    poc = min(actualCost ÷ budget × 100, 100)
 *   output revenue = Σ recognized over VERIFIED milestones (frozen at verification)
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
  ageBuckets, daysAgo, budgetReport, budgetOf, accountForEntry,
  decideEntries, addAddendum, approveAddendum, rejectAddendum, confirmWeights,
  addScopeMilestone, verifyMilestone, unverifyMilestone, saveInvoice, recordPayment,
  closeEngagement, saveExpense, projectOptions, portfolioTotals,
  invoiceLineAmount, invoiceLineTax, draftWeightSum,
  TODAY, type EngagementDraft, type RecognitionMethod,
} from '~/data/projectAccounting'

// A minimal draft; each test overrides just what it cares about.
function draft(over: Partial<EngagementDraft> = {}): EngagementDraft {
  return {
    name: 'Test engagement',
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

/** Build an engagement of a given method with a known contract value and budget. */
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
})

describe('entryFinal — what the client is actually charged', () => {
  const line = { id: 'x', category: 'Labour', description: 'd', vendor: 'v', date: TODAY, amount: 1_000_000, markupPct: 20, src: 'Expense' as const, docNo: 'EXP-1', decision: null, invoiced: false, hours: null }

  it('bill charges cost plus the margin', () => {
    expect(entryFinal({ ...line, decision: 'bill' })).toBe(1_200_000)
    expect(entryAmount(line)).toBe(1_200_000)
  })

  it('atcost waives the margin', () => {
    expect(entryFinal({ ...line, decision: 'atcost' })).toBe(1_000_000)
  })

  it('absorb charges the client nothing', () => {
    expect(entryFinal({ ...line, decision: 'absorb' })).toBe(0)
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
        cost: [{ id: 'bc0', account: '5-10000 Cost of materials', amount: '40000000' }, { id: 'bc1', account: '6-10001 Direct labour', amount: '20000000' }],
      },
    })
    expect(e.budget).toBe(60_000_000)
    expect(budgetOf(e).cost).toHaveLength(2)
  })

  it('tm keeps the fee estimate (not contract value) and defaults the margin to 20%', () => {
    const e = make('tm', { value: '75000000', markup: '' })
    expect(e.feeEstimate).toBe(75_000_000)
    expect(e.contractValue).toBe(0)
    expect(e.markupPct).toBe(20)
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

describe('draftWeightSum', () => {
  it('sums the typed weights', () => {
    expect(draftWeightSum(draft({ milestones: [{ id: 'a', label: '', pct: '40' }, { id: 'b', label: '', pct: '30' }] }))).toBe(70)
  })
})

describe('decideEntries', () => {
  it('marks the selected lines and returns what they are worth to the client', () => {
    const e = make('tm', { value: '50000000' })
    e.entries.push(
      { id: 'k1', category: 'Labour', description: 'a', vendor: 'v', date: TODAY, amount: 1_000_000, markupPct: 20, src: 'Expense', docNo: 'E1', decision: null, invoiced: false, hours: null },
      { id: 'k2', category: 'Labour', description: 'b', vendor: 'v', date: TODAY, amount: 2_000_000, markupPct: 20, src: 'Expense', docNo: 'E2', decision: null, invoiced: false, hours: null },
    )
    const total = decideEntries(e.id, ['k1', 'k2'], 'bill')
    expect(total).toBe(3_600_000)
    expect(revenue(e)).toBe(3_600_000)
    expect(openEntries(e)).toHaveLength(0)
    expect(readyToInvoice(e)).toHaveLength(2)
  })

  it('absorbed lines are reviewed but never become billable', () => {
    const e = make('tm', { value: '50000000' })
    e.entries.push({ id: 'k3', category: 'Labour', description: 'c', vendor: 'v', date: TODAY, amount: 5_000_000, markupPct: 20, src: 'Expense', docNo: 'E3', decision: null, invoiced: false, hours: null })
    decideEntries(e.id, ['k3'], 'absorb')
    expect(revenue(e)).toBe(0)
    expect(openEntries(e)).toHaveLength(0)
    expect(readyToInvoice(e)).toHaveLength(0)
  })
})

describe('addenda — the contract is append-only', () => {
  it('a raised addendum is Pending and does NOT move the contract value', () => {
    const e = make('input', { value: '100000000' })
    addAddendum(e.id, 150_000_000, 'Extra scope requested', false)
    expect(e.vos).toHaveLength(1)
    expect(e.vos[0]!.status).toBe('Pending')
    expect(e.vos[0]!.oldValue).toBe(100_000_000)
    expect(e.contractValue).toBe(100_000_000)
    expect(e.vos[0]!.raisedBy).toContain('Project Manager')
  })

  it('rejecting keeps the addendum on the record — the refusal is part of the trail', () => {
    const e = make('input', { value: '100000000' })
    addAddendum(e.id, 150_000_000, 'Extra scope requested', false)
    rejectAddendum(e.id, e.vos[0]!.id)
    expect(e.vos).toHaveLength(1)
    expect(e.vos[0]!.status).toBe('Rejected')
    expect(e.contractValue).toBe(100_000_000)
  })

  it('input + NOT distinct → one-time cumulative catch-up on the new value', () => {
    const e = make('input', { value: '100000000', budget: '50000000' })
    e.entries.push({ id: 'a1', category: 'Material', description: 'm', vendor: 'v', date: TODAY, amount: 25_000_000, markupPct: 0, src: 'Expense', docNo: 'E', decision: null, invoiced: false, hours: null })
    expect(pocPct(e)).toBe(50)
    expect(revenue(e)).toBe(50_000_000)

    addAddendum(e.id, 200_000_000, 'Same obligation, larger build', false)
    approveAddendum(e.id, e.vos[0]!.id)

    // Whole thing remeasured: 50% of the NEW value.
    expect(e.contractValue).toBe(200_000_000)
    expect(revenue(e)).toBe(100_000_000)
    expect(e.vos[0]!.adjustment).toBe(50_000_000)
    expect(e.vos[0]!.approvedBy).toContain('Finance Controller')
  })

  it('input + distinct → prospective: what is already earned is frozen', () => {
    const e = make('input', { value: '100000000', budget: '50000000' })
    e.entries.push({ id: 'a2', category: 'Material', description: 'm', vendor: 'v', date: TODAY, amount: 25_000_000, markupPct: 0, src: 'Expense', docNo: 'E', decision: null, invoiced: false, hours: null })

    addAddendum(e.id, 200_000_000, 'Separate structure as well', true)
    approveAddendum(e.id, e.vos[0]!.id)

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

    addAddendum(e.id, 200_000_000, 'Extended the same building', false)
    approveAddendum(e.id, e.vos[0]!.id)

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

    addAddendum(e.id, 250_000_000, 'Also build a separate guard house', true)
    approveAddendum(e.id, e.vos[0]!.id)

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

  it('tm → the fee estimate is replaced; reviewed work is not restated', () => {
    const e = make('tm', { value: '50000000' })
    e.entries.push({ id: 'a4', category: 'Labour', description: 'l', vendor: 'v', date: TODAY, amount: 1_000_000, markupPct: 20, src: 'Expense', docNo: 'E', decision: 'bill', invoiced: false, hours: null })
    expect(revenue(e)).toBe(1_200_000)

    addAddendum(e.id, 80_000_000, 'Extended engagement letter', false)
    approveAddendum(e.id, e.vos[0]!.id)

    expect(e.feeEstimate).toBe(80_000_000)
    expect(revenue(e)).toBe(1_200_000)
    expect(e.vos[0]!.adjustment).toBe(0)
  })
})

describe('milestones', () => {
  it('verifying freezes the recognized amount at that moment', () => {
    const e = make('output', { value: '100000000', milestones: [{ id: 'd1', label: 'A', pct: '40' }, { id: 'd2', label: 'B', pct: '60' }] })
    expect(verifyMilestone(e.id, 'd1')).toBe(40_000_000)
    expect(e.milestones!.find(m => m.id === 'd1')!.recognized).toBe(40_000_000)
    // Verifying moves the engagement on to billing.
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
})

describe('invoicing and collection', () => {
  it('a tm invoice marks its source lines invoiced and lands unpaid', () => {
    const e = make('tm', { value: '50000000' })
    e.entries.push({ id: 'i1', category: 'Labour', description: 'l', vendor: 'v', date: TODAY, amount: 1_000_000, markupPct: 20, src: 'Expense', docNo: 'E', decision: 'bill', invoiced: false, hours: null })
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
    e.entries.push({ id: 'z1', category: 'Labour', description: 'l', vendor: 'v', date: TODAY, amount: 1_000_000, markupPct: 20, src: 'Expense', docNo: 'E', decision: null, invoiced: false, hours: null })

    expect(canClose(e)).toBe(false)
    expect(closeHint(e)).toMatch(/Review every worked line/)

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

    addAddendum(e.id, 120_000_000, 'Late change request', false)
    expect(canClose(e)).toBe(false)
    expect(closeHint(e)).toMatch(/approved or rejected/)
    expect(closeEngagement(e.id)).toBe(false)
  })
})

describe('cost ageing', () => {
  it('buckets unreviewed value by age at cost + margin', () => {
    const e = make('tm', { value: '50000000' })
    e.entries.push(
      { id: 'g1', category: 'Labour', description: 'recent', vendor: 'v', date: '2026-07-20', amount: 1_000_000, markupPct: 20, src: 'Expense', docNo: 'E', decision: null, invoiced: false, hours: null },
      { id: 'g2', category: 'Labour', description: 'old', vendor: 'v', date: '2026-04-01', amount: 2_000_000, markupPct: 20, src: 'Expense', docNo: 'E', decision: null, invoiced: false, hours: null },
    )
    const b = ageBuckets(e)
    expect(daysAgo('2026-07-20')).toBe(14)
    expect(b['0–30 days']).toBe(1_200_000)
    expect(b['90+ days']).toBe(2_400_000)
    expect(b['31–60 days']).toBe(0)
  })

  it('a reviewed line leaves the ageing report entirely', () => {
    const e = make('tm', { value: '50000000' })
    e.entries.push({ id: 'g3', category: 'Labour', description: 'x', vendor: 'v', date: '2026-07-20', amount: 1_000_000, markupPct: 20, src: 'Expense', docNo: 'E', decision: null, invoiced: false, hours: null })
    expect(ageBuckets(e)['0–30 days']).toBe(1_200_000)
    decideEntries(e.id, ['g3'], 'bill')
    expect(ageBuckets(e)['0–30 days']).toBe(0)
  })
})

describe('budgetReport', () => {
  it('cost variance is favourable when budget exceeds actual, revenue the other way', () => {
    const e = make('input', {
      value: '100000000',
      budgetLines: {
        revenue: [{ id: 'br1', account: '4-10000 Project revenue', amount: '100000000' }],
        cost: [{ id: 'bc0', account: '5-10000 Cost of materials', amount: '40000000' }],
      },
    })
    e.entries.push({ id: 'b1', category: 'Material', description: 'm', vendor: 'v', date: TODAY, amount: 50_000_000, markupPct: 0, src: 'Expense', docNo: 'E', decision: null, invoiced: false, hours: null })

    const rows = budgetReport(e)
    const cost = rows.find(r => r.label === '5-10000 Cost of materials')!
    expect(cost.actual).toBe(50_000_000)
    expect(cost.variance).toBe(-10_000_000)      // 40m budget − 50m actual
    expect(cost.adverse).toBe(true)
    expect(cost.note).toBe('Over budget')

    // The overrun pushed % complete onto its 100 cap, so revenue lands exactly on
    // plan even though cost blew through it — the two variances move independently.
    const totalRev = rows.find(r => r.label === 'Total revenue')!
    expect(pocPct(e)).toBe(100)
    expect(totalRev.actual).toBe(100_000_000)
    expect(totalRev.variance).toBe(0)
    expect(totalRev.adverse).toBe(false)
  })

  it('flags revenue below plan when progress is genuinely part-way', () => {
    const e = make('input', {
      value: '100000000',
      budgetLines: {
        revenue: [{ id: 'br1', account: '4-10000 Project revenue', amount: '100000000' }],
        cost: [{ id: 'bc0', account: '5-10000 Cost of materials', amount: '40000000' }],
      },
    })
    e.entries.push({ id: 'b3', category: 'Material', description: 'm', vendor: 'v', date: TODAY, amount: 10_000_000, markupPct: 0, src: 'Expense', docNo: 'E', decision: null, invoiced: false, hours: null })

    const totalRev = budgetReport(e).find(r => r.label === 'Total revenue')!
    expect(pocPct(e)).toBe(25)
    expect(totalRev.actual).toBe(25_000_000)
    expect(totalRev.variance).toBe(-75_000_000)
    expect(totalRev.adverse).toBe(true)          // below plan
    expect(totalRev.note).toBe('Below plan')
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
    expect(at('Labour')).toBe('6-10001 Direct labour')
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

  it('inherits the engagement margin so the line is chargeable at cost + margin', () => {
    const e = make('tm', { name: 'Margin carrier', value: '50000000', markup: '25' })
    saveExpense({ beneficiary: 'V', date: TODAY, lines: [{ id: 'm1', account: 'Professional fees', description: 'Work', project: e.id, hours: '', tax: 'No tax', amount: '4000000' }] })
    expect(entryAmount(e.entries.at(-1)!)).toBe(5_000_000)
  })
})

describe('projectOptions', () => {
  it('offers "No project" first and hides closed engagements', () => {
    const e = make('input', { name: 'Closable' })
    const opts = projectOptions()
    expect(opts[0]).toEqual({ id: '', name: 'No project' })
    expect(opts.some(o => o.id === e.id)).toBe(true)

    e.stage = 'closed'
    expect(projectOptions().some(o => o.id === e.id)).toBe(false)
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
