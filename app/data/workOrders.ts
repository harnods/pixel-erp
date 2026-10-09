import { reactive } from 'vue'
import { TODAY } from './master'
import { billOfMaterials, catalogProduct } from './billOfMaterials'
import { warehouseTransfers } from './warehouseTransfers'
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
  /**
   * Whether the WO follows a defined routing (sequence of operations).
   *
   * Absent on a Subcontracting order rather than false: the routing being
   * followed is the vendor's, so the question does not apply. "No" would be an
   * answer to it; omitting the field says there was nothing to answer.
   */
  trackRouting?: boolean
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
  /**
   * Component planned quantities revised after the work order was created, by SKU.
   * Held here rather than edited into the BOM: the BOM is the recipe and is shared
   * by every work order built from it, while this is one order's own revision.
   */
  componentAdjustments?: Record<string, number>
  /**
   * Subcon charges agreed after the order was created — a finishing step the
   * vendor added, say. They behave exactly like the BOM's own cost lines from
   * the invoice onward, each with its own clearing account.
   */
  extraCostLines?: { id: string; name: string; costDriver: string; amount: number }[]
  /**
   * Cost line amounts revised on this order, by line id. Held here for the same
   * reason `componentAdjustments` is: the BOM is the shared recipe, and one
   * order's renegotiated price must not rewrite it for every other order.
   */
  costLineOverrides?: Record<string, number>
  /**
   * How much of each cost line has already been taken onto a partial production
   * record, by line id. What is left is what the next partial may still charge,
   * so several records cannot between them bill more than the order agreed.
   */
  costLineRecorded?: Record<string, number>
  /**
   * Components the vendor did not consume, returned with the run's output.
   *
   * They are an ADDITIONAL OUTPUT of the work order, not a correction to what
   * was sent: the quantity handed over stands, and this is what came back with
   * the finished goods. Kept here so the Finished goods section can show them
   * alongside the main output rather than leaving the stock adjustment as the
   * only trace.
   */
  unusedOutputs?: { sku: string; qty: number }[]
  /**
   * Components confirmed to have reached the vendor, by SKU.
   *
   * Only `dropship` fills this. The goods go from a 3rd party straight to the
   * subcon vendor and never pass through a company warehouse, so there is no
   * transfer to count — the purchase delivery against the component order is the
   * only evidence that they arrived.
   */
  componentReceipts?: Record<string, number>
  /**
   * Whether the vendor holds every component the run needs. Derived from the
   * transfers (resupply) or the component delivery (dropship) and written here
   * so the figure is read once and agreed on everywhere.
   */
  materialsReady?: boolean
  /**
   * The one step this order owes next. Written by the store whenever a document
   * is recorded; the screen renders it and never works it out for itself.
   */
  nextAction?: SubconNextAction
}

/**
 * The step a subcon work order owes next.
 *
 * Names the STEP, not the button — the view owns the wording and its
 * translation. `none` means the order is finished or cancelled and asks
 * nothing.
 */
export type SubconNextAction =
  | 'start'
  | 'create-transfer'
  | 'create-component-request'
  | 'view-component-request'
  | 'view-component-order'
  | 'create-service-request'
  | 'view-service-request'
  | 'complete'
  | 'none'

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
  /**
   * Units this document moved, when that matters to accounting: the finished
   * goods a purchase delivery brought back. The work order only accumulates a
   * running `producedQty`, so without this the per-receipt split needed to
   * allocate subcon cost across staged receipts is unrecoverable.
   */
  qty?: number
  /**
   * The document this one was built FROM, when the run has two threads that
   * raise the same kind of document.
   *
   * On `dropship` a work order raises two purchase requests — one buying raw
   * material from a 3rd party, one buying the vendor's work — and each grows its
   * own order and delivery. By kind alone those are indistinguishable, so a
   * delivery of components would be counted as finished goods produced. This
   * says which request the chain started from.
   */
  fromKind?: string
}

export interface WorkOrderMaterialReservation {
  /** Warehouse the reservation was picked from — needed to look the units back up later. */
  warehouseId?: string
  batchSelection?: { batchNo: string; qty: number }[]
  serialSelection?: string[]
}

