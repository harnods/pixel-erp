import { describe, it, expect, beforeEach } from 'vitest'
import {
  payroll, resetPayroll, runs, runById, runStatus, runHolds, currentVersionOf, versionLabel, draftOf, liveJournals,
  journalTotals, journalById, simulateSend, setPayrollViewAs, setPayItemMapping, payItemKey, postRun, isDraftStale, setPayday,
  chooseRevision, chooseSeparateRun, revisionOf, repostVersions, reverseJournal, reverseAndRepost, lockPeriod, decidePartial, dryRunJournal,
  compareVersions, can, addPayrollAccount, amendmentTasks, syncLog, mapGroup, headcountChanges, markHeadcountExpected,
  setPayItemAccount, setPayItemSplit, setPayableAccount, setStartMonth, linkDimension, createMissingValues, setFieldPolicy, createPayrollTag,
  payItemType, payItemParty, payItemAccount, mappingFor, oldSyncExpense,
  clearHeadcountExpected, draftReview, runWarnings, acknowledgeWarning, postConfirmText, payablesTracker, simulateBankPayment,
  simulateManualJournal, manualJournalWarnings, setEbupotFiled, pph21Month, sendFigures, staffRows, receiveSalaryDetail,
  claimsSummary, noticesFor, SEND_KINDS, BANK_PAYMENT_KINDS, type Run, type JournalLine,
  approvePayroll, rejectPayroll, canApprove, whyLine, journalsOf, defaultEntryDate, checkEntryDate, payrollAccount, rebuildDraft,
} from '../app/data/payrollStore'
import { sendLog, sendLogCsv, SEND_LOG_COLUMNS } from '../app/data/payrollStore'
import { ACC, buildSalaryDetail } from '../app/data/payrollMaster'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { approvalWorkflows, setApprovalWorkflowActive } from '../app/data/approvalWorkflows'
import { awaitingApprovalTasks } from '../app/data/tasks'

/** The seeded Payroll journal approval rule (above Rp500.000.000). Off for the posting rules below; the approval tests switch it on. */
const PAYROLL_RULE = 'awf-007'
beforeEach(() => setApprovalWorkflowActive(PAYROLL_RULE, false))

const JUL = '1212 / monthly / 2026-06-21 / 2026-07-20'
const AUG = '1212 / monthly / 2026-07-21 / 2026-08-20'
const SEP = '1212 / monthly / 2026-08-21 / 2026-09-20'
const INS = { name: 'Insentif Penjualan', organization: 'Sales', amount: 1_500_000 }
const run = (key: string) => runs.value.find((r) => r.key === key)!
const as = <T>(role: Parameters<typeof setPayrollViewAs>[0], fn: () => T): T => { const p = payroll.viewAs; setPayrollViewAs(role); try { return fn() } finally { setPayrollViewAs(p) } }
const thpOf = (r: Run, no?: number) => sendFigures(r.versions.find((v) => v.no === (no ?? r.ledgerVersion ?? r.currentVersion))).takeHome
const isCostCode = (code: string) => ['expense', 'cogs'].includes(payrollAccount(code)?.type ?? '')
const net = (lines: JournalLine[], acct: string) => lines.filter((l) => l.account === acct).reduce((s, l) => s + l.credit - l.debit, 0)
function netByKey(lines: JournalLine[]) {
  const m = new Map<string, number>()
  for (const l of lines) { const k = `${l.account}|${l.tags.Organization}|${l.tags.Branch}`; m.set(k, (m.get(k) ?? 0) + l.debit - l.credit) }
  for (const [k, v] of m) if (!v) m.delete(k)
  return m
}
/** Map the new September pay item so the seeded hold clears. */
function mapInsentif() {
  return as('Accountant + LM', () => setPayItemMapping(payItemKey('Insentif Penjualan', 'allowance'), { role: 'Earning', debit: ACC.salesSalaries, credit: ACC.hutangGaji }))
}
function postSep() {
  mapInsentif()
  return as('Accountant + LM', () => postRun(run(SEP).id))
}

describe('payload: the final salary detail shape, no totals', () => {
  beforeEach(() => { resetPayroll(); setPayrollViewAs('Accountant + LM') })

  it('items carry user_id, employee_id, branch, cost_center, sbu and three component lists; no totals, no run type', () => {
    const p = buildSalaryDetail(payroll.roster, '2026-08-21', '2026-09-20', { sentAt: '2026-09-21T03:00:00Z' })
    expect(Object.keys(p).sort()).toEqual(['company_id', 'items', 'period', 'sent_at'])
    expect(Object.keys(p.period)).toEqual(['start_date', 'end_date'])
    const it0 = p.items[0]!
    expect(Object.keys(it0.employee)).toEqual(['user_id', 'employee_id', 'employee_name', 'job_position', 'job_level', 'employment_status', 'organization_name', 'branch', 'cost_center', 'sbu'])
    expect(Object.keys(it0.components)).toEqual(['allowances', 'deductions', 'benefits'])
    expect(JSON.stringify(p)).not.toMatch(/take_home_pay|total_allowances|total_deductions|total_benefits|run_type/)
    for (const it of p.items) for (const l of [it.components.allowances, it.components.deductions, it.components.benefits]) for (const x of l) expect(Number.isInteger(x.amount) && x.amount >= 0).toBe(true)
    // Tax figures are components; Rp0 items are included.
    expect(it0.components.benefits.map((b) => b.name)).toEqual(expect.arrayContaining(['PPh 21 Benefit', 'PPh 21 Resign Benefit', 'PPh 26 Benefit', 'Total PPh 21 DTP Received']))
    expect(it0.components.deductions.find((d) => d.name === 'PPH 21 Payment')!.amount).toBe(0)
  })

  it('Jurnal drops employee_name at intake: stored blank, never in any read model', () => {
    for (const r of payroll.runs) for (const v of r.versions) for (const it of v.payload.items) expect(it.employee.employee_name).toBe('')
    const sep = run(SEP)
    expect(JSON.stringify(staffRows(currentVersionOf(sep)!.payload))).not.toMatch(/Karyawan|employee_name/)
    expect(JSON.stringify(headcountChanges(sep.id))).not.toMatch(/Karyawan|"name"/)
  })

  it('take-home pay = allowances - deductions; benefits are not in it', () => {
    const v = currentVersionOf(run(SEP))!
    for (const e of staffRows(v.payload)) expect(e.takeHome).toBe(e.allowances.reduce((s, x) => s + x.amount, 0) - e.deductions.reduce((s, x) => s + x.amount, 0))
    expect(sendFigures(v)).toEqual({ staff: 40, takeHome: 446_901_849, gross: 505_668_948 })
  })

  it('a negative or fractional amount is refused', () => {
    const p = buildSalaryDetail(payroll.roster, '2026-09-21', '2026-10-20', { sentAt: '2026-10-21T03:00:00Z' })
    p.items[0]!.components.allowances[0]!.amount = -1
    const r = receiveSalaryDetail(p)
    expect(r.ok).toBe(false)
    expect(r.message).toBe('Every amount must be whole rupiah, Rp0 or more.')
  })
})

