/**
 * Adjusting a subcon work order — PRD Rev 5 R7 / I7, Design Brief fixture F4.
 * Quantities only increase, and every adjustment carries a reason.
 */
import { describe, it, expect } from 'vitest'
import { evaluateSubconAdjustment } from '../app/data/subcon'

const KAIN = { sku: 'FAB-KTN-01', name: 'Kain katun premium', unit: 'm', current: 500 }
const base = {
  currentOutput: 500,
  components: [{ ...KAIN, next: 500 }],
  reason: 'Tambahan order pelanggan',
}

describe('evaluateSubconAdjustment', () => {
  it('F4 — raising output 500 → 600 with a reason is accepted and recorded', () => {
    const r = evaluateSubconAdjustment({ ...base, newOutput: 600, components: [{ ...KAIN, next: 600 }] })
    expect(r.issues).toEqual([])
    expect(r.changes).toEqual([
      { field: 'output', from: 500, to: 600 },
      { field: 'component', key: 'FAB-KTN-01', from: 500, to: 600 },
    ])
  })

  it('F4 — lowering 600 → 550 is refused, naming the current 600', () => {
    const r = evaluateSubconAdjustment({ ...base, currentOutput: 600, newOutput: 550 })
    expect(r.issues).toContainEqual({ kind: 'output-lower', current: 600 })
    expect(r.changes).toEqual([])
  })

  it('a component below its current plan is refused, naming the current value', () => {
    const r = evaluateSubconAdjustment({ ...base, newOutput: 500, components: [{ ...KAIN, next: 450 }] })
    expect(r.issues).toContainEqual({ kind: 'component-lower', sku: 'FAB-KTN-01', name: 'Kain katun premium', unit: 'm', current: 500 })
  })

  it('F4 — saving a change with no reason is refused', () => {
    const r = evaluateSubconAdjustment({ ...base, newOutput: 600, reason: '   ' })
    expect(r.issues).toContainEqual({ kind: 'reason-missing' })
  })

  it('a form with nothing changed asks for no reason', () => {
    const r = evaluateSubconAdjustment({ ...base, newOutput: 500, reason: '' })
    expect(r.issues).toEqual([])
    expect(r.changes).toEqual([])
  })

  it('a changed or added cost line also needs a reason', () => {
    expect(evaluateSubconAdjustment({ ...base, newOutput: 500, reason: '', otherChanges: 1 }).issues)
      .toContainEqual({ kind: 'reason-missing' })
    expect(evaluateSubconAdjustment({ ...base, newOutput: 500, otherChanges: 1 }).issues).toEqual([])
  })
})

// ── The store applies an adjustment all-or-nothing ───────────────────────────

import { workOrders, applySubconAdjustment } from '../app/data/workOrders'

describe('applySubconAdjustment — refused changes leave no trace', () => {
  const wo = workOrders.find(w => w.category === 'Subcontracting' && w.subcon)!

  it('a cost line revised below what is already charged is refused, and nothing is recorded', () => {
    const before = JSON.stringify(wo)
    wo.subcon!.costLineRecorded = { 'line-x': 5_000 }
    const snapshot = { history: wo.subcon!.adjustments?.length ?? 0, overrides: { ...(wo.subcon!.costLineOverrides ?? {}) } }
    const ok = applySubconAdjustment(wo.id, {
      outputQty: wo.plannedQty + 10,
      costChanges: [{ key: 'line-x', from: 10_000, to: 4_000 }],
      reason: 'Renegotiated',
    })
    expect(ok).toBe(false)
    expect(wo.subcon!.adjustments?.length ?? 0).toBe(snapshot.history)
    expect(wo.subcon!.costLineOverrides ?? {}).toEqual(snapshot.overrides)
    // The output increase in the same request was not applied either.
    expect(JSON.stringify({ ...wo, subcon: { ...wo.subcon, costLineRecorded: undefined } }))
      .toBe(JSON.stringify({ ...JSON.parse(before), subcon: { ...JSON.parse(before).subcon, costLineRecorded: undefined } }))
    wo.subcon!.costLineRecorded = undefined
  })

  it('an accepted adjustment writes the revision, the added line and the history together', () => {
    const plannedBefore = wo.plannedQty
    const ok = applySubconAdjustment(wo.id, {
      outputQty: plannedBefore + 100,
      costChanges: [
        { key: 'line-y', from: 1_000, to: 2_000 },
        { key: 'extra-new', from: 0, to: 750_000, newLine: { name: 'Finishing', costDriver: 'Amount' } },
      ],
      reason: 'Tambahan order pelanggan',
    })
    expect(ok).toBe(true)
    expect(wo.plannedQty).toBe(plannedBefore + 100)
    expect(wo.subcon!.costLineOverrides?.['line-y']).toBe(2_000)
    expect(wo.subcon!.extraCostLines?.some(l => l.id === 'extra-new' && l.amount === 750_000)).toBe(true)
    expect(wo.subcon!.adjustments?.slice(-3).map(a => a.field)).toEqual(['output', 'cost', 'cost'])
  })
})
