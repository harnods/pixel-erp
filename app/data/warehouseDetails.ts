import { reactive } from 'vue'
import { warehouses } from './warehouses'
import { warehouseProducts, type Product } from './inventory'
import { TODAY } from './master'
import type { Warehouse } from './types'
import { stockLocationPaths, getMultiLocConfig } from './storageLocations'
import { loadSnapshot, saveSnapshot } from './persist'

// ── Persisted on-hand overlay ─────────────────────────────────────────────────
// Stores absolute onHand values that override the deterministic generated base.
// Written by applyStockCount / applyStockInOut / applyTransfer.
type StockOverlay = Record<string, Record<string, number>> // warehouseId → sku → onHand
const OVERLAY_KEY = 'wh-stock-overlay-v1'
const stockOverlay = reactive<StockOverlay>(loadSnapshot<StockOverlay>(OVERLAY_KEY) ?? {})
function persistOverlay() { saveSnapshot(OVERLAY_KEY, stockOverlay) }

// ── Persisted serial-number overlay ──────────────────────────────────────────
// Tracks SNs moved in/out between warehouses via approved transfers.
type SerialEntry = { added: string[]; removed: string[] }
type SerialOverlay = Record<string, Record<string, SerialEntry>> // warehouseId → sku → entry
const SERIAL_OVERLAY_KEY = 'wh-serial-overlay-v1'
const serialOverlay = reactive<SerialOverlay>(loadSnapshot<SerialOverlay>(SERIAL_OVERLAY_KEY) ?? {})
function persistSerialOverlay() { saveSnapshot(SERIAL_OVERLAY_KEY, serialOverlay) }

export function applyStockCount(warehouseId: string, lines: { sku: string; qty: number }[]) {
  if (!stockOverlay[warehouseId]) stockOverlay[warehouseId] = {}
  for (const l of lines) stockOverlay[warehouseId]![l.sku] = Math.max(0, l.qty)
  persistOverlay()
}

export function applyStockInOut(warehouseId: string, lines: { sku: string; qty: number }[]) {
  if (!stockOverlay[warehouseId]) stockOverlay[warehouseId] = {}
  const wh = getWarehouseDetail(warehouseId)
  for (const l of lines) {
    const current = stockOverlay[warehouseId]![l.sku] ?? wh?.stock.find(s => s.sku === l.sku)?.onHand ?? 0
    stockOverlay[warehouseId]![l.sku] = Math.max(0, current + l.qty)
  }
  persistOverlay()
}

export function applyTransfer(
  originId: string,
  destinationId: string,
  lines: { sku: string; qty: number; serials?: string[] }[],
) {
  applyStockInOut(originId, lines.map(l => ({ sku: l.sku, qty: -l.qty })))
  applyStockInOut(destinationId, lines)

  for (const line of lines) {
    if (!line.serials?.length) continue

    // remove SNs from origin
    if (!serialOverlay[originId]) serialOverlay[originId] = {}
    if (!serialOverlay[originId]![line.sku]) serialOverlay[originId]![line.sku] = { added: [], removed: [] }
    const originEntry = serialOverlay[originId]![line.sku]!
    for (const sn of line.serials) {
      if (!originEntry.removed.includes(sn)) originEntry.removed.push(sn)
      originEntry.added = originEntry.added.filter(s => s !== sn)
    }

    // add SNs to destination
    if (!serialOverlay[destinationId]) serialOverlay[destinationId] = {}
    if (!serialOverlay[destinationId]![line.sku]) serialOverlay[destinationId]![line.sku] = { added: [], removed: [] }
    const destEntry = serialOverlay[destinationId]![line.sku]!
    for (const sn of line.serials) {
      if (!destEntry.added.includes(sn)) destEntry.added.push(sn)
      destEntry.removed = destEntry.removed.filter(s => s !== sn)
    }
  }
  persistSerialOverlay()
}

/** A tracked batch (lot) of a product within a warehouse (Batches tab).
 *  A batch sits in one bin; a batch split across bins is modelled as separate rows. */
export interface ProductBatch {
  batchNo: string
  /** ISO date — used to flag near/expired stock */
  expiryDate: string
  /** storage bin location */
  location: string
  onHand: number
  reserved: number
  available: number
}

/** A single serialized unit — one serial number lives in exactly one bin. */
export interface SerialUnit {
  serial: string
  location: string
}

