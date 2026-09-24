/**
 * Replenishment run ledger — what a "cycle" is in a prototype with no scheduler.
 *
 * There is no cron here, so **a cycle is one Recalculate**. This module stores the
 * last N runs, so the worklist can show an "as of / last recalculated" line and
 * report what each run produced.
 *
 * Pure storage on purpose — it computes nothing. `replenishment.ts` owns the maths
 * and calls `writeRun()`.
 *
 * Reading a worklist must never mutate this.
 */

import { clearStore, readStore, writeStore } from './replenishmentStore'

const STORAGE_KEY = 'erp-db:replenishment-runs'

export type FsnClass = 'fast' | 'slow' | 'non-moving' | 'unclassified'

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
}

export interface ReplenishmentRunState {
  /** Newest first, capped. */
  runs: ReplenishmentRun[]
}

const MAX_RUNS = 12

function read(): ReplenishmentRunState {
  const raw = readStore<Partial<ReplenishmentRunState>>(STORAGE_KEY, {})
  return { runs: raw.runs ?? [] }
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

export function hasRunHistory(): boolean {
  return read().runs.length > 0
}

/**
 * Commit one run: append the record. Called only from an explicit recalculation,
 * never from a render.
 */
export function writeRun(run: Omit<ReplenishmentRun, 'runNo'>): ReplenishmentRun {
  const state = read()
  const runNo = (state.runs[0]?.runNo ?? 0) + 1
  const record: ReplenishmentRun = { ...run, runNo }
  state.runs = [record, ...state.runs].slice(0, MAX_RUNS)
  write(state)
  return record
}

export function resetRunState(): void {
  clearStore(STORAGE_KEY)
}
