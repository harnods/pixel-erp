/**
 * Financial statements — Balance sheet + Profit & loss (Reports › Financials).
 *
 * Prod source: jurnal-frontend-app/src/pages/reports/balance_sheet/ and
 * profit_loss/ (+ quickbook ReportingService::GetProfitLossCustomLayout for the
 * default P&L layout). Every figure is read from the canonical chart-of-accounts
 * ledger (chartOfAccounts.ts `ledger`), the same journal lines the Chart of
 * accounts detail, Close books and the other ledger reports use, so the
 * statements tie to every screen the user can click through.
 *
 * Sign convention: amounts are natural-sign (assets/expenses debit-positive,
 * liabilities/equity/income credit-positive), so a negative number is a
 * contra balance and renders in parentheses.
 *
 * Exports are prefixed bs* / pl* (cash flow + trial balance are built from the
 * same ledger elsewhere).
 */
import {
  coaRecords, ledger, naturalSign, categoryOf, type CoaRecord,
} from './chartOfAccounts'
import { SIM_TODAY_ISO } from './simClock'
// Side effect: published closing books post their closing entries into the
// ledger, so Retained Earnings and Current Period Earnings match Close books.
import './closeBooks'

// ── Date helpers (ISO yyyy-mm-dd, UTC-safe) ──────────────────────────────────

function isoOf(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m, d))
  return dt.toISOString().slice(0, 10)
}
function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return [y, m - 1, d]
}
function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = parts(iso)
  return isoOf(y, m, d + n)
}
function monthEnd(y: number, m: number): string { return isoOf(y, m + 1, 0) }
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000)
}
/** Financial year = calendar year (company default). */
function fyStart(iso: string): string { return `${iso.slice(0, 4)}-01-01` }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "22 Aug 2026" */
export function bsPlDayLabel(iso: string): string {
  const [y, m, d] = parts(iso)
  return `${d} ${MONTHS[m]} ${y}`
}
/** "Aug 2026" */
export function bsPlMonthLabel(iso: string): string {
  const [y, m] = parts(iso)
  return `${MONTHS[m]} ${y}`
}

// ── Ledger reads ─────────────────────────────────────────────────────────────

/** Debit-positive movement per account id over [from, to] (from null = beginning). */
function movementMap(from: string | null, to: string, skipClosing: boolean): Map<string, number> {
  const out = new Map<string, number>()
  for (const tx of ledger.value) {
    if (tx.date > to || (from && tx.date < from)) continue
    if (skipClosing && tx.closingId) continue
    for (const l of tx.lines) out.set(l.code, (out.get(l.code) ?? 0) + l.debit - l.credit)
  }
  return out
}

const isPl = (a: CoaRecord) => {
  const t = categoryOf(a.categoryId).type
  return t === 'income' || t === 'expense'
}

// ── Account tree (header → children), shared by both statements ─────────────

export interface BsPlAccountRow {
  id: string
  code: string
  name: string
  /** 1 = top level; children are level + 1 (prod `level`). */
  level: number
  /** Rolled-up natural-sign amount per column (own + every descendant). */
  amounts: number[]
  children: BsPlAccountRow[]
}

function buildRows(categoryIds: number[], cols: Map<string, number>[]): BsPlAccountRow[] {
  const inScope = coaRecords
    .filter(a => categoryIds.includes(a.categoryId))
    .filter(a => !a.archived || cols.some(c => (c.get(a.id) ?? 0) !== 0))
  const ids = new Set(inScope.map(a => a.id))
  const byParent = new Map<string, CoaRecord[]>()
  for (const a of inScope) {
    const p = a.parentId && ids.has(a.parentId) ? a.parentId : ''
    const arr = byParent.get(p) ?? []
    arr.push(a)
    byParent.set(p, arr)
  }
  const build = (a: CoaRecord, level: number): BsPlAccountRow => {
    const kids = (byParent.get(a.id) ?? []).sort((x, y) => x.code.localeCompare(y.code)).map(k => build(k, level + 1))
    const own = cols.map(c => naturalSign(a.categoryId) * (c.get(a.id) ?? 0))
    const amounts = own.map((v, i) => kids.reduce((s, k) => s + k.amounts[i]!, v))
    return { id: a.id, code: a.code, name: a.name, level, amounts, children: kids }
  }
  return (byParent.get('') ?? []).sort((x, y) => x.code.localeCompare(y.code)).map(a => build(a, 1))
}

