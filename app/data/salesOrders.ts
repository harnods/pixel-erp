import { reactive } from 'vue'
import type { SalesOrder, SalesOrderItem, SalesOrderStatus } from './types'
import { CATALOG } from './catalog'
import { customers, EXPORT_CUSTOMER_ID } from './customers'
import type { RecurringSchedule } from './salesInvoices'
import { SIM_SPAN_DAYS, simDay } from './simClock'

/**
 * Mock sales orders for a wholesale + retail coffee business
 * (coffee beans, machines, accessories). 100 records, generated deterministically.
 *
 * This file is the **single source of truth**: each order's line items drive its
 * subtotal → tax → total, and the status drives the balance due. The detail page
 * ([salesOrderDetails.ts](salesOrderDetails.ts)) reuses these items + `computeTotals`
 * so the index row and the detail view always agree.
 */

/** Customers come from the shared master (`customers.ts`) — same ids the WMS
 *  outbound module uses, so a sales order and its dispatch resolve to one
 *  company. Sales orders only need id + name here. */
// Positional assignment, same as salesInvoices.ts — the export customer stays
// out so adding it never shifts an existing order's buyer.
const CUSTOMERS: { id: string; name: string }[] = customers
  .filter((c) => c.id !== EXPORT_CUSTOMER_ID)
  .map((c) => ({ id: c.id, name: c.name }))

const STATUSES: SalesOrderStatus[] = ['open', 'partially processed', 'closed', 'voided']

const TAG_SETS: string[][] = [
  ['Wholesale', 'Beans'],
  ['Retail', 'Machines'],
  ['Wholesale', 'Machines'],
  ['Retail', 'Beans'],
  ['Wholesale', 'Beans', 'Subscription'],
  ['Wholesale', 'Machines', 'Priority'],
  ['Retail', 'Beans', 'Sample'],
  ['Wholesale'],
]

/** Product catalogue — same master catalog as the WMS, mapped to sales order items. */
const PRODUCTS: Omit<SalesOrderItem, 'qty' | 'discountPct' | 'amount'>[] = CATALOG.map(item => ({
  product: item.name,
  sku: item.sku,
  description: item.desc,
  unit: item.unit,
  unitPrice: item.price,
}))

const TAX_RATE = 0.11

// Item count per order — mostly small, a few big; index 0 is the 50-item demo order.
const ITEM_COUNTS = [3, 1, 2, 5, 1, 4, 2, 8, 1, 6, 2, 3, 1, 7, 2, 1, 4, 2, 10, 1, 3, 5, 1, 2, 6]

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function buildItems(i: number): SalesOrderItem[] {
  const count = i === 0 ? 50 : (ITEM_COUNTS[i % ITEM_COUNTS.length] ?? 3)
  const items: SalesOrderItem[] = []
  for (let j = 0; j < count; j++) {
    const p = PRODUCTS[(i * 5 + j * 7) % PRODUCTS.length]!
    // machines/sacks come in small qty; consumables in larger qty
    const big = p.unitPrice >= 2_000_000
    const qty = big ? 1 + ((i + j) % 2) : 1 + ((i + j * 3) % 12)
    const discountPct = (j % 5 === 3) ? 10 : (j % 7 === 5 ? 5 : 0)
    const amount = Math.round(qty * p.unitPrice * (1 - discountPct / 100))
    items.push({ ...p, qty, discountPct, amount })
  }
  return items
}

export interface SalesOrderTotals {
  subtotal: number
  discountPerLine: number
  globalDiscount: number
  taxLabel: string
  taxAmount: number
  shippingFee: number
  total: number
}

/** Derive the totals breakdown from line items — shared by the index and the detail.
 *  `taxRate` defaults to the standard 11% (existing callers are unaffected); pass 0
 *  for a document that carries no PPN at all (e.g. a no-PPN sales invoice). */
export function computeTotals(
  items: SalesOrderItem[], globalDiscount: number, shippingFee: number, taxRate: number = TAX_RATE,
): SalesOrderTotals {
  const subtotal = items.reduce((s, it) => s + it.qty * it.unitPrice, 0)
  const discountPerLine = items.reduce((s, it) => s + (it.qty * it.unitPrice - it.amount), 0)
  const taxBase = subtotal - discountPerLine - globalDiscount
  const taxAmount = Math.round(taxBase * taxRate)
  const total = taxBase + taxAmount + shippingFee
  return { subtotal, discountPerLine, globalDiscount, taxLabel: 'PPN 11%', taxAmount, shippingFee, total }
}

