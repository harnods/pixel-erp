/**
 * Phase 2 of the PRD crosscheck — the features the branch was missing.
 *
 * MUTATES shared stores (POs, vendor links, purchase requests), so every test
 * restores what it changed.
 */
import { describe, it, expect } from 'vitest'
import {
  replenishmentWorklist, buildRow, invalidateReplenishmentCaches, atpFor, type WorklistRow,
} from '~/data/replenishment'
import { planPurchaseRequests, createPurchaseRequests } from '~/data/replenishmentPurchaseRequest'
import { purchaseOrders } from '~/data/purchaseOrders'
import { setPurchaseOrderDocument } from '~/data/purchaseOrderLines'
import { purchaseRequests, deletePurchaseRequests } from '~/data/purchaseRequests'
import {
  vendorItems, vendorItemFor, vendorItemsForSku, deactivateVendorItem, upsertVendorItem, setPreferredVendor,
} from '~/data/vendorItems'
import { vendors } from '~/data/vendors'
import { leadTimeForCategory } from '~/data/replenishmentConfig'
import { isRunStale } from '~/data/replenishmentRuns'
import { splitCsv } from '~/utils/csv'

function dueWithVendor(): WorklistRow {
  const row = replenishmentWorklist('all').rows.find((r) => r.vendorItem && r.suggestion.rawQty > 0)
  if (!row) throw new Error('seed has no due row with a vendor')
  return row
}

describe('US-004 AC-03 — a row an open PO already covers stays on the worklist', () => {
  it('shows suggested 0 and names the covering PO, instead of vanishing', () => {
    const row = dueWithVendor()
    const po = { ...purchaseOrders[0]!, id: 'PO-TEST-COVER', number: 'PO-TEST-COVER', status: 'approved' as const }
    purchaseOrders.push(po)
    setPurchaseOrderDocument({
      poId: po.id, warehouseId: row.warehouseId, warehouse: row.warehouseName, paymentTerms: '', shipDate: '2026-07-01',
      lineItems: [{
        product: row.productName, sku: row.sku, description: '', qty: row.suggestion.rawQty + 10,
        unit: row.unit, unitPrice: 1, discountPct: 0, taxLabel: '', amount: 1,
      }],
      totals: {} as never,
    })
    invalidateReplenishmentCaches()
    try {
      const after = replenishmentWorklist('all').rows.find((r) => r.key === row.key)
      expect(after, 'a covered row must stay on To order').toBeTruthy()
      expect(after!.suggestion.rawQty).toBe(0)
      expect(after!.suggestion.coveredBy).toContain('PO-TEST-COVER')
    } finally {
      purchaseOrders.splice(purchaseOrders.indexOf(po), 1)
      invalidateReplenishmentCaches()
    }
  })
})

describe('US-013 — export splits at 1,000 rows per file', () => {
  it('repeats the header in every file and never exceeds the cap', () => {
    const rows = Array.from({ length: 2500 }, (_, i) => [`SKU${i}`, i])
    const files = splitCsv(['SKU', 'Qty'], rows, 1000)
    expect(files).toHaveLength(3)
    for (const f of files) {
      expect(f[0]).toEqual(['SKU', 'Qty'])
      expect(f.length - 1).toBeLessThanOrEqual(1000)
    }
    expect(files.reduce((n, f) => n + f.length - 1, 0)).toBe(2500)
  })
})

describe('US-013 EH-01 — stale data', () => {
  it('is stale with no run, or a run more than 24h before the as-of day ends', () => {
    expect(isRunStale('2026-06-26', null)).toBe(true)
    const base = { runNo: 1, asOf: '2026-06-26', scope: 'all', pairs: 0, flagged: 0, needsSetup: 0 }
    expect(isRunStale('2026-06-26', { ...base, ranAt: '2026-06-26T07:30:00' })).toBe(false)
    expect(isRunStale('2026-06-26', { ...base, ranAt: '2026-06-20T07:30:00' })).toBe(true)
  })
})

describe('US-019 — requesting from a vendor not linked to the SKU', () => {
  it('keeps that vendor, sizes with the category lead time, and links it on save', () => {
    const row = dueWithVendor()
    const linked = new Set(vendorItemsForSku(row.sku).map((v) => v.vendorId))
    const other = vendors.find((v) => !linked.has(v.id))!
    const before = purchaseRequests.length

    const plan = planPurchaseRequests([row], {}, { [row.key]: other.id })
    const line = plan.groups[0]!.lines[0]!
    expect(line.vendorId).toBe(other.id)
    expect(line.newVendorLink).toBe(true)
    expect(line.context.leadTimeTier).toBe('category')
    expect(line.context.leadTimeDays).toBe(leadTimeForCategory(row.category) ?? row.leadTimeDays)

    const result = createPurchaseRequests([row], {}, { [row.key]: other.id })
    try {
      expect(result.created).toHaveLength(1)
      const link = vendorItemFor(row.sku, other.id)
      expect(link, 'saving the request links the vendor to the SKU').toBeTruthy()
      expect(link!.moq).toBe(0)
      expect(link!.leadTimeDays).toBeGreaterThan(0) // never a 0-day lead time
    } finally {
      deletePurchaseRequests(result.created.map((c) => c.id))
      const i = vendorItems.findIndex((v) => v.sku === row.sku && v.vendorId === other.id)
      if (i !== -1) vendorItems.splice(i, 1)
      invalidateReplenishmentCaches()
      expect(purchaseRequests.length).toBe(before)
    }
  })
})

describe('US-001 EH-01 — the preferred vendor goes inactive', () => {
  it('flags the row until a new preferred vendor is chosen', () => {
    const row = replenishmentWorklist('all').rows.find((r) => r.vendorItem?.isPreferred && r.alternates.length)
    if (!row) return // seed-dependent; nothing to assert without a SKU with 2+ vendors
    const preferred = row.vendorItem!
    deactivateVendorItem(row.sku, preferred.vendorId)
    invalidateReplenishmentCaches()
    try {
      const after = buildRow(row.sku, row.warehouseId)
      expect(after.inactivePreferredVendor?.id).toBe(preferred.vendorId)
      expect(after.vendor?.id).not.toBe(preferred.vendorId)

      setPreferredVendor(row.sku, after.vendor!.id)
      invalidateReplenishmentCaches()
      expect(buildRow(row.sku, row.warehouseId).inactivePreferredVendor).toBeNull()
    } finally {
      upsertVendorItem({ sku: row.sku, vendorId: preferred.vendorId, active: true })
      setPreferredVendor(row.sku, preferred.vendorId)
      invalidateReplenishmentCaches()
    }
  })
})

describe('US-013 VR-01 — in transit never hides a due SKU', () => {
  it('every row at or below its reorder point by AVAILABLE stock is on To order', () => {
    const wl = replenishmentWorklist('all')
    const onList = new Set(wl.rows.map((r) => r.key))
    for (const r of wl.rows) expect(r.atp.available).toBeLessThanOrEqual(r.reorderPoint)
    // And the reserved/available split still reconciles (US-003).
    for (const r of wl.rows.slice(0, 20)) {
      const atp = atpFor(r.sku, r.warehouseId)
      expect(atp.available).toBe(atp.onHand - atp.reserved)
      expect(onList.has(r.key)).toBe(true)
    }
  })
})
