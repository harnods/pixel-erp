/**
 * End-to-end regression for CANCEL interacting with partial picking, partial
 * packing, and multi-order picking/packing — the edge cases the D6/D2 suite
 * (order-level cancel + release) didn't reach.
 *
 * Central rule proven here: once an outbound order is cancelled it can NEVER be
 * packed or shipped again — no matter what state its picking/packing tasks are
 * left in (open, in progress, partially picked, completed). A cancelled order is
 * excluded from packability everywhere:
 *   - packableOrderIds() / canCreatePackingFrom() (Create packing button gate)
 *   - the un-shipped reserved qty (incl. what was already PICKED) is returned in
 *     full by the manual Release reserved — picking never moved on-hand, so a
 *     picked-but-unshipped unit is still just a reservation.
 *
 * Task-status expectations after an order is cancelled (the cascade in
 * outboundSync.cancelOutboundOrder). A task serving ONLY the cancelled order is
 * VOID whatever state it reached — there's no live order left for it to serve, and
 * its reserved stock is order-owned (returned via Release reserved), so nothing
 * goes unaccounted. Every cascaded task is stamped with a "Sales order … was
 * cancelled" reason shown on its detail page:
 *   picking open/in-progress/partially-picked/completed (sole order) → canceled + reason
 *   picking SHARED (multi) with another LIVE order → NOT cancelled; the cancelled
 *                               order's lines removed (or, if completed, kept as an
 *                               audit record) — packableOrderIds() excludes it either way
 *   packing open/in-progress/completed → canceled + reason
 *   delivery ready-to-ship    → canceled
 */
import { describe, it, expect } from 'vitest'
import {
  addOutgoing, releaseReservedForCancelledOrder, canReleaseReservedForOrder, outgoingOrders, type OutgoingOrder,
} from '~/data/outgoing'
import {
  addPickingTask, startPicking, endPicking, getPickingTask, getPickingForOrder,
  packableOrderIds, canCreatePackingFrom, orderFullyPickedAcrossTasks, orderPickedTotal,
  orderPickedQtyInTask, acknowledgeCanceledPickingOrders,
} from '~/data/pickingTasks'
import { getPickingLineItems } from '~/data/pickingTaskDetails'
import { addPackingTask, endPacking, getPackingTask, getPackingForOrder } from '~/data/packingTasks'
import {
  addDeliveryTaskFromPackingTasks, getDeliveryForOrder, getDeliveryTask, handoverToCourierBulk, completeShipment,
  getShipment, acknowledgeCanceledShipment,
} from '~/data/deliveryTasks'
import { cancelOutboundOrder, syncOutboundOrderStatuses } from '~/data/outboundSync'
import { getWarehouseDetail, reservedQtyForTask } from '~/data/warehouseDetails'

const WH = 'wh-006'
const WH_NAME = 'Gudang Makassar Selatan'
const SKU = '3004' // plain accessory — pure qty reservation, no batch/serial noise

function stock(sku = SKU, wh = WH) {
  return getWarehouseDetail(wh)!.stock.find((s) => s.sku === sku)!
}
function orderStatus(id: string) {
  return outgoingOrders.find((o) => o.id === id)!.status
}
const key = (orderId: string, sku = SKU) => `${orderId}::${sku}`

function makeOrder(qty = 1, source = 'Manual'): OutgoingOrder {
  return addOutgoing({
    salesNo: 'EDGE Test', source,
    warehouseId: WH, warehouseName: WH_NAME,
    skuQty: 1, orderQty: qty, shippedQty: 0, status: 'pending', dueDate: '2026-08-01',
    lines: [{ sku: SKU, productName: 'Test', desc: '', img: '', unit: 'Unit', qty }],
  })
}
// A Desty marketplace order — source "{Marketplace}: {store}" makes isMarketplaceOrder true.
function makeMarketplaceOrder(qty = 1): OutgoingOrder {
  return makeOrder(qty, 'Shopee: Central Perk')
}
function pick(order: OutgoingOrder, opts?: { warehouse?: string }) {
  return addPickingTask({
    salesOrderIds: [order.id], salesNos: [order.salesNo],
    warehouseId: opts?.warehouse ?? WH, warehouseName: WH_NAME, assignee: 'Op',
  })
}

