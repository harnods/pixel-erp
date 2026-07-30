/**
 * wh-008 (Gudang Palembang) is INTENTIONALLY location-less
 * (warehouses.ts hasStorageLocations:false) — the seed's demo of the supported
 * "general stock, no bins" scenario. This regression lock pins that design so
 * nobody "fixes" it by accident by giving it a storage tree.
 *
 * Locked facts:
 *  - getStorageTree('wh-008') is EMPTY (no bins), yet
 *  - it still holds real stock (some SKU has on-hand > 0) — stock without bins.
 *  - a bin-ful warehouse (wh-001) DOES have a non-empty tree, to contrast.
 *
 * Read-only — no stock is mutated.
 */
import { describe, it, expect } from 'vitest'
import { getStorageTree } from '~/data/storageLocations'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { warehouses } from '~/data/warehouses'

describe('wh-008 — intentionally location-less (stock without bins)', () => {
  it('is flagged hasStorageLocations:false in the seed', () => {
    const wh = warehouses.find((w) => w.id === 'wh-008')
    expect(wh).toBeTruthy()
    expect(wh!.hasStorageLocations).toBe(false)
  })

  it('has an EMPTY storage tree (no bins)', () => {
    expect(getStorageTree('wh-008')).toEqual([])
  })

  it('nonetheless holds real stock — general stock, no bins', () => {
    const detail = getWarehouseDetail('wh-008')
    expect(detail).toBeTruthy()
    expect(detail!.stock.length).toBeGreaterThan(0)
    expect(detail!.stock.some((s) => s.onHand > 0)).toBe(true)
  })

  it('CONTRAST: a bin-ful warehouse (wh-001) DOES have a non-empty tree', () => {
    expect(getStorageTree('wh-001').length).toBeGreaterThan(0)
  })
})
