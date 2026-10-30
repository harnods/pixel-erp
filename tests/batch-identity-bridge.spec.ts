/**
 * Batch identity bridge (ATINV-9082 §5.1): a warehouse lot and a product batch record
 * with the same SKU + number are ONE batch. Data modules keep module-level reactive
 * state, so each test re-imports a fresh copy.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

async function load() {
  vi.resetModules()
  const details = await import('~/data/productDetails')
  const store = await import('~/data/batchStore')
  const attrs = await import('~/data/batchAttributes')
  return { ...details, ...store, ...attrs }
}
type Api = Awaited<ReturnType<typeof load>>
let api: Api
beforeEach(async () => { api = await load() })

const lotRecords = (sku: string) => api.batchRecordsForSku(sku).filter((r) => r.id.startsWith(`${sku}::seed-lot-`))

describe('findProductBatch / batchAttributesFor', () => {
  it('finds a product batch by number, case-insensitively', () => {
    const b = api.getProductBatches('1001')[0]!
    expect(api.findProductBatch('1001', b.batchNo.toUpperCase())?.id).toBe(b.id)
    expect(api.findProductBatch('1001', `  ${b.batchNo.toLowerCase()} `)?.id).toBe(b.id)
    expect(api.findProductBatch('1001', 'Batch #99999')).toBeUndefined()
    expect(api.findProductBatch('1001', api.UNASSIGNED_BATCH_NO)).toBeUndefined()
  })

  it('falls back to lot expiry for an unknown lot', () => {
    expect(api.batchAttributesFor('1001', 'Batch #99999', '2027-01-31')).toEqual({ expiry_date: '2027-01-31' })
    expect(api.batchAttributesFor('1001', 'Batch #99999')).toEqual({})
  })

  it("returns the record's attributes when the batch exists", () => {
    const b = api.getProductBatches('1001')[0]!
    expect(api.batchAttributesFor('1001', b.batchNo, '1999-01-01')).toEqual(b.attributes)
  })
})

describe('ensureProductBatch', () => {
  it('creates once and returns the same record after', () => {
    const a = api.ensureProductBatch('1001', 'Batch #77777', { expiry_date: '2027-03-31' })
    const b = api.ensureProductBatch('1001', 'batch #77777', { expiry_date: '2030-01-01' })
    expect(b.id).toBe(a.id)
    expect(a.attributes.expiry_date).toBe('2027-03-31')
    expect(api.getProductBatches('1001').some((x) => x.id === a.id)).toBe(true)
  })

  it('skips required checks', () => {
    // 1001 requires Vendor; the lot physically exists without one.
    expect(api.getBatchAttributeConfig('1001').find((a) => a.key === 'supplier')?.required).toBe(true)
    expect(() => api.ensureProductBatch('1001', 'Batch #77778', {})).not.toThrow()
  })

  it('rejects Unassigned and a product that is not batch-tracked', () => {
    expect(() => api.ensureProductBatch('1001', 'Unassigned', {})).toThrow()
    const untracked = '9999'
    expect(() => api.ensureProductBatch(untracked, 'Batch #1', {})).toThrow()
  })
})

describe('fillEmptyBatchAttributes', () => {
  it('never overwrites', () => {
    const made = api.createBatch('1001', { batchNo: 'Batch #88001', attributes: { supplier: 'V003' } })
    expect(made.ok).toBe(true)
    const id = made.ok ? made.value.id : ''
    const filled = api.fillEmptyBatchAttributes('1001', id, { supplier: 'V001', grade: 'grade-a' })
    expect(filled.attributes.supplier).toBe('V003')
    expect(filled.attributes.grade).toBe('grade-a')
  })

  it('ignores keys outside the product set and logs activity', () => {
    const lot = api.ensureProductBatch('1002', 'Batch #88002', { expiry_date: '2027-05-31' })
    const out = api.fillEmptyBatchAttributes('1002', lot.id, { supplier: 'V001', grade: 'grade-b' })
    expect(out.attributes.supplier).toBeUndefined() // 1002 has no Vendor
    expect(out.attributes.grade).toBe('grade-b')
    expect(api.batchActivityFor(lot.id)[0]?.action).toBe('updated')
  })

  it('throws for the Unassigned batch', () => {
    const un = api.getProductBatches('1001').find((b) => b.isUnassigned)!
    expect(() => api.fillEmptyBatchAttributes('1001', un.id, { grade: 'grade-a' })).toThrow()
  })
})

describe('seeded lot records', () => {
  it('seeds lot records with required values except the first lot per SKU', () => {
    for (const sku of ['1001', '1002', '1101']) {
      const recs = lotRecords(sku)
      expect(recs.length, sku).toBeGreaterThan(0)
      const required = api.getBatchAttributeConfig(sku).filter((a) => a.required && a.key !== 'expiry_date')
      recs.forEach((r, i) => {
        const batch = api.findProductBatch(sku, r.batchNo!)!
        expect(batch.attributes.expiry_date, `${sku} ${r.batchNo}`).toBeTruthy()
        for (const a of required) {
          if (i === 0) expect(batch.attributes[a.key], `${sku} first lot`).toBeUndefined()
          else expect(batch.attributes[a.key], `${sku} ${r.batchNo} ${a.key}`).toBeTruthy()
        }
      })
    }
  })

  it('matches warehouse lot numbers and expiries', () => {
    const r = lotRecords('1001')[0]!
    expect(r.batchNo).toMatch(/^Batch #\d{5}$/)
    expect(api.getBatchDetail('1001', r.batchNo!)?.id).toBe(r.id)
  })

  it('rotates vendors and grades across the later lots', () => {
    const vendors = lotRecords('1001').slice(1).map((r) => r.attributes?.supplier)
    expect(vendors.every((v) => ['V001', 'V002', 'V003'].includes(v!))).toBe(true)
  })
})
