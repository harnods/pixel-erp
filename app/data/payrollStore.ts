/**
 * Payroll to Ledger (Jurnal x Talenta): ONE reactive state and every rule.
 *
 * Talenta sends facts; Jurnal decides the accounting (LR-1). Every figure is
 * computed on read from the stored sends, the settings and the posted journals.
 * Nothing seeds a total. Persists under `erp-db:payroll:state-v1`;
 * resetPayroll() returns to the sample. No employee names anywhere (LR-7).
 *
 * ─── API (UI agents: this block is the contract) ─────────────────────────────
 * State and roles
 *   payroll                         reactive state (runs, journals, settings, log, ...). Read it, never write it.
 *   can(action)                     true when the View as role may take the action (hide the control when false).
 *   setPayrollViewAs(role)          switch the acting role. actingPerson() returns the name for records.
 *   resetPayroll()                  rebuild the sample through the engine (simulated sends, posts, payments).
 *   today()                         the sample clock's date ("2026-10-05" at seed). nowWib() for display.
 *   rupiah(n), wib(iso), dateLabel(d), monthLabel('2026-09'), periodLabel(start, end)   formatters for copy.
 *   accountName(code), accountLabel(code), payrollAccount(code)   account lookups (PAYROLL_ACCOUNTS + state).
 *
 * Connection (TS-01)
 *   connection                      computed: status, companyId, last accepted send, rejected sends, other-entity groups.
 *   startConnection(companyId) / endConnection(reason) / restartConnection(companyId)   Jurnal Owner only.
 *   confirmSource()                 Jurnal Owner confirms the first send's source; holds clear, drafts build.
 *   sourceSummary(runId)            organizations, branches, headcount, take-home total of a run's current send.
 *   answerOtherEntities(yes)        Jurnal Owner answers "Does this Talenta company hold staff of other legal entities?"
 *   markOtherEntity(field, value, on)   Accountant marks an organization/branch as Other entity (left out of journals).
 *
 * Settings, versioned (LR-9, TS-02..04, OD-05, OD-06, OD-08, OD-11, OD-24)
 *   settings                        computed: the current settings. snapshotById(id), currentSnapshotId().
 *   payItemKey(name, section)       match key: trimmed, case ignored, plus section.
 *   mappingFor(name, section)       the mapping row or undefined.
 *   suggestRole(name, section)      role suggestion from name and section (null = "No suggestion").
 *   suggestMapping(name, section)   role, debit, credit, party, programme for a standard item, or null.
 *   validateMapping(row)            { blocks: string[], overridable: string[] } guardrails.
 *   setPayItemMapping(key, patch, overrideReason?)   save one row; blocks return ok:false; overridable breaches need a 20-500 char reason.
 *   addPayItem(name, section)       add a row before Talenta sends the item.
 *   confirmAllSuggestions()         accept suggestions; skips Loan, Reimbursement, THR, Severance, Advance offset, Tax.
 *   replaceAccount(from, to)        replace an account across every mapping row.
 *   setPayableParty(code, party)    one party label per payable; blocked when it would put two statutory parties on one payable.
 *   mapGroup(dimension, value, tag, { fromHold })   organization/branch to tag (fallback tag refused from the hold screen).
 *   createPayrollTag(dimension, name)
 *   saveRule(rule) / deleteRule(id) / moveRule(id, -1|1)   allocation rules: up to 5 AND conditions, roles, account and/or tags.
 *   sendToFallback(field, value, reason)   one-time logged confirmation per value.
 *   setFieldPolicy(field, 'hold'|'skip')   Finance Manager.
 *   setCostCenterCategory(name, 'Direct'|'In-direct'), acceptFieldValue(field, value)
 *   setTaxPreset(key, code)         PPh 26 may not share an account with PPh 21 or PPh 21 DTP.
 *   proposeCutover(month) (Accountant) / confirmCutover() (Finance Manager) / setCutoverMode('Block'|'Flag') (Finance Manager)
 *   setLimits(patch), setPayday(day), setAccrualSettings({ account, cutoffDay }) (Finance Manager), setSuspenseAccount(code)
 *
 * Intake (OD-01, LR-3)
 *   simulateSend(kind, opts?)       kinds: 'regular' | 'new-pay-item' | 'revision' | 'partial' | 'separate-run' | 'duplicate'
 *                                   | 'transfer' | 'resignation' | 'created' | 'deleted' | 'old-sync'. Returns { ok, status, message, runId? }.
 *   receiveSalaryDetail(payload)    the webhook entry point simulateSend uses.
 *   receiveEmployeeEvent(event)     employee transfer / resignation / created / deleted.
 *   oldSyncExpense({ date, amount, pattern })   old-sync Expense call checked against the cut-over (LR-14).
 *   runs (computed, newest period first), runById(id), runStatus(run), runHolds(run), currentVersionOf(run), versionLabel(run, v)
 *   chooseRevision(runId, no) / chooseSeparateRun(runId, no, { type, name, reason })
 *   decidePartial(runId, no, 'replace'|'reject', reason?)
 *   releaseRun(runId)               re-check the whole run after fixes.
 *   releaseWithGap(runId, { reason, attachment, target })   Finance Manager; target 'suspense' or a payable code.
 *   releaseTaxHold(runId, reason)   Tax Staff or Finance Manager.
 *   markDryRunPassed(runId) / signOffDryRun(runId)
 *
 * Checks (LR-5): source confirm, revision choice, partial, duplicate employee, unmapped items/groups/fields,
 *   total check (sum of absolute per-employee gaps per section), then at build: Hutang Gaji = take-home pay,
 *   two parties on one payable, rounding residue, tax rule (LR-10). totalGaps(runId, no?) exposes the check.
 *
 * Draft (TS-05, OD-12)
 *   draftOf(run), isDraftStale(runId), rebuildDraft(runId) -> { changed }
 *   draftReview(runId)              { payItems, talentaTotals, changes, headcount, lines, otherEntity }
 *   whyLine(runId, lineIndex)       reasons and sources behind one draft line.
 *   addChangeNote(runId, key, note) note on a large-change row (<= 500 chars).
 *   claimsSummary(runId)            Reimbursement lines by item and tag (OD-26).
 *
 * Post, reverse, revise (TS-05, TS-07, OD-14..17, LR-4, LR-8)
 *   confirmPostAsFinanceManager(runId)   the MLP stopgap confirm when overrides or changed settings exist.
 *   postRun(runId, { versionNo? })  all-or-nothing post; stale, newer-version, revised and dry-run blocks; locked month redirect.
 *   reverseRun(runId, { date?, confirmPayments? })   reverses every live journal of the run together.
 *   reverseJournal(journalId, opts) same, starting from one journal (accrual journals fill their reversal slot).
 *   compareVersions(runId, a?, b?)  { byPayItem, byAccountTag, settingsMoved, headcount, oldLabel, newLabel }
 *   reverseAndRepost(runId, no?) / postDifference(runId, no?, { includeSettingsMoves })
 *   liveJournals(runId), journalsOf(runId), journalById(id), journalTotals(j)
 *   dismissWarning(runId, warningId, reason, pick)
 *   lockPeriod(month, { confirm }) / unlockPeriod(month) / isLocked(month) / firstOpenAfter(month)
 *   amendmentTasks (computed), closeAmendmentTask(id, outcome, { pembetulanNo, newTotal, reason })
 *
 * Payables (FG-5)
 *   payablesTracker(month?)         rows per payable per period: owed, paid, balance, due, overdue / paid late.
 *   recordSalaryPayment(runId, { bank, date, amount?, splits? })   Dr Hutang Gaji, Cr bank; bank-differs flag.
 *   payStatutory({ party, bank, date, periods: [{ month, amount?, billingCode?, ntpn? }], differenceAccount? })
 *   voidPayment(paymentId), paymentsFor(runId)
 *   bpjsProgrammeOf(item), setBpjsProgramme(key, programme), bpjsPayroll(month, body),
 *   saveBpjsInvoice(month, body, lines), bpjsComparison(month, body), markBpjsReviewed(month, body, notes)
 *
 * Reconciliation (FG-6)
 *   reconciliation(month)           rows by account+tag and by pay item, payables, reconciling items, status.
 *   independentChecks(month)        the five checks from raw totals and bank.
 *   setVarianceNote(month, rowKey, { reason, note }), setCheckNote(month, checkId, note)
 *   markReadyForSignOff(month) (Accountant) / signOffMonth(month, { hrConfirmed }) (Finance Manager)
 *   pph21Monthly(month), pph21Annual(year), setEbupotTotal(month, amount), markPph21Reconciled(month, note?)
 *
 * Accrual (FG-7)
 *   accrualEstimate(month)          { state, lines, base, days, baseDays, message }
 *   editAccrualLine(month, key, amount, reason) / resetAccrualLine(month, key)
 *   postAccrual(month), accrualFor(month)
 *
 * Log and notices (TS-06)
 *   syncLog (computed, newest first), noticesFor(role)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { reactive, watch, computed } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import {
  PAYROLL_COMPANY_ID, PAYROLL_TODAY, PAYROLL_ACCOUNTS, PAYROLL_PEOPLE, ACC, FALLBACK_TAG, PAYROLL_TAGS,
  STATUTORY_PARTIES, COST_CENTERS, TAX_FIELDS, sampleRoster, buildSalaryDetail, payrollPerson,
  type PayrollRole, type PayrollAccount, type PayableParty, type PaySection, type TalentaPayload, type TalentaEmployee,
  type TalentaField, type GroupingField, type TagDimension, type PayrollTag, type RosterEmployee, type GroupFields,
  type PayloadOptions, type EmployeeEventType, type TaxField,
} from './payrollMaster'

// ── Types ───────────────────────────────────────────────────────────────────

export type PayRole =
  | 'Earning' | 'Employee deduction' | 'Employer contribution' | 'Tax' | 'Loan'
  | 'Reimbursement' | 'THR' | 'Severance' | 'Advance offset'
export const PAY_ROLES: PayRole[] = ['Earning', 'Employee deduction', 'Employer contribution', 'Tax', 'Loan', 'Reimbursement', 'THR', 'Severance', 'Advance offset']
/** Roles whose debit is the cost side an allocation rule may move. */
const COST_ROLES: PayRole[] = ['Earning', 'Employer contribution', 'Reimbursement', 'THR', 'Severance']
export type BpjsProgramme = 'Kesehatan' | 'JHT' | 'JKK' | 'JKM' | 'JP'
export type BpjsBody = 'BPJS Kesehatan' | 'BPJS Ketenagakerjaan'

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
  /** THR / Severance: "Do you accrue this?" */
  accrue: boolean | null
  addedBy: 'Talenta' | 'Jurnal'
}
export interface Tags { Organization: string | null; Branch: string | null }
export const NO_TAGS: Tags = { Organization: null, Branch: null }
export interface RuleCondition { field: TalentaField; op: 'is' | 'is not'; values: string[] }
export interface AllocationRule {
  id: string
  name: string
  conditions: RuleCondition[]
  roles: PayRole[]
  account: string | null
  tags: Partial<Tags> | null
  active: boolean
}
export interface FallbackConfirm { field: string; value: string; reason: string; by: string; at: string }
export interface TaxPresets { pph21: string; dtp: string; pph26: string; resign: string; trueUp: string }
export interface Limits {
  partialStaffPct: number; partialWholeGroup: boolean; partialThpPct: number
  gapTolerance: number; roundingTolerance: number; largeChangePct: number; largeChangeAmount: number
}
export interface PayrollSettings {
  mapping: PayItemMapping[]
  groupMaps: Record<TagDimension, Record<string, string>>
  rules: AllocationRule[]
  fallback: FallbackConfirm[]
  fieldPolicies: Record<GroupingField, 'hold' | 'skip'>
  knownValues: Record<string, string[]>
  costCenterCategory: Record<string, 'Direct' | 'In-direct'>
  taxPresets: TaxPresets
  cutover: { firstLive: string | null; proposedBy: string | null; confirmedBy: string | null; mode: 'Block' | 'Flag' }
  limits: Limits
  deductionsBasis: 'with-employer' | 'without-employer'
  roundingAccount: string
  suspenseAccount: string | null
  hutangGaji: string
  payday: number
  accrual: { account: string; cutoffDay: number | null }
  otherEntity: { field: 'organization_name' | 'branch_name'; value: string }[]
}
export interface SettingsSnapshot { id: string; at: string; by: string; note: string; settings: PayrollSettings }

export type HoldCode =
  | 'confirm-source' | 'choice' | 'partial' | 'duplicate-employee' | 'unmapped-item' | 'unmapped-group'
  | 'new-field-value' | 'empty-field' | 'total-gap' | 'hutang-gaji' | 'two-parties' | 'rounding'
  | 'tax-rule' | 'negative-payable' | 'archived-account'
export interface Hold { code: HoldCode; message: string; details: Record<string, unknown> }

