import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import { purchaseInvoices, persistPurchaseInvoices } from './purchaseInvoices'
import { vendors, vendorById } from './vendors'
import { cashAccounts } from './cashAccounts'
import { SIM_TODAY_ISO, daysUntil } from './simClock'
import type { PurchaseInvoice, InvoiceStatus } from './types'

let invoiceCashPaidFn: (invoiceId: string, excludePaymentId?: string) => number = () => 0
export function _setCashPaidFn(fn: (invoiceId: string, excludePaymentId?: string) => number) { invoiceCashPaidFn = fn }

/**
 * Debit memo (Purchase › Purchase invoices › Debit memo) — the AP-side mirror
 * of creditMemos.ts. Three documents:
 *
 *   • Debit memo             "Debit Memo #20088"          — debit owed BY a vendor
 *   • Debit memo applied     "Debit Memo Applied #80100"  — spends ONE memo across 1..n purchase invoices
 *   • Debit memo refund      "Debit Memo Refund #20020"   — vendor deposits cash back ("Deposit to", not "Pay from")
 *
 * Derived balance rule (same as credit memo):
 *   remaining(memo) = total(memo) − Σ applied(memo) − Σ refunded(memo)
 *
 * Journal direction flips from credit memo:
 *   Memo:    Dr AP (reduce payable) · Cr each line account
 *   Apply:   Dr AP (invoice) · Cr AP (memo)
 *   Refund:  Dr Bank (cash IN from vendor) · Cr AP
 */

// ── Reference data ─────────────────────────────────────────────────────────────

export const DM_ACCOUNTS: { code: string; name: string }[] = [
  { code: '5-20000', name: 'Purchase Returns & Allowances' },
  { code: '5-20001', name: 'Purchase Discounts' },
  { code: '5-10000', name: 'Cost of Goods Sold' },
  { code: '5-10001', name: 'Direct Materials' },
  { code: '6-10005', name: 'General & Administrative' },
]
export const AP_ACCOUNT = '2-10000 Accounts payable'
export const CURRENT_USER = 'Rizal Candra'

export function dmAccountLabel(code: string): string {
  const a = DM_ACCOUNTS.find((x) => x.code === code)
  return a ? `${a.code} ${a.name}` : code
}

