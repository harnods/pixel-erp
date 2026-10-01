/**
 * Regular BOM versioning (Production › Bill of materials) — Active → Superseded, no Draft.
 *
 *   • A version a work order references is locked forever: editing it in place is
 *     refused (LOCKED). "Create new version" opens the form; only SAVING creates
 *     vN+1 — leaving the form creates nothing.
 *   • Saving needs a reason (10–500 chars); the new version is Active at once and the
 *     previous one is Superseded (read-only, still readable for its work orders).
 *   • Work orders already created keep their pin; only work orders created after
 *     the save use the new version.
 *   • Numbering is monotonic. No engineering change — ECO is the project BOM's rule.
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

const REASON = 'Customer upgrade to a stronger blend'
const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x))

describe('regular BOM versioning', () => {
  it('seeds #10001 at v2 Active with v1 Superseded — its work orders still pinned to v1; no Draft status anywhere', async () => {
    const { boms, wos } = await load()
    const b = boms.billOfMaterials.find(x => x.number === 'Bill of Materials #10001')!
    expect(b.version).toBe(2)
    expect(boms.bomVersionList(b).map(v => [v.version, v.status])).toEqual([[2, 'active'], [1, 'superseded']])
    expect(boms.billOfMaterials.every(x => boms.bomVersionList(x).every(v => v.status !== ('draft' as string)))).toBe(true)
    const pinned = wos.workOrders.filter(w => w.bomId === b.id)
    expect(pinned.length).toBeGreaterThan(0)
    expect(pinned.every(w => w.bomVersion === 1)).toBe(true)
    expect(b.changelog!.map(e => e.action)).toEqual(['created', 'new_version'])
  })

  it('a work order builds its pinned version, not the current one', async () => {
    const { boms, wos } = await load()
    const b = boms.billOfMaterials[0]!
    const wo = wos.workOrders.find(w => w.bomId === b.id)!
    const pinned = wos.bomForWorkOrder(wo)!
    expect(pinned.rawMaterials[0]!.needed).toBe(b.versionHistory[0]!.content.rawMaterials[0]!.needed)
    expect(pinned.rawMaterials[0]!.needed).toBe(b.rawMaterials[0]!.needed - 1)
  })

  it('a locked version refuses in-place edits; saving the new-version form creates vN+1 Active; old WOs keep their pin; no ECO', async () => {
    const { boms, wos, guards, changes } = await load()
    const b = boms.billOfMaterials[1]!
    expect(b.version).toBe(1)
    expect(guards.bomVersionLocked(b.id)).toBe(true)
    const ecosBefore = changes.engineeringChanges.length
    const existing = wos.workOrders.filter(w => w.bomId === b.id)
    const data = { ...copy(b), rawMaterials: b.rawMaterials.map(r => ({ ...r, needed: r.needed * 2 })) }

    expect(guards.updateBillOfMaterialsSafe(b.id, data)).toEqual({ ok: false, reason: 'LOCKED' })
    expect(b.version).toBe(1) // opening the form / a refused save creates nothing
    expect(guards.saveBomNewVersionSafe(b.id, data, { by: 'Rudi', reason: 'too short' })).toEqual({ ok: false, reason: 'REASON' })
    expect(b.versionHistory).toEqual([])

    expect(guards.saveBomNewVersionSafe(b.id, data, { by: 'Rudi', reason: 'Double batch for the wholesale contract' })).toEqual({ ok: true, version: 2 })
    expect(b.version).toBe(2)
    expect(boms.bomVersionStatus(b, 1)).toBe('superseded')
    expect(b.versionNote).toBe('Double batch for the wholesale contract')
    expect(b.versionCreatedBy).toBe('Rudi')
    expect(b.changelog!.at(-1)).toMatchObject({ action: 'new_version', version: 2, actor: 'Rudi' })

    expect(existing.every(w => w.bomVersion === 1)).toBe(true)
    expect(wos.bomForWorkOrder(existing[0]!)!.rawMaterials[0]!.needed).toBe(b.versionHistory[0]!.content.rawMaterials[0]!.needed)
    const nw = wos.addWorkOrder({ ...existing[0]!, id: undefined as never, number: undefined as never, status: 'not started', producedQty: 0 })
    expect(nw.bomVersion).toBe(2)
    expect(changes.engineeringChanges.length).toBe(ecosBefore)
  })

  it('a new version can be saved from a superseded one; numbering stays monotonic', async () => {
    const { boms, guards } = await load()
    const b = boms.billOfMaterials[0]!
    const v1 = boms.bomAtVersion(b, 1)!
    expect(guards.saveBomNewVersionSafe(b.id, copy(v1), { by: 'Sari', reason: REASON })).toEqual({ ok: true, version: 3 })
    expect(b.rawMaterials[0]!.needed).toBe(b.versionHistory[0]!.content.rawMaterials[0]!.needed)
    expect(b.versionHistory.map(v => v.version)).toEqual([1, 2])
  })

  it('an unreferenced Active version is edited in place', async () => {
    const { boms, guards } = await load()
    const b = boms.billOfMaterials[0]! // v2 Active, no work order on v2
    expect(guards.bomVersionLocked(b.id)).toBe(false)
    expect(guards.updateBillOfMaterialsSafe(b.id, { ...copy(b), description: 'Edited in place' })).toEqual({ ok: true, version: 2 })
    expect(b.description).toBe('Edited in place')
    expect(b.versionHistory.length).toBe(1)
  })

  it('a new BOM is born as v1 Active and can be produced right away', async () => {
    const { boms, wos } = await load()
    const created = boms.addBillOfMaterials(copy(boms.billOfMaterials[3]!))
    expect(boms.bomVersionList(created).map(v => [v.version, v.status])).toEqual([[1, 'active']])
    const wo = wos.addWorkOrder({ ...wos.workOrders[0]!, bomId: created.id, id: undefined as never, number: undefined as never })
    expect(wo.bomVersion).toBe(1)
  })

  it('drift: neutral "vN available" only on open, versioned work orders', async () => {
    const { boms, wos } = await load()
    const b = boms.billOfMaterials[0]!
    const open = wos.workOrders.find(w => w.bomId === b.id && !wos.workOrderClosed(w))!
    const closed = wos.workOrders.find(w => w.bomId === b.id && wos.workOrderClosed(w))!
    expect(wos.workOrderDrift(open)).toBe(2)
    expect(wos.workOrderDrift(closed)).toBeUndefined()
    const legacy = wos.workOrders.find(w => w.preVersioning)!
    expect(legacy).toBeTruthy()
    expect(wos.workOrderDrift(legacy)).toBeUndefined()
  })
})
