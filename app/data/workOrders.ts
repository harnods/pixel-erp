import { reactive } from 'vue'
import { TODAY } from './master'
import { billOfMaterials, bomAtVersion, resolveSubBomPins, type BillOfMaterials } from './billOfMaterials'
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
  /**
   * The BOM version this work order was created from — the pin. It never moves:
   * when the BOM is upgraded, this work order keeps building its version, and only
   * work orders created afterwards use the new one.
   */
  bomVersion: number
  /**
   * Multi-level pin (resolve-at-WO): every sub-BOM under the pinned version,
   * resolved to its Active version when this work order was created — keyed by
   * sub-BOM id. Like `bomVersion`, it never moves.
   */
  subBomPins?: Record<string, number>
  /** Created before BOM versioning existed — no reliable pin, so no drift indicator. */
  preVersioning?: boolean
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
]

function buildSeed(): WorkOrder[] {
  return SEED.map(({ bomIndex, ...wo }, i) => ({
    ...wo,
    id: `wo-${i + 1}`,
    number: `WO-2026-${String(i + 1).padStart(4, '0')}`,
    bomId: seedBomId(bomIndex),
    bomName: seedBomName(bomIndex),
    bomVersion: 1,
    // Seed work orders predate every sub-BOM upgrade — each level was v1 then.
    subBomPins: resolveSubBomPins({ ...bomAtVersion(billOfMaterials.find(b => b.id === seedBomId(bomIndex)), 1)!, id: seedBomId(bomIndex) }, () => 1),
    // One completed order is from before versioning — shown as "pre-versioning".
    ...(i === 16 ? { preVersioning: true } : {}),
  }))
}

// Persisted as a full snapshot (seed + user-created) — mirrors outgoing.ts.
// Key bumped for the multi-level pins (subBomPins) + pre-versioning demo row.
const workOrderSnapshot = loadSnapshot<WorkOrder>('workOrders-v2')
// Work orders saved before versioning existed were built from v1.
export const workOrders = reactive<WorkOrder[]>((workOrderSnapshot ?? buildSeed()).map(w => ({ ...w, bomVersion: w.bomVersion ?? 1, ...(w.bomVersion === undefined ? { preVersioning: true } : {}) })))

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

/** Create a new work order from the New work order form — must reference an existing BOM.
 *  It is pinned to the BOM's Active version at this moment, and every sub-BOM level
 *  resolves to its own Active version and is pinned too (resolve-at-WO). A version
 *  saved later never reaches this work order — only work orders created after it. */
export function addWorkOrder(data: Omit<WorkOrder, 'id' | 'number' | 'bomVersion' | 'subBomPins' | 'preVersioning'>): WorkOrder {
  const bom = billOfMaterials.find(b => b.id === data.bomId)
  const n = woAddSeq++
  const { preVersioning: _legacy, subBomPins: _pins, ...rest } = data as WorkOrder
  const wo: WorkOrder = {
    ...rest,
    bomVersion: bom?.version ?? 1,
    subBomPins: bom ? resolveSubBomPins(bom) : {},
    id: `wo-new-${n}`,
    number: nextWorkOrderNumber(),
  }
  workOrders.unshift(wo)
  persistWorkOrders()
  return wo
}

/** The BOM exactly as this work order was built from — its pinned version, not the current one. */
export function bomForWorkOrder(wo: Pick<WorkOrder, 'bomId' | 'bomVersion'>): BillOfMaterials | undefined {
  return bomAtVersion(billOfMaterials.find(b => b.id === wo.bomId), wo.bomVersion)
}

/** Work orders pinned to one version of a BOM (any status — a reference locks the version for good). */
export function workOrdersOnBomVersion(bomId: string, version: number): WorkOrder[] {
  return workOrders.filter(w => w.bomId === bomId && w.bomVersion === version)
}

/** Closed work orders never show drift — their as-built is final. */
export function workOrderClosed(wo: Pick<WorkOrder, 'status'>): boolean {
  return wo.status === 'completed' || wo.status === 'canceled'
}
/**
 * Drift (V-06): the BOM's Active version is newer than this work order's pin.
 * Neutral and informational — never blocking. None on closed or pre-versioning WOs.
 */
export function workOrderDrift(wo: WorkOrder): number | undefined {
  if (wo.preVersioning || workOrderClosed(wo)) return undefined
  const b = billOfMaterials.find(x => x.id === wo.bomId)
  return b && b.version > wo.bomVersion ? b.version : undefined
}
/** Sub-BOM levels whose Active version moved past this work order's pin. */
export function workOrderSubDrift(wo: WorkOrder): { bom: BillOfMaterials; pinned: number; active: number }[] {
  if (wo.preVersioning || workOrderClosed(wo)) return []
  return Object.entries(wo.subBomPins ?? {}).flatMap(([id, pinned]) => {
    const b = billOfMaterials.find(x => x.id === id)
    return b && b.version > pinned ? [{ bom: b, pinned, active: b.version }] : []
  })
}
