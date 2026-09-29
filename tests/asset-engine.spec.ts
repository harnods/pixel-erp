/**
 * The asset computation engine and the session store built on it.
 *
 * These assert the locked rules, not markup:
 *  - LR-7 / FG2-AC2: whole rupiah, and every schedule sums exactly to cost
 *    less residual, the residue in the final period, on both books.
 *  - An indefinite life has no accounting schedule at all.
 *  - OD-41: the derivation for a period shows only what was in force then.
 *  - LR-3 / OD-42: regeneration keeps prior periods and the superseded version.
 *  - OD-02: setting a statutory group produces a tax schedule.
 *  - FG-3.5: an impairment does not touch the tax book.
 *  - LR-2: a posted journal carries the accounting charge only.
 *  - LR-4: a reversal is a second journal, not a deletion.
 *  - LR-9 / OD-43: the self-check can fail, and says so.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  buildAssetLedger, straightLineCharges, derive, chargeAt, bookValueAt, checkBookIntegrity,
  type AssetEvent, type AcquisitionEvent,
} from '~/data/assetEngine'
import {
  resetAssetStore, ledgerOf, findAsset, fixedAssets, assignTaxGroupTo, recordEvent,
  postPeriod, reversePeriod, generateRun, journals, runs, postedRunFor, computeSelfCheck,
  runSelfCheck, selfCheckFor, fyFigures, CURRENT_PERIOD,
} from '~/data/assetStore'
import { assetSeeds } from '~/data/fixedAssets'
import { monthlySchedule } from '~/data/fixedAssetDetail'
import { fy2026Schedule } from '~/data/depreciationSchedule'

beforeEach(() => resetAssetStore())

function acquisition(over: Partial<AcquisitionEvent> = {}): AcquisitionEvent {
  return {
    id: 'X-E1', kind: 'acquisition', period: '2026-01', date: '10/01/2026', recordedBy: 'test',
    cost: 100_000_000, inServiceDate: '10/01/2026',
    accounting: { method: 'straight-line', lifeMonths: 36, residual: 0 },
    tax: { method: 'straight-line', lifeMonths: 48, residual: 0 },
    taxGroup: 'Tax group 1',
    ...over,
  }
}

describe('whole rupiah, residue in the final period (LR-7, FG2-AC2)', () => {
  it('puts the rounding residue in the final month, not spread', () => {
    const c = straightLineCharges(100_000_000, 36)
    expect(c.slice(0, 35).every((x) => x === 2_777_778)).toBe(true)
    expect(c[35]).toBe(100_000_000 - 2_777_778 * 35)
    expect(c.reduce((s, x) => s + x, 0)).toBe(100_000_000)
  })

  it('sums every seeded schedule to cost less residual on both books', () => {
    for (const s of assetSeeds) {
      const l = ledgerOf(s.id)!
      for (const b of [l.books.accounting, l.books.tax]) {
        if (!b) continue
        const first = b.versions[0]!
        const total = first.rows.reduce((sum, r) => sum + r.charge, 0)
        expect(total, `${s.id} ${b.book}`).toBe(b.bases[0]!.depreciable)
        for (const r of first.rows) expect(Number.isInteger(r.charge)).toBe(true)
        expect(checkBookIntegrity(l, b).issues, `${s.id} ${b.book}`).toEqual([])
      }
    }
  })

  it('stops at the residual value, which the tax book never carries', () => {
    const l = buildAssetLedger('X', [acquisition({ accounting: { method: 'straight-line', lifeMonths: 36, residual: 10_000_000 } })])
    const acc = l.books.accounting.live
    expect(acc.reduce((s, r) => s + r.charge, 0)).toBe(90_000_000)
    expect(acc.at(-1)!.netBookValue).toBe(10_000_000)
    expect(l.books.tax!.live.reduce((s, r) => s + r.charge, 0)).toBe(100_000_000)
    expect(l.books.tax!.live.at(-1)!.netBookValue).toBe(0)
  })

  it('ties a reducing-balance schedule to its base as well', () => {
    const l = buildAssetLedger('X', [acquisition({ accounting: { method: 'reducing-balance', lifeMonths: 48, residual: 5_000_000 } })])
    const rows = l.books.accounting.live
    expect(rows.reduce((s, r) => s + r.charge, 0)).toBe(95_000_000)
    expect(rows[0]!.charge).toBeGreaterThan(rows[rows.length - 2]!.charge)
    expect(checkBookIntegrity(l, l.books.accounting).ok).toBe(true)
  })
})

describe('an indefinite life', () => {
  it('has no accounting schedule at all, and still amortises for tax', () => {
    const l = ledgerOf('FA-0091')!
    expect(l.books.accounting.live).toHaveLength(0)
    expect(chargeAt(l, 'accounting', '2026-09')).toMatchObject({ charge: null, absent: 'Not amortised' })
    expect(chargeAt(l, 'tax', '2026-09').charge).toBe(10_000_000)
    expect(bookValueAt(l, 'accounting', '2026-09')).toBe(2_400_000_000)
  })
})

describe('derivation (OD-41)', () => {
  it('does not show the June impairment in the January derivation of FA-0068', () => {
    const jan = derive(ledgerOf('FA-0068')!, 'accounting', '2026-01')
    expect(jan.adjustments.map((a) => a.kind)).not.toContain('impairment')
    expect(jan.basis!.cause.kind).toBe('acquisition')
    expect(jan.charge).toBe(4_375_000)
  })

  it('shows it from July on, with the reset basis and the 4.000.000 charge', () => {
    const jul = derive(ledgerOf('FA-0068')!, 'accounting', '2026-07')
    expect(jul.adjustments.map((a) => a.kind)).toContain('impairment')
    expect(jul.basis!.cause.kind).toBe('impairment')
    expect(jul.basis!.openingCarrying).toBe(184_000_000)
    expect(jul.basis!.remainingMonths).toBe(46)
    expect(jul.charge).toBe(4_000_000)
  })

  it('names the impairment as in the period for June itself', () => {
    const jun = derive(ledgerOf('FA-0068')!, 'accounting', '2026-06')
    expect(jun.adjustments.find((a) => a.kind === 'impairment')?.timing).toBe('in this period')
    expect(jun.charge).toBe(4_375_000)
  })
})

describe('non-destructive regeneration (LR-3, OD-42)', () => {
  it('keeps prior periods and retains the superseded version with its basis', () => {
    const before = ledgerOf('FA-0031')!.books.accounting
    const janToSep = before.live.filter((r) => r.period >= '2026-01' && r.period <= '2026-09')
    const r = recordEvent('FA-0031', {
      kind: 'estimate-revision', book: 'accounting', period: '2026-10', date: '01/10/2026',
      recordedBy: 'test', lifeMonths: 96,
    } as Omit<AssetEvent, 'id'>)
    expect(r.ok).toBe(true)
    const after = ledgerOf('FA-0031')!.books.accounting
    expect(after.versions).toHaveLength(2)
    const v1 = after.versions[0]!
    expect(v1.supersededFrom).toBe('2026-10')
    expect(v1.supersededBy).toBe(after.versions[1]!.id)
    // The superseded version still reads as it was, to the end of its life.
    expect(v1.rows.at(-1)!.netBookValue).toBe(0)
    expect(after.bases[0]!.lifeMonths).toBe(120)
    // Applied periods are untouched.
    for (const row of janToSep) expect(after.live.find((x) => x.period === row.period)).toEqual(row)
    // From October the new basis charges over the remaining 96 - 39 months.
    expect(after.bases[1]!.remainingMonths).toBe(57)
    expect(after.live.find((x) => x.period === '2026-10')!.basisId).toBe('B2')
    expect(checkBookIntegrity(ledgerOf('FA-0031')!, after).ok).toBe(true)
  })

  it('refuses a revision that would change a posted period (LR-4)', () => {
    const r = recordEvent('FA-0031', {
      kind: 'estimate-revision', book: 'accounting', period: '2026-05', date: '01/05/2026',
      recordedBy: 'test', lifeMonths: 96,
    } as Omit<AssetEvent, 'id'>)
    expect(r.ok).toBe(false)
    expect(ledgerOf('FA-0031')!.books.accounting.versions).toHaveLength(1)
  })

  it('keeps the pre-impairment version of FA-0068 readable', () => {
    const acc = ledgerOf('FA-0068')!.books.accounting
    expect(acc.versions).toHaveLength(2)
    expect(acc.versions[0]!.supersededFrom).toBe('2026-06')
    expect(acc.versions[0]!.rows.find((r) => r.period === '2026-09')!.charge).toBe(4_375_000)
    expect(acc.live.find((r) => r.period === '2026-09')!.charge).toBe(4_000_000)
  })
})

describe('tax group assignment (OD-02)', () => {
  it('produces a tax schedule for FA-0077 and removes Not computed everywhere', () => {
    expect(findAsset('FA-0077')!.bookValueFiscal).toBeNull()
    expect(monthlySchedule(findAsset('FA-0077')!).every((r) => r.taxAbsent === 'No statutory group')).toBe(true)

    expect(assignTaxGroupTo('FA-0077', 'Tax group 2').ok).toBe(true)

    const l = ledgerOf('FA-0077')!
    expect(l.books.tax).not.toBeNull()
    expect(l.books.tax!.bases[0]!.lifeMonths).toBe(96)
    // Computed from in-service, January, so the whole year reaches the return.
    expect(l.books.tax!.live[0]!.period).toBe('2026-01')
    expect(l.books.tax!.live.reduce((s, r) => s + r.charge, 0)).toBe(265_000_000)
    const a = findAsset('FA-0077')!
    // The register carries both books as booked: through August until
    // September posts.
    expect(a.bookValueFiscal).toBe(265_000_000 - 8 * 2_760_417)
    postPeriod('2026-09')
    expect(findAsset('FA-0077')!.bookValueFiscal).toBe(265_000_000 - 9 * 2_760_417)
    expect(a.status).toBe('Active')
    expect(monthlySchedule(a).every((r) => r.tax === 2_760_417)).toBe(true)
    expect(fixedAssets.value.filter((x) => x.bookValueFiscal === null && x.status !== 'Disposed')).toHaveLength(0)
    expect(fyFigures().unclassifiedAccounting).toBe(0)
    // No journal: the tax book never posts.
    expect(journals.value.filter((j) => j.memo.includes('FA-0077') && j.source !== 'acquisition')).toHaveLength(0)
  })
})

describe('impairment is accounting only (FG-3.5)', () => {
  it('leaves the tax schedule of FA-0068 exactly as it would be without it', () => {
    const withImp = ledgerOf('FA-0068')!
    const events = withImp.events.filter((e) => e.kind !== 'impairment')
    const without = buildAssetLedger('FA-0068', events)
    expect(withImp.books.tax!.live).toEqual(without.books.tax!.live)
    expect(withImp.books.tax!.versions).toHaveLength(1)
    expect(withImp.books.tax!.impairments).toHaveLength(0)
    expect(withImp.books.accounting.impairments[0]!.loss).toBe(17_250_000)
  })
})

describe('posting (LR-2, OD-08, LR-4)', () => {
  it('posts a journal equal to the accounting charge only', () => {
    const r = postPeriod('2026-09')
    expect(r.ok).toBe(true)
    const j = journals.value.find((x) => x.number === (r.ok ? r.run.journal : ''))!
    const debit = j.lines.reduce((s, l) => s + (l.debit ?? 0), 0)
    const credit = j.lines.reduce((s, l) => s + (l.credit ?? 0), 0)
    const accounting = fixedAssets.value.reduce((s, a) => s + (chargeAt(ledgerOf(a.id)!, 'accounting', '2026-09').charge ?? 0), 0)
    const tax = fixedAssets.value.reduce((s, a) => s + (chargeAt(ledgerOf(a.id)!, 'tax', '2026-09').charge ?? 0), 0)
    expect(debit).toBe(accounting)
    expect(credit).toBe(accounting)
    expect(debit).not.toBe(tax)
  })

  it('moves the register, the schedule and the asset record when September posts', () => {
    const bvBefore = findAsset('FA-0031')!.bookValueCommercial!
    expect(fy2026Schedule()[8]!.state).toBe('draft')
    postPeriod('2026-09')
    expect(findAsset('FA-0031')!.bookValueCommercial).toBe(bvBefore - 10_416_667)
    expect(fy2026Schedule()[8]!.state).toBe('posted')
  })

  it('refuses to generate for a closed period and names the next open one (FG2-AC4)', () => {
    const r = generateRun('2026-05')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.nextOpen).toBe('2026-09')
      expect(r.reason).toContain('September 2026')
    }
    expect(runs.value.filter((x) => x.period === '2026-05' && x.state === 'draft')).toHaveLength(0)
  })

  it('generates a draft for an open period without touching posted ones', () => {
    const posted = runs.value.filter((x) => x.state === 'posted').map((x) => JSON.stringify(x))
    const r = generateRun('2026-09')
    expect(r.ok).toBe(true)
    expect(runs.value.filter((x) => x.state === 'posted').map((x) => JSON.stringify(x))).toEqual(posted)
  })

  it('reverses with a second journal rather than deleting the first', () => {
    const r = postPeriod('2026-09')
    const number = r.ok ? r.run.journal : ''
    const count = journals.value.length
    expect(reversePeriod('2026-09').ok).toBe(true)
    expect(journals.value).toHaveLength(count + 1)
    expect(journals.value.find((j) => j.number === number)).toBeTruthy()
    expect(journals.value.at(-1)!.reverses).toBe(number)
    expect(postedRunFor('2026-09')).toBeNull()
    expect(runs.value.find((x) => x.journal === number)!.state).toBe('reversed')
  })
})

describe('period self-check (LR-9, OD-43)', () => {
  it('passes check 1 on the seeded ledger, with no seeded difference', () => {
    const r = computeSelfCheck(CURRENT_PERIOD)
    expect(r.checks.find((c) => c.id === 'C1')!.state).toBe('passed')
    expect(r.tie.every((t) => t.difference === 0)).toBe(true)
  })

  it('fails check 1 when a journal the register does not explain reaches the ledger', () => {
    journals.value = [...journals.value, {
      number: 'JV-TEST', date: '30/09/2026', period: '2026-09', source: 'depreciation', memo: 'Outside the module',
      lines: [
        { account: '6-5100', description: 'x', debit: 4_000_000, credit: null, control: '6-5100' },
        { account: '1-1700', description: 'x', debit: null, credit: 4_000_000, control: '1-1700' },
      ],
    }]
    const r = runSelfCheck(CURRENT_PERIOD)
    const c1 = r.checks.find((c) => c.id === 'C1')!
    expect(c1.state).toBe('failed')
    expect(c1.detail).toContain('6-5100')
    expect(r.tie.find((t) => t.account === '6-5100')!.difference).toBe(-4_000_000)
    expect(selfCheckFor(CURRENT_PERIOD)).toEqual(r)
  })

  it('actually sums schedules for check 2, and reports coverage for 3 and 4', () => {
    const r = computeSelfCheck(CURRENT_PERIOD)
    expect(r.checks.find((c) => c.id === 'C2')!.state).toBe('passed')
    expect(r.checks.find((c) => c.id === 'C3')!.state).toBe('failed')
    expect(r.checks.find((c) => c.id === 'C4')!.state).toBe('incomplete')
    assignTaxGroupTo('FA-0077', 'Tax group 2')
    const after = computeSelfCheck(CURRENT_PERIOD)
    expect(after.checks.map((c) => c.state)).toEqual(['passed', 'passed', 'passed', 'passed'])
  })
})

describe('the headline figures, computed', () => {
  it('reproduces the working-paper difference and deferred tax', () => {
    const f = fyFigures()
    expect(f.disposal.accounting).toBe(51_250_000)
    expect(f.disposal.tax).toBe(-71_093_750)
    expect(f.impairment).toBe(17_250_000)
    expect(f.netTemporaryDifference).toBe(94_828_125)
    expect(f.deferredTax).toBe(20_862_188)
  })
})
