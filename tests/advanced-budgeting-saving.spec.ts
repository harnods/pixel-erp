import { describe, it, expect, beforeEach } from 'vitest'
import {
  budget, resetBudget, findLine, setBudgetViewAs, savingSlices, savingBucketStats, savingHistory, changeApprover,
  pendingSavingDraws, canRaiseSavingDraw, raiseSavingDraw, submitChange, approveChange, rejectChange,
  requestControlChange, decideSettingsChange, pendingSettingChanges, canEditBudgetSettings, setAccountClass,
  accountClassOf, accountOpenLineYear, savingSliceByKey, accountClassTags,
} from '../app/data/budgetStore'
import { budgetAccount, CFO_NAME, BUDGET_CONTROLLER_NAME } from '../app/data/budgetMaster'

const jt = 1_000_000
const ACC_PA = () => findLine('6-60120', 'NW', 'PA')!.id

describe('saving bucket and control settings screens (FG-5, FG-3.6)', () => {
  beforeEach(() => {
    for (const k of Object.keys(accountClassTags)) delete accountClassTags[k]
    budgetAccount('6-60140')!.class = null
    resetBudget()
  })

  it('bucket stats read the sample: Rp8jt filled, nothing drawn or held', () => {
    const s = savingBucketStats()
    expect(s).toEqual({ balance: 8 * jt, filled: 8 * jt, drawn: 0, held: 0, pendingDraws: 0 })
    expect(savingHistory().map((c) => c.kind)).toEqual(['Saving fill'])
    expect(changeApprover(savingHistory()[0]!)).toEqual({ name: CFO_NAME, decided: true })
  })

  it('FG5-AC1: a Rp3jt draw holds on the slice and waits for the CFO alone', () => {
    setBudgetViewAs('Budget Controller')
    const slice = savingSlices()[0]!
    const res = raiseSavingDraw({ sliceKey: slice.key, toLineId: ACC_PA(), amount: 3 * jt, reason: 'Hotel overrun' })
    expect(res.ok).toBe(true)
    expect(submitChange(res.change!.id).ok).toBe(true)
    const s = savingBucketStats()
    expect(s.held).toBe(3 * jt)
    expect(s.balance).toBe(5 * jt)
    expect(pendingSavingDraws(CFO_NAME).map((c) => c.id)).toEqual([res.change!.id])
    expect(changeApprover(res.change!)).toEqual({ name: CFO_NAME, decided: false })
    setBudgetViewAs('CFO')
    expect(approveChange(res.change!.id).ok).toBe(true)
    expect(savingBucketStats()).toMatchObject({ drawn: 3 * jt, held: 0, balance: 5 * jt })
  })

  it('FG5-AC2: the CFO cannot raise a draw, and nor can a requester', () => {
    const slice = savingSlices()[0]!
    setBudgetViewAs('CFO')
    expect(canRaiseSavingDraw().ok).toBe(false)
    const r = raiseSavingDraw({ sliceKey: slice.key, toLineId: ACC_PA(), amount: 1 * jt, reason: 'x' })
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('CFO')
    setBudgetViewAs('Requester')
    expect(raiseSavingDraw({ sliceKey: slice.key, toLineId: ACC_PA(), amount: 1 * jt, reason: 'x' }).ok).toBe(false)
    expect(budget.changes.filter((c) => c.kind === 'Saving draw')).toHaveLength(0)
    expect(canRaiseSavingDraw(BUDGET_CONTROLLER_NAME).ok).toBe(true)
  })

  it('a rejected draw frees its hold', () => {
    setBudgetViewAs('Budget Controller')
    const slice = savingSlices()[0]!
    const d = raiseSavingDraw({ sliceKey: slice.key, toLineId: ACC_PA(), amount: 2 * jt, reason: 'x' }).change!
    submitChange(d.id)
    setBudgetViewAs('CFO')
    expect(rejectChange(d.id, 'Not needed').ok).toBe(true)
    expect(savingBucketStats()).toMatchObject({ held: 0, balance: 8 * jt, pendingDraws: 0 })
    expect(savingSliceByKey(slice.key)!.balance).toBe(8 * jt)
  })

  it('FG3-AC8: a Finance Admin change waits for the CFO, then applies with a next-day start', () => {
    setBudgetViewAs('Budget Controller')
    expect(canEditBudgetSettings()).toBe(false)
    expect(requestControlChange({ year: 'Warn' }).ok).toBe(false)
    setBudgetViewAs('Finance Admin')
    expect(requestControlChange({ year: 'Block' }).reason).toBe('Nothing changed.')
    const r = requestControlChange({ year: 'Warn', month: 'Warn' })
    expect(r.ok).toBe(true)
    expect(r.change!.patch).toEqual({ year: 'Warn' })
    expect(budget.settings.year).toBe('Block')
    expect(pendingSettingChanges()).toHaveLength(1)
    expect(decideSettingsChange(r.change!.id, true).ok).toBe(false)
    setBudgetViewAs('CFO')
    expect(decideSettingsChange(r.change!.id, true).ok).toBe(true)
    expect(budget.settings.year).toBe('Warn')
    expect(r.change!.effectiveFrom).toBe('2026-10-06')
  })

  it('approval limits validate their range', () => {
    setBudgetViewAs('Finance Admin')
    expect(requestControlChange({ fundingCapPct: 120 }).ok).toBe(false)
    expect(requestControlChange({ smallMoveDays: 0 }).ok).toBe(false)
    expect(requestControlChange({ smallMoveLimit: 75 * jt }).ok).toBe(true)
  })

  it('an account on a 2026 line keeps its class; an unused one takes a class from the Finance Admin', () => {
    setBudgetViewAs('Finance Admin')
    expect(accountOpenLineYear('6-60120')).toBe(2026)
    expect(setAccountClass('6-60120', 'Capex').reason).toBe('This account sits on a 2026 budget line.')
    expect(accountOpenLineYear('6-60140')).toBeNull()
    setBudgetViewAs('CFO')
    expect(setAccountClass('6-60140', 'Opex').ok).toBe(false)
    setBudgetViewAs('Finance Admin')
    expect(setAccountClass('6-60140', 'Opex').ok).toBe(true)
    expect(accountClassOf('6-60140')).toBe('Opex')
    expect(budgetAccount('6-60140')!.class).toBe('Opex')
    expect(setAccountClass('9-99000', 'Opex').ok).toBe(false)
  })
})
