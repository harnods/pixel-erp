/**
 * Global replenishment policy — the knobs the recommendation engine reads.
 *
 * Company-wide (CID-level), deliberately NOT per-warehouse: none of the MVP
 * features asks for per-warehouse FSN thresholds or velocity weights, and adding
 * keys to `warehouseConfig.ts` would touch a module picking, put-away and cycle
 * counts all read. The per-warehouse variation that IS required (reorder point,
 * safety days, max level, tracking) lives in `replenishmentSettings.ts` at
 * SKU×warehouse granularity, which is strictly finer.
 *
 * Shape mirrors `warehouseSettings.ts`: a DEFAULTS object, a get/save pair,
 * localStorage-backed and `import.meta.client`-guarded so SSR never touches it.
 */
import { TODAY_ISO } from './master'
import { clearStore, readStore, writeStore } from './replenishmentStore'

const STORAGE_KEY = 'erp-db:replenishment-config'

/** Which documents count as demand. Only 'shipped-outbound' is wired in MVP. */
export type ReplDemandBasis = 'shipped-outbound' | 'shipped-plus-open' | 'manual-only'

/** Whether a SKU sitting EXACTLY at its reorder point is due (PRD US-010 AC-02). */
export type ReplBoundaryMode = 'inclusive' | 'exclusive'

/**
 * How average daily demand is measured.
 *
 * The PRD specifies both and they disagree: §2.2 / US-002 define it as a flat
 * average over one lookback window (default 60 days), while US-004 keeps the
 * configurable 7/14/30 windows with weights totalling 100. `lookback` is the
 * default because it is what the calculation spec and the worked example in §2.4
 * actually compute; `weighted-windows` preserves US-004's recency weighting for
 * businesses whose demand moved recently and should be read that way.
 */
export type ReplDemandMode = 'lookback' | 'weighted-windows'

/**
 * How an order's SIZE is decided once a SKU is due (PRD decision D9).
 *
 * `coverage-days` orders enough to cover lead + safety + N more days of demand;
 * `max-level` tops the SKU up to a fixed unit ceiling instead (US-011 AC-03).
 * Without one of these the order would only refill to the trigger and re-fire
 * immediately — which is why every reference ERP takes a second input here.
 */
export type ReplOrderSizing = 'coverage-days' | 'max-level'

export interface ReplWindowWeight {
  /** Trailing window length in days. */
  days: number
  /** Share of the blended velocity, in percent. All windows must total 100. */
  weightPct: number
}

export interface ReplenishmentConfig {
  demandBasis: ReplDemandBasis
  /** Flat lookback average (spec §2.2) vs US-004's weighted windows. */
  demandMode: ReplDemandMode
  /**
   * How far back to average sales for average daily demand, in days (US-002).
   * The spec's primary demand input: avg daily demand = qty in window ÷ window.
   */
  lookbackDays: number
  lookbackDaysByCategory: Record<string, number>
  /** Recency-weighted windows — recent demand counts for more (OD-009). */
  windows: ReplWindowWeight[]
  /**
   * Demand samples above this multiple of the window median are pulled back to it
   * before averaging, so a promo spike or a bulk return cannot distort the average
   * (US-002 AC-03). The SKU is still flagged "volatile demand" rather than hidden.
   */
  demandOutlierCapMultiple: number
  /** Coverage days vs a units Max level (D9 / US-011 AC-03). */
  orderSizing: ReplOrderSizing
  /**
   * Days of demand each order should cover BEYOND lead + safety (D9).
   * Sizes the quantity; it plays no part in deciding whether a SKU is due.
   */
  coverageDaysGlobal: number
  coverageDaysByCategory: Record<string, number>
  /** How many of the most recent PO-backed receipts to average (US-001 AC-01). */
  leadTimeSampleCount: number
  /** Below this many PO-backed samples the computed tier is not trusted (VR-04). */
  leadTimeMinSamples: number
  /** PO→receipt gaps beyond this are dropped as outliers (US-001 AC-06). */
  leadTimeOutlierCapDays: number
  /** Tier 3 of the lead-time ladder — a per-category default (US-001 AC-04). */
  leadTimeByCategory: Record<string, number>
  /**
   * Minimum stock for a warehouse that has NOTHING to calculate from — no sales
   * history, so no velocity, so no demand-derived floor (US-024 AC-03's category
   * tier; D13's "seed for warehouses with no computed value").
   *
   * It sits AFTER the calculation, not before it: a category figure that
   * outranked real demand would switch the engine off for every product in that
   * category. 0 means "no floor", which is a legitimate answer for a category
   * nobody stocks speculatively.
   */
  minStockByCategory: Record<string, number>
  /** Last resort when the category has no figure either. 0 = none. */
  minStockGlobal: number
  /** Fallback buffer, in days, when no category or SKU override applies. */
  safetyDaysGlobal: number
  safetyDaysByCategory: Record<string, number>
  /** Below this many days of movement history a SKU is "cold start" (US-003). */
  coldStartMinDays: number
  /**
   * Expected units/day per category, used for cold-start SKUs that have no manual
   * demand of their own (US-003 AC-01 "inherit a category average").
   *
   * Empty by default and deliberately so: a tenant that has configured nothing has
   * no category average to inherit, which is exactly US-003 AC-03 — those SKUs must
   * land in "Needs setup" rather than receive a fabricated quantity.
   */
  coldStartCategoryDemand: Record<string, number>
  reorderBoundary: ReplBoundaryMode
  /** FSN classification window, in days (US-012). */
  fsnWindowDays: number
  /** ≥ this share of periods with movement ⇒ Fast. */
  fsnFastPct: number
  /** ≥ this share (and below fast) ⇒ Slow; anything less ⇒ Non-moving. */
  fsnSlowPct: number
  /** Dead-band around a threshold a SKU must clear before reclassifying (US-015). */
  fsnHysteresisPct: number
  /** Consecutive recalculations a candidate class must hold before it commits. */
  fsnDwellCycles: number
  /** Coefficient of variation above which demand is flagged "volatile" (US-002). */
  volatileCvThreshold: number
  /** Tier 4 — the global floor when nothing else resolves (US-001 AC-04). */
  fallbackLeadTimeDays: number
}

