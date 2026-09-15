/**
 * Lead-time derivation from PO → goods-receipt history (PRD US-001, decisions
 * D5 / D5a / D10).
 *
 * Lead time is no longer a field somebody types. It is MEASURED: the average gap
 * between a purchase order's date and the first goods receipt against it, for one
 * vendor and one product. That is the whole point of US-001 — "lead time reflects
 * reality without manual guesswork".
 *
 * ── Why this module exists rather than a join ────────────────────────────────
 * The PRD calls the cross-service join a build spike ("verify SCM
 * stock_transactions.transaction_id ↔ QB transaction id"), and in this prototype
 * that bridge genuinely does not exist:
 *   • `Receipt.purchaseNo` is free text — 'Purchase Order #10500', '#PO60' —
 *     while `purchaseOrders` uses 'PO-2026-NNNN'. The formats never match, so
 *     there is no FK to follow.
 *   • `Receipt.vendor` is a NAME drawn from the legacy `master.VENDORS` tuple,
 *     not a `vendors.ts` id, so a receipt cannot even be attributed to a supplier.
 *   • The two seeds run on different clocks: purchase orders on simClock
 *     (Jan–Aug 2026), receipts on master (TODAY_ISO, 2026-06-26).
 *
 * So this module BUILDS the bridge the spike would confirm, in two layers — the
 * same shape `demandHistory.ts` uses, and for the same reason:
 *
 *   Layer A — real documents. Every completed / partially-received `Receipt` is
 *     paired with a real `PurchaseOrder` whose date falls strictly before the
 *     receipt date (VR-02's own rule doing the matching), taking the vendor id
 *     from the PO — the only place a real supplier id exists — and the SKUs from
 *     `lineItemsForReceipt`. Samples carry real document numbers, so the trust
 *     drawer cites things a user can open.
 *   Layer B — modelled density. ~40 receipts across 12 vendors and 30 SKUs would
 *     leave almost every vendor×product cell below the 2-sample minimum, so every
 *     row would read "estimated" and the ladder would never be visible. Layer B
 *     adds deterministic PO-backed samples per cell. They carry `poNumber: null`
 *     and are reported separately, never dressed up as documents that exist.
 *
 * ── The rules that actually matter (US-001 AC-02 / AC-05 / AC-06) ────────────
 * A receipt counts as a sample ONLY if it traces to a PO ordered strictly before
 * it. Direct purchases with no PO are EXCLUDED — never counted as a 0-day lead
 * time, which would bias the engine to under-order and cause the exact stockouts
 * the feature exists to prevent. They still count as supply for ATP; this module
 * governs measurement, not stock. Only the FIRST receipt against a PO is a
 * sample, so partial and back-ordered deliveries cannot inflate the average. Gaps
 * beyond `leadTimeOutlierCapDays` are dropped so one PO that sat open for months
 * does not drag every future order with it.
 */
import { receipts } from './receipts'
import type { Receipt } from './receipts'
import { purchaseOrders } from './purchaseOrders'
import { lineItemsForReceipt } from './receiptLineItems'
import { vendors } from './vendors'
import { vendorItems } from './vendorItems'
import { productBySku } from './inventory'
import { hashStr } from './cycleCountRecommendations'
import {
  REPL_ASOF_ISO,
  getReplenishmentConfig,
  leadTimeForCategory,
  type ReplenishmentConfig,
} from './replenishmentConfig'

/** Why a receipt that looks like a sample is not one. */
export type LeadTimeExclusion = 'no-po' | 'not-first-receipt' | 'outlier'

/** Which rung of the resolution ladder produced the value (US-001 VR-04). */
export type LeadTimeTier = 'computed' | 'vendor-default' | 'category' | 'global' | 'manual' | 'none'

export interface LeadTimeSample {
  vendorId: string
  sku: string
  warehouseId: string
  /** Real PO number when this came from a document; null for a modelled sample. */
  poNumber: string | null
  orderDate: string
  /** Real receipt number when this came from a document; null for a modelled sample. */
  receiptNumber: string | null
  receiptDate: string
  /** receiptDate − orderDate, in whole days. Always ≥ 1 for an eligible sample. */
  leadDays: number
  /** Set when the sample is NOT counted, with the reason. */
  excluded?: LeadTimeExclusion
}

