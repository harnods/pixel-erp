import { describe, it, expect, beforeEach } from 'vitest'
import {
  payroll, resetPayroll, runs, runById, runStatus, runHolds, currentVersionOf, versionLabel, draftOf, liveJournals,
  journalTotals, journalById, simulateSend, setPayrollViewAs, setPayItemMapping, payItemKey, postRun, confirmPostAsFinanceManager,
  isDraftStale, setPayday, chooseRevision, postDifference, reverseJournal, reverseAndRepost, lockPeriod, decidePartial,
  totalGaps, releaseTaxHold, pph21Monthly, independentChecks, reconciliation, accrualFor, compareVersions, can,
  amendmentTasks, syncLog, type Run, type JournalLine,
} from '../app/data/payrollStore'
import { ACC, buildSalaryDetail } from '../app/data/payrollMaster'

const SEP = '1212 / monthly / 2026-08-21 / 2026-09-20'
const AUG = '1212 / monthly / 2026-07-21 / 2026-08-20'
const INS = { name: 'Insentif Penjualan', organization: 'Sales', amount: 1_500_000 }
const run = (key: string) => runs.value.find((r) => r.key === key)!
const as = <T>(role: Parameters<typeof setPayrollViewAs>[0], fn: () => T): T => { const p = payroll.viewAs; setPayrollViewAs(role); try { return fn() } finally { setPayrollViewAs(p) } }
const thpOf = (r: Run, no?: number) => Math.round(r.versions.find((v) => v.no === (no ?? r.ledgerVersion ?? r.currentVersion))!.payload.employees.reduce((s, e) => s + e.take_home_pay, 0))
const net = (lines: JournalLine[], acct: string) => lines.filter((l) => l.account === acct).reduce((s, l) => s + l.credit - l.debit, 0)
function netByKey(lines: JournalLine[]) {
  const m = new Map<string, number>()
  for (const l of lines) { const k = `${l.account}|${l.tags.Organization}|${l.tags.Branch}`; m.set(k, (m.get(k) ?? 0) + l.debit - l.credit) }
  for (const [k, v] of m) if (!v) m.delete(k)
  return m
}
/** Map the new September pay item so the seeded hold clears. */
function mapInsentif() {
  return as('Accountant', () => setPayItemMapping(payItemKey('Insentif Penjualan', 'allowance'), { role: 'Earning', debit: ACC.salesSalaries, credit: ACC.hutangGaji }))
}
function postSep() {
  mapInsentif()
  const r = run(SEP)
  as('Finance Manager', () => confirmPostAsFinanceManager(r.id))
  return as('Accountant', () => postRun(r.id))
}

