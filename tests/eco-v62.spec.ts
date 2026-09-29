/**
 * Engineering change order — PRD v6.2 §7 (Project Structure) + BOM Versioning &
 * ECO-lite (P-05…P-11). Production publishes the version; the PM decides only
 * whether EXISTING work orders adopt it; the route is computed from status.
 *
 * Data modules are module-level reactive stores seeded on import, so every test
 * re-imports them fresh (vi.resetModules) to start from the seed.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const PM = { name: 'Rizal Candra', role: 'PM' as const }
const PROD = { name: 'Dewi Lestari', role: 'Production' as const }
const FIN = { name: 'Maya Kartika', role: 'Finance' as const }

async function load() {
  const actions = await import('~/data/projectActions')
  const changes = await import('~/data/projectChanges')
  const boms = await import('~/data/projectBoms')
  const tx = await import('~/data/projectTransactions')
  const approvals = await import('~/data/projectApprovals')
  const projects = await import('~/data/projects')
  const res = await import('~/data/projectReservations')
  return { actions, changes, boms, tx, approvals, projects, res }
}

beforeEach(() => { vi.resetModules() })

describe('project BOM versioning', () => {
  it('seeds v2 Active and v1 Superseded (locked by work orders) on the furniture BOM', async () => {
    const { boms, actions } = await load()
    const b = boms.getCustomBom('cbom-2603-31')!
    expect(boms.currentVersion(b).version).toBe(2)
    expect(boms.versionStatus(b, 1)).toBe('superseded')
    expect(boms.versionStatus(b, 2)).toBe('active')
    expect(actions.versionLocked(b.id, 1)).toBe(true)
  })

  it('an unreferenced version is edited in place — no new version, no ECO', async () => {
    const { actions, boms, changes } = await load()
    const copy = boms.copyMasterBom('mbom-2', 'ps-2605', 'wp-2605-11', 'PS-2605', 'Rizal Candra', '2026-06-26')
    if ('error' in copy) throw new Error(copy.error)
    const before = changes.engineeringChanges.length
    const v = boms.currentVersion(copy)
    const res = actions.saveBomEdit(copy.id, { components: v.components.map(c => ({ ...c, qty: c.qty + 1 })), productionCost: v.productionCost, title: 'More sheets' }, PROD)
    expect(res.ok).toBe(true)
    expect(copy.versions.length).toBe(1)
    expect(changes.engineeringChanges.length).toBe(before)
  })

  it('only Production edits a project BOM', async () => {
    const { actions } = await load()
    expect(actions.bomEditRefusal('cbom-2603-32', PM)).toMatch(/Production/)
    expect(actions.bomEditRefusal('cbom-2603-32', PROD)).toBe('')
  })

  it('editing a locked version publishes vN+1 as Active at once and raises one Open ECO', async () => {
    const { actions, boms, changes } = await load()
    const b = boms.getCustomBom('cbom-2603-32')!
    const cur = boms.currentVersion(b)
    const res = actions.saveBomEdit(b.id, {
      components: cur.components.map(c => (c.name === 'Rel laci & engsel soft-close' ? { ...c, unitCost: 520_000 } : c)),
      productionCost: cur.productionCost, reason: 'material_substitution', title: 'Blum rails instead of generic',
    }, PROD)
    expect(res.ok).toBe(true)
    expect(boms.currentVersion(b).version).toBe(2)
    const eco = changes.engineeringChanges.find(e => e.id === (res.ok ? res.ecoId : ''))!
    expect(eco.status).toBe('open')
    expect(eco.fromVersion).toBe(1)
    expect(eco.toVersion).toBe(2)
    // A new work order now picks up v2 automatically.
    expect(actions.suggestWoLines(b.id, 1).find(l => l.name === 'Rel laci & engsel soft-close')!.unitCost).toBe(520_000)
  })

  it('refuses a publish without a reason code, and a second edit while an ECO is open', async () => {
    const { actions, boms } = await load()
    const b = boms.getCustomBom('cbom-2603-32')!
    const cur = boms.currentVersion(b)
    const edit = { components: cur.components.map(c => ({ ...c, qty: c.qty + 1 })), productionCost: cur.productionCost, title: 'More' }
    expect(actions.saveBomEdit(b.id, edit, PROD).ok).toBe(false)
    expect(actions.saveBomEdit(b.id, { ...edit, reason: 'data_correction' }, PROD).ok).toBe(true)
    const again = actions.saveBomEdit(b.id, { ...edit, reason: 'data_correction', title: 'Again' }, PROD)
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.error).toMatch(/ECO-2603-02/)
    // The seeded open ECO blocks the furniture BOM too.
    expect(actions.bomEditRefusal('cbom-2603-31', PROD)).toMatch(/ECO-2603-01/)
  })
})

describe('ECO routing and decision', () => {
  it('computes the route from the work-order status', async () => {
    const { actions } = await load()
    expect(actions.ecoRoute({ status: 'Draft' })).toBe('repin')
    expect(actions.ecoRoute({ status: 'Released' })).toBe('cancel_recreate')
    expect(actions.ecoRoute({ status: 'In progress' })).toBe('adjust')
    expect(actions.ecoRoute({ status: 'In progress', completedQty: 5 })).toBe('split_cutover')
    expect(actions.ecoRoute({ status: 'Completed' })).toBe('untouched')
  })

  it('only the PM decides adoption', async () => {
    const { actions, changes } = await load()
    const eco = changes.engineeringChanges.find(e => e.no === 'ECO-2603-01')!
    expect(actions.decideEco(eco.id, { adoption: 'none', selectedWoIds: [], note: '' }, PROD).ok).toBe(false)
    expect(actions.decideEco(eco.id, { adoption: undefined, selectedWoIds: [], note: '' }, PM).ok).toBe(false)
    expect(actions.decideEco(eco.id, { adoption: 'selected', selectedWoIds: [], note: '' }, PM).ok).toBe(false)
  })

  it('all open: split & cutover leaves one version per WO; cancel & recreate moves the set-aside', async () => {
    const { actions, changes, tx } = await load()
    const eco = changes.engineeringChanges.find(e => e.no === 'ECO-2603-01')!
    expect(actions.decideEco(eco.id, { adoption: 'all_open', selectedWoIds: [], note: 'Safety of finish', addendumOverride: 'Priced verbally' }, PM).ok).toBe(true)
    const split = tx.projectWorkOrders.find(w => w.id === 'pwo-1')!
    expect(split.status).toBe('Completed')
    expect(split.qty).toBe(40)
    expect(split.bomVersion).toBe(1)
    const rest = tx.projectWorkOrders.find(w => w.id === split.replacedByWoId)!
    expect(rest.qty).toBe(24)
    expect(rest.bomVersion).toBe(2)
    const cancelled = tx.projectWorkOrders.find(w => w.id === 'pwo-2')!
    expect(cancelled.status).toBe('Cancelled')
    expect(tx.woCommitted(cancelled)).toBe(0)
    const recreated = tx.projectWorkOrders.find(w => w.id === cancelled.replacedByWoId)!
    expect(recreated.budgetSetAside).toBe(cancelled.budgetSetAside)
    expect(eco.decisions.map(d => d.route).sort()).toEqual(['cancel_recreate', 'split_cutover'])
  })

  it('dispositions are mandatory before Implemented; scrap is charged to the project; then it closes', async () => {
    const { actions, changes, tx, res } = await load()
    const eco = changes.engineeringChanges.find(e => e.no === 'ECO-2603-01')!
    actions.decideEco(eco.id, { adoption: 'all_open', selectedWoIds: [], note: '', addendumOverride: 'Priced verbally' }, PM)
    // HPL motif walnut was removed — its 56 reserved sheets return to project stock and need a disposition.
    expect(eco.dispositions.length).toBe(1)
    expect(res.reservations.find(r => r.id === 'rs-2')!.status).toBe('released')
    expect(actions.closeEco(eco.id, PM).ok).toBe(false)
    expect(actions.implementEco(eco.id, PM).ok).toBe(false)
    expect(actions.setEcoDisposition(eco.id, eco.dispositions[0]!.id, 'scrap', PM).ok).toBe(true)
    expect(actions.implementEco(eco.id, PM).ok).toBe(true)
    expect(eco.status).toBe('implemented')
    expect(tx.costLines.some(l => l.docNo === 'ECO-2603-01' && l.kind === 'actual' && l.amount === 56 * 210_000)).toBe(true)
    expect(actions.closeEco(eco.id, PM).ok).toBe(true)
    expect(eco.status).toBe('closed')
  })

  it('above the escalation threshold the decision is held for Finance; approving runs it, rejecting returns it', async () => {
    const { actions, changes, approvals, projects, tx } = await load()
    projects.getProject('ps-2603')!.escalationThresholdPct = 0.01
    const eco = changes.engineeringChanges.find(e => e.no === 'ECO-2603-01')!
    expect(actions.decideEco(eco.id, { adoption: 'selected', selectedWoIds: ['pwo-2'], note: '', addendumOverride: 'Priced verbally' }, PM).ok).toBe(true)
    expect(eco.status).toBe('pending_approval')
    expect(tx.projectWorkOrders.find(w => w.id === 'pwo-2')!.status).toBe('Released')
    const a = approvals.approvals.find(x => x.kind === 'eco' && x.refId === eco.id)!
    expect(actions.decideApproval(a.id, false, FIN, 'Price it first').ok).toBe(true)
    expect(eco.status).toBe('open')
    expect(actions.decideEco(eco.id, { adoption: 'selected', selectedWoIds: ['pwo-2'], note: '', addendumOverride: 'Priced verbally' }, PM).ok).toBe(true)
    const b = approvals.approvals.find(x => x.kind === 'eco' && x.refId === eco.id && x.status === 'pending')!
    expect(actions.decideApproval(b.id, true, FIN).ok).toBe(true)
    expect(eco.status).toBe('decided')
    expect(tx.projectWorkOrders.find(w => w.id === 'pwo-2')!.status).toBe('Cancelled')
  })

  it('an open ECO keeps the project from closing', async () => {
    const { actions } = await load()
    expect(actions.closeBlockers('ps-2603').some(b => b.label.includes('engineering change'))).toBe(true)
  })
})

describe('PRJ-A demo (PRD Scenario B, door 1)', () => {
  it('each PRJ-A work order on the table BOM computes its own route, linked to SO-0231-A1', async () => {
    const { actions, changes } = await load()
    const eco = changes.engineeringChanges.find(e => e.no === 'ECO-PRJ-A-01')!
    expect(eco.addendumSoId).toBe('so-0231-a1')
    const routes = Object.fromEntries(actions.ecoPreview(eco, 'all_open', []).rows.map(r => [r.wo.number, r.route]))
    expect(routes).toEqual({ 'WO-10005': 'untouched', 'WO-10010': 'split_cutover', 'WO-10014': 'cancel_recreate', 'WO-10021': 'repin' })
    expect(actions.ecoUnitDelta(eco).delta).toBe(85_000)
  })
  it('adopting all open WOs needs no override because the addendum is linked', async () => {
    const { actions, changes, tx } = await load()
    const eco = changes.engineeringChanges.find(e => e.no === 'ECO-PRJ-A-01')!
    expect(actions.decideEco(eco.id, { adoption: 'all_open', selectedWoIds: [], note: '' }, PM).ok).toBe(true)
    expect(tx.projectWorkOrders.find(w => w.id === 'pwo-prja-10021')!.bomVersion).toBe(2)
    expect(tx.projectWorkOrders.find(w => w.id === 'pwo-prja-10005')!.bomVersion).toBe(1)
  })
  it('the SO addendum raises the derived contract value', async () => {
    const { projects } = await load()
    expect(projects.contractValueOf(projects.getProject('prj-a')!)).toBe(49_700_000)
  })
})

describe('ECO surfaces', () => {
  const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')
  it('the ECO index is an ErpTablePage with semantic column kinds', () => {
    const page = src('app/components/projects/pages/EngineeringChangesPage.vue')
    expect(page).toMatch(/<ErpTablePage\b/)
    expect(page).not.toMatch(/width: '\d+px'/)
    expect(page).toMatch(/#empty/)
  })
  it('the ECO page is a detail page with ContentList, jump-to and the activity log', () => {
    const page = src('app/components/projects/pages/ProjectEcoDetailPage.vue')
    for (const m of [/<ContentList /, /<DetailJumpTo\b/, /<ActivityLogModal\b/]) expect(page).toMatch(m)
  })
  it('the newer-version indicator hides on completed and cancelled work orders', () => {
    const hint = src('app/components/projects/eco/NewerVersionHint.vue')
    expect(hint).toContain("props.status !== 'Completed'")
    expect(hint).toContain("props.status !== 'Cancelled'")
  })
})
