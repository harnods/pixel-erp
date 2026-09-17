/**
 * Replenishment engine — velocity → ATP → suggested qty → FSN → days of cover →
 * worklist row.
 *
 * Pure functions in `app/data/`, in the shape of `cycleCountRecommendations.ts`, so
 * the worklist page, the tab-count badges and the home tile all read ONE source and
 * cannot drift apart. Nothing here mutates stock; the only writer is
 * `recalculateReplenishment()`, and it writes only the run ledger.
 *
 * Two formulas, and they are deliberately different (PRD §2.3, US-008):
 *   reorder point = avgDailySales × (leadDays + safetyDays)
 *   suggested qty = avgDailySales × (leadDays + safetyDays + coverageDays)
 *                     − (netAvailable + onOrder)
 * floored at 0. The reorder point answers WHEN (it is the minimum stock
 * threshold); coverage days appear ONLY in the quantity and answer HOW MUCH.
 * Without that second horizon each order would refill exactly to the trigger and
 * re-fire the next day — which is why every reference ERP takes the extra input
 * (decision D9).
 *
 * `maxLevel`, where set, REPLACES the coverage horizon as the order-up-to target
 * (US-011 AC-03): the SKU tops up to that level in units instead. It is no longer
 * a cap on a coverage-days result.
 */
import { warehouses } from './warehouses'
import { productBySku, warehouseProducts } from './inventory'
import { getProductWarehouseStock } from './productDetails'
import { getWarehouseDetail } from './warehouseDetails'
import { getWarehouseConfig } from './warehouseConfig'
import { receipts } from './receipts'
import { lineItemsForReceipt } from './receiptLineItems'
import { receivedSummaryForReceipt } from './receivingTasks'
import { shiftDays } from './master'
import {
  REPL_ASOF_ISO, getReplenishmentConfig, normalizeWindowWeights,
  type ReplBoundaryMode, type ReplDemandMode, type ReplenishmentConfig,
} from './replenishmentConfig'
import { effectiveSettings, type EffectiveReplenishmentSettings } from './replenishmentSettings'
import { bumpReplenishmentRevision, replenishmentRevision } from './replenishmentStore'
import {
  demandCv, demandSeries, demandWindow, demandWindowDamped, invalidateDemandHistory,
  type DemandDoc,
} from './demandHistory'
import {
  preferredVendorItem, vendorItemFor, vendorItemsForSku, vendorNameFor, type VendorItem,
} from './vendorItems'
import {
  classMemo, currentRunNo, hasRunHistory, memoKey, writeRun,
  type FsnClass, type FsnClassMemo,
} from './replenishmentRuns'
import {
  deriveLeadTime, invalidateLeadTimeHistory, isEstimatedTier, leadTimeTierLabel,
  type DerivedLeadTime, type LeadTimeTier,
} from './leadTimeHistory'

// ── Velocity (OD-002 / OD-009) ───────────────────────────────────────────────

/**
 * Which demand case fired (US-002 AC-04/05, US-003).
 *
 *   computed   — history ≥ cold-start threshold: averaged from real sales.
 *   manual-sku — cold start, using a per-item manual demand a buyer entered.
 *   none       — cold start with no manual demand ⇒ Needs setup.
 *
 * There is deliberately NO per-category demand seed: a never-sold or dead-stock
 * product must never be given a fabricated demand, so with no real sales and no
 * explicit manual figure it goes to Needs setup rather than an invented quantity.
 * Graduation off a manual figure is silent — a SKU crossing the threshold simply
 * returns `computed` on the next run, no stored number to unwind.
 */
export type ReplDemandSource = 'computed' | 'manual-sku' | 'none'

/** Two-way label for `ReplDemandSource` — 'seed' = a hand-entered cold-start figure. */
export function demandBasisOf(source: ReplDemandSource): 'computed' | 'seed' | 'none' {
  if (source === 'computed') return 'computed'
  if (source === 'none') return 'none'
  return 'seed'
}

export interface VelocityWindowResult {
  days: number
  units: number
  weightPct: number
  perDay: number
  modelledDays: number
}

export interface VelocityResult {
  avgDailySales: number
  source: ReplDemandSource
  historyDays: number
  coldStart: boolean
  windows: VelocityWindowResult[]
  cv: number
  volatile: boolean
  citations: DemandDoc[]
  /** Which rule produced avgDailySales — shown in the trust drawer. */
  mode: ReplDemandMode
  /** Window actually averaged over in `lookback` mode (US-002 AC-01). */
  lookbackDays: number
  /** Units summed over that window, after damping. */
  lookbackUnits: number
  /** Days whose qty was pulled back to the outlier cap (US-002 AC-03). */
  dampedDays: number
  /** Plain-language account of which case fired — shown in the trust drawer. */
  reason: string
}

/**
 * Average daily sales.
 *
 * Two rules, because the PRD specifies two and they disagree. §2.2 and US-002
 * define demand as a flat average over ONE lookback window ("total issued/sold
 * qty ÷ lookback days", default 60) and the worked example in §2.4 computes
 * exactly that; US-004 keeps the configurable 7/14/30 windows with weights
 * totalling 100. `lookback` is the default because it is what the calculation
 * spec — the part the reorder point is defined against — actually says. The
 * weighted rule is preserved under `demandMode: 'weighted-windows'` for a
 * business whose demand shifted recently and should be read that way.
 *
 * Cold start short-circuits BEFORE any computation, in either mode. That single
 * ordering is what makes "never a fabricated quantity" (US-003 CON-02)
 * enforceable rather than aspirational: there is no code path that returns a
 * computed velocity for a SKU with less than the configured minimum history.
 */
