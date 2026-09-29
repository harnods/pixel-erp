/**
 * The fixed-asset computation engine. Pure functions, no Vue, no state.
 *
 * An asset is an append-only event log. Everything a screen shows about it
 * (book values, monthly charges, the derivation of a charge, gain or loss on
 * disposal, the schedule versions an event superseded) is computed by
 * replaying that log. Nothing here is stored as a figure.
 *
 * Two books per asset:
 *  - accounting: straight line or reducing balance, any life, a residual value,
 *    or an indefinite life (no schedule at all);
 *  - tax: straight line or declining balance with the life fixed by the
 *    statutory group (Pasal 11), residual always 0. No statutory group means
 *    no tax book at all, which is different from a tax book worth nothing.
 *
 * Conventions, decided once and applied to both books:
 *
 *  1. FULL-MONTH CONVENTION. An asset charges a full month in the month it
 *     enters service, whatever the day, and a full month in the month it is
 *     disposed. There is no day proration. This is what Indonesian practice
 *     does (PSAK does not mandate day-counting and Pasal 11 works in whole
 *     months), and it reproduces every book value in the approved design
 *     dataset exactly.
 *
 *  2. WHOLE RUPIAH, RESIDUE IN THE FINAL PERIOD (LR-7, FG2-AC2). Every period
 *     of a basis charges the same rounded amount and the last period takes
 *     whatever is left, so a schedule always sums to its depreciable base to
 *     the rupiah and no figure carries a decimal.
 *
 *  3. NON-DESTRUCTIVE REGENERATION (LR-3, OD-42). An event that changes the
 *     basis creates a new schedule version from its effective period forward.
 *     Periods before it are untouched, and the version it replaced is kept,
 *     readable, together with the basis that produced it.
 *
 *  4. EVENT TIMING. Some events take effect at the START of their period (an
 *     estimate revision, a correction, an improvement: the period's charge
 *     is already on the new basis). Others happen at the END of their period
 *     (an impairment write-down, a disposal: the period's charge is still on
 *     the old basis, and the event lands after it).
 */

// ── Periods ─────────────────────────────────────────────────────────────────

/** A calendar month, 'YYYY-MM'. */
export type Period = string

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function periodIndex(p: Period): number {
  const [y = '1970', m = '1'] = p.split('-')
  return Number(y) * 12 + (Number(m) - 1)
}
export function periodFromIndex(i: number): Period {
  const y = Math.floor(i / 12)
  const m = i - y * 12 + 1
  return `${y}-${String(m).padStart(2, '0')}`
}
export function addPeriods(p: Period, n: number): Period {
  return periodFromIndex(periodIndex(p) + n)
}
/** Whole months from `a` to `b`; 0 when they are the same month. */
export function monthsBetween(a: Period, b: Period): number {
  return periodIndex(b) - periodIndex(a)
}
export function isBefore(a: Period, b: Period): boolean {
  return periodIndex(a) < periodIndex(b)
}
export function isAfter(a: Period, b: Period): boolean {
  return periodIndex(a) > periodIndex(b)
}
/** dd/mm/yyyy, the register's date order, to the period it falls in. */
export function periodOfDate(d: string): Period {
  const [, mm = '1', yyyy = '1970'] = d.split('/')
  return `${yyyy}-${mm.padStart(2, '0')}`
}
/** 'September 2026'. */
export function periodLabel(p: Period): string {
  const i = periodIndex(p)
  return `${MONTH_NAMES[i % 12]} ${Math.floor(i / 12)}`
}
/** 'Sep 2026'. */
export function periodShort(p: Period): string {
  const i = periodIndex(p)
  return `${MONTH_NAMES[i % 12]!.slice(0, 3)} ${Math.floor(i / 12)}`
}
/** 'September 2026' back to '2026-09'. Returns null for anything else. */
export function periodFromLabel(label: string): Period | null {
  const [name, year] = label.split(' ')
  const m = MONTH_NAMES.indexOf(name ?? '')
  if (m < 0 || !year) return null
  return `${year}-${String(m + 1).padStart(2, '0')}`
}
/** The last day of the period, dd/mm/yyyy. */
export function periodEndDate(p: Period): string {
  const i = periodIndex(p)
  const y = Math.floor(i / 12)
  const m = i % 12
  const last = new Date(y, m + 1, 0).getDate()
  return `${String(last).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}/${y}`
}

/** 'Rp4.000.000'. Whole rupiah, as the engine computes it. */
export function rupiah(n: number): string {
  return (n < 0 ? '-Rp' : 'Rp') + Math.abs(n).toLocaleString('id-ID')
}

