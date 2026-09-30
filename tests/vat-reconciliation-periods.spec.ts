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
import { describe, it, expect, afterEach } from 'vitest'
import {
  reconPeriodRows, reconPeriods, periodLabelById, activePeriodId, activePeriod,
  reconTotals, matchCounts, pairsForPeriod, outputPairs, inputPairs,
  SIDE_LABELS, MATCH_META, ATTENTION_STATES, FIRST_PERIOD_ID, exposureOf,
  finalizePeriod, unfinalizePeriod, isPeriodFinalized, canFinalizePeriod,
  periodFinalization, reconUnfinishedCount, CURRENT_USER, TODAY_ISO,
  type ReconSide,
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
      '06/2027 output', '06/2027 input',
      '05/2027 output', '05/2027 input',
      '04/2027 output', '04/2027 input',
      '03/2027 output', '03/2027 input',
      '02/2027 output', '02/2027 input',
      '01/2027 output', '01/2027 input',
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
    const pairs = pairsForPeriod(activePeriodId, side)
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
    // o-09 / o-16 are Coretax-only and o-07 is ERP-only, so neither column
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

  it('a not-reconciled masa has nothing matched', () => {
    for (const side of SIDES) {
      const r = row('2027-06', side)
      expect(r.status).toBe('not reconciled')
      expect(r.matched).toBe(0)
      // It still carries a date: matching ran automatically and found nothing to
      // pair, which is different from never having looked.
      expect(r.reconciledAt).toBeTruthy()
    }
  })

  it('the reconciliation date is period-level — both sides share it', () => {
    for (const periodId of [...new Set(rows.map(r => r.periodId))]) {
      expect(row(periodId, 'output').reconciledAt).toBe(row(periodId, 'input').reconciledAt)
    }
  })
})

/**
 * Every masa used to render 04/2026's fixtures, so opening 12/2025 showed April's
 * faktur under a December header — the row you clicked and the workspace it
 * opened disagreed on every number. The non-live masa are now derived from their
 * own seed, and these tests are what stop the two drifting apart again: if the
 * generator's arithmetic breaks, the index row and its workspace stop agreeing
 * and one of these fails.
 */
describe('VAT reconciliation — a period workspace agrees with its index row', () => {
  const rows = reconPeriodRows()
  const row = (periodId: string, side: ReconSide) =>
    rows.find(r => r.periodId === periodId && r.side === side)!

  for (const periodId of [...new Set(rows.map(r => r.periodId))]) {
    for (const side of SIDES) {
      it(`${periodId} · ${side} — totals, counts and matched all reconcile`, () => {
        const r = row(periodId, side)
        const pairs = pairsForPeriod(periodId, side)

        expect(pairs.length).toBe(r.total)
        expect(reconTotals(pairs, 'erp').total).toBe(r.erpAmount)
        expect(reconTotals(pairs, 'djp').total).toBe(r.djpAmount)
        expect(reconTotals(pairs, 'erp').count).toBe(r.erpCount)
        expect(reconTotals(pairs, 'djp').count).toBe(r.djpCount)
        expect(matchCounts(pairs).matched).toBe(r.matched)
      })
    }
  }

  it('each masa renders its own records, not the live masa\'s', () => {
    const april = new Set(pairsForPeriod(activePeriodId, 'output').map(p => p.id))
    for (const periodId of [...new Set(rows.map(r => r.periodId))].filter(p => p !== activePeriodId)) {
      for (const p of pairsForPeriod(periodId, 'output')) {
        expect(april.has(p.id)).toBe(false)
        expect(p.id.startsWith(periodId)).toBe(true)
      }
    }
  })

  it('a fully reconciled masa has no unmatched records left', () => {
    for (const r of rows.filter(r => r.status === 'reconciled')) {
      const pairs = pairsForPeriod(r.periodId, r.side)
      expect(pairs.every(p => p.match === 'matched')).toBe(true)
    }
  })
})

