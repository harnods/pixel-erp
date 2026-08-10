/**
 * Product details — everything the Product details page needs beyond the index row:
 * accounting defaults, a synthetic transaction (movement) ledger, and the per-warehouse
 * stock breakdown. Built on top of `productIndexRows` / `getWarehouseDetail` so the
 * numbers shown here always agree with the Products index and each warehouse's own
 * Products tab — never a second, drifting set of figures.
 */
import { reactive } from 'vue'
import { warehouses } from './warehouses'
import { getWarehouseDetail, isBatchTracked, isSerialized } from './warehouseDetails'
import { productIndexRows, type ProductIndexRow } from './productsIndex'
import { lastUpdatedFor } from '~/utils/lastUpdated'
import { TODAY } from './master'
import { loadSnapshot, saveSnapshot } from './persist'
import { generateNextBarcode } from './barcodeConfig'

export interface ProductDetail extends ProductIndexRow {
  productType: string
  trackStockBy: string
  defaultInventoryAccount: string
  defaultPurchaseAccount: string
  defaultPurchaseTax: string
  defaultSalesAccount: string
  defaultSalesTax: string
  createdBy: string
  createdAt: string
}

export function getProductDetail(sku: string): ProductDetail | undefined {
  const row = productIndexRows().find((r) => r.sku === sku)
  if (!row) return undefined
  const { at, by } = lastUpdatedFor(`created-${sku}`)
  return {
    ...row,
    productType: 'Single product',
    trackStockBy: isBatchTracked(row.category)
      ? 'Batch'
      : isSerialized(row.category) ? 'Serial number' : 'Quantity',
    defaultInventoryAccount: '1-10200 Inventory',
    defaultPurchaseAccount: '5-50000 Cost of Sales',
    defaultPurchaseTax: 'PPN 11%',
    defaultSalesAccount: '4-40000 Revenues',
    defaultSalesTax: 'PPN 11%',
    createdBy: by,
    createdAt: at,
  }
}

/** Per-warehouse stock rows for a single SKU (only warehouses that actually carry it). */
export interface ProductWarehouseStock {
  warehouseId: string
  warehouseName: string
  onHand: number
  reserved: number
  available: number
  onTheWay: number
  minStock: number
  unit: string
}

export function getProductWarehouseStock(sku: string): ProductWarehouseStock[] {
  const out: ProductWarehouseStock[] = []
  for (const wh of warehouses) {
    if (wh.isDefault || wh.status === 'archived') continue
    const detail = getWarehouseDetail(wh.id)
    const item = detail?.stock.find((s) => s.sku === sku)
    if (!detail || !item) continue
    out.push({
      warehouseId: wh.id,
      warehouseName: wh.name,
      onHand: item.onHand,
      reserved: item.reserved,
      available: item.available,
      onTheWay: item.onTheWay,
      minStock: item.minStock,
      unit: item.unit,
    })
  }
  return out
}

/** Per-warehouse serial-number counts for a single SKU (Stock by serial numbers
 *  tab) — unlike `getProductWarehouseStock`, this INCLUDES the default warehouse,
 *  since serial-tracked equipment is commonly held there rather than distributed. */
export interface ProductSerialStock {
  warehouseId: string
  warehouseName: string
  availableCount: number
  reservedCount: number
}

export function getProductSerialStock(sku: string): ProductSerialStock[] {
  const out: ProductSerialStock[] = []
  for (const wh of warehouses) {
    if (wh.status === 'archived') continue
    const detail = getWarehouseDetail(wh.id)
    const item = detail?.stock.find((s) => s.sku === sku)
    if (!detail || !item || !item.serials) continue
    out.push({
      warehouseId: wh.id,
      warehouseName: wh.name,
      availableCount: item.serials.available.length,
      reservedCount: item.serials.reserved.length,
    })
  }
  return out
}

/** Every serial number for a SKU (available + reserved) across all warehouses —
 *  used to print a barcode label for each unit from the Stock by SN tab. */
export function getProductAllSerials(sku: string): string[] {
  const out: string[] = []
  for (const wh of warehouses) {
    if (wh.status === 'archived') continue
    const item = getWarehouseDetail(wh.id)?.stock.find((s) => s.sku === sku)
    if (!item?.serials) continue
    for (const u of item.serials.available) out.push(u.serial)
    for (const u of item.serials.reserved) out.push(u.serial)
  }
  return out
}