export function velocityFor(
  sku: string,
  warehouseId: string,
  cfg: ReplenishmentConfig = getReplenishmentConfig(),
  asOf: string = REPL_ASOF_ISO,
): VelocityResult {
  const series = demandSeries(sku, warehouseId, asOf)
  const settings = effectiveSettings(sku, warehouseId, cfg)
  const coldStart = series.historyDays < cfg.coldStartMinDays

  const windows = normalizeWindowWeights(cfg.windows)
  const windowResults: VelocityWindowResult[] = windows.map((w) => {
    const win = demandWindow(sku, warehouseId, w.days, asOf)
    return {
      days: w.days,
      units: win.units,
      weightPct: w.weightPct,
      perDay: win.perDay,
      modelledDays: win.modelledDays,
    }
  })

  const lookbackDays = settings.lookbackDays
  const usingLookback = cfg.demandMode === 'lookback'
  // Citations and volatility read the window the number is actually built from,
  // so the trust drawer never cites documents outside the averaged period.
  const evidenceDays = usingLookback ? lookbackDays : Math.max(...windows.map((w) => w.days))
  const cv = demandCv(sku, warehouseId, evidenceDays, asOf)
  const citations = demandWindow(sku, warehouseId, evidenceDays, asOf).docs

  if (coldStart) {
    // Zero OR thin history (US-002 AC-04): never compute a velocity off too-few
    // points, and never guess from a category seed. Use a per-item manual figure
    // only if a buyer entered one; otherwise report nothing and let the caller
    // route this to "Needs setup" (US-003 AC-03) rather than invent demand for a
    // product that may never sell.
    const manual = settings.manualDailyDemand
    const source: ReplDemandSource = manual === null ? 'none' : 'manual-sku'
    const thin = series.historyDays > 0
    const reason = source === 'manual-sku'
      ? `Cold start (${series.historyDays}d history) — manual ${manual}/day for this item`
      : `Cold start (${thin ? `only ${series.historyDays}d history` : 'no history'}) and no manual demand — needs setup`
    return {
      avgDailySales: manual ?? 0,
      source,
      historyDays: series.historyDays,
      coldStart: true,
      windows: windowResults,
      cv,
      volatile: false,
      citations,
      mode: cfg.demandMode,
      lookbackDays,
      lookbackUnits: 0,
      dampedDays: 0,
      reason,
    }
  }

  const volatile = cv > cfg.volatileCvThreshold

  if (usingLookback) {
    // The spec's own rule: total sold in the window ÷ the window, with single-day
    // spikes damped first so one promo cannot set the reorder point for months.
    const win = demandWindowDamped(sku, warehouseId, lookbackDays, cfg.demandOutlierCapMultiple, asOf)
    // Divide by the days actually available, not the raw window, when history is
    // shorter than the window (US-002 AC-05) — otherwise a product live for 30 of
    // a 60-day window reads at half its true rate. `win.units` already sums only
    // real days, so this only corrects the divisor.
    const availableDays = Math.min(win.days, series.historyDays)
    const perDay = availableDays > 0 ? win.units / availableDays : 0
    return {
      avgDailySales: perDay,
      source: perDay > 0 ? 'computed' : 'none',
      historyDays: series.historyDays,
      coldStart: false,
      windows: windowResults,
      cv,
      volatile,
      citations,
      mode: 'lookback',
      lookbackDays: availableDays,
      lookbackUnits: win.units,
      dampedDays: win.dampedDays,
      reason: perDay > 0
        ? `Averaged ${win.units} sold over ${availableDays} days of sales`
        : `No sales in the last ${availableDays} days`,
    }
  }

  // Weighted mode: cap each window at a multiple of the longest window's rate, so
  // a spike inside the 7-day window cannot drag the blend up for weeks.
  const baseRate = demandWindow(sku, warehouseId, evidenceDays, asOf).perDay
  const cap = baseRate > 0 ? baseRate * 3 : Number.POSITIVE_INFINITY

  const avgDailySales = windowResults.reduce(
    (sum, w) => sum + Math.min(w.perDay, cap) * (w.weightPct / 100),
    0,
  )

  return {
    avgDailySales,
    source: avgDailySales > 0 ? 'computed' : 'none',
    historyDays: series.historyDays,
    coldStart: false,
    windows: windowResults,
    cv,
    volatile,
    citations,
    mode: 'weighted-windows',
    lookbackDays,
    lookbackUnits: 0,
    dampedDays: 0,
    reason: avgDailySales > 0
      ? `Weighted blend of ${windowResults.map((w) => `${w.days}d`).join('/')} windows`
      : 'No sales in the weighted windows',
  }
}

// ── ATP netting (OD-005) ─────────────────────────────────────────────────────

export interface AtpOnOrderDoc {
  receiptId: string
  /** RCV-2026-NNNN */
  number: string
  /** Free-text source reference on the receipt, e.g. "Purchase Order #10500".
   *  NOT a joinable FK — receipts and purchaseOrders use different number formats. */
  purchaseNo: string
  eta: string
  outstanding: number
  vendorName?: string
}

export interface AtpResult {
  onHand: number
  reserved: number
  available: number
  onOrder: number
  netAvailable: number
  oversold: boolean
  onOrderDocs: AtpOnOrderDoc[]
}

/** Receipt statuses that still represent incoming supply. */
const OPEN_RECEIPT_STATUSES = new Set(['pending', 'open', 'in progress', 'partial reception'])

/**
 * Per-warehouse indexes, built once and cached.
 *
 * Without these the engine is O(pairs × warehouse-stock-regeneration) and
 * O(pairs × receipts × line-generation): `getWarehouseDetail` regenerates a whole
 * warehouse's stock (bins, batches, serials) on every call, and `lineItemsForReceipt`
 * rebuilds a receipt's lines on every call. Naively, one worklist build took ~90
 * seconds. Indexed, it is well under a second.
 *
 * Both read reactive data, so any mutation of stock, receipts or receiving tasks
 * must call `invalidateReplenishmentCaches()`.
 */
const stockIndexCache = new Map<string, Map<string, { onHand: number; reserved: number; available: number }>>()
const onOrderIndexCache = new Map<string, Map<string, AtpOnOrderDoc[]>>()

function stockIndex(warehouseId: string) {
  const hit = stockIndexCache.get(warehouseId)
  if (hit) return hit
  const map = new Map<string, { onHand: number; reserved: number; available: number }>()
  for (const s of getWarehouseDetail(warehouseId)?.stock ?? []) {
    map.set(s.sku, { onHand: s.onHand, reserved: s.reserved, available: s.available })
  }
  stockIndexCache.set(warehouseId, map)
  return map
}

function onOrderIndex(warehouseId: string) {
  const hit = onOrderIndexCache.get(warehouseId)
  if (hit) return hit

  const map = new Map<string, AtpOnOrderDoc[]>()
  for (const receipt of receipts) {
    if (receipt.warehouseId !== warehouseId) continue
    if (!OPEN_RECEIPT_STATUSES.has(receipt.status)) continue

    const received = receivedSummaryForReceipt(receipt.id)
    for (const line of lineItemsForReceipt(receipt)) {
      const outstanding = Math.max(0, line.purchaseQty - (received[line.sku]?.received ?? 0))
      if (outstanding <= 0) continue
      const list = map.get(line.sku) ?? []
      list.push({
        receiptId: receipt.id,
        number: receipt.number,
        purchaseNo: receipt.purchaseNo,
        eta: receipt.estimatedArrival,
        outstanding,
        vendorName: receipt.vendor,
      })
      map.set(line.sku, list)
    }
  }
  onOrderIndexCache.set(warehouseId, map)
  return map
}

/** Drop every engine cache. Call after mutating stock, receipts or receiving tasks. */
export function invalidateReplenishmentCaches(): void {
  stockIndexCache.clear()
  onOrderIndexCache.clear()
  invalidateDemandHistory()
  invalidateLeadTimeHistory()
  // Anything watching the revision (tab badges, home tile) recomputes.
  bumpReplenishmentRevision()
}

