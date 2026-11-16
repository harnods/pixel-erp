/**
 * Schedules read forward: the full life of one asset (TS-04, OD-45) and the
 * register projected to a chosen horizon (OD-12). Pure reads of the engine;
 * nothing here is stored.
 */
import {
  buildAssetLedger, chargeAt, bookValueAt, addPeriods, isAfter, isBefore, periodLabel, periodShort, periodOfDate,
  type AssetLedger, type AcquisitionEvent, type Book, type Method, type Period,
} from './assetEngine'
import { ledgers, assetRecords, CURRENT_PERIOD, postedRunFor } from './assetStore'
import { STATUTORY_GROUPS } from './fixedAssets'

export interface LifeYear {
  year: number
  /** Months of the year with a charge on the accounting book. */
  months: number
  accounting: number | null
  tax: number | null
  accountingClosing: number | null
  taxClosing: number | null
  /** Already posted, partly posted, or all ahead. */
  state: 'posted' | 'open' | 'projected'
}

export interface LifeSchedule {
  years: LifeYear[]
  first: Period
  last: Period
  totals: { accounting: number | null; tax: number | null }
  /** The first full month's charge on each book. */
  monthly: { accounting: number | null; tax: number | null }
  /** Why a book has no schedule, when it has none. */
  accountingAbsent?: string
  taxAbsent?: string
}

const yearOf = (p: Period) => Number(p.slice(0, 4))

function lastRow(l: AssetLedger): Period {
  const periods = [l.books.accounting, l.books.tax]
    .flatMap((b) => (b ? b.live.map((r) => r.period) : []))
    .sort()
  return periods.at(-1) ?? l.startPeriod
}

/** One asset, year by year, from the year it enters service to the last charge on either book. */
export function lifeSchedule(l: AssetLedger): LifeSchedule {
  const first = l.registeredFrom
  const last = lastRow(l)
  const years: LifeYear[] = []
  const sum = (b: Book, from: Period, to: Period) => {
    const book = b === 'accounting' ? l.books.accounting : l.books.tax
    if (!book) return null
    const rows = book.live.filter((r) => !isBefore(r.period, from) && !isAfter(r.period, to))
    return rows.length ? rows.reduce((s, r) => s + r.charge + (r.adjustment ?? 0), 0) : null
  }
  for (let y = yearOf(first); y <= yearOf(last); y++) {
    const from = y === yearOf(first) ? first : `${y}-01`
    const to = y === yearOf(last) ? last : `${y}-12`
    const acc = sum('accounting', from, to)
    const accRows = l.books.accounting.live.filter((r) => !isBefore(r.period, from) && !isAfter(r.period, to) && !r.adjustmentOnly)
    const allPosted = !isAfter(to, CURRENT_PERIOD) && !!postedRunFor(to)
    years.push({
      year: y,
      months: accRows.length,
      accounting: acc,
      tax: sum('tax', from, to),
      accountingClosing: bookValueAt(l, 'accounting', to),
      taxClosing: l.books.tax ? bookValueAt(l, 'tax', to) : null,
      state: isAfter(from, CURRENT_PERIOD) ? 'projected' : allPosted || isBefore(to, '2026-01') ? 'posted' : 'open',
    })
  }
  const total = (b: Book) => {
    const vals = years.map((y) => (b === 'accounting' ? y.accounting : y.tax)).filter((v): v is number => v !== null)
    return vals.length ? vals.reduce((s, v) => s + v, 0) : null
  }
  const acc0 = chargeAt(l, 'accounting', l.startPeriod)
  const tax0 = chargeAt(l, 'tax', l.startPeriod)
  return {
    years, first, last,
    totals: { accounting: total('accounting'), tax: total('tax') },
    monthly: { accounting: acc0.charge, tax: tax0.charge },
    ...(l.books.accounting.live.length ? {} : { accountingAbsent: l.books.accounting.bases.at(-1)?.lifeMonths === null ? 'Not amortised' : 'No charge' }),
    ...(l.books.tax ? {} : { taxAbsent: 'No tax group' }),
  }
}

export interface NewAssetDraft {
  cost: number
  inServiceDate: string
  lifeMonths: number | null
  residual: number
  method: Method
  taxGroup: string | null
}

/**
 * TS-04. The schedule a new asset would have, on both books, for its whole
 * life, before anything is created. Built by the same engine from the same
 * acquisition event createAsset would record.
 */
export function previewNewAsset(d: NewAssetDraft): LifeSchedule & { ledger: AssetLedger } {
  const acq: AcquisitionEvent = {
    id: 'PREVIEW-E1', kind: 'acquisition', period: periodOfDate(d.inServiceDate), date: d.inServiceDate,
    recordedBy: 'preview', cost: d.cost, inServiceDate: d.inServiceDate,
    accounting: { method: d.method, lifeMonths: d.lifeMonths, residual: d.residual },
    tax: d.taxGroup && STATUTORY_GROUPS[d.taxGroup]
      ? { method: 'straight-line', lifeMonths: STATUTORY_GROUPS[d.taxGroup]!.lifeMonths, residual: 0 }
      : null,
    taxGroup: d.taxGroup,
  }
  const ledger = buildAssetLedger('PREVIEW', [acq])
  return { ...lifeSchedule(ledger), ledger }
}

// ── Forward projection (OD-12) ──────────────────────────────────────────────

export interface ProjectionMonth {
  period: Period
  label: string
  short: string
  accounting: number
  tax: number
  /** Assets with a charge on the accounting book that month. */
  assets: number
}

export const PROJECTION_HORIZONS = [12, 24, 36] as const

/**
 * The register's charge for each month after today, to `months` ahead, on
 * both books. It assumes nothing changes: no additions, no disposals. Assets
 * without a tax book add nothing to the tax column.
 */
export function projection(months: number, from: Period = CURRENT_PERIOD): ProjectionMonth[] {
  const recs = assetRecords.value
  return Array.from({ length: months }, (_, i) => {
    const p = addPeriods(from, i + 1)
    let accounting = 0, tax = 0, assets = 0
    for (const s of recs) {
      const l = ledgers.value[s.id]!
      const a = chargeAt(l, 'accounting', p).charge
      const t = chargeAt(l, 'tax', p).charge
      if (a) { accounting += a; assets += 1 }
      if (t) tax += t
    }
    return { period: p, label: periodLabel(p), short: periodShort(p), accounting, tax, assets }
  })
}
