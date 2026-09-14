/**
 * Batches on a purchase delivery (app/data/purchaseDeliveryBatches.ts — Batch
 * Attribute PRD story 10). Seeds: 1001 uses Vendor (required), Grade, Expiry; its
 * Batch #001 is from V003, #002 from V001, #003/#004 have no vendor. 1002 doesn't use
 * Vendor (Expiry required, Grade).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

async function load() {
  vi.resetModules()
  const lines = await import('~/data/purchaseDeliveryBatches')
  const details = await import('~/data/productDetails')
  return { ...lines, ...details }
}
type Api = Awaited<ReturnType<typeof load>>
let api: Api
beforeEach(async () => { api = await load() })

const batchId = (sku: string, batchNo: string) => api.getProductBatches(sku).find((b) => b.batchNo === batchNo)!.id
const newRow = (key: string, batchNo: string, qty: number, attributes: Record<string, string> = {}, vendorEdited = false) =>
  ({ key, batchNo, qty, attributes, vendorEdited })
const existing = (sku: string, key: string, batchNo: string, qty: number) =>
  ({ key, batchId: batchId(sku, batchNo), batchNo, qty })

describe('rule 1 — a new batch follows the delivery vendor', () => {
  it('sets the vendor on new batches, except ones the user changed, and never on existing ones', () => {
    const rows = api.followDeliveryVendor('1001', [
      newRow('a', 'B-NEW-1', 1, { supplier: 'V001' }),
      newRow('b', 'B-NEW-2', 1, { supplier: 'V004' }, true),
      existing('1001', 'c', 'Batch #001', 1),
    ], 'V002')
    expect(rows.map((r) => r.attributes?.supplier)).toEqual(['V002', 'V004', undefined])
  })

  it('leaves products without the Vendor attribute alone', () => {
    const rows = api.followDeliveryVendor('1002', [newRow('a', 'B-NEW-1', 1)], 'V002')
    expect(rows[0]!.attributes?.supplier).toBeUndefined()
  })
})

describe('rule 2 — existing batches from another vendor', () => {
  it('lists every mismatching batch; same-vendor, vendor-less and non-Vendor products are not listed', () => {
    const mismatches = api.deliveryVendorMismatches([
      { sku: '1001', productName: 'Gayo', qty: 3, batches: [
        existing('1001', 'a', 'Batch #001', 1),
        existing('1001', 'b', 'Batch #002', 1),
        existing('1001', 'c', 'Batch #003', 1),
      ] },
      { sku: '1002', productName: 'Other', qty: 1, batches: [existing('1002', 'd', 'Batch #001', 1)] },
    ], 'V001')
    expect(mismatches).toEqual([{ sku: '1001', productName: 'Gayo', batchNo: 'Batch #001', vendorName: 'Gayo Highland Exporters' }])
  })
})

describe('checking a line', () => {
  it('needs batch qty to add up to the line qty, each row above 0', () => {
    const check = api.checkDeliveryBatches({ sku: '1001', productName: 'Gayo', qty: 10, batches: [
      existing('1001', 'a', 'Batch #002', 4),
      existing('1001', 'b', 'Batch #003', 0),
    ] })
    expect(check.qtyMismatch).toBe(true)
    expect(check.qtyInvalid).toEqual(['b'])
    expect(api.deliveryBatchCheckOk(check)).toBe(false)
  })

  it('applies createBatch rules to new rows, incl. numbers claimed elsewhere on the delivery', () => {
    const check = api.checkDeliveryBatches({ sku: '1002', productName: 'Other', qty: 4, batches: [
      newRow('a', '', 1, { expiry_date: '2027-01-31' }),
      newRow('b', 'Batch #001', 1, { expiry_date: '2027-01-31' }),
      newRow('c', 'LOT-9', 1),
      newRow('d', 'LOT-7', 1, { expiry_date: '2027-01-31' }),
    ] }, ['lot-7'])
    const codes = (key: string) => (check.rowErrors[key] ?? []).map((e) => `${e.field}:${e.code}`)
    expect(codes('a')).toEqual(['batchNo:required'])
    expect(codes('b')).toEqual(['batchNo:taken'])
    expect(codes('c')).toEqual(['expiry_date:required'])
    expect(codes('d')).toEqual(['batchNo:taken'])
    expect(check.qtyMismatch).toBe(false)
  })

  it('flags the same existing batch picked twice', () => {
    const check = api.checkDeliveryBatches({ sku: '1001', productName: 'Gayo', qty: 2, batches: [
      existing('1001', 'a', 'Batch #002', 1),
      existing('1001', 'b', 'Batch #002', 1),
    ] })
    expect(check.duplicateBatch).toEqual(['b'])
  })
})

describe('saving', () => {
  it('creates new batches with their vendor, fills vendor-less batches, and keeps other vendors', () => {
    const result = api.commitDeliveryBatches({ sku: '1001', productName: 'Gayo', qty: 6, batches: [
      newRow('a', 'PO-LOT-1', 2, { supplier: 'V001' }),
      existing('1001', 'b', 'Batch #003', 2),
      existing('1001', 'c', 'Batch #001', 2),
    ] }, 'V001')

    expect(result.ok).toBe(true)
    const batches = api.getProductBatches('1001')
    expect(batches.find((b) => b.batchNo === 'PO-LOT-1')?.attributes.supplier).toBe('V001')
    expect(batches.find((b) => b.batchNo === 'Batch #003')?.attributes.supplier).toBe('V001')
    expect(batches.find((b) => b.batchNo === 'Batch #001')?.attributes.supplier).toBe('V003')
    if (result.ok) expect(result.batches.map((b) => [b.batchNo, b.qty])).toEqual([['PO-LOT-1', 2], ['Batch #003', 2], ['Batch #001', 2]])
  })
})
