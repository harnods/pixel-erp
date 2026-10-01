/**
 * Multi-level BOM (V-11, L-3) — resolve-at-WO for standard BOMs.
 *
 *   • A raw material whose product is another BOM's finished good is a sub-BOM;
 *     the structure explodes through every level (Espresso machine › Grinder › Pitcher).
 *   • A parent version never pins or locks its subs — no recursive locking.
 *   • A work order resolves every sub level to its Active version at creation and
 *     pins it; later sub activations show as neutral sub-level drift.
 *   • A sub's new version surfaces on its direct parent as a banner + line badge with the
 *     cumulative diff + per-unit cost delta; "Mark as reviewed" logs and clears it.
 *   • Where-used walks every level, with "via" and the cost delta rolled up.
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

  it('the parent has a pending review for the grinder v1 → v2 with the per-unit cost delta; mark as reviewed logs and clears it', async () => {
    const { boms } = await load()
    const espresso = boms.billOfMaterials.find(b => b.finishedGoodId === 'p13')!
    const grinder = boms.billOfMaterials.find(b => b.finishedGoodId === 'p16')!
    const [r] = boms.bomPendingReviews(espresso)
    expect(r!.sub.id).toBe(grinder.id)
    expect([r!.fromVersion, r!.toVersion]).toEqual([1, 2])
    const pitcherPrice = grinder.rawMaterials[0]!.purchaseCost
    expect(r!.subDelta).toBe(pitcherPrice)
    const versionBefore = espresso.version
    expect(boms.markSubBomReviewed(espresso.id, grinder.id, 'Rudi')).toBe(true)
    expect(boms.bomPendingReviews(espresso)).toEqual([])
    expect(espresso.version).toBe(versionBefore) // no forced parent version
    expect(espresso.changelog!.at(-1)).toMatchObject({ action: 'reviewed', subBomId: grinder.id, subVersion: 2, actor: 'Rudi' })
  })

  it('work orders pin every sub level at creation; a later sub activation is drift, never a moved pin', async () => {
    const { boms, wos, guards } = await load()
    const espresso = boms.billOfMaterials.find(b => b.finishedGoodId === 'p13')!
    const pitcher = boms.billOfMaterials.find(b => b.finishedGoodId === 'p20')!
    const seedWo = wos.workOrders.find(w => w.bomId === espresso.id && !wos.workOrderClosed(w))!
    // Seed WO predates the grinder upgrade — it pinned grinder v1.
    expect(wos.workOrderSubDrift(seedWo).map(d => [d.pinned, d.active])).toEqual([[1, 2]])
    const wo = wos.addWorkOrder({ ...seedWo, id: undefined as never, number: undefined as never })
    expect(wo.subBomPins).toEqual(boms.resolveSubBomPins(espresso))
    // The sub pin locks the pitcher's v1 (reference by a document), not the parent's version.
    expect(guards.bomVersionLocked(pitcher.id, 1)).toBe(true)

    const data = { ...JSON.parse(JSON.stringify(pitcher)), rawMaterials: pitcher.rawMaterials.map(r => ({ ...r, needed: r.needed + 1 })) }
    expect(guards.saveBomNewVersionSafe(pitcher.id, data, { by: 'Rudi', reason: REASON })).toEqual({ ok: true, version: 2 })
    expect(wo.subBomPins![pitcher.id]).toBe(1)
    // The grinder (direct parent) now shows the pitcher's new version; the espresso machine doesn't.
    const grinder = boms.billOfMaterials.find(b => b.finishedGoodId === 'p16')!
    expect(boms.bomPendingReviews(grinder).map(r => [r.sub.id, r.fromVersion, r.toVersion])).toEqual([[pitcher.id, 1, 2]])
    expect(boms.bomPendingReviews(espresso).map(r => r.sub.id)).not.toContain(pitcher.id)
    expect(wos.workOrderSubDrift(wo).map(x => [x.bom.id, x.pinned, x.active])).toEqual([[pitcher.id, 1, 2]])
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
