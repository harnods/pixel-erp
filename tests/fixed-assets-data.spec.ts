/**
 * Fixed-asset register — the dataset must tie to the approved figures.
 *
 * These are not arbitrary assertions: each one is a figure the design states
 * must hold across every screen. If one fails, the register is showing a number
 * the rest of the module contradicts.
 */
import { describe, it, expect } from 'vitest'
import {
  fixedAssets,
  assetChargeYtd,
  assetChargeSeptember,
  septemberTotals,
  ASSET_HEADLINE_FIGURES as H,
  registerTotals,
  isUnclassified,
  fiscalAbsenceReason,
  type AssetCharge,
} from '~/data/fixedAssets'

describe('the register', () => {
  it('holds 24 assets, 20 tangible and 4 intangible', () => {
    expect(fixedAssets).toHaveLength(24)
    expect(fixedAssets.filter((a) => a.type === 'Tangible')).toHaveLength(20)
    expect(fixedAssets.filter((a) => a.type === 'Intangible')).toHaveLength(4)
  })

  it('gives every asset a unique id', () => {
    const ids = new Set(fixedAssets.map((a) => a.id))
    expect(ids.size).toBe(fixedAssets.length)
  })

  it('has exactly one unclassified asset, and it is FA-0077', () => {
    const open = fixedAssets.filter(isUnclassified)
    expect(open.map((a) => a.id)).toEqual(['FA-0077'])
  })
})

describe('FA-0077, the designed hole', () => {
  const a = fixedAssets.find((x) => x.id === 'FA-0077')!

  it('has no tax group and therefore no fiscal life', () => {
    expect(a.taxGroup).toBeNull()
    expect(a.fiscalLifeMonths).toBeNull()
  })

  it('has no fiscal book value — null, never 0', () => {
    expect(a.bookValueFiscal).toBeNull()
    expect(a.bookValueFiscal).not.toBe(0)
  })

  it('reads "Not computed" rather than showing a figure', () => {
    expect(fiscalAbsenceReason(a)).toBe('Not computed')
  })

  it('carries a commercial charge that matches the stated exclusion', () => {
    expect(assetChargeYtd['FA-0077'].commercial).toBe(H.unclassifiedCommercialYTD)
    expect(assetChargeYtd['FA-0077'].fiscal).toBeNull()
  })
})

describe('goodwill, FA-0091', () => {
  const g = fixedAssets.find((x) => x.id === 'FA-0091')!

  it('has an indefinite commercial life', () => {
    expect(g.indefiniteLife).toBe(true)
  })

  it('still carries a fiscal group, because fiscally it does amortise', () => {
    expect(g.taxGroup).not.toBeNull()
    expect(g.fiscalLifeMonths).not.toBeNull()
  })

  it('reads "Not amortised" on the commercial side', () => {
    expect(fiscalAbsenceReason(g)).toBe('Not amortised')
  })
})

describe('the headline figures', () => {
  it('ties commercial YTD depreciation across the classified assets', () => {
    // The headline total covers the 19 classified assets. FA-0077 is excluded
    // from BOTH books, not only the fiscal one: an asset that cannot be
    // depreciated on the tax basis is reported separately so the two totals
    // describe the same population and stay comparable.
    const total = Object.entries(assetChargeYtd)
      .filter(([id]) => id !== 'FA-0077')
      .reduce((s, [, c]) => s + c.commercial, 0)
    expect(total).toBe(H.depreciationCommercialYTD)
  })

  it('reports the unclassified asset separately rather than folding it in', () => {
    const all = Object.values(assetChargeYtd)
      .reduce((s, c: AssetCharge) => s + c.commercial, 0)
    expect(all).toBe(H.depreciationCommercialYTD + H.unclassifiedCommercialYTD)
  })

  it('ties fiscal YTD depreciation, which excludes the unclassified asset', () => {
    const total = Object.values(assetChargeYtd)
      .reduce((s, c) => s + (c.fiscal ?? 0), 0)
    expect(total).toBe(H.depreciationFiscalYTD)
  })

  it('shows the two books diverging by 10.265.625', () => {
    expect(H.depreciationCommercialYTD - H.depreciationFiscalYTD).toBe(10_265_625)
  })

  it('computes deferred tax at 22% of the net temporary difference', () => {
    const expected = Math.round(H.netTemporaryDifference * H.taxRate)
    expect(H.deferredTaxAt22pct).toBe(expected)
  })

  it('has one disposal producing a commercial gain and a fiscal loss', () => {
    expect(H.disposalCommercialGain).toBeGreaterThan(0)
    expect(H.disposalFiscalLoss).toBeLessThan(0)
  })

  it('recognises impairment commercially only', () => {
    expect(H.impairmentCommercialOnly).toBeLessThan(0)
  })
})

describe('September 2026', () => {
  it('ties the commercial total', () => {
    const total = Object.values(assetChargeSeptember)
      .reduce((s, c) => s + c.commercial, 0)
    expect(total).toBe(septemberTotals.commercial)
  })

  it('ties the fiscal total, excluding what cannot be computed', () => {
    const total = Object.values(assetChargeSeptember)
      .reduce((s, c) => s + (c.fiscal ?? 0), 0)
    expect(total).toBe(septemberTotals.fiscal)
  })
})

describe('register totals', () => {
  it('excludes disposed assets, because they are no longer held', () => {
    const all = registerTotals(fixedAssets)
    const disposed = fixedAssets.filter((a) => a.status === 'Disposed')
    expect(disposed.length).toBeGreaterThan(0)
    const held = fixedAssets.filter((a) => a.status !== 'Disposed')
    expect(all.cost).toBe(held.reduce((s, a) => s + a.cost, 0))
  })

  it('reports the unclassified count so the screen can say so', () => {
    expect(registerTotals(fixedAssets).unclassified).toBe(1)
  })
})

describe('no fiscal figure is ever a bare zero when it is absent', () => {
  it('uses null, not 0, wherever a fiscal value cannot exist', () => {
    for (const a of fixedAssets) {
      if (a.taxGroup === null) {
        expect(a.bookValueFiscal).toBeNull()
        expect(a.fiscalLifeMonths).toBeNull()
      }
    }
    for (const [id, c] of Object.entries(assetChargeYtd)) {
      const a = fixedAssets.find((x) => x.id === id)!
      if (a.taxGroup === null) expect(c.fiscal).toBeNull()
    }
  })
})
