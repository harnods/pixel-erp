/**
 * Reported bug: order qty 3, picking task Qty to pick 3, only 1 ever picked →
 * "partially picked" → packed 1 → shipped 1 → order becomes "partially shipped".
 * A SECOND picking task is then created for the remaining 2 (already covered by
 * a prior fix — see outbound-flow.spec.ts test 12: canPickOrder() must allow
 * this). Once that second picking task finishes, "Create packing" must be
 * available again — NOT blocked just because the order already has an OLDER
 * packing task from the first, unrelated cycle. And once that second packing
 * task is packed and shipped too, the order must reach "completed" — with every
 * qty figure along the way scoped to its OWN cycle, never leaking in the first
 * cycle's already-shipped units.
 */
import { describe, it, expect } from 'vitest'
import { addOutgoing, type OutgoingOrder } from '~/data/outgoing'
import {
  addPickingTask, startPicking, endPicking, getPickingTask, canPickOrder, packableOrderIds,
} from '~/data/pickingTasks'
import {
  addPackingTask, startPacking, endPacking, getPackingTask, orderPackedFromPickingTask,
} from '~/data/packingTasks'
import { getPackingLineItems } from '~/data/packingTaskDetails'
import { addDeliveryTaskFromPackingTasks, handoverToCourierBulk } from '~/data/deliveryTasks'
import { getDeliveryLineItems } from '~/data/deliveryTaskDetails'
import { syncOutboundOrderStatuses } from '~/data/outboundSync'

const WAREHOUSE_ID = 'wh-006'
const WAREHOUSE_NAME = 'Gudang Makassar Selatan'
const SKU = '3004' // plain (Accessory) — no batch/serial noise, pure qty lifecycle
const ORDER_QTY = 3

function makeOrder(): OutgoingOrder {
  return addOutgoing({
    salesNo: 'Test Repeat Cycle Order',
    source: 'Manual',
    warehouseId: WAREHOUSE_ID,
    warehouseName: WAREHOUSE_NAME,
    skuQty: 1,
    orderQty: ORDER_QTY,
    shippedQty: 0,
    status: 'open',
    dueDate: '2026-08-01',
    lines: [{ sku: SKU, productName: 'Coffee Scale 2kg / 0.1g', desc: '', img: '', unit: 'Unit', qty: ORDER_QTY }],
  })
}

