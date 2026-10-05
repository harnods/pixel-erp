/**
 * Dashboard › Business performance — widget grid + figures.
 * prod-parity: jurnal-frontend-app/src/pages/dashboard/business-overview
 *   (index.vue, dummyWidget.json default layout, components/widgets/{bar,card,doughnut,table,line}.vue,
 *   filter-period.ts period lists, i18n.json wording).
 *
 * Every figure is read from the mock data other screens/reports use, so the
 * dashboard ties out:
 *   • Cash flow      → chartOfAccounts ledger, Cash & bank accounts (same as the Cash flow report)
 *   • Profit & loss  → financialStatements.plReport (same as the Profit & loss report)
 *   • Sales receivable → salesInvoices (Sales invoices list)
 *   • Bills to pay   → purchaseInvoices (Purchase invoices list)
 *   • Operational expenses → ledger, Operational Expense accounts (= P&L Operational Expense)
 *   • Account watchlist → ledger movements per account (= General ledger / COA)
 *   • Top selling product → salesReports.salesByProductReport (Sales by product report)
 *   • Account widgets → cashAccounts + cashBankReport (Cash management / Cash & bank report)
 * Only the layout (order, which widgets, which accounts) is persisted.
 */
import {
  coaRecords, ledger, netMovement, naturalSign, childrenOf, getAccount, CASH_AND_BANK,
} from './chartOfAccounts'
import { plReport } from './financialStatements'
import { cfCashBalance } from './cashFlowTrialBalance'
import { salesInvoices } from './salesInvoices'
import { purchaseInvoices } from './purchaseInvoices'
import { defaultSalesReportFilters, salesByProductReport, salesPeriodRange, isoToDmy } from './salesReports'
import { cbrAccounts, cbrAllRows } from './cashBankReport'
import { SIM_TODAY_ISO } from './simClock'
import { loadSnapshot, saveSnapshot } from './persist'

// ── Widget layout (prod dummyWidget.json order) ──────────────────────────────
export type BpContent =
  | 'cashflow' | 'receivable' | 'payable' | 'profitloss' | 'expense'
  | 'account_watchlist' | 'product_profitability' | 'account' | 'jurnalpay'
export type BpChart = 'bar' | 'card' | 'doughnut' | 'table' | 'line'

export interface BpWidget {
  id: number
  content: BpContent
  chart: BpChart
  /** 12 = full row, 6 = half row (prod gridstack w). */
  w: 6 | 12
  /** Account widgets: cashAccounts id. */
  accountId?: string
  /** Account watchlist: COA ids (max 5). */
  accountIds?: string[]
  /** Period filter value (bar: range-periods value; card/doughnut/table: period value). */
  period?: string
  /** Bar widgets: 'grafik' (chart) | 'table'. */
  view?: 'grafik' | 'table'
}

export const BP_MAX_WIDGETS = 15
export const BP_MAX_WATCHLIST = 5

export const BP_TITLES: Record<Exclude<BpContent, 'account' | 'jurnalpay'>, string> = {
  cashflow: 'Cash flow',
  receivable: 'Sales receivable',
  payable: 'Bills to Pay',
  profitloss: 'Profit & loss',
  expense: 'Operational expenses',
  account_watchlist: 'Account watchlist',
  product_profitability: 'Top selling product',
}

const DEFAULT_WATCHLIST = ['1-10001', '1-10002', '1-10004', '1-10100', '4-40000']

export function defaultBpLayout(): BpWidget[] {
  return [
    { id: 1, content: 'cashflow', chart: 'bar', w: 12, period: 'monthly', view: 'grafik' },
    { id: 2, content: 'receivable', chart: 'card', w: 6, period: 'this_month' },
    { id: 3, content: 'payable', chart: 'card', w: 6, period: 'this_month' },
    { id: 4, content: 'profitloss', chart: 'bar', w: 12, period: 'monthly', view: 'grafik' },
    { id: 5, content: 'expense', chart: 'doughnut', w: 12, period: 'this_month' },
    { id: 6, content: 'account_watchlist', chart: 'table', w: 6, accountIds: [...DEFAULT_WATCHLIST] },
    { id: 7, content: 'product_profitability', chart: 'table', w: 6, period: 'this_month' },
    { id: 8, content: 'account', chart: 'line', w: 6, accountId: 'CA003', period: 'monthly' },
    { id: 9, content: 'jurnalpay', chart: 'line', w: 6, period: 'weekly' },
    { id: 10, content: 'account', chart: 'line', w: 6, accountId: 'CA001', period: 'monthly' },
  ]
}

