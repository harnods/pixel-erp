import { describe, it, expect, beforeEach } from 'vitest'
import {
  budget, resetBudget, findLine, yearFigures, createPR, submitPR, raiseFundingRequest, changeById, prById, setBudgetViewAs,
  canPrepareChange, canEditChange, previewChange, saveChangeDraft, submitChangeDraft, canWithdrawChange, withdrawChangeAs,
  changeHeld, approveChange, markNoticeRead, markAllNoticesRead, noticesFor, savingSlices, savingLine, routeChain,
  type ChangeDraftInput,
} from '../app/data/budgetStore'
import { changeRows, changeStats, fundingGap, newLineClash, parseRupiahInput, blockedRequests } from '../app/data/budgetUiChanges'

const jt = 1_000_000
const line = (a: string, d: string, p: string | null) => findLine(a, d, p)!.id
const ACC_PA = () => line('6-60120', 'NW', 'PA')
const MEALS_PA = () => line('6-60103', 'NW', 'PA')

function transfer(amount: number, to = ACC_PA()): ChangeDraftInput {
  return { kind: 'Transfer', month: 9, donor: { lineId: MEALS_PA(), amount }, receivers: [{ lineId: to, newLine: null, amount }], reason: 'Crew moved', reasonCode: null, linkedPrId: null, saving: null }
}

