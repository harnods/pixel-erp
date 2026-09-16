/**
 * Company-wide Products / Inventory index — one row per catalog product, with stock
 * quantities aggregated across every active (non-default) warehouse. Reuses the same
 * per-warehouse stock generator as the warehouse detail pages (`getWarehouseDetail`),
 * so a product's total on-hand here always agrees with what each warehouse's own
 * Products tab shows — never a second, drifting set of numbers.
 */
import { reactive } from 'vue'
import { warehouses } from './warehouses'
import { getWarehouseDetail } from './warehouseDetails'
import { PRODUCTS } from './inventory'
import { customProducts } from './customProducts'
import { loadSnapshot, saveSnapshot } from './persist'
import { GOODS_CLASSIFICATION_CODES } from './taxClassificationCodes'

// ── Persisted SKU barcode overlay ──────────────────────────────────────────────
// Only products with no barcode set anywhere (catalog, custom-product form, or
// this overlay) fall back to a synthetic placeholder (`8991...` + index) — that
// placeholder is what "Generate barcode" replaces, using the SKU barcode format.
// A product that already has a REAL barcode (catalog/custom) is never touched —
// same forward-only rule as every other barcode kind.
type SkuBarcodeOverlay = Record<string, string> // sku → barcode
const SKU_BARCODE_KEY = 'sku-barcode-overlay-v1'
const skuBarcodeOverlay = reactive<SkuBarcodeOverlay>(loadSnapshot<SkuBarcodeOverlay>(SKU_BARCODE_KEY) ?? {})
function persistSkuBarcodeOverlay() { saveSnapshot(SKU_BARCODE_KEY, skuBarcodeOverlay) }

/** Assign + persist a generated barcode for one SKU (only meaningful when the
 *  product had no real barcode of its own — see `ProductIndexRow.barcodeAssigned`). */
export function setSkuBarcode(sku: string, barcode: string): void {
  skuBarcodeOverlay[sku] = barcode
  persistSkuBarcodeOverlay()
}

// ── Persisted product tax-info overlay ────────────────────────────────────────
// Tax classification is edited on the product form but doesn't live on `Product`:
// it applies to seed CATALOG products just as much as user-created ones, and
// CATALOG is read-only. An overlay keyed by SKU covers both in one mechanism —
// same shape as the barcode overlay above.
//
// Presence of a key (not truthiness of its fields) is what makes the overlay win,
// so a user who deliberately CLEARS a seed product's classification gets an empty
// Tax info section rather than the seeded value silently reappearing.
export interface ProductTaxInfo {
  /** 'Goods' | 'Service' — the DJP Barang/Jasa scope. Empty when unclassified. */
  productClassification: string
  /** Full DJP catalogue label, "<code> - <description>" (see taxClassificationCodes.ts). */
  djpCode: string
  djpUnit: string
}
type ProductTaxOverlay = Record<string, ProductTaxInfo> // sku → tax info
const PRODUCT_TAX_KEY = 'product-tax-overlay-v1'
const productTaxOverlay = reactive<ProductTaxOverlay>(loadSnapshot<ProductTaxOverlay>(PRODUCT_TAX_KEY) ?? {})

/** Save (or clear) one product's tax classification. Always call this on save,
 *  even with empty fields — that's what records an intentional "unclassified". */
export function setProductTaxInfo(sku: string, info: ProductTaxInfo): void {
  productTaxOverlay[sku] = { ...info }
  saveSnapshot(PRODUCT_TAX_KEY, productTaxOverlay)
}

/** A product's current tax classification: the user's saved overlay if there is
 *  one, else the seeded backfill, else undefined (never classified). */
export function getProductTaxInfo(sku: string): ProductTaxInfo | undefined {
  if (sku in productTaxOverlay) return productTaxOverlay[sku]
  const seeded = DJP_SKUS.get(sku)
  return seeded ? { productClassification: 'Goods', ...seeded } : undefined
}

export type ProductType = 'single-tracked' | 'single-not-tracked' | 'bundle' | 'assembled'

export const PRODUCT_TYPE_LABEL: Record<ProductType, string> = {
  'single-tracked': 'Single products (Tracked)',
  'single-not-tracked': 'Single products (not tracked)',
  bundle: 'Bundle products',
  assembled: 'Assembled products',
}

