import { describe, it, expect, beforeEach } from 'vitest'
import {
  payroll, resetPayroll, runs, runById, runStatus, runHolds, currentVersionOf, versionLabel, draftOf, liveJournals,
  journalTotals, journalById, simulateSend, setPayrollViewAs, setPayItemMapping, payItemKey, postRun, isDraftStale, setPayday,
  chooseRevision, chooseSeparateRun, revisionOf, repostVersions, reverseJournal, reverseAndRepost, lockPeriod, decidePartial,
  compareVersions, can, addPayrollAccount, syncLog, mapGroup, headcountChanges, markHeadcountExpected,
  setPayItemAccount, setPayItemGroupsCanChange, setPayableAccount, setGroupBy, setGroupAccount, setGroupDimension, saveGroup, groupRows, linkDimension, createMissingValues, setFieldPolicy, createPayrollTag,
  payItemType, payItemParty, payItemAccount, mappingFor, oldSyncExpense,
  clearHeadcountExpected, draftReview, runWarnings, acknowledgeWarning, postConfirmText, payablesTracker, simulateBankPayment,
  simulateManualJournal, manualJournalWarnings, pph21Month, sendFigures, staffRows, receiveSalaryDetail,
  claimsSummary, noticesFor, SEND_KINDS, BANK_PAYMENT_KINDS, type Run, type JournalLine,
  approvePayroll, rejectPayroll, canApprove, whyLine, journalsOf, defaultEntryDate, checkEntryDate, payrollAccount, rebuildDraft,
  revisionNotice, PARTY_NAME, startConnection, endConnection, confirmSource, setLimits,
  payablePrefill, recordPayablePayment, payablesSummary, reverseRun, versionOf, today, monthLabel, monthOf, payGroupKey, fieldValue,
  setTaxAccount,
} from '../app/data/payrollStore'
import { paymentHistory } from '../app/data/payrollUiPayables'
import { runRow, hrMessage, monthHeadcount } from '../app/data/payrollUiIntake'
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
    expect(r.message).toBe('Some amounts are below Rp0 or not whole rupiah. Ask HR to fix them in Talenta and send again.')
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
    expect(runHolds(sep)[0]!.message).toBe('1 pay item needs an account: Insentif Penjualan (allowance), Rp10.500.000, 7 staff. Pick its account to clear this.')
    // July is fully paid; August BPJS Kesehatan is left unpaid so Payables shows one overdue amount.
    expect(payablesTracker('2026-07').map((r) => r.status)).toEqual(['Paid', 'Paid', 'Paid', 'Paid', 'Paid', 'Paid'])
    expect(payablesTracker('2026-08').map((r) => r.status)).toEqual(['Paid', 'Paid', 'Paid', 'Overdue', 'Paid', 'Paid'])
    expect(payablesTracker('2026-08').find((r) => r.party === 'BPJS Kesehatan')).toMatchObject({ balance: 16_102_029, due: '2026-09-10' })
    for (const m of ['2026-07', '2026-08']) expect(payablesTracker(m).every((r) => r.flags.length === 0)).toBe(true)
    const pays = payroll.journals.filter((j) => j.type === 'Salary payment' || j.type === 'Statutory payment')
    expect(pays).toHaveLength(11)
    expect(pays.every((j) => j.source === 'Bank reconciliation' && /^BNK-\d{4}$/.test(j.number))).toBe(true)
    expect(payroll.bankLines).toHaveLength(11)
    expect(payroll.journals.every((j) => journalTotals(j).debit === journalTotals(j).credit)).toBe(true)
    expect(pph21Month('2026-08')).toMatchObject({ rule: 16_644_111, books: 16_644_111, paid: 16_644_111, balance: 0 })
  })

  it('persists under payroll:state-v10 (v9: Run.dryRun removed)', () => {
    // loadSnapshot is client-only; pin the key in the source.
    expect(readFileSync(resolve(__dirname, '..', 'app', 'data', 'payrollStore.ts'), 'utf8')).toContain("const SNAPSHOT_KEY = 'payroll:state-v10'")
    expect(payroll.runs.every((r) => !('dryRun' in r))).toBe(true)
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
    expect(postRun(sep.id, { versionNo: 1 }).message).toBe('Talenta sent v2 after this one. Review v2, then post.')
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

  it('a new group holds; saving it with an unmatched dimension value still holds until a value is picked', () => {
    mapInsentif()
    payroll.roster.find((e) => e.employee_id === 'EMP-0026')!.moves.push({ effective: '2026-09-01', to: { organization_name: 'Legal', branch_name: 'Jakarta HQ', cost_center_name: 'HQ Finance' } })
    simulateSend('regular', { start: '2026-08-21', end: '2026-09-20', newAllowance: INS })
    const sep = run(SEP)
    expect(runHolds(sep).map((h) => h.code)).toEqual(['new-group'])
    const key = groupRows().find((g) => g.isNew)!.key
    expect(saveGroup(key).ok).toBe(true)
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
    expect(sep.versions[1]!.holds[0]!.message).toBe('Only 10 of 40 staff were sent. No staff from Finance, Human Capital, Jakarta HQ and Surabaya. Use it as the full run, or reject it and ask HR to send all staff.')
    expect(sep.currentVersion).toBe(1)
    expect(decidePartial(sep.id, 2, 'reject').ok).toBe(true)
    expect(runStatus(sep)).toBe('Ready to post')
  })

  it('no total check exists: nothing compares against Talenta totals and no gap, suspense or rounding route remains', async () => {
    const store = await import('../app/data/payrollStore')
    for (const gone of ['totalGaps', 'releaseWithGap', 'releaseTaxHold', 'setSuspenseAccount', 'confirmPostAsFinanceManager', 'recordSalaryPayment', 'payStatutory', 'voidPayment', 'reconciliation', 'independentChecks', 'signOffMonth', 'pph21Annual', 'postDifference', 'postCorrection', 'correctionOf',
      // Removed with the final pass: no dry run, no start month screen, no tax presets screen, no e-Bupot, no PPh 21 amendment task.
      'dryRunJournal', 'setStartMonth', 'setTaxPreset', 'setEbupotFiled', 'amendmentTasks', 'closeAmendmentTask'])
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
    expect(w.map((x) => x.message)).toEqual(['PPH 21 Paid not in this send. Check with HR if it should be.'])
    expect(w[0]!.details).toMatchObject({ section: 'deduction', last: 'v1' })
    // The first send of a period compares with the last send of the previous regular run.
    resetPayroll()
    mapInsentif()
    simulateSend('regular', { start: '2026-09-21', end: '2026-10-20', omit: ['Uang Makan'] })
    const oct = runs.value[0]!
    // September sent Insentif Penjualan; October does not, so it is listed too.
    expect(runWarnings(oct.id).filter((x) => x.code === 'missing-component').map((x) => x.details.name)).toEqual(['Uang Makan', 'Insentif Penjualan'])
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
    // OQ21: the headcount warning goes only to Owner and Ultimate + LM (who can see the counts).
    expect(all.map((w) => w.code)).toEqual(['large-change', 'large-change', 'large-change', 'large-change'])
    expect(as('Owner', () => runWarnings(sep.id)).find((w) => w.code === 'headcount')!.message).toBe('Headcount changed in 3 groups, not marked as expected yet.')
    expect(all.find((w) => w.code === 'large-change')!.message).toMatch(/ from 21 Jul-20 Aug 2026\. Add a note or mark it as checked\.$/)
    const c = postConfirmText(sep.id)
    expect(c.title).toBe('Post journal for Payroll 21 Aug-20 Sep 2026?')
    expect(c.body).toMatch(/^Posts one payroll journal of Rp554\.203\.941 on 26 lines\. Journal date 20 Sep 2026\. 4 warnings not checked yet: /)
    expect(as('View only', () => acknowledgeWarning(sep.id, all[0]!.key)).status).toBe(403)
    expect(acknowledgeWarning(sep.id, all[0]!.key, 'Sales incentive started this month').ok).toBe(true)
    expect(runWarnings(sep.id)[0]!.acknowledged).toMatchObject({ note: 'Sales incentive started this month', by: 'Bayu Ferdian' })
    expect(postConfirmText(sep.id).warnings).toHaveLength(3)
    const r = postRun(sep.id)
    expect(r.ok).toBe(true)
    expect(r.warnings).toHaveLength(3)
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
    expect(j!.memo).toBe('Talenta payroll 21 Jul-20 Aug 2026, v1, sent 21 Aug 2026 10:00 WIB')
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
    expect(r.message).toBe('BPJS Ketenagakerjaan Payable is the payable for BPJS Ketenagakerjaan, but BPJSK Employee is owed to BPJS Kesehatan. Pick the BPJS Kesehatan payable.')
    mapInsentif()
    expect(addPayrollAccount({ code: '2-20513', name: 'Other Payroll Payable', type: 'liability', party: null }).ok).toBe(true)
    expect(setPayItemMapping(payItemKey('BPJSK Employee', 'deduction'), { credit: '2-20513' }).ok).toBe(true)
    expect(setPayItemMapping(payItemKey('JHT Employee', 'deduction'), { credit: '2-20513' }).ok).toBe(true)
    const sep = run(SEP)
    expect(postRun(sep.id).stale).toBe(true)
    expect(runHolds(sep).find((h) => h.code === 'two-parties')!.message).toBe('Other Payroll Payable is the payable for both BPJS Kesehatan and BPJS Ketenagakerjaan. Give each its own payable in Payroll settings > Pay items.')
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
    expect(noticesFor('Accountant')[0]!.text).toBe('Talenta sent Payroll 21 Aug-20 Sep 2026 again (v2). Take-home pay +Rp1.732.959, 4 staff changed. Review it, then use v2 and repost.')
    expect(revisionNotice(sep, c.summary)).toBe(noticesFor('Accountant')[0]!.text)
    expect(postRun(sep.id).message).toBe('v1 is posted as PAY-0003. Use v2 and repost.')
    expect(postConfirmText(sep.id).title).toBe('Use v2 and repost Payroll 21 Aug-20 Sep 2026?')
    expect(postConfirmText(sep.id).body).toMatch(/^Reverses PAY-0003 in full and posts v2 in full of Rp556\.403\.741 on \d+ lines\. Journal date 20 Sep 2026\./)
    expect(syncLog.value.find((l) => l.type === 'Send' && l.version === 2)!.reason).toBe('Talenta sent this period again. Use v2 and repost.')
    expect(repostVersions(sep.id).map((v) => v.no)).toEqual([2])
  })

  it('reverse and repost: the old PAY reversed in full and the new PAY in full, both on the chosen date; payables follow', () => {
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

  it('a version that moves nothing in the ledger becomes the posted version at once', () => {
    postSep()
    const sep = run(SEP)
    simulateSend('regular', { start: '2026-08-21', end: '2026-09-20', newAllowance: INS, taxShift: { from: 'EMP-0026', to: 'EMP-0027', amount: 50_000 } })
    expect(runStatus(sep)).toBe('Posted')
    expect(sep.ledgerVersion).toBe(2)
    expect(revisionOf(sep.id)).toBeNull()
    expect(syncLog.value.find((l) => l.type === 'Send' && l.status === 'No change')!.reason).toBe('Tax figures changed, the posted journal did not')
  })

  it('a revision of a locked month: the default date is refused with a clear message; a date in an open period posts and keeps the tax month', () => {
    const aug = run(AUG)
    expect(as('Owner', () => lockPeriod('2026-08')).ok).toBe(true)
    simulateSend('revision', { runId: aug.id })
    expect(reverseAndRepost(aug.id)).toMatchObject({ ok: false, message: 'Aug 2026 is locked. Pick a journal date in an open month.' })
    expect(liveJournals(aug.id).map((j) => j.number)).toEqual(['PAY-0002'])
    const d = reverseAndRepost(aug.id, { date: '2026-09-01' })
    expect(d.ok).toBe(true)
    const j = journalById(String(d.journalId))!
    expect(j).toMatchObject({ date: '2026-09-01', taxMonth: '2026-08', versionNo: 2 })
    expect(journalById(journalsOf(aug.id).find((x) => x.number === 'PAY-0002')!.reversedById)!.date).toBe('2026-09-01')
    expect(reverseAndRepost(aug.id, { date: '2026-08-01' }).ok).toBe(false)
    expect(checkEntryDate('2026-06-30', { date: '2026-09-01', number: 'PAY-0004' })).toBe('Pick a journal date on or after 1 Sep 2026, the date of PAY-0004.')
  })

  it('Reverse undoes the whole chain', () => {
    postSep()
    const sep = run(SEP)
    simulateSend('revision', { runId: sep.id })
    expect(reverseAndRepost(sep.id).ok).toBe(true)
    expect(liveJournals(sep.id).map((j) => j.type)).toEqual(['Payroll'])
    expect(reverseJournal(liveJournals(sep.id)[0]!.id, { confirmPayments: true }).ok).toBe(true)
    expect(runStatus(sep)).toBe('Reversed')
    expect(reverseJournal(payroll.journals.filter((j) => j.type === 'Reversal').pop()!.id).message).toBe('A reversal can\'t be reversed. Post the run again instead.')
  })

  it('compareVersions lists pay items, lines and staff by user_id', () => {
    postSep()
    simulateSend('missing-component', { runId: run(SEP).id })
    const cmp = compareVersions(run(SEP).id, 1, 2)
    expect(cmp.byPayItem.find((r) => r.name === 'PPH 21 Paid')).toMatchObject({ section: 'deduction', new: 0, missing: true })
    expect(cmp.headcount).toEqual({ added: [], removed: [] })
  })
})

describe('journal date on every post', () => {
  beforeEach(() => { resetPayroll(); setPayrollViewAs('Accountant + LM') })

  it('defaults to the last day of the pay period and takes an override', () => {
    mapInsentif()
    const sep = run(SEP)
    expect(defaultEntryDate(sep)).toBe('2026-09-20')
    expect(postConfirmText(sep.id).body).toMatch(/Journal date 20 Sep 2026\./)
    expect(postConfirmText(sep.id, '2026-09-30').body).toMatch(/Journal date 30 Sep 2026\./)
    const r = postRun(sep.id, { date: '2026-09-30' })
    expect(r).toMatchObject({ ok: true, date: '2026-09-30' })
    expect(liveJournals(sep.id)[0]!.date).toBe('2026-09-30')
    resetPayroll(); mapInsentif()
    expect(postRun(run(SEP).id)).toMatchObject({ ok: true, date: '2026-09-20' })
  })

  it('a date in a locked period is refused with a clear message and nothing posts', () => {
    mapInsentif()
    const sep = run(SEP)
    expect(checkEntryDate('2026-07-31')).toBe('Jul 2026 is locked. Pick a journal date in an open month.')
    expect(postRun(sep.id, { date: '2026-07-31' })).toMatchObject({ ok: false, status: 422, message: 'Jul 2026 is locked. Pick a journal date in an open month.' })
    expect(postRun(sep.id, { date: 'not a date' }).message).toBe('Pick a journal date.')
    expect(liveJournals(sep.id)).toHaveLength(0)
  })
})

describe('months before the start month: draft shown, never posted (no dry run)', () => {
  beforeEach(() => { resetPayroll(); setPayrollViewAs('Accountant + LM') })

  it('June arrived before the start month: its draft builds, labelled Before go-live, and Post refuses with a plain reason', () => {
    const jun = runs.value.find((r) => r.month === '2026-06')!
    expect(jun.mode).toBe('Before go-live')
    expect(runStatus(jun)).toBe('Before go-live')
    expect(draftOf(jun)).not.toBeNull()
    expect(postRun(jun.id)).toMatchObject({ ok: false, message: 'This month is before the start month, so it is not posted.' })
    expect(liveJournals(jun.id)).toHaveLength(0)
    expect(runRow(jun).nextStep).toBe('Before start month, not posted.')
  })

  it('previewDryRun stays only as the engine behind reverse and repost of an older version: it stores and posts nothing', async () => {
    const store = await import('../app/data/payrollStore')
    mapInsentif()
    const sep = run(SEP)
    const before = JSON.stringify({ j: payroll.journals, seq: payroll.seq, m: payroll.settings.mapping.length, v: sep.versions, log: payroll.log.length })
    const p = store.previewDryRun(sep.id)
    expect(p.draft!.lines.reduce((s, l) => s + l.debit, 0)).toBe(554_203_941)
    expect(JSON.stringify({ j: payroll.journals, seq: payroll.seq, m: payroll.settings.mapping.length, v: sep.versions, log: payroll.log.length })).toBe(before)
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
      expect(simulateBankPayment(k, { date: '2026-10-05', month: '2026-09' }).ok, k).toBe(true)
      expect(journalById(payroll.payments.at(-1)!.journalId)!.type).toBe('Statutory payment')
    }
    expect(payablesTracker('2026-09').map((x) => x.status)).toEqual(['Paid', 'Paid', 'Paid', 'Paid', 'Paid', 'Paid'])
    expect(simulateBankPayment('pph21').message).toBe('Nothing is owed to Tax office (PPh 21).')
  })

  it('partial and overpaid; the salary row flags a bank amount that differs from the posted run', () => {
    expect(simulateBankPayment('partial', { date: '2026-09-25' }).amount).toBe(223_450_925)
    expect(salary()).toMatchObject({ status: 'Overdue', statusLabel: 'Overdue 10 days', balance: 223_450_924 })
    expect(salary().flags.map((f) => f.code)).toEqual(['bank-differs'])
    expect(salary().flags[0]!.message).toBe('Bank paid Rp223.450.925, the posted run owes Rp446.901.849: under by Rp223.450.924. Check the bank match in bank reconciliation.')
    simulateBankPayment('overpaid', { date: '2026-09-26' })
    expect(salary()).toMatchObject({ balance: -250_000, status: 'Overpaid', statusLabel: 'Overpaid Rp250.000' })
    expect(salary().flags[0]!.message).toMatch(/over by Rp250\.000\. Check the bank match in bank reconciliation\.$/)
    expect(salary().payments).toHaveLength(2)
  })

  it('a revision waiting shows the owed figure after it; the repost reverses the old amount and re-opens the salary row by the difference', () => {
    simulateBankPayment('salary', { date: '2026-09-25' })
    simulateSend('revision', { runId: run(SEP).id })
    expect(salary()).toMatchObject({ owed: 446_901_849, pendingOwed: 448_634_808 })
    reverseAndRepost(run(SEP).id)
    expect(salary()).toMatchObject({ owed: 448_634_808, balance: 1_732_959, pendingOwed: null })
  })

  // e-Bupot filed total removed (user decision 2026-10-12): Payables track owed and paid only.
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
    expect(w[0]!.message).toBe('Manual journal JV-0001 (20 Sep 2026) posts Rp1.500.000 to Salaries and Salaries Payable, outside Talenta payroll. Check it is not booked twice.')
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
    expect(SEND_KINDS.map((k) => k.kind)).toEqual(['regular', 'new-pay-item', 'new-group', 'revision', 'missing-component', 'partial', 'separate-run', 'duplicate', 'old-sync'])
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
    expect(as('Owner', () => runWarnings(sep.id)).map((w) => w.message)).toContain('Headcount changed in 2 groups, not marked as expected yet.')
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
    expect(simulateSend('old-sync')).toMatchObject({ ok: false, status: 'Blocked', message: 'Payroll for Aug 2026 is already in Jurnal, so the old Talenta to Expense sync was blocked.' })
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
    out.push(journalsOf(sep.id))
    // Journal line sources keep the user_id set internally (to count staff once across lines); no screen reads it.
    const shown = JSON.stringify(out, (k, v) => (k === 'staff' && Array.isArray(v) ? v.length : v))
    expect(shown).not.toMatch(LEAK)
  })

  it('a duplicate employee in a send is a count, never an id', () => {
    mapInsentif()
    simulateSend('regular', { start: '2026-08-21', end: '2026-09-20', newAllowance: INS, duplicateEmployee: 'EMP-0030' })
    const w = runWarnings(run(SEP).id).find((x) => x.code === 'duplicate-employee')!
    expect(w.message).toBe('1 staff member appears more than once in this send. See who in Talenta.')
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

  it('group account applies only to pay items set to Use group account', () => {
    as('Accountant + LM', () => setPayItemMapping(payItemKey('Insentif Penjualan', 'allowance'), { role: 'Earning', debit: ACC.medical, credit: ACC.hutangGaji }))
    const key = payItemKey('Insentif Penjualan', 'allowance')
    const lines = () => { rebuildDraft(run(SEP).id); return draftOf(run(SEP))!.lines }
    const ins = (acct: string) => lines().filter((l) => l.account === acct).flatMap((l) => l.sources).filter((x) => x.item === 'Insentif Penjualan').reduce((s, x) => s + x.amount, 0)
    expect(ins(ACC.salesSalaries)).toBe(0)
    expect(setPayItemGroupsCanChange(key, true).ok).toBe(true)
    expect(ins(ACC.salesSalaries)).toBe(10_500_000)
    expect(journalTotals(draftOf(run(SEP))!).debit).toBe(journalTotals(draftOf(run(SEP))!).credit)
    expect(lines().find((l) => l.account === ACC.hutangGaji)!.tags).toEqual({ Organization: null, Branch: null })
    expect(setPayItemGroupsCanChange(payItemKey('BPJSK Employee', 'deduction'), true).ok).toBe(false)
  })

  it('multi-field grouping: Organization + Branch rows; a group account moves only that group and its dimension values land on cost lines', () => {
    mapInsentif()
    expect(setGroupBy(['organization_name', 'branch']).ok).toBe(true)
    const rows = groupRows()
    expect(rows.some((r) => r.isNew)).toBe(false)
    const sb = rows.find((r) => r.label === 'Sales, Bandung')!
    expect(sb.staff).toBe(3)
    expect(sb.account).toBe(ACC.salesSalaries)
    const before = journalTotals(draftOf(run(SEP))!).debit
    expect(setGroupAccount(sb.key, ACC.directLabour).ok).toBe(true)
    expect(setGroupDimension(sb.key, 'Branch', 'Jakarta HQ').ok).toBe(true)
    rebuildDraft(run(SEP).id)
    const d = draftOf(run(SEP))!
    expect(journalTotals(d).debit).toBe(before)
    expect(journalTotals(d).debit).toBe(journalTotals(d).credit)
    expect(d.lines.some((l) => l.account === ACC.directLabour && l.tags.Organization === 'Sales' && l.tags.Branch === 'Jakarta HQ')).toBe(true)
    expect(d.lines.filter((l) => !isCostCode(l.account)).every((l) => !l.tags.Organization && !l.tags.Branch)).toBe(true)
  })

  it('a send with a new group holds, and setting it up clears the hold', () => {
    mapInsentif()
    expect(setGroupBy(['organization_name', 'branch']).ok).toBe(true)
    const sep = run(SEP)
    expect(runHolds(sep)).toHaveLength(0)
    simulateSend('new-group', { runId: sep.id })
    const h = runHolds(sep)
    expect(h.map((x) => x.code)).toEqual(['new-group'])
    expect(h[0]!.message).toBe('New group: Operations, Medan (2 staff). Set it up in Payroll settings > Groups.')
    const row = groupRows().find((r) => r.isNew)!
    expect(row).toMatchObject({ label: 'Operations, Medan', staff: 2 })
    expect(createPayrollTag('Branch', 'Medan').ok).toBe(true)
    expect(runHolds(sep).map((x) => x.code)).toEqual(['new-group'])
    expect(saveGroup(row.key).ok).toBe(true)
    expect(runHolds(sep)).toHaveLength(0)
    expect(draftOf(sep)).not.toBeNull()
  })

  it('payable accounts per party move every row that credits the old payable', () => {
    mapInsentif()
    expect(addPayrollAccount({ code: '2-20513', name: 'BPJS TK Payable New', type: 'liability', party: null }).ok).toBe(true)
    expect(setPayableAccount('BPJS Ketenagakerjaan', '2-20513').ok).toBe(true)
    expect(mappingFor('JHT Employee', 'deduction')!.credit).toBe('2-20513')
    expect(mappingFor('JKK paid by company', 'benefit')!.credit).toBe('2-20513')
    rebuildDraft(run(SEP).id)
    expect(net(draftOf(run(SEP))!.lines, '2-20513')).toBe(38_969_133)
    expect(setPayableAccount('BPJS Kesehatan', '2-20513').message).toBe('BPJS TK Payable New is already the payable for BPJS Ketenagakerjaan. Pick another account.')
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
    expect(linkDimension('branch', 'Job level').message).toBe('Job level is already linked to Job level. Pick another dimension.')
    expect(createPayrollTag('Job level', 'Intern').ok).toBe(true)
  })

  it('old sync: blocked from the start month (the connect month), still posts before it; no screen moves the start month', () => {
    expect(payroll.settings.cutover.firstLive).toBe('2026-07')
    expect(oldSyncExpense({ date: '2026-10-20', amount: 1, pattern: 'Payroll' })).toMatchObject({ status: 'Blocked', message: 'Payroll from Jul 2026 comes from Talenta payroll runs, so the old Talenta to Expense sync was blocked.' })
    expect(oldSyncExpense({ date: '2026-06-20', amount: 1, pattern: 'Payroll' })).toMatchObject({ status: 'Recorded', message: 'Before the start month, so the old Talenta to Expense sync still posts it.' })
    expect(oldSyncExpense({ date: '2026-10-20', amount: 1, pattern: 'Claim' }).status).toBe('Recorded')
  })

  it('connection: only Owner or Ultimate + LM; messages say how to fix', () => {
    expect(as('Accountant + LM', () => endConnection('Moving to another HR system')).message).toBe('Only Owner or Ultimate + LM can do this.')
    expect(as('Owner', () => startConnection(1212)).message).toBe('Talenta is already connected. Disconnect it first to connect another company.')
    expect(as('Owner', () => endConnection('short')).message).toBe('Enter a reason of 10 to 200 characters.')
    expect(as('Owner', () => confirmSource()).message).toBe('The company is already confirmed.')
  })
})

describe('groups: any Talenta fields, New groups hold until set up, only Use group account items move', () => {
  beforeEach(() => { resetPayroll(); setPayrollViewAs('Accountant + LM'); mapInsentif() })
  const sepLines = () => { rebuildDraft(run(SEP).id); return draftOf(run(SEP))!.lines }
  const itemOn = (lines: JournalLine[], acct: string, item: string) => lines.filter((l) => l.account === acct).flatMap((l) => l.sources).filter((x) => x.item === item && x.side === 'D').reduce((s, x) => s + x.amount, 0)

  it('three fields: one row per combination with staff counts; settings carry over when the fields change', () => {
    expect(setGroupBy(['organization_name', 'branch']).ok).toBe(true)
    const fin = groupRows().find((r) => r.label === 'Finance, Jakarta HQ')!
    expect(setGroupAccount(fin.key, ACC.directLabour).ok).toBe(true)
    expect(setGroupBy(['organization_name', 'branch', 'job_level']).ok).toBe(true)
    const rows = groupRows()
    expect(rows.every((r) => r.values.length === 3)).toBe(true)
    expect(rows.reduce((s, r) => s + r.staff, 0)).toBe(40)
    expect(rows.some((r) => r.isNew)).toBe(false)
    const finRows = rows.filter((r) => r.values[0] === 'Finance' && r.values[1] === 'Jakarta HQ')
    expect(finRows.length).toBeGreaterThan(1)
    expect(finRows.every((r) => r.account === ACC.directLabour)).toBe(true)
    // Back to two fields: the rows agreed on Direct Labour, so the merged row keeps it.
    expect(setGroupBy(['organization_name', 'branch']).ok).toBe(true)
    expect(groupRows().find((r) => r.key === fin.key)!.account).toBe(ACC.directLabour)
    expect(itemOn(sepLines().filter((l) => l.tags.Organization === 'Finance'), ACC.directLabour, 'Basic Salary')).toBeGreaterThan(0)
    expect(setGroupBy(['organization_name', 'nope' as never]).message).toBe('Pick fields from the Talenta list.')
  })

  it('a field linked to a dimension: each group row picks the value; it lands on that group\'s cost lines only', () => {
    expect(setGroupBy(['organization_name', 'branch']).ok).toBe(true)
    const row = groupRows().find((r) => r.label === 'Finance, Jakarta HQ')!
    expect(row.dimensions.map((d) => [d.dimension, d.value, d.explicit])).toEqual([['Organization', 'Finance', false], ['Branch', 'Jakarta HQ', false]])
    expect(setGroupDimension(row.key, 'Branch', 'Bandung').ok).toBe(true)
    expect(groupRows().find((r) => r.key === row.key)!.dimensions[1]).toMatchObject({ value: 'Bandung', explicit: true })
    const lines = sepLines()
    expect(lines.some((l) => l.tags.Organization === 'Finance' && l.tags.Branch === 'Bandung' && isCostCode(l.account))).toBe(true)
    expect(lines.some((l) => l.tags.Organization === 'Finance' && l.tags.Branch === 'Jakarta HQ')).toBe(false)
    expect(setGroupDimension(row.key, 'Branch', 'Atlantis').message).toBe('Pick a value from this dimension or create it first.')
  })

  it('New group: the run holds; Set up group (account, dimension value or Save) clears it on its own', () => {
    expect(setGroupBy(['organization_name', 'branch']).ok).toBe(true)
    const sep = run(SEP)
    simulateSend('new-group', { runId: sep.id })
    expect(runHolds(sep).map((h) => h.code)).toEqual(['new-group'])
    expect(runStatus(sep)).toBe('Held')
    expect(postRun(sep.id).message).toBe('New group: Operations, Medan (2 staff). Set it up in Payroll settings > Groups.')
    expect(syncLog.value.find((l) => l.type === 'Send' && l.runId === sep.id && l.status === 'Held')!.nextStep).toBe('Set up the group in Payroll settings > Groups. The run is checked again when you save.')
    expect(sendLog.value[0]!).toMatchObject({ result: 'Held', reason: 'New group' })
    const row = groupRows().find((r) => r.isNew)!
    expect(as('Accountant', () => setGroupAccount(row.key, ACC.directLabour)).message).toBe('Only Owner, Ultimate + LM or Accountant + LM can change this.')
    expect(setGroupAccount(row.key, ACC.bpjsTk).message).toBe('Pick an expense or cost of goods sold account.')
    expect(setGroupAccount(row.key, ACC.directLabour).ok).toBe(true)
    expect(groupRows().find((r) => r.key === row.key)!.isNew).toBe(false)
    // Set up, but Medan has no Branch value in Jurnal yet: that is the one thing left to fix.
    expect(runHolds(sep).map((h) => h.code)).toEqual(['unmapped-group'])
    expect(runHolds(sep)[0]!.message).toBe('1 Talenta value has no dimension value: Medan (2 staff). Pick a value or create it.')
    expect(createPayrollTag('Branch', 'Medan').ok).toBe(true)
    expect(setGroupDimension(row.key, 'Branch', 'Medan').ok).toBe(true)
    expect(runHolds(sep)).toHaveLength(0)
    expect(groupRows().find((r) => r.key === row.key)!.isNew).toBe(false)
    expect(itemOn(draftOf(sep)!.lines.filter((l) => l.tags.Branch === 'Medan'), ACC.directLabour, 'Basic Salary')).toBeGreaterThan(0)
    expect(runStatus(sep)).toBe('Ready to post')
  })

  it('Use group account: only items set so take the group expense account; Use default account items and deductions never move', () => {
    const lines = sepLines()
    // Sales groups use Sales Salaries for salary (Use group account); the reimbursement stays on its own account.
    expect(itemOn(lines, ACC.salesSalaries, 'Basic Salary')).toBeGreaterThan(0)
    expect(itemOn(lines, ACC.salesSalaries, 'Reimbursement Medical')).toBe(0)
    const basic = payItemKey('Basic Salary', 'allowance')
    const allBasic = [ACC.salaries, ACC.salesSalaries, ACC.directLabour].reduce((s, a) => s + itemOn(lines, a, 'Basic Salary'), 0)
    expect(itemOn(lines, ACC.directLabour, 'Basic Salary')).toBeGreaterThan(0)
    expect(setPayItemGroupsCanChange(basic, false).ok).toBe(true)
    const after = sepLines()
    // Use default account: every group's Basic Salary books to the pay item account; other items keep moving.
    expect(itemOn(after, ACC.salesSalaries, 'Basic Salary') + itemOn(after, ACC.directLabour, 'Basic Salary')).toBe(0)
    expect(itemOn(after, ACC.salaries, 'Basic Salary')).toBe(allBasic)
    expect(itemOn(after, ACC.salesSalaries, 'Tunjangan Jabatan')).toBe(itemOn(lines, ACC.salesSalaries, 'Tunjangan Jabatan'))
    expect(journalTotals(draftOf(run(SEP))!).debit).toBe(journalTotals({ lines }).debit)
    expect(setPayItemGroupsCanChange(payItemKey('PPH 21 Paid', 'deduction'), true).message).toBe('Only an allowance or a benefit can use the group\'s expense account.')
  })
})

describe('approval routing and journal date', () => {
  beforeEach(() => { resetPayroll(); setPayrollViewAs('Accountant'); mapInsentif() })

  it('above the rule: Send for approval keeps the journal date; Inbox task names the action; only the approver can Approve and post', () => {
    setApprovalWorkflowActive(PAYROLL_RULE, true)
    const sep = run(SEP)
    const r = postRun(sep.id, { date: '2026-09-25' })
    expect(r).toMatchObject({ ok: true, awaitingApproval: true, message: 'Sent for approval to Rizal Candra (Payroll journal above Rp500.000.000). It posts when approved.' })
    const task = awaitingApprovalTasks.find((x) => x.docType === 'Payroll Journal')!
    expect(task).toMatchObject({ label: 'Payroll 21 Aug-20 Sep 2026 v1: Post journal', details: 'Journal date 25 Sep 2026. Approve and post, or reject, on the run page.' })
    expect(postRun(sep.id).message).toBe('Already sent for approval. Waiting for Rizal Candra.')
    expect(as('Accountant + LM', () => approvePayroll(sep.id))).toMatchObject({ ok: false, status: 403, message: 'Only Rizal Candra can approve or reject this, as set in Approval workflows.' })
    expect(as('Owner', () => rejectPayroll(sep.id, ' ')).message).toBe('Enter a reason so the sender knows what to fix.')
    expect(as('Owner', () => approvePayroll(sep.id))).toMatchObject({ ok: true, date: '2026-09-25', approvedBy: 'Rizal Candra' })
    expect(as('Owner', () => approvePayroll(sep.id)).message).toBe('Nothing on this run waits for approval. Reload the page.')
    setApprovalWorkflowActive(PAYROLL_RULE, false)
  })

  it('a repost task says Use vN and repost', () => {
    setPayrollViewAs('Accountant + LM')
    const sep = run(SEP)
    expect(postRun(sep.id).ok).toBe(true)
    simulateSend('revision', { runId: sep.id })
    setApprovalWorkflowActive(PAYROLL_RULE, true)
    const r = reverseAndRepost(sep.id)
    expect(r, String(r.message)).toMatchObject({ ok: true, awaitingApproval: true })
    expect(awaitingApprovalTasks.find((x) => x.docType === 'Payroll Journal')!.label).toBe('Payroll 21 Aug-20 Sep 2026 v2: Use v2 and repost')
    setApprovalWorkflowActive(PAYROLL_RULE, false)
  })

  it('journal date: default is the pay period end, never before the journal a repost reverses; a locked month is refused on post and repost', () => {
    const sep = run(SEP)
    expect(defaultEntryDate(sep)).toBe('2026-09-20')
    setPayrollViewAs('Accountant + LM')
    expect(postRun(sep.id, { date: '2026-09-28' }).ok).toBe(true)
    simulateSend('revision', { runId: sep.id })
    expect(defaultEntryDate(sep)).toBe('2026-09-28')
    expect(reverseAndRepost(sep.id, { date: '2026-09-21' }).message).toBe('Pick a journal date on or after 28 Sep 2026, the date of PAY-0003.')
    expect(as('Owner', () => lockPeriod('2026-09', { confirm: true })).ok).toBe(true)
    expect(reverseAndRepost(sep.id).message).toBe('Sep 2026 is locked. Pick a journal date in an open month.')
    expect(reverseAndRepost(sep.id, { date: '2026-10-01' })).toMatchObject({ ok: true, date: '2026-10-01' })
  })
})

describe('copy: every string the engine returns follows the glossary', () => {
  beforeEach(() => { resetPayroll(); setPayrollViewAs('Accountant + LM'); setApprovalWorkflowActive(PAYROLL_RULE, false) })
  /** Engine words and terms the glossary replaced. Status enum values are not text and are not scanned. */
  const BANNED = /\b(revision|revise[ds]?|entry date|employees?|run key|snapshot|payload|webhook|role|Earning|acknowledg\w*|go-live|dry run|tags?|preset|ledger version|re-send)\b|1212 \/ monthly|—|S-\d+\b|draft\d+|run\d+/i
  const TEXT_KEYS = new Set(['message', 'reason', 'nextStep', 'text', 'title', 'body', 'label', 'details', 'why', 'warnings', 'memo', 'statusLabel', 'dueLabel', 'kind'])
  function texts(x: unknown, key = '', out: string[] = []): string[] {
    if (typeof x === 'string') { if (TEXT_KEYS.has(key)) out.push(x) }
    else if (Array.isArray(x)) x.forEach((v) => texts(v, key, out))
    else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) texts(v, TEXT_KEYS.has(key) && k !== 'code' && k !== 'key' ? key : k, out)
    return out
  }

  it('holds, warnings, why-this-line, results, sync log, notices, approval task, post confirm, payables flags', () => {
    const out: unknown[] = []
    const sep = run(SEP)
    out.push(runHolds(sep), postRun(sep.id), simulateSend('duplicate'), simulateSend('partial', { runId: sep.id }))
    out.push(as('View only', () => postRun(sep.id)), as('Accountant', () => setPayItemAccount(payItemKey('Basic Salary', 'allowance'), ACC.salaries)))
    out.push(decidePartial(sep.id, 2, 'reject'))
    mapInsentif()
    const review = draftReview(sep.id)
    out.push(review.warnings, review.lines.map((_, i) => whyLine(sep.id, i)), postConfirmText(sep.id))
    simulateSend('regular', { start: '2026-08-21', end: '2026-09-20', newAllowance: INS, duplicateEmployee: 'EMP-0030', taxOff: [{ employeeId: 'EMP-0030', amount: 14_940 }] })
    out.push(runWarnings(sep.id), postRun(sep.id, { date: '2026-07-31' }), postRun(sep.id, { date: 'x' }))
    simulateManualJournal()
    out.push(postRun(sep.id))
    simulateSend('revision', { runId: sep.id })
    out.push(postConfirmText(sep.id), postRun(sep.id), reverseAndRepost(sep.id, { date: '2026-09-01' }))
    setApprovalWorkflowActive(PAYROLL_RULE, true)
    out.push(reverseAndRepost(sep.id), awaitingApprovalTasks.filter((x) => x.docType === 'Payroll Journal'))
    out.push(as('Owner', () => approvePayroll(sep.id)))
    setApprovalWorkflowActive(PAYROLL_RULE, false)
    simulateSend('separate-run', { runId: sep.id })
    out.push(runHolds(sep), chooseSeparateRun(sep.id, 99, { type: 'THR', name: '' }))
    out.push(simulateBankPayment('partial'), payablesTracker('2026-09'), simulateSend('old-sync'), oldSyncExpense({ date: '2026-06-20', amount: 1, pattern: 'Payroll' }))
    out.push(reverseJournal(payroll.journals.find((j) => j.type === 'Reversal')!.id), reverseJournal('nope'))
    // Pay from Payroll payables: the prefill, the Spend money result, its journal, refusals and the log.
    const kes = payablesTracker('2026-08').find((r) => r.party === 'BPJS Kesehatan')!
    out.push(payablePrefill(kes.key), recordPayablePayment(kes.key, { cashTxId: 'bw-new-5', number: 'Spend money #5', bank: ACC.bca, date: '2026-10-05', amount: kes.balance }))
    out.push(recordPayablePayment('gone', { cashTxId: 'x', number: 'Spend money #6', bank: ACC.bca, date: '2026-10-05', amount: 1 }), recordPayablePayment(kes.key, { cashTxId: 'x', number: 'Spend money #6', bank: ACC.bca, date: '2026-10-05', amount: 0 }))
    out.push(as('View only', () => recordPayablePayment(kes.key, { cashTxId: 'x', number: 'Spend money #6', bank: ACC.bca, date: '2026-10-05', amount: 1 })))
    const spend = payroll.journals.find((j) => j.source === 'Spend money')!
    out.push(spend, reverseJournal(spend.id), reverseRun(sep.id), payablesTracker('2026-08'))
    expect(reverseJournal(spend.id).message).toBe('Spend money #5 is a Spend money payment. Change or delete it in Cash management.')
    expect(syncLog.value.find((l) => l.type === 'Post' && l.reason.startsWith('Posted as'))!.nextStep).toBe('Salaries payable clears when you pay it from Payroll payables or bank reconciliation matches the payment.')
    out.push(as('Owner', () => lockPeriod('2026-10')), setPayday(40), setLimits({}), linkDimension('job_level', ' '))
    out.push(runs.value.map(runRow), hrMessage(3, '21 Aug-20 Sep 2026'), monthHeadcount('2026-09'))
    out.push(syncLog.value.map((l) => ({ reason: l.reason, nextStep: l.nextStep })), sendLog.value, payroll.notices)
    const all = texts(out).filter(Boolean)
    expect(all.length).toBeGreaterThan(80)
    // Talenta's pay item names and the chart's account names are data, not copy ("JHT Employee", "Employee Receivables").
    const names = [...payroll.settings.mapping.map((m) => m.name), ...payroll.accounts.map((a) => a.name)].sort((a, b) => b.length - a.length)
    const strip = (x: string) => names.reduce((s, n) => s.split(n).join(''), x)
    const bad = all.filter((x) => BANNED.test(strip(x)))
    if (bad.length) console.log('BANNED>>', JSON.stringify([...new Set(bad)], null, 1))
    expect(bad).toEqual([])
    // Errors say how to fix: every failed result's message ends in an instruction or a reason, never a bare "No".
    expect(all.some((x) => /Your role|Nothing to decide|not found\.?$/.test(x))).toBe(false)
  })

  it('party names in engine text follow the glossary', () => {
    expect(PARTY_NAME).toEqual({ Staff: 'Staff', 'DJP PPh 21': 'Tax office (PPh 21)', 'DJP PPh 26': 'Tax office (PPh 26)', 'BPJS Kesehatan': 'BPJS Kesehatan', 'BPJS Ketenagakerjaan': 'BPJS Ketenagakerjaan', Other: 'DPLK' })
    expect(SEND_KINDS.map((k) => k.label).join(' | ')).not.toMatch(BANNED)
    expect(BANK_PAYMENT_KINDS.map((k) => k.label).join(' | ')).not.toMatch(/deposit/i)
  })
})