/**
 * Outstanding incoming quantity for a SKU in a warehouse (US-006).
 *
 * Both halves already exist and are reused rather than re-derived: ordered qty per
 * SKU from `lineItemsForReceipt`, received qty per SKU from
 * `receivedSummaryForReceipt` (which sums a receipt's put-away-complete receiving
 * tasks). So this is a genuine per-SKU figure, not a pro-rata split of the header
 * total — a partially-received receipt contributes only its remainder.
 *
 * Note this deliberately supersedes `WarehouseStockItem.onTheWay`, which is
 * synthetic (`(i * 7) % 60`) and not derived from any real document.
 */
export function onOrderFor(sku: string, warehouseId: string): AtpOnOrderDoc[] {
  return onOrderIndex(warehouseId).get(sku) ?? []
}

export function atpFor(sku: string, warehouseId: string): AtpResult {
  const stock = stockIndex(warehouseId).get(sku)
  const onHand = stock?.onHand ?? 0
  const reserved = stock?.reserved ?? 0
  const available = stock?.available ?? onHand - reserved
  const onOrderDocs = onOrderFor(sku, warehouseId)
  const onOrder = onOrderDocs.reduce((s, d) => s + d.outstanding, 0)

  return {
    onHand,
    reserved,
    available,
    onOrder,
    netAvailable: available + onOrder,
    oversold: available < 0,
    onOrderDocs,
  }
}

// ── Suggested quantity (OD-001) ──────────────────────────────────────────────

export interface SuggestionResult {
  /** (lead + safety) × velocity — the demand the order must cover. */
  targetQty: number
  /** target − (available + onOrder), before flooring. */
  gapQty: number
  /** max(0, ceil(gap)) in STOCKING units. */
  rawQty: number
  /** Whole PURCHASE units after MOQ and pack rounding. */
  purchaseQty: number
  /** purchaseQty × unitsPerPurchaseUnit — what actually lands in stock. */
  stockingQty: number
  purchaseUnit: string
  unitsPerPurchaseUnit: number
  raisedByMoq: boolean
  raisedByPack: boolean
  cappedByMaxLevel: boolean
  suppressed: boolean
  suppressReason: 'above-reorder-point' | 'no-demand-basis' | 'no-lead-time' | 'not-tracked' | null
  /** Ordered arithmetic steps, for the trust drawer. */
  trace: { label: string; value: string }[]
}

/**
 * The PRD quantity formula (§2.3, US-008 AC-03), isolated so a spec can
 * table-drive it:
 *
 *   qty = avgDailySales × (lead + safety + coverage) − (netAvailable + onOrder)
 *
 * Coverage days are what make this an ORDER-UP-TO quantity rather than a top-up
 * to the trigger. Drop them and the order refills to exactly the reorder point,
 * so the SKU is due again the next day — the bug decision D9 exists to prevent.
 *
 * Pass `maxLevel` to size in units instead (US-011 AC-03): the target becomes
 * that level outright, not the coverage horizon. It REPLACES the horizon — it is
 * not a cap applied afterwards, which would silently produce an order too small
 * to clear the trigger.
 */
export function suggestedRawQty(
  leadDays: number,
  safetyDays: number,
  coverageDays: number,
  avgDailySales: number,
  available: number,
  onOrder: number,
  maxLevel: number | null = null,
): number {
  const target = maxLevel !== null
    ? maxLevel
    : (leadDays + safetyDays + coverageDays) * avgDailySales
  return Math.max(0, Math.ceil(target - (available + onOrder)))
}

/**
 * MOQ raise then pack round-up, in PURCHASE units.
 *
 * Conversion happens BEFORE these rules, which is a deliberate departure from the
 * PRD's literal ordering: MOQ and pack size are quantities a supplier quotes
 * ("minimum 2 pallets, sold in multiples of 1"), so they are natively in purchase
 * units. Applying them to stocking units and converting afterwards produces
 * fractional purchase quantities. The seed guarantees `moq % packSize === 0`, so
 * both orderings give identical results — and a spec asserts that, so a future MOQ
 * edit that breaks the invariant fails loudly instead of drifting.
 */
export function applyMoqAndPack(
  rawStockingQty: number,
  vi: VendorItem | undefined,
): { purchaseQty: number; stockingQty: number; raisedByMoq: boolean; raisedByPack: boolean } {
  const unitsPer = Math.max(1, vi?.unitsPerPurchaseUnit ?? 1)
  const moq = Math.max(0, vi?.moq ?? 0)
  const packSize = Math.max(1, vi?.packSize ?? 1)

  if (rawStockingQty <= 0) {
    return { purchaseQty: 0, stockingQty: 0, raisedByMoq: false, raisedByPack: false }
  }

  const converted = Math.ceil(rawStockingQty / unitsPer)
  const afterMoq = Math.max(converted, moq)
  const afterPack = Math.ceil(afterMoq / packSize) * packSize

  return {
    purchaseQty: afterPack,
    stockingQty: afterPack * unitsPer,
    raisedByMoq: afterMoq > converted,
    raisedByPack: afterPack > afterMoq,
  }
}

/**
 * Whether a SKU is covered and should NOT appear (US-010).
 * `inclusive` treats sitting exactly at the reorder point as covered;
 * `exclusive` only suppresses strictly above it. Named by what happens AT the
 * boundary, defined once, read by both the engine and the badges.
 */
export function isSuppressed(
  available: number,
  onOrder: number,
  reorderPoint: number,
  mode: ReplBoundaryMode,
): boolean {
  const position = available + onOrder
  return mode === 'inclusive' ? position >= reorderPoint : position > reorderPoint
}

// ── Reorder point ────────────────────────────────────────────────────────────

export interface ReorderPointResult {
  value: number
  source: 'sku-warehouse' | 'sku' | 'calculated' | 'none'
}

/**
 * Reorder point = velocity × (lead + safety), unless overridden. Min stock is
 * ALWAYS this computation — there is NO direct category/global min-stock seed
 * (D17). A cold-start SKU is not an exception: it still computes, using the
 * per-category cold-start DEMAND seed (resolved in `velocityFor`) in place of a
 * measured velocity. One formula, one cold-start path, zero manual reorder points.
 *
 * Deliberately NOT seeded from `WarehouseStockItem.minStock`. That field averages
 * 96 units against an average available qty of 11, so 264 of the seed's 270 pairs
 * sit below it — using it would put essentially the whole catalogue on the worklist
 * every day and directly contradict US-010's "keep the worklist trustworthy".
 * `minStock` stays exactly as it is for the Products and warehouse screens; this
 * feature simply computes its own trigger, which is also the textbook definition
 * and what TS-001's "accept the system-suggested default" implies.
 *
 * With no velocity AND no cold-start seed there is no demand to protect against,
 * so there is no reorder point and the SKU is routed to Needs setup — the correct
 * answer, not a fabricated floor.
 */
export function resolveReorderPoint(
  settings: EffectiveReplenishmentSettings,
  velocity: number,
  leadDays: number,
): ReorderPointResult {
  if (settings.reorderPointOverride !== null) {
    return {
      value: settings.reorderPointOverride,
      source: settings.reorderPointSource === 'sku-warehouse' ? 'sku-warehouse' : 'sku',
    }
  }
  // No demand (neither measured nor a cold-start seed) ⇒ no reorder point (D17).
  // The SKU is routed to Needs setup upstream; nothing is invented here.
  if (velocity <= 0) return { value: 0, source: 'none' }
  return { value: Math.ceil(velocity * (leadDays + settings.safetyDays)), source: 'calculated' }
}

