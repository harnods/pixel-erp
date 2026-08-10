/**
 * End-to-end data-layer test for the inbound flow: receipt (PO) → receiving →
 * put-away, at Gudang Makassar Selatan (wh-006), using the hand-crafted demo PO
 * (rcv-demo-001, see receipts.ts / receiptLineItems.ts DEMO_RECEIPT_ID) — one
 * batch-tracked SKU, one serial-tracked SKU, one plain SKU, qty 2 each.
 *
 * This exists to lock in a real fix: completing a put-away used to only update the
 * PutAwayTask record itself (completedItems/batchAssignments/serialAssignments) —
 * it never touched the warehouse's actual stock. endPutAway() now also commits into
 * warehouseDetails.ts: applyStockInOut() for the plain SKU, registerNewBatch() for
 * the batch-tracked SKU, and the new receiveNewSerials() for the serial-tracked SKU.
 *
 * Exercises the flow across TWO receiving/put-away passes per SKU (a genuine
 * partial receiving cycle: 1 of 2 units, then the remaining 1), asserting at every
 * step that:
 *   - the receipt's derived status walks "pending" → "open" (task created) →
 *     "in progress" (task started) → "partial reception" → back to "in
 *     progress" (every line's cumulative received qty reaches its purchase
 *     qty, but put-away hasn't genuinely finished for wh-006, which has it
 *     enabled — "pending put-away" itself is the receiving TASK's own status,
 *     not the PO's) → "completed" only once put-away has ACTUALLY finished
 *     for every task covering that qty (ReceivingTask.stockCommitted, set by
 *     markStockCommitted — not merely by reaching receiving status
 *     "completed"); a second task created/started while the PO already sits
 *     at "partial reception" does NOT revert it to open/in progress — it
 *     stays "partial reception" until that task also ends;
 *   - on-hand qty for every SKU increases by exactly what was put away, each pass;
 *   - the batch-tracked SKU gets a genuinely NEW batch row per pass (two separate
 *     lots, matching two separate shipments — not one batch double-counted), each
 *     with the correct onHand;
 *   - the serial-tracked SKU's exact serial numbers persist under item.serials.available;
 *   - the bin location every new unit lands in is the SKU's real storage location
 *     (binForSku), not a stray/mismatched one.
 */
import { describe, it, expect } from 'vitest'
import { receipts } from '~/data/receipts'
import { DEMO_RECEIPT_ID } from '~/data/receiptLineItems'
import {
  createReceivingTask, startReceiving, endReceiving, getReceivingTask,
} from '~/data/receivingTasks'
import {
  addPutAwayTask, startPutAway, endPutAway, getPutAwayTask,
} from '~/data/putAwayTasks'
import { getWarehouseDetail, binForSku } from '~/data/warehouseDetails'

const WAREHOUSE_ID = 'wh-006'
const WAREHOUSE_NAME = 'Gudang Makassar Selatan'
const BATCH_SKU = '1001'  // Green Beans Arabica Gayo Grade 1 — batch-tracked
const SERIAL_SKU = '2004' // Espresso Machine Lever Manual 1-Group — serial-tracked
const PLAIN_SKU = '3004'  // Coffee Scale 2kg / 0.1g — plain/untracked
const ALL_SKUS = [BATCH_SKU, SERIAL_SKU, PLAIN_SKU]

function stockOf(sku: string) {
  return getWarehouseDetail(WAREHOUSE_ID)!.stock.find((s) => s.sku === sku)!
}

