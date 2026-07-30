import { reactive } from 'vue'
import { warehouses } from './warehouses'
import { warehouseProducts, type Product } from './inventory'
import { TODAY } from './master'
import type { Warehouse } from './types'
import { stockLocationPaths, getMultiLocConfig } from './storageLocations'
import { loadSnapshot, saveSnapshot } from './persist'
import { getWarehouseSettings } from './warehouseSettings'
import { effectiveLocationPriority } from './warehouseConfig'
import { generateNextBarcode } from './barcodeConfig'

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

// ── Persisted new-batch overlay ──────────────────────────────────────────────
// Ad-hoc batches an operator registers on the fly (e.g. found/picked stock under
// a batch number the warehouse never logged) — merged into item.batches on top
// of the deterministic generated base, same overlay pattern as serialOverlay above.
type BatchOverlay = Record<string, Record<string, ProductBatch[]>> // warehouseId → sku → new batches
const BATCH_OVERLAY_KEY = 'wh-batch-overlay-v1'
const batchOverlay = reactive<BatchOverlay>(loadSnapshot<BatchOverlay>(BATCH_OVERLAY_KEY) ?? {})
function persistBatchOverlay() { saveSnapshot(BATCH_OVERLAY_KEY, batchOverlay) }

// ── Persisted storage-location (bin) barcode overlay ─────────────────────────
// Only Storage-type locations (bins) get a barcode — Organizational nodes (Floor/
// Zone/Aisle, …) are groupings, not a physical place something is scanned into.
// Same as serials: generated (and persisted) the first time it's ever read.
type LocationBarcodeOverlay = Record<string, string> // `${warehouseId}::${locId}` → barcode
const LOCATION_BARCODE_KEY = 'wh-location-barcode-overlay-v1'
const locationBarcodeOverlay = reactive<LocationBarcodeOverlay>(loadSnapshot<LocationBarcodeOverlay>(LOCATION_BARCODE_KEY) ?? {})
function persistLocationBarcodeOverlay() { saveSnapshot(LOCATION_BARCODE_KEY, locationBarcodeOverlay) }
function locationBarcodeKey(warehouseId: string, locId: string): string { return `${warehouseId}::${locId}` }

/** The barcode for one Storage-type location — generated (and persisted) on first read.
 *  Call only for `type === 'Storage'` nodes; Organizational nodes don't get one. */
export function ensureLocationBarcode(warehouseId: string, locId: string): string {
  const key = locationBarcodeKey(warehouseId, locId)
  let barcode = locationBarcodeOverlay[key]
  if (!barcode) {
    barcode = generateNextBarcode('bin')
    locationBarcodeOverlay[key] = barcode
    persistLocationBarcodeOverlay()
  }
  return barcode
}

/**
 * Register a brand-new batch that isn't already in the warehouse's inventory —
 * e.g. an operator picks from (or otherwise finds) stock under a batch number the
 * system never logged. Idempotent: re-registering the same (warehouseId, sku,
 * batchNo) is a no-op, whether it's already a real generated batch or was already
 * registered here. Starts fully available (reserved 0) — the caller's own
 * reservation (reserveStock) applies on top, same as any other batch.
 */
export function registerNewBatch(
  warehouseId: string,
  sku: string,
  batch: { batchNo: string; expiryDate: string; onHand: number; location?: string },
): void {
  if (!batch.batchNo || batch.onHand <= 0) return
  const item = getWarehouseDetail(warehouseId)?.stock.find((s) => s.sku === sku)
  if (item?.batches?.some((b) => b.batchNo === batch.batchNo)) return
  if (!batchOverlay[warehouseId]) batchOverlay[warehouseId] = {}
  const bySku = batchOverlay[warehouseId]!
  if (!bySku[sku]) bySku[sku] = []
  bySku[sku]!.push({
    batchNo: batch.batchNo,
    expiryDate: batch.expiryDate || '',
    createdAt: TODAY.toISOString().slice(0, 10),
    location: batch.location || item?.locations[0] || '',
    onHand: batch.onHand,
    reserved: 0,
    available: batch.onHand,
  })
  persistBatchOverlay()
}

/**
 * Reverse a specific overlay-added batch by `qty` — the exact inverse of
 * registerNewBatch, used when a PO gets canceled after its goods were already
 * put away (an in-progress or completed receiving task, acknowledged after
 * its PO was canceled — see cancelInboundReceipt/acknowledgeCanceledReceipt
 * in receivingTasks.ts/inboundSync.ts) and the batch THAT receiving task
 * itself registered needs undoing. Reducing item.onHand directly (like a
 * plain-SKU stock adjustment would) can't be used here — it would desync
 * from the sum of item.batches, breaking the batch-sum-matches-item-total
 * invariant. This only ever touches the overlay entry it's reversing; the
 * deterministically-generated base batches are never modified — they were
 * never added to by registerNewBatch either.
 */
