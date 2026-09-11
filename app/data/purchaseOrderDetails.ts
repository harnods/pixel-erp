import { purchaseOrders } from './purchaseOrders'
import type { PurchaseOrder } from './types'

/**
 * Presentational detail for the Purchase Order *details* page. The grand total
 * comes straight from the base order in purchaseOrders.ts — this file only
 * synthesizes the document chrome (line items, addresses, notes, linked
 * transactions, …) so the index row and the detail view always agree
 * (detail.totals.total === base order total).
 */

const TAX_LABEL = 'PPN 11%'

export interface POLineItem {
  product: string
  sku: string
  description: string
  qty: number
  unit: string
  unitPrice: number
  discountPct: number
  taxLabel: string
  amount: number
  /** Demo-only dimension name -> value pairs (Settings > Dimensions line
   *  tagging) — this store is generated, not connected to real Dimension
   *  records, so it's name-keyed rather than id-keyed. */
  dimensions?: Record<string, string>
}

export interface POAttachment { name: string; sizeKB: number }

export interface POLinkedTxn {
  date: string          // ISO
  type: string          // "Purchase Invoice", "Purchase Delivery", "Purchase Order"
  number: string        // "#40018"
  status: string        // mapped via ErpStatusBadge
  orderId?: string      // set when the linked txn is another PO → clickable, jumps to its detail
}

export interface POTotals {
  subtotal: number
  discountPerLine: number
  globalDiscount: number
  taxLabel: string
  taxAmount: number
  shippingFee: number
  total: number
}

// ─── Approval log (title-bar [task] popover) ──────────────────────────────────
export interface POApprovalActor {
  name: string
  state: 'approved' | 'awaiting' | 'rejected'
  at?: string   // ISO — set for approved/rejected
}
export interface POApprovalStage {
  title: string     // "Approval stage 1"
  rule: string      // "Everyone must approve (1 of 2)"
  status: string    // mapped via ErpStatusBadge
  actors: POApprovalActor[]
}
export interface POApprovalLog {
  requestedBy: { name: string; at: string }
  stages: POApprovalStage[]
}

export interface PurchaseOrderDetail extends PurchaseOrder {
  email: string[]
  billingAddress: string
  shipTo: string
  shipDate: string
  shipVia: string
  trackingNo: string
  referenceNo: string
  paymentTerms: string
  warehouse: string
  lineItems: POLineItem[]
  message: string
  memo: string
  attachments: POAttachment[]
  totals: POTotals
  lastUpdatedBy: string
  lastUpdatedAt: string
  linkedTransactions: POLinkedTxn[]
  approvalLog: POApprovalLog
  banner: { message: string; linkLabel: string } | null
}

// ─── Lookup pools (deterministic, picked by index) ────────────────────────────

const BILLING_ADDRESSES = [
  'Jl. Anggrek No. 25, Kebayoran Baru, Jakarta Selatan, 12130, DKI Jakarta',
  'Jl. Gatot Subroto Kav. 18, Setiabudi, Jakarta Selatan, 12950, DKI Jakarta',
  'Jl. Diponegoro No. 4, Menteng, Jakarta Pusat, 10310, DKI Jakarta',
  'Jl. Asia Afrika No. 8, Sudirman, Jakarta Pusat, 10270, DKI Jakarta',
]
const SHIP_TO = [
  'Gudang Utama, Kawasan Industri Pulogadung, Jakarta Timur',
  'Gudang Blok C No. 12, Cikarang, Bekasi, Jawa Barat',
  'Jl. Raya Bogor KM 30, Cibinong, Bogor, Jawa Barat',
  'Ruko Sentra Niaga No. 7, Bintaro, Tangerang Selatan',
]
const SHIP_VIA = ['Sentral Cargo', 'JNE Trucking', 'SiCepat Gokil', 'Internal fleet']
export const WAREHOUSES = ['Default warehouse', 'Cibinong warehouse', 'Pulogadung DC', 'Bandung hub']
export const PAYMENT_TERMS = ['Net 30', 'Net 14', 'Cash on delivery', 'Net 45']
export const UNIT_OPTIONS = ['Pcs', 'Sheet', 'Meter', 'Pail', 'Box', 'Length', 'Pack', 'Kg']
export const TAX_OPTIONS = ['PPN 11%', 'Non-PPN']
const UPDATED_BY = ['Rizal Candra', 'Siti Aminah', 'Bagus Prakoso', 'Dewi Lestari']
const REQUESTERS = ['Cinta Ayu', 'Bunga Melati', 'Andi Wijaya', 'Sari Dewi']
const APPROVERS = ['Rio Febrian', 'Christin Purnama Sari', 'Kevin Surya', 'Rizal Candra', 'Dian Pertiwi', 'Agus Salim']

