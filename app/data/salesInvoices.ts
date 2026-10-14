import { reactive } from 'vue'
import type { SalesInvoice } from './types'
import { customers, EXPORT_CUSTOMER_ID } from './customers'
import { SIM_SPAN_DAYS, simDay, daysUntil } from './simClock'

/**
 * Sales invoices — a deterministic TIME SERIES spanning 1 Jan 2026 → today
 * (22 Aug 2026), the AR backbone of the production-ready Cowork demo. Customers
 * come from the shared `customers` master (coffee accounts), so a customer id
 * means the same company across Sales, WMS outbound and CRM. Status is derived
 * from the due date vs "today":
 *   • due date passed + unpaid  → overdue
 *   • due date passed + paid     → paid (balance 0)
 *   • not yet due                → open (unpaid) or paid-early
 * Everything is a pure function of the index → same data every load, real dates.
 */
const INVOICE_COUNT = 150
// Coffee-wholesale invoice sizes (IDR) — cycled with a per-index tweak for spread.
const AMOUNTS = [
  4_500_000, 12_000_000, 8_900_000, 23_750_000, 6_800_000, 44_000_000, 15_200_000,
  98_000_000, 3_200_000, 67_000_000, 34_500_000, 125_000_000, 9_000_000, 55_300_000, 210_000_000,
]

/**
 * The pool the seed walks by index. The export customer is excluded: this
 * assignment is positional, so admitting it would shift every invoice's buyer
 * by one and silently rewrite 150 rows of demo data.
 */
const CYCLE_CUSTOMERS = customers.filter((c) => c.id !== EXPORT_CUSTOMER_ID)

/**
 * The invoices sold abroad. Named rather than derived, so the export buyer
 * lands on invoices that can actually raise a tax document (PPN present, every
 * product DJP-classified, no seeded faktur of their own) — the state the
 * export form needs to be reachable from.
 */
const EXPORT_INVOICE_IDS = ['SI121', 'SI110', 'SI062']

function buildSalesInvoices(): SalesInvoice[] {
  const out: SalesInvoice[] = []
  for (let i = 0; i < INVOICE_COUNT; i++) {
    const offset = Math.floor((i * SIM_SPAN_DAYS) / INVOICE_COUNT) // 1 Jan → today
    const date = simDay(offset)
    const dueDate = simDay(offset + 30)
    const cust = CYCLE_CUSTOMERS[i % CYCLE_CUSTOMERS.length]!
    const total = AMOUNTS[i % AMOUNTS.length]! + (i % 5) * 1_300_000
    const duePassed = daysUntil(dueDate) < 0

    let status: SalesInvoice['status']
    let balance: number
    if (duePassed) {
      const unpaid = i % 6 === 0 || i % 13 === 0
      status = unpaid ? 'overdue' : 'paid'
      balance = unpaid ? total : 0
    } else {
      const paidEarly = i % 5 === 0
      status = paidEarly ? 'paid' : 'open'
      balance = paidEarly ? 0 : total
    }

    const tags: string[] = []
    if (total >= 100_000_000) tags.push('VIP')
    if (i % 4 === 0) tags.push('B2B')

    out.push({
      id: `SI${String(i + 1).padStart(3, '0')}`,
      number: 40001 + i,
      customer: { id: cust.id, name: cust.name },
      date,
      dueDate,
      total,
      balance,
      status,
      itemCount: 1 + (i % 12),
      hasPpn: i % 9 !== 0,
      hasAttachment: i % 3 === 0,
      ...(tags.length ? { tags } : {}),
    })
  }
  // The export buyer is attached after the cycle has run, so it never disturbs
  // the positional assignment above.
  const exportCustomer = customers.find((c) => c.id === EXPORT_CUSTOMER_ID)
  if (exportCustomer) {
    for (const id of EXPORT_INVOICE_IDS) {
      const inv = out.find((o) => o.id === id)
      if (inv) inv.customer = { id: exportCustomer.id, name: exportCustomer.name }
    }
  }

  // Newest first (matches how the Sales Invoices page reads best).
  return out.reverse()
}

export const salesInvoices = reactive<SalesInvoice[]>(buildSalesInvoices())

/** Delete one or more sales invoices from the list (bulk or single). Returns the count actually removed. */
export function deleteSalesInvoices(ids: string[]): number {
  const idSet = new Set(ids)
  let removed = 0
  for (let i = salesInvoices.length - 1; i >= 0; i--) {
    if (idSet.has(salesInvoices[i]!.id)) {
      salesInvoices.splice(i, 1)
      removed++
    }
  }
  return removed
}

/**
 * "Awaiting approval" queue — a deterministic subset (every 7th by number) that
 * feeds the Sales invoices › Awaiting approval tab. Prototype approval flow: the
 * same predicate drives both the tab's filtered list and its count badge.
 */
export function awaitingSalesInvoices(): SalesInvoice[] {
  return salesInvoices.filter(r => r.number % 7 === 0)
}
export function awaitingSalesInvoicesCount(): number { return awaitingSalesInvoices().length }
