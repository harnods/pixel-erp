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
 *  - FG-3: correction, revision, improvement, split, partial disposal,
 *    disposal, impairment and its capped reversal, on both books.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  buildAssetLedger, straightLineCharges, derive, chargeAt, bookValueAt, checkBookIntegrity,
  splitChildAcquisitions, bookOf, GOODWILL_REVERSAL_REFUSED,
  type AssetEvent, type AcquisitionEvent,
} from '~/data/assetEngine'
import {
  resetAssetStore, ledgerOf, findAsset, fixedAssets, assignTaxGroupTo, recordEvent,
  postPeriod, reversePeriod, generateRun, journals, runs, postedRunFor, computeSelfCheck,
  runSelfCheck, selfCheckFor, fyFigures, CURRENT_PERIOD,
  recordImpairmentTest, recordImpairmentReversal, nextChildIds, createAsset,
  setViewAs, canSeeFinancials, actingUser, VIEW_AS_ROLES,
} from '~/data/assetStore'
import { assetSeeds } from '~/data/fixedAssets'
import { monthlySchedule, assetHistory } from '~/data/fixedAssetDetail'
import { blankForm, previewValueChange } from '~/data/assetValueChange'
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
    // Depreciation +10.265.625, amortisation -147.749.994, impairment
    // +17.250.000, disposal -122.343.750: accounting less tax, summed.
    // (Was 94.828.125 / 20.862.188 before amortisation was counted and the
    // depreciation sign was made consistent.)
    expect(f.netTemporaryDifference).toBe(-242_578_119)
    expect(f.deferredTax).toBe(-53_367_186)
  })
})


// ── Phase 1b: correction and value change (FG-3) ────────────────────────────

