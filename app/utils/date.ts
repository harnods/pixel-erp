/**
 * ERP date formatting — the single source of truth for how dates render.
 *
 * GOLDEN RULE for timestamps (date + time):
 *   • In a TABLE  → numeric `DD/MM/YYYY, HH:MM`   e.g. 23/06/2026, 15:30
 *   • Elsewhere   → `DD Mon YYYY, HH:MM`          e.g. 23 Jun 2026, 15:30
 * Date-only stays numeric `DD/MM/YYYY` everywhere. Never a spelled-out month in a
 * table cell; no "(GMT+7)" suffix. See docs/patterns/date-format.md.
 *
 *   formatDate('2026-06-23')                → "23/06/2026"
 *   formatDateTime('2026-06-23T15:30')      → "23/06/2026, 15:30"   (tables)
 *   formatDateTimeLong('2026-06-23T15:30')  → "23 Jun 2026, 15:30"  (non-table)
 *   formatDate(undefined)                   → "—"
 */

const EMPTY = '—'

function time24(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** Numeric date only — `DD/MM/YYYY`. Empty / invalid → "—". */
export function formatDate(iso?: string | null): string {
  if (!iso) return EMPTY
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return EMPTY
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** TABLE timestamp — numeric `DD/MM/YYYY, HH:MM`. Empty / invalid → "—". */
export function formatDateTime(iso?: string | null): string {
  if (!iso) return EMPTY
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return EMPTY
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return `${date}, ${time24(d)}`
}

/** NON-TABLE date only — `DD Mon YYYY` (spelled-out month). Empty / invalid → "—". */
export function formatDateLong(iso?: string | null): string {
  if (!iso) return EMPTY
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return EMPTY
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** NON-TABLE timestamp — `DD Mon YYYY, HH:MM` (spelled-out month). Empty / invalid → "—". */
export function formatDateTimeLong(iso?: string | null): string {
  if (!iso) return EMPTY
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return EMPTY
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  return `${date}, ${time24(d)}`
}
