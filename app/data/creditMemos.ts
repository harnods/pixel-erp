import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import { salesInvoices } from './salesInvoices'
import { customers, getCustomer } from './customers'
import { cashAccounts } from './cashAccounts'
import { SIM_TODAY_ISO, daysUntil } from './simClock'
import type { SalesInvoice, InvoiceStatus } from './types'

let invoiceCashReceivedFn: (invoiceId: string) => number = () => 0
export function _setCashReceivedFn(fn: (invoiceId: string) => number) { invoiceCashReceivedFn = fn }

/**
 * Credit memo (Sales › Sales invoices › Credit memo) — the mini-DB for the three
 * documents in the Figma "Sales / Sales Invoices → Credit Memo" flow:
 *
 *   • Credit memo            "Credit Memo #10088"          — credit owed to a customer
 *   • Credit memo applied    "Credit Memo Applied #90100"  — spends ONE memo across 1..n invoices
 *   • Credit memo refund     "Credit Memo Refund #10020"   — pays 1..n memos back in cash
 *
 * Single source of truth. Everything else is DERIVED, never stored twice:
 *   remaining(memo)   = total(memo) − Σ applied(memo) − Σ refunded(memo)
 *   balance(invoice)  = seed balance(invoice) − Σ credit applied(invoice)
 *   status(invoice)   = paid · overdue · partially-paid · open   (see deriveInvoiceStatus)
 *
 * The invoice overlay (`syncInvoiceBalances`) writes the derived balance/status
 * back onto the shared `salesInvoices` rows, so the Sales invoices index, the
 * invoice detail, the customer's Transactions tab and Cowork all read the same
 * numbers. The Credit Memo report (creditMemoReport.ts) is also derived from
 * here, so an apply/refund/delete shows up in the report immediately.
 *
 * Persistence: all three tables are snapshot-persisted (persist.ts). "Reset demo
 * data" wipes the snapshots and the deterministic seed below comes back.
 *
 * Validation lives here (not in the pages) so the forms, the tests and any
 * future API share one rule set. Validators return error CODES + numbers; the
 * UI turns them into copy (translatable, currency-setting aware).
 */

// ── Reference data ─────────────────────────────────────────────────────────────

/** Accounts a credit memo line can post to (the debit side; AR is credited). */
export const CM_ACCOUNTS: { code: string; name: string }[] = [
  { code: '4-20000', name: 'Sales Returns & Allowances' },
  { code: '4-20001', name: 'Sales Discounts' },
  { code: '4-10000', name: 'Sales Revenue' },
  { code: '4-10001', name: 'Service Income' },
  { code: '6-10005', name: 'General & Administrative' },
]
export const AR_ACCOUNT = '1-20000 Accounts receivable'
export const CURRENT_USER = 'Rizal Candra'

export function cmAccountLabel(code: string): string {
  const a = CM_ACCOUNTS.find((x) => x.code === code)
  return a ? `${a.code} ${a.name}` : code
}

