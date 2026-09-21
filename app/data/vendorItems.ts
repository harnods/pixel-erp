/**
 * Vendor↔item link — who we buy each SKU from, and on what terms.
 *
 * This is the data the recommendation is MADE OF and which the product did not
 * capture before (PRD decision D5): lead time, MOQ, pack size and the
 * stock↔purchase UoM conversion all hang off a (vendor, SKU) pair, not off the
 * product.
 *
 * Why a link table and not fields on the product master:
 *   • OD-007 requires ALTERNATE vendors with their own lead times. A single
 *     `leadTimeDays` on `Product` can hold exactly one, so the feature would be
 *     impossible to build on that shape.
 *   • `inventory.ts` PRODUCTS is `readonly` and derived from a `readonly` CATALOG,
 *     read by six domains. Purchasing terms do not belong in the stock module.
 *   • It matches the existing convention — `SalesInvoiceLineItem` is documented as
 *     FKs only, with name/unit/price joined from the master at read time.
 *
 * Seed is deterministic (hashStr, never Math.random) and regenerated every load;
 * only user edits persist, as a keyed overlay merged on top.
 */
import { reactive } from 'vue'
import { CATALOG } from './catalog'
import { productBySku } from './inventory'
import { vendors } from './vendors'
import { hashStr } from './cycleCountRecommendations'
import { factorFor, largestUnitFor } from './productUnits'

const OVERLAY_KEY = 'erp-db:vendor-items-overlay-v1'

export interface VendorItem {
  /** `vi-${vendorId}-${sku}` */
  id: string
  /** FK → Vendor.id (vendors.ts) */
  vendorId: string
  /** FK → Product.sku (catalog) */
  sku: string
  /** At most one true per SKU — maintained by setPreferredVendor(). */
  isPreferred: boolean
  leadTimeDays: number
  /** Unit we BUY in, e.g. Pallet / Carton / Unit. May differ from the stock unit. */
  purchaseUnit: string
  /** Stocking units per 1 purchase unit (1 Pallet = 20 Sack ⇒ 20). */
  unitsPerPurchaseUnit: number
  /** Minimum order quantity. Counted in `moqUnit` when set, else `purchaseUnit`. */
  moq: number
  /** Orders round up to a multiple of this. Counted in `multipleUnit` when set,
   *  else `purchaseUnit`. */
  packSize: number
  /** Unit the MOQ is quoted in. A vendor can set a minimum in one unit ("1 Pallet")
   *  while stepping the order in another ("+1 Carton"), so the two are stored
   *  separately instead of both inheriting `purchaseUnit`. Optional: unset means
   *  "same as the purchase unit", which is the common case and what every
   *  pre-existing row means. */
  moqUnit?: string
  /** Unit the order step is quoted in. See `moqUnit`. */
  multipleUnit?: string
  /** Cost per PURCHASE unit, IDR. */
  unitCost: number
  /** The supplier's own item code, shown on the PO line. */
  vendorSku: string
  active: boolean
}

// ── Seed rules ───────────────────────────────────────────────────────────────

/** Which vendors can supply each category. V008 (logistics) and V009–V012
 *  (utilities, rent, software) are operating-expense vendors — no item links. */
const CATEGORY_VENDORS: Record<string, string[]> = {
  'Green Beans': ['V001', 'V003', 'V004', 'V005', 'V002'],
  'Roasted Beans': ['V001', 'V002', 'V004'],
  // A brewing machine has one specialist importer and realistically no second
  // source, so these stay single-vendor on purpose — "change vendor" should be
  // unavailable where a business genuinely has no alternative.
  'Espresso Machine': ['V007'],
  Grinder: ['V007'],
  // General equipment (scales, tampers, kit) is plausibly stocked by the
  // packaging-and-supplies wholesaler as well as the machinery importer.
  Equipment: ['V007', 'V006'],
  Accessory: ['V006', 'V007'],
}

