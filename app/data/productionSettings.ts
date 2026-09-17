import { reactive, watch } from 'vue'

/**
 * Production settings — the three groups in the Figma
 * "Production Material Requisition & Reservation" › Production settings:
 * production planning, production readiness, and component request & reservation.
 *
 * Cross-reference: PRD "Work Order Material Reservation, Stock Request & Project
 * Stock" › UC-00 (S-1 method, S-2 entry-point gating, S-3 retained v1 settings).
 * NOTE: PRD v0.4 removed the "components must be reserved" toggle and made
 * reservation always-on; the design still carries it, so it is modelled here —
 * see `componentsMustBeReserved`.
 */
export type PlanDateField = 'required' | 'optional' | 'hidden'
export type ReservationMethod = 'one-step' | 'two-step'

export interface ProductionSettings {
  // ── Production planning ──────────────────────────────────────────────────
  /** Whether the production-plan date column is required, optional or hidden. */
  planDateField: PlanDateField
  /** Allow work order dates earlier than today. */
  allowBackdate: boolean

  // ── Production readiness ─────────────────────────────────────────────────
  /** Produce and close a work order in partial batches. */
  allowPartialProduction: boolean
  /**
   * The work order START gate (PRD D-8): when off, Start is blocked until every
   * component is reserved; when on, a work order may start short.
   */
  allowStartWithLimitedStock: boolean

  // ── Component request & reservation ──────────────────────────────────────
  /**
   * Master switch for the whole reservation flow — reservation is triggered when
   * a work order is created. When off, work orders raise no stock request, show
   * no reservation actions, and the start gate does not apply.
   */
  componentsMustBeReserved: boolean
  /**
   * S-1 — who reserves, and when. Only meaningful while
   * {@link ProductionSettings.componentsMustBeReserved} is on.
   *  • `one-step` — components auto-reserve once the work order is created, for
   *    every line the destination warehouse fully covers; Production may also
   *    reserve from the work order page.
   *  • `two-step` — reservation is done by sending a request to the warehouse;
   *    PPIC/stockist reserves from Stock requests and every reservation entry
   *    point on work order surfaces is HIDDEN (S-2).
   */
  reservationMethod: ReservationMethod
}

export const PLAN_DATE_FIELD_OPTIONS: { value: PlanDateField; label: string }[] = [
  { value: 'required', label: 'Mandatory' },
  { value: 'optional', label: 'Optional' },
  { value: 'hidden',   label: 'Hidden'   },
]

export const RESERVATION_METHOD_OPTIONS: { value: ReservationMethod; label: string; description: string }[] = [
  {
    value: 'one-step',
    label: 'One step',
    description: 'Components are reserved automatically once the work order is created',
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
    allowPartialProduction: false,
    allowStartWithLimitedStock: false,
    componentsMustBeReserved: true,
    reservationMethod: 'one-step',
  }
  if (typeof localStorage === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...fallback, ...JSON.parse(raw) as Partial<ProductionSettings> } : fallback
  } catch {
    return fallback
  }
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

/** Does the reservation flow run at all? */
export const reservationEnabled = (): boolean => productionSettings.componentsMustBeReserved

/** S-2 — are reservation entry points shown on work order surfaces? */
export const reservationOnWorkOrder = (): boolean =>
  productionSettings.componentsMustBeReserved && productionSettings.reservationMethod === 'one-step'
