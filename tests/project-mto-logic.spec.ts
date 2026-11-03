/**
 * Project MTO — business-logic regression tests for the review fixes (22 Sep 2026)
 * plus the seed data checks the batch-2 stories assert.
 *
 * The data modules are module-level reactive stores seeded on import, so every
 * test re-imports them fresh (vi.resetModules) to start from the seed.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const FIN = { name: 'Maya Kartika', role: 'Finance' as const }
const PM = { name: 'Rizal Candra', role: 'PM' as const }
const WH = { name: 'Budi Santoso', role: 'Warehouse' as const }

async function load() {
  const actions = await import('~/data/projectActions')
  const projects = await import('~/data/projects')
  const budgets = await import('~/data/projectBudgets')
  const tx = await import('~/data/projectTransactions')
  const rec = await import('~/data/projectRecognition')
  const changes = await import('~/data/projectChanges')
  const res = await import('~/data/projectReservations')
  const approvals = await import('~/data/projectApprovals')
  const boms = await import('~/data/projectBoms')
  return { actions, projects, budgets, tx, rec, changes, res, approvals, boms }
}

beforeEach(() => { vi.resetModules() })

describe('ECO quantity parsing', () => {
  it('reads a decimal quantity with a dot or a comma, and whole rupiah with thousand dots', async () => {
    const { parseQty, parseAmount } = await import('~/utils/projectFormat')
    expect(parseQty('1.5')).toBe(1.5)
    expect(parseQty('1,75')).toBe(1.75)
    expect(parseAmount('285.000')).toBe(285000)
  })
})

describe('change order ↔ engineering change', () => {
  it('rejecting the funding change order unlinks the ECO so it can still be approved', async () => {
    const { actions, changes, approvals } = await load()
    const voApproval = approvals.approvals.find(a => a.refNo === 'VO-2603-02')!
    expect(actions.decideApproval(voApproval.id, false, FIN, 'Customer withdrew').ok).toBe(true)
    const eco = changes.engineeringChanges.find(e => e.no === 'ECO-2603-01')!
    expect(eco.voId).toBeUndefined()
    const ecoApproval = approvals.approvals.find(a => a.refNo === 'ECO-2603-01')!
    expect(actions.decideApproval(ecoApproval.id, true, FIN).ok).toBe(true)
  })

  it('still refuses an ECO whose change order is only raised, not yet decided (OQ23)', async () => {
    const { actions, approvals } = await load()
    const ecoApproval = approvals.approvals.find(a => a.refNo === 'ECO-2603-01')!
    const res = actions.decideApproval(ecoApproval.id, true, FIN)
    expect(res.ok).toBe(false)
  })

  it('a change order with a price but no cost still lifts the revenue baseline with a revision', async () => {
    const { actions, budgets, changes, approvals } = await load()
    const vo = changes.changeOrders.find(v => v.no === 'VO-2603-03')!
    expect(actions.raiseVo(vo.id, { cost: 0, price: 3_800_000, distinct: false, reason: 'Light points moved on site' }, PM).ok).toBe(true)
    const before = budgets.getBudget('ps-2603')!.revenue
    const a = approvals.approvals.find(x => x.refNo === 'VO-2603-03' && x.status === 'pending')!
    expect(actions.decideApproval(a.id, true, FIN).ok).toBe(true)
    const b = budgets.getBudget('ps-2603')!
    expect(b.revenue).toBe(before + 3_800_000)
    expect(b.revisions[0]!.refNo).toBe('VO-2603-03')
  })
})

describe('engineering change approval', () => {
  it('budget delta counts only future units + WOs in scope, and line budgets stay within the set-aside', async () => {
    const { actions, tx, budgets, changes, approvals, boms } = await load()
    // Fund the ECO first so it may be approved.
    const voApproval = approvals.approvals.find(a => a.refNo === 'VO-2603-02')!
    actions.decideApproval(voApproval.id, true, FIN)
    const eco = changes.engineeringChanges.find(e => e.no === 'ECO-2603-01')!
    eco.effectivity = 'specific'
    eco.specificWoIds = ['pwo-2'] // WO-PS-0002, Released, 56 sets
    const units = actions.ecoDeltaUnits(eco)
    // WP 3.1: 120 planned − 64 confirmed = 56 remaining; open WOs hold 64 + 56 → no future units; scope = 56.
    expect(units).toBe(56)
    const cogmBefore = budgets.wpBudget('wp-2603-31', budgets.COGM_ACCOUNT)!
    const bom = boms.getCustomBom('cbom-2603-31')!
    const unitDelta = boms.bomUnitCost(eco.proposed) - boms.bomUnitCost(boms.currentVersion(bom))
    const ecoApproval = approvals.approvals.find(a => a.refNo === 'ECO-2603-01')!
    expect(actions.decideApproval(ecoApproval.id, true, FIN).ok).toBe(true)
    expect(budgets.wpBudget('wp-2603-31', budgets.COGM_ACCOUNT)).toBe(cogmBefore + Math.round(unitDelta * 56))
    const wo = tx.projectWorkOrders.find(w => w.id === 'pwo-2')!
    const allocated = wo.lines.reduce((s, l) => s + l.budget, 0)
    expect(allocated).toBeLessThanOrEqual(wo.budgetSetAside)
    // The in-progress WO keeps its version.
    expect(tx.projectWorkOrders.find(w => w.id === 'pwo-1')!.bomVersion).toBe(1)
  })
})

describe('budget revision requests', () => {
  it('refuses to apply a proposal when the budget moved after it was raised', async () => {
    const { actions, budgets, approvals } = await load()
    const b = budgets.getBudget('ps-2606')!
    const draft = { lines: b.lines.map(l => ({ ...l })), reserves: { ...b.reserves }, revenue: b.revenue }
    draft.lines[0]!.amount += 1_000_000
    expect(actions.requestBudgetRevision('ps-2606', { amount: 1_000_000, reason: 'Extra hinges', payload: draft }, PM).ok).toBe(true)
    // Meanwhile Finance approves the seeded reserve move → a new revision lands.
    const seeded = approvals.approvals.find(a => a.refNo === 'BR-2606-01')!
    expect(actions.decideApproval(seeded.id, true, FIN).ok).toBe(true)
    const stale = approvals.approvals.find(a => a.kind === 'budget_revision' && a.status === 'pending' && a.payload)!
    const res = actions.decideApproval(stale.id, true, FIN)
    expect(res.ok).toBe(false)
    expect(stale.status).toBe('pending')
  })
})

describe('draft projects consume nothing (Story 7)', () => {
  it('refuses firm documents on a Draft project and saves a purchase request as a draft', async () => {
    const { actions, tx } = await load()
    const line = { description: 'Plat aluminium', account: '5-50300', amount: 5_000_000, wpId: 'wp-2605-21' }
    expect(actions.saveDocument({ docType: 'Expense', lines: [line] }, PM).ok).toBe(false)
    const pr = actions.saveDocument({ docType: 'PR', lines: [line] }, PM)
    expect(pr.ok).toBe(true)
    expect(pr.ok && pr.doc?.status).toBe('draft')
    expect(tx.costLines.some(l => l.wpId === 'wp-2605-21')).toBe(false)
    expect(tx.wpActual('wp-2605-21')).toBe(0)
  })
})

describe('close gate and completion true-up', () => {
  it('an Output · unit project finished under plan can recognise the rest and pass the recognition gate', async () => {
    const { actions, projects, rec } = await load()
    for (const w of projects.projectWorkPackages('ps-2606')) w.status = 'technically_complete'
    expect(actions.closeBlockers('ps-2606').some(b => b.label === 'Recognition not final')).toBe(true)
    const res = actions.finaliseRecognition('ps-2606', FIN)
    expect(res.ok).toBe(true)
    expect(rec.recognisedToDate('ps-2606')).toBe(projects.getProject('ps-2606')!.contractValue)
    expect(actions.closeBlockers('ps-2606').some(b => b.label === 'Recognition not final')).toBe(false)
  })

  it('refuses the true-up while a work package is still open', async () => {
    const { actions } = await load()
    expect(actions.finaliseRecognition('ps-2606', FIN).ok).toBe(false)
  })
})

describe('100% BAST releases all remaining commitment', () => {
  it('closes open work orders at actual and releases their unused set-aside', async () => {
    const { actions, tx } = await load()
    expect(tx.wpCommitted('wp-2606-11')).toBeGreaterThan(0)
    expect(actions.recordBast('wp-2606-11', 100, 'BAST/GK/01', FIN).ok).toBe(true)
    expect(tx.wpCommitted('wp-2606-11')).toBe(0)
    const wo = tx.projectWorkOrders.find(w => w.id === 'pwo-5')!
    expect(wo.status).toBe('Completed')
    expect(wo.actual).toBe(60_000_000) // actual kept, not inflated to the estimate
    expect(wo.released).toBe(70_000_000)
  })
})

describe('stock release requests', () => {
  it('refuses to approve when the source reservation was issued in the meantime', async () => {
    const { actions, res, approvals } = await load()
    const src = res.reservations.find(r => r.id === 'rs-7')! // HPL reserved to PS-2606
    expect(actions.advanceReservation(src.id, WH).ok).toBe(true) // picked
    expect(actions.advanceReservation(src.id, WH).ok).toBe(true) // issued
    const a = approvals.approvals.find(x => x.refNo === 'RR-0001')!
    const result = actions.decideApproval(a.id, true, FIN)
    expect(result.ok).toBe(false)
    expect(res.reservations.filter(r => r.projectId === 'ps-2603' && r.source === 'Manual')).toHaveLength(0)
  })
})

describe('seed data checks used by the batch-2 stories', () => {
  it('IPB: verifying Interior recognises Rp424.295.571 with no invoice', async () => {
    const { actions, rec, projects } = await load()
    const invoicesBefore = rec.projectInvoiceList('ps-2603').length
    const res = actions.verifyPhase('ph-2603-3', 'BAST/IPB/03', PM)
    expect(res.ok).toBe(true)
    expect(rec.projectRecognition('ps-2603').at(-1)!.amount).toBe(424_295_571)
    expect(rec.projectInvoiceList('ps-2603').length).toBe(invoicesBefore)
    expect(rec.wipPosition('ps-2603')).toBe(315_715_995)
    expect(projects.weightTotal('ps-2603')).toBe(100)
  })

  it('Kamala: 45% complete and recognition due Rp97.470.000; progress invoice is 40% of the new contract value', async () => {
    const { rec, projects } = await load()
    const p = projects.getProject('ps-2606')!
    expect(rec.percentComplete(p)).toBe(45)
    expect(rec.recognitionDue(p)).toBe(97_470_000)
    expect(rec.projectInvoiceList('ps-2606').find(i => i.no === 'INV/2026/1140')!.amount).toBe(Math.round(0.4 * p.contractValue))
  })
})
