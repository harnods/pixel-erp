/**
 * FG-8 leases, FG-9 intangibles, the OD-09/OD-10 settings and the annual
 * test obligation, against the live store with the lease contracts loaded.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  fixedAssets, resetAssetStore, ledgerOf, findAsset, postPeriod, reversePeriod, generateRun, runs, journals,
  computeSelfCheck, fyFigures, createAsset, setStatutoryCode, CURRENT_PERIOD,
} from '~/data/assetStore'
import { chargeAt, bookValueAt } from '~/data/assetEngine'
import {
  leases, findLease, createLease, leaseSchedule, previewModification, modifyLease, blankModification, liabilityAt,
  presentValue, combinedSchedule,
} from '~/data/assetLeases'
import { journalDatePolicy, journalPolicyDay, autoPostRuns } from '~/data/assetPolicy'
import { previewNewAsset, projection, lifeSchedule } from '~/data/assetPreview'
import { annualObligations, annualDone, annualOutstanding, INTANGIBLE_CODES } from '~/data/assetIntangibles'
import { recordImpairmentTest } from '~/data/assetStore'

beforeEach(() => resetAssetStore())

const lease = (over: Partial<Parameters<typeof createLease>[0]> = {}) => createLease({
  name: 'Test forklift lease', underlying: 'Forklift', branch: 'Surabaya', startDate: '01/09/2026',
  termMonths: 36, monthlyPayment: 10_000_000, annualRatePct: 12, options: '', exemption: null, ...over,
})

describe('lease liability schedule (OD-37)', () => {
  it('opens at the present value and closes at exactly zero', () => {
    const s = leaseSchedule(findLease('LS-004')!)
    expect(s.initialLiability).toBe(presentValue(38_500_000, 60, 0.09))
    expect(s.rows).toHaveLength(60)
    expect(s.rows.at(-1)!.closing).toBe(0)
    for (const r of s.rows) expect(r.closing).toBe(r.opening + r.interest - r.payment)
    // Interest unwinds: it falls every month.
    expect(s.rows[1]!.interest).toBeLessThan(s.rows[0]!.interest)
  })
})

describe('recording a lease (FG8-AC1, FG8-AC2)', () => {
  it('puts a right-of-use asset in the register that depreciates through the engine and reaches the run', () => {
    const n = fixedAssets.value.length
    const r = lease()
    expect(r.ok).toBe(true)
    const l = (r as { ok: true; lease: { rouAssetId: string | null; id: string } }).lease
    expect(fixedAssets.value).toHaveLength(n + 1)
    const a = findAsset(l.rouAssetId!)!
    expect(a.leaseId).toBe(l.id)
    expect(a.cost).toBe(presentValue(10_000_000, 36, 0.12))
    const c = chargeAt(ledgerOf(a.id)!, 'accounting', CURRENT_PERIOD).charge!
    expect(c).toBe(Math.round(a.cost / 36))
    const g = generateRun(CURRENT_PERIOD)
    expect(g.ok && g.run.lines.some((x) => x.assetId === a.id && x.charge === c)).toBe(true)
    postPeriod(CURRENT_PERIOD)
    expect(computeSelfCheck().tie.every((t) => t.difference === 0)).toBe(true)
  })

  it('creates nothing in the register for a short-term lease and expenses the payments', () => {
    const n = fixedAssets.value.length
    const r = lease({ termMonths: 6, exemption: 'short-term' })
    expect(r.ok).toBe(true)
    expect(fixedAssets.value).toHaveLength(n)
    expect((r as { ok: true; lease: { rouAssetId: string | null } }).lease.rouAssetId).toBeNull()
    const l = leases.value.at(-1)!
    expect(liabilityAt(l)).toBe(0)
    expect(combinedSchedule(l).every((x) => x.rouCharge === null && x.payment === 10_000_000)).toBe(true)
  })

  it('refuses a short-term flag on a lease longer than twelve months', () => {
    const r = lease({ exemption: 'short-term' })
    expect(r.ok).toBe(false)
  })

  it('keeps the design figures: leases are reported apart from the tangible statement', () => {
    expect(fyFigures().netTemporaryDifference).toBe(-242_578_119)
    expect(fyFigures().deferredTax).toBe(-53_367_186)
    expect(computeSelfCheck().checks.every((c) => c.id === 'C3' || c.id === 'C4' || c.state === 'passed')).toBe(true)
  })
})

describe('modifying a lease (FG8-AC3)', () => {
  it('remeasures the liability and the asset by the same amount, prospectively', () => {
    const l = findLease('LS-004')!
    const id = l.rouAssetId!
    const before = ledgerOf(id)!
    const aug = bookValueAt(before, 'accounting', '2026-08')
    const f = { ...blankModification(l), reason: 'Twelve-month extension signed' }
    const pv = previewModification('LS-004', f)
    expect(pv.ok).toBe(true)
    expect(pv.adjustment).toBeGreaterThan(0)
    expect(pv.liabilityAfter - pv.liabilityBefore).toBe(pv.adjustment)
    expect(modifyLease('LS-004', f).ok).toBe(true)
    const after = ledgerOf(id)!
    // Nothing before the effective period moves.
    expect(bookValueAt(after, 'accounting', '2026-08')).toBe(aug)
    expect(chargeAt(after, 'accounting', '2026-08').charge).toBe(chargeAt(before, 'accounting', '2026-08').charge)
    // The asset rose by the liability adjustment and re-spreads over the new term.
    expect(after.cost - before.cost).toBe(pv.adjustment)
    expect(after.books.accounting.versions.length).toBe(2)
    expect(chargeAt(after, 'accounting', '2026-09').charge).toBe(pv.rou!.chargeAfter)
    expect(liabilityAt(findLease('LS-004')!, '2026-08')).toBe(pv.liabilityBefore)
    expect(leaseSchedule(findLease('LS-004')!).rows).toHaveLength(72)
    expect(leaseSchedule(findLease('LS-004')!).rows.at(-1)!.closing).toBe(0)
    expect(journals.value.at(-1)!.source).toBe('lease-remeasurement')
    postPeriod(CURRENT_PERIOD)
    expect(computeSelfCheck().tie.every((t) => t.difference === 0)).toBe(true)
  })
})

describe('journal date policy and automatic posting (OD-09, OD-10)', () => {
  it('dates the journal at period end by default, and by policy once changed', () => {
    postPeriod(CURRENT_PERIOD)
    expect(journals.value.at(-1)!.date).toBe('30/09/2026')
    reversePeriod(CURRENT_PERIOD)
    journalDatePolicy.value = 'policy-day'
    journalPolicyDay.value = 5
    postPeriod(CURRENT_PERIOD)
    expect(journals.value.filter((j) => j.source === 'depreciation').at(-1)!.date).toBe('05/10/2026')
  })

  it('refuses a closed period and names the next open one (FG2-AC4)', () => {
    const r = generateRun('2026-03')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toContain('September 2026')
    expect(runs.value.filter((x) => x.period === '2026-03' && x.state === 'draft')).toHaveLength(0)
  })

  it('resets the settings with the store', () => {
    autoPostRuns.value = true
    resetAssetStore()
    expect(autoPostRuns.value).toBe(false)
  })
})

describe('intangibles (FG-9)', () => {
  it('creates an indefinite-life intangible with no accounting schedule and a normal tax one (FG9-AC2)', () => {
    const r = createAsset({ name: 'Brand test', class: 'Intangible assets', branch: 'Medan', cost: 240_000_000, inServiceDate: '01/09/2026', lifeMonths: null, residual: 0, method: 'straight-line', taxGroup: 'Tax group 2', statutoryCode: '0603 Brand or trademark' })
    expect(r.ok).toBe(true)
    const l = ledgerOf((r as { id: string }).id)!
    expect(l.books.accounting.live).toHaveLength(0)
    expect(chargeAt(l, 'accounting', CURRENT_PERIOD).absent).toBe('Not amortised')
    expect(chargeAt(l, 'tax', CURRENT_PERIOD).charge).toBe(2_500_000)
    expect(findAsset(l.id)!.indefiniteLife).toBe(true)
  })

  it('keeps goodwill at cost on close while its tax schedule advances (FG9-AC1)', () => {
    const tax = findAsset('FA-0091')!.bookValueFiscal!
    postPeriod(CURRENT_PERIOD)
    const a = findAsset('FA-0091')!
    expect(a.bookValueCommercial).toBe(2_400_000_000)
    expect(a.bookValueFiscal).toBe(tax - 10_000_000)
  })

  it('sets a statutory intangible code and refuses one on a tangible asset (OD-47)', () => {
    expect(setStatutoryCode('FA-0094', '0602 Copyright').ok).toBe(true)
    expect(findAsset('FA-0094')!.statutoryCode).toBe('0602 Copyright')
    expect(setStatutoryCode('FA-0031', '0601 Patent').ok).toBe(false)
    expect(setStatutoryCode('FA-0091', '0601 Patent').ok).toBe(false)
  })
})


describe('schedule preview and projection (TS-04, OD-45, OD-12)', () => {
  it('previews the whole life on both books before the asset exists, summing to the depreciable base', () => {
    const pv = previewNewAsset({ cost: 120_000_000, inServiceDate: '15/09/2026', lifeMonths: 48, residual: 0, method: 'straight-line', taxGroup: 'Tax group 2' })
    expect(pv.totals.accounting).toBe(120_000_000)
    expect(pv.totals.tax).toBe(120_000_000)
    expect(pv.monthly.accounting).toBe(2_500_000)
    expect(pv.years[0]!.year).toBe(2026)
    expect(pv.years[0]!.months).toBe(4)
  })

  it('shows goodwill with no accounting schedule and a full tax schedule', () => {
    const s = lifeSchedule(ledgerOf('FA-0091')!)
    expect(s.totals.accounting).toBeNull()
    expect(s.accountingAbsent).toBe('Not amortised')
    expect(s.totals.tax).toBe(2_400_000_000)
  })

  it('projects both books to the chosen horizon', () => {
    for (const n of [12, 24, 36]) {
      const p = projection(n)
      expect(p).toHaveLength(n)
      expect(p[0]!.period).toBe('2026-10')
      expect(p.every((m) => Number.isInteger(m.accounting) && Number.isInteger(m.tax))).toBe(true)
    }
    expect(projection(36)[35]!.period).toBe('2029-09')
  })
})

describe('annual test obligation (OD-52, FG3-AC6)', () => {
  it('lists goodwill and indefinite-life intangibles, names done and outstanding, and keeps the list when all are done', () => {
    const ids = annualObligations.value.map((o) => o.asset.id).sort()
    expect(ids).toEqual(['FA-0091', 'FA-0093'])
    const outstanding = annualOutstanding.value.map((o) => o.asset.id)
    expect(outstanding.length).toBeGreaterThan(0)
    for (const id of outstanding) {
      const r = recordImpairmentTest({ assetId: id, indicator: 'Annual test · indefinite life', recoverable: 9_000_000_000, basis: 'Value in use', source: 'Board-approved DCF' })
      expect(r.ok).toBe(true)
    }
    expect(annualOutstanding.value).toHaveLength(0)
    expect(annualDone.value.map((o) => o.asset.id).sort()).toEqual(['FA-0091', 'FA-0093'])
    expect(annualObligations.value).toHaveLength(2)
  })

  it('offers exactly the eleven intangible codes', () => {
    expect(INTANGIBLE_CODES).toHaveLength(11)
    expect(INTANGIBLE_CODES.map((c) => c.code)).toContain('0607')
  })
})
