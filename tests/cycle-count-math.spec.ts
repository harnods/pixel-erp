/**
 * Cycle-count MATH (recommendation scoring + count variance).
 *
 * 1. topRecommendedProductNames() must return real, catalog-backed product names
 *    (never fabricated), at most `limit` of them, and stay coherent with
 *    recommendationCount() (if anything is recommended, the top list is non-empty;
 *    if nothing is, it's empty).
 * 2. Count variance is always `counted − prevQty`: adjustmentLineItems() on a
 *    count line reports difference === counted − prevOnHand for every line.
 *
 * Pure/read-only — no stock is mutated (creating a not_started count record does
 * not touch on-hand), so nothing to invert.
 */
import { describe, it, expect } from 'vitest'
import { topRecommendedProductNames, recommendationCount } from '~/data/cycleCountRecommendations'
import { addWmsAdjustment, adjustmentLineItems } from '~/data/wmsStockAdjustments'
import { PRODUCTS } from '~/data/inventory'
import { warehouses } from '~/data/warehouses'

const CATALOG_NAMES = new Set(PRODUCTS.map((p) => p.name))

describe('topRecommendedProductNames — coherent, catalog-backed names', () => {
  it('returns at most `limit` names, all of which exist in the product catalog', () => {
    const limit = 3
    const names = topRecommendedProductNames(limit)
    expect(names.length).toBeLessThanOrEqual(limit)
    for (const name of names) {
      expect(CATALOG_NAMES.has(name)).toBe(true)
    }
  })

  it('is coherent with recommendationCount (non-empty iff something is recommended)', () => {
    const total = recommendationCount()
    const names = topRecommendedProductNames(3)
    if (total > 0) {
      expect(names.length).toBeGreaterThan(0)
    } else {
      expect(names.length).toBe(0)
    }
    // A larger limit can never return fewer names than a smaller one.
    expect(topRecommendedProductNames(5).length).toBeGreaterThanOrEqual(names.length)
  })
})

describe('Count variance math — difference === counted − prevQty', () => {
  it('adjustmentLineItems reports each count line difference as counted minus prevOnHand', () => {
    const wh = warehouses.find((w) => !w.isDefault && w.status === 'active')!
    // Explicit prevQty so prevOnHand is deterministic (not derived from live stock).
    const lines = [
      { sku: '1001', qty: 12, prevQty: 8 },  // +4
      { sku: '1002', qty: 5, prevQty: 9 },   // −4
      { sku: '1101', qty: 7, prevQty: 7 },   //  0
    ]
    const a = addWmsAdjustment({
      kind: 'count', date: '2026-07-01', warehouseId: wh.id, warehouseName: wh.name,
      category: 'Stock count', tags: [], lines,
    })
    const items = adjustmentLineItems(a)
    expect(items.length).toBe(lines.length)
    for (const item of items) {
      const src = lines.find((l) => l.sku === item.sku)!
      expect(item.prevOnHand).toBe(src.prevQty)
      expect(item.counted).toBe(src.qty)
      expect(item.difference).toBe(item.counted - item.prevOnHand)
      expect(item.difference).toBe(src.qty - src.prevQty)
    }
  })
})