/** Cash/bank accounts a refund can be paid from: live, IDR, asset (1-…), leaf accounts only. */
export function refundPayFromAccounts() {
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

export interface CmAttachment { name: string; sizeKB: number }
export interface CmActivityDetail { label: string; value: string }
export interface CmActivity { date: string; user: string; activity: string; details: CmActivityDetail[] }

export interface CreditMemoLine { id: string; accountCode: string; reason: string; amount: number }

export interface SalesCreditMemo {
  id: string
  number: number                  // "Credit Memo #10088"
  customerId: string              // customers.ts FK
  date: string                    // ISO yyyy-mm-dd
  lines: CreditMemoLine[]
  memo: string
  tags: string[]
  attachments: CmAttachment[]
  createdAt: string
  updatedAt: string
  updatedBy: string
  history: CmActivity[]           // newest first
}

export interface CreditAllocation { invoiceId: string; amount: number }

export interface CreditMemoApplication {
  id: string
  number: number                  // "Credit Memo Applied #90100"
  customerId: string
  creditMemoId: string
  date: string
  allocations: CreditAllocation[] // only rows with amount > 0 are stored
  memo: string
  attachments: CmAttachment[]
  createdAt: string
  updatedAt: string
  updatedBy: string
  history: CmActivity[]
}

export interface RefundLine { creditMemoId: string; reason: string; amount: number }

export interface CreditMemoRefund {
  id: string
  number: number                  // "Credit Memo Refund #10020"
  customerId: string
  payFromAccountId: string        // cashAccounts.ts id
  date: string
  lines: RefundLine[]
  memo: string
  attachments: CmAttachment[]
  createdAt: string
  updatedAt: string
  updatedBy: string
  history: CmActivity[]
}

// ── Labels ─────────────────────────────────────────────────────────────────────

export const memoLabel = (n: number) => `Credit Memo #${n}`
export const applicationLabel = (n: number) => `Credit Memo Applied #${n}`
export const refundLabel = (n: number) => `Credit Memo Refund #${n}`
export const invoiceLabel = (n: number) => `Sales Invoice #${n}`

export function invoiceById(id: string): SalesInvoice | undefined {
  return salesInvoices.find((i) => i.id === id)
}
export function customerNameOf(id: string): string {
  return getCustomer(id)?.name ?? id
}

// ── Seed — coherent with salesInvoices.ts (unpaid invoices per customer) and
// SIM today (22 Aug 2026). Covers: Active (unused), Partially used, Used up by
// apply + refund, refund-only usage, a memo bigger than the customer's only
// open invoice, and a memo issued before the report period (Case A). ─────────

function stamp(date: string, time = '10:15'): string { return `${date}T${time}:00+07:00` }
function created(date: string, details: CmActivityDetail[]): CmActivity[] {
  return [{ date: stamp(date), user: CURRENT_USER, activity: 'Created', details }]
}
function mkMemo(id: string, number: number, customerId: string, date: string, lines: Omit<CreditMemoLine, 'id'>[], memo: string, tags: string[] = []): SalesCreditMemo {
  const total = lines.reduce((s, l) => s + l.amount, 0)
  return {
    id, number, customerId, date,
    lines: lines.map((l, i) => ({ ...l, id: `${id}-l${i + 1}` })),
    memo, tags, attachments: [],
    createdAt: stamp(date), updatedAt: stamp(date), updatedBy: CURRENT_USER,
    history: created(date, [
      { label: 'Transaction no.', value: memoLabel(number) },
      { label: 'Customer', value: customerNameOf(customerId) },
      { label: 'Total credit', value: `Rp${total.toLocaleString('id-ID')},00` },
    ]),
  }
}

function seedMemos(): SalesCreditMemo[] {
  return [
    mkMemo('cm-10091', 10091, 'C001', '2026-08-20', [{ accountCode: '4-20000', reason: 'Returned goods credit', amount: 6_000_000 }], 'Two cases of syrup returned — wrong flavour shipped.'),
    mkMemo('cm-10090', 10090, 'C025', '2026-08-12', [{ accountCode: '4-20001', reason: 'Price adjustment', amount: 15_000_000 }], 'Contract price corrected for the July shipment.'),
    mkMemo('cm-10089', 10089, 'C006', '2026-08-03', [{ accountCode: '4-20000', reason: 'Returned goods credit', amount: 12_000_000 }], 'Grinder returned under warranty.'),
    mkMemo('cm-10088', 10088, 'C013', '2026-08-05', [{ accountCode: '4-20000', reason: 'Returned goods credit', amount: 10_000_000 }], '1 sack of coffee beans returned — damaged packaging.'),
    mkMemo('cm-10087', 10087, 'C002', '2026-07-16', [
      { accountCode: '4-20000', reason: 'Returned goods credit', amount: 15_000_000 },
      { accountCode: '4-20001', reason: 'Late delivery compensation', amount: 5_000_000 },
    ], 'Partial return of the June order plus a goodwill credit.'),
    mkMemo('cm-10080', 10080, 'C013', '2026-07-20', [{ accountCode: '4-20001', reason: 'Volume discount adjustment', amount: 2_000_000 }], 'Q2 volume rebate.'),
  ]
}

function seedApplications(): CreditMemoApplication[] {
  const mk = (id: string, number: number, customerId: string, creditMemoId: string, date: string, allocations: CreditAllocation[], memo: string): CreditMemoApplication => ({
    id, number, customerId, creditMemoId, date, allocations, memo, attachments: [],
    createdAt: stamp(date, '11:00'), updatedAt: stamp(date, '11:00'), updatedBy: CURRENT_USER,
    history: created(date, [
      { label: 'Transaction no.', value: applicationLabel(number) },
      { label: 'Credit memo', value: creditMemoId.replace('cm-', 'Credit Memo #') },
    ]),
  })
  return [
    mk('cma-90100', 90100, 'C006', 'cm-10089', '2026-08-10', [
      { invoiceId: 'SI031', amount: 4_500_000 },
      { invoiceId: 'SI131', amount: 3_500_000 },
    ], 'Credit for the returned grinder applied to open invoices.'),
    mk('cma-90099', 90099, 'C002', 'cm-10087', '2026-07-20', [
      { invoiceId: 'SI127', amount: 16_500_000 },
    ], 'Applied in full against the July invoice.'),
  ]
}

function seedRefunds(): CreditMemoRefund[] {
  const mk = (id: string, number: number, customerId: string, payFromAccountId: string, date: string, lines: RefundLine[], memo: string): CreditMemoRefund => ({
    id, number, customerId, payFromAccountId, date, lines, memo, attachments: [],
    createdAt: stamp(date, '14:30'), updatedAt: stamp(date, '14:30'), updatedBy: CURRENT_USER,
    history: created(date, [
      { label: 'Transaction no.', value: refundLabel(number) },
      { label: 'Pay from', value: cashAccountLabel(payFromAccountId) },
    ]),
  })
  return [
    mk('cmr-10020', 10020, 'C025', 'CA003', '2026-08-18', [
      { creditMemoId: 'cm-10090', reason: 'Customer requested cash refund', amount: 5_000_000 },
    ], ''),
    mk('cmr-10019', 10019, 'C002', 'CA003', '2026-08-18', [
      { creditMemoId: 'cm-10087', reason: 'Remaining credit refunded', amount: 3_500_000 },
    ], 'Customer closed the account balance.'),
  ]
}

const K_MEMOS = 'credit-memos-v1'
const K_APPS = 'credit-memo-applications-v1'
const K_REFUNDS = 'credit-memo-refunds-v1'

export const creditMemos = reactive<SalesCreditMemo[]>(loadSnapshot<SalesCreditMemo>(K_MEMOS) ?? seedMemos())
export const creditMemoApplications = reactive<CreditMemoApplication[]>(loadSnapshot<CreditMemoApplication>(K_APPS) ?? seedApplications())
export const creditMemoRefunds = reactive<CreditMemoRefund[]>(loadSnapshot<CreditMemoRefund>(K_REFUNDS) ?? seedRefunds())

function persistAll(): void {
  saveSnapshot(K_MEMOS, creditMemos)
  saveSnapshot(K_APPS, creditMemoApplications)
  saveSnapshot(K_REFUNDS, creditMemoRefunds)
}

// ── Lookups ────────────────────────────────────────────────────────────────────

export const getCreditMemo = (id: string) => creditMemos.find((m) => m.id === id)
export const getApplication = (id: string) => creditMemoApplications.find((a) => a.id === id)
export const getRefund = (id: string) => creditMemoRefunds.find((r) => r.id === id)

export function memoTotal(m: Pick<SalesCreditMemo, 'lines'>): number {
  return m.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)
}

