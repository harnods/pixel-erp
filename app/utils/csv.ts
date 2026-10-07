/**
 * CSV export helpers — shared by the replenishment worklist export (US-013 AC-01)
 * and the "Why this number" contributing-documents export.
 */

export type CsvRow = (string | number)[]

/** Quote a cell only when it needs it (comma, quote or newline). */
export function csvCell(v: string | number): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(lines: CsvRow[]): string {
  return lines.map((r) => r.map(csvCell).join(',')).join('\n')
}

/**
 * Split data rows into files of at most `maxRows` data rows each, repeating the
 * header in every file (PRD US-013: "maximum 1000 line row of export … split
 * 1000 lines if the replenishment worklist is above 1000 line").
 */
export function splitCsv(header: CsvRow, rows: CsvRow[], maxRows = 1000): CsvRow[][] {
  if (!rows.length) return [[header]]
  const files: CsvRow[][] = []
  for (let i = 0; i < rows.length; i += maxRows) files.push([header, ...rows.slice(i, i + maxRows)])
  return files
}

/** Trigger a browser download of one CSV file. No-op on the server. */
export function downloadCsv(lines: CsvRow[], name: string): void {
  if (!import.meta.client) return
  const blob = new Blob([toCsv(lines)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}


/**
 * Parse CSV text into rows of cells. Handles quoted cells (commas, quotes and
 * newlines inside them) and both LF / CRLF line endings; a trailing blank line is
 * ignored. The inverse of `toCsv`.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const src = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++ } else quoted = false
      } else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}
