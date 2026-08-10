/**
 * Integrity guard — WMS stock in/out (negative lines).
 *
 * A WMS Stock In/Out applies to stock the instant it's created. An "out"
 * (negative) line must not remove more than a SKU's availableForSku (which
 * would drive it negative or eat into reserved stock). `canApplyWmsInOut`
 * returns {ok:false, reason 'STOCK_OUT_EXCEEDS_AVAILABLE'} for such a line, and
 * `addWmsAdjustmentSafe` refuses without mutating stock. A valid out-line, any
 * positive in-line, and any cycle-count adjustment all pass and apply.
 */
import { describe, it, expect } from 'vitest'
import {
  canApplyWmsInOut, addWmsAdjustmentSafe,
} from '~/data/wmsStockAdjustments'
import { onHandForSku, availableForSku, getWarehouseDetail } from '~/data/warehouseDetails'
import { warehouses } from '~/data/warehouses'

const WH = 'wh-001'
const WH_NAME = warehouses.find((w) => w.id === WH)!.name

/** A plain (non batch / non serial-tracked) SKU stocked in WH with headroom. */
function plainSku(): string {
  const item = getWarehouseDetail(WH)!.stock.find(
    (s) => !s.batches && !s.serials && s.available >= 2,
  )!
  return item.sku
}

function inOut(sku: string, qty: number) {
  return {
    kind: 'in-out' as const, date: '2026-07-01',
    warehouseId: WH, warehouseName: WH_NAME,
    category: 'General' as const, tags: [] as string[],
    lines: [{ sku, qty }],
  }
}

describe('Integrity guard — WMS stock in/out (negative lines)', () => {
  it('an out-line removing more than available is refused, stock untouched', () => {
    const sku = plainSku()
    const available = availableForSku(WH, sku)
    const onHandBefore = onHandForSku(WH, sku)

    const check = canApplyWmsInOut(inOut(sku, -(available + 50)))
    expect(check.ok).toBe(false)
    expect(check.ok === false && check.reason).toContain('STOCK_OUT_EXCEEDS_AVAILABLE')

    const res = addWmsAdjustmentSafe(inOut(sku, -(available + 50)))
    expect(res.ok).toBe(false)
    // No mutation happened.
    expect(onHandForSku(WH, sku)).toBe(onHandBefore)
  })

  it('a valid out-line (within available) applies and lowers on-hand', () => {
    const sku = plainSku()
    const onHandBefore = onHandForSku(WH, sku)

    expect(canApplyWmsInOut(inOut(sku, -1)).ok).toBe(true)
    const res = addWmsAdjustmentSafe(inOut(sku, -1))
    expect(res.ok).toBe(true)
    expect(onHandForSku(WH, sku)).toBe(onHandBefore - 1)
  })

  it('a positive in-line is always allowed and raises on-hand', () => {
    const sku = plainSku()
    const onHandBefore = onHandForSku(WH, sku)

    expect(canApplyWmsInOut(inOut(sku, 5)).ok).toBe(true)
    const res = addWmsAdjustmentSafe(inOut(sku, 5))
    expect(res.ok).toBe(true)
    expect(onHandForSku(WH, sku)).toBe(onHandBefore + 5)
  })

  it('a cycle-count adjustment always passes the in/out check (does not mutate here)', () => {
    const sku = plainSku()
    const check = canApplyWmsInOut({
      kind: 'count', warehouseId: WH, lines: [{ sku, qty: -9999 }],
    })
    expect(check.ok).toBe(true)
  })
})
