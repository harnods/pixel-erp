/**
 * Outbound happy-path (non-cancel) — the combined MULTIPLE-ORDER / MULTIPLE-PICKING /
 * PARTIAL cases through to SHIPMENT. Complements the existing outbound-flow /
 * outbound-e2e-scenarios / partial-shipment-repeat-cycle specs by pinning the
 * gaps flagged in the outbound regression map:
 *   G1 — two ORDERS in ONE shared picking, one order partially picked → both flow
 *        to packing + a shared shipment; on-hand posts only at Shipped, only the
 *        shipped qty.
 *   G2 — one ORDER split across TWO picking tasks (partial each) → both feed
 *        packing → combined into ONE delivery (SKU union), then shipped.
 *   G3 — PARTIAL packing (pack fewer than picked) → partial shipment; on-hand
 *        posts only the packed/shipped qty.
 *
 * Invariant throughout: on-hand only moves at completeShipment (Shipped), never at
 * pick/pack/handover (out-for-delivery is reversible).
 */
import { describe, it, expect } from 'vitest'
import { addOutgoing, outgoingOrders, type OutgoingOrder } from '~/data/outgoing'
import {
  addPickingTask, startPicking, endPicking, getPickingTask,
  packableOrderIds, orderPickedTotal,
} from '~/data/pickingTasks'
import { addPackingTask, endPacking, getPackingTask } from '~/data/packingTasks'
import {
  addDeliveryTaskFromPackingTasks, handoverToCourierBulk, completeShipment, getDeliveryTask,
} from '~/data/deliveryTasks'
import { getWarehouseDetail } from '~/data/warehouseDetails'