export function unregisterBatch(warehouseId: string, sku: string, batchNo: string, qty: number): void {
  const bySku = batchOverlay[warehouseId]?.[sku]
  if (!bySku) return
  const idx = bySku.findIndex((b) => b.batchNo === batchNo)
  if (idx === -1) return
  const b = bySku[idx]!
  const take = Math.min(qty, b.onHand)
  b.onHand -= take
  b.available = Math.max(0, b.available - take)
  if (b.onHand <= 0) bySku.splice(idx, 1)
  persistBatchOverlay()
}

// ── Stock reservations ────────────────────────────────────────────────────────
// A batch/serial an outbound task has claimed — written at picking-task creation
// (reserveStock), removed on cancellation (releaseReservationsForTask). Applied
// fresh inside getWarehouseDetail() every call, same as the overlays above, since
// the whole stock array is regenerated from scratch each time.
export interface StockReservation {
  id: string
  taskId: string
  warehouseId: string
  sku: string
  /** Set for a batch-tracked SKU — this many units are held from this specific batch. */
  batchNo?: string
  qty: number
  /** Set for a serial-tracked SKU — these exact serial units are held. */
  serials?: string[]
}
const RESERVATIONS_KEY = 'wh-stock-reservations-v1'
const stockReservations = reactive<StockReservation[]>(loadSnapshot<StockReservation>(RESERVATIONS_KEY) ?? [])
function persistReservations() { saveSnapshot(RESERVATIONS_KEY, stockReservations) }
function freshReservationId(): string {
  const used = stockReservations.map((r) => Number(r.id.replace(/\D/g, ''))).filter((n) => Number.isFinite(n))
  return `resv-${Math.max(0, ...used) + 1}`
}

/** Reserve batch/serial stock for a picking task/order — called at task creation,
 *  at picking finish (re-pin to what was actually picked), and whenever an order's
 *  still-outstanding remainder gets topped up. Called repeatedly for the SAME
 *  (taskId, sku, batchNo) across those call sites, so it MERGES into any existing
 *  matching reservation instead of pushing a new row — otherwise the same batch/
 *  serial ends up double-reserved (and double-counted wherever qty is summed). */
export function reserveStock(
  taskId: string,
  warehouseId: string,
  picks: { sku: string; batchNo?: string; qty: number; serials?: string[] }[],
): void {
  for (const p of picks) {
    if (p.qty <= 0 && !p.serials?.length) continue
    if (p.batchNo) {
      const existing = stockReservations.find(
        (r) => r.taskId === taskId && r.warehouseId === warehouseId && r.sku === p.sku && r.batchNo === p.batchNo,
      )
      if (existing) { existing.qty += p.qty; continue }
    } else if (p.serials?.length) {
      const existing = stockReservations.find(
        (r) => r.taskId === taskId && r.warehouseId === warehouseId && r.sku === p.sku && !r.batchNo,
      )
      if (existing) {
        existing.serials = [...new Set([...(existing.serials ?? []), ...p.serials])]
        existing.qty = existing.serials.length
        continue
      }
    }
    stockReservations.push({ id: freshReservationId(), taskId, warehouseId, sku: p.sku, batchNo: p.batchNo, qty: p.qty, serials: p.serials })
  }
  persistReservations()
}

/** Release every reservation a task holds — called when the task is canceled. */
export function releaseReservationsForTask(taskId: string): void {
  const before = stockReservations.length
  for (let i = stockReservations.length - 1; i >= 0; i--) {
    if (stockReservations[i]!.taskId === taskId) stockReservations.splice(i, 1)
  }
  if (stockReservations.length !== before) persistReservations()
}

/** Whether an owner (order id, or picking task id) already holds any reservation. */
export function hasReservationsForTask(taskId: string): boolean {
  return stockReservations.some((r) => r.taskId === taskId)
}

/** Total reserved units an owner (order id) currently holds across every
 *  SKU/batch/serial — used to record how much a manual "Release Reserved"
 *  (D6) returned to Available for audit. */
export function reservedQtyForTask(taskId: string): number {
  return stockReservations
    .filter((r) => r.taskId === taskId)
    .reduce((sum, r) => sum + (r.serials?.length ?? r.qty), 0)
}