describe('value change on the pure engine (FG-3)', () => {
  // The FG3-AC7 worked example: 120.000.000, no residual, 10 years straight
  // line, in service September 2024, so 24 months applied by September 2026.
  const base = (over: Partial<AcquisitionEvent> = {}) => acquisition({
    period: '2024-09', date: '01/09/2024', inServiceDate: '01/09/2024', cost: 120_000_000,
    accounting: { method: 'straight-line', lifeMonths: 120, residual: 0 },
    tax: { method: 'straight-line', lifeMonths: 96, residual: 0 }, taxGroup: 'Tax group 2',
    ...over,
  })
  const ev = (e: Record<string, unknown>, n: number) =>
    ({ id: `X-E${n}`, date: '01/09/2026', recordedBy: 'test', ...e }) as AssetEvent

  it('FG3-AC7: a life revised to 6 years spreads 96.000.000 over 48 months at 2.000.000', () => {
    const l = buildAssetLedger('X', [base(), ev({ kind: 'estimate-revision', book: 'accounting', period: '2026-09', lifeMonths: 72 }, 2)])
    expect(chargeAt(l, 'accounting', '2026-08').charge).toBe(1_000_000)
    expect(bookValueAt(l, 'accounting', '2026-08')).toBe(96_000_000)
    expect(l.books.accounting.bases[1]!.remainingMonths).toBe(48)
    expect(chargeAt(l, 'accounting', '2026-09').charge).toBe(2_000_000)
    // The prior schedule stays readable as a superseded version.
    expect(l.books.accounting.versions[0]!.supersededFrom).toBe('2026-09')
    expect(l.books.accounting.versions[0]!.rows.find((r) => r.period === '2026-09')!.charge).toBe(1_000_000)
    expect(checkBookIntegrity(l, l.books.accounting).ok).toBe(true)
  })

  it('FG3-AC8: the tax schedule is unchanged by a commercial revision', () => {
    const before = buildAssetLedger('X', [base()])
    const after = buildAssetLedger('X', [base(), ev({ kind: 'estimate-revision', book: 'accounting', period: '2026-09', lifeMonths: 72, method: 'reducing-balance' }, 2)])
    expect(after.books.tax!.live).toEqual(before.books.tax!.live)
    expect(after.books.tax!.versions).toHaveLength(1)
  })

  it('charges the whole remainder in the effective period when the revised life has already ended', () => {
    const l = buildAssetLedger('X', [base(), ev({ kind: 'estimate-revision', book: 'accounting', period: '2026-09', lifeMonths: 12 }, 2)])
    const b = l.books.accounting.bases[1]!
    expect(b.lifeEndedAtRevision).toBe(true)
    expect(chargeAt(l, 'accounting', '2026-09').charge).toBe(96_000_000)
    expect(chargeAt(l, 'accounting', '2026-10').absent).toBe('Life ended')
  })

  it('FG3-AC9: an improvement adds to the same asset from its period, both books, dated', () => {
    const l = buildAssetLedger('X', [base(), ev({ kind: 'improvement', period: '2026-09', amount: 24_000_000 }, 2)])
    expect(l.cost).toBe(144_000_000)
    expect(bookValueAt(l, 'accounting', '2026-08')).toBe(96_000_000)
    // (96.000.000 + 24.000.000) over the 96 months left.
    expect(chargeAt(l, 'accounting', '2026-09').charge).toBe(1_250_000)
    // Tax: (120.000.000 - 30.000.000 + 24.000.000) over the 72 months left.
    expect(chargeAt(l, 'tax', '2026-09').charge).toBe(1_583_333)
    const d = derive(l, 'accounting', '2026-09')
    expect(d.adjustments.map((x) => x.kind)).toContain('improvement')
    expect(derive(l, 'accounting', '2026-08').adjustments.map((x) => x.kind)).not.toContain('improvement')
    expect(checkBookIntegrity(l, l.books.accounting).ok).toBe(true)
    expect(checkBookIntegrity(l, l.books.tax!).ok).toBe(true)
  })

  it('FG3-AC10: an improvement that extends the life changes both in one event', () => {
    const l = buildAssetLedger('X', [base(), ev({ kind: 'improvement', period: '2026-09', amount: 24_000_000, lifeMonths: { accounting: 144 } }, 2)])
    expect(l.events).toHaveLength(2)
    // (96.000.000 + 24.000.000 - 0) over 144 - 24 = 120 months.
    expect(chargeAt(l, 'accounting', '2026-09').charge).toBe(1_000_000)
    expect(l.books.accounting.bases[1]!.remainingMonths).toBe(120)
  })

  it('FG3-AC5 and AC11: a 25% partial disposal keeps 75% of the charge and states gain or loss per book', () => {
    const l = buildAssetLedger('X', [base(), ev({ kind: 'partial-disposal', period: '2026-09', date: '30/09/2026', proportion: 0.25, proceeds: 20_000_000 }, 2)])
    expect(chargeAt(l, 'accounting', '2026-10').charge).toBe(1_000_000 * 0.75)
    expect(chargeAt(l, 'tax', '2026-10').charge).toBe(1_250_000 * 0.75)
    const a = l.books.accounting.partialDisposals[0]!
    const t = l.books.tax!.partialDisposals[0]!
    // Accounting carrying of the disposed quarter: (120.000.000 - 25.000.000) / 4.
    expect(a.carrying).toBe(23_750_000)
    expect(a.gainLoss).toBe(-3_750_000)
    // Tax carrying of the quarter: (120.000.000 - 31.250.000) / 4.
    expect(t.carrying).toBe(22_187_500)
    expect(t.gainLoss).toBe(-2_187_500)
    expect(l.cost).toBe(90_000_000)
    expect(checkBookIntegrity(l, l.books.accounting).ok).toBe(true)
    expect(checkBookIntegrity(l, l.books.tax!).ok).toBe(true)
  })

  it('FG3-AC4: children of a split carry the parent\'s book value to the rupiah on both books', () => {
    const l = buildAssetLedger('X', [base({ cost: 100_000_001 }), ev({ kind: 'split', period: '2026-09', parts: [{ childId: 'A', proportion: 1 / 3 }, { childId: 'B', proportion: 2 / 3 }] }, 2)])
    const kids = splitChildAcquisitions(l).map((acq) => buildAssetLedger(acq.id.replace(/-E1$/, ''), [acq]))
    for (const book of ['accounting', 'tax'] as const) {
      const parent = bookValueAt(l, book, '2026-08')!
      const kidsOpening = kids.reduce((s, k) => s + k.cost - bookOf(k, book)!.bases[0]!.openingAccumulated, 0)
      expect(kidsOpening).toBe(parent)
      // And from there each child depreciates over the parent's remaining life.
      expect(kids.reduce((s, k) => s + chargeAt(k, book, '2026-09').charge!, 0)).toBeCloseTo(chargeAt(buildAssetLedger('X', [base({ cost: 100_000_001 })]), book, '2026-09').charge!, -1)
    }
    expect(kids.reduce((s, k) => s + k.cost, 0)).toBe(100_000_001)
    expect(chargeAt(l, 'accounting', '2026-09').absent).toBe('Split')
    for (const k of kids) expect(checkBookIntegrity(k, k.books.accounting).ok).toBe(true)
  })

  it('OD-51: a reversal is capped at the unimpaired carrying amount, and says which applied', () => {
    const l = buildAssetLedger('X', [
      base(),
      ev({ kind: 'impairment', period: '2026-06', date: '30/06/2026', recoverable: 60_000_000 }, 2),
      ev({ kind: 'impairment-reversal', period: '2026-09', date: '30/09/2026', recoverable: 200_000_000 }, 3),
    ])
    const r = l.books.accounting.reversals[0]!
    // Unimpaired at the end of September: 120.000.000 less 25 months at 1.000.000.
    expect(r.unimpaired).toBe(95_000_000)
    expect(r.capApplied).toBe(true)
    expect(r.applied).toBe(r.cap)
    expect(bookValueAt(l, 'accounting', '2026-09')).toBe(95_000_000)
    // From October it depreciates as though never impaired.
    expect(chargeAt(l, 'accounting', '2026-10').charge).toBe(1_000_000)
    expect(l.books.tax!.reversals).toHaveLength(0)
    expect(checkBookIntegrity(l, l.books.accounting).ok).toBe(true)
  })

  it('applies an uncapped reversal in full when the recovery is below the cap', () => {
    const l = buildAssetLedger('X', [
      base(),
      ev({ kind: 'impairment', period: '2026-06', date: '30/06/2026', recoverable: 60_000_000 }, 2),
      ev({ kind: 'impairment-reversal', period: '2026-09', date: '30/09/2026', recoverable: 70_000_000 }, 3),
    ])
    const r = l.books.accounting.reversals[0]!
    expect(r.capApplied).toBe(false)
    expect(bookValueAt(l, 'accounting', '2026-09')).toBe(70_000_000)
  })

  it('FG3-AC3: refuses to reverse a goodwill impairment and names the prohibition', () => {
    expect(() => buildAssetLedger('X', [
      base({ isGoodwill: true, accounting: { method: 'straight-line', lifeMonths: null, residual: 0 } }),
      ev({ kind: 'impairment', period: '2026-06', date: '30/06/2026', recoverable: 60_000_000 }, 2),
      ev({ kind: 'impairment-reversal', period: '2026-09', date: '30/09/2026', recoverable: 120_000_000 }, 3),
    ])).toThrow(GOODWILL_REVERSAL_REFUSED)
  })

  it('OD-13 / OD-14: a cost correction catches posted periods up in the effective period', () => {
    const l = buildAssetLedger('X', [base(), ev({ kind: 'cost-correction', period: '2026-09', correctedCost: 132_000_000, reason: 'Invoice misread' }, 2)])
    const c = l.books.accounting.corrections[0]!
    // 24 months charged at 1.000.000 should have been at 1.100.000.
    expect(c.catchUp).toBe(2_400_000)
    const row = l.books.accounting.live.find((r) => r.period === '2026-09')!
    expect(row.charge).toBe(1_100_000)
    expect(row.adjustment).toBe(2_400_000)
    expect(chargeAt(l, 'accounting', '2026-09').charge).toBe(3_500_000)
    // Posted periods keep what they charged.
    expect(chargeAt(l, 'accounting', '2026-08').charge).toBe(1_000_000)
    // The prior version is retained on the original basis.
    expect(l.books.accounting.versions[0]!.rows[0]!.cost).toBe(120_000_000)
    expect(l.books.accounting.live.at(-1)!.netBookValue).toBe(0)
    expect(checkBookIntegrity(l, l.books.accounting).ok).toBe(true)
  })
})

