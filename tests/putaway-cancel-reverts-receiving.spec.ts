/**
 * Cancelling a put-away must send its source receiving task back to "pending put-away"
 * (the goods still need putting away, so a fresh put-away can be created). The canceled
 * put-away STAYS in the receiving task's linked transactions as an audit record.
 */
import { describe, it, expect } from 'vitest'
import { addReceipt, type Receipt } from '~/data/receipts'
import { addReceivingTask, startReceiving, endReceiving, getReceivingTask } from '~/data/receivingTasks'
import { addPutAwayTask, cancelPutAway, getPutAwayTask } from '~/data/putAwayTasks'
import { getPutAwayForTask } from '~/data/receivingTaskDetails'
import '~/data/warehouseDetails'

const WAREHOUSE_ID = 'wh-001'
const WAREHOUSE_NAME = 'Gudang Jakarta Pusat'
const SKU_PLAIN = { productId: 'p20', sku: '3001' }

let seq = 0
function makeReceipt(qty: number): Receipt {
  seq++
  return addReceipt({
    purchaseNo: `Test PA Revert PO ${seq}`,
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
    skuQty: 1, purchaseQty: qty, receivedQty: 0, status: 'open',
    estimatedArrival: '2026-08-01', trackingNos: [], lineItems: [{ productId: SKU_PLAIN.productId, qty }],
  })
}
function receivedTask() {
  const receipt = makeReceipt(12)
  const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
  startReceiving(task.id)
  endReceiving(task.id, { [SKU_PLAIN.sku]: 10 })
  return task
}

describe('Put-away cancel → receiving reverts to "pending put-away"', () => {
  it('reverts the receiving task but KEEPS the canceled put-away in linked transactions', () => {
    const task = receivedTask()
    expect(getReceivingTask(task.id)!.status).toBe('pending put-away')

    const pa = addPutAwayTask({
      receivingTaskIds: [task.id], receivingTaskNos: [task.taskNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    // Creating the put-away consumes the receiving task → completed, linked to the put-away.
    expect(getReceivingTask(task.id)!.status).toBe('completed')
    expect(getReceivingTask(task.id)!.putAwayTaskId).toBe(pa.id)
    expect(getPutAwayForTask(getReceivingTask(task.id)!).map((p) => p.id)).toContain(pa.id)

    cancelPutAway(pa.id, 'Wrong destination')

    // Put-away is a kept, canceled record...
    expect(getPutAwayTask(pa.id)!.status).toBe('canceled')
    // ...but the receiving task is back to awaiting put-away, unlinked.
    const rt = getReceivingTask(task.id)!
    expect(rt.status).toBe('pending put-away')
    expect(rt.putAwayTaskId).toBeUndefined()
    // ...and the canceled put-away STAYS in the receiving's linked transactions (audit),
    // shown with its canceled status.
    const linked = getPutAwayForTask(rt)
    const canceledRow = linked.find((p) => p.id === pa.id)
    expect(canceledRow).toBeTruthy()
    expect(canceledRow!.status).toBe('canceled')
  })

  it('a fresh put-away can be created after the revert, and it links cleanly', () => {
    const task = receivedTask()
    const pa1 = addPutAwayTask({
      receivingTaskIds: [task.id], receivingTaskNos: [task.taskNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    cancelPutAway(pa1.id)
    expect(getReceivingTask(task.id)!.status).toBe('pending put-away')

    const pa2 = addPutAwayTask({
      receivingTaskIds: [task.id], receivingTaskNos: [task.taskNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    const rt = getReceivingTask(task.id)!
    expect(rt.status).toBe('completed')
    expect(rt.putAwayTaskId).toBe(pa2.id)
    // Both show in linked transactions: the new live put-away AND the earlier canceled one.
    const linkedIds = getPutAwayForTask(rt).map((p) => p.id)
    expect(linkedIds).toContain(pa2.id)
    expect(linkedIds).toContain(pa1.id)
  })
})
