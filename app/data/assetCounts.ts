/**
 * FG-5 physical verification: count sessions, capture and variance resolution
 * (OD-23 to OD-26).
 *
 * A session is scoped by location (one, or every location in a branch) or by
 * custodian, and its population is frozen when it opens: later register
 * changes do not move what is being counted against. Capture is simulated by
 * typing or pasting tag codes. Finishing the count turns what was not scanned
 * into "not found", and every variance must be resolved by a choice before
 * the session can close (FG5-AC1).
 *
 * Closing applies the resolutions to the register: a transfer or record
 * correction changes custody through `changeCustody`, a capitalisation
 * creates the asset, an impairment records a test, and a write-off disposes
 * the asset through the engine on both books (FG5-AC3). Write-offs follow
 * FG-7: with the switch on, the session raises ONE approval covering all its
 * write-offs with the total (FG7-AC2), and any item above the value threshold
 * gets its own. The session stays "awaiting approval" until they are decided.
 */
import { ref, computed } from 'vue'
import {
  actingUser, viewAs, fixedAssets, findAsset, recordEvent, recordImpairmentTest, createAsset,
  earliestEffectivePeriod, periodEndDate, resetAssetStore,
} from './assetStore'
import type { AssetEvent } from './assetEngine'
import {
  assetLocations, locationBranch, CUSTODIANS, changeCustody, sessionStamp, resetCustody, conditionOf,
  type Condition,
} from './assetCustody'
import {
  isAboveThreshold, raiseRequest, onApprovalDecided, carryingPair, stakeOf,
  approvalSettings, resetApprovals, type ApprovalItem, type ApprovalRequest,
} from './assetApprovals'
import { classMaster } from './fixedAssetScreens'

// ── Types ───────────────────────────────────────────────────────────────────

export type ScopeType = 'location' | 'custodian'
export type SessionStatus = 'counting' | 'resolving' | 'awaiting-approval' | 'closed' | 'abandoned'

export interface PopulationItem {
  assetId: string
  tag: string
  name: string
  expectedLocation: string | null
  expectedCustodian: string | null
}

export interface Scan {
  code: string
  at: string
  by: string
  /** Where the counter was when they scanned it. */
  foundAt: string
  condition: Condition
}

export type FindingKind = 'not-found' | 'wrong-location' | 'damaged' | 'unexpected' | 'unrecorded'

export type ResolutionKind = 'write-off' | 'impairment' | 'transfer' | 'record-correction' | 'capitalise'

export interface Resolution {
  kind: ResolutionKind
  reason: string
  /** Transfer or correction: where the asset is now. */
  location?: string | null
  custodian?: string | null
  condition?: Condition
  /** Impairment: the recoverable amount the test found. */
  recoverable?: number
  /** Capitalise: the new asset. */
  newAsset?: { name: string; class: string; cost: number }
  by: string
  at: string
  /** Once applied at close: what it did, in words. */
  outcome?: string
  /** A write-off or impairment held for approval. */
  approvalId?: string
  applied?: boolean
}

export interface CountSession {
  id: string
  scopeType: ScopeType
  /** A location name, `branch:<name>` for every location in a branch, or a custodian name. */
  scope: string
  scopeLabel: string
  frozenOn: string
  counter: string
  population: PopulationItem[]
  scans: Scan[]
  status: SessionStatus
  resolutions: Record<string, Resolution>
  closedOn: string | null
  closedBy: string | null
  abandonReason: string | null
  /** Why the session went back to resolving, when a write-off was sent back. */
  returnedNote: string | null
}

export interface Variance {
  /** Stable within the session: `V-<assetId>` or `V-<code>` for an unrecorded find. */
  id: string
  kind: FindingKind
  assetId: string | null
  tag: string | null
  name: string
  expected: string | null
  foundAt: string | null
  explanation: string
}

// ── State ───────────────────────────────────────────────────────────────────

export const countSessions = ref<CountSession[]>([])
let seq = 3
function nextSessionId(): string { return `SO-2026-${String(seq++).padStart(2, '0')}` }

const OPEN: SessionStatus[] = ['counting', 'resolving', 'awaiting-approval']
export function isOpenSession(s: CountSession): boolean { return OPEN.includes(s.status) }
export const openSessions = computed(() => countSessions.value.filter(isOpenSession))
export function sessionById(id: string): CountSession | undefined {
  return countSessions.value.find((s) => s.id === id)
}

