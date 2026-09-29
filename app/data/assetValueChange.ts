/**
 * Changing an asset (PRD UX6, FG-3): one entry point, eight kinds of change.
 *
 * This module turns what the drawer asks for into an engine event, checks it
 * the way the PRD asks (an effective period inside a posted one is refused
 * with the earliest permitted period named, an improvement that fails the
 * capitalisation test is refused), and computes the preview: the schedule on
 * both books before and after, from the same engine replay that committing
 * would run. Nothing here stores anything.
 */
import {
  ledgers, previewEvent, nextChildIds, earliestEffectivePeriod, impairmentCarried, actingUser,
  FY_START, CURRENT_PERIOD,
  type EventPreview, type ImpairmentTest,
} from './assetStore'
import {
  chargeAt, bookValueAt, addPeriods, periodLabel, periodEndDate, formatLife, rupiah, isBefore,
  type AssetEvent, type AssetLedger, type Book, type Period, type Method,
} from './assetEngine'

export type ValueAction =
  | 'correct' | 'revise' | 'improve' | 'split' | 'dispose-part' | 'dispose' | 'impair' | 'reverse'

export const VALUE_ACTIONS: { key: ValueAction; label: string; hint: string }[] = [
  { key: 'correct', label: 'Correct an error', hint: 'The cost was entered wrong. Posted periods are caught up in the effective period, never edited.' },
  { key: 'revise', label: 'Revise useful life or method', hint: 'A change in estimate. Accounting book only, from the effective period on.' },
  { key: 'improve', label: 'Capitalise an improvement', hint: 'Added to this asset\'s cost from the effective period. No second asset is created.' },
  { key: 'split', label: 'Split', hint: 'Divide the asset into parts with their own numbers, on one ratio, on both books.' },
  { key: 'dispose-part', label: 'Dispose of part', hint: 'Sell or scrap a proportion. The rest carries on as this asset.' },
  { key: 'dispose', label: 'Dispose', hint: 'Sell or scrap the whole asset.' },
  { key: 'impair', label: 'Record an impairment test', hint: 'Kept whatever it finds. An impairment is written down in the accounts only.' },
  { key: 'reverse', label: 'Reverse an impairment', hint: 'A later test finds the value has recovered. Capped at the unimpaired carrying amount.' },
]

/** Events applied after the period's charge rather than before it. */
export function isEndOfPeriod(a: ValueAction): boolean {
  return a === 'dispose-part' || a === 'dispose' || a === 'impair' || a === 'reverse'
}

export interface ValueChangeForm {
  action: ValueAction
  period: Period
  correctedCost: string
  reason: string
  lifeYears: string
  method: Method
  residual: string
  amount: string
  /** PSAK 16: future economic benefit is probable and the cost is reliably measured. */
  passesCapitalisationTest: boolean
  extendsLife: boolean
  extendedLifeYears: string
  parts: { percent: string; name: string }[]
  percent: string
  proceeds: string
  recoverable: string
  indicator: string
  basis: ImpairmentTest['basis']
  source: string
}

export function blankForm(assetId: string, action: ValueAction = 'revise'): ValueChangeForm {
  const l = ledgers.value[assetId]
  const acc = l?.books.accounting
  const basis = acc?.bases[acc.bases.length - 1]
  return {
    action,
    period: earliestEffectivePeriod.value,
    correctedCost: '',
    reason: '',
    lifeYears: basis?.lifeMonths ? String(basis.lifeMonths / 12) : '',
    method: basis?.method === 'reducing-balance' ? 'reducing-balance' : 'straight-line',
    residual: String(basis?.residual ?? 0),
    amount: '',
    passesCapitalisationTest: false,
    extendsLife: false,
    extendedLifeYears: '',
    parts: [{ percent: '50', name: '' }, { percent: '50', name: '' }],
    percent: '',
    proceeds: '',
    recoverable: '',
    indicator: '',
    basis: 'Fair value less costs of disposal',
    source: '',
  }
}

