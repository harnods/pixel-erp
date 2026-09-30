/**
 * Multidimensional report — Reports › Financials › Multidimensional.
 * Figma "Multidimensional Report" 4836-56598 (Reports / Cost & Profit Center).
 *
 * A profit & loss sliced by ONE dimension: the account tree runs down the rows,
 * the chosen dimension's values run across the columns (Branch → Jakarta, Bogor,
 * …), with a TOTAL column on the right. Section subtotals and the profit lines
 * (gross / operating / net) are DERIVED here, never stored — so any filter that
 * hides a column or an account keeps the arithmetic self-consistent.
 *
 * Amounts are generated deterministically from (account, dimension value,
 * period) so the same slice always renders the same numbers across reloads and
 * the compare period differs believably from the primary one.
 */
import { reactive } from 'vue'
import { reportableDimensions } from './dimensions'
import { loadSnapshot, saveSnapshot } from './persist'

// ── Account tree ─────────────────────────────────────────────────────────────
/** One posting account. `base` is its per-dimension-value order of magnitude
 *  (negative for contra accounts — returns, discounts, charges). */
export interface MdAccount { code: string; name: string; base: number }

/** A P&L block: its accounts plus the subtotal line printed underneath them. */
export interface MdSection { key: string; label: string; totalLabel: string; accounts: MdAccount[] }

export const MD_SECTIONS: MdSection[] = [
  {
    key: 'revenue',
    label: 'Revenue',
    totalLabel: 'Total revenue',
    accounts: [
      { code: '4-10000', name: 'Sales Revenue', base: 1_250_000_000 },
      { code: '4-10001', name: 'Service Income', base: 50_000_000 },
      { code: '4-20000', name: 'Sales Returns & Allowances', base: -5_000_000 },
    ],
  },
  {
    key: 'cost-of-sales',
    label: 'Cost of sales',
    totalLabel: 'Total cost of sales',
    accounts: [
      { code: '5-10000', name: 'Cost of Goods Sold', base: 220_000_000 },
      { code: '5-10001', name: 'Freight In', base: 10_000_000 },
      { code: '5-20000', name: 'Purchase Discounts', base: -2_000_000 },
    ],
  },
  {
    key: 'operating-expenses',
    label: 'Operating expenses',
    totalLabel: 'Total operating expenses',
    accounts: [
      { code: '6-10001', name: 'Salaries and Wages', base: 85_000_000 },
      { code: '6-10002', name: 'Office Rent Expense', base: 25_000_000 },
      { code: '6-10003', name: 'Utilities (Electricity & Water)', base: 8_500_000 },
      { code: '6-10004', name: 'Advertising & Marketing', base: 15_000_000 },
      { code: '6-10005', name: 'General & Administrative', base: 4_500_000 },
      { code: '6-10006', name: 'Depreciation Expense', base: 2_000_000 },
    ],
  },
  {
    key: 'other-income',
    label: 'Other income (expenses)',
    totalLabel: 'Total other income (expenses)',
    accounts: [
      { code: '8-10000', name: 'Interest Income', base: 1_250_000 },
      { code: '8-10001', name: 'Gain on Sale of Asset', base: 12_000_000 },
      { code: '9-10000', name: 'Bank Admin Charges', base: -1_750_000 },
    ],
  },
]

const ACCOUNT_BY_CODE = new Map<string, MdAccount>(
  MD_SECTIONS.flatMap((s) => s.accounts.map((a) => [a.code, a] as const)),
)

/** Accounts that reduce profit when they go up — subtracted by the profit lines. */
const EXPENSE_SECTIONS = new Set(['cost-of-sales', 'operating-expenses'])

// ── Dimensions available to the report ───────────────────────────────────────
/** A dimension as the report needs it: a name plus its column values. */
export interface MdReportDimension { id: string; name: string; values: string[] }

/** Demo dimensions — the Figma's Branch view, shown ONLY while the tenant has
 *  no reportable dimensions of its own (Dimensions not activated yet, or
 *  activated but nothing created). The moment real dimensions exist they take
 *  over completely, so the report reflects the actual Settings > Dimensions
 *  setup rather than mixing demo columns into real ones. */
