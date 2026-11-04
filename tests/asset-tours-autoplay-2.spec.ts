/**
 * SIM-4 to SIM-7 auto-play: replays every step's run through the store after
 * resetAssetStore(), applying View as the way the runner does, and checks
 * each figure a step's watch quotes against what the store then holds.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { ASSET_TOURS, type AssetTour, type TourStep } from '~/tours/assetTours'
import { workCtx } from '~/tours/assetTourWork2'
import { resetAssetStore, setViewAs, findAsset, type ViewAsRole } from '~/data/assetStore'
import { unassignedAssets, custodianSummary, custodyHistoryFor } from '~/data/assetCustody'
import { sessionById, countLines, variancesOf, unresolvedOf } from '~/data/assetCounts'
import { approvalSettings, requestById, approvalTrailFor } from '~/data/assetApprovals'
import { findLease, leaseSummary, combinedSchedule } from '~/data/assetLeases'
import { annualObligations, annualDone } from '~/data/assetIntangibles'
import { impairmentTests } from '~/data/assetStore'
import { assetHistory, versionViews, derivation, monthlySchedule, detailFigures } from '~/data/fixedAssetDetail'
import { lampiranStatus } from '~/data/assetTaxbook'

const rp = (n: number | null | undefined) => `Rp${Math.round(n ?? NaN).toLocaleString('id-ID')}`
const tour = (code: string) => ASSET_TOURS.find((t) => t.code === code)!

/** Enter steps from..to as the runner does: View as, then the step's work. */
function play(t: AssetTour, to: number, from = 0) {
  for (let i = from; i <= to; i++) {
    let role = t.role
    for (let j = 0; j <= i; j++) role = t.steps[j]!.role ?? role
    setViewAs(role as ViewAsRole)
    t.steps[i]!.run?.()
  }
}
const watchOf = (s: TourStep) => s.watch ?? ''

