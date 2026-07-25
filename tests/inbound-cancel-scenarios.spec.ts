/**
 * Inbound PO-cancel scenario matrix (from the Notion "Scenario" page), validated against
 * WMS PRD 1.1 C1 AC#5/AC#6/AC#7. Three tables:
 *   1. Single order → single put-away
 *   2. Single order → multiple receivings merged into one put-away
 *   3. Multiple orders → receivings merged into one SHARED put-away
 * All warehouses here have put-away ENABLED (wh-001). Cancel is triggered while no stock
 * is on-hand (posting guard: once a put-away completes, the PO can't be cancelled).
 */
import { describe, it, expect } from 'vitest'
import { addReceipt, type Receipt } from '~/data/receipts'
import {
  addReceivingTask, startReceiving, endReceiving, getReceivingTask, acknowledgeCanceledReceipt,
} from '~/data/receivingTasks'
import {
  addPutAwayTask, startPutAway, endPutAway, getPutAwayTask, acknowledgeCanceledPutAway,
} from '~/data/putAwayTasks'
import { cancelInboundReceipt } from '~/data/inboundSync'
import '~/data/warehouseDetails'

const WH = 'wh-001', WHN = 'Gudang Jakarta Pusat'
const SKU = { productId: 'p20', sku: '3001' } // plain SKU
const SKU_B = { productId: 'p21', sku: '3002' } // second plain SKU (for 2 concurrent receiving tasks)
let seq = 0
function receipt(qty = 10): Receipt {
  seq++
  return addReceipt({
    purchaseNo: `SCN PO ${seq}`, warehouseId: WH, warehouseName: WHN,
    skuQty: 1, purchaseQty: qty, receivedQty: 0, status: 'open',
    estimatedArrival: '2026-08-01', trackingNos: [], lineItems: [{ productId: SKU.productId, qty }],
  })
}
/** Two-SKU receipt, so two receiving tasks (one per SKU) can be Open at the same time. */
function receipt2(): Receipt {
  seq++
  return addReceipt({
    purchaseNo: `SCN PO ${seq}`, warehouseId: WH, warehouseName: WHN,
    skuQty: 2, purchaseQty: 20, receivedQty: 0, status: 'open',
    estimatedArrival: '2026-08-01', trackingNos: [],
    lineItems: [{ productId: SKU.productId, qty: 10 }, { productId: SKU_B.productId, qty: 10 }],
  })
}
function rec(receiptId: string) { return addReceivingTask({ receiptId, assignee: 'Op' })! }
function recSku(receiptId: string, sku: string) { return addReceivingTask({ receiptId, assignee: 'Op', skus: [sku] })! }
/** Receive `qty` on a fresh receiving task → status "pending put-away". */
function received(receiptId: string, qty: number) {
  const t = rec(receiptId); startReceiving(t.id); endReceiving(t.id, { [SKU.sku]: qty }); return t
}
function putAway(recTasks: { id: string; taskNo: string }[]) {
  return addPutAwayTask({
    receivingTaskIds: recTasks.map((t) => t.id), receivingTaskNos: recTasks.map((t) => t.taskNo),
    warehouseId: WH, warehouseName: WHN, assignee: 'Op',
  })
}
const rStatus = (id: string) => getReceivingTask(id)!.status
const pStatus = (id: string) => getPutAwayTask(id)!.status

