/**
 * Cash flow + Trial balance reports — Reports › Financials.
 *
 * Prod source: jurnal-frontend-app/src/pages/reports/cash_flow/ and trial_balance/
 * (+ quickbook ReportCustomLayoutPresenter for the default Direct / Indirect
 * cash-flow layouts and their category → line mapping).
 *
 * Every figure is derived from the canonical double-entry ledger in
 * chartOfAccounts.ts (the same journal the Chart of accounts, Close books and
 * account transaction lists read), so these reports tie to every other
 * ledger-based screen. The arithmetic is asserted on every build:
 *   • cash flow — each line total = sum of its accounts, each section total =
 *     sum of its lines, and net change = closing − opening balance of the
 *     Cash & bank accounts;
 *   • trial balance — opening, movement and end-balance debit totals equal
 *     their credit totals, and every column total = sum of its rows.
 */
import {
  coaRecords, categoryOf, categoryRank, ledger, netMovement, getAccount, CASH_AND_BANK,
  type CoaRecord,
} from './chartOfAccounts'
import { SIM_TODAY_ISO } from './simClock'

// ── Dates ────────────────────────────────────────────────────────────────────

/** "Today" for every report period — the prototype's simulated clock. */
export const TB_TODAY_ISO = SIM_TODAY_ISO

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function parse(s: string): Date { return new Date(s + 'T00:00:00') }
function addDays(s: string, n: number): string { const d = parse(s); d.setDate(d.getDate() + n); return iso(d) }
function dayBefore(s: string): string { return addDays(s, -1) }
function monthStart(y: number, m: number): string { return iso(new Date(y, m, 1)) }
function monthEnd(y: number, m: number): string { return iso(new Date(y, m + 1, 0)) }

/** 1 Aug 2026 */
export function cfFormatDay(s: string): string {
  const d = parse(s)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}
/** 01/08/2026 (prod DD/MM/YYYY) */
export function cfFormatDmy(s: string): string { return s.split('-').reverse().join('/') }

export interface CfDateRange { start: string; end: string }

// ── Period lists (prod constants/periods.ts, English labels) ─────────────────

export interface ReportPeriodOption { value: string; label: string }

/** CASH_FLOW_PERIODS_RANGE */
export const CF_PERIODS: ReportPeriodOption[] = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
  { value: 'this_year', label: 'Yearly' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_year', label: 'Last Year' },
  { value: 'this_financial_year', label: 'Each month this year' },
  { value: 'custom', label: 'Custom' },
]

/** PERIODS_RANGE (trial balance) */
export const TB_PERIODS: ReportPeriodOption[] = [
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
  { value: 'custom', label: 'Custom' },
]

/** Resolves a period key to its date range, anchored on the simulated today. */
export function tbPeriodRange(value: string, today = TB_TODAY_ISO): CfDateRange | null {
  const t = parse(today)
  const y = t.getFullYear(), m = t.getMonth()
  const q = Math.floor(m / 3) * 3
  const weekStart = addDays(today, -t.getDay())
  switch (value) {
    case 'today': return { start: today, end: today }
    case 'yesterday': { const d = dayBefore(today); return { start: d, end: d } }
    case 'this_week': return { start: weekStart, end: addDays(weekStart, 6) }
    case 'last_week': return { start: addDays(weekStart, -7), end: addDays(weekStart, -1) }
    case 'month':
    case 'this_month': return { start: monthStart(y, m), end: monthEnd(y, m) }
    case 'last_month': return { start: monthStart(y, m - 1), end: monthEnd(y, m - 1) }
    case 'this_quarter': return { start: monthStart(y, q), end: monthEnd(y, q + 2) }
    case 'last_quarter': return { start: monthStart(y, q - 3), end: monthEnd(y, q - 1) }
    case 'this_year': return { start: monthStart(y, 0), end: monthEnd(y, 11) }
    case 'last_year': return { start: monthStart(y - 1, 0), end: monthEnd(y - 1, 11) }
    // Prod: the last month of this year, compared with the previous 11 months.
    case 'this_financial_year': return { start: monthStart(y, 11), end: monthEnd(y, 11) }
    default: return null
  }
}

/** Prod COMPARE_PERIODS_COUNT */
export const CF_COMPARE_COUNTS: ReportPeriodOption[] = [
  { value: '0', label: 'None' },
  ...Array.from({ length: 11 }, (_, i) => ({ value: String(i + 1), label: `Previous ${i + 1} Periods` })),
]

/** True when the range is whole calendar months (shift comparisons by month). */
function monthAligned(r: CfDateRange): number {
  const s = parse(r.start), e = parse(r.end)
  if (s.getDate() !== 1 || iso(new Date(e.getFullYear(), e.getMonth() + 1, 0)) !== r.end) return 0
  return (e.getFullYear() - s.getFullYear()) * 12 + e.getMonth() - s.getMonth() + 1
}

