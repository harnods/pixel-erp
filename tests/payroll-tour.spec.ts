import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  payroll, runs, runStatus, runHolds, draftOf, draftReview, runWarnings, headcountChanges, liveJournals, journalTotals,
  payablesTracker, amendmentTasks, accountLabel, suggestMapping, postRun, postConfirmText, correctionOf, correctionNotice,
  currentVersionOf, staffRows, pph21Month, rupiah, dateLabel, sourceSummary, noticesFor,
} from '../app/data/payrollStore'
import { ACC } from '../app/data/payrollMaster'
import { PAYROLL_TOUR, PAYROLL_TOURS, PAYROLL_TOUR_MARKERS, TOUR_WORK, tourCtx, sepId, SEP_KEY, SEP_MONTH, SEP_LABEL, NEW_ITEM } from '../app/tours/payrollTours'

const copyOf = (i: number) => { const s = PAYROLL_TOUR.steps[i]!; return `${s.title} ${s.body} ${s.watch ?? ''}` }
const allCopy = [PAYROLL_TOUR.blurb, PAYROLL_TOUR.closing, ...PAYROLL_TOUR.steps.map((_, i) => copyOf(i))].join(' ')
/** Every Rp figure the copy quotes; each must be proved by a step below. */
const quoted = new Set([...allCopy.matchAll(/[+-]?Rp[\d.]*\d/g)].map((m) => m[0]))
const proved = new Set<string>()
/** Assert the engine's figure and that step i quotes it (signed when `sign`). */
function q(i: number, n: number, expected: number, sign = false) {
  expect(n).toBe(expected)
  const s = (sign && n > 0 ? '+' : '') + rupiah(n)
  expect(copyOf(i), `step ${i + 1} quotes ${s}`).toContain(s)
  proved.add(s)
}
const net = (lines: { account: string; debit: number; credit: number }[], acct: string) => lines.filter((l) => l.account === acct).reduce((s, l) => s + l.credit - l.debit, 0)
const sep = () => runs.value.find((r) => r.key === SEP_KEY)!