describe('privacy: no employee identifier in any returned payload', () => {
  beforeEach(() => { resetPayroll(); setPayrollViewAs('Owner'); setApprovalWorkflowActive(PAYROLL_RULE, false) })
  const LEAK = /EMP-\d|\b510\d\d\b|employee_id|user_id|employee_name|Karyawan/

  it('every reader the screens and tours use, after a full month: groups, holds, approval, repost, payables', async () => {
    const store = await import('../app/data/payrollStore')
    mapInsentif()
    setGroupBy(['organization_name', 'branch'])
    const sep = run(SEP)
    simulateSend('new-group', { runId: sep.id })
    const out: unknown[] = [runHolds(sep), groupRows(), store.sourceSummary(sep.id)]
    saveGroup(groupRows().find((r) => r.isNew)!.key)
    out.push(draftReview(sep.id), runWarnings(sep.id), postConfirmText(sep.id), claimsSummary(sep.id), store.taxFigures(sep.id))
    setApprovalWorkflowActive(PAYROLL_RULE, true)
    setPayrollViewAs('Accountant')
    out.push(postRun(sep.id), awaitingApprovalTasks.filter((x) => x.docType === 'Payroll Journal'))
    setPayrollViewAs('Owner')
    out.push(approvePayroll(sep.id))
    setApprovalWorkflowActive(PAYROLL_RULE, false)
    simulateSend('revision', { runId: sep.id })
    out.push(revisionOf(sep.id), store.compareVersions(sep.id), reverseAndRepost(sep.id))
    out.push(simulateBankPayment('salary'), payablesTracker(), runs.value.map(runRow), monthHeadcount('2026-09'), sendLog.value, syncLog.value, payroll.notices, journalsOf(sep.id))
    const shown = JSON.stringify(out, (k, v) => (k === 'staff' && Array.isArray(v) ? v.length : v))
    expect(shown).not.toMatch(LEAK)
  })
})


