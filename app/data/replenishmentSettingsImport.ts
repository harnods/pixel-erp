/**
 * Bulk import of per-warehouse replenishment settings (PRD US-021 AC-02, US-008 EH-01).
 *
 * One row = one product × warehouse, carrying the three things a person sets by hand
 * there: safety days, reorder point and the preferred vendor. Rows are validated one by
 * one and the valid ones are applied — a typo on one row never blocks the rest, and the
 * rejected rows come back with the row number and the reason so the file can be fixed
 * and re-imported.
 *
 * A value that equals what the warehouse would inherit anyway (the category safety
 * days, the calculated reorder point, the product's default vendor) stores NO override,
 * exactly as the Product replenishment settings drawer and the Stock by warehouses tab
 * do — so importing an unchanged template changes nothing and stays tracking its defaults.
 */
import { warehouseProducts } from './inventory'
import {
  buildRow, replenishmentWarehouses, invalidateReplenishmentCaches, type WorklistRow,
} from './replenishment'
import { inheritedSafetyDays, saveSkuWarehouseOverride } from './replenishmentSettings'
import {
  vendorItemsForSku, preferredVendorItem, setPreferredVendor, clearPreferredVendorForWarehouse, vendorNameFor,
} from './vendorItems'
import { productBySku } from './inventory'
import type { CsvRow } from '../utils/csv'

/** Stated up front, before upload (the same rule as the vendor-terms import). */
export const SETTINGS_IMPORT_ROW_LIMIT = 1000

/** The template's columns, in order. Product name is informational and ignored on import. */
export const SETTINGS_IMPORT_HEADER = [
  'Product code', 'Product name', 'Warehouse', 'Safety days', 'Reorder point', 'Preferred vendor',
] as const

export interface SettingsImportRow {
  /** 1-based sheet row; row 1 is the header. */
  rowNumber: number
  sku: string
  productName: string
  warehouseName: string
  safetyDays: string
  reorderPoint: string
  vendorName: string
  /** Why the row is rejected; empty when valid. */
  error: string
  /** 'update' will change something; 'unchanged' matches what is already in force. */
  outcome: 'update' | 'unchanged' | 'rejected'
  /** Resolved values for a valid row. */
  resolved?: { warehouseId: string; safetyDays: number | null; reorderPoint: number | null; vendorId: string | null }
}

/** The current settings as a sheet: what a person edits and uploads back. */
export function settingsTemplate(): CsvRow[] {
  const rows: CsvRow[] = [[...SETTINGS_IMPORT_HEADER]]
  for (const wh of replenishmentWarehouses()) {
    for (const p of warehouseProducts(wh.id)) {
      const r = buildRow(p.sku, wh.id)
      rows.push([p.sku, p.name, wh.name, r.safetyDays, r.reorderPoint, r.vendor?.name ?? ''])
    }
  }
  return rows
}

const norm = (s: string) => s.trim().toLowerCase()
const isWhole = (s: string) => /^\d+$/.test(s.trim())

/** Whether a sheet's header row is the template's (case-insensitive, any order of extras ignored). */
export function hasSettingsColumns(header: string[]): boolean {
  const have = new Set(header.map(norm))
  return ['product code', 'warehouse', 'safety days', 'reorder point', 'preferred vendor'].every((c) => have.has(c))
}

/**
 * Validate a parsed sheet (header row first). Returns one entry per data row.
 * Blank safety days / reorder point / vendor mean "leave as it is".
 */
export function validateSettingsImport(sheet: string[][]): SettingsImportRow[] {
  const [header = [], ...body] = sheet
  const col = (name: string) => header.map(norm).indexOf(name)
  const iSku = col('product code'), iWh = col('warehouse'), iSafety = col('safety days')
  const iRop = col('reorder point'), iVendor = col('preferred vendor')

  const whByName = new Map(replenishmentWarehouses().map((w) => [norm(w.name), w]))
  const seen = new Set<string>()

  return body.map((cells, i) => {
    const rowNumber = i + 2
    const sku = (cells[iSku] ?? '').trim()
    const warehouseName = (cells[iWh] ?? '').trim()
    const safety = (cells[iSafety] ?? '').trim()
    const rop = (cells[iRop] ?? '').trim()
    const vendorName = (cells[iVendor] ?? '').trim()
    const product = productBySku(sku)
    const base = {
      rowNumber, sku, productName: product?.name ?? '', warehouseName,
      safetyDays: safety, reorderPoint: rop, vendorName,
    }
    const reject = (error: string): SettingsImportRow => ({ ...base, error, outcome: 'rejected' })

    if (!product) return reject('Product code not found in your catalogue')
    const wh = whByName.get(norm(warehouseName))
    if (!wh) return reject('Warehouse not found or replenishment is off for it')
    if (!warehouseProducts(wh.id).some((p) => p.sku === sku)) return reject('Product is not stocked in this warehouse')
    const key = `${sku}::${wh.id}`
    if (seen.has(key)) return reject('Row repeats an earlier product and warehouse')
    seen.add(key)

    if (safety !== '' && (!isWhole(safety) || Number(safety) < 1)) return reject('Safety days must be a whole number of 1 or more')
    if (rop !== '' && !isWhole(rop)) return reject('Reorder point must be a whole number of 0 or more')

    let vendorId: string | null = null
    if (vendorName !== '') {
      const link = vendorItemsForSku(sku).find((v) => norm(vendorNameFor(v.vendorId)) === norm(vendorName))
      if (!link) return reject('Vendor is not listed for this product')
      vendorId = link.vendorId
    }

    const cur = buildRow(sku, wh.id)
    const resolved = {
      warehouseId: wh.id,
      safetyDays: safety === '' ? null : Number(safety),
      reorderPoint: rop === '' ? null : Number(rop),
      vendorId,
    }
    const changes =
      (resolved.safetyDays !== null && resolved.safetyDays !== cur.safetyDays)
      || (resolved.reorderPoint !== null && resolved.reorderPoint !== cur.reorderPoint)
      || (resolved.vendorId !== null && resolved.vendorId !== (cur.vendor?.id ?? null))
    return { ...base, error: '', outcome: changes ? 'update' : 'unchanged', resolved }
  })
}

/** Apply the rows that will change something. Returns how many were written. */
export function applySettingsImport(rows: SettingsImportRow[]): number {
  let written = 0
  for (const r of rows) {
    if (r.outcome !== 'update' || !r.resolved) continue
    const { warehouseId, safetyDays, reorderPoint, vendorId } = r.resolved
    const cur: WorklistRow = buildRow(r.sku, warehouseId)

    const patch: { safetyDays?: number; reorderPoint?: number } = {}
    if (safetyDays !== null) {
      // Equal to what the warehouse inherits → no override, so it keeps following the category.
      patch.safetyDays = safetyDays === inheritedSafetyDays(r.sku, warehouseId) ? undefined : safetyDays
    }
    if (reorderPoint !== null) {
      patch.reorderPoint = cur.calculatedReorderPoint !== null && reorderPoint === cur.calculatedReorderPoint
        ? undefined
        : reorderPoint
    }
    if (safetyDays !== null || reorderPoint !== null) saveSkuWarehouseOverride(r.sku, warehouseId, patch)

    if (vendorId !== null) {
      if (vendorId === (preferredVendorItem(r.sku)?.vendorId ?? null)) clearPreferredVendorForWarehouse(r.sku, warehouseId)
      else setPreferredVendor(r.sku, vendorId, warehouseId)
    }
    written++
  }
  invalidateReplenishmentCaches()
  return written
}
