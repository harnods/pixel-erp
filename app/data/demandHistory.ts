/**
 * Demand history — the per-SKU-per-warehouse daily issue ledger that velocity,
 * days-of-cover and FSN are computed from.
 *
 * WHY THIS MODULE EXISTS. The existing seeds cannot answer "how fast does this
 * SKU sell in this warehouse":
 *   • `salesOrders` has real per-SKU quantities but runs 2026-01-02 → 2026-04-11,
 *     ending 76 days BEFORE the stock world's anchor, and carries no warehouseId.
 *   • `outgoing` has warehouseId and per-SKU lines, but only ~21 of its ~59 orders
 *     are completed — roughly 0.01 units per SKU-warehouse per day. A trailing
 *     30-day window is empty, which would classify every SKU Non-moving and leave
 *     the worklist blank.
 * So this module layers a deterministic model UNDER the real documents, rather
 * than editing those seeds (154 specs depend on them).
 *
 * `salesOrders` is deliberately EXCLUDED, and that is a correctness argument, not
 * a convenience: `OutgoingOrder.salesOrderId` is a real FK to `salesOrders`
 * (guarded by tests/salesno-fk-coherence.spec.ts), so counting both would
 * double-count the same commercial event against the dispatch that fulfils it.
 *
 * HONESTY. Every day is tagged `document` or `modelled`. A `document` day carries
 * the real OUT- number and its real quantity, so the trust drawer cites something
 * a user can open. Modelled days are reported as a count, never dressed up with
 * invented document numbers.
 *
 * DETERMINISM. No Date.now(), no Math.random(), no argument-less new Date().
 * Everything derives from `hashStr` plus ISO date arithmetic, so server and client
 * agree and a refresh never changes a number.
 */
import { outgoingOrders } from './outgoing'
import { orderSkuLines, productBySku, warehouseOrderPool, warehouseProducts } from './inventory'
import { warehouses } from './warehouses'
import { shiftDays } from './master'
import { hashStr } from './cycleCountRecommendations'
import { REPL_ASOF_ISO } from './replenishmentConfig'

/** Days of history kept: 90 for FSN classification + 30 for the longest velocity window. */
export const REPL_HISTORY_DAYS = 120

export type DemandDaySource = 'document' | 'modelled'

export interface DemandDoc {
  /** outgoingOrders.id */
  id: string
  /** real dispatch number, e.g. OUT-2026-0007 */
  number: string
  /** real source reference, e.g. "Sales Order #10123" or "#SO060" */
  salesNo: string
  date: string
  qty: number
}

export interface DemandDay {
  date: string
  qty: number
  source: DemandDaySource
  /** Non-empty only when source === 'document'. */
  docs: DemandDoc[]
}

export interface DemandSeries {
  sku: string
  warehouseId: string
  asOf: string
  /** Oldest → newest, exactly REPL_HISTORY_DAYS entries. */
  days: DemandDay[]
  /** First day this pair could move at all — drives the cold-start test. */
  firstSeen: string
  /** Whole days between firstSeen and asOf. */
  historyDays: number
}

export interface DemandWindow {
  days: number
  units: number
  /** Days with qty > 0 — the FSN numerator. */
  movementDays: number
  perDay: number
  /** Real citations inside this window only. */
  docs: DemandDoc[]
  /** How many days in this window were modelled rather than documented. */
  modelledDays: number
}

// ── Model parameters ─────────────────────────────────────────────────────────

/**
 * Baseline units/day per warehouse, by category. Calibrated against the stock
 * seed, where available qty averages ~11 units (green beans move by the 60 kg
 * sack, machines one at a time) — so these are deliberately small. They also set
 * the FSN spread, because movement probability is derived from the rate:
 * Roasted ~0.9 ⇒ Fast, Green Beans ~0.35 and Accessory ~0.5 ⇒ Slow,
 * hardware ~0.03–0.05 ⇒ Non-moving.
 */
const CATEGORY_RATE: Record<string, number> = {
  'Green Beans': 0.35,
  'Roasted Beans': 0.9,
  'Espresso Machine': 0.03,
  Grinder: 0.05,
  Equipment: 0.04,
  Accessory: 0.5,
}

/** Weekday shape — wholesale coffee does not ship on Sundays. 0 = Sunday. */
const WEEKDAY_FACTOR = [0.15, 1, 1, 1, 1, 1, 0.6]

/**
 * SKUs with deliberately short history, so the cold-start path (US-003) and the
 * "unclassified" FSN state are reachable on a fresh demo instead of theoretical.
 */
export const REPL_COLD_START_SKUS: readonly string[] = ['1106', '2104', '3007']

function dayIso(offsetFromStart: number, asOf: string): string {
  return shiftDays(asOf, -(REPL_HISTORY_DAYS - 1 - offsetFromStart))
}