/** Every reservation an owner (order id) holds for a given SKU. */
export function getReservationsForOrder(orderId: string, sku: string): StockReservation[] {
  return stockReservations.filter((r) => r.taskId === orderId && r.sku === sku)
}

/** Every order (task id) holding a reservation against one specific batch. */
export function getReservationsForBatch(warehouseId: string, sku: string, batchNo: string): StockReservation[] {
  return stockReservations.filter(
    (r) => r.warehouseId === warehouseId && r.sku === sku && r.batchNo === batchNo,
  )
}

/** The reservation holding one specific serial number, if any order has claimed it. */
export function getReservationForSerial(warehouseId: string, sku: string, serial: string): StockReservation | undefined {
  return stockReservations.find(
    (r) => r.warehouseId === warehouseId && r.sku === sku && r.serials?.includes(serial),
  )
}

/** Release only one (order, sku) pair's reservations — used when a pick-time
 *  override re-pins just the SKU(s) that changed, leaving the order's other
 *  reserved SKUs untouched. */
export function releaseReservationsForOrderSku(orderId: string, sku: string): void {
  const before = stockReservations.length
  for (let i = stockReservations.length - 1; i >= 0; i--) {
    const r = stockReservations[i]!
    if (r.taskId === orderId && r.sku === sku) stockReservations.splice(i, 1)
  }
  if (stockReservations.length !== before) persistReservations()
}

/**
 * Consume `qty` units of an order's reservation for one SKU — used when a shipment
 * is COMPLETED (goods physically leave). Unlike releaseReservationsForOrderSku
 * (which drops the whole (order, sku) claim, returning it to Available), this
 * removes only the shipped quantity: it reduces batch-record qty / drops serials
 * FIFO across the order's reservation records for that SKU, deleting a record once
 * emptied. The caller pairs this with applyStockInOut(-qty) so on-hand falls by the
 * same amount and `available = onHand − reserved` stays put (the units left the
 * building, they weren't returned to stock). Returns the qty actually consumed.
 */
export function consumeReservation(orderId: string, warehouseId: string, sku: string, qty: number): number {
  let remaining = qty
  let changed = false
  for (let i = stockReservations.length - 1; i >= 0 && remaining > 0; i--) {
    const r = stockReservations[i]!
    if (r.taskId !== orderId || r.warehouseId !== warehouseId || r.sku !== sku) continue
    if (r.serials?.length) {
      const take = Math.min(r.serials.length, remaining)
      r.serials = r.serials.slice(0, r.serials.length - take)
      r.qty = r.serials.length
      remaining -= take
      changed = true
      if (r.serials.length === 0) stockReservations.splice(i, 1)
    } else {
      const take = Math.min(r.qty, remaining)
      r.qty -= take
      remaining -= take
      changed = true
      if (r.qty <= 0) stockReservations.splice(i, 1)
    }
  }
  if (changed) persistReservations()
  return qty - remaining
}

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

/** Allocatable units for a SKU (onHand − reserved) — 0 if the SKU isn't stocked. */
export function availableForSku(warehouseId: string, sku: string): number {
  return getWarehouseDetail(warehouseId)?.stock.find((s) => s.sku === sku)?.available ?? 0
}

/** On-hand units for a SKU in a warehouse — 0 if the SKU isn't stocked. */
export function onHandForSku(warehouseId: string, sku: string): number {
  return getWarehouseDetail(warehouseId)?.stock.find((s) => s.sku === sku)?.onHand ?? 0
}

/**
 * Would a stock-out (negative-qty lines) drive any SKU below zero on-hand, or
 * below what's already reserved? `applyStockInOut` silently clamps at 0, which
 * hides over-decrements — callers that must REJECT rather than swallow them
 * (stock in/out, transfers) check this first. Returns the first offending SKU,
 * or null when every line is safe.
 */
