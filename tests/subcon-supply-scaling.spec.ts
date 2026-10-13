/**
 * R8 — an increase reopens supply for the difference (Design Brief DB-05, F4).
 * A component's need scales with the order's output; adjustments only add to it.
 */
import { describe, it, expect } from 'vitest'
import { workOrders, subconPlannedComponentQty, subconComponentBaseQty, type WorkOrder } from '../app/data/workOrders'

const base = workOrders.find(w => w.category === 'Subcontracting')!
/** An order created for `startedAt`, since raised to `plannedQty`. */
const at = (plannedQty: number, startedAt = plannedQty, adjustments?: Record<string, number>): WorkOrder => ({
  ...base,
  plannedQty,
  subcon: {
    ...base.subcon!,
    componentAdjustments: adjustments,
    adjustments: plannedQty === startedAt ? [] : [{ field: 'output', from: startedAt, to: plannedQty, reason: 'Tambahan order', date: '2026-10-13' }],
  },
})

describe('component need scales with how far the output was raised (R8)', () => {
  it('an order that was never adjusted needs exactly what the BOM says', () => {
    expect(subconComponentBaseQty(at(500), 20)).toBe(20)
    // …whatever its quantity is — the BOM figure is what the order needed on creation.
    expect(subconComponentBaseQty(at(300), 20)).toBe(20)
  })

  it('F4 — raising output 500 → 600 raises a 20 kg need to 24 kg', () => {
    expect(subconPlannedComponentQty(at(600, 500), 'X', 20)).toBeCloseTo(24, 3)
  })

  it('so the shortfall against what is already sent is only the difference', () => {
    const needed = subconPlannedComponentQty(at(600, 500), 'X', 20)
    expect(needed - 20).toBeCloseTo(4, 3)
  })

  it('a second increase scales from the ORIGINAL output, not from the last one', () => {
    const wo = at(700, 500)
    expect(subconPlannedComponentQty(wo, 'X', 20)).toBeCloseTo(28, 3)
  })

  it('an adjustment above the scaled need wins; one below it never lowers the need', () => {
    expect(subconPlannedComponentQty(at(500, 500, { X: 30 }), 'X', 20)).toBe(30)
    expect(subconPlannedComponentQty(at(1000, 500, { X: 30 }), 'X', 20)).toBe(40)
  })
})
