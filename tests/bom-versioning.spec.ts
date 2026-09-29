/**
 * Regular BOM versioning (Production › Bill of materials).
 *
 *   • Editing a BOM whose Active version a work order uses upgrades it: vN+1 is
 *     Active, vN is deactivated (Superseded, read-only, content kept).
 *   • Work orders created with vN stay on vN — their detail, material records and
 *     consume/return all read the pinned version's recipe.
 *   • A work order created afterwards uses the newest version.
 *   • No engineering change is raised — ECO is the project BOM's rule only.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

async function load() {
  const boms = await import('~/data/billOfMaterials')
  const wos = await import('~/data/workOrders')
  const guards = await import('~/data/integrityGuards')
  const changes = await import('~/data/projectChanges')
  return { boms, wos, guards, changes }
}
// Each test cold-imports the data graph (incl. the Projects stores) — slow under a full parallel run.
vi.setConfig({ testTimeout: 30_000 })
beforeEach(() => { vi.resetModules() })

describe('regular BOM versioning', () => {
  it('seeds #10001 at v2 with v1 superseded, and its work orders still pinned to v1', async () => {
    const { boms, wos } = await load()
    const b = boms.billOfMaterials[0]!
    expect(b.version).toBe(2)
    expect(boms.bomVersionList(b).map(v => [v.version, v.status])).toEqual([[2, 'active'], [1, 'superseded']])
    const pinned = wos.workOrders.filter(w => w.bomId === b.id)
    expect(pinned.length).toBeGreaterThan(0)
    expect(pinned.every(w => w.bomVersion === 1)).toBe(true)
  })

  it('a work order builds its pinned version, not the current one', async () => {
    const { boms, wos } = await load()
    const b = boms.billOfMaterials[0]!
    const wo = wos.workOrders.find(w => w.bomId === b.id)!
    const pinned = wos.bomForWorkOrder(wo)!
    expect(pinned.rawMaterials[0]!.needed).toBe(b.versionHistory[0]!.content.rawMaterials[0]!.needed)
    expect(pinned.rawMaterials[0]!.needed).toBe(b.rawMaterials[0]!.needed - 1)
  })

  it('edit upgrades: old version deactivated, existing WOs keep it, a new WO uses the newest, no ECO', async () => {
    const { boms, wos, guards, changes } = await load()
    const b = boms.billOfMaterials[1]!
    expect(b.version).toBe(1)
    expect(guards.bomVersionLocked(b.id)).toBe(true)
    const ecosBefore = changes.engineeringChanges.length
    const existing = wos.workOrders.filter(w => w.bomId === b.id)
    const data = { ...JSON.parse(JSON.stringify(b)), rawMaterials: b.rawMaterials.map(r => ({ ...r, needed: r.needed * 2 })) }
    const res = guards.updateBillOfMaterialsSafe(b.id, data, { note: 'Double batch' })
    expect(res.ok && res.upgraded && res.version).toBe(2)
    expect(boms.bomVersionList(b).find(v => v.version === 1)!.status).toBe('superseded')
    expect(b.versionNote).toBe('Double batch')
    expect(existing.every(w => w.bomVersion === 1)).toBe(true)
    expect(wos.bomForWorkOrder(existing[0]!)!.rawMaterials[0]!.needed).toBe(b.versionHistory[0]!.content.rawMaterials[0]!.needed)
    const nw = wos.addWorkOrder({ ...existing[0]!, id: undefined as never, number: undefined as never, bomVersion: undefined as never, status: 'not started', producedQty: 0 })
    expect(nw.bomVersion).toBe(2)
    expect(changes.engineeringChanges.length).toBe(ecosBefore)
  })

  it('numbering is monotonic across upgrades', async () => {
    const { boms, guards } = await load()
    const b = boms.billOfMaterials[0]!
    const data = JSON.parse(JSON.stringify(b))
    guards.updateBillOfMaterialsSafe(b.id, data, { note: 'noop content, still locked by v2 WOs?' })
    // #10001's v2 has no work order yet, so this edits v2 in place.
    expect(b.version).toBe(2)
    const wo = (await import('~/data/workOrders')).addWorkOrder({ ...(await import('~/data/workOrders')).workOrders.find(w => w.bomId === b.id)!, id: undefined as never, number: undefined as never, bomVersion: undefined as never })
    expect(wo.bomVersion).toBe(2)
    guards.updateBillOfMaterialsSafe(b.id, data, { note: 'Now locked' })
    expect(b.version).toBe(3)
    expect(b.versionHistory.map(v => v.version)).toEqual([1, 2])
  })
})
