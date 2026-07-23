/**
 * PRD C2 AC#4 — Edit a PO's line items, adapted to this app's receiving-task
 * model. Unlike Outbound's D7 (which juggles stock reservations across
 * pending picking tasks), Inbound receiving never reserves stock, so there's
 * no allocatable-stock check — only the receiving-state lock:
 *  - a SKU can be freely added/removed/re-qty'd as long as the new qty
 *    doesn't drop below what's already been PHYSICALLY RECEIVED for it
 *    (lockedReceivingQtyForSku — sum of receivedQty across tasks that are
 *    in progress / pending put-away / completed);
 *  - an "open" (not-yet-started) receiving task locks nothing — its SKUs stay
 *    freely editable, since nothing has been received on it yet;
 *  - dropping below the locked amount rejects the WHOLE edit (SKU_LOCKED) —
 *    no partial apply;
 *  - a completed/cancelled receipt is NOT editable (NOT_EDITABLE).
 *
 * Demo note: the PRD restricts editing to Direct Inbound only (external-source
 * Inbound is read-only, changed only via the A7 API) — this prototype allows
 * editing regardless of source, since there's no real external system here to
 * push changes back.
 */
import { describe, it, expect } from 'vitest'
import { addReceipt, canEditReceipt, receipts, type Receipt } from '~/data/receipts'
import { editInboundReceipt, cancelInboundReceipt } from '~/data/inboundSync'
import { lineItemsForReceipt } from '~/data/receiptLineItems'
import {
  addReceivingTask, startReceiving, endReceiving, getReceivingTask, saveReceivingDraft,
  completeReceivingWithoutPutAway,
} from '~/data/receivingTasks'
import '~/data/warehouseDetails'

const WAREHOUSE_ID = 'wh-001'
const WAREHOUSE_NAME = 'Gudang Jakarta Pusat'
const SKU_A = { productId: 'p20', sku: '3001' } // Milk Frothing Pitcher 600ml
const SKU_B = { productId: 'p21', sku: '3002' } // Tamper 58mm Flat Base

let seq = 0
function makeReceipt(lines: { productId: string; qty: number }[]): Receipt {
  seq++
  return addReceipt({
    purchaseNo: `Test Edit PO ${seq}`,
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
    skuQty: lines.length, purchaseQty: lines.reduce((s, l) => s + l.qty, 0),
    receivedQty: 0, status: 'pending', estimatedArrival: '2026-08-01',
    trackingNos: [], vendor: 'Test Vendor', lineItems: lines,
  })
}
function qtyOf(r: Receipt, productId: string): number {
  return lineItemsForReceipt(r).find((l) => l.productId === productId)?.purchaseQty ?? 0
}

describe('Edit inbound PO — a PENDING receipt (nothing received yet)', () => {
  it('increase/decrease qty applies freely', () => {
    const r = makeReceipt([{ productId: SKU_A.productId, qty: 5 }])
    expect(editInboundReceipt(r.id, [{ productId: SKU_A.productId, qty: 10 }]).ok).toBe(true)
    expect(qtyOf(r, SKU_A.productId)).toBe(10)
    expect(r.purchaseQty).toBe(10)

    expect(editInboundReceipt(r.id, [{ productId: SKU_A.productId, qty: 2 }]).ok).toBe(true)
    expect(qtyOf(r, SKU_A.productId)).toBe(2)
  })

  it('add a new SKU; removing a SKU drops it entirely', () => {
    const r = makeReceipt([{ productId: SKU_A.productId, qty: 5 }])
    expect(editInboundReceipt(r.id, [{ productId: SKU_A.productId, qty: 5 }, { productId: SKU_B.productId, qty: 3 }]).ok).toBe(true)
    expect(r.skuQty).toBe(2)
    expect(qtyOf(r, SKU_B.productId)).toBe(3)

    expect(editInboundReceipt(r.id, [{ productId: SKU_A.productId, qty: 5 }]).ok).toBe(true) // drop B
    expect(r.skuQty).toBe(1)
    expect(qtyOf(r, SKU_B.productId)).toBe(0)
  })

  it('header fields (vendor/estimated arrival/memo/tracking) apply too', () => {
    const r = makeReceipt([{ productId: SKU_A.productId, qty: 5 }])
    const res = editInboundReceipt(r.id, [{ productId: SKU_A.productId, qty: 5 }], {
      vendor: 'New Vendor', estimatedArrival: '2026-09-01', memo: 'Updated memo', trackingNos: ['TRK-1'],
    })
    expect(res.ok).toBe(true)
    expect(r.vendor).toBe('New Vendor')
    expect(r.estimatedArrival).toBe('2026-09-01')
    expect(r.memo).toBe('Updated memo')
    expect(r.trackingNos).toEqual(['TRK-1'])
  })

  it('materializes a seed-style receipt (no real lineItems) on first edit', () => {
    // Simulates seed/demo data — status pending, no lineItems set, so
    // lineItemsForReceipt() falls back to its hash-derived mix.
    seq++
    const r = addReceipt({
      purchaseNo: `Test Edit PO Seedlike ${seq}`,
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
      skuQty: 1, purchaseQty: 5, receivedQty: 0, status: 'pending',
      estimatedArrival: '2026-08-01', trackingNos: [],
    })
    expect(r.lineItems).toBeUndefined() // still hash-derived at this point
    const before = lineItemsForReceipt(r)
    expect(before.length).toBeGreaterThan(0)

    const res = editInboundReceipt(r.id, [{ productId: SKU_A.productId, qty: 7 }])
    expect(res.ok).toBe(true)
    expect(r.lineItems).toEqual([{ productId: SKU_A.productId, qty: 7 }]) // now materialized
    expect(qtyOf(r, SKU_A.productId)).toBe(7)
  })
})

