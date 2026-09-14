// @vitest-environment happy-dom
/**
 * Vendor database coherence and per-vendor terms.
 *
 * The point of this table is that different vendors quote DIFFERENT terms for the
 * same product — otherwise the alternate-vendor picker and the MOQ/pack note are
 * decoration. So this asserts both the referential integrity and the spread.
 *
 * The `moq % packSize === 0` invariant is load-bearing: replenishment-math.spec.ts
 * relies on it to prove that converting-then-rounding equals rounding-then-
 * converting. If a seed change breaks it, that equivalence silently stops holding.
 *
 * happy-dom because edits persist through the overlay store. WRITES, so the
 * mutation tests restore what they change.
 */
import { describe, it, expect } from 'vitest'
import {
  vendorItems, vendorItemsForSku, preferredVendorItem, vendorItemFor, vendorItemsForVendor,
  skusWithoutVendor, leadTimeFor, upsertVendorItem, setPreferredVendor, deactivateVendorItem,
  vendorNameFor, VENDORLESS_SKUS,
} from '~/data/vendorItems'
import { vendors } from '~/data/vendors'
import { PRODUCTS } from '~/data/inventory'
import { CATALOG } from '~/data/catalog'
import {
  unitOptionsForSku, unitConversionsForSku, factorFor, baseUnitFor, describeQty,
  upsertUnitConversion, removeUnitConversion,
} from '~/data/productUnits'

const VENDOR_IDS = new Set(vendors.map((v) => v.id))
const SKUS = new Set(PRODUCTS.map((p) => p.sku))

/** Operating-expense vendors: logistics, utilities, rent, software. Nothing we stock. */
const NON_GOODS_VENDORS = ['V008', 'V009', 'V010', 'V011', 'V012']

