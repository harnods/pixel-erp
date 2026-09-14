/**
 * Batch Attribute — data foundation (plan Phase 0, docs/prd/batch-attribute-plan.md).
 *
 * Covers the rules the UI phases will lean on without re-checking them:
 *   • the per-product attribute set (1–3, no duplicates, Expiry fallback)
 *   • expiry values at day OR month precision (PM answer A2)
 *   • the Grade List (auto rank, 1–10 active, soft delete blocked while used)
 *   • batches: stable ids, the Unassigned batch (A5), create/update validation,
 *     renames locked once a batch has movements (A9), attributes purged on save
 *     after the product's set changed (story 7)
 *
 * Every data module keeps module-level reactive state, so each test re-imports a
 * fresh copy (vi.resetModules) instead of undoing its writes by hand.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

async function load() {
  vi.resetModules()
  const attrs = await import('~/data/batchAttributes')
  const grades = await import('~/data/grades')
  const store = await import('~/data/batchStore')
  const details = await import('~/data/productDetails')
  const custom = await import('~/data/customProducts')
  return { ...attrs, ...grades, ...store, ...details, ...custom }
}
type Api = Awaited<ReturnType<typeof load>>
let api: Api
beforeEach(async () => { api = await load() })

function codes(result: { ok: boolean; errors?: { code: string; field?: string }[] }) {
  return result.ok ? [] : result.errors!.map((e) => (e.field ? `${e.field}:${e.code}` : e.code))
}

describe('batch attribute set per product', () => {
  it('defaults to Expiry date, not required, for a product with no selection', () => {
    expect(api.getBatchAttributeConfig('1005')).toEqual([{ key: 'expiry_date', required: false }])
  })

  it('accepts up to 3 distinct catalog attributes, in the order given', () => {
    const r = api.setBatchAttributeConfig('1005', [
      { key: 'grade', required: true }, { key: 'supplier' }, { key: 'expiry_date' },
    ])
    expect(r.ok).toBe(true)
    expect(api.getBatchAttributeConfig('1005')).toEqual([
      { key: 'grade', required: true }, { key: 'supplier', required: false }, { key: 'expiry_date', required: false },
    ])
  })

  it('rejects more than 3, duplicates and unknown keys — and leaves the set unchanged', () => {
    expect(codes(api.setBatchAttributeConfig('1005', [
      { key: 'expiry_date' }, { key: 'supplier' }, { key: 'grade' }, { key: 'best_before_date' },
    ]))).toEqual(['too-many'])
    expect(codes(api.setBatchAttributeConfig('1005', [{ key: 'grade' }, { key: 'grade' }]))).toEqual(['duplicate'])
    expect(codes(api.setBatchAttributeConfig('1005', [{ key: 'colour' }]))).toEqual(['unknown-key'])
    expect(api.getBatchAttributeConfig('1005')).toEqual([{ key: 'expiry_date', required: false }])
  })

  it('falls back to Expiry date when a product would end up with no attributes', () => {
    api.setBatchAttributeConfig('1001', [])
    expect(api.getBatchAttributeConfig('1001')).toEqual([{ key: 'expiry_date', required: false }])
  })

  it('logs each change with before/after, records failed attempts, and skips no-op saves', () => {
    // Saving what the product already has (the Expiry default) is not a change.
    api.setBatchAttributeConfig('1005', [{ key: 'expiry_date' }])
    expect(api.batchAttributeConfigActivity('1005')).toEqual([])

    api.setBatchAttributeConfig('1005', [{ key: 'grade', required: true }, { key: 'expiry_date' }])
    api.setBatchAttributeConfig('1005', [{ key: 'grade' }, { key: 'grade' }])

    const [failed, changed, ...rest] = api.batchAttributeConfigActivity('1005')
    expect(rest).toEqual([])
    expect(failed).toMatchObject({ outcome: 'failed', errors: ['duplicate'] })
    expect(changed).toMatchObject({
      outcome: 'success',
      previous: [{ key: 'expiry_date', required: false }],
      next: [{ key: 'grade', required: true }, { key: 'expiry_date', required: false }],
    })
    // Other products' logs are untouched.
    expect(api.batchAttributeConfigActivity('1001')).toEqual([])
  })

  it('treats a required-flag or order change as a change', () => {
    expect(api.sameBatchAttributeConfig(
      [{ key: 'expiry_date', required: false }, { key: 'grade', required: false }],
      [{ key: 'grade', required: false }, { key: 'expiry_date', required: false }],
    )).toBe(false)
    expect(api.sameBatchAttributeConfig(
      [{ key: 'expiry_date', required: false }],
      [{ key: 'expiry_date', required: true }],
    )).toBe(false)
  })
})

describe('expiry values (day or month precision)', () => {
  it('reads precision from the value', () => {
    expect(api.expiryPrecision('2027-02-28')).toBe('day')
    expect(api.expiryPrecision('2027-02')).toBe('month')
    expect(api.expiryPrecision('2027-02-30')).toBeNull()
    expect(api.expiryPrecision('2027-13')).toBeNull()
    expect(api.expiryPrecision('')).toBeNull()
  })

  it('only Expiry date accepts a month; the other dates need a day', () => {
    expect(api.isValidAttributeDate('expiry_date', '2027-02')).toBe(true)
    expect(api.isValidAttributeDate('manufacturing_date', '2027-02')).toBe(false)
    expect(api.isValidAttributeDate('best_before_date', '2027-02-10')).toBe(true)
  })

  it('a month expiry is good through the last day of that month', () => {
    expect(api.expiryEffectiveDate('2027-02')).toBe('2027-02-28')
    expect(api.expiryEffectiveDate('2028-02')).toBe('2028-02-29')
    expect(api.expiryEffectiveDate('2027-02-10')).toBe('2027-02-10')
    expect(api.expiryEffectiveDate(undefined)).toBe('')
  })

  it('formats at the value’s own precision', () => {
    expect(api.formatExpiry('2027-02')).toBe('02/2027')
    expect(api.formatExpiry('2027-02', 'long')).toBe('Feb 2027')
    expect(api.formatExpiry(undefined)).toBe('—')
  })
})

describe('grade list', () => {
  it('is seeded with A, B, C ranked 1–3, all active', () => {
    expect(api.grades().map((g) => [g.name, g.rank, g.status])).toEqual([
      ['A', 1, 'active'], ['B', 2, 'active'], ['C', 3, 'active'],
    ])
  })

  it('assigns the next rank past every grade ever created, inactive and deleted included', () => {
    const d = api.createGrade({ name: 'D' })
    expect(d.ok && d.value.rank).toBe(4)
    api.setGradeStatus(d.ok ? d.value.id : '', 'inactive')
    const e = api.createGrade({ name: 'E' })
    expect(e.ok && e.value.rank).toBe(5)
    api.deleteGrade(e.ok ? e.value.id : '')
    const f = api.createGrade({ name: 'F' })
    expect(f.ok && f.value.rank).toBe(6)
  })

  it('keeps names unique case-insensitively, inactive grades included, and enforces lengths', () => {
    const d = api.createGrade({ name: 'Premium' })
    api.setGradeStatus(d.ok ? d.value.id : '', 'inactive')
    expect(codes(api.createGrade({ name: '  premium ' }))).toEqual(['name:name-taken'])
    expect(codes(api.createGrade({ name: '   ' }))).toEqual(['name:name-required'])
    expect(codes(api.createGrade({ name: 'x'.repeat(51) }))).toEqual(['name:name-too-long'])
    expect(codes(api.createGrade({ name: 'G', description: 'x'.repeat(257) }))).toEqual(['description:description-too-long'])
    expect(api.createGrade({ name: 'x'.repeat(50), description: 'x'.repeat(256) }).ok).toBe(true)
  })

  it('caps the list at 10 active grades, for create and for re-activation', () => {
    for (let i = 4; i <= 10; i++) expect(api.createGrade({ name: `G${i}` }).ok).toBe(true)
    expect(codes(api.createGrade({ name: 'G11' }))).toEqual(['max-active'])

    const c = api.gradeByName('C')!
    api.setGradeStatus(c.id, 'inactive')
    expect(api.createGrade({ name: 'G11' }).ok).toBe(true)
    expect(codes(api.setGradeStatus(c.id, 'active'))).toEqual(['max-active'])
  })

  it('always keeps at least one active grade', () => {
    const d = api.createGrade({ name: 'D' })
    const dId = d.ok ? d.value.id : ''
    for (const name of ['A', 'B', 'C']) expect(api.setGradeStatus(api.gradeByName(name)!.id, 'inactive').ok).toBe(true)
    expect(codes(api.setGradeStatus(dId, 'inactive'))).toEqual(['last-active'])
    expect(codes(api.deleteGrade(dId))).toEqual(['last-active'])
  })

  it('blocks deleting a grade a batch still uses, reporting how many', () => {
    const r = api.deleteGrade(api.SEED_GRADE_IDS.A)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.errors).toEqual([{ code: 'in-use', count: 1 }])
    expect(api.deleteGrade(api.SEED_GRADE_IDS.C).ok).toBe(true)
    expect(api.grades().map((g) => g.name)).toEqual(['A', 'B'])
  })

  it('renaming a grade shows the new name on batches that already hold it', () => {
    api.updateGrade(api.SEED_GRADE_IDS.A, { name: 'A+' })
    const seed0 = api.getProductBatches('1001').find((b) => b.id === '1001::seed-0')!
    expect(api.gradeById(seed0.attributes.grade!)?.name).toBe('A+')
  })

  it('records failed actions in the activity log too', () => {
    api.createGrade({ name: 'a' })
    const [latest] = api.gradeActivity()
    expect(latest!.activity).toBe('Failed to create grade')
    expect(latest!.details.find((d) => d.label === 'Result')?.value).toMatch(/^Failed — Name is already used/)
  })

  it('keeps each grade’s own activity, failed attempts included', () => {
    const d = api.createGrade({ name: 'D' })
    const dId = d.ok ? d.value.id : ''
    api.updateGrade(dId, { name: 'B' }) // fails: name taken
    api.updateGrade(dId, { description: 'Moisture under 12%' })
    api.createGrade({ name: 'd' }) // fails: no grade exists yet, so it belongs to none

    expect(api.gradeActivityFor(dId).map((e) => e.activity)).toEqual([
      'Updated grade', 'Failed to update grade', 'Created grade',
    ])
    expect(api.gradeActivityFor(api.SEED_GRADE_IDS.A)).toEqual([])
    expect(api.gradeActivity()[0]!.gradeId).toBeUndefined()
  })
})

describe('batches', () => {
  it('lists seed batches with stable ids, then the Unassigned batch last with no attributes', () => {
    const list = api.getProductBatches('1001')
    expect(list[0]!.id).toBe('1001::seed-0')
    expect(list[0]!.attributes).toMatchObject({ supplier: 'V003', grade: api.SEED_GRADE_IDS.A })
    expect(list[0]!.attributes.expiry_date).toBe(list[0]!.expiryDate)

    const last = list[list.length - 1]!
    expect(last).toMatchObject({ batchNo: 'Unassigned', isUnassigned: true, attributes: {}, onHand: 0 })
    expect(list.filter((b) => b.isUnassigned)).toHaveLength(1)
  })

  it('uses the product’s own Track stock by, not only its category', () => {
    api.addCustomProduct({
      sku: 'BA-TEST-1', name: 'Vanilla syrup', desc: '', img: '', category: 'Syrup', unit: 'Bottle',
      sellPrice: 0, buyPrice: 0, averageCost: 0, lastPurchaseCost: 0, trackStockBy: 'Batch',
    })
    expect(api.getProductDetail('BA-TEST-1')?.trackStockBy).toBe('Batch')
    expect(api.getProductBatches('BA-TEST-1').map((b) => b.batchNo)).toEqual(['Unassigned'])
    // A catalog product with no stored choice still follows its category.
    expect(api.productTrackStockBy('1001')).toBe('Batch')
    expect(api.productTrackStockBy('2001')).toBe('Serial number')
  })

  describe('create', () => {
    it('creates master data only — qty 0, attributes as given, month expiry allowed', () => {
      const r = api.createBatch('1001', {
        batchNo: 'LOT-1', description: 'PO 4471',
        attributes: { supplier: 'V002', grade: api.SEED_GRADE_IDS.B, expiry_date: '2027-02' },
      })
      expect(codes(r)).toEqual([])
      const created = api.getProductBatches('1001').find((b) => b.batchNo === 'LOT-1')!
      expect(created).toMatchObject({ onHand: 0, reserved: 0, available: 0, description: 'PO 4471', isUnassigned: false })
      expect(created.attributes).toEqual({ supplier: 'V002', grade: api.SEED_GRADE_IDS.B, expiry_date: '2027-02' })
      expect(created.expiryDate).toBe('2027-02-28')
      expect(api.batchHasMovements('1001', created.id)).toBe(false)
      expect(api.countBatchesUsingGrade(api.SEED_GRADE_IDS.B)).toBe(2)
    })

    it('keeps the batch number unique per product (case-insensitive), not globally', () => {
      api.createBatch('1001', { batchNo: 'LOT-1', attributes: { supplier: 'V002' } })
      expect(codes(api.createBatch('1001', { batchNo: ' lot-1 ', attributes: { supplier: 'V002' } }))).toEqual(['batchNo:taken'])
      expect(api.createBatch('1002', { batchNo: 'LOT-1', attributes: { expiry_date: '2027-01-31' } }).ok).toBe(true)
    })

    it('reserves "Unassigned" and requires a number', () => {
      expect(codes(api.createBatch('1003', { batchNo: 'unassigned' }))).toEqual(['batchNo:reserved'])
      expect(codes(api.createBatch('1003', { batchNo: '  ' }))).toEqual(['batchNo:required'])
    })

    it('validates attributes against the product’s set and each value type', () => {
      // 1001: Vendor (required), Grade, Expiry date
      expect(codes(api.createBatch('1001', { batchNo: 'X1' }))).toEqual(['supplier:required'])
      expect(codes(api.createBatch('1001', { batchNo: 'X1', attributes: { supplier: 'V999' } }))).toEqual(['supplier:vendor-not-found'])
      expect(codes(api.createBatch('1001', { batchNo: 'X1', attributes: { supplier: 'V001', grade: 'nope' } }))).toEqual(['grade:grade-not-found'])
      expect(codes(api.createBatch('1001', { batchNo: 'X1', attributes: { supplier: 'V001', manufacturing_date: '2026-01-01' } }))).toEqual(['manufacturing_date:not-selected'])
      expect(codes(api.createBatch('1001', { batchNo: 'X1', attributes: { supplier: 'V001', expiry_date: '2027-02-30' } }))).toEqual(['expiry_date:invalid-date'])
      // 1101: manufacturing date needs a full day
      expect(codes(api.createBatch('1101', { batchNo: 'X1', attributes: { expiry_date: '2027-06', manufacturing_date: '2026-09' } }))).toEqual(['manufacturing_date:invalid-date'])
    })

    it('won’t take an inactive grade', () => {
      api.setGradeStatus(api.SEED_GRADE_IDS.C, 'inactive')
      expect(codes(api.createBatch('1001', { batchNo: 'X1', attributes: { supplier: 'V001', grade: api.SEED_GRADE_IDS.C } }))).toEqual(['grade:grade-inactive'])
    })

    it('refuses a product that isn’t tracked by batch', () => {
      expect(codes(api.createBatch('2001', { batchNo: 'X1' }))).toEqual(['not-batch-tracked'])
      expect(codes(api.createBatch('NOPE', { batchNo: 'X1' }))).toEqual(['product-not-found'])
    })
  })

  describe('update', () => {
    it('renames an unused batch and its barcode follows', () => {
      api.createBatch('1001', { batchNo: 'LOT-1', attributes: { supplier: 'V002' } })
      const before = api.getProductBatches('1001').find((b) => b.batchNo === 'LOT-1')!
      const r = api.updateBatch('1001', before.id, { batchNo: 'LOT-1A' })
      expect(codes(r)).toEqual([])
      const after = api.getProductBatchById('1001', before.id)!
      expect(after.batchNo).toBe('LOT-1A')
      expect(after.barcode).toBe(before.barcode)
      expect(api.getBatchBarcode('1001', 'LOT-1')).toBeUndefined()
    })

    it('won’t rename to a number another batch of the product has', () => {
      api.createBatch('1001', { batchNo: 'LOT-1', attributes: { supplier: 'V002' } })
      api.createBatch('1001', { batchNo: 'LOT-2', attributes: { supplier: 'V002' } })
      const lot2 = api.getProductBatches('1001').find((b) => b.batchNo === 'LOT-2')!
      expect(codes(api.updateBatch('1001', lot2.id, { batchNo: 'lot-1' }))).toEqual(['batchNo:taken'])
      // Changing only the letter case of its own number is fine.
      expect(api.updateBatch('1001', lot2.id, { batchNo: 'Lot-2' }).ok).toBe(true)
    })

    it('locks the number once the batch has stock movements, but still allows other edits', () => {
      const seed0 = api.getProductBatches('1001')[0]!
      expect(api.batchHasMovements('1001', seed0.id)).toBe(true)
      expect(codes(api.updateBatch('1001', seed0.id, { batchNo: 'Renamed' }))).toEqual(['batchNo:locked-in-use'])
      expect(api.updateBatch('1001', seed0.id, { batchNo: seed0.batchNo, description: 'Checked by QA' }).ok).toBe(true)
      expect(api.getProductBatchById('1001', seed0.id)!.description).toBe('Checked by QA')
    })

    it('never edits the Unassigned batch', () => {
      const unassigned = api.getProductBatches('1001').find((b) => b.isUnassigned)!
      expect(codes(api.updateBatch('1001', unassigned.id, { description: 'x' }))).toEqual(['unassigned-locked'])
    })

    it('after the set gains a required attribute, existing batches must fill it on their next save', () => {
      api.setBatchAttributeConfig('1003', [{ key: 'expiry_date' }, { key: 'supplier', required: true }])
      const seed0 = api.getProductBatches('1003')[0]!
      expect(codes(api.updateBatch('1003', seed0.id, { description: 'x' }))).toEqual(['supplier:required'])
      expect(codes(api.updateBatch('1003', seed0.id, { attributes: { supplier: 'V004' } }))).toEqual([])
      expect(api.getProductBatchById('1003', seed0.id)!.attributes.supplier).toBe('V004')
    })

    it('after the set drops an attribute, the next save removes that value for good', () => {
      const seed0 = api.getProductBatches('1003')[0]!
      expect(seed0.attributes.expiry_date).toBeTruthy()
      api.setBatchAttributeConfig('1003', [{ key: 'supplier' }])
      // Not rewritten on its own — only when the batch is saved.
      expect(api.getProductBatchById('1003', seed0.id)!.attributes.expiry_date).toBeTruthy()
      expect(api.updateBatch('1003', seed0.id, { description: 'x' }).ok).toBe(true)
      expect(api.getProductBatchById('1003', seed0.id)!.attributes.expiry_date).toBeUndefined()
      // Re-adding Expiry later doesn't resurrect the seeded date.
      api.setBatchAttributeConfig('1003', [{ key: 'supplier' }, { key: 'expiry_date' }])
      expect(api.getProductBatchById('1003', seed0.id)!.attributes.expiry_date).toBeUndefined()
      expect(api.getProductBatchById('1003', seed0.id)!.expiryDate).toBe('')
    })

    it('a null or empty value clears an optional attribute; an omitted one is left alone', () => {
      const seed0 = api.getProductBatches('1001')[0]!
      expect(api.updateBatch('1001', seed0.id, { attributes: { grade: null } }).ok).toBe(true)
      const after = api.getProductBatchById('1001', seed0.id)!
      expect(after.attributes.grade).toBeUndefined()
      expect(after.attributes.supplier).toBe('V003')
      expect(codes(api.updateBatch('1001', seed0.id, { attributes: { supplier: '' } }))).toEqual(['supplier:required'])
    })

    it('keeps a grade that was deactivated after it was stored', () => {
      const seed0 = api.getProductBatches('1001')[0]!
      api.setGradeStatus(api.SEED_GRADE_IDS.A, 'inactive')
      expect(api.updateBatch('1001', seed0.id, { description: 'still grade A' }).ok).toBe(true)
      expect(api.getProductBatchById('1001', seed0.id)!.attributes.grade).toBe(api.SEED_GRADE_IDS.A)
    })

    it('rejects attribute keys outside the catalog', () => {
      const seed0 = api.getProductBatches('1001')[0]!
      expect(codes(api.updateBatch('1001', seed0.id, { attributes: { colour: 'red' } as never }))).toEqual(['colour:not-selected'])
    })
  })
})