/** Σ credit spent from a memo by applications (optionally ignoring one being edited). */
export function memoApplied(memoId: string, excludeApplicationId?: string): number {
  return creditMemoApplications
    .filter((a) => a.creditMemoId === memoId && a.id !== excludeApplicationId)
    .reduce((s, a) => s + a.allocations.reduce((x, al) => x + al.amount, 0), 0)
}
/** Σ credit refunded from a memo (optionally ignoring one refund being edited). */
export function memoRefunded(memoId: string, excludeRefundId?: string): number {
  return creditMemoRefunds
    .filter((r) => r.id !== excludeRefundId)
    .reduce((s, r) => s + r.lines.filter((l) => l.creditMemoId === memoId).reduce((x, l) => x + l.amount, 0), 0)
}
export interface ExcludeOpts { applicationId?: string; refundId?: string }
export function memoUsed(memoId: string, ex: ExcludeOpts = {}): number {
  return memoApplied(memoId, ex.applicationId) + memoRefunded(memoId, ex.refundId)
}
export function memoRemaining(memoId: string, ex: ExcludeOpts = {}): number {
  const m = getCreditMemo(memoId)
  if (!m) return 0
  return memoTotal(m) - memoUsed(memoId, ex)
}

export type MemoStatus = 'active' | 'partially-used' | 'used-up'
export function memoStatus(memoId: string): MemoStatus {
  const m = getCreditMemo(memoId)
  if (!m) return 'used-up'
  const rem = memoRemaining(memoId)
  if (rem <= 0) return 'used-up'
  if (rem >= memoTotal(m)) return 'active'
  return 'partially-used'
}
export const MEMO_STATUS_LABEL: Record<MemoStatus, string> = {
  'active': 'Active', 'partially-used': 'Partially used', 'used-up': 'Used up',
}

