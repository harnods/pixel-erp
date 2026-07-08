/**
 * Per-warehouse operational configuration — distinct from the GLOBAL toggles in
 * SettingsWarehousePage.vue (erp-db:warehouse-settings), which apply to every
 * warehouse. These flags are scoped to a single warehouse id.
 */

const STORAGE_KEY = 'erp-db:warehouse-config'

export interface WarehouseConfig {
  /** ON (default) = picking runs normally. OFF = outbound orders in this warehouse
   *  skip picking entirely and go straight to packing. */
  pickingEnabled: boolean
  /** ON (default) = put-away runs normally. OFF = receiving tasks in this warehouse
   *  skip put-away entirely — finishing receiving is the end of inbound. */
  putAwayEnabled: boolean
  allowPartialPicking: boolean
  qcModule: boolean
}

// Everything runs normally by default, except QC module (opt-in per warehouse).
const DEFAULTS: WarehouseConfig = {
  pickingEnabled: true,
  putAwayEnabled: true,
  allowPartialPicking: true,
  qcModule: false,
}

function loadAll(): Record<string, WarehouseConfig> {
  if (!import.meta.client) return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function persistAll(v: Record<string, WarehouseConfig>): void {
  if (!import.meta.client) return
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)) } catch { /* ignore */ }
}

/**
 * This warehouse's config, defaults filled in for any missing/never-saved keys.
 * Partial picking can never be on while Picking itself is off — enforced here so
 * every reader sees a consistent value regardless of how/when it was saved.
 */
export function getWarehouseConfig(warehouseId: string): WarehouseConfig {
  const saved = loadAll()[warehouseId]
  const config = { ...DEFAULTS, ...saved }
  if (!config.pickingEnabled) config.allowPartialPicking = false
  return config
}

export function saveWarehouseConfig(warehouseId: string, config: WarehouseConfig): void {
  const all = loadAll()
  all[warehouseId] = config
  persistAll(all)
}
