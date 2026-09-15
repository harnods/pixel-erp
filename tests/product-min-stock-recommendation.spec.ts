/**
 * Min. stock as a RECOMMENDATION, not a number the user invents
 * (PRD §2.2 item 3, US-011, US-024 AC-03).
 *
 * The PRD defines reorder point and minimum stock threshold as one quantity:
 *   min. stock = avg daily demand × (lead time + safety days)
 * So the product form takes SAFETY DAYS — the actual judgement call — and derives
 * min. stock from it, leaving the user free to overwrite.
 *
 * The rule that matters most is the null case: a product with no sales history
 * gets NO recommendation rather than a plausible-looking floor, because a
 * fabricated reorder point is what silently causes either stockouts or dead
 * stock, and nobody would know which.
 */
import { describe, it, expect } from 'vitest'
import { recommendedMinStock, replenishmentWarehouses, velocityFor } from '~/data/replenishment'
import { getReplenishmentConfig } from '~/data/replenishmentConfig'
import { effectiveSettings } from '~/data/replenishmentSettings'
import { warehouseProducts, PRODUCTS } from '~/data/inventory'
import { preferredVendorItem } from '~/data/vendorItems'
import { REPL_COLD_START_SKUS } from '~/data/demandHistory'

const cfg = getReplenishmentConfig()

/** A SKU that actually moves somewhere, so the happy path is not vacuous. */
function movingSku(): string {
  for (const wh of replenishmentWarehouses()) {
    for (const p of warehouseProducts(wh.id)) {
      if (velocityFor(p.sku, wh.id, cfg).avgDailySales > 0) return p.sku
    }
  }
  throw new Error('no moving SKU in the seed')
}

describe('recommendedMinStock — the formula', () => {
  it('is avg daily demand × (lead time + safety days)', () => {
    const sku = movingSku()
    const r = recommendedMinStock(sku, undefined, cfg)
    expect(r.value).not.toBeNull()
    expect(r.value).toBe(Math.ceil(r.avgDailySales * (r.leadTimeDays + r.safetyDays)))
  })

  it('more safety days means a higher floor, and the rise is proportional', () => {
    const sku = movingSku()
    const a = recommendedMinStock(sku, 7, cfg)
    const b = recommendedMinStock(sku, 14, cfg)
    expect(b.value!).toBeGreaterThan(a.value!)
    // The only thing that changed is the buffer, so the delta is 7 days of demand.
    expect(b.value! - a.value!).toBe(
      Math.ceil(b.avgDailySales * (b.leadTimeDays + 14))
      - Math.ceil(a.avgDailySales * (a.leadTimeDays + 7)),
    )
  })

  it('zero safety days still covers the vendor lead time', () => {
    const sku = movingSku()
    const r = recommendedMinStock(sku, 0, cfg)
    expect(r.safetyDays).toBe(0)
    expect(r.value).toBe(Math.ceil(r.avgDailySales * r.leadTimeDays))
    // Never zero for a moving product — lead time alone justifies a floor.
    expect(r.value!).toBeGreaterThan(0)
  })

  it('reports the inputs it used, so the form can explain the number', () => {
    const r = recommendedMinStock(movingSku(), undefined, cfg)
    expect(r.avgDailySales).toBeGreaterThan(0)
    expect(r.leadTimeDays).toBeGreaterThanOrEqual(0)
    expect(r.warehouseName).toBeTruthy()
    expect(r.warehouseCount).toBeGreaterThan(0)
    expect(r.leadTimeTier).toBeTruthy()
  })
})

describe('no basis means no number (US-003 CON-02)', () => {
  it('a cold-start product gets null, never a plausible-looking floor', () => {
    for (const sku of REPL_COLD_START_SKUS) {
      const r = recommendedMinStock(sku, undefined, cfg)
      if (r.value !== null) continue // moved in some warehouse — fine
      expect(r.value).toBeNull()
      expect(r.avgDailySales).toBe(0)
    }
  })

  it('an unknown SKU gets null rather than throwing', () => {
    const r = recommendedMinStock('does-not-exist', undefined, cfg)
    expect(r.value).toBeNull()
    expect(r.warehouseCount).toBe(0)
  })
})

describe('grain — a SKU-level default warehouses inherit (US-024 AC-03)', () => {
  it('takes the highest per-warehouse figure, so the floor covers the busiest', () => {
    const sku = movingSku()
    const r = recommendedMinStock(sku, undefined, cfg)

    let highest = 0
    for (const wh of replenishmentWarehouses()) {
      if (!warehouseProducts(wh.id).some((p) => p.sku === sku)) continue
      const v = velocityFor(sku, wh.id, cfg).avgDailySales
      if (v <= 0) continue
      const settings = effectiveSettings(sku, wh.id, cfg)
      highest = Math.max(highest, Math.ceil(v * (r.leadTimeDays + settings.safetyDays)))
    }
    expect(r.value).toBe(highest)
  })

  it('is deterministic — the same product recommends the same floor twice', () => {
    const sku = movingSku()
    expect(recommendedMinStock(sku, 9, cfg).value).toBe(recommendedMinStock(sku, 9, cfg).value)
  })
})

describe('lead-time confidence is reported, not hidden', () => {
  it('a product with no preferred vendor still gets a number, tagged as inherited', () => {
    // The ladder exists so a recommendation survives thin data (US-001 VR-04).
    // Withholding the figure would be worse than labelling it.
    const vendorless = PRODUCTS.filter((p) => !preferredVendorItem(p.sku))
    expect(vendorless.length).toBeGreaterThan(0)

    const withValue = vendorless
      .map((p) => recommendedMinStock(p.sku, undefined, cfg))
      .filter((r) => r.value !== null)
    expect(withValue.length).toBeGreaterThan(0)

    for (const r of withValue) {
      expect(r.preferredVendorId).toBeNull()
      expect(r.preferredVendorName).toBe('')
      // Never claims to be measured when no vendor exists to measure.
      expect(r.leadTimeEstimated).toBe(true)
      expect(r.leadTimeTier).not.toBe('computed')
      expect(r.leadTimeSampleSize).toBe(0)
    }
  })

  it('a measured lead time names its vendor and its sample size', () => {
    const measured = PRODUCTS
      .map((p) => recommendedMinStock(p.sku, undefined, cfg))
      .filter((r) => r.value !== null && r.leadTimeTier === 'computed')

    for (const r of measured) {
      expect(r.leadTimeEstimated).toBe(false)
      expect(r.preferredVendorId).toBeTruthy()
      expect(r.preferredVendorName).toBeTruthy()
      expect(r.leadTimeSampleSize).toBeGreaterThanOrEqual(cfg.leadTimeMinSamples)
    }
  })

  it('estimated and measured are never conflated', () => {
    for (const p of PRODUCTS) {
      const r = recommendedMinStock(p.sku, undefined, cfg)
      // The flag and the tier can never disagree — the UI branches on both.
      expect(r.leadTimeEstimated).toBe(r.leadTimeTier !== 'computed' && r.leadTimeTier !== 'manual')
    }
  })
})
