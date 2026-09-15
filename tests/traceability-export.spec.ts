/**
 * Batch Traceability export builder (PRD story 12, plan Phase 4).
 *
 * The file must explain itself: title, export time and the applied filters head every
 * export. xlsx gets one sheet per section; csv stacks the sections under one header.
 */
import { describe, it, expect } from 'vitest'
import {
  buildHeader, buildExportDocument, documentToCsv, csvEscape, sheetName, describeDateCondition,
} from '~/utils/traceabilityExport'

const labels = { exportedOn: 'Exported on', appliedFilters: 'Applied filters', noFilters: 'No filters applied' }

describe('header block', () => {
  it('writes the title, export time and one row per applied filter', () => {
    expect(buildHeader({
      title: 'Batch traceability — By batch',
      exportedOn: '15/09/2026 10:30',
      filters: [{ label: 'Vendor', value: 'Gayo Highland Exporters' }, { label: 'Warehouse', value: 'All warehouse' }],
      labels,
    })).toEqual([
      ['Batch traceability — By batch'],
      ['Exported on', '15/09/2026 10:30'],
      ['Applied filters'],
      ['Vendor', 'Gayo Highland Exporters'],
      ['Warehouse', 'All warehouse'],
      [],
    ])
  })

  it('says so when nothing was filtered', () => {
    const header = buildHeader({ title: 'T', exportedOn: 'now', filters: [], labels })
    expect(header).toContainEqual(['No filters applied'])
  })
})

describe('csv', () => {
  const doc = buildExportDocument({
    title: 'Batch traceability — Batch #001',
    exportedOn: '15/09/2026 10:30',
    filters: [],
    labels,
    sections: [
      { name: 'Stock position', columns: ['Warehouse', 'On hand'], rows: [['Gudang Jakarta Pusat', '12 Sack']] },
      { name: 'Batch journey', columns: ['Date', 'Mutation'], rows: [['02/04/2026', '+52 Sack'], ['09/04/2026', '−5 Sack']] },
    ],
  })

  it('writes the header once and titles each section when there is more than one', () => {
    const lines = documentToCsv(doc).split('\r\n')
    expect(lines.filter((l) => l === 'Batch traceability — Batch #001')).toHaveLength(1)
    expect(lines).toContain('Stock position')
    expect(lines).toContain('Batch journey')
    expect(lines.indexOf('Stock position')).toBeLessThan(lines.indexOf('Batch journey'))
    expect(lines).toContain('09/04/2026,−5 Sack')
  })

  it('does not title a single section', () => {
    const single = { ...doc, sections: [doc.sections[0]!] }
    expect(documentToCsv(single).split('\r\n')).not.toContain('Stock position')
  })

  it('quotes cells with commas, quotes, line breaks or edge spaces', () => {
    expect(csvEscape('plain')).toBe('plain')
    expect(csvEscape(12)).toBe('12')
    expect(csvEscape('a, b')).toBe('"a, b"')
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""')
    expect(csvEscape('two\nlines')).toBe('"two\nlines"')
    expect(csvEscape(' padded')).toBe('" padded"')
  })
})

describe('xlsx sheet names', () => {
  it('drops forbidden characters, caps at 31 and de-duplicates', () => {
    const used = new Set<string>()
    expect(sheetName('Batches in selected transactions', used)).toBe('Batches in selected transaction')
    expect(sheetName('Stock: position / warehouses', used)).toBe('Stock position warehouses')
    expect(sheetName('Batches in selected transactions', used)).toBe('Batches in selected transac (2)')
    expect(sheetName('', used)).toBe('Sheet')
  })
})

describe('date filters', () => {
  const dateLabels = { between: 'Is between', before: 'Is before', after: 'Is after' }
  const fmt = (iso: string) => iso.split('-').reverse().join('/')

  it('reads the way the filter was set', () => {
    expect(describeDateCondition({ op: 'before', date: '2026-08-01' }, dateLabels, fmt)).toBe('Is before 01/08/2026')
    expect(describeDateCondition({ op: 'after', date: '2026-08-01' }, dateLabels, fmt)).toBe('Is after 01/08/2026')
    expect(describeDateCondition({ op: 'between', from: '2026-06-01', to: '2026-06-30' }, dateLabels, fmt))
      .toBe('Is between 01/06/2026 - 30/06/2026')
  })
})
