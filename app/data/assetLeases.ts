/**
 * Leases and right-of-use assets (FG-8, PSAK 73).
 *
 * A lease contract holds its terms: start, term, monthly payment, discount
 * rate, options, and whether it is exempt. Everything else is computed from
 * those terms and the modifications recorded against them:
 *
 *  - the liability schedule (opening, interest, payment, closing), unwinding
 *    at the discount rate with payments in arrears;
 *  - the right-of-use asset, created in the ordinary register with the
 *    initial liability as its cost. It depreciates through the standard
 *    engine, so it appears in every run, journal and self-check like any
 *    other asset (OD-38);
 *  - a modification remeasures the liability at the revised payments and
 *    term, and the asset moves by the same amount through a
 *    'lease-remeasurement' event, so its schedule regenerates prospectively
 *    and nothing posted moves (OD-39).
 *
 * A short-term or low-value lease is exempt: no right-of-use asset and no
 * liability, the payments are expensed as they fall due (FG-8.3).
 *
 * The tax book of a right-of-use asset is the contract payments, deducted as
 * they fall due, not the discounted liability (FG-8.5). It is set up as a
 * book whose cost is the undiscounted payments, charged one payment a month.
 */
import { ref, computed } from 'vue'
import {
  addPeriods, isAfter, isBefore, monthsBetween, periodOfDate, periodLabel, periodEndDate,
  chargeAt, bookValueAt, type Period, type AssetEvent,
} from './assetEngine'
import {
  createAsset, recordEvent, previewEvent, ledgers, onAssetStoreReset, earliestEffectivePeriod,
  actingUser, canChangeValue, viewAs, postedRunFor, CURRENT_PERIOD, FY_START,
} from './assetStore'

export type LeaseExemption = 'short-term' | 'low-value'

export interface LeaseModification {
  id: string
  /** The period the remeasurement takes effect from (its first day). */
  period: Period
  /** Months added to the term; negative shortens it. */
  extraMonths: number
  /** The revised monthly payment. */
  payment: number
  /** The revised annual discount rate, as a fraction. */
  annualRate: number
  reason: string
  recordedBy: string
  /** The right-of-use event it produced. */
  eventId: string | null
}

export interface LeaseContract {
  id: string
  name: string
  /** What is leased, for the register's location field. */
  underlying: string
  branch: string
  /** dd/mm/yyyy, the commencement date. */
  startDate: string
  termMonths: number
  monthlyPayment: number
  /** Annual incremental borrowing rate, as a fraction (0.09 is 9%). */
  annualRate: number
  /** Extension or termination options, as the contract states them. */
  options: string
  exemption: LeaseExemption | null
  rouAssetId: string | null
  modifications: LeaseModification[]
  recordedBy: string
}

export interface LiabilityRow {
  period: Period
  opening: number
  interest: number
  payment: number
  /** payment less interest: what reduces the liability. */
  principal: number
  closing: number
  /** Set on the first row of a remeasured schedule. */
  remeasured?: { from: number; to: number }
}

/** Monthly rate from an annual one. Nominal, compounded monthly. */
const monthly = (annual: number) => annual / 12

/** Present value of `n` payments in arrears, whole rupiah. */
export function presentValue(payment: number, n: number, annualRate: number): number {
  const r = monthly(annualRate)
  if (n <= 0) return 0
  if (r === 0) return payment * n
  return Math.round(payment * (1 - Math.pow(1 + r, -n)) / r)
}

/**
 * The liability unwinding over `n` months. Interest is whole rupiah on the
 * opening balance; the final month's interest takes the residue so the
 * schedule closes at exactly zero (the engine's rounding rule).
 */
function amortise(from: Period, opening: number, payment: number, n: number, annualRate: number): LiabilityRow[] {
  const r = monthly(annualRate)
  const rows: LiabilityRow[] = []
  let bal = opening
  for (let i = 0; i < n; i++) {
    const last = i === n - 1
    const interest = last ? payment - bal : Math.round(bal * r)
    const closing = last ? 0 : bal + interest - payment
    rows.push({ period: addPeriods(from, i), opening: bal, interest, payment, principal: payment - interest, closing })
    bal = closing
  }
  return rows
}

export interface LeaseSchedule {
  startPeriod: Period
  endPeriod: Period
  initialLiability: number
  rows: LiabilityRow[]
  /** The term, payment and rate in force now, after any modification. */
  current: { termMonths: number; payment: number; annualRate: number }
}

