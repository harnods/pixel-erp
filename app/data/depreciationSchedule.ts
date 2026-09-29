/**
 * The depreciation schedule — FY2026 by period, both books.
 *
 * The register answers "what do we own"; the asset record answers "why is this
 * figure what it is". Neither answers the question the schedule exists for:
 * *when*. How much is booked each month, which months are closed, and what is
 * still coming.
 *
 * Rows are periods, not assets. Twelve rows read as a schedule at a glance,
 * where twenty-four asset rows for a single month read as a listing — and the
 * per-asset detail is still one expand away, which is where it belongs.
 *
 * Every figure is aggregated from `monthlySchedule()`, the same per-asset
 * arithmetic the asset record shows, so a period total and the rows behind it
 * can never disagree.
 */
import { fixedAssets, type FixedAsset } from './fixedAssets'
import { monthlySchedule, type ScheduleMonth } from './fixedAssetDetail'
import { CURRENT_MONTH, runFor } from './fixedAssetSession'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/** The one disposal in FY2026 — FA-0071, sold 15/08/2026. */
const DISPOSAL_MONTH = 7

/** One asset's contribution to a period — a roll-forward line. */
export interface PeriodAssetRow {
  asset: FixedAsset
  accounting: number | null
  tax: number | null
  /** Why a side is absent, when it is. Never rendered as a zero. */
  accountingAbsent?: string
  taxAbsent?: string
  /** What happened to this asset in this period, when something did. */
  event?: string
  /** Accumulated depreciation brought into the period. */
  openingAccumulated: number | null
  /** Accumulated after this period's charge. */
  closingAccumulated: number | null
  /** Cost less closing accumulated — what the asset is carried at afterwards. */
  closingBookValue: number | null
  /**
   * How the period's charge was measured. Only set where it is not the
   * ordinary case: a preparer checking a figure wants to know why it is a
   * part charge, and printing 'Full month' on twenty untroubled rows buries
   * the two that need reading.
   */
  convention?: string
}

/**
 * Where a period sits relative to today.
 *
 * `projected` is the honest label for a month whose charge is computed but not
 * yet incurred — calling it anything else would let a forecast be read as a
 * booked figure, which is the one confusion a forward-looking schedule can
 * cause. `posted` is read from the run record rather than from the calendar,
 * so posting a period actually changes what the row says.
 */
export type PeriodState = 'posted' | 'draft' | 'projected'

export interface SchedulePeriod {
  /** 0-based month index within 2026. */
  month: number
  /** 'September 2026'. */
  label: string
  /** 'Sep 2026' — for narrow columns. */
  short: string
  accounting: number
  /** Null when no asset in the period has a computable tax charge. */
  tax: number | null
  /** Accounting less tax, or null when tax could not be computed. */
  difference: number | null
  state: PeriodState
  /** How many assets carry a charge this period. */
  assetCount: number
  /** Acquisition cost of the assets held this period. */
  cost: number
  /** Accumulated depreciation across the register at the start of the period. */
  openingAccumulated: number
  /** Accumulated after this period's charge. */
  closingAccumulated: number
  /** What the register is carried at once the period is booked. */
  closingBookValue: number
  /** Assets with an accounting charge and no tax counterpart. */
  uncomputed: FixedAsset[]
  /** The per-asset breakdown behind the totals. */
  rows: PeriodAssetRow[]
}

/**
 * FY2026, month by month, aggregated across the whole register.
 *
 * The full twelve months: the reason to open a schedule is to see what is
 * coming, and a table that stops at the current period answers only half the
 * question. Future months carry state 'projected'.
 */
/**
 * How a period's charge was measured, when it is worth saying.
 *
 * Indonesian practice charges a full month in the month an asset enters
 * service — PSAK does not mandate day-proration and Pasal 11 works in whole
 * months — so the ordinary case needs no annotation. What a preparer actually
 * checks is the exception: the month an asset arrived, the month it left, the
 * month a basis was reset. Naming only those keeps the column scannable;
 * stamping 'Full month' on every untroubled row would bury them.
 */
function conventionFor(a: FixedAsset, r: ScheduleMonth, m: number): string | undefined {
  if (r.accounting === null) return undefined
  const [dd = '1', mm = '1', yyyy = '1970'] = a.acquired.split('/')
  const acquiredThisMonth = Number(yyyy) === 2026 && Number(mm) - 1 === m
  if (acquiredThisMonth) {
    return `Full month · in service from ${dd}/${mm}`
  }
  if (a.status === 'Impaired' && m === 6) return 'Recomputed over the remaining life'
  if (a.status === 'Disposed' && m === 7) return 'Full month · disposed 15/08'
  return undefined
}

