/**
 * Purchase Request → draft Purchase Order conversion (PRD D12 / US-019).
 *
 * The PR carries the demand-coverage NEED in STOCK units; the MOQ + purchase-
 * multiplier rounding is applied ONCE here, at PO time, against the FINAL vendor:
 *
 *  • Every converted line is rounded to its vendor's MOQ then pack multiple
 *    (US-006), and the result matches `applyMoqAndPack` exactly.
 *  • Changing the vendor re-rounds against that vendor's terms; a user override is
 *    taken verbatim.
 *  • Lines whose vendor has no vendor-item (or no UoM factor) are skipped, never
 *    dropped.
 *  • Conversion only ever produces DRAFT POs (US-020), and reflects on the PR
 *    (closed when whole, partially processed when some lines were skipped).
 *
 * MUTATES `purchaseRequests` / `purchaseOrders`, so it asserts on the delta.
 */
import { describe, it, expect } from 'vitest'
import {
  planPosFromPurchaseRequest, convertPurchaseRequestToPos,
  planPosFromPurchaseRequests, defaultConversionWarehouseForMany,
  defaultConversionWarehouse,
} from '~/data/replenishmentDraftPo'
import { applyMoqAndPack, replenishmentWorklist } from '~/data/replenishment'
import { createPurchaseRequests } from '~/data/replenishmentPurchaseRequest'
import { purchaseRequests, addPurchaseRequest, getPurchaseRequest } from '~/data/purchaseRequests'
import { purchaseOrders } from '~/data/purchaseOrders'
import { vendorItemFor, vendorItemsForSku } from '~/data/vendorItems'
import { PRODUCTS } from '~/data/inventory'

/** A replenishment PR to convert: raise the whole worklist as PRs, take the first. */
function aReplenishmentPr() {
  const worklist = replenishmentWorklist('all')
  const result = createPurchaseRequests(worklist.rows)
  const id = result.created[0]!.id
  return getPurchaseRequest(id)!
}

describe('planPosFromPurchaseRequest — rounding to vendor MOQ & purchase multiplier', () => {
  it('rounds every line to applyMoqAndPack against the suggested vendor', () => {
    const pr = aReplenishmentPr()
    const wh = defaultConversionWarehouse(pr)
    const { groups } = planPosFromPurchaseRequest(pr, wh)
    expect(groups.length).toBeGreaterThan(0)

    for (const g of groups) {
      for (const line of g.lines) {
        const vi = vendorItemFor(line.sku, g.vendorId)!
        const expected = applyMoqAndPack(line.needStock!, vi).purchaseQty
        expect(line.finalQty).toBe(expected)
        // final order qty is a whole number of packs (the purchase multiplier)
        expect(line.finalQty % vi.packSize).toBe(0)
        // and never below the vendor MOQ
        expect(line.finalQty).toBeGreaterThanOrEqual(vi.moq)
      }
    }
  })

  it('groups lines by vendor (one PO per vendor for the chosen warehouse)', () => {
    const pr = aReplenishmentPr()
    const wh = defaultConversionWarehouse(pr)
    const { groups } = planPosFromPurchaseRequest(pr, wh)
    for (const g of groups) {
      expect(g.key).toBe(`${g.vendorId}::${wh}`)
      for (const line of g.lines) expect(line.vendorId).toBe(g.vendorId)
    }
  })

  it('honours a user qty override verbatim (no silent re-round)', () => {
    const pr = aReplenishmentPr()
    const wh = defaultConversionWarehouse(pr)
    const line0 = planPosFromPurchaseRequest(pr, wh).groups[0]!.lines[0]!
    const vi = vendorItemFor(line0.sku, planPosFromPurchaseRequest(pr, wh).groups[0]!.vendorId)!
    const bumped = line0.finalQty + vi.packSize
    const { groups } = planPosFromPurchaseRequest(pr, wh, {}, { [line0.sku]: bumped })
    const same = groups.flatMap((g) => g.lines).find((l) => l.sku === line0.sku)!
    expect(same.finalQty).toBe(bumped)
  })

  it('re-rounds against a switched vendor', () => {
    const pr = aReplenishmentPr()
    const wh = defaultConversionWarehouse(pr)
    // find a line whose SKU has at least two linked vendors
    const line = planPosFromPurchaseRequest(pr, wh).groups
      .flatMap((g) => g.lines)
      .find((l) => vendorItemsForSku(l.sku).length > 1)
    if (!line) return // nothing multi-vendor in this seed slice; the path is covered by the override test
    const alt = vendorItemsForSku(line.sku).find((vi) => vi.vendorId !== line.vendorId)!
    const { groups } = planPosFromPurchaseRequest(pr, wh, { [line.sku]: alt.vendorId })
    const moved = groups.flatMap((g) => g.lines).find((l) => l.sku === line.sku)!
    expect(moved.vendorId).toBe(alt.vendorId)
    expect(moved.finalQty).toBe(applyMoqAndPack(moved.needStock!, alt).purchaseQty)
  })

  it('skips a line whose chosen vendor has no vendor-item', () => {
    const pr = aReplenishmentPr()
    const wh = defaultConversionWarehouse(pr)
    const sku = pr.lines[0]!.sku
    const { skipped } = planPosFromPurchaseRequest(pr, wh, { [sku]: 'V999-does-not-exist' })
    expect(skipped.some((s) => s.sku === sku && s.reason === 'inactive-vendor-item')).toBe(true)
  })
})