// ── Books and methods ───────────────────────────────────────────────────────

export type Book = 'accounting' | 'tax'
export type AccountingMethod = 'straight-line' | 'reducing-balance'
/** Pasal 11 permits only these two, and buildings only the first. */
export type TaxMethod = 'straight-line' | 'declining-balance'
export type Method = AccountingMethod | TaxMethod

export const METHOD_LABEL: Record<Method, string> = {
  'straight-line': 'Straight line',
  'reducing-balance': 'Reducing balance',
  'declining-balance': 'Declining balance',
}

/** How one book of an asset is set up when it is created. */
export interface BookSetup {
  method: Method
  /** Useful life in months. `null` is an indefinite life: no schedule at all. */
  lifeMonths: number | null
  /** TS-03. Accounting only; the tax book always carries 0. */
  residual: number
  /**
   * A migrated asset's opening position: depreciation already charged before
   * `period`, which is where this system takes over the schedule.
   */
  opening?: { period: Period; accumulated: number } | null
}

// ── Events ──────────────────────────────────────────────────────────────────

interface EventBase {
  id: string
  /** The effective period, YYYY-MM. */
  period: Period
  /** The event's own date, dd/mm/yyyy. */
  date: string
  recordedBy: string
}

export interface AcquisitionEvent extends EventBase {
  kind: 'acquisition'
  cost: number
  /** TS-02: the in-service date, separate from the acquisition date. */
  inServiceDate: string
  accounting: BookSetup
  /** Null when the asset arrives without a statutory group. */
  tax: BookSetup | null
  taxGroup: string | null
}

/** OD-02. Setting the statutory group creates the tax book, computed from in-service. */
export interface TaxClassificationEvent extends EventBase {
  kind: 'tax-classification'
  taxGroup: string
  tax: BookSetup
}

/** OD-18. A change in estimate: prospective, applied periods untouched. One book only. */
export interface EstimateRevisionEvent extends EventBase {
  kind: 'estimate-revision'
  book: Book
  /** New TOTAL useful life in months (not the remaining life). */
  lifeMonths?: number | null
  method?: Method
  residual?: number
}

/** OD-50. Accounting only: tax does not recognise an impairment until realised. */
export interface ImpairmentEvent extends EventBase {
  kind: 'impairment'
  recoverable: number
  testId?: string
}

export interface DisposalEvent extends EventBase {
  kind: 'disposal'
  proceeds: number
}

// The events below are typed now so the store and screens can be written
// against the full log. Their handling arrives in the next phase; replaying
// one before then throws rather than silently producing a wrong figure.

/** OD-13. A data-entry error: the cost was wrong. */
export interface CostCorrectionEvent extends EventBase {
  kind: 'cost-correction'
  correctedCost: number
  reason: string
}
/** OD-17. Added to the same asset's cost from its effective date. */
export interface ImprovementEvent extends EventBase {
  kind: 'improvement'
  amount: number
  /** When the improvement also extends the life, the new total life per book. */
  lifeMonths?: { accounting?: number; tax?: number }
}
/** OD-51. Capped at the unimpaired schedule's carrying amount. */
export interface ImpairmentReversalEvent extends EventBase {
  kind: 'impairment-reversal'
  recoverable: number
  reversesEventId: string
}
/** OD-32. Apportions cost, accumulated and impairment on one ratio, both books. */
export interface SplitEvent extends EventBase {
  kind: 'split'
  /** The proportion moved to the child, 0 to 1. */
  proportion: number
  childId: string
}
/** OD-33. Disposes of a proportion; the remainder regenerates on both books. */
export interface PartialDisposalEvent extends EventBase {
  kind: 'partial-disposal'
  proportion: number
  proceeds: number
}

export type AssetEvent =
  | AcquisitionEvent
  | TaxClassificationEvent
  | EstimateRevisionEvent
  | ImpairmentEvent
  | DisposalEvent
  | CostCorrectionEvent
  | ImprovementEvent
  | ImpairmentReversalEvent
  | SplitEvent
  | PartialDisposalEvent

export type EventKind = AssetEvent['kind']

/** Which books an event moves. */
export function booksAffected(e: AssetEvent): Book[] {
  switch (e.kind) {
    case 'acquisition': return e.tax ? ['accounting', 'tax'] : ['accounting']
    case 'tax-classification': return ['tax']
    case 'estimate-revision': return [e.book]
    case 'impairment':
    case 'impairment-reversal': return ['accounting']
    default: return ['accounting', 'tax']
  }
}

