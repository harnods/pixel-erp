import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import { purchaseInvoices } from './purchaseInvoices'
import { cashAccounts } from './cashAccounts'
import { SIM_TODAY_ISO } from './simClock'
import type { PurchaseInvoice } from './types'
import {
  invoiceBalance as debitMemoInvoiceBalance,
  syncPurchaseInvoiceBalances,
  _setCashPaidFn,
  vendorNameOf,
  purchaseInvoiceById,
  AP_ACCOUNT,
} from './debitMemos'

export { vendorNameOf }

/**
 * Purchase Payment — cash disbursement against one or more open purchase invoices.
 *
 * Single source of truth. Derived quantities:
 *   balance(invoice) = total − Σ cash paid − Σ debit applied
 *   status(invoice)  = paid · overdue · partially-paid · open
 *
 * The invoice overlay lives in debitMemos.ts (`syncPurchaseInvoiceBalances`) and accounts
 * for both cash payments (from this module) and debit applications.
 *
 * Persistence: snapshot-persisted (persist.ts). "Reset demo data" wipes the
 * snapshots and the deterministic seed below comes back.
 */

// ── Reference data ─────────────────────────────────────────────────────────────

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

export interface PpAttachment { name: string; sizeKB: number }
export interface PpActivityDetail { label: string; value: string }
export interface PpActivity { date: string; user: string; activity: string; details: PpActivityDetail[] }

export interface PaymentAllocation {
  invoiceId: string
  amount: number
}

export interface PurchasePayment {
  id: string
  number: number                  // "Purchase Payment #60001"
  vendorId: string
  depositToAccountId: string      // cashAccounts.ts id (pay from)
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
  attachments: PpAttachment[]
  createdAt: string
  updatedAt: string
  updatedBy: string
  history: PpActivity[]
}

// ── Labels ─────────────────────────────────────────────────────────────────────

export const paymentLabel = (n: number) => `Purchase Payment #${n}`
export const invoiceLabel = (n: string) => `Purchase Invoice #${n}`

export function invoiceById(id: string): PurchaseInvoice | undefined {
  return purchaseInvoiceById(id)
}

// ── Seed ───────────────────────────────────────────────────────────────────────

function stamp(date: string, time = '10:15'): string { return `${date}T${time}:00+07:00` }
function created(date: string, details: PpActivityDetail[]): PpActivity[] {
  return [{ date: stamp(date), user: CURRENT_USER, activity: 'Created', details }]
}

function seedPayments(): PurchasePayment[] {
  return [
    {
      id: 'pp-60001', number: 60001, vendorId: 'V001',
      depositToAccountId: 'CA003', date: '2026-08-15',
      paymentMethod: 'Bank transfer', referenceNo: '',
      allocations: [{ invoiceId: 'PI001', amount: 1_800_000 }],
      withholding: null,
      memo: 'Payment to Klasik Beans Cooperative for green bean shipment.',
      tags: [], attachments: [],
      createdAt: stamp('2026-08-15'), updatedAt: stamp('2026-08-15'), updatedBy: CURRENT_USER,
      history: created('2026-08-15', [
        { label: 'Transaction no.', value: paymentLabel(60001) },
        { label: 'Vendor', value: 'Klasik Beans Cooperative' },
        { label: 'Deposit to', value: '1-10003 Bank BCA' },
        { label: 'Total', value: 'Rp1.800.000,00' },
      ]),
    },
    {
      id: 'pp-60002', number: 60002, vendorId: 'V006',
      depositToAccountId: 'CA003', date: '2026-08-10',
      paymentMethod: 'Bank transfer', referenceNo: 'KPN-08-2026',
      allocations: [{ invoiceId: 'PI002', amount: 6_400_000 }],
      withholding: { accountCode: '2-30002', amount: 640_000 },
      memo: 'Payment with PPh 23 withholding to PT Kemasan Prima Nusantara.',
      tags: [], attachments: [{ name: 'bukti-transfer-kpn.pdf', sizeKB: 92.0 }],
      createdAt: stamp('2026-08-10'), updatedAt: stamp('2026-08-10'), updatedBy: CURRENT_USER,
      history: created('2026-08-10', [
        { label: 'Transaction no.', value: paymentLabel(60002) },
        { label: 'Vendor', value: 'PT Kemasan Prima Nusantara' },
        { label: 'Deposit to', value: '1-10003 Bank BCA' },
        { label: 'Total', value: 'Rp5.760.000,00' },
      ]),
    },
  ]
}

