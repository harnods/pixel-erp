import { reactive } from 'vue'
import { TODAY } from './master'
import { billOfMaterials } from './billOfMaterials'
import type { SubconScope, SubconSplit, SubconMethod } from './subcon'
import { loadSnapshot, saveSnapshot } from './persist'

/**
 * A manufacturing work order (Production → Work orders). Produces (Assembly) or
 * breaks down (Disassembly) a BOM's output. Every work order references a real
 * {@link BillOfMaterials} record via `bomId` — a work order cannot exist without
 * an already-created BOM. Child work orders reference a parent via `parentNumber`.
 */
export interface WorkOrder {
  id: string
  /** work order number, e.g. WO-2026-0001 */
  number: string
  /** the bill of materials this WO builds/breaks down */
  bomId: string
  /** bill of materials name — denormalized for display/sort, mirrors billOfMaterials.find(bomId).name */
  bomName: string
  /** Standard = made-to-stock · Order = made-to-order (tied to a sales order) ·
   *  Subcontracting = the work itself is performed by an outside vendor */
  category: 'Standard' | 'Order' | 'Subcontracting'
  /** Assembly = build the output · Disassembly = break the output into components */
  type: 'Assembly' | 'Disassembly'
  /** whether the WO follows a defined routing (sequence of operations) */
  trackRouting: boolean
  /** not started · canceled · in progress · partially produced · partially completed · completed */
  status: WorkOrderStatus
  /** parent WO number when this is a sub-assembly, else undefined */
  parentNumber?: string
  /** units produced so far */
  producedQty: number
  /** total units planned */
  plannedQty: number
  /** ISO planned start date */
  planStartDate: string
  /** ISO planned end date */
  planEndDate: string
  /** ISO actual start date (present once work has begun) */
  startDate?: string
  /** ISO actual end/close date (present once the WO is closed or canceled) */
  endDate?: string
  /** production request this WO was raised from, if any (Create work order from PR) */
  sourceProductionRequestNo?: string
  /**
   * Batch/serial units reserved for this work order's raw materials, picked at
   * creation time (New work order → Raw materials → Manage batch/serial
   * number). Keyed by productId; only tracked (batch- or serial-managed)
   * materials get an entry. The Material consume & return flow pre-fills its
   * own pick drawer from whatever of this reservation hasn't been consumed
   * yet, and the "Complete work order" guard uses it to show what's still
   * reserved but unconsumed.
   */
  materialReservations?: Record<string, WorkOrderMaterialReservation>
  /**
   * Warehouse each component is drawn from, keyed by productId — set per line on
   * the work order form. A subcon transfer takes its ORIGIN from here rather than
   * asking again: the components already say where they come from.
   */
  componentWarehouses?: Record<string, { id: string; name: string }>
  /** Present only on a `Subcontracting` work order — the vendor setup that decides
   *  which purchase requests, transfers and receipts the work order raises. */
  subcon?: WorkOrderSubconSetup
}

/** The subcon configuration carried on a Subcontracting work order. */
export interface WorkOrderSubconSetup {
  scope: SubconScope
  split: SubconSplit
  method: SubconMethod
  vendorId: string
  vendorName: string
  /** ISO date the vendor promised the goods back. */
  promisedDate: string
  /**
   * Warehouse the components are transferred OUT of. Only meaningful for
   * `resupply` — on `basic` the vendor uses its own stock and on `dropship` a
   * third party ships direct, so no company warehouse is involved either way.
   */
  sourceWarehouseId?: string
  sourceWarehouseName?: string
  /** The vendor's own location the transfer is addressed to — resupply only. */
  subconWarehouseId?: string
  subconWarehouseName?: string
  /** Warehouse the vendor's output is received back INTO. Always required. */
  receivingWarehouseId: string
  receivingWarehouseName: string
  /** Subcon order this work order is tied to, once it has been raised. */
  subconOrderNumber?: string
  /**
   * Documents actually raised from this work order, so its Documents table can
   * link straight to each one instead of only offering to create it again.
   */
  raisedDocuments?: RaisedSubconDocument[]
  /**
   * A deliberate reduction of the finished-good quantity, so a work order the
   * vendor under-delivered can still be closed. Recorded rather than applied
   * silently — the gap between what was ordered and what was accepted is the
   * whole point of keeping it.
   */
  qtyAdjustment?: { from: number; to: number; reason: string; date: string }
}

/** A document created from a subcon work order, and where its detail page lives. */
export interface RaisedSubconDocument {
  /** Matches SubconDocKind — which planned step this satisfied. */
  kind: string
  /** Record id, for the detail route. */
  id: string
  /** Display number, e.g. "Purchase Request #90042". */
  number: string
  /** Route prefix the detail page lives under. */
  route: string
  /** ISO date the document was raised. Absent on records created before the
   *  Documents tab started listing dates — rendered as "—" in that case. */
  raisedAt?: string
}