/** Whether an event applies before its period's charge or after it. */
export function eventTiming(e: AssetEvent): 'start' | 'end' {
  switch (e.kind) {
    case 'impairment':
    case 'impairment-reversal':
    case 'disposal':
    case 'partial-disposal':
    case 'split':
      return 'end'
    default:
      return 'start'
  }
}

/** Events in replay order: by period, start-of-period before end-of-period, then as logged. */
export function replayOrder(events: AssetEvent[]): AssetEvent[] {
  return events
    .map((e, i) => ({ e, i }))
    .sort((a, b) =>
      periodIndex(a.e.period) - periodIndex(b.e.period)
      || (eventTiming(a.e) === eventTiming(b.e) ? 0 : eventTiming(a.e) === 'start' ? -1 : 1)
      || a.i - b.i,
    )
    .map((x) => x.e)
}

/** A short, dated description of an event, for rows, history and derivations. */
export function eventLabel(e: AssetEvent): string {
  switch (e.kind) {
    case 'acquisition': return `Entered service ${e.inServiceDate}`
    case 'tax-classification': return `Statutory group set to ${e.taxGroup} on ${e.date}`
    case 'estimate-revision': {
      const parts: string[] = []
      if (e.lifeMonths !== undefined) parts.push(e.lifeMonths === null ? 'life made indefinite' : `life revised to ${formatLife(e.lifeMonths)}`)
      if (e.method) parts.push(`method changed to ${METHOD_LABEL[e.method].toLowerCase()}`)
      if (e.residual !== undefined) parts.push(`residual revised to ${rupiah(e.residual)}`)
      return `Estimate revised from ${periodLabel(e.period)}: ${parts.join(', ') || 'no change'}`
    }
    case 'impairment': return `Impaired ${e.date}, written down to ${rupiah(e.recoverable)}`
    case 'disposal': return `Disposed ${e.date} for ${rupiah(e.proceeds)}`
    case 'cost-correction': return `Cost corrected to ${rupiah(e.correctedCost)} on ${e.date}`
    case 'improvement': return `Improvement of ${rupiah(e.amount)} capitalised ${e.date}`
    case 'impairment-reversal': return `Impairment reversed ${e.date}`
    case 'split': return `Split ${Math.round(e.proportion * 100)}% to ${e.childId} on ${e.date}`
    case 'partial-disposal': return `${Math.round(e.proportion * 100)}% disposed ${e.date} for ${rupiah(e.proceeds)}`
  }
}

export function formatLife(months: number | null): string {
  if (months === null) return 'Indefinite'
  if (months % 12 === 0) return `${months / 12} years`
  return `${months} months`
}

// ── Bases, rows and versions ────────────────────────────────────────────────

/** The parameters a run of charges is computed from. Never edited once made. */
export interface Basis {
  /** 'B1', 'B2' … within one book of one asset. */
  id: string
  book: Book
  /** The first period charged on this basis. */
  fromPeriod: Period
  cost: number
  /** Accumulated depreciation and impairment brought into `fromPeriod`. */
  openingAccumulated: number
  /** cost less openingAccumulated. */
  openingCarrying: number
  residual: number
  method: Method
  /** Total useful life. Null is indefinite. */
  lifeMonths: number | null
  /** Months in service before `fromPeriod`. */
  monthsElapsed: number
  /** Months this basis charges over. 0 for an indefinite life. */
  remainingMonths: number
  /** openingCarrying less residual: what this basis must charge in full. */
  depreciable: number
  /** The event that produced this basis. */
  cause: { eventId: string; kind: EventKind; label: string; period: Period }
  /** FG-3.3: a revised life that had already ended charges the rest at once. */
  lifeEndedAtRevision?: boolean
}

export interface ScheduleRow {
  period: Period
  openingAccumulated: number
  /** Whole rupiah. The row exists only where a charge exists. */
  charge: number
  /** An impairment loss recognised at the end of this period, else 0. */
  writeDown: number
  /** openingAccumulated + charge + writeDown. */
  closingAccumulated: number
  /** cost less closingAccumulated. */
  netBookValue: number
  /** The basis that produced `charge`. */
  basisId: string
  /** Events that landed in this row. */
  eventIds: string[]
  /** An event row in a period with no charge (after the life ended). */
  adjustmentOnly?: boolean
}