/** The whole liability schedule, rebuilt from the terms and modifications. */
export function leaseSchedule(l: LeaseContract): LeaseSchedule {
  const start = periodOfDate(l.startDate)
  const initial = presentValue(l.monthlyPayment, l.termMonths, l.annualRate)
  let rows = amortise(start, initial, l.monthlyPayment, l.termMonths, l.annualRate)
  let current = { termMonths: l.termMonths, payment: l.monthlyPayment, annualRate: l.annualRate }
  for (const m of [...l.modifications].sort((a, b) => a.period.localeCompare(b.period))) {
    const r = remeasure(rows, m)
    rows = r.rows
    current = { termMonths: current.termMonths + m.extraMonths, payment: m.payment, annualRate: m.annualRate }
  }
  if (l.exemption) rows = rows.map((x) => ({ ...x, opening: 0, interest: 0, principal: 0, closing: 0 }))
  return {
    startPeriod: start,
    endPeriod: rows.length ? rows[rows.length - 1]!.period : start,
    initialLiability: l.exemption ? 0 : initial,
    rows,
    current,
  }
}

function remeasure(rows: LiabilityRow[], m: Pick<LeaseModification, 'period' | 'extraMonths' | 'payment' | 'annualRate'>) {
  const kept = rows.filter((x) => isBefore(x.period, m.period))
  const carrying = kept.length ? kept[kept.length - 1]!.closing : rows[0]?.opening ?? 0
  const end = rows.length ? rows[rows.length - 1]!.period : m.period
  const remaining = monthsBetween(m.period, end) + 1 + m.extraMonths
  const revised = presentValue(m.payment, remaining, m.annualRate)
  const next = amortise(m.period, revised, m.payment, remaining, m.annualRate)
  if (next[0]) next[0] = { ...next[0], remeasured: { from: carrying, to: revised } }
  return { rows: [...kept, ...next], carrying, revised, remaining }
}

/** The liability at the end of `p`. Zero before commencement and after the end. */
export function liabilityAt(l: LeaseContract, p: Period = CURRENT_PERIOD): number {
  const s = leaseSchedule(l)
  if (isBefore(p, s.startPeriod)) return 0
  const row = s.rows.find((x) => x.period === p)
  return row ? row.closing : 0
}

/** The liability row for a period, or null outside the term. */
export function liabilityRowAt(l: LeaseContract, p: Period): LiabilityRow | null {
  return leaseSchedule(l).rows.find((x) => x.period === p) ?? null
}

/** An exempt lease's payments expensed in the year to `p`. */
export function expensedToDate(l: LeaseContract, p: Period = CURRENT_PERIOD): number {
  return leaseSchedule(l).rows
    .filter((x) => !isBefore(x.period, FY_START) && !isAfter(x.period, p))
    .reduce((s, x) => s + x.payment, 0)
}

// ── State ───────────────────────────────────────────────────────────────────

export const leases = ref<LeaseContract[]>([])

/** The sample contracts: inputs only. Every figure is computed from them. */
const SEED_LEASES: Omit<LeaseContract, 'rouAssetId' | 'modifications' | 'recordedBy'>[] = [
  {
    id: 'LS-004', name: 'Cakung Leased Warehouse', underlying: 'Warehouse, Jl. Cakung Cilincing', branch: 'Central Jakarta',
    startDate: '01/02/2025', termMonths: 60, monthlyPayment: 38_500_000, annualRate: 0.09,
    options: 'Extension option of 12 months at the lessee\'s choice', exemption: null,
  },
  {
    id: 'LS-005', name: 'Medan Branch Office', underlying: 'Office floor, Jl. Gatot Subroto Medan', branch: 'Medan',
    startDate: '01/07/2024', termMonths: 60, monthlyPayment: 19_000_000, annualRate: 0.095,
    options: 'Termination option after 36 months with 6 months notice', exemption: null,
  },
  {
    id: 'LS-006', name: 'Fleet, 4 × Hino Dutro', underlying: '4 × Hino Dutro 130 HD box trucks', branch: 'Surabaya',
    startDate: '01/03/2026', termMonths: 60, monthlyPayment: 26_000_000, annualRate: 0.1,
    options: 'Purchase option at the end of the term', exemption: null,
  },
  {
    id: 'LS-007', name: 'Bekasi overflow storage', underlying: 'Container yard bay, Bekasi', branch: 'Central Jakarta',
    startDate: '01/07/2026', termMonths: 6, monthlyPayment: 7_500_000, annualRate: 0.09,
    options: 'None', exemption: 'short-term',
  },
]

const rouIdFor = (leaseId: string) => `ROU-${leaseId.replace(/\D/g, '').padStart(4, '0')}`

