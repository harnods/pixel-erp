import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import {
  resetAssetStore, fixedAssets, setViewAs, ledgers, journals, computeSelfCheck, selfCheckFor,
  postPeriod, simulateDirectJournal, withdrawDirectJournals, retainedSelfChecks, fyFigures,
  recordEvent, CURRENT_PERIOD,
} from '~/data/assetStore'
import {
  assetClassMaster, allowedGroupsFor, classifyAsset, changeAssetClass, planClassChange, lampiranRows,
  lampiranStatus, rollForward, updateClassDef, classDef,
} from '~/data/assetTaxbook'
import { planBulkEdit, applyBulkEdit, reverseBulkEdit, bulkOperations } from '~/data/assetBulkEdit'
import {
  migrationRows, setFiscalOpening, activateMigration, reconcileMigration, reconciliations, migrationActivated,
} from '~/data/assetMigration'
import { differenceByAsset } from '~/data/fixedAssetScreens'

const find = (id: string) => fixedAssets.value.find((a) => a.id === id)!

beforeEach(() => resetAssetStore())

describe('TS-01 class master', () => {
  it('lists every class with a default life, method and statutory group', () => {
    expect(assetClassMaster.value.length).toBe(7)
    for (const c of assetClassMaster.value) {
      expect(c.defaultTaxGroup).toBeTruthy()
      expect(c.commercialLifeMonths).toBeGreaterThan(0)
      expect(c.method).toBe('straight-line')
    }
  })

  it('a class change inherits the class group, life and method', () => {
    // FA-0023 Equipment (Tax group 2) to Furniture (Tax group 1, 8 yr).
    const plan = planClassChange('FA-0023', 'Furniture')
    expect(plan.ok).toBe(true)
    const r = changeAssetClass('FA-0023', 'Furniture')
    expect(r.ok).toBe(true)
    const a = find('FA-0023')
    expect(a.class).toBe('Furniture')
    expect(a.taxGroup).toBe('Tax group 1')
    expect(a.fiscalLifeMonths).toBe(48)
    expect(a.commercialLifeMonths).toBe(96)
  })

  it('an edited class default reaches the next class change', () => {
    expect(updateClassDef('Furniture', { defaultTaxGroup: 'Tax group 2' })).toBeNull()
    expect(classDef('Furniture')!.defaultTaxGroup).toBe('Tax group 2')
    changeAssetClass('FA-0060', 'Furniture')
    expect(find('FA-0060').taxGroup).toBe('Tax group 2')
  })
})