export const REPL_DEFAULTS: ReplenishmentConfig = {
  demandBasis: 'shipped-outbound',
  demandMode: 'lookback',
  lookbackDays: 60,
  lookbackDaysByCategory: {},
  windows: [
    { days: 7, weightPct: 50 },
    { days: 14, weightPct: 30 },
    { days: 30, weightPct: 20 },
  ],
  demandOutlierCapMultiple: 4,
  orderSizing: 'coverage-days',
  coverageDaysGlobal: 30,
  // Beans move fast and are cheap to hold, so they carry a longer horizon than a
  // machine nobody wants sitting in a warehouse for a month.
  coverageDaysByCategory: {
    'Green Beans': 45,
    'Roasted Beans': 21,
    'Espresso Machine': 30,
    Grinder: 30,
    Equipment: 30,
    Accessory: 30,
  },
  leadTimeSampleCount: 5,
  leadTimeMinSamples: 2,
  leadTimeOutlierCapDays: 90,
  leadTimeByCategory: {
    'Green Beans': 21,
    'Roasted Beans': 10,
    'Espresso Machine': 30,
    Grinder: 21,
    Equipment: 21,
    Accessory: 10,
  },
  // Sized to a few weeks of the slow trickle these categories sell at when they
  // have no history — enough that a new location is not left at zero, small
  // enough that it is cheap to be wrong.
  minStockByCategory: {
    'Green Beans': 20,
    'Roasted Beans': 15,
    'Espresso Machine': 2,
    Grinder: 3,
    Equipment: 3,
    Accessory: 12,
  },
  minStockGlobal: 0,
  safetyDaysGlobal: 7,
  safetyDaysByCategory: {
    'Green Beans': 10,
    'Roasted Beans': 7,
    'Espresso Machine': 14,
    Grinder: 14,
    Equipment: 14,
    Accessory: 5,
  },
  coldStartMinDays: 14,
  coldStartCategoryDemand: {},
  reorderBoundary: 'inclusive',
  fsnWindowDays: 90,
  fsnFastPct: 60,
  fsnSlowPct: 10,
  fsnHysteresisPct: 5,
  fsnDwellCycles: 2,
  volatileCvThreshold: 1.2,
  fallbackLeadTimeDays: 14,
}

/**
 * The "as of" anchor for every replenishment number.
 *
 * Deliberately `master.TODAY_ISO` (2026-06-26), NOT `simClock.SIM_TODAY_ISO`
 * (2026-08-22): replenishment reads the stock world — warehouseDetails, receipts,
 * outgoing — and all of those are anchored to master. Never call simClock's
 * `daysUntil` / `daysSince` on a stock or receipt date.
 */
export const REPL_ASOF_ISO = TODAY_ISO

function load(): Partial<ReplenishmentConfig> {
  return readStore<Partial<ReplenishmentConfig>>(STORAGE_KEY, {})
}

