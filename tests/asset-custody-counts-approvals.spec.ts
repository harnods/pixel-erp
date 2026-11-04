/**
 * Phase 2A acceptance: FG-4 custody, FG-5 counts, FG-7 approvals, run on
 * the real store and engine. Each test starts from the sample (resetAll).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { fixedAssets, findAsset, setViewAs, canSeeFinancials, actingUser, ledgerOf } from '~/data/assetStore'
import {
  changeCustody, custodyHistoryFor, addLocation, unassignedAssets, heldBy, reassignAll, conditionOf,
} from '~/data/assetCustody'
import {
  createSession, recordScans, finishCounting, variancesOf, resolveVariance, closeSession, sessionById,
  abandonSession, resetAll,
} from '~/data/assetCounts'
import {
  approvalSettings, setApprovalSwitch, setApprovalThreshold, approveRequest, sendBackRequest, requestById,
  requestTotal, gateChange, approvalTrailFor, pendingFor, awaitingRequests, type HeldChange,
} from '~/data/assetApprovals'
import { detailPanes } from '~/data/fixedAssetDetail'
import { writeOffEvent } from '~/data/assetApprovals'

beforeEach(() => {
  resetAll()
  setViewAs('Owner')
})

/** Open an "All of Medan" count, scan what is given at Medan Warehouse, and finish. */
function medanCount(scanned: string[], at = 'Medan Warehouse') {
  const r = createSession('location', 'branch:Medan')
  if (!r.ok) throw new Error(r.reason)
  if (scanned.length) {
    const s = recordScans(r.session.id, scanned.join('\n'), at)
    if (!s.ok) throw new Error(s.reason)
  }
  finishCounting(r.session.id)
  return r.session.id
}

describe('FG-4 custody', () => {
  it('FG4-AC1: the General Affairs view carries no cost or book value', () => {
    setViewAs('General Affairs')
    expect(canSeeFinancials.value).toBe(false)
    // The detail page keeps only the General Affairs pane for this role.
    const panes = detailPanes(findAsset('FA-0047')!).filter((p) => p.owner === 'General Affairs')
    const text = JSON.stringify(panes)
    expect(text).not.toMatch(/cost|book value|tax group/i)
    // General Affairs can still maintain custody.
    const r = changeCustody('FA-0047', { custodian: 'Fitri Handayani (GA)', location: 'HQ vehicle pool' }, 'Returned car reassigned')
    expect(r.ok).toBe(true)
  })

  it('FA-0047 starts as the register\'s unassigned asset', () => {
    expect(unassignedAssets.value.map((a) => a.id)).toContain('FA-0047')
  })

  it('FG4-AC2: a custody change keeps previous and new value, actor, date and reason', () => {
    setViewAs('General Affairs')
    const r = changeCustody('FA-0047', { custodian: 'Dewi Lestari (Directors)', location: 'HQ vehicle pool' }, 'Director car pool')
    expect(r).toEqual({ ok: true, changed: ['Custodian', 'Location'] })
    const h = custodyHistoryFor('FA-0047')
    expect(h).toHaveLength(2)
    const cust = h.find((x) => x.field === 'Custodian')!
    expect(cust).toMatchObject({ from: null, to: 'Dewi Lestari (Directors)', by: 'Rudi Santoso', reason: 'Director car pool' })
    expect(cust.at).toMatch(/^30\/09\/2026 \d\d:\d\d$/)
    // The register reads the new value at once.
    expect(findAsset('FA-0047')!.custodian).toBe('Dewi Lestari (Directors)')
    expect(unassignedAssets.value.map((a) => a.id)).not.toContain('FA-0047')
  })

  it('a custody change without a reason is refused', () => {
    const r = changeCustody('FA-0047', { custodian: 'IT Support' }, '  ')
    expect(r.ok).toBe(false)
    expect(custodyHistoryFor('FA-0047')).toHaveLength(0)
  })

  it('FG4-AC3: a location must come from the maintained list', () => {
    const r = changeCustody('FA-0047', { location: 'Parking lot behind HQ' }, 'Parked')
    expect(r).toMatchObject({ ok: false, field: 'location' })
    expect(addLocation('Parking lot behind HQ', 'Central Jakarta')).toBeNull()
    expect(changeCustody('FA-0047', { location: 'Parking lot behind HQ' }, 'Parked').ok).toBe(true)
  })

  it('a location in another branch moves the asset to that branch', () => {
    changeCustody('FA-0047', { location: 'Medan pool' }, 'Sent to Medan')
    expect(findAsset('FA-0047')!.branch).toBe('Medan')
  })

  it('OD-22: everything one custodian holds, and reassigning it all', () => {
    const before = heldBy('Rudi Santoso (Warehouse)').map((a) => a.id)
    expect(before.length).toBeGreaterThan(3)
    const r = reassignAll('Rudi Santoso (Warehouse)', 'Siti Rahma (GA)', 'Rudi moved to Surabaya')
    expect(r.ok).toBe(true)
    expect(heldBy('Rudi Santoso (Warehouse)')).toHaveLength(0)
    expect(heldBy('Siti Rahma (GA)').map((a) => a.id).sort()).toEqual(before.sort())
    expect(custodyHistoryFor(before[0]!)[0]).toMatchObject({ field: 'Custodian', from: 'Rudi Santoso (Warehouse)', to: 'Siti Rahma (GA)' })
  })

  it('custody is not editable by the Tax role', () => {
    setViewAs('Tax')
    expect(changeCustody('FA-0047', { custodian: 'IT Support' }, 'x')).toMatchObject({ ok: false, field: 'role' })
  })
})

