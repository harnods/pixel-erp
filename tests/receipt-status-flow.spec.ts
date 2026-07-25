/**
 * Regression guard for the PO (Receipt) status redesign: Pending → Open → In
 * progress → Partial reception/Completed (replacing the old single "on the
 * way" status that never changed until the first receiving task ended).
 *
 * recomputeReceiptStatus() now runs after createReceivingTask(), startReceiving(),
 * cancelReceivingTask(), and endReceiving() (previously only endReceiving()) —
 * see docs/scenarios/inbound-complete-scenario.md §3.1 for the full algorithm.
 */
import { describe, it, expect } from 'vitest'
import { addReceipt, receipts } from '~/data/receipts'
import { lineItemsForReceipt } from '~/data/receiptLineItems'
import {
  createReceivingTask, startReceiving, cancelReceivingTask, endReceiving,
} from '~/data/receivingTasks'

let seq = 0
function freshReceipt() {
  const n = seq++
  const receipt = addReceipt({
    purchaseNo: `PO-STATUS-FLOW-${n}`,
    warehouseId: 'wh-006', warehouseName: 'Gudang Makassar Selatan',
    skuQty: 1, purchaseQty: 10, receivedQty: 0,
    status: 'pending',
    estimatedArrival: '2026-08-01',
    trackingNos: [],
  })
  const sku = lineItemsForReceipt(receipt)[0]!.sku
  return { receipt, sku }
}

function status(receiptId: string): string {
  return receipts.find((r) => r.id === receiptId)!.status
}

describe('Receipt status — Pending / Open / In progress lifecycle', () => {
  it('a brand-new receipt starts Pending', () => {
    const { receipt } = freshReceipt()
    expect(receipt.status).toBe('pending')
  })

  it('creating a receiving task bumps Pending → Open', () => {
    const { receipt, sku } = freshReceipt()
    createReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator', skus: [sku] })
    expect(status(receipt.id)).toBe('open')
  })

  it('starting the task bumps Open → In progress', () => {
    const { receipt, sku } = freshReceipt()
    const task = createReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator', skus: [sku] })!
    startReceiving(task.id)
    expect(status(receipt.id)).toBe('in progress')
  })
})

describe('Receipt status — multi-task tie-break (most-advanced task wins)', () => {
  it('one task In progress + another still Open → PO reads In progress', () => {
    const { receipt } = freshReceipt()
    // Two distinct SKUs on the same receipt so each task can claim its own line.
    const lines = lineItemsForReceipt(receipt)
    expect(lines.length).toBeGreaterThanOrEqual(1)
    const sku = lines[0]!.sku

    const taskA = createReceivingTask({ receiptId: receipt.id, assignee: 'Operator A', skus: [sku], targetQtyBySku: { [sku]: 4 } })!
    expect(status(receipt.id)).toBe('open') // only task A exists so far, not started

    // A second task on the SAME sku's remainder — createReceivingTask() clamps
    // targetQty to whatever's still uncovered, so this stays valid even
    // though task A already claimed part of the line.
    const taskB = createReceivingTask({ receiptId: receipt.id, assignee: 'Operator B', skus: [sku] })!
    expect(status(receipt.id)).toBe('open') // both open — still Open

    startReceiving(taskA.id)
    // taskA in progress, taskB still open → PO must read In progress, not Open.
    expect(status(receipt.id)).toBe('in progress')

    // Starting the second one too changes nothing — still In progress.
    startReceiving(taskB.id)
    expect(status(receipt.id)).toBe('in progress')
  })
})

describe('Receipt status — canceling the last active task drops the PO back down', () => {
  it('canceling the only task on a PO with nothing ever ended reverts Open → Pending', () => {
    const { receipt, sku } = freshReceipt()
    const task = createReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator', skus: [sku] })!
    expect(status(receipt.id)).toBe('open')

    cancelReceivingTask(task.id)
    expect(status(receipt.id)).toBe('pending')
  })

  it('canceling one In-progress task while another Open task remains drops In progress → Open (not Pending)', () => {
    const { receipt, sku } = freshReceipt()
    const taskA = createReceivingTask({ receiptId: receipt.id, assignee: 'Operator A', skus: [sku], targetQtyBySku: { [sku]: 4 } })!
    const taskB = createReceivingTask({ receiptId: receipt.id, assignee: 'Operator B', skus: [sku] })!
    startReceiving(taskA.id)
    expect(status(receipt.id)).toBe('in progress')

    cancelReceivingTask(taskA.id)
    // taskB is still open and nothing has ever ended — PO drops to Open, not
    // all the way to Pending (an active task remains).
    expect(status(receipt.id)).toBe('open')
  })

  it('a PO with an already-ended receiving task does NOT revert to Open/Pending when its only remaining empty task is canceled', () => {
    const { receipt, sku } = freshReceipt()
    const taskA = createReceivingTask({ receiptId: receipt.id, assignee: 'Operator A', skus: [sku], targetQtyBySku: { [sku]: 4 } })!
    startReceiving(taskA.id)
    endReceiving(taskA.id, { [sku]: 4 }) // received 4 of 10, no put-away yet → no stock on-hand
    // Per WMS PRD 1.1 C1 AC#7, "Partially Completed"/partial reception needs on-hand stock
    // (a completed put-away). With none done, the ended-task PO reads "in progress".
    expect(status(receipt.id)).toBe('in progress')

    const taskB = createReceivingTask({ receiptId: receipt.id, assignee: 'Operator B', skus: [sku] })!
    expect(status(receipt.id)).toBe('in progress') // unchanged by the new task

    cancelReceivingTask(taskB.id)
    // taskA already ended, so canceling taskB (which never received anything) leaves the
    // PO exactly where it was — it does NOT revert to Open/Pending.
    expect(status(receipt.id)).toBe('in progress')
  })
})
