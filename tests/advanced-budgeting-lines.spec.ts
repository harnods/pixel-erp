import { describe, it, expect, beforeEach } from 'vitest'
import {
  budget, resetBudget, setBudgetViewAs, findLine, isLocked, draftTotal, lineTotal, spreadEvenly, versionsFor, BUDGET_YEAR,
  addDraftLine, updateLineMonths, importLinesAs, lockYearAs, lineVersionNo, canManageBudgetLines, LOCKED_EDIT_MESSAGE,
} from '../app/data/budgetStore'
import {
  linesForYear, lineRow, matchesLineFilters, emptyLineFilters, totalsOf, sample2027, sample2027WithErrors,
  importRowTotal, compareVersions, lineAccess, parseAmount, entryDate, entryLink,
} from '../app/data/budgetUiLines'

const jt = 1_000_000
const Y2 = BUDGET_YEAR + 1

describe('budget lines screens (PRD FG-1)', () => {
  beforeEach(() => { resetBudget(); setBudgetViewAs('Budget Controller') })

  it('FG1-AC1: a draft-year line saves with uneven months and a year total of Rp80.000.000', () => {
    const months = [10, 0, 25, 5, 5, 5, 5, 5, 5, 5, 5, 5].map((v) => v * jt)
    const res = addDraftLine({ year: Y2, account: '6-60120', dept: 'NW', project: 'PA', months })
    expect(res.ok).toBe(true)
    expect(lineTotal(res.line!)).toBe(80 * jt)
    expect(isLocked(Y2)).toBe(false)
    expect(lineVersionNo(res.line!.id)).toBeNull()
  })

  it('a second line on the same mix and year is blocked', () => {
    addDraftLine({ year: Y2, account: '6-60120', dept: 'NW', project: 'PA', months: spreadEvenly(12 * jt) })
    const again = addDraftLine({ year: Y2, account: '6-60120', dept: 'NW', project: 'PA', months: spreadEvenly(12 * jt) })
    expect(again.ok).toBe(false)
    expect(again.errors.join(' ')).toContain('already exists')
  })

  it('FG1-AC6 / LR-5: a locked year refuses on-screen edits, new lines and import, and points to revision or transfer', () => {
    const acc = findLine('6-60120', 'NW', 'PA')!
    const before = [...acc.months]
    expect(updateLineMonths(acc.id, spreadEvenly(1 * jt)).errors).toEqual([LOCKED_EDIT_MESSAGE])
    expect(acc.months).toEqual(before)
    expect(addDraftLine({ year: BUDGET_YEAR, account: '6-60140', dept: 'FN', project: null, months: spreadEvenly(12 * jt) }).errors).toEqual([LOCKED_EDIT_MESSAGE])
    const imp = importLinesAs(sample2027().rows, BUDGET_YEAR)
    expect(imp.ok).toBe(false)
    expect(imp.errors[0]!.message).toContain('revision or transfer')
  })

  it('FG1-AC8: only the Budget Controller adds, imports and locks; the store refuses the others too', () => {
    setBudgetViewAs('Budget holder (Networking)')
    expect(canManageBudgetLines()).toBe(false)
    expect(lineAccess().manage).toBe(false)
    expect(addDraftLine({ year: Y2, account: '6-60120', dept: 'NW', project: 'PA', months: spreadEvenly(12 * jt) }).ok).toBe(false)
    expect(importLinesAs(sample2027().rows, Y2).ok).toBe(false)
    expect(lockYearAs(Y2, 0).message).toContain('Only the Budget Controller')
    expect(budget.lines.some((l) => l.year === Y2)).toBe(false)
  })

  it('FG1-AC5: an upload with bad rows loads nothing and reports every bad row', () => {
    addDraftLine({ year: Y2, account: '6-60111', dept: 'OP', project: null, months: spreadEvenly(6 * jt) })
    const before = budget.lines.filter((l) => l.year === Y2).map((l) => l.id)
    const res = importLinesAs(sample2027WithErrors().rows, Y2)
    expect(res.ok).toBe(false)
    expect(new Set(res.errors.map((e) => e.row))).toEqual(new Set([3, 5, 7, 11, 12]))
    expect(budget.lines.filter((l) => l.year === Y2).map((l) => l.id)).toEqual(before)
  })

  it('FG1-AC4: lock blocks on a gap and passes when the approved total matches; lock posts Version 0', () => {
    expect(importLinesAs(sample2027().rows, Y2).ok).toBe(true)
    const total = draftTotal(Y2)
    expect(total).toBe(sample2027().rows.reduce((s, r) => s + importRowTotal(r), 0))
    const short = lockYearAs(Y2, total + 50 * jt)
    expect(short.ok).toBe(false)
    expect(short.gap).toBe(50 * jt)
    expect(isLocked(Y2)).toBe(false)
    expect(lockYearAs(Y2, total).ok).toBe(true)
    expect(isLocked(Y2)).toBe(true)
    const l = linesForYear(Y2)[0]!
    expect(lineVersionNo(l.id)).toBe(0)
    expect(versionsFor(l.id)[0]!.type).toBe('Original')
  })

  it('FG1-AC3: dimensions AND, values OR, and filtered totals add up to the unfiltered total', () => {
    const rows = linesForYear(BUDGET_YEAR).map(lineRow)
    const f = { ...emptyLineFilters(), depts: ['NW'], projects: ['PA', 'PB'] as (string | null)[] }
    const hit = rows.filter((r) => matchesLineFilters(r, f))
    expect(hit.every((r) => r.dept === 'NW' && (r.project === 'PA' || r.project === 'PB'))).toBe(true)
    expect(hit.length).toBe(5)
    expect(totalsOf(hit).budget).toBe(2_910 * jt)
    const rest = rows.filter((r) => !matchesLineFilters(r, f))
    expect(totalsOf(hit).budget + totalsOf(rest).budget).toBe(totalsOf(rows).budget)
    expect(totalsOf(hit).available + totalsOf(rest).available).toBe(totalsOf(rows).available)
    const capexOnly = rows.filter((r) => matchesLineFilters(r, { ...emptyLineFilters(), classes: ['Capex'] }))
    expect(capexOnly.map((r) => r.account).sort()).toEqual(['1-15020', '1-17010'])
  })

  it('the index row carries the ledger figures of the sample story', () => {
    const r = lineRow(findLine('6-60120', 'NW', 'PA')!)
    expect([r.budget, r.reserved, r.committed, r.actual, r.available]).toEqual([240 * jt, 20 * jt, 25 * jt, 165 * jt, 30 * jt])
    expect(r.versionLabel).toBe('Version 1')
    expect(lineRow(findLine('6-60111', 'NW', null)!).projectLabel).toBe('(no project)')
  })

  it('version compare: Version 0 to 2 moves Rp10jt into Accommodation and Rp8jt into the saving bucket, total unchanged', () => {
    const rows = compareVersions(BUDGET_YEAR, 0, 2, linesForYear(BUDGET_YEAR))
    const acc = rows.find((r) => r.lineId === findLine('6-60120', 'NW', 'PA')!.id)!
    expect([acc.a, acc.b, acc.diff]).toEqual([230 * jt, 240 * jt, 10 * jt])
    expect(rows.reduce((s, r) => s + r.diff, 0)).toBe(0)
  })

  it('role scope: the requester reads balances of their own department only', () => {
    const a = lineAccess('Requester')
    expect(a.detail).toBe(false)
    expect(linesForYear(BUDGET_YEAR, 'Requester').every((l) => l.dept === 'NW')).toBe(true)
    expect(linesForYear(BUDGET_YEAR, 'Budget holder (Operations)').length).toBe(2)
  })

  it('ledger entries carry their document date and link to the request or change', () => {
    const acc = findLine('6-60120', 'NW', 'PA')!
    const e = budget.entries.find((x) => x.lineId === acc.id && x.docNo === '#90131')!
    expect(entryDate(e)).toBe('2026-09-22')
    expect(entryLink(e)).toMatch(/^\/purchase-requests\//)
    const tr = budget.entries.find((x) => x.docKind === 'Change')
    if (tr) expect(entryLink(tr)).toBe(`/budget-changes/${tr.docId}`)
  })

  it('amount fields read grouped rupiah and reject decimals', () => {
    expect(parseAmount('100.000.000')).toBe(100 * jt)
    expect(parseAmount('Rp 8.333.337')).toBe(8_333_337)
    expect(Number.isInteger(parseAmount('1.000,5'))).toBe(false)
    expect(Number.isNaN(parseAmount('abc'))).toBe(true)
  })
})