function sumRows(rows: BsPlAccountRow[], n: number): number[] {
  return Array.from({ length: n }, (_, i) => rows.reduce((s, r) => s + r.amounts[i]!, 0))
}

/** Deepest level in a set of rows (drives the "Account depth" options). */
export function bsPlMaxDepth(rows: BsPlAccountRow[]): number {
  let max = 1
  const walk = (r: BsPlAccountRow) => { max = Math.max(max, r.level); r.children.forEach(walk) }
  rows.forEach(walk)
  return max
}

const eq = (a: number, b: number) => Math.abs(a - b) < 0.5

function assertSectionTotal(label: string, rows: BsPlAccountRow[], totals: number[]) {
  const s = sumRows(rows, totals.length)
  totals.forEach((t, i) => { if (!eq(t, s[i]!)) throw new Error(`${label}: total ${t} ≠ sum of rows ${s[i]}`) })
}

// ═════════════════════════════════════════════════════════════════════════════
// Profit & loss
// ═════════════════════════════════════════════════════════════════════════════

export interface PlPeriod { start: string; end: string; label: string }

export interface PlSection {
  key: string
  /** Account-type label (prod default layout names). */
  label: string
  rows: BsPlAccountRow[]
  totals: number[]
}

export interface PlReport {
  periods: PlPeriod[]
  revenue: PlSection
  costOfSales: PlSection
  grossProfit: number[]
  operationalExpense: PlSection
  operatingProfit: number[]
  otherIncome: PlSection
  otherExpense: PlSection
  /** Other income − other expense. */
  otherIncomeExpense: number[]
  /** Profit (Loss) — net profit for the period. */
  netProfit: number[]
}

/** Prod ReportingService default layout categories. */
const PL_REVENUE = [13]
const PL_COST_OF_SALES = [15]
const PL_OPEX = [16]
const PL_OTHER_INCOME = [14]
const PL_OTHER_EXPENSE = [17]

/** P&L for each period. Closing-book entries are excluded (they only move P&L into retained earnings). */
export function plReport(periods: PlPeriod[]): PlReport {
  const cols = periods.map(p => movementMap(p.start, p.end, true))
  const section = (key: string, label: string, cats: number[]): PlSection => {
    const rows = buildRows(cats, cols)
    return { key, label, rows, totals: sumRows(rows, periods.length) }
  }
  const revenue = section('revenue', 'Revenue', PL_REVENUE)
  const costOfSales = section('cost-of-sales', 'Cost of Sales', PL_COST_OF_SALES)
  const operationalExpense = section('operational-expense', 'Operational Expense', PL_OPEX)
  const otherIncome = section('other-income', 'Other Income', PL_OTHER_INCOME)
  const otherExpense = section('other-expense', 'Other Expense', PL_OTHER_EXPENSE)
  const n = periods.length
  const at = (s: PlSection, i: number) => s.totals[i]!
  const grossProfit = Array.from({ length: n }, (_, i) => at(revenue, i) - at(costOfSales, i))
  const operatingProfit = grossProfit.map((g, i) => g - at(operationalExpense, i))
  const otherIncomeExpense = Array.from({ length: n }, (_, i) => at(otherIncome, i) - at(otherExpense, i))
  const netProfit = operatingProfit.map((o, i) => o + otherIncomeExpense[i]!)

  // Dev-time arithmetic checks.
  for (const s of [revenue, costOfSales, operationalExpense, otherIncome, otherExpense]) assertSectionTotal(`P&L ${s.label}`, s.rows, s.totals)
  periods.forEach((p, i) => {
    const direct = plNetProfit(p.start, p.end)
    if (!eq(direct, netProfit[i]!)) throw new Error(`P&L ${p.label}: net profit ${netProfit[i]} ≠ ledger ${direct}`)
  })
  return { periods, revenue, costOfSales, grossProfit, operationalExpense, operatingProfit, otherIncome, otherExpense, otherIncomeExpense, netProfit }
}

