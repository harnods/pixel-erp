/**
 * Integrity guard — bill-of-materials edit (regular BOM versioning, V-02).
 *
 * A version a work order references is locked forever: `updateBillOfMaterialsSafe`
 * refuses the edit with LOCKED (the API's 409) — the caller saves a new version
 * (vN+1) instead. An Active version nothing references yet is edited in place. A save that would make the BOM consume its own output at any
 * level is refused with CIRCULAR.
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
  it('editing a version a work order references is refused with LOCKED — the version and its WOs stay as they are', () => {
    const bom = billOfMaterials.find(b => bomVersionLocked(b.id))!
    expect(bom).toBeTruthy()
    const before = { version: bom.version, name: bom.name }
    const pinned = workOrders.filter(w => w.bomId === bom.id).map(w => w.bomVersion)

    const res = updateBillOfMaterialsSafe(bom.id, makeBomData('Upgraded recipe'))
    expect(res).toEqual({ ok: false, reason: 'LOCKED' })
    expect(bom.version).toBe(before.version)
    expect(bom.name).toBe(before.name)
    expect(workOrders.filter(w => w.bomId === bom.id).map(w => w.bomVersion)).toEqual(pinned)
  })

  it('a BOM no work order references is edited in place — no new version', () => {
    const bom = addBillOfMaterials(makeBomData('Guard Editable BOM'))
    expect(bomVersionLocked(bom.id)).toBe(false)
    const res = updateBillOfMaterialsSafe(bom.id, makeBomData('Guard Edited Name'))
    expect(res).toEqual({ ok: true, version: 1 })
    expect(bom.version).toBe(1)
    expect(billOfMaterials.find(b => b.id === bom.id)!.name).toBe('Guard Edited Name')
  })

  it('a save that makes the BOM consume its own output is refused with CIRCULAR', () => {
    const bom = addBillOfMaterials(makeBomData('Guard Circular BOM'))
    const data = { ...makeBomData('Guard Circular BOM'), rawMaterials: [{ productId: 'p09', needed: 1, unit: 'Kg', purchaseCost: 1000 }] }
    const res = updateBillOfMaterialsSafe(bom.id, data)
    expect(res.ok).toBe(false)
    expect(res.ok === false && res.reason).toBe('CIRCULAR')
  })

  it('editing an unknown BOM id is refused with NOT_FOUND', () => {
    const res = updateBillOfMaterialsSafe('bom-does-not-exist', makeBomData('x'))
    expect(res.ok).toBe(false)
    expect(res.ok === false && res.reason).toContain('NOT_FOUND')
  })
})