const LAYOUT_KEY = 'business-performance-layout-v1'
export function loadBpLayout(): BpWidget[] {
  const saved = loadSnapshot<BpWidget>(LAYOUT_KEY)
  return saved?.length ? saved : defaultBpLayout()
}
export function saveBpLayout(widgets: BpWidget[]): void { saveSnapshot(LAYOUT_KEY, widgets) }

// ── Period lists (prod filter-period.ts) ─────────────────────────────────────
/** Bar widgets (cash flow, profit & loss): bucket granularity. */
export const BP_RANGE_PERIODS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'monthly_this_year', label: 'Monthly: This year' },
  { value: 'monthly_last_year', label: 'Monthly: Last year' },
  { value: 'quarterly_this_year', label: 'Quarterly: This year' },
  { value: 'quarterly_last_year', label: 'Quarterly: Last year' },
]
/** Line widgets get the five plain granularities only (prod drops the year-scoped ones). */
export const BP_LINE_PERIODS = BP_RANGE_PERIODS.slice(0, 5)

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const at = (s: string) => new Date(`${s}T00:00:00`)
const addDays = (s: string, n: number) => { const d = at(s); d.setDate(d.getDate() + n); return iso(d) }
const fmtDay = (s: string) => { const d = at(s); return `${String(d.getDate()).padStart(2, '0')} ${MON[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` }

/** Card / doughnut / table widgets: one period (prod PERIODS, labels carry the dates). */
export function bpPeriods(): { value: string; label: string }[] {
  const t = at(SIM_TODAY_ISO)
  const wk = salesPeriodRange('this_week')!
  const q = salesPeriodRange('this_quarter')!
  return [
    { value: 'today', label: `Today (${fmtDay(SIM_TODAY_ISO)})` },
    { value: 'this_week', label: `This Week (${fmtDay(wk[0])} - ${fmtDay(wk[1])})` },
    { value: 'this_month', label: `This Month (${MON[t.getMonth()]} ${t.getFullYear()})` },
    { value: 'this_quarter', label: `This Quarter (${MON[at(q[0]).getMonth()]} ${t.getFullYear()} - ${MON[at(q[1]).getMonth()]} ${t.getFullYear()})` },
    { value: 'this_year', label: `This Year (${t.getFullYear()})` },
  ]
}
export function bpPeriodRange(value: string): [string, string] {
  return salesPeriodRange(value) ?? salesPeriodRange('this_month')!
}

export interface Bucket { label: string; start: string; end: string }

/** Chart buckets for a range-period value, oldest first, ending at the simulated today. */
export function bpBuckets(value: string): Bucket[] {
  const t = at(SIM_TODAY_ISO)
  const y = t.getFullYear()
  const month = (yy: number, m: number): Bucket => ({
    label: `${MON[(m + 12) % 12]} ${String(yy + Math.floor(m / 12)).slice(2)}`,
    start: iso(new Date(yy, m, 1)), end: iso(new Date(yy, m + 1, 0)),
  })
  const quarter = (yy: number, qi: number): Bucket => ({
    label: `Q${qi + 1} ${yy}`, start: iso(new Date(yy, qi * 3, 1)), end: iso(new Date(yy, qi * 3 + 3, 0)),
  })
  switch (value) {
    case 'daily':
      return Array.from({ length: 7 }, (_, i) => { const d = addDays(SIM_TODAY_ISO, i - 6); return { label: fmtDay(d), start: d, end: d } })
    case 'weekly': {
      const ws = salesPeriodRange('this_week')![0]
      return Array.from({ length: 8 }, (_, i) => { const s = addDays(ws, (i - 7) * 7); return { label: fmtDay(s), start: s, end: addDays(s, 6) } })
    }
    case 'quarterly': {
      const cq = Math.floor(t.getMonth() / 3)
      return Array.from({ length: 4 }, (_, i) => { const k = cq - 3 + i; return quarter(y + Math.floor(k / 4), ((k % 4) + 4) % 4) })
    }
    case 'yearly':
      return [y - 1, y].map(yy => ({ label: String(yy), start: `${yy}-01-01`, end: `${yy}-12-31` }))
    case 'monthly_this_year': return Array.from({ length: 12 }, (_, m) => month(y, m))
    case 'monthly_last_year': return Array.from({ length: 12 }, (_, m) => month(y - 1, m))
    case 'quarterly_this_year': return [0, 1, 2, 3].map(qi => quarter(y, qi))
    case 'quarterly_last_year': return [0, 1, 2, 3].map(qi => quarter(y - 1, qi))
    case 'monthly':
    default:
      return Array.from({ length: 12 }, (_, i) => {
        const k = t.getMonth() - 11 + i
        const yy = y + Math.floor(k / 12)
        return month(yy, ((k % 12) + 12) % 12)
      })
  }
}

