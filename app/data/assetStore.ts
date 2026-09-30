/**
 * The asset module's session state: the single source of truth every asset
 * screen reads.
 *
 * Module-level reactive state, seeded from `fixedAssets.ts` when the module
 * loads. Nothing persists: a reload returns to the sample data, which is
 * enough to try the flows and see that they connect.
 *
 * What lives here:
 *  - each asset's append-only event log (the engine replays it);
 *  - the depreciation runs per period (posted, draft, reversed);
 *  - the general ledger journals the asset module has posted, which is what
 *    the self-check reconciles the register against;
 *  - impairment tests and the retained self-check result per period.
 *
 * Everything else, every book value, charge, total, difference and gain or
 * loss, is computed from that state on read.
 */
import { ref, computed, watch } from 'vue'
import {
  type AssetEvent, type AssetLedger, type Book, type BookSetup, type Period,
  type AcquisitionEvent, type ImpairmentEvent, type DisposalEvent, type TaxClassificationEvent,
  type Method,
  buildAssetLedger, bookOf, bookValueAt, accumulatedAt, chargeAt, chargesBetween,
  isHeldAt, isHeldDuring, periodOfDate, periodEndDate, periodIndex, periodFromIndex,
  addPeriods, isAfter, isBefore, checkBookIntegrity, hasSchedule, costAt,
  splitChildAcquisitions, GOODWILL_REVERSAL_REFUSED,
  periodLabel, rupiah,
} from './assetEngine'
import {
  assetSeeds, STATUTORY_GROUPS, TAX_RATE,
  type AssetSeed, type FixedAsset, type AssetStatus,
} from './fixedAssets'
import { journalDateFor, resetAssetPolicy } from './assetPolicy'

// ── Calendar ────────────────────────────────────────────────────────────────

/** The fiscal year the sample company is in. */
export const FY_START: Period = '2026-01'
export const FY_END: Period = '2026-12'
/** "Today": September 2026, closing 30/09/2026. */
export const CURRENT_PERIOD: Period = '2026-09'
/** 0-based month of the current period within FY2026. */
export const CURRENT_MONTH = periodIndex(CURRENT_PERIOD) - periodIndex(FY_START)
/** The FY2026 periods, January to December. */
export const FY_PERIODS: Period[] = Array.from({ length: 12 }, (_, i) => addPeriods(FY_START, i))

export function periodOfMonth(month: number): Period {
  return addPeriods(FY_START, month)
}
export function monthOfPeriod(p: Period): number {
  return periodIndex(p) - periodIndex(FY_START)
}

// ── Who is looking (simulated roles) ────────────────────────────────────────

/**
 * The prototype has no real sign-in. "View as" switches the audience the
 * screens are drawn for, so the pane scoping (LR-6) and the approver being a
 * different person from the requester can be tried by hand. Session only.
 */
export type ViewAsRole = 'Owner' | 'Accounting' | 'Tax' | 'General Affairs' | 'Approver'
export const VIEW_AS_ROLES: { role: ViewAsRole; person: string; title: string }[] = [
  { role: 'Owner', person: 'Rizal Candra', title: 'Owner' },
  { role: 'Accounting', person: 'Sari Wulandari', title: 'Accounting Manager' },
  { role: 'Tax', person: 'Dewi Kartika', title: 'Tax Manager' },
  { role: 'General Affairs', person: 'Rudi Santoso', title: 'General Affairs' },
  { role: 'Approver', person: 'Fitri Handayani', title: 'Finance Director' },
]
export const viewAs = ref<ViewAsRole>('Owner')
export function setViewAs(r: ViewAsRole) { viewAs.value = r }
/** The person acting now, who is recorded against anything they do. */
export const actingUser = computed(() => VIEW_AS_ROLES.find((x) => x.role === viewAs.value)!.person)
/** LR-6: General Affairs maintains custody without financial values visible. */
export const canSeeFinancials = computed(() => viewAs.value !== 'General Affairs')
/** FG-3.6: value changes are recorded by the Owner or the accounting role. */
export const canChangeValue = computed(() => viewAs.value === 'Owner' || viewAs.value === 'Accounting')

// ── The register's records ──────────────────────────────────────────────────

/**
 * The records on the register: the sample assets, plus any created this
 * session, plus the children of a split. Only their identity lives here;
 * every figure comes from the event log.
 */
export const assetRecords = ref<AssetSeed[]>([...assetSeeds])
const recordById = (id: string) => assetRecords.value.find((s) => s.id === id)

function nextAssetId(): string {
  const n = Math.max(...assetRecords.value.map((a) => Number(a.id.replace(/\D/g, '')) || 0)) + 1
  return `FA-${String(n).padStart(4, '0')}`
}

// ── Seeding the event logs ──────────────────────────────────────────────────

function taxSetupFor(group: string, lifeMonths?: number | null): BookSetup {
  return {
    method: 'straight-line',
    lifeMonths: lifeMonths ?? STATUTORY_GROUPS[group]?.lifeMonths ?? null,
    residual: 0,
  }
}

function seedEvents(s: AssetSeed): AssetEvent[] {
  const inService = s.inServiceDate ?? s.acquired
  const acq: AcquisitionEvent = {
    id: `${s.id}-E1`,
    kind: 'acquisition',
    period: periodOfDate(inService),
    date: s.acquired,
    recordedBy: 'Sari Wulandari',
    cost: s.cost,
    inServiceDate: inService,
    accounting: {
      method: 'straight-line',
      lifeMonths: s.indefiniteLife ? null : s.commercialLifeMonths,
      residual: s.residual ?? 0,
    },
    tax: s.taxGroup ? taxSetupFor(s.taxGroup, s.fiscalLifeMonths) : null,
    taxGroup: s.taxGroup,
    ...(/goodwill/i.test(s.statutoryCode ?? '') ? { isGoodwill: true } : {}),
  }
  const events: AssetEvent[] = [acq]
  if (s.impairment) {
    const e: ImpairmentEvent = {
      id: `${s.id}-E${events.length + 1}`,
      kind: 'impairment',
      period: periodOfDate(s.impairment.date),
      date: s.impairment.date,
      recordedBy: 'Rizal Candra',
      recoverable: s.impairment.recoverable,
      testId: s.impairment.testId,
    }
    events.push(e)
  }
  if (s.disposal) {
    const e: DisposalEvent = {
      id: `${s.id}-E${events.length + 1}`,
      kind: 'disposal',
      period: periodOfDate(s.disposal.date),
      date: s.disposal.date,
      recordedBy: 'Rizal Candra',
      proceeds: s.disposal.proceeds,
    }
    events.push(e)
  }
  return events
}

const eventLog = ref<Record<string, AssetEvent[]>>({})

/** Every asset's ledger, rebuilt whenever an event log changes. */
export const ledgers = computed<Record<string, AssetLedger>>(() => {
  const out: Record<string, AssetLedger> = {}
  for (const s of assetRecords.value) out[s.id] = buildAssetLedger(s.id, eventLog.value[s.id] ?? [])
  return out
})

export function ledgerOf(id: string): AssetLedger | null {
  return ledgers.value[id] ?? null
}

export function eventsOf(id: string): AssetEvent[] {
  return eventLog.value[id] ?? []
}

// ── The asset as screens read it ────────────────────────────────────────────

/**
 * The last period whose depreciation is in the ledger, on or before `p`.
 * Depreciation reaches the books only through a posted run, so what the
 * register carries at a date is the charges through this period plus any
 * write-down recorded since.
 */
export function bookedThrough(p: Period = CURRENT_PERIOD): Period {
  let last = addPeriods(FY_START, -1)
  for (const x of FY_PERIODS) if (!isAfter(x, p) && runs.value.some((r) => r.period === x && r.state === 'posted')) last = x
  return last
}

/**
 * Accumulated depreciation and impairment as booked at the end of `p`:
 * charges through the last posted period, write-downs through `p`. For the
 * tax book, which never posts, the same cut-off keeps the two books
 * comparable on one row.
 */
export function accumulatedAsBooked(l: AssetLedger, book: Book, p: Period = CURRENT_PERIOD): number | null {
  const b = bookOf(l, book)
  if (!b) return null
  const through = bookedThrough(p)
  let acc = accumulatedAt(b, isBefore(through, p) ? through : p) ?? 0
  if (isBefore(through, p)) {
    for (const r of b.live) if (isAfter(r.period, through) && !isAfter(r.period, p)) acc += r.writeDown - (r.transferredOut ?? 0)
    for (const w of b.offScheduleWriteDowns) if (isAfter(w.period, through) && !isAfter(w.period, p)) acc += w.amount
  }
  return acc
}

/** Book value as the register carries it at the end of `p`. Null when not held or no book. */
export function carryingAsBooked(l: AssetLedger, book: Book, p: Period = CURRENT_PERIOD): number | null {
  const b = bookOf(l, book)
  if (!b || !isHeldAt(l, p)) return null
  const acc = accumulatedAsBooked(l, book, p)
  return acc === null ? null : costAt(b, p) - acc
}

