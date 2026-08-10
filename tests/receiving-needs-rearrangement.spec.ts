/**
 * Inbound analog of D7 AC#8–#10 — touched Open receiving tasks freeze into
 * "Needs Re-arrangement" after a PO qty reduction, blocking Start receiving
 * until acknowledged. Unlike Picking, acknowledge is self-serve (no WH-Manager
 * gate) — mirrors picking-needs-rearrangement.spec.ts.
 */
import { describe, it, expect } from 'vitest'
import { addReceipt, receipts, type Receipt } from '~/data/receipts'
import { editInboundReceipt } from '~/data/inboundSync'
import {
  createReceivingTask, getReceivingTask, isReceivingFrozen, acknowledgeReceivingRearrangement, startReceiving,
} from '~/data/receivingTasks'

const WAREHOUSE_ID = 'wh-001', WAREHOUSE_NAME = 'Gudang Jakarta Pusat'
const SKU_A = { productId: 'p20', sku: '3001' }

let seq = 0
function makeReceipt(lines: { productId: string; qty: number }[]): Receipt {
  seq++
  return addReceipt({
    purchaseNo: `Test Rearr PO ${seq}`,
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
    skuQty: lines.length, purchaseQty: lines.reduce((s, l) => s + l.qty, 0),
    receivedQty: 0, status: 'pending', estimatedArrival: '2026-08-01',
    trackingNos: [], vendor: 'Test Vendor', lineItems: lines,
  })
}
function mkTask(r: Receipt, qty: number) {
  return createReceivingTask({
    receiptId: r.id, assignee: 'Op', skus: [SKU_A.sku],
    targetQtyBySku: { [SKU_A.sku]: qty },
  })!
}

describe('Inbound Needs Re-arrangement — touched Open tasks freeze, untouched ones don\'t', () => {
  it('3/2/5 remove 4: survivor R1 freezes, cancelled R2 doesn\'t matter, untouched R3 stays startable', () => {
    const r = makeReceipt([{ productId: SKU_A.productId, qty: 10 }])
    const r1 = mkTask(r, 3), r2 = mkTask(r, 2), r3 = mkTask(r, 5)
    expect(editInboundReceipt(r.id, [{ productId: SKU_A.productId, qty: 6 }]).ok).toBe(true)

    expect(getReceivingTask(r1.id)!.status).toBe('open')
    expect(isReceivingFrozen(getReceivingTask(r1.id)!)).toBe(true) // survivor (3→1) freezes

    expect(getReceivingTask(r2.id)!.status).toBe('canceled') // emptied → auto-cancelled
    expect(isReceivingFrozen(getReceivingTask(r2.id)!)).toBe(false)

    expect(getReceivingTask(r3.id)!.status).toBe('open')
    expect(isReceivingFrozen(getReceivingTask(r3.id)!)).toBe(false) // never touched → not frozen
  })

  it('single-task direct reduction (AC#1, no allocation step) still freezes the sole task', () => {
    const r = makeReceipt([{ productId: SKU_A.productId, qty: 5 }])
    const t = mkTask(r, 5)
    expect(editInboundReceipt(r.id, [{ productId: SKU_A.productId, qty: 3 }]).ok).toBe(true)
    expect(getReceivingTask(t.id)!.status).toBe('open')
    expect(isReceivingFrozen(getReceivingTask(t.id)!)).toBe(true)
  })

  it('a task emptied entirely by the reduction never freezes (it\'s cancelled, not startable anyway)', () => {
    const r = makeReceipt([{ productId: SKU_A.productId, qty: 5 }])
    const t = mkTask(r, 5)
    expect(editInboundReceipt(r.id, [{ productId: SKU_A.productId, qty: 0 }]).ok).toBe(true)
    const task = getReceivingTask(t.id)!
    expect(task.status).toBe('canceled')
    expect(isReceivingFrozen(task)).toBe(false)
  })
})

