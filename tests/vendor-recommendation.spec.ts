/**
 * Airene preferred-vendor recommendation (VendorItemDrawer).
 *
 * Guards the scoring contract: it ranks on the four buyer signals, normalises cost
 * and MOQ across differing purchase units, always names exactly one recommendation,
 * and explains it.
 */
import { describe, it, expect } from 'vitest'
import { recommendPreferredVendor, VENDOR_SIGNAL_WEIGHTS } from '~/data/vendorRecommendation'
import type { VendorCandidate } from '~/data/vendorRecommendation'

const SKU = '1001'

function c(vendorId: string, patch: Partial<VendorCandidate> = {}): VendorCandidate {
  return { vendorId, leadTimeDays: 14, moq: 1, unitCost: 1_000_000, unitsPerPurchaseUnit: 1, ...patch }
}

describe('recommendPreferredVendor', () => {
  it('weights sum to 1', () => {
    const total = Object.values(VENDOR_SIGNAL_WEIGHTS).reduce((s, w) => s + w, 0)
    expect(total).toBeCloseTo(1)
  })

  it('names no recommendation for an empty list', () => {
    expect(recommendPreferredVendor(SKU, []).recommendedVendorId).toBeNull()
  })

  it('a vendor that wins every signal is recommended', () => {
    const r = recommendPreferredVendor(SKU, [
      c('V001', { leadTimeDays: 10, moq: 2, unitCost: 900_000 }),
      c('V002', { leadTimeDays: 40, moq: 20, unitCost: 1_500_000 }),
    ])
    expect(r.recommendedVendorId).toBe('V001')
    const best = r.scores.find((s) => s.isRecommended)!
    expect(best.reasons.length).toBeGreaterThan(0)
    // exactly one recommendation
    expect(r.scores.filter((s) => s.isRecommended)).toHaveLength(1)
  })

  it('normalises cost and MOQ by purchase unit before comparing', () => {
    // V001: 1,000,000 for 1 unit = 1,000,000/base. V002: 18,000,000 per pallet of
    // 20 = 900,000/base — cheaper per base unit despite the bigger sticker price.
    const r = recommendPreferredVendor(SKU, [
      c('V001', { leadTimeDays: 20, unitCost: 1_000_000, unitsPerPurchaseUnit: 1, moq: 1 }),
      c('V002', { leadTimeDays: 20, unitCost: 18_000_000, unitsPerPurchaseUnit: 20, moq: 1 }),
    ])
    const v2 = r.scores.find((s) => s.vendorId === 'V002')!
    expect(v2.costPerBase).toBe(900_000)
    expect(v2.priceScore).toBe(1) // cheaper per base ⇒ best price signal
  })

  it('the recommended vendor is always ranked first', () => {
    const r = recommendPreferredVendor(SKU, [
      c('V002', { leadTimeDays: 40 }),
      c('V001', { leadTimeDays: 10 }),
    ])
    expect(r.scores[0]!.vendorId).toBe(r.recommendedVendorId)
  })
})
