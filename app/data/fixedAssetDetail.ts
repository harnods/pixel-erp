/**
 * Per-asset detail, read from the engine.
 *
 * Every figure on the asset record (book values, the schedule, the
 * derivation of any charge, the history) comes from the asset's ledger in
 * `assetStore.ts`, which replays its event log. Nothing is stored here, so a
 * posted period, an impairment or a tax group set on another screen shows on
 * this one straight away.
 *
 * The derivation is the point of the screen. A preparer asking "why is this
 * figure what it is" gets the arithmetic chain, not a number: opening basis,
 * method, life remaining, months, adjustments in or before the period,
 * resulting charge. That is what lets them stop keeping a parallel
 * spreadsheet.
 */
import {
  ledgerOf, findAsset as findInStore, runs, testsFor, postedRunFor, CURRENT_PERIOD, FY_START,
} from './assetStore'
import {
  derive, chargeAt, bookOf, eventLabel, periodLabel, periodShort, periodFromLabel,
  addPeriods, periodIndex, formatLife, plural, METHOD_LABEL, rupiah, periodEndDate, pct, isAfter,
  type Book, type Period, type ScheduleVersion, type AssetEvent, type Basis, type ScheduleRow,
} from './assetEngine'
import { TAX_RATE, type FixedAsset } from './fixedAssets'

export function findAsset(id: string): FixedAsset | undefined {
  return findInStore(id)
}

export interface DetailFigure {
  label: string
  value: number | null
  /** What this figure is and as of when. Read ABOVE the value. */
  caption: string
  /** Supporting detail read under the value: the accumulated behind a book
   *  value, the deferred tax behind a difference. */
  sub?: string
  /** Why it is absent, when it is. Never rendered as a zero. */
  absent?: string
}

/**
 * The headline figures on an asset record.
 *
 * Four columns, not six: cost, then each book as its own column carrying the
 * book value as the headline and the accumulated behind it, then the number
 * the module exists to produce.
 */
export function detailFigures(a: FixedAsset, p: Period = CURRENT_PERIOD): DetailFigure[] {
  const asOf = `at ${periodEndDate(p)}`
  // The book values are what the register carries (charges through the last
  // posted run), and the accumulated is derived from them so the two agree.
  const accAccum = a.bookValueCommercial === null ? null : a.cost - a.bookValueCommercial
  // A right-of-use asset's tax book is the lease payments, not the asset's
  // cost, so its tax accumulated runs from that base (FG-8.4).
  const lease = a.leaseId ? ledgerOf(a.id) : null
  const taxCost = lease?.books.tax?.costHistory.at(-1)?.cost ?? a.cost
  const taxAccum = a.bookValueFiscal === null ? null : taxCost - a.bookValueFiscal
  const disposed = a.status === 'Disposed' || a.status === 'Split'
  const gone = a.status === 'Split' ? 'Split' : 'Disposed'
  const l = ledgerOf(a.id)
  const adjusted = l && l.cost !== l.acquisitionCost

  const figures: DetailFigure[] = [
    {
      label: adjusted ? 'Cost' : 'Acquisition cost',
      value: a.cost,
      caption: `Acquired ${a.acquired}`,
      sub: adjusted ? `Originally ${fmt(l!.acquisitionCost)}` : undefined,
    },
  ]

  figures.push({
    label: 'Book value · accounting',
    value: a.bookValueCommercial,
    caption: a.commercialLifeMonths === null
      ? `Carried at cost ${asOf}`
      : `${lifeYears(a.commercialLifeMonths)} ${METHOD_LABEL[a.method].toLowerCase()} · ${asOf}`,
    sub: a.commercialLifeMonths === null
      ? 'Indefinite life · tested for impairment yearly'
      : accAccum === null
        ? undefined
        : `Accumulated ${fmt(accAccum)}`,
    absent: disposed ? gone : undefined,
  })

  figures.push({
    label: 'Book value · tax',
    value: a.bookValueFiscal,
    caption: a.taxGroup
      ? `${a.taxGroup}, ${lifeYears(a.fiscalLifeMonths)} · ${asOf}`
      : 'No tax group',
    sub: taxAccum === null ? undefined : `Accumulated ${fmt(taxAccum)}`,
    // Disposed and unclassified are different absences and must not share a
    // label: one means no longer held, the other means nothing to compute from.
    absent: disposed ? gone : a.taxGroup ? undefined : 'Not computed',
  })

  // The number the whole module exists to produce, on the module's one sign
  // convention: accounting charge less tax charge, to date. Positive means
  // the accounts have charged more and the correction adds it back; it is
  // the accounting accumulated less the tax accumulated (for an owned asset
  // that equals tax book value less accounting book value).
  const diff = accAccum !== null && taxAccum !== null ? accAccum - taxAccum : null
  const dt = diff === null ? 0 : Math.round(diff * TAX_RATE)
  figures.push({
    label: 'Cumulative difference',
    value: diff,
    caption: `Accounting less tax · ${asOf}`,
    sub: diff === null
      ? undefined
      : diff === 0
        ? 'No deferred tax'
        : `Deferred tax ${dt > 0 ? 'asset' : 'liability'} ${fmt(Math.abs(dt))} at ${Math.round(TAX_RATE * 100)}%`,
    absent: diff === null ? (disposed ? gone : 'Not computed') : undefined,
  })

  return figures
}