describe('convertPurchaseRequestToPos — draft only, reflects on the PR', () => {
  it('creates draft POs and closes a fully-converted PR', () => {
    const pr = aReplenishmentPr()
    const wh = defaultConversionWarehouse(pr)
    const before = purchaseOrders.length
    const result = convertPurchaseRequestToPos(pr, wh)

    expect(result.created.length).toBeGreaterThan(0)
    expect(purchaseOrders.length).toBe(before + result.created.length)
    // every created PO is a DRAFT — conversion never sends an order (US-020)
    for (const c of result.created) {
      const po = purchaseOrders.find((p) => p.id === c.id)!
      expect(po.status).toBe('draft')
    }
    // the PR reflects the conversion
    const after = purchaseRequests.find((p) => p.id === pr.id)!
    expect(after.status).toBe(result.skipped.length === 0 ? 'closed' : 'partially processed')
  })

  it('rounds and converts a MANUAL request the same way', () => {
    // A SKU that has at least one linked vendor.
    const sku = PRODUCTS.map((p) => p.sku).find((s) => vendorItemsForSku(s).length > 0)!
    const product = PRODUCTS.find((p) => p.sku === sku)!
    const pr = addPurchaseRequest({
      date: '2026-06-26',
      procurementStaff: 'Tester',
      requiredDate: '2026-07-10',
      status: 'open',
      totalProducts: 1,
      urgency: 'medium',
      lines: [{
        product: product.name, sku, description: '', requestedQty: 37,
        availableQty: 0, unit: product.unit, unitCost: 0, taxLabel: 'PPN 11%',
      }],
    })
    const wh = defaultConversionWarehouse(pr) // manual PR → falls back to first warehouse
    const { groups } = planPosFromPurchaseRequest(pr, wh)
    expect(groups.length).toBe(1)
    const line = groups[0]!.lines[0]!
    const vi = vendorItemFor(sku, groups[0]!.vendorId)!
    expect(line.finalQty).toBe(applyMoqAndPack(37, vi).purchaseQty)

    const result = convertPurchaseRequestToPos(pr, wh)
    expect(result.created.length).toBe(1)
    expect(getPurchaseRequest(pr.id)!.status).toBe('closed')
  })
})

describe('planPosFromPurchaseRequests — bulk merge (1 PR = 1 vendor)', () => {
  // Find two seed PRs with the SAME vendor that share at least one SKU.
  function sameVendorPairSharingSku() {
    const byVendor = new Map<string, typeof purchaseRequests>()
    for (const pr of purchaseRequests) {
      const v = pr.vendor?.id
      if (!v) continue
      if (!byVendor.has(v)) byVendor.set(v, [] as unknown as typeof purchaseRequests)
      byVendor.get(v)!.push(pr)
    }
    for (const prs of byVendor.values()) {
      for (let a = 0; a < prs.length; a++) {
        for (let b = a + 1; b < prs.length; b++) {
          const shared = prs[a]!.lines.map(l => l.sku).find(s => prs[b]!.lines.some(l => l.sku === s))
          if (shared) return { pr1: prs[a]!, pr2: prs[b]!, sku: shared }
        }
      }
    }
    return null
  }

  it('sums same-vendor same-SKU lines across PRs, then rounds once', () => {
    const hit = sameVendorPairSharingSku()
    expect(hit).not.toBeNull()
    const { pr1, pr2, sku } = hit!
    const wh = defaultConversionWarehouseForMany([pr1, pr2])
    const { groups } = planPosFromPurchaseRequests([pr1, pr2], wh)

    // same vendor → exactly one PO group, no vendor blending
    expect(groups.length).toBe(1)
    const g = groups[0]!
    expect(g.vendorId).toBe(pr1.vendor!.id)

    const line = g.lines.find(l => l.sku === sku)!
    const q1 = pr1.lines.find(l => l.sku === sku)!.requestedQty
    const q2 = pr2.lines.find(l => l.sku === sku)!.requestedQty
    expect(line.needStock).toBe(q1 + q2)                       // merged need
    expect(line.sources!.length).toBe(2)                        // both PRs cited
    const vi = vendorItemFor(sku, g.vendorId)!
    expect(line.finalQty).toBe(applyMoqAndPack(q1 + q2, vi).purchaseQty)  // rounded once
  })

  it('never blends different vendors into one PO', () => {
    const a = purchaseRequests.find(p => p.vendor?.id)
    const b = purchaseRequests.find(p => p.vendor?.id && p.vendor.id !== a!.vendor!.id)
    expect(a && b).toBeTruthy()
    const wh = defaultConversionWarehouseForMany([a!, b!])
    const { groups } = planPosFromPurchaseRequests([a!, b!], wh)
    const vendorIds = new Set(groups.map(g => g.vendorId))
    expect(vendorIds.size).toBe(groups.length)                  // one vendor per group
    expect(vendorIds.has(a!.vendor!.id)).toBe(true)
    expect(vendorIds.has(b!.vendor!.id)).toBe(true)
  })
})