const PRODUCTS: { product: string; sku: string; description: string; unit: string }[] = [
  { product: 'Steel plate 3mm',        sku: 'STL-P3',   description: 'Cold-rolled, 1200×2400', unit: 'Sheet' },
  { product: 'Bearing 6204-2RS',       sku: 'BRG-6204', description: 'Sealed ball bearing',    unit: 'Pcs'   },
  { product: 'Hydraulic hose 1/2"',    sku: 'HYD-H12',  description: 'SAE 100 R2, per meter',   unit: 'Meter' },
  { product: 'Industrial paint grey',  sku: 'PNT-GRY',  description: 'Epoxy primer, 20L',       unit: 'Pail'  },
  { product: 'Bolt M12×40',            sku: 'BLT-M12',  description: 'Grade 8.8, zinc plated',  unit: 'Box'   },
  { product: 'Rubber gasket 4"',       sku: 'GKT-R4',   description: 'NBR, flange gasket',      unit: 'Pcs'   },
  { product: 'Cable tray 100mm',       sku: 'CBL-T100', description: 'Hot-dip galvanized, 2.4m', unit: 'Length' },
  { product: 'Welding rod E6013',      sku: 'WLD-6013', description: '2.6mm, 5kg pack',         unit: 'Pack'  },
]

function pick<T>(arr: T[], i: number): T { return arr[i % arr.length]! }

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function emailFor(name: string): string[] {
  const slug = name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12) || 'vendor'
  return [`sales@${slug}.co.id`, `finance@${slug}.co.id`]
}

/**
 * Build line items that reconcile to the base order's grand total:
 *   subtotal + tax(11%) + shipping === base total
 * Line amounts are split across `itemCount` rows; tax absorbs rounding so the
 * detail total always equals the index total.
 */
function buildLineItems(total: number, count: number, seed: number): { items: POLineItem[]; totals: POTotals } {
  const shippingFee = pick([0, 150_000, 250_000, 0], seed)
  const targetSubtotal = Math.round((total - shippingFee) / 1.11)

  const n = Math.max(1, count)
  const share = Math.max(1000, Math.round(targetSubtotal / n / 1000) * 1000)

  const items: POLineItem[] = []
  let runningSubtotal = 0
  for (let i = 0; i < n; i++) {
    const p = pick(PRODUCTS, seed + i)
    // last row absorbs the remainder so amounts sum to ~targetSubtotal
    const amount = i === n - 1 ? Math.max(1000, targetSubtotal - runningSubtotal) : share
    const qty = i === n - 1 ? 1 : pick([1, 2, 3, 5], seed + i)
    const unitPrice = qty === 1 ? amount : Math.round(amount / qty)
    const lineAmount = unitPrice * qty
    runningSubtotal += lineAmount
    items.push({
      product: p.product,
      sku: p.sku,
      description: p.description,
      qty,
      unit: p.unit,
      unitPrice,
      discountPct: 0,
      taxLabel: TAX_LABEL,
      amount: lineAmount,
      // Demo-only "Dimensions" values — see POLineItem.dimensions.
      dimensions: { Branch: pick(['Jakarta', 'Bandung', 'Surabaya'], seed + i), 'Cost center': pick(['Operations', 'Warehouse'], seed + i) },
    })
  }

  const subtotal = runningSubtotal
  // tax absorbs any rounding drift so total === base order total exactly
  const taxAmount = total - shippingFee - subtotal
  const totals: POTotals = {
    subtotal,
    discountPerLine: 0,
    globalDiscount: 0,
    taxLabel: TAX_LABEL,
    taxAmount,
    shippingFee,
    total,
  }
  return { items, totals }
}

/**
 * Linked transactions:
 *  - duplicatedFromId set → the source order it was duplicated from (any status,
 *    e.g. a rejected order the user duplicated to correct and resubmit)
 *  - approved              → also a purchase delivery + a purchase invoice
 */