/**
 * FY2026, month by month, aggregated across the whole register.
 *
 * The full twelve months: the reason to open a schedule is to see what is
 * coming, and a table that stops at the current period answers only half the
 * question. Future months carry state 'projected'.
 */
export function fy2026Schedule(): SchedulePeriod[] {
  // One pass per asset rather than per asset per month — monthlySchedule()
  // rebuilds an asset's whole run on every call.
  const perAsset = fixedAssets.map((a) => ({ asset: a, months: monthlySchedule(a, 12) }))

  /**
   * Accumulated depreciation carried into January 2026.
   *
   * Derived by subtracting the year's charges from the accumulated implied by
   * the 30/09 book value, so the roll-forward lands exactly on the figure the
   * register and the asset record already show rather than on a second
   * estimate of it.
   */
  const opening = new Map<string, number | null>()
  for (const { asset, months } of perAsset) {
    const chargedToSep = months
      .slice(0, CURRENT_MONTH + 1)
      .reduce((s, r) => s + (r.accounting ?? 0), 0)

    if (asset.bookValueCommercial !== null) {
      const accumAtSep = asset.cost - asset.bookValueCommercial
      opening.set(asset.id, accumAtSep - chargedToSep)
      continue
    }

    // A disposed asset has no book value — it is no longer held — but it still
    // charged depreciation up to the month it left, so it needs an opening
    // balance or the roll-forward will not add up. Derive it from the asset's
    // own life: months elapsed before January, at cost ÷ life.
    if (!asset.commercialLifeMonths) { opening.set(asset.id, null); continue }
    const [dd = '1', mm = '1', yyyy = '1970'] = asset.acquired.split('/')
    const acq = new Date(Number(yyyy), Number(mm) - 1, Number(dd))
    const monthsBefore = Math.max(0, (2026 - acq.getFullYear()) * 12 - acq.getMonth())
    const rate = asset.cost / asset.commercialLifeMonths
    opening.set(asset.id, Math.round(rate * monthsBefore))
  }

  // Running accumulated, advanced month by month as the map is built.
  const running = new Map<string, number | null>(opening)

  return MONTH_NAMES.map((name, m) => {
    const allRows: PeriodAssetRow[] = perAsset
      .map(({ asset, months }): PeriodAssetRow | null => {
        const r = months[m]
        if (!r) return null

        const open = running.get(asset.id) ?? null
        const close = open === null || r.accounting === null ? open : open + r.accounting
        running.set(asset.id, close)

        return {
          asset,
          accounting: r.accounting,
          tax: r.tax,
          accountingAbsent: r.accountingAbsent,
          taxAbsent: r.taxAbsent,
          event: r.event,
          openingAccumulated: open,
          closingAccumulated: close,
          closingBookValue: close === null ? null : asset.cost - close,
          convention: conventionFor(asset, r, m),
        }
      })
      .filter((r): r is PeriodAssetRow => r !== null)

    // The roll-forward covers the assets the register still holds at the end of
    // the period — including fully depreciated ones, which carry accumulated
    // depreciation and a book value in months they charge nothing. An asset
    // stays in until the month it is disposed, so b/f + charge = c/f holds on
    // every row; from the following month its cost and accumulated leave the
    // balance entirely, which is what derecognition means.
    const held = allRows.filter((r) => r.asset.status !== 'Disposed' || m <= DISPOSAL_MONTH)
    const cost = held.reduce((s, r) => s + r.asset.cost, 0)
    const openingAccumulated = held.reduce((s, r) => s + (r.openingAccumulated ?? 0), 0)
    const closingAccumulated = held.reduce((s, r) => s + (r.closingAccumulated ?? 0), 0)
    const closingBookValue = held.reduce((s, r) => s + (r.closingBookValue ?? 0), 0)

    // An asset that is not in service, disposed or past its life contributes
    // nothing and would pad the breakdown with rows that only say "nothing".
    const rows = allRows.filter((r) => r.accounting !== null || r.tax !== null)

    const accounting = rows.reduce((s, r) => s + (r.accounting ?? 0), 0)
    const taxRows = rows.filter((r) => r.tax !== null)
    const tax = taxRows.length ? taxRows.reduce((s, r) => s + (r.tax as number), 0) : null

    return {
      month: m,
      label: `${name} 2026`,
      short: `${MONTH_SHORT[m]} 2026`,
      accounting,
      tax,
      difference: tax === null ? null : accounting - tax,
      state: m > CURRENT_MONTH ? 'projected' : runFor(m) ? 'posted' : 'draft',
      assetCount: rows.filter((r) => r.accounting !== null).length,
      cost,
      openingAccumulated,
      closingAccumulated,
      closingBookValue,
      uncomputed: rows.filter((r) => r.accounting !== null && r.tax === null).map((r) => r.asset),
      rows,
    }
  })
}

