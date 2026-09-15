import { computeTotals, type SalesOrderTotals } from './salesOrders'
import { salesInvoices } from './salesInvoices'
import { getSalesInvoiceEdit } from './salesInvoiceEdits'
import { CATALOG } from './catalog'
import type { SalesInvoice, SalesOrderItem, SILineItem } from './types'

export type { SILineItem }

/**
 * Presentational detail for the Sales Invoice *details* page. Mirrors
 * [salesOrderDetails.ts](salesOrderDetails.ts): the base record in
 * salesInvoices.ts stays the single source of truth, and this file only adds the
 * document chrome (addresses, line items, notes, linked transactions, …).
 *
 * Sales invoices — unlike sales orders — are authored with a hand-written
 * `total` and no line items, so the items here are *derived from* that total:
 * `buildItems` splits the invoice's tax-exclusive base across `itemCount`
 * catalogue lines, which keeps `computeTotals(lineItems).total === invoice.total`
 * so the index row and the detail view always agree.
 */

const TAX_LABEL = 'PPN 11%'
const TAX_RATE = 0.11

export interface SIAttachment { name: string; sizeKB: number }

export interface SILinkedTxn {
  date: string          // ISO
  type: string          // "Sales Order", "Sales Delivery", "Payment Receipt"
  number: string        // "#10090"
  status: string        // mapped via ErpStatusBadge
}

export interface SIPayment {
  date: string          // ISO
  method: string        // "Bank transfer", "Cash", …
  reference: string
  amount: number        // IDR
}

export interface SalesInvoiceDetail extends SalesInvoice {
  email: string[]
  billingAddress: string
  shipTo: string
  paymentTerms: string
  referenceNo: string       // source sales order, e.g. "SO #10090"
  warehouse: string
  lineItems: SILineItem[]
  message: string
  memo: string
  attachments: SIAttachment[]
  totals: SalesOrderTotals
  amountPaid: number
  payments: SIPayment[]
  lastUpdatedBy: string
  lastUpdatedAt: string
  linkedTransactions: SILinkedTxn[]
  banner: { message: string; linkLabel: string } | null
}

/** Catalogue lines, same master catalog the sales orders use. */
const PRODUCTS: Omit<SalesOrderItem, 'qty' | 'discountPct' | 'amount'>[] = CATALOG.map(item => ({
  product: item.name,
  sku: item.sku,
  description: item.desc,
  unit: item.unit,
  unitPrice: item.price,
}))

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
const PAYMENT_METHODS = ['Bank transfer', 'Virtual account', 'Cash', 'Giro']

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
function pick<T>(arr: T[], i: number): T { return arr[i % arr.length]! }
function emailFor(name: string): string[] {
  const slug = name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12) || 'customer'
  return [`hello@${slug}.com`, `finance@${slug}.com`]
}

/**
 * The tax-exclusive base that reproduces `total` exactly under `computeTotals`
 * (total = base + round(base × 11%)). Starts from the algebraic estimate and
 * walks ±1 to absorb the rounding, so the invoice total is hit on the nose.
 */
function baseForTotal(total: number): number {
  const start = Math.round(total / (1 + TAX_RATE))
  for (let delta = 0; delta <= 4; delta++) {
    for (const base of [start + delta, start - delta]) {
      if (base > 0 && base + Math.round(base * TAX_RATE) === total) return base
    }
  }
  return start
}

/** Smallest catalogue unit price — bounds how far the closing line can overshoot. */
export const MIN_CATALOG_PRICE = PRODUCTS.reduce((lo, p) => Math.min(lo, p.unitPrice), Infinity)

/**
 * The whole-unit catalogue line that lands closest to `shortfall` without
 * falling short. Searching the catalogue (rather than always reaching for the
 * cheapest SKU) keeps the leftover far smaller — it can never exceed the
 * cheapest unit price, and in practice is a tiny fraction of that.
 */
function closingLine(shortfall: number): SalesOrderItem {
  let best: SalesOrderItem | null = null
  let bestOvershoot = Infinity
  for (const p of PRODUCTS) {
    const qty = Math.max(1, Math.ceil(shortfall / p.unitPrice))
    const amount = qty * p.unitPrice
    const overshoot = amount - shortfall
    if (overshoot >= 0 && overshoot < bestOvershoot) {
      bestOvershoot = overshoot
      best = { ...p, qty, discountPct: 0, amount }
    }
  }
  return best!
}

/**
 * Fill up to `targetBase` with catalogue lines at their REAL catalogue prices
 * (never a synthesised price — a made-up unit price on a real SKU reads as a
 * data bug the moment anyone cross-checks it against the product page).
 *
 * Lines are added at natural quantities until the next one would overshoot, then
 * `closingLine` covers the shortfall. That last step overshoots by less than one
 * unit of the cheapest product, and the caller books the small excess as the
 * invoice's global discount — so the totals land exactly on the invoice's own
 * total with every unit price left honest.
 */
function buildItems(idx: number, count: number, targetBase: number): SalesOrderItem[] {
  const items: SalesOrderItem[] = []
  let acc = 0

  for (let j = 0; j < count - 1; j++) {
    const p = PRODUCTS[(idx * 5 + j * 7) % PRODUCTS.length]!
    // machines/sacks come in small qty; consumables in larger qty
    const big = p.unitPrice >= 2_000_000
    const qty = big ? 1 + ((idx + j) % 2) : 1 + ((idx + j * 3) % 12)
    const discountPct = (j % 5 === 3) ? 10 : (j % 7 === 5 ? 5 : 0)
    const amount = Math.round(qty * p.unitPrice * (1 - discountPct / 100))
    // skip (rather than stop at) a line that won't fit — a cheaper one further
    // down the rotation still can, so the invoice keeps a realistic line count
    if (acc + amount >= targetBase) continue
    items.push({ ...p, qty, discountPct, amount })
    acc += amount
  }

  items.push(closingLine(targetBase - acc))
  return items
}