export function stockOutViolation(
  warehouseId: string,
  lines: { sku: string; qty: number }[],
): { sku: string; requested: number; onHand: number; available: number } | null {
  for (const l of lines) {
    if (l.qty >= 0) continue
    const out = -l.qty
    const onHand = onHandForSku(warehouseId, l.sku)
    const available = availableForSku(warehouseId, l.sku)
    // Removing more than is on hand → negative stock; more than available →
    // eating into reserved (already promised) stock. Both break the invariant.
    if (out > onHand || out > available) {
      return { sku: l.sku, requested: out, onHand, available }
    }
  }
  return null
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

/** Bring brand-new serial units into a warehouse's inventory — e.g. put-away
 *  registering hardware received for the first time. Unlike applyTransfer, there's
 *  no origin warehouse to remove them from: this only ever adds. Bumps onHand via
 *  the same overlay stock-in/out uses, and registers the exact serial numbers via
 *  the serial overlay's "added" list so they surface under item.serials.available
 *  with their real identity instead of the synthesized placeholders
 *  reconcileSerialQty() would otherwise invent to close the onHand↔serial-count gap. */
export function receiveNewSerials(warehouseId: string, sku: string, serials: string[]): void {
  const fresh = [...new Set(serials)].filter(Boolean)
  if (!fresh.length) return
  applyStockInOut(warehouseId, [{ sku, qty: fresh.length }])
  if (!serialOverlay[warehouseId]) serialOverlay[warehouseId] = {}
  if (!serialOverlay[warehouseId]![sku]) serialOverlay[warehouseId]![sku] = { added: [], removed: [] }
  const entry = serialOverlay[warehouseId]![sku]!
  for (const sn of fresh) {
    if (!entry.added.includes(sn)) entry.added.push(sn)
    entry.removed = entry.removed.filter(s => s !== sn)
  }
  persistSerialOverlay()
}

/**
 * Reverse specific serial units that were brought in via receiveNewSerials —
 * the exact inverse, used when a PO gets canceled after its goods were
 * already put away. Drops them from the "added" overlay list and reduces
 * aggregate onHand by the same count via applyStockInOut (safe here — plain
 * aggregate delta, no per-batch sum to desync, unlike unregisterBatch above).
 */
export function removeReceivedSerials(warehouseId: string, sku: string, serials: string[]): void {
  const fresh = [...new Set(serials)].filter(Boolean)
  if (!fresh.length) return
  const entry = serialOverlay[warehouseId]?.[sku]
  if (entry) {
    entry.added = entry.added.filter((sn) => !fresh.includes(sn))
    persistSerialOverlay()
  }
  applyStockInOut(warehouseId, [{ sku, qty: -fresh.length }])
}

/** A tracked batch (lot) of a product within a warehouse (Batches tab).
 *  A batch sits in one bin; a batch split across bins is modelled as separate rows. */
export interface ProductBatch {
  batchNo: string
  /** ISO date — used to flag near/expired stock */
  expiryDate: string
  /** ISO date this batch was received/created — used by the "created date" selection rule */
  createdAt: string
  /** storage bin location */
  location: string
  onHand: number
  reserved: number
  available: number
}

/** A single serialized unit — one serial number lives in exactly one bin. */
export interface SerialUnit {
  serial: string
  /** ISO date this serial was received/created — used by the "created date" selection rule */
  createdAt: string
  location: string
}

/** Serial-number tracking for a product (Serial numbers tab). */
export interface ProductSerials {
  available: SerialUnit[]
  reserved: SerialUnit[]
}

/** A product's real, allocatable slice of stock at one bin — always present (a
 *  single-location item just has one entry mirroring its aggregate qty); a
 *  multi-location item has 2-3, each independently reservable. */
export interface StockLocationBin {
  location: string
  onHand: number
  reserved: number
  available: number
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
  /** one or more bin locations (index 0 = primary) */
  locations: string[]
  /** real per-bin qty split — sums to onHand/reserved/available; 1 entry for a
   *  single-location item, 2-3 for a multi-location one */
  bins: StockLocationBin[]
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
export function isBatchTracked(category: string): boolean { return BATCH_CATEGORIES.has(category) }
export function isSerialized(category: string): boolean { return SERIAL_CATEGORIES.has(category) }

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

// (warehouse, SKU) pairs where generated on-hand < total demand + reservations.
// Values are set so that: available = onHand − formula_reserved − picking_reservations ≥ max_demand.
// Formula: new_onHand = 2 * max(total_reserved, max_demand) + 3 — guarantees
// available > max_demand even if formula_reserved grows to floor(new_onHand/3).
// Cannot import outgoing.ts here (circular dep). Validated by tests/data-integrity.spec.ts.
const MIN_ONHAND_OVERRIDE: Record<string, number> = {
  // ── pairs from earlier sessions ───────────────────────────────────────────
  'wh-008::2102': 9,   // pre-shipped seed order out-sh-001
  'wh-002::2102': 9,
  'wh-010::2103': 9,
  'wh-001::2003': 9,
  'wh-002::2103': 8,
  'wh-002::2104': 9,
  // ── pairs found by data-integrity.spec.ts ─────────────────────────────────
  'wh-002::2001': 13,  // was 9; total_reserved=5 demand=5
  'wh-010::1001': 17,  // total_reserved=7 demand=3
  'wh-001::2104': 17,  // total_reserved=7 demand=5
  'wh-001::2004': 15,  // total_reserved=6 demand=4
  'wh-010::2201': 23,  // was 13; total_reserved=10 demand=5
  'wh-010::2101': 23,  // was 11; total_reserved=10 demand=4
  'wh-010::1106': 19,  // total_reserved=8 demand=5
  'wh-009::1105': 21,  // was 11; total_reserved=9 demand=4
  'wh-009::1002': 25,  // total_reserved=11 demand=5
  'wh-005::1102': 15,  // total_reserved=6 demand=4
  'wh-009::2201': 15,  // total_reserved=6 demand=5
  'wh-003::2002': 13,  // total_reserved=5 demand=5
  'wh-003::2103': 21,  // was 10; total_reserved=9 demand=4
  'wh-005::1004': 11,  // total_reserved=4 demand=4
  'wh-009::2102': 7,   // total_reserved=2 demand=2
  // ── plain (non batch/serial-tracked) SKUs — exposed once reserveOrder() started
  // actually reserving them too (previously unenforced, silent oversell risk) ──
  'wh-006::3005': 13,  // total_reserved=5 demand=5
  // ── exposed once "partially shipped" orders became pickable again (their
  // un-picked remainder now correctly gets reserved too) ────────────────────
  'wh-003::2004': 15,  // total_reserved=6 demand=2
  'wh-001::2101': 15,  // total_reserved=6 demand=3
  'wh-001::2001': 11,  // total_reserved=4 demand=2
  'wh-001::3005': 21,  // total_reserved=9 demand=4
  // ── exposed once wh-006 (Makassar Selatan) started carrying the FULL catalog:
  // orders already demanded these SKUs from wh-006, but it didn't stock them before. ──
  'wh-006::2004': 15,  // total_reserved=9 demand=4 → available 6 (≥ demand); kept < 20 (serial-drawer page size)
  // ── out-demo-partial-split (D3/D7 demo): a 7-qty SKU-3001 order in wh-006 ──
  'wh-006::3001': 20,  // covers the demo order's demand 7 with headroom (avail ≥ 7)
}

// Deterministic ISO date `days` before TODAY — used for created-at fields so the
// "created date" selection rule has real, stable data to sort on.
function daysAgoIso(days: number): string {
  const d = new Date(TODAY.getTime())
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

// Split a total qty across `count` bins — 60/40 for 2, 50/30/20 for 3. The single
// weight-split convention shared by every real per-bin allocation in this file.
function splitByWeight(total: number, count: number): number[] {
  if (count <= 1) return [total]
  const weights = count === 2 ? [0.6, 0.4] : [0.5, 0.3, 0.2]
  const parts = weights.slice(0, count - 1).map((w) => Math.round(total * w))
  parts.push(Math.max(0, total - parts.reduce((a, b) => a + b, 0)))
  return parts
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
      createdAt: daysAgoIso(5 + ((i * 17 + b * 13 + seed * 7) % 250)),
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
      createdAt: daysAgoIso(3 + ((seed * 11 + i * 5 + k * 19 + base) % 250)),
      location: binLocation(seed, i + k)[0]!,
    }))
  const avail = Math.max(0, onHand - reserved)
  return {
    available: mk(avail, seed * 100 + i * 10 + 100),
    reserved: mk(reserved, seed * 100 + i * 10 + 900),
  }
}