describe('Edit inbound PO — activity log records the actual before → after diff', () => {
  it('logs an "Edited" entry with the qty diff, newest first', () => {
    const r = makeReceipt([{ productId: SKU_A.productId, qty: 5 }])
    expect(r.editHistory ?? []).toHaveLength(0)

    editInboundReceipt(r.id, [{ productId: SKU_A.productId, qty: 9 }])

    expect(r.editHistory).toHaveLength(1)
    const entry = r.editHistory![0]!
    expect(entry.user).toBeTruthy()
    expect(entry.date).toBeTruthy()
    expect(entry.changes.some((c) => c.label.includes(SKU_A.sku) && c.value === '5 → 9')).toBe(true)
  })

  it('logs Added/Removed for SKU add/remove, and header field changes', () => {
    const r = makeReceipt([{ productId: SKU_A.productId, qty: 5 }])

    editInboundReceipt(r.id, [{ productId: SKU_A.productId, qty: 5 }, { productId: SKU_B.productId, qty: 3 }], {
      vendor: 'New Vendor',
    })
    let entry = r.editHistory![0]!
    expect(entry.changes.some((c) => c.label.includes(SKU_B.sku) && c.value === 'Added — qty 3')).toBe(true)
    expect(entry.changes.some((c) => c.label === 'Vendor' && c.value.includes('New Vendor'))).toBe(true)

    editInboundReceipt(r.id, [{ productId: SKU_A.productId, qty: 5 }]) // drop B
    entry = r.editHistory![0]! // newest first
    expect(entry.changes.some((c) => c.label.includes(SKU_B.sku) && c.value.includes('Removed'))).toBe(true)
    expect(r.editHistory).toHaveLength(2) // both edits kept, newest first
  })

  it('a Save with no real changes logs nothing', () => {
    const r = makeReceipt([{ productId: SKU_A.productId, qty: 5 }])
    editInboundReceipt(r.id, [{ productId: SKU_A.productId, qty: 5 }]) // identical
    expect(r.editHistory ?? []).toHaveLength(0)
  })
})

