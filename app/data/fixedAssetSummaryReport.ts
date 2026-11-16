/**
 * Fixed asset summary report — Reports › Fixed assets › Fixed asset summary.
 * prod-parity: quickbook app/views/reports/fixed_asset_summary.html.haml
 *   (+ Reports::FixedAssetSummaryService, FixedAssetSummaryPresenter)
 *
 * Source: the prod-parity "Fixed assets (current)" module (currentAssets.ts) —
 * the same records the Asset list and asset detail pages show. Prod rules:
 *   • An asset is listed as of `End date` when it is active and acquired on or
 *     before that date, or disposed AFTER that date (it was still held then).
 *     Pending (draft) assets never appear.
 *   • Accumulated depreciation as of the date = opening (initial) depreciation
 *     when its cut-off date ≤ the date + every APPLIED period ending ≤ the date.
 *     Read straight off caHistoryOf(), the asset detail page's depreciation
 *     history, so the report agrees with what the user sees on each asset.
 *   • Book value = initial cost − accumulated depreciation.
 *   • Grouped by fixed asset account (sorted by account name), with a Total per
 *     account and a Total Fixed Asset grand total.
 */
import { MAPPING_COA } from './companySettings'
import { currentAssets, caHistoryOf, type CurrentAsset } from './currentAssets'

export interface FasRow {
  assetId: string
  number: string
  name: string
  acquisitionDate: string
  cost: number
  accumulated: number
  bookValue: number
  tags: string[]
  /** Disposed after the as-of date — still held on that date. */
  disposedLater: boolean
}

export interface FasGroup {
  accountCode: string
  accountName: string
  rows: FasRow[]
  subtotalCost: number
  subtotalAccumulated: number
  subtotalBookValue: number
}

export interface FasFilter {
  asOfIso: string
  /** account codes; empty = all */
  accounts: string[]
  /** asset ids; empty = all */
  assets: string[]
  /** tags; empty = all */
  tags: string[]
}

export interface FasReport {
  groups: FasGroup[]
  totalCost: number
  totalAccumulated: number
  totalBookValue: number
  assetCount: number
}

function accountName(code: string): string {
  return MAPPING_COA.find((a) => a.code === code)?.name ?? code
}

/** Accumulated depreciation as of a date — applied history only (prod parity). */
export function fasAccumulatedAsOf(a: CurrentAsset, iso: string): number {
  let acc = 0
  for (const h of caHistoryOf(a)) {
    if (h.kind === 'acquisition' || h.date > iso || h.accumulated === null) continue
    acc = h.accumulated
  }
  return acc
}

/** Assets the report can list at all (prod: status active or disposed, with an asset account). */
export function fasCandidateAssets(): CurrentAsset[] {
  return currentAssets.value.filter((a) => (a.status === 'active' || a.status === 'disposed') && !!a.assetAccount)
}

/** Fixed asset accounts that hold at least one reportable asset (filter options). */
export function fasAccountOptions(): { value: string; label: string }[] {
  const codes = [...new Set(fasCandidateAssets().map((a) => a.assetAccount!))]
  return codes
    .map((c) => ({ value: c, label: `(${c}) ${accountName(c)}` }))
    .sort((x, y) => accountName(x.value).localeCompare(accountName(y.value)))
}

export function fasTagOptions(): string[] {
  return [...new Set(fasCandidateAssets().flatMap((a) => a.tags))].sort()
}

export function fixedAssetSummaryReport(f: FasFilter): FasReport {
  const acc = new Set(f.accounts)
  const ids = new Set(f.assets)
  const tags = new Set(f.tags)
  const held = fasCandidateAssets().filter((a) => {
    if (a.acquisitionDate > f.asOfIso) return false
    if (a.status === 'disposed' && !(a.disposal && a.disposal.date > f.asOfIso)) return false
    if (acc.size && !acc.has(a.assetAccount!)) return false
    if (ids.size && !ids.has(a.id)) return false
    if (tags.size && !a.tags.some((t) => tags.has(t))) return false
    return true
  })
  const byAccount = new Map<string, FasRow[]>()
  for (const a of held) {
    const accumulated = fasAccumulatedAsOf(a, f.asOfIso)
    const row: FasRow = {
      assetId: a.id, number: a.number, name: a.name, acquisitionDate: a.acquisitionDate,
      cost: a.acquisitionCost, accumulated, bookValue: a.acquisitionCost - accumulated, tags: a.tags,
      disposedLater: a.status === 'disposed',
    }
    const arr = byAccount.get(a.assetAccount!) ?? []
    arr.push(row)
    byAccount.set(a.assetAccount!, arr)
  }
  const groups: FasGroup[] = [...byAccount.entries()]
    .map(([code, rows]) => {
      rows.sort((x, y) => x.name.localeCompare(y.name))
      return {
        accountCode: code, accountName: accountName(code), rows,
        subtotalCost: rows.reduce((s, r) => s + r.cost, 0),
        subtotalAccumulated: rows.reduce((s, r) => s + r.accumulated, 0),
        subtotalBookValue: rows.reduce((s, r) => s + r.bookValue, 0),
      }
    })
    .sort((x, y) => x.accountName.localeCompare(y.accountName))
  const report: FasReport = {
    groups,
    totalCost: groups.reduce((s, g) => s + g.subtotalCost, 0),
    totalAccumulated: groups.reduce((s, g) => s + g.subtotalAccumulated, 0),
    totalBookValue: groups.reduce((s, g) => s + g.subtotalBookValue, 0),
    assetCount: groups.reduce((s, g) => s + g.rows.length, 0),
  }
  if (import.meta.dev) assertFixedAssetSummary(report)
  return report
}

/** Dev-time arithmetic check: book value = cost − accumulated depreciation per row,
 *  per account and in total; subtotals = Σ rows; totals = Σ subtotals. */
export function assertFixedAssetSummary(r: FasReport): void {
  const fail = (m: string) => { throw new Error(`[fixedAssetSummaryReport] ${m}`) }
  for (const g of r.groups) {
    for (const x of g.rows) if (x.bookValue !== x.cost - x.accumulated) fail(`${x.number}: book value ≠ cost − accumulated`)
    if (g.subtotalCost !== g.rows.reduce((s, x) => s + x.cost, 0)) fail(`${g.accountCode}: cost subtotal ≠ Σ rows`)
    if (g.subtotalAccumulated !== g.rows.reduce((s, x) => s + x.accumulated, 0)) fail(`${g.accountCode}: acc. dep. subtotal ≠ Σ rows`)
    if (g.subtotalBookValue !== g.subtotalCost - g.subtotalAccumulated) fail(`${g.accountCode}: book value subtotal ≠ cost − acc. dep.`)
  }
  if (r.totalBookValue !== r.totalCost - r.totalAccumulated) fail('total book value ≠ total cost − total acc. dep.')
  if (r.totalBookValue !== r.groups.reduce((s, g) => s + g.subtotalBookValue, 0)) fail('total book value ≠ Σ account subtotals')
}