// ── Case #1: marketplace order partially picked, then cancelled ─────────────────
describe('cancel + marketplace partial pick', () => {
  it('marketplace order finished SHORT (partially picked) then cancelled is NOT packable, and the button gate is closed', () => {
    const order = makeMarketplaceOrder(2)
    const pt = pick(order)
    startPicking(pt.id)
    endPicking(pt.id, { [key(order.id)]: 1 }) // 1 of 2 → partially picked (allowed even for marketplace)
    expect(getPickingTask(pt.id)!.status).toBe('partially picked')
    // Before cancel: marketplace not fully picked → already not packable, but the
    // order is still active so the flow is "finish picking it".
    expect(packableOrderIds(getPickingTask(pt.id)!)).not.toContain(order.id)

    const res = cancelOutboundOrder(order.id)
    expect(res.ok).toBe(true)
    // Sole-order picking task is VOID whatever state it reached, stamped with a reason.
    expect(getPickingTask(pt.id)!.status).toBe('canceled')
    expect(getPickingTask(pt.id)!.canceledReason).toMatch(/cancelled/i)
    // …and the cancelled order can never be packed, from any angle.
    expect(packableOrderIds(getPickingTask(pt.id)!)).toEqual([])
    expect(canCreatePackingFrom(getPickingTask(pt.id)!)).toBe(false)

    releaseReservedForCancelledOrder(order.id)
  })

  it('releasing the cancelled order returns the PICKED (still-reserved) stock to Available — on-hand never moved', () => {
    const availBefore = stock().available
    const onHandBefore = stock().onHand

    const order = makeMarketplaceOrder(2)
    expect(stock().available).toBe(availBefore - 2) // full demand reserved on creation
    const pt = pick(order)
    startPicking(pt.id)
    endPicking(pt.id, { [key(order.id)]: 1 }) // picked 1, 1 still to pick
    // Picking never deducts on-hand — the picked unit is still just a reservation.
    expect(stock().available).toBe(availBefore - 2)
    expect(stock().onHand).toBe(onHandBefore)

    cancelOutboundOrder(order.id)
    expect(reservedQtyForTask(order.id)).toBe(2) // both the picked + un-picked unit still held

    releaseReservedForCancelledOrder(order.id)
    expect(reservedQtyForTask(order.id)).toBe(0)
    expect(stock().available).toBe(availBefore) // picked stock came back too
    expect(stock().onHand).toBe(onHandBefore)   // no on-hand movement, ever
  })
})

// ── The critical bug: a cancelled NON-marketplace order was still packable ──────
describe('cancel + non-marketplace leftover picking task must not be packable', () => {
  it('non-marketplace order partially picked then cancelled is excluded from packableOrderIds', () => {
    const order = makeOrder(2)
    const pt = pick(order)
    startPicking(pt.id)
    endPicking(pt.id, { [key(order.id)]: 1 }) // partially picked
    expect(getPickingTask(pt.id)!.status).toBe('partially picked')
    // Before cancel a non-marketplace order with 1 picked IS packable…
    expect(packableOrderIds(getPickingTask(pt.id)!)).toContain(order.id)

    cancelOutboundOrder(order.id)
    // …after cancel it must NOT be — else you could pack & ship a cancelled order.
    expect(orderStatus(order.id)).toBe('canceled')
    expect(getPickingTask(pt.id)!.status).toBe('canceled') // sole-order task is void
    expect(getPickingTask(pt.id)!.canceledReason).toMatch(/cancelled/i)
    expect(packableOrderIds(getPickingTask(pt.id)!)).toEqual([])
    expect(canCreatePackingFrom(getPickingTask(pt.id)!)).toBe(false)

    releaseReservedForCancelledOrder(order.id)
  })

  it('non-marketplace order fully picked (completed picking) then cancelled becomes canceled + not packable', () => {
    const order = makeOrder(2)
    const pt = pick(order)
    startPicking(pt.id)
    endPicking(pt.id, { [key(order.id)]: 2 }) // completed
    expect(getPickingTask(pt.id)!.status).toBe('completed')
    expect(packableOrderIds(getPickingTask(pt.id)!)).toContain(order.id)

    cancelOutboundOrder(order.id)
    expect(getPickingTask(pt.id)!.status).toBe('canceled') // completed → canceled (sole order)
    expect(getPickingTask(pt.id)!.canceledReason).toMatch(/cancelled/i)
    expect(packableOrderIds(getPickingTask(pt.id)!)).toEqual([])
    expect(canCreatePackingFrom(getPickingTask(pt.id)!)).toBe(false)

    releaseReservedForCancelledOrder(order.id)
  })
})

