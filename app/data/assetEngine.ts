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
  /**
   * OD-38. The book's own cost where it differs from the asset's. A
   * right-of-use asset's tax book is the contract payments, deducted as they
   * fall due, not the discounted liability the accounts capitalise.
   */
  cost?: number
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
  /** Goodwill: PSAK 48 never allows its impairment to be reversed. */
  isGoodwill?: boolean
  /**
   * Set on a child created by a split (OD-32): the parent it came from. The
   * child is on the register from this event's period, not from the
   * in-service date it inherits, and its books open with the apportioned
   * accumulated position.
   */
  splitFrom?: string
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

/**
 * OD-13 and OD-14. A data-entry error: the acquisition cost was wrong. It
 * takes effect in an open period. What the posted periods charged on the
 * wrong cost is caught up in that period as a dated adjustment line, so no
 * posted period is edited (LR-4) and the schedule ends where the right cost
 * would have taken it.
 */
export interface CostCorrectionEvent extends EventBase {
  kind: 'cost-correction'
  /** The acquisition cost as it should have been recorded. */
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
  reversesEventId?: string
  testId?: string
}
/**
 * OD-32. The parent is split into children at the start of `period`: cost,
 * accumulated depreciation and impairment are apportioned on the same ratio
 * on both books, in this one event. The parent leaves the register; each
 * child carries on the parent's remaining life under its own ID.
 */
export interface SplitEvent extends EventBase {
  kind: 'split'
  /** Proportions sum to 1. */
  parts: { childId: string; proportion: number; name?: string }[]
}
/** OD-33. Disposes of a proportion; the remainder regenerates on both books. */
export interface PartialDisposalEvent extends EventBase {
  kind: 'partial-disposal'
  proportion: number
  proceeds: number
}
/**
 * OD-39. A lease modification remeasures the liability, and the right-of-use
 * asset moves by the same amount from the effective period (PSAK 73). The
 * asset's remaining schedule regenerates over the revised term; nothing
 * before the effective period moves. Accounting only: the tax deduction
 * follows the contract payments, not the right-of-use charge.
 */
export interface LeaseRemeasurementEvent extends EventBase {
  kind: 'lease-remeasurement'
  leaseId: string
  /** The change in the liability, and so in the asset's cost. Signed. */
  amount: number
  /** The change in the undiscounted payments still to fall due: the tax book's cost. */
  taxAmount?: number
  /** The revised lease term as the asset's new TOTAL life. */
  lifeMonths?: { accounting?: number; tax?: number }
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
  | LeaseRemeasurementEvent

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
    case 'acquisition': return e.splitFrom ? `Split from ${e.splitFrom} on ${e.date}` : `Entered service ${e.inServiceDate}`
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
    case 'cost-correction': return `Acquisition cost corrected to ${rupiah(e.correctedCost)} from ${periodLabel(e.period)}`
    case 'improvement': {
      const life = e.lifeMonths?.accounting ? `, life extended to ${formatLife(e.lifeMonths.accounting)}` : ''
      return `Improvement of ${rupiah(e.amount)} capitalised ${e.date}${life}`
    }
    case 'impairment-reversal': return `Impairment reversed ${e.date}, recoverable ${rupiah(e.recoverable)}`
    case 'split': return `Split into ${e.parts.map((x) => `${x.childId} (${pct(x.proportion)})`).join(', ')} from ${periodLabel(e.period)}`
    case 'partial-disposal': return `${pct(e.proportion)} disposed ${e.date} for ${rupiah(e.proceeds)}`
    case 'lease-remeasurement': {
      const term = e.lifeMonths?.accounting ? `, term now ${formatLife(e.lifeMonths.accounting)}` : ''
      return `Lease ${e.leaseId} remeasured from ${periodLabel(e.period)}: ${e.amount >= 0 ? 'up' : 'down'} ${rupiah(Math.abs(e.amount))}${term}`
    }
  }
}