/**
 * Purchase UoM + conversion + baseline ordering terms per category.
 *
 * `moq` and `packSize` here are only the BASELINE. Real suppliers of the same
 * product quote different minimums and case packs, so both are varied per
 * (vendor, SKU) in `vendorTerms()` below — otherwise every vendor of a product
 * would show an identical MOQ and the alternate-vendor comparison would be
 * pointless.
 */
const CATEGORY_TERMS: Record<string, {
  moq: number; packSize: number; leadBase: number; leadSpread: number
}> = {
  'Green Beans':      { moq: 2, packSize: 1, leadBase: 21, leadSpread: 14 },
  'Roasted Beans':    { moq: 4, packSize: 2, leadBase: 7,  leadSpread: 8 },
  'Espresso Machine': { moq: 1, packSize: 1, leadBase: 45, leadSpread: 16 },
  Grinder:            { moq: 1, packSize: 1, leadBase: 40, leadSpread: 14 },
  Equipment:          { moq: 1, packSize: 1, leadBase: 45, leadSpread: 12 },
  Accessory:          { moq: 6, packSize: 3, leadBase: 5,  leadSpread: 6 },
}

/**
 * Per-vendor ordering terms for one SKU.
 *
 * Pack size varies because vendors ship different case packs; MOQ varies because
 * a large importer will not break a pallet for you while a local cooperative
 * will. MOQ is always expressed as a WHOLE NUMBER OF PACKS, which is what keeps
 * `moq % packSize === 0` true by construction — the invariant
 * `applyMoqAndPack()` relies on so that converting-then-rounding and
 * rounding-then-converting agree (see tests/replenishment-math.spec.ts).
 */
function vendorTerms(vendorId: string, sku: string, base: { moq: number; packSize: number }): {
  moq: number; packSize: number
} {
  // Some vendors ship a double case pack — but only where a case pack is a real
  // concept. Where the baseline is 1 the purchase unit already IS the pack (a
  // pallet of green beans), so doubling it would invent a constraint the supplier
  // does not impose.
  const packSize = base.packSize > 1
    ? base.packSize * (1 + (hashStr(`${vendorId}:${sku}:pack`) % 2))
    : 1
  // ...and each sets its own minimum, as a whole number of those packs.
  const basePacks = Math.max(1, Math.round(base.moq / base.packSize))
  const packs = basePacks + (hashStr(`${vendorId}:${sku}:moqpacks`) % 3)
  return { moq: packSize * packs, packSize }
}

/** SKUs deliberately left with NO vendor at all, so the "No vendor" badge and the
 *  draft-PO skip list are reachable on a fresh demo (PRD US-021 EH-01, US-022 AC-03). */
export const VENDORLESS_SKUS: string[] = CATALOG
  .map((c, i) => ({ sku: c.sku, i }))
  .filter(({ i }) => i % 13 === 5)
  .slice(0, 2)
  .map(({ sku }) => sku)

/** SKU whose only vendor link is inactive — exercises the deactivated-vendor path. */
const INACTIVE_ONLY_SKU = CATALOG[11]?.sku ?? ''

/**
 * `hashStr` avalanched before any modulus.
 *
 * Plain `hashStr` is `h * 31 + charCode`, which clusters badly for keys that
 * differ only in a trailing character: every Roasted Beans SKU (1101, 1102,
 * 1103 …) landed in the same residue class and so drew the SAME vendor count,
 * giving one whole category three vendors each and another exactly one. Same
 * defect, same fix as `demandHistory.ts` — spread the bits first.
 */
function spread(key: string, n: number): number {
  let x = hashStr(key) >>> 0
  x ^= x >>> 16
  x = Math.imul(x, 0x7feb352d) >>> 0
  x ^= x >>> 15
  x = Math.imul(x, 0x846ca68b) >>> 0
  x ^= x >>> 16
  return n > 0 ? (x >>> 0) % n : 0
}