function recogniseRou(l: LeaseContract): { ok: true; id: string } | { ok: false; reason: string } {
  const liability = presentValue(l.monthlyPayment, l.termMonths, l.annualRate)
  return createAsset({
    id: rouIdFor(l.id),
    name: `Right-of-use · ${l.name}`,
    class: 'Right-of-use assets',
    branch: l.branch,
    cost: liability,
    inServiceDate: l.startDate,
    lifeMonths: l.termMonths,
    residual: 0,
    method: 'straight-line',
    taxGroup: 'Lease payments',
    tax: { method: 'straight-line', lifeMonths: l.termMonths, residual: 0, cost: l.monthlyPayment * l.termMonths },
    leaseId: l.id,
    location: l.underlying,
    debitAccount: '1-1650 · Right-of-use assets',
    creditAccount: '2-2500 · Lease liability',
  })
}

function seedLeases() {
  leases.value = []
  for (const s of SEED_LEASES) {
    const l: LeaseContract = { ...s, rouAssetId: null, modifications: [], recordedBy: 'Sari Wulandari' }
    if (!l.exemption) {
      const r = recogniseRou(l)
      if (r.ok) l.rouAssetId = r.id
    }
    leases.value.push(l)
  }
}

onAssetStoreReset(seedLeases)

export function findLease(id: string): LeaseContract | undefined {
  return leases.value.find((l) => l.id === id)
}

export function leaseOfAsset(assetId: string): LeaseContract | undefined {
  return leases.value.find((l) => l.rouAssetId === assetId)
}

function nextLeaseId(): string {
  const n = Math.max(0, ...leases.value.map((l) => Number(l.id.replace(/\D/g, '')) || 0)) + 1
  return `LS-${String(n).padStart(3, '0')}`
}
export const peekLeaseId = computed(() => nextLeaseId())

// ── Recording a lease (OD-37, OD-38) ────────────────────────────────────────

export interface LeaseInput {
  name: string
  underlying: string
  branch: string
  startDate: string
  termMonths: number
  monthlyPayment: number
  annualRatePct: number
  options: string
  exemption: LeaseExemption | null
}

export type LeaseResult =
  | { ok: true; lease: LeaseContract }
  | { ok: false; errors: Record<string, string> }

/** A short-term lease is 12 months or less (PSAK 73). */
export const SHORT_TERM_MONTHS = 12

export function validateLease(v: LeaseInput): Record<string, string> {
  const e: Record<string, string> = {}
  if (!canChangeValue.value) e.form = `Viewing as ${viewAs.value}. Recording a lease needs the Owner or Accounting role.`
  if (!v.name.trim()) e.name = 'Name the lease'
  if (!v.branch) e.branch = 'Choose a branch'
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v.startDate.trim())
  const d = m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null
  if (!m || !d || d.getDate() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1) e.startDate = 'Enter the commencement date as dd/mm/yyyy'
  else if (Number(m[3]) < 2020) e.startDate = 'This prototype holds leases starting from 2020'
  else if (isAfter(periodOfDate(v.startDate.trim()), CURRENT_PERIOD)) e.startDate = 'A lease is recorded when it commences, on or before today'
  if (!Number.isInteger(v.termMonths) || v.termMonths <= 0) e.termMonths = 'Enter the term in whole months'
  if (!v.monthlyPayment || v.monthlyPayment <= 0) e.monthlyPayment = 'Enter the monthly payment'
  if (!(v.annualRatePct >= 0) || v.annualRatePct > 50) e.annualRatePct = 'Enter the discount rate as a percentage, 0 to 50'
  if (v.exemption === 'short-term' && v.termMonths > SHORT_TERM_MONTHS) {
    e.exemption = `A short-term lease runs ${SHORT_TERM_MONTHS} months or less. This one runs ${v.termMonths}.`
  }
  return e
}

/**
 * Record a lease. A lease that is neither short-term nor low-value creates
 * its right-of-use asset in the register at once, with its capitalisation
 * journal against the lease liability and, for a lease that started before
 * the open period, the depreciation the posted runs never charged
 * (FG8-AC1). An exempt lease creates nothing in the register (FG8-AC2).
 */
export function createLease(v: LeaseInput): LeaseResult {
  const errors = validateLease(v)
  if (Object.keys(errors).length) return { ok: false, errors }
  const l: LeaseContract = {
    id: nextLeaseId(), name: v.name.trim(), underlying: v.underlying.trim() || v.name.trim(), branch: v.branch,
    startDate: v.startDate.trim(), termMonths: v.termMonths, monthlyPayment: v.monthlyPayment,
    annualRate: v.annualRatePct / 100, options: v.options.trim() || 'None', exemption: v.exemption,
    rouAssetId: null, modifications: [], recordedBy: actingUser.value,
  }
  if (!l.exemption) {
    const r = recogniseRou(l)
    if (!r.ok) return { ok: false, errors: { form: r.reason } }
    l.rouAssetId = r.id
  }
  leases.value = [...leases.value, l]
  return { ok: true, lease: l }
}

