/**
 * FG-4 custody: who holds each asset, where it is, and in what condition.
 *
 * The location and the custodian live on the asset's record in the store
 * (`assetRecords`), so every screen that reads the register sees a change at
 * once. This module owns what the store does not: the maintained location
 * list (FG4-AC3, a location is chosen from it, never typed), the custodian
 * list, each asset's condition, and the change log for every custody field
 * (FG4-AC2: previous value, new value, actor, date and reason are kept).
 *
 * Session only, like the store. `resetCustody()` returns it to the sample.
 */
import { ref, computed } from 'vue'
import { assetRecords, actingUser, fixedAssets, viewAs } from './assetStore'
import type { FixedAsset } from './fixedAssets'

// ── The session clock ───────────────────────────────────────────────────────

/**
 * "Now" for anything done by hand in the session. The prototype's today is
 * 30/09/2026; each action takes the next minute, so a trail reads in the
 * order things happened.
 */
let clockMinute = 0
export function sessionStamp(): string {
  const m = 9 * 60 + clockMinute++
  return `30/09/2026 ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
/** Sortable key for dd/mm/yyyy with an optional hh:mm. */
export function stampKey(s: string): number {
  const [d = '', time = ''] = s.split(' ')
  const [dd = '1', mm = '1', yyyy = '1970'] = d.split('/')
  const [hh = '0', mi = '0'] = time ? time.split(':') : []
  return (Number(yyyy) * 10000 + Number(mm) * 100 + Number(dd)) * 10000 + (time ? Number(hh) * 60 + Number(mi) + 1 : 0)
}

// ── Maintained lists ────────────────────────────────────────────────────────

export interface AssetLocation { name: string; branch: string }

/** The locations the sample company keeps, per branch. Asset settings adds to it. */
const SEED_LOCATIONS: AssetLocation[] = [
  { name: 'Floors 1–5 HQ, Sudirman Street', branch: 'Central Jakarta' },
  { name: 'Floors 2–4 HQ', branch: 'Central Jakarta' },
  { name: 'Floor 3 HQ', branch: 'Central Jakarta' },
  { name: 'HQ, all floors', branch: 'Central Jakarta' },
  { name: 'HQ vehicle pool', branch: 'Central Jakarta' },
  { name: 'Plant room B1', branch: 'Central Jakarta' },
  { name: 'Server room B1', branch: 'Central Jakarta' },
  { name: 'Plant Rungkut, Bay 3', branch: 'Surabaya' },
  { name: 'Plant Rungkut, Bay 5', branch: 'Surabaya' },
  { name: 'Rungkut Warehouse', branch: 'Surabaya' },
  { name: 'Rungkut office', branch: 'Surabaya' },
  { name: 'Surabaya pool', branch: 'Surabaya' },
  { name: 'Medan Warehouse', branch: 'Medan' },
  { name: 'Medan Warehouse office', branch: 'Medan' },
  { name: 'Medan pool', branch: 'Medan' },
]
export const BRANCHES = ['Central Jakarta', 'Surabaya', 'Medan']

export const assetLocations = ref<AssetLocation[]>([...SEED_LOCATIONS])

export function locationBranch(name: string): string | null {
  return assetLocations.value.find((l) => l.name === name)?.branch ?? null
}

/** Asset settings: add a location to the list. Returns an error to show, or null. */
export function addLocation(name: string, branch: string): string | null {
  const n = name.trim()
  if (!n) return 'Name the location'
  if (!BRANCHES.includes(branch)) return 'Choose the branch it belongs to'
  if (assetLocations.value.some((l) => l.name.toLowerCase() === n.toLowerCase())) return `${n} is already on the list`
  assetLocations.value = [...assetLocations.value, { name: n, branch }]
  return null
}

export interface Custodian { name: string; person: string; department: string; branch: string }

/** The people and teams who can hold an asset. The value on the asset is `name`. */
export const CUSTODIANS: Custodian[] = [
  { name: 'Fitri Handayani (GA)', person: 'Fitri Handayani', department: 'General Affairs', branch: 'Central Jakarta' },
  { name: 'Dewi Lestari (Directors)', person: 'Dewi Lestari', department: 'Directors', branch: 'Central Jakarta' },
  { name: 'IT Support', person: 'IT Support', department: 'Technology', branch: 'Central Jakarta' },
  { name: 'Agus Priyanto (Production)', person: 'Agus Priyanto', department: 'Production', branch: 'Surabaya' },
  { name: 'Budi Hartono (Warehouse)', person: 'Budi Hartono', department: 'Warehouse', branch: 'Surabaya' },
  { name: 'Rudi Santoso (Warehouse)', person: 'Rudi Santoso', department: 'Warehouse', branch: 'Medan' },
  { name: 'Siti Rahma (GA)', person: 'Siti Rahma', department: 'General Affairs', branch: 'Medan' },
]

/** Custodians marked as having left. Their assets stay listed until reassigned. */
export const leftCustodians = ref<string[]>([])

export const CONDITIONS = ['Good', 'Fair', 'Damaged', 'Unusable'] as const
export type Condition = typeof CONDITIONS[number]

/** The forklift was impaired for physical damage in June; everything else is in working order. */
const SEED_CONDITIONS: Record<string, Condition> = { 'FA-0068': 'Damaged' }
const conditions = ref<Record<string, Condition>>({ ...SEED_CONDITIONS })

/** Condition of a tangible asset. Intangibles have none. */
export function conditionOf(a: Pick<FixedAsset, 'id' | 'type'>): Condition | null {
  if (a.type !== 'Tangible') return null
  return conditions.value[a.id] ?? 'Good'
}

// ── Who may edit custody ────────────────────────────────────────────────────

/** FG-4.6: General Affairs maintains the physical pane; the Owner has full access. */
export const canEditCustody = computed(() => ['Owner', 'Accounting', 'General Affairs'].includes(viewAs.value))

// ── Change log ──────────────────────────────────────────────────────────────

export type CustodyField = 'Custodian' | 'Location' | 'Condition'
export interface CustodyChange {
  assetId: string
  field: CustodyField
  from: string | null
  to: string | null
  by: string
  at: string
  reason: string
  /** A count session the change came from, if any. */
  source: string | null
}
export const custodyLog = ref<CustodyChange[]>([])

export function custodyHistoryFor(assetId: string): CustodyChange[] {
  return custodyLog.value.filter((c) => c.assetId === assetId).slice().reverse()
}

/** Held tangible assets: the ones custody applies to. */
export const heldTangible = computed(() =>
  fixedAssets.value.filter((a) => a.type === 'Tangible' && a.status !== 'Disposed' && a.status !== 'Split'),
)

/** FG-4.3: no custodian, or one who has left. A normal state, surfaced rather than blocked. */
export const unassignedAssets = computed(() =>
  heldTangible.value.filter((a) => !a.custodian || leftCustodians.value.includes(a.custodian) || !a.location),
)

/** Everything one custodian holds. */
export function heldBy(custodian: string): FixedAsset[] {
  return heldTangible.value.filter((a) => a.custodian === custodian)
}

export interface CustodyInput {
  custodian?: string | null
  location?: string | null
  condition?: Condition
}
export type CustodyResult = { ok: true; changed: CustodyField[] } | { ok: false; field: string; reason: string }

/**
 * Change custody fields on one asset. The location must come from the list
 * (FG4-AC3), a reason is required, and each changed field is logged with its
 * previous and new value, the actor and the time (FG4-AC2). A location in
 * another branch moves the asset's branch with it.
 */
export function changeCustody(assetId: string, input: CustodyInput, reason: string, source: string | null = null): CustodyResult {
  const rec = assetRecords.value.find((s) => s.id === assetId)
  const view = fixedAssets.value.find((a) => a.id === assetId)
  if (!rec || !view) return { ok: false, field: 'asset', reason: `No asset ${assetId}` }
  if (view.type !== 'Tangible') return { ok: false, field: 'asset', reason: `${assetId} is not a physical asset, so it has no custody` }
  if (view.status === 'Disposed' || view.status === 'Split') return { ok: false, field: 'asset', reason: `${assetId} is no longer held` }
  if (!canEditCustody.value) return { ok: false, field: 'role', reason: `Viewing as ${viewAs.value}. Custody is maintained by General Affairs or the Owner.` }
  if (input.location !== undefined && input.location !== null && !locationBranch(input.location)) {
    return { ok: false, field: 'location', reason: 'Choose a location from the list. Add a new one in Asset settings first.' }
  }
  if (input.custodian !== undefined && input.custodian !== null && !CUSTODIANS.some((c) => c.name === input.custodian)) {
    return { ok: false, field: 'custodian', reason: 'Choose a custodian from the list' }
  }
  if (!reason.trim()) return { ok: false, field: 'reason', reason: 'Say why custody is changing. The reason is what makes the history usable later.' }

  const at = sessionStamp()
  const by = actingUser.value
  const changes: CustodyChange[] = []
  const next = { ...rec }
  if (input.custodian !== undefined && input.custodian !== rec.custodian) {
    changes.push({ assetId, field: 'Custodian', from: rec.custodian, to: input.custodian, by, at, reason: reason.trim(), source })
    next.custodian = input.custodian
  }
  if (input.location !== undefined && input.location !== rec.location) {
    changes.push({ assetId, field: 'Location', from: rec.location, to: input.location, by, at, reason: reason.trim(), source })
    next.location = input.location
    const b = input.location ? locationBranch(input.location) : null
    if (b) next.branch = b
  }
  const cur = conditionOf(view)
  if (input.condition !== undefined && input.condition !== cur) {
    changes.push({ assetId, field: 'Condition', from: cur, to: input.condition, by, at, reason: reason.trim(), source })
    conditions.value = { ...conditions.value, [assetId]: input.condition }
  }
  if (!changes.length) return { ok: false, field: 'custodian', reason: 'Nothing has changed: custodian, location and condition are as recorded' }
  if (next.custodian !== rec.custodian || next.location !== rec.location) {
    assetRecords.value = assetRecords.value.map((s) => (s.id === assetId ? next : s))
  }
  custodyLog.value = [...custodyLog.value, ...changes]
  return { ok: true, changed: changes.map((c) => c.field) }
}

/** A custodian leaves. Nothing moves until someone reassigns; the assets are listed meanwhile. */
export function markCustodianLeft(name: string): string | null {
  if (!canEditCustody.value) return `Viewing as ${viewAs.value}. Custody is maintained by General Affairs or the Owner.`
  if (!leftCustodians.value.includes(name)) leftCustodians.value = [...leftCustodians.value, name]
  return null
}

/** Reassign everything one custodian holds. Each asset gets its own logged change. */
export function reassignAll(from: string, to: string, reason: string): CustodyResult {
  if (from === to) return { ok: false, field: 'custodian', reason: 'Choose someone other than the current holder' }
  const ids = heldBy(from).map((a) => a.id)
  if (!ids.length) return { ok: false, field: 'custodian', reason: `${from} holds nothing` }
  for (const id of ids) {
    const r = changeCustody(id, { custodian: to }, reason)
    if (!r.ok) return r
  }
  return { ok: true, changed: ['Custodian'] }
}

/** Custodians as the custody card reads them: derived from the register, never counted by hand. */
export const custodianSummary = computed(() =>
  CUSTODIANS.map((c) => {
    const held = heldBy(c.name)
    return {
      ...c,
      held,
      locations: [...new Set(held.map((a) => a.location).filter((x): x is string => !!x))],
      hasLeft: leftCustodians.value.includes(c.name),
    }
  }).filter((c) => c.held.length || c.hasLeft),
)

export function resetCustody() {
  clockMinute = 0
  assetLocations.value = [...SEED_LOCATIONS]
  leftCustodians.value = []
  conditions.value = { ...SEED_CONDITIONS }
  custodyLog.value = []
}
