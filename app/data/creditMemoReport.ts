/**
 * Credit Memo Detail Report (Reports › Sales › Credit Memo). PRD "[PRD] Credit
 * Memo Report" (Accounting & Tax) + Figma 4531-72196.
 *
 * Mutation-based model per the PRD Key Logic:
 *  • Each CM carries a Saldo Awal (beginning balance) for the period and an
 *    ordered list of in-period mutations (Issued +, Applied −, Refund −,
 *    Reversal +). Running balance = Saldo Awal + cumulative mutations.
 *  • remaining = last running balance. Status: Active (remaining == original),
 *    Sebagian (0 < remaining < original), Habis (remaining == 0).
 *  • Customer total = Σ remaining WHERE remaining > 0 (immutable; zero-balance
 *    CMs never contribute). Customers sorted by total desc.
 *  • Zero-balance CMs/customers hidden unless the "Tampilkan CM habis" toggle
 *    is ON. Case C (no prior data, no in-period activity) excluded entirely.
 *  • Voided / soft-deleted CMs excluded from every query.
 *
 * Figures are DERIVED from the credit memo mini-DB (creditMemos.ts) — the same
 * records the Credit memo / Applied / Refund pages create — so the report and
 * the documents can never disagree. Saved views persist to the mini-DB.
 */
import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import {
  creditMemos, creditMemoApplications, creditMemoRefunds, memoTotal, memoLabel, applicationLabel,
  refundLabel, invoiceLabel, invoiceById, customerNameOf, type SalesCreditMemo,
} from './creditMemos'

export type CmMutationType = 'Issued' | 'Applied' | 'Refund' | 'Reversal'
/** CM lifecycle status derived from remaining vs original. */
export type CmStatus = 'Active' | 'Sebagian' | 'Habis'
export const CM_MUTATION_TYPES: CmMutationType[] = ['Issued', 'Applied', 'Refund', 'Reversal']

export interface CmMutation {
  id: string
  date: string              // ISO — within the report period
  type: CmMutationType
  transactionNo: string     // linked source doc, e.g. "Sales Invoice #10222"
  transactionHref?: string  // deep link target (mock: '#')
  description: string
  /** Signed amount: Issued/Reversal positive, Applied/Refund negative. */
  amount: number
}

export interface CreditMemo {
  id: string
  customerId: string
  cmNumber: string          // "Credit Memo #12333"
  issueDate: string         // ISO
  originalAmount: number
  /** Saldo Awal — remaining as of (period start − 1 day). Case B → 0. */
  beginningBalance: number
  /** Case C guard — false = no prior balance record; excluded when no in-period rows. */
  hasPriorData: boolean
  mutations: CmMutation[]   // ordered ASC by date
  voided?: boolean
  deleted?: boolean
}

export interface CmCustomer {
  id: string
  name: string
  cms: CreditMemo[]
}

// ── Derived helpers (the "server-side" computation, done here for the mock) ────
/** Running-balance rows for a CM: a Saldo Awal row then one row per mutation. */
export interface CmHistoryRow {
  id: string
  date: string
  type: CmMutationType | 'Saldo Awal'
  label: string             // number for a mutation; "Saldo Awal" for the opener
  transactionNo?: string
  transactionHref?: string
  description?: string
  movement: number | null   // null on the Saldo Awal row
  balance: number           // running balance after this row
}
export function historyRows(cm: CreditMemo): CmHistoryRow[] {
  const rows: CmHistoryRow[] = [{
    id: `${cm.id}-open`, date: cm.issueDate, type: 'Saldo Awal', label: 'Saldo Awal',
    movement: null, balance: cm.beginningBalance,
  }]
  let bal = cm.beginningBalance
  for (const m of cm.mutations) {
    bal += m.amount
    rows.push({
      id: m.id, date: m.date, type: m.type, label: m.transactionNo,
      transactionNo: m.transactionNo, transactionHref: m.transactionHref,
      description: m.description, movement: m.amount, balance: bal,
    })
  }
  return rows
}
export function remainingOf(cm: CreditMemo): number {
  return cm.beginningBalance + cm.mutations.reduce((s, m) => s + m.amount, 0)
}
export function statusOf(cm: CreditMemo): CmStatus {
  const r = remainingOf(cm)
  if (r <= 0) return 'Habis'
  if (r >= cm.originalAmount) return 'Active'
  return 'Sebagian'
}
/** A CM is inactive-for-period (hidden unless toggle ON) when it ends at 0 OR it
 *  opened at 0 with no in-period activity. */
