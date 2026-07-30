/**
 * Linked transactions for a work order raised *from a production request*.
 *
 * The default work order flow has no linked transactions; the production-request
 * flow carries the sales orders whose demand this work order fulfils. Kept separate
 * from the core work order dataset so the default pages stay untouched.
 *
 * Each link points at a REAL sales order (`salesOrders.ts`) via `salesOrderId`, so
 * the manufacturing → sales chain resolves end to end — `number` is just the
 * display label derived from that same record.
 */
import { salesOrders } from './salesOrders'

export interface WorkOrderLink {
  /** FK into the sales orders master (`salesOrders.ts`). */
  salesOrderId: string
  number: string        // 'Sales Order #10187' — derived from the linked sales order
  qtyToProduce: number
  fulfilledQty: number
  unit: string
  dueDate: string       // ISO — inherited from the linked sales order
  /** Row status — mapped through ErpStatusBadge on the detail page. */
  status: 'not allocated' | 'partially fulfilled' | 'fulfilled'
}

// Three real sales orders this production-request work order fulfils. Picked from
// the tail of the catalogue so they don't collide with the dispatch↔sales-order
// links; each link inherits the order's number + due date from the real record.
const LINKED = [
  { index: 97, qtyToProduce: 1, fulfilledQty: 0, status: 'not allocated' as const },
  { index: 98, qtyToProduce: 4, fulfilledQty: 2, status: 'partially fulfilled' as const },
  { index: 99, qtyToProduce: 5, fulfilledQty: 5, status: 'fulfilled' as const },
]

export const workOrderLinks: WorkOrderLink[] = LINKED.map((l) => {
  const so = salesOrders[l.index]!
  return {
    salesOrderId: so.id,
    number: `Sales Order #${so.number}`,
    qtyToProduce: l.qtyToProduce,
    fulfilledQty: l.fulfilledQty,
    unit: 'Pcs',
    dueDate: so.dueDate,
    status: l.status,
  }
})
