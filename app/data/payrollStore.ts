/**
 * Payroll to Ledger (Jurnal x Talenta): ONE reactive state and every rule.
 *
 * HR settles in Talenta, the Accountant consumes in Jurnal. Jurnal reads one webhook,
 * "Send Salary Detail via Webhook" (final payload, 19 Nov 2025): company_id, sent_at,
 * period { start_date, end_date }, items[] { employee { user_id, employee_id, employee_name,
 * job_position, job_level, employment_status, organization_name, branch, cost_center, sbu[] },
 * components { allowances[], deductions[], benefits[] } }. No totals, no run type. Amounts are
 * whole rupiah >= 0. Jurnal drops employee_name at intake (stored blank, never shown).
 * Take-home pay = sum(allowances) - sum(deductions); benefits are employer-paid and not in it;
 * Hutang Gaji = take-home pay. Tax figures arrive as components (benefits: PPh 21 Benefit,
 * PPh 21 Resign Benefit, PPh 26 Benefit, Total PPh 21 DTP Received; deductions: PPH 21 Paid,
 * PPH 21 Payment). Staff are keyed by user_id internally and shown as counts only.
 * Every figure is computed on read. Persists under `erp-db:payroll:state-v6`; resetPayroll()
 * returns to the sample.
 *
 * ─── API (UI agents: this block is the contract) ─────────────────────────────
 * State and roles
 *   payroll                         reactive state (runs, journals, payments, bankLines, ebupot, settings, log, ...). Read it, never write it.
 *   can(action)                     true when the View as role may take the action (hide the control when false).
 *                                   Roles (View as): Owner, Ultimate, Ultimate + LM, Accountant, Accountant + LM, View only.
 *                                   Actions: view (all), post and tax (all but View only), setup and correct (Owner, Ultimate + LM,
 *                                   Accountant + LM), connection (Owner, Ultimate + LM), simulate (demo stand-ins, all but View only).
 *   setPayrollViewAs(role)          switch the acting role. actingPerson() returns the name for records.
 *
 * Privacy: no employee data leaves the engine. Names are dropped at intake; employee_id and user_id
 * are read only to count. Headcount, correction summaries, warnings, why-this-line, tax changes and
 * the log carry counts per group, never ids. "See who in Talenta" is the way to the people.
 *
 * Approval (payrollApproval.ts, Settings > Approval workflows, transaction type 'payroll-journal')
 *   postRun / postCorrection        when an active rule matches (journal total above the threshold, created-by scope) the run
 *                                   goes to 'Awaiting approval' and returns { ok: true, awaitingApproval: true, message }; an
 *                                   Inbox > Awaiting approval task links to /payroll-runs/<id>.
 *   pendingApproval(run), canApprove(runId), approvePayroll(runId) (posts), rejectPayroll(runId, reason) (back to draft).
 *   resetPayroll()                  rebuild the sample through the engine (simulated sends, posts, bank matches).
 *   today()                         the sample clock's date ("2026-10-05" at seed). nowWib() for display.
 *   rupiah(n), wib(iso), dateLabel(d), monthLabel('2026-09'), periodLabel(start, end), listLabel(xs), tagsLabel(tags)   formatters.
 *   accountName(code), accountLabel(code), payrollAccount(code), isPayrollAccount(code)   account lookups.
 *
 * Connection (TS-01)
 *   connection                      computed: status, companyId, last accepted send, rejected sends, other-entity groups.
 *   startConnection(companyId) / endConnection(reason) / restartConnection(companyId)   can('connection').
 *   confirmSource()                 The Owner (or Ultimate + LM) confirms the first send's source; holds clear, drafts build.
 *   sourceSummary(runId)            organizations, branches, headcount (user_id), take-home total of a run's latest send.
 *   answerOtherEntities(yes) / markOtherEntity('organization_name'|'branch', value, on)
 *   setStartMonth('2026-07')        Start booking from this month (can('connection')); the old Talenta to Expense
 *                                   sync is blocked from it, earlier runs stay Before go-live.
 *
 * Settings, versioned (LR-9): Connection, Pay items, Dimensions
 *   settings                        computed: the current settings. snapshotById(id), currentSnapshotId().
 *   payItemKey(name, section), mappingFor(name, section), suggestRole(name, section), suggestMapping(name, section)
 *   payItemType(row) 'allowance'|'deduction'|'benefit'|'tax', isCostItem(row), payItemAccount(row), payItemParty(row)
 *   setPayItemAccount(key, account) the row's one account: a cost item debits it (any expense or COGS account) and credits
 *                                   its party's payable; a deduction or tax item credits it and debits Hutang Gaji.
 *   setPayItemSplit(key, { groupAccounts[{ field, value, account }], fixedTag { dimension, value } | null })
 *                                   cost items only: "For Sales use Sales Salaries" lines and one fixed dimension value.
 *   setPayableAccount(party, code)  Payable accounts: the payable each party is owed on (settings.payables).
 *   validateMapping(row), setPayItemMapping(key, patch, overrideReason?)   the full-row save with guardrails.
 *   Every save re-checks held runs (holds clear on their own).
 *   Dimensions: settings.dimensionLinks[{ field, dimension, empty 'hold'|'skip' }] (cost lines only).
 *   linkDimension(field, dimension|null), dimensionFor(field), dimensionValue(dimension, value) (explicit map, else same name),
 *   mapGroup(dimension, value, tag), createPayrollTag(dimension, name), createMissingValues(field, values), setFieldPolicy(field, policy)
 *   setTaxPreset(key, code), addPayrollAccount({ code, name, type, party, reused? }), useChartAccount({ code, name, type })
 *   previewDryRun(runId, no?)       { holds, warnings, draft }: stores and posts nothing. Call from a handler.
 *   setLimits(patch), setPayday(day)
 *   Limits: partialStaffPct 10, partialWholeGroup, partialThpPct 20, taxTolerance 1000, largeChangePct 10, largeChangeAmount 1000000.
 *
 * Intake (OD-01, LR-3): Talenta sends, Jurnal builds the draft right away.
 *   simulateSend(kind, opts?)       kinds (SEND_KINDS): 'regular' | 'new-pay-item' | 'revision' | 'missing-component'
 *                                   | 'partial' | 'separate-run' | 'duplicate' | 'old-sync'. Returns { ok, status, message, runId?, versionNo? }.
 *                                   opts: runId, start, end, sentAt, newAllowance, raise, onlyBranch, thr, omit[], taxOff, duplicateEmployee, taxShift.
 *   receiveSalaryDetail(payload)    the webhook entry point simulateSend uses. Byte-identical duplicate: Failed "Duplicate of vN".
 *                                   Same figures, new sent_at: "No change". Older than the last version: Failed.
 *   runs (computed, newest first), runById(id), versionOf(run, no), currentVersionOf(run), draftOf(run), versionLabel(run, v)
 *   runStatus(run)                  'Confirm source' | 'Waiting for your choice' | 'Held' | 'Ready to post' | 'Posted' | 'Correction ready'
 *                                   | 'Reversed' | 'Dry run' | 'Before go-live' | 'Nothing to post' | 'Received'.
 *   runHolds(run)                   Hold[] { code, message, details }. A send STOPS only for: 'unmapped-item', 'unmapped-group',
 *                                   'empty-field' (linked field empty, set to hold), 'two-parties', 'archived-account'
 *                                   (no usable mapping), 'partial' (fewer staff than the last version), 'choice' (separate-run look-alike),
 *                                   'confirm-source' (first send).
 *   decidePartial(runId, no, 'replace'|'reject', reason?)
 *   chooseRevision(runId, no) / chooseSeparateRun(runId, no, { type, name, reason })   only when the send looks like a separate run
 *                                   (under half its staff carry Earning items, e.g. THR only). Every other send on a posted run is a revision.
 *   releaseRun(runId)               manual re-check of the run.
 *   staffRows(payload, { all? })    StaffRow[] { user_id, employee_id, organization_name, branch, cost_center, job_*, employment_status,
 *                                   sbu{}, allowances, deductions, benefits, takeHome }. Other-entity groups left out unless all.
 *   sendFigures(version)            { staff, takeHome, gross } of one version's send.
 *   componentAmount(row, name, section), isTaxFigure(name, section)   tax benefit components are read, never booked as pay items.
 *
 * Draft, warnings (OD-12): warnings never block Post.
 *   draftReview(runId)              { previous, payItems[{ name, section, amount, staff, role, taxFigure }], totals[{ section, amount }],
 *                                   changes[{ key, label, account, tags, old, new, diff, pct, flag, note }], headcount, lines, otherEntity,
 *                                   takeHome, tax, warnings, unacknowledged, unnotedLargeChanges, unexpectedHeadcount }
 *   runWarnings(runId)              RunWarning[] { key, code, message, details, acknowledged }. Codes: 'missing-component' ("PPH 21 Paid not
 *                                   in this send", one per name+section non-zero last time), 'tax-rule' (PPh 21 lines vs the rule beyond
 *                                   Rp1.000), 'duplicate-employee', 'hutang-gaji', 'negative-payable', 'large-change' (no note),
 *                                   'headcount' (not marked Expected), 'manual-journal' (non-PAY journal on a payroll account this month).
 *   acknowledgeWarning(runId, key, note?) / clearAcknowledgement(runId, key)   Accountant.
 *   postConfirmText(runId)          { title, body, warnings[] } for the Post / Post correction confirm (lists unacknowledged warnings).
 *   taxFigures(runId)               { benefit, payment, dtp, resign, pph26, paidDeduction, rule, ledger, pph26Ledger, dtpLedger, resignLedger, hasLines }.
 *   isDraftStale(runId), rebuildDraft(runId) -> { changed }, whyLine(runId, lineIndex), addChangeNote(runId, key, note)
 *   headcountChanges(runId)         pure, keyed by user_id internally, counts only: { previous, groups[{ key, label, last, current,
 *                                   change, joined, left, movedIn, movedOut (numbers), flagged, expected }], last, current, joined,
 *                                   left (numbers), moved[{ from, to }], flagged, unexpected }.
 *   markHeadcountExpected(runId, groupKey, note?) / clearHeadcountExpected(runId, groupKey)
 *   claimsSummary(runId)            { rows[{ item, account, tags, amount, employees, version, journal }], total }: the claims section on the run page.
 *
 * Post, revisions, reverse (TS-05, TS-07, LR-4, LR-8)
 *   postRun(runId, { versionNo? })  first post, one PAY journal; returns { ok, number, redirected, warnings[] (unacknowledged) }.
 *                                   Refuses: stale draft (rebuilt), newer version, holds, already posted. May go to approval (below).
 *   correctionOf(runId)             Correction | null: { lines (difference only), summary, builtAt, snapshotId }. Built automatically when a
 *                                   newer version becomes current on a posted run; the Accountant is notified with correctionNotice(run, summary).
 *                                   summary: { fromVersion, toVersion, takeHome, pph21, pph26, bpjs ({ before, after, change }), joined[],
 *                                   left, amountChanged (counts), moved[{ account, tags, label, change }], settingsChanged }.
 *                                   A version that moves nothing in the ledger becomes the ledger version at once (amendment task if tax moved).
 *   postCorrection(runId)           "Post correction": one Correction journal (PAY-number). Locked month: first open period, tax month kept.
 *   reverseAndRepost(runId)         under "More": reverses every live journal and posts the current version in full.
 *   compareVersions(runId, a?, b?)  { byPayItem[{ name, section, old, new, diff, missing }], byAccountTag, settingsMoved, headcount { added, removed },
 *                                   taxChanges, noLedgerChange, oldLabel, newLabel }. Never call inside a computed (draws ids).
 *   reverseRun(runId, { date?, confirmPayments? }) / reverseJournal(journalId, opts)
 *   liveJournals(runId) (Payroll + Correction, not reversed), journalsOf(runId), journalById(id), journalTotals(j)
 *   Journal { number PAY-/BNK-/JV-, type 'Payroll'|'Correction'|'Reversal'|'Salary payment'|'Statutory payment'|'Manual',
 *           source 'Talenta payroll'|'Bank reconciliation'|'Manual journal', taxMonth, date, lines, ... }
 *   lockPeriod(month, { confirm }) / unlockPeriod(month) / isLocked(month) / firstOpenAfter(month)
 *
 * PPh 21 (OD-16)
 *   amendmentTasks (computed)       { ...task, title, summary, depositGap }. closeAmendmentTask(id, outcome, { pembetulanNo, newTotal, reason })
 *                                   (can('tax')). 'Amended' also records newTotal as the e-Bupot filed total.
 *   pph21Month(month)               { rule, books, paid, balance, filed, filedDiff, flagged, flagMessage }.
 *   setEbupotFiled(month, amount)   can('tax') types the e-Bupot PPh 21 filed total; flagged beyond Rp1.000.
 *
 * Payables (FG-5): a tracker; payments arrive as bank reconciliation matches.
 *   payablesTracker(month?)         PayableRow[] { key, account, party, month, runId, label, owed, paid, balance, due, dueLabel, overdueDays,
 *                                   paidLateDays, status 'Open'|'Partly paid'|'Paid'|'Paid late'|'Overdue'|'Overpaid', statusLabel,
 *                                   payments[{ id, number, date, bank, amount, statement }], pendingOwed (salary row with a correction waiting),
 *                                   ebupot { filed, books, difference, by, at } (PPh 21 rows), flags[{ code 'bank-differs'|'ebupot-differs'
 *                                   |'manual-journal', message }] }.
 *   simulateBankPayment(kind, opts?)   BANK_PAYMENT_KINDS: 'salary' | 'pph21' | 'pph26' | 'bpjs-kesehatan' | 'bpjs-ketenagakerjaan' | 'dplk'
 *                                   | 'partial' | 'overpaid'. opts: { runId, month, of, amount, date, bank }. Creates a matched bank line
 *                                   (payroll.bankLines) and a BNK journal (Dr payable, Cr bank), type 'Salary payment' / 'Statutory payment',
 *                                   source 'Bank reconciliation'. partial = half the open balance, overpaid = open + Rp250.000.
 *   paymentsFor(runId)              bank-matched payments of the run (salary) and its month (statutory).
 *
 * Manual journals on payroll accounts
 *   simulateManualJournal({ debit?, credit?, amount?, date?, memo? })   default Dr Salaries, Cr Hutang Gaji Rp1.500.000 on the
 *                                   latest regular run's end date; JV- number, source 'Manual journal'.
 *   manualJournalWarnings(runId | month)   [{ journalId, number, date, month, accounts[], amount, message }]; also on runWarnings and
 *                                   as 'manual-journal' flags on the payables rows of the accounts it hits.
 *
 * Old sync (OD-11, LR-14)
 *   oldSyncExpense({ date, amount, pattern })   checked against the cut-over.
 *
 * Log and notices (TS-06)
 *   syncLog (computed, newest first), noticesFor(role)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { reactive, watch, computed } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import {
  PAYROLL_COMPANY_ID, PAYROLL_ACCOUNTS, PAYROLL_PEOPLE, ACC, PAYROLL_TAGS, TALENTA_FIELDS,
  STATUTORY_PARTIES, TAX_COMPONENTS, TAX_FIELDS, sampleRoster, buildSalaryDetail, sampleEmployeeName, payrollPerson,
  type PayrollRole, type PayrollAccount, type PayableParty, type PaySection, type TalentaPayload, type TalentaPayItem,
  type TalentaField, type TagDimension, type PayrollTag, type RosterEmployee,
  type PayloadOptions, type TaxField,
} from './payrollMaster'
import { checkApprovalRequired } from './payrollApproval'
import { upsertPayrollApprovalTask, removePayrollApprovalTask, syncPayrollApprovalTasks, type Task as InboxTask } from './tasks'

// ── Types ───────────────────────────────────────────────────────────────────

export type PayRole =
  | 'Earning' | 'Employee deduction' | 'Employer contribution' | 'Tax' | 'Loan'
  | 'Reimbursement' | 'THR' | 'Severance' | 'Advance offset'
export const PAY_ROLES: PayRole[] = ['Earning', 'Employee deduction', 'Employer contribution', 'Tax', 'Loan', 'Reimbursement', 'THR', 'Severance', 'Advance offset']
/** Roles whose debit is the cost side: the side a group account and a fixed dimension value move. */
export const COST_ROLES: PayRole[] = ['Earning', 'Employer contribution', 'Reimbursement', 'THR', 'Severance']
export type BpjsProgramme = 'Kesehatan' | 'JHT' | 'JKK' | 'JKM' | 'JP'

export interface Override { reason: string; by: string; at: string; breaches: string[] }
export interface PayItemMapping {
  key: string
  name: string
  section: PaySection
  role: PayRole | null
  roleConfirmed: boolean
  debit: string | null
  credit: string | null
  party: PayableParty | null
  programme: BpjsProgramme | null
  override: Override | null
  addedBy: 'Talenta' | 'Jurnal'
  /** Cost items only: "For Sales use Sales Salaries". The first line whose value matches the employee wins. */
  groupAccounts?: GroupAccount[]
  /** Cost items only: one dimension value every cost line of this item carries, over the employee's own. */
  fixedTag?: { dimension: string; value: string } | null
}
export interface GroupAccount { field: TalentaField; value: string; account: string }
/** Dimension values on a line, by Jurnal dimension name. Organization and Branch are always present. */
export interface Tags { Organization: string | null; Branch: string | null; [dimension: string]: string | null }
export const NO_TAGS: Tags = { Organization: null, Branch: null }
/** A Talenta employee field that feeds a Jurnal dimension; `empty` says what an empty value does. */
export interface DimensionLink { field: TalentaField; dimension: string; empty: 'hold' | 'skip' }
export interface TaxPresets { pph21: string; dtp: string; pph26: string; resign: string; trueUp: string }
export interface Limits {
  partialStaffPct: number; partialWholeGroup: boolean; partialThpPct: number
  /** Tax rule and e-Bupot checks: a difference above this many rupiah is flagged. */
  taxTolerance: number
  largeChangePct: number; largeChangeAmount: number
}
export interface PayrollSettings {
  mapping: PayItemMapping[]
  /** Talenta value to dimension value, by dimension. A value with no entry matches a dimension value of the same name. */
  groupMaps: Record<TagDimension, Record<string, string>>
  dimensionLinks: DimensionLink[]
  /** The payable each party is owed on: Staff is Hutang Gaji, DJP PPh 21 and PPh 26 follow the tax presets. */
  payables: Record<PayableParty, string>
  taxPresets: TaxPresets
  /** Start booking from this month; from it the old Talenta to Expense sync is blocked. */
  cutover: { firstLive: string | null; proposedBy: string | null; confirmedBy: string | null; mode: 'Block' }
  limits: Limits
  hutangGaji: string
  payday: number
  otherEntity: { field: 'organization_name' | 'branch'; value: string }[]
}
export interface SettingsSnapshot { id: string; at: string; by: string; note: string; settings: PayrollSettings }

/** The only reasons a send stops: no mapping (item, dimension value, or an account the journal cannot use), a partial send, a revision-or-separate-run choice, the first send's source. */
export type HoldCode =
  | 'confirm-source' | 'choice' | 'partial' | 'unmapped-item' | 'unmapped-group'
  | 'empty-field' | 'two-parties' | 'archived-account'
export interface Hold { code: HoldCode; message: string; details: Record<string, unknown> }

/** Everything else is a warning on the draft: the Accountant reads it and decides whether to post. */
export type WarningCode = 'missing-component' | 'tax-rule' | 'duplicate-employee' | 'hutang-gaji' | 'negative-payable' | 'large-change' | 'headcount' | 'manual-journal'
export interface Ack { note: string; by: string; at: string }
export interface StoredWarning { key: string; code: WarningCode; message: string; details: Record<string, unknown> }
export interface RunWarning extends StoredWarning { acknowledged: Ack | null }

export interface LineSource { item: string; section: PaySection | 'preset'; role: PayRole | null; side: 'D' | 'C'; amount: number; staff: string[] }
export interface JournalLine {
  account: string
  tags: Tags
  debit: number
  credit: number
  why: string[]
  sources: LineSource[]
  /** Expense line below Rp0 posted as a credit. */
  review?: boolean
}
export interface Draft {
  id: string
  versionNo: number
  snapshotId: string
  builtAt: string
  date: string
  memo: string
  lines: JournalLine[]
  nothingToPost: boolean
  otherEntity: { staff: number; amount: number }
}
export type VersionState = 'active' | 'replaced' | 'superseded' | 'waiting-choice' | 'partial' | 'rejected' | 'moved'
export interface RunVersion {
  no: number
  sentAt: string
  receivedAt: string
  hash: string
  figuresHash: string
  payload: TalentaPayload
  state: VersionState
  replacedBy: number | null
  holds: Hold[]
  /** Warnings found when the send was checked (missing components, tax rule, duplicate rows, payable below Rp0). */
  warnings: StoredWarning[]
  /** Warnings the Accountant acknowledged, by warning key. */
  acks: Record<string, Ack>
  draft: Draft | null
  /** On a posted run: the correction (difference only) this version would post, with its summary. */
  correction: Correction | null
  decision: { kind: string; reason: string | null; by: string; at: string } | null
  changeNotes: Record<string, string>
  /** Headcount changes marked Expected, by group key (organization|branch). */
  headcountExpected: Record<string, HeadcountExpected>
}
export type RunKind = 'Regular' | 'THR' | 'Bonus' | 'Off-cycle'
/** A group's headcount change the Accountant marked Expected on one version; `fingerprint` pins the ids it covered. */
export interface HeadcountExpected { fingerprint: string; note: string; by: string; at: string }
export interface Run {
  id: string
  key: string
  baseKey: string
  companyId: number
  periodType: 'monthly'
  start: string
  end: string
  month: string
  kind: RunKind
  label: string
  versions: RunVersion[]
  currentVersion: number | null
  ledgerVersion: number | null
  mode: 'Live' | 'Dry run' | 'Before go-live'
  dryRun: { passedBy: string | null; passedAt: string | null; signedOffBy: string | null; signedOffAt: string | null } | null
  /** A newer version is current and its correction (difference only) waits for Post correction. */
  revised: boolean
  reversedAt: string | null
  /** Post or Post correction matched a Payroll journal approval rule and waits in Inbox > Awaiting approval. */
  approval?: PayrollApprovalRequest | null
  /** The last rejection: the run went back to its draft with this reason. */
  rejection?: { reason: string; by: string; at: string; kind: 'post' | 'correction' } | null
}
export interface PayrollApprovalRequest {
  kind: 'post' | 'correction'
  versionNo: number
  amount: number
  ruleId: string
  ruleName: string
  approvers: string[]
  requestedBy: string
  requestedAt: string
  taskId: string
}
export type JournalType = 'Payroll' | 'Reversal' | 'Correction' | 'Salary payment' | 'Statutory payment' | 'Manual'
export type JournalSource = 'Talenta payroll' | 'Bank reconciliation' | 'Manual journal'
export interface Journal {
  id: string
  number: string
  type: JournalType
  source: JournalSource
  runId: string | null
  versionNo: number | null
  date: string
  taxMonth: string
  memo: string
  reference: string | null
  correction: boolean
  lines: JournalLine[]
  snapshotId: string | null
  postedBy: string
  postedAt: string
  reversesId: string | null
  reversedById: string | null
  paymentId: string | null
}
export interface BankStatementLine { id: string; bank: string; date: string; description: string; amount: number; paymentId: string }
export interface Payment {
  id: string
  kind: 'Salary' | 'Statutory'
  party: PayableParty
  account: string
  runId: string | null
  month: string
  bank: string
  date: string
  amount: number
  journalId: string
  statementLineId: string
}
export interface AmendmentTask {
  id: string
  taxMonth: string
  runId: string
  fromVersion: number
  toVersion: number
  /** One entry per staff member whose tax moved; no employee data. */
  employees: { changes: Partial<Record<TaxField, number>> }[]
  periodChange: number
  noLedgerChange: boolean
  status: 'Open' | 'Amended' | 'Not filed yet' | 'Dismissed'
  pembetulanNo: string | null
  newTotal: number | null
  reason: string | null
  openedAt: string
  closedBy: string | null
}
export interface EbupotFiled { month: string; filed: number; by: string; at: string }
export type LogStatus = 'Received' | 'Waiting for your choice' | 'Held' | 'Posted' | 'Failed' | 'Reversed' | 'Blocked' | 'No change' | 'Recorded'
export interface SyncLogEntry {
  id: number
  at: string
  type: 'Send' | 'Hold' | 'Post' | 'Reversal' | 'Old sync' | 'Decision' | 'Payment' | 'Settings' | 'Connection' | 'Manual journal'
  runId: string | null
  runKey: string | null
  version: number | null
  employees: number | null
  status: LogStatus
  reason: string
  nextStep: string
  journalNo: string | null
}
export interface PayrollNotice { id: number; roles: PayrollRole[]; text: string; link: string; at: string; read: boolean }
export interface OldSyncCall { id: string; date: string; amount: number; pattern: 'Payroll' | 'Claim'; outcome: 'Blocked' | 'Passed'; message: string; at: string }
export interface Connection {
  status: 'Not connected' | 'Waiting for first send' | 'Connected' | 'Ended'
  companyId: number | null
  startedBy: string | null
  startedAt: string | null
  endedReason: string | null
  sourceConfirmedBy: string | null
  sourceConfirmedAt: string | null
  otherEntitiesAnswer: boolean | null
  lastAcceptedAt: string | null
  rejected: { at: string; companyId: number | null; reason: string }[]
}