export type WorkOrderStatus =
  | 'not started'
  /**
   * The raw material is being procured — a transfer or a component purchase is
   * under way, but the vendor does not hold everything yet.
   */
  | 'waiting rm procurement'
  /**
   * The vendor has the materials; the work itself has not been ordered.
   *
   * These two used to be one status, and before that both sat under "not
   * started" — so an order waiting on a warehouse and an order waiting on a
   * buyer looked identical. They are chased by different people, so they are
   * named separately.
   */
  | 'waiting subcon order'
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
      // The subcon warehouse is still set: it is where those components are
      // delivered (the vendor is the consignee), and it is what the component
      // purchase request is addressed to.
      subconWarehouseId: 'wh-sub-03', subconWarehouseName: 'WH Subcon · PT Java Roasting Works',
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
  syncSubconStatus(wo)
  persistWorkOrders()
}

/** Request kinds that buy raw material rather than the vendor's work. */
const COMPONENT_REQUEST_KINDS = ['componentPr', 'rawPr']

/**
 * How much of each component the vendor actually holds.
 *
 * The two supply methods record it in different places, and neither is the work
 * order's own field:
 *   • dropship — a 3rd party ships straight to the vendor, so the purchase
 *     delivery against the component order is the only evidence it arrived.
 *   • resupply — company stock moves, so the warehouse transfers carry it.
 *
 * Direction matters on resupply. Only stock moving INTO the vendor's location
 * counts; a transfer the other way is a return, and counting it would report
 * more as handed over than ever left.
 */
export function subconSentToVendor(wo: WorkOrder): Record<string, number> {
  const c = wo.subcon
  if (!c) return {}
  if (c.method === 'dropship') return { ...(c.componentReceipts ?? {}) }
  if (c.method !== 'resupply') return {}

  const vendorWarehouseId = c.subconWarehouseId
  const totals: Record<string, number> = {}
  for (const doc of c.raisedDocuments ?? []) {
    if (doc.route !== '/warehouse-transfers') continue
    const transfer = warehouseTransfers.find(t => t.id === doc.id)
    if (!transfer) continue
    if (vendorWarehouseId && transfer.destinationId !== vendorWarehouseId) continue
    for (const line of transfer.lines ?? []) {
      totals[line.sku] = (totals[line.sku] ?? 0) + line.qty
    }
  }
  return totals
}

/** The quantity of a component this run needs, after any adjustment. */
function plannedComponentQty(wo: WorkOrder, sku: string, needed: number): number {
  return wo.subcon?.componentAdjustments?.[sku] ?? needed
}

/**
 * Whether the vendor has every component the run needs, in full.
 *
 * Basic has nothing to wait for — the vendor works from its own stock.
 */
export function subconMaterialsFulfilled(wo: WorkOrder): boolean {
  const c = wo.subcon
  if (!c) return true
  if (c.method === 'basic') return true

  const bom = billOfMaterials.find(b => b.id === wo.bomId)
  const lines = bom?.rawMaterials ?? []
  // No recipe to measure against: fall back to whether supply was raised at all.
  if (!lines.length) {
    const RM_KINDS = ['transfer', 'rawTransfer', 'componentPr', 'rawPr']
    return (c.raisedDocuments ?? []).some(d => RM_KINDS.includes(d.kind))
  }

  const sent = subconSentToVendor(wo)
  return lines.every((line) => {
    const sku = catalogProduct(line.productId)?.sku
    if (!sku) return false
    return (sent[sku] ?? 0) >= plannedComponentQty(wo, sku, line.needed)
  })
}

/**
 * Keep the early-stage status in step with the documents raised.
 *
 * The run has two milestones before production: the vendor gets the materials,
 * and the work is ordered. Previously both sat under "not started" and someone
 * looking for what to chase could not tell them apart.
 *
 * Raising the purchase order does NOT start the run. It commits the vendor; a
 * person still says go, and that moment is what issues the components. So this
 * never writes `in progress` — `startWorkOrder` does.
 *
 * Statuses from `partially produced` onward are left alone: production has begun
 * and this is no longer the thing that decides where the order stands.
 */
