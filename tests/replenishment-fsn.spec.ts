/**
 * FSN classification (PRD OD-006, US-012).
 *
 * FSN is recomputed on every recalculation over the classification window; there is
 * no cross-run hysteresis/dwell smoothing, so the committed class equals the raw
 * class. Tests cover:
 *  • thresholds at exactly 60 and 10
 *  • "unclassified" for too-little-history — NOT misclassified as Non-moving
 *  • fsnFor over the real ledger
 *
 * Pure — no storage is written.
 */
import { describe, it, expect } from 'vitest'
import { rawFsnClass, fsnFor, replenishmentWarehouses } from '~/data/replenishment'
import { REPL_DEFAULTS } from '~/data/replenishmentConfig'
import { warehouseProducts } from '~/data/inventory'

const cfg = REPL_DEFAULTS
const ENOUGH_HISTORY = cfg.coldStartMinDays + 1

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

  it('the committed class equals the raw class (FSN is recomputed each run)', () => {
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