export interface PayrollState {
  seq: number
  clock: string
  viewAs: PayrollRole
  connection: Connection
  accounts: PayrollAccount[]
  tags: PayrollTag[]
  settings: PayrollSettings
  snapshots: SettingsSnapshot[]
  roster: RosterEmployee[]
  runs: Run[]
  journals: Journal[]
  payments: Payment[]
  bankLines: BankStatementLine[]
  tasks: AmendmentTask[]
  ebupot: EbupotFiled[]
  lockedMonths: string[]
  log: SyncLogEntry[]
  notices: PayrollNotice[]
  oldSync: OldSyncCall[]
  /** Options of the last simulated send per run key, so a revision or partial re-send starts from the same facts. */
  simOptions: Record<string, Partial<PayloadOptions>>
  payNo: number
  bnkNo: number
  jvNo: number
}

// ── Small helpers ───────────────────────────────────────────────────────────

const DAY = 86_400_000
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function addDays(d: string, n: number): string { return new Date(Date.parse(d + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10) }
export function monthOf(d: string): string { return d.slice(0, 7) }
export function lastDayOf(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}
export function nextMonthOf(month: string): string { return monthOf(addDays(lastDayOf(month), 1)) }
export function monthLabel(month: string): string { const [y, m] = month.split('-').map(Number) as [number, number]; return `${MON[m - 1]} ${y}` }
export function dateLabel(d: string): string { const [y, m, dd] = d.split('-').map(Number) as [number, number, number]; return `${dd} ${MON[m - 1]} ${y}` }
export function periodLabel(start: string, end: string): string {
  const [ys, ms, ds] = start.split('-').map(Number) as [number, number, number]
  const [ye, me, de] = end.split('-').map(Number) as [number, number, number]
  if (ys === ye && ms === me) return `${ds}-${de} ${MON[me - 1]} ${ye}`
  if (ys === ye) return `${ds} ${MON[ms - 1]}-${de} ${MON[me - 1]} ${ye}`
  return `${ds} ${MON[ms - 1]} ${ys}-${de} ${MON[me - 1]} ${ye}`
}
/** Send times show in WIB (UTC+7). */
export function wib(iso: string): string {
  const d = new Date(Date.parse(iso) + 7 * 3_600_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} WIB`
}
export function rupiah(n: number): string {
  const v = Math.round(n)
  return `${v < 0 ? '-' : ''}Rp${Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
}
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()
function hash(s: string): string { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(16) }
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T
/** Dimension names on a line in a stable order: Organization, Branch, then the rest by name. */
function tagDims(t: Tags): string[] { return ['Organization', 'Branch', ...Object.keys(t).filter((k) => k !== 'Organization' && k !== 'Branch').sort()] }
const tagsKey = (t: Tags) => tagDims(t).map((d) => `${d}=${t[d] ?? ''}`).join('|')
/** "A", "A and B", "A, B and C". */
export function listLabel(items: string[]): string { return items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` }
export function tagsLabel(t: Tags): string { return tagDims(t).map((d) => t[d]).filter(Boolean).join(', ') }

// ── State ───────────────────────────────────────────────────────────────────

const SNAPSHOT_KEY = 'payroll:state-v6'

function defaultSettings(): PayrollSettings {
  return {
    mapping: [],
    groupMaps: { Organization: {}, Branch: {} },
    dimensionLinks: [{ field: 'organization_name', dimension: 'Organization', empty: 'hold' }, { field: 'branch', dimension: 'Branch', empty: 'hold' }],
    payables: { Staff: ACC.hutangGaji, 'DJP PPh 21': ACC.pph21, 'DJP PPh 26': ACC.pph26, 'BPJS Kesehatan': ACC.bpjsKes, 'BPJS Ketenagakerjaan': ACC.bpjsTk, Other: ACC.dplk },
    taxPresets: { pph21: ACC.pph21, dtp: ACC.dtp, pph26: ACC.pph26, resign: ACC.pph21Final, trueUp: ACC.pph21 },
    cutover: { firstLive: null, proposedBy: null, confirmedBy: null, mode: 'Block' },
    limits: { partialStaffPct: 10, partialWholeGroup: true, partialThpPct: 20, taxTolerance: 1_000, largeChangePct: 10, largeChangeAmount: 1_000_000 },
    hutangGaji: ACC.hutangGaji,
    payday: 25,
    otherEntity: [],
  }
}

function emptyState(): PayrollState {
  return {
    seq: 1, clock: '2026-10-05T02:00:00.000Z', viewAs: 'Accountant',
    connection: { status: 'Not connected', companyId: null, startedBy: null, startedAt: null, endedReason: null, sourceConfirmedBy: null, sourceConfirmedAt: null, otherEntitiesAnswer: null, lastAcceptedAt: null, rejected: [] },
    accounts: clone(PAYROLL_ACCOUNTS), tags: clone(PAYROLL_TAGS),
    settings: defaultSettings(), snapshots: [], roster: [], runs: [], journals: [], payments: [], bankLines: [],
    tasks: [], ebupot: [], lockedMonths: [],
    log: [], notices: [], oldSync: [], simOptions: {}, payNo: 0, bnkNo: 0, jvNo: 0,
  }
}

export const payroll = reactive<PayrollState>(emptyState())

let seeding = false
const nextId = (p: string) => `${p}${payroll.seq++}`
/** The sample clock moves one minute per action so send order and logs stay stable. */
function now(): string { payroll.clock = new Date(Date.parse(payroll.clock) + 60_000).toISOString(); return payroll.clock }
function setClock(iso: string) { payroll.clock = new Date(iso).toISOString() }
export function today(): string { return new Date(Date.parse(payroll.clock) + 7 * 3_600_000).toISOString().slice(0, 10) }
export function nowWib(): string { return wib(payroll.clock) }

// ── Roles (View as) and access control ──────────────────────────────────────

/**
 * Six payroll actions (Payroll Access and Privacy, 2026-10-12). Approval is not a role action:
 * it follows Settings > Approval workflows (transaction type Payroll journal).
 *   view        every role: runs, journals, payables, warnings, settings read-only, exports.
 *   post        post a draft, acknowledge warnings, mark headcount Expected, re-check a held run.
 *   tax         PPh 21 amendment task, e-Bupot filed total.
 *   setup       pay item mapping, payable accounts, dimensions, limits, period lock (LM).
 *   correct     post a correction, reverse, revision or separate run, partial re-sends (LM).
 *   connection  connect or end Talenta, confirm the source, other-entity answers, the start
 *               month (Owner, Ultimate + LM).
 *   simulate    demo stand-ins for bank reconciliation and the general journal.
 */
export type PayrollAction = 'view' | 'post' | 'tax' | 'setup' | 'correct' | 'connection' | 'simulate'

const ACTORS: PayrollRole[] = ['Owner', 'Ultimate', 'Ultimate + LM', 'Accountant', 'Accountant + LM']
const LM: PayrollRole[] = ['Owner', 'Ultimate + LM', 'Accountant + LM']
const ACCESS: Record<PayrollAction, PayrollRole[]> = {
  view: [...ACTORS, 'View only'],
  post: ACTORS,
  tax: ACTORS,
  setup: LM,
  correct: LM,
  connection: ['Owner', 'Ultimate + LM'],
  simulate: ACTORS,
}
export function can(action: PayrollAction, role: PayrollRole = payroll.viewAs): boolean { return ACCESS[action].includes(role) }
export function setPayrollViewAs(role: PayrollRole): void { payroll.viewAs = role }
export function actingPerson(): string { return payrollPerson(payroll.viewAs).person }
export { PAYROLL_PEOPLE }

export interface Result { ok: boolean; message?: string; [k: string]: unknown }
const denied = (): Result & { ok: false } => ({ ok: false, message: 'Your role cannot do this.', status: 403 })

// ── Accounts and tags ───────────────────────────────────────────────────────

export function payrollAccount(code: string | null): PayrollAccount | undefined { return code ? payroll.accounts.find((a) => a.code === code) : undefined }
export function accountName(code: string | null): string { return payrollAccount(code)?.name ?? code ?? '' }
export function accountLabel(code: string | null): string { return code ? `${code} ${accountName(code)}` : '' }
const isCost = (code: string | null) => { const t = payrollAccount(code)?.type; return t === 'expense' || t === 'cogs' }
const isLiability = (code: string | null) => payrollAccount(code)?.type === 'liability'
const partyOf = (code: string | null): PayableParty | null => payrollAccount(code)?.party ?? null
/** Accounts whose debit and credit show as separate lines (PPh 21 DTP, FG6-AC9). */
const grossBoth = (code: string) => code === payroll.settings.taxPresets.dtp
/** TS-03: add an account to the payroll account set. Codes and names are unique within the set. */
export function addPayrollAccount(a: { code: string; name: string; type: PayrollAccount['type']; party: PayableParty | null; reused?: boolean }): Result {
  if (!can('setup')) return denied()
  const code = a.code.trim(), name = a.name.trim()
  if (!/^\d-\d{5}$/.test(code)) return { ok: false, message: 'Enter a code like 2-20513.' }
  if (!name) return { ok: false, message: 'Enter the account name.' }
  if (payrollAccount(code)) return { ok: false, message: `Code ${code} is already in the payroll account set.` }
  if (payroll.accounts.some((x) => norm(x.name) === norm(name))) return { ok: false, message: `${name} is already in the payroll account set.` }
  if (a.party && a.type !== 'liability') return { ok: false, message: 'Only a payable carries a party label.' }
  payroll.accounts.push({ code, name, type: a.type, party: a.party, reused: !!a.reused })
  changed(`Payroll account ${code} ${name} added`)
  return { ok: true, code }
}
export function createPayrollTag(dimension: TagDimension, name: string): Result {
  if (!can('setup')) return denied()
  if (!name.trim()) return { ok: false, message: 'Enter a dimension value.' }
  if (!payroll.tags.some((t) => t.dimension === dimension && norm(t.name) === norm(name))) payroll.tags.push({ dimension, name: name.trim() })
  return { ok: true }
}

// ── Settings and snapshots (LR-9) ───────────────────────────────────────────

export const settings = computed(() => payroll.settings)
export function currentSnapshotId(): string { return payroll.snapshots[payroll.snapshots.length - 1]?.id ?? 'S-0' }
export function snapshotById(id: string | null): SettingsSnapshot | undefined { return payroll.snapshots.find((s) => s.id === id) }
function takeSnapshot(note: string): string {
  const id = `S-${payroll.snapshots.length + 1}`
  payroll.snapshots.push({ id, at: now(), by: actingPerson(), note, settings: clone(payroll.settings) })
  return id
}
/** Every settings change goes through here: new snapshot, log row, held runs re-checked. */
function changed(note: string): void {
  if (seeding && !payroll.snapshots.length) return
  takeSnapshot(note)
  addLog({ type: 'Settings', status: 'Recorded', reason: note, nextStep: 'Drafts built on older settings rebuild before posting.' })
  recheckHeld()
}

export function payItemKey(name: string, section: PaySection): string { return `${section}|${norm(name)}` }
export function mappingFor(name: string, section: PaySection, s: PayrollSettings = payroll.settings): PayItemMapping | undefined {
  const k = payItemKey(name, section)
  return s.mapping.find((m) => m.key === k)
}

/** OD-05: role from name and section. "paid by company" under deductions is an employer contribution. */
export function suggestRole(name: string, section: PaySection): PayRole | null {
  const n = norm(name)
  if (section === 'deduction' && /paid by company|ditanggung perusahaan/.test(n)) return 'Employer contribution'
  if (section === 'benefit') return /paid by company|dplk|bpjs|jht|jkk|jkm|jp\b/.test(n) ? 'Employer contribution' : null
  if (section === 'deduction' && /^thr/.test(n)) return null
  if (/ditanggung pemerintah|\bdtp\b/.test(n)) return 'Tax'
  if (/pph ?2[16]/.test(n)) return section === 'deduction' ? 'Tax' : null
  if (/loan|pinjaman|kasbon|cicilan/.test(n)) return section === 'deduction' ? 'Loan' : null
  if (/reimburs|claim|klaim|penggantian/.test(n)) return 'Reimbursement'
  if (/pesangon|severance/.test(n)) return section === 'allowance' ? 'Severance' : null
  if (/^thr|tunjangan hari raya/.test(n)) return section === 'allowance' ? 'THR' : null
  if (section === 'deduction' && /jht|\bjp\b|bpjs|jkk|jkm/.test(n)) return 'Employee deduction'
  if (section === 'allowance' && /basic|gaji|salary|tunjangan|uang makan|uang transport|lembur|insentif|bonus|allowance/.test(n)) return 'Earning'
  return null
}
function partyFromName(name: string): PayableParty | null {
  const n = norm(name)
  if (/bpjs ?k(esehatan)?\b|bpjsk/.test(n)) return 'BPJS Kesehatan'
  if (/jht|\bjp\b|jkk|jkm|ketenagakerjaan/.test(n)) return 'BPJS Ketenagakerjaan'
  if (/pph ?26/.test(n)) return 'DJP PPh 26'
  if (/pph ?21/.test(n) && !/ditanggung pemerintah/.test(n)) return 'DJP PPh 21'
  if (/dplk/.test(n)) return 'Other'
  return null
}
function programmeFromName(name: string): BpjsProgramme | null {
  const n = norm(name)
  if (/bpjs ?k(esehatan)?\b|bpjsk/.test(n)) return 'Kesehatan'
  if (/jht/.test(n)) return 'JHT'
  if (/jkk/.test(n)) return 'JKK'
  if (/jkm/.test(n)) return 'JKM'
  if (/\bjp\b/.test(n)) return 'JP'
  return null
}
const PARTY_PAYABLE: Partial<Record<PayableParty, string>> = { 'BPJS Kesehatan': ACC.bpjsKes, 'BPJS Ketenagakerjaan': ACC.bpjsTk, 'DJP PPh 21': ACC.pph21, 'DJP PPh 26': ACC.pph26, Other: ACC.dplk }
/** TS-03: suggested accounts for a standard item. Never overwrites a mapped row. */
export function suggestMapping(name: string, section: PaySection): Pick<PayItemMapping, 'role' | 'debit' | 'credit' | 'party' | 'programme'> | null {
  const role = suggestRole(name, section)
  if (!role) return null
  const party = partyFromName(name)
  const programme = programmeFromName(name)
  const hg = payroll.settings.hutangGaji
  switch (role) {
    case 'Earning': return { role, debit: ACC.salaries, credit: hg, party: 'Staff', programme: null }
    case 'Employee deduction': return party ? { role, debit: hg, credit: PARTY_PAYABLE[party] ?? null, party, programme } : null
    case 'Employer contribution': return party ? { role, debit: ACC.salaries, credit: PARTY_PAYABLE[party] ?? null, party, programme } : null
    case 'Tax':
      if (section === 'allowance') return { role, debit: payroll.settings.taxPresets.dtp, credit: hg, party: null, programme: null }
      return party ? { role, debit: hg, credit: PARTY_PAYABLE[party] ?? null, party, programme: null } : null
    default: return null
  }
}

/** OD-06 guardrails. Blocks cannot be overridden; overridable breaches need a reason (20-500 characters). */
export function validateMapping(row: Pick<PayItemMapping, 'role' | 'debit' | 'credit' | 'party' | 'name' | 'section'>): { blocks: string[]; overridable: string[] } {
  const blocks: string[] = [], overridable: string[] = []
  const { role, debit, credit } = row
  for (const code of [debit, credit]) {
    const a = payrollAccount(code)
    if (code && !a) blocks.push(`Account ${code} is not in the chart of accounts.`)
    if (a?.archived) blocks.push(`${accountLabel(code)} is archived.`)
  }
  if ((role === 'Employee deduction' || role === 'Loan') && (isCost(debit) || isCost(credit)))
    blocks.push(`${role === 'Loan' ? 'A loan' : 'An employee deduction'} cannot post to an expense account.`)
  if ((role === 'Tax' || role === 'Employer contribution') && credit && !isLiability(credit))
    blocks.push(`${role === 'Tax' ? 'A tax item' : 'An employer contribution'} must credit a liability account.`)
  const cp = partyOf(credit)
  const ip = row.party ?? partyFromName(row.name)
  if (cp && ip && STATUTORY_PARTIES.includes(ip) && cp !== ip && role !== 'Earning')
    blocks.push(`${accountName(credit)} is labelled ${cp}. ${row.name} is owed to ${ip}.`)
  if (credit === payroll.settings.hutangGaji && debit === payroll.settings.hutangGaji)
    blocks.push(`${row.name} posts to ${accountName(credit)} on both sides.`)
  if ((role === 'Earning' || role === 'THR' || role === 'Severance') && isCost(credit))
    overridable.push(`${role} credits an expense account.`)
  if (role === 'Reimbursement' && debit && !isCost(debit)) overridable.push('A reimbursement should debit an expense or cost of goods sold account.')
  if (role === 'Reimbursement' && credit !== payroll.settings.hutangGaji) overridable.push(`A claim reaches staff in take-home pay, so it credits ${accountName(payroll.settings.hutangGaji)}.`)
  if (role === 'Advance offset' && credit && payrollAccount(credit)?.type !== 'asset') overridable.push('An advance offset should credit an asset such as THR Advance.')
  if (/reimburs|claim|klaim|penggantian/i.test(row.name) && role && role !== 'Reimbursement') overridable.push('The name reads as a claim but the role is not Reimbursement.')
  return { blocks, overridable }
}

export function setPayItemMapping(key: string, patch: Partial<Pick<PayItemMapping, 'role' | 'debit' | 'credit' | 'party' | 'programme'>>, overrideReason?: string): Result {
  if (!can('setup')) return denied()
  const row = payroll.settings.mapping.find((m) => m.key === key)
  if (!row) return { ok: false, message: 'Pay item not found.' }
  const next = { ...row, ...patch }
  const v = validateMapping(next)
  if (v.blocks.length) return { ok: false, message: v.blocks[0], blocks: v.blocks, status: 422 }
  if (v.overridable.length) {
    const r = (overrideReason ?? '').trim()
    if (r.length < 20 || r.length > 500) return { ok: false, message: 'This mapping breaks a guardrail. Add a reason of 20 to 500 characters to override it.', needsOverride: v.overridable }
    next.override = { reason: r, by: actingPerson(), at: now(), breaches: v.overridable }
  } else next.override = null
  Object.assign(row, next, { roleConfirmed: !!next.role })
  changed(`Pay item ${row.name} (${row.section}) mapped: Dr ${accountLabel(row.debit)}, Cr ${accountLabel(row.credit)}, role ${row.role}`)
  return { ok: true }
}

function newMappingRow(name: string, section: PaySection, addedBy: 'Talenta' | 'Jurnal'): PayItemMapping {
  return { key: payItemKey(name, section), name: name.trim(), section, role: null, roleConfirmed: false, debit: null, credit: null, party: partyFromName(name), programme: programmeFromName(name), override: null, addedBy }
}

// ── Dimensions: Talenta field to Jurnal dimension, values matched by name ──

/** The dimension a Talenta field feeds, or null when the field is not used. */
export function dimensionFor(field: string, s: PayrollSettings = payroll.settings): string | null { return s.dimensionLinks.find((l) => l.field === field)?.dimension ?? null }
/** Every Jurnal dimension Payroll knows: the ones with values plus the linked ones. */
export function payrollDimensions(): string[] {
  return [...new Set(['Organization', 'Branch', ...payroll.tags.map((t) => t.dimension), ...payroll.settings.dimensionLinks.map((l) => l.dimension)])]
}
/** The dimension value a Talenta value lands on: the explicit map, else a value of the same name. */
export function dimensionValue(dimension: string, value: string, s: PayrollSettings = payroll.settings): string | null {
  return s.groupMaps[dimension]?.[value] ?? payroll.tags.find((t) => t.dimension === dimension && norm(t.name) === norm(value))?.name ?? null
}
export function linkDimension(field: TalentaField, dimension: string | null): Result {
  if (!can('setup')) return denied()
  const links = payroll.settings.dimensionLinks
  const i = links.findIndex((l) => l.field === field)
  const label = TALENTA_FIELDS.find((f) => f.field === field)?.label ?? field
  if (!dimension) {
    if (i < 0) return { ok: true }
    links.splice(i, 1)
    changed(`${label} no longer feeds a dimension`)
    return { ok: true }
  }
  const dim = dimension.trim()
  if (!dim) return { ok: false, message: 'Name the dimension.' }
  const other = links.find((l) => l.dimension === dim && l.field !== field)
  if (other) return { ok: false, message: `${dim} is already fed by ${TALENTA_FIELDS.find((f) => f.field === other.field)?.label ?? other.field}.` }
  if (i >= 0) links[i]!.dimension = dim
  else links.push({ field, dimension: dim, empty: 'hold' })
  payroll.settings.groupMaps[dim] ??= {}
  changed(`${label} feeds dimension ${dim}`)
  return { ok: true }
}
export function mapGroup(dimension: TagDimension, value: string, tag: string): Result {
  if (!can('setup')) return denied()
  if (!payroll.tags.some((t) => t.dimension === dimension && t.name === tag)) return { ok: false, message: 'Pick a value from this dimension or create it first.' }
  ;(payroll.settings.groupMaps[dimension] ??= {})[value] = tag
  changed(`${dimension} ${value} mapped to dimension value ${tag}`)
  return { ok: true }
}
/** Create a dimension value of the same name for every listed Talenta value that matches nothing. */
export function createMissingValues(field: TalentaField, values: string[]): Result {
  if (!can('setup')) return denied()
  const dim = dimensionFor(field)
  if (!dim) return { ok: false, message: 'Link the field to a dimension first.' }
  const missing = values.filter((v) => v.trim() && !dimensionValue(dim, v))
  for (const v of missing) payroll.tags.push({ dimension: dim, name: v.trim() })
  if (missing.length) changed(`${missing.length} ${dim} value${missing.length > 1 ? 's' : ''} created`)
  return { ok: true, created: missing.length }
}
/** An employee with an empty linked field: hold the run (default) or leave the dimension blank. */
export function setFieldPolicy(field: string, policy: 'hold' | 'skip'): Result {
  if (!can('setup')) return denied()
  const link = payroll.settings.dimensionLinks.find((l) => l.field === field)
  if (!link) return { ok: false, message: 'This field feeds no dimension.' }
  link.empty = policy
  changed(`Empty ${field} set to ${policy === 'hold' ? 'hold the run' : 'leave blank'}`)
  return { ok: true }
}

// ── Pay items: one account per row, the other side follows the type ────────

/** What a row books, from its section and role: a cost (account = debit), a payable or another balance (account = the non-staff side). */
export type PayItemType = 'allowance' | 'deduction' | 'benefit' | 'tax'
export function payItemType(m: Pick<PayItemMapping, 'section' | 'role' | 'name'>): PayItemType {
  if ((m.role ?? suggestRole(m.name, m.section)) === 'Tax') return 'tax'
  return m.section
}
/** True when the row's account is a cost: allowances (not tax) and benefits. */
export function isCostItem(m: Pick<PayItemMapping, 'section' | 'role' | 'name'>): boolean {
  const t = payItemType(m)
  return t === 'allowance' || t === 'benefit'
}
/** The account the Accountant picks on the row: the debit of a cost or tax allowance, else the credit. */
export function payItemAccount(m: PayItemMapping): string | null {
  return isCostItem(m) || (m.section === 'allowance' && m.role === 'Tax') ? m.debit : m.credit
}
/** Who the row's amount is owed to, from its type and accounts. */
export function payItemParty(m: PayItemMapping): PayableParty | null {
  if (m.section === 'allowance') return 'Staff'
  if (m.section === 'benefit') return m.party ?? partyFromName(m.name) ?? 'Other'
  return partyOf(m.credit) ?? m.party ?? partyFromName(m.name)
}
/** Adds a chart account to the accounts Payroll can book to (no settings change on its own). */
export function useChartAccount(a: { code: string; name: string; type: PayrollAccount['type'] }): void {
  if (!payrollAccount(a.code)) payroll.accounts.push({ code: a.code, name: a.name, type: a.type, party: null, reused: true })
}
/**
 * Pick the one account of a pay item row. A cost item debits it and credits the payable of its
 * party (Payable accounts); a deduction or tax item credits it and debits Hutang Gaji. The role
 * comes from the row, else from the name and section.
 */
export function setPayItemAccount(key: string, account: string): Result {
  if (!can('setup')) return denied()
  const row = payroll.settings.mapping.find((m) => m.key === key)
  if (!row) return { ok: false, message: 'Pay item not found.' }
  const a = payrollAccount(account)
  if (!a) return { ok: false, message: `Account ${account} is not in the chart of accounts.` }
  const s = payroll.settings
  const hg = s.hutangGaji
  const sugg = suggestRole(row.name, row.section)
  const known = row.roleConfirmed ? row.role : null
  let patch: Partial<Pick<PayItemMapping, 'role' | 'debit' | 'credit' | 'party'>>
  if (row.section === 'allowance' && (known ?? sugg) === 'Tax') patch = { role: 'Tax', debit: account, credit: hg, party: null }
  else if (row.section === 'allowance') {
    if (!isCost(account)) return { ok: false, message: 'Pick an expense or cost of goods sold account.' }
    const role = known && COST_ROLES.includes(known) ? known : sugg && COST_ROLES.includes(sugg) ? sugg : 'Earning'
    patch = { role, debit: account, credit: s.payables.Staff, party: 'Staff' }
  } else if (row.section === 'benefit') {
    if (!isCost(account)) return { ok: false, message: 'Pick an expense or cost of goods sold account.' }
    const party = row.party ?? partyFromName(row.name) ?? 'Other'
    patch = { role: 'Employer contribution', debit: account, credit: s.payables[party], party }
  } else {
    if (isCost(account)) return { ok: false, message: 'A deduction credits a payable or a receivable, not an expense.' }
    const role: PayRole = known ?? (a.type === 'asset' ? (/thr/i.test(row.name) ? 'Advance offset' : 'Loan') : sugg === 'Tax' || a.party === 'DJP PPh 21' || a.party === 'DJP PPh 26' ? 'Tax' : 'Employee deduction')
    patch = { role, debit: hg, credit: account, party: a.party ?? row.party }
  }
  return setPayItemMapping(key, patch)
}
/** Group accounts and the fixed dimension value of a cost item. Pass the full lists; an empty list clears them. */
export function setPayItemSplit(key: string, o: { groupAccounts: GroupAccount[]; fixedTag: { dimension: string; value: string } | null }): Result {
  if (!can('setup')) return denied()
  const row = payroll.settings.mapping.find((m) => m.key === key)
  if (!row) return { ok: false, message: 'Pay item not found.' }
  if (!isCostItem(row) && (o.groupAccounts.length || o.fixedTag)) return { ok: false, message: 'Only a cost item can split by group or carry a fixed dimension value.' }
  const seen = new Set<string>()
  for (const g of o.groupAccounts) {
    if (!g.value || !g.account) return { ok: false, message: 'Pick a group and an account on every line.' }
    if (!isCost(g.account)) return { ok: false, message: 'A group account must be an expense or cost of goods sold account.' }
    const k = `${g.field}|${norm(g.value)}`
    if (seen.has(k)) return { ok: false, message: `${g.value} has two lines.` }
    seen.add(k)
  }
  if (o.fixedTag && (!o.fixedTag.dimension || !payroll.tags.some((t) => t.dimension === o.fixedTag!.dimension && t.name === o.fixedTag!.value)))
    return { ok: false, message: 'Pick a dimension and one of its values.' }
  row.groupAccounts = o.groupAccounts.map((g) => ({ ...g }))
  row.fixedTag = o.fixedTag ? { ...o.fixedTag } : null
  changed(`Pay item ${row.name} (${row.section}): ${row.groupAccounts.length} group account${row.groupAccounts.length === 1 ? '' : 's'}${row.fixedTag ? `, fixed ${row.fixedTag.dimension} ${row.fixedTag.value}` : ''}`)
  return { ok: true }
}
/**
 * The payable a party is owed on. Every pay item row that credits (or, for Staff, books to) the old
 * payable moves to the new one; Staff also moves Hutang Gaji, DJP PPh 21 and PPh 26 their tax presets.
 */
export function setPayableAccount(party: PayableParty, code: string): Result {
  if (!can('setup')) return denied()
  const s = payroll.settings
  const a = payrollAccount(code)
  if (!a || a.type !== 'liability') return { ok: false, message: 'Pick a liability account.' }
  if (a.archived) return { ok: false, message: `${accountLabel(code)} is archived.` }
  const owner = (Object.keys(s.payables) as PayableParty[]).find((p) => p !== party && s.payables[p] === code)
  if (owner) return { ok: false, message: `${accountName(code)} is already the payable for ${owner}.` }
  if (a.party && a.party !== party && STATUTORY_PARTIES.includes(a.party) && STATUTORY_PARTIES.includes(party)) return { ok: false, message: `${accountName(code)} is labelled ${a.party}.` }
  const old = s.payables[party]
  if (old === code) return { ok: true }
  for (const m of s.mapping) { if (m.debit === old) m.debit = code; if (m.credit === old) m.credit = code }
  s.payables[party] = code
  if (party === 'Staff') s.hutangGaji = code
  if (party === 'DJP PPh 21') { if (s.taxPresets.trueUp === s.taxPresets.pph21) s.taxPresets.trueUp = code; s.taxPresets.pph21 = code }
  if (party === 'DJP PPh 26') s.taxPresets.pph26 = code
  a.party = party
  const prev = payrollAccount(old)
  if (prev && prev.party === party && !s.mapping.some((m) => m.credit === old)) prev.party = null
  changed(`${party} payable set to ${accountLabel(code)}`)
  return { ok: true }
}
export function setTaxPreset(key: keyof TaxPresets, code: string): Result {
  if (!can('setup')) return denied()
  const p = { ...payroll.settings.taxPresets, [key]: code }
  if (p.pph26 === p.pph21 || p.pph26 === p.dtp) return { ok: false, message: 'PPh 26 cannot share an account with PPh 21 or PPh 21 DTP.' }
  if (!isLiability(code) && payrollAccount(code)?.type !== 'asset') return { ok: false, message: 'A tax preset posts to a liability or current asset account.' }
  if (payrollAccount(code)?.archived) return { ok: false, message: `${accountLabel(code)} is archived.` }
  payroll.settings.taxPresets = p
  changed(`Tax preset ${key} set to ${accountLabel(code)}`)
  return { ok: true }
}
/**
 * Start booking from this month: Jurnal books payroll from Talenta runs from it, and the old
 * Talenta to Expense sync is blocked from it so nothing is booked twice. Earlier runs stay
 * Before go-live. Owner or Ultimate + LM.
 */
export function setStartMonth(month: string): Result {
  if (!can('connection')) return denied()
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, message: 'Pick a month.' }
  const live = payroll.journals.some((j) => j.type === 'Payroll' && !j.reversedById && j.taxMonth < month && j.taxMonth >= (payroll.settings.cutover.firstLive ?? month))
  if (live) return { ok: false, message: 'A posted payroll journal sits before that month. Reverse it first.' }
  const by = actingPerson()
  payroll.settings.cutover = { firstLive: month, proposedBy: by, confirmedBy: by, mode: 'Block' }
  changed(`Start booking from ${monthLabel(month)}`)
  for (const r of payroll.runs) r.mode = runMode(r.month)
  return { ok: true }
}
export function setLimits(patch: Partial<Limits>): Result {
  if (!can('setup')) return denied()
  Object.assign(payroll.settings.limits, patch)
  changed('Payroll limits changed')
  return { ok: true }
}
export function setPayday(day: number): Result {
  if (!can('setup')) return denied()
  if (day < 1 || day > 31) return { ok: false, message: 'Pick a day from 1 to 31.' }
  payroll.settings.payday = day
  changed(`Payday set to ${day}`)
  return { ok: true }
}

// ── Connection (TS-01) ──────────────────────────────────────────────────────

export const connection = computed(() => ({
  ...payroll.connection,
  otherEntity: payroll.settings.otherEntity,
  sends: payroll.log.filter((l) => l.type === 'Send').length,
}))
export function startConnection(companyId: number): Result {
  if (!can('connection')) return denied()
  if (payroll.connection.status === 'Connected' || payroll.connection.status === 'Waiting for first send') return { ok: false, message: 'A connection is already active.' }
  if (companyId !== PAYROLL_COMPANY_ID) return { ok: false, message: 'This Talenta company is linked elsewhere.' }
  Object.assign(payroll.connection, { status: 'Waiting for first send', companyId, startedBy: actingPerson(), startedAt: now(), endedReason: null, sourceConfirmedBy: null, sourceConfirmedAt: null })
  addLog({ type: 'Connection', status: 'Recorded', reason: `Connection to Talenta company ${companyId} started`, nextStep: 'HR turns on the salary detail webhook in Talenta.' })
  return { ok: true }
}
export function endConnection(reason: string): Result {
  if (!can('connection')) return denied()
  if (reason.trim().length < 10 || reason.trim().length > 200) return { ok: false, message: 'Give a reason of 10 to 200 characters.' }
  payroll.connection.status = 'Ended'; payroll.connection.endedReason = reason.trim()
  addLog({ type: 'Connection', status: 'Recorded', reason: `Connection ended: ${reason.trim()}`, nextStep: 'Open drafts can still post.' })
  return { ok: true }
}
export function restartConnection(companyId: number): Result {
  if (!can('connection')) return denied()
  if (payroll.connection.status !== 'Ended') return { ok: false, message: 'End the connection first.' }
  const warn = companyId !== payroll.connection.companyId ? 'Mappings came from the previous Talenta company.' : null
  Object.assign(payroll.connection, { status: 'Connected', companyId, endedReason: null })
  return { ok: true, warning: warn }
}
export function confirmSource(): Result {
  if (!can('connection')) return denied()
  if (payroll.connection.sourceConfirmedBy) return { ok: false, message: 'The source is already confirmed.' }
  payroll.connection.sourceConfirmedBy = actingPerson()
  payroll.connection.sourceConfirmedAt = now()
  payroll.connection.status = 'Connected'
  addLog({ type: 'Connection', status: 'Recorded', reason: 'Source confirmed', nextStep: 'Held sends re-check.' })
  recheckHeld()
  return { ok: true }
}
export function sourceSummary(runId: string) {
  const run = runById(runId)
  const v = run ? latestVersion(run) : undefined
  if (!v) return null
  const rows = staffRows(v.payload, { all: true })
  return {
    organizations: [...new Set(rows.map((e) => e.organization_name))].sort(),
    branches: [...new Set(rows.map((e) => e.branch))].sort(),
    headcount: new Set(rows.map((e) => e.user_id)).size,
    takeHome: rows.reduce((x, e) => x + e.takeHome, 0),
  }
}
export function answerOtherEntities(yes: boolean): Result {
  if (!can('connection')) return denied()
  payroll.connection.otherEntitiesAnswer = yes
  return { ok: true }
}
export function markOtherEntity(field: 'organization_name' | 'branch', value: string, on: boolean): Result {
  if (!can('connection')) return denied()
  if (payroll.connection.otherEntitiesAnswer !== true) return { ok: false, message: 'The Owner first confirms that this Talenta company holds other legal entities.' }
  const list = payroll.settings.otherEntity
  const i = list.findIndex((x) => x.field === field && x.value === value)
  if (on && i < 0) list.push({ field, value })
  if (!on && i >= 0) list.splice(i, 1)
  changed(`${value} ${on ? 'marked' : 'unmarked'} as other entity`)
  return { ok: true }
}

// ── Log and notices ─────────────────────────────────────────────────────────

function addLog(e: Partial<SyncLogEntry> & Pick<SyncLogEntry, 'type' | 'status' | 'reason' | 'nextStep'>): void {
  payroll.log.push({ id: payroll.seq++, at: payroll.clock, runId: null, runKey: null, version: null, employees: null, journalNo: null, ...e })
}
export const syncLog = computed(() => [...payroll.log].sort((a, b) => b.id - a.id))
function notify(roles: PayrollRole[], text: string, link: string) { payroll.notices.push({ id: payroll.seq++, roles, text, link, at: payroll.clock, read: false }) }
export function noticesFor(role: PayrollRole = payroll.viewAs): PayrollNotice[] { return payroll.notices.filter((n) => n.roles.includes(role)).slice().reverse() }

// ── Reading a send ──────────────────────────────────────────────────────────

/** One employee of a send as Jurnal reads it: no name, take-home pay computed (allowances - deductions). */
export interface StaffRow {
  user_id: number
  employee_id: string
  organization_name: string
  branch: string
  cost_center: string
  job_position: string
  job_level: string
  employment_status: string
  sbu: Record<string, string>
  allowances: TalentaPayItem[]
  deductions: TalentaPayItem[]
  benefits: TalentaPayItem[]
  takeHome: number
}
const SECTIONS: [PaySection, 'allowances' | 'deductions' | 'benefits'][] = [['allowance', 'allowances'], ['deduction', 'deductions'], ['benefit', 'benefits']]
const sumItems = (l: TalentaPayItem[]) => l.reduce((s, i) => s + i.amount, 0)
/** Tax figures Talenta sends as benefit components: read by the PPh 21 rule and the tax presets, never booked as pay items. */
const TAX_INFO = new Set(TAX_COMPONENTS.filter((x) => x.section === 'benefit').map((x) => payItemKeyRaw(x.name, x.section)))
function payItemKeyRaw(name: string, section: PaySection) { return `${section}|${norm(name)}` }
export function isTaxFigure(name: string, section: PaySection): boolean { return TAX_INFO.has(payItemKeyRaw(name, section)) }
/** Amount of one component (by name and section) for one employee. */
export function componentAmount(e: Pick<StaffRow, 'allowances' | 'deductions' | 'benefits'>, name: string, section: PaySection): number {
  const list = section === 'allowance' ? e.allowances : section === 'deduction' ? e.deductions : e.benefits
  const k = norm(name)
  return list.filter((i) => norm(i.name) === k).reduce((s, i) => s + i.amount, 0)
}
function taxAmount(e: StaffRow, f: TaxField): number { return componentAmount(e, f, TAX_COMPONENTS.find((x) => x.name === f)!.section) }
/** PPh 21 rule (LR-10): PPh 21 Benefit + PPH 21 Payment - Total PPh 21 DTP Received. */
function pph21Rule(e: StaffRow): number { return taxAmount(e, 'PPh 21 Benefit') + taxAmount(e, 'PPH 21 Payment') - taxAmount(e, 'Total PPh 21 DTP Received') }
/** Rows Jurnal books: the send's employees less the Other entity groups (all: true keeps them). */
export function staffRows(p: TalentaPayload, o: { all?: boolean } = {}): StaffRow[] {
  const oe = payroll.settings.otherEntity
  return p.items.map((it) => {
    const e = it.employee, c = it.components
    return {
      user_id: e.user_id, employee_id: e.employee_id, organization_name: e.organization_name ?? '', branch: e.branch ?? '', cost_center: e.cost_center ?? '',
      job_position: e.job_position, job_level: e.job_level, employment_status: e.employment_status,
      sbu: Object.fromEntries((e.sbu ?? []).map((x) => [x.key, x.value])),
      allowances: c.allowances, deductions: c.deductions, benefits: c.benefits,
      takeHome: sumItems(c.allowances) - sumItems(c.deductions),
    }
  }).filter((e) => o.all || !oe.some((x) => e[x.field] === x.value))
}
/** Staff, take-home pay and gross allowances of one version's send. */
export function sendFigures(v: RunVersion | undefined) {
  if (!v) return { staff: 0, takeHome: 0, gross: 0 }
  const rows = staffRows(v.payload)
  return { staff: new Set(rows.map((e) => e.user_id)).size, takeHome: rows.reduce((s, e) => s + e.takeHome, 0), gross: rows.reduce((s, e) => s + sumItems(e.allowances), 0) }
}
/** Talenta's tax figures for a run's current version, against the draft's (or the ledger's) PPh 21 lines. */
export function taxFigures(runId: string) {
  const run = runById(runId)
  const v = run ? currentVersionOf(run) : undefined
  if (!run || !v) return null
  const rows = staffRows(v.payload)
  const sum = (f: TaxField) => rows.reduce((s, e) => s + taxAmount(e, f), 0)
  const p = payroll.settings.taxPresets
  const lines = v.draft?.lines ?? liveJournals(runId).flatMap((j) => j.lines)
  const net = (code: string) => lines.filter((l) => l.account === code).reduce((s, l) => s + l.credit - l.debit, 0)
  const benefit = sum('PPh 21 Benefit'), payment = sum('PPH 21 Payment'), dtp = sum('Total PPh 21 DTP Received')
  return {
    benefit, payment, dtp, resign: sum('PPh 21 Resign Benefit'), pph26: sum('PPh 26 Benefit'), paidDeduction: sum('PPH 21 Paid'),
    rule: benefit + payment - dtp, ledger: net(p.pph21), pph26Ledger: net(p.pph26),
    dtpLedger: lines.filter((l) => l.account === p.dtp).reduce((s, l) => s + l.debit - l.credit, 0),
    resignLedger: p.resign === p.pph21 ? null : net(p.resign),
    hasLines: lines.length > 0,
  }
}

// ── Runs: lookup and status ─────────────────────────────────────────────────

export const runs = computed(() => [...payroll.runs].sort((a, b) => b.end.localeCompare(a.end) || b.id.localeCompare(a.id)))
export function runById(id: string | null | undefined): Run | undefined { return id ? payroll.runs.find((r) => r.id === id) : undefined }
export function versionOf(run: Run, no: number | null): RunVersion | undefined { return no == null ? undefined : run.versions.find((v) => v.no === no) }
export function currentVersionOf(run: Run): RunVersion | undefined { return versionOf(run, run.currentVersion) }
function latestVersion(run: Run): RunVersion | undefined { return run.versions[run.versions.length - 1] }
export function draftOf(run: Run): Draft | null { return currentVersionOf(run)?.draft ?? null }
function runMode(month: string): Run['mode'] {
  const c = payroll.settings.cutover
  if (!c.firstLive || !c.confirmedBy) return 'Dry run'
  return month < c.firstLive ? 'Before go-live' : 'Live'
}
const BOOKING: JournalType[] = ['Payroll', 'Correction']
export function liveJournals(runId: string): Journal[] {
  return payroll.journals.filter((j) => j.runId === runId && BOOKING.includes(j.type) && !j.reversedById)
}
export function journalsOf(runId: string): Journal[] { return payroll.journals.filter((j) => j.runId === runId) }
export function journalById(id: string | null): Journal | undefined { return id ? payroll.journals.find((j) => j.id === id) : undefined }
export function journalTotals(j: Pick<Journal, 'lines'>) { return { debit: j.lines.reduce((s, l) => s + l.debit, 0), credit: j.lines.reduce((s, l) => s + l.credit, 0) } }

export type RunStatus = 'Awaiting approval' | 'Confirm source' | 'Waiting for your choice' | 'Held' | 'Ready to post' | 'Posted' | 'Correction ready' | 'Reversed' | 'Dry run' | 'Before go-live' | 'Nothing to post' | 'Received'
export function runHolds(run: Run): Hold[] {
  const pending = run.versions.filter((v) => v.state === 'waiting-choice' || v.state === 'partial').flatMap((v) => v.holds)
  return [...pending, ...(currentVersionOf(run)?.holds ?? [])]
}
export function runStatus(run: Run): RunStatus {
  const holds = runHolds(run)
  if (holds.some((h) => h.code === 'confirm-source')) return 'Confirm source'
  if (run.versions.some((v) => v.state === 'waiting-choice')) return 'Waiting for your choice'
  const live = liveJournals(run.id).length > 0
  if (run.reversedAt && !live) return holds.length ? 'Held' : 'Reversed'
  if (holds.length) return 'Held'
  if (pendingApproval(run)) return 'Awaiting approval'
  if (run.revised && live) return 'Correction ready'
  if (run.ledgerVersion != null && live) return 'Posted'
  if (run.mode !== 'Live') return run.mode
  const d = draftOf(run)
  if (!d) return 'Received'
  return d.nothingToPost ? 'Nothing to post' : 'Ready to post'
}
export function versionLabel(run: Run, v: RunVersion): string {
  if (v.state === 'replaced') return `Replaced by v${v.replacedBy}`
  if (v.state === 'superseded') return 'Superseded, not posted'
  if (v.state === 'waiting-choice') return 'Waiting for your choice'
  if (v.state === 'partial') return 'Looks partial'
  if (v.state === 'rejected') return 'Rejected'
  if (v.state === 'moved') return 'Moved to a separate run'
  if (run.ledgerVersion === v.no && liveJournals(run.id).length) return 'Posted'
  return 'Current'
}

// ── Intake (OD-01, LR-3) ────────────────────────────────────────────────────

export interface SendResult extends Result { status: LogStatus; runId?: string; versionNo?: number }

function runKeyOf(p: TalentaPayload) { return `${p.company_id} / monthly / ${p.period.start_date} / ${p.period.end_date}` }
function bodyHash(p: TalentaPayload) { return hash(JSON.stringify(p)) }
/** The figures of a send: everything but the send time and the names Jurnal drops. */
function figuresHash(p: TalentaPayload) { return hash(JSON.stringify({ ...withoutNames(p), sent_at: '' })) }
/** Talenta sends employee_name; Jurnal never stores or shows it. */
function withoutNames(p: TalentaPayload): TalentaPayload {
  return { ...p, items: p.items.map((it) => ({ ...it, employee: { ...it.employee, employee_name: '' } })) }
}
function badAmounts(p: TalentaPayload): boolean {
  return p.items.some((it) => SECTIONS.some(([, k]) => (it.components?.[k] ?? []).some((x) => !Number.isInteger(x.amount) || x.amount < 0)))
}

export function receiveSalaryDetail(p: TalentaPayload): SendResult {
  const fail = (reason: string, code = 422): SendResult => {
    payroll.connection.rejected.push({ at: payroll.clock, companyId: p?.company_id ?? null, reason })
    addLog({ type: 'Send', status: 'Failed', reason, nextStep: 'Ask HR to re-send from Talenta.', runKey: p?.period ? runKeyOf(p) : null })
    return { ok: false, status: 'Failed', message: reason, code }
  }
  now()
  const c = payroll.connection
  if (c.status === 'Not connected' || c.status === 'Ended' || p.company_id !== c.companyId) return fail('This Talenta company is not linked to this Jurnal company.', 404)
  if (!p.period?.start_date || !p.period?.end_date || !p.sent_at) return fail('The send has no period or send time.')
  if (!p.items?.length) return fail('The send has no employees.')
  if (p.period.end_date < p.period.start_date) return fail('The period ends before it starts.')
  if (badAmounts(p)) return fail('Every amount must be whole rupiah, Rp0 or more.')
  const baseKey = runKeyOf(p)
  const h = bodyHash(p)
  for (const r of payroll.runs.filter((x) => x.baseKey === baseKey)) {
    const dup = r.versions.find((v) => v.hash === h)
    if (dup) return fail(`Duplicate of v${dup.no}`, 409)
  }
  c.lastAcceptedAt = payroll.clock
  const regular = payroll.runs.find((r) => r.baseKey === baseKey && r.kind === 'Regular')
  if (!regular) {
    const month = monthOf(p.period.end_date)
    const run: Run = {
      id: nextId('run'), key: baseKey, baseKey, companyId: p.company_id, periodType: 'monthly', start: p.period.start_date, end: p.period.end_date,
      month, kind: 'Regular', label: 'Regular', versions: [], currentVersion: 1, ledgerVersion: null, mode: runMode(month),
      dryRun: null, revised: false, reversedAt: null,
    }
    run.versions.push(newVersion(1, p, h, 'active'))
    if (run.mode !== 'Live') run.dryRun = { passedBy: null, passedAt: null, signedOffBy: null, signedOffAt: null }
    payroll.runs.push(run)
    checkVersion(run, run.versions[0]!)
    return logReceipt(run, run.versions[0]!)
  }
  const accepted = regular.versions.filter((v) => v.state !== 'rejected')
  const last = accepted[accepted.length - 1]
  if (last && Date.parse(p.sent_at) < Date.parse(last.sentAt)) return fail(`Older than v${last.no}. Jurnal keeps v${last.no}.`, 409)
  if (last && figuresHash(p) === last.figuresHash) {
    addLog({ type: 'Send', status: 'No change', reason: `No change from v${last.no}`, nextStep: 'Nothing to do.', runId: regular.id, runKey: regular.key, version: last.no, employees: p.items.length })
    return { ok: true, status: 'No change', message: `No change from v${last.no}`, runId: regular.id }
  }
  const no = regular.versions.length + 1
  const v = newVersion(no, p, h, 'active')
  regular.versions.push(v)
  const posted = liveJournals(regular.id).length > 0
  if (posted && looksSeparateRun(regular, v)) {
    v.state = 'waiting-choice'
    checkVersion(regular, v)
    return logReceipt(regular, v)
  }
  const partial = partialCheck(regular, v)
  if (partial) { v.state = 'partial'; v.holds = [partial] } else activate(regular, v)
  return logReceipt(regular, v)
}

function newVersion(no: number, p: TalentaPayload, h: string, state: VersionState): RunVersion {
  return {
    no, sentAt: p.sent_at, receivedAt: payroll.clock, hash: h, figuresHash: figuresHash(p), payload: clone(withoutNames(p)), state, replacedBy: null,
    holds: [], warnings: [], acks: {}, draft: null, correction: null, decision: null, changeNotes: {}, headcountExpected: {},
  }
}
/**
 * Make v the current version. Older open versions become "Replaced by vN" (or "Superseded"
 * on a posted run). On a posted run the latest version wins: Jurnal builds the correction.
 */
function activate(run: Run, v: RunVersion) {
  for (const o of run.versions) {
    if (o === v || o.state !== 'active' || o.no === run.ledgerVersion) continue
    o.state = run.ledgerVersion != null ? 'superseded' : 'replaced'
    o.replacedBy = v.no
  }
  v.state = 'active'
  run.currentVersion = v.no
  checkVersion(run, v)
}
function logReceipt(run: Run, v: RunVersion): SendResult {
  const status: LogStatus = v.state === 'waiting-choice' ? 'Waiting for your choice' : v.holds.length ? 'Held' : 'Received'
  const reason = v.holds[0]?.message
    ?? (run.mode !== 'Live' ? `${run.mode}: nothing posts from this send.`
      : v.correction ? `Correction ready: ${v.correction.lines.length} lines.`
        : run.ledgerVersion != null && run.ledgerVersion === v.no ? 'No ledger change.'
          : `Draft built.${v.warnings.length ? ` ${v.warnings.length} warning${v.warnings.length > 1 ? 's' : ''}.` : ''}`)
  addLog({ type: 'Send', status, reason, nextStep: nextStepFor(run, v), runId: run.id, runKey: run.key, version: v.no, employees: v.payload.items.length })
  if (v.holds.length && v.state !== 'waiting-choice') notify(ACTORS, `Payroll ${periodLabel(run.start, run.end)} v${v.no} is held: ${v.holds[0]!.message}`, `/payroll-runs/${run.id}`)
  if (v.state === 'waiting-choice') notify(ACTORS, `Payroll ${periodLabel(run.start, run.end)} v${v.no} looks like a separate run. Pick Revision or Separate run.`, `/payroll-runs/${run.id}`)
  return { ok: true, status, message: reason, runId: run.id, versionNo: v.no }
}
function nextStepFor(run: Run, v: RunVersion): string {
  const h = v.holds[0]
  if (!h) return v.correction ? 'Review the correction and post it.' : v.draft && run.ledgerVersion !== v.no ? 'Review the draft and post.' : 'Nothing to do.'
  const steps: Partial<Record<HoldCode, string>> = {
    'confirm-source': 'The Owner confirms the source.', choice: 'Pick Revision of the posted run or Separate run.',
    partial: 'Pick Replace the full run or Reject.', 'unmapped-item': 'Map the pay item; the run re-checks on save.',
    'unmapped-group': 'Map the group to a dimension value; the run re-checks on save.',
  }
  return steps[h.code] ?? 'Fix the setting; the run re-checks on save.'
}

/** TN-01: drops 10% or more of staff, a whole organization or branch, or 20% of take-home pay. Staff counted by user_id. */
function partialCheck(run: Run, v: RunVersion): Hold | null {
  const ref = versionOf(run, run.currentVersion) ?? versionOf(run, run.ledgerVersion)
  if (!ref || ref === v) return null
  const L = payroll.settings.limits
  const a = staffRows(ref.payload, { all: true }), b = staffRows(v.payload, { all: true })
  const ids = (l: StaffRow[]) => new Set(l.map((e) => e.user_id))
  const before = ids(a).size, after = ids(b).size
  const thpA = a.reduce((s, e) => s + e.takeHome, 0), thpB = b.reduce((s, e) => s + e.takeHome, 0)
  const missing: string[] = []
  if (L.partialWholeGroup) {
    for (const f of ['organization_name', 'branch'] as const) {
      const here = new Set(b.map((e) => e[f]))
      for (const g of new Set(a.map((e) => e[f]))) if (!here.has(g)) missing.push(g)
    }
  }
  const staffDrop = before > 0 && (before - after) / before >= L.partialStaffPct / 100
  const thpDrop = thpA > 0 && (thpA - thpB) / thpA >= L.partialThpPct / 100
  if (!staffDrop && !thpDrop && !missing.length) return null
  return {
    code: 'partial',
    message: `Looks partial: ${after} of ${before} staff.${missing.length ? ` ${listLabel(missing)} missing.` : ''}`,
    details: { before, after, missing, thpBefore: thpA, thpAfter: thpB, versionNo: v.no },
  }
}

export function decidePartial(runId: string, no: number, decision: 'replace' | 'reject', reason?: string): Result {
  if (!can('correct')) return denied()
  const run = runById(runId), v = run && versionOf(run, no)
  if (!run || !v || v.state !== 'partial') return { ok: false, message: 'Nothing to decide.' }
  now()
  if (decision === 'reject') {
    v.state = 'rejected'; v.holds = []
    v.decision = { kind: 'Rejected partial send', reason: reason ?? null, by: actingPerson(), at: payroll.clock }
    addLog({ type: 'Decision', status: 'Recorded', reason: `v${no} rejected as partial`, nextStep: `v${run.currentVersion} stays current.`, runId, runKey: run.key, version: no })
    return { ok: true }
  }
  if (!reason || reason.trim().length < 10) return { ok: false, message: 'Say why this send replaces the full run (10 characters or more).' }
  v.decision = { kind: 'Replaced the full run', reason: reason.trim(), by: actingPerson(), at: payroll.clock }
  v.holds = []
  activate(run, v)
  addLog({ type: 'Decision', status: 'Recorded', reason: `v${no} replaces the full run`, nextStep: nextStepFor(run, v), runId, runKey: run.key, version: no })
  return { ok: true }
}

/** Share of the posted run's staff (by user_id) in this send, and of those how many carry Earning items. */
function overlap(run: Run, v: RunVersion) {
  const posted = versionOf(run, run.ledgerVersion)
  if (!posted) return { pct: 0, earningShare: 0 }
  const ids = new Set(staffRows(posted.payload).map((e) => e.user_id))
  const match = staffRows(v.payload).filter((e) => ids.has(e.user_id))
  const earning = match.filter((e) => e.allowances.some((a) => a.amount > 0 && mappingFor(a.name, 'allowance')?.role === 'Earning'))
  return { pct: ids.size ? match.length / ids.size : 0, earningShare: match.length ? earning.length / match.length : 0 }
}
/**
 * A different send for a posted period is a revision, unless it looks like a separate run:
 * fewer than half of its staff carry the regular (Earning) items. A THR or bonus send has
 * only THR or bonus items, so the regular items are absent.
 */
function looksSeparateRun(run: Run, v: RunVersion): boolean {
  const rows = staffRows(v.payload)
  if (!rows.length) return false
  const earning = rows.filter((e) => e.allowances.some((a) => a.amount > 0 && mappingFor(a.name, 'allowance')?.role === 'Earning'))
  return earning.length / rows.length < 0.5
}
export function chooseRevision(runId: string, no: number): Result {
  if (!can('correct')) return denied()
  const run = runById(runId), v = run && versionOf(run, no)
  if (!run || !v || v.state !== 'waiting-choice') return { ok: false, message: 'Nothing to decide.' }
  now()
  v.decision = { kind: 'Revision of the posted run', reason: null, by: actingPerson(), at: payroll.clock }
  v.holds = []
  addLog({ type: 'Decision', status: 'Recorded', reason: `v${no} is a revision of the posted run`, nextStep: 'Review the correction and post it.', runId, runKey: run.key, version: no })
  v.state = 'active'
  const partial = partialCheck(run, v)
  if (partial) { v.state = 'partial'; v.holds = [partial]; return { ok: true, partial: true } }
  activate(run, v)
  return { ok: true }
}
export function chooseSeparateRun(runId: string, no: number, o: { type: Exclude<RunKind, 'Regular'>; name: string; reason?: string }): Result {
  if (!can('correct')) return denied()
  const run = runById(runId), v = run && versionOf(run, no)
  if (!run || !v || v.state !== 'waiting-choice') return { ok: false, message: 'Nothing to decide.' }
  const name = o.name.trim()
  if (!name) return { ok: false, message: 'Name the separate run.' }
  if (payroll.runs.some((r) => r.baseKey === run.baseKey && norm(r.label) === norm(name))) return { ok: false, message: 'This name is already used in the period.' }
  const ov = overlap(run, v)
  if (ov.pct >= 0.8 && ov.earningShare >= 0.5 && (o.reason ?? '').trim().length < 20)
    return { ok: false, message: `This send repeats ${Math.round(ov.pct * 100)}% of the posted run's staff. Pick Revision, or give a reason of 20 characters or more.` }
  now()
  v.state = 'moved'; v.holds = []
  v.decision = { kind: `Separate run: ${o.type}`, reason: o.reason?.trim() || null, by: actingPerson(), at: payroll.clock }
  const sep: Run = {
    id: nextId('run'), key: `${run.baseKey} / ${o.type} / ${name}`, baseKey: run.baseKey, companyId: run.companyId, periodType: 'monthly',
    start: run.start, end: run.end, month: run.month, kind: o.type, label: name, versions: [], currentVersion: 1, ledgerVersion: null,
    mode: runMode(run.month), dryRun: null, revised: false, reversedAt: null,
  }
  sep.versions.push({ ...clone(v), no: 1, state: 'active', holds: [], warnings: [], acks: {}, draft: null, correction: null, decision: null })
  payroll.runs.push(sep)
  checkVersion(sep, sep.versions[0]!)
  addLog({ type: 'Decision', status: 'Recorded', reason: `v${no} saved as separate run ${o.type} ${name}`, nextStep: nextStepFor(sep, sep.versions[0]!), runId: sep.id, runKey: sep.key, version: 1 })
  return { ok: true, runId: sep.id }
}

// ── Checks: holds stop the send, warnings ride on the draft ─────────────────

export function fieldValue(e: StaffRow, field: string): string {
  if (field.startsWith('sbu:')) return e.sbu[field.slice(4)] ?? ''
  return String((e as unknown as Record<string, unknown>)[field] ?? '')
}
/** An employee's dimension values from the linked fields; an unmatched value or a held empty field is an issue. */
function resolveTags(e: StaffRow, s: PayrollSettings): { tags: Tags; issues: { field: string; dimension: string; value: string; kind: 'empty' | 'unmapped' }[] } {
  const tags: Tags = { Organization: null, Branch: null }
  const issues: { field: string; dimension: string; value: string; kind: 'empty' | 'unmapped' }[] = []
  for (const l of s.dimensionLinks) {
    const val = fieldValue(e, l.field).trim()
    if (!val) { if (l.empty === 'hold') issues.push({ field: l.field, dimension: l.dimension, value: '', kind: 'empty' }); continue }
    const tag = dimensionValue(l.dimension, val, s)
    if (tag) tags[l.dimension] = tag
    else issues.push({ field: l.field, dimension: l.dimension, value: val, kind: 'unmapped' })
  }
  return { tags, issues }
}
/** The group account line for an employee: the first line whose field value matches. */
function groupAccountFor(e: StaffRow, m: PayItemMapping): GroupAccount | undefined {
  return (m.groupAccounts ?? []).find((g) => norm(fieldValue(e, g.field)) === norm(g.value))
}

/** The send a version is compared with for missing components: the version before it, else the previous regular run's latest send. */
function previousSend(run: Run, v: RunVersion): { v: RunVersion; label: string } | null {
  const earlier = run.versions.filter((o) => o.no < v.no && !['rejected', 'moved', 'partial', 'waiting-choice'].includes(o.state)).pop()
  if (earlier) return { v: earlier, label: `v${earlier.no}` }
  const prev = payroll.runs.filter((r) => r.id !== run.id && r.kind === 'Regular' && r.end < run.end && r.currentVersion != null).sort((a, b) => b.end.localeCompare(a.end))[0]
  const pv = prev && (currentVersionOf(prev) ?? versionOf(prev, prev.ledgerVersion))
  return prev && pv ? { v: pv, label: `${periodLabel(prev.start, prev.end)} v${pv.no}` } : null
}
/** Component name and section totals of a send. */
function componentTotals(p: TalentaPayload): Map<string, { name: string; section: PaySection; amount: number }> {
  const m = new Map<string, { name: string; section: PaySection; amount: number }>()
  for (const e of staffRows(p)) for (const [section, k] of SECTIONS) for (const it of e[k]) {
    const key = payItemKeyRaw(it.name, section)
    const x = m.get(key) ?? { name: it.name.trim(), section, amount: 0 }
    x.amount += it.amount; m.set(key, x)
  }
  return m
}

/** Runs every check and builds the draft when nothing holds. Holds stop the send; warnings ride on the draft. */
function checkVersion(run: Run, v: RunVersion): void {
  const s = payroll.settings
  const holds: Hold[] = []
  v.draft = null
  v.warnings = []
  if (!payroll.connection.sourceConfirmedBy) {
    const rows = staffRows(v.payload, { all: true })
    v.holds = [{ code: 'confirm-source', message: 'Confirm source: the first send waits for the Owner.', details: { headcount: new Set(rows.map((e) => e.user_id)).size, takeHome: rows.reduce((x, e) => x + e.takeHome, 0) } }]
    return
  }
  if (v.state === 'waiting-choice') {
    const ov = overlap(run, v)
    v.holds = [{ code: 'choice', message: `A different send arrived for posted payroll ${periodLabel(run.start, run.end)}. Its items look like a separate run. Is it a revision or a separate run?`, details: { overlapPct: Math.round(ov.pct * 100), earningPct: Math.round(ov.earningShare * 100) } }]
    return
  }
  if (v.state === 'partial') return
  if (v.state !== 'active') { v.holds = []; return }
  const staff = staffRows(v.payload)
  // Unmapped pay items (OD-03). Rp0 items and Talenta's tax figures never hold.
  const unmapped = new Map<string, { name: string; section: PaySection; amount: number; staff: Set<number>; reason: string }>()
  for (const e of staff) for (const [section, k] of SECTIONS) {
    for (const it of e[k]) {
      if (!it.amount || isTaxFigure(it.name, section)) continue
      const m = mappingFor(it.name, section, s)
      const reason = !m ? 'no account' : !m.roleConfirmed || !m.role ? 'no confirmed role' : !m.debit || !m.credit ? 'no account' : ''
      if (!reason) continue
      const key = payItemKey(it.name, section)
      const u = unmapped.get(key) ?? { name: it.name.trim(), section, amount: 0, staff: new Set<number>(), reason }
      u.amount += it.amount; u.staff.add(e.user_id); unmapped.set(key, u)
      if (!m) payroll.settings.mapping.push(newMappingRow(it.name, section, 'Talenta'))
    }
  }
  if (unmapped.size) {
    const list = [...unmapped.values()]
    const first = list[0]!
    holds.push({
      code: 'unmapped-item',
      message: `${list.length} pay item${list.length > 1 ? 's have' : ' has'} ${first.reason}: ${list.map((u) => `${u.name} (${u.section}), ${rupiah(u.amount)}, ${u.staff.size} employees`).join('; ')}`,
      details: { items: list.map((u) => ({ key: payItemKey(u.name, u.section), name: u.name, section: u.section, amount: u.amount, employees: u.staff.size, reason: u.reason })) },
    })
  }
  // Dimension values with no match, and empty linked fields set to hold.
  const groups = new Map<string, { field: string; dimension: string; value: string; staff: number }>()
  const empty = new Map<string, number>()
  for (const e of staff) {
    for (const i of resolveTags(e, s).issues) {
      if (i.kind === 'empty') empty.set(i.field, (empty.get(i.field) ?? 0) + 1)
      else { const k = `${i.field}|${i.value}`; const g = groups.get(k) ?? { field: i.field, dimension: i.dimension, value: i.value, staff: 0 }; g.staff++; groups.set(k, g) }
    }
  }
  if (groups.size) holds.push({ code: 'unmapped-group', message: `${groups.size} value${groups.size > 1 ? 's have' : ' has'} no dimension value: ${[...groups.values()].map((g) => `${g.value} (${g.staff} employees)`).join(', ')}`, details: { groups: [...groups.values()] } })
  if (empty.size) holds.push({ code: 'empty-field', message: `Employees with an empty dimension field: ${[...empty.entries()].map(([f, n]) => `${TALENTA_FIELDS.find((x) => x.field === f)?.label ?? f} ${n}`).join(', ')}`, details: { fields: Object.fromEntries(empty) } })
  // Warnings found on the send itself.
  v.warnings = sendWarnings(run, v, staff)
  if (holds.length) { v.holds = holds; return }
  const b = buildJournal(run, v, s)
  v.draft = b.draft
  v.holds = b.holds
  v.warnings.push(...b.warnings)
  refreshCorrection(run, v)
}

/** Missing components against the last send of a regular run, and duplicate user_id rows. */
function sendWarnings(run: Run, v: RunVersion, staff: StaffRow[]): StoredWarning[] {
  const out: StoredWarning[] = []
  if (run.kind === 'Regular') {
    const prev = previousSend(run, v)
    if (prev) {
      const before = componentTotals(prev.v.payload), here = componentTotals(v.payload)
      for (const [k, x] of before) {
        if (!x.amount || here.has(k)) continue
        out.push({ key: `missing:${k}`, code: 'missing-component', message: `${x.name} not in this send`, details: { name: x.name, section: x.section, lastAmount: x.amount, last: prev.label } })
      }
    }
  }
  const seen = new Map<number, number>()
  for (const e of staff) seen.set(e.user_id, (seen.get(e.user_id) ?? 0) + 1)
  const dups = [...seen].filter(([, n]) => n > 1).map(([u]) => u).sort((a, b) => a - b)
  // Keyed by user_id internally; the message carries a count only (no employee data in Jurnal).
  if (dups.length) out.push({ key: `duplicate:${hash(dups.join(','))}`, code: 'duplicate-employee', message: `${dups.length} employee${dups.length > 1 ? 's appear' : ' appears'} more than once in this send. See who in Talenta.`, details: { count: dups.length } })
  return out
}

function recheckHeld(): void {
  for (const run of payroll.runs) {
    for (const v of run.versions) {
      if (v.state === 'waiting-choice' && v.holds.some((h) => h.code === 'confirm-source')) checkVersion(run, v)
      if (v.state !== 'active' || v.no !== run.currentVersion) continue
      if (run.ledgerVersion === v.no && !run.revised) continue
      if (v.holds.length) checkVersion(run, v)
    }
  }
}
/** Re-check the whole run after fixes (holds clear on their own when a mapping is saved; this is the manual re-check). */
export function releaseRun(runId: string): Result {
  if (!can('post')) return denied()
  const run = runById(runId), v = run && currentVersionOf(run)
  if (!run || !v) return { ok: false }
  checkVersion(run, v)
  addLog({ type: 'Hold', status: v.holds.length ? 'Held' : 'Received', reason: v.holds[0]?.message ?? 'Run re-checked', nextStep: nextStepFor(run, v), runId, runKey: run.key, version: v.no })
  return { ok: !v.holds.length, holds: v.holds, message: v.holds[0]?.message }
}
/**
 * OD-10: run every check and build the journal a stored send would post on the
 * current settings. Stores nothing and posts nothing. Call from a handler, not a computed.
 */
export function previewDryRun(runId: string, no?: number): { ok: boolean; holds: Hold[]; warnings: StoredWarning[]; draft: Draft | null; snapshotId: string; at: string; versionNo: number | null } {
  const run = runById(runId)
  const v = run && (versionOf(run, no ?? run.currentVersion) ?? latestVersion(run))
  if (!run || !v) return { ok: false, holds: [], warnings: [], draft: null, snapshotId: currentSnapshotId(), at: payroll.clock, versionNo: null }
  const seq = payroll.seq
  const mappingLen = payroll.settings.mapping.length
  const copy: RunVersion = { ...clone(v), state: 'active' }
  const ledger = run.ledgerVersion
  run.ledgerVersion = null
  try { checkVersion(run, copy) } finally { run.ledgerVersion = ledger }
  payroll.settings.mapping.splice(mappingLen)
  payroll.seq = seq
  return { ok: true, holds: copy.holds, warnings: copy.warnings, draft: copy.draft, snapshotId: currentSnapshotId(), at: payroll.clock, versionNo: v.no }
}

// ── Draft build (TS-05) ─────────────────────────────────────────────────────

interface Bucket { account: string; tags: Tags; amount: number; why: Set<string>; sources: Map<string, LineSource> }
interface BuildResult { draft: Draft; holds: Hold[]; warnings: StoredWarning[] }

function memoFor(run: Run, v: RunVersion): string {
  const kind = run.kind === 'Regular' ? 'monthly' : `${run.kind} ${run.label}`
  return `Talenta payroll, ${kind} ${run.start} to ${run.end}, version ${v.no}, sent ${wib(v.sentAt)}`
}

/** Pure build of one version with the given settings: lines by account and dimension, one payable line per party. */
function buildJournal(run: Run, v: RunVersion, s: PayrollSettings): BuildResult {
  const buckets = new Map<string, Bucket>()
  const add = (account: string, tags: Tags, amt: number, why: string, src: Omit<LineSource, 'side' | 'amount' | 'staff'>, staffId: string | null) => {
    if (!amt) return
    const t = isCost(account) ? tags : NO_TAGS
    const key = `${account}#${tagsKey(t)}${grossBoth(account) ? (amt > 0 ? '#D' : '#C') : ''}`
    const b = buckets.get(key) ?? { account, tags: { ...t }, amount: 0, why: new Set<string>(), sources: new Map() }
    b.amount += amt; b.why.add(why)
    const sk = `${src.item}|${src.section}|${amt > 0 ? 'D' : 'C'}`
    const ls = b.sources.get(sk) ?? { ...src, side: amt > 0 ? 'D' : 'C', amount: 0, staff: [] }
    ls.amount += amt
    if (staffId && !ls.staff.includes(staffId)) ls.staff.push(staffId)
    b.sources.set(sk, ls)
    buckets.set(key, b)
  }
  const hg = s.hutangGaji
  const staff = staffRows(v.payload)
  const all = staffRows(v.payload, { all: true })
  const others = all.filter((e) => !staff.some((x) => x.user_id === e.user_id))
  const itemsToHG: string[] = []
  for (const e of staff) {
    const { tags } = resolveTags(e, s)
    for (const [section, k] of SECTIONS) {
      for (const it of e[k]) {
        const m = mappingFor(it.name, section, s)
        if (!it.amount || !m || !m.debit || !m.credit || isTaxFigure(it.name, section)) continue
        let debit = m.debit
        const why = `${m.name} (${section}), role ${m.role}: Dr ${accountLabel(m.debit)}, Cr ${accountLabel(m.credit)}`
        const costSide = !!m.role && COST_ROLES.includes(m.role) && isCost(debit)
        const ga = costSide ? groupAccountFor(e, m) : undefined
        let lineTags = tags
        let ruleWhy = ''
        if (ga) { debit = ga.account; ruleWhy = `For ${ga.value} use ${accountLabel(ga.account)}` }
        if (costSide && m.fixedTag) lineTags = { ...tags, [m.fixedTag.dimension]: m.fixedTag.value }
        const tagWhy = isCost(debit) && tagsLabel(lineTags) ? `Dimensions ${tagsLabel(lineTags)} from ${costSide && m.fixedTag ? `the fixed ${m.fixedTag.dimension} value on ${m.name}` : 'the dimension links'}` : ''
        const src = { item: m.name, section, role: m.role }
        add(debit, lineTags, it.amount, [why, ruleWhy, tagWhy].filter(Boolean).join('. '), src, String(e.user_id))
        add(m.credit, lineTags, -it.amount, why, src, String(e.user_id))
        if (m.debit === hg && m.credit === hg && !itemsToHG.includes(m.name)) itemsToHG.push(m.name)
      }
    }
    // Tax presets (OD-24): DTP, PPh 26 and severance PPh 21 leave Hutang PPh 21 for their own accounts.
    const p = s.taxPresets
    for (const [field, acct] of [['Total PPh 21 DTP Received', p.dtp], ['PPh 26 Benefit', p.pph26], ['PPh 21 Resign Benefit', p.resign]] as const) {
      const amt = taxAmount(e, field)
      if (!amt || acct === p.pph21) continue
      const why = `Tax preset: ${field} to ${accountLabel(acct)}`
      add(p.pph21, NO_TAGS, amt, why, { item: field, section: 'preset', role: 'Tax' }, String(e.user_id))
      add(acct, NO_TAGS, -amt, why, { item: field, section: 'preset', role: 'Tax' }, String(e.user_id))
    }
  }
  const lines: JournalLine[] = []
  for (const b of buckets.values()) {
    if (!b.amount) continue
    const line: JournalLine = { account: b.account, tags: b.tags, debit: b.amount > 0 ? b.amount : 0, credit: b.amount < 0 ? -b.amount : 0, why: [...b.why], sources: [...b.sources.values()] }
    if (isCost(b.account) && b.amount < 0) line.review = true
    lines.push(line)
  }
  const holds: Hold[] = []
  const warnings: StoredWarning[] = []
  // Hutang Gaji is computed: it equals take-home pay (allowances - deductions). A mapping that breaks it is a warning.
  const thp = staff.reduce((x, e) => x + e.takeHome, 0)
  const hgLine = lines.filter((l) => l.account === hg).reduce((x, l) => x + l.credit - l.debit, 0)
  if (hgLine !== thp) {
    warnings.push({ key: `hutang-gaji:${hgLine}:${thp}`, code: 'hutang-gaji', message: itemsToHG.length ? `${itemsToHG.join(' and ')} post to ${accountName(hg)} on both sides. ${accountName(hg)} ${rupiah(hgLine)} differs from take-home pay ${rupiah(thp)}.` : `${accountName(hg)} ${rupiah(hgLine)} differs from take-home pay ${rupiah(thp)}.`, details: { hutangGaji: hgLine, takeHome: thp, items: itemsToHG } })
  }
  // Two statutory parties on one payable (TN-10): the mapping is unusable, so the run holds.
  const credPar = new Map<string, Set<PayableParty>>()
  for (const m of s.mapping) {
    if (!m.credit || !m.party || !STATUTORY_PARTIES.includes(m.party)) continue
    if (!lines.some((l) => l.account === m.credit && l.sources.some((x) => x.item === m.name))) continue
    const set = credPar.get(m.credit) ?? new Set<PayableParty>()
    set.add(m.party)
    const ap = partyOf(m.credit)
    if (ap && STATUTORY_PARTIES.includes(ap)) set.add(ap)
    credPar.set(m.credit, set)
  }
  for (const [acct, set] of credPar) if (set.size > 1) { const parties = STATUTORY_PARTIES.filter((x) => set.has(x)); holds.push({ code: 'two-parties', message: `${accountName(acct)} holds ${listLabel(parties)}. Each party needs its own payable.`, details: { account: acct, parties } }) }
  for (const l of lines) if (payrollAccount(l.account)?.archived) holds.push({ code: 'archived-account', message: `${accountLabel(l.account)} is archived.`, details: { account: l.account } })
  // Payables below Rp0 (December PPh 21 true-up excepted).
  for (const l of lines) {
    if (partyOf(l.account) && l.debit > 0 && !(l.account === s.taxPresets.pph21 && run.end.slice(5, 7) === '12'))
      warnings.push({ key: `negative:${l.account}`, code: 'negative-payable', message: `${accountName(l.account)} is below Rp0 (${rupiah(-l.debit)}).`, details: { account: l.account, amount: -l.debit } })
  }
  // One PPh 21 rule (LR-10): a difference above the limit is a warning.
  const expected = staff.reduce((x, e) => x + pph21Rule(e), 0)
  const ledger = lines.filter((l) => l.account === s.taxPresets.pph21).reduce((x, l) => x + l.credit - l.debit, 0)
  if (Math.abs(ledger - expected) > s.limits.taxTolerance)
    warnings.push({ key: `tax-rule:${ledger}:${expected}`, code: 'tax-rule', message: `PPh 21 lines ${rupiah(ledger)} differ from the PPh 21 rule ${rupiah(expected)} by ${rupiah(Math.abs(ledger - expected))}.`, details: { ledger, expected } })
  const sortKey = (l: JournalLine) => `${l.debit ? 0 : 1}|${l.account}|${tagsKey(l.tags)}`
  lines.sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  const draft: Draft = {
    id: nextId('draft'), versionNo: v.no, snapshotId: currentSnapshotId(), builtAt: payroll.clock, date: run.end,
    memo: memoFor(run, v), lines, nothingToPost: !lines.length,
    otherEntity: { staff: new Set(others.map((e) => e.user_id)).size, amount: others.reduce((x, e) => x + sumItems(e.allowances), 0) },
  }
  return { draft, holds, warnings }
}

export function isDraftStale(runId: string): boolean {
  const d = draftOf(runById(runId)!)
  return !!d && d.snapshotId !== currentSnapshotId()
}
/** Rebuild the current draft (and correction) on current settings; returns the lines that moved. */
export function rebuildDraft(runId: string): Result {
  const run = runById(runId), v = run && currentVersionOf(run)
  if (!run || !v) return { ok: false }
  const before = v.draft?.lines ?? []
  checkVersion(run, v)
  const changedLines = diffLineSets(before, v.draft?.lines ?? [])
  return { ok: true, changed: changedLines }
}
function netMap(lines: JournalLine[], sign = 1) {
  const m = new Map<string, { account: string; tags: Tags; amount: number }>()
  for (const l of lines) {
    const k = `${l.account}#${tagsKey(l.tags)}`
    const x = m.get(k) ?? { account: l.account, tags: l.tags, amount: 0 }
    x.amount += sign * (l.debit - l.credit); m.set(k, x)
  }
  return m
}
function diffLineSets(a: JournalLine[], b: JournalLine[]) {
  const ma = netMap(a), mb = netMap(b)
  const keys = new Set([...ma.keys(), ...mb.keys()])
  return [...keys].map((k) => ({ key: k, account: (mb.get(k) ?? ma.get(k))!.account, tags: (mb.get(k) ?? ma.get(k))!.tags, old: ma.get(k)?.amount ?? 0, new: mb.get(k)?.amount ?? 0 }))
    .map((r) => ({ ...r, diff: r.new - r.old })).filter((r) => r.diff !== 0)
}

export function whyLine(runId: string, index: number) {
  const d = draftOf(runById(runId)!)
  const l = d?.lines[index]
  if (!l) return null
  return { account: accountLabel(l.account), tags: tagsLabel(l.tags), why: l.why, sources: l.sources.map((s) => ({ item: s.item, section: s.section, role: s.role, amount: Math.abs(s.amount), employees: s.staff.length })) }
}

// ── Draft review and warnings (OD-12) ───────────────────────────────────────

/** OD-12 review: pay item totals, change from last period, headcount by group, the lines, every warning. */
export function draftReview(runId: string) {
  const run = runById(runId)!
  const v = currentVersionOf(run)!
  const d = v.draft
  const staff = staffRows(v.payload)
  const s = payroll.settings
  const items = new Map<string, { name: string; section: PaySection; amount: number; staff: number; role: PayRole | null; taxFigure: boolean }>()
  for (const e of staff) for (const [section, k] of SECTIONS) for (const it of e[k]) {
    const key = payItemKey(it.name, section)
    const x = items.get(key) ?? { name: it.name, section, amount: 0, staff: 0, role: mappingFor(it.name, section)?.role ?? null, taxFigure: isTaxFigure(it.name, section) }
    x.amount += it.amount; x.staff++; items.set(key, x)
  }
  const payItems = [...items.values()]
  const totals = (['allowance', 'deduction', 'benefit'] as PaySection[]).map((section) => ({ section, amount: payItems.filter((p) => p.section === section && !p.taxFigure).reduce((x, p) => x + p.amount, 0) }))
  const changes = largeChanges(run, v)
  const headcount = headcountChanges(runId)
  const warnings = runWarnings(runId)
  return {
    previous: previousRun(run) ? { runId: previousRun(run)!.id, label: periodLabel(previousRun(run)!.start, previousRun(run)!.end) } : null,
    payItems, totals, changes, headcount, lines: d?.lines ?? [], otherEntity: d?.otherEntity ?? null,
    takeHome: staff.reduce((x, e) => x + e.takeHome, 0),
    tax: taxFigures(runId),
    warnings,
    unacknowledged: warnings.filter((w) => !w.acknowledged).length,
    unnotedLargeChanges: changes.filter((c) => c.flag && !c.note).length,
    unexpectedHeadcount: headcount.unexpected,
  }
}
/** Change from the previous posted run by account and dimension; rows over the limits are flagged for a note. */
function largeChanges(run: Run, v: RunVersion) {
  const prev = previousRun(run)
  const prevLines = prev ? liveJournals(prev.id).flatMap((j) => j.lines) : []
  const L = payroll.settings.limits
  const d = v.draft
  return d && prev ? diffLineSets(prevLines, d.lines).map((r) => {
    const pct = r.old ? (r.diff / Math.abs(r.old)) * 100 : null
    const flag = Math.abs(r.diff) > L.largeChangeAmount && (pct == null || Math.abs(pct) > L.largeChangePct)
    return { ...r, label: `${accountLabel(r.account)}${tagsLabel(r.tags) ? ` | ${tagsLabel(r.tags)}` : ''}`, pct, flag, note: v.changeNotes[r.key] ?? null }
  }).filter((r) => isCost(r.account) || partyOf(r.account)) : []
}
/**
 * Every warning on a run's current version, with its acknowledgement. Stored ones come from
 * the send (missing components, tax rule, duplicate rows, payable below Rp0); computed ones
 * are large changes with no note, headcount changes not marked Expected, and manual journals
 * on payroll accounts in the run's month. Posting is never blocked by a warning.
 */
export function runWarnings(runId: string): RunWarning[] {
  const run = runById(runId)
  const v = run ? currentVersionOf(run) : undefined
  if (!run || !v) return []
  const out: StoredWarning[] = [...v.warnings]
  const prev = previousRun(run)
  for (const c of largeChanges(run, v).filter((x) => x.flag && !x.note)) {
    const up = isCost(c.account) ? c.diff > 0 : c.diff < 0
    out.push({ key: `large:${c.key}`, code: 'large-change', message: `${c.label} ${up ? 'up' : 'down'} ${rupiah(Math.abs(c.diff))} from ${prev ? periodLabel(prev.start, prev.end) : 'last period'}, no note.`, details: { rowKey: c.key, diff: c.diff, pct: c.pct } })
  }
  const hc = headcountChanges(runId)
  if (hc.unexpected) out.push({ key: `headcount:${hc.groups.filter((g) => g.flagged && !g.expected).map((g) => g.key).join(',')}`, code: 'headcount', message: `${hc.unexpected} headcount change${hc.unexpected > 1 ? 's are' : ' is'} not marked Expected.`, details: { groups: hc.groups.filter((g) => g.flagged && !g.expected).map((g) => g.label) } })
  for (const m of manualJournalWarnings(run.month)) out.push({ key: `manual:${m.journalId}`, code: 'manual-journal', message: m.message, details: { ...m } })
  return out.map((w) => ({ ...w, acknowledged: v.acks[w.key] ?? null }))
}
/** The Accountant acknowledges one warning (note optional, up to 500 characters). Acknowledged warnings leave the Post confirm text. */
export function acknowledgeWarning(runId: string, key: string, note = ''): Result {
  if (!can('post')) return denied()
  const run = runById(runId)
  const v = run ? currentVersionOf(run) : undefined
  if (!run || !v) return { ok: false }
  if (!runWarnings(runId).some((w) => w.key === key)) return { ok: false, message: 'No such warning on this run.' }
  if (note.length > 500) return { ok: false, message: 'Keep the note to 500 characters.' }
  v.acks[key] = { note: note.trim(), by: actingPerson(), at: now() }
  return { ok: true }
}
export function clearAcknowledgement(runId: string, key: string): Result {
  if (!can('post')) return denied()
  const v = currentVersionOf(runById(runId)!)
  if (!v) return { ok: false }
  delete v.acks[key]
  return { ok: true }
}
/** The text of the Post (or Post correction) confirm: what posts, then every unacknowledged warning. */
export function postConfirmText(runId: string): { title: string; body: string; warnings: string[] } {
  const run = runById(runId)!
  const v = currentVersionOf(run)
  const corr = v?.correction
  const lines = corr ? corr.lines : (v?.draft?.lines ?? [])
  const total = lines.reduce((s, l) => s + l.debit, 0)
  const warnings = runWarnings(runId).filter((w) => !w.acknowledged).map((w) => w.message)
  const pd = postingDate(run.end)
  const title = corr ? `Post the correction for ${periodLabel(run.start, run.end)}?` : `Post payroll ${periodLabel(run.start, run.end)}?`
  const body = `${corr ? `One correction journal, v${run.ledgerVersion} to v${v?.no}` : 'One payroll journal'} of ${rupiah(total)} on ${lines.length} lines, dated ${dateLabel(pd.date)}${pd.redirected ? ` in the first open period, tax month ${monthLabel(run.month)}` : ''}.`
    + (warnings.length ? ` ${warnings.length} warning${warnings.length > 1 ? 's are' : ' is'} not acknowledged: ${warnings.join(' ')}` : '')
  return { title, body, warnings }
}

function previousRun(run: Run): Run | undefined {
  return payroll.runs.filter((r) => r.id !== run.id && r.kind === run.kind && (run.kind === 'Regular' || norm(r.label) === norm(run.label)) && r.end < run.end && liveJournals(r.id).length)
    .sort((a, b) => b.end.localeCompare(a.end))[0]
}
/** Previous posted regular run of the same period type, before this run's period. */
function previousRegularRun(run: Run): Run | undefined {
  return payroll.runs.filter((r) => r.id !== run.id && r.kind === 'Regular' && r.periodType === run.periodType && r.end < run.end && liveJournals(r.id).length)
    .sort((a, b) => b.end.localeCompare(a.end))[0]
}

// ── Headcount from runs (by user_id, counts only) ───────────────────────────

const groupKeyOf = (e: { organization_name: string; branch: string }) => `${e.organization_name}|${e.branch}`
/** Organization and branch as their Jurnal dimension values ("Sales, Bandung"); the Talenta value where none is mapped. */
function groupLabelOf(key: string): string {
  const [org = '', branch = ''] = key.split('|')
  return [dimensionValue('Organization', org) ?? org, dimensionValue('Branch', branch) ?? branch].filter(Boolean).join(', ')
}
/** A move between groups, by group label. No employee data: who moved is read in Talenta. */
export interface HeadcountMove { from: string; to: string }
export interface HeadcountGroup {
  key: string
  label: string
  last: number
  current: number
  change: number
  /** Counts only; the compare itself is keyed by user_id, which never leaves the engine. */
  joined: number
  left: number
  movedIn: number
  movedOut: number
  flagged: boolean
  expected: HeadcountExpected | null
}
/** Internal: per-group user_id sets, for the counts and the Expected fingerprint. Never returned. */
interface GroupIds { joined: number[]; left: number[]; movedIn: string[]; movedOut: string[] }
/**
 * Who joined, left or moved group between the previous posted regular run and this run, as
 * counts per group. Keyed by Talenta's user_id (employee_id is editable in Talenta); no id,
 * name or user_id is returned. "See who in Talenta" is the way to the people.
 * Pure: reads the two sends and the dimension mapping, changes nothing.
 */
export function headcountChanges(runId: string) {
  const run = runById(runId)
  const v = run ? currentVersionOf(run) : undefined
  const prev = run ? previousRegularRun(run) : undefined
  const pv = prev ? versionOf(prev, prev.ledgerVersion) : undefined
  const byUser = (p: TalentaPayload | undefined) => {
    const m = new Map<number, string>()
    for (const e of p ? staffRows(p) : []) if (!m.has(e.user_id)) m.set(e.user_id, groupKeyOf(e))
    return m
  }
  const here = byUser(v?.payload), before = byUser(pv?.payload)
  const groups = new Map<string, HeadcountGroup>()
  const ids = new Map<string, GroupIds>()
  const g = (key: string) => {
    let x = groups.get(key)
    if (!x) { groups.set(key, x = { key, label: groupLabelOf(key), last: 0, current: 0, change: 0, joined: 0, left: 0, movedIn: 0, movedOut: 0, flagged: false, expected: null }); ids.set(key, { joined: [], left: [], movedIn: [], movedOut: [] }) }
    return x
  }
  const idsOf = (key: string) => { g(key); return ids.get(key)! }
  for (const key of here.values()) g(key).current++
  if (pv) for (const key of before.values()) g(key).last++
  const moved: HeadcountMove[] = []
  if (pv) {
    for (const [uid, key] of here) {
      const was = before.get(uid)
      if (was == null) idsOf(key).joined.push(uid)
      else if (was !== key) {
        moved.push({ from: groupLabelOf(was), to: groupLabelOf(key) })
        idsOf(key).movedIn.push(`${uid}<${was}`); idsOf(was).movedOut.push(`${uid}>${key}`)
      }
    }
    for (const [uid, key] of before) if (!here.has(uid)) idsOf(key).left.push(uid)
  }
  const list = [...groups.values()].sort((a, b) => a.label.localeCompare(b.label))
  for (const x of list) {
    const i = ids.get(x.key)!
    Object.assign(x, { joined: i.joined.length, left: i.left.length, movedIn: i.movedIn.length, movedOut: i.movedOut.length })
    x.change = x.current - x.last
    x.flagged = !!(x.joined || x.left || x.movedIn || x.movedOut)
    // A mark covers the people, not the send: an earlier version's mark holds while the same people changed.
    const fp = headcountFingerprint(i)
    const marks = run ? run.versions.filter((o) => o.no <= (v?.no ?? 0)).sort((a, b) => b.no - a.no).map((o) => o.headcountExpected?.[x.key]) : []
    x.expected = x.flagged ? (marks.find((e) => e && e.fingerprint === fp) ?? null) : null
  }
  const flagged = list.filter((x) => x.flagged)
  return {
    previous: prev && pv ? { runId: prev.id, label: periodLabel(prev.start, prev.end), month: prev.month, version: pv.no } : null,
    groups: list,
    last: pv ? before.size : null,
    current: here.size,
    joined: list.reduce((n, x) => n + x.joined, 0),
    left: list.reduce((n, x) => n + x.left, 0),
    moved: moved.sort((a, b) => `${a.from}|${a.to}`.localeCompare(`${b.from}|${b.to}`)),
    flagged: flagged.length,
    unexpected: flagged.filter((x) => !x.expected).length,
  }
}
/** The people a group's change covers, hashed: an Expected mark lapses when a later send changes them. */
function headcountFingerprint(i: GroupIds): string {
  return hash(JSON.stringify([[...i.joined].sort(), [...i.left].sort(), [...i.movedIn].sort(), [...i.movedOut].sort()]))
}
function groupIdsOf(runId: string, key: string): GroupIds | null {
  // Recompute the internal id sets for one group (the public result carries counts only).
  const run = runById(runId)
  const v = run ? currentVersionOf(run) : undefined
  const prev = run ? previousRegularRun(run) : undefined
  const pv = prev ? versionOf(prev, prev.ledgerVersion) : undefined
  if (!v || !pv) return null
  const byUser = (p: TalentaPayload) => { const m = new Map<number, string>(); for (const e of staffRows(p)) if (!m.has(e.user_id)) m.set(e.user_id, groupKeyOf(e)); return m }
  const here = byUser(v.payload), before = byUser(pv.payload)
  const out: GroupIds = { joined: [], left: [], movedIn: [], movedOut: [] }
  for (const [uid, k] of here) { const was = before.get(uid); if (was == null) { if (k === key) out.joined.push(uid) } else if (was !== k) { if (k === key) out.movedIn.push(`${uid}<${was}`); if (was === key) out.movedOut.push(`${uid}>${k}`) } }
  for (const [uid, k] of before) if (!here.has(uid) && k === key) out.left.push(uid)
  return out
}
/** The Accountant marks a group's headcount change Expected (HR settled it; the accountant consumes it). Note optional. */
export function markHeadcountExpected(runId: string, key: string, note = ''): Result {
  if (!can('post')) return denied()
  const run = runById(runId)
  const v = run ? currentVersionOf(run) : undefined
  if (!run || !v) return { ok: false }
  const grp = headcountChanges(runId).groups.find((x) => x.key === key)
  if (!grp?.flagged) return { ok: false, message: 'This group has no headcount change.' }
  if (note.length > 500) return { ok: false, message: 'Keep the note to 500 characters.' }
  v.headcountExpected[key] = { fingerprint: headcountFingerprint(groupIdsOf(runId, key)!), note: note.trim(), by: actingPerson(), at: now() }
  return { ok: true }
}
export function clearHeadcountExpected(runId: string, key: string): Result {
  if (!can('post')) return denied()
  const run = runById(runId)
  const v = run ? currentVersionOf(run) : undefined
  if (!run || !v) return { ok: false }
  for (const o of run.versions) delete o.headcountExpected?.[key]
  return { ok: true }
}
export function addChangeNote(runId: string, key: string, note: string): Result {
  if (!can('post')) return denied()
  const v = currentVersionOf(runById(runId)!)
  if (!v) return { ok: false }
  if (note.length > 500) return { ok: false, message: 'Keep the note to 500 characters.' }
  v.changeNotes[key] = note.trim()
  return { ok: true }
}
/** Reimbursement lines of a run by item and dimension (OD-26), shown as a section on the run page. */
export function claimsSummary(runId: string) {
  const run = runById(runId)!
  const jl = liveJournals(run.id)
  const lines = jl.length ? jl.flatMap((j) => j.lines.map((l) => ({ l, j }))) : (draftOf(run)?.lines ?? []).map((l) => ({ l, j: null as Journal | null }))
  const rows: { item: string; account: string; tags: string; amount: number; employees: number; version: number | null; journal: string | null }[] = []
  for (const { l, j } of lines) for (const s of l.sources) if (s.role === 'Reimbursement' && s.side === 'D') rows.push({ item: s.item, account: accountLabel(l.account), tags: tagsLabel(l.tags), amount: s.amount, employees: s.staff.length, version: j?.versionNo ?? run.currentVersion, journal: j?.number ?? null })
  return { rows, total: rows.reduce((x, r) => x + r.amount, 0) }
}

// ── Periods and locks ───────────────────────────────────────────────────────

export function isLocked(month: string): boolean { return payroll.lockedMonths.includes(month) }
export function firstOpenAfter(month: string): string { let m = month; while (isLocked(m)) m = nextMonthOf(m); return m }
export function lockPeriod(month: string, o: { confirm?: boolean } = {}): Result {
  if (!can('setup')) return denied()
  const open = payroll.runs.filter((r) => r.month === month && ['Received', 'Held', 'Waiting for your choice', 'Correction ready', 'Ready to post'].includes(runStatus(r)))
  if (open.length && !o.confirm) return { ok: false, needsConfirm: true, runs: open.map((r) => ({ id: r.id, label: periodLabel(r.start, r.end), status: runStatus(r) })), message: `${open.length} run${open.length > 1 ? 's are' : ' is'} still open in ${monthLabel(month)}.` }
  if (!isLocked(month)) payroll.lockedMonths.push(month)
  payroll.lockedMonths.sort()
  return { ok: true }
}
export function unlockPeriod(month: string): Result {
  if (!can('setup')) return denied()
  payroll.lockedMonths = payroll.lockedMonths.filter((m) => m !== month)
  return { ok: true }
}
/** Date for a posting into `date`'s month: the date itself, or the first day of the first open period. */
function postingDate(date: string): { date: string; redirected: boolean } {
  const m = monthOf(date)
  if (!isLocked(m)) return { date, redirected: false }
  return { date: `${firstOpenAfter(m)}-01`, redirected: true }
}


// ── Post (TS-05) ────────────────────────────────────────────────────────────

function nextPayNo() { return `PAY-${String(++payroll.payNo).padStart(4, '0')}` }
function nextBnkNo() { return `BNK-${String(++payroll.bnkNo).padStart(4, '0')}` }
function nextJvNo() { return `JV-${String(++payroll.jvNo).padStart(4, '0')}` }
function addJournal(j: Omit<Journal, 'id' | 'number' | 'postedBy' | 'postedAt' | 'reversedById'> & { number?: string }): Journal {
  const journal: Journal = { ...j, id: nextId('j'), number: j.number ?? nextPayNo(), postedBy: actingPerson(), postedAt: payroll.clock, reversedById: null }
  const t = journalTotals(journal)
  if (t.debit !== t.credit) throw new Error(`Journal out of balance: ${t.debit} vs ${t.credit}`)
  payroll.journals.push(journal)
  return journal
}
function correctionMemo(run: Run, fromV: RunVersion, oldNo: string | null): string {
  return `Correction of payroll ${periodLabel(run.start, run.end)} v${run.ledgerVersion ?? fromV.no}${oldNo ? ` (${oldNo})` : ''}, from v${fromV.no} sent ${dateLabel(isoDateWib(fromV.sentAt))}`
}
function isoDateWib(iso: string): string { return new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 10) }
const unackedMessages = (runId: string) => runWarnings(runId).filter((w) => !w.acknowledged).map((w) => w.message)

/** First post of a run: one PAY journal, all or nothing. Warnings never block; the unacknowledged ones come back in `warnings`. */
export function postRun(runId: string, o: { versionNo?: number } = {}): Result {
  if (!can('post')) return denied()
  const run = runById(runId)
  if (!run) return { ok: false, status: 404 }
  const v = currentVersionOf(run)
  if (o.versionNo != null && o.versionNo !== run.currentVersion) return { ok: false, status: 409, message: `A newer version (v${run.currentVersion}) arrived. Review v${run.currentVersion} before posting.` }
  if (run.mode !== 'Live') return { ok: false, status: 409, message: `${run.mode} runs do not post.` }
  if (run.ledgerVersion != null && liveJournals(run.id).length) {
    const posted = liveJournals(run.id)[0]!
    return { ok: false, status: 409, message: run.revised ? `v${run.ledgerVersion} is posted as ${posted.number}. Post the correction for v${run.currentVersion}.` : `v${run.ledgerVersion} is already posted as ${posted.number}.` }
  }
  if (!v || !v.draft) return { ok: false, message: runHolds(run)[0]?.message ?? 'Nothing to post.' }
  if (isDraftStale(runId)) {
    const r = rebuildDraft(runId)
    return { ok: false, stale: true, changed: r.changed, message: 'Settings changed since this draft was built. The draft was rebuilt. Review the changed lines and post again.' }
  }
  if (v.holds.length) return { ok: false, message: v.holds[0]!.message }
  if (v.draft.nothingToPost) return { ok: false, message: 'Nothing to post.' }
  const warnings = unackedMessages(runId)
  if (!approving) {
    const gate = approvalGate(run, v, 'post', v.draft.lines.reduce((x, l) => x + l.debit, 0))
    if (gate) return { ...gate, warnings }
  }
  now()
  const pd = postingDate(v.draft.date)
  const j = addJournal({
    type: 'Payroll', source: 'Talenta payroll', runId, versionNo: v.no, date: pd.date, taxMonth: run.month,
    memo: pd.redirected ? `Payroll ${periodLabel(run.start, run.end)} v${v.no}, posted in the first open period. ${v.draft.memo}` : v.draft.memo,
    reference: pd.redirected ? monthLabel(run.month) : null, correction: pd.redirected,
    lines: clone(v.draft.lines), snapshotId: v.draft.snapshotId, reversesId: null, paymentId: null,
  })
  run.ledgerVersion = v.no; run.revised = false; run.reversedAt = null
  addLog({ type: 'Post', status: 'Posted', reason: `Posted as ${j.number}`, nextStep: 'The salary payable clears when the bank line is matched.', runId, runKey: run.key, version: v.no, employees: v.payload.items.length, journalNo: j.number })
  return { ok: true, journalId: j.id, number: j.number, redirected: pd.redirected, warnings }
}

// ── Approval (Settings > Approval workflows, transaction type Payroll journal) ──

let approving = false
/** The run's approval request while it still applies to the current version. */
export function pendingApproval(run: Run): PayrollApprovalRequest | null {
  const a = run.approval
  return a && a.versionNo === run.currentVersion ? a : null
}
function approvalTask(run: Run, a: PayrollApprovalRequest): InboxTask {
  const what = a.kind === 'post' ? 'Payroll journal' : 'Payroll correction'
  return {
    id: a.taskId, docType: 'Payroll Journal', number: Number(a.taskId.replace(/\D/g, '')) || 0,
    label: `${what} ${periodLabel(run.start, run.end)} v${a.versionNo}`,
    details: `Talenta payroll ${periodLabel(run.start, run.end)}`, requestedBy: a.requestedBy,
    date: isoDateWib(a.requestedAt), dueDate: '', total: a.amount, balanceDue: a.amount, status: 'awaiting approval',
    warehouse: '', reason: 'Amount limit', link: `/payroll-runs/${run.id}`,
    approvers: a.approvers.map((name) => ({ name, role: PAYROLL_PEOPLE.find((p) => p.person === name)?.role ?? 'Approver' })),
  }
}
/** Post / Post correction: when an active rule matches, the draft goes to Inbox > Awaiting approval. Seeded history predates the rule. */
function approvalGate(run: Run, v: RunVersion, kind: 'post' | 'correction', amount: number): Result | null {
  if (seeding) return null
  const pending = pendingApproval(run)
  if (pending) return { ok: false, status: 409, message: `Awaiting approval from ${listLabel(pending.approvers)}.` }
  const check = checkApprovalRequired(amount, actingPerson())
  if (!check.required) return null
  const a: PayrollApprovalRequest = {
    kind, versionNo: v.no, amount, ruleId: check.ruleId!, ruleName: check.ruleName!, approvers: check.approvers,
    requestedBy: actingPerson(), requestedAt: now(), taskId: nextId('PAYJ-'),
  }
  run.approval = a; run.rejection = null
  upsertPayrollApprovalTask(approvalTask(run, a))
  addLog({ type: 'Decision', status: 'Recorded', reason: `Sent for approval: ${a.ruleName}`, nextStep: `${listLabel(a.approvers)} approves or rejects in Inbox > Awaiting approval.`, runId: run.id, runKey: run.key, version: v.no })
  notify(['Owner'], `Payroll ${periodLabel(run.start, run.end)} v${v.no} ${rupiah(amount)} waits for your approval (${a.ruleName}).`, `/payroll-runs/${run.id}`)
  return { ok: true, awaitingApproval: true, status: 202, ruleName: a.ruleName, approvers: a.approvers, message: `Sent for approval to ${listLabel(a.approvers)}: ${a.ruleName}.` }
}
/** True when the acting person is an approver on the run's pending request. */
export function canApprove(runId: string): boolean {
  const run = runById(runId)
  const a = run ? pendingApproval(run) : null
  return !!a && a.approvers.includes(actingPerson())
}
/** The approver approves: the PAY journal (or the correction) posts as requested. */
export function approvePayroll(runId: string): Result {
  const run = runById(runId)
  const a = run ? pendingApproval(run) : null
  if (!run || !a) return { ok: false, message: 'Nothing waits for approval on this run.' }
  if (!a.approvers.includes(actingPerson())) return denied()
  approving = true
  let r: Result
  try { r = a.kind === 'post' ? postRun(runId, { versionNo: a.versionNo }) : postCorrection(runId) } finally { approving = false }
  if (!r.ok) return r
  run.approval = null
  removePayrollApprovalTask(a.taskId)
  addLog({ type: 'Decision', status: 'Recorded', reason: `Approved by ${actingPerson()}: ${a.ruleName}`, nextStep: 'Posted.', runId, runKey: run.key, version: a.versionNo, journalNo: (r.number as string) ?? null })
  notify(ACTORS, `Payroll ${periodLabel(run.start, run.end)} v${a.versionNo} approved by ${actingPerson()} and posted as ${r.number as string}.`, `/payroll-runs/${run.id}`)
  return { ...r, approvedBy: actingPerson() }
}
/** The approver rejects: the run returns to its draft with the reason; Post sends it again. */
export function rejectPayroll(runId: string, reason: string): Result {
  const run = runById(runId)
  const a = run ? pendingApproval(run) : null
  if (!run || !a) return { ok: false, message: 'Nothing waits for approval on this run.' }
  if (!a.approvers.includes(actingPerson())) return denied()
  if (!reason.trim()) return { ok: false, message: 'Give a reason.' }
  now()
  run.approval = null
  run.rejection = { reason: reason.trim(), by: actingPerson(), at: payroll.clock, kind: a.kind }
  removePayrollApprovalTask(a.taskId)
  addLog({ type: 'Decision', status: 'Recorded', reason: `Rejected by ${actingPerson()}: ${reason.trim()}`, nextStep: 'Review the draft and post again.', runId, runKey: run.key, version: a.versionNo })
  notify(ACTORS, `Payroll ${periodLabel(run.start, run.end)} v${a.versionNo} rejected by ${actingPerson()}: ${reason.trim()}`, `/payroll-runs/${run.id}`)
  return { ok: true }
}
/** Inbox tasks the engine stands behind (after a reload or a sample reset). */
function syncApprovalTasks(): void {
  syncPayrollApprovalTasks(payroll.runs.flatMap((r) => { const a = pendingApproval(r); return a ? [approvalTask(r, a)] : [] }))
}

// ── Revisions: the latest version wins, Jurnal builds the correction ────────

export interface CorrectionSummary {
  fromVersion: number
  toVersion: number
  takeHome: { before: number; after: number; change: number }
  pph21: { before: number; after: number; change: number }
  pph26: { before: number; after: number; change: number }
  bpjs: { before: number; after: number; change: number }
  /** Staff counts (compare keyed by user_id internally; no employee data leaves the engine). */
  joined: number
  left: number
  amountChanged: number
  /** Accounts and dimensions the correction moves. */
  moved: { account: string; tags: Tags; label: string; change: number }[]
  /** Settings changed since the posted journal was built: part of the movement is the settings, not Talenta. */
  settingsChanged: boolean
}
export interface Correction { lines: JournalLine[]; summary: CorrectionSummary; builtAt: string; snapshotId: string }

/** Lines a correction posts: the new build minus the live journals (decreases on the opposite side). */
function differenceLines(run: Run, newLines: JournalLine[]): JournalLine[] {
  const liveLines = liveJournals(run.id).flatMap((j) => j.lines)
  return diffLineSets(liveLines, newLines).map((r) => ({
    account: r.account, tags: r.tags, debit: r.diff > 0 ? r.diff : 0, credit: r.diff < 0 ? -r.diff : 0,
    why: [`v${run.ledgerVersion} to v${run.currentVersion}`], sources: sourceDiff(liveLines, newLines, r.key),
  })).filter((l) => l.debit || l.credit)
}
/** Pay item sources of a correction line: new build minus the ledger, per item, section and side. */
function sourceDiff(base: JournalLine[], next: JournalLine[], key: string): LineSource[] {
  const acc = new Map<string, LineSource>()
  const add = (lines: JournalLine[], sign: 1 | -1) => {
    for (const l of lines) {
      if (`${l.account}#${tagsKey(l.tags)}` !== key) continue
      for (const s of l.sources) {
        const k = `${s.item}|${s.section}|${s.side}`
        const x = acc.get(k) ?? { ...s, amount: 0, staff: [] as string[] }
        x.amount += sign * s.amount
        if (sign === 1) x.staff = [...new Set([...x.staff, ...s.staff])]
        acc.set(k, x)
      }
    }
  }
  add(base, -1); add(next, 1)
  return [...acc.values()].filter((s) => s.amount !== 0)
}
function sendTotals(p: TalentaPayload) {
  const rows = staffRows(p)
  const bpjsItems = (e: StaffRow) => SECTIONS.reduce((s, [section, k]) => s + e[k].filter((i) => { const m = mappingFor(i.name, section); return !!m && (partyOf(m.credit) === 'BPJS Kesehatan' || partyOf(m.credit) === 'BPJS Ketenagakerjaan') }).reduce((x, i) => x + i.amount, 0), 0)
  return {
    takeHome: rows.reduce((s, e) => s + e.takeHome, 0),
    pph21: rows.reduce((s, e) => s + pph21Rule(e), 0),
    pph26: rows.reduce((s, e) => s + taxAmount(e, 'PPh 26 Benefit'), 0),
    bpjs: rows.reduce((s, e) => s + bpjsItems(e), 0),
  }
}
function correctionSummary(run: Run, oldV: RunVersion, v: RunVersion, lines: JournalLine[]): CorrectionSummary {
  const a = sendTotals(oldV.payload), b = sendTotals(v.payload)
  const fig = (k: keyof typeof a) => ({ before: a[k], after: b[k], change: b[k] - a[k] })
  const ra = new Map(staffRows(oldV.payload).map((e) => [e.user_id, e])), rb = new Map(staffRows(v.payload).map((e) => [e.user_id, e]))
  const amounts = (e: StaffRow) => JSON.stringify(SECTIONS.map(([, k]) => e[k].map((i) => [norm(i.name), i.amount]).sort()))
  const posted = liveJournals(run.id)
  return {
    fromVersion: oldV.no, toVersion: v.no,
    takeHome: fig('takeHome'), pph21: fig('pph21'), pph26: fig('pph26'), bpjs: fig('bpjs'),
    joined: [...rb.keys()].filter((u) => !ra.has(u)).length,
    left: [...ra.keys()].filter((u) => !rb.has(u)).length,
    amountChanged: [...rb].filter(([u, e]) => ra.has(u) && amounts(ra.get(u)!) !== amounts(e)).length,
    moved: lines.map((l) => ({ account: l.account, tags: l.tags, label: `${accountLabel(l.account)}${tagsLabel(l.tags) ? ` | ${tagsLabel(l.tags)}` : ''}`, change: l.debit - l.credit })),
    settingsChanged: posted.some((j) => j.snapshotId && j.snapshotId !== currentSnapshotId()),
  }
}
/** One-line notice text for a correction summary. */
export function correctionNotice(run: Run, s: CorrectionSummary): string {
  const sign = (n: number) => (n > 0 ? '+' : '') + rupiah(n)
  const staff = s.joined + s.left + s.amountChanged
  return `Payroll ${periodLabel(run.start, run.end)} v${s.toVersion} replaces v${s.fromVersion}. Take-home pay ${sign(s.takeHome.change)}, PPh 21 ${sign(s.pph21.change)}, PPh 26 ${sign(s.pph26.change)}, BPJS ${sign(s.bpjs.change)}. ${staff} staff changed. Correction ready to post.`
}
/**
 * After a version on a posted run is checked: build its correction (difference only) and
 * notify the Accountant, or, when nothing in the ledger moves, make it the ledger version.
 */
function refreshCorrection(run: Run, v: RunVersion): void {
  if (run.ledgerVersion == null || v.no === run.ledgerVersion || v.state !== 'active' || run.currentVersion !== v.no || !liveJournals(run.id).length) { v.correction = null; return }
  if (!v.draft || v.holds.length) { v.correction = null; return }
  const oldV = versionOf(run, run.ledgerVersion)!
  const lines = differenceLines(run, v.draft.lines)
  if (!lines.length) {
    v.correction = null
    const taxMoved = taxChanges(oldV.payload, v.payload)
    retireLedgerVersion(run, oldV, v)
    addLog({ type: 'Send', status: 'No change', reason: taxMoved.length ? 'Tax change, no ledger change' : 'No ledger change', nextStep: taxMoved.length ? 'Amend e-Bupot 21/26.' : 'Nothing to do.', runId: run.id, runKey: run.key, version: v.no })
    if (taxMoved.length) openAmendmentTask(run, oldV, v, true)
    return
  }
  const first = !v.correction
  v.correction = { lines, summary: correctionSummary(run, oldV, v, lines), builtAt: payroll.clock, snapshotId: currentSnapshotId() }
  run.revised = true
  if (first) notify(ACTORS, correctionNotice(run, v.correction.summary), `/payroll-runs/${run.id}`)
}
/** The correction waiting on a run (current version against the ledger), or null. */
export function correctionOf(runId: string): Correction | null {
  const run = runById(runId)
  return run?.revised ? (currentVersionOf(run)?.correction ?? null) : null
}
function fixGuard(run: Run | undefined): { ok: true; run: Run; v: RunVersion } | (Result & { ok: false }) {
  if (!can('correct')) return denied()
  if (!run) return { ok: false, status: 404 }
  const v = currentVersionOf(run)
  if (!v || v.state !== 'active') return { ok: false, message: 'Pick the current version.' }
  if (run.ledgerVersion == null || !liveJournals(run.id).length) return { ok: false, message: 'Nothing posted for this run. Post the draft.' }
  if (v.no === run.ledgerVersion) return { ok: false, status: 409, message: 'This version is already in the ledger.' }
  if (run.versions.some((x) => x.state === 'partial')) return { ok: false, message: `v${run.versions.find((x) => x.state === 'partial')!.no} looks partial. Replace the full run or reject it first.` }
  if (isDraftStale(run.id)) { rebuildDraft(run.id); return { ok: false, stale: true, message: 'Settings changed. The correction was rebuilt; review it and post again.' } }
  if (v.holds.length) return { ok: false, message: v.holds[0]!.message }
  return { ok: true, run, v }
}
function retireLedgerVersion(run: Run, oldV: RunVersion, v: RunVersion) {
  if (oldV !== v) { oldV.state = 'replaced'; oldV.replacedBy = v.no }
  run.ledgerVersion = v.no; run.revised = false
  v.correction = null
}
function afterFix(run: Run, oldV: RunVersion, v: RunVersion, journals: Journal[]) {
  retireLedgerVersion(run, oldV, v)
  for (const j of journals) addLog({ type: j.type === 'Reversal' ? 'Reversal' : 'Post', status: j.type === 'Reversal' ? 'Reversed' : 'Posted', reason: `${j.memo} (${j.number})`, nextStep: 'Payables show the change.', runId: run.id, runKey: run.key, version: v.no, journalNo: j.number })
  if (taxChanges(oldV.payload, v.payload).length) openAmendmentTask(run, oldV, v, false)
}
/** Post correction: one Correction journal with the difference only. Locked month: posts in the first open period, tax month kept. */
export function postCorrection(runId: string): Result {
  const g = fixGuard(runById(runId))
  if (!g.ok) return g
  const { run, v } = g
  const corr = v.correction
  if (!corr) return { ok: false, message: 'No correction to post.' }
  const oldV = versionOf(run, run.ledgerVersion)!
  const warnings = unackedMessages(runId)
  if (!approving) {
    const gate = approvalGate(run, v, 'correction', corr.lines.reduce((x, l) => x + l.debit, 0))
    if (gate) return { ...gate, warnings }
  }
  const live = liveJournals(run.id)
  const pd = postingDate(run.end)
  now()
  const j = addJournal({
    type: 'Correction', source: 'Talenta payroll', runId, versionNo: v.no, date: pd.date, taxMonth: run.month,
    memo: pd.redirected ? correctionMemo(run, v, live[0]?.number ?? null) : `Correction v${run.ledgerVersion} to v${v.no}. ${memoFor(run, v)}`,
    reference: pd.redirected ? monthLabel(run.month) : null, correction: pd.redirected,
    lines: clone(corr.lines), snapshotId: currentSnapshotId(), reversesId: null, paymentId: null,
  })
  afterFix(run, oldV, v, [j])
  return { ok: true, journals: [j.number], journalId: j.id, number: j.number, redirected: pd.redirected, warnings }
}
/** "More" menu: reverse every live journal of the run and post the current version in full. */
export function reverseAndRepost(runId: string): Result {
  const g = fixGuard(runById(runId))
  if (!g.ok) return g
  const { run, v } = g
  const oldV = versionOf(run, run.ledgerVersion)!
  const live = liveJournals(run.id)
  const pd = postingDate(run.end)
  now()
  const reversals = live.map((j) => reversalOf(j, pd.date))
  const b = buildJournal(run, v, payroll.settings)
  const j = addJournal({
    type: 'Payroll', source: 'Talenta payroll', runId, versionNo: v.no, date: pd.date, taxMonth: run.month,
    memo: pd.redirected ? correctionMemo(run, v, live[0]?.number ?? null) : b.draft.memo, reference: pd.redirected ? monthLabel(run.month) : null, correction: pd.redirected,
    lines: b.draft.lines, snapshotId: currentSnapshotId(), reversesId: null, paymentId: null,
  })
  afterFix(run, oldV, v, [...reversals, j])
  return { ok: true, journals: [...reversals, j].map((x) => x.number), redirected: pd.redirected }
}
/** Compare two versions of a run: pay items, account and dimension lines, staff by user_id (shown by employee_id), tax figures. */
export function compareVersions(runId: string, a?: number, b?: number) {
  const run = runById(runId)!
  const oldNo = a ?? run.ledgerVersion ?? run.versions[0]!.no
  const newNo = b ?? run.currentVersion ?? latestVersion(run)!.no
  const va = versionOf(run, oldNo)!, vb = versionOf(run, newNo)!
  const oldLines = oldNo === run.ledgerVersion && liveJournals(run.id).length ? liveJournals(run.id).flatMap((j) => j.lines) : buildJournal(run, va, payroll.settings).draft.lines
  const newLines = buildJournal(run, vb, payroll.settings).draft.lines
  const byAccountTag = diffLineSets(oldLines, newLines).map((r) => ({ ...r, label: `${accountLabel(r.account)}${tagsLabel(r.tags) ? ` | ${tagsLabel(r.tags)}` : ''}` }))
  /** Lines moved only because settings changed since the posted journal was built (shown apart; the correction still posts them). */
  const settingsMoved = oldNo === run.ledgerVersion && liveJournals(run.id).length ? diffLineSets(oldLines, buildJournal(run, va, payroll.settings).draft.lines) : []
  const ia = componentTotals(va.payload), ib = componentTotals(vb.payload)
  const byPayItem = [...new Set([...ia.keys(), ...ib.keys()])].map((k) => {
    const x = (ib.get(k) ?? ia.get(k))!
    const o = ia.get(k)?.amount ?? 0, n = ib.get(k)?.amount ?? 0
    return { name: x.name, section: x.section, old: o, new: n, diff: n - o, missing: ia.has(k) && !ib.has(k) }
  }).filter((r) => r.diff !== 0 || r.missing)
  // Counts per group only; user_id stays inside the engine.
  const ids = (p: TalentaPayload) => new Map(staffRows(p).map((e) => [e.user_id, `${e.organization_name} / ${e.branch}`]))
  const xa = ids(va.payload), xb = ids(vb.payload)
  const countBy = (xs: string[]) => [...xs.reduce((m, g) => m.set(g, (m.get(g) ?? 0) + 1), new Map<string, number>())].map(([group, count]) => ({ group, count })).sort((x, y) => x.group.localeCompare(y.group))
  const added = countBy([...xb].filter(([u]) => !xa.has(u)).map(([, g]) => g))
  const removed = countBy([...xa].filter(([u]) => !xb.has(u)).map(([, g]) => g))
  const tax = taxChanges(va.payload, vb.payload)
  return { oldNo, newNo, oldLabel: `v${oldNo}${oldNo === run.ledgerVersion ? ' (in the ledger)' : ''}`, newLabel: `v${newNo}`, byPayItem, byAccountTag, settingsMoved, headcount: { added, removed }, taxChanges: tax, noLedgerChange: !byAccountTag.length }
}

// ── Reverse (TS-07, LR-4) ───────────────────────────────────────────────────

function reversalOf(j: Journal, date: string, extra: Partial<Journal> = {}): Journal {
  const pd = postingDate(date < j.date ? j.date : date)
  const r = addJournal({
    type: 'Reversal', source: j.source, runId: j.runId, versionNo: j.versionNo, date: pd.date, taxMonth: j.taxMonth,
    memo: `Reversal of ${j.number}`, reference: pd.redirected ? monthLabel(j.taxMonth) : j.reference, correction: pd.redirected || j.correction,
    lines: j.lines.map((l) => ({ ...clone(l), debit: l.credit, credit: l.debit, sources: l.sources.map((s) => ({ ...s, amount: -s.amount, side: s.side === 'D' ? 'C' : 'D' })) })),
    snapshotId: j.snapshotId, reversesId: j.id, paymentId: j.paymentId, ...extra,
  })
  j.reversedById = r.id
  return r
}
/** Bank-matched payments that cleared this run's payables (salary by run; statutory by the run's month). */
export function paymentsFor(runId: string): Payment[] {
  const run = runById(runId)
  return payroll.payments.filter((p) => p.runId === runId || (p.kind === 'Statutory' && p.month === run?.month))
}
/** Reverse every live journal of a run together (TN-21). */
export function reverseRun(runId: string, o: { date?: string; confirmPayments?: boolean } = {}): Result {
  if (!can('correct')) return denied()
  const run = runById(runId)
  const live = run ? liveJournals(run.id) : []
  if (!run || !live.length) return { ok: false, message: 'Nothing posted to reverse.' }
  const pays = payroll.payments.filter((p) => p.runId === runId)
  if (pays.length && !o.confirmPayments) return { ok: false, needsConfirm: true, payments: pays.map((p) => ({ id: p.id, number: journalById(p.journalId)?.number, amount: p.amount })), message: 'Bank payments are matched to this run. Confirm again to reverse; no payment changes.' }
  now()
  const date = o.date ?? live.map((j) => j.date).sort().pop()!
  const done = live.map((j) => reversalOf(j, date))
  run.reversedAt = payroll.clock
  for (const d of done) addLog({ type: 'Reversal', status: 'Reversed', reason: d.memo, nextStep: 'Repost the latest version.', runId, runKey: run.key, version: d.versionNo, journalNo: d.number })
  run.ledgerVersion = null; run.revised = false
  const v = currentVersionOf(run)
  if (v) checkVersion(run, v)
  return { ok: true, journals: done.map((d) => d.number) }
}
export function reverseJournal(journalId: string, o: { date?: string; confirmPayments?: boolean } = {}): Result {
  if (!can('correct')) return denied()
  const j = journalById(journalId)
  if (!j) return { ok: false, status: 404 }
  if (j.reversesId) return { ok: false, message: 'A reversal cannot be reversed.' }
  if (j.reversedById) return { ok: false, message: 'This journal is already reversed.' }
  if (j.runId && BOOKING.includes(j.type)) return reverseRun(j.runId, o)
  return { ok: false, message: 'Bank payments are unmatched in bank reconciliation, not reversed here.' }
}

// ── PPh 21 amendment tasks (OD-16) and the PPh 21 figures behind them ───────

function taxChanges(a: TalentaPayload, b: TalentaPayload) {
  const map = (p: TalentaPayload) => new Map(staffRows(p).map((e) => [e.user_id, e]))
  const ma = map(a), mb = map(b)
  const out: { changes: Partial<Record<TaxField, number>> }[] = []
  for (const uid of new Set([...ma.keys(), ...mb.keys()])) {
    const ch: Partial<Record<TaxField, number>> = {}
    const ea = ma.get(uid), eb = mb.get(uid)
    for (const f of TAX_FIELDS) { const d = (eb ? taxAmount(eb, f) : 0) - (ea ? taxAmount(ea, f) : 0); if (d) ch[f] = d }
    if (Object.keys(ch).length) out.push({ changes: ch })
  }
  // Staff counted by user_id; the rows carry the tax changes only, never who.
  return out
}
function openAmendmentTask(run: Run, a: RunVersion, b: RunVersion, noLedgerChange: boolean) {
  const employees = taxChanges(a.payload, b.payload)
  const periodChange = employees.reduce((x, e) => x + (e.changes['PPh 21 Benefit'] ?? 0) + (e.changes['PPH 21 Payment'] ?? 0) - (e.changes['Total PPh 21 DTP Received'] ?? 0), 0)
  const open = payroll.tasks.find((t) => t.taxMonth === run.month && t.status === 'Open')
  if (open) { Object.assign(open, { toVersion: b.no, employees, periodChange, noLedgerChange }); return }
  payroll.tasks.push({ id: nextId('task'), taxMonth: run.month, runId: run.id, fromVersion: a.no, toVersion: b.no, employees, periodChange, noLedgerChange, status: 'Open', pembetulanNo: null, newTotal: null, reason: null, openedAt: payroll.clock, closedBy: null })
  notify(ACTORS, `Amend e-Bupot 21/26 for ${monthLabel(run.month)}: ${employees.length} staff changed, period total change ${rupiah(periodChange)}`, `/payroll-runs/${run.id}`)
}
function latestAccepted(run: Run): RunVersion | undefined { return [...run.versions].reverse().find((v) => v.state !== 'rejected' && v.state !== 'moved' && v.state !== 'partial' && v.state !== 'waiting-choice') }
const BOOKED: JournalType[] = ['Payroll', 'Correction', 'Reversal']
function bookedLines(month: string, account: string, runId?: string): number {
  return payroll.journals.filter((j) => j.taxMonth === month && j.source === 'Talenta payroll' && BOOKED.includes(j.type) && (!runId || j.runId === runId))
    .flatMap((j) => j.lines).filter((l) => l.account === account).reduce((x, l) => x + l.credit - l.debit, 0)
}
/**
 * PPh 21 for a tax month: Talenta's rule (PPh 21 Benefit + PPH 21 Payment - DTP) over the
 * month's live runs, the books (Hutang PPh 21 credits net), what the bank paid, and the
 * e-Bupot filed total typed, flagged when it differs from the books by more than Rp1.000.
 */
export function pph21Month(month: string) {
  const p = payroll.settings.taxPresets
  const runsM = payroll.runs.filter((r) => r.month === month && r.mode === 'Live')
  const rule = runsM.reduce((s, r) => { const v = versionOf(r, r.ledgerVersion) ?? latestAccepted(r); return s + (v ? staffRows(v.payload).reduce((x, e) => x + pph21Rule(e), 0) : 0) }, 0)
  const books = bookedLines(month, p.pph21)
  const paid = paidFor(p.pph21, month)
  const filed = payroll.ebupot.find((x) => x.month === month) ?? null
  const filedDiff = filed ? filed.filed - books : null
  const flag = filedDiff != null && Math.abs(filedDiff) > payroll.settings.limits.taxTolerance
  return {
    month, rule, books, paid, balance: books - paid, filed, filedDiff, flagged: flag,
    flagMessage: flag ? `e-Bupot PPh 21 filed ${rupiah(filed!.filed)} is ${rupiah(Math.abs(filedDiff!))} ${filedDiff! > 0 ? 'above' : 'below'} the books ${rupiah(books)}.` : null,
  }
}
/** A role with the tax action types the PPh 21 total filed in e-Bupot for a month; the PPh 21 payables row flags a difference above Rp1.000. */
export function setEbupotFiled(month: string, amount: number): Result {
  if (!can('tax')) return denied()
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, message: 'Enter the filed total in rupiah.' }
  const x = payroll.ebupot.find((e) => e.month === month)
  const row = { month, filed: Math.round(amount), by: actingPerson(), at: now() }
  if (x) Object.assign(x, row); else payroll.ebupot.push(row)
  return { ok: true, message: pph21Month(month).flagMessage ?? undefined }
}
export const amendmentTasks = computed(() => payroll.tasks.map((t) => {
  const m = pph21Month(t.taxMonth)
  const gap = m.books - m.paid
  return { ...t, title: `Amend e-Bupot 21/26 for ${monthLabel(t.taxMonth)}`, summary: `${t.employees.length} staff changed, period total change ${rupiah(t.periodChange)}`, depositGap: gap > 0 ? `Deposit ${rupiah(gap)} more` : gap < 0 ? `Overpaid ${rupiah(-gap)}` : 'Deposit matches' }
}))
export function closeAmendmentTask(id: string, outcome: 'Amended' | 'Not filed yet' | 'Dismissed', o: { pembetulanNo?: string; newTotal?: number; reason?: string } = {}): Result {
  if (!can('tax')) return denied()
  const t = payroll.tasks.find((x) => x.id === id)
  if (!t || t.status !== 'Open') return { ok: false }
  if (outcome === 'Amended' && (!o.pembetulanNo?.trim() || o.newTotal == null)) return { ok: false, message: `Enter the pembetulan number and the new ${monthLabel(t.taxMonth)} PPh 21 total.` }
  if (outcome === 'Dismissed' && (o.reason ?? '').trim().length < 10) return { ok: false, message: 'Give a reason of 10 characters or more.' }
  Object.assign(t, { status: outcome, pembetulanNo: o.pembetulanNo ?? null, newTotal: o.newTotal ?? null, reason: o.reason ?? null, closedBy: actingPerson() })
  if (outcome === 'Amended' && o.newTotal != null) {
    const x = payroll.ebupot.find((e) => e.month === t.taxMonth)
    const row = { month: t.taxMonth, filed: Math.round(o.newTotal), by: actingPerson(), at: payroll.clock }
    if (x) Object.assign(x, row); else payroll.ebupot.push(row)
  }
  return { ok: true }
}

