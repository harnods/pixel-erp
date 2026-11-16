/**
 * Per-product unit conversions — the multi-unit setup behind a product's base unit.
 *
 * A product is STOCKED in one base unit (from the catalog: Sack, Bag, Unit, Box)
 * but is often bought in a larger one: "1 Pallet = 20 Sack", "1 Carton = 12 Bag".
 * This module owns that relationship so there is exactly one place that knows how
 * many base units a purchase unit contains.
 *
 * Why it exists: vendor terms (MOQ, pack size) previously carried a hardcoded
 * per-category conversion of their own, which meant the same fact was written in
 * two places and could not be edited. `vendorItems.ts` now reads its conversions
 * from here, so changing "1 Carton = 12 Bag" on the product changes what the
 * vendor's MOQ means everywhere it is shown.
 *
 * `factor` is always expressed in BASE units, so it composes trivially:
 * MOQ 4 Pallet × factor 20 = 80 Sack. Seed is deterministic; only user edits
 * persist, as an overlay merged on top.
 */
import { reactive } from 'vue'
import { CATALOG } from './catalog'
import { productBySku } from './inventory'
import { readStore, writeStore } from './replenishmentStore'

const OVERLAY_KEY = 'erp-db:product-units-overlay-v1'

export interface UnitConversion {
  /** `uc-${sku}-${name}` */
  id: string
  sku: string
  /** Display name of the larger unit, e.g. 'Carton'. */
  name: string
  /** How many BASE units one of these contains. Always > 1. */
  factor: number
}

/** A unit a quantity can be expressed in — the base unit, or a conversion. */
export interface UnitOption {
  name: string
  /** Base units per 1 of this unit. The base unit itself is 1. */
  factor: number
  isBase: boolean
}

/**
 * Seed conversions by category, in base units.
 *
 * These mirror how the trade actually packs each product: green coffee ships on
 * pallets of 60 kg jute sacks, roasted beans in cartons of 1 kg bags, accessories
 * in cartons. Hardware is bought one at a time, so it gets none — which is also
 * what makes "no multi-unit available" a real state the UI has to handle.
 */
const CATEGORY_CONVERSIONS: Record<string, { name: string; factor: number }[]> = {
  'Green Beans': [
    { name: 'Pallet', factor: 20 },
  ],
  'Roasted Beans': [
    { name: 'Pack', factor: 6 },
    { name: 'Carton', factor: 12 },
  ],
  Accessory: [
    { name: 'Carton', factor: 24 },
  ],
  'Espresso Machine': [],
  Grinder: [],
  Equipment: [],
}

/** Paper filters are already stocked by the Box, so a carton holds 10 boxes. */
const SKU_CONVERSIONS: Record<string, { name: string; factor: number }[]> = {
  '3005': [{ name: 'Carton', factor: 10 }],
}

function buildConversions(): UnitConversion[] {
  const out: UnitConversion[] = []
  for (const item of CATALOG) {
    const list = SKU_CONVERSIONS[item.sku] ?? CATEGORY_CONVERSIONS[item.category] ?? []
    for (const c of list) {
      out.push({ id: `uc-${item.sku}-${c.name}`, sku: item.sku, name: c.name, factor: c.factor })
    }
  }
  return out
}

type Overlay = Record<string, Partial<UnitConversion> & { removed?: boolean }>

function applyOverlay(seed: UnitConversion[]): UnitConversion[] {
  const overlay = readStore<Overlay>(OVERLAY_KEY, {})
  const bySeedId = new Map(seed.map((c) => [c.id, c]))
  const merged: UnitConversion[] = []

  for (const c of seed) {
    const patch = overlay[c.id]
    if (patch?.removed) continue
    merged.push({ ...c, ...patch })
  }
  // Conversions the user ADDED are overlay keys with no seed row behind them.
  for (const [id, patch] of Object.entries(overlay)) {
    if (bySeedId.has(id) || patch.removed) continue
    if (!patch.sku || !patch.name || !patch.factor) continue
    merged.push({ id, sku: patch.sku, name: patch.name, factor: patch.factor })
  }
  return merged
}

export const unitConversions = reactive<UnitConversion[]>(applyOverlay(buildConversions()))

function persist(): void {
  const seed = new Map(buildConversions().map((c) => [c.id, c]))
  const overlay: Overlay = {}
  const present = new Set(unitConversions.map((c) => c.id))

  for (const row of unitConversions) {
    const base = seed.get(row.id)
    if (!base) { overlay[row.id] = { ...row }; continue }
    if (base.factor !== row.factor || base.name !== row.name) overlay[row.id] = { factor: row.factor, name: row.name }
  }
  // A seed conversion the user deleted is recorded as removed, so it stays gone.
  for (const id of seed.keys()) if (!present.has(id)) overlay[id] = { removed: true }

  writeStore(OVERLAY_KEY, overlay)
}

// ── Reads ────────────────────────────────────────────────────────────────────

/** A product's base (stocking) unit. */
export function baseUnitFor(sku: string): string {
  return productBySku(sku)?.unit ?? 'Unit'
}

/** Multi-units registered for a product, smallest first. */
export function unitConversionsForSku(sku: string): UnitConversion[] {
  return unitConversions.filter((c) => c.sku === sku).sort((a, b) => a.factor - b.factor)
}

/**
 * Every unit a quantity for this product can be expressed in — the base unit
 * first, then each registered multi-unit. This is what a "MOQ unit" picker offers.
 */
export function unitOptionsForSku(sku: string): UnitOption[] {
  return [
    { name: baseUnitFor(sku), factor: 1, isBase: true },
    ...unitConversionsForSku(sku).map((c) => ({ name: c.name, factor: c.factor, isBase: false })),
  ]
}

/** Base units per 1 of `unitName`. Falls back to 1 for an unknown unit. */
export function factorFor(sku: string, unitName: string): number {
  return unitOptionsForSku(sku).find((o) => o.name === unitName)?.factor ?? 1
}

/** Whether a unit name is still a valid option for a product. */
export function isValidUnitFor(sku: string, unitName: string): boolean {
  return unitOptionsForSku(sku).some((o) => o.name === unitName)
}

/** The largest registered unit — the natural default for bulk purchasing. */
export function largestUnitFor(sku: string): UnitOption {
  const options = unitOptionsForSku(sku)
  return options.reduce((max, o) => (o.factor > max.factor ? o : max), options[0]!)
}

/** "4 Pallet = 80 Sack" — a quantity plus what it means in base units. */
export function describeQty(sku: string, qty: number, unitName: string): string {
  const factor = factorFor(sku, unitName)
  const base = `${qty.toLocaleString('id-ID')} ${unitName}`
  if (factor <= 1) return base
  return `${base} = ${(qty * factor).toLocaleString('id-ID')} ${baseUnitFor(sku)}`
}

// ── Writes ───────────────────────────────────────────────────────────────────

export function upsertUnitConversion(sku: string, name: string, factor: number): UnitConversion {
  const id = `uc-${sku}-${name}`
  const existing = unitConversions.find((c) => c.id === id)
  if (existing) {
    existing.factor = factor
    persist()
    return existing
  }
  const row: UnitConversion = { id, sku, name, factor }
  unitConversions.push(row)
  persist()
  return row
}

export function removeUnitConversion(sku: string, name: string): void {
  const i = unitConversions.findIndex((c) => c.sku === sku && c.name === name)
  if (i === -1) return
  unitConversions.splice(i, 1)
  persist()
}