describe('seed: rebuilt on the final payload through the engine', () => {
  beforeEach(() => { resetPayroll(); setPayrollViewAs('Accountant + LM') })

  it('Jul and Aug posted and paid by bank matches; Sep held on Insentif Penjualan only', () => {
    expect(runStatus(run(JUL))).toBe('Posted')
    expect(runStatus(run(AUG))).toBe('Posted')
    expect(liveJournals(run(JUL).id).map((j) => [j.number, journalTotals(j).debit])).toEqual([['PAY-0001', 543_314_181]])
    expect(liveJournals(run(AUG).id).map((j) => [j.number, journalTotals(j).debit])).toEqual([['PAY-0002', 545_458_357]])
    expect([thpOf(run(JUL)), thpOf(run(AUG))]).toEqual([437_723_416, 439_776_820])
    const sep = run(SEP)
    expect(runStatus(sep)).toBe('Held')
    expect(runHolds(sep).map((h) => h.code)).toEqual(['unmapped-item'])
    expect(runHolds(sep)[0]!.message).toBe('1 pay item has no account: Insentif Penjualan (allowance), Rp10.500.000, 7 employees')
    for (const m of ['2026-07', '2026-08']) {
      const rows = payablesTracker(m)
      expect(rows.map((r) => r.status)).toEqual(['Paid', 'Paid', 'Paid', 'Paid', 'Paid', 'Paid'])
      expect(rows.every((r) => r.flags.length === 0)).toBe(true)
    }
    const pays = payroll.journals.filter((j) => j.type === 'Salary payment' || j.type === 'Statutory payment')
    expect(pays).toHaveLength(12)
    expect(pays.every((j) => j.source === 'Bank reconciliation' && /^BNK-\d{4}$/.test(j.number))).toBe(true)
    expect(payroll.bankLines).toHaveLength(12)
    expect(payroll.journals.every((j) => journalTotals(j).debit === journalTotals(j).credit)).toBe(true)
    expect(pph21Month('2026-08')).toMatchObject({ rule: 16_644_111, books: 16_644_111, paid: 16_644_111, filedDiff: 0, flagged: false })
  })

  it('persists under payroll:state-v7', () => {
    // loadSnapshot is client-only; pin the key in the source.
    expect(readFileSync(resolve(__dirname, '..', 'app', 'data', 'payrollStore.ts'), 'utf8')).toContain("const SNAPSHOT_KEY = 'payroll:state-v7'")
  })
})

describe('intake: Jurnal builds the draft; holds only for no mapping or a partial send', () => {
  beforeEach(() => { resetPayroll(); setPayrollViewAs('Accountant + LM') })

  it('LR-3: run key is company / period / start / end; versions follow send time; the latest version wins', () => {
    const sep = run(SEP)
    expect(sep.key).toBe(SEP)
    mapInsentif()
    expect(runStatus(sep)).toBe('Ready to post')
    const r = simulateSend('regular', { start: '2026-08-21', end: '2026-09-20', newAllowance: { ...INS, amount: 1_600_000 } })
    expect(r.versionNo).toBe(2)
    expect(sep.currentVersion).toBe(2)
    expect(versionLabel(sep, sep.versions[0]!)).toBe('Replaced by v2')
    expect(postRun(sep.id, { versionNo: 1 }).message).toBe('A newer version (v2) arrived. Review v2 before posting.')
    const late = simulateSend('regular', { start: '2026-08-21', end: '2026-09-20', sentAt: '2026-09-22T00:00:00Z', newAllowance: { ...INS, amount: 1_700_000 } })
    expect(late.ok).toBe(false)
    expect(sep.versions).toHaveLength(2)
  })

  it('a byte-identical send is rejected; same figures with a new send time is No change', () => {
    const before = run(SEP).versions.length
    const r = simulateSend('duplicate')
    expect(r.ok).toBe(false)
    expect(r.message).toBe('Duplicate of v1')
    expect(run(SEP).versions).toHaveLength(before)
    expect(syncLog.value[0]!.status).toBe('Failed')
    expect(simulateSend('regular', { start: '2026-08-21', end: '2026-09-20', newAllowance: INS }).status).toBe('No change')
  })

  it('OD-03: an unmapped pay item holds and no draft builds; saving the mapping clears it on its own', () => {
    const sep = run(SEP)
    expect(draftOf(sep)).toBeNull()
    expect(postRun(sep.id).ok).toBe(false)
    mapInsentif()
    expect(runHolds(sep)).toHaveLength(0)
    expect(draftOf(sep)).not.toBeNull()
  })

  it('a group with no dimension holds; mapping it clears the hold', () => {
    mapInsentif()
    payroll.roster.find((e) => e.employee_id === 'EMP-0026')!.moves.push({ effective: '2026-09-01', to: { organization_name: 'Legal', branch_name: 'Jakarta HQ', cost_center_name: 'HQ Finance' } })
    simulateSend('regular', { start: '2026-08-21', end: '2026-09-20', newAllowance: INS })
    const sep = run(SEP)
    expect(runHolds(sep).map((h) => h.code)).toEqual(['unmapped-group'])
    as('Accountant + LM', () => { mapGroup('Organization', 'Legal', 'Finance') })
    expect(runHolds(sep)).toHaveLength(0)
  })

  it('TN-01: a re-send with one branch holds as partial and keeps v1 current', () => {
    mapInsentif()
    const sep = run(SEP)
    const r = simulateSend('partial', { runId: sep.id, onlyBranch: 'Bandung' })
    expect(r.status).toBe('Held')
    expect(sep.versions[1]!.state).toBe('partial')
    expect(sep.versions[1]!.holds[0]!.message).toBe('Looks partial: 10 of 40 staff. Finance, Human Capital, Jakarta HQ and Surabaya missing.')
    expect(sep.currentVersion).toBe(1)
    expect(decidePartial(sep.id, 2, 'reject').ok).toBe(true)
    expect(runStatus(sep)).toBe('Ready to post')
  })

  it('no total check exists: nothing compares against Talenta totals and no gap, suspense or rounding route remains', async () => {
    const store = await import('../app/data/payrollStore')
    for (const gone of ['totalGaps', 'releaseWithGap', 'releaseTaxHold', 'setSuspenseAccount', 'confirmPostAsFinanceManager', 'recordSalaryPayment', 'payStatutory', 'voidPayment', 'reconciliation', 'independentChecks', 'signOffMonth', 'pph21Annual', 'postDifference', 'postCorrection', 'correctionOf'])
      expect(gone in store, gone).toBe(false)
    expect('knownGaps' in payroll).toBe(false)
    expect('suspenseAccount' in payroll.settings).toBe(false)
    expect(payroll.accounts.some((a) => /suspense|rounding/i.test(a.name))).toBe(false)
  })
})