export interface ScheduleVersion {
  /** 'FA-0068/accounting/v2'. */
  id: string
  number: number
  book: Book
  fromPeriod: Period
  createdBy: { eventId: string; kind: EventKind; label: string; period: Period }
  /** From `fromPeriod` to the end of life (or the disposal). */
  rows: ScheduleRow[]
  /** Set once a later event replaced this version from that period on. */
  supersededFrom: Period | null
  supersededBy: string | null
}

export interface ImpairmentResult {
  eventId: string
  period: Period
  date: string
  testId?: string
  carryingBefore: number
  recoverable: number
  /** 0 when the test found no impairment. */
  loss: number
}

export interface DisposalResult {
  eventId: string
  period: Period
  date: string
  proceeds: number
  cost: number
  /** Accumulated depreciation and impairment derecognised. */
  accumulated: number
  /** Carrying amount at disposal, after the disposal month's charge. */
  carrying: number
  /** Positive is a gain. */
  gainLoss: number
}

export interface BookLedger {
  assetId: string
  book: Book
  startPeriod: Period
  bases: Basis[]
  versions: ScheduleVersion[]
  /** The schedule in force: each period taken from the version live in it. */
  live: ScheduleRow[]
  /** Write-downs on a book with no schedule rows (an indefinite-life asset). */
  offScheduleWriteDowns: { period: Period; amount: number; eventId: string }[]
  impairments: ImpairmentResult[]
  disposal: DisposalResult | null
}

export interface AssetLedger {
  id: string
  cost: number
  inServiceDate: string
  startPeriod: Period
  taxGroup: string | null
  events: AssetEvent[]
  books: { accounting: BookLedger; tax: BookLedger | null }
  /** The period the asset left the register, if it has. */
  disposedIn: Period | null
}

// ── Charge arithmetic ───────────────────────────────────────────────────────

/**
 * Straight line over n months: a level whole-rupiah charge, with the residue
 * in the final month so the run sums to `depreciable` exactly.
 */
export function straightLineCharges(depreciable: number, months: number): number[] {
  if (months <= 0 || depreciable <= 0) return []
  let level = Math.round(depreciable / months)
  // Rounding up must never leave the final month negative.
  if (level * (months - 1) > depreciable) level = Math.floor(depreciable / months)
  const out = new Array<number>(months).fill(level)
  out[months - 1] = depreciable - level * (months - 1)
  return out
}

/**
 * Reducing (accounting) or declining (tax) balance at twice the straight-line
 * rate, which is also the Pasal 11 declining-balance rate for each group
 * (50%, 25%, 12.5%, 10%). The annual charge is computed on the balance at the
 * start of each calendar year and spread over its months; the final month
 * takes whatever remains above the residual, as Pasal 11 requires.
 */
function decliningCharges(b: Basis): number[] {
  const n = b.remainingMonths
  if (n <= 0 || b.depreciable <= 0 || !b.lifeMonths) return []
  const rate = 2 / (b.lifeMonths / 12)
  const out: number[] = []
  let carrying = b.openingCarrying
  let yearBase = carrying
  for (let k = 0; k < n; k++) {
    const p = addPeriods(b.fromPeriod, k)
    if (k === 0 || p.endsWith('-01')) yearBase = carrying
    const room = carrying - b.residual
    const c = k === n - 1 ? room : Math.max(0, Math.min(Math.round((yearBase * rate) / 12), room))
    out.push(c)
    carrying -= c
  }
  return out
}

export function chargesFor(b: Basis): number[] {
  if (b.method === 'straight-line') return straightLineCharges(b.depreciable, b.remainingMonths)
  return decliningCharges(b)
}

function rowsFor(b: Basis): ScheduleRow[] {
  let acc = b.openingAccumulated
  return chargesFor(b).map((charge, k) => {
    const open = acc
    acc += charge
    return {
      period: addPeriods(b.fromPeriod, k),
      openingAccumulated: open,
      charge,
      writeDown: 0,
      closingAccumulated: acc,
      netBookValue: b.cost - acc,
      basisId: b.id,
      eventIds: [],
    }
  })
}

// ── Building a book ─────────────────────────────────────────────────────────

/** The schedule in force: each version's rows up to where the next one starts. */
export function liveRows(versions: ScheduleVersion[]): ScheduleRow[] {
  const out: ScheduleRow[] = []
  versions.forEach((v, i) => {
    const next = versions[i + 1]
    for (const r of v.rows) {
      if (next && !isBefore(r.period, next.fromPeriod)) break
      out.push(r)
    }
  })
  return out
}

function notInThisPhase(kind: EventKind): Error {
  return new Error(`assetEngine: '${kind}' events are typed but not handled yet`)
}

