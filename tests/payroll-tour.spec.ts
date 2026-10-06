import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  payroll, runs, runStatus, runHolds, draftOf, draftReview, whyLine, liveJournals, journalTotals, journalById,
  payablesTracker, compareVersions, amendmentTasks, pph21Monthly, independentChecks, reconciliation, accountLabel, tagsLabel,
  postRun, rupiah, dateLabel, sourceSummary,
} from '../app/data/payrollStore'
import { ACC } from '../app/data/payrollMaster'
import { reconView } from '../app/data/payrollUiRecon'
import { PAYROLL_TOUR, PAYROLL_TOURS, TOUR_WORK, tourCtx, sepId, SEP_KEY, SEP_MONTH, NEW_ITEM, BILLING_CODE, NTPN } from '../app/tours/payrollTours'

const copyOf = (i: number) => { const s = PAYROLL_TOUR.steps[i]!; return `${s.title} ${s.body} ${s.watch ?? ''}` }
const allCopy = [PAYROLL_TOUR.blurb, PAYROLL_TOUR.closing, ...PAYROLL_TOUR.steps.map((_, i) => copyOf(i))].join(' ')
/** Every Rp figure the copy quotes; each must be proved by a step below. */
const quoted = new Set([...allCopy.matchAll(/Rp[\d.]+\d/g)].map((m) => m[0]))
const proved = new Set<string>()
/** Assert the engine's figure and that step i quotes it. */
function q(i: number, n: number, expected: number) {
  expect(n).toBe(expected)
  const s = rupiah(n)
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

  it('eleven steps; every step after the first does its own work and asks the reader for nothing', () => {
    expect(PAYROLL_TOUR.steps).toHaveLength(11)
    expect(TOUR_WORK.map((w) => !!w)).toEqual([false, true, false, true, true, true, true, true, true, true, true])
    expect(PAYROLL_TOUR.steps.every((s) => !s.action)).toBe(true)
    const roles = ['Jurnal Owner', 'Accountant', 'Finance Manager', 'Tax Staff', 'Auditor']
    for (const s of PAYROLL_TOUR.steps) if (s.role) expect(roles).toContain(s.role)
    expect(PAYROLL_TOUR.steps.map((s) => s.role ?? '')).toEqual(['Accountant', '', '', 'Finance Manager', 'Accountant', '', '', '', 'Tax Staff', 'Finance Manager', 'Accountant'])
  })

  it('every step lands on a payroll route and a marker a product screen carries', () => {
    const root = resolve(__dirname, '..', 'app', 'components')
    const src = ['pages', 'payroll'].flatMap((d) => readdirSync(join(root, d)).filter((f) => /^Payroll.*\.vue$/.test(f)).map((f) => readFileSync(join(root, d, f), 'utf8'))).join('\n')
    const markers = new Set([...src.matchAll(/ data-tour="([^"]+)"/g)].map((m) => m[1]!))
    PAYROLL_TOUR.onReset!()
    for (const s of PAYROLL_TOUR.steps) {
      expect(markers, s.title).toContain(s.target)
      const route = typeof s.route === 'function' ? s.route() : s.route!
      expect(route).toMatch(/^\/payroll-(inbox|payables|reconciliation|settings|runs\/run\d+)(\?.*)?$/)
    }
  })

  it('copy follows the house rules', () => {
    expect(allCopy).not.toMatch(/\u2014|\bMVP\b|prototype|\bengine\b|undefined|NaN/)
  })

  it('replays the narrative with the quoted figures', () => {
    const at = (i: number) => { PAYROLL_TOUR.applyRole!(PAYROLL_TOUR.steps.slice(0, i + 1).map((s) => s.role).filter(Boolean).pop()!); TOUR_WORK[i]?.() }
    const run = sep()
    expect(sepId()).toBe(run.id)

    // 1. Inbox: September held on the new pay item; July and August posted and signed off.
    at(0)
    expect(runStatus(run)).toBe('Held')
    expect(runHolds(run)[0]!.message).toBe('1 pay item has no account: Insentif Penjualan (allowance), Rp10.500.000, 7 employees')
    expect(copyOf(0)).toContain(runHolds(run)[0]!.message)
    proved.add('Rp10.500.000')
    expect(postRun(run.id).ok).toBe(false)
    expect(draftOf(run)).toBeNull()
    for (const m of ['2026-07', '2026-08']) expect(reconciliation(m).status).toBe('Signed off')

    // 2. Map from the hold: hold clears, draft builds.
    at(1)
    expect(runHolds(run)).toHaveLength(0)
    expect(runStatus(run)).toBe('Ready to post')
    const d = draftOf(run)!
    q(1, journalTotals(d).debit, 554_203_937)
    expect(d.lines).toHaveLength(26)
    expect(copyOf(1)).toContain('26 lines')
    const sum = sourceSummary(run.id)!
    q(1, sum.takeHome, 446_901_857)
    expect(sum.headcount).toBe(40)

    // 3. Draft review: totals tie, large changes flagged, Why this line.
    at(2)
    const rv = draftReview(run.id)
    const [alw, ded, ben] = rv.talentaTotals
    q(2, alw!.talenta, 505_668_948); expect(alw!.gap).toBe(0)
    q(2, ben!.talenta, 9_300_000); expect(ben!.gap).toBe(0)
    expect(Math.abs(ded!.gap)).toBe(1)
    expect(copyOf(2)).toContain('Rp1 apart')
    const flagged = rv.changes.filter((c) => c.flag)
    expect(flagged).toHaveLength(3)
    const sb = flagged.find((c) => c.account === ACC.salesSalaries && c.tags.Organization === 'Sales' && c.tags.Branch === 'Bandung')!
    q(2, Math.abs(sb.new) - Math.abs(sb.old), 14_846_600)
    q(2, Math.abs(sb.new), 36_115_400)
    expect(payroll.settings.limits.largeChangePct).toBe(10)
    q(2, payroll.settings.limits.largeChangeAmount, 1_000_000)
    q(2, payroll.settings.limits.roundingTolerance, 1_000)
    const idx = d.lines.findIndex((l) => l.account === ACC.salesSalaries && tagsLabel(l.tags) === 'Sales, Bandung')
    const why = whyLine(run.id, idx)!
    const src = why.sources.find((s) => s.item === NEW_ITEM)!
    q(2, src.amount, 4_500_000)
    expect(src.employees).toBe(3)
    expect(why.why.join(' ')).toContain('Rule "Sales team to sales salaries" sets 6-60004 Sales Salaries')

    // 4. Finance Manager confirm: posting is refused until then.
    const refused = postRun(run.id)
    expect(refused.needsConfirm).toBe(true)
    at(3)
    expect(d.fmConfirmedBy).toBe('Bambang Sutrisno')

    // 5. Post: one PAY journal, one payable line per party.
    at(4)
    const live = liveJournals(run.id)
    expect(live).toHaveLength(1)
    const j = live[0]!
    expect(j.number).toBe('PAY-0003')
    expect(dateLabel(j.date)).toBe('20 Sep 2026')
    q(4, journalTotals(j).debit, 554_203_937)
    const parties: [string, number][] = [[ACC.hutangGaji, 446_901_857], [ACC.pph21, 18_323_082], [ACC.pph26, 21_209_400], [ACC.bpjsKes, 16_097_025], [ACC.bpjsTk, 38_969_125]]
    for (const [acct, amt] of parties) {
      expect(j.lines.filter((l) => l.account === acct && l.credit > 0)).toHaveLength(1)
      q(4, net(j.lines, acct), amt)
    }
    expect(j.lines.some((l) => l.account === ACC.directLabour)).toBe(true)

    // 6. Salary paid from Salaries Payable.
    at(5)
    const rows6 = payablesTracker(SEP_MONTH)
    const sal = rows6.find((r) => r.label === 'Salary 21 Aug-20 Sep 2026')!
    q(5, sal.owed, 446_901_857); q(5, sal.paid, 446_901_857); q(5, sal.balance, 0)
    expect(payroll.payments.at(-1)!.bank).toBe(ACC.bca)
    expect(accountLabel(ACC.bca)).toBe('1-10004 Bank BCA')
    const pph6 = rows6.find((r) => r.account === ACC.pph21)!
    q(5, pph6.balance, 18_323_082)
    expect(pph6.dueLabel).toBe('15 Oct 2026')

    // 7. Talenta re-sends: revision or separate run.
    at(6)
    expect(runStatus(run)).toBe('Waiting for your choice')
    const choice = runHolds(run)[0]!
    expect(choice.code).toBe('choice')
    expect((choice.details as { overlapPct: number }).overlapPct).toBe(100)

    // 8. Compare v1 and v2, post the difference; the ledger reflects v2.
    const cmp = compareVersions(run.id, 1, 2)
    const bs = cmp.byPayItem.find((r) => r.name === 'Basic Salary')!
    q(7, bs.diff, 2_000_000)
    expect(cmp.byAccountTag.filter((r) => r.diff > 0).every((r) => r.label.includes('Human Capital'))).toBe(true)
    at(7)
    const live8 = liveJournals(run.id)
    expect(live8.map((x) => [x.number, x.type])).toEqual([['PAY-0003', 'Payroll'], ['PAY-0004', 'Difference']])
    const diff = live8[1]!
    q(7, journalTotals(diff).debit, 2_199_800)
    q(7, net(diff.lines, ACC.hutangGaji), 1_732_959)
    q(7, net(diff.lines, ACC.pph21), 197_041)
    expect(run.ledgerVersion).toBe(2)
    expect(runStatus(run)).toBe('Posted')

    // 9. Tax Staff: amendment task, PPh 21 paid with billing code and NTPN, e-Bupot total.
    at(8)
    const task = amendmentTasks.value.find((t) => t.taxMonth === SEP_MONTH)!
    expect(task.title).toBe('Amend e-Bupot 21/26 for Sep 2026')
    expect(task.summary).toBe('4 staff changed, period total change Rp197.041')
    expect(copyOf(8)).toContain(task.title)
    expect(copyOf(8)).toContain(task.summary)
    expect(task.depositGap).toBe('Deposit matches')
    const pay = payroll.payments.at(-1)!
    expect(pay.periods[0]).toMatchObject({ month: SEP_MONTH, billingCode: BILLING_CODE, ntpn: NTPN })
    expect(pay.warnings).toEqual([])
    q(8, pay.amount, 18_520_123)
    const pm = pph21Monthly(SEP_MONTH)
    q(8, pm.ebupotFiled!, 18_520_123)
    expect(pm.filedMessage).toBeNull()
    expect(pm.reconciled?.by).toBe('Putri Maharani')

    // 10. Reconciliation: five checks at Rp0, HR confirmation, sign-off.
    at(9)
    const checks = independentChecks(SEP_MONTH)
    expect(checks.map((c) => [c.id, c.difference, c.status])).toEqual([['thp', 0, 'Matches'], ['pph21', 0, 'Matches'], ['bpjs', -1, 'Matches'], ['bank', 0, 'Matches'], ['expense', 0, 'Matches']])
    const by = Object.fromEntries(checks.map((c) => [c.id, c.ledger!]))
    q(9, by.thp!, 448_634_816); q(9, by.pph21!, 18_520_123); q(9, by.bpjs!, 55_310_950); q(9, by.bank!, 448_634_816); q(9, by.expense!, 555_050_289)
    q(9, -checks.find((c) => c.id === 'bpjs')!.difference!, 1)
    q(9, payroll.settings.limits.gapTolerance, 1_000)
    q(9, payroll.payments.filter((x) => x.kind === 'Salary' && x.runId === run.id).at(-1)!.amount, 1_732_959)
    q(9, checks.find((c) => c.id === 'thp')!.difference!, 0)
    const rec = reconView(SEP_MONTH)
    expect(rec.status).toBe('Signed off')
    expect(rec.signOff!.by).toBe('Bambang Sutrisno')
    expect(rec.signOff!.hrConfirmedBy).toBe('Bambang Sutrisno')
    expect(rec.unexplained).toBe(0)

    // 11. The old Talenta Expense sync is blocked.
    at(10)
    const call = payroll.oldSync.at(-1)!
    expect(call).toMatchObject({ date: '2026-09-20', pattern: 'Payroll', outcome: 'Blocked', message: 'Payroll for Sep 2026 is already in Jurnal. The old sync was blocked.' })
    q(10, call.amount, 480_000_000)
    expect(payroll.settings.cutover.firstLive).toBe('2026-07')

    // Every Rp figure in the copy was proved above.
    expect([...quoted].filter((s) => !proved.has(s))).toEqual([])
  })

  it('reset clears the previous run', () => {
    TOUR_WORK[1]!()
    expect(sepId()).not.toBe('')
    expect(tourCtx.runId).not.toBe('')
    PAYROLL_TOUR.onReset!()
    expect(tourCtx.runId).toBe('')
    expect(runStatus(sep())).toBe('Held')
    expect(payroll.viewAs).toBe('Accountant')
  })
})