// Keep a serial-tracked item's SN count matching its on-hand qty. Called once
// after both overlays (on-hand + exact serial moves from transfers) have been
// applied, so it only tops up/trims whatever gap is LEFT — a transfer that moves
// N specific serials alongside an N-unit onHand delta closes its own gap and
// this is a no-op; a plain stock count/in-out (no serial overlay) leaves the
// full delta as the gap, which gets synthesized here. Deterministic given the
// same starting serials + gap, so repeated calls to getWarehouseDetail never
// drift or duplicate.
function reconcileSerialQty(item: WarehouseStockItem): void {
  if (!item.serials) return
  const delta = item.onHand - (item.serials.available.length + item.serials.reserved.length)
  if (delta === 0) return
  if (delta > 0) {
    const prefix = item.sku.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'SN'
    const nums = [...item.serials.available, ...item.serials.reserved]
      .map((u) => parseInt(u.serial.replace(/\D/g, ''), 10))
      .filter((n) => Number.isFinite(n))
    let next = (nums.length ? Math.max(...nums) : 0) + 1
    const loc = item.locations[0] ?? '—'
    for (let k = 0; k < delta; k++) {
      item.serials.available.push({ serial: `${prefix}${String(next++).padStart(5, '0')}`, createdAt: TODAY.toISOString().slice(0, 10), location: loc })
    }
  } else {
    let toRemove = -delta
    while (toRemove > 0 && item.serials.available.length) { item.serials.available.pop(); toRemove-- }
    while (toRemove > 0 && item.serials.reserved.length) { item.serials.reserved.pop(); toRemove-- }
  }
}