/**
 * The SKUs that carry an alternative supplier — chosen, not sampled.
 *
 * A probabilistic threshold cannot hit a target on a 30-product catalogue: the
 * variance swamps it, and one unlucky draw left the whole Accessory category
 * single-sourced. Ranking the eligible SKUs by a stable hash and taking the top
 * half gives the same determinism with none of the sampling noise, and the
 * proportion stays correct if the catalogue grows.
 *
 * Only SKUs whose category HAS a second supplier are eligible: espresso machines
 * and grinders come from one specialist importer, and inventing a second source
 * for them would make "change vendor" offer a choice the business does not have.
 * That floor means the eligible pool (20) is larger than the target (15), so the
 * catalogue lands on half exactly.
 */
const MULTI_VENDOR_SKUS: Set<string> = (() => {
  const eligible = CATALOG.filter(
    (c) => !VENDORLESS_SKUS.includes(c.sku)
      // Its links exist but are all inactive, so it shows no vendors at all —
      // designating it would spend one of the fifteen slots on an invisible row.
      && c.sku !== INACTIVE_ONLY_SKU
      && (CATEGORY_VENDORS[c.category]?.length ?? 0) >= 2,
  )
  const target = Math.min(eligible.length, Math.round(CATALOG.length / 2))
  const ranked = [...eligible].sort(
    (a, b) => spread(`${a.sku}:multi`, 1_000_000) - spread(`${b.sku}:multi`, 1_000_000),
  )
  return new Set(ranked.slice(0, target).map((c) => c.sku))
})()

function buildVendorItems(): VendorItem[] {
  const out: VendorItem[] = []

  CATALOG.forEach((item) => {
    if (VENDORLESS_SKUS.includes(item.sku)) return

    const pool = CATEGORY_VENDORS[item.category] ?? []
    const terms = CATEGORY_TERMS[item.category]
    if (!pool.length || !terms) return

    // 1–3 vendors per SKU, deterministic; index 0 is the preferred one. Weighted
    // so roughly half the catalogue carries an alternative, which is what makes
    // "change vendor" — and the lead-time comparison behind it — worth having.
    // Chosen, not sampled — see MULTI_VENDOR_SKUS. A third vendor goes to the
    // deepest pools so the comparison has something to compare.
    const wanted = MULTI_VENDOR_SKUS.has(item.sku)
      ? Math.min(pool.length, spread(`${item.sku}:third`, 100) < 30 ? 3 : 2)
      : 1
    const start = spread(`${item.sku}:vendorstart`, pool.length)
    const chosen: string[] = []
    for (let k = 0; k < wanted; k++) chosen.push(pool[(start + k) % pool.length]!)

    // Buy in the largest unit the product is packed in — a pallet of green beans,
    // a carton of roasted. Hardware has no larger unit, so this is the base unit.
    const purchase = largestUnitFor(item.sku)
    const unitsPer = purchase.factor
    const buyPrice = productBySku(item.sku)?.buyPrice ?? Math.round(item.price * 0.58)

    chosen.forEach((vendorId, k) => {
      // Alternates get a DIFFERENT lead time on purpose — usually longer and cheaper,
      // or shorter and pricier. Without that spread, switching vendor in the draft-PO
      // modal would never visibly move the suggestion, and OD-007's alternate picker
      // would be undemonstrable.
      const spread = hashStr(vendorId + item.sku + 'lead') % (terms.leadSpread + 1)
      const leadTimeDays = terms.leadBase + spread + (k === 0 ? 0 : 3 * k)
      const priceSkew = 1 + ((hashStr(vendorId + item.sku + 'price') % 13) - 6) / 100
      const unitCost = Math.round((buyPrice * unitsPer * priceSkew) / 1000) * 1000
      const { moq, packSize } = vendorTerms(vendorId, item.sku, terms)

      out.push({
        id: `vi-${vendorId}-${item.sku}`,
        vendorId,
        sku: item.sku,
        isPreferred: k === 0,
        leadTimeDays,
        purchaseUnit: purchase.name,
        unitsPerPurchaseUnit: unitsPer,
        moq,
        packSize,
        unitCost,
        vendorSku: `${vendorId}-${item.sku}`,
        active: true,
      })
    })

    // One SKU keeps its link(s) but deactivated, so the "vendor went inactive"
    // path is reachable without hand-editing data.
    if (item.sku === INACTIVE_ONLY_SKU) {
      for (let i = out.length - 1; i >= 0; i--) {
        if (out[i]!.sku !== item.sku) break
        out[i]!.active = false
        out[i]!.isPreferred = false
      }
    }
  })

  return out
}

