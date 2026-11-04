import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'

/**
 * Stock reservation (PRD §7, Story 10) — earmarks physical stock to a work
 * package: reserved → picked → issued, plus release. This is the half of the
 * wrong-job problem pegging can't solve. A reservation never posts to the GL
 * and is never part of the committed-cost pool.
 *
 * Contention is informational: a higher-priority project may REQUEST a release;
 * a human decides. Nothing is auto-bumped.
 */

export interface StockItem {
  id: string
  name: string
  unit: string
  onHand: number
  warehouse: string
  unitCost: number
}

export type ReservationStatus = 'reserved' | 'picked' | 'issued' | 'released'

export interface Reservation {
  id: string
  itemId: string
  projectId: string
  wpId: string
  qty: number
  status: ReservationStatus
  createdAt: string
  source: 'MRP run' | 'Manual'
  releasedAt?: string
  releaseReason?: string
}

export interface ReleaseRequest {
  id: string
  itemId: string
  /** project holding the reservation */
  fromProjectId: string
  fromReservationId: string
  /** project asking for the stock */
  toProjectId: string
  toWpId: string
  qty: number
  reason: string
  requestedBy: string
  requestedAt: string
  status: 'pending' | 'approved' | 'rejected'
}

const SEED_ITEMS: StockItem[] = [
  { id: 'si-1', name: 'Multiplek 18 mm', unit: 'Lembar', onHand: 260, warehouse: 'Workshop Cileungsi', unitCost: 285_000 },
  { id: 'si-2', name: 'HPL motif walnut', unit: 'Lembar', onHand: 120, warehouse: 'Workshop Cileungsi', unitCost: 210_000 },
  { id: 'si-3', name: 'Rangka besi hollow', unit: 'Set', onHand: 70, warehouse: 'Workshop Cileungsi', unitCost: 320_000 },
  { id: 'si-4', name: 'Edging PVC 2 mm', unit: 'Meter', onHand: 900, warehouse: 'Workshop Cileungsi', unitCost: 6_500 },
  { id: 'si-5', name: 'Aksesoris (baut, engsel)', unit: 'Set', onHand: 150, warehouse: 'Workshop Cileungsi', unitCost: 45_000 },
  { id: 'si-6', name: 'Rel laci & engsel soft-close', unit: 'Set', onHand: 40, warehouse: 'Workshop Cileungsi', unitCost: 480_000 },
  { id: 'si-7', name: 'Top table granit', unit: 'Set', onHand: 4, warehouse: 'Workshop Cileungsi', unitCost: 3_200_000 },
  { id: 'si-8', name: 'Top table solid surface', unit: 'Set', onHand: 8, warehouse: 'Workshop Cileungsi', unitCost: 3_650_000 },
  { id: 'si-9', name: 'Plat aluminium 2 mm', unit: 'Lembar', onHand: 60, warehouse: 'Gudang Utama Bekasi', unitCost: 1_450_000 },
  { id: 'si-10', name: 'Hollow aluminium 40×40', unit: 'Batang', onHand: 120, warehouse: 'Gudang Utama Bekasi', unitCost: 310_000 },
]