export function refundDepositToAccounts() {
  const parentIds = new Set(cashAccounts.map((a) => a.parentId).filter(Boolean) as string[])
  return cashAccounts.filter((a) =>
    !a.isArchived && a.currency === 'IDR' && a.code.startsWith('1-') && !parentIds.has(a.id),
  )
}
export function cashAccountLabel(id: string): string {
  const a = cashAccounts.find((x) => x.id === id)
  return a ? `${a.code} ${a.name}` : id
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DmAttachment { name: string; sizeKB: number }
export interface DmActivityDetail { label: string; value: string }
export interface DmActivity { date: string; user: string; activity: string; details: DmActivityDetail[] }

export interface DebitMemoLine { id: string; accountCode: string; reason: string; amount: number }

export interface PurchaseDebitMemo {
  id: string
  number: number
  vendorId: string
  date: string
  lines: DebitMemoLine[]
  memo: string
  tags: string[]
  attachments: DmAttachment[]
  createdAt: string
  updatedAt: string
  updatedBy: string
  history: DmActivity[]
}

export interface DebitAllocation { invoiceId: string; amount: number }

export interface DebitMemoApplication {
  id: string
  number: number
  vendorId: string
  debitMemoId: string
  date: string
  allocations: DebitAllocation[]
  memo: string
  attachments: DmAttachment[]
  createdAt: string
  updatedAt: string
  updatedBy: string
  history: DmActivity[]
}

export interface DmRefundLine { debitMemoId: string; reason: string; amount: number }

export interface DebitMemoRefund {
  id: string
  number: number
  vendorId: string
  depositToAccountId: string
  date: string
  lines: DmRefundLine[]
  memo: string
  attachments: DmAttachment[]
  createdAt: string
  updatedAt: string
  updatedBy: string
  history: DmActivity[]
}

// ── Labels ─────────────────────────────────────────────────────────────────────

export const memoLabel = (n: number) => `Debit Memo #${n}`
export const applicationLabel = (n: number) => `Debit Memo Applied #${n}`
export const refundLabel = (n: number) => `Debit Memo Refund #${n}`
export const pinvLabel = (n: string) => `Purchase Invoice ${n}`

export function purchaseInvoiceById(id: string): PurchaseInvoice | undefined {
  return purchaseInvoices.find((i) => i.id === id)
}
export function vendorNameOf(id: string): string {
  return vendorById(id)?.name ?? id
}

// ── Seed ───────────────────────────────────────────────────────────────────────

function stamp(date: string, time = '10:15'): string { return `${date}T${time}:00+07:00` }
function created(date: string, details: DmActivityDetail[]): DmActivity[] {
  return [{ date: stamp(date), user: CURRENT_USER, activity: 'Created', details }]
}
function mkMemo(id: string, number: number, vendorId: string, date: string, lines: Omit<DebitMemoLine, 'id'>[], memo: string, tags: string[] = []): PurchaseDebitMemo {
  const total = lines.reduce((s, l) => s + l.amount, 0)
  return {
    id, number, vendorId, date,
    lines: lines.map((l, i) => ({ ...l, id: `${id}-l${i + 1}` })),
    memo, tags, attachments: [],
    createdAt: stamp(date), updatedAt: stamp(date), updatedBy: CURRENT_USER,
    history: created(date, [
      { label: 'Transaction no.', value: memoLabel(number) },
      { label: 'Vendor', value: vendorNameOf(vendorId) },
      { label: 'Total debit', value: `Rp${total.toLocaleString('id-ID')},00` },
    ]),
  }
}

function seedMemos(): PurchaseDebitMemo[] {
  return [
    mkMemo('dm-20091', 20091, 'V001', '2026-08-20', [{ accountCode: '5-20000', reason: 'Defective green beans returned', amount: 8_000_000 }], 'Shipment #17 — 40kg lot rejected (moisture > 13%).'),
    mkMemo('dm-20090', 20090, 'V006', '2026-08-12', [{ accountCode: '5-20001', reason: 'Volume discount adjustment', amount: 12_000_000 }], 'Quarterly volume rebate per contract clause 4.2.'),
    mkMemo('dm-20089', 20089, 'V003', '2026-08-03', [{ accountCode: '5-20000', reason: 'Short shipment claim', amount: 9_000_000 }], 'PO expected 200kg, received 180kg — 20kg shortage.'),
    mkMemo('dm-20088', 20088, 'V007', '2026-08-05', [{ accountCode: '5-20000', reason: 'Defective equipment credit', amount: 7_500_000 }], 'Replacement burr grinder warranty claim.'),
    mkMemo('dm-20087', 20087, 'V002', '2026-07-16', [
      { accountCode: '5-20000', reason: 'Returned packaging materials', amount: 10_000_000 },
      { accountCode: '5-20001', reason: 'Late delivery penalty', amount: 4_000_000 },
    ], 'Partial return of June order plus late delivery charge per SLA.'),
    mkMemo('dm-20080', 20080, 'V007', '2026-07-20', [{ accountCode: '5-20001', reason: 'Price correction', amount: 3_000_000 }], 'Overcharge on maintenance contract Q2.'),
  ]
}

function seedApplications(): DebitMemoApplication[] {
  const mk = (id: string, number: number, vendorId: string, debitMemoId: string, date: string, allocations: DebitAllocation[], memo: string): DebitMemoApplication => ({
    id, number, vendorId, debitMemoId, date, allocations, memo, attachments: [],
    createdAt: stamp(date, '11:00'), updatedAt: stamp(date, '11:00'), updatedBy: CURRENT_USER,
    history: created(date, [
      { label: 'Transaction no.', value: applicationLabel(number) },
      { label: 'Debit memo', value: debitMemoId.replace('dm-', 'Debit Memo #') },
    ]),
  })
  return [
    mk('dma-80100', 80100, 'V003', 'dm-20089', '2026-08-10', [
      { invoiceId: 'PI003', amount: 4_000_000 },
      { invoiceId: 'PI033', amount: 2_500_000 },
    ], 'Short-shipment debit applied against outstanding invoices.'),
    mk('dma-80099', 80099, 'V002', 'dm-20087', '2026-07-20', [
      { invoiceId: 'PI032', amount: 11_000_000 },
    ], 'Applied in full against the July invoice.'),
  ]
}

function seedRefunds(): DebitMemoRefund[] {
  const mk = (id: string, number: number, vendorId: string, depositToAccountId: string, date: string, lines: DmRefundLine[], memo: string): DebitMemoRefund => ({
    id, number, vendorId, depositToAccountId, date, lines, memo, attachments: [],
    createdAt: stamp(date, '14:30'), updatedAt: stamp(date, '14:30'), updatedBy: CURRENT_USER,
    history: created(date, [
      { label: 'Transaction no.', value: refundLabel(number) },
      { label: 'Deposit to', value: cashAccountLabel(depositToAccountId) },
    ]),
  })
  return [
    mk('dmr-20020', 20020, 'V006', 'CA003', '2026-08-18', [
      { debitMemoId: 'dm-20090', reason: 'Vendor wire transfer refund', amount: 5_000_000 },
    ], ''),
    mk('dmr-20019', 20019, 'V002', 'CA003', '2026-08-18', [
      { debitMemoId: 'dm-20087', reason: 'Remaining debit refunded by vendor', amount: 3_000_000 },
    ], 'Vendor settled outstanding debit balance.'),
  ]
}

const K_MEMOS = 'debit-memos-v1'
const K_APPS = 'debit-memo-applications-v1'
const K_REFUNDS = 'debit-memo-refunds-v1'

export const debitMemos = reactive<PurchaseDebitMemo[]>(loadSnapshot<PurchaseDebitMemo>(K_MEMOS) ?? seedMemos())
export const debitMemoApplications = reactive<DebitMemoApplication[]>(loadSnapshot<DebitMemoApplication>(K_APPS) ?? seedApplications())
export const debitMemoRefunds = reactive<DebitMemoRefund[]>(loadSnapshot<DebitMemoRefund>(K_REFUNDS) ?? seedRefunds())

function persistAll(): void {
  saveSnapshot(K_MEMOS, debitMemos)
  saveSnapshot(K_APPS, debitMemoApplications)
  saveSnapshot(K_REFUNDS, debitMemoRefunds)
}

// ── Lookups ────────────────────────────────────────────────────────────────────

export const getDebitMemo = (id: string) => debitMemos.find((m) => m.id === id)
export const getApplication = (id: string) => debitMemoApplications.find((a) => a.id === id)
export const getRefund = (id: string) => debitMemoRefunds.find((r) => r.id === id)

export function memoTotal(m: Pick<PurchaseDebitMemo, 'lines'>): number {
  return m.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)
}

