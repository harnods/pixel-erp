/**
 * Inbound happy-path (non-cancel) — the COMBINED case that was only covered in
 * pieces before: MULTIPLE ORDERS (distinct POs) + PARTIAL reception, bundled into
 * ONE put-away. Complements:
 *   - receiving-putaway-flow.spec.ts        (partial, single order, two passes)
 *   - put-away-multi-receiving-task-merge.spec.ts (multiple orders, all full — merge only)
 * Here both dimensions combine, and we additionally assert the per-order STATUS
 * divergence (fully-received order → Completed; short order → Partial reception,
 * once stock is committed per WMS PRD 1.1 C1 AC#7) and that on-hand posts exactly
 * what was RECEIVED across both orders (partial contributes only its received qty).
 */
import { describe, it, expect } from 'vitest'
import { addReceipt, receipts } from '~/data/receipts'
import { createReceivingTask, startReceiving, endReceiving, getReceivingTask } from '~/data/receivingTasks'
import { addPutAwayTask, startPutAway, endPutAway, getPutAwayTask } from '~/data/putAwayTasks'
import { getPutAwayLineItems } from '~/data/putAwayTaskDetails'
import { getWarehouseDetail, binForSku } from '~/data/warehouseDetails'

const WH = 'wh-006', WH_NAME = 'Gudang Makassar Selatan'
const PLAIN = '3004', P_PLAIN = 'p23'  // Coffee Scale — plain
const BATCH = '1001', P_BATCH = 'p01'  // Green Beans — batch-tracked

const stockOf = (sku: string) => getWarehouseDetail(WH)!.stock.find((s) => s.sku === sku)!
const rStatus = (id: string) => receipts.find((r) => r.id === id)!.status
function receiptFor(tag: string, productId: string, qty: number) {
  return addReceipt({
    purchaseNo: `PO-MOP-${tag}`, warehouseId: WH, warehouseName: WH_NAME,
    skuQty: 1, purchaseQty: qty, receivedQty: 0, status: 'pending',
    estimatedArrival: '2026-08-01', trackingNos: [], lineItems: [{ productId, qty }],
  })
}

