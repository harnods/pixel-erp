/**
 * Outbound cancel-order scenario matrix (Notion "Outbound cancel order scenario"),
 * validated against WMS PRD 1.2 D2 AC#5 (posting guard) / AC#6 (cascade), PRD-literal:
 *   - Picking/Packing Completed → STAYS Completed; Open/In-progress → Canceled.
 *   - SHARED picking: Open → drop this order's lines (proceed, no ack); In-progress →
 *     Needs Ack; Completed → stays. Other orders never affected.
 *   - Shipping (delivery) Open/In-progress → Canceled; Shipped → cancel rejected.
 *   - Reservation is KEPT on cancel, released via manual Release Reserved (D6).
 */
import { describe, it, expect } from 'vitest'
import { addOutgoing, outgoingOrders, releaseReservedForCancelledOrder, canReleaseReservedForOrder, type OutgoingOrder } from '~/data/outgoing'
import {
  addPickingTask, startPicking, endPicking, getPickingTask, getPickingForOrder,
  acknowledgeCanceledPickingOrders,
} from '~/data/pickingTasks'
import { addPackingTask, startPacking, endPacking, getPackingTask } from '~/data/packingTasks'
import {
  addDeliveryTaskFromPackingTasks, handoverToCourierBulk, completeShipment,
  getDeliveryTask, getDeliveryForOrder,
} from '~/data/deliveryTasks'
import { cancelOutboundOrder, syncOutboundOrderStatuses } from '~/data/outboundSync'
import { reservedQtyForTask } from '~/data/warehouseDetails'

