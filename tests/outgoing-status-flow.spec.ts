/**
 * Regression guard for the outbound (Sales Order/OutgoingOrder) status redesign:
 * Pending → Open → In progress → Partially shipped/Completed (replacing the old
 * single "open" status that never distinguished "no task yet" from "task created
 * but not started" — both used to read "open").
 *
 * Unlike inbound's recomputeReceiptStatus(receiptId) (called directly inside
 * createReceivingTask/startReceiving/cancelReceivingTask/endReceiving),
 * OutgoingOrder.status is derived by a GLOBAL SWEEP, syncOutboundOrderStatuses()
 * (app/data/outboundSync.ts), which the real pages call on every mount. Picking/
 * packing task mutators (addPickingTask, startPicking, cancelPickingTask,
 * addPackingTaskFromOrder, startPacking, cancelPackingTask, ...) never touch
 * OutgoingOrder.status directly — so every assertion below calls
 * syncOutboundOrderStatuses() explicitly after each mutation, exactly like the
 * real app does via its page-mount side effects.
 */
import { describe, it, expect } from 'vitest'
import { addOutgoing, outgoingOrders, type OutgoingOrder } from '~/data/outgoing'
import { addPickingTask, startPicking, cancelPickingTask } from '~/data/pickingTasks'
import { addPackingTaskFromOrder, startPacking, cancelPackingTask } from '~/data/packingTasks'
import { syncOutboundOrderStatuses } from '~/data/outboundSync'

const WAREHOUSE_ID = 'wh-006'
const WAREHOUSE_NAME = 'Gudang Makassar Selatan'
const SKU = '3004' // plain (Accessory) — no batch/serial reservation noise

let seq = 0
function freshOrder(): OutgoingOrder {
  const n = seq++
  return addOutgoing({
    salesNo: `Test Outgoing Status Flow ${n}`,
    source: 'Manual',
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
    skuQty: 1, orderQty: 1, shippedQty: 0,
    status: 'pending',
    dueDate: '2026-08-01',
    lines: [{ sku: SKU, productName: SKU, desc: '', img: '', unit: 'Unit', qty: 1 }],
  })
}

function status(orderId: string): string {
  return outgoingOrders.find((o) => o.id === orderId)!.status
}

describe('Outgoing order status — Pending / Open / In progress lifecycle', () => {
  it('a brand-new order starts Pending', () => {
    const order = freshOrder()
    expect(order.status).toBe('pending')
    syncOutboundOrderStatuses()
    expect(status(order.id)).toBe('pending') // no task — sync doesn't invent one
  })

  it('creating a picking task bumps Pending → Open', () => {
    const order = freshOrder()
    addPickingTask({
      salesOrderIds: [order.id], salesNos: [order.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    syncOutboundOrderStatuses()
    expect(status(order.id)).toBe('open')
  })

  it('starting the picking task bumps Open → In progress', () => {
    const order = freshOrder()
    const task = addPickingTask({
      salesOrderIds: [order.id], salesNos: [order.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    startPicking(task.id)
    syncOutboundOrderStatuses()
    expect(status(order.id)).toBe('in progress')
  })
})

describe('Outgoing order status — skip-picking (direct-to-packing) path', () => {
  it('creating a packing task directly (no picking task at all) bumps Pending → Open', () => {
    const order = freshOrder()
    addPackingTaskFromOrder({
      salesOrderId: order.id, salesNo: order.salesNo,
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    syncOutboundOrderStatuses()
    expect(status(order.id)).toBe('open')
  })

  it('starting that direct packing task bumps Open → In progress', () => {
    const order = freshOrder()
    const pack = addPackingTaskFromOrder({
      salesOrderId: order.id, salesNo: order.salesNo,
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    startPacking(pack.id)
    syncOutboundOrderStatuses()
    expect(status(order.id)).toBe('in progress')
  })
})

describe('Outgoing order status — multi-task tie-break (most-advanced task wins)', () => {
  it('one picking task In progress + another still Open → order reads In progress', () => {
    const order = freshOrder()
    const taskA = addPickingTask({
      salesOrderIds: [order.id], salesNos: [order.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Operator A',
    })
    const taskB = addPickingTask({
      salesOrderIds: [order.id], salesNos: [order.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Operator B',
    })
    syncOutboundOrderStatuses()
    expect(status(order.id)).toBe('open') // both open — still Open

    startPicking(taskA.id)
    syncOutboundOrderStatuses()
    // taskA in progress, taskB still open → order must read In progress, not Open.
    expect(status(order.id)).toBe('in progress')

    startPicking(taskB.id)
    syncOutboundOrderStatuses()
    expect(status(order.id)).toBe('in progress') // unchanged
  })
})

describe('Outgoing order status — canceling the last active task drops the order back down', () => {
  it('canceling the only picking task on an order with nothing ever ended reverts Open → Pending', () => {
    const order = freshOrder()
    const task = addPickingTask({
      salesOrderIds: [order.id], salesNos: [order.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    syncOutboundOrderStatuses()
    expect(status(order.id)).toBe('open')

    cancelPickingTask(task.id)
    syncOutboundOrderStatuses()
    expect(status(order.id)).toBe('pending')
  })

  it('canceling one In-progress picking task while another Open one remains drops In progress → Open (not Pending)', () => {
    const order = freshOrder()
    const taskA = addPickingTask({
      salesOrderIds: [order.id], salesNos: [order.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Operator A',
    })
    const taskB = addPickingTask({
      salesOrderIds: [order.id], salesNos: [order.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Operator B',
    })
    startPicking(taskA.id)
    syncOutboundOrderStatuses()
    expect(status(order.id)).toBe('in progress')

    cancelPickingTask(taskA.id)
    syncOutboundOrderStatuses()
    // taskB is still open and nothing has ever ended — order drops to Open, not
    // all the way to Pending (an active task remains).
    expect(status(order.id)).toBe('open')
  })

  it('canceling the only (direct) packing task on a Pending-turned-Open order reverts to Pending', () => {
    const order = freshOrder()
    const pack = addPackingTaskFromOrder({
      salesOrderId: order.id, salesNo: order.salesNo,
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    syncOutboundOrderStatuses()
    expect(status(order.id)).toBe('open')

    cancelPackingTask(pack.id)
    syncOutboundOrderStatuses()
    expect(status(order.id)).toBe('pending')
  })
})
