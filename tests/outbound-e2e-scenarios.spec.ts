/**
 * Outbound END-TO-END scenarios — the full picking → packing → delivery → shipment
 * lifecycle, driven case by case on FRESH seed orders this file creates itself (via
 * addOutgoing), so each scenario is deterministic and isolated from the app's demo seed.
 *
 * Covers: happy path (regular + marketplace), partial picking, partial packing,
 * partial shipping (repeat cycle), one picking list with multiple orders, a
 * marketplace + regular MIX in one picking list, and one shipment covering several
 * orders — asserting task statuses AND the stock invariants at every step:
 *
 *   - reserving happens at order creation (available ↓, on-hand untouched)
 *   - on-hand is NEVER moved through picking/packing/handover — the goods only leave
 *     (on-hand ↓, reservation consumed) when the SHIPMENT is COMPLETED
 *   - available = onHand − reserved holds at all times
 */
import { describe, it, expect } from 'vitest'
import { addOutgoing, isMarketplaceOrder, outgoingOrders, releaseReservedForCancelledOrder, type OutgoingOrder } from '~/data/outgoing'
import {
  addPickingTask, startPicking, endPicking, getPickingTask,
  packableOrderIds, orderPickedQtyInTask, orderFullyPickedAcrossTasks,
} from '~/data/pickingTasks'
import { addPackingTask, endPacking, getPackingTask } from '~/data/packingTasks'
import {
  addDeliveryTaskFromPackingTasks, handoverToCourierBulk, completeShipment,
  getDeliveryTask, getDeliveryForOrder,
} from '~/data/deliveryTasks'
import { syncOutboundOrderStatuses, cancelOutboundOrder } from '~/data/outboundSync'
import { getWarehouseDetail, reservedQtyForTask } from '~/data/warehouseDetails'

const WH = 'wh-006'
const WH_NAME = 'Gudang Makassar Selatan'
const A = '3004' // plain accessory, ~13 on hand
const B = '3005' // plain accessory, ~11 on hand

function stock(sku: string) { return getWarehouseDetail(WH)!.stock.find(s => s.sku === sku)! }
function onHand(sku: string) { return stock(sku).onHand }
function avail(sku: string) { return stock(sku).available }
function reserved(sku: string) { return stock(sku).reserved }
function orderStatus(id: string) { return outgoingOrders.find(o => o.id === id)!.status }
const K = (orderId: string, sku: string) => `${orderId}::${sku}`
/** available = max(0, onHand − reserved) for a plain SKU — clamp-aware, since the
 *  shared demo seed also reserves against these SKUs (available can hit its floor). */
function invariant(sku: string) { const s = stock(sku); expect(s.available).toBe(Math.max(0, s.onHand - s.reserved)) }

const line = (sku: string, qty: number) => ({ sku, productName: 'Test', desc: '', img: '', unit: 'Unit', qty })
function order(lines: ReturnType<typeof line>[], source = 'Manual'): OutgoingOrder {
  return addOutgoing({
    salesNo: 'E2E', source, warehouseId: WH, warehouseName: WH_NAME,
    skuQty: lines.length, orderQty: lines.reduce((s, l) => s + l.qty, 0), shippedQty: 0,
    status: 'pending', dueDate: '2026-08-01', lines,
  })
}
const reg = (lines: ReturnType<typeof line>[]) => order(lines, 'Manual')
const mkt = (lines: ReturnType<typeof line>[]) => order(lines, 'Shopee: Central Perk')