export interface LineSource { item: string; section: PaySection | 'preset' | 'gap' | 'rounding' | 'accrual'; role: PayRole | null; side: 'D' | 'C'; cents: number; staff: string[] }
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
  fmConfirmedBy: string | null
  nothingToPost: boolean
  otherEntity: { staff: number; amount: number }
}
export type VersionState = 'active' | 'replaced' | 'superseded' | 'waiting-choice' | 'partial' | 'rejected' | 'moved'
export interface GapRelease { target: string; reason: string; attachment: string; by: string; at: string; gaps: { employee_id: string; section: PaySection; cents: number }[] }
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
  draft: Draft | null
  gapRelease: GapRelease | null
  taxRelease: { reason: string; by: string; at: string } | null
  decision: { kind: string; reason: string | null; by: string; at: string } | null
  changeNotes: Record<string, string>
}
export type RunKind = 'Regular' | 'THR' | 'Bonus' | 'Off-cycle'
export interface EarlyWarning { id: string; eventId: string; type: EmployeeEventType; employee_id: string; effective: string; from: GroupFields | null; to: GroupFields | null; text: string; dismissed: { reason: string; pick: string; by: string; at: string } | null }
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
  warnings: EarlyWarning[]
  revised: boolean
  reversedAt: string | null
}
export type JournalType = 'Payroll' | 'Reversal' | 'Difference' | 'Payroll accrual' | 'Accrual reversal' | 'Salary payment' | 'Statutory payment' | 'Payment void'
export interface Journal {
  id: string
  number: string
  type: JournalType
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
  fmConfirmedBy: string | null
  accrualId: string | null
  paymentId: string | null
}
export interface PaymentPeriodLine { month: string; amount: number; billingCode: string | null; ntpn: string | null }
export interface Payment {
  id: string
  kind: 'Salary' | 'Statutory'
  party: PayableParty
  account: string
  runId: string | null
  bank: string
  date: string
  periods: PaymentPeriodLine[]
  splits: { branch: string; bank: string; amount: number }[]
  amount: number
  journalId: string
  bankDiffers: number
  warnings: string[]
  voidedBy: string | null
}
export interface PayrollEvent { id: string; type: EmployeeEventType; employee_id: string; effective: string | null; from: GroupFields | null; to: GroupFields | null; receivedAt: string }
export interface Accrual {
  id: string
  month: string
  journalId: string
  baseRunId: string
  nextRunStart: string
  nextRunKey: string
  reversalJournalId: string | null
  reversedBy: 'run' | 'manual' | null
  log: string[]
}
export interface AmendmentTask {
  id: string
  taxMonth: string
  runId: string
  fromVersion: number
  toVersion: number
  employees: { employee_id: string; changes: Partial<Record<TaxField, number>> }[]
  periodChange: number
  noLedgerChange: boolean
  status: 'Open' | 'Amended' | 'Not filed yet' | 'Dismissed'
  pembetulanNo: string | null
  newTotal: number | null
  reason: string | null
  openedAt: string
  closedBy: string | null
}
export interface BpjsInvoice { month: string; body: BpjsBody; lines: { programme: BpjsProgramme; amount: number; headcount: number }[]; reviewed: { by: string; at: string } | null; notes: Partial<Record<BpjsProgramme, string>>; reviewedFingerprint: string | null }
export interface MonthRecon {
  month: string
  notes: Record<string, { reason: string; note: string; by: string; at: string }>
  checkNotes: Record<string, { note: string; by: string; at: string }>
  readyBy: string | null
  signOff: { by: string; at: string; hrConfirmedBy: string; fingerprint: string; snapshot: unknown } | null
  ebupotFiled: number | null
  pph21Note: string | null
  pph21Reconciled: { by: string; at: string } | null
}
export type LogStatus = 'Received' | 'Waiting for your choice' | 'Held' | 'Posted' | 'Failed' | 'Reversed' | 'Blocked' | 'No change' | 'Recorded'
export interface SyncLogEntry {
  id: number
  at: string
  type: 'Send' | 'Hold' | 'Post' | 'Reversal' | 'Old sync' | 'Employee event' | 'Decision' | 'Payment' | 'Settings' | 'Connection'
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
export interface OldSyncCall { id: string; date: string; amount: number; pattern: 'Payroll' | 'Claim'; outcome: 'Blocked' | 'Passed' | 'Flagged'; message: string; at: string }
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
  events: PayrollEvent[]
  accruals: Accrual[]
  accrualEdits: Record<string, Record<string, { amount: number; reason: string }>>
  tasks: AmendmentTask[]
  bpjsInvoices: BpjsInvoice[]
  recon: MonthRecon[]
  lockedMonths: string[]
  knownGaps: { id: string; employee_id: string; section: PaySection; cents: number; target: string; releasedOn: string; runsSeen: number; releases: number }[]
  log: SyncLogEntry[]
  notices: PayrollNotice[]
  oldSync: OldSyncCall[]
  /** Options of the last simulated send per run key, so a revision or partial re-send starts from the same facts. */
  simOptions: Record<string, Partial<PayloadOptions>>
  payNo: number
  bnkNo: number
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
const cents = (x: number) => Math.round(x * 100)
/** Whole rupiah from cents, half up. */
function roundCents(c: number): number { return c >= 0 ? Math.floor((c + 50) / 100) : -Math.floor((-c + 50) / 100) }
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()
function hash(s: string): string { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(16) }
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T
const tagsKey = (t: Tags) => `${t.Organization ?? ''}|${t.Branch ?? ''}`
/** "A", "A and B", "A, B and C". */
export function listLabel(items: string[]): string { return items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` }
export function tagsLabel(t: Tags): string { return [t.Organization, t.Branch].filter(Boolean).join(', ') }

// ── State ───────────────────────────────────────────────────────────────────

const SNAPSHOT_KEY = 'payroll:state-v1'

function defaultSettings(): PayrollSettings {
  return {
    mapping: [],
    groupMaps: { Organization: {}, Branch: {} },
    rules: [],
    fallback: [],
    fieldPolicies: { organization_name: 'hold', branch_name: 'hold', cost_center_name: 'hold' },
    knownValues: {},
    costCenterCategory: {},
    taxPresets: { pph21: ACC.pph21, dtp: ACC.dtp, pph26: ACC.pph26, resign: ACC.pph21Final, trueUp: ACC.pph21 },
    cutover: { firstLive: null, proposedBy: null, confirmedBy: null, mode: 'Block' },
    limits: { partialStaffPct: 10, partialWholeGroup: true, partialThpPct: 20, gapTolerance: 1_000, roundingTolerance: 1_000, largeChangePct: 10, largeChangeAmount: 1_000_000 },
    deductionsBasis: 'with-employer',
    roundingAccount: ACC.rounding,
    suspenseAccount: ACC.suspense,
    hutangGaji: ACC.hutangGaji,
    payday: 25,
    accrual: { account: ACC.accrued, cutoffDay: null },
    otherEntity: [],
  }
}

function emptyState(): PayrollState {
  return {
    seq: 1, clock: '2026-10-05T02:00:00.000Z', viewAs: 'Accountant',
    connection: { status: 'Not connected', companyId: null, startedBy: null, startedAt: null, endedReason: null, sourceConfirmedBy: null, sourceConfirmedAt: null, otherEntitiesAnswer: null, lastAcceptedAt: null, rejected: [] },
    accounts: clone(PAYROLL_ACCOUNTS), tags: clone(PAYROLL_TAGS),
    settings: defaultSettings(), snapshots: [], roster: [], runs: [], journals: [], payments: [], events: [],
    accruals: [], accrualEdits: {}, tasks: [], bpjsInvoices: [], recon: [], lockedMonths: [], knownGaps: [],
    log: [], notices: [], oldSync: [], simOptions: {}, payNo: 0, bnkNo: 0,
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

export type PayrollAction =
  | 'connection.view' | 'connection.manage' | 'source.confirm' | 'otherEntity.answer' | 'otherEntity.mark'
  | 'settings.edit' | 'settings.override' | 'fieldPolicy.edit' | 'presets.edit' | 'limits.edit' | 'claims.edit'
  | 'dryrun.pass' | 'dryrun.signoff' | 'cutover.propose' | 'cutover.confirm'
  | 'run.choose' | 'run.partial' | 'run.release' | 'gap.release' | 'tax.release' | 'draft.note'
  | 'post' | 'post.confirm' | 'reverse' | 'fix' | 'warning.dismiss' | 'period.lock' | 'task.close'
  | 'payment.salary' | 'payment.statutory' | 'payment.void' | 'bpjs.programme' | 'bpjs.invoice' | 'bpjs.review'
  | 'recon.note' | 'recon.ready' | 'recon.signoff' | 'ebupot.enter' | 'pph21.reconcile'
  | 'accrual.edit' | 'accrual.post' | 'accrual.settings' | 'payByEmployee.view' | 'log.export' | 'report.export'

const O: PayrollRole = 'Jurnal Owner', A: PayrollRole = 'Accountant', F: PayrollRole = 'Finance Manager', T: PayrollRole = 'Tax Staff', U: PayrollRole = 'Auditor'
const ACCESS: Record<PayrollAction, PayrollRole[]> = {
  'connection.view': [O, A, F, U], 'connection.manage': [O], 'source.confirm': [O], 'otherEntity.answer': [O], 'otherEntity.mark': [A],
  'settings.edit': [A], 'settings.override': [A], 'fieldPolicy.edit': [F], 'presets.edit': [A, F], 'limits.edit': [A], 'claims.edit': [A, F],
  'dryrun.pass': [A], 'dryrun.signoff': [F], 'cutover.propose': [A], 'cutover.confirm': [F],
  'run.choose': [A], 'run.partial': [A], 'run.release': [A, F], 'gap.release': [F, O], 'tax.release': [T, F], 'draft.note': [A],
  'post': [A], 'post.confirm': [F], 'reverse': [A, F], 'fix': [A, F], 'warning.dismiss': [A], 'period.lock': [F], 'task.close': [T],
  'payment.salary': [A], 'payment.statutory': [A, T], 'payment.void': [A], 'bpjs.programme': [A], 'bpjs.invoice': [A, T], 'bpjs.review': [A],
  'recon.note': [A], 'recon.ready': [A], 'recon.signoff': [F], 'ebupot.enter': [T, F], 'pph21.reconcile': [T, F],
  'accrual.edit': [A], 'accrual.post': [A], 'accrual.settings': [F], 'payByEmployee.view': [A], 'log.export': [A, U], 'report.export': [O, A, F, T, U],
}
export function can(action: PayrollAction, role: PayrollRole = payroll.viewAs): boolean { return ACCESS[action].includes(role) }
export function setPayrollViewAs(role: PayrollRole): void { payroll.viewAs = role }
export function actingPerson(): string { return payrollPerson(payroll.viewAs).person }
export { PAYROLL_PEOPLE }

export interface Result { ok: boolean; message?: string; [k: string]: unknown }
const denied = (): Result => ({ ok: false, message: 'Your role cannot do this.', status: 403 })

// ── Accounts and tags ───────────────────────────────────────────────────────

export function payrollAccount(code: string | null): PayrollAccount | undefined { return code ? payroll.accounts.find((a) => a.code === code) : undefined }
export function accountName(code: string | null): string { return payrollAccount(code)?.name ?? code ?? '' }
export function accountLabel(code: string | null): string { return code ? `${code} ${accountName(code)}` : '' }
const isCost = (code: string | null) => { const t = payrollAccount(code)?.type; return t === 'expense' || t === 'cogs' }
const isLiability = (code: string | null) => payrollAccount(code)?.type === 'liability'
const partyOf = (code: string | null): PayableParty | null => payrollAccount(code)?.party ?? null
/** Accounts whose debit and credit show as separate lines (PPh 21 DTP, FG6-AC9). */
const grossBoth = (code: string) => code === payroll.settings.taxPresets.dtp
export function createPayrollTag(dimension: TagDimension, name: string): Result {
  if (!can('settings.edit')) return denied()
  if (!name.trim()) return { ok: false, message: 'Enter a tag name.' }
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

export function setPayItemMapping(key: string, patch: Partial<Pick<PayItemMapping, 'role' | 'debit' | 'credit' | 'party' | 'programme' | 'accrue'>>, overrideReason?: string): Result {
  if (!can('settings.edit')) return denied()
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
  if ((next.role === 'THR' || next.role === 'Severance') && patch.accrue === true && !isLiability(next.debit))
    return { ok: false, message: 'An accrued item must debit a liability account.' }
  Object.assign(row, next, { roleConfirmed: !!next.role })
  changed(`Pay item ${row.name} (${row.section}) mapped: Dr ${accountLabel(row.debit)}, Cr ${accountLabel(row.credit)}, role ${row.role}`)
  return { ok: true }
}

function newMappingRow(name: string, section: PaySection, addedBy: 'Talenta' | 'Jurnal'): PayItemMapping {
  return { key: payItemKey(name, section), name: name.trim(), section, role: null, roleConfirmed: false, debit: null, credit: null, party: partyFromName(name), programme: programmeFromName(name), override: null, accrue: null, addedBy }
}
export function addPayItem(name: string, section: PaySection): Result {
  if (!can('settings.edit')) return denied()
  if (!name.trim()) return { ok: false, message: 'Enter the pay item name as Talenta shows it.' }
  if (mappingFor(name, section)) return { ok: false, message: 'This pay item is already on the list.' }
  payroll.settings.mapping.push(newMappingRow(name, section, 'Jurnal'))
  changed(`Pay item ${name.trim()} (${section}) added`)
  return { ok: true, key: payItemKey(name, section) }
}
/** Accept suggestions for unmapped rows. Skips the roles a person must decide (OD-05). */
export function confirmAllSuggestions(): Result {
  if (!can('settings.edit')) return denied()
  const SKIP: PayRole[] = ['Loan', 'Reimbursement', 'THR', 'Severance', 'Advance offset', 'Tax']
  let mapped = 0, skipped = 0
  for (const row of payroll.settings.mapping) {
    if (row.roleConfirmed && row.debit && row.credit) continue
    const s = suggestMapping(row.name, row.section)
    if (!s || !s.role || SKIP.includes(s.role) || !s.debit || !s.credit) { skipped++; continue }
    if (validateMapping({ ...row, ...s }).blocks.length) { skipped++; continue }
    Object.assign(row, s, { roleConfirmed: true }); mapped++
  }
  if (mapped) changed(`Suggestions accepted: ${mapped} pay items`)
  return { ok: true, mapped, skipped }
}
export function replaceAccount(from: string, to: string): Result {
  if (!can('settings.edit')) return denied()
  const rows = payroll.settings.mapping.filter((m) => m.debit === from || m.credit === from)
  for (const r of rows) {
    const next = { ...r, debit: r.debit === from ? to : r.debit, credit: r.credit === from ? to : r.credit }
    const v = validateMapping(next)
    if (v.blocks.length) return { ok: false, message: `${r.name}: ${v.blocks[0]}` }
  }
  for (const r of rows) { if (r.debit === from) r.debit = to; if (r.credit === from) r.credit = to }
  if (rows.length) changed(`Account ${accountLabel(from)} replaced by ${accountLabel(to)} on ${rows.length} rows`)
  return { ok: true, rows: rows.length }
}
export function setPayableParty(code: string, party: PayableParty | null): Result {
  if (!can('settings.edit')) return denied()
  const a = payrollAccount(code)
  if (!a) return { ok: false, message: 'Account not found.' }
  if (party && STATUTORY_PARTIES.includes(party)) {
    const other = payroll.settings.mapping.find((m) => m.credit === code && m.party && STATUTORY_PARTIES.includes(m.party) && m.party !== party)
    if (other) return { ok: false, message: `${other.name} credits this payable and is owed to ${other.party}. Two statutory parties cannot share one payable.` }
  }
  a.party = party
  changed(`Payable ${accountLabel(code)} labelled ${party ?? 'none'}`)
  return { ok: true }
}

export function mapGroup(dimension: TagDimension, value: string, tag: string, opts: { fromHold?: boolean } = {}): Result {
  if (!can('settings.edit') && !(opts.fromHold && can('run.release'))) return denied()
  if (opts.fromHold && tag === FALLBACK_TAG) return { ok: false, message: 'Pick a real tag. A new group cannot go to the fallback tag from here.' }
  if (!payroll.tags.some((t) => t.dimension === dimension && t.name === tag)) return { ok: false, message: 'Pick a tag from this dimension or create it first.' }
  payroll.settings.groupMaps[dimension][value] = tag
  changed(`${dimension} ${value} mapped to tag ${tag}`)
  return { ok: true }
}
export function saveRule(rule: Omit<AllocationRule, 'id'> & { id?: string }): Result {
  if (!can('settings.edit')) return denied()
  if (!rule.name.trim()) return { ok: false, message: 'Name the rule.' }
  if (!rule.conditions.length || rule.conditions.length > 5) return { ok: false, message: 'A rule tests 1 to 5 fields.' }
  if (!rule.account && !rule.tags) return { ok: false, message: 'A rule sets an account, tags or both.' }
  if (rule.account && !isCost(rule.account)) return { ok: false, message: 'A rule account must be an expense or cost of goods sold account.' }
  const roles = rule.roles.length ? rule.roles : ['Earning', 'Employer contribution'] as PayRole[]
  if (rule.id) {
    const r = payroll.settings.rules.find((x) => x.id === rule.id)
    if (!r) return { ok: false, message: 'Rule not found.' }
    Object.assign(r, { ...rule, roles })
  } else payroll.settings.rules.push({ ...rule, roles, id: nextId('rule') })
  changed(`Allocation rule ${rule.name} saved`)
  return { ok: true }
}
export function deleteRule(id: string): Result {
  if (!can('settings.edit')) return denied()
  const i = payroll.settings.rules.findIndex((r) => r.id === id)
  if (i < 0) return { ok: false }
  const [r] = payroll.settings.rules.splice(i, 1)
  changed(`Allocation rule ${r!.name} deleted`)
  return { ok: true }
}
export function moveRule(id: string, dir: -1 | 1): Result {
  if (!can('settings.edit')) return denied()
  const list = payroll.settings.rules
  const i = list.findIndex((r) => r.id === id), j = i + dir
  if (i < 0 || j < 0 || j >= list.length) return { ok: false }
  ;[list[i], list[j]] = [list[j]!, list[i]!]
  changed(`Allocation rule ${list[j]!.name} moved`)
  return { ok: true }
}
export function sendToFallback(field: string, value: string, reason: string): Result {
  if (!can('settings.edit')) return denied()
  if (reason.trim().length < 10) return { ok: false, message: 'Say why this value goes to the fallback tag (10 characters or more).' }
  if (!payroll.settings.fallback.some((f) => f.field === field && f.value === value))
    payroll.settings.fallback.push({ field, value, reason: reason.trim(), by: actingPerson(), at: now() })
  changed(`${value} (${field}) confirmed to fallback`)
  return { ok: true }
}
export function setFieldPolicy(field: GroupingField, policy: 'hold' | 'skip'): Result {
  if (!can('fieldPolicy.edit')) return denied()
  payroll.settings.fieldPolicies[field] = policy
  changed(`Empty ${field} policy set to ${policy}`)
  return { ok: true }
}
export function setCostCenterCategory(name: string, cat: 'Direct' | 'In-direct'): Result {
  if (!can('settings.edit')) return denied()
  payroll.settings.costCenterCategory[name] = cat
  acceptValue('cost_center_name', name)
  changed(`Cost center ${name} set to ${cat}`)
  return { ok: true }
}
function acceptValue(field: string, value: string) {
  const list = (payroll.settings.knownValues[field] ??= [])
  if (!list.includes(value)) list.push(value)
}
export function acceptFieldValue(field: string, value: string): Result {
  if (!can('settings.edit') && !can('run.release')) return denied()
  acceptValue(field, value)
  changed(`New value ${value} accepted for ${field}`)
  return { ok: true }
}
export function setTaxPreset(key: keyof TaxPresets, code: string): Result {
  if (!can('presets.edit')) return denied()
  const p = { ...payroll.settings.taxPresets, [key]: code }
  if (p.pph26 === p.pph21 || p.pph26 === p.dtp) return { ok: false, message: 'PPh 26 cannot share an account with PPh 21 or PPh 21 DTP.' }
  if (!isLiability(code) && payrollAccount(code)?.type !== 'asset') return { ok: false, message: 'A tax preset posts to a liability or current asset account.' }
  if (payrollAccount(code)?.archived) return { ok: false, message: `${accountLabel(code)} is archived.` }
  payroll.settings.taxPresets = p
  changed(`Tax preset ${key} set to ${accountLabel(code)}`)
  return { ok: true }
}
export function proposeCutover(month: string): Result {
  if (!can('cutover.propose')) return denied()
  if (isLocked(month)) return { ok: false, message: 'The first live period must be open.' }
  const posted = payroll.journals.some((j) => j.type === 'Payroll' && !j.reversedById && j.taxMonth > month && j.taxMonth < (payroll.settings.cutover.firstLive ?? '0000'))
  if (posted) return { ok: false, message: 'A posted payroll journal sits in between. Reverse it first.' }
  payroll.settings.cutover = { ...payroll.settings.cutover, firstLive: month, proposedBy: actingPerson(), confirmedBy: null }
  changed(`First live period proposed: ${monthLabel(month)}`)
  return { ok: true }
}
export function confirmCutover(): Result {
  if (!can('cutover.confirm')) return denied()
  if (!payroll.settings.cutover.firstLive) return { ok: false, message: 'No first live period proposed.' }
  payroll.settings.cutover.confirmedBy = actingPerson()
  changed(`First live period confirmed: ${monthLabel(payroll.settings.cutover.firstLive)}`)
  for (const r of payroll.runs) r.mode = runMode(r.month)
  return { ok: true }
}
export function setCutoverMode(mode: 'Block' | 'Flag'): Result {
  if (!can('cutover.confirm')) return denied()
  payroll.settings.cutover.mode = mode
  changed(`Old sync control set to ${mode}`)
  return { ok: true }
}
export function setLimits(patch: Partial<Limits>): Result {
  if (!can('limits.edit')) return denied()
  Object.assign(payroll.settings.limits, patch)
  changed('Payroll limits changed')
  return { ok: true }
}
export function setPayday(day: number): Result {
  if (!can('settings.edit')) return denied()
  if (day < 1 || day > 31) return { ok: false, message: 'Pick a day from 1 to 31.' }
  payroll.settings.payday = day
  changed(`Payday set to ${day}`)
  return { ok: true }
}
export function setSuspenseAccount(code: string | null): Result {
  if (!can('settings.edit')) return denied()
  payroll.settings.suspenseAccount = code
  changed(`Payroll suspense account set to ${accountLabel(code)}`)
  return { ok: true }
}
export function setAccrualSettings(p: { account?: string; cutoffDay?: number | null }): Result {
  if (!can('accrual.settings')) return denied()
  if (p.account && !isLiability(p.account)) return { ok: false, message: 'Pick a current liability account.' }
  if (p.cutoffDay != null && (p.cutoffDay < 1 || p.cutoffDay > 28)) return { ok: false, message: 'Pick a cut-off day from 1 to 28.' }
  Object.assign(payroll.settings.accrual, p)
  changed('Accrual settings changed')
  return { ok: true }
}

// ── Connection (TS-01) ──────────────────────────────────────────────────────

export const connection = computed(() => ({
  ...payroll.connection,
  otherEntity: payroll.settings.otherEntity,
  sends: payroll.log.filter((l) => l.type === 'Send').length,
}))
export function startConnection(companyId: number): Result {
  if (!can('connection.manage')) return denied()
  if (payroll.connection.status === 'Connected' || payroll.connection.status === 'Waiting for first send') return { ok: false, message: 'A connection is already active.' }
  if (companyId !== PAYROLL_COMPANY_ID) return { ok: false, message: 'This Talenta company is linked elsewhere.' }
  Object.assign(payroll.connection, { status: 'Waiting for first send', companyId, startedBy: actingPerson(), startedAt: now(), endedReason: null, sourceConfirmedBy: null, sourceConfirmedAt: null })
  addLog({ type: 'Connection', status: 'Recorded', reason: `Connection to Talenta company ${companyId} started`, nextStep: 'HR turns on the salary detail webhook in Talenta.' })
  return { ok: true }
}
export function endConnection(reason: string): Result {
  if (!can('connection.manage')) return denied()
  if (reason.trim().length < 10 || reason.trim().length > 200) return { ok: false, message: 'Give a reason of 10 to 200 characters.' }
  payroll.connection.status = 'Ended'; payroll.connection.endedReason = reason.trim()
  addLog({ type: 'Connection', status: 'Recorded', reason: `Connection ended: ${reason.trim()}`, nextStep: 'Open drafts can still post.' })
  return { ok: true }
}
export function restartConnection(companyId: number): Result {
  if (!can('connection.manage')) return denied()
  if (payroll.connection.status !== 'Ended') return { ok: false, message: 'End the connection first.' }
  const warn = companyId !== payroll.connection.companyId ? 'Mappings came from the previous Talenta company.' : null
  Object.assign(payroll.connection, { status: 'Connected', companyId, endedReason: null })
  return { ok: true, warning: warn }
}
export function confirmSource(): Result {
  if (!can('source.confirm')) return denied()
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
  const emps = v.payload.employees
  return {
    organizations: [...new Set(emps.map((e) => e.organization_name))].sort(),
    branches: [...new Set(emps.map((e) => e.branch_name))].sort(),
    headcount: new Set(emps.map((e) => e.employee_id)).size,
    takeHome: roundCents(emps.reduce((s, e) => s + cents(e.take_home_pay), 0)),
  }
}
export function answerOtherEntities(yes: boolean): Result {
  if (!can('otherEntity.answer')) return denied()
  payroll.connection.otherEntitiesAnswer = yes
  return { ok: true }
}
export function markOtherEntity(field: 'organization_name' | 'branch_name', value: string, on: boolean): Result {
  if (!can('otherEntity.mark')) return denied()
  if (payroll.connection.otherEntitiesAnswer !== true) return { ok: false, message: 'The Jurnal Owner first confirms that this Talenta company holds other legal entities.' }
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
export function liveJournals(runId: string): Journal[] {
  return payroll.journals.filter((j) => j.runId === runId && (j.type === 'Payroll' || j.type === 'Difference') && !j.reversedById)
}
export function journalsOf(runId: string): Journal[] { return payroll.journals.filter((j) => j.runId === runId) }
export function journalById(id: string | null): Journal | undefined { return id ? payroll.journals.find((j) => j.id === id) : undefined }
export function journalTotals(j: Pick<Journal, 'lines'>) { return { debit: j.lines.reduce((s, l) => s + l.debit, 0), credit: j.lines.reduce((s, l) => s + l.credit, 0) } }

export type RunStatus = 'Confirm source' | 'Waiting for your choice' | 'Held' | 'Ready to post' | 'Posted' | 'Revised' | 'Reversed' | 'Dry run' | 'Before go-live' | 'Nothing to post' | 'Received'
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
  if (run.revised) return 'Revised'
  if (run.ledgerVersion != null && live) return holds.length ? 'Held' : 'Posted'
  if (holds.length) return 'Held'
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

function runKeyOf(p: TalentaPayload) { return `${p.company_id} / ${p.period.type} / ${p.period.start_date} / ${p.period.end_date}` }
function bodyHash(p: TalentaPayload) { return hash(JSON.stringify(p)) }
function figuresHash(p: TalentaPayload) { return hash(JSON.stringify({ ...p, sent_at: '' })) }
function staffOf(p: TalentaPayload): TalentaEmployee[] {
  const oe = payroll.settings.otherEntity
  return p.employees.filter((e) => !oe.some((x) => (e[x.field] ?? '') === x.value))
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
  if (!p.employees?.length) return fail('The send has no employees.')
  if (p.period.end_date < p.period.start_date) return fail('The period ends before it starts.')
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
      dryRun: null, warnings: [], revised: false, reversedAt: null,
    }
    run.versions.push(newVersion(1, p, 'active'))
    if (run.mode !== 'Live') run.dryRun = { passedBy: null, passedAt: null, signedOffBy: null, signedOffAt: null }
    payroll.runs.push(run)
    checkVersion(run, run.versions[0]!)
    return logReceipt(run, run.versions[0]!)
  }
  const accepted = regular.versions.filter((v) => v.state !== 'rejected')
  const last = accepted[accepted.length - 1]
  if (last && Date.parse(p.sent_at) < Date.parse(last.sentAt)) return fail(`Older than v${last.no}. Jurnal keeps v${last.no}.`, 409)
  if (last && figuresHash(p) === last.figuresHash) {
    addLog({ type: 'Send', status: 'No change', reason: `No change from v${last.no}`, nextStep: 'Nothing to do.', runId: regular.id, runKey: regular.key, version: last.no, employees: p.employees.length })
    return { ok: true, status: 'No change', message: `No change from v${last.no}`, runId: regular.id }
  }
  const no = regular.versions.length + 1
  regular.warnings = regular.warnings.filter((w) => w.dismissed)
  if (liveJournals(regular.id).length) {
    const v = newVersion(no, p, 'waiting-choice')
    regular.versions.push(v)
    checkVersion(regular, v)
    return logReceipt(regular, v)
  }
  const v = newVersion(no, p, 'active')
  regular.versions.push(v)
  const partial = partialCheck(regular, v)
  if (partial) { v.state = 'partial'; v.holds = [partial] } else activate(regular, v)
  return logReceipt(regular, v)
}

function newVersion(no: number, p: TalentaPayload, state: VersionState): RunVersion {
  return { no, sentAt: p.sent_at, receivedAt: payroll.clock, hash: bodyHash(p), figuresHash: figuresHash(p), payload: clone(p), state, replacedBy: null, holds: [], draft: null, gapRelease: null, taxRelease: null, decision: null, changeNotes: {} }
}
/** Make v the current version; older open versions become "Replaced by vN" (or "Superseded" on a posted run). */
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
  const reason = v.holds[0]?.message ?? (run.mode !== 'Live' ? `${run.mode}: nothing posts from this send.` : 'Draft built.')
  addLog({ type: 'Send', status, reason, nextStep: nextStepFor(v), runId: run.id, runKey: run.key, version: v.no, employees: v.payload.employees.length })
  if (v.holds.length && v.state !== 'waiting-choice') notify(['Accountant'], `Payroll ${periodLabel(run.start, run.end)} v${v.no} is held: ${v.holds[0]!.message}`, `/payroll-runs/${run.id}`)
  return { ok: true, status, message: reason, runId: run.id, versionNo: v.no }
}
function nextStepFor(v: RunVersion): string {
  const h = v.holds[0]
  if (!h) return v.draft ? 'Review the draft and post.' : 'Nothing to do.'
  const steps: Partial<Record<HoldCode, string>> = {
    'confirm-source': 'The Jurnal Owner confirms the source.', choice: 'Pick Revision of the posted run or Separate run.',
    partial: 'Pick Replace the full run or Reject.', 'unmapped-item': 'Map the pay item, then release the run.',
    'unmapped-group': 'Map the group to a tag, then release the run.', 'total-gap': 'Ask HR, or the Finance Manager releases with gap.',
    'tax-rule': 'Tax Staff or the Finance Manager releases with a reason.',
  }
  return steps[h.code] ?? 'Fix the issue, then release the run.'
}

/** TN-01: drops 10% or more of staff, a whole organization or branch, or 20% of take-home pay. */
function partialCheck(run: Run, v: RunVersion): Hold | null {
  const ref = versionOf(run, run.currentVersion) ?? versionOf(run, run.ledgerVersion)
  if (!ref || ref === v) return null
  const L = payroll.settings.limits
  const a = ref.payload.employees, b = v.payload.employees
  const ids = (l: TalentaEmployee[]) => new Set(l.map((e) => e.employee_id))
  const before = ids(a).size, after = ids(b).size
  const thpA = a.reduce((s, e) => s + e.take_home_pay, 0), thpB = b.reduce((s, e) => s + e.take_home_pay, 0)
  const missing: string[] = []
  if (L.partialWholeGroup) {
    for (const f of ['organization_name', 'branch_name'] as const) {
      const now = new Set(b.map((e) => e[f]))
      for (const g of new Set(a.map((e) => e[f]))) if (!now.has(g)) missing.push(g)
    }
  }
  const staffDrop = before > 0 && (before - after) / before >= L.partialStaffPct / 100
  const thpDrop = thpA > 0 && (thpA - thpB) / thpA >= L.partialThpPct / 100
  if (!staffDrop && !thpDrop && !missing.length) return null
  return {
    code: 'partial',
    message: `Looks partial: ${after} of ${before} staff.${missing.length ? ` ${listLabel(missing)} missing.` : ''}`,
    details: { before, after, missing, thpBefore: Math.round(thpA), thpAfter: Math.round(thpB), versionNo: v.no },
  }
}

export function decidePartial(runId: string, no: number, decision: 'replace' | 'reject', reason?: string): Result {
  if (!can('run.partial')) return denied()
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
  if (run.ledgerVersion != null && liveJournals(run.id).length) { v.state = 'active'; run.currentVersion = v.no; markRevisedOrNoChange(run, v) }
  else activate(run, v)
  addLog({ type: 'Decision', status: 'Recorded', reason: `v${no} replaces the full run`, nextStep: nextStepFor(v), runId, runKey: run.key, version: no })
  return { ok: true }
}

/** Share of the posted run's staff in this send, and of those how many carry Earning items (TN-02). */
function overlap(run: Run, v: RunVersion) {
  const posted = versionOf(run, run.ledgerVersion)
  if (!posted) return { pct: 0, earningShare: 0 }
  const ids = new Set(posted.payload.employees.map((e) => e.employee_id))
  const match = v.payload.employees.filter((e) => ids.has(e.employee_id))
  const earning = match.filter((e) => e.allowances.some((a) => mappingFor(a.name, 'allowance')?.role === 'Earning'))
  return { pct: ids.size ? match.length / ids.size : 0, earningShare: match.length ? earning.length / match.length : 0 }
}
export function chooseRevision(runId: string, no: number): Result {
  if (!can('run.choose')) return denied()
  const run = runById(runId), v = run && versionOf(run, no)
  if (!run || !v || v.state !== 'waiting-choice') return { ok: false, message: 'Nothing to decide.' }
  now()
  v.decision = { kind: 'Revision of the posted run', reason: null, by: actingPerson(), at: payroll.clock }
  v.holds = []
  const partial = partialCheck(run, v)
  addLog({ type: 'Decision', status: 'Recorded', reason: `v${no} is a revision of the posted run`, nextStep: 'Compare and fix.', runId, runKey: run.key, version: no })
  if (partial) { v.state = 'partial'; v.holds = [partial]; return { ok: true, partial: true } }
  for (const o of run.versions) if (o.state === 'active' && o.no !== run.ledgerVersion && o !== v) { o.state = 'superseded'; o.replacedBy = no }
  v.state = 'active'
  run.currentVersion = no
  markRevisedOrNoChange(run, v)
  return { ok: true }
}
function markRevisedOrNoChange(run: Run, v: RunVersion) {
  checkVersion(run, v)
  const diff = differenceLines(run, v, false)
  const oldV = versionOf(run, run.ledgerVersion)!
  if (!diff.length) {
    const taxMoved = taxChanges(oldV.payload, v.payload)
    retireLedgerVersion(run, oldV, v)
    addLog({ type: 'Send', status: 'No change', reason: taxMoved.length ? 'Tax change, no ledger change' : 'No ledger change', nextStep: taxMoved.length ? 'Tax Staff amends e-Bupot 21/26.' : 'Nothing to do.', runId: run.id, runKey: run.key, version: v.no })
    if (taxMoved.length) openAmendmentTask(run, oldV, v, true)
    return
  }
  run.revised = true
  const thp = (p: TalentaPayload) => p.employees.reduce((s, e) => s + e.take_home_pay, 0)
  const pph = (p: TalentaPayload) => p.employees.reduce((s, e) => s + e['PPh 21 Benefit'] + e['PPh 21 Payment'] - e['Total PPh 21 DTP Received'], 0)
  const dT = Math.round(thp(v.payload) - thp(oldV.payload)), dP = Math.round(pph(v.payload) - pph(oldV.payload))
  const sign = (n: number) => (n >= 0 ? '+' : '') + rupiah(n)
  notify(['Accountant', 'Finance Manager'], `Payroll ${periodLabel(run.start, run.end)} revised. Take-home pay ${sign(dT)}. PPh 21 ${sign(dP)}.`, `/payroll-runs/${run.id}?tab=compare`)
}
export function chooseSeparateRun(runId: string, no: number, o: { type: Exclude<RunKind, 'Regular'>; name: string; reason?: string }): Result {
  if (!can('run.choose')) return denied()
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
    mode: runMode(run.month), dryRun: null, warnings: [], revised: false, reversedAt: null,
  }
  sep.versions.push({ ...clone(v), no: 1, state: 'active', holds: [], draft: null, decision: null })
  payroll.runs.push(sep)
  checkVersion(sep, sep.versions[0]!)
  addLog({ type: 'Decision', status: 'Recorded', reason: `v${no} saved as separate run ${o.type} ${name}`, nextStep: nextStepFor(sep.versions[0]!), runId: sep.id, runKey: sep.key, version: 1 })
  return { ok: true, runId: sep.id }
}

// ── Checks (LR-5) ───────────────────────────────────────────────────────────

function fieldValue(e: TalentaEmployee, field: string, s: PayrollSettings): string {
  if (field === 'custom:BusinessUnit') return e.custom_fields?.BusinessUnit ?? ''
  if (field === 'cost_center_category') return s.costCenterCategory[e.cost_center_name] ?? ''
  return String((e as unknown as Record<string, unknown>)[field] ?? '')
}
function hasFallback(s: PayrollSettings, field: string, value: string) { return s.fallback.some((f) => f.field === field && f.value === value) }
function resolveTags(e: TalentaEmployee, s: PayrollSettings): { tags: Tags; issues: { field: GroupingField; value: string; kind: 'empty' | 'unmapped' }[] } {
  const tags: Tags = { Organization: null, Branch: null }
  const issues: { field: GroupingField; value: string; kind: 'empty' | 'unmapped' }[] = []
  for (const [dim, field] of [['Organization', 'organization_name'], ['Branch', 'branch_name']] as const) {
    const val = (e[field] ?? '').trim()
    if (!val) { if (s.fieldPolicies[field] === 'hold') issues.push({ field, value: '', kind: 'empty' }); continue }
    const tag = s.groupMaps[dim][val]
    if (tag) tags[dim] = tag
    else if (hasFallback(s, field, val)) tags[dim] = FALLBACK_TAG
    else issues.push({ field, value: val, kind: 'unmapped' })
  }
  if (!(e.cost_center_name ?? '').trim() && s.fieldPolicies.cost_center_name === 'hold' && s.rules.some((r) => r.conditions.some((c) => c.field === 'cost_center_category' || c.field === 'cost_center_name')))
    issues.push({ field: 'cost_center_name', value: '', kind: 'empty' })
  return { tags, issues }
}
function matchRule(e: TalentaEmployee, role: PayRole | null, s: PayrollSettings): AllocationRule | undefined {
  if (!role) return undefined
  return s.rules.find((r) => r.active && r.roles.includes(role) && r.conditions.every((c) => {
    const v = norm(fieldValue(e, c.field, s))
    const hit = c.values.some((x) => norm(x) === v)
    return c.op === 'is' ? hit : !hit
  }))
}

export interface GapRow { employee_id: string; section: PaySection; cents: number; group: string; known: boolean }
/** OD-04: per section, the sum of each employee's absolute gap between lines and Talenta's total. */
export function totalGaps(runId: string, no?: number): { bySection: Record<PaySection, number>; rows: GapRow[]; knownTotal: number; newTotal: number } {
  const run = runById(runId)!
  return gapsOf(versionOf(run, no ?? run.currentVersion) ?? latestVersion(run)!, payroll.settings, run)
}
function gapsOf(v: RunVersion, s: PayrollSettings, run: Run) {
  const rows: GapRow[] = []
  const bySection: Record<PaySection, number> = { allowance: 0, deduction: 0, benefit: 0 }
  for (const e of staffOf(v.payload)) {
    const sec: [PaySection, typeof e.allowances, number][] = [['allowance', e.allowances, e.total_allowances], ['deduction', e.deductions, e.total_deductions], ['benefit', e.benefits, e.total_benefits]]
    for (const [section, items, total] of sec) {
      const lines = items.filter((i) => !(section === 'deduction' && s.deductionsBasis === 'without-employer' && mappingFor(i.name, section, s)?.role === 'Employer contribution'))
        .reduce((x, i) => x + cents(i.amount), 0)
      const g = cents(total) - lines
      if (!g) continue
      const known = payroll.knownGaps.some((k) => k.employee_id === e.employee_id && k.section === section && k.cents === g && k.releasedOn !== run.id && k.runsSeen < 3)
      rows.push({ employee_id: e.employee_id, section, cents: g, group: `${e.organization_name} / ${e.branch_name}`, known })
      if (!known) bySection[section] += Math.abs(g)
    }
  }
  const knownTotal = rows.filter((r) => r.known).reduce((x, r) => x + Math.abs(r.cents), 0)
  const newTotal = rows.filter((r) => !r.known).reduce((x, r) => x + Math.abs(r.cents), 0)
  return { bySection, rows, knownTotal, newTotal }
}

/** Runs every check in LR-5 order and builds the draft when nothing holds. */
function checkVersion(run: Run, v: RunVersion): void {
  const s = payroll.settings
  const holds: Hold[] = []
  v.draft = null
  if (!payroll.connection.sourceConfirmedBy) {
    const sum = { headcount: new Set(v.payload.employees.map((e) => e.employee_id)).size, takeHome: roundCents(v.payload.employees.reduce((x, e) => x + cents(e.take_home_pay), 0)) }
    v.holds = [{ code: 'confirm-source', message: 'Confirm source: the first send waits for the Jurnal Owner.', details: sum }]
    return
  }
  if (v.state === 'waiting-choice') {
    const ov = overlap(run, v)
    v.holds = [{ code: 'choice', message: `A different send arrived for posted payroll ${periodLabel(run.start, run.end)}. Is it a revision or a separate run?`, details: { overlapPct: Math.round(ov.pct * 100) } }]
    return
  }
  if (v.state === 'partial') return
  if (v.state !== 'active') { v.holds = []; return }
  const staff = staffOf(v.payload)
  // Duplicate employee rows (TN-26).
  const seen = new Map<string, string>()
  const dups: string[] = []
  for (const e of staff) {
    const g = `${e.organization_name}|${e.branch_name}|${e.cost_center_name}`
    if (seen.get(e.employee_id) === g) dups.push(e.employee_id)
    seen.set(e.employee_id, g)
  }
  if (dups.length) holds.push({ code: 'duplicate-employee', message: `${dups.length} employee appears twice: ${dups.join(', ')}`, details: { ids: dups } })
  // Unmapped pay items (OD-03).
  const unmapped = new Map<string, { name: string; section: PaySection; cents: number; staff: Set<string>; reason: string }>()
  for (const e of staff) for (const [section, items] of [['allowance', e.allowances], ['deduction', e.deductions], ['benefit', e.benefits]] as const) {
    for (const it of items) {
      if (!cents(it.amount)) continue
      const m = mappingFor(it.name, section, s)
      const reason = !m ? 'no account' : !m.roleConfirmed || !m.role ? 'no confirmed role' : !m.debit || !m.credit ? 'no account' : ''
      if (!reason) continue
      const k = payItemKey(it.name, section)
      const u = unmapped.get(k) ?? { name: it.name.trim(), section, cents: 0, staff: new Set<string>(), reason }
      u.cents += cents(it.amount); u.staff.add(e.employee_id); unmapped.set(k, u)
      if (!m) payroll.settings.mapping.push(newMappingRow(it.name, section, 'Talenta'))
    }
  }
  if (unmapped.size) {
    const list = [...unmapped.values()]
    const first = list[0]!
    holds.push({
      code: 'unmapped-item',
      message: `${list.length} pay item${list.length > 1 ? 's have' : ' has'} ${first.reason}: ${list.map((u) => `${u.name} (${u.section}), ${rupiah(roundCents(u.cents))}, ${u.staff.size} employees`).join('; ')}`,
      details: { items: list.map((u) => ({ key: payItemKey(u.name, u.section), name: u.name, section: u.section, amount: roundCents(u.cents), employees: u.staff.size, reason: u.reason })) },
    })
  }
  // Groups and empty fields.
  const groups = new Map<string, { field: string; value: string; staff: number }>()
  const empty = new Map<string, number>()
  const ruleFields = new Set(s.rules.flatMap((r) => r.conditions.map((c) => c.field)).filter((f) => f !== 'organization_name' && f !== 'branch_name' && f !== 'cost_center_category'))
  if (s.rules.some((r) => r.conditions.some((c) => c.field === 'cost_center_category'))) ruleFields.add('cost_center_name')
  const newValues = new Map<string, { field: string; value: string; staff: number }>()
  for (const e of staff) {
    for (const i of resolveTags(e, s).issues) {
      if (i.kind === 'empty') empty.set(i.field, (empty.get(i.field) ?? 0) + 1)
      else { const k = `${i.field}|${i.value}`; const g = groups.get(k) ?? { field: i.field, value: i.value, staff: 0 }; g.staff++; groups.set(k, g) }
    }
    for (const f of ruleFields) {
      const val = fieldValue(e, f, s)
      if (!val) continue
      const known = (s.knownValues[f] ?? []).includes(val) && (f !== 'cost_center_name' || !!s.costCenterCategory[val])
      if (!known) { const k = `${f}|${val}`; const n = newValues.get(k) ?? { field: f, value: val, staff: 0 }; n.staff++; newValues.set(k, n) }
    }
  }
  if (groups.size) holds.push({ code: 'unmapped-group', message: `${groups.size} group${groups.size > 1 ? 's have' : ' has'} no tag: ${[...groups.values()].map((g) => `${g.value} (${g.staff} employees)`).join(', ')}`, details: { groups: [...groups.values()] } })
  if (newValues.size) holds.push({ code: 'new-field-value', message: `New values in fields the allocation rules read: ${[...newValues.values()].map((n) => `${n.value} (${n.staff} employees)`).join(', ')}`, details: { values: [...newValues.values()] } })
  if (empty.size) holds.push({ code: 'empty-field', message: `Employees with an empty grouping field: ${[...empty.entries()].map(([f, n]) => `${f.replace('_name', '')} ${n}`).join(', ')}`, details: { fields: Object.fromEntries(empty) } })
  // Total check (OD-04), only once items are mapped (the deductions basis depends on roles).
  if (!unmapped.size) {
    const g = gapsOf(v, s, run)
    const over = (Object.entries(g.bySection) as [PaySection, number][]).filter(([, c]) => roundCents(c) > s.limits.gapTolerance)
    if (over.length && !v.gapRelease) {
      holds.push({
        code: 'total-gap',
        message: `Lines differ from Talenta's totals: ${over.map(([sec, c]) => `${sec}s ${rupiah(roundCents(c))}`).join(', ')}.${g.knownTotal ? ` Matches known gap ${rupiah(roundCents(g.knownTotal))}. New gap ${rupiah(roundCents(g.newTotal))}.` : ''}`,
        details: { bySection: Object.fromEntries(Object.entries(g.bySection).map(([k, c]) => [k, roundCents(c)])), rows: g.rows.map((r) => ({ ...r, amount: roundCents(r.cents) })) },
      })
    }
  }
  if (holds.length) { v.holds = holds; return }
  const b = buildJournal(run, v, s)
  v.draft = b.draft
  v.holds = b.holds
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
export function releaseRun(runId: string): Result {
  if (!can('run.release')) return denied()
  const run = runById(runId), v = run && currentVersionOf(run)
  if (!run || !v) return { ok: false }
  checkVersion(run, v)
  addLog({ type: 'Hold', status: v.holds.length ? 'Held' : 'Received', reason: v.holds[0]?.message ?? 'Run released', nextStep: nextStepFor(v), runId, runKey: run.key, version: v.no })
  return { ok: !v.holds.length, holds: v.holds, message: v.holds[0]?.message }
}
export function releaseWithGap(runId: string, o: { reason: string; attachment: string; target: 'suspense' | string }): Result {
  const run = runById(runId), v = run && currentVersionOf(run)
  if (!run || !v) return { ok: false }
  const g = gapsOf(v, payroll.settings, run)
  const third = g.rows.some((r) => (payroll.knownGaps.find((k) => k.employee_id === r.employee_id && k.section === r.section && k.cents === r.cents)?.releases ?? 0) >= 2)
  if (third ? payroll.viewAs !== 'Jurnal Owner' : !can('gap.release') || payroll.viewAs === 'Jurnal Owner') return { ok: false, message: third ? 'The third release of this gap needs the Jurnal Owner.' : 'Your role cannot do this.', status: 403 }
  if (o.reason.trim().length < 10) return { ok: false, message: 'Give a reason (10 characters or more).' }
  if (!o.attachment.trim()) return { ok: false, message: "Attach HR's confirmation." }
  const target = o.target === 'suspense' ? payroll.settings.suspenseAccount : o.target
  if (!target) return { ok: false, message: 'Set a Payroll suspense account first.' }
  if (o.target !== 'suspense' && !partyOf(target)) return { ok: false, message: 'Pick Payroll suspense or a party payable.' }
  v.gapRelease = { target, reason: o.reason.trim(), attachment: o.attachment.trim(), by: actingPerson(), at: now(), gaps: g.rows.filter((r) => !r.known).map((r) => ({ employee_id: r.employee_id, section: r.section, cents: r.cents })) }
  for (const r of v.gapRelease.gaps) {
    const k = payroll.knownGaps.find((x) => x.employee_id === r.employee_id && x.section === r.section && x.cents === r.cents)
    if (k) { k.releases++; k.runsSeen = 0; k.releasedOn = run.id; k.target = target }
    else payroll.knownGaps.push({ id: nextId('gap'), employee_id: r.employee_id, section: r.section, cents: r.cents, target, releasedOn: run.id, runsSeen: 0, releases: 1 })
  }
  checkVersion(run, v)
  addLog({ type: 'Hold', status: v.holds.length ? 'Held' : 'Received', reason: `Released with gap to ${accountLabel(target)}`, nextStep: nextStepFor(v), runId, runKey: run.key, version: v.no })
  return { ok: true }
}
export function releaseTaxHold(runId: string, reason: string): Result {
  if (!can('tax.release')) return denied()
  const run = runById(runId), v = run && currentVersionOf(run)
  if (!run || !v || !v.holds.some((h) => h.code === 'tax-rule')) return { ok: false, message: 'No tax hold on this run.' }
  if (reason.trim().length < 10) return { ok: false, message: 'Give a reason (10 characters or more).' }
  v.taxRelease = { reason: reason.trim(), by: actingPerson(), at: now() }
  checkVersion(run, v)
  addLog({ type: 'Hold', status: v.holds.length ? 'Held' : 'Received', reason: 'Tax rule hold released', nextStep: nextStepFor(v), runId, runKey: run.key, version: v.no })
  return { ok: true }
}
export function markDryRunPassed(runId: string): Result {
  if (!can('dryrun.pass')) return denied()
  const run = runById(runId)
  if (!run?.dryRun) return { ok: false, message: 'This run is not a dry run.' }
  if (runHolds(run).length) return { ok: false, message: 'Clear the issues before marking the dry run Passed.' }
  run.dryRun.passedBy = actingPerson(); run.dryRun.passedAt = now()
  return { ok: true }
}
export function signOffDryRun(runId: string): Result {
  if (!can('dryrun.signoff')) return denied()
  const run = runById(runId)
  if (!run?.dryRun?.passedBy) return { ok: false, message: 'The Accountant marks the dry run Passed first.' }
  if (run.dryRun.passedBy === actingPerson()) return { ok: false, message: 'A different person signs off.' }
  run.dryRun.signedOffBy = actingPerson(); run.dryRun.signedOffAt = now()
  return { ok: true }
}