describe('warnings ride on the draft and never block Post', () => {
  beforeEach(() => { resetPayroll(); setPayrollViewAs('Accountant + LM') })

  it('missing components: one line per name and section that had a non-zero amount last time', () => {
    mapInsentif()
    const sep = run(SEP)
    const r = simulateSend('missing-component', { runId: sep.id })
    expect(r.status).toBe('Received')
    expect(runStatus(sep)).toBe('Ready to post')
    const w = runWarnings(sep.id).filter((x) => x.code === 'missing-component')
    expect(w.map((x) => x.message)).toEqual(['PPH 21 Paid not in this send'])
    expect(w[0]!.details).toMatchObject({ section: 'deduction', last: 'v1' })
    // The first send of a period compares with the last send of the previous regular run.
    resetPayroll()
    mapInsentif()
    simulateSend('regular', { start: '2026-09-21', end: '2026-10-20', omit: ['Uang Makan'] })
    const oct = runs.value[0]!
    // September sent Insentif Penjualan; October does not, so it is listed too.
    expect(runWarnings(oct.id).filter((x) => x.code === 'missing-component').map((x) => x.message)).toEqual(['Uang Makan not in this send', 'Insentif Penjualan not in this send'])
  })

  it('LR-10: PPh 21 lines more than Rp1.000 off the rule is a warning, not a hold', () => {
    mapInsentif()
    simulateSend('regular', { start: '2026-08-21', end: '2026-09-20', newAllowance: INS, taxOff: [{ employeeId: 'EMP-0030', amount: 14_940 }] })
    const sep = run(SEP)
    expect(runHolds(sep)).toHaveLength(0)
    expect(runWarnings(sep.id).find((x) => x.code === 'tax-rule')!.message).toContain('by Rp14.940')
    simulateSend('regular', { start: '2026-08-21', end: '2026-09-20', newAllowance: INS, taxOff: [{ employeeId: 'EMP-0030', amount: 1_000 }] })
    expect(runWarnings(sep.id).some((x) => x.code === 'tax-rule')).toBe(false)
  })

  it('unacknowledged warnings are listed in the Post confirm and returned by Post; acknowledged ones are not', () => {
    mapInsentif()
    const sep = run(SEP)
    const all = runWarnings(sep.id)
    expect(all.map((w) => w.code)).toEqual(['large-change', 'large-change', 'large-change', 'large-change', 'headcount'])
    expect(all.find((w) => w.code === 'headcount')!.message).toBe('3 headcount changes are not marked Expected.')
    const c = postConfirmText(sep.id)
    expect(c.title).toBe('Post payroll 21 Aug-20 Sep 2026?')
    expect(c.body).toMatch(/^One payroll journal of Rp554\.203\.941 on 26 lines, dated 20 Sep 2026\. 5 warnings are not acknowledged: /)
    expect(as('View only', () => acknowledgeWarning(sep.id, all[0]!.key)).status).toBe(403)
    expect(acknowledgeWarning(sep.id, all[0]!.key, 'Sales incentive started this month').ok).toBe(true)
    expect(runWarnings(sep.id)[0]!.acknowledged).toMatchObject({ note: 'Sales incentive started this month', by: 'Bayu Ferdian' })
    expect(postConfirmText(sep.id).warnings).toHaveLength(4)
    const r = postRun(sep.id)
    expect(r.ok).toBe(true)
    expect(r.warnings).toHaveLength(4)
    expect(r.number).toBe('PAY-0003')
  })

  it('no Finance Manager confirm: settings changed since the last post do not stop the Accountant', () => {
    mapInsentif()
    const sep = run(SEP)
    setPayday(26)
    expect(isDraftStale(sep.id)).toBe(true)
    expect(postRun(sep.id).stale).toBe(true)
    expect(postRun(sep.id).ok).toBe(true)
    expect(runStatus(sep)).toBe('Posted')
  })
})

describe('post (TS-05)', () => {
  beforeEach(() => { resetPayroll(); setPayrollViewAs('Accountant + LM') })

  it('balanced, Hutang Gaji = take-home pay, one payable line per party, dated on the end date', () => {
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
    expect(j!.lines.length).toBeLessThan(40)
    expect(j!.lines.some((l) => l.account === ACC.directLabour && l.tags.Organization === 'Operations')).toBe(true)
    expect(j!.lines.filter((l) => l.account === ACC.dtp).map((l) => l.debit > 0 ? 'D' : 'C').sort()).toEqual(['C', 'D'])
    // Tax benefit components are read by the presets, never booked as pay items.
    expect(j!.lines.flatMap((l) => l.sources).some((s) => s.item === 'PPh 21 Benefit' && s.section === 'benefit')).toBe(false)
  })

  it('September posts: figures by party', () => {
    const r = postSep()
    expect(r.ok).toBe(true)
    const j = journalById(String(r.journalId))!
    expect(journalTotals(j).debit).toBe(554_203_941)
    expect([ACC.hutangGaji, ACC.pph21, ACC.pph26, ACC.bpjsKes, ACC.bpjsTk, ACC.dplk].map((a) => net(j.lines, a))).toEqual([446_901_849, 18_323_082, 21_209_400, 16_097_029, 38_969_133, 9_300_000])
  })

  it('OD-06 / TN-10: two statutory parties on one payable block the save, and hold the draft when the payable has no label', () => {
    const r = setPayItemMapping(payItemKey('BPJSK Employee', 'deduction'), { credit: ACC.bpjsTk })
    expect(r.message).toBe('BPJS Ketenagakerjaan Payable is labelled BPJS Ketenagakerjaan. BPJSK Employee is owed to BPJS Kesehatan.')
    mapInsentif()
    expect(addPayrollAccount({ code: '2-20513', name: 'Other Payroll Payable', type: 'liability', party: null }).ok).toBe(true)
    expect(setPayItemMapping(payItemKey('BPJSK Employee', 'deduction'), { credit: '2-20513' }).ok).toBe(true)
    expect(setPayItemMapping(payItemKey('JHT Employee', 'deduction'), { credit: '2-20513' }).ok).toBe(true)
    const sep = run(SEP)
    expect(postRun(sep.id).stale).toBe(true)
    expect(runHolds(sep).find((h) => h.code === 'two-parties')!.message).toBe('Other Payroll Payable holds BPJS Kesehatan and BPJS Ketenagakerjaan. Each party needs its own payable.')
    expect(postRun(sep.id).ok).toBe(false)
  })
})