interface BuildBookInput {
  assetId: string
  book: Book
  setup: BookSetup
  cost: number
  startPeriod: Period
  createdBy: AssetEvent
  /** Every later event, in any order; filtered to this book here. */
  events: AssetEvent[]
}

export function buildBook(input: BuildBookInput): BookLedger {
  const { assetId, book, setup, startPeriod, createdBy } = input
  const cost = input.cost
  const bases: Basis[] = []
  const versions: ScheduleVersion[] = []
  const offScheduleWriteDowns: BookLedger['offScheduleWriteDowns'] = []
  const impairments: ImpairmentResult[] = []
  let disposal: DisposalResult | null = null

  const cause = (e: AssetEvent) => ({ eventId: e.id, kind: e.kind, label: eventLabel(e), period: e.period })

  function makeBasis(p: {
    fromPeriod: Period; openingAccumulated: number; residual: number; method: Method
    lifeMonths: number | null; e: AssetEvent
  }): Basis {
    const monthsElapsed = Math.max(0, monthsBetween(startPeriod, p.fromPeriod))
    const residual = book === 'tax' ? 0 : p.residual
    const openingCarrying = cost - p.openingAccumulated
    const depreciable = Math.max(0, openingCarrying - residual)
    let remainingMonths = 0
    let lifeEndedAtRevision = false
    if (p.lifeMonths !== null && depreciable > 0) {
      remainingMonths = p.lifeMonths - monthsElapsed
      if (remainingMonths <= 0) {
        // Only a revision can land here: the whole remaining amount is
        // charged in the effective period, and the dialog says so first.
        remainingMonths = p.e.kind === 'acquisition' || p.e.kind === 'tax-classification' ? 0 : 1
        lifeEndedAtRevision = remainingMonths === 1
      }
    }
    const b: Basis = {
      id: `B${bases.length + 1}`,
      book,
      fromPeriod: p.fromPeriod,
      cost,
      openingAccumulated: p.openingAccumulated,
      openingCarrying,
      residual,
      method: p.method,
      lifeMonths: p.lifeMonths,
      monthsElapsed,
      remainingMonths,
      depreciable: p.lifeMonths === null ? 0 : depreciable,
      cause: cause(p.e),
      ...(lifeEndedAtRevision ? { lifeEndedAtRevision } : {}),
    }
    bases.push(b)
    return b
  }

  function pushVersion(e: AssetEvent, fromPeriod: Period, rows: ScheduleRow[]) {
    const prev = versions[versions.length - 1]
    const v: ScheduleVersion = {
      id: `${assetId}/${book}/v${versions.length + 1}`,
      number: versions.length + 1,
      book,
      fromPeriod,
      createdBy: cause(e),
      rows,
      supersededFrom: null,
      supersededBy: null,
    }
    if (prev) {
      prev.supersededFrom = fromPeriod
      prev.supersededBy = v.id
    }
    versions.push(v)
  }

  const current = () => bases[bases.length - 1]!
  const firstBasis = () => bases[0]!

  /** Accumulated depreciation and impairment at the end of `p`. */
  function accumulatedThrough(p: Period): number {
    let acc = firstBasis().openingAccumulated
    let last: Period | null = null
    for (const r of liveRows(versions)) {
      if (isAfter(r.period, p)) break
      acc = r.closingAccumulated
      last = r.period
    }
    for (const w of offScheduleWriteDowns) {
      if (!isAfter(w.period, p) && (last === null || isAfter(w.period, last))) acc += w.amount
    }
    return acc
  }

  // Basis 1, from the acquisition (or the migration cut-over).
  const b1 = makeBasis({
    fromPeriod: setup.opening?.period ?? startPeriod,
    openingAccumulated: setup.opening?.accumulated ?? 0,
    residual: setup.residual,
    method: setup.method,
    lifeMonths: setup.lifeMonths,
    e: createdBy,
  })
  pushVersion(createdBy, b1.fromPeriod, rowsFor(b1))

  const mine = replayOrder(input.events.filter((e) =>
    e.id !== createdBy.id
    && e.kind !== 'acquisition'
    && e.kind !== 'tax-classification'
    && booksAffected(e).includes(book),
  ))

  for (const e of mine) {
    if (disposal) break // nothing moves a book after derecognition
    // An event dated before the schedule starts takes effect at its start.
    const P = isBefore(e.period, startPeriod) ? startPeriod : e.period

    switch (e.kind) {
      case 'estimate-revision': {
        const prev = current()
        const b = makeBasis({
          fromPeriod: P,
          openingAccumulated: accumulatedThrough(addPeriods(P, -1)),
          residual: e.residual ?? prev.residual,
          method: e.method ?? prev.method,
          lifeMonths: e.lifeMonths !== undefined ? e.lifeMonths : prev.lifeMonths,
          e,
        })
        pushVersion(e, P, rowsFor(b))
        break
      }

      case 'impairment': {
        const prev = current()
        const rowP = liveRows(versions).find((r) => r.period === P) ?? null
        const accP = accumulatedThrough(P)
        const carrying = cost - accP
        const loss = Math.max(0, carrying - e.recoverable)
        impairments.push({
          eventId: e.id, period: P, date: e.date, testId: e.testId,
          carryingBefore: carrying, recoverable: e.recoverable, loss,
        })
        if (loss === 0) break // a test that found nothing changes no basis

        const hasFuture = liveRows(versions).some((r) => isAfter(r.period, P))
        if (prev.lifeMonths === null || (!rowP && !hasFuture)) {
          // No schedule to regenerate: the carrying amount simply falls.
          offScheduleWriteDowns.push({ period: P, amount: loss, eventId: e.id })
          break
        }
        const next = addPeriods(P, 1)
        const b = makeBasis({
          fromPeriod: next,
          openingAccumulated: accP + loss,
          residual: Math.min(prev.residual, e.recoverable),
          method: prev.method,
          lifeMonths: prev.lifeMonths,
          e,
        })
        const eventRow: ScheduleRow = rowP
          ? {
              ...rowP,
              writeDown: loss,
              closingAccumulated: rowP.closingAccumulated + loss,
              netBookValue: rowP.netBookValue - loss,
              eventIds: [...rowP.eventIds, e.id],
            }
          : {
              period: P, openingAccumulated: accP, charge: 0, writeDown: loss,
              closingAccumulated: accP + loss, netBookValue: cost - accP - loss,
              basisId: prev.id, eventIds: [e.id], adjustmentOnly: true,
            }
        pushVersion(e, P, [eventRow, ...rowsFor(b)])
        break
      }

      case 'disposal': {
        const rowP = liveRows(versions).find((r) => r.period === P) ?? null
        const accP = accumulatedThrough(P)
        disposal = {
          eventId: e.id, period: P, date: e.date, proceeds: e.proceeds, cost,
          accumulated: accP, carrying: cost - accP, gainLoss: e.proceeds - (cost - accP),
        }
        pushVersion(e, P, rowP ? [{ ...rowP, eventIds: [...rowP.eventIds, e.id] }] : [])
        break
      }

      case 'cost-correction':
      case 'improvement':
      case 'impairment-reversal':
      case 'split':
      case 'partial-disposal':
        throw notInThisPhase(e.kind)
    }
  }

  return {
    assetId,
    book,
    startPeriod,
    bases,
    versions,
    live: liveRows(versions),
    offScheduleWriteDowns,
    impairments,
    disposal,
  }
}