// ── FSN classification with hysteresis (OD-006) ──────────────────────────────

export interface FsnResult {
  raw: FsnClass
  committed: FsnClass
  movementPct: number
  movementDays: number
  periods: number
  candidate: FsnClass | null
  dwell: number
  dwellRequired: number
  inHysteresisBand: boolean
  decisive: boolean
  tracked: boolean
}

export function rawFsnClass(movementPct: number, historyDays: number, cfg: ReplenishmentConfig): FsnClass {
  // Too new to classify is NOT the same as not moving (US-012 EH-01). Same
  // threshold as cold start, so a SKU is never simultaneously "too new to estimate
  // demand" and "confidently Fast".
  if (historyDays < cfg.coldStartMinDays) return 'unclassified'
  if (movementPct >= cfg.fsnFastPct) return 'fast'
  if (movementPct >= cfg.fsnSlowPct) return 'slow'
  return 'non-moving'
}

const CLASS_RANK: Record<FsnClass, number> = { 'non-moving': 0, slow: 1, fast: 2, unclassified: -1 }

/**
 * Hold a class until it clears the hysteresis band and then holds for the dwell
 * period (US-015). Decisive moves bypass the dwell:
 *   • a two-step jump (fast ↔ non-moving),
 *   • movement far beyond the band (≥ 2× the band width),
 *   • any transition into or out of `unclassified` — that is a data-availability
 *     change (history crossed the threshold), not a demand wobble, so making it
 *     wait two cycles would be dishonest.
 */
export function applyHysteresis(
  prior: FsnClassMemo | undefined,
  raw: FsnClass,
  movementPct: number,
  cfg: ReplenishmentConfig,
  runNo: number,
): { memo: FsnClassMemo; inBand: boolean; decisive: boolean } {
  if (!prior) {
    return { memo: { cls: raw, since: runNo, dwell: 0, candidate: null }, inBand: false, decisive: true }
  }
  if (raw === prior.cls) {
    return { memo: { ...prior, dwell: 0, candidate: null }, inBand: false, decisive: false }
  }

  const band = cfg.fsnHysteresisPct
  const boundary = raw === 'fast' || prior.cls === 'fast' ? cfg.fsnFastPct : cfg.fsnSlowPct
  const distance = Math.abs(movementPct - boundary)
  const inBand = distance <= band

  const twoStep = Math.abs(CLASS_RANK[raw] - CLASS_RANK[prior.cls]) >= 2
  const involvesUnclassified = raw === 'unclassified' || prior.cls === 'unclassified'
  const decisive = twoStep || involvesUnclassified || distance >= band * 2

  if (decisive) {
    return { memo: { cls: raw, since: runNo, dwell: 0, candidate: null }, inBand, decisive: true }
  }
  if (inBand) {
    // Sitting on the fence — hold the current class and reset any pending change.
    return { memo: { ...prior, dwell: 0, candidate: null }, inBand: true, decisive: false }
  }

  const dwell = prior.candidate === raw ? prior.dwell + 1 : 1
  if (dwell >= cfg.fsnDwellCycles) {
    return { memo: { cls: raw, since: runNo, dwell: 0, candidate: null }, inBand: false, decisive: false }
  }
  return { memo: { ...prior, dwell, candidate: raw }, inBand: false, decisive: false }
}

export function fsnFor(
  sku: string,
  warehouseId: string,
  cfg: ReplenishmentConfig = getReplenishmentConfig(),
  asOf: string = REPL_ASOF_ISO,
): FsnResult {
  const win = demandWindow(sku, warehouseId, cfg.fsnWindowDays, asOf)
  const series = demandSeries(sku, warehouseId, asOf)
  const movementPct = win.days ? (win.movementDays / win.days) * 100 : 0
  const raw = rawFsnClass(movementPct, series.historyDays, cfg)
  const memo = classMemo(sku, warehouseId)
  const settings = effectiveSettings(sku, warehouseId, cfg)

  const band = cfg.fsnHysteresisPct
  const boundary = raw === 'fast' || memo?.cls === 'fast' ? cfg.fsnFastPct : cfg.fsnSlowPct
  const inBand = memo ? Math.abs(movementPct - boundary) <= band && raw !== memo.cls : false

  return {
    raw,
    // No memo yet = never recalculated, so the raw class is what to show.
    committed: memo?.cls ?? raw,
    movementPct,
    movementDays: win.movementDays,
    periods: win.days,
    candidate: memo?.candidate ?? null,
    dwell: memo?.dwell ?? 0,
    dwellRequired: cfg.fsnDwellCycles,
    inHysteresisBand: inBand,
    decisive: false,
    tracked: settings.tracked,
  }
}

// ── Days of cover (OD-003) ───────────────────────────────────────────────────

export interface CoverResult {
  coverDays: number | null
  belowLeadTime: boolean
}

/**
 * How long current free stock lasts at the current pace.
 *
 * Uses `available`, not `available + onOrder`: the question is "when do I run out",
 * and comparing that against lead time is precisely how you learn whether incoming
 * supply arrives in time (US-019 AC-03). Netting the incoming in first would make
 * that comparison circular. Matches US-019 AC-01's worked example.
 *
 * Velocity 0 returns null — never Infinity, never a fabricated large number.
 */
export function daysOfCover(available: number, avgDailySales: number, leadDays: number): CoverResult {
  if (avgDailySales <= 0) return { coverDays: null, belowLeadTime: false }
  const coverDays = available / avgDailySales
  return { coverDays, belowLeadTime: coverDays < leadDays }
}

// ── Worklist row ─────────────────────────────────────────────────────────────

export type WorklistBucket = 'reorder' | 'needs-setup' | 'no-vendor' | 'covered' | 'not-tracked'

export interface WorklistRow {
  /** `${sku}::${warehouseId}` */
  key: string
  sku: string
  productName: string
  productDesc: string
  category: string
  unit: string
  img: string
  warehouseId: string
  warehouseName: string

  reorderPoint: number
  reorderPointSource: ReorderPointResult['source']
  safetyDays: number
  safetyDaysSource: EffectiveReplenishmentSettings['safetyDaysSource']
  maxLevel: number | null
  leadTimeDays: number
  leadTimeEstimated: boolean
  /** Which rung of the US-001 ladder produced leadTimeDays. */
  leadTimeTier: LeadTimeTier
  /** PO-backed receipts averaged, when the tier is `computed`. */
  leadTimeSampleSize: number
  /** Receipts skipped for having no upstream PO (US-001 AC-02). */
  leadTimeExcludedNoPo: number
  /** Coverage horizon used to size the quantity (D9). */
  coverageDays: number