describe('VAT reconciliation — generated identifiers follow Coretax', () => {
  const periodIds = [...new Set(reconPeriodRows().map(r => r.periodId))]

  it('every nomor faktur pajak is 17 numeric digits', () => {
    for (const periodId of periodIds) {
      for (const side of SIDES) {
        for (const p of pairsForPeriod(periodId, side)) {
          if (p.djp) expect(p.djp.ref).toMatch(/^\d{17}$/)
        }
      }
    }
  })

  it('every NPWP is 16 numeric digits', () => {
    for (const periodId of periodIds) {
      for (const side of SIDES) {
        for (const p of pairsForPeriod(periodId, side)) {
          for (const rec of [p.erp, p.djp]) {
            if (rec) expect(rec.npwp).toMatch(/^\d{16}$/)
          }
        }
      }
    }
  })

  it('a faktur is never dated before the invoice it belongs to, unless that is the point', () => {
    for (const periodId of periodIds) {
      for (const side of SIDES) {
        for (const p of pairsForPeriod(periodId, side)) {
          if (!p.erp || !p.djp || p.match === 'faktur-predates') continue
          expect(new Date(p.djp.date).getTime()).toBeGreaterThanOrEqual(new Date(p.erp.date).getTime())
        }
      }
    }
  })
})

/**
 * PRD OD-001 v1.0 §5.1. The whole point of the status model is that no row ever
 * sits in a generic "unmatched" state — every exception names its cause, and
 * every named cause has somewhere for the UI to hang a fix action. These tests
 * fail the moment a status is added to the union without copy, or a fixture is
 * written into a state the model doesn't define.
 */
describe('VAT reconciliation — the status model matches the PRD', () => {
  it('every status carries display copy', () => {
    for (const state of [...ATTENTION_STATES, 'matched' as const]) {
      const meta = MATCH_META[state]
      expect(meta, `no MATCH_META for ${state}`).toBeTruthy()
      expect(meta.label.length).toBeGreaterThan(0)
      expect(meta.longLabel.length).toBeGreaterThan(0)
      expect(meta.chipLabel.length).toBeGreaterThan(0)
    }
  })

  it('badge labels stay within the two-word limit', () => {
    for (const state of [...ATTENTION_STATES, 'matched' as const]) {
      expect(MATCH_META[state].label.split(' ').length, MATCH_META[state].label)
        .toBeLessThanOrEqual(3)
    }
  })

  it('no row is left in a generic unmatched state', () => {
    for (const side of SIDES) {
      for (const p of pairsForPeriod(activePeriodId, side)) {
        expect(p.match).not.toBe('unmatched')
        if (p.match !== 'matched') {
          expect(ATTENTION_STATES).toContain(p.match)
          expect(p.reason, `${p.id} has no reason`).toBeTruthy()
        }
      }
    }
  })

  it('a matched row always records whether the engine or a person matched it', () => {
    for (const periodId of [...new Set(reconPeriodRows().map(r => r.periodId))]) {
      for (const side of SIDES) {
        for (const p of pairsForPeriod(periodId, side).filter(p => p.match === 'matched')) {
          expect(p.matchedBy, `${p.id}`).toMatch(/^(auto|manual)$/)
        }
      }
    }
  })

  it('auto and manual matches add up to the matched count', () => {
    for (const side of SIDES) {
      const c = matchCounts(pairsForPeriod(activePeriodId, side))
      expect(c['matched-auto']! + c['matched-manual']!).toBe(c.matched)
      expect(c['matched-manual']).toBeGreaterThan(0)
    }
  })

  it('the first period offered is 01/2027 — nothing earlier', () => {
    const ids = [...new Set(reconPeriodRows().map(r => r.periodId))].sort()
    expect(ids[0]).toBe(FIRST_PERIOD_ID)
  })

  it('a faktur that is not Approved is never matched', () => {
    for (const periodId of [...new Set(reconPeriodRows().map(r => r.periodId))]) {
      for (const side of SIDES) {
        for (const p of pairsForPeriod(periodId, side)) {
          if (p.djp && p.djp.approved === false) expect(p.match).not.toBe('matched')
        }
      }
    }
  })
})

describe('VAT reconciliation — exposure', () => {
  it('an unreflected return is exposed for the return amount, not zero', () => {
    const pair = pairsForPeriod(activePeriodId, 'output')
      .find(p => p.match === 'return-not-reflected')!
    expect(pair).toBeTruthy()
    // Both totals agree — the gap is zero, but the return is what is at risk.
    expect(pair.erp!.total).toBe(pair.djp!.total)
    expect(exposureOf(pair)).toBe(pair.erp!.returnTotal)
    expect(exposureOf(pair)).toBeGreaterThan(0)
  })

  it('a voided invoice is exposed for the whole faktur still live at DJP', () => {
    const pair = pairsForPeriod(activePeriodId, 'output')
      .find(p => p.match === 'invoice-voided')!
    expect(pair).toBeTruthy()
    expect(pair.erp!.total).toBe(pair.djp!.total)
    expect(exposureOf(pair)).toBe(pair.djp!.total)
  })

  it('a one-sided row is exposed for its whole value', () => {
    for (const side of SIDES) {
      for (const p of pairsForPeriod(activePeriodId, side)) {
        if (p.erp && !p.djp) expect(exposureOf(p)).toBe(p.erp.total)
        if (!p.erp && p.djp) expect(exposureOf(p)).toBe(p.djp.total)
      }
    }
  })
})


