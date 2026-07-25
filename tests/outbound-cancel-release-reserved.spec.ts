/**
 * D6 — "Release Reserved stock from a cancelled Outbound (put back to Available)".
 *
 * Rules implemented (see app/data/outgoing.ts):
 *  - Cancel does NOT auto-release the reservation (AC#1). The reserved qty stays
 *    out of Available; the cancelled order exposes a manual "Release Reserved".
 *  - Manual release returns the (un-shipped) reserved qty to Available at the same
 *    batch/serial detail; on-hand never moves, no JE (AC#2).
 *  - Release is idempotent and records actor/timestamp/qty; once released the
 *    reservation is gone and can't be re-held (AC#4).
 *  - Partial-ship-then-cancel (AC#3) is refused (safety) — the ship event never
 *    reduces the reservation in this mock, so releasing a shipped order would
 *    over-return; the cancel gate + the shippedQty guard both prevent it.
 *
 * This suite is the regression net for EVERY cancel scenario the pipeline can be
 * in when an order is cancelled: brand-new, picking-open, picking-in-progress,
 * packed, and shipped.
 */
import { describe, it, expect } from 'vitest'
import {
  addOutgoing, canReleaseReservedForOrder, canCancelOutboundOrder,
  releaseReservedForCancelledOrder, outgoingOrders, type OutgoingOrder,
} from '~/data/outgoing'
import { addPickingTask, startPicking, endPicking, getPickingTask, getPickingForOrder, packableOrderIds } from '~/data/pickingTasks'
import { addPackingTask, endPacking, getPackingTask } from '~/data/packingTasks'
import { addDeliveryTaskFromPackingTasks, handoverToCourierBulk, completeShipment, deliveryTasks } from '~/data/deliveryTasks'
import { syncOutboundOrderStatuses, cancelOutboundOrder } from '~/data/outboundSync'
import { getWarehouseDetail, hasReservationsForTask, reservedQtyForTask } from '~/data/warehouseDetails'

const WH = 'wh-006'
const WH_NAME = 'Gudang Makassar Selatan'
const SKU = '3004' // plain (Accessory) — pure qty reservation, no batch/serial noise
const QTY = 1 // small: the suite reserves cumulatively against ~13 available at wh-006

function stock(sku = SKU, wh = WH) {
  return getWarehouseDetail(wh)!.stock.find((s) => s.sku === sku)!
}
function orderStatus(id: string) {
  return outgoingOrders.find((o) => o.id === id)!.status
}
function getDeliveryStatus(id: string) {
  return deliveryTasks.find((d) => d.id === id)?.status
}
// D2 AC#5 gate — cancellable while nothing shipped (pending/open/in-progress).
const canCancelOrder = canCancelOutboundOrder

// Truly ship a delivery = handover (→ out for delivery) THEN complete the shipment
// (→ shipped, on-hand posted). Handover alone no longer counts as shipped.
function shipDelivery(delId: string) {
  const [res] = handoverToCourierBulk([delId], { assignee: 'Op', transactionDate: '2026-07-11' })
  if (res) completeShipment(res.shipmentSeq, { receivedDate: '2026-07-11', receivedBy: 'Rina' })
}

function makeOrder(sku = SKU, qty = QTY, wh = WH, whName = WH_NAME): OutgoingOrder {
  return addOutgoing({
    salesNo: 'D6 Test', source: 'Manual',
    warehouseId: wh, warehouseName: whName,
    skuQty: 1, orderQty: qty, shippedQty: 0, status: 'pending', dueDate: '2026-08-01',
    lines: [{ sku, productName: 'Test', desc: '', img: '', unit: 'Unit', qty }],
  })
}

