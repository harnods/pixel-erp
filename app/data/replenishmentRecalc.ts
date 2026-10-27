/**
 * In-progress recalculation state (engineering RFC).
 *
 * A change to replenishment policy does NOT recompute the worklist instantly in the
 * user's eyes: the affected numbers are "being recalculated" for a short window, and
 * until that finishes those rows must not be used (their figures still reflect the old
 * policy, so a PR raised from them would be wrong). Two shapes:
 *
 *  • BROAD (company config / a category default / a warehouse's settings): the worklist
 *    shows one header banner — "N products are being recalculated" — and HIDES the
 *    affected rows until the window closes.
 *  • SINGLE (one SKU × warehouse edited on its own): that one row stays visible with a
 *    "Recalculating" tag; nothing else is touched.
 *
 * The job is persisted (survives the navigation from Settings back to the worklist) and
 * is purely time-based: it is "active" until `startedAt + durationMs`, then it clears.
 * Timing is simulated in the prototype so the states are actually visible.
 */
import { ref } from 'vue'
import { readStore, writeStore, clearStore, bumpReplenishmentRevision } from './replenishmentStore'

const KEY = 'erp-db:replenishment-recalc-job'
/** Simulated recalculation window — long enough to see the banner / tag, short enough
 *  not to get in the way. */
export const RECALC_DURATION_MS = 2500

export type RecalcScope =
  | { kind: 'all' }
  | { kind: 'category'; categories: string[] }
  | { kind: 'warehouse'; warehouseId: string }
  | { kind: 'sku'; sku: string; warehouseId: string }

export interface RecalcJob {
  scope: RecalcScope
  /** epoch ms */
  startedAt: number
  durationMs: number
}

/** Bumped whenever a job starts or is cleared, so view computeds refresh. */
export const recalcJobRevision = ref(0)

export function startRecalc(scope: RecalcScope, durationMs: number = RECALC_DURATION_MS): void {
  writeStore<RecalcJob>(KEY, { scope, startedAt: Date.now(), durationMs })
  recalcJobRevision.value++
  bumpReplenishmentRevision()
}

/** The job if one is still within its window, else null. Does not mutate. */
export function activeRecalc(now: number = Date.now()): RecalcJob | null {
  const job = readStore<RecalcJob | null>(KEY, null)
  if (!job) return null
  if (now >= job.startedAt + job.durationMs) return null
  return job
}

/** Milliseconds left on the active job, or 0 if there is none / it has expired. */
export function recalcRemainingMs(now: number = Date.now()): number {
  const job = readStore<RecalcJob | null>(KEY, null)
  if (!job) return 0
  return Math.max(0, job.startedAt + job.durationMs - now)
}

export function clearRecalc(): void {
  clearStore(KEY)
  recalcJobRevision.value++
  bumpReplenishmentRevision()
}

/** A broad job (company / category / warehouse) banners + hides; a single SKU job tags. */
export function isBroadScope(scope: RecalcScope): boolean {
  return scope.kind !== 'sku'
}

/** Whether a worklist row falls within a job's scope (the rows it hides or tags). */
export function rowMatchesScope(scope: RecalcScope, sku: string, warehouseId: string, category: string): boolean {
  switch (scope.kind) {
    case 'all': return true
    case 'category': return scope.categories.includes(category)
    case 'warehouse': return scope.warehouseId === warehouseId
    case 'sku': return scope.sku === sku && scope.warehouseId === warehouseId
  }
}
