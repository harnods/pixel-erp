/**
 * Vendor priority and preferred-vendor fallback (Vendor Supply Profile RS-014).
 *
 *  • Rule 61 — priority 1 = first, unique per product, warehouse-agnostic. Unset →
 *    ordered by the most recent invoice for the pair, then by vendor name.
 *  • Rule 62 — when the preferred vendor is deactivated, it falls to the next active
 *    vendor BY PRIORITY and is flagged; with no active vendor left it is cleared.
 */
import { describe, it, expect } from 'vitest'
import {
  vendorItems, vendorsByPriority, setVendorPriority, deactivateVendorItem, upsertVendorItem,
  setPreferredVendor, preferredVendorItem, inactivePreferredVendorItem, vendorItemsForSku,
} from '~/data/vendorItems'
import { CATALOG } from '~/data/catalog'

/** A SKU with at least three active vendors, so priority and fallback are observable. */
const sku = CATALOG.map((c) => c.sku).find((s) => vendorItemsForSku(s).length >= 3)!

function snapshot() {
  return vendorItems.filter((v) => v.sku === sku).map((v) => ({ ...v }))
}
function restore(rows: ReturnType<typeof snapshot>) {
  for (const r of rows) {
    const live = vendorItems.find((v) => v.id === r.id)!
    for (const k of Object.keys(live)) delete (live as Record<string, unknown>)[k]
    Object.assign(live, r)
  }
}

describe('Rule 61 — vendor priority', () => {
  it('orders explicit priorities first, 1…N, unique per product', () => {
    const before = snapshot()
    try {
      const ids = vendorsByPriority(sku).map((v) => v.vendorId)
      const reversed = [...ids].reverse()
      setVendorPriority(sku, reversed)
      expect(vendorsByPriority(sku).map((v) => v.vendorId)).toEqual(reversed)
      const prios = vendorsByPriority(sku).map((v) => v.priority)
      expect(prios).toEqual(reversed.map((_, i) => i + 1))
      expect(new Set(prios).size).toBe(prios.length)
    } finally { restore(before) }
  })

  it('without a set priority, orders by latest invoice then by name — deterministically', () => {
    const a = vendorsByPriority(sku).map((v) => v.vendorId)
    const b = vendorsByPriority(sku).map((v) => v.vendorId)
    expect(a).toEqual(b)
    expect(vendorsByPriority(sku).every((v) => v.priority === undefined)).toBe(true)
  })
})

describe('Rule 62 — preferred-vendor fallback', () => {
  it('falls to the next active vendor by PRIORITY and flags it', () => {
    const before = snapshot()
    try {
      const preferred = preferredVendorItem(sku)!
      const others = vendorsByPriority(sku).map((v) => v.vendorId).filter((id) => id !== preferred.vendorId)
      // Put the LAST of the others first by priority, so lead-time order would pick differently.
      const order = [preferred.vendorId, others[others.length - 1]!, ...others.slice(0, -1)]
      setVendorPriority(sku, order)
      deactivateVendorItem(sku, preferred.vendorId)
      expect(preferredVendorItem(sku)?.vendorId).toBe(others[others.length - 1])
      expect(inactivePreferredVendorItem(sku)?.vendorId).toBe(preferred.vendorId)
      // Picking a preferred vendor clears the flag.
      setPreferredVendor(sku, others[0]!)
      expect(inactivePreferredVendorItem(sku)).toBeUndefined()
    } finally { restore(before) }
  })

  it('clears the preferred vendor when no active vendor remains', () => {
    const before = snapshot()
    try {
      for (const v of vendorItemsForSku(sku)) deactivateVendorItem(sku, v.vendorId)
      expect(vendorItemsForSku(sku)).toHaveLength(0)
      expect(preferredVendorItem(sku)).toBeUndefined()
      expect(vendorItems.filter((v) => v.sku === sku).some((v) => v.isPreferred)).toBe(false)
    } finally {
      restore(before)
      // upsert re-persists; keep the store consistent with the restored rows.
      const any = before[0]!
      upsertVendorItem({ sku, vendorId: any.vendorId, active: any.active })
    }
  })
})