  atp: AtpResult
  velocity: VelocityResult
  cover: CoverResult
  fsn: FsnResult

  vendor: { id: string; name: string } | null
  vendorItem: VendorItem | null
  alternates: VendorItem[]

  suggestion: SuggestionResult
  bucket: WorklistBucket
  /** What the row is still missing — drives the "Needs setup" chips. */
  missing: string[]
  flags: {
    dueForReorder: boolean
    oversold: boolean
    belowLeadTime: boolean
    volatile: boolean
    leadTimeEstimated: boolean
    mutedButActive: boolean
  }
  /** Sort score — urgency, never shown as a column. */
  urgency: number
  asOf: string
}

const FSN_WEIGHT: Record<FsnClass, number> = { fast: 1, slow: 0.5, 'non-moving': 0.1, unclassified: 0.2 }

export function buildRow(
  sku: string,
  warehouseId: string,
  cfg: ReplenishmentConfig = getReplenishmentConfig(),
  asOf: string = REPL_ASOF_ISO,
): WorklistRow {
  const product = productBySku(sku)
  const warehouse = warehouses.find((w) => w.id === warehouseId)
  const settings = effectiveSettings(sku, warehouseId, cfg)
  const velocity = velocityFor(sku, warehouseId, cfg, asOf)
  const atp = atpFor(sku, warehouseId)
  const fsn = fsnFor(sku, warehouseId, cfg, asOf)

  const vendorItem = preferredVendorItem(sku) ?? null
  const alternates = vendorItemsForSku(sku).filter((v) => v.vendorId !== vendorItem?.vendorId)

  // Lead time is MEASURED from this vendor+product's PO→receipt history, then
  // falls down the ladder (US-001 VR-04). A hand-entered value outranks the whole
  // ladder — it is the buyer telling the system something it could not observe.
  const derivedLead = deriveLeadTime(vendorItem?.vendorId ?? null, sku, cfg)
  const manualLead = settings.manualLeadTimeDays
  const leadTimeDays = manualLead ?? derivedLead.days ?? cfg.fallbackLeadTimeDays
  const leadTimeTier: LeadTimeTier = manualLead !== null ? 'manual' : derivedLead.tier
  const leadTimeEstimated = isEstimatedTier(leadTimeTier)
  // No vendor and no manual figure means nothing to measure against at all.
  const leadTimeMissing = manualLead === null && derivedLead.tier === 'none'

  const rop = resolveReorderPoint(settings, velocity.avgDailySales, leadTimeDays)
  const cover = daysOfCover(atp.available, velocity.avgDailySales, leadTimeDays)

  // ── Suggestion ──
  const hasDemandBasis = velocity.avgDailySales > 0
  // Both inputs must resolve before any number is produced. US-003 CON-02 is a
  // constraint on the ENGINE, not on the page: a row missing either one must
  // reach the UI with a zero quantity, so no rendering mistake can ever surface
  // a fabricated figure.
  const canRecommend = hasDemandBasis && !leadTimeMissing
  const coverageDays = settings.coverageDays
  const usingMaxLevel = settings.maxLevel !== null
  // The order-up-to level: a units ceiling when one is set (US-011 AC-03),
  // otherwise the demand that lead + safety + coverage days represents.
  const targetQty = usingMaxLevel
    ? settings.maxLevel!
    : (leadTimeDays + settings.safetyDays + coverageDays) * velocity.avgDailySales
  const gapQty = targetQty - (atp.available + atp.onOrder)
  const rawQty = canRecommend
    ? suggestedRawQty(
        leadTimeDays, settings.safetyDays, coverageDays,
        velocity.avgDailySales, atp.available, atp.onOrder,
        settings.maxLevel,
      )
    : 0
  const cappedByMaxLevel = usingMaxLevel

  const suppressedByCover = canRecommend
    && rop.source !== 'none'
    && isSuppressed(atp.available, atp.onOrder, rop.value, cfg.reorderBoundary)

  const rounded = applyMoqAndPack(suppressedByCover ? 0 : rawQty, vendorItem ?? undefined)

  const suppressReason: SuggestionResult['suppressReason'] =
    !settings.tracked ? 'not-tracked'
    : !hasDemandBasis ? 'no-demand-basis'
    : leadTimeMissing ? 'no-lead-time'
    : suppressedByCover ? 'above-reorder-point'
    : null

  const trace: { label: string; value: string }[] = [
    {
      label: 'Average daily sales',
      value: velocity.mode === 'lookback' && velocity.lookbackDays > 0
        ? `${velocity.lookbackUnits} ${product?.unit ?? ''} ÷ ${velocity.lookbackDays} days = ${velocity.avgDailySales.toFixed(2)}/day`
        : `${velocity.avgDailySales.toFixed(2)} ${product?.unit ?? ''}/day`,
    },
    { label: 'Lead time', value: `${leadTimeDays} days (${leadTimeTierLabel(leadTimeTier, derivedLead.sampleSize)})` },
    { label: 'Safety days', value: `${settings.safetyDays} days` },
    { label: 'Coverage days', value: `${coverageDays} days` },
    {
      label: usingMaxLevel ? 'Order up to (max level)' : 'Order up to',
      value: usingMaxLevel
        ? `${targetQty} ${product?.unit ?? ''}`
        : `(${leadTimeDays} + ${settings.safetyDays} + ${coverageDays}) × ${velocity.avgDailySales.toFixed(2)} = ${targetQty.toFixed(1)}`,
    },
    { label: 'Available', value: `${atp.available}` },
    { label: 'On order', value: `${atp.onOrder}` },
    { label: 'Shortfall', value: `${targetQty.toFixed(1)} − (${atp.available} + ${atp.onOrder}) = ${gapQty.toFixed(1)}` },
    { label: 'Rounded up', value: `${rawQty} ${product?.unit ?? ''}` },
  ]
  if (vendorItem && rounded.purchaseQty > 0) {
    trace.push({
      label: 'Order quantity',
      value: `${rounded.purchaseQty} ${vendorItem.purchaseUnit} (${rounded.stockingQty} ${product?.unit ?? ''})`,
    })
  }

  const suggestion: SuggestionResult = {
    targetQty,
    gapQty,
    rawQty,
    purchaseQty: rounded.purchaseQty,
    stockingQty: rounded.stockingQty,
    purchaseUnit: vendorItem?.purchaseUnit ?? product?.unit ?? 'Unit',
    unitsPerPurchaseUnit: vendorItem?.unitsPerPurchaseUnit ?? 1,
    raisedByMoq: rounded.raisedByMoq,
    raisedByPack: rounded.raisedByPack,
    cappedByMaxLevel,
    suppressed: suppressReason !== null,
    suppressReason,
    trace,
  }

  // ── Bucketing ──
  const demandMissing = velocity.coldStart && velocity.source === 'none'
  const missing: string[] = []
  if (!vendorItem) missing.push('Vendor')
  if (demandMissing) missing.push('Sales history')
  if (leadTimeMissing) missing.push('Lead time')

  const dueForReorder = settings.tracked
    && canRecommend
    && rop.source !== 'none'
    && !suppressedByCover

  let bucket: WorklistBucket
  if (!settings.tracked) bucket = 'not-tracked'
  // US-003 AC-01/AC-02: either gap routes here. An ESTIMATED lead time is not a
  // gap — it resolved, it is simply tagged — so it must not land in Needs setup.
  else if (demandMissing || leadTimeMissing) bucket = 'needs-setup'
  else if (dueForReorder && !vendorItem) bucket = 'no-vendor'
  else if (dueForReorder) bucket = 'reorder'
  else bucket = 'covered'

  // A muted SKU still has to fire a stockout alert (US-014): muting removes routine
  // worklist noise, never a genuine risk.
  const mutedButActive = !settings.tracked
    && hasDemandBasis
    && rop.source !== 'none'
    && !isSuppressed(atp.available, atp.onOrder, rop.value, cfg.reorderBoundary)

  const coverGap = rop.value > 0
    ? Math.min(1, Math.max(0, (rop.value - (atp.available + atp.onOrder)) / rop.value))
    : 0
  const urgency = 3 * (cover.belowLeadTime ? 1 : 0)
    + 2 * (atp.oversold ? 1 : 0)
    + FSN_WEIGHT[fsn.committed]
    + coverGap

  return {
    key: memoKey(sku, warehouseId),
    sku,
    productName: product?.name ?? sku,
    productDesc: product?.desc ?? '',
    category: product?.category ?? '',
    unit: product?.unit ?? '',
    img: product?.img ?? '',
    warehouseId,
    warehouseName: warehouse?.name ?? warehouseId,

    reorderPoint: rop.value,
    reorderPointSource: rop.source,
    safetyDays: settings.safetyDays,
    safetyDaysSource: settings.safetyDaysSource,
    maxLevel: settings.maxLevel,
    leadTimeDays,
    leadTimeEstimated,
    leadTimeTier,
    leadTimeSampleSize: derivedLead.sampleSize,
    leadTimeExcludedNoPo: derivedLead.excludedNoPo,
    coverageDays,

    atp,
    velocity,
    cover,
    fsn,

    vendor: vendorItem ? { id: vendorItem.vendorId, name: vendorNameFor(vendorItem.vendorId) } : null,
    vendorItem,
    alternates,

    suggestion,
    bucket,
    missing,
    flags: {
      dueForReorder,
      oversold: atp.oversold,
      belowLeadTime: cover.belowLeadTime,
      volatile: velocity.volatile,
      leadTimeEstimated,
      mutedButActive,
    },
    urgency,
    asOf,
  }
}

