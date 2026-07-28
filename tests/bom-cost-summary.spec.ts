/**
 * bomCostSummary() cost roll-up (app/data/billOfMaterials.ts).
 *
 * Formula under test (asserted exactly as the source computes it):
 *   rawSubtotal            = Σ rawMaterials[i].needed × purchaseCost
 *   productionCostSubtotal = Σ productionCost[i].amount
 *   routingSubtotal        = Σ routing[i].amount
 *   totalProductionCost    = rawSubtotal + productionCostSubtotal + routingSubtotal
 *   otherOutputsSubtotal   = Σ otherOutputs[i].estCost
 *   wasteSubtotal          = Σ productionWaste[i].amount
 *   finishedGoodsTotal     = finishedGoodEstCost(arg) + otherOutputsSubtotal + wasteSubtotal
 *
 * Note: totalProductionCost intentionally EXCLUDES otherOutputs & waste; those roll
 * only into finishedGoodsTotal alongside the caller-supplied finishedGoodEstCost.
 */
import { describe, it, expect } from 'vitest'
import { bomCostSummary, addBillOfMaterials, updateBillOfMaterials, billOfMaterials } from '~/data/billOfMaterials'

const sample = {
  rawMaterials: [
    { productId: 'p01', needed: 2, unit: 'Sack', purchaseCost: 100 }, // 200
    { productId: 'p02', needed: 3, unit: 'Sack', purchaseCost: 10 },  // 30
  ],
  productionCost: [
    { group: 'Labor' as const, account: 'Worker', costDriver: 'Person', amount: 500 },
    { group: 'Overhead' as const, account: 'Electricity', costDriver: 'Kwh', amount: 50 },
  ],
  routing: [
    { process: 'Roasting', description: '', accountMapping: 'Routing cost', amount: 15 },
    { process: 'Packing', description: '', accountMapping: 'Routing cost', amount: 5 },
  ],
  productionWaste: [
    { accountMapping: 'Production waste', allocationMethod: 'Percentage' as const, percentage: 4, amount: 40 },
  ],
  otherOutputs: [
    { productId: 'p03', qty: 1, unit: 'Bag', percentage: 10, estCost: 70 },
  ],
  finishedGoodQty: 1,
}

describe('bomCostSummary — sums each cost group', () => {
  it('computes every subtotal and rolls them up correctly', () => {
    const s = bomCostSummary(sample, 1000)
    expect(s.rawSubtotal).toBe(230)                // 200 + 30
    expect(s.productionCostSubtotal).toBe(550)     // 500 + 50
    expect(s.routingSubtotal).toBe(20)             // 15 + 5
    expect(s.totalProductionCost).toBe(800)        // 230 + 550 + 20
    expect(s.otherOutputsSubtotal).toBe(70)
    expect(s.wasteSubtotal).toBe(40)
    expect(s.finishedGoodsTotal).toBe(1110)        // 1000 + 70 + 40
  })

  it('totalProductionCost excludes otherOutputs and waste', () => {
    const s = bomCostSummary(sample, 0)
    expect(s.totalProductionCost).toBe(s.rawSubtotal + s.productionCostSubtotal + s.routingSubtotal)
    expect(s.finishedGoodsTotal).toBe(0 + s.otherOutputsSubtotal + s.wasteSubtotal)
  })

  it('empty groups sum to zero; finishedGoodsTotal is just the passed est cost', () => {
    const s = bomCostSummary(
      { rawMaterials: [], productionCost: [], routing: [], productionWaste: [], otherOutputs: [], finishedGoodQty: 1 },
      1234,
    )
    expect(s.rawSubtotal).toBe(0)
    expect(s.totalProductionCost).toBe(0)
    expect(s.finishedGoodsTotal).toBe(1234)
  })
})

describe('addBillOfMaterials / updateBillOfMaterials', () => {
  const base = {
    name: 'Test BOM Cost Summary', category: 'Standard' as const,
    costingReference: 'Actual cost' as const,
    finishedGoodId: 'p09', finishedGoodQty: 1, finishedGoodUnit: 'Bag', finishedGoodPercentage: 100,
    description: '', allowBomAdjustment: true, archived: false,
    rawMaterials: [{ productId: 'p01', needed: 1, unit: 'Sack', purchaseCost: 100 }],
    productionCost: [], routing: [], otherOutputs: [], productionWaste: [],
  }

  it('appends with a generated id and a "Bill of Materials #N" number', () => {
    const before = billOfMaterials.length
    const created = addBillOfMaterials(base)
    expect(billOfMaterials.length).toBe(before + 1)
    expect(created.id).toMatch(/^bom-new-\d+$/)
    expect(created.number).toMatch(/^Bill of Materials #\d+$/)
    // addBillOfMaterials unshifts — newest first
    expect(billOfMaterials[0]!.id).toBe(created.id)
  })

  it('updateBillOfMaterials mutates fields in place, keeping id/number', () => {
    const created = addBillOfMaterials({ ...base, name: 'Before edit' })
    const updated = updateBillOfMaterials(created.id, { ...base, name: 'After edit', description: 'changed' })
    expect(updated.id).toBe(created.id)
    expect(updated.number).toBe(created.number)
    expect(updated.name).toBe('After edit')
    expect(updated.description).toBe('changed')
    // same object identity mutated in place
    expect(billOfMaterials.find(b => b.id === created.id)!.name).toBe('After edit')
  })

  it('updateBillOfMaterials throws for an unknown id', () => {
    expect(() => updateBillOfMaterials('bom-does-not-exist', base)).toThrow(/not found/)
  })
})