// ── Building an asset ───────────────────────────────────────────────────────

export function buildAssetLedger(assetId: string, events: AssetEvent[]): AssetLedger {
  const acq = events.find((e): e is AcquisitionEvent => e.kind === 'acquisition')
  if (!acq) throw new Error(`assetEngine: ${assetId} has no acquisition event`)
  const startPeriod = periodOfDate(acq.inServiceDate)

  const accounting = buildBook({
    assetId, book: 'accounting', setup: acq.accounting, cost: acq.cost,
    startPeriod, createdBy: acq, events,
  })

  // The tax book comes from the acquisition, or from a later classification
  // (OD-02). Either way it is computed from the in-service date, because the
  // tax return needs the whole year, not the months since someone noticed.
  const classification = [...events].reverse()
    .find((e): e is TaxClassificationEvent => e.kind === 'tax-classification')
  const taxSetup = classification?.tax ?? acq.tax
  const taxCreatedBy: AssetEvent = classification ?? acq
  const tax = taxSetup
    ? buildBook({
        assetId, book: 'tax', setup: { ...taxSetup, residual: 0 }, cost: acq.cost,
        startPeriod, createdBy: taxCreatedBy, events,
      })
    : null

  return {
    id: assetId,
    cost: acq.cost,
    inServiceDate: acq.inServiceDate,
    startPeriod,
    taxGroup: classification?.taxGroup ?? acq.taxGroup,
    events: [...events],
    books: { accounting, tax },
    disposedIn: accounting.disposal?.period ?? null,
  }
}

