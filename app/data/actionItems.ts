export interface ActionItem {
  id: string
  icon: string
  title: string
  /** Primary description line (default text color). */
  description: string
  /** Optional secondary line shown in danger/red — e.g. an overdue total. */
  amountText?: string
}

export const actionItems: ActionItem[] = [
  { id: 'reconciliation', icon: 'bank', title: 'Reconciliation', description: '100 transactions to reconcile' },
  { id: 'sales-orders', icon: 'sales', title: 'Sales orders', description: '15 overdue orders', amountText: 'Rp250.000.000,00 in total' },
  { id: 'sales-invoices', icon: 'sales', title: 'Sales invoices', description: '10 overdue invoices', amountText: 'Rp10.000.000,00 in total' },
  { id: 'purchase-orders', icon: 'cart', title: 'Purchase orders', description: '2 overdue orders', amountText: 'Rp1.000.000,00 in total' },
  { id: 'purchase-invoices', icon: 'cart', title: 'Purchase invoices', description: '6 overdue invoices', amountText: 'Rp89.000.000,00 in total' },
  { id: 'work-orders', icon: 'fulfillment', title: 'Work orders', description: '9 work orders not started' },
  { id: 'inventory-out-of-stock', icon: 'products', title: 'Inventory', description: '3 products out of stock' },
  { id: 'inventory-below-minimum', icon: 'products', title: 'Inventory', description: '10 products below minimum stock' },
]