/**
 * Deterministically build `count` stock items for a warehouse (stable per id) from the
 * product DB {@link PRODUCTS} — so a warehouse's Products tab shows the SAME products
 * (name, SKU, photo, unit, pricing) as picking / packing / receiving. Product basics
 * and pricing come from the DB; per-warehouse figures (on hand, reserved, bins,
 * batches, serials) are generated here.
 */
function generateStock(products: Product[], seed: number, warehouseId: string): WarehouseStockItem[] {
  const out: WarehouseStockItem[] = []
  // The warehouse's own assortment (a deterministic random subset), so its Products tab
  // shows exactly what orders sourced from it draw on — never a mismatched SKU.
  const n = products.length
  for (let i = 0; i < n; i++) {
    const c = products[i]!
    const cycle = 1
    // Serialized hardware (machines, grinders): each unit is individually tracked, so
    // realistic warehouse qty stays small — 1 to 9 units. Every other SKU (consumables,
    // accessories) is capped at 25 — no warehouse stocks hundreds/thousands of one SKU.
    // Floored by MIN_ONHAND_OVERRIDE for the few pairs where that range undershoots
    // actual seeded order demand.
    const isSerial = isSerialized(c.category)
    const onHandBase = isSerial
      ? ((i * 7 + seed * 3 + 2) % 9) + 1
      : ((i * 53 + seed * 7 + 17) % 21) + 5
    // Gudang Makassar Selatan (wh-006) is the demo/QA warehouse — floor every product
    // to at least 10 on hand so nothing shows up empty there.
    const wh006Floor = warehouseId === "wh-006" ? 10 : 0
    const onHand = Math.max(onHandBase, MIN_ONHAND_OVERRIDE[`${warehouseId}::${c.sku}`] ?? 0, wh006Floor)
    const reservedRaw = isSerial
      ? (((i * 5 + seed * 2) % 4 === 0) ? 0 : (i + seed) % 4)
      : (onHand > 8 ? (i * 13 + seed) % Math.max(1, Math.floor(onHand / 3)) : 0)
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
      bins: [], // real split assigned in getWarehouseDetail(), once the real storage tree is known
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
  const stock = generateStock(warehouseProducts(id), seedFromId(id), id)

  // Merge any ad-hoc new batches registered via registerNewBatch() (e.g. picked
  // from stock the warehouse never logged) — bumps the item's aggregate onHand/
  // available by the same amount so batch sums still match item totals; the
  // bin-split and reservation-application steps below then treat it exactly like
  // any other batch.
  const bOverlay = batchOverlay[id]
  if (bOverlay) {
    for (const item of stock) {
      const extra = bOverlay[item.sku]
      if (!extra?.length) continue
      if (!item.batches) item.batches = []
      for (const nb of extra) {
        if (item.batches.some((b) => b.batchNo === nb.batchNo)) continue
        item.batches.push({ ...nb })
        item.onHand += nb.onHand
        item.available += nb.onHand
      }
    }
  }

  // Assign each product the REAL storage-tree bin it occupies (leaves tile the stock
  // array 1:1), so a product/batch/serial's location always matches the location you
  // opened it from — no more "Rack 03 contains an item tagged Rack 05".
  const paths = stockLocationPaths(id)
  const multiLoc = getMultiLocConfig(id)
  const L = paths.length
  stock.forEach((item, i) => {
    const loc = paths[i % L] ?? '—'
    const mlCfg = multiLoc.find((m) => m.idx === i)
    let locs: string[]
    if (mlCfg && L > 1) {
      // Pick `count` distinct paths spread across the tree using an even step
      const step = Math.max(1, Math.floor(L / mlCfg.count))
      locs = [loc]
      for (let k = 1; k < mlCfg.count; k++) {
        const candidate = paths[(i + step * k) % L]
        if (candidate && !locs.includes(candidate)) locs.push(candidate)
      }
      if (locs.length < 2) locs = [loc]
    } else {
      locs = [loc]
    }
    item.locations = locs

    // Real per-bin qty split — same weights the Products-tab display always used,
    // now persisted so it's genuinely allocatable (reservations draw from it) instead
    // of recomputed at render time. A single-loc item just mirrors its aggregate.
    if (locs.length > 1) {
      const ohParts = splitByWeight(item.onHand, locs.length)
      const rvParts = splitByWeight(item.reserved, locs.length)
      item.bins = locs.map((l, bi) => {
        const oh = ohParts[bi] ?? 0
        const rv = Math.min(rvParts[bi] ?? 0, oh)
        return { location: l, onHand: oh, reserved: rv, available: oh - rv }
      })
    } else {
      item.bins = [{ location: loc, onHand: item.onHand, reserved: item.reserved, available: item.available }]
    }

    // Distribute batches/serial units across the item's real bins (round-robin) —
    // every batch/serial now lands in a bin that's actually one of this item's own,
    // instead of all being forced into the single primary one.
    item.batches?.forEach((b, bi) => { b.location = item.bins[bi % item.bins.length]!.location })
    if (item.serials) {
      item.serials.available.forEach((u, ui) => { u.location = item.bins[ui % item.bins.length]!.location })
      item.serials.reserved.forEach((u, ui) => { u.location = item.bins[ui % item.bins.length]!.location })
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
          item.serials.available.push({ serial, createdAt: TODAY.toISOString().slice(0, 10), location: defaultLocation })
          existingSet.add(serial)
        }
      }
    })
  }

  // Close any remaining onHand ↔ serial-count gap (stock counts / plain in-out
  // adjustments on a serial-tracked SKU don't carry explicit serials).
  stock.forEach((item) => reconcileSerialQty(item))

  // Apply outbound-task reservations — moves already-claimed batch qty / serial
  // units from available into reserved, on top of everything above, so every
  // caller (picking drawers, Warehouse Details, transfers) sees consistent numbers.
  for (const r of stockReservations) {
    if (r.warehouseId !== id) continue
    const item = stock.find((s) => s.sku === r.sku)
    if (!item) continue
    if (r.batchNo && item.batches) {
      const b = item.batches.find((x) => x.batchNo === r.batchNo)
      if (b) {
        const take = Math.min(r.qty, b.available)
        b.reserved += take
        b.available -= take
        item.reserved += take
        item.available = Math.max(0, item.available - take)
        // Mirror onto whichever real bin this batch actually sits in.
        const bin = item.bins.find((x) => x.location === b.location)
        if (bin) { bin.reserved += take; bin.available = Math.max(0, bin.available - take) }
      }
    }
    if (r.serials?.length && item.serials) {
      for (const sn of r.serials) {
        const idx = item.serials.available.findIndex((u) => u.serial === sn)
        if (idx === -1) continue
        const [u] = item.serials.available.splice(idx, 1)
        item.serials.reserved.push(u!)
        item.reserved += 1
        item.available = Math.max(0, item.available - 1)
        // Mirror onto whichever real bin this serial actually sits in.
        const bin = item.bins.find((x) => x.location === u!.location)
        if (bin) { bin.reserved += 1; bin.available = Math.max(0, bin.available - 1) }
      }
    }
    // Plain (non batch/serial-tracked) SKU — a reservation still holds real qty
    // against oversell, it just isn't pinned to a specific lot/unit.
    if (!r.batchNo && !r.serials?.length) {
      const take = Math.min(r.qty, item.available)
      item.reserved += take
      item.available = Math.max(0, item.available - take)
      const bin = item.bins.find((x) => x.location === item.locations[0])
      if (bin) { bin.reserved += take; bin.available = Math.max(0, bin.available - take) }
    }
  }

  return {
    ...wh,
    description: wh.description ?? descriptions[id] ?? '—',
    pic: wh.pics.map((p) => p.name).join(', ') || '—',
    stock,
  }
}

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true })
}