// ── Old sync (OD-11, LR-14) ─────────────────────────────────────────────────

export function oldSyncExpense(o: { date: string; amount: number; pattern: 'Payroll' | 'Claim' }): SendResult {
  now()
  const c = payroll.settings.cutover
  const m = monthOf(o.date)
  let outcome: OldSyncCall['outcome'] = 'Passed', message = o.pattern === 'Claim' ? 'Claim, old route' : 'Before go-live: the old sync still posts.'
  if (c.firstLive && c.confirmedBy && m >= c.firstLive && o.pattern === 'Payroll') {
    const inJurnal = payroll.runs.some((r) => r.month === m && (draftOf(r) || liveJournals(r.id).length))
    if (inJurnal) { outcome = 'Blocked'; message = `Payroll for ${monthLabel(m)} is already in Jurnal. The old sync was blocked.` }
    else { outcome = 'Blocked'; message = `Payroll from ${monthLabel(c.firstLive)} posts from Talenta runs. The old sync was blocked.` }
  }
  payroll.oldSync.push({ id: nextId('os'), date: o.date, amount: o.amount, pattern: o.pattern, outcome, message, at: payroll.clock })
  addLog({ type: 'Old sync', status: outcome === 'Blocked' ? 'Blocked' : 'Recorded', reason: message, nextStep: outcome === 'Blocked' ? 'Nothing posts. Payroll comes from the Talenta run.' : 'Nothing to do.' })
  return { ok: outcome !== 'Blocked', status: outcome === 'Blocked' ? 'Blocked' : 'Recorded', message }
}