describe('Pay a payable from Cash management (Spend money)', () => {
  beforeEach(() => { resetPayroll(); setPayrollViewAs('Accountant + LM') })
  it('prefills the open balance and saving pays the payable', () => {
    const row = () => payablesTracker('2026-08').find((r) => r.party === 'BPJS Kesehatan')!
    expect(row()).toMatchObject({ status: 'Overdue', balance: 16_102_029 })
    const pre = payablePrefill(row().key)!
    expect(pre).toMatchObject({ account: ACC.bpjsKes, payee: 'BPJS Kesehatan', amount: 16_102_029, month: '2026-08' })
    expect(payablePrefill(payablesTracker('2026-08').find((r) => r.party === 'Staff')!.key)).toBeNull()
    const res = recordPayablePayment(pre.key, { cashTxId: 'bw-new-1', number: 'Spend money #1', bank: ACC.bca, date: '2026-10-05', amount: 16_102_029 })
    expect(res.ok).toBe(true)
    expect(row()).toMatchObject({ balance: 0, paid: 16_102_029 })
    expect(row().payments[0]).toMatchObject({ number: 'Spend money #1', cashTxId: 'bw-new-1' })
    const j = payroll.journals.find((x) => x.number === 'Spend money #1')!
    expect(j.lines.map((l) => [l.account, l.debit, l.credit])).toEqual([[ACC.bpjsKes, 16_102_029, 0], [ACC.bca, 0, 16_102_029]])
    expect(recordPayablePayment(pre.key, { cashTxId: 'x', number: 'Spend money #2', bank: ACC.bca, date: '2026-07-10', amount: 1 }).message).toBe('Jul 2026 is locked. Pick a date in an open month.')
  })
})


