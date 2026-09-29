/**
 * Integrity guard — bill-of-materials edit (regular BOM versioning).
 *
 * A regular BOM is always editable; what the edit does depends on references.
 * Once a work order was created from the Active version, that version is locked:
 * `updateBillOfMaterialsSafe` upgrades the BOM to a new Active version and
 * deactivates the old one — work orders keep the version they were created from,
 * new ones use the new version, and no ECO is raised (that's the project BOM's
 * rule). A BOM no work order references is edited in place.
 */
import { describe, it, expect } from 'vitest'
import { updateBillOfMaterialsSafe, bomVersionLocked } from '~/data/integrityGuards'
import { billOfMaterials, addBillOfMaterials, type BillOfMaterialsInput } from '~/data/billOfMaterials'
import { workOrders } from '~/data/workOrders'

function makeBomData(name: string): BillOfMaterialsInput {
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
  it('editing a BOM whose Active version a work order uses creates a new version instead of refusing', () => {
    const bom = billOfMaterials.find(b => bomVersionLocked(b.id))!
    expect(bom).toBeTruthy()
    const before = bom.version
    const pinned = workOrders.filter(w => w.bomId === bom.id).map(w => w.bomVersion)

    const res = updateBillOfMaterialsSafe(bom.id, makeBomData('Upgraded recipe'), { note: 'Guard test upgrade' })
    expect(res.ok).toBe(true)
    expect(res.ok && res.upgraded).toBe(true)
    expect(bom.version).toBe(before + 1)
    expect(bom.name).toBe('Upgraded recipe')
    expect(bom.versionHistory.at(-1)!.version).toBe(before)
    // Existing work orders keep the version they were created from.
    expect(workOrders.filter(w => w.bomId === bom.id).map(w => w.bomVersion)).toEqual(pinned)
  })

  it('a BOM no work order references is edited in place — no new version', () => {
    const bom = addBillOfMaterials(makeBomData('Guard Editable BOM'))
    expect(bomVersionLocked(bom.id)).toBe(false)
    const res = updateBillOfMaterialsSafe(bom.id, makeBomData('Guard Edited Name'))
    expect(res.ok).toBe(true)
    expect(res.ok && res.upgraded).toBe(false)
    expect(bom.version).toBe(1)
    expect(billOfMaterials.find(b => b.id === bom.id)!.name).toBe('Guard Edited Name')
  })

  it('editing an unknown BOM id is refused with NOT_FOUND', () => {
    const res = updateBillOfMaterialsSafe('bom-does-not-exist', makeBomData('x'))
    expect(res.ok).toBe(false)
    expect(res.ok === false && res.reason).toContain('NOT_FOUND')
  })
})