// ── Modification (OD-39) ────────────────────────────────────────────────────

export interface ModificationInput {
  period: Period
  extraMonths: number
  payment: number
  annualRatePct: number
  reason: string
}

export interface ModificationPreview {
  ok: boolean
  errors: Record<string, string>
  refusal?: string
  liabilityBefore: number
  liabilityAfter: number
  adjustment: number
  newEnd: Period | null
  remainingMonths: number
  rou?: {
    id: string
    carryingBefore: number | null
    carryingAfter: number | null
    chargeBefore: number | null
    chargeAfter: number | null
    taxChargeBefore: number | null
    taxChargeAfter: number | null
  }
  event?: Omit<AssetEvent, 'id'>
}

function modificationEvent(l: LeaseContract, v: ModificationInput) {
  const s = leaseSchedule(l)
  const r = remeasure(s.rows, { period: v.period, extraMonths: v.extraMonths, payment: v.payment, annualRate: v.annualRatePct / 100 })
  const oldRemaining = monthsBetween(v.period, s.endPeriod) + 1
  const elapsed = monthsBetween(s.startPeriod, v.period)
  const event = {
    kind: 'lease-remeasurement' as const, period: v.period, date: `01/${v.period.slice(5)}/${v.period.slice(0, 4)}`,
    recordedBy: actingUser.value, leaseId: l.id,
    amount: r.revised - r.carrying,
    taxAmount: v.payment * r.remaining - s.current.payment * oldRemaining,
    lifeMonths: { accounting: elapsed + r.remaining, tax: elapsed + r.remaining },
  }
  return { r, event }
}

/**
 * What a modification would do, without recording it: the liability before
 * and after, the right-of-use adjustment (the same amount, so no gain or
 * loss on an extension), and the asset's charge before and after, read from
 * a replay of the asset's log with the event added.
 */
export function previewModification(leaseId: string, v: ModificationInput): ModificationPreview {
  const l = findLease(leaseId)
  const blank: ModificationPreview = { ok: false, errors: {}, liabilityBefore: 0, liabilityAfter: 0, adjustment: 0, newEnd: null, remainingMonths: 0 }
  if (!l) return { ...blank, refusal: `No lease ${leaseId}` }
  const errors: Record<string, string> = {}
  if (l.exemption) return { ...blank, refusal: `${l.id} is exempt. There is no liability or right-of-use asset to remeasure.` }
  const s = leaseSchedule(l)
  if (!Number.isInteger(v.extraMonths)) errors.extraMonths = 'Enter the change in term in whole months'
  if (!v.payment || v.payment <= 0) errors.payment = 'Enter the revised monthly payment'
  if (!(v.annualRatePct >= 0) || v.annualRatePct > 50) errors.annualRatePct = 'Enter the discount rate as a percentage, 0 to 50'
  if (isBefore(v.period, s.startPeriod) || isAfter(v.period, s.endPeriod)) errors.period = `Choose a period inside the term, ${periodLabel(s.startPeriod)} to ${periodLabel(s.endPeriod)}`
  else if (monthsBetween(v.period, s.endPeriod) + 1 + v.extraMonths <= 0) errors.extraMonths = 'The revised term must leave at least one month from the effective period'
  if (!v.reason.trim()) errors.reason = 'Say what changed in the contract'
  if (Object.keys(errors).length) return { ...blank, errors }
  const { r, event } = modificationEvent(l, v)
  const out: ModificationPreview = {
    ok: true, errors: {}, liabilityBefore: r.carrying, liabilityAfter: r.revised, adjustment: r.revised - r.carrying,
    newEnd: addPeriods(v.period, r.remaining - 1), remainingMonths: r.remaining, event: event as Omit<AssetEvent, 'id'>,
  }
  if (!canChangeValue.value) return { ...out, ok: false, refusal: `Viewing as ${viewAs.value}. Modifying a lease needs the Owner or Accounting role.` }
  if (l.rouAssetId) {
    const pv = previewEvent(l.rouAssetId, event as Omit<AssetEvent, 'id'>)
    if (!pv.ok || !pv.after) return { ...out, ok: false, refusal: pv.reason }
    const prev = addPeriods(v.period, -1)
    out.rou = {
      id: l.rouAssetId,
      carryingBefore: bookValueAt(pv.before, 'accounting', prev),
      carryingAfter: (bookValueAt(pv.before, 'accounting', prev) ?? 0) + out.adjustment,
      chargeBefore: chargeAt(pv.before, 'accounting', v.period).charge,
      chargeAfter: chargeAt(pv.after, 'accounting', v.period).charge,
      taxChargeBefore: chargeAt(pv.before, 'tax', v.period).charge,
      taxChargeAfter: chargeAt(pv.after, 'tax', v.period).charge,
    }
  }
  return out
}