const DEMO_DIMENSIONS: MdReportDimension[] = [
  { id: 'md-branch', name: 'Branch', values: ['Jakarta', 'Bogor', 'Bandung', 'Tasik', 'Jogjakarta'] },
  { id: 'md-cost-center', name: 'Cost center', values: ['Head office', 'Warehouse', 'Sales team', 'Support'] },
  { id: 'md-project', name: 'Project', values: ['Project Alpha', 'Project Beta', 'Project Gamma'] },
]

/** The dimension picker's options: the tenant's own reportable dimensions, or
 *  the demo set when it has none. */
export function reportDimensions(): MdReportDimension[] {
  const own = reportableDimensions().map((d) => ({ id: d.id, name: d.name, values: d.values.map((v) => v.name) }))
  return own.length ? own : DEMO_DIMENSIONS
}

/** True when the picker is showing the demo set rather than the tenant's own —
 *  the report notes this so nobody mistakes sample columns for their data. */
export function usingDemoDimensions(): boolean {
  return reportableDimensions().length === 0
}

export function getReportDimension(id: string): MdReportDimension | undefined {
  return reportDimensions().find((d) => d.id === id)
}

// ── Amounts ──────────────────────────────────────────────────────────────────
/** FNV-1a — stable across reloads, so a slice always renders the same numbers. */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

/** Round to a step proportionate to the magnitude — keeps amounts looking like
 *  posted ledger figures (Rp1.240.000.000,00) rather than random noise. */
function roundish(n: number): number {
  const abs = Math.abs(n)
  const step = abs >= 500_000_000 ? 10_000_000 : abs >= 50_000_000 ? 500_000 : abs >= 5_000_000 ? 250_000 : 50_000
  return Math.sign(n) * Math.round(abs / step) * step
}

/**
 * Posted amount for one account in one dimension value, for a given period.
 * `periodKey` separates the primary period from the compare period (and one
 * month/quarter from the next) — same account + value + period → same number.
 */
export function mdAmount(code: string, value: string, periodKey = '', share = 1): number {
  const base = ACCOUNT_BY_CODE.get(code)?.base ?? 0
  if (!base) return 0
  const variance = 0.86 + (hash(`${code}|${value}|${periodKey}`) % 29) / 100 // 0.86 – 1.14
  return roundish(base * variance * share)
}

/** Sum of a section's accounts for one dimension value. */
export function mdSectionTotal(section: MdSection, value: string, periodKey = '', accountFilter?: (a: MdAccount) => boolean, share = 1): number {
  return section.accounts
    .filter((a) => !accountFilter || accountFilter(a))
    .reduce((sum, a) => sum + mdAmount(a.code, value, periodKey, share), 0)
}

/** The three derived profit lines for one dimension value. */
export function mdProfitLines(value: string, periodKey = '', accountFilter?: (a: MdAccount) => boolean, share = 1) {
  const total = (key: string) => {
    const s = MD_SECTIONS.find((x) => x.key === key)!
    return mdSectionTotal(s, value, periodKey, accountFilter, share)
  }
  const grossProfit = total('revenue') - total('cost-of-sales')
  const operatingProfit = grossProfit - total('operating-expenses')
  const netProfit = operatingProfit + total('other-income')
  return { grossProfit, operatingProfit, netProfit }
}

/** True when a section's subtotal is subtracted by the profit lines. */
export function isExpenseSection(key: string): boolean { return EXPENSE_SECTIONS.has(key) }

// ── Comparison ───────────────────────────────────────────────────────────────
/** How many earlier windows sit beside the applied period (Figma 4836-67530). */
export type MdComparePeriod = 'prev-1' | 'prev-2' | 'prev-3' | 'prev-year'
/** Which axis owns the outer header band: dimension values or periods. */
export type MdCompareGroupBy = 'dimension' | 'period'

export interface MdCompareSettings {
  period: MdComparePeriod | ''
  groupBy: MdCompareGroupBy | ''
}

export const COMPARE_PERIOD_OPTIONS: { value: MdComparePeriod; label: string; count: number }[] = [
  { value: 'prev-1', label: '1 previous period', count: 1 },
  { value: 'prev-2', label: '2 previous periods', count: 2 },
  { value: 'prev-3', label: '3 previous periods', count: 3 },
  { value: 'prev-year', label: 'Same period last year', count: 1 },
]

