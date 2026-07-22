/**
 * End-to-end data-layer test for the outbound flow: order → picking → packing →
 * delivery. Drives every stage through the same exported functions the real pages
 * call (no UI mounting needed — this is about the NUMBERS, not the rendering),
 * asserting Order qty / Qty to pick / Picked qty / Packed qty at each transition.
 *
 * Expected lifecycle (confirmed against the actual data-layer code):
 *   1. Order created (status "pending")          → EVERY SKU line gets reserved,
 *      batch/serial-tracked or plain — a plain SKU reservation just holds a bare
 *      qty (no batchNo/serials to pin it to), same anti-oversell purpose.
 *   2. Picking task created from the order       → toPickQty = order demand,
 *      pickedQty = 0 (nothing picked yet), status "open".
 *   3. Start picking                             → status "in progress",
 *      pickedQty STILL 0 until a draft is actually saved (scanning/typing).
 *   4. Save a picking draft (partial)             → pickedQty = exactly what was
 *      saved, never more (no auto-fill from the reservation plan).
 *   5. Finish picking short of toPickQty          → status "partially picked"
 *      (finishing at exactly toPickQty → "completed" instead).
 *   6. Packing task created from the picking task → toPackQty = what picking
 *      actually delivered (pickedQty), NOT the original order qty; packedQty = 0.
 *   7. Start packing                              → status "in progress",
 *      packedQty STILL 0 until a draft is saved.
 *   8. Save a packing draft                       → packedQty = exactly what was
 *      saved.
 *   9. Finish packing                             → status "completed" (packing
 *      has no "partially packed" terminal state — endPacking always completes).
 *  10. Creating the delivery from that packing task → delivery status
 *      "ready to ship", toShipQty matches what was actually packed.
 */
import { describe, it, expect } from 'vitest'
import { addOutgoing, pickableOrders, type OutgoingOrder } from '~/data/outgoing'
import {
  addPickingTask, startPicking, savePickingDraft, endPicking, getPickingTask, canPickOrder, type PickingLine,
} from '~/data/pickingTasks'
import {
  addPackingTask, startPacking, savePackingDraft, endPacking, getPackingTask,
} from '~/data/packingTasks'
import { addDeliveryTaskFromPackingTasks, getDeliveryForOrder, handoverToCourierBulk } from '~/data/deliveryTasks'
import { syncOutboundOrderStatuses } from '~/data/outboundSync'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { getPickingLineItems } from '~/data/pickingTaskDetails'

const WAREHOUSE_ID = 'wh-006'
const WAREHOUSE_NAME = 'Gudang Makassar Selatan'
const SKU = '3004' // plain (Accessory) — no batch/serial reservation noise, pure qty lifecycle
const ORDER_QTY = 3

function makeOrder(): OutgoingOrder {
  return addOutgoing({
    salesNo: 'Test Flow Order',
    source: 'Manual',
    warehouseId: WAREHOUSE_ID,
    warehouseName: WAREHOUSE_NAME,
    skuQty: 1,
    orderQty: ORDER_QTY,
    shippedQty: 0,
    status: 'pending',
    dueDate: '2026-08-01',
    lines: [{
      sku: SKU, productName: 'Coffee Scale 2kg / 0.1g', desc: '', img: '', unit: 'Unit', qty: ORDER_QTY,
    }],
  })
}