// ── Worklist ─────────────────────────────────────────────────────────────────

export interface Worklist {
  asOf: string
  scope: 'all' | string
  /** bucket === 'reorder' or 'no-vendor' — everything due today. */
  rows: WorklistRow[]
  needsSetup: WorklistRow[]
  notTracked: WorklistRow[]
  mutedButActive: WorklistRow[]
  totals: {
    pairs: number
    due: number
    oversold: number
    belowLeadTime: number
    needsSetup: number
    noVendor: number
    overstock: number
  }
}

/**
 * Warehouses the worklist covers: active, non-default, and with replenishment
 * turned on in Configure warehouse. Same base filter cycleCountRecommendations
 * uses, plus the per-warehouse opt-out — a warehouse switched off contributes no
 * rows at all, which is what produces the "not set up" empty state.
 */
export function replenishmentWarehouses() {
  return warehouses.filter(
    (w) => !w.isDefault && w.status === 'active' && getWarehouseConfig(w.id).replenishmentEnabled,
  )
}

// ── Product-level rollup (PRD decision D13, US-024 AC-04 / VR-02) ───────────

export interface WarehouseMinStock {
  warehouseId: string
  warehouseName: string
  /** The floor actually in force here — what the warehouse table shows. */
  value: number
  source: 'sku-warehouse' | 'sku' | 'calculated' | 'stored'
  /** What the formula gives; null when the warehouse has no demand to compute from. */
  calculated: number | null
  velocity: number
  leadTimeDays: number
  safetyDays: number
}

export interface MinStockRollup {
  /**
   * Σ of every warehouse's effective reorder point.
   *
   * Deliberately NOT surfaced as a product headline (decision D13a): it is exact
   * arithmetic that nobody acts on, and read as a pooled requirement it is
   * biased high — risk-pooling says central stock scales with √N, not N. Kept
   * only so a caller that genuinely needs a visibility total can label it
   * "aggregate of independent triggers". Never a trigger.
   */
  total: number
  perWarehouse: WarehouseMinStock[]
  /** Warehouses whose figure is a stored floor rather than a calculated one. */
  notCalculatedCount: number
}

/** What a product/network view rolls up instead of a threshold (D13a). */
export interface ProductActionRollup {
  /** Warehouses where this SKU is due today. */
  dueCount: number
  /** Warehouses this SKU is stocked in. */
  warehouseCount: number
  /** Σ suggested order qty across the due warehouses, in stock units. */
  totalSuggestedQty: number
  unit: string
  /** Due rows, so the caller can hand them straight to a Purchase Request. */
  dueWarehouses: { warehouseId: string; warehouseName: string; qty: number }[]
}

/**
 * The product-level rollup that is worth surfacing: the ACTION, not the threshold.
 *
 * Decision D13a. A summed min stock is a number no one can act on — you cannot
 * order against it, and it misleads if read as a pooled requirement. What a buyer
 * looking at one product across nine warehouses actually wants to know is where
 * it is short and how much to ask for, which leads straight into raising a
 * Purchase Request.
 *
 * Each warehouse's due/not-due is still decided entirely on its own reorder
 * point; this only counts those decisions, never blends them.
 */
export function productActionRollup(
  sku: string,
  cfg: ReplenishmentConfig = getReplenishmentConfig(),
  asOf: string = REPL_ASOF_ISO,
): ProductActionRollup {
  const dueWarehouses: ProductActionRollup['dueWarehouses'] = []
  let warehouseCount = 0
  let unit = ''

  for (const wh of replenishmentWarehouses()) {
    if (!warehouseProducts(wh.id).some((p) => p.sku === sku)) continue
    warehouseCount++
    const row = buildRow(sku, wh.id, cfg, asOf)
    unit ||= row.unit
    if (!row.flags.dueForReorder) continue
    dueWarehouses.push({
      warehouseId: wh.id,
      warehouseName: wh.name,
      // The need in stock units — the same figure the worklist and the PR carry.
      qty: row.suggestion.rawQty,
    })
  }

  return {
    dueCount: dueWarehouses.length,
    warehouseCount,
    totalSuggestedQty: dueWarehouses.reduce((s, w) => s + w.qty, 0),
    unit,
    dueWarehouses,
  }
}

