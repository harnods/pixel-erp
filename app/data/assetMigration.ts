/**
 * OD-03 and OD-29. Bringing the existing register onto both books.
 *
 * The cut-over is 31/12/2025. For every asset held then:
 *  - the commercial opening is reconstructed from the asset's own history
 *    (acquisition and the depreciation charged since), and its total is
 *    reconciled to the opening balances the ledger carries (OB-2025);
 *  - the fiscal opening is computed from the statutory group and the
 *    in-service date, and can be edited, because the prior tax working paper
 *    is what the tax office has already seen.
 *
 * Activation is refused while any asset's fiscal opening differs from the
 * prior system, and the differing assets are listed (FG6-AC4). Every
 * reconciliation run is retained for the session as evidence.
 *
 * The prior system's figures are the one input here that is not computed:
 * they are what the old working paper says. They are stated as the computed
 * figure plus the specific error the old paper carried, so the difference is
 * explained rather than invented.
 */
import { computed, ref } from 'vue'
import {
  assetRecords, ledgers, ledgerBalance, recordEvent, actingUser, viewAs, onAssetStoreReset,
  CURRENT_PERIOD, FY_START,
} from './assetStore'
import {
  addPeriods, accumulatedAt, costAt, isHeldAt, periodOfDate, liveRowAt, rupiah,
  type Period, type TaxClassificationEvent,
} from './assetEngine'

export const CUTOVER: Period = addPeriods(FY_START, -1)
export const CUTOVER_DATE = '31/12/2025'

/** Where the prior tax working paper departs from the statutory computation, and why. */
const PRIOR_PAPER_ERRORS: Record<string, { reason: string; delta: (id: string) => number }> = {
  'FA-0047': {
    reason: 'The prior working paper started tax depreciation in February 2024, a month after the vehicle went into service',
    delta: (id) => -(firstTaxCharge(id)),
  },
  'FA-0064': {
    reason: 'The prior working paper carried the generator at a figure rounded to the nearest million',
    delta: (id) => {
      const c = computedFiscalAccumulated(id) ?? 0
      return Math.round(c / 1_000_000) * 1_000_000 - c
    },
  },
}

function firstTaxCharge(id: string): number {
  const l = ledgers.value[id]!
  const t = l.books.tax
  if (!t) return 0
  return liveRowAt(t, periodOfDate(l.inServiceDate))?.charge ?? 0
}

/** Fiscal accumulated at the cut-over as the tax book computes it now. */
function computedFiscalAccumulated(id: string): number | null {
  const t = ledgers.value[id]?.books.tax
  return t ? accumulatedAt(t, CUTOVER) ?? 0 : null
}

export interface MigrationRow {
  id: string
  name: string
  cost: number
  /** Reconstructed from the asset's history. Not editable. */
  commercialAccumulated: number
  /** From the statutory group. Null with no group: the asset cannot come onto the tax book. */
  computedFiscal: number | null
  /** What will be carried: the computed figure unless edited. */
  fiscalOpening: number | null
  edited: boolean
  /** The prior tax working paper's accumulated fiscal depreciation. */
  priorFiscal: number | null
  priorNote: string | null
  /** fiscalOpening less priorFiscal. */
  difference: number | null
}

/** Edited fiscal openings, by asset. Session only. */
const fiscalEdits = ref<Record<string, number>>({})

export interface ReconciliationEvidence {
  number: string
  at: string
  by: string
  commercial: { registerCost: number; ledgerCost: number; registerAccumulated: number; ledgerAccumulated: number }
  fiscal: { register: number; prior: number }
  /**
   * The count the result line names: the assets that differ when the run
   * differs, the whole population when it reconciles.
   */
  assets: number
  /** Every asset the migration covers. */
  population: number
  differing: { id: string; name: string; fiscalOpening: number; priorFiscal: number; difference: number }[]
  result: 'reconciled' | 'differs'
  /** Set on the run that activation used. */
  activation: 'activated' | 'refused' | null
}

export const reconciliations = ref<ReconciliationEvidence[]>([])
export const migrationActivated = ref<{ at: string; by: string; evidence: string; openingsSet: string[] } | null>(null)
let seq = 0

onAssetStoreReset(() => {
  fiscalEdits.value = {}
  reconciliations.value = []
  migrationActivated.value = null
  seq = 0
})

/** The assets the migration covers: held at the cut-over. */
function population() {
  return assetRecords.value.filter((s) => isHeldAt(ledgers.value[s.id]!, CUTOVER))
}

export const migrationRows = computed<MigrationRow[]>(() => population().map((s) => {
  const l = ledgers.value[s.id]!
  const computedFiscal = computedFiscalAccumulated(s.id)
  const edited = s.id in fiscalEdits.value && !migrationActivated.value
  const fiscalOpening = computedFiscal === null ? null : edited ? fiscalEdits.value[s.id]! : computedFiscal
  const err = PRIOR_PAPER_ERRORS[s.id]
  // Once activated, the tax book carries the agreed opening, so the prior
  // paper and the book agree by definition; the evidence keeps the history.
  const priorFiscal = computedFiscal === null ? null
    : migrationActivated.value ? computedFiscal
    : computedFiscal + (err ? err.delta(s.id) : 0)
  return {
    id: s.id,
    name: s.name,
    cost: costAt(l.books.accounting, CUTOVER),
    commercialAccumulated: accumulatedAt(l.books.accounting, CUTOVER) ?? 0,
    computedFiscal,
    fiscalOpening,
    edited,
    priorFiscal,
    priorNote: err && !migrationActivated.value && err.delta(s.id) !== 0 ? err.reason : null,
    difference: fiscalOpening === null || priorFiscal === null ? null : fiscalOpening - priorFiscal,
  }
}))