/**
 * Auto-select which real bin(s) to reserve from for a SKU, per the warehouse's
 * Storage location priority — ranks the SKU's own bins by that order, consuming
 * from each's live `available` until `qty` is met or the SKU's bins run out.
 * A single-bin SKU (the overwhelming majority) trivially returns its one bin —
 * there's nothing to actually choose between. Read-only, same pattern as
 * autoSelectBatches()/autoSelectSerials(); its result is meant to be fed into
 * them as `preferredLocations` so location/batch/serial compose as independent
 * rule axes instead of one silently overriding the other.
 */
export function autoSelectLocationBins(
  warehouseId: string,
  sku: string,
  qty: number,
): { location: string; take: number }[] {
  if (qty <= 0) return []
  const item = getWarehouseDetail(warehouseId)?.stock.find((s) => s.sku === sku)
  const bins = item?.bins ?? []
  if (!bins.length) return []
  if (bins.length === 1) {
    const take = Math.min(qty, bins[0]!.available)
    return take > 0 ? [{ location: bins[0]!.location, take }] : []
  }
  const priority = effectiveLocationPriority(warehouseId)
  const byLoc = new Map(bins.map((b) => [b.location, b]))
  const ordered: StockLocationBin[] = []
  for (const p of priority) {
    const b = byLoc.get(p.path)
    if (b) { ordered.push(b); byLoc.delete(p.path) }
  }
  ordered.push(...byLoc.values())
  const out: { location: string; take: number }[] = []
  let remaining = qty
  for (const b of ordered) {
    if (remaining <= 0) break
    const take = Math.min(remaining, b.available)
    if (take <= 0) continue
    out.push({ location: b.location, take })
    remaining -= take
  }
  return out
}

