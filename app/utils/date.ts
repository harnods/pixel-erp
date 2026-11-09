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

/**
 * A date as the user's calendar sees it — `YYYY-MM-DD` in LOCAL time.
 *
 * `toISOString().slice(0, 10)` is the UTC day, which is the day before east of UTC
 * for anything before 07:00 in WIB — a transaction saved at 06:40 would be dated
 * yesterday. Use this wherever a business date is stored or compared.
 */
export function localDate(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

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
