/**
 * Extended inbound PO cancellation cascade — the "pending put-away"/"completed"
 * cases, gated by ReceivingTask.stockCommitted (NOT the same as status ===
 * "completed" — a put-away task can be CREATED, which flips its source
 * receiving task(s) to "completed" immediately, long before that put-away
 * actually runs and commits real stock; see stockCommitted's doc comment in
 * receivingTasks.ts). All cases below stem from the confirmed decisions:
 *
 *  - "pending put-away" → always auto-canceled outright (stockCommitted can
 *    never be true for this status — no put-away task exists for it yet).
 *  - "completed" with NO real stock committed yet (a put-away task was merely
 *    created, not finished — the common in-app case; or legacy/seed data,
 *    which never has stockCommitted set) → auto-canceled outright, same as
 *    "pending put-away". No stock adjustment — nothing real to reverse.
 *  - "completed" WITH real stock committed (a genuinely finished put-away via
 *    endPutAway, OR receiving committed it directly because put-away is
 *    disabled for the warehouse) → flagged for acknowledgment, same as an
 *    in-progress task. Acknowledging reverses that stock via dedicated,
 *    batch/serial-safe primitives (never a naive aggregate delta, which would
 *    desync the batch-sum-matches-item-total invariant tests/data-integrity
 *    .spec.ts enforces) and records an audited stock adjustment.
 *  - Put-away-disabled gap fix: a warehouse with put-away disabled has no
 *    separate put-away step to ever commit stock — receiving itself now does
 *    it directly (commitReceivingStock), verified in isolation below.
 */
import { describe, it, expect } from 'vitest'
import { addReceipt, type Receipt } from '~/data/receipts'
import {
  addReceivingTask, getReceivingTask, startReceiving, endReceiving, saveReceivingDraft,
  acknowledgeCanceledReceipt, completeReceivingWithoutPutAway,
} from '~/data/receivingTasks'
import { cancelInboundReceipt } from '~/data/inboundSync'
import { addPutAwayTask, endPutAway, getPutAwayTask } from '~/data/putAwayTasks'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { wmsStockAdjustments } from '~/data/wmsStockAdjustments'

const WAREHOUSE_ID = 'wh-001'
const WAREHOUSE_NAME = 'Gudang Jakarta Pusat'
const SKU_PLAIN = { productId: 'p20', sku: '3001' } // Milk Frothing Pitcher 600ml — plain
const SKU_BATCH = { productId: 'p01', sku: '1001' } // Green Beans Arabica Gayo — batch-tracked
const SKU_SERIAL = { productId: 'p16', sku: '2101' } // Coffee Grinder On-Demand 64mm — serial-tracked

let seq = 0
function makeReceipt(qty: number, productId: string): Receipt {
  seq++
  return addReceipt({
    purchaseNo: `Test Cancel Stock PO ${seq}`,
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
    skuQty: 1, purchaseQty: qty,
    receivedQty: 0, status: 'open', estimatedArrival: '2026-08-01',
    trackingNos: [], lineItems: [{ productId, qty }],
  })
}

function onHandFor(sku: string): number {
  return getWarehouseDetail(WAREHOUSE_ID)!.stock.find((s) => s.sku === sku)!.onHand
}
function batchesFor(sku: string) {
  return getWarehouseDetail(WAREHOUSE_ID)!.stock.find((s) => s.sku === sku)!.batches ?? []
}

describe('Inbound PO cancel cascade — "pending put-away" receiving stays Completed', () => {
  it('a pending-put-away task (goods received, no put-away) stays Completed on PO cancel — received work is never reverted', () => {
    // Purchase qty > received qty so the receipt itself is cancelable — a fully-received
    // PO is a permanent record that can never be canceled.
    const receipt = makeReceipt(12, SKU_PLAIN.productId)
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    endReceiving(task.id, { [SKU_PLAIN.sku]: 10 })
    expect(getReceivingTask(task.id)!.status).toBe('pending put-away')
    expect(getReceivingTask(task.id)!.stockCommitted).toBeFalsy()

    const result = cancelInboundReceipt(receipt.id)
    expect(result.ok).toBe(true)

    // Per WMS PRD 1.1 C1 AC#6, a receiving task that already received goods stays
    // Completed — never canceled. No put-away runs (order gone); no stock committed.
    const after = getReceivingTask(task.id)!
    expect(after.status).toBe('completed')
    expect(after.putAwayTaskId).toBeUndefined()
    expect(after.stockCommitted).toBeFalsy()
    expect(after.items.reduce((s, it) => s + it.receivedQty, 0)).toBe(10) // receivedQty kept
  })
})

