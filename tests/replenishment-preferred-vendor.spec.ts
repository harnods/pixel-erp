/**
 * D23 — the preferred vendor is per SKU × warehouse (a different vendor may be
 * preferred in each warehouse); a warehouse with no pick falls back to the SKU-level
 * default. Mutates the per-warehouse overlay, so each test clears what it set.
 */
import { describe, it, expect, afterEach } from 'vitest'
import {
  vendorItemsForSku, preferredVendorFor, preferredVendorItem,
  setPreferredVendor, clearPreferredVendorForWarehouse,
} from '~/data/vendorItems'
import { buildRow, replenishmentWarehouses, invalidateReplenishmentCaches } from '~/data/replenishment'
import { PRODUCTS } from '~/data/inventory'

const whs = replenishmentWarehouses()
// A product with at least two active vendor links, so "different vendor per warehouse"
// is actually expressible.
const sku = PRODUCTS.map((p) => p.sku).find((s) => vendorItemsForSku(s).length >= 2)!
const links = vendorItemsForSku(sku)
const skuDefault = preferredVendorItem(sku)!.vendorId
const alternate = links.find((v) => v.vendorId !== skuDefault)!.vendorId
const [whA, whB] = whs

afterEach(() => {
  clearPreferredVendorForWarehouse(sku, whA!.id)
  clearPreferredVendorForWarehouse(sku, whB!.id)
  invalidateReplenishmentCaches()
})

describe('D23 — preferred vendor per SKU × warehouse', () => {
  it('has a seed SKU with two vendors and two warehouses to test with', () => {
    expect(sku).toBeTruthy()
    expect(alternate).not.toBe(skuDefault)
    expect(whs.length).toBeGreaterThanOrEqual(2)
  })

  it('resolves the warehouse pick, and falls back to the SKU default elsewhere', () => {
    setPreferredVendor(sku, alternate, whA!.id)
    expect(preferredVendorFor(sku, whA!.id)?.vendorId).toBe(alternate)
    // A warehouse with no explicit pick uses the SKU-level default.
    expect(preferredVendorFor(sku, whB!.id)?.vendorId).toBe(skuDefault)
    // No warehouse → the SKU-level default.
    expect(preferredVendorFor(sku)?.vendorId).toBe(skuDefault)
  })

  it('buildRow uses the per-warehouse preferred vendor', () => {
    setPreferredVendor(sku, alternate, whA!.id)
    invalidateReplenishmentCaches()
    expect(buildRow(sku, whA!.id).vendor?.id).toBe(alternate)
    expect(buildRow(sku, whB!.id).vendor?.id).toBe(skuDefault)
  })

  it('clearing a warehouse falls back to the SKU default', () => {
    setPreferredVendor(sku, alternate, whA!.id)
    clearPreferredVendorForWarehouse(sku, whA!.id)
    expect(preferredVendorFor(sku, whA!.id)?.vendorId).toBe(skuDefault)
  })

  it('an explicit pick that is no longer an active link falls back to the default', () => {
    setPreferredVendor(sku, 'V999-nonexistent', whA!.id)
    expect(preferredVendorFor(sku, whA!.id)?.vendorId).toBe(skuDefault)
  })
})