// ── Draft build (TS-05) ─────────────────────────────────────────────────────

interface Bucket { account: string; tags: Tags; cents: number; why: Set<string>; sources: Map<string, LineSource> }
interface BuildResult { draft: Draft; holds: Hold[] }

function memoFor(run: Run, v: RunVersion): string {
  const kind = run.kind === 'Regular' ? 'monthly' : `${run.kind} ${run.label}`
  return `Talenta payroll, ${kind} ${run.start} to ${run.end}, version ${v.no}, sent ${wib(v.sentAt)}`
}

/** Pure build of one version with the given settings: lines by account and tag, one payable line per party. */
function buildJournal(run: Run, v: RunVersion, s: PayrollSettings): BuildResult {
  const buckets = new Map<string, Bucket>()
  const add = (account: string, tags: Tags, c: number, why: string, src: Omit<LineSource, 'side' | 'cents' | 'staff'>, staffId: string | null) => {
    if (!c) return
    const t = isCost(account) ? tags : NO_TAGS
    const key = `${account}#${tagsKey(t)}${grossBoth(account) ? (c > 0 ? '#D' : '#C') : ''}`
    const b = buckets.get(key) ?? { account, tags: { ...t }, cents: 0, why: new Set<string>(), sources: new Map() }
    b.cents += c; b.why.add(why)
    const sk = `${src.item}|${src.section}|${c > 0 ? 'D' : 'C'}`
    const ls = b.sources.get(sk) ?? { ...src, side: c > 0 ? 'D' : 'C', cents: 0, staff: [] }
    ls.cents += c
    if (staffId && !ls.staff.includes(staffId)) ls.staff.push(staffId)
    b.sources.set(sk, ls)
    buckets.set(key, b)
  }
  const hg = s.hutangGaji
  const staff = staffOf(v.payload)
  const others = v.payload.employees.filter((e) => !staff.includes(e))
  const gaps = gapsOf(v, s, run)
  const gapTarget = (section: PaySection, row: GapRow): string | null => {
    if (row.known) return payroll.knownGaps.find((k) => k.employee_id === row.employee_id && k.section === section && k.cents === row.cents)?.target ?? s.suspenseAccount
    if (roundCents(gaps.bySection[section]) <= s.limits.gapTolerance) return s.roundingAccount
    return v.gapRelease?.target ?? null
  }
  const itemsToHG: string[] = []
  for (const e of staff) {
    const { tags } = resolveTags(e, s)
    for (const [section, items] of [['allowance', e.allowances], ['deduction', e.deductions], ['benefit', e.benefits]] as const) {
      for (const it of items) {
        const c = cents(it.amount)
        const m = mappingFor(it.name, section, s)
        if (!c || !m || !m.debit || !m.credit) continue
        let debit = m.debit
        const why = `${m.name} (${section}), role ${m.role}: Dr ${accountLabel(m.debit)}, Cr ${accountLabel(m.credit)}`
        const rule = matchRule(e, m.role, s)
        let lineTags = tags
        let ruleWhy = ''
        if (rule) {
          if (rule.account && m.role && COST_ROLES.includes(m.role) && isCost(debit)) { debit = rule.account; ruleWhy = `Rule "${rule.name}" sets ${accountLabel(rule.account)}` }
          if (rule.tags) { lineTags = { ...tags, ...rule.tags } as Tags; ruleWhy = ruleWhy || `Rule "${rule.name}" sets the tags` }
        }
        const tagWhy = isCost(debit) && (lineTags.Organization || lineTags.Branch) ? `Tags ${tagsLabel(lineTags)} from ${rule?.tags ? `rule "${rule.name}"` : 'organization and branch maps'}` : ''
        const src = { item: m.name, section, role: m.role }
        add(debit, lineTags, c, [why, ruleWhy, tagWhy].filter(Boolean).join('. '), src, e.employee_id)
        add(m.credit, lineTags, -c, why, src, e.employee_id)
        if (m.debit === hg && m.credit === hg && !itemsToHG.includes(m.name)) itemsToHG.push(m.name)
      }
    }
    // Tax presets (OD-24): DTP, PPh 26 and severance PPh 21 leave Hutang PPh 21 for their own accounts.
    const p = s.taxPresets
    for (const [field, acct] of [['Total PPh 21 DTP Received', p.dtp], ['PPh 26 Benefit', p.pph26], ['PPh 21 Resign Benefit', p.resign]] as const) {
      const c = cents(e[field])
      if (!c || acct === p.pph21) continue
      const why = `Tax preset: ${field} to ${accountLabel(acct)}`
      add(p.pph21, NO_TAGS, c, why, { item: field, section: 'preset', role: 'Tax' }, e.employee_id)
      add(acct, NO_TAGS, -c, why, { item: field, section: 'preset', role: 'Tax' }, e.employee_id)
    }
  }
  // Total gaps: small ones to Payroll rounding, released ones to the chosen account. Hutang Gaji = take-home pay.
  for (const row of gaps.rows) {
    const target = gapTarget(row.section, row)
    if (!target || row.section === 'benefit') continue
    const why = row.known ? `Matches known gap for ${row.employee_id}` : target === s.roundingAccount ? 'Gap against Talenta totals within the Rp1.000 limit' : `Gap released with gap to ${accountLabel(target)}`
    const src = { item: `${row.section} gap`, section: 'gap' as const, role: null }
    if (row.section === 'deduction') { add(hg, NO_TAGS, row.cents, why, src, row.employee_id); add(target, NO_TAGS, -row.cents, why, src, row.employee_id) }
    else { add(target, NO_TAGS, row.cents, why, src, row.employee_id); add(hg, NO_TAGS, -row.cents, why, src, row.employee_id) }
  }
  // Lines, whole rupiah, half up.
  let lines: JournalLine[] = []
  for (const b of buckets.values()) {
    const r = roundCents(b.cents)
    if (!r) continue
    const line: JournalLine = { account: b.account, tags: b.tags, debit: r > 0 ? r : 0, credit: r < 0 ? -r : 0, why: [...b.why], sources: [...b.sources.values()] }
    if (isCost(b.account) && r < 0) line.review = true
    lines.push(line)
  }
  const holds: Hold[] = []
  const deb = lines.reduce((x, l) => x + l.debit, 0), cre = lines.reduce((x, l) => x + l.credit, 0)
  const residue = deb - cre
  if (residue) {
    if (Math.abs(residue) <= s.limits.roundingTolerance) {
      const ex = lines.find((l) => l.account === s.roundingAccount)
      const net = (ex ? ex.debit - ex.credit : 0) - residue
      if (ex) { ex.debit = net > 0 ? net : 0; ex.credit = net < 0 ? -net : 0; ex.why.push('Rounding residue of the whole-rupiah lines') }
      else lines.push({ account: s.roundingAccount, tags: NO_TAGS, debit: residue < 0 ? -residue : 0, credit: residue > 0 ? residue : 0, why: ['Rounding residue of the whole-rupiah lines'], sources: [{ item: 'Rounding', section: 'rounding', role: null, side: residue < 0 ? 'D' : 'C', cents: -residue * 100, staff: [] }] })
      lines = lines.filter((l) => l.debit || l.credit)
    } else {
      const top = [...lines].sort((a, b) => (b.debit + b.credit) - (a.debit + a.credit)).slice(0, 5).map((l) => ({ account: l.account, tags: l.tags, amount: l.debit || -l.credit }))
      holds.push({ code: 'rounding', message: `The rounded lines differ by ${rupiah(Math.abs(residue))}, over the ${rupiah(s.limits.roundingTolerance)} limit.`, details: { residue, top } })
    }
  }
  // Hutang Gaji equals take-home pay (TN-08, no override).
  const thp = roundCents(staff.reduce((x, e) => x + cents(e.take_home_pay), 0))
  const hgLine = lines.filter((l) => l.account === hg).reduce((x, l) => x + l.credit - l.debit, 0)
  if (hgLine !== thp) {
    holds.push({ code: 'hutang-gaji', message: itemsToHG.length ? `${itemsToHG.join(' and ')} post to ${accountName(hg)} on both sides. ${accountName(hg)} must equal take-home pay ${rupiah(thp)}.` : `${accountName(hg)} ${rupiah(hgLine)} differs from take-home pay ${rupiah(thp)}.`, details: { hutangGaji: hgLine, takeHome: thp, items: itemsToHG } })
  }
  // Two statutory parties on one payable (TN-10).
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
  // Payables below Rp0 (December PPh 21 true-up excepted).
  for (const l of lines) {
    if (partyOf(l.account) && l.debit > 0 && !(l.account === s.taxPresets.pph21 && run.end.slice(5, 7) === '12'))
      holds.push({ code: 'negative-payable', message: `${accountName(l.account)} is below Rp0 (${rupiah(-l.debit)}).`, details: { account: l.account } })
  }
  for (const l of lines) if (payrollAccount(l.account)?.archived) holds.push({ code: 'archived-account', message: `${accountLabel(l.account)} is archived.`, details: { account: l.account } })
  // One PPh 21 rule (LR-10).
  const expected = roundCents(staff.reduce((x, e) => x + cents(e['PPh 21 Benefit']) + cents(e['PPh 21 Payment']) - cents(e['Total PPh 21 DTP Received']), 0))
  const ledger = lines.filter((l) => l.account === s.taxPresets.pph21).reduce((x, l) => x + l.credit - l.debit, 0)
  if (Math.abs(ledger - expected) > 1_000 && !v.taxRelease)
    holds.push({ code: 'tax-rule', message: `PPh 21 lines ${rupiah(ledger)} differ from the PPh 21 rule ${rupiah(expected)} by ${rupiah(Math.abs(ledger - expected))}.`, details: { ledger, expected } })
  const sortKey = (l: JournalLine) => `${l.debit ? 0 : 1}|${l.account}|${tagsKey(l.tags)}`
  lines.sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  const date = run.end
  const draft: Draft = {
    id: nextId('draft'), versionNo: v.no, snapshotId: currentSnapshotId(), builtAt: payroll.clock, date,
    memo: memoFor(run, v), lines, fmConfirmedBy: null, nothingToPost: !lines.length,
    otherEntity: { staff: new Set(others.map((e) => e.employee_id)).size, amount: roundCents(others.reduce((x, e) => x + cents(e.total_allowances), 0)) },
  }
  return { draft, holds }
}

