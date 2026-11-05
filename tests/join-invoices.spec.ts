/**
 * Join invoices (prod merged invoices): seeds reference existing invoices only,
 * totals are read live from the source seeds, and statuses follow prod
 * MergedInvoice#set_current_status.
 */
import { describe, it, expect } from 'vitest'
import {
  joinInvoices, joinInvoicesOf, joinLines, joinTotal, joinRemaining, joinStatus, joinNumber,
  sourceInvoice, JOIN_MIN_INVOICES,
} from '../app/data/joinInvoices'
import { salesInvoices } from '../app/data/salesInvoices'
import { purchaseInvoices } from '../app/data/purchaseInvoices'

describe('join invoices seed', () => {
  it('has sales and purchase records, each with at least 2 lines of the same contact', () => {
    expect(joinInvoicesOf('sales').length).toBeGreaterThanOrEqual(3)
    expect(joinInvoicesOf('purchase').length).toBeGreaterThanOrEqual(2)
    for (const j of joinInvoices) {
      const lines = joinLines(j)
      expect(lines.length).toBeGreaterThanOrEqual(JOIN_MIN_INVOICES)
      for (const l of lines) expect(l.contactId).toBe(j.contactId)
      expect(j.transactionDate >= lines.map((l) => l.date).sort().pop()!).toBe(true)
    }
  })
  it('totals equal the sum of the source invoices', () => {
    for (const j of joinInvoices) {
      const sum = j.lines.reduce((s, l) => s + (sourceInvoice(j.kind, l.invoiceId)?.total ?? 0), 0)
      expect(joinTotal(j)).toBe(sum)
      expect(joinRemaining(j)).toBeLessThanOrEqual(joinTotal(j))
    }
  })
  it('an invoice is joined at most once per kind', () => {
    for (const kind of ['sales', 'purchase'] as const) {
      const ids = joinInvoicesOf(kind).flatMap((j) => j.lines.map((l) => l.invoiceId))
      expect(new Set(ids).size).toBe(ids.length)
    }
  })
  it('covers open, overdue and paid (zero remaining) states', () => {
    const st = new Set(joinInvoicesOf('sales').map(joinStatus))
    expect(st.has('open') && st.has('overdue') && st.has('paid')).toBe(true)
    expect(joinNumber(joinInvoicesOf('sales').find((j) => j.sequence === 10001)!)).toBe('Join Invoice - 10001')
  })
  it('does not change the source invoice seeds', () => {
    expect(salesInvoices.length).toBe(150)
    expect(purchaseInvoices.length).toBe(80)
  })
})