/** FG-5.6: General Affairs, internal audit (the Owner here) and accounting count. */
export const canCount = computed(() => ['Owner', 'Accounting', 'General Affairs'].includes(viewAs.value))

function update(id: string, fn: (s: CountSession) => CountSession) {
  countSessions.value = countSessions.value.map((s) => (s.id === id ? fn(s) : s))
}

// ── Scope ───────────────────────────────────────────────────────────────────

export interface ScopeOption { value: string; label: string }

/** Every location, plus "all of a branch", for a location-scoped session. */
export const locationScopeOptions = computed<ScopeOption[]>(() => {
  const branches = [...new Set(assetLocations.value.map((l) => l.branch))]
  return [
    ...branches.map((b) => ({ value: `branch:${b}`, label: `All of ${b} (${assetLocations.value.filter((l) => l.branch === b).length} locations)` })),
    ...assetLocations.value.map((l) => ({ value: l.name, label: `${l.name} · ${l.branch}` })),
  ]
})
export const custodianScopeOptions = computed<ScopeOption[]>(() => CUSTODIANS.map((c) => ({ value: c.name, label: c.name })))

function scopeLabel(type: ScopeType, scope: string): string {
  if (type === 'custodian') return `Held by ${scope}`
  return scope.startsWith('branch:') ? `All of ${scope.slice(7)}` : scope
}

/** The locations a scope covers, for choosing where a scan was made. */
export function scopeLocations(s: Pick<CountSession, 'scopeType' | 'scope' | 'population'>): string[] {
  if (s.scopeType === 'location') {
    if (s.scope.startsWith('branch:')) return assetLocations.value.filter((l) => l.branch === s.scope.slice(7)).map((l) => l.name)
    return [s.scope]
  }
  return [...new Set(s.population.map((p) => p.expectedLocation).filter((x): x is string => !!x))]
}

/** The held tangible assets a scope would freeze, as the register stands now. */
export function populationFor(type: ScopeType, scope: string): PopulationItem[] {
  const inScope = (a: { location: string | null; custodian: string | null }) => {
    if (type === 'custodian') return a.custodian === scope
    if (scope.startsWith('branch:')) return !!a.location && locationBranch(a.location) === scope.slice(7)
    return a.location === scope
  }
  return fixedAssets.value
    .filter((a) => a.type === 'Tangible' && a.tag && a.status !== 'Disposed' && a.status !== 'Split' && inScope(a))
    .map((a) => ({ assetId: a.id, tag: a.tag!, name: a.name, expectedLocation: a.location, expectedCustodian: a.custodian }))
}

export type SessionResult = { ok: true; session: CountSession } | { ok: false; reason: string }

/**
 * OD-23. Open a session and freeze its population. Refused when the scope
 * is empty, or when any asset in it is already in an open session, and the
 * refusal names that session (FG5-AC2).
 */
export function createSession(type: ScopeType, scope: string): SessionResult {
  if (!canCount.value) return { ok: false, reason: `Viewing as ${viewAs.value}. Counts are run by General Affairs, internal audit or the Owner.` }
  if (!scope) return { ok: false, reason: type === 'location' ? 'Choose the location to count' : 'Choose the custodian whose assets to count' }
  const population = populationFor(type, scope)
  if (!population.length) return { ok: false, reason: `Nothing to count: no tagged asset is recorded ${type === 'location' ? `at ${scopeLabel(type, scope)}` : `as held by ${scope}`}.` }
  for (const s of openSessions.value) {
    const overlap = population.filter((p) => s.population.some((q) => q.assetId === p.assetId))
    if (overlap.length) {
      const names = overlap.slice(0, 3).map((p) => p.assetId).join(', ')
      return {
        ok: false,
        reason: `${overlap.length} of these assets (${names}${overlap.length > 3 ? ', …' : ''}) ${overlap.length === 1 ? 'is' : 'are'} already in open session ${s.id} (${s.scopeLabel}). An asset cannot be in two open sessions. Close or abandon ${s.id} first.`,
      }
    }
  }
  const session: CountSession = {
    id: nextSessionId(), scopeType: type, scope, scopeLabel: scopeLabel(type, scope),
    frozenOn: sessionStamp(), counter: actingUser.value, population, scans: [],
    status: 'counting', resolutions: {}, closedOn: null, closedBy: null, abandonReason: null, returnedNote: null,
  }
  countSessions.value = [session, ...countSessions.value]
  return { ok: true, session }
}

