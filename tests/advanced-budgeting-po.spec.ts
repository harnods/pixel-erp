import { describe, it, expect, beforeEach } from 'vitest'
import {
  budget, resetBudget, findLine, yearFigures, setBudgetViewAs, poByNumber, prById, createPR, submitPR, approvePR,
  closePOLineAs, closePOAs, reopenPOLineAs, markFullyOrderedAs, commitmentSummary, commitmentLines, heldRequests,
  previewPOFromRequests, createPO, previewBill, postBillAs, overrunBills, overrunShort, canActOnCommitment, isIdlePO,
  poOpenTotal, linkBudgetPurchaseOrders, budgetPOsForRecord,
} from '../app/data/budgetStore'
import { purchaseOrders } from '../app/data/purchaseOrders'

const jt = 1_000_000
const line = (a: string, d: string, p: string | null) => findLine(a, d, p)!.id

describe('advanced budgeting: commitments, PO and invoice check (FG-7, FG-3)', () => {
  beforeEach(() => resetBudget())

  it('summary reads the sample: Rp20jt held by requests, Rp87jt open on POs, Rp12jt idle', () => {
    const s = commitmentSummary()
    expect(s.requestsHeld).toBe(20 * jt)
    expect(s.requestCount).toBe(2)
    expect(s.poOpen).toBe((50 + 25 + 12) * jt)
    expect(s.poCount).toBe(3)
    expect(s.idleOpen).toBe(12 * jt)
    expect(s.idleCount).toBe(1)
    expect(heldRequests().map((r) => r.number).sort()).toEqual(['#90131', '#90138'])
    expect(commitmentLines().find((r) => r.poNumber === 'PO-1102')!.idle).toBe(true)
  })

  it('FG7-AC1: the Procurement Officer closes PO-2026-0412 line 1 for short delivery and Rp50jt frees', () => {
    const cable = line('1-17010', 'NW', 'PA')
    const before = yearFigures(cable).available
    setBudgetViewAs('Requester')
    expect(closePOLineAs(poByNumber('PO-2026-0412')!.id, 0, 'Short delivery').ok).toBe(false)
    setBudgetViewAs('Procurement Officer')
    const res = closePOLineAs(poByNumber('PO-2026-0412')!.id, 0, 'Short delivery')
    expect(res).toEqual({ ok: true, freed: 50 * jt })
    expect(yearFigures(cable).available - before).toBe(50 * jt)
  })

  it('FG7-AC3: reopen re-runs the check and returns the gap when the line is short', () => {
    setBudgetViewAs('Procurement Officer')
    const po = poByNumber('PO-2026-0398')!
    const acc = line('6-60120', 'NW', 'PA')
    closePOLineAs(po.id, 0, 'Cancelled')
    expect(yearFigures(acc).available).toBe(55 * jt)
    // Another order takes Rp35jt, leaving Rp20jt: reopening Rp25jt is short Rp5jt.
    createPO({ prId: null, vendor: 'Hotel Santika Bekasi', date: '2026-10-05', lines: [{ prLine: null, lineId: acc, description: 'Rooms', amount: 35 * jt }] })
    const res = reopenPOLineAs(po.id, 0)
    expect(res.ok).toBe(false)
    expect(res.gap).toBe(5 * jt)
    expect(po.lines[0]!.closed).toBe(true)
  })

  it('FG7-AC2: a whole-PO close is all lines or none', () => {
    setBudgetViewAs('Procurement Officer')
    const po = poByNumber('PO-2026-0412')!
    po.lines.push({ lineId: 'missing', description: 'Ghost line', amount: 1 * jt, invoiced: 0, closed: false, closeReason: null, prLine: null })
    const res = closePOAs(po.id, 'Cancelled')
    expect(res.ok).toBe(false)
    expect(po.lines.every((l) => !l.closed)).toBe(true)
    expect(poOpenTotal(po)).toBe(50 * jt)
  })

  it('the Budget Controller closes idle POs only', () => {
    setBudgetViewAs('Budget Controller')
    const idle = poByNumber('PO-1102')!
    expect(isIdlePO(idle)).toBe(true)
    expect(canActOnCommitment('close', poByNumber('PO-2026-0412')).ok).toBe(false)
    expect(closePOAs(idle.id, 'Cancelled')).toEqual({ ok: true, freed: 12 * jt })
  })

  it('mark fully ordered frees the rest of a held request', () => {
    const pr = budget.prs.find((p) => p.number === '#90131')!
    setBudgetViewAs('AP Staff')
    expect(markFullyOrderedAs(pr.id).ok).toBe(false)
    setBudgetViewAs('Procurement Officer')
    expect(markFullyOrderedAs(pr.id)).toEqual({ ok: true, freed: 12 * jt })
    expect(prById(pr.id)!.status).toBe('Closed')
  })

  it('FG3-AC4: a PO from a request is checked only on the excess', () => {
    const acc = line('6-60120', 'NW', 'PA')
    setBudgetViewAs('Requester')
    const pr = createPR({ requester: 'Andi Saputra', date: '2026-10-05', lines: [{ account: '6-60120', dept: 'NW', project: 'PA', amount: 12 * jt, description: 'Hotel' }] })
    submitPR(pr.id, 'x'); approvePR(pr.id, { finalStep: true })
    // Available is now Rp18jt; a PO for Rp12jt + Rp19jt excess blocks short Rp1jt.
    const ok = previewPOFromRequests([{ prId: pr.id, prLine: 0, lineId: acc, description: 'Hotel', amount: 30 * jt }], '2026-10-05')
    expect(ok.rows[0]!.held).toBe(12 * jt)
    expect(ok.rows[0]!.excess).toBe(18 * jt)
    expect(ok.check.result).not.toBe('Block')
    const block = previewPOFromRequests([{ prId: pr.id, prLine: 0, lineId: acc, description: 'Hotel', amount: 31 * jt }], '2026-10-05')
    expect(block.check.result).toBe('Block')
    expect(block.check.blocker!.yearShort).toBe(1 * jt)
  })

  it('invoice on a PO posts through postBill; Final invoice is AP Staff only and frees the rest', () => {
    const po = poByNumber('PO-2026-0412')!
    const input = { poId: po.id, vendor: po.vendor, date: '2026-10-05', final: true, number: 'PINV-T-1', lines: [{ poLine: 0, account: '1-17010', dept: 'NW', project: 'PA', amount: 30 * jt, description: 'Cable' }] }
    setBudgetViewAs('Procurement Officer')
    expect(postBillAs(input).ok).toBe(false)
    setBudgetViewAs('AP Staff')
    expect(previewBill(input).ok).toBe(true)
    expect(postBillAs(input).ok).toBe(true)
    expect(po.lines[0]!.closed).toBe(true)
    expect(poOpenTotal(po)).toBe(0)
  })

  it('FG3-AC7: a no-PO bill over available posts with a warning and lands on the over-budget list', () => {
    const input = { poId: null, vendor: 'PT Boga Rasa', date: '2026-10-05', number: 'PINV-T-2', lines: [{ poLine: null, account: '6-60103', dept: 'NW', project: 'PA', amount: 45 * jt, description: 'Catering' }] }
    const p = previewBill(input)
    expect(p.ok).toBe(true)
    expect(p.overBudget).toBe(true)
    expect(p.overBudgetShort).toBe(5 * jt)
    setBudgetViewAs('AP Staff')
    expect(postBillAs(input).ok).toBe(true)
    const b = overrunBills().find((x) => x.number === 'PINV-T-2')!
    expect(overrunShort(b)).toBe(5 * jt)
  })

  it('an invoice with two projects is blocked', () => {
    const p = previewBill({ poId: null, vendor: 'x', date: '2026-10-05', lines: [
      { poLine: null, account: '6-60120', dept: 'NW', project: 'PA', amount: 1 * jt, description: 'a' },
      { poLine: null, account: '6-60120', dept: 'NW', project: 'PB', amount: 1 * jt, description: 'b' },
    ] })
    expect(p.ok).toBe(false)
    expect(p.message).toContain('one project')
  })

  it('seed budget POs appear in the Purchase orders list, once', () => {
    for (const n of ['PO-2026-0412', 'PO-2026-0398', 'PO-1102']) {
      const po = poByNumber(n)!
      expect(po.purchaseOrderId).toBeTruthy()
      const recs = purchaseOrders.filter((r) => r.id === po.purchaseOrderId)
      expect(recs).toHaveLength(1)
      expect(recs[0]!.number).toBe(n)
      expect(budgetPOsForRecord(po.purchaseOrderId!)).toHaveLength(1)
    }
    linkBudgetPurchaseOrders()
    expect(purchaseOrders.filter((r) => r.number === 'PO-2026-0412')).toHaveLength(1)
  })
})
