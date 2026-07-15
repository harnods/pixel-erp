/**
 * PM feedback: WMS tasks must never be deletable — only cancelable, and only
 * while not yet completed. What already happened must never be reverted.
 *
 * ReceivingIndexPage.vue previously had a full Delete UI (bulk + per-row) whose
 * own copy said "Deleting it will return those units to the purchase order" —
 * exactly the kind of revert-what-happened behavior the PM's rule forbids. It
 * was never actually wired to real logic (fake toast only). Replaced with a real
 * cancelReceivingTask(), gated to tasks that haven't finished receiving yet
 * (open/in progress) — "pending put-away"/"completed" already count toward the
 * PO's received qty (see recomputeReceiptStatus/uncoveredLineItems), so canceling
 * those would make received stock unaccounted for.
 */
import { describe, it, expect } from 'vitest'
import {
  addReceivingTask, getReceivingTask, startReceiving, endReceiving,
  canCancelReceivingTask, cancelReceivingTask, receivingOpenCount, uncoveredLineItems,
} from '~/data/receivingTasks'
import '~/data/warehouseDetails'
import { receipts } from '~/data/receipts'

const WAREHOUSE_ID = 'wh-006'

function firstReceiptAt(warehouseId: string) {
  const r = receipts.find((x) => x.warehouseId === warehouseId && x.status !== 'canceled' && x.status !== 'completed')
  return r!
}

describe('Receiving task — cancel replaces delete', () => {
  it('an open task can be canceled — terminal, record kept (not erased)', () => {
    const receipt = firstReceiptAt(WAREHOUSE_ID)
    const t = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    expect(t.status).toBe('open')
    expect(canCancelReceivingTask(t)).toBe(true)
    const beforeOpen = receivingOpenCount([WAREHOUSE_ID])

    cancelReceivingTask(t.id, 'Created by mistake')

    const after = getReceivingTask(t.id)
    expect(after).toBeTruthy() // record still exists — never deleted
    expect(after!.status).toBe('canceled')
    expect(after!.canceledDate).toBeTruthy()
    expect(after!.canceledReason).toBe('Created by mistake')
    expect(receivingOpenCount([WAREHOUSE_ID])).toBe(beforeOpen - 1)
  })

  it('an in-progress task can also be canceled', () => {
    const receipt = firstReceiptAt(WAREHOUSE_ID)
    const t = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(t.id)
    expect(getReceivingTask(t.id)!.status).toBe('in progress')
    expect(canCancelReceivingTask(getReceivingTask(t.id)!)).toBe(true)

    cancelReceivingTask(t.id)
    expect(getReceivingTask(t.id)!.status).toBe('canceled')
  })

  it('a task in "pending put-away" or "completed" cannot be canceled — receiving is already done', () => {
    const receipt = firstReceiptAt(WAREHOUSE_ID)
    const t = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(t.id)
    endReceiving(t.id, {})
    const ended = getReceivingTask(t.id)!
    expect(['pending put-away', 'completed']).toContain(ended.status)
    expect(canCancelReceivingTask(ended)).toBe(false)

    cancelReceivingTask(t.id, 'Trying anyway')

    const after = getReceivingTask(t.id)
    expect(after!.status).toBe(ended.status) // untouched
    expect(after!.canceledDate).toBeUndefined()
  })

  it('canceling a task frees its SKUs back to uncovered for a new receiving task', () => {
    const receipt = firstReceiptAt(WAREHOUSE_ID)
    const uncoveredBefore = uncoveredLineItems(receipt.id)
    expect(uncoveredBefore.length).toBeGreaterThan(0)
    const skus = uncoveredBefore.map((l) => l.sku)

    const t = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator', skus })!
    expect(uncoveredLineItems(receipt.id).some((l) => skus.includes(l.sku))).toBe(false) // now covered

    cancelReceivingTask(t.id)

    expect(uncoveredLineItems(receipt.id).some((l) => skus.includes(l.sku))).toBe(true) // uncovered again
  })
})