describe('Inbound multi-order + partial — bundled into one put-away', () => {
  it('plain SKU: order A full + order B short → merged put-away = received sum, statuses diverge, on-hand posts only received', () => {
    const rA = receiptFor('PLAIN-A', P_PLAIN, 4)
    const rB = receiptFor('PLAIN-B', P_PLAIN, 4)
    const base = stockOf(PLAIN).onHand

    const rtA = createReceivingTask({ receiptId: rA.id, assignee: 'Op A', skus: [PLAIN] })!
    const rtB = createReceivingTask({ receiptId: rB.id, assignee: 'Op B', skus: [PLAIN] })!
    startReceiving(rtA.id); startReceiving(rtB.id)
    endReceiving(rtA.id, { [PLAIN]: 4 }) // full
    endReceiving(rtB.id, { [PLAIN]: 2 }) // short → partial

    // Bundle BOTH orders' receiving tasks into ONE put-away.
    const pa = addPutAwayTask({
      receivingTaskIds: [rtA.id, rtB.id], receivingTaskNos: [rtA.taskNo, rtB.taskNo],
      warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op',
    })

    // Merged row = sum of RECEIVED (4 + 2 = 6), NOT expected (4 + 4 = 8).
    const rows = getPutAwayLineItems(pa.id).filter((r) => r.skuCode === PLAIN)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.qty).toBe(6)

    startPutAway(pa.id)
    endPutAway(pa.id, [{ skuCode: PLAIN, qty: 6, binLocation: binForSku(WH, PLAIN) }], {})
    expect(getPutAwayTask(pa.id)!.status).toBe('completed')

    // On-hand posts exactly what was received across both orders.
    expect(stockOf(PLAIN).onHand).toBe(base + 6)

    // Both orders' goods committed by the shared put-away.
    expect(getReceivingTask(rtA.id)!.stockCommitted).toBe(true)
    expect(getReceivingTask(rtB.id)!.stockCommitted).toBe(true)

    // Status divergence: A fully received + committed → Completed; B short + committed → Partial reception.
    expect(rStatus(rA.id)).toBe('completed')
    expect(rStatus(rB.id)).toBe('partial reception')
  })

  it('batch SKU: order A full + order B short → one merged put-away row, two distinct lots, on-hand = received sum', () => {
    const rA = receiptFor('BATCH-A', P_BATCH, 5)
    const rB = receiptFor('BATCH-B', P_BATCH, 5)
    const base = stockOf(BATCH).onHand

    const rtA = createReceivingTask({ receiptId: rA.id, assignee: 'Op A', skus: [BATCH] })!
    const rtB = createReceivingTask({ receiptId: rB.id, assignee: 'Op B', skus: [BATCH] })!
    startReceiving(rtA.id); startReceiving(rtB.id)
    endReceiving(rtA.id, { [BATCH]: 5 }, { [BATCH]: { batchLines: [{ batchNo: 'MOP-LOT-A', expiryDate: '2027-01-01', desc: 'lot A', qty: 5, unit: 'Sack' }] } }) // full
    endReceiving(rtB.id, { [BATCH]: 3 }, { [BATCH]: { batchLines: [{ batchNo: 'MOP-LOT-B', expiryDate: '2027-02-01', desc: 'lot B', qty: 3, unit: 'Sack' }] } }) // short

    const pa = addPutAwayTask({
      receivingTaskIds: [rtA.id, rtB.id], receivingTaskNos: [rtA.taskNo, rtB.taskNo],
      warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op',
    })

    const rows = getPutAwayLineItems(pa.id).filter((r) => r.skuCode === BATCH)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.qty).toBe(8) // 5 + 3 received

    startPutAway(pa.id)
    endPutAway(pa.id, [{ skuCode: BATCH, qty: 8, binLocation: binForSku(WH, BATCH) }], {
      batchAssignments: { [BATCH]: [
        { batchNo: 'MOP-LOT-A', expiryDate: '2027-01-01', desc: 'lot A', qty: 5, unit: 'Sack' },
        { batchNo: 'MOP-LOT-B', expiryDate: '2027-02-01', desc: 'lot B', qty: 3, unit: 'Sack' },
      ] },
    })
    expect(getPutAwayTask(pa.id)!.status).toBe('completed')

    const s = stockOf(BATCH)
    expect(s.onHand).toBe(base + 8)
    // Two distinct lots, each worth its received qty — never merged into one.
    expect(s.batches!.find((b) => b.batchNo === 'MOP-LOT-A')!.onHand).toBe(5)
    expect(s.batches!.find((b) => b.batchNo === 'MOP-LOT-B')!.onHand).toBe(3)

    expect(rStatus(rA.id)).toBe('completed')          // full order
    expect(rStatus(rB.id)).toBe('partial reception')  // short order
  })

  it('put-away away exactly one order-worth still leaves the short order accountable (received > put-away is a no-op here — merged qty drives it)', () => {
    // Sanity: the merged put-away qty equals received (not expected), so there is no
    // phantom "expected but never received" unit dragged into the put-away.
    const rA = receiptFor('SANITY-A', P_PLAIN, 6)
    const rB = receiptFor('SANITY-B', P_PLAIN, 6)
    const rtA = createReceivingTask({ receiptId: rA.id, assignee: 'Op A', skus: [PLAIN] })!
    const rtB = createReceivingTask({ receiptId: rB.id, assignee: 'Op B', skus: [PLAIN] })!
    startReceiving(rtA.id); startReceiving(rtB.id)
    endReceiving(rtA.id, { [PLAIN]: 6 }) // full
    endReceiving(rtB.id, { [PLAIN]: 1 }) // very short
    const pa = addPutAwayTask({
      receivingTaskIds: [rtA.id, rtB.id], receivingTaskNos: [rtA.taskNo, rtB.taskNo],
      warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op',
    })
    const rows = getPutAwayLineItems(pa.id).filter((r) => r.skuCode === PLAIN)
    expect(rows[0]!.qty).toBe(7) // 6 + 1, not 12
  })
})