const SEED_RES: Reservation[] = [
  { id: 'rs-1', itemId: 'si-1', projectId: 'ps-2603', wpId: 'wp-2603-31', qty: 84, status: 'reserved', createdAt: '2026-06-22', source: 'MRP run' },
  { id: 'rs-2', itemId: 'si-2', projectId: 'ps-2603', wpId: 'wp-2603-31', qty: 56, status: 'reserved', createdAt: '2026-06-22', source: 'MRP run' },
  { id: 'rs-3', itemId: 'si-3', projectId: 'ps-2603', wpId: 'wp-2603-31', qty: 56, status: 'picked', createdAt: '2026-06-22', source: 'MRP run' },
  { id: 'rs-4', itemId: 'si-1', projectId: 'ps-2603', wpId: 'wp-2603-32', qty: 60, status: 'issued', createdAt: '2026-06-15', source: 'MRP run' },
  { id: 'rs-5', itemId: 'si-6', projectId: 'ps-2603', wpId: 'wp-2603-32', qty: 12, status: 'reserved', createdAt: '2026-06-15', source: 'MRP run' },
  { id: 'rs-6', itemId: 'si-1', projectId: 'ps-2606', wpId: 'wp-2606-11', qty: 90, status: 'reserved', createdAt: '2026-06-20', source: 'MRP run' },
  { id: 'rs-7', itemId: 'si-2', projectId: 'ps-2606', wpId: 'wp-2606-11', qty: 54, status: 'reserved', createdAt: '2026-06-20', source: 'MRP run' },
  { id: 'rs-8', itemId: 'si-8', projectId: 'ps-2606', wpId: 'wp-2606-11', qty: 8, status: 'reserved', createdAt: '2026-06-20', source: 'MRP run' },
  { id: 'rs-9', itemId: 'si-6', projectId: 'ps-2606', wpId: 'wp-2606-12', qty: 12, status: 'reserved', createdAt: '2026-05-19', source: 'MRP run' },
  { id: 'rs-10', itemId: 'si-2', projectId: 'ps-2606', wpId: 'wp-2606-11', qty: 6, status: 'released', createdAt: '2026-04-28', source: 'MRP run', releasedAt: '2026-06-19', releaseReason: 'WO-PS-0004 completed — unconsumed' },
]

const SEED_REQ: ReleaseRequest[] = [
  { id: 'rr-1', itemId: 'si-2', fromProjectId: 'ps-2606', fromReservationId: 'rs-7', toProjectId: 'ps-2603', toWpId: 'wp-2603-31', qty: 10, reason: 'WO-PS-0002 starts Monday; HPL delivery from vendor slipped 2 weeks. PS-2606 tipe A does not need it until mid-July.', requestedBy: 'Rizal Candra', requestedAt: '2026-06-25', status: 'pending' },
]

const K_I = 'pm-stock-items', K_R = 'pm-reservations', K_Q = 'pm-release-requests'
export const stockItems = reactive<StockItem[]>(loadSnapshot<StockItem>(K_I) ?? structuredClone(SEED_ITEMS))
export const reservations = reactive<Reservation[]>(loadSnapshot<Reservation>(K_R) ?? structuredClone(SEED_RES))
export const releaseRequests = reactive<ReleaseRequest[]>(loadSnapshot<ReleaseRequest>(K_Q) ?? structuredClone(SEED_REQ))
export function persistReservations(): void {
  saveSnapshot(K_I, stockItems)
  saveSnapshot(K_R, reservations)
  saveSnapshot(K_Q, releaseRequests)
}

export function getStockItem(id: string) { return stockItems.find(i => i.id === id) }
export function stockItemByName(name: string) { return stockItems.find(i => i.name === name) }

/** reserved + picked hold stock; issued has left on-hand; released frees it */
function holds(r: Reservation) { return r.status === 'reserved' || r.status === 'picked' }

export function reservedQty(itemId: string, opts: { excludeProjectId?: string } = {}): number {
  return reservations.filter(r => r.itemId === itemId && holds(r) && r.projectId !== opts.excludeProjectId).reduce((s, r) => s + r.qty, 0)
}
export function availableQty(itemId: string): number {
  const i = getStockItem(itemId)
  return (i?.onHand ?? 0) - reservedQty(itemId)
}
/** Available to one project = on hand − reserved to OTHER projects (MRP netting basis). */
export function availableForProject(itemId: string, projectId: string): number {
  const i = getStockItem(itemId)
  return (i?.onHand ?? 0) - reservedQty(itemId, { excludeProjectId: projectId })
}
export function reservedByProject(itemId: string) {
  const m = new Map<string, number>()
  for (const r of reservations.filter(x => x.itemId === itemId && holds(x))) m.set(r.projectId, (m.get(r.projectId) ?? 0) + r.qty)
  return m
}
export function projectReservations(projectId: string) {
  return reservations.filter(r => r.projectId === projectId)
}
export function wpReservedQty(wpId: string, itemId: string): number {
  return reservations.filter(r => r.wpId === wpId && r.itemId === itemId && holds(r)).reduce((s, r) => s + r.qty, 0)
}