describe('revisions: the latest version wins; reverse and repost replaces the posted journal', () => {
  beforeEach(() => { resetPayroll(); setPayrollViewAs('Accountant + LM') })

  it('a different send for a posted run becomes current; the run shows what changes and the Accountant is notified', () => {
    postSep()
    const sep = run(SEP)
    const r = simulateSend('revision', { runId: sep.id })
    expect(r.status).toBe('Received')
    expect(sep.currentVersion).toBe(2)
    expect(runStatus(sep)).toBe('Revision ready')
    const c = revisionOf(sep.id)!
    expect(c.summary).toMatchObject({
      fromVersion: 1, toVersion: 2,
      takeHome: { before: 446_901_849, after: 448_634_808, change: 1_732_959 },
      pph21: { change: 197_041 }, pph26: { change: 0 }, bpjs: { change: 244_800 },
      joined: 0, left: 0, amountChanged: 4,
    })
    expect(c.summary.moved.filter((m) => m.change > 0 && isCostCode(m.account)).every((m) => m.label.includes('Human Capital'))).toBe(true)
    expect(noticesFor('Accountant')[0]!.text).toBe('Payroll 21 Aug-20 Sep 2026 v2 replaces v1. Take-home pay +Rp1.732.959, PPh 21 +Rp197.041, PPh 26 Rp0, BPJS +Rp244.800. 4 staff changed. Ready to reverse and repost.')
    expect(postRun(sep.id).message).toBe('v1 is posted as PAY-0003. Reverse and repost v2.')
    expect(postConfirmText(sep.id).title).toBe('Reverse and repost 21 Aug-20 Sep 2026?')
    expect(repostVersions(sep.id).map((v) => v.no)).toEqual([2])
  })

  it('reverse and repost: the old PAY reversed in full and the new PAY in full, both on the chosen date; payables and the amendment task follow', () => {
    postSep()
    const sep = run(SEP)
    const old = liveJournals(sep.id)[0]!
    simulateSend('revision', { runId: sep.id })
    const p = reverseAndRepost(sep.id, { date: '2026-09-30' })
    expect(p).toMatchObject({ ok: true, journals: ['PAY-0004', 'PAY-0005'], number: 'PAY-0005', date: '2026-09-30' })
    const rev = journalById(old.reversedById)!
    expect(rev).toMatchObject({ type: 'Reversal', number: 'PAY-0004', date: '2026-09-30', reversesId: old.id, taxMonth: '2026-09' })
    expect(rev.lines.map((l) => [l.account, l.debit, l.credit])).toEqual(old.lines.map((l) => [l.account, l.credit, l.debit]))
    const live = liveJournals(sep.id)
    expect(live.map((j) => [j.number, j.type, j.versionNo, j.date])).toEqual([['PAY-0005', 'Payroll', 2, '2026-09-30']])
    expect(netByKey(live[0]!.lines)).toEqual(netByKey(draftOf(sep)!.lines))
    expect(journalTotals(live[0]!).debit).toBe(journalTotals(draftOf(sep)!).debit)
    expect(payroll.journals.some((j) => (j.type as string) === 'Correction')).toBe(false)
    expect(runStatus(sep)).toBe('Posted')
    expect(sep.ledgerVersion).toBe(2)
    expect(revisionOf(sep.id)).toBeNull()
    expect(reverseAndRepost(sep.id).ok).toBe(false)
    expect(payablesTracker('2026-09').find((r) => r.party === 'Staff')).toMatchObject({ owed: 448_634_808 })
    expect(amendmentTasks.value.find((t) => t.taxMonth === '2026-09')!.summary).toBe('4 staff changed, period total change Rp197.041')
  })

  it('the Accountant picks the version: the latest is preselected; an older one can be reposted and the newer stays superseded', () => {
    postSep()
    const sep = run(SEP)
    simulateSend('revision', { runId: sep.id })
    simulateSend('revision', { runId: sep.id, raise: { organization: 'Human Capital', amount: 900_000 } })
    expect(repostVersions(sep.id).map((v) => v.no)).toEqual([3, 2])
    const r = reverseAndRepost(sep.id, { versionNo: 2 })
    expect(r.ok).toBe(true)
    expect(sep.ledgerVersion).toBe(2)
    expect(sep.currentVersion).toBe(2)
    expect(liveJournals(sep.id).map((j) => j.versionNo)).toEqual([2])
    expect(versionLabel(sep, sep.versions[2]!)).toBe('Superseded, not posted')
    expect(runStatus(sep)).toBe('Posted')
  })

  it('a send that looks like a separate run (THR only) keeps the revision-or-separate choice', () => {
    postSep()
    const sep = run(SEP)
    const r = simulateSend('separate-run', { runId: sep.id })
    expect(r.status).toBe('Waiting for your choice')
    expect(runHolds(sep)[0]!.code).toBe('choice')
    const s = chooseSeparateRun(sep.id, 2, { type: 'THR', name: 'THR Idul Fitri' })
    expect(s.ok).toBe(true)
    const thr = runById(String(s.runId))!
    expect(thr.kind).toBe('THR')
    expect(runStatus(thr)).toBe('Ready to post')
    expect(runStatus(sep)).toBe('Posted')
    resetPayroll(); setPayrollViewAs('Accountant + LM'); postSep()
    simulateSend('separate-run', { runId: run(SEP).id })
    expect(chooseRevision(run(SEP).id, 2).ok).toBe(true)
    expect(runStatus(run(SEP))).toBe('Revision ready')
  })

  it('a version that moves nothing in the ledger becomes the ledger version at once, with the amendment task when tax moved', () => {
    postSep()
    const sep = run(SEP)
    simulateSend('regular', { start: '2026-08-21', end: '2026-09-20', newAllowance: INS, taxShift: { from: 'EMP-0026', to: 'EMP-0027', amount: 50_000 } })
    expect(runStatus(sep)).toBe('Posted')
    expect(sep.ledgerVersion).toBe(2)
    expect(revisionOf(sep.id)).toBeNull()
    expect(amendmentTasks.value.find((t) => t.taxMonth === '2026-09')).toMatchObject({ noLedgerChange: true, periodChange: 0 })
  })

  it('a revision of a locked month: the default date is refused with a clear message; a date in an open period posts and keeps the tax month', () => {
    const aug = run(AUG)
    expect(as('Owner', () => lockPeriod('2026-08')).ok).toBe(true)
    simulateSend('revision', { runId: aug.id })
    expect(reverseAndRepost(aug.id)).toMatchObject({ ok: false, message: 'Aug 2026 is locked. Pick a date in an open period.' })
    expect(liveJournals(aug.id).map((j) => j.number)).toEqual(['PAY-0002'])
    const d = reverseAndRepost(aug.id, { date: '2026-09-01' })
    expect(d.ok).toBe(true)
    const j = journalById(String(d.journalId))!
    expect(j).toMatchObject({ date: '2026-09-01', taxMonth: '2026-08', versionNo: 2 })
    expect(journalById(journalsOf(aug.id).find((x) => x.number === 'PAY-0002')!.reversedById)!.date).toBe('2026-09-01')
    expect(reverseAndRepost(aug.id, { date: '2026-08-01' }).ok).toBe(false)
  })

  it('Reverse undoes the whole chain', () => {
    postSep()
    const sep = run(SEP)
    simulateSend('revision', { runId: sep.id })
    expect(reverseAndRepost(sep.id).ok).toBe(true)
    expect(liveJournals(sep.id).map((j) => j.type)).toEqual(['Payroll'])
    expect(reverseJournal(liveJournals(sep.id)[0]!.id, { confirmPayments: true }).ok).toBe(true)
    expect(runStatus(sep)).toBe('Reversed')
    expect(reverseJournal(payroll.journals.filter((j) => j.type === 'Reversal').pop()!.id).message).toBe('A reversal cannot be reversed.')
  })

  it('compareVersions lists pay items, lines and staff by user_id', () => {
    postSep()
    simulateSend('missing-component', { runId: run(SEP).id })
    const cmp = compareVersions(run(SEP).id, 1, 2)
    expect(cmp.byPayItem.find((r) => r.name === 'PPH 21 Paid')).toMatchObject({ section: 'deduction', new: 0, missing: true })
    expect(cmp.headcount).toEqual({ added: [], removed: [] })
  })
})

describe('entry date on every post', () => {
  beforeEach(() => { resetPayroll(); setPayrollViewAs('Accountant + LM') })

  it('defaults to the last day of the pay period and takes an override', () => {
    mapInsentif()
    const sep = run(SEP)
    expect(defaultEntryDate(sep)).toBe('2026-09-20')
    expect(postConfirmText(sep.id).body).toMatch(/dated 20 Sep 2026\./)
    expect(postConfirmText(sep.id, '2026-09-30').body).toMatch(/dated 30 Sep 2026\./)
    const r = postRun(sep.id, { date: '2026-09-30' })
    expect(r).toMatchObject({ ok: true, date: '2026-09-30' })
    expect(liveJournals(sep.id)[0]!.date).toBe('2026-09-30')
    resetPayroll(); mapInsentif()
    expect(postRun(run(SEP).id)).toMatchObject({ ok: true, date: '2026-09-20' })
  })

  it('a date in a locked period is refused with a clear message and nothing posts', () => {
    mapInsentif()
    const sep = run(SEP)
    expect(checkEntryDate('2026-07-31')).toBe('Jul 2026 is locked. Pick a date in an open period.')
    expect(postRun(sep.id, { date: '2026-07-31' })).toMatchObject({ ok: false, status: 422, message: 'Jul 2026 is locked. Pick a date in an open period.' })
    expect(postRun(sep.id, { date: 'not a date' }).message).toBe('Pick an entry date.')
    expect(liveJournals(sep.id)).toHaveLength(0)
  })
})

describe('dry run: shows the journal it would post and posts nothing', () => {
  beforeEach(() => { resetPayroll(); setPayrollViewAs('Accountant + LM') })

  it('accounts, dimensions, payables per party and warnings, labelled Test, not posted; no journal, id or setting moves', () => {
    mapInsentif()
    const sep = run(SEP)
    const before = JSON.stringify({ j: payroll.journals, seq: payroll.seq, m: payroll.settings.mapping.length, v: sep.versions, log: payroll.log.length })
    const d = dryRunJournal(sep.id)
    expect(d).toMatchObject({ ok: true, label: 'Test, not posted', versionNo: 1, date: '2026-09-20', total: 554_203_941 })
    expect(d.lines.some((l) => l.tags.Organization === 'Sales')).toBe(true)
    expect(Object.fromEntries(d.payables.map((p) => [p.party, p.amount]))).toMatchObject({ Staff: 446_901_849, 'DJP PPh 21': 18_323_082, 'DJP PPh 26': 21_209_400, 'BPJS Kesehatan': 16_097_029, 'BPJS Ketenagakerjaan': 38_969_133 })
    expect(d.payables.find((p) => p.account === ACC.dplk)!.amount).toBe(9_300_000)
    expect(d.warnings).toContain('3 headcount changes are not marked Expected.')
    expect(JSON.stringify({ j: payroll.journals, seq: payroll.seq, m: payroll.settings.mapping.length, v: sep.versions, log: payroll.log.length })).toBe(before)
    expect(runStatus(sep)).toBe('Ready to post')
  })

  it('a held run shows why it would not post; posting never waits for a dry run', () => {
    const sep = run(SEP)
    const d = dryRunJournal(sep.id)
    expect(d.ok).toBe(false)
    expect(d.holds.map((h) => h.code)).toEqual(['unmapped-item'])
    expect(liveJournals(sep.id)).toHaveLength(0)
    mapInsentif()
    expect(postRun(sep.id).ok).toBe(true)
  })
})