/** The comparison columns: the applied range plus N previous periods of the same length. */
export function cfComparisonRanges(r: CfDateRange, count: number, order: 'asc' | 'desc' = 'desc'): CfDateRange[] {
  const out: CfDateRange[] = [r]
  const months = monthAligned(r)
  const span = Math.round((parse(r.end).getTime() - parse(r.start).getTime()) / 86_400_000) + 1
  for (let i = 1; i <= count; i++) {
    if (months) {
      const s = parse(r.start)
      const start = monthStart(s.getFullYear(), s.getMonth() - months * i)
      const sd = parse(start)
      out.push({ start, end: monthEnd(sd.getFullYear(), sd.getMonth() + months - 1) })
    } else {
      out.push({ start: addDays(r.start, -span * i), end: addDays(r.end, -span * i) })
    }
  }
  return order === 'asc' ? out.reverse() : out
}

export function cfRangeLabel(r: CfDateRange): string {
  return r.start === r.end ? cfFormatDay(r.start) : `${cfFormatDay(r.start)} - ${cfFormatDay(r.end)}`
}

// ── Cash flow ────────────────────────────────────────────────────────────────

/** Prod cash-flow layout ids (DictionaryDetail REPORT_CUSTOM_CASHFLOW_*). */
export type CfLayout = 'direct' | 'indirect'
export const CF_LAYOUTS: { id: CfLayout; name: string; typeId: number; method: string }[] = [
  { id: 'direct', name: 'Direct Layout', typeId: 235, method: 'direct method' },
  { id: 'indirect', name: 'Indirect Layout', typeId: 236, method: 'indirect method' },
]

export type CfActivity = 'operating' | 'investing' | 'financing'

interface LineDef { label: string; categoryIds: number[]; netIncome?: boolean }

// Category ids — chartOfAccounts.ts ACCOUNT_CATEGORIES (= prod AccountCategory).
const AR = 1, OCA = 2, INV = 4, FA = 5, OA = 6, DEP = 7, AP = 8, CC = 9, OCL = 10, LTL = 11, EQ = 12
const INC = 13, OINC = 14, COGS = 15, EXP = 16, OEXP = 17
const PL_CATEGORIES = [INC, OINC, COGS, EXP, OEXP]

/** quickbook ReportCustomLayoutPresenter — default direct / indirect layouts. */
const LAYOUT_LINES: Record<CfLayout, Record<CfActivity, LineDef[]>> = {
  direct: {
    operating: [
      { label: 'Cash received from customers', categoryIds: [AR, INC] },
      { label: 'Other current assets', categoryIds: [OCA] },
      { label: 'Cash paid to suppliers', categoryIds: [INV, AP, COGS] },
      { label: 'Credit cards and current liabilities', categoryIds: [CC, OCL] },
      { label: 'Other incomes', categoryIds: [OINC] },
      { label: 'Operating expenses paid', categoryIds: [DEP, EXP, OEXP] },
    ],
    investing: [
      { label: 'Purchase/Sale of assets', categoryIds: [FA] },
      { label: 'Other investing activities', categoryIds: [OA] },
    ],
    financing: [
      { label: 'Repayment/Proceeds of loan', categoryIds: [LTL] },
      { label: 'Equity/Capital', categoryIds: [EQ] },
    ],
  },
  indirect: {
    operating: [
      { label: 'Net income', categoryIds: [], netIncome: true },
      { label: 'Accounts receivable', categoryIds: [AR] },
      { label: 'Other current assets', categoryIds: [OCA] },
      { label: 'Inventory', categoryIds: [INV] },
      { label: 'Depreciation & amortizations', categoryIds: [DEP] },
      { label: 'Accounts payable', categoryIds: [AP] },
      { label: 'Payable & other payables', categoryIds: [CC] },
      { label: 'Other current liabilities', categoryIds: [OCL] },
    ],
    investing: [
      { label: 'Fixed assets', categoryIds: [FA] },
      { label: 'Other investing activities', categoryIds: [OA] },
    ],
    financing: [
      { label: 'Long term liabilities', categoryIds: [LTL] },
      { label: 'Equity', categoryIds: [EQ] },
    ],
  },
}

/** Prod table-report.json */
export const CF_ACTIVITY_LABELS: Record<CfActivity, { title: string; net: string }> = {
  operating: { title: 'Cash flow from operating activities', net: 'Net cash provided by operating activities' },
  investing: { title: 'Cash flow from investing activities', net: 'Net cash provided by investing activities' },
  financing: { title: 'Cash flow from financing activities', net: 'Net cash provided by financing activities' },
}