describe('payroll engine (PRD FG-1 to FG-7, LR-1 to LR-14)', () => {
  beforeEach(() => { resetPayroll(); setPayrollViewAs('Accountant') })

  it('seed: Jul and Aug posted, paid and signed off; Sep held on one new pay item', () => {
    expect(runStatus(run('1212 / monthly / 2026-06-21 / 2026-07-20'))).toBe('Posted')
    expect(runStatus(run(AUG))).toBe('Posted')
    expect(reconciliation('2026-08').status).toBe('Signed off')
    expect(reconciliation('2026-07').status).toBe('Signed off')
    const sep = run(SEP)
    expect(runStatus(sep)).toBe('Held')
    expect(runHolds(sep).map((h) => h.code)).toEqual(['unmapped-item'])
    expect(runHolds(sep)[0]!.message).toBe('1 pay item has no account: Insentif Penjualan (allowance), Rp10.500.000, 7 employees')
    expect(payroll.journals.every((j) => journalTotals(j).debit === journalTotals(j).credit)).toBe(true)
  })

  it('LR-3: run key is company / period type / start / end; versions follow send time', () => {
    const sep = run(SEP)
    expect(sep.key).toBe(SEP)
    expect(sep.versions.map((v) => v.no)).toEqual([1])
    mapInsentif()
    expect(runStatus(sep)).toBe('Ready to post')
    const r = simulateSend('regular', { start: '2026-08-21', end: '2026-09-20', newAllowance: { ...INS, amount: 1_600_000 } })
    expect(r.versionNo).toBe(2)
    expect(sep.currentVersion).toBe(2)
    expect(versionLabel(sep, sep.versions[0]!)).toBe('Replaced by v2')
    const old = postRun(sep.id, { versionNo: 1 })
    expect(old.ok).toBe(false)
    expect(old.message).toBe('A newer version (v2) arrived. Review v2 before posting.')
    // A send older than the current version is rejected.
    const late = simulateSend('regular', { start: '2026-08-21', end: '2026-09-20', sentAt: '2026-09-22T00:00:00Z', newAllowance: { ...INS, amount: 1_700_000 } })
    expect(late.ok).toBe(false)
    expect(sep.versions).toHaveLength(2)
  })

  it('duplicate send is rejected and creates no version', () => {
    const before = run(SEP).versions.length
    const r = simulateSend('duplicate')
    expect(r.ok).toBe(false)
    expect(r.message).toBe('Duplicate of v1')
    expect(run(SEP).versions).toHaveLength(before)
    expect(syncLog.value[0]!.status).toBe('Failed')
    // Same figures with a new send time: "No change", no version.
    const p = buildSalaryDetail(payroll.roster, '2026-08-21', '2026-09-20', { sentAt: '2026-10-05T03:00:00Z', newAllowance: INS })
    expect(simulateSend('regular', { start: '2026-08-21', end: '2026-09-20', newAllowance: INS }).status).toBe('No change')
    expect(p.employees.length).toBeGreaterThan(0)
  })

  it('TN-01: a re-send with one branch holds as partial and keeps v1 current', () => {
    mapInsentif()
    const sep = run(SEP)
    const r = simulateSend('partial', { runId: sep.id, onlyBranch: 'Bandung' })
    expect(r.status).toBe('Held')
    const v2 = sep.versions[1]!
    expect(v2.state).toBe('partial')
    expect(v2.holds[0]!.message).toMatch(/^Looks partial: \d+ of 40 staff\. Finance, Human Capital, Jakarta HQ and Surabaya missing\.$/)
    expect(sep.currentVersion).toBe(1)
    expect(decidePartial(sep.id, 2, 'reject').ok).toBe(true)
    expect(sep.currentVersion).toBe(1)
    expect(runStatus(sep)).toBe('Ready to post')
  })

  it('OD-03: unmapped item holds, no draft builds; saving the mapping clears the hold', () => {
    const sep = run(SEP)
    expect(draftOf(sep)).toBeNull()
    expect(postRun(sep.id).ok).toBe(false)
    mapInsentif()
    expect(runHolds(sep)).toHaveLength(0)
    expect(draftOf(sep)).not.toBeNull()
  })

  it('OD-04: gaps add as absolute values; Rp1.000 goes to rounding, Rp1.001 holds', () => {
    mapInsentif()
    const send = (gaps: { employeeId: string; section: 'deduction'; amount: number }[]) =>
      simulateSend('regular', { start: '2026-08-21', end: '2026-09-20', newAllowance: INS, gaps })
    send([{ employeeId: 'EMP-0001', section: 'deduction', amount: 272_000 }, { employeeId: 'EMP-0002', section: 'deduction', amount: -272_000 }])
    const sep = run(SEP)
    expect(totalGaps(sep.id).bySection.deduction).toBe(544_000 * 100)
    expect(runHolds(sep).map((h) => h.code)).toEqual(['total-gap'])
    send([{ employeeId: 'EMP-0001', section: 'deduction', amount: 500 }, { employeeId: 'EMP-0002', section: 'deduction', amount: 500 }])
    expect(runHolds(sep)).toHaveLength(0)
    const d = draftOf(sep)!
    expect(d.lines.some((l) => l.account === ACC.rounding)).toBe(true)
    expect(net(d.lines, ACC.hutangGaji)).toBe(thpOf(sep, sep.currentVersion!))
    send([{ employeeId: 'EMP-0001', section: 'deduction', amount: 500 }, { employeeId: 'EMP-0002', section: 'deduction', amount: 501 }])
    expect(runHolds(sep).map((h) => h.code)).toEqual(['total-gap'])
    expect(runHolds(sep)[0]!.message).toContain('Rp1.001')
  })

  it('TS-05: posted journal balances, Hutang Gaji equals take-home pay, one payable line per party, dated on the end date', () => {
    const aug = run(AUG)
    const [j] = liveJournals(aug.id)
    expect(j!.date).toBe('2026-08-20')
    expect(j!.memo).toBe('Talenta payroll, monthly 2026-07-21 to 2026-08-20, version 1, sent 21 Aug 2026 10:00 WIB')
    expect(journalTotals(j!).debit).toBe(journalTotals(j!).credit)
    expect(net(j!.lines, ACC.hutangGaji)).toBe(thpOf(aug))
    for (const acct of [ACC.hutangGaji, ACC.pph21, ACC.pph26, ACC.bpjsKes, ACC.bpjsTk, ACC.dplk]) {
      const ls = j!.lines.filter((l) => l.account === acct && l.credit > 0)
      expect(ls).toHaveLength(1)
      expect(ls[0]!.tags).toEqual({ Organization: null, Branch: null })
    }
    // Expense lines add up by account and tag: no line per employee.
    expect(j!.lines.length).toBeLessThan(40)
    // The direct-labour rule moved store staff cost; DTP posts both sides.
    expect(j!.lines.some((l) => l.account === ACC.directLabour && l.tags.Organization === 'Operations')).toBe(true)
    expect(j!.lines.filter((l) => l.account === ACC.dtp).map((l) => l.debit > 0 ? 'D' : 'C').sort()).toEqual(['C', 'D'])
  })

  it('OD-06 / TN-10: two statutory parties on one payable block the save, and hold the draft when the payable has no label', () => {
    const r = setPayItemMapping(payItemKey('BPJSK Employee', 'deduction'), { credit: ACC.bpjsTk })
    expect(r.ok).toBe(false)
    expect(r.message).toBe('BPJS Ketenagakerjaan Payable is labelled BPJS Ketenagakerjaan. BPJSK Employee is owed to BPJS Kesehatan.')
    expect(setPayItemMapping(payItemKey('Loan Instalment', 'deduction'), { credit: ACC.salaries }).message).toBe('A loan cannot post to an expense account.')
    // An unlabelled liability takes both BPJS bodies: the draft holds.
    mapInsentif()
    expect(setPayItemMapping(payItemKey('BPJSK Employee', 'deduction'), { credit: ACC.accrued }).ok).toBe(true)
    expect(setPayItemMapping(payItemKey('JHT Employee', 'deduction'), { credit: ACC.accrued }).ok).toBe(true)
    const sep = run(SEP)
    // Settings changed: the draft is stale, Post rebuilds it and the rebuilt draft holds.
    expect(postRun(sep.id).stale).toBe(true)
    expect(runHolds(sep).map((h) => h.code)).toContain('two-parties')
    expect(runHolds(sep).find((h) => h.code === 'two-parties')!.message).toBe('Accrued Payroll holds BPJS Kesehatan and BPJS Ketenagakerjaan. Each party needs its own payable.')
    expect(postRun(sep.id).ok).toBe(false)
  })

  it('TN-06: a draft built on old settings cannot post; it rebuilds, then needs the Finance Manager confirm', () => {
    mapInsentif()
    const sep = run(SEP)
    expect(isDraftStale(sep.id)).toBe(false)
    setPayday(26)
    expect(isDraftStale(sep.id)).toBe(true)
    const a = postRun(sep.id)
    expect(a.ok).toBe(false)
    expect(a.stale).toBe(true)
    expect(isDraftStale(sep.id)).toBe(false)
    const b = postRun(sep.id)
    expect(b.needsConfirm).toBe(true)
    as('Finance Manager', () => confirmPostAsFinanceManager(sep.id))
    const c = postRun(sep.id)
    expect(c.ok).toBe(true)
    expect(String(c.number)).toMatch(/^PAY-\d{4}$/)
    expect(runStatus(sep)).toBe('Posted')
  })

  it('OD-15 / LR-4: post the difference, then Reverse reverses every live journal of the run together', () => {
    postSep()
    const sep = run(SEP)
    const r = simulateSend('revision', { runId: sep.id })
    expect(r.status).toBe('Waiting for your choice')
    expect(chooseRevision(sep.id, 2).ok).toBe(true)
    expect(runStatus(sep)).toBe('Revised')
    expect(postRun(sep.id).message).toMatch(/Use Reverse and repost, or Post the difference\.$/)
    const cmp = compareVersions(sep.id)
    expect(cmp.byAccountTag.length).toBeGreaterThan(0)
    const d = postDifference(sep.id)
    expect(d.ok).toBe(true)
    const live = liveJournals(sep.id)
    expect(live.map((j) => j.type)).toEqual(['Payroll', 'Difference'])
    // The live journals add up to exactly v2.
    expect(netByKey(live.flatMap((j) => j.lines))).toEqual(netByKey(draftOf(sep)!.lines))
    const diff = journalById(String(d.journalId))!
    expect(journalTotals(diff).debit).toBe(journalTotals(diff).credit)
    expect(net(diff.lines, ACC.hutangGaji)).toBe(thpOf(sep, 2) - thpOf(sep, 1))
    // A second fix on the same version is refused.
    expect(postDifference(sep.id).ok).toBe(false)
    const rev = reverseJournal(live[0]!.id, { confirmPayments: true })
    expect(rev.ok).toBe(true)
    expect(rev.journals).toHaveLength(2)
    expect(liveJournals(sep.id)).toHaveLength(0)
    expect(runStatus(sep)).toBe('Reversed')
    expect(reverseJournal(payroll.journals.find((j) => j.reversesId === live[0]!.id)!.id).message).toBe('A reversal cannot be reversed.')
  })

  it('OD-17: a revision of a locked month posts in the first open period, keeps its tax month, and opens the PPh 21 task there', () => {
    const aug = run(AUG)
    expect(as('Finance Manager', () => lockPeriod('2026-08')).ok).toBe(true)
    simulateSend('revision', { runId: aug.id })
    chooseRevision(aug.id, 2)
    const d = postDifference(aug.id)
    expect(d.ok).toBe(true)
    expect(d.redirected).toBe(true)
    const j = journalById(String(d.journalId))!
    expect(j.date).toBe('2026-09-01')
    expect(j.taxMonth).toBe('2026-08')
    expect(j.reference).toBe('Aug 2026')
    expect(j.memo).toMatch(/^Correction of payroll 21 Jul-20 Aug 2026 v1 \(PAY-0003\), from v2 sent 5 Oct 2026$/)
    const task = amendmentTasks.value.find((t) => t.taxMonth === '2026-08')!
    expect(task.status).toBe('Open')
    expect(task.title).toBe('Amend e-Bupot 21/26 for Aug 2026')
    expect(task.periodChange).toBeGreaterThan(0)
    expect(task.depositGap).toBe(`Deposit Rp${task.periodChange.toLocaleString('id-ID')} more`)
    expect(reconciliation('2026-08').status).toBe('Out of date')
  })

  it('LR-10: one PPh 21 rule; tax lines more than Rp1.000 off hold until Tax Staff releases', () => {
    const m = pph21Monthly('2026-08')
    const reg = m.rows.find((r) => r.key === 'regular')!
    const aug = run(AUG)
    const v = currentVersionOf(aug)!
    const expected = Math.round(v.payload.employees.reduce((s, e) => s + e['PPh 21 Benefit'] + e['PPh 21 Payment'] - e['Total PPh 21 DTP Received'], 0))
    expect(reg.expected).toBe(expected)
    expect(reg.ledger).toBe(expected)
    expect(m.rows.find((r) => r.key === 'pph26')!.ledger).toBe(Math.round(v.payload.employees.reduce((s, e) => s + e['PPh 26 Benefit'], 0)))
    expect(m.rows.find((r) => r.key === 'dtp')!.balance).toBe(0)
    mapInsentif()
    simulateSend('regular', { start: '2026-08-21', end: '2026-09-20', newAllowance: INS, taxOff: [{ employeeId: 'EMP-0030', amount: 14_940 }] })
    const sep = run(SEP)
    expect(runHolds(sep).map((h) => h.code)).toEqual(['tax-rule'])
    expect(runHolds(sep)[0]!.message).toContain('by Rp14.940')
    expect(releaseTaxHold(sep.id, 'Talenta rounding confirmed by HR').status).toBe(403)
    expect(as('Tax Staff', () => releaseTaxHold(sep.id, 'Talenta rounding confirmed by HR')).ok).toBe(true)
    expect(runHolds(sep)).toHaveLength(0)
  })

  it('TN-04: independent checks catch a wrong mapping the main report cannot see', () => {
    // An Earning item debiting an asset passes the guardrails and both sides of the main report.
    as('Accountant', () => setPayItemMapping(payItemKey('Insentif Penjualan', 'allowance'), { role: 'Earning', debit: ACC.thrAdvance, credit: ACC.hutangGaji }))
    const sep = run(SEP)
    as('Finance Manager', () => confirmPostAsFinanceManager(sep.id))
    expect(postRun(sep.id).ok).toBe(true)
    const rec = reconciliation('2026-09')
    expect(rec.accountRows.every((r) => r.variance === 0)).toBe(true)
    const exp = independentChecks('2026-09').find((c) => c.id === 'expense')!
    expect(exp.status).toBe('Off')
    expect(exp.difference).toBe(-10_500_000)
    expect(independentChecks('2026-09').find((c) => c.id === 'thp')!.status).toBe('Matches')
  })

  it('TN-20: the accrual reverses once, when the next run posts, and never again on a repost', () => {
    const acc = accrualFor('2026-08')!
    expect(acc.reversalJournalId).toBeNull()
    const p = postSep()
    expect(p.accrual).toMatch(/^PAY-\d{4}$/)
    const rev = journalById(acc.reversalJournalId)!
    expect(rev.type).toBe('Accrual reversal')
    expect(rev.date).toBe('2026-09-20')
    expect(journalTotals(rev).debit).toBe(journalTotals(journalById(acc.journalId)!).debit)
    const sep = run(SEP)
    simulateSend('revision', { runId: sep.id })
    chooseRevision(sep.id, 2)
    expect(reverseAndRepost(sep.id).ok).toBe(true)
    expect(payroll.journals.filter((j) => j.type === 'Accrual reversal' && j.accrualId === acc.id)).toHaveLength(1)
    // July's accrual was reversed by the August run.
    expect(accrualFor('2026-07')!.reversedBy).toBe('run')
  })

  it('a manual reversal fills the slot and the run skips its own', () => {
    const acc = accrualFor('2026-08')!
    expect(reverseJournal(acc.journalId, { date: '2026-09-01' }).ok).toBe(true)
    postSep()
    expect(payroll.journals.filter((j) => j.type === 'Accrual reversal' && j.accrualId === acc.id)).toHaveLength(1)
    expect(acc.log.some((l) => l.startsWith('Already reversed by PAY-'))).toBe(true)
  })

  it('access: hidden actions per role', () => {
    expect(can('post', 'Accountant')).toBe(true)
    expect(can('post', 'Tax Staff')).toBe(false)
    expect(can('recon.signoff', 'Accountant')).toBe(false)
    expect(can('recon.signoff', 'Finance Manager')).toBe(true)
    expect(can('connection.manage', 'Accountant')).toBe(false)
    expect(can('reverse', 'Auditor')).toBe(false)
    expect(as('Auditor', () => postRun(run(SEP).id)).status).toBe(403)
    expect(runById(run(SEP).id)).toBeDefined()
  })
})