export function memoApplied(memoId: string, excludeApplicationId?: string): number {
  return debitMemoApplications
    .filter((a) => a.debitMemoId === memoId && a.id !== excludeApplicationId)
    .reduce((s, a) => s + a.allocations.reduce((x, al) => x + al.amount, 0), 0)
}
export function memoRefunded(memoId: string, excludeRefundId?: string): number {
  return debitMemoRefunds
    .filter((r) => r.id !== excludeRefundId)
    .reduce((s, r) => s + r.lines.filter((l) => l.debitMemoId === memoId).reduce((x, l) => x + l.amount, 0), 0)
}
export interface ExcludeOpts { applicationId?: string; refundId?: string }
export function memoUsed(memoId: string, ex: ExcludeOpts = {}): number {
  return memoApplied(memoId, ex.applicationId) + memoRefunded(memoId, ex.refundId)
}
export function memoRemaining(memoId: string, ex: ExcludeOpts = {}): number {
  const m = getDebitMemo(memoId)
  if (!m) return 0
  return memoTotal(m) - memoUsed(memoId, ex)
}

export type MemoStatus = 'active' | 'partially-used' | 'used-up'
export function memoStatus(memoId: string): MemoStatus {
  const m = getDebitMemo(memoId)
  if (!m) return 'used-up'
  const rem = memoRemaining(memoId)
  if (rem <= 0) return 'used-up'
  if (rem >= memoTotal(m)) return 'active'
  return 'partially-used'
}
export const MEMO_STATUS_LABEL: Record<MemoStatus, string> = {
  'active': 'Active', 'partially-used': 'Partially used', 'used-up': 'Used up',
}

export function memosForVendor(vendorId: string): PurchaseDebitMemo[] {
  return debitMemos.filter((m) => m.vendorId === vendorId).sort((a, b) => a.date.localeCompare(b.date) || a.number - b.number)
}
export function vendorAvailableDebit(vendorId: string): number {
  return memosForVendor(vendorId).reduce((s, m) => s + Math.max(0, memoRemaining(m.id)), 0)
}
export function applicationsForMemo(memoId: string): DebitMemoApplication[] {
  return debitMemoApplications.filter((a) => a.debitMemoId === memoId).sort((a, b) => b.date.localeCompare(a.date))
}
export function refundsForMemo(memoId: string): DebitMemoRefund[] {
  return debitMemoRefunds.filter((r) => r.lines.some((l) => l.debitMemoId === memoId)).sort((a, b) => b.date.localeCompare(a.date))
}
export function applicationTotal(a: Pick<DebitMemoApplication, 'allocations'>): number {
  return a.allocations.reduce((s, al) => s + al.amount, 0)
}
export function refundTotal(r: Pick<DebitMemoRefund, 'lines'>): number {
  return r.lines.reduce((s, l) => s + l.amount, 0)
}

