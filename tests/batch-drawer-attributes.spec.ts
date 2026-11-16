/**
 * Receiving vs issuing batch attribute rules for drawers (ATINV-9082, spec §5.1).
 * Seeds: 1001 uses Vendor (required), Grade, Expiry; Batch #001 is from V003.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

async function load() {
  vi.resetModules()
  const rules = await import('~/data/batchDrawerAttributes')
  const details = await import('~/data/productDetails')
  return { ...rules, ...details }
}
let api: Awaited<ReturnType<typeof load>>
beforeEach(async () => { api = await load() })

const row = (batchNo: string, attributes: Record<string, string> = {}) => ({ batchNo, attributes })

describe('drawerModeFor', () => {
  it('maps kinds to receiving / issuing / null', () => {
    for (const k of ['in-out', 'receiving', 'purchase-delivery'] as const) expect(api.drawerModeFor(k)).toBe('receiving')
    for (const k of ['transfer', 'put-away', 'picking'] as const) expect(api.drawerModeFor(k)).toBe('issuing')
    expect(api.drawerModeFor('count')).toBeNull()
  })
})

describe('checkDrawerBatches', () => {
  it('issuing mode never returns required errors', () => {
    const r = api.checkDrawerBatches('1001', 'issuing', [row('Batch #003')])
    expect(r.errors.filter((e) => e.code === 'required')).toEqual([])
  })

  it('receiving: a new batch with an empty required attribute gets a required error', () => {
    const r = api.checkDrawerBatches('1001', 'receiving', [row('NEW-1')])
    expect(r.errors).toContainEqual({ index: 0, code: 'required', key: 'supplier' })
    expect(r.rows[0]!.existing).toBeUndefined()
  })

  it('receiving: a filled required attribute, in the input or on the existing batch, clears the error', () => {
    expect(api.checkDrawerBatches('1001', 'receiving', [row('NEW-1', { supplier: 'V001' })]).errors
      .filter((e) => e.key === 'supplier')).toEqual([])
    const r = api.checkDrawerBatches('1001', 'receiving', [row('Batch #001')])
    expect(r.errors.filter((e) => e.key === 'supplier')).toEqual([])
    expect(r.rows[0]!.existing?.batchNo).toBe('Batch #001')
  })

  it('receiving: an existing batch with an empty required attribute needs it filled', () => {
    expect(api.checkDrawerBatches('1001', 'receiving', [row('Batch #003')]).errors)
      .toContainEqual({ index: 0, code: 'required', key: 'supplier' })
    expect(api.checkDrawerBatches('1001', 'receiving', [row('Batch #003', { supplier: 'V001' })]).errors
      .filter((e) => e.key === 'supplier')).toEqual([])
  })

  it('treats the Unassigned batch as exempt, in any case, in both modes', () => {
    for (const mode of ['receiving', 'issuing'] as const) {
      const r = api.checkDrawerBatches('1001', mode, [row('unassigned')])
      expect(r.errors).toEqual([])
      expect(r.rows[0]!.isUnassigned).toBe(true)
    }
  })

  it('flags two new rows with the same number', () => {
    const r = api.checkDrawerBatches('1001', 'issuing', [row('DUP-1'), row('DUP-1')])
    expect(r.errors.filter((e) => e.code === 'duplicate-new').map((e) => e.index)).toEqual([0, 1])
  })

  it('flags two new rows with the same number in different case', () => {
    const r = api.checkDrawerBatches('1001', 'receiving', [row('DUP-1', { supplier: 'V001' }), row(' dup-1 ', { supplier: 'V001' })])
    expect(r.errors.filter((e) => e.code === 'duplicate-new').map((e) => e.index)).toEqual([0, 1])
  })

  it('two rows of the same existing batch are not duplicate-new', () => {
    const r = api.checkDrawerBatches('1001', 'receiving', [row('Batch #001'), row('batch #001')])
    expect(r.errors.filter((e) => e.code === 'duplicate-new')).toEqual([])
  })

  it('flags a blank new batch number as batch-no, and does not double-report required errors', () => {
    const r = api.checkDrawerBatches('1001', 'receiving', [row('  ')])
    expect(r.errors.filter((e) => e.code === 'batch-no')).toEqual([{ index: 0, code: 'batch-no' }])
    expect(r.errors.filter((e) => e.code === 'required')).toHaveLength(1)
  })

  it('treats a number that exists only as a product record as existing, not duplicate', () => {
    const created = api.createBatch('1001', { batchNo: 'R-1', attributes: { supplier: 'V001' } })
    expect(created.ok).toBe(true)
    const r = api.checkDrawerBatches('1001', 'receiving', [row('r-1')])
    expect(r.errors).toEqual([])
    expect(r.rows[0]!.existing!.id).toBe((created as any).value.id)
  })
})

describe('vendorMismatches', () => {
  it('lists existing batches whose vendor differs, skipping empty vendors and new rows', () => {
    const out = api.vendorMismatches('1001', 'V001', [
      row('Batch #001'), // V003
      row('Batch #002'), // V001
      row('Batch #003'), // none
      row('NEW-1'),
    ])
    expect(out).toEqual([{ batchNo: 'Batch #001', batchVendorId: 'V003' }])
  })
})