export interface ProductIndexRow {
  id: string
  name: string
  desc: string
  img: string
  sku: string
  barcode: string
  /** false only for the synthetic placeholder barcode — no real one was ever set */
  barcodeAssigned: boolean
  category: string
  productType: ProductType
  unit: string
  onHand: number
  reserved: number
  available: number
  onTheWay: number
  minStock: number
  defaultSalesPrice: number
  averageCost: number
  lastPurchaseCost: number
  defaultPurchaseCost: number
  /** Tax info (DJP/e-Faktur) — only filled in for a small, deterministic set of
   *  products; most rows are blank since this is a newly-added field on the
   *  product form and existing catalog data hasn't been backfilled. */
  productClassification: string
  djpCode: string
  djpUnit: string
  /** true for a small, deterministic set of newly-added SKUs pending review */
  pendingApproval: boolean
}

interface StockTotals { onHand: number; reserved: number; onTheWay: number; barcode: string }

// on-hand / reserved / on-the-way are per-unit quantities, so they sum sensibly across
// warehouses. Min. stock is a reorder-point POLICY (not a location-scaled quantity) —
// summing it across every warehouse that happens to carry the SKU would inflate it far
// past on-hand and make nearly everything read as "low stock". It's derived separately,
// once per SKU, independent of warehouse count (see `minStockFor` below).
//
// `warehouseIds` narrows the aggregate to just those warehouses (the Products index's
// Warehouse filter) — every product still gets a row either way, only the quantity
// columns rescope to the selected warehouse(s); omitted/empty means every active warehouse.
function aggregateStock(warehouseIds?: string[]): Map<string, StockTotals> {
  const map = new Map<string, StockTotals>()
  const scope = warehouseIds?.length ? new Set(warehouseIds) : null
  for (const wh of warehouses) {
    if (wh.isDefault || wh.status === 'archived') continue
    if (scope && !scope.has(wh.id)) continue
    const detail = getWarehouseDetail(wh.id)
    if (!detail) continue
    for (const item of detail.stock) {
      const cur = map.get(item.sku) ?? { onHand: 0, reserved: 0, onTheWay: 0, barcode: item.barcode }
      cur.onHand += item.onHand
      cur.reserved += item.reserved
      cur.onTheWay += item.onTheWay
      map.set(item.sku, cur)
    }
  }
  return map
}

/** Company-wide reorder threshold, keyed by the product's position in the full
 *  catalog — scaled to the aggregated (multi-warehouse) available quantities here,
 *  so "low stock" stays the notable minority case it's meant to represent. */
function minStockFor(catalogIndex: number): number {
  // Most SKUs sit comfortably above their reorder point. A deterministic ~1-in-4
  // subset are high-velocity items with a higher reorder point (150–180) so they
  // genuinely sit at/below the line given typical on-hand — this is the REAL
  // low-stock the WMS low-stock badge and the Cowork reorder task surface (no
  // hardcoded stock literals anywhere).
  if (catalogIndex % 4 === 0) return 150 + (catalogIndex % 4) * 10   // 150 (high reorder point)
  return Math.round((((catalogIndex * 11) % 35) + 5) / 5) * 5        // 5–40 (healthy)
}

// A small, deterministic subset of catalog products awaiting approval before they
// go live (every 6th product, capped at 5 — matches the tab's badge count).
const PENDING_SKUS = new Set(PRODUCTS.filter((_, i) => i % 6 === 0).slice(0, 5).map((p) => p.sku))