function pickTask(orders: OutgoingOrder[]) {
  return addPickingTask({
    salesOrderIds: orders.map(o => o.id), salesNos: orders.map(o => o.salesNo),
    warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op',
  })
}
function packFor(o: OutgoingOrder, pt: { id: string; taskNo: string }) {
  return addPackingTask({
    salesOrderId: o.id, salesNo: o.salesNo, pickingTaskId: pt.id, pickingTaskNo: pt.taskNo,
    warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op',
  })
}
/** Full ship of one delivery = handover (out for delivery) + complete (shipped/posted). */
function shipComplete(delId: string, date = '2026-07-20') {
  const [s] = handoverToCourierBulk([delId], { assignee: 'Op', transactionDate: date })
  completeShipment(s!.shipmentSeq, { receivedDate: date, receivedBy: 'Rina' })
  return s!
}
function cleanup(...os: OutgoingOrder[]) {
  for (const o of os) {
    const c = outgoingOrders.find(x => x.id === o.id)
    if (c && c.status !== 'canceled' && (c.shippedQty ?? 0) === 0) cancelOutboundOrder(o.id)
    releaseReservedForCancelledOrder(o.id)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
describe('E2E happy path', () => {
  it('regular order — full pick → pack → deliver → out for delivery → shipped; on-hand posted only at completion', () => {
    const oh0 = onHand(A)

    const o = reg([line(A, 2)])
    expect(orderStatus(o.id)).toBe('pending')
    expect(reservedQtyForTask(o.id)).toBe(2) // reserved at creation (order-scoped, seed-proof)
    expect(onHand(A)).toBe(oh0)      // on-hand untouched
    invariant(A)

    const pt = pickTask([o])
    syncOutboundOrderStatuses(); expect(orderStatus(o.id)).toBe('open')
    startPicking(pt.id)
    syncOutboundOrderStatuses(); expect(orderStatus(o.id)).toBe('in progress')
    endPicking(pt.id, { [K(o.id, A)]: 2 })
    expect(getPickingTask(pt.id)!.status).toBe('completed')
    expect(onHand(A)).toBe(oh0)      // picking never moves on-hand
    invariant(A)

    const pk = packFor(o, pt)
    endPacking(pk.id, { [K(o.id, A)]: 2 })
    expect(getPackingTask(pk.id)!.status).toBe('completed')

    const del = addDeliveryTaskFromPackingTasks([getPackingTask(pk.id)!], { assignee: 'Op' })
    expect(del.status).toBe('ready to ship')

    const [s] = handoverToCourierBulk([del.id], { assignee: 'Op', transactionDate: '2026-07-20' })
    expect(getDeliveryTask(del.id)!.status).toBe('out for delivery')
    expect(onHand(A)).toBe(oh0)      // handover ≠ shipped, still not posted
    invariant(A)

    completeShipment(s!.shipmentSeq, { receivedDate: '2026-07-21', receivedBy: 'Rina' })
    expect(getDeliveryTask(del.id)!.status).toBe('shipped')
    syncOutboundOrderStatuses()
    expect(orderStatus(o.id)).toBe('completed')
    expect(onHand(A)).toBe(oh0 - 2)          // NOW posted
    expect(reservedQtyForTask(o.id)).toBe(0) // this order's reservation consumed at completion
    invariant(A)
  })

  it('marketplace order — same happy path (must be fully picked before packing)', () => {
    const oh0 = onHand(B)
    const o = mkt([line(B, 2)])
    expect(isMarketplaceOrder(o)).toBe(true)
    const pt = pickTask([o])
    startPicking(pt.id)
    endPicking(pt.id, { [K(o.id, B)]: 2 })            // full pick required for marketplace
    expect(orderFullyPickedAcrossTasks(o.id)).toBe(true)
    expect(packableOrderIds(getPickingTask(pt.id)!)).toEqual([o.id])
    const pk = packFor(o, pt); endPacking(pk.id, { [K(o.id, B)]: 2 })
    const del = addDeliveryTaskFromPackingTasks([getPackingTask(pk.id)!], { assignee: 'Op' })
    shipComplete(del.id)
    syncOutboundOrderStatuses()
    expect(orderStatus(o.id)).toBe('completed')
    expect(onHand(B)).toBe(oh0 - 2)
    invariant(B)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('E2E partial picking', () => {
  it('finish short → partially picked; remainder stays pickable; a 2nd list completes it', () => {
    const o = reg([line(A, 3)])
    const pt1 = pickTask([o])
    startPicking(pt1.id)
    endPicking(pt1.id, { [K(o.id, A)]: 1 })          // 1 of 3
    expect(getPickingTask(pt1.id)!.status).toBe('partially picked')
    expect(orderFullyPickedAcrossTasks(o.id)).toBe(false)
    expect(orderPickedQtyInTask(getPickingTask(pt1.id)!, o.id)).toBe(1)
    invariant(A)

    // remainder (2) picked on a second list
    const pt2 = pickTask([o])
    startPicking(pt2.id)
    endPicking(pt2.id, { [K(o.id, A)]: 2 })
    expect(orderFullyPickedAcrossTasks(o.id)).toBe(true) // 1 + 2 across lists = 3
    cleanup(o)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('E2E partial packing → partial shipping', () => {
  it('pick full (3), pack only 2, ship 2 → order partially shipped; on-hand posts just the 2', () => {
    const oh0 = onHand(B)
    const o = reg([line(B, 3)])
    const pt = pickTask([o]); startPicking(pt.id); endPicking(pt.id, { [K(o.id, B)]: 3 })
    const pk = packFor(o, pt)
    endPacking(pk.id, { [K(o.id, B)]: 2 })            // pack only 2 of the 3 picked
    expect(getPackingTask(pk.id)!.packedQty).toBe(2)
    const del = addDeliveryTaskFromPackingTasks([getPackingTask(pk.id)!], { assignee: 'Op' })
    expect(del.toShipQty).toBe(2)
    shipComplete(del.id)
    syncOutboundOrderStatuses()
    expect(orderStatus(o.id)).toBe('partially shipped') // 2 of 3
    expect(onHand(B)).toBe(oh0 - 2)                      // only the shipped 2 posted
    invariant(B)
    // this order still holds its unshipped remainder reserved (1 of 3)
    expect(reservedQtyForTask(o.id)).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('E2E partial shipping — repeat cycle to completion', () => {
  it('ship 1 of 3, then 2 more → completed; shippedQty never double-counts; on-hand posts per cycle', () => {
    const oh0 = onHand(A)
    const o = reg([line(A, 3)])

    // cycle 1: pick 1, pack 1, ship 1
    const p1 = pickTask([o]); startPicking(p1.id); endPicking(p1.id, { [K(o.id, A)]: 1 })
    const k1 = packFor(o, p1); endPacking(k1.id, { [K(o.id, A)]: 1 })
    const d1 = addDeliveryTaskFromPackingTasks([getPackingTask(k1.id)!], { assignee: 'Op' })
    shipComplete(d1.id, '2026-07-20')
    syncOutboundOrderStatuses()
    expect(orderStatus(o.id)).toBe('partially shipped')
    expect(outgoingOrders.find(x => x.id === o.id)!.shippedQty).toBe(1)
    expect(onHand(A)).toBe(oh0 - 1)

    // cycle 2: pick remaining 2, pack 2, ship 2
    const p2 = pickTask([o]); startPicking(p2.id); endPicking(p2.id, { [K(o.id, A)]: 2 })
    const k2 = packFor(o, p2); endPacking(k2.id, { [K(o.id, A)]: 2 })
    const d2 = addDeliveryTaskFromPackingTasks([getPackingTask(k2.id)!], { assignee: 'Op' })
    shipComplete(d2.id, '2026-07-21')
    syncOutboundOrderStatuses()
    expect(orderStatus(o.id)).toBe('completed')
    expect(outgoingOrders.find(x => x.id === o.id)!.shippedQty).toBe(3) // 1 + 2, no double count
    expect(onHand(A)).toBe(oh0 - 3)
    invariant(A)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('E2E one picking list, multiple orders', () => {
  it('shared pick of 2 regular orders → per-order packing → 2 deliveries; per-order tracking throughout', () => {
    const oh0 = onHand(B)
    const o1 = reg([line(B, 1)]); const o2 = reg([line(B, 2)])
    const pt = pickTask([o1, o2])
    expect(pt.salesOrderIds).toEqual([o1.id, o2.id])
    startPicking(pt.id)
    endPicking(pt.id, { [K(o1.id, B)]: 1, [K(o2.id, B)]: 2 })
    expect(orderPickedQtyInTask(getPickingTask(pt.id)!, o1.id)).toBe(1)
    expect(orderPickedQtyInTask(getPickingTask(pt.id)!, o2.id)).toBe(2)
    expect(packableOrderIds(getPickingTask(pt.id)!).sort()).toEqual([o1.id, o2.id].sort())

    // one packing task per order, from the same shared picking list
    const k1 = packFor(o1, pt); endPacking(k1.id, { [K(o1.id, B)]: 1 })
    const k2 = packFor(o2, pt); endPacking(k2.id, { [K(o2.id, B)]: 2 })
    const d1 = addDeliveryTaskFromPackingTasks([getPackingTask(k1.id)!], { assignee: 'Op' })
    const d2 = addDeliveryTaskFromPackingTasks([getPackingTask(k2.id)!], { assignee: 'Op' })
    expect(d1.salesOrderId).toBe(o1.id); expect(d2.salesOrderId).toBe(o2.id)
    shipComplete(d1.id); shipComplete(d2.id)
    syncOutboundOrderStatuses()
    expect(orderStatus(o1.id)).toBe('completed')
    expect(orderStatus(o2.id)).toBe('completed')
    expect(onHand(B)).toBe(oh0 - 3)
    invariant(B)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('E2E marketplace + regular MIX in one picking list', () => {
  it('regular is packable at any pick; marketplace only once fully picked', () => {
    const regO = reg([line(A, 2)]); const mktO = mkt([line(B, 2)])
    const pt = pickTask([regO, mktO])
    startPicking(pt.id)
    // partial pick both: reg 1/2, marketplace 1/2
    endPicking(pt.id, { [K(regO.id, A)]: 1, [K(mktO.id, B)]: 1 })
    // regular (1 picked) IS packable; marketplace (not full) is NOT
    expect(packableOrderIds(getPickingTask(pt.id)!)).toEqual([regO.id])
    expect(orderFullyPickedAcrossTasks(mktO.id)).toBe(false)

    // finish the marketplace order on a follow-up list → now packable
    const pt2 = pickTask([mktO]); startPicking(pt2.id); endPicking(pt2.id, { [K(mktO.id, B)]: 1 })
    expect(orderFullyPickedAcrossTasks(mktO.id)).toBe(true)
    cleanup(regO, mktO)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('E2E one shipment covering multiple orders', () => {
  it('2 orders → 2 deliveries → ONE handover shipment (both out for delivery) → complete → both shipped & posted', () => {
    const oh0 = onHand(A)
    const o1 = reg([line(A, 1)]); const o2 = reg([line(A, 1)])
    const mk = (o: OutgoingOrder) => {
      const pt = pickTask([o]); startPicking(pt.id); endPicking(pt.id, { [K(o.id, A)]: 1 })
      const pk = packFor(o, pt); endPacking(pk.id, { [K(o.id, A)]: 1 })
      return addDeliveryTaskFromPackingTasks([getPackingTask(pk.id)!], { assignee: 'Op' })
    }
    const d1 = mk(o1); const d2 = mk(o2)

    // one bulk handover, same courier → ONE shipment doc, both out for delivery
    const results = handoverToCourierBulk([d1.id, d2.id], { assignee: 'Op', transactionDate: '2026-07-20', courierByTaskId: { [d1.id]: 'JNE', [d2.id]: 'JNE' } })
    expect(results).toHaveLength(1)
    expect(getDeliveryTask(d1.id)!.status).toBe('out for delivery')
    expect(getDeliveryTask(d2.id)!.status).toBe('out for delivery')
    expect(getDeliveryTask(d1.id)!.shipmentNo).toBe(getDeliveryTask(d2.id)!.shipmentNo)
    expect(onHand(A)).toBe(oh0)   // nothing posted while the shipment is open

    completeShipment(results[0]!.shipmentSeq, { receivedDate: '2026-07-21', receivedBy: 'Rina' })
    expect(getDeliveryTask(d1.id)!.status).toBe('shipped')
    expect(getDeliveryTask(d2.id)!.status).toBe('shipped')
    expect(onHand(A)).toBe(oh0 - 2) // both orders posted at completion
    syncOutboundOrderStatuses()
    expect(orderStatus(o1.id)).toBe('completed')
    expect(orderStatus(o2.id)).toBe('completed')
    invariant(A)
  })

  it('bulk handover with two couriers splits into TWO shipment docs', () => {
    const o1 = reg([line(A, 1)]); const o2 = reg([line(A, 1)])
    const mk = (o: OutgoingOrder) => {
      const pt = pickTask([o]); startPicking(pt.id); endPicking(pt.id, { [K(o.id, A)]: 1 })
      const pk = packFor(o, pt); endPacking(pk.id, { [K(o.id, A)]: 1 })
      return addDeliveryTaskFromPackingTasks([getPackingTask(pk.id)!], { assignee: 'Op' })
    }
    const d1 = mk(o1); const d2 = mk(o2)
    const results = handoverToCourierBulk([d1.id, d2.id], { assignee: 'Op', transactionDate: '2026-07-20', courierByTaskId: { [d1.id]: 'JNE', [d2.id]: 'SiCepat' } })
    expect(results).toHaveLength(2)
    expect(getDeliveryTask(d1.id)!.shipmentNo).not.toBe(getDeliveryTask(d2.id)!.shipmentNo)
    // both still reversible (out for delivery) until each shipment completes
    expect(getDeliveryTask(d1.id)!.status).toBe('out for delivery')
    for (const r of results) completeShipment(r.shipmentSeq, { receivedDate: '2026-07-21', receivedBy: 'Rina' })
    expect(getDeliveryTask(d1.id)!.status).toBe('shipped')
    expect(getDeliveryTask(d2.id)!.status).toBe('shipped')
    syncOutboundOrderStatuses()
    expect(orderStatus(o1.id)).toBe('completed')
    expect(orderStatus(o2.id)).toBe('completed')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('E2E invariants across the whole flow', () => {
  it('on-hand is untouched at every pre-completion stage; available = onHand − reserved always', () => {
    const oh0 = onHand(A)
    const o = reg([line(A, 2)])
    invariant(A); expect(onHand(A)).toBe(oh0)
    const pt = pickTask([o]); invariant(A); expect(onHand(A)).toBe(oh0)
    startPicking(pt.id); invariant(A); expect(onHand(A)).toBe(oh0)
    endPicking(pt.id, { [K(o.id, A)]: 2 }); invariant(A); expect(onHand(A)).toBe(oh0)
    const pk = packFor(o, pt); endPacking(pk.id, { [K(o.id, A)]: 2 }); invariant(A); expect(onHand(A)).toBe(oh0)
    const del = addDeliveryTaskFromPackingTasks([getPackingTask(pk.id)!], { assignee: 'Op' })
    invariant(A); expect(onHand(A)).toBe(oh0)
    const [s] = handoverToCourierBulk([del.id], { assignee: 'Op', transactionDate: '2026-07-20' })
    invariant(A); expect(onHand(A)).toBe(oh0) // out for delivery — still not posted
    completeShipment(s!.shipmentSeq, { receivedDate: '2026-07-21', receivedBy: 'Rina' })
    invariant(A); expect(onHand(A)).toBe(oh0 - 2) // only now
    void getDeliveryForOrder(o.id)
  })
})
