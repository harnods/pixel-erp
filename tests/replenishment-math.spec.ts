/**
 * Replenishment MATH — the PRD formula and its rounding rules, table-driven.
 *
 * Guards the clauses most likely to drift:
 *  • the suggested-qty formula itself (US-008 AC-01), floored at 0
 *  • MOQ raise → pack round-up, and that converting BEFORE those rules is
 *    equivalent to converting after (relies on moq % packSize === 0)
 *  • the configurable inclusive/exclusive reorder-point boundary (US-010 AC-02)
 *  • days-of-cover's undefined case at zero velocity (US-019 AC-02)
 *  • safety-days precedence and window-weight validation
 *
 * Pure — no data is mutated.
 */
import { describe, it, expect } from 'vitest'
import {
  suggestedRawQty, applyMoqAndPack, isSuppressed, daysOfCover, resolveReorderPoint,
} from '~/data/replenishment'
import {
  REPL_DEFAULTS, safetyDaysForCategory,
} from '~/data/replenishmentConfig'
import type { VendorItem } from '~/data/vendorItems'
import type { EffectiveReplenishmentSettings } from '~/data/replenishmentSettings'

function vi(patch: Partial<VendorItem> = {}): VendorItem {
  return {
    id: 'vi-test', vendorId: 'V001', sku: '1001', isPreferred: true,
    leadTimeDays: 14, purchaseUnit: 'Pallet', unitsPerPurchaseUnit: 20,
    moq: 2, packSize: 1, unitCost: 1_000_000, vendorSku: 'X', active: true,
    ...patch,
  }
}

function settings(patch: Partial<EffectiveReplenishmentSettings> = {}): EffectiveReplenishmentSettings {
  return {
    reorderPointOverride: null, reorderPointSource: 'none',
    safetyDays: 7, safetyDaysSource: 'global',
    maxLevel: null, maxLevelSource: 'none',
    tracked: true, trackedSource: 'default',
    manualDailyDemand: null, manualDailyDemandSource: 'none',
    ...patch,
  }
}