describe('D6 — Release reserved on cancelled outbound', () => {
  it('AC#1: cancel does NOT auto-release — reserved stays out of Available, on-hand untouched', () => {
    const before = stock()
    const availBefore = before.available
    const onHandBefore = before.onHand

    const order = makeOrder()
    expect(stock().available).toBe(availBefore - QTY) // reserved on creation

    cancelOutboundOrder(order.id)
    expect(orderStatus(order.id)).toBe('canceled')
    // The whole point of D6: cancel must NOT put the qty back to Available.
    expect(stock().available).toBe(availBefore - QTY)
    expect(stock().onHand).toBe(onHandBefore)
    expect(hasReservationsForTask(order.id)).toBe(true)

    // cleanup so later tests measure clean deltas
    releaseReservedForCancelledOrder(order.id)
  })

  it('AC#1: a cancelled order still holding reservation exposes canReleaseReservedForOrder = true', () => {
    const order = makeOrder()
    expect(canReleaseReservedForOrder(order.id)).toBe(false) // not cancelled yet
    cancelOutboundOrder(order.id)
    expect(canReleaseReservedForOrder(order.id)).toBe(true)
    releaseReservedForCancelledOrder(order.id)
  })

  it('AC#2: manual release returns the full reserved qty to Available; on-hand unchanged; reservation gone', () => {
    const availBefore = stock().available
    const onHandBefore = stock().onHand

    const order = makeOrder()
    cancelOutboundOrder(order.id)
    expect(stock().available).toBe(availBefore - QTY)

    const ok = releaseReservedForCancelledOrder(order.id)
    expect(ok).toBe(true)
    expect(stock().available).toBe(availBefore)      // restored to exactly the starting point
    expect(stock().onHand).toBe(onHandBefore)        // no on-hand movement, no JE
    expect(hasReservationsForTask(order.id)).toBe(false)

    const o = outgoingOrders.find((x) => x.id === order.id)!
    expect(o.reservedReleasedQty).toBe(QTY)
    expect(o.reservedReleasedDate).toBeTruthy()
    expect(o.reservedReleasedBy).toBeTruthy()
  })

  it('AC#2: released qty is immediately allocatable to a new order', () => {
    const availBefore = stock().available
    const order = makeOrder()
    cancelOutboundOrder(order.id)
    releaseReservedForCancelledOrder(order.id)
    expect(stock().available).toBe(availBefore)

    // A fresh order can now reserve the released units.
    const order2 = makeOrder()
    expect(stock().available).toBe(availBefore - QTY)
    cancelOutboundOrder(order2.id)
    releaseReservedForCancelledOrder(order2.id)
    expect(stock().available).toBe(availBefore)
  })

  it('AC#4: release is idempotent — a second release is a no-op, never double-adds to Available', () => {
    const availBefore = stock().available
    const order = makeOrder()
    cancelOutboundOrder(order.id)

    expect(releaseReservedForCancelledOrder(order.id)).toBe(true)
    expect(stock().available).toBe(availBefore)
    const releasedQty = outgoingOrders.find((x) => x.id === order.id)!.reservedReleasedQty

    // Second call: refused, no re-hold, Available unchanged (not availBefore + QTY).
    expect(releaseReservedForCancelledOrder(order.id)).toBe(false)
    expect(canReleaseReservedForOrder(order.id)).toBe(false)
    expect(stock().available).toBe(availBefore)
    expect(outgoingOrders.find((x) => x.id === order.id)!.reservedReleasedQty).toBe(releasedQty)
  })

  it('D2 gate: cancellable while nothing shipped (pending/open/in-progress); blocked once shipped', () => {
    // pending
    const pending = makeOrder()
    expect(orderStatus(pending.id)).toBe('pending')
    expect(canCancelOrder(outgoingOrders.find((o) => o.id === pending.id)!)).toBe(true)

    // open — a picking task exists, none started
    const openOrder = makeOrder()
    addPickingTask({ salesOrderIds: [openOrder.id], salesNos: [openOrder.salesNo], warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    syncOutboundOrderStatuses()
    expect(orderStatus(openOrder.id)).toBe('open')
    expect(canCancelOrder(outgoingOrders.find((o) => o.id === openOrder.id)!)).toBe(true)

    // in progress — picking started → NOW cancellable (D2 widened the gate)
    const pickingOrder = makeOrder()
    const pt = addPickingTask({ salesOrderIds: [pickingOrder.id], salesNos: [pickingOrder.salesNo], warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    startPicking(pt.id)
    syncOutboundOrderStatuses()
    expect(orderStatus(pickingOrder.id)).toBe('in progress')
    expect(canCancelOrder(outgoingOrders.find((o) => o.id === pickingOrder.id)!)).toBe(true)

    // packed — packing completed (still nothing shipped) → cancellable
    const packedOrder = makeOrder()
    const pt2 = addPickingTask({ salesOrderIds: [packedOrder.id], salesNos: [packedOrder.salesNo], warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    startPicking(pt2.id)
    endPicking(pt2.id, { [`${packedOrder.id}::${SKU}`]: QTY })
    const pk = addPackingTask({ salesOrderId: packedOrder.id, salesNo: packedOrder.salesNo, pickingTaskId: pt2.id, pickingTaskNo: pt2.taskNo, warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    endPacking(pk.id, { [`${packedOrder.id}::${SKU}`]: QTY })
    syncOutboundOrderStatuses()
    expect(canCancelOrder(outgoingOrders.find((o) => o.id === packedOrder.id)!)).toBe(true)

    // shipped — handed to courier → NOT cancellable (posting guard)
    const shippedOrder = makeOrder()
    const pt3 = addPickingTask({ salesOrderIds: [shippedOrder.id], salesNos: [shippedOrder.salesNo], warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    startPicking(pt3.id)
    endPicking(pt3.id, { [`${shippedOrder.id}::${SKU}`]: QTY })
    const pk3 = addPackingTask({ salesOrderId: shippedOrder.id, salesNo: shippedOrder.salesNo, pickingTaskId: pt3.id, pickingTaskNo: pt3.taskNo, warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    endPacking(pk3.id, { [`${shippedOrder.id}::${SKU}`]: QTY })
    const del = addDeliveryTaskFromPackingTasks([getPackingTask(pk3.id)!], { assignee: 'Op' })
    shipDelivery(del.id)
    syncOutboundOrderStatuses()
    const shipped = outgoingOrders.find((o) => o.id === shippedOrder.id)!
    expect(['partially shipped', 'completed']).toContain(shipped.status)
    expect(canCancelOrder(shipped)).toBe(false)

    // cleanup the still-held reservations from the cancellable fixtures
    for (const o of [pending, openOrder, pickingOrder, packedOrder]) {
      cancelOutboundOrder(o.id); releaseReservedForCancelledOrder(o.id)
    }
  })

  it('D2: cancel is REJECTED once shipped (posting guard) with a reason; order stays', () => {
    const order = makeOrder(SKU, 2)
    const pt = addPickingTask({ salesOrderIds: [order.id], salesNos: [order.salesNo], warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    startPicking(pt.id)
    endPicking(pt.id, { [`${order.id}::${SKU}`]: 1 })
    const pk = addPackingTask({ salesOrderId: order.id, salesNo: order.salesNo, pickingTaskId: pt.id, pickingTaskNo: pt.taskNo, warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    endPacking(pk.id, { [`${order.id}::${SKU}`]: 1 })
    const del = addDeliveryTaskFromPackingTasks([getPackingTask(pk.id)!], { assignee: 'Op' })
    shipDelivery(del.id)
    syncOutboundOrderStatuses()
    expect(orderStatus(order.id)).toBe('partially shipped')

    const res = cancelOutboundOrder(order.id)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('OUTBOUND_ALREADY_SHIPPED')
    expect(orderStatus(order.id)).toBe('partially shipped') // unchanged — not cancelled
  })

  it('D2 cascade: cancelling an in-progress order cancels its picking task + holds reservation', () => {
    const order = makeOrder()
    const pt = addPickingTask({ salesOrderIds: [order.id], salesNos: [order.salesNo], warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    startPicking(pt.id)
    syncOutboundOrderStatuses()
    expect(orderStatus(order.id)).toBe('in progress')

    const res = cancelOutboundOrder(order.id)
    expect(res.ok).toBe(true)
    expect(orderStatus(order.id)).toBe('canceled')
    expect(getPickingTask(pt.id)!.status).toBe('canceled') // in-progress picking cascaded
    expect(reservedQtyForTask(order.id)).toBe(QTY)          // reservation still held
    releaseReservedForCancelledOrder(order.id)
    expect(reservedQtyForTask(order.id)).toBe(0)            // released
  })

  it('D2 cascade: cancelling a ready-to-ship order cancels the delivery task', () => {
    const order = makeOrder()
    const pt = addPickingTask({ salesOrderIds: [order.id], salesNos: [order.salesNo], warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    startPicking(pt.id)
    endPicking(pt.id, { [`${order.id}::${SKU}`]: QTY })
    const pk = addPackingTask({ salesOrderId: order.id, salesNo: order.salesNo, pickingTaskId: pt.id, pickingTaskNo: pt.taskNo, warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    endPacking(pk.id, { [`${order.id}::${SKU}`]: QTY })
    const del = addDeliveryTaskFromPackingTasks([getPackingTask(pk.id)!], { assignee: 'Op' })
    expect(del.status).toBe('ready to ship')

    const res = cancelOutboundOrder(order.id)
    expect(res.ok).toBe(true)
    // ready-to-ship delivery cancelled; the sole-order COMPLETED picking & packing STAY
    // completed (PRD D2 AC#6 — done work is a permanent record) — reservation still held.
    expect(getDeliveryStatus(del.id)).toBe('canceled')
    expect(getPackingTask(pk.id)!.status).toBe('completed')
    expect(getPickingTask(pt.id)!.status).toBe('completed')
    expect(reservedQtyForTask(order.id)).toBe(QTY)
    releaseReservedForCancelledOrder(order.id)
    expect(reservedQtyForTask(order.id)).toBe(0)
  })

  it('D2 cascade: a SHARED picking task is NOT cancelled — the cancelled order stays LINKED (visible on both detail pages) but not packable', () => {
    const orderA = makeOrder()
    const orderB = makeOrder()
    const pt = addPickingTask({
      salesOrderIds: [orderA.id, orderB.id],
      salesNos: [orderA.salesNo, orderB.salesNo],
      warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op',
    })
    expect(pt.salesOrderIds).toHaveLength(2)

    const res = cancelOutboundOrder(orderA.id)
    expect(res.ok).toBe(true)
    const t = getPickingTask(pt.id)!
    expect(t.status).not.toBe('canceled')                       // shared task survives
    // Order A is KEPT on the task so it stays under Linked transactions on both A's
    // order detail and the picking task detail — it's just no longer packable.
    expect(t.salesOrderIds.sort()).toEqual([orderA.id, orderB.id].sort())
    expect(getPickingForOrder(orderA.id).map((x) => x.id)).toContain(pt.id) // still linked to A
    expect(packableOrderIds(t)).not.toContain(orderA.id)        // A excluded (nothing picked here)

    releaseReservedForCancelledOrder(orderA.id)
    cancelOutboundOrder(orderB.id); releaseReservedForCancelledOrder(orderB.id)
  })

  it('scenario: cancel while a picking task is open keeps the reservation; release restores Available', () => {
    const order = makeOrder()
    addPickingTask({ salesOrderIds: [order.id], salesNos: [order.salesNo], warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    syncOutboundOrderStatuses()

    cancelOutboundOrder(order.id)
    expect(reservedQtyForTask(order.id)).toBe(QTY) // still held after cancel
    const onHandBefore = stock().onHand
    releaseReservedForCancelledOrder(order.id)
    expect(reservedQtyForTask(order.id)).toBe(0)          // released
    expect(stock().onHand).toBe(onHandBefore)             // on-hand untouched
  })

  it('scenario: cancel after picking in progress keeps the reservation; release restores Available; on-hand untouched', () => {
    const order = makeOrder()
    const pt = addPickingTask({ salesOrderIds: [order.id], salesNos: [order.salesNo], warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    startPicking(pt.id)
    endPicking(pt.id, { [`${order.id}::${SKU}`]: QTY })
    syncOutboundOrderStatuses()

    cancelOutboundOrder(order.id)
    expect(reservedQtyForTask(order.id)).toBe(QTY)
    const onHandBefore = stock().onHand
    releaseReservedForCancelledOrder(order.id)
    expect(reservedQtyForTask(order.id)).toBe(0)
    expect(stock().onHand).toBe(onHandBefore)
  })

  it('scenario: cancel after packed keeps the reservation; release restores Available', () => {
    const order = makeOrder()
    const pt = addPickingTask({ salesOrderIds: [order.id], salesNos: [order.salesNo], warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    startPicking(pt.id)
    endPicking(pt.id, { [`${order.id}::${SKU}`]: QTY })
    const pk = addPackingTask({ salesOrderId: order.id, salesNo: order.salesNo, pickingTaskId: pt.id, pickingTaskNo: pt.taskNo, warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    endPacking(pk.id, { [`${order.id}::${SKU}`]: QTY })
    syncOutboundOrderStatuses()

    cancelOutboundOrder(order.id)
    expect(reservedQtyForTask(order.id)).toBe(QTY)
    releaseReservedForCancelledOrder(order.id)
    expect(reservedQtyForTask(order.id)).toBe(0)
  })

  it('AC#3 safety: a partially-shipped-then-cancelled order refuses release (no over-return of shipped units)', () => {
    // Order qty 2, pick/pack/ship only 1 → partially shipped, still holds reservation.
    const order = makeOrder(SKU, 2)
    const pt = addPickingTask({ salesOrderIds: [order.id], salesNos: [order.salesNo], warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    startPicking(pt.id)
    endPicking(pt.id, { [`${order.id}::${SKU}`]: 1 })
    const pk = addPackingTask({ salesOrderId: order.id, salesNo: order.salesNo, pickingTaskId: pt.id, pickingTaskNo: pt.taskNo, warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    endPacking(pk.id, { [`${order.id}::${SKU}`]: 1 })
    const del = addDeliveryTaskFromPackingTasks([getPackingTask(pk.id)!], { assignee: 'Op' })
    shipDelivery(del.id)
    syncOutboundOrderStatuses()
    expect(orderStatus(order.id)).toBe('partially shipped')

    // Force-cancel (bypassing the UI gate) and confirm release is REFUSED because
    // some units shipped — releasing all held reserved would over-return them.
    cancelOutboundOrder(order.id)
    expect(canReleaseReservedForOrder(order.id)).toBe(false)
    expect(releaseReservedForCancelledOrder(order.id)).toBe(false)
  })

  it('granularity: batch-tracked SKU holds/releases at the batch level (aggregate available restores)', () => {
    const BSKU = '1002' // Green Beans — batch-tracked
    const BWH = 'wh-001'
    const item = getWarehouseDetail(BWH)!.stock.find((s) => s.sku === BSKU)
    if (!item || item.available < 1) return // skip if not stocked here
    const availBefore = item.available
    const onHandBefore = item.onHand

    const order = makeOrder(BSKU, 1, BWH, 'Gudang Jakarta Pusat')
    expect(getWarehouseDetail(BWH)!.stock.find((s) => s.sku === BSKU)!.available).toBe(availBefore - 1)

    cancelOutboundOrder(order.id)
    expect(getWarehouseDetail(BWH)!.stock.find((s) => s.sku === BSKU)!.available).toBe(availBefore - 1) // held
    releaseReservedForCancelledOrder(order.id)
    const after = getWarehouseDetail(BWH)!.stock.find((s) => s.sku === BSKU)!
    expect(after.available).toBe(availBefore) // restored
    expect(after.onHand).toBe(onHandBefore)   // on-hand never moved
  })

  it('cascade: cancelling an order cancels its still-open picking task', () => {
    const order = makeOrder()
    const pt = addPickingTask({ salesOrderIds: [order.id], salesNos: [order.salesNo], warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    expect(getPickingTask(pt.id)!.status).toBe('open')

    cancelOutboundOrder(order.id)
    expect(getPickingTask(pt.id)!.status).toBe('canceled') // no orphan open task
    releaseReservedForCancelledOrder(order.id)
  })

  it('cascade: cancelling an order cancels its still-open packing task', () => {
    const order = makeOrder()
    const pt = addPickingTask({ salesOrderIds: [order.id], salesNos: [order.salesNo], warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    startPicking(pt.id)
    endPicking(pt.id, { [`${order.id}::${SKU}`]: QTY })
    const pk = addPackingTask({ salesOrderId: order.id, salesNo: order.salesNo, pickingTaskId: pt.id, pickingTaskNo: pt.taskNo, warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    expect(getPackingTask(pk.id)!.status).toBe('open')

    cancelOutboundOrder(order.id)
    expect(getPackingTask(pk.id)!.status).toBe('canceled') // no orphan open packing task
    releaseReservedForCancelledOrder(order.id)
  })

  it('invariant: available = onHand − reserved holds while cancelled-held and after release', () => {
    const order = makeOrder()
    cancelOutboundOrder(order.id)
    let s = stock()
    expect(s.available).toBe(s.onHand - s.reserved) // held
    releaseReservedForCancelledOrder(order.id)
    s = stock()
    expect(s.available).toBe(s.onHand - s.reserved) // after release
  })
})