/**
 * Auto-select which batch(es) to reserve for a batch-tracked SKU, per the
 * global Batch selection rule — walks batches in rule order, consuming from
 * each's live `available` qty (already net of any prior reservation) until
 * `qty` is met or stock runs out (a short result just means insufficient
 * stock, same as a manual picker would hit). Read-only — call reserveStock()
 * to actually commit the result.
 *
 * `preferredLocations` (from autoSelectLocationBins) makes location its own
 * independent axis: batches inside those bins are tried first, in rule order;
 * only once they're exhausted does the rule fall back to the rest.
 */
export function autoSelectBatches(
  warehouseId: string,
  sku: string,
  qty: number,
  preferredLocations?: string[],
): { batchNo: string; expiryDate: string; location: string; onHand: number; take: number }[] {
  if (qty <= 0) return []
  const item = getWarehouseDetail(warehouseId)?.stock.find((s) => s.sku === sku)
  const batches = [...(item?.batches ?? [])]
  const rule = getWarehouseSettings().batchSelectionRule
  const ruleCompare = (a: ProductBatch, b: ProductBatch): number => {
    switch (rule) {
      case 'fefo': return a.expiryDate.localeCompare(b.expiryDate) || naturalCompare(a.createdAt, b.createdAt)
      case 'batch_number_asc': return naturalCompare(a.batchNo, b.batchNo)
      case 'batch_number_desc': return naturalCompare(b.batchNo, a.batchNo)
      case 'batch_created_asc': return naturalCompare(a.createdAt, b.createdAt)
      default: return 0
    }
  }
  const prefSet = new Set(preferredLocations ?? [])
  batches.sort((a, b) => {
    if (prefSet.size) {
      const pa = prefSet.has(a.location) ? 0 : 1
      const pb = prefSet.has(b.location) ? 0 : 1
      if (pa !== pb) return pa - pb
    }
    return ruleCompare(a, b)
  })
  const out: { batchNo: string; expiryDate: string; location: string; onHand: number; take: number }[] = []
  let remaining = qty
  for (const b of batches) {
    if (remaining <= 0) break
    const take = Math.min(remaining, b.available)
    if (take <= 0) continue
    out.push({ batchNo: b.batchNo, expiryDate: b.expiryDate, location: b.location, onHand: b.onHand, take })
    remaining -= take
  }
  return out
}

/**
 * Auto-select which serial(s) to reserve for a serial-tracked SKU, per the
 * global Serial number selection rule — same read-only, consume-from-available
 * semantics as autoSelectBatches(), with the same `preferredLocations` composition.
 */
export function autoSelectSerials(
  warehouseId: string,
  sku: string,
  qty: number,
  preferredLocations?: string[],
): string[] {
  if (qty <= 0) return []
  const item = getWarehouseDetail(warehouseId)?.stock.find((s) => s.sku === sku)
  const available = [...(item?.serials?.available ?? [])]
  const rule = getWarehouseSettings().serialSelectionRule
  const ruleCompare = (a: SerialUnit, b: SerialUnit): number => {
    switch (rule) {
      case 'serial_number_asc': return naturalCompare(a.serial, b.serial)
      case 'serial_number_desc': return naturalCompare(b.serial, a.serial)
      case 'serial_created_asc': return naturalCompare(a.createdAt, b.createdAt)
      default: return 0
    }
  }
  const prefSet = new Set(preferredLocations ?? [])
  available.sort((a, b) => {
    if (prefSet.size) {
      const pa = prefSet.has(a.location) ? 0 : 1
      const pb = prefSet.has(b.location) ? 0 : 1
      if (pa !== pb) return pa - pb
    }
    return ruleCompare(a, b)
  })
  return available.slice(0, qty).map((u) => u.serial)
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