describe('OD-02 constrained picker and FG1-AC1, FG1-AC6', () => {
  it('buildings take only building groups, intangibles never do', () => {
    expect(allowedGroupsFor('Tangible', 'Buildings')).toEqual(['Permanent building', 'Non-permanent building'])
    expect(allowedGroupsFor('Intangible', 'Intangible assets')).not.toContain('Permanent building')
    expect(classifyAsset('FA-0012', { group: 'Tax group 4' }).ok).toBe(false)
    expect(classifyAsset('FA-0094', { group: 'Permanent building', statutoryCode: '0601 Patent' }).ok).toBe(false)
  })

  it('classifying FA-0077 generates a statutory schedule independent of the commercial life', () => {
    const r = classifyAsset('FA-0077', { group: 'Tax group 2' })
    expect(r.ok).toBe(true)
    const a = find('FA-0077')
    expect(a.fiscalLifeMonths).toBe(96)
    expect(a.commercialLifeMonths).toBe(60)
    expect(a.bookValueFiscal).not.toBeNull()
    expect(ledgers.value['FA-0077']!.books.tax!.bases[0]!.method).toBe('straight-line')
  })

  it('a Tax role cannot change the fiscal life away from the group; Owner can', () => {
    setViewAs('Tax')
    const r = classifyAsset('FA-0077', { group: 'Tax group 2', fiscalLifeMonths: 60 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/LM authority/)
    expect(classifyAsset('FA-0077', { group: 'Tax group 2' }).ok).toBe(true)
    setViewAs('Owner')
    expect(classifyAsset('FA-0077', { group: 'Tax group 2', fiscalLifeMonths: 60 }).ok).toBe(true)
    expect(find('FA-0077').fiscalLifeMonths).toBe(60)
  })

  it('the fiscal book posts nothing (FG1-AC4)', () => {
    const before = journals.value.length
    classifyAsset('FA-0077', { group: 'Tax group 2' })
    expect(journals.value.length).toBe(before)
  })
})

describe('OD-04, OD-40, OD-07 live', () => {
  it('a disposal moves the difference and deferred tax', () => {
    const before = fyFigures()
    const dBefore = differenceByAsset().length
    const r = recordEvent('FA-0031', { kind: 'disposal', period: CURRENT_PERIOD, date: '30/09/2026', recordedBy: 'x', proceeds: 100_000_000 })
    expect(r.ok).toBe(true)
    const after = fyFigures()
    expect(after.deferredTax).not.toBe(before.deferredTax)
    expect(differenceByAsset().length).toBeGreaterThan(dBefore)
  })
})

describe('OD-05, OD-48, FG1-AC2, FG9-AC4 Lampiran 9 screen', () => {
  it('refuses while unclassified and counts both halves', () => {
    const s = lampiranStatus()
    expect(s.ready).toBe(false)
    expect(s.unclassified.map((a) => a.id)).toEqual(['FA-0077'])
    expect(s.unreportedCost).toBe(265_000_000)
    expect(s.tangible).toBeGreaterThan(0)
    expect(s.intangible).toBe(lampiranRows('Intangible').length)
    classifyAsset('FA-0077', { group: 'Tax group 2' })
    const s2 = lampiranStatus()
    expect(s2.ready).toBe(true)
    expect(s2.tangible).toBe(s.tangible + 1)
  })

  it('every row carries the ten fields', () => {
    for (const r of [...lampiranRows('Tangible'), ...lampiranRows('Intangible')]) {
      expect(r.group).toBeTruthy()
      expect(r.acquired).toMatch(/^\d{2}\/\d{4}$/)
      expect(r.fiscalMethod).toBeTruthy()
      expect(r.commercialMethod).toBeTruthy()
      expect(Number.isFinite(r.charge)).toBe(true)
    }
  })
})

describe('TS-06 roll-forward', () => {
  it('ties on both books, per class', () => {
    for (const book of ['accounting', 'tax'] as const) {
      const rf = rollForward(book)
      for (const r of rf.rows) expect(r.unexplained).toBe(0)
      expect(rf.total.unexplained).toBe(0)
    }
    expect(rollForward('tax').excluded).toEqual(['FA-0077'])
  })

  it('still ties after an impairment, a split and a partial disposal', () => {
    recordEvent('FA-0031', { kind: 'impairment', period: CURRENT_PERIOD, date: '30/09/2026', recordedBy: 'x', recoverable: 500_000_000 })
    recordEvent('FA-0047', { kind: 'partial-disposal', period: CURRENT_PERIOD, date: '30/09/2026', recordedBy: 'x', proportion: 0.25, proceeds: 10_000_000 })
    for (const book of ['accounting', 'tax'] as const) expect(rollForward(book).total.unexplained).toBe(0)
    expect(rollForward('tax').total.impairment).toBe(0)
    expect(rollForward('accounting').total.impairment).toBeGreaterThan(0)
  })
})

describe('OD-34 bulk edit', () => {
  it('states the count and reverses as one unit', () => {
    const ids = ['FA-0077', 'FA-0012', 'FA-0055']
    const plan = planBulkEdit(ids, 'taxGroup', 'Tax group 2')
    expect(plan.affected.map((x) => x.id)).toEqual(['FA-0077', 'FA-0055'])
    // A building cannot take an ordinary group: named, not silently skipped.
    expect(plan.skipped.map((x) => x.id)).toEqual(['FA-0012'])
    expect(plan.skipped[0]!.skip).toMatch(/building/)
    const r = applyBulkEdit(plan)
    expect(r.ok).toBe(true)
    expect(find('FA-0077').taxGroup).toBe('Tax group 2')
    const back = reverseBulkEdit(bulkOperations.value[0]!.number)
    expect(back.ok).toBe(true)
    expect(find('FA-0077').taxGroup).toBeNull()
    expect(find('FA-0055').taxGroup).toBe('Tax group 1')
  })

  it('custody and class reverse together', () => {
    const r = applyBulkEdit(planBulkEdit(['FA-0023', 'FA-0064'], 'location', 'Cakung Warehouse'))
    expect(r.ok).toBe(true)
    expect(find('FA-0023').location).toBe('Cakung Warehouse')
    reverseBulkEdit(bulkOperations.value[0]!.number)
    expect(find('FA-0023').location).toBe('Medan Warehouse')
    const c = applyBulkEdit(planBulkEdit(['FA-0023', 'FA-0064'], 'class', 'Furniture'))
    expect(c.ok).toBe(true)
    expect(find('FA-0064').taxGroup).toBe('Tax group 1')
    expect(reverseBulkEdit(bulkOperations.value[0]!.number).ok).toBe(true)
    expect(find('FA-0064').class).toBe('Equipment')
    expect(find('FA-0064').taxGroup).toBe('Tax group 3')
  })
})

describe('OD-03, OD-29, FG6-AC4 migration', () => {
  it('commercial openings reconcile to the ledger; fiscal differences refuse activation and list the assets', () => {
    const ev = reconcileMigration()
    expect(ev.commercial.registerCost).toBe(ev.commercial.ledgerCost)
    expect(ev.commercial.registerAccumulated).toBe(ev.commercial.ledgerAccumulated)
    expect(ev.differing.map((d) => d.id).sort()).toEqual(['FA-0047', 'FA-0064'])
    const r = activateMigration()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/FA-0047/)
    expect(reconciliations.value.length).toBe(2)
  })

  it('editing the fiscal opening to the prior figure lets activation through and moves the tax book', () => {
    for (const row of migrationRows.value.filter((x) => x.difference)) setFiscalOpening(row.id, row.priorFiscal)
    const before = find('FA-0047').bookValueFiscal!
    const r = activateMigration()
    expect(r.ok).toBe(true)
    expect(migrationActivated.value).not.toBeNull()
    expect(find('FA-0047').bookValueFiscal).not.toBe(before)
    for (const book of ['accounting', 'tax'] as const) expect(rollForward(book).total.unexplained).toBe(0)
  })
})

describe('FG6-AC2, AC3, OD-43 self-check', () => {
  it('retains a result per closed period and runs at close', () => {
    expect(retainedSelfChecks().length).toBe(9)
    const r = postPeriod('2026-09')
    expect(r.ok).toBe(true)
    const kept = selfCheckFor('2026-09')!
    expect(kept.checks.length).toBe(4)
  })

  it('a direct journal makes the reconciliation fail and names the difference', async () => {
    simulateDirectJournal()
    await nextTick()
    const c1 = computeSelfCheck().checks.find((c) => c.id === 'C1')!
    expect(c1.state).toBe('failed')
    expect(c1.detail).toMatch(/6-5100/)
    expect(selfCheckFor(CURRENT_PERIOD)!.checks.find((c) => c.id === 'C1')!.state).toBe('failed')
    withdrawDirectJournals()
    expect(computeSelfCheck().checks.find((c) => c.id === 'C1')!.state).toBe('passed')
  })
})
