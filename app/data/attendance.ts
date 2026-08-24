/**
 * HR attendance exceptions — a DETERMINISTIC generator grounded in the REAL
 * employee directory (`employees`). Replaces the old hardcoded, name-mismatched
 * arrays that used to live in cowork.ts (e.g. "Agus Pratama" for EMP-0006, which
 * the directory actually calls "Rina Pratama"). Now every exception references a
 * real employee id + name, so the Attendance-exceptions Cowork task and any chat
 * answer stay consistent with the directory the model is also given.
 *
 * Pure function of (date, employee index) — no Date.now()/Math.random(), so the
 * same date always yields the same exceptions (SSR-safe, snapshot-stable).
 */
import { employees } from './employees'
import { SIM_TODAY_ISO } from './simClock'

export type AttendanceExceptionType = 'Late clock-in' | 'Missing check-out' | 'Unapproved absence'

export interface AttendanceException {
  employeeId: string
  date: string
  type: AttendanceExceptionType
  /** Clock-in time (for late arrivals) vs the 09:00 shift start. */
  clockIn?: string
  /** Minutes late (late clock-ins only). */
  minutesLate?: number
  /** The stated / inferred reason for this exception. */
  reason: string
  /** Co-worker's read on the pattern — the "why" analysis the user asks for. */
  analysis: string
}

/** Resolve an employee id → real display name from the directory. */
export function attendanceName(employeeId: string): string {
  return employees.find(e => e.employeeId === employeeId || e.id === employeeId)?.fullName ?? employeeId
}

const TYPES: AttendanceExceptionType[] = ['Late clock-in', 'Missing check-out', 'Unapproved absence']

const LATE_REASONS = [
  { reason: 'Commute delay — heavy traffic on the toll road.', analysis: 'Recurring Monday/rush-hour commute pattern.' },
  { reason: 'Client meeting ran over before coming in.', analysis: 'Work-related; minor and expected.' },
  { reason: 'School run before office.', analysis: 'One-off, low concern.' },
  { reason: 'Overslept after a late release the night before.', analysis: 'Follows a late deployment; acceptable.' },
  { reason: 'Early bank run before the office.', analysis: 'Work-related errand.' },
]
const MISSING_REASONS = [
  { reason: 'Stayed late on the month-end close and forgot to tap out.', analysis: 'Close-week overtime; adjust the timesheet manually.' },
  { reason: 'Left from a client site without tapping out.', analysis: 'Field visit — log as remote.' },
  { reason: 'Forgot to tap out after a late inbound receiving.', analysis: 'Recurring for warehouse late shifts — enable auto-checkout.' },
  { reason: 'Attendance device outage at the side entrance.', analysis: 'System glitch — exclude from lateness stats.' },
]
const ABSENT_REASONS = [
  { reason: 'No clock-in and no leave filed.', analysis: 'Unaccounted absence — needs a same-day follow-up.' },
  { reason: 'Called in sick but the leave request was never submitted.', analysis: 'Likely genuine; chase the paperwork.' },
]

/** Simple deterministic hash of an ISO date string. */
function dateSeed(iso: string): number {
  let h = 0
  for (let i = 0; i < iso.length; i++) h = (h * 31 + iso.charCodeAt(i)) >>> 0
  return h
}

/**
 * The attendance exceptions for a given working day — deterministic, always the
 * same for the same date, and always referencing real employees.
 */
export function attendanceExceptionsForDate(iso: string): AttendanceException[] {
  const emps = employees
  if (!emps.length) return []
  const seed = dateSeed(iso)
  const count = 2 + (seed % 3)          // 2–4 exceptions per day
  const out: AttendanceException[] = []
  const used = new Set<number>()
  for (let k = 0; k < count; k++) {
    let ei = (seed + k * 7) % emps.length
    // avoid flagging the same employee twice on one day
    let guard = 0
    while (used.has(ei) && guard++ < emps.length) ei = (ei + 1) % emps.length
    used.add(ei)
    const emp = emps[ei]!
    const empId = emp.employeeId ?? emp.id
    const type = TYPES[(seed + k) % TYPES.length]!
    if (type === 'Late clock-in') {
      const minutesLate = 8 + ((seed + k * 13) % 42)      // 8–49 min
      const mm = String(minutesLate).padStart(2, '0')
      const r = LATE_REASONS[(seed + k) % LATE_REASONS.length]!
      out.push({ employeeId: empId, date: iso, type, clockIn: `09:${mm}`, minutesLate, reason: r.reason, analysis: r.analysis })
    } else if (type === 'Missing check-out') {
      const r = MISSING_REASONS[(seed + k) % MISSING_REASONS.length]!
      out.push({ employeeId: empId, date: iso, type, reason: r.reason, analysis: r.analysis })
    } else {
      const r = ABSENT_REASONS[(seed + k) % ABSENT_REASONS.length]!
      out.push({ employeeId: empId, date: iso, type, reason: r.reason, analysis: r.analysis })
    }
  }
  // Late arrivals first (most common), absences last so findings read naturally.
  return out
}

/** The latest processed attendance day (the daily task runs each morning, so the
 *  freshest log is "yesterday" relative to the sim clock's today). */
export const LATEST_ATTENDANCE_DATE = (() => {
  const d = new Date(SIM_TODAY_ISO + 'T00:00:00')
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
})()

/** Today's (latest processed) exceptions — the default the Cowork task reads. */
export const attendanceExceptions: AttendanceException[] = attendanceExceptionsForDate(LATEST_ATTENDANCE_DATE)
