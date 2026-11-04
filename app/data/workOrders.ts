import { reactive } from 'vue'
import type { BatchAttributeValues } from './batchAttributes'
import { TODAY } from './master'
import { billOfMaterials, type BomProductionCost, type BomRoutingStep } from './billOfMaterials'
import { loadSnapshot, saveSnapshot } from './persist'
import type { WorkOrderAdjustment } from './workOrderAdjustment'
import type { ReservationMethod } from './productionSettings'

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
  /** Standard = made-to-stock · Order = made-to-order (tied to a sales order) */
  category: 'Standard' | 'Order'
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
   * The raw materials this work order was CREATED with — the rows on New work order
   * › Raw materials, as the user left them. The BOM only seeds that form: when it
   * allows adjustment the user can add, remove or re-quantify components and pick a
   * warehouse per row, so the BOM is not this work order's material list.
   *
   * Absent on work orders created before this was stored (and on the seed), which
   * fall back to their BOM — see {@link workOrderRawMaterials}. Read it through that
   * helper, never directly.
   */
  rawMaterials?: WorkOrderRawMaterial[]
  /**
   * Production cost lines as created — same story as {@link WorkOrder.rawMaterials}:
   * the BOM seeds the form, the user may change it. Read through
   * {@link workOrderProductionCost}.
   */
  productionCost?: WorkOrderCostLine[]
  /** Routing steps as created. Read through {@link workOrderRouting}. */
  routing?: WorkOrderRoutingStep[]
  /**
   * UC-00 S-0 — the reservation setting in force when this work order was CREATED.
   * It keeps it for its whole life (PRD v0.6, "changes apply forward only"):
   * switching reservation on raises nothing for existing work orders, and switching
   * it off releases nothing on ones already running under it. Absent on the seed,
   * whose work orders all carry stock requests — read through `woReservation`.
   */
  reservation?: { on: boolean; method: ReservationMethod }
  /**
   * Work order approval (MVP) — material is RESERVED only when the work order starts (or
   * its Start request is approved). Until then the picks made on the create form are held
   * here, unreserved; startWorkOrder() moves them into materialReservations.
   */
  reservationPlan?: Record<string, WorkOrderMaterialReservation>
  /**
   * Work order approval (grooming 2026-10-09) — the reason given on the latest Adjust or
   * Cancel/close, shown in a notice on the detail page. `requestId` is set when it went
   * through approval; it's cleared if that request is rejected or canceled.
   */
  actionReason?: WorkOrderActionReason
  /**
   * Actual dates per routing step, keyed by the step's index in the BOM's routing
   * (Track routing page). Status is derived from these — see workOrderRouting.ts.
   */
  routingProgress?: Record<string, WorkOrderRoutingProgress>
  /** Field differences from Adjust work order; overrides the BOM's lines for this work order. */
  adjustment?: WorkOrderAdjustment
}

export interface WorkOrderRoutingProgress {
  startDate?: string
  endDate?: string
}



export interface WorkOrderActionReason {
  type: 'adjustment' | 'cancel'
  reason: string
  by: string
  /** ISO timestamp */
  at: string
  requestId?: string
}


/**
 * One production cost line of a work order. `group` places it under Labor /
 * Overhead / Other on the work order page; the form itself is a flat list.
 */
export interface WorkOrderCostLine {
  group: BomProductionCost['group']
  account: string
  costDriver: string
  unitCost: number
  multiplier: number
}

/** One routing step of a work order — same fields as the BOM's. */
export type WorkOrderRoutingStep = BomRoutingStep

/** One raw-material row of a work order, as created. */
export interface WorkOrderRawMaterial {
  productId: string
  /** qty needed at creation; a later Edit / Adjust lives on the stock request */
  needed: number
  unit: string
  purchaseCost: number
  /** warehouse the material is drawn from — also the stock request line's destination */
  warehouseId?: string
  /** ISO date the material is required on the floor */
  requiredDate?: string
}

/**
 * A work order's raw materials: what it was created with, or — for work orders
 * that predate storing that — its BOM's. Every surface that lists a work order's
 * materials goes through here, so the work order page, the material consume /
 * return form and the stock request can't disagree about what the job uses.
 */
export function workOrderRawMaterials(wo: WorkOrder): WorkOrderRawMaterial[] {
  if (wo.rawMaterials) return wo.rawMaterials
  const bom = billOfMaterials.find(b => b.id === wo.bomId)
  return (bom?.rawMaterials ?? []).map(r => ({
    productId: r.productId,
    needed: r.needed,
    unit: r.unit,
    purchaseCost: r.purchaseCost,
  }))
}

/**
 * A work order's production cost lines: as created, or its BOM's for work orders
 * that predate storing them. A BOM line is one unit at multiplier 1.
 */
export function workOrderProductionCost(wo: WorkOrder): WorkOrderCostLine[] {
  if (wo.productionCost) return wo.productionCost
  const bom = billOfMaterials.find(b => b.id === wo.bomId)
  return (bom?.productionCost ?? []).map(c => ({
    group: c.group, account: c.account, costDriver: c.costDriver, unitCost: c.amount, multiplier: 1,
  }))
}

/** A work order's routing steps: as created, or its BOM's for older work orders. */
export function workOrderRouting(wo: WorkOrder): WorkOrderRoutingStep[] {
  if (wo.routing) return wo.routing
  return billOfMaterials.find(b => b.id === wo.bomId)?.routing.map(r => ({ ...r })) ?? []
}

export interface WorkOrderMaterialReservation {
  /** Warehouse the reservation was picked from — needed to look the units back up later. */
  warehouseId?: string
  batchSelection?: { batchNo: string; qty: number; attributes?: BatchAttributeValues }[]
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

