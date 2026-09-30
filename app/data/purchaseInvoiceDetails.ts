import { purchaseInvoices } from './purchaseInvoices'
import { products } from './products'
import type { SalesOrderTotals } from './salesOrders'
import type { PurchaseInvoice, SalesOrderItem, SILineItem } from './types'

export type { SILineItem }

/**
 * Presentational detail for the Purchase Invoice *details* page. Mirrors
 * [salesInvoiceDetails.ts](salesInvoiceDetails.ts) / [salesQuoteDetails.ts](salesQuoteDetails.ts):
 * the base record in purchaseInvoices.ts stays the single source of truth, and
 * this file only adds the document chrome (addresses, line items, notes, linked
 * transactions, …).
 *
 * A PurchaseInvoice in purchaseInvoices.ts carries a hand-written `amount` and no
 * line items — so items here are *synthesised* from that amount: `buildItems`
 * targets the invoice's pre-tax value (amount / 1.11) and the tax line is the plug
 * that lands the grand total exactly on `invoice.amount` (what the index shows),
 * so the index row and the detail view always agree.
 */

const TAX_RATE = 0.11
const TAX_LABEL = 'PPN 11%'

export interface PIAttachment { name: string; sizeKB: number }

export interface PILinkedTxn {
  date: string          // ISO
  type: string          // "Purchase Order"
  number: string        // "#10118"
  status: string        // mapped via ErpStatusBadge
}

export interface PurchaseInvoiceDetail extends PurchaseInvoice {
  email: string[]
  billingAddress: string
  shipTo: string
  paymentTerms: string
  referenceNo: string       // source purchase order, e.g. "PO #10090"
  warehouse: string
  lineItems: SILineItem[]
  message: string
  memo: string
  attachments: PIAttachment[]
  totals: SalesOrderTotals
  lastUpdatedBy: string
  lastUpdatedAt: string
  linkedTransactions: PILinkedTxn[]
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
const WAREHOUSES = ['Default warehouse', 'Cibinong warehouse', 'Pulogadung DC', 'Bandung hub']
const PAYMENT_TERMS = ['Net 30', 'Net 14', 'Cash on delivery', 'Net 45']

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
function pick<T>(arr: T[], i: number): T { return arr[i % arr.length]! }
function emailFor(name: string): string[] {
  const slug = name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12) || 'vendor'
  return [`hello@${slug}.com`, `finance@${slug}.com`]
}

/**
 * Synthesised line items that target the invoice's pre-tax value (amount / 1.11).
 * The tax line (see totals below) is the plug that makes the grand total equal
 * `invoice.amount` exactly, so the detail and the index never disagree.
 *
 * Each line derives a realistic bulk qty first, then backs out a unit price so the
 * line amount lands on its portion — subtotal ≈ preTax, so the tax plug
 * (amount − subtotal) stays a positive ~11%, never negative even for a small
 * record total.
 */
function buildItems(invoice: PurchaseInvoice, idx: number): SILineItem[] {
  const preTax = Math.round(invoice.amount / (1 + TAX_RATE))
  const a = pick(products, idx)
  const b = pick(products, idx + 3)
  const portionA = Math.round(preTax * 0.6)
  const portionB = preTax - portionA   // portionA + portionB === preTax exactly

  const mk = (p: typeof products[number], portion: number, qtySeed: number): SILineItem => {
    const qty = Math.max(1, qtySeed)
    const unitPrice = Math.max(1, Math.round(portion / qty))
    return {
      product: p.name,
      sku: p.code,
      description: p.category,
      qty,
      unit: p.unit,
      unitPrice,
      discountPct: 0,
      amount: qty * unitPrice,
      taxLabel: TAX_LABEL,
    }
  }

  return [mk(a, portionA, 5 + (idx % 20)), mk(b, portionB, 3 + (idx % 12))]
}

/**
 * A purchase invoice is raised against a purchase order — link back to it. A
 * settled (paid) invoice additionally shows its payment voucher.
 */
function buildLinked(invoice: PurchaseInvoice, idx: number): PILinkedTxn[] {
  const linked: PILinkedTxn[] = [
    { date: addDays(invoice.date, -4), type: 'Purchase Order', number: `#${10090 + idx}`, status: 'closed' },
  ]
  if (invoice.status === 'paid') {
    linked.push({ date: addDays(invoice.dueDate, -2), type: 'Payment Voucher', number: `#${60000 + idx}`, status: 'paid' })
  }
  return linked
}

function buildDetail(base: PurchaseInvoice, idx: number): PurchaseInvoiceDetail {
  const lineItems = buildItems(base, idx)
  const subtotal = lineItems.reduce((s, it) => s + it.amount, 0)
  const totals: SalesOrderTotals = {
    subtotal,
    discountPerLine: 0,
    globalDiscount: 0,
    taxLabel: TAX_LABEL,
    taxAmount: base.amount - subtotal,   // plug so grand total === index amount
    shippingFee: 0,
    total: base.amount,
  }

  return {
    ...base,
    email: emailFor(base.vendor.name),
    billingAddress: pick(BILLING_ADDRESSES, idx),
    shipTo: pick(SHIP_TO, idx),
    paymentTerms: pick(PAYMENT_TERMS, idx),
    referenceNo: `PO #${10090 + idx}`,
    warehouse: pick(WAREHOUSES, idx),
    lineItems,
    message: 'Please deliver against the referenced purchase order. Confirm receipt on arrival.',
    memo: 'Booked against the approved purchase order.',
    attachments: [{ name: `${base.number}-Signed.pdf`, sizeKB: 78 }],
    totals,
    lastUpdatedBy: 'Rizal Candra',
    lastUpdatedAt: `${base.date}T11:00:00+07:00`,
    linkedTransactions: buildLinked(base, idx),
    banner: base.status === 'overdue'
      ? { message: 'This invoice is past its due date.', linkLabel: 'Record payment' }
      : null,
  }
}

/** Look up a full detail record by PurchaseInvoice id; falls back to the first invoice. */
export function getPurchaseInvoiceDetail(id: string): PurchaseInvoiceDetail {
  const i = purchaseInvoices.findIndex(inv => inv.id === id)
  const idx = i >= 0 ? i : 0
  return buildDetail(purchaseInvoices[idx]!, idx)
}