function lifeYears(months: number | null): string {
  if (months === null) return 'No life set'
  return formatLife(months)
}
function fmt(n: number): string {
  return rupiah(n)
}

// ── The three panes ─────────────────────────────────────────────────────────

export interface DetailPane {
  head: string
  /** Who maintains this pane. Access follows the pane, not the record. */
  owner: string
  fields: { k: string; v: string }[]
}

/**
 * The record splits by audience. General Affairs maintains the physical pane
 * without acquisition cost or book value being visible, which is what keeps
 * custody on one record instead of in a second register.
 */
export function detailPanes(a: FixedAsset): DetailPane[] {
  const panes: DetailPane[] = []

  // Intangibles have no physical presence, so the pane would be empty fields.
  if (a.type === 'Tangible') {
    panes.push({
      head: 'Physical details',
      owner: 'General Affairs',
      fields: [
        { k: 'Physical tag', v: a.tag ?? 'Not tagged' },
        { k: 'Location', v: a.location ?? 'Not recorded' },
        { k: 'Custodian', v: a.custodian ?? 'Unassigned' },
        { k: 'Branch', v: a.branch },
      ],
    })
  } else {
    panes.push({
      head: 'General',
      owner: 'Accounting Manager',
      fields: [
        { k: 'Statutory code', v: a.statutoryCode ?? 'Not set' },
        { k: 'Description', v: a.location ?? 'Not recorded' },
        { k: 'Branch', v: a.branch },
      ],
    })
  }

  panes.push({
    head: 'Tax',
    owner: 'Tax Manager',
    fields: [
      { k: 'Tax group', v: a.taxGroup ?? 'Not set' },
      { k: 'Tax life', v: a.taxGroup ? lifeYears(a.fiscalLifeMonths) : 'Not set' },
      { k: 'Statutory code', v: a.statutoryCode ?? 'Not set' },
      {
        k: 'In Lampiran 9',
        v: a.taxGroup ? `Yes · ${a.taxGroup}` : 'No · set a tax group first',
      },
    ],
  })

  panes.push({
    head: 'Accounting',
    owner: 'Accounting Manager',
    fields: [
      { k: 'Acquisition cost', v: fmt(a.cost) },
      { k: 'Acquired', v: a.acquired },
      { k: 'In service from', v: a.inServiceDate },
      { k: 'Residual value', v: fmt(a.residual) },
      {
        k: 'Useful life',
        v: a.commercialLifeMonths === null ? 'Indefinite · not amortised' : `${lifeYears(a.commercialLifeMonths)} · ${METHOD_LABEL[a.method].toLowerCase()}`,
      },
      { k: 'Asset class', v: a.class },
    ],
  })

  return panes
}

// ── Derivation ──────────────────────────────────────────────────────────────

export interface DerivationStep {
  label: string
  value: string
  /** True for the line that is the answer rather than an input to it. */
  isResult?: boolean
}

