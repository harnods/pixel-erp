import { salesQuotes } from './salesQuotes'
import { products } from './products'
import type { SalesOrderTotals } from './salesOrders'
import type { SalesQuote, SalesOrderItem } from './types'

/**
 * Presentational detail for the Sales Quote *details* page. A SalesQuote in
 * salesQuotes.ts is intentionally lightweight (no line items) — this file
 * synthesises coherent line items + document chrome (addresses, notes, totals)
 * deterministically from the quote's id/index, so the index row and the detail
 * view always agree on the grand total: the synthesised items target the quote's
 * pre-tax value and the tax line is the plug that lands the grand total exactly
 * on `quote.total` (what the index shows).
 */

const TAX_RATE = 0.11
const TAX_LABEL = 'PPN 11%'

export type SQLineItem = SalesOrderItem & { taxLabel: string }

export interface SQAttachment { name: string; sizeKB: number }

export interface SQLinkedTxn {
  date: string          // ISO
  type: string          // "Sales Order"
  number: string        // "#10118"
  status: string        // mapped via ErpStatusBadge
}

export interface SalesQuoteDetail extends SalesQuote {
  email: string[]
  billingAddress: string
  shipTo: string
  referenceNo: string
  paymentTerms: string
  warehouse: string
  salesperson: string
  lineItems: SQLineItem[]
  message: string
  memo: string
  attachments: SQAttachment[]
  totals: SalesOrderTotals
  lastUpdatedBy: string
  lastUpdatedAt: string
  linkedTransactions: SQLinkedTxn[]
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
const SALESPEOPLE = ['Rizal Candra', 'Dewi Anggraini', 'Bram Sitohang', 'Nadia Puspita']

function pick<T>(arr: T[], i: number): T { return arr[i % arr.length]! }

function emailFor(name: string): string[] {
  const slug = name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12) || 'customer'
  return [`hello@${slug}.com`, `finance@${slug}.com`]
}

/**
 * Two coffee line items that target the quote's pre-tax value (total / 1.11).
 * The tax line (see totals below) is the plug that makes the grand total equal
 * `quote.total` exactly, so the detail and the index never disagree.
 */
function buildItems(quote: SalesQuote, idx: number): SQLineItem[] {
  const preTax = Math.round(quote.total / (1 + TAX_RATE))
  const a = pick(products, idx)
  const b = pick(products, idx + 3)
  const portionA = Math.round(preTax * 0.6)
  const portionB = preTax - portionA   // portionA + portionB === preTax exactly

  // Derive a realistic bulk qty, then back out a unit price so each line amount
  // lands on its portion — subtotal ≈ preTax, so the tax plug (total − subtotal)
  // stays a positive ~11%, never negative even when the record total is small.
  const mk = (p: typeof products[number], portion: number, qtySeed: number): SQLineItem => {
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
 * A quote that has been accepted (`closed`) has been converted to a sales order;
 * `open` quotes are still pending; `declined` quotes went nowhere.
 */
function buildLinked(quote: SalesQuote, idx: number): SQLinkedTxn[] {
  if (quote.status !== 'closed') return []
  return [{
    date: quote.date,
    type: 'Sales Order',
    number: `#${10090 + idx}`,
    status: 'open',
  }]
}

function buildDetail(base: SalesQuote, idx: number): SalesQuoteDetail {
  const lineItems = buildItems(base, idx)
  const subtotal = lineItems.reduce((s, it) => s + it.amount, 0)
  const totals: SalesOrderTotals = {
    subtotal,
    discountPerLine: 0,
    globalDiscount: 0,
    taxLabel: TAX_LABEL,
    taxAmount: base.total - subtotal,   // plug so grand total === index total
    shippingFee: 0,
    total: base.total,
  }

  return {
    ...base,
    email: emailFor(base.customer.name),
    billingAddress: pick(BILLING_ADDRESSES, idx),
    shipTo: pick(SHIP_TO, idx),
    referenceNo: `RFQ-${92000 + idx}`,
    paymentTerms: pick(PAYMENT_TERMS, idx),
    warehouse: pick(WAREHOUSES, idx),
    salesperson: pick(SALESPEOPLE, idx),
    lineItems,
    message: 'This quote is valid until the expiration date above. Prices are subject to stock availability.',
    memo: 'Follow up with the customer two days before expiration.',
    attachments: [{ name: `RFQ-${92000 + idx}.pdf`, sizeKB: 64 }],
    totals,
    lastUpdatedBy: pick(SALESPEOPLE, idx),
    lastUpdatedAt: `${base.date}T11:00:00+07:00`,
    linkedTransactions: buildLinked(base, idx),
    banner: base.status === 'closed'
      ? { message: 'This quote has been converted to a sales order.', linkLabel: 'View sales order' }
      : null,
  }
}

/** Look up a full quote detail by SalesQuote id; falls back to the first quote. */
export function getSalesQuoteDetail(id: string): SalesQuoteDetail {
  const i = salesQuotes.findIndex(q => q.id === id)
  const idx = i >= 0 ? i : 0
  return buildDetail(salesQuotes[idx]!, idx)
}