export interface CfAccountRow { id: string; code: string; name: string; amounts: number[] }
export interface CfLine { label: string; accounts: CfAccountRow[]; amounts: number[]; netIncome?: boolean }
export interface CfSection { activity: CfActivity; title: string; netLabel: string; lines: CfLine[]; amounts: number[] }
export interface CfReport {
  layout: CfLayout
  ranges: CfDateRange[]
  sections: CfSection[]
  netChange: number[]
  bankRevaluation: number[]
  opening: number[]
  closing: number[]
}

const isCashAccount = (id: string) => getAccount(id)?.categoryId === CASH_AND_BANK
const cashAccounts = () => coaRecords.filter(a => a.categoryId === CASH_AND_BANK)

/** Sum of every Cash & bank account's balance as of a date (debit-positive). */
export function cfCashBalance(asOf: string): number {
  return cashAccounts().reduce((s, a) => s + netMovement(a.id, null, asOf), 0)
}

/** Cash effect per non-cash account over a range — direct method: only journals that touch cash. */
function directEffects(r: CfDateRange): Map<string, number> {
  const out = new Map<string, number>()
  for (const tx of ledger.value) {
    if (tx.date < r.start || tx.date > r.end) continue
    if (!tx.lines.some(l => isCashAccount(l.code))) continue
    for (const l of tx.lines) {
      if (isCashAccount(l.code)) continue
      out.set(l.code, (out.get(l.code) ?? 0) - (l.debit - l.credit))
    }
  }
  return out
}

/** Cash effect per non-cash account — indirect method: every journal in the range.
 *  Closing-book entries (P&L → retained earnings) move no cash and would only
 *  shuffle Net income into Equity, so they are left out. */
function indirectEffects(r: CfDateRange): Map<string, number> {
  const out = new Map<string, number>()
  for (const tx of ledger.value) {
    if (tx.date < r.start || tx.date > r.end || tx.closingId) continue
    for (const l of tx.lines) {
      if (isCashAccount(l.code)) continue
      out.set(l.code, (out.get(l.code) ?? 0) - (l.debit - l.credit))
    }
  }
  return out
}

const eq = (a: number, b: number) => Math.abs(a - b) < 0.5
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)
const byCode = (a: CoaRecord, b: CoaRecord) => a.code.localeCompare(b.code)

export function cfBuildReport(layout: CfLayout, ranges: CfDateRange[]): CfReport {
  const effects = ranges.map(r => (layout === 'direct' ? directEffects(r) : indirectEffects(r)))
  const n = ranges.length
  const zeros = () => Array.from({ length: n }, () => 0)

  const sections: CfSection[] = (['operating', 'investing', 'financing'] as CfActivity[]).map((activity) => {
    const lines: CfLine[] = LAYOUT_LINES[layout][activity].map((def) => {
      if (def.netIncome) {
        const amounts = effects.map(m => [...m.entries()]
          .filter(([id]) => PL_CATEGORIES.includes(getAccount(id)?.categoryId ?? -1))
          .reduce((s, [, v]) => s + v, 0))
        return { label: def.label, accounts: [], amounts, netIncome: true }
      }
      const accounts: CfAccountRow[] = coaRecords
        .filter(a => def.categoryIds.includes(a.categoryId))
        .sort((a, b) => categoryRank(a.categoryId) - categoryRank(b.categoryId) || byCode(a, b))
        .map(a => ({ id: a.id, code: a.code, name: a.name, amounts: effects.map(m => m.get(a.id) ?? 0) }))
        .filter(a => a.amounts.some(v => v !== 0))
      const amounts = zeros().map((_, i) => sum(accounts.map(a => a.amounts[i]!)))
      return { label: def.label, accounts, amounts }
    })
    const amounts = zeros().map((_, i) => sum(lines.map(l => l.amounts[i]!)))
    return { activity, title: CF_ACTIVITY_LABELS[activity].title, netLabel: CF_ACTIVITY_LABELS[activity].net, lines, amounts }
  })

  const netChange = zeros().map((_, i) => sum(sections.map(s => s.amounts[i]!)))
  const opening = ranges.map(r => cfCashBalance(dayBefore(r.start)))
  const closing = ranges.map(r => cfCashBalance(r.end))
  const bankRevaluation = zeros()
  const report: CfReport = { layout, ranges, sections, netChange, bankRevaluation, opening, closing }
  cfAssertReport(report)
  return report
}

