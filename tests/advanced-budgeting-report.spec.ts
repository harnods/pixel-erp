import { describe, it, expect, beforeEach } from 'vitest'
import { budget, resetBudget, findLine, yearFigures, runTieOut } from '../app/data/budgetStore'
import {
  buildReport, countedGL, drillLine, drillPostings, effectiveFilter, filterOptions, parseReportQuery, toReportQuery,
  runTieOutAs, EMPTY_FILTER, DEFAULT_PERIOD, FIGURE_KEYS, addFigures, zeroFigures, type ReportPeriod,
} from '../app/data/budgetUiReport'
import type { BudgetRole } from '../app/data/budgetMaster'

const jt = 1_000_000
const BC: BudgetRole = 'Budget Controller'
const YTD: ReportPeriod = DEFAULT_PERIOD
const YEAR: ReportPeriod = { kind: 'year', month: 9 }
const OCT: ReportPeriod = { kind: 'month', month: 9 }
const ACC_PA = () => findLine('6-60120', 'NW', 'PA')!.id

describe('budget report (PRD FG-6)', () => {
  beforeEach(() => resetBudget())

  it('a line row shows the ledger figures and available = budget - reserved - committed - actual', () => {
    const r = buildReport(EMPTY_FILTER, YEAR, 'none', BC)
    const row = r.rows.find((x) => x.lineId === ACC_PA())!
    const f = yearFigures(ACC_PA())
    expect(row.figures.budget).toBe(240 * jt)
    expect(row.figures.reserved).toBe(20 * jt)
    expect(row.figures.committed).toBe(25 * jt)
    expect(row.figures.actual).toBe(165 * jt)
    expect(row.figures.available).toBe(30 * jt)
    expect(row.figures.available).toBe(f.available)
    expect(row.figures.movedIn).toBe(10 * jt)
  })

  for (const period of [YTD, YEAR, OCT]) {
    it(`filtered totals by each department add up to the unfiltered total (${period.kind})`, () => {
      const all = buildReport(EMPTY_FILTER, period, 'none', BC)
      const depts = filterOptions(BC).depts.map((d) => d.value)
      const sum = depts.map((d) => buildReport({ ...EMPTY_FILTER, depts: [d] }, period, 'none', BC).total)
        .reduce((s, t) => addFigures(s, t), zeroFigures())
      for (const k of FIGURE_KEYS) expect(sum[k], k).toBe(all.total[k])
      const nc = depts.reduce((s, d) => s + buildReport({ ...EMPTY_FILTER, depts: [d] }, period, 'none', BC).notCounted.amount, 0)
      expect(nc).toBe(all.notCounted.amount)
    })

    it(`actual total (lines + no-line row) equals counted GL postings (${period.kind})`, () => {
      const r = buildReport(EMPTY_FILTER, period, 'none', BC)
      expect(r.total.actual).toBe(r.linesTotal.actual + r.noLine.amount)
      expect(r.total.actual).toBe(countedGL(EMPTY_FILTER, period, BC))
    })
  }

  it('the tie holds under any single filter', () => {
    const filters = [{ ...EMPTY_FILTER, depts: ['OP'] }, { ...EMPTY_FILTER, projects: ['PA'] }, { ...EMPTY_FILTER, classes: ['Capex' as const] }]
    for (const f of filters) expect(buildReport(f, YTD, 'none', BC).total.actual).toBe(countedGL(f, YTD, BC))
  })

  it('no-line bill and reclass journal show on their own rows (FG6-AC4, LR-4)', () => {
    const r = buildReport(EMPTY_FILTER, YTD, 'none', BC)
    expect(r.noLine.amount).toBe(4 * jt)
    expect(r.noLine.postings.map((p) => p.docNo)).toEqual(['PI-2026-0790'])
    expect(r.notCounted.postings.map((p) => p.docNo)).toEqual(['JE-2026-0318'])
    expect(r.notCounted.amount).toBe(1_000 * jt)
    expect(drillPostings(r.noLine.postings)[0]!.amount).toBe(4 * jt)
  })

  it('values in one dimension OR, dimensions AND (FG6-AC2)', () => {
    const r = buildReport({ ...EMPTY_FILTER, depts: ['NW'], projects: ['PA'] }, YTD, 'none', BC)
    expect(r.rows.length).toBe(4)
    expect(r.rows.every((x) => x.title.startsWith('Networking × Project A'))).toBe(true)
    const or = buildReport({ ...EMPTY_FILTER, projects: ['PA', null] }, YTD, 'none', BC)
    expect(or.rows.some((x) => x.title.includes('(no project)'))).toBe(true)
    expect(or.rows.some((x) => x.title.includes('Project B'))).toBe(false)
  })

  it('group subtotals equal the sum of their lines and add up to the total', () => {
    for (const by of ['dept', 'project', 'account', 'class'] as const) {
      const r = buildReport(EMPTY_FILTER, YTD, by, BC)
      let grand = zeroFigures()
      for (const g of r.groups) {
        const sum = g.rows.reduce((s, x) => addFigures(s, x.figures), zeroFigures())
        for (const k of FIGURE_KEYS) expect(g.totals[k]).toBe(sum[k])
        grand = addFigures(grand, g.totals)
      }
      for (const k of FIGURE_KEYS) expect(grand[k]).toBe(r.linesTotal[k])
    }
  })

  it('a filter with no match returns no rows and zero totals', () => {
    const r = buildReport({ ...EMPTY_FILTER, depts: ['IT'], projects: ['PA'] }, YTD, 'none', BC)
    expect(r.rows).toEqual([])
    for (const k of FIGURE_KEYS) expect(r.total[k]).toBe(0)
  })

  it('drill: documents behind reserved, committed and actual sum to the cell (FG6-AC7)', () => {
    const row = buildReport(EMPTY_FILTER, YTD, 'none', BC).rows.find((x) => x.lineId === ACC_PA())!
    for (const fig of ['reserved', 'committed', 'actual'] as const) {
      const docs = drillLine(ACC_PA(), fig, YTD, BC)
      expect(docs.reduce((s, d) => s + d.amount, 0)).toBe(row.figures[fig])
    }
    const reserved = drillLine(ACC_PA(), 'reserved', YTD, BC)
    expect(reserved.map((d) => d.docNo).sort()).toEqual(['#90131', '#90138'])
    expect(reserved.every((d) => d.link?.startsWith('/purchase-requests/'))).toBe(true)
    expect(drillLine(ACC_PA(), 'committed', YTD, BC).map((d) => d.docNo)).toEqual(['PO-2026-0398'])
    // A viewer without access to purchase requests sees number and amount only.
    expect(drillLine(ACC_PA(), 'reserved', YTD, 'AP Staff').every((d) => d.link === null)).toBe(true)
  })

  it('idle 90+ days shows the open commitment of PO-1102', () => {
    const r = buildReport(EMPTY_FILTER, YTD, 'none', BC)
    expect(r.total.idle).toBe(12 * jt)
  })

  it('a department head sees only their department; the URL cannot widen it (FG6-AC6)', () => {
    const head: BudgetRole = 'Budget holder (Networking)'
    const own = buildReport(EMPTY_FILTER, YTD, 'none', head)
    expect(own.rows.length).toBeGreaterThan(0)
    expect(own.rows.every((x) => x.title.startsWith('Networking'))).toBe(true)
    expect(own.noLine.amount).toBe(0)
    const widened = buildReport({ ...EMPTY_FILTER, depts: ['OP'] }, YTD, 'none', head)
    expect(widened.rows).toEqual([])
    expect(widened.total.actual).toBe(0)
    expect(effectiveFilter({ ...EMPTY_FILTER, depts: ['NW', 'OP'] }, head).depts).toEqual(['NW'])
    expect(filterOptions(head).depts.map((d) => d.value)).toEqual(['NW'])
  })

  it('URL query round-trips filters, period and grouping', () => {
    const state = { period: { kind: 'month' as const, month: 8 }, groupBy: 'project' as const, filter: { depts: ['NW'], projects: ['PA', null], accounts: ['6-60120'], classes: ['Opex' as const] } }
    const q = toReportQuery(state)
    expect(q).toEqual({ period: 'month', month: '9', group: 'project', dept: 'NW', project: 'PA,none', account: '6-60120', class: 'Opex' })
    expect(parseReportQuery(q)).toEqual(state)
    expect(parseReportQuery({})).toEqual({ period: DEFAULT_PERIOD, groupBy: 'none', filter: EMPTY_FILTER })
  })

  it('only the Budget Controller can run the tie-out; a gap names the lines', () => {
    expect(runTieOutAs('CFO').ok).toBe(false)
    const before = budget.tieOuts.length
    expect(runTieOutAs(BC).ok).toBe(true)
    expect(budget.tieOuts.length).toBe(before + 1)
    expect(budget.tieOuts[0]!.failures).toEqual([])
    // Break the tie: a GL posting the ledger never saw.
    budget.gl.push({ id: 999999, lineId: ACC_PA(), account: '6-60120', dept: 'NW', project: 'PA', month: 9, amount: 1 * jt, source: 'Manual journal', docNo: 'JE-X', counted: true })
    const run = runTieOut()
    expect(run.failures.map((f) => f.lineId)).toEqual([ACC_PA()])
  })
})
