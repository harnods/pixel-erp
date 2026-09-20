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
import { CATALOG, SUBCON_CATALOG } from './catalog'
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
  /** WMS inline-create only — the warehouse's own stocking fields. Kept optional
   *  because the ERP catalogue carries neither: min. stock lives per-warehouse,
   *  and batch/serial tracking is otherwise derived from the product category. */
  minStock?: number
  trackStockBy?: string
}

/**
 * Product master. Pricing is derived deterministically from the catalog sell price
 * (buy ≈ 58%, average ≈ 60%, last purchase ≈ 62% of sell) and stored here so every
 * view reads the SAME numbers instead of re-deriving them inconsistently.
 */
/** The apparel line as Products — stocked, but never part of the order pool. */
export const SUBCON_PRODUCTS: readonly Product[] = SUBCON_CATALOG.map((c) => ({
  id: c.id, sku: c.sku, name: c.name, desc: c.desc, img: c.img, category: c.category, unit: c.unit,
  sellPrice: c.price,
  buyPrice: c.price,
  averageCost: c.price,
  lastPurchaseCost: c.price,
}))

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

/**
 * SKU → product, across BOTH catalogs.
 *
 * The subcon products are deliberately kept out of `PRODUCTS` itself: several seed
 * generators index that array modulo its length, so lengthening it reshuffles
 * orders and receipts away from the data they were tuned against (see catalog.ts).
 * A lookup map has no such problem — nothing iterates it by position — so this is
 * the one place the two catalogs are safely merged, and it is what lets a document
 * carrying an apparel SKU resolve its product at all.
 */
const BY_SKU = new Map([...PRODUCTS, ...SUBCON_PRODUCTS].map((p) => [p.sku, p]))
/** Product master row for a SKU (undefined if the SKU isn't in either catalog). */
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

// Original per-warehouse ORDER-DEMAND assortment size. Every warehouse now STOCKS the
// full catalog (skuTotal = 30 for display + storage-tree sizing), but seed orders keep
// drawing from a warehouse's original-sized pool so demand — and the tuned on-hand
// overrides in warehouseDetails — stay exactly as before. Absent → falls back to skuTotal.
const ORDER_POOL_SIZE: Record<string, number> = {
  'wh-001': 30, 'wh-002': 19, 'wh-003': 12, 'wh-004': 21, 'wh-005': 16,
  'wh-006': 30, 'wh-007': 8, 'wh-008': 10, 'wh-009': 23, 'wh-010': 14,
}

/**
 * The order-demand assortment for a warehouse — a deterministic RANDOM subset of
 * `skuTotal` distinct catalog products (seeded by the warehouse id). Seed orders draw
 * their SKUs from THIS set (via {@link orderSkuLines}), so demand stays stable and the
 * tuned on-hand overrides in warehouseDetails remain valid. A warehouse also STOCKS
 * the rest of the catalog on top of this (see {@link warehouseProducts}).
 */
export function warehouseOrderPool(warehouseId: string): Product[] {
  const wh = warehouses.find((w) => w.id === warehouseId)
  if (!wh || wh.isDefault || !wh.skuTotal) return []
  // wh-006 (Gudang Makassar Selatan) is the demo/QA warehouse — carry the FULL catalog
  // so ANY product can be ordered/picked/shipped from it (not a 9-SKU subset).
  if (warehouseId === 'wh-006') return [...PRODUCTS]
  const allowed = WAREHOUSE_CATEGORIES[warehouseId]
  const pool = allowed ? PRODUCTS.filter((p) => allowed.has(p.category)) : PRODUCTS
  const n = Math.min(ORDER_POOL_SIZE[warehouseId] ?? wh.skuTotal, pool.length)
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

/**
 * The products a warehouse STOCKS — every warehouse carries the FULL catalog so ANY
 * product can be ordered / picked / shipped from it in a demo (no "0 stock" blocker).
 * The warehouse's order-demand pool comes FIRST (unchanged indices → existing per-SKU
 * on-hand/reserved and the tuned data-integrity overrides stay identical); the rest of
 * the catalog is appended as 0-demand buffer stock. This is the ONE definition of
 * "what a warehouse carries" for stock rows, storage locations, transfers and
 * adjustments — always a superset of what any order sourced from it demands.
 */
export function warehouseProducts(warehouseId: string): Product[] {
  const wh = warehouses.find((w) => w.id === warehouseId)
  if (!wh || wh.isDefault || !wh.skuTotal) return []
  const pool = warehouseOrderPool(warehouseId)
  const inPool = new Set(pool.map((p) => p.sku))
  // The apparel line is APPENDED LAST and never enters the order pool: stock
  // generation keys off a product's index, so appending leaves every existing
  // figure byte-identical while still giving these SKUs real on-hand to
  // transfer. They are out of CATALOG on purpose — see catalog.ts.
  return [...pool, ...PRODUCTS.filter((p) => !inPool.has(p.sku)), ...SUBCON_PRODUCTS]
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
  const pool = warehouseOrderPool(order.warehouseId)
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
