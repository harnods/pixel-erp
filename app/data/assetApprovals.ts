/**
 * FG-7 approvals for asset events (OD-30, OD-31).
 *
 * LR-5: approval is a setting, off by default, set separately for disposal,
 * write-off and value change. With a switch off the event records at once
 * and carries the acting user (FG7-AC1). With it on, the event is held here
 * as a request and nothing reaches the books until it is approved; approving
 * applies the held event through the store's `recordEvent`, so the figures
 * are the engine's. Sending back cancels it.
 *
 * Authorisation attaches to the decision, not to the asset: a count session
 * raises one request covering all its write-offs, with the detail and the
 * total (FG7-AC2). A value threshold, when set, makes anything above it need
 * its own request regardless of the switches.
 *
 * FG7-AC3: the person who raised a request cannot decide it. The check reads
 * `actingUser`, which follows View as.
 */
import { ref, computed } from 'vue'
import {
  actingUser, viewAs, findAsset, recordEvent, recordImpairmentTest, recordImpairmentReversal,
  previewEvent, carryingAsBooked, earliestEffectivePeriod, periodEndDate, onAssetStoreReset,
  type EventResult,
} from './assetStore'
import type { AssetEvent } from './assetEngine'
import { sessionStamp, stampKey } from './assetCustody'

// ── Settings (LR-5) ─────────────────────────────────────────────────────────

export type ApprovalKind = 'disposal' | 'write-off' | 'value-change'

export interface ApprovalSettings {
  disposal: boolean
  writeOff: boolean
  valueChange: boolean
  /** Above this value (Rp) an event needs its own approval whatever the switches say. Null is no threshold. */
  threshold: number | null
}
const DEFAULT_SETTINGS: ApprovalSettings = { disposal: false, writeOff: false, valueChange: false, threshold: null }
export const approvalSettings = ref<ApprovalSettings>({ ...DEFAULT_SETTINGS })

/** FG-7.6: only the Owner configures which events need authorisation. */
export const canConfigureApprovals = computed(() => viewAs.value === 'Owner')

export function setApprovalSwitch(key: 'disposal' | 'writeOff' | 'valueChange', on: boolean): string | null {
  if (!canConfigureApprovals.value) return `Viewing as ${viewAs.value}. Only the Owner changes approval rules.`
  approvalSettings.value = { ...approvalSettings.value, [key]: on }
  return null
}
export function setApprovalThreshold(v: number | null): string | null {
  if (!canConfigureApprovals.value) return `Viewing as ${viewAs.value}. Only the Owner changes approval rules.`
  if (v !== null && (!Number.isFinite(v) || v <= 0)) return 'Enter an amount above zero, or leave it empty for no threshold'
  approvalSettings.value = { ...approvalSettings.value, threshold: v }
  return null
}

function switchFor(kind: ApprovalKind): boolean {
  const s = approvalSettings.value
  return kind === 'disposal' ? s.disposal : kind === 'write-off' ? s.writeOff : s.valueChange
}

export function isAboveThreshold(value: number): boolean {
  const th = approvalSettings.value.threshold
  return th !== null && value > th
}

/** Whether an event of this kind and value must wait for approval, and why. */
export function approvalNeeded(kind: ApprovalKind, value: number): string | null {
  if (switchFor(kind)) return `${KIND_LABEL[kind]} needs approval (Asset settings)`
  if (isAboveThreshold(value)) return `Above the ${rp(approvalSettings.value.threshold!)} approval threshold`
  return null
}

export const KIND_LABEL: Record<ApprovalKind, string> = {
  disposal: 'Disposal',
  'write-off': 'Write-off',
  'value-change': 'Value change',
}

function rp(n: number): string { return `Rp${Math.round(n).toLocaleString('id-ID')}` }

// ── What a request holds ────────────────────────────────────────────────────

/** What approving applies. Always the store's own recording functions. */
export type HeldChange =
  | { type: 'event'; event: Omit<AssetEvent, 'id'> }
  | { type: 'impairment-test'; input: Parameters<typeof recordImpairmentTest>[0] }
  | { type: 'impairment-reversal'; input: Parameters<typeof recordImpairmentReversal>[0] }

export interface ApprovalItem {
  assetId: string
  assetName: string
  /** What happens to the asset, in words. */
  label: string
  change: HeldChange
  /** Carrying amounts when raised. Tax is null with no tax book. */
  accounting: number | null
  tax: number | null
  /** The count variance it resolves, if raised from a count. */
  varianceId?: string
  /** Set once approving has applied it. */
  applied?: boolean
}

export type ApprovalStatus = 'awaiting' | 'approved' | 'sent-back'

export interface ApprovalRequest {
  id: string
  kind: ApprovalKind
  title: string
  reason: string
  raisedBy: string
  raisedOn: string
  items: ApprovalItem[]
  /** The count session it came from. */
  sessionId: string | null
  status: ApprovalStatus
  decidedBy: string | null
  decidedOn: string | null
  note: string | null
}