describe('FG-5 counts', () => {
  it('OD-23: an All of Medan session freezes six assets with a counter', () => {
    setViewAs('General Affairs')
    const r = createSession('location', 'branch:Medan')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.session.population).toHaveLength(6)
    expect(r.session.counter).toBe('Rudi Santoso')
    // The population stays frozen when the register moves.
    changeCustody('FA-0023', { location: 'Rungkut Warehouse' }, 'Moved')
    expect(sessionById(r.session.id)!.population.map((p) => p.assetId)).toContain('FA-0023')
  })

  it('FG5-AC2: an asset cannot be in two open sessions, and the refusal names the session', () => {
    const a = createSession('location', 'branch:Medan')
    const b = createSession('location', 'Medan Warehouse')
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(false)
    if (a.ok && !b.ok) expect(b.reason).toContain(a.session.id)
    // Once abandoned, the scope is free again.
    if (a.ok) abandonSession(a.session.id, 'Counter off sick')
    expect(createSession('location', 'Medan Warehouse').ok).toBe(true)
  })

  it('OD-24: typed and pasted codes are captured; unknown and outside tags are named', () => {
    const r = createSession('location', 'branch:Medan')
    if (!r.ok) throw new Error()
    const s = recordScans(r.session.id, 'tag-mdn-068, TAG-MDN-083\nTAG-HQ-004 TAG-XX-999 TAG-MDN-068', 'Medan Warehouse')
    expect(s.ok).toBe(true)
    if (!s.ok) return
    expect(s.outcomes.map((o) => o.result)).toEqual(['counted', 'counted', 'outside', 'unrecorded', 'duplicate'])
  })

  it('FG5-AC1: a session with an unresolved variance cannot close', () => {
    const id = medanCount(['TAG-MDN-068', 'TAG-MDN-083', 'TAG-MDN-023', 'TAG-MDN-064'])
    const v = variancesOf(sessionById(id)!)
    expect(v.map((x) => `${x.assetId}:${x.kind}`).sort()).toEqual(['FA-0021:not-found', 'FA-0029:not-found'])
    const c = closeSession(id)
    expect(c.ok).toBe(false)
    if (!c.ok) expect(c.reason).toMatch(/2 variances are still unresolved/)
    expect(sessionById(id)!.status).toBe('resolving')
  })

  it('OD-25: each variance offers a choice, and an unlisted choice is refused', () => {
    const id = medanCount(['TAG-MDN-068', 'TAG-MDN-083', 'TAG-MDN-023', 'TAG-MDN-064', 'TAG-MDN-021'])
    expect(resolveVariance(id, 'V-FA-0029', { kind: 'capitalise', reason: 'x' }).ok).toBe(false)
    for (const kind of ['write-off', 'transfer', 'record-correction'] as const) {
      const r = resolveVariance(id, 'V-FA-0029', { kind, reason: 'checked', location: 'Medan Warehouse' })
      expect(r.ok).toBe(true)
    }
  })

  it('OD-26 / FG5-AC3: closing relocates, and a write-off disposes on both books (approval off)', () => {
    expect(approvalSettings.value.writeOff).toBe(false)
    // Hilux scanned at Medan Warehouse, recorded at Medan pool; partitions not found.
    const id = medanCount(['TAG-MDN-068', 'TAG-MDN-083', 'TAG-MDN-023', 'TAG-MDN-064', 'TAG-VEH-029'])
    expect(resolveVariance(id, 'V-FA-0029', { kind: 'transfer', location: 'Medan Warehouse', reason: 'Parked in the warehouse since August' }).ok).toBe(true)
    expect(resolveVariance(id, 'V-FA-0021', { kind: 'write-off', reason: 'Scrapped in the office refit, never recorded' }).ok).toBe(true)
    const c = closeSession(id)
    expect(c).toMatchObject({ ok: true, applied: 2, requests: [] })
    expect(sessionById(id)!.status).toBe('closed')
    expect(findAsset('FA-0029')!.location).toBe('Medan Warehouse')
    expect(custodyHistoryFor('FA-0029')[0]).toMatchObject({ field: 'Location', from: 'Medan pool', to: 'Medan Warehouse' })
    const gone = findAsset('FA-0021')!
    expect(gone.status).toBe('Disposed')
    const disposal = ledgerOf('FA-0021')!.events.find((e) => e.kind === 'disposal')!
    expect(disposal).toMatchObject({ proceeds: 0, recordedBy: 'Rizal Candra' })
  })

  it('a damaged find can be resolved as an impairment, which records a test', () => {
    const r = createSession('location', 'branch:Medan')
    if (!r.ok) throw new Error()
    recordScans(r.session.id, 'TAG-MDN-068 TAG-MDN-083 TAG-MDN-023 TAG-MDN-021 TAG-VEH-029', 'Medan Warehouse')
    recordScans(r.session.id, 'TAG-MDN-064', 'Medan Warehouse', 'Damaged')
    finishCounting(r.session.id)
    const id = r.session.id
    resolveVariance(id, 'V-FA-0029', { kind: 'record-correction', location: 'Medan Warehouse', reason: 'Register was wrong' })
    resolveVariance(id, 'V-FA-0021', { kind: 'record-correction', location: 'Medan Warehouse', reason: 'Register was wrong' })
    const before = findAsset('FA-0064')!.bookValueCommercial!
    expect(resolveVariance(id, 'V-FA-0064', { kind: 'impairment', recoverable: 100_000_000, reason: 'Flood damage' }).ok).toBe(true)
    expect(closeSession(id).ok).toBe(true)
    expect(findAsset('FA-0064')!.bookValueCommercial!).toBeLessThan(before)
    expect(conditionOf(findAsset('FA-0064')!)).toBe('Good')
  })
})

