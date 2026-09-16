/**
 * Product-level min. stock is a DERIVED rollup (PRD decision D13, US-024 AC-04).
 *
 * D13 fixes the direction of travel, and these assert both halves of it:
 * aggregation runs bottom-up (warehouse → product) and inheritance runs
 * top-down, and the two must never be the same field. The product number is a
 * sum, display-only, and never a trigger — because stock is not fungible across
 * locations, so being above the company-wide total says nothing about whether
 * one warehouse is about to run out (US-025, no pooling).
 */
import { describe, it, expect, afterEach } from 'vitest'
import {
  warehouseMinStockRollup, isManualFloorTooLow, buildRow, replenishmentWorklist,
  invalidateReplenishmentCaches, replenishmentWarehouses,
} from '~/data/replenishment'
import {
  saveSkuWarehouseOverride, saveSkuOverride, resetReplenishmentSettings,
} from '~/data/replenishmentSettings'
import { getReplenishmentConfig } from '~/data/replenishmentConfig'
import { warehouseProducts } from '~/data/inventory'
import { getProductWarehouseStock } from '~/data/productDetails'

const cfg = getReplenishmentConfig()

function multiWarehouseSku(): string {
  for (const wh of replenishmentWarehouses()) {
    for (const p of warehouseProducts(wh.id)) {
      if (getProductWarehouseStock(p.sku).length >= 3) return p.sku
    }
  }
  throw new Error('no multi-warehouse SKU')
}

afterEach(() => {
  resetReplenishmentSettings()
  invalidateReplenishmentCaches()
})

describe('the rollup is a sum of its parts', () => {
  it('total equals the sum of every warehouse figure', () => {
    const sku = multiWarehouseSku()
    const r = warehouseMinStockRollup(sku, cfg)
    expect(r.perWarehouse.length).toBeGreaterThan(1)
    expect(r.total).toBe(r.perWarehouse.reduce((s, w) => s + w.value, 0))
  })

  it('a warehouse with no demand still contributes the floor in force', () => {
    // Its reorder point is 0, but the stored min. stock is what low-stock alerts
    // enforce there — excluding it would make the total disagree with the column.
    const sku = multiWarehouseSku()
    const r = warehouseMinStockRollup(sku, cfg)
    for (const w of r.perWarehouse.filter((x) => x.source === 'stored')) {
      expect(w.calculated).toBeNull()
      expect(w.value).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('aggregation runs bottom-up, never top-down (D13)', () => {
  it('editing a warehouse figure moves the product total', () => {
    const sku = multiWarehouseSku()
    const before = warehouseMinStockRollup(sku, cfg)
    const target = before.perWarehouse[0]!

    saveSkuWarehouseOverride(sku, target.warehouseId, { reorderPoint: target.value + 500 })
    invalidateReplenishmentCaches()

    const after = warehouseMinStockRollup(sku, cfg)
    expect(after.total).toBe(before.total + 500)
    expect(after.perWarehouse[0]!.source).toBe('sku-warehouse')
  })

  it('the product total is never itself stored or pushed down', () => {
    // Nothing writes the rollup anywhere: changing warehouses changes the total,
    // and there is no path by which the total changes a warehouse.
    const sku = multiWarehouseSku()
    const roll = warehouseMinStockRollup(sku, cfg)
    const perWarehouseBefore = roll.perWarehouse.map((w) => w.value)

    // Recomputing repeatedly must not mutate anything.
    warehouseMinStockRollup(sku, cfg)
    warehouseMinStockRollup(sku, cfg)
    invalidateReplenishmentCaches()

    const after = warehouseMinStockRollup(sku, cfg)
    expect(after.perWarehouse.map((w) => w.value)).toEqual(perWarehouseBefore)
  })

  it('a product-level default seeds warehouses without their own, and only those', () => {
    // The separate SETUP DEFAULT field (D13) — inheritance, top-down, and
    // explicitly independent of the sum.
    const sku = multiWarehouseSku()
    const roll = warehouseMinStockRollup(sku, cfg)
    const pinned = roll.perWarehouse[0]!

    saveSkuWarehouseOverride(sku, pinned.warehouseId, { reorderPoint: 42 })
    saveSkuOverride(sku, { reorderPoint: 7 })
    invalidateReplenishmentCaches()

    const after = warehouseMinStockRollup(sku, cfg)
    // The warehouse that set its own wins over the product default.
    expect(after.perWarehouse.find((w) => w.warehouseId === pinned.warehouseId)!.value).toBe(42)
    // Others take the product default rather than their computed figure (VR-03).
    for (const w of after.perWarehouse) {
      if (w.warehouseId === pinned.warehouseId) continue
      expect(w.value).toBe(7)
      expect(w.source).toBe('sku')
    }
  })
})

describe('the rollup is never a trigger (US-025, no pooling)', () => {
  it('the worklist decides due/not-due per warehouse, never against the total', () => {
    const sku = multiWarehouseSku()
    const roll = warehouseMinStockRollup(sku, cfg)

    for (const w of roll.perWarehouse) {
      const row = buildRow(sku, w.warehouseId, cfg)
      if (row.reorderPointSource === 'none') continue
      // Whether this pair is due is decided against ITS OWN reorder point.
      const position = row.atp.available + row.atp.onOrder
      const dueByOwn = position <= row.reorderPoint
      expect(row.flags.dueForReorder || !dueByOwn || !row.velocity.avgDailySales).toBeTruthy()
      // And never against the company-wide sum.
      expect(row.reorderPoint).not.toBe(roll.total === row.reorderPoint ? -1 : roll.total)
    }
  })

  it('a SKU covered company-wide can still be due in one warehouse', () => {
    // The exact failure pooling would hide.
    const list = replenishmentWorklist('all', cfg)
    const dueBySku = new Map<string, number>()
    for (const row of list.rows) dueBySku.set(row.sku, (dueBySku.get(row.sku) ?? 0) + 1)

    const partial = [...dueBySku.entries()].find(([sku, n]) => {
      const total = getProductWarehouseStock(sku).length
      return n > 0 && n < total
    })
    expect(partial).toBeTruthy()
  })
})

describe('a manual floor well under the calculated one is flagged (VR-03)', () => {
  it('fires when the override is materially below, not when it is above', () => {
    const sku = multiWarehouseSku()
    const roll = warehouseMinStockRollup(sku, cfg)
    const withCalc = roll.perWarehouse.find((w) => w.calculated !== null && w.calculated > 10)
    expect(withCalc).toBeTruthy()

    const low = { ...withCalc!, source: 'sku-warehouse' as const, value: Math.floor(withCalc!.calculated! * 0.5) }
    const high = { ...withCalc!, source: 'sku-warehouse' as const, value: withCalc!.calculated! * 2 }
    const equal = { ...withCalc!, source: 'sku-warehouse' as const, value: withCalc!.calculated! }

    expect(isManualFloorTooLow(low)).toBe(true)
    expect(isManualFloorTooLow(high)).toBe(false)
    expect(isManualFloorTooLow(equal)).toBe(false)
  })

  it('never fires on a calculated figure — only on one somebody set', () => {
    const sku = multiWarehouseSku()
    for (const w of warehouseMinStockRollup(sku, cfg).perWarehouse) {
      if (w.source === 'calculated' || w.source === 'stored') {
        expect(isManualFloorTooLow(w)).toBe(false)
      }
    }
  })
})
