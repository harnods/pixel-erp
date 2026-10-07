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
 * There is no units "max level": the order-up-to target is always the coverage
 * horizon, and coverage is a category policy (PRD US-005 AC-06).
 */
import { warehouses } from './warehouses'
import { productBySku, warehouseProducts, orderSkuLines } from './inventory'
import { getProductWarehouseStock } from './productDetails'
import { getWarehouseDetail } from './warehouseDetails'
import { getWarehouseConfig } from './warehouseConfig'
import { receipts } from './receipts'
import { lineItemsForReceipt } from './receiptLineItems'
import { receivedSummaryForReceipt } from './receivingTasks'
import { outgoingOrders } from './outgoing'
import { warehouseTransfers, transferLineItems } from './warehouseTransfers'
import { purchaseOrders } from './purchaseOrders'
import { getPurchaseOrderDocument } from './purchaseOrderLines'
import { shiftDays } from './master'
import {
  REPL_ASOF_ISO, getReplenishmentConfig,
  type ReplBoundaryMode, type ReplenishmentConfig,
} from './replenishmentConfig'
import { effectiveSettings, type EffectiveReplenishmentSettings } from './replenishmentSettings'
import { bumpReplenishmentRevision, replenishmentRevision } from './replenishmentStore'
import {
  demandCv, demandSeries, demandWindow, demandWindowDamped, invalidateDemandHistory,
  type DemandDoc,
} from './demandHistory'
import {
  preferredVendorItem, preferredVendorFor, vendorItemFor, vendorItemsForSku, vendorNameFor, type VendorItem,
  inactivePreferredVendorFor,
} from './vendorItems'
import {
  currentRunNo, hasRunHistory, writeRun,
  type FsnClass,
} from './replenishmentRuns'
import {
  deriveLeadTime, invalidateLeadTimeHistory, isEstimatedTier, leadTimeTierLabel,
  type DerivedLeadTime, type LeadTimeTier,
} from './leadTimeHistory'

// ── Velocity (OD-002 / OD-009) ───────────────────────────────────────────────

/**
 * Which demand case fired (US-002).
 *
 *   computed — averaged from real sales (whether mature or provisional).
 *   none     — no sales yet ⇒ demand 0 ⇒ the SKU drops out of the worklist.
 *
 * Demand is ALWAYS computed from sales history (D18): there is no category seed
 * and no manual demand entry. A SKU with no sales has demand 0 and simply never
 * appears on "To order"; its first sale is used immediately (as a provisional
 * launch figure). Needs-setup is now only about a missing LEAD TIME, never demand.
 */
export type ReplDemandSource = 'computed' | 'none'

export interface VelocityResult {
  avgDailySales: number
  source: ReplDemandSource
  historyDays: number
  /**
   * Within the launch window (≤ cold-start days since first sale, and has sales).
   * The figure is real but early, so coverage is capped to 0 downstream and the
   * recommendation is flagged "provisional" (D18 / §2.7).
   */
  provisional: boolean
  cv: number
  volatile: boolean
  citations: DemandDoc[]
  /** Window actually averaged over — days since first sale, capped at the lookback (US-002 AC-01/05). */
  lookbackDays: number
  /** Units summed over that window, after damping. */
  lookbackUnits: number
  /** Days whose qty was pulled back to the outlier cap (US-002 AC-03). */
  dampedDays: number
  /** How many days in the window were modelled rather than backed by a real doc. */
  modelledDays: number
  /** Plain-language account of which case fired — shown in the trust drawer. */
  reason: string
}

/**
 * Average daily sales (D18 / D19).
 *
 * One rule: a flat average, `total sold ÷ days-since-first-sale` capped at the
 * lookback window (default 60). Anchoring the denominator on the first SALE — not
 * the fixed window and not the product's created date — means a brand-new fast
 * mover reads at its real early rate instead of being diluted toward zero, while
 * a never-sold or dead-stock SKU reads 0 and drops off the worklist on its own.
 *
 * No cold-start short-circuit, no category seed, no manual demand: a SKU with no
 * sales returns demand 0 (source 'none'); a SKU still inside its launch window
 * returns a real but `provisional` figure that the caller sizes with coverage 0.
 */