describe('Inbound flow — receiving + put-away keep on-hand/batch/serial/location accurate through partial receiving', () => {
  it('runs the full two-pass partial receiving + put-away cycle with correct numbers at every step', () => {
    const receipt = receipts.find((r) => r.id === DEMO_RECEIPT_ID)!
    expect(receipt).toBeTruthy()
    expect(receipt.warehouseId).toBe(WAREHOUSE_ID)
    expect(receipt.status).toBe('pending')
    expect(receipt.receivedQty).toBe(0)

    const baseline = Object.fromEntries(ALL_SKUS.map((sku) => [sku, stockOf(sku).onHand]))

    // ── Pass 1: receive 1 of 2 units for every SKU (a genuine partial receipt) ──
    const task1 = createReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator', skus: ALL_SKUS })!
    expect(task1).toBeTruthy()
    expect(task1.items).toHaveLength(3)
    for (const it of task1.items) {
      expect(it.expectedQty).toBe(2)
      expect(it.receivedQty).toBe(0)
    }
    expect(task1.status).toBe('open')
    // Creating the first receiving task bumps the PO from Pending to Open.
    expect(receipt.status).toBe('open')

    startReceiving(task1.id)
    expect(getReceivingTask(task1.id)!.status).toBe('in progress')
    // Starting it bumps the PO from Open to In progress.
    expect(receipt.status).toBe('in progress')

    endReceiving(task1.id, { [BATCH_SKU]: 1, [SERIAL_SKU]: 1, [PLAIN_SKU]: 1 }, {
      [BATCH_SKU]: { batchLines: [{ batchNo: 'PA-DEMO-B1', expiryDate: '2027-01-01', desc: 'Demo lot 1', qty: 1, unit: 'Sack' }] },
      [SERIAL_SKU]: { serialNumbers: ['SNDEMO0001'] },
    })
    const task1Done = getReceivingTask(task1.id)!
    expect(task1Done.status).toBe('pending put-away') // wh-006 has put-away enabled
    for (const it of task1Done.items) expect(it.receivedQty).toBe(1)

    // Received 1 of 2 but NO put-away has run yet → no stock on-hand, so per WMS PRD 1.1
    // C1 AC#7 the PO is still "in progress" (not Partially Completed — that needs on-hand
    // stock). It only becomes "partial reception" after the first put-away posts stock.
    expect(receipt.status).toBe('in progress')
    expect(receipt.receivedQty).toBe(3) // 1 + 1 + 1

    // ── Put away pass 1 — this is what used to be a no-op on real stock ──
    const pa1 = addPutAwayTask({
      receivingTaskIds: [task1.id], receivingTaskNos: [task1.taskNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    expect(getReceivingTask(task1.id)!.status).toBe('completed') // source task consumed by the put-away

    startPutAway(pa1.id)
    expect(getPutAwayTask(pa1.id)!.status).toBe('in progress')

    endPutAway(pa1.id, [
      { skuCode: BATCH_SKU, qty: 1, binLocation: binForSku(WAREHOUSE_ID, BATCH_SKU) },
      { skuCode: SERIAL_SKU, qty: 1, binLocation: binForSku(WAREHOUSE_ID, SERIAL_SKU) },
      { skuCode: PLAIN_SKU, qty: 1, binLocation: binForSku(WAREHOUSE_ID, PLAIN_SKU) },
    ], {
      batchAssignments: { [BATCH_SKU]: [{ batchNo: 'PA-DEMO-B1', expiryDate: '2027-01-01', desc: 'Demo lot 1', qty: 1, unit: 'Sack' }] },
      serialAssignments: { [SERIAL_SKU]: [{ serial: 'SNDEMO0001' }] },
    })
    expect(getPutAwayTask(pa1.id)!.status).toBe('completed')

    // Batch SKU: on-hand +1, a genuinely new batch row worth exactly 1, at the SKU's real bin.
    const batchAfter1 = stockOf(BATCH_SKU)
    expect(batchAfter1.onHand).toBe(baseline[BATCH_SKU] + 1)
    expect(batchAfter1.available).toBe(batchAfter1.onHand - batchAfter1.reserved)
    const lot1 = batchAfter1.batches!.find((b) => b.batchNo === 'PA-DEMO-B1')!
    expect(lot1).toBeTruthy()
    expect(lot1.onHand).toBe(1)
    expect(lot1.location).toBe(binForSku(WAREHOUSE_ID, BATCH_SKU))
    const batchBin1 = batchAfter1.bins.find((b) => b.location === lot1.location)!
    expect(batchBin1.onHand).toBe(batchAfter1.onHand) // single-bin SKU — the whole item lives in one bin

    // Serial SKU: on-hand +1, the exact serial persisted, at the SKU's real bin.
    const serialAfter1 = stockOf(SERIAL_SKU)
    expect(serialAfter1.onHand).toBe(baseline[SERIAL_SKU] + 1)
    expect(serialAfter1.available).toBe(serialAfter1.onHand - serialAfter1.reserved)
    const sn1 = serialAfter1.serials!.available.find((u) => u.serial === 'SNDEMO0001')!
    expect(sn1).toBeTruthy()
    expect(sn1.location).toBe(binForSku(WAREHOUSE_ID, SERIAL_SKU))

    // Plain SKU: on-hand +1, nothing more to it.
    const plainAfter1 = stockOf(PLAIN_SKU)
    expect(plainAfter1.onHand).toBe(baseline[PLAIN_SKU] + 1)
    expect(plainAfter1.available).toBe(plainAfter1.onHand - plainAfter1.reserved)

    // ── Pass 2: receive the remaining 1 of 2 for every SKU ──
    // (mirrors CreatePutAwayPage/CreatePickingPage's own "remaining" re-derivation
    // — a fresh createReceivingTask asks for the line's full purchase qty again;
    // that's an existing, unrelated display quirk, not something this fix touches.)
    const task2 = createReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator', skus: ALL_SKUS })!
    expect(task2).toBeTruthy()
    expect(task2.id).not.toBe(task1.id)
    // task1 already ended (pending put-away/completed), so creating task2 does
    // NOT revert the PO back to Open — it stays Partial reception.
    expect(receipt.status).toBe('partial reception')

    startReceiving(task2.id)
    // Same for starting it — an ended task still takes priority over an active one.
    expect(receipt.status).toBe('partial reception')
    endReceiving(task2.id, { [BATCH_SKU]: 1, [SERIAL_SKU]: 1, [PLAIN_SKU]: 1 }, {
      [BATCH_SKU]: { batchLines: [{ batchNo: 'PA-DEMO-B2', expiryDate: '2027-02-01', desc: 'Demo lot 2', qty: 1, unit: 'Sack' }] },
      [SERIAL_SKU]: { serialNumbers: ['SNDEMO0002'] },
    })
    expect(getReceivingTask(task2.id)!.status).toBe('pending put-away')

    // Every line's cumulative received (1 + 1 = 2) now reaches its purchase qty
    // (2) — but the PO does NOT jump straight to "completed": put-away for
    // wh-006 is enabled, and neither pass's put-away has genuinely finished
    // yet (stockCommitted is still false on both receiving tasks). It stays
    // "in progress" — fully received, still waiting on real put-away.
    expect(receipt.status).toBe('in progress')
    expect(receipt.receivedQty).toBe(6) // 2 + 2 + 2
    expect(receipt.receivedDate).toBeUndefined() // not "completed" yet — no completion date stamped

    // ── Put away pass 2 — a SECOND, independent lot/serial, not a re-registration ──
    const pa2 = addPutAwayTask({
      receivingTaskIds: [task2.id], receivingTaskNos: [task2.taskNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    startPutAway(pa2.id)
    endPutAway(pa2.id, [
      { skuCode: BATCH_SKU, qty: 1, binLocation: binForSku(WAREHOUSE_ID, BATCH_SKU) },
      { skuCode: SERIAL_SKU, qty: 1, binLocation: binForSku(WAREHOUSE_ID, SERIAL_SKU) },
      { skuCode: PLAIN_SKU, qty: 1, binLocation: binForSku(WAREHOUSE_ID, PLAIN_SKU) },
    ], {
      batchAssignments: { [BATCH_SKU]: [{ batchNo: 'PA-DEMO-B2', expiryDate: '2027-02-01', desc: 'Demo lot 2', qty: 1, unit: 'Sack' }] },
      serialAssignments: { [SERIAL_SKU]: [{ serial: 'SNDEMO0002' }] },
    })
    expect(getPutAwayTask(pa2.id)!.status).toBe('completed')

    // NOW — put-away pass 2 genuinely finished, so BOTH receiving tasks'
    // goods are truly committed (pass 1's put-away already finished earlier;
    // pass 2's just did) — the PO finally reads "completed".
    expect(getReceivingTask(task1.id)!.stockCommitted).toBe(true)
    expect(getReceivingTask(task2.id)!.stockCommitted).toBe(true)
    expect(receipt.status).toBe('completed')
    expect(receipt.receivedDate).toBeTruthy()

    // Batch SKU: on-hand now +2 total, TWO distinct lots each worth 1 (never merged
    // into/overwriting one another), summing to exactly the 2 units received.
    const batchFinal = stockOf(BATCH_SKU)
    expect(batchFinal.onHand).toBe(baseline[BATCH_SKU] + 2)
    const lot1Final = batchFinal.batches!.find((b) => b.batchNo === 'PA-DEMO-B1')!
    const lot2Final = batchFinal.batches!.find((b) => b.batchNo === 'PA-DEMO-B2')!
    expect(lot1Final.onHand).toBe(1)
    expect(lot2Final.onHand).toBe(1)
    expect(lot1Final.onHand + lot2Final.onHand).toBe(2)

    // Serial SKU: on-hand +2 total, BOTH exact serials present.
    const serialFinal = stockOf(SERIAL_SKU)
    expect(serialFinal.onHand).toBe(baseline[SERIAL_SKU] + 2)
    const allAvailableSerials = serialFinal.serials!.available.map((u) => u.serial)
    expect(allAvailableSerials).toContain('SNDEMO0001')
    expect(allAvailableSerials).toContain('SNDEMO0002')

    // Plain SKU: on-hand +2 total.
    const plainFinal = stockOf(PLAIN_SKU)
    expect(plainFinal.onHand).toBe(baseline[PLAIN_SKU] + 2)

    // Nothing reserved this new stock along the way — every added unit landed in
    // `available`, not silently swallowed into `reserved`.
    expect(batchFinal.available).toBe(batchFinal.onHand - batchFinal.reserved)
    expect(serialFinal.available).toBe(serialFinal.onHand - serialFinal.reserved)
    expect(plainFinal.available).toBe(plainFinal.onHand - plainFinal.reserved)
  })
})
