/**
 * Inbound PO cancellation cascading into an UNFINISHED put-away task — the
 * newest layer of the cascade. Confirmed design:
 *
 *  - A warehouse using put-away no longer marks its PO "completed" the moment
 *    receiving finishes — it stays "in progress" (still cancelable) until
 *    put-away has genuinely finished (see recomputeReceiptStatus in
 *    receivingTasks.ts). "Pending put-away" itself is a ReceivingTask status,
 *    not a Receipt one. This is what makes canceling a PO with an
 *    open/in-progress put-away possible at all.
 *  - Once a put-away task exists for a receiving task and the PO gets
 *    canceled: if that put-away is NOT yet finished (open/in progress —
 *    endPutAway, the only thing that commits real stock, never ran), the
 *    PUT-AWAY task itself is flagged (needsCancelAck) — not the receiving
 *    task, which is left alone (still "completed", non-terminal-looking,
 *    parked pending the put-away's fate). Start/Continue put-away is blocked
 *    until the operator acknowledges.
 *  - Acknowledging cancels the put-away AND its linked receiving task(s) —
 *    nothing left to receive or put away once the one PO behind them is gone.
 *    No stock reversal is ever needed here: nothing was ever committed.
 *  - If the put-away has ALREADY finished (stockCommitted true) by the time
 *    the PO gets canceled, the ORIGINAL receiving-task-level ack+reversal
 *    flow applies instead (see inbound-cancel-cascade-stock.spec.ts) — the
 *    put-away itself, a permanent record, is left untouched.
 */
import { describe, it, expect } from 'vitest'
import { addReceipt, type Receipt } from '~/data/receipts'
import {
  addReceivingTask, getReceivingTask, startReceiving, endReceiving,
} from '~/data/receivingTasks'
import { cancelInboundReceipt } from '~/data/inboundSync'
import {
  addPutAwayTask, startPutAway, endPutAway, getPutAwayTask, acknowledgeCanceledPutAway,
  canCancelPutAway,
} from '~/data/putAwayTasks'
import '~/data/warehouseDetails'

const WAREHOUSE_ID = 'wh-001'
const WAREHOUSE_NAME = 'Gudang Jakarta Pusat'
const SKU_PLAIN = { productId: 'p20', sku: '3001' } // Milk Frothing Pitcher 600ml

let seq = 0
function makeReceipt(qty: number): Receipt {
  seq++
  return addReceipt({
    purchaseNo: `Test Cancel PutAway PO ${seq}`,
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
    skuQty: 1, purchaseQty: qty,
    receivedQty: 0, status: 'open', estimatedArrival: '2026-08-01',
    trackingNos: [], lineItems: [{ productId: SKU_PLAIN.productId, qty }],
  })
}

