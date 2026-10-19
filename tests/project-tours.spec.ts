/**
 * PA-1 to PA-3, the Project accounting guided tours (app/tours/projectTours.ts).
 *
 * Replays every step's auto-play work through the module after the tour's
 * reset, and checks that every rupiah figure and percentage a step quotes is
 * one the module computes at that point in the story. Steps that are gated by
 * Settings › Approval workflows submit as the project manager and are decided
 * by the approver (Rizal Candra), never by the submitter. Also holds the tours to
 * the demo-layer contract: real routes, real markers, no reader actions, and a
 * reset that puts back exactly the module's own sample data.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import * as P from '~/data/projectAccounting'
import { sampleEngagements, resetProjectAccounting } from '~/data/projectAccountingTourWork'

// Captured before anything else touches the store: the module's own seed.
const strip = (list: P.Engagement[]) => JSON.parse(JSON.stringify(list, (k, v) => (k === 'id' && typeof v === 'string' && /^(c|tc)-/.test(v) ? 'x' : v)))
const MODULE_SEED = strip(P.engagements)

import { PROJECT_TOURS, TOUR_WORK, tourCtx } from '~/tours/projectTours'
import { TOUR_GROUPS } from '~/tours/tourRegistry'

const f = P.formatIdr
const tour = (code: string) => PROJECT_TOURS.find((t) => t.code === code)!
const eng = (id: string) => P.findEngagement(id)!
const copyOf = (s: { title: string; body: string; watch?: string }) => `${s.title} ${s.body} ${s.watch ?? ''}`
/** Every Rp figure a piece of copy quotes. */
const quoted = (text: string) => [...text.matchAll(/Rp[\d.]+,\d\d/g)].map((m) => m[0])

/**
 * Replays one tour step by step. `figures(i)` returns what the module shows at
 * step i (after its work); every Rp figure step i quotes must be among them.
 */
function replay(code: string, figures: (i: number) => (string | number)[]) {
  const t = tour(code)
  const work = TOUR_WORK[code]!
  t.steps.forEach((s, i) => {
    work[i]?.()
    const known = figures(i).map((x) => (typeof x === 'number' ? f(x) : x))
    for (const q of quoted(copyOf(s))) expect(known, `${code} step ${i + 1} quotes ${q}`).toContain(q)
  })
  // The closing panel quotes figures from the end state.
  return quoted(t.closing)
}

describe('the tours reset to the module\'s own sample data', () => {
  it('restates the seed exactly', () => {
    expect(strip(sampleEngagements())).toEqual(MODULE_SEED)
  })
  it('reset undoes a run', () => {
    P.verifyMilestone('e7', 'm1')
    P.addAddendum('e5', 1, 'reason', false)
    const dock = P.approvalFor(eng('e7'), 'addendum', 'v-e7-1')!
    P.approveRequest('e7', dock.id, 'Rizal Candra')
    resetProjectAccounting()
    expect(P.revenue(eng('e7'))).toBe(0)
    expect(eng('e5').vos).toEqual([])
    expect(P.pendingVos(eng('e7')).map((v) => v.id)).toEqual(['v-e7-1'])
    expect(eng('e7').contractValue).toBe(2_400_000_000)
    expect(strip(P.engagements)).toEqual(MODULE_SEED)
  })
})

