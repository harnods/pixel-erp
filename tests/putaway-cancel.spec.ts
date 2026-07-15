/**
 * PM feedback: WMS tasks must never be deletable — only cancelable, and only
 * while not yet completed. What already happened must never be reverted.
 *
 * PutAwayDetailsPage.vue previously showed "Edit"/"Delete" in its Actions menu
 * even for completed/canceled tasks — both were unwired "coming soon" stubs, but
 * exposing them at all violated the rule. cancelPutAway() already existed but had
 * no status guard and was never called from any UI (dead code). Now gated to
 * open/in-progress only — endPutAway() is what actually commits stock to its
 * final bin/batch/serial location, so a completed task has already taken real
 * effect and must stay a permanent, unchangeable record.
 */
import { describe, it, expect } from 'vitest'
import {
  addPutAwayTask, getPutAwayTask, startPutAway, endPutAway,
  canCancelPutAway, cancelPutAway, putAwayOpenCount,
} from '~/data/putAwayTasks'
import '~/data/warehouseDetails'

const WAREHOUSE_ID = 'wh-006'
const WAREHOUSE_NAME = 'Gudang Makassar Selatan'

function makeTask() {
  return addPutAwayTask({
    receivingTaskIds: [], receivingTaskNos: [],
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
    assignee: 'Test Operator', itemQty: 3,
  })
}

describe('Put-away task — cancel replaces the old Edit/Delete stubs', () => {
  it('an open task can be canceled — terminal, record kept (not erased)', () => {
    const t = makeTask()
    expect(t.status).toBe('open')
    expect(canCancelPutAway(t)).toBe(true)
    const beforeOpen = putAwayOpenCount([WAREHOUSE_ID])

    cancelPutAway(t.id, 'Created by mistake')

    const after = getPutAwayTask(t.id)
    expect(after).toBeTruthy()
    expect(after!.status).toBe('canceled')
    expect(after!.canceledDate).toBeTruthy()
    expect(after!.canceledReason).toBe('Created by mistake')
    expect(putAwayOpenCount([WAREHOUSE_ID])).toBe(beforeOpen - 1)
  })

  it('an in-progress task can also be canceled', () => {
    const t = makeTask()
    startPutAway(t.id)
    expect(getPutAwayTask(t.id)!.status).toBe('in progress')
    expect(canCancelPutAway(getPutAwayTask(t.id)!)).toBe(true)

    cancelPutAway(t.id)
    expect(getPutAwayTask(t.id)!.status).toBe('canceled')
  })

  it('a completed task cannot be canceled — stock already committed to its final location', () => {
    const t = makeTask()
    startPutAway(t.id)
    endPutAway(t.id, [{ skuCode: '1001', qty: 3, binLocation: 'Bin A1' }])
    expect(getPutAwayTask(t.id)!.status).toBe('completed')
    expect(canCancelPutAway(getPutAwayTask(t.id)!)).toBe(false)

    cancelPutAway(t.id, 'Trying anyway')

    const after = getPutAwayTask(t.id)
    expect(after!.status).toBe('completed')
    expect(after!.canceledDate).toBeUndefined()
  })
})
