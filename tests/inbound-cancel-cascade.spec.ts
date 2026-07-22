/**
 * Inbound PO cancellation must cascade to that PO's own receiving tasks — a
 * receiving task always belongs to exactly ONE receipt (ReceivingTask.receiptId
 * is singular, unlike Picking's salesOrderIds bundling several sales orders),
 * so canceling a PO invalidates 100% of every task it owns, never a portion:
 *
 *  - open (not started)     → canceled outright, nothing to reconcile.
 *  - in progress (started)  → NOT auto-canceled (real receiving work may
 *    already exist) — flagged (needsCancelAck) so Continue receiving is
 *    blocked until the operator explicitly acknowledges the PO is gone.
 *  - pending put-away / completed (already ended) → untouched; those goods
 *    are already real and accounted for regardless of the PO's fate.
 *  - a task on a DIFFERENT, unrelated PO → completely untouched.
 *
 * cancelInboundReceipt() (inboundSync.ts) is the orchestrator — it sits above
 * receipts.ts/receivingTasks.ts to avoid a load-time circular import, mirroring
 * cancelOutboundOrder() in outboundSync.ts.
 */
import { describe, it, expect } from 'vitest'
import { addReceipt, canCancelReceipt, type Receipt } from '~/data/receipts'
import {
  addReceivingTask, getReceivingTask, startReceiving, endReceiving, saveReceivingDraft,
  canCancelReceivingTask, acknowledgeCanceledReceipt,
} from '~/data/receivingTasks'
import { cancelInboundReceipt } from '~/data/inboundSync'
import '~/data/warehouseDetails'

const WAREHOUSE_ID = 'wh-006'
const WAREHOUSE_NAME = 'Gudang Makassar Selatan'
const SKU_A = { productId: 'p20', sku: '3001' } // Milk Frothing Pitcher 600ml
const SKU_B = { productId: 'p21', sku: '3002' } // Tamper 58mm Flat Base

let seq = 0
function makeReceipt(qty: number, lines: { productId: string; qty: number }[] = [{ productId: SKU_A.productId, qty }]): Receipt {
  seq++
  return addReceipt({
    purchaseNo: `Test Cancel Cascade PO ${seq}`,
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
    skuQty: lines.length, purchaseQty: lines.reduce((s, l) => s + l.qty, 0),
    receivedQty: 0, status: 'open', estimatedArrival: '2026-08-01',
    trackingNos: [], lineItems: lines,
  })
}

describe('Inbound PO cancel cascade — open receiving task', () => {
  it('an open task on the canceled PO is canceled outright', () => {
    const receipt = makeReceipt(10)
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    expect(task.status).toBe('open')

    const result = cancelInboundReceipt(receipt.id)
    expect(result.ok).toBe(true)

    expect(receipt.status).toBe('canceled')
    const after = getReceivingTask(task.id)!
    expect(after.status).toBe('canceled')
    expect(after.canceledReason).toBe('Purchase order was canceled')
    expect(after.needsCancelAck).toBeFalsy()
  })

  it('canceling the PO leaves the task not cancelable again (terminal state)', () => {
    const receipt = makeReceipt(10)
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!

    cancelInboundReceipt(receipt.id)

    const after = getReceivingTask(task.id)!
    expect(after.status).toBe('canceled')
    expect(canCancelReceivingTask(after)).toBe(false)
  })
})

describe('Inbound PO cancel cascade — in-progress receiving task', () => {
  it('an in-progress task is NOT auto-canceled — flagged for acknowledgment instead', () => {
    const receipt = makeReceipt(10)
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    expect(getReceivingTask(task.id)!.status).toBe('in progress')

    const result = cancelInboundReceipt(receipt.id)
    expect(result.ok).toBe(true)
    expect(receipt.status).toBe('canceled')

    const after = getReceivingTask(task.id)!
    expect(after.status).toBe('in progress') // NOT canceled — status untouched
    expect(after.needsCancelAck).toBe(true)
    expect(after.canceledDate).toBeUndefined()
  })

  it('real receivedQty recorded before the PO was canceled is preserved untouched', () => {
    const receipt = makeReceipt(10)
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    // Operator already logged some real progress before the PO got canceled.
    saveReceivingDraft(task.id, { [SKU_A.sku]: 4 })
    expect(getReceivingTask(task.id)!.receivedQty).toBe(4)

    cancelInboundReceipt(receipt.id)

    const after = getReceivingTask(task.id)!
    expect(after.status).toBe('in progress')
    expect(after.needsCancelAck).toBe(true)
    expect(after.receivedQty).toBe(4) // untouched — nothing lost
  })

  it('acknowledging clears the flag without touching status/qty — task is fully usable again', () => {
    const receipt = makeReceipt(10)
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    cancelInboundReceipt(receipt.id)
    expect(getReceivingTask(task.id)!.needsCancelAck).toBe(true)

    acknowledgeCanceledReceipt(task.id)

    const after = getReceivingTask(task.id)!
    expect(after.needsCancelAck).toBe(false)
    expect(after.status).toBe('in progress') // still in progress, unchanged
    // Still cancelable manually afterward if the operator chooses to, same as
    // any other in-progress task — acknowledging doesn't strip that option.
    expect(canCancelReceivingTask(after)).toBe(true)
  })

  it('acknowledging a task whose PO was never canceled is a harmless no-op', () => {
    const receipt = makeReceipt(10)
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    expect(getReceivingTask(task.id)!.needsCancelAck).toBeFalsy()

    acknowledgeCanceledReceipt(task.id)

    const after = getReceivingTask(task.id)!
    expect(after.needsCancelAck).toBeFalsy()
    expect(after.status).toBe('in progress')
  })
})