describe('payables: a tracker; payments arrive as bank reconciliation matches', () => {
  beforeEach(() => { resetPayroll(); setPayrollViewAs('Accountant + LM'); postSep() })
  const salary = () => payablesTracker('2026-09').find((r) => r.party === 'Staff')!

  it('every kind creates a matched bank line and a BNK journal that pays the payable', () => {
    expect(BANK_PAYMENT_KINDS.map((k) => k.kind)).toEqual(['salary', 'pph21', 'pph26', 'bpjs-kesehatan', 'bpjs-ketenagakerjaan', 'dplk', 'partial', 'overpaid'])
    expect(salary()).toMatchObject({ owed: 446_901_849, paid: 0, due: '2026-09-25' })
    expect(simulateBankPayment('salary', { date: '2026-09-25' }).ok).toBe(true)
    const j = journalById(payroll.payments.at(-1)!.journalId)!
    expect(j).toMatchObject({ type: 'Salary payment', source: 'Bank reconciliation', taxMonth: '2026-09', date: '2026-09-25' })
    expect(j.lines.map((l) => [l.account, l.debit, l.credit])).toEqual([[ACC.hutangGaji, 446_901_849, 0], [ACC.bca, 0, 446_901_849]])
    expect(payroll.bankLines.at(-1)).toMatchObject({ description: 'TRF PAYROLL SEP 2026', amount: 446_901_849, paymentId: payroll.payments.at(-1)!.id })
    expect(salary()).toMatchObject({ paid: 446_901_849, balance: 0, status: 'Paid', flags: [] })
    for (const k of ['pph21', 'pph26', 'bpjs-kesehatan', 'bpjs-ketenagakerjaan', 'dplk'] as const) {
      expect(simulateBankPayment(k, { date: '2026-10-05' }).ok, k).toBe(true)
      expect(journalById(payroll.payments.at(-1)!.journalId)!.type).toBe('Statutory payment')
    }
    expect(payablesTracker('2026-09').map((x) => x.status)).toEqual(['Paid', 'Paid', 'Paid', 'Paid', 'Paid', 'Paid'])
    expect(simulateBankPayment('pph21').message).toBe('Nothing open on Tax Payable - PPh 21.')
  })

  it('partial and overpaid; the salary row flags a bank amount that differs from the posted run', () => {
    expect(simulateBankPayment('partial', { date: '2026-09-25' }).amount).toBe(223_450_925)
    expect(salary()).toMatchObject({ status: 'Overdue', statusLabel: 'Overdue 10 days', balance: 223_450_924 })
    expect(salary().flags.map((f) => f.code)).toEqual(['bank-differs'])
    expect(salary().flags[0]!.message).toBe('Bank paid Rp223.450.925 against the posted run Rp446.901.849: under by Rp223.450.924.')
    simulateBankPayment('overpaid', { date: '2026-09-26' })
    expect(salary()).toMatchObject({ balance: -250_000, status: 'Overpaid', statusLabel: 'Overpaid Rp250.000' })
    expect(salary().flags[0]!.message).toMatch(/over by Rp250\.000\.$/)
    expect(salary().payments).toHaveLength(2)
  })

  it('a revision waiting shows the owed figure after it; the repost reverses the old amount and re-opens the salary row by the difference', () => {
    simulateBankPayment('salary', { date: '2026-09-25' })
    simulateSend('revision', { runId: run(SEP).id })
    expect(salary()).toMatchObject({ owed: 446_901_849, pendingOwed: 448_634_808 })
    reverseAndRepost(run(SEP).id)
    expect(salary()).toMatchObject({ owed: 448_634_808, balance: 1_732_959, pendingOwed: null })
  })

  it('e-Bupot: a role with the tax action types the PPh 21 filed total; the PPh 21 row flags a difference above Rp1.000', () => {
    const pph = () => payablesTracker('2026-09').find((r) => r.account === ACC.pph21)!
    expect(as('View only', () => setEbupotFiled('2026-09', 18_323_082)).status).toBe(403)
    expect(as('Accountant', () => setEbupotFiled('2026-09', 18_324_082)).ok).toBe(true)
    expect(pph().flags).toEqual([])
    expect(pph().ebupot).toMatchObject({ filed: 18_324_082, books: 18_323_082, difference: 1_000, by: 'Andi Pratama' })
    const r = as('Accountant', () => setEbupotFiled('2026-09', 18_324_083))
    expect(r.message).toBe('e-Bupot PPh 21 filed Rp18.324.083 is Rp1.001 above the books Rp18.323.082.')
    expect(pph().flags.map((f) => f.code)).toEqual(['ebupot-differs'])
    expect(pph21Month('2026-09')).toMatchObject({ rule: 18_323_082, books: 18_323_082, flagged: true })
  })
})

describe('manual journals on payroll accounts', () => {
  beforeEach(() => { resetPayroll(); setPayrollViewAs('Accountant + LM') })

  it('simulateManualJournal posts a JV on Hutang Gaji; the run and Payables warn', () => {
    mapInsentif()
    const sep = run(SEP)
    expect(manualJournalWarnings(sep.id)).toEqual([])
    const r = simulateManualJournal()
    expect(r.ok).toBe(true)
    expect(r.number).toBe('JV-0001')
    expect(journalById(String(r.journalId))).toMatchObject({ type: 'Manual', source: 'Manual journal', date: '2026-09-20' })
    const w = manualJournalWarnings(sep.id)
    expect(w).toHaveLength(1)
    expect(w[0]!.message).toBe('Manual journal JV-0001 (20 Sep 2026) posts Rp1.500.000 to Salaries and Salaries Payable, outside Talenta payroll.')
    expect(manualJournalWarnings('2026-09')).toEqual(w)
    expect(runWarnings(sep.id).some((x) => x.code === 'manual-journal')).toBe(true)
    postRun(sep.id)
    const row = payablesTracker('2026-09').find((x) => x.party === 'Staff')!
    expect(row.flags.map((f) => f.code)).toEqual(['manual-journal'])
    expect(row.owed).toBe(446_901_849)
    simulateManualJournal({ debit: ACC.bca, credit: ACC.cash, amount: 10_000 })
    expect(manualJournalWarnings(sep.id)).toHaveLength(1)
  })
})