// ── Purchase invoice overlay (balance + status) ───────────────────────────────

const baseInvoice = new Map<string, { balance: number; status: InvoiceStatus }>(
  purchaseInvoices.map((i) => [i.id, { balance: i.balance, status: i.status }]),
)
function baseOf(inv: PurchaseInvoice) {
  let b = baseInvoice.get(inv.id)
  if (!b) { b = { balance: inv.balance, status: inv.status }; baseInvoice.set(inv.id, b) }
  return b
}

export function invoiceDebitApplied(invoiceId: string, excludeApplicationId?: string): number {
  let sum = 0
  for (const a of debitMemoApplications) {
    if (a.id === excludeApplicationId) continue
    for (const al of a.allocations) if (al.invoiceId === invoiceId) sum += al.amount
  }
  return sum
}
/** Cash paid on a purchase invoice — derived from Purchase Payment records. */
export function invoiceCashPaid(invoiceId: string): number {
  return invoiceCashPaidFn(invoiceId)
}
export function invoiceBalance(invoiceId: string, excludeApplicationId?: string): number {
  const inv = purchaseInvoiceById(invoiceId)
  if (!inv) return 0
  return Math.max(0, baseOf(inv).balance - invoiceCashPaid(invoiceId) - invoiceDebitApplied(invoiceId, excludeApplicationId))
}

export function deriveInvoiceStatus(inv: Pick<PurchaseInvoice, 'total' | 'dueDate'>, balance: number): InvoiceStatus {
  if (balance <= 0) return 'paid'
  if (daysUntil(inv.dueDate) < 0) return 'overdue'
  if (balance < inv.total) return 'partially-paid'
  return 'open'
}

export function syncPurchaseInvoiceBalances(): void {
  for (const inv of purchaseInvoices) {
    const base = baseOf(inv)
    const debit = invoiceDebitApplied(inv.id)
    const cash = invoiceCashPaid(inv.id)
    const totalSettled = debit + cash
    if (totalSettled === 0) {
      inv.balance = base.balance
      inv.status = base.status
    } else {
      inv.balance = Math.max(0, base.balance - totalSettled)
      inv.status = deriveInvoiceStatus(inv, inv.balance)
    }
  }
  persistPurchaseInvoices()
}
syncPurchaseInvoiceBalances()

export function applicationsForInvoice(invoiceId: string): { application: DebitMemoApplication; amount: number }[] {
  const out: { application: DebitMemoApplication; amount: number }[] = []
  for (const a of debitMemoApplications) {
    const amt = a.allocations.filter((al) => al.invoiceId === invoiceId).reduce((s, al) => s + al.amount, 0)
    if (amt > 0) out.push({ application: a, amount: amt })
  }
  return out.sort((x, y) => y.application.date.localeCompare(x.application.date))
}
export function invoiceHasDebitApplied(invoiceId: string): boolean {
  return invoiceDebitApplied(invoiceId) > 0
}

export function applicableInvoices(vendorId: string, excludeApplicationId?: string): PurchaseInvoice[] {
  const inEdit = new Set(excludeApplicationId ? (getApplication(excludeApplicationId)?.allocations.map((a) => a.invoiceId) ?? []) : [])
  return purchaseInvoices
    .filter((i) => i.vendor.id === vendorId && (invoiceBalance(i.id, excludeApplicationId) > 0 || inEdit.has(i.id)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number))
}

// ── Numbering ──────────────────────────────────────────────────────────────────

export const nextMemoNumber = () => Math.max(20079, ...debitMemos.map((m) => m.number)) + 1
export const nextApplicationNumber = () => Math.max(80098, ...debitMemoApplications.map((a) => a.number)) + 1
export const nextRefundNumber = () => Math.max(20018, ...debitMemoRefunds.map((r) => r.number)) + 1

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

// ── Validation ────────────────────────────────────────────────────────────────

