/**
 * Update Batch import (app/data/batchUpdateImport.ts — Batch Attribute PRD story 9).
 *
 * Pins the PRD's row rules and copy: blank cell = unchanged, "null" = clear, product +
 * batch matched by name/number, every attribute column validated against the product's
 * set, and only valid rows applied. Data modules keep module-level reactive state, so
 * each test re-imports a fresh copy.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

async function load() {
  vi.resetModules()
  const importer = await import('~/data/batchUpdateImport')
  const details = await import('~/data/productDetails')
  const index = await import('~/data/productsIndex')
  const grades = await import('~/data/grades')
  const attrs = await import('~/data/batchAttributes')
  return { ...importer, ...details, ...index, ...grades, ...attrs }
}
type Api = Awaited<ReturnType<typeof load>>
let api: Api
beforeEach(async () => { api = await load() })

const nameOf = (sku: string) => api.productIndexRows().find((r) => r.sku === sku)!.name

let nextRow = 2
function row(cells: Partial<Record<string, string>>) {
  return {
    rowNumber: nextRow++,
    productName: '', batchNumber: '', description: '',
    expiry_date: '', manufacturing_date: '', best_before_date: '', supplier: '', grade: '',
    ...cells,
  } as Parameters<Api['validateBatchUpdateRows']>[0][number]
}
/** Errors for rows checked in one file (so duplicates count across them). */
const errorsOf = (rows: ReturnType<typeof row>[]) => api.validateBatchUpdateRows(rows).map((r) => r.result.errors)
/** Errors for each row checked as its own one-row file. */
const errorsEach = (rows: ReturnType<typeof row>[]) => rows.map((r) => errorsOf([r])[0])

describe('date cells', () => {
  it('reads a day as DD/MM/YYYY with / or - and a numeric or named month', () => {
    expect(api.parseImportDate('31/08/2026', false)).toBe('2026-08-31')
    expect(api.parseImportDate('31-Aug-2026', false)).toBe('2026-08-31')
    expect(api.parseImportDate('1-8-2026', false)).toBe('2026-08-01')
    expect(api.parseImportDate('31/02/2026', false)).toBeNull()
    expect(api.parseImportDate('2026-08-31', false)).toBeNull()
  })

  it('reads a month only where it is allowed (Expiry date)', () => {
    expect(api.parseImportDate('08/2026', true)).toBe('2026-08')
    expect(api.parseImportDate('Aug-2026', true)).toBe('2026-08')
    expect(api.parseImportDate('08/2026', false)).toBeNull()
    expect(api.parseImportDate('13/2026', true)).toBeNull()
  })
})

describe('row validation (PRD copy)', () => {
  it('needs a known, batch-tracked product and a batch number that exists on it', () => {
    expect(errorsOf([
      row({ batchNumber: 'Batch #001' }),
      row({ productName: nameOf('1001') }),
      row({ productName: 'No such product', batchNumber: 'Batch #001' }),
      row({ productName: nameOf('2001'), batchNumber: 'Batch #001' }),
      row({ productName: nameOf('1001'), batchNumber: 'Batch #999' }),
    ])).toEqual([
      ['You must fill in product name'],
      ['You must fill in batch number'],
      ['Product name not found'],
      ['Product is not tracked by batch'],
      ['Batch number not found'],
    ])
  })

  it('rejects both rows when the same product + batch appears twice', () => {
    expect(errorsOf([
      row({ productName: nameOf('1001'), batchNumber: 'Batch #001', description: 'a' }),
      row({ productName: nameOf('1001').toUpperCase(), batchNumber: 'batch #001', description: 'b' }),
    ])).toEqual([
      ['Duplicated Product and Batch combination'],
      ['Duplicated Product and Batch combination'],
    ])
  })

  it('rejects an attribute the product does not use', () => {
    // 1002 uses Expiry date (required) + Grade — not Vendor.
    expect(errorsOf([row({ productName: nameOf('1002'), batchNumber: 'Batch #001', supplier: 'Klasik Beans Cooperative' })]))
      .toEqual([['This product does not use Attribute Vendor']])
  })

  it('rejects clearing, or leaving empty, a required attribute', () => {
    // 1001 requires Vendor; seed batch #001 has one, #003 doesn't.
    expect(errorsOf([
      row({ productName: nameOf('1001'), batchNumber: 'Batch #001', supplier: 'null' }),
      row({ productName: nameOf('1001'), batchNumber: 'Batch #003', description: 'Checked' }),
    ])).toEqual([
      ['Attribute Vendor must be filled'],
      ['Attribute Vendor must be filled'],
    ])
  })

  it('checks each attribute value: date formats, vendor and grade names', () => {
    api.setGradeStatus(api.SEED_GRADE_IDS.C, 'inactive')
    expect(errorsEach([
      row({ productName: nameOf('1001'), batchNumber: 'Batch #001', expiry_date: '2026/08/31' }),
      row({ productName: nameOf('1101'), batchNumber: 'Batch #001', manufacturing_date: '08/2026' }),
      row({ productName: nameOf('1001'), batchNumber: 'Batch #001', supplier: 'Nobody Ltd' }),
      row({ productName: nameOf('1001'), batchNumber: 'Batch #001', grade: 'Z' }),
      row({ productName: nameOf('1001'), batchNumber: 'Batch #001', grade: 'c' }),
    ])).toEqual([
      ['Format must be in DD/MM/YYYY or MM/YYYY'],
      ['Format must be in DD/MM/YYYY'],
      ['Vendor name not found'],
      ['Grade Name not found'],
      ['Grade is not active'],
    ])
  })

  it('never lets the Unassigned batch take attributes or a description', () => {
    expect(errorsEach([
      row({ productName: nameOf('1003'), batchNumber: 'Unassigned', description: 'x' }),
      row({ productName: nameOf('1003'), batchNumber: 'Unassigned', expiry_date: '31/12/2027' }),
    ])).toEqual([
      ["Unassigned batch can't have attributes"],
      ["Unassigned batch can't have attributes"],
    ])
  })
})