/**
 * Matching is automatic per masa pajak — there is no "run it first" state. A
 * masa whose faktur have not synced yet still reconciles; it simply matches
 * nothing, which is what §5.2 calls Not reconciled. These tests hold that line,
 * because the alternative (inventing statuses for un-synced data) is what made a
 * period render matches it had not earned.
 */
describe('VAT reconciliation — matching is automatic', () => {
  const rows = reconPeriodRows()

  it('every masa has pairs, with no run needed', () => {
    for (const periodId of [...new Set(rows.map(r => r.periodId))]) {
      for (const side of SIDES) {
        expect(pairsForPeriod(periodId, side).length).toBeGreaterThan(0)
      }
    }
  })

  it('every masa carries a reconciled-on date', () => {
    for (const r of rows) expect(r.reconciledAt).toBeTruthy()
  })

  it('a masa with no faktur synced matches nothing and reads Not reconciled', () => {
    const none = rows.filter(r => r.djpCount === 0)
    expect(none.length).toBeGreaterThan(0)
    for (const r of none) {
      expect(r.matched).toBe(0)
      expect(r.status).toBe('not reconciled')
      // Nothing to pair with, so every invoice is exposed for its full value.
      expect(r.selisih).toBe(r.erpAmount)
      for (const p of pairsForPeriod(r.periodId, r.side)) {
        expect(p.match).toBe('not-in-coretax')
      }
    }
  })
})


/**
 * Finalize (US-021) is a **record, not a lock**: it says what was reconciled and
 * who signed it off. Two things make it easy to get wrong, so both are pinned —
 * you must not be able to sign off a period that still has exceptions in it, and
 * signing one off must not make the outstanding-work badge go *up*.
 *
 * These mutate persisted state, so each test cleans up after itself.
 */
describe('VAT reconciliation — finalize a period', () => {
  const doneId = reconPeriodRows().find(r => r.status === 'reconciled')!.periodId
  const openId = reconPeriodRows().find(r => r.status === 'partially reconciled')!.periodId

  afterEach(() => {
    unfinalizePeriod(doneId)
    unfinalizePeriod(openId)
  })

  it('offers finalize only on a masa where every pair is reconciled', () => {
    expect(canFinalizePeriod(doneId)).toBe(true)
    expect(canFinalizePeriod(openId)).toBe(false)
  })

  it('records who signed it off and when', () => {
    finalizePeriod(doneId)
    const f = periodFinalization(doneId)!
    expect(f.finalizedBy).toBe(CURRENT_USER)
    // The prototype's own clock, not the wall clock — the same rule as re-run.
    expect(f.finalizedAt).toBe(TODAY_ISO)
  })

  it('moves the period to Finalized, on both sides at once', () => {
    finalizePeriod(doneId)
    const sides = reconPeriodRows().filter(r => r.periodId === doneId)
    expect(sides).toHaveLength(2)
    for (const r of sides) expect(r.status).toBe('finalized')
  })

  it('does not offer finalize twice', () => {
    finalizePeriod(doneId)
    expect(isPeriodFinalized(doneId)).toBe(true)
    expect(canFinalizePeriod(doneId)).toBe(false)
  })

  it('unfinalize returns it to Reconciled', () => {
    finalizePeriod(doneId)
    unfinalizePeriod(doneId)
    expect(isPeriodFinalized(doneId)).toBe(false)
    for (const r of reconPeriodRows().filter(r => r.periodId === doneId)) {
      expect(r.status).toBe('reconciled')
    }
  })

  it('signing a period off never raises the outstanding-work count', () => {
    const before = reconUnfinishedCount()
    finalizePeriod(doneId)
    expect(reconUnfinishedCount()).toBeLessThanOrEqual(before)
  })

  it('a finalized period keeps its figures — it is a record, not a recount', () => {
    const before = reconPeriodRows().filter(r => r.periodId === doneId)
      .map(r => `${r.erpAmount}/${r.djpAmount}/${r.matched}/${r.total}`)
    finalizePeriod(doneId)
    const after = reconPeriodRows().filter(r => r.periodId === doneId)
      .map(r => `${r.erpAmount}/${r.djpAmount}/${r.matched}/${r.total}`)
    expect(after).toEqual(before)
  })
})
