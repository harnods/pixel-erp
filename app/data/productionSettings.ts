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
}

const SNAPSHOT_KEY = 'production-settings-v1'
const DEFAULTS: ProductionSettings = { partialProduction: true }

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