/**
 * Every warehouse's effective minimum stock for a SKU, and their sum.
 *
 * Decision D13 fixes the direction of travel: the WAREHOUSE is the source of
 * truth and the only replenishment trigger, and the product-level number is a
 * DERIVED rollup — Σ effective warehouse reorder points — that aggregates
 * bottom-up and never pushes back down.
 *
 * It is display-only and never a trigger, because stock is not fungible across
 * locations: holding more than the company-wide total says nothing about whether
 * Surabaya is about to run out, and treating the sum as a threshold would hide
 * exactly the per-warehouse stockout the feature exists to catch (US-025, no
 * pooling).
 *
 * One function, read by both the product page and the warehouse table, so the
 * total can never disagree with the column it is a sum of.
 */
export function warehouseMinStockRollup(
  sku: string,
  cfg: ReplenishmentConfig = getReplenishmentConfig(),
  asOf: string = REPL_ASOF_ISO,
): MinStockRollup {
  const perWarehouse: WarehouseMinStock[] = []

  for (const stock of getProductWarehouseStock(sku)) {
    const wh = warehouses.find((w) => w.id === stock.warehouseId)
    if (!wh || !getWarehouseConfig(wh.id).replenishmentEnabled) continue

    const row = buildRow(sku, stock.warehouseId, cfg, asOf)
    const velocity = row.velocity.avgDailySales
    const calculated = velocity > 0
      ? Math.ceil(velocity * (row.leadTimeDays + row.safetyDays))
      : null

    // A warehouse with no demand has no calculated floor (no category seed exists
    // any more — D17). The legacy stored min. stock is still what the low-stock
    // alerts on the Products and warehouse screens enforce, so for this
    // display-only rollup that is its effective value, labelled as not
    // demand-derived.
    const source: WarehouseMinStock['source'] =
      row.reorderPointSource === 'sku-warehouse' ? 'sku-warehouse'
      : row.reorderPointSource === 'sku' ? 'sku'
      : calculated !== null ? 'calculated'
      : 'stored'
    const value = source === 'stored' ? stock.minStock : row.reorderPoint

    perWarehouse.push({
      warehouseId: stock.warehouseId,
      warehouseName: stock.warehouseName,
      value,
      source,
      calculated,
      velocity,
      leadTimeDays: row.leadTimeDays,
      safetyDays: row.safetyDays,
    })
  }

  return {
    total: perWarehouse.reduce((sum, w) => sum + w.value, 0),
    perWarehouse,
    notCalculatedCount: perWarehouse.filter((w) => w.source === 'stored').length,
  }
}

/**
 * Whether a hand-set warehouse floor sits materially below what demand justifies
 * (US-024 VR-03).
 *
 * Not an error — a buyer may know something the history does not. But a manual
 * floor well under the computed one is how a busy location quietly stops being
 * flagged, so it is surfaced rather than left to be discovered at the stockout.
 */
export function isManualFloorTooLow(w: WarehouseMinStock, tolerancePct = 20): boolean {
  if (w.source !== 'sku-warehouse' && w.source !== 'sku') return false
  if (w.calculated === null || w.calculated <= 0) return false
  return w.value < w.calculated * (1 - tolerancePct / 100)
}

// ── SKU-level minimum stock recommendation (PRD §2.2 item 3, US-024 AC-03) ───

export interface MinStockRecommendation {
  /** null when there is no demand or lead-time basis yet — never a guess. */
  value: number | null
  avgDailySales: number
  leadTimeDays: number
  leadTimeTier: LeadTimeTier
  /**
   * Whether the lead time is MEASURED or inherited. A category default and an
   * average of five real receipts produce numbers that look identical on screen,
   * so any surface quoting one must be able to say which it is (US-001 AC-03/04).
   */
  leadTimeEstimated: boolean
  /** PO-backed receipts averaged, when the tier is `computed`; 0 otherwise. */
  leadTimeSampleSize: number
  /** null when no preferred vendor is set — the lead time is then not theirs. */
  preferredVendorId: string | null
  preferredVendorName: string
  safetyDays: number
  /** The warehouse this figure came from — the one that would run out first. */
  warehouseId: string
  warehouseName: string
  /** How many warehouses stock this SKU, so the UI can say the number varies. */
  warehouseCount: number
}

/**
 * The minimum stock the system RECOMMENDS for a product.
 *
 * The PRD is explicit that these are the same quantity, not two policies:
 * "Reorder Point = MINIMUM STOCK THRESHOLD (units) = Average daily demand ×
 * (Lead time + Safety days)". So min. stock is not a number a user should have to
 * invent — safety days is the judgement call, and this is what that judgement
 * works out to once the vendor's lead time and the product's real sales rate are
 * taken into account. The user can still overwrite it (US-024 AC-03 keeps a
 * SKU-level default that per-warehouse settings may override in turn).
 *
 * Grain. A reorder point is per item × warehouse, but a product form is per
 * product, so this returns the SKU-level DEFAULT that warehouses inherit. It
 * takes the HIGHEST per-warehouse figure rather than an average: a floor that is
 * too low causes the stockout this feature exists to prevent, while one that is
 * slightly high costs a little carrying stock in the quieter locations — and
 * those locations can be tuned individually from the worklist.
 *
 * `safetyDaysOverride` lets a form recompute live as the user types, before
 * anything is saved.
 */
export function recommendedMinStock(
  sku: string,
  safetyDaysOverride?: number,
  cfg: ReplenishmentConfig = getReplenishmentConfig(),
  asOf: string = REPL_ASOF_ISO,
): MinStockRecommendation {
  const vendorItem = preferredVendorItem(sku) ?? null
  const derived = deriveLeadTime(vendorItem?.vendorId ?? null, sku, cfg)

  let best: MinStockRecommendation | null = null
  let count = 0

  for (const wh of replenishmentWarehouses()) {
    if (!warehouseProducts(wh.id).some((p) => p.sku === sku)) continue
    count++

    const settings = effectiveSettings(sku, wh.id, cfg)
    const velocity = velocityFor(sku, wh.id, cfg, asOf)
    const safetyDays = safetyDaysOverride ?? settings.safetyDays
    const leadTimeDays = settings.manualLeadTimeDays ?? derived.days ?? cfg.fallbackLeadTimeDays
    const tier: LeadTimeTier = settings.manualLeadTimeDays !== null ? 'manual' : derived.tier

    // No demand basis means no reorder point — the same rule the worklist uses,
    // so the form cannot show a number the engine would refuse to stand behind.
    if (velocity.avgDailySales <= 0) continue

    const value = Math.ceil(velocity.avgDailySales * (leadTimeDays + safetyDays))
    if (!best || value > best.value!) {
      best = {
        value,
        avgDailySales: velocity.avgDailySales,
        leadTimeDays,
        leadTimeTier: tier,
        leadTimeEstimated: isEstimatedTier(tier),
        leadTimeSampleSize: derived.sampleSize,
        preferredVendorId: vendorItem?.vendorId ?? null,
        preferredVendorName: vendorItem ? vendorNameFor(vendorItem.vendorId) : '',
        safetyDays,
        warehouseId: wh.id,
        warehouseName: wh.name,
        warehouseCount: 0,
      }
    }
  }

  if (best) return { ...best, warehouseCount: count }

  // Nothing to compute from yet — a brand-new product, or one that has never
  // moved. Report that honestly rather than inventing a floor (US-003 CON-02).
  return {
    value: null,
    avgDailySales: 0,
    leadTimeDays: derived.days ?? cfg.fallbackLeadTimeDays,
    leadTimeTier: derived.tier,
    leadTimeEstimated: isEstimatedTier(derived.tier),
    leadTimeSampleSize: derived.sampleSize,
    preferredVendorId: vendorItem?.vendorId ?? null,
    preferredVendorName: vendorItem ? vendorNameFor(vendorItem.vendorId) : '',
    safetyDays: safetyDaysOverride ?? cfg.safetyDaysGlobal,
    warehouseId: '',
    warehouseName: '',
    warehouseCount: count,
  }
}

