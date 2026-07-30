/**
 * Stock-adjustment STOCK EFFECT (complements stock-adjustment-cancel.spec.ts,
 * which only covered the cancel/unsaved guards — never the actual stock change).
 *
 * 1. A WMS Stock In/Out (addWmsAdjustment kind:'in-out') applies its per-line
 *    delta to on-hand IMMEDIATELY: a +line raises on-hand, a −line lowers it.
 * 2. A Cycle Count (startWmsCount → saveWmsCountDraft → finishWmsCount) does NOT
 *    touch stock — it only moves the task to "counted" (awaiting approval). Only
 *    approveWmsAdjustment() runs applyStockCount (ABSOLUTE set) and completes it.
 *
 * All mutations are measured as deltas via onHandForSku and INVERTED afterwards
 * (applyStockInOut / applyStockCount back to the captured value) so the shared,
 * persisted overlay is left exactly as found.
 */
import { describe, it, expect } from 'vitest'
import {
  addWmsAdjustment, startWmsCount, saveWmsCountDraft, finishWmsCount,
  approveWmsAdjustment, getWmsAdjustment,
} from '~/data/wmsStockAdjustments'
import { getWarehouseDetail, onHandForSku, applyStockInOut, applyStockCount } from '~/data/warehouseDetails'
import { warehouses } from '~/data/warehouses'

const WH_ID = 'wh-001'
const nameOf = (id: string) => warehouses.find((w) => w.id === id)?.name ?? id

/** A plain (no batch, no serial) SKU with at least `minAvail` available. */
function pickPlainSku(warehouseId: string, minAvail: number): string {
  const item = (getWarehouseDetail(warehouseId)?.stock ?? []).find(
    (s) => !s.batches && !s.serials && s.available >= minAvail,
  )
  if (!item) throw new Error(`no suitable plain SKU in ${warehouseId}`)
  return item.sku
}

describe('WMS Stock In/Out — applies its delta to on-hand immediately', () => {
  it('a positive line raises on-hand and a negative line lowers it', () => {
    const sku = pickPlainSku(WH_ID, 3)
    const before = onHandForSku(WH_ID, sku)

    // +line
    addWmsAdjustment({
      kind: 'in-out', date: '2026-07-01', warehouseId: WH_ID, warehouseName: nameOf(WH_ID),
      category: 'General', tags: [], lines: [{ sku, qty: 4 }],
    })
    expect(onHandForSku(WH_ID, sku)).toBe(before + 4)

    // −line (on top of the +4)
    addWmsAdjustment({
      kind: 'in-out', date: '2026-07-01', warehouseId: WH_ID, warehouseName: nameOf(WH_ID),
      category: 'General', tags: [], lines: [{ sku, qty: -3 }],
    })
    expect(onHandForSku(WH_ID, sku)).toBe(before + 1)

    // ── Invert: net effect was +1, so undo it ──
    applyStockInOut(WH_ID, [{ sku, qty: -1 }])
    expect(onHandForSku(WH_ID, sku)).toBe(before)
  })
})

describe('WMS Cycle Count — stock only changes at approval, not at finish', () => {
  it('finishWmsCount leaves stock unchanged; approveWmsAdjustment absolute-sets it', () => {
    const sku = pickPlainSku(WH_ID, 1)
    const before = onHandForSku(WH_ID, sku)
    const target = before + 5 // count is an ABSOLUTE set, chosen distinct from current

    // Create the count task (no stock effect on creation for kind:'count').
    const a = addWmsAdjustment({
      kind: 'count', date: '2026-07-01', warehouseId: WH_ID, warehouseName: nameOf(WH_ID),
      category: 'Stock count', tags: [], lines: [{ sku, qty: target }],
    })
    expect(a.status).toBe('not_started')
    expect(onHandForSku(WH_ID, sku)).toBe(before) // creation didn't move stock

    startWmsCount(a.id)
    expect(getWmsAdjustment(a.id)!.status).toBe('in_progress')
    saveWmsCountDraft(a.id, [{ sku, qty: target }])
    expect(onHandForSku(WH_ID, sku)).toBe(before) // saving a draft didn't move stock

    finishWmsCount(a.id, [{ sku, qty: target }])
    expect(getWmsAdjustment(a.id)!.status).toBe('counted')
    expect(onHandForSku(WH_ID, sku)).toBe(before) // finishing (awaiting approval) still no stock change

    approveWmsAdjustment(a.id)
    expect(getWmsAdjustment(a.id)!.status).toBe('completed')
    expect(onHandForSku(WH_ID, sku)).toBe(target) // approval APPLIED the count (absolute)

    // ── Invert: restore on-hand to the captured pre-count value ──
    applyStockCount(WH_ID, [{ sku, qty: before }])
    expect(onHandForSku(WH_ID, sku)).toBe(before)
  })
})
