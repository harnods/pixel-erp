import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import { salesInvoices } from './salesInvoices'
import { cashAccounts } from './cashAccounts'
import { SIM_TODAY_ISO } from './simClock'
import type { SalesInvoice } from './types'
import { invoiceCreditApplied, _setCashReceivedFn, syncInvoiceBalances } from './creditMemos'

/**
 * Payment Received — cash collection against one or more open sales invoices.
 *
 * Single source of truth. Derived quantities:
 *   balance(invoice) = total − Σ cash received − Σ credit applied
 *   status(invoice)  = paid · overdue · partially-paid · open
 *
 * The invoice overlay lives in creditMemos.ts (`syncInvoiceBalances`) and accounts
 * for both cash payments (from this module) and credit applications.
 *
 * Persistence: snapshot-persisted (persist.ts). "Reset demo data" wipes the
 * snapshots and the deterministic seed below comes back.
 */

// ── Reference data ─────────────────────────────────────────────────────────────

export const AR_ACCOUNT = '1-20000 Accounts receivable'
export const CURRENT_USER = 'Rizal Candra'

export function depositToAccounts() {
  const parentIds = new Set(cashAccounts.map((a) => a.parentId).filter(Boolean) as string[])
  return cashAccounts.filter((a) =>
    !a.isArchived && a.currency === 'IDR' && a.code.startsWith('1-') && !parentIds.has(a.id),
  )
}
export function cashAccountLabel(id: string): string {
  const a = cashAccounts.find((x) => x.id === id)
  return a ? `${a.code} ${a.name}` : id
}