function weekdayOf(iso: string): number {
  return new Date(`${iso}T00:00:00`).getDay()
}

function daysBetween(fromIso: string, toIso: string): number {
  const ms = new Date(`${toIso}T00:00:00`).getTime() - new Date(`${fromIso}T00:00:00`).getTime()
  return Math.round(ms / 86_400_000)
}

/**
 * `hashStr` is `h = h * 31 + charCode`, which is fine for picking one item out of a
 * short list but clusters badly under a modulus when keys differ only in a trailing
 * index (`…:move:0`, `…:move:1`, …): consecutive keys land in a narrow residue
 * class, so a naive `hashStr(k) % 10000` gated ~4% of days open instead of the ~44%
 * the rate called for. Avalanching the bits first (lowbias32) decorrelates them.
 * Still pure and deterministic — same input, same output, on server and client.
 */
function mix32(h: number): number {
  let x = h >>> 0
  x ^= x >>> 16
  x = Math.imul(x, 0x7feb352d) >>> 0
  x ^= x >>> 15
  x = Math.imul(x, 0x846ca68b) >>> 0
  x ^= x >>> 16
  return x >>> 0
}

/** Deterministic, well-distributed 0..1 from a salted key. */
function unit(key: string): number {
  return mix32(hashStr(key)) / 4_294_967_296
}

/** Deterministic, well-distributed integer in [0, n). */
function pick(key: string, n: number): number {
  return n > 0 ? mix32(hashStr(key)) % n : 0
}

// ── Layer A: real documents ──────────────────────────────────────────────────

/**
 * Real shipped demand, indexed in ONE pass over the outbound orders.
 *
 * Built per-`asOf` and cached, because the naive shape — re-scanning every order
 * for every (SKU, warehouse) pair — is O(pairs × orders × lines) and made a single
 * worklist build take ~90 seconds. One pass is O(orders × lines) total.
 *
 * `outgoingOrders` is reactive and mutable (orders get shipped and cancelled
 * through the WMS flow), so anything that changes it must call
 * `invalidateDemandHistory()` — otherwise the ledger silently goes stale.
 */
const docIndexCache = new Map<string, Map<string, Map<string, DemandDoc[]>>>()

function documentIndex(asOf: string): Map<string, Map<string, DemandDoc[]>> {
  const cached = docIndexCache.get(asOf)
  if (cached) return cached

  const index = new Map<string, Map<string, DemandDoc[]>>()
  const earliest = shiftDays(asOf, -(REPL_HISTORY_DAYS - 1))

  for (const order of outgoingOrders) {
    if (order.status !== 'completed' && order.status !== 'partially shipped') continue
    const date = order.shippedDate
    if (!date || date < earliest || date > asOf) continue

    for (const line of orderSkuLines(order)) {
      // A partially-shipped order must never cite more units than actually left the
      // warehouse, or the trust drawer would overstate the document.
      const shippedForSku = order.shippedBySku?.[line.sku]
      const qty = shippedForSku !== undefined ? Math.min(line.qty, shippedForSku) : line.qty
      if (qty <= 0) continue

      const pairKey = `${line.sku}::${order.warehouseId}`
      const byDate = index.get(pairKey) ?? new Map<string, DemandDoc[]>()
      const list = byDate.get(date) ?? []
      list.push({ id: order.id, number: order.number, salesNo: order.salesNo, date, qty })
      byDate.set(date, list)
      index.set(pairKey, byDate)
    }
  }

  docIndexCache.set(asOf, index)
  return index
}

function documentDays(sku: string, warehouseId: string, asOf: string): Map<string, DemandDoc[]> {
  return documentIndex(asOf).get(`${sku}::${warehouseId}`) ?? new Map()
}

// ── Layer B: the model ───────────────────────────────────────────────────────

interface ModelParams {
  rate: number
  spikes: { start: number; length: number; factor: number }[]
  firstSeenIndex: number
}

