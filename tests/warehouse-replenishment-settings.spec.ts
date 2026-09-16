/**
 * Replenishment settings at the WAREHOUSE grain (PRD US-024, US-011 AC-02).
 *
 * Decision D2 puts everything at item × warehouse: "Reorder point, settings,
 * demand, lead time, worklist and netting are all at the item × warehouse
 * grain". A SKU selling fast in Jakarta and barely moving in Medan needs
 * different floors, and a product-level number cannot express that — so the
 * product form sets the SKU-level DEFAULT and each warehouse may override it.
 *
 * The precedence that matters: warehouse-SKU > SKU > category > global. These
 * assert it from the top tier down, because a silently-ignored override is the
 * failure that would make the whole settings surface untrustworthy.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { buildRow, invalidateReplenishmentCaches, replenishmentWarehouses, velocityFor } from '~/data/replenishment'
import {
  effectiveSettings, saveSkuOverride, saveSkuWarehouseOverride,
  clearSkuWarehouseOverride, resetReplenishmentSettings,
} from '~/data/replenishmentSettings'
import { getReplenishmentConfig } from '~/data/replenishmentConfig'
import { warehouseProducts } from '~/data/inventory'

const cfg = getReplenishmentConfig()

/** A SKU stocked in at least two warehouses, moving in at least one. */
function pair(): { sku: string; a: string; b: string } {
  for (const wh of replenishmentWarehouses()) {
    for (const p of warehouseProducts(wh.id)) {
      if (velocityFor(p.sku, wh.id, cfg).avgDailySales <= 0) continue
      const others = replenishmentWarehouses().filter(
        (w) => w.id !== wh.id && warehouseProducts(w.id).some((x) => x.sku === p.sku),
      )
      if (others.length) return { sku: p.sku, a: wh.id, b: others[0]!.id }
    }
  }
  throw new Error('no multi-warehouse moving SKU in the seed')
}

afterEach(() => {
  resetReplenishmentSettings()
  invalidateReplenishmentCaches()
})

describe('safety days per warehouse', () => {
  it('a warehouse override beats the SKU default (US-011 VR-03)', () => {
    const { sku, a, b } = pair()
    saveSkuOverride(sku, { safetyDays: 5 })
    saveSkuWarehouseOverride(sku, a, { safetyDays: 30 })
    invalidateReplenishmentCaches()

    expect(effectiveSettings(sku, a, cfg).safetyDays).toBe(30)
    expect(effectiveSettings(sku, a, cfg).safetyDaysSource).toBe('sku-warehouse')
    // The other warehouse is untouched and still inherits the SKU default.
    expect(effectiveSettings(sku, b, cfg).safetyDays).toBe(5)
    expect(effectiveSettings(sku, b, cfg).safetyDaysSource).toBe('sku')
  })

  it('clearing the override falls back rather than leaving a stale value', () => {
    const { sku, a } = pair()
    saveSkuOverride(sku, { safetyDays: 5 })
    saveSkuWarehouseOverride(sku, a, { safetyDays: 30 })
    invalidateReplenishmentCaches()
    expect(effectiveSettings(sku, a, cfg).safetyDays).toBe(30)

    // Empty box → undefined → the key is removed, not stored as undefined.
    saveSkuWarehouseOverride(sku, a, { safetyDays: undefined })
    invalidateReplenishmentCaches()
    expect(effectiveSettings(sku, a, cfg).safetyDays).toBe(5)
    expect(effectiveSettings(sku, a, cfg).safetyDaysSource).toBe('sku')
  })

  it('more safety days in one warehouse raises only that floor', () => {
    const { sku, a, b } = pair()
    const beforeA = buildRow(sku, a, cfg).reorderPoint
    const beforeB = buildRow(sku, b, cfg).reorderPoint

    saveSkuWarehouseOverride(sku, a, { safetyDays: effectiveSettings(sku, a, cfg).safetyDays + 30 })
    invalidateReplenishmentCaches()

    expect(buildRow(sku, a, cfg).reorderPoint).toBeGreaterThan(beforeA)
    expect(buildRow(sku, b, cfg).reorderPoint).toBe(beforeB)
  })
})

describe('min. stock per warehouse', () => {
  it('is the reorder point — velocity × (lead + safety) for THAT warehouse', () => {
    const { sku, a } = pair()
    const row = buildRow(sku, a, cfg)
    expect(row.reorderPointSource).toBe('calculated')
    expect(row.reorderPoint).toBe(
      Math.ceil(row.velocity.avgDailySales * (row.leadTimeDays + row.safetyDays)),
    )
  })

  it('an explicit floor overrides the calculation and says so', () => {
    const { sku, a } = pair()
    saveSkuWarehouseOverride(sku, a, { reorderPoint: 777 })
    invalidateReplenishmentCaches()

    const row = buildRow(sku, a, cfg)
    expect(row.reorderPoint).toBe(777)
    expect(row.reorderPointSource).toBe('sku-warehouse')
  })

  it('two warehouses of the same SKU hold independent floors (D2)', () => {
    const { sku, a, b } = pair()
    saveSkuWarehouseOverride(sku, a, { reorderPoint: 500 })
    saveSkuWarehouseOverride(sku, b, { reorderPoint: 5 })
    invalidateReplenishmentCaches()

    expect(buildRow(sku, a, cfg).reorderPoint).toBe(500)
    expect(buildRow(sku, b, cfg).reorderPoint).toBe(5)
  })

  it('clearing it returns to calculated, not to the last typed number', () => {
    const { sku, a } = pair()
    const calculated = buildRow(sku, a, cfg).reorderPoint

    saveSkuWarehouseOverride(sku, a, { reorderPoint: 999 })
    invalidateReplenishmentCaches()
    expect(buildRow(sku, a, cfg).reorderPoint).toBe(999)

    clearSkuWarehouseOverride(sku, a)
    invalidateReplenishmentCaches()
    const after = buildRow(sku, a, cfg)
    expect(after.reorderPoint).toBe(calculated)
    expect(after.reorderPointSource).toBe('calculated')
  })

  it('a warehouse with no sales has no floor to calculate, and says none', () => {
    // The engine refuses a floor without a demand basis; the table must show "—"
    // rather than 0, which would read as "never reorder this".
    for (const wh of replenishmentWarehouses()) {
      for (const p of warehouseProducts(wh.id).slice(0, 8)) {
        const row = buildRow(p.sku, wh.id, cfg)
        if (row.velocity.avgDailySales > 0) continue
        expect(row.reorderPointSource).toBe('none')
        expect(row.reorderPoint).toBe(0)
      }
    }
  })
})
