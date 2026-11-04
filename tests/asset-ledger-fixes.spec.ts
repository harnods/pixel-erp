/**
 * Regression tests for the data-layer defects the re-audit found
 * (fix/asset-ledger). Each block names the defect it pins.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  resetAssetStore, tieRows, postPeriod, reversePeriod, retainedSelfChecks, CURRENT_PERIOD, ledgers,
  fixedAssets, findAsset, setViewAs, impairmentTests, ledgerBalance, fyFigures,
} from '~/data/assetStore'
import { findLease, blankModification, previewModification, modifyLease, leaseSummary, leaseSchedule } from '~/data/assetLeases'
import { bookValueAt, chargeAt, bookOf, periodOfDate, isAfter } from '~/data/assetEngine'
import {
  statementFiguresAt, differenceByAsset, impactByClass, impactByTaxGroup, amortisationRows,
  disposalImpactRows, impairmentImpactRows, leaseImpactRow,
} from '~/data/fixedAssetScreens'
import { impactBy, lampiranRows, lampiranStatus } from '~/data/assetTaxbook'
import { detailFigures } from '~/data/fixedAssetDetail'
import { setApprovalSwitch, gateChange, writeOffEvent, writeOffCarrying, approveRequest, requestTotal } from '~/data/assetApprovals'
import { createSession, recordScans, finishCounting, resolveVariance, closeSession, variancesOf, sessionById } from '~/data/assetCounts'
import { reconcileMigration, ledgerOpening, migrationRows, CUTOVER } from '~/data/assetMigration'
import { unassignedAssets, heldTangible, custodianSummary, locationBranch, changeCustody } from '~/data/assetCustody'

beforeEach(() => resetAssetStore())

const breaks = (p: string = CURRENT_PERIOD) => tieRows(p).filter((r) => r.difference !== 0).map((r) => `${r.account} ${r.difference}`)

describe('1. the register ties to the ledger after any sequence of reverse and post', () => {
  it('reverse September, reverse August, post August again: no drift on 1-1700 or 6-5100', () => {
    expect(postPeriod('2026-09').ok).toBe(true)
    expect(reversePeriod('2026-09').ok).toBe(true)
    expect(reversePeriod('2026-08').ok).toBe(true)
    expect(breaks()).toEqual([])
    expect(postPeriod('2026-08').ok).toBe(true)
    expect(breaks()).toEqual([])
    expect(breaks('2026-08')).toEqual([])
    expect(postPeriod('2026-09').ok).toBe(true)
    expect(breaks()).toEqual([])
  })

  it('a longer walk back and forward still ties at every period end', () => {
    postPeriod('2026-09')
    for (const p of ['2026-09', '2026-08', '2026-07', '2026-06']) expect(reversePeriod(p).ok).toBe(true)
    for (const p of ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09']) expect(breaks(p)).toEqual([])
    for (const p of ['2026-06', '2026-07']) expect(postPeriod(p).ok).toBe(true)
    expect(reversePeriod('2026-07').ok).toBe(true)
    for (const p of ['2026-07', '2026-08', '2026-09']) expect(postPeriod(p).ok).toBe(true)
    for (const p of ['2026-01', '2026-06', '2026-07', '2026-08', '2026-09']) expect(breaks(p)).toEqual([])
  })

  it('the self-check retained against each closed period passes its ledger tie, leases included', () => {
    for (const r of retainedSelfChecks()) expect(r.checks.find((c) => c.id === 'C1')!.state, r.period).toBe('passed')
  })
})

describe('2. a lease remeasurement starts from the carrying amount before the effective month', () => {
  const v = () => ({ ...blankModification(findLease('LS-004')!), period: '2026-09', reason: 'Extension option taken' })

  it('LS-004 in September: basis is end-of-August carrying plus the adjustment, over the months left including September', () => {
    const led0 = ledgers.value['ROU-0004']!
    const augCarrying = bookValueAt(led0, 'accounting', '2026-08')!
    expect(augCarrying).toBe(1_267_361_169)
    expect(chargeAt(led0, 'accounting', '2026-09').charge).toBe(30_911_248)
    expect(leaseSchedule(findLease('LS-004')!).endPeriod).toBe('2030-01')

    const pv = previewModification('LS-004', v())
    expect(pv.ok).toBe(true)
    expect(pv.liabilityBefore).toBe(1_354_548_021) // end of August: the September row is recomputed
    expect(pv.liabilityAfter).toBe(1_678_623_620)
    expect(pv.adjustment).toBe(324_075_599)
    expect(pv.remainingMonths).toBe(53)
    expect(pv.newEnd).toBe('2031-01')
    expect(pv.rou!.carryingAfter).toBe(augCarrying + pv.adjustment)
    expect(pv.rou!.chargeAfter).toBe(Math.round((augCarrying + pv.adjustment) / 53))
    expect(pv.rou!.chargeAfter).toBe(30_027_109)

    expect(modifyLease('LS-004', v()).ok).toBe(true)
    const led = ledgers.value['ROU-0004']!
    const sep = chargeAt(led, 'accounting', '2026-09').charge!
    expect(sep).toBe(30_027_109)
    expect(bookValueAt(led, 'accounting', '2026-08')).toBe(augCarrying) // nothing before September moves
    // The lease list: end of August + adjustment - new September charge.
    const s = leaseSummary(findLease('LS-004')!)
    expect(s.rouBookValue).toBe(augCarrying + 324_075_599 - sep)
    expect(s.rouBookValue).toBe(1_561_409_659)
    // Liability side: the September row opens at the remeasured amount.
    const sepRow = leaseSchedule(findLease('LS-004')!).rows.find((r) => r.period === '2026-09')!
    expect(sepRow.opening).toBe(1_678_623_620)
    expect(s.liability).toBe(sepRow.closing)
  })

  it('the remeasured schedule sums exactly to cost plus the adjustment, on both books, and the liability runs to nil', () => {
    const cost0 = ledgers.value['ROU-0004']!.cost
    modifyLease('LS-004', v())
    const led = ledgers.value['ROU-0004']!
    for (const book of ['accounting', 'tax'] as const) {
      const b = bookOf(led, book)!
      const charged = b.live.reduce((t, r) => t + r.charge + (r.adjustment ?? 0), 0)
      expect(charged, book).toBe(b.live.at(-1)!.cost)
      expect(b.live.at(-1)!.period).toBe('2031-01')
    }
    expect(bookOf(led, 'accounting')!.live.at(-1)!.cost).toBe(cost0 + 324_075_599)
    const rows = leaseSchedule(findLease('LS-004')!).rows
    expect(rows.at(-1)!.closing).toBe(0)
    for (let i = 1; i < rows.length; i++) if (rows[i]!.period !== '2026-09') expect(rows[i]!.opening).toBe(rows[i - 1]!.closing)
  })

  it('posting the remeasured September ties the ledger, and the register then agrees with the lease list', () => {
    modifyLease('LS-004', v())
    expect(postPeriod('2026-09').ok).toBe(true)
    expect(breaks()).toEqual([])
    expect(findAsset('ROU-0004')!.bookValueCommercial).toBe(leaseSummary(findLease('LS-004')!).rouBookValue)
  })

  it('with September posted, the change takes effect in October from the end-of-September carrying amount', () => {
    postPeriod('2026-09')
    const sepCarrying = bookValueAt(ledgers.value['ROU-0004']!, 'accounting', '2026-09')!
    const pv = previewModification('LS-004', { ...v(), period: '2026-10' })
    expect(pv.ok).toBe(true)
    expect(pv.rou!.carryingAfter).toBe(sepCarrying + pv.adjustment)
    expect(pv.rou!.chargeAfter).toBe(Math.round((sepCarrying + pv.adjustment) / pv.remainingMonths))
  })
})

describe('3. the impact statement sums to its own net temporary difference, one sign convention', () => {
  it('every section line is accounting charge less tax charge and the sections sum to the foot', () => {
    const s = statementFiguresAt()
    const sum = (rows: { difference: number }[]) => rows.reduce((t, r) => t + r.difference, 0)
    for (const r of [...impactByClass(), ...amortisationRows()]) expect(r.difference).toBe((r.commercial ?? 0) - (r.fiscal ?? 0))
    expect(sum(impactByClass())).toBe(sum(impactByTaxGroup()))
    expect(s.sections.depreciation).toBe(10_265_625) // accounting 565.750.001 less tax 555.484.376
    expect(s.sections.amortisation).toBe(-147_749_994) // no longer left out
    expect(s.sections.disposalAndImpairment).toBe(sum(disposalImpactRows()) + sum(impairmentImpactRows()))
    expect(s.netTemporaryDifference).toBe(s.sections.depreciation + s.sections.amortisation + s.sections.disposalAndImpairment)
    expect(s.netTemporaryDifference).toBe(-242_578_119) // was 94.828.125
    expect(s.deferredTax).toBe(Math.round(s.netTemporaryDifference * s.taxRate))
    expect(s.deferredTax).toBe(-53_367_186) // was 20.862.188
    expect(fyFigures().netTemporaryDifference).toBe(s.netTemporaryDifference)
  })

  it('goodwill and the indefinite-life brand carry a difference: not amortised in the accounts, amortised for tax', () => {
    const gw = amortisationRows().find((r) => r.assetId === 'FA-0091')!
    expect(gw.commercial).toBeNull()
    expect(gw.difference).toBe(-gw.fiscal!)
    expect(gw.difference).toBeLessThan(0)
    expect(differenceByAsset().find((r) => r.id === 'FA-0091')!.difference).toBe(gw.difference)
  })

  it('an impairment adds back and a disposal restates on the tax basis, same sign on every view', () => {
    const imp = impairmentImpactRows()[0]!
    expect(imp.difference).toBe(17_250_000)
    expect(differenceByAsset().find((r) => r.tag === 'Impairment')!.difference).toBe(17_250_000)
    expect(impactBy('line').rows.find((r) => r.key === 'Impairment loss')!.difference).toBe(17_250_000)
    const disp = disposalImpactRows()[0]!
    expect(disp.difference).toBe(-122_343_750)
    expect(impactBy('line').rows.find((r) => r.key === 'Loss (gain) on disposal')!.difference).toBe(-122_343_750)
    expect(impactBy('line').rows.find((r) => r.key === 'Depreciation')!.difference).toBe(10_265_625)
  })

  it('the per-asset view, the per-line view and the grouped views all tie to the statement total', () => {
    const net = statementFiguresAt().netTemporaryDifference
    expect(differenceByAsset().reduce((t, r) => t + (r.difference ?? 0), 0)).toBe(net)
    for (const dim of ['line', 'class', 'group'] as const) expect(impactBy(dim).total.difference, dim).toBe(net)
  })

  it('the lease line is shown with its difference and kept out of the total', () => {
    const lease = leaseImpactRow()
    expect(lease.assets).toBe(fixedAssets.value.filter((a) => a.leaseId).length)
    expect(lease.difference).toBe(lease.commercial! - lease.fiscal!)
    expect(lease.difference).not.toBe(0)
    expect(impactBy('line').lease.difference).toBe(lease.difference)
    expect(differenceByAsset().some((r) => r.id?.startsWith('ROU-'))).toBe(false)
  })

  it('the asset record states its cumulative difference on the same convention, signed', () => {
    const a = fixedAssets.value.find((x) => x.id === 'FA-0091')!
    const f = detailFigures(a).find((x) => x.label === 'Cumulative difference')!
    expect(f.value).toBe(a.bookValueFiscal! - a.bookValueCommercial!)
    expect(f.value).toBeLessThan(0) // tax has amortised, the accounts have not
    expect(f.sub).toContain('liability')
  })
})

describe('4. Lampiran 9 leaves right-of-use assets out of both halves', () => {
  it('no ROU row and no Lease payments group, counts included', () => {
    for (const type of ['Tangible', 'Intangible'] as const) {
      const rows = lampiranRows(type)
      expect(rows.some((r) => String(r.id ?? '').startsWith('ROU-')), type).toBe(false)
      expect(rows.some((r) => JSON.stringify(r).includes('Lease payments')), type).toBe(false)
    }
    const st = lampiranStatus()
    expect(st.tangible).toBe(lampiranRows('Tangible').length)
    expect(st.tangible).toBe(fixedAssets.value.filter((a) => a.type === 'Tangible' && !a.leaseId
      && lampiranRows('Tangible').some((r) => r.id === a.id)).length)
  })
})

describe('5. the write-off put to the approver is the loss that will be recorded', () => {
  it('a drawer write-off: approval figure equals the recorded disposal carrying amount', () => {
    setApprovalSwitch('writeOff', true)
    setViewAs('General Affairs')
    const before = { ...writeOffCarrying('FA-0023') }
    const g = gateChange('FA-0023', 'write-off', 'Write off', { type: 'event', event: writeOffEvent() }, 1, () => ({ ok: true }))
    expect(g.ok && g.held).toBeTruthy()
    if (!g.ok || !g.held) return
    const shown = requestTotal(g.held)
    expect(shown.accounting).toBe(77_083_352) // was 79.010.435, the carrying before the September charge
    setViewAs('Approver')
    expect(approveRequest(g.held.id).ok).toBe(true)
    const d = ledgers.value['FA-0023']!.books.accounting.disposal!
    expect(d.carrying).toBe(shown.accounting)
    expect(-d.gainLoss).toBe(shown.accounting)
    expect(before.accounting).toBe(shown.accounting)
  })
})

describe('6. migration evidence counts what differs, and the opening ties to the ledger', () => {
  it('names the differing assets, not the population', () => {
    const e = reconcileMigration()
    expect(e.result).toBe('differs')
    expect(e.assets).toBe(e.differing.length)
    expect(e.population).toBe(migrationRows.value.length)
  })

  it('the register opening accumulated equals ledger 1-1700 at the cut-over, right-of-use assets included', () => {
    const e = reconcileMigration()
    expect(e.commercial.registerAccumulated).toBe(3_788_782_421)
    expect(ledgerOpening().accumulated).toBe(e.commercial.registerAccumulated) // was 3.177.354.171
    expect(-ledgerBalance('1-1700', CUTOVER)).toBe(e.commercial.registerAccumulated)
  })
})

describe('7. no seeded impairment test is dated after today', () => {
  it('IT-2026-02 falls inside the current period', () => {
    const t = impairmentTests.value.find((x) => x.id === 'IT-2026-02')!
    expect(periodOfDate(t.date)).toBe(CURRENT_PERIOD)
    for (const x of impairmentTests.value) expect(isAfter(periodOfDate(x.date), CURRENT_PERIOD), x.id).toBe(false)
  })
})

describe('8. a tag captured in a count stays on the asset it is capitalised as', () => {
  it('TAG-NEW-001 capitalised keeps TAG-NEW-001, and the next count matches it', () => {
    setViewAs('General Affairs')
    const r = createSession('location', 'branch:Medan')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    recordScans(r.session.id, 'TAG-NEW-001', 'Medan Warehouse')
    finishCounting(r.session.id)
    const s0 = r.session.id
    expect(resolveVariance(s0, 'V-TAG-NEW-001', { kind: 'capitalise', reason: 'Bought on petty cash, never recorded', newAsset: { name: 'Pallet jack', class: 'Equipment', cost: 12_000_000 } }).ok).toBe(true)
    // Everything else in Medan was not scanned; settle those so the session closes.
    for (const x of variancesOf(sessionById(s0)!)) if (x.id !== 'V-TAG-NEW-001') resolveVariance(s0, x.id, { kind: 'record-correction', reason: 'Seen elsewhere' })
    expect(closeSession(s0).ok).toBe(true)
    const a = fixedAssets.value.find((x) => x.name === 'Pallet jack')!
    expect(a.tag).toBe('TAG-NEW-001')
    const r2 = createSession('location', 'branch:Medan')
    expect(r2.ok).toBe(true)
    if (!r2.ok) return
    const scan = recordScans(r2.session.id, 'TAG-NEW-001', a.location ?? 'Medan Warehouse')
    expect(scan.ok && scan.outcomes[0]!.result).toBe('counted')
  })
})

describe('9. custody leaves right-of-use assets out and reads the branch from the location', () => {
  it('no ROU asset is a custody gap', () => {
    expect(heldTangible.value.some((a) => a.leaseId)).toBe(false)
    expect(unassignedAssets.value.some((a) => a.id.startsWith('ROU-'))).toBe(false)
  })

  it('Siti Rahma reads Central Jakarta, where her location is', () => {
    // The audit's case: the Hilux handed to Siti Rahma (home branch Medan) at the HQ vehicle pool.
    const r = changeCustody('FA-0029', { custodian: 'Siti Rahma (GA)', location: 'HQ vehicle pool' }, 'Moved to the HQ pool')
    expect(r.ok).toBe(true)
    const c = custodianSummary.value.find((x) => x.person === 'Siti Rahma')!
    expect(c.locations).toContain('HQ vehicle pool')
    expect(c.branch).toBe(locationBranch('HQ vehicle pool'))
    expect(c.branch).toBe('Central Jakarta')
  })
})

describe('a right-of-use record measures its difference against the lease payments', () => {
  it('ROU-0004 cumulative difference is depreciation to date less payments deducted to date', () => {
    resetAssetStore()
    const a = findAsset('ROU-0004')!
    const l = ledgers.value['ROU-0004']!
    const taxCost = l.books.tax!.costHistory.at(-1)!.cost
    const expected = (a.cost - a.bookValueCommercial!) - (taxCost - a.bookValueFiscal!)
    const f = detailFigures(a).find((x) => x.label === 'Cumulative difference')!
    expect(f.value).toBe(expected)
    // 3 years in on a 5 year lease: the gap is a fraction of the payments, not
    // the whole remaining-payments balance the old calculation reported.
    expect(f.value).toBe(-144_186_288)
    expect(Math.abs(f.value!)).toBeLessThan(200_000_000)
  })
})
