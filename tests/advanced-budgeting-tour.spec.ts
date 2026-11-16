import { describe, it, expect, beforeEach } from 'vitest'
import { findLine, yearFigures, savingSlices, prById, changeById, budget } from '../app/data/budgetStore'
import { BUDGET_TOUR, TOUR_WORK, tourCtx } from '../app/tours/budgetTours'

const jt = 1_000_000

/** Replays BUD-1's auto-play work through the store; every figure the tour quotes must hold. */
describe('BUD-1 guided tour (auto-play)', () => {
  beforeEach(() => BUDGET_TOUR.onReset!())

  it('every step after the first does its own work and asks the reader for nothing', () => {
    expect(BUDGET_TOUR.steps.length).toBe(13)
    expect(TOUR_WORK.filter(Boolean).length).toBe(11)
    expect(BUDGET_TOUR.steps.every((s) => !s.action)).toBe(true)
  })

  it('replays the narrative with the quoted figures', () => {
    const acc = findLine('6-60120', 'NW', 'PA')!.id
    const meals = findLine('6-60103', 'NW', 'PA')!.id
    const cable = findLine('1-17010', 'NW', 'PA')!.id
    const f0 = yearFigures(acc)
    expect([f0.budget, f0.actual, f0.budget - f0.actual, f0.reserved + f0.committed, f0.available]).toEqual([240 * jt, 165 * jt, 75 * jt, 45 * jt, 30 * jt])

    const at = (i: number) => TOUR_WORK[i]!()
    at(1)
    expect(prById(tourCtx.prId)!.status).toBe('Draft')
    at(2)
    expect(prById(tourCtx.prId)!.block!.short).toBe(15 * jt)
    expect(yearFigures(meals).available).toBe(40 * jt)
    at(3); at(4)
    expect(changeById(tourCtx.frId)!.chain.filter((s) => s.status === 'Waiting').map((s) => s.approver)).toEqual(['Dimas Pratama'])
    at(5)
    expect(changeById(tourCtx.frId)!.version).toBe(3)
    expect(prById(tourCtx.prId)!.status).toBe('Pending')
    at(6)
    expect(prById(tourCtx.prId)!.approvalChain.map((s) => s.status)).toEqual(['Approved', 'Waiting'])
    at(7)
    const f1 = yearFigures(acc)
    expect(prById(tourCtx.prId)!.status).toBe('Approved')
    expect([f1.budget, f1.reserved, f1.committed, f1.actual, f1.available]).toEqual([255 * jt, 65 * jt, 25 * jt, 165 * jt, 0])
    const commitBefore = yearFigures(cable).committed
    at(8)
    expect(commitBefore - yearFigures(cable).committed).toBe(50 * jt)
    expect(budget.entries.some((e) => e.lineId === cable && e.event === 'Closed: Short delivery' && e.amount === -50 * jt)).toBe(true)
    at(9)
    expect(changeById(tourCtx.fillId)!.chain.map((s) => s.approver)).toEqual(['Hendra Gunawan'])
    at(10)
    expect(savingSlices().map((s) => [s.type, s.class, s.balance]).sort()).toEqual([['Completion', 'Capex', 50 * jt], ['Procurement', 'Opex', 8 * jt]])
    at(12)
    const run = budget.tieOuts[0]!
    expect(run.total!.difference).toBe(0)
    expect(run.noLine!.map((n) => [n.amount, n.docs])).toEqual([[4 * jt, ['PI-2026-0790']]])
  })

  it('reset clears the previous run', () => {
    TOUR_WORK[1]!()
    BUDGET_TOUR.onReset!()
    expect(tourCtx.prId).toBe('')
  })
})
