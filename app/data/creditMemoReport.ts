/**
 * Credit Memo Detail Report (Reports › Sales › Credit Memo). PRD "[PRD] Credit
 * Memo Report" (Accounting & Tax) + Figma 4531-72195 (frames 72196 / 73269 /
 * 75341).
 *
 * Mutation-based model per the PRD Key Logic:
 *  • Each CM carries a Saldo Awal (beginning balance) for the period and an
 *    ordered list of in-period mutations (Issued +, Applied −, Refund −,
 *    Reversal +). remaining = Saldo Awal + Σ mutations.
 *  • The report shows each CM row at its OPENING balance for the period
 *    (Case A, issued before the period → Saldo Awal; Case B, issued in the
 *    period → original amount) followed by one entry row per in-period
 *    application / refund / reversal (`entryRows`) with a running balance
 *    that ends at `remainingOf(cm)`.
 *  • Status: Open (remaining > 0) · Closed (remaining = 0).
 *  • Customer total = Σ remaining WHERE remaining > 0 (immutable; Closed CMs
 *    never contribute). Customers sorted by total desc.
 *  • Closed CMs are visible by default (Figma shows a Closed CM ending at Rp0);
 *    the "Status" filter narrows to Open / Closed. Case C (no prior data, no
 *    in-period activity) is excluded entirely.
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
/** CM status derived from the remaining balance: Open (> 0) · Closed (= 0). */
export type CmStatus = 'Open' | 'Closed'
export const CM_MUTATION_TYPES: CmMutationType[] = ['Issued', 'Applied', 'Refund', 'Reversal']
export const CM_STATUSES: CmStatus[] = ['Open', 'Closed']

export interface CmMutation {
  id: string
  date: string              // ISO — within the report period
  type: CmMutationType
  transactionNo: string     // linked source doc, e.g. "Sales Invoice #10222"
  transactionHref?: string  // deep link target (mock: '#')
  description: string
  /** Second line under the number — linked invoice(s) for an application
   *  ("Sales Invoice #40031, Sales Invoice #40131"), the reason for a refund. */
  linkedNo?: string
  /** Route of the first linked invoice, when there is one. */
  linkedHref?: string
  /** Signed amount: Issued/Reversal positive, Applied/Refund negative. */
  amount: number
}