describe('headcount from runs: keyed by user_id, counts only', () => {
  beforeEach(() => { resetPayroll(); setPayrollViewAs('Accountant + LM') })
  const grp = (h: ReturnType<typeof headcountChanges>, label: string) => h.groups.find((g) => g.label === label)!
  function resendWith(change: (roster: typeof payroll.roster) => void) {
    mapInsentif()
    change(payroll.roster)
    simulateSend('regular', { start: '2026-08-21', end: '2026-09-20', newAllowance: INS })
    return headcountChanges(run(SEP).id)
  }

  it('Jurnal reads salary detail only: no employee webhooks', () => {
    expect(SEND_KINDS.map((k) => k.kind)).toEqual(['regular', 'new-pay-item', 'revision', 'missing-component', 'partial', 'separate-run', 'duplicate', 'old-sync'])
    expect('events' in payroll).toBe(false)
  })

  it('seed: September against August shows one leaver, one joiner and one move', () => {
    const h = headcountChanges(run(SEP).id)
    expect(h.previous).toMatchObject({ label: '21 Jul-20 Aug 2026', month: '2026-08', version: 1 })
    expect([h.last, h.current]).toEqual([40, 40])
    expect(h.left).toBe(1)
    expect(h.joined).toBe(1)
    expect(h.moved).toEqual([{ from: 'Sales, Jakarta HQ', to: 'Sales, Surabaya' }])
    expect(grp(h, 'Sales, Bandung')).toMatchObject({ last: 2, current: 3, change: 1, joined: 1, left: 0, flagged: true })
    expect(grp(h, 'Sales, Surabaya')).toMatchObject({ last: 2, current: 2, change: 0, left: 1, movedIn: 1, flagged: true })
    expect(grp(h, 'Finance, Jakarta HQ')).toMatchObject({ last: 5, current: 5, flagged: false })
    expect([h.flagged, h.unexpected]).toEqual([3, 3])
  })

  it('a renumbered employee_id with the same user_id is not a leaver and a joiner', () => {
    const h = resendWith((r) => { r.find((e) => e.employee_id === 'EMP-0027')!.employee_id = 'EMP-1027' })
    expect(h.joined).toBe(1)
    expect(h.left).toBe(1)
    expect(JSON.stringify(h)).not.toMatch(/EMP-|510\d\d|user_id|employee_id/)
  })

  it('joiner and leaver', () => {
    const h = resendWith((r) => {
      r.push({ ...r.find((e) => e.employee_id === 'EMP-0041')!, user_id: 51_042, employee_id: 'EMP-0042', basic: 8_000_000 })
      r.find((e) => e.employee_id === 'EMP-0026')!.left = '2026-08-20'
    })
    expect(h.joined).toBe(2)
    expect(h.left).toBe(2)
  })

  it('Expected marks: optional note, never block Post, lapse when the people change', () => {
    mapInsentif()
    const sep = run(SEP)
    expect(as('View only', () => markHeadcountExpected(sep.id, 'Sales|Bandung')).status).toBe(403)
    expect(markHeadcountExpected(sep.id, 'Finance|Jakarta HQ').ok).toBe(false)
    expect(markHeadcountExpected(sep.id, 'Sales|Bandung').ok).toBe(true)
    expect(markHeadcountExpected(sep.id, 'Sales|Surabaya', 'Transfer covers the leaver').ok).toBe(true)
    expect(draftReview(sep.id).unexpectedHeadcount).toBe(1)
    expect(clearHeadcountExpected(sep.id, 'Sales|Bandung').ok).toBe(true)
    expect(draftReview(sep.id).unexpectedHeadcount).toBe(2)
    payroll.roster.push({ ...payroll.roster.find((e) => e.employee_id === 'EMP-0041')!, user_id: 51_042, employee_id: 'EMP-0042' })
    markHeadcountExpected(sep.id, 'Sales|Bandung')
    simulateSend('regular', { start: '2026-08-21', end: '2026-09-20', newAllowance: INS })
    expect(grp(headcountChanges(sep.id), 'Sales, Bandung').expected).toBeNull()
    expect(grp(headcountChanges(sep.id), 'Sales, Surabaya').expected!.note).toBe('Transfer covers the leaver')
    // Sales, Jakarta HQ was never marked; Sales, Bandung lapsed.
    expect(postRun(sep.id).warnings).toContain('2 headcount changes are not marked Expected.')
  })
})

describe('claims, access, copy', () => {
  beforeEach(() => { resetPayroll(); setPayrollViewAs('Accountant + LM') })

  it('claimsSummary lists the Reimbursement lines of a run', () => {
    const c = claimsSummary(run(AUG).id)
    expect(c.rows.length).toBeGreaterThan(0)
    expect(c.rows.every((r) => r.item === 'Reimbursement Medical' && r.journal === 'PAY-0002')).toBe(true)
    expect(c.total).toBe(c.rows.reduce((s, r) => s + r.amount, 0))
  })

  it('access: hidden actions per role', () => {
    const roles = ['Owner', 'Ultimate', 'Ultimate + LM', 'Accountant', 'Accountant + LM', 'View only'] as const
    const grid = (a: Parameters<typeof can>[0]) => roles.filter((r) => can(a, r))
    expect(grid('view')).toEqual([...roles])
    expect(grid('post')).toEqual(['Owner', 'Ultimate', 'Ultimate + LM', 'Accountant', 'Accountant + LM'])
    expect(grid('tax')).toEqual(['Owner', 'Ultimate', 'Ultimate + LM', 'Accountant', 'Accountant + LM'])
    expect(grid('setup')).toEqual(['Owner', 'Ultimate + LM', 'Accountant + LM'])
    expect(grid('correct')).toEqual(['Owner', 'Ultimate + LM', 'Accountant + LM'])
    expect(grid('connection')).toEqual(['Owner', 'Ultimate + LM'])
    expect(grid('simulate')).toEqual(['Owner', 'Ultimate', 'Ultimate + LM', 'Accountant', 'Accountant + LM'])
    // Accountant without LM: posts, cannot edit settings or post corrections.
    expect(as('Accountant', () => setPayday(26)).status).toBe(403)
    expect(as('Accountant', () => reverseAndRepost(run(SEP).id)).status).toBe(403)
    expect(as('Ultimate', () => lockPeriod('2026-08')).status).toBe(403)
    expect(as('View only', () => postRun(run(SEP).id)).status).toBe(403)
    expect(as('View only', () => simulateBankPayment('salary')).status).toBe(403)
  })

  it('group-map messages say dimension, never tag', () => {
    expect(mapGroup('Organization', 'New team', 'Nowhere').message).toBe('Pick a value from this dimension or create it first.')
  })

  it('old sync for a month already in Jurnal is blocked', () => {
    expect(simulateSend('old-sync')).toMatchObject({ ok: false, status: 'Blocked', message: 'Payroll for Aug 2026 is already in Jurnal. The old sync was blocked.' })
  })
})