describe('Outbound flow — Order qty / Qty to pick / Picked qty / Packed qty at each stage', () => {
  it('1. order creation: orderQty is set; a plain SKU is ALSO reserved (anti-oversell), not just batch/serial ones', () => {
    const before = getWarehouseDetail(WAREHOUSE_ID)!.stock.find((s) => s.sku === SKU)!
    const availableBefore = before.available

    const order = makeOrder()
    expect(order.orderQty).toBe(ORDER_QTY)
    expect(order.status).toBe('pending') // no picking/packing task yet

    const after = getWarehouseDetail(WAREHOUSE_ID)!.stock.find((s) => s.sku === SKU)!
    expect(after.available).toBe(availableBefore - ORDER_QTY)
    expect(after.onHand).toBe(before.onHand) // reservation holds qty, never touches onHand
  })

  it('2. picking task created: Qty to pick = order demand, Picked qty = 0, status open', () => {
    const order = makeOrder()
    const task = addPickingTask({
      salesOrderIds: [order.id],
      salesNos: [order.salesNo],
      warehouseId: WAREHOUSE_ID,
      warehouseName: WAREHOUSE_NAME,
      assignee: 'Test Operator',
    })

    expect(task.toPickQty).toBe(ORDER_QTY)
    expect(task.pickedQty).toBe(0)
    expect(task.status).toBe('open')
  })

  it('3. start picking: status flips to in progress, Picked qty stays 0 until a draft is saved', () => {
    const order = makeOrder()
    const task = addPickingTask({
      salesOrderIds: [order.id], salesNos: [order.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })

    startPicking(task.id)
    const started = getPickingTask(task.id)!
    expect(started.status).toBe('in progress')
    expect(started.pickedQty).toBe(0) // starting picking ≠ having picked anything
  })

  it('4. partial draft save: Picked qty matches exactly what was saved, never auto-filled', () => {
    const order = makeOrder()
    const task = addPickingTask({
      salesOrderIds: [order.id], salesNos: [order.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    startPicking(task.id)
    const lineKey = `${order.id}::${SKU}`

    savePickingDraft(task.id, { [lineKey]: 2 }) // scanned/entered 2 of 3
    const draft = getPickingTask(task.id)!
    expect(draft.pickedQty).toBe(2)
    expect(draft.status).toBe('in progress') // draft save never finishes the task
  })

  it('5a. finish picking SHORT of toPickQty → "partially picked", pickedQty preserved exactly', () => {
    const order = makeOrder()
    const task = addPickingTask({
      salesOrderIds: [order.id], salesNos: [order.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    startPicking(task.id)
    const lineKey = `${order.id}::${SKU}`

    endPicking(task.id, { [lineKey]: 2 }) // finished at 2 of 3
    const finished = getPickingTask(task.id)!
    expect(finished.pickedQty).toBe(2)
    expect(finished.status).toBe('partially picked')
    expect(finished.endDate).toBeTruthy()
  })

  it('5b. finish picking at FULL toPickQty → "completed"', () => {
    const order = makeOrder()
    const task = addPickingTask({
      salesOrderIds: [order.id], salesNos: [order.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    startPicking(task.id)
    const lineKey = `${order.id}::${SKU}`

    endPicking(task.id, { [lineKey]: ORDER_QTY })
    const finished = getPickingTask(task.id)!
    expect(finished.pickedQty).toBe(ORDER_QTY)
    expect(finished.status).toBe('completed')
  })

  it('6. packing task created from a PARTIALLY picked task: toPackQty = what was actually picked (not full order qty), packedQty = 0', () => {
    const order = makeOrder()
    const task = addPickingTask({
      salesOrderIds: [order.id], salesNos: [order.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    startPicking(task.id)
    const lineKey = `${order.id}::${SKU}`
    endPicking(task.id, { [lineKey]: 2 }) // partial: picked 2 of 3

    const pack = addPackingTask({
      salesOrderId: order.id, salesNo: order.salesNo,
      pickingTaskId: task.id, pickingTaskNo: task.taskNo,
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })

    expect(pack.toPackQty).toBe(2) // NOT ORDER_QTY (3) — packing can only pack what was picked
    expect(pack.packedQty).toBe(0)
    expect(pack.status).toBe('open')
  })

  it('7. start packing: status flips to in progress, Packed qty stays 0 until a draft is saved', () => {
    const order = makeOrder()
    const task = addPickingTask({
      salesOrderIds: [order.id], salesNos: [order.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    startPicking(task.id)
    const lineKey = `${order.id}::${SKU}`
    endPicking(task.id, { [lineKey]: ORDER_QTY })

    const pack = addPackingTask({
      salesOrderId: order.id, salesNo: order.salesNo,
      pickingTaskId: task.id, pickingTaskNo: task.taskNo,
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })

    startPacking(pack.id)
    const started = getPackingTask(pack.id)!
    expect(started.status).toBe('in progress')
    expect(started.packedQty).toBe(0) // starting packing/match order ≠ having packed anything
  })

  it('8. packing draft save: Packed qty matches exactly what was saved', () => {
    const order = makeOrder()
    const task = addPickingTask({
      salesOrderIds: [order.id], salesNos: [order.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    startPicking(task.id)
    const lineKey = `${order.id}::${SKU}`
    endPicking(task.id, { [lineKey]: ORDER_QTY })

    const pack = addPackingTask({
      salesOrderId: order.id, salesNo: order.salesNo,
      pickingTaskId: task.id, pickingTaskNo: task.taskNo,
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    startPacking(pack.id)

    savePackingDraft(pack.id, { [lineKey]: 2 }) // packed 2 of 3 available to pack
    const draft = getPackingTask(pack.id)!
    expect(draft.packedQty).toBe(2)
    expect(draft.status).toBe('in progress')
  })

  it('9-10. finish packing → "completed"; the resulting delivery is "ready to ship" with the packed qty', () => {
    const order = makeOrder()
    const task = addPickingTask({
      salesOrderIds: [order.id], salesNos: [order.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    startPicking(task.id)
    const lineKey = `${order.id}::${SKU}`
    endPicking(task.id, { [lineKey]: ORDER_QTY })

    const pack = addPackingTask({
      salesOrderId: order.id, salesNo: order.salesNo,
      pickingTaskId: task.id, pickingTaskNo: task.taskNo,
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    startPacking(pack.id)
    endPacking(pack.id, { [lineKey]: ORDER_QTY })

    const finishedPack = getPackingTask(pack.id)!
    expect(finishedPack.status).toBe('completed') // packing has no "partially packed" terminal state
    expect(finishedPack.packedQty).toBe(ORDER_QTY)

    const delivery = addDeliveryTaskFromPackingTasks([finishedPack], { assignee: 'Test Operator' })
    expect(delivery.status).toBe('ready to ship')
    expect(delivery.toShipQty).toBe(ORDER_QTY)
    expect(getDeliveryForOrder(order.id).map((d) => d.id)).toContain(delivery.id)
  })

  it('12. order qty 3, only 1 ever picked/packed/shipped: order becomes "partially shipped" but MUST still be pickable for the remaining 2', () => {
    // Regression test — reported bug: order qty 3, picking task "Qty to pick" 3,
    // operator only picks 1, packs 1, ships 1. syncOutboundOrderStatuses() then
    // flips the order to "partially shipped" the moment ANYTHING ships — even
    // though 2 units were never picked at all. canCreatePicking() used to gate on
    // PICKABLE_STATUSES = ["open", "in progress"] only, so "partially shipped"
    // silently blocked ANY further picking list, stranding the un-picked remainder
    // forever. Fixed by adding "partially shipped" to PICKABLE_STATUSES — the
    // finer-grained per-SKU/qty remainder check (canPickOrder's own coverage scan)
    // still correctly refuses once nothing is left, so this doesn't reopen
    // genuinely finished orders.
    const order = makeOrder()
    const task = addPickingTask({
      salesOrderIds: [order.id], salesNos: [order.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    startPicking(task.id)
    const lineKey = `${order.id}::${SKU}`
    endPicking(task.id, { [lineKey]: 1 }) // only 1 of 3 ever picked -> "partially picked"
    expect(getPickingTask(task.id)!.status).toBe('partially picked')

    const pack = addPackingTask({
      salesOrderId: order.id, salesNo: order.salesNo,
      pickingTaskId: task.id, pickingTaskNo: task.taskNo,
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    startPacking(pack.id)
    endPacking(pack.id, { [lineKey]: 1 }) // pack all that was picked (1)
    const finishedPack = getPackingTask(pack.id)!
    expect(finishedPack.packedQty).toBe(1)

    const delivery = addDeliveryTaskFromPackingTasks([finishedPack], { assignee: 'Test Operator' })
    handoverToCourierBulk([delivery.id], { assignee: 'Test Operator', transactionDate: '2026-07-11' })

    syncOutboundOrderStatuses()
    expect(order.status).toBe('partially shipped')
    expect(order.shippedQty).toBe(1)

    // THE BUG: this must be true — 2 units were never picked, so a new picking
    // list must still be creatable for the order.
    expect(canPickOrder(order)).toBe(true)
    expect(pickableOrders([WAREHOUSE_ID]).map((o) => o.id)).toContain(order.id)

    // Sanity: a genuinely fully-shipped order (nothing left) must NOT be pickable.
    const fullOrder = makeOrder()
    const fullTask = addPickingTask({
      salesOrderIds: [fullOrder.id], salesNos: [fullOrder.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    startPicking(fullTask.id)
    const fullLineKey = `${fullOrder.id}::${SKU}`
    endPicking(fullTask.id, { [fullLineKey]: ORDER_QTY })
    const fullPack = addPackingTask({
      salesOrderId: fullOrder.id, salesNo: fullOrder.salesNo,
      pickingTaskId: fullTask.id, pickingTaskNo: fullTask.taskNo,
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    startPacking(fullPack.id)
    endPacking(fullPack.id, { [fullLineKey]: ORDER_QTY })
    const fullDelivery = addDeliveryTaskFromPackingTasks([getPackingTask(fullPack.id)!], { assignee: 'Test Operator' })
    handoverToCourierBulk([fullDelivery.id], { assignee: 'Test Operator', transactionDate: '2026-07-11' })
    syncOutboundOrderStatuses()
    expect(fullOrder.status).toBe('completed')
    expect(canPickOrder(fullOrder)).toBe(false)
  })

  it('11. partial-pick picking task (batch-tracked SKU): "Qty to pick" table total must never exceed the line\'s own reduced qty, even though the order reserved more', () => {
    // Regression test — a picking task created with LESS than the order's full
    // reservation (partial pick, rest left for a later list), without the operator
    // re-pinning the batch drawer, used to leak the ORDER's entire reservation into
    // this task's batchPicks (assignmentsFromReservations wasn't capping to the
    // line's own qty) — the drawer's table total ended up way over its own header's
    // "Qty to pick" stat.
    const BATCH_SKU = '1001' // batch-tracked (Green Beans)
    const order = addOutgoing({
      salesNo: 'Test Partial Pick Order',
      source: 'Manual',
      warehouseId: WAREHOUSE_ID,
      warehouseName: WAREHOUSE_NAME,
      skuQty: 1,
      orderQty: 5,
      shippedQty: 0,
      status: 'open',
      dueDate: '2026-08-01',
      lines: [{ sku: BATCH_SKU, productName: 'Green Beans Arabica Gayo Grade 1', desc: '', img: '', unit: 'Sack', qty: 5 }],
    })
    // order reserves the FULL 5 units against real batches via reserveOrder().

    const reducedLine: PickingLine = {
      key: `${order.id}::${BATCH_SKU}`,
      orderId: order.id, salesNo: order.salesNo, sku: BATCH_SKU,
      product: 'Green Beans Arabica Gayo Grade 1', desc: '', img: '', unit: 'Sack', bin: '',
      qty: 2, // picking only 2 of the 5 reserved units — partial pick, no drawer override
    }
    const task = addPickingTask({
      salesOrderIds: [order.id], salesNos: [order.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
      lines: [reducedLine], toPickQty: 2,
    })

    const item = getPickingLineItems(task).find((i) => i.key === reducedLine.key)!
    const batchTotal = (item.batchPicks ?? []).reduce((s, b) => s + b.qty, 0)

    expect(item.expectedQty).toBe(2)  // header "Qty to pick"
    expect(batchTotal).toBe(2)        // table total must match, not the order's full 5
  })
})