export interface CreditMemo {
  id: string
  customerId: string
  cmNumber: string          // "Credit Memo #12333"
  issueDate: string         // ISO
  /** CM-row description — the memo's first line reason, e.g. "Returned goods credit". */
  description: string
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
export function remainingOf(cm: CreditMemo): number {
  return cm.beginningBalance + cm.mutations.reduce((s, m) => s + m.amount, 0)
}
/** Open while credit remains; Closed once fully applied / refunded. */
export function statusOf(cm: CreditMemo): CmStatus {
  return remainingOf(cm) > 0 ? 'Open' : 'Closed'
}
/**
 * Balance shown on the CM row — the CM's value at the start of its period life:
 *   Case A (issued before the period) → Saldo Awal (`beginningBalance`)
 *   Case B (issued in the period)     → original amount (Saldo Awal 0 + Issued)
 * Computed as Saldo Awal + Σ in-period Issued, so the entry rows (everything
 * except Issued) always run from here down to `remainingOf(cm)`.
 */
export function openingBalanceOf(cm: CreditMemo): number {
  return cm.beginningBalance + cm.mutations.reduce((s, m) => s + (m.type === 'Issued' ? m.amount : 0), 0)
}

/** One application / refund / reversal row under a CM (Figma L3 row). */
export interface CmEntryRow {
  id: string
  date: string                 // ISO
  type: 'Applied' | 'Refund' | 'Reversal'
  title: string                // "Credit Memo Applied #90100" / "Credit Memo Refund #10020"
  titleHref?: string           // /credit-memo-applications/:id · /credit-memo-refunds/:id
  linkedNo?: string            // "Sales Invoice #40031, Sales Invoice #40131" · refund reason
  linkedHref?: string          // /sales-invoices/:id of the first linked invoice
  status: 'Closed'             // applications/refunds are settled documents
  movement: number             // signed: Applied/Refund negative, Reversal positive
  balance: number              // running, from openingBalanceOf(cm); last === remainingOf(cm)
}
/** In-period mutations except "Issued", oldest first, with a running balance. */
export function entryRows(cm: CreditMemo): CmEntryRow[] {
  let bal = openingBalanceOf(cm)
  return cm.mutations
    .filter((m): m is CmMutation & { type: CmEntryRow['type'] } => m.type !== 'Issued')
    .map((m, i) => ({ m, i }))
    .sort((a, b) => a.m.date.localeCompare(b.m.date) || a.i - b.i)
    .map(({ m }) => {
      bal += m.amount
      return {
        id: m.id, date: m.date, type: m.type,
        title: m.transactionNo, titleHref: m.transactionHref,
        linkedNo: m.linkedNo, linkedHref: m.linkedHref,
        status: 'Closed' as const, movement: m.amount, balance: bal,
      }
    })
}

/** @deprecated Pre-Figma-v2 history (Saldo Awal row + every mutation). Use
 *  `openingBalanceOf` + `entryRows`; kept only until no caller imports it. */
export interface CmHistoryRow {
  id: string
  date: string
  type: CmMutationType | 'Saldo Awal'
  label: string
  transactionNo?: string
  transactionHref?: string
  description?: string
  movement: number | null
  balance: number
}
/** @deprecated See CmHistoryRow. */
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
    const firstInv = a.allocations[0]?.invoiceId
    usage.push({ date: a.date, m: {
      id: `${m.id}-${a.id}`, date: a.date, type: 'Applied', transactionNo: applicationLabel(a.number), transactionHref: `/credit-memo-applications/${a.id}`,
      description: `Applied to ${invs}`, linkedNo: invs || undefined, linkedHref: firstInv ? `/sales-invoices/${firstInv}` : undefined, amount: -amt,
    } })
  }
  for (const r of refunds) {
    const amt = r.lines.filter((l) => l.creditMemoId === m.id).reduce((s, l) => s + l.amount, 0)
    const reason = r.lines.find((l) => l.creditMemoId === m.id)?.reason?.trim() || 'Refund to customer'
    usage.push({ date: r.date, m: { id: `${m.id}-${r.id}`, date: r.date, type: 'Refund', transactionNo: refundLabel(r.number), transactionHref: `/credit-memo-refunds/${r.id}`, description: reason, linkedNo: reason, amount: -amt } })
  }
  usage.sort((a, b) => a.date.localeCompare(b.date))  // stable: applications before refunds on the same day
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
    description: m.lines[0]?.reason?.trim() || 'Credit memo',
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

// ── Report query — filters + status + Case C + voided exclusion ─────────────────
export type CmComparator = 'isAnyOf' | 'isNoneOf'
export interface CmReportFilters {
  keyword: string             // free-text over the chosen column(s)
  keywordColumn: string       // 'all' | 'number' | 'description'
  customerComparator: CmComparator
  customers: string[]         // customer name fragments (tags) — empty = all
  txnTypes: CmMutationType[]  // empty = all
  statuses: CmStatus[]        // Open / Closed — empty = all
}
export interface CmReportCustomer {
  id: string
  name: string
  total: number               // Σ remaining WHERE remaining > 0
  activeCount: number         // count of CMs with remaining > 0
  cms: CreditMemo[]           // visible CMs (respecting the filters)
}

/** A CM is visible given the txn-type, status and keyword filters. Closed CMs
 *  show by default; Case C and voided / deleted CMs never do. */
function cmVisible(cm: CreditMemo, f: CmReportFilters): boolean {
  if (cm.voided || cm.deleted) return false
  if (isCaseC(cm)) return false
  const tt = f.txnTypes ?? []
  if (tt.length && !cm.mutations.some((m) => tt.includes(m.type))) return false
  const st = f.statuses ?? []
  if (st.length && !st.includes(statusOf(cm))) return false
  if (!keywordMatch(cm, f.keyword, f.keywordColumn)) return false
  return true
}
function keywordMatch(cm: CreditMemo, keyword: string | undefined, column: string | undefined): boolean {
  const q = (keyword ?? '').trim().toLowerCase()
  if (!q) return true
  const col = column ?? 'all'
  const hay: string[] = []
  if (col === 'all' || col === 'number') hay.push(cm.cmNumber, ...cm.mutations.flatMap((m) => [m.transactionNo, m.linkedNo ?? '']))
  if (col === 'all' || col === 'description') hay.push(cm.description, ...cm.mutations.map((m) => m.description))
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
  return reportFromLedger(creditMemoLedger(), f)
}
/** The report query over an explicit ledger (creditMemoReport = this over the
 *  live mini-DB ledger). Exposed so tests can feed Case C / voided rows. */