function buildLinked(order: PurchaseOrder, idx: number): POLinkedTxn[] {
  const linked: POLinkedTxn[] = []

  if (order.duplicatedFromId) {
    const source = purchaseOrders.find(o => o.id === order.duplicatedFromId)
    if (source) {
      linked.push({
        date: source.date,
        type: 'Purchase Order',
        number: source.number,
        status: source.status,
        orderId: source.id,
      })
    }
  }

  if (order.status === 'approved') {
    linked.push(
      {
        date: addDays(order.date, 1),
        type: 'Purchase Delivery',
        number: `#${30000 + idx}`,
        status: 'completed',
      },
      {
        date: addDays(order.date, 2),
        type: 'Purchase Invoice',
        number: `#${40000 + idx}`,
        status: order.balance > 0 ? 'open' : 'paid',
      },
    )
  }

  return linked
}

/**
 * Approval log shown in the title-bar [task] popover. A two-stage flow whose
 * per-actor state follows the order status:
 *  - awaiting approval → stage 1 partly approved, remainder + stage 2 awaiting
 *  - approved          → every stage approved
 *  - rejected          → stage 1 approved by one, rejected by the next
 */
function buildApprovalLog(order: PurchaseOrder, idx: number): POApprovalLog {
  const reqAt = `${order.date}T14:30:00`
  const okAt = `${order.date}T16:00:00`
  const requester = pick(REQUESTERS, idx)
  const a1 = pick(APPROVERS, idx)
  const a2 = pick(APPROVERS, idx + 1)
  const a3 = pick(APPROVERS, idx + 2)
  const a4 = pick(APPROVERS, idx + 3)
  const requestedBy = { name: requester, at: reqAt }

  if (order.status === 'approved') {
    return {
      requestedBy,
      stages: [
        { title: 'Approval stage 1', rule: 'Everyone must approve (1 of 2)', status: 'approved',
          actors: [{ name: a1, state: 'approved', at: okAt }, { name: a2, state: 'approved', at: okAt }] },
        { title: 'Approval stage 2', rule: 'Anyone can approve', status: 'approved',
          actors: [{ name: a3, state: 'approved', at: okAt }] },
      ],
    }
  }
  if (order.status === 'rejected') {
    return {
      requestedBy,
      stages: [
        { title: 'Approval stage 1', rule: 'Everyone must approve (1 of 2)', status: 'rejected',
          actors: [{ name: a1, state: 'approved', at: okAt }, { name: a2, state: 'rejected', at: okAt }] },
      ],
    }
  }
  // awaiting approval
  return {
    requestedBy,
    stages: [
      { title: 'Approval stage 1', rule: 'Everyone must approve (1 of 2)', status: 'awaiting approval',
        actors: [{ name: a1, state: 'approved', at: okAt }, { name: a2, state: 'awaiting' }] },
      { title: 'Approval stage 2', rule: 'Anyone can approve', status: 'awaiting approval',
        actors: [{ name: `${a3} or ${a4}`, state: 'awaiting' }] },
    ],
  }
}

/** Build the full presentational detail for a purchase order by id. */
export function getPurchaseOrderDetail(id: string): PurchaseOrderDetail {
  const idx = Math.max(0, purchaseOrders.findIndex(o => o.id === id))
  const order = purchaseOrders[idx] ?? purchaseOrders[0]!

  const { items, totals } = buildLineItems(order.total, order.itemCount, idx + 1)

  const attachments: POAttachment[] = order.hasAttachment
    ? [
        { name: `${order.number}-quotation.pdf`, sizeKB: 78.4 },
        { name: 'vendor-price-list.xlsx',        sizeKB: 34.1 },
      ]
    : []

  return {
    ...order,
    email: emailFor(order.vendor.name),
    billingAddress: pick(BILLING_ADDRESSES, idx),
    shipTo: pick(SHIP_TO, idx),
    shipDate: addDays(order.date, 3),
    shipVia: pick(SHIP_VIA, idx),
    trackingNo: `TRK${String(1000 + idx)}`,
    referenceNo: `REF-${order.number.slice(-3)}`,
    paymentTerms: pick(PAYMENT_TERMS, idx),
    warehouse: pick(WAREHOUSES, idx),
    lineItems: items,
    message: 'Please deliver during working hours (08:00–16:00). Confirm receipt on arrival.',
    memo: 'Approved budget line: procurement Q2. Verify item specs against the attached quotation.',
    attachments,
    totals,
    lastUpdatedBy: pick(UPDATED_BY, idx),
    lastUpdatedAt: `${addDays(order.date, 1)}T09:24:00`,
    linkedTransactions: buildLinked(order, idx + 1),
    approvalLog: buildApprovalLog(order, idx),
    banner: null,
  }
}