// WHT accounts — the expense accounts a withholding tax posts against.
export const WHT_ACCOUNTS: { code: string; name: string }[] = [
  { code: '2-30001', name: 'PPh 21 Payable' },
  { code: '2-30002', name: 'PPh 23 Payable' },
  { code: '2-30003', name: 'PPh 4(2) Payable' },
  { code: '2-30004', name: 'PPh 22 Payable' },
  { code: '2-30005', name: 'PPh 15 Payable' },
]
export function whtAccountLabel(code: string): string {
  const a = WHT_ACCOUNTS.find((x) => x.code === code)
  return a ? `${a.code} ${a.name}` : code
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PrAttachment { name: string; sizeKB: number }
export interface PrActivityDetail { label: string; value: string }
export interface PrActivity { date: string; user: string; activity: string; details: PrActivityDetail[] }

export interface PaymentAllocation {
  invoiceId: string
  amount: number
}

export interface PaymentReceived {
  id: string
  number: number                  // "Payment Received #50001"
  customerId: string
  depositToAccountId: string      // cashAccounts.ts id
  date: string                    // ISO yyyy-mm-dd
  paymentMethod: string
  referenceNo: string
  allocations: PaymentAllocation[]
  withholding: {
    accountCode: string
    amount: number
  } | null
  memo: string
  tags: string[]
  attachments: PrAttachment[]
  createdAt: string
  updatedAt: string
  updatedBy: string
  history: PrActivity[]
}

// ── Labels ─────────────────────────────────────────────────────────────────────

export const paymentLabel = (n: number) => `Payment Received #${n}`
export const invoiceLabel = (n: number) => `Sales Invoice #${n}`

export function invoiceById(id: string): SalesInvoice | undefined {
  return salesInvoices.find((i) => i.id === id)
}

// ── Seed ───────────────────────────────────────────────────────────────────────

function stamp(date: string, time = '10:15'): string { return `${date}T${time}:00+07:00` }
function created(date: string, details: PrActivityDetail[]): PrActivity[] {
  return [{ date: stamp(date), user: CURRENT_USER, activity: 'Created', details }]
}

function seedPayments(): PaymentReceived[] {
  return [
    {
      id: 'pr-50001', number: 50001, customerId: 'C007',
      depositToAccountId: 'CA003', date: '2026-08-18',
      paymentMethod: 'Bank transfer', referenceNo: '',
      allocations: [{ invoiceId: 'SI007', amount: 16_500_000 }],
      withholding: null,
      memo: 'Transfer received from Common Grounds PIK.',
      tags: [], attachments: [],
      createdAt: stamp('2026-08-18'), updatedAt: stamp('2026-08-18'), updatedBy: CURRENT_USER,
      history: created('2026-08-18', [
        { label: 'Transaction no.', value: paymentLabel(50001) },
        { label: 'Customer', value: 'Common Grounds PIK' },
        { label: 'Deposit to', value: '1-10003 Bank BCA' },
        { label: 'Total', value: 'Rp16.500.000,00' },
      ]),
    },
    {
      id: 'pr-50002', number: 50002, customerId: 'C002',
      depositToAccountId: 'CA003', date: '2026-08-10',
      paymentMethod: 'Bank transfer', referenceNo: 'HDB152902832',
      allocations: [{ invoiceId: 'SI027', amount: 5_000_000 }],
      withholding: { accountCode: '2-30002', amount: 500_000 },
      memo: 'Partial payment with PPh 23 withholding.',
      tags: [], attachments: [{ name: '990374837.pdf', sizeKB: 78.0 }],
      createdAt: stamp('2026-08-10'), updatedAt: stamp('2026-08-10'), updatedBy: CURRENT_USER,
      history: created('2026-08-10', [
        { label: 'Transaction no.', value: paymentLabel(50002) },
        { label: 'Customer', value: 'Tanamera Coffee Roastery' },
        { label: 'Deposit to', value: '1-10003 Bank BCA' },
        { label: 'Total', value: 'Rp4.500.000,00' },
      ]),
    },
  ]
}

const K_PAYMENTS = 'payments-received-v1'

export const paymentsReceived = reactive<PaymentReceived[]>(loadSnapshot<PaymentReceived>(K_PAYMENTS) ?? seedPayments())

function persistAll(): void {
  saveSnapshot(K_PAYMENTS, paymentsReceived)
}

// ── Lookups ────────────────────────────────────────────────────────────────────

export const getPaymentReceived = (id: string) => paymentsReceived.find((p) => p.id === id)

export function paymentSubtotal(p: Pick<PaymentReceived, 'allocations'>): number {
  return p.allocations.reduce((s, a) => s + a.amount, 0)
}
export function paymentWht(p: Pick<PaymentReceived, 'withholding'>): number {
  return p.withholding?.amount ?? 0
}
export function paymentTotal(p: Pick<PaymentReceived, 'allocations' | 'withholding'>): number {
  return paymentSubtotal(p) - paymentWht(p)
}

export function paymentsForInvoice(invoiceId: string): { payment: PaymentReceived; amount: number }[] {
  const out: { payment: PaymentReceived; amount: number }[] = []
  for (const p of paymentsReceived) {
    const amt = p.allocations.filter((a) => a.invoiceId === invoiceId).reduce((s, a) => s + a.amount, 0)
    if (amt > 0) out.push({ payment: p, amount: amt })
  }
  return out.sort((x, y) => y.payment.date.localeCompare(x.payment.date))
}

export function invoiceCashReceived(invoiceId: string, excludePaymentId?: string): number {
  let sum = 0
  for (const p of paymentsReceived) {
    if (p.id === excludePaymentId) continue
    for (const a of p.allocations) if (a.invoiceId === invoiceId) sum += a.amount
  }
  return sum
}

// ── Invoice balance helper (for validation / form) ───────────────────────────

import { invoiceBalance } from './creditMemos'

export function invoiceBalanceAfterPayments(invoiceId: string, excludePaymentId?: string): number {
  const balance = invoiceBalance(invoiceId)
  if (!excludePaymentId) return balance
  const excluded = invoiceCashReceived(invoiceId) - invoiceCashReceived(invoiceId, excludePaymentId)
  return balance + excluded
}

// ── Numbering ──────────────────────────────────────────────────────────────────

export const nextPaymentNumber = () => Math.max(50000, ...paymentsReceived.map((p) => p.number)) + 1

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}
function nowIso(): string {
  const d = new Date()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${SIM_TODAY_ISO}T${hh}:${mm}:00+07:00`
}
function rp(n: number): string { return `Rp${n.toLocaleString('id-ID')},00` }
function dmy(iso: string): string { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }

// ── Validation ─────────────────────────────────────────────────────────────────

export type FieldError =
  | { code: 'REQUIRED' }
  | { code: 'AMOUNT_POSITIVE' }
  | { code: 'OVER_BALANCE'; limit: number }
  | { code: 'NOTHING_ENTERED' }

export interface PaymentDraft {
  customerId: string
  depositToAccountId: string
  date: string
  paymentMethod: string
  referenceNo: string
  allocations: PaymentAllocation[]
  withholding: { accountCode: string; amount: number } | null
  memo: string
  tags?: string[]
  attachments: PrAttachment[]
}

export interface PaymentErrors {
  depositTo?: FieldError
  date?: FieldError
  rows: Record<string, FieldError>
  total?: FieldError
  whtAccount?: FieldError
  whtAmount?: FieldError
}

export function validatePayment(d: PaymentDraft, editingId?: string): { ok: boolean; errors: PaymentErrors } {
  const e: PaymentErrors = { rows: {} }
  if (!d.depositToAccountId) e.depositTo = { code: 'REQUIRED' }
  if (!d.date) e.date = { code: 'REQUIRED' }
  const active = d.allocations.filter((a) => a.amount > 0)
  for (const a of d.allocations) {
    if (a.amount < 0) { e.rows[a.invoiceId] = { code: 'AMOUNT_POSITIVE' }; continue }
    if (!(a.amount > 0)) continue
    const limit = invoiceBalanceAfterPayments(a.invoiceId, editingId)
    if (a.amount > limit) e.rows[a.invoiceId] = { code: 'OVER_BALANCE', limit }
  }
  if (!active.length) e.total = { code: 'NOTHING_ENTERED' }
  if (d.withholding) {
    if (!d.withholding.accountCode) e.whtAccount = { code: 'REQUIRED' }
    if (!(d.withholding.amount > 0)) e.whtAmount = { code: 'AMOUNT_POSITIVE' }
  }
  const ok = !e.depositTo && !e.date && !e.total && Object.keys(e.rows).length === 0 && !e.whtAccount && !e.whtAmount
  return { ok, errors: e }
}

// ── Applicable invoices ────────────────────────────────────────────────────────

export function payableInvoices(customerId: string, excludePaymentId?: string): SalesInvoice[] {
  const inEdit = new Set(excludePaymentId ? (getPaymentReceived(excludePaymentId)?.allocations.map((a) => a.invoiceId) ?? []) : [])
  return salesInvoices
    .filter((i) => i.customer.id === customerId && (invoiceBalanceAfterPayments(i.id, excludePaymentId) > 0 || inEdit.has(i.id)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.number - b.number)
}

// ── Mutations ──────────────────────────────────────────────────────────────────

export type MutationResult = { ok: true; id: string } | { ok: false; reason: string }

function diff(label: string, before: string, after: string, out: PrActivityDetail[]) {
  if (before !== after) out.push({ label, value: `${before || '—'} → ${after || '—'}` })
}

export function createPaymentReceived(d: PaymentDraft): MutationResult {
  const v = validatePayment(d)
  if (!v.ok) return { ok: false, reason: 'INVALID' }
  const number = nextPaymentNumber()
  const at = nowIso()
  const allocations = d.allocations.filter((a) => a.amount > 0)
  const wht = d.withholding && d.withholding.amount > 0 ? d.withholding : null
  const subtotal = allocations.reduce((s, a) => s + a.amount, 0)
  const total = subtotal - (wht?.amount ?? 0)
  const p: PaymentReceived = {
    id: uid('pr'), number, customerId: d.customerId,
    depositToAccountId: d.depositToAccountId, date: d.date,
    paymentMethod: d.paymentMethod, referenceNo: d.referenceNo,
    allocations, withholding: wht,
    memo: d.memo.trim(), tags: d.tags ?? [], attachments: d.attachments,
    createdAt: at, updatedAt: at, updatedBy: CURRENT_USER,
    history: [{ date: at, user: CURRENT_USER, activity: 'Created', details: [
      { label: 'Transaction no.', value: paymentLabel(number) },
      { label: 'Deposit to', value: cashAccountLabel(d.depositToAccountId) },
      { label: 'Transaction date', value: dmy(d.date) },
      { label: 'Total', value: rp(total) },
    ] }],
  }
  paymentsReceived.unshift(p)
  persistAll()
  syncInvoiceBalances()
  return { ok: true, id: p.id }
}

export function updatePaymentReceived(id: string, d: PaymentDraft): MutationResult {
  const p = getPaymentReceived(id)
  if (!p) return { ok: false, reason: 'NOT_FOUND' }
  const v = validatePayment(d, id)
  if (!v.ok) return { ok: false, reason: 'INVALID' }
  const allocations = d.allocations.filter((a) => a.amount > 0)
  const wht = d.withholding && d.withholding.amount > 0 ? d.withholding : null
  const changes: PrActivityDetail[] = []
  diff('Deposit to', cashAccountLabel(p.depositToAccountId), cashAccountLabel(d.depositToAccountId), changes)
  diff('Transaction date', dmy(p.date), dmy(d.date), changes)
  diff('Total', rp(paymentTotal(p)), rp(paymentSubtotal({ allocations }) - (wht?.amount ?? 0)), changes)
  diff('Memo', p.memo, d.memo.trim(), changes)
  const at = nowIso()
  Object.assign(p, { depositToAccountId: d.depositToAccountId, date: d.date, paymentMethod: d.paymentMethod, referenceNo: d.referenceNo, allocations, withholding: wht, memo: d.memo.trim(), tags: d.tags ?? p.tags ?? [], attachments: d.attachments, updatedAt: at, updatedBy: CURRENT_USER })
  p.history.unshift({ date: at, user: CURRENT_USER, activity: 'Edited', details: changes.length ? changes : [{ label: 'Lines', value: 'Updated' }] })
  persistAll()
  syncInvoiceBalances()
  return { ok: true, id }
}

export function deletePaymentReceived(id: string): MutationResult {
  const i = paymentsReceived.findIndex((p) => p.id === id)
  if (i === -1) return { ok: false, reason: 'NOT_FOUND' }
  paymentsReceived.splice(i, 1)
  persistAll()
  syncInvoiceBalances()
  return { ok: true, id }
}

// ── Journal entries ────────────────────────────────────────────────────────────

export interface PrJournalRow { account: string; debit?: number; credit?: number }

export function paymentJournal(p: PaymentReceived): PrJournalRow[] {
  const sub = paymentSubtotal(p)
  const rows: PrJournalRow[] = [
    { account: cashAccountLabel(p.depositToAccountId), debit: sub - (p.withholding?.amount ?? 0) },
  ]
  if (p.withholding && p.withholding.amount > 0) {
    rows.push({ account: whtAccountLabel(p.withholding.accountCode), debit: p.withholding.amount })
  }
  rows.push({ account: AR_ACCOUNT, credit: sub })
  return rows
}

// ── Customer helpers ───────────────────────────────────────────────────────────

import { getCustomer } from './customers'

export function customerNameOf(id: string): string {
  return getCustomer(id)?.name ?? id
}

// ── Wire cash-received into creditMemos.ts (breaks circular dependency) ─────
_setCashReceivedFn(invoiceCashReceived)
syncInvoiceBalances()