describe('approval through Settings > Approval workflows (transaction type Payroll journal)', () => {
  beforeEach(() => { resetPayroll(); setPayrollViewAs('Accountant'); setApprovalWorkflowActive(PAYROLL_RULE, true) })
  const payrollTasks = () => awaitingApprovalTasks.filter((x) => x.docType === 'Payroll Journal')

  it('the seeded rule is the Payroll journal type, active, above Rp500.000.000, approved by an Owner', () => {
    const r = approvalWorkflows.find((x) => x.id === PAYROLL_RULE)!
    expect(r).toMatchObject({ name: 'Payroll journal above Rp500.000.000', appliesTo: 'transaction', transactionType: 'payroll-journal', minAmount: 500_000_000, isActive: true })
    expect(r.levels[0]!.approverIds).toHaveLength(1)
  })

  it('Post of September (Rp554.203.941) goes to Awaiting approval and the Inbox; the Owner approves and PAY posts', () => {
    mapInsentif()
    const sep = run(SEP)
    const r = postRun(sep.id)
    expect(r).toMatchObject({ ok: true, awaitingApproval: true })
    expect(liveJournals(sep.id)).toHaveLength(0)
    expect(runStatus(sep)).toBe('Awaiting approval')
    const task = payrollTasks()
    expect(task).toHaveLength(1)
    expect(task[0]).toMatchObject({ docType: 'Payroll Journal', total: 554_203_941, link: `/payroll-runs/${sep.id}`, requestedBy: 'Andi Pratama', status: 'awaiting approval' })
    expect(task[0]!.approvers!.map((a) => a.name)).toEqual(['Rizal Candra'])
    // Posting again or approving as the requester does nothing.
    expect(postRun(sep.id).ok).toBe(false)
    expect(approvePayroll(sep.id).status).toBe(403)
    expect(as('Owner', () => canApprove(sep.id))).toBe(true)
    const a = as('Owner', () => approvePayroll(sep.id))
    expect(a).toMatchObject({ ok: true, number: 'PAY-0003' })
    expect(runStatus(sep)).toBe('Posted')
    expect(liveJournals(sep.id)[0]!.postedBy).toBe('Rizal Candra')
    expect(payrollTasks()).toHaveLength(0)
  })

  it('Reject returns the run to its draft with the reason; Post sends it again', () => {
    mapInsentif()
    const sep = run(SEP)
    postRun(sep.id)
    expect(as('Owner', () => rejectPayroll(sep.id, '')).ok).toBe(false)
    expect(as('Owner', () => rejectPayroll(sep.id, 'Check the Sales incentive with HR')).ok).toBe(true)
    expect(runStatus(sep)).toBe('Ready to post')
    expect(sep.rejection).toMatchObject({ reason: 'Check the Sales incentive with HR', by: 'Rizal Candra' })
    expect(payrollTasks()).toHaveLength(0)
    expect(postRun(sep.id)).toMatchObject({ ok: true, awaitingApproval: true })
    expect(payrollTasks()).toHaveLength(1)
  })

  it('without a matching rule Post posts directly: below the threshold, rule off, or created-by out of scope', () => {
    const rule = approvalWorkflows.find((x) => x.id === PAYROLL_RULE)!
    mapInsentif()
    rule.minAmount = 600_000_000
    expect(postRun(run(SEP).id)).toMatchObject({ ok: true, number: 'PAY-0003' })
    resetPayroll(); setPayrollViewAs('Accountant'); mapInsentif()
    rule.minAmount = 500_000_000; rule.createdByScope = 'some'; rule.createdByUserIds = ['user-999']
    expect(postRun(run(SEP).id)).toMatchObject({ ok: true, number: 'PAY-0003' })
    rule.createdByScope = 'all'; rule.createdByUserIds = []
    resetPayroll(); setPayrollViewAs('Accountant'); mapInsentif()
    setApprovalWorkflowActive(PAYROLL_RULE, false)
    expect(postRun(run(SEP).id)).toMatchObject({ ok: true, number: 'PAY-0003' })
  })

  it('reverse and repost routes like a first post: the chosen date is kept; on approval the reversal and the new PAY post together on it', () => {
    setApprovalWorkflowActive(PAYROLL_RULE, false)
    setPayrollViewAs('Accountant + LM')
    postSep()
    const sep = run(SEP)
    const old = liveJournals(sep.id)[0]!
    simulateSend('revision', { runId: sep.id })
    setApprovalWorkflowActive(PAYROLL_RULE, true)
    // The repost is judged on the full new journal (Rp556.403.741), above the threshold.
    const r = reverseAndRepost(sep.id, { date: '2026-09-30' })
    expect(r).toMatchObject({ ok: true, awaitingApproval: true })
    expect(sep.approval).toMatchObject({ kind: 'repost', versionNo: 2, date: '2026-09-30' })
    expect(runStatus(sep)).toBe('Awaiting approval')
    expect(liveJournals(sep.id)).toEqual([old])
    expect(payrollTasks()).toHaveLength(1)
    const a = as('Owner', () => approvePayroll(sep.id))
    expect(a).toMatchObject({ ok: true, journals: ['PAY-0004', 'PAY-0005'] })
    expect(journalById(old.reversedById)!.date).toBe('2026-09-30')
    expect(liveJournals(sep.id).map((j) => [j.number, j.date, j.versionNo, j.postedBy])).toEqual([['PAY-0005', '2026-09-30', 2, 'Rizal Candra']])
    expect(sep.ledgerVersion).toBe(2)
    expect(payrollTasks()).toHaveLength(0)
  })

  it('a first post keeps its entry date through approval', () => {
    mapInsentif()
    const sep = run(SEP)
    expect(postRun(sep.id, { date: '2026-09-30' })).toMatchObject({ ok: true, awaitingApproval: true })
    expect(as('Owner', () => approvePayroll(sep.id))).toMatchObject({ ok: true, date: '2026-09-30' })
    expect(liveJournals(sep.id)[0]!.date).toBe('2026-09-30')
  })
})

describe('privacy: no employee data in anything Jurnal renders or exports', () => {
  beforeEach(() => { resetPayroll(); setPayrollViewAs('Accountant + LM'); setApprovalWorkflowActive(PAYROLL_RULE, false) })
  const LEAK = /EMP-\d|\b510\d\d\b|employee_id|user_id|employeeIds/

  it('headcount, draft review, warnings, why-this-line, correction summary, tax changes, notices and log carry counts only', () => {
    mapInsentif()
    const sep = run(SEP)
    const review = draftReview(sep.id)
    const why = review.lines.map((_, i) => whyLine(sep.id, i))
    simulateSend('duplicate')
    const out: unknown[] = [headcountChanges(sep.id), review, runWarnings(sep.id), why, postConfirmText(sep.id)]
    postRun(sep.id)
    simulateSend('revision', { runId: sep.id })
    const c = revisionOf(sep.id)!
    expect(c.summary).toMatchObject({ joined: 0, left: 0, amountChanged: 4 })
    out.push(c.summary, compareVersions(sep.id), syncLog.value, payroll.notices, payablesTracker('2026-09'), claimsSummary(sep.id))
    reverseAndRepost(sep.id)
    out.push(amendmentTasks.value, journalsOf(sep.id))
    // Journal line sources keep the user_id set internally (to count staff once across lines); no screen reads it.
    const shown = JSON.stringify(out, (k, v) => (k === 'staff' && Array.isArray(v) ? v.length : v))
    expect(shown).not.toMatch(LEAK)
  })

  it('a duplicate employee in a send is a count, never an id', () => {
    mapInsentif()
    simulateSend('regular', { start: '2026-08-21', end: '2026-09-20', newAllowance: INS, duplicateEmployee: 'EMP-0030' })
    const w = runWarnings(run(SEP).id).find((x) => x.code === 'duplicate-employee')!
    expect(w.message).toBe('1 employee appears more than once in this send. See who in Talenta.')
    expect(JSON.stringify(w)).not.toMatch(LEAK)
  })
})

describe('sync log and month headcount access (round 3)', () => {
  beforeEach(() => { resetPayroll(); setPayrollViewAs('Accountant + LM') })

  it('headcount.view: Owner and Ultimate + LM only', () => {
    const roles = ['Owner', 'Ultimate', 'Ultimate + LM', 'Accountant', 'Accountant + LM', 'View only'] as const
    expect(roles.filter((r) => can('headcount.view', r))).toEqual(['Owner', 'Ultimate + LM'])
  })

  it('sync log lists only what Talenta sent, with the agreed columns and results', () => {
    mapInsentif()
    const sep = run(SEP)
    postRun(sep.id)
    simulateSend('duplicate')
    simulateSend('revision', { runId: sep.id })
    simulateSend('old-sync')
    simulateBankPayment('salary')
    simulateManualJournal()
    const sends = payroll.log.filter((l) => l.type === 'Send')
    expect(payroll.log.some((l) => l.type !== 'Send')).toBe(true)
    expect(sendLog.value.length).toBeGreaterThan(0)
    expect(sendLog.value.every((r) => sends.some((l) => l.id === r.id))).toBe(true)
    expect(sendLog.value.map((r) => Object.keys(r).sort())[0]).toEqual(['at', 'id', 'payItems', 'period', 'reason', 'result', 'runId', 'staff', 'version'])
    expect(sendLog.value.every((r) => ['Accepted', 'Held', 'Duplicate', 'Rejected'].includes(r.result))).toBe(true)
    expect(sendLog.value.some((r) => r.result === 'Duplicate')).toBe(true)
    // Only a held send carries a reason.
    expect(sendLog.value.filter((r) => r.reason).every((r) => r.result === 'Held')).toBe(true)
    const accepted = sendLog.value.find((r) => r.result === 'Accepted' && r.runId)!
    expect(accepted.period).toMatch(/\d{4}/)
    expect(accepted.staff).toBeGreaterThan(0)
    expect(accepted.payItems).toBeGreaterThan(0)
    const csv = sendLogCsv().split('\r\n')
    expect(csv[0]).toBe(SEND_LOG_COLUMNS.join(','))
    expect(csv.length).toBe(sendLog.value.length + 1)
    expect(csv.join('\n')).not.toMatch(/Payment|Manual journal|PAY-\d|BNK-|JV-|Old sync|Next step/)
  })

  it('a send Jurnal refuses is Rejected', () => {
    receiveSalaryDetail({ ...buildSalaryDetail(payroll.roster, '2026-09-21', '2026-10-20', {}), company_id: 999 })
    expect(sendLog.value[0]!.result).toBe('Rejected')
  })
})