export function velocityFor(
  sku: string,
  warehouseId: string,
  cfg: ReplenishmentConfig = getReplenishmentConfig(),
  asOf: string = REPL_ASOF_ISO,
): VelocityResult {
  const series = demandSeries(sku, warehouseId, asOf)
  const settings = effectiveSettings(sku, warehouseId, cfg)
  const lookbackDays = settings.lookbackDays

  // Citations and volatility read the window the number is built from, so the
  // trust drawer never cites documents outside the averaged period.
  // Volatility is measured from the first sale onward (same span as the average):
  // the empty pre-launch days are not demand, and counting them as zeros inflated
  // the CV of every launch SKU into a false "Volatile demand" flag.
  const cv = demandCv(sku, warehouseId, Math.min(lookbackDays, series.historyDays), asOf)
  const citations = demandWindow(sku, warehouseId, lookbackDays, asOf).docs

  // Flat average with single-day spikes damped first, so one promo cannot set the
  // reorder point for months.
  const win = demandWindowDamped(sku, warehouseId, lookbackDays, cfg.demandOutlierCapMultiple, asOf)
  // Denominator = days since the SKU's FIRST SALE, capped at the lookback (D18).
  // `series.historyDays` is days since first sale; capping keeps a mature SKU on
  // the window and a brand-new fast mover on its true early rate. `win.units`
  // already sums only real days, so this is purely the correct divisor.
  const daysSinceFirstSale = series.historyDays
  const availableDays = Math.min(win.days, daysSinceFirstSale)
  const perDay = availableDays > 0 ? win.units / availableDays : 0
  const hasSales = win.units > 0

  // Provisional launch window (§2.7): has sales, but still within the first N days
  // since first sale. The figure is real but early — coverage is capped to 0 by
  // the caller and the recommendation is flagged "provisional".
  const provisional = hasSales && daysSinceFirstSale <= cfg.coldStartMinDays

  return {
    avgDailySales: perDay,
    source: perDay > 0 ? 'computed' : 'none',
    historyDays: series.historyDays,
    provisional,
    cv,
    volatile: perDay > 0 && cv > cfg.volatileCvThreshold,
    citations,
    lookbackDays: availableDays,
    lookbackUnits: win.units,
    dampedDays: win.dampedDays,
    modelledDays: win.modelledDays,
    reason: perDay <= 0
      ? 'No sales yet. Excluded until its first sale'
      : provisional
        ? `Provisional — ${win.units} sold over ${availableDays} days since first sale`
        : `Averaged ${win.units} sold over ${availableDays} days of sales`,
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
  /**
   * Who owns this In-Transit quantity (US-028/029, D25): `wms_inbound` once a PO has
   * been pushed to WMS Inbound / goods receipt (a Receipt exists), else
   * `purchase_order` for an approved PO still only on order. Each incoming qty is
   * owned by exactly one — counted once, never both (US-029 handover).
   */
  owner: 'purchase_order' | 'wms_inbound'
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
 * PO statuses that count as on order (PRD US-004 VR-02: Approved / Sent /
 * Partially received). Draft, rejected and voided never count; a fully received
 * ("awaiting invoice") or closed PO has nothing outstanding.
 */
const OPEN_PO_STATUSES = new Set(['approved', 'open', 'partially-processed'])

/** Sales-side dispatches not yet fully shipped — the open-SO commitment (US-003 VR-01). */
const OPEN_OUTBOUND_STATUSES = new Set(['pending', 'in progress', 'partially shipped'])

/**
 * Transfers committed to leave the origin but not yet shipped. An "in transit"
 * transfer has already left on-hand, so reserving it again would double-count;
 * a draft is not a commitment yet.
 */
const OPEN_TRANSFER_STATUSES = new Set(['approved'])

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
const stockIndexCache = new Map<string, Map<string, { onHand: number }>>()
const reservedIndexCache = new Map<string, Map<string, number>>()
const onOrderIndexCache = new Map<string, Map<string, AtpOnOrderDoc[]>>()

function stockIndex(warehouseId: string) {
  const hit = stockIndexCache.get(warehouseId)
  if (hit) return hit
  const map = new Map<string, { onHand: number }>()
  for (const s of getWarehouseDetail(warehouseId)?.stock ?? []) map.set(s.sku, { onHand: s.onHand })
  stockIndexCache.set(warehouseId, map)
  return map
}

/**
 * Reserved = open sales-order commitments + open outbound transfers, per SKU per
 * warehouse (PRD US-003: "on-hand − reserved (open SO and open outbound
 * transfer)"). Not the WMS batch reservations: those are picking holds, and the
 * PRD nets COMMITTED demand so the recommendation reflects what is truly free.
 * A partially shipped order reserves only its unshipped remainder.
 */
function reservedIndex(warehouseId: string) {
  const hit = reservedIndexCache.get(warehouseId)
  if (hit) return hit
  const map = new Map<string, number>()
  const add = (sku: string, qty: number) => { if (qty > 0) map.set(sku, (map.get(sku) ?? 0) + qty) }

  for (const o of outgoingOrders) {
    if (o.warehouseId !== warehouseId || !OPEN_OUTBOUND_STATUSES.has(o.status)) continue
    for (const line of orderSkuLines(o)) add(line.sku, line.qty - (o.shippedBySku?.[line.sku] ?? 0))
  }
  for (const t of warehouseTransfers) {
    if (t.originId !== warehouseId || !OPEN_TRANSFER_STATUSES.has(t.status)) continue
    for (const line of transferLineItems(t)) add(line.sku, line.qty)
  }
  reservedIndexCache.set(warehouseId, map)
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
        // A receipt means the PO was pushed to WMS Inbound (or received directly),
        // so this incoming qty is owned by WMS Inbound (US-029 handover).
        owner: 'wms_inbound',
      })
      map.set(line.sku, list)
    }
  }

  // ── PO-owned In-Transit (US-028 / D25): an approved PO with no WMS inbound ──
  // An approved PO books In-Transit (Incoming) directly, owner = purchase_order
  // (US-028). Once it is pushed to WMS Inbound a Receipt exists and that same
  // incoming qty is owned by wms_inbound and counted through the receipt above —
  // ownership HANDS OVER, counted once, never both (US-029 dedup / EH-01). Only POs
  // with real coffee lines and a warehouse (created in the app, e.g. converted from
  // a replenishment request) can be netted; the seed POs carry no SKU lines.
  const wmsLinkedPoNumbers = new Set(receipts.map((r) => r.purchaseNo))
  for (const po of purchaseOrders) {
    if (!OPEN_PO_STATUSES.has(po.status)) continue
    if (wmsLinkedPoNumbers.has(po.number)) continue
    const doc = getPurchaseOrderDocument(po.id)
    if (!doc || doc.warehouseId !== warehouseId) continue
    for (const line of doc.lineItems) {
      if (!line.sku || line.qty <= 0) continue
      const list = map.get(line.sku) ?? []
      list.push({
        receiptId: po.id,
        number: po.number,
        purchaseNo: po.number,
        eta: doc.shipDate,
        outstanding: line.qty,
        vendorName: po.vendor.name,
        // An approved PO with no receipt yet is In-Transit owned by the PO itself
        // (US-028) — it has not been handed over to WMS Inbound.
        owner: 'purchase_order',
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
  reservedIndexCache.clear()
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
  const onHand = stockIndex(warehouseId).get(sku)?.onHand ?? 0
  const reserved = reservedIndex(warehouseId).get(sku) ?? 0
  // May go negative — that is the "oversold" case, and the suggested qty then
  // has to cover the deficit too (US-003 AC-03).
  const available = onHand - reserved
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
  /**
   * PO / receipt numbers that already cover the whole shortfall (US-004 AC-03):
   * the SKU is due by available stock, but in-transit brings it to the target, so
   * the suggested qty is 0. Empty when the row still needs ordering.
   */
  coveredBy: string[]
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
 */
export function suggestedRawQty(
  leadDays: number,
  safetyDays: number,
  coverageDays: number,
  avgDailySales: number,
  available: number,
  onOrder: number,
): number {
  const target = (leadDays + safetyDays + coverageDays) * avgDailySales
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
 * Whether a SKU is covered and should NOT appear (US-007, US-005 AC-06).
 * Named by what the setting promises, matching its label in Settings:
 *  - `inclusive` = "Reorder at or below the reorder point" — sitting exactly AT the
 *    point is due, so only a position strictly above it is covered.
 *  - `exclusive` = "Reorder only below the reorder point" — sitting AT the point
 *    is covered; only strictly below is due.
 * Defined once, read by both the engine and the badges.
 *
 * The trigger compares AVAILABLE stock only (US-013 VR-01, US-004 AC-03): in-transit
 * is netted in the suggested QUANTITY, never in the trigger — so a SKU whose
 * shortfall an open PO already covers still shows, with a suggested qty of 0 and a
 * "Covered by PO #" note, instead of silently vanishing.
 */
export function isSuppressed(
  available: number,
  reorderPoint: number,
  mode: ReplBoundaryMode,
): boolean {
  return mode === 'inclusive' ? available > reorderPoint : available >= reorderPoint
}

// ── Reorder point ────────────────────────────────────────────────────────────

export interface ReorderPointResult {
  value: number
  source: 'sku-warehouse' | 'sku' | 'calculated' | 'none'
  /** The manual min was above the computed Max and was capped to it (D13). */
  clampedToMax?: boolean
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
  computedMax?: number,
): ReorderPointResult {
  if (settings.reorderPointOverride !== null) {
    // D13 — a manual min is the TRIGGER, but it is clamped to the computed Max
    // (order-up-to level): a reorder point above the level we would ever stock up
    // to is self-contradictory, so effective trigger = min(manual min, computed Max).
    // The unclamped computed reorder point is still kept beside it as a note (D17).
    const canClamp = computedMax != null && computedMax > 0
    const clampedToMax = canClamp && settings.reorderPointOverride > computedMax!
    return {
      value: clampedToMax ? computedMax! : settings.reorderPointOverride,
      source: settings.reorderPointSource === 'sku-warehouse' ? 'sku-warehouse' : 'sku',
      clampedToMax,
    }
  }
  // No demand (neither measured nor a cold-start seed) ⇒ no reorder point (D17).
  // The SKU is routed to Needs setup upstream; nothing is invented here.
  if (velocity <= 0) return { value: 0, source: 'none' }
  return { value: Math.ceil(velocity * (leadDays + settings.safetyDays)), source: 'calculated' }
}

// ── FSN classification (OD-006) ──────────────────────────────────────────────

export interface FsnResult {
  raw: FsnClass
  /** Kept for callers: the class in force. FSN is recomputed each run, so this
   *  equals `raw` — there is no cross-run smoothing. */
  committed: FsnClass
  movementPct: number
  movementDays: number
  periods: number
  tracked: boolean
}

export function rawFsnClass(movementPct: number, historyDays: number, cfg: ReplenishmentConfig): FsnClass {
  // Too new to classify is NOT the same as not moving. Same threshold as cold
  // start, so a SKU is never simultaneously "too new to estimate demand" and
  // "confidently Fast".
  if (historyDays < cfg.coldStartMinDays) return 'unclassified'
  if (movementPct >= cfg.fsnFastPct) return 'fast'
  if (movementPct >= cfg.fsnSlowPct) return 'slow'
  return 'non-moving'
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
  const settings = effectiveSettings(sku, warehouseId, cfg)

  return {
    raw,
    committed: raw,
    movementPct,
    movementDays: win.movementDays,
    periods: win.days,
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
 * `resupplyDays` is lead time + safety days — the PRD's "will stock out before
 * resupply" test (§2.2 #7: cover < lead time + safety days).
 *
 * Velocity 0 returns null — never Infinity, never a fabricated large number.
 */
export function daysOfCover(available: number, avgDailySales: number, resupplyDays: number): CoverResult {
  if (avgDailySales <= 0) return { coverDays: null, belowLeadTime: false }
  const coverDays = available / avgDailySales
  return { coverDays, belowLeadTime: coverDays < resupplyDays }
}

// ── Worklist row ─────────────────────────────────────────────────────────────

export type WorklistBucket = 'reorder' | 'needs-setup' | 'no-vendor' | 'covered' | 'covered-inbound' | 'not-tracked'

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
  /**
   * The typed manual min was above the computed Max (order-up-to) and the trigger
   * was capped to it (D13 — effective trigger = min(manual min, computed Max)).
   */
  reorderPointClampedToMax: boolean
  /**
   * What the engine WOULD set, even when a manual override is the trigger (D17 —
   * the computed value is kept as a note beside the override). Null without demand.
   */
  calculatedReorderPoint: number | null
  safetyDays: number
  safetyDaysSource: EffectiveReplenishmentSettings['safetyDaysSource']
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
  /**
   * The previously preferred vendor, now inactive (US-001 EH-01). Lead time has
   * fallen back to the next listed vendor; the user should pick a new preferred one.
   */
  inactivePreferredVendor: { id: string; name: string } | null
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
    /** Within the launch window — demand is real but early, coverage forced to 0 (§2.7). */
    provisional: boolean
    /**
     * Triggered (available ≤ reorder point) but in-transit already brings it to the
     * order-up-to target, so suggested qty floored to 0 — an existing PO covers it
     * (§2.7 / D24). Excluded from the "To order" count.
     */
    coveredByInbound: boolean
    /**
     * Covered, yet it will still stock out before resupply: the stockout wins over the
     * calm "covered" label and the user is prompted to verify the inbound arrival.
     */
    verifyInbound: boolean
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

  // Preferred vendor is resolved per warehouse (D23): this warehouse's explicit pick,
  // else the SKU-level default.
  const vendorItem = preferredVendorFor(sku, warehouseId) ?? null
  const alternates = vendorItemsForSku(sku).filter((v) => v.vendorId !== vendorItem?.vendorId)

  // Lead time is MEASURED from this vendor+product's PO→receipt history, then falls
  // down the ladder (US-001 VR-04). It cannot be typed over (US-001 AC-09): a thin cell
  // takes the category default, then the "Other categories" floor, then Needs setup.
  const derivedLead = deriveLeadTime(vendorItem?.vendorId ?? null, sku, cfg, warehouseId)
  // `?? 0` only matters when the ladder resolves to none (the floor is "Not set"):
  // the row is then routed to Needs setup and no quantity is produced, so the 0 is
  // never used to compute an order — it just keeps the display arithmetic finite.
  const leadTimeDays = derivedLead.days ?? cfg.fallbackLeadTimeDays ?? 0
  const leadTimeTier: LeadTimeTier = derivedLead.tier
  const leadTimeEstimated = isEstimatedTier(leadTimeTier)
  // Nothing resolved on the ladder means nothing to measure against at all.
  const leadTimeMissing = derivedLead.tier === 'none'

  // Provisional launch window (§2.7 / US-008 AC-06): force coverage to 0 so the
  // order-up-to level collapses to the reorder point — a launch spike tops up to
  // the trigger, never to a full coverage horizon.
  const coverageDays = velocity.provisional ? 0 : settings.coverageDays
  // The order-up-to level (Max): the demand that lead + safety + coverage days
  // represents. Resolved before the reorder point so a manual min can be clamped
  // to it (D13 — effective trigger = min(manual min, computed Max)).
  const targetQty = (leadTimeDays + settings.safetyDays + coverageDays) * velocity.avgDailySales
  const computedMax = Math.round(targetQty)

  const rop = resolveReorderPoint(settings, velocity.avgDailySales, leadTimeDays, computedMax)
  const cover = daysOfCover(atp.available, velocity.avgDailySales, leadTimeDays + settings.safetyDays)

  // ── Suggestion ──
  const hasDemandBasis = velocity.avgDailySales > 0
  // Both inputs must resolve before any number is produced. US-003 CON-02 is a
  // constraint on the ENGINE, not on the page: a row missing either one must
  // reach the UI with a zero quantity, so no rendering mistake can ever surface
  // a fabricated figure.
  const canRecommend = hasDemandBasis && !leadTimeMissing
  const gapQty = targetQty - (atp.available + atp.onOrder)
  const rawQty = canRecommend
    ? suggestedRawQty(
        leadTimeDays, settings.safetyDays, coverageDays,
        velocity.avgDailySales, atp.available, atp.onOrder,
      )
    : 0

  const suppressedByCover = canRecommend
    && rop.source !== 'none'
    && isSuppressed(atp.available, rop.value, cfg.reorderBoundary)

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
      value: velocity.lookbackDays > 0 && velocity.lookbackUnits > 0
        ? `${velocity.lookbackUnits} ${product?.unit ?? ''} ÷ ${velocity.lookbackDays} days = ${velocity.avgDailySales.toFixed(2)}/day`
        : `${velocity.avgDailySales.toFixed(2)} ${product?.unit ?? ''}/day`,
    },
    { label: 'Lead time', value: `${leadTimeDays} days (${leadTimeTierLabel(leadTimeTier, derivedLead.sampleSize)})` },
    { label: 'Safety days', value: `${settings.safetyDays} days` },
    { label: 'Coverage days', value: `${coverageDays} days` },
    {
      label: 'Order up to',
      value: `(${leadTimeDays} + ${settings.safetyDays} + ${coverageDays}) × ${velocity.avgDailySales.toFixed(2)} = ${targetQty.toFixed(1)}`,
    },
    { label: 'Available', value: `${atp.available}` },
    { label: 'On order', value: `${atp.onOrder}` },
    { label: 'Shortfall', value: `${targetQty.toFixed(1)} − (${atp.available} + ${atp.onOrder}) = ${gapQty.toFixed(1)}` },
    { label: 'Rounded up', value: `${rawQty} ${product?.unit ?? ''}` },
  ]
  // MOQ and the purchase multiplier are applied when the PR becomes a PO, not here,
  // so the trace ends at the need — it never shows an "order quantity".

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
    coveredBy: canRecommend && !suppressedByCover && rawQty === 0 && atp.onOrder > 0
      ? [...new Set(atp.onOrderDocs.map((d) => d.purchaseNo || d.number))]
      : [],
    suppressed: suppressReason !== null,
    suppressReason,
    trace,
  }

  // ── Bucketing ──
  // Demand never sends a row to Needs setup any more (D18): 0 sales → demand 0 →
  // the row simply is not due and drops off "To order". Needs setup is only about
  // a missing LEAD TIME (no PO→GR history), which a buyer must resolve by hand.
  const missing: string[] = []
  if (!vendorItem) missing.push('Vendor')
  if (leadTimeMissing) missing.push('Lead time')

  // Triggered = below the reorder point on available stock (§2.7 STEP 2, no
  // in-transit in the trigger). "Due" is the subset that still needs a PR.
  const triggered = settings.tracked
    && canRecommend
    && rop.source !== 'none'
    && !suppressedByCover

  // Covered by inbound (§2.7 / D24): triggered, but in-transit already fills to the
  // order-up-to target so the suggested qty floors to 0 — an existing PO covers it, no
  // new PR needed. It leaves the "To order" COUNT either way (due = triggered AND
  // suggested qty > 0). Stockout-wins guard: if the row will still stock out before
  // resupply it stays in this state but the stockout takes precedence over the calm
  // "covered" label — `verifyInbound` prompts the user to check the inbound arrival.
  const coveredByInbound = triggered && rawQty === 0 && atp.onOrder > 0
  const verifyInbound = coveredByInbound && cover.belowLeadTime
  // Covered-by-inbound is NOT due — it drops off the due count (US-013 due-count semantics).
  const dueForReorder = triggered && !coveredByInbound

  let bucket: WorklistBucket
  if (!settings.tracked) bucket = 'not-tracked'
  // Only a missing lead time routes here now. An ESTIMATED lead time is not a gap
  // — it resolved, it is simply tagged — so it must not land in Needs setup.
  else if (leadTimeMissing) bucket = 'needs-setup'
  // Covered by inbound leaves "To order" and its count (stockout-wins already
  // excluded from `coveredByInbound`).
  else if (coveredByInbound) bucket = 'covered-inbound'
  else if (dueForReorder && !vendorItem) bucket = 'no-vendor'
  else if (dueForReorder) bucket = 'reorder'
  else bucket = 'covered'

  // A muted SKU still has to fire a stockout alert (US-014): muting removes routine
  // worklist noise, never a genuine risk.
  const mutedButActive = !settings.tracked
    && hasDemandBasis
    && rop.source !== 'none'
    && !isSuppressed(atp.available, rop.value, cfg.reorderBoundary)

  const coverGap = rop.value > 0
    ? Math.min(1, Math.max(0, (rop.value - (atp.available + atp.onOrder)) / rop.value))
    : 0
  const urgency = 3 * (cover.belowLeadTime ? 1 : 0)
    + 2 * (atp.oversold ? 1 : 0)
    + FSN_WEIGHT[fsn.committed]
    + coverGap

  return {
    key: `${sku}::${warehouseId}`,
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
    reorderPointClampedToMax: rop.clampedToMax ?? false,
    calculatedReorderPoint: velocity.avgDailySales > 0
      ? Math.ceil(velocity.avgDailySales * (leadTimeDays + settings.safetyDays))
      : null,
    safetyDays: settings.safetyDays,
    safetyDaysSource: settings.safetyDaysSource,
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
    inactivePreferredVendor: (() => {
      const gone = inactivePreferredVendorFor(sku, warehouseId)
      return gone ? { id: gone.vendorId, name: vendorNameFor(gone.vendorId) } : null
    })(),
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
      provisional: velocity.provisional,
      coveredByInbound,
      verifyInbound,
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
  /** Triggered but an existing PO already fills them to target — excluded from "To
   *  order" and its count (§2.7 / D24). */
  coveredByInbound: WorklistRow[]
  totals: {
    pairs: number
    /** Distinct SKUs stocked in scope — the "of N" behind the To order card (US-013). */
    skus: number
    due: number
    oversold: number
    belowLeadTime: number
    needsSetup: number
    noVendor: number
    overstock: number
    coveredByInbound: number
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
  // SKU-level default, used only for the no-warehouse fallback below.
  const skuVendorItem = preferredVendorItem(sku) ?? null

  let best: MinStockRecommendation | null = null
  let count = 0

  for (const wh of replenishmentWarehouses()) {
    if (!warehouseProducts(wh.id).some((p) => p.sku === sku)) continue
    count++

    // Preferred vendor can differ per warehouse (D23), so resolve it in the loop.
    const vendorItem = preferredVendorFor(sku, wh.id) ?? null
    // Lead time is measured per warehouse (VR-01), so it is derived inside the loop.
    const derived = deriveLeadTime(vendorItem?.vendorId ?? null, sku, cfg, wh.id)
    const settings = effectiveSettings(sku, wh.id, cfg)
    const velocity = velocityFor(sku, wh.id, cfg, asOf)
    const safetyDays = safetyDaysOverride ?? settings.safetyDays
    const leadTimeDays = derived.days ?? cfg.fallbackLeadTimeDays ?? 0
    const tier: LeadTimeTier = derived.tier

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
  // No warehouse to attribute to here, so lead time is the network-aggregate.
  const derivedAgg = deriveLeadTime(skuVendorItem?.vendorId ?? null, sku, cfg)
  return {
    value: null,
    avgDailySales: 0,
    leadTimeDays: derivedAgg.days ?? cfg.fallbackLeadTimeDays ?? 0,
    leadTimeTier: derivedAgg.tier,
    leadTimeEstimated: isEstimatedTier(derivedAgg.tier),
    leadTimeSampleSize: derivedAgg.sampleSize,
    preferredVendorId: skuVendorItem?.vendorId ?? null,
    preferredVendorName: skuVendorItem ? vendorNameFor(skuVendorItem.vendorId) : '',
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
  const coveredByInbound: WorklistRow[] = []
  let pairs = 0
  const skuSet = new Set<string>()
  let oversold = 0
  let belowLeadTime = 0
  let overstock = 0
  let noVendor = 0

  for (const wh of replenishmentWarehouses()) {
    if (scope !== 'all' && wh.id !== scope) continue
    for (const product of warehouseProducts(wh.id)) {
      const row = buildRow(product.sku, wh.id, cfg, asOf)
      pairs++
      skuSet.add(product.sku)
      if (row.atp.oversold) oversold++
      // Overstocked = already at or above the order-up-to target (US-007).
      if (row.suggestion.targetQty > 0 && row.atp.available >= row.suggestion.targetQty) overstock++
      if (row.flags.mutedButActive) mutedButActive.push(row)

      switch (row.bucket) {
        // The "Stocks out before resupply" card counts every row that will stock out
        // before resupply — due rows and covered-by-inbound ones alike — so it matches
        // the Signals filter on the same table.
        case 'reorder': rows.push(row); if (row.flags.belowLeadTime) belowLeadTime++; break
        case 'no-vendor': rows.push(row); noVendor++; if (row.flags.belowLeadTime) belowLeadTime++; break
        case 'needs-setup': needsSetup.push(row); break
        case 'not-tracked': notTracked.push(row); break
        // A covered row that still stocks out is a stockout all the same (§2.7 stockout-wins).
        case 'covered-inbound': coveredByInbound.push(row); if (row.flags.belowLeadTime) belowLeadTime++; break
        default: break
      }
    }
  }

  const byUrgency = (a: WorklistRow, b: WorklistRow) => b.urgency - a.urgency
  rows.sort(byUrgency)
  needsSetup.sort((a, b) => b.missing.length - a.missing.length || a.atp.available - b.atp.available)
  notTracked.sort((a, b) => a.productName.localeCompare(b.productName))
  coveredByInbound.sort((a, b) => a.atp.available - b.atp.available)

  return {
    asOf,
    scope,
    rows,
    needsSetup,
    notTracked,
    mutedButActive,
    coveredByInbound,
    totals: {
      pairs,
      skus: skuSet.size,
      due: rows.length,
      oversold,
      belowLeadTime,
      needsSetup: needsSetup.length,
      noVendor,
      overstock,
      coveredByInbound: coveredByInbound.length,
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

/**
 * The Needs setup tab count: missing lead time PLUS muted products (US-010 AC-02 —
 * muted SKUs move into the Needs setup worklist, where tracking is turned back on).
 */
export function replenishmentSetupCount(warehouseId?: string): number {
  const wl = replenishmentWorklist(warehouseId ?? 'all')
  return wl.totals.needsSetup + wl.notTracked.length
}

// ── Recalculation (the "cycle") ──────────────────────────────────────────────

export interface RecalculateResult {
  runNo: number
  ranAt: string
  due: number
  needsSetup: number
  pairs: number
}

/**
 * One recalculation = one cycle. Recomputes the worklist and records the run so the
 * worklist can show an "as of / last recalculated" line.
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
  let pairs = 0
  for (const wh of replenishmentWarehouses()) {
    if (scope !== 'all' && wh.id !== scope) continue
    pairs += warehouseProducts(wh.id).length
  }

  const worklist = replenishmentWorklist(scope, cfg, asOf)
  const run = writeRun({
    ranAt: ranAt ?? new Date().toISOString(),
    asOf,
    scope,
    pairs,
    flagged: worklist.totals.due,
    needsSetup: worklist.totals.needsSetup,
  })

  return {
    runNo: run.runNo,
    ranAt: run.ranAt,
    due: worklist.totals.due,
    needsSetup: worklist.totals.needsSetup,
    pairs,
  }
}

/** Seed a single run on first load so the worklist has an "as of" stamp to show. */
export function ensureRunHistory(cfg: ReplenishmentConfig = getReplenishmentConfig()): void {
  if (!import.meta.client) return
  if (hasRunHistory()) return
  recalculateReplenishment('all', cfg, REPL_ASOF_ISO, `${REPL_ASOF_ISO}T07:30:00.000Z`)
}
