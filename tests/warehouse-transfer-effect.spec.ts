/**
 * Warehouse-transfer STOCK EFFECT (complements warehouse-transfer-cancel.spec.ts,
 * which only covered the cancel guard — never the actual movement).
 *
 * A valid approveTransfer() runs applyTransfer(), which MOVES stock: the origin's
 * on-hand/available fall by the line qty and the destination's rise by the same.
 * We measure the DELTA we cause on a plain (non batch/serial-tracked) SKU that
 * both warehouses stock, then INVERT it (applyStockInOut) so this spec leaves the
 * shared, persisted overlay exactly as it found it and never pollutes other specs.
 *
 * Also re-locks (minimally, purely) that a transfer is only ever cancelable while
 * still a draft — mirrors warehouse-transfer-cancel.spec.ts but stays distinct.
 */
import { describe, it, expect } from 'vitest'
import { addTransfer, approveTransfer, canCancelTransfer, cancelTransfer, getTransfer } from '~/data/warehouseTransfers'
import { getWarehouseDetail, availableForSku, onHandForSku, applyStockInOut } from '~/data/warehouseDetails'
import { warehouses } from '~/data/warehouses'

const nameOf = (id: string) => warehouses.find((w) => w.id === id)?.name ?? id

/** A plain (no batch, no serial) SKU with allocatable stock at origin that the
 *  destination also stocks — so both sides' deltas are observable. */
function pickPlainSku(originId: string, destId: string, minAvail: number): string {
  const dSkus = new Set((getWarehouseDetail(destId)?.stock ?? []).map((s) => s.sku))
  const item = (getWarehouseDetail(originId)?.stock ?? []).find(
    (s) => !s.batches && !s.serials && s.available >= minAvail && dSkus.has(s.sku),
  )
  if (!item) throw new Error(`no suitable plain SKU in ${originId}→${destId}`)
  return item.sku
}

describe('Warehouse transfer — approval MOVES stock (origin −qty, destination +qty)', () => {
  it('approveTransfer decreases origin available/on-hand and increases destination by the line qty', () => {
    const originId = 'wh-001'
    const destId = 'wh-006'
    const qty = 1
    const sku = pickPlainSku(originId, destId, qty)

    const oAvailBefore = availableForSku(originId, sku)
    const oOnHandBefore = onHandForSku(originId, sku)
    const dAvailBefore = availableForSku(destId, sku)
    const dOnHandBefore = onHandForSku(destId, sku)

    const t = addTransfer({
      date: '2026-07-01',
      originId, originName: nameOf(originId),
      destinationId: destId, destinationName: nameOf(destId),
      tags: [],
      lines: [{ sku, qty }],
    })
    const approved = approveTransfer(t.id)
    expect(approved).toBeTruthy()
    expect(approved!.status).toBe('approved')

    // Origin lost exactly `qty`; destination gained exactly `qty`.
    expect(onHandForSku(originId, sku)).toBe(oOnHandBefore - qty)
    expect(availableForSku(originId, sku)).toBe(oAvailBefore - qty)
    expect(onHandForSku(destId, sku)).toBe(dOnHandBefore + qty)
    expect(availableForSku(destId, sku)).toBe(dAvailBefore + qty)

    // ── Invert the movement so the shared overlay is left untouched ──
    applyStockInOut(originId, [{ sku, qty: +qty }])
    applyStockInOut(destId, [{ sku, qty: -qty }])
    expect(onHandForSku(originId, sku)).toBe(oOnHandBefore)
    expect(availableForSku(originId, sku)).toBe(oAvailBefore)
    expect(onHandForSku(destId, sku)).toBe(dOnHandBefore)
    expect(availableForSku(destId, sku)).toBe(dAvailBefore)
  })
})

describe('Warehouse transfer — cancel only while draft (regression lock)', () => {
  it('canCancelTransfer is true for draft, false for every terminal/post-move status', () => {
    const t = addTransfer({
      date: '2026-07-01',
      originId: 'wh-001', originName: nameOf('wh-001'),
      destinationId: 'wh-006', destinationName: nameOf('wh-006'),
      tags: [], lines: [{ sku: '3001', qty: 1 }],
    })
    // Pure status checks — no stock is moved, so nothing to invert.
    expect(canCancelTransfer(t)).toBe(true)
    expect(canCancelTransfer({ ...t, status: 'approved' })).toBe(false)
    expect(canCancelTransfer({ ...t, status: 'in transit' })).toBe(false)
    expect(canCancelTransfer({ ...t, status: 'completed' })).toBe(false)
    expect(canCancelTransfer({ ...t, status: 'canceled' })).toBe(false)

    // Canceling a draft never applies stock — the record is kept, not deleted.
    cancelTransfer(t.id, 'Regression lock')
    const after = getTransfer(t.id)
    expect(after!.status).toBe('canceled')
    expect(after!.canceledReason).toBe('Regression lock')
  })
})
