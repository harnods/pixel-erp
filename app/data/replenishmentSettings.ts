/**
 * Per-SKU and per-SKU-warehouse replenishment overrides (PRD US-024, US-013,
 * US-011, US-003).
 *
 * Stored SPARSELY — only what a user actually overrode is written — behind
 * resolver functions that apply the PRD's precedence. Everything else is derived
 * by the engine, so there is no second copy of a policy to drift.
 *
 * Precedence:
 *   reorderPoint      SKU-warehouse → SKU → (engine: velocity × (lead + safety));
 *                     no history + no cold-start demand seed ⇒ Needs setup (D17)
 *   safetyDays        SKU-warehouse → SKU → warehouse → category → global
 *   coverageDays      SKU-warehouse → SKU → category → global
 *   lookbackDays      SKU-warehouse → SKU → category → global
 *   maxLevel          SKU-warehouse → SKU → none
 *   tracked           SKU-warehouse → SKU → tracked by default
 *   manualDemand      SKU-warehouse → SKU → category average → none
 *   manualLeadTime    SKU-warehouse → SKU → (engine: derived ladder)
 *
 * NOTE on reorderPoint: this module returns only the OVERRIDE. The computed
 * default lives in the engine because it depends on velocity, and importing the
 * engine here would be circular. See `replenishment.ts` → resolveReorderPoint().
 */
import {
  coverageDaysForCategory,
  getReplenishmentConfig,
  lookbackDaysForCategory,
  safetyDaysForCategory,
  type ReplenishmentConfig,
} from './replenishmentConfig'
import { productBySku } from './inventory'
import { getWarehouseConfig } from './warehouseConfig'
import { readStore, writeStore } from './replenishmentStore'

const STORAGE_KEY = 'erp-db:replenishment-settings'

export interface ReplenishmentOverride {
  reorderPoint?: number
  safetyDays?: number
  /** Days of demand this order should cover beyond lead + safety (D9 / US-011). */
  coverageDays?: number
  /** Demand averaging window for this pair, in days (US-002 VR-01). */
  lookbackDays?: number
  /**
   * Order-up-to ceiling in units. When set it REPLACES the coverage-days horizon
   * as the order target (US-011 AC-03) — it is the level the SKU tops up to, not
   * merely a cap on the result.
   */
  maxLevel?: number
  /** false = muted from the worklist (US-013). Never deletes or hides from search. */
  tracked?: boolean
  /** Units/day entered by hand for a cold-start SKU (US-003 AC-01). */
  manualDailyDemand?: number
  /** Days entered by hand when the PO→receipt ladder resolves to nothing (US-003 AC-02). */
  manualLeadTimeDays?: number
  updatedBy?: string
  updatedAt?: string
}

export type OverrideSource =
  | 'sku-warehouse' | 'sku' | 'warehouse' | 'category' | 'global' | 'default' | 'none'

export interface EffectiveReplenishmentSettings {
  /** null ⇒ no override; the engine computes it from velocity. */
  reorderPointOverride: number | null
  reorderPointSource: Extract<OverrideSource, 'sku-warehouse' | 'sku' | 'none'>
  safetyDays: number
  safetyDaysSource: Extract<OverrideSource, 'sku-warehouse' | 'sku' | 'warehouse' | 'category' | 'global'>
  coverageDays: number
  coverageDaysSource: Extract<OverrideSource, 'sku-warehouse' | 'sku' | 'category' | 'global'>
  lookbackDays: number
  lookbackDaysSource: Extract<OverrideSource, 'sku-warehouse' | 'sku' | 'category' | 'global'>
  maxLevel: number | null
  maxLevelSource: Extract<OverrideSource, 'sku-warehouse' | 'sku' | 'none'>
  /**
   * Floor for a warehouse with nothing to calculate from (US-024 AC-03).
   * null when neither the category nor the company sets one, which correctly
   * leaves such a warehouse with no floor rather than an invented zero.
   */
  manualLeadTimeDays: number | null
  manualLeadTimeSource: Extract<OverrideSource, 'sku-warehouse' | 'sku' | 'none'>
  tracked: boolean
  trackedSource: Extract<OverrideSource, 'sku-warehouse' | 'sku' | 'default'>
  manualDailyDemand: number | null
  manualDailyDemandSource: Extract<OverrideSource, 'sku-warehouse' | 'sku' | 'category' | 'none'>
}

interface Store {
  bySku: Record<string, ReplenishmentOverride>
  /** keyed `${sku}::${warehouseId}` */
  bySkuWarehouse: Record<string, ReplenishmentOverride>
}

function load(): Store {
  const raw = readStore<Partial<Store>>(STORAGE_KEY, {})
  return { bySku: raw.bySku ?? {}, bySkuWarehouse: raw.bySkuWarehouse ?? {} }
}

