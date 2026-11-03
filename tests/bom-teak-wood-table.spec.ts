/**
 * Teak wood table — the furniture sample: a finished good, its wood materials and
 * one bill of materials (app/data/catalog.ts, app/data/billOfMaterials.ts).
 *
 * Also guards the reason the range sits outside TRADING_CATALOG: the warehouse
 * demo picks products by position, so the in-house range must not enter it.
 */
import { describe, it, expect } from 'vitest'
import { CATALOG, TRADING_CATALOG, IN_HOUSE_CATEGORIES } from '~/data/catalog'
import { billOfMaterials, bomCostSummary, catalogProduct } from '~/data/billOfMaterials'
import { PRODUCTS, warehouseOrderPool, warehouseProducts } from '~/data/inventory'
import { getProductTaxInfo } from '~/data/productsIndex'

const table = billOfMaterials.find(b => b.finishedGoodId === 'p31')!

describe('teak wood table — catalog', () => {
  it('registers the table and its materials under the furniture SKU ranges', () => {
    expect(catalogProduct('p31')).toMatchObject({ name: 'Teak Wood Table 120x60', category: 'Furniture', sku: '4001', unit: 'Unit' })
    for (const id of ['p32', 'p33', 'p34', 'p35', 'p36', 'p37'])
      expect(catalogProduct(id)!.sku, id).toMatch(/^41\d\d$/)
  })

  it('keeps the trading range at the original 30 products, in the original order', () => {
    expect(TRADING_CATALOG).toHaveLength(30)
    expect(TRADING_CATALOG.map(p => p.id)).toEqual(CATALOG.slice(0, 30).map(p => p.id))
    expect(TRADING_CATALOG.some(p => IN_HOUSE_CATEGORIES.has(p.category))).toBe(false)
  })

  it('is stocked in a warehouse, but never in its seeded order demand', () => {
    for (const wh of ['wh-001', 'wh-006']) {
      expect(warehouseProducts(wh).some(p => p.sku === '4101'), wh).toBe(true)
      expect(warehouseOrderPool(wh).some(p => IN_HOUSE_CATEGORIES.has(p.category)), wh).toBe(false)
    }
  })

  it('has a tax classification category, so the product list can read it', () => {
    expect(PRODUCTS.some(p => p.sku === '4001')).toBe(true)
    expect(() => getProductTaxInfo('4001')).not.toThrow()
  })
})

describe('teak wood table — bill of materials', () => {
  it('builds one table from 3 planks, 4 legs, screws, glue and varnish', () => {
    expect(table.rawMaterials.map(r => [r.productId, r.needed])).toEqual([
      ['p32', 3], ['p33', 4], ['p34', 1], ['p35', 1], ['p36', 1],
    ])
    for (const r of table.rawMaterials) {
      expect(r.unit).toBe(catalogProduct(r.productId)!.unit)
      expect(r.purchaseCost).toBe(catalogProduct(r.productId)!.price)
    }
  })

  it('carries joinery routing, labor and overhead', () => {
    expect(table.routing.map(r => r.process)).toEqual(['Fitting', 'Assembly', 'Painting', 'Quality control'])
    expect(table.productionCost.map(c => c.group)).toEqual(['Labor', 'Overhead', 'Overhead'])
  })

  it('reconciles: 95% table + 2% offcuts + 3% waste, summing to the production cost', () => {
    const { totalProductionCost, otherOutputsSubtotal, wasteSubtotal } = bomCostSummary(table, 0)
    expect(totalProductionCost).toBe(3_330_000)
    expect(table.finishedGoodPercentage).toBe(95)
    expect(table.otherOutputs).toEqual([{ productId: 'p37', qty: 4, unit: 'Kg', percentage: 2, estCost: 66_600 }])
    expect(wasteSubtotal).toBe(99_900)
    const main = totalProductionCost - otherOutputsSubtotal - wasteSubtotal
    expect(main).toBe(3_163_500)
    expect(bomCostSummary(table, main).finishedGoodsTotal).toBe(totalProductionCost)
  })
})
