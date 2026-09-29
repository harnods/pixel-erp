import { describe, it, expect, beforeEach } from 'vitest'
import {
  resetAssetStore, fixedAssets, findAsset, recordEvent, previewEvent, setViewAs, postPeriod, generateRun,
  computeSelfCheck, CURRENT_PERIOD, ledgers,
} from '../app/data/assetStore'
import { approvalSettings, setApprovalSwitch, approveRequest, awaitingRequests, gateChange, valueChangeStake } from '../app/data/assetApprovals'
import { classifyAsset, lampiranRows, assetClassMaster } from '../app/data/assetTaxbook'
import { createLease, leases } from '../app/data/assetLeases'
import { changeCustody } from '../app/data/assetCustody'
import { journalDatePolicy, autoPostRuns } from '../app/data/assetPolicy'
import { differenceByAsset } from '../app/data/fixedAssetScreens'
import { fyFigures } from '../app/data/assetStore'
import '../app/data/fixedAssetSession'

/**
 * The three phase-2 modules were built side by side. These checks exercise
 * them together, so a reset or a figure owned by one is seen by the others.
 */
describe('asset modules work together', () => {
  beforeEach(() => resetAssetStore())

  it('one reset returns every module to the sample', () => {
    setApprovalSwitch('disposal', true)
    journalDatePolicy.value = 'posting-date'
    autoPostRuns.value = true
    const before = leases.value.length
    resetAssetStore()
    expect(approvalSettings.value.disposal).toBe(false)
    expect(journalDatePolicy.value).toBe('period-end')
    expect(autoPostRuns.value).toBe(false)
    expect(leases.value.length).toBe(before)
    expect(assetClassMaster.value.length).toBeGreaterThan(0)
    expect(computeSelfCheck(CURRENT_PERIOD).checks.length).toBe(4)
  })

  it('a new lease joins the register, the run and still ties the self-check', () => {
    const n = fixedAssets.value.length
    const r = createLease({
      name: 'Warehouse Cikarang lease', underlying: 'Warehouse', branch: 'Central Jakarta', startDate: '01/09/2026',
      termMonths: 36, monthlyPayment: 15_000_000, annualRatePct: 12, options: '', exemption: null,
    })
    expect(r.ok).toBe(true)
    expect(fixedAssets.value.length).toBe(n + 1)
    const run = generateRun(CURRENT_PERIOD)
    expect(run.ok).toBe(true)
    const p = postPeriod(CURRENT_PERIOD)
    expect(p.ok).toBe(true)
    const sc = computeSelfCheck(CURRENT_PERIOD)
    expect(sc.checks[0]!.state).toBe('passed')
  })

  it('classifying FA-0077 completes the filing and passes the self-check', () => {
    expect(lampiranRows('Tangible').some((r) => r.id === 'FA-0077')).toBe(false)
    const r = classifyAsset('FA-0077', { group: 'Tax group 2' })
    expect(r.ok).toBe(true)
    expect(lampiranRows('Tangible').some((r2) => r2.id === 'FA-0077')).toBe(true)
    expect(computeSelfCheck(CURRENT_PERIOD).checks.every((c) => c.state === 'passed')).toBe(true)
  })

  it('a custody change moves no figure', () => {
    const bv = findAsset('FA-0031')!.bookValueCommercial
    const r = changeCustody('FA-0031', { custodian: 'Fitri Handayani (GA)' }, 'Handover')
    expect(r.ok).toBe(true)
    expect(findAsset('FA-0031')!.bookValueCommercial).toBe(bv)
    expect(ledgers.value['FA-0031']).toBeTruthy()
  })

  it('with value-change approval on, a revision waits for the approver, then applies', () => {
    setApprovalSwitch('valueChange', true)
    const ev = { kind: 'estimate-revision', book: 'accounting', period: '2026-10', date: '01/10/2026', lifeMonths: 72 } as never
    expect(previewEvent('FA-0031', ev).ok).toBe(true)
    const charge = () => ledgers.value['FA-0031']!.books.accounting.live.find((r) => r.period === '2026-10')!.charge
    const before = charge()
    const g = gateChange('FA-0031', 'value-change' as never, 'Revise life', { type: 'event', event: ev },
      valueChangeStake('FA-0031', ev), () => recordEvent('FA-0031', ev))
    expect(g.ok && g.held).toBeTruthy()
    expect(charge()).toBe(before)
    setViewAs('Approver')
    expect(approveRequest(awaitingRequests.value[0]!.id).ok).toBe(true)
    expect(charge()).not.toBe(before)
  })

  it('the per-asset difference ties to the statement, with leases and disposals in play', () => {
    const net = () => differenceByAsset().reduce((a, r) => a + (r.difference ?? 0), 0)
    expect(net()).toBe(fyFigures().netTemporaryDifference)
    classifyAsset('FA-0077', { group: 'Tax group 2' })
    expect(net()).toBe(fyFigures().netTemporaryDifference)
    createLease({
      name: 'Forklift lease', underlying: 'Forklift', branch: 'Surabaya', startDate: '01/09/2026',
      termMonths: 36, monthlyPayment: 10_000_000, annualRatePct: 12, options: '', exemption: null,
    })
    recordEvent('FA-0031', { kind: 'disposal', period: '2026-09', date: '30/09/2026', proceeds: 100_000_000 } as never)
    expect(net()).toBe(fyFigures().netTemporaryDifference)
  })
})
