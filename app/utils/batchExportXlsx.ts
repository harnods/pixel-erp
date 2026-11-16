/**
 * Batch export → .xlsx (ATINV-9083). Sheet 1 "Batches" is the import's own template with
 * the data filled in; a required attribute that is still empty carries a hidden cell note.
 * Sheet 2 "Attribute Setup" lists each exported product's attributes and which are required.
 * xlsx (SheetJS CE) writes cell comments but not fills, so the note is the only marker.
 */
import * as XLSX from 'xlsx'
import { BATCH_UPDATE_COLUMNS, type BatchExport } from '~/data/batchUpdateImport'
import { batchAttributeDef } from '~/data/batchAttributes'

type Translate = (s: string) => string

export function buildBatchExportBook(data: BatchExport, t: Translate): XLSX.WorkBook {
  const header = BATCH_UPDATE_COLUMNS.map((c) => t(c.label))
  const sheet = XLSX.utils.aoa_to_sheet([header, ...data.rows.map((r) => BATCH_UPDATE_COLUMNS.map((c) => r.cells[c.key]))])
  sheet['!cols'] = header.map((h) => ({ wch: Math.max(16, h.length + 2) }))

  data.rows.forEach((row, i) => {
    for (const key of row.requiredEmpty) {
      const col = BATCH_UPDATE_COLUMNS.findIndex((c) => c.key === key)
      if (col < 0) continue
      const cell: XLSX.CellObject = { t: 's', v: '' }
      const note = [{ a: 'Mekari ERP', t: t('Required attribute is empty') }] as XLSX.Comments
      note.hidden = true
      cell.c = note
      sheet[XLSX.utils.encode_cell({ r: i + 1, c: col })] = cell
    }
  })

  const setupHeader = [t('Product name'), t('Attribute'), t('Required')]
  const setupRows = data.setup.flatMap((p) => p.attributes.map((a) => [
    p.productName, t(batchAttributeDef(a.key).label), t(a.required ? 'Yes' : 'No'),
  ]))
  const setupSheet = XLSX.utils.aoa_to_sheet([setupHeader, ...setupRows])
  setupSheet['!cols'] = setupHeader.map((h) => ({ wch: Math.max(20, h.length + 2) }))

  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Batches')
  XLSX.utils.book_append_sheet(book, setupSheet, t('Attribute Setup'))
  return book
}

export async function writeBatchExportXlsx(data: BatchExport, filename: string, t: Translate): Promise<void> {
  XLSX.writeFile(buildBatchExportBook(data, t), filename)
}