// ─── Table 1 — single order → single put-away ────────────────────────────────
describe('Scenario T1 — single order, single put-away', () => {
  it('T1.1 receiving Open → Canceled', () => {
    const r = receipt(); const t = rec(r.id)
    expect(cancelInboundReceipt(r.id).ok).toBe(true)
    expect(rStatus(t.id)).toBe('canceled')
  })

  it('T1.2 receiving In progress → Ack → Canceled', () => {
    const r = receipt(); const t = rec(r.id); startReceiving(t.id)
    cancelInboundReceipt(r.id)
    expect(getReceivingTask(t.id)!.needsCancelAck).toBe(true)
    acknowledgeCanceledReceipt(t.id)
    expect(rStatus(t.id)).toBe('canceled')
  })

  it('T1.3 receiving Pending put-away (no put-away) → stays Completed (received work kept)', () => {
    const r = receipt(); const t = received(r.id, 10)
    expect(rStatus(t.id)).toBe('pending put-away')
    expect(cancelInboundReceipt(r.id).ok).toBe(true)
    expect(rStatus(t.id)).toBe('completed') // received → stays Completed; no put-away runs
    expect(getReceivingTask(t.id)!.putAwayTaskId).toBeUndefined()
  })

  it('T1.4 receiving Completed + put-away Open → receiving stays Completed, put-away Canceled', () => {
    const r = receipt(); const t = received(r.id, 10); const pa = putAway([t])
    expect(rStatus(t.id)).toBe('completed')
    cancelInboundReceipt(r.id)
    expect(rStatus(t.id)).toBe('completed')
    expect(pStatus(pa.id)).toBe('canceled')
  })

  it('T1.5 receiving Completed + put-away In progress → receiving Completed, put-away Ack → Canceled', () => {
    const r = receipt(); const t = received(r.id, 10); const pa = putAway([t]); startPutAway(pa.id)
    cancelInboundReceipt(r.id)
    expect(getPutAwayTask(pa.id)!.needsCancelAck).toBe(true)
    acknowledgeCanceledPutAway(pa.id)
    expect(pStatus(pa.id)).toBe('canceled')
    expect(rStatus(t.id)).toBe('completed')
  })

  it('T1.6 happy path — receiving + put-away Completed → order Completed', () => {
    const r = receipt(); const t = received(r.id, 10); const pa = putAway([t])
    startPutAway(pa.id); endPutAway(pa.id, [{ skuCode: SKU.sku, qty: 10, binLocation: 'A-01-01' }])
    expect(pStatus(pa.id)).toBe('completed')
    expect(r.status).toBe('completed')
  })

  it('T1.7 partial received + Pending put-away → stays Completed (task-level; partial-ness is order-level)', () => {
    const r = receipt(); const t = received(r.id, 4) // short
    expect(rStatus(t.id)).toBe('pending put-away')
    cancelInboundReceipt(r.id)
    expect(rStatus(t.id)).toBe('completed')
    expect(getReceivingTask(t.id)!.items.reduce((s2, it) => s2 + it.receivedQty, 0)).toBe(4) // receivedQty kept
  })

  it('T1.8 partial received + Completed + put-away Open → receiving Completed, put-away Canceled', () => {
    const r = receipt(); const t = received(r.id, 4); const pa = putAway([t])
    cancelInboundReceipt(r.id)
    expect(rStatus(t.id)).toBe('completed')
    expect(pStatus(pa.id)).toBe('canceled')
  })

  it('T1.9 partial received + Completed + put-away In progress → Ack → Canceled, receiving Completed', () => {
    const r = receipt(); const t = received(r.id, 4); const pa = putAway([t]); startPutAway(pa.id)
    cancelInboundReceipt(r.id)
    expect(getPutAwayTask(pa.id)!.needsCancelAck).toBe(true)
    acknowledgeCanceledPutAway(pa.id)
    expect(pStatus(pa.id)).toBe('canceled')
    expect(rStatus(t.id)).toBe('completed')
  })

  it('T1.10 partial received + put-away Completed → order Partial reception (happy)', () => {
    const r = receipt(); const t = received(r.id, 4); const pa = putAway([t])
    startPutAway(pa.id); endPutAway(pa.id, [{ skuCode: SKU.sku, qty: 4, binLocation: 'A-01-01' }])
    expect(pStatus(pa.id)).toBe('completed')
    expect(r.status).toBe('partial reception')
  })
})