export const canMigrate = computed(() => viewAs.value === 'Owner' || viewAs.value === 'Accounting')

/** Edit the fiscal opening for one asset. Returns a refusal or null. */
export function setFiscalOpening(id: string, accumulated: number | null): string | null {
  if (migrationActivated.value) return 'The migration is activated. Fiscal openings are on the tax book now; change them there.'
  if (!canMigrate.value) return `Viewing as ${viewAs.value}. A migration reconciliation needs the Owner or Accounting role.`
  const row = migrationRows.value.find((r) => r.id === id)
  if (!row || row.computedFiscal === null) return `${id} has no tax book to open`
  if (accumulated === null) {
    const { [id]: _, ...rest } = fiscalEdits.value
    fiscalEdits.value = rest
    return null
  }
  if (accumulated < 0 || accumulated > row.cost) return `The fiscal accumulated depreciation must be between 0 and the cost of ${rupiah(row.cost)}`
  fiscalEdits.value = { ...fiscalEdits.value, [id]: accumulated }
  return null
}

function stamp(): string {
  const d = new Date()
  return `30/09/2026 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

/** The ledger's opening balances at the cut-over, from the journals. */
export function ledgerOpening() {
  return { cost: ledgerBalance('1-1600', CUTOVER), accumulated: -ledgerBalance('1-1700', CUTOVER) }
}

/** Reconcile and retain the result. */
export function reconcileMigration(activation: ReconciliationEvidence['activation'] = null): ReconciliationEvidence {
  const rows = migrationRows.value
  const ob = ledgerOpening()
  const differing = rows
    .filter((r) => (r.difference ?? 0) !== 0)
    .map((r) => ({ id: r.id, name: r.name, fiscalOpening: r.fiscalOpening!, priorFiscal: r.priorFiscal!, difference: r.difference! }))
  const commercial = {
    registerCost: rows.reduce((s, r) => s + r.cost, 0),
    ledgerCost: ob.cost,
    registerAccumulated: rows.reduce((s, r) => s + r.commercialAccumulated, 0),
    ledgerAccumulated: ob.accumulated,
  }
  const commercialTies = commercial.registerCost === commercial.ledgerCost && commercial.registerAccumulated === commercial.ledgerAccumulated
  seq += 1
  const ev: ReconciliationEvidence = {
    number: `MR-2026-${String(seq).padStart(3, '0')}`,
    at: stamp(),
    by: actingUser.value,
    commercial,
    fiscal: {
      register: rows.reduce((s, r) => s + (r.fiscalOpening ?? 0), 0),
      prior: rows.reduce((s, r) => s + (r.priorFiscal ?? 0), 0),
    },
    assets: differing.length === 0 && commercialTies ? rows.length : differing.length,
    population: rows.length,
    differing,
    result: differing.length === 0 && commercialTies ? 'reconciled' : 'differs',
    activation,
  }
  reconciliations.value = [ev, ...reconciliations.value]
  return ev
}

export type ActivationResult = { ok: true; evidence: ReconciliationEvidence } | { ok: false; reason: string; evidence?: ReconciliationEvidence }

/**
 * Activate: refused while anything differs. On success each edited fiscal
 * opening becomes the tax book's opening at the cut-over, so the tax book
 * charges the remaining life from there. It posts nothing.
 */
export function activateMigration(): ActivationResult {
  if (migrationActivated.value) return { ok: false, reason: `Activated on ${migrationActivated.value.at}` }
  if (!canMigrate.value) return { ok: false, reason: `Viewing as ${viewAs.value}. A migration reconciliation needs the Owner or Accounting role.` }
  const pre = migrationRows.value
  const willDiffer = pre.some((r) => (r.difference ?? 0) !== 0)
  const ev = reconcileMigration(willDiffer ? 'refused' : 'activated')
  if (ev.result !== 'reconciled') {
    const n = ev.differing.length
    return {
      ok: false,
      evidence: ev,
      reason: n
        ? `Activation refused. ${n} ${n === 1 ? 'asset differs' : 'assets differ'} from the prior system: ${ev.differing.map((d) => d.id).join(', ')}`
        : 'Activation refused. The register does not reconcile to the opening balances in the ledger.',
    }
  }
  const openingsSet: string[] = []
  for (const r of pre) {
    if (!r.edited || r.fiscalOpening === r.computedFiscal) continue
    const l = ledgers.value[r.id]!
    const basis = l.books.tax!.bases[0]!
    const e: Omit<TaxClassificationEvent, 'id'> = {
      kind: 'tax-classification', period: CURRENT_PERIOD, date: CUTOVER_DATE, recordedBy: actingUser.value,
      taxGroup: l.taxGroup!,
      tax: { method: basis.method, lifeMonths: basis.lifeMonths, residual: 0, opening: { period: FY_START, accumulated: r.fiscalOpening! } },
    }
    const res = recordEvent(r.id, e)
    if (!res.ok) return { ok: false, reason: `${r.id}: ${res.reason}` }
    openingsSet.push(r.id)
  }
  migrationActivated.value = { at: ev.at, by: ev.by, evidence: ev.number, openingsSet }
  fiscalEdits.value = {}
  return { ok: true, evidence: ev }
}