describe('vendor database — referential integrity', () => {
  it('every link resolves to a real vendor and a real catalogue SKU', () => {
    expect(vendorItems.length).toBeGreaterThan(0)
    for (const vi of vendorItems) {
      expect(VENDOR_IDS.has(vi.vendorId), `${vi.id} has an unknown vendor`).toBe(true)
      expect(SKUS.has(vi.sku), `${vi.id} has an unknown SKU`).toBe(true)
      expect(vi.id).toBe(`vi-${vi.vendorId}-${vi.sku}`)
    }
  })

  it('has no duplicate vendor-product pairs', () => {
    const keys = vendorItems.map((v) => `${v.vendorId}::${v.sku}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('names every vendor from the master', () => {
    for (const vi of vendorItems) {
      expect(vendorNameFor(vi.vendorId)).toBe(vendors.find((v) => v.id === vi.vendorId)!.name)
    }
  })

  it('does not link operating-expense vendors to stock', () => {
    for (const id of NON_GOODS_VENDORS) {
      expect(vendorItemsForVendor(id), `${id} should supply no stock`).toHaveLength(0)
    }
  })

  it('lists at most one default per product, and returns it first', () => {
    for (const sku of SKUS) {
      const list = vendorItemsForSku(sku)
      expect(list.filter((v) => v.isPreferred).length).toBeLessThanOrEqual(1)
      if (list.some((v) => v.isPreferred)) expect(list[0]!.isPreferred).toBe(true)
      if (list.length) expect(preferredVendorItem(sku)).toBeTruthy()
    }
  })
})

describe('vendor terms — valid and per-vendor', () => {
  it('every term is a sane positive number', () => {
    for (const vi of vendorItems) {
      expect(vi.leadTimeDays).toBeGreaterThan(0)
      expect(vi.moq).toBeGreaterThanOrEqual(1)
      expect(vi.packSize).toBeGreaterThanOrEqual(1)
      expect(vi.unitsPerPurchaseUnit).toBeGreaterThanOrEqual(1)
      expect(vi.unitCost).toBeGreaterThan(0)
      expect(vi.purchaseUnit).toBeTruthy()
      expect(vi.vendorSku).toBeTruthy()
    }
  })

  it('MOQ is always a whole number of packs (the rounding-equivalence invariant)', () => {
    for (const vi of vendorItems) {
      expect(vi.moq % vi.packSize, `${vi.id}: MOQ ${vi.moq} is not a multiple of pack ${vi.packSize}`).toBe(0)
    }
  })

  it('MOQ genuinely differs between vendors of the same product', () => {
    // If every vendor quoted the same minimum, comparing vendors would be pointless.
    const multiVendor = [...SKUS]
      .map((sku) => vendorItemsForSku(sku))
      .filter((list) => list.length > 1)
    expect(multiVendor.length, 'no product has more than one vendor to compare').toBeGreaterThan(0)

    const withVaryingTerms = multiVendor.filter((list) => {
      const moqs = new Set(list.map((v) => v.moq))
      const packs = new Set(list.map((v) => v.packSize))
      return moqs.size > 1 || packs.size > 1
    })
    expect(withVaryingTerms.length).toBeGreaterThan(0)
  })

  it('lead time genuinely differs between vendors of the same product', () => {
    const varying = [...SKUS]
      .map((sku) => vendorItemsForSku(sku))
      .filter((list) => list.length > 1 && new Set(list.map((v) => v.leadTimeDays)).size > 1)
    expect(varying.length).toBeGreaterThan(0)
  })

  it('purchase UoM conversion matches the product being stocked', () => {
    for (const vi of vendorItems) {
      const item = CATALOG.find((c) => c.sku === vi.sku)!
      // A single-unit purchase UoM must be named the same as the stock unit;
      // anything larger must convert by more than one.
      if (vi.unitsPerPurchaseUnit === 1) expect(vi.purchaseUnit).toBe(item.unit)
      else expect(vi.unitsPerPurchaseUnit).toBeGreaterThan(1)
    }
  })
})

describe('products with no vendor', () => {
  it('reports them, and they really have no active link', () => {
    const without = skusWithoutVendor()
    expect(without.length).toBeGreaterThan(0)
    for (const sku of without) expect(vendorItemsForSku(sku)).toHaveLength(0)
    // The deliberately vendorless seed SKUs are part of that set.
    for (const sku of VENDORLESS_SKUS) expect(without).toContain(sku)
  })

  it('falls back to an estimated lead time rather than throwing', () => {
    const sku = skusWithoutVendor()[0]!
    const lead = leadTimeFor(sku, undefined, 14)
    expect(lead.estimated).toBe(true)
    expect(lead.days).toBe(14)
  })

  it('reports a real vendor lead time as not estimated', () => {
    const linked = vendorItems.find((v) => v.active)!
    const lead = leadTimeFor(linked.sku, linked.vendorId)
    expect(lead.estimated).toBe(false)
    expect(lead.days).toBe(linked.leadTimeDays)
  })
})

describe('editing vendor terms', () => {
  it('updates MOQ in place and keeps it readable', () => {
    const target = vendorItems.find((v) => v.active)!
    const before = target.moq
    upsertVendorItem({ sku: target.sku, vendorId: target.vendorId, moq: before + 7 })
    expect(vendorItemFor(target.sku, target.vendorId)!.moq).toBe(before + 7)
    upsertVendorItem({ sku: target.sku, vendorId: target.vendorId, moq: before })
    expect(vendorItemFor(target.sku, target.vendorId)!.moq).toBe(before)
  })

  it('adds a new vendor for a product with sensible defaults', () => {
    const sku = '1001'
    const existing = new Set(vendorItemsForSku(sku).map((v) => v.vendorId))
    const fresh = vendors.find((v) => !existing.has(v.id))!
    const added = upsertVendorItem({ sku, vendorId: fresh.id })
    expect(added.moq).toBeGreaterThanOrEqual(1)
    expect(added.packSize).toBeGreaterThanOrEqual(1)
    expect(added.moq % added.packSize).toBe(0)
    expect(vendorItemsForSku(sku).some((v) => v.vendorId === fresh.id)).toBe(true)
    deactivateVendorItem(sku, fresh.id)
    expect(vendorItemsForSku(sku).some((v) => v.vendorId === fresh.id)).toBe(false)
  })

  it('moves the default and never leaves a product with none', () => {
    const sku = [...SKUS].find((s) => vendorItemsForSku(s).length > 1)!
    const list = vendorItemsForSku(sku)
    const original = list.find((v) => v.isPreferred)!.vendorId
    const other = list.find((v) => v.vendorId !== original)!.vendorId

    setPreferredVendor(sku, other)
    expect(preferredVendorItem(sku)!.vendorId).toBe(other)
    expect(vendorItemsForSku(sku).filter((v) => v.isPreferred)).toHaveLength(1)

    setPreferredVendor(sku, original)
    expect(preferredVendorItem(sku)!.vendorId).toBe(original)
  })

  it('promotes a survivor when the default vendor is removed', () => {
    const sku = [...SKUS].find((s) => vendorItemsForSku(s).length > 1)!
    const original = preferredVendorItem(sku)!.vendorId

    deactivateVendorItem(sku, original)
    const after = vendorItemsForSku(sku)
    expect(after.length).toBeGreaterThan(0)
    expect(after.filter((v) => v.isPreferred)).toHaveLength(1)
    expect(after.some((v) => v.vendorId === original)).toBe(false)

    // Restore.
    upsertVendorItem({ sku, vendorId: original, active: true })
    setPreferredVendor(sku, original)
  })
})

describe('MOQ unit — base unit or a registered multi-unit', () => {
  it('every vendor purchase unit is a real unit option of its product', () => {
    for (const vi of vendorItems) {
      const names = unitOptionsForSku(vi.sku).map((o) => o.name)
      expect(names, `${vi.id} buys by "${vi.purchaseUnit}", which is not a unit of ${vi.sku}`)
        .toContain(vi.purchaseUnit)
    }
  })

  it('the stored conversion always matches the product’s own table', () => {
    // The factor must never be pinned independently — otherwise "4 Pallet" could
    // mean 80 Sack on the vendor and 60 Sack on the product.
    for (const vi of vendorItems) {
      expect(vi.unitsPerPurchaseUnit).toBe(factorFor(vi.sku, vi.purchaseUnit))
    }
  })

  it('a base-unit MOQ has a factor of exactly 1', () => {
    for (const vi of vendorItems) {
      if (vi.purchaseUnit === baseUnitFor(vi.sku)) expect(vi.unitsPerPurchaseUnit).toBe(1)
    }
  })

  it('accepts a MOQ quoted in the BASE unit', () => {
    const sku = '1101'                       // Roasted Beans, stocked in Bag
    const base = baseUnitFor(sku)
    const vendorId = vendorItemsForSku(sku)[0]!.vendorId
    const before = vendorItemFor(sku, vendorId)!

    upsertVendorItem({ sku, vendorId, purchaseUnit: base, unitsPerPurchaseUnit: undefined, moq: 30 })
    const after = vendorItemFor(sku, vendorId)!
    expect(after.purchaseUnit).toBe(base)
    expect(after.unitsPerPurchaseUnit).toBe(1)
    expect(after.moq * after.unitsPerPurchaseUnit).toBe(30)   // 30 Bag

    upsertVendorItem({
      sku, vendorId,
      purchaseUnit: before.purchaseUnit,
      unitsPerPurchaseUnit: before.unitsPerPurchaseUnit,
      moq: before.moq,
    })
  })

  it('accepts a MOQ quoted in a MULTI-unit and converts it correctly', () => {
    const sku = '1101'
    const multi = unitOptionsForSku(sku).find((o) => !o.isBase)
    expect(multi, 'roasted beans should have a multi-unit registered').toBeTruthy()
    const vendorId = vendorItemsForSku(sku)[0]!.vendorId
    const before = vendorItemFor(sku, vendorId)!

    // Pass only the unit NAME — the factor is resolved from the product.
    upsertVendorItem({ sku, vendorId, purchaseUnit: multi!.name, unitsPerPurchaseUnit: undefined, moq: 3 })
    const after = vendorItemFor(sku, vendorId)!
    expect(after.purchaseUnit).toBe(multi!.name)
    expect(after.unitsPerPurchaseUnit).toBe(multi!.factor)
    expect(after.moq * after.unitsPerPurchaseUnit).toBe(3 * multi!.factor)

    upsertVendorItem({
      sku, vendorId,
      purchaseUnit: before.purchaseUnit,
      unitsPerPurchaseUnit: before.unitsPerPurchaseUnit,
      moq: before.moq,
    })
  })

  it('a new multi-unit on the product becomes an available MOQ unit', () => {
    const sku = '1101'
    expect(unitOptionsForSku(sku).some((o) => o.name === 'Bundle')).toBe(false)
    upsertUnitConversion(sku, 'Bundle', 48)
    const option = unitOptionsForSku(sku).find((o) => o.name === 'Bundle')
    expect(option).toBeTruthy()
    expect(option!.factor).toBe(48)
    expect(factorFor(sku, 'Bundle')).toBe(48)
    removeUnitConversion(sku, 'Bundle')
    expect(unitOptionsForSku(sku).some((o) => o.name === 'Bundle')).toBe(false)
  })
})

describe('unit conversions', () => {
  it('always lists the base unit first, at a factor of 1', () => {
    for (const sku of SKUS) {
      const options = unitOptionsForSku(sku)
      expect(options[0]!.isBase).toBe(true)
      expect(options[0]!.factor).toBe(1)
      expect(options[0]!.name).toBe(baseUnitFor(sku))
    }
  })

  it('every multi-unit converts by more than one base unit', () => {
    for (const sku of SKUS) {
      for (const c of unitConversionsForSku(sku)) {
        expect(c.factor).toBeGreaterThan(1)
        expect(Number.isInteger(c.factor)).toBe(true)
        expect(c.name).not.toBe(baseUnitFor(sku))
      }
    }
  })

  it('has no duplicate unit names per product', () => {
    for (const sku of SKUS) {
      const names = unitOptionsForSku(sku).map((o) => o.name)
      expect(new Set(names).size).toBe(names.length)
    }
  })

  it('describes a quantity in both units', () => {
    expect(describeQty('1101', 4, 'Carton')).toBe('4 Carton = 48 Bag')
    expect(describeQty('1101', 4, baseUnitFor('1101'))).toBe('4 Bag')
  })

  it('hardware has no multi-unit, so its MOQ can only be the base unit', () => {
    // Espresso machines are bought one at a time — "no multi-unit" is a real state
    // the UI has to render, not an oversight.
    const options = unitOptionsForSku('2001')
    expect(options).toHaveLength(1)
    expect(options[0]!.isBase).toBe(true)
  })
})
