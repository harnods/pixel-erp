/**
 * In-session state for the asset module's workflow screens.
 *
 * Approvals and count variances live here. Everything with a figure in it
 * (depreciation runs, journals, impairment tests, tax groups, the self-check)
 * lives in `assetStore.ts`, the single source of truth, and is re-exported
 * below under the names the screens already use. Nothing persists past a
 * reload.
 */
import { ref, computed } from 'vue'
import { approvalRows, varianceRows } from './fixedAssetScreens'
import {
  postedRunFor, postPeriod, reversePeriod, nextOpenPeriod, periodOfMonth, monthOfPeriod,
  runSelfCheck, selfCheckFor, CURRENT_MONTH, CURRENT_PERIOD,
  type DepreciationRun,
} from './assetStore'

export {
  impairmentTests, recordImpairmentTest, assignTaxGroupTo, assignedTaxGroup, unclassifiedAssets,
  CURRENT_MONTH,
  type ImpairmentTest,
} from './assetStore'

// ── Approvals ───────────────────────────────────────────────────────────────

export type ApprovalDecision = 'awaiting' | 'approved' | 'sent-back'

const approvalState = ref<Record<string, ApprovalDecision>>({})

export function approvalStatus(id: string): ApprovalDecision {
  return approvalState.value[id] ?? 'awaiting'
}
export function decideApproval(id: string, decision: Exclude<ApprovalDecision, 'awaiting'>) {
  approvalState.value = { ...approvalState.value, [id]: decision }
}
export const awaitingApprovals = computed(() =>
  approvalRows.value.filter((a) => approvalStatus(String(a.id)) === 'awaiting'),
)
export const decidedApprovals = computed(() =>
  approvalRows.value.filter((a) => approvalStatus(String(a.id)) !== 'awaiting'),
)

// ── Count variances ─────────────────────────────────────────────────────────

const resolvedVariances = ref<Set<string>>(
  new Set(varianceRows.filter((v) => v.status !== 'Open').map((v) => String(v.id))),
)

export function isVarianceResolved(id: string): boolean {
  return resolvedVariances.value.has(id)
}
export function resolveVariance(id: string) {
  const next = new Set(resolvedVariances.value)
  next.add(id)
  resolvedVariances.value = next
}
export function reopenVariance(id: string) {
  const next = new Set(resolvedVariances.value)
  next.delete(id)
  resolvedVariances.value = next
}
export const openVariances = computed(() =>
  varianceRows.filter((v) => !resolvedVariances.value.has(String(v.id))),
)

/** A session closes only when every variance has an outcome the ledger understands. */
export const countSessionClosed = ref(false)
export const canCloseSession = computed(() => openVariances.value.length === 0)

// ── Depreciation run ────────────────────────────────────────────────────────

/** A posted run, in the shape the schedule screen reads. */
export interface PostedRun {
  /** 0-based month index within 2026. */
  month: number
  /** dd/mm/yyyy the journal carries. */
  postedOn: string
  /** The journal number the run produced. */
  journal: string
}

/**
 * The posting record for a month, or null while it is still open. Reads the
 * store's runs so a template calling it re-renders when a period posts.
 */
export function runFor(month: number): PostedRun | null {
  const r: DepreciationRun | null = postedRunFor(periodOfMonth(month))
  return r ? { month, postedOn: r.postedOn ?? '', journal: r.journal ?? '' } : null
}

/** The earliest unposted month. Posting is sequential. */
export const nextUnposted = computed(() =>
  nextOpenPeriod.value === null ? null : monthOfPeriod(nextOpenPeriod.value),
)

/** Post a month. The journal number and date come from the store. */
export function postRun(month: number) {
  return postPeriod(periodOfMonth(month))
}

/** Reverse a month: a reversing journal, never a deletion (LR-4). */
export function reverseRun(month: number) {
  return reversePeriod(periodOfMonth(month))
}

/** Kept for screens that only ask whether the current period is closed. */
export const depreciationPosted = computed(() => !!runFor(CURRENT_MONTH))

// ── Self-check ──────────────────────────────────────────────────────────────

/** When the retained self-check for the current period was taken. */
export const selfCheckRunAt = computed(() => selfCheckFor(CURRENT_PERIOD)?.runAt ?? 'never')
export function rerunSelfCheck() {
  runSelfCheck(CURRENT_PERIOD)
}