export function syncSubconStatus(wo: WorkOrder): void {
  const c = wo.subcon
  if (!c) return

  // Past this point the status is production's to move, not this function's.
  // The next action is still derived, though: a finished or cancelled order owes
  // nothing, and leaving the last value it held is what put Complete and
  // Partially produce on the header of an order that was already closed.
  if (!['not started', 'waiting rm procurement', 'waiting subcon order', 'in progress'].includes(wo.status)) {
    c.nextAction = deriveNextAction(wo)
    return
  }

  const docs = c.raisedDocuments ?? []
  // The order that places the vendor's WORK — not a component order, which buys
  // raw material and settles nothing about the work itself.
  const servicePo = docs.some(d =>
    d.kind === 'purchaseOrder'
    && !(d.fromKind && COMPONENT_REQUEST_KINDS.includes(d.fromKind)))

  // The work is ordered. The run itself waits for someone to start it, so the
  // status stays where it is and only the next action moves on.
  if (servicePo) {
    c.nextAction = deriveNextAction(wo)
    return
  }

  // An order never walks backwards. The statuses below describe the run BEFORE
  // the work was ordered, and a record already in progress has passed them —
  // seeded ones carry no documents at all, and re-deriving from documents would
  // put them back at the start.
  if (wo.status === 'in progress') { c.nextAction = deriveNextAction(wo); return }

  const ready = subconMaterialsFulfilled(wo)
  c.materialsReady = ready
  if (ready) {
    wo.status = 'waiting subcon order'
  } else {
    // Procurement has started but has not delivered everything yet.
    const RM_KINDS = ['transfer', 'rawTransfer', 'componentPr', 'rawPr']
    const procuring = docs.some(d => RM_KINDS.includes(d.kind))
    wo.status = procuring ? 'waiting rm procurement' : 'not started'
  }
  c.nextAction = deriveNextAction(wo)
}

/**
 * Which action the work order should offer next.
 *
 * The screen renders what this says and never works it out for itself — in the
 * real system the server decides it, and a page that re-derives it from
 * quantities is a second implementation waiting to disagree with the first.
 *
 * The value names the STEP, not the button: the view owns the wording and the
 * translation.
 */
export function deriveNextAction(wo: WorkOrder): SubconNextAction {
  const c = wo.subcon
  if (!c) return 'none'
  if (['completed', 'canceled'].includes(wo.status)) return 'none'

  const docs = c.raisedDocuments ?? []
  const has = (kind: string) => docs.some(d => d.kind === kind)
  const serviceRequestKind = c.scope === 'component' ? 'processPr' : 'subconPr'
  const servicePo = docs.some(d => d.kind === 'purchaseOrder' && isServiceOrderDoc(d))

  // ── Supply first: the vendor cannot be asked to work on nothing ──────────
  if (!subconMaterialsFulfilled(wo)) {
    if (c.method === 'resupply') return 'create-transfer'
    if (c.method === 'dropship') {
      if (!has('componentPr') && !has('rawPr')) return 'create-component-request'
      const componentPo = docs.find(d => d.kind === 'purchaseOrder' && !isServiceOrderDoc(d))
      return componentPo ? 'view-component-order' : 'view-component-request'
    }
  }

  // ── The work itself: requested here, ordered from the request ───────────
  if (!servicePo) {
    if (!has(serviceRequestKind)) return 'create-service-request'
    return 'view-service-request'
  }

  // ── Ordered, and not yet begun. Starting is a deliberate act: it is the
  //    moment the vendor is told to go, and with partial production off it is
  //    also what issues the components into their process.
  //
  //    Tested on the statuses that mean the run has NOT begun, not on the one
  //    that means it has: a partially produced or partially completed order has
  //    output against it already, and offering to start it would be nonsense.
  const NOT_YET_BEGUN = ['not started', 'waiting rm procurement', 'waiting subcon order']
  if (NOT_YET_BEGUN.includes(wo.status)) return 'start'

  // ── Running. Production is recorded against the vendor's deliveries ─────
  return 'complete'
}

/** A raised document that places the vendor's WORK, not one that buys material. */
function isServiceOrderDoc(d: RaisedSubconDocument): boolean {
  return !(d.fromKind && COMPONENT_REQUEST_KINDS.includes(d.fromKind))
}

/**
 * Re-derive a subcon order's status and its next action from the documents and
 * movements that exist right now, and persist if either moved.
 *
 * Called when the order is opened. A record written before these fields existed
 * carries neither, and nothing else would correct it; opening it is the moment
 * to put it right.
 */
