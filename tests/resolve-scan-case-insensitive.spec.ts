// @vitest-environment happy-dom
/**
 * A physical barcode carries no case — scanning (or manually typing) a code in
 * different letter-casing than what's stored must still resolve correctly.
 * resolveScan() is the shared foundation half of the app's scan flows are
 * built on (picking, packing, and every drawer's SKU-mismatch check) — if it
 * regresses, everything downstream regresses with it.
 */
import { describe, it, expect } from 'vitest'
import { resolveScan, sameCode, includesCode } from '~/utils/scan'
import { getWarehouseDetail } from '~/data/warehouseDetails'

const WAREHOUSE_ID = 'wh-006'

describe('sameCode / includesCode', () => {
  it('ignores case and surrounding whitespace', () => {
    expect(sameCode('Bin 01', 'bin 01')).toBe(true)
    expect(sameCode('Bin 01', '  BIN 01  ')).toBe(true)
    expect(sameCode('Bin 01', 'Bin 02')).toBe(false)
  })
  it('includesCode matches regardless of case', () => {
    expect(includesCode(['Bin 01', 'Bin 02'], 'bin 02')).toBe(true)
    expect(includesCode(['Bin 01', 'Bin 02'], 'bin 03')).toBe(false)
  })
})

describe('resolveScan — case-insensitive against real warehouse stock', () => {
  it('resolves a SKU scanned with incidental surrounding whitespace (SKU codes in this catalog are numeric, so case itself never varies)', () => {
    const stock = getWarehouseDetail(WAREHOUSE_ID)!.stock
    const item = stock[0]!
    const resolved = resolveScan(WAREHOUSE_ID, `  ${item.sku}  `)
    expect(resolved?.kind).toBe('sku')
    expect(resolved?.sku).toBe(item.sku)
  })

  it('resolves a batch number scanned in a different case', () => {
    const stock = getWarehouseDetail(WAREHOUSE_ID)!.stock
    const item = stock.find(s => (s.batches?.length ?? 0) > 0)!
    const batch = item.batches![0]!
    const scannedDifferentCase = batch.batchNo.toUpperCase() === batch.batchNo ? batch.batchNo.toLowerCase() : batch.batchNo.toUpperCase()
    const resolved = resolveScan(WAREHOUSE_ID, `  ${scannedDifferentCase}  `) // whitespace too
    expect(resolved?.kind).toBe('batch')
    expect(resolved?.sku).toBe(item.sku)
    expect(resolved?.batchNo).toBe(batch.batchNo) // canonical casing
  })

  it('resolves a serial number scanned with incidental surrounding whitespace (also numeric-only in this seed data — sameCode covers both cases the same way regardless)', () => {
    const stock = getWarehouseDetail(WAREHOUSE_ID)!.stock
    const item = stock.find(s => (s.serials?.available.length ?? 0) > 0)!
    const unit = item.serials!.available[0]!
    const resolved = resolveScan(WAREHOUSE_ID, `  ${unit.serial}  `)
    expect(resolved?.kind).toBe('serial')
    expect(resolved?.sku).toBe(item.sku)
    expect(resolved?.serial).toBe(unit.serial)
  })

  it('still returns null for a genuinely unknown code, regardless of case', () => {
    expect(resolveScan(WAREHOUSE_ID, 'TOTALLY-UNKNOWN-CODE-XYZ')).toBeNull()
  })
})