export function isDraftStale(runId: string): boolean {
  const d = draftOf(runById(runId)!)
  return !!d && d.snapshotId !== currentSnapshotId()
}
/** Rebuild the current draft on current settings; returns the lines that moved. */
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
  return { account: accountLabel(l.account), tags: tagsLabel(l.tags), why: l.why, sources: l.sources.map((s) => ({ item: s.item, section: s.section, role: s.role, amount: roundCents(Math.abs(s.cents)), employees: s.staff.length, employeeIds: can('payByEmployee.view') ? s.staff : [] })) }
}

/** OD-12 review: pay item totals, change from last period, headcount by group, the lines. */
export function draftReview(runId: string) {
  const run = runById(runId)!
  const v = currentVersionOf(run)!
  const d = v.draft
  const staff = staffOf(v.payload)
  const s = payroll.settings
  const items = new Map<string, { name: string; section: PaySection; amount: number; staff: number; role: PayRole | null }>()
  for (const e of staff) for (const [section, list] of [['allowance', e.allowances], ['deduction', e.deductions], ['benefit', e.benefits]] as const) for (const it of list) {
    const k = payItemKey(it.name, section)
    const x = items.get(k) ?? { name: it.name, section, amount: 0, staff: 0, role: mappingFor(it.name, section)?.role ?? null }
    x.amount += cents(it.amount); x.staff++; items.set(k, x)
  }
  const payItems = [...items.values()].map((x) => ({ ...x, amount: roundCents(x.amount) }))
  const sec = (k: 'total_allowances' | 'total_deductions' | 'total_benefits') => roundCents(staff.reduce((x, e) => x + cents(e[k]), 0))
  const sumItems = (section: PaySection) => payItems.filter((p) => p.section === section && !(section === 'deduction' && s.deductionsBasis === 'without-employer' && p.role === 'Employer contribution')).reduce((x, p) => x + p.amount, 0)
  const talentaTotals = (['allowance', 'deduction', 'benefit'] as PaySection[]).map((section) => {
    const talenta = sec(section === 'allowance' ? 'total_allowances' : section === 'deduction' ? 'total_deductions' : 'total_benefits')
    return { section, lines: sumItems(section), talenta, gap: talenta - sumItems(section) }
  })
  // Change from last period by account and tag.
  const prev = previousRun(run)
  const prevLines = prev ? liveJournals(prev.id).flatMap((j) => j.lines) : []
  const L = s.limits
  const changes = d ? diffLineSets(prevLines, d.lines).concat([]).map((r) => {
    const pct = r.old ? (r.diff / Math.abs(r.old)) * 100 : null
    const flag = Math.abs(r.diff) > L.largeChangeAmount && (pct == null || Math.abs(pct) > L.largeChangePct)
    return { ...r, pct, flag, note: v.changeNotes[r.key] ?? null }
  }).filter((r) => isCost(r.account) || partyOf(r.account)) : []
  // Headcount by group from events.
  const headcount = headcountByGroup(run, v, prev)
  return {
    previous: prev ? { runId: prev.id, label: periodLabel(prev.start, prev.end) } : null,
    payItems, talentaTotals, changes, headcount, lines: d?.lines ?? [], otherEntity: d?.otherEntity ?? null,
    takeHome: roundCents(staff.reduce((x, e) => x + cents(e.take_home_pay), 0)),
    unnotedLargeChanges: changes.filter((c) => c.flag && !c.note).length,
  }
}
function previousRun(run: Run): Run | undefined {
  return payroll.runs.filter((r) => r.id !== run.id && r.kind === run.kind && (run.kind === 'Regular' || norm(r.label) === norm(run.label)) && r.end < run.end && liveJournals(r.id).length)
    .sort((a, b) => b.end.localeCompare(a.end))[0]
}
function headcountByGroup(run: Run, v: RunVersion, prev: Run | undefined) {
  const group = (e: { organization_name: string; branch_name: string }) => `${e.organization_name} / ${e.branch_name}`
  const actual = new Map<string, number>()
  for (const e of staffOf(v.payload)) actual.set(group(e), (actual.get(group(e)) ?? 0) + 1)
  const pv = prev ? versionOf(prev, prev.ledgerVersion) : undefined
  const last = new Map<string, number>()
  if (pv) for (const e of staffOf(pv.payload)) last.set(group(e), (last.get(group(e)) ?? 0) + 1)
  const from = prev ? addDays(prev.end, 1) : run.start
  const inWin = (d: string | null) => !!d && d >= from && d <= run.end
  const join = new Map<string, number>(), leave = new Map<string, number>(), tin = new Map<string, number>(), tout = new Map<string, number>()
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1)
  for (const ev of payroll.events) {
    if (ev.type === 'talenta.employee.detail.created' && inWin(ev.effective) && ev.to) bump(join, group(ev.to))
    if (ev.type === 'talenta.employee.resignation.created' && ev.effective && prev && ev.effective >= prev.start && ev.effective < from && ev.from) bump(leave, group(ev.from))
    if (ev.type === 'talenta.employee.transfer.approved' && inWin(ev.effective) && ev.from && ev.to) { bump(tout, group(ev.from)); bump(tin, group(ev.to)) }
  }
  const keys = new Set([...actual.keys(), ...last.keys(), ...join.keys(), ...leave.keys(), ...tin.keys(), ...tout.keys()])
  const hasEvents = payroll.events.length > 0
  return [...keys].sort().map((g) => {
    const lastN = last.get(g) ?? 0
    const expected = hasEvents ? lastN + (join.get(g) ?? 0) - (leave.get(g) ?? 0) + (tin.get(g) ?? 0) - (tout.get(g) ?? 0) : null
    const act = actual.get(g) ?? 0
    return { group: g, last: lastN, joiners: join.get(g) ?? 0, leavers: leave.get(g) ?? 0, transfersIn: tin.get(g) ?? 0, transfersOut: tout.get(g) ?? 0, expected, actual: act, difference: expected == null ? null : act - expected }
  })
}
export function addChangeNote(runId: string, key: string, note: string): Result {
  if (!can('draft.note')) return denied()
  const v = currentVersionOf(runById(runId)!)
  if (!v) return { ok: false }
  if (note.length > 500) return { ok: false, message: 'Keep the note to 500 characters.' }
  v.changeNotes[key] = note.trim()
  return { ok: true }
}
export function claimsSummary(runId: string) {
  const run = runById(runId)!
  const jl = liveJournals(run.id)
  const lines = jl.length ? jl.flatMap((j) => j.lines.map((l) => ({ l, j }))) : (draftOf(run)?.lines ?? []).map((l) => ({ l, j: null as Journal | null }))
  const rows: { item: string; account: string; tags: string; amount: number; version: number | null; journal: string | null }[] = []
  for (const { l, j } of lines) for (const s of l.sources) if (s.role === 'Reimbursement' && s.side === 'D') rows.push({ item: s.item, account: accountLabel(l.account), tags: tagsLabel(l.tags), amount: roundCents(s.cents), version: j?.versionNo ?? run.currentVersion, journal: j?.number ?? null })
  return { rows, total: rows.reduce((x, r) => x + r.amount, 0) }
}