// ── Queries ─────────────────────────────────────────────────────────────────

export function bookOf(l: AssetLedger, book: Book): BookLedger | null {
  return book === 'accounting' ? l.books.accounting : l.books.tax
}

/** The live row for a period, or null. */
export function liveRowAt(b: BookLedger, p: Period): ScheduleRow | null {
  return b.live.find((r) => r.period === p) ?? null
}

/** The basis in force in a period: the latest one that had started by then. */
export function basisInForce(b: BookLedger, p: Period): Basis {
  let found = b.bases[0]!
  for (const x of b.bases) if (!isAfter(x.fromPeriod, p)) found = x
  return found
}

/** The schedule version a period's live row comes from. */
export function versionLiveAt(b: BookLedger, p: Period): ScheduleVersion | null {
  let found: ScheduleVersion | null = null
  for (const v of b.versions) if (!isAfter(v.fromPeriod, p)) found = v
  return found
}

/** Held at the end of `p`: in service by then and not yet disposed. */
export function isHeldAt(l: AssetLedger, p: Period): boolean {
  if (isBefore(p, l.startPeriod)) return false
  return !l.disposedIn || isBefore(p, l.disposedIn)
}

/** On the register at some point during `p`, including the month it left. */
export function isHeldDuring(l: AssetLedger, p: Period): boolean {
  if (isBefore(p, l.startPeriod)) return false
  return !l.disposedIn || !isAfter(p, l.disposedIn)
}

/** Accumulated depreciation and impairment at the end of `p`, or null before service. */
export function accumulatedAt(b: BookLedger, p: Period): number | null {
  if (isBefore(p, b.startPeriod) && !b.bases[0]?.openingAccumulated) {
    return isBefore(p, addPeriods(b.startPeriod, -1)) ? null : 0
  }
  let acc = b.bases[0]?.openingAccumulated ?? 0
  let last: Period | null = null
  for (const r of b.live) {
    if (isAfter(r.period, p)) break
    acc = r.closingAccumulated
    last = r.period
  }
  for (const w of b.offScheduleWriteDowns) {
    if (!isAfter(w.period, p) && (last === null || isAfter(w.period, last))) acc += w.amount
  }
  return acc
}

/**
 * Book value at the end of `p`. Null when the book does not exist (no
 * statutory group), before service, or once disposed: a disposed asset is no
 * longer held, which is different from being held at nothing.
 */
export function bookValueAt(l: AssetLedger, book: Book, p: Period): number | null {
  const b = bookOf(l, book)
  if (!b || !isHeldAt(l, p)) return null
  const acc = accumulatedAt(b, p)
  return acc === null ? null : l.cost - acc
}

export interface PeriodCharge {
  charge: number | null
  /** Why there is no charge, when there is not. Never shown as a zero. */
  absent?: string
  row: ScheduleRow | null
}

export function chargeAt(l: AssetLedger, book: Book, p: Period): PeriodCharge {
  const b = bookOf(l, book)
  if (!b) return { charge: null, absent: 'No statutory group', row: null }
  if (isBefore(p, l.startPeriod)) return { charge: null, absent: 'Not in service', row: null }
  if (l.disposedIn && isAfter(p, l.disposedIn)) return { charge: null, absent: 'Disposed', row: null }
  const row = liveRowAt(b, p)
  if (row && !row.adjustmentOnly) return { charge: row.charge, row }
  if (basisInForce(b, p).lifeMonths === null) return { charge: null, absent: 'Not amortised', row }
  return { charge: null, absent: 'Life ended', row }
}

/** Sum of charges from `from` to `to` inclusive. Null when the book has no charge in the range. */
export function chargesBetween(l: AssetLedger, book: Book, from: Period, to: Period): number | null {
  const b = bookOf(l, book)
  if (!b) return null
  const rows = b.live.filter((r) => !r.adjustmentOnly && !isBefore(r.period, from) && !isAfter(r.period, to))
  return rows.length ? rows.reduce((s, r) => s + r.charge, 0) : null
}

// ── Derivation (OD-41) ──────────────────────────────────────────────────────

export interface DerivationAdjustment {
  eventId: string
  kind: EventKind
  label: string
  period: Period
  timing: 'in this period' | 'before this period'
}

export interface Derivation {
  book: Book
  period: Period
  charge: number | null
  absent?: string
  /** The basis that produced this period's charge. */
  basis: Basis | null
  /** The schedule version this period's row is read from. */
  version: ScheduleVersion | null
  row: ScheduleRow | null
  /** 1-based month within the basis, and whether it is the final one. */
  monthInBasis: number | null
  isFinalMonth: boolean
  /** Value changes effective in or before this period, never after. */
  adjustments: DerivationAdjustment[]
}

