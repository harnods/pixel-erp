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

/** Whether a SKU sitting EXACTLY at its reorder point is due (PRD US-010 AC-02). */
export type ReplBoundaryMode = 'inclusive' | 'exclusive'

/**
 * How an order's SIZE is decided once a SKU is due (PRD decision D9).
 *
 * `coverage-days` orders enough to cover lead + safety + N more days of demand;
 * `max-level` tops the SKU up to a fixed unit ceiling instead (US-011 AC-03).
 * Without one of these the order would only refill to the trigger and re-fire
 * immediately — which is why every reference ERP takes a second input here.
 */
export type ReplOrderSizing = 'coverage-days' | 'max-level'

export interface ReplenishmentConfig {
  /**
   * How far back to average sales for average daily demand, in days (US-002).
   * The spec's primary demand input: avg daily demand = qty in window ÷ window.
   */
  lookbackDays: number
  lookbackDaysByCategory: Record<string, number>
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
  /** PO→receipt gaps beyond this are dropped as outliers (US-001 AC-06). The
   *  global value; per-category overrides live in leadTimeOutlierCapByCategory. */
  leadTimeOutlierCapDays: number
  /** Per-category outlier cap; falls back to leadTimeOutlierCapDays (US-001 AC-09). */
  leadTimeOutlierCapByCategory: Record<string, number>
  /** Tier 3 of the lead-time ladder — a per-category default (US-001 AC-04). */
  leadTimeByCategory: Record<string, number>
  /** Fallback buffer, in days, when no category or SKU override applies. */
  safetyDaysGlobal: number
  safetyDaysByCategory: Record<string, number>
  /** Below this many days of movement history a SKU is "cold start" (US-003). */
  coldStartMinDays: number
  reorderBoundary: ReplBoundaryMode
  /** FSN classification window, in days (US-012). */
  fsnWindowDays: number
  /** ≥ this share of periods with movement ⇒ Fast. */
  fsnFastPct: number
  /** ≥ this share (and below fast) ⇒ Slow; anything less ⇒ Non-moving. */
  fsnSlowPct: number
  /** Coefficient of variation above which demand is flagged "volatile" (US-002). */
  volatileCvThreshold: number
  /** Tier 4 — the global floor when nothing else resolves (US-001 AC-04). */
  fallbackLeadTimeDays: number
}

export const REPL_DEFAULTS: ReplenishmentConfig = {
  lookbackDays: 60,
  lookbackDaysByCategory: {},
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
  leadTimeOutlierCapByCategory: {
    'Green Beans': 90,
    'Roasted Beans': 60,
    'Espresso Machine': 120,
    Grinder: 100,
    Equipment: 120,
    Accessory: 60,
  },
  leadTimeByCategory: {
    'Green Beans': 21,
    'Roasted Beans': 10,
    'Espresso Machine': 30,
    Grinder: 21,
    Equipment: 21,
    Accessory: 10,
  },
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
  reorderBoundary: 'inclusive',
  fsnWindowDays: 90,
  fsnFastPct: 60,
  fsnSlowPct: 10,
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
    coverageDaysByCategory: { ...REPL_DEFAULTS.coverageDaysByCategory, ...(saved.coverageDaysByCategory ?? {}) },
    lookbackDaysByCategory: { ...REPL_DEFAULTS.lookbackDaysByCategory, ...(saved.lookbackDaysByCategory ?? {}) },
    leadTimeByCategory: { ...REPL_DEFAULTS.leadTimeByCategory, ...(saved.leadTimeByCategory ?? {}) },
    leadTimeOutlierCapByCategory: { ...REPL_DEFAULTS.leadTimeOutlierCapByCategory, ...(saved.leadTimeOutlierCapByCategory ?? {}) },
  }
}

export function saveReplenishmentConfig(cfg: ReplenishmentConfig): void {
  writeStore(STORAGE_KEY, cfg)
}

export function resetReplenishmentConfig(): void {
  clearStore(STORAGE_KEY)
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

/** Tier 3 of the lead-time ladder — the category default (US-001 AC-04). */
export function leadTimeOutlierCapForCategory(category: string, cfg: ReplenishmentConfig = getReplenishmentConfig()): number {
  return cfg.leadTimeOutlierCapByCategory[category] ?? cfg.leadTimeOutlierCapDays
}

export function leadTimeForCategory(category: string, cfg: ReplenishmentConfig = getReplenishmentConfig()): number | null {
  return cfg.leadTimeByCategory[category] ?? null
}
