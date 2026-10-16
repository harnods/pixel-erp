/**
 * Production module settings.
 *
 * Settings that change what the Production screens offer, rather than what any
 * one record contains. They live here so a screen reads the flag instead of
 * hard-coding the behaviour. Edited on the Production settings page
 * (SettingsProductionPage.vue) and persisted, so a change survives a reload.
 */
import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'

export interface ProductionSettings {
  /**
   * Whether a work order can be closed for part of its quantity, leaving the
   * balance open ("partially produced"), instead of only all-or-nothing.
   *
   * Off means the work order offers completion alone (R21). On a subcon order it
   * also decides when components are issued: per partial record when on, all at
   * Start when off (R3, R4).
   */
  partialProduction: boolean
  /**
   * Whether new subcontracting BOMs and work orders can be created. Off hides
   * the Subcontracting category on both forms and blocks Create work order from
   * a subcon BOM; existing subcon records stay viewable and keep working.
   */
  subcontracting: boolean
  /*
   * The four below are stored and editable but not yet read by any screen —
   * agreed scope for the settings page (2026-10-16). Wire each into its
   * screen before relying on it.
   */
  /** Whether a production plan must carry a plan period. */
  requirePlanPeriod: boolean
  /** Whether production entries may be dated before today. */
  allowBackdatedEntries: boolean
  /** Whether material consumption can be recorded in stages. */
  partialConsumption: boolean
  /** Whether a work order can be requested straight from a sales order. */
  salesOrderToWorkOrder: boolean
}

const SNAPSHOT_KEY = 'production-settings-v1'
const DEFAULTS: ProductionSettings = {
  partialProduction: true,
  subcontracting: true,
  requirePlanPeriod: true,
  allowBackdatedEntries: true,
  partialConsumption: true,
  salesOrderToWorkOrder: true,
}

/** Reactive, so a screen reading a flag updates the moment it is saved. */
export const productionSettings = reactive<ProductionSettings>({
  ...DEFAULTS,
  ...(loadSnapshot<ProductionSettings>(SNAPSHOT_KEY)?.[0] ?? {}),
})

/** Save the settings and apply them everywhere at once. */
export function saveProductionSettings(next: ProductionSettings): void {
  Object.assign(productionSettings, next)
  saveSnapshot(SNAPSHOT_KEY, [{ ...productionSettings }])
}