/** Serial-number tracking for a product (Serial numbers tab). */
export interface ProductSerials {
  available: SerialUnit[]
  reserved: SerialUnit[]
}

/** A single product's stock row within a warehouse (Products tab). */
export interface WarehouseStockItem {
  id: string
  name: string
  /** product photo URL (thumbnail) */
  photo: string
  /** muted subtitle under the name (variant / roast / colour, …) */
  subtitle: string
  sku: string
  barcode: string
  category: string
  /** optional multi-category tags; overrides `category` in the products table display */
  categories?: string[]
  onHand: number
  reserved: number
  available: number
  onTheWay: number
  minStock: number
  unit: string
  /** one or more bin locations */
  locations: string[]
  defaultSalesPrice: number
  averageCost: number
  lastPurchaseCost: number
  defaultPurchaseCost: number
  /** batch/lot tracking — only for batch-tracked products (Batches tab) */
  batches?: ProductBatch[]
  /** serial-number tracking — only for serial-tracked products (Serial numbers tab) */
  serials?: ProductSerials
}

export interface WarehouseDetail extends Warehouse {
  description: string
  pic: string
  stock: WarehouseStockItem[]
}


// short, stable bin-location codes derived from the row index
function binLocation(seed: number, i: number): string[] {
  const zone = `Z${String((seed % 9) + 1).padStart(2, '0')}`
  const rack = `R${String((i % 40) + 1).padStart(2, '0')}`
  const shelf = String.fromCharCode(65 + (i % 6))         // A–F
  const bin = `B${String((i % 200) + 1).padStart(3, '0')}`
  return [`L1/${zone}/${rack}/S${shelf}/${bin}`]
}

// Tracking is by category, not unit: only coffee beans carry expiry/lots (batch-
// tracked); machines/grinders/equipment carry serial numbers. Accessories (filters,
// tampers, pitchers, …) are neither — they have no batches and no serials.
const BATCH_CATEGORIES = new Set(['Green Beans', 'Roasted Beans'])
const SERIAL_CATEGORIES = new Set(['Espresso Machine', 'Grinder', 'Equipment'])
function isBatchTracked(category: string): boolean { return BATCH_CATEGORIES.has(category) }
function isSerialized(category: string): boolean { return SERIAL_CATEGORIES.has(category) }

// Sample products that belong to more than one category (sku → category list)
const MULTI_CATEGORIES: Record<string, string[]> = {
  '1101': ['Roasted Beans', 'Single Origin', 'Specialty Coffee'],
  '1102': ['Roasted Beans', 'Blend', 'Specialty Coffee', 'House Blend'],
  '1103': ['Roasted Beans', 'Single Origin', 'Decaf'],
  '2001': ['Espresso Machine', 'Commercial', 'Semi-Automatic'],
  '2002': ['Espresso Machine', 'Home', 'Semi-Automatic'],
  '2003': ['Espresso Machine', 'Commercial', 'Fully Automatic', 'IoT-Enabled'],
  '2101': ['Grinder', 'Commercial', 'Burr Grinder'],
  '2201': ['Grinder', 'Home', 'Burr Grinder', 'Compact'],
  '3001': ['Accessory', 'Brew Tools', 'Pour Over'],
  '3002': ['Accessory', 'Maintenance', 'Cleaning'],
}

// Batches for a consumable — 1–2 lots that sum to the row's on-hand / reserved.
function makeBatches(onHand: number, reserved: number, seed: number, i: number): ProductBatch[] {
  const n = 1 + ((i + seed) % 2) // 1 or 2 lots
  const out: ProductBatch[] = []
  let remOn = onHand
  let remRes = reserved
  for (let b = 0; b < n; b++) {
    const last = b === n - 1
    const oh = last ? remOn : Math.max(1, Math.round(onHand / n))
    const rs = last ? remRes : Math.min(oh, Math.round(reserved / n))
    remOn -= oh
    remRes -= rs
    const exp = new Date(TODAY.getTime())
    exp.setMonth(exp.getMonth() + 2 + ((i * 3 + b * 5 + seed) % 12))
    out.push({
      batchNo: `Batch #${String(i * 7 + b + 1).padStart(5, '0')}`,
      expiryDate: exp.toISOString().slice(0, 10),
      location: binLocation(seed, i * 2 + b)[0]!,
      onHand: oh,
      reserved: Math.max(0, rs),
      available: Math.max(0, oh - Math.max(0, rs)),
    })
  }
  return out
}

