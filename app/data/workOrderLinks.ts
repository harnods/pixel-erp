/**
 * Linked transactions for a work order raised *from a production request*.
 *
 * The default work order flow has no linked transactions; the production-request
 * flow carries the sales orders whose demand this work order fulfils. Kept separate
 * from the core work order dataset so the default pages stay untouched.
 */

export interface WorkOrderLink {
  number: string        // 'Sales Order #20018'
  qtyToProduce: number
  fulfilledQty: number
  unit: string
  dueDate: string       // ISO
  /** Row status — mapped through ErpStatusBadge on the detail page. */
  status: 'not allocated' | 'partially fulfilled' | 'fulfilled'
}

export const workOrderLinks: WorkOrderLink[] = [
  { number: 'Sales Order #20018', qtyToProduce: 1, fulfilledQty: 0, unit: 'Pcs', dueDate: '2026-06-09', status: 'not allocated' },
  { number: 'Sales Order #20015', qtyToProduce: 4, fulfilledQty: 2, unit: 'Pcs', dueDate: '2026-06-13', status: 'partially fulfilled' },
  { number: 'Sales Order #20010', qtyToProduce: 5, fulfilledQty: 5, unit: 'Pcs', dueDate: '2026-06-18', status: 'fulfilled' },
]
