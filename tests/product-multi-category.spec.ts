/**
 * Products can belong to multiple categories (like production), with the FIRST as the
 * primary that drives replenishment. `category` stays the primary for back-compat;
 * `categories` carries the full list.
 */
import { describe, it, expect } from 'vitest'
import { PRODUCTS, productCategoriesOf, type Product } from '~/data/inventory'
import { productIndexRows } from '~/data/productsIndex'

describe('product multi-category', () => {
  it('seed products expose categories, with category as the primary (= categories[0])', () => {
    for (const p of PRODUCTS.slice(0, 5)) {
      expect(p.categories).toBeTruthy()
      expect(p.categories![0]).toBe(p.category)
    }
  })

  it('productCategoriesOf returns the list, falling back to the single category', () => {
    const multi = { category: 'Finish Good', categories: ['Finish Good', 'Product Component'] } as Pick<Product, 'category' | 'categories'>
    expect(productCategoriesOf(multi)).toEqual(['Finish Good', 'Product Component'])

    const legacy = { category: 'Equipment' } as Pick<Product, 'category' | 'categories'>
    expect(productCategoriesOf(legacy)).toEqual(['Equipment'])

    const none = { category: '' } as Pick<Product, 'category' | 'categories'>
    expect(productCategoriesOf(none)).toEqual([])
  })

  it('the index row keeps category as the primary and adds the full categories list', () => {
    const rows = productIndexRows()
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows.slice(0, 5)) {
      expect(Array.isArray(r.categories)).toBe(true)
      // The primary is the first of the list.
      if (r.categories.length) expect(r.categories[0]).toBe(r.category)
    }
  })
})