/** FG-5.3: abandoned, not closed, and excluded from audit evidence. Nothing it proposed is applied. */
export function abandonSession(id: string, reason: string): SessionResult {
  const s = sessionById(id)
  if (!s) return { ok: false, reason: `No session ${id}` }
  if (s.status === 'awaiting-approval') return { ok: false, reason: `${id} has write-offs awaiting approval. They must be decided before the session can be abandoned.` }
  if (!isOpenSession(s)) return { ok: false, reason: `${id} is already ${s.status}` }
  if (!reason.trim()) return { ok: false, reason: 'Say why the session is abandoned' }
  update(id, (x) => ({ ...x, status: 'abandoned', abandonReason: reason.trim(), closedOn: sessionStamp(), closedBy: actingUser.value }))
  return { ok: true, session: sessionById(id)! }
}

// ── Capture (OD-24) ─────────────────────────────────────────────────────────

export interface ScanOutcome { code: string; result: 'counted' | 'duplicate' | 'outside' | 'unrecorded'; message: string }

/**
 * Record scanned or pasted codes. Several may be pasted at once, separated by
 * spaces, commas or new lines. A code on the population is counted; a
 * register tag from outside the scope is an unexpected find; an unknown code
 * is an unrecorded asset.
 */
export function recordScans(id: string, text: string, foundAt: string, condition: Condition = 'Good'): { ok: true; outcomes: ScanOutcome[] } | { ok: false; reason: string } {
  const s = sessionById(id)
  if (!s) return { ok: false, reason: `No session ${id}` }
  if (s.status !== 'counting') return { ok: false, reason: `${id} is no longer counting. Reopen the count to scan more.` }
  if (!canCount.value) return { ok: false, reason: `Viewing as ${viewAs.value}. Counts are recorded by General Affairs, internal audit or the Owner.` }
  const codes = text.split(/[\s,;]+/).map((c) => c.trim().toUpperCase()).filter(Boolean)
  if (!codes.length) return { ok: false, reason: 'Type or paste a tag code' }
  if (!foundAt) return { ok: false, reason: 'Say where you are counting' }
  const outcomes: ScanOutcome[] = []
  const scans = [...s.scans]
  for (const code of codes) {
    if (scans.some((x) => x.code === code)) { outcomes.push({ code, result: 'duplicate', message: `${code} is already counted` }); continue }
    scans.push({ code, at: sessionStamp(), by: actingUser.value, foundAt, condition })
    const pop = s.population.find((p) => p.tag === code)
    if (pop) outcomes.push({ code, result: 'counted', message: `${code} ${pop.name}` })
    else if (fixedAssets.value.some((a) => a.tag === code)) outcomes.push({ code, result: 'outside', message: `${code} is on the register but outside this count` })
    else outcomes.push({ code, result: 'unrecorded', message: `${code} is not on the register` })
  }
  update(id, (x) => ({ ...x, scans }))
  return { ok: true, outcomes }
}

export function removeScan(id: string, code: string) {
  update(id, (x) => (x.status === 'counting' ? { ...x, scans: x.scans.filter((c) => c.code !== code) } : x))
}

/** Finish capture: what was not scanned is now not found, and resolution starts. */
export function finishCounting(id: string): SessionResult {
  const s = sessionById(id)
  if (!s) return { ok: false, reason: `No session ${id}` }
  if (s.status !== 'counting') return { ok: false, reason: `${id} is not counting` }
  update(id, (x) => ({ ...x, status: 'resolving' }))
  return { ok: true, session: sessionById(id)! }
}
export function reopenCounting(id: string): SessionResult {
  const s = sessionById(id)
  if (!s || s.status !== 'resolving') return { ok: false, reason: 'Only a session being resolved can go back to counting' }
  update(id, (x) => ({ ...x, status: 'counting' }))
  return { ok: true, session: sessionById(id)! }
}

