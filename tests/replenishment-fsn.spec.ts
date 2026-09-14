/**
 * FSN classification, hysteresis and dwell (PRD OD-006, US-012, US-015).
 *
 * The hysteresis rules are the subtlest logic in the feature, so they are tested as
 * pure functions rather than through the storage layer:
 *  • thresholds at exactly 60 and 10
 *  • "unclassified" for too-little-history — NOT misclassified as Non-moving
 *  • a class holds while inside the ±band, and its dwell counter resets
 *  • a candidate outside the band must repeat for N cycles before committing
 *  • decisive moves bypass the dwell entirely
 *
 * Pure — no storage is written.
 */
import { describe, it, expect } from 'vitest'
import { rawFsnClass, applyHysteresis, fsnFor, replenishmentWarehouses } from '~/data/replenishment'
import { REPL_DEFAULTS } from '~/data/replenishmentConfig'
import { warehouseProducts } from '~/data/inventory'
import type { FsnClassMemo } from '~/data/replenishmentRuns'

const cfg = REPL_DEFAULTS
const ENOUGH_HISTORY = cfg.coldStartMinDays + 1

function memo(patch: Partial<FsnClassMemo> = {}): FsnClassMemo {
  return { cls: 'slow', since: 1, dwell: 0, candidate: null, ...patch }
}

describe('rawFsnClass — thresholds (US-012 AC-01)', () => {
  it('classifies at and above the Fast threshold', () => {
    expect(rawFsnClass(60, ENOUGH_HISTORY, cfg)).toBe('fast')
    expect(rawFsnClass(85, ENOUGH_HISTORY, cfg)).toBe('fast')
  })

  it('classifies the Slow band, exclusive of Fast', () => {
    expect(rawFsnClass(59.9, ENOUGH_HISTORY, cfg)).toBe('slow')
    expect(rawFsnClass(10, ENOUGH_HISTORY, cfg)).toBe('slow')
  })

  it('classifies below the Slow threshold as Non-moving', () => {
    expect(rawFsnClass(9.9, ENOUGH_HISTORY, cfg)).toBe('non-moving')
    expect(rawFsnClass(0, ENOUGH_HISTORY, cfg)).toBe('non-moving')
  })

  it('reports unclassified — not Non-moving — when history is too short (EH-01)', () => {
    // A brand-new SKU with no movement must never be branded a dead product.
    expect(rawFsnClass(0, cfg.coldStartMinDays - 1, cfg)).toBe('unclassified')
    expect(rawFsnClass(80, 3, cfg)).toBe('unclassified')
  })
})

describe('applyHysteresis — holding a class (US-015 AC-01/AC-02)', () => {
  it('commits immediately when there is no prior class', () => {
    const r = applyHysteresis(undefined, 'fast', 70, cfg, 1)
    expect(r.memo.cls).toBe('fast')
    expect(r.memo.dwell).toBe(0)
  })

  it('is a no-op when the raw class already matches', () => {
    const r = applyHysteresis(memo({ cls: 'slow', dwell: 1, candidate: 'fast' }), 'slow', 40, cfg, 2)
    expect(r.memo.cls).toBe('slow')
    expect(r.memo.dwell).toBe(0)
    expect(r.memo.candidate).toBeNull()
  })

  it('holds the current class while inside the hysteresis band', () => {
    // Crossing 60 upward needs to clear 65; 62 is inside the ±5 band.
    const r = applyHysteresis(memo({ cls: 'slow' }), 'fast', 62, cfg, 2)
    expect(r.inBand).toBe(true)
    expect(r.memo.cls).toBe('slow')
    expect(r.memo.candidate).toBeNull()
  })

  it('resets a pending candidate when the value falls back into the band', () => {
    const pending = memo({ cls: 'slow', dwell: 1, candidate: 'fast' })
    const r = applyHysteresis(pending, 'fast', 61, cfg, 3)
    expect(r.memo.dwell).toBe(0)
    expect(r.memo.candidate).toBeNull()
    expect(r.memo.cls).toBe('slow')
  })
})