describe('SIM-4 to SIM-7 auto-play', () => {
  beforeEach(() => resetAssetStore())

  it('no step asks the reader to act; every step that did work runs it', () => {
    for (const code of ['SIM-4', 'SIM-5', 'SIM-6', 'SIM-7']) {
      const t = tour(code)
      expect(t.steps.every((s) => !s.action), code).toBe(true)
    }
    expect(tour('SIM-4').steps.filter((s) => s.run)).toHaveLength(8)
    expect(tour('SIM-5').steps.filter((s) => s.run)).toHaveLength(1)
    expect(tour('SIM-6').steps.filter((s) => s.run)).toHaveLength(1)
    expect(tour('SIM-7').steps.filter((s) => s.run)).toHaveLength(3)
  })

  it('SIM-4: custody, a count, two variances and an approved write-off', () => {
    const t = tour('SIM-4')
    const st = t.steps
    setViewAs('General Affairs')
    expect(unassignedAssets.value.map((a) => a.id)).toEqual(['FA-0047'])
    expect(watchOf(st[0]!)).toContain('Missing custody counts the assets with no custodian or location: 1. FA-0047')

    play(t, 1)
    expect(unassignedAssets.value).toHaveLength(0)
    const custody = custodyHistoryFor('FA-0047')
    expect(custody.map((c) => [c.field, c.to, c.reason, c.by]).sort()).toEqual([
      ['Custodian', 'Siti Rahma (GA)', 'Assigned to the HQ pool', 'Rudi Santoso'],
      ['Location', 'HQ vehicle pool', 'Assigned to the HQ pool', 'Rudi Santoso'],
    ])

    play(t, 3, 2)
    const rudi = custodianSummary.value.find((c) => c.name === 'Rudi Santoso (Warehouse)')!
    expect(rudi.held).toHaveLength(7)
    expect(watchOf(st[3]!)).toContain('Seven assets')

    play(t, 4, 4)
    expect(approvalSettings.value.writeOff).toBe(true)

    play(t, 5, 5)
    const s = () => sessionById(workCtx.sessionId)!
    expect(s().population.map((p) => p.assetId)).toEqual(['FA-0068', 'FA-0083', 'FA-0023', 'FA-0064'])
    expect(watchOf(st[5]!)).toContain(`4 tagged assets in scope: ${s().population.map((p) => p.assetId).join(', ')}, counted by ${s().counter}`)

    play(t, 6, 6)
    expect(countLines(s()).map((l) => [l.tag, l.result])).toEqual([
      ['TAG-MDN-068', 'found'], ['TAG-MDN-083', 'found'], ['TAG-MDN-023', 'wrong-location'], ['TAG-MDN-064', 'not-counted'],
    ])
    expect(watchOf(st[6]!)).toContain('3 of 4 counted')

    play(t, 7, 7)
    expect(variancesOf(s()).map((v) => [v.tag, v.kind])).toEqual([['TAG-MDN-023', 'wrong-location'], ['TAG-MDN-064', 'not-found']])
    expect(unresolvedOf(s())).toHaveLength(2)

    play(t, 8, 8)
    expect(unresolvedOf(s())).toHaveLength(0)

    play(t, 9, 9)
    expect(s().status).toBe('awaiting-approval')
    expect(s().resolutions['V-FA-0023']!.outcome).toBe('Location updated')
    expect(s().resolutions['V-FA-0064']!.outcome).toBe('Sent for approval · AP-0032')
    expect(watchOf(st[9]!)).toContain('Sent for approval · AP-0032')

    play(t, 10, 10)
    const req = requestById('AP-0032')!
    expect(st[10]!.target).toBe(`appr-${req.id.slice(-3)}`)
    for (const f of [req.items[0]!.accounting, req.items[0]!.tax]) expect(watchOf(st[10]!)).toContain(rp(f))

    play(t, 11, 11)
    expect(s().status).toBe('closed')
    expect(s().resolutions['V-FA-0064']!.outcome).toBe('AP-0032 approved by Fitri Handayani. Written off with no proceeds on both books')
    expect(watchOf(st[11]!)).toContain(s().resolutions['V-FA-0064']!.outcome!)

    const a = findAsset('FA-0064')!
    expect(a.status).toBe('Disposed')
    expect(approvalTrailFor('FA-0064').map((r) => r.who)).toEqual(['Fitri Handayani', 'Rudi Santoso'])
    const disposal = assetHistory(a)[0]!
    expect(disposal.what).toBe('Disposed for Rp0')
    expect(disposal.note).toBe(`Accounting loss of ${rp(req.items[0]!.accounting)}, tax loss of ${rp(req.items[0]!.tax)}`)
    expect(watchOf(st[12]!)).toContain(`the whole ${rp(req.items[0]!.accounting)} is a loss on each book`)
  })

  it('SIM-5: the Cakung lease and its 12-month extension', () => {
    const t = tour('SIM-5')
    const st = t.steps
    setViewAs('Accounting')
    const before = leaseSummary(findLease('LS-004')!)
    expect(watchOf(st[0]!)).toContain(rp(before.liability))
    const m = before.month
    for (const f of [m.rouCharge, m.interest, (m.rouCharge ?? 0) + m.interest, m.payment]) expect(watchOf(st[1]!)).toContain(rp(f))
    const sched0 = combinedSchedule(findLease('LS-004')!)
    const sep0 = sched0.find((r) => r.period === '2026-09')!
    const oct0 = sched0.find((r) => r.period === '2026-10')!
    for (const f of [sep0.interest, oct0.interest, sep0.rouCharge]) expect(watchOf(st[2]!)).toContain(rp(f))

    play(t, 4)
    const l = findLease('LS-004')!
    expect(l.modifications.map((x) => [x.id, x.extraMonths, x.reason])).toEqual([['LS-004-M1', 12, 'Addendum 2, twelve-month extension']])
    const after = leaseSummary(l)
    expect(watchOf(st[4]!)).toContain(rp(m.rouCharge))
    expect(watchOf(st[4]!)).toContain(rp(after.month.rouCharge))
    expect(watchOf(st[4]!)).toContain(rp(after.month.interest))
    expect(watchOf(st[4]!)).toContain('LS-004-M1 · from September 2026 · +12 months')

    const sched = combinedSchedule(l)
    const sep = sched.find((r) => r.period === '2026-09')!
    const aug = sched.find((r) => r.period === '2026-08')!
    expect(sep.remeasured).toBeTruthy()
    const w = watchOf(st[5]!)
    for (const f of [sep.remeasured!.from, sep.remeasured!.to, sep.rouCharge, aug.rouCharge, after.rouBookValue]) expect(w).toContain(rp(f))
    expect(w).toContain(`+${rp(sep.remeasured!.to - sep.remeasured!.from)}`)
    expect(after.term).toBe('01/02/2025 – 31/01/2031')
    expect(w).toContain('31/01/2031')
  })

  it('SIM-6: goodwill, its annual test and Lampiran 9', () => {
    const t = tour('SIM-6')
    const st = t.steps
    setViewAs('Accounting')
    const gw = findAsset('FA-0091')!
    const sep = monthlySchedule(gw, 12).find((r) => r.period === 'September 2026')!
    expect(sep.accounting).toBeNull()
    expect(sep.accountingAbsent).toBe('Not amortised')
    expect(watchOf(st[1]!)).toContain(`tax amortises ${rp(sep.tax)} a month`)
    const d = derivation(gw, 'tax', 'September 2026').map((x) => x.value).join(' ')
    expect(d).toContain('Rp2.400.000.000 over 240 months')
    expect(d).toContain('Month 31 of 240')
    expect(watchOf(st[2]!)).toContain('Rp2.400.000.000 over 240 months, month 31 of 240, charge Rp10.000.000')

    expect([annualDone.value.length, annualObligations.value.length]).toEqual([1, 2])
    expect(watchOf(st[3]!)).toContain('1 of 2 done')

    play(t, 4)
    expect([annualDone.value.length, annualObligations.value.length]).toEqual([2, 2])
    const test = impairmentTests.value.find((x) => x.assetId === 'FA-0091')!
    expect([test.id, test.outcome, test.date]).toEqual(['IT-2026-03', 'Not impaired', '30/09/2026'])
    expect(watchOf(st[4]!)).toContain(`${test.id} · ${test.date} · ${test.outcome}`)
    expect(watchOf(st[5]!)).toContain(`carrying amount ${rp(test.carrying)} against a recoverable amount of ${rp(test.recoverable)}`)

    const lamp = lampiranStatus()
    expect(watchOf(st[6]!)).toContain(`Part 1 · tangible reads ${lamp.tangible}, Part 2 · intangible ${lamp.intangible} and Unclassified ${lamp.unclassified.length}`)
  })

  it('SIM-7: improvement, life revision and partial disposal on FA-0031', () => {
    const t = tour('SIM-7')
    const st = t.steps
    setViewAs('Accounting')
    const a = () => findAsset('FA-0031')!
    const sep = () => monthlySchedule(a(), 12).find((r) => r.period === 'September 2026')!
    const oct = () => monthlySchedule(a(), 12).find((r) => r.period === 'October 2026')!
    const s0 = sep()
    expect(watchOf(st[0]!)).toContain(`September charges ${rp(s0.accounting)} in the accounts and ${rp(s0.tax)} for tax`)

    play(t, 1)
    const cost = detailFigures(a())[0]!
    expect(watchOf(st[1]!)).toContain(`${rp(1_250_000_000)} to ${rp(cost.value)}`)
    expect(cost.sub).toBe('Originally Rp1.250.000.000')
    const s1 = sep()
    expect(watchOf(st[2]!)).toContain(`from ${rp(s0.accounting)} to ${rp(s1.accounting)}`)
    expect(watchOf(st[2]!)).toContain(`from ${rp(s0.tax)} to ${rp(s1.tax)}`)

    play(t, 3, 3)
    const s2 = sep()
    expect(s2.tax).toBe(s1.tax)
    expect(watchOf(st[3]!)).toContain(`from ${rp(s1.accounting)} to ${rp(s2.accounting)}`)
    expect(watchOf(st[3]!)).toContain(`stays at ${rp(s2.tax)}`)

    play(t, 4, 4)
    const o = oct()
    expect(sep().accounting).toBe(s2.accounting)
    expect(watchOf(st[4]!)).toContain(`retained at ${rp(o.accounting)} a month`)
    expect(watchOf(st[4]!)).toContain(`retained at ${rp(o.tax)} a month`)
    expect(watchOf(st[5]!)).toContain(`September: ${rp(s2.accounting)} accounts, ${rp(s2.tax)} tax. From October: ${rp(o.accounting)} and ${rp(o.tax)}`)

    const h = assetHistory(a())
    expect(h.slice(0, 3).map((x) => [x.when, x.who])).toEqual([
      ['30/09/2026', 'Sari Wulandari'], ['01/09/2026', 'Sari Wulandari'], ['01/09/2026', 'Sari Wulandari'],
    ])
    const loss = h[0]!.note!.match(/Accounting loss (Rp\d[\d.]*\d), tax loss (Rp\d[\d.]*\d)/)!
    expect(watchOf(st[6]!)).toContain(`accounting loss of ${loss[1]} and a tax loss of ${loss[2]}`)
    expect(watchOf(st[4]!)).toContain(`a loss of ${loss[1]}`)
    expect(watchOf(st[4]!)).toContain(`a loss of ${loss[2]}`)

    expect(versionViews(a(), 'accounting')).toHaveLength(4)
    expect(versionViews(a(), 'tax')).toHaveLength(3)
    expect(watchOf(st[7]!)).toContain('four versions')
    expect(watchOf(st[8]!)).toContain('three versions')
    const replaced = versionViews(a(), 'accounting').filter((v) => !v.live).length + versionViews(a(), 'tax').filter((v) => !v.live).length
    expect(st[8]!.body).toContain(`Previous versions (${replaced})`)
  })
})
