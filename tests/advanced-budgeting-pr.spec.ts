import { describe, it, expect, beforeEach } from 'vitest'
import {
  budget, resetBudget, findLine, yearFigures, createPR, submitPR, prById, setBudgetViewAs,
  canApprovePR, approvePRAs, rejectPRAs, cancelPRAs, canCancelPR, prHeld, prWaitingStep, isFinalPRStep, updatePRDate,
} from '../app/data/budgetStore'
import { budgetPanel, newLineRoute, budgetPRForRequest } from '../app/data/budgetUiPurchaseRequests'
import { purchaseRequests } from '../app/data/purchaseRequests'

const jt = 1_000_000
const ACC_PA = () => findLine('6-60120', 'NW', 'PA')!.id
const pending = () => budget.prs.find((p) => p.number === '#90145')!

describe('purchase request screens × budget (FG-3)', () => {
  beforeEach(() => resetBudget())

  it('panel: Rp45jt on Accommodation Project A is short Rp15jt; amounts on one line combine', () => {
    const r = budgetPanel([
      { account: '6-60120', dept: 'NW', project: 'PA', amount: 30 * jt },
      { account: '6-60120', dept: 'NW', project: 'PA', amount: 15 * jt },
    ], 9)
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]!.year!.available).toBe(30 * jt)
    expect(r.rows[0]!.afterYear).toBe(-15 * jt)
    expect(r.rows[0]!.yearShort).toBe(15 * jt)
    expect(r.rows[0]!.state).toBe('short')
    expect(r.result).toBe('Block')
  })

  it('panel: an account outside control and a mix with no line', () => {
    const r = budgetPanel([
      { account: '6-60104', dept: 'NW', project: 'PA', amount: 5 * jt },
      { account: '6-60120', dept: 'NW', project: null, amount: 1 * jt },
    ], 9)
    expect(r.rows.map((x) => x.state)).toEqual(['not-controlled', 'no-line'])
    expect(newLineRoute(r.rows[1]!)).toBe('/budget-changes/new?kind=Mid-year%20insert&account=6-60120&dept=NW')
  })

  it('seed requests resolve to their budget records', () => {
    for (const n of [90131, 90138, 90120, 90118, 90145]) {
      const rec = purchaseRequests.find((r) => r.number === n)!
      expect(budgetPRForRequest(rec.id)?.number).toBe(`#${n}`)
    }
  })

  it('canApprovePR refuses the requester and the wrong person; chain runs Line Manager then holder', () => {
    const pr = pending()
    expect(canApprovePR(pr, 'Andi Saputra').ok).toBe(false)
    expect(canApprovePR(pr, 'Dimas Pratama').reason).toContain('Budi Hartono')
    expect(prWaitingStep(pr)!.approver).toBe('Budi Hartono')
    expect(approvePRAs(pr.id, 'Dimas Pratama').ok).toBe(false)
    const first = approvePRAs(pr.id, 'Budi Hartono')
    expect(first).toMatchObject({ ok: true, final: false })
    expect(first.next!.approver).toBe('Dimas Pratama')
    expect(pr.status).toBe('Pending')
    expect(isFinalPRStep(pr)).toBe(true)
    const pb = findLine('6-60120', 'NW', 'PB')!.id
    const before = yearFigures(pb).reserved
    const fin = approvePRAs(pr.id, 'Dimas Pratama')
    expect(fin).toMatchObject({ ok: true, final: true, held: 12 * jt })
    expect(yearFigures(pb).reserved - before).toBe(12 * jt)
  })

  it('final approver can cut, never raise; the hold follows the cut', () => {
    const pr = pending()
    approvePRAs(pr.id, 'Budi Hartono')
    expect(approvePRAs(pr.id, 'Dimas Pratama', [13 * jt]).reason).toContain('cannot be more')
    const res = approvePRAs(pr.id, 'Dimas Pratama', [9 * jt])
    expect(res.held).toBe(9 * jt)
    expect(prHeld(pr)).toBe(9 * jt)
  })

  it('reject needs a reason; cancel frees the hold and is refused to others', () => {
    const pr = pending()
    expect(rejectPRAs(pr.id, ' ', 'Budi Hartono').ok).toBe(false)
    approvePRAs(pr.id, 'Budi Hartono'); approvePRAs(pr.id, 'Dimas Pratama')
    expect(canCancelPR(pr, 'Budi Hartono').ok).toBe(false)
    const res = cancelPRAs(pr.id, 'Andi Saputra')
    expect(res).toMatchObject({ ok: true, freed: 12 * jt })
    expect(prById(pr.id)!.status).toBe('Cancelled')
    expect(prHeld(pr)).toBe(0)
  })

  it('a blocked draft keeps its block; date changes move the check month', () => {
    setBudgetViewAs('Requester')
    const pr = createPR({ requester: 'Andi Saputra', date: '2026-10-05', lines: [{ account: '6-60120', dept: 'NW', project: 'PA', amount: 45 * jt, description: 'Hotel' }] })
    const res = submitPR(pr.id)
    expect(res.ok).toBe(false)
    expect(prById(pr.id)!.block!.short).toBe(15 * jt)
    updatePRDate(pr.id, '2026-11-02')
    expect(prById(pr.id)!.month).toBe(10)
    expect(yearFigures(ACC_PA()).available).toBe(30 * jt)
  })
})