describe('applyHysteresis — dwell (US-015 AC-01)', () => {
  it('requires the candidate to repeat before committing', () => {
    // 67 clears the band (60 + 5) but is under the decisive margin (60 + 10).
    const first = applyHysteresis(memo({ cls: 'slow' }), 'fast', 67, cfg, 2)
    expect(first.memo.cls).toBe('slow')          // not yet
    expect(first.memo.candidate).toBe('fast')
    expect(first.memo.dwell).toBe(1)

    const second = applyHysteresis(first.memo, 'fast', 67, cfg, 3)
    expect(second.memo.cls).toBe('fast')          // dwell met on cycle 2
    expect(second.memo.dwell).toBe(0)
    expect(second.memo.candidate).toBeNull()
  })

  it('starts the dwell over when the candidate changes', () => {
    const pending = memo({ cls: 'slow', dwell: 1, candidate: 'fast' })
    const r = applyHysteresis(pending, 'non-moving', 4, cfg, 3)
    // slow → non-moving is one step, and 4 is 6 below the 10 boundary: past the
    // band but not decisive, so it becomes a fresh candidate.
    expect(r.memo.candidate).toBe('non-moving')
    expect(r.memo.dwell).toBe(1)
    expect(r.memo.cls).toBe('slow')
  })
})

describe('applyHysteresis — decisive moves bypass the dwell (US-015 AC-03)', () => {
  it('commits a two-step jump immediately', () => {
    const r = applyHysteresis(memo({ cls: 'fast' }), 'non-moving', 0, cfg, 2)
    expect(r.decisive).toBe(true)
    expect(r.memo.cls).toBe('non-moving')
  })

  it('commits immediately when far beyond the band', () => {
    // 2× the band past the boundary — an unambiguous move, not a wobble.
    const r = applyHysteresis(memo({ cls: 'slow' }), 'fast', 60 + cfg.fsnHysteresisPct * 2, cfg, 2)
    expect(r.decisive).toBe(true)
    expect(r.memo.cls).toBe('fast')
  })

  it('commits transitions out of unclassified immediately', () => {
    // History crossing the threshold is a data-availability change, not a demand
    // wobble — making it wait two cycles would be dishonest.
    const r = applyHysteresis(memo({ cls: 'unclassified' }), 'slow', 30, cfg, 2)
    expect(r.decisive).toBe(true)
    expect(r.memo.cls).toBe('slow')
  })

  it('commits transitions into unclassified immediately', () => {
    const r = applyHysteresis(memo({ cls: 'fast' }), 'unclassified', 70, cfg, 2)
    expect(r.decisive).toBe(true)
    expect(r.memo.cls).toBe('unclassified')
  })
})

describe('fsnFor — over the real ledger', () => {
  it('reports a class, a movement percentage and the window for every pair', () => {
    for (const wh of replenishmentWarehouses()) {
      for (const p of warehouseProducts(wh.id)) {
        const fsn = fsnFor(p.sku, wh.id)
        expect(['fast', 'slow', 'non-moving', 'unclassified']).toContain(fsn.raw)
        expect(['fast', 'slow', 'non-moving', 'unclassified']).toContain(fsn.committed)
        expect(fsn.movementPct).toBeGreaterThanOrEqual(0)
        expect(fsn.movementPct).toBeLessThanOrEqual(100)
        expect(fsn.periods).toBe(cfg.fsnWindowDays)
        expect(fsn.movementDays).toBeLessThanOrEqual(fsn.periods)
      }
    }
  })

  it('the movement percentage really is movementDays / periods', () => {
    for (const wh of replenishmentWarehouses().slice(0, 3)) {
      for (const p of warehouseProducts(wh.id)) {
        const fsn = fsnFor(p.sku, wh.id)
        expect(fsn.movementPct).toBeCloseTo((fsn.movementDays / fsn.periods) * 100, 6)
      }
    }
  })

  it('with no run history yet, the committed class is the raw class', () => {
    // Nothing has been recalculated in a plain node environment, so there are no
    // memos and the page must still show a sensible class rather than nothing.
    const fsn = fsnFor('1101', 'wh-001')
    expect(fsn.committed).toBe(fsn.raw)
  })

  it('all three classes occur across the catalogue', () => {
    const seen = new Set<string>()
    for (const wh of replenishmentWarehouses()) {
      for (const p of warehouseProducts(wh.id)) seen.add(fsnFor(p.sku, wh.id).committed)
    }
    expect(seen.has('fast')).toBe(true)
    expect(seen.has('slow')).toBe(true)
    expect(seen.has('non-moving')).toBe(true)
  })
})