/**
 * How one period's charge was arrived at, on one book (OD-41).
 *
 * Read from the basis actually in force in that period and the schedule
 * version live in it, never recomputed from today's parameters: a figure
 * produced before a revision must still explain itself afterwards. Only
 * adjustments effective in or before the period are listed, so the June
 * impairment on FA-0068 cannot appear in its January derivation.
 */
export function derivation(a: FixedAsset, basis: Book, period = periodLabel(CURRENT_PERIOD)): DerivationStep[] {
  const p = periodFromLabel(period) ?? CURRENT_PERIOD
  const l = ledgerOf(a.id)!
  const d = derive(l, basis, p)

  if (basis === 'tax' && !l.books.tax) {
    return [
      { label: 'Tax group', value: 'Not set' },
      { label: `Charge for ${period}`, value: 'Not computed', isResult: true },
    ]
  }
  if (d.basis && d.basis.lifeMonths === null) {
    return [
      { label: 'Useful life', value: 'Indefinite' },
      { label: 'Reason', value: 'Indefinite life: not amortised, tested for impairment yearly' },
      ...d.adjustments.map((x) => ({ label: `Adjustment ${x.timing}`, value: x.label })),
      { label: `Charge for ${period}`, value: 'Not amortised', isResult: true },
    ]
  }
  if (d.charge === null || !d.basis) {
    return [
      ...d.adjustments.map((x) => ({ label: `Adjustment ${x.timing}`, value: x.label })),
      { label: `Charge for ${period}`, value: d.absent ?? 'Not computed', isResult: true },
    ]
  }

  const b = d.basis
  const steps: DerivationStep[] = [
    { label: 'Schedule version', value: `Version ${d.version?.number ?? 1} · ${b.cause.label}` },
    { label: 'Opening amount', value: b.openingAccumulated ? `${fmt(b.openingCarrying)} (cost ${fmt(b.cost)} less ${fmt(b.openingAccumulated)} accumulated)` : fmt(b.cost) },
    { label: 'Method', value: METHOD_LABEL[b.method] },
    { label: 'Life', value: `${lifeYears(b.lifeMonths)}${b.monthsElapsed ? `, ${plural(b.remainingMonths, 'month')} remaining from ${periodLabel(b.fromPeriod)}` : ''}` },
  ]
  if (basis === 'accounting') steps.push({ label: 'Residual value', value: fmt(b.residual) })
  steps.push({ label: 'Depreciable amount', value: `${fmt(b.depreciable)} over ${plural(b.remainingMonths, 'month')}` })
  steps.push({
    label: 'Period',
    value: `Month ${d.monthInBasis} of ${b.remainingMonths}${d.isFinalMonth ? ' · final month, includes rounding' : ''}`,
  })
  for (const x of d.adjustments) steps.push({ label: `Adjustment ${x.timing}`, value: x.label })
  if (d.row?.adjustment) {
    steps.push({ label: 'Monthly charge', value: fmt(d.row.charge) })
    steps.push({ label: 'Catch-up for posted periods', value: fmt(d.row.adjustment) })
  }
  steps.push({ label: `Charge for ${period}`, value: fmt(d.charge), isResult: true })
  return steps
}

// ── The asset's FY2026 schedule ─────────────────────────────────────────────

/**
 * The asset's own FY2026 schedule, month by month, read from the live
 * schedule on each book. Events are named on the row they happened in: the
 * month an asset entered service, the month an impairment reset the
 * accounting basis, the month a disposal ended both schedules.
 */
export interface ScheduleMonth {
  /** 'January 2026' ... 'September 2026'. */
  period: string
  /** Short form for a narrow column: 'Jan 2026'. */
  short: string
  accounting: number | null
  tax: number | null
  /** Why a side is absent this month, when it is. Never shown as a zero. */
  accountingAbsent?: string
  taxAbsent?: string
  /** What happened in this month, when something did. */
  event?: string
  /**
   * OD-42 / FG-2.3: the basis changed in this period, on one book or both.
   * A marked boundary, so two bases are never silently mixed.
   */
  basisMarker?: string
  /** Posted, open (not yet posted) or projected (after today). */
  state: 'posted' | 'open' | 'projected'
}