  // ── more open work ───────────────────────────────────────────────────────
  // Six further ACTIVE orders, weighted towards the blends. The stock requests
  // they raise are what give the Stock requests By product view its depth: a
  // component row expands to the open transactions needing it, so that number
  // can only grow by there being more open transactions that share components.
  { bomIndex: 0, category: 'Standard', type: 'Assembly',    trackRouting: true,  status: 'not started', producedQty: 0,  plannedQty: 450, planStartDate: isoOffset(4),  planEndDate: isoOffset(9) },
  { bomIndex: 2, category: 'Order',    type: 'Assembly',    trackRouting: false, status: 'not started', producedQty: 0,  plannedQty: 90,  planStartDate: isoOffset(6),  planEndDate: isoOffset(11) },
  { bomIndex: 3, category: 'Standard', type: 'Assembly',    trackRouting: true,  status: 'in progress', producedQty: 55, plannedQty: 280, planStartDate: isoOffset(-1), planEndDate: isoOffset(6), startDate: isoOffset(-1) },
  { bomIndex: 9, category: 'Order',    type: 'Assembly',    trackRouting: false, status: 'in progress', producedQty: 12, plannedQty: 70,  planStartDate: isoOffset(-2), planEndDate: isoOffset(5), startDate: isoOffset(-2) },
  { bomIndex: 7, category: 'Order',    type: 'Assembly',    trackRouting: true,  status: 'not started', producedQty: 0,  plannedQty: 45,  planStartDate: isoOffset(7),  planEndDate: isoOffset(12) },
  { bomIndex: 4, category: 'Standard', type: 'Assembly',    trackRouting: false, status: 'partially produced', producedQty: 110, plannedQty: 260, planStartDate: isoOffset(-4), planEndDate: isoOffset(3), startDate: isoOffset(-4) },
  { bomIndex: 1, category: 'Order',    type: 'Assembly',    trackRouting: true,  status: 'not started', producedQty: 0,  plannedQty: 140, planStartDate: isoOffset(5),  planEndDate: isoOffset(10) },

  // ── more canceled work ───────────────────────────────────────────────────
  // Their requests are what fills the Stock requests Closed tab: cancelling a
  // work order leaves its request listed as Canceled (UC-09), and a tab with
  // three rows cannot be paged, sorted or filtered against.
  { bomIndex: 2, category: 'Standard', type: 'Assembly',    trackRouting: true,  status: 'canceled', producedQty: 0, plannedQty: 220, planStartDate: isoOffset(-7),  planEndDate: isoOffset(-2), endDate: isoOffset(-5) },
  { bomIndex: 4, category: 'Order',    type: 'Assembly',    trackRouting: false, status: 'canceled', producedQty: 0, plannedQty: 130, planStartDate: isoOffset(-9),  planEndDate: isoOffset(-3), endDate: isoOffset(-6) },
  { bomIndex: 6, category: 'Standard', type: 'Assembly',    trackRouting: true,  status: 'canceled', producedQty: 0, plannedQty: 75,  planStartDate: isoOffset(-10), planEndDate: isoOffset(-4), endDate: isoOffset(-7) },
  { bomIndex: 7, category: 'Order',    type: 'Assembly',    trackRouting: false, status: 'canceled', producedQty: 0, plannedQty: 50,  planStartDate: isoOffset(-12), planEndDate: isoOffset(-6), endDate: isoOffset(-8) },
  { bomIndex: 3, category: 'Standard', type: 'Disassembly', trackRouting: true,  status: 'canceled', producedQty: 0, plannedQty: 180, planStartDate: isoOffset(-13), planEndDate: isoOffset(-7), endDate: isoOffset(-9) },
  { bomIndex: 5, category: 'Order',    type: 'Assembly',    trackRouting: false, status: 'canceled', producedQty: 0, plannedQty: 95,  planStartDate: isoOffset(-15), planEndDate: isoOffset(-8), endDate: isoOffset(-10) },

  // ── work order approval (see woApproval.ts) ─────────────────────────────
  // wo-38: Start waiting for approval level 2 · wo-39: Start rejected at level 1.
  { bomIndex: 2, category: 'Standard', type: 'Assembly',    trackRouting: false, status: 'not started', producedQty: 0, plannedQty: 250, planStartDate: isoOffset(4),  planEndDate: isoOffset(8) },
  { bomIndex: 5, category: 'Standard', type: 'Assembly',    trackRouting: false, status: 'not started', producedQty: 0, plannedQty: 80,  planStartDate: isoOffset(3),  planEndDate: isoOffset(6) },
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
/** Versioned: a snapshot written before the six extra active orders would keep a
 *  returning machine on the old 24, and with them the thinner stock requests. */
const workOrderSnapshot = loadSnapshot<WorkOrder>('workOrders.v2')
export const workOrders = reactive<WorkOrder[]>(workOrderSnapshot ?? buildSeed())

/** Persist the work-order snapshot (call after any mutation). */
export function persistWorkOrders(): void {
  saveSnapshot('workOrders.v2', workOrders)
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

// Snapshots saved before work order approval shipped don't carry the approval seed
// rows (wo-38 / wo-39) the approval requests point at — append any that are missing,
// renumbered if a user-created work order already took that number.
if (workOrderSnapshot) {
  for (const seed of buildSeed().filter(s => s.id === 'wo-38' || s.id === 'wo-39')) {
    if (workOrders.some(w => w.id === seed.id)) continue
    if (workOrders.some(w => w.number === seed.number)) seed.number = nextWorkOrderNumber()
    workOrders.push(seed)
  }
  // Draft / Rejected were creation-approval statuses — creation is no longer gated.
  for (const w of workOrders) {
    const legacy = w.status as string
    if (legacy === 'draft' || legacy === 'rejected') w.status = 'not started'
  }
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