const ADJUSTMENT_KINDS: EventKind[] = [
  'cost-correction', 'estimate-revision', 'improvement', 'impairment',
  'impairment-reversal', 'split', 'partial-disposal', 'disposal',
]

/**
 * How one period's charge on one book was arrived at: the basis actually in
 * force in that period, and only the adjustments effective in or before it.
 * A later event cannot appear here, by construction: the row is read from the
 * version that was live in the period, and adjustments are filtered by date.
 */
export function derive(l: AssetLedger, book: Book, p: Period): Derivation {
  const b = bookOf(l, book)
  const pc = chargeAt(l, book, p)
  const row = b ? liveRowAt(b, p) : null
  const basis = b && row ? b.bases.find((x) => x.id === row.basisId) ?? null : b ? basisInForce(b, p) : null
  const monthInBasis = basis && row ? monthsBetween(basis.fromPeriod, row.period) + 1 : null
  const adjustments: DerivationAdjustment[] = b
    ? l.events
        .filter((e) => ADJUSTMENT_KINDS.includes(e.kind) && booksAffected(e).includes(book) && !isAfter(e.period, p))
        .map((e) => ({
          eventId: e.id, kind: e.kind, label: eventLabel(e), period: e.period,
          timing: e.period === p ? 'in this period' as const : 'before this period' as const,
        }))
    : []
  return {
    book,
    period: p,
    charge: pc.charge,
    absent: pc.absent,
    basis,
    version: b ? versionLiveAt(b, p) : null,
    row,
    monthInBasis,
    isFinalMonth: !!(basis && monthInBasis !== null && monthInBasis === basis.remainingMonths),
    adjustments,
  }
}

// ── Integrity (LR-9 check 2) ────────────────────────────────────────────────

export interface IntegrityResult {
  ok: boolean
  issues: string[]
}

/**
 * Every version must chain (opening + charge + write-down = closing, each row
 * opening where the last closed), charge whole rupiah, and, unless a disposal
 * cut it short, run exactly down to its residual. The live schedule must do
 * the same against cost less residual.
 */
export function checkBookIntegrity(l: AssetLedger, b: BookLedger): IntegrityResult {
  const issues: string[] = []
  const check = (rows: ScheduleRow[], name: string, mustEnd: boolean) => {
    rows.forEach((r, i) => {
      if (!Number.isInteger(r.charge)) issues.push(`${name} ${r.period}: charge is not whole rupiah`)
      if (r.openingAccumulated + r.charge + r.writeDown !== r.closingAccumulated) issues.push(`${name} ${r.period}: row does not add up`)
      if (l.cost - r.closingAccumulated !== r.netBookValue) issues.push(`${name} ${r.period}: book value does not follow`)
      const prev = rows[i - 1]
      if (prev && prev.closingAccumulated !== r.openingAccumulated) issues.push(`${name} ${r.period}: chain broken`)
    })
    const last = rows[rows.length - 1]
    if (mustEnd && last) {
      const residual = b.bases.find((x) => x.id === last.basisId)?.residual ?? 0
      if (last.netBookValue !== residual) issues.push(`${name}: ends at ${last.netBookValue}, not at the residual ${residual}`)
    }
  }
  for (const v of b.versions) {
    const cutByDisposal = v.createdBy.kind === 'disposal' || v.createdBy.kind === 'partial-disposal'
    check(v.rows, v.id, !cutByDisposal)
  }
  check(b.live, `${l.id}/${b.book}/live`, !b.disposal)
  // Each basis must charge exactly its depreciable amount over its own rows.
  for (const v of b.versions) {
    if (v.createdBy.kind === 'disposal') continue
    for (const basis of b.bases) {
      const rows = v.rows.filter((r) => r.basisId === basis.id && !r.adjustmentOnly)
      if (!rows.length || rows[0]!.period !== basis.fromPeriod) continue
      const total = rows.reduce((s, r) => s + r.charge, 0)
      if (total !== basis.depreciable) issues.push(`${v.id} ${basis.id}: charges ${total}, base ${basis.depreciable}`)
    }
  }
  return { ok: issues.length === 0, issues }
}

/** Whether a book has any schedule to check. An indefinite life has none. */
export function hasSchedule(b: BookLedger): boolean {
  return b.versions.some((v) => v.rows.length > 0)
}
