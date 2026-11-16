/**
 * One answer to "how is this product's stock tracked?" (app/data/trackStockBy.ts).
 *
 * WMS pages used to keep their own copies of the batch/serial CATEGORY lists and only
 * looked products up in the seed catalog, so a custom product saved as Batch or Serial
 * number read as untracked there. This pins the shared rule:
 *   • seed catalog products keep following their category — unchanged behaviour
 *   • a product's own saved choice wins over its category
 *   • an unknown SKU is untracked
 *
 * customProducts is module-level reactive state, so each test re-imports a fresh copy.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

async function load() {
  vi.resetModules()
  const tracking = await import('~/data/trackStockBy')
  const custom = await import('~/data/customProducts')
  const inventory = await import('~/data/inventory')
  const warehouse = await import('~/data/warehouseDetails')
  return { ...tracking, ...custom, ...inventory, ...warehouse }
}
type Api = Awaited<ReturnType<typeof load>>
let api: Api
beforeEach(async () => { api = await load() })

function addCustom(sku: string, category: string, trackStockBy?: string) {
  api.addCustomProduct({
    sku, name: sku, desc: '', img: '', category, unit: 'Pcs',
    sellPrice: 0, buyPrice: 0, averageCost: 0, lastPurchaseCost: 0, trackStockBy,
  })
}

describe('productTrackStockBy', () => {
  it('seed catalog products follow their category, exactly as before', () => {
    for (const p of api.PRODUCTS) {
      const expected = api.isBatchTracked(p.category) ? 'Batch' : api.isSerialized(p.category) ? 'Serial number' : 'Quantity'
      expect(api.productTrackStockBy(p.sku), p.sku).toBe(expected)
    }
    // The catalog really covers all three kinds, so the loop above proves something.
    const kinds = new Set(api.PRODUCTS.map((p) => api.productTrackStockBy(p.sku)))
    expect([...kinds].sort()).toEqual(['Batch', 'Quantity', 'Serial number'])
  })

  it('a custom product’s own choice wins over its category', () => {
    addCustom('TSB-BATCH', 'Syrup', 'Batch')
    addCustom('TSB-SERIAL', 'Syrup', 'Serial number')
    addCustom('TSB-QTY-IN-BATCH-CAT', 'Green Beans', 'Quantity')
    expect(api.isProductBatchTracked('TSB-BATCH')).toBe(true)
    expect(api.isProductSerialTracked('TSB-BATCH')).toBe(false)
    expect(api.isProductSerialTracked('TSB-SERIAL')).toBe(true)
    expect(api.isProductBatchTracked('TSB-SERIAL')).toBe(false)
    expect(api.productTrackStockBy('TSB-QTY-IN-BATCH-CAT')).toBe('Quantity')
  })

  it('a custom product with no (or an unrecognised) choice falls back to its category', () => {
    addCustom('TSB-NO-CHOICE', 'Roasted Beans')
    addCustom('TSB-JUNK', 'Grinder', 'Lot')
    expect(api.productTrackStockBy('TSB-NO-CHOICE')).toBe('Batch')
    expect(api.productTrackStockBy('TSB-JUNK')).toBe('Serial number')
  })

  it('an unknown SKU is untracked', () => {
    expect(api.productTrackStockBy('NO-SUCH-SKU')).toBe('Quantity')
    expect(api.isProductBatchTracked('NO-SUCH-SKU')).toBe(false)
    expect(api.isProductSerialTracked('NO-SUCH-SKU')).toBe(false)
  })
})