/** Config with defaults filled in for any missing / never-saved key. */
export function getReplenishmentConfig(): ReplenishmentConfig {
  const saved = load()
  return {
    ...REPL_DEFAULTS,
    ...saved,
    // Nested values must merge, not replace, or a partial save drops categories.
    safetyDaysByCategory: { ...REPL_DEFAULTS.safetyDaysByCategory, ...(saved.safetyDaysByCategory ?? {}) },
    coldStartCategoryDemand: { ...REPL_DEFAULTS.coldStartCategoryDemand, ...(saved.coldStartCategoryDemand ?? {}) },
    coverageDaysByCategory: { ...REPL_DEFAULTS.coverageDaysByCategory, ...(saved.coverageDaysByCategory ?? {}) },
    lookbackDaysByCategory: { ...REPL_DEFAULTS.lookbackDaysByCategory, ...(saved.lookbackDaysByCategory ?? {}) },
    leadTimeByCategory: { ...REPL_DEFAULTS.leadTimeByCategory, ...(saved.leadTimeByCategory ?? {}) },
    minStockByCategory: { ...REPL_DEFAULTS.minStockByCategory, ...(saved.minStockByCategory ?? {}) },
    windows: saved.windows?.length ? saved.windows : REPL_DEFAULTS.windows,
  }
}

export function saveReplenishmentConfig(cfg: ReplenishmentConfig): void {
  writeStore(STORAGE_KEY, cfg)
}

export function resetReplenishmentConfig(): void {
  clearStore(STORAGE_KEY)
}

/** Weights total exactly 100, every window is a positive whole number of days, no duplicates. */
export function windowWeightsValid(windows: ReplWindowWeight[]): boolean {
  if (!windows.length) return false
  if (windows.some((w) => !Number.isInteger(w.days) || w.days <= 0)) return false
  if (new Set(windows.map((w) => w.days)).size !== windows.length) return false
  return windows.reduce((s, w) => s + w.weightPct, 0) === 100
}

/**
 * Scale weights to total 100 rather than rejecting them, so no caller can ever
 * produce a silently-wrong velocity. `windowWeightsValid` is the separate
 * predicate a settings form validates against before saving.
 */
export function normalizeWindowWeights(windows: ReplWindowWeight[]): ReplWindowWeight[] {
  const usable = windows.filter((w) => Number.isInteger(w.days) && w.days > 0)
  if (!usable.length) return REPL_DEFAULTS.windows
  const sum = usable.reduce((s, w) => s + w.weightPct, 0)
  if (sum <= 0) {
    const even = 100 / usable.length
    return usable.map((w) => ({ days: w.days, weightPct: even }))
  }
  return usable.map((w) => ({ days: w.days, weightPct: (w.weightPct / sum) * 100 }))
}

/** Safety days for a category, falling back to the global value. */
export function safetyDaysForCategory(category: string, cfg: ReplenishmentConfig = getReplenishmentConfig()): number {
  return cfg.safetyDaysByCategory[category] ?? cfg.safetyDaysGlobal
}

/**
 * Coverage days for a category, falling back to the global value (D9 / US-011).
 * Only ever sizes the order — never any part of the due/not-due decision.
 */
export function coverageDaysForCategory(category: string, cfg: ReplenishmentConfig = getReplenishmentConfig()): number {
  return cfg.coverageDaysByCategory[category] ?? cfg.coverageDaysGlobal
}

/** Demand lookback window for a category, falling back to the global value (US-002 VR-01). */
export function lookbackDaysForCategory(category: string, cfg: ReplenishmentConfig = getReplenishmentConfig()): number {
  return cfg.lookbackDaysByCategory[category] ?? cfg.lookbackDays
}

/**
 * The floor a warehouse falls back to when it has no sales to calculate from
 * (US-024 AC-03). Returns null when neither the category nor the company sets
 * one, which correctly leaves such a warehouse with no floor at all.
 */
export function minStockForCategory(
  category: string,
  cfg: ReplenishmentConfig = getReplenishmentConfig(),
): number | null {
  const cat = cfg.minStockByCategory[category]
  if (cat !== undefined && cat > 0) return cat
  return cfg.minStockGlobal > 0 ? cfg.minStockGlobal : null
}

/** Tier 3 of the lead-time ladder — the category default (US-001 AC-04). */
export function leadTimeForCategory(category: string, cfg: ReplenishmentConfig = getReplenishmentConfig()): number | null {
  return cfg.leadTimeByCategory[category] ?? null
}
