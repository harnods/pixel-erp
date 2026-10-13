/**
 * Subcon cost lines — one source (R9), scaled by the BOM's own output (R12), with
 * a floor on revision (R10) and a request of their own for a late charge (R11).
 * Design Brief DB-06 / DB-07 / DB-08, fixtures F3, F5, F6.
 */
import { describe, it, expect } from 'vitest'
import {
  workOrders, subconCostLinesFor, subconUncoveredCostLines, subconRequestWithoutOrder,
  deriveNextAction, type WorkOrder,
} from '../app/data/workOrders'
import { billOfMaterials } from '../app/data/billOfMaterials'

// A Subcontracting BOM — the one that carries subcon cost lines.
const bom = billOfMaterials.find(b => (b.subconCost ?? []).length > 0)!
const base: WorkOrder = { ...workOrders.find(w => w.category === 'Subcontracting' && w.subcon)!, bomId: bom.id }
const lines = bom.subconCost ?? []

const make = (over: Partial<NonNullable<WorkOrder['subcon']>> = {}, plannedQty = base.plannedQty): WorkOrder => ({
  ...base, plannedQty, status: 'in progress', // Basic has no supply to wait for, so the next step is the service one under test.
  subcon: { ...base.subcon!, method: 'basic', raisedDocuments: [], ...over },
})

describe('R12 / F3 — a line total scales by the BOM’s own output quantity', () => {
  it('an order for the BOM’s output carries the BOM amounts as they are', () => {
    const got = subconCostLinesFor(make({}, bom.finishedGoodQty))
    expect(got.map(l => l.amount)).toEqual(lines.map(l => l.amount))
  })

  it('half the BOM’s output carries half the cost, whatever the BOM’s size', () => {
    const got = subconCostLinesFor(make({}, bom.finishedGoodQty / 2))
    got.forEach((l, i) => expect(l.amount).toBe(Math.round(lines[i]!.amount / 2)))
  })

  it('a partial split does not halve the cost (partial is locked)', () => {
    const got = subconCostLinesFor(make({ split: 'partial' }, bom.finishedGoodQty))
    expect(got.map(l => l.amount)).toEqual(lines.map(l => l.amount))
  })
})

describe('R9 — every screen reads the same lines, including added ones', () => {
  const wo = make({
    costLineOverrides: { [lines[0]!.productId]: 1_000 },
    extraCostLines: [{ id: 'extra-1', name: 'Finishing', costDriver: 'Amount', amount: 750_000 }],
  }, bom.finishedGoodQty)

  it('lists the BOM lines (revised where revised) and the added line', () => {
    const got = subconCostLinesFor(wo)
    expect(got.map(l => l.id)).toEqual([...lines.map(l => l.productId), 'extra-1'])
    expect(got[0]!.amount).toBe(1_000)
    expect(got.at(-1)).toMatchObject({ id: 'extra-1', isExtra: true, amount: 750_000, remaining: 750_000 })
  })

  it('the total is the BOM total, revised, plus the added line', () => {
    const total = subconCostLinesFor(wo).reduce((s, l) => s + l.amount, 0)
    expect(total).toBe(1_000 + lines.slice(1).reduce((s, l) => s + l.amount, 0) + 750_000)
  })

  it('charged-so-far reduces what a line has left (R10 floor reads this)', () => {
    const charged = make({ costLineRecorded: { [lines[0]!.productId]: 400 } }, bom.finishedGoodQty)
    const first = subconCostLinesFor(charged)[0]!
    expect(first.recorded).toBe(400)
    expect(first.remaining).toBe(first.amount - 400)
  })
})

describe('R11 / F5 — a charge added after approval gets a request of its own', () => {
  const ids = lines.map(l => l.productId)
  const serviceRequest = { kind: 'subconPr', id: 'PR-1', number: 'PR #1', route: '/purchase-requests', lineIds: ids }
  const serviceOrder = { kind: 'purchaseOrder', id: 'PO-1', number: 'PO-1', route: '/purchase-orders', fromKind: 'subconPr', fromId: 'PR-1' }
  const added = { extraCostLines: [{ id: 'extra-1', name: 'Finishing', costDriver: 'Amount', amount: 750_000 }] }

  it('with every line requested and ordered, nothing is uncovered', () => {
    const wo = make({ raisedDocuments: [serviceRequest, serviceOrder] })
    expect(subconUncoveredCostLines(wo)).toEqual([])
  })

  it('the added line alone is uncovered, and the next step offers a request for it', () => {
    const wo = make({ ...added, raisedDocuments: [serviceRequest, serviceOrder] })
    expect(subconUncoveredCostLines(wo).map(l => l.id)).toEqual(['extra-1'])
    expect(deriveNextAction(wo)).toBe('create-service-request')
  })

  it('once that request exists it needs its own order; the original order is untouched', () => {
    const second = { kind: 'subconPr', id: 'PR-2', number: 'PR #2', route: '/purchase-requests', lineIds: ['extra-1'] }
    const wo = make({ ...added, raisedDocuments: [serviceRequest, serviceOrder, second] })
    expect(subconUncoveredCostLines(wo)).toEqual([])
    expect(subconRequestWithoutOrder(wo, 'service')?.id).toBe('PR-2')
    expect(deriveNextAction(wo)).toBe('view-service-request')
  })

  it('a request raised before lineIds existed covers every BOM line, not the added one', () => {
    const legacy = { kind: 'subconPr', id: 'PR-0', number: 'PR #0', route: '/purchase-requests' }
    const wo = make({ ...added, raisedDocuments: [legacy] })
    expect(subconUncoveredCostLines(wo).map(l => l.id)).toEqual(['extra-1'])
  })
})
