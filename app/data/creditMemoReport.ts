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
 * All figures are hard-set to be internally consistent (a real, auditable
 * ledger). Saved views (Default + user views) persist to the mini-DB.
 */
import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'

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

// ── Seed — a coherent, auditable Aug 2026 ledger over REAL sales customers
// (customers.ts) and REAL sales-invoice numbers (salesInvoices.ts uses #40001+).
// Covers every case: Case A (issued before period) / Case B (issued in period),
// Active / Partial / Used-up, and all four mutation types.
const SEED: CmCustomer[] = [
  {
    id: 'C005', name: 'Djournal Coffee',
    cms: [
      {
        id: 'cm-2451', customerId: 'C005', cmNumber: 'Credit Memo #10090',
        issueDate: '2026-08-05', originalAmount: 30_000_000, beginningBalance: 0, hasPriorData: false,
        mutations: [
          { id: 'cm-2451-m1', date: '2026-08-05', type: 'Issued', transactionNo: 'Credit Memo #10090', transactionHref: '#', description: 'Return goods', amount: 30_000_000 },
          { id: 'cm-2451-m2', date: '2026-08-20', type: 'Applied', transactionNo: 'Sales Invoice #40025', transactionHref: '#', description: 'Applied to invoice', amount: -15_000_000 },
        ],
      },
      {
        id: 'cm-2467', customerId: 'C005', cmNumber: 'Credit Memo #10091',
        issueDate: '2026-08-24', originalAmount: 5_000_000, beginningBalance: 0, hasPriorData: false,
        mutations: [
          { id: 'cm-2467-m1', date: '2026-08-24', type: 'Issued', transactionNo: 'Credit Memo #10091', transactionHref: '#', description: 'Goodwill credit', amount: 5_000_000 },
        ],
      },
    ],
  },
  {
    id: 'C001', name: 'Anomali Coffee',
    cms: [
      {
        id: 'cm-2390', customerId: 'C001', cmNumber: 'Credit Memo #10092',
        issueDate: '2026-07-16', originalAmount: 22_000_000, beginningBalance: 22_000_000, hasPriorData: true,
        mutations: [
          { id: 'cm-2390-m1', date: '2026-08-12', type: 'Applied', transactionNo: 'Sales Invoice #40031', transactionHref: '#', description: 'Applied to invoice', amount: -2_550_000 },
        ],
      },
      {
        id: 'cm-2395', customerId: 'C001', cmNumber: 'Credit Memo #10093',
        issueDate: '2026-08-15', originalAmount: 10_000_000, beginningBalance: 0, hasPriorData: false,
        mutations: [
          { id: 'cm-2395-m1', date: '2026-08-15', type: 'Issued', transactionNo: 'Credit Memo #10093', transactionHref: '#', description: 'Overpayment', amount: 10_000_000 },
          { id: 'cm-2395-m2', date: '2026-08-18', type: 'Refund', transactionNo: 'Cash Refund #CR-2201', transactionHref: '#', description: 'Cash refund to customer', amount: -10_000_000 },
        ],
      },
    ],
  },
  {
    id: 'C006', name: 'Kopi Kenangan Pusat',
    cms: [
      {
        id: 'cm-2405', customerId: 'C006', cmNumber: 'Credit Memo #10094',
        issueDate: '2026-08-03', originalAmount: 12_000_000, beginningBalance: 0, hasPriorData: false,
        mutations: [
          { id: 'cm-2405-m1', date: '2026-08-03', type: 'Issued', transactionNo: 'Credit Memo #10094', transactionHref: '#', description: 'Return goods', amount: 12_000_000 },
          { id: 'cm-2405-m2', date: '2026-08-10', type: 'Applied', transactionNo: 'Sales Invoice #40046', transactionHref: '#', description: 'Applied to invoice', amount: -8_000_000 },
          { id: 'cm-2405-m3', date: '2026-08-14', type: 'Reversal', transactionNo: 'Sales Invoice #40046', transactionHref: '#', description: 'Reversed application', amount: 8_000_000 },
          { id: 'cm-2405-m4', date: '2026-08-20', type: 'Applied', transactionNo: 'Sales Invoice #40052', transactionHref: '#', description: 'Applied to invoice', amount: -4_000_000 },
        ],
      },
    ],
  },
  {
    id: 'C002', name: 'Tanamera Coffee Roastery',
    cms: [
      {
        id: 'cm-2377', customerId: 'C002', cmNumber: 'Credit Memo #10095',
        issueDate: '2026-07-20', originalAmount: 8_000_000, beginningBalance: 8_000_000, hasPriorData: true,
        mutations: [
          { id: 'cm-2377-m1', date: '2026-08-10', type: 'Applied', transactionNo: 'Sales Invoice #40018', transactionHref: '#', description: 'Applied to invoice', amount: -2_500_000 },
        ],
      },
    ],
  },
  {
    id: 'C013', name: 'Excelso Grand Indonesia',
    cms: [
      {
        id: 'cm-2340', customerId: 'C013', cmNumber: 'Credit Memo #10096',
        issueDate: '2026-07-29', originalAmount: 10_000_000, beginningBalance: 10_000_000, hasPriorData: true,
        mutations: [
          { id: 'cm-2340-m1', date: '2026-08-07', type: 'Applied', transactionNo: 'Sales Invoice #40012', transactionHref: '#', description: 'Applied to invoice', amount: -2_500_000 },
          { id: 'cm-2340-m2', date: '2026-08-12', type: 'Applied', transactionNo: 'Sales Invoice #40033', transactionHref: '#', description: 'Applied to invoice', amount: -2_500_000 },
          { id: 'cm-2340-m3', date: '2026-08-18', type: 'Applied', transactionNo: 'Sales Invoice #40041', transactionHref: '#', description: 'Applied to invoice', amount: -2_500_000 },
          { id: 'cm-2340-m4', date: '2026-08-22', type: 'Applied', transactionNo: 'Sales Invoice #40055', transactionHref: '#', description: 'Applied to invoice', amount: -2_500_000 },
        ],
      },
    ],
  },
]

export const creditMemoCustomers = reactive<CmCustomer[]>(
  loadSnapshot<CmCustomer>('credit-memo-report-v4') ?? SEED.map((c) => ({ ...c })),
)

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
  for (const c of creditMemoCustomers) {
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
export function cmCustomerNames(): string[] { return creditMemoCustomers.map((c) => c.name).sort((a, b) => a.localeCompare(b)) }

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
