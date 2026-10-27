import type { SalesOrder, SalesOrderItem, SalesOrderStatus } from './types'
import { CATALOG } from './catalog'
import { customers } from './customers'
import { loadCreated, saveCreated } from './persist'

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
const CUSTOMERS: { id: string; name: string }[] = customers.map((c) => ({ id: c.id, name: c.name }))

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

/**
 * Contract orders for the percentage-based delivery work — the shape the PRD's
 * worked example uses: a 1-lot service line (a percentage of it is the only way
 * to express progress) beside a counted product line whose percentages do not
 * land on whole units. 33% of 16 unit is 5,28, which is exactly the number a
 * user has to work out by hand today.
 *
 * SO101 mirrors the PRD example. SO102 is mid-contract on one line only, so the
 * order reads `Mixed`. SO103 is fully delivered — the state where the delivery
 * action is disabled. See docs/plans/percentage-based-sales-delivery.md.
 */
/** Same derivation the generated orders use, so a contract order satisfies the
 *  single-source-of-truth rule in tests/sales-order-totals.spec.ts: items drive
 *  the total, and the status drives the balance due. */
function contractOrder(
  id: string, number: number, customerIndex: number, date: string, dueDate: string,
  status: SalesOrderStatus, items: SalesOrderItem[],
): SalesOrder {
  const customer = CUSTOMERS[customerIndex]!
  const { total } = computeTotals(items, 0, 0)
  const balanceDue =
    status === 'closed' || status === 'voided' ? 0
    : status === 'partially processed' ? Math.round(total / 2 / 50_000) * 50_000
    : total
  return {
    id, number, customer: { id: customer.id, name: customer.name },
    date, dueDate, status, balanceDue, total, tags: ['Contract'],
    items, globalDiscount: 0, shippingFee: 0,
  }
}

const CONTRACT_ORDERS: SalesOrder[] = [
  contractOrder('SO101', 10190, 14, '2026-02-02', '2026-08-02', 'partially processed', [
    { product: 'Instalasi & commissioning', sku: 'SRV-INST', description: 'Termin contract — site installation', qty: 1, unit: 'lot', unitPrice: 600_000_000, discountPct: 0, amount: 600_000_000 },
    { product: 'Panel Listrik', sku: 'PNL-16', description: 'Electrical panel, staged supply', qty: 16, unit: 'unit', unitPrice: 25_000_000, discountPct: 0, amount: 400_000_000 },
  ]),
  contractOrder('SO102', 10191, 2, '2026-03-09', '2026-09-09', 'partially processed', [
    { product: 'Jasa pemeliharaan', sku: 'SRV-MTN', description: 'Annual maintenance — termin', qty: 1, unit: 'lot', unitPrice: 200_000_000, discountPct: 0, amount: 200_000_000 },
    { product: 'Mesin Kopi Komersial', sku: 'MCH-COM', description: 'Commercial machine, staged supply', qty: 4, unit: 'unit', unitPrice: 25_000_000, discountPct: 0, amount: 100_000_000 },
  ]),
  contractOrder('SO103', 10192, 5, '2026-01-12', '2026-06-12', 'closed', [
    { product: 'Jasa instalasi', sku: 'SRV-FIT', description: 'Fit-out, delivered in full', qty: 1, unit: 'lot', unitPrice: 150_000_000, discountPct: 0, amount: 150_000_000 },
  ]),
]

export const salesOrders: SalesOrder[] = [...build(), ...CONTRACT_ORDERS]

// User-created orders (New sales order form) survive a reload — appended after the seed.
const CREATED_KEY = 'sales-orders-created'
for (const o of loadCreated<SalesOrder>(CREATED_KEY)) if (!salesOrders.some(x => x.id === o.id)) salesOrders.push(o)
export function addSalesOrder(order: SalesOrder): SalesOrder {
  salesOrders.push(order)
  saveCreated(CREATED_KEY, [...loadCreated<SalesOrder>(CREATED_KEY), order])
  return order
}
/** Edit of a user-created order is persisted; edits to seed orders stay in session. */
export function updateSalesOrder(order: SalesOrder): void {
  const i = salesOrders.findIndex(o => o.id === order.id)
  if (i >= 0) salesOrders[i] = order
  const created = loadCreated<SalesOrder>(CREATED_KEY)
  if (created.some(o => o.id === order.id)) saveCreated(CREATED_KEY, created.map(o => (o.id === order.id ? order : o)))
}

/** "Awaiting approval" queue for the Sales orders › Awaiting approval tab
 *  (deterministic every-7th subset; drives both the list and the count badge). */
export function awaitingSalesOrders(): SalesOrder[] {
  return salesOrders.filter(r => r.number % 7 === 0)
}
export function awaitingSalesOrdersCount(): number { return awaitingSalesOrders().length }