// ── Transaction (movement) ledger ───────────────────────────────────────────────
export interface ProductTransaction {
  id: string
  date: string
  number: string
  delta: number
  affects: string[]
  onHand: number
  reserved: number
  available: number
  onTheWay: number
  unit: string
  type: string
}

const MOVEMENT_TEMPLATES: { type: string; sign: 1 | -1; affects: string[] }[] = [
  { type: 'Manual Stock Out', sign: -1, affects: ['On hand', 'Available'] },
  { type: 'Sales Return', sign: 1, affects: ['On hand', 'Available'] },
  { type: 'Sales Delivery', sign: -1, affects: ['On hand', 'Available'] },
  { type: 'Sales Order', sign: -1, affects: ['Available', 'Reserved'] },
  { type: 'Purchase Delivery', sign: 1, affects: ['On hand', 'Available'] },
  { type: 'Purchase Order', sign: 1, affects: ['In transit'] },
  { type: 'Stock In/Out', sign: 1, affects: ['On hand', 'Available'] },
]

function seedFrom(sku: string): number {
  let h = 0
  for (const ch of sku) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

/** Shared movement-ledger generator — deterministic history ending near the given
 *  starting totals. Used for both a product's full ledger and a single batch's
 *  (scoped to that batch's own totals + a distinct seed key so the two never collide). */
function buildTransactionLedger(
  seedKey: string, idPrefix: string,
  startOnHand: number, startReserved: number, startOnTheWay: number, unit: string,
): ProductTransaction[] {
  if (startOnHand === 0 && startReserved === 0 && startOnTheWay === 0) return []
  const seed = seedFrom(seedKey)
  let onHand = startOnHand
  let reserved = startReserved
  let onTheWay = startOnTheWay
  const out: ProductTransaction[] = []
  const baseDay = 24

  MOVEMENT_TEMPLATES.forEach((tpl, i) => {
    const magnitude = ((seed >> (i * 3)) % 4) + 1
    const delta = tpl.sign * magnitude
    if (tpl.affects.includes('On hand')) onHand -= delta
    if (tpl.affects.includes('Reserved')) reserved -= delta
    if (tpl.affects.includes('In transit')) onTheWay -= delta
    const available = Math.max(0, onHand - reserved)
    const day = Math.max(1, baseDay - i * 3 - (seed % 3))
    const date = `2026-01-${String(day).padStart(2, '0')}`
    const number = `${tpl.type} #${10120 - i * 10 - (seed % 7)}`
    out.push({
      id: `${idPrefix}-tx-${i}`,
      date,
      number,
      delta,
      affects: tpl.affects,
      onHand: Math.max(0, onHand),
      reserved: Math.max(0, reserved),
      available,
      onTheWay: Math.max(0, onTheWay),
      unit,
      type: tpl.type,
    })
  })
  return out
}

/** A short, deterministic movement history ending near the product's current totals. */
export function getProductTransactions(sku: string): ProductTransaction[] {
  const row = productIndexRows().find((r) => r.sku === sku)
  if (!row) return []
  // No stock anywhere (e.g. a product just created, never bought/sold/adjusted) →
  // nothing has happened to it yet. Fabricating a movement history here would
  // contradict the 0/0/0 shown everywhere else on the page.
  return buildTransactionLedger(sku, sku, row.onHand, row.reserved, row.onTheWay, row.unit)
}

// ── Batches (Track stock by = "Batch") ────────────────────────────────────────────
/** A product's batch (lot), aggregated across every warehouse that carries it —
 *  the Product details page shows one row per batch, not per warehouse. Only
 *  meaningful for batch-tracked categories (see `isBatchTracked`); every other
 *  product returns an empty list. */
export interface ProductBatchSummary {
  batchNo: string
  /** ISO date — used to flag near/expired stock (see StockTables.vue's isExpiryWarning) */
  expiryDate: string
  description: string
  onHand: number
  reserved: number
  available: number
  unit: string
  archived: boolean
  /** Auto-generated the first time this batch is ever read (see getProductBatches) —
   *  always present, no manual "Generate" step. */
  barcode: string
}

const BATCH_DESCRIPTIONS = [
  'Stock untuk gudang utama', 'Stock untuk gudang BSD', 'Produksi batch reguler', 'Stock cadangan',
]

// ── Persisted batch-barcode overlay — a batch has no barcode until generated ──────
type BatchBarcodeOverlay = Record<string, string> // `${sku}::${batchNo}` → barcode
const BATCH_BARCODE_KEY = 'batch-barcode-overlay-v1'
const batchBarcodeOverlay = reactive<BatchBarcodeOverlay>(loadSnapshot<BatchBarcodeOverlay>(BATCH_BARCODE_KEY) ?? {})
function persistBatchBarcodeOverlay() { saveSnapshot(BATCH_BARCODE_KEY, batchBarcodeOverlay) }
function batchBarcodeKey(sku: string, batchNo: string): string { return `${sku}::${batchNo}` }

/** The barcode assigned to one batch, if any (undefined until generated). */
export function getBatchBarcode(sku: string, batchNo: string): string | undefined {
  return batchBarcodeOverlay[batchBarcodeKey(sku, batchNo)]
}

/** Assign + persist a barcode for one batch (call once, from the "Generate" action). */
export function setBatchBarcode(sku: string, batchNo: string, barcode: string): void {
  batchBarcodeOverlay[batchBarcodeKey(sku, batchNo)] = barcode
  persistBatchBarcodeOverlay()
}

/** Split `total` into `count` near-equal whole-number parts that sum back to `total`. */
function splitEven(total: number, count: number): number[] {
  if (count <= 1) return [total]
  const base = Math.floor(total / count)
  const remainder = total - base * count
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0))
}

