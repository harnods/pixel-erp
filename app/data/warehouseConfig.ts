import { getStorageLeaves, type StorageLeaf } from './storageLocations'

/**
 * Orders a warehouse's Storage-type leaves by an explicit rank (highest priority
 * first); anything not in `ranked` (new locations, or ones never ranked) falls to
 * the end, ascending by name path — the documented fallback for "no priority set".
 * Shared by effectiveLocationPriority() and the Configure warehouse page/drawer so
 * the preview always matches what actually gets saved.
 */
export function rankStorageLeaves(leaves: StorageLeaf[], ranked: string[]): StorageLeaf[] {
  const byId = new Map(leaves.map((l) => [l.id, l]))
  const out: StorageLeaf[] = []
  for (const id of ranked) {
    const l = byId.get(id)
    if (l) { out.push(l); byId.delete(id) }
  }
  out.push(...[...byId.values()].sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true })))
  return out
}

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
  requireSourceLabel: boolean
  preventDuplicateLabel: boolean
  /** Manager-set priority order (Storage-type leaf location ids, highest first) for
   *  auto-reserving stock when an outbound doesn't already specify a location. Not a
   *  toggle: auto-selection always runs when a location is omitted — this is the
   *  rule it follows. Empty = no priority set, so it falls back to ascending name path. */
  locationPriority: string[]
  scanThreshold: boolean
  scanThresholdValue: number
  // Cycle counts — WMS Standalone + ERP, per-warehouse.
  cycleCountRec: boolean
  cycleCountAutoTask: boolean
  cycleCountRuleNeg: boolean
  cycleCountRuleVar: boolean
  cycleCountRuleMin: boolean
  /** Priority order for recommendation rules — highest priority first. */
  cycleCountRuleOrder: ('neg' | 'var' | 'min')[]
  /** Negative stock rule — how many days back to look for a negative-stock event. */
  cycleCountNegLookbackDays: number
  /** Variance signal rule — variance % (vs. last count) that trips the flag. */
  /** Min stock rule — days a watch-listed SKU must stay at/below minimum before it's flagged. */
  cycleCountMinGuardDays: number
  /** SKUs that always show on the cycle count recommendation list — the "watch list" the Min stock rule flags against. */
  cycleCountWatchList: string[]
  // Replenishment — Inventory › Replenishment, per-warehouse.
  /** ON = this warehouse appears in the replenishment worklist and gets reorder points calculated. */
  replenishmentEnabled: boolean
  /** Overrides the global safety days for this warehouse. null = use the global value. */
  replenishmentSafetyDays: number | null
  /** Count in-transit warehouse transfers toward this warehouse's on-order qty. */
  replenishmentIncludeInTransit: boolean
}

const DEFAULTS: WarehouseConfig = {
  pickingEnabled: true,
  putAwayEnabled: true,
  allowPartialPicking: true,
  requireSourceLabel: true,
  preventDuplicateLabel: false,
  locationPriority: [],
  scanThreshold: true,
  scanThresholdValue: 50,
  cycleCountRec: false,
  cycleCountAutoTask: false,
  cycleCountRuleNeg: true,
  cycleCountRuleVar: true,
  cycleCountRuleMin: true,
  cycleCountRuleOrder: ['neg', 'var', 'min'],
  cycleCountNegLookbackDays: 30,
  cycleCountMinGuardDays: 14,
  cycleCountWatchList: [],
  // On by default, unlike cycle-count recommendations: replenishment is the point
  // of the module, and a worklist that is empty until someone finds a toggle reads
  // as broken rather than as unconfigured.
  replenishmentEnabled: true,
  replenishmentSafetyDays: null,
  replenishmentIncludeInTransit: true,
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

/**
 * Whether a SKU line's qty must be reached by scanning one unit at a time —
 * manual qty entry should be disabled for it. True when the threshold is ON
 * and the line's qty is AT OR BELOW scanThresholdValue (matches the Configure
 * warehouse page's own copy: "Items at or below this quantity must be scanned
 * one by one. Above the limit, operators can enter the quantity manually.").
 * Always false when the toggle itself is off.
 */
export function scanRequiredForQty(config: WarehouseConfig, qty: number): boolean {
  return config.scanThreshold && qty <= config.scanThresholdValue
}

/** The warehouse's committed effective reservation priority order (see rankStorageLeaves). */
export function effectiveLocationPriority(warehouseId: string): StorageLeaf[] {
  const leaves = getStorageLeaves(warehouseId).filter((l) => l.type === 'Storage')
  return rankStorageLeaves(leaves, getWarehouseConfig(warehouseId).locationPriority)
}