/** Net profit straight off the ledger (credit-positive), closing entries excluded. */
export function plNetProfit(start: string | null, end: string): number {
  const m = movementMap(start, end, true)
  let s = 0
  for (const a of coaRecords) if (isPl(a)) s -= m.get(a.id) ?? 0
  return s
}

// ── P&L periods (prod constants.periods.PNL_PERIODS_RANGE) ──────────────────

export type PlPeriodKey = 'today' | 'this_week' | 'this_month' | 'this_quarter' | 'this_year' | 'last_month' | 'last_year' | 'this_financial_year' | 'custom'

export const PL_PERIOD_OPTIONS: { value: PlPeriodKey; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'Weekly' },
  { value: 'this_month', label: 'Monthly' },
  { value: 'this_quarter', label: 'Quarterly' },
  { value: 'this_year', label: 'Yearly' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_year', label: 'Last Year' },
  { value: 'this_financial_year', label: 'Each month this year' },
  { value: 'custom', label: 'Custom' },
]

/** Range a P&L period resolves to, anchored on the prototype's "today". */
export function plPeriodRange(key: PlPeriodKey, today = SIM_TODAY_ISO): { start: string; end: string } {
  const [y, m, d] = parts(today)
  switch (key) {
    case 'today': return { start: today, end: today }
    case 'this_week': {
      const dow = new Date(Date.UTC(y, m, d)).getUTCDay()
      return { start: isoOf(y, m, d - dow), end: isoOf(y, m, d - dow + 6) }
    }
    case 'this_month': return { start: isoOf(y, m, 1), end: monthEnd(y, m) }
    case 'this_quarter': { const q = Math.floor(m / 3) * 3; return { start: isoOf(y, q, 1), end: monthEnd(y, q + 2) } }
    case 'this_year':
    case 'this_financial_year': return { start: `${y}-01-01`, end: `${y}-12-31` }
    case 'last_month': return { start: isoOf(y, m - 1, 1), end: monthEnd(y, m - 1) }
    case 'last_year': return { start: `${y - 1}-01-01`, end: `${y - 1}-12-31` }
    default: return { start: isoOf(y, m - 1, 1), end: monthEnd(y, m - 1) }
  }
}

function isWholeMonths(start: string, end: string): number {
  const [sy, sm, sd] = parts(start)
  const [ey, em] = parts(end)
  if (sd !== 1 || end !== monthEnd(ey, em)) return 0
  return (ey - sy) * 12 + (em - sm) + 1
}

function plLabel(start: string, end: string): string {
  const months = isWholeMonths(start, end)
  if (months === 1) return bsPlMonthLabel(start)
  if (start === end) return bsPlDayLabel(start)
  return `${bsPlDayLabel(start)} - ${bsPlDayLabel(end)}`
}

/**
 * Columns for a P&L run. `compareCount` previous periods of the same length
 * (whole-month ranges step by months, anything else by days). "Each month this
 * year" splits the financial year into months up to the current month.
 */
