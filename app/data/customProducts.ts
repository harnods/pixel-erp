/**
 * User-created products — appended on top of the read-only CATALOG (never mutate
 * CATALOG itself; see its own "single source of truth" comment). Persisted the same
 * way as receipts/receipts.ts: a full reactive snapshot, present snapshot wins over
 * an empty seed, `resetDb()` clears it.
 */
import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import type { Product } from './inventory'

const snapshot = loadSnapshot<Product>('custom-products-v1')
export const customProducts = reactive<Product[]>(snapshot ?? [])

function persistCustomProducts(): void {
  saveSnapshot('custom-products-v1', customProducts)
}

let addSeq = customProducts.length

/** Create a new product from the New product form — persists + shows up everywhere immediately. */
export function addCustomProduct(data: Omit<Product, 'id'>): Product {
  const n = addSeq++
  const product: Product = { ...data, id: `custom-p${n}` }
  customProducts.unshift(product)
  persistCustomProducts()
  return product
}

/** Update an existing custom product (edit mode). No-op for seed (CATALOG) products. */
export function updateCustomProduct(sku: string, data: Partial<Omit<Product, 'id' | 'sku'>>): void {
  const p = customProducts.find((x) => x.sku === sku)
  if (!p) return
  Object.assign(p, data)
  persistCustomProducts()
}
