/**
 * Outbound (picking/packing) was missing the same "cancel while open/in
 * progress" capability Inbound (receiving/put-away) already has.
 *
 * cancelPickingTask() existed but had NO status guard at all and was never
 * called from any UI — dead code that would happily "cancel" an already
 * partially-picked/completed task. cancelPackingTask() didn't exist at all,
 * even though PackingTask.status already included 'canceled'. Both are now
 * gated to open/in-progress only, mirroring canCancelReceivingTask/
 * canCancelPutAway — once real effects are committed (a partial pick's
 * batch/serial pins, a completed pack), the record must stay permanent.
 */
import { describe, it, expect } from 'vitest'
import {
  addPickingTask, getPickingTask, startPicking, endPicking,
  canCancelPickingTask, cancelPickingTask, pickingTaskAgingDays,
} from '~/data/pickingTasks'
import {
  addPackingTask, getPackingTask, startPacking, endPacking,
  canCancelPackingTask, cancelPackingTask,
} from '~/data/packingTasks'
import '~/data/outgoing'

const WAREHOUSE_ID = 'wh-006'
const WAREHOUSE_NAME = 'Gudang Makassar Selatan'

function makePickingTask() {
  return addPickingTask({
    salesOrderIds: [], salesNos: [],
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    lines: [], toPickQty: 3,
  })
}

function makePackingTask() {
  return addPackingTask({
    salesOrderId: 'fake-order', salesNo: 'Test SO',
    pickingTaskId: 'fake-picking-task', pickingTaskNo: 'Fake #1',
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    toPackQty: 3,
  })
}

describe('Picking task — cancel while open/in progress, blocked once ended', () => {
  it('an open task can be canceled — terminal, record kept', () => {
    const t = makePickingTask()
    expect(t.status).toBe('open')
    expect(canCancelPickingTask(t)).toBe(true)

    cancelPickingTask(t.id, 'Created by mistake')

    const after = getPickingTask(t.id)
    expect(after).toBeTruthy()
    expect(after!.status).toBe('canceled')
    expect(after!.canceledDate).toBeTruthy()
    expect(after!.canceledReason).toBe('Created by mistake')
  })

  it('an in-progress task can also be canceled', () => {
    const t = makePickingTask()
    startPicking(t.id)
    expect(getPickingTask(t.id)!.status).toBe('in progress')
    expect(canCancelPickingTask(getPickingTask(t.id)!)).toBe(true)

    cancelPickingTask(t.id)
    expect(getPickingTask(t.id)!.status).toBe('canceled')
  })

  it('a completed task cannot be canceled — picked stock already committed', () => {
    const t = makePickingTask()
    startPicking(t.id)
    // toPickQty is 3; picking all 3 units ends the task as "completed".
    endPicking(t.id, { 'fake::sku': 3 })
    expect(getPickingTask(t.id)!.status).toBe('completed')
    expect(canCancelPickingTask(getPickingTask(t.id)!)).toBe(false)

    cancelPickingTask(t.id, 'Trying anyway')

    const after = getPickingTask(t.id)
    expect(after!.status).toBe('completed')
    expect(after!.canceledDate).toBeUndefined()
  })

  it('a partially-picked task cannot be canceled either — same reason as completed', () => {
    const t = makePickingTask()
    startPicking(t.id)
    // toPickQty is 3; picking only 1 unit ends the task as "partially picked".
    endPicking(t.id, { 'fake::sku': 1 })
    expect(getPickingTask(t.id)!.status).toBe('partially picked')
    expect(canCancelPickingTask(getPickingTask(t.id)!)).toBe(false)

    cancelPickingTask(t.id)
    expect(getPickingTask(t.id)!.status).toBe('partially picked')
  })

  it('a canceled task is unaffected by aging/other read helpers (sanity — no crash on a terminal record)', () => {
    const t = makePickingTask()
    cancelPickingTask(t.id)
    expect(() => pickingTaskAgingDays(getPickingTask(t.id)!)).not.toThrow()
  })
})

describe('Packing task — cancel while open/in progress, blocked once completed', () => {
  it('an open task can be canceled — terminal, record kept', () => {
    const t = makePackingTask()
    expect(t.status).toBe('open')
    expect(canCancelPackingTask(t)).toBe(true)

    cancelPackingTask(t.id, 'Created by mistake')

    const after = getPackingTask(t.id)
    expect(after).toBeTruthy()
    expect(after!.status).toBe('canceled')
    expect(after!.canceledDate).toBeTruthy()
    expect(after!.canceledReason).toBe('Created by mistake')
  })

  it('an in-progress task can also be canceled', () => {
    const t = makePackingTask()
    startPacking(t.id)
    expect(getPackingTask(t.id)!.status).toBe('in progress')
    expect(canCancelPackingTask(getPackingTask(t.id)!)).toBe(true)

    cancelPackingTask(t.id)
    expect(getPackingTask(t.id)!.status).toBe('canceled')
  })

  it('a completed task cannot be canceled — packed stock already committed', () => {
    const t = makePackingTask()
    startPacking(t.id)
    endPacking(t.id)
    expect(getPackingTask(t.id)!.status).toBe('completed')
    expect(canCancelPackingTask(getPackingTask(t.id)!)).toBe(false)

    cancelPackingTask(t.id, 'Trying anyway')

    const after = getPackingTask(t.id)
    expect(after!.status).toBe('completed')
    expect(after!.canceledDate).toBeUndefined()
  })
})