/** A proportion as a percentage, to two decimals only where needed. */
export function pct(q: number): string {
  const v = Math.round(q * 10000) / 100
  return `${v.toLocaleString('id-ID')}%`
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
  /**
   * A catch-up in this period for charges already posted on a wrong cost
   * (OD-14). Posted with the period's run, shown as its own line.
   */
  adjustment?: number
  /** Accumulated derecognised at the end of this period by a partial disposal. */
  transferredOut?: number
  /** openingAccumulated + charge + adjustment + writeDown - transferredOut. */
  closingAccumulated: number
  /** The cost carried at the end of this period. */
  cost: number
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

export interface ReversalResult {
  eventId: string
  period: Period
  date: string
  carryingBefore: number
  recoverable: number
  /** What the asset would be carried at had it never been impaired (LR-3). */
  unimpaired: number
  /** recoverable less carrying: the recovery the test found. */
  uncapped: number
  /** unimpaired less carrying: the most PSAK 48 allows back. */
  cap: number
  applied: number
  capApplied: boolean
}

export interface PartialDisposalResult extends DisposalResult {
  proportion: number
}

export interface SplitResult {
  eventId: string
  period: Period
  date: string
  method: Method
  lifeMonths: number | null
  /** Accumulated brought to the split: the parent's position at the end of the prior period. */
  accumulated: number
  cost: number
  parts: { childId: string; proportion: number; cost: number; accumulated: number; residual: number }[]
}

export interface CorrectionResult {
  eventId: string
  period: Period
  previousCost: number
  correctedCost: number
  /** Charged in `period` for what the posted periods got wrong. Negative gives back. */
  catchUp: number
}

export interface BookLedger {
  assetId: string
  book: Book
  startPeriod: Period
  /** From when the asset is on the register: in service, or the split that created it. */
  registeredFrom: Period
  /** The cost from each period's end on. The first entry holds from the start. */
  costHistory: { from: Period; cost: number }[]
  bases: Basis[]
  versions: ScheduleVersion[]
  /** The schedule in force: each period taken from the version live in it. */
  live: ScheduleRow[]
  /** Write-downs on a book with no schedule rows (an indefinite-life asset). */
  offScheduleWriteDowns: { period: Period; amount: number; eventId: string }[]
  impairments: ImpairmentResult[]
  reversals: ReversalResult[]
  corrections: CorrectionResult[]
  partialDisposals: PartialDisposalResult[]
  disposal: DisposalResult | null
  split: SplitResult | null
}

export interface AssetLedger {
  id: string
  /** The cost now, after corrections, improvements and partial disposals. */
  cost: number
  /** The cost the acquisition recorded. */
  acquisitionCost: number
  inServiceDate: string
  startPeriod: Period
  /** On the register from this period: in service, or created by a split. */
  registeredFrom: Period
  taxGroup: string | null
  isGoodwill: boolean
  events: AssetEvent[]
  books: { accounting: BookLedger; tax: BookLedger | null }
  /** The period the asset was disposed of, if it has been. Held during it. */
  disposedIn: Period | null
  /** The period a split replaced it with its children. Not held during it. */
  splitIn: Period | null
  /** The parent, for a child of a split. */
  splitFrom: string | null
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

/**
 * Split a whole-rupiah total on a ratio so the parts add back to it exactly:
 * each part rounded down, the remaining rupiah to the largest remainders.
 */
export function apportion(total: number, weights: number[]): number[] {
  const sumW = weights.reduce((s, w) => s + w, 0)
  const raw = weights.map((w) => Math.round(((total * w) / sumW) * 1e6) / 1e6)
  const out = raw.map((r) => Math.floor(r))
  let rem = total - out.reduce((s, v) => s + v, 0)
  const order = raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f || a.i - b.i)
  for (let k = 0; rem > 0; k++, rem--) out[order[k % order.length]!.i]! += 1
  return out
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
      cost: b.cost,
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

/** Named in the refusal, because the reader needs the rule, not only the no. */
export const GOODWILL_REVERSAL_REFUSED =
  'PSAK 48 prohibits reversing an impairment of goodwill. The loss stays recognised.'

/** The cost carried at the end of `p`. */
export function costAt(b: Pick<BookLedger, 'costHistory'>, p: Period): number {
  let c = b.costHistory[0]!.cost
  for (const h of b.costHistory) if (!isAfter(h.from, p)) c = h.cost
  return c
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
  registeredFrom?: Period
  isGoodwill?: boolean
}

export function buildBook(input: BuildBookInput): BookLedger {
  const { assetId, book, setup, startPeriod, createdBy } = input
  let cost = input.cost
  const costHistory: BookLedger['costHistory'] = [{ from: setup.opening?.period ?? startPeriod, cost }]
  const bases: Basis[] = []
  const versions: ScheduleVersion[] = []
  const offScheduleWriteDowns: BookLedger['offScheduleWriteDowns'] = []
  const impairments: ImpairmentResult[] = []
  const reversals: ReversalResult[] = []
  const corrections: CorrectionResult[] = []
  const partialDisposals: PartialDisposalResult[] = []
  let disposal: DisposalResult | null = null
  let split: SplitResult | null = null

  function setCost(from: Period, c: number) {
    cost = c
    costHistory.push({ from, cost: c })
  }

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

  /**
   * A change at the end of period P: a write-down (negative for a reversal),
   * accumulated derecognised by a partial disposal, a new cost. The row for P
   * carries it and a new basis charges what is left from P + 1. With no
   * schedule to regenerate (an indefinite life, or a life already ended) the
   * carrying amount simply moves.
   */
  function endOfPeriodChange(e: AssetEvent, P: Period, o: { writeDown: number; transferredOut: number; costAfter: number; residualAfter: number }) {
    const prev = current()
    const rowP = liveRows(versions).find((r) => r.period === P) ?? null
    const accP = accumulatedThrough(P)
    const closing = accP + o.writeDown - o.transferredOut
    if (o.costAfter !== cost) setCost(P, o.costAfter)
    const hasFuture = liveRows(versions).some((r) => isAfter(r.period, P))
    if (prev.lifeMonths === null || (!rowP && !hasFuture)) {
      offScheduleWriteDowns.push({ period: P, amount: o.writeDown - o.transferredOut, eventId: e.id })
      return
    }
    const b = makeBasis({
      fromPeriod: addPeriods(P, 1),
      openingAccumulated: closing,
      residual: o.residualAfter,
      method: prev.method,
      lifeMonths: prev.lifeMonths,
      e,
    })
    const out = o.transferredOut ? { transferredOut: (rowP?.transferredOut ?? 0) + o.transferredOut } : {}
    const eventRow: ScheduleRow = rowP
      ? {
          ...rowP, ...out,
          writeDown: rowP.writeDown + o.writeDown,
          closingAccumulated: closing, cost, netBookValue: cost - closing,
          eventIds: [...rowP.eventIds, e.id],
        }
      : {
          period: P, openingAccumulated: accP, charge: 0, writeDown: o.writeDown, ...out,
          closingAccumulated: closing, cost, netBookValue: cost - closing,
          basisId: prev.id, eventIds: [e.id], adjustmentOnly: true,
        }
    pushVersion(e, P, [eventRow, ...rowsFor(b)])
  }

  /** Sum of what the live schedule charged through `p`, catch-ups included. */
  const chargedThrough = (rows: ScheduleRow[], p: Period) =>
    rows.filter((r) => !isAfter(r.period, p)).reduce((s, r) => s + r.charge + (r.adjustment ?? 0), 0)

  for (const e of mine) {
    if (disposal || split) break // nothing moves a book after derecognition
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
        const accP = accumulatedThrough(P)
        const carrying = cost - accP
        const loss = Math.max(0, carrying - e.recoverable)
        impairments.push({
          eventId: e.id, period: P, date: e.date, testId: e.testId,
          carryingBefore: carrying, recoverable: e.recoverable, loss,
        })
        if (loss === 0) break // a test that found nothing changes no basis
        endOfPeriodChange(e, P, {
          writeDown: loss, transferredOut: 0, costAfter: cost,
          residualAfter: Math.min(prev.residual, e.recoverable),
        })
        break
      }

      case 'impairment-reversal': {
        if (input.isGoodwill) throw new Error(GOODWILL_REVERSAL_REFUSED)
        const accP = accumulatedThrough(P)
        const carrying = cost - accP
        // The schedule the asset would have had absent every impairment,
        // replayed from the same log. This is why LR-3 keeps the basis.
        const unimpairedBook = buildBook({
          ...input,
          events: input.events.filter((x) => x.kind !== 'impairment' && x.kind !== 'impairment-reversal'),
        })
        const unimpaired = costAt(unimpairedBook, P) - (accumulatedAt(unimpairedBook, P) ?? 0)
        const uncapped = Math.max(0, e.recoverable - carrying)
        const cap = Math.max(0, unimpaired - carrying)
        const applied = Math.min(uncapped, cap)
        reversals.push({
          eventId: e.id, period: P, date: e.date, carryingBefore: carrying, recoverable: e.recoverable,
          unimpaired, uncapped, cap, applied, capApplied: cap < uncapped,
        })
        if (applied === 0) break
        const unimpairedBasis = basisInForce(unimpairedBook, addPeriods(P, 1))
        endOfPeriodChange(e, P, {
          writeDown: -applied, transferredOut: 0, costAfter: cost,
          residualAfter: Math.min(unimpairedBasis.residual, carrying + applied),
        })
        break
      }

      case 'cost-correction': {
        const prev = current()
        const prevP = addPeriods(P, -1)
        // The book as it would stand had the cost been right from the start,
        // with every earlier event except other corrections.
        const right = buildBook({
          ...input,
          cost: e.correctedCost,
          events: input.events.filter((x) => x.kind !== 'cost-correction' && isBefore(x.period, P)),
        })
        const catchUp = isBefore(prevP, startPeriod)
          ? 0
          : chargedThrough(right.live, prevP) - chargedThrough(liveRows(versions), prevP)
        const previousCost = cost
        setCost(P, costAt(right, prevP))
        corrections.push({ eventId: e.id, period: P, previousCost, correctedCost: cost, catchUp })
        const acc = accumulatedThrough(prevP)
        const b = makeBasis({
          fromPeriod: P, openingAccumulated: acc + catchUp,
          residual: prev.residual, method: prev.method, lifeMonths: prev.lifeMonths, e,
        })
        const rows = rowsFor(b)
        if (catchUp !== 0 && rows[0]) {
          rows[0] = { ...rows[0], openingAccumulated: acc, adjustment: catchUp }
        } else if (catchUp !== 0) {
          rows.unshift({
            period: P, openingAccumulated: acc, charge: 0, adjustment: catchUp, writeDown: 0,
            closingAccumulated: acc + catchUp, cost, netBookValue: cost - acc - catchUp,
            basisId: b.id, eventIds: [e.id], adjustmentOnly: true,
          })
        }
        if (rows[0]) rows[0] = { ...rows[0], eventIds: [...rows[0].eventIds.filter((x) => x !== e.id), e.id] }
        pushVersion(e, P, rows)
        break
      }

      case 'improvement':
      case 'lease-remeasurement': {
        const prev = current()
        const extended = book === 'accounting' ? e.lifeMonths?.accounting : e.lifeMonths?.tax
        const added = e.kind === 'lease-remeasurement' && book === 'tax' ? e.taxAmount ?? 0 : e.amount
        setCost(P, cost + added)
        const b = makeBasis({
          fromPeriod: P,
          openingAccumulated: accumulatedThrough(addPeriods(P, -1)),
          residual: prev.residual,
          method: prev.method,
          lifeMonths: extended ?? prev.lifeMonths,
          e,
        })
        pushVersion(e, P, rowsFor(b))
        break
      }

      case 'partial-disposal': {
        const prev = current()
        const accP = accumulatedThrough(P)
        const w = [e.proportion, 1 - e.proportion]
        // The split primitive: apportion on the ratio, then derecognise the
        // disposed part. The retained part is this same asset.
        const dCost = apportion(cost, w)[0]!
        const dAcc = apportion(accP, w)[0]!
        const dRes = apportion(prev.residual, w)[0]!
        partialDisposals.push({
          eventId: e.id, period: P, date: e.date, proportion: e.proportion, proceeds: e.proceeds,
          cost: dCost, accumulated: dAcc, carrying: dCost - dAcc, gainLoss: e.proceeds - (dCost - dAcc),
        })
        endOfPeriodChange(e, P, {
          writeDown: 0, transferredOut: dAcc, costAfter: cost - dCost, residualAfter: prev.residual - dRes,
        })
        break
      }

      case 'split': {
        const prev = current()
        const acc = accumulatedThrough(addPeriods(P, -1))
        const w = e.parts.map((x) => x.proportion)
        const costs = apportion(cost, w)
        const accs = apportion(acc, w)
        const res = apportion(prev.residual, w)
        split = {
          eventId: e.id, period: P, date: e.date, method: prev.method, lifeMonths: prev.lifeMonths,
          accumulated: acc, cost,
          parts: e.parts.map((x, i) => ({
            childId: x.childId, proportion: x.proportion, cost: costs[i]!, accumulated: accs[i]!, residual: res[i]!,
          })),
        }
        // The parent charges nothing from P: its children do.
        pushVersion(e, P, [])
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
    }
  }

  return {
    assetId,
    book,
    startPeriod,
    registeredFrom: input.registeredFrom ?? startPeriod,
    costHistory,
    bases,
    versions,
    live: liveRows(versions),
    offScheduleWriteDowns,
    impairments,
    reversals,
    corrections,
    partialDisposals,
    disposal,
    split,
  }
}

// ── Building an asset ───────────────────────────────────────────────────────

export function buildAssetLedger(assetId: string, events: AssetEvent[]): AssetLedger {
  const acq = events.find((e): e is AcquisitionEvent => e.kind === 'acquisition')
  if (!acq) throw new Error(`assetEngine: ${assetId} has no acquisition event`)
  const startPeriod = periodOfDate(acq.inServiceDate)
  const registeredFrom = acq.splitFrom ? acq.period : startPeriod
  const isGoodwill = !!acq.isGoodwill

  const accounting = buildBook({
    assetId, book: 'accounting', setup: acq.accounting, cost: acq.cost,
    startPeriod, createdBy: acq, events, registeredFrom, isGoodwill,
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
        assetId, book: 'tax', setup: { ...taxSetup, residual: 0 }, cost: taxSetup.cost ?? acq.cost,
        startPeriod, createdBy: taxCreatedBy, events, registeredFrom, isGoodwill,
      })
    : null

  return {
    id: assetId,
    cost: accounting.costHistory[accounting.costHistory.length - 1]!.cost,
    acquisitionCost: acq.cost,
    inServiceDate: acq.inServiceDate,
    startPeriod,
    registeredFrom,
    taxGroup: classification?.taxGroup ?? acq.taxGroup,
    isGoodwill,
    events: [...events],
    books: { accounting, tax },
    disposedIn: accounting.disposal?.period ?? null,
    splitIn: accounting.split?.period ?? null,
    splitFrom: acq.splitFrom ?? null,
  }
}

/**
 * The acquisitions that open each child of a split, from the parent's
 * apportioned position on both books. Each child keeps the parent's
 * in-service date, so its remaining life is the parent's remaining life.
 */
export function splitChildAcquisitions(parent: AssetLedger): AcquisitionEvent[] {
  const sa = parent.books.accounting.split
  if (!sa) return []
  const st = parent.books.tax?.split ?? null
  const e = parent.events.find((x) => x.id === sa.eventId)!
  return sa.parts.map((part, i): AcquisitionEvent => ({
    id: `${part.childId}-E1`,
    kind: 'acquisition',
    period: sa.period,
    date: sa.date,
    recordedBy: e.recordedBy,
    cost: part.cost,
    inServiceDate: parent.inServiceDate,
    accounting: {
      method: sa.method, lifeMonths: sa.lifeMonths, residual: part.residual,
      opening: { period: sa.period, accumulated: part.accumulated },
    },
    tax: st
      ? {
          method: st.method, lifeMonths: st.lifeMonths, residual: 0,
          opening: { period: st.period, accumulated: st.parts[i]!.accumulated },
        }
      : null,
    taxGroup: parent.taxGroup,
    isGoodwill: parent.isGoodwill,
    splitFrom: parent.id,
  }))
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

/** Held at the end of `p`: on the register by then, not yet disposed or split. */
export function isHeldAt(l: AssetLedger, p: Period): boolean {
  if (isBefore(p, l.registeredFrom)) return false
  if (l.splitIn && !isBefore(p, l.splitIn)) return false
  return !l.disposedIn || isBefore(p, l.disposedIn)
}

/**
 * On the register at some point during `p`, including the month it was
 * disposed of. A split takes effect at the start of its period, so the
 * parent is not held during it: its children are.
 */
export function isHeldDuring(l: AssetLedger, p: Period): boolean {
  if (isBefore(p, l.registeredFrom)) return false
  if (l.splitIn && !isBefore(p, l.splitIn)) return false
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
  return acc === null ? null : costAt(b, p) - acc
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
  if (isBefore(p, l.registeredFrom)) return { charge: null, absent: l.splitFrom ? 'Before the split' : 'Not in service', row: null }
  if (l.splitIn && !isBefore(p, l.splitIn)) return { charge: null, absent: 'Split', row: null }
  if (l.disposedIn && isAfter(p, l.disposedIn)) return { charge: null, absent: 'Disposed', row: null }
  const row = liveRowAt(b, p)
  // The period's charge includes a catch-up booked in it: both reach the run.
  if (row && (!row.adjustmentOnly || row.adjustment)) return { charge: row.charge + (row.adjustment ?? 0), row }
  if (basisInForce(b, p).lifeMonths === null) return { charge: null, absent: 'Not amortised', row }
  return { charge: null, absent: 'Life ended', row }
}

/** Sum of charges from `from` to `to` inclusive. Null when the book has no charge in the range. */
export function chargesBetween(l: AssetLedger, book: Book, from: Period, to: Period): number | null {
  const b = bookOf(l, book)
  if (!b) return null
  const rows = b.live.filter((r) => (!r.adjustmentOnly || r.adjustment) && !isBefore(r.period, from) && !isAfter(r.period, to))
  return rows.length ? rows.reduce((s, r) => s + r.charge + (r.adjustment ?? 0), 0) : null
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
  'impairment-reversal', 'split', 'partial-disposal', 'disposal', 'lease-remeasurement',
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
      if (r.openingAccumulated + r.charge + (r.adjustment ?? 0) + r.writeDown - (r.transferredOut ?? 0) !== r.closingAccumulated) issues.push(`${name} ${r.period}: row does not add up`)
      if (r.cost - r.closingAccumulated !== r.netBookValue) issues.push(`${name} ${r.period}: book value does not follow`)
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
    const cut = v.createdBy.kind === 'disposal' || v.createdBy.kind === 'split'
    check(v.rows, v.id, !cut)
  }
  check(b.live, `${l.id}/${b.book}/live`, !b.disposal && !b.split)
  // Each basis must charge exactly its depreciable amount over its own rows.
  for (const v of b.versions) {
    if (v.createdBy.kind === 'disposal' || v.createdBy.kind === 'split') continue
    for (const basis of b.bases) {
      // A version is checked against the basis it created; a row it carries
      // over from the basis before (the event month) belongs to that one.
      if (basis.cause.eventId !== v.createdBy.eventId) continue
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
