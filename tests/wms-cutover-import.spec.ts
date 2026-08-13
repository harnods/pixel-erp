// @vitest-environment happy-dom
/**
 * WMS→ERP cutover — the product catalogue is the real inventory mini-DB, every
 * row starts blank, and the bulk import fills the resolvable rows while leaving
 * a deterministic few flagged for manual fixing.
 */
import { describe, it, expect } from 'vitest'
import {
  cutoverProducts, CUTOVER_TOTAL_PRODUCTS, cutoverSetUpCount,
  applyBulkImport, isCutoverProductComplete,
} from '~/data/wmsCutover'
import { productIndexRows } from '~/data/productsIndex'

describe('WMS cutover — catalogue + import', () => {
  it('is sourced from the inventory DB and starts entirely blank', () => {
    const dbSkus = new Set(productIndexRows().map((r) => r.sku))
    expect(cutoverProducts.length).toBe(CUTOVER_TOTAL_PRODUCTS)
    expect(cutoverProducts.length).toBeGreaterThan(0)
    // Every cutover SKU is a real inventory SKU (nothing invented).
    expect(cutoverProducts.every((p) => dbSkus.has(p.sku))).toBe(true)
    // Blank by default: no account, no value, sell/buy unchecked, no tax.
    expect(cutoverSetUpCount()).toBe(0)
    expect(cutoverProducts.every((p) =>
      p.inventoryAccount === '' && p.inventoryValue === null &&
      !p.isSold && !p.isBought && p.sellTax === '' && p.buyTax === '',
    )).toBe(true)
  })

  it('import fills the resolvable bulk and leaves a few flagged with a reason', () => {
    const { imported, skipped } = applyBulkImport()
    expect(imported).toBeGreaterThan(0)
    expect(skipped).toBeGreaterThan(0)
    // Set-up count is everything except the still-incomplete (flagged) rows.
    expect(cutoverSetUpCount()).toBe(CUTOVER_TOTAL_PRODUCTS - skipped)
    // Each leftover row is incomplete AND carries a specific reason.
    const leftover = cutoverProducts.filter((p) => !isCutoverProductComplete(p))
    expect(leftover.length).toBe(skipped)
    expect(leftover.every((p) => p.reason.length > 0)).toBe(true)
  })
})