/**
 * One figure, one value, on every screen that shows it. `agree()` reads the engine the way each
 * screen does (inbox row, run page stat cards, sync log, draft review, month headcount, Settings >
 * Groups, Payroll payables rows, cards and Payments tab, claims) and checks they match each other
 * and the journals. It runs on the seed, after the PAY-2 flow (plus Pay with Spend money) and after
 * the PAY-3 flow (reverse and repost).
 */
describe('numbers agree across screens', () => {
  beforeEach(() => { resetPayroll(); setPayrollViewAs('Accountant + LM') })
  const HG = ACC.hutangGaji
  const byAccount = (lines: JournalLine[]) => {
    const m = new Map<string, number>()
    for (const l of lines) m.set(l.account, (m.get(l.account) ?? 0) + l.credit - l.debit)
    for (const [k, v] of m) if (!v) m.delete(k)
    return Object.fromEntries([...m].sort())
  }
  const lineKey = (l: JournalLine) => [l.account, l.tags.Organization, l.tags.Branch, l.debit, l.credit].join('|')
  /**
   * The monthly run flow (as the PAY-2 tour plays it, through the engine API only): group by
   * Organization + Branch, map the new pay item from the hold, Talenta sends a New group, set it up,
   * mark warnings checked, send for approval, the Owner approves, the bank pays salary and a
   * second transfer over it, a manual journal on Salaries Payable.
   */
  function monthlyRun() {
    const sep = run(SEP)
    as('Owner', () => setGroupBy(['organization_name', 'branch']))
    setPayItemAccount(payItemKey('Insentif Penjualan', 'allowance'), ACC.salesSalaries)
    simulateSend('new-group', { runId: sep.id })
    const key = groupRows().find((g) => g.label === 'Operations, Medan')!.key
    setGroupAccount(key, ACC.directLabour); createPayrollTag('Branch', 'Medan'); setGroupDimension(key, 'Branch', 'Medan'); saveGroup(key)
    for (const w of runWarnings(sep.id)) acknowledgeWarning(sep.id, w.key, 'Checked')
    setApprovalWorkflowActive(PAYROLL_RULE, true)
    expect(postRun(sep.id).awaitingApproval).toBe(true)
    expect(as('Owner', () => approvePayroll(sep.id)).ok).toBe(true)
    setApprovalWorkflowActive(PAYROLL_RULE, false)
    simulateBankPayment('salary', { runId: sep.id, date: '2026-09-25' })
    simulateBankPayment('overpaid', { runId: sep.id, date: '2026-09-26' })
    simulateManualJournal()
  }
  /** The re-send flow (PAY-3): September posted and paid, Talenta sends it again, Use v2 and repost (approved), October without Uang Makan. */
  function resend() {
    const sep = run(SEP)
    as('Owner', () => setGroupBy(['organization_name', 'branch']))
    setPayItemAccount(payItemKey('Insentif Penjualan', 'allowance'), ACC.salesSalaries)
    for (const w of runWarnings(sep.id)) acknowledgeWarning(sep.id, w.key, 'Checked')
    expect(postRun(sep.id).ok).toBe(true)
    simulateBankPayment('salary', { runId: sep.id, date: '2026-09-25' })
    simulateSend('revision', { runId: sep.id })
    setApprovalWorkflowActive(PAYROLL_RULE, true)
    expect(reverseAndRepost(sep.id).awaitingApproval).toBe(true)
    expect(as('Owner', () => approvePayroll(sep.id)).ok).toBe(true)
    setApprovalWorkflowActive(PAYROLL_RULE, false)
    simulateSend('regular', { omit: ['Uang Makan'], newAllowance: INS })
  }

  function agree(stage: string) {
    const rows = payablesTracker()
    // Every journal balances (PAY, reversal, bank match, Spend money, manual).
    for (const j of payroll.journals) expect(journalTotals(j).debit, `${stage}: ${j.number} balances`).toBe(journalTotals(j).credit)

    for (const r of payroll.runs) {
      const v = currentVersionOf(r)!
      const row = runRow(r)
      const fig = sendFigures(v)
      // Inbox row = run page stat cards (versionFigures of the current version) = sync log row of that version.
      expect([row.staff, row.takeHome], `${stage}: ${r.label} ${r.month} inbox = run page`).toEqual([fig.staff, fig.takeHome])
      // A separate run (THR) was logged as a send of the regular run it moved from; it has no send row of its own.
      const log = r.kind === 'Regular' ? sendLog.value.find((l) => l.runId === r.id && l.version === `v${v.no}`)! : null
      if (log) expect(log.staff, `${stage}: ${r.month} v${v.no} sync log staff`).toBe(fig.staff)
      if (v.draft) {
        const review = draftReview(r.id)
        if (log) expect(log.payItems, `${stage}: ${r.month} sync log pay items = draft review`).toBe(review.payItems.length)
        expect(review.takeHome, `${stage}: ${r.month} draft review take-home`).toBe(fig.takeHome)
        // Month headcount = the draft review's headcount block.
        if (r.kind === 'Regular') {
          const mh = monthHeadcount(r.month)
          expect([mh.current, mh.joined, mh.left, mh.moved.length, mh.groups.map((g) => [g.label, g.current, g.joined, g.left, g.movedIn, g.movedOut])], `${stage}: ${r.month} month headcount`)
            .toEqual([review.headcount.current, review.headcount.joined, review.headcount.left, review.headcount.moved.length, review.headcount.groups.map((g) => [g.label, g.current, g.joined, g.left, g.movedIn, g.movedOut])])
          expect(review.headcount.current).toBe(fig.staff)
        }
      }
      const live = liveJournals(r.id)
      if (!live.length) continue
      const posted = versionOf(r, r.ledgerVersion)!
      const lines = live.flatMap((j) => j.lines)
      // Take-home of the posted version = Salaries Payable credit on its PAY journal = the salary row's owed.
      const sal = rows.find((x) => x.runId === r.id)!
      expect([sendFigures(posted).takeHome, net(lines, HG)], `${stage}: ${r.month} take-home = Salaries Payable credit`).toEqual([sal.owed, sal.owed])
      // The journal by account = the draft review lines it was posted from.
      if (r.currentVersion === r.ledgerVersion) {
        expect(byAccount(lines), `${stage}: ${r.month} journal = draft review`).toEqual(byAccount(draftReview(r.id).lines))
        expect(lines.map(lineKey).sort()).toEqual(draftReview(r.id).lines.map(lineKey).sort())
      } else {
        // A newer version waits: the row shows what is owed after the repost.
        expect(sal.pendingOwed, `${stage}: ${r.month} pending owed`).toBe(net(draftOf(r)!.lines, HG))
      }
      // Claims section = the reimbursement lines in the journal.
      const reimb = payroll.settings.mapping.filter((m) => m.role === 'Reimbursement').map((m) => m.name)
      const claimLines = lines.flatMap((l) => l.sources.filter((x) => reimb.includes(x.item) && x.side === 'D'))
      expect(claimsSummary(r.id).total, `${stage}: ${r.month} claims`).toBe(claimLines.reduce((s, x) => s + x.amount, 0))
      expect(claimsSummary(r.id).total).toBe(draftReview(r.id).payItems.filter((x) => reimb.includes(x.name)).reduce((s, x) => s + x.amount, 0))
    }

    // Payables: owed = the party's credits on the month's payroll journals; paid = bank matches + Spend money.
    const months = [...new Set(rows.map((x) => x.month))]
    for (const m of months) {
      const payrollJ = payroll.journals.filter((j) => j.taxMonth === m && j.source === 'Talenta payroll' && (j.type === 'Payroll' || j.type === 'Reversal'))
      const paidJ = payroll.journals.filter((j) => j.taxMonth === m && (j.type === 'Salary payment' || j.type === 'Statutory payment'))
      for (const a of payroll.accounts.filter((x) => x.party && x.party !== 'Staff')) {
        const owed = net(payrollJ.flatMap((j) => j.lines), a.code)
        const row = rows.find((x) => x.month === m && x.account === a.code)
        if (!row) { expect(owed, `${stage}: ${a.name} ${m} has no row`).toBe(0); continue }
        expect(row.owed, `${stage}: ${row.label} owed`).toBe(owed)
        expect(row.label).toBe(`${a.name} ${monthLabel(m)}`)
      }
      for (const row of rows.filter((x) => x.month === m)) {
        const scope = (j: { runId: string | null }) => !row.runId || j.runId === row.runId
        const paid = paidJ.filter(scope).flatMap((j) => j.lines).filter((l) => l.account === row.account).reduce((s, l) => s + l.debit - l.credit, 0)
        const pays = payroll.payments.filter((x) => x.account === row.account && x.month === m && (!row.runId || x.runId === row.runId))
        expect([row.paid, row.payments.reduce((s, x) => s + x.amount, 0)], `${stage}: ${row.label} paid`).toEqual([paid, paid])
        expect(row.payments.map((x) => x.id).sort()).toEqual(pays.map((x) => x.id).sort())
        expect(row.balance, `${stage}: ${row.label} balance`).toBe(row.owed - row.paid)
        // Status follows the balance and the due date.
        const past = !!row.due && today() > row.due
        const want = row.balance < 0 ? 'Overpaid' : row.balance === 0 ? ['Paid', 'Paid late'] : past ? 'Overdue' : row.paid > 0 ? 'Partly paid' : 'Open'
        if (Array.isArray(want)) expect(want, `${stage}: ${row.label} ${row.status}`).toContain(row.status)
        else expect(row.status, `${stage}: ${row.label}`).toBe(want)
        if (row.status === 'Overdue') expect(row.overdueDays).toBeGreaterThan(0)
        if (row.status.startsWith('Paid')) expect(row.balance).toBe(0)
      }
    }
    // Every payment sits on exactly one row; the Payments tab lists the same payments with the row's name and source.
    expect(rows.flatMap((x) => x.payments).length, `${stage}: payments on rows`).toBe(payroll.payments.length)
    for (const h of paymentHistory.value) {
      const p = payroll.payments.find((x) => x.id === h.id)!
      const row = rows.find((x) => x.payments.some((y) => y.id === h.id))!
      expect([h.amount, h.payable, h.statement], `${stage}: payment ${h.number}`).toEqual([p.amount, row.label, p.cashTxId ? 'Spend money' : 'Bank reconciliation'])
    }
    // Summary cards = the sum of the rows (and the Payments tab for Paid this month).
    const sum = payablesSummary(rows)
    const open = rows.filter((x) => x.balance > 0), late = rows.filter((x) => x.status === 'Overdue')
    expect(sum.stillOwed).toEqual({ amount: open.reduce((s, x) => s + x.balance, 0), count: open.length })
    expect(sum.overdue).toEqual({ amount: late.reduce((s, x) => s + x.balance, 0), count: late.length })
    const thisMonth = paymentHistory.value.filter((x) => x.date.startsWith(sum.month))
    expect(sum.paidThisMonth).toEqual({ amount: thisMonth.reduce((s, x) => s + x.amount, 0), count: thisMonth.length })

    // Settings > Groups staff = the latest regular send's staff per combination.
    const latest = runs.value.find((r) => r.kind === 'Regular')!
    const counts = new Map<string, Set<number>>()
    for (const e of staffRows(currentVersionOf(latest)!.payload)) {
      const k = payGroupKey(payroll.settings.groupBy, payroll.settings.groupBy.map((f) => fieldValue(e, f).trim()))
      counts.set(k, (counts.get(k) ?? new Set()).add(e.user_id))
    }
    for (const g of groupRows()) expect(g.staff, `${stage}: group ${g.label}`).toBe(counts.get(g.key)?.size ?? 0)
    expect(groupRows().reduce((s, g) => s + g.staff, 0)).toBe(sendFigures(currentVersionOf(latest)).staff)
    return rows
  }

  it('on the seed', () => {
    const rows = agree('seed')
    const sum = payablesSummary(rows)
    expect(sum.overdue).toEqual({ amount: 16_102_029, count: 1 })
    expect(sum.stillOwed).toEqual({ amount: 16_102_029, count: 1 })
    expect(groupRows().reduce((s, g) => s + g.staff, 0)).toBe(40)
  })

  it('after the PAY-2 flow, and after Pay settles the overdue payable with Spend money', () => {
    monthlyRun()
    agree('PAY-2')
    const sep = run(SEP)
    expect(runStatus(sep)).toBe('Posted')
    expect(sendLog.value.find((l) => l.runId === sep.id && l.version === 'v2')).toMatchObject({ staff: 40, payItems: 23 })
    const kes = payablesTracker('2026-08').find((r) => r.party === 'BPJS Kesehatan')!
    const before = payablesSummary()
    expect(recordPayablePayment(kes.key, { cashTxId: 'bw-new-9', number: 'Spend money #9', bank: ACC.bca, date: today(), amount: kes.balance }).ok).toBe(true)
    const rows = agree('PAY-2 + Pay')
    const after = payablesSummary(rows)
    expect(after.overdue.amount).toBe(before.overdue.amount - kes.balance)
    expect(after.paidThisMonth.amount).toBe(before.paidThisMonth.amount + kes.balance)
    expect(rows.find((r) => r.key === kes.key)).toMatchObject({ status: 'Paid late', balance: 0 })
  })

  it('edge sends: a duplicate staff row, a THR run on the latest period, a bank match and a Spend money payment', () => {
    // Talenta sends September with one staff member twice: the inbox, run page and sync log all count 40 staff.
    mapInsentif()
    simulateSend('regular', { start: '2026-08-21', end: '2026-09-20', newAllowance: INS, duplicateEmployee: 'EMP-0030' })
    const sep = run(SEP)
    expect(currentVersionOf(sep)!.payload.items).toHaveLength(41)
    expect([runRow(sep).staff, sendLog.value[0]!.staff]).toEqual([40, 40])
    expect(postRun(sep.id).ok).toBe(true)
    // A THR-only send on the posted period becomes a separate run; Settings > Groups still counts the regular send.
    simulateSend('separate-run', { runId: sep.id })
    expect(chooseSeparateRun(sep.id, currentVersionOf(sep)!.no + 1, { type: 'THR', name: 'THR 2026', reason: 'Religious holiday bonus paid with September' }).ok).toBe(true)
    // Payments read with the row's own name in the memo and the log, by bank match and by Spend money.
    simulateBankPayment('salary', { runId: sep.id, date: '2026-09-25' })
    const kes = payablesTracker('2026-08').find((r) => r.party === 'BPJS Kesehatan')!
    recordPayablePayment(kes.key, { cashTxId: 'bw-new-7', number: 'Spend money #7', bank: ACC.bca, date: today(), amount: kes.balance })
    const rows = agree('edge')
    for (const p of payroll.payments) {
      const row = rows.find((r) => r.payments.some((x) => x.id === p.id))!
      expect(journalById(p.journalId)!.memo.startsWith(`${row.label}, `), `${row.label}: ${journalById(p.journalId)!.memo}`).toBe(true)
    }
  })

  it('after the PAY-3 flow: the reversal mirrors the old journal on the new journal\'s date, and the payable follows the new journal', () => {
    resend()
    agree('PAY-3')
    const sep = run(SEP)
    const pay = journalsOf(sep.id).filter((j) => j.source === 'Talenta payroll')
    const [old, rev, neu] = [pay.find((j) => j.type === 'Payroll' && j.reversedById)!, pay.find((j) => j.type === 'Reversal')!, liveJournals(sep.id)[0]!]
    expect(rev.reversesId).toBe(old.id)
    expect(rev.date).toBe(neu.date)
    expect(rev.lines.map((l) => [l.account, l.tags, l.debit, l.credit])).toEqual(old.lines.map((l) => [l.account, l.tags, l.credit, l.debit]))
    const sal = payablesTracker('2026-09').find((r) => r.runId === sep.id)!
    expect(sal.owed).toBe(net(neu.lines, HG))
    expect(sal.owed).toBe(sendFigures(versionOf(sep, sep.ledgerVersion)).takeHome)
  })
})

