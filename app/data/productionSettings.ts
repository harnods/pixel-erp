/**
 * Settings → Production (prod: /v3/company/setting/production).
 * General settings, production readiness and integration toggles. Persisted to
 * localStorage so a saved change survives reload.
 */

const STORAGE_KEY = 'erp-db:production-settings'

export type PlanPeriodRule = 'hide' | 'optional' | 'required'
export const PLAN_PERIOD_OPTIONS: { id: PlanPeriodRule; name: string }[] = [
  { id: 'hide', name: 'Hide' },
  { id: 'optional', name: 'Optional' },
  { id: 'required', name: 'Required' },
]

export interface ProductionSettings {
  productionPlanDate: PlanPeriodRule
  backdated: boolean
  /** Partial production and partial consumption are mutually exclusive. */
  partialProduction: boolean
  partialConsumption: boolean
  salesOrderIntegration: boolean
}

const DEFAULTS: ProductionSettings = {
  productionPlanDate: 'optional',
  backdated: true,
  partialProduction: true,
  partialConsumption: false,
  salesOrderIntegration: false,
}

export function getProductionSettings(): ProductionSettings {
  if (!import.meta.client) return { ...DEFAULTS }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<ProductionSettings>) } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveProductionSettings(v: ProductionSettings): void {
  if (!import.meta.client) return
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)) } catch { /* non-fatal */ }
}
