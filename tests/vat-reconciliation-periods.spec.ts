/**
 * VAT reconciliation — period index model (Reports ▸ Tax ▸ VAT reconciliation).
 *
 * The table's shape follows the equivalent Klikpajak screen: one row per masa ×
 * side, the ERP column beside the Coretax column, their Selisih between them,
 * and three reconciliation statuses. Three things worth pinning, because all
 * three break silently:
 *
 *   1. **One row per side, never merged.** A masa appears twice, and each row
 *      carries only its own side's figures. A regression that merges them shows
 *      up as the two rows reporting identical amounts.
 *   2. **The active masa is derived, not restated.** Its figures come from the
 *      same pair fixtures the workspace renders, so an edit to those fixtures
 *      must move the index rows too.
 *   3. **Selisih and status agree.** A zero selisih with a `partially
 *      reconciled` status (or vice versa) means the derivation drifted.
 */
import { describe, it, expect } from 'vitest'
import {
  reconPeriodRows, reconPeriods, periodLabelById, activePeriodId, activePeriod,
  reconTotals, matchCounts, pairsForSide, outputPairs, inputPairs,
  SIDE_LABELS, type ReconSide,
} from '~/data/vatReconciliation'

const rows = reconPeriodRows()
const SIDES: ReconSide[] = ['output', 'input']
const row = (periodId: string, side: ReconSide) => {
  const found = rows.find(r => r.periodId === periodId && r.side === side)
  if (!found) throw new Error(`missing ${periodId} / ${side}`)
  return found
}

describe('period index — coverage', () => {
  it('lists every masa twice, newest first, keluaran before masukan', () => {
    expect(rows.map(r => `${r.masa} ${r.side}`)).toEqual([
      '05/2026 output', '05/2026 input',
      '04/2026 output', '04/2026 input',
      '03/2026 output', '03/2026 input',
      '02/2026 output', '02/2026 input',
      '01/2026 output', '01/2026 input',
      '12/2025 output', '12/2025 input',
    ])
  })

  it('gives every row a unique id — a masa alone is not unique', () => {
    expect(new Set(rows.map(r => r.id)).size).toBe(rows.length)
    expect(new Set(rows.map(r => r.periodId)).size).toBe(rows.length / 2)
  })

  it('reaches all three statuses, so the prototype demonstrates each', () => {
    expect([...new Set(rows.map(r => r.status))].sort()).toEqual([
      'not reconciled', 'partially reconciled', 'reconciled',
    ])
  })

  it('labels Jenis faktur from the shared side vocabulary', () => {
    expect(row(activePeriodId, 'output').jenis).toBe(SIDE_LABELS.output.title)
    expect(row(activePeriodId, 'input').jenis).toBe(SIDE_LABELS.input.title)
  })

  it('feeds the workspace period selector from the same list', () => {
    expect(reconPeriods).toEqual([...new Set(rows.map(r => r.label))])
  })

  it('resolves a period id to its label, and rejects an unknown one', () => {
    expect(periodLabelById(activePeriodId)).toBe(activePeriod)
    expect(periodLabelById('1999-01')).toBeUndefined()
  })
})

describe('period index — the two sides never share figures', () => {
  it('the active masa reports different amounts and counts per side', () => {
    const out = row(activePeriodId, 'output')
    const inp = row(activePeriodId, 'input')
    expect(out.erpAmount).not.toBe(inp.erpAmount)
    expect(out.erpCount).not.toBe(inp.erpCount)
  })

  it.each(SIDES)('%s amounts and counts come from that sides pairs alone', (side) => {
    const r = row(activePeriodId, side)
    const pairs = pairsForSide(side)
    const erp = reconTotals(pairs, 'erp')
    const djp = reconTotals(pairs, 'djp')

    expect(r.erpAmount).toBe(erp.total)
    expect(r.erpCount).toBe(erp.count)
    expect(r.djpAmount).toBe(djp.total)
    expect(r.djpCount).toBe(djp.count)
    expect(r.matched).toBe(matchCounts(pairs).matched)
    expect(r.total).toBe(pairs.length)
  })

  it('a one-sided pair is counted on one column only', () => {
    // o-09 is Coretax-only and o-07 / o-12 are ERP-only, so neither column
    // equals the pair count — this is what makes the counts worth showing.
    const out = row(activePeriodId, 'output')
    expect(out.erpCount).toBe(outputPairs.filter(p => p.erp).length)
    expect(out.djpCount).toBe(outputPairs.filter(p => p.djp).length)
    expect(out.erpCount).not.toBe(out.djpCount)

    const inp = row(activePeriodId, 'input')
    expect(inp.erpCount).toBe(inputPairs.filter(p => p.erp).length)
    expect(inp.djpCount).toBe(inputPairs.filter(p => p.djp).length)
  })
})

describe('period index — selisih and status agree', () => {
  it('selisih is the gap between the two columns, never signed', () => {
    for (const r of rows) {
      expect(r.selisih).toBe(Math.abs(r.erpAmount - r.djpAmount))
      expect(r.selisih).toBeGreaterThanOrEqual(0)
    }
  })

  it('a fully reconciled row has both columns agreeing, so no selisih', () => {
    const done = rows.filter(r => r.status === 'reconciled')
    expect(done.length).toBeGreaterThan(0)
    for (const r of done) {
      expect(r.matched).toBe(r.total)
      expect(r.erpAmount).toBe(r.djpAmount)
      expect(r.selisih).toBe(0)
    }
  })

  it('the live masa is partially reconciled, with a real selisih to explain', () => {
    for (const side of SIDES) {
      const r = row(activePeriodId, side)
      expect(r.status).toBe('partially reconciled')
      expect(r.matched).toBeGreaterThan(0)
      expect(r.matched).toBeLessThan(r.total)
      expect(r.selisih).toBeGreaterThan(0)
    }
  })

  it('a not-reconciled masa has nothing matched and no reconciliation date', () => {
    for (const side of SIDES) {
      const r = row('2026-05', side)
      expect(r.status).toBe('not reconciled')
      expect(r.matched).toBe(0)
      expect(r.reconciledAt).toBeUndefined()
    }
  })

  it('every row that has been reconciled at all carries a date', () => {
    for (const r of rows.filter(r => r.status !== 'not reconciled')) {
      expect(r.reconciledAt).toBeTruthy()
    }
  })

  it('the reconciliation date is period-level — both sides share it', () => {
    for (const periodId of [...new Set(rows.map(r => r.periodId))]) {
      expect(row(periodId, 'output').reconciledAt).toBe(row(periodId, 'input').reconciledAt)
    }
  })
})
