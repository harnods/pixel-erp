/**
 * Seed status coverage — after the base seed loads, top up the mock DB so there
 * is at least one record in EVERY status across the inbound and outbound flows.
 * Lets a tester jump straight to any transition (e.g. an "Out for delivery"
 * package already sitting there → test Shipped) without walking the whole chain.
 *
 * Everything is created through the real state-machine APIs, so the records are
 * coherent (reservations, stock, links). Guarded by a sentinel record so it runs
 * once per fresh DB and never duplicates on reload; each unit is fault-isolated
 * so a single failure can't break app boot.
 */
import { outgoingOrders, addOutgoing, type OutgoingOrder } from './outgoing'
import { addPickingTask, startPicking, endPicking } from './pickingTasks'
import { addPackingTask, startPacking, endPacking, cancelPackingTask, getPackingTask } from './packingTasks'
import { addDeliveryTaskFromPackingTasks, handoverToCourierBulk, cancelDeliveryTask } from './deliveryTasks'
import { receipts, addReceipt } from './receipts'
import { createReceivingTask, startReceiving, endReceiving, cancelReceivingTask } from './receivingTasks'
import { addPutAwayTask, startPutAway, endPutAway, cancelPutAway } from './putAwayTasks'
import { binForSku } from './warehouseDetails'
import { productBySku } from './inventory'

const WH = 'wh-006'
const WH_NAME = 'Gudang Makassar Selatan'
const DUE = '2026-08-20'
const SKU = '3004' // Coffee Scale 2kg / 0.1g — plain, untracked (safe to auto-drive)
const BY = 'Coverage seed'
const LINE = { sku: SKU, productName: 'Coffee Scale 2kg / 0.1g', desc: '', img: '', unit: 'Unit', qty: 1 }
const SENTINEL = 'COV-OUT-OPEN'

function step(label: string, fn: () => void) {
  try { fn() } catch (e) { console.warn(`[seedCoverage] ${label} skipped:`, e) }
}

// ── Outbound ──────────────────────────────────────────────────────────────────
function order(salesNo: string): OutgoingOrder {
  return addOutgoing({
    salesNo, source: 'Manual', warehouseId: WH, warehouseName: WH_NAME,
    skuQty: 1, orderQty: 1, shippedQty: 0, status: 'open', dueDate: DUE, lines: [LINE],
  })
}
function completedPicking(o: OutgoingOrder) {
  const p = addPickingTask({ salesOrderIds: [o.id], salesNos: [o.salesNo], warehouseId: WH, warehouseName: WH_NAME, assignee: BY })
  startPicking(p.id); endPicking(p.id, { [`${o.id}::${SKU}`]: 1 })
  return p
}
function completedPacking(o: OutgoingOrder) {
  const p = completedPicking(o)
  const pk = addPackingTask({ salesOrderId: o.id, salesNo: o.salesNo, pickingTaskId: p.id, pickingTaskNo: p.taskNo, warehouseId: WH, warehouseName: WH_NAME, assignee: BY })
  startPacking(pk.id); endPacking(pk.id, { [`${o.id}::${SKU}`]: 1 })
  return pk
}
function readyToShip(o: OutgoingOrder, courier = 'JNE REG') {
  const pk = completedPacking(o)
  return addDeliveryTaskFromPackingTasks([getPackingTask(pk.id)!], { assignee: BY, courier })
}

function seedOutbound() {
  // Outbound order 'open' (also the sentinel) — picking task created, not started.
  step('order open', () => { const o = order(SENTINEL); addPickingTask({ salesOrderIds: [o.id], salesNos: [o.salesNo], warehouseId: WH, warehouseName: WH_NAME, assignee: BY }) })
  // Packing 'open' / 'in progress' / 'canceled'
  step('packing open', () => { const o = order('COV-PACK-OPEN'); const p = completedPicking(o); addPackingTask({ salesOrderId: o.id, salesNo: o.salesNo, pickingTaskId: p.id, pickingTaskNo: p.taskNo, warehouseId: WH, warehouseName: WH_NAME, assignee: BY }) })
  step('packing in progress', () => { const o = order('COV-PACK-INPROG'); const p = completedPicking(o); const pk = addPackingTask({ salesOrderId: o.id, salesNo: o.salesNo, pickingTaskId: p.id, pickingTaskNo: p.taskNo, warehouseId: WH, warehouseName: WH_NAME, assignee: BY }); startPacking(pk.id) })
  step('packing canceled', () => { const o = order('COV-PACK-CANCEL'); const p = completedPicking(o); const pk = addPackingTask({ salesOrderId: o.id, salesNo: o.salesNo, pickingTaskId: p.id, pickingTaskNo: p.taskNo, warehouseId: WH, warehouseName: WH_NAME, assignee: BY }); cancelPackingTask(pk.id, BY, true) })
  // Delivery 'ready to ship' / 'out for delivery' (+ shipment doc 'open') / 'canceled'
  step('delivery ready to ship', () => { readyToShip(order('COV-RTS')) })
  step('delivery out for delivery + shipment open', () => { const d = readyToShip(order('COV-OFD')); handoverToCourierBulk([d.id], { assignee: BY }) })
  step('delivery canceled', () => { const d = readyToShip(order('COV-DEL-CANCEL')); cancelDeliveryTask(d.id, BY) })
}