type Overlay = Record<string, Partial<VendorItem>>

// A keyed object, not an array — so this uses raw localStorage like
// warehouseConfig.ts rather than persist.ts's array-shaped snapshot helpers.
function loadOverlay(): Overlay {
  if (!import.meta.client) return {}
  try {
    const raw = localStorage.getItem(OVERLAY_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Overlay) : {}
  } catch {
    return {}
  }
}

function saveOverlay(overlay: Overlay): void {
  if (!import.meta.client) return
  try { localStorage.setItem(OVERLAY_KEY, JSON.stringify(overlay)) } catch { /* non-fatal */ }
}

function applyOverlay(seed: VendorItem[]): VendorItem[] {
  const overlay = loadOverlay()
  const bySeedId = new Map(seed.map((v) => [v.id, v]))
  const merged: VendorItem[] = seed.map((v) => ({ ...v, ...(overlay[v.id] ?? {}) }))
  // Rows the user ADDED are those overlay keys with no seed row behind them.
  for (const [id, patch] of Object.entries(overlay)) {
    if (bySeedId.has(id)) continue
    if (!patch.vendorId || !patch.sku) continue
    merged.push({
      id,
      vendorId: patch.vendorId,
      sku: patch.sku,
      isPreferred: patch.isPreferred ?? false,
      leadTimeDays: patch.leadTimeDays ?? 14,
      purchaseUnit: patch.purchaseUnit ?? 'Unit',
      unitsPerPurchaseUnit: patch.unitsPerPurchaseUnit ?? 1,
      moq: patch.moq ?? 1,
      packSize: patch.packSize ?? 1,
      unitCost: patch.unitCost ?? 0,
      vendorSku: patch.vendorSku ?? id,
      active: patch.active ?? true,
    })
  }
  return merged
}

export const vendorItems = reactive<VendorItem[]>(applyOverlay(buildVendorItems()))

function persist(): void {
  const seed = new Map(buildVendorItems().map((v) => [v.id, v]))
  const overlay: Overlay = {}
  for (const row of vendorItems) {
    const base = seed.get(row.id)
    if (!base) { overlay[row.id] = { ...row }; continue }
    const diff: Partial<VendorItem> = {}
    for (const k of Object.keys(row) as (keyof VendorItem)[]) {
      if (row[k] !== base[k]) (diff as Record<string, unknown>)[k] = row[k]
    }
    if (Object.keys(diff).length) overlay[row.id] = diff
  }
  saveOverlay(overlay)
}

// ── Reads ────────────────────────────────────────────────────────────────────

/** Every ACTIVE vendor link for a SKU, preferred first then by lead time. */
export function vendorItemsForSku(sku: string): VendorItem[] {
  return vendorItems
    .filter((v) => v.sku === sku && v.active)
    .sort((a, b) => Number(b.isPreferred) - Number(a.isPreferred) || a.leadTimeDays - b.leadTimeDays)
}

export function preferredVendorItem(sku: string): VendorItem | undefined {
  const list = vendorItemsForSku(sku)
  return list.find((v) => v.isPreferred) ?? list[0]
}

export function vendorItemFor(sku: string, vendorId: string): VendorItem | undefined {
  return vendorItems.find((v) => v.sku === sku && v.vendorId === vendorId && v.active)
}

export function vendorItemsForVendor(vendorId: string): VendorItem[] {
  return vendorItems.filter((v) => v.vendorId === vendorId && v.active)
}

/** SKUs with no usable vendor — the draft-PO skip list (US-021 EH-01). */
export function skusWithoutVendor(): string[] {
  return CATALOG.map((c) => c.sku).filter((sku) => vendorItemsForSku(sku).length === 0)
}

/** Lead time for a SKU from a specific vendor, or its preferred one. Returns
 *  `estimated: true` when no vendor link supplied it (US-001 AC-03). */