function persist(store: Store): void {
  writeStore(STORAGE_KEY, store)
}

const pairKey = (sku: string, warehouseId: string) => `${sku}::${warehouseId}`

/**
 * Category fallback demand for cold-start SKUs with no manual value of their own.
 * Read from config, which ships EMPTY — an unconfigured tenant has no average to
 * inherit, so its cold-start SKUs correctly land in "Needs setup" (US-003 AC-03)
 * instead of getting a made-up number.
 */
export function categoryDailyDemand(
  category: string,
  cfg: ReplenishmentConfig = getReplenishmentConfig(),
): number | null {
  return cfg.coldStartCategoryDemand[category] ?? null
}

// ── Reads ────────────────────────────────────────────────────────────────────

export function getSkuOverride(sku: string): ReplenishmentOverride {
  return load().bySku[sku] ?? {}
}

export function getSkuWarehouseOverride(sku: string, warehouseId: string): ReplenishmentOverride {
  return load().bySkuWarehouse[pairKey(sku, warehouseId)] ?? {}
}

/**
 * Resolve every setting for a SKU-warehouse pair, reporting WHERE each value came
 * from. The `*Source` fields are not decoration — the trust drawer shows them, so
 * a user can see whether a number is theirs, their category's, or the default.
 */
export function effectiveSettings(
  sku: string,
  warehouseId: string,
  cfg: ReplenishmentConfig = getReplenishmentConfig(),
): EffectiveReplenishmentSettings {
  const store = load()
  const pair = store.bySkuWarehouse[pairKey(sku, warehouseId)] ?? {}
  const skuLevel = store.bySku[sku] ?? {}
  const category = productBySku(sku)?.category ?? ''

  const reorderPointOverride = pair.reorderPoint ?? skuLevel.reorderPoint ?? null
  const reorderPointSource = pair.reorderPoint !== undefined
    ? 'sku-warehouse' as const
    : skuLevel.reorderPoint !== undefined ? 'sku' as const : 'none' as const

  // Precedence adds a warehouse tier between SKU and category, for OD-008: a branch
  // can run a longer buffer than head office without touching any SKU.
  const whSafety = getWarehouseConfig(warehouseId).replenishmentSafetyDays
  const catSafety = cfg.safetyDaysByCategory[category]
  const safetyDays = pair.safetyDays
    ?? skuLevel.safetyDays
    ?? whSafety
    ?? safetyDaysForCategory(category, cfg)
  const safetyDaysSource = pair.safetyDays !== undefined
    ? 'sku-warehouse' as const
    : skuLevel.safetyDays !== undefined ? 'sku' as const
    : whSafety !== null && whSafety !== undefined ? 'warehouse' as const
    : catSafety !== undefined ? 'category' as const : 'global' as const

  // Coverage and lookback share safety's shape but skip the warehouse tier: neither
  // is a location-risk decision, so warehouseConfig carries no key for them.
  const catCoverage = cfg.coverageDaysByCategory[category]
  const coverageDays = pair.coverageDays ?? skuLevel.coverageDays ?? coverageDaysForCategory(category, cfg)
  const coverageDaysSource = pair.coverageDays !== undefined
    ? 'sku-warehouse' as const
    : skuLevel.coverageDays !== undefined ? 'sku' as const
    : catCoverage !== undefined ? 'category' as const : 'global' as const

  const catLookback = cfg.lookbackDaysByCategory[category]
  const lookbackDays = pair.lookbackDays ?? skuLevel.lookbackDays ?? lookbackDaysForCategory(category, cfg)
  const lookbackDaysSource = pair.lookbackDays !== undefined
    ? 'sku-warehouse' as const
    : skuLevel.lookbackDays !== undefined ? 'sku' as const
    : catLookback !== undefined ? 'category' as const : 'global' as const

  const maxLevel = pair.maxLevel ?? skuLevel.maxLevel ?? null
  const maxLevelSource = pair.maxLevel !== undefined
    ? 'sku-warehouse' as const
    : skuLevel.maxLevel !== undefined ? 'sku' as const : 'none' as const

  const manualLeadTimeDays = pair.manualLeadTimeDays ?? skuLevel.manualLeadTimeDays ?? null
  const manualLeadTimeSource = pair.manualLeadTimeDays !== undefined
    ? 'sku-warehouse' as const
    : skuLevel.manualLeadTimeDays !== undefined ? 'sku' as const : 'none' as const

  const tracked = pair.tracked ?? skuLevel.tracked ?? true
  const trackedSource = pair.tracked !== undefined
    ? 'sku-warehouse' as const
    : skuLevel.tracked !== undefined ? 'sku' as const : 'default' as const

  const catDemand = categoryDailyDemand(category, cfg)
  const manualDailyDemand = pair.manualDailyDemand ?? skuLevel.manualDailyDemand ?? catDemand ?? null
  const manualDailyDemandSource = pair.manualDailyDemand !== undefined
    ? 'sku-warehouse' as const
    : skuLevel.manualDailyDemand !== undefined ? 'sku' as const
    : catDemand !== null ? 'category' as const : 'none' as const

  return {
    reorderPointOverride,
    reorderPointSource,
    safetyDays,
    safetyDaysSource,
    coverageDays,
    coverageDaysSource,
    lookbackDays,
    lookbackDaysSource,
    maxLevel,
    maxLevelSource,
    manualLeadTimeDays,
    manualLeadTimeSource,
    tracked,
    trackedSource,
    manualDailyDemand,
    manualDailyDemandSource,
  }
}