// ── Lines and variances ─────────────────────────────────────────────────────

export type LineResult = 'found' | 'wrong-location' | 'damaged' | 'not-counted' | 'not-found'
export interface CountLine extends PopulationItem { result: LineResult; scan: Scan | null }

export function countLines(s: CountSession): CountLine[] {
  return s.population.map((p) => {
    const scan = s.scans.find((x) => x.code === p.tag) ?? null
    let result: LineResult
    if (!scan) result = s.status === 'counting' ? 'not-counted' : 'not-found'
    else if (scan.condition === 'Damaged' || scan.condition === 'Unusable') result = 'damaged'
    else if (scan.foundAt !== p.expectedLocation) result = 'wrong-location'
    else result = 'found'
    return { ...p, result, scan }
  })
}

export function variancesOf(s: CountSession): Variance[] {
  const out: Variance[] = []
  for (const l of countLines(s)) {
    if (l.result === 'not-found') {
      out.push({ id: `V-${l.assetId}`, kind: 'not-found', assetId: l.assetId, tag: l.tag, name: l.name, expected: l.expectedLocation, foundAt: null, explanation: `Expected at ${l.expectedLocation ?? 'no recorded location'}, not scanned` })
    } else if (l.result === 'wrong-location') {
      out.push({ id: `V-${l.assetId}`, kind: 'wrong-location', assetId: l.assetId, tag: l.tag, name: l.name, expected: l.expectedLocation, foundAt: l.scan!.foundAt, explanation: `Recorded at ${l.expectedLocation ?? 'no location'}, found at ${l.scan!.foundAt}` })
    } else if (l.result === 'damaged') {
      out.push({ id: `V-${l.assetId}`, kind: 'damaged', assetId: l.assetId, tag: l.tag, name: l.name, expected: l.expectedLocation, foundAt: l.scan!.foundAt, explanation: `Found ${l.scan!.condition.toLowerCase()}` })
    }
  }
  for (const sc of s.scans) {
    if (s.population.some((p) => p.tag === sc.code)) continue
    const a = fixedAssets.value.find((x) => x.tag === sc.code)
    if (a) {
      out.push({ id: `V-${a.id}`, kind: 'unexpected', assetId: a.id, tag: sc.code, name: a.name, expected: a.location, foundAt: sc.foundAt, explanation: `On the register at ${a.location ?? 'no location'}, found at ${sc.foundAt}` })
    } else {
      out.push({ id: `V-${sc.code}`, kind: 'unrecorded', assetId: null, tag: sc.code, name: 'Not on the register', expected: null, foundAt: sc.foundAt, explanation: `Tag ${sc.code} found at ${sc.foundAt}, no asset carries it` })
    }
  }
  return out
}

/** The choices each finding allows (OD-25). */
export const RESOLUTION_OPTIONS: Record<FindingKind, { value: ResolutionKind; label: string; hint: string }[]> = {
  'not-found': [
    { value: 'write-off', label: 'Write off', hint: 'The asset is gone. Disposed with no proceeds on both books.' },
    { value: 'transfer', label: 'Transfer', hint: 'It was moved without a record. Update its location and custodian.' },
    { value: 'record-correction', label: 'Record correction', hint: 'A mis-scan: confirmed present on a recount. Nothing changes.' },
  ],
  'wrong-location': [
    { value: 'transfer', label: 'Transfer', hint: 'It was moved. Relocate it to where it was found.' },
    { value: 'record-correction', label: 'Record correction', hint: 'The register was wrong. Correct the recorded location.' },
  ],
  damaged: [
    { value: 'impairment', label: 'Impairment', hint: 'Record an impairment test with the recoverable amount. Accounting book only.' },
    { value: 'write-off', label: 'Write off', hint: 'Beyond use. Disposed with no proceeds on both books.' },
    { value: 'record-correction', label: 'Record correction', hint: 'Keep it as it is, recording its condition.' },
  ],
  unexpected: [
    { value: 'transfer', label: 'Transfer', hint: 'It was moved here. Relocate it to where it was found.' },
    { value: 'record-correction', label: 'Record correction', hint: 'The register was wrong. Correct the recorded location.' },
  ],
  unrecorded: [
    { value: 'capitalise', label: 'Capitalise as new asset', hint: 'Add it to the register without leaving the session.' },
    { value: 'record-correction', label: 'Record correction', hint: 'Not a company asset, or expensed correctly. No register change.' },
  ],
}

