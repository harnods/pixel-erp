import type { SalesOrder, SalesOrderItem, SalesOrderStatus } from './types'
import { CATALOG } from './catalog'
import { customers } from './customers'

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
