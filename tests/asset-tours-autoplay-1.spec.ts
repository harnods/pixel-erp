/**
 * SIM-1 to SIM-3 auto-play: replays every step's work in order after
 * resetAssetStore(), the way the tour runner does on Next, and checks that
 * each figure the step copy quotes is the one the store computes at that
 * point in the run.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { ASSET_TOURS, type AssetTour } from '~/tours/assetTours'
import { resetAssetStore, runs, journals, selfCheckFor, impairmentTests, fixedAssets } from '~/data/assetStore'
import { detailFigures, monthlySchedule, derivation, versionViews, findAsset } from '~/data/fixedAssetDetail'
import { fy2026Schedule, journalFor } from '~/data/depreciationSchedule'
import { statementFiguresAt, disposalImpactRows, impairmentImpactRows, differenceByAsset } from '~/data/fixedAssetScreens'
import { lampiranStatus } from '~/data/assetTaxbook'
import { journalDateFor } from '~/data/assetPolicy'
import { SIM3_DISPOSAL, drawerPreview } from '~/tours/assetTourWork1'

const rp = (n: number | null | undefined) => `Rp${Math.round(n ?? NaN).toLocaleString('id-ID')}`
const neg = (n: number) => `−${rp(Math.abs(n))}`
const tour = (code: string) => ASSET_TOURS.find((t) => t.code === code)!
const copyOf = (t: AssetTour, i: number) => { const s = t.steps[i]!; return `${s.title} ${s.body} ${s.watch ?? ''}` }
/** Enter step i the way the runner does: run its work, once. */
const enter = (t: AssetTour, i: number) => { t.steps[i]!.run?.() }
const fig = (id: string, label: string) => detailFigures(findAsset(id)!).find((f) => f.label === label)!
const month = (id: string, label: string) => monthlySchedule(findAsset(id)!, 12).find((r) => r.period === label)!

describe('SIM-1 to SIM-3 are auto-play', () => {
  for (const code of ['SIM-1', 'SIM-2', 'SIM-3']) {
    it(`${code}: no step asks the reader to do anything`, () => {
      const t = tour(code)
      expect(t.steps.every((s) => !s.action)).toBe(true)
      expect(t.steps.some((s) => s.run)).toBe(true)
    })
  }
  it('every step with work says what the tour did, in the screen\'s words', () => {
    const t1 = tour('SIM-1'); const t2 = tour('SIM-2'); const t3 = tour('SIM-3')
    expect(t1.steps.filter((s) => s.run).length).toBe(1)
    expect(t2.steps.filter((s) => s.run).length).toBe(3)
    expect(t3.steps.filter((s) => s.run).length).toBe(3)
    for (const t of [t1, t2, t3]) for (const s of t.steps.filter((x) => x.run)) expect(`${s.body} ${s.watch}`).toMatch(/tour|Posted/)
  })
})