describe('Inbound PO cancel cascade — "completed" with a real (unfinished) put-away link', () => {
  it('a put-away merely CREATED (open, never started) is auto-canceled outright — receiving stays completed, no reversal', () => {
    // See tests/inbound-cancel-cascade-putaway.spec.ts for the in-progress put-away
    // ack cascade (that one is flagged first; this open one cancels immediately).
    const receipt = makeReceipt(12, SKU_PLAIN.productId)
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    endReceiving(task.id, { [SKU_PLAIN.sku]: 10 })
    const pa = addPutAwayTask({
      receivingTaskIds: [task.id], receivingTaskNos: [task.taskNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    // Creating the put-away task alone flips receiving to "completed" — long
    // before endPutAway() ever runs, so no real stock exists yet.
    expect(getReceivingTask(task.id)!.status).toBe('completed')
    expect(getReceivingTask(task.id)!.stockCommitted).toBeFalsy()
    const adjustmentsBefore = wmsStockAdjustments.length

    const result = cancelInboundReceipt(receipt.id)
    expect(result.ok).toBe(true)

    expect(getPutAwayTask(pa.id)!.status).toBe('canceled') // open → auto-canceled, no ack
    expect(getPutAwayTask(pa.id)!.needsCancelAck).toBeFalsy()
    const after = getReceivingTask(task.id)!
    expect(after.status).toBe('completed') // done work stays completed
    expect(after.needsCancelAck).toBeFalsy()
    expect(wmsStockAdjustments.length).toBe(adjustmentsBefore) // nothing to reverse — no adjustment created
  })

  it('legacy/malformed "completed" data with NO put-away link and stockCommitted never set is auto-canceled, no reversal attempted', () => {
    // A completed task normally always has EITHER a putAwayTaskId (put-away
    // enabled) or stockCommitted=true (put-away disabled — commitReceivingStock
    // sets both together) — this simulates the leftover defensive case of
    // neither being true (e.g. hand-edited/malformed legacy data).
    const receipt = makeReceipt(12, SKU_PLAIN.productId)
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    endReceiving(task.id, { [SKU_PLAIN.sku]: 10 })
    addPutAwayTask({
      receivingTaskIds: [task.id], receivingTaskNos: [task.taskNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    const malformed = getReceivingTask(task.id)!
    delete malformed.putAwayTaskId // simulate the missing-link edge case
    expect(malformed.stockCommitted).toBeFalsy()
    const onHandBefore = onHandFor(SKU_PLAIN.sku)

    cancelInboundReceipt(receipt.id)

    expect(getReceivingTask(task.id)!.status).toBe('canceled')
    expect(onHandFor(SKU_PLAIN.sku)).toBe(onHandBefore) // untouched — nothing real existed to reverse
  })
})

describe('Inbound PO cancel cascade — "completed" WITH real stock committed (finished put-away)', () => {
  it('plain SKU: flagged (not auto-canceled) while stockCommitted, acknowledging cancels + reverses on-hand + records a stock adjustment', () => {
    const receipt = makeReceipt(12, SKU_PLAIN.productId)
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    endReceiving(task.id, { [SKU_PLAIN.sku]: 10 })
    const pa = addPutAwayTask({
      receivingTaskIds: [task.id], receivingTaskNos: [task.taskNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    const onHandBeforePutAway = onHandFor(SKU_PLAIN.sku)
    endPutAway(pa.id, [{ skuCode: SKU_PLAIN.sku, qty: 10, binLocation: 'A-01-01' }])
    expect(getReceivingTask(task.id)!.stockCommitted).toBe(true)
    expect(onHandFor(SKU_PLAIN.sku)).toBe(onHandBeforePutAway + 10)
    const adjustmentsBefore = wmsStockAdjustments.length

    const result = cancelInboundReceipt(receipt.id)
    expect(result.ok).toBe(true)
    const flagged = getReceivingTask(task.id)!
    expect(flagged.status).toBe('completed') // NOT auto-canceled — real stock is at stake
    expect(flagged.needsCancelAck).toBe(true)

    acknowledgeCanceledReceipt(task.id)

    const after = getReceivingTask(task.id)!
    expect(after.status).toBe('canceled')
    expect(after.needsCancelAck).toBe(false)
    expect(after.canceledReason).toBe('Purchase order was canceled')
    expect(onHandFor(SKU_PLAIN.sku)).toBe(onHandBeforePutAway) // reversed back to baseline

    expect(wmsStockAdjustments.length).toBe(adjustmentsBefore + 1)
    const adj = wmsStockAdjustments[0]!
    expect(adj.kind).toBe('in-out')
    expect(adj.warehouseId).toBe(WAREHOUSE_ID)
    expect(adj.lines?.some((l) => l.sku === SKU_PLAIN.sku && l.qty === -10)).toBe(true)
  })

  it('batch-tracked SKU: reversal removes the exact batch and keeps the batch-sum-matches-item-total invariant intact', () => {
    const receipt = makeReceipt(24, SKU_BATCH.productId)
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    const batchNo = `TEST-BATCH-${seq}`
    endReceiving(task.id, { [SKU_BATCH.sku]: 20 }, {
      [SKU_BATCH.sku]: { batchLines: [{ batchNo, expiryDate: '2027-01-01', desc: '', qty: 20, unit: 'Sack' }] },
    })
    const pa = addPutAwayTask({
      receivingTaskIds: [task.id], receivingTaskNos: [task.taskNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    const onHandBefore = onHandFor(SKU_BATCH.sku)
    endPutAway(pa.id, [{ skuCode: SKU_BATCH.sku, qty: 20, binLocation: 'A-01-01' }], {
      batchAssignments: { [SKU_BATCH.sku]: [{ batchNo, expiryDate: '2027-01-01', desc: '', qty: 20, unit: 'Sack' }] },
    })
    expect(getReceivingTask(task.id)!.stockCommitted).toBe(true)
    expect(onHandFor(SKU_BATCH.sku)).toBe(onHandBefore + 20)
    expect(batchesFor(SKU_BATCH.sku).some((b) => b.batchNo === batchNo)).toBe(true)
    // Invariant: sum(batch.onHand) === item.onHand, holds even after the new batch.
    expect(batchesFor(SKU_BATCH.sku).reduce((s, b) => s + b.onHand, 0)).toBe(onHandFor(SKU_BATCH.sku))

    cancelInboundReceipt(receipt.id)
    acknowledgeCanceledReceipt(task.id)

    expect(getReceivingTask(task.id)!.status).toBe('canceled')
    expect(onHandFor(SKU_BATCH.sku)).toBe(onHandBefore) // reversed
    expect(batchesFor(SKU_BATCH.sku).some((b) => b.batchNo === batchNo)).toBe(false) // batch fully removed
    // Invariant still holds post-reversal — no aggregate/per-batch desync.
    expect(batchesFor(SKU_BATCH.sku).reduce((s, b) => s + b.onHand, 0)).toBe(onHandFor(SKU_BATCH.sku))
  })

  it('serial-tracked SKU: reversal removes the exact serials and the aggregate on-hand', () => {
    const receipt = makeReceipt(3, SKU_SERIAL.productId)
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    const serials = [`TEST-SN-${seq}-A`, `TEST-SN-${seq}-B`]
    endReceiving(task.id, { [SKU_SERIAL.sku]: 2 }, { [SKU_SERIAL.sku]: { serialNumbers: serials } })
    const pa = addPutAwayTask({
      receivingTaskIds: [task.id], receivingTaskNos: [task.taskNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    const onHandBefore = onHandFor(SKU_SERIAL.sku)
    endPutAway(pa.id, [{ skuCode: SKU_SERIAL.sku, qty: 2, binLocation: 'A-01-01' }], {
      serialAssignments: { [SKU_SERIAL.sku]: serials.map((serial) => ({ serial })) },
    })
    expect(getReceivingTask(task.id)!.stockCommitted).toBe(true)
    expect(onHandFor(SKU_SERIAL.sku)).toBe(onHandBefore + 2)
    const detail = getWarehouseDetail(WAREHOUSE_ID)!.stock.find((s) => s.sku === SKU_SERIAL.sku)!
    for (const sn of serials) expect(detail.serials?.available.some((s) => s.serial === sn)).toBe(true)

    cancelInboundReceipt(receipt.id)
    acknowledgeCanceledReceipt(task.id)

    expect(getReceivingTask(task.id)!.status).toBe('canceled')
    expect(onHandFor(SKU_SERIAL.sku)).toBe(onHandBefore)
    const detailAfter = getWarehouseDetail(WAREHOUSE_ID)!.stock.find((s) => s.sku === SKU_SERIAL.sku)!
    for (const sn of serials) expect(detailAfter.serials?.available.some((s) => s.serial === sn)).toBe(false)
  })
})

describe('Put-away-disabled gap fix — receiving commits real stock directly when there is no put-away step', () => {
  it('completeReceivingWithoutPutAway commits real on-hand stock and marks stockCommitted', () => {
    const receipt = makeReceipt(8, SKU_PLAIN.productId)
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    endReceiving(task.id, { [SKU_PLAIN.sku]: 6 })
    expect(getReceivingTask(task.id)!.stockCommitted).toBeFalsy()
    const onHandBefore = onHandFor(SKU_PLAIN.sku)

    completeReceivingWithoutPutAway(task.id)

    expect(getReceivingTask(task.id)!.status).toBe('completed')
    expect(getReceivingTask(task.id)!.stockCommitted).toBe(true)
    expect(onHandFor(SKU_PLAIN.sku)).toBe(onHandBefore + 6) // gap fixed — stock is genuinely committed now
  })

  it('a task committed this way is reversible the same as a real put-away, once its PO is canceled', () => {
    const receipt = makeReceipt(8, SKU_PLAIN.productId)
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    endReceiving(task.id, { [SKU_PLAIN.sku]: 6 })
    completeReceivingWithoutPutAway(task.id)
    const onHandBefore = onHandFor(SKU_PLAIN.sku) - 6 // undo the commit we just asserted above, to get the true baseline
    const onHandCommitted = onHandFor(SKU_PLAIN.sku)

    cancelInboundReceipt(receipt.id)
    expect(getReceivingTask(task.id)!.needsCancelAck).toBe(true) // stockCommitted → flagged, not auto-canceled

    acknowledgeCanceledReceipt(task.id)

    expect(getReceivingTask(task.id)!.status).toBe('canceled')
    expect(onHandFor(SKU_PLAIN.sku)).toBe(onHandCommitted - 6)
    expect(onHandFor(SKU_PLAIN.sku)).toBe(onHandBefore)
  })
})