// Serial units for a hardware product — a small, design-matching subset.
function makeSerials(sku: string, onHand: number, reserved: number, seed: number, i: number): ProductSerials {
  const prefix = (sku.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'SN')
  const mk = (qty: number, base: number) =>
    Array.from({ length: qty }, (_, k) => ({
      serial: `${prefix}${String(base + k).padStart(5, '0')}`,
      location: binLocation(seed, i + k)[0]!,
    }))
  const avail = Math.max(0, onHand - reserved)
  return {
    available: mk(avail, seed * 100 + i * 10 + 100),
    reserved: mk(reserved, seed * 100 + i * 10 + 900),
  }
}

/**
 * Deterministically build `count` stock items for a warehouse (stable per id) from the
 * product DB {@link PRODUCTS} — so a warehouse's Products tab shows the SAME products
 * (name, SKU, photo, unit, pricing) as picking / packing / receiving. Product basics
 * and pricing come from the DB; per-warehouse figures (on hand, reserved, bins,
 * batches, serials) are generated here.
 */
function generateStock(products: Product[], seed: number): WarehouseStockItem[] {
  const out: WarehouseStockItem[] = []
  // The warehouse's own assortment (a deterministic random subset), so its Products tab
  // shows exactly what orders sourced from it draw on — never a mismatched SKU.
  const n = products.length
  for (let i = 0; i < n; i++) {
    const c = products[i]!
    const cycle = 1
    // Serialized hardware (machines, grinders): realistic warehouse qty — 3 to 22 units,
    // reserved 0–3. Batch/consumable products can have hundreds of units.
    const isSerial = isSerialized(c.category)
    const onHand = isSerial
      ? ((i * 7 + seed * 3 + 2) % 20) + 3
      : ((i * 53 + seed * 7 + 17) % 1500) + 5
    const reservedRaw = isSerial
      ? (((i * 5 + seed * 2) % 4 === 0) ? 0 : (i + seed) % 4)
      : (onHand > 40 ? (i * 13 + seed) % 40 : 0)
    const reserved = isSerial ? Math.min(reservedRaw, onHand - 1) : reservedRaw
    const onTheWay = (i * 7) % 60
    const minStock = Math.round((((i * 11) % 200) + 10) / 10) * 10
    out.push({
      id: `${seed}-p${i}`,
      name: cycle > 1 ? `${c.name} #${cycle}` : c.name,
      photo: c.img,
      subtitle: c.desc,
      sku: cycle > 1 ? `${c.sku}-${cycle}` : c.sku,
      barcode: String(8_991_000_000_000 + seed * 100_000 + i),
      category: c.category,
      categories: MULTI_CATEGORIES[c.sku],
      onHand,
      reserved,
      available: onHand - reserved,
      onTheWay,
      minStock,
      unit: c.unit,
      locations: binLocation(seed, i),
      defaultSalesPrice: c.sellPrice,
      averageCost: c.averageCost,
      lastPurchaseCost: c.lastPurchaseCost,
      defaultPurchaseCost: c.buyPrice,
      // batches for beans, serials for hardware, neither for accessories — first
      // occurrence only, so the Batches / Serial numbers tabs stay small subsets
      batches: cycle === 1 && isBatchTracked(c.category) ? makeBatches(onHand, reserved, seed, i) : undefined,
      serials: cycle === 1 && isSerialized(c.category) ? makeSerials(c.sku, onHand, reserved, seed, i) : undefined,
    })
  }
  return out
}

/** Per-warehouse description (mock). Falls back to a generic line. */
const descriptions: Record<string, string> = {
  'wh-000': 'Gudang utama',
  'wh-001': 'Gudang utama untuk wilayah Jakarta dan sekitarnya',
  'wh-002': 'Gudang distribusi wilayah Jawa Timur',
  'wh-003': 'Gudang industri kawasan Bandung Selatan',
  'wh-009': 'Gudang fulfillment wilayah Jakarta Timur dan sekitarnya',
  'wh-006': 'Gudang distribusi wilayah Makassar dan Indonesia Timur',
  'wh-010': 'Gudang fulfillment wilayah Makassar Utara dan sekitarnya',
}

// numeric seed from a warehouse id (e.g. 'wh-001' → 1) for stable generation
function seedFromId(id: string): number {
  const n = parseInt(id.replace(/\D/g, ''), 10)
  return Number.isNaN(n) ? 0 : n
}

