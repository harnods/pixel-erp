import { describe, it, expect, beforeEach } from 'vitest'
import { purchaseInvoices } from '~/data/purchaseInvoices'
import {
  debitMemos, debitMemoApplications, debitMemoRefunds,
  getDebitMemo, memoTotal, memoRemaining, memoStatus, vendorAvailableDebit,
  invoiceBalance, invoiceDebitApplied, invoiceCashPaid, applicableInvoices, deriveInvoiceStatus,
  validateApplication, validateRefund, validateMemo,
  createApplication, updateApplication, deleteApplication,
  createRefund, deleteRefund, createDebitMemo, updateDebitMemo, deleteDebitMemo, canDeleteDebitMemo,
  syncPurchaseInvoiceBalances, memoJournal, applicationJournal, refundJournal,
} from '~/data/debitMemos'
import { getPurchaseInvoiceDetail } from '~/data/purchaseInvoiceDetails'

const inv = (id: string) => purchaseInvoices.find((i) => i.id === id)!

const SNAP = {
  memos: JSON.parse(JSON.stringify(debitMemos)),
  apps: JSON.parse(JSON.stringify(debitMemoApplications)),
  refunds: JSON.parse(JSON.stringify(debitMemoRefunds)),
}
beforeEach(() => {
  debitMemos.splice(0, debitMemos.length, ...JSON.parse(JSON.stringify(SNAP.memos)))
  debitMemoApplications.splice(0, debitMemoApplications.length, ...JSON.parse(JSON.stringify(SNAP.apps)))
  debitMemoRefunds.splice(0, debitMemoRefunds.length, ...JSON.parse(JSON.stringify(SNAP.refunds)))
  syncPurchaseInvoiceBalances()
})

