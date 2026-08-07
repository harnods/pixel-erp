/**
 * Inbound analog of D7 — reducing a PO's SKU qty spread across ≥2 Open
 * receiving tasks. Mirrors outbound-edit-order-allocation.spec.ts, minus the
 * user-override step (read-only proposal — the user only acknowledges).
 */
import { describe, it, expect } from 'vitest'
import { addReceipt, receipts, type Receipt } from '~/data/receipts'
import { editInboundReceipt, proposeReceivingReduction } from '~/data/inboundSync'
import { createReceivingTask, getReceivingTask, startReceiving, saveReceivingDraft } from '~/data/receivingTasks'
import { lineItemsForReceipt } from '~/data/receiptLineItems'

const WAREHOUSE_ID = 'wh-001', WAREHOUSE_NAME = 'Gudang Jakarta Pusat'
const SKU_A = { productId: 'p20', sku: '3001' } // Milk Frothing Pitcher 600ml

let seq = 0
function makeReceipt(lines: { productId: string; qty: number }[]): Receipt {
  seq++
  return addReceipt({
    purchaseNo: `Test Alloc PO ${seq}`,
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
    skuQty: lines.length, purchaseQty: lines.reduce((s, l) => s + l.qty, 0),
    receivedQty: 0, status: 'pending', estimatedArrival: '2026-08-01',
    trackingNos: [], vendor: 'Test Vendor', lineItems: lines,
  })
}
/** An Open receiving task claiming exactly `qty` of SKU_A (via targetQtyBySku). */
function mkTask(r: Receipt, qty: number) {
  return createReceivingTask({
    receiptId: r.id, assignee: 'Op', skus: [SKU_A.sku],
    targetQtyBySku: { [SKU_A.sku]: qty },
  })!
}
function taskQty(taskId: string): number {
  return getReceivingTask(taskId)!.items.find((i) => i.sku === SKU_A.sku)?.targetQty ?? 0
}
function qtyOf(r: Receipt, productId: string): number {
  return lineItemsForReceipt(r).find((l) => l.productId === productId)?.purchaseQty ?? 0
}

describe('Inbound allocation — AC#1 trigger', () => {
  it('single Open task → direct reduction, no allocation step needed', () => {
    const r = makeReceipt([{ productId: SKU_A.productId, qty: 5 }])
    const t = mkTask(r, 5)
    expect(editInboundReceipt(r.id, [{ productId: SKU_A.productId, qty: 3 }]).ok).toBe(true)
    expect(taskQty(t.id)).toBe(3)
    expect(qtyOf(r, SKU_A.productId)).toBe(3)
  })
})

describe('Inbound allocation — default proposal (drain smallest first)', () => {
  it('3/2/5 remove 4 → R2 emptied+cancelled, R1→1, R3 untouched', () => {
    const r = makeReceipt([{ productId: SKU_A.productId, qty: 10 }])
    const r1 = mkTask(r, 3), r2 = mkTask(r, 2), r3 = mkTask(r, 5)

    // proposal preview matches the PRD-style example
    const prop = proposeReceivingReduction(r.id, SKU_A.sku, 4)
    expect(prop.exceedsRemovable).toBe(false)
    const byId = Object.fromEntries(prop.taskReductions.map((t) => [t.taskId, t.reduceBy]))
    expect(byId[r2.id]).toBe(2) // smallest drained first
    expect(byId[r1.id]).toBe(2)
    expect(byId[r3.id]).toBeUndefined() // untouched

    expect(editInboundReceipt(r.id, [{ productId: SKU_A.productId, qty: 6 }]).ok).toBe(true)
    expect(getReceivingTask(r2.id)!.status).toBe('canceled') // emptied → auto-cancel
    expect(taskQty(r1.id)).toBe(1) // 3 → 1
    expect(taskQty(r3.id)).toBe(5) // untouched
    expect(qtyOf(r, SKU_A.productId)).toBe(6)
  })
})

describe('Inbound allocation — removable cap (open vs locked)', () => {
  it('reduction beyond (open + unassigned) is rejected with locked/removable info', () => {
    const r = makeReceipt([{ productId: SKU_A.productId, qty: 10 }])
    mkTask(r, 3) // R1 open = 3
    const started = mkTask(r, 5); startReceiving(started.id); saveReceivingDraft(started.id, { [SKU_A.sku]: 5 }) // 5 locked
    // PO 10, locked 5, open 3, unassigned 2 → removable 5
    const res = editInboundReceipt(r.id, [{ productId: SKU_A.productId, qty: 4 }]) // reduce 6 > removable 5
    expect(res.ok).toBe(false)
    if (!res.ok) { expect(res.reason).toBe('SKU_LOCKED'); expect(res.locked).toBe(5); expect(res.removable).toBe(5) }
    expect(qtyOf(r, SKU_A.productId)).toBe(10) // unchanged
  })

  it('reduction exactly at removable (unassigned first, then open) succeeds; started task untouched', () => {
    const r = makeReceipt([{ productId: SKU_A.productId, qty: 10 }])
    const r1 = mkTask(r, 3)
    const started = mkTask(r, 5); startReceiving(started.id); saveReceivingDraft(started.id, { [SKU_A.sku]: 5 })
    // reduce to 5 → N=5 = removable; drains unassigned 2 + R1 (3→0, cancel)
    expect(editInboundReceipt(r.id, [{ productId: SKU_A.productId, qty: 5 }]).ok).toBe(true)
    expect(getReceivingTask(r1.id)!.status).toBe('canceled')
    expect(taskQty(started.id)).toBe(5) // started task untouched
    expect(qtyOf(r, SKU_A.productId)).toBe(5)
  })
})

describe('Inbound allocation — unassigned qty', () => {
  it('reduces UNASSIGNED (not-on-a-task) qty first, before touching an Open task', () => {
    const r = makeReceipt([{ productId: SKU_A.productId, qty: 10 }])
    const t = mkTask(r, 4) // only 4 claimed; 6 unassigned
    expect(editInboundReceipt(r.id, [{ productId: SKU_A.productId, qty: 3 }]).ok).toBe(true) // reduce 7: 6 unassigned + 1 from task
    expect(taskQty(t.id)).toBe(3) // 4 → 3
    expect(qtyOf(r, SKU_A.productId)).toBe(3)
  })
})