/** Replays PAY-1's auto-play work through the payroll engine; every figure the tour quotes must hold. */
describe('PAY-1 guided tour (auto-play)', () => {
  beforeEach(() => PAYROLL_TOUR.onReset!())

  it('is the one payroll tour, reached from the Guided tours menu', async () => {
    expect(PAYROLL_TOURS.map((t) => [t.id, t.code])).toEqual([['payroll-narrative', 'PAY-1']])
    const { TOUR_GROUPS, orderedGroups } = await import('../app/tours/tourRegistry')
    expect(TOUR_GROUPS.find((g) => g.key === 'payroll')!.tours).toEqual([PAYROLL_TOUR])
    expect(orderedGroups('/payroll-inbox')[0]!.tours[0]!.code).toBe('PAY-1')
  })

  it('ten steps; every step after the first does its own work and asks the reader for nothing', () => {
    expect(PAYROLL_TOUR.steps).toHaveLength(10)
    expect(TOUR_WORK.map((w) => !!w)).toEqual([false, true, true, true, true, true, true, true, true, true])
    expect(PAYROLL_TOUR.steps.every((s) => !s.action)).toBe(true)
    expect(PAYROLL_TOUR.steps.map((s) => s.role ?? '')).toEqual(['Accountant', '', '', '', '', '', '', 'Tax Staff', '', 'Accountant'])
  })

  it('every step lands on a payroll route and one of the agreed payroll markers', () => {
    PAYROLL_TOUR.onReset!()
    for (const s of PAYROLL_TOUR.steps) {
      expect(PAYROLL_TOUR_MARKERS as readonly string[], s.title).toContain(s.target)
      const route = typeof s.route === 'function' ? s.route() : s.route!
      expect(route).toMatch(/^\/payroll-(inbox|payables|settings|runs\/run\d+)(\?.*)?$/)
    }
  })

  /**
   * The screen branches add these markers; until they merge this check fails, and so does the
   * asset-tours check that every tour target is on a product screen. Skipped until then.
   */
  it('every marker the tour uses is on a payroll screen', () => {
    const root = resolve(__dirname, '..', 'app', 'components')
    const src = ['pages', 'payroll'].flatMap((d) => readdirSync(join(root, d)).filter((f) => /^Payroll.*\.vue$/.test(f)).map((f) => readFileSync(join(root, d, f), 'utf8'))).join('\n')
    const markers = new Set([...src.matchAll(/ data-tour="([^"]+)"/g)].map((m) => m[1]!))
    for (const s of PAYROLL_TOUR.steps) expect(markers, s.title).toContain(s.target)
  })

  it('copy follows the house rules', () => {
    expect(allCopy).not.toMatch(/\u2014|\bMVP\b|prototype|\bengine\b|undefined|NaN|\bsimulat/i)
    // The demo never narrates its own clicks, and never asks the reader to act.
    expect(allCopy).not.toMatch(/\bthe tour\b|\bclick\b|\bpress\b/i)
  })

  it('replays the narrative with the quoted figures', () => {
    const at = (i: number) => { PAYROLL_TOUR.applyRole!(PAYROLL_TOUR.steps.slice(0, i + 1).map((s) => s.role).filter(Boolean).pop()!); TOUR_WORK[i]?.() }
    const run = sep()
    expect(sepId()).toBe(run.id)

    // 1. Inbox: September held on the new pay item; July and August posted and paid.
    at(0)
    expect(runStatus(run)).toBe('Held')
    const hold = runHolds(run)
    expect(hold.map((h) => h.code)).toEqual(['unmapped-item'])
    expect(hold[0]!.message).toBe('1 pay item has no account: Insentif Penjualan (allowance), Rp10.500.000, 7 employees')
    expect(copyOf(0)).toContain(`${SEP_LABEL} is Held: ${hold[0]!.message}`)
    proved.add('Rp10.500.000')
    expect(postRun(run.id).ok).toBe(false)
    expect(draftOf(run)).toBeNull()
    for (const m of ['2026-07', '2026-08']) {
      const rows = payablesTracker(m)
      expect(rows.length).toBeGreaterThan(0)
      expect(rows.every((r) => r.balance === 0 && r.status === 'Paid'), m).toBe(true)
    }

    // 2. Map from the hold: the hold clears on its own and the draft builds.
    const sug = suggestMapping(NEW_ITEM, 'allowance')!
    expect([sug.role, accountLabel(sug.debit), accountLabel(sug.credit)]).toEqual(['Earning', '6-60101 Salaries', '2-20201 Salaries Payable'])
    expect(copyOf(1)).toContain('Earning, debit Salaries, credit Salaries Payable')
    at(1)
    expect(runHolds(run)).toHaveLength(0)
    expect(runStatus(run)).toBe('Ready to post')
    const d = draftOf(run)!
    q(1, journalTotals(d).debit, 554_203_941)
    expect(d.lines).toHaveLength(26)
    expect(copyOf(1)).toContain('26 lines')
    const sum = sourceSummary(run.id)!
    q(1, sum.takeHome, 446_901_849)
    expect(sum.headcount).toBe(40)
    expect(copyOf(1)).toContain('40 staff')

    // 3. Draft review: large changes and headcount warned, none blocks Post; all acknowledged.
    const before = runWarnings(run.id)
    expect(before.map((w) => w.code)).toEqual(['large-change', 'large-change', 'large-change', 'large-change', 'headcount'])
    const hc = headcountChanges(run.id)
    expect(hc.previous!.label).toBe('21 Jul-20 Aug 2026')
    expect([hc.last, hc.current]).toEqual([40, 40])
    expect(hc.left).toEqual(['EMP-0038'])
    expect(hc.joined).toEqual(['EMP-0041'])
    expect(hc.moved).toEqual([{ employee_id: 'EMP-0035', user_id: 51035, from: 'Sales, Jakarta HQ', to: 'Sales, Surabaya' }])
    const grp = (label: string) => hc.groups.find((g) => g.label === label)!
    expect(grp('Sales, Surabaya').left).toEqual(['EMP-0038'])
    expect(grp('Sales, Bandung').joined).toEqual(['EMP-0041'])
    for (const text of ['EMP-0038 left Sales, Surabaya', 'EMP-0041 joined Sales, Bandung', 'EMP-0035 moved from Sales, Jakarta HQ to Sales, Surabaya']) expect(copyOf(2)).toContain(text)
    expect(payroll.settings.limits.largeChangePct).toBe(10)
    expect(copyOf(2)).toContain('more than 10% and Rp1.000.000')
    q(2, payroll.settings.limits.largeChangeAmount, 1_000_000)
    const large = draftReview(run.id).changes.filter((c) => c.flag)
    const diffOf = (label: string) => large.find((c) => c.label === label)!.diff
    q(2, diffOf('6-60004 Sales Salaries | Sales, Bandung'), 14_846_600)
    q(2, -diffOf('6-60004 Sales Salaries | Sales, Jakarta HQ'), 8_373_400)
    q(2, diffOf('6-60004 Sales Salaries | Sales, Surabaya'), 3_616_560)
    q(2, -diffOf('2-20501 Tax Payable - PPh 21'), 1_678_971)
    expect(large).toHaveLength(4)
    at(2)
    const rv = draftReview(run.id)
    expect(rv.unexpectedHeadcount).toBe(0)
    expect(rv.unacknowledged).toBe(0)
    expect(runWarnings(run.id).filter((w) => w.code === 'large-change').every((w) => !!w.acknowledged)).toBe(true)
    expect(copyOf(2)).toContain('All 4 are acknowledged and the 3 headcount changes are Expected')
    expect(postConfirmText(run.id).warnings).toEqual([])

    // 4. Post: one PAY journal, one payable line per party.
    at(3)
    const live = liveJournals(run.id)
    expect(live).toHaveLength(1)
    const j = live[0]!
    expect([j.number, j.type]).toEqual(['PAY-0003', 'Payroll'])
    expect(dateLabel(j.date)).toBe('20 Sep 2026')
    q(3, journalTotals(j).debit, 554_203_941)
    const parties: [string, number][] = [[ACC.hutangGaji, 446_901_849], [ACC.pph21, 18_323_082], [ACC.pph26, 21_209_400], [ACC.bpjsKes, 16_097_029], [ACC.bpjsTk, 38_969_133], [ACC.dplk, 9_300_000]]
    for (const [acct, amt] of parties) {
      expect(j.lines.filter((l) => l.account === acct && l.credit > 0)).toHaveLength(1)
      q(3, net(j.lines, acct), amt)
    }
    const costs = j.lines.filter((l) => l.debit > 0).map((l) => `${accountLabel(l.account)} | ${Object.values(l.tags).filter(Boolean).join(', ')}`)
    expect(costs).toContain('5-50101 Direct Labour | Operations, Bandung')
    expect(costs).toContain('6-60004 Sales Salaries | Sales, Surabaya')

    // 5. Bank reconciliation matches the salary transfer; the payable is paid.
    at(4)
    const sal5 = payablesTracker(SEP_MONTH).find((r) => r.label === `Salary ${SEP_LABEL}`)!
    q(4, sal5.owed, 446_901_849); q(4, sal5.paid, 446_901_849); q(4, sal5.balance, 0)
    expect(sal5.status).toBe('Paid')
    expect(sal5.flags).toEqual([])
    expect(sal5.payments.map((p) => [p.number, p.bank, dateLabel(p.date)])).toEqual([['BNK-0013', '1-10004 Bank BCA', '25 Sep 2026']])
    expect(copyOf(4)).toContain('by BNK-0013 from Bank BCA on 25 Sep 2026')
    const bnk = payroll.journals.find((x) => x.number === 'BNK-0013')!
    expect([bnk.type, bnk.source]).toEqual(['Salary payment', 'Bank reconciliation'])

    // 6. Talenta re-sends September: v2 is current, the correction is built and summarised.
    at(5)
    expect(runStatus(run)).toBe('Correction ready')
    expect([run.currentVersion, run.ledgerVersion]).toEqual([2, 1])
    const corr = correctionOf(run.id)!
    const s = corr.summary
    q(5, s.takeHome.change, 1_732_959, true)
    q(5, s.pph21.change, 197_041, true)
    q(5, s.pph26.change, 0)
    q(5, s.bpjs.change, 244_800, true)
    expect([s.joined, s.left]).toEqual([[], []])
    expect(s.amountChanged).toEqual(['EMP-0029', 'EMP-0030', 'EMP-0031', 'EMP-0032'])
    const orgOf = new Map(staffRows(currentVersionOf(run)!.payload).map((e) => [e.employee_id, e.organization_name]))
    expect(s.amountChanged.every((id) => orgOf.get(id) === 'Human Capital')).toBe(true)
    expect(copyOf(5)).toContain('EMP-0029 to EMP-0032 in Human Capital')
    const notice = correctionNotice(run, s)
    expect(copyOf(5)).toContain(notice)
    expect(noticesFor('Accountant').some((n) => n.text === notice)).toBe(true)
    q(5, corr.lines.reduce((x, l) => x + l.debit, 0), 2_199_800)
    expect(corr.lines).toHaveLength(7)
    expect(copyOf(5)).toContain('on 7 lines')
    expect(liveJournals(run.id).map((x) => x.number)).toEqual(['PAY-0003'])

    // 7. Post correction: one Correction journal with the difference; the ledger holds v2.
    at(6)
    const live7 = liveJournals(run.id)
    expect(live7.map((x) => [x.number, x.type])).toEqual([['PAY-0003', 'Payroll'], ['PAY-0004', 'Correction']])
    q(6, journalTotals(live7[1]!).debit, 2_199_800)
    expect(net(live7[1]!.lines, ACC.hutangGaji)).toBe(1_732_959)
    expect(run.ledgerVersion).toBe(2)
    expect(runStatus(run)).toBe('Posted')
    const sal7 = payablesTracker(SEP_MONTH).find((r) => r.label === `Salary ${SEP_LABEL}`)!
    q(6, sal7.owed, 448_634_808)
    q(6, sal7.balance, 1_732_959)

    // 8. Tax Staff: the amendment task, and the PPh 21 deposit matched by the bank.
    at(7)
    expect(payroll.viewAs).toBe('Tax Staff')
    const task = amendmentTasks.value.find((t) => t.taxMonth === SEP_MONTH)!
    expect(task.title).toBe('Amend e-Bupot 21/26 for Sep 2026')
    expect(task.summary).toBe('4 staff changed, period total change Rp197.041')
    expect(task.depositGap).toBe('Deposit matches')
    for (const t of [task.title, task.summary, task.depositGap]) expect(copyOf(7)).toContain(t)
    q(7, task.periodChange, 197_041)
    q(7, pph21Month(SEP_MONTH).paid, 18_520_123)

    // 9. Tax Staff type the e-Bupot filed total on Payables; it matches the books.
    at(8)
    const pm = pph21Month(SEP_MONTH)
    q(8, pm.books, 18_520_123)
    expect(pm.filed!.filed).toBe(18_520_123)
    expect(pm.filed!.by).toBe('Putri Maharani')
    expect(pm.flagged).toBe(false)
    const row = payablesTracker(SEP_MONTH).find((r) => r.account === ACC.pph21)!
    expect(row.label).toBe('Tax Payable - PPh 21 Sep 2026')
    expect(copyOf(8)).toContain(row.label)
    q(8, row.owed, 18_520_123); q(8, row.paid, 18_520_123); q(8, row.balance, 0)
    expect(row.ebupot).toMatchObject({ filed: 18_520_123, books: 18_520_123, difference: 0 })
    q(8, row.ebupot!.difference, 0)
    expect(row.flags).toEqual([])
    q(8, payroll.settings.limits.taxTolerance, 1_000)
    expect(amendmentTasks.value.find((t) => t.id === task.id)!.status).toBe('Not filed yet')

    // 10. The old Talenta Expense sync is blocked.
    at(9)
    const call = payroll.oldSync.at(-1)!
    expect(call).toMatchObject({ date: '2026-09-20', pattern: 'Payroll', outcome: 'Blocked', message: 'Payroll for Sep 2026 is already in Jurnal. The old sync was blocked.' })
    q(9, call.amount, 480_000_000)
    expect(payroll.settings.cutover.firstLive).toBe('2026-07')
    expect(copyOf(9)).toContain('Jul 2026')

    // Every Rp figure in the copy was proved above.
    expect([...quoted].filter((x) => !proved.has(x))).toEqual([])
  })

  it('reset clears the previous run', () => {
    expect(sepId()).not.toBe('')
    TOUR_WORK[1]!()
    expect(tourCtx.runId).not.toBe('')
    expect(runStatus(sep())).toBe('Ready to post')
    PAYROLL_TOUR.onReset!()
    expect(tourCtx.runId).toBe('')
    expect(runStatus(sep())).toBe('Held')
    expect(payroll.viewAs).toBe('Accountant')
  })
})
