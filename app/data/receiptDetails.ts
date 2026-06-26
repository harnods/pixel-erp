import { receipts, type Receipt } from './receipts'
import { lineItemsForReceipt, type ReceiptLineItem } from './receiptLineItems'
import { getPurchaseReceivingsForReceipt } from './purchaseReceivings'
import { picForWarehouse } from './warehouses'
import { VENDORS } from './master'

/** Assembled view model for the inbound PO (receipt) detail page. */
export interface ReceiptDetail {
  id: string
  purchaseNo: string
  transactionDate: string      // ISO — synthesized ~30 days before arrival
  estimatedArrival: string     // ISO
  shipVia: string
  vendor: string
  trackingNos: string[]
  warehouseName: string
  lineItems: ReceiptLineItem[]
  memo: string
  attachments: { name: string; sizeKB: number }[]
  lastUpdatedBy: string
  lastUpdatedAt: string         // ISO datetime
  /** Staff member who received the goods (partial/completed receipts). */
  receivedBy?: string
}

function shiftDays(iso: string, days: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function hash(id: string): number {
  return id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
}

/** Build the detail view model for a receipt id, from the prototype's mock data. */
export function getReceiptDetail(id: string): ReceiptDetail | null {
  const r: Receipt | undefined = receipts.find((x) => x.id === id)
  if (!r) return null
  const h = hash(r.id)
  // PO is raised ~30 days before the goods are due to arrive.
  const transactionDate = shiftDays(r.estimatedArrival, -30)
  return {
    id: r.id,
    purchaseNo: r.purchaseNo,
    transactionDate,
    estimatedArrival: r.estimatedArrival,
    shipVia: '—',
    vendor: VENDORS[h % VENDORS.length]!,
    trackingNos: r.trackingNos,
    warehouseName: r.warehouseName,
    lineItems: lineItemsForReceipt(r),
    memo: r.memo ?? '—',
    // Most POs carry one supporting document.
    attachments: h % 4 === 0 ? [] : [{ name: 'sample-filename.pdf', sizeKB: 128 }],
    lastUpdatedBy: picForWarehouse(r.warehouseId, 0),
    lastUpdatedAt: `${shiftDays(transactionDate, -1)}T11:00:00`,
    receivedBy: getPurchaseReceivingsForReceipt(r.id).find((pr) => pr.status === 'completed')?.assignee
      ?? picForWarehouse(r.warehouseId, 0),
  }
}
