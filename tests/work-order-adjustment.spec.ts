/**
 * Adjust work order and the actual end date: adjustments override the BOM for one
 * work order, cost is allocated across outputs, and the end date can't precede routing.
 */
import { describe, it, expect } from 'vitest'
import { allocateProductionCost, neededQtyFor } from '~/data/workOrderAdjustment'
import { workOrderEndWindow, isWithinWindow } from '~/data/workOrderRouting'

describe('neededQtyFor', () => {
  it('uses the adjustment, falling back to the BOM', () => {
    const wo = { adjustment: { rawNeeded: { a: 7 }, costMultipliers: {}, otherOutputs: [], productionWaste: [], mainPercentage: 100 } }
    expect(neededQtyFor(wo, 'a', 3)).toBe(7)
    expect(neededQtyFor(wo, 'b', 3)).toBe(3)
    expect(neededQtyFor({}, 'a', 3)).toBe(3)
  })
})

describe('allocateProductionCost', () => {
  it('matches the Figma split: main output absorbs the remainder', () => {
    const r = allocateProductionCost(13_100_000, [{ percentage: 10 }, { percentage: 10 }], [{ percentage: 5 }])
    expect(r.otherAmounts).toEqual([1_310_000, 1_310_000])
    expect(r.wasteAmounts).toEqual([655_000])
    expect(r.mainAmount).toBe(9_825_000)
    expect(r.mainPercentage).toBe(75)
  })

  it('counts fixed-amount waste as its share of the total', () => {
    const r = allocateProductionCost(1000, [], [{ percentage: 0, fixedAmount: 250 }])
    expect(r.wasteAmounts).toEqual([250])
    expect(r.mainPercentage).toBe(75)
  })

  it('goes negative when over-allocated, which the form rejects', () => {
    expect(allocateProductionCost(1000, [{ percentage: 80 }], [{ percentage: 30 }]).mainPercentage).toBeLessThan(0)
  })
})

describe('workOrderEndWindow', () => {
  const wo = { startDate: '2026-01-02', planStartDate: '2026-01-01' }

  it('starts at the last routing end date', () => {
    const w = workOrderEndWindow(wo, [{ endDate: '2026-01-09' }, { endDate: '2026-01-11' }], '2026-01-12')
    expect(isWithinWindow('2026-01-10', w)).toBe(false)
    expect(isWithinWindow('2026-01-11', w)).toBe(true)
    expect(isWithinWindow('2026-01-13', w)).toBe(false)
  })

  it('falls back to the work order start with no routing', () => {
    expect(workOrderEndWindow(wo, [], '2026-01-12').min).toBe('2026-01-02')
  })
})