/**
 * Impairment still carried at the end of `p`: how far the asset sits below
 * the carrying amount it would have had never impaired. Zero once a reversal
 * reaches the cap. Read from the same unimpaired replay the cap uses, so the
 * status and the cap cannot disagree.
 */
export function impairmentCarried(l: AssetLedger, p: Period = CURRENT_PERIOD): number {
  const acc = l.books.accounting
  if (!acc.impairments.some((i) => i.loss > 0 && !isAfter(i.period, p))) return 0
  const last = acc.reversals.filter((r) => !isAfter(r.period, p)).at(-1)
  const lastLoss = acc.impairments.filter((i) => i.loss > 0 && !isAfter(i.period, p)).at(-1)!
  if (last && last.capApplied && !isBefore(last.period, lastLoss.period)) return 0
  const loss = acc.impairments.filter((i) => !isAfter(i.period, p)).reduce((s, i) => s + i.loss, 0)
  const back = acc.reversals.filter((r) => !isAfter(r.period, p)).reduce((s, r) => s + r.applied, 0)
  return Math.max(0, loss - back)
}

function deriveStatus(l: AssetLedger, p: Period): AssetStatus {
  if (l.splitIn && !isAfter(l.splitIn, p)) return 'Split'
  if (l.disposedIn && !isAfter(l.disposedIn, p)) return 'Disposed'
  if (!l.books.tax) return 'Incomplete'
  const acc = l.books.accounting
  if (impairmentCarried(l, p) > 0) return 'Impaired'
  const basis = acc.bases[acc.bases.length - 1]!
  const bv = carryingAsBooked(l, 'accounting', p)
  if (basis.lifeMonths !== null && bv !== null && bv <= basis.residual) return 'Fully depreciated'
  return 'Active'
}

/** One asset, seed plus the figures the register carries at the end of `p`. */
export function assetView(s: AssetSeed, p: Period = CURRENT_PERIOD): FixedAsset {
  const l = ledgers.value[s.id]!
  const tax = l.books.tax
  const taxBasis = tax ? tax.bases[tax.bases.length - 1]! : null
  const accBasis = l.books.accounting.bases[l.books.accounting.bases.length - 1]!
  return {
    ...s,
    cost: costAt(l.books.accounting, p),
    inServiceDate: l.inServiceDate,
    residual: accBasis.residual,
    method: accBasis.method === 'reducing-balance' ? 'reducing-balance' : 'straight-line',
    commercialLifeMonths: accBasis.lifeMonths,
    taxGroup: l.taxGroup,
    fiscalLifeMonths: taxBasis?.lifeMonths ?? null,
    bookValueCommercial: carryingAsBooked(l, 'accounting', p),
    bookValueFiscal: carryingAsBooked(l, 'tax', p),
    status: deriveStatus(l, p),
  }
}

/** The register at the current period end. */
export const fixedAssets = computed<FixedAsset[]>(() => assetRecords.value.map((s) => assetView(s)))

export function findAsset(id: string): FixedAsset | undefined {
  return fixedAssets.value.find((a) => a.id === id)
}

/** Still missing a statutory group. */
export const unclassifiedAssets = computed(() => fixedAssets.value.filter((a) => a.taxGroup === null))

// ── General ledger ──────────────────────────────────────────────────────────

/**
 * The control accounts the self-check reconciles. The class-level accounts on
 * a journal line roll up to one of these.
 */
export type ControlAccount = '1-1600' | '1-1700' | '6-5100' | '6-5200' | '6-5300' | 'other'

export const CONTROL_ACCOUNTS: { account: Exclude<ControlAccount, 'other'>; name: string; pl: boolean }[] = [
  { account: '1-1600', name: 'Fixed assets at cost', pl: false },
  { account: '1-1700', name: 'Accumulated depreciation', pl: false },
  { account: '6-5100', name: 'Depreciation and amortisation, YTD', pl: true },
  { account: '6-5200', name: 'Impairment loss', pl: true },
  { account: '6-5300', name: 'Gain on disposal of assets', pl: true },
]

export interface JournalLine {
  account: string
  description: string
  debit: number | null
  credit: number | null
  control: ControlAccount
  /**
   * The period the line belongs to, where it differs from the journal's. A
   * catch-up for an asset put into service before the open period carries
   * one pair of lines per period it brings up to date, so the ledger at any
   * earlier period end, and the reversal of any one period, see exactly that
   * period's charge.
   */
  period?: Period
  /** On a reversal line: the journal whose line it reverses. */
  ofJournal?: string
}

export interface Journal {
  number: string
  /** dd/mm/yyyy. */
  date: string
  period: Period
  source: 'opening' | 'acquisition' | 'depreciation' | 'impairment' | 'disposal' | 'reversal'
    | 'improvement' | 'correction' | 'impairment-reversal' | 'catch-up' | 'lease-remeasurement'
    /** A journal from outside the asset module (the self-check demonstration). */
    | 'manual'
  memo: string
  lines: JournalLine[]
  /** For a reversal, the journal it reverses. */
  reverses?: string
}

const EXPENSE_ACCOUNT: Record<string, string> = {
  'Buildings': '6210 · Depreciation, buildings',
  'Production machinery': '6220 · Depreciation, machinery',
  'Vehicles': '6230 · Depreciation, vehicles',
  'IT equipment': '6240 · Depreciation, IT equipment',
  'Equipment': '6250 · Depreciation, equipment',
  'Furniture': '6260 · Depreciation, furniture',
  'Intangible assets': '6270 · Amortisation, intangibles',
  'Right-of-use assets': '6280 · Depreciation, right-of-use assets',
}
const ACCUM_ACCOUNT: Record<string, string> = {
  'Buildings': '1610 · Accumulated depreciation, buildings',
  'Production machinery': '1620 · Accumulated depreciation, machinery',
  'Vehicles': '1630 · Accumulated depreciation, vehicles',
  'IT equipment': '1640 · Accumulated depreciation, IT equipment',
  'Equipment': '1650 · Accumulated depreciation, equipment',
  'Furniture': '1660 · Accumulated depreciation, furniture',
  'Intangible assets': '1670 · Accumulated amortisation, intangibles',
  'Right-of-use assets': '1680 · Accumulated depreciation, right-of-use assets',
}

/**
 * Journals the asset module has posted. LR-1: nothing outside the module can
 * post to an asset control account, so this list is the whole ledger for
 * those accounts. Exported so a test can introduce a divergence on purpose.
 */
export const journals = ref<Journal[]>([])

/** A control account's balance at the end of `p`. Debit positive. */
export function ledgerBalance(control: ControlAccount, p: Period): number {
  const pl = CONTROL_ACCOUNTS.find((c) => c.account === control)?.pl ?? false
  let total = 0
  for (const j of journals.value) {
    for (const l of j.lines) {
      const lp = l.period ?? j.period
      if (isAfter(lp, p)) continue
      if (pl && isBefore(lp, FY_START)) continue
      if (l.control === control) total += (l.debit ?? 0) - (l.credit ?? 0)
    }
  }
  return total
}

let journalSeq = 118
function nextJournal(): string {
  journalSeq += 1
  return `JV-2026-${String(journalSeq).padStart(4, '0')}`
}
/** The number the next journal will take, for a preview. */
export function peekJournalNumber(): string {
  return `JV-2026-${String(journalSeq + 1).padStart(4, '0')}`
}

// ── Depreciation runs ───────────────────────────────────────────────────────

/** One asset's accounting charge in a run. */
export interface RunLine {
  assetId: string
  assetClass: string
  charge: number
}

export interface DepreciationRun {
  id: string
  period: Period
  state: 'draft' | 'posted' | 'reversed'
  /** When the draft was generated, dd/mm/yyyy. */
  generatedOn: string
  /** The accounting charges, per asset, fixed when the run was generated. */
  lines: RunLine[]
  total: number
  journal?: string
  postedOn?: string
  reversal?: { journal: string; on: string }
}

export const runs = ref<DepreciationRun[]>([])

/** The accounting charges a period's run would carry, from the live schedules. */
export function runLinesFor(p: Period): RunLine[] {
  const out: RunLine[] = []
  for (const s of assetRecords.value) {
    const pc = chargeAt(ledgers.value[s.id]!, 'accounting', p)
    if (pc.charge !== null && pc.charge > 0) out.push({ assetId: s.id, assetClass: s.class, charge: pc.charge })
  }
  return out
}

/**
 * The journal a run posts. Only the accounting charge reaches the ledger
 * (LR-2): Indonesian statutory reporting is a computation on the commercial
 * ledger, not a parallel one, so a tax line would overstate expense with
 * nothing appearing out of balance.
 */