// ── Periods and locks ───────────────────────────────────────────────────────

export function isLocked(month: string): boolean { return payroll.lockedMonths.includes(month) }
export function firstOpenAfter(month: string): string { let m = month; while (isLocked(m)) m = nextMonthOf(m); return m }
export function lockPeriod(month: string, o: { confirm?: boolean } = {}): Result {
  if (!can('period.lock')) return denied()
  const open = payroll.runs.filter((r) => r.month === month && ['Received', 'Held', 'Waiting for your choice', 'Revised', 'Ready to post'].includes(runStatus(r)))
  if (open.length && !o.confirm) return { ok: false, needsConfirm: true, runs: open.map((r) => ({ id: r.id, label: periodLabel(r.start, r.end), status: runStatus(r) })), message: `${open.length} run${open.length > 1 ? 's are' : ' is'} still open in ${monthLabel(month)}.` }
  if (!isLocked(month)) payroll.lockedMonths.push(month)
  payroll.lockedMonths.sort()
  return { ok: true }
}
export function unlockPeriod(month: string): Result {
  if (!can('period.lock')) return denied()
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
function addJournal(j: Omit<Journal, 'id' | 'number' | 'postedBy' | 'postedAt' | 'reversedById'> & { number?: string }): Journal {
  const journal: Journal = { ...j, id: nextId('j'), number: j.number ?? nextPayNo(), postedBy: actingPerson(), postedAt: payroll.clock, reversedById: null }
  const t = journalTotals(journal)
  if (t.debit !== t.credit) throw new Error(`Journal out of balance: ${t.debit} vs ${t.credit}`)
  payroll.journals.push(journal)
  return journal
}
function needsFmConfirm(run: Run, d: Draft): boolean {
  const s = snapshotById(d.snapshotId)?.settings ?? payroll.settings
  const override = s.mapping.some((m) => m.override && d.lines.some((l) => l.sources.some((x) => x.item === m.name)))
  const lastPosted = [...payroll.journals].reverse().find((j) => j.type === 'Payroll' && j.snapshotId)
  return override || (!!lastPosted && lastPosted.snapshotId !== d.snapshotId)
}
export function confirmPostAsFinanceManager(runId: string): Result {
  if (!can('post.confirm')) return denied()
  const d = draftOf(runById(runId)!)
  if (!d) return { ok: false, message: 'No draft to confirm.' }
  d.fmConfirmedBy = actingPerson()
  return { ok: true }
}
function correctionMemo(run: Run, fromV: RunVersion, oldNo: string | null): string {
  return `Correction of payroll ${periodLabel(run.start, run.end)} v${run.ledgerVersion ?? fromV.no}${oldNo ? ` (${oldNo})` : ''}, from v${fromV.no} sent ${dateLabel(isoDateWib(fromV.sentAt))}`
}
function isoDateWib(iso: string): string { return new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 10) }

export function postRun(runId: string, o: { versionNo?: number } = {}): Result {
  if (!can('post')) return denied()
  const run = runById(runId)
  if (!run) return { ok: false, status: 404 }
  const v = currentVersionOf(run)
  if (o.versionNo != null && o.versionNo !== run.currentVersion) return { ok: false, status: 409, message: `A newer version (v${run.currentVersion}) arrived. Review v${run.currentVersion} before posting.` }
  if (run.mode !== 'Live') return { ok: false, status: 409, message: `${run.mode} runs do not post.` }
  if (!v || !v.draft) return { ok: false, message: runHolds(run)[0]?.message ?? 'Nothing to post.' }
  if (run.ledgerVersion != null && liveJournals(run.id).length) {
    const posted = liveJournals(run.id)[0]!
    return { ok: false, status: 409, message: `v${run.ledgerVersion} is still posted as ${posted.number}. Use Reverse and repost, or Post the difference.` }
  }
  if (isDraftStale(runId)) {
    const r = rebuildDraft(runId)
    return { ok: false, stale: true, changed: r.changed, message: 'Settings changed since this draft was built. The draft was rebuilt. Review the changed lines and post again.' }
  }
  if (v.holds.length) return { ok: false, message: v.holds[0]!.message }
  if (v.draft.nothingToPost) return { ok: false, message: 'Nothing to post.' }
  if (needsFmConfirm(run, v.draft) && !v.draft.fmConfirmedBy) return { ok: false, needsConfirm: true, message: 'This draft has a guardrail override or settings changed since the last posted run. A Finance Manager confirms before posting.' }
  const review = draftReview(runId)
  now()
  const pd = postingDate(v.draft.date)
  const j = addJournal({
    type: 'Payroll', runId, versionNo: v.no, date: pd.date, taxMonth: run.month,
    memo: pd.redirected ? `Payroll ${periodLabel(run.start, run.end)} v${v.no}, posted in the first open period. ${v.draft.memo}` : v.draft.memo,
    reference: pd.redirected ? monthLabel(run.month) : null, correction: pd.redirected,
    lines: clone(v.draft.lines), snapshotId: v.draft.snapshotId, reversesId: null, fmConfirmedBy: v.draft.fmConfirmedBy, accrualId: null, paymentId: null,
  })
  run.ledgerVersion = v.no; run.revised = false; run.reversedAt = null
  for (const k of payroll.knownGaps) if (k.releasedOn !== run.id) k.runsSeen++
  addLog({ type: 'Post', status: 'Posted', reason: `Posted as ${j.number}`, nextStep: 'Record the salary payment on payday.', runId, runKey: run.key, version: v.no, employees: v.payload.employees.length, journalNo: j.number })
  const accr = reverseAccrualForRun(run, j)
  markReconOutOfDate(run.month)
  return { ok: true, journalId: j.id, number: j.number, redirected: pd.redirected, warnings: review.unnotedLargeChanges ? [`${review.unnotedLargeChanges} large change${review.unnotedLargeChanges > 1 ? 's have' : ' has'} no note.`] : [], accrual: accr }
}

// ── Reverse, compare, fix (TS-07, OD-14, OD-15, OD-17, LR-4) ────────────────

function reversalOf(j: Journal, date: string, extra: Partial<Journal> = {}): Journal {
  const pd = postingDate(date < j.date ? j.date : date)
  const r = addJournal({
    type: j.type === 'Payroll accrual' ? 'Accrual reversal' : 'Reversal', runId: j.runId, versionNo: j.versionNo, date: pd.date, taxMonth: j.taxMonth,
    memo: `Reversal of ${j.number}`, reference: pd.redirected ? monthLabel(j.taxMonth) : j.reference, correction: pd.redirected || j.correction,
    lines: j.lines.map((l) => ({ ...clone(l), debit: l.credit, credit: l.debit, sources: l.sources.map((s) => ({ ...s, cents: -s.cents, side: s.side === 'D' ? 'C' : 'D' })) })),
    snapshotId: j.snapshotId, reversesId: j.id, fmConfirmedBy: null, accrualId: j.accrualId, paymentId: j.paymentId, ...extra,
  })
  j.reversedById = r.id
  return r
}
export function paymentsFor(runId: string): Payment[] { return payroll.payments.filter((p) => !p.voidedBy && (p.runId === runId || (p.kind === 'Statutory' && p.periods.some((x) => x.month === runById(runId)?.month)))) }
/** Reverse every live journal of a run together (TN-21). */
export function reverseRun(runId: string, o: { date?: string; confirmPayments?: boolean } = {}): Result {
  if (!can('reverse')) return denied()
  const run = runById(runId)
  const live = run ? liveJournals(run.id) : []
  if (!run || !live.length) return { ok: false, message: 'Nothing posted to reverse.' }
  const pays = payroll.payments.filter((p) => !p.voidedBy && p.runId === runId)
  if (pays.length && !o.confirmPayments) return { ok: false, needsConfirm: true, payments: pays.map((p) => ({ id: p.id, number: journalById(p.journalId)?.number, amount: p.amount })), message: 'Payments are matched to this run. Confirm again to reverse; no payment changes.' }
  now()
  const date = o.date ?? live.map((j) => j.date).sort().pop()!
  const done = live.map((j) => reversalOf(j, date))
  run.reversedAt = payroll.clock
  for (const d of done) addLog({ type: 'Reversal', status: 'Reversed', reason: d.memo, nextStep: 'Repost the latest version.', runId, runKey: run.key, version: d.versionNo, journalNo: d.number })
  // A reversed run reopens the accrual it reversed (FG-7).
  for (const a of payroll.accruals) {
    if (run.kind !== 'Regular' || a.reversedBy !== 'run' || a.nextRunStart !== run.start) continue
    const rj = journalById(a.reversalJournalId)
    if (!rj) continue
    reversalOf(rj, date)
    a.reversalJournalId = null; a.reversedBy = null
    a.log.push(`Reopened: payroll ${periodLabel(run.start, run.end)} was reversed`)
  }
  // Draft of the ledger version is ready to post again.
  const v = currentVersionOf(run)
  if (v) checkVersion(run, v)
  run.ledgerVersion = null; run.revised = false
  markReconOutOfDate(run.month)
  return { ok: true, journals: done.map((d) => d.number) }
}
export function reverseJournal(journalId: string, o: { date?: string; confirmPayments?: boolean } = {}): Result {
  if (!can('reverse')) return denied()
  const j = journalById(journalId)
  if (!j) return { ok: false, status: 404 }
  if (j.reversesId) return { ok: false, message: 'A reversal cannot be reversed.' }
  if (j.reversedById) return { ok: false, message: 'This journal is already reversed.' }
  if (j.type === 'Payroll accrual') {
    const a = payroll.accruals.find((x) => x.journalId === j.id)
    if (!a) return { ok: false }
    now()
    const r = reversalOf(j, o.date ?? addDays(j.date, 1))
    a.reversalJournalId = r.id; a.reversedBy = 'manual'; a.log.push(`Reversed by hand as ${r.number}`)
    return { ok: true, journals: [r.number] }
  }
  if (j.runId && (j.type === 'Payroll' || j.type === 'Difference')) return reverseRun(j.runId, o)
  return { ok: false, message: 'Payments are voided, not reversed.' }
}
/** Lines a fix must post: new build minus the live journals (decreases on the opposite side). */
function differenceLines(run: Run, v: RunVersion, includeSettingsMoves: boolean): JournalLine[] {
  const newB = buildJournal(run, v, payroll.settings).draft.lines
  const liveLines = liveJournals(run.id).flatMap((j) => j.lines)
  const ledgerV = versionOf(run, run.ledgerVersion)
  // Lines moved only by a settings change post only when ticked (TN-06): compare against the ledger version rebuilt on current settings.
  const base = includeSettingsMoves || !ledgerV ? liveLines : buildJournal(run, ledgerV, payroll.settings).draft.lines
  return diffLineSets(base, newB).map((r) => {
    const amt = r.diff
    return { account: r.account, tags: r.tags, debit: amt > 0 ? amt : 0, credit: amt < 0 ? -amt : 0, why: [`v${run.ledgerVersion} to v${v.no}`], sources: [] as LineSource[] }
  }).filter((l) => l.debit || l.credit)
}
export function compareVersions(runId: string, a?: number, b?: number) {
  const run = runById(runId)!
  const oldNo = a ?? run.ledgerVersion ?? run.versions[0]!.no
  const newNo = b ?? latestVersion(run)!.no
  const va = versionOf(run, oldNo)!, vb = versionOf(run, newNo)!
  const oldLines = oldNo === run.ledgerVersion && liveJournals(run.id).length ? liveJournals(run.id).flatMap((j) => j.lines) : buildJournal(run, va, payroll.settings).draft.lines
  const newLines = buildJournal(run, vb, payroll.settings).draft.lines
  const byAccountTag = diffLineSets(oldLines, newLines).map((r) => ({ ...r, label: `${accountLabel(r.account)}${tagsLabel(r.tags) ? ` | ${tagsLabel(r.tags)}` : ''}` }))
  const settingsMoved = oldNo === run.ledgerVersion && liveJournals(run.id).length ? diffLineSets(oldLines, buildJournal(run, va, payroll.settings).draft.lines) : []
  const items = (p: TalentaPayload) => {
    const m = new Map<string, number>()
    for (const e of staffOf(p)) for (const [section, list] of [['allowance', e.allowances], ['deduction', e.deductions], ['benefit', e.benefits]] as const) for (const it of list) m.set(`${it.name}|${section}`, (m.get(`${it.name}|${section}`) ?? 0) + cents(it.amount))
    return m
  }
  const ia = items(va.payload), ib = items(vb.payload)
  const byPayItem = [...new Set([...ia.keys(), ...ib.keys()])].map((k) => {
    const [name, section] = k.split('|') as [string, PaySection]
    const o = roundCents(ia.get(k) ?? 0), n = roundCents(ib.get(k) ?? 0)
    return { name, section, old: o, new: n, diff: n - o }
  }).filter((r) => r.diff !== 0)
  const ids = (p: TalentaPayload) => new Map(staffOf(p).map((e) => [e.employee_id, `${e.organization_name} / ${e.branch_name}`]))
  const xa = ids(va.payload), xb = ids(vb.payload)
  const added = [...xb].filter(([id]) => !xa.has(id)).map(([id, group]) => ({ id, group }))
  const removed = [...xa].filter(([id]) => !xb.has(id)).map(([id, group]) => ({ id, group }))
  const tax = taxChanges(va.payload, vb.payload)
  return { oldNo, newNo, oldLabel: `v${oldNo}${oldNo === run.ledgerVersion ? ' (in the ledger)' : ''}`, newLabel: `v${newNo}`, byPayItem, byAccountTag, settingsMoved, headcount: { added, removed }, taxChanges: tax, noLedgerChange: !byAccountTag.length }
}
function fixGuard(run: Run | undefined, no?: number): { run: Run; v: RunVersion } | Result {
  if (!can('fix')) return denied()
  if (!run) return { ok: false, status: 404 }
  const v = versionOf(run, no ?? run.currentVersion)
  if (!v || v.state !== 'active') return { ok: false, message: 'Pick the current version.' }
  if (run.ledgerVersion == null || !liveJournals(run.id).length) return { ok: false, message: 'Nothing posted for this run. Post the draft.' }
  if (v.no === run.ledgerVersion) return { ok: false, status: 409, message: 'This version is already in the ledger.' }
  if (run.versions.some((x) => x.state === 'partial')) return { ok: false, message: `v${run.versions.find((x) => x.state === 'partial')!.no} looks partial. Replace the full run or reject it first.` }
  if (isDraftStale(run.id)) { rebuildDraft(run.id); return { ok: false, stale: true, message: 'Settings changed. The draft was rebuilt; review and try again.' } }
  if (v.holds.length) return { ok: false, message: v.holds[0]!.message }
  return { run, v }
}
function retireLedgerVersion(run: Run, oldV: RunVersion, v: RunVersion) {
  if (oldV !== v) { oldV.state = 'replaced'; oldV.replacedBy = v.no }
  run.ledgerVersion = v.no; run.revised = false
}
function afterFix(run: Run, oldV: RunVersion, v: RunVersion, journals: Journal[]) {
  retireLedgerVersion(run, oldV, v)
  for (const j of journals) addLog({ type: j.type === 'Reversal' ? 'Reversal' : 'Post', status: j.type === 'Reversal' ? 'Reversed' : 'Posted', reason: `${j.memo} (${j.number})`, nextStep: 'Check payables for the change.', runId: run.id, runKey: run.key, version: v.no, journalNo: j.number })
  if (taxChanges(oldV.payload, v.payload).length) openAmendmentTask(run, oldV, v, false)
  reverseAccrualForRun(run, journals[journals.length - 1]!)
  markReconOutOfDate(run.month)
}
export function reverseAndRepost(runId: string, no?: number): Result {
  const g = fixGuard(runById(runId), no)
  if (!('run' in g)) return g as Result
  const { run, v } = g
  const oldV = versionOf(run, run.ledgerVersion)!
  const live = liveJournals(run.id)
  const pd = postingDate(run.end)
  now()
  const reversals = live.map((j) => reversalOf(j, pd.date))
  const b = buildJournal(run, v, payroll.settings)
  const j = addJournal({
    type: 'Payroll', runId, versionNo: v.no, date: pd.date, taxMonth: run.month,
    memo: pd.redirected ? correctionMemo(run, v, live[0]?.number ?? null) : b.draft.memo, reference: pd.redirected ? monthLabel(run.month) : null, correction: pd.redirected,
    lines: b.draft.lines, snapshotId: currentSnapshotId(), reversesId: null, fmConfirmedBy: v.draft?.fmConfirmedBy ?? null, accrualId: null, paymentId: null,
  })
  afterFix(run, oldV, v, [...reversals, j])
  return { ok: true, journals: [...reversals, j].map((x) => x.number), redirected: pd.redirected }
}
export function postDifference(runId: string, no?: number, o: { includeSettingsMoves?: boolean } = {}): Result {
  const g = fixGuard(runById(runId), no)
  if (!('run' in g)) return g as Result
  const { run, v } = g
  const oldV = versionOf(run, run.ledgerVersion)!
  const lines = differenceLines(run, v, !!o.includeSettingsMoves)
  now()
  if (!lines.length) {
    retireLedgerVersion(run, oldV, v)
    addLog({ type: 'Post', status: 'No change', reason: 'No ledger change', nextStep: 'Nothing to post.', runId, runKey: run.key, version: v.no })
    if (taxChanges(oldV.payload, v.payload).length) openAmendmentTask(run, oldV, v, true)
    return { ok: true, journals: [], message: 'No ledger change' }
  }
  const live = liveJournals(run.id)
  const pd = postingDate(run.end)
  const j = addJournal({
    type: 'Difference', runId, versionNo: v.no, date: pd.date, taxMonth: run.month,
    memo: pd.redirected ? correctionMemo(run, v, live[0]?.number ?? null) : `Difference v${run.ledgerVersion} to v${v.no}. ${memoFor(run, v)}`,
    reference: pd.redirected ? monthLabel(run.month) : null, correction: pd.redirected,
    lines, snapshotId: currentSnapshotId(), reversesId: null, fmConfirmedBy: null, accrualId: null, paymentId: null,
  })
  afterFix(run, oldV, v, [j])
  return { ok: true, journals: [j.number], journalId: j.id, redirected: pd.redirected }
}
export function dismissWarning(runId: string, warningId: string, reason: string, pick: 'Cost stays (accepted)' | 'Post tag reclass'): Result {
  if (!can('warning.dismiss')) return denied()
  const w = runById(runId)?.warnings.find((x) => x.id === warningId)
  if (!w) return { ok: false }
  if (reason.trim().length < 10) return { ok: false, message: 'Give a reason of 10 characters or more.' }
  w.dismissed = { reason: reason.trim(), pick, by: actingPerson(), at: now() }
  return { ok: true }
}

// ── PPh 21 amendment tasks (OD-16) ──────────────────────────────────────────

