import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import type { ActivityEntry } from '~/components/patterns/ActivityLogModal.vue'

/**
 * Activity log — the audit trail behind "Last updated by …" on a detail page.
 *
 * PRD v0.5 requires reservation activity to be LOGGED, not merely toasted: every
 * reserve, unreserve and release must be traceable to an actor with its component
 * and qty, and every release must name which of the three triggers produced it
 * (UC-02, UC-03, UC-15 R-1, US-8). A release with no log entry is indistinguishable
 * from stock that went missing.
 *
 * That is why this is an append-only STORE rather than a derivation. The repo's
 * `rule/activity-log-entries` says to build entries from the record's own data,
 * because the prototype has no audit store — true for records whose history can be
 * read off their current state. It cannot be true here: "who released 8 sacks, and
 * why" leaves no trace in the resulting numbers. Pages merge these entries with the
 * derived ones (see `entriesFor`), so a record with no logged history still reads
 * the way it always did.
 *
 * **Retention.** v0.5 keeps stock transitions — reserve, release, issue, return —
 * with the stock history, never pruned with the UI changelog: they are financial
 * records, and pruning them would erase the trail of an allocation while its
 * balance remains. Nothing is pruned here.
 */

/** What a logged event is attached to. */
export type ActivitySubject = 'work-order' | 'stock-request'

export interface ActivityLogEntry {
  subjectType: ActivitySubject
  /** id of the work order or stock request this happened to */
  subjectId: string
  /** ISO timestamp */
  date: string
  /** who did it */
  user: string
  /** short verb phrase, e.g. "Reserved material" */
  activity: string
  /** label/value pairs shown in the DETAILS column */
  details: { label: string; value: string }[]
}

const SNAPSHOT_KEY = 'activityLog'

export const activityLog = reactive<ActivityLogEntry[]>(
  loadSnapshot<ActivityLogEntry>(SNAPSHOT_KEY) ?? [],
)

function persist(): void {
  saveSnapshot(SNAPSHOT_KEY, activityLog)
}

/**
 * Record one event. Appends, never updates — an audit trail that can be edited is
 * not an audit trail.
 */
export function logActivity(entry: Omit<ActivityLogEntry, 'date'> & { date?: string }): void {
  activityLog.push({ ...entry, date: entry.date ?? new Date().toISOString() })
  persist()
}

/** Log the same event against two records at once — e.g. a work order and its request. */
export function logActivityFor(
  subjects: { type: ActivitySubject; id: string }[],
  event: { user: string; activity: string; details: { label: string; value: string }[] },
): void {
  const date = new Date().toISOString()
  for (const s of subjects) {
    activityLog.push({ subjectType: s.type, subjectId: s.id, date, ...event })
  }
  persist()
}

/**
 * Entries for one record, newest first, ready for `ActivityLogModal`.
 *
 * `fallback` is the derived history the page would have shown before anything was
 * logged (creation, seeded edits). Logged events are merged on top and the whole
 * list re-sorted, so a seeded record reads coherently and a record the user has
 * acted on shows those actions in place (`rule/activity-log-entries`).
 */
export function entriesFor(
  subjectType: ActivitySubject,
  subjectId: string,
  fallback: ActivityEntry[] = [],
): ActivityEntry[] {
  const logged: ActivityEntry[] = activityLog
    .filter(e => e.subjectType === subjectType && e.subjectId === subjectId)
    .map(e => ({ date: e.date, user: e.user, activity: e.activity, details: e.details }))
  return [...logged, ...fallback].sort((a, b) => b.date.localeCompare(a.date))
}

/** Most recent logged event for a record — drives the "Last updated by …" line. */
export function lastActivity(
  subjectType: ActivitySubject,
  subjectId: string,
): ActivityLogEntry | undefined {
  return activityLog
    .filter(e => e.subjectType === subjectType && e.subjectId === subjectId)
    .reduce<ActivityLogEntry | undefined>(
      (latest, e) => (!latest || e.date > latest.date ? e : latest),
      undefined,
    )
}