/** The FY total, and the part of it already posted to the ledger. */
export function scheduleTotals(periods: SchedulePeriod[]) {
  const sum = (rows: SchedulePeriod[], pick: (p: SchedulePeriod) => number | null) => {
    const vals = rows.map(pick).filter((v): v is number => v !== null)
    return vals.length ? vals.reduce((s, v) => s + v, 0) : null
  }
  // "Booked" means a journal exists. A draft period is computed, not booked,
  // so counting it would report money in the ledger that is not there yet.
  const booked = periods.filter((p) => p.state === 'posted')
  return {
    year: { accounting: sum(periods, (p) => p.accounting), tax: sum(periods, (p) => p.tax) },
    booked: { accounting: sum(booked, (p) => p.accounting), tax: sum(booked, (p) => p.tax) },
    /** How many periods the booked figure covers, for its caption. */
    bookedThrough: booked.length ? booked[booked.length - 1]!.label : null,
  }
}

/**
 * The journal a period's run will post.
 *
 * Only the accounting charge reaches the ledger. Indonesian statutory
 * reporting is a computation on the commercial ledger rather than a parallel
 * one, so a tax line here would overstate depreciation expense with nothing
 * appearing out of balance — the tax figure is reported, never posted.
 *
 * Expense is split by asset class because that is how the chart of accounts
 * separates it; accumulated depreciation is credited the same way.
 */
export interface JournalLine {
  account: string
  description: string
  debit: number | null
  credit: number | null
}

const EXPENSE_ACCOUNT: Record<string, string> = {
  'Buildings': '6210 · Depreciation — buildings',
  'Production machinery': '6220 · Depreciation — machinery',
  'Vehicles': '6230 · Depreciation — vehicles',
  'IT equipment': '6240 · Depreciation — IT equipment',
  'Equipment': '6250 · Depreciation — equipment',
  'Furniture': '6260 · Depreciation — furniture',
  'Intangible assets': '6270 · Amortisation — intangibles',
}
const ACCUM_ACCOUNT: Record<string, string> = {
  'Buildings': '1610 · Accumulated depreciation — buildings',
  'Production machinery': '1620 · Accumulated depreciation — machinery',
  'Vehicles': '1630 · Accumulated depreciation — vehicles',
  'IT equipment': '1640 · Accumulated depreciation — IT equipment',
  'Equipment': '1650 · Accumulated depreciation — equipment',
  'Furniture': '1660 · Accumulated depreciation — furniture',
  'Intangible assets': '1670 · Accumulated amortisation — intangibles',
}

export function journalFor(period: SchedulePeriod): JournalLine[] {
  const byClass = new Map<string, number>()
  for (const r of period.rows) {
    if (r.accounting === null) continue
    byClass.set(r.asset.class, (byClass.get(r.asset.class) ?? 0) + r.accounting)
  }
  const classes = [...byClass.entries()].sort((a, b) => b[1] - a[1])

  const debits: JournalLine[] = classes.map(([cls, amount]) => ({
    account: EXPENSE_ACCOUNT[cls] ?? '6299 · Depreciation — other',
    description: cls,
    debit: amount,
    credit: null,
  }))
  const credits: JournalLine[] = classes.map(([cls, amount]) => ({
    account: ACCUM_ACCOUNT[cls] ?? '1699 · Accumulated depreciation — other',
    description: cls,
    debit: null,
    credit: amount,
  }))
  return [...debits, ...credits]
}

/** The next journal number in the FY2026 sequence. */
export function nextJournalNumber(existing: string[]): string {
  const highest = existing
    .map((j) => Number(j.split('-').at(-1)))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0)
  return `JV-2026-${String(highest + 123).padStart(4, '0')}`
}