// ── Simulated Talenta sends ─────────────────────────────────────────────────

export type SendKind = 'regular' | 'new-pay-item' | 'revision' | 'missing-component' | 'partial' | 'separate-run' | 'duplicate' | 'old-sync'
export const SEND_KINDS: { kind: SendKind; label: string }[] = [
  { kind: 'regular', label: 'Regular run, next period' },
  { kind: 'new-pay-item', label: 'Run with a new pay item' },
  { kind: 'revision', label: 'Revision of the last posted run' },
  { kind: 'missing-component', label: 'Re-send without PPH 21 Paid' },
  { kind: 'partial', label: 'Partial re-send' },
  { kind: 'separate-run', label: 'THR run for a posted period' },
  { kind: 'duplicate', label: 'Byte-identical duplicate' },
  { kind: 'old-sync', label: 'Old-sync Expense call' },
]
export interface SimOptions extends Partial<PayloadOptions> {
  runId?: string
  start?: string
  end?: string
  pattern?: 'Payroll' | 'Claim'
  amount?: number
  date?: string
}
function regularRuns() { return payroll.runs.filter((r) => r.kind === 'Regular').sort((a, b) => a.end.localeCompare(b.end)) }
function nextPeriod(): { start: string; end: string } {
  const last = regularRuns().pop()
  if (!last) return { start: '2026-05-21', end: '2026-06-20' }
  const start = addDays(last.end, 1)
  return { start, end: `${nextMonthOf(monthOf(start))}-20` }
}
function sentNow(): string { return new Date(Date.parse(payroll.clock) + 60_000).toISOString() }
export function simulateSend(kind: SendKind, o: SimOptions = {}): SendResult {
  const SIM_KEYS: (keyof PayloadOptions)[] = ['newAllowance', 'raise', 'onlyBranch', 'thr', 'omit', 'taxOff', 'duplicateEmployee', 'taxShift']
  const send = (start: string, end: string, extra: Partial<PayloadOptions> = {}) => {
    const opts: Partial<PayloadOptions> = {}
    for (const k of SIM_KEYS) if (o[k] !== undefined) (opts as Record<string, unknown>)[k] = o[k]
    Object.assign(opts, extra)
    const res = receiveSalaryDetail(buildSalaryDetail(payroll.roster, start, end, { ...opts, sentAt: o.sentAt ?? sentNow() }))
    if (res.ok && !opts.onlyBranch && !opts.thr) payroll.simOptions[`${PAYROLL_COMPANY_ID} / monthly / ${start} / ${end}`] = { ...opts }
    return res
  }
  const saved = (r: Run) => ({ ...(payroll.simOptions[r.baseKey] ?? {}) })
  const lastPosted = () => o.runId ? runById(o.runId) : regularRuns().filter((r) => liveJournals(r.id).length).pop()
  switch (kind) {
    case 'regular': { const p = o.start && o.end ? { start: o.start, end: o.end } : nextPeriod(); return send(p.start, p.end) }
    case 'new-pay-item': {
      if (o.start && o.end) return send(o.start, o.end, { newAllowance: o.newAllowance ?? { name: 'Insentif Penjualan', organization: 'Sales', amount: 1_500_000 } })
      const open = o.runId ? runById(o.runId) : regularRuns().filter((r) => r.mode === 'Live' && r.ledgerVersion == null).pop()
      if (open) return send(open.start, open.end, { ...saved(open), newAllowance: o.newAllowance ?? { name: 'Tunjangan Transport', amount: 600_000 } })
      const p = nextPeriod()
      return send(p.start, p.end, { newAllowance: o.newAllowance ?? { name: 'Insentif Penjualan', organization: 'Sales', amount: 1_500_000 } })
    }
    case 'revision': {
      const r = lastPosted()
      if (!r) return { ok: false, status: 'Failed', message: 'No posted run to revise.' }
      return send(r.start, r.end, { ...saved(r), raise: o.raise ?? { organization: 'Human Capital', amount: 500_000 } })
    }
    case 'missing-component': {
      const r = o.runId ? runById(o.runId) : regularRuns().pop()
      if (!r) return { ok: false, status: 'Failed', message: 'No run to re-send.' }
      return send(r.start, r.end, { ...saved(r), omit: o.omit ?? ['PPH 21 Paid'] })
    }
    case 'partial': {
      const r = o.runId ? runById(o.runId) : regularRuns().pop()
      if (!r) return { ok: false, status: 'Failed', message: 'No run to re-send.' }
      return send(r.start, r.end, { ...saved(r), onlyBranch: o.onlyBranch ?? 'Bandung' })
    }
    case 'separate-run': {
      const r = lastPosted()
      if (!r) return { ok: false, status: 'Failed', message: 'No posted period.' }
      return send(r.start, r.end, { thr: true })
    }
    case 'duplicate': {
      const all = payroll.runs.flatMap((r) => r.versions.map((v) => v))
      const last = all.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)).pop()
      if (!last) return { ok: false, status: 'Failed', message: 'Nothing sent yet.' }
      // Talenta re-sends the same bytes, names included (Jurnal stored them blank).
      const p = clone(last.payload)
      for (const it of p.items) it.employee.employee_name = sampleEmployeeName(it.employee.employee_id)
      return receiveSalaryDetail(p)
    }
    case 'old-sync': {
      const r = regularRuns().filter((x) => liveJournals(x.id).length).pop()
      return oldSyncExpense({ date: o.date ?? (r ? r.end : today()), amount: o.amount ?? 480_000_000, pattern: o.pattern ?? 'Payroll' })
    }
  }
}