describe('Inbound Needs Re-arrangement — self-serve acknowledge', () => {
  it('acknowledgeReceivingRearrangement resets the flag and stamps actor + timestamp; task is startable again', () => {
    const r = makeReceipt([{ productId: SKU_A.productId, qty: 5 }])
    const t = mkTask(r, 5)
    editInboundReceipt(r.id, [{ productId: SKU_A.productId, qty: 3 }])
    expect(isReceivingFrozen(getReceivingTask(t.id)!)).toBe(true)

    acknowledgeReceivingRearrangement(t.id, 'Ayu Lestari')
    const acked = getReceivingTask(t.id)!
    expect(isReceivingFrozen(acked)).toBe(false)
    expect(acked.rearrangementAckBy).toBe('Ayu Lestari')
    expect(acked.rearrangementAckDate).toBeTruthy()
    expect(() => startReceiving(t.id)).not.toThrow()
    expect(getReceivingTask(t.id)!.status).toBe('in progress')
  })

  it('acknowledging an already-unfrozen task is a harmless no-op', () => {
    const r = makeReceipt([{ productId: SKU_A.productId, qty: 5 }])
    const t = mkTask(r, 5)
    acknowledgeReceivingRearrangement(t.id)
    expect(getReceivingTask(t.id)!.rearrangementAckBy).toBeUndefined()
  })
})

describe('Inbound Needs Re-arrangement — View changes before/after snapshot', () => {
  it('records the per-SKU qty-before/qty-after snapshot the "View changes" modal reads, and clears it on acknowledge', () => {
    const r = makeReceipt([{ productId: SKU_A.productId, qty: 5 }])
    const t = mkTask(r, 5)
    editInboundReceipt(r.id, [{ productId: SKU_A.productId, qty: 3 }]) // reduce 2

    const frozen = getReceivingTask(t.id)!
    expect(frozen.rearrangementChanges).toEqual([
      { sku: SKU_A.sku, productName: expect.any(String), qtyBefore: 5, qtyAfter: 3 },
    ])

    acknowledgeReceivingRearrangement(t.id)
    expect(getReceivingTask(t.id)!.rearrangementChanges).toBeUndefined()
  })

  it('a second reduction in the same edit on the same task merges into one snapshot (by SKU)', () => {
    const SKU_B = { productId: 'p21', sku: '3002' }
    const r = makeReceipt([{ productId: SKU_A.productId, qty: 5 }, { productId: SKU_B.productId, qty: 4 }])
    const t = createReceivingTask({ receiptId: r.id, assignee: 'Op', skus: [SKU_A.sku, SKU_B.sku] })!
    editInboundReceipt(r.id, [{ productId: SKU_A.productId, qty: 3 }, { productId: SKU_B.productId, qty: 2 }])

    const frozen = getReceivingTask(t.id)!
    expect(frozen.rearrangementChanges).toHaveLength(2)
    const bySku = Object.fromEntries((frozen.rearrangementChanges ?? []).map((c) => [c.sku, c]))
    expect(bySku[SKU_A.sku]).toMatchObject({ qtyBefore: 5, qtyAfter: 3 })
    expect(bySku[SKU_B.sku]).toMatchObject({ qtyBefore: 4, qtyAfter: 2 })
  })
})

describe('Inbound Needs Re-arrangement — freeze + claim interaction', () => {
  it('freezing only flips the flag — the task\'s remaining items are untouched', () => {
    const r = makeReceipt([{ productId: SKU_A.productId, qty: 10 }])
    const r1 = mkTask(r, 3), r2 = mkTask(r, 2), r3 = mkTask(r, 5)
    editInboundReceipt(r.id, [{ productId: SKU_A.productId, qty: 6 }]) // drains R2 to 0 (cancel), R1 3→1

    const frozen = getReceivingTask(r1.id)!
    expect(isReceivingFrozen(frozen)).toBe(true)
    expect(frozen.items.find((i) => i.sku === SKU_A.sku)?.targetQty).toBe(1)
    expect(getReceivingTask(r2.id)!.items.length).toBe(0)
    expect(getReceivingTask(r3.id)!.items.find((i) => i.sku === SKU_A.sku)?.targetQty).toBe(5)
  })
})