/** Whole rupiah from what was typed, ignoring separators. Null when empty. */
export function parseRupiah(v: string): number | null {
  const digits = String(v ?? '').replace(/[^\d]/g, '')
  return digits ? Number(digits) : null
}
function parseNumber(v: string): number | null {
  const t = String(v ?? '').trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** The periods offered for an effective date: this year and the next. */
export function periodOptions(): { value: Period; label: string }[] {
  return Array.from({ length: 24 }, (_, i) => addPeriods(FY_START, i))
    .map((p) => ({ value: p, label: periodLabel(p) }))
}

/** The event's own date: the first of the month, or its last day for an end-of-period event. */
function eventDate(action: ValueAction, p: Period): string {
  return isEndOfPeriod(action) ? periodEndDate(p) : `01/${p.slice(5)}/${p.slice(0, 4)}`
}

export type BuiltEvent =
  | { ok: true; event: Omit<AssetEvent, 'id'> }
  | { ok: false; field: string; error: string }

/** Each case builds one member of the union; the switch has checked which. */
const ok = (event: object): BuiltEvent => ({ ok: true, event: event as Omit<AssetEvent, 'id'> })

/** Turn the form into an event, or say which field is wrong and why. */
export function buildEvent(assetId: string, f: ValueChangeForm): BuiltEvent {
  const base = { period: f.period, date: eventDate(f.action, f.period), recordedBy: actingUser.value }
  const l = ledgers.value[assetId]!
  const fail = (field: string, error: string): BuiltEvent => ({ ok: false, field, error })
  switch (f.action) {
    case 'correct': {
      const c = parseRupiah(f.correctedCost)
      if (!c) return fail('correctedCost', 'Enter the cost as it should have been recorded')
      if (c === l.acquisitionCost) return fail('correctedCost', 'That is the cost already recorded')
      if (!f.reason.trim()) return fail('reason', 'Say what the error was')
      return ok({ ...base, kind: 'cost-correction', correctedCost: c, reason: f.reason.trim() })
    }
    case 'revise': {
      const years = parseNumber(f.lifeYears)
      if (!years || years <= 0) return fail('lifeYears', 'Enter the new total useful life in years')
      const residual = parseRupiah(f.residual) ?? 0
      if (residual >= l.cost) return fail('residual', 'The residual value must be below the cost')
      const cur = l.books.accounting.bases[l.books.accounting.bases.length - 1]!
      const lifeMonths = Math.round(years * 12)
      const e: Record<string, unknown> = { ...base, kind: 'estimate-revision', book: 'accounting' }
      if (lifeMonths !== cur.lifeMonths) e.lifeMonths = lifeMonths
      if (f.method !== cur.method) e.method = f.method
      if (residual !== cur.residual) e.residual = residual
      if (Object.keys(e).length === 5) return fail('lifeYears', 'Nothing has changed: the life, method and residual are as recorded')
      return ok(e)
    }
    case 'improve': {
      const amount = parseRupiah(f.amount)
      if (!amount) return fail('amount', 'Enter what the improvement cost')
      if (!f.passesCapitalisationTest) {
        return fail('passesCapitalisationTest', 'Only spending that brings future economic benefit, at a cost that can be measured reliably, is added to the asset. A repair or routine servicing is an expense: record it as a bill instead.')
      }
      let lifeMonths: { accounting: number } | undefined
      if (f.extendsLife) {
        const y = parseNumber(f.extendedLifeYears)
        if (!y || y <= 0) return fail('extendedLifeYears', 'Enter the new total useful life in years')
        lifeMonths = { accounting: Math.round(y * 12) }
      }
      return ok({ ...base, kind: 'improvement', amount, ...(lifeMonths ? { lifeMonths } : {}) })
    }
    case 'split': {
      if (f.parts.length < 2) return fail('parts', 'A split needs at least two parts')
      const pcts = f.parts.map((x) => parseNumber(x.percent))
      if (pcts.some((x) => x === null || x <= 0)) return fail('parts', 'Give every part a share above 0%')
      const total = pcts.reduce<number>((s, x) => s + (x ?? 0), 0)
      if (Math.abs(total - 100) > 1e-9) return fail('parts', `The shares add up to ${total.toLocaleString('id-ID')}%, not 100%`)
      const ids = nextChildIds(f.parts.length)
      return ok({
        ...base, kind: 'split',
        parts: f.parts.map((x, i) => ({ childId: ids[i]!, proportion: (pcts[i] as number) / 100, name: x.name.trim() || undefined })),
      })
    }
    case 'dispose-part': {
      const pctv = parseNumber(f.percent)
      if (pctv === null || pctv <= 0 || pctv >= 100) return fail('percent', 'Enter the share disposed of, above 0% and below 100%')
      const proceeds = parseRupiah(f.proceeds) ?? 0
      return ok({ ...base, kind: 'partial-disposal', proportion: pctv / 100, proceeds })
    }
    case 'dispose': {
      const proceeds = parseRupiah(f.proceeds) ?? 0
      return ok({ ...base, kind: 'disposal', proceeds })
    }
    case 'impair': {
      if (!f.indicator) return fail('indicator', 'Choose what prompted the test')
      const r = parseRupiah(f.recoverable)
      if (r === null) return fail('recoverable', 'Enter the recoverable amount')
      if (!f.source.trim()) return fail('source', 'Say where the recoverable amount came from')
      return ok({ ...base, kind: 'impairment', recoverable: r })
    }
    case 'reverse': {
      const r = parseRupiah(f.recoverable)
      if (r === null) return fail('recoverable', 'Enter the recoverable amount the new test found')
      if (!f.source.trim()) return fail('source', 'Say where the recoverable amount came from')
      return ok({ ...base, kind: 'impairment-reversal', recoverable: r })
    }
  }
}

// ── Preview ─────────────────────────────────────────────────────────────────

export interface PreviewRow {
  period: Period
  label: string
  before: number | null
  after: number | null
  beforeAbsent?: string
  afterAbsent?: string
  /** Carrying amount at the end of the period after the change. */
  carryingAfter: number | null
  applied: boolean
}

export interface PreviewBook {
  book: Book
  label: string
  /** The first period whose charge moves. */
  firstChanged: Period
  chargeBefore: number | null
  chargeAfter: number | null
  carryingBefore: number | null
  carryingAfter: number | null
  costBefore: number
  costAfter: number | null
  lifeBefore: string
  lifeAfter: string
  unchanged: boolean
  rows: PreviewRow[]
  gainLoss?: number
  catchUp?: number
  note?: string
}

export interface ValuePreview {
  refusal?: string
  error?: { field: string; error: string }
  books: PreviewBook[]
  children: { id: string; name: string; proportion: number; accounting: number | null; tax: number | null; chargeAccounting: number | null; chargeTax: number | null }[]
  childTotals?: { accounting: number | null; tax: number | null; parentAccounting: number | null; parentTax: number | null }
  reversal?: { carrying: number; recoverable: number; unimpaired: number; uncapped: number; cap: number; applied: number; capApplied: boolean }
  impairment?: { carrying: number; recoverable: number; loss: number }
  warnings: string[]
  event?: Omit<AssetEvent, 'id'>
}

function sumOrNull(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => x !== null)
  return v.length ? v.reduce((s, x) => s + x, 0) : null
}

