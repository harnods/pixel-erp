import { describe, it, expect, beforeEach } from 'vitest'
import {
  payroll, resetPayroll, runs, runById, runStatus, runHolds, currentVersionOf, versionLabel, draftOf, liveJournals,
  journalTotals, journalById, simulateSend, setPayrollViewAs, setPayItemMapping, payItemKey, postRun, confirmPostAsFinanceManager,
  isDraftStale, setPayday, chooseRevision, postDifference, reverseJournal, reverseAndRepost, lockPeriod, decidePartial,
  totalGaps, releaseTaxHold, pph21Monthly, independentChecks, reconciliation, compareVersions, can, addPayrollAccount,
  amendmentTasks, syncLog, mapGroup, saveRule, headcountChanges, markHeadcountExpected, clearHeadcountExpected, draftReview,
  SEND_KINDS, type Run, type JournalLine,
} from '../app/data/payrollStore'
import { ACC, buildSalaryDetail, FALLBACK_TAG } from '../app/data/payrollMaster'

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
    expect(addPayrollAccount({ code: '2-20513', name: 'Other Payroll Payable', type: 'liability', party: null }).ok).toBe(true)
    expect(setPayItemMapping(payItemKey('BPJSK Employee', 'deduction'), { credit: '2-20513' }).ok).toBe(true)
    expect(setPayItemMapping(payItemKey('JHT Employee', 'deduction'), { credit: '2-20513' }).ok).toBe(true)
    const sep = run(SEP)
    // Settings changed: the draft is stale, Post rebuilds it and the rebuilt draft holds.
    expect(postRun(sep.id).stale).toBe(true)
    expect(runHolds(sep).map((h) => h.code)).toContain('two-parties')
    expect(runHolds(sep).find((h) => h.code === 'two-parties')!.message).toBe('Other Payroll Payable holds BPJS Kesehatan and BPJS Ketenagakerjaan. Each party needs its own payable.')
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
    // Reconciliation by pay item still ties after the difference journal (sources carried).
    expect(reconciliation('2026-09').payItemRows.filter((x) => x.variance !== 0)).toEqual([])
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
    expect(j.memo).toMatch(/^Correction of payroll 21 Jul-20 Aug 2026 v1 \(PAY-0002\), from v2 sent 5 Oct 2026$/)
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

