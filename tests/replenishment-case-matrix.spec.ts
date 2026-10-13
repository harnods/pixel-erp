import { describe, it, expect, beforeEach } from 'vitest'
import { replenishmentWorklist, invalidateReplenishmentCaches } from '~/data/replenishment'
import { leadTimeSamplesFor } from '~/data/leadTimeHistory'
import { purchaseOrders } from '~/data/purchaseOrders'
import { receipts } from '~/data/receipts'
import { CURATED_LEAD_TIME_DOCS } from '~/data/replenishmentLeadTimeDemo'

/**
 * The demo data must exercise the full lead-time × demand matrix so every state is
 * demonstrable out of the box (US-001 / US-002 / D22):
 *   lead time : computed (real docs) · category (estimated) · none → Needs setup
 *   demand    : none → Needs setup   · provisional          · mature
 * and a computed row's "Export purchases (CSV)" must cite GENUINE, openable POs/receipts.
 */
describe('replenishment case matrix — every lead × demand state is reachable', () => {
  beforeEach(() => invalidateReplenishmentCaches())

  const wl = () => replenishmentWorklist('all')

  it('To order covers computed/category lead time with mature and provisional demand', () => {
    const rows = wl().rows as any[]
    const has = (p: (r: any) => boolean) => rows.some(p)
    // Real (computed) lead time + mature demand
    expect(has((r) => r.leadTimeTier === 'computed' && r.velocity.source === 'computed' && !r.velocity.provisional)).toBe(true)
    // Real (computed) lead time + provisional demand
    expect(has((r) => r.leadTimeTier === 'computed' && r.velocity.provisional)).toBe(true)
    // Estimated (category) lead time
    expect(has((r) => r.leadTimeTier === 'category')).toBe(true)
  })

  it('Needs setup covers no-lead-time and no-demand, out of the box (fallback = Not set)', () => {
    const ns = wl().needsSetup as any[]
    // No lead time at all → routed to Needs setup with a "Lead time" reason
    expect(ns.some((r) => r.leadTimeTier === 'none' && r.missing.includes('Lead time'))).toBe(true)
    // No demand at all → routed to Needs setup with a "Sales history" reason
    expect(ns.some((r) => r.flags.noDemand && r.missing.includes('Sales history'))).toBe(true)
  })

  it('the hero cells resolve to computed lead time from GENUINE, openable documents', () => {
    const rows = wl().rows as any[]
    const cells = [...new Set(CURATED_LEAD_TIME_DOCS.map((d) => `${d.vendorId}|${d.sku}|${d.warehouseId}`))]
    expect(cells.length).toBe(3)
    for (const cell of cells) {
      const [vendorId, sku, warehouseId] = cell.split('|')
      const row = rows.find((r) => r.sku === sku && r.warehouseId === warehouseId)
      expect(row, `${sku}@${warehouseId} should be on To order`).toBeTruthy()
      expect(row.leadTimeTier).toBe('computed')
      const samples = leadTimeSamplesFor(vendorId!, sku!, warehouseId!).filter((s) => !s.excluded && s.leadDays >= 1)
      // At least the minimum, and every sample is a REAL document (never "(modelled)").
      expect(samples.length).toBeGreaterThanOrEqual(2)
      expect(samples.every((s) => !!s.poNumber && !!s.receiptNumber)).toBe(true)
      // Those documents actually exist in Purchases and WMS (openable).
      for (const s of samples) {
        expect(purchaseOrders.some((po) => po.number === s.poNumber)).toBe(true)
        expect(receipts.some((r) => r.number === s.receiptNumber)).toBe(true)
      }
    }
  })
})
