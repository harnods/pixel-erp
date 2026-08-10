/**
 * WMS PRD 1.1 — Inbound, C1 AC#7: an inbound is "Partially Completed" (app status
 * "partial reception") only once stock is genuinely ON-HAND on a short line — i.e. after
 * a put-away completes (put-away enabled) or at receiving completion (put-away disabled).
 * Before any stock posts, a short receive leaves the PO in "in progress" (still cancelable).
 */
import { describe, it, expect } from 'vitest'
import { addReceipt, type Receipt } from '~/data/receipts'
import { addReceivingTask, startReceiving, endReceiving, getReceivingTask } from '~/data/receivingTasks'
import { addPutAwayTask, startPutAway, endPutAway } from '~/data/putAwayTasks'
import '~/data/warehouseDetails'

const WH_ON = 'wh-001', WH_ON_NAME = 'Gudang Jakarta Pusat' // put-away ENABLED (default)
const SKU = { productId: 'p20', sku: '3001' } // Milk Frothing Pitcher 600ml — plain

let seq = 0
function makeReceipt(whId: string, whName: string, qty: number): Receipt {
  seq++
  return addReceipt({
    purchaseNo: `PR OnHand PO ${seq}`, warehouseId: whId, warehouseName: whName,
    skuQty: 1, purchaseQty: qty, receivedQty: 0, status: 'open',
    estimatedArrival: '2026-08-01', trackingNos: [], lineItems: [{ productId: SKU.productId, qty }],
  })
}

describe('PRD C1 AC#7 — partial reception requires on-hand stock (put-away ENABLED)', () => {
  it('received short with NO put-away yet → "in progress", never "partial reception"', () => {
    const r = makeReceipt(WH_ON, WH_ON_NAME, 10)
    const t = addReceivingTask({ receiptId: r.id, assignee: 'Op', skus: [SKU.sku] })!
    startReceiving(t.id)
    endReceiving(t.id, { [SKU.sku]: 4 }) // short of 10
    expect(getReceivingTask(t.id)!.status).toBe('pending put-away')
    expect(getReceivingTask(t.id)!.stockCommitted).toBeFalsy() // no stock on-hand yet
    expect(r.status).toBe('in progress') // NOT partial reception
  })

  it('flips to "partial reception" only once a put-away completes (stock on-hand) on the short line', () => {
    const r = makeReceipt(WH_ON, WH_ON_NAME, 10)
    const t = addReceivingTask({ receiptId: r.id, assignee: 'Op', skus: [SKU.sku] })!
    startReceiving(t.id)
    endReceiving(t.id, { [SKU.sku]: 4 })
    expect(r.status).toBe('in progress')

    const pa = addPutAwayTask({
      receivingTaskIds: [t.id], receivingTaskNos: [t.taskNo],
      warehouseId: WH_ON, warehouseName: WH_ON_NAME, assignee: 'Op',
    })
    expect(r.status).toBe('in progress') // creating the put-away alone posts no stock
    startPutAway(pa.id)
    endPutAway(pa.id, [{ skuCode: SKU.sku, qty: 4, binLocation: 'A-01-01' }])
    // Now stock is genuinely on-hand and the line is still short (4 of 10) → partial reception.
    expect(getReceivingTask(t.id)!.stockCommitted).toBe(true)
    expect(r.status).toBe('partial reception')
  })
})
