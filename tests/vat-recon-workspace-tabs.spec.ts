/**
 * VAT reconciliation workspace — Jurnal bank Reconciliations tabs (data layer).
 *
 *  - Every pair lands in exactly one tab: To match / Not reconciled / Matched.
 *  - Unmatch on an ENGINE match splits it into its two open rows (US-002 AC-03),
 *    which then suggest each other; re-matching consumes the counterpart.
 *  - restoreAutoMatch puts the engine match back.
 */
import { describe, it, expect, afterEach } from 'vitest'
import {
  pairsForPeriod, workspaceTabOf, workspaceTabRows, workspaceTabCounts, WORKSPACE_TABS,
  unmatchAutoPair, restoreAutoMatch, candidatesFor, confirmManualMatch, undoManualMatch,
  outputPairs, reconTotals,
} from '~/data/vatReconciliation'

const PERIOD = '2027-02'
const engineMatch = () => outputPairs.find(p => p.match === 'matched' && p.matchedBy === 'auto')!

afterEach(() => {
  for (const p of pairsForPeriod(PERIOD, 'output')) undoManualMatch(p.id)
  restoreAutoMatch(engineMatch().id)
})

describe('tab grouping', () => {
  it('every pair belongs to exactly one tab', () => {
    const pairs = pairsForPeriod(PERIOD, 'output')
    for (const p of pairs) expect(WORKSPACE_TABS).toContain(workspaceTabOf(p))
    const absorbed = pairs.length
      - WORKSPACE_TABS.reduce((n, tab) => n + workspaceTabRows(pairs, tab).length, 0)
    // Only Coretax-only rows already suggested on an invoice's row are folded away.
    expect(absorbed).toBeGreaterThanOrEqual(0)
    expect(workspaceTabCounts(pairs)['Matched']).toBe(pairs.filter(p => p.match === 'matched').length)
  })

  it('root-cause states go to Not reconciled, pick/confirm states to To match', () => {
    const tabOf = (state: string) => workspaceTabOf(outputPairs.find(p => p.match === state)!)
    expect(tabOf('invoice-edited')).toBe('Not reconciled')
    expect(tabOf('invoice-voided')).toBe('Not reconciled')
    expect(tabOf('return-not-reflected')).toBe('Not reconciled')
    expect(tabOf('not-in-coretax')).toBe('To match')
    expect(tabOf('duplicate-reference')).toBe('To match')
    expect(tabOf('return-netted')).toBe('To match')
  })
})

describe('Unmatch on an engine match (US-002 AC-03)', () => {
  it('splits the pair into its two open rows, which suggest each other', () => {
    const m = engineMatch()
    const before = pairsForPeriod(PERIOD, 'output')
    expect(unmatchAutoPair(m)).toBe(true)
    const after = pairsForPeriod(PERIOD, 'output')
    expect(after.some(p => p.id === m.id)).toBe(false)
    const erpHalf = after.find(p => p.id === `${m.id}~erp`)!
    const djpHalf = after.find(p => p.id === `${m.id}~djp`)!
    expect(erpHalf.match).toBe('not-in-coretax')
    expect(djpHalf.match).toBe('no-match-in-erp')
    expect(after.length).toBe(before.length + 1)
    // Totals are unchanged — the same two records, now unpaired.
    expect(reconTotals(after, 'erp').total).toBe(reconTotals(before, 'erp').total)
    expect(reconTotals(after, 'djp').total).toBe(reconTotals(before, 'djp').total)
    expect(candidatesFor(erpHalf)[0]?.pairId).toBe(djpHalf.id)
  })

  it('re-matching the halves makes one manual pair again', () => {
    const m = engineMatch()
    unmatchAutoPair(m)
    const erpHalf = pairsForPeriod(PERIOD, 'output').find(p => p.id === `${m.id}~erp`)!
    const best = candidatesFor(erpHalf)[0]!
    expect(confirmManualMatch({ pair: erpHalf, periodId: PERIOD, side: 'output', candidate: best })).toBe(true)
    const pairs = pairsForPeriod(PERIOD, 'output')
    expect(pairs.find(p => p.id === erpHalf.id)).toMatchObject({ match: 'matched', matchedBy: 'manual' })
    expect(pairs.some(p => p.id === `${m.id}~djp`)).toBe(false)
  })

  it('a person\'s match is not split (Unmatch undoes the overlay instead)', () => {
    const manual = outputPairs.find(p => p.match === 'matched' && p.matchedBy === 'manual')!
    expect(unmatchAutoPair(manual)).toBe(false)
  })

  it('restoreAutoMatch puts the engine match back', () => {
    const m = engineMatch()
    unmatchAutoPair(m)
    expect(restoreAutoMatch(m.id)).toBe(true)
    expect(pairsForPeriod(PERIOD, 'output').find(p => p.id === m.id)?.match).toBe('matched')
  })
})