/** Every batch (lot) recorded for this SKU, newest-looking first. Empty for
 *  non-batch-tracked products or a product with no stock anywhere yet. */
export function getProductBatches(sku: string): ProductBatchSummary[] {
  const row = productIndexRows().find((r) => r.sku === sku)
  if (!row || !isBatchTracked(row.category)) return []
  if (row.onHand === 0 && row.reserved === 0) return []
  const seed = seedFrom(sku)
  const count = 2 + (seed % 3) // 2–4 batches
  const onHandParts = splitEven(row.onHand, count)
  const reservedParts = splitEven(row.reserved, count)
  const out: ProductBatchSummary[] = []
  for (let i = 0; i < count; i++) {
    const onHand = onHandParts[i]!
    const reserved = Math.min(onHand, reservedParts[i] ?? 0)
    // Deterministic spread from 20 days expired to ~200 days out, so at least one
    // batch is realistically near/past expiry (StockTables.vue's < 30-day warning).
    const offsetDays = ((seed >> (i * 4)) % 220) - 20
    const exp = new Date(TODAY.getTime())
    exp.setDate(exp.getDate() + offsetDays)
    const batchNo = `Batch #${String(i + 1).padStart(3, '0')}`
    // Auto-generate the barcode the first time this batch is ever read — no manual
    // "Generate" step; once assigned it's persisted like every other barcode kind.
    let barcode = getBatchBarcode(sku, batchNo)
    if (!barcode) {
      barcode = generateNextBarcode('batch')
      setBatchBarcode(sku, batchNo, barcode)
    }
    out.push({
      batchNo,
      expiryDate: exp.toISOString().slice(0, 10),
      description: BATCH_DESCRIPTIONS[(seed + i) % BATCH_DESCRIPTIONS.length]!,
      onHand,
      reserved,
      available: Math.max(0, onHand - reserved),
      unit: row.unit,
      archived: false,
      barcode,
    })
  }
  return out
}

export interface BatchDetail {
  sku: string
  productName: string
  batchNo: string
  expiryDate: string
  description: string
  onHand: number
  reserved: number
  available: number
  minStock: number
  unit: string
  updatedBy: string
  updatedAt: string
  barcode: string
}

export function getBatchDetail(sku: string, batchNo: string): BatchDetail | undefined {
  const row = productIndexRows().find((r) => r.sku === sku)
  if (!row) return undefined
  const { at, by } = lastUpdatedFor(`batch-${sku}-${batchNo}`)
  const batch = getProductBatches(sku).find((b) => b.batchNo === batchNo)
  if (batch) {
    return {
      sku,
      productName: row.name,
      batchNo: batch.batchNo,
      expiryDate: batch.expiryDate,
      description: batch.description,
      onHand: batch.onHand,
      reserved: batch.reserved,
      available: batch.available,
      minStock: row.minStock,
      unit: batch.unit,
      updatedBy: by,
      updatedAt: at,
      barcode: batch.barcode,
    }
  }
  // Fallback for a WAREHOUSE-LOT batch: Warehouse Details lists per-warehouse lots
  // whose batchNos differ from the product-level summary batches above. Aggregate the
  // lot's stock across every warehouse holding it so the same page/format renders
  // (instead of "batch not found") when the batch is opened from Warehouse Details.
  let onHand = 0, reserved = 0, available = 0, expiryDate = ''
  let found = false
  for (const w of warehouses) {
    const lot = getWarehouseDetail(w.id)?.stock.find((s) => s.sku === sku)?.batches?.find((b) => b.batchNo === batchNo)
    if (!lot) continue
    found = true
    onHand += lot.onHand; reserved += lot.reserved; available += lot.available
    if (!expiryDate) expiryDate = lot.expiryDate
  }
  if (!found) return undefined
  let barcode = getBatchBarcode(sku, batchNo)
  if (!barcode) { barcode = generateNextBarcode('batch'); setBatchBarcode(sku, batchNo, barcode) }
  return {
    sku,
    productName: row.name,
    batchNo,
    expiryDate,
    description: '',
    onHand,
    reserved,
    available,
    minStock: row.minStock,
    unit: row.unit,
    updatedBy: by,
    updatedAt: at,
    barcode,
  }
}

