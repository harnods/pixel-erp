/**
 * PRD gap-closure (items 1–4 of the October review):
 *  1. A covered row that still stocks out keeps the covered state but is labelled to
 *     verify the arrival, and counts as a stockout (§2.7 stockout-wins).
 *  2. The demand outlier cap defaults to 1.5× (§2.2).
 *  3. Lead time is never typed (US-001 AC-09) — there is no manual override.
 *  4. An inactive preferred vendor is detected per SKU × warehouse (US-001 EH-01 / D23).
 */
import { describe, it, expect } from 'vitest'
import { REPL_DEFAULTS } from '~/data/replenishmentConfig'
import { effectiveSettings } from '~/data/replenishmentSettings'
import { buildRow, replenishmentWorklist, invalidateReplenishmentCaches } from '~/data/replenishment'
import {
  vendorItemsForSku, setPreferredVendor, clearPreferredVendorForWarehouse, deactivateVendorItem,
  upsertVendorItem, inactivePreferredVendorFor,
} from '~/data/vendorItems'
import { leadTimeTierLabel } from '~/data/leadTimeHistory'

describe('item 1 — stockout-wins keeps the covered state', () => {
  it('every covered row that stocks out before resupply asks to verify the inbound arrival, and is counted as a stockout', () => {
    const wl = replenishmentWorklist('all')
    const stockouts = wl.coveredByInbound.filter((r) => r.flags.belowLeadTime)
    for (const r of wl.coveredByInbound) expect(r.flags.verifyInbound).toBe(r.flags.belowLeadTime)
    expect(wl.totals.belowLeadTime).toBe(
      wl.rows.filter((r) => r.flags.belowLeadTime).length + stockouts.length,
    )
    // None of them is in the To order count.
    expect(wl.totals.due).toBe(wl.rows.length)
  })
})

describe('item 2 — demand outlier cap', () => {
  it('defaults to 1.5× the typical day', () => {
    expect(REPL_DEFAULTS.demandOutlierCapMultiple).toBe(1.5)
  })
})

describe('item 3 — lead time cannot be overridden', () => {
  it('has no manual lead time in the resolved settings or the tier labels', () => {
    const row = replenishmentWorklist('all').rows[0]!
    expect(Object.keys(effectiveSettings(row.sku, row.warehouseId))).not.toContain('manualLeadTimeDays')
    expect(leadTimeTierLabel('none')).toBe('no lead-time data')
  })
})

describe('item 4 — inactive preferred vendor is per warehouse', () => {
  it("flags only the warehouse whose OWN pick went inactive", () => {
    const sku = '1101'
    const links = vendorItemsForSku(sku)
    if (links.length < 2) return // seed-dependent
    const [a, b] = [links[0]!, links[1]!]
    const whA = 'wh-001'
    const whB = 'wh-002'
    // wh-001 prefers vendor A; wh-002 prefers vendor B.
    setPreferredVendor(sku, a.vendorId, whA)
    setPreferredVendor(sku, b.vendorId, whB)
    invalidateReplenishmentCaches()
    try {
      expect(inactivePreferredVendorFor(sku, whA)).toBeUndefined()

      deactivateVendorItem(sku, a.vendorId)
      invalidateReplenishmentCaches()
      // wh-001's own pick is gone → flagged, and lead time fell back to the next vendor.
      expect(inactivePreferredVendorFor(sku, whA)?.vendorId).toBe(a.vendorId)
      expect(buildRow(sku, whA).inactivePreferredVendor?.id).toBe(a.vendorId)
      expect(buildRow(sku, whA).vendor?.id).not.toBe(a.vendorId)
      // wh-002 has a healthy pick of its own → not flagged by someone else's.
      expect(inactivePreferredVendorFor(sku, whB)).toBeUndefined()
      expect(buildRow(sku, whB).inactivePreferredVendor).toBeNull()

      // Choosing another vendor for wh-001 clears the notice.
      setPreferredVendor(sku, b.vendorId, whA)
      invalidateReplenishmentCaches()
      expect(buildRow(sku, whA).inactivePreferredVendor).toBeNull()
    } finally {
      upsertVendorItem({ sku, vendorId: a.vendorId, active: true })
      clearPreferredVendorForWarehouse(sku, whA)
      clearPreferredVendorForWarehouse(sku, whB)
      invalidateReplenishmentCaches()
    }
  })
})