function rowEvent(e: AssetEvent): string {
  switch (e.kind) {
    case 'acquisition': return e.splitFrom ? `Split from ${e.splitFrom}` : 'Entered service'
    case 'impairment': return `Impaired ${e.date} · accounting only`
    case 'disposal': return `Disposed ${e.date}`
    case 'tax-classification': return `Tax group set to ${e.taxGroup}`
    default: return eventLabel(e)
  }
}

/** FY2026 January through the given number of months (9: to September). */
export function monthlySchedule(a: FixedAsset, months = 9): ScheduleMonth[] {
  const l = ledgerOf(a.id)!
  return Array.from({ length: months }, (_, m) => {
    const p = addPeriods(FY_START, m)
    const acc = chargeAt(l, 'accounting', p)
    const tax = chargeAt(l, 'tax', p)
    const events = l.events.filter((e) => (e.kind === 'acquisition' ? l.registeredFrom : e.period) === p)
    // A tax group set this session is recorded in the current period, but it
    // does not belong on a monthly charge row as if it changed that month.
    const named = events.filter((e) => e.kind !== 'tax-classification')
    const row: ScheduleMonth = {
      period: periodLabel(p),
      short: periodShort(p),
      accounting: acc.charge,
      tax: tax.charge,
      ...(acc.charge === null ? { accountingAbsent: acc.absent } : {}),
      ...(tax.charge === null ? { taxAbsent: tax.absent } : {}),
      ...(named.length ? { event: named.map(rowEvent).join(' · ') } : {}),
      ...basisMarkerAt(l.books.accounting.bases, l.books.tax?.bases ?? [], p),
      state: isAfter(p, CURRENT_PERIOD) ? 'projected' : postedRunFor(p) ? 'posted' : 'open',
    }
    return row
  })
}

function basisMarkerAt(acc: Basis[], tax: Basis[], p: Period): { basisMarker?: string } {
  // Several events can start a basis in one period; name every cause, in order.
  const started = (bs: Basis[]) => bs.filter((b) => b.fromPeriod === p && b.id !== 'B1')
  const a = started(acc)
  const t = started(tax)
  if (!a.length && !t.length) return {}
  const books = a.length && t.length ? 'both books' : a.length ? 'accounting' : 'tax'
  const causes = [...new Set([...a, ...t].map((b) => BASIS_CAUSE[b.cause.kind] ?? 'changed'))]
  return { basisMarker: `New basis, ${books}: ${causes.join(', then ')}` }
}

const BASIS_CAUSE: Partial<Record<AssetEvent['kind'], string>> = {
  'estimate-revision': 'estimate revised',
  'impairment': 'after the impairment',
  'impairment-reversal': 'after the reversal',
  'cost-correction': 'cost corrected',
  'improvement': 'improvement added',
  'partial-disposal': 'after the partial disposal',
}

/** A superseded or live version, with the basis that produced it, readable as it was. */
export interface VersionView {
  id: string
  number: number
  book: Book
  live: boolean
  label: string
  fromPeriod: string
  supersededFrom: string | null
  basis: { k: string; v: string }[]
  rows: (ScheduleRow & { label: string })[]
}

/**
 * Every version an asset's book has had, newest first. The superseded ones
 * stay readable with their basis (LR-3): the charge they would have made and
 * the carrying amount they would have reached, even after being replaced.
 */
export function versionViews(a: FixedAsset, book: Book): VersionView[] {
  const b = bookOf(ledgerOf(a.id)!, book)
  if (!b) return []
  return [...b.versions].reverse().map((v) => {
    const basis = b.bases.find((x) => x.cause.eventId === v.createdBy.eventId) ?? b.bases[0]!
    // The charge this basis makes: its own first row, not a row it carried over.
    const first = v.rows.find((r) => r.basisId === basis.id && !r.adjustmentOnly) ?? v.rows.find((r) => !r.adjustmentOnly)
    return {
      id: v.id, number: v.number, book, live: v.supersededFrom === null,
      label: v.createdBy.label,
      fromPeriod: periodLabel(v.fromPeriod),
      supersededFrom: v.supersededFrom ? periodLabel(v.supersededFrom) : null,
      basis: [
        { k: 'Cost', v: fmt(basis.cost) },
        { k: 'Opening book value', v: fmt(basis.openingCarrying) },
        { k: 'Method', v: METHOD_LABEL[basis.method] },
        { k: 'Life', v: basis.lifeMonths === null ? 'Indefinite' : `${formatLife(basis.lifeMonths)}, ${plural(basis.remainingMonths, 'month')} from ${periodLabel(basis.fromPeriod)}` },
        ...(book === 'accounting' ? [{ k: 'Residual value', v: fmt(basis.residual) }] : []),
        { k: 'Monthly charge', v: first ? fmt(first.charge) : 'None' },
      ],
      rows: v.rows.slice(0, 18).map((r) => ({ ...r, label: periodLabel(r.period) })),
    }
  })
}

