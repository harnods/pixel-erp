/**
 * Batch export (app/data/batchUpdateImport.ts `buildBatchExport` + app/utils/batchExportXlsx.ts —
 * ATINV-9083): which batches are exported, the required-but-empty flag, the Attribute Setup
 * sheet, and the xlsx note + second sheet. Data modules keep module-level state, so each
 * test re-imports a fresh copy.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as XLSX from 'xlsx'

async function load() {
  vi.resetModules()
  const importer = await import('~/data/batchUpdateImport')
  const details = await import('~/data/productDetails')
  const attrs = await import('~/data/batchAttributes')
  const writer = await import('~/utils/batchExportXlsx')
  return { ...importer, ...details, ...attrs, ...writer }
}
type Api = Awaited<ReturnType<typeof load>>
let api: Api
beforeEach(async () => { api = await load() })

const cmp = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })

describe('buildBatchExport', () => {
  it('exports every non-Unassigned batch of the chosen products, sorted by product then batch', () => {
    const { rows } = api.buildBatchExport({ skus: ['1002', '1001'], onlyRequiredEmpty: false })
    const keys = rows.map((r) => r.cells.productName + '|' + r.cells.batchNumber)
    expect(keys.length).toBeGreaterThan(0)
    expect(rows.map((r) => r.cells.batchNumber)).not.toContain('Unassigned')
    const sorted = [...rows].sort((a, b) => cmp(a.cells.productName, b.cells.productName) || cmp(a.cells.batchNumber, b.cells.batchNumber))
    expect(rows).toEqual(sorted)
  })

  it('includes qty-0 batches', () => {
    expect(api.createBatch('1001', { batchNo: 'ZZ-NEW', attributes: { supplier: 'V001' } }).ok).toBe(true)
    const { rows } = api.buildBatchExport({ skus: ['1001'], onlyRequiredEmpty: false })
    expect(rows.map((r) => r.cells.batchNumber)).toContain('ZZ-NEW')
  })

  it('flags an empty required attribute', () => {
    api.setBatchAttributeConfig('1001', [{ key: 'supplier', required: true }, { key: 'grade', required: true }, { key: 'expiry_date' }])
    const { rows } = api.buildBatchExport({ skus: ['1001'], onlyRequiredEmpty: false })
    const noGrade = rows.find((r) => r.requiredEmpty.includes('grade'))
    expect(noGrade).toBeTruthy()
    expect(noGrade!.cells.grade).toBe('')
  })

  it('onlyRequiredEmpty keeps only flagged rows', () => {
    api.setBatchAttributeConfig('1001', [{ key: 'supplier', required: true }, { key: 'grade', required: true }, { key: 'expiry_date' }])
    const all = api.buildBatchExport({ skus: ['1001'], onlyRequiredEmpty: false })
    const some = api.buildBatchExport({ skus: ['1001'], onlyRequiredEmpty: true })
    expect(some.rows.length).toBeGreaterThan(0)
    expect(some.rows.every((r) => r.requiredEmpty.length > 0)).toBe(true)
    expect(some.rows.length).toBeLessThan(all.rows.length)
  })

  it('returns no rows when nothing matches', () => {
    expect(api.buildBatchExport({ skus: [], onlyRequiredEmpty: false }).rows).toEqual([])
  })

  it('lists each exported product in Attribute Setup with its required flags', () => {
    const { setup } = api.buildBatchExport({ skus: ['1001'], onlyRequiredEmpty: false })
    expect(setup).toHaveLength(1)
    expect(setup[0]!.attributes).toEqual([
      { key: 'supplier', required: true }, { key: 'grade', required: false }, { key: 'expiry_date', required: false },
    ])
  })

  it('skips archived batches', () => {
    const batch = api.getProductBatches('1001').find((b) => !b.isUnassigned)!
    api.setBatchArchived('1001', batch.id, true)
    const { rows } = api.buildBatchExport({ skus: ['1001'], onlyRequiredEmpty: false })
    expect(rows.map((r) => r.cells.batchNumber)).not.toContain(batch.batchNo)
  })

  it('exportableProductSkus lists batch-tracked products sorted by name', () => {
    const skus = api.exportableProductSkus()
    expect(skus).toContain('1001')
    expect(skus.every((s) => api.isProductBatchTracked(s))).toBe(true)
  })
})

describe('buildBatchExportBook', () => {
  it('writes the note and the second sheet', () => {
    api.setBatchAttributeConfig('1001', [{ key: 'supplier', required: true }, { key: 'grade', required: true }, { key: 'expiry_date' }])
    const data = api.buildBatchExport({ skus: ['1001'], onlyRequiredEmpty: false })
    const book = api.buildBatchExportBook(data, (s: string) => s)
    const buf = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })
    const read = XLSX.read(buf, { type: 'buffer', cellComments: true } as XLSX.ParsingOptions)
    expect(read.SheetNames).toEqual(['Batches', 'Attribute Setup'])
    const idx = data.rows.findIndex((r) => r.requiredEmpty.includes('grade'))
    const col = api.BATCH_UPDATE_COLUMNS.findIndex((c) => c.key === 'grade')
    const cell = read.Sheets['Batches']![XLSX.utils.encode_cell({ r: idx + 1, c: col })]!
    expect(cell.c![0]!.t).toContain('Required attribute is empty')
    const setup = XLSX.utils.sheet_to_json<string[]>(read.Sheets['Attribute Setup']!, { header: 1 })
    expect(setup[0]).toEqual(['Product name', 'Attribute', 'Required'])
    expect(setup[1]![2]).toBe('Yes')
  })
})