/** Per-line processed vs. unprocessed breakdown for the "Mark as completed" modal.
 *  Prototype mock (no real fulfillment ledger): an `open` order has processed
 *  nothing; a `partially processed` order has ~half of each line's qty processed,
 *  so a multi-qty line still leaves a remainder. `closed`/`voided` orders never
 *  reach this modal (the trigger is hidden for them). */
export interface SalesOrderCompletionRow {
  product: string
  sku: string
  qty: number
  processedQty: number
  unprocessedQty: number
  unit: string
}
export function salesOrderCompletionRows(order: SalesOrder): SalesOrderCompletionRow[] {
  return order.items.map((it) => {
    const processedQty = order.status === 'open' ? 0 : Math.ceil(it.qty / 2)
    return {
      product: it.product,
      sku: it.sku,
      qty: it.qty,
      processedQty,
      unprocessedQty: Math.max(0, it.qty - processedQty),
      unit: it.unit,
    }
  })
}

function build(): SalesOrder[] {
  const out: SalesOrder[] = []
  for (let i = 0; i < 100; i++) {
    const number = 10090 + i
    const customer = CUSTOMERS[i % CUSTOMERS.length]!
    const status = STATUSES[i % STATUSES.length]!
    const date = addDays('2026-01-02', i)        // one order per day
    const dueDate = addDays(date, 30)

    const items = buildItems(i)
    const globalDiscount = i % 6 === 0 ? 100_000 : 0
    const shippingFee = i % 3 === 0 ? 100_000 : i % 3 === 1 ? 0 : 150_000
    const { total } = computeTotals(items, globalDiscount, shippingFee)

    // Balance reflects how far the order has been invoiced/paid:
    //  open → nothing invoiced (full balance); partially → ~half; closed/voided → settled.
    const balanceDue =
      status === 'closed' || status === 'voided' ? 0
      : status === 'partially processed' ? Math.round(total / 2 / 50_000) * 50_000
      : total

    out.push({
      id: `SO${String(i + 1).padStart(3, '0')}`,
      number,
      customer,
      date,
      dueDate,
      status,
      balanceDue,
      total,
      tags: TAG_SETS[i % TAG_SETS.length],
      items,
      globalDiscount,
      shippingFee,
    })
  }
  return out
}

export const salesOrders: SalesOrder[] = build()

/** "Awaiting approval" queue for the Sales orders › Awaiting approval tab
 *  (deterministic every-7th subset; drives both the list and the count badge). */
export function awaitingSalesOrders(): SalesOrder[] {
  return salesOrders.filter(r => r.number % 7 === 0)
}
export function awaitingSalesOrdersCount(): number { return awaitingSalesOrders().length }

// ── Recurring Sales Orders ──────────────────────────────────────────────────

export interface RecurringSOHistoryEntry {
  orderNumber: number
  date: string
  amount: number
  status: string
}

export interface RecurringSOLineItem {
  product: string
  sku: string
  description: string
  qty: number
  unit: string
  unitPrice: number
  discountPct: number
  amount: number
}

export interface RecurringSalesOrder {
  id: string
  templateName: string
  customer: { id: string; name: string }
  frequency: string
  amount: number
  nextDate: string
  status: 'active' | 'completed'
  createdCount: number
  schedule?: RecurringSchedule
  history?: RecurringSOHistoryEntry[]
  email: string[]
  billingAddress: string
  shipTo: string
  paymentTerms: string
  warehouse: string
  referenceNo: string
  tags: string[]
  lineItems: RecurringSOLineItem[]
  message: string
  memo: string
  totals: SalesOrderTotals
  lastUpdatedBy: string
  lastUpdatedAt: string
}

function recurringSOEmail(name: string): string[] {
  const slug = name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12) || 'customer'
  return [`hello@${slug}.com`, `finance@${slug}.com`]
}