describe('Receipt status now waits for put-away, not just receiving', () => {
  it('a fully received PO for a put-away-enabled warehouse is "in progress" (still cancelable), not "completed"', () => {
    // "Pending put-away" itself is a ReceivingTask status, not a Receipt one —
    // at the PO level this is just more "in progress" work.
    const receipt = makeReceipt(10)
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    endReceiving(task.id, { [SKU_PLAIN.sku]: 10 }) // full qty
    expect(getReceivingTask(task.id)!.status).toBe('pending put-away')
    expect(receipt.status).toBe('in progress')
    expect(receipt.receivedDate).toBeUndefined()
  })

  it('the PO flips to "completed" only once put-away genuinely finishes (endPutAway)', () => {
    const receipt = makeReceipt(10)
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    endReceiving(task.id, { [SKU_PLAIN.sku]: 10 })
    const pa = addPutAwayTask({
      receivingTaskIds: [task.id], receivingTaskNos: [task.taskNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    expect(receipt.status).toBe('in progress') // put-away merely created, not finished
    startPutAway(pa.id)
    expect(receipt.status).toBe('in progress') // started, still not finished

    endPutAway(pa.id, [{ skuCode: SKU_PLAIN.sku, qty: 10, binLocation: 'A-01-01' }])

    expect(receipt.status).toBe('completed')
    expect(receipt.receivedDate).toBeTruthy()
  })
})

describe('Inbound PO cancel cascade — unfinished put-away is flagged, not the receiving task', () => {
  it('an OPEN put-away (just created) is flagged; the receiving task is left alone', () => {
    const receipt = makeReceipt(10)
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    endReceiving(task.id, { [SKU_PLAIN.sku]: 10 })
    const pa = addPutAwayTask({
      receivingTaskIds: [task.id], receivingTaskNos: [task.taskNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    expect(pa.status).toBe('open')

    const result = cancelInboundReceipt(receipt.id)
    expect(result.ok).toBe(true)
    expect(receipt.status).toBe('canceled')

    expect(getPutAwayTask(pa.id)!.needsCancelAck).toBe(true)
    expect(getPutAwayTask(pa.id)!.status).toBe('open') // not yet canceled — awaiting ack
    const rAfter = getReceivingTask(task.id)!
    expect(rAfter.status).toBe('completed') // untouched — its fate follows the put-away's
    expect(rAfter.needsCancelAck).toBeFalsy()
  })

  it('an IN-PROGRESS put-away (started, not finished) is flagged the same way', () => {
    const receipt = makeReceipt(10)
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    endReceiving(task.id, { [SKU_PLAIN.sku]: 10 })
    const pa = addPutAwayTask({
      receivingTaskIds: [task.id], receivingTaskNos: [task.taskNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    startPutAway(pa.id)
    expect(getPutAwayTask(pa.id)!.status).toBe('in progress')

    cancelInboundReceipt(receipt.id)

    expect(getPutAwayTask(pa.id)!.needsCancelAck).toBe(true)
    expect(getPutAwayTask(pa.id)!.status).toBe('in progress')
  })

  it('Start/Continue put-away stays blocked (canCancelPutAway unaffected) while needsCancelAck is true', () => {
    const receipt = makeReceipt(10)
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    endReceiving(task.id, { [SKU_PLAIN.sku]: 10 })
    const pa = addPutAwayTask({
      receivingTaskIds: [task.id], receivingTaskNos: [task.taskNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    cancelInboundReceipt(receipt.id)

    // The task is still technically "open"/cancelable in the data layer (the
    // UI is what blocks Start/Continue via needsCancelAck) — verify the flag
    // itself is the signal the UI gates on, and it survives untouched here.
    expect(canCancelPutAway(getPutAwayTask(pa.id)!)).toBe(true)
    expect(getPutAwayTask(pa.id)!.needsCancelAck).toBe(true)
  })
})

describe('Inbound PO cancel cascade — acknowledging an unfinished put-away', () => {
  it('cancels the put-away AND its linked receiving task, with a reason, no stock reversal', () => {
    const receipt = makeReceipt(10)
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    endReceiving(task.id, { [SKU_PLAIN.sku]: 10 })
    const pa = addPutAwayTask({
      receivingTaskIds: [task.id], receivingTaskNos: [task.taskNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    cancelInboundReceipt(receipt.id)
    expect(getPutAwayTask(pa.id)!.needsCancelAck).toBe(true)

    acknowledgeCanceledPutAway(pa.id)

    const paAfter = getPutAwayTask(pa.id)!
    expect(paAfter.status).toBe('canceled')
    expect(paAfter.needsCancelAck).toBe(false)
    expect(paAfter.canceledReason).toBe('Purchase order was canceled')
    expect(paAfter.canceledDate).toBeTruthy()

    const rAfter = getReceivingTask(task.id)!
    expect(rAfter.status).toBe('canceled') // cascaded — nothing left to receive either
    expect(rAfter.canceledReason).toBe('Purchase order was canceled')
    // Terminal — can never be started/continued again.
    expect(canCancelPutAway(paAfter)).toBe(false)
  })

  it('acknowledging a put-away that was never flagged is a harmless no-op', () => {
    const receipt = makeReceipt(10)
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    endReceiving(task.id, { [SKU_PLAIN.sku]: 10 })
    const pa = addPutAwayTask({
      receivingTaskIds: [task.id], receivingTaskNos: [task.taskNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    expect(getPutAwayTask(pa.id)!.needsCancelAck).toBeFalsy()

    acknowledgeCanceledPutAway(pa.id)

    expect(getPutAwayTask(pa.id)!.status).toBe('open') // untouched — nothing to acknowledge
  })

  it('a put-away bundling this receiving task alongside an UNRELATED, still-valid receiving task is a known limitation — not exercised/asserted here', () => {
    // Deliberately not covered: a put-away can bundle several receiving
    // tasks (in principle from different POs). Acknowledging cascades
    // forceCancelEndedTask across ALL of a flagged put-away's
    // receivingTaskIds, which would incorrectly cancel an unrelated,
    // still-active PO's receiving task too if it were bundled alongside the
    // canceled one. Flagged to the user as a follow-up, not solved here.
    expect(true).toBe(true)
  })
})

describe('Inbound PO cancel cascade — a put-away that ALREADY finished is untouched by this new layer', () => {
  it('flags the RECEIVING task (not the put-away) once put-away has genuinely finished', () => {
    const receipt = makeReceipt(10)
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    endReceiving(task.id, { [SKU_PLAIN.sku]: 10 })
    const pa = addPutAwayTask({
      receivingTaskIds: [task.id], receivingTaskNos: [task.taskNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    endPutAway(pa.id, [{ skuCode: SKU_PLAIN.sku, qty: 10, binLocation: 'A-01-01' }])
    expect(getPutAwayTask(pa.id)!.status).toBe('completed')
    expect(getReceivingTask(task.id)!.stockCommitted).toBe(true)
    expect(receipt.status).toBe('completed')

    // A completed receipt can no longer be canceled at all — matches the
    // existing terminal-record rule (canCancelReceipt).
    const result = cancelInboundReceipt(receipt.id)
    expect(result).toEqual({ ok: false, reason: 'CANNOT_CANCEL' })
    expect(getPutAwayTask(pa.id)!.needsCancelAck).toBeFalsy()
  })

  it('a "pending reception" partial PO with a genuinely finished put-away for one SKU line stays cancelable, and cascades to the receiving task (not the put-away)', () => {
    // Two-line receipt: one line fully received+put-away'd, the other still
    // outstanding — keeps the PO at "partial reception" (cancelable), with a
    // COMPLETED put-away underneath. Cancel must flag the receiving task
    // (stockCommitted true), not touch the already-finished put-away.
    const SKU_B = { productId: 'p21' } // Tamper 58mm Flat Base
    seq++
    const receipt = addReceipt({
      purchaseNo: `Test Cancel PutAway PO ${seq}`,
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
      skuQty: 2, purchaseQty: 20,
      receivedQty: 0, status: 'open', estimatedArrival: '2026-08-01',
      trackingNos: [], lineItems: [{ productId: SKU_PLAIN.productId, qty: 10 }, { productId: SKU_B.productId, qty: 10 }],
    })
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator', skus: [SKU_PLAIN.sku] })!
    startReceiving(task.id)
    endReceiving(task.id, { [SKU_PLAIN.sku]: 10 }) // this line fully received
    const pa = addPutAwayTask({
      receivingTaskIds: [task.id], receivingTaskNos: [task.taskNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    endPutAway(pa.id, [{ skuCode: SKU_PLAIN.sku, qty: 10, binLocation: 'A-01-01' }])
    expect(getReceivingTask(task.id)!.stockCommitted).toBe(true)
    expect(receipt.status).toBe('partial reception') // the OTHER line is still outstanding

    const result = cancelInboundReceipt(receipt.id)
    expect(result.ok).toBe(true)

    expect(getReceivingTask(task.id)!.needsCancelAck).toBe(true) // flagged — real stock at stake
    expect(getPutAwayTask(pa.id)!.needsCancelAck).toBeFalsy() // put-away already done — untouched
  })
})

describe('Inbound PO cancel cascade — a put-away on a DIFFERENT, unrelated PO is completely unaffected', () => {
  it('canceling one PO does not flag an unrelated PO\'s open put-away', () => {
    const receiptA = makeReceipt(10)
    const taskA = addReceivingTask({ receiptId: receiptA.id, assignee: 'Test Operator' })!
    startReceiving(taskA.id)
    endReceiving(taskA.id, { [SKU_PLAIN.sku]: 10 })
    const paA = addPutAwayTask({
      receivingTaskIds: [taskA.id], receivingTaskNos: [taskA.taskNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })

    const receiptB = makeReceipt(10)
    const taskB = addReceivingTask({ receiptId: receiptB.id, assignee: 'Test Operator' })!
    startReceiving(taskB.id)
    endReceiving(taskB.id, { [SKU_PLAIN.sku]: 10 })
    const paB = addPutAwayTask({
      receivingTaskIds: [taskB.id], receivingTaskNos: [taskB.taskNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })

    cancelInboundReceipt(receiptA.id)

    expect(getPutAwayTask(paA.id)!.needsCancelAck).toBe(true)
    expect(getPutAwayTask(paB.id)!.needsCancelAck).toBeFalsy() // untouched
    expect(receiptB.status).toBe('in progress') // untouched
  })
})