export function refreshSubconWorkOrder(workOrderId: string): void {
  const wo = workOrders.find(w => w.id === workOrderId)
  if (!wo?.subcon) return
  const was = { status: wo.status, action: wo.subcon.nextAction }
  syncSubconStatus(wo)
  if (wo.status !== was.status || wo.subcon.nextAction !== was.action) persistWorkOrders()
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
/**
 * Take cost onto a partial production record. Accumulates per line so the
 * remaining amount each later record may charge is what the order agreed less
 * what has already been taken.
 */
export function recordSubconCost(workOrderId: string, amounts: Record<string, number>): void {
  const wo = workOrders.find(w => w.id === workOrderId)
  if (!wo?.subcon) return
  const taken = { ...(wo.subcon.costLineRecorded ?? {}) }
  for (const [id, amount] of Object.entries(amounts)) {
    if (!amount) continue
    taken[id] = (taken[id] ?? 0) + amount
  }
  wo.subcon.costLineRecorded = taken
  persistWorkOrders()
}

/** Record components confirmed delivered to the vendor (dropship). */
export function recordSubconComponentReceipt(
  workOrderId: string,
  lines: { sku: string; qty: number }[],
): void {
  const wo = workOrders.find(w => w.id === workOrderId)
  if (!wo?.subcon) return
  const received = { ...(wo.subcon.componentReceipts ?? {}) }
  for (const line of lines) {
    if (line.qty <= 0) continue
    received[line.sku] = (received[line.sku] ?? 0) + line.qty
  }
  wo.subcon.componentReceipts = received
  // The receipt is what makes a dropship order's materials complete, so the
  // status is re-derived AFTER it lands — the document that carried it was
  // recorded a moment earlier, when this was not yet true.
  syncSubconStatus(wo)
  persistWorkOrders()
}

/** Record what came back unused, as additional output of the run. */
export function recordSubconUnusedOutput(
  workOrderId: string,
  lines: { sku: string; qty: number }[],
): void {
  const wo = workOrders.find(w => w.id === workOrderId)
  if (!wo?.subcon) return
  const kept = [...(wo.subcon.unusedOutputs ?? [])]
  for (const line of lines) {
    if (line.qty <= 0) continue
    const existing = kept.find(k => k.sku === line.sku)
    if (existing) existing.qty += line.qty
    else kept.push({ ...line })
  }
  wo.subcon.unusedOutputs = kept
  persistWorkOrders()
}

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
/** Revise one component's planned quantity on this work order only. */
export function setSubconComponentQty(workOrderId: string, sku: string, qty: number): void {
  const wo = workOrders.find(w => w.id === workOrderId)
  if (!wo?.subcon) return
  wo.subcon.componentAdjustments = { ...(wo.subcon.componentAdjustments ?? []), [sku]: qty }
  persistWorkOrders()
}

/** Revise one cost line's amount on this work order only. */
export function setSubconCostLineAmount(workOrderId: string, lineId: string, amount: number): void {
  const wo = workOrders.find(w => w.id === workOrderId)
  if (!wo?.subcon) return
  wo.subcon.costLineOverrides = { ...(wo.subcon.costLineOverrides ?? {}), [lineId]: amount }
  persistWorkOrders()
}

/** Add a subcon charge agreed after the order was created. */
export function addSubconCostLine(
  workOrderId: string,
  line: { id: string; name: string; costDriver: string; amount: number },
): void {
  const wo = workOrders.find(w => w.id === workOrderId)
  if (!wo?.subcon) return
  wo.subcon.extraCostLines = [...(wo.subcon.extraCostLines ?? []), line]
  persistWorkOrders()
}

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

/**
 * Carry records written under the single `awaiting purchase order` status over
 * to the pair that replaced it.
 *
 * Anyone who has used the app already has those stored, and an unrecognised
 * status renders as a bare string with no badge. Which of the two it becomes is
 * decided the same way a new record decides: `syncSubconStatus` reads the
 * documents.
 *
 * Runs at the END of the module, not beside the snapshot load: it calls into
 * `syncSubconStatus`, whose own constants are declared further down and are in
 * the temporal dead zone while the file is still evaluating.
 */
for (const wo of workOrders) {
  if ((wo.status as string) !== 'awaiting purchase order') continue
  wo.status = 'waiting rm procurement'   // a floor `syncSubconStatus` can raise
  syncSubconStatus(wo)
}