const eq = (a: number, b: number) => Math.abs(a - b) < 0.5
const isCash = (code: string) => getAccount(code)?.categoryId === CASH_AND_BANK

// ── Cash flow (bar) ───────────────────────────────────────────────────────────
export interface BarRow { label: string; a: number; b: number; net: number }

/** Total cash in / cash out / net per bucket across every Cash & bank account.
 *  The opening-balance journal is not a cash movement and is left out. */
export function bpCashFlow(value: string): BarRow[] {
  const rows = bpBuckets(value).map((bk) => {
    let cin = 0, cout = 0, ob = 0
    for (const tx of ledger.value) {
      if (tx.date < bk.start || tx.date > bk.end) continue
      for (const l of tx.lines) {
        if (!isCash(l.code)) continue
        if (tx.type === 'Opening Balance') { ob += l.debit - l.credit; continue }
        cin += l.debit; cout += l.credit
      }
    }
    const net = cin - cout
    // Tie-out: net = change in the Cash & bank balance (Cash flow report closing − opening), less opening balance.
    const delta = cfCashBalance(bk.end) - cfCashBalance(addDays(bk.start, -1)) - ob
    if (!eq(net, delta)) throw new Error(`Business performance cash flow ${bk.label}: ${net} ≠ ${delta}`)
    return { label: bk.label, a: cin, b: -cout, net }
  })
  return rows
}

// ── Profit & loss (bar) ───────────────────────────────────────────────────────
/** Revenue (incl. other income) / expense (cost of sales + opex + other expense) / net profit per bucket. */
export function bpProfitLoss(value: string): BarRow[] {
  const buckets = bpBuckets(value)
  const r = plReport(buckets.map(b => ({ start: b.start, end: b.end, label: b.label })))
  return buckets.map((bk, i) => {
    const income = r.revenue.totals[i]! + r.otherIncome.totals[i]!
    const expense = r.costOfSales.totals[i]! + r.operationalExpense.totals[i]! + r.otherExpense.totals[i]!
    const net = r.netProfit[i]!
    if (!eq(income - expense, net)) throw new Error(`Business performance P&L ${bk.label}: ${income} − ${expense} ≠ ${net}`)
    return { label: bk.label, a: income, b: -expense, net }
  })
}

// ── Sales receivable / Bills to pay (card) ───────────────────────────────────
export interface SummaryBox { key: 'unpaid' | 'overdue' | 'paid'; count: number; amount: number }

export function bpReceivable(period: string): SummaryBox[] {
  const [s, e] = bpPeriodRange(period)
  const rows = salesInvoices.filter(i => i.date >= s && i.date <= e)
  const unpaid = rows.filter(i => i.balance > 0)
  const overdue = rows.filter(i => i.status === 'overdue')
  const paid = rows.filter(i => i.total > i.balance)
  return [
    { key: 'unpaid', count: unpaid.length, amount: unpaid.reduce((x, i) => x + i.balance, 0) },
    { key: 'overdue', count: overdue.length, amount: overdue.reduce((x, i) => x + i.balance, 0) },
    { key: 'paid', count: paid.length, amount: paid.reduce((x, i) => x + (i.total - i.balance), 0) },
  ]
}

export function bpPayable(period: string): SummaryBox[] {
  const [s, e] = bpPeriodRange(period)
  const rows = purchaseInvoices.filter(i => i.date >= s && i.date <= e)
  const unpaid = rows.filter(i => i.status !== 'paid')
  const overdue = rows.filter(i => i.status === 'overdue')
  const paid = rows.filter(i => i.status === 'paid')
  return [
    { key: 'unpaid', count: unpaid.length, amount: unpaid.reduce((x, i) => x + i.amount, 0) },
    { key: 'overdue', count: overdue.length, amount: overdue.reduce((x, i) => x + i.amount, 0) },
    { key: 'paid', count: paid.length, amount: paid.reduce((x, i) => x + i.amount, 0) },
  ]
}