describe('applying the import', () => {
  it('applies valid rows only: blank keeps, "null" clears, names resolve to ids', () => {
    const b1 = nameOf('1001')
    const before = api.getProductBatches('1001').find((b) => b.batchNo === 'Batch #002')!
    const result = api.applyBatchUpdateImport([
      row({ productName: b1, batchNumber: 'Batch #002', grade: 'a', expiry_date: 'Dec-2027', description: 'null' }),
      row({ productName: b1, batchNumber: 'Batch #999', grade: 'B' }),
      row({ productName: b1, batchNumber: 'Batch #001' }), // valid but changes nothing
    ])

    expect(result).toMatchObject({ total: 3, updated: 1, unchanged: 1 })
    expect(result.failed.map((f) => [f.batchNumber, f.errors])).toEqual([['Batch #999', ['Batch number not found']]])

    const after = api.getProductBatches('1001').find((b) => b.batchNo === 'Batch #002')!
    expect(after.attributes.grade).toBe(api.SEED_GRADE_IDS.A)
    expect(after.attributes.expiry_date).toBe('2027-12')
    expect(after.attributes.supplier).toBe(before.attributes.supplier) // blank cell → unchanged
    expect(after.description).toBe('')
  })

  it('exports batches as template rows that import back unchanged', () => {
    const rows = api.batchUpdateTemplateRows(['1001'])
    expect(rows.map((r) => r.batchNumber)).not.toContain('Unassigned')
    expect(rows[0]).toMatchObject({ productName: nameOf('1001'), batchNumber: 'Batch #001', supplier: 'Gayo Highland Exporters', grade: 'A' })
    expect(rows[0]!.expiry_date).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)

    // Nothing changes, so every row is skipped, including seed batches #003/#004 that
    // have no Vendor (which 1001 requires): an unedited row is not judged (ATINV-9083).
    const result = api.applyBatchUpdateImport(rows.map((r, i) => ({ rowNumber: i + 2, ...r })))
    expect(result).toMatchObject({ updated: 0, unchanged: 4, failed: [] })
  })

  describe('an unedited re-upload (ATINV-9083)', () => {
    const requireGrade = () => api.setBatchAttributeConfig('1001', [
      { key: 'supplier', required: true }, { key: 'grade', required: true }, { key: 'expiry_date' },
    ])

    it('skips an unedited exported row even when a required attribute is empty', () => {
      requireGrade()
      let n = 2
      const rows = api.buildBatchExport({ skus: ['1001'], onlyRequiredEmpty: false }).rows
        .map((r) => ({ rowNumber: n++, ...r.cells }))
      expect(rows.length).toBeGreaterThan(0)
      const result = api.applyBatchUpdateImport(rows)
      expect(result.failed).toEqual([])
      expect(result.unchanged).toBe(rows.length)
    })

    it('still fails a changed row that leaves a required attribute empty', () => {
      requireGrade()
      const flagged = api.buildBatchExport({ skus: ['1001'], onlyRequiredEmpty: true }).rows[0]!
      const result = api.applyBatchUpdateImport([{ rowNumber: 2, ...flagged.cells, description: 'Edited note' }])
      expect(result.failed.flatMap((f) => f.errors)).toContain('Attribute Grade must be filled')
    })

    it('treats a cell equal to the current value as unchanged', () => {
      const exported = api.buildBatchExport({ skus: ['1001'], onlyRequiredEmpty: false }).rows
        .find((r) => r.cells.batchNumber === 'Batch #001')!
      const result = api.applyBatchUpdateImport([
        { rowNumber: 2, ...exported.cells, supplier: exported.cells.supplier.toUpperCase(), grade: exported.cells.grade.toLowerCase() },
      ])
      expect(result).toMatchObject({ updated: 0, unchanged: 1, failed: [] })
    })
  })
})
