import { stockAdjustments, adjustmentLineItems } from './stockAdjustments'
import { warehouseTransfers, transferLineItems } from './warehouseTransfers'
import { receipts } from './receipts'
import { outgoingOrders } from './outgoing'
import { TODAY_ISO } from './master'

/**
 * Aggregated transaction log for a warehouse.  Sources:
 *   • stockAdjustments (kind='count'  → Stock Adjustment; kind='in-out' → Stock In/Out)
 *   • warehouseTransfers (warehouse as origin OR destination)
 *   • receipts.purchaseNo   → Purchase Order
 *   • outgoingOrders.salesNo → Sales Order
 *   • Sales Returns (synthetic, deterministic per warehouse)
 *
 * Number format: "Type Name #XXXXX" throughout — no RCV-/OUT-/PO- prefixes.
 * Each entry carries a `link` for client-side navigation to the source document.
 */

export type TransactionType =
  | 'Stock Adjustment'
  | 'Stock In/Out'
  | 'Warehouse Transfer'
  | 'Purchase Order'
  | 'Sales Order'
  | 'Sales Return'

export interface WarehouseTransaction {
  id: string
  /** ISO date string */
  date: string
  type: TransactionType
  /** Display number — always "Type #XXXXX" format */
  number: string
  status: string
  /** Number of distinct SKUs involved in this transaction */
  skuQty: number
  /** Vue Router path to the source document's detail page, or null if none exists. */
  link: string | null
}

export const TRANSACTION_TYPES: TransactionType[] = [
  'Stock Adjustment',
  'Stock In/Out',
  'Warehouse Transfer',
  'Purchase Order',
  'Sales Order',
  'Sales Return',
]

// Derive an integer seed from a string ID for deterministic offsets.
function numericSeed(id: string): number {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

// Shift an ISO date string by `days` days.
function shiftDate(iso: string, days: number): string {
  const d = new Date(iso.slice(0, 10))
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// Normalise any purchase-order number to "Purchase Order #XXXXX" format.
// ERP format "Purchase Order #10090" is kept as-is.
// Desty format "PO-2026-0142" is converted to "Purchase Order #0142".
function normalisePONumber(raw: string): string {
  if (raw.startsWith('Purchase Order #')) return raw
  const m = raw.match(/(\d+)$/)
  return m ? `Purchase Order #${m[1]}` : raw
}

/**
 * Return all transactions for a warehouse, sorted newest-first.
 * Computed live from the reactive source stores.
 */
export function getWarehouseTransactions(warehouseId: string): WarehouseTransaction[] {
  const out: WarehouseTransaction[] = []

  // ── Stock Adjustments ────────────────────────────────────────────────────────
  for (const a of stockAdjustments) {
    if (a.warehouseId !== warehouseId) continue
    if (a.status === 'awaiting approval') continue
    const type: TransactionType = a.kind === 'count' ? 'Stock Adjustment' : 'Stock In/Out'
    const number = a.kind === 'count'
      ? a.number.replace('Stock Count #', 'Stock Adjustment #')
      : a.number
    const link = a.kind === 'in-out'
      ? `/stock-adjustments/${a.id}?type=in-out`
      : `/stock-adjustments/${a.id}`
    out.push({ id: `adj-${a.id}`, date: a.date, type, number, status: a.status, skuQty: adjustmentLineItems(a).length, link })
  }

  // ── Warehouse Transfers ──────────────────────────────────────────────────────
  for (const t of warehouseTransfers) {
    if (t.originId !== warehouseId && t.destinationId !== warehouseId) continue
    if (t.status === 'awaiting approval') continue
    out.push({
      id: `transfer-${t.id}`,
      date: t.date,
      type: 'Warehouse Transfer',
      number: t.number,
      status: t.status,
      skuQty: transferLineItems(t).length,
      link: `/warehouse-transfers/${t.id}`,
    })
  }

  // ── Receipts → Purchase Order ────────────────────────────────────────────────
  for (const r of receipts) {
    if (r.warehouseId !== warehouseId) continue
    const seed = numericSeed(r.id)
    const orderDate = shiftDate(r.estimatedArrival, -(7 + (seed % 14)))
    out.push({
      id: `po-${r.id}`,
      date: orderDate,
      type: 'Purchase Order',
      number: normalisePONumber(r.purchaseNo),
      status: r.status === 'canceled' ? 'canceled' : 'completed',
      skuQty: r.skuQty,
      link: null,
    })
  }

  // ── Outgoing Orders → Sales Order / Outbound Delivery ───────────────────────
  for (const o of outgoingOrders) {
    if (o.warehouseId !== warehouseId) continue
    const isManual = o.source === 'Outbound delivery'
    const seed = numericSeed(o.id)
    const orderDate = isManual && o.transactionDate
      ? o.transactionDate.slice(0, 10)
      : shiftDate(o.dueDate, -(5 + (seed % 10)))
    out.push({
      id: `so-${o.id}`,
      date: orderDate,
      type: 'Sales Order',
      number: o.salesNo,
      status: o.status === 'canceled' ? 'canceled' : 'completed',
      skuQty: o.skuQty,
      link: isManual ? `/outbound-delivery/${o.id}` : null,
    })
  }

  // ── Sales Returns (synthetic) ─────────────────────────────────────────────────
  const whSeed = numericSeed(warehouseId)
  const returnCount = 2 + (whSeed % 4)
  for (let i = 0; i < returnCount; i++) {
    const daysAgo = 5 + ((whSeed * 7 + i * 13) % 45)
    const date = shiftDate(TODAY_ISO, -daysAgo)
    const seq = 20000 + (whSeed % 1000) * 10 + i
    out.push({
      id: `sr-${warehouseId}-${i}`,
      date,
      type: 'Sales Return',
      number: `Sales Return #${seq}`,
      status: 'completed',
      skuQty: 1 + ((whSeed * 3 + i * 7) % 5),
      link: null,
    })
  }

  return out.sort((a, b) => b.date.localeCompare(a.date))
}