export const FINDING_LABEL: Record<FindingKind, string> = {
  'not-found': 'Not found',
  'wrong-location': 'Different location',
  damaged: 'Found damaged',
  unexpected: 'Outside this count',
  unrecorded: 'Not on the register',
}

export type ResolveInput = Omit<Resolution, 'by' | 'at' | 'outcome' | 'approvalId' | 'applied'>

/** Validate and record a proposed resolution. Nothing touches the register until close. */
export function resolveVariance(sessionId: string, varianceId: string, input: ResolveInput): { ok: true } | { ok: false; field: string; reason: string } {
  const s = sessionById(sessionId)
  if (!s) return { ok: false, field: 'session', reason: `No session ${sessionId}` }
  if (s.status !== 'resolving') return { ok: false, field: 'session', reason: s.status === 'counting' ? 'Finish the count before resolving variances' : `${s.id} is ${s.status}` }
  if (!canCount.value) return { ok: false, field: 'role', reason: `Viewing as ${viewAs.value}. Resolutions are proposed by General Affairs, internal audit or the Owner.` }
  const v = variancesOf(s).find((x) => x.id === varianceId)
  if (!v) return { ok: false, field: 'variance', reason: `No variance ${varianceId}` }
  if (!RESOLUTION_OPTIONS[v.kind].some((o) => o.value === input.kind)) return { ok: false, field: 'kind', reason: 'Choose how this variance resolves' }
  if (input.kind === 'transfer' || (input.kind === 'record-correction' && (v.kind === 'wrong-location' || v.kind === 'unexpected'))) {
    if (!input.location || !locationBranch(input.location)) return { ok: false, field: 'location', reason: 'Choose the location from the list' }
  }
  if (input.kind === 'impairment' && (!input.recoverable || input.recoverable < 0)) return { ok: false, field: 'recoverable', reason: 'Enter the recoverable amount the test found' }
  if (input.kind === 'capitalise') {
    const n = input.newAsset
    if (!n?.name.trim()) return { ok: false, field: 'name', reason: 'Name the asset' }
    if (!classMaster.some((c) => c.class === n.class)) return { ok: false, field: 'class', reason: 'Choose its class' }
    if (!n.cost || n.cost <= 0) return { ok: false, field: 'cost', reason: 'Enter what it cost' }
  }
  if (!input.reason.trim()) return { ok: false, field: 'reason', reason: 'Say what happened. The explanation is the audit evidence.' }
  update(sessionId, (x) => ({ ...x, resolutions: { ...x.resolutions, [varianceId]: { ...input, reason: input.reason.trim(), by: actingUser.value, at: sessionStamp() } } }))
  return { ok: true }
}

export function clearResolution(sessionId: string, varianceId: string) {
  update(sessionId, (x) => {
    if (x.status !== 'resolving') return x
    const r = { ...x.resolutions }
    delete r[varianceId]
    return { ...x, resolutions: r }
  })
}

export function unresolvedOf(s: CountSession): Variance[] {
  return variancesOf(s).filter((v) => !s.resolutions[v.id])
}

// ── Close (OD-26) ───────────────────────────────────────────────────────────

function writeOffEventNow(): Omit<AssetEvent, 'id'> {
  const p = earliestEffectivePeriod.value
  return { kind: 'disposal', period: p, date: periodEndDate(p), recordedBy: actingUser.value, proceeds: 0 } as Omit<AssetEvent, 'id'>
}

export type CloseResult =
  | { ok: true; applied: number; requests: ApprovalRequest[] }
  | { ok: false; reason: string }

/**
 * Close: refused while any variance is unresolved, naming how many (FG5-AC1).
 * Otherwise every resolution is applied, and write-offs and impairments that
 * need authorisation are raised instead: one request for the session's
 * write-offs together, one per item above the value threshold.
 */
