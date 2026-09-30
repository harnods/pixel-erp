// @vitest-environment happy-dom
/**
 * Per-warehouse min. stock editing (product details → Stock by warehouses → Edit).
 *
 * Min. stock is the only editable figure in that table — on hand, reserved,
 * available and in transit are measured by the warehouse, not chosen by a person.
 * So this proves two things: the edit reaches the number everywhere it's read
 * (a warehouse's own Products tab reads the SAME item), and it changes NOTHING
 * else on the row. A regression that quietly moved on-hand would be invisible on
 * screen but would corrupt every low-stock count downstream.
 *
 * happy-dom because the override persists through the localStorage overlay store.
 * WRITES, so each test restores the seed value it changed.
 */
import { describe, it, expect } from 'vitest'
import { getWarehouseDetail, setWarehouseMinStock } from '~/data/warehouseDetails'
import { getProductWarehouseStock } from '~/data/productDetails'

const WH = 'wh-001'

/** A SKU this warehouse actually carries, so the row exists to be edited. */
function firstStockedSku(): string {
  const sku = getWarehouseDetail(WH)?.stock[0]?.sku
  if (!sku) throw new Error(`${WH} carries no stock — seed changed`)
  return sku
}

function row(sku: string) {
  const r = getProductWarehouseStock(sku).find((s) => s.warehouseId === WH)
  if (!r) throw new Error(`${sku} not stocked in ${WH}`)
  return r
}

describe('per-warehouse min. stock', () => {
  it('overrides the generated min. stock for that warehouse only', () => {
    const sku = firstStockedSku()
    const before = row(sku)
    const others = getProductWarehouseStock(sku).filter((s) => s.warehouseId !== WH)

    setWarehouseMinStock(WH, sku, before.minStock + 35)
    expect(row(sku).minStock).toBe(before.minStock + 35)

    // Every other warehouse's floor for the same SKU is untouched — the number is
    // per warehouse, not per product.
    for (const o of others) {
      const now = getProductWarehouseStock(sku).find((s) => s.warehouseId === o.warehouseId)
      expect(now?.minStock).toBe(o.minStock)
    }

    setWarehouseMinStock(WH, sku, before.minStock)
    expect(row(sku).minStock).toBe(before.minStock)
  })

  it('leaves every measured figure on the row alone', () => {
    const sku = firstStockedSku()
    const before = row(sku)

    setWarehouseMinStock(WH, sku, 7)
    const after = row(sku)

    expect(after.onHand).toBe(before.onHand)
    expect(after.reserved).toBe(before.reserved)
    expect(after.available).toBe(before.available)
    expect(after.onTheWay).toBe(before.onTheWay)
    expect(after.unit).toBe(before.unit)

    setWarehouseMinStock(WH, sku, before.minStock)
  })

  it('is the same number the warehouse-details Products tab reads', () => {
    const sku = firstStockedSku()
    const before = row(sku)

    setWarehouseMinStock(WH, sku, 63)
    const item = getWarehouseDetail(WH)?.stock.find((s) => s.sku === sku)
    expect(item?.minStock).toBe(63)

    setWarehouseMinStock(WH, sku, before.minStock)
  })

  it('accepts zero as a real choice, and rounds/floors nonsense input', () => {
    const sku = firstStockedSku()
    const before = row(sku)

    setWarehouseMinStock(WH, sku, 0)
    expect(row(sku).minStock).toBe(0) // "no floor" — not the same as unset

    setWarehouseMinStock(WH, sku, -20)
    expect(row(sku).minStock).toBe(0) // a negative floor is meaningless

    setWarehouseMinStock(WH, sku, 12.6)
    expect(row(sku).minStock).toBe(13) // stock is counted in whole units

    setWarehouseMinStock(WH, sku, before.minStock)
  })
})