// ── Payables tracker (FG-5): owed from payroll journals, paid by bank matches ──

const PARTY_DUE: Record<PayableParty, (month: string) => string | null> = {
  Staff: () => null,
  'DJP PPh 21': (m) => `${nextMonthOf(m)}-15`, 'DJP PPh 26': (m) => `${nextMonthOf(m)}-15`,
  'BPJS Ketenagakerjaan': (m) => `${nextMonthOf(m)}-15`, 'BPJS Kesehatan': (m) => `${nextMonthOf(m)}-10`, Other: () => null,
}
function salaryDue(run: Run): string {
  const last = lastDayOf(run.month)
  const d = `${run.month}-${String(payroll.settings.payday).padStart(2, '0')}`
  return d > last ? last : d
}
function owedFor(account: string, month: string, runId?: string): number { return bookedLines(month, account, runId) }
function paidFor(account: string, month: string, runId?: string): number {
  return payroll.payments.filter((p) => p.account === account && p.month === month && (!runId || p.runId === runId)).reduce((s, p) => s + p.amount, 0)
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY)
export interface PayableFlag { code: 'bank-differs' | 'ebupot-differs' | 'manual-journal'; message: string }
export interface PayableRow {
  key: string; account: string; party: PayableParty; month: string; runId: string | null; label: string
  owed: number; paid: number; balance: number; due: string | null; dueLabel: string; overdueDays: number; paidLateDays: number
  status: 'Open' | 'Partly paid' | 'Paid' | 'Paid late' | 'Overdue' | 'Overpaid'
  statusLabel: string
  /** Payments (bank matches) behind "paid", oldest first. */
  payments: { id: string; number: string; date: string; bank: string; amount: number; statement: string }[]
  /** Correction waiting on the run (salary rows): the take-home pay the correction would make owed. */
  pendingOwed: number | null
  /** PPh 21 rows: the e-Bupot check. */
  ebupot: { filed: number; books: number; difference: number; by: string; at: string } | null
  flags: PayableFlag[]
}
/**
 * One row per payable per tax month (salary rows per run): owed, paid, balance, due date, status,
 * plus the flags that moved here from reconciliation: bank paid differs from the posted run
 * (salary rows), e-Bupot PPh 21 filed total differs from the books by more than Rp1.000 (PPh 21
 * rows), and any manual journal on the account in the month.
 */
