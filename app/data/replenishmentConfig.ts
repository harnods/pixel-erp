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

export interface ReplWindowWeight {
  /** Trailing window length in days. */
  days: number
  /** Share of the blended velocity, in percent. All windows must total 100. */
  weightPct: number
}

export interface ReplenishmentConfig {
  demandBasis: ReplDemandBasis
  /** Recency-weighted windows — recent demand counts for more (OD-009). */
  windows: ReplWindowWeight[]
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
  /** Lead time used when a SKU has no vendor link at all (US-001 AC-03). */
  fallbackLeadTimeDays: number
}

export const REPL_DEFAULTS: ReplenishmentConfig = {
  demandBasis: 'shipped-outbound',
  windows: [
    { days: 7, weightPct: 50 },
    { days: 14, weightPct: 30 },
    { days: 30, weightPct: 20 },
  ],
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