export type FieldError =
  | { code: 'REQUIRED' }
  | { code: 'AMOUNT_POSITIVE' }
  | { code: 'OVER_BALANCE'; limit: number }
  | { code: 'OVER_AVAILABLE'; limit: number }
  | { code: 'BEFORE_MEMO_DATE'; date: string }
  | { code: 'BEFORE_INVOICE_DATE'; date: string }
  | { code: 'NOTHING_ENTERED' }
  | { code: 'BELOW_USED'; used: number }
  | { code: 'VENDOR_LOCKED' }
  | { code: 'NO_LINES' }
  | { code: 'AFTER_FIRST_USE'; date: string }

// Debit memo ------------------------------------------------------------------
export interface MemoDraft {
  vendorId: string
  date: string
  lines: { id: string; accountCode: string; reason: string; amount: number }[]
  memo: string
  tags?: string[]
  attachments: DmAttachment[]
}
export interface MemoErrors {
  vendor?: FieldError
  date?: FieldError
  lines: Record<string, { account?: FieldError; amount?: FieldError }>
  total?: FieldError
}
export function validateMemo(d: MemoDraft, editingId?: string): { ok: boolean; errors: MemoErrors } {
  const e: MemoErrors = { lines: {} }
  const editing = editingId ? getDebitMemo(editingId) : undefined
  const used = editingId ? memoUsed(editingId) : 0
  if (!d.vendorId) e.vendor = { code: 'REQUIRED' }
  else if (editing && used > 0 && d.vendorId !== editing.vendorId) e.vendor = { code: 'VENDOR_LOCKED' }
  if (!d.date) e.date = { code: 'REQUIRED' }
  const filled = d.lines.filter((l) => l.accountCode || l.amount > 0 || l.reason.trim())
  if (!filled.length) e.total = { code: 'NO_LINES' }
  for (const l of filled) {
    const le: { account?: FieldError; amount?: FieldError } = {}
    if (!l.accountCode) le.account = { code: 'REQUIRED' }
    if (!(l.amount > 0)) le.amount = { code: 'AMOUNT_POSITIVE' }
    if (le.account || le.amount) e.lines[l.id] = le
  }
  const total = filled.reduce((s, l) => s + (l.amount > 0 ? l.amount : 0), 0)
  if (!e.total && editing && total < used) e.total = { code: 'BELOW_USED', used }
  if (!e.date && editing && used > 0) {
    const earliest = [...applicationsForMemo(editing.id).map((a) => a.date), ...refundsForMemo(editing.id).map((r) => r.date)].sort()[0]
    if (earliest && d.date > earliest) e.date = { code: 'AFTER_FIRST_USE', date: earliest }
  }
  const ok = !e.vendor && !e.date && !e.total && Object.keys(e.lines).length === 0
  return { ok, errors: e }
}

// Debit memo applied ----------------------------------------------------------
export interface ApplicationDraft {
  vendorId: string
  debitMemoId: string
  date: string
  allocations: DebitAllocation[]
  memo: string
  attachments: DmAttachment[]
}
export interface ApplicationErrors {
  debitMemo?: FieldError
  date?: FieldError
  rows: Record<string, FieldError>
  total?: FieldError
}
export function validateApplication(d: ApplicationDraft, editingId?: string): { ok: boolean; errors: ApplicationErrors } {
  const e: ApplicationErrors = { rows: {} }
  const memo = d.debitMemoId ? getDebitMemo(d.debitMemoId) : undefined
  if (!memo) e.debitMemo = { code: 'REQUIRED' }
  if (!d.date) e.date = { code: 'REQUIRED' }
  else if (memo && d.date < memo.date) e.date = { code: 'BEFORE_MEMO_DATE', date: memo.date }
  const active = d.allocations.filter((a) => a.amount > 0)
  for (const a of d.allocations) {
    if (a.amount < 0) { e.rows[a.invoiceId] = { code: 'AMOUNT_POSITIVE' }; continue }
    if (!(a.amount > 0)) continue
    const inv = purchaseInvoiceById(a.invoiceId)
    const limit = invoiceBalance(a.invoiceId, editingId)
    if (a.amount > limit) e.rows[a.invoiceId] = { code: 'OVER_BALANCE', limit }
    else if (inv && d.date && d.date < inv.date) e.rows[a.invoiceId] = { code: 'BEFORE_INVOICE_DATE', date: inv.date }
  }
  if (!active.length) e.total = { code: 'NOTHING_ENTERED' }
  else if (memo) {
    const available = memoRemaining(memo.id, { applicationId: editingId })
    const sum = active.reduce((s, a) => s + a.amount, 0)
    if (sum > available) e.total = { code: 'OVER_AVAILABLE', limit: available }
  }
  const ok = !e.debitMemo && !e.date && !e.total && Object.keys(e.rows).length === 0
  return { ok, errors: e }
}