export function payablesTracker(month?: string): PayableRow[] {
  const rows: PayableRow[] = []
  const t = today()
  const months = [...new Set(payroll.journals.filter((j) => j.source === 'Talenta payroll' && BOOKED.includes(j.type)).map((j) => j.taxMonth))].filter((m) => !month || m === month).sort().reverse()
  const mk = (account: string, party: PayableParty, m: string, run: Run | null, label: string): PayableRow => {
    const owed = owedFor(account, m, run?.id), paid = paidFor(account, m, run?.id)
    const due = run ? salaryDue(run) : PARTY_DUE[party](m)
    const balance = owed - paid
    const pays = payroll.payments.filter((p) => p.account === account && p.month === m && (!run || p.runId === run.id)).sort((a, b) => a.date.localeCompare(b.date))
    const lastPay = pays.map((p) => p.date).pop()
    const overdueDays = due && balance > 0 && t > due ? daysBetween(due, t) : 0
    const paidLateDays = due && balance === 0 && lastPay && lastPay > due ? daysBetween(due, lastPay) : 0
    const status: PayableRow['status'] = balance < 0 ? 'Overpaid' : balance === 0 ? (paidLateDays ? 'Paid late' : 'Paid') : overdueDays ? 'Overdue' : paid > 0 ? 'Partly paid' : 'Open'
    const statusLabel = status === 'Overpaid' ? `Overpaid ${rupiah(-balance)}` : status === 'Overdue' ? `Overdue ${overdueDays} day${overdueDays > 1 ? 's' : ''}` : status === 'Paid late' ? `Paid late, ${paidLateDays} day${paidLateDays > 1 ? 's' : ''}` : status
    const flags: PayableFlag[] = []
    if (run && paid > 0 && paid !== owed) flags.push({ code: 'bank-differs', message: `Bank paid ${rupiah(paid)} against the posted run ${rupiah(owed)}: ${paid > owed ? 'over' : 'under'} by ${rupiah(Math.abs(paid - owed))}.` })
    let ebupot: PayableRow['ebupot'] = null
    if (account === payroll.settings.taxPresets.pph21 && !run) {
      const x = pph21Month(m)
      if (x.filed) ebupot = { filed: x.filed.filed, books: x.books, difference: x.filedDiff!, by: x.filed.by, at: x.filed.at }
      if (x.flagMessage) flags.push({ code: 'ebupot-differs', message: x.flagMessage })
    }
    for (const w of manualJournalWarnings(m).filter((w) => w.accounts.includes(account))) flags.push({ code: 'manual-journal', message: w.message })
    const corr = run ? correctionOf(run.id) : null
    return {
      key: `${account}|${m}|${run?.id ?? ''}`, account, party, month: m, runId: run?.id ?? null, label, owed, paid, balance, due, dueLabel: due ? dateLabel(due) : 'Not set',
      overdueDays, paidLateDays, status, statusLabel,
      payments: pays.map((p) => ({ id: p.id, number: journalById(p.journalId)?.number ?? '', date: p.date, bank: accountLabel(p.bank), amount: p.amount, statement: payroll.bankLines.find((b) => b.id === p.statementLineId)?.description ?? '' })),
      pendingOwed: corr ? owed + corr.lines.filter((l) => l.account === account).reduce((s, l) => s + l.credit - l.debit, 0) : null,
      ebupot, flags,
    }
  }
  for (const m of months) {
    for (const run of payroll.runs.filter((r) => r.month === m && journalsOf(r.id).some((j) => BOOKED.includes(j.type)))) rows.push(mk(payroll.settings.hutangGaji, 'Staff', m, run, `Salary ${run.kind === 'Regular' ? '' : run.label + ' '}${periodLabel(run.start, run.end)}`))
    for (const a of payroll.accounts.filter((x) => x.party && x.party !== 'Staff')) {
      if (!owedFor(a.code, m) && !paidFor(a.code, m)) continue
      rows.push(mk(a.code, a.party!, m, null, `${a.name} ${monthLabel(m)}`))
    }
  }
  return rows
}