/** The FY2026-to-date total under the monthly rows. */
export function scheduleTotal(rows: ScheduleMonth[]) {
  const sum = (pick: (r: ScheduleMonth) => number | null) => {
    const vals = rows.map(pick).filter((v): v is number => v !== null)
    return vals.length ? vals.reduce((s, v) => s + v, 0) : null
  }
  return { accounting: sum((r) => r.accounting), tax: sum((r) => r.tax) }
}

/**
 * Every schedule version an asset's book has had, oldest first. A superseded
 * version is kept with the basis that produced it (LR-3), so a figure from
 * before a revision can still be read as it was.
 */
export function scheduleVersions(a: FixedAsset, book: Book): ScheduleVersion[] {
  const b = bookOf(ledgerOf(a.id)!, book)
  return b ? b.versions : []
}

/** What has happened to this asset. Newest first, read from the event log. */
export function assetHistory(a: FixedAsset) {
  const l = ledgerOf(a.id)!
  type Row = { when: string; who: string; what: string; note: string | null; sort: number }
  const rows: Row[] = []
  const dateKey = (d: string) => {
    const [dd = '1', mm = '1', yyyy = '1970'] = d.split('/')
    return Number(yyyy) * 10000 + Number(mm) * 100 + Number(dd)
  }
  // The latest posted run that charged this asset, and any reversal after it.
  const charged = runs.value
    .filter((r) => r.state !== 'draft' && r.lines.some((x) => x.assetId === a.id))
    .sort((x, y) => periodIndex(y.period) - periodIndex(x.period))
  const latest = charged.find((r) => r.state === 'posted')
  if (latest) {
    rows.push({ when: latest.postedOn ?? '', who: 'System', what: `Depreciation posted for ${periodLabel(latest.period)} · ${latest.journal}`, note: null, sort: dateKey(periodEndDate(latest.period)) + 0.5 })
  }
  for (const r of charged.filter((x) => x.state === 'reversed')) {
    rows.push({ when: r.reversal?.on ?? '', who: 'Rizal Candra', what: `Depreciation for ${periodLabel(r.period)} reversed · ${r.reversal?.journal}`, note: `${r.journal} offset by a reversing journal`, sort: dateKey(periodEndDate(r.period)) + 0.6 })
  }
  const push = (x: Omit<Row, 'sort'>) => rows.push({ ...x, sort: dateKey(x.when) })
  for (const e of [...l.events].reverse()) {
    switch (e.kind) {
      case 'acquisition':
        if (e.splitFrom) {
          push({ when: e.date, who: e.recordedBy, what: `Created by the split of ${e.splitFrom}`, note: `Opened at ${fmt(e.cost)} cost, ${fmt(e.accounting.opening?.accumulated ?? 0)} accumulated` })
          break
        }
        if (e.taxGroup) {
          push({ when: e.date, who: e.recordedBy, what: `Tax group set to ${e.taxGroup}`, note: 'From the asset class default' })
        } else {
          push({ when: e.date, who: e.recordedBy, what: 'Created without a tax group', note: 'Excluded from tax reports until set' })
        }
        push({ when: e.date, who: e.recordedBy, what: 'Asset created', note: e.inServiceDate !== e.date ? `In service from ${e.inServiceDate}` : null })
        break
      case 'tax-classification':
        push({ when: e.date, who: e.recordedBy, what: `Tax group set to ${e.taxGroup}`, note: 'Tax book calculated from the in-service date' })
        break
      case 'impairment': {
        const r = l.books.accounting.impairments.find((i) => i.eventId === e.id)
        push({
          when: e.date, who: e.recordedBy,
          what: `Impairment of ${fmt(r?.loss ?? 0)} recognised${e.testId ? ` after test ${e.testId}` : ''}`,
          note: `Written down to ${fmt(e.recoverable)} from ${fmt(r?.carryingBefore ?? 0)}. Accounting book only`,
        })
        break
      }
      case 'impairment-reversal': {
        const r = l.books.accounting.reversals.find((x) => x.eventId === e.id)
        push({
          when: e.date, who: e.recordedBy,
          what: `Impairment reversal of ${fmt(r?.applied ?? 0)}${e.testId ? ` after test ${e.testId}` : ''}`,
          note: r ? `Recovery ${fmt(r.uncapped)}, capped at ${fmt(r.cap)} (book value without impairment ${fmt(r.unimpaired)}). ${r.capApplied ? 'Cap applied' : 'Applied in full'}. Accounting book only` : null,
        })
        break
      }
      case 'cost-correction': {
        const c = l.books.accounting.corrections.find((x) => x.eventId === e.id)
        push({
          when: e.date, who: e.recordedBy,
          what: `Cost corrected from ${fmt(c?.previousCost ?? 0)} to ${fmt(e.correctedCost)}, from ${periodLabel(e.period)}`,
          note: `${e.reason}.${c?.catchUp ? ` Catch-up of ${fmt(c.catchUp)} in ${periodLabel(e.period)} for posted periods.` : ''} Previous version kept.`,
        })
        break
      }
      case 'estimate-revision':
        push({ when: e.date, who: e.recordedBy, what: eventLabel(e), note: `${e.book === 'accounting' ? 'Accounting book only' : 'Tax book only'}. Posted periods unchanged, previous version kept` })
        break
      case 'improvement':
        push({ when: e.date, who: e.recordedBy, what: eventLabel(e), note: 'Added to this asset\'s cost on both books' })
        break
      case 'split':
        push({ when: e.date, who: e.recordedBy, what: eventLabel(e), note: 'Cost, accumulated depreciation and impairment apportioned on both books' })
        break
      case 'partial-disposal': {
        const dA = l.books.accounting.partialDisposals.find((x) => x.eventId === e.id)
        const dT = l.books.tax?.partialDisposals.find((x) => x.eventId === e.id)
        const gl = (n: number) => `${n >= 0 ? 'gain' : 'loss'} ${fmt(Math.abs(n))}`
        push({
          when: e.date, who: e.recordedBy, what: `${pct(e.proportion)} disposed for ${fmt(e.proceeds)}`,
          note: dA ? `Accounting ${gl(dA.gainLoss)}${dT ? `, tax ${gl(dT.gainLoss)}` : ''}. The remainder stays on this asset` : null,
        })
        break
      }
      case 'disposal': {
        const gA = l.books.accounting.disposal?.gainLoss ?? 0
        const gT = l.books.tax?.disposal?.gainLoss ?? null
        const gl = (n: number) => `${n >= 0 ? 'gain' : 'loss'} of ${fmt(Math.abs(n))}`
        push({
          when: e.date, who: e.recordedBy, what: `Disposed for ${fmt(e.proceeds)}`,
          note: gT === null ? `Accounting ${gl(gA)}` : `Accounting ${gl(gA)}, tax ${gl(gT)}`,
        })
        break
      }
    }
  }
  // LR-8 / FG3-AC1: every test on the asset, including one that found nothing.
  for (const t of testsFor(a.id)) {
    const what = t.outcome === 'Reversal'
      ? `Impairment test ${t.id}: value recovered`
      : `Impairment test ${t.id}: ${t.outcome === 'Impaired' ? 'impaired' : 'no impairment'}`
    push({
      when: t.date, who: t.author, what,
      note: `${t.indicator}. Book value ${fmt(t.carrying)}, recoverable ${fmt(t.recoverable)} (${t.basis}, ${t.source})`,
    })
  }
  // Newest first; the acquisition's two rows keep their logged order.
  return rows
    .map((r, i) => ({ r, i }))
    .sort((x, y) => y.r.sort - x.r.sort || x.i - y.i)
    .map(({ r: { sort: _s, ...rest } }) => rest)
}
