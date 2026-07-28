/**
 * Internal invariants for workOrderLinks (app/data/workOrderLinks.ts) — the linked
 * sales-order demand shown on a work order raised from a production request.
 *
 * NOTE: these link `number` strings ("Sales Order #20018", …) are demo fixtures in
 * the 200xx range and do NOT join to the real salesOrders catalog (numbers 10090–
 * 10189), so there is no cross-record coherence test to assert here. What IS
 * testable is each row's own consistency:
 *   • 0 ≤ fulfilledQty ≤ qtyToProduce
 *   • status is derived correctly from fulfilledQty vs qtyToProduce:
 *       fulfilledQty === 0            → 'not allocated'
 *       0 < fulfilledQty < qty        → 'partially fulfilled'
 *       fulfilledQty === qtyToProduce → 'fulfilled'
 *   • every row references a well-formed "Sales Order #N" number.
 */
import { describe, it, expect } from 'vitest'
import { workOrderLinks } from '~/data/workOrderLinks'

function expectedStatus(qty: number, fulfilled: number): string {
  if (fulfilled === 0) return 'not allocated'
  if (fulfilled === qty) return 'fulfilled'
  return 'partially fulfilled'
}

describe('workOrderLinks — per-row invariants', () => {
  it('fulfilledQty is within [0, qtyToProduce]', () => {
    for (const l of workOrderLinks) {
      expect(l.fulfilledQty).toBeGreaterThanOrEqual(0)
      expect(l.fulfilledQty).toBeLessThanOrEqual(l.qtyToProduce)
    }
  })

  it('status matches the fulfilled-vs-planned ratio', () => {
    for (const l of workOrderLinks) {
      expect(l.status).toBe(expectedStatus(l.qtyToProduce, l.fulfilledQty))
    }
  })

  it('every row references a well-formed "Sales Order #N" number', () => {
    for (const l of workOrderLinks) {
      expect(l.number).toMatch(/^Sales Order #\d+$/)
    }
  })
})
