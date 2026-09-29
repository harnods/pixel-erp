/**
 * In-session state for the asset module.
 *
 * Module-level refs, so every screen shares one source of truth and an action
 * on one screen is visible on the next. Nothing persists past a reload — this
 * is enough to try the flows and see that they connect, which is what the
 * prototype is for.
 */
import { ref, computed } from 'vue'
import { approvalRows, varianceRows } from './fixedAssetScreens'
import { fixedAssets } from './fixedAssets'

// ── Approvals ───────────────────────────────────────────────────────────────

export type ApprovalDecision = 'awaiting' | 'approved' | 'sent-back'

const approvalState = ref<Record<string, ApprovalDecision>>(
  Object.fromEntries(approvalRows.map((a) => [String(a.id), 'awaiting' as ApprovalDecision])),
)

export function approvalStatus(id: string): ApprovalDecision {
  return approvalState.value[id] ?? 'awaiting'
}
export function decideApproval(id: string, decision: Exclude<ApprovalDecision, 'awaiting'>) {
  approvalState.value = { ...approvalState.value, [id]: decision }
}
export const awaitingApprovals = computed(() =>
  approvalRows.filter((a) => approvalStatus(String(a.id)) === 'awaiting'),
)
export const decidedApprovals = computed(() =>
  approvalRows.filter((a) => approvalStatus(String(a.id)) !== 'awaiting'),
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

// ── Impairment tests ────────────────────────────────────────────────────────

export interface ImpairmentTest {
  id: string
  assetId: string
  assetName: string
  date: string
  indicator: string
  carrying: number
  recoverable: number
  basis: 'Fair value less costs of disposal' | 'Value in use'
  source: string
  author: string
  outcome: 'Impaired' | 'Not impaired'
  loss: number | null
}

/** The two tests in the sample year. One found nothing, and is kept. */
export const impairmentTests = ref<ImpairmentTest[]>([
  {
    id: 'IT-2026-01', assetId: 'FA-0068', assetName: 'Forklift Toyota 3T',
    date: '30/06/2026', indicator: 'Physical damage',
    carrying: 201_250_000, recoverable: 184_000_000,
    basis: 'Fair value less costs of disposal',
    source: 'Appraisal · PT Penilai Independen',
    author: 'Rizal Candra', outcome: 'Impaired', loss: 17_250_000,
  },
  {
    id: 'IT-2026-02', assetId: 'FA-0093', assetName: 'Registered brand — Central Perk',
    date: '31/12/2026', indicator: 'Annual test · indefinite life',
    carrying: 900_000_000, recoverable: 1_050_000_000,
    basis: 'Value in use', source: 'Management projection',
    author: 'Sari Wulandari', outcome: 'Not impaired', loss: null,
  },
])

/**
 * Record a test. The outcome follows from the figures: an asset is impaired
 * when its recoverable amount is below what it is carried at, and a test that
 * finds nothing is kept, because the obligation is to test.
 */
export function recordImpairmentTest(input: {
  assetId: string
  indicator: string
  recoverable: number
  basis: ImpairmentTest['basis']
  source: string
}) {
  const asset = fixedAssets.find((a) => a.id === input.assetId)
  if (!asset) return
  const carrying = asset.bookValueCommercial ?? asset.cost
  const impaired = input.recoverable < carrying
  const n = impairmentTests.value.length + 1
  impairmentTests.value = [
    {
      id: `IT-2026-${String(n).padStart(2, '0')}`,
      assetId: asset.id,
      assetName: asset.name,
      date: '30/09/2026',
      indicator: input.indicator,
      carrying,
      recoverable: input.recoverable,
      basis: input.basis,
      source: input.source,
      author: 'Rizal Candra',
      outcome: impaired ? 'Impaired' : 'Not impaired',
      loss: impaired ? carrying - input.recoverable : null,
    },
    ...impairmentTests.value,
  ]
}

// ── Depreciation run ────────────────────────────────────────────────────────

/**
 * Which FY2026 periods have been posted to the general ledger.
 *
 * A month is either posted (a journal exists, dated) or a draft. January
 * through August are already closed when the prototype opens; September is the
 * period the user is standing in, and it is the only one they can act on —
 * posting is strictly sequential, so the run is always the earliest unposted
 * month.
 */
export interface PostedRun {
  /** 0-based month index within 2026. */
  month: number
  /** dd/mm/yyyy the journal carries. */
  postedOn: string
  /** The journal number the run produced. */
  journal: string
}

const initialRuns: PostedRun[] = [
  { month: 0, postedOn: '05/02/2026', journal: 'JV-2026-0118' },
  { month: 1, postedOn: '04/03/2026', journal: 'JV-2026-0241' },
  { month: 2, postedOn: '06/04/2026', journal: 'JV-2026-0377' },
  { month: 3, postedOn: '05/05/2026', journal: 'JV-2026-0492' },
  { month: 4, postedOn: '04/06/2026', journal: 'JV-2026-0615' },
  { month: 5, postedOn: '06/07/2026', journal: 'JV-2026-0738' },
  { month: 6, postedOn: '05/08/2026', journal: 'JV-2026-0861' },
  { month: 7, postedOn: '04/09/2026', journal: 'JV-2026-0984' },
]

const postedRuns = ref<PostedRun[]>([...initialRuns])

/**
 * The posting record for a month, or null while it is still a draft.
 *
 * Reads `postedRuns.value` directly so a template calling it registers the ref
 * as a dependency — a helper that closed over a snapshot would render the
 * right answer once and then never update when a period is posted.
 */
export function runFor(month: number): PostedRun | null {
  return postedRuns.value.find((r) => r.month === month) ?? null
}

/** The current period — September 2026, index 8. */
export const CURRENT_MONTH = 8

/**
 * The earliest unposted month. Posting is sequential: a preparer cannot post
 * October while September is open, because the accumulated balances the later
 * run reads from would not exist yet.
 */
export const nextUnposted = computed(() => {
  for (let m = 0; m <= CURRENT_MONTH; m++) if (!runFor(m)) return m
  return null
})

export function postRun(month: number, journal: string, postedOn: string) {
  if (runFor(month)) return
  postedRuns.value = [...postedRuns.value, { month, postedOn, journal }]
}

export function reverseRun(month: number) {
  postedRuns.value = postedRuns.value.filter((r) => r.month !== month)
}

/** Kept for screens that only ask whether the current period is closed. */
export const depreciationPosted = computed(() => !!runFor(CURRENT_MONTH))

// ── Self-check ──────────────────────────────────────────────────────────────

export const selfCheckRunAt = ref('30/09/2026 17:04')
export function rerunSelfCheck() {
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  selfCheckRunAt.value = `30/09/2026 ${hh}:${mm}`
}

// ── Tax group assignment ────────────────────────────────────────────────────

/**
 * Assigning a statutory group is the one fix that unblocks every tax output,
 * so the register, the tax book and the self-check all have to see it.
 */
const assignedGroups = ref<Record<string, string>>({})

export function assignedTaxGroup(id: string): string | null {
  return assignedGroups.value[id] ?? null
}
export function assignTaxGroupTo(id: string, group: string) {
  assignedGroups.value = { ...assignedGroups.value, [id]: group }
}
/** Still missing a statutory group, after anything assigned this session. */
export const unclassifiedAssets = computed(() =>
  fixedAssets.filter((a) => a.taxGroup === null && !assignedGroups.value[a.id]),
)
