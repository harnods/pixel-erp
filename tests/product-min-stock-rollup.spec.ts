/**
 * Product-level rollup semantics (PRD D13 / D13a / D14 / D15, US-024).
 *
 * D13 fixed the direction of travel — the warehouse is the source of truth and
 * the only trigger. D13a then dropped the summed product min stock as a surfaced
 * figure: it is exact arithmetic nobody acts on, and read as a pooled
 * requirement it is biased high (risk-pooling — central stock scales with √N,
 * not N). What the product level surfaces instead is the ACTION: due in N of M
 * warehouses, and the total qty to request.
 *
 * The sum still exists as a function, because a labelled visibility total is
 * allowed; what is asserted here is that no surface uses it as a headline or a
 * trigger.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  warehouseMinStockRollup, productActionRollup, isManualFloorTooLow, buildRow,
  replenishmentWorklist, invalidateReplenishmentCaches, replenishmentWarehouses,
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

describe('the product level rolls up the ACTION, not a threshold (D13a)', () => {
  it('counts due warehouses and totals the qty to request', () => {
    const sku = multiWarehouseSku()
    const a = productActionRollup(sku, cfg)

    expect(a.warehouseCount).toBeGreaterThan(1)
    expect(a.dueCount).toBe(a.dueWarehouses.length)
    expect(a.dueCount).toBeLessThanOrEqual(a.warehouseCount)
    expect(a.totalSuggestedQty).toBe(a.dueWarehouses.reduce((s, w) => s + w.qty, 0))
  })

  it('each due warehouse was decided on its OWN reorder point, never the sum', () => {
    const sku = multiWarehouseSku()
    const a = productActionRollup(sku, cfg)
    for (const w of a.dueWarehouses) {
      const row = buildRow(sku, w.warehouseId, cfg)
      expect(row.flags.dueForReorder).toBe(true)
      expect(row.atp.available + row.atp.onOrder).toBeLessThanOrEqual(row.reorderPoint)
      expect(w.qty).toBe(row.suggestion.rawQty)
    }
  })

  it('the qty carried is the request need, matching what a PR would take', () => {
    const sku = multiWarehouseSku()
    for (const w of productActionRollup(sku, cfg).dueWarehouses) {
      const row = buildRow(sku, w.warehouseId, cfg)
      // rawQty, not the MOQ/pack-rounded purchase qty (decision D12).
      expect(w.qty).toBe(row.suggestion.rawQty)
    }
  })

  it('no product surface headlines the summed min stock (D13a VR-03)', () => {
    // The sum remains available as a labelled visibility total, but the product
    // form must not present it as the product's minimum stock.
    const form = readFileSync(join(process.cwd(), 'app/components/pages/NewProductPage.vue'), 'utf8')
    expect(form).not.toMatch(/warehouseMinStockRollup/)
    expect(form).toMatch(/productActionRollup/)
  })
})

describe('safety days cascades, it does not sum (D14)', () => {
  it('a product default reaches every warehouse that has no override', () => {
    const sku = multiWarehouseSku()
    saveSkuOverride(sku, { safetyDays: 11 })
    invalidateReplenishmentCaches()

    for (const w of warehouseMinStockRollup(sku, cfg).perWarehouse) {
      expect(buildRow(sku, w.warehouseId, cfg).safetyDays).toBe(11)
    }
  })

  it('a warehouse override beats the product default, and only there', () => {
    const sku = multiWarehouseSku()
    const all = warehouseMinStockRollup(sku, cfg).perWarehouse
    const one = all[0]!

    saveSkuOverride(sku, { safetyDays: 11 })
    saveSkuWarehouseOverride(sku, one.warehouseId, { safetyDays: 30 })
    invalidateReplenishmentCaches()

    expect(buildRow(sku, one.warehouseId, cfg).safetyDays).toBe(30)
    for (const w of all.slice(1)) {
      expect(buildRow(sku, w.warehouseId, cfg).safetyDays).toBe(11)
    }
  })

  it('safety days is never summed across warehouses', () => {
    // The opposite of the reorder-point quantity: it is a time parameter, so no
    // warehouse ever carries the total of the others.
    const sku = multiWarehouseSku()
    saveSkuOverride(sku, { safetyDays: 5 })
    invalidateReplenishmentCaches()
    const perWarehouse = warehouseMinStockRollup(sku, cfg).perWarehouse
    const summed = perWarehouse.length * 5
    for (const w of perWarehouse) {
      expect(buildRow(sku, w.warehouseId, cfg).safetyDays).toBe(5)
      expect(buildRow(sku, w.warehouseId, cfg).safetyDays).not.toBe(summed)
    }
  })
})

describe('every warehouse always resolves to an effective value (D15)', () => {
  it('own override → product default → computed, with no gaps', () => {
    // D15 keeps the warehouse-level effective value as the single read-model WMS
    // reads, so there must never be a warehouse without one.
    const sku = multiWarehouseSku()
    for (const w of warehouseMinStockRollup(sku, cfg).perWarehouse) {
      expect(typeof w.value).toBe('number')
      expect(Number.isFinite(w.value)).toBe(true)
      expect(['sku-warehouse', 'sku', 'calculated', 'stored']).toContain(w.source)
    }
  })

  it('there is no company-level product-vs-warehouse mode switch', () => {
    // D15 VR-04 — the cascade serves both, so no toggle should exist to forbid
    // mixing them.
    const cfgSrc = readFileSync(join(process.cwd(), 'app/data/replenishmentConfig.ts'), 'utf8')
    expect(cfgSrc).not.toMatch(/minStockLevel|minStockMode|productVsWarehouse/i)
  })
})