const WH = 'wh-006', WH_NAME = 'Gudang Makassar Selatan'
const A = '3004', B = '3005'
const K = (orderId: string, sku: string) => `${orderId}::${sku}`
const line = (sku: string, qty: number) => ({ sku, productName: 'T', desc: '', img: '', unit: 'Unit', qty })
function order(lines: ReturnType<typeof line>[]): OutgoingOrder {
  return addOutgoing({
    salesNo: 'CANCScn', source: 'Manual', warehouseId: WH, warehouseName: WH_NAME,
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
const rStat = (id: string) => getPickingTask(id)!.status
const pStat = (id: string) => getPackingTask(id)!.status
const oStat = (id: string) => outgoingOrders.find((o) => o.id === id)!.status
/** Cancel + verify success. */
function cancel(o: OutgoingOrder) { return cancelOutboundOrder(o.id) }

// ─── Table 1 — 1 order · 1 picking · 1 packing · 1 shipment ──────────────────
describe('Outbound cancel T1 — single order, single chain', () => {
  it('T1.1 picking Open → Canceled', () => {
    const o = order([line(A, 2)]); const pt = pickTask([o])
    expect(cancel(o).ok).toBe(true)
    expect(rStat(pt.id)).toBe('canceled')
  })

  it('T1.2 picking In progress → Canceled', () => {
    const o = order([line(A, 2)]); const pt = pickTask([o]); startPicking(pt.id)
    cancel(o)
    expect(rStat(pt.id)).toBe('canceled')
  })

  it('T1.3 picking Completed → STAYS Completed', () => {
    const o = order([line(A, 2)]); const pt = pickTask([o]); startPicking(pt.id); endPicking(pt.id, { [K(o.id, A)]: 2 })
    expect(rStat(pt.id)).toBe('completed')
    cancel(o)
    expect(rStat(pt.id)).toBe('completed') // done work is a permanent record
    expect(oStat(o.id)).toBe('canceled')
  })

  it('T1.4 picking Completed + packing Open → picking stays, packing Canceled', () => {
    const o = order([line(A, 2)]); const pt = pickTask([o]); startPicking(pt.id); endPicking(pt.id, { [K(o.id, A)]: 2 })
    const pk = packFor(o, pt)
    cancel(o)
    expect(rStat(pt.id)).toBe('completed')
    expect(pStat(pk.id)).toBe('canceled')
  })

  it('T1.5 picking Completed + packing In progress → picking stays, packing Canceled (no ack, sole)', () => {
    const o = order([line(A, 2)]); const pt = pickTask([o]); startPicking(pt.id); endPicking(pt.id, { [K(o.id, A)]: 2 })
    const pk = packFor(o, pt); startPacking(pk.id)
    cancel(o)
    expect(rStat(pt.id)).toBe('completed')
    expect(pStat(pk.id)).toBe('canceled')
  })

  it('T1.6 picking+packing Completed + delivery Ready to ship → stays, delivery Canceled', () => {
    const o = order([line(A, 2)]); const pt = pickTask([o]); startPicking(pt.id); endPicking(pt.id, { [K(o.id, A)]: 2 })
    const pk = packFor(o, pt); endPacking(pk.id, { [K(o.id, A)]: 2 })
    const del = addDeliveryTaskFromPackingTasks([getPackingTask(pk.id)!], { assignee: 'Op' })
    expect(del.status).toBe('ready to ship')
    cancel(o)
    expect(rStat(pt.id)).toBe('completed'); expect(pStat(pk.id)).toBe('completed')
    expect(getDeliveryTask(del.id)!.status).toBe('canceled')
  })

  it('T1.7 Out for delivery (shipment open, on-hand not deducted) → still cancelable, delivery Canceled', () => {
    const o = order([line(A, 2)]); const pt = pickTask([o]); startPicking(pt.id); endPicking(pt.id, { [K(o.id, A)]: 2 })
    const pk = packFor(o, pt); endPacking(pk.id, { [K(o.id, A)]: 2 })
    const del = addDeliveryTaskFromPackingTasks([getPackingTask(pk.id)!], { assignee: 'Op' })
    handoverToCourierBulk([del.id], { assignee: 'Op', transactionDate: '2026-07-20' })
    expect(getDeliveryTask(del.id)!.status).toBe('out for delivery')
    expect(cancel(o).ok).toBe(true)
    expect(getDeliveryTask(del.id)!.status).toBe('canceled')
    expect(rStat(pt.id)).toBe('completed'); expect(pStat(pk.id)).toBe('completed')
  })

  it('T1.8 Shipped → cancel REJECTED (posting guard)', () => {
    const o = order([line(A, 2)]); const pt = pickTask([o]); startPicking(pt.id); endPicking(pt.id, { [K(o.id, A)]: 2 })
    const pk = packFor(o, pt); endPacking(pk.id, { [K(o.id, A)]: 2 })
    const del = addDeliveryTaskFromPackingTasks([getPackingTask(pk.id)!], { assignee: 'Op' })
    const [s] = handoverToCourierBulk([del.id], { assignee: 'Op', transactionDate: '2026-07-20' })
    completeShipment(s!.shipmentSeq, { receivedDate: '2026-07-21', receivedBy: 'Rina' })
    syncOutboundOrderStatuses()
    const res = cancel(o)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(['OUTBOUND_ALREADY_SHIPPED', 'OUTBOUND_CANNOT_CANCEL_COMPLETED']).toContain(res.reason)
  })
})

// ─── Table 3 — multiple orders · 1 shared picking ────────────────────────────
describe('Outbound cancel T3 — shared picking (multi-order)', () => {
  it('T3.1 shared picking Open, cancel A → A dropped from pick work (no ack), picking stays Open for B, A kept linked', () => {
    const a = order([line(A, 2)]); const b = order([line(A, 3)]); const pt = pickTask([a, b])
    expect(getPickingTask(pt.id)!.salesOrderIds).toEqual([a.id, b.id])
    cancel(a)
    const t = getPickingTask(pt.id)!
    expect(t.status).toBe('open') // NOT canceled — B still live
    expect(t.needsCancelAck).toBe(false) // Open → auto-dropped, no ack banner
    expect(t.salesOrderIds).toEqual([a.id, b.id]) // A kept linked for audit
    expect(t.toPickQty).toBe(3) // A's lines dropped from the pick work (only B's 3 left)
    expect(oStat(a.id)).toBe('canceled'); expect(oStat(b.id)).not.toBe('canceled')
  })

  it('T3.2 shared picking In progress, cancel A → Needs Ack; after ack A drops, stays for B', () => {
    const a = order([line(A, 2)]); const b = order([line(A, 3)]); const pt = pickTask([a, b]); startPicking(pt.id)
    cancel(a)
    const t1 = getPickingTask(pt.id)!
    expect(t1.status).not.toBe('canceled') // shared, not cancelled
    expect(t1.needsCancelAck).toBe(true)
    expect(t1.salesOrderIds).toContain(a.id) // still linked pending ack
    acknowledgeCanceledPickingOrders(pt.id)
    const t2 = getPickingTask(pt.id)!
    expect(t2.needsCancelAck).toBe(false)
    expect(t2.salesOrderIds).toContain(a.id) // kept for audit
    expect(t2.salesOrderIds).toContain(b.id)
  })

  it('T3.3 shared picking Completed, cancel A → picking STAYS Completed; A packing Canceled; B unaffected', () => {
    const a = order([line(A, 2)]); const b = order([line(A, 3)]); const pt = pickTask([a, b])
    startPicking(pt.id); endPicking(pt.id, { [K(a.id, A)]: 2, [K(b.id, A)]: 3 })
    expect(getPickingTask(pt.id)!.status).toBe('completed')
    const pkA = packFor(a, pt)
    cancel(a)
    expect(getPickingTask(pt.id)!.status).toBe('completed') // stays
    expect(pStat(pkA.id)).toBe('canceled') // A's own packing voided
    expect(oStat(b.id)).not.toBe('canceled')
  })

  it('T3.4 shared picking Open, cancel BOTH → picking Canceled (no order left)', () => {
    const a = order([line(A, 2)]); const b = order([line(A, 3)]); const pt = pickTask([a, b])
    cancel(a); cancel(b)
    expect(getPickingTask(pt.id)!.status).toBe('canceled')
  })

  it('T3.5 shared picking In progress, cancel BOTH → picking Canceled', () => {
    const a = order([line(A, 2)]); const b = order([line(A, 3)]); const pt = pickTask([a, b]); startPicking(pt.id)
    cancel(a); cancel(b)
    expect(getPickingTask(pt.id)!.status).toBe('canceled')
  })
})

// ─── Multi-order + partial completion in a task ──────────────────────────────
describe('Outbound cancel — multi-order + partial pick', () => {
  it('shared picking partially picked, cancel one order → task NOT cancelled (Needs Ack), other order stays', () => {
    const a = order([line(A, 2)]); const b = order([line(A, 3)]); const pt = pickTask([a, b])
    startPicking(pt.id)
    // pick only A's line (partial across the task)
    endPicking(pt.id, { [K(a.id, A)]: 2 })
    const st = getPickingTask(pt.id)!.status
    expect(['in progress', 'partially picked']).toContain(st) // not completed (B unpicked)
    cancel(a)
    const t = getPickingTask(pt.id)!
    expect(t.status).not.toBe('canceled') // B still live → task survives
    expect(t.needsCancelAck).toBe(true)
    expect(oStat(b.id)).not.toBe('canceled')
  })

  it('sole-order partially picked → Canceled on order cancel', () => {
    const o = order([line(A, 2), line(B, 2)]); const pt = pickTask([o])
    startPicking(pt.id)
    endPicking(pt.id, { [K(o.id, A)]: 2 }) // B not picked → partial
    expect(getPickingTask(pt.id)!.status).not.toBe('completed')
    cancel(o)
    expect(rStat(pt.id)).toBe('canceled') // sole order, not completed → canceled
  })
})

// ─── Reservation release (D6) ────────────────────────────────────────────────
describe('Outbound cancel — reservation kept, released via manual Release Reserved (D6)', () => {
  it('cancel keeps the reservation; releaseReservedForCancelledOrder frees it', () => {
    const o = order([line(A, 2)]); pickTask([o])
    expect(reservedQtyForTask(o.id)).toBe(2)
    cancel(o)
    // Still held after cancel (NOT auto-released).
    expect(reservedQtyForTask(o.id)).toBe(2)
    expect(canReleaseReservedForOrder(o.id)).toBe(true)
    // Manual release (D6) frees it; idempotent.
    expect(releaseReservedForCancelledOrder(o.id)).toBe(true)
    expect(reservedQtyForTask(o.id)).toBe(0)
    expect(canReleaseReservedForOrder(o.id)).toBe(false)
    expect(releaseReservedForCancelledOrder(o.id)).toBe(false) // idempotent no-op
  })

  it('shared picking: cancel A → only A releasable; B keeps its reservation', () => {
    const a = order([line(A, 2)]); const b = order([line(A, 3)]); pickTask([a, b])
    expect(reservedQtyForTask(a.id)).toBe(2); expect(reservedQtyForTask(b.id)).toBe(3)
    cancel(a)
    expect(canReleaseReservedForOrder(a.id)).toBe(true)
    expect(canReleaseReservedForOrder(b.id)).toBe(false) // B still live
    releaseReservedForCancelledOrder(a.id)
    expect(reservedQtyForTask(a.id)).toBe(0)
    expect(reservedQtyForTask(b.id)).toBe(3) // B untouched
  })

  it('a Completed-picking order that is cancelled still releases its reservation (goods returned)', () => {
    const o = order([line(A, 2)]); const pt = pickTask([o]); startPicking(pt.id); endPicking(pt.id, { [K(o.id, A)]: 2 })
    cancel(o)
    expect(rStat(pt.id)).toBe('completed') // picking stays
    expect(reservedQtyForTask(o.id)).toBe(2) // still reserved (picked into tote)
    expect(releaseReservedForCancelledOrder(o.id)).toBe(true)
    expect(reservedQtyForTask(o.id)).toBe(0)
  })
})

// ─── Table 4 — multiple orders · 1 shared shipment (bulk handover) ────────────
describe('Outbound cancel T4 — shared shipment (bulk handover)', () => {
  function shipReady(o: OutgoingOrder) {
    const pt = pickTask([o]); startPicking(pt.id); endPicking(pt.id, { [K(o.id, A)]: 2 })
    const pk = packFor(o, pt); endPacking(pk.id, { [K(o.id, A)]: 2 })
    return addDeliveryTaskFromPackingTasks([getPackingTask(pk.id)!], { assignee: 'Op' })
  }
  it('cancel A from a shared Out-for-delivery shipment → A delivery Canceled, B unaffected', () => {
    const a = order([line(A, 2)]); const b = order([line(A, 2)])
    const delA = shipReady(a); const delB = shipReady(b)
    handoverToCourierBulk([delA.id, delB.id], { assignee: 'Op', transactionDate: '2026-07-20' })
    expect(getDeliveryTask(delA.id)!.status).toBe('out for delivery')
    expect(getDeliveryTask(delB.id)!.status).toBe('out for delivery')
    expect(cancel(a).ok).toBe(true)
    expect(getDeliveryTask(delA.id)!.status).toBe('canceled') // A's package canceled
    expect(getDeliveryTask(delB.id)!.status).toBe('out for delivery') // B untouched
    expect(oStat(b.id)).not.toBe('canceled')
  })
})