// ── Operational expenses (doughnut) ──────────────────────────────────────────
export interface ExpenseSlice { id: string; name: string; value: number; percentage: number }
export interface ExpenseResult { slices: ExpenseSlice[]; total: number; max?: ExpenseSlice }

const OPEX = 16
export function bpExpenses(period: string): ExpenseResult {
  const [s, e] = bpPeriodRange(period)
  const from = addDays(s, -1)
  const leaves = coaRecords.filter(a => a.categoryId === OPEX && !childrenOf(a.id).length)
  const all = leaves
    .map(a => ({ id: a.id, name: a.name, value: naturalSign(a.categoryId) * netMovement(a.id, from, e) }))
    .filter(x => x.value !== 0)
    .sort((a, b) => b.value - a.value)
  const total = all.reduce((x, r) => x + r.value, 0)
  // Tie-out: same total as the P&L Operational Expense section for the period.
  const pl = plReport([{ start: s, end: e, label: 'p' }]).operationalExpense.totals[0]!
  if (!eq(total, pl)) throw new Error(`Business performance opex ${total} ≠ P&L ${pl}`)
  // Top 5 + Others, like prod's doughnut legend.
  const top = all.slice(0, 5)
  const rest = all.slice(5).reduce((x, r) => x + r.value, 0)
  const slices: ExpenseSlice[] = [...top, ...(rest ? [{ id: 'others', name: 'Others', value: rest }] : [])]
    .map(x => ({ ...x, percentage: total ? Math.round((x.value / total) * 100) : 0 }))
  return { slices, total, max: slices[0] }
}

// ── Account watchlist (table) ────────────────────────────────────────────────
export interface WatchRow { id: string; label: string; month: number; year: number }
export function bpWatchlist(ids: string[]): WatchRow[] {
  const [ms, me] = salesPeriodRange('this_month')!
  const [ys] = salesPeriodRange('this_year')!
  return ids.map(getAccount).filter(a => !!a).map(a => ({
    id: a!.id,
    label: `(${a!.code}) ${a!.name}`,
    month: naturalSign(a!.categoryId) * netMovement(a!.id, addDays(ms, -1), me),
    year: naturalSign(a!.categoryId) * netMovement(a!.id, addDays(ys, -1), me),
  }))
}
/** Accounts a watchlist can pick from: every non-header, non-archived COA account. */
export function bpWatchlistOptions(): { value: string; label: string }[] {
  return coaRecords
    .filter(a => !a.archived && !childrenOf(a.id).length)
    .sort((a, b) => a.code.localeCompare(b.code))
    .map(a => ({ value: a.id, label: `(${a.code}) ${a.name}` }))
}

// ── Top selling product (table) ──────────────────────────────────────────────
export interface ProductRow { sku: string; name: string; unit: string; qty: number; total: number }
export function bpTopProducts(period: string): ProductRow[] {
  const [s, e] = bpPeriodRange(period)
  const f = { ...defaultSalesReportFilters('product'), start: isoToDmy(s), end: isoToDmy(e), period, sortBy: 'total_value_sold', sortLogic: 'desc' as const }
  return salesByProductReport(f).products.slice(0, 5)
    .map(g => ({ sku: g.sku, name: g.productName, unit: g.unit, qty: g.salesQty, total: g.salesValue }))
}

// ── Account widgets (line) ───────────────────────────────────────────────────
export interface AccountLine {
  label: string
  bookBalance: number
  statementBalance: number | null
  unreconciled: number
  currency: string
  points: { label: string; value: number }[]
}
export function bpAccountOptions(): { value: string; label: string }[] {
  return cbrAccounts().map(a => ({ value: a.id, label: `(${a.code}) ${a.name}` }))
}
export function bpAccountLine(accountId: string, value: string): AccountLine | null {
  const a = cbrAccounts().find(x => x.id === accountId)
  if (!a) return null
  const rows = cbrAllRows(a)
  const first = rows[0]
  const opening = first ? first.balance - first.receive + first.spent : a.bookBalance
  const balanceAt = (d: string) => { let b = opening; for (const r of rows) { if (r.date > d) break; b = r.balance } return b }
  return {
    label: a.name,
    bookBalance: a.bookBalance,
    statementBalance: a.statementBalance,
    unreconciled: a.unreconciledCount,
    currency: a.currency,
    points: bpBuckets(value).map(bk => ({ label: bk.label, value: balanceAt(bk.end < SIM_TODAY_ISO ? bk.end : SIM_TODAY_ISO) })),
  }
}
