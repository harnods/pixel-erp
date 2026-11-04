import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resetBudget, setBudgetViewAs, canSeeBudgetAmounts, budget } from '../app/data/budgetStore'

/** PRD FG-3.6 / UX3: transaction forms show a status line; rupiah follow the See budget amounts permission. */
describe('budget amounts on transactions', () => {
  beforeEach(() => resetBudget())

  it('defaults: Finance and budget holders see amounts, requesters and buyers do not', () => {
    for (const r of ['Budget Controller', 'CFO', 'Budget holder (Networking)', 'Finance Admin'] as const) expect(canSeeBudgetAmounts(r)).toBe(true)
    for (const r of ['Requester', 'Line Manager', 'Procurement Officer', 'AP Staff'] as const) expect(canSeeBudgetAmounts(r)).toBe(false)
  })

  it('follows View as', () => {
    setBudgetViewAs('Requester')
    expect(canSeeBudgetAmounts(budget.viewAs)).toBe(false)
    setBudgetViewAs('CFO')
    expect(canSeeBudgetAmounts(budget.viewAs)).toBe(true)
  })

  it('the status line has no balance table and gates every rupiah figure', () => {
    const src = (f: string) => readFileSync(resolve(__dirname, '../app/components/patterns', f), 'utf8')
    const panel = src('BudgetCheckPanel.vue')
    expect(panel).not.toMatch(/<table/)
    expect(panel).toMatch(/canSeeBudgetAmounts/)
    expect(src('BudgetPOCheckSection.vue')).not.toMatch(/<table/)
    expect(src('BudgetPRCard.vue')).toMatch(/View approval log/)
  })
})
