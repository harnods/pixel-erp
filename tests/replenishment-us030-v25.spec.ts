/**
 * US-030 additions from PRD v23–v25.
 *  • A partially converted request keeps its unconverted remainder in Requested qty;
 *    only the converted part leaves it (VR-03).
 *  • A fully requested line is not skipped: it pre-fills 0 and is flagged (EH-02).
 */
import { describe, it, expect } from 'vitest'
import {
  replenishmentWorklist, requestedOpenPrQty, invalidateReplenishmentCaches, buildRow,
} from '~/data/replenishment'
import { createPurchaseRequests, planPurchaseRequests } from '~/data/replenishmentPurchaseRequest'
import { convertPurchaseRequestToPos, defaultConversionWarehouse } from '~/data/replenishmentDraftPo'
import { getPurchaseRequest, deletePurchaseRequests } from '~/data/purchaseRequests'

function dueRowWithVendor() {
  invalidateReplenishmentCaches()
  return replenishmentWorklist('all').rows.find((r) => r.vendorItem && r.suggestion.rawQty > 2 && r.requestedQty === 0)!
}

describe('US-030 with partial conversion', () => {
  it('only the converted part leaves Requested qty', () => {
    const row = dueRowWithVendor()
    const res = createPurchaseRequests([row], { [row.key]: 1000 })
    const prId = res.created[0]!.id
    try {
      invalidateReplenishmentCaches()
      expect(requestedOpenPrQty(row.sku, row.warehouseId)).toBe(1000)
      const pr = getPurchaseRequest(prId)!
      // Convert one purchase unit only.
      convertPurchaseRequestToPos(pr, defaultConversionWarehouse(pr), {}, { [row.sku]: 1 })
      invalidateReplenishmentCaches()
      const after = getPurchaseRequest(prId)!
      expect(after.status).toBe('partially processed')
      const converted = after.lines[0]!.convertedQty!
      expect(requestedOpenPrQty(row.sku, row.warehouseId)).toBe(1000 - converted)
    } finally {
      deletePurchaseRequests([prId])
      invalidateReplenishmentCaches()
    }
  })
})

describe('US-030 EH-02 — fully requested line', () => {
  it('stays in the request at 0 with the requested / suggested figures', () => {
    const row = dueRowWithVendor()
    const res = createPurchaseRequests([row], { [row.key]: row.suggestion.rawQty })
    const prId = res.created[0]!.id
    try {
      invalidateReplenishmentCaches()
      const fresh = buildRow(row.sku, row.warehouseId)
      expect(fresh.remainingToRequest).toBe(0)
      const plan = planPurchaseRequests([fresh])
      expect(plan.skipped).toHaveLength(0)
      const line = plan.groups[0]!.lines[0]!
      expect(line.finalQty).toBe(0)
      expect(line.fullyRequested).toEqual({ requested: fresh.requestedQty, suggested: fresh.suggestion.rawQty })
    } finally {
      deletePurchaseRequests([prId])
      invalidateReplenishmentCaches()
    }
  })
})
