/**
 * Cross-module integrity guards.
 *
 * Some deletes/archives are only safe if nothing else still depends on the
 * record. The owning table can't check that itself without importing modules
 * that import it back (a cycle) — so, like inboundSync/outboundSync, this module
 * sits ABOVE the tables, reads across them, and exposes:
 *   - `can…()` predicates (for enabling/soft-validating in the UI), and
 *   - `…Safe()` mutators that refuse with a reason instead of orphaning data.
 *
 * Keeps the mini-DB coherent: no dispatch pointing at a deleted courier, no
 * stock stranded in a deleted bin or an archived warehouse, no BOM edited out
 * from under a work order that's mid-production.
 */
import { couriers, deleteCourier } from './couriers'
import { deliveryTasks } from './deliveryTasks'
import { findLocation, deleteLocation } from './storageLocations'
import { getWarehouseDetail } from './warehouseDetails'
import { warehouses, archiveWarehouses } from './warehouses'
import { receivingTasks } from './receivingTasks'
import { pickingTasks } from './pickingTasks'
import { warehouseTransfers } from './warehouseTransfers'
import { billOfMaterials, updateBillOfMaterials, saveBomNewVersion, bomCycle, VERSION_REASON_MIN, VERSION_REASON_MAX, type BillOfMaterialsInput } from './billOfMaterials'
import { workOrders } from './workOrders'

export type GuardResult = { ok: true } | { ok: false; reason: string }

// ── Courier ─────────────────────────────────────────────────────────────────

/** Deliveries still travelling under a courier (not yet shipped or canceled). */
export function deliveriesUsingCourier(courierName: string): number {
  return deliveryTasks.filter(
    (d) => d.courier === courierName && d.status !== 'shipped' && d.status !== 'canceled',
  ).length
}

/** A courier can be deleted only if no in-flight shipment still references it. */
export function canDeleteCourier(id: string): boolean {
  const c = couriers.find((x) => x.id === id)
  if (!c) return false
  return deliveriesUsingCourier(c.name) === 0
}

/** Delete a courier, refusing if any in-flight shipment still uses it. */
export function deleteCourierSafe(id: string): GuardResult {
  const c = couriers.find((x) => x.id === id)
  if (!c) return { ok: false, reason: 'NOT_FOUND' }
  const inFlight = deliveriesUsingCourier(c.name)
  if (inFlight > 0) {
    return { ok: false, reason: `COURIER_IN_USE: ${inFlight} active shipment(s) still use ${c.name}` }
  }
  deleteCourier(id)
  return { ok: true }
}

// ── Storage location ─────────────────────────────────────────────────────────

/** On-hand units sitting in a location's SKU slice (branch = across its leaves). */
export function stockInLocation(warehouseId: string, locId: string): number {
  const hit = findLocation(warehouseId, locId)
  if (!hit) return 0
  const stock = getWarehouseDetail(warehouseId)?.stock ?? []
  let total = 0
  for (let i = hit.node.skuStart; i < hit.node.skuStart + hit.node.skuQty; i++) {
    total += stock[i]?.onHand ?? 0
  }
  return total
}

/** A location can be deleted only when it holds no on-hand stock. */
export function canDeleteLocation(warehouseId: string, locId: string): boolean {
  return stockInLocation(warehouseId, locId) === 0
}

/** Delete a storage location, refusing if it still holds stock (would orphan it). */
export function deleteLocationSafe(warehouseId: string, locId: string): GuardResult {
  const onHand = stockInLocation(warehouseId, locId)
  if (onHand > 0) {
    return { ok: false, reason: `LOCATION_HAS_STOCK: ${onHand} unit(s) still stored here` }
  }
  deleteLocation(warehouseId, locId)
  return { ok: true }
}

// ── Warehouse archive ─────────────────────────────────────────────────────────

/** Live on-hand across a warehouse (any SKU with stock still in it). */
export function warehouseOnHand(warehouseId: string): number {
  return (getWarehouseDetail(warehouseId)?.stock ?? []).reduce((s, it) => s + (it.onHand ?? 0), 0)
}

/** Open receiving/picking tasks + draft transfers touching a warehouse. */
export function openTasksForWarehouse(warehouseId: string): number {
  const rec = receivingTasks.filter(
    (t) => t.warehouseId === warehouseId && t.status !== 'completed' && t.status !== 'canceled',
  ).length
  const pick = pickingTasks.filter(
    (t) => t.warehouseId === warehouseId && t.status !== 'completed' && t.status !== 'canceled',
  ).length
  const transfers = warehouseTransfers.filter(
    (t) => t.status === 'draft' && (t.originId === warehouseId || t.destinationId === warehouseId),
  ).length
  return rec + pick + transfers
}

