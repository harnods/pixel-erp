/**
 * How a product's stock is tracked — the one answer every page and data module should
 * ask, instead of keeping its own copy of the batch/serial category lists.
 *
 * A product's own saved choice wins (New product form, WMS quick-create). Seed catalog
 * products don't carry one, so they follow their category (`isBatchTracked` /
 * `isSerialized` in warehouseDetails.ts) — seed behaviour is unchanged.
 *
 * Deliberately a light module (not productDetails.ts) so seed-data modules such as
 * receivingTasks.ts can use it without pulling in the product/batch read models.
 */
import { productBySku } from './inventory'
import { customProducts } from './customProducts'
import { isBatchTracked, isSerialized } from './warehouseDetails'

export type TrackStockBy = 'Quantity' | 'Batch' | 'Serial number'
const TRACK_STOCK_BY_VALUES: readonly string[] = ['Quantity', 'Batch', 'Serial number']

/** Batch, serial number or plain quantity. Unknown SKUs count as Quantity (untracked). */
export function productTrackStockBy(sku: string): TrackStockBy {
  const p = customProducts.find((x) => x.sku === sku) ?? productBySku(sku)
  if (!p) return 'Quantity'
  if (p.trackStockBy && TRACK_STOCK_BY_VALUES.includes(p.trackStockBy)) return p.trackStockBy as TrackStockBy
  return isBatchTracked(p.category) ? 'Batch' : isSerialized(p.category) ? 'Serial number' : 'Quantity'
}

export function isProductBatchTracked(sku: string): boolean {
  return productTrackStockBy(sku) === 'Batch'
}

export function isProductSerialTracked(sku: string): boolean {
  return productTrackStockBy(sku) === 'Serial number'
}
