/**
 * Advanced date filter — shared value type + range/label resolution for the
 * AdvanceDateFilter popover (app/components/patterns/AdvanceDateFilter.vue).
 *
 * A filter value carries a `mode` (a preset or a granularity) plus whatever
 * anchor/range data that mode needs. `resolveDateFilterRange` turns it into an
 * inclusive [start, end] window a page can filter rows against; `dateFilterLabel`
 * turns it into the trigger-button text.
 */

export type DateFilterMode =
  | 'today' | 'last7' | 'last30'
  | 'day' | 'week' | 'month' | 'quarter' | 'year'
  | 'custom'

export interface DateFilterValue {
  mode: DateFilterMode
  /** anchor ISO date (YYYY-MM-DD) for day/week/month/quarter/year modes */
  date?: string
  /** custom range bounds, ISO */
  rangeStart?: string
  rangeEnd?: string
}

export interface DateRange { start: Date; end: Date }

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}
export function toIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
export function fromIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, (m ?? 1) - 1, d ?? 1)
}

/** Resolve a filter value into an inclusive [start, end] day range. `null` = no filter. */
export function resolveDateFilterRange(value: DateFilterValue | null | undefined, today: Date): DateRange | null {
  if (!value) return null
  const t = startOfDay(today)
  switch (value.mode) {
    case 'today': return { start: t, end: t }
    case 'last7': return { start: addDays(t, -6), end: t }
    case 'last30': return { start: addDays(t, -29), end: t }
    case 'day': {
      const d = startOfDay(value.date ? fromIso(value.date) : today)
      return { start: d, end: d }
    }
    case 'week': {
      const d = startOfDay(value.date ? fromIso(value.date) : today)
      const start = addDays(d, -d.getDay())
      return { start, end: addDays(start, 6) }
    }
    case 'month': {
      const d = value.date ? fromIso(value.date) : today
      return { start: new Date(d.getFullYear(), d.getMonth(), 1), end: new Date(d.getFullYear(), d.getMonth() + 1, 0) }
    }
    case 'quarter': {
      const d = value.date ? fromIso(value.date) : today
      const q = Math.floor(d.getMonth() / 3)
      return { start: new Date(d.getFullYear(), q * 3, 1), end: new Date(d.getFullYear(), q * 3 + 3, 0) }
    }
    case 'year': {
      const d = value.date ? fromIso(value.date) : today
      return { start: new Date(d.getFullYear(), 0, 1), end: new Date(d.getFullYear(), 11, 31) }
    }
    case 'custom': {
      if (!value.rangeStart) return null
      const start = startOfDay(fromIso(value.rangeStart))
      const end = value.rangeEnd ? startOfDay(fromIso(value.rangeEnd)) : start
      return start.getTime() <= end.getTime() ? { start, end } : { start: end, end: start }
    }
    default: return null
  }
}

/** Whether an ISO date string falls inside the value's resolved range. */
export function dateFilterMatches(iso: string | undefined, value: DateFilterValue | null | undefined, today: Date): boolean {
  if (!value) return true
  if (!iso) return false
  const range = resolveDateFilterRange(value, today)
  if (!range) return true
  const d = startOfDay(fromIso(iso)).getTime()
  return d >= range.start.getTime() && d <= range.end.getTime()
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function fmtDDMMYYYY(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0')
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  return `${day}/${mo}/${d.getFullYear()}`
}

/** Trigger-button label for a filter value. */
export function dateFilterLabel(value: DateFilterValue | null | undefined, today: Date): string {
  if (!value) return ''
  switch (value.mode) {
    case 'today': return 'Today'
    case 'last7': return 'Last 7 days'
    case 'last30': return 'Last 30 days'
    case 'day': {
      const d = value.date ? fromIso(value.date) : today
      return fmtDDMMYYYY(d)
    }
    case 'week': {
      const r = resolveDateFilterRange(value, today)
      return r ? `${fmtDDMMYYYY(r.start)} - ${fmtDDMMYYYY(r.end)}` : ''
    }
    case 'month': {
      const d = value.date ? fromIso(value.date) : today
      return `${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`
    }
    case 'quarter': {
      const d = value.date ? fromIso(value.date) : today
      return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`
    }
    case 'year': {
      const d = value.date ? fromIso(value.date) : today
      return String(d.getFullYear())
    }
    case 'custom': {
      if (!value.rangeStart) return 'Custom'
      return `${fmtDDMMYYYY(fromIso(value.rangeStart))} - ${value.rangeEnd ? fmtDDMMYYYY(fromIso(value.rangeEnd)) : '…'}`
    }
    default: return ''
  }
}