function lifeOf(l: AssetLedger, book: Book, p: Period): string {
  const b = book === 'accounting' ? l.books.accounting : l.books.tax
  if (!b) return 'No book'
  let found = b.bases[0]!
  for (const x of b.bases) if (!isBefore(p, x.fromPeriod)) found = x
  return found.lifeMonths === null ? 'Indefinite' : `${formatLife(found.lifeMonths)}, ${found.remainingMonths} months from ${periodLabel(found.fromPeriod)}`
}

/** What committing would do, on both books, read from a replay of the log. */
export function previewValueChange(assetId: string, f: ValueChangeForm, name: (id: string, i: number) => string = (id) => id): ValuePreview {
  const built = buildEvent(assetId, f)
  if (!built.ok) return { error: { field: built.field, error: built.error }, books: [], children: [], warnings: [] }
  const pv: EventPreview = previewEvent(assetId, built.event)
  if (!pv.ok || !pv.after) return { refusal: pv.reason, books: [], children: [], warnings: [], event: built.event }
  const before = pv.before
  const after = pv.after
  const kids = pv.children
  const P = f.period
  const firstChanged = isEndOfPeriod(f.action) ? addPeriods(P, 1) : P
  const lastApplied = addPeriods(P, -1)
  const periods = Array.from({ length: 7 }, (_, i) => addPeriods(lastApplied, i))
  const warnings: string[] = []

  const books: PreviewBook[] = (['accounting', 'tax'] as Book[]).filter((bk) => (bk === 'accounting' ? before.books.accounting : before.books.tax)).map((bk) => {
    // Before the split period the parent still carried the asset; from it, the parts do.
    const afterCharge = (p: Period) => kids.length && !isBefore(p, P)
      ? { charge: sumOrNull(kids.map((k) => chargeAt(k, bk, p).charge)), absent: 'Split' }
      : chargeAt(after, bk, p)
    const afterCarrying = (p: Period) => kids.length && !isBefore(p, P)
      ? sumOrNull(kids.map((k) => bookValueAt(k, bk, p)))
      : bookValueAt(after, bk, p)
    const rows: PreviewRow[] = periods.map((p) => {
      const b = chargeAt(before, bk, p)
      const a = afterCharge(p)
      return {
        period: p, label: periodLabel(p), before: b.charge, after: a.charge,
        ...(b.charge === null ? { beforeAbsent: b.absent } : {}),
        ...(a.charge === null ? { afterAbsent: a.absent } : {}),
        carryingAfter: afterCarrying(p),
        applied: isBefore(p, P),
      }
    })
    const bb = bk === 'accounting' ? after.books.accounting : after.books.tax!
    const out: PreviewBook = {
      book: bk,
      label: bk === 'accounting' ? 'Accounting book' : 'Tax book',
      firstChanged,
      chargeBefore: chargeAt(before, bk, firstChanged).charge,
      chargeAfter: afterCharge(firstChanged).charge,
      carryingBefore: bookValueAt(before, bk, isEndOfPeriod(f.action) ? P : lastApplied),
      carryingAfter: afterCarrying(P),
      costBefore: before.cost,
      costAfter: kids.length ? sumOrNull(kids.map((k) => k.cost)) : after.disposedIn ? null : after.cost,
      lifeBefore: lifeOf(before, bk, firstChanged),
      lifeAfter: kids.length ? lifeOf(kids[0]!, bk, firstChanged) : lifeOf(after, bk, firstChanged),
      unchanged: rows.every((r) => r.before === r.after) && bookValueAt(before, bk, P) === afterCarrying(P),
      rows,
    }
    const pd = bb.partialDisposals.find((x) => x.period === P)
    if (f.action === 'dispose-part' && pd) out.gainLoss = pd.gainLoss
    if (f.action === 'dispose' && bb.disposal) out.gainLoss = bb.disposal.gainLoss
    const cc = bb.corrections[bb.corrections.length - 1]
    if (f.action === 'correct' && cc) out.catchUp = cc.catchUp
    if (f.action === 'revise' && bk === 'tax') out.note = 'Unchanged. The tax life is fixed by the statutory group.'
    if (f.action === 'improve' && bk === 'tax') out.note = 'Assumed: added to the tax cost and depreciated over the remaining tax life. Pending tax team confirmation (PRD OQ4).'
    if ((f.action === 'impair' || f.action === 'reverse') && bk === 'tax') out.note = 'Unchanged. Tax does not recognise an impairment until the loss is realised.'
    return out
  })

  const res: ValuePreview = { books, children: [], warnings, event: built.event }

  if (kids.length) {
    res.children = kids.map((k, i) => ({
      id: k.id, name: name(k.id, i),
      proportion: (built.event as unknown as { parts: { proportion: number }[] }).parts[i]!.proportion,
      accounting: bookValueAt(k, 'accounting', lastApplied) ?? (k.cost - (k.books.accounting.bases[0]!.openingAccumulated)),
      tax: k.books.tax ? k.cost - k.books.tax.bases[0]!.openingAccumulated : null,
      chargeAccounting: chargeAt(k, 'accounting', P).charge,
      chargeTax: k.books.tax ? chargeAt(k, 'tax', P).charge : null,
    }))
    res.childTotals = {
      accounting: sumOrNull(res.children.map((c) => c.accounting)),
      tax: sumOrNull(res.children.map((c) => c.tax)),
      parentAccounting: bookValueAt(before, 'accounting', lastApplied),
      parentTax: bookValueAt(before, 'tax', lastApplied),
    }
  }

  const rv = after.books.accounting.reversals.find((r) => r.period === P && !before.books.accounting.reversals.some((x) => x.eventId === r.eventId))
  if (f.action === 'reverse' && rv) {
    res.reversal = { carrying: rv.carryingBefore, recoverable: rv.recoverable, unimpaired: rv.unimpaired, uncapped: rv.uncapped, cap: rv.cap, applied: rv.applied, capApplied: rv.capApplied }
  }
  const im = after.books.accounting.impairments.find((i) => !before.books.accounting.impairments.some((x) => x.eventId === i.eventId))
  if (f.action === 'impair' && im) res.impairment = { carrying: im.carryingBefore, recoverable: im.recoverable, loss: im.loss }

  if (f.action === 'revise') {
    const nb = after.books.accounting.bases[after.books.accounting.bases.length - 1]!
    if (nb.lifeEndedAtRevision) {
      warnings.push(`A useful life of ${formatLife(nb.lifeMonths)} ended before ${periodLabel(P)}. The whole remaining ${rupiah(nb.depreciable)} is charged in ${periodLabel(P)}.`)
    }
  }
  if (f.action === 'correct') {
    // A data-entry error is wrong on both books, so both are caught up.
    const ups = books.filter((b) => b.catchUp)
    if (ups.length) {
      const what = ups.map((b) => `${rupiah(b.catchUp!)} on the ${b.book === 'accounting' ? 'accounting' : 'tax'} book`).join(' and ')
      warnings.push(`Periods already posted charged depreciation on the wrong cost. ${periodLabel(P)} carries a catch-up of ${what}, so no posted period is edited.`)
    }
  }
  if (f.action === 'reverse' && impairmentCarried(before, P) <= 0) warnings.push('No impairment is carried on this asset.')
  return res
}

/** The period a change can take effect in by default, and why. */
export function effectiveNote(): string {
  const p = earliestEffectivePeriod.value
  return isBefore(CURRENT_PERIOD, p)
    ? `Every period to ${periodLabel(CURRENT_PERIOD)} is posted. The earliest a change can take effect is ${periodLabel(p)}.`
    : `Periods before ${periodLabel(p)} are posted. The earliest a change can take effect is ${periodLabel(p)}.`
}