describe('budget changes screens (FG-4)', () => {
  beforeEach(() => { resetBudget(); setBudgetViewAs('Budget Controller') })

  it('only the Budget Controller prepares changes; a requester may raise a funding request', () => {
    expect(canPrepareChange('Transfer', 'Budget Controller').ok).toBe(true)
    expect(canPrepareChange('Transfer', 'CFO').ok).toBe(false)
    expect(canPrepareChange('Funding request', 'Requester').ok).toBe(true)
    expect(canPrepareChange('Revision', 'Requester').ok).toBe(false)
    setBudgetViewAs('CFO')
    const res = saveChangeDraft(transfer(5 * jt))
    expect(res.ok).toBe(false)
    expect(res.reason).toContain('Budget Controller')
  })

  it('a draft holds nothing; submit holds the donor cut (FG4-AC2)', () => {
    const before = yearFigures(MEALS_PA()).available
    const draft = saveChangeDraft(transfer(10 * jt))
    expect(draft.ok).toBe(true)
    expect(yearFigures(MEALS_PA()).available).toBe(before)
    const sub = submitChangeDraft(transfer(10 * jt), draft.change!.id)
    expect(sub.ok).toBe(true)
    expect(changeById(draft.change!.id)!.status).toBe('Pending')
    expect(changeHeld(draft.change!.id)).toBe(10 * jt)
    expect(yearFigures(MEALS_PA()).available).toBe(before - 10 * jt)
  })

  it('a failed submit stores nothing and returns the rule errors', () => {
    const n = budget.changes.length
    const res = submitChangeDraft(transfer(41 * jt))
    expect(res.ok).toBe(false)
    expect(res.errors.join(' ')).toContain('can give at most Rp40.000.000')
    expect(budget.changes.length).toBe(n)
  })

  it('previewChange routes the chain before submit without storing a change', () => {
    const n = budget.changes.length
    const chain = routeChain(previewChange(transfer(5 * jt, line('6-60120', 'OP', null))))
    expect(chain.map((s) => s.approver)).toEqual(['Sari Wulandari', 'Dimas Pratama', 'Hendra Gunawan'])
    expect(budget.changes.length).toBe(n)
  })

  it('withdraw by the preparer frees the hold; someone else cannot withdraw', () => {
    const sub = submitChangeDraft(transfer(5 * jt))
    const id = sub.change!.id
    setBudgetViewAs('CFO')
    expect(canWithdrawChange(changeById(id)!).ok).toBe(false)
    expect(withdrawChangeAs(id).ok).toBe(false)
    setBudgetViewAs('Budget Controller')
    expect(withdrawChangeAs(id).ok).toBe(true)
    expect(changeById(id)!.status).toBe('Withdrawn')
    expect(changeHeld(id)).toBe(0)
  })

  it('funding request: the PR screen draft opens for edit, caps at 20% over the gap, re-submits the request', () => {
    setBudgetViewAs('Requester')
    const pr = createPR({ requester: 'Andi Saputra', date: '2026-10-05', lines: [{ account: '6-60120', dept: 'NW', project: 'PA', amount: 45 * jt, description: 'Hotel' }] })
    submitPR(pr.id)
    expect(blockedRequests('Andi Saputra').map((p) => p.id)).toContain(pr.id)
    const fr = raiseFundingRequest(pr.id)
    expect(canEditChange(fr).ok).toBe(true)
    const { gap, cap } = fundingGap(pr.id)
    expect(gap).toBe(15 * jt)
    expect(cap).toBe(18 * jt)
    const input: ChangeDraftInput = { kind: 'Funding request', month: fr.month, donor: { lineId: MEALS_PA(), amount: 19 * jt }, receivers: [{ lineId: ACC_PA(), newLine: null, amount: 19 * jt }], reason: fr.reason, reasonCode: null, linkedPrId: pr.id, saving: null }
    const bad = submitChangeDraft(input, fr.id)
    expect(bad.errors.join(' ')).toContain('at most 20% over the gap')
    expect(bad.errors).toContain('Pick a reason code.')
    const ok = submitChangeDraft({ ...input, donor: { lineId: MEALS_PA(), amount: 15 * jt }, receivers: [{ lineId: ACC_PA(), newLine: null, amount: 15 * jt }], reasonCode: 'Unplanned site work' }, fr.id)
    expect(ok.ok).toBe(true)
    expect(approveChange(fr.id, 'Dimas Pratama').ok).toBe(true)
    expect(prById(pr.id)!.status).toBe('Pending')
  })

  it('index rows and stats read the store; my approvals follow View as', () => {
    submitChangeDraft(transfer(5 * jt))
    const dimas = changeStats('Dimas Pratama')
    expect(dimas.pendingCount).toBe(1)
    expect(dimas.pendingAmount).toBe(5 * jt)
    expect(dimas.mineCount).toBe(1)
    expect(changeStats('Hendra Gunawan').mineCount).toBe(0)
    const rows = changeRows('Dimas Pratama')
    const tr = rows.find((r) => r.number === 'TR-2026-0102')!
    expect(tr.status).toBe('Approved')
    expect(tr.amount).toBe(10 * jt)
    expect(rows.filter((r) => r.mine).length).toBe(1)
  })

  it('notices: unread for the waiting approver, marked read on open', () => {
    submitChangeDraft(transfer(5 * jt))
    const n = noticesFor('Dimas Pratama').filter((x) => !x.read)
    expect(n.length).toBe(1)
    markNoticeRead(n[0]!.id)
    expect(noticesFor('Dimas Pratama').filter((x) => !x.read).length).toBe(0)
    submitChangeDraft(transfer(1 * jt))
    markAllNoticesRead('Dimas Pratama')
    expect(noticesFor('Dimas Pratama').every((x) => x.read)).toBe(true)
  })

  it('mid-year insert onto an existing mix is flagged; saving draw routes to the CFO', () => {
    expect(newLineClash({ lineId: null, newLine: { account: '6-60120', dept: 'NW', project: 'PA' }, amount: 1 })).toContain('already exists')
    expect(newLineClash({ lineId: null, newLine: { account: '6-60111', dept: 'OP', project: 'PA' }, amount: 1 })).toBeNull()
    const ins = submitChangeDraft({ ...transfer(2 * jt), kind: 'Mid-year insert', receivers: [{ lineId: null, newLine: { account: '6-60111', dept: 'NW', project: 'PA' }, amount: 2 * jt }] })
    expect(ins.ok).toBe(true)
    const slice = savingSlices()[0]!
    const draw = submitChangeDraft({ kind: 'Saving draw', month: 9, donor: { lineId: savingLine()!.id, amount: 3 * jt }, receivers: [{ lineId: ACC_PA(), newLine: null, amount: 3 * jt }], reason: 'Hotel overrun', reasonCode: null, linkedPrId: null, saving: { dept: slice.dept, project: slice.project, class: slice.class, type: slice.type, sourceDoc: '' } })
    expect(draw.ok).toBe(true)
    expect(draw.change!.chain.map((s) => s.approver)).toEqual(['Hendra Gunawan'])
  })

  it('amount input keeps whole rupiah', () => {
    expect(parseRupiahInput('15.000.000')).toBe(15 * jt)
    expect(parseRupiahInput('-5.000.000', true)).toBe(-5 * jt)
    expect(parseRupiahInput('-5.000.000')).toBe(5 * jt)
    expect(parseRupiahInput('')).toBe(0)
  })
})
