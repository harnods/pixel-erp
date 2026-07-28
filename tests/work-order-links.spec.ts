/**
 * Internal invariants for workOrderLinks (app/data/workOrderLinks.ts) — the linked
 * sales-order demand shown on a work order raised from a production request.
 *
 * Each link now carries a real `salesOrderId` FK into the salesOrders catalog, so
 * the manufacturing → sales chain resolves end to end. Tested here:
 *   • salesOrderId resolves to a real salesOrders record; number + dueDate match it
 *   • 0 ≤ fulfilledQty ≤ qtyToProduce
 *   • status is derived correctly from fulfilledQty vs qtyToProduce:
 *       fulfilledQty === 0            → 'not allocated'
 *       0 < fulfilledQty < qty        → 'partially fulfilled'
 *       fulfilledQty === qtyToProduce → 'fulfilled'
 */
import { describe, it, expect } from 'vitest'
import { workOrderLinks } from '~/data/workOrderLinks'
import { salesOrders } from '~/data/salesOrders'

function expectedStatus(qty: number, fulfilled: number): string {
  if (fulfilled === 0) return 'not allocated'
  if (fulfilled === qty) return 'fulfilled'
  return 'partially fulfilled'
}

describe('workOrderLinks — sales-order FK resolves', () => {
  it('every link joins a real sales order; number + dueDate match it', () => {
    for (const l of workOrderLinks) {
      const so = salesOrders.find((s) => s.id === l.salesOrderId)
      expect(so, `salesOrderId ${l.salesOrderId} should resolve`).toBeTruthy()
      expect(l.number).toBe(`Sales Order #${so!.number}`)
      expect(l.dueDate).toBe(so!.dueDate)
    }
  })
})

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