const K_PAYMENTS = 'purchase-payments-v1'

export const purchasePayments = reactive<PurchasePayment[]>(loadSnapshot<PurchasePayment>(K_PAYMENTS) ?? seedPayments())

function persistAll(): void {
  saveSnapshot(K_PAYMENTS, purchasePayments)
}

// ── Lookups ────────────────────────────────────────────────────────────────────

export const getPurchasePayment = (id: string) => purchasePayments.find((p) => p.id === id)

export function paymentSubtotal(p: Pick<PurchasePayment, 'allocations'>): number {
  return p.allocations.reduce((s, a) => s + a.amount, 0)
}
export function paymentWht(p: Pick<PurchasePayment, 'withholding'>): number {
  return p.withholding?.amount ?? 0
}
export function paymentTotal(p: Pick<PurchasePayment, 'allocations' | 'withholding'>): number {
  return paymentSubtotal(p) - paymentWht(p)
}

export function paymentsForInvoice(invoiceId: string): { payment: PurchasePayment; amount: number }[] {
  const out: { payment: PurchasePayment; amount: number }[] = []
  for (const p of purchasePayments) {
    const amt = p.allocations.filter((a) => a.invoiceId === invoiceId).reduce((s, a) => s + a.amount, 0)
    if (amt > 0) out.push({ payment: p, amount: amt })
  }
  return out.sort((x, y) => y.payment.date.localeCompare(x.payment.date))
}

export function purchaseInvoiceCashPaid(invoiceId: string, excludePaymentId?: string): number {
  let sum = 0
  for (const p of purchasePayments) {
    if (p.id === excludePaymentId) continue
    for (const a of p.allocations) if (a.invoiceId === invoiceId) sum += a.amount
  }
  return sum
}

// ── Invoice balance helper (for validation / form) ───────────────────────────

/**
 * Balance available for payment allocation.
 *
 * debitMemos.invoiceBalance already subtracts both debit applications AND cash paid
 * (via the wired _setCashPaidFn). When editing an existing payment, we add back
 * the excluded payment's cash so the user can reallocate it.
 */
export function invoiceBalanceAfterPayments(invoiceId: string, excludePaymentId?: string): number {
  const balance = debitMemoInvoiceBalance(invoiceId)
  if (!excludePaymentId) return balance
  // Add back the amount allocated by the payment being edited
  const excluded = purchaseInvoiceCashPaid(invoiceId) - purchaseInvoiceCashPaid(invoiceId, excludePaymentId)
  return balance + excluded
}

// ── Numbering ──────────────────────────────────────────────────────────────────

export const nextPaymentNumber = () => Math.max(60000, ...purchasePayments.map((p) => p.number)) + 1

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
  vendorId: string
  depositToAccountId: string
  date: string
  paymentMethod: string
  referenceNo: string
  allocations: PaymentAllocation[]
  withholding: { accountCode: string; amount: number } | null
  memo: string
  tags?: string[]
  attachments: PpAttachment[]
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

export function payableInvoices(vendorId: string, excludePaymentId?: string): PurchaseInvoice[] {
  const inEdit = new Set(excludePaymentId ? (getPurchasePayment(excludePaymentId)?.allocations.map((a) => a.invoiceId) ?? []) : [])
  return purchaseInvoices
    .filter((i) => i.vendor.id === vendorId && (invoiceBalanceAfterPayments(i.id, excludePaymentId) > 0 || inEdit.has(i.id)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number))
}

// ── Mutations ──────────────────────────────────────────────────────────────────

export type MutationResult = { ok: true; id: string } | { ok: false; reason: string }

function diff(label: string, before: string, after: string, out: PpActivityDetail[]) {
  if (before !== after) out.push({ label, value: `${before || '—'} → ${after || '—'}` })
}