function modelParams(sku: string, warehouseId: string): ModelParams {
  const product = productBySku(sku)
  const category = product?.category ?? ''
  const base = CATEGORY_RATE[category] ?? 0.2

  // A warehouse only generates demand for the SKUs its seed orders actually draw
  // from. Everything else it carries is buffer stock — genuinely non-moving, which
  // is why the Non-moving class is populated without fabricating anything.
  //
  // Buffer stock is modelled structurally rather than as a scaled-down rate: a
  // warehouse either occasionally sells a given off-pool SKU or it never does. A
  // uniform small rate would instead give EVERY off-pool pair a fair chance of a
  // sale each month, which reads as noise rather than as dead stock.
  const inPool = warehouseOrderPool(warehouseId).some((p) => p.sku === sku)
  const occasional = unit(`${sku}:${warehouseId}:offpool`) < 0.1
  const poolFactor = inPool ? 1 : occasional ? 0.06 : 0

  const skuMult = 0.6 + unit(`${sku}:rate`) * 1.0
  const whMult = 0.5 + unit(`${warehouseId}:rate`) * 0.9
  const rate = base * skuMult * whMult * poolFactor

  // 2–3 promo windows per pair. These are what make the volatility flag fire for a
  // real minority of pairs rather than everybody or nobody.
  const spikeCount = 2 + pick(`${sku}:${warehouseId}:spikes`, 2)
  const spikes: ModelParams['spikes'] = []
  for (let k = 0; k < spikeCount; k++) {
    spikes.push({
      start: pick(`${sku}:${warehouseId}:spikestart:${k}`, REPL_HISTORY_DAYS),
      length: 2 + pick(`${sku}:${warehouseId}:spikelen:${k}`, 3),
      factor: 3.5 + unit(`${sku}:${warehouseId}:spikefactor:${k}`) * 2.5,
    })
  }

  // Cold-start pairs only start moving a handful of days before "today".
  let firstSeenIndex = 0
  if (REPL_COLD_START_SKUS.includes(sku)) {
    const age = 2 + pick(`${sku}:${warehouseId}:coldstart`, 11) // 2..12 days
    firstSeenIndex = REPL_HISTORY_DAYS - age
  }

  return { rate, spikes, firstSeenIndex }
}

function spikeFactorAt(params: ModelParams, index: number): number {
  for (const s of params.spikes) {
    if (index >= s.start && index < s.start + s.length) return s.factor
  }
  return 1
}

function modelledQty(sku: string, warehouseId: string, index: number, iso: string, params: ModelParams): number {
  if (index < params.firstSeenIndex) return 0

  const weekday = WEEKDAY_FACTOR[weekdayOf(iso)] ?? 1
  const spike = spikeFactorAt(params, index)
  const effectiveRate = params.rate * weekday * spike

  // Movement probability derives from the rate, so slow movers genuinely produce
  // runs of zero days. Without this gate every pair would move every day and FSN
  // would classify all 270 pairs Fast.
  const prob = Math.min(0.95, effectiveRate)
  if (unit(`${sku}:${warehouseId}:move:${index}`) >= prob) return 0

  // Conditional on moving, ship enough to hit the rate on average.
  const perMove = effectiveRate / Math.max(prob, 0.0001)
  const jitter = 0.7 + unit(`${sku}:${warehouseId}:qty:${index}`) * 0.8
  return Math.max(1, Math.round(perMove * jitter))
}

// Layer B is a pure function of frozen constants, so memoizing it is free and
// identical on server and client.
const modelCache = new Map<string, DemandDay[]>()

