/** Stock in saves its batch lines and writes the batch master (ATINV-9082, story 17). */
import { describe, it, expect, beforeEach, vi } from 'vitest'

async function load() {
  vi.resetModules()
  return { ...(await import('~/data/stockAdjustments')), ...(await import('~/data/productDetails')) }
}
let api: Awaited<ReturnType<typeof load>>
beforeEach(async () => { api = await load() })

const base = { kind: 'in-out' as const, date: '2026-10-28', warehouseId: 'wh-006', warehouseName: 'Gudang Makassar Selatan', category: 'General' as const, tags: [] as string[] }

describe('addAdjustment with batches', () => {
  it('a stock-in adjustment stores its batch lines and creates the batches', () => {
    const adj = api.addAdjustment({ ...base, lines: [{ sku: '1001', qty: 5, batches: [{ batchNo: 'SI-1', qty: 5, attributes: { supplier: 'V002' } }] }] })
    expect(api.getAdjustment(adj.id)!.lines![0]!.batches![0]!.attributes.supplier).toBe('V002')
    expect(api.findProductBatch('1001', 'SI-1')?.attributes.supplier).toBe('V002')
  })

  it('a batch line keeps its description, and a new batch is created with it', () => {
    const adj = api.addAdjustment({ ...base, lines: [{ sku: '1001', qty: 2, batches: [{ batchNo: 'SI-DESC', qty: 2, description: 'North dock lot', attributes: { supplier: 'V002' } }] }] })
    expect(api.getAdjustment(adj.id)!.lines![0]!.batches![0]!.description).toBe('North dock lot')
    expect(api.findProductBatch('1001', 'SI-DESC')?.description).toBe('North dock lot')
  })

  it('never overwrites an existing batch attribute', () => {
    api.addAdjustment({ ...base, lines: [{ sku: '1001', qty: 1, batches: [{ batchNo: 'Batch #001', qty: 1, attributes: { supplier: 'V002' } }] }] })
    expect(api.findProductBatch('1001', 'Batch #001')!.attributes.supplier).toBe('V003')
  })

  it('a line the batch master rejects does not stop the adjustment from saving', () => {
    const adj = api.addAdjustment({ ...base, lines: [
      { sku: '1001', qty: 1, batches: [{ batchNo: 'SI-BADDATE', qty: 1, attributes: { expiry_date: '2027-02-31' } }] },
      { sku: '1001', qty: 2, batches: [{ batchNo: 'SI-OK', qty: 2, attributes: { supplier: 'V002' } }] },
    ] })
    expect(api.getAdjustment(adj.id)).toBeDefined()
    expect(api.findProductBatch('1001', 'SI-OK')?.attributes.supplier).toBe('V002')
  })
})