describe('Partially shipped order → new picking cycle → Create packing must reappear → order reaches "completed"', () => {
  it('runs the full first-cycle-then-second-cycle lifecycle with correct, non-leaking numbers at every stage', () => {
    const order = makeOrder()
    const lineKey = `${order.id}::${SKU}`

    // ── First cycle: pick 1 of 3, pack 1, ship 1 → order "partially shipped" ──
    const task1 = addPickingTask({
      salesOrderIds: [order.id], salesNos: [order.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    startPicking(task1.id)
    endPicking(task1.id, { [lineKey]: 1 })
    expect(getPickingTask(task1.id)!.status).toBe('partially picked')

    const pack1 = addPackingTask({
      salesOrderId: order.id, salesNo: order.salesNo,
      pickingTaskId: task1.id, pickingTaskNo: task1.taskNo,
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    expect(pack1.toPackQty).toBe(1) // scoped to task1's own contribution, not the full order qty
    startPacking(pack1.id)
    endPacking(pack1.id, { [lineKey]: 1 })
    expect(getPackingTask(pack1.id)!.status).toBe('completed')

    const delivery1 = addDeliveryTaskFromPackingTasks([getPackingTask(pack1.id)!], { assignee: 'Test Operator' })
    handoverToCourierBulk([delivery1.id], { assignee: 'Test Operator', transactionDate: '2026-07-11' })
    syncOutboundOrderStatuses()
    expect(order.status).toBe('partially shipped')
    expect(order.shippedQty).toBe(1)

    // First-ever cycle for this order — nothing shipped BEFORE it, so its own
    // "View batch/SN details" must never show a "Shipped qty" stat at all.
    const delivery1Item = getDeliveryLineItems(delivery1).find((i) => i.skuCode === SKU)!
    expect(delivery1Item.shippedElsewhere).toBe(0)

    // ── The already-covered fix: order must still be pickable for the remaining 2 ──
    expect(canPickOrder(order)).toBe(true)

    // ── Second cycle: a NEW picking task for the remaining 2 ──
    // (mirrors CreatePickingPage.vue's own "remaining = orderQty - alreadyPicked"
    // line-qty computation — a fresh addPickingTask() with no override would ask
    // for the order's FULL demand again, not just what's left.)
    const remainingLine = {
      key: lineKey, orderId: order.id, salesNo: order.salesNo, sku: SKU,
      product: 'Coffee Scale 2kg / 0.1g', desc: '', img: '', unit: 'Unit', bin: '',
      qty: ORDER_QTY - 1,
    }
    const task2 = addPickingTask({
      salesOrderIds: [order.id], salesNos: [order.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
      lines: [remainingLine], toPickQty: ORDER_QTY - 1,
    })
    startPicking(task2.id)
    endPicking(task2.id, { [lineKey]: 2 })
    expect(getPickingTask(task2.id)!.status).toBe('completed') // 2 of its own toPickQty=2

    // THE BUG: "Create packing" must be available for task2 — NOT blocked just
    // because the order already has pack1 from the unrelated first cycle.
    const packableIds = packableOrderIds(task2)
    expect(packableIds).toContain(order.id)
    expect(orderPackedFromPickingTask(order.id, task2.id)).toBe(false) // no packing task from THIS picking task yet
    const stillPackable = packableIds.filter((id) => !orderPackedFromPickingTask(id, task2.id))
    expect(stillPackable).toContain(order.id) // button/action must be available

    // ── Create the second packing task — numbers must be scoped to THIS cycle only ──
    const pack2 = addPackingTask({
      salesOrderId: order.id, salesNo: order.salesNo,
      pickingTaskId: task2.id, pickingTaskNo: task2.taskNo,
      pickingTaskIds: [task2.id], pickingTaskNos: [task2.taskNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    expect(pack2.toPackQty).toBe(2) // NOT 3 — must not include the first cycle's already-shipped unit

    const pack2Item = getPackingLineItems(pack2).find((i) => i.key === lineKey)!
    expect(pack2Item.pickedQty).toBe(2) // scoped to task2 only, not cumulative (1 + 2 = 3)

    // orderPackedFromPickingTask must now be true, but ONLY for task2 — pack1's
    // linkage to task1 is a separate, independent fact.
    expect(orderPackedFromPickingTask(order.id, task2.id)).toBe(true)
    expect(orderPackedFromPickingTask(order.id, task1.id)).toBe(true) // still true, from cycle 1

    startPacking(pack2.id)
    endPacking(pack2.id, { [lineKey]: 2 })
    expect(getPackingTask(pack2.id)!.status).toBe('completed')
    expect(getPackingTask(pack2.id)!.packedQty).toBe(2)

    // ── Ship the second cycle too → order must finally reach "completed" ──
    const delivery2 = addDeliveryTaskFromPackingTasks([getPackingTask(pack2.id)!], { assignee: 'Test Operator' })
    expect(delivery2.toShipQty).toBe(2)

    // THE FEATURE: delivery2's own "View batch/SN details" must show "Shipped
    // qty: 1" — the prior, independent cycle's already-shipped unit — explaining
    // why Order qty (3) doesn't match Picked/Packed qty (2) for THIS cycle.
    const delivery2Item = getDeliveryLineItems(delivery2).find((i) => i.skuCode === SKU)!
    expect(delivery2Item.orderQty).toBe(3)
    expect(delivery2Item.qty).toBe(2) // this cycle's own packed/to-ship qty
    expect(delivery2Item.shippedElsewhere).toBe(1) // cycle 1's already-shipped unit

    handoverToCourierBulk([delivery2.id], { assignee: 'Test Operator', transactionDate: '2026-07-12' })

    syncOutboundOrderStatuses()
    expect(order.status).toBe('completed')
    expect(order.shippedQty).toBe(3) // 1 (cycle 1) + 2 (cycle 2), never double-counted
    expect(canPickOrder(order)).toBe(false) // genuinely nothing left now
  })
})