export function plBuildPeriods(start: string, end: string, opts: { compareCount?: number; order?: 'asc' | 'desc'; eachMonth?: boolean } = {}): PlPeriod[] {
  let list: PlPeriod[] = []
  if (opts.eachMonth) {
    const [y] = parts(start)
    const [, tm] = parts(SIM_TODAY_ISO)
    const last = Number(start.slice(0, 4)) === Number(SIM_TODAY_ISO.slice(0, 4)) ? tm : 11
    for (let m = 0; m <= last; m++) list.push({ start: isoOf(y, m, 1), end: monthEnd(y, m), label: bsPlMonthLabel(isoOf(y, m, 1)) })
    list.reverse()
  } else {
    const n = Math.max(0, opts.compareCount ?? 0)
    const months = isWholeMonths(start, end)
    const span = daysBetween(start, end) + 1
    for (let k = 0; k <= n; k++) {
      let s: string, e: string
      if (months) {
        const [sy, sm] = parts(start)
        s = isoOf(sy, sm - k * months, 1)
        const [ny, nm] = parts(s)
        e = monthEnd(ny, nm + months - 1)
      } else {
        s = addDaysIso(start, -k * span)
        e = addDaysIso(end, -k * span)
      }
      list.push({ start: s, end: e, label: plLabel(s, e) })
    }
  }
  // Newest first = prod "descending" default.
  return opts.order === 'asc' ? list.reverse() : list
}

// ═════════════════════════════════════════════════════════════════════════════
// Balance sheet
// ═════════════════════════════════════════════════════════════════════════════

export interface BsSection {
  key: string
  label: string
  totalLabel: string
  rows: BsPlAccountRow[]
  totals: number[]
}

/** Equity lines the report adds on top of the equity accounts (prod account_id -1 / -2 / -3). */
export interface BsSyntheticRow { key: string; name: string; amounts: number[] }

export interface BsReport {
  dates: string[]
  assets: BsSection[]
  totalAssets: number[]
  liabilities: BsSection[]
  totalLiabilities: number[]
  equity: BsSection
  /** Earnings up to Last Period + Current Period Earnings. */
  equityEarnings: BsSyntheticRow[]
  totalEquity: number[]
  totalLiabilitiesEquity: number[]
  /** Current Period Earnings — net profit from the financial year start to each date. */
  currentPeriodEarnings: number[]
}

/** Prod balance-sheet groups (account_category → report section). */
const BS_SECTIONS = {
  current_assets: { label: 'Current assets', totalLabel: 'Total current assets', cats: [3, 1, 4, 2] },
  fixed_assets: { label: 'Fixed assets', totalLabel: 'Total fixed assets', cats: [5] },
  depreciation_and_amortization: { label: 'Depreciation & amortization', totalLabel: 'Total depreciation & amortization', cats: [7] },
  other_assets: { label: 'Other assets', totalLabel: 'Total other assets', cats: [6] },
  current_liabilities: { label: 'Current liability', totalLabel: 'Total current liability', cats: [8, 9, 10] },
  long_term_liabilities: { label: 'Long term liability', totalLabel: 'Total long term liability', cats: [11] },
  equity: { label: 'Equity', totalLabel: 'Total equity', cats: [12] },
} as const