describe('demo-layer contract', () => {
  const APP = resolve(__dirname, '..', 'app')
  const walk = (d: string, out: string[] = []): string[] => {
    for (const x of readdirSync(d)) { const p = join(d, x); if (statSync(p).isDirectory()) walk(p, out); else if (/\.(vue|ts)$/.test(x)) out.push(p) }
    return out
  }
  const markers = new Set<string>()
  for (const file of walk(APP)) {
    if (file.includes(join('app', 'tours'))) continue
    for (const m of readFileSync(file, 'utf8').matchAll(/ data-tour="([^"]+)"/g)) markers.add(m[1]!)
  }

  it('three tours, PA-1 to PA-3, in the Project accounting group of the one menu', () => {
    expect(PROJECT_TOURS.map((t) => t.code)).toEqual(['PA-1', 'PA-2', 'PA-3'])
    expect(TOUR_GROUPS.find((g) => g.key === 'project')!.tours).toBe(PROJECT_TOURS)
  })
  for (const t of PROJECT_TOURS) {
    it(`${t.code}: 6 to 12 auto-play steps on real routes and real markers`, () => {
      expect(t.steps.length).toBeGreaterThanOrEqual(6)
      expect(t.steps.length).toBeLessThanOrEqual(12)
      expect(t.onReset).toBeTypeOf('function')
      // No View as in this module: the runner must not fall back to the asset roles.
      expect(t.applyRole).toBeTypeOf('function')
      for (const s of t.steps) {
        expect(s.action, s.title).toBeUndefined()
        expect(s.role, s.title).toBeUndefined()
        expect(markers.has(s.target), `data-tour="${s.target}"`).toBe(true)
        const r = typeof s.route === 'function' ? s.route() : s.route
        expect(r, s.title).toMatch(/^\/project-accounting(\/(e1|e5|e7)\?tab=(setup|execution|recognition|billing|closed)|\/invoice\/new\?project=e\d&kind=(tm|output)|$)/)
      }
    })
    it(`${t.code}: copy is product copy`, () => {
      const all = [t.name, t.blurb, t.closing, ...t.steps.map(copyOf)].join(' ')
      expect(all).not.toMatch(/\u2014|prototype|\bengine\b|\bdesign\b|undefined/i)
      expect(all).not.toMatch(/\bMVP\b|\bNaN\b|\[object Object\]/)
    })
  }
  it('every label a step quotes is on a product screen', () => {
    const product = walk(APP).filter((x) => !x.includes(join('app', 'tours'))).map((x) => readFileSync(x, 'utf8')).join('\n')
    const all = PROJECT_TOURS.map((t) => [t.blurb, ...t.steps.map(copyOf)].join(' ')).join(' ')
    for (const q of [
      'Milestones', 'Cost plus margin', 'Percentage of completion', 'Awaiting invoice', 'Milestones verified', 'Create invoice',
      'Charge cost + margin', 'Charge at cost only', 'Waive charge', 'All cost lines reviewed.', 'No reviewed lines to invoice',
      'Not ready to close', 'Ready to close', 'Extends existing work', 'Separate new work', 'Pending approval', 'Add a milestone for the added work',
      'Verify milestone', 'Margin to date', 'Revenue recognized to date', 'Addendum Rule 001', 'Milestone Verification Rule 001',
      'Awaiting review', 'Up to date', 'Cash collected', 'Billed to date', 'This invoice', 'Fee estimate', 'Contract value',
      'Not verified', 'Unpaid', 'Paid', 'Catch-up adjustment of', 'Budget variance',
    ]) {
      expect(all, `a tour quotes "${q}"`).toContain(q)
      expect(product, `"${q}" on a product screen`).toContain(q)
    }
  })
})