function taxChanges(a: TalentaPayload, b: TalentaPayload) {
  const map = (p: TalentaPayload) => new Map(p.employees.map((e) => [e.employee_id, e]))
  const ma = map(a), mb = map(b)
  const out: { employee_id: string; changes: Partial<Record<TaxField, number>> }[] = []
  for (const id of new Set([...ma.keys(), ...mb.keys()])) {
    const ch: Partial<Record<TaxField, number>> = {}
    for (const f of TAX_FIELDS) { const d = Math.round((mb.get(id)?.[f] ?? 0) - (ma.get(id)?.[f] ?? 0)); if (d) ch[f] = d }
    if (Object.keys(ch).length) out.push({ employee_id: id, changes: ch })
  }
  return out
}
function openAmendmentTask(run: Run, a: RunVersion, b: RunVersion, noLedgerChange: boolean) {
  const employees = taxChanges(a.payload, b.payload)
  const periodChange = employees.reduce((x, e) => x + (e.changes['PPh 21 Benefit'] ?? 0) + (e.changes['PPh 21 Payment'] ?? 0) - (e.changes['Total PPh 21 DTP Received'] ?? 0), 0)
  const open = payroll.tasks.find((t) => t.taxMonth === run.month && t.status === 'Open')
  if (open) { Object.assign(open, { toVersion: b.no, employees, periodChange, noLedgerChange }); return }
  payroll.tasks.push({ id: nextId('task'), taxMonth: run.month, runId: run.id, fromVersion: a.no, toVersion: b.no, employees, periodChange, noLedgerChange, status: 'Open', pembetulanNo: null, newTotal: null, reason: null, openedAt: payroll.clock, closedBy: null })
  notify(['Tax Staff'], `Amend e-Bupot 21/26 for ${monthLabel(run.month)}: ${employees.length} staff changed, period total change ${rupiah(periodChange)}`, '/payroll-reconciliation?tab=pph21')
}
export const amendmentTasks = computed(() => payroll.tasks.map((t) => {
  const pph = pph21Monthly(t.taxMonth)
  const regular = pph.rows.find((r) => r.key === 'regular')!
  const paid = paidFor(payroll.settings.taxPresets.pph21, t.taxMonth)
  const gap = regular.expected - paid
  return { ...t, title: `Amend e-Bupot 21/26 for ${monthLabel(t.taxMonth)}`, summary: `${t.employees.length} staff changed, period total change ${rupiah(t.periodChange)}`, depositGap: gap > 0 ? `Deposit ${rupiah(gap)} more` : gap < 0 ? `Overpaid ${rupiah(-gap)}` : 'Deposit matches' }
}))
export function closeAmendmentTask(id: string, outcome: 'Amended' | 'Not filed yet' | 'Dismissed', o: { pembetulanNo?: string; newTotal?: number; reason?: string } = {}): Result {
  if (!can('task.close')) return denied()
  const t = payroll.tasks.find((x) => x.id === id)
  if (!t || t.status !== 'Open') return { ok: false }
  if (outcome === 'Amended' && (!o.pembetulanNo?.trim() || o.newTotal == null)) return { ok: false, message: `Enter the pembetulan number and the new ${monthLabel(t.taxMonth)} PPh 21 total.` }
  if (outcome === 'Dismissed' && (o.reason ?? '').trim().length < 10) return { ok: false, message: 'Give a reason of 10 characters or more.' }
  Object.assign(t, { status: outcome, pembetulanNo: o.pembetulanNo ?? null, newTotal: o.newTotal ?? null, reason: o.reason ?? null, closedBy: actingPerson() })
  return { ok: true }
}

// ── Employee events and early warnings (OD-14) ──────────────────────────────

export function receiveEmployeeEvent(ev: { type: EmployeeEventType; employee_id: string; effective: string | null; to?: GroupFields | null; employee?: Partial<RosterEmployee> }): SendResult {
  now()
  const r = payroll.roster.find((x) => x.employee_id === ev.employee_id)
  if (!ev.effective && ev.type !== 'talenta.employee.detail.deleted') {
    addLog({ type: 'Employee event', status: 'Recorded', reason: 'Ignored: no effective date', nextStep: 'Nothing to do.' })
    return { ok: false, status: 'Recorded', message: 'Ignored: no effective date' }
  }
  const from = r ? { organization_name: r.organization_name, branch_name: r.branch_name, cost_center_name: r.cost_center_name } : null
  const fromAsOf = r && ev.effective ? groupsAsOfRoster(r, addDays(ev.effective, -1)) : from
  const event: PayrollEvent = { id: nextId('ev'), type: ev.type, employee_id: ev.employee_id, effective: ev.effective, from: fromAsOf, to: ev.to ?? null, receivedAt: payroll.clock }
  if (ev.type === 'talenta.employee.detail.created') {
    if (!r) payroll.roster.push({ employee_id: ev.employee_id, organization_name: ev.to?.organization_name ?? '', branch_name: ev.to?.branch_name ?? '', cost_center_name: ev.to?.cost_center_name ?? '', job_position: 'Account Executive', job_level: 'Staff', grade: 'G2', employment_status: 'Probation', business_unit: 'B2B Beans', basic: 8_800_000, expat: false, joined: ev.effective!, left: null, deleted: false, transfers: [], ...ev.employee })
    event.from = null
    for (const [f, val] of [['organization_name', ev.to?.organization_name], ['branch_name', ev.to?.branch_name]] as const) if (val && !payroll.settings.knownValues[f]?.includes(val)) acceptValue(f, val)
  } else if (r && ev.type === 'talenta.employee.transfer.approved' && ev.to) r.transfers.push({ effective: ev.effective!, to: ev.to })
  else if (r && ev.type === 'talenta.employee.resignation.created') r.left = ev.effective
  else if (r && ev.type === 'talenta.employee.detail.deleted') r.deleted = true
  payroll.events.push(event)
  // Early warning on a posted run whose period holds the effective date.
  let warned: Run | undefined
  if ((ev.type === 'talenta.employee.transfer.approved' || ev.type === 'talenta.employee.resignation.created') && ev.effective) {
    warned = payroll.runs.find((x) => x.kind === 'Regular' && liveJournals(x.id).length && ev.effective! >= x.start && ev.effective! <= x.end)
    if (warned) {
      const what = ev.type === 'talenta.employee.transfer.approved' ? 'Transfer' : 'Resignation'
      warned.warnings.push({ id: nextId('w'), eventId: event.id, type: ev.type, employee_id: ev.employee_id, effective: ev.effective, from: event.from, to: event.to, text: `The run may change. Ask HR to re-send if Talenta recalculated payroll. ${what} of ${ev.employee_id}, effective ${dateLabel(ev.effective)}.`, dismissed: null })
      notify(['Accountant'], `${what} of ${ev.employee_id} is dated in posted payroll ${periodLabel(warned.start, warned.end)}.`, `/payroll-runs/${warned.id}`)
    }
  }
  addLog({ type: 'Employee event', status: 'Recorded', reason: `${ev.type.replace('talenta.employee.', '')}: ${ev.employee_id}${ev.effective ? `, effective ${dateLabel(ev.effective)}` : ''}`, nextStep: warned ? 'Check the early warning on the posted run.' : 'Headcount uses this event.', runId: warned?.id ?? null, runKey: warned?.key ?? null })
  return { ok: true, status: 'Recorded', runId: warned?.id }
}
function groupsAsOfRoster(e: RosterEmployee, date: string): GroupFields {
  let g: GroupFields = { organization_name: e.organization_name, branch_name: e.branch_name, cost_center_name: e.cost_center_name }
  for (const t of [...e.transfers].sort((a, b) => a.effective.localeCompare(b.effective))) if (t.effective <= date) g = { ...t.to }
  return g
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
    else if (c.mode === 'Block') { outcome = 'Blocked'; message = `Payroll from ${monthLabel(c.firstLive)} posts from Talenta runs. The old sync was blocked.` }
    else { outcome = 'Flagged'; message = 'Flag mode: the old sync posted and is flagged for review.' }
  }
  payroll.oldSync.push({ id: nextId('os'), date: o.date, amount: o.amount, pattern: o.pattern, outcome, message, at: payroll.clock })
  addLog({ type: 'Old sync', status: outcome === 'Blocked' ? 'Blocked' : 'Recorded', reason: message, nextStep: outcome === 'Blocked' ? 'Nothing posts. Payroll comes from the Talenta run.' : 'Nothing to do.' })
  return { ok: outcome !== 'Blocked', status: outcome === 'Blocked' ? 'Blocked' : 'Recorded', message }
}

// ── Simulated Talenta sends ─────────────────────────────────────────────────

export type SendKind = 'regular' | 'new-pay-item' | 'revision' | 'partial' | 'separate-run' | 'duplicate' | 'transfer' | 'resignation' | 'created' | 'deleted' | 'old-sync'
export const SEND_KINDS: { kind: SendKind; label: string }[] = [
  { kind: 'regular', label: 'Regular run, next period' },
  { kind: 'new-pay-item', label: 'Run with a new pay item' },
  { kind: 'revision', label: 'Revision of the last posted run' },
  { kind: 'partial', label: 'Partial re-send' },
  { kind: 'separate-run', label: 'THR run for a posted period' },
  { kind: 'duplicate', label: 'Byte-identical duplicate' },
  { kind: 'transfer', label: 'Employee transfer' },
  { kind: 'resignation', label: 'Employee resignation' },
  { kind: 'created', label: 'New employee' },
  { kind: 'deleted', label: 'Employee deleted' },
  { kind: 'old-sync', label: 'Old-sync Expense call' },
]
export interface SimOptions extends Partial<PayloadOptions> {
  runId?: string
  start?: string
  end?: string
  employeeId?: string
  effective?: string
  to?: GroupFields
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
  const SIM_KEYS: (keyof PayloadOptions)[] = ['newAllowance', 'raise', 'onlyBranch', 'thr', 'gaps', 'taxOff', 'duplicateEmployee', 'taxShift']
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
      if (open) return send(open.start, open.end, { newAllowance: o.newAllowance ?? { name: 'Tunjangan Transport', amount: 600_000 } })
      const p = nextPeriod()
      return send(p.start, p.end, { newAllowance: o.newAllowance ?? { name: 'Insentif Penjualan', organization: 'Sales', amount: 1_500_000 } })
    }
    case 'revision': {
      const r = lastPosted()
      if (!r) return { ok: false, status: 'Failed', message: 'No posted run to revise.' }
      return send(r.start, r.end, { ...saved(r), raise: o.raise ?? { organization: 'Human Capital', amount: 500_000 } })
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
      return receiveSalaryDetail(clone(last.payload))
    }
    case 'transfer': {
      const r = lastPosted()
      const id = o.employeeId ?? 'EMP-0012'
      const eff = o.effective ?? (r ? addDays(r.start, 25) : today())
      return receiveEmployeeEvent({ type: 'talenta.employee.transfer.approved', employee_id: id, effective: eff, to: o.to ?? { organization_name: 'Operations', branch_name: 'Surabaya', cost_center_name: 'Store Surabaya Tunjungan' } })
    }
    case 'resignation': {
      const r = lastPosted()
      return receiveEmployeeEvent({ type: 'talenta.employee.resignation.created', employee_id: o.employeeId ?? 'EMP-0036', effective: o.effective ?? (r ? addDays(r.end, -5) : today()) })
    }
    case 'created': {
      const n = payroll.roster.length + 1
      return receiveEmployeeEvent({ type: 'talenta.employee.detail.created', employee_id: o.employeeId ?? `EMP-${String(n).padStart(4, '0')}`, effective: o.effective ?? addDays(nextPeriod().start, 0), to: o.to ?? { organization_name: 'Sales', branch_name: 'Surabaya', cost_center_name: 'Regional Sales' } })
    }
    case 'deleted': return receiveEmployeeEvent({ type: 'talenta.employee.detail.deleted', employee_id: o.employeeId ?? payroll.roster[payroll.roster.length - 1]!.employee_id, effective: o.effective ?? today() })
    case 'old-sync': {
      const r = regularRuns().filter((x) => liveJournals(x.id).length).pop()
      return oldSyncExpense({ date: o.date ?? (r ? r.end : today()), amount: o.amount ?? 480_000_000, pattern: o.pattern ?? 'Payroll' })
    }
  }
}

// ── Payables (FG-5) ─────────────────────────────────────────────────────────

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
function owedFor(account: string, month: string, runId?: string): number {
  return payroll.journals.filter((j) => j.taxMonth === month && (!runId || j.runId === runId) && ['Payroll', 'Difference', 'Reversal'].includes(j.type))
    .flatMap((j) => j.lines).filter((l) => l.account === account).reduce((x, l) => x + l.credit - l.debit, 0)
}
function paidFor(account: string, month: string, runId?: string): number {
  return payroll.payments.filter((p) => !p.voidedBy && p.account === account && (!runId || p.runId === runId))
    .flatMap((p) => p.periods).filter((x) => x.month === month).reduce((s, x) => s + x.amount, 0)
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY)
export interface PayableRow { key: string; account: string; party: PayableParty; month: string; runId: string | null; label: string; owed: number; paid: number; balance: number; due: string | null; dueLabel: string; overdueDays: number; paidLateDays: number; status: string; latestTalenta: number | null }
export function payablesTracker(month?: string): PayableRow[] {
  const rows: PayableRow[] = []
  const t = today()
  const months = [...new Set(payroll.journals.filter((j) => ['Payroll', 'Difference', 'Reversal'].includes(j.type)).map((j) => j.taxMonth))].filter((m) => !month || m === month).sort().reverse()
  const mk = (account: string, party: PayableParty, m: string, run: Run | null, label: string): PayableRow => {
    const owed = owedFor(account, m, run?.id), paid = paidFor(account, m, run?.id)
    const due = run ? salaryDue(run) : PARTY_DUE[party](m)
    const balance = owed - paid
    const lastPay = payroll.payments.filter((p) => !p.voidedBy && p.account === account && p.periods.some((x) => x.month === m) && (!run || p.runId === run.id)).map((p) => p.date).sort().pop()
    const overdueDays = due && balance > 0 && t > due ? daysBetween(due, t) : 0
    const paidLateDays = due && balance <= 0 && lastPay && lastPay > due ? daysBetween(due, lastPay) : 0
    const status = balance < 0 ? `Overpaid ${rupiah(-balance)}` : overdueDays ? `Overdue ${overdueDays} day${overdueDays > 1 ? 's' : ''}` : balance === 0 && paidLateDays ? `Paid late, ${paidLateDays} day${paidLateDays > 1 ? 's' : ''}` : balance === 0 ? 'Paid' : 'Open'
    let latestTalenta: number | null = null
    if (run && run.revised) { const v = currentVersionOf(run); latestTalenta = v?.draft ? v.draft.lines.filter((l) => l.account === account).reduce((x, l) => x + l.credit - l.debit, 0) : null }
    return { key: `${account}|${m}|${run?.id ?? ''}`, account, party, month: m, runId: run?.id ?? null, label, owed, paid, balance, due, dueLabel: due ? dateLabel(due) : 'Not set', overdueDays, paidLateDays, status, latestTalenta }
  }
  for (const m of months) {
    for (const run of payroll.runs.filter((r) => r.month === m && journalsOf(r.id).length)) rows.push(mk(payroll.settings.hutangGaji, 'Staff', m, run, `Salary ${run.kind === 'Regular' ? '' : run.label + ' '}${periodLabel(run.start, run.end)}`))
    const payables = payroll.accounts.filter((a) => a.party && a.party !== 'Staff' && a.code !== payroll.settings.suspenseAccount)
    for (const a of payables) {
      const owed = owedFor(a.code, m), paid = paidFor(a.code, m)
      if (!owed && !paid) continue
      rows.push(mk(a.code, a.party!, m, null, `${a.name} ${monthLabel(m)}`))
    }
  }
  return rows
}
function journalForPayment(p: Omit<Payment, 'id' | 'journalId'>, memo: string): Journal {
  const lines: JournalLine[] = []
  if (p.kind === 'Salary' && p.splits.length) {
    for (const s of p.splits) {
      lines.push({ account: p.account, tags: { Organization: null, Branch: payroll.settings.groupMaps.Branch[s.branch] ?? null }, debit: s.amount, credit: 0, why: [`Salary for ${s.branch}`], sources: [] })
      lines.push({ account: s.bank, tags: NO_TAGS, debit: 0, credit: s.amount, why: [`Bank for ${s.branch}`], sources: [] })
    }
  } else {
    for (const x of p.periods) lines.push({ account: p.account, tags: NO_TAGS, debit: x.amount, credit: 0, why: [`${p.party} ${monthLabel(x.month)}${x.billingCode ? `, billing code ${x.billingCode}` : ''}${x.ntpn ? `, NTPN ${x.ntpn}` : ''}`], sources: [] })
    lines.push({ account: p.bank, tags: NO_TAGS, debit: 0, credit: p.amount, why: ['Bank'], sources: [] })
  }
  return addJournal({ number: nextBnkNo(), type: p.kind === 'Salary' ? 'Salary payment' : 'Statutory payment', runId: p.runId, versionNo: null, date: p.date, taxMonth: p.periods[0]!.month, memo, reference: memo, correction: false, lines, snapshotId: null, reversesId: null, fmConfirmedBy: null, accrualId: null, paymentId: null })
}
export function recordSalaryPayment(runId: string, o: { bank: string; date: string; amount?: number; splits?: { branch: string; bank: string }[] }): Result {
  if (!can('payment.salary')) return denied()
  const run = runById(runId)
  if (!run || !liveJournals(run.id).length) return { ok: false, message: 'Salary payments work on posted runs only.' }
  if (o.date < run.start) return { ok: false, message: 'The payment date is before the period start.' }
  if (isLocked(monthOf(o.date))) return { ok: false, message: `${monthLabel(monthOf(o.date))} is locked.` }
  const hg = payroll.settings.hutangGaji
  const open = owedFor(hg, run.month, run.id) - paidFor(hg, run.month, run.id)
  const v = versionOf(run, run.ledgerVersion)!
  const staff = staffOf(v.payload)
  let splits: Payment['splits'] = []
  let amount = o.amount ?? open
  if (o.splits?.length) {
    const byBranch = new Map<string, number>()
    for (const e of staff) byBranch.set(e.branch_name || 'No branch', (byBranch.get(e.branch_name || 'No branch') ?? 0) + cents(e.take_home_pay))
    for (const [branch, c] of byBranch) {
      const bank = o.splits.find((s) => s.branch === branch)?.bank
      if (!bank) return { ok: false, message: `Pick a bank for ${branch}.` }
      splits.push({ branch, bank, amount: roundCents(c) })
    }
    const total = splits.reduce((x, s) => x + s.amount, 0)
    if (total !== open) splits[splits.length - 1]!.amount += open - total
    amount = open
  }
  if (amount <= 0) return { ok: false, message: 'Nothing left to pay on this run.' }
  const thp = roundCents(staff.reduce((x, e) => x + cents(e.take_home_pay), 0))
  const differs = amount - thp
  now()
  const memo = `Payroll ${periodLabel(run.start, run.end)} v${run.ledgerVersion}`
  const base = { kind: 'Salary' as const, party: 'Staff' as const, account: hg, runId, bank: o.bank, date: o.date, periods: [{ month: run.month, amount, billingCode: null, ntpn: null }], splits, amount, bankDiffers: Math.abs(differs) > 0 && amount >= open ? differs : 0, warnings: [] as string[], voidedBy: null }
  if (base.bankDiffers) base.warnings.push(`Bank paid differs from the posted run by ${rupiah(Math.abs(differs))}. Ask HR whether payroll changed.`)
  const j = journalForPayment(base, memo)
  const p: Payment = { ...base, id: nextId('pay'), journalId: j.id }
  j.paymentId = p.id
  payroll.payments.push(p)
  addLog({ type: 'Payment', status: 'Recorded', reason: `${memo} paid ${rupiah(amount)} (${j.number})`, nextStep: 'Match it in bank reconciliation.', runId, runKey: run.key, journalNo: j.number })
  markReconOutOfDate(run.month)
  return { ok: true, paymentId: p.id, number: j.number, warnings: p.warnings }
}
export function payStatutory(o: { party: Exclude<PayableParty, 'Staff'>; bank: string; date: string; periods: { month: string; amount?: number; billingCode?: string; ntpn?: string }[]; differenceAccount?: string; account?: string }): Result {
  if (!can('payment.statutory')) return denied()
  if (!o.periods.length) return { ok: false, message: 'Pick a period.' }
  const account = o.account ?? payroll.accounts.find((a) => a.party === o.party && a.code !== payroll.settings.suspenseAccount && a.code !== payroll.settings.taxPresets.resign)?.code
  if (!account) return { ok: false, message: 'No payable for this party.' }
  if (isLocked(monthOf(o.date))) return { ok: false, message: `${monthLabel(monthOf(o.date))} is locked.` }
  if (o.periods.length > 1 && o.periods.some((x) => x.amount == null)) return { ok: false, message: 'Type an amount and a billing code for each period.' }
  const warnings: string[] = []
  const periods: PaymentPeriodLine[] = []
  for (const x of o.periods) {
    if (o.date < `${x.month}-01`) return { ok: false, message: 'The payment date is before the period start.' }
    const open = owedFor(account, x.month) - paidFor(account, x.month)
    const amount = x.amount ?? open
    if (amount > open && !o.differenceAccount) return { ok: false, message: `${rupiah(amount - open)} is more than the open balance. Pick a difference account.` }
    if (x.billingCode && !/^\d{15}$/.test(x.billingCode)) warnings.push('A billing code has 15 digits.')
    if (x.ntpn && x.ntpn.length !== 16) warnings.push('An NTPN has 16 characters.')
    periods.push({ month: x.month, amount: Math.min(amount, open), billingCode: x.billingCode ?? null, ntpn: x.ntpn ?? null })
    if (amount > open) periods.push({ month: x.month, amount: 0, billingCode: null, ntpn: null })
  }
  const total = o.periods.reduce((s, x, i) => s + (x.amount ?? periods[i]!.amount), 0)
  now()
  const ref = `${o.party === 'Other' ? accountName(account) : o.party.replace('DJP ', '')} ${o.periods.map((x) => monthLabel(x.month)).join(', ')}`
  const base = { kind: 'Statutory' as const, party: o.party, account, runId: null, bank: o.bank, date: o.date, periods: periods.filter((x) => x.amount), splits: [], amount: total, bankDiffers: 0, warnings, voidedBy: null }
  const j = journalForPayment({ ...base, amount: periods.reduce((s, x) => s + x.amount, 0) }, ref)
  const over = total - periods.reduce((s, x) => s + x.amount, 0)
  if (over > 0 && o.differenceAccount) { j.lines.splice(j.lines.length - 1, 0, { account: o.differenceAccount, tags: NO_TAGS, debit: over, credit: 0, why: ['Over-payment'], sources: [] }); j.lines[j.lines.length - 1]!.credit += over }
  const p: Payment = { ...base, id: nextId('pay'), journalId: j.id }
  j.paymentId = p.id
  payroll.payments.push(p)
  addLog({ type: 'Payment', status: 'Recorded', reason: `${ref} paid ${rupiah(total)} (${j.number})`, nextStep: 'Nothing to do.', journalNo: j.number })
  for (const x of o.periods) markReconOutOfDate(x.month)
  return { ok: true, paymentId: p.id, number: j.number, warnings }
}
export function voidPayment(paymentId: string): Result {
  if (!can('payment.void')) return denied()
  const p = payroll.payments.find((x) => x.id === paymentId)
  if (!p || p.voidedBy) return { ok: false }
  now()
  const j = journalById(p.journalId)!
  const r = reversalOf(j, today(), { type: 'Payment void', number: nextBnkNo(), memo: `Void of ${j.number}` })
  p.voidedBy = r.id
  return { ok: true, number: r.number }
}

