/**
 * Multi-level BOM (V-11, L-3) — resolve-at-WO for standard BOMs.
 *
 *   • A raw material whose product is another BOM's finished good is a sub-BOM;
 *     the structure explodes through every level (Espresso machine › Grinder › Pitcher).
 *   • A parent version never pins or locks its subs — no recursive locking. A
 *     sub-assembly always resolves to its Active version, even under an inactive parent.
 *   • A work order resolves every sub level to its Active version at creation; only
 *     work orders on the BOM itself lock its version (a sub pin doesn't).
 *   • Where-used walks every level, with "via" (Parents tab of the hierarchy).
 *   • Circular references are refused at any depth.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

async function load() {
  const boms = await import('~/data/billOfMaterials')
  const wos = await import('~/data/workOrders')
  const guards = await import('~/data/integrityGuards')
  return { boms, wos, guards }
}
vi.setConfig({ testTimeout: 30_000 })
beforeEach(() => { vi.resetModules() })
const REASON = 'Thicker stainless for the pitcher wall'

describe('multi-level BOM', () => {
  it('explodes the seed chain three levels deep, sub-BOMs resolving to their Active version', async () => {
    const { boms } = await load()
    const espresso = boms.billOfMaterials.find(b => b.finishedGoodId === 'p13')!
    const grinder = boms.billOfMaterials.find(b => b.finishedGoodId === 'p16')!
    const pitcher = boms.billOfMaterials.find(b => b.finishedGoodId === 'p20')!
    const tree = boms.bomTree(espresso)
    const g = tree.find(n => n.productId === 'p16')!
    expect(g.subBomId).toBe(grinder.id)
    expect(g.subVersion).toBe(2)
    const p = g.children.find(n => n.productId === 'p20')!
    expect(p.subBomId).toBe(pitcher.id)
    expect(p.depth).toBe(1) // top-level lines are depth 0
    expect(boms.resolveSubBomPins(espresso)).toEqual({ [grinder.id]: 2, [pitcher.id]: 1 })
  })

  it('a sub-assembly shows its Active version — also when the parent version shown is inactive', async () => {
    const { boms, guards } = await load()
    const espresso = boms.billOfMaterials.find(b => b.finishedGoodId === 'p13')!
    const grinder = boms.billOfMaterials.find(b => b.finishedGoodId === 'p16')!
    const data = { ...JSON.parse(JSON.stringify(espresso)), description: 'v2 of the machine' }
    expect(guards.saveBomNewVersionSafe(espresso.id, data, { by: 'Rudi', reason: REASON })).toEqual({ ok: true, version: 2 })
    const inactiveV1 = boms.bomAtVersion(espresso, 1)!
    expect(boms.bomTree(inactiveV1).find(n => n.productId === 'p16')!.subVersion).toBe(grinder.version)
  })

  it('only work orders on the BOM itself lock a version — a sub-assembly pin on another WO does not', async () => {
    const { boms, wos, guards } = await load()
    const espresso = boms.billOfMaterials.find(b => b.finishedGoodId === 'p13')!
    const pitcher = boms.billOfMaterials.find(b => b.finishedGoodId === 'p20')!
    const seedWo = wos.workOrders.find(w => w.bomId === espresso.id)!
    const wo = wos.addWorkOrder({ ...seedWo, id: undefined as never, number: undefined as never })
    expect(wo.subBomPins).toEqual(boms.resolveSubBomPins(espresso))
    expect(wo.subBomPins![pitcher.id]).toBe(1)
    expect(wos.workOrders.some(w => w.bomId === pitcher.id)).toBe(false)
    expect(guards.bomVersionLocked(pitcher.id, 1)).toBe(false)
    expect(guards.bomVersionRefCount(pitcher.id, 1)).toBe(0)
    // So the pitcher's v1 is still edited in place, and the WO's pin never moves.
    expect(guards.updateBillOfMaterialsSafe(pitcher.id, { ...JSON.parse(JSON.stringify(pitcher)), description: 'Polished finish' })).toEqual({ ok: true, version: 1 })
    expect(wo.subBomPins![pitcher.id]).toBe(1)
  })

  it('where-used walks every level — the grinder directly, the espresso machine via the grinder — with the cost delta rolled up', async () => {
    const { boms } = await load()
    const espresso = boms.billOfMaterials.find(b => b.finishedGoodId === 'p13')!
    const grinder = boms.billOfMaterials.find(b => b.finishedGoodId === 'p16')!
    const pitcher = boms.billOfMaterials.find(b => b.finishedGoodId === 'p20')!
    const rows = boms.bomWhereUsed(pitcher.id, 1000)
    const g = rows.find(r => r.bom.id === grinder.id)!
    const e = rows.find(r => r.bom.id === espresso.id)!
    const pitchersPerGrinder = grinder.rawMaterials.find(r => r.productId === 'p20')!.needed
    const grindersPerMachine = espresso.rawMaterials.find(r => r.productId === 'p16')!.needed
    expect(g).toMatchObject({ depth: 1, delta: 1000 * pitchersPerGrinder })
    expect(e).toMatchObject({ depth: 2, delta: 1000 * pitchersPerGrinder * grindersPerMachine })
    expect(e.via!.id).toBe(grinder.id)
    expect(boms.bomWhereUsed(pitcher.id).every(r => r.delta === undefined)).toBe(true)
  })

  it('refuses a circular reference at any depth', async () => {
    const { boms, guards } = await load()
    const pitcher = boms.billOfMaterials.find(b => b.finishedGoodId === 'p20')!
    // Pitcher › Espresso machine › Grinder › Pitcher
    const data = { ...JSON.parse(JSON.stringify(pitcher)), rawMaterials: [{ productId: 'p13', needed: 1, unit: 'Unit', purchaseCost: 1 }] }
    expect(boms.bomCycle(pitcher.id, data)).toEqual(['p13', 'p16', 'p20'])
    expect(guards.saveBomNewVersionSafe(pitcher.id, data, { by: 'Sari', reason: REASON })).toMatchObject({ ok: false, reason: 'CIRCULAR' })
    expect(pitcher.version).toBe(1)
  })
})