export function journalLinesFor(lines: RunLine[]): JournalLine[] {
  const byClass = new Map<string, number>()
  for (const l of lines) byClass.set(l.assetClass, (byClass.get(l.assetClass) ?? 0) + l.charge)
  const classes = [...byClass.entries()].sort((a, b) => b[1] - a[1])
  return [
    ...classes.map(([cls, amount]): JournalLine => ({
      account: EXPENSE_ACCOUNT[cls] ?? '6299 · Depreciation, other', description: cls,
      debit: amount, credit: null, control: '6-5100',
    })),
    ...classes.map(([cls, amount]): JournalLine => ({
      account: ACCUM_ACCOUNT[cls] ?? '1699 · Accumulated depreciation, other', description: cls,
      debit: null, credit: amount, control: '1-1700',
    })),
  ]
}

/** The live (not reversed) posted run for a period, or null. */
export function postedRunFor(p: Period): DepreciationRun | null {
  return runs.value.find((r) => r.period === p && r.state === 'posted') ?? null
}
export function draftRunFor(p: Period): DepreciationRun | null {
  return runs.value.find((r) => r.period === p && r.state === 'draft') ?? null
}

/** The earliest unposted period up to today. Posting is strictly sequential. */
export const nextOpenPeriod = computed<Period | null>(() => {
  for (const p of FY_PERIODS) {
    if (isAfter(p, CURRENT_PERIOD)) return null
    if (!postedRunFor(p)) return p
  }
  return null
})

/**
 * The earliest period a value change can take effect in: the first period
 * with no posted run. Once every period to today is posted, that is the
 * period after the last one posted.
 */
export const earliestEffectivePeriod = computed<Period>(() => {
  for (const p of FY_PERIODS) if (!postedRunFor(p)) return p
  return addPeriods(FY_END, 1)
})

/** The latest period with a posted run. */
export const lastPostedPeriod = computed<Period | null>(() => {
  let last: Period | null = null
  for (const p of FY_PERIODS) if (postedRunFor(p)) last = p
  return last
})

export type RunResult =
  | { ok: true; run: DepreciationRun }
  | { ok: false; reason: string; nextOpen: Period | null }

/**
 * OD-08. Generate the run for a chosen open period, from the schedules as
 * they stand. A closed (posted) period is refused and the next open one
 * named (FG2-AC4); nothing is written for a refused request. Generating again
 * replaces the earlier draft, never a posted run.
 */
export function generateRun(p: Period, on = periodEndDate(CURRENT_PERIOD)): RunResult {
  const nextOpen = nextOpenPeriod.value
  if (postedRunFor(p)) {
    return { ok: false, reason: `${periodLabel(p)} is closed. The next open period is ${nextOpen ? periodLabel(nextOpen) : 'none'}.`, nextOpen }
  }
  if (isAfter(p, CURRENT_PERIOD)) {
    return { ok: false, reason: `${periodLabel(p)} has not started yet.`, nextOpen }
  }
  const lines = runLinesFor(p)
  const run: DepreciationRun = {
    id: `RUN-${p}-${runs.value.length + 1}`,
    period: p, state: 'draft', generatedOn: on, lines,
    total: lines.reduce((s, l) => s + l.charge, 0),
  }
  runs.value = [...runs.value.filter((r) => !(r.period === p && r.state === 'draft')), run]
  return { ok: true, run }
}

/**
 * Post a period. Sequential: only the earliest open period can post, because
 * a later run reads the accumulated balances the earlier one creates. Posting
 * closes the period, so the self-check for it runs and its result is kept.
 */
export function postPeriod(p: Period, postedOn = periodEndDate(CURRENT_PERIOD)): RunResult {
  if (nextOpenPeriod.value !== p) {
    return { ok: false, reason: `Post ${nextOpenPeriod.value ? periodLabel(nextOpenPeriod.value) : 'nothing'} first. Periods post in order.`, nextOpen: nextOpenPeriod.value }
  }
  // Regenerated at the moment of posting, so the journal is the schedule as
  // it stands and not a draft taken before a later event.
  const draft = (generateRun(p, postedOn) as { ok: true; run: DepreciationRun }).run
  const number = nextJournal()
  journals.value = [...journals.value, {
    // OD-09: the date follows the company's policy, set once in Asset settings.
    number, date: journalDateFor(p, postedOn), period: p, source: 'depreciation',
    memo: `Depreciation for ${periodLabel(p)}`, lines: journalLinesFor(draft.lines),
  }]
  const posted: DepreciationRun = { ...draft, state: 'posted', journal: number, postedOn }
  runs.value = runs.value.map((r) => (r.id === draft.id ? posted : r))
  runSelfCheck(p)
  return { ok: true, run: posted }
}

/**
 * Reverse a posted run. LR-4: the journal is not deleted. A reversing journal
 * is posted beside it, the run is marked reversed, and the period is open
 * again. Only the latest posted period can be reversed, for the same reason
 * posting is sequential.
 */
export function reversePeriod(p: Period, on = periodEndDate(CURRENT_PERIOD)): RunResult {
  const run = postedRunFor(p)
  if (!run || lastPostedPeriod.value !== p) {
    return { ok: false, reason: `Only the latest posted period can be reversed.`, nextOpen: nextOpenPeriod.value }
  }
  const original = journals.value.find((j) => j.number === run.journal)
  const number = nextJournal()
  journals.value = [...journals.value, {
    number, date: periodEndDate(p), period: p, source: 'reversal',
    memo: `Reversal of ${run.journal}`, reverses: run.journal,
    lines: [
      ...(original?.lines ?? []).map((l) => ({ ...l, debit: l.credit, credit: l.debit })),
      // The period's charge also sits in any catch-up brought up to it, for
      // an asset that entered the register after the run posted. Reversing
      // the period takes that out too, or reposting it would book it twice.
      ...catchUpLinesStillBooked(p).map((x) => ({ ...x.line, debit: x.line.credit, credit: x.line.debit, period: p, ofJournal: x.journal })),
    ],
  }]
  const reversed: DepreciationRun = { ...run, state: 'reversed', reversal: { journal: number, on } }
  runs.value = runs.value.map((r) => (r.id === run.id ? reversed : r))
  return { ok: true, run: reversed }
}

/**
 * Catch-up lines for period `p` that no reversal has taken out yet. A
 * catch-up line is reversed with its period and never again: when the
 * period is posted again, its run carries the asset like any other.
 */
function catchUpLinesStillBooked(p: Period): { journal: string; line: JournalLine }[] {
  const reversed = new Set<string>()
  for (const j of journals.value) {
    if (j.source !== 'reversal') continue
    for (const l of j.lines) if (l.ofJournal) reversed.add(`${l.ofJournal}|${l.period ?? j.period}`)
  }
  const out: { journal: string; line: JournalLine }[] = []
  for (const j of journals.value) {
    if (j.source !== 'catch-up' || reversed.has(`${j.number}|${p}`)) continue
    for (const l of j.lines) if (l.period === p && l.control !== 'other') out.push({ journal: j.number, line: l })
  }
  return out
}

// ── Recording events ────────────────────────────────────────────────────────

export type EventResult = { ok: true; event: AssetEvent } | { ok: false; reason: string }

