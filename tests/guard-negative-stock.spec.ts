/**
 * Integrity guard — negative-stock helper (stockOutViolation).
 *
 * `applyStockInOut` silently clamps stock at 0, which hides over-decrements.
 * Callers that must REJECT rather than swallow them check `stockOutViolation`
 * first: it inspects only the negative ("out") lines and returns the first
 * offending SKU when an out-quantity exceeds on-hand OR exceeds available
 * (eating into reserved stock), else null. The returned object carries
 * {sku, requested, onHand, available}.
 */
import { describe, it, expect } from 'vitest'
import { stockOutViolation, getWarehouseDetail } from '~/data/warehouseDetails'

const WH = 'wh-001'

/** A plain SKU stocked in WH (non batch / non serial-tracked). */
function plainItem() {
  return getWarehouseDetail(WH)!.stock.find(
    (s) => !s.batches && !s.serials && s.available >= 1,
  )!
}
/** A SKU whose reserved > 0, so available < on-hand. */
function reservedItem() {
  return getWarehouseDetail(WH)!.stock.find((s) => s.reserved > 0 && s.available >= 0)!
}

describe('Integrity guard — stockOutViolation', () => {
  it('returns null when there are no out-lines (positive-only)', () => {
    const item = plainItem()
    expect(stockOutViolation(WH, [{ sku: item.sku, qty: 5 }])).toBeNull()
  })

  it('returns null when an out-line stays within available', () => {
    const item = plainItem()
    // Removing exactly `available` is safe (not > available, not > onHand).
    expect(stockOutViolation(WH, [{ sku: item.sku, qty: -item.available }])).toBeNull()
  })

  it('flags an out-line that exceeds on-hand', () => {
    const item = plainItem()
    const out = item.onHand + 1
    const v = stockOutViolation(WH, [{ sku: item.sku, qty: -out }])
    expect(v).not.toBeNull()
    expect(v).toEqual({
      sku: item.sku,
      requested: out,
      onHand: item.onHand,
      available: item.available,
    })
  })

  it('flags an out-line that exceeds available but not on-hand (eats into reserved)', () => {
    const item = reservedItem()
    expect(item.reserved).toBeGreaterThan(0)
    const out = item.available + 1 // > available, still ≤ onHand
    expect(out).toBeLessThanOrEqual(item.onHand)

    const v = stockOutViolation(WH, [{ sku: item.sku, qty: -out }])
    expect(v).not.toBeNull()
    expect(v).toEqual({
      sku: item.sku,
      requested: out,
      onHand: item.onHand,
      available: item.available,
    })
  })
})