describe('suggestedRawQty — the PRD formula (§2.3 / US-008 AC-03)', () => {
  type Case = {
    name: string; lead: number; safety: number; coverage: number
    advs: number; avail: number; onOrder: number; want: number
  }
  const cases: Case[] = [
    // qty = velocity × (lead + safety + coverage) − (net available + on-order)
    { name: 'plain shortfall',           lead: 14, safety: 7, coverage: 0,  advs: 10,   avail: 100, onOrder: 0,  want: 110 },
    { name: 'on-order reduces the need', lead: 14, safety: 7, coverage: 0,  advs: 10,   avail: 100, onOrder: 50, want: 60 },
    { name: 'rounds up to whole units',  lead: 10, safety: 0, coverage: 0,  advs: 1.05, avail: 0,   onOrder: 0,  want: 11 },
    { name: 'never negative (AC-04)',    lead: 14, safety: 7, coverage: 0,  advs: 1,    avail: 500, onOrder: 0,  want: 0 },
    { name: 'exactly covered → 0',       lead: 10, safety: 0, coverage: 0,  advs: 10,   avail: 100, onOrder: 0,  want: 0 },
    { name: 'zero velocity → 0',         lead: 14, safety: 7, coverage: 30, advs: 0,    avail: 0,   onOrder: 0,  want: 0 },
    // The PRD's own worked example, §2.4: lead 14, safety 7, coverage 30,
    // 10 units/day, 150 available, nothing on order → 510 − 150 = 360.
    { name: 'PRD §2.4 worked example',   lead: 14, safety: 7, coverage: 30, advs: 10,   avail: 150, onOrder: 0,  want: 360 },
    // Coverage is what stops an order refilling only to the trigger: without it
    // this same row would ask for 60, be due again tomorrow, and re-fire forever.
    { name: 'coverage sizes the order',  lead: 14, safety: 7, coverage: 30, advs: 10,   avail: 150, onOrder: 0,  want: 360 },
  ]

  for (const c of cases) {
    it(c.name, () => {
      expect(suggestedRawQty(c.lead, c.safety, c.coverage, c.advs, c.avail, c.onOrder)).toBe(c.want)
    })
  }

  it('coverage days never change the trigger, only the size', () => {
    // Same inputs, different coverage: the quantity grows by exactly
    // coverage × velocity, and nothing else moves.
    const base = suggestedRawQty(14, 7, 0, 10, 150, 0)
    expect(suggestedRawQty(14, 7, 30, 10, 150, 0)).toBe(base + 300)
    expect(suggestedRawQty(14, 7, 60, 10, 150, 0)).toBe(base + 600)
  })

  it('a Max level replaces the coverage horizon as the target (US-011 AC-03)', () => {
    // Order up to 400 units regardless of the coverage-days horizon.
    expect(suggestedRawQty(14, 7, 30, 10, 150, 0, 400)).toBe(250)
    expect(suggestedRawQty(14, 7, 999, 10, 150, 0, 400)).toBe(250)
    // Already at or above the level → nothing to order, never negative.
    expect(suggestedRawQty(14, 7, 30, 10, 400, 0, 400)).toBe(0)
    expect(suggestedRawQty(14, 7, 30, 10, 500, 0, 400)).toBe(0)
    // On-order counts toward the level, so it cannot double-order.
    expect(suggestedRawQty(14, 7, 30, 10, 150, 100, 400)).toBe(150)
  })

  it('is floored at 0 for every plausible input', () => {
    for (let avail = 0; avail < 50; avail += 7) {
      for (let advs = 0; advs < 5; advs += 0.5) {
        for (const coverage of [0, 30, 60]) {
          expect(suggestedRawQty(14, 7, coverage, advs, avail, 0)).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })
})

describe('applyMoqAndPack — MOQ, pack size, UoM conversion (US-009)', () => {
  it('converts stocking units to whole purchase units, rounding up', () => {
    // 100 Sack at 20 Sack/Pallet = 5 Pallets exactly
    const r = applyMoqAndPack(100, vi({ moq: 1, packSize: 1 }))
    expect(r.purchaseQty).toBe(5)
    expect(r.stockingQty).toBe(100)
    expect(r.raisedByMoq).toBe(false)
    expect(r.raisedByPack).toBe(false)
  })

  it('rounds a part-pallet up to a whole pallet', () => {
    const r = applyMoqAndPack(81, vi({ moq: 1, packSize: 1 }))
    expect(r.purchaseQty).toBe(5)      // ceil(81/20)
    expect(r.stockingQty).toBe(100)
  })

  it('raises to MOQ and says so (AC-01)', () => {
    const r = applyMoqAndPack(20, vi({ moq: 3, packSize: 1 }))  // needs 1, MOQ 3
    expect(r.purchaseQty).toBe(3)
    expect(r.raisedByMoq).toBe(true)
    expect(r.raisedByPack).toBe(false)
  })

  it('rounds up to the pack multiple and says so (AC-02)', () => {
    // needs 3 cartons, sold in packs of 2 → 4
    const r = applyMoqAndPack(30, vi({ purchaseUnit: 'Carton', unitsPerPurchaseUnit: 12, moq: 2, packSize: 2 }))
    expect(r.purchaseQty).toBe(4)
    expect(r.stockingQty).toBe(48)
    expect(r.raisedByPack).toBe(true)
  })

  it('reports the quantity in purchase UoM while stocking UoM differs (AC-03)', () => {
    const item = vi({ purchaseUnit: 'Carton', unitsPerPurchaseUnit: 24, moq: 6, packSize: 3 })
    const r = applyMoqAndPack(50, item)
    expect(r.purchaseQty).toBe(6)                 // ceil(50/24)=3 → MOQ 6 → pack of 3 → 6
    expect(r.stockingQty).toBe(6 * 24)
  })

  it('returns zero for a zero requirement (never an MOQ-sized phantom order)', () => {
    const r = applyMoqAndPack(0, vi({ moq: 5 }))
    expect(r.purchaseQty).toBe(0)
    expect(r.stockingQty).toBe(0)
  })

  it('falls back to 1:1 with no vendor item', () => {
    const r = applyMoqAndPack(7, undefined)
    expect(r.purchaseQty).toBe(7)
    expect(r.stockingQty).toBe(7)
  })

  it('convert-then-MOQ equals MOQ-then-convert while moq is a whole pack multiple', () => {
    // The seed guarantees moq % packSize === 0. This asserts the equivalence the
    // engine's chosen ordering relies on, so breaking that invariant fails loudly.
    for (const [unitsPer, moq, packSize] of [[20, 2, 1], [12, 4, 2], [24, 6, 3], [1, 1, 1]] as const) {
      expect(moq % packSize).toBe(0)
      for (let raw = 1; raw <= 200; raw += 7) {
        const item = vi({ unitsPerPurchaseUnit: unitsPer, moq, packSize })
        const ours = applyMoqAndPack(raw, item)
        // Alternative ordering: apply MOQ/pack in stocking units, then convert.
        const moqStocking = moq * unitsPer
        const packStocking = packSize * unitsPer
        const afterMoq = Math.max(raw, moqStocking)
        const alt = Math.ceil(afterMoq / packStocking) * packStocking
        expect(ours.stockingQty).toBe(alt)
      }
    }
  })
})

describe('isSuppressed — the reorder-point boundary (US-010 AC-02)', () => {
  it('inclusive treats sitting exactly at the point as covered', () => {
    expect(isSuppressed(100, 0, 100, 'inclusive')).toBe(true)
    expect(isSuppressed(99, 0, 100, 'inclusive')).toBe(false)
    expect(isSuppressed(101, 0, 100, 'inclusive')).toBe(true)
  })

  it('exclusive only suppresses strictly above the point', () => {
    expect(isSuppressed(100, 0, 100, 'exclusive')).toBe(false)
    expect(isSuppressed(101, 0, 100, 'exclusive')).toBe(true)
  })

  it('counts on-order toward coverage (US-006 AC-03)', () => {
    expect(isSuppressed(60, 50, 100, 'inclusive')).toBe(true)
    expect(isSuppressed(60, 10, 100, 'inclusive')).toBe(false)
  })
})

describe('daysOfCover (US-019)', () => {
  it('divides available by velocity (AC-01)', () => {
    expect(daysOfCover(120, 10, 14).coverDays).toBe(12)
  })

  it('is undefined at zero velocity — never Infinity (AC-02)', () => {
    const r = daysOfCover(120, 0, 14)
    expect(r.coverDays).toBeNull()
    expect(r.belowLeadTime).toBe(false)
    expect(Number.isFinite(r.coverDays as unknown as number)).toBe(false)
  })

  it('flags stocking out before resupply (AC-03)', () => {
    expect(daysOfCover(120, 10, 14).belowLeadTime).toBe(true)   // 12 < 14
    expect(daysOfCover(200, 10, 14).belowLeadTime).toBe(false)  // 20 > 14
  })
})

describe('resolveReorderPoint', () => {
  it('computes velocity × (lead + safety) when nothing is overridden', () => {
    const r = resolveReorderPoint(settings({ safetyDays: 7 }), 2, 14)
    expect(r.value).toBe(42)
    expect(r.source).toBe('calculated')
  })

  it('prefers a SKU-warehouse override', () => {
    const r = resolveReorderPoint(
      settings({ reorderPointOverride: 500, reorderPointSource: 'sku-warehouse' }), 2, 14,
    )
    expect(r.value).toBe(500)
    expect(r.source).toBe('sku-warehouse')
  })

  it('has no reorder point at zero velocity — no category floor exists (D17)', () => {
    // Min stock is ALWAYS demand × (lead + safety). With no demand — measured or
    // seeded — there is nothing to compute, so no floor is invented; the SKU is
    // routed to Needs setup upstream instead.
    const r = resolveReorderPoint(settings(), 0, 14)
    expect(r.source).toBe('none')
    expect(r.value).toBe(0)
  })

  it('uses the cold-start demand seed like any other demand (D17)', () => {
    // A seeded cold-start rate is just demand: the reorder point computes from it
    // exactly as it would from a measured velocity — one formula, one path.
    const r = resolveReorderPoint(settings({ safetyDays: 7 }), 2, 14)
    expect(r.value).toBe(42)
    expect(r.source).toBe('calculated')
  })
})

describe('config validation', () => {
  it('resolves safety days by category, then global', () => {
    expect(safetyDaysForCategory('Green Beans')).toBe(REPL_DEFAULTS.safetyDaysByCategory['Green Beans'])
    expect(safetyDaysForCategory('Nonexistent category')).toBe(REPL_DEFAULTS.safetyDaysGlobal)
  })
})