// ── Bank payments (simulated bank reconciliation matches) ───────────────────

export type BankPaymentKind = 'salary' | 'pph21' | 'pph26' | 'bpjs-kesehatan' | 'bpjs-ketenagakerjaan' | 'dplk' | 'partial' | 'overpaid'
export const BANK_PAYMENT_KINDS: { kind: BankPaymentKind; label: string }[] = [
  { kind: 'salary', label: 'Salary transfer for the latest posted run' },
  { kind: 'pph21', label: 'PPh 21 deposit' },
  { kind: 'pph26', label: 'PPh 26 deposit' },
  { kind: 'bpjs-kesehatan', label: 'BPJS Kesehatan payment' },
  { kind: 'bpjs-ketenagakerjaan', label: 'BPJS Ketenagakerjaan payment' },
  { kind: 'dplk', label: 'DPLK payment' },
  { kind: 'partial', label: 'Salary transfer short of the run' },
  { kind: 'overpaid', label: 'Salary transfer over the run' },
]
export interface BankPaymentOptions {
  /** Salary kinds: the run (default: the latest posted run with a salary balance, else the latest posted run). */
  runId?: string
  /** Statutory kinds: the tax month (default: the oldest month with an open balance). */
  month?: string
  /** partial / overpaid: which payable (default 'salary'). */
  of?: Exclude<BankPaymentKind, 'partial' | 'overpaid'>
  /** Amount on the bank line (default: the open balance; partial pays half, overpaid adds Rp250.000). */
  amount?: number
  date?: string
  bank?: string
}
const KIND_ACCOUNT: Record<Exclude<BankPaymentKind, 'salary' | 'partial' | 'overpaid'>, () => string> = {
  pph21: () => payroll.settings.taxPresets.pph21, pph26: () => payroll.settings.taxPresets.pph26,
  'bpjs-kesehatan': () => ACC.bpjsKes, 'bpjs-ketenagakerjaan': () => ACC.bpjsTk, dplk: () => ACC.dplk,
}
const STATEMENT_TEXT: Record<Exclude<BankPaymentKind, 'partial' | 'overpaid'>, string> = {
  salary: 'TRF PAYROLL', pph21: 'MPN G2 PPH21', pph26: 'MPN G2 PPH26', 'bpjs-kesehatan': 'BPJS KESEHATAN', 'bpjs-ketenagakerjaan': 'BPJS TK', dplk: 'DPLK',
}
/**
 * Prototype stand-in for Jurnal's bank reconciliation: a bank statement line arrives and is
 * matched to a payroll payable. The match posts the payment (Dr the payable, Cr the bank) as a
 * 'Salary payment' or 'Statutory payment' journal with source 'Bank reconciliation'.
 * Kinds: salary / pph21 / pph26 / bpjs-kesehatan / bpjs-ketenagakerjaan / dplk, plus partial
 * (half the open balance) and overpaid (open balance + Rp250.000) of `opts.of` (default salary).
 */