export function closeSession(id: string): CloseResult {
  const s = sessionById(id)
  if (!s) return { ok: false, reason: `No session ${id}` }
  if (s.status === 'counting') return { ok: false, reason: 'Finish the count first. Unscanned assets become not found, and each needs a resolution.' }
  if (s.status !== 'resolving') return { ok: false, reason: `${id} is ${s.status}` }
  if (!canCount.value) return { ok: false, reason: `Viewing as ${viewAs.value}. Closing a count needs General Affairs, internal audit or the Owner.` }
  const open = unresolvedOf(s)
  if (open.length) return { ok: false, reason: `${open.length} ${open.length === 1 ? 'variance is' : 'variances are'} still unresolved. Resolve each one before closing ${id}.` }

  const variances = variancesOf(s)
  const resolutions = { ...s.resolutions }
  let applied = 0
  const bundle: { kind: 'write-off' | 'value-change'; item: Omit<ApprovalItem, 'applied'> }[] = []
  const single: { kind: 'write-off' | 'value-change'; item: Omit<ApprovalItem, 'applied'>; reason: string }[] = []

  for (const v of variances) {
    const r = { ...resolutions[v.id]! }
    // Closing again after a send-back: what was applied stays applied.
    if (r.applied) continue
    const src = `${id} ${v.id}`
    if (r.kind === 'transfer' || r.kind === 'record-correction') {
      if (v.assetId && (r.location || r.custodian || v.kind === 'damaged')) {
        const input: Parameters<typeof changeCustody>[1] = {}
        if (r.location) input.location = r.location
        if (r.custodian) input.custodian = r.custodian
        if (v.kind === 'damaged') input.condition = s.scans.find((x) => x.code === v.tag)?.condition ?? 'Damaged'
        const res = changeCustody(v.assetId, input, `${r.kind === 'transfer' ? 'Transfer' : 'Record correction'} from count ${id}: ${r.reason}`, src)
        r.outcome = res.ok ? `${res.changed.join(' and ')} updated` : `No register change (${res.reason})`
      } else {
        r.outcome = 'No register change'
      }
      r.applied = true
      applied++
    } else if (r.kind === 'capitalise') {
      const n = r.newAsset!
      const m = classMaster.find((c) => c.class === n.class)!
      const loc = v.foundAt ?? scopeLocations(s)[0] ?? null
      const res = createAsset({
        name: n.name.trim(), class: n.class, branch: (loc && locationBranch(loc)) || 'Central Jakarta', cost: n.cost,
        inServiceDate: periodEndDate(earliestEffectivePeriod.value).replace(/^\d{2}/, '01'),
        lifeMonths: parseInt(m.commercialLife, 10) * 12, residual: 0, method: 'straight-line',
        taxGroup: m.defaultTaxGroup, location: loc ?? undefined,
      })
      r.outcome = res.ok ? `Capitalised as ${res.id}` : `Not capitalised: ${res.reason}`
      r.applied = res.ok
      applied++
    } else if (r.kind === 'write-off' || r.kind === 'impairment') {
      const a = findAsset(v.assetId!)!
      const pair = carryingPair(a.id)
      const isWO = r.kind === 'write-off'
      const change: ApprovalItem['change'] = isWO
        ? { type: 'event', event: writeOffEventNow() }
        : { type: 'impairment-test', input: { assetId: a.id, indicator: 'Physical damage', recoverable: r.recoverable!, basis: 'Fair value less costs of disposal', source: `Count ${id}` } }
      const stake = isWO ? stakeOf(pair.accounting, pair.tax) : Math.max(0, (pair.accounting ?? 0) - r.recoverable!)
      const kind = isWO ? 'write-off' as const : 'value-change' as const
      const item = { assetId: a.id, assetName: a.name, label: isWO ? `Write off ${a.id} ${a.name}` : `Impair ${a.id} ${a.name} to Rp${r.recoverable!.toLocaleString('id-ID')}`, change, ...pair, varianceId: v.id }
      const switchOn = kind === 'write-off' ? approvalSettings.value.writeOff : approvalSettings.value.valueChange
      if (isAboveThreshold(stake)) {
        single.push({ kind, item, reason: `Above the Rp${approvalSettings.value.threshold!.toLocaleString('id-ID')} approval threshold` })
      } else if (switchOn) {
        bundle.push({ kind, item })
      } else {
        // Authorisation off: it completes now and records who acted (FG-7.3).
        const res = isWO ? recordEvent(a.id, change.type === 'event' ? change.event : writeOffEventNow()) : recordImpairmentTest((change as { type: 'impairment-test'; input: Parameters<typeof recordImpairmentTest>[0] }).input)
        r.outcome = res.ok ? (isWO ? 'Written off: disposed with no proceeds on both books' : 'Impairment test recorded') : `Not applied: ${res.reason}`
        r.applied = res.ok
        applied++
      }
    }
    resolutions[v.id] = r
  }

  const requests: ApprovalRequest[] = []
  for (const kind of ['write-off', 'value-change'] as const) {
    const items = bundle.filter((b) => b.kind === kind).map((b) => b.item)
    if (!items.length) continue
    const label = kind === 'write-off' ? 'Write-off' : 'Impairment'
    requests.push(raiseRequest({
      kind, sessionId: id,
      title: `${label} · count ${id} · ${items.length} ${items.length === 1 ? 'asset' : 'assets'}`,
      reason: `${kind === 'write-off' ? 'Write-off' : 'Value change'} needs approval (Asset settings). One request for the whole count`,
      items,
    }))
  }
  for (const x of single) {
    requests.push(raiseRequest({
      kind: x.kind, sessionId: id,
      title: `${x.kind === 'write-off' ? 'Write-off' : 'Impairment'} · ${x.item.assetId} ${x.item.assetName} · count ${id}`,
      reason: `${x.reason}, so it is authorised on its own`, items: [x.item],
    }))
  }
  for (const req of requests) for (const it of req.items) {
    const r = resolutions[it.varianceId!]!
    resolutions[it.varianceId!] = { ...r, approvalId: req.id, outcome: `Sent for approval · ${req.id}` }
  }
  update(id, (x) => ({
    ...x, resolutions, returnedNote: null,
    status: requests.length ? 'awaiting-approval' : 'closed',
    closedOn: requests.length ? null : sessionStamp(), closedBy: requests.length ? null : actingUser.value,
  }))
  return { ok: true, applied, requests }
}