describe('Reverse follows the locked-period rule of Post', () => {
  beforeEach(() => { resetPayroll(); setPayrollViewAs('Owner') })
  it('refuses a journal date in a locked month instead of moving it', () => {
    const aug = payroll.runs.find((r) => r.month === '2026-08' && liveJournals(r.id).length)!
    const j = liveJournals(aug.id)[0]!
    lockPeriod(monthOf(j.date), { confirm: true })
    const r = reverseRun(aug.id, { date: j.date, confirmPayments: true })
    expect(r.ok).toBe(false)
    expect(r.message).toBe(`${monthLabel(monthOf(j.date))} is locked. Pick a journal date in an open month.`)
    expect(liveJournals(aug.id).length).toBe(1)
  })
})

describe('PM decisions 2026-10-12 (OQ19, OQ21)', () => {
  beforeEach(() => { resetPayroll() })
  it('OQ19: the DTP and severance tax accounts are set on Pay items, Set up access only', () => {
    setPayrollViewAs('Accountant')
    expect(setTaxAccount('dtp', ACC.pph21).ok).toBe(false)
    setPayrollViewAs('Accountant + LM')
    expect(setTaxAccount('dtp', ACC.bpjsKes).message).toContain('is already the payable for')
    expect(setTaxAccount('resign', ACC.pph21).ok).toBe(true)
    expect(payroll.settings.taxPresets.resign).toBe(ACC.pph21)
  })
  it('OQ21: the Headcount warning reaches only roles that can see the headcount table', () => {
    const codes = (role: Parameters<typeof setPayrollViewAs>[0]) => {
      setPayrollViewAs(role)
      return payroll.runs.flatMap((r) => runWarnings(r.id)).filter((w) => w.code === 'headcount').length
    }
    const owner = codes('Owner')
    expect(owner).toBeGreaterThan(0)
    expect(codes('Ultimate + LM')).toBe(owner)
    expect(codes('Accountant + LM')).toBe(0)
    expect(codes('Accountant')).toBe(0)
  })
})
