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
import { billOfMaterials, updateBillOfMaterials, type BillOfMaterials } from './billOfMaterials'
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

/** A BOM can be edited only when no active work order relies on its recipe. */
export function canEditBom(id: string): boolean {
  return activeWorkOrdersForBom(id) === 0
}

/** Edit a BOM, refusing while an active work order still depends on it. */
export function updateBillOfMaterialsSafe(
  id: string,
  data: Omit<BillOfMaterials, 'id' | 'number'>,
): GuardResult {
  if (!billOfMaterials.some((b) => b.id === id)) return { ok: false, reason: 'NOT_FOUND' }
  const active = activeWorkOrdersForBom(id)
  if (active > 0) {
    return { ok: false, reason: `BOM_IN_USE: ${active} active work order(s) depend on this BOM` }
  }
  updateBillOfMaterials(id, data)
  return { ok: true }
}