const RSO_ADDRESSES = [
  'Jl. Anggrek No. 25, Kebayoran Baru, Jakarta Selatan, 12130, DKI Jakarta',
  'Jl. Gatot Subroto Kav. 18, Setiabudi, Jakarta Selatan, 12950, DKI Jakarta',
  'Jl. Diponegoro No. 4, Menteng, Jakarta Pusat, 10310, DKI Jakarta',
  'Jl. Asia Afrika No. 8, Sudirman, Jakarta Pusat, 10270, DKI Jakarta',
]
const RSO_SHIP_TO = [
  'Jl. Sindang III/5, Kompleks Pertamina, DKI Jakarta 12820',
  'Gudang Blok C No. 12, Kawasan Industri Pulogadung, Jakarta Timur',
  'Jl. Raya Bogor KM 30, Cibinong, Bogor, Jawa Barat',
  'Ruko Sentra Niaga No. 7, Bintaro, Tangerang Selatan',
]
const RSO_WAREHOUSES = ['Default warehouse', 'Cibinong warehouse', 'Pulogadung DC', 'Bandung hub']
const RSO_PAYMENT_TERMS = ['Net 30', 'Net 14', 'Cash on delivery', 'Net 45']

function buildRecurringSOLineItems(amount: number, idx: number): RecurringSOLineItem[] {
  const count = 1 + (idx % 4)
  const items: RecurringSOLineItem[] = []
  const products = [
    { product: 'Green Beans Arabica Gayo Grade 1', sku: '1001', description: 'Aceh highlands, fully washed, screen 18, 60 kg jute sack', unit: 'Sack', unitPrice: 3_200_000 },
    { product: 'Green Beans Robusta Temanggung', sku: '1008', description: 'Central Java, dry process, 60 kg sack', unit: 'Sack', unitPrice: 2_200_000 },
    { product: 'Espresso Machine Dual Boiler 2-Group', sku: '2001', description: 'Commercial, stainless body, PID control', unit: 'Unit', unitPrice: 85_000_000 },
    { product: 'Coffee Grinder Single Dose 64mm', sku: '2005', description: 'Single dose, bellows, low retention', unit: 'Unit', unitPrice: 9_800_000 },
  ]
  const taxRate = 0.11
  const baseAmount = Math.round(amount / (1 + taxRate))
  let remaining = baseAmount
  for (let i = 0; i < count; i++) {
    const p = products[i % products.length]!
    const isLast = i === count - 1
    const lineAmount = isLast ? remaining : Math.round(baseAmount / count)
    remaining -= lineAmount
    const qty = Math.max(1, Math.round(lineAmount / p.unitPrice))
    items.push({
      product: p.product,
      sku: p.sku,
      description: p.description,
      qty,
      unit: p.unit,
      unitPrice: p.unitPrice,
      discountPct: 0,
      amount: lineAmount,
    })
  }
  return items
}

function buildRecurringSOTotals(amount: number): SalesOrderTotals {
  const taxRate = 0.11
  const subtotal = Math.round(amount / (1 + taxRate))
  const taxAmount = amount - subtotal
  return { subtotal, discountPerLine: 0, globalDiscount: 0, taxLabel: 'PPN 11%', taxAmount, shippingFee: 0, total: amount }
}

function buildRecurringSOTemplate(
  base: { id: string; templateName: string; customer: typeof CUSTOMERS[0]; frequency: string; amount: number; nextDate: string; status: 'active' | 'completed'; createdCount: number; schedule: RecurringSchedule; history?: RecurringSOHistoryEntry[] },
  idx: number,
): RecurringSalesOrder {
  return {
    ...base,
    customer: base.customer!,
    email: recurringSOEmail(base.customer!.name),
    billingAddress: RSO_ADDRESSES[idx % RSO_ADDRESSES.length]!,
    shipTo: RSO_SHIP_TO[idx % RSO_SHIP_TO.length]!,
    paymentTerms: RSO_PAYMENT_TERMS[idx % RSO_PAYMENT_TERMS.length]!,
    warehouse: RSO_WAREHOUSES[idx % RSO_WAREHOUSES.length]!,
    referenceNo: `PO #${20080 + idx}`,
    tags: idx % 3 === 0 ? ['B2B'] : idx % 5 === 0 ? ['VIP'] : [],
    lineItems: buildRecurringSOLineItems(base.amount, idx),
    message: 'Thank you for your continued business. This is an automatically generated recurring order.',
    memo: `Recurring template ${base.id}`,
    totals: buildRecurringSOTotals(base.amount),
    lastUpdatedBy: 'Rizal Candra',
    lastUpdatedAt: simDay(-3),
  }
}

