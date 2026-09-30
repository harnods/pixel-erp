/**
 * Budget Variance (P&L Budgeting) report — Reports › Financials › Budget Variance.
 * Figma "Report / Profit and Loss Budgeting / Filter / Compare by Classifications"
 * 4481-243948.
 *
 * The P&L account tree run against a budget: per period, each account shows its
 * BUDGET, its ACTUAL, the VARIANCE between them and that variance as a
 * percentage. Section subtotals and the profit lines are derived here, so any
 * filter keeps the arithmetic self-consistent.
 *
 * Sign convention follows the Figma: every account is displayed as a magnitude,
 * and contra accounts (sales returns, purchase discounts, bank charges) are
 * SUBTRACTED by their section subtotal. Variance is always `actual - budget`, so
 * a negative variance is flagged "Exceeds budget" regardless of account type —
 * matching the approved design.
 */
import { MD_SECTIONS, type MdAccount, type MdSection } from './multidimensionalReport'

/** A budget the report can be run against (the title-bar dropdown). */
export interface Budget { id: string; name: string }
export const BUDGETS: Budget[] = [
  { id: 'sales-dept', name: 'Sales Department' },
  { id: 'marketing-dept', name: 'Marketing Department' },
  { id: 'company-wide', name: 'Company-wide' },
]

/** How far back the budget window starts, relative to its end month. */
export const BUDGET_FROM_OPTIONS: { value: string; label: string; months: number }[] = [
  { value: '1m', label: '1 month ago', months: 1 },
  { value: '3m', label: '3 months ago', months: 3 },
  { value: '6m', label: '6 months ago', months: 6 },
  { value: '12m', label: '12 months ago', months: 12 },
]

/** The bucket size each column covers. */
export const SHOW_EVERY_OPTIONS: { value: string; label: string; months: number }[] = [
  { value: '1m', label: '1 month', months: 1 },
  { value: '3m', label: '3 months', months: 3 },
  { value: '12m', label: '1 year', months: 12 },
]

export function budgetFromMonths(v: string): number { return BUDGET_FROM_OPTIONS.find((o) => o.value === v)?.months ?? 3 }
export function showEveryMonths(v: string): number { return SHOW_EVERY_OPTIONS.find((o) => o.value === v)?.months ?? 1 }

// ── Per-account budget and actual (the Figma's figures) ──────────────────────
/** Monthly budget / actual per account, displayed as magnitudes. */
const PLAN: Record<string, { budget: number; actual: number }> = {
  '4-10000': { budget: 5_000_000_000, actual: 5_750_000_000 },
  '4-10001': { budget: 600_000_000, actual: 550_000_000 },
  '4-20000': { budget: 200_000_000, actual: 250_000_000 },
  '5-10000': { budget: 3_000_000_000, actual: 3_300_000_000 },
  '5-10001': { budget: 120_000_000, actual: 150_000_000 },
  '5-20000': { budget: 100_000_000, actual: 120_000_000 },
  '6-10001': { budget: 900_000_000, actual: 920_000_000 },
  '6-10002': { budget: 250_000_000, actual: 250_000_000 },
  '6-10003': { budget: 120_000_000, actual: 135_000_000 },
  '6-10004': { budget: 300_000_000, actual: 420_000_000 },
  '6-10005': { budget: 180_000_000, actual: 170_000_000 },
  '6-10006': { budget: 90_000_000, actual: 90_000_000 },
  '8-10000': { budget: 15_000_000, actual: 18_000_000 },
  '8-10001': { budget: 0, actual: 50_000_000 },
  '9-10000': { budget: 12_000_000, actual: 14_000_000 },
}

/** The account tree, reused from the Multidimensional report so both reports
 *  agree on the chart of accounts. `base < 0` marks a contra account. */
export const BV_SECTIONS: MdSection[] = MD_SECTIONS
export function isContra(a: MdAccount): boolean { return a.base < 0 }

/** FNV-1a — stable across reloads, so a bucket always renders the same figures. */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
function roundish(n: number): number {
  const abs = Math.abs(n)
  const step = abs >= 1_000_000_000 ? 50_000_000 : abs >= 100_000_000 ? 5_000_000 : abs >= 10_000_000 ? 1_000_000 : 500_000
  return Math.round(n / step) * step
}

/**
 * Budget for one account in one bucket. The plan repeats every month, so a
 * multi-month bucket is a straight multiple; the budget itself doesn't wobble
 * period to period (that's what makes the variance readable).
 */
export function bvBudget(code: string, _bucketKey: string, months: number, dimensionValue = ''): number {
  const plan = PLAN[code]
  if (!plan) return 0
  // A dimension slice carries a stable share of the company-wide budget.
  const share = dimensionValue ? 0.5 + (hash(`b|${code}|${dimensionValue}`) % 45) / 100 : 1
  return roundish(plan.budget * months * share)
}

/** Actual for one account in one bucket — varies per bucket, unlike the budget. */
export function bvActual(code: string, bucketKey: string, months: number, dimensionValue = ''): number {
  const plan = PLAN[code]
  if (!plan) return 0
  const share = dimensionValue ? 0.5 + (hash(`b|${code}|${dimensionValue}`) % 45) / 100 : 1
  const drift = 0.9 + (hash(`a|${code}|${bucketKey}|${dimensionValue}`) % 25) / 100 // 0.90 – 1.14
  return roundish(plan.actual * months * share * drift)
}

/** A section's budget/actual subtotal — contra accounts subtract. */
export function bvSectionTotals(
  section: MdSection,
  bucketKey: string,
  months: number,
  dimensionValue = '',
  accountFilter?: (a: MdAccount) => boolean,
): { budget: number; actual: number } {
  return section.accounts
    .filter((a) => !accountFilter || accountFilter(a))
    .reduce((acc, a) => {
      const sign = isContra(a) ? -1 : 1
      acc.budget += sign * bvBudget(a.code, bucketKey, months, dimensionValue)
      acc.actual += sign * bvActual(a.code, bucketKey, months, dimensionValue)
      return acc
    }, { budget: 0, actual: 0 })
}

/** The three derived profit lines for one bucket. */
export function bvProfitLines(bucketKey: string, months: number, dimensionValue = '', accountFilter?: (a: MdAccount) => boolean) {
  const of = (key: string) => bvSectionTotals(BV_SECTIONS.find((s) => s.key === key)!, bucketKey, months, dimensionValue, accountFilter)
  const rev = of('revenue')
  const cos = of('cost-of-sales')
  const opex = of('operating-expenses')
  const other = of('other-income')
  return {
    grossProfit: { budget: rev.budget - cos.budget, actual: rev.actual - cos.actual },
    operatingProfit: { budget: rev.budget - cos.budget - opex.budget, actual: rev.actual - cos.actual - opex.actual },
    netProfit: { budget: rev.budget - cos.budget - opex.budget + other.budget, actual: rev.actual - cos.actual - opex.actual + other.actual },
  }
}

// ── Filters ──────────────────────────────────────────────────────────────────
export interface BvFilters {
  /** Free-text match against an account's code or name; empty = no filter. */
  accountKeyword: string
  /** Only show accounts whose actual overran their budget. */
  onlyExceeding: boolean
  /** Show accounts with no budget and no actual. */
  showZero: boolean
}
export function emptyBvFilters(): BvFilters { return { accountKeyword: '', onlyExceeding: false, showZero: true } }
