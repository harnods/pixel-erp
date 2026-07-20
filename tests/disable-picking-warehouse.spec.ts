/**
 * Bug: turning OFF Picking for a warehouse used to cancel every open/in-progress
 * picking task there immediately — the confirmation modal even warned "N
 * in-progress picking tasks will be canceled immediately." That's wrong: only
 * NEW outbound orders should skip picking after this change; work already
 * underway must still be finishable, matching how disablePutAwayForWarehouse
 * already behaves (a documented no-op — see putAwayTasks.ts).
 */
import { describe, it, expect } from 'vitest'
import { addOutgoing } from '~/data/outgoing'
import { addPickingTask, startPicking, getPickingTask, disablePickingForWarehouse, previewDisablePicking } from '~/data/pickingTasks'

const WAREHOUSE_ID = 'wh-006'
const WAREHOUSE_NAME = 'Gudang Makassar Selatan'
const SKU = '3004'

function makeTask(salesNo: string) {
  const order = addOutgoing({
    salesNo, source: 'Manual',
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
    skuQty: 1, orderQty: 5,
    shippedQty: 0, status: 'open', dueDate: '2026-08-01',
    lines: [{ sku: SKU, productName: SKU, desc: '', img: '', unit: 'Unit', qty: 5 }],
  })
  return addPickingTask({
    salesOrderIds: [order.id], salesNos: [order.salesNo],
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
  })
}

describe('disablePickingForWarehouse — existing picking tasks are never canceled', () => {
  it('leaves an "open" and an "in progress" picking task untouched, and reports 0 canceled', () => {
    const taskOpen = makeTask('Test Disable Picking Open')
    expect(taskOpen.status).toBe('open')

    const taskInProgress = makeTask('Test Disable Picking In Progress')
    startPicking(taskInProgress.id)
    expect(getPickingTask(taskInProgress.id)!.status).toBe('in progress')

    const before = previewDisablePicking(WAREHOUSE_ID)
    expect(before.openPickings).toBeGreaterThanOrEqual(2) // both tasks counted as "open"

    const result = disablePickingForWarehouse(WAREHOUSE_ID)
    expect(result.canceledPickings).toBe(0)

    expect(getPickingTask(taskOpen.id)!.status).toBe('open')
    expect(getPickingTask(taskInProgress.id)!.status).toBe('in progress')
  })
})