/** Checks 1 and 2: the ledger ties and every schedule ties. (3 and 4 fail on FA-0077 by design.) */
const ledgerAgrees = () => computeSelfCheck().checks.filter((c) => c.id === 'C1' || c.id === 'C2').every((c) => c.state === 'passed')

describe('value change through the store (FG-3, LR-4, LR-8)', () => {
  it('refuses an effective period inside a posted one and names the earliest permitted', () => {
    const r = recordEvent('FA-0047', { kind: 'improvement', period: '2026-05', date: '01/05/2026', recordedBy: 't', amount: 10_000_000 } as Omit<AssetEvent, 'id'>)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toContain('The earliest period this can take effect is September 2026')
  })

  it('OD-50: an impaired test posts the write-down, sets Impaired and moves the schedule', () => {
    const before = findAsset('FA-0031')!.bookValueCommercial!
    const r = recordImpairmentTest({ assetId: 'FA-0031', indicator: 'Physical damage', recoverable: 700_000_000, basis: 'Value in use', source: 'Projection' })
    expect(r.ok).toBe(true)
    const a = findAsset('FA-0031')!
    expect(a.status).toBe('Impaired')
    // The write-down is at the end of September, after its charge. Until
    // September posts, the register carries the charges through August.
    expect(a.bookValueCommercial).toBe(700_000_000 + 10_416_667)
    expect(before).toBeGreaterThan(a.bookValueCommercial!)
    postPeriod('2026-09')
    expect(findAsset('FA-0031')!.bookValueCommercial).toBe(700_000_000)
    expect(chargeAt(ledgerOf('FA-0031')!, 'accounting', '2026-10').charge).toBeLessThan(chargeAt(ledgerOf('FA-0031')!, 'accounting', '2026-09').charge!)
    expect(journals.value.some((j) => j.source === 'impairment' && j.memo.includes('FA-0031'))).toBe(true)
    expect(assetHistory(a).some((h) => h.what.includes('Impairment test'))).toBe(true)
    expect(ledgerAgrees()).toBe(true)
  })

  it('FG3-AC1: a test that finds nothing is kept and appears in the asset history', () => {
    recordImpairmentTest({ assetId: 'FA-0047', indicator: 'Market value has fallen', recoverable: 900_000_000, basis: 'Fair value less costs of disposal', source: 'Dealer quote' })
    const h = assetHistory(findAsset('FA-0047')!)
    expect(h.some((x) => x.what.includes('no impairment') && x.note?.includes('Dealer quote'))).toBe(true)
    expect(findAsset('FA-0047')!.status).toBe('Active')
  })

  it('FG3-AC2: a reversal on FA-0068 rises no higher than the unimpaired schedule', () => {
    const r = recordImpairmentReversal({ assetId: 'FA-0068', recoverable: 400_000_000, basis: 'Fair value less costs of disposal', source: 'Appraisal' })
    expect(r.ok).toBe(true)
    const l = ledgerOf('FA-0068')!
    const rv = l.books.accounting.reversals[0]!
    expect(rv.capApplied).toBe(true)
    // Unimpaired: 420.000.000 over 96 months from May 2022, 53 months to September 2026.
    expect(rv.unimpaired).toBe(420_000_000 - 53 * 4_375_000)
    expect(bookValueAt(l, 'accounting', '2026-09')).toBe(rv.unimpaired)
    expect(findAsset('FA-0068')!.status).toBe('Active')
    expect(ledgerAgrees()).toBe(true)
  })

  it('FG3-AC3: refuses a goodwill reversal in the store as well', () => {
    recordImpairmentTest({ assetId: 'FA-0091', indicator: 'Annual test · indefinite life', recoverable: 2_000_000_000, basis: 'Value in use', source: 'Projection' })
    expect(findAsset('FA-0091')!.bookValueCommercial).toBe(2_000_000_000)
    const r = recordImpairmentReversal({ assetId: 'FA-0091', recoverable: 2_400_000_000, basis: 'Value in use', source: 'Projection' })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toBe(GOODWILL_REVERSAL_REFUSED)
  })

  it('FG3-AC4: a split replaces the parent with children on the register, to the rupiah', () => {
    const parent = findAsset('FA-0047')!
    const ids = nextChildIds(2)
    const r = recordEvent('FA-0047', { kind: 'split', period: '2026-09', date: '01/09/2026', recordedBy: 't', parts: [{ childId: ids[0]!, proportion: 0.4 }, { childId: ids[1]!, proportion: 0.6 }] } as Omit<AssetEvent, 'id'>)
    expect(r.ok).toBe(true)
    const kids = ids.map((id) => findAsset(id)!)
    expect(findAsset('FA-0047')!.status).toBe('Split')
    expect(kids.reduce((s, k) => s + k.bookValueCommercial!, 0)).toBe(parent.bookValueCommercial)
    expect(kids.reduce((s, k) => s + k.bookValueFiscal!, 0)).toBe(parent.bookValueFiscal)
    expect(kids.every((k) => k.splitFrom === 'FA-0047')).toBe(true)
    expect(ledgerAgrees()).toBe(true)
    postPeriod('2026-09')
    expect(ledgerAgrees()).toBe(true)
  })

  it('keeps the ledger agreeing with the register after every kind of change, through posting', () => {
    expect(recordEvent('FA-0029', { kind: 'improvement', period: '2026-09', date: '01/09/2026', recordedBy: 't', amount: 30_000_000, lifeMonths: { accounting: 120 } } as Omit<AssetEvent, 'id'>).ok).toBe(true)
    expect(recordEvent('FA-0042', { kind: 'cost-correction', period: '2026-09', date: '01/09/2026', recordedBy: 't', correctedCost: 580_000_000, reason: 'Freight left out' } as Omit<AssetEvent, 'id'>).ok).toBe(true)
    expect(recordEvent('FA-0023', { kind: 'partial-disposal', period: '2026-09', date: '30/09/2026', recordedBy: 't', proportion: 0.5, proceeds: 30_000_000 } as Omit<AssetEvent, 'id'>).ok).toBe(true)
    expect(recordEvent('FA-0036', { kind: 'disposal', period: '2026-09', date: '30/09/2026', recordedBy: 't', proceeds: 10_000_000 } as Omit<AssetEvent, 'id'>).ok).toBe(true)
    expect(ledgerAgrees()).toBe(true)
    postPeriod('2026-09')
    expect(computeSelfCheck().tie.every((t) => t.difference === 0)).toBe(true)
    expect(ledgerAgrees()).toBe(true)
    // The catch-up reached the September journal with the charge.
    expect(runs.value.find((r) => r.period === '2026-09' && r.state === 'posted')!.lines.find((x) => x.assetId === 'FA-0042')!.charge).toBeGreaterThan(chargeAt(ledgerOf('FA-0042')!, 'accounting', '2026-10').charge!)
  })

  it('creates a new asset that appears in the register and the schedule at once', () => {
    const n = fixedAssets.value.length
    const r = createAsset({ name: 'Test compressor', class: 'Equipment', branch: 'Surabaya', cost: 96_000_000, inServiceDate: '01/03/2026', lifeMonths: 96, residual: 0, method: 'straight-line', taxGroup: 'Tax group 2' })
    expect(r.ok).toBe(true)
    const id = (r as { id: string }).id
    expect(fixedAssets.value).toHaveLength(n + 1)
    const a = findAsset(id)!
    // Six months, March to August, brought up to the last posted period.
    expect(a.bookValueCommercial).toBe(96_000_000 - 6 * 1_000_000)
    expect(fy2026Schedule()[8]!.rows.some((x) => x.asset.id === id)).toBe(true)
    expect(ledgerAgrees()).toBe(true)
    postPeriod('2026-09')
    expect(computeSelfCheck().tie.every((t) => t.difference === 0)).toBe(true)
  })

  it('previews both books before and after without recording anything', () => {
    const f = { ...blankForm('FA-0031', 'revise'), lifeYears: '8' }
    const pv = previewValueChange('FA-0031', f)
    expect(pv.books.map((b) => b.book)).toEqual(['accounting', 'tax'])
    expect(pv.books[0]!.chargeAfter).not.toBe(pv.books[0]!.chargeBefore)
    expect(pv.books[1]!.unchanged).toBe(true)
    expect(ledgerOf('FA-0031')!.events).toHaveLength(1)
  })

  it('refuses an improvement that fails the capitalisation test and directs it to expense', () => {
    const f = { ...blankForm('FA-0031', 'improve'), amount: '5000000', passesCapitalisationTest: false }
    const pv = previewValueChange('FA-0031', f)
    expect(pv.error?.field).toBe('passesCapitalisationTest')
    expect(pv.error?.error).toContain('expense')
  })

  it('hides cost from General Affairs (LR-6)', () => {
    setViewAs('General Affairs')
    expect(canSeeFinancials.value).toBe(false)
    setViewAs('Accounting')
    expect(canSeeFinancials.value).toBe(true)
    expect(actingUser.value).not.toBe(VIEW_AS_ROLES.find((x) => x.role === 'Approver')!.person)
  })

  it('previews a split with the parent carrying the periods before it, and the parts after', () => {
    const f = { ...blankForm('FA-0047', 'split'), parts: [{ percent: '40', name: 'Body' }, { percent: '60', name: 'Engine' }] }
    const pv = previewValueChange('FA-0047', f)
    const acc = pv.books.find((b) => b.book === 'accounting')!
    const before = acc.rows.find((r) => r.period < f.period)!
    expect(before.after).toBe(before.before)
    expect(pv.childTotals!.accounting).toBe(pv.childTotals!.parentAccounting)
    expect(pv.childTotals!.tax).toBe(pv.childTotals!.parentTax)
  })

  it('OD-42: the basis marker names every change that started a basis in one period', () => {
    const r = createAsset({
      name: 'Press brake', class: 'Equipment', branch: 'Surabaya', cost: 120_000_000, inServiceDate: '01/09/2024',
      lifeMonths: 120, residual: 0, method: 'straight-line', taxGroup: 'Tax group 2', location: '', custodian: '',
    })
    expect(r.ok).toBe(true)
    const id = (r as { id: string }).id
    const at = { period: CURRENT_PERIOD, date: '30/09/2026', recordedBy: 'Test' }
    expect(recordEvent(id, { ...at, kind: 'estimate-revision', book: 'accounting', lifeMonths: 72 } as never).ok).toBe(true)
    expect(chargeAt(ledgerOf(id)!, 'accounting', CURRENT_PERIOD).charge).toBe(2_000_000)
    expect(recordEvent(id, { ...at, kind: 'improvement', amount: 24_000_000, lifeMonths: { accounting: 96 } } as never).ok).toBe(true)
    const row = monthlySchedule(findAsset(id)!, 12).find((x) => x.period === 'September 2026')!
    expect(row.basisMarker).toContain('estimate revised, then improvement added')
  })
})