// ── Inbound ───────────────────────────────────────────────────────────────────
function newReceipt(): ReturnType<typeof addReceipt> {
  const p = productBySku(SKU)
  return addReceipt({
    purchaseNo: 'Coverage PO', vendor: 'Coverage Vendor', warehouseId: WH, warehouseName: WH_NAME,
    skuQty: 1, purchaseQty: 2, receivedQty: 0, status: 'pending', estimatedArrival: '2026-08-10',
    // Real line items so createReceivingTask() has something to receive.
    lineItems: p ? [{ productId: p.id, qty: 2 }] : [],
  } as Parameters<typeof addReceipt>[0])
}
function receivedTask(receivedQty: number) {
  const r = newReceipt()
  const task = createReceivingTask({ receiptId: r.id, assignee: BY, skus: [SKU] })
  if (!task) throw new Error('no receiving task (receipt has no line items)')
  startReceiving(task.id)
  endReceiving(task.id, { [SKU]: receivedQty })
  return { r, task }
}

function seedInbound() {
  // Receiving 'pending put-away' — received in full, awaiting put-away.
  step('receiving pending put-away', () => { receivedTask(2) })
  // Receiving 'canceled'
  step('receiving canceled', () => { const r = newReceipt(); const t = createReceivingTask({ receiptId: r.id, assignee: BY, skus: [SKU] }); if (t) cancelReceivingTask(t.id, BY) })
  // Put-away 'in progress' + a completed one (→ receipt 'completed')
  step('put-away in progress', () => {
    const { task } = receivedTask(2)
    const pa = addPutAwayTask({ receivingTaskIds: [task.id], receivingTaskNos: [task.taskNo], warehouseId: WH, warehouseName: WH_NAME, assignee: BY, destination: 'A-01-01' } as Parameters<typeof addPutAwayTask>[0])
    startPutAway(pa.id)
  })
  step('put-away canceled', () => {
    const { task } = receivedTask(2)
    const pa = addPutAwayTask({ receivingTaskIds: [task.id], receivingTaskNos: [task.taskNo], warehouseId: WH, warehouseName: WH_NAME, assignee: BY, destination: 'A-01-01' } as Parameters<typeof addPutAwayTask>[0])
    cancelPutAway(pa.id, BY)
  })
  // Receipt 'completed' — full receive + full put-away (commits stock).
  step('receipt completed', () => {
    const { task } = receivedTask(2)
    const pa = addPutAwayTask({ receivingTaskIds: [task.id], receivingTaskNos: [task.taskNo], warehouseId: WH, warehouseName: WH_NAME, assignee: BY, destination: 'A-01-01' } as Parameters<typeof addPutAwayTask>[0])
    startPutAway(pa.id)
    endPutAway(pa.id, [{ skuCode: SKU, qty: 2, binLocation: binForSku(WH, SKU) }])
  })
  // Receipt 'partial reception' — receive short + put away what arrived (stock on hand).
  step('receipt partial reception', () => {
    const { task } = receivedTask(1) // 1 of 2
    const pa = addPutAwayTask({ receivingTaskIds: [task.id], receivingTaskNos: [task.taskNo], warehouseId: WH, warehouseName: WH_NAME, assignee: BY, destination: 'A-01-01' } as Parameters<typeof addPutAwayTask>[0])
    startPutAway(pa.id)
    endPutAway(pa.id, [{ skuCode: SKU, qty: 1, binLocation: binForSku(WH, SKU) }])
  })
}

// ── One warehouse, several couriers: the split-on-save demo ───────────────────
/**
 * Five ready-to-ship packages in ONE warehouse, deliberately bound for THREE
 * different couriers, so the New shipment flow can be walked end to end:
 *
 *   scan all five into ONE draft  ->  Save  ->  THREE shipment documents.
 *
 * The split is the point. A shipment document travels with one courier, but the
 * operator at the outbound door doesn't sort parcels by courier first — they scan
 * whatever is in front of them. So the draft is deliberately mixed and
 * handoverToCourierBulk() groups it at save time (one doc per distinct courier)
 * instead of making the operator keep three drafts open.
 *
 * Named by courier so the result can be checked at a glance: the two JNE packages
 * must land on ONE shipment no., and neither of the others on it.
 */
const SHIP_SPLIT_SENTINEL = 'SHIP-SPLIT-JNE-1'
const SHIP_SPLIT: { salesNo: string; courier: string }[] = [
  { salesNo: SHIP_SPLIT_SENTINEL, courier: 'JNE REG' },
  { salesNo: 'SHIP-SPLIT-JNE-2', courier: 'JNE REG' },
  { salesNo: 'SHIP-SPLIT-SICEPAT-1', courier: 'SiCepat BEST' },
  { salesNo: 'SHIP-SPLIT-SICEPAT-2', courier: 'SiCepat BEST' },
  { salesNo: 'SHIP-SPLIT-ANTERAJA-1', courier: 'AnterAja REG' },
]

function seedShipmentCourierSplit(): void {
  for (const s of SHIP_SPLIT) {
    step(`ready to ship ${s.salesNo}`, () => { readyToShip(order(s.salesNo), s.courier) })
  }
}

/** Run once per fresh DB (guarded by the sentinel order). */
export function ensureSeedCoverage(): void {
  if (receipts.length === 0) return // base seed not ready yet — bail (shouldn't happen)
  // Each block carries its OWN sentinel, so a DB seeded by an earlier build picks up
  // a newly added block without needing a reset — and never re-runs one it has.
  if (!outgoingOrders.some((o) => o.salesNo === SENTINEL)) {
    seedOutbound()
    seedInbound()
  }
  if (!outgoingOrders.some((o) => o.salesNo === SHIP_SPLIT_SENTINEL)) seedShipmentCourierSplit()
}

ensureSeedCoverage()