// Debit memo refund -----------------------------------------------------------
export interface RefundDraft {
  vendorId: string
  depositToAccountId: string
  date: string
  lines: DmRefundLine[]
  memo: string
  attachments: DmAttachment[]
}
export interface RefundErrors {
  depositTo?: FieldError
  date?: FieldError
  rows: Record<string, FieldError>
  total?: FieldError
}
export function validateRefund(d: RefundDraft, editingId?: string): { ok: boolean; errors: RefundErrors } {
  const e: RefundErrors = { rows: {} }
  if (!d.depositToAccountId) e.depositTo = { code: 'REQUIRED' }
  if (!d.date) e.date = { code: 'REQUIRED' }
  const active = d.lines.filter((l) => l.amount > 0)
  for (const l of d.lines) {
    if (l.amount < 0) { e.rows[l.debitMemoId] = { code: 'AMOUNT_POSITIVE' }; continue }
    if (!(l.amount > 0)) continue
    const memo = getDebitMemo(l.debitMemoId)
    const limit = memoRemaining(l.debitMemoId, { refundId: editingId })
    if (l.amount > limit) e.rows[l.debitMemoId] = { code: 'OVER_AVAILABLE', limit }
    else if (memo && d.date && d.date < memo.date) e.rows[l.debitMemoId] = { code: 'BEFORE_MEMO_DATE', date: memo.date }
  }
  if (!active.length) e.total = { code: 'NOTHING_ENTERED' }
  const ok = !e.depositTo && !e.date && !e.total && Object.keys(e.rows).length === 0
  return { ok, errors: e }
}

// ── Mutations ──────────────────────────────────────────────────────────────────

export type MutationResult = { ok: true; id: string } | { ok: false; reason: string }

function diff(label: string, before: string, after: string, out: DmActivityDetail[]) {
  if (before !== after) out.push({ label, value: `${before || '—'} → ${after || '—'}` })
}

export function createDebitMemo(d: MemoDraft): MutationResult {
  const v = validateMemo(d)
  if (!v.ok) return { ok: false, reason: 'INVALID' }
  const number = nextMemoNumber()
  const at = nowIso()
  const lines = d.lines.filter((l) => l.accountCode && l.amount > 0).map((l, i) => ({ ...l, id: `${number}-l${i + 1}-${Date.now().toString(36)}` }))
  const m: PurchaseDebitMemo = {
    id: uid('dm'), number, vendorId: d.vendorId, date: d.date, lines,
    memo: d.memo.trim(), tags: d.tags ?? [], attachments: d.attachments,
    createdAt: at, updatedAt: at, updatedBy: CURRENT_USER,
    history: [{ date: at, user: CURRENT_USER, activity: 'Created', details: [
      { label: 'Transaction no.', value: memoLabel(number) },
      { label: 'Vendor', value: vendorNameOf(d.vendorId) },
      { label: 'Transaction date', value: dmy(d.date) },
      { label: 'Total debit', value: rp(memoTotal({ lines })) },
    ] }],
  }
  debitMemos.unshift(m)
  persistAll()
  return { ok: true, id: m.id }
}

export function updateDebitMemo(id: string, d: MemoDraft): MutationResult {
  const m = getDebitMemo(id)
  if (!m) return { ok: false, reason: 'NOT_FOUND' }
  const v = validateMemo(d, id)
  if (!v.ok) return { ok: false, reason: 'INVALID' }
  const lines = d.lines.filter((l) => l.accountCode && l.amount > 0)
  const changes: DmActivityDetail[] = []
  diff('Vendor', vendorNameOf(m.vendorId), vendorNameOf(d.vendorId), changes)
  diff('Transaction date', dmy(m.date), dmy(d.date), changes)
  diff('Total debit', rp(memoTotal(m)), rp(memoTotal({ lines })), changes)
  diff('Memo', m.memo, d.memo.trim(), changes)
  const at = nowIso()
  Object.assign(m, { vendorId: d.vendorId, date: d.date, lines, memo: d.memo.trim(), tags: d.tags ?? m.tags ?? [], attachments: d.attachments, updatedAt: at, updatedBy: CURRENT_USER })
  m.history.unshift({ date: at, user: CURRENT_USER, activity: 'Edited', details: changes.length ? changes : [{ label: 'Lines', value: 'Updated' }] })
  persistAll()
  syncPurchaseInvoiceBalances()
  return { ok: true, id }
}

