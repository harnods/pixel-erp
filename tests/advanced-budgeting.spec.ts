import { describe, it, expect, beforeEach } from 'vitest'
import {
  budget, resetBudget, findLine, yearFigures, monthFigures, createPR, submitPR, approvePR, raiseFundingRequest,
  submitChange, approveChange, changeById, prById, newChange, validateChange, createPO, postBill, closePOLine, closePO,
  reopenPOLine, poById, runTieOut, savingLine, savingSlices, sliceKey, drawSaving, canApproveChange, spreadEvenly,
  lockYear, importLines, isLocked, docsBehind, noLineActual, notCounted, setBudgetViewAs, rejectChange, overrunBills,
  BUDGET_YEAR, lineTotal, budgetLinesThisYear,
} from '../app/data/budgetStore'

const jt = 1_000_000
const line = (a: string, d: string, p: string | null) => findLine(a, d, p)!.id
const ACC_PA = () => line('6-60120', 'NW', 'PA')
const MEALS_PA = () => line('6-60103', 'NW', 'PA')

describe('advanced budgeting ledger (PRD FG-1 to FG-7)', () => {
  beforeEach(() => resetBudget())

  it('sample matches the product narrative: Rp30jt available, Rp75jt by budget minus invoices', () => {
    const f = yearFigures(ACC_PA())
    expect(f.budget).toBe(240 * jt)
    expect(f.actual).toBe(165 * jt)
    expect(f.reserved).toBe(20 * jt)
    expect(f.committed).toBe(25 * jt)
    expect(f.available).toBe(30 * jt)
    expect(f.budget - f.actual).toBe(75 * jt)
    expect(yearFigures(MEALS_PA()).available).toBe(40 * jt)
  })

  it('LR-1: a mix with no line finds no line', () => {
    expect(findLine('6-60120', 'NW', null)).toBeUndefined()
    const pr = createPR({ requester: 'Andi Saputra', date: '2026-10-05', lines: [{ account: '6-60120', dept: 'NW', project: null, amount: 1 * jt, description: 'x' }] })
    const res = submitPR(pr.id)
    expect(res.ok).toBe(false)
    expect(res.check.blocker!.message).toContain('No budget line')
  })

  it('LR-2: pending does not reduce available; approval holds', () => {
    const pb = line('6-60120', 'NW', 'PB')
    const f = yearFigures(pb)
    expect(f.pending).toBe(12 * jt)
    expect(f.available).toBe(f.budget - f.actual)
    const pr = budget.prs.find((p) => p.number === '#90145')!
    approvePR(pr.id); approvePR(pr.id)
    expect(yearFigures(pb).reserved).toBe(12 * jt)
    expect(yearFigures(pb).pending).toBe(0)
  })

  it('FG2-AC8: approving twice posts one reserve entry', () => {
    const pr = createPR({ requester: 'Andi Saputra', date: '2026-10-05', lines: [{ account: '6-60103', dept: 'NW', project: 'PA', amount: 2 * jt, description: 'x' }] })
    submitPR(pr.id, 'reason'); approvePR(pr.id, { finalStep: true }); approvePR(pr.id, { finalStep: true })
    expect(budget.entries.filter((e) => e.docId === pr.id && e.type === 'reserve')).toHaveLength(1)
  })

  it('narrative: block, Request funds, holder approves, request re-submits and passes', () => {
    const pr = createPR({ requester: 'Andi Saputra', date: '2026-10-05', lines: [{ account: '6-60120', dept: 'NW', project: 'PA', amount: 45 * jt, description: 'Hotel' }] })
    const res = submitPR(pr.id)
    expect(res.ok).toBe(false)
    expect(prById(pr.id)!.block!.short).toBe(15 * jt)
    const fr = raiseFundingRequest(pr.id)
    expect(fr.receivers[0]!.amount).toBe(15 * jt)
    expect(fr.donor!.lineId).toBe(MEALS_PA())
    fr.reasonCode = 'Unplanned site work'
    const sub = submitChange(fr.id)
    expect(sub.errors).toEqual([])
    expect(fr.chain.filter((s) => s.status === 'Waiting').map((s) => s.approver)).toEqual(['Dimas Pratama'])
    expect(yearFigures(MEALS_PA()).available).toBe(25 * jt)
    expect(approveChange(fr.id, 'Dimas Pratama').ok).toBe(true)
    expect(prById(pr.id)!.status).toBe('Pending')
    approvePR(pr.id); approvePR(pr.id)
    expect(prById(pr.id)!.status).toBe('Approved')
    expect(yearFigures(ACC_PA()).available).toBe(0)
  })

  it('FG4-AC1/LR-6: a cut cannot go below the floor; Opex and Capex do not mix', () => {
    const c = newChange({ kind: 'Transfer', donor: { lineId: MEALS_PA(), amount: 41 * jt }, receivers: [{ lineId: ACC_PA(), newLine: null, amount: 41 * jt }], reason: 'x' })
    expect(validateChange(c).join(' ')).toContain('can give at most Rp40.000.000')
    const c2 = newChange({ kind: 'Transfer', donor: { lineId: MEALS_PA(), amount: 5 * jt }, receivers: [{ lineId: line('1-17010', 'NW', 'PA'), newLine: null, amount: 5 * jt }], reason: 'x' })
    expect(validateChange(c2)).toContain('Opex and Capex money cannot mix.')
  })

  it('FG4-AC6/LR-8: cross-department adds the donor holder and CFO; preparer is skipped', () => {
    setBudgetViewAs('Budget Controller')
    const c = newChange({ kind: 'Transfer', donor: { lineId: MEALS_PA(), amount: 5 * jt }, receivers: [{ lineId: line('6-60120', 'OP', null), newLine: null, amount: 5 * jt }], reason: 'x' })
    submitChange(c.id)
    expect(c.chain.map((s) => s.approver)).toEqual(['Sari Wulandari', 'Dimas Pratama', 'Hendra Gunawan'])
    const own = newChange({ kind: 'Transfer', preparedBy: 'Dimas Pratama', donor: { lineId: MEALS_PA(), amount: 5 * jt }, receivers: [{ lineId: ACC_PA(), newLine: null, amount: 5 * jt }], reason: 'x' })
    submitChange(own.id)
    expect(own.chain.some((s) => s.approver === 'Dimas Pratama' && s.status === 'Waiting')).toBe(false)
    expect(canApproveChange(own, 'Dimas Pratama').ok).toBe(false)
  })

  it('rejecting a transfer frees the donor hold', () => {
    const c = newChange({ kind: 'Transfer', donor: { lineId: MEALS_PA(), amount: 5 * jt }, receivers: [{ lineId: ACC_PA(), newLine: null, amount: 5 * jt }], reason: 'x' })
    submitChange(c.id)
    expect(yearFigures(MEALS_PA()).available).toBe(35 * jt)
    rejectChange(c.id, 'no', 'Dimas Pratama')
    expect(yearFigures(MEALS_PA()).available).toBe(40 * jt)
  })

  it('FG7-AC1/AC3: closing the cable PO frees Rp50jt; reopen re-checks', () => {
    const po = budget.pos.find((p) => p.number === 'PO-2026-0412')!
    const cable = line('1-17010', 'NW', 'PA')
    const before = yearFigures(cable).available
    expect(closePOLine(po.id, 0, 'Short delivery')).toBe(50 * jt)
    expect(yearFigures(cable).available).toBe(before + 50 * jt)
    expect(reopenPOLine(po.id, 0).ok).toBe(true)
    expect(yearFigures(cable).available).toBe(before)
  })

  it('a PO from a request takes over its hold and is checked on the excess only', () => {
    const pr = createPR({ requester: 'Andi Saputra', date: '2026-10-05', lines: [{ account: '6-60103', dept: 'NW', project: 'PA', amount: 12 * jt, description: 'x' }] })
    submitPR(pr.id, 'r'); approvePR(pr.id, { finalStep: true })
    const before = yearFigures(MEALS_PA())
    const res = createPO({ prId: pr.id, vendor: 'v', date: '2026-10-06', lines: [{ prLine: 0, lineId: MEALS_PA(), description: 'x', amount: 12 * jt }] })
    expect(res.ok).toBe(true)
    const after = yearFigures(MEALS_PA())
    expect(after.reserved).toBe(before.reserved - 12 * jt)
    expect(after.committed).toBe(before.committed + 12 * jt)
    expect(after.available).toBe(before.available)
    const bill = postBill({ poId: res.po!.id, vendor: 'v', date: '2026-10-07', final: true, lines: [{ poLine: 0, account: '6-60103', dept: 'NW', project: 'PA', amount: 12 * jt, description: 'x' }] })
    expect(bill.ok).toBe(true)
    expect(yearFigures(MEALS_PA()).committed).toBe(before.committed)
    expect(poById(res.po!.id)!.status).toBe('Closed')
  })

  it('Release 1: a bill with no PO over available posts with a warning and lands on the overrun list', () => {
    const office = line('6-60111', 'NW', null)
    const avail = yearFigures(office).available
    const res = postBill({ poId: null, vendor: 'v', date: '2026-10-05', lines: [{ poLine: null, account: '6-60111', dept: 'NW', project: null, amount: avail + 3 * jt, description: 'x' }] })
    expect(res.ok).toBe(true)
    expect(overrunBills().map((b) => b.id)).toContain(res.bill!.id)
  })

  it('LR-4: tie-out passes on the sample; the reclass is not counted; no-line spend shows apart', () => {
    expect(runTieOut().failures).toEqual([])
    expect(notCounted().map((g) => g.docNo)).toContain('JE-2026-0318')
    expect(noLineActual()).toBe(4 * jt)
  })

  it('saving bucket: draw goes to the CFO alone; the bucket cannot be spent', () => {
    const slice = savingSlices()[0]!
    expect(slice.balance).toBe(8 * jt)
    setBudgetViewAs('Budget Controller')
    const d = drawSaving({ sliceKey: slice.key, toLineId: ACC_PA(), amount: 3 * jt, reason: 'x' })
    submitChange(d.id)
    expect(d.chain.map((s) => s.approver)).toEqual(['Hendra Gunawan'])
    expect(savingSlices()[0]!.balance).toBe(5 * jt)
    const pr = createPR({ requester: 'Andi Saputra', date: '2026-10-05', lines: [{ account: '9-99000', dept: 'CO', project: null, amount: 1 * jt, description: 'x' }] })
    expect(submitPR(pr.id).check.blocker!.message).toContain('saving bucket')
    expect(savingLine()).toBeDefined()
    expect(sliceKey(slice)).toBe(slice.key)
  })

  it('drill: committed on the accommodation line lists PO-2026-0398', () => {
    const docs = docsBehind(ACC_PA(), 'committed' as never)
    expect(docs).toEqual([])
    expect(docsBehind(ACC_PA(), 'commit').map((d) => d.docNo)).toEqual(['PO-2026-0398'])
    expect(docsBehind(ACC_PA(), 'reserve').map((d) => d.docNo).sort()).toEqual(['#90131', '#90138'])
  })

  it('sample requests exist in the Purchases module under the same number', async () => {
    const { purchaseRequests } = await import('../app/data/purchaseRequests')
    for (const pr of budget.prs) {
      const rec = purchaseRequests.find((r) => r.id === pr.purchaseRequestId)!
      expect(`#${rec.number}`).toBe(pr.number)
    }
  })

  it('LR-10: even spread puts the residue in December', () => {
    const m = spreadEvenly(100 * jt)
    expect(m[0]).toBe(8_333_333)
    expect(m[11]).toBe(8_333_337)
    expect(m.reduce((s, v) => s + v, 0)).toBe(100 * jt)
  })

  it('FG1-AC4/AC5: lock needs the totals to match; a bad row loads nothing', () => {
    const rows = [{ row: 2, account: '6-60120', dept: 'NW', project: 'PA', months: Array(12).fill(1 * jt) }, { row: 3, account: '6-60103', dept: 'NW', project: '', months: [...Array(11).fill(1 * jt), 'abc'] }]
    expect(importLines(rows, 2027).ok).toBe(false)
    expect(budget.lines.filter((l) => l.year === 2027)).toHaveLength(0)
    expect(importLines(rows.slice(0, 1), 2027).ok).toBe(true)
    expect(lockYear(2027, 13 * jt)).toEqual({ ok: false, gap: 1 * jt })
    expect(lockYear(2027, 12 * jt).ok).toBe(true)
    expect(isLocked(2027)).toBe(true)
    expect(importLines(rows.slice(0, 1), 2027).ok).toBe(false)
  })

  it('transfer cut never takes a month below zero', () => {
    const c = newChange({ kind: 'Transfer', month: 9, donor: { lineId: MEALS_PA(), amount: 25 * jt }, receivers: [{ lineId: ACC_PA(), newLine: null, amount: 25 * jt }], reason: 'x' })
    submitChange(c.id); approveChange(c.id, 'Dimas Pratama')
    const meals = findLine('6-60103', 'NW', 'PA')!
    expect(meals.months.every((v) => v >= 0)).toBe(true)
    expect(changeById(c.id)!.status).toBe('Approved')
    expect(budgetLinesThisYear.value.reduce((s, l) => s + lineTotal(l), 0)).toBeGreaterThan(0)
    expect(monthFigures(ACC_PA(), 9).budget).toBe(45 * jt)
    expect(BUDGET_YEAR).toBe(2026)
    void closePO
  })
})