/**
 * Build the worklist for one warehouse, or all of them.
 *
 * 'all' returns the UNION of per-warehouse rows — never a blended total. There is
 * no summed reorder point and no company-wide row, so a SKU short in A and
 * overstocked in B shows both facts (US-025 AC-02/AC-03).
 */
export function replenishmentWorklist(
  scope: 'all' | string = 'all',
  cfg: ReplenishmentConfig = getReplenishmentConfig(),
  asOf: string = REPL_ASOF_ISO,
): Worklist {
  const rows: WorklistRow[] = []
  const needsSetup: WorklistRow[] = []
  const notTracked: WorklistRow[] = []
  const mutedButActive: WorklistRow[] = []
  let pairs = 0
  let oversold = 0
  let belowLeadTime = 0
  let overstock = 0
  let noVendor = 0

  for (const wh of replenishmentWarehouses()) {
    if (scope !== 'all' && wh.id !== scope) continue
    for (const product of warehouseProducts(wh.id)) {
      const row = buildRow(product.sku, wh.id, cfg, asOf)
      pairs++
      if (row.atp.oversold) oversold++
      if (row.flags.belowLeadTime) belowLeadTime++
      if (row.maxLevel !== null && row.atp.available >= row.maxLevel) overstock++
      if (row.flags.mutedButActive) mutedButActive.push(row)

      switch (row.bucket) {
        case 'reorder': rows.push(row); break
        case 'no-vendor': rows.push(row); noVendor++; break
        case 'needs-setup': needsSetup.push(row); break
        case 'not-tracked': notTracked.push(row); break
        default: break
      }
    }
  }

  const byUrgency = (a: WorklistRow, b: WorklistRow) => b.urgency - a.urgency
  rows.sort(byUrgency)
  needsSetup.sort((a, b) => b.missing.length - a.missing.length || a.atp.available - b.atp.available)
  notTracked.sort((a, b) => a.productName.localeCompare(b.productName))

  return {
    asOf,
    scope,
    rows,
    needsSetup,
    notTracked,
    mutedButActive,
    totals: {
      pairs,
      due: rows.length,
      oversold,
      belowLeadTime,
      needsSetup: needsSetup.length,
      noVendor,
      overstock,
    },
  }
}

/**
 * Count of products due for reorder.
 *
 * The page, the tab badge and the home tile ALL call this, so they cannot disagree
 * — the same anti-drift arrangement `cycleCountRecommendations.recommendationCount`
 * uses for the cycle-count badge.
 */
/** Read this in a computed to make it recompute after any replenishment write. */
export { replenishmentRevision }

export function replenishmentDueCount(warehouseId?: string): number {
  return replenishmentWorklist(warehouseId ?? 'all').totals.due
}

export function replenishmentSetupCount(warehouseId?: string): number {
  return replenishmentWorklist(warehouseId ?? 'all').totals.needsSetup
}

// ── Recalculation (the "cycle") ──────────────────────────────────────────────

export interface RecalculateResult {
  runNo: number
  ranAt: string
  reclassified: number
  due: number
  needsSetup: number
  pairs: number
}

/**
 * One recalculation = one cycle. Computes raw FSN classes for every pair, runs them
 * through the hysteresis/dwell rules against the stored memos, and commits the run.
 *
 * `ranAt` uses the real wall clock, which is safe because this only ever runs inside
 * a user's click handler — never at module init and never during SSR.
 */
export function recalculateReplenishment(
  scope: 'all' | string = 'all',
  cfg: ReplenishmentConfig = getReplenishmentConfig(),
  asOf: string = REPL_ASOF_ISO,
  ranAt?: string,
): RecalculateResult {
  const memos: Record<string, FsnClassMemo> = {}
  let reclassified = 0
  let pairs = 0

  const nextRunNo = currentRunNo() + 1

  for (const wh of replenishmentWarehouses()) {
    if (scope !== 'all' && wh.id !== scope) continue
    for (const product of warehouseProducts(wh.id)) {
      pairs++
      const win = demandWindow(product.sku, wh.id, cfg.fsnWindowDays, asOf)
      const series = demandSeries(product.sku, wh.id, asOf)
      const movementPct = win.days ? (win.movementDays / win.days) * 100 : 0
      const raw = rawFsnClass(movementPct, series.historyDays, cfg)
      const prior = classMemo(product.sku, wh.id)
      const { memo } = applyHysteresis(prior, raw, movementPct, cfg, nextRunNo)
      if (prior && memo.cls !== prior.cls) reclassified++
      memos[memoKey(product.sku, wh.id)] = memo
    }
  }

  const worklist = replenishmentWorklist(scope, cfg, asOf)
  const run = writeRun(
    {
      ranAt: ranAt ?? new Date().toISOString(),
      asOf,
      scope,
      pairs,
      flagged: worklist.totals.due,
      needsSetup: worklist.totals.needsSetup,
      reclassified,
    },
    memos,
  )

  return {
    runNo: run.runNo,
    ranAt: run.ranAt,
    reclassified,
    due: worklist.totals.due,
    needsSetup: worklist.totals.needsSetup,
    pairs,
  }
}

/**
 * Plant two backdated runs on first load, so hysteresis and dwell are inspectable
 * instead of dead code.
 *
 * Without this the mechanic never fires: `movementPct` is a pure function of a
 * deterministic ledger at a fixed anchor, so run #2 would reproduce run #1 exactly,
 * nothing would ever be pending, and "Pending reclassification (1 of 2)" could
 * never appear. Evaluating the SAME ledger at asOf−14 and asOf−7 gives genuinely
 * different 90-day windows, so a real population of pairs arrives with a committed
 * class that differs from today's raw class — some at dwell 0, some at dwell 1.
 */
export function ensureRunHistory(cfg: ReplenishmentConfig = getReplenishmentConfig()): void {
  if (!import.meta.client) return
  if (hasRunHistory()) return
  for (const back of [14, 7]) {
    const asOf = shiftDays(REPL_ASOF_ISO, -back)
    recalculateReplenishment('all', cfg, asOf, `${asOf}T07:30:00.000Z`)
  }
}
