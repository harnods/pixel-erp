/**
 * Fixed-asset register: the computed figures must tie to one another.
 *
 * The register no longer stores a figure. Book values and charges are
 * computed by the engine from the seed inputs, so these assert that every
 * total a screen shows is the sum of the per-asset figures behind it, and
 * that the absence rules hold (null, never 0).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerTotals,
  isUnclassified,
  fiscalAbsenceReason,
} from '~/data/fixedAssets'
import {
  fixedAssets as registerRef, chargeRange, fyFigures, resetAssetStore, ledgerOf, CURRENT_PERIOD,
} from '~/data/assetStore'
import { chargeAt } from '~/data/assetEngine'

let fixedAssets = registerRef.value
beforeEach(() => {
  resetAssetStore()
  fixedAssets = registerRef.value
})

interface AssetCharge { commercial: number; fiscal: number | null }
const charges = (from: string, to: string): Record<string, AssetCharge> => Object.fromEntries(
  registerRef.value
    .filter((a) => a.type === 'Tangible')
    .map((a) => [a.id, {
      commercial: chargeRange(a.id, 'accounting', from, to) ?? 0,
      fiscal: ledgerOf(a.id)!.books.tax ? chargeRange(a.id, 'tax', from, to) ?? 0 : null,
    }]),
)
const H = new Proxy({} as ReturnType<typeof fyFigures> & Record<string, number>, {
  get: (_t, k) => {
    const f = fyFigures()
    const map: Record<string, number> = {
      depreciationCommercialYTD: f.tangible.accounting,
      depreciationFiscalYTD: f.tangible.tax,
      unclassifiedCommercialYTD: f.unclassifiedAccounting,
      disposalCommercialGain: f.disposal.accounting,
      disposalFiscalLoss: f.disposal.tax,
      impairmentCommercialOnly: -f.impairment,
      netTemporaryDifference: f.netTemporaryDifference,
      deferredTaxAt22pct: f.deferredTax,
      taxRate: f.taxRate,
    }
    return map[k as string]
  },
})
const assetChargeYtd = new Proxy({} as Record<string, AssetCharge>, { get: (_t, k) => charges('2026-01', CURRENT_PERIOD)[k as string], ownKeys: () => Object.keys(charges('2026-01', CURRENT_PERIOD)), getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) })
const assetChargeSeptember = new Proxy({} as Record<string, AssetCharge>, { get: (_t, k) => charges(CURRENT_PERIOD, CURRENT_PERIOD)[k as string], ownKeys: () => Object.keys(charges(CURRENT_PERIOD, CURRENT_PERIOD)), getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) })
const septemberTotals = {
  get commercial() { return registerRef.value.filter((a) => a.type === 'Tangible').reduce((s, a) => s + (chargeAt(ledgerOf(a.id)!, 'accounting', CURRENT_PERIOD).charge ?? 0), 0) },
  get fiscal() { return registerRef.value.filter((a) => a.type === 'Tangible').reduce((s, a) => s + (chargeAt(ledgerOf(a.id)!, 'tax', CURRENT_PERIOD).charge ?? 0), 0) },
}

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

  it('ties the net temporary difference to the working papers', () => {
    expect(H.netTemporaryDifference).toBe(-242_578_119)
    expect(H.deferredTaxAt22pct).toBe(-53_367_186)
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