export interface DeleteGuard { ok: boolean; applications: number; refunds: number }
export function canDeleteDebitMemo(id: string): DeleteGuard {
  const applications = applicationsForMemo(id).length
  const refunds = refundsForMemo(id).length
  return { ok: applications === 0 && refunds === 0, applications, refunds }
}
export function deleteDebitMemo(id: string): MutationResult {
  const g = canDeleteDebitMemo(id)
  if (!g.ok) return { ok: false, reason: `MEMO_IN_USE: ${g.applications} application(s), ${g.refunds} refund(s)` }
  const i = debitMemos.findIndex((m) => m.id === id)
  if (i === -1) return { ok: false, reason: 'NOT_FOUND' }
  debitMemos.splice(i, 1)
  persistAll()
  return { ok: true, id }
}

export function createApplication(d: ApplicationDraft): MutationResult {
  const v = validateApplication(d)
  if (!v.ok) return { ok: false, reason: 'INVALID' }
  const number = nextApplicationNumber()
  const at = nowIso()
  const allocations = d.allocations.filter((a) => a.amount > 0)
  const a: DebitMemoApplication = {
    id: uid('dma'), number, vendorId: d.vendorId, debitMemoId: d.debitMemoId, date: d.date,
    allocations, memo: d.memo.trim(), attachments: d.attachments,
    createdAt: at, updatedAt: at, updatedBy: CURRENT_USER,
    history: [{ date: at, user: CURRENT_USER, activity: 'Created', details: [
      { label: 'Transaction no.', value: applicationLabel(number) },
      { label: 'Debit memo', value: memoLabel(getDebitMemo(d.debitMemoId)!.number) },
      ...allocations.map((al) => ({ label: pinvLabel(purchaseInvoiceById(al.invoiceId)?.number ?? ''), value: rp(al.amount) })),
    ] }],
  }
  debitMemoApplications.unshift(a)
  persistAll()
  syncPurchaseInvoiceBalances()
  return { ok: true, id: a.id }
}

export function updateApplication(id: string, d: ApplicationDraft): MutationResult {
  const a = getApplication(id)
  if (!a) return { ok: false, reason: 'NOT_FOUND' }
  const v = validateApplication(d, id)
  if (!v.ok) return { ok: false, reason: 'INVALID' }
  const allocations = d.allocations.filter((x) => x.amount > 0)
  const changes: DmActivityDetail[] = []
  const memoNo = (mid: string) => memoLabel(getDebitMemo(mid)?.number ?? 0)
  diff('Debit memo', memoNo(a.debitMemoId), memoNo(d.debitMemoId), changes)
  diff('Transaction date', dmy(a.date), dmy(d.date), changes)
  const ids = new Set([...a.allocations, ...allocations].map((x) => x.invoiceId))
  for (const invId of ids) {
    const before = a.allocations.find((x) => x.invoiceId === invId)?.amount ?? 0
    const after = allocations.find((x) => x.invoiceId === invId)?.amount ?? 0
    diff(pinvLabel(purchaseInvoiceById(invId)?.number ?? ''), before ? rp(before) : '', after ? rp(after) : '', changes)
  }
  diff('Memo', a.memo, d.memo.trim(), changes)
  const at = nowIso()
  Object.assign(a, { debitMemoId: d.debitMemoId, date: d.date, allocations, memo: d.memo.trim(), attachments: d.attachments, updatedAt: at, updatedBy: CURRENT_USER })
  a.history.unshift({ date: at, user: CURRENT_USER, activity: 'Edited', details: changes.length ? changes : [{ label: 'Attachment', value: 'Updated' }] })
  persistAll()
  syncPurchaseInvoiceBalances()
  return { ok: true, id }
}

export function deleteApplication(id: string): MutationResult {
  const i = debitMemoApplications.findIndex((a) => a.id === id)
  if (i === -1) return { ok: false, reason: 'NOT_FOUND' }
  debitMemoApplications.splice(i, 1)
  persistAll()
  syncPurchaseInvoiceBalances()
  return { ok: true, id }
}