describe('Inbound PO cancel cascade — ended tasks & unrelated POs are never touched', () => {
  it('"state G"-style PO (one ended task + one still-open task): ended task untouched, open task canceled', () => {
    const receipt = makeReceipt(20, [{ productId: SKU_A.productId, qty: 10 }, { productId: SKU_B.productId, qty: 10 }])
    const endedTask = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator', skus: [SKU_A.sku] })!
    startReceiving(endedTask.id)
    endReceiving(endedTask.id, { [SKU_A.sku]: 5 }) // short — receipt becomes "partial reception"
    expect(receipt.status).toBe('partial reception')
    expect(canCancelReceipt(receipt)).toBe(true) // partial reception is still cancelable

    const openTask = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator', skus: [SKU_B.sku] })!
    expect(openTask.status).toBe('open')

    const result = cancelInboundReceipt(receipt.id)
    expect(result.ok).toBe(true)
    expect(receipt.status).toBe('canceled')

    const endedAfter = getReceivingTask(endedTask.id)!
    expect(['pending put-away', 'completed']).toContain(endedAfter.status) // untouched
    expect(endedAfter.receivedQty).toBe(5) // untouched — real goods stay accounted for

    const openAfter = getReceivingTask(openTask.id)!
    expect(openAfter.status).toBe('canceled')
  })

  it('a receiving task on a DIFFERENT (unrelated) PO is completely unaffected', () => {
    const receiptA = makeReceipt(10)
    const receiptB = makeReceipt(10)
    const taskA = addReceivingTask({ receiptId: receiptA.id, assignee: 'Test Operator' })!
    const taskB = addReceivingTask({ receiptId: receiptB.id, assignee: 'Test Operator' })!
    startReceiving(taskA.id)
    startReceiving(taskB.id)

    cancelInboundReceipt(receiptA.id)

    expect(receiptA.status).toBe('canceled')
    expect(getReceivingTask(taskA.id)!.needsCancelAck).toBe(true)

    expect(receiptB.status).not.toBe('canceled') // untouched
    const afterB = getReceivingTask(taskB.id)!
    expect(afterB.status).toBe('in progress') // untouched
    expect(afterB.needsCancelAck).toBeFalsy() // untouched
  })

  it('both an open AND an in-progress task on the SAME PO are handled correctly in one cancel', () => {
    const receipt = makeReceipt(20, [{ productId: SKU_A.productId, qty: 10 }, { productId: SKU_B.productId, qty: 10 }])
    const inProgressTask = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator', skus: [SKU_A.sku] })!
    startReceiving(inProgressTask.id)
    const openTask = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator', skus: [SKU_B.sku] })!
    expect(openTask.status).toBe('open')
    expect(inProgressTask.status).toBe('in progress')

    cancelInboundReceipt(receipt.id)

    expect(getReceivingTask(openTask.id)!.status).toBe('canceled')
    const afterInProgress = getReceivingTask(inProgressTask.id)!
    expect(afterInProgress.status).toBe('in progress')
    expect(afterInProgress.needsCancelAck).toBe(true)
  })
})

describe('Inbound PO cancel cascade — guard rails', () => {
  it('returns NOT_FOUND for a bogus receipt id, touching nothing', () => {
    const result = cancelInboundReceipt('rcv-does-not-exist')
    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' })
  })

  it('returns CANNOT_CANCEL for an already-canceled receipt, and does not re-touch its tasks', () => {
    const receipt = makeReceipt(10)
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    cancelInboundReceipt(receipt.id)
    expect(getReceivingTask(task.id)!.needsCancelAck).toBe(true)
    acknowledgeCanceledReceipt(task.id) // operator acknowledges, keeps working

    const result = cancelInboundReceipt(receipt.id) // trying to cancel again
    expect(result).toEqual({ ok: false, reason: 'CANNOT_CANCEL' })
    expect(getReceivingTask(task.id)!.needsCancelAck).toBe(false) // untouched by the rejected attempt
  })

  it('returns CANNOT_CANCEL for a fully completed receipt', () => {
    const receipt = makeReceipt(10)
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    endReceiving(task.id, { [SKU_A.sku]: 10 })
    expect(receipt.status).toBe('completed')

    const result = cancelInboundReceipt(receipt.id)
    expect(result).toEqual({ ok: false, reason: 'CANNOT_CANCEL' })
  })
})
