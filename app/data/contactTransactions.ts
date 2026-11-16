import type { Contact, ContactType } from './contacts'
import { salesInvoices } from './salesInvoices'
import { purchaseInvoices } from './purchaseInvoices'
import { SIM_TODAY_ISO, daysSince } from './simClock'
import type { InvoiceStatus } from './types'

/**
 * Read-only view of the transactions raised against one contact, derived from
 * the existing sales invoice (AR) and purchase invoice (AP) mocks — joined on
 * the contact's display name / company name, so the Contacts screens agree with
 * the Sales and Purchases screens. Nothing here writes back to those stores.
 */
export interface ContactTransactionRow {
  id: string
  kind: 'sales-invoice' | 'purchase-invoice'
  date: string
  number: string
  description: string
  status: InvoiceStatus
  dueDate: string
  amount: number
  balanceDue: number
  tags: string[]
  href: string
}

function namesOf(c: Pick<Contact, 'displayName' | 'companyName'>): string[] {
  return [c.displayName, c.companyName].filter(Boolean).map((n) => n.trim().toLowerCase())
}

export function contactTransactions(c: Contact): ContactTransactionRow[] {
  const names = namesOf(c)
  const rows: ContactTransactionRow[] = []
  if (c.types.includes('customer')) {
    for (const inv of salesInvoices) {
      if (!names.includes(inv.customer.name.toLowerCase())) continue
      rows.push({
        id: inv.id, kind: 'sales-invoice', date: inv.date, number: `Sales Invoice #${inv.number}`,
        description: '', status: inv.status, dueDate: inv.dueDate, amount: inv.total,
        balanceDue: inv.balance, tags: inv.tags ?? [], href: `/sales-invoices/${inv.id}`,
      })
    }
  }
  if (c.types.includes('vendor')) {
    for (const inv of purchaseInvoices) {
      if (!names.includes(inv.vendor.name.toLowerCase())) continue
      rows.push({
        id: inv.id, kind: 'purchase-invoice', date: inv.date, number: `Purchase Invoice #${inv.number}`,
        description: '', status: inv.status, dueDate: inv.dueDate, amount: inv.amount,
        balanceDue: inv.status === 'paid' ? 0 : inv.amount, tags: inv.tags ?? [], href: `/purchase-invoices/${inv.id}`,
      })
    }
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date))
}

export interface ContactOutstanding {
  /** Open balance on the list's side (AR for customers, AP for vendors). */
  amount: number
  /** Days the oldest overdue invoice is past due; 0 when nothing is overdue. */
  overdueDays: number
}

/** Outstanding figure for the contact list's OUTSTANDING column. */
export function contactOutstanding(c: Contact, side: ContactType): ContactOutstanding {
  const rows = contactTransactions(c).filter((r) =>
    side === 'vendor' ? r.kind === 'purchase-invoice' : side === 'customer' ? r.kind === 'sales-invoice' : false)
  const amount = rows.reduce((s, r) => s + r.balanceDue, 0)
  const overdueDays = rows
    .filter((r) => r.status === 'overdue' && r.balanceDue > 0)
    .reduce((m, r) => Math.max(m, daysSince(r.dueDate)), 0)
  return { amount, overdueDays }
}

export interface ContactSummary {
  owedToYou: number
  paymentReceived: number
  youNeedToPay: number
  paymentMade: number
  overdueReceivable: number
  overduePayable: number
}

/** Summary strip on the contact's Transactions tab. */
export function contactSummary(c: Contact): ContactSummary {
  const rows = contactTransactions(c)
  const last30 = (iso: string) => {
    const d = daysSince(iso)
    return d >= 0 && d <= 30
  }
  const ar = rows.filter((r) => r.kind === 'sales-invoice')
  const ap = rows.filter((r) => r.kind === 'purchase-invoice')
  return {
    owedToYou: ar.reduce((s, r) => s + r.balanceDue, 0),
    paymentReceived: ar.filter((r) => last30(r.dueDate)).reduce((s, r) => s + (r.amount - r.balanceDue), 0),
    youNeedToPay: ap.reduce((s, r) => s + r.balanceDue, 0),
    paymentMade: ap.filter((r) => last30(r.dueDate)).reduce((s, r) => s + (r.amount - r.balanceDue), 0),
    overdueReceivable: ar.filter((r) => r.status === 'overdue').reduce((s, r) => s + r.balanceDue, 0),
    overduePayable: ap.filter((r) => r.status === 'overdue').reduce((s, r) => s + r.balanceDue, 0),
  }
}

export const CONTACT_TX_TODAY = SIM_TODAY_ISO