const RSO_TEMPLATES: RecurringSalesOrder[] = [
  buildRecurringSOTemplate({ id: 'RSO001', templateName: 'Monthly coffee supply', customer: CUSTOMERS[0]!, frequency: 'Monthly', amount: 12_000_000, nextDate: simDay(SIM_SPAN_DAYS + 5), status: 'active', createdCount: 6, schedule: { repeatInterval: 1, repeatUnit: 'month', endRepeat: 'never', startDate: simDay(-180), sendAutoEmail: true }, history: [
    { orderNumber: 10190, date: simDay(-5), amount: 12_000_000, status: 'Closed' },
    { orderNumber: 10160, date: simDay(-35), amount: 12_000_000, status: 'Closed' },
    { orderNumber: 10130, date: simDay(-65), amount: 12_000_000, status: 'Closed' },
  ] }, 0),
  buildRecurringSOTemplate({ id: 'RSO002', templateName: 'Weekly espresso delivery', customer: CUSTOMERS[1]!, frequency: 'Weekly', amount: 4_500_000, nextDate: simDay(SIM_SPAN_DAYS + 2), status: 'active', createdCount: 24, schedule: { repeatInterval: 1, repeatUnit: 'week', endRepeat: 'never', startDate: simDay(-168), sendAutoEmail: false }, history: [
    { orderNumber: 10189, date: simDay(-2), amount: 4_500_000, status: 'Open' },
    { orderNumber: 10180, date: simDay(-9), amount: 4_500_000, status: 'Closed' },
  ] }, 1),
  buildRecurringSOTemplate({ id: 'RSO003', templateName: 'Quarterly equipment lease', customer: CUSTOMERS[2]!, frequency: 'Quarterly', amount: 44_000_000, nextDate: simDay(SIM_SPAN_DAYS + 30), status: 'active', createdCount: 3, schedule: { repeatInterval: 3, repeatUnit: 'month', endRepeat: 'after', endAfterCount: 8, startDate: simDay(-270), sendAutoEmail: true }, history: [
    { orderNumber: 10188, date: simDay(-10), amount: 44_000_000, status: 'Open' },
  ] }, 2),
  buildRecurringSOTemplate({ id: 'RSO004', templateName: 'Bi-weekly roast batch', customer: CUSTOMERS[3]!, frequency: 'Bi-weekly', amount: 8_900_000, nextDate: simDay(SIM_SPAN_DAYS + 8), status: 'active', createdCount: 10, schedule: { repeatInterval: 2, repeatUnit: 'week', endRepeat: 'never', startDate: simDay(-140), sendAutoEmail: false } }, 3),
  buildRecurringSOTemplate({ id: 'RSO005', templateName: 'Annual maintenance', customer: CUSTOMERS[4]!, frequency: 'Yearly', amount: 98_000_000, nextDate: simDay(SIM_SPAN_DAYS + 60), status: 'active', createdCount: 1, schedule: { repeatInterval: 1, repeatUnit: 'year', endRepeat: 'never', startDate: simDay(-365), sendAutoEmail: true } }, 4),
  buildRecurringSOTemplate({ id: 'RSO006', templateName: 'Monthly bean subscription', customer: CUSTOMERS[5]!, frequency: 'Monthly', amount: 6_800_000, nextDate: simDay(SIM_SPAN_DAYS + 12), status: 'completed', createdCount: 12, schedule: { repeatInterval: 1, repeatUnit: 'month', endRepeat: 'after', endAfterCount: 12, startDate: simDay(-365), sendAutoEmail: false } }, 5),
  buildRecurringSOTemplate({ id: 'RSO007', templateName: 'Weekly pastry supply', customer: CUSTOMERS[6]!, frequency: 'Weekly', amount: 3_200_000, nextDate: simDay(SIM_SPAN_DAYS + 1), status: 'active', createdCount: 18, schedule: { repeatInterval: 1, repeatUnit: 'week', endRepeat: 'never', startDate: simDay(-126), sendAutoEmail: true } }, 6),
  buildRecurringSOTemplate({ id: 'RSO008', templateName: 'Monthly premium blend', customer: CUSTOMERS[7]!, frequency: 'Monthly', amount: 23_750_000, nextDate: simDay(SIM_SPAN_DAYS + 15), status: 'active', createdCount: 4, schedule: { repeatInterval: 1, repeatUnit: 'month', endRepeat: 'on', endOnDate: simDay(365), startDate: simDay(-120), sendAutoEmail: true } }, 7),
]

export const recurringSalesOrders = reactive<RecurringSalesOrder[]>([...RSO_TEMPLATES])
export function recurringSalesOrdersCount(): number { return recurringSalesOrders.filter(r => r.status === 'active').length }
export function getRecurringForSalesOrder(recurringId: string): RecurringSalesOrder | undefined {
  return recurringSalesOrders.find(r => r.id === recurringId)
}
