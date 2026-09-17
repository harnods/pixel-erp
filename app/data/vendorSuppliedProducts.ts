/**
 * Supplemental "products supplied" data for the Contacts › Vendors module.
 *
 * The replenishment engine's item↔vendor links (`vendorItems.ts`) only cover the
 * coffee/packaging/equipment suppliers (V001–V007); V008–V012 are locked to zero
 * there on purpose (they're the "non-goods" vendors, asserted by
 * vendor-items.spec). That leaves the vendors module showing product price lists
 * for ~54% of vendors.
 *
 * This module is a SEPARATE, demo-only source that lifts that to ~70% without
 * touching the engine or its tests: it hand-lists what a distributor-type vendor
 * carries. It covers the two vendors where a supplied-products list is plausible
 * beyond the coffee suppliers — the broad-line distributor (CT007) and the
 * inter-island logistics/distribution vendor (V008). The remaining vendors
 * (utilities, rent, software) genuinely supply no catalogue goods and stay empty.
 *
 * Prices derive from the catalogue buy price × the largest purchase unit, so a
 * supplemental row reads like an engine row; the per-vendor skew keeps two
 * vendors from quoting an identical price on a shared SKU.
 */
import { productBySku } from './inventory'
import { largestUnitFor } from './productUnits'

export interface SuppliedProduct {
  sku: string
  /** Minimum order quantity — the floor the replenishment rule never orders below. */
  moq: number
  /** Purchase multiple ("kelipatan pembelian") — order qty rounds UP to a multiple of this. */
  packSize: number
  unitCost: number
  purchaseUnit: string
  /** Supplemental rows are never a SKU's preferred vendor — that's the engine's call. */
  isPreferred: boolean
}

/** What each vendor carries, as {sku, moq, packSize}; price/unit are derived below.
 *  `moq` is a multiple of `packSize`, matching the engine's ordering invariant.
 *  Keyed by vendorMasterId (V0NN) or, for a contact with no master link, its id. */
const SUPPLY: Record<string, { sku: string; moq: number; packSize: number }[]> = {
  // CT007 — Distributor Sentra Boga: a broad-line distributor across categories.
  CT007: [
    { sku: '1002', moq: 4, packSize: 1 }, { sku: '1004', moq: 4, packSize: 1 },
    { sku: '1101', moq: 8, packSize: 2 }, { sku: '1104', moq: 8, packSize: 2 },
    { sku: '2102', moq: 1, packSize: 1 }, { sku: '3001', moq: 12, packSize: 6 },
    { sku: '3003', moq: 12, packSize: 6 }, { sku: '3005', moq: 6, packSize: 3 },
  ],
  // V008 — CV Logistik Antar Pulau: moves packaged goods and accessories.
  V008: [
    { sku: '3002', moq: 12, packSize: 6 }, { sku: '3004', moq: 6, packSize: 3 },
    { sku: '3006', moq: 6, packSize: 3 }, { sku: '3007', moq: 12, packSize: 6 },
    { sku: '1105', moq: 8, packSize: 2 },
  ],
}

/** A small per-vendor price skew so a shared SKU isn't quoted identically. */
const PRICE_SKEW: Record<string, number> = { CT007: 1.04, V008: 1.08 }

/** Supplemental supplied-products for a vendor key, priced from the catalogue. */
export function supplementalSupply(key: string): SuppliedProduct[] {
  const rows = SUPPLY[key]
  if (!rows) return []
  const skew = PRICE_SKEW[key] ?? 1
  return rows.map(({ sku, moq, packSize }) => {
    const unit = largestUnitFor(sku)
    const buyPrice = productBySku(sku)?.buyPrice ?? 0
    return {
      sku,
      moq,
      packSize,
      unitCost: Math.round((buyPrice * unit.factor * skew) / 1000) * 1000,
      purchaseUnit: unit.name,
      isPreferred: false,
    }
  })
}