export interface WorkOrderMaterialReservation {
  /** Warehouse the reservation was picked from — needed to look the units back up later. */
  warehouseId?: string
  batchSelection?: { batchNo: string; qty: number }[]
  serialSelection?: string[]
}

export type WorkOrderStatus =
  | 'not started'
  | 'canceled'
  | 'in progress'
  | 'partially produced'
  | 'partially completed'
  | 'completed'

function isoOffset(days: number): string {
  const d = new Date(TODAY)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/** BOM id for seed row i — cycles through the real BOM catalog (never a fake name). */
function seedBomId(i: number): string {
  return billOfMaterials[i % billOfMaterials.length]!.id
}
function seedBomName(i: number): string {
  return billOfMaterials[i % billOfMaterials.length]!.name
}

// Seed rows: 4 per status so every badge + column rule is represented.
// startDate is hidden by the page for "not started" / "canceled";
// endDate is hidden for "not started" / "in progress" / "partially produced".
const SEED: Array<Omit<WorkOrder, 'id' | 'number' | 'bomId' | 'bomName'> & { bomIndex: number }> = [
  // ── not started ──────────────────────────────────────────────────────────
  { bomIndex: 0, category: 'Standard', type: 'Assembly',    trackRouting: true,  status: 'not started', producedQty: 0,   plannedQty: 500, planStartDate: isoOffset(2),  planEndDate: isoOffset(6) },
  { bomIndex: 1, category: 'Order',    type: 'Assembly',    trackRouting: false, status: 'not started', producedQty: 0,   plannedQty: 120, planStartDate: isoOffset(3),  planEndDate: isoOffset(5) },
  { bomIndex: 2, category: 'Order',    type: 'Assembly',    trackRouting: true,  status: 'not started', producedQty: 0,   plannedQty: 80,  planStartDate: isoOffset(1),  planEndDate: isoOffset(4), parentNumber: 'WO-2026-0001' },
  { bomIndex: 3, category: 'Standard', type: 'Disassembly', trackRouting: false, status: 'not started', producedQty: 0,   plannedQty: 300, planStartDate: isoOffset(5),  planEndDate: isoOffset(9) },

  // ── in progress ──────────────────────────────────────────────────────────
  { bomIndex: 4, category: 'Standard', type: 'Assembly',    trackRouting: true,  status: 'in progress', producedQty: 140, plannedQty: 400, planStartDate: isoOffset(-2), planEndDate: isoOffset(3),  startDate: isoOffset(-2) },
  { bomIndex: 5, category: 'Order',    type: 'Assembly',    trackRouting: false, status: 'in progress', producedQty: 60,  plannedQty: 200, planStartDate: isoOffset(-1), planEndDate: isoOffset(4),  startDate: isoOffset(-1) },
  { bomIndex: 6, category: 'Standard', type: 'Assembly',    trackRouting: true,  status: 'in progress', producedQty: 25,  plannedQty: 150, planStartDate: isoOffset(-3), planEndDate: isoOffset(2),  startDate: isoOffset(-3), parentNumber: 'WO-2026-0005' },
  { bomIndex: 7, category: 'Order',    type: 'Disassembly', trackRouting: false, status: 'in progress', producedQty: 8,   plannedQty: 40,  planStartDate: isoOffset(0),  planEndDate: isoOffset(5),  startDate: isoOffset(0) },

  // ── partially produced ───────────────────────────────────────────────────
  { bomIndex: 8, category: 'Standard', type: 'Assembly',    trackRouting: true,  status: 'partially produced', producedQty: 220, plannedQty: 350, planStartDate: isoOffset(-5), planEndDate: isoOffset(1),  startDate: isoOffset(-5) },
  { bomIndex: 9, category: 'Order',    type: 'Assembly',    trackRouting: false, status: 'partially produced', producedQty: 90,  plannedQty: 160, planStartDate: isoOffset(-4), planEndDate: isoOffset(0),  startDate: isoOffset(-4) },
  { bomIndex: 0, category: 'Standard', type: 'Assembly',    trackRouting: true,  status: 'partially produced', producedQty: 45,  plannedQty: 100, planStartDate: isoOffset(-6), planEndDate: isoOffset(-1), startDate: isoOffset(-6), parentNumber: 'WO-2026-0009' },
  { bomIndex: 1, category: 'Order',    type: 'Disassembly', trackRouting: false, status: 'partially produced', producedQty: 18,  plannedQty: 60,  planStartDate: isoOffset(-3), planEndDate: isoOffset(2),  startDate: isoOffset(-3) },

  // ── partially completed ──────────────────────────────────────────────────
  { bomIndex: 0, category: 'Standard', type: 'Assembly',    trackRouting: true,  status: 'partially completed', producedQty: 470, plannedQty: 500, planStartDate: isoOffset(-9), planEndDate: isoOffset(-2), startDate: isoOffset(-9), endDate: isoOffset(-1) },
  { bomIndex: 2, category: 'Order',    type: 'Assembly',    trackRouting: false, status: 'partially completed', producedQty: 74,  plannedQty: 80,  planStartDate: isoOffset(-8), planEndDate: isoOffset(-3), startDate: isoOffset(-8), endDate: isoOffset(-2) },
  { bomIndex: 4, category: 'Standard', type: 'Assembly',    trackRouting: true,  status: 'partially completed', producedQty: 380, plannedQty: 400, planStartDate: isoOffset(-10), planEndDate: isoOffset(-4), startDate: isoOffset(-10), endDate: isoOffset(-3), parentNumber: 'WO-2026-0013' },
  { bomIndex: 6, category: 'Order',    type: 'Disassembly', trackRouting: false, status: 'partially completed', producedQty: 130, plannedQty: 150, planStartDate: isoOffset(-7), planEndDate: isoOffset(-2), startDate: isoOffset(-7), endDate: isoOffset(-1) },

  // ── completed ────────────────────────────────────────────────────────────
  { bomIndex: 1, category: 'Standard', type: 'Assembly',    trackRouting: true,  status: 'completed', producedQty: 120, plannedQty: 120, planStartDate: isoOffset(-14), planEndDate: isoOffset(-9),  startDate: isoOffset(-14), endDate: isoOffset(-9) },
  { bomIndex: 3, category: 'Order',    type: 'Assembly',    trackRouting: false, status: 'completed', producedQty: 300, plannedQty: 300, planStartDate: isoOffset(-16), planEndDate: isoOffset(-11), startDate: isoOffset(-16), endDate: isoOffset(-10) },
  { bomIndex: 5, category: 'Standard', type: 'Assembly',    trackRouting: true,  status: 'completed', producedQty: 200, plannedQty: 200, planStartDate: isoOffset(-13), planEndDate: isoOffset(-8),  startDate: isoOffset(-13), endDate: isoOffset(-8), parentNumber: 'WO-2026-0017' },
  { bomIndex: 7, category: 'Order',    type: 'Disassembly', trackRouting: false, status: 'completed', producedQty: 40,  plannedQty: 40,  planStartDate: isoOffset(-12), planEndDate: isoOffset(-7),  startDate: isoOffset(-12), endDate: isoOffset(-7) },

  // ── canceled ─────────────────────────────────────────────────────────────
  { bomIndex: 8, category: 'Standard', type: 'Assembly',    trackRouting: true,  status: 'canceled', producedQty: 0, plannedQty: 350, planStartDate: isoOffset(-6), planEndDate: isoOffset(-1), endDate: isoOffset(-4) },
  { bomIndex: 0, category: 'Order',    type: 'Assembly',    trackRouting: false, status: 'canceled', producedQty: 0, plannedQty: 100, planStartDate: isoOffset(-5), planEndDate: isoOffset(0),  endDate: isoOffset(-3) },
  { bomIndex: 1, category: 'Standard', type: 'Disassembly', trackRouting: true, status: 'canceled', producedQty: 0, plannedQty: 60,  planStartDate: isoOffset(-4), planEndDate: isoOffset(1),  endDate: isoOffset(-2), parentNumber: 'WO-2026-0021' },
  { bomIndex: 9, category: 'Order',    type: 'Assembly',    trackRouting: false, status: 'canceled', producedQty: 0, plannedQty: 160, planStartDate: isoOffset(-3), planEndDate: isoOffset(2),  endDate: isoOffset(-1) },

  // ── Subcontracting ───────────────────────────────────────────────────────
  // Two rows so the Subcontracting section is demonstrable in both its states:
  // a draft (supply documents still blocked) and a started order (raisable).
  {
    bomIndex: 0, category: 'Subcontracting', type: 'Assembly', trackRouting: false,
    status: 'not started', producedQty: 0, plannedQty: 500,
    planStartDate: isoOffset(1), planEndDate: isoOffset(14),
    subcon: {
      scope: 'finished-good', split: 'full', method: 'resupply',
      vendorId: 'sv-01', vendorName: 'PT Roastery Nusantara Mandiri',
      promisedDate: isoOffset(20),
      sourceWarehouseId: 'wh-001', sourceWarehouseName: 'Gudang Jakarta Pusat',
      subconWarehouseId: 'wh-sub-01', subconWarehouseName: 'WH Subcon · PT Roastery Nusantara Mandiri',
      receivingWarehouseId: 'wh-005', receivingWarehouseName: 'Gudang Semarang Industrial',
    },
  },
  {
    bomIndex: 2, category: 'Subcontracting', type: 'Assembly', trackRouting: false,
    status: 'in progress', producedQty: 180, plannedQty: 300,
    planStartDate: isoOffset(-6), planEndDate: isoOffset(4), startDate: isoOffset(-6),
    subcon: {
      scope: 'component', split: 'partial', method: 'dropship',
      vendorId: 'sv-03', vendorName: 'PT Java Roasting Works',
      promisedDate: isoOffset(6),
      // Dropship — a third party ships direct, so there is no source warehouse.
      receivingWarehouseId: 'wh-005', receivingWarehouseName: 'Gudang Semarang Industrial',
      subconOrderNumber: 'SC-2026-0004',
    },
  },
]

function buildSeed(): WorkOrder[] {
  return SEED.map(({ bomIndex, ...wo }, i) => ({
    ...wo,
    id: `wo-${i + 1}`,
    number: `WO-2026-${String(i + 1).padStart(4, '0')}`,
    bomId: seedBomId(bomIndex),
    bomName: seedBomName(bomIndex),
  }))
}

// Persisted as a full snapshot (seed + user-created) — mirrors outgoing.ts.
const workOrderSnapshot = loadSnapshot<WorkOrder>('workOrders-v2')
export const workOrders = reactive<WorkOrder[]>(workOrderSnapshot ?? buildSeed())

/** Persist the work-order snapshot (call after any mutation). */
export function persistWorkOrders(): void {
  saveSnapshot('workOrders-v2', workOrders)
}

let woAddSeq = workOrders.length
const WO_NO_RE = /^WO-2026-(\d+)$/
function nextWorkOrderNumber(): string {
  let max = 0
  for (const wo of workOrders) {
    const m = wo.number.match(WO_NO_RE)
    if (m) max = Math.max(max, parseInt(m[1]!, 10))
  }
  return `WO-2026-${String(max + 1).padStart(4, '0')}`
}

/**
 * Record a document raised from a subcon work order. Called by the purchase
 * request and warehouse transfer forms once the record actually exists, so the
 * work order can link to it. Re-raising the same step appends rather than
 * replaces — a chain can legitimately have two receipts, or a re-issued PR.
 */
export function recordSubconDocument(workOrderId: string, doc: RaisedSubconDocument): void {
  const wo = workOrders.find(w => w.id === workOrderId)
  if (!wo?.subcon) return
  const existing = wo.subcon.raisedDocuments ?? []
  if (existing.some(d => d.id === doc.id)) return
  wo.subcon.raisedDocuments = [...existing, { raisedAt: new Date().toISOString().slice(0, 10), ...doc }]
  persistWorkOrders()
}

/**
 * The work order a document was raised from, found by that document's id. Lets a
 * downstream form (purchase order, purchase delivery) rediscover the work order
 * from its own parent document, so the link does not have to be threaded through
 * every query string in the chain.
 */
export function workOrderForDocument(documentId: string): WorkOrder | undefined {
  return workOrders.find(w => (w.subcon?.raisedDocuments ?? []).some(d => d.id === documentId))
}

/**
 * Record finished goods produced by a vendor delivery. Each delivery adds to the
 * work order's produced quantity; the order stays `partially produced` until the
 * total reaches what was planned, so several deliveries can close it out
 * together.
 */
export function recordSubconProduction(workOrderId: string, qty: number): void {
  const wo = workOrders.find(w => w.id === workOrderId)
  if (!wo || qty <= 0) return
  wo.producedQty = Math.min(wo.plannedQty, wo.producedQty + qty)
  if (wo.status === 'not started' || wo.status === 'in progress' || wo.status === 'partially produced') {
    wo.status = wo.producedQty >= wo.plannedQty ? 'partially completed' : 'partially produced'
  }
  persistWorkOrders()
}

/**
 * Reduce a work order's finished-good quantity to what was actually produced, so
 * a short delivery can be completed without pretending the rest arrived. The
 * original figure is kept alongside the reason.
 */
export function adjustSubconWorkOrderQty(workOrderId: string, newQty: number, reason: string): void {
  const wo = workOrders.find(w => w.id === workOrderId)
  if (!wo?.subcon || newQty <= 0 || newQty > wo.plannedQty) return
  wo.subcon.qtyAdjustment = {
    from: wo.plannedQty,
    to: newQty,
    reason,
    date: new Date().toISOString().slice(0, 10),
  }
  wo.plannedQty = newQty
  persistWorkOrders()
}

/** Create a new work order from the New work order form — must reference an existing BOM. */
export function addWorkOrder(data: Omit<WorkOrder, 'id' | 'number'>): WorkOrder {
  const n = woAddSeq++
  const wo: WorkOrder = {
    ...data,
    id: `wo-new-${n}`,
    number: nextWorkOrderNumber(),
  }
  workOrders.unshift(wo)
  persistWorkOrders()
  return wo
}
