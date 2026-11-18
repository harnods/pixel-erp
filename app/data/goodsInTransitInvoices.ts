/**
 * Supplier invoices billed BEFORE the goods arrived — Goods-in-Transit (Vendor Supply
 * Profile RS-020 / Rule 32).
 *
 * An invoice is a money event, not a stock event. Billing a PO early must not:
 *  • release its In-Transit — the qty stays incoming until it is actually received;
 *  • count as a receipt for lead time — lead time is measured PO → first receipt.
 * The engine already behaves that way by construction (In-Transit drops only on
 * received qty, lead time reads receipts), so this record exists to make the state
 * VISIBLE: the worklist and the Suggested qty drawer say "invoiced, not received"
 * instead of leaving a buyer to wonder why paid-for stock still counts as incoming.
 *
 * Keyed by the purchase number the receipt / PO carries. The AP invoice list in this
 * prototype is generated with no PO links, so the demo invoice lives here.
 */

export interface GoodsInTransitInvoice {
  number: string
  vendorName: string
  /** The PO it bills, as receipts and POs carry it (e.g. "Purchase Order #10091"). */
  purchaseNo: string
  /** Invoice date, ISO, on the stock clock (before the goods are received). */
  date: string
}

export const goodsInTransitInvoices: GoodsInTransitInvoice[] = [
  // Tanamera billed PO #10091 two days before the as-of date; its receipt into
  // Gudang Surabaya Timur (RCV-2026-0002) is still open, so the qty is still in transit.
  { number: 'PINV-2026-GIT-001', vendorName: 'Tanamera Coffee Roastery', purchaseNo: 'Purchase Order #10091', date: '2026-06-24' },
]

/** The invoice billed against this purchase before receipt, if any. */
export function goodsInTransitInvoiceFor(purchaseNo: string | undefined): GoodsInTransitInvoice | undefined {
  if (!purchaseNo) return undefined
  return goodsInTransitInvoices.find((i) => i.purchaseNo === purchaseNo)
}