function modelledSeries(sku: string, warehouseId: string, asOf: string): DemandDay[] {
  const key = `${sku}::${warehouseId}::${asOf}`
  const hit = modelCache.get(key)
  if (hit) return hit

  const params = modelParams(sku, warehouseId)
  const days: DemandDay[] = []
  for (let i = 0; i < REPL_HISTORY_DAYS; i++) {
    const iso = dayIso(i, asOf)
    days.push({ date: iso, qty: modelledQty(sku, warehouseId, i, iso, params), source: 'modelled', docs: [] })
  }
  modelCache.set(key, days)
  return days
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * The full ledger for one SKU-warehouse pair. Real documents WIN a day outright —
 * a modelled quantity is never stacked on top of a real one, so every `document`
 * day in the trust drawer is citable verbatim.
 */
const seriesCache = new Map<string, DemandSeries>()

/** Drop every cache — call after anything mutates the outbound order graph. */
export function invalidateDemandHistory(): void {
  docIndexCache.clear()
  seriesCache.clear()
}

export function demandSeries(sku: string, warehouseId: string, asOf: string = REPL_ASOF_ISO): DemandSeries {
  const cacheKey = `${sku}::${warehouseId}::${asOf}`
  const cached = seriesCache.get(cacheKey)
  if (cached) return cached

  const docs = documentDays(sku, warehouseId, asOf)
  const modelled = modelledSeries(sku, warehouseId, asOf)
  const params = modelParams(sku, warehouseId)

  const days: DemandDay[] = modelled.map((day) => {
    const dayDocs = docs.get(day.date)
    if (dayDocs?.length) {
      return {
        date: day.date,
        qty: dayDocs.reduce((s, d) => s + d.qty, 0),
        source: 'document' as const,
        docs: dayDocs,
      }
    }
    return day
  })

  const firstSeen = dayIso(params.firstSeenIndex, asOf)
  const series: DemandSeries = {
    sku,
    warehouseId,
    asOf,
    days,
    firstSeen,
    historyDays: Math.max(0, daysBetween(firstSeen, asOf) + 1),
  }
  seriesCache.set(cacheKey, series)
  return series
}

/** Aggregate the trailing `days` of the ledger. */
/**
 * Demand over a window with single-day spikes pulled back to a cap (US-002 AC-03).
 *
 * A promo day or a bulk return is a real event, but averaging it in unchanged
 * lets one day set the reorder point for the next two months. The cap is a
 * multiple of the window's MEDIAN moving day — median, not mean, because the mean
 * is exactly what the outlier has already distorted.
 *
 * Damping only ever lowers demand, so it cannot manufacture an order. The SKU is
 * still flagged volatile by the caller; this smooths the number, it does not hide
 * the fact.
 */
export function demandWindowDamped(
  sku: string,
  warehouseId: string,
  days: number,
  capMultiple: number,
  asOf: string = REPL_ASOF_ISO,
): DemandWindow & { dampedDays: number } {
  const series = demandSeries(sku, warehouseId, asOf)
  const span = Math.min(days, series.days.length)
  const slice = series.days.slice(series.days.length - span)

  const moving = slice.filter((d) => d.qty > 0).map((d) => d.qty).sort((a, b) => a - b)
  const median = moving.length ? moving[Math.floor(moving.length / 2)]! : 0
  const cap = median > 0 && capMultiple > 0 ? median * capMultiple : Number.POSITIVE_INFINITY

  let units = 0
  let movementDays = 0
  let modelledDays = 0
  let dampedDays = 0
  const docs: DemandDoc[] = []
  for (const day of slice) {
    const qty = Math.min(day.qty, cap)
    if (qty < day.qty) dampedDays++
    units += qty
    if (day.qty > 0) movementDays++
    if (day.source === 'modelled') modelledDays++
    else docs.push(...day.docs)
  }

  return { days: span, units, movementDays, perDay: span ? units / span : 0, docs, modelledDays, dampedDays }
}

export function demandWindow(
  sku: string,
  warehouseId: string,
  days: number,
  asOf: string = REPL_ASOF_ISO,
): DemandWindow {
  const series = demandSeries(sku, warehouseId, asOf)
  const span = Math.min(days, series.days.length)
  const slice = series.days.slice(series.days.length - span)

  let units = 0
  let movementDays = 0
  let modelledDays = 0
  const docs: DemandDoc[] = []
  for (const day of slice) {
    units += day.qty
    if (day.qty > 0) movementDays++
    if (day.source === 'modelled') modelledDays++
    else docs.push(...day.docs)
  }

  return { days: span, units, movementDays, perDay: span ? units / span : 0, docs, modelledDays }
}

/** Real documents inside a window — what the trust drawer lists, newest first. */
export function realDocsFor(
  sku: string,
  warehouseId: string,
  days: number,
  asOf: string = REPL_ASOF_ISO,
): DemandDoc[] {
  return demandWindow(sku, warehouseId, days, asOf).docs
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

/**
 * Coefficient of variation of daily demand over a window — the volatility signal
 * behind the "Volatile demand" flag (US-002 AC-03).
 */
export function demandCv(
  sku: string,
  warehouseId: string,
  days: number,
  asOf: string = REPL_ASOF_ISO,
): number {
  const series = demandSeries(sku, warehouseId, asOf)
  const span = Math.min(days, series.days.length)
  const slice = series.days.slice(series.days.length - span)
  if (!slice.length) return 0
  const mean = slice.reduce((s, d) => s + d.qty, 0) / slice.length
  if (mean <= 0) return 0
  const variance = slice.reduce((s, d) => s + (d.qty - mean) ** 2, 0) / slice.length
  return Math.sqrt(variance) / mean
}

/** Pairs whose history is shorter than the cold-start threshold. */
export function isColdStart(sku: string, warehouseId: string, minDays: number, asOf: string = REPL_ASOF_ISO): boolean {
  return demandSeries(sku, warehouseId, asOf).historyDays < minDays
}

/** Coverage summary — used by the calibration spec to prove the ledger is usable. */
export function demandHistoryStats(asOf: string = REPL_ASOF_ISO): {
  pairs: number; documentDays: number; modelledDays: number; totalUnits: number
} {
  let pairs = 0
  let documentDays = 0
  let modelledDays = 0
  let totalUnits = 0
  for (const wh of warehouses) {
    if (wh.isDefault || wh.status !== 'active') continue
    for (const p of warehouseProducts(wh.id)) {
      pairs++
      for (const day of demandSeries(p.sku, wh.id, asOf).days) {
        if (day.source === 'document') documentDays++
        else modelledDays++
        totalUnits += day.qty
      }
    }
  }
  return { pairs, documentDays, modelledDays, totalUnits }
}