export function memosForCustomer(customerId: string): SalesCreditMemo[] {
  return creditMemos.filter((m) => m.customerId === customerId).sort((a, b) => a.date.localeCompare(b.date) || a.number - b.number)
}
/** Σ remaining credit across a customer's memos (what the invoice modal quotes). */
export function customerAvailableCredit(customerId: string): number {
  return memosForCustomer(customerId).reduce((s, m) => s + Math.max(0, memoRemaining(m.id)), 0)
}
export function applicationsForMemo(memoId: string): CreditMemoApplication[] {
  return creditMemoApplications.filter((a) => a.creditMemoId === memoId).sort((a, b) => b.date.localeCompare(a.date))
}
export function refundsForMemo(memoId: string): CreditMemoRefund[] {
  return creditMemoRefunds.filter((r) => r.lines.some((l) => l.creditMemoId === memoId)).sort((a, b) => b.date.localeCompare(a.date))
}
export function applicationTotal(a: Pick<CreditMemoApplication, 'allocations'>): number {
  return a.allocations.reduce((s, al) => s + al.amount, 0)
}
export function refundTotal(r: Pick<CreditMemoRefund, 'lines'>): number {
  return r.lines.reduce((s, l) => s + l.amount, 0)
}

// ── Invoice overlay (balance + status) ─────────────────────────────────────────

/** Seed (pre-credit) balance + status of every invoice — captured once, before the overlay. */
const baseInvoice = new Map<string, { balance: number; status: InvoiceStatus }>(
  salesInvoices.map((i) => [i.id, { balance: i.balance, status: i.status }]),
)
function baseOf(inv: SalesInvoice) {
  let b = baseInvoice.get(inv.id)
  if (!b) { b = { balance: inv.balance, status: inv.status }; baseInvoice.set(inv.id, b) }
  return b
}

export function invoiceCreditApplied(invoiceId: string, excludeApplicationId?: string): number {
  let sum = 0
  for (const a of creditMemoApplications) {
    if (a.id === excludeApplicationId) continue
    for (const al of a.allocations) if (al.invoiceId === invoiceId) sum += al.amount
  }
  return sum
}
/** Cash collected on an invoice — derived from Payment Received records. */
export function invoiceCashPaid(invoiceId: string): number {
  return invoiceCashReceivedFn(invoiceId)
}
/** Balance due, optionally as if one application did not exist (edit mode). */
export function invoiceBalance(invoiceId: string, excludeApplicationId?: string): number {
  const inv = invoiceById(invoiceId)
  if (!inv) return 0
  return Math.max(0, baseOf(inv).balance - invoiceCashPaid(invoiceId) - invoiceCreditApplied(invoiceId, excludeApplicationId))
}

/**
 * Status after credits. Precedence: fully settled → Paid; past due with a
 * balance → Overdue (overdue wins over partial so collections still see it);
 * some settlement → Partially paid; otherwise Open.
 */
export function deriveInvoiceStatus(inv: Pick<SalesInvoice, 'total' | 'dueDate'>, balance: number): InvoiceStatus {
  if (balance <= 0) return 'paid'
  if (daysUntil(inv.dueDate) < 0) return 'overdue'
  if (balance < inv.total) return 'partially-paid'
  return 'open'
}

/** Write derived balance/status onto the shared salesInvoices rows. */
export function syncInvoiceBalances(): void {
  for (const inv of salesInvoices) {
    const base = baseOf(inv)
    const credit = invoiceCreditApplied(inv.id)
    const cash = invoiceCashPaid(inv.id)
    const totalSettled = credit + cash
    if (totalSettled === 0) {
      inv.balance = base.balance
      inv.status = base.status
    } else {
      inv.balance = Math.max(0, base.balance - totalSettled)
      inv.status = deriveInvoiceStatus(inv, inv.balance)
    }
  }
}
syncInvoiceBalances()

export function applicationsForInvoice(invoiceId: string): { application: CreditMemoApplication; amount: number }[] {
  const out: { application: CreditMemoApplication; amount: number }[] = []
  for (const a of creditMemoApplications) {
    const amt = a.allocations.filter((al) => al.invoiceId === invoiceId).reduce((s, al) => s + al.amount, 0)
    if (amt > 0) out.push({ application: a, amount: amt })
  }
  return out.sort((x, y) => y.application.date.localeCompare(x.application.date))
}
export function invoiceHasCreditApplied(invoiceId: string): boolean {
  return invoiceCreditApplied(invoiceId) > 0
}