/** Dev-time arithmetic check — throws if any total disagrees with the ledger. */
export function cfAssertReport(r: CfReport): void {
  r.ranges.forEach((range, i) => {
    for (const s of r.sections) {
      for (const l of s.lines) {
        if (!l.netIncome && !eq(l.amounts[i]!, sum(l.accounts.map(a => a.amounts[i]!)))) {
          throw new Error(`Cash flow: "${l.label}" total ≠ sum of its accounts`)
        }
      }
      if (!eq(s.amounts[i]!, sum(s.lines.map(l => l.amounts[i]!)))) throw new Error(`Cash flow: ${s.activity} total ≠ sum of its lines`)
    }
    const ledgerChange = cfCashBalance(range.end) - cfCashBalance(dayBefore(range.start))
    if (!eq(r.netChange[i]!, ledgerChange)) {
      throw new Error(`Cash flow (${range.start}..${range.end}): net change ${r.netChange[i]} ≠ cash & bank ledger change ${ledgerChange}`)
    }
    if (!eq(r.opening[i]! + r.netChange[i]! + r.bankRevaluation[i]!, r.closing[i]!)) {
      throw new Error('Cash flow: beginning + increase ≠ ending cash balance')
    }
  })
}

// ── Trial balance ────────────────────────────────────────────────────────────

export interface TbAmounts {
  obDebit: number; obCredit: number
  mvDebit: number; mvCredit: number
  ebDebit: number; ebCredit: number
}
export interface TbAccountRow extends TbAmounts { id: string; code: string; name: string }
export interface TbGroup { categoryId: number; accountType: string; accounts: TbAccountRow[] }
export interface TbReport { range: CfDateRange; groups: TbGroup[]; total: TbAmounts }

const split = (net: number) => (net >= 0 ? [net, 0] : [0, -net]) as [number, number]

export function tbBuildReport(range: CfDateRange): TbReport {
  const before = dayBefore(range.start)
  const mv = new Map<string, { d: number; c: number }>()
  for (const tx of ledger.value) {
    if (tx.date < range.start || tx.date > range.end) continue
    for (const l of tx.lines) {
      const m = mv.get(l.code) ?? { d: 0, c: 0 }
      m.d += l.debit; m.c += l.credit
      mv.set(l.code, m)
    }
  }
  const rows = coaRecords.map((a) => {
    const opening = netMovement(a.id, null, before)
    const m = mv.get(a.id) ?? { d: 0, c: 0 }
    const [obDebit, obCredit] = split(opening)
    const [ebDebit, ebCredit] = split(opening + m.d - m.c)
    return { a, row: { id: a.id, code: a.code, name: a.name, obDebit, obCredit, mvDebit: m.d, mvCredit: m.c, ebDebit, ebCredit } }
  }).filter(({ row }) => row.obDebit || row.obCredit || row.mvDebit || row.mvCredit)

  const groups: TbGroup[] = []
  const sorted = [...rows].sort((x, y) => categoryRank(x.a.categoryId) - categoryRank(y.a.categoryId) || byCode(x.a, y.a))
  for (const { a, row } of sorted) {
    let g = groups[groups.length - 1]
    if (!g || g.categoryId !== a.categoryId) {
      g = { categoryId: a.categoryId, accountType: categoryOf(a.categoryId).name, accounts: [] }
      groups.push(g)
    }
    g.accounts.push(row)
  }
  const all = groups.flatMap(g => g.accounts)
  const k = (key: keyof TbAmounts) => sum(all.map(r => r[key]))
  const total: TbAmounts = {
    obDebit: k('obDebit'), obCredit: k('obCredit'),
    mvDebit: k('mvDebit'), mvCredit: k('mvCredit'),
    ebDebit: k('ebDebit'), ebCredit: k('ebCredit'),
  }
  const report = { range, groups, total }
  tbAssertReport(report)
  return report
}

/** Dev-time check — every debit column equals its credit column. */
export function tbAssertReport(r: TbReport): void {
  const t = r.total
  if (!eq(t.obDebit, t.obCredit)) throw new Error(`Trial balance: opening debit ${t.obDebit} ≠ credit ${t.obCredit}`)
  if (!eq(t.mvDebit, t.mvCredit)) throw new Error(`Trial balance: movement debit ${t.mvDebit} ≠ credit ${t.mvCredit}`)
  if (!eq(t.ebDebit, t.ebCredit)) throw new Error(`Trial balance: end balance debit ${t.ebDebit} ≠ credit ${t.ebCredit}`)
  for (const g of r.groups) for (const a of g.accounts) {
    if (!eq(a.ebDebit - a.ebCredit, a.obDebit - a.obCredit + a.mvDebit - a.mvCredit)) {
      throw new Error(`Trial balance: ${a.code} end balance ≠ opening + movement`)
    }
  }
}