describe('Edit inbound PO — lock vs receiving state (C2 AC#4)', () => {
  it('a SKU with receivedQty on an IN-PROGRESS task cannot be reduced below what was received, or removed', () => {
    const r = makeReceipt([{ productId: SKU_A.productId, qty: 10 }])
    const task = addReceivingTask({ receiptId: r.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    // draft-save some received qty without ending the task (still in progress)
    saveReceivingDraft(task.id, { [SKU_A.sku]: 4 })
    expect(getReceivingTask(task.id)!.status).toBe('in progress')

    // reduce below 4 → rejected
    let res = editInboundReceipt(r.id, [{ productId: SKU_A.productId, qty: 3 }])
    expect(res.ok).toBe(false)
    if (!res.ok) { expect(res.reason).toBe('SKU_LOCKED'); expect(res.locked).toBe(4) }
    expect(qtyOf(r, SKU_A.productId)).toBe(10) // unchanged

    // remove entirely → rejected (same reason)
    res = editInboundReceipt(r.id, [{ productId: SKU_B.productId, qty: 1 }]) // A dropped
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('SKU_LOCKED')

    // increase → allowed
    expect(editInboundReceipt(r.id, [{ productId: SKU_A.productId, qty: 20 }]).ok).toBe(true)
    expect(qtyOf(r, SKU_A.productId)).toBe(20)

    // reduce to exactly the received amount → allowed (not BELOW it)
    expect(editInboundReceipt(r.id, [{ productId: SKU_A.productId, qty: 4 }]).ok).toBe(true)
    expect(qtyOf(r, SKU_A.productId)).toBe(4)
  })

  it('an OPEN (not-yet-started) receiving task does NOT lock — reduce/remove still allowed', () => {
    const r = makeReceipt([{ productId: SKU_A.productId, qty: 10 }])
    addReceivingTask({ receiptId: r.id, assignee: 'Test Operator' })! // open, not started
    expect(editInboundReceipt(r.id, [{ productId: SKU_A.productId, qty: 2 }]).ok).toBe(true)
    expect(qtyOf(r, SKU_A.productId)).toBe(2)
  })

  it('a SKU fully received on a COMPLETED (pending put-away) task locks at its received qty', () => {
    const r = makeReceipt([{ productId: SKU_A.productId, qty: 10 }])
    const task = addReceivingTask({ receiptId: r.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    endReceiving(task.id, { [SKU_A.sku]: 6 }) // short receive — task ends "pending put-away"
    expect(getReceivingTask(task.id)!.status).toBe('pending put-away')

    const res = editInboundReceipt(r.id, [{ productId: SKU_A.productId, qty: 5 }])
    expect(res.ok).toBe(false)
    if (!res.ok) { expect(res.reason).toBe('SKU_LOCKED'); expect(res.locked).toBe(6) }

    expect(editInboundReceipt(r.id, [{ productId: SKU_A.productId, qty: 6 }]).ok).toBe(true)
    expect(qtyOf(r, SKU_A.productId)).toBe(6)
  })
})

describe('Edit inbound PO — not editable once completed or cancelled', () => {
  it('a completed receipt is NOT editable', () => {
    const r = makeReceipt([{ productId: SKU_A.productId, qty: 5 }])
    const task = addReceivingTask({ receiptId: r.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    endReceiving(task.id, { [SKU_A.sku]: 5 }) // full qty
    completeReceivingWithoutPutAway(task.id) // simulate genuinely finished
    expect(r.status).toBe('completed')
    expect(canEditReceipt(r)).toBe(false)

    const res = editInboundReceipt(r.id, [{ productId: SKU_A.productId, qty: 8 }])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('NOT_EDITABLE')
  })

  it('a cancelled receipt is NOT editable', () => {
    const r = makeReceipt([{ productId: SKU_A.productId, qty: 5 }])
    cancelInboundReceipt(r.id)
    expect(r.status).toBe('canceled')
    expect(canEditReceipt(r)).toBe(false)

    const res = editInboundReceipt(r.id, [{ productId: SKU_A.productId, qty: 8 }])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('NOT_EDITABLE')
  })

  it('returns NOT_FOUND for a bogus receipt id', () => {
    const res = editInboundReceipt('rcv-does-not-exist', [{ productId: SKU_A.productId, qty: 1 }])
    expect(res).toEqual({ ok: false, reason: 'NOT_FOUND' })
  })
})

describe('Edit inbound PO — existing receiving tasks are never retroactively touched', () => {
  it("editing the PO's qty does not change an existing OPEN task's own expectedQty snapshot", () => {
    const r = makeReceipt([{ productId: SKU_A.productId, qty: 10 }])
    const task = addReceivingTask({ receiptId: r.id, assignee: 'Test Operator' })!
    expect(getReceivingTask(task.id)!.items.find((i) => i.sku === SKU_A.sku)!.expectedQty).toBe(10)

    expect(editInboundReceipt(r.id, [{ productId: SKU_A.productId, qty: 3 }]).ok).toBe(true)

    // The PO's own qty changed...
    expect(qtyOf(r, SKU_A.productId)).toBe(3)
    // ...but the already-created task's own snapshot is untouched.
    expect(getReceivingTask(task.id)!.items.find((i) => i.sku === SKU_A.sku)!.expectedQty).toBe(10)
  })
})