/** The journal an event posts, if it posts one. A tax-only event posts nothing (LR-2). */
function journalForEvent(assetId: string, e: AssetEvent, l: AssetLedger): Journal | null {
  const s = recordById(assetId)!
  const accum = ACCUM_ACCOUNT[s.class] ?? '1699'
  const costLines = (amount: number, what: string): JournalLine[] => amount >= 0
    ? [
        { account: '1-1600 · Fixed assets at cost', description: `${assetId} ${what}`, debit: amount, credit: null, control: '1-1600' },
        { account: '2-1100 · Accounts payable', description: 'Supplier', debit: null, credit: amount, control: 'other' },
      ]
    : [
        { account: '2-1100 · Accounts payable', description: 'Supplier', debit: -amount, credit: null, control: 'other' },
        { account: '1-1600 · Fixed assets at cost', description: `${assetId} ${what}`, debit: null, credit: -amount, control: '1-1600' },
      ]
  if (e.kind === 'improvement') {
    return { number: nextJournal(), date: e.date, period: e.period, source: 'improvement', memo: `Improvement capitalised on ${assetId}`, lines: costLines(e.amount, 'improvement') }
  }
  if (e.kind === 'lease-remeasurement') {
    // OD-39: the liability and the asset move by the same amount, so no gain or loss.
    const a = e.amount
    const lines: JournalLine[] = a >= 0
      ? [
          { account: '1-1650 · Right-of-use assets', description: `${assetId} remeasured`, debit: a, credit: null, control: '1-1600' },
          { account: '2-2500 · Lease liability', description: e.leaseId, debit: null, credit: a, control: 'other' },
        ]
      : [
          { account: '2-2500 · Lease liability', description: e.leaseId, debit: -a, credit: null, control: 'other' },
          { account: '1-1650 · Right-of-use assets', description: `${assetId} remeasured`, debit: null, credit: -a, control: '1-1600' },
        ]
    return a ? { number: nextJournal(), date: e.date, period: e.period, source: 'lease-remeasurement', memo: `Remeasurement of lease ${e.leaseId}`, lines } : null
  }
  if (e.kind === 'cost-correction') {
    const c = l.books.accounting.corrections.find((x) => x.eventId === e.id)
    if (!c || c.correctedCost === c.previousCost) return null
    // The catch-up on depreciation is part of the period's charge and posts
    // with that period's run, so this journal moves the cost only.
    return { number: nextJournal(), date: e.date, period: e.period, source: 'correction', memo: `Cost correction on ${assetId}`, lines: costLines(c.correctedCost - c.previousCost, 'cost correction') }
  }
  if (e.kind === 'impairment-reversal') {
    const r = l.books.accounting.reversals.find((x) => x.eventId === e.id)
    if (!r || r.applied === 0) return null
    return {
      number: nextJournal(), date: e.date, period: e.period, source: 'impairment-reversal',
      memo: `Impairment reversal on ${assetId}`,
      lines: [
        { account: accum, description: `${assetId} write-down reversed`, debit: r.applied, credit: null, control: '1-1700' },
        { account: '6-5200 · Impairment loss', description: `${assetId} reversal`, debit: null, credit: r.applied, control: '6-5200' },
      ],
    }
  }
  if (e.kind === 'partial-disposal') {
    const d = l.books.accounting.partialDisposals.find((x) => x.eventId === e.id)
    if (!d) return null
    return {
      number: nextJournal(), date: e.date, period: e.period, source: 'disposal', memo: `Partial disposal of ${assetId}`,
      lines: [
        { account: '1-1100 · Cash and bank', description: 'Proceeds', debit: d.proceeds, credit: null, control: 'other' },
        { account: accum, description: 'Accumulated derecognised, disposed part', debit: d.accumulated, credit: null, control: '1-1700' },
        { account: '1-1600 · Fixed assets at cost', description: `${assetId} disposed part`, debit: null, credit: d.cost, control: '1-1600' },
        d.gainLoss >= 0
          ? { account: '6-5300 · Gain on disposal', description: 'Gain', debit: null, credit: d.gainLoss, control: '6-5300' }
          : { account: '6-5300 · Loss on disposal', description: 'Loss', debit: -d.gainLoss, credit: null, control: '6-5300' },
      ],
    }
  }
  if (e.kind === 'impairment') {
    const r = l.books.accounting.impairments.find((i) => i.eventId === e.id)
    if (!r || r.loss === 0) return null
    return {
      number: nextJournal(), date: e.date, period: e.period, source: 'impairment',
      memo: `Impairment of ${assetId}`,
      lines: [
        { account: '6-5200 · Impairment loss', description: `${assetId} ${s.name}`, debit: r.loss, credit: null, control: '6-5200' },
        { account: ACCUM_ACCOUNT[s.class] ?? '1699', description: `${assetId} write-down`, debit: null, credit: r.loss, control: '1-1700' },
      ],
    }
  }
  if (e.kind === 'disposal') {
    const d = l.books.accounting.disposal
    if (!d) return null
    const lines: JournalLine[] = [
      { account: '1-1100 · Cash and bank', description: 'Proceeds', debit: d.proceeds, credit: null, control: 'other' },
      { account: ACCUM_ACCOUNT[s.class] ?? '1699', description: 'Accumulated derecognised', debit: d.accumulated, credit: null, control: '1-1700' },
      { account: '1-1600 · Fixed assets at cost', description: `${assetId} ${s.name}`, debit: null, credit: d.cost, control: '1-1600' },
      d.gainLoss >= 0
        ? { account: '6-5300 · Gain on disposal', description: 'Gain', debit: null, credit: d.gainLoss, control: '6-5300' }
        : { account: '6-5300 · Loss on disposal', description: 'Loss', debit: -d.gainLoss, credit: null, control: '6-5300' },
    ]
    return { number: nextJournal(), date: e.date, period: e.period, source: 'disposal', memo: `Disposal of ${assetId}`, lines }
  }
  return null
}

/**
 * Append an event to an asset's log. The schedule regenerates from the
 * event's effective period forward; nothing before it moves (LR-3).
 *
 * LR-4: an event cannot change a charge already in the ledger. One that
 * takes effect at the start of a period cannot land in a posted period; one
 * at the end of a period (an impairment, a disposal) cannot land in a period
 * whose successor is posted.
 */
/**
 * Why an event cannot be recorded as it stands, or null. LR-4 and FG-3.3: an
 * event dated inside a posted period is refused and the earliest period it
 * may take is named. A correction to what a posted period charged is made in
 * the next open period as a catch-up, never by editing the closed one.
 */
export function eventRefusal(assetId: string, e: Omit<AssetEvent, 'id'>): string | null {
  const l = ledgers.value[assetId]
  if (!l) return `No asset ${assetId}`
  if (l.splitIn) return `${assetId} was split in ${periodLabel(l.splitIn)}. Change its parts instead.`
  if (l.disposedIn) return `${assetId} was disposed of in ${periodLabel(l.disposedIn)}. Nothing further can change it.`
  if (e.kind === 'impairment-reversal' && l.isGoodwill) return GOODWILL_REVERSAL_REFUSED
  if (e.kind === 'impairment-reversal' && impairmentCarried(l, e.period) <= 0) return `${assetId} carries no impairment to reverse.`
  if (e.kind !== 'tax-classification' && postedRunFor(e.period)) {
    return `${periodLabel(e.period)} is posted. The earliest period this can take effect is ${periodLabel(earliestEffectivePeriod.value)}.`
  }
  return null
}

export interface EventPreview {
  ok: boolean
  reason?: string
  before: AssetLedger
  after: AssetLedger | null
  /** The children a split would create, built from their apportioned opening. */
  children: AssetLedger[]
}

/** The ledger an event would produce, without recording it. */
export function previewEvent(assetId: string, event: Omit<AssetEvent, 'id'>): EventPreview {
  const before = ledgers.value[assetId]!
  const refusal = eventRefusal(assetId, event)
  if (refusal) return { ok: false, reason: refusal, before, after: null, children: [] }
  const log = eventLog.value[assetId] ?? []
  const e = { ...event, id: `${assetId}-E${log.length + 1}` } as AssetEvent
  try {
    const after = buildAssetLedger(assetId, [...log, e])
    const children = splitChildAcquisitions(after).map((acq) => buildAssetLedger(acq.id.replace(/-E1$/, ''), [acq]))
    return { ok: true, before, after, children }
  } catch (err) {
    return { ok: false, reason: (err as Error).message, before, after: null, children: [] }
  }
}

/** The IDs a split into `n` parts would give its children. */
export function nextChildIds(n: number): string[] {
  const first = Number(nextAssetId().slice(3))
  return Array.from({ length: n }, (_, i) => `FA-${String(first + i).padStart(4, '0')}`)
}

export function recordEvent(assetId: string, event: Omit<AssetEvent, 'id'> & { id?: string }): EventResult {
  const log = eventLog.value[assetId]
  if (!log) return { ok: false, reason: `No asset ${assetId}` }
  const e = { ...event, id: event.id ?? `${assetId}-E${log.length + 1}` } as AssetEvent
  const refusal = eventRefusal(assetId, e)
  if (refusal) return { ok: false, reason: refusal }
  const next = [...log, e]
  // Replay before committing: an event the engine cannot apply is refused
  // rather than leaving a log that no longer builds.
  let built: AssetLedger
  try {
    built = buildAssetLedger(assetId, next)
  } catch (err) {
    return { ok: false, reason: (err as Error).message }
  }
  eventLog.value = { ...eventLog.value, [assetId]: next }
  const j = journalForEvent(assetId, e, built)
  if (j) journals.value = [...journals.value, j]
  if (e.kind === 'split') addSplitChildren(built, e.parts.map((x) => x.name ?? ''))
  return { ok: true, event: e }
}

/**
 * OD-32. The children join the register with their own IDs and event logs,
 * opened from the parent's apportioned position. Cost and accumulated move
 * between records inside the same accounts, so no journal is needed.
 */
function addSplitChildren(parent: AssetLedger, names: string[]) {
  const seed = recordById(parent.id)!
  const acqs = splitChildAcquisitions(parent)
  const logs: Record<string, AssetEvent[]> = {}
  const recs: AssetSeed[] = acqs.map((acq, i) => {
    const id = acq.id.replace(/-E1$/, '')
    logs[id] = [acq]
    return {
      ...seed, id, name: names[i]?.trim() ? names[i]!.trim() : `${seed.name} · part ${i + 1}`,
      cost: acq.cost, acquired: seed.acquired, inServiceDate: parent.inServiceDate,
      residual: acq.accounting.residual, tag: seed.tag ? `${seed.tag}-${i + 1}` : null,
      impairment: undefined, disposal: undefined, splitFrom: parent.id,
    }
  })
  assetRecords.value = [...assetRecords.value, ...recs]
  eventLog.value = { ...eventLog.value, ...logs }
}

