/**
 * Conversion rounding (Vendor Supply Profile Rule 43): the smallest valid qty ≥ the
 * need — at or below MoQ → MoQ; above → MoQ + n × multiple; no MoQ → n × multiple;
 * no multiple → max(MoQ, need); neither → the need unchanged.
 */
import { describe, it, expect } from 'vitest'
import { applyMoqAndPack } from '~/data/replenishment'
import type { VendorItem } from '~/data/vendorItems'

const vi = (moq: number, packSize: number): VendorItem => ({
  id: 'x', vendorId: 'V', sku: 'S', isPreferred: true, leadTimeDays: 7, purchaseUnit: 'Unit',
  unitsPerPurchaseUnit: 1, moq, packSize, unitCost: 0, vendorSku: 'x', active: true,
})
const q = (need: number, moq: number, pack: number) => applyMoqAndPack(need, vi(moq, pack)).purchaseQty

describe('Rule 43', () => {
  it('matches the PRD examples (MoQ 100, multiple 25)', () => {
    expect(q(80, 100, 25)).toBe(100)
    expect(q(132, 100, 25)).toBe(150)
  })
  it('steps from MoQ when MoQ is not a multiple of the purchase multiple', () => {
    // 10 + 1 × 4 = 14, not the next multiple of 4 (16).
    expect(q(13, 10, 4)).toBe(14)
  })
  it('handles unset MoQ / multiple', () => {
    expect(q(13, 0, 4)).toBe(16)   // no MoQ → smallest n × multiple
    expect(q(13, 20, 0)).toBe(20)  // no multiple → max(MoQ, need)
    expect(q(23, 20, 0)).toBe(23)
    expect(q(13, 0, 0)).toBe(13)   // neither → need unchanged
  })
})