// Tax info (DJP code / DJP unit) — filled in for roughly half the catalog (every
// odd index), since it's a newly-added field still being backfilled; a different
// offset/parity from PENDING_SKUS so the two "minority" sets don't just line up
// with each other. The DJP code is looked up by category so it always matches
// what the product actually is (coffee beans get the coffee HS code,
// grinders/machines get an appliance/machinery code) rather than an arbitrary
// pick from the full classification list.
function djpCodeFor(label: string) {
  return GOODS_CLASSIFICATION_CODES.find((c) => c.value === label)!.label
}
const CATEGORY_DJP: Record<string, { code: string; unit: string }> = {
  'Green Beans':       { code: djpCodeFor('090100'), unit: 'Kilogram' }, // coffee, whether or not roasted
  'Roasted Beans':      { code: djpCodeFor('090100'), unit: 'Kilogram' },
  'Espresso Machine':    { code: djpCodeFor('843800'), unit: 'Unit' },     // machinery for industrial prep of food/drink
  'Grinder':            { code: djpCodeFor('850900'), unit: 'Unit' },     // electro-mechanical domestic appliance
  Equipment:            { code: djpCodeFor('841900'), unit: 'Unit' },     // machinery for treatment by heating/roasting
  Accessory:            { code: djpCodeFor('850900'), unit: 'Piece' },
  // Apparel line — the subcontracting scenario.
  Fabric:               { code: djpCodeFor('520800'), unit: 'Meter'    }, // woven cotton fabric
  'Sewing Supplies':    { code: djpCodeFor('540000'), unit: 'Kilogram' }, // man-made filament thread
  Apparel:              { code: djpCodeFor('620500'), unit: 'Piece'    }, // men's shirts
}
/** SKU -> DJP code/unit, for the roughly-half of products that ship pre-classified.
 *  This is only the SEED backfill — anything the user saves on the product form
 *  overrides it. Read tax info through `getProductTaxInfo()`, never off this map,
 *  or you'll miss every edit the user has made. */
const DJP_SKUS = new Map(
  PRODUCTS.filter((_, i) => i % 2 === 1)
    .flatMap((p) => {
      const entry = CATEGORY_DJP[p.category]
      // No mapping for this category → ship it unclassified rather than throwing.
      // This map is built at import time, so a miss here used to crash app start.
      if (!entry) return []
      return [[p.sku, { djpCode: entry.code, djpUnit: entry.unit }] as const]
    }),
)

/** Count of products awaiting approval — badges the sidebar/tab. */
export function pendingApprovalCount(): number {
  return PENDING_SKUS.size
}

/** Recomputed on each call so it always reflects the latest warehouse stock/state
 *  AND any products created via the New product form. Pass `warehouseIds` to rescope
 *  the quantity columns to just those warehouses (Products index's Warehouse filter). */
export function productIndexRows(warehouseIds?: string[]): ProductIndexRow[] {
  const stock = aggregateStock(warehouseIds)
  const allProducts = [...PRODUCTS, ...customProducts]
  return allProducts.map((p, i) => {
    const s = stock.get(p.sku)
    const onHand = s?.onHand ?? 0
    const reserved = s?.reserved ?? 0
    // `s?.barcode` and the final `8991...` fallback are both synthetic placeholders
    // (see warehouseDetails.ts's generateStock) — only `p.barcode` (catalog/custom
    // product) or a generated overlay entry count as a REAL, assigned barcode.
    const overlayBarcode = skuBarcodeOverlay[p.sku]
    return {
      id: p.id,
      name: p.name,
      desc: p.desc,
      img: p.img,
      sku: p.sku,
      barcode: overlayBarcode ?? p.barcode ?? s?.barcode ?? String(8_991_000_000_000 + i),
      barcodeAssigned: !!p.barcode || !!overlayBarcode,
      category: p.category,
      // "Not tracked" means not tracked in inventory at all (e.g. a service item) —
      // every current product is a real stocked good, so all are "tracked" for now.
      productType: 'single-tracked',
      unit: p.unit,
      onHand,
      reserved,
      available: onHand - reserved,
      onTheWay: s?.onTheWay ?? 0,
      minStock: minStockFor(i),
      defaultSalesPrice: p.sellPrice,
      averageCost: p.averageCost,
      lastPurchaseCost: p.lastPurchaseCost,
      defaultPurchaseCost: p.buyPrice,
      productClassification: getProductTaxInfo(p.sku)?.productClassification ?? '',
      djpCode: getProductTaxInfo(p.sku)?.djpCode ?? '',
      djpUnit: getProductTaxInfo(p.sku)?.djpUnit ?? '',
      pendingApproval: PENDING_SKUS.has(p.sku),
    }
  })
}