export interface NewAssetInput {
  name: string
  class: string
  branch: string
  cost: number
  /** dd/mm/yyyy */
  inServiceDate: string
  /** Null is an indefinite life: no accounting schedule at all (FG9-AC2). */
  lifeMonths: number | null
  residual: number
  method: Method
  taxGroup: string | null
  location?: string
  custodian?: string
  /** OD-44/47: an intangible's statutory code, from the eleven-code taxonomy. */
  statutoryCode?: string | null
  /** OD-38: a right-of-use asset is created by its lease, under the lease's number. */
  id?: string
  leaseId?: string
  /** A tax book set up by the caller instead of from a statutory group. */
  tax?: BookSetup | null
  /** What the capitalisation is credited to. Accounts payable by default. */
  creditAccount?: string
  /** What the cost is debited to. Fixed assets at cost by default. */
  debitAccount?: string
}

/**
 * Create an asset (TS-01). It appears in the register and the schedule at
 * once. Capitalisation posts cost against payables. An asset put into service
 * before the next open period has depreciation the posted runs never charged,
 * so that is brought up to date in one dated journal rather than left for the
 * self-check to find.
 */
export function createAsset(input: NewAssetInput): { ok: true; id: string } | { ok: false; reason: string } {
  const id = input.id ?? nextAssetId()
  if (recordById(id)) return { ok: false, reason: `${id} is already in the register` }
  const period = periodOfDate(input.inServiceDate)
  const type = input.class === 'Intangible assets' ? 'Intangible' : 'Tangible'
  const tax = input.tax !== undefined ? input.tax : input.taxGroup ? taxSetupFor(input.taxGroup) : null
  const seed: AssetSeed = {
    id, name: input.name, class: input.class, acquired: input.inServiceDate, inServiceDate: input.inServiceDate,
    cost: input.cost, residual: input.residual, commercialLifeMonths: input.lifeMonths,
    taxGroup: input.taxGroup, fiscalLifeMonths: tax?.lifeMonths ?? null,
    branch: input.branch, tag: type === 'Tangible' && !input.leaseId ? `TAG-${id.slice(3)}` : null,
    location: input.location || null, custodian: input.custodian || null, type,
    statutoryCode: input.statutoryCode ?? null, indefiniteLife: input.lifeMonths === null,
    ...(input.leaseId ? { leaseId: input.leaseId } : {}),
  }
  const acq: AcquisitionEvent = {
    id: `${id}-E1`, kind: 'acquisition', period, date: input.inServiceDate, recordedBy: actingUser.value,
    cost: input.cost, inServiceDate: input.inServiceDate,
    accounting: { method: input.method, lifeMonths: input.lifeMonths, residual: input.residual },
    tax,
    taxGroup: input.taxGroup,
    ...(/goodwill/i.test(input.statutoryCode ?? '') ? { isGoodwill: true } : {}),
  }
  assetRecords.value = [...assetRecords.value, seed]
  eventLog.value = { ...eventLog.value, [id]: [acq] }
  const l = ledgers.value[id]!
  const openP = earliestEffectivePeriod.value
  const js: Journal[] = [{
    number: nextJournal(), date: input.inServiceDate, period, source: 'acquisition',
    memo: `Capitalisation of ${id}`,
    lines: [
      { account: input.debitAccount ?? '1-1600 · Fixed assets at cost', description: `${id} ${input.name}`, debit: input.cost, credit: null, control: '1-1600' },
      { account: input.creditAccount ?? '2-1100 · Accounts payable', description: input.leaseId ?? 'Supplier', debit: null, credit: input.cost, control: 'other' },
    ],
  }]
  const through = addPeriods(openP, -1)
  const total = accumulatedAt(l.books.accounting, through) ?? 0
  if (total > 0) {
    // One pair of lines per period brought up to date, each carrying its
    // period, so the ledger ties at every earlier period end and a reversal
    // of any one period takes out exactly that period's charge.
    const lastBeforeFy = addPeriods(FY_START, -1)
    const preFy = accumulatedAt(l.books.accounting, isBefore(through, lastBeforeFy) ? through : lastBeforeFy) ?? 0
    const accum = ACCUM_ACCOUNT[input.class] ?? '1699'
    const lines: JournalLine[] = preFy
      ? [
          { account: '3-3000 · Retained earnings', description: `${id} before FY2026`, debit: preFy, credit: null, control: 'other', period: lastBeforeFy },
          { account: accum, description: `${id} accumulated before FY2026`, debit: null, credit: preFy, control: '1-1700', period: lastBeforeFy },
        ]
      : []
    for (let x = isBefore(period, FY_START) ? FY_START : period; !isAfter(x, through); x = addPeriods(x, 1)) {
      const c = chargeAt(l, 'accounting', x).charge
      if (!c) continue
      lines.push(
        { account: EXPENSE_ACCOUNT[input.class] ?? '6299 · Depreciation, other', description: `${id} ${periodLabel(x)}`, debit: c, credit: null, control: '6-5100', period: x },
        { account: accum, description: `${id} ${periodLabel(x)}`, debit: null, credit: c, control: '1-1700', period: x },
      )
    }
    js.push({
      number: nextJournal(), date: periodEndDate(through), period: through, source: 'catch-up',
      memo: `Depreciation of ${id} brought up to ${periodLabel(through)}`,
      lines,
    })
  }
  journals.value = [...journals.value, ...js]
  return { ok: true, id }
}

/**
 * OD-02. Set the statutory group on an asset. The tax book is created from
 * the group's life and computed from the in-service date, so the whole year
 * reaches the tax return. It posts nothing.
 */
export function assignTaxGroupTo(id: string, group: string, date = periodEndDate(CURRENT_PERIOD)): EventResult {
  const e: Omit<TaxClassificationEvent, 'id'> = {
    kind: 'tax-classification', period: CURRENT_PERIOD, date, recordedBy: actingUser.value,
    taxGroup: group, tax: taxSetupFor(group),
  }
  return recordEvent(id, e)
}

/** The statutory group, including one assigned this session. */
export function assignedTaxGroup(id: string): string | null {
  return ledgers.value[id]?.taxGroup ?? null
}

// ── Impairment tests ────────────────────────────────────────────────────────

export interface ImpairmentTest {
  id: string
  assetId: string
  assetName: string
  date: string
  indicator: string
  carrying: number
  recoverable: number
  basis: 'Fair value less costs of disposal' | 'Value in use'
  source: string
  author: string
  outcome: 'Impaired' | 'Not impaired' | 'Reversal'
  loss: number | null
  /** For a reversal: what was written back. */
  reversed?: number | null
}

/**
 * Tests recorded this session, beyond the ones the event logs imply. A test
 * that found an impairment is also an impairment event on the asset, and its
 * carrying amount and loss are read back from the engine rather than stored.
 */
interface TestRecord extends Omit<ImpairmentTest, 'carrying' | 'loss' | 'outcome'> {
  /** The impairment (or reversal) event the test produced, when it found one. */
  eventId: string | null
  kind?: 'impairment' | 'reversal'
  /** For a test that found nothing: the carrying amount it was compared with. */
  carryingAtTest: number
}
const testRecords = ref<TestRecord[]>([])

export const impairmentTests = computed<ImpairmentTest[]>(() =>
  testRecords.value.map((t) => {
    if (t.kind === 'reversal') {
      const rv = t.eventId ? ledgers.value[t.assetId]?.books.accounting.reversals.find((r) => r.eventId === t.eventId) ?? null : null
      return { ...t, carrying: rv?.carryingBefore ?? t.carryingAtTest, loss: null, reversed: rv?.applied ?? 0, outcome: 'Reversal' as const }
    }
    const imp = t.eventId
      ? ledgers.value[t.assetId]?.books.accounting.impairments.find((i) => i.eventId === t.eventId) ?? null
      : null
    const carrying = imp ? imp.carryingBefore : t.carryingAtTest
    const loss = imp && imp.loss > 0 ? imp.loss : null
    return { ...t, carrying, loss, outcome: loss ? 'Impaired' : 'Not impaired' }
  }),
)

/** The carrying amount a test on `date` is compared with: after that period's charge. */
export function carryingForTest(assetId: string, date = periodEndDate(CURRENT_PERIOD)): number | null {
  const l = ledgers.value[assetId]
  if (!l) return null
  return bookValueAt(l, 'accounting', periodOfDate(date))
}

