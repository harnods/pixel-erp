/**
 * Bulk import of per-warehouse replenishment settings (PRD US-021 AC-02, US-008 EH-01).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { parseCsv, toCsv } from '~/utils/csv'
import {
  settingsTemplate, hasSettingsColumns, validateSettingsImport, applySettingsImport,
  SETTINGS_IMPORT_HEADER,
} from '~/data/replenishmentSettingsImport'
import { buildRow, invalidateReplenishmentCaches } from '~/data/replenishment'
import { clearSkuWarehouseOverride } from '~/data/replenishmentSettings'
import { vendorItemsForSku, vendorNameFor, clearPreferredVendorForWarehouse, preferredVendorItem } from '~/data/vendorItems'

describe('parseCsv', () => {
  it('round-trips toCsv, including quotes, commas and newlines', () => {
    const rows = [['a', 'b,c', 'say "hi"'], ['line\nbreak', '', '3']]
    expect(parseCsv(toCsv(rows))).toEqual(rows)
  })
  it('handles CRLF, a BOM and a trailing blank line', () => {
    expect(parseCsv('\uFEFFx,y\r\n1,2\r\n\r\n')).toEqual([['x', 'y'], ['1', '2']])
  })
})

describe('settings import', () => {
  const touched: { sku: string; wh: string }[] = []
  afterEach(() => {
    for (const { sku, wh } of touched) {
      clearSkuWarehouseOverride(sku, wh)
      clearPreferredVendorForWarehouse(sku, wh)
    }
    touched.length = 0
    invalidateReplenishmentCaches()
  })

  it('the template carries the header and one row per product × warehouse', () => {
    const t = settingsTemplate()
    expect(t[0]).toEqual([...SETTINGS_IMPORT_HEADER])
    expect(t.length).toBeGreaterThan(10)
    expect(hasSettingsColumns(t[0] as string[])).toBe(true)
    expect(hasSettingsColumns(['Product code', 'Warehouse'])).toBe(false)
  })

  it('an unchanged template changes nothing', () => {
    const rows = validateSettingsImport(settingsTemplate().map((r) => r.map(String)))
    expect(rows.every((r) => r.outcome === 'unchanged')).toBe(true)
    expect(applySettingsImport(rows)).toBe(0)
  })

  it('rejects bad rows with a reason and still applies the good ones', () => {
    const t = settingsTemplate().map((r) => r.map(String))
    const [h, a, b, c, d, e] = t as [string[], string[], string[], string[], string[], string[]]
    const sheet = [
      h,
      [...a.slice(0, 3), '', '', ''],                       // blank values → unchanged
      ['NOPE', 'x', b[2]!, '5', '', ''],                    // unknown product
      [c[0]!, c[1]!, 'No Such Warehouse', '5', '', ''],     // unknown warehouse
      [d[0]!, d[1]!, d[2]!, '0', '', ''],                   // safety days below 1
      [e[0]!, e[1]!, e[2]!, '', '-3', ''],                  // negative reorder point
      [a[0]!, a[1]!, a[2]!, '', '', ''],                    // repeats the first row
    ]
    const rows = validateSettingsImport(sheet)
    expect(rows[0]!.outcome).toBe('unchanged')
    expect(rows[1]!.error).toMatch(/Product code not found/)
    expect(rows[2]!.error).toMatch(/Warehouse not found/)
    expect(rows[3]!.error).toMatch(/Safety days/)
    expect(rows[4]!.error).toMatch(/Reorder point/)
    expect(rows[5]!.error).toMatch(/repeats/)
    expect(rows.filter((r) => r.outcome === 'rejected').map((r) => r.rowNumber)).toEqual([3, 4, 5, 6, 7])
  })

  it('applies a changed safety day, reorder point and a different preferred vendor', () => {
    const t = settingsTemplate().map((r) => r.map(String))
    // A product with two linked vendors.
    const target = t.slice(1).find((r) => vendorItemsForSku(r[0]!).length >= 2)!
    const sku = target[0]!
    const whName = target[2]!
    const links = vendorItemsForSku(sku)
    const def = preferredVendorItem(sku)!
    const other = links.find((l) => l.vendorId !== def.vendorId)!
    const sheet = [t[0]!, [sku, target[1]!, whName, String(Number(target[3]) + 3), String(Number(target[4]) + 11), vendorNameFor(other.vendorId)]]
    const rows = validateSettingsImport(sheet)
    expect(rows[0]!.outcome).toBe('update')
    const wh = rows[0]!.resolved!.warehouseId
    touched.push({ sku, wh })
    expect(applySettingsImport(rows)).toBe(1)
    const after = buildRow(sku, wh)
    expect(after.safetyDays).toBe(Number(target[3]) + 3)
    expect(after.reorderPoint).toBe(Number(target[4]) + 11)
    expect(after.vendor?.id).toBe(other.vendorId)
  })

  it('a vendor that is not listed for the product is rejected', () => {
    const t = settingsTemplate().map((r) => r.map(String))
    const row = t[1]!
    const linked = new Set(vendorItemsForSku(row[0]!).map((v) => v.vendorId))
    const stranger = ['Toraja Sapan Estate', 'Klasik Beans Cooperative', 'Sagaleh Coffee Supply'].find((n) => {
      return ![...linked].some((id) => vendorNameFor(id) === n)
    })!
    const rows = validateSettingsImport([t[0]!, [row[0]!, row[1]!, row[2]!, '', '', stranger]])
    expect(rows[0]!.error).toMatch(/not listed/)
  })
})
