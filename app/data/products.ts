import type { Product } from './types'
import { CATALOG } from './catalog'

/**
 * Product master list for the ERP — same catalog as the WMS.
 * Stock and price are pulled from the master catalog so every module
 * (Sales, Purchasing, WMS) always shows the same numbers.
 */
export const products: Product[] = CATALOG.map(item => ({
  id: item.id,
  code: item.sku,
  name: item.name,
  category: item.category,
  unit: item.unit,
  price: item.price,
  stock: item.stock,
  status: 'active' as const,
}))
