/**
 * Regression tests for the data-layer defects the re-audit found
 * (fix/asset-ledger). Each block names the defect it pins.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  resetAssetStore, tieRows, postPeriod, reversePeriod, retainedSelfChecks, CURRENT_PERIOD,
} from '~/data/assetStore'
import '~/data/assetLeases'

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
