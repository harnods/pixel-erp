import { describe, it, expect } from 'vitest'
import {
  consolidations, assertReportBalances, profitLossLines, balanceSheetLines, GROUP_UNIT_IDS,
  entryTotals, eliminationRules, entryFromRule,
} from '~/data/consolidation'

const completed = consolidations.filter((c) => c.status === 'completed')

describe('consolidation report figures', () => {
  it('seeds at least one completed consolidation for the full group', () => {
    expect(completed.length).toBeGreaterThan(0)
    expect(completed[0]!.unitIds).toEqual(GROUP_UNIT_IDS)
  })

  it('consolidated = Σ entities − eliminations on every line; balance sheet balances', () => {
    for (const c of completed) {
      expect(() => assertReportBalances(c)).not.toThrow()
      for (const u of c.unitIds) expect(() => assertReportBalances(c, [u])).not.toThrow()
    }
  })

  it('eliminations actually change the consolidated figures', () => {
    const c = completed[0]!
    const pl = profitLossLines(c, c.unitIds)
    const rev = pl.find((l) => l.kind === 'total' && l.label === 'Total revenue')!.values!
    expect(rev.elim).toBe(1_200_000_000)
    expect(rev.consolidated).toBe(rev['bu-cpi']! + rev['bu-cpr']! + rev['bu-cps']! - 1_200_000_000)
    const bs = balanceSheetLines(c, c.unitIds).filter((l) => l.kind === 'grand')
    expect(bs[0]!.values!.consolidated).toBe(bs[1]!.values!.consolidated)
  })

  it('every active elimination rule produces a balanced entry', () => {
    for (const r of eliminationRules.filter((x) => x.status === 'active')) {
      const t = entryTotals(entryFromRule(r))
      expect(t.debit).toBe(t.credit)
    }
  })
})
