import { salesOrders, computeTotals, type SalesOrderTotals } from './salesOrders'
import type { SalesOrder, SalesOrderItem } from './types'

/**
 * Presentational detail for the Sales Order *details* page. The numbers (items,
 * totals, balance) come straight from the base order in salesOrders.ts — this file
 * only adds the document chrome (addresses, notes, linked transactions, …) so the
 * index row and the detail view always agree.
 */

const TAX_LABEL = 'PPN 11%'

export type SOLineItem = SalesOrderItem & { taxLabel: string }

export interface SOAttachment { name: string; sizeKB: number }

export interface SOLinkedTxn {
  date: string          // ISO
  type: string          // "Sales Invoice", "Sales Delivery"
  number: string        // "#40018"
  status: string        // mapped via ErpStatusBadge
}

export interface SalesOrderDetail extends SalesOrder {
  email: string[]
  billingAddress: string
  shipTo: string
  shipDate: string
  shipVia: string
  trackingNo: string
  referenceNo: string
  paymentTerms: string
  warehouse: string
  lineItems: SOLineItem[]
  message: string
  memo: string
  attachments: SOAttachment[]
  totals: SalesOrderTotals
  lastUpdatedBy: string
  lastUpdatedAt: string
  linkedTransactions: SOLinkedTxn[]
  banner: { message: string; linkLabel: string } | null
}

const BILLING_ADDRESSES = [
  'Jl. Anggrek No. 25, Kebayoran Baru, Jakarta Selatan, 12130, DKI Jakarta',
  'Jl. Gatot Subroto Kav. 18, Setiabudi, Jakarta Selatan, 12950, DKI Jakarta',
  'Jl. Diponegoro No. 4, Menteng, Jakarta Pusat, 10310, DKI Jakarta',
  'Jl. Asia Afrika No. 8, Sudirman, Jakarta Pusat, 10270, DKI Jakarta',
]
const SHIP_TO = [
  'Jl. Sindang III/5, Kompleks Pertamina, DKI Jakarta 12820',
  'Gudang Blok C No. 12, Kawasan Industri Pulogadung, Jakarta Timur',
  'Jl. Raya Bogor KM 30, Cibinong, Bogor, Jawa Barat',
  'Ruko Sentra Niaga No. 7, Bintaro, Tangerang Selatan',
]
const SHIP_VIA = ['Sentral Cargo', 'JNE Trucking', 'SiCepat Gokil', 'Internal fleet']
const WAREHOUSES = ['Default warehouse', 'Cibinong warehouse', 'Pulogadung DC', 'Bandung hub']
const PAYMENT_TERMS = ['Net 30', 'Net 14', 'Cash on delivery', 'Net 45']

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
function pick<T>(arr: T[], i: number): T { return arr[i % arr.length] }
function emailFor(name: string): string[] {
  const slug = name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12) || 'customer'
  return [`hello@${slug}.com`, `finance@${slug}.com`]
}

/**
 * Linked transactions follow the order's real state:
 *  - voided / open      → nothing processed yet → none
 *  - partially processed → delivered + an OPEN invoice (balance still due)
 *  - closed              → delivered + a PAID invoice (no balance → no open invoice)
 */
function buildLinked(order: SalesOrder, idx: number): SOLinkedTxn[] {
  if (order.status === 'voided' || order.status === 'open') return []
  const delivery: SOLinkedTxn = {
    date: addDays(order.date, 1),
    type: 'Sales Delivery',
    number: `#${30000 + idx}`,
    status: order.status === 'closed' ? 'delivered' : 'unbilled',
  }
  const invoice: SOLinkedTxn = {
    date: addDays(order.date, 2),
    type: 'Sales Invoice',
    number: `#${40000 + idx}`,
    status: order.balanceDue > 0 ? 'open' : 'paid',
  }
  return [delivery, invoice]
}

function buildDetail(base: SalesOrder, idx: number): SalesOrderDetail {
  const lineItems: SOLineItem[] = base.items.map(it => ({ ...it, taxLabel: TAX_LABEL }))
  const totals = computeTotals(base.items, base.globalDiscount, base.shippingFee)
  const voided = base.status === 'voided'

  return {
    ...base,
    email: emailFor(base.customer.name),
    billingAddress: pick(BILLING_ADDRESSES, idx),
    shipTo: pick(SHIP_TO, idx),
    shipDate: addDays(base.date, -3),
    shipVia: pick(SHIP_VIA, idx),
    trackingNo: idx % 4 === 0 ? '—' : `TRK${String(100000 + idx * 7).slice(0, 8)}`,
    referenceNo: `PO-${92000 + idx}`,
    paymentTerms: pick(PAYMENT_TERMS, idx),
    warehouse: pick(WAREHOUSES, idx),
    lineItems,
    message: 'After making the payment, please confirm via WhatsApp:\n+6281299999999. Thank you.',
    memo: 'Shortage of stock taken from the Cibinong warehouse.',
    attachments: [{ name: `PO-${92000 + idx}-Signed.pdf`, sizeKB: 78 }],
    totals,
    lastUpdatedBy: 'Rizal Candra',
    lastUpdatedAt: `${base.date}T11:00:00+07:00`,
    linkedTransactions: buildLinked(base, idx),
    banner: voided
      ? null
      : { message: 'This sales order is being processed in fulfillment.', linkLabel: 'View in fulfillment' },
  }
}

/** Look up a full detail record by SalesOrder id; falls back to the first order. */
export function getSalesOrderDetail(id: string): SalesOrderDetail {
  const i = salesOrders.findIndex(so => so.id === id)
  const idx = i >= 0 ? i : 0
  return buildDetail(salesOrders[idx], idx)
}