export function createRefund(d: RefundDraft): MutationResult {
  const v = validateRefund(d)
  if (!v.ok) return { ok: false, reason: 'INVALID' }
  const number = nextRefundNumber()
  const at = nowIso()
  const lines = d.lines.filter((l) => l.amount > 0).map((l) => ({ ...l, reason: l.reason.trim() }))
  const r: DebitMemoRefund = {
    id: uid('dmr'), number, vendorId: d.vendorId, depositToAccountId: d.depositToAccountId, date: d.date,
    lines, memo: d.memo.trim(), attachments: d.attachments,
    createdAt: at, updatedAt: at, updatedBy: CURRENT_USER,
    history: [{ date: at, user: CURRENT_USER, activity: 'Created', details: [
      { label: 'Transaction no.', value: refundLabel(number) },
      { label: 'Deposit to', value: cashAccountLabel(d.depositToAccountId) },
      ...lines.map((l) => ({ label: memoLabel(getDebitMemo(l.debitMemoId)?.number ?? 0), value: rp(l.amount) })),
    ] }],
  }
  debitMemoRefunds.unshift(r)
  persistAll()
  return { ok: true, id: r.id }
}

export function updateRefund(id: string, d: RefundDraft): MutationResult {
  const r = getRefund(id)
  if (!r) return { ok: false, reason: 'NOT_FOUND' }
  const v = validateRefund(d, id)
  if (!v.ok) return { ok: false, reason: 'INVALID' }
  const lines = d.lines.filter((l) => l.amount > 0).map((l) => ({ ...l, reason: l.reason.trim() }))
  const changes: DmActivityDetail[] = []
  diff('Deposit to', cashAccountLabel(r.depositToAccountId), cashAccountLabel(d.depositToAccountId), changes)
  diff('Transaction date', dmy(r.date), dmy(d.date), changes)
  diff('Total refund', rp(refundTotal(r)), rp(refundTotal({ lines })), changes)
  diff('Memo', r.memo, d.memo.trim(), changes)
  const at = nowIso()
  Object.assign(r, { depositToAccountId: d.depositToAccountId, date: d.date, lines, memo: d.memo.trim(), attachments: d.attachments, updatedAt: at, updatedBy: CURRENT_USER })
  r.history.unshift({ date: at, user: CURRENT_USER, activity: 'Edited', details: changes.length ? changes : [{ label: 'Lines', value: 'Updated' }] })
  persistAll()
  return { ok: true, id }
}

export function deleteRefund(id: string): MutationResult {
  const i = debitMemoRefunds.findIndex((r) => r.id === id)
  if (i === -1) return { ok: false, reason: 'NOT_FOUND' }
  debitMemoRefunds.splice(i, 1)
  persistAll()
  return { ok: true, id }
}

// ── Journal entries ───────────────────────────────────────────────────────────

export interface DmJournalRow { account: string; debit?: number; credit?: number }

/** Debit memo: Dr AP (reduce payable) · Cr each line account. */
export function memoJournal(m: PurchaseDebitMemo): DmJournalRow[] {
  return [
    { account: AP_ACCOUNT, debit: memoTotal(m) },
    ...m.lines.map((l) => ({ account: dmAccountLabel(l.accountCode), credit: l.amount })),
  ]
}
/** Applying debit: Dr AP (invoice — reduce payable on that invoice) · Cr AP (memo). */
export function applicationJournal(a: DebitMemoApplication): DmJournalRow[] {
  const memo = getDebitMemo(a.debitMemoId)
  return [
    ...a.allocations.map((al) => ({ account: `${AP_ACCOUNT} · ${pinvLabel(purchaseInvoiceById(al.invoiceId)?.number ?? '')}`, debit: al.amount })),
    { account: `${AP_ACCOUNT} · ${memo ? memoLabel(memo.number) : ''}`, credit: applicationTotal(a) },
  ]
}
/** Refund: Dr Bank (cash IN from vendor) · Cr AP. */
export function refundJournal(r: DebitMemoRefund): DmJournalRow[] {
  return [
    { account: cashAccountLabel(r.depositToAccountId), debit: refundTotal(r) },
    { account: AP_ACCOUNT, credit: refundTotal(r) },
  ]
}

// ── Vendor options ────────────────────────────────────────────────────────────

export function vendorOptions() {
  return [...vendors].sort((a, b) => a.name.localeCompare(b.name)).map((v) => ({ id: v.id, name: v.name }))
}