describe('settings: Connection, Pay items, Dimensions', () => {
  beforeEach(() => { resetPayroll(); setPayrollViewAs('Accountant + LM') })
  const sales = (lines: JournalLine[], acct: string) => lines.filter((l) => l.account === acct && l.tags.Organization === 'Sales').reduce((s, l) => s + l.debit - l.credit, 0)

  it('one account per pay item: a cost item takes any expense or COGS account and credits its party payable', () => {
    const key = payItemKey('Insentif Penjualan', 'allowance')
    const row = () => mappingFor('Insentif Penjualan', 'allowance')!
    expect(payItemType(row())).toBe('allowance')
    expect(setPayItemAccount(key, ACC.bpjsTk).message).toBe('Pick an expense or cost of goods sold account.')
    expect(setPayItemAccount(key, ACC.medical).ok).toBe(true)
    expect(row()).toMatchObject({ role: 'Earning', debit: ACC.medical, credit: ACC.hutangGaji, roleConfirmed: true })
    expect(payItemParty(row())).toBe('Staff')
    expect(runHolds(run(SEP))).toHaveLength(0)
    // A new item carries no group account yet: Sales staff book it to the row account too.
    expect(sales(draftOf(run(SEP))!.lines, ACC.medical)).toBe(11_000_000)
    // Deductions and tax take their payable; the party label follows.
    const bpjs = mappingFor('BPJSK Employee', 'deduction')!
    expect(payItemType(bpjs)).toBe('deduction')
    expect(payItemAccount(bpjs)).toBe(ACC.bpjsKes)
    expect(payItemParty(bpjs)).toBe('BPJS Kesehatan')
    expect(payItemType(mappingFor('PPH 21 Paid', 'deduction')!)).toBe('tax')
    expect(as('Accountant', () => setPayItemAccount(key, ACC.salaries)).status).toBe(403)
  })

  it('a group account line and a fixed dimension value land on the right journal lines', () => {
    mapInsentif()
    const key = payItemKey('Insentif Penjualan', 'allowance')
    expect(setPayItemSplit(key, { groupAccounts: [{ field: 'organization_name', value: 'Sales', account: ACC.salaries }], fixedTag: null }).ok).toBe(true)
    const lines = () => { rebuildDraft(run(SEP).id); return draftOf(run(SEP))!.lines }
    const ins = (acct: string) => lines().filter((l) => l.account === acct).flatMap((l) => l.sources).filter((x) => x.item === 'Insentif Penjualan').reduce((s, x) => s + x.amount, 0)
    expect(ins(ACC.salaries)).toBe(10_500_000)
    expect(ins(ACC.salesSalaries)).toBe(0)
    expect(lines().find((l) => l.account === ACC.salaries && l.sources.some((x) => x.item === 'Insentif Penjualan'))!.why[0]).toContain('For Sales use 6-60101 Salaries')
    // Fixed dimension value: every Insentif cost line carries Branch Jakarta HQ; the payable stays untagged.
    expect(setPayItemSplit(key, { groupAccounts: [], fixedTag: { dimension: 'Branch', value: 'Jakarta HQ' } }).ok).toBe(true)
    const tagged = lines().filter((l) => l.sources.some((x) => x.item === 'Insentif Penjualan') && l.debit > 0)
    expect(tagged.every((l) => l.tags.Branch === 'Jakarta HQ')).toBe(true)
    expect(lines().find((l) => l.account === ACC.hutangGaji)!.tags).toEqual({ Organization: null, Branch: null })
    expect(journalTotals(draftOf(run(SEP))!).debit).toBe(journalTotals(draftOf(run(SEP))!).credit)
    // Only cost items split.
    expect(setPayItemSplit(payItemKey('BPJSK Employee', 'deduction'), { groupAccounts: [{ field: 'organization_name', value: 'Sales', account: ACC.salaries }], fixedTag: null }).ok).toBe(false)
    expect(setPayItemSplit(key, { groupAccounts: [{ field: 'organization_name', value: 'Sales', account: ACC.bpjsKes }], fixedTag: null }).message).toBe('A group account must be an expense or cost of goods sold account.')
  })

  it('payable accounts per party move every row that credits the old payable', () => {
    mapInsentif()
    expect(addPayrollAccount({ code: '2-20513', name: 'BPJS TK Payable New', type: 'liability', party: null }).ok).toBe(true)
    expect(setPayableAccount('BPJS Ketenagakerjaan', '2-20513').ok).toBe(true)
    expect(mappingFor('JHT Employee', 'deduction')!.credit).toBe('2-20513')
    expect(mappingFor('JKK paid by company', 'benefit')!.credit).toBe('2-20513')
    rebuildDraft(run(SEP).id)
    expect(net(draftOf(run(SEP))!.lines, '2-20513')).toBe(38_969_133)
    expect(setPayableAccount('BPJS Kesehatan', '2-20513').message).toBe('BPJS TK Payable New is already the payable for BPJS Ketenagakerjaan.')
  })

  it('dimensions: a Talenta field feeds a Jurnal dimension, values match by name, unmatched values hold', () => {
    mapInsentif()
    expect(linkDimension('job_level', 'Job level').ok).toBe(true)
    const sep = run(SEP)
    rebuildDraft(sep.id)
    const h = runHolds(sep).find((x) => x.code === 'unmapped-group')!
    expect((h.details.groups as { value: string }[]).map((g) => g.value).sort()).toEqual(['Director', 'Manager', 'Staff', 'Supervisor'])
    expect(createMissingValues('job_level', ['Staff', 'Supervisor', 'Manager', 'Director']).created).toBe(4)
    expect(runHolds(sep)).toHaveLength(0)
    const cost = draftOf(sep)!.lines.filter((l) => l.debit > 0 && l.account === ACC.salaries)
    expect(cost.every((l) => !!l.tags['Job level'])).toBe(true)
    expect(draftOf(sep)!.lines.filter((l) => l.account === ACC.pph21).every((l) => !l.tags['Job level'])).toBe(true)
    // Empty value policy.
    expect(setFieldPolicy('job_level', 'skip').ok).toBe(true)
    expect(linkDimension('branch', 'Job level').message).toBe('Job level is already fed by Job level.')
    expect(createPayrollTag('Job level', 'Intern').ok).toBe(true)
  })

  it('start month: earlier runs are before go-live and the old sync is blocked from it', () => {
    expect(as('Accountant + LM', () => setStartMonth('2026-08')).status).toBe(403)
    expect(as('Owner', () => setStartMonth('2026-08')).message).toBe('A posted payroll journal sits before that month. Reverse it first.')
    expect(payroll.settings.cutover.firstLive).toBe('2026-07')
    expect(oldSyncExpense({ date: '2026-10-20', amount: 1, pattern: 'Payroll' })).toMatchObject({ status: 'Blocked', message: 'Payroll from Jul 2026 posts from Talenta runs. The old sync was blocked.' })
    expect(oldSyncExpense({ date: '2026-06-20', amount: 1, pattern: 'Payroll' }).status).toBe('Recorded')
    expect(as('Owner', () => setStartMonth('2026-06')).ok).toBe(true)
    expect(runs.value.find((r) => r.month === '2026-06')!.mode).toBe('Live')
  })
})

