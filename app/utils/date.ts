/**
 * ERP date formatting — the single source of truth for how dates render in tables.
 *
 * Standard: ALWAYS numeric `DD/MM/YYYY` (e.g. 23/06/2026). Never a spelled-out
 * month ("23 Jun 2026"). See docs/patterns/date-format.md.
 *
 *   formatDate('2026-06-23')            → "23/06/2026"
 *   formatDateTime('2026-06-23T14:30')  → "23/06/2026 14:30"
 *   formatDate(undefined)               → "—"
 */

const EMPTY = '—'

/** Numeric date only — `DD/MM/YYYY`. Empty / invalid → "—". */
export function formatDate(iso?: string | null): string {
  if (!iso) return EMPTY
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return EMPTY
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Numeric date + 24h time — `DD/MM/YYYY HH:MM`. Empty / invalid → "—". */
export function formatDateTime(iso?: string | null): string {
  if (!iso) return EMPTY
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return EMPTY
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${date} ${time}`
}