/** Balance sheet as of each date (cumulative from the beginning of the books). */
export function bsReport(dates: string[]): BsReport {
  const cols = dates.map(d => movementMap(null, d, false))
  const n = dates.length
  const section = (key: keyof typeof BS_SECTIONS): BsSection => {
    const def = BS_SECTIONS[key]
    const rows = buildRows([...def.cats], cols)
    return { key, label: def.label, totalLabel: def.totalLabel, rows, totals: sumRows(rows, n) }
  }
  const assets = (['current_assets', 'fixed_assets', 'depreciation_and_amortization', 'other_assets'] as const).map(section)
  const liabilities = (['current_liabilities', 'long_term_liabilities'] as const).map(section)
  const equity = section('equity')
  const sumSections = (ss: BsSection[]) => Array.from({ length: n }, (_, i) => ss.reduce((s, x) => s + x.totals[i]!, 0))

  // Unclosed P&L, split at the current period start (financial year start, or
  // the day after a later closing book): Current Period Earnings is the P&L net
  // profit for that span (closing entries excluded, same as the P&L report);
  // whatever else still sits in P&L accounts is "Earnings up to Last Period".
  const currentPeriodEarnings = dates.map(d => { const s = bsCurrentPeriodStart(d); return s > d ? 0 : plNetProfit(s, d) })
  const totalUnclosedPl = cols.map(c => coaRecords.reduce((s, a) => (isPl(a) ? s - (c.get(a.id) ?? 0) : s), 0))
  const upToLast = totalUnclosedPl.map((t, i) => t - currentPeriodEarnings[i]!)
  const equityEarnings: BsSyntheticRow[] = [
    { key: 'earnings-up-to-last-period', name: 'Earnings up to Last Period', amounts: upToLast },
    { key: 'current-period-earnings', name: 'Current Period Earnings', amounts: currentPeriodEarnings },
  ]

  const totalAssets = sumSections(assets)
  const totalLiabilities = sumSections(liabilities)
  const totalEquity = equity.totals.map((t, i) => t + upToLast[i]! + currentPeriodEarnings[i]!)
  const totalLiabilitiesEquity = totalLiabilities.map((l, i) => l + totalEquity[i]!)

  // Dev-time arithmetic checks.
  for (const s of [...assets, ...liabilities, equity]) assertSectionTotal(`Balance sheet ${s.label}`, s.rows, s.totals)
  dates.forEach((d, i) => {
    if (!eq(totalAssets[i]!, totalLiabilitiesEquity[i]!)) {
      throw new Error(`Balance sheet ${d}: assets ${totalAssets[i]} ≠ liabilities + equity ${totalLiabilitiesEquity[i]}`)
    }
  })
  return { dates, assets, totalAssets, liabilities, totalLiabilities, equity, equityEarnings, totalEquity, totalLiabilitiesEquity, currentPeriodEarnings }
}

/**
 * First day of the "current period" for an as-of date: the financial year
 * start, or the day after the latest closing book on/before the date if that
 * is later (a closing book resets current period earnings).
 */
export function bsCurrentPeriodStart(asOf: string): string {
  let start = fyStart(asOf)
  for (const tx of ledger.value) {
    if (tx.closingId && tx.date <= asOf) {
      const next = addDaysIso(tx.date, 1)
      if (next > start) start = next
    }
  }
  return start
}

/**
 * Asserts the two statements tie: the balance sheet's Current Period Earnings
 * as of `asOf` equals the P&L net profit for the financial year to that date
 * (from the day after a closing book, when one falls inside the year).
 * Returns the tied figure.
 */
export function bsAssertTiesToPl(asOf: string): number {
  const bs = bsReport([asOf])
  const start = bsCurrentPeriodStart(asOf)
  if (start > asOf) return 0
  const pl = plReport([{ start, end: asOf, label: plLabel(start, asOf) }])
  if (!eq(bs.currentPeriodEarnings[0]!, pl.netProfit[0]!)) {
    throw new Error(`Current Period Earnings ${bs.currentPeriodEarnings[0]} ≠ P&L net profit ${pl.netProfit[0]} (${start} – ${asOf})`)
  }
  return pl.netProfit[0]!
}

// ── Balance sheet periods (prod constants.periods.PERIODS / COMPARE_PERIODS) ─

export type BsPeriodKey = 'today' | 'this_week' | 'this_month' | 'this_quarter' | 'this_year' | 'yesterday' | 'last_week' | 'last_month' | 'last_quarter' | 'last_year' | 'this_financial_year' | 'custom'

export const BS_PERIOD_OPTIONS: { value: BsPeriodKey; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'this_year', label: 'This Year' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'last_year', label: 'Last Year' },
  { value: 'this_financial_year', label: 'Each month this year' },
  { value: 'custom', label: 'Custom' },
]

