/**
 * Batch Traceability export (PRD story 12, plan Phase 4) — builds the file for the three
 * export points (By batch, By transaction, Batch detail) and writes it as xlsx or csv,
 * the same way the app's other exports do (ProductDetailsPage / CrmReportViewerPage use
 * xlsx `aoa_to_sheet` + `writeFile`).
 *
 * Every file opens with a header block — the report title, when it was exported, and
 * the filters that produced it — so it explains itself to an auditor or regulator
 * without the user having to remember what was filtered.
 *
 * A document is one header plus one or more sections (a table each). xlsx writes one
 * sheet per section, each repeating the header. csv has no sheets, so it writes the
 * header once and stacks the sections under their titles.
 *
 * Copy is passed in (labels), so this module stays free of useLocale and testable.
 */
import type { DateCondition } from '~/data/batchTraceability'

export type ExportFormat = 'xlsx' | 'csv'
export type ExportCell = string | number

export interface ExportFilter {
  label: string
  value: string
}

export interface ExportSection {
  /** Sheet name (xlsx) / section title (csv). */
  name: string
  columns: string[]
  rows: ExportCell[][]
}

export interface ExportHeaderLabels {
  exportedOn: string
  appliedFilters: string
  noFilters: string
}

export interface ExportDocument {
  header: ExportCell[][]
  sections: ExportSection[]
}

/** Title, export time, then one row per applied filter (or a "no filters" row), then a blank row. */
export function buildHeader(opts: {
  title: string
  exportedOn: string
  filters: readonly ExportFilter[]
  labels: ExportHeaderLabels
}): ExportCell[][] {
  const filterRows: ExportCell[][] = opts.filters.length
    ? opts.filters.map((f) => [f.label, f.value])
    : [[opts.labels.noFilters]]
  return [
    [opts.title],
    [opts.labels.exportedOn, opts.exportedOn],
    [opts.labels.appliedFilters],
    ...filterRows,
    [],
  ]
}

export function buildExportDocument(opts: {
  title: string
  exportedOn: string
  filters: readonly ExportFilter[]
  labels: ExportHeaderLabels
  sections: ExportSection[]
}): ExportDocument {
  return { header: buildHeader(opts), sections: opts.sections }
}

export function csvEscape(cell: ExportCell): string {
  const s = String(cell)
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s
}

function rowsToCsv(rows: ExportCell[][]): string {
  return rows.map((r) => r.map(csvEscape).join(',')).join('\r\n')
}

/** The whole document as one csv: header once, then each section (titled when there's more than one). */
export function documentToCsv(doc: ExportDocument): string {
  const titled = doc.sections.length > 1
  const body = doc.sections.flatMap((s, i) => [
    ...(i > 0 ? [[]] : []),
    ...(titled ? [[s.name]] : []),
    s.columns,
    ...s.rows,
  ])
  return rowsToCsv([...doc.header, ...body])
}

/** xlsx sheet names: ≤ 31 chars, none of : \ / ? * [ ], unique within the workbook. */
export function sheetName(name: string, used: Set<string>): string {
  const base = (name.replace(/[:\\/?*[\]]/g, ' ').replace(/\s+/g, ' ').trim() || 'Sheet').slice(0, 31)
  let candidate = base
  for (let n = 2; used.has(candidate.toLowerCase()); n++) {
    const suffix = ` (${n})`
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`
  }
  used.add(candidate.toLowerCase())
  return candidate
}

/** A date filter as the header shows it: "Is before 01/08/2026", "Is between 01/06/2026 - 30/06/2026". */
export function describeDateCondition(
  cond: DateCondition,
  labels: { between: string; before: string; after: string },
  formatDate: (iso: string) => string,
): string {
  switch (cond.op) {
    case 'between': return `${labels.between} ${formatDate(cond.from)} - ${formatDate(cond.to)}`
    case 'before': return `${labels.before} ${formatDate(cond.date)}`
    case 'after': return `${labels.after} ${formatDate(cond.date)}`
  }
}

/** Write the document to a file the browser downloads. `fileBase` has no extension. */
export async function downloadExport(doc: ExportDocument, fileBase: string, format: ExportFormat): Promise<void> {
  if (format === 'xlsx') {
    const XLSX = await import('xlsx')
    const book = XLSX.utils.book_new()
    const used = new Set<string>()
    for (const section of doc.sections) {
      const sheet = XLSX.utils.aoa_to_sheet([...doc.header, section.columns, ...section.rows])
      XLSX.utils.book_append_sheet(book, sheet, sheetName(section.name, used))
    }
    XLSX.writeFile(book, `${fileBase}.xlsx`)
    return
  }
  // Byte-order mark so Excel opens the csv as UTF-8 (Indonesian names, "−").
  const blob = new Blob([`﻿${documentToCsv(doc)}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${fileBase}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