/** Requests raised by a session. */
export function sessionRequestIds(s: CountSession): string[] {
  return [...new Set(Object.values(s.resolutions).map((r) => r.approvalId).filter((x): x is string => !!x))]
}

// When an approval raised by a count is decided, the session follows: applied
// write-offs are marked done; sent-back ones reopen as unresolved variances.
onApprovalDecided((req) => {
  if (!req.sessionId) return
  const s = sessionById(req.sessionId)
  if (!s || s.status !== 'awaiting-approval') return
  const resolutions = { ...s.resolutions }
  for (const it of req.items) {
    if (!it.varianceId || !resolutions[it.varianceId]) continue
    if (req.status === 'approved') {
      resolutions[it.varianceId] = { ...resolutions[it.varianceId]!, applied: true, outcome: it.change.type === 'event' ? `Approved ${req.id} by ${req.decidedBy}: disposed with no proceeds on both books` : `Approved ${req.id} by ${req.decidedBy}: impairment test recorded` }
    } else {
      delete resolutions[it.varianceId]
    }
  }
  // The session waits while any request it raised is undecided; then it
  // reopens if a send-back left variances unresolved, and closes otherwise.
  const stillWaiting = Object.values(resolutions).some((r) => r.approvalId && !r.applied && r.approvalId !== req.id)
  const reopened = variancesOf({ ...s, resolutions }).some((v) => !resolutions[v.id])
  const closes = !stillWaiting && !reopened
  update(s.id, (x) => ({
    ...x, resolutions,
    status: stillWaiting ? 'awaiting-approval' : reopened ? 'resolving' : 'closed',
    closedOn: closes ? sessionStamp() : null,
    closedBy: closes ? req.decidedBy : null,
    returnedNote: req.status === 'sent-back'
      ? `${req.id} was sent back by ${req.decidedBy}: ${req.note}. Resolve ${req.items.length === 1 ? 'that variance' : 'those variances'} again.`
      : x.returnedNote,
  }))
})

/** Condition as captured, for the scan form default. */
export { conditionOf }

/** Return the asset module, custody, approvals and counts to the sample data. */
export function resetAll() {
  resetAssetStore()
  resetCustody()
  resetApprovals()
  seq = 3
  countSessions.value = []
}
