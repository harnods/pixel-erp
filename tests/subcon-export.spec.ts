/**
 * R19 — the subcon report is an Excel export: one row per subcon work order, with
 * exactly the R19 columns, Status being the work order's own status (DB-13).
 */
import { describe, it, expect } from 'vitest'
import { workOrders, type WorkOrder } from '../app/data/workOrders'
import { billOfMaterials, catalogProduct } from '../app/data/billOfMaterials'
import { buildSubconExportRows, SUBCON_EXPORT_COLUMNS, SUBCON_STATUS_LABEL, subconStatus } from '../app/data/subconExport'

describe('buildSubconExportRows', () => {
  const rows = buildSubconExportRows(workOrders)
  const subcon = workOrders.filter(w => w.category === 'Subcontracting')

  it('has exactly the R19 columns, in order', () => {
    expect(SUBCON_EXPORT_COLUMNS).toEqual([
      'WO number', 'Product', 'BOM', 'Subcon vendor', 'Method', 'Scope',
      'Qty', 'Received', 'Promised date', 'Status',
    ])
    for (const r of rows) expect(Object.keys(r)).toEqual([...SUBCON_EXPORT_COLUMNS])
  })

  it('carries one row per subcon work order and leaves every other order out', () => {
    expect(subcon.length).toBeGreaterThan(0)
    expect(rows.map(r => r['WO number'])).toEqual(subcon.map(w => w.number))
  })

  // Status was the work order's own (R22) until 2026-10-20; it is now the subcon
  // status (promised date + raw material fulfilment) — see the describe below.
  it('reads each row from its work order: produced over planned, and the subcon status', () => {
    const wo = subcon[0]!
    const row = rows[0]!
    expect(row['Received']).toBe(`${wo.producedQty}/${wo.plannedQty}`)
    expect(row['Subcon vendor']).toBe(wo.subcon!.vendorName)
    expect(row['Status']).toBe(SUBCON_STATUS_LABEL[subconStatus(wo)])
    expect(row['Promised date']).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
  })
})

// Subcon order report (Reports › Production) — the screen and the file read the
// same rows, so a filtered table downloads exactly what it shows.
import { subconReportRows, toSubconExportRows } from '../app/data/subconExport'

describe('Subcon order report rows', () => {
  const subcon = workOrders.filter(w => w.category === 'Subcontracting')

  it('the download is the on-screen rows, formatted', () => {
    expect(toSubconExportRows(subconReportRows(workOrders))).toEqual(buildSubconExportRows(workOrders))
  })

  it('downloads only the rows passed in — a filtered table exports its subset', () => {
    const shown = subconReportRows(workOrders).slice(0, 1)
    expect(toSubconExportRows(shown).map(r => r['WO number'])).toEqual([subcon[0]!.number])
  })

  it('keeps typed values for sorting and filtering on screen', () => {
    const row = subconReportRows(workOrders)[0]!
    const wo = subcon[0]!
    expect(row.id).toBe(wo.id)
    expect(row.vendorId).toBe(wo.subcon!.vendorId)
    expect(row.plannedQty).toBe(wo.plannedQty)
    expect(row.planStartDate).toBe(wo.planStartDate)
  })
})

// The export dialog's column picker narrows the sheet; R19 order is kept.
import { vi } from 'vitest'
const sheetCalls: { rows: Record<string, string>[]; header: string[] }[] = []
vi.mock('xlsx', () => ({
  utils: {
    json_to_sheet: (rows: Record<string, string>[], opts: { header: string[] }) => { sheetCalls.push({ rows, header: opts.header }); return {} },
    book_new: () => ({}),
    book_append_sheet: () => {},
  },
  writeFile: () => {},
}))

describe('downloadSubconExport — picked columns', async () => {
  const { downloadSubconExport } = await import('../app/data/subconExport')

  it('writes only the picked columns, in R19 order, whatever order they were picked in', async () => {
    sheetCalls.length = 0
    await downloadSubconExport(buildSubconExportRows(workOrders), new Date('2026-10-20'), ['Status', 'WO number'])
    expect(sheetCalls[0]!.header).toEqual(['WO number', 'Status'])
    for (const r of sheetCalls[0]!.rows) expect(Object.keys(r)).toEqual(['WO number', 'Status'])
  })

  it('writes every R19 column by default', async () => {
    sheetCalls.length = 0
    await downloadSubconExport(buildSubconExportRows(workOrders))
    expect(sheetCalls[0]!.header).toEqual([...SUBCON_EXPORT_COLUMNS])
  })
})


// Subcon status — promised date + raw material fulfilment at the vendor.
describe('subconStatus', () => {
  const base = workOrders.find(w => w.category === 'Subcontracting' && w.subcon)!
  const bomLines = billOfMaterials.find(b => b.id === base.bomId)!.rawMaterials
  const all = Object.fromEntries(bomLines.map(l => [catalogProduct(l.productId)!.sku, l.needed * 1000]))
  const order = (over: Partial<WorkOrder>, sub: Partial<NonNullable<WorkOrder['subcon']>> = {}): WorkOrder => ({
    ...base, ...over,
    subcon: { ...base.subcon!, raisedDocuments: [], componentReceipts: {}, ...sub },
  })
  const BEFORE = '2026-06-01'
  const AFTER = '2026-12-31'

  it('promised date within 3 days (D-3…D-0) → due soon, materials or not', () => {
    const due = (promisedDate: string, sub = {}) =>
      subconStatus(order({ status: 'in progress' }, { method: 'dropship', promisedDate, ...sub }), '2026-06-10')
    expect(due('2026-06-13')).toBe('due soon')                          // D-3
    expect(due('2026-06-10')).toBe('due soon')                          // D-0, today
    expect(due('2026-06-12', { componentReceipts: all })).toBe('due soon')
    expect(due('2026-06-14')).toBe('waiting materials')                 // D-4
    expect(due('2026-06-09')).toBe('overdue')                           // D+1
  })
  it('materials short, before the promised date → waiting materials', () => {
    expect(subconStatus(order({ status: 'not started' }, { method: 'dropship', promisedDate: AFTER }), BEFORE)).toBe('waiting materials')
  })
  it('materials all at the vendor, before the promised date → ready at vendor', () => {
    expect(subconStatus(order({ status: 'in progress' }, { method: 'dropship', promisedDate: AFTER, componentReceipts: all }), BEFORE)).toBe('ready at vendor')
  })
  it('Basic needs no materials → ready at vendor', () => {
    expect(subconStatus(order({ status: 'not started' }, { method: 'basic', promisedDate: AFTER }), BEFORE)).toBe('ready at vendor')
  })
  it('past the promised date and not completed → overdue, fulfilled or not', () => {
    expect(subconStatus(order({ status: 'in progress' }, { method: 'dropship', promisedDate: BEFORE }), AFTER)).toBe('overdue')
    expect(subconStatus(order({ status: 'in progress' }, { method: 'dropship', promisedDate: BEFORE, componentReceipts: all }), AFTER)).toBe('overdue')
  })
  it('a completed work order is completed even past its promised date', () => {
    expect(subconStatus(order({ status: 'completed' }, { promisedDate: BEFORE }), AFTER)).toBe('completed')
  })
  it('a canceled work order never reads as overdue', () => {
    expect(subconStatus(order({ status: 'canceled' }, { promisedDate: BEFORE }), AFTER)).toBe('canceled')
  })
})