describe('FG-7 approvals', () => {
  it('LR-5: every approval switch is off by default, with no threshold', () => {
    expect(approvalSettings.value).toMatchObject({ disposal: false, writeOff: false, valueChange: false, threshold: null })
  })

  it('only the Owner changes approval rules', () => {
    setViewAs('Accounting')
    expect(setApprovalSwitch('writeOff', true)).toMatch(/Only the Owner/)
    expect(approvalSettings.value.writeOff).toBe(false)
  })

  it('FG7-AC1: with the switch off a disposal completes at once and records who acted', () => {
    setViewAs('Accounting')
    const change: HeldChange = { type: 'event', event: writeOffEvent() }
    const g = gateChange('FA-0055', 'write-off', 'Write off FA-0055', change, 1, () => ({ ok: true }))
    expect(g).toEqual({ ok: true, held: null })
    expect(awaitingRequests.value).toHaveLength(0)
  })

  it('FG7-AC1: with the switch on, the event is held and approving applies it through the engine', () => {
    setApprovalSwitch('writeOff', true)
    setViewAs('Accounting')
    const change: HeldChange = { type: 'event', event: writeOffEvent() }
    let recorded = false
    const g = gateChange('FA-0055', 'write-off', 'Write off FA-0055', change, 1, () => { recorded = true; return { ok: true } })
    expect(g.ok && g.held).toBeTruthy()
    expect(recorded).toBe(false)
    expect(findAsset('FA-0055')!.status).not.toBe('Disposed')
    expect(pendingFor('FA-0055')).toHaveLength(1)
    const id = g.ok && g.held ? g.held.id : ''
    setViewAs('Approver')
    expect(approveRequest(id)).toEqual({ ok: true })
    expect(findAsset('FA-0055')!.status).toBe('Disposed')
    const ev = ledgerOf('FA-0055')!.events.find((e) => e.kind === 'disposal')!
    expect(ev.recordedBy).toBe('Sari Wulandari')
    // OD-31: the trail is on the asset, naming who raised and who decided.
    const trail = approvalTrailFor('FA-0055')
    expect(trail.map((t) => t.who)).toEqual(['Fitri Handayani', 'Sari Wulandari'])
    expect(trail[0]!.what).toMatch(/approved/)
  })

  it('sending back cancels the held change, and needs a note', () => {
    setApprovalSwitch('valueChange', true)
    const ev = { ...writeOffEvent(), kind: 'revision', newLifeMonths: 72 } as unknown as HeldChange & { type: 'event' }
    const g = gateChange('FA-0055', 'value-change', 'Revise FA-0055', { type: 'event', event: ev as never }, 1, () => ({ ok: true }))
    const id = g.ok && g.held ? g.held.id : ''
    setViewAs('Approver')
    expect(sendBackRequest(id, '').ok).toBe(false)
    expect(sendBackRequest(id, 'Life estimate needs the engineer\'s report').ok).toBe(true)
    expect(requestById(id)!.status).toBe('sent-back')
    expect(pendingFor('FA-0055')).toHaveLength(0)
    expect(ledgerOf('FA-0055')!.events.some((e) => e.kind === 'revision')).toBe(false)
  })

  it('FG7-AC3: the person who raised a request cannot approve it', () => {
    setApprovalSwitch('writeOff', true)
    setViewAs('Approver') // Fitri Handayani raises it herself
    const g = gateChange('FA-0055', 'write-off', 'Write off FA-0055', { type: 'event', event: writeOffEvent() }, 1, () => ({ ok: true }))
    const id = g.ok && g.held ? g.held.id : ''
    expect(requestById(id)!.raisedBy).toBe(actingUser.value)
    const r = approveRequest(id)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/Another approver must decide it/)
    expect(findAsset('FA-0055')!.status).not.toBe('Disposed')
    // Someone else with authority can.
    setViewAs('Owner')
    expect(approveRequest(id).ok).toBe(true)
  })

  it('a role without approving authority cannot decide', () => {
    setApprovalSwitch('writeOff', true)
    const g = gateChange('FA-0055', 'write-off', 'x', { type: 'event', event: writeOffEvent() }, 1, () => ({ ok: true }))
    setViewAs('Tax')
    expect(approveRequest(g.ok && g.held ? g.held.id : '').ok).toBe(false)
  })

  it('FG7-AC2: a count raises ONE approval for all its write-offs, with the total; approving closes it', () => {
    setApprovalSwitch('writeOff', true)
    setViewAs('General Affairs')
    const id = medanCount(['TAG-MDN-068', 'TAG-MDN-083', 'TAG-MDN-064', 'TAG-VEH-029'])
    // Not found: FA-0023 racking and FA-0021 partitions. Hilux at the wrong location.
    resolveVariance(id, 'V-FA-0029', { kind: 'transfer', location: 'Medan Warehouse', reason: 'Parked in the warehouse' })
    resolveVariance(id, 'V-FA-0023', { kind: 'write-off', reason: 'Dismantled' })
    resolveVariance(id, 'V-FA-0021', { kind: 'write-off', reason: 'Scrapped' })
    const c = closeSession(id)
    expect(c.ok).toBe(true)
    if (!c.ok) return
    expect(c.applied).toBe(1) // the transfer, applied at once
    expect(c.requests).toHaveLength(1)
    const req = c.requests[0]!
    expect(req.items.map((i) => i.assetId).sort()).toEqual(['FA-0021', 'FA-0023'])
    // What the write-offs will record: the carrying amounts after the open
    // period's charge (was 79.010.435 + 24.046.875 as last posted).
    expect(requestTotal(req)).toEqual({ accounting: 77083352 + 23625000, tax: 77083352 + 6750000 })
    expect(sessionById(id)!.status).toBe('awaiting-approval')
    expect(findAsset('FA-0029')!.location).toBe('Medan Warehouse')
    expect(findAsset('FA-0023')!.status).not.toBe('Disposed')
    // The raiser cannot approve; the Approver can.
    expect(approveRequest(req.id).ok).toBe(false)
    setViewAs('Approver')
    expect(approveRequest(req.id).ok).toBe(true)
    expect(findAsset('FA-0023')!.status).toBe('Disposed')
    expect(findAsset('FA-0021')!.status).toBe('Disposed')
    const s = sessionById(id)!
    expect(s.status).toBe('closed')
    expect(s.closedBy).toBe('Fitri Handayani')
  })

  it('a sent-back count write-off reopens the variance, and the session can close again', () => {
    setApprovalSwitch('writeOff', true)
    setViewAs('General Affairs')
    const id = medanCount(['TAG-MDN-068', 'TAG-MDN-083', 'TAG-MDN-064', 'TAG-MDN-023', 'TAG-VEH-029'])
    resolveVariance(id, 'V-FA-0029', { kind: 'transfer', location: 'Medan Warehouse', reason: 'Moved' })
    resolveVariance(id, 'V-FA-0021', { kind: 'write-off', reason: 'Scrapped' })
    const c = closeSession(id)
    const req = c.ok ? c.requests[0]! : null
    setViewAs('Approver')
    expect(sendBackRequest(req!.id, 'Check the office store room first').ok).toBe(true)
    let s = sessionById(id)!
    expect(s.status).toBe('resolving')
    expect(s.resolutions['V-FA-0021']).toBeUndefined()
    expect(findAsset('FA-0021')!.status).not.toBe('Disposed')
    setViewAs('General Affairs')
    resolveVariance(id, 'V-FA-0021', { kind: 'record-correction', reason: 'Found in the store room' })
    const again = closeSession(id)
    expect(again).toMatchObject({ ok: true, requests: [] })
    s = sessionById(id)!
    expect(s.status).toBe('closed')
    // The transfer was not applied twice.
    expect(custodyHistoryFor('FA-0029').filter((x) => x.field === 'Location')).toHaveLength(1)
  })

  it('threshold: an item above it gets its own request, even with the switch off', () => {
    expect(setApprovalThreshold(50_000_000)).toBeNull()
    setViewAs('General Affairs')
    const id = medanCount(['TAG-MDN-068', 'TAG-MDN-083', 'TAG-MDN-064', 'TAG-VEH-029'])
    resolveVariance(id, 'V-FA-0029', { kind: 'transfer', location: 'Medan Warehouse', reason: 'Moved' })
    resolveVariance(id, 'V-FA-0023', { kind: 'write-off', reason: 'Dismantled' }) // 79m, above
    resolveVariance(id, 'V-FA-0021', { kind: 'write-off', reason: 'Scrapped' }) // 24m, below
    const c = closeSession(id)
    expect(c.ok).toBe(true)
    if (!c.ok) return
    expect(c.requests).toHaveLength(1)
    expect(c.requests[0]!.items.map((i) => i.assetId)).toEqual(['FA-0023'])
    expect(c.requests[0]!.reason).toMatch(/Rp50\.000\.000 approval threshold/)
    expect(findAsset('FA-0021')!.status).toBe('Disposed')
    expect(findAsset('FA-0023')!.status).not.toBe('Disposed')
  })

  it('with the switch on, items above the threshold are split from the bundle', () => {
    setApprovalSwitch('writeOff', true)
    setApprovalThreshold(50_000_000)
    setViewAs('General Affairs')
    const id = medanCount(['TAG-MDN-068', 'TAG-MDN-083', 'TAG-MDN-064', 'TAG-VEH-029'])
    resolveVariance(id, 'V-FA-0029', { kind: 'transfer', location: 'Medan Warehouse', reason: 'Moved' })
    resolveVariance(id, 'V-FA-0023', { kind: 'write-off', reason: 'Dismantled' })
    resolveVariance(id, 'V-FA-0021', { kind: 'write-off', reason: 'Scrapped' })
    const c = closeSession(id)
    if (!c.ok) throw new Error(c.reason)
    expect(c.requests.map((r) => r.items.map((i) => i.assetId))).toEqual([['FA-0021'], ['FA-0023']])
    setViewAs('Approver')
    approveRequest(c.requests[0]!.id)
    expect(sessionById(id)!.status).toBe('awaiting-approval')
    approveRequest(c.requests[1]!.id)
    expect(sessionById(id)!.status).toBe('closed')
  })

  it('an asset with a pending request cannot raise a second one', () => {
    setApprovalSwitch('writeOff', true)
    gateChange('FA-0055', 'write-off', 'x', { type: 'event', event: writeOffEvent() }, 1, () => ({ ok: true }))
    const g = gateChange('FA-0055', 'write-off', 'x', { type: 'event', event: writeOffEvent() }, 1, () => ({ ok: true }))
    expect(g.ok).toBe(false)
  })

  it('the register reflects count and custody changes (single identity, OD-20)', () => {
    const n = fixedAssets.value.length
    changeCustody('FA-0047', { custodian: 'IT Support', location: 'Floor 3 HQ' }, 'Pool car')
    expect(fixedAssets.value.length).toBe(n)
    expect(fixedAssets.value.find((a) => a.id === 'FA-0047')!.location).toBe('Floor 3 HQ')
  })
})