describe('SIM-1 quotes what the store computes', () => {
  beforeEach(() => resetAssetStore())
  it('replays the tax group and reads every screen after it', () => {
    const t = tour('SIM-1')
    const before = statementFiguresAt()
    expect(fixedAssets.value.filter((a) => a.taxGroup === null).map((a) => a.id)).toEqual(['FA-0077'])
    expect(fig('FA-0077', 'Book value · tax').value).toBeNull()
    expect(copyOf(t, 8)).toContain(neg(before.netTemporaryDifference))
    expect(copyOf(t, 8)).toContain(rp(Math.abs(before.deferredTax)))

    for (let i = 0; i < t.steps.length; i++) enter(t, i)

    const tax = fig('FA-0077', 'Book value · tax'); const acc = fig('FA-0077', 'Book value · accounting'); const diff = fig('FA-0077', 'Cumulative difference')
    for (const f of [tax.value, acc.value, diff.value]) expect(copyOf(t, 2)).toContain(rp(f))
    expect(tax.caption).toContain('Tax group 2, 8 years')
    const sep = month('FA-0077', 'September 2026')
    for (const f of [sep.accounting, sep.tax, sep.accounting! - sep.tax!]) expect(copyOf(t, 3)).toContain(rp(f))
    const d77 = differenceByAsset().find((r) => r.id === 'FA-0077')!
    expect(d77.reason).toBe('Tax life longer than accounting · tax 8 years, accounting 5 years')
    expect(copyOf(t, 4)).toContain(`+${rp(d77.difference)}`)
    const after = statementFiguresAt()
    expect(copyOf(t, 4)).toContain(neg(after.netTemporaryDifference))
    const [d71] = disposalImpactRows()
    expect(d71!.assetId).toBe('FA-0071')
    expect(copyOf(t, 5)).toContain(rp(d71!.commercial)); expect(d71!.commercial).toBeGreaterThan(0)
    expect(copyOf(t, 5)).toContain(rp(Math.abs(d71!.fiscal))); expect(d71!.fiscal).toBeLessThan(0)
    expect(copyOf(t, 5)).toContain(rp(Math.abs(impairmentImpactRows()[0]!.commercial)))
    expect(copyOf(t, 6)).toContain(rp(month('FA-0031', 'September 2026').tax))
    const steps = derivation(findAsset('FA-0031')!, 'tax', 'September 2026').map((s) => s.value).join(' ')
    expect(steps).toContain('Rp1.250.000.000 over 192 months'); expect(steps).toContain('Month 39 of 192'); expect(steps).toContain('Rp6.510.417')
    expect(copyOf(t, 8)).toContain(neg(after.netTemporaryDifference))
    expect(copyOf(t, 8)).toContain(rp(Math.abs(after.deferredTax)))
    expect(after.deferredTax).toBeLessThan(0)
    const lamp = lampiranStatus()
    expect([lamp.tangible, lamp.intangible, lamp.unclassified.length, lamp.ready]).toEqual([20, 4, 0, true])
  })
})

describe('SIM-2 quotes what the store computes', () => {
  beforeEach(() => resetAssetStore())
  it('replays generate, policy and post', () => {
    const t = tour('SIM-2')
    enter(t, 0)
    const draft = runs.value.find((r) => r.period === '2026-09')!
    expect(draft.state).toBe('draft')
    expect(copyOf(t, 0)).toContain(`${draft.lines.length} assets`)
    expect(copyOf(t, 0)).toContain(rp(draft.total))
    expect(copyOf(t, 0)).toContain(draft.generatedOn)
    expect(fy2026Schedule()[8]!.accounting).toBe(draft.total)
    enter(t, 1)
    expect(copyOf(t, 1)).toContain(`${draft.lines.length} assets, ${rp(draft.total)}`)
    expect(copyOf(t, 1)).toContain(rp(draft.lines.find((l) => l.assetId === 'FA-0077')!.charge))
    enter(t, 2)
    expect(copyOf(t, 2)).toContain(`dated ${journalDateFor('2026-09')}.`)
    enter(t, 3)
    expect(journalDateFor('2026-09')).toBe('05/10/2026')
    enter(t, 4)
    const jl = journalFor(fy2026Schedule()[8]!)
    const dr = jl.reduce((s, l) => s + (l.debit ?? 0), 0); const cr = jl.reduce((s, l) => s + (l.credit ?? 0), 0)
    expect([dr, cr]).toEqual([draft.total, draft.total])
    expect(copyOf(t, 4)).toContain(rp(dr))
    enter(t, 5)
    const posted = runs.value.find((r) => r.period === '2026-09' && r.state === 'posted')!
    const j = journals.value.find((x) => x.number === posted.journal)!
    expect(copyOf(t, 5)).toContain(`${posted.journal} dated ${j.date}, ${rp(posted.total)} across ${posted.lines.length} assets`)
    enter(t, 6); enter(t, 7)
    const sc = selfCheckFor('2026-09')!
    expect(sc.tie.length).toBe(5)
    expect(sc.tie.every((r) => r.difference === 0)).toBe(true)
    expect(sc.checks.map((c) => c.state)).toEqual(['passed', 'passed', 'failed', 'incomplete'])
    expect(sc.checks[2]!.detail).toContain('FA-0077')
  })
})

