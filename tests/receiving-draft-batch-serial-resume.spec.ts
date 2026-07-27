/**
 * Regression test for a bug reported against PO060 / Receiving #10090: a draft
 * receiving task ("Save draft", not yet finished) with partial batch/serial
 * progress already recorded (e.g. SKU 1004 received 3 of 4 as one batch, SKU
 * 2004 received 3 of 5 serials) reopened its "Manage batch"/"Manage serial
 * numbers" drawers completely blank on "Continue receiving" instead of
 * prefilling what was already saved.
 *
 * Root cause was two-fold:
 *  1. getTaskLineItems() (receivingTaskDetails.ts) never forwarded the task
 *     item's batchLines/serialNumbers onto the TaskLineItem the page consumes.
 *  2. Seed generation (buildItems() in receivingTasks.ts) never generated a
 *     batch breakdown for batch-tracked SKUs at all — only serials.
 * A migration (patchSnapshotSerials) also needed to cover already-persisted
 * snapshots and in-progress (draft) tasks, not just ended ones.
 */
import { describe, it, expect } from 'vitest'
import {
  createReceivingTask, startReceiving, saveReceivingDraft, getReceivingTask, receivingTasks,
} from '~/data/receivingTasks'
import { getTaskLineItems } from '~/data/receivingTaskDetails'
import { receipts } from '~/data/receipts'
import { DEMO_RECEIPT_ID } from '~/data/receiptLineItems'

const BATCH_SKU = '1001'  // Green Beans Arabica Gayo Grade 1 — batch-tracked
const SERIAL_SKU = '2004' // Espresso Machine Lever Manual 1-Group — serial-tracked

describe('Receiving draft — batch/serial detail survives resume ("Continue receiving")', () => {
  it('getTaskLineItems forwards a saved draft\'s batch/serial breakdown, not just the aggregate qty', () => {
    const receipt = receipts.find((r) => r.id === DEMO_RECEIPT_ID)!
    const task = createReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator', skus: [BATCH_SKU, SERIAL_SKU] })!
    startReceiving(task.id)

    saveReceivingDraft(task.id, { [BATCH_SKU]: 3, [SERIAL_SKU]: 3 }, {
      [BATCH_SKU]: { batchLines: [{ batchNo: 'DRAFT-B1', expiryDate: '2027-01-01', desc: 'Draft lot', qty: 3, unit: 'Sack' }] },
      [SERIAL_SKU]: { serialNumbers: ['SNDRAFT01', 'SNDRAFT02', 'SNDRAFT03'] },
    })

    // Simulate navigating away and back via "Continue receiving" — re-fetch fresh.
    const resumed = getReceivingTask(task.id)!
    expect(resumed.status).toBe('in progress') // still a draft, not ended

    const lineItems = getTaskLineItems(resumed)
    const batchLine = lineItems.find((i) => i.skuCode === BATCH_SKU)!
    const serialLine = lineItems.find((i) => i.skuCode === SERIAL_SKU)!

    expect(batchLine.receivedQty).toBe(3)
    expect(batchLine.batchLines).toEqual([
      { batchNo: 'DRAFT-B1', expiryDate: '2027-01-01', desc: 'Draft lot', qty: 3, unit: 'Sack' },
    ])

    expect(serialLine.receivedQty).toBe(3)
    expect(serialLine.serialNumbers).toEqual(['SNDRAFT01', 'SNDRAFT02', 'SNDRAFT03'])
  })

  it('a fresh (never-drafted) seed task never has batch/serial detail without a matching receivedQty', () => {
    const task = createReceivingTask({ receiptId: (receipts.find((r) => r.id === DEMO_RECEIPT_ID))!.id, assignee: 'Test Operator', skus: [BATCH_SKU, SERIAL_SKU] })!
    for (const it of task.items) {
      expect(it.receivedQty).toBe(0)
      expect(it.batchLines ?? []).toHaveLength(0)
      expect(it.serialNumbers ?? []).toHaveLength(0)
    }
  })

  it('every seeded receiving task item with a batch/serial breakdown has it sum to the aggregate receivedQty (catches drift between the two)', () => {
    for (const t of receivingTasks) {
      for (const it of t.items) {
        if (it.batchLines?.length) {
          expect(it.batchLines.reduce((s, b) => s + b.qty, 0)).toBe(it.receivedQty)
        }
        if (it.serialNumbers?.length) {
          expect(it.serialNumbers.length).toBe(it.receivedQty)
        }
      }
    }
  })

  it('reproduces the exact reported scenario: PO060 / Receiving #10090 has real batch + serial breakdowns for its partially-received lines', () => {
    const task = receivingTasks.find((t) => t.taskNo === 'Receiving #10090')
    expect(task).toBeTruthy()
    expect(task!.status).toBe('in progress') // reported as "saved as draft"

    const skuBatch = task!.items.find((it) => it.sku === '1004')!
    expect(skuBatch.receivedQty).toBe(3)
    expect(skuBatch.batchLines?.length).toBeGreaterThan(0)
    expect(skuBatch.batchLines!.reduce((s, b) => s + b.qty, 0)).toBe(3)

    const skuSerial = task!.items.find((it) => it.sku === '2004')!
    expect(skuSerial.receivedQty).toBe(3)
    expect(skuSerial.serialNumbers?.length).toBe(3)

    // And the page-facing read path (getTaskLineItems) must forward both.
    const lineItems = getTaskLineItems(task!)
    expect(lineItems.find((i) => i.skuCode === '1004')?.batchLines?.length).toBeGreaterThan(0)
    expect(lineItems.find((i) => i.skuCode === '2004')?.serialNumbers?.length).toBe(3)
  })
})