const WH = 'wh-006', WH_NAME = 'Gudang Makassar Selatan'
const A = '3004', B = '3005'
const K = (orderId: string, sku: string) => `${orderId}::${sku}`
const line = (sku: string, qty: number) => ({ sku, productName: 'T', desc: '', img: '', unit: 'Unit', qty })
function order(lines: ReturnType<typeof line>[]): OutgoingOrder {
  return addOutgoing({
    salesNo: 'MOP', source: 'Manual', warehouseId: WH, warehouseName: WH_NAME,
    skuQty: lines.length, orderQty: lines.reduce((s, l) => s + l.qty, 0), shippedQty: 0,
    status: 'pending', dueDate: '2026-08-01', lines,
  })
}
function pickTask(orders: OutgoingOrder[]) {
  return addPickingTask({
    salesOrderIds: orders.map((o) => o.id), salesNos: orders.map((o) => o.salesNo),
    warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op',
  })
}
function packFor(o: OutgoingOrder, pt: { id: string; taskNo: string }) {
  return addPackingTask({ salesOrderId: o.id, salesNo: o.salesNo, pickingTaskId: pt.id, pickingTaskNo: pt.taskNo, warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
}
const stockOf = (sku: string) => getWarehouseDetail(WH)!.stock.find((s) => s.sku === sku)!
const del = (id: string) => getDeliveryTask(id)!

describe('Outbound multi-order / multi-picking / partial → shipment', () => {
  it('G1 two orders in one shared picking, one partially picked → both pack + shared shipment, on-hand posts only shipped', () => {
    const oA = order([line(A, 3)])
    const oB = order([line(A, 2)])
    const pt = pickTask([oA, oB])
    startPicking(pt.id)
    endPicking(pt.id, { [K(oA.id, A)]: 3, [K(oB.id, A)]: 1 }) // oB short (1 of 2)
    expect(getPickingTask(pt.id)!.status).toBe('partially picked')
    // Non-marketplace: any picked qty is packable → BOTH orders packable.
    expect(packableOrderIds(getPickingTask(pt.id)!).sort()).toEqual([oA.id, oB.id].sort())

    const base = stockOf(A).onHand
    const pkA = packFor(oA, pt); endPacking(pkA.id, { [K(oA.id, A)]: 3 })
    const pkB = packFor(oB, pt); endPacking(pkB.id, { [K(oB.id, A)]: 1 })

    const dA = addDeliveryTaskFromPackingTasks([getPackingTask(pkA.id)!], { assignee: 'Op' })
    const dB = addDeliveryTaskFromPackingTasks([getPackingTask(pkB.id)!], { assignee: 'Op' })
    expect(dA.toShipQty).toBe(3)
    expect(dB.toShipQty).toBe(1)

    const shipments = handoverToCourierBulk([dA.id, dB.id], { assignee: 'Op', transactionDate: '2026-07-24' })
    // Out for delivery → on-hand NOT yet moved (reversible).
    expect(del(dA.id).status).toBe('out for delivery')
    expect(del(dB.id).status).toBe('out for delivery')
    expect(stockOf(A).onHand).toBe(base)

    for (const s of shipments) completeShipment(s.shipmentSeq, { receivedDate: '2026-07-25', receivedBy: 'Rina' })
    expect(del(dA.id).status).toBe('shipped')
    expect(del(dB.id).status).toBe('shipped')
    // On-hand deducted by exactly what shipped across both orders: 3 + 1 = 4.
    expect(stockOf(A).onHand).toBe(base - 4)
  })

  it('G2 one order split across two picking tasks (partial each) → both feed packing → one combined delivery, shipped', () => {
    const o = order([line(A, 5)])
    const pt1 = pickTask([o]); startPicking(pt1.id); endPicking(pt1.id, { [K(o.id, A)]: 2 })
    const pt2 = pickTask([o]); startPicking(pt2.id); endPicking(pt2.id, { [K(o.id, A)]: 3 })
    expect(orderPickedTotal(o.id)).toBe(5) // aggregated across both lists

    const base = stockOf(A).onHand
    const pk1 = packFor(o, pt1); endPacking(pk1.id, { [K(o.id, A)]: 2 })
    const pk2 = packFor(o, pt2); endPacking(pk2.id, { [K(o.id, A)]: 3 })

    // Both packing tasks of the SAME order bundle into ONE delivery — SKU union 2 + 3 = 5.
    const d = addDeliveryTaskFromPackingTasks([getPackingTask(pk1.id)!, getPackingTask(pk2.id)!], { assignee: 'Op' })
    expect(d.toShipQty).toBe(5)

    const [s] = handoverToCourierBulk([d.id], { assignee: 'Op', transactionDate: '2026-07-24' })
    expect(stockOf(A).onHand).toBe(base) // out for delivery, not yet posted
    completeShipment(s!.shipmentSeq, { receivedDate: '2026-07-25', receivedBy: 'Rina' })
    expect(del(d.id).status).toBe('shipped')
    expect(stockOf(A).onHand).toBe(base - 5)
  })

  it('G3 partial packing (pack fewer than picked) → partial shipment, on-hand posts only packed', () => {
    const o = order([line(A, 5)])
    const pt = pickTask([o]); startPicking(pt.id); endPicking(pt.id, { [K(o.id, A)]: 5 }) // picked all 5
    const base = stockOf(A).onHand

    const pk = packFor(o, pt); endPacking(pk.id, { [K(o.id, A)]: 3 }) // pack only 3 of 5
    const d = addDeliveryTaskFromPackingTasks([getPackingTask(pk.id)!], { assignee: 'Op' })
    expect(d.toShipQty).toBe(3) // only the packed qty ships

    const [s] = handoverToCourierBulk([d.id], { assignee: 'Op', transactionDate: '2026-07-24' })
    completeShipment(s!.shipmentSeq, { receivedDate: '2026-07-25', receivedBy: 'Rina' })
    expect(del(d.id).status).toBe('shipped')
    expect(stockOf(A).onHand).toBe(base - 3) // only 3 packed/shipped posted, not 5
  })

  it('G4 two DIFFERENT-SKU orders in one shared picking → each fully picked, both ship, on-hand posts per SKU', () => {
    const oA = order([line(A, 2)])
    const oB = order([line(B, 4)])
    const pt = pickTask([oA, oB])
    startPicking(pt.id)
    endPicking(pt.id, { [K(oA.id, A)]: 2, [K(oB.id, B)]: 4 })
    expect(getPickingTask(pt.id)!.status).toBe('completed')

    const baseA = stockOf(A).onHand, baseB = stockOf(B).onHand
    const pkA = packFor(oA, pt); endPacking(pkA.id, { [K(oA.id, A)]: 2 })
    const pkB = packFor(oB, pt); endPacking(pkB.id, { [K(oB.id, B)]: 4 })
    const dA = addDeliveryTaskFromPackingTasks([getPackingTask(pkA.id)!], { assignee: 'Op' })
    const dB = addDeliveryTaskFromPackingTasks([getPackingTask(pkB.id)!], { assignee: 'Op' })
    const shipments = handoverToCourierBulk([dA.id, dB.id], { assignee: 'Op', transactionDate: '2026-07-24' })
    for (const s of shipments) completeShipment(s.shipmentSeq, { receivedDate: '2026-07-25', receivedBy: 'Rina' })
    expect(stockOf(A).onHand).toBe(baseA - 2)
    expect(stockOf(B).onHand).toBe(baseB - 4)
  })
})
