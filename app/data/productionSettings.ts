import { reactive, watch } from 'vue'

/**
 * Production settings — the three groups in the Figma
 * "Production Material Requisition & Reservation" › Production settings:
 * production planning, production readiness, and component request & reservation.
 *
 * Cross-reference: PRD v0.5 "Work Order Material Reservation & Stock Request" ›
 * UC-00 — S-1 method, S-2 entry-point gating, S-3 retained v1 settings (partial
 * consume / partial completion, mutually exclusive), S-4 start with limited stock.
 *
 * Reservation is ALWAYS ON (L-12): it is a structural part of the work order flow,
 * and a tenant wanting minimal control picks One-step (auto), not off. The method
 * is the only choice. An earlier build carried a "Komponen produk harus
 * direservasi" toggle, as the Figma still draws it; that toggle is gone and a
 * tenant who had it OFF migrates to Two-step, so nothing auto-allocates on upgrade.
 */
export type PlanDateField = 'required' | 'optional' | 'hidden'
export type ReservationMethod = 'one-step' | 'two-step'

/**
 * S-3 — partial consume and partial completion are MUTUALLY EXCLUSIVE, so they are
 * one three-way choice rather than two booleans that can contradict each other.
 * The settings page still renders them as the two toggles the Figma draws; picking
 * one clears the other, which this type makes unrepresentable rather than merely
 * policed.
 *
 *  • `none`       — neither.
 *  • `consume`    — material may be consumed in tranches (partial consume).
 *  • `completion` — output may be posted in tranches (partial completion).
 */
export type PartialMode = 'none' | 'consume' | 'completion'

export interface ProductionSettings {
  // ── Production planning ──────────────────────────────────────────────────
  /** Whether the production-plan date column is required, optional or hidden. */
  planDateField: PlanDateField
  /** Allow work order dates earlier than today. */
  allowBackdate: boolean

  // ── Production readiness ─────────────────────────────────────────────────
  /**
   * S-3 — partial consume / partial completion / neither. See {@link PartialMode}.
   * Also decides the work order START gate (UC-04): each partial mode lets a job
   * begin short in the way it can actually use. See `startGate`.
   */
  partialMode: PartialMode

  /**
   * S-4 — "start with limited stock". Governs the work order START gate only
   * (UC-04, D-8), and nothing else: whether a job may begin without full coverage
   * is a material-control decision, separate from partial consume / partial
   * completion, which govern what may happen AFTER start. What it permits depends
   * on which partial mode is active — see `startGate`.
   */
  allowStartWithLimitedStock: boolean

  // ── Component request & reservation ──────────────────────────────────────
  /**
   * S-1 — who reserves, and when.
   *  • `one-step` — components auto-reserve once the work order is created, for
   *    every line the destination warehouse fully covers; Production may also
   *    reserve from the work order page.
   *  • `two-step` — reservation is done by sending a request to the warehouse;
   *    PPIC/stockist reserves from Stock requests and every reservation entry
   *    point on work order surfaces is HIDDEN (S-2).
   */
  reservationMethod: ReservationMethod
}

/** S-3 — the two toggles the Figma draws, mapped onto the single {@link PartialMode}. */
export const PARTIAL_MODE_TOGGLES: { mode: Exclude<PartialMode, 'none'>; label: string; hint: string }[] = [
  {
    mode: 'consume',
    label: 'Allow partial consume',
    hint: 'Issue and consume material in stages, before the full planned quantity is available.',
  },
  {
    mode: 'completion',
    label: 'Allow partial completion',
    hint: 'Close a work order in batches, before the full planned quantity is produced.',
  },
]

export const PLAN_DATE_FIELD_OPTIONS: { value: PlanDateField; label: string }[] = [
  { value: 'required', label: 'Mandatory' },
  { value: 'optional', label: 'Optional' },
  { value: 'hidden',   label: 'Hidden'   },
]

export const RESERVATION_METHOD_OPTIONS: { value: ReservationMethod; label: string; description: string }[] = [
  {
    value: 'one-step',
    label: 'One step',
    description: 'Components are reserved automatically from available stock once the work order is created',
  },
  {
    value: 'two-step',
    label: 'Two steps',
    description: 'Components are reserved by sending a request to the warehouse',
  },
]

const STORAGE_KEY = 'erp.productionSettings'

function load(): ProductionSettings {
  const fallback: ProductionSettings = {
    planDateField: 'required',
    allowBackdate: false,
    partialMode: 'none',
    allowStartWithLimitedStock: false,
    reservationMethod: 'one-step',
  }
  if (typeof localStorage === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    return { ...fallback, ...migrate(JSON.parse(raw) as LegacySettings) }
  } catch {
    return fallback
  }
}

/** The shape written by builds before PRD v0.5 — still sitting in localStorage. */
type LegacySettings = Partial<ProductionSettings> & {
  allowPartialProduction?: boolean
  /** The retired reservation master switch (L-12). OFF migrates to Two-step. */
  componentsMustBeReserved?: boolean
}

/**
 * Carry a pre-v0.5 settings object forward, so anyone who used an earlier build
 * doesn't silently drop back to the defaults.
 *
 *  • `allowPartialProduction` → `partialMode: 'consume'`. v0.4's single toggle
 *    covered consuming in tranches; v0.5 splits that from partial completion.
 *  • `componentsMustBeReserved: false` → `reservationMethod: 'two-step'` (L-12's
 *    migration note). Reservation can no longer be switched off, and Two-step is
 *    the reading that allocates nothing on upgrade: every line waits for PPIC.
 *    A saved `true` carries no information — it was the default — and is dropped.
 */
function migrate(saved: LegacySettings): Partial<ProductionSettings> {
  const { allowPartialProduction, componentsMustBeReserved, ...rest } = saved
  const next: Partial<ProductionSettings> = { ...rest }
  if (next.partialMode === undefined && allowPartialProduction) next.partialMode = 'consume'
  if (componentsMustBeReserved === false) next.reservationMethod = 'two-step'
  return next
}

export const productionSettings = reactive<ProductionSettings>(load())

export function saveProductionSettings(next: Partial<ProductionSettings>): void {
  Object.assign(productionSettings, next)
}

if (typeof localStorage !== 'undefined') {
  watch(productionSettings, (v) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)) } catch { /* private mode — settings stay in memory */ }
  }, { deep: true })
}

/**
 * L-12 — reservation is structural and cannot be switched off. Kept as a function
 * so the call sites that ask the question read the same as they always did.
 */
export const reservationEnabled = (): boolean => true

/**
 * S-2 — are reservation entry points shown on work order surfaces? Also the
 * answer to "does One-step auto-reserve fire" (C-3), since both mean the same:
 * Production reserves from the work order.
 *
 * Under Two-step they are HIDDEN, not disabled: reservation belongs to PPIC on the
 * Stock requests page, and a greyed-out button on a page you are not meant to act
 * from only invites a support ticket. The work order shows an info note instead.
 */
export const reservationOnWorkOrder = (): boolean =>
  productionSettings.reservationMethod === 'one-step'

/** S-4 — may a work order start without full coverage? See `startGate` for what it then permits. */
export const startWithLimitedStockOn = (): boolean => productionSettings.allowStartWithLimitedStock

/** S-3 — convenience readers for the mutually exclusive partial modes. */
export const partialConsumeOn = (): boolean => productionSettings.partialMode === 'consume'
export const partialCompletionOn = (): boolean => productionSettings.partialMode === 'completion'