export function comparePeriodLabel(v: MdComparePeriod | ''): string {
  return COMPARE_PERIOD_OPTIONS.find((o) => o.value === v)?.label ?? ''
}
export function comparePeriodCount(v: MdComparePeriod | ''): number {
  return COMPARE_PERIOD_OPTIONS.find((o) => o.value === v)?.count ?? 0
}
export function emptyCompareSettings(): MdCompareSettings { return { period: '', groupBy: '' } }

// ── Filters ──────────────────────────────────────────────────────────────────
/** The comparator every value filter carries (Figma 4926-67880 ▸ Values). */
export type MdComparator = 'isAllOf' | 'isAnyOf' | 'isNoneOf'

export const MD_COMPARATORS: MdComparator[] = ['isAllOf', 'isAnyOf', 'isNoneOf']
export const MD_COMPARATOR_LABELS: Record<MdComparator, string> = {
  isAllOf: 'Is all of',
  isAnyOf: 'Is any of',
  isNoneOf: 'Is none of',
}

export interface MdFilters {
  /** How `values` reads: keep only them (is all of / is any of) or drop them. */
  valuesComparator: MdComparator
  /** Dimension values scoped in (or out) of the report; empty = all of them. */
  values: string[]
  /** How `tags` reads — same three comparators as `valuesComparator`. */
  tagsComparator: MdComparator
  /** Transaction tags the postings must carry; empty = every tag. */
  tags: string[]
  /** Free-text match against an account's code or name; empty = no filter. */
  accountKeyword: string
  /** Show accounts whose amounts are all zero across the visible columns. */
  showZero: boolean
}

export function emptyMdFilters(): MdFilters {
  return { valuesComparator: 'isAnyOf', values: [], tagsComparator: 'isAnyOf', tags: [], accountKeyword: '', showZero: true }
}

/** Fill in what an older persisted view (saved before the comparator/tag filters
 *  existed) is missing, so a stored view never applies `undefined`. */
export function normalizeMdFilters(v: Partial<MdFilters> | undefined): MdFilters {
  return { ...emptyMdFilters(), ...(v ?? {}), values: [...(v?.values ?? [])], tags: [...(v?.tags ?? [])] }
}

/**
 * The share of a posted amount that survives the Tags filter — the report's
 * numbers are generated, not posted, so a tag scope can't be summed for real;
 * it deterministically keeps a believable slice of each amount instead (and the
 * complement for "is none of", so the two are consistent with each other).
 * Every derived line re-sums the scaled amounts, so subtotals stay honest.
 */
export function mdTagShare(comparator: MdComparator, tags: string[]): number {
  if (!tags.length) return 1
  const key = `${comparator === 'isNoneOf' ? 'in' : comparator}|${[...tags].sort().join(',')}`
  const share = 0.3 + (hash(key) % 35) / 100 // 0.30 – 0.64
  return comparator === 'isNoneOf' ? 1 - share : share
}

// ── Saved views ──────────────────────────────────────────────────────────────
export interface MdSavedView { id: string; name: string; dimensionId: string; filters: MdFilters }

const VIEWS_KEY = 'multidimensional-views-v1'
export const multidimensionalViews = reactive<MdSavedView[]>(loadSnapshot<MdSavedView>(VIEWS_KEY) ?? [])
function persistViews() { saveSnapshot(VIEWS_KEY, multidimensionalViews) }
let viewSeq = multidimensionalViews.length + 1

export function addMdView(v: Omit<MdSavedView, 'id'>): MdSavedView {
  const view: MdSavedView = { ...v, id: `mdview-${Date.now()}-${viewSeq++}` }
  multidimensionalViews.push(view); persistViews(); return view
}
export function updateMdView(id: string, patch: Partial<Omit<MdSavedView, 'id'>>): void {
  const v = multidimensionalViews.find((x) => x.id === id); if (!v) return
  Object.assign(v, patch); persistViews()
}
export function deleteMdView(id: string): void {
  const i = multidimensionalViews.findIndex((x) => x.id === id)
  if (i !== -1) { multidimensionalViews.splice(i, 1); persistViews() }
}