describe('SIM-3 quotes what the store computes', () => {
  beforeEach(() => resetAssetStore())
  it('replays the impairment, the disposal and the correction', () => {
    const t = tour('SIM-3')
    enter(t, 0); enter(t, 1)
    const bv = fig('FA-0042', 'Book value · accounting').value
    expect(fig('FA-0042', 'Book value · tax').value).toBe(bv)
    expect(copyOf(t, 0)).toContain(rp(bv))
    expect(copyOf(t, 0)).toContain(rp(month('FA-0042', 'September 2026').accounting))

    enter(t, 2)
    const test = impairmentTests.value.find((x) => x.assetId === 'FA-0042')!
    expect(test.outcome).toBe('Impaired')
    for (const f of [test.carrying, test.recoverable, test.loss]) expect(copyOf(t, 2)).toContain(rp(f))
    enter(t, 3)
    const oct = month('FA-0042', 'October 2026'); const sep = month('FA-0042', 'September 2026')
    expect(sep.accounting).toBe(2_916_667)
    expect(copyOf(t, 3)).toContain(`${rp(oct.accounting)} against ${rp(oct.tax)}`)
    expect(oct.tax).toBe(sep.tax)
    enter(t, 4)
    const v = versionViews(findAsset('FA-0042')!, 'accounting')
    expect(v.filter((x) => !x.live).length + versionViews(findAsset('FA-0042')!, 'tax').filter((x) => !x.live).length).toBe(1)
    expect(copyOf(t, 3)).toContain('Previous versions (1)')
    expect(copyOf(t, 4)).toContain(`Version ${v.find((x) => !x.live)!.number} reads Replaced from ${v.find((x) => !x.live)!.supersededFrom}`)

    enter(t, 5)
    const pv = drawerPreview('FA-0047', 'dispose', SIM3_DISPOSAL).pv
    enter(t, 6)
    expect(findAsset('FA-0047')!.status).toBe('Disposed')
    expect(fig('FA-0047', 'Book value · tax').absent).toBe('Disposed')
    enter(t, 7)
    const d47 = disposalImpactRows().find((r) => r.assetId === 'FA-0047')!
    expect([d47.commercial, d47.fiscal]).toEqual([pv.books[0]!.gainLoss, pv.books[1]!.gainLoss])
    expect(d47.commercial).toBeGreaterThan(0); expect(d47.fiscal).toBeLessThan(0)
    expect(copyOf(t, 7)).toContain(`a gain of ${rp(d47.commercial)} in the accounts and a loss of ${rp(Math.abs(d47.fiscal))} for tax`)

    enter(t, 8); enter(t, 9)
    const s64 = (l: string) => month('FA-0064', l)
    const [jul, aug, sep64, oct64] = ['July 2026', 'August 2026', 'September 2026', 'October 2026'].map(s64)
    expect(sep64!.accounting).toBe(sep64!.tax)
    expect(jul!.accounting).toBe(aug!.accounting)
    expect(copyOf(t, 9)).toContain(`September carries ${rp(sep64!.accounting)} on both books, including a catch-up of ${rp(sep64!.accounting! - oct64!.accounting!)}`)
    expect(copyOf(t, 9)).toContain(`From October the charge is ${rp(oct64!.accounting)}`)
    expect(copyOf(t, 9)).toContain(`August and earlier stay at ${rp(aug!.accounting)}`)

    enter(t, 10); enter(t, 11)
    const j68 = month('FA-0068', 'July 2026')
    expect(copyOf(t, 10)).toContain(`${rp(j68.accounting)} on the accounting side and ${rp(j68.tax)} on the tax side`)
    const steps = derivation(findAsset('FA-0068')!, 'accounting', 'July 2026').map((s) => s.value).join(' ')
    expect(steps).toContain('Rp184.000.000 (cost Rp420.000.000 less Rp236.000.000 accumulated)')
    expect(steps).toContain('46 months remaining from July 2026')
    expect(steps).toContain(rp(j68.accounting))
    expect(copyOf(t, 11)).toContain(`stays at ${rp(j68.tax)}`)
  })
})