function isZeroForPeriod(cm: CreditMemo): boolean {
  return remainingOf(cm) <= 0 || (cm.beginningBalance === 0 && cm.mutations.length === 0)
}
/** Case C — no prior balance data AND no in-period mutations → excluded entirely. */
function isCaseC(cm: CreditMemo): boolean {
  return !cm.hasPriorData && cm.mutations.length === 0
}

// ── Ledger — DERIVED from the credit memo mini-DB (creditMemos.ts), never a
// separate seed. Every Credit Memo / Credit Memo Applied / Credit Memo Refund the
// user creates, edits or deletes shows up here on the next render. The report
// period is Aug 2026 (the page's default + the window it gates on):
//   • memo dated before 1 Aug → Case A: Saldo Awal = total − usage before 1 Aug
//   • memo dated in Aug       → Case B: Saldo Awal 0, an "Issued" mutation
//   • usage outside the period is excluded from the mutation list.
export const REPORT_PERIOD_START = '2026-08-01'
export const REPORT_PERIOD_END = '2026-08-31'

function inPeriod(iso: string): boolean { return iso >= REPORT_PERIOD_START && iso <= REPORT_PERIOD_END }

function ledgerFor(m: SalesCreditMemo): CreditMemo {
  const total = memoTotal(m)
  const apps = creditMemoApplications.filter((a) => a.creditMemoId === m.id)
  const refunds = creditMemoRefunds.filter((r) => r.lines.some((l) => l.creditMemoId === m.id))
  const usage: { date: string; m: CmMutation }[] = []
  for (const a of apps) {
    const amt = a.allocations.reduce((s, al) => s + al.amount, 0)
    const invs = a.allocations.map((al) => invoiceLabel(invoiceById(al.invoiceId)?.number ?? 0)).join(', ')
    usage.push({ date: a.date, m: { id: `${m.id}-${a.id}`, date: a.date, type: 'Applied', transactionNo: applicationLabel(a.number), transactionHref: `/credit-memo-applications/${a.id}`, description: `Applied to ${invs}`, amount: -amt } })
  }
  for (const r of refunds) {
    const amt = r.lines.filter((l) => l.creditMemoId === m.id).reduce((s, l) => s + l.amount, 0)
    const reason = r.lines.find((l) => l.creditMemoId === m.id)?.reason || 'Cash refund to customer'
    usage.push({ date: r.date, m: { id: `${m.id}-${r.id}`, date: r.date, type: 'Refund', transactionNo: refundLabel(r.number), transactionHref: `/credit-memo-refunds/${r.id}`, description: reason, amount: -amt } })
  }
  usage.sort((a, b) => a.date.localeCompare(b.date))
  const issuedBefore = m.date < REPORT_PERIOD_START
  const usedBefore = usage.filter((u) => u.date < REPORT_PERIOD_START).reduce((s, u) => s - u.m.amount, 0)
  const mutations: CmMutation[] = []
  if (inPeriod(m.date)) {
    mutations.push({ id: `${m.id}-issued`, date: m.date, type: 'Issued', transactionNo: memoLabel(m.number), transactionHref: `/credit-memos/${m.id}`, description: m.lines[0]?.reason ?? 'Credit memo', amount: total })
  }
  for (const u of usage) if (inPeriod(u.date)) mutations.push(u.m)
  return {
    id: m.id,
    customerId: m.customerId,
    cmNumber: memoLabel(m.number),
    issueDate: m.date,
    originalAmount: total,
    beginningBalance: issuedBefore ? total - usedBefore : 0,
    hasPriorData: issuedBefore,
    mutations,
  }
}

/** Customers with their memos' period ledgers — recomputed from the mini-DB on every call. */
export function creditMemoLedger(): CmCustomer[] {
  const byCustomer = new Map<string, CmCustomer>()
  for (const m of creditMemos) {
    if (m.date > REPORT_PERIOD_END) continue
    let c = byCustomer.get(m.customerId)
    if (!c) { c = { id: m.customerId, name: customerNameOf(m.customerId), cms: [] }; byCustomer.set(m.customerId, c) }
    c.cms.push(ledgerFor(m))
  }
  for (const c of byCustomer.values()) c.cms.sort((a, b) => a.issueDate.localeCompare(b.issueDate))
  return [...byCustomer.values()]
}

