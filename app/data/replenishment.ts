/**
 * Replenishment engine — velocity → ATP → suggested qty → FSN → days of cover →
 * worklist row.
 *
 * Pure functions in `app/data/`, in the shape of `cycleCountRecommendations.ts`, so
 * the worklist page, the tab-count badges and the home tile all read ONE source and
 * cannot drift apart. Nothing here mutates stock; the only writer is
 * `recalculateReplenishment()`, and it writes only the run ledger.
 *
 * Formula (PRD US-008 AC-01), fixed — do not substitute an order-up-to variant:
 *   suggested = (leadDays + safetyDays) × avgDailySales − (available + onOrder)
 * floored at 0. `maxLevel`, where set, only CAPS the result; it never becomes the
 * target. `maxLevel − availableToPromise` is a different policy and would break the
 * PRD's worked example and the trust drawer's arithmetic.
 */
import { warehouses } from './warehouses'
import { productBySku, warehouseProducts } from './inventory'
import { getWarehouseDetail } from './warehouseDetails'
import { getWarehouseConfig } from './warehouseConfig'
import { receipts } from './receipts'
import { lineItemsForReceipt } from './receiptLineItems'
import { receivedSummaryForReceipt } from './receivingTasks'
import { shiftDays } from './master'
import {
  REPL_ASOF_ISO, getReplenishmentConfig, normalizeWindowWeights,
  type ReplBoundaryMode, type ReplenishmentConfig,
} from './replenishmentConfig'
import { effectiveSettings, type EffectiveReplenishmentSettings } from './replenishmentSettings'
import { bumpReplenishmentRevision, replenishmentRevision } from './replenishmentStore'
import {
  demandCv, demandSeries, demandWindow, invalidateDemandHistory, type DemandDoc,
} from './demandHistory'
import {
  preferredVendorItem, vendorItemFor, vendorItemsForSku, vendorNameFor, type VendorItem,
} from './vendorItems'
import {
  classMemo, currentRunNo, hasRunHistory, memoKey, writeRun,
  type FsnClass, type FsnClassMemo,
} from './replenishmentRuns'

// ── Velocity (OD-002 / OD-009) ───────────────────────────────────────────────

export type ReplDemandSource = 'computed' | 'manual-sku' | 'manual-category' | 'none'

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
}

/**
 * Recency-weighted average daily sales.
 *
 * Cold start short-circuits BEFORE any computation. That single ordering is what
 * makes "never a fabricated quantity" (US-003 CON-02) enforceable rather than
 * aspirational: there is no code path that returns a computed velocity for a SKU
 * with less than the configured minimum history.
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

  const longest = Math.max(...windows.map((w) => w.days))
  const cv = demandCv(sku, warehouseId, longest, asOf)
  const citations = demandWindow(sku, warehouseId, longest, asOf).docs

  if (coldStart) {
    // No history to compute from — use a manual figure if someone supplied one,
    // otherwise report nothing and let the caller route this to "Needs setup".
    const manual = settings.manualDailyDemand
    const source: ReplDemandSource = manual === null
      ? 'none'
      : settings.manualDailyDemandSource === 'category' ? 'manual-category' : 'manual-sku'
    return {
      avgDailySales: manual ?? 0,
      source,
      historyDays: series.historyDays,
      coldStart: true,
      windows: windowResults,
      cv,
      volatile: false,
      citations,
    }
  }

  // Outlier damping: a promo spike inside a short window would otherwise drag the
  // blended velocity up for weeks. Cap each window at the configured multiple of
  // the longest window's rate and flag the SKU rather than silently smoothing it.
  const baseRate = demandWindow(sku, warehouseId, longest, asOf).perDay
  const volatile = cv > cfg.volatileCvThreshold
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
  suppressReason: 'above-reorder-point' | 'no-demand-basis' | 'not-tracked' | null
  /** Ordered arithmetic steps, for the trust drawer. */
  trace: { label: string; value: string }[]
}

/** The PRD formula, isolated so a spec can table-drive it. */
export function suggestedRawQty(
  leadDays: number,
  safetyDays: number,
  avgDailySales: number,
  available: number,
  onOrder: number,
): number {
  const target = (leadDays + safetyDays) * avgDailySales
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
 * Reorder point = velocity × (lead + safety), unless overridden.
 *
 * Deliberately NOT seeded from `WarehouseStockItem.minStock`. That field averages
 * 96 units against an average available qty of 11, so 264 of the seed's 270 pairs
 * sit below it — using it would put essentially the whole catalogue on the worklist
 * every day and directly contradict US-010's "keep the worklist trustworthy".
 * `minStock` stays exactly as it is for the Products and warehouse screens; this
 * feature simply computes its own trigger, which is also the textbook definition
 * and what TS-001's "accept the system-suggested default" implies.
 *
 * With no velocity there is no demand to protect against, so there is no reorder
 * point and the SKU is not due — which is the correct answer, not a gap.
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
  const leadTimeDays = vendorItem?.leadTimeDays ?? cfg.fallbackLeadTimeDays
  const leadTimeEstimated = !vendorItem

  const rop = resolveReorderPoint(settings, velocity.avgDailySales, leadTimeDays)
  const cover = daysOfCover(atp.available, velocity.avgDailySales, leadTimeDays)

  // ── Suggestion ──
  const hasDemandBasis = velocity.avgDailySales > 0
  const targetQty = (leadTimeDays + settings.safetyDays) * velocity.avgDailySales
  const gapQty = targetQty - (atp.available + atp.onOrder)
  let rawQty = hasDemandBasis
    ? suggestedRawQty(leadTimeDays, settings.safetyDays, velocity.avgDailySales, atp.available, atp.onOrder)
    : 0

  // maxLevel CAPS the order; it is never the target.
  let cappedByMaxLevel = false
  if (settings.maxLevel !== null && rawQty > 0) {
    const room = Math.max(0, settings.maxLevel - (atp.available + atp.onOrder))
    if (rawQty > room) { rawQty = room; cappedByMaxLevel = true }
  }

  const suppressedByCover = hasDemandBasis
    && rop.source !== 'none'
    && isSuppressed(atp.available, atp.onOrder, rop.value, cfg.reorderBoundary)

  const rounded = applyMoqAndPack(suppressedByCover ? 0 : rawQty, vendorItem ?? undefined)

  const suppressReason: SuggestionResult['suppressReason'] =
    !settings.tracked ? 'not-tracked'
    : !hasDemandBasis ? 'no-demand-basis'
    : suppressedByCover ? 'above-reorder-point'
    : null

  const trace: { label: string; value: string }[] = [
    { label: 'Average daily sales', value: `${velocity.avgDailySales.toFixed(2)} ${product?.unit ?? ''}/day` },
    { label: 'Lead time', value: `${leadTimeDays} days` },
    { label: 'Safety days', value: `${settings.safetyDays} days` },
    { label: 'Demand to cover', value: `(${leadTimeDays} + ${settings.safetyDays}) × ${velocity.avgDailySales.toFixed(2)} = ${targetQty.toFixed(1)}` },
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
  const missing: string[] = []
  if (!vendorItem) missing.push('Vendor')
  if (velocity.coldStart && velocity.source === 'none') missing.push('Demand history')
  if (leadTimeEstimated) missing.push('Lead time')

  const dueForReorder = settings.tracked
    && hasDemandBasis
    && rop.source !== 'none'
    && !suppressedByCover

  let bucket: WorklistBucket
  if (!settings.tracked) bucket = 'not-tracked'
  else if (velocity.source === 'none' && velocity.coldStart) bucket = 'needs-setup'
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