// ─── Table 2 — single order, multiple receivings → one put-away ──────────────
describe('Scenario T2 — single order, multiple receivings, one put-away', () => {
  it('T2.1 Rec A/B Open → both Canceled', () => {
    const r = receipt2(); const a = recSku(r.id, SKU.sku); const b = recSku(r.id, SKU_B.sku)
    expect(a.status).toBe('open'); expect(b.status).toBe('open')
    cancelInboundReceipt(r.id)
    expect(rStatus(a.id)).toBe('canceled'); expect(rStatus(b.id)).toBe('canceled')
  })

  it('T2.2 Rec A Completed, Rec B Open, put-away Open → A Completed, B Canceled, put-away Canceled', () => {
    const r = receipt(20); const a = received(r.id, 10); const pa = putAway([a]); const b = rec(r.id)
    cancelInboundReceipt(r.id)
    expect(rStatus(a.id)).toBe('completed'); expect(rStatus(b.id)).toBe('canceled')
    expect(pStatus(pa.id)).toBe('canceled')
  })

  it('T2.3 Rec A Completed, Rec B In progress, put-away Open → A Completed, B Ack→Canceled, put-away Canceled', () => {
    const r = receipt(20); const a = received(r.id, 10); const pa = putAway([a])
    const b = rec(r.id); startReceiving(b.id)
    cancelInboundReceipt(r.id)
    acknowledgeCanceledReceipt(b.id)
    expect(rStatus(a.id)).toBe('completed'); expect(rStatus(b.id)).toBe('canceled')
    expect(pStatus(pa.id)).toBe('canceled')
  })

  it('T2.4 Rec A Completed, Rec B Pending put-away, put-away Open → A Completed, B stays Completed, put-away Canceled', () => {
    const r = receipt(20); const a = received(r.id, 10); const pa = putAway([a])
    const b = received(r.id, 10)
    expect(rStatus(b.id)).toBe('pending put-away')
    cancelInboundReceipt(r.id)
    expect(rStatus(a.id)).toBe('completed'); expect(rStatus(b.id)).toBe('completed') // B received → stays Completed
    expect(pStatus(pa.id)).toBe('canceled')
  })

  it('T2.5 Rec A/B Completed, put-away Open → both Completed, put-away Canceled', () => {
    const r = receipt(20); const a = received(r.id, 10); const b = received(r.id, 10); const pa = putAway([a, b])
    cancelInboundReceipt(r.id)
    expect(rStatus(a.id)).toBe('completed'); expect(rStatus(b.id)).toBe('completed')
    expect(pStatus(pa.id)).toBe('canceled')
  })

  it('T2.6 Rec A/B Completed, put-away In progress → Ack → Canceled', () => {
    const r = receipt(20); const a = received(r.id, 10); const b = received(r.id, 10); const pa = putAway([a, b]); startPutAway(pa.id)
    cancelInboundReceipt(r.id)
    expect(getPutAwayTask(pa.id)!.needsCancelAck).toBe(true)
    acknowledgeCanceledPutAway(pa.id)
    expect(pStatus(pa.id)).toBe('canceled')
    expect(rStatus(a.id)).toBe('completed'); expect(rStatus(b.id)).toBe('completed')
  })

  it('T2.7 happy path — all Completed', () => {
    const r = receipt(20); const a = received(r.id, 10); const b = received(r.id, 10); const pa = putAway([a, b])
    startPutAway(pa.id); endPutAway(pa.id, [{ skuCode: SKU.sku, qty: 20, binLocation: 'A-01-01' }])
    expect(pStatus(pa.id)).toBe('completed'); expect(r.status).toBe('completed')
  })
})