/**
 * Linked transactions follow the invoice's real state:
 *  - every invoice is raised from a sales order that has been delivered
 *  - a settled invoice (balance 0) additionally shows its payment receipt
 */
function buildLinked(inv: SalesInvoice, idx: number): SILinkedTxn[] {
  const linked: SILinkedTxn[] = [
    { date: addDays(inv.date, -4), type: 'Sales Order',    number: `#${10090 + idx}`, status: 'closed'    },
    { date: addDays(inv.date, -1), type: 'Sales Delivery', number: `#${30000 + idx}`, status: 'delivered' },
  ]
  if (inv.balance === 0) {
    linked.push({ date: addDays(inv.dueDate, -2), type: 'Payment Receipt', number: `#${50000 + idx}`, status: 'paid' })
  }
  return linked
}

function buildDetail(base: SalesInvoice, idx: number): SalesInvoiceDetail {
  // No-PPN invoices have nothing to back tax out of — the items sum straight
  // to the invoice total, and computeTotals runs at a 0% rate so taxAmount
  // lands on exactly Rp0 (not just visually hidden).
  const targetBase = base.hasPpn ? baseForTotal(base.total) : base.total
  const items = buildItems(idx, Math.max(1, base.itemCount), targetBase)
  // the closing line overshoots slightly (see buildItems) — booked as the
  // order-level discount, which lands the tax base exactly on targetBase
  const globalDiscount = items.reduce((s, it) => s + it.amount, 0) - targetBase
  const totals = computeTotals(items, globalDiscount, 0, base.hasPpn ? undefined : 0)
  const amountPaid = base.total - base.balance

  const payments: SIPayment[] = amountPaid > 0
    ? [{
        date: addDays(base.dueDate, -2),
        method: pick(PAYMENT_METHODS, idx),
        reference: `TRF-${String(700000 + idx * 13)}`,
        amount: amountPaid,
      }]
    : []

  return {
    ...base,
    email: emailFor(base.customer.name),
    billingAddress: pick(BILLING_ADDRESSES, idx),
    shipTo: pick(SHIP_TO, idx),
    paymentTerms: pick(PAYMENT_TERMS, idx),
    referenceNo: `SO #${10090 + idx}`,
    warehouse: pick(WAREHOUSES, idx),
    lineItems: items.map(it => ({ ...it, taxLabel: base.hasPpn ? TAX_LABEL : 'No PPN' })),
    message: 'After making the payment, please confirm via WhatsApp:\n+6281299999999. Thank you.',
    memo: 'Invoiced against the delivered sales order.',
    attachments: [{ name: `${base.number}-Signed.pdf`, sizeKB: 78 }],
    totals,
    amountPaid,
    payments,
    lastUpdatedBy: 'Rizal Candra',
    lastUpdatedAt: `${base.date}T11:00:00+07:00`,
    linkedTransactions: buildLinked(base, idx),
    banner: base.status === 'overdue'
      ? { message: 'This invoice is past its due date.', linkLabel: 'Send reminder' }
      : null,
  }
}

/**
 * Apply the user's edit overlay (salesInvoiceEdits.ts) on top of the generated
 * detail. Totals are RECOMPUTED from the edited line items rather than trusted
 * from the overlay, so the header total, the tax base and the line rows can
 * never disagree — which is exactly what PRD-05's change detection diffs on.
 */
function applyEdit(detail: SalesInvoiceDetail, id: string): SalesInvoiceDetail {
  const edit = getSalesInvoiceEdit(id)
  if (!edit) return detail

  // Mixed per-line tax rates aren't modeled (the seed generator applies one rate
  // to the whole invoice) — any PPN-bearing line makes the invoice PPN-bearing.
  const hasPpn = edit.lineItems.some(it => /^ppn/i.test(it.taxLabel))
  const totals = computeTotals(edit.lineItems, edit.globalDiscount, edit.shippingFee, hasPpn ? undefined : 0)
  const amountPaid = Math.min(detail.amountPaid, totals.total)

  return {
    ...detail,
    customer: { ...edit.customer },
    date: edit.date,
    dueDate: edit.dueDate,
    hasPpn,
    email: [...edit.email],
    billingAddress: edit.billingAddress,
    shipTo: edit.shipTo,
    paymentTerms: edit.paymentTerms,
    referenceNo: edit.referenceNo,
    warehouse: edit.warehouse,
    tags: [...edit.tags],
    lineItems: edit.lineItems.map(it => ({ ...it })),
    itemCount: edit.lineItems.length,
    message: edit.message,
    memo: edit.memo,
    attachments: edit.attachments.map(a => ({ ...a })),
    hasAttachment: edit.attachments.length > 0,
    totals,
    total: totals.total,
    amountPaid,
    balance: totals.total - amountPaid,
    lastUpdatedBy: edit.editedBy,
    lastUpdatedAt: edit.editedAt,
  }
}

/**
 * Look up a full detail record by SalesInvoice id; falls back to the first invoice.
 *
 * Pass `{ pristine: true }` for the invoice as originally issued, with the user's
 * edit overlay left off — the "before" side of PRD-05's tax change detection when
 * an issued tax document predates this feature and carries no snapshot of its own.
 */
export function getSalesInvoiceDetail(id: string, opts: { pristine?: boolean } = {}): SalesInvoiceDetail {
  const i = salesInvoices.findIndex(inv => inv.id === id)
  const idx = i >= 0 ? i : 0
  const detail = buildDetail(salesInvoices[idx]!, idx)
  return opts.pristine ? detail : applyEdit(detail, detail.id)
}