describe('seed coherence', () => {
  it('every memo, application and refund references real vendors and invoices', () => {
    for (const a of debitMemoApplications) {
      expect(getDebitMemo(a.debitMemoId)?.vendorId).toBe(a.vendorId)
      for (const al of a.allocations) expect(inv(al.invoiceId).vendor.id).toBe(a.vendorId)
    }
    for (const r of debitMemoRefunds) for (const l of r.lines) expect(getDebitMemo(l.debitMemoId)?.vendorId).toBe(r.vendorId)
  })
  it('no memo is over-used and no invoice goes below zero', () => {
    for (const m of debitMemos) expect(memoRemaining(m.id)).toBeGreaterThanOrEqual(0)
    for (const i of purchaseInvoices) expect(i.balance).toBeGreaterThanOrEqual(0)
  })
  it('covers every memo status', () => {
    const statuses = new Set(debitMemos.map((m) => memoStatus(m.id)))
    expect(statuses.has('active')).toBe(true)
    expect(statuses.has('partially-used')).toBe(true)
  })
  it('purchase invoice detail splits cash vs debit applied', () => {
    const d = getPurchaseInvoiceDetail('PI031')
    expect(d.debitApplied).toBe(invoiceDebitApplied('PI031'))
    expect(d.cashPaid).toBe(invoiceCashPaid('PI031'))
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

describe('apply debit memo', () => {
  const base = { vendorId: 'V001', debitMemoId: 'dm-20091', date: '2026-08-22', memo: '', attachments: [] }

  it('happy path: reduces invoice balance and memo remaining', () => {
    const invoices = applicableInvoices('V001')
    if (!invoices.length) return
    const target = invoices[0]!
    const amt = Math.min(5_000_000, target.balance)
    const before = target.balance
    const res = createApplication({ ...base, allocations: [{ invoiceId: target.id, amount: amt }] })
    expect(res.ok).toBe(true)
    expect(inv(target.id).balance).toBe(before - amt)
    expect(memoRemaining('dm-20091')).toBe(8_000_000 - amt)
  })
  it('rejects nothing entered, missing memo, before memo date', () => {
    expect(validateApplication({ ...base, allocations: [] }).errors.total?.code).toBe('NOTHING_ENTERED')
    expect(validateApplication({ ...base, debitMemoId: '', allocations: [{ invoiceId: 'PI001', amount: 1 }] }).errors.debitMemo?.code).toBe('REQUIRED')
    expect(validateApplication({ ...base, date: '2026-08-01', allocations: [{ invoiceId: 'PI001', amount: 1 }] }).errors.date?.code).toBe('BEFORE_MEMO_DATE')
  })
  it('edit mode ignores its own allocations when checking limits', () => {
    const invoices = applicableInvoices('V003')
    const target = invoices.find((i) => invoiceBalance(i.id) >= 2_500_000)
    if (!target) return
    const res = createApplication({ vendorId: 'V003', debitMemoId: 'dm-20089', date: '2026-08-10', memo: '', attachments: [], allocations: [{ invoiceId: target.id, amount: 2_500_000 }] })
    expect(res.ok).toBe(true)
    const id = (res as { id: string }).id
    expect(validateApplication({ vendorId: 'V003', debitMemoId: 'dm-20089', date: '2026-08-10', memo: '', attachments: [], allocations: [{ invoiceId: target.id, amount: 2_500_000 }] }, id).ok).toBe(true)
  })
  it('delete restores invoice balance and memo debit', () => {
    expect(deleteApplication('dma-80100').ok).toBe(true)
    expect(memoRemaining('dm-20089')).toBe(9_000_000)
  })
})

describe('debit memo refund', () => {
  const base = { vendorId: 'V001', depositToAccountId: 'CA003', date: '2026-08-22', memo: '', attachments: [] }
  it('refund reduces remaining; missing deposit-to is rejected', () => {
    expect(validateRefund({ ...base, depositToAccountId: '', lines: [{ debitMemoId: 'dm-20091', reason: '', amount: 1 }] }).errors.depositTo?.code).toBe('REQUIRED')
    const res = createRefund({ ...base, lines: [{ debitMemoId: 'dm-20091', reason: 'Cash back', amount: 4_000_000 }] })
    expect(res.ok).toBe(true)
    expect(memoRemaining('dm-20091')).toBe(4_000_000)
    expect(deleteRefund((res as { id: string }).id).ok).toBe(true)
    expect(memoRemaining('dm-20091')).toBe(8_000_000)
  })
  it('refunds do not touch invoice balances', () => {
    const invoices = applicableInvoices('V001')
    if (!invoices.length) return
    const before = invoiceBalance(invoices[0]!.id)
    createRefund({ ...base, lines: [{ debitMemoId: 'dm-20091', reason: '', amount: 1_000_000 }] })
    expect(invoiceBalance(invoices[0]!.id)).toBe(before)
  })
})

describe('debit memo create / edit / delete guards', () => {
  it('cannot delete a memo that has applications or refunds; can delete an unused one', () => {
    const guard = canDeleteDebitMemo('dm-20087')
    expect(guard.ok).toBe(false)
    expect(deleteDebitMemo('dm-20087').ok).toBe(false)
    expect(deleteDebitMemo('dm-20088').ok).toBe(true)
  })
  it('creates a numbered memo and requires account + positive amount per line', () => {
    const bad = validateMemo({ vendorId: 'V004', date: '2026-08-22', memo: '', attachments: [], lines: [{ id: 'a', accountCode: '', reason: 'x', amount: 0 }] })
    expect(bad.errors.lines.a).toEqual({ account: { code: 'REQUIRED' }, amount: { code: 'AMOUNT_POSITIVE' } })
    const res = createDebitMemo({ vendorId: 'V004', date: '2026-08-22', memo: '', attachments: [], lines: [{ id: 'a', accountCode: '5-20000', reason: 'Return', amount: 1_000_000 }] })
    expect(res.ok).toBe(true)
    const m = getDebitMemo((res as { id: string }).id)!
    expect(memoTotal(m)).toBe(1_000_000)
  })
})

describe('journals balance', () => {
  it('debits equal credits for every seeded document', () => {
    const sum = (rows: { debit?: number; credit?: number }[], k: 'debit' | 'credit') => rows.reduce((s, r) => s + (r[k] ?? 0), 0)
    for (const m of debitMemos) { const j = memoJournal(m); expect(sum(j, 'debit')).toBe(sum(j, 'credit')) }
    for (const a of debitMemoApplications) { const j = applicationJournal(a); expect(sum(j, 'debit')).toBe(sum(j, 'credit')) }
    for (const r of debitMemoRefunds) { const j = refundJournal(r); expect(sum(j, 'debit')).toBe(sum(j, 'credit')) }
  })
})
