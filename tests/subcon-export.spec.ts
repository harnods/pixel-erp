/**
 * R19 — the subcon report is an Excel export: one row per subcon work order, with
 * exactly the R19 columns, Status being the work order's own status (DB-13).
 */
import { describe, it, expect } from 'vitest'
import { workOrders } from '../app/data/workOrders'
import { buildSubconExportRows, SUBCON_EXPORT_COLUMNS } from '../app/data/subconExport'

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

  it('reads each row from its work order: produced over planned, and the work order status', () => {
    const wo = subcon[0]!
    const row = rows[0]!
    expect(row['Received']).toBe(`${wo.producedQty}/${wo.plannedQty}`)
    expect(row['Subcon vendor']).toBe(wo.subcon!.vendorName)
    expect(row['Status'].toLowerCase()).toBe(wo.status)
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