/**
 * Invoices a credit can be applied to: the customer's invoices with a balance,
 * oldest first (FIFO is how AR clerks settle). In edit mode the invoices already
 * in the application stay listed even if this application fully paid them.
 */
export function applicableInvoices(customerId: string, excludeApplicationId?: string): SalesInvoice[] {
  const inEdit = new Set(excludeApplicationId ? (getApplication(excludeApplicationId)?.allocations.map((a) => a.invoiceId) ?? []) : [])
  return salesInvoices
    .filter((i) => i.customer.id === customerId && (invoiceBalance(i.id, excludeApplicationId) > 0 || inEdit.has(i.id)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.number - b.number)
}

// ── Numbering ──────────────────────────────────────────────────────────────────

export const nextMemoNumber = () => Math.max(10079, ...creditMemos.map((m) => m.number)) + 1
export const nextApplicationNumber = () => Math.max(90098, ...creditMemoApplications.map((a) => a.number)) + 1
export const nextRefundNumber = () => Math.max(10018, ...creditMemoRefunds.map((r) => r.number)) + 1

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}
function nowIso(): string {
  // Wall clock time on the simulated "today" so new records sort as today's.
  const d = new Date()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${SIM_TODAY_ISO}T${hh}:${mm}:00+07:00`
}
function rp(n: number): string { return `Rp${n.toLocaleString('id-ID')},00` }
function dmy(iso: string): string { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }

// ── Validation (codes, not copy) ───────────────────────────────────────────────

export type FieldError =
  | { code: 'REQUIRED' }
  | { code: 'AMOUNT_POSITIVE' }
  | { code: 'OVER_BALANCE'; limit: number }
  | { code: 'OVER_AVAILABLE'; limit: number }
  | { code: 'BEFORE_MEMO_DATE'; date: string }
  | { code: 'BEFORE_INVOICE_DATE'; date: string }
  | { code: 'NOTHING_ENTERED' }
  | { code: 'BELOW_USED'; used: number }
  | { code: 'CUSTOMER_LOCKED' }
  | { code: 'NO_LINES' }
  | { code: 'AFTER_FIRST_USE'; date: string }

// Credit memo ------------------------------------------------------------------
export interface MemoDraft {
  customerId: string
  date: string
  lines: { id: string; accountCode: string; reason: string; amount: number }[]
  memo: string
  tags?: string[]
  attachments: CmAttachment[]
}
export interface MemoErrors {
  customer?: FieldError
  date?: FieldError
  lines: Record<string, { account?: FieldError; amount?: FieldError }>
  total?: FieldError
}
export function validateMemo(d: MemoDraft, editingId?: string): { ok: boolean; errors: MemoErrors } {
  const e: MemoErrors = { lines: {} }
  const editing = editingId ? getCreditMemo(editingId) : undefined
  const used = editingId ? memoUsed(editingId) : 0
  if (!d.customerId) e.customer = { code: 'REQUIRED' }
  else if (editing && used > 0 && d.customerId !== editing.customerId) e.customer = { code: 'CUSTOMER_LOCKED' }
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
  // A memo can't be back-dated before credit was already spent from it.
  if (!e.date && editing && used > 0) {
    const earliest = [...applicationsForMemo(editing.id).map((a) => a.date), ...refundsForMemo(editing.id).map((r) => r.date)].sort()[0]
    if (earliest && d.date > earliest) e.date = { code: 'AFTER_FIRST_USE', date: earliest }
  }
  const ok = !e.customer && !e.date && !e.total && Object.keys(e.lines).length === 0
  return { ok, errors: e }
}

// Credit memo applied ----------------------------------------------------------
export interface ApplicationDraft {
  customerId: string
  creditMemoId: string
  date: string
  allocations: CreditAllocation[]   // may include zero rows; zeros are dropped on save
  memo: string
  attachments: CmAttachment[]
}
export interface ApplicationErrors {
  creditMemo?: FieldError
  date?: FieldError
  rows: Record<string, FieldError>  // invoiceId → error
  total?: FieldError
}
export function validateApplication(d: ApplicationDraft, editingId?: string): { ok: boolean; errors: ApplicationErrors } {
  const e: ApplicationErrors = { rows: {} }
  const memo = d.creditMemoId ? getCreditMemo(d.creditMemoId) : undefined
  if (!memo) e.creditMemo = { code: 'REQUIRED' }
  if (!d.date) e.date = { code: 'REQUIRED' }
  else if (memo && d.date < memo.date) e.date = { code: 'BEFORE_MEMO_DATE', date: memo.date }
  const active = d.allocations.filter((a) => a.amount > 0)
  for (const a of d.allocations) {
    if (a.amount < 0) { e.rows[a.invoiceId] = { code: 'AMOUNT_POSITIVE' }; continue }
    if (!(a.amount > 0)) continue
    const inv = invoiceById(a.invoiceId)
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
  const ok = !e.creditMemo && !e.date && !e.total && Object.keys(e.rows).length === 0
  return { ok, errors: e }
}

// Credit memo refund -----------------------------------------------------------
export interface RefundDraft {
  customerId: string
  payFromAccountId: string
  date: string
  lines: RefundLine[]               // may include zero rows
  memo: string
  attachments: CmAttachment[]
}
export interface RefundErrors {
  payFrom?: FieldError
  date?: FieldError
  rows: Record<string, FieldError>  // creditMemoId → error
  total?: FieldError
}
export function validateRefund(d: RefundDraft, editingId?: string): { ok: boolean; errors: RefundErrors } {
  const e: RefundErrors = { rows: {} }
  if (!d.payFromAccountId) e.payFrom = { code: 'REQUIRED' }
  if (!d.date) e.date = { code: 'REQUIRED' }
  const active = d.lines.filter((l) => l.amount > 0)
  for (const l of d.lines) {
    if (l.amount < 0) { e.rows[l.creditMemoId] = { code: 'AMOUNT_POSITIVE' }; continue }
    if (!(l.amount > 0)) continue
    const memo = getCreditMemo(l.creditMemoId)
    const limit = memoRemaining(l.creditMemoId, { refundId: editingId })
    if (l.amount > limit) e.rows[l.creditMemoId] = { code: 'OVER_AVAILABLE', limit }
    else if (memo && d.date && d.date < memo.date) e.rows[l.creditMemoId] = { code: 'BEFORE_MEMO_DATE', date: memo.date }
  }
  if (!active.length) e.total = { code: 'NOTHING_ENTERED' }
  const ok = !e.payFrom && !e.date && !e.total && Object.keys(e.rows).length === 0
  return { ok, errors: e }
}

// ── Mutations ──────────────────────────────────────────────────────────────────

export type MutationResult = { ok: true; id: string } | { ok: false; reason: string }

function diff(label: string, before: string, after: string, out: CmActivityDetail[]) {
  if (before !== after) out.push({ label, value: `${before || '—'} → ${after || '—'}` })
}

export function createCreditMemo(d: MemoDraft): MutationResult {
  const v = validateMemo(d)
  if (!v.ok) return { ok: false, reason: 'INVALID' }
  const number = nextMemoNumber()
  const at = nowIso()
  const lines = d.lines.filter((l) => l.accountCode && l.amount > 0).map((l, i) => ({ ...l, id: `${number}-l${i + 1}-${Date.now().toString(36)}` }))
  const m: SalesCreditMemo = {
    id: uid('cm'), number, customerId: d.customerId, date: d.date, lines,
    memo: d.memo.trim(), tags: d.tags ?? [], attachments: d.attachments,
    createdAt: at, updatedAt: at, updatedBy: CURRENT_USER,
    history: [{ date: at, user: CURRENT_USER, activity: 'Created', details: [
      { label: 'Transaction no.', value: memoLabel(number) },
      { label: 'Customer', value: customerNameOf(d.customerId) },
      { label: 'Transaction date', value: dmy(d.date) },
      { label: 'Total credit', value: rp(memoTotal({ lines })) },
    ] }],
  }
  creditMemos.unshift(m)
  persistAll()
  return { ok: true, id: m.id }
}

export function updateCreditMemo(id: string, d: MemoDraft): MutationResult {
  const m = getCreditMemo(id)
  if (!m) return { ok: false, reason: 'NOT_FOUND' }
  const v = validateMemo(d, id)
  if (!v.ok) return { ok: false, reason: 'INVALID' }
  const lines = d.lines.filter((l) => l.accountCode && l.amount > 0)
  const changes: CmActivityDetail[] = []
  diff('Customer', customerNameOf(m.customerId), customerNameOf(d.customerId), changes)
  diff('Transaction date', dmy(m.date), dmy(d.date), changes)
  diff('Total credit', rp(memoTotal(m)), rp(memoTotal({ lines })), changes)
  diff('Memo', m.memo, d.memo.trim(), changes)
  const at = nowIso()
  Object.assign(m, { customerId: d.customerId, date: d.date, lines, memo: d.memo.trim(), tags: d.tags ?? m.tags ?? [], attachments: d.attachments, updatedAt: at, updatedBy: CURRENT_USER })
  m.history.unshift({ date: at, user: CURRENT_USER, activity: 'Edited', details: changes.length ? changes : [{ label: 'Lines', value: 'Updated' }] })
  persistAll()
  syncInvoiceBalances()
  return { ok: true, id }
}

export interface DeleteGuard { ok: boolean; applications: number; refunds: number }
export function canDeleteCreditMemo(id: string): DeleteGuard {
  const applications = applicationsForMemo(id).length
  const refunds = refundsForMemo(id).length
  return { ok: applications === 0 && refunds === 0, applications, refunds }
}
export function deleteCreditMemo(id: string): MutationResult {
  const g = canDeleteCreditMemo(id)
  if (!g.ok) return { ok: false, reason: `MEMO_IN_USE: ${g.applications} application(s), ${g.refunds} refund(s)` }
  const i = creditMemos.findIndex((m) => m.id === id)
  if (i === -1) return { ok: false, reason: 'NOT_FOUND' }
  creditMemos.splice(i, 1)
  persistAll()
  return { ok: true, id }
}

export function createApplication(d: ApplicationDraft): MutationResult {
  const v = validateApplication(d)
  if (!v.ok) return { ok: false, reason: 'INVALID' }
  const number = nextApplicationNumber()
  const at = nowIso()
  const allocations = d.allocations.filter((a) => a.amount > 0)
  const a: CreditMemoApplication = {
    id: uid('cma'), number, customerId: d.customerId, creditMemoId: d.creditMemoId, date: d.date,
    allocations, memo: d.memo.trim(), attachments: d.attachments,
    createdAt: at, updatedAt: at, updatedBy: CURRENT_USER,
    history: [{ date: at, user: CURRENT_USER, activity: 'Created', details: [
      { label: 'Transaction no.', value: applicationLabel(number) },
      { label: 'Credit memo', value: memoLabel(getCreditMemo(d.creditMemoId)!.number) },
      ...allocations.map((al) => ({ label: invoiceLabel(invoiceById(al.invoiceId)?.number ?? 0), value: rp(al.amount) })),
    ] }],
  }
  creditMemoApplications.unshift(a)
  persistAll()
  syncInvoiceBalances()
  return { ok: true, id: a.id }
}

export function updateApplication(id: string, d: ApplicationDraft): MutationResult {
  const a = getApplication(id)
  if (!a) return { ok: false, reason: 'NOT_FOUND' }
  const v = validateApplication(d, id)
  if (!v.ok) return { ok: false, reason: 'INVALID' }
  const allocations = d.allocations.filter((x) => x.amount > 0)
  const changes: CmActivityDetail[] = []
  const memoNo = (mid: string) => memoLabel(getCreditMemo(mid)?.number ?? 0)
  diff('Credit memo', memoNo(a.creditMemoId), memoNo(d.creditMemoId), changes)
  diff('Transaction date', dmy(a.date), dmy(d.date), changes)
  const ids = new Set([...a.allocations, ...allocations].map((x) => x.invoiceId))
  for (const invId of ids) {
    const before = a.allocations.find((x) => x.invoiceId === invId)?.amount ?? 0
    const after = allocations.find((x) => x.invoiceId === invId)?.amount ?? 0
    diff(invoiceLabel(invoiceById(invId)?.number ?? 0), before ? rp(before) : '', after ? rp(after) : '', changes)
  }
  diff('Memo', a.memo, d.memo.trim(), changes)
  const at = nowIso()
  Object.assign(a, { creditMemoId: d.creditMemoId, date: d.date, allocations, memo: d.memo.trim(), attachments: d.attachments, updatedAt: at, updatedBy: CURRENT_USER })
  a.history.unshift({ date: at, user: CURRENT_USER, activity: 'Edited', details: changes.length ? changes : [{ label: 'Attachment', value: 'Updated' }] })
  persistAll()
  syncInvoiceBalances()
  return { ok: true, id }
}

export function deleteApplication(id: string): MutationResult {
  const i = creditMemoApplications.findIndex((a) => a.id === id)
  if (i === -1) return { ok: false, reason: 'NOT_FOUND' }
  creditMemoApplications.splice(i, 1)
  persistAll()
  syncInvoiceBalances()
  return { ok: true, id }
}

export function createRefund(d: RefundDraft): MutationResult {
  const v = validateRefund(d)
  if (!v.ok) return { ok: false, reason: 'INVALID' }
  const number = nextRefundNumber()
  const at = nowIso()
  const lines = d.lines.filter((l) => l.amount > 0).map((l) => ({ ...l, reason: l.reason.trim() }))
  const r: CreditMemoRefund = {
    id: uid('cmr'), number, customerId: d.customerId, payFromAccountId: d.payFromAccountId, date: d.date,
    lines, memo: d.memo.trim(), attachments: d.attachments,
    createdAt: at, updatedAt: at, updatedBy: CURRENT_USER,
    history: [{ date: at, user: CURRENT_USER, activity: 'Created', details: [
      { label: 'Transaction no.', value: refundLabel(number) },
      { label: 'Pay from', value: cashAccountLabel(d.payFromAccountId) },
      ...lines.map((l) => ({ label: memoLabel(getCreditMemo(l.creditMemoId)?.number ?? 0), value: rp(l.amount) })),
    ] }],
  }
  creditMemoRefunds.unshift(r)
  persistAll()
  return { ok: true, id: r.id }
}

export function updateRefund(id: string, d: RefundDraft): MutationResult {
  const r = getRefund(id)
  if (!r) return { ok: false, reason: 'NOT_FOUND' }
  const v = validateRefund(d, id)
  if (!v.ok) return { ok: false, reason: 'INVALID' }
  const lines = d.lines.filter((l) => l.amount > 0).map((l) => ({ ...l, reason: l.reason.trim() }))
  const changes: CmActivityDetail[] = []
  diff('Pay from', cashAccountLabel(r.payFromAccountId), cashAccountLabel(d.payFromAccountId), changes)
  diff('Transaction date', dmy(r.date), dmy(d.date), changes)
  diff('Total refund', rp(refundTotal(r)), rp(refundTotal({ lines })), changes)
  diff('Memo', r.memo, d.memo.trim(), changes)
  const at = nowIso()
  Object.assign(r, { payFromAccountId: d.payFromAccountId, date: d.date, lines, memo: d.memo.trim(), attachments: d.attachments, updatedAt: at, updatedBy: CURRENT_USER })
  r.history.unshift({ date: at, user: CURRENT_USER, activity: 'Edited', details: changes.length ? changes : [{ label: 'Lines', value: 'Updated' }] })
  persistAll()
  return { ok: true, id }
}

export function deleteRefund(id: string): MutationResult {
  const i = creditMemoRefunds.findIndex((r) => r.id === id)
  if (i === -1) return { ok: false, reason: 'NOT_FOUND' }
  creditMemoRefunds.splice(i, 1)
  persistAll()
  return { ok: true, id }
}

// ── Journal entries (read-only postings) ───────────────────────────────────────

export interface CmJournalRow { account: string; debit?: number; credit?: number }

/** Credit memo: Dr each line account · Cr Accounts receivable. */
export function memoJournal(m: SalesCreditMemo): CmJournalRow[] {
  return [
    ...m.lines.map((l) => ({ account: cmAccountLabel(l.accountCode), debit: l.amount })),
    { account: AR_ACCOUNT, credit: memoTotal(m) },
  ]
}
/** Applying credit only moves it between AR open items: Dr AR (memo) · Cr AR (invoice). */
export function applicationJournal(a: CreditMemoApplication): CmJournalRow[] {
  const memo = getCreditMemo(a.creditMemoId)
  return [
    { account: `${AR_ACCOUNT} · ${memo ? memoLabel(memo.number) : ''}`, debit: applicationTotal(a) },
    ...a.allocations.map((al) => ({ account: `${AR_ACCOUNT} · ${invoiceLabel(invoiceById(al.invoiceId)?.number ?? 0)}`, credit: al.amount })),
  ]
}
/** Refund: Dr Accounts receivable · Cr the cash/bank account it was paid from. */
export function refundJournal(r: CreditMemoRefund): CmJournalRow[] {
  return [
    { account: AR_ACCOUNT, debit: refundTotal(r) },
    { account: cashAccountLabel(r.payFromAccountId), credit: refundTotal(r) },
  ]
}

// ── Customer ↔ contact bridge (contacts join on name, see ContactDetailsPage) ──

/** Customers that exist in the AR master — the only ones a memo can be raised for. */
export function customerOptions() {
  return [...customers].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ id: c.id, name: c.name }))
}