/** As-of date a balance-sheet period resolves to (prod: the period's end). */
export function bsPeriodDate(key: BsPeriodKey, today = SIM_TODAY_ISO): string {
  const [y, m, d] = parts(today)
  const dow = new Date(Date.UTC(y, m, d)).getUTCDay()
  const q = Math.floor(m / 3) * 3
  switch (key) {
    case 'this_week': return isoOf(y, m, d - dow + 6)
    case 'this_month': return monthEnd(y, m)
    case 'this_quarter': return monthEnd(y, q + 2)
    case 'this_year': return `${y}-12-31`
    case 'yesterday': return isoOf(y, m, d - 1)
    case 'last_week': return isoOf(y, m, d - dow - 1)
    case 'last_month': return monthEnd(y, m - 1)
    case 'last_quarter': return monthEnd(y, q - 1)
    case 'last_year': return `${y - 1}-12-31`
    case 'this_financial_year': return monthEnd(y, 11)
    default: return today
  }
}

export type BsCompareBy = '' | 'weekly' | 'monthly' | 'quarterly' | 'semi_yearly' | 'yearly'

export const BS_COMPARE_OPTIONS: { value: BsCompareBy; label: string }[] = [
  { value: '', label: 'None' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'semi_yearly', label: 'Semi-Yearly' },
  { value: 'yearly', label: 'Yearly' },
]

/** "Previous N Periods" (prod COMPARE_PERIODS_COUNT, 1–11). */
export const BS_PL_COMPARE_COUNT_OPTIONS: { value: string; label: string }[] = [
  { value: '0', label: 'None' },
  ...Array.from({ length: 11 }, (_, i) => ({ value: String(i + 1), label: `Previous ${i + 1} Periods` })),
]

/** Column dates: the as-of date, then N earlier period ends. */
export function bsBuildDates(asOf: string, compareBy: BsCompareBy, count: number, order: 'asc' | 'desc' = 'desc'): string[] {
  const list = [asOf]
  if (compareBy && count > 0) {
    const [y, m, d] = parts(asOf)
    const stepMonths = { weekly: 0, monthly: 1, quarterly: 3, semi_yearly: 6, yearly: 12 }[compareBy]
    const isMonthEnd = asOf === monthEnd(y, m)
    for (let k = 1; k <= count; k++) {
      if (!stepMonths) { list.push(isoOf(y, m, d - 7 * k)); continue }
      const tm = m - k * stepMonths
      // Month-end as-of dates step to month-ends; any other day keeps its day (clamped).
      const end = monthEnd(y, tm)
      list.push(isMonthEnd ? end : (isoOf(y, tm, d) > end ? end : isoOf(y, tm, d)))
    }
  }
  return order === 'asc' ? list.reverse() : list
}

/** Monthly columns for "Each month this year": month-ends Jan … current month. */
export function bsEachMonthDates(year: number, order: 'asc' | 'desc' = 'asc'): string[] {
  const [ty, tm] = parts(SIM_TODAY_ISO)
  const last = year === ty ? tm : 11
  const list = Array.from({ length: last + 1 }, (_, m) => (year === ty && m === tm ? SIM_TODAY_ISO : monthEnd(year, m)))
  return order === 'desc' ? list.reverse() : list
}

/** Percent change of `cur` against `prev` (prod percentage column); null when not comparable. */
export function bsPlChangePct(cur: number, prev: number | undefined): number | null {
  if (prev === undefined || prev === 0 || cur === prev) return null
  return ((cur - prev) / Math.abs(prev)) * 100
}

// Module-load self-check on the seed ledger: today's statements balance and tie.
bsAssertTiesToPl(SIM_TODAY_ISO)

/** First posting date in the books (drill-downs from the balance sheet start here). */
export function bsPlLedgerStart(): string {
  return ledger.value[0]?.date ?? fyStart(SIM_TODAY_ISO)
}

/**
 * Drill-down target for an account row. The General ledger report reads its own
 * sample dataset and takes no account filter, so rows open the account's
 * transaction list (Chart of accounts detail) for the report's date range —
 * prod's `/accounts/:id?q[transaction_date_gteq]=…&q[transaction_date_lteq]=…`.
 */
export function bsPlAccountLink(id: string, start: string, end: string): string {
  return `/chart-of-accounts/${encodeURIComponent(id)}?start=${start}&end=${end}`
}

export { fyStart as bsPlFinancialYearStart }