export const approvalRequests = ref<ApprovalRequest[]>([])
// AP-0031 was the FA-0071 disposal decided before this session (fixtures);
// new requests follow it, so the first one a count raises is AP-0032 (SIM-4).
let seq = 32
function nextId(): string { return `AP-${String(seq++).padStart(4, '0')}` }

export const awaitingRequests = computed(() => approvalRequests.value.filter((r) => r.status === 'awaiting'))
export function requestById(id: string): ApprovalRequest | undefined {
  return approvalRequests.value.find((r) => r.id === id)
}
export function pendingFor(assetId: string): ApprovalRequest[] {
  return awaitingRequests.value.filter((r) => r.items.some((i) => i.assetId === assetId))
}
export function requestTotal(r: ApprovalRequest): { accounting: number; tax: number } {
  return {
    accounting: r.items.reduce((s, i) => s + (i.accounting ?? 0), 0),
    tax: r.items.reduce((s, i) => s + (i.tax ?? 0), 0),
  }
}

/** The larger of the two carrying amounts: value leaving either book is what is at stake. */
export function carryingPair(assetId: string): { accounting: number | null; tax: number | null } {
  const a = findAsset(assetId)
  return { accounting: a?.bookValueCommercial ?? null, tax: a?.bookValueFiscal ?? null }
}
export function stakeOf(accounting: number | null, tax: number | null): number {
  return Math.max(accounting ?? 0, tax ?? 0)
}

/**
 * How much a value change moves the carrying amount: the difference the
 * held event would make on the accounting book at its period, from a replay.
 */
export function valueChangeStake(assetId: string, event: Omit<AssetEvent, 'id'>): number {
  const pv = previewEvent(assetId, event)
  if (!pv.ok || !pv.after) return 0
  const before = carryingAsBooked(pv.before, 'accounting', event.period) ?? 0
  const after = carryingAsBooked(pv.after, 'accounting', event.period) ?? 0
  return Math.abs(after - before)
}

export function raiseRequest(input: {
  kind: ApprovalKind
  title: string
  reason: string
  items: Omit<ApprovalItem, 'applied'>[]
  sessionId?: string | null
}): ApprovalRequest {
  const r: ApprovalRequest = {
    id: nextId(), kind: input.kind, title: input.title, reason: input.reason,
    raisedBy: actingUser.value, raisedOn: sessionStamp(),
    items: input.items.map((i) => ({ ...i })), sessionId: input.sessionId ?? null,
    status: 'awaiting', decidedBy: null, decidedOn: null, note: null,
  }
  approvalRequests.value = [r, ...approvalRequests.value]
  return r
}

// ── Deciding ────────────────────────────────────────────────────────────────

/** FG-7.6: the approver role and the Owner hold approving authority. */
export const canApprove = computed(() => viewAs.value === 'Approver' || viewAs.value === 'Owner')

/** Why the acting user cannot decide this request, or null. */
export function decisionRefusal(r: ApprovalRequest): string | null {
  if (r.status !== 'awaiting') return `${r.id} is already ${r.status === 'approved' ? 'approved' : 'sent back'}`
  if (r.raisedBy === actingUser.value) {
    return `${actingUser.value} raised ${r.id}, so cannot decide it. An approver cannot approve an event they raised. Switch View as to someone else.`
  }
  if (!canApprove.value) return `Viewing as ${viewAs.value}. Deciding needs approving authority: switch View as to Approver.`
  return null
}

type Listener = (r: ApprovalRequest) => void
const listeners: Listener[] = []
/** Called after a request is decided, so the screen that raised it can follow up. */
export function onApprovalDecided(fn: Listener) { listeners.push(fn) }

function apply(assetId: string, change: HeldChange, raisedBy: string): EventResult | { ok: true; event: null } {
  // The event is recorded against the person who raised it; the approval
  // itself is the trail of who decided.
  if (change.type === 'event') return recordEvent(assetId, { ...change.event, recordedBy: raisedBy } as Omit<AssetEvent, 'id'>)
  if (change.type === 'impairment-test') return recordImpairmentTest(change.input)
  return recordImpairmentReversal(change.input)
}

/**
 * Approve: apply every held change through the store. If any cannot be
 * applied the request stays awaiting and the reason is returned, so nothing
 * is half-approved silently (NFR2).
 */
