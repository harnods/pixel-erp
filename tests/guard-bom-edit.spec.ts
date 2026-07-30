/**
 * Integrity guard — bill-of-materials edit.
 *
 * A BOM's recipe can only be edited when no active work order still depends on
 * it. `activeWorkOrdersForBom(bomId)` counts work orders referencing the BOM
 * whose status is neither 'completed' nor 'canceled' (i.e. mid-production).
 * While at least one such WO exists, `canEditBom` is false and
 * `updateBillOfMaterialsSafe` refuses with a BOM_IN_USE reason, leaving the
 * BOM unchanged. A BOM no active work order references is editable.
 */
import { describe, it, expect } from 'vitest'
import {
  canEditBom, updateBillOfMaterialsSafe, activeWorkOrdersForBom,
} from '~/data/integrityGuards'
import {
  billOfMaterials, addBillOfMaterials, type BillOfMaterials,
} from '~/data/billOfMaterials'
import '~/data/workOrders'

function makeBomData(name: string): Omit<BillOfMaterials, 'id' | 'number'> {
  return {
    name,
    category: 'Standard',
    costingReference: 'Actual cost',
    finishedGoodId: 'p09',
    finishedGoodQty: 1,
    finishedGoodUnit: 'Kg',
    finishedGoodPercentage: 100,
    description: '',
    allowBomAdjustment: false,
    archived: false,
    rawMaterials: [],
    productionCost: [],
    routing: [],
    otherOutputs: [],
    productionWaste: [],
  }
}

describe('Integrity guard — bill-of-materials edit', () => {
  it('a BOM referenced by an active work order cannot be edited', () => {
    const bom = billOfMaterials.find((b) => activeWorkOrdersForBom(b.id) > 0)!
    expect(bom).toBeTruthy()
    expect(activeWorkOrdersForBom(bom.id)).toBeGreaterThan(0)
    const originalName = bom.name

    expect(canEditBom(bom.id)).toBe(false)
    const res = updateBillOfMaterialsSafe(bom.id, makeBomData('Should Not Apply'))
    expect(res.ok).toBe(false)
    expect(res.ok === false && res.reason).toContain('BOM_IN_USE')

    // Refused — the BOM's data is untouched.
    expect(billOfMaterials.find((b) => b.id === bom.id)!.name).toBe(originalName)
  })

  it('a BOM with no active work order can be edited', () => {
    // A freshly-created BOM has no work order pointing at it.
    const bom = addBillOfMaterials(makeBomData('Guard Editable BOM'))
    expect(activeWorkOrdersForBom(bom.id)).toBe(0)

    expect(canEditBom(bom.id)).toBe(true)
    const res = updateBillOfMaterialsSafe(bom.id, makeBomData('Guard Edited Name'))
    expect(res.ok).toBe(true)

    // Applied.
    expect(billOfMaterials.find((b) => b.id === bom.id)!.name).toBe('Guard Edited Name')
  })

  it('editing an unknown BOM id is refused with NOT_FOUND', () => {
    const res = updateBillOfMaterialsSafe('bom-does-not-exist', makeBomData('x'))
    expect(res.ok).toBe(false)
    expect(res.ok === false && res.reason).toContain('NOT_FOUND')
  })
})
