import { salesDeliveries } from './salesDeliveries'
import { products } from './products'
import type { SalesOrderTotals } from './salesOrders'
import type { SalesDelivery, SalesOrderItem } from './types'

/**
 * Presentational detail for the Sales Delivery *details* page. A SalesDelivery in
 * salesDeliveries.ts is intentionally lightweight (no line items) — this file
 * synthesises coherent line items + shipping chrome deterministically from the
 * delivery's id/index, so the index row and the detail view always agree on the
 * grand total: the synthesised items target the delivery's pre-tax value and the
 * tax line is the plug that lands the grand total exactly on `delivery.total`.
 */

const TAX_RATE = 0.11
const TAX_LABEL = 'PPN 11%'

export type SDLineItem = SalesOrderItem & { taxLabel: string }

export interface SDAttachment { name: string; sizeKB: number }

export interface SDLinkedTxn {
  date: string          // ISO
  type: string          // "Sales Order" | "Sales Invoice"
  number: string        // "#10118"
  status: string        // mapped via ErpStatusBadge
}

export interface SalesDeliveryDetail extends SalesDelivery {
  email: string[]
  billingAddress: string
  shipTo: string
  shipVia: string
  trackingNo: string
  driver: string
  referenceNo: string
  warehouse: string
  lineItems: SDLineItem[]
  message: string
  memo: string
  attachments: SDAttachment[]
  totals: SalesOrderTotals
  lastUpdatedBy: string
  lastUpdatedAt: string
  linkedTransactions: SDLinkedTxn[]
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
const DRIVERS = ['Agus Salim', 'Bambang Wijaya', 'Cahya Nugraha', 'Dedi Kurnia']
const WAREHOUSES = ['Default warehouse', 'Cibinong warehouse', 'Pulogadung DC', 'Bandung hub']
const UPDATERS = ['Rizal Candra', 'Dewi Anggraini', 'Bram Sitohang', 'Nadia Puspita']

function pick<T>(arr: T[], i: number): T { return arr[i % arr.length]! }

function emailFor(name: string): string[] {
  const slug = name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12) || 'customer'
  return [`hello@${slug}.com`, `finance@${slug}.com`]
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Two coffee line items targeting the delivery's pre-tax value (total / 1.11).
 * The tax line (see totals) is the plug that makes the grand total equal
 * `delivery.total` exactly, so the detail and the index never disagree.
 */
function buildItems(delivery: SalesDelivery, idx: number): SDLineItem[] {
  const preTax = Math.round(delivery.total / (1 + TAX_RATE))
  const a = pick(products, idx)
  const b = pick(products, idx + 5)
  const portionA = Math.round(preTax * 0.55)
  const portionB = preTax - portionA   // portionA + portionB === preTax exactly

  // Derive a realistic bulk qty, then back out a unit price so each line amount
  // lands on its portion — subtotal ≈ preTax, so the tax plug (total − subtotal)
  // stays a positive ~11%, never negative even when the record total is small.
  const mk = (p: typeof products[number], portion: number, qtySeed: number): SDLineItem => {
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

  return [mk(a, portionA, 6 + (idx % 18)), mk(b, portionB, 4 + (idx % 10))]
}

/**
 * A delivery always originates from a sales order; once billed it also links to
 * the resulting sales invoice.
 */
function buildLinked(delivery: SalesDelivery, idx: number): SDLinkedTxn[] {
  const order: SDLinkedTxn = {
    date: addDays(delivery.date, -2),
    type: 'Sales Order',
    number: `#${10090 + idx}`,
    status: 'closed',
  }
  if (delivery.billingStatus !== 'invoiced') return [order]
  const invoice: SDLinkedTxn = {
    date: addDays(delivery.date, 1),
    type: 'Sales Invoice',
    number: `#${40000 + idx}`,
    status: 'open',
  }
  return [order, invoice]
}

function buildDetail(base: SalesDelivery, idx: number): SalesDeliveryDetail {
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
  const delivered = base.fulfillmentStatus === 'delivered'

  return {
    ...base,
    email: emailFor(base.customer.name),
    billingAddress: pick(BILLING_ADDRESSES, idx),
    shipTo: pick(SHIP_TO, idx),
    shipVia: pick(SHIP_VIA, idx),
    trackingNo: base.fulfillmentStatus === 'direct' ? '—' : `TRK${String(100000 + idx * 7).slice(0, 8)}`,
    driver: pick(DRIVERS, idx),
    referenceNo: `SO-${10090 + idx}`,
    warehouse: pick(WAREHOUSES, idx),
    lineItems,
    message: 'Please inspect the goods on arrival and confirm receipt with the driver.',
    memo: 'Handle coffee machines with care — fragile.',
    attachments: [{ name: `DO-${20001 + idx}-Signed.pdf`, sizeKB: 82 }],
    totals,
    lastUpdatedBy: pick(UPDATERS, idx),
    lastUpdatedAt: `${base.date}T11:00:00+07:00`,
    linkedTransactions: buildLinked(base, idx),
    banner: delivered
      ? null
      : { message: 'This delivery is currently in transit.', linkLabel: 'Track shipment' },
  }
}

/** Look up a full delivery detail by SalesDelivery id; falls back to the first. */
export function getSalesDeliveryDetail(id: string): SalesDeliveryDetail {
  const i = salesDeliveries.findIndex(d => d.id === id)
  const idx = i >= 0 ? i : 0
  return buildDetail(salesDeliveries[idx]!, idx)
}
