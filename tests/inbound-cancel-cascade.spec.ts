/**
 * Inbound PO cancellation must cascade to that PO's own receiving tasks — a
 * receiving task always belongs to exactly ONE receipt (ReceivingTask.receiptId
 * is singular, unlike Picking's salesOrderIds bundling several sales orders),
 * so canceling a PO invalidates 100% of every task it owns, never a portion:
 *
 *  - open (not started)     → canceled outright, nothing to reconcile.
 *  - in progress (started)  → NOT auto-canceled immediately (real receiving
 *    work may already exist) — flagged (needsCancelAck) so Continue receiving
 *    is blocked until the operator explicitly acknowledges the PO is gone.
 *    Acknowledging then cancels the task too (nothing left to receive once
 *    its one-and-only PO is gone) — real receivedQty stays on the record.
 *  - pending put-away / completed (already ended) → cascade further depends on
 *    whether real, tracked on-hand stock actually exists for it yet
 *    (ReceivingTask.stockCommitted — NOT the same as status === "completed",
 *    see its doc comment in receivingTasks.ts): if no real stock was
 *    committed (the common case — a put-away task was merely created, not
 *    finished, or this is seed/demo data), it's auto-canceled outright, same
 *    as "open". If real stock WAS committed (a genuinely finished put-away,
 *    or receiving committed it directly because put-away is disabled for the
 *    warehouse), it's flagged instead, same as "in progress" — acknowledging
 *    reverses that stock (see tests/inbound-cancel-cascade-stock.spec.ts).
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
  canCancelReceivingTask, acknowledgeCanceledReceipt, completeReceivingWithoutPutAway,
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

  it('acknowledging CANCELS the task — nothing left to receive once its one PO is gone', () => {
    const receipt = makeReceipt(10)
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    cancelInboundReceipt(receipt.id)
    expect(getReceivingTask(task.id)!.needsCancelAck).toBe(true)

    acknowledgeCanceledReceipt(task.id)

    const after = getReceivingTask(task.id)!
    expect(after.needsCancelAck).toBe(false)
    expect(after.status).toBe('canceled') // NOT still in progress — acknowledging cancels it
    expect(after.canceledReason).toBe('Purchase order was canceled')
    expect(after.canceledDate).toBeTruthy()
    // Terminal — can't be canceled again, and (crucially) can never be
    // "started" again since it's not "open" — no way back into receiving.
    expect(canCancelReceivingTask(after)).toBe(false)
  })

  it('acknowledging preserves whatever receivedQty was already real before the PO was canceled', () => {
    const receipt = makeReceipt(10)
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    saveReceivingDraft(task.id, { [SKU_A.sku]: 4 })
    cancelInboundReceipt(receipt.id)

    acknowledgeCanceledReceipt(task.id)

    const after = getReceivingTask(task.id)!
    expect(after.status).toBe('canceled')
    expect(after.receivedQty).toBe(4) // untouched — the record keeps what was real
  })

  it('acknowledging a task whose PO was never canceled is a harmless no-op', () => {
    const receipt = makeReceipt(10)
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    expect(getReceivingTask(task.id)!.needsCancelAck).toBeFalsy()

    acknowledgeCanceledReceipt(task.id)

    const after = getReceivingTask(task.id)!
    expect(after.needsCancelAck).toBeFalsy()
    expect(after.status).toBe('in progress') // guarded — nothing to acknowledge, so nothing happens
  })

  it('acknowledging an already-open (never started) task is a harmless no-op — it was already auto-canceled', () => {
    // Sanity check: an "open" task never gets needsCancelAck at all (it's
    // auto-canceled immediately by cancelInboundReceipt), so acknowledging
    // it afterward must not do anything further.
    const receipt = makeReceipt(10)
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    cancelInboundReceipt(receipt.id)
    expect(getReceivingTask(task.id)!.status).toBe('canceled')
    expect(getReceivingTask(task.id)!.needsCancelAck).toBeFalsy()

    acknowledgeCanceledReceipt(task.id)

    expect(getReceivingTask(task.id)!.status).toBe('canceled')
  })
})

describe('Inbound PO cancel cascade — ended tasks & unrelated POs are never touched', () => {
  it('"state G"-style PO (one ended task + one still-open task): ended task auto-canceled (no real stock committed yet), open task canceled', () => {
    const receipt = makeReceipt(20, [{ productId: SKU_A.productId, qty: 10 }, { productId: SKU_B.productId, qty: 10 }])
    const endedTask = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator', skus: [SKU_A.sku] })!
    startReceiving(endedTask.id)
    endReceiving(endedTask.id, { [SKU_A.sku]: 5 }) // short — receipt becomes "partial reception"
    expect(receipt.status).toBe('partial reception')
    expect(canCancelReceipt(receipt)).toBe(true) // partial reception is still cancelable
    expect(getReceivingTask(endedTask.id)!.stockCommitted).toBeFalsy() // no put-away ever ran for it

    const openTask = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator', skus: [SKU_B.sku] })!
    expect(openTask.status).toBe('open')

    const result = cancelInboundReceipt(receipt.id)
    expect(result.ok).toBe(true)
    expect(receipt.status).toBe('canceled')

    const endedAfter = getReceivingTask(endedTask.id)!
    expect(endedAfter.status).toBe('canceled') // auto-canceled — nothing real to reconcile
    expect(endedAfter.canceledReason).toBe('Purchase order was canceled')
    expect(endedAfter.needsCancelAck).toBeFalsy()
    expect(endedAfter.receivedQty).toBe(5) // untouched — real goods stay accounted for on the record

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
    acknowledgeCanceledReceipt(task.id) // operator acknowledges — task is now canceled too
    expect(getReceivingTask(task.id)!.status).toBe('canceled')

    const result = cancelInboundReceipt(receipt.id) // trying to cancel the PO again
    expect(result).toEqual({ ok: false, reason: 'CANNOT_CANCEL' })
    // The rejected second attempt didn't touch the task any further.
    const after = getReceivingTask(task.id)!
    expect(after.status).toBe('canceled')
    expect(after.needsCancelAck).toBe(false)
  })

  it('a fully received PO is NOT "completed" (still cancelable) until put-away genuinely finishes', () => {
    // Fully receiving a PO no longer immediately marks it "completed" for a
    // warehouse using put-away — it stays "in progress" (still cancelable)
    // until real stock is genuinely committed. ("Pending put-away" itself is
    // the receiving TASK's own status, not the PO's.)
    const receipt = makeReceipt(10)
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    endReceiving(task.id, { [SKU_A.sku]: 10 })
    expect(getReceivingTask(task.id)!.status).toBe('pending put-away')
    expect(receipt.status).toBe('in progress')
    expect(canCancelReceipt(receipt)).toBe(true)

    const result = cancelInboundReceipt(receipt.id)
    expect(result.ok).toBe(true)
  })

  it('returns CANNOT_CANCEL for a fully completed receipt (put-away genuinely finished)', () => {
    const receipt = makeReceipt(10)
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    endReceiving(task.id, { [SKU_A.sku]: 10 })
    expect(receipt.status).toBe('in progress')

    completeReceivingWithoutPutAway(task.id) // simulates real stock genuinely committed
    expect(receipt.status).toBe('completed')

    const result = cancelInboundReceipt(receipt.id)
    expect(result).toEqual({ ok: false, reason: 'CANNOT_CANCEL' })
  })
})