/** Record a modification. The asset's event is the commit; the lease follows it. */
export function modifyLease(leaseId: string, v: ModificationInput): { ok: true } | { ok: false; reason: string } {
  const pv = previewModification(leaseId, v)
  if (!pv.ok) return { ok: false, reason: pv.refusal ?? Object.values(pv.errors)[0] ?? 'The modification cannot be recorded' }
  const l = findLease(leaseId)!
  let eventId: string | null = null
  if (l.rouAssetId) {
    const r = recordEvent(l.rouAssetId, pv.event!)
    if (!r.ok) return { ok: false, reason: r.reason }
    eventId = r.event.id
  }
  const m: LeaseModification = {
    id: `${l.id}-M${l.modifications.length + 1}`, period: v.period, extraMonths: v.extraMonths,
    payment: v.payment, annualRate: v.annualRatePct / 100, reason: v.reason.trim(), recordedBy: actingUser.value, eventId,
  }
  leases.value = leases.value.map((x) => (x.id === l.id ? { ...x, modifications: [...x.modifications, m] } : x))
  return { ok: true }
}

/** The form's starting point: extend by twelve months from the open period, terms unchanged. */
export function blankModification(l: LeaseContract): ModificationInput {
  const s = leaseSchedule(l)
  return {
    period: earliestEffectivePeriod.value, extraMonths: 12, payment: s.current.payment,
    annualRatePct: Math.round(s.current.annualRate * 10000) / 100, reason: '',
  }
}

// ── What the screens read ───────────────────────────────────────────────────

export interface LeaseScheduleRow extends LiabilityRow {
  /** Right-of-use depreciation that month, from the engine. Null for an exempt lease. */
  rouCharge: number | null
  /** The tax deduction that month: the payment. */
  taxDeduction: number
  state: 'posted' | 'open' | 'projected'
}

/** The combined schedule: the liability and the asset charge, month by month. */
export function combinedSchedule(l: LeaseContract): LeaseScheduleRow[] {
  const led = l.rouAssetId ? ledgers.value[l.rouAssetId] : null
  return leaseSchedule(l).rows.map((row) => ({
    ...row,
    rouCharge: led ? chargeAt(led, 'accounting', row.period).charge : null,
    taxDeduction: row.payment,
    state: isAfter(row.period, CURRENT_PERIOD) ? 'projected' : postedRunFor(row.period) ? 'posted' : 'open',
  }))
}

export interface LeaseSummary {
  lease: LeaseContract
  term: string
  liability: number
  rouBookValue: number | null
  /** This month: the asset charge (operating expense) and the interest (finance cost). */
  month: { rouCharge: number | null; interest: number; payment: number; expensed: number }
  fyExpensed: number
}

export function leaseSummary(l: LeaseContract, p: Period = CURRENT_PERIOD): LeaseSummary {
  const s = leaseSchedule(l)
  const row = s.rows.find((x) => x.period === p)
  const led = l.rouAssetId ? ledgers.value[l.rouAssetId] : null
  return {
    lease: l,
    term: `${l.startDate} – ${periodEndDate(s.endPeriod)}`,
    liability: l.exemption ? 0 : liabilityAt(l, p),
    rouBookValue: led ? bookValueAt(led, 'accounting', p) : null,
    month: {
      rouCharge: led ? chargeAt(led, 'accounting', p).charge : null,
      interest: l.exemption ? 0 : row?.interest ?? 0,
      payment: row?.payment ?? 0,
      expensed: l.exemption ? row?.payment ?? 0 : 0,
    },
    fyExpensed: l.exemption ? expensedToDate(l, p) : 0,
  }
}

export const leaseSummaries = computed(() => leases.value.map((l) => leaseSummary(l)))

export const leaseTotals = computed(() => ({
  count: leases.value.length,
  recognised: leases.value.filter((l) => !l.exemption).length,
  exempt: leases.value.filter((l) => l.exemption).length,
  liability: leaseSummaries.value.reduce((s, x) => s + x.liability, 0),
  rou: leaseSummaries.value.reduce((s, x) => s + (x.rouBookValue ?? 0), 0),
  expensed: leaseSummaries.value.reduce((s, x) => s + x.fyExpensed, 0),
}))
