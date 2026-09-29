/**
 * The depreciation schedule: FY2026 by period, both books.
 *
 * The register answers "what do we own"; the asset record answers "why is this
 * figure what it is". Neither answers the question the schedule exists for:
 * *when*. How much is booked each month, which months are closed, and what is
 * still coming.
 *
 * Every figure is aggregated from the live per-asset schedules in the engine,
 * the same rows the asset record shows, so a period total and the rows behind
 * it can never disagree. Whether a period is posted is read from the runs in
 * the store, so posting or reversing a period moves this screen.
 */
import {
  fixedAssets, ledgers, postedRunFor, draftRunFor, journalLinesFor, runLinesFor, peekJournalNumber,
  CURRENT_PERIOD, FY_START,
  type JournalLine,
} from './assetStore'
import {
  chargeAt, accumulatedAt, isHeldDuring, isAfter, addPeriods, periodLabel, periodShort, eventLabel, costAt,
} from './assetEngine'
import type { FixedAsset } from './fixedAssets'

export type { JournalLine }

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
 * How a period's charge was measured, when it is worth saying.
 *
 * The engine charges a full month in the month an asset enters service and
 * in the month it leaves (the full-month convention, see assetEngine.ts), so
 * the ordinary case needs no annotation. What a preparer checks is the
 * exception: the month an asset arrived, the month it left, the month a basis
 * was reset, the final month that takes the rounding residue.
 */
function conventionFor(a: FixedAsset, p: string): string | undefined {
  const l = ledgers.value[a.id]!
  const acc = l.books.accounting
  const row = acc.live.find((r) => r.period === p)
  if (!row || row.adjustmentOnly) return undefined
  const notes: string[] = []
  if (p === l.startPeriod) notes.push(`Full month · in service from ${l.inServiceDate.slice(0, 5)}`)
  const basis = acc.bases.find((b) => b.id === row.basisId)!
  if (basis.fromPeriod === p && basis.cause.kind !== 'acquisition') notes.push('Recomputed over the remaining life')
  if (basis.fromPeriod === p && l.splitFrom && basis.cause.kind === 'acquisition') notes.push(`Opened from the split of ${l.splitFrom}`)
  if (row.adjustment) notes.push(`Includes a catch-up of ${row.adjustment.toLocaleString('id-ID')} for posted periods`)
  if (acc.disposal?.period === p) notes.push(`Full month · disposed ${acc.disposal.date.slice(0, 5)}`)
  const last = acc.live.filter((r) => !r.adjustmentOnly).at(-1)
  if (last?.period === p && !acc.disposal) notes.push('Final month · takes the rounding residue')
  return notes.length ? notes.join(' · ') : undefined
}

/**
 * FY2026, month by month, aggregated across the whole register.
 *
 * The full twelve months: the reason to open a schedule is to see what is
 * coming, and a table that stops at the current period answers only half the
 * question. Future months carry state 'projected'.
 */
export function fy2026Schedule(): SchedulePeriod[] {
  const assets = fixedAssets.value
  return Array.from({ length: 12 }, (_, m) => {
    const p = addPeriods(FY_START, m)
    const prev = addPeriods(p, -1)
    const allRows: PeriodAssetRow[] = []
    for (const asset of assets) {
      const l = ledgers.value[asset.id]!
      if (!isHeldDuring(l, p)) continue
      const acc = chargeAt(l, 'accounting', p)
      const tax = chargeAt(l, 'tax', p)
      const open = accumulatedAt(l.books.accounting, prev) ?? 0
      const row = l.books.accounting.live.find((r) => r.period === p)
      // The roll-forward adds the period's charge only. A write-down in the
      // period sits in the closing balance on the asset record, and the
      // following period's opening picks it up.
      const close = row ? row.closingAccumulated : accumulatedAt(l.books.accounting, p) ?? open
      const events = l.events.filter((e) => (e.kind === 'acquisition' ? !!e.splitFrom : e.kind !== 'tax-classification') && e.period === p)
      allRows.push({
        asset,
        accounting: acc.charge,
        tax: tax.charge,
        ...(acc.charge === null ? { accountingAbsent: acc.absent } : {}),
        ...(tax.charge === null ? { taxAbsent: tax.absent } : {}),
        ...(p === l.startPeriod ? { event: 'Entered service' } : events.length ? { event: events.map(eventLabel).join(' · ') } : {}),
        openingAccumulated: open,
        closingAccumulated: close,
        closingBookValue: (row?.cost ?? costAt(l.books.accounting, p)) - close,
        convention: conventionFor(asset, p),
      })
    }

    // The roll-forward covers the assets the register holds during the
    // period, including fully depreciated ones, which carry accumulated
    // depreciation and a book value in months they charge nothing. An asset
    // stays in until the month it is disposed; from the following month its
    // cost and accumulated leave the balance, which is what derecognition means.
    const cost = allRows.reduce((s, r) => s + costAt(ledgers.value[r.asset.id]!.books.accounting, p), 0)
    const openingAccumulated = allRows.reduce((s, r) => s + (r.openingAccumulated ?? 0), 0)
    const closingAccumulated = allRows.reduce((s, r) => s + (r.closingAccumulated ?? 0), 0)
    const closingBookValue = allRows.reduce((s, r) => s + (r.closingBookValue ?? 0), 0)

    // An asset past its life or not amortised contributes nothing and would
    // pad the breakdown with rows that only say "nothing".
    const rows = allRows.filter((r) => r.accounting !== null || r.tax !== null)
    const accounting = rows.reduce((s, r) => s + (r.accounting ?? 0), 0)
    const taxRows = rows.filter((r) => r.tax !== null)
    const tax = taxRows.length ? taxRows.reduce((s, r) => s + (r.tax as number), 0) : null

    return {
      month: m,
      label: periodLabel(p),
      short: periodShort(p),
      accounting,
      tax,
      difference: tax === null ? null : accounting - tax,
      state: isAfter(p, CURRENT_PERIOD) ? 'projected' : postedRunFor(p) ? 'posted' : 'draft',
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
 * The journal a period's run will post: the accounting charge only (LR-2),
 * split by asset class because that is how the chart of accounts separates
 * it. Read from the generated draft when there is one, so the preview is
 * exactly what posting will write.
 */
export function journalFor(period: SchedulePeriod): JournalLine[] {
  const p = addPeriods(FY_START, period.month)
  const draft = draftRunFor(p)
  return journalLinesFor(draft ? draft.lines : runLinesFor(p))
}

/** The number the next journal will take. */
export function nextJournalNumber(_existing?: string[]): string {
  return peekJournalNumber()
}
