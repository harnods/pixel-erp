/**
 * Guided tours: the work SIM-4 to SIM-7 do on Next (auto-play).
 *
 * This is a demo layer for walkthroughs, not a product requirement; engineers
 * building the product should ignore it. The only coupling to product screens
 * is the data-tour="..." attributes they carry.
 *
 * Each function does what the reader would have done on the screen, through
 * the same store functions the screen calls, so the result the next screen
 * shows is the one a reader clicking through would get.
 * tests/asset-tours-autoplay-2.spec.ts replays them after resetAssetStore().
 */
import { onAssetStoreReset, recordEvent, recordImpairmentTest } from '~/data/assetStore'
import { changeCustody } from '~/data/assetCustody'
import { createSession, recordScans, finishCounting, resolveVariance, closeSession } from '~/data/assetCounts'
import { setApprovalSwitch, approveRequest, gateChange, kindForAction, carryingPair, stakeOf, valueChangeStake } from '~/data/assetApprovals'
import { findLease, blankModification, modifyLease } from '~/data/assetLeases'
import { blankForm, previewValueChange, type ValueChangeForm } from '~/data/assetValueChange'

/** Ids the steps hand to each other within one run. */
export const workCtx = { sessionId: '', requestId: '' }
onAssetStoreReset(() => Object.assign(workCtx, { sessionId: '', requestId: '' }))

/** The value-change drawer's commit: preview, then record or hold for approval. */
function commitValueChange(id: string, f: ValueChangeForm) {
  const pv = previewValueChange(id, f)
  if (pv.error || pv.refusal || !pv.event) throw new Error(pv.refusal ?? pv.error?.error ?? `No change on ${id}`)
  const change = { type: 'event' as const, event: pv.event }
  const pair = carryingPair(id)
  const stake = f.action === 'dispose-part'
    ? Math.round(stakeOf(pair.accounting, pair.tax) * (Number(f.percent) || 0) / 100)
    : valueChangeStake(id, pv.event)
  const r = gateChange(id, kindForAction(f.action, Number(f.proceeds) || 0), `${f.action} on ${id}`, change, stake, () => recordEvent(id, pv.event!))
  if (!r.ok) throw new Error(r.reason)
}

// ── SIM-4 ───────────────────────────────────────────────────────────────────

export function assignInnova() {
  const r = changeCustody('FA-0047', { custodian: 'Siti Rahma (GA)', location: 'HQ vehicle pool' }, 'Assigned to the HQ pool')
  if (!r.ok) throw new Error(r.reason)
}
export function turnOnWriteOffApproval() {
  const e = setApprovalSwitch('writeOff', true)
  if (e) throw new Error(e)
}
export function startMedanCount() {
  const r = createSession('location', 'Medan Warehouse')
  if (!r.ok) throw new Error(r.reason)
  workCtx.sessionId = r.session.id
}
export function scanThree() {
  const id = workCtx.sessionId
  for (const [code, at] of [['TAG-MDN-068', 'Medan Warehouse'], ['TAG-MDN-083', 'Medan Warehouse'], ['TAG-MDN-023', 'Medan pool']] as const) {
    const r = recordScans(id, code, at)
    if (!r.ok) throw new Error(r.reason)
  }
}
export function finishMedanCount() {
  const r = finishCounting(workCtx.sessionId)
  if (!r.ok) throw new Error(r.reason)
}
export function resolveTwo() {
  const id = workCtx.sessionId
  const a = resolveVariance(id, 'V-FA-0023', { kind: 'transfer', location: 'Medan pool', reason: 'Moved to the pool store' })
  if (!a.ok) throw new Error(a.reason)
  const b = resolveVariance(id, 'V-FA-0064', { kind: 'write-off', reason: 'Not found at the count' })
  if (!b.ok) throw new Error(b.reason)
}
export function closeMedanCount() {
  const r = closeSession(workCtx.sessionId)
  if (!r.ok) throw new Error(r.reason)
  workCtx.requestId = r.requests[0]?.id ?? ''
}
export function approveWriteOff() {
  const r = approveRequest(workCtx.requestId)
  if (!r.ok) throw new Error(r.reason)
}

// ── SIM-5 ───────────────────────────────────────────────────────────────────

export function extendCakung() {
  const l = findLease('LS-004')!
  const r = modifyLease(l.id, { ...blankModification(l), reason: 'Addendum 2, twelve-month extension' })
  if (!r.ok) throw new Error(r.reason)
}

// ── SIM-6 ───────────────────────────────────────────────────────────────────

export function testGoodwill() {
  const r = recordImpairmentTest({
    assetId: 'FA-0091', indicator: 'Annual test · indefinite life', recoverable: 2_600_000_000,
    basis: 'Value in use', source: 'Management projection',
  })
  if (!r.ok) throw new Error(r.reason)
}

/** The card of one recorded test on Impairment tests. */
export function impairmentCard(testId: string): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>('.im__card'))
    .find((el) => el.innerText.includes(testId) && el.getClientRects().length > 0) ?? null
}

// ── SIM-7 ───────────────────────────────────────────────────────────────────

const LINE_A = 'FA-0031'
export function improveLineA() {
  commitValueChange(LINE_A, { ...blankForm(LINE_A, 'improve'), amount: '60000000', passesCapitalisationTest: true })
}
export function reviseLineA() {
  commitValueChange(LINE_A, { ...blankForm(LINE_A, 'revise'), lifeYears: '12' })
}
export function disposeQuarterOfLineA() {
  commitValueChange(LINE_A, { ...blankForm(LINE_A, 'dispose-part'), percent: '25', proceeds: '200000000' })
}
