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
import { vendorItems, VENDORLESS_SKUS } from '~/data/vendorItems'
import { warehouses } from '~/data/warehouses'
import { getReplenishmentConfig, REPL_DEFAULTS, leadTimeOutlierCapForCategory } from '~/data/replenishmentConfig'
import { PRODUCTS, productBySku } from '~/data/inventory'

const cfg = getReplenishmentConfig()
const active = vendorItems.filter((v) => v.active)
const activeWarehouses = warehouses.filter((w) => w.status === 'active').map((w) => w.id)

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

  it('gaps beyond the outlier cap are excluded (AC-06, per category)', () => {
    for (const vi of active) {
      // Cap is per product category (US-001 AC-09).
      const cap = leadTimeOutlierCapForCategory(productBySku(vi.sku)?.category ?? '', cfg)
      for (const s of deriveLeadTime(vi.vendorId, vi.sku, cfg).samples) {
        expect(s.leadDays).toBeLessThanOrEqual(cap)
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

  it('falls to the vendor default when a warehouse cell is too thin (AC-03, per warehouse)', () => {
    // Lead time is now per vendor×product×warehouse (VR-01), so thin cells are
    // found at that grain — a warehouse whose own PO→GR history is sparse.
    const thin = active
      .flatMap((v) => activeWarehouses.map((wh) => ({ v, d: deriveLeadTime(v.vendorId, v.sku, cfg, wh) })))
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
    // Coverage is measured per vendor×product×warehouse cell (VR-01).
    const cov = computedLeadTimeCoverage()
    expect(cov.total).toBe(active.length * activeWarehouses.length)
    expect(cov.computed).toBeGreaterThan(0)
    expect(cov.computed).toBeLessThan(cov.total)
    expect(cov.pct).toBeGreaterThan(0)
  })
})

describe('the "Other categories" floor: number or "Not set" (US-001 Tier 3, D22)', () => {
  // 1006 (Green Beans) and 2101 (Grinder) have no preferred vendor, and those two
  // categories are deliberately not in the default list — so they resolve straight
  // to the floor, which is exactly where the "Not set" switch bites.
  const vendorlessSku = VENDORLESS_SKUS[0]!

  it('a numeric floor gives a vendorless product an estimated lead time', () => {
    const numeric = { ...cfg, fallbackLeadTimeDays: 14 }
    const d = deriveLeadTime(null, vendorlessSku, numeric)
    expect(d.tier).toBe('global')
    expect(d.days).toBe(14)
    expect(isEstimatedTier(d.tier)).toBe(true)
  })

  it('"Not set" (null) leaves the lead time BLANK and never fabricates a 0', () => {
    const notSet = { ...cfg, fallbackLeadTimeDays: null }
    const d = deriveLeadTime(null, vendorlessSku, notSet)
    expect(d.tier).toBe('none')
    expect(d.days).toBeNull()
  })

  it('a non-positive floor is treated as "Not set", not a 0-day lead time', () => {
    const zero = { ...cfg, fallbackLeadTimeDays: 0 }
    const d = deriveLeadTime(null, vendorlessSku, zero)
    expect(d.tier).toBe('none')
    expect(d.days).toBeNull()
  })

  it('a configured category shields its products from the floor even when "Not set"', () => {
    // Roasted Beans carries a category default, so it never falls to the floor —
    // "Not set" only strands products whose category is not in the list.
    const notSet = { ...cfg, fallbackLeadTimeDays: null }
    const roasted = PRODUCTS.find((p) => p.category === 'Roasted Beans')!
    const d = deriveLeadTime(null, roasted.sku, notSet)
    expect(d.tier).toBe('category')
    expect(d.days).not.toBeNull()
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