/** How many SKU-warehouse pairs carry a custom setting — "N products customised". */
export function overrideCount(): number {
  const store = load()
  return Object.keys(store.bySkuWarehouse).length + Object.keys(store.bySku).length
}

/**
 * How many SKU / SKU-warehouse rows set their own safety days (D16 loophole).
 *
 * The settings page shows this beside the company safety-days default, because a
 * global edit that "does nothing" is almost always the cascade working as
 * designed — a downstream override wins (D14). Surfacing the count answers the
 * question ("why didn't my change move anything?") before it is asked.
 */
export function safetyDaysOverrideCount(): number {
  const store = load()
  let n = 0
  for (const o of Object.values(store.bySku)) if (o.safetyDays !== undefined) n++
  for (const o of Object.values(store.bySkuWarehouse)) if (o.safetyDays !== undefined) n++
  return n
}

// ── Writes ───────────────────────────────────────────────────────────────────

function cleanPatch(patch: ReplenishmentOverride): ReplenishmentOverride {
  // Drop keys explicitly cleared, so "use calculated" really removes the override
  // rather than storing undefined and shadowing the fallback chain.
  const out: ReplenishmentOverride = {}
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null || v === '') continue
    ;(out as Record<string, unknown>)[k] = v
  }
  return out
}

export function saveSkuOverride(sku: string, patch: ReplenishmentOverride): void {
  const store = load()
  const next = cleanPatch({ ...store.bySku[sku], ...patch })
  if (Object.keys(next).length) store.bySku[sku] = next
  else delete store.bySku[sku]
  persist(store)
}

export function saveSkuWarehouseOverride(sku: string, warehouseId: string, patch: ReplenishmentOverride): void {
  const store = load()
  const key = pairKey(sku, warehouseId)
  const next = cleanPatch({ ...store.bySkuWarehouse[key], ...patch })
  if (Object.keys(next).length) store.bySkuWarehouse[key] = next
  else delete store.bySkuWarehouse[key]
  persist(store)
}

export function clearSkuWarehouseOverride(sku: string, warehouseId: string): void {
  const store = load()
  delete store.bySkuWarehouse[pairKey(sku, warehouseId)]
  persist(store)
}

/** Clear just the reorder-point override — the drawer's "Use calculated" link. */
export function clearReorderPointOverride(sku: string, warehouseId: string): void {
  const store = load()
  const key = pairKey(sku, warehouseId)
  const row = store.bySkuWarehouse[key]
  if (!row) return
  delete row.reorderPoint
  if (!Object.keys(row).length) delete store.bySkuWarehouse[key]
  persist(store)
}

/** Mute / unmute one pair (US-013). Passing a null warehouse sets the SKU-level default. */
export function setTracked(sku: string, warehouseId: string | null, tracked: boolean): void {
  if (warehouseId === null) saveSkuOverride(sku, { tracked })
  else saveSkuWarehouseOverride(sku, warehouseId, { tracked })
}

/**
 * Bulk mute (US-013 AC-02). Returns how many pairs actually changed, so the
 * caller can report "X of Y muted" honestly rather than assuming all succeeded.
 */
export function setTrackedBulk(
  pairs: { sku: string; warehouseId: string }[],
  tracked: boolean,
): number {
  const store = load()
  let changed = 0
  for (const { sku, warehouseId } of pairs) {
    const key = pairKey(sku, warehouseId)
    const current = store.bySkuWarehouse[key]?.tracked ?? store.bySku[sku]?.tracked ?? true
    if (current === tracked) continue
    store.bySkuWarehouse[key] = cleanPatch({ ...store.bySkuWarehouse[key], tracked })
    // `tracked: false` must survive cleanPatch — it drops null/undefined/'', not false.
    store.bySkuWarehouse[key]!.tracked = tracked
    changed++
  }
  persist(store)
  return changed
}

export function resetReplenishmentSettings(): void {
  persist({ bySku: {}, bySkuWarehouse: {} })
}