export interface DerivedLeadTime {
  /** null only when the ladder resolves to nothing — the pair needs setup. */
  days: number | null
  tier: LeadTimeTier
  /** How many eligible samples the average used. 0 for every non-computed tier. */
  sampleSize: number
  /** Receipts skipped because they had no upstream PO (US-001 AC-02, OBS-01). */
  excludedNoPo: number
  /** Eligible samples, newest first — what the trust drawer lists. */
  samples: LeadTimeSample[]
}

/**
 * Date maths, deliberately all-UTC.
 *
 * Parsing `'2026-06-26T00:00:00'` gives LOCAL midnight while `toISOString()`
 * formats in UTC, so in Jakarta (UTC+7) the pair silently returns the PREVIOUS
 * day. Lead time is a difference of dates, so a one-day skew here would shift
 * every derived average. Parse and format on the same basis and the helpers are
 * timezone-independent.
 */
function daysBetween(fromIso: string, toIso: string): number {
  const ms = Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)
  return Math.round(ms / 86_400_000)
}

function shift(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** lowbias32 avalanche — see demandHistory.ts. `hashStr` alone clusters under a
 *  modulus for keys differing only in a trailing index. */
function mix32(h: number): number {
  let x = h >>> 0
  x ^= x >>> 16
  x = Math.imul(x, 0x7feb352d) >>> 0
  x ^= x >>> 15
  x = Math.imul(x, 0x846ca68b) >>> 0
  x ^= x >>> 16
  return x >>> 0
}

function unit(key: string): number {
  return mix32(hashStr(key)) / 4_294_967_296
}

function pick(key: string, n: number): number {
  return n > 0 ? mix32(hashStr(key)) % n : 0
}

/**
 * Vendor×product cells deliberately left with no PO-backed history at all, so the
 * Tier 2/3/4 ladder and the "no lead-time data" Needs-setup route (US-003 AC-02)
 * are reachable on a fresh load instead of being dead code.
 */
const DIRECT_ONLY_SKUS: readonly string[] = ['1006', '2101']

/**
 * A receipt is treated as a direct purchase (no PO) when this fires — roughly one
 * in four. US-001 AC-02 is the single most important rule in this story, so the
 * seed has to produce real examples of it rather than assume they exist.
 */
function isDirectPurchase(receiptId: string): boolean {
  return pick(`ltdirect:${receiptId}`, 4) === 0
}

// ── Layer A — real documents ─────────────────────────────────────────────────

/**
 * Pair a receipt with a real PO ordered strictly before it.
 *
 * The date test IS validation rule VR-02, used here as the matcher: a candidate
 * that fails it is not a weaker match, it is not a sample at all. Receipts with
 * no eligible PO fall through and are reported as direct purchases, which is the
 * honest outcome — a receipt that cannot be traced to an order never becomes a
 * 0-day sample.
 */
function matchPurchaseOrder(receipt: Receipt, receiptDate: string) {
  const eligible = purchaseOrders.filter(
    (po) => po.status !== 'draft' && po.status !== 'voided' && po.status !== 'rejected'
      && daysBetween(po.date, receiptDate) >= 1,
  )
  if (!eligible.length) return null
  return eligible[pick(`ltpo:${receipt.id}`, eligible.length)] ?? null
}

function documentSamples(cfg: ReplenishmentConfig): LeadTimeSample[] {
  const out: LeadTimeSample[] = []
  // One sample per PO: the FIRST receipt against it (AC-05). A later receipt on
  // the same PO is recorded as excluded rather than dropped, so the drawer can
  // show WHY a partial delivery did not move the average.
  const firstSeenForPo = new Map<string, string>()

  for (const r of receipts) {
    const receiptDate = r.receivedDate
    if (!receiptDate) continue
    if (r.status !== 'completed' && r.status !== 'partial reception') continue

    const lines = lineItemsForReceipt(r)
    if (!lines.length) continue

    if (isDirectPurchase(r.id)) {
      // Excluded from measurement, still supply for ATP — recorded so OBS-01 can
      // report "receipts excluded for no PO" truthfully.
      for (const line of lines) {
        out.push({
          vendorId: '', sku: line.sku, warehouseId: r.warehouseId,
          poNumber: null, orderDate: receiptDate, receiptNumber: r.number, receiptDate,
          leadDays: 0, excluded: 'no-po',
        })
      }
      continue
    }

    const po = matchPurchaseOrder(r, receiptDate)
    if (!po) continue

    const previous = firstSeenForPo.get(po.id)
    const isFirst = previous === undefined || receiptDate < previous
    if (isFirst) firstSeenForPo.set(po.id, receiptDate)

    const leadDays = daysBetween(po.date, receiptDate)
    const excluded: LeadTimeExclusion | undefined = !isFirst
      ? 'not-first-receipt'
      : leadDays > cfg.leadTimeOutlierCapDays ? 'outlier' : undefined

    for (const line of lines) {
      out.push({
        vendorId: po.vendor.id, sku: line.sku, warehouseId: r.warehouseId,
        poNumber: po.number, orderDate: po.date,
        receiptNumber: r.number, receiptDate, leadDays,
        ...(excluded ? { excluded } : {}),
      })
    }
  }
  return out
}

// ── Layer B — modelled density ───────────────────────────────────────────────

/**
 * Deterministic PO-backed samples for one vendor×product cell.
 *
 * Centred on the vendor's captured term so a derived value and the term a buyer
 * agreed stay in the same neighbourhood — a computed 40 days against a quoted 14
 * would read as a bug rather than as a finding. Spread is real but bounded.
 */
function modelledSamples(vendorId: string, sku: string, cfg: ReplenishmentConfig): LeadTimeSample[] {
  if (DIRECT_ONLY_SKUS.includes(sku)) return []

  const vi = vendorItems.find((v) => v.vendorId === vendorId && v.sku === sku && v.active)
  if (!vi) return []

  const key = `lt:${vendorId}:${sku}`
  // 0–5 samples. A cell landing on 0 or 1 falls below leadTimeMinSamples and
  // exercises Tier 2 — that is the point, not an accident.
  const count = pick(`${key}:n`, 6)
  if (!count) return []

  const base = vi.leadTimeDays
  const out: LeadTimeSample[] = []
  for (let i = 0; i < count; i++) {
    const jitter = Math.round((unit(`${key}:j:${i}`) - 0.5) * Math.max(2, base * 0.4))
    // One cell in seven carries a PO that sat open for months, so the outlier cap
    // (AC-06) has something real to exclude.
    const isOutlier = pick(`${key}:out:${i}`, 7) === 0
    const leadDays = isOutlier
      ? cfg.leadTimeOutlierCapDays + 10 + pick(`${key}:o:${i}`, 40)
      : Math.max(1, base + jitter)

    const receiptDate = shift(REPL_ASOF_ISO, -(7 + i * 21 + pick(`${key}:d:${i}`, 9)))
    out.push({
      vendorId, sku, warehouseId: '',
      poNumber: null, orderDate: shift(receiptDate, -leadDays),
      receiptNumber: null, receiptDate, leadDays,
      ...(leadDays > cfg.leadTimeOutlierCapDays ? { excluded: 'outlier' as const } : {}),
    })
  }
  return out
}

// ── Index + cache ────────────────────────────────────────────────────────────

let indexCache: Map<string, LeadTimeSample[]> | null = null

const cellKey = (vendorId: string, sku: string) => `${vendorId}::${sku}`

function sampleIndex(): Map<string, LeadTimeSample[]> {
  if (indexCache) return indexCache
  const cfg = getReplenishmentConfig()
  const index = new Map<string, LeadTimeSample[]>()

  const add = (s: LeadTimeSample) => {
    // A no-PO exclusion has no vendor to attribute to (that is precisely what is
    // missing), so it is filed per SKU under an empty vendor and counted, not averaged.
    const key = cellKey(s.vendorId, s.sku)
    const list = index.get(key)
    if (list) list.push(s)
    else index.set(key, [s])
  }

  for (const s of documentSamples(cfg)) add(s)
  for (const vi of vendorItems) {
    if (!vi.active) continue
    for (const s of modelledSamples(vi.vendorId, vi.sku, cfg)) add(s)
  }

  indexCache = index
  return index
}

export function invalidateLeadTimeHistory(): void {
  indexCache = null
}

/** Every sample for a vendor×product cell, eligible and excluded alike. */
export function leadTimeSamplesFor(vendorId: string, sku: string): LeadTimeSample[] {
  return sampleIndex().get(cellKey(vendorId, sku)) ?? []
}

/** Receipts for this SKU skipped because nothing upstream ordered them (AC-02). */
export function noPoReceiptCount(sku: string): number {
  return (sampleIndex().get(cellKey('', sku)) ?? []).length
}

/**
 * The vendor-level default (Tier 2): the average captured term across everything
 * this vendor supplies. "for thin or brand-new product cells of a known vendor" —
 * a vendor that ships in a fortnight generally ships in a fortnight, whatever the
 * product, so this is a far better guess than a category average.
 */
export function vendorDefaultLeadTime(vendorId: string): number | null {
  const items = vendorItems.filter((v) => v.vendorId === vendorId && v.active)
  if (!items.length) return null
  const sum = items.reduce((s, v) => s + v.leadTimeDays, 0)
  return Math.round(sum / items.length)
}

/**
 * Resolve lead time for a vendor×product cell down the PRD's ladder (VR-04):
 *
 *   Tier 1  computed        average of the last N PO-backed receipts, when the
 *                           cell has at least `leadTimeMinSamples` eligible ones
 *   Tier 2  vendor default  the vendor's average captured term
 *   Tier 3  category        the category default from config
 *   Tier 4  global          the single global fallback
 *   none                    → the pair is routed to Needs setup (US-003 AC-02)
 *
 * `manual` never appears here: a hand-entered value overrides the whole ladder
 * and is applied by the caller, which is the only place that knows the warehouse.
 */
export function deriveLeadTime(
  vendorId: string | null,
  sku: string,
  cfg: ReplenishmentConfig = getReplenishmentConfig(),
): DerivedLeadTime {
  const excludedNoPo = noPoReceiptCount(sku)
  const empty = { samples: [] as LeadTimeSample[], sampleSize: 0, excludedNoPo }

  // Tiers 1 and 2 are vendor-specific, so a SKU with no preferred vendor skips
  // them — but it does NOT skip the ladder. Category and global defaults know
  // nothing about vendors, so they still apply. Short-circuiting to 'none' here
  // would push every vendorless SKU into Needs setup and strand it there, when
  // US-022 AC-06 explicitly allows a request to be raised without a bound vendor.
  const eligible = vendorId
    ? leadTimeSamplesFor(vendorId, sku)
        .filter((s) => !s.excluded && s.leadDays >= 1)
        .sort((a, b) => (a.receiptDate < b.receiptDate ? 1 : -1))
        .slice(0, cfg.leadTimeSampleCount)
    : []

  if (vendorId && eligible.length >= cfg.leadTimeMinSamples) {
    const avg = eligible.reduce((s, x) => s + x.leadDays, 0) / eligible.length
    return {
      days: Math.max(0, Math.round(avg)),
      tier: 'computed',
      sampleSize: eligible.length,
      excludedNoPo,
      samples: eligible,
    }
  }

  const vendorDefault = vendorId ? vendorDefaultLeadTime(vendorId) : null
  if (vendorDefault !== null) {
    return { days: vendorDefault, tier: 'vendor-default', ...empty, samples: eligible }
  }

  const category = productBySku(sku)?.category ?? ''
  const categoryDefault = leadTimeForCategory(category, cfg)
  if (categoryDefault !== null) {
    return { days: categoryDefault, tier: 'category', ...empty, samples: eligible }
  }

  if (cfg.fallbackLeadTimeDays > 0) {
    return { days: cfg.fallbackLeadTimeDays, tier: 'global', ...empty, samples: eligible }
  }

  return { days: null, tier: 'none', ...empty, samples: eligible }
}

/** Human label for the tier — the "estimated" tagging US-001 AC-03/AC-04 requires. */
export function leadTimeTierLabel(tier: LeadTimeTier, sampleSize = 0): string {
  switch (tier) {
    case 'computed': return `avg of last ${sampleSize} receipt${sampleSize === 1 ? '' : 's'}`
    case 'vendor-default': return 'estimated (vendor default)'
    case 'category': return 'estimated (category default)'
    case 'global': return 'estimated (global default)'
    case 'manual': return 'set manually'
    default: return 'no lead-time data'
  }
}

/** Anything other than a measured average is "estimated" and must be tagged as such. */
export function isEstimatedTier(tier: LeadTimeTier): boolean {
  return tier !== 'computed' && tier !== 'manual'
}

/** Share of active vendor×product cells resolving at Tier 1 — the OBS-02 metric. */
export function computedLeadTimeCoverage(): { computed: number; total: number; pct: number } {
  const cfg = getReplenishmentConfig()
  const cells = vendorItems.filter((v) => v.active)
  let computed = 0
  for (const v of cells) {
    if (deriveLeadTime(v.vendorId, v.sku, cfg).tier === 'computed') computed++
  }
  const total = cells.length
  return { computed, total, pct: total ? Math.round((computed / total) * 100) : 0 }
}

/** Vendors that supply nothing — guards the settings UI against an empty picker. */
export function vendorsWithItems(): typeof vendors {
  const ids = new Set(vendorItems.filter((v) => v.active).map((v) => v.vendorId))
  return vendors.filter((v) => ids.has(v.id))
}