describe('headcount from runs: this run\'s employee_ids against the previous posted regular run', () => {
  beforeEach(() => { resetPayroll(); setPayrollViewAs('Accountant') })
  const grp = (h: ReturnType<typeof headcountChanges>, label: string) => h.groups.find((g) => g.label === label)!
  /** A September re-send built from a changed Talenta roster: the only way Jurnal learns about people. */
  function resendWith(change: (roster: typeof payroll.roster) => void) {
    mapInsentif()
    change(payroll.roster)
    simulateSend('regular', { start: '2026-08-21', end: '2026-09-20', newAllowance: INS })
    return headcountChanges(run(SEP).id)
  }

  it('Jurnal reads salary detail only: no employee webhooks, no early warnings', () => {
    expect(SEND_KINDS.map((k) => k.kind)).toEqual(['regular', 'new-pay-item', 'revision', 'partial', 'separate-run', 'duplicate', 'old-sync'])
    expect(syncLog.value.some((l) => (l.type as string) === 'Employee event')).toBe(false)
    expect('events' in payroll).toBe(false)
    expect(payroll.runs.every((r) => !('warnings' in r))).toBe(true)
  })

  it('seed: September against August shows one leaver, one joiner and one move, by group with dimension labels', () => {
    const h = headcountChanges(run(SEP).id)
    expect(h.previous).toMatchObject({ label: '21 Jul-20 Aug 2026', month: '2026-08', version: 1 })
    expect([h.last, h.current]).toEqual([40, 40])
    expect(h.left).toEqual(['EMP-0038'])
    expect(h.joined).toEqual(['EMP-0041'])
    expect(h.moved).toEqual([{ employee_id: 'EMP-0035', from: 'Sales, Jakarta HQ', to: 'Sales, Surabaya' }])
    expect(grp(h, 'Sales, Bandung')).toMatchObject({ last: 2, current: 3, change: 1, joined: ['EMP-0041'], left: [], flagged: true })
    expect(grp(h, 'Sales, Jakarta HQ')).toMatchObject({ last: 3, current: 2, change: -1, movedOut: [{ employee_id: 'EMP-0035' }], flagged: true })
    expect(grp(h, 'Finance, Jakarta HQ')).toMatchObject({ last: 5, current: 5, change: 0, flagged: false })
    expect(h.flagged).toBe(3)
    expect(h.unexpected).toBe(3)
  })

  it('same count but different people is still flagged', () => {
    const h = headcountChanges(run(SEP).id)
    const s = grp(h, 'Sales, Surabaya')
    expect([s.last, s.current, s.change]).toEqual([2, 2, 0])
    expect(s.left).toEqual(['EMP-0038'])
    expect(s.movedIn.map((m) => m.employee_id)).toEqual(['EMP-0035'])
    expect(s.flagged).toBe(true)
  })

  it('joiner: a new employee_id in the send is new in this run', () => {
    const h = resendWith((r) => r.push({ ...r.find((e) => e.employee_id === 'EMP-0041')!, employee_id: 'EMP-0042', basic: 8_000_000 }))
    expect(h.joined).toEqual(['EMP-0041', 'EMP-0042'])
    expect(grp(h, 'Sales, Bandung')).toMatchObject({ last: 2, current: 4, joined: ['EMP-0041', 'EMP-0042'] })
  })

  it('leaver: an employee_id missing from the send is not in this run', () => {
    const h = resendWith((r) => { r.find((e) => e.employee_id === 'EMP-0026')!.left = '2026-08-20' })
    expect(h.left).toEqual(['EMP-0026', 'EMP-0038'])
    expect(grp(h, 'Finance, Jakarta HQ')).toMatchObject({ last: 5, current: 4, change: -1, left: ['EMP-0026'], flagged: true })
  })

  it('mover: in both runs with another group, listed under both groups with from and to', () => {
    const h = resendWith((r) => { r.find((e) => e.employee_id === 'EMP-0027')!.moves.push({ effective: '2026-09-01', to: { organization_name: 'Operations', branch_name: 'Jakarta HQ', cost_center_name: 'HQ Operations' } }) })
    const m = h.moved.find((x) => x.employee_id === 'EMP-0027')!
    expect(m).toEqual({ employee_id: 'EMP-0027', from: 'Finance, Jakarta HQ', to: 'Operations, Jakarta HQ' })
    expect(grp(h, 'Finance, Jakarta HQ').movedOut).toEqual([m])
    expect(grp(h, 'Operations, Jakarta HQ').movedIn).toEqual([m])
    expect(h.joined).not.toContain('EMP-0027')
    expect(h.left).not.toContain('EMP-0027')
  })

  it('no names anywhere: only employee_id values and group labels', () => {
    const h = headcountChanges(run(SEP).id)
    const text = JSON.stringify(h)
    const ids = [...text.matchAll(/EMP-\d{4}/g)].map((x) => x[0])
    expect(ids.length).toBeGreaterThan(0)
    for (const g of h.groups) expect(Object.keys(g).sort()).toEqual(['change', 'current', 'expected', 'flagged', 'joined', 'key', 'label', 'last', 'left', 'movedIn', 'movedOut'])
    expect(text).not.toMatch(/"(name|employee_name|full_name)"/)
    const people = [...h.joined, ...h.left, ...h.moved.map((m) => m.employee_id), ...h.groups.flatMap((g) => [...g.joined, ...g.left, ...g.movedIn.map((m) => m.employee_id), ...g.movedOut.map((m) => m.employee_id)])]
    expect(people.every((id) => /^EMP-\d{4}$/.test(id))).toBe(true)
  })

  it('Expected: the Accountant marks a change with an optional note; posting is never blocked, the Post result names unmarked changes', () => {
    mapInsentif()
    const sep = run(SEP)
    expect(as('Auditor', () => markHeadcountExpected(sep.id, 'Sales|Bandung')).status).toBe(403)
    expect(markHeadcountExpected(sep.id, 'Finance|Jakarta HQ').ok).toBe(false)
    expect(markHeadcountExpected(sep.id, 'Sales|Bandung', 'x'.repeat(501)).ok).toBe(false)
    expect(markHeadcountExpected(sep.id, 'Sales|Bandung').ok).toBe(true)
    expect(markHeadcountExpected(sep.id, 'Sales|Surabaya', 'EMP-0035 covers EMP-0038').ok).toBe(true)
    const h = headcountChanges(sep.id)
    expect(grp(h, 'Sales, Bandung').expected).toMatchObject({ note: '', by: 'Dewi Anggraini' })
    expect(grp(h, 'Sales, Surabaya').expected!.note).toBe('EMP-0035 covers EMP-0038')
    expect(draftReview(sep.id).unexpectedHeadcount).toBe(1)
    expect(clearHeadcountExpected(sep.id, 'Sales|Bandung').ok).toBe(true)
    expect(draftReview(sep.id).unexpectedHeadcount).toBe(2)
    as('Finance Manager', () => confirmPostAsFinanceManager(sep.id))
    const r = postRun(sep.id)
    expect(r.ok).toBe(true)
    expect(r.warnings).toContain('2 headcount changes are not marked Expected.')
  })

  it('an Expected mark lapses when a later send changes the ids it covered', () => {
    mapInsentif()
    const sep = run(SEP)
    markHeadcountExpected(sep.id, 'Sales|Bandung')
    expect(grp(headcountChanges(sep.id), 'Sales, Bandung').expected).not.toBeNull()
    payroll.roster.push({ ...payroll.roster.find((e) => e.employee_id === 'EMP-0041')!, employee_id: 'EMP-0042' })
    simulateSend('regular', { start: '2026-08-21', end: '2026-09-20', newAllowance: INS })
    expect(grp(headcountChanges(sep.id), 'Sales, Bandung').expected).toBeNull()
  })
})

describe('copy: Jurnal calls the organization and branch values dimensions', () => {
  beforeEach(() => { resetPayroll(); setPayrollViewAs('Accountant') })
  it('group-map and rule messages say dimension, never tag', () => {
    const msgs = [
      mapGroup('Organization', 'New team', FALLBACK_TAG, { fromHold: true }).message,
      mapGroup('Organization', 'New team', 'No such value').message,
      saveRule({ name: 'Empty', conditions: [{ field: 'organization_name', op: 'is', values: ['Sales'] }], roles: ['Earning'], account: null, tags: null, active: true }).message,
    ]
    expect(msgs).toEqual([
      'Pick a real dimension value. A new group cannot go to the fallback dimension value from here.',
      'Pick a value from this dimension or create it first.',
      'A rule sets an account, dimensions or both.',
    ])
    for (const m of msgs) expect(m).not.toMatch(/\btags?\b/i)
  })
})
