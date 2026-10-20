/**
 * Purchase returns against received PO lines (Vendor Supply Profile RS-009 / Rule 52).
 *
 * Returning goods does NOT re-open In-Transit by default — the line stays received for
 * that qty, because nothing more is coming. Only when purchasing marks a return
 * "replacement expected" does the returned qty re-open as outstanding and count as
 * incoming again. Either way a return never touches lead time: the PO's first receipt
 * stands (Rule 14).
 *
 * The prototype has no Purchase Return document module yet, so the demo returns live
 * here, keyed by the receipt and SKU they return against.
 */

export interface PurchaseReturn {
  number: string
  vendorName: string
  /** The PO the goods were received against, as receipts carry it. */
  purchaseNo: string
  receiptId: string
  receiptNumber: string
  warehouseId: string
  sku: string
  /** Returned qty, in the receipt line's unit. */
  qty: number
  /** Return date, ISO, on the stock clock. */
  date: string
  /** Purchasing expects the vendor to send replacements — the qty is incoming again. */
  replacementExpected: boolean
}

export const purchaseReturns: PurchaseReturn[] = [
  // Damaged bags from Anomali's PO #069 into Gudang Jakarta Pusat: replacements are
  // coming, so the 10 count as in transit again.
  {
    number: 'PRET-2026-001', vendorName: 'Anomali Coffee', purchaseNo: '#PO069',
    receiptId: 'rcv-010', receiptNumber: 'RCV-2026-0010', warehouseId: 'wh-001',
    sku: '1101', qty: 10, date: '2026-06-25', replacementExpected: true,
  },
  // Same delivery, a straight return with no replacement: nothing re-opens.
  {
    number: 'PRET-2026-002', vendorName: 'Anomali Coffee', purchaseNo: '#PO069',
    receiptId: 'rcv-010', receiptNumber: 'RCV-2026-0010', warehouseId: 'wh-001',
    sku: '1005', qty: 6, date: '2026-06-25', replacementExpected: false,
  },
]

/** Returns against one receipt line. */
export function purchaseReturnsForReceiptLine(receiptId: string, sku: string): PurchaseReturn[] {
  return purchaseReturns.filter((r) => r.receiptId === receiptId && r.sku === sku)
}

/** Every return of this SKU from this warehouse — for the Suggested qty drawer. */
export function purchaseReturnsFor(sku: string, warehouseId: string): PurchaseReturn[] {
  return purchaseReturns.filter((r) => r.sku === sku && r.warehouseId === warehouseId)
}