export function leadTimeFor(sku: string, vendorId?: string, fallbackDays = 14): { days: number; estimated: boolean } {
  const vi = vendorId ? vendorItemFor(sku, vendorId) : preferredVendorItem(sku)
  if (vi) return { days: vi.leadTimeDays, estimated: false }
  return { days: fallbackDays, estimated: true }
}

// ── Writes ───────────────────────────────────────────────────────────────────

/**
 * Create or update a vendor link.
 *
 * Two rules make this safe to call with a partial patch:
 *   • `undefined` means "leave alone", never "set to undefined" — a plain
 *     Object.assign would happily blank a stored value.
 *   • A unit NAME is enough. Its conversion factor is always resolved from the
 *     product's own unit-conversion table, so a caller can never pin "4 Pallet" to
 *     a factor the product disagrees with. Passing a factor explicitly still wins,
 *     for the seed path that already knows it.
 */
export function upsertVendorItem(patch: Partial<VendorItem> & { sku: string; vendorId: string }): VendorItem {
  const id = patch.id ?? `vi-${patch.vendorId}-${patch.sku}`
  const existing = vendorItems.find((v) => v.id === id)

  // Drop undefined keys so an omitted field cannot erase a stored one.
  const clean: Partial<VendorItem> = {}
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) (clean as Record<string, unknown>)[k] = v
  }

  if (existing) {
    // Re-derive the factor whenever the unit moves and no explicit factor is given,
    // so switching MOQ from "Bag" to "Carton" cannot leave a stale conversion.
    if (clean.purchaseUnit && clean.unitsPerPurchaseUnit === undefined) {
      clean.unitsPerPurchaseUnit = factorFor(patch.sku, clean.purchaseUnit)
    }
    Object.assign(existing, clean, { id })
    persist()
    return existing
  }

  const p = productBySku(patch.sku)
  const terms = CATEGORY_TERMS[p?.category ?? ''] ?? CATEGORY_TERMS.Accessory!
  const chosenUnit = clean.purchaseUnit ?? largestUnitFor(patch.sku).name
  const chosenFactor = clean.unitsPerPurchaseUnit ?? factorFor(patch.sku, chosenUnit)
  const row: VendorItem = {
    id,
    vendorId: patch.vendorId,
    sku: patch.sku,
    isPreferred: clean.isPreferred ?? vendorItemsForSku(patch.sku).length === 0,
    leadTimeDays: clean.leadTimeDays ?? terms.leadBase,
    purchaseUnit: chosenUnit,
    unitsPerPurchaseUnit: chosenFactor,
    moq: clean.moq ?? vendorTerms(patch.vendorId, patch.sku, terms).moq,
    packSize: clean.packSize ?? vendorTerms(patch.vendorId, patch.sku, terms).packSize,
    unitCost: clean.unitCost ?? (p?.buyPrice ?? 0) * chosenFactor,
    vendorSku: clean.vendorSku ?? `${patch.vendorId}-${patch.sku}`,
    active: clean.active ?? true,
  }
  vendorItems.push(row)
  persist()
  return row
}

/** Make one vendor preferred for a SKU, clearing the flag on its siblings. */
export function setPreferredVendor(sku: string, vendorId: string): void {
  for (const v of vendorItems) {
    if (v.sku !== sku) continue
    v.isPreferred = v.vendorId === vendorId
  }
  persist()
}

export function deactivateVendorItem(sku: string, vendorId: string): void {
  const row = vendorItems.find((v) => v.sku === sku && v.vendorId === vendorId)
  if (!row) return
  row.active = false
  row.isPreferred = false
  // Promote a survivor so the SKU doesn't silently lose its default.
  const survivors = vendorItemsForSku(sku)
  if (survivors.length && !survivors.some((v) => v.isPreferred)) survivors[0]!.isPreferred = true
  persist()
}

/** Vendor display name for a link (falls back to the id when unresolvable). */
export function vendorNameFor(vendorId: string): string {
  return vendors.find((v) => v.id === vendorId)?.name ?? vendorId
}