/**
 * Record a test. The outcome follows from the figures: an asset is impaired
 * when its recoverable amount is below what it is carried at, and a test that
 * finds nothing is kept, because the obligation is to test (LR-8). An
 * impairment is accounting only; the tax book does not move.
 */
/** What can prompt an impairment test (PSAK 48 indicators, plus the annual test). */
export const IMPAIRMENT_INDICATORS = [
  'Physical damage',
  'Market value has fallen',
  'Obsolescence',
  'Idle or held for disposal',
  'Annual test · indefinite life',
  'Worse performance than expected',
]

export function recordImpairmentTest(input: {
  assetId: string
  indicator: string
  recoverable: number
  basis: ImpairmentTest['basis']
  source: string
  date?: string
}): EventResult | { ok: true; event: null } {
  const a = findAsset(input.assetId)
  if (!a) return { ok: false, reason: `No asset ${input.assetId}` }
  const date = input.date ?? periodEndDate(earliestEffectivePeriod.value)
  const period = periodOfDate(date)
  const carrying = carryingForTest(a.id, date) ?? a.cost
  const id = `IT-2026-${String(testRecords.value.length + 1).padStart(2, '0')}`
  let eventId: string | null = null
  // OD-50: a test that finds the asset impaired posts the write-down through
  // the engine. One that finds nothing is kept all the same (LR-8).
  if (input.recoverable < carrying) {
    const r = recordEvent(a.id, {
      kind: 'impairment', period, date, recordedBy: actingUser.value,
      recoverable: input.recoverable, testId: id,
    } as Omit<ImpairmentEvent, 'id'>)
    if (!r.ok) return r
    eventId = r.event.id
  }
  testRecords.value = [{
    id, assetId: a.id, assetName: a.name, date, indicator: input.indicator,
    recoverable: input.recoverable, basis: input.basis, source: input.source,
    author: actingUser.value, eventId, carryingAtTest: carrying, kind: 'impairment',
  }, ...testRecords.value]
  return eventId ? { ok: true, event: eventsOf(a.id).find((e) => e.id === eventId)! } : { ok: true, event: null }
}

/**
 * OD-51. A later test finds the recoverable amount has recovered. The write
 * back is capped at what the asset would be carried at had it never been
 * impaired, read from the retained unimpaired schedule. Goodwill is refused.
 */
export function recordImpairmentReversal(input: {
  assetId: string
  recoverable: number
  basis: ImpairmentTest['basis']
  source: string
  date?: string
}): EventResult {
  const a = findAsset(input.assetId)
  if (!a) return { ok: false, reason: `No asset ${input.assetId}` }
  const date = input.date ?? periodEndDate(earliestEffectivePeriod.value)
  const period = periodOfDate(date)
  const id = `IT-2026-${String(testRecords.value.length + 1).padStart(2, '0')}`
  const carrying = carryingForTest(a.id, date) ?? a.cost
  const r = recordEvent(a.id, {
    kind: 'impairment-reversal', period, date, recordedBy: actingUser.value,
    recoverable: input.recoverable, testId: id,
  } as Omit<AssetEvent, 'id'>)
  if (!r.ok) return r
  testRecords.value = [{
    id, assetId: a.id, assetName: a.name, date, indicator: 'Indicator of recovery',
    recoverable: input.recoverable, basis: input.basis, source: input.source,
    author: actingUser.value, eventId: r.event.id, carryingAtTest: carrying, kind: 'reversal',
  }, ...testRecords.value]
  return r
}

/** The tests on one asset, newest first, for its history (LR-8, FG3-AC1). */
export function testsFor(assetId: string): ImpairmentTest[] {
  return impairmentTests.value.filter((t) => t.assetId === assetId)
}

// ── Aggregates ──────────────────────────────────────────────────────────────

const seedById = (id: string) => recordById(id)!

/** Charges on one book across a range, per asset. Null where the book has none. */
export function chargeRange(id: string, book: Book, from: Period, to: Period): number | null {
  return chargesBetween(ledgers.value[id]!, book, from, to)
}

export interface BookPair { accounting: number; tax: number }

/**
 * The FY2026 figures the fiscal statement is built on, to period `p`.
 * Tangible and intangible are kept apart, and an asset with no tax book is
 * kept out of both columns so the two describe the same population.
 */
export function fyFigures(p: Period = CURRENT_PERIOD) {
  const tangible = { accounting: 0, tax: 0 }
  const intangible = { accounting: 0, tax: 0 }
  let unclassifiedAccounting = 0
  let impairment = 0
  const disposal = { accounting: 0, tax: 0, count: 0 }
  const lease = { accounting: 0, tax: 0 }
  for (const s of assetRecords.value) {
    const l = ledgers.value[s.id]!
    const acc = chargesBetween(l, 'accounting', FY_START, p) ?? 0
    if (!l.books.tax) { unclassifiedAccounting += acc; continue }
    // A right-of-use asset is reported on its own line: the tax deduction is
    // the lease payment, not a statutory group's depreciation (FG-8.5).
    if (s.leaseId) {
      lease.accounting += acc
      lease.tax += chargesBetween(l, 'tax', FY_START, p) ?? 0
      continue
    }
    const tax = chargesBetween(l, 'tax', FY_START, p) ?? 0
    const bucket = s.type === 'Tangible' ? tangible : intangible
    bucket.accounting += acc
    bucket.tax += tax
    const inFy = (x: { period: Period }) => !isBefore(x.period, FY_START) && !isAfter(x.period, p)
    for (const i of l.books.accounting.impairments) if (inFy(i)) impairment += i.loss
    for (const r of l.books.accounting.reversals) if (inFy(r)) impairment -= r.applied
    const dA = l.books.accounting.disposal
    const dT = l.books.tax.disposal
    if (dA && inFy(dA)) {
      disposal.accounting += dA.gainLoss
      disposal.tax += dT?.gainLoss ?? 0
      disposal.count += 1
    }
    l.books.accounting.partialDisposals.forEach((d, i) => {
      if (!inFy(d)) return
      disposal.accounting += d.gainLoss
      disposal.tax += l.books.tax!.partialDisposals[i]?.gainLoss ?? 0
      disposal.count += 1
    })
  }
  /**
   * The fiscal correction on the tangible half, as the working papers carry
   * it: depreciation the tax book allows less than the accounts (positive
   * adds back), the impairment added back, and the disposal restated on the
   * tax basis. The design calls its magnitude the net temporary difference.
   */
  const netFiscalCorrection = (tangible.accounting - tangible.tax) + impairment + (disposal.tax - disposal.accounting)
  const netTemporaryDifference = -netFiscalCorrection
  return {
    tangible, intangible, unclassifiedAccounting, impairment, disposal, lease,
    netFiscalCorrection,
    netTemporaryDifference,
    deferredTax: Math.round(netTemporaryDifference * TAX_RATE),
    taxRate: TAX_RATE,
  }
}

// ── Self-check (LR-9, OD-43) ────────────────────────────────────────────────

export type CheckState = 'passed' | 'failed' | 'incomplete'

export interface CheckResult {
  id: 'C1' | 'C2' | 'C3' | 'C4'
  state: CheckState
  detail: string
}

export interface TieRow {
  account: string
  name: string
  subLedger: number
  generalLedger: number
  /** Non-zero means the two disagree and the check has found something. */
  difference: number
}

export interface SelfCheckResult {
  period: Period
  runAt: string
  checks: CheckResult[]
  tie: TieRow[]
}

/**
 * The register's side of each control account at the end of `p`, as booked:
 * depreciation through the last posted run, events (which post their own
 * journal when recorded) through `p`. An unposted period is then not a
 * difference, and a journal from anywhere else is.
 */
function subLedgerBalances(p: Period): Record<Exclude<ControlAccount, 'other'>, number> {
  const through = bookedThrough(p)
  let cost = 0, accumulated = 0, expense = 0, impairment = 0, gain = 0
  for (const s of assetRecords.value) {
    const l = ledgers.value[s.id]!
    if (isHeldAt(l, p)) {
      cost += costAt(l.books.accounting, p)
      accumulated += accumulatedAsBooked(l, 'accounting', p) ?? 0
    }
    // A disposal in a period not yet posted derecognises that period's
    // charge along with the rest; the charge reaches the ledger when the
    // period posts. Until then the ledger is short of it, and so is this.
    const dp = l.books.accounting.disposal
    if (dp && isAfter(dp.period, through) && !isAfter(dp.period, p)) {
      accumulated -= chargesBetween(l, 'accounting', addPeriods(through, 1), dp.period) ?? 0
    }
    if (!isBefore(through, FY_START)) expense += chargesBetween(l, 'accounting', FY_START, through) ?? 0
    const inFy = (x: { period: Period }) => !isBefore(x.period, FY_START) && !isAfter(x.period, p)
    for (const i of l.books.accounting.impairments) if (inFy(i)) impairment += i.loss
    for (const r of l.books.accounting.reversals) if (inFy(r)) impairment -= r.applied
    const d = l.books.accounting.disposal
    if (d && inFy(d)) gain += d.gainLoss
    for (const x of l.books.accounting.partialDisposals) if (inFy(x)) gain += x.gainLoss
  }
  // Signed as the ledger holds them: debit positive, credit negative.
  return { '1-1600': cost, '1-1700': -accumulated, '6-5100': expense, '6-5200': impairment, '6-5300': -gain }
}