describe('PA-1 quotes the figures the module computes', () => {
  beforeEach(() => tour('PA-1').onReset!())
  it('replays milestone, invoice, payment and margin', () => {
    const w = () => eng('e7')
    const closing = replay('PA-1', (i) => {
      const e = w()
      const ms = e.milestones!
      const base = [P.revenue(e), P.actualCost(e), e.budget!, e.contractValue, P.billed(e), P.collected(e), Math.abs(P.wipNet(e)), P.revenue(e) - P.actualCost(e)]
      if (i === 0) {
        expect(P.methodLabel(e.method)).toBe('Milestones')
        expect(Math.round((P.actualCost(e) / e.budget!) * 100)).toBe(44)
      }
      if (i === 1) expect(ms.map((m) => m.pct)).toEqual([40, 30, 30])
      if (i === 2) expect(e.entries.map((x) => x.docNo)).toEqual(['PO-0398', 'PO-0410', 'EXP-1174'])
      if (i === 3) {
        // Cikarang's verification rule holds the sign-off for the approver.
        const a = P.approvalFor(e, 'milestone-verification', 'm1')!
        expect([a.ruleName, a.submittedBy, a.approvers]).toEqual(['Milestone Verification Rule 001', 'Rina Wulandari', ['Rizal Candra']])
        expect(ms[0]!.verified).toBe(false)
        expect(P.revenue(e)).toBe(0)
        expect(P.approveRequest('e7', a.id, 'Rina Wulandari')).toBe(false)
      }
      if (i === 4) {
        expect(P.approvalFor(e, 'milestone-verification', 'm1')).toBeUndefined()
        expect(ms.filter((m) => m.verified).length).toBe(1)
        expect(ms[0]!.verified && !ms[0]!.invId).toBe(true)
        expect([ms[0]!.verifiedBy, ms[0]!.document]).toEqual(['Site inspector', 'BAST-014.pdf'])
        expect(e.approvalLog!.at(-1)).toMatchObject({ refId: 'm1', decision: 'approved', by: 'Rizal Candra' })
      }
      if (i === 6) {
        expect(e.invoices.map((x) => [x.label, x.amount, x.status])).toEqual([['Fabrication complete', 960_000_000, 'unpaid']])
        expect(P.wipNet(e)).toBe(0)
      }
      if (i === 7) {
        expect(e.invoices[0]!.status).toBe('paid')
        expect(e.invoices[0]!.paidDate).toBe('2026-08-03')
      }
      if (i === 8) {
        expect(Math.round(((P.revenue(e) - P.actualCost(e)) / P.revenue(e)) * 100)).toBe(15)
        expect(P.canClose(e)).toBe(false)
        expect(P.pendingVos(e)).toHaveLength(1)
        expect(ms.filter((m) => !m.verified).length).toBe(2)
      }
      return [...base, ...ms.map((m) => (P.formatIdr((e.contractValue * m.pct) / 100))), ...e.entries.map((x) => x.amount), e.budget! - P.actualCost(e), 0]
    })
    const e = w()
    expect(closing.sort()).toEqual([f(960_000_000), f(145_000_000)].sort())
    expect([P.revenue(e), P.billed(e), P.collected(e), P.revenue(e) - P.actualCost(e)]).toEqual([960_000_000, 960_000_000, 960_000_000, 145_000_000])
    expect(tourCtx.invoiceId).toMatch(/^INV-\d+$/)
  })
})

describe('PA-2 quotes the figures the module computes', () => {
  beforeEach(() => tour('PA-2').onReset!())
  it('replays review decisions, invoice, payment and margin', () => {
    const open = (e: P.Engagement) => P.openEntries(e)
    const closing = replay('PA-2', (i) => {
      const e = eng('e1')
      const gross = e.entries.reduce((a, x) => a + P.entryAmount(x), 0)
      const openVal = open(e).reduce((a, x) => a + P.entryAmount(x), 0)
      const old = open(e).filter((x) => P.daysAgo(x.date) > 60).reduce((a, x) => a + P.entryAmount(x), 0)
      const ready = P.readyToInvoice(e)
      const readyAmt = ready.reduce((a, x) => a + P.entryFinal(x), 0)
      const ob = e.entries.find((x) => x.description.includes('opening balance'))!
      const sp = e.entries.find((x) => x.description.includes('schedule preparation'))!
      if (i === 0) {
        expect([P.actualCost(e), openVal, old, P.revenue(e)]).toEqual([16_800_000, 20_160_000, 7_872_000, 0])
        expect(e.entries.length).toBe(5)
        expect(e.markupPct).toBe(20)
      }
      if (i === 1) expect(open(e).map((x) => P.daysAgo(x.date)).sort()).toEqual([105, 85])
      if (i === 2) {
        expect(ob.decision).toBe('atcost')
        expect(P.daysAgo(ob.date)).toBe(85)
        expect(open(e).map((x) => [x.id, P.daysAgo(x.date), P.entryAmount(x)])).toEqual([[sp.id, 105, 2_400_000]])
      }
      if (i === 3) {
        expect(sp.decision).toBe('absorb')
        expect(open(e)).toEqual([])
      }
      if (i === 4 || i === 5) expect(ready.length).toBe(4)
      if (i === 6) {
        expect(ready).toEqual([])
        expect(e.invoices.map((x) => [x.label, x.amount, x.status])).toEqual([['Progress billing', 16_848_000, 'unpaid']])
      }
      if (i === 7) expect([P.revenue(e), P.billed(e), P.collected(e), P.wipNet(e)]).toEqual([16_848_000, 16_848_000, 16_848_000, 0])
      if (i === 5) expect([e.feeEstimate, e.budget, e.markupPct]).toEqual([115_200_000, 96_000_000, 20])
      if (i === 8) {
        expect(P.canClose(e)).toBe(true)
        expect(P.revenue(e) - P.actualCost(e)).toBe(48_000)
      }
      return [P.actualCost(e), gross, openVal, old, P.revenue(e), readyAmt, P.billed(e), P.collected(e), Math.abs(P.wipNet(e)),
        P.revenue(e) - P.actualCost(e), gross - P.actualCost(e), e.feeEstimate, e.budget!, P.entryFinal(ob), P.entryAmount(ob), P.entryAmount(sp)]
    })
    expect(closing.sort()).toEqual([f(16_848_000), f(20_160_000), f(48_000)].sort())
  })
})