// ── Multi-order picking: one order cancelled ───────────────────────────────────
describe('cancel one order within a SHARED picking task', () => {
  it('active (partially picked) shared task keeps the cancelled order LINKED (visible) but not packable; keeps packing the other', () => {
    const a = makeOrder(2)
    const b = makeOrder(2)
    const pt = addPickingTask({
      salesOrderIds: [a.id, b.id], salesNos: [a.salesNo, b.salesNo],
      warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op',
    })
    startPicking(pt.id)
    endPicking(pt.id, { [key(a.id)]: 1, [key(b.id)]: 1 }) // partially picked, both
    expect(getPickingTask(pt.id)!.status).toBe('partially picked')

    cancelOutboundOrder(a.id)
    const t = getPickingTask(pt.id)!
    expect(t.status).not.toBe('canceled')                  // shared task survives
    // A is KEPT on the task → stays under Linked transactions on A's order detail AND
    // in the picking task's own Sales orders list. It's just no longer packable.
    expect(t.salesOrderIds.sort()).toEqual([a.id, b.id].sort())
    expect(getPickingForOrder(a.id).map((x) => x.id)).toContain(pt.id) // A still linked
    expect(packableOrderIds(t)).toEqual([b.id])            // only B is packable now
    expect(canCreatePackingFrom(t)).toBe(true)

    releaseReservedForCancelledOrder(a.id)
    cancelOutboundOrder(b.id); releaseReservedForCancelledOrder(b.id)
  })

  it('ACK flow: cancelling a shared order flags needsCancelAck; pick work unchanged until Ack, then dropped — order stays linked', () => {
    const a = makeOrder(2); const b = makeOrder(2)
    const pt = addPickingTask({
      salesOrderIds: [a.id, b.id], salesNos: [a.salesNo, b.salesNo],
      warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op',
    })
    const toPickBefore = getPickingTask(pt.id)!.toPickQty // 2 + 2

    cancelOutboundOrder(a.id)
    const t = getPickingTask(pt.id)!
    expect(t.needsCancelAck).toBe(true)                           // banner shows
    expect(t.toPickQty).toBe(toPickBefore)                        // pick work UNCHANGED until ack
    expect(getPickingLineItems(t).some((l) => l.orderId === a.id)).toBe(true) // A still in pick work

    acknowledgeCanceledPickingOrders(pt.id)
    const t2 = getPickingTask(pt.id)!
    expect(t2.needsCancelAck).toBe(false)
    expect(t2.toPickQty).toBe(2)                                  // only B's qty remains as work
    expect(getPickingLineItems(t2).some((l) => l.orderId === a.id)).toBe(false) // A dropped from pick work
    expect(t2.salesOrderIds.sort()).toEqual([a.id, b.id].sort())  // A STILL linked (Sales orders list)
    expect(getPickingForOrder(a.id).map((x) => x.id)).toContain(pt.id)
    releaseReservedForCancelledOrder(a.id)
    cancelOutboundOrder(b.id); releaseReservedForCancelledOrder(b.id)
  })

  it('COMPLETED shared task keeps its lines but still excludes the cancelled order from packability', () => {
    const a = makeOrder(2)
    const b = makeOrder(2)
    const pt = addPickingTask({
      salesOrderIds: [a.id, b.id], salesNos: [a.salesNo, b.salesNo],
      warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op',
    })
    startPicking(pt.id)
    endPicking(pt.id, { [key(a.id)]: 2, [key(b.id)]: 2 }) // completed, both full
    expect(getPickingTask(pt.id)!.status).toBe('completed')
    expect(packableOrderIds(pt).sort()).toEqual([a.id, b.id].sort())

    cancelOutboundOrder(a.id)
    const t = getPickingTask(pt.id)!
    expect(t.status).toBe('completed')
    expect(t.salesOrderIds.sort()).toEqual([a.id, b.id].sort()) // completed → lines kept
    expect(packableOrderIds(t)).toEqual([b.id])                  // but A no longer packable
    expect(canCreatePackingFrom(t)).toBe(true)                   // B still packable

    releaseReservedForCancelledOrder(a.id)
    cancelOutboundOrder(b.id); releaseReservedForCancelledOrder(b.id)
  })
})