/** A batch's own movement history — scoped to its own (smaller) totals, not the
 *  whole product's. Batches don't carry an "in transit" figure of their own (a
 *  batch only exists once it's actually received), so that stays at 0 throughout. */
export function getBatchTransactions(sku: string, batchNo: string): ProductTransaction[] {
  const batch = getProductBatches(sku).find((b) => b.batchNo === batchNo)
  if (!batch) return []
  const seedKey = `${sku}-${batchNo}`
  return buildTransactionLedger(seedKey, seedKey, batch.onHand, batch.reserved, 0, batch.unit)
}

/** A batch's stock split across the same warehouses the product itself stocks in,
 *  proportional to each warehouse's existing share of the product's on-hand total —
 *  so a batch's numbers always sum back to its own totals above. */
/**
 * Batch details for ONE warehouse's lot — same BatchDetail shape as getBatchDetail,
 * but the qty fields are that warehouse's lot (not the product-wide total). Backs the
 * warehouse-scoped batch-details page reached from Warehouse Details (stays under the
 * /warehouses path, same page format).
 */
export function getWarehouseBatchDetail(warehouseId: string, sku: string, batchNo: string): BatchDetail | undefined {
  const row = productIndexRows().find((r) => r.sku === sku)
  const item = getWarehouseDetail(warehouseId)?.stock.find((s) => s.sku === sku)
  const lot = item?.batches?.find((b) => b.batchNo === batchNo)
  if (!row || !item || !lot) return undefined
  const { at, by } = lastUpdatedFor(`batch-${sku}-${batchNo}`)
  let barcode = getBatchBarcode(sku, batchNo)
  if (!barcode) { barcode = generateNextBarcode('batch'); setBatchBarcode(sku, batchNo, barcode) }
  return {
    sku,
    productName: row.name,
    batchNo,
    expiryDate: lot.expiryDate,
    description: '',
    onHand: lot.onHand,
    reserved: lot.reserved,
    available: lot.available,
    minStock: item.minStock,
    unit: item.unit,
    updatedBy: by,
    updatedAt: at,
    barcode,
  }
}

export function getBatchWarehouseStock(sku: string, batchNo: string): ProductWarehouseStock[] {
  const batch = getProductBatches(sku).find((b) => b.batchNo === batchNo)
  if (!batch) {
    // Warehouse-lot batch (see getBatchDetail fallback) — list each warehouse that
    // actually holds this exact lot, from real warehouse stock.
    const out: ProductWarehouseStock[] = []
    for (const wh of warehouses) {
      if (wh.isDefault || wh.status === 'archived') continue
      const item = getWarehouseDetail(wh.id)?.stock.find((s) => s.sku === sku)
      const lot = item?.batches?.find((b) => b.batchNo === batchNo)
      if (!item || !lot || lot.onHand <= 0) continue
      out.push({
        warehouseId: wh.id, warehouseName: wh.name,
        onHand: lot.onHand, reserved: lot.reserved, available: lot.available,
        onTheWay: 0, minStock: item.minStock, unit: item.unit,
      })
    }
    return out
  }
  const productStock = getProductWarehouseStock(sku)
  const totalOnHand = productStock.reduce((sum, w) => sum + w.onHand, 0)
  if (totalOnHand === 0) return []
  return productStock
    .map((w) => {
      const ratio = w.onHand / totalOnHand
      const onHand = Math.round(batch.onHand * ratio)
      const reserved = Math.min(onHand, Math.round(batch.reserved * ratio))
      return {
        ...w,
        onHand,
        reserved,
        available: Math.max(0, onHand - reserved),
        onTheWay: 0,
      }
    })
    .filter((w) => w.onHand > 0)
}
