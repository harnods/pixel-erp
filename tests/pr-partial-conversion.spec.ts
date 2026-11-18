/**
 * Partial PR → PO conversion (Vendor Supply Profile RS-003 / Rule 41).
 *
 * A PR line is open, partially converted, converted or closed. A line converted for
 * less than requested stays partially converted until the rest is converted or the
 * request is closed — and a converted line is never ordered twice.
 */
import { describe, it, expect } from 'vitest'
import {
  planPosFromPurchaseRequest, convertPurchaseRequestToPos, defaultConversionWarehouse,
  prLineRemaining, prLineStatus, canConvertPurchaseRequest,
} from '~/data/replenishmentDraftPo'
import { addPurchaseRequest, getPurchaseRequest, updatePurchaseRequest } from '~/data/purchaseRequests'
import { vendorItemFor, vendorItemsForSku } from '~/data/vendorItems'
import { PRODUCTS } from '~/data/inventory'

/** A manual one-line request for a SKU whose vendor buys in single stock units. */
function oneLinePr(requestedQty: number) {
  const sku = PRODUCTS.map((p) => p.sku).find((s) => vendorItemsForSku(s).some((v) => v.unitsPerPurchaseUnit >= 1))!
  const product = PRODUCTS.find((p) => p.sku === sku)!
  const pr = addPurchaseRequest({
    date: '2026-06-26', procurementStaff: 'Tester', requiredDate: '2026-07-10', status: 'open',
    totalProducts: 1, urgency: 'medium',
    lines: [{ product: product.name, sku, description: '', requestedQty, availableQty: 0, unit: product.unit, unitCost: 0, taxLabel: 'PPN 11%' }],
  })
  return { pr, sku }
}

describe('Rule 41 — partial conversion', () => {
  it('converting less than requested leaves the line partially converted with the rest open', () => {
    const { pr, sku } = oneLinePr(10_000)
    const wh = defaultConversionWarehouse(pr)
    const { groups } = planPosFromPurchaseRequest(pr, wh)
    const vi = vendorItemFor(sku, groups[0]!.vendorId)!
    // Order just one purchase unit now.
    convertPurchaseRequestToPos(pr, wh, {}, { [sku]: 1 })

    const after = getPurchaseRequest(pr.id)!
    const line = after.lines[0]!
    expect(line.convertedQty).toBe(vi.unitsPerPurchaseUnit)
    expect(prLineRemaining(line)).toBe(10_000 - vi.unitsPerPurchaseUnit)
    expect(prLineStatus(after, line)).toBe('partially converted')
    expect(after.status).toBe('partially processed')
    expect(canConvertPurchaseRequest(after)).toBe(true)

    // The next conversion only plans what is left.
    const next = planPosFromPurchaseRequest(after, wh)
    expect(next.groups[0]!.lines[0]!.needStock).toBe(10_000 - vi.unitsPerPurchaseUnit)
  })

  it('a fully converted request is closed and offers nothing more to convert', () => {
    const { pr } = oneLinePr(5)
    const wh = defaultConversionWarehouse(pr)
    convertPurchaseRequestToPos(pr, wh)
    const after = getPurchaseRequest(pr.id)!
    expect(prLineStatus(after, after.lines[0]!)).toBe('converted')
    expect(after.status).toBe('closed')
    expect(canConvertPurchaseRequest(after)).toBe(false)
    expect(planPosFromPurchaseRequest(after, wh).groups).toHaveLength(0)
  })

  it('closing a partially converted request closes the rest of the line', () => {
    const { pr, sku } = oneLinePr(10_000)
    const wh = defaultConversionWarehouse(pr)
    convertPurchaseRequestToPos(pr, wh, {}, { [sku]: 1 })
    updatePurchaseRequest(pr.id, { status: 'closed' })
    const after = getPurchaseRequest(pr.id)!
    expect(prLineStatus(after, after.lines[0]!)).toBe('closed')
    expect(canConvertPurchaseRequest(after)).toBe(false)
  })
})
