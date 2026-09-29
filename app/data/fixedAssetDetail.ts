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
  ledgerOf, findAsset as findInStore, runs, CURRENT_PERIOD, FY_START,
} from './assetStore'
import {
  derive, chargeAt, bookOf, eventLabel, periodLabel, periodShort, periodFromLabel,
  addPeriods, periodIndex, formatLife, METHOD_LABEL, rupiah, periodEndDate,
  type Book, type Period, type ScheduleVersion, type AssetEvent,
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
  const taxAccum = a.bookValueFiscal === null ? null : a.cost - a.bookValueFiscal
  const disposed = a.status === 'Disposed'

  const figures: DetailFigure[] = [
    {
      label: 'Acquisition cost',
      value: a.cost,
      caption: `Both books · acquired ${a.acquired}`,
    },
  ]

  figures.push({
    label: 'Book value · accounting',
    value: a.bookValueCommercial,
    caption: a.commercialLifeMonths === null
      ? `Carried at cost ${asOf}`
      : `${lifeYears(a.commercialLifeMonths)} ${METHOD_LABEL[a.method].toLowerCase()} · ${asOf}`,
    sub: a.commercialLifeMonths === null
      ? 'Indefinite life, not amortised, tested for impairment'
      : accAccum === null
        ? undefined
        : `Accumulated ${fmt(accAccum)}`,
    absent: disposed ? 'Disposed' : undefined,
  })

  figures.push({
    label: 'Book value · tax',
    value: a.bookValueFiscal,
    caption: a.taxGroup
      ? `${a.taxGroup}, ${lifeYears(a.fiscalLifeMonths)} · ${asOf}`
      : 'No statutory group set',
    sub: taxAccum === null ? undefined : `Accumulated ${fmt(taxAccum)}`,
    // Disposed and unclassified are different absences and must not share a
    // label: one means no longer held, the other means nothing to compute from.
    absent: disposed ? 'Disposed' : a.taxGroup ? undefined : 'Not computed',
  })

  // The number the whole module exists to produce.
  const diff = a.bookValueFiscal !== null && a.bookValueCommercial !== null
    ? a.bookValueCommercial - a.bookValueFiscal
    : null
  figures.push({
    label: 'Cumulative difference',
    value: diff === null ? null : Math.abs(diff),
    caption: `Accounting less tax · ${asOf}`,
    sub: diff === null
      ? undefined
      : `Deferred tax ${fmt(Math.round(Math.abs(diff) * TAX_RATE))} at ${Math.round(TAX_RATE * 100)}%`,
    absent: diff === null ? (disposed ? 'Disposed' : 'Needs both books') : undefined,
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
      head: 'Physical identity',
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
      head: 'Identity',
      owner: 'Accounting Manager',
      fields: [
        { k: 'Statutory code', v: a.statutoryCode ?? 'Not set' },
        { k: 'Nature', v: a.location ?? 'Not recorded' },
        { k: 'Branch', v: a.branch },
      ],
    })
  }

  panes.push({
    head: 'Tax parameters',
    owner: 'Tax Manager',
    fields: [
      { k: 'Statutory group', v: a.taxGroup ?? 'Not set' },
      { k: 'Tax life', v: a.taxGroup ? lifeYears(a.fiscalLifeMonths) : 'Not set' },
      { k: 'Statutory code', v: a.statutoryCode ?? 'Not set' },
      {
        k: 'In the statutory filing',
        v: a.taxGroup ? `Yes, ${a.taxGroup} line` : 'No, excluded until classified',
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
        v: a.commercialLifeMonths === null ? 'Indefinite, not amortised' : `${lifeYears(a.commercialLifeMonths)} · ${METHOD_LABEL[a.method].toLowerCase()}`,
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
      { label: 'Statutory group', value: 'Not set' },
      { label: 'Why there is no charge', value: 'Without a statutory group there is no life and no rate, so nothing can be computed.' },
      { label: `Charge for ${period}`, value: 'Not computed', isResult: true },
    ]
  }
  if (d.basis && d.basis.lifeMonths === null) {
    return [
      { label: 'Useful life', value: 'Indefinite' },
      { label: 'Why there is no charge', value: 'An indefinite-life asset is not amortised. It is tested for impairment annually instead.' },
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
    { label: 'Schedule version', value: `v${d.version?.number ?? 1} · ${b.cause.label}` },
    { label: 'Opening basis', value: b.openingAccumulated ? `${fmt(b.openingCarrying)} carrying (${fmt(b.cost)} cost less ${fmt(b.openingAccumulated)})` : fmt(b.cost) },
    { label: 'Method', value: METHOD_LABEL[b.method] },
    { label: 'Life', value: `${lifeYears(b.lifeMonths)}${b.monthsElapsed ? `, ${b.remainingMonths} months remaining from ${periodLabel(b.fromPeriod)}` : ''}` },
  ]
  if (basis === 'accounting') steps.push({ label: 'Residual value', value: fmt(b.residual) })
  steps.push({ label: 'To depreciate on this basis', value: `${fmt(b.depreciable)} over ${b.remainingMonths} months` })
  steps.push({
    label: 'Period',
    value: `Month ${d.monthInBasis} of ${b.remainingMonths}, full month${d.isFinalMonth ? ', final month takes the rounding residue' : ''}`,
  })
  for (const x of d.adjustments) steps.push({ label: `Adjustment ${x.timing}`, value: x.label })
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
}

function rowEvent(e: AssetEvent): string {
  switch (e.kind) {
    case 'acquisition': return 'Entered service'
    case 'impairment': return `Impaired ${e.date}, accounting basis reset`
    case 'disposal': return `Disposed ${e.date}`
    case 'tax-classification': return `Statutory group set to ${e.taxGroup}`
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
    const events = l.events.filter((e) => (e.kind === 'acquisition' ? l.startPeriod : e.period) === p)
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
    }
    return row
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
    rows.push({ when: r.reversal?.on ?? '', who: 'Rizal Candra', what: `Depreciation for ${periodLabel(r.period)} reversed · ${r.reversal?.journal}`, note: `${r.journal} kept, reversed by a second journal`, sort: dateKey(periodEndDate(r.period)) + 0.6 })
  }
  const push = (x: Omit<Row, 'sort'>) => rows.push({ ...x, sort: dateKey(x.when) })
  for (const e of [...l.events].reverse()) {
    switch (e.kind) {
      case 'acquisition':
        if (e.taxGroup) {
          push({ when: e.date, who: e.recordedBy, what: `Statutory group set to ${e.taxGroup}`, note: 'Applied from the asset class default' })
        } else {
          push({ when: e.date, who: e.recordedBy, what: 'Created without a statutory group', note: 'Blocks every tax output until set' })
        }
        push({ when: e.date, who: e.recordedBy, what: 'Asset created', note: e.inServiceDate !== e.date ? `In service from ${e.inServiceDate}` : null })
        break
      case 'tax-classification':
        push({ when: e.date, who: e.recordedBy, what: `Statutory group set to ${e.taxGroup}`, note: 'Tax book computed from the in-service date' })
        break
      case 'impairment':
        push({ when: e.date, who: e.recordedBy, what: 'Impairment recognised after a test', note: 'Accounting only, tax does not recognise it until realised' })
        break
      case 'disposal': {
        const gA = l.books.accounting.disposal?.gainLoss ?? 0
        const gT = l.books.tax?.disposal?.gainLoss ?? null
        const word = (n: number) => (n >= 0 ? 'Gain' : 'Loss')
        push({
          when: e.date, who: e.recordedBy, what: 'Disposed',
          note: gT === null ? `${word(gA)} on the accounting basis` : `${word(gA)} on the accounting basis, ${word(gT).toLowerCase()} on the tax basis`,
        })
        break
      }
      default:
        push({ when: e.date, who: e.recordedBy, what: eventLabel(e), note: null })
    }
  }
  // Newest first; the acquisition's two rows keep their logged order.
  return rows
    .map((r, i) => ({ r, i }))
    .sort((x, y) => y.r.sort - x.r.sort || x.i - y.i)
    .map(({ r: { sort: _s, ...rest } }) => rest)
}
