import { describe, it, expect, beforeEach } from 'vitest'
import {
  budget, resetBudget, findLine, yearFigures, createPR, submitPR, approvePR, raiseFundingRequest, submitChange,
  approveChange, prById, closePOLine, fillSaving, savingSlices, runTieOut, lineById, setBudgetViewAs, changeById,
} from '../app/data/budgetStore'
import { BUDGET_TOUR, CABLE_LINE_ID } from '../app/tours/budgetTours'

const jt = 1_000_000

/** Replays BUD-1 through the store so every figure the tour quotes stays true. */
describe('BUD-1 guided tour figures', () => {
  beforeEach(() => resetBudget())

  it('the cable line id the tour links to is the cable line', () => {
    expect(lineById(CABLE_LINE_ID)!.account).toBe('1-17010')
    expect(lineById(CABLE_LINE_ID)!.project).toBe('PA')
  })

  it('replays the narrative', () => {
    const acc = findLine('6-60120', 'NW', 'PA')!.id
    const meals = findLine('6-60103', 'NW', 'PA')!.id
    const f0 = yearFigures(acc)
    expect(f0.available).toBe(30 * jt)
    expect(f0.budget - f0.actual).toBe(75 * jt)
    expect(f0.reserved + f0.committed).toBe(45 * jt)
    setBudgetViewAs('Requester')
    const pr = createPR({ requester: 'Andi Saputra', date: '2026-10-05', lines: [{ account: '6-60120', dept: 'NW', project: 'PA', amount: 45 * jt, description: 'Hotel' }] })
    expect(submitPR(pr.id).ok).toBe(false)
    expect(prById(pr.id)!.block!.short).toBe(15 * jt)
    const fr = raiseFundingRequest(pr.id)
    expect(yearFigures(meals).available).toBe(40 * jt)
    fr.reasonCode = 'Unplanned site work'; fr.reason = 'Crew extended'
    submitChange(fr.id)
    expect(fr.chain.filter((s) => s.status === 'Waiting').map((s) => s.approver)).toEqual(['Dimas Pratama'])
    approveChange(fr.id, 'Dimas Pratama')
    expect(changeById(fr.id)!.version).toBe(3)
    expect(prById(pr.id)!.status).toBe('Pending')
    approvePR(pr.id); approvePR(pr.id)
    const f1 = yearFigures(acc)
    expect([f1.budget, f1.reserved, f1.committed, f1.actual, f1.available]).toEqual([255 * jt, 65 * jt, 25 * jt, 165 * jt, 0])
    const po = budget.pos.find((p) => p.number === 'PO-2026-0412')!
    expect(closePOLine(po.id, 0, 'Short delivery')).toBe(50 * jt)
    setBudgetViewAs('Budget Controller')
    const fill = fillSaving({ fromLineId: CABLE_LINE_ID, amount: 50 * jt, type: 'Completion', sourceDoc: 'PO-2026-0412', reason: 'Cable PO closed short' })
    expect(submitChange(fill.id).errors).toEqual([])
    expect(fill.chain.map((s) => s.approver)).toEqual(['Hendra Gunawan'])
    approveChange(fill.id, 'Hendra Gunawan')
    const slices = savingSlices()
    expect(slices.map((s) => [s.type, s.class, s.balance]).sort()).toEqual([['Completion', 'Capex', 50 * jt], ['Procurement', 'Opex', 8 * jt]])
    expect(runTieOut().failures).toEqual([])
    expect(BUDGET_TOUR.steps.length).toBe(14)
  })
})
