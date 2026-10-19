/**
 * Credit memo flow (Sales › Sales invoices › Credit memo) — data-layer contract.
 *
 * Pins the rules the prototype pages and the PRD both rely on:
 *   remaining(memo)  = total − applied − refunded   (never negative)
 *   balance(invoice) = seed balance − credit applied (never negative)
 *   status(invoice)  = paid · overdue · partially-paid · open
 * plus every validation edge case the Apply / Refund / Credit memo forms surface,
 * the delete guards, and the Credit Memo report staying in sync.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { salesInvoices } from '~/data/salesInvoices'
import {
  creditMemos, creditMemoApplications, creditMemoRefunds,
  getCreditMemo, memoTotal, memoRemaining, memoStatus, customerAvailableCredit,
  invoiceBalance, invoiceCreditApplied, invoiceCashPaid, applicableInvoices, deriveInvoiceStatus,
  validateApplication, validateRefund, validateMemo,
  createApplication, updateApplication, deleteApplication,
  createRefund, deleteRefund, createCreditMemo, updateCreditMemo, deleteCreditMemo, canDeleteCreditMemo,
  syncInvoiceBalances, memoJournal, applicationJournal, refundJournal,
} from '~/data/creditMemos'
import { getSalesInvoiceDetail } from '~/data/salesInvoiceDetails'
import { creditMemoLedger, remainingOf, creditMemoReport, emptyCmReportFilters } from '~/data/creditMemoReport'

const inv = (id: string) => salesInvoices.find((i) => i.id === id)!

// Restore the seed between tests (mutations are in-memory; no localStorage in node).
const SNAP = {
  memos: JSON.parse(JSON.stringify(creditMemos)),
  apps: JSON.parse(JSON.stringify(creditMemoApplications)),
  refunds: JSON.parse(JSON.stringify(creditMemoRefunds)),
}
beforeEach(() => {
  creditMemos.splice(0, creditMemos.length, ...JSON.parse(JSON.stringify(SNAP.memos)))
  creditMemoApplications.splice(0, creditMemoApplications.length, ...JSON.parse(JSON.stringify(SNAP.apps)))
  creditMemoRefunds.splice(0, creditMemoRefunds.length, ...JSON.parse(JSON.stringify(SNAP.refunds)))
  syncInvoiceBalances()
})

describe('seed coherence', () => {
  it('every memo, application and refund references real customers, invoices and memos', () => {
    for (const a of creditMemoApplications) {
      expect(getCreditMemo(a.creditMemoId)?.customerId).toBe(a.customerId)
      for (const al of a.allocations) expect(inv(al.invoiceId).customer.id).toBe(a.customerId)
    }
    for (const r of creditMemoRefunds) for (const l of r.lines) expect(getCreditMemo(l.creditMemoId)?.customerId).toBe(r.customerId)
  })
  it('no memo is over-used and no invoice goes below zero', () => {
    for (const m of creditMemos) expect(memoRemaining(m.id)).toBeGreaterThanOrEqual(0)
    for (const i of salesInvoices) expect(i.balance).toBeGreaterThanOrEqual(0)
  })
  it('covers every memo status', () => {
    expect(memoStatus('cm-10088')).toBe('active')
    expect(memoStatus('cm-10089')).toBe('partially-used')
    expect(memoStatus('cm-10087')).toBe('used-up')
  })
  it('seeded credit shows on invoices: fully credited → paid, partly → stays overdue', () => {
    expect(inv('SI031').balance).toBe(0)
    expect(inv('SI031').status).toBe('paid')
    expect(inv('SI131').balance).toBe(34_500_000 - 3_500_000)
    expect(inv('SI131').status).toBe('overdue')
  })
  it('invoice detail keeps paid + balance = total and splits cash vs credit', () => {
    const d = getSalesInvoiceDetail('SI131')
    expect(d.amountPaid + d.balance).toBe(d.totals.total)
    expect(d.creditApplied).toBe(3_500_000)
    expect(d.cashPaid).toBe(0)
  })
})

describe('invoice status derivation', () => {
  it('paid > overdue > partially paid > open', () => {
    expect(deriveInvoiceStatus({ total: 100, dueDate: '2026-01-01' }, 0)).toBe('paid')
    expect(deriveInvoiceStatus({ total: 100, dueDate: '2026-01-01' }, 50)).toBe('overdue')
    expect(deriveInvoiceStatus({ total: 100, dueDate: '2026-12-31' }, 50)).toBe('partially-paid')
    expect(deriveInvoiceStatus({ total: 100, dueDate: '2026-12-31' }, 100)).toBe('open')
  })
})

describe('apply credit memo', () => {
  const base = { customerId: 'C013', creditMemoId: 'cm-10088', date: '2026-08-22', memo: '', attachments: [] }

  it('happy path: reduces invoice balance, memo remaining, moves invoice to partially paid', () => {
    const before = inv('SI138').balance
    const res = createApplication({ ...base, allocations: [{ invoiceId: 'SI138', amount: 5_000_000 }] })
    expect(res.ok).toBe(true)
    expect(inv('SI138').balance).toBe(before - 5_000_000)
    expect(inv('SI138').status).toBe('partially-paid')
    expect(memoRemaining('cm-10088')).toBe(5_000_000)
    expect(customerAvailableCredit('C013')).toBe(5_000_000 + 2_000_000)
  })
  it('rejects nothing entered, over balance, over available, before memo date, before invoice date', () => {
    expect(validateApplication({ ...base, allocations: [] }).errors.total?.code).toBe('NOTHING_ENTERED')
    expect(validateApplication({ ...base, creditMemoId: '', allocations: [{ invoiceId: 'SI138', amount: 1 }] }).errors.creditMemo?.code).toBe('REQUIRED')
    const over = validateApplication({ ...base, creditMemoId: 'cm-10091', customerId: 'C001', allocations: [{ invoiceId: 'SI001', amount: 5_000_000 }] })
    expect(over.errors.rows.SI001).toEqual({ code: 'OVER_BALANCE', limit: 4_500_000 })
    const tooMuch = validateApplication({ ...base, allocations: [{ invoiceId: 'SI013', amount: 6_000_000 }, { invoiceId: 'SI138', amount: 6_000_000 }] })
    expect(tooMuch.errors.total).toEqual({ code: 'OVER_AVAILABLE', limit: 10_000_000 })
    expect(validateApplication({ ...base, date: '2026-08-01', allocations: [{ invoiceId: 'SI013', amount: 1 }] }).errors.date?.code).toBe('BEFORE_MEMO_DATE')
    // invoice SI138 is dated 1 Aug; memo #10080 is dated 20 Jul → applying on 25 Jul is before the invoice
    const early = validateApplication({ ...base, creditMemoId: 'cm-10080', date: '2026-07-25', allocations: [{ invoiceId: 'SI138', amount: 1 }] })
    expect(early.errors.rows.SI138?.code).toBe('BEFORE_INVOICE_DATE')
  })
  it('edit mode ignores its own allocations when checking limits', () => {
    const res = createApplication({ ...base, allocations: [{ invoiceId: 'SI138', amount: 10_000_000 }] })
    expect(res.ok).toBe(true)
    const id = (res as { id: string }).id
    expect(memoRemaining('cm-10088')).toBe(0)
    // Raising nothing, just re-saving the same 10M must still be valid.
    expect(validateApplication({ ...base, allocations: [{ invoiceId: 'SI138', amount: 10_000_000 }] }, id).ok).toBe(true)
    expect(applicableInvoices('C013', id).map((i) => i.id)).toContain('SI138')
    expect(updateApplication(id, { ...base, allocations: [{ invoiceId: 'SI013', amount: 4_000_000 }] }).ok).toBe(true)
    expect(invoiceCreditApplied('SI138')).toBe(0)
    expect(invoiceCreditApplied('SI013')).toBe(4_000_000)
  })
  it('delete restores invoice balance/status and memo credit', () => {
    const before = { bal: inv('SI131').balance }
    expect(deleteApplication('cma-90100').ok).toBe(true)
    expect(inv('SI031').balance).toBe(4_500_000)
    expect(inv('SI031').status).toBe('overdue')
    expect(inv('SI131').balance).toBe(before.bal + 3_500_000)
    expect(memoStatus('cm-10089')).toBe('active')
  })
  it('a fully-credited invoice drops out of the applicable list', () => {
    expect(applicableInvoices('C006').map((i) => i.id)).not.toContain('SI031')
  })
})

describe('credit memo refund', () => {
  const base = { customerId: 'C013', payFromAccountId: 'CA003', date: '2026-08-22', memo: '', attachments: [] }
  it('refund reduces remaining; over-available and missing pay-from are rejected', () => {
    expect(validateRefund({ ...base, payFromAccountId: '', lines: [{ creditMemoId: 'cm-10088', reason: '', amount: 1 }] }).errors.payFrom?.code).toBe('REQUIRED')
    expect(validateRefund({ ...base, lines: [{ creditMemoId: 'cm-10080', reason: '', amount: 3_000_000 }] }).errors.rows['cm-10080']).toEqual({ code: 'OVER_AVAILABLE', limit: 2_000_000 })
    const res = createRefund({ ...base, lines: [{ creditMemoId: 'cm-10088', reason: 'Cash back', amount: 4_000_000 }, { creditMemoId: 'cm-10080', reason: '', amount: 2_000_000 }] })
    expect(res.ok).toBe(true)
    expect(memoRemaining('cm-10088')).toBe(6_000_000)
    expect(memoStatus('cm-10080')).toBe('used-up')
    expect(deleteRefund((res as { id: string }).id).ok).toBe(true)
    expect(memoStatus('cm-10080')).toBe('active')
  })
  it('refunds do not touch invoice balances', () => {
    const before = invoiceBalance('SI138')
    createRefund({ ...base, lines: [{ creditMemoId: 'cm-10088', reason: '', amount: 1_000_000 }] })
    expect(invoiceBalance('SI138')).toBe(before)
  })
})

describe('credit memo create / edit / delete guards', () => {
  it('cannot delete a memo that has applications or refunds; can delete an unused one', () => {
    expect(canDeleteCreditMemo('cm-10087')).toEqual({ ok: false, applications: 1, refunds: 1 })
    expect(deleteCreditMemo('cm-10087').ok).toBe(false)
    expect(deleteCreditMemo('cm-10091').ok).toBe(true)
  })
  it('cannot reduce a memo below what was already used, nor move it to another customer', () => {
    const m = getCreditMemo('cm-10089')!
    const draft = { customerId: m.customerId, date: m.date, memo: m.memo, attachments: [], lines: [{ id: 'x', accountCode: '4-20000', reason: '', amount: 5_000_000 }] }
    expect(validateMemo(draft, m.id).errors.total).toEqual({ code: 'BELOW_USED', used: 8_000_000 })
    expect(validateMemo({ ...draft, customerId: 'C001', lines: [{ ...draft.lines[0]!, amount: 12_000_000 }] }, m.id).errors.customer?.code).toBe('CUSTOMER_LOCKED')
    expect(validateMemo({ ...draft, date: '2026-08-15', lines: [{ ...draft.lines[0]!, amount: 12_000_000 }] }, m.id).errors.date?.code).toBe('AFTER_FIRST_USE')
    expect(updateCreditMemo(m.id, { ...draft, lines: [{ ...draft.lines[0]!, amount: 9_000_000 }] }).ok).toBe(true)
    expect(memoRemaining(m.id)).toBe(1_000_000)
  })
  it('creates a numbered memo and requires account + positive amount per line', () => {
    const bad = validateMemo({ customerId: 'C004', date: '2026-08-22', memo: '', attachments: [], lines: [{ id: 'a', accountCode: '', reason: 'x', amount: 0 }] })
    expect(bad.errors.lines.a).toEqual({ account: { code: 'REQUIRED' }, amount: { code: 'AMOUNT_POSITIVE' } })
    const res = createCreditMemo({ customerId: 'C004', date: '2026-08-22', memo: '', attachments: [], lines: [{ id: 'a', accountCode: '4-20000', reason: 'Return', amount: 1_000_000 }] })
    expect(res.ok).toBe(true)
    const m = getCreditMemo((res as { id: string }).id)!
    expect(m.number).toBe(10092)
    expect(memoTotal(m)).toBe(1_000_000)
  })
})

describe('journals balance', () => {
  it('debits equal credits for every seeded document', () => {
    const sum = (rows: { debit?: number; credit?: number }[], k: 'debit' | 'credit') => rows.reduce((s, r) => s + (r[k] ?? 0), 0)
    for (const m of creditMemos) { const j = memoJournal(m); expect(sum(j, 'debit')).toBe(sum(j, 'credit')) }
    for (const a of creditMemoApplications) { const j = applicationJournal(a); expect(sum(j, 'debit')).toBe(sum(j, 'credit')) }
    for (const r of creditMemoRefunds) { const j = refundJournal(r); expect(sum(j, 'debit')).toBe(sum(j, 'credit')) }
  })
})

describe('credit memo report is derived from the documents', () => {
  it('report remaining equals document remaining for every memo', () => {
    for (const c of creditMemoLedger()) for (const cm of c.cms) expect(remainingOf(cm)).toBe(memoRemaining(cm.id))
  })
  it('a new application appears in the report immediately', () => {
    createApplication({ customerId: 'C013', creditMemoId: 'cm-10088', date: '2026-08-22', memo: '', attachments: [], allocations: [{ invoiceId: 'SI138', amount: 2_000_000 }] })
    const cm = creditMemoReport({ ...emptyCmReportFilters(), showZero: true }).flatMap((c) => c.cms).find((x) => x.id === 'cm-10088')!
    expect(cm.mutations.some((m) => m.type === 'Applied' && m.amount === -2_000_000)).toBe(true)
    expect(remainingOf(cm)).toBe(8_000_000)
  })
  it('cash paid is unchanged by credit', () => {
    expect(invoiceCashPaid('SI131')).toBe(0)
  })
})