// ── BPJS invoice match (OD-21) ──────────────────────────────────────────────

export const BPJS_PROGRAMMES: Record<BpjsBody, BpjsProgramme[]> = { 'BPJS Kesehatan': ['Kesehatan'], 'BPJS Ketenagakerjaan': ['JHT', 'JKK', 'JKM', 'JP'] }
export function bpjsProgrammeOf(m: PayItemMapping): BpjsProgramme | null { return m.programme ?? programmeFromName(m.name) }
export function setBpjsProgramme(key: string, programme: BpjsProgramme | null): Result {
  if (!can('bpjs.programme')) return denied()
  const m = payroll.settings.mapping.find((x) => x.key === key)
  if (!m) return { ok: false }
  m.programme = programme
  return { ok: true }
}
/** Payroll side of the BPJS match: the posted lines by programme for a month. */
export function bpjsPayroll(month: string, body: BpjsBody) {
  const acct = body === 'BPJS Kesehatan' ? ACC.bpjsKes : ACC.bpjsTk
  const out = new Map<string, number>()
  for (const j of payroll.journals.filter((x) => x.taxMonth === month && ['Payroll', 'Difference', 'Reversal'].includes(x.type))) {
    for (const l of j.lines.filter((x) => x.account === acct)) for (const s of l.sources) {
      const m = mappingFor(s.item, s.section as PaySection)
      const prog = m ? bpjsProgrammeOf(m) ?? 'Unassigned' : 'Unassigned'
      out.set(prog, (out.get(prog) ?? 0) - s.cents)
    }
  }
  return [...BPJS_PROGRAMMES[body], ...(out.has('Unassigned') ? ['Unassigned'] : [])].map((p) => ({ programme: p, amount: roundCents(out.get(p) ?? 0) }))
}
export function saveBpjsInvoice(month: string, body: BpjsBody, lines: { programme: BpjsProgramme; amount: number; headcount: number }[]): Result {
  if (!can('bpjs.invoice')) return denied()
  const ex = payroll.bpjsInvoices.find((x) => x.month === month && x.body === body)
  if (ex) Object.assign(ex, { lines, reviewed: null })
  else payroll.bpjsInvoices.push({ month, body, lines, reviewed: null, notes: {}, reviewedFingerprint: null })
  return { ok: true }
}
export function bpjsComparison(month: string, body: BpjsBody) {
  const inv = payroll.bpjsInvoices.find((x) => x.month === month && x.body === body)
  const rows = bpjsPayroll(month, body).map((r) => {
    const i = inv?.lines.find((l) => l.programme === r.programme)
    return { programme: r.programme, payroll: r.amount, invoice: i?.amount ?? null, headcount: i?.headcount ?? null, difference: i ? i.amount - r.amount : null, note: inv?.notes[r.programme as BpjsProgramme] ?? null }
  })
  const fp = hash(JSON.stringify(rows.map((r) => r.payroll)))
  return { invoice: inv ?? null, rows, status: !inv ? 'No invoice' : inv.reviewed ? (inv.reviewedFingerprint === fp ? 'Reviewed' : 'Changed since review') : 'Not reviewed' }
}
export function markBpjsReviewed(month: string, body: BpjsBody, notes: Partial<Record<BpjsProgramme, string>> = {}): Result {
  if (!can('bpjs.review')) return denied()
  const inv = payroll.bpjsInvoices.find((x) => x.month === month && x.body === body)
  if (!inv) return { ok: false, message: 'Enter the invoice first.' }
  Object.assign(inv.notes, notes)
  const cmp = bpjsComparison(month, body)
  const missing = cmp.rows.find((r) => r.difference && !inv.notes[r.programme as BpjsProgramme]?.trim())
  if (missing) return { ok: false, message: `${missing.programme} difference ${rupiah(missing.difference!)} needs a note.`, programme: missing.programme }
  inv.reviewed = { by: actingPerson(), at: now() }
  inv.reviewedFingerprint = hash(JSON.stringify(cmp.rows.map((r) => r.payroll)))
  return { ok: true }
}

// ── Reconciliation (FG-6) ───────────────────────────────────────────────────

function reconOf(month: string): MonthRecon {
  let r = payroll.recon.find((x) => x.month === month)
  if (!r) { r = { month, notes: {}, checkNotes: {}, readyBy: null, signOff: null, ebupotFiled: null, pph21Note: null, pph21Reconciled: null }; payroll.recon.push(r) }
  return r
}
function latestAccepted(run: Run): RunVersion | undefined { return [...run.versions].reverse().find((v) => v.state !== 'rejected' && v.state !== 'moved' && v.state !== 'partial') }
function monthRuns(month: string) { return payroll.runs.filter((r) => r.month === month && r.mode === 'Live') }
function payrollJournalsOf(month: string) { return payroll.journals.filter((j) => j.taxMonth === month && ['Payroll', 'Difference', 'Reversal'].includes(j.type)) }
function fingerprint(month: string) {
  return hash(JSON.stringify({ v: monthRuns(month).map((r) => [r.id, latestAccepted(r)?.no]), j: payrollJournalsOf(month).map((j) => j.number), p: payroll.payments.filter((p) => p.periods.some((x) => x.month === month)).map((p) => [p.id, p.voidedBy]) }))
}
/** Sign-off status is computed from a fingerprint of versions, journals and payments, so a later change reads "Out of date" on its own. */
function markReconOutOfDate(month: string) {
  const r = payroll.recon.find((x) => x.month === month)
  if (r?.signOff && r.signOff.fingerprint !== fingerprint(month) && !seeding) notify(['Accountant', 'Finance Manager'], `Payroll reconciliation ${monthLabel(month)} is out of date.`, `/payroll-reconciliation?month=${month}`)
}
export function reconciliation(month: string) {
  const runsM = monthRuns(month)
  const talenta: JournalLine[] = []
  const reconciling: { label: string; amount: number }[] = []
  for (const r of runsM) {
    const v = latestAccepted(r)
    if (!v) continue
    talenta.push(...buildJournal(r, v, payroll.settings).draft.lines)
    const st = runStatus(r)
    if (st !== 'Posted') reconciling.push({ label: `${r.kind === 'Regular' ? 'Payroll' : r.label} ${periodLabel(r.start, r.end)} v${v.no}: ${st}`, amount: roundCents(staffOf(v.payload).reduce((x, e) => x + cents(e.take_home_pay), 0)) })
  }
  const jl = payrollJournalsOf(month)
  for (const j of payroll.journals.filter((x) => x.correction && x.taxMonth === month && monthOf(x.date) !== month)) reconciling.push({ label: `Posted in ${monthLabel(monthOf(j.date))}: ${j.number}`, amount: journalTotals(j).debit })
  const ledger = jl.flatMap((j) => j.lines)
  const rec = reconOf(month)
  const rows: ReturnType<typeof diffLineSets> = []
  const tm = netMap(talenta), lm = netMap(ledger)
  for (const k of new Set([...tm.keys(), ...lm.keys()])) {
    const x = (tm.get(k) ?? lm.get(k))!
    rows.push({ key: k, account: x.account, tags: x.tags, old: tm.get(k)?.amount ?? 0, new: lm.get(k)?.amount ?? 0, diff: (lm.get(k)?.amount ?? 0) - (tm.get(k)?.amount ?? 0) })
  }
  const shape = (r: (typeof rows)[number]) => ({ key: r.key, account: r.account, label: `${accountLabel(r.account)}${tagsLabel(r.tags) ? ` | ${tagsLabel(r.tags)}` : ''}`, talenta: Math.abs(r.old), ledger: Math.abs(r.new), variance: Math.abs(r.new) - Math.abs(r.old), rounding: r.account === payroll.settings.roundingAccount, note: rec.notes[r.key] ?? null })
  const accountRows = rows.filter((r) => isCost(r.account)).map(shape).sort((a, b) => a.label.localeCompare(b.label))
  const payableRows = rows.filter((r) => !isCost(r.account)).map(shape).sort((a, b) => a.label.localeCompare(b.label))
  // By pay item: Talenta raw amounts vs ledger sources.
  const raw = new Map<string, number>(), led = new Map<string, number>()
  for (const r of runsM) { const v = latestAccepted(r); if (v) for (const e of staffOf(v.payload)) for (const [section, list] of [['allowance', e.allowances], ['deduction', e.deductions], ['benefit', e.benefits]] as const) for (const it of list) raw.set(`${it.name}|${section}`, (raw.get(`${it.name}|${section}`) ?? 0) + cents(it.amount)) }
  for (const l of ledger) for (const s of l.sources) if (s.side === 'D' || (s.side === 'C' && s.cents > 0)) if (s.section !== 'preset' && s.section !== 'gap' && s.section !== 'rounding') led.set(`${s.item}|${s.section}`, (led.get(`${s.item}|${s.section}`) ?? 0) + (s.side === 'D' ? s.cents : -s.cents))
  const payItemRows = [...new Set([...raw.keys(), ...led.keys()])].map((k) => { const [name, section] = k.split('|'); const t = roundCents(raw.get(k) ?? 0), l = roundCents(led.get(k) ?? 0); return { key: `item:${k}`, name: name!, section: section!, talenta: t, ledger: l, variance: l - t, note: rec.notes[`item:${k}`] ?? null } })
  const unexplained = [...accountRows, ...payableRows, ...payItemRows].filter((r) => r.variance !== 0 && !('rounding' in r && r.rounding) && !r.note)
  const fp = fingerprint(month)
  const status = rec.signOff ? (rec.signOff.fingerprint === fp ? 'Signed off' : 'Out of date') : rec.readyBy && !unexplained.length ? 'Ready for sign-off' : 'Open'
  const warning = !runsM.length && !jl.length ? `No payroll runs for ${monthLabel(month)}. Check the payroll inbox or ask HR to send the run.` : null
  return { month, accountRows, payableRows, payItemRows, reconciling, unexplained: unexplained.length, status, signOff: rec.signOff, readyBy: rec.readyBy, warning, checks: independentChecks(month) }
}
/** TN-04: five checks that skip the mapping, so a wrong account shows even when the main report reads Rp0. */
export function independentChecks(month: string) {
  const runsM = monthRuns(month)
  const rec = reconOf(month)
  const staffAll = runsM.flatMap((r) => { const v = versionOf(r, r.ledgerVersion) ?? latestAccepted(r); return v ? staffOf(v.payload) : [] })
  const jl = payrollJournalsOf(month)
  const net = (pred: (l: JournalLine) => boolean, sign = 1) => jl.flatMap((j) => j.lines).filter(pred).reduce((x, l) => x + sign * (l.credit - l.debit), 0)
  const sumC = (f: (e: TalentaEmployee) => number) => roundCents(staffAll.reduce((x, e) => x + cents(f(e)), 0))
  const thp = sumC((e) => e.take_home_pay)
  const p = payroll.settings.taxPresets
  const inv = payroll.bpjsInvoices.filter((x) => x.month === month)
  const bpjsLedger = net((l) => l.account === ACC.bpjsKes || l.account === ACC.bpjsTk)
  const salaryPaid = payroll.payments.filter((x) => !x.voidedBy && x.kind === 'Salary' && x.periods.some((y) => y.month === month)).reduce((s, x) => s + x.amount, 0)
  const employer = sumC((e) => e.deductions.filter((d) => /paid by company/i.test(d.name)).reduce((s, d) => s + d.amount, 0))
  const raw = sumC((e) => e.total_allowances - e['Total PPh 21 DTP Received'] + e.total_benefits) + employer
  const expense = -net((l) => isCost(l.account) && l.account !== payroll.settings.roundingAccount)
  const mk = (id: string, label: string, a: number | null, b: number | null, aLabel: string, bLabel: string) => {
    const diff = a == null || b == null ? null : b - a
    const note = rec.checkNotes[id] ?? null
    return { id, label, source: a, ledger: b, sourceLabel: aLabel, ledgerLabel: bLabel, difference: diff, status: diff == null ? 'No data' : Math.abs(diff) <= 1_000 ? 'Matches' : note ? 'Explained' : 'Off', note }
  }
  return [
    mk('thp', 'Take-home pay vs Hutang Gaji credit', runsM.length ? thp : null, jl.length ? net((l) => l.account === payroll.settings.hutangGaji) : null, 'Talenta take-home pay', 'Hutang Gaji credit'),
    mk('pph21', 'PPh 21 in the sends vs PPh 21 payable', runsM.length ? sumC((e) => e['PPh 21 Benefit'] + e['PPh 21 Payment'] - e['Total PPh 21 DTP Received']) : null, jl.length ? net((l) => l.account === p.pph21) : null, 'PPh 21 Benefit + Payment - DTP', 'Hutang PPh 21'),
    mk('bpjs', 'BPJS invoice vs BPJS payables', inv.length ? inv.flatMap((x) => x.lines).reduce((s, l) => s + l.amount, 0) : null, jl.length ? bpjsLedger : null, 'BPJS invoices', 'BPJS payables'),
    mk('bank', 'Bank salary paid vs take-home pay', runsM.length ? thp : null, salaryPaid || null, 'Talenta take-home pay', 'Salary paid from bank'),
    mk('expense', 'Payroll expense vs allowances, benefits and employer contributions', runsM.length ? raw : null, jl.length ? expense : null, 'Allowances + benefits + employer contributions', 'Payroll expense debits'),
  ]
}
export function setVarianceNote(month: string, rowKey: string, o: { reason: string; note: string }): Result {
  if (!can('recon.note')) return denied()
  if (o.note.trim().length < 5 || o.note.trim().length > 500) return { ok: false, message: 'Write a note of 5 to 500 characters.' }
  reconOf(month).notes[rowKey] = { reason: o.reason, note: o.note.trim(), by: actingPerson(), at: now() }
  return { ok: true }
}
export function setCheckNote(month: string, checkId: string, note: string): Result {
  if (!can('recon.note') && !can('recon.signoff')) return denied()
  if (note.trim().length < 5) return { ok: false, message: 'Write a note of 5 characters or more.' }
  reconOf(month).checkNotes[checkId] = { note: note.trim(), by: actingPerson(), at: now() }
  return { ok: true }
}
export function markReadyForSignOff(month: string): Result {
  if (!can('recon.ready')) return denied()
  const r = reconciliation(month)
  if (r.unexplained) return { ok: false, message: `${r.unexplained} row${r.unexplained > 1 ? 's need' : ' needs'} a reason and a note.` }
  reconOf(month).readyBy = actingPerson()
  return { ok: true }
}
export function signOffMonth(month: string, o: { hrConfirmed: boolean }): Result {
  if (!can('recon.signoff')) return denied()
  if (!o.hrConfirmed) return { ok: false, message: 'Tick "HR confirmed no payroll changes after the last send".' }
  const r = reconciliation(month)
  if (r.status !== 'Ready for sign-off' && r.status !== 'Out of date') return { ok: false, message: 'The Accountant sets the month Ready for sign-off first.' }
  const off = r.checks.find((c) => c.status === 'Off')
  if (off) return { ok: false, message: `${off.label} is off by ${rupiah(Math.abs(off.difference ?? 0))} with no confirmed note.` }
  const reversed = monthRuns(month).find((x) => runStatus(x) === 'Reversed')
  if (reversed) return { ok: false, message: `Reversed, not reposted: ${periodLabel(reversed.start, reversed.end)}.` }
  const prev = payroll.accruals.find((a) => a.month < month && !a.reversalJournalId && monthRuns(month).some((x) => x.start === a.nextRunStart && liveJournals(x.id).length))
  if (prev) return { ok: false, message: `${MON[Number(prev.month.slice(5)) - 1]} accrual ${rupiah(journalTotals(journalById(prev.journalId)!).debit)} not reversed.` }
  const open = monthRuns(month).filter((x) => ['Received', 'Held', 'Ready to post', 'Waiting for your choice', 'Revised'].includes(runStatus(x)))
  reconOf(month).signOff = { by: actingPerson(), at: now(), hrConfirmedBy: actingPerson(), fingerprint: fingerprint(month), snapshot: clone({ accountRows: r.accountRows, payableRows: r.payableRows, versions: monthRuns(month).map((x) => ({ run: x.key, version: x.ledgerVersion })), journals: payrollJournalsOf(month).map((j) => j.number) }) }
  return { ok: true, warnings: open.map((x) => `${periodLabel(x.start, x.end)}: ${runStatus(x)}`) }
}
/** LR-10 rows for a tax month: regular, severance, DTP, PPh 26. */
export function pph21Monthly(month: string) {
  const p = payroll.settings.taxPresets
  const staff = monthRuns(month).flatMap((r) => { const v = latestAccepted(r); return v ? staffOf(v.payload) : [] })
  const sumC = (f: (e: TalentaEmployee) => number) => roundCents(staff.reduce((x, e) => x + cents(f(e)), 0))
  const jl = payroll.journals.filter((j) => j.taxMonth === month && ['Payroll', 'Difference', 'Reversal'].includes(j.type))
  const net = (acct: string) => jl.flatMap((j) => j.lines).filter((l) => l.account === acct).reduce((x, l) => x + l.credit - l.debit, 0)
  /** DTP posts a debit and a credit on its own account; the row reads the credit side, net of reversals. */
  const credits = (acct: string) => jl.reduce((x, j) => x + j.lines.filter((l) => l.account === acct).reduce((y, l) => y + (j.type === 'Reversal' ? -l.debit : l.credit), 0), 0)
  const later = payroll.journals.filter((j) => j.taxMonth === month && j.correction && monthOf(j.date) !== month)
  const rows = [
    { key: 'regular', label: 'PPh 21 regular', account: p.pph21, expected: sumC((e) => e['PPh 21 Benefit'] + e['PPh 21 Payment'] - e['Total PPh 21 DTP Received']), ledger: net(p.pph21) },
    { key: 'severance', label: 'PPh 21 severance', account: p.resign, expected: sumC((e) => e['PPh 21 Resign Benefit']), ledger: p.resign === p.pph21 ? 0 : net(p.resign) },
    { key: 'dtp', label: 'PPh 21 DTP', account: p.dtp, expected: sumC((e) => e['Total PPh 21 DTP Received']), ledger: credits(p.dtp), balance: net(p.dtp) },
    { key: 'pph26', label: 'PPh 26', account: p.pph26, expected: sumC((e) => e['PPh 26 Benefit']), ledger: net(p.pph26) },
  ].map((r) => ({ ...r, variance: r.ledger - r.expected }))
  const rec = reconOf(month)
  const regular = rows[0]!
  const filedDiff = rec.ebupotFiled == null ? null : rec.ebupotFiled - regular.ledger
  const filedMessage = filedDiff == null || Math.abs(filedDiff) <= 1_000 ? null : `Filed ${rupiah(Math.abs(filedDiff))} ${filedDiff > 0 ? 'above' : 'below'} ledger. Ask HR to re-send ${monthLabel(month)}.`
  const opening = payroll.journals.filter((j) => j.taxMonth < month).flatMap((j) => j.lines).filter((l) => l.account === p.pph21).reduce((x, l) => x + l.credit - l.debit, 0)
  const paid = payroll.payments.filter((x) => !x.voidedBy && x.account === p.pph21 && x.periods.some((y) => y.month === month)).reduce((s, x) => s + x.periods.filter((y) => y.month === month).reduce((a, y) => a + y.amount, 0), 0)
  const due = `${nextMonthOf(month)}-15`
  return {
    month, rows, ebupotFiled: rec.ebupotFiled, filedMessage, reconciled: rec.pph21Reconciled, note: rec.pph21Note,
    postedLater: later.map((j) => ({ number: j.number, postedIn: monthOf(j.date), amount: j.lines.filter((l) => l.account === p.pph21).reduce((x, l) => x + l.credit - l.debit, 0) })),
    payable: { opening: opening - payroll.payments.filter((x) => !x.voidedBy && x.account === p.pph21 && x.periods.some((y) => y.month < month)).reduce((s, x) => s + x.periods.filter((y) => y.month < month).reduce((a, y) => a + y.amount, 0), 0), credits: regular.ledger, paid, due: dateLabel(due) },
  }
}
export function pph21Annual(year: number) {
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
  const live = payroll.settings.cutover.firstLive
  const rows = months.map((m) => {
    const r = pph21Monthly(m).rows[0]!
    return { month: m, label: monthLabel(m), expected: r.expected, ledger: r.ledger, variance: r.variance, beforeCutover: !!live && m < live }
  })
  const counted = rows.filter((r) => !r.beforeCutover)
  return { year, rows, total: { expected: counted.reduce((s, r) => s + r.expected, 0), ledger: counted.reduce((s, r) => s + r.ledger, 0), variance: counted.reduce((s, r) => s + r.variance, 0) } }
}
export function setEbupotTotal(month: string, amount: number): Result {
  if (!can('ebupot.enter')) return denied()
  reconOf(month).ebupotFiled = Math.round(amount)
  return { ok: true, message: pph21Monthly(month).filedMessage }
}
export function markPph21Reconciled(month: string, note?: string): Result {
  if (!can('pph21.reconcile')) return denied()
  const rec = reconOf(month)
  if (note) rec.pph21Note = note.trim()
  const m = pph21Monthly(month)
  if (rec.ebupotFiled == null) return { ok: false, message: 'Enter the PPh 21 filed in e-Bupot first.' }
  if (m.filedMessage && !rec.pph21Note) return { ok: false, message: m.filedMessage }
  const dtp = m.rows.find((r) => r.key === 'dtp')!
  if ((dtp.balance ?? 0) !== 0 && !rec.pph21Note) return { ok: false, message: 'The PPh 21 DTP balance is not Rp0. Add a note.' }
  const reversed = monthRuns(month).find((x) => runStatus(x) === 'Reversed')
  if (reversed) return { ok: false, message: `Reversed, not reposted: ${periodLabel(reversed.start, reversed.end)}.` }
  rec.pph21Reconciled = { by: actingPerson(), at: now() }
  return { ok: true }
}

