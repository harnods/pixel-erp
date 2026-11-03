/**
 * Finished goods sample data — the seed bills of materials carry Other outputs
 * (app/data/billOfMaterials.ts), so the Finished goods tables on the bill and on
 * every work order made from it have rows to read.
 *
 * The rows must reconcile the way the New bill of materials form derives them:
 * each by-product's estimated cost is its percentage of the total production
 * cost, and main output + other outputs + production waste come to 100%.
 */
import { describe, it, expect } from 'vitest'
import { billOfMaterials, bomCostSummary, catalogProduct } from '~/data/billOfMaterials'

const seeded = billOfMaterials.filter(b => /^bom-100\d\d$/.test(b.id))
const withOthers = seeded.filter(b => b.otherOutputs.length > 0)

describe('seed bills of materials — Other outputs', () => {
  it('seven bills make by-products (six coffee, plus the teak table\'s offcuts); the rest keep none, so the empty state is reachable', () => {
    expect(withOthers).toHaveLength(7)
    expect(seeded.some(b => b.otherOutputs.length === 0)).toBe(true)
    expect(withOthers.some(b => b.otherOutputs.length > 1)).toBe(true)
  })

  it('every by-product is a registered product, in its own unit, and not one of the bill\'s raw materials', () => {
    for (const b of withOthers) {
      const raw = new Set(b.rawMaterials.map(r => r.productId))
      for (const o of b.otherOutputs) {
        const p = catalogProduct(o.productId)
        expect(p, `${b.id} → ${o.productId}`).toBeTruthy()
        expect(o.unit).toBe(p!.unit)
        expect(raw.has(o.productId)).toBe(false)
        expect(o.productId).not.toBe(b.finishedGoodId)
        expect(o.qty).toBeGreaterThan(0)
      }
    }
  })

  it('each estimated cost is its percentage of the total production cost', () => {
    for (const b of withOthers) {
      const { totalProductionCost } = bomCostSummary(b, 0)
      for (const o of b.otherOutputs)
        expect(o.estCost).toBe(Math.round(totalProductionCost * o.percentage / 100))
    }
  })

  it('main output + other outputs + production waste shares come to 100%', () => {
    for (const b of seeded) {
      const others = b.otherOutputs.reduce((s, o) => s + o.percentage, 0)
      const waste = b.productionWaste.reduce((s, w) => s + w.percentage, 0)
      expect(b.finishedGoodPercentage + others + waste, b.id).toBe(100)
    }
  })

  it('the main output absorbs the rest, so the finished goods total equals the production cost', () => {
    for (const b of withOthers) {
      const { totalProductionCost, otherOutputsSubtotal, wasteSubtotal } = bomCostSummary(b, 0)
      const mainEstCost = totalProductionCost - otherOutputsSubtotal - wasteSubtotal
      expect(mainEstCost).toBeGreaterThan(0)
      expect(bomCostSummary(b, mainEstCost).finishedGoodsTotal).toBe(totalProductionCost)
    }
  })
})