export function createPurchasePayment(d: PaymentDraft): MutationResult {
  const v = validatePayment(d)
  if (!v.ok) return { ok: false, reason: 'INVALID' }
  const number = nextPaymentNumber()
  const at = nowIso()
  const allocations = d.allocations.filter((a) => a.amount > 0)
  const wht = d.withholding && d.withholding.amount > 0 ? d.withholding : null
  const subtotal = allocations.reduce((s, a) => s + a.amount, 0)
  const total = subtotal - (wht?.amount ?? 0)
  const p: PurchasePayment = {
    id: uid('pp'), number, vendorId: d.vendorId,
    depositToAccountId: d.depositToAccountId, date: d.date,
    paymentMethod: d.paymentMethod, referenceNo: d.referenceNo,
    allocations, withholding: wht,
    memo: d.memo.trim(), tags: d.tags ?? [], attachments: d.attachments,
    createdAt: at, updatedAt: at, updatedBy: CURRENT_USER,
    history: [{ date: at, user: CURRENT_USER, activity: 'Created', details: [
      { label: 'Transaction no.', value: paymentLabel(number) },
      { label: 'Vendor', value: vendorNameOf(d.vendorId) },
      { label: 'Deposit to', value: cashAccountLabel(d.depositToAccountId) },
      { label: 'Transaction date', value: dmy(d.date) },
      { label: 'Total', value: rp(total) },
    ] }],
  }
  purchasePayments.unshift(p)
  persistAll()
  syncPurchaseInvoiceBalances()
  return { ok: true, id: p.id }
}

export function updatePurchasePayment(id: string, d: PaymentDraft): MutationResult {
  const p = getPurchasePayment(id)
  if (!p) return { ok: false, reason: 'NOT_FOUND' }
  const v = validatePayment(d, id)
  if (!v.ok) return { ok: false, reason: 'INVALID' }
  const allocations = d.allocations.filter((a) => a.amount > 0)
  const wht = d.withholding && d.withholding.amount > 0 ? d.withholding : null
  const changes: PpActivityDetail[] = []
  diff('Vendor', vendorNameOf(p.vendorId), vendorNameOf(d.vendorId), changes)
  diff('Deposit to', cashAccountLabel(p.depositToAccountId), cashAccountLabel(d.depositToAccountId), changes)
  diff('Transaction date', dmy(p.date), dmy(d.date), changes)
  diff('Total', rp(paymentTotal(p)), rp(paymentSubtotal({ allocations }) - (wht?.amount ?? 0)), changes)
  diff('Memo', p.memo, d.memo.trim(), changes)
  const at = nowIso()
  Object.assign(p, { vendorId: d.vendorId, depositToAccountId: d.depositToAccountId, date: d.date, paymentMethod: d.paymentMethod, referenceNo: d.referenceNo, allocations, withholding: wht, memo: d.memo.trim(), tags: d.tags ?? p.tags ?? [], attachments: d.attachments, updatedAt: at, updatedBy: CURRENT_USER })
  p.history.unshift({ date: at, user: CURRENT_USER, activity: 'Edited', details: changes.length ? changes : [{ label: 'Lines', value: 'Updated' }] })
  persistAll()
  syncPurchaseInvoiceBalances()
  return { ok: true, id }
}

export function deletePurchasePayment(id: string): MutationResult {
  const i = purchasePayments.findIndex((p) => p.id === id)
  if (i === -1) return { ok: false, reason: 'NOT_FOUND' }
  purchasePayments.splice(i, 1)
  persistAll()
  syncPurchaseInvoiceBalances()
  return { ok: true, id }
}

// ── Journal entries ────────────────────────────────────────────────────────────

export interface PpJournalRow { account: string; debit?: number; credit?: number }

/**
 * Purchase payment journal: Debit AP (reduce payable), Credit cash account.
 * If withholding: Credit WHT payable account instead of part of cash.
 *
 *   Dr  AP_ACCOUNT                         subtotal
 *   Cr  Cash account (deposit from)        subtotal - wht
 *   Cr  WHT payable account                wht (if any)
 */
export function paymentJournal(p: PurchasePayment): PpJournalRow[] {
  const sub = paymentSubtotal(p)
  const rows: PpJournalRow[] = [
    { account: AP_ACCOUNT, debit: sub },
  ]
  rows.push({ account: cashAccountLabel(p.depositToAccountId), credit: sub - (p.withholding?.amount ?? 0) })
  if (p.withholding && p.withholding.amount > 0) {
    rows.push({ account: whtAccountLabel(p.withholding.accountCode), credit: p.withholding.amount })
  }
  return rows
}

// ── Wire cash-paid into debitMemos.ts (breaks circular dependency) ────────
_setCashPaidFn(purchaseInvoiceCashPaid)
syncPurchaseInvoiceBalances()