export function tieRows(p: Period = CURRENT_PERIOD): TieRow[] {
  const sub = subLedgerBalances(p)
  return CONTROL_ACCOUNTS.map((c) => {
    const gl = ledgerBalance(c.account, p)
    return { account: c.account, name: c.name, subLedger: sub[c.account], generalLedger: gl, difference: sub[c.account] - gl }
  })
}

function guarded(id: CheckResult['id'], fn: () => Omit<CheckResult, 'id'>): CheckResult {
  // A check that raises an error reports "did not complete", never a pass.
  try {
    return { id, ...fn() }
  } catch (err) {
    return { id, state: 'incomplete', detail: `The check stopped before it finished: ${(err as Error).message}` }
  }
}

/** Compute the four checks for a period, without retaining them. */
export function computeSelfCheck(p: Period = CURRENT_PERIOD): Omit<SelfCheckResult, 'runAt'> {
  const tie = tieRows(p)
  const checks: CheckResult[] = [
    guarded('C1', () => {
      const breaks = tie.filter((r) => r.difference !== 0)
      if (!breaks.length) return { state: 'passed', detail: 'Every account agrees' }
      return {
        state: 'failed',
        detail: breaks.map((b) => `${b.account} ${b.name} differs by ${rupiah(b.difference)}`).join('; '),
      }
    }),
    guarded('C2', () => {
      let checked = 0
      let none = 0
      const issues: string[] = []
      for (const s of assetRecords.value) {
        const l = ledgers.value[s.id]!
        for (const book of ['accounting', 'tax'] as Book[]) {
          const b = bookOf(l, book)
          if (!b) continue
          if (!hasSchedule(b)) { none += 1; continue }
          checked += 1
          const r = checkBookIntegrity(l, b)
          if (!r.ok) issues.push(...r.issues.slice(0, 1))
        }
      }
      const noneNote = none ? `, ${none} with no schedule because the life is indefinite` : ''
      return issues.length
        ? { state: 'failed', detail: `${issues.length} of ${checked} schedules do not tie: ${issues.join('; ')}` }
        : { state: 'passed', detail: `${checked} schedules checked, all tie${noneNote}` }
    }),
    guarded('C3', () => {
      const missing = assetRecords.value.filter((s) => {
        const l = ledgers.value[s.id]!
        return isHeldDuring(l, p) && !l.books.tax
      })
      return missing.length
        ? { state: 'failed', detail: `${missing.length} ${missing.length === 1 ? 'asset in the register is' : 'assets in the register are'} not in the tax book: ${missing.map((a) => a.id).join(', ')}` }
        : { state: 'passed', detail: 'Every asset is on both books' }
    }),
    guarded('C4', () => {
      const unclassified = assetRecords.value.filter((s) => !ledgers.value[s.id]!.books.tax && isHeldDuring(ledgers.value[s.id]!, p))
      if (unclassified.length) return { state: 'incomplete', detail: 'Cannot run until every asset carries a statutory group' }
      // The tax book population for the year: every asset with a tax book on
      // the register at any point in FY2026 up to `p`, disposals included.
      const inTaxBook = assetRecords.value.filter((s) => {
        const l = ledgers.value[s.id]!
        // A right-of-use asset's tax book is its lease payments, which are
        // deducted as they fall due and are on no line of the filing.
        if (!l.books.tax || isAfter(l.registeredFrom, p) || s.leaseId) return false
        return !(l.disposedIn && isBefore(l.disposedIn, FY_START))
      })
      const half1 = statutoryLines(p, 'Tangible').reduce((n, r) => n + r.assets, 0)
      const half2 = statutoryLines(p, 'Intangible').reduce((n, r) => n + r.assets, 0)
      const missing = inTaxBook.length - half1 - half2
      return missing
        ? { state: 'failed', detail: `${missing} ${missing === 1 ? 'asset in the tax book is' : 'assets in the tax book are'} on no line of the export` }
        : { state: 'passed', detail: 'The export covers the whole tax book' }
    }),
  ]
  return { period: p, checks, tie }
}

const selfCheckResults = ref<Record<Period, SelfCheckResult>>({})

