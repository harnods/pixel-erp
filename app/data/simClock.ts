/**
 * Unified simulation clock for the production-ready Cowork mock data.
 *
 * The legacy modules anchor dates to `master.ts` TODAY_ISO (2026-06-26) via ±offset
 * helpers. The new full-year time-series datasets (1 Jan 2026 → today) and every
 * Cowork task/chat use THIS anchor instead, so "today" is consistent across the
 * co-worker: 22 Aug 2026. Keep it a hard literal (deterministic, SSR-safe — no
 * Date.now()).
 */
export const SIM_TODAY_ISO = '2026-08-22'
export const SIM_START_ISO = '2026-01-01'

export const SIM_TODAY = new Date(SIM_TODAY_ISO + 'T00:00:00')
export const SIM_START = new Date(SIM_START_ISO + 'T00:00:00')

const DAY = 86_400_000

/** ISO (yyyy-mm-dd) for a date N days after the 1 Jan 2026 start. */
export function simDay(offsetDays: number): string {
  return new Date(SIM_START.getTime() + offsetDays * DAY).toISOString().slice(0, 10)
}
/** ISO for a date N days before "today" (22 Aug 2026). */
export function simDaysAgo(n: number): string {
  return new Date(SIM_TODAY.getTime() - n * DAY).toISOString().slice(0, 10)
}
/** Whole days between an ISO date and "today" (positive = in the past). */
export function daysSince(iso: string): number {
  return Math.round((SIM_TODAY.getTime() - new Date(iso + 'T00:00:00').getTime()) / DAY)
}
/** Whole days from today until an ISO date (positive = in the future). */
export function daysUntil(iso: string): number {
  return Math.round((new Date(iso + 'T00:00:00').getTime() - SIM_TODAY.getTime()) / DAY)
}
/** Number of days in the simulated window so far (1 Jan → today). */
export const SIM_SPAN_DAYS = Math.round((SIM_TODAY.getTime() - SIM_START.getTime()) / DAY)
