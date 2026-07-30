/**
 * Integrity guard — storage location delete.
 *
 * A storage location can only be deleted when its SKU slice holds no on-hand
 * stock — deleting a bin that still stores units would orphan that stock.
 * `stockInLocation(warehouseId, locId)` sums on-hand across the location's SKU
 * slice; while it's > 0, `canDeleteLocation` is false and `deleteLocationSafe`
 * refuses with a LOCATION_HAS_STOCK reason. An empty location is deletable.
 */
import { describe, it, expect } from 'vitest'
import {
  canDeleteLocation, deleteLocationSafe, stockInLocation,
} from '~/data/integrityGuards'
import { getStorageTree, findLocation, addRootLocation } from '~/data/storageLocations'
import '~/data/warehouseDetails'

const WH = 'wh-001'

/** First location in wh-001's tree whose SKU slice actually holds on-hand stock. */
function stockHoldingLocId(): string {
  const roots = getStorageTree(WH)
  const found = roots.find((n) => stockInLocation(WH, n.id) > 0)
  return found!.id
}

describe('Integrity guard — storage location delete', () => {
  it('a location whose SKU slice holds on-hand stock cannot be deleted', () => {
    const locId = stockHoldingLocId()
    expect(stockInLocation(WH, locId)).toBeGreaterThan(0)

    expect(canDeleteLocation(WH, locId)).toBe(false)
    const res = deleteLocationSafe(WH, locId)
    expect(res.ok).toBe(false)
    expect(res.ok === false && res.reason).toContain('LOCATION_HAS_STOCK')

    // Refused — the location still exists in the tree.
    expect(findLocation(WH, locId)).toBeTruthy()
  })

  it('an empty location (no SKU slice / zero on-hand) can be deleted', () => {
    // A freshly-added root bin carries no SKU slice (skuQty 0) → holds no stock.
    addRootLocation(WH, { level: 'Bin', name: `Guard Empty Bin ${Date.now()}`, type: 'Storage' })
    const empty = getStorageTree(WH).find((n) => n.name.startsWith('Guard Empty Bin'))!
    expect(empty).toBeTruthy()
    expect(stockInLocation(WH, empty.id)).toBe(0)

    expect(canDeleteLocation(WH, empty.id)).toBe(true)
    const res = deleteLocationSafe(WH, empty.id)
    expect(res.ok).toBe(true)

    // Actually removed from the tree.
    expect(findLocation(WH, empty.id)).toBeUndefined()
  })
})
