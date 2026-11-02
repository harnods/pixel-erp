/**
 * Customer transactions — the unified list behind the contact details
 * "Transactions" tab (Figma: Contacts › Details › Transactions, node 4498-98815).
 *
 * Fans out across the sales-side documents + credit memos raised against one
 * customer and normalises each into a single row shape so the tab can render one
 * ErpTablePage. Sales docs join by customer NAME (same as the rest of the detail
 * page); credit memos join by the resolved customers.ts id.
 *
 * Reuses the existing stores — no new data is invented here.
 */
import { salesInvoices } from './salesInvoices'
import { salesOrders } from './salesOrders'
import { salesQuotes } from './salesQuotes'
import { creditMemos, memoTotal, memoStatus, customerAvailableCredit } from './creditMemos'
import { customers } from './customers'

export type CustomerTxnType = 'sales-invoice' | 'sales-order' | 'sales-quote' | 'credit-memo'

export interface CustomerTransaction {
  id: string
  date: string               // ISO
  docType: CustomerTxnType
  typeLabel: string          // 'Sales Invoice'
  number: number
  numberDisplay: string      // 'Sales Invoice #40030'
  dueDate?: string
  status: string             // ErpStatusBadge status token
  balanceDue?: number        // undefined → blank cell (quotes have no balance)
  total: number
  tags: string[]
  hasAttachment: boolean
  href: string
}

function namesFor(contact: { displayName?: string; companyName?: string } | undefined): string[] {
  if (!contact) return []
  return [contact.displayName, contact.companyName]
    .filter((n): n is string => !!n)
    .map((n) => n.toLowerCase())
}

/** The customers.ts id for this contact (credit memos key on it), by name. */
export function customerIdForContact(contact: { displayName?: string; companyName?: string } | undefined): string | undefined {
  const names = namesFor(contact)
  if (!names.length) return undefined
  return customers.find((c) => names.includes(c.name.toLowerCase()))?.id
}

export function getCustomerTransactions(contact: { displayName?: string; companyName?: string } | undefined): CustomerTransaction[] {
  const names = namesFor(contact)
  if (!names.length) return []
  const custId = customerIdForContact(contact)
  const rows: CustomerTransaction[] = []

  for (const inv of salesInvoices) {
    if (!names.includes(inv.customer.name.toLowerCase())) continue
    rows.push({
      id: inv.id, date: inv.date, docType: 'sales-invoice', typeLabel: 'Sales Invoice',
      number: inv.number, numberDisplay: `Sales Invoice #${inv.number}`,
      dueDate: inv.dueDate, status: inv.status, balanceDue: inv.balance, total: inv.total,
      tags: inv.tags ?? [], hasAttachment: inv.hasAttachment ?? false,
      href: `/sales-invoices/${inv.id}`,
    })
  }
  for (const so of salesOrders) {
    if (!names.includes(so.customer.name.toLowerCase())) continue
    rows.push({
      id: so.id, date: so.date, docType: 'sales-order', typeLabel: 'Sales Order',
      number: so.number, numberDisplay: `Sales Order #${so.number}`,
      dueDate: so.dueDate, status: so.status, balanceDue: so.balanceDue, total: so.total,
      tags: so.tags ?? [], hasAttachment: false,
      href: `/sales-orders/${so.id}`,
    })
  }
  for (const sq of salesQuotes) {
    if (!sq.customer || !names.includes(sq.customer.name.toLowerCase())) continue
    rows.push({
      id: sq.id, date: sq.date, docType: 'sales-quote', typeLabel: 'Sales Quote',
      number: sq.number, numberDisplay: `Sales Quote #${sq.number}`,
      status: sq.status, total: sq.total,
      tags: sq.tags ?? [], hasAttachment: false,
      href: `/sales-quotes/${sq.id}`,
    })
  }
  if (custId) {
    for (const m of creditMemos) {
      if (m.customerId !== custId) continue
      rows.push({
        id: m.id, date: m.date, docType: 'credit-memo', typeLabel: 'Credit Memo',
        number: m.number, numberDisplay: `Credit Memo #${m.number}`,
        status: memoStatus(m.id), total: memoTotal(m),
        tags: [], hasAttachment: false,
        href: `/credit-memos/${m.id}`,
      })
    }
  }

  // Newest first (then by number for a stable tie-break).
  return rows.sort((a, b) => b.date.localeCompare(a.date) || b.number - a.number)
}

export interface CustomerTxnSummary {
  overdueAmount: number
  overdueCount: number
  unpaidAmount: number
  unpaidCount: number
  paymentReceived: number
  paymentReceivedCount: number
  openCredits: number
}

/** The four KPI tiles above the table — all derived from the same source docs. */
export function getCustomerTxnSummary(contact: { displayName?: string; companyName?: string } | undefined): CustomerTxnSummary {
  const txns = getCustomerTransactions(contact)
  const invoices = txns.filter((r) => r.docType === 'sales-invoice')

  const overdue = invoices.filter((r) => r.status === 'overdue')
  const unpaid = invoices.filter((r) => (r.balanceDue ?? 0) > 0)

  // "Payment received" = amount settled on invoices dated in the last 30 days.
  const cutoff = Date.now() - 30 * 86_400_000
  const recentPaid = invoices.filter((r) => new Date(r.date).getTime() >= cutoff && r.total - (r.balanceDue ?? 0) > 0)

  const custId = customerIdForContact(contact)

  return {
    overdueAmount: overdue.reduce((s, r) => s + (r.balanceDue ?? 0), 0),
    overdueCount: overdue.length,
    unpaidAmount: unpaid.reduce((s, r) => s + (r.balanceDue ?? 0), 0),
    unpaidCount: unpaid.length,
    paymentReceived: recentPaid.reduce((s, r) => s + (r.total - (r.balanceDue ?? 0)), 0),
    paymentReceivedCount: recentPaid.length,
    openCredits: custId ? customerAvailableCredit(custId) : 0,
  }
}