// ── Report query — filters + zero-balance toggle + Case C + voided exclusion ──
export type CmComparator = 'isAnyOf' | 'isNoneOf'
export interface CmReportFilters {
  keyword: string             // free-text over the chosen column(s)
  keywordColumn: string       // 'all' | 'number' | 'description'
  customerComparator: CmComparator
  customers: string[]         // customer name fragments (tags) — empty = all
  txnTypes: CmMutationType[]  // empty = all
  showZero: boolean           // "Show fully-used credit memos"
}
export interface CmReportCustomer {
  id: string
  name: string
  total: number               // Σ remaining WHERE remaining > 0
  activeCount: number         // count of CMs with remaining > 0
  cms: CreditMemo[]           // visible CMs (respecting toggle)
}

/** A CM is visible given the toggle, txn-type filter, and keyword search. */
function cmVisible(cm: CreditMemo, f: CmReportFilters): boolean {
  if (cm.voided || cm.deleted) return false
  if (isCaseC(cm)) return false
  const tt = f.txnTypes ?? []
  if (tt.length && !cm.mutations.some((m) => tt.includes(m.type))) return false
  if (!f.showZero && isZeroForPeriod(cm)) return false
  if (!keywordMatch(cm, f.keyword, f.keywordColumn)) return false
  return true
}
function keywordMatch(cm: CreditMemo, keyword: string | undefined, column: string | undefined): boolean {
  const q = (keyword ?? '').trim().toLowerCase()
  if (!q) return true
  const col = column ?? 'all'
  const hay: string[] = []
  if (col === 'all' || col === 'number') hay.push(cm.cmNumber, ...cm.mutations.map((m) => m.transactionNo))
  if (col === 'all' || col === 'description') hay.push(...cm.mutations.map((m) => m.description))
  return hay.some((h) => h.toLowerCase().includes(q))
}
/** Customer name matches the tag list under the chosen comparator (contains, CI). */
function customerMatch(name: string, f: CmReportFilters): boolean {
  const list = f.customers ?? []
  if (!list.length) return true
  const hit = list.some((t) => name.toLowerCase().includes((t ?? '').trim().toLowerCase()))
  return (f.customerComparator ?? 'isAnyOf') === 'isNoneOf' ? !hit : hit
}

export function creditMemoReport(f: CmReportFilters): CmReportCustomer[] {
  const groups: CmReportCustomer[] = []
  for (const c of creditMemoLedger()) {
    if (!customerMatch(c.name, f)) continue
    const cms = c.cms.filter((cm) => cmVisible(cm, f))
    if (!cms.length) continue
    const total = cms.reduce((s, cm) => { const r = remainingOf(cm); return s + (r > 0 ? r : 0) }, 0)
    const activeCount = cms.filter((cm) => remainingOf(cm) > 0).length
    groups.push({ id: c.id, name: c.name, total, activeCount, cms })
  }
  // Sort customers by total remaining balance, descending (PRD TS-02).
  return groups.sort((a, b) => b.total - a.total)
}

/** All distinct customer names (for the customer filter autocomplete). */
export function cmCustomerNames(): string[] { return creditMemoLedger().map((c) => c.name).sort((a, b) => a.localeCompare(b)) }

// ── Saved views (Default + user views) — same concept as CRM Customers. ────────
export interface CmSavedView { id: string; name: string; filters: CmReportFilters }
export function emptyCmReportFilters(): CmReportFilters { return { keyword: '', keywordColumn: 'all', customerComparator: 'isAnyOf', customers: [], txnTypes: [], showZero: false } }
export const creditMemoViews = reactive<CmSavedView[]>(loadSnapshot<CmSavedView>('credit-memo-views-v2') ?? [])
function persistViews() { saveSnapshot('credit-memo-views-v2', creditMemoViews) }
let viewSeq = creditMemoViews.length + 1
export function addCmView(v: Omit<CmSavedView, 'id'>): CmSavedView {
  const view: CmSavedView = { ...v, id: `cmview-${Date.now()}-${viewSeq++}` }
  creditMemoViews.push(view); persistViews(); return view
}
export function updateCmView(id: string, patch: Partial<Omit<CmSavedView, 'id'>>): void {
  const v = creditMemoViews.find((x) => x.id === id); if (!v) return
  Object.assign(v, patch); persistViews()
}
export function deleteCmView(id: string): void {
  const i = creditMemoViews.findIndex((x) => x.id === id)
  if (i !== -1) { creditMemoViews.splice(i, 1); persistViews() }
}
