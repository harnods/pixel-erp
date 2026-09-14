/**
 * Replenishment run ledger — what a "cycle" is in a prototype with no scheduler.
 *
 * The PRD's FSN rules (US-015) need a notion of successive cycles: a class change
 * must clear a hysteresis band AND hold for N consecutive runs before it commits.
 * There is no cron here, so **a cycle is one Recalculate**. This module is the
 * storage for that: the last N runs, plus each SKU-warehouse's committed class and
 * how many cycles its candidate has been pending.
 *
 * Pure storage on purpose — it computes nothing. `replenishment.ts` owns the
 * classification maths and calls `writeRun()`; keeping them apart is what lets the
 * engine seed backdated history without a circular import.
 *
 * Reading a worklist must never mutate this. Otherwise opening the page ten times
 * would silently burn ten cycles and the dwell mechanic would be meaningless.
 */

import { clearStore, readStore, writeStore } from './replenishmentStore'

const STORAGE_KEY = 'erp-db:replenishment-runs'

export type FsnClass = 'fast' | 'slow' | 'non-moving' | 'unclassified'

export interface FsnClassMemo {
  /** The class currently in force. */
  cls: FsnClass
  /** Run number it was committed on. */
  since: number
  /** Consecutive runs the candidate below has held. */
  dwell: number
  /** Class waiting to commit once dwell reaches the configured cycles. */
  candidate: FsnClass | null
}

export interface ReplenishmentRun {
  runNo: number
  /** When the recalculation was triggered. */
  ranAt: string
  /** The data anchor it evaluated against. */
  asOf: string
  scope: 'all' | string
  pairs: number
  flagged: number
  needsSetup: number
  reclassified: number
}

export interface ReplenishmentRunState {
  /** Newest first, capped. */
  runs: ReplenishmentRun[]
  /** keyed `${sku}::${warehouseId}` */
  fsn: Record<string, FsnClassMemo>
}

const MAX_RUNS = 12

export const memoKey = (sku: string, warehouseId: string) => `${sku}::${warehouseId}`

function read(): ReplenishmentRunState {
  const raw = readStore<Partial<ReplenishmentRunState>>(STORAGE_KEY, {})
  return { runs: raw.runs ?? [], fsn: raw.fsn ?? {} }
}

function write(state: ReplenishmentRunState): void {
  writeStore(STORAGE_KEY, { ...state, runs: state.runs.slice(0, MAX_RUNS) })
}

export function getRunState(): ReplenishmentRunState {
  return read()
}

export function lastRun(): ReplenishmentRun | null {
  return read().runs[0] ?? null
}

export function currentRunNo(): number {
  return read().runs[0]?.runNo ?? 0
}

export function classMemo(sku: string, warehouseId: string): FsnClassMemo | undefined {
  return read().fsn[memoKey(sku, warehouseId)]
}

export function hasRunHistory(): boolean {
  return read().runs.length > 0
}

/**
 * Commit one run: append the record and replace the class memos it produced.
 * Called only from an explicit recalculation, never from a render.
 */
export function writeRun(run: Omit<ReplenishmentRun, 'runNo'>, memos: Record<string, FsnClassMemo>): ReplenishmentRun {
  const state = read()
  const runNo = (state.runs[0]?.runNo ?? 0) + 1
  const record: ReplenishmentRun = { ...run, runNo }
  state.runs = [record, ...state.runs].slice(0, MAX_RUNS)
  state.fsn = { ...state.fsn, ...memos }
  write(state)
  return record
}

export function resetRunState(): void {
  clearStore(STORAGE_KEY)
}
