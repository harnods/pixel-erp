/**
 * C-1 — a raw material's request date lives inside the work order's production plan:
 * "The date range cannot be earlier than the planned start date in the work order
 * and cannot be later than the planned finish date."
 *
 * Pure helpers so the rule is one thing, used by the New work order form and
 * covered by tests. Dates are compared by calendar day only; the picker speaks
 * DD/MM/YYYY (rule/date-picker-variants), so that format is parsed here too.
 */

export interface PlanWindow { start: Date; end: Date }

/** Midnight of the same calendar day — time of day never decides a date rule. */
export const dayStart = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate())

/** The plan range picker's value → a window, or null while no plan is set. A one-day plan has end = start. */
export function planWindowOf(planDates: Date[]): PlanWindow | null {
  const [start, end] = planDates
  return start ? { start: dayStart(start), end: dayStart(end ?? start) } : null
}

/** Is this day outside the plan? With no plan set, nothing is. */
export function isOutsideWindow(d: Date, w: PlanWindow | null): boolean {
  return !!w && (dayStart(d) < w.start || dayStart(d) > w.end)
}

export const toDDMMYYYY = (d: Date): string =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`

export function parseDDMMYYYY(v: string): Date | null {
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null
}

/** A DD/MM/YYYY value that parses and falls outside the window. Empty or unparsable is not "outside". */
export function displayDateOutside(display: string, w: PlanWindow | null): boolean {
  const d = parseDDMMYYYY(display)
  return !!d && isOutsideWindow(d, w)
}
