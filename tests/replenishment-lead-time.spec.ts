/**
 * Lead-time derivation from PO → goods-receipt history (PRD US-001, D5 / D5a / D10).
 *
 * The rule that carries the most weight is AC-02: a direct purchase with no
 * upstream PO must be EXCLUDED, never counted as a 0-day lead time. Counting it
 * would drag every average toward zero, under-order every SKU that vendor
 * supplies, and cause exactly the stockouts this feature exists to prevent — so
 * it is asserted from several angles rather than once.
 */
import { describe, it, expect } from 'vitest'
import {
  deriveLeadTime, leadTimeSamplesFor, vendorDefaultLeadTime, computedLeadTimeCoverage,
  isEstimatedTier, leadTimeTierLabel, noPoReceiptCount,
} from '~/data/leadTimeHistory'
import { vendorItems } from '~/data/vendorItems'
import { getReplenishmentConfig, REPL_DEFAULTS } from '~/data/replenishmentConfig'
import { PRODUCTS } from '~/data/inventory'

const cfg = getReplenishmentConfig()
const active = vendorItems.filter((v) => v.active)

describe('sample eligibility (US-001 VR-02 / AC-02)', () => {
  it('no eligible sample is ever a 0-day lead time', () => {
    for (const vi of active.slice(0, 60)) {
      for (const s of deriveLeadTime(vi.vendorId, vi.sku, cfg).samples) {
        expect(s.leadDays).toBeGreaterThanOrEqual(1)
        expect(s.excluded).toBeUndefined()
      }
    }
  })

  it('a receipt with no upstream PO is recorded as excluded, not counted', () => {
    // Excluded no-PO receipts exist in the seed — otherwise AC-02 is untested.
    const withExclusions = PRODUCTS.filter((p) => noPoReceiptCount(p.sku) > 0)
    expect(withExclusions.length).toBeGreaterThan(0)

    for (const p of withExclusions.slice(0, 10)) {
      const d = deriveLeadTime(active.find((v) => v.sku === p.sku)?.vendorId ?? null, p.sku, cfg)
      expect(d.excludedNoPo).toBeGreaterThan(0)
      // Excluded ones never reach the average.
      for (const s of d.samples) expect(s.excluded).toBeUndefined()
    }
  })

  it('an excluded sample never appears among the eligible ones', () => {
    for (const vi of active.slice(0, 40)) {
      const all = leadTimeSamplesFor(vi.vendorId, vi.sku)
      const eligible = deriveLeadTime(vi.vendorId, vi.sku, cfg).samples
      for (const s of all.filter((x) => x.excluded)) {
        expect(eligible).not.toContain(s)
      }
    }
  })

  it('gaps beyond the outlier cap are excluded (AC-06)', () => {
    for (const vi of active) {
      for (const s of deriveLeadTime(vi.vendorId, vi.sku, cfg).samples) {
        expect(s.leadDays).toBeLessThanOrEqual(cfg.leadTimeOutlierCapDays)
      }
    }
  })
})

describe('the computed tier (AC-01)', () => {
  it('averages at most the configured sample count', () => {
    for (const vi of active) {
      const d = deriveLeadTime(vi.vendorId, vi.sku, cfg)
      expect(d.samples.length).toBeLessThanOrEqual(cfg.leadTimeSampleCount)
    }
  })

  it('only claims "computed" with at least the minimum samples', () => {
    for (const vi of active) {
      const d = deriveLeadTime(vi.vendorId, vi.sku, cfg)
      if (d.tier === 'computed') {
        expect(d.sampleSize).toBeGreaterThanOrEqual(cfg.leadTimeMinSamples)
        expect(isEstimatedTier(d.tier)).toBe(false)
      }
    }
  })

  it('the computed value really is the mean of its samples', () => {
    const computed = active
      .map((v) => deriveLeadTime(v.vendorId, v.sku, cfg))
      .filter((d) => d.tier === 'computed')
    expect(computed.length).toBeGreaterThan(0)
    for (const d of computed) {
      const mean = d.samples.reduce((s, x) => s + x.leadDays, 0) / d.samples.length
      expect(d.days).toBe(Math.round(mean))
    }
  })

  it('samples are newest first, so "last N" means the most recent N', () => {
    for (const vi of active.slice(0, 40)) {
      const s = deriveLeadTime(vi.vendorId, vi.sku, cfg).samples
      for (let i = 1; i < s.length; i++) {
        expect(s[i - 1]!.receiptDate >= s[i]!.receiptDate).toBe(true)
      }
    }
  })
})

describe('the resolution ladder (VR-04)', () => {
  it('every active vendor-item resolves to a usable number', () => {
    for (const vi of active) {
      const d = deriveLeadTime(vi.vendorId, vi.sku, cfg)
      expect(d.days).not.toBeNull()
      expect(d.days!).toBeGreaterThanOrEqual(0)
    }
  })

  it('falls to the vendor default when samples are too thin (AC-03)', () => {
    const thin = active
      .map((v) => ({ v, d: deriveLeadTime(v.vendorId, v.sku, cfg) }))
      .filter((x) => x.d.tier === 'vendor-default')
    expect(thin.length).toBeGreaterThan(0)
    for (const { v, d } of thin) {
      expect(d.sampleSize).toBe(0)
      expect(d.days).toBe(vendorDefaultLeadTime(v.vendorId))
      expect(isEstimatedTier(d.tier)).toBe(true)
    }
  })

  it('a SKU with no vendor still walks the category/global rungs, not straight to none', () => {
    // Tiers 1 and 2 are vendor-specific; tiers 3 and 4 are not. A vendorless SKU
    // must still get a number, or every such row would strand in Needs setup —
    // which US-022 AC-06 explicitly rejects.
    const d = deriveLeadTime(null, PRODUCTS[0]!.sku, cfg)
    expect(d.tier).not.toBe('computed')
    expect(d.tier).not.toBe('vendor-default')
    expect(d.days).not.toBeNull()
  })

  it('resolves to none only when every rung is empty', () => {
    const bare = { ...REPL_DEFAULTS, leadTimeByCategory: {}, fallbackLeadTimeDays: 0 }
    const d = deriveLeadTime(null, PRODUCTS[0]!.sku, bare)
    expect(d.days).toBeNull()
    expect(d.tier).toBe('none')
  })

  it('tags every non-computed tier as estimated (AC-03 / AC-04)', () => {
    for (const tier of ['vendor-default', 'category', 'global'] as const) {
      expect(isEstimatedTier(tier)).toBe(true)
      expect(leadTimeTierLabel(tier)).toMatch(/estimated/)
    }
    expect(leadTimeTierLabel('computed', 5)).toMatch(/avg of last 5/)
  })
})

describe('coverage metric (OBS-02)', () => {
  it('reports a real Tier-1 share, not 0% or 100%', () => {
    const cov = computedLeadTimeCoverage()
    expect(cov.total).toBe(active.length)
    expect(cov.computed).toBeGreaterThan(0)
    expect(cov.computed).toBeLessThan(cov.total)
    expect(cov.pct).toBeGreaterThan(0)
  })
})

describe('determinism', () => {
  it('two derivations of the same cell agree exactly', () => {
    for (const vi of active.slice(0, 25)) {
      const a = deriveLeadTime(vi.vendorId, vi.sku, cfg)
      const b = deriveLeadTime(vi.vendorId, vi.sku, cfg)
      expect(a.days).toBe(b.days)
      expect(a.tier).toBe(b.tier)
      expect(a.sampleSize).toBe(b.sampleSize)
    }
  })
})