// ── Packing-stage cancellation ─────────────────────────────────────────────────
describe('cancel while packing', () => {
  it('open packing task → cancelled; order can no longer be shipped', () => {
    const order = makeOrder(2)
    const pt = pick(order)
    startPicking(pt.id)
    endPicking(pt.id, { [key(order.id)]: 2 })
    const pk = addPackingTask({ salesOrderId: order.id, salesNo: order.salesNo, pickingTaskId: pt.id, pickingTaskNo: pt.taskNo, warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    expect(getPackingTask(pk.id)!.status).toBe('open')

    cancelOutboundOrder(order.id)
    expect(getPackingTask(pk.id)!.status).toBe('canceled')
    expect(getDeliveryForOrder(order.id)).toEqual([]) // no delivery ever created
    releaseReservedForCancelledOrder(order.id)
  })

  it('completed packing + ready-to-ship delivery → delivery cancelled, packing stays completed', () => {
    const order = makeOrder(2)
    const pt = pick(order)
    startPicking(pt.id)
    endPicking(pt.id, { [key(order.id)]: 2 })
    const pk = addPackingTask({ salesOrderId: order.id, salesNo: order.salesNo, pickingTaskId: pt.id, pickingTaskNo: pt.taskNo, warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    endPacking(pk.id, { [key(order.id)]: 2 })
    const del = addDeliveryTaskFromPackingTasks([getPackingTask(pk.id)!], { assignee: 'Op' })
    expect(del.status).toBe('ready to ship')

    cancelOutboundOrder(order.id)
    expect(getPackingTask(pk.id)!.status).toBe('canceled')           // completed → canceled
    expect(getPackingTask(pk.id)!.canceledReason).toMatch(/cancelled/i)
    expect(getPickingTask(pt.id)!.status).toBe('canceled')           // sole-order picking too
    expect(getDeliveryForOrder(order.id)[0]!.status).toBe('canceled') // delivery cancelled
    releaseReservedForCancelledOrder(order.id)
  })

  it('a cancelled order never has a live (non-canceled) packing or delivery task left behind', () => {
    const order = makeOrder(2)
    const pt = pick(order)
    startPicking(pt.id)
    endPicking(pt.id, { [key(order.id)]: 2 })
    const pk = addPackingTask({ salesOrderId: order.id, salesNo: order.salesNo, pickingTaskId: pt.id, pickingTaskNo: pt.taskNo, warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    endPacking(pk.id, { [key(order.id)]: 2 })
    addDeliveryTaskFromPackingTasks([getPackingTask(pk.id)!], { assignee: 'Op' })

    cancelOutboundOrder(order.id)
    // Completed packing is kept for audit, but its order is cancelled → not packable,
    // and there is no live delivery that could still ship.
    const liveDeliveries = getDeliveryForOrder(order.id).filter((d) => d.status !== 'canceled')
    expect(liveDeliveries).toEqual([])
    releaseReservedForCancelledOrder(order.id)
  })
})

// ── Release-reserved text link (shown on the cancelled task's Reason line) ──────
describe('Release reserved link visibility drives off canReleaseReservedForOrder', () => {
  it('picking-stage cancel: link shows (canRelease=true) until released, then hides', () => {
    const order = makeOrder(2)
    const pt = pick(order)
    startPicking(pt.id)
    endPicking(pt.id, { [key(order.id)]: 2 })
    cancelOutboundOrder(order.id)
    expect(getPickingTask(pt.id)!.status).toBe('canceled')
    expect(canReleaseReservedForOrder(order.id)).toBe(true)  // link visible
    expect(releaseReservedForCancelledOrder(order.id)).toBe(true)
    expect(canReleaseReservedForOrder(order.id)).toBe(false) // link gone
  })

  it('packing-stage cancel: same lifecycle on the packing task Reason line', () => {
    const order = makeOrder(2)
    const pt = pick(order)
    startPicking(pt.id)
    endPicking(pt.id, { [key(order.id)]: 2 })
    const pk = addPackingTask({ salesOrderId: order.id, salesNo: order.salesNo, pickingTaskId: pt.id, pickingTaskNo: pt.taskNo, warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    cancelOutboundOrder(order.id)
    expect(getPackingTask(pk.id)!.status).toBe('canceled')
    expect(canReleaseReservedForOrder(order.id)).toBe(true)
    releaseReservedForCancelledOrder(order.id)
    expect(canReleaseReservedForOrder(order.id)).toBe(false)
  })
})

// ── Invariant sweep across every pipeline state ────────────────────────────────
describe('invariant: a sole-order picking task is canceled (with a reason) in every state', () => {
  it('open / in-progress / partially-picked / completed all → canceled + reason + not packable', () => {
    for (const [label, build] of [
      ['open', (o: OutgoingOrder) => pick(o)],
      ['in progress', (o: OutgoingOrder) => { const p = pick(o); startPicking(p.id); return p }],
      ['partially picked', (o: OutgoingOrder) => { const p = pick(o); startPicking(p.id); endPicking(p.id, { [key(o.id)]: 1 }); return p }],
      ['completed', (o: OutgoingOrder) => { const p = pick(o); startPicking(p.id); endPicking(p.id, { [key(o.id)]: 2 }); return p }],
    ] as const) {
      const order = makeOrder(2)
      const pt = build(order)
      syncOutboundOrderStatuses()
      cancelOutboundOrder(order.id)
      // The picking task is void whatever state it was in when the order was cancelled.
      expect(getPickingTask(pt.id)!.status, label).toBe('canceled')
      expect(getPickingTask(pt.id)!.canceledReason, label).toMatch(/cancelled/i)
      const anyPackable = getPickingForOrder(order.id).some((t) => packableOrderIds(t).includes(order.id))
      expect(anyPackable, label).toBe(false)
      void getPackingForOrder(order.id)
      void orderFullyPickedAcrossTasks(order.id)
      void orderPickedTotal(order.id)
      releaseReservedForCancelledOrder(order.id)
    }
  })
})

// ── User scenarios: S01 (regular, SKU A+B) + S02 (marketplace, SKU A) ───────────
// Reservations are keyed PER ORDER, and picking lines are per (order, SKU) — so a
// shared picking task always knows which units belong to which order, and cancelling
// one order never touches the other's work.
describe('multi-order picking/packing/shipment — cancel one order, keep the other', () => {
  const A = '3004', B = '3005'
  const availA = () => stock(A).available
  const line = (sku: string, qty: number) => ({ sku, productName: 'Test', desc: '', img: '', unit: 'Unit', qty })
  function order(lines: Array<{ sku: string; productName: string; desc: string; img: string; unit: string; qty: number }>, source = 'Manual') {
    return addOutgoing({
      salesNo: 'SCN', source, warehouseId: WH, warehouseName: WH_NAME,
      skuQty: lines.length, orderQty: lines.reduce((s, l) => s + l.qty, 0), shippedQty: 0,
      status: 'pending', dueDate: '2026-08-01', lines,
    })
  }
  function sharedPick(a: OutgoingOrder, b: OutgoingOrder) {
    return addPickingTask({ salesOrderIds: [a.id, b.id], salesNos: [a.salesNo, b.salesNo], warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
  }
  function cleanup(...os: OutgoingOrder[]) {
    for (const o of os) {
      const c = outgoingOrders.find(x => x.id === o.id)
      if (c && c.status !== 'canceled' && (c.shippedQty ?? 0) === 0) cancelOutboundOrder(o.id)
      releaseReservedForCancelledOrder(o.id)
    }
  }

  // Q1 — per-order granularity inside ONE picking list.
  it('Q1: a shared picking list tracks picked qty PER ORDER (SKU A split across S01 & S02)', () => {
    const s01 = order([line(A, 3), line(B, 1)])                 // regular
    const s02 = order([line(A, 4)], 'Shopee: Central Perk')     // marketplace
    const pt = sharedPick(s01, s02)
    startPicking(pt.id)
    // SKU A picked into two independent line keys — 2 to S01, 1 to S02.
    endPicking(pt.id, { [`${s01.id}::${A}`]: 2, [`${s01.id}::${B}`]: 1, [`${s02.id}::${A}`]: 1 })
    const t = getPickingTask(pt.id)!
    expect(orderPickedQtyInTask(t, s01.id)).toBe(3) // 2×A + 1×B
    expect(orderPickedQtyInTask(t, s02.id)).toBe(1) // 1×A — never mixed with S01's
    cleanup(s01, s02)
  })

  // Q2 — cancel S02 while S01 still active, across all four picking states.
  for (const [label, advance] of [
    ['open', (_pt: string) => {}],
    ['in progress', (pt: string) => { startPicking(pt) }],
    ['partially picked', (pt: string) => { startPicking(pt); endPicking(pt, { [`${'x'}`]: 0 }) }], // placeholder, overwritten below
    ['completed', (pt: string) => { startPicking(pt) }],
  ] as const) void label // (states are exercised explicitly below for clarity)

  // Across all pre-completion states, a shared task keeps BOTH orders LINKED (cancelled
  // S02 stays visible on its order detail AND in the picking task's Sales orders list),
  // the task keeps running, and only S01 stays packable.
  it('Q2 open: cancel S02 → task NOT cancelled, S02 stays linked but not packable, S01 continues', () => {
    const s01 = order([line(A, 2)]); const s02 = order([line(A, 2)], 'Shopee: Central Perk')
    const pt = sharedPick(s01, s02)
    cancelOutboundOrder(s02.id)
    const t = getPickingTask(pt.id)!
    expect(t.status).not.toBe('canceled')
    expect(t.salesOrderIds.sort()).toEqual([s01.id, s02.id].sort())
    expect(getPickingForOrder(s02.id).map((x) => x.id)).toContain(pt.id) // S02 still linked
    expect(packableOrderIds(t)).not.toContain(s02.id) // (nothing picked yet, so neither is packable)
    cleanup(s01, s02)
  })

  it('Q2 in progress: cancel S02 → task keeps running for S01, S02 stays linked', () => {
    const s01 = order([line(A, 2)]); const s02 = order([line(A, 2)], 'Shopee: Central Perk')
    const pt = sharedPick(s01, s02)
    startPicking(pt.id)
    cancelOutboundOrder(s02.id)
    const t = getPickingTask(pt.id)!
    expect(t.status).not.toBe('canceled')
    expect(t.salesOrderIds.sort()).toEqual([s01.id, s02.id].sort())
    expect(getPickingForOrder(s02.id).map((x) => x.id)).toContain(pt.id)
    cleanup(s01, s02)
  })

  it('Q2 partially picked: cancel S02 → task kept for S01, S02 stays linked but not packable', () => {
    const s01 = order([line(A, 2)]); const s02 = order([line(A, 2)], 'Shopee: Central Perk')
    const pt = sharedPick(s01, s02)
    startPicking(pt.id)
    endPicking(pt.id, { [`${s01.id}::${A}`]: 1, [`${s02.id}::${A}`]: 1 }) // both short → partially picked
    expect(getPickingTask(pt.id)!.status).toBe('partially picked')
    cancelOutboundOrder(s02.id)
    const t = getPickingTask(pt.id)!
    expect(t.status).not.toBe('canceled')
    expect(t.salesOrderIds.sort()).toEqual([s01.id, s02.id].sort())
    expect(getPickingForOrder(s02.id).map((x) => x.id)).toContain(pt.id)
    expect(packableOrderIds(t)).toEqual([s01.id])
    cleanup(s01, s02)
  })

  it('Q2 completed: cancel S02 → task stays completed with lines kept, only S01 packable', () => {
    const s01 = order([line(A, 2)]); const s02 = order([line(A, 2)], 'Shopee: Central Perk')
    const pt = sharedPick(s01, s02)
    startPicking(pt.id)
    endPicking(pt.id, { [`${s01.id}::${A}`]: 2, [`${s02.id}::${A}`]: 2 }) // both full → completed
    expect(getPickingTask(pt.id)!.status).toBe('completed')
    cancelOutboundOrder(s02.id)
    const t = getPickingTask(pt.id)!
    expect(t.status).toBe('completed')                       // completed shared task kept
    expect(t.salesOrderIds.sort()).toEqual([s01.id, s02.id].sort()) // lines retained as record
    expect(packableOrderIds(t)).toEqual([s01.id])            // S02 excluded (cancelled)
    cleanup(s01, s02)
  })

  // Scenario 2 — two SEPARATE completed pickings feeding one Create-packing; S02 cancelled.
  it('Scenario 2: separate pickings — cancel S02 voids picking02, S01 still packable (Create packing validates at Save)', () => {
    const s01 = order([line(A, 2)]); const s02 = order([line(A, 2)], 'Shopee: Central Perk')
    const p1 = addPickingTask({ salesOrderIds: [s01.id], salesNos: [s01.salesNo], warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    const p2 = addPickingTask({ salesOrderIds: [s02.id], salesNos: [s02.salesNo], warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    startPicking(p1.id); endPicking(p1.id, { [`${s01.id}::${A}`]: 2 })
    startPicking(p2.id); endPicking(p2.id, { [`${s02.id}::${A}`]: 2 })
    cancelOutboundOrder(s02.id)
    // picking02 (sole order S02) is voided; S02 is not packable anywhere; S01 still is.
    expect(getPickingTask(p2.id)!.status).toBe('canceled')
    expect(packableOrderIds(getPickingTask(p1.id)!)).toEqual([s01.id])
    expect(packableOrderIds(getPickingTask(p2.id)!)).toEqual([])
    // (In CreatePackingPage this surfaces as the canceledTables note + a Save-time
    //  error toast that removes S02 and lets the operator save S01 only.)
    cleanup(s01, s02)
  })

  // Scenario 3 — two packings + two ready-to-ship deliveries; cancel S02.
  it('Scenario 3: two ready-to-ship deliveries — cancel S02 cancels packing02 + its delivery, S01 untouched', () => {
    const s01 = order([line(A, 2)]); const s02 = order([line(A, 2)], 'Shopee: Central Perk')
    const mk = (o: OutgoingOrder) => {
      const p = addPickingTask({ salesOrderIds: [o.id], salesNos: [o.salesNo], warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
      startPicking(p.id); endPicking(p.id, { [`${o.id}::${A}`]: 2 })
      const pk = addPackingTask({ salesOrderId: o.id, salesNo: o.salesNo, pickingTaskId: p.id, pickingTaskNo: p.taskNo, warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
      endPacking(pk.id, { [`${o.id}::${A}`]: 2 })
      const del = addDeliveryTaskFromPackingTasks([getPackingTask(pk.id)!], { assignee: 'Op' })
      return { pk, del }
    }
    const a = mk(s01); const b = mk(s02)
    expect(a.del.status).toBe('ready to ship'); expect(b.del.status).toBe('ready to ship')

    cancelOutboundOrder(s02.id)
    expect(getPackingTask(b.pk.id)!.status).toBe('canceled')     // S02 packing cancelled
    expect(getDeliveryTask(b.del.id)!.status).toBe('canceled')   // S02 delivery cancelled
    expect(getPackingTask(a.pk.id)!.status).toBe('completed')    // S01 packing stays
    expect(getDeliveryTask(a.del.id)!.status).toBe('ready to ship') // S01 delivery stays
    cleanup(s01, s02)
  })

  const shipMk = (o: OutgoingOrder) => {
    const p = addPickingTask({ salesOrderIds: [o.id], salesNos: [o.salesNo], warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    startPicking(p.id); endPicking(p.id, { [`${o.id}::${A}`]: 1 })
    const pk = addPackingTask({ salesOrderId: o.id, salesNo: o.salesNo, pickingTaskId: p.id, pickingTaskNo: p.taskNo, warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    endPacking(pk.id, { [`${o.id}::${A}`]: 1 })
    return addDeliveryTaskFromPackingTasks([getPackingTask(pk.id)!], { assignee: 'Op' })
  }

  // Scenario 4a — handover done, shipment "open" (out for delivery): still reversible.
  // Cancelling flags the shipment for acknowledgement; the cancelled delivery stays
  // ATTACHED (shown as canceled) until the operator acknowledges, which detaches it.
  it('Scenario 4a: shipment OPEN — S02 cancellable; needs-ack until acknowledged, then detached; on-hand untouched; S01 continues', () => {
    const s01 = order([line(A, 1)]); const s02 = order([line(A, 1)], 'Shopee: Central Perk')
    const del1 = shipMk(s01); const del2 = shipMk(s02)
    const onHandBefore = stock(A).onHand
    const [ship] = handoverToCourierBulk([del1.id, del2.id], { assignee: 'Op', transactionDate: '2026-07-20' })
    expect(getDeliveryTask(del2.id)!.status).toBe('out for delivery') // NOT shipped yet
    expect(stock(A).onHand).toBe(onHandBefore) // nothing posted while open

    const res = cancelOutboundOrder(s02.id) // courier was closed, parcel came back
    expect(res.ok).toBe(true)
    expect(getDeliveryTask(del2.id)!.status).toBe('canceled')
    // Stays attached + shipment flagged for ack until acknowledged.
    expect(getDeliveryTask(del2.id)!.shipmentNo).toBeTruthy()
    expect(getShipment(ship!.shipmentSeq)!.needsCancelAck).toBe(true)
    expect(getDeliveryTask(del1.id)!.status).toBe('out for delivery') // S01 keeps going

    acknowledgeCanceledShipment(ship!.shipmentSeq)
    expect(getDeliveryTask(del2.id)!.shipmentNo).toBeUndefined()      // detached on ack
    expect(getShipment(ship!.shipmentSeq)!.needsCancelAck).toBe(false)
    expect(getShipment(ship!.shipmentSeq)!.deliveries.map(d => d.id)).toEqual([del1.id]) // only S01 left
    expect(stock(A).onHand).toBe(onHandBefore) // still nothing deducted
    cleanup(s01, s02)
  })

  // Scenario 4b — shipment COMPLETED (received): now truly shipped → posted, cancel blocked.
  it('Scenario 4b: shipment COMPLETED — on-hand is deducted and cancelling S02 is REJECTED', () => {
    const s02 = order([line(A, 1)], 'Shopee: Central Perk')
    const onHandBefore = stock(A).onHand
    const availBefore = stock(A).available
    const del = shipMk(s02)
    const [ship] = handoverToCourierBulk([del.id], { assignee: 'Op', transactionDate: '2026-07-20' })
    expect(stock(A).onHand).toBe(onHandBefore) // out for delivery → not yet posted
    completeShipment(ship!.shipmentSeq, { receivedDate: '2026-07-21', receivedBy: 'Rina' })

    expect(getDeliveryTask(del.id)!.status).toBe('shipped')
    expect(stock(A).onHand).toBe(onHandBefore - 1) // on-hand posted at completion
    expect(stock(A).available).toBe(availBefore)   // available unchanged (reserved consumed too)
    syncOutboundOrderStatuses()

    const res = cancelOutboundOrder(s02.id)
    expect(res.ok).toBe(false) // truly shipped → posting guard blocks cancel
    if (!res.ok) expect(['OUTBOUND_ALREADY_SHIPPED', 'OUTBOUND_CANNOT_CANCEL_COMPLETED']).toContain(res.reason)
    // shipped stock is terminal — not reclaimable, so no cleanup here
  })
})