export function reportFromLedger(ledger: CmCustomer[], f: CmReportFilters): CmReportCustomer[] {
  const groups: CmReportCustomer[] = []
  for (const c of ledger) {
    if (!customerMatch(c.name, f)) continue
    const cms = c.cms.filter((cm) => cmVisible(cm, f))
    if (!cms.length) continue
    const total = cms.reduce((s, cm) => { const r = remainingOf(cm); return s + (r > 0 ? r : 0) }, 0)
    const activeCount = cms.filter((cm) => remainingOf(cm) > 0).length
    groups.push({ id: c.id, name: c.name, total, activeCount, cms })
  }
  // Sort customers by total remaining balance, descending (PRD TS-02); name breaks ties.
  return groups.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
}

/** All distinct customer names (for the customer filter autocomplete). */
export function cmCustomerNames(): string[] { return creditMemoLedger().map((c) => c.name).sort((a, b) => a.localeCompare(b)) }

// ── Saved views (Default + user views) — same concept as CRM Customers. ────────
export interface CmSavedView { id: string; name: string; filters: CmReportFilters }
export function emptyCmReportFilters(): CmReportFilters { return { keyword: '', keywordColumn: 'all', customerComparator: 'isAnyOf', customers: [], txnTypes: [], statuses: [] } }
/**
 * Coerce stored / partial filters into the current shape. Views saved before the
 * Status filter carry `showZero` and no `statuses` — `showZero` is dropped and
 * `statuses` defaults to [] (all). Unknown status / type values are discarded.
 */
export function normalizeCmFilters(raw: (Partial<CmReportFilters> & { showZero?: unknown }) | null | undefined): CmReportFilters {
  const base = emptyCmReportFilters()
  const r = raw ?? {}
  const list = <T extends string>(v: unknown, allowed?: readonly T[]): T[] =>
    Array.isArray(v) ? v.filter((x): x is T => typeof x === 'string' && (!allowed || allowed.includes(x as T))) : []
  return {
    keyword: typeof r.keyword === 'string' ? r.keyword : base.keyword,
    keywordColumn: typeof r.keywordColumn === 'string' ? r.keywordColumn : base.keywordColumn,
    customerComparator: r.customerComparator === 'isNoneOf' ? 'isNoneOf' : 'isAnyOf',
    customers: list<string>(r.customers),
    txnTypes: list(r.txnTypes, CM_MUTATION_TYPES),
    statuses: list(r.statuses, CM_STATUSES),
  }
}
/** A stored view in the current shape (legacy `showZero` views included). */
export function normalizeCmView(raw: { id: string; name: string; filters?: Parameters<typeof normalizeCmFilters>[0] }): CmSavedView {
  return { id: raw.id, name: raw.name, filters: normalizeCmFilters(raw.filters) }
}
const K_VIEWS = 'credit-memo-views-v2'
export const creditMemoViews = reactive<CmSavedView[]>(
  (loadSnapshot<Parameters<typeof normalizeCmView>[0]>(K_VIEWS) ?? []).map(normalizeCmView),
)
function persistViews() { saveSnapshot(K_VIEWS, creditMemoViews) }
let viewSeq = creditMemoViews.length + 1
export function addCmView(v: Omit<CmSavedView, 'id'>): CmSavedView {
  const view: CmSavedView = { name: v.name, filters: normalizeCmFilters(v.filters), id: `cmview-${Date.now()}-${viewSeq++}` }
  creditMemoViews.push(view); persistViews(); return view
}
export function updateCmView(id: string, patch: Partial<Omit<CmSavedView, 'id'>>): void {
  const v = creditMemoViews.find((x) => x.id === id); if (!v) return
  if (patch.name !== undefined) v.name = patch.name
  if (patch.filters !== undefined) v.filters = normalizeCmFilters(patch.filters)
  persistViews()
}
export function deleteCmView(id: string): void {
  const i = creditMemoViews.findIndex((x) => x.id === id)
  if (i !== -1) { creditMemoViews.splice(i, 1); persistViews() }
}