describe('PA-3 quotes the figures the module computes', () => {
  beforeEach(() => tour('PA-3').onReset!())
  it('replays an ungated catch-up and an approved separate-work milestone', () => {
    const closing = replay('PA-3', (i) => {
      const t = eng('e5')
      const w = eng('e7')
      const tv = t.vos[t.vos.length - 1]
      const wv = w.vos.find((v) => v.id === 'v-e7-1')!
      if (i === 0) expect(P.pocPct(t).toFixed(0)).toBe('62')
      if (i === 1) {
        // A Rp9.000.000 change is under the Addendum rule: no approval, applied at once.
        expect([tv!.status, tv!.distinct, tv!.raisedBy, tv!.approvedBy, tv!.adjustment, t.contractValue]).toEqual(['Approved', false, 'Made Ardika', null, 5_550_000, 54_000_000])
        expect(t.approvals ?? []).toEqual([])
      }
      if (i === 2) expect(P.pocPct(t).toFixed(0)).toBe('62')
      if (i === 3) {
        const a = P.approvalFor(w, 'addendum', wv.id)!
        expect([wv.status, wv.distinct, wv.raisedBy, a.ruleName, a.amount, a.approvers]).toEqual(['Pending', true, 'Rina Wulandari', 'Addendum Rule 001', 120_000_000, ['Rizal Candra']])
        expect(w.contractValue).toBe(2_400_000_000)
        expect(P.canClose(w)).toBe(false)
      }
      if (i === 4) {
        expect([wv.status, wv.approvedBy, wv.adjustment]).toEqual(['Approved', 'Rizal Candra', 0])
        expect(w.contractValue).toBe(2_520_000_000)
        expect(w.milestones!.map((m) => Math.round(m.pct * 100) / 100)).toEqual([38.1, 28.57, 28.57])
        expect(w.scopePending!.added).toBe(120_000_000)
      }
      if (i === 5) {
        const m = w.milestones![3]!
        expect([m.label, Math.round(m.pct * 100) / 100, m.verified]).toEqual(['Loading dock bays handed over', 4.76, false])
        expect(w.scopePending).toBeNull()
      }
      if (i === 6) {
        expect(Math.round(w.milestones!.reduce((a, m) => a + m.pct, 0))).toBe(100)
        expect(w.milestones!.length).toBe(4)
        expect(w.weightsNeedConfirm).toBe(false)
        expect(P.pendingVos(w)).toEqual([])
      }
      return [P.actualCost(t), t.budget!, P.revenue(t), t.contractValue, tv?.oldValue ?? 0, tv?.newValue ?? 0, tv?.adjustment ?? 0, 27_750_000,
        (tv?.newValue ?? 0) - (tv?.oldValue ?? 0), 25_000_000,
        w.contractValue, wv.oldValue, wv.newValue, w.scopePending?.added ?? 0,
        ...(w.milestones ?? []).map((m) => P.formatIdr((w.contractValue * m.pct) / 100))]
    })
    expect(P.revenue(eng('e5'))).toBe(33_300_000)
    expect(P.revenue(eng('e5')) - 27_750_000).toBe(5_550_000)
    expect(closing.sort()).toEqual([f(5_550_000), f(120_000_000)].sort())
  })
})