export function approveRequest(id: string, note = ''): { ok: true } | { ok: false; reason: string } {
  const r = requestById(id)
  if (!r) return { ok: false, reason: `No request ${id}` }
  const refusal = decisionRefusal(r)
  if (refusal) return { ok: false, reason: refusal }
  const items = r.items.map((i) => ({ ...i }))
  for (const it of items) {
    if (it.applied) continue
    const res = apply(it.assetId, it.change, r.raisedBy)
    if (!res.ok) {
      approvalRequests.value = approvalRequests.value.map((x) => (x.id === id ? { ...x, items } : x))
      return { ok: false, reason: `${it.assetId}: ${res.reason}` }
    }
    it.applied = true
  }
  const decided: ApprovalRequest = { ...r, items, status: 'approved', decidedBy: actingUser.value, decidedOn: sessionStamp(), note: note.trim() || null }
  approvalRequests.value = approvalRequests.value.map((x) => (x.id === id ? decided : x))
  for (const fn of listeners) fn(decided)
  return { ok: true }
}

/** Send back: the held changes are cancelled and nothing reaches the books. */
export function sendBackRequest(id: string, note: string): { ok: true } | { ok: false; reason: string } {
  const r = requestById(id)
  if (!r) return { ok: false, reason: `No request ${id}` }
  const refusal = decisionRefusal(r)
  if (refusal) return { ok: false, reason: refusal }
  if (!note.trim()) return { ok: false, reason: 'Say why it is going back, so the requester knows what to change' }
  const decided: ApprovalRequest = { ...r, status: 'sent-back', decidedBy: actingUser.value, decidedOn: sessionStamp(), note: note.trim() }
  approvalRequests.value = approvalRequests.value.map((x) => (x.id === id ? decided : x))
  for (const fn of listeners) fn(decided)
  return { ok: true }
}

// ── Gating an event from the value-change drawer ────────────────────────────

/** Which switch a drawer action falls under. */
export function kindForAction(action: string, proceeds: number): ApprovalKind {
  if (action === 'dispose') return proceeds > 0 ? 'disposal' : 'write-off'
  if (action === 'dispose-part') return 'disposal'
  return 'value-change'
}

/**
 * Either record the change now or hold it for approval. Returns the request
 * when held, so the caller can say where it went.
 */
export function gateChange(assetId: string, kind: ApprovalKind, label: string, change: HeldChange, stake: number, record: () => { ok: boolean; reason?: string }):
  | { ok: true; held: ApprovalRequest | null }
  | { ok: false; reason: string } {
  const why = approvalNeeded(kind, stake)
  if (!why) {
    const r = record()
    return r.ok ? { ok: true, held: null } : { ok: false, reason: r.reason ?? 'The change could not be recorded' }
  }
  if (pendingFor(assetId).length) {
    return { ok: false, reason: `${assetId} already has ${pendingFor(assetId)[0]!.id} awaiting approval. Wait for that decision first.` }
  }
  const a = findAsset(assetId)!
  const pair = carryingPair(assetId)
  const req = raiseRequest({
    kind, title: `${KIND_LABEL[kind]} · ${assetId} ${a.name}`, reason: why,
    items: [{ assetId, assetName: a.name, label, change, ...pair }],
  })
  return { ok: true, held: req }
}

/** A write-off held for approval: a full disposal with no proceeds at the end of the open period. */
export function writeOffEvent(): Omit<AssetEvent, 'id'> {
  const p = earliestEffectivePeriod.value
  return { kind: 'disposal', period: p, date: periodEndDate(p), recordedBy: actingUser.value, proceeds: 0 } as Omit<AssetEvent, 'id'>
}

// ── Trail on the asset (OD-31) ──────────────────────────────────────────────

export interface TrailRow { when: string; who: string; what: string; note: string | null }

/** Every request touching an asset, raised and decided, for its History. */
export function approvalTrailFor(assetId: string): TrailRow[] {
  const rows: TrailRow[] = []
  for (const r of approvalRequests.value) {
    const it = r.items.find((i) => i.assetId === assetId)
    if (!it) continue
    const scope = r.items.length > 1 ? ` (one of ${r.items.length} items)` : ''
    rows.push({ when: r.raisedOn, who: r.raisedBy, what: `Approval ${r.id} requested: ${it.label}${scope}`, note: r.reason + (r.sessionId ? ` · from count ${r.sessionId}` : '') })
    if (r.status === 'approved') rows.push({ when: r.decidedOn!, who: r.decidedBy!, what: `Approval ${r.id} approved`, note: `${r.note ? `${r.note}. ` : ''}Applied through the engine on both books` })
    if (r.status === 'sent-back') rows.push({ when: r.decidedOn!, who: r.decidedBy!, what: `Approval ${r.id} sent back`, note: `${r.note}. Nothing was recorded` })
  }
  return rows.sort((a, b) => stampKey(b.when) - stampKey(a.when))
}

export function resetApprovals() {
  seq = 32
  approvalRequests.value = []
  approvalSettings.value = { ...DEFAULT_SETTINGS }
}
// One reset for the whole module: the store runs this with its own.
onAssetStoreReset(resetApprovals)