// ── Accrual (OD-29) ─────────────────────────────────────────────────────────

/** Estimate: Earning and Employer contribution cost of the last posted regular run, by account and tag, x days after cut-off / days in the base period. */
export function accrualEstimate(month: string) {
  const posted = regularRuns().filter((r) => liveJournals(r.id).length)
  const base = posted.filter((r) => r.end <= lastDayOf(month)).pop()
  const done = accrualFor(month)
  if (!base) return { state: 'waiting' as const, message: 'No regular run is posted yet. The accrual waits.', lines: [], base: null, days: 0, baseDays: 0, total: 0, posted: done }
  if (base.end === lastDayOf(month)) return { state: 'none' as const, message: 'The pay period ends on month end. No accrual is needed.', lines: [], base, days: 0, baseDays: 0, total: 0, posted: done }
  if (monthOf(base.end) !== month) {
    const nextStart = addDays(base.end, 1)
    const waiting = regularRuns().find((r) => r.start === nextStart)
    return { state: 'late' as const, message: `The ${periodLabel(nextStart, waiting?.end ?? `${month}-${base.end.slice(8)}`)} run is not posted yet. The accrual waits until it posts.`, lines: [], base, days: 0, baseDays: 0, total: 0, posted: done }
  }
  const last3 = posted.slice(-3).map((r) => Number(r.end.slice(8)))
  const cutoff = new Set(last3).size === 1 ? last3[0]! : payroll.settings.accrual.cutoffDay
  if (cutoff == null) return { state: 'cutoff' as const, message: 'The last three runs end on different days. The Finance Manager sets a cut-off day.', lines: [], base, days: 0, baseDays: 0, total: 0, posted: done }
  const days = Number(lastDayOf(month).slice(8)) - cutoff
  const baseDays = daysBetween(base.start, base.end) + 1
  const sums = new Map<string, { account: string; tags: Tags; cents: number }>()
  for (const j of liveJournals(base.id)) for (const l of j.lines) {
    if (!isCost(l.account)) continue
    for (const s of l.sources) if (s.side === 'D' && (s.role === 'Earning' || s.role === 'Employer contribution')) {
      const k = `${l.account}#${tagsKey(l.tags)}`
      const x = sums.get(k) ?? { account: l.account, tags: l.tags, cents: 0 }
      x.cents += s.cents; sums.set(k, x)
    }
  }
  const edits = payroll.accrualEdits[month] ?? {}
  const lines = [...sums.entries()].map(([key, x]) => {
    const est = roundCents(Math.round((x.cents * days) / baseDays))
    const ed = edits[key]
    return { key, account: x.account, tags: x.tags, base: roundCents(x.cents), estimate: est, amount: ed?.amount ?? est, reason: ed?.reason ?? null, warn: ed && est ? Math.abs(ed.amount - est) / est > 0.2 : false }
  }).sort((a, b) => a.key.localeCompare(b.key))
  return { state: 'ready' as const, message: null, lines, base, days, baseDays, cutoff, total: lines.reduce((s, l) => s + l.amount, 0), posted: done }
}
export function editAccrualLine(month: string, key: string, amount: number, reason: string): Result {
  if (!can('accrual.edit')) return denied()
  if (reason.trim().length < 5) return { ok: false, message: 'Give a reason.' }
  ;(payroll.accrualEdits[month] ??= {})[key] = { amount: Math.round(amount), reason: reason.trim() }
  return { ok: true }
}
export function resetAccrualLine(month: string, key: string): Result {
  if (!can('accrual.edit')) return denied()
  delete payroll.accrualEdits[month]?.[key]
  return { ok: true }
}
export function accrualFor(month: string): Accrual | undefined { return payroll.accruals.find((a) => a.month === month) }
export function postAccrual(month: string): Result {
  if (!can('accrual.post')) return denied()
  if (accrualFor(month)) return { ok: false, message: `The ${monthLabel(month)} accrual is already posted.` }
  if (isLocked(month)) return { ok: false, message: `${monthLabel(month)} is locked.` }
  const est = accrualEstimate(month)
  if (est.state !== 'ready' || !est.base) return { ok: false, message: est.message ?? 'Nothing to accrue.' }
  if (!est.total) return { ok: false, message: 'Nothing to accrue.' }
  now()
  const acct = payroll.settings.accrual.account
  const lines: JournalLine[] = est.lines.filter((l) => l.amount).map((l) => ({ account: l.account, tags: l.tags, debit: l.amount, credit: 0, why: [`${est.days} of ${est.baseDays} days of ${accountLabel(l.account)} from ${periodLabel(est.base!.start, est.base!.end)}${l.reason ? `. Edited: ${l.reason}` : ''}`], sources: [{ item: 'Accrual', section: 'accrual', role: 'Earning', side: 'D', cents: l.amount * 100, staff: [] }] }))
  lines.push({ account: acct, tags: NO_TAGS, debit: 0, credit: est.total, why: ['Accrued payroll'], sources: [] })
  const nextStart = addDays(est.base.end, 1)
  const nextKey = `${PAYROLL_COMPANY_ID} / monthly / ${nextStart} / ${nextMonthOf(month)}-${est.base.end.slice(8)}`
  const id = nextId('acc')
  const j = addJournal({ type: 'Payroll accrual', runId: null, versionNo: null, date: lastDayOf(month), taxMonth: month, memo: `Payroll accrual ${monthLabel(month)}: ${est.days} of ${est.baseDays} days after cut-off`, reference: nextKey, correction: false, lines, snapshotId: currentSnapshotId(), reversesId: null, fmConfirmedBy: null, accrualId: id, paymentId: null })
  payroll.accruals.push({ id, month, journalId: j.id, baseRunId: est.base.id, nextRunStart: nextStart, nextRunKey: nextKey, reversalJournalId: null, reversedBy: null, log: [`Posted as ${j.number}`] })
  addLog({ type: 'Post', status: 'Posted', reason: `Payroll accrual ${monthLabel(month)} posted as ${j.number}`, nextStep: 'It reverses when the next run posts.', journalNo: j.number })
  return { ok: true, journalId: j.id, number: j.number }
}
/** TN-20: any post of the next run reverses the accrual once, on the run's journal date. */
function reverseAccrualForRun(run: Run, posted: Journal): string | null {
  if (run.kind !== 'Regular') return null
  const a = payroll.accruals.find((x) => x.nextRunStart === run.start)
  if (!a) return null
  if (a.reversalJournalId) {
    const by = journalById(a.reversalJournalId)
    if (a.reversedBy === 'manual' && !a.log.some((l) => l.startsWith('Already reversed'))) a.log.push(`Already reversed by ${by?.number}`)
    return null
  }
  const r = reversalOf(journalById(a.journalId)!, posted.date)
  a.reversalJournalId = r.id; a.reversedBy = 'run'; a.log.push(`Reversed by ${run.label} ${periodLabel(run.start, run.end)} as ${r.number}`)
  return r.number
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
  M('THR Keagamaan', 'allowance', 'THR', ACC.salaries, HG, 'Staff', { addedBy: 'Jurnal', accrue: false })
  M('JHT Employee', 'deduction', 'Employee deduction', HG, ACC.bpjsTk)
  M('JP Employee', 'deduction', 'Employee deduction', HG, ACC.bpjsTk)
  M('BPJSK Employee', 'deduction', 'Employee deduction', HG, ACC.bpjsKes)
  M('PPH 21 Paid', 'deduction', 'Tax', HG, ACC.pph21)
  M('Loan Instalment', 'deduction', 'Loan', HG, ACC.loanReceivable, null)
  M('THR Paid', 'deduction', 'Advance offset', HG, ACC.thrAdvance, null)
  M('BPJS K paid by company', 'deduction', 'Employer contribution', ACC.salaries, ACC.bpjsKes)
  M('JKK paid by company', 'deduction', 'Employer contribution', ACC.salaries, ACC.bpjsTk)
  M('JKM paid by company', 'deduction', 'Employer contribution', ACC.salaries, ACC.bpjsTk)
  M('JHT paid by company', 'deduction', 'Employer contribution', ACC.salaries, ACC.bpjsTk)
  M('JP paid by company', 'deduction', 'Employer contribution', ACC.salaries, ACC.bpjsTk)
  M('DPLK paid by company', 'benefit', 'Employer contribution', ACC.salaries, ACC.dplk)
  for (const t of payroll.tags) if (t.name !== FALLBACK_TAG) s.groupMaps[t.dimension][t.name] = t.name
  for (const c of COST_CENTERS) s.costCenterCategory[c.name] = c.category
  s.rules.push(
    { id: nextId('rule'), name: 'Store staff to direct labour', conditions: [{ field: 'cost_center_category', op: 'is', values: ['Direct'] }], roles: ['Earning', 'Employer contribution'], account: ACC.directLabour, tags: null, active: true },
    { id: nextId('rule'), name: 'Sales team to sales salaries', conditions: [{ field: 'organization_name', op: 'is', values: ['Sales'] }], roles: ['Earning', 'Employer contribution'], account: ACC.salesSalaries, tags: null, active: true },
  )
  for (const e of payroll.roster) {
    acceptValue('cost_center_name', e.cost_center_name); acceptValue('job_level', e.job_level); acceptValue('custom:BusinessUnit', e.business_unit)
  }
}

function seed() {
  seeding = true
  Object.assign(payroll, emptyState())
  payroll.roster = sampleRoster()
  setClock('2026-06-01T02:00:00Z')
  as('Jurnal Owner', () => { must(startConnection(PAYROLL_COMPANY_ID), 'start'); answerOtherEntities(false) })
  seedSettings()
  takeSnapshot('Payroll setup: accounts, pay items, tags, allocation rules and tax presets')
  // June dry run (before a first live period is set).
  setClock('2026-06-22T03:00:00Z')
  const jun = simulateSend('regular', { start: '2026-05-21', end: '2026-06-20', sentAt: '2026-06-22T03:00:00Z' })
  as('Jurnal Owner', () => must(confirmSource(), 'confirm source'))
  as('Accountant', () => must(markDryRunPassed(jun.runId!), 'dry run passed'))
  as('Finance Manager', () => must(signOffDryRun(jun.runId!), 'dry run sign-off'))
  payroll.settings.cutover = { firstLive: '2026-07', proposedBy: payrollPerson('Accountant').person, confirmedBy: payrollPerson('Finance Manager').person, mode: 'Block' }
  for (const r of payroll.runs) r.mode = runMode(r.month)
  takeSnapshot('First live period Jul 2026 confirmed')
  // July: posted, paid, accrued, reconciled, signed off, locked.
  monthCycle('2026-06-21', '2026-07-20', '2026-07-22T03:00:00Z', { pay: '2026-07-24', statutory: { kes: '2026-08-07', tk: '2026-08-12', pph: '2026-08-13' } })
  setClock('2026-07-31T10:00:00Z')
  as('Accountant', () => must(postAccrual('2026-07'), 'accrual Jul'))
  // EMP-0038 resigns effective 20 Aug (reported before August posts).
  setClock('2026-08-05T02:00:00Z')
  receiveEmployeeEvent({ type: 'talenta.employee.resignation.created', employee_id: 'EMP-0038', effective: '2026-08-20' })
  monthCycle('2026-07-21', '2026-08-20', '2026-08-21T03:00:00Z', { pay: '2026-08-25', statutory: { kes: '2026-09-08', tk: '2026-09-14', pph: '2026-09-14' } })
  setClock('2026-08-25T03:00:00Z')
  receiveEmployeeEvent({ type: 'talenta.employee.detail.created', employee_id: 'EMP-0041', effective: '2026-09-01', to: { organization_name: 'Sales', branch_name: 'Bandung', cost_center_name: 'Regional Sales' } })
  setClock('2026-08-31T10:00:00Z')
  as('Accountant', () => must(postAccrual('2026-08'), 'accrual Aug'))
  for (const m of ['2026-07', '2026-08']) closeMonth(m)
  setClock('2026-09-10T03:00:00Z')
  as('Finance Manager', () => must(lockPeriod('2026-07'), 'lock Jul'))
  // September: arrives with a new pay item and holds.
  setClock('2026-09-21T03:00:00Z')
  simulateSend('new-pay-item', { start: '2026-08-21', end: '2026-09-20', sentAt: '2026-09-21T03:00:00Z', newAllowance: { name: 'Insentif Penjualan', organization: 'Sales', amount: 1_500_000 } })
  setClock('2026-10-05T02:00:00Z')
  payroll.viewAs = 'Accountant'
  seeding = false
}
function monthCycle(start: string, end: string, sentAt: string, pay: { pay: string; statutory: { kes: string; tk: string; pph: string } }) {
  setClock(sentAt)
  const r = simulateSend('regular', { start, end, sentAt })
  const run = runById(r.runId)!
  as('Accountant', () => {
    if (draftOf(run) && needsFmConfirm(run, draftOf(run)!)) as('Finance Manager', () => confirmPostAsFinanceManager(run.id))
    must(postRun(run.id), `post ${start}`)
  })
  const month = run.month
  setClock(`${pay.pay}T03:00:00Z`)
  as('Accountant', () => must(recordSalaryPayment(run.id, { bank: ACC.bca, date: pay.pay }), 'salary'))
  setClock(`${pay.statutory.kes}T03:00:00Z`)
  as('Tax Staff', () => must(payStatutory({ party: 'BPJS Kesehatan', bank: ACC.bca, date: pay.statutory.kes, periods: [{ month }] }), 'bpjs kes'))
  setClock(`${pay.statutory.tk}T03:00:00Z`)
  as('Tax Staff', () => must(payStatutory({ party: 'BPJS Ketenagakerjaan', bank: ACC.bca, date: pay.statutory.tk, periods: [{ month }] }), 'bpjs tk'))
  setClock(`${pay.statutory.pph}T03:00:00Z`)
  as('Tax Staff', () => {
    must(payStatutory({ party: 'DJP PPh 21', bank: ACC.bca, date: pay.statutory.pph, periods: [{ month, billingCode: '412011100' + month.replace('-', ''), ntpn: `0A1B2C3D4E5F${month.slice(5)}${month.slice(2, 4)}` }] }), 'pph21')
    must(payStatutory({ party: 'DJP PPh 26', bank: ACC.bca, date: pay.statutory.pph, periods: [{ month }] }), 'pph26')
    must(payStatutory({ party: 'Other', bank: ACC.bca, date: pay.statutory.pph, periods: [{ month }], account: ACC.dplk }), 'dplk')
  })
}
function closeMonth(month: string) {
  setClock(`${nextMonthOf(month)}-16T03:00:00Z`)
  for (const body of ['BPJS Kesehatan', 'BPJS Ketenagakerjaan'] as BpjsBody[]) {
    const lines = bpjsPayroll(month, body).filter((x) => x.programme !== 'Unassigned').map((x) => ({ programme: x.programme as BpjsProgramme, amount: x.amount, headcount: 40 }))
    as('Accountant', () => { must(saveBpjsInvoice(month, body, lines), 'bpjs invoice'); must(markBpjsReviewed(month, body), 'bpjs review') })
  }
  as('Tax Staff', () => { must(setEbupotTotal(month, pph21Monthly(month).rows[0]!.ledger), 'ebupot'); must(markPph21Reconciled(month), 'pph21 reconciled') })
  as('Accountant', () => {
    const r = reconciliation(month)
    for (const row of [...r.accountRows, ...r.payableRows].filter((x) => x.variance && !x.rounding)) setVarianceNote(month, row.key, { reason: 'Timing', note: 'Rounding residue on whole-rupiah lines' })
    must(markReadyForSignOff(month), 'ready')
  })
  as('Finance Manager', () => must(signOffMonth(month, { hrConfirmed: true }), `sign off ${month}`))
}

export function resetPayroll(): void { seed() }

// Load: a saved snapshot wins over the sample.
const snap = loadSnapshot<PayrollState>(SNAPSHOT_KEY)
if (snap && snap[0]) Object.assign(payroll, snap[0])
else seed()

watch(payroll, () => saveSnapshot(SNAPSHOT_KEY, [payroll]), { deep: true })