export function getWarehouseDetail(id: string): WarehouseDetail | undefined {
  const wh = warehouses.find((w) => w.id === id)
  if (!wh) return undefined
  // stock rows = the warehouse's own assortment (deterministic random subset), which is
  // exactly `skuTotal` distinct products.
  const stock = generateStock(warehouseProducts(id), seedFromId(id))
  // Assign each product the REAL storage-tree bin it occupies (leaves tile the stock
  // array 1:1), so a product/batch/serial's location always matches the location you
  // opened it from — no more "Rack 03 contains an item tagged Rack 05".
  const paths = stockLocationPaths(id)
  const multiLoc = getMultiLocConfig(id)
  const L = paths.length
  stock.forEach((item, i) => {
    const loc = paths[i % L] ?? '—'
    const mlCfg = multiLoc.find((m) => m.idx === i)
    if (mlCfg && L > 1) {
      // Pick `count` distinct paths spread across the tree using an even step
      const step = Math.max(1, Math.floor(L / mlCfg.count))
      const locs: string[] = [loc]
      for (let k = 1; k < mlCfg.count; k++) {
        const candidate = paths[(i + step * k) % L]
        if (candidate && !locs.includes(candidate)) locs.push(candidate)
      }
      item.locations = locs.length >= 2 ? locs : [loc]
    } else {
      item.locations = [loc]
    }
    item.batches?.forEach((b) => { b.location = loc })
    if (item.serials) {
      item.serials.available.forEach((u) => { u.location = loc })
      item.serials.reserved.forEach((u) => { u.location = loc })
    }
  })
  // Apply any persisted on-hand overrides from stock counts / in-out / transfers
  const overlay = stockOverlay[id]
  if (overlay) {
    stock.forEach(item => {
      if (overlay[item.sku] !== undefined) {
        const newOnHand = overlay[item.sku]!
        const delta = newOnHand - item.onHand
        item.onHand = newOnHand
        item.available = Math.max(0, item.available + delta)
      }
    })
  }

  // Apply serial-number movements from approved transfers
  const sOverlay = serialOverlay[id]
  if (sOverlay) {
    stock.forEach(item => {
      if (!item.serials) return
      const so = sOverlay[item.sku]
      if (!so) return
      const removedSet = new Set(so.removed)
      item.serials.available = item.serials.available.filter(u => !removedSet.has(u.serial))
      item.serials.reserved = item.serials.reserved.filter(u => !removedSet.has(u.serial))
      const existingSet = new Set([
        ...item.serials.available.map(u => u.serial),
        ...item.serials.reserved.map(u => u.serial),
      ])
      const defaultLocation = item.locations[0] ?? ''
      for (const serial of so.added) {
        if (!existingSet.has(serial)) {
          item.serials.available.push({ serial, location: defaultLocation })
          existingSet.add(serial)
        }
      }
    })
  }

  return {
    ...wh,
    description: wh.description ?? descriptions[id] ?? '—',
    pic: wh.pics.map((p) => p.name).join(', ') || '—',
    stock,
  }
}

/**
 * The stock stored at a single storage location — the location's own slice of the
 * warehouse stock: [skuStart, skuStart + skuQty). Because the location tree tiles the
 * whole stock array exactly (see buildTree), every warehouse SKU appears in exactly
 * one bin and the per-location counts sum to the warehouse SKU total.
 */
export function getLocationStock(warehouseId: string, skuStart: number, skuQty: number): WarehouseStockItem[] {
  const wh = getWarehouseDetail(warehouseId)
  if (!wh || skuQty <= 0) return []
  const start = Math.max(0, Math.min(skuStart, wh.stock.length))
  return wh.stock.slice(start, start + skuQty)
}

/**
 * The real storage-tree bin path for a SKU in a warehouse (e.g. "L1 / ZA / A01 / R01 /
 * RK01 / SA / B001") — the single source of truth for "where does this SKU live". Used
 * by inbound/outbound (picking, packing, delivery, receiving, put-away) so their
 * per-line location matches the warehouse's storage locations. Falls back to a stable
 * bin for SKUs not currently stocked, so the format is always consistent.
 */
export function binForSku(warehouseId: string, sku: string): string {
  const wh = getWarehouseDetail(warehouseId)
  if (!wh || !wh.stock.length) return '—'
  const item = wh.stock.find((s) => s.sku === sku)
  if (item) return item.locations[0] ?? '—'
  let h = 0
  for (const ch of sku) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return wh.stock[h % wh.stock.length]!.locations[0] ?? '—'
}