/** A warehouse can be archived only when it holds no stock and has no open work. */
export function canArchiveWarehouse(id: string): boolean {
  const wh = warehouses.find((w) => w.id === id)
  if (!wh || wh.isDefault || wh.status === 'archived') return false
  return warehouseOnHand(id) === 0 && openTasksForWarehouse(id) === 0
}

/** Archive warehouses, refusing any that still hold stock or have open work. */
export function archiveWarehousesSafe(ids: string[]): GuardResult {
  const blocked: string[] = []
  for (const id of ids) {
    const wh = warehouses.find((w) => w.id === id)
    if (!wh || wh.isDefault || wh.status === 'archived') continue
    const onHand = warehouseOnHand(id)
    const open = openTasksForWarehouse(id)
    if (onHand > 0 || open > 0) {
      blocked.push(`${wh.name} (${onHand} on-hand, ${open} open task/transfer)`)
    }
  }
  if (blocked.length) {
    return { ok: false, reason: `WAREHOUSE_NOT_EMPTY: ${blocked.join('; ')}` }
  }
  archiveWarehouses(ids)
  return { ok: true }
}

// ── Bill of materials ─────────────────────────────────────────────────────────

/** Work orders still depending on a BOM (not completed/canceled = mid-production). */
export function activeWorkOrdersForBom(bomId: string): number {
  return workOrders.filter(
    (w) => w.bomId === bomId && w.status !== 'completed' && w.status !== 'canceled',
  ).length
}

/**
 * Reference lock (V-02): the first reference by a work order freezes a version
 * forever — even if that work order is later canceled. A locked version is never
 * edited; "Edit" becomes "Create new version" (the form saves vN+1). An Active
 * version nothing references yet is edited in place. Parent BOMs don't lock their
 * sub-BOMs (multi-level = resolve-at-WO; recursive locking is rejected).
 * (Project BOMs differ: an edit to a referenced one raises an ECO — see projectActions.)
 */
export function bomVersionLocked(id: string, version?: number): boolean {
  const b = billOfMaterials.find(x => x.id === id)
  if (!b) return false
  const v = version ?? b.version
  return workOrders.some(w => (w.bomId === id && (w.bomVersion ?? 1) === v) || w.subBomPins?.[id] === v)
}
/** How many documents reference one version — work orders on it, plus work orders pinning it as a sub-BOM. */
export function bomVersionRefCount(id: string, version: number): number {
  return workOrders.filter(w => (w.bomId === id && (w.bomVersion ?? 1) === version) || w.subBomPins?.[id] === version).length
}
/** @deprecated kept for callers of the pre-versioning guard — every BOM is now editable. */
export function canEditBom(id: string): boolean {
  return billOfMaterials.some(b => b.id === id)
}

export type BomSaveFailure = { ok: false; reason: 'NOT_FOUND' | 'LOCKED' | 'CIRCULAR' | 'REASON'; path?: string[] }
export type BomSaveResult = { ok: true; version: number } | BomSaveFailure

/**
 * Save an edit to the Active version in place — only while nothing references it.
 * A referenced (locked) Active version is refused with LOCKED (the API's 409): the
 * caller saves a new version instead. A save that would make the BOM consume its
 * own output at any level is refused with CIRCULAR.
 */
export function updateBillOfMaterialsSafe(
  id: string,
  data: BillOfMaterialsInput,
  meta: { by?: string } = {},
): BomSaveResult {
  const b = billOfMaterials.find(x => x.id === id)
  if (!b) return { ok: false, reason: 'NOT_FOUND' }
  const cycle = bomCycle(id, data)
  if (cycle) return { ok: false, reason: 'CIRCULAR', path: cycle }
  if (bomVersionLocked(id)) return { ok: false, reason: 'LOCKED' }
  updateBillOfMaterials(id, data, meta.by)
  return { ok: true, version: b.version }
}

/**
 * Save the "Create new version" form as vN+1 (Active at once; the previous one is
 * Superseded). Nothing exists before this call — leaving the form creates nothing.
 */
export function saveBomNewVersionSafe(
  id: string,
  data: BillOfMaterialsInput,
  meta: { by: string; reason: string },
): BomSaveResult {
  const b = billOfMaterials.find(x => x.id === id)
  if (!b) return { ok: false, reason: 'NOT_FOUND' }
  const n = meta.reason.trim().length
  if (n < VERSION_REASON_MIN || n > VERSION_REASON_MAX) return { ok: false, reason: 'REASON' }
  const cycle = bomCycle(id, data)
  if (cycle) return { ok: false, reason: 'CIRCULAR', path: cycle }
  return { ok: true, version: saveBomNewVersion(id, data, meta).version }
}