// ─── Table 3 — multiple orders → one SHARED put-away ─────────────────────────
describe('Scenario T3 — multiple orders, one shared put-away', () => {
  it('T3.1 both POs canceled before progress → both receivings Canceled', () => {
    const rA = receipt(); const rB = receipt(); const a = rec(rA.id); const b = rec(rB.id)
    cancelInboundReceipt(rA.id); cancelInboundReceipt(rB.id)
    expect(rStatus(a.id)).toBe('canceled'); expect(rStatus(b.id)).toBe('canceled')
  })

  it('T3.2 only Order A canceled (Rec A Open), shared put-away Open → put-away stays open for B', () => {
    // Put-away seeded from B's completed receiving; A is a separate open receiving on the same task later.
    const rA = receipt(); const rB = receipt()
    const b = received(rB.id, 10); const pa = putAway([b]) // put-away holds B
    const a = rec(rA.id) // A still open, not in the put-away
    cancelInboundReceipt(rA.id)
    expect(rStatus(a.id)).toBe('canceled') // A's own open receiving canceled
    expect(pStatus(pa.id)).toBe('open') // B's put-away untouched
    expect(getReceivingTask(b.id)!.status).toBe('completed')
  })

  it('T3.3 Order A canceled, both Rec Completed, shared put-away Open → stays Open for B, needs ack, A removed', () => {
    const rA = receipt(); const rB = receipt()
    const a = received(rA.id, 10); const b = received(rB.id, 10)
    const pa = putAway([a, b]) // SHARED across A + B
    cancelInboundReceipt(rA.id)
    const paAfter = getPutAwayTask(pa.id)!
    expect(paAfter.status).toBe('open') // NOT canceled — B is still live
    expect(paAfter.needsCancelAck).toBe(true) // banner to acknowledge A's removal
    expect(paAfter.receivingTaskIds).not.toContain(a.id) // A's line removed
    expect(paAfter.receivingTaskIds).toContain(b.id) // B stays
    expect(getReceivingTask(b.id)!.status).toBe('completed') // B untouched
  })

  it('T3.4 both POs canceled, shared put-away Open → put-away Canceled', () => {
    const rA = receipt(); const rB = receipt()
    const a = received(rA.id, 10); const b = received(rB.id, 10); const pa = putAway([a, b])
    cancelInboundReceipt(rA.id); cancelInboundReceipt(rB.id)
    expect(pStatus(pa.id)).toBe('canceled') // no order left
  })

  it('T3.5 both POs canceled, shared put-away In progress → Ack → Canceled', () => {
    const rA = receipt(); const rB = receipt()
    const a = received(rA.id, 10); const b = received(rB.id, 10); const pa = putAway([a, b]); startPutAway(pa.id)
    cancelInboundReceipt(rA.id); cancelInboundReceipt(rB.id)
    expect(getPutAwayTask(pa.id)!.needsCancelAck).toBe(true)
    acknowledgeCanceledPutAway(pa.id)
    expect(pStatus(pa.id)).toBe('canceled')
  })

  it('T3.6 Order A canceled, shared put-away In progress → Ack → partial (A removed), stays for B', () => {
    const rA = receipt(); const rB = receipt()
    const a = received(rA.id, 10); const b = received(rB.id, 10); const pa = putAway([a, b]); startPutAway(pa.id)
    cancelInboundReceipt(rA.id)
    expect(getPutAwayTask(pa.id)!.needsCancelAck).toBe(true)
    acknowledgeCanceledPutAway(pa.id)
    const paAfter = getPutAwayTask(pa.id)!
    expect(paAfter.status).toBe('in progress') // NOT canceled — B still live
    expect(paAfter.receivingTaskIds).not.toContain(a.id) // A removed
    expect(paAfter.receivingTaskIds).toContain(b.id) // B stays
    expect(getReceivingTask(b.id)!.status).toBe('completed')
  })

  it('T3.7 happy path — both orders put away → Completed', () => {
    const rA = receipt(); const rB = receipt()
    const a = received(rA.id, 10); const b = received(rB.id, 10); const pa = putAway([a, b])
    startPutAway(pa.id); endPutAway(pa.id, [{ skuCode: SKU.sku, qty: 20, binLocation: 'A-01-01' }])
    expect(pStatus(pa.id)).toBe('completed')
    expect(rA.status).toBe('completed'); expect(rB.status).toBe('completed')
  })
})