export function simulateBankPayment(kind: BankPaymentKind, o: BankPaymentOptions = {}): Result {
  if (!can('simulate')) return denied()
  const base = kind === 'partial' || kind === 'overpaid' ? (o.of ?? 'salary') : kind
  const bank = o.bank ?? ACC.bca
  let account: string, month: string, run: Run | undefined, party: PayableParty, label: string
  if (base === 'salary') {
    const posted = regularRuns().concat(payroll.runs.filter((r) => r.kind !== 'Regular')).filter((r) => liveJournals(r.id).length)
    run = o.runId ? runById(o.runId) : (posted.filter((r) => owedFor(payroll.settings.hutangGaji, r.month, r.id) - paidFor(payroll.settings.hutangGaji, r.month, r.id) > 0).sort((a, b) => a.end.localeCompare(b.end))[0] ?? posted.sort((a, b) => a.end.localeCompare(b.end)).pop())
    if (!run || !liveJournals(run.id).length) return { ok: false, message: 'No posted run to pay.' }
    account = payroll.settings.hutangGaji; month = run.month; party = 'Staff'; label = `Salary ${periodLabel(run.start, run.end)}`
  } else {
    account = KIND_ACCOUNT[base]()
    party = payrollAccount(account)?.party ?? 'Other'
    const open = [...new Set(payroll.journals.filter((j) => j.source === 'Talenta payroll' && BOOKED.includes(j.type)).map((j) => j.taxMonth))].sort().filter((m) => owedFor(account, m) - paidFor(account, m) > 0)
    month = o.month ?? open[0] ?? ''
    if (!month) return { ok: false, message: `Nothing open on ${accountName(account)}.` }
    label = `${accountName(account)} ${monthLabel(month)}`
  }
  const open = owedFor(account, month, run?.id) - paidFor(account, month, run?.id)
  const amount = o.amount ?? (kind === 'partial' ? Math.round(open / 2) : kind === 'overpaid' ? open + 250_000 : open)
  if (amount <= 0) return { ok: false, message: `${label} has nothing open to pay.` }
  const date = o.date ?? today()
  if (isLocked(monthOf(date))) return { ok: false, message: `${monthLabel(monthOf(date))} is locked.` }
  now()
  const line: BankStatementLine = { id: nextId('bsl'), bank, date, description: `${STATEMENT_TEXT[base]} ${monthLabel(month).toUpperCase()}`, amount, paymentId: '' }
  const memo = `${label}, matched in bank reconciliation`
  const j = addJournal({
    number: nextBnkNo(), type: base === 'salary' ? 'Salary payment' : 'Statutory payment', source: 'Bank reconciliation', runId: run?.id ?? null, versionNo: null,
    date, taxMonth: month, memo, reference: line.description, correction: false,
    lines: [
      { account, tags: NO_TAGS, debit: amount, credit: 0, why: [memo], sources: [] },
      { account: bank, tags: NO_TAGS, debit: 0, credit: amount, why: [`Bank statement line ${line.description}`], sources: [] },
    ],
    snapshotId: null, reversesId: null, paymentId: null,
  })
  const p: Payment = { id: nextId('pay'), kind: base === 'salary' ? 'Salary' : 'Statutory', party, account, runId: run?.id ?? null, month, bank, date, amount, journalId: j.id, statementLineId: line.id }
  line.paymentId = p.id; j.paymentId = p.id
  payroll.bankLines.push(line)
  payroll.payments.push(p)
  addLog({ type: 'Payment', status: 'Recorded', reason: `${label} paid ${rupiah(amount)} (${j.number}), matched in bank reconciliation`, nextStep: 'Nothing to do.', runId: run?.id ?? null, runKey: run?.key ?? null, journalNo: j.number })
  return { ok: true, paymentId: p.id, number: j.number, amount, account, month }
}

// ── Manual journals on payroll accounts ─────────────────────────────────────

/** Payroll accounts a manual journal should not touch: Hutang Gaji, every payable with a party, PPh 21 DTP, the payroll cost accounts. */
export function isPayrollAccount(code: string): boolean {
  const a = payrollAccount(code)
  if (!a) return false
  return code === payroll.settings.hutangGaji || !!a.party || code === payroll.settings.taxPresets.dtp || a.type === 'expense' || a.type === 'cogs'
}
/**
 * Prototype stand-in for a general journal someone posts by hand (not from Talenta). Default:
 * Dr Salaries, Cr Hutang Gaji, Rp1.500.000, dated on the latest regular run's end date.
 */
export function simulateManualJournal(o: { debit?: string; credit?: string; amount?: number; date?: string; memo?: string } = {}): Result {
  if (!can('simulate')) return denied()
  const last = regularRuns().filter((r) => r.currentVersion != null).pop()
  const date = o.date ?? last?.end ?? today()
  if (isLocked(monthOf(date))) return { ok: false, message: `${monthLabel(monthOf(date))} is locked.` }
  const debit = o.debit ?? ACC.salaries, credit = o.credit ?? payroll.settings.hutangGaji
  const amount = Math.round(o.amount ?? 1_500_000)
  if (amount <= 0) return { ok: false, message: 'Enter an amount above Rp0.' }
  now()
  const memo = o.memo ?? 'Salary adjustment'
  const j = addJournal({
    number: nextJvNo(), type: 'Manual', source: 'Manual journal', runId: null, versionNo: null, date, taxMonth: monthOf(date), memo, reference: null, correction: false,
    lines: [
      { account: debit, tags: NO_TAGS, debit: amount, credit: 0, why: [memo], sources: [] },
      { account: credit, tags: NO_TAGS, debit: 0, credit: amount, why: [memo], sources: [] },
    ],
    snapshotId: null, reversesId: null, paymentId: null,
  })
  addLog({ type: 'Manual journal', status: 'Recorded', reason: `${j.number} posts ${rupiah(amount)} to ${listLabel([debit, credit].filter(isPayrollAccount).map(accountName))}`, nextStep: 'The run and Payroll payables show a warning.', journalNo: j.number })
  return { ok: true, journalId: j.id, number: j.number }
}
export interface ManualJournalWarning { journalId: string; number: string; date: string; month: string; accounts: string[]; amount: number; message: string }
/**
 * Every non-PAY journal (posted by hand, not from Talenta or a bank match) that hits a payroll
 * account in a month. Pass a run id (its month) or a month ('2026-09').
 */
export function manualJournalWarnings(runIdOrMonth: string): ManualJournalWarning[] {
  const month = runById(runIdOrMonth)?.month ?? runIdOrMonth
  return payroll.journals.filter((j) => j.source === 'Manual journal' && !j.reversedById && !j.reversesId && monthOf(j.date) === month).flatMap((j) => {
    const accounts = [...new Set(j.lines.map((l) => l.account).filter(isPayrollAccount))]
    if (!accounts.length) return []
    const amount = journalTotals(j).debit
    return [{ journalId: j.id, number: j.number, date: j.date, month, accounts, amount, message: `Manual journal ${j.number} (${dateLabel(j.date)}) posts ${rupiah(amount)} to ${listLabel(accounts.map(accountName))}, outside Talenta payroll.` }]
  })
}

// ── Sample data ─────────────────────────────────────────────────────────────

function as<T>(role: PayrollRole, fn: () => T): T { const prev = payroll.viewAs; payroll.viewAs = role; try { return fn() } finally { payroll.viewAs = prev } }
function must(r: Result, what: string): Result { if (!r.ok) throw new Error(`Payroll seed: ${what}: ${r.message ?? JSON.stringify(r)}`); return r }

function seedSettings() {
  const s = payroll.settings
  const M = (name: string, section: PaySection, role: PayRole, debit: string, credit: string, party: PayableParty | null = null, extra: Partial<PayItemMapping> = {}) => {
    s.mapping.push({ ...newMappingRow(name, section, 'Talenta'), role, roleConfirmed: true, debit, credit, party: party ?? partyFromName(name), ...extra })
  }
  const HG = ACC.hutangGaji
  M('Basic Salary', 'allowance', 'Earning', ACC.salaries, HG, 'Staff')
  M('Tunjangan Jabatan', 'allowance', 'Earning', ACC.salaries, HG, 'Staff')
  M('Uang Makan', 'allowance', 'Earning', ACC.salaries, HG, 'Staff')
  M('Reimbursement Medical', 'allowance', 'Reimbursement', ACC.medical, HG, 'Staff')
  M('PPh 21 Ditanggung Pemerintah', 'allowance', 'Tax', ACC.dtp, HG, null)
  M('THR Keagamaan', 'allowance', 'THR', ACC.salaries, HG, 'Staff', { addedBy: 'Jurnal' })
  M('JHT Employee', 'deduction', 'Employee deduction', HG, ACC.bpjsTk)
  M('JP Employee', 'deduction', 'Employee deduction', HG, ACC.bpjsTk)
  M('BPJSK Employee', 'deduction', 'Employee deduction', HG, ACC.bpjsKes)
  M('PPH 21 Paid', 'deduction', 'Tax', HG, ACC.pph21)
  M('PPH 21 Payment', 'deduction', 'Tax', HG, ACC.pph21)
  M('Loan Instalment', 'deduction', 'Loan', HG, ACC.loanReceivable, null)
  M('THR Paid', 'deduction', 'Advance offset', HG, ACC.thrAdvance, null)
  M('BPJS K paid by company', 'benefit', 'Employer contribution', ACC.salaries, ACC.bpjsKes)
  M('JKK paid by company', 'benefit', 'Employer contribution', ACC.salaries, ACC.bpjsTk)
  M('JKM paid by company', 'benefit', 'Employer contribution', ACC.salaries, ACC.bpjsTk)
  M('JHT paid by company', 'benefit', 'Employer contribution', ACC.salaries, ACC.bpjsTk)
  M('JP paid by company', 'benefit', 'Employer contribution', ACC.salaries, ACC.bpjsTk)
  M('DPLK paid by company', 'benefit', 'Employer contribution', ACC.salaries, ACC.dplk)
  // Store and sales pay goes to its own cost account; dimension values match Talenta's names, so no explicit map.
  const split: GroupAccount[] = [
    ...['Store Jakarta Kemang', 'Store Bandung Dago', 'Store Surabaya Tunjungan'].map((value) => ({ field: 'cost_center' as const, value, account: ACC.directLabour })),
    { field: 'organization_name', value: 'Sales', account: ACC.salesSalaries },
  ]
  for (const m of s.mapping) if (m.role === 'Earning' || m.role === 'Employer contribution') m.groupAccounts = split.map((g) => ({ ...g }))
}

function seed() {
  seeding = true
  Object.assign(payroll, emptyState())
  payroll.roster = sampleRoster()
  setClock('2026-06-01T02:00:00Z')
  as('Owner', () => { must(startConnection(PAYROLL_COMPANY_ID), 'start'); answerOtherEntities(false) })
  seedSettings()
  takeSnapshot('Payroll setup: pay items, payable accounts and dimensions')
  // June arrives before the start month is set; the Owner confirms the source and starts booking from July.
  setClock('2026-06-22T03:00:00Z')
  simulateSend('regular', { start: '2026-05-21', end: '2026-06-20', sentAt: '2026-06-22T03:00:00Z' })
  as('Owner', () => must(confirmSource(), 'confirm source'))
  payroll.settings.cutover = { firstLive: '2026-07', proposedBy: payrollPerson('Owner').person, confirmedBy: payrollPerson('Owner').person, mode: 'Block' }
  for (const r of payroll.runs) r.mode = runMode(r.month)
  takeSnapshot('Start booking from Jul 2026')
  // July and August: posted, then paid through bank reconciliation matches; e-Bupot filed.
  monthCycle('2026-06-21', '2026-07-20', '2026-07-22T03:00:00Z', { pay: '2026-07-24', kes: '2026-08-07', tk: '2026-08-12', tax: '2026-08-13' })
  monthCycle('2026-07-21', '2026-08-20', '2026-08-21T03:00:00Z', { pay: '2026-08-25', kes: '2026-09-08', tk: '2026-09-14', tax: '2026-09-14' })
  setClock('2026-09-10T03:00:00Z')
  as('Owner', () => must(lockPeriod('2026-07'), 'lock Jul'))
  // September: arrives with a new pay item and holds. HR settled three people changes in
  // Talenta (EMP-0038 left, EMP-0035 moved to Sales Surabaya, EMP-0041 joined Sales Bandung);
  // the send carries them and the draft review shows them against August.
  setClock('2026-09-21T03:00:00Z')
  simulateSend('new-pay-item', { start: '2026-08-21', end: '2026-09-20', sentAt: '2026-09-21T03:00:00Z', newAllowance: { name: 'Insentif Penjualan', organization: 'Sales', amount: 1_500_000 } })
  setClock('2026-10-05T02:00:00Z')
  payroll.viewAs = 'Accountant'
  seeding = false
}
function monthCycle(start: string, end: string, sentAt: string, d: { pay: string; kes: string; tk: string; tax: string }) {
  setClock(sentAt)
  const r = simulateSend('regular', { start, end, sentAt })
  const run = runById(r.runId)!
  as('Accountant', () => {
    for (const w of runWarnings(run.id)) acknowledgeWarning(run.id, w.key, 'Checked with HR')
    must(postRun(run.id), `post ${start}`)
  })
  const month = run.month
  const pay = (kind: BankPaymentKind, date: string, o: BankPaymentOptions = {}) => { setClock(`${date}T03:00:00Z`); as('Accountant', () => must(simulateBankPayment(kind, { date, ...o }), `${kind} ${month}`)) }
  pay('salary', d.pay, { runId: run.id })
  pay('bpjs-kesehatan', d.kes, { month })
  pay('bpjs-ketenagakerjaan', d.tk, { month })
  pay('pph21', d.tax, { month })
  pay('pph26', d.tax, { month })
  pay('dplk', d.tax, { month })
  as('Accountant', () => must(setEbupotFiled(month, pph21Month(month).books), `e-Bupot ${month}`))
}

export function resetPayroll(): void { seed(); saveSnapshot(SNAPSHOT_KEY, [payroll]); syncApprovalTasks() }

// Load: a saved snapshot wins over the sample. A fresh sample is saved at once so ids stay stable across reloads.
const snap = loadSnapshot<PayrollState>(SNAPSHOT_KEY)
if (snap && snap[0] && snap[0].settings?.dimensionLinks) { Object.assign(payroll, snap[0]); syncApprovalTasks() }
else resetPayroll()

watch(payroll, () => saveSnapshot(SNAPSHOT_KEY, [payroll]), { deep: true })
