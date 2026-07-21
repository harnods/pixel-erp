/**
 * Product DB — the single source of truth for product master data, pricing, the
 * warehouse→SKU mapping and per-order SKU lines. Built on top of the master
 * {@link CATALOG} so there is still ONE product list, but this module adds the
 * commercial data (sell / buy / average cost) and the stock relationships every
 * feature needs.
 *
 * Why this exists: "SKU 1009 is stored at bin X" must always agree with "open bin X
 * and 1009 is there". That only holds if (a) every feature draws a warehouse's SKUs
 * from the SAME set the warehouse actually stocks, and (b) the bin a SKU maps to is
 * one that really exists in that warehouse. This module owns (a); `warehouseDetails`
 * owns the bin placement (b) and reads its product list + pricing from here.
 */
import { CATALOG } from './catalog'
import { warehouses } from './warehouses'

/** A product master row — basics + the full pricing triple. */
export interface Product {
  id: string
  sku: string
  name: string
  desc: string
  img: string
  category: string
  unit: string
  /** harga jual — default sales price (ex-tax, per unit, IDR) */
  sellPrice: number
  /** harga beli — default purchase cost */
  buyPrice: number
  /** moving-average cost */
  averageCost: number
  /** most recent purchase cost */
  lastPurchaseCost: number
  /** system auto-generated barcode — only set on products created via the New
   *  product form (per the configured barcode format); seed CATALOG products fall
   *  back to a deterministic value derived in productsIndex.ts. */
  barcode?: string
}

/**
 * Product master. Pricing is derived deterministically from the catalog sell price
 * (buy ≈ 58%, average ≈ 60%, last purchase ≈ 62% of sell) and stored here so every
 * view reads the SAME numbers instead of re-deriving them inconsistently.
 */
export const PRODUCTS: readonly Product[] = CATALOG.map((c) => ({
  id: c.id,
  sku: c.sku,
  name: c.name,
  desc: c.desc,
  img: c.img,
  category: c.category,
  unit: c.unit,
  sellPrice: c.price,
  buyPrice: Math.round(c.price * 0.58),
  averageCost: Math.round(c.price * 0.6),
  lastPurchaseCost: Math.round(c.price * 0.62),
}))

const BY_SKU = new Map(PRODUCTS.map((p) => [p.sku, p]))
/** Product master row for a SKU (undefined if the SKU isn't in the catalog). */
export function productBySku(sku: string): Product | undefined {
  return BY_SKU.get(sku)
}

// Deterministic per-warehouse PRNG seed (bit-mixed from the warehouse id) so each
// warehouse gets a DIFFERENT but STABLE assortment — the mix never changes across
// reloads, which is what keeps every view coherent.
function warehouseSeed(warehouseId: string): number {
  let s = ((Number(warehouseId.replace(/\D/g, '')) || 1) * 2654435761) >>> 0
  s ^= s >>> 15
  s = (s * 2246822519) >>> 0
  s ^= s >>> 13
  return s >>> 0
}

// Per-warehouse category restrictions. Warehouses not listed here draw from the full
// catalog. Warehouses listed here are limited to the specified categories, which
// determines whether their Batches / Serial numbers tabs appear at all:
//   Green Beans, Roasted Beans  → batch-tracked
//   Espresso Machine, Grinder, Equipment → serial-tracked
//   Accessory                   → neither
const WAREHOUSE_CATEGORIES: Record<string, Set<string>> = {
  'wh-004': new Set(['Accessory']),                                                    // no batch, no serial
  'wh-005': new Set(['Green Beans', 'Roasted Beans', 'Accessory']),                   // batch only, no serial
}

/**
 * The products a warehouse stocks — a deterministic RANDOM subset of `skuTotal`
 * distinct catalog products (seeded by the warehouse id), so each warehouse carries a
 * realistic, varied assortment instead of the same top-N SKUs. This is the ONE
 * definition of "what a warehouse carries"; `warehouseDetails` builds its stock rows
 * from this exact set, so a warehouse's Products tab, its storage locations and any
 * order sourced from it all reference the same SKUs. Returned in catalog order so the
 * stock list stays tidy (grouped by category/SKU), not shuffled.
 */
export function warehouseProducts(warehouseId: string): Product[] {
  const wh = warehouses.find((w) => w.id === warehouseId)
  if (!wh || wh.isDefault || !wh.skuTotal) return []
  const allowed = WAREHOUSE_CATEGORIES[warehouseId]
  const pool = allowed ? PRODUCTS.filter((p) => allowed.has(p.category)) : PRODUCTS
  const n = Math.min(wh.skuTotal, pool.length)
  // Seeded Fisher–Yates over the pool indices, then take the first n.
  let s = warehouseSeed(warehouseId)
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
  const idx = pool.map((_, i) => i)
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[idx[i], idx[j]] = [idx[j]!, idx[i]!]
  }
  return idx
    .slice(0, n)
    .sort((a, b) => a - b) // back to catalog order for a tidy, stable list
    .map((i) => pool[i]!)
}

/** SKUs a warehouse stocks. */
export function warehouseStockSkus(warehouseId: string): string[] {
  return warehouseProducts(warehouseId).map((p) => p.sku)
}

/** Whether a warehouse actually stocks a SKU. */
export function warehouseStocksSku(warehouseId: string, sku: string): boolean {
  return warehouseProducts(warehouseId).some((p) => p.sku === sku)
}

// Per-SKU ordered qty within an order — small, realistic (1..5 units). Mirrors
// `skuLineQty` in outgoing.ts so the order total and the per-line breakdown agree.
// Kept inline (not imported) so this module stays free of the outbound graph.
function lineQty(seed: number, i: number): number {
  return ((seed * 13 + i * 7) % 5) + 1
}

function seedNum(id: string): number {
  return Number(id.replace(/\D/g, '')) || 0
}

/** One resolved order line: which product, and how many units were ordered. */
export interface OrderSkuLine {
  sku: string
  product: Product
  qty: number
}

/**
 * The SKU lines for a sales order, drawn ONLY from the products its warehouse stocks
 * (distinct SKUs, deterministic from the order id). Because every SKU here is one the
 * warehouse carries, it maps to a real bin — so the location shown on a picking /
 * packing line always matches the storage location it's stored in.
 *
 * Every outbound feature (picking build, create-picking, create-packing, packing
 * details) resolves an order's lines through this one function, so they never drift.
 */
export function orderSkuLines(order: { id: string; warehouseId: string; skuQty: number; lines?: { sku: string; qty: number }[] }): OrderSkuLine[] {
  if (order.lines?.length) {
    return order.lines.map((l) => {
      const product = PRODUCTS.find((p) => p.sku === l.sku)
      if (!product) return null
      return { sku: l.sku, product, qty: l.qty }
    }).filter((x): x is OrderSkuLine => x !== null)
  }
  const pool = warehouseProducts(order.warehouseId)
  if (!pool.length) return []
  const base = seedNum(order.id)
  const n = Math.min(order.skuQty, pool.length)
  const used = new Set<number>()
  const out: OrderSkuLine[] = []
  for (let i = 0; i < n; i++) {
    let idx = (base * 7 + i * 13) % pool.length
    while (used.has(idx)) idx = (idx + 1) % pool.length // distinct SKU per line
    used.add(idx)
    const product = pool[idx]!
    out.push({ sku: product.sku, product, qty: lineQty(base, i) })
  }
  return out
}