function nowStamp(p: Period): string {
  const d = new Date()
  return `${periodEndDate(p)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Run the self-check for a period and retain the result against it. */
export function runSelfCheck(p: Period = CURRENT_PERIOD, runAt = nowStamp(p)): SelfCheckResult {
  const r: SelfCheckResult = { ...computeSelfCheck(p), runAt }
  selfCheckResults.value = { ...selfCheckResults.value, [p]: r }
  return r
}

export function selfCheckFor(p: Period = CURRENT_PERIOD): SelfCheckResult | null {
  return selfCheckResults.value[p] ?? null
}

/** Whether the module has changed since the retained result was taken. */
export function selfCheckIsStale(p: Period = CURRENT_PERIOD): boolean {
  const kept = selfCheckFor(p)
  if (!kept) return true
  const live = computeSelfCheck(p)
  return JSON.stringify(live.checks) !== JSON.stringify(kept.checks) || JSON.stringify(live.tie) !== JSON.stringify(kept.tie)
}

// ── Statutory export lines ──────────────────────────────────────────────────

export interface StatutoryLine {
  key: string
  assets: number
  cost: number
  /** FY charge on the tax book to `p`. */
  charge: number
  /** Tax book value at the end of `p` of the assets still held. */
  bookValue: number
}

/**
 * Lampiran 9, half 1 (tangible, by statutory group) or half 2 (intangible,
 * by statutory code). Every asset with a tax book that was on the register in
 * the year is on a line, including one disposed during it.
 */
export function statutoryLines(p: Period, type: 'Tangible' | 'Intangible'): StatutoryLine[] {
  const lines = new Map<string, StatutoryLine>()
  for (const s of assetRecords.value) {
    if (s.type !== type || s.leaseId) continue
    const l = ledgers.value[s.id]!
    if (!l.books.tax || isBefore(p, l.registeredFrom)) continue
    if (l.disposedIn && isBefore(l.disposedIn, FY_START)) continue
    const key = type === 'Tangible' ? (STATUTORY_GROUPS[l.taxGroup!]?.label ?? l.taxGroup!) : (s.statutoryCode ?? 'Not set')
    const line = lines.get(key) ?? { key, assets: 0, cost: 0, charge: 0, bookValue: 0 }
    line.assets += 1
    // A split parent is on the line for the part of the year it was held,
    // but its cost has passed to its children, so it is counted once.
    line.cost += isHeldAt(l, p) || l.disposedIn ? costAt(l.books.accounting, p) : 0
    line.charge += chargesBetween(l, 'tax', FY_START, p) ?? 0
    line.bookValue += bookValueAt(l, 'tax', p) ?? 0
    lines.set(key, line)
  }
  return [...lines.values()]
}

// ── Seeding and reset ───────────────────────────────────────────────────────

/** The periods already closed when the prototype opens, and when they posted. */
const SEEDED_POSTINGS: { period: Period; postedOn: string }[] = [
  { period: '2026-01', postedOn: '05/02/2026' },
  { period: '2026-02', postedOn: '04/03/2026' },
  { period: '2026-03', postedOn: '06/04/2026' },
  { period: '2026-04', postedOn: '05/05/2026' },
  { period: '2026-05', postedOn: '04/06/2026' },
  { period: '2026-06', postedOn: '06/07/2026' },
  { period: '2026-07', postedOn: '05/08/2026' },
  { period: '2026-08', postedOn: '04/09/2026' },
]

/** The two tests in the sample year. One found nothing, and is kept. */
function seedTests() {
  const fa68 = ledgers.value['FA-0068']!
  const imp = fa68.books.accounting.impairments[0]
  testRecords.value = [
    {
      id: 'IT-2026-01', assetId: 'FA-0068', assetName: seedById('FA-0068').name,
      date: '30/06/2026', indicator: 'Physical damage', recoverable: imp?.recoverable ?? 0,
      basis: 'Fair value less costs of disposal', source: 'Appraisal · PT Penilai Independen',
      author: 'Rizal Candra', eventId: imp?.eventId ?? null, carryingAtTest: imp?.carryingBefore ?? 0, kind: 'impairment',
    },
    {
      id: 'IT-2026-02', assetId: 'FA-0093', assetName: seedById('FA-0093').name,
      date: '31/12/2026', indicator: 'Annual test · indefinite life', recoverable: 1_050_000_000,
      basis: 'Value in use', source: 'Management projection',
      author: 'Sari Wulandari', eventId: null, carryingAtTest: seedById('FA-0093').cost, kind: 'impairment',
    },
  ]
}

/**
 * The ledger as it stood when the prototype opens, built from the same
 * engine: balances brought forward at 31/12/2025, the 2026 capitalisations,
 * the eight posted runs, the June impairment and the August disposal. From
 * here on the ledger moves only by journals, so it can disagree with the
 * register, and the self-check can find it.
 */
function seedLedger() {
  const opening = addPeriods(FY_START, -1)
  let cost = 0, acc = 0
  for (const s of assetSeeds) {
    const l = ledgers.value[s.id]!
    if (!isHeldAt(l, opening)) continue
    cost += l.cost
    acc += accumulatedAt(l.books.accounting, opening) ?? 0
  }
  const seeded: Journal[] = [{
    number: 'OB-2025', date: periodEndDate(opening), period: opening, source: 'opening',
    memo: 'Balances brought forward at 31/12/2025',
    lines: [
      { account: '1-1600 · Fixed assets at cost', description: 'Brought forward', debit: cost, credit: null, control: '1-1600' },
      { account: '1-1700 · Accumulated depreciation', description: 'Brought forward', debit: null, credit: acc, control: '1-1700' },
    ],
  }]
  for (const s of assetSeeds) {
    const l = ledgers.value[s.id]!
    if (isBefore(l.startPeriod, FY_START) || isAfter(l.startPeriod, CURRENT_PERIOD)) continue
    seeded.push({
      number: `AQ-${s.id}`, date: l.inServiceDate, period: l.startPeriod, source: 'acquisition',
      memo: `Capitalisation of ${s.id}`,
      lines: [
        { account: '1-1600 · Fixed assets at cost', description: `${s.id} ${s.name}`, debit: l.cost, credit: null, control: '1-1600' },
        { account: '2-1100 · Accounts payable', description: 'Supplier', debit: null, credit: l.cost, control: 'other' },
      ],
    })
  }
  journals.value = seeded
  runs.value = []
  for (const x of SEEDED_POSTINGS) {
    generateRun(x.period, x.postedOn)
    const draft = draftRunFor(x.period)!
    const number = nextJournal()
    journals.value = [...journals.value, {
      number, date: periodEndDate(x.period), period: x.period, source: 'depreciation',
      memo: `Depreciation for ${periodLabel(x.period)}`, lines: journalLinesFor(draft.lines),
    }]
    runs.value = runs.value.map((r) => (r.id === draft.id ? { ...r, state: 'posted' as const, journal: number, postedOn: x.postedOn } : r))
  }
  for (const s of assetSeeds) {
    const l = ledgers.value[s.id]!
    for (const e of l.events) {
      const j = journalForEvent(s.id, e, l)
      if (j) journals.value = [...journals.value, j]
    }
  }
}

/**
 * State kept outside this file (lease contracts, the class master, bulk edits,
 * migration evidence) that has to be reseeded with the register. A module registers once; its hook runs now and after
 * every reset, after the ledger is seeded and before the self-check.
 */
const resetHooks: (() => void)[] = []
export function onAssetStoreReset(fn: () => void) {
  resetHooks.push(fn)
  fn()
  restateSelfChecks()
}

/**
 * OD-43: each closed period ran its self-check when it posted, and the
 * result is retained against that period. Restated after any state that a
 * reset hook reseeds (leases add right-of-use assets to the register).
 */
function restateSelfChecks() {
  selfCheckResults.value = {}
  for (const x of SEEDED_POSTINGS) runSelfCheck(x.period, `${x.postedOn} 17:00`)
  runSelfCheck(CURRENT_PERIOD, '30/09/2026 17:04')
}

/**
 * OD-47. Set an intangible's statutory code. It is identity, not a figure:
 * the filing's intangible half moves to the new code line. Goodwill is
 * recognised as goodwill when it is created, so a code cannot make an asset
 * goodwill or stop it being goodwill.
 */
export function setStatutoryCode(id: string, code: string): { ok: true } | { ok: false; reason: string } {
  const s = recordById(id)
  if (!s) return { ok: false, reason: `No asset ${id}` }
  if (s.type !== 'Intangible') return { ok: false, reason: `${id} is a tangible asset. Statutory intangible codes apply to intangibles only.` }
  const toGoodwill = /goodwill/i.test(code)
  if (toGoodwill !== !!ledgers.value[id]?.isGoodwill) {
    return { ok: false, reason: toGoodwill
      ? 'Goodwill arises on a business combination and is recognised as goodwill when it is created. Create it as a new asset.'
      : `${id} is goodwill. Its code stays Goodwill, and its impairment can never be reversed.` }
  }
  assetRecords.value = assetRecords.value.map((x) => (x.id === id ? { ...x, statutoryCode: code } : x))
  return { ok: true }
}

/**
 * Withdraw an event recorded this session, for reversing a bulk edit as one
 * unit (OD-34). Only events that post nothing can be withdrawn: a statutory
 * classification, or an estimate revision whose period is still open. No
 * journal and no posted period depends on either, so no ledger history is
 * lost. The bulk edit keeps the evidence of the change and its reversal.
 */
export function retractEvent(assetId: string, eventId: string): string | null {
  const log = eventLog.value[assetId]
  const e = log?.find((x) => x.id === eventId)
  if (!log || !e) return `No event ${eventId} on ${assetId}`
  // Only the latest: a later event was built on this one, so it goes first.
  if (log[log.length - 1]!.id !== eventId) return `${assetId} has changed since. Its later change has to be undone first.`
  if (e.kind !== 'tax-classification' && e.kind !== 'estimate-revision') return `${eventId} posted to the ledger and cannot be withdrawn`
  if (e.kind === 'estimate-revision' && postedRunFor(e.period)) return `${periodLabel(e.period)} is posted since, so the revision stands. Record a new revision instead.`
  eventLog.value = { ...eventLog.value, [assetId]: log.filter((x) => x.id !== eventId) }
  return null
}

/** The fields of a record that are not money: they move no figure and post nothing. */
export type RecordField = 'class' | 'location' | 'custodian' | 'statutoryCode'

/** Change descriptive fields on an asset record (class, custody, statutory code). */
export function updateAssetRecord(id: string, patch: Partial<Pick<AssetSeed, RecordField>>): boolean {
  if (!recordById(id)) return false
  assetRecords.value = assetRecords.value.map((s) => (s.id === id ? { ...s, ...patch } : s))
  return true
}

/**
 * FG6-AC3 demonstration. LR-1 means nothing outside the module can post to
 * an asset control account, so the only way to show the reconciliation
 * failing is to post a journal as if another module had. It is labelled as a
 * demonstration wherever it appears, and it can be withdrawn.
 */
export function simulateDirectJournal(amount = 4_000_000, p: Period = CURRENT_PERIOD): Journal {
  const j: Journal = {
    number: nextJournal(), date: periodEndDate(p), period: p, source: 'manual',
    memo: 'Demonstration: a journal posted outside the asset module',
    lines: [
      { account: '6-5100 · Depreciation and amortisation', description: 'Manual adjustment (demonstration)', debit: amount, credit: null, control: '6-5100' },
      { account: '2-1900 · Accrued liabilities', description: 'Manual adjustment (demonstration)', debit: null, credit: amount, control: 'other' },
    ],
  }
  journals.value = [...journals.value, j]
  return j
}

/** Withdraw the demonstration journals, so the ledger is the module's alone again. */
export function withdrawDirectJournals(): number {
  const n = journals.value.filter((j) => j.source === 'manual').length
  journals.value = journals.value.filter((j) => j.source !== 'manual')
  return n
}

/** Every self-check result retained this session, one per period, latest period first. */
export function retainedSelfChecks(): SelfCheckResult[] {
  return Object.values(selfCheckResults.value).sort((a, b) => (a.period < b.period ? 1 : -1))
}

/** Return every piece of session state to the sample data. */
export function resetAssetStore() {
  journalSeq = 118
  resetAssetPolicy()
  assetRecords.value = [...assetSeeds]
  viewAs.value = 'Owner'
  eventLog.value = Object.fromEntries(assetSeeds.map((s) => [s.id, seedEvents(s)]))
  seedLedger()
  seedTests()
  for (const fn of resetHooks) fn()
  restateSelfChecks()
}

resetAssetStore()

/**
 * The self-check restates itself whenever the module changes (a period
 * posted or reversed, an event recorded, a group set), so the result retained
 * against the period is never older than the state it describes.
 */
watch(
  () => JSON.stringify(computeSelfCheck(CURRENT_PERIOD)),
  () => { runSelfCheck(CURRENT_PERIOD) },
)

// Re-exported so screens can reach the engine's helpers through one import.
export { periodLabel, periodEndDate, periodFromIndex, rupiah }
