/**
 * Advanced Budgeting: the budget ledger and every rule that moves it.
 *
 * One reactive state object is the single source of truth for budget lines,
 * versions, spend documents (requests, POs, bills), change documents (transfers,
 * funding requests, revisions, saving fills and draws) and the append-only
 * ledger. Every figure on every screen is computed from the ledger on read
 * (PRD LR-4); nothing stores a balance.
 *
 *   Available = budget - reserved - committed - actual - held for transfers (LR-2)
 *
 * Pending requests show in their own column and do not reduce available.
 * The state persists in localStorage; resetBudget() returns to the sample.
 */
import { reactive, watch, computed } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import { purchaseRequests, addPurchaseRequest, deletePurchaseRequests } from './purchaseRequests'
import type { PurchaseRequestLine } from './types'
import {
  BUDGET_ACCOUNTS, BUDGET_DEPARTMENTS, BUDGET_PROJECTS, SAVING_ACCOUNT, COMPANY_DEPT,
  CFO_NAME, PRESIDENT_DIRECTOR_NAME, BUDGET_CONTROLLER_NAME, budgetAccount, holderOf,
  personFor, deptName, projectName, type BudgetClass, type BudgetRole,
} from './budgetMaster'

// ── Calendar ────────────────────────────────────────────────────────────────

export const BUDGET_YEAR = 2026
/** "Today" in the sample: 5 October 2026. Month index is 0-based (9 = October). */
export const BUDGET_TODAY = '2026-10-05'
export const BUDGET_CURRENT_MONTH = 9

// ── Types ───────────────────────────────────────────────────────────────────

export type Response = 'Block' | 'Warn' | 'Off'
export type EntryType = 'reserve' | 'commit' | 'actual' | 'transfer-hold'
export type DocKind = 'PR' | 'PO' | 'Bill' | 'Journal' | 'Change'

export interface BudgetLine {
  id: string
  year: number
  account: string
  dept: string
  project: string | null
  /** Month amounts, whole rupiah, January first. */
  months: number[]
}

export interface LedgerEntry {
  id: number
  key: string
  lineId: string
  month: number
  type: EntryType
  amount: number
  docKind: DocKind
  docId: string
  docNo: string
  /** The document line that owns the money: `${docId}:${lineIndex}` of the request or PO. */
  ref?: string
  event: string
  user: string
  at: string
}

export interface VersionChange { lineId: string; month: number; delta: number }
export interface BudgetVersion {
  no: number
  year: number
  type: 'Original' | 'Revision' | 'Transfer' | 'Funding request' | 'Mid-year insert' | 'Saving fill' | 'Saving draw'
  docNo: string
  reason: string
  requestedBy: string
  approvedBy: string
  at: string
  changes: VersionChange[]
}

export interface SpendLine {
  lineId: string | null
  account: string
  dept: string
  project: string | null
  amount: number
  description: string
}

export type PRStatus = 'Draft' | 'Pending' | 'Approved' | 'Rejected' | 'Cancelled' | 'Closed'
export interface BudgetPR {
  id: string
  number: string
  /** Link to the purchase request record in the Purchases module, when there is one. */
  purchaseRequestId: string | null
  requester: string
  date: string
  month: number
  status: PRStatus
  lines: SpendLine[]
  /** Amounts held at final approval (an approver can cut them). */
  approvedAmounts: number[] | null
  fullyOrdered: boolean
  /** The last check result shown on the form. */
  block: { lineId: string | null; short: number; message: string } | null
  overMonthReason: string | null
  fundingRequestId: string | null
  approvalChain: ChainStep[]
}

export interface POLine {
  lineId: string
  description: string
  amount: number
  invoiced: number
  closed: boolean
  closeReason: string | null
  /** Request line this PO line came from. */
  prLine: number | null
}
export interface BudgetPO {
  id: string
  number: string
  prId: string | null
  vendor: string
  date: string
  month: number
  status: 'Open' | 'Closed'
  lines: POLine[]
  lastActivity: string
  /** Link to the purchase order record in the Purchases module, when there is one. */
  purchaseOrderId?: string | null
}

export interface BillLine extends SpendLine { poLine: number | null }
export interface BudgetBill {
  id: string
  number: string
  poId: string | null
  vendor: string
  date: string
  month: number
  lines: BillLine[]
  final: boolean
  /** No-PO bill that went over available (Release 1 warn-only check). */
  overBudget: { lineId: string | null; short: number } | null
}

export interface GLPosting {
  id: number
  lineId: string | null
  account: string
  dept: string
  project: string | null
  month: number
  amount: number
  source: 'Purchase invoice' | 'Manual journal' | 'Reclass to fixed assets'
  docNo: string
  counted: boolean
}

export type ChangeKind = 'Transfer' | 'Funding request' | 'Mid-year insert' | 'Revision' | 'Saving fill' | 'Saving draw'
export type ChangeStatus = 'Draft' | 'Pending' | 'Approved' | 'Rejected' | 'Withdrawn'
export interface ChainStep {
  approver: string
  role: string
  status: 'Waiting' | 'Approved' | 'Rejected' | 'Skipped'
  at: string | null
  note: string | null
}
export interface NewLineSpec { account: string; dept: string; project: string | null }
export interface ChangeReceiver { lineId: string | null; newLine: NewLineSpec | null; amount: number }
export type SavingType = 'Procurement' | 'Completion' | 'Cancellation'
export interface SavingTag { dept: string; project: string | null; class: BudgetClass; type: SavingType; sourceDoc: string }
export interface ChangeDoc {
  id: string
  number: string
  kind: ChangeKind
  status: ChangeStatus
  month: number
  donor: { lineId: string; amount: number } | null
  receivers: ChangeReceiver[]
  reason: string
  reasonCode: string | null
  preparedBy: string
  createdAt: string
  submittedAt: string | null
  chain: ChainStep[]
  linkedPrId: string | null
  /** Saving fill: where the saving came from. Saving draw: the slice it draws on. */
  saving: SavingTag | null
  version: number | null
}

export interface BudgetYearState {
  year: number
  status: 'Draft' | 'Locked'
  approvedTotal: number | null
  lockedBy: string | null
  lockedAt: string | null
}

export interface ControlSettings {
  year: Response
  month: Response
  ytd: Response
  smallMoveLimit: number
  smallMoveDays: number
  fundingCapPct: number
  fundingPerQuarter: number
  invoiceTolerancePct: number
}
export interface SettingChange {
  id: string
  patch: Partial<ControlSettings>
  requestedBy: string
  requestedAt: string
  status: 'Pending' | 'Approved' | 'Rejected'
  approvedBy: string | null
  effectiveFrom: string | null
}

export interface BudgetNotice { id: number; to: string; text: string; link: string; at: string; read: boolean }

export interface NoLineSpend { account: string; dept: string; project: string | null; amount: number; docs: string[]; isNew: boolean }
export interface TieOutRun {
  at: string
  lines: number
  /** General ledger minus budget ledger, on the total for controlled accounts. Any non-zero fails the run. */
  difference: number
  failures: { lineId: string; ledger: number; gl: number }[]
  /** Total check: budget-line actual + no-line spend against counted general-ledger postings. */
  total?: { ledger: number; noLine: number; gl: number; difference: number }
  /** Spend on a mix with no budget line: a warning, never a failure. */
  noLine?: NoLineSpend[]
}

export interface BudgetState {
  seq: number
  lines: BudgetLine[]
  years: BudgetYearState[]
  versions: BudgetVersion[]
  entries: LedgerEntry[]
  prs: BudgetPR[]
  pos: BudgetPO[]
  bills: BudgetBill[]
  gl: GLPosting[]
  changes: ChangeDoc[]
  settings: ControlSettings
  settingChanges: SettingChange[]
  notices: BudgetNotice[]
  tieOuts: TieOutRun[]
  viewAs: BudgetRole
}

export const DEFAULT_SETTINGS: ControlSettings = {
  year: 'Block', month: 'Warn', ytd: 'Off',
  smallMoveLimit: 50_000_000, smallMoveDays: 30,
  fundingCapPct: 20, fundingPerQuarter: 3, invoiceTolerancePct: 2,
}

// ── State ───────────────────────────────────────────────────────────────────

const SNAPSHOT_KEY = 'advanced-budgeting-v1'

function emptyState(): BudgetState {
  return {
    seq: 1, lines: [], years: [], versions: [], entries: [], prs: [], pos: [], bills: [], gl: [],
    changes: [], settings: { ...DEFAULT_SETTINGS }, settingChanges: [], notices: [], tieOuts: [],
    viewAs: 'Budget Controller',
  }
}

export const budget = reactive<BudgetState>(emptyState())

let seeding = false
function nowISO(): string { return seeding ? `${BUDGET_TODAY}T08:00:00+07:00` : new Date().toISOString() }
function nextSeq(): number { return budget.seq++ }

/** Who is acting. There is no sign-in, so "View as" decides. */
export function actingPerson(): string { return personFor(budget.viewAs).person }
export function setBudgetViewAs(role: BudgetRole): void { budget.viewAs = role }

// ── Lines and figures ───────────────────────────────────────────────────────

export function lineById(id: string | null): BudgetLine | undefined {
  return id ? budget.lines.find((l) => l.id === id) : undefined
}
export function lineClass(l: BudgetLine): BudgetClass | null { return budgetAccount(l.account)?.class ?? null }
export function isSavingLine(l: BudgetLine | undefined): boolean { return !!l && l.account === SAVING_ACCOUNT }
export function lineTitle(l: BudgetLine): string {
  return `${deptName(l.dept)} × ${projectName(l.project)} × ${budgetAccount(l.account)?.name ?? l.account}`
}
export function lineTotal(l: BudgetLine): number { return l.months.reduce((s, v) => s + v, 0) }

/** LR-1: exact mix only. A missing mix finds no line; there is no fallback. */
export function findLine(account: string, dept: string, project: string | null, year = BUDGET_YEAR): BudgetLine | undefined {
  return budget.lines.find((l) => l.year === year && l.account === account && l.dept === dept && (l.project ?? null) === (project ?? null))
}

export interface Scope { from?: number; to?: number }
const inScope = (m: number, s: Scope) => m >= (s.from ?? 0) && m <= (s.to ?? 11)

export interface Figures {
  budget: number
  reserved: number
  committed: number
  actual: number
  held: number
  pending: number
  available: number
  /** Floor for any cut: reserved + committed + actual + held (LR-6). */
  floor: number
}

export function figures(lineId: string, scope: Scope = {}): Figures {
  const l = lineById(lineId)
  const f: Figures = { budget: 0, reserved: 0, committed: 0, actual: 0, held: 0, pending: 0, available: 0, floor: 0 }
  if (!l) return f
  l.months.forEach((v, m) => { if (inScope(m, scope)) f.budget += v })
  for (const e of budget.entries) {
    if (e.lineId !== lineId || !inScope(e.month, scope)) continue
    if (e.type === 'reserve') f.reserved += e.amount
    else if (e.type === 'commit') f.committed += e.amount
    else if (e.type === 'actual') f.actual += e.amount
    else f.held += e.amount
  }
  for (const pr of budget.prs) {
    if (pr.status !== 'Pending' || !inScope(pr.month, scope)) continue
    pr.lines.forEach((sl) => { if (sl.lineId === lineId) f.pending += sl.amount })
  }
  f.floor = f.reserved + f.committed + f.actual + f.held
  f.available = f.budget - f.floor
  return f
}
export const yearFigures = (lineId: string) => figures(lineId)
export const monthFigures = (lineId: string, m: number) => figures(lineId, { from: m, to: m })
export const ytdFigures = (lineId: string, m: number) => figures(lineId, { from: 0, to: m })

/** Budget planned for months after the current one (not yet spendable in a donor's plan). */
export function plannedAfter(lineId: string, month = BUDGET_CURRENT_MONTH): number {
  const l = lineById(lineId)
  return l ? l.months.slice(month + 1).reduce((s, v) => s + v, 0) : 0
}

/** The most a line can give away now (available, never below zero). */
export function donorMax(lineId: string): number { return Math.max(0, yearFigures(lineId).available) }

/** Lines in the same department and class with free budget not planned for later months. */
export function suggestDonors(receiverLineId: string, gap: number): { lineId: string; free: number }[] {
  const r = lineById(receiverLineId)
  if (!r) return []
  const cls = lineClass(r)
  return budget.lines
    .filter((l) => l.id !== r.id && l.year === r.year && l.dept === r.dept && !isSavingLine(l) && lineClass(l) === cls)
    .map((l) => ({ lineId: l.id, free: Math.max(0, Math.min(donorMax(l.id), yearFigures(l.id).available - plannedAfter(l.id))) }))
    .filter((d) => d.free > 0)
    .sort((a, b) => Number(b.free >= gap) - Number(a.free >= gap) || b.free - a.free)
}

// ── Ledger posting (append-only, idempotent: LR-5, NFR4) ──────────────────────

function post(e: Omit<LedgerEntry, 'id' | 'at' | 'user'> & { user?: string }): boolean {
  if (e.amount === 0) return false
  if (budget.entries.some((x) => x.key === e.key)) return false
  budget.entries.push({ ...e, id: nextSeq(), user: e.user ?? actingPerson(), at: nowISO() })
  return true
}

export function entriesFor(lineId: string): LedgerEntry[] { return budget.entries.filter((e) => e.lineId === lineId) }
export function versionsFor(lineId: string): BudgetVersion[] {
  return budget.versions.filter((v) => v.changes.some((c) => c.lineId === lineId))
}
export function currentVersion(year = BUDGET_YEAR): number {
  return Math.max(-1, ...budget.versions.filter((v) => v.year === year).map((v) => v.no))
}
export function yearState(year = BUDGET_YEAR): BudgetYearState | undefined { return budget.years.find((y) => y.year === year) }
export function isLocked(year = BUDGET_YEAR): boolean { return yearState(year)?.status === 'Locked' }

function notify(to: string, text: string, link: string) {
  if (seeding) return
  budget.notices.unshift({ id: nextSeq(), to, text, link, at: nowISO(), read: false })
}

// ── The check (TS-06, FG-3) ─────────────────────────────────────────────────

export interface LineCheck {
  lineId: string | null
  label: string
  amount: number
  controlled: boolean
  year: Figures | null
  month: Figures | null
  yearShort: number
  monthShort: number
  result: 'Pass' | 'Warn' | 'Block'
  message: string
}
export interface CheckResult {
  result: 'Pass' | 'Warn' | 'Block'
  lines: LineCheck[]
  /** The first blocking line, for the block message and Request funds. */
  blocker: LineCheck | null
  monthWarning: boolean
}

function worst(a: CheckResult['result'], b: CheckResult['result']): CheckResult['result'] {
  const rank = { Pass: 0, Warn: 1, Block: 2 }
  return rank[a] >= rank[b] ? a : b
}

/**
 * Check amounts against available. Amounts on the same line combine (FG-3.3).
 * `excess` callers (PO from a request, bill on a PO) pass only the part above
 * what the earlier document holds (LR-3).
 */
export function checkSpend(items: { lineId: string | null; account: string; dept: string; project: string | null; amount: number }[], month: number, year = BUDGET_YEAR): CheckResult {
  const s = budget.settings
  const merged = new Map<string, { lineId: string | null; account: string; dept: string; project: string | null; amount: number }>()
  for (const it of items) {
    const key = it.lineId ?? `none:${it.account}|${it.dept}|${it.project ?? ''}`
    const prev = merged.get(key)
    if (prev) prev.amount += it.amount
    else merged.set(key, { ...it })
  }
  const out: CheckResult = { result: 'Pass', lines: [], blocker: null, monthWarning: false }
  for (const it of merged.values()) {
    const acct = budgetAccount(it.account)
    const label = `${deptName(it.dept)} × ${projectName(it.project)} × ${acct?.name ?? it.account}`
    const lc: LineCheck = { lineId: it.lineId, label, amount: it.amount, controlled: !!acct?.controlled, year: null, month: null, yearShort: 0, monthShort: 0, result: 'Pass', message: '' }
    if (acct?.savingOnly) {
      lc.result = 'Block'; lc.message = 'The saving bucket cannot be spent directly. Ask for a saving draw.'
    } else if (!acct?.controlled) {
      lc.message = 'Not budget controlled'
    } else if (!isLocked(year)) {
      lc.result = 'Block'; lc.message = `The ${year} budget is not locked yet. Requests open once Finance locks it.`
    } else if (!it.lineId || !lineById(it.lineId)) {
      lc.result = 'Block'; lc.message = 'No budget line for this department, project and account.'
    } else if (it.amount > 0) {
      lc.year = yearFigures(it.lineId)
      lc.month = monthFigures(it.lineId, month)
      lc.yearShort = Math.max(0, it.amount - lc.year.available)
      lc.monthShort = Math.max(0, it.amount - lc.month.available)
      const ytd = ytdFigures(it.lineId, month)
      const ytdShort = Math.max(0, it.amount - ytd.available)
      const checks: [Response, number, string][] = [
        [s.year, lc.yearShort, 'year'], [s.month, lc.monthShort, 'month'], [s.ytd, ytdShort, 'year to date'],
      ]
      for (const [resp, short, period] of checks) {
        if (resp === 'Off' || short <= 0) continue
        const r = resp === 'Block' ? 'Block' : 'Warn'
        if (r === 'Warn' && period === 'month') out.monthWarning = true
        if (worst(lc.result, r) !== lc.result || !lc.message) {
          lc.message = r === 'Block' ? `Not enough budget for the ${period}. Short ${rupiah(short)}.` : `Over the ${period} budget by ${rupiah(short)}.`
        }
        lc.result = worst(lc.result, r)
      }
    }
    out.lines.push(lc)
    out.result = worst(out.result, lc.result)
    if (lc.result === 'Block' && !out.blocker) out.blocker = lc
  }
  return out
}

export function rupiah(n: number): string {
  const v = Math.round(n)
  return `${v < 0 ? '-' : ''}Rp${Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
}

// ── Purchase requests (reserve) ─────────────────────────────────────────────

function nextNumber(prefix: string, list: { number: string }[], start: number): string {
  const nums = list.map((d) => Number(d.number.split('-').pop())).filter(Number.isFinite)
  return `${prefix}-${BUDGET_YEAR}-${String(Math.max(start, ...nums) + 1).padStart(4, '0')}`
}

export function resolveLines(lines: Omit<SpendLine, 'lineId'>[] | SpendLine[]): SpendLine[] {
  return lines.map((l) => ({ ...l, lineId: findLine(l.account, l.dept, l.project)?.id ?? null }))
}

/**
 * The budget side of a purchase request. `number` is the purchase request's own
 * number ("#90131"), so both screens name the document the same way.
 */
export function createPR(input: { requester: string; date: string; lines: Omit<SpendLine, 'lineId'>[]; purchaseRequestId?: string | null; number?: string }): BudgetPR {
  const pr: BudgetPR = {
    id: `bpr${nextSeq()}`,
    number: input.number ?? `#${Math.max(90100, ...purchaseRequests.map((r) => r.number)) + 1}`,
    purchaseRequestId: input.purchaseRequestId ?? null,
    requester: input.requester,
    date: input.date,
    month: Number(input.date.slice(5, 7)) - 1,
    status: 'Draft',
    lines: resolveLines(input.lines),
    approvedAmounts: null,
    fullyOrdered: false,
    block: null,
    overMonthReason: null,
    fundingRequestId: null,
    approvalChain: [],
  }
  budget.prs.unshift(pr)
  return pr
}
export function prById(id: string | null): BudgetPR | undefined { return id ? budget.prs.find((p) => p.id === id) : undefined }
export function prForPurchaseRequest(purchaseRequestId: string): BudgetPR | undefined {
  return budget.prs.find((p) => p.purchaseRequestId === purchaseRequestId)
}
export function prLink(pr: BudgetPR): string { return pr.purchaseRequestId ? `/purchase-requests/${pr.purchaseRequestId}` : '/purchase-requests' }
export function prTotal(pr: BudgetPR): number { return pr.lines.reduce((s, l) => s + l.amount, 0) }

export function updatePRLines(id: string, lines: Omit<SpendLine, 'lineId'>[]): void {
  const pr = prById(id)
  if (!pr || (pr.status !== 'Draft' && pr.status !== 'Rejected')) return
  pr.lines = resolveLines(lines)
  pr.status = 'Draft'
}

export function checkPR(pr: BudgetPR): CheckResult { return checkSpend(pr.lines, pr.month) }

/** Submit: block keeps the draft; pass or warn sends it for approval. A month warning needs a reason. */
export function submitPR(id: string, overMonthReason?: string): { ok: boolean; check: CheckResult; needsReason?: boolean } {
  const pr = prById(id)!
  pr.lines = resolveLines(pr.lines)
  const check = checkPR(pr)
  if (check.result === 'Block') {
    const b = check.blocker!
    pr.block = { lineId: b.lineId, short: b.yearShort, message: b.message }
    pr.status = 'Draft'
    return { ok: false, check }
  }
  if (check.monthWarning && !overMonthReason && !pr.overMonthReason) return { ok: false, check, needsReason: true }
  pr.block = null
  if (overMonthReason) pr.overMonthReason = overMonthReason
  pr.status = 'Pending'
  pr.approvalChain = [
    { approver: personFor('Line Manager').person, role: 'Line Manager', status: 'Waiting', at: null, note: null },
    { approver: holderOf(pr.lines[0]?.dept ?? 'NW') ?? personFor('Budget holder (Networking)').person, role: 'Budget holder', status: 'Waiting', at: null, note: null },
  ]
  return { ok: true, check }
}

/**
 * Final approval holds the money (LR-3). Any approval path ends here, so the
 * hold and the re-check run the same way for screen, email link, auto-approval
 * and API. An approver may cut amounts; the hold follows the approved amount.
 */
export function approvePR(id: string, opts: { amounts?: number[]; path?: string; finalStep?: boolean } = {}): { ok: boolean; check: CheckResult | null; message?: string } {
  const pr = prById(id)!
  if (pr.status === 'Approved') return { ok: true, check: null }
  if (pr.status !== 'Pending') return { ok: false, check: null, message: 'Only a request waiting for approval can be approved.' }
  const amounts = opts.amounts ?? pr.lines.map((l) => l.amount)
  const step = pr.approvalChain.find((s) => s.status === 'Waiting')
  const isFinal = opts.finalStep ?? pr.approvalChain.filter((s) => s.status === 'Waiting').length <= 1
  if (!isFinal && step) {
    step.status = 'Approved'; step.at = nowISO()
    return { ok: true, check: null }
  }
  pr.lines.forEach((l, i) => { l.amount = amounts[i] ?? l.amount })
  const check = checkSpend(pr.lines, pr.month)
  if (check.result === 'Block') {
    pr.block = { lineId: check.blocker!.lineId, short: check.blocker!.yearShort, message: check.blocker!.message }
    return { ok: false, check, message: check.blocker!.message }
  }
  if (step) { step.status = 'Approved'; step.at = nowISO(); step.note = opts.path ?? null }
  pr.status = 'Approved'
  pr.approvedAmounts = amounts
  pr.block = null
  pr.lines.forEach((l, i) => {
    if (!l.lineId) return
    post({ key: `PR:${pr.id}:approve:${i}`, lineId: l.lineId, month: pr.month, type: 'reserve', amount: amounts[i]!, docKind: 'PR', docId: pr.id, docNo: pr.number, ref: `${pr.id}:${i}`, event: opts.path ? `Approved (${opts.path})` : 'Approved' })
  })
  notify(pr.requester, `${pr.number} was approved. ${rupiah(amounts.reduce((s, v) => s + v, 0))} is held on the budget.`, prLink(pr))
  return { ok: true, check }
}

export function rejectPR(id: string, note: string): void {
  const pr = prById(id)!
  if (pr.status !== 'Pending') return
  const step = pr.approvalChain.find((s) => s.status === 'Waiting')
  if (step) { step.status = 'Rejected'; step.at = nowISO(); step.note = note }
  pr.status = 'Rejected'
  notify(pr.requester, `${pr.number} was rejected: ${note}`, prLink(pr))
}

/** What a request still holds on a line (approved hold minus what POs took over). */
export function prRemaining(prId: string, lineIdx: number): number {
  const ref = `${prId}:${lineIdx}`
  return budget.entries.filter((e) => e.ref === ref && e.type === 'reserve').reduce((s, e) => s + e.amount, 0)
}

export function cancelPR(id: string): void {
  const pr = prById(id)!
  if (pr.status === 'Approved') {
    pr.lines.forEach((l, i) => {
      const rem = prRemaining(pr.id, i)
      if (l.lineId && rem > 0) post({ key: `PR:${pr.id}:cancel:${i}`, lineId: l.lineId, month: pr.month, type: 'reserve', amount: -rem, docKind: 'PR', docId: pr.id, docNo: pr.number, ref: `${pr.id}:${i}`, event: 'Cancelled' })
    })
  }
  pr.status = 'Cancelled'
}

/** "Fully ordered" frees what a split request still holds (FG-2.3). */
export function markFullyOrdered(id: string): number {
  const pr = prById(id)!
  let freed = 0
  pr.lines.forEach((l, i) => {
    const rem = prRemaining(pr.id, i)
    if (l.lineId && rem > 0) {
      post({ key: `PR:${pr.id}:fully-ordered:${i}`, lineId: l.lineId, month: pr.month, type: 'reserve', amount: -rem, docKind: 'PR', docId: pr.id, docNo: pr.number, ref: `${pr.id}:${i}`, event: 'Fully ordered, rest freed' })
      freed += rem
    }
  })
  pr.fullyOrdered = true
  pr.status = 'Closed'
  return freed
}

// ── Purchase orders (commit) ────────────────────────────────────────────────

export function poById(id: string | null): BudgetPO | undefined { return id ? budget.pos.find((p) => p.id === id) : undefined }
export function poOpen(po: BudgetPO, i: number): number {
  const ref = `${po.id}:${i}`
  return budget.entries.filter((e) => e.ref === ref && e.type === 'commit').reduce((s, e) => s + e.amount, 0)
}

/**
 * A PO takes over its request's hold and is checked only on the excess (LR-3).
 * A PO with no request runs a full check.
 */
export function createPO(input: { prId: string | null; vendor: string; date: string; lines: { prLine: number | null; lineId: string; description: string; amount: number }[]; number?: string; lastActivity?: string }):
  { ok: boolean; po?: BudgetPO; check: CheckResult } {
  const pr = prById(input.prId)
  const month = Number(input.date.slice(5, 7)) - 1
  const excess = input.lines.map((l) => {
    const held = pr && l.prLine !== null ? prRemaining(pr.id, l.prLine) : 0
    return Math.max(0, l.amount - held)
  })
  const check = checkSpend(input.lines.map((l, i) => {
    const bl = lineById(l.lineId)!
    return { lineId: l.lineId, account: bl.account, dept: bl.dept, project: bl.project, amount: excess[i]! }
  }), month)
  if (check.result === 'Block') return { ok: false, check }
  const po: BudgetPO = {
    id: `bpo${nextSeq()}`,
    number: input.number ?? nextNumber('PO', budget.pos, 450),
    prId: input.prId, vendor: input.vendor, date: input.date, month, status: 'Open',
    lines: input.lines.map((l) => ({ lineId: l.lineId, description: l.description, amount: l.amount, invoiced: 0, closed: false, closeReason: null, prLine: l.prLine })),
    lastActivity: input.lastActivity ?? input.date,
  }
  budget.pos.unshift(po)
  po.lines.forEach((l, i) => {
    const held = pr && l.prLine !== null ? prRemaining(pr.id, l.prLine) : 0
    const take = Math.min(held, l.amount)
    if (pr && take > 0) post({ key: `PO:${po.id}:take:${i}`, lineId: l.lineId, month: pr.month, type: 'reserve', amount: -take, docKind: 'PO', docId: po.id, docNo: po.number, ref: `${pr.id}:${l.prLine}`, event: `Took over ${pr.number}` })
    post({ key: `PO:${po.id}:commit:${i}`, lineId: l.lineId, month, type: 'commit', amount: l.amount, docKind: 'PO', docId: po.id, docNo: po.number, ref: `${po.id}:${i}`, event: 'Approved' })
  })
  return { ok: true, po, check }
}

/** Close a PO line (short delivery or final invoice): the open commitment frees to the line. */
export function closePOLine(poId: string, i: number, reason: string): number {
  const po = poById(poId)!
  const l = po.lines[i]!
  if (l.closed) return 0
  const open = poOpen(po, i)
  if (open > 0) post({ key: `PO:${po.id}:close:${i}:${nextSeq()}`, lineId: l.lineId, month: po.month, type: 'commit', amount: -open, docKind: 'PO', docId: po.id, docNo: po.number, ref: `${po.id}:${i}`, event: `Closed: ${reason}` })
  l.closed = true
  l.closeReason = reason
  if (po.lines.every((x) => x.closed)) po.status = 'Closed'
  return open
}

/** Close the whole PO: all lines or none. */
export function closePO(poId: string, reason: string): number {
  const po = poById(poId)!
  return po.lines.reduce((s, _l, i) => s + closePOLine(poId, i, reason), 0)
}

/** Reopen re-runs the check on what the line would hold again (FG7-AC3). */
export function reopenPOLine(poId: string, i: number): { ok: boolean; check: CheckResult } {
  const po = poById(poId)!
  const l = po.lines[i]!
  const amount = Math.max(0, l.amount - l.invoiced)
  const bl = lineById(l.lineId)!
  const check = checkSpend([{ lineId: l.lineId, account: bl.account, dept: bl.dept, project: bl.project, amount }], po.month)
  if (check.result === 'Block') return { ok: false, check }
  post({ key: `PO:${po.id}:reopen:${i}:${nextSeq()}`, lineId: l.lineId, month: po.month, type: 'commit', amount, docKind: 'PO', docId: po.id, docNo: po.number, ref: `${po.id}:${i}`, event: 'Reopened' })
  l.closed = false
  l.closeReason = null
  po.status = 'Open'
  return { ok: true, check }
}

/** POs with no activity for 90 days or more (shown on the report; the sweep is Release 2). */
export function isIdlePO(po: BudgetPO): boolean {
  if (po.status !== 'Open') return false
  const days = (Date.parse(BUDGET_TODAY) - Date.parse(po.lastActivity)) / 86_400_000
  return days >= 90
}
export function idleCommitted(lineId: string): number {
  return budget.pos.filter(isIdlePO).reduce((s, po) => s + po.lines.reduce((t, l, i) => t + (l.lineId === lineId ? poOpen(po, i) : 0), 0), 0)
}

// ── Bills (actual) and the general ledger ───────────────────────────────────

function glPost(p: Omit<GLPosting, 'id'>) { budget.gl.push({ ...p, id: nextSeq() }) }

/**
 * Post a purchase invoice or bill. On a PO it takes over the commitment and is
 * checked on any excess. With no PO, Release 1 posts with a warning and lists it
 * on the overrun list (TS06-US09). Actual is the price before PPN.
 */
export function postBill(input: { poId: string | null; vendor: string; date: string; lines: { poLine: number | null; account: string; dept: string; project: string | null; amount: number; description: string }[]; final?: boolean; number?: string }):
  { ok: boolean; bill?: BudgetBill; check: CheckResult; message?: string } {
  const month = Number(input.date.slice(5, 7)) - 1
  const projects = new Set(input.lines.map((l) => l.project))
  if (projects.size > 1) {
    return { ok: false, check: { result: 'Block', lines: [], blocker: null, monthWarning: false }, message: 'One invoice books one project. Split this invoice by project.' }
  }
  const po = poById(input.poId)
  const lines: BillLine[] = input.lines.map((l) => {
    const lineId = po && l.poLine !== null ? po.lines[l.poLine]!.lineId : findLine(l.account, l.dept, l.project)?.id ?? null
    return { ...l, lineId }
  })
  const excess = lines.map((l) => {
    if (!po || l.poLine === null) return l.amount
    const open = poOpen(po, l.poLine)
    const tol = Math.round(po.lines[l.poLine]!.amount * budget.settings.invoiceTolerancePct / 100)
    return Math.max(0, l.amount - open - tol)
  })
  const check = checkSpend(lines.map((l, i) => ({ ...l, amount: excess[i]! })), month)
  // Release 1: no-PO bills post with a warning; bills on a PO block only on the excess.
  if (po && check.result === 'Block') return { ok: false, check, message: check.blocker?.message }
  const bill: BudgetBill = {
    id: `bbl${nextSeq()}`, number: input.number ?? nextNumber('PI', budget.bills, 800),
    poId: input.poId, vendor: input.vendor, date: input.date, month, lines, final: !!input.final,
    // A mix with no line has no balance to fall short of: the whole amount is over budget.
    overBudget: !po && check.result !== 'Pass' && check.blocker ? { lineId: check.blocker.lineId, short: check.blocker.lineId ? check.blocker.yearShort : check.blocker.amount } : null,
  }
  if (!po && check.result === 'Block' && check.blocker?.lineId && !bill.overBudget) bill.overBudget = { lineId: check.blocker.lineId, short: check.blocker.yearShort }
  budget.bills.unshift(bill)
  lines.forEach((l, i) => {
    glPost({ lineId: l.lineId, account: l.account, dept: l.dept, project: l.project, month, amount: l.amount, source: 'Purchase invoice', docNo: bill.number, counted: true })
    if (!l.lineId) return
    post({ key: `BILL:${bill.id}:actual:${i}`, lineId: l.lineId, month, type: 'actual', amount: l.amount, docKind: 'Bill', docId: bill.id, docNo: bill.number, event: 'Posted' })
    if (po && l.poLine !== null) {
      const pl = po.lines[l.poLine]!
      const open = poOpen(po, l.poLine)
      const take = Math.min(open, l.amount)
      if (take > 0) post({ key: `BILL:${bill.id}:take:${i}`, lineId: l.lineId, month: po.month, type: 'commit', amount: -take, docKind: 'Bill', docId: bill.id, docNo: bill.number, ref: `${po.id}:${l.poLine}`, event: `Took over ${po.number}` })
      pl.invoiced += l.amount
      po.lastActivity = input.date
      if (input.final) closePOLine(po.id, l.poLine, 'Final invoice')
    }
  })
  return { ok: true, bill, check }
}

/** Manual journals to a controlled line count; reclasses to fixed assets do not (FG-2.2). */
export function postJournal(input: { lineId: string; month: number; amount: number; docNo: string; reclass?: boolean }): { ok: boolean; message?: string } {
  const l = lineById(input.lineId)!
  // LR-7: the saving bucket is budget, not money. Nothing posts to it.
  if (isSavingLine(l)) return { ok: false, message: 'The saving account cannot take postings.' }
  glPost({ lineId: l.id, account: l.account, dept: l.dept, project: l.project, month: input.month, amount: input.amount, source: input.reclass ? 'Reclass to fixed assets' : 'Manual journal', docNo: input.docNo, counted: !input.reclass })
  if (!input.reclass) post({ key: `JE:${input.docNo}:${l.id}`, lineId: l.id, month: input.month, type: 'actual', amount: input.amount, docKind: 'Journal', docId: input.docNo, docNo: input.docNo, event: 'Manual journal' })
  return { ok: true }
}

export function overrunBills(): BudgetBill[] { return budget.bills.filter((b) => !b.poId && b.overBudget) }
export function noLineActual(scope: Scope = {}): number {
  return budget.gl.filter((g) => g.counted && !g.lineId && inScope(g.month, scope)).reduce((s, g) => s + g.amount, 0)
}
export function notCounted(scope: Scope = {}): GLPosting[] { return budget.gl.filter((g) => !g.counted && inScope(g.month, scope)) }

/** Nightly tie-out: ledger actual per line against counted general-ledger postings (LR-4). */
/**
 * Nightly tie-out (LR-4).
 *  1. Pass or fail on the total: budget-line actual plus no-line spend must equal
 *     counted general-ledger postings on controlled accounts. Per-line gaps name
 *     where it broke.
 *  2. Spend on a mix with no budget line is a warning list, never a failure;
 *     mixes not seen in the previous run are flagged new.
 *  3. Reclass journals stay apart as not counted.
 */
export function runTieOut(at?: string): TieOutRun {
  const failures: TieOutRun['failures'] = []
  let ledgerTotal = 0
  for (const l of budget.lines) {
    const ledger = budget.entries.filter((e) => e.lineId === l.id && e.type === 'actual').reduce((s, e) => s + e.amount, 0)
    const gl = budget.gl.filter((g) => g.lineId === l.id && g.counted).reduce((s, g) => s + g.amount, 0)
    ledgerTotal += ledger
    if (ledger !== gl) failures.push({ lineId: l.id, ledger, gl })
  }
  const controlled = (code: string) => !!budgetAccount(code)?.controlled
  const glTotal = budget.gl.filter((g) => g.counted && controlled(g.account)).reduce((s, g) => s + g.amount, 0)
  const groups = new Map<string, NoLineSpend>()
  for (const g of budget.gl) {
    if (!g.counted || g.lineId || !controlled(g.account)) continue
    const k = `${g.account}|${g.dept}|${g.project ?? ''}`
    const cur = groups.get(k) ?? { account: g.account, dept: g.dept, project: g.project, amount: 0, docs: [], isNew: true }
    cur.amount += g.amount
    if (!cur.docs.includes(g.docNo)) cur.docs.push(g.docNo)
    groups.set(k, cur)
  }
  const prevKeys = new Set((budget.tieOuts[0]?.noLine ?? []).map((n) => `${n.account}|${n.dept}|${n.project ?? ''}`))
  const noLine = [...groups.values()].map((n) => ({ ...n, isNew: !prevKeys.has(`${n.account}|${n.dept}|${n.project ?? ''}`) }))
  const noLineTotal = noLine.reduce((s, n) => s + n.amount, 0)
  const difference = glTotal - (ledgerTotal + noLineTotal)
  const run: TieOutRun = {
    at: at ?? nowISO(), lines: budget.lines.length, difference, failures,
    total: { ledger: ledgerTotal, noLine: noLineTotal, gl: glTotal, difference }, noLine,
  }
  budget.tieOuts.unshift(run)
  if (failures.length || difference !== 0) notify(BUDGET_CONTROLLER_NAME, `Tie-out failed: the budget ledger differs from the general ledger by ${rupiah(difference)}.`, '/budget-report')
  const fresh = noLine.filter((n) => n.isNew)
  if (fresh.length) notify(BUDGET_CONTROLLER_NAME, `${fresh.length} new spend with no budget line, ${rupiah(fresh.reduce((s, n) => s + n.amount, 0))}. Add a line or move the cost.`, '/budget-report')
  return run
}

/** A run fails on any per-line gap or a non-zero total difference. */
export function tieOutFailed(run: TieOutRun): boolean {
  return run.failures.length > 0 || (run.total ? run.total.difference !== 0 : run.difference !== 0)
}

// ── Change documents: transfers, funding requests, revisions, savings (FG-4, FG-5) ──

export function changeById(id: string | null): ChangeDoc | undefined { return id ? budget.changes.find((c) => c.id === id) : undefined }
export function changeTotal(c: ChangeDoc): number { return c.donor ? c.donor.amount : c.receivers.reduce((s, r) => s + r.amount, 0) }

const PREFIX: Record<ChangeKind, string> = {
  'Transfer': 'TR', 'Funding request': 'FR', 'Mid-year insert': 'TR', 'Revision': 'RV', 'Saving fill': 'SV', 'Saving draw': 'SD',
}

export function newChange(input: Partial<ChangeDoc> & { kind: ChangeKind }): ChangeDoc {
  const prefix = PREFIX[input.kind]
  const c: ChangeDoc = {
    id: `chg${nextSeq()}`,
    number: input.number ?? nextNumber(prefix, budget.changes.filter((x) => x.number.startsWith(prefix)), prefix === 'TR' ? 100 : prefix === 'FR' ? 80 : 10),
    kind: input.kind, status: 'Draft', month: input.month ?? BUDGET_CURRENT_MONTH,
    donor: input.donor ?? null, receivers: input.receivers ?? [], reason: input.reason ?? '', reasonCode: input.reasonCode ?? null,
    preparedBy: input.preparedBy ?? actingPerson(), createdAt: nowISO(), submittedAt: null, chain: [],
    linkedPrId: input.linkedPrId ?? null, saving: input.saving ?? null, version: null,
  }
  budget.changes.unshift(c)
  return c
}

function receiverLine(r: ChangeReceiver): { account: string; dept: string; project: string | null } | null {
  if (r.lineId) { const l = lineById(r.lineId); return l ? { account: l.account, dept: l.dept, project: l.project } : null }
  return r.newLine
}

/** Lines whose cut is held by pending changes, so a second change sees the first (FG-4.3). */
export function validateChange(c: ChangeDoc): string[] {
  const errs: string[] = []
  const s = budget.settings
  if (!c.reason.trim()) errs.push('Add a reason for this change.')
  if (c.kind === 'Revision') {
    for (const r of c.receivers) {
      const l = lineById(r.lineId)
      if (!l) { errs.push('Pick the line to revise.'); continue }
      if (r.amount < 0) {
        const f = yearFigures(l.id)
        if (lineTotal(l) + r.amount < f.floor) errs.push(`${lineTitle(l)} cannot drop below ${rupiah(f.floor)}, what it already holds.`)
        if ((l.months[c.month] ?? 0) + r.amount < 0) errs.push(`${lineTitle(l)}: the ${monthName(c.month)} amount cannot drop below zero.`)
      }
    }
    return errs
  }
  if (!c.donor) { if (c.kind !== 'Saving fill' || !c.receivers.length) errs.push('Pick the line the money comes from.'); }
  const donor = c.donor ? lineById(c.donor.lineId) : undefined
  const recvSum = c.receivers.reduce((sum, r) => sum + r.amount, 0)
  if (c.donor) {
    if (!donor) errs.push('Pick the line the money comes from.')
    if (c.donor.amount <= 0) errs.push('Enter the amount to move.')
    if (recvSum !== c.donor.amount) errs.push(`Receivers add up to ${rupiah(recvSum)}, not ${rupiah(c.donor.amount)}. Difference ${rupiah(c.donor.amount - recvSum)}.`)
  }
  if (donor && c.donor) {
    const max = c.kind === 'Saving draw' && c.saving ? Math.min(donorMax(donor.id), sliceBalance(sliceKey(c.saving))) : donorMax(donor.id)
    if (c.donor.amount > max) errs.push(`${lineTitle(donor)} can give at most ${rupiah(max)}. It already holds ${rupiah(yearFigures(donor.id).floor)}.`)
    const dClass = c.kind === 'Saving draw' ? c.saving?.class ?? null : lineClass(donor)
    for (const r of c.receivers) {
      const rl = receiverLine(r)
      if (!rl) { errs.push('Pick the receiving line.'); continue }
      const acct = budgetAccount(rl.account)
      if (!acct?.class && !acct?.savingOnly) { errs.push(`${acct?.code ?? rl.account} ${acct?.name ?? ''} has no Opex or Capex class. Finance Admin sets it first.`.replace('  ', ' ')); continue }
      if (acct?.savingOnly) continue
      if (dClass && acct.class !== dClass) errs.push('Opex and Capex money cannot mix.')
      if (c.kind === 'Saving draw' && c.saving && rl.dept !== c.saving.dept) {
        // a draw goes back to any line; keep the slice's class only
      }
      if (rl.dept !== donor.dept && !holderOf(rl.dept)) errs.push(`${deptName(rl.dept)} has no budget holder.`)
    }
    if (donor.dept !== COMPANY_DEPT && c.receivers.some((r) => receiverLine(r)?.dept !== donor.dept) && !holderOf(donor.dept)) errs.push(`${deptName(donor.dept)} has no budget holder.`)
  }
  if (c.kind === 'Funding request' && c.linkedPrId) {
    const pr = prById(c.linkedPrId)
    const gap = pr?.block?.short ?? 0
    if (gap > 0 && c.donor && c.donor.amount > Math.round(gap * (1 + s.fundingCapPct / 100))) errs.push(`A funding request can ask at most ${s.fundingCapPct}% over the gap: ${rupiah(Math.round(gap * (1 + s.fundingCapPct / 100)))}.`)
    if (!c.reasonCode) errs.push('Pick a reason code.')
    const rid = c.receivers[0]?.lineId
    const q = Math.floor(c.month / 3)
    const count = budget.changes.filter((x) => x.id !== c.id && x.kind === 'Funding request' && x.status !== 'Draft' && x.status !== 'Withdrawn' && x.receivers[0]?.lineId === rid && Math.floor(x.month / 3) === q).length
    if (rid && count >= s.fundingPerQuarter) errs.push(`This line had ${count} funding requests this quarter. Raise a revision instead.`)
  }
  if (c.kind === 'Saving fill') {
    if (!c.saving) errs.push('Tag where the saving came from.')
    else if (budget.changes.some((x) => x.id !== c.id && x.kind === 'Saving fill' && x.status !== 'Rejected' && x.status !== 'Withdrawn' && x.status !== 'Draft' && x.saving?.sourceDoc === c.saving!.sourceDoc)) {
      errs.push(`${c.saving.sourceDoc} already filled the bucket.`)
    }
  }
  return errs
}

function monthName(m: number) { return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m]! }

/** Same-department moves in the last N days (tiers use the running total, FG4-AC5). */
export function sameDeptMovedRecently(dept: string, excludeId?: string): number {
  const s = budget.settings
  const since = Date.parse(BUDGET_TODAY) - s.smallMoveDays * 86_400_000
  return budget.changes.filter((c) => c.id !== excludeId && (c.kind === 'Transfer' || c.kind === 'Funding request') && (c.status === 'Pending' || c.status === 'Approved')
    && c.donor && lineById(c.donor.lineId)?.dept === dept && c.receivers.every((r) => receiverLine(r)?.dept === dept)
    && Date.parse((c.submittedAt ?? c.createdAt).slice(0, 10)) >= since)
    .reduce((sum, c) => sum + changeTotal(c), 0)
}

/** Route the chain (Release 1): small same-department moves go to the holder alone (TS08-US08). */
export function routeChain(c: ChangeDoc): ChainStep[] {
  const step = (approver: string, role: string): ChainStep => ({ approver, role, status: 'Waiting', at: null, note: null })
  let steps: ChainStep[]
  if (c.kind === 'Saving draw') {
    const recvDepts = c.receivers.map((r) => receiverLine(r)?.dept)
    const cfoBenefits = c.preparedBy === CFO_NAME || recvDepts.includes('FN')
    steps = [cfoBenefits ? step(PRESIDENT_DIRECTOR_NAME, 'President Director') : step(CFO_NAME, 'CFO')]
  } else if (c.kind === 'Saving fill' || c.kind === 'Revision') {
    steps = [step(CFO_NAME, 'CFO')]
  } else {
    const donor = lineById(c.donor?.lineId ?? null)
    const dDept = donor?.dept ?? 'NW'
    const rDepts = [...new Set(c.receivers.map((r) => receiverLine(r)?.dept ?? dDept))]
    const sameDept = rDepts.every((d) => d === dDept)
    const total = sameDeptMovedRecently(dDept, c.id) + changeTotal(c)
    const holder = holderOf(dDept) ?? '(no budget holder)'
    if (sameDept && total <= budget.settings.smallMoveLimit && c.preparedBy !== holder) {
      steps = [step(holder, `Budget holder, ${deptName(dDept)}`)]
    } else {
      steps = rDepts.map((d) => step(holderOf(d) ?? '(no budget holder)', `Budget holder, ${deptName(d)}`))
      if (!sameDept) steps.push(step(holder, `Budget holder, ${deptName(dDept)} (donor)`))
      steps.push(step(CFO_NAME, 'CFO'))
    }
  }
  // LR-8: nobody approves their own change.
  return steps.map((s) => (s.approver === c.preparedBy ? { ...s, status: 'Skipped', note: 'Prepared this change' } : s))
}

/** Submit holds the donor's cut at once (FG-4.2). */
export function submitChange(id: string): { ok: boolean; errors: string[] } {
  const c = changeById(id)!
  const errors = validateChange(c)
  if (errors.length) return { ok: false, errors }
  c.chain = routeChain(c)
  c.status = 'Pending'
  c.submittedAt = nowISO()
  const holdLine = c.donor?.lineId ?? (c.kind === 'Revision' ? c.receivers.find((r) => r.amount < 0)?.lineId : null)
  const holdAmt = c.donor?.amount ?? -(c.receivers.find((r) => r.amount < 0)?.amount ?? 0)
  if (holdLine && holdAmt > 0) post({ key: `CHG:${c.id}:hold`, lineId: holdLine, month: c.month, type: 'transfer-hold', amount: holdAmt, docKind: 'Change', docId: c.id, docNo: c.number, event: 'Held on submit' })
  const next = c.chain.find((s) => s.status === 'Waiting')
  if (next) notify(next.approver, `${c.number} (${c.kind}, ${rupiah(changeTotal(c))}) waits for your approval.`, `/budget-changes/${c.id}`)
  if (!next) finalizeChange(c)
  return { ok: true, errors: [] }
}

function releaseHold(c: ChangeDoc, event: string) {
  const held = budget.entries.filter((e) => e.docId === c.id && e.type === 'transfer-hold').reduce((s, e) => s + e.amount, 0)
  const lineId = budget.entries.find((e) => e.docId === c.id && e.type === 'transfer-hold')?.lineId
  if (lineId && held > 0) post({ key: `CHG:${c.id}:release`, lineId, month: c.month, type: 'transfer-hold', amount: -held, docKind: 'Change', docId: c.id, docNo: c.number, event })
}

export function canApproveChange(c: ChangeDoc, person = actingPerson()): { ok: boolean; reason?: string } {
  if (c.status !== 'Pending') return { ok: false, reason: 'This change is not waiting for approval.' }
  if (person === c.preparedBy) return { ok: false, reason: 'You prepared this change. Someone else approves it.' }
  const step = c.chain.find((s) => s.status === 'Waiting')
  if (!step || step.approver !== person) return { ok: false, reason: step ? `Waiting for ${step.approver}.` : 'No step is waiting.' }
  return { ok: true }
}

export function approveChange(id: string, person = actingPerson()): { ok: boolean; reason?: string } {
  const c = changeById(id)!
  const can = canApproveChange(c, person)
  if (!can.ok) return can
  const step = c.chain.find((s) => s.status === 'Waiting')!
  step.status = 'Approved'
  step.at = nowISO()
  const next = c.chain.find((s) => s.status === 'Waiting')
  if (next) { notify(next.approver, `${c.number} waits for your approval.`, `/budget-changes/${c.id}`); return { ok: true } }
  finalizeChange(c)
  return { ok: true }
}

function ensureLine(r: ChangeReceiver): string {
  if (r.lineId) return r.lineId
  const spec = r.newLine!
  const existing = findLine(spec.account, spec.dept, spec.project)
  if (existing) return existing.id
  const l: BudgetLine = { id: `bl${nextSeq()}`, year: BUDGET_YEAR, account: spec.account, dept: spec.dept, project: spec.project, months: Array(12).fill(0) }
  budget.lines.push(l)
  r.lineId = l.id
  return l.id
}

/** Approval posts a new version; changes post as deltas so two approvals at once both land. */
/**
 * Take a cut from the donor without any month dropping below zero: the change
 * month first, then later months, then earlier ones.
 */
export function allocateCut(l: BudgetLine, amount: number, month: number): VersionChange[] {
  const order = [month, ...Array.from({ length: 11 - month }, (_, i) => month + 1 + i), ...Array.from({ length: month }, (_, i) => month - 1 - i)]
  const out: VersionChange[] = []
  let left = amount
  for (const m of order) {
    if (left <= 0) break
    const take = Math.min(left, Math.max(0, l.months[m] ?? 0))
    if (take > 0) { out.push({ lineId: l.id, month: m, delta: -take }); left -= take }
  }
  return out
}

function finalizeChange(c: ChangeDoc) {
  releaseHold(c, 'Posted')
  const changes: VersionChange[] = []
  if (c.donor) {
    const d = lineById(c.donor.lineId)!
    for (const ch of allocateCut(d, c.donor.amount, c.month)) {
      d.months[ch.month] = (d.months[ch.month] ?? 0) + ch.delta
      changes.push(ch)
    }
  }
  for (const r of c.receivers) {
    const id = ensureLine(r)
    const l = lineById(id)!
    l.months[c.month] = (l.months[c.month] ?? 0) + r.amount
    changes.push({ lineId: id, month: c.month, delta: r.amount })
  }
  const no = currentVersion() + 1
  budget.versions.push({
    no, year: BUDGET_YEAR, type: c.kind, docNo: c.number, reason: c.reason, requestedBy: c.preparedBy,
    approvedBy: [...c.chain].reverse().find((s) => s.status === 'Approved')?.approver ?? '-', at: nowISO(), changes,
  })
  c.version = no
  c.status = 'Approved'
  notify(c.preparedBy, `${c.number} was approved and posted as version ${no}.`, `/budget-changes/${c.id}`)
  if (c.linkedPrId) {
    const pr = prById(c.linkedPrId)
    if (pr && pr.status === 'Draft') {
      const res = submitPR(pr.id, pr.overMonthReason ?? (seeding ? undefined : 'Funded by ' + c.number))
      notify(pr.requester, res.ok
        ? `${c.number} was approved. ${pr.number} has been re-submitted for approval.`
        : `${c.number} was approved, but ${pr.number} is still short: ${res.check.blocker?.message ?? ''}`, prLink(pr))
    }
  }
}

export function rejectChange(id: string, note: string, person = actingPerson()): { ok: boolean; reason?: string } {
  const c = changeById(id)!
  const can = canApproveChange(c, person)
  if (!can.ok) return can
  const step = c.chain.find((s) => s.status === 'Waiting')!
  step.status = 'Rejected'; step.at = nowISO(); step.note = note
  c.status = 'Rejected'
  releaseHold(c, 'Rejected, hold freed')
  notify(c.preparedBy, `${c.number} was rejected: ${note}`, `/budget-changes/${c.id}`)
  if (c.linkedPrId) {
    const pr = prById(c.linkedPrId)
    if (pr) notify(pr.requester, `${c.number} was rejected. ${pr.number} stays a draft.`, prLink(pr))
  }
  return { ok: true }
}

export function withdrawChange(id: string): void {
  const c = changeById(id)!
  if (c.status !== 'Pending' && c.status !== 'Draft') return
  if (c.status === 'Pending') releaseHold(c, 'Withdrawn, hold freed')
  c.status = 'Withdrawn'
  const pr = prById(c.linkedPrId)
  if (pr && pr.fundingRequestId === c.id) pr.fundingRequestId = null
}

/** Funding request from the block screen (OD-01): the gap, the line, and a link to the request. */
export function raiseFundingRequest(prId: string): ChangeDoc {
  const pr = prById(prId)!
  if (pr.fundingRequestId) {
    const existing = changeById(pr.fundingRequestId)
    if (existing && (existing.status === 'Draft' || existing.status === 'Pending')) return existing
  }
  const gap = pr.block?.short ?? 0
  const lineId = pr.block?.lineId ?? pr.lines[0]!.lineId!
  const c = newChange({ kind: 'Funding request', month: pr.month, receivers: [{ lineId, newLine: null, amount: gap }], reason: `Funding for ${pr.number}`, linkedPrId: pr.id, preparedBy: pr.requester })
  const best = suggestDonors(lineId, gap)[0]
  c.donor = best ? { lineId: best.lineId, amount: gap } : null
  pr.fundingRequestId = c.id
  return c
}

// ── Saving bucket (OD-05) ───────────────────────────────────────────────────

export function savingLine(year = BUDGET_YEAR): BudgetLine | undefined { return findLine(SAVING_ACCOUNT, COMPANY_DEPT, null, year) }
export function sliceKey(t: Pick<SavingTag, 'dept' | 'project' | 'class' | 'type'>): string { return `${t.dept}|${t.project ?? ''}|${t.class}|${t.type}` }

export interface SavingSlice { key: string; dept: string; project: string | null; class: BudgetClass; type: SavingType; filled: number; drawn: number; held: number; balance: number }

export function savingSlices(): SavingSlice[] {
  const map = new Map<string, SavingSlice>()
  const get = (t: SavingTag) => {
    const k = sliceKey(t)
    if (!map.has(k)) map.set(k, { key: k, dept: t.dept, project: t.project, class: t.class, type: t.type, filled: 0, drawn: 0, held: 0, balance: 0 })
    return map.get(k)!
  }
  for (const c of budget.changes) {
    if (!c.saving) continue
    if (c.kind === 'Saving fill' && c.status === 'Approved') get(c.saving).filled += changeTotal(c)
    if (c.kind === 'Saving draw' && c.status === 'Approved') get(c.saving).drawn += changeTotal(c)
    if (c.kind === 'Saving draw' && c.status === 'Pending') get(c.saving).held += changeTotal(c)
  }
  for (const s of map.values()) s.balance = s.filled - s.drawn - s.held
  return [...map.values()]
}
export function sliceBalance(key: string): number { return savingSlices().find((s) => s.key === key)?.balance ?? 0 }

/** Fill the bucket by transfer from the line that saved the money. */
export function fillSaving(input: { fromLineId: string; amount: number; type: SavingType; sourceDoc: string; reason: string; month?: number }): ChangeDoc {
  const from = lineById(input.fromLineId)!
  const sl = savingLine()!
  return newChange({
    kind: 'Saving fill', month: input.month ?? BUDGET_CURRENT_MONTH,
    donor: { lineId: from.id, amount: input.amount }, receivers: [{ lineId: sl.id, newLine: null, amount: input.amount }],
    reason: input.reason, saving: { dept: from.dept, project: from.project, class: lineClass(from)!, type: input.type, sourceDoc: input.sourceDoc },
  })
}

/** Draw from one slice to a line; goes to the CFO alone (or the President Director when the CFO benefits). */
export function drawSaving(input: { sliceKey: string; toLineId: string; amount: number; reason: string }): ChangeDoc {
  const s = savingSlices().find((x) => x.key === input.sliceKey)!
  const sl = savingLine()!
  return newChange({
    kind: 'Saving draw', donor: { lineId: sl.id, amount: input.amount }, receivers: [{ lineId: input.toLineId, newLine: null, amount: input.amount }],
    reason: input.reason, saving: { dept: s.dept, project: s.project, class: s.class, type: s.type, sourceDoc: '' },
  })
}

// ── Lines, import and lock (FG-1) ───────────────────────────────────────────

export interface ImportRow { row: number; account: string; dept: string; project: string; months: (number | string)[] }
export interface ImportError { row: number; message: string }

/** All or nothing: any bad row loads nothing (FG1-AC5). */
export function validateImport(rows: ImportRow[], year: number): ImportError[] {
  const errs: ImportError[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    const acct = budgetAccount(r.account)
    if (!acct) errs.push({ row: r.row, message: `Unknown account ${r.account}` })
    else if (!acct.class && !acct.savingOnly) errs.push({ row: r.row, message: `${acct.code} has no Opex or Capex class` })
    else if (acct.savingOnly) errs.push({ row: r.row, message: 'The saving account cannot take budget by import' })
    if (!BUDGET_DEPARTMENTS.some((d) => d.id === r.dept)) errs.push({ row: r.row, message: `Unknown department ${r.dept}` })
    if (r.project && !BUDGET_PROJECTS.some((p) => p.id === r.project)) errs.push({ row: r.row, message: `Unknown project ${r.project}` })
    r.months.forEach((v, i) => {
      if (typeof v !== 'number' || !Number.isFinite(v)) errs.push({ row: r.row, message: `${monthName(i)} is not a number` })
      else if (!Number.isInteger(v)) errs.push({ row: r.row, message: `${monthName(i)} has decimals; use whole rupiah` })
      else if (v < 0) errs.push({ row: r.row, message: `${monthName(i)} is negative` })
    })
    const k = `${r.account}|${r.dept}|${r.project}`
    if (seen.has(k) || budget.lines.some((l) => l.year === year && `${l.account}|${l.dept}|${l.project ?? ''}` === k && !isDraftYear(year))) errs.push({ row: r.row, message: 'A line with this account, department and project already exists' })
    seen.add(k)
  }
  return errs
}
function isDraftYear(year: number) { return !isLocked(year) }

export function importLines(rows: ImportRow[], year: number): { ok: boolean; errors: ImportError[] } {
  if (isLocked(year)) return { ok: false, errors: [{ row: 0, message: `${year} is locked. Change it by revision or transfer.` }] }
  const errors = validateImport(rows, year)
  if (errors.length) return { ok: false, errors }
  budget.lines = budget.lines.filter((l) => l.year !== year)
  for (const r of rows) {
    budget.lines.push({ id: `bl${nextSeq()}`, year, account: r.account, dept: r.dept, project: r.project || null, months: r.months as number[] })
  }
  if (!yearState(year)) budget.years.push({ year, status: 'Draft', approvedTotal: null, lockedBy: null, lockedAt: null })
  return { ok: true, errors: [] }
}

export function draftTotal(year: number): number { return budget.lines.filter((l) => l.year === year).reduce((s, l) => s + lineTotal(l), 0) }

/** Lock: the approved total must match the draft total; lock posts Version 0 and turns the check on. */
export function lockYear(year: number, approvedTotal: number): { ok: boolean; gap: number } {
  const total = draftTotal(year)
  const gap = approvedTotal - total
  if (gap !== 0 || total === 0) return { ok: false, gap }
  let ys = yearState(year)
  if (!ys) { ys = { year, status: 'Draft', approvedTotal: null, lockedBy: null, lockedAt: null }; budget.years.push(ys) }
  ys.status = 'Locked'; ys.approvedTotal = approvedTotal; ys.lockedBy = actingPerson(); ys.lockedAt = nowISO()
  budget.versions.push({
    no: 0, year, type: 'Original', docNo: `Budget ${year}`, reason: 'Approved budget locked', requestedBy: actingPerson(), approvedBy: CFO_NAME, at: nowISO(),
    changes: budget.lines.filter((l) => l.year === year).flatMap((l) => l.months.map((v, m) => ({ lineId: l.id, month: m, delta: v })).filter((c) => c.delta)),
  })
  return { ok: true, gap: 0 }
}

/** Spread a year total evenly in whole rupiah; the residue lands in December (LR-10). */
export function spreadEvenly(total: number): number[] {
  const base = Math.floor(total / 12)
  const months = Array(12).fill(base) as number[]
  months[11] = total - base * 11
  return months
}

/** Version compare: line amounts as at version `a` and `b`. */
export function lineAtVersion(lineId: string, no: number, year = BUDGET_YEAR): number {
  return budget.versions.filter((v) => v.year === year && v.no <= no).flatMap((v) => v.changes).filter((c) => c.lineId === lineId).reduce((s, c) => s + c.delta, 0)
}

// ── Control settings (FG-3.6): a change needs CFO approval and starts next day ──

export function requestSettingsChange(patch: Partial<ControlSettings>): SettingChange {
  const sc: SettingChange = { id: `set${nextSeq()}`, patch, requestedBy: actingPerson(), requestedAt: nowISO(), status: 'Pending', approvedBy: null, effectiveFrom: null }
  budget.settingChanges.unshift(sc)
  notify(CFO_NAME, 'A budget control setting change waits for your approval.', '/budget-settings')
  return sc
}
export function decideSettingsChange(id: string, approve: boolean, person = actingPerson()): { ok: boolean; reason?: string } {
  const sc = budget.settingChanges.find((x) => x.id === id)
  if (!sc || sc.status !== 'Pending') return { ok: false, reason: 'Nothing to decide.' }
  if (person !== CFO_NAME) return { ok: false, reason: 'Only the CFO approves control setting changes.' }
  sc.status = approve ? 'Approved' : 'Rejected'
  sc.approvedBy = person
  if (approve) {
    sc.effectiveFrom = '2026-10-06'
    // The prototype applies it now and labels the start date as tomorrow; existing holds stay.
    Object.assign(budget.settings, sc.patch)
  }
  return { ok: true }
}

// ── Report helpers (FG-6) ───────────────────────────────────────────────────

export interface ReportFilter { depts: string[]; projects: (string | null)[]; accounts: string[]; classes: BudgetClass[] }
export function matchesFilter(l: BudgetLine, f: ReportFilter): boolean {
  return (!f.depts.length || f.depts.includes(l.dept))
    && (!f.projects.length || f.projects.includes(l.project ?? null))
    && (!f.accounts.length || f.accounts.includes(l.account))
    && (!f.classes.length || (lineClass(l) !== null && f.classes.includes(lineClass(l)!)))
}
export function movedIn(lineId: string, scope: Scope = {}): number {
  return budget.versions.filter((v) => v.type !== 'Original').flatMap((v) => v.changes).filter((c) => c.lineId === lineId && c.delta > 0 && inScope(c.month, scope)).reduce((s, c) => s + c.delta, 0)
}
export function movedOut(lineId: string, scope: Scope = {}): number {
  return -budget.versions.filter((v) => v.type !== 'Original').flatMap((v) => v.changes).filter((c) => c.lineId === lineId && c.delta < 0 && inScope(c.month, scope)).reduce((s, c) => s + c.delta, 0)
}
export function savedFrom(lineId: string): number {
  return budget.changes.filter((c) => c.kind === 'Saving fill' && c.status === 'Approved' && c.donor?.lineId === lineId).reduce((s, c) => s + changeTotal(c), 0)
}
/** Documents behind a figure, for drill-down. */
export function docsBehind(lineId: string, type: EntryType, scope: Scope = {}): { docNo: string; docKind: DocKind; docId: string; amount: number }[] {
  const map = new Map<string, { docNo: string; docKind: DocKind; docId: string; amount: number }>()
  for (const e of budget.entries) {
    if (e.lineId !== lineId || e.type !== type || !inScope(e.month, scope)) continue
    // Attribute take-over entries to the document that holds the money now.
    const owner = ownerOf(e)
    const k = owner.docId
    const prev = map.get(k) ?? { ...owner, amount: 0 }
    prev.amount += e.amount
    map.set(k, prev)
  }
  return [...map.values()].filter((d) => d.amount !== 0)
}
function ownerOf(e: LedgerEntry): { docNo: string; docKind: DocKind; docId: string } {
  // Take-over entries belong to the document whose hold they reduce.
  const ownerId = e.ref?.split(':')[0]
  const pr = prById(ownerId ?? null)
  if (pr) return { docNo: pr.number, docKind: 'PR', docId: pr.id }
  const po = poById(ownerId ?? null)
  if (po) return { docNo: po.number, docKind: 'PO', docId: po.id }
  return { docNo: e.docNo, docKind: e.docKind, docId: e.docId }
}

export function noticesFor(person: string): BudgetNotice[] { return budget.notices.filter((n) => n.to === person) }

// ── Sample data ─────────────────────────────────────────────────────────────

/**
 * IFT-style sample: Networking runs the Bekasi fiber ring (Project A) and the
 * Cikarang backbone (Project B). Built by running the real functions above, so
 * every figure comes out of the same rules the screens use.
 */
/** Purchase requests the sample creates, so the Purchases screens show the same documents. */
const SAMPLE_PR_NUMBERS = [90118, 90131, 90138, 90120, 90145]

function linkPurchaseRequest(pr: BudgetPR, requiredDate: string): void {
  const num = Number(pr.number.replace('#', ''))
  let rec = purchaseRequests.find((r) => r.number === num)
  if (!rec) {
    const lines: PurchaseRequestLine[] = pr.lines.map((l) => ({
      product: l.description, sku: '', description: l.description, requestedQty: 1, availableQty: 0, unit: 'Lot', unitCost: l.amount, taxLabel: 'PPN 11%',
    }))
    rec = addPurchaseRequest({ number: num, date: pr.date, procurementStaff: pr.requester, requiredDate, status: 'open', totalProducts: lines.length, urgency: 'medium', lines, awaitingApproval: pr.status === 'Pending' })
  }
  pr.purchaseRequestId = rec.id
}

function seed() {
  seeding = true
  // Drop purchase requests a previous session linked to the budget, except the sample's own.
  const linked = budget.prs.map((p) => p.purchaseRequestId).filter((x): x is string => !!x)
    .filter((id) => !SAMPLE_PR_NUMBERS.includes(purchaseRequests.find((r) => r.id === id)?.number ?? -1))
  if (linked.length) deletePurchaseRequests(linked)
  Object.assign(budget, emptyState())
  const L = (account: string, dept: string, project: string | null, months: number[]) => ({ account, dept, project, months })
  const rows = [
    L('6-60120', 'NW', 'PA', [20, 20, 10, 20, 20, 20, 20, 20, 20, 20, 20, 20]),
    L('6-60103', 'NW', 'PA', [11, 11, 11, 11, 11, 11, 11, 11, 11, 19, 0, 0]),
    L('6-60130', 'NW', 'PA', [6, 6, 16, 6, 6, 6, 6, 6, 6, 6, 10, 10]),
    L('1-17010', 'NW', 'PA', Array(12).fill(200)),
    L('6-60120', 'NW', 'PB', [7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 5, 5]),
    L('6-60111', 'NW', null, Array(12).fill(2)),
    L('6-60120', 'OP', null, Array(12).fill(5)),
    L('6-60130', 'OP', null, [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 0, 0]),
    L('1-15020', 'IT', null, [40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 50, 50]),
    L(SAVING_ACCOUNT, COMPANY_DEPT, null, Array(12).fill(0)),
  ]
  const jt = 1_000_000
  budget.years.push({ year: BUDGET_YEAR, status: 'Draft', approvedTotal: null, lockedBy: null, lockedAt: null })
  for (const r of rows) budget.lines.push({ id: `bl${nextSeq()}`, year: BUDGET_YEAR, account: r.account, dept: r.dept, project: r.project, months: r.months.map((v) => v * jt) })
  budget.viewAs = 'Budget Controller'
  lockYear(BUDGET_YEAR, draftTotal(BUDGET_YEAR))
  const lockV = budget.versions[0]!
  lockV.at = '2025-12-20T10:00:00+07:00'; lockV.requestedBy = BUDGET_CONTROLLER_NAME
  const ys = yearState()!; ys.lockedAt = lockV.at; ys.lockedBy = BUDGET_CONTROLLER_NAME

  const id = (acct: string, dept: string, project: string | null) => findLine(acct, dept, project)!.id
  const ACC_PA = id('6-60120', 'NW', 'PA'), MEALS_PA = id('6-60103', 'NW', 'PA'), TOOLS_PA = id('6-60130', 'NW', 'PA')
  const CABLE_PA = id('1-17010', 'NW', 'PA'), ACC_PB = id('6-60120', 'NW', 'PB'), OFFICE_NW = id('6-60111', 'NW', null)
  const TOOLS_OP = id('6-60130', 'OP', null), ACC_OP = id('6-60120', 'OP', null), NET_IT = id('1-15020', 'IT', null)

  // v1: March transfer Tools -> Accommodation, same department, holder alone.
  budget.viewAs = 'Budget Controller'
  const tr = newChange({ kind: 'Transfer', month: 2, donor: { lineId: TOOLS_PA, amount: 10 * jt }, receivers: [{ lineId: ACC_PA, newLine: null, amount: 10 * jt }], reason: 'Crew rotation moved to Bekasi in March', number: 'TR-2026-0102' })
  submitChange(tr.id); approveChange(tr.id, 'Dimas Pratama')
  tr.submittedAt = '2026-03-02T09:00:00+07:00'; tr.createdAt = tr.submittedAt
  budget.versions[budget.versions.length - 1]!.at = '2026-03-03T10:00:00+07:00'

  // Actuals Jan-Sep from monthly invoices (price before PPN), spread whole rupiah.
  const vendors = ['Hotel Santika Bekasi', 'PT Boga Rasa', 'PT Alat Teknik', 'PT Kabel Nusantara', 'Hotel Amaris Cikarang', 'PT Sinar Kantor', 'PT Mitra Jaringan']
  const actuals: [string, number, number][] = [
    [ACC_PA, 165 * jt, 0], [MEALS_PA, 70 * jt, 1], [TOOLS_PA, 30 * jt, 2], [CABLE_PA, 1_000 * jt, 3], [ACC_PB, 45 * jt, 4],
    [OFFICE_NW, 14 * jt, 5], [ACC_OP, 38 * jt, 4], [TOOLS_OP, 22 * jt, 2], [NET_IT, 260 * jt, 6],
  ]
  let billNo = 700
  for (const [lineId, total, v] of actuals) {
    const l = lineById(lineId)!
    const per = Math.floor(total / 9)
    for (let m = 0; m < 9; m++) {
      const amount = m === 8 ? total - per * 8 : per
      postBill({ poId: null, vendor: vendors[v]!, date: `2026-${String(m + 1).padStart(2, '0')}-25`, number: `PI-2026-${String(++billNo).padStart(4, '0')}`,
        lines: [{ poLine: null, account: l.account, dept: l.dept, project: l.project, amount, description: 'Monthly invoice' }] })
    }
  }
  budget.bills.forEach((b) => { b.overBudget = null })
  postJournal({ lineId: OFFICE_NW, month: 8, amount: 1 * jt, docNo: 'JE-2026-0311' })
  postJournal({ lineId: CABLE_PA, month: 8, amount: 1_000 * jt, docNo: 'JE-2026-0318', reclass: true })
  // A bill posted to a mix with no budget line (shows on its own report row).
  postBill({ poId: null, vendor: 'PT Sinar Kantor', date: '2026-09-18', number: 'PI-2026-0790', lines: [{ poLine: null, account: '6-60111', dept: 'OP', project: 'PA', amount: 4 * jt, description: 'Site office stationery' }] })

  // Cable PO: Rp250jt, Rp200jt received and invoiced, Rp50jt still open.
  budget.viewAs = 'Requester'
  const prCable = createPR({ requester: 'Andi Saputra', date: '2026-08-04', number: '#90118', lines: [{ account: '1-17010', dept: 'NW', project: 'PA', amount: 250 * jt, description: 'Fiber optic cable 10.000 m' }] })
  submitPR(prCable.id, 'Crew schedule front-loaded this month'); approvePR(prCable.id); approvePR(prCable.id)
  budget.viewAs = 'Procurement Officer'
  const poCable = createPO({ prId: prCable.id, vendor: 'PT Kabel Nusantara', date: '2026-08-10', number: 'PO-2026-0412', lines: [{ prLine: 0, lineId: CABLE_PA, description: 'Fiber optic cable 10.000 m', amount: 250 * jt }] }).po!
  markFullyOrdered(prCable.id)
  budget.viewAs = 'AP Staff'
  postBill({ poId: poCable.id, vendor: 'PT Kabel Nusantara', date: '2026-09-12', number: 'PI-2026-0781', lines: [{ poLine: 0, account: '1-17010', dept: 'NW', project: 'PA', amount: 200 * jt, description: 'Fiber optic cable 8.000 m' }] })

  // Accommodation on Project A: two approved requests (Rp20jt) and an open PO (Rp25jt).
  budget.viewAs = 'Requester'
  const prA = createPR({ requester: 'Andi Saputra', date: '2026-09-22', number: '#90131', lines: [{ account: '6-60120', dept: 'NW', project: 'PA', amount: 12 * jt, description: 'Hotel, splicing crew week 39' }] })
  submitPR(prA.id, 'Crew schedule front-loaded this month'); approvePR(prA.id); approvePR(prA.id)
  const prB = createPR({ requester: 'Andi Saputra', date: '2026-10-01', number: '#90138', lines: [{ account: '6-60120', dept: 'NW', project: 'PA', amount: 8 * jt, description: 'Hotel, survey team' }] })
  submitPR(prB.id, 'Crew schedule front-loaded this month'); approvePR(prB.id); approvePR(prB.id)
  const prC = createPR({ requester: 'Andi Saputra', date: '2026-10-02', number: '#90120', lines: [{ account: '6-60120', dept: 'NW', project: 'PA', amount: 25 * jt, description: 'Hotel block booking, October' }] })
  submitPR(prC.id, 'Crew schedule front-loaded this month'); approvePR(prC.id); approvePR(prC.id)
  budget.viewAs = 'Procurement Officer'
  createPO({ prId: prC.id, vendor: 'Hotel Santika Bekasi', date: '2026-10-03', number: 'PO-2026-0398', lines: [{ prLine: 0, lineId: ACC_PA, description: 'Hotel block booking, October', amount: 25 * jt }] })
  markFullyOrdered(prC.id)

  // A request waiting for approval on Project B (shows as Pending, not held).
  budget.viewAs = 'Requester'
  const prP = createPR({ requester: 'Andi Saputra', date: '2026-10-04', number: '#90145', lines: [{ account: '6-60120', dept: 'NW', project: 'PB', amount: 12 * jt, description: 'Hotel, backbone survey' }] })
  submitPR(prP.id, 'Crew schedule front-loaded this month')

  // An idle PO on Operations tools: last receipt 95 days ago.
  budget.viewAs = 'Procurement Officer'
  createPO({ prId: null, vendor: 'PT Alat Teknik', date: '2026-06-20', number: 'PO-1102', lastActivity: '2026-07-02', lines: [{ prLine: null, lineId: TOOLS_OP, description: 'Splicing machine service kit', amount: 12 * jt }] })

  // Saving bucket: Rp8jt procurement saving from a meals PO that came in low.
  budget.viewAs = 'Budget Controller'
  const fill = fillSaving({ fromLineId: MEALS_PA, amount: 8 * jt, type: 'Procurement', sourceDoc: 'PO-2026-0377', reason: 'Catering PO came in under the request', month: 5 })
  submitChange(fill.id); approveChange(fill.id, CFO_NAME)
  fill.submittedAt = '2026-06-15T09:00:00+07:00'; fill.createdAt = fill.submittedAt
  budget.versions[budget.versions.length - 1]!.at = '2026-06-16T10:00:00+07:00'

  for (const pr of budget.prs) linkPurchaseRequest(pr, pr.date.slice(0, 8) + '28')
  linkBudgetPurchaseOrders()
  runTieOut('2026-10-05T01:00:00+07:00')
  budget.viewAs = 'Requester'
  seeding = false
}

export function resetBudget(): void {
  seed()
}

// Load: a saved snapshot wins over the sample.
const snap = loadSnapshot<BudgetState>(SNAPSHOT_KEY)
if (snap && snap[0]) Object.assign(budget, snap[0])
else seed()

watch(budget, () => saveSnapshot(SNAPSHOT_KEY, [budget]), { deep: true })

export const budgetLinesThisYear = computed(() => budget.lines.filter((l) => l.year === BUDGET_YEAR))


// ── saving additions ──
// Saving bucket (FG-5) and control settings (FG-3.6) helpers for the Saving
// bucket and Budget settings screens. New functions only; the rules above stay.

export interface SavingBucketStats {
  /** What the slices can still give: filled − drawn − held by pending draws. */
  balance: number
  filled: number
  drawn: number
  held: number
  pendingDraws: number
}

/** Bucket headline figures for the year, read from the slices (LR-4: nothing stored). */
export function savingBucketStats(): SavingBucketStats {
  const slices = savingSlices()
  return {
    balance: slices.reduce((s, x) => s + x.balance, 0),
    filled: slices.reduce((s, x) => s + x.filled, 0),
    drawn: slices.reduce((s, x) => s + x.drawn, 0),
    held: slices.reduce((s, x) => s + x.held, 0),
    pendingDraws: budget.changes.filter((c) => c.kind === 'Saving draw' && c.status === 'Pending').length,
  }
}

/** Fills and draws past draft, newest first. */
export function savingHistory(): ChangeDoc[] {
  return budget.changes
    .filter((c) => (c.kind === 'Saving fill' || c.kind === 'Saving draw') && c.status !== 'Draft')
    .sort((a, b) => (b.submittedAt ?? b.createdAt).localeCompare(a.submittedAt ?? a.createdAt))
}

/** Who decided a change, or who it waits for. */
export function changeApprover(c: ChangeDoc): { name: string; decided: boolean } {
  const decided = [...c.chain].reverse().find((s) => s.status === 'Approved' || s.status === 'Rejected')
  const waiting = c.chain.find((s) => s.status === 'Waiting')
  if (c.status === 'Pending' && waiting) return { name: waiting.approver, decided: false }
  return { name: decided?.approver ?? '-', decided: !!decided }
}

/** Saving draws waiting for approval; `person` narrows to the draws waiting for them. */
export function pendingSavingDraws(person?: string): ChangeDoc[] {
  return budget.changes.filter((c) => c.kind === 'Saving draw' && c.status === 'Pending'
    && (!person || c.chain.find((s) => s.status === 'Waiting')?.approver === person))
}

/** FG-5.6: the Budget Controller raises draws; the CFO approves them and never raises one (FG5-AC2). */
export function canRaiseSavingDraw(person = actingPerson()): { ok: boolean; reason?: string } {
  if (person === CFO_NAME) return { ok: false, reason: 'The CFO approves saving draws and cannot raise one.' }
  if (person !== BUDGET_CONTROLLER_NAME) return { ok: false, reason: 'Only the Budget Controller raises saving draws.' }
  return { ok: true }
}

/** Guarded draw: refuses the CFO and anyone but the Budget Controller, and an empty or unknown slice. */
export function raiseSavingDraw(input: { sliceKey: string; toLineId: string; amount: number; reason: string }, person = actingPerson()):
  { ok: boolean; reason?: string; change?: ChangeDoc } {
  const can = canRaiseSavingDraw(person)
  if (!can.ok) return can
  const slice = savingSlices().find((x) => x.key === input.sliceKey)
  if (!slice) return { ok: false, reason: 'This saving slice does not exist.' }
  if (slice.balance <= 0) return { ok: false, reason: 'Nothing is left to draw on this slice.' }
  return { ok: true, change: drawSaving(input) }
}

/** Find a slice from the `slice` query value. */
export function savingSliceByKey(key: string | null | undefined): SavingSlice | undefined {
  return key ? savingSlices().find((s) => s.key === key) : undefined
}

// Control settings (FG-3.6): the Finance Admin edits, the CFO approves.
const FINANCE_ADMIN_NAME = 'Maya Lestari'

export function canEditBudgetSettings(person = actingPerson()): boolean { return person === FINANCE_ADMIN_NAME }

/**
 * Ask for a settings change. Only the Finance Admin asks, a patch must change
 * something, and numbers stay in range. The change waits for the CFO.
 */
export function requestControlChange(patch: Partial<ControlSettings>, person = actingPerson()):
  { ok: boolean; reason?: string; change?: SettingChange } {
  if (!canEditBudgetSettings(person)) return { ok: false, reason: 'Only the Finance Admin changes budget control settings.' }
  const cur = budget.settings as unknown as Record<string, unknown>
  const diff = Object.fromEntries(Object.entries(patch).filter(([k, v]) => v !== undefined && cur[k] !== v)) as Partial<ControlSettings>
  if (!Object.keys(diff).length) return { ok: false, reason: 'Nothing changed.' }
  const num = (k: keyof ControlSettings, min: number, max: number, label: string) => {
    const v = diff[k]
    if (v === undefined) return null
    return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? null : label
  }
  const bad = [
    num('smallMoveLimit', 0, 1e15, 'Enter the one-approver limit in whole rupiah.'),
    num('smallMoveDays', 1, 366, 'Enter the running-total window as 1 to 366 days.'),
    num('fundingCapPct', 0, 100, 'Enter the funding cap as 0 to 100 percent.'),
    num('fundingPerQuarter', 1, 99, 'Enter funding requests per quarter as a whole number from 1.'),
    num('invoiceTolerancePct', 0, 100, 'Enter the invoice tolerance as 0 to 100 percent.'),
  ].find(Boolean)
  if (bad) return { ok: false, reason: bad }
  return { ok: true, change: requestSettingsChange(diff) }
}

export function pendingSettingChanges(): SettingChange[] { return budget.settingChanges.filter((s) => s.status === 'Pending') }

/** A year still taking spend: the engine keeps no closed state, so every year on record is open. */
export function openBudgetYears(): number[] { return budget.years.map((y) => y.year).sort() }

/** The first open year with a budget line on this account, or null. */
export function accountOpenLineYear(code: string): number | null {
  const open = openBudgetYears()
  return budget.lines.filter((l) => l.account === code && open.includes(l.year)).map((l) => l.year).sort()[0] ?? null
}

/**
 * Account class tags set on screen. Kept apart from the ledger snapshot and
 * applied onto the account list so every rule that reads the class sees it.
 */
const CLASS_KEY = 'advanced-budgeting-account-classes'
export const accountClassTags = reactive<Record<string, BudgetClass | null>>({})
;(function loadClassTags() {
  const snapTags = loadSnapshot<Record<string, BudgetClass | null>>(CLASS_KEY)?.[0]
  if (snapTags) Object.assign(accountClassTags, snapTags)
  for (const [code, cls] of Object.entries(accountClassTags)) {
    const a = budgetAccount(code)
    if (a) a.class = cls
  }
})()

/** The class an account carries now (reactive). */
export function accountClassOf(code: string): BudgetClass | null {
  return code in accountClassTags ? accountClassTags[code] ?? null : budgetAccount(code)?.class ?? null
}

/** Finance Admin tags an account Opex or Capex; an account on a line in an open year keeps its class (PSAK 16). */
export function setAccountClass(code: string, cls: BudgetClass | null, person = actingPerson()): { ok: boolean; reason?: string } {
  if (!canEditBudgetSettings(person)) return { ok: false, reason: 'Only the Finance Admin sets account classes.' }
  const a = budgetAccount(code)
  if (!a) return { ok: false, reason: 'Unknown account.' }
  if (a.savingOnly) return { ok: false, reason: 'The saving account carries no class.' }
  const year = accountOpenLineYear(code)
  if (year !== null) return { ok: false, reason: `This account sits on a ${year} budget line.` }
  if (accountClassOf(code) === cls) return { ok: false, reason: 'Nothing changed.' }
  accountClassTags[code] = cls
  a.class = cls
  saveSnapshot(CLASS_KEY, [{ ...accountClassTags }])
  return { ok: true }
}

// ── lines additions ─────────────────────────────────────────────────────────
// FG-1 screen paths: who may change lines, adding a line to a draft year, and
// role-checked wrappers for import and lock. A hidden action also refuses here.

export const LOCKED_EDIT_MESSAGE = 'Locked. Change it by revision or transfer.'

/** FG-1.6: the Budget Controller creates lines, imports, locks and raises revisions. */
export function canManageBudgetLines(role: BudgetRole = budget.viewAs): boolean {
  return role === 'Budget Controller'
}

function ensureYearState(year: number): BudgetYearState {
  let ys = yearState(year)
  if (!ys) { ys = { year, status: 'Draft', approvedTotal: null, lockedBy: null, lockedAt: null }; budget.years.push(ys) }
  return ys
}

function monthErrors(months: unknown[]): string[] {
  const errs: string[] = []
  if (months.length !== 12) errs.push('Enter an amount for each of the 12 months.')
  months.forEach((v, i) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) errs.push(`${monthName(i)} is not a number.`)
    else if (!Number.isInteger(v)) errs.push(`${monthName(i)} has decimals; use whole rupiah.`)
    else if (v < 0) errs.push(`${monthName(i)} cannot be negative.`)
  })
  return errs
}

/** Add one line to a draft year (FG1-AC1). A locked year refuses (LR-5). */
export function addDraftLine(input: { year: number; account: string; dept: string; project: string | null; months: number[] }):
  { ok: boolean; errors: string[]; line?: BudgetLine } {
  if (!canManageBudgetLines()) return { ok: false, errors: ['Only the Budget Controller adds budget lines.'] }
  if (isLocked(input.year)) return { ok: false, errors: [LOCKED_EDIT_MESSAGE] }
  const errors: string[] = []
  const acct = budgetAccount(input.account)
  if (!input.dept) errors.push('Pick a department.')
  else if (!BUDGET_DEPARTMENTS.some((d) => d.id === input.dept)) errors.push('Pick a department.')
  if (!acct) errors.push('Pick an account.')
  else if (acct.savingOnly) errors.push('The saving account cannot take budget on a line.')
  else if (!acct.class) errors.push(`${acct.code} ${acct.name} has no Opex or Capex class. Finance Admin sets it first.`)
  errors.push(...monthErrors(input.months))
  const project = input.project || null
  if (!errors.length && findLine(input.account, input.dept, project, input.year)) errors.push('A line with this account, department and project already exists.')
  if (!errors.length && input.months.reduce((s, v) => s + v, 0) <= 0) errors.push('Enter at least one month amount.')
  if (errors.length) return { ok: false, errors }
  ensureYearState(input.year)
  const line: BudgetLine = { id: `bl${nextSeq()}`, year: input.year, account: input.account, dept: input.dept, project, months: [...input.months] }
  budget.lines.push(line)
  return { ok: true, errors: [], line }
}

/** Change month amounts on screen: draft years only. A locked year points to revision or transfer. */
export function updateLineMonths(lineId: string, months: number[]): { ok: boolean; errors: string[] } {
  const l = lineById(lineId)
  if (!l) return { ok: false, errors: ['This budget line no longer exists.'] }
  if (!canManageBudgetLines()) return { ok: false, errors: ['Only the Budget Controller changes budget lines.'] }
  if (isLocked(l.year)) return { ok: false, errors: [LOCKED_EDIT_MESSAGE] }
  const errors = monthErrors(months)
  if (errors.length) return { ok: false, errors }
  l.months = [...months]
  return { ok: true, errors: [] }
}

/** Import with the role check in front of the engine's all-or-nothing load. */
export function importLinesAs(rows: ImportRow[], year: number): { ok: boolean; errors: ImportError[] } {
  if (!canManageBudgetLines()) return { ok: false, errors: [{ row: 0, message: 'Only the Budget Controller imports budget lines.' }] }
  return importLines(rows, year)
}

/** Lock with the role check (FG1-AC8) in front of the engine's total match. */
export function lockYearAs(year: number, approvedTotal: number): { ok: boolean; gap: number; message?: string } {
  if (!canManageBudgetLines()) return { ok: false, gap: 0, message: 'Only the Budget Controller locks the budget.' }
  if (isLocked(year)) return { ok: false, gap: 0, message: `${year} is already locked.` }
  const total = draftTotal(year)
  if (total === 0) return { ok: false, gap: 0, message: `${year} has no budget lines to lock.` }
  const res = lockYear(year, approvedTotal)
  if (!res.ok) return { ...res, message: `The approved total differs from the draft by ${rupiah(Math.abs(res.gap))}. They must match to lock.` }
  return res
}

/** The latest version that changed a line, or null while its year is a draft. */
export function lineVersionNo(lineId: string): number | null {
  const l = lineById(lineId)
  if (!l) return null
  const nos = budget.versions.filter((v) => v.year === l.year && v.changes.some((c) => c.lineId === lineId)).map((v) => v.no)
  if (nos.length) return Math.max(...nos)
  return isLocked(l.year) ? 0 : null
}

// ── changes additions ──────────────────────────────────────────────────────
// FG-4 screens: who may prepare which change, saving and submitting drafts from
// the form, withdraw by the preparer, and reading notices. New functions only;
// every rule still runs through validateChange, routeChain and submitChange.

/** The fields the change form edits. */
export interface ChangeDraftInput {
  kind: ChangeKind
  month: number
  donor: { lineId: string; amount: number } | null
  receivers: ChangeReceiver[]
  reason: string
  reasonCode: string | null
  linkedPrId: string | null
  saving: SavingTag | null
}

/** FG-4.6 / FG-5.6: the Budget Controller prepares changes; a requester raises funding requests. */
export function canPrepareChange(kind: ChangeKind, role: BudgetRole = budget.viewAs): { ok: boolean; reason?: string } {
  if (role === 'Budget Controller') return { ok: true }
  if (kind === 'Funding request' && role === 'Requester') return { ok: true }
  if (kind === 'Funding request') return { ok: false, reason: 'Only the requester or the Budget Controller raises a funding request.' }
  if (kind === 'Saving draw' && role === 'CFO') return { ok: false, reason: 'The CFO approves saving draws and cannot raise one.' }
  return { ok: false, reason: 'Only the Budget Controller prepares budget changes.' }
}

/** A draft may be edited by its preparer or the Budget Controller, and only while it is a draft. */
export function canEditChange(c: ChangeDoc, role: BudgetRole = budget.viewAs): { ok: boolean; reason?: string } {
  if (c.status !== 'Draft') return { ok: false, reason: `${c.number} is ${c.status.toLowerCase()} and can no longer be edited.` }
  if (role !== 'Budget Controller' && personFor(role).person !== c.preparedBy) return { ok: false, reason: `Only ${c.preparedBy} or the Budget Controller edits this draft.` }
  return canPrepareChange(c.kind, role)
}

/** An unsaved change built from the form, for validateChange and routeChain before anything is stored. */
export function previewChange(input: ChangeDraftInput, base?: ChangeDoc): ChangeDoc {
  return {
    id: base?.id ?? 'preview', number: base?.number ?? 'New', kind: input.kind, status: 'Draft', month: input.month,
    donor: input.donor ? { ...input.donor } : null,
    receivers: input.receivers.map((r) => ({ lineId: r.lineId, newLine: r.newLine ? { ...r.newLine } : null, amount: r.amount })),
    reason: input.reason, reasonCode: input.reasonCode, preparedBy: base?.preparedBy ?? actingPerson(),
    createdAt: base?.createdAt ?? nowISO(), submittedAt: null, chain: [], linkedPrId: input.linkedPrId,
    saving: input.saving ? { ...input.saving } : null, version: null,
  }
}

function applyDraft(c: ChangeDoc, input: ChangeDraftInput) {
  c.kind = input.kind
  c.month = input.month
  c.donor = input.donor ? { ...input.donor } : null
  c.receivers = input.receivers.map((r) => ({ lineId: r.lineId, newLine: r.newLine ? { ...r.newLine } : null, amount: r.amount }))
  c.reason = input.reason
  c.reasonCode = input.reasonCode
  c.linkedPrId = input.linkedPrId
  c.saving = input.saving ? { ...input.saving } : null
}

/** Save as draft: holds nothing (FG-4.3). Creates the change, or updates the draft `id`. */
export function saveChangeDraft(input: ChangeDraftInput, id?: string): { ok: boolean; change?: ChangeDoc; reason?: string } {
  const existing = id ? changeById(id) : undefined
  if (id && !existing) return { ok: false, reason: 'This change no longer exists.' }
  const can = existing ? canEditChange(existing) : canPrepareChange(input.kind)
  if (!can.ok) return { ok: false, reason: can.reason }
  if (existing) {
    applyDraft(existing, input)
    return { ok: true, change: existing }
  }
  const c = newChange({ kind: input.kind, month: input.month })
  applyDraft(c, input)
  if (c.linkedPrId) { const pr = prById(c.linkedPrId); if (pr) pr.fundingRequestId = c.id }
  return { ok: true, change: c }
}

/** Submit from the form: validate first so a failed submit stores nothing, then save and submitChange (holds the donor). */
export function submitChangeDraft(input: ChangeDraftInput, id?: string): { ok: boolean; change?: ChangeDoc; errors: string[] } {
  const existing = id ? changeById(id) : undefined
  const can = existing ? canEditChange(existing) : canPrepareChange(input.kind)
  if (!can.ok) return { ok: false, errors: [can.reason!] }
  const errors = validateChange(previewChange(input, existing))
  if (errors.length) return { ok: false, errors }
  const saved = saveChangeDraft(input, id)
  if (!saved.ok) return { ok: false, errors: [saved.reason!] }
  const res = submitChange(saved.change!.id)
  return { ok: res.ok, change: saved.change, errors: res.errors }
}

/** Withdraw: the preparer or the Budget Controller; a pending change frees its hold. */
export function canWithdrawChange(c: ChangeDoc, role: BudgetRole = budget.viewAs): { ok: boolean; reason?: string } {
  if (c.status !== 'Draft' && c.status !== 'Pending') return { ok: false, reason: `${c.number} is ${c.status.toLowerCase()} and cannot be withdrawn.` }
  if (role !== 'Budget Controller' && personFor(role).person !== c.preparedBy) return { ok: false, reason: `Only ${c.preparedBy} or the Budget Controller withdraws this change.` }
  return { ok: true }
}
export function withdrawChangeAs(id: string, role: BudgetRole = budget.viewAs): { ok: boolean; reason?: string } {
  const c = changeById(id)
  if (!c) return { ok: false, reason: 'This change no longer exists.' }
  const can = canWithdrawChange(c, role)
  if (!can.ok) return can
  withdrawChange(id)
  if (c.linkedPrId) { const pr = prById(c.linkedPrId); if (pr && pr.fundingRequestId === c.id) pr.fundingRequestId = null }
  return { ok: true }
}

/** What a change still holds on its donor line. */
export function changeHeld(id: string): number {
  return budget.entries.filter((e) => e.docId === id && e.type === 'transfer-hold').reduce((s, e) => s + e.amount, 0)
}

export function markNoticeRead(id: number): void {
  const n = budget.notices.find((x) => x.id === id)
  if (n) n.read = true
}
export function markAllNoticesRead(person: string): void {
  budget.notices.forEach((n) => { if (n.to === person) n.read = true })
}


// ── po additions ──────────────────────────────────────────────────────────────
// FG-7 close and carry, and the check on the PO and purchase invoice screens.
// New functions only; the rules above are unchanged.
import { purchaseOrders as purchaseOrderRecords, addPurchaseOrder } from './purchaseOrders'
import { loadCreated as loadCreatedRecords, saveCreated as saveCreatedRecords } from './persist'
import type { PurchaseOrder as PurchaseOrderRecord, PurchaseOrderStatus as PurchaseOrderRecordStatus } from './types'

export const PO_CLOSE_REASONS = ['Short delivery', 'Final invoice', 'Cancelled'] as const
export type POCloseReason = typeof PO_CLOSE_REASONS[number]

/** Days since the PO's last receipt or invoice, counted to the sample's today. */
export function poIdleDays(po: BudgetPO): number {
  return Math.floor((Date.parse(BUDGET_TODAY) - Date.parse(po.lastActivity)) / 86_400_000)
}
export function poOpenTotal(po: BudgetPO): number { return po.lines.reduce((s, _l, i) => s + poOpen(po, i), 0) }
export function poAmountTotal(po: BudgetPO): number { return po.lines.reduce((s, l) => s + l.amount, 0) }
export function poByNumber(number: string): BudgetPO | undefined { return budget.pos.find((p) => p.number === number) }
export function budgetPOsForRecord(purchaseOrderId: string): BudgetPO[] { return budget.pos.filter((p) => p.purchaseOrderId === purchaseOrderId) }

/**
 * Who may act on a commitment (FG-7.6, FG-2.3): the Procurement Officer closes,
 * reopens and marks requests fully ordered; the Budget Controller closes idle
 * items; AP Staff tick Final invoice. The store refuses too, not just the screen.
 */
export type CommitmentAction = 'close' | 'reopen' | 'fully-ordered' | 'final-invoice'
export function canActOnCommitment(action: CommitmentAction, po?: BudgetPO): { ok: boolean; reason?: string } {
  const role = budget.viewAs
  if (action === 'final-invoice') return role === 'AP Staff' ? { ok: true } : { ok: false, reason: 'Only AP Staff can tick Final invoice.' }
  if (role === 'Procurement Officer') return { ok: true }
  if (action === 'close' && role === 'Budget Controller' && po && isIdlePO(po)) return { ok: true }
  if (action === 'close') return { ok: false, reason: role === 'Budget Controller' ? 'The Budget Controller closes idle purchase orders only.' : 'Only the Procurement Officer can close purchase order lines.' }
  if (action === 'reopen') return { ok: false, reason: 'Only the Procurement Officer can reopen purchase order lines.' }
  return { ok: false, reason: 'Only the Procurement Officer can mark a request fully ordered.' }
}

export function closePOLineAs(poId: string, i: number, reason: string): { ok: boolean; freed: number; reason?: string } {
  const po = poById(poId)
  if (!po || !po.lines[i]) return { ok: false, freed: 0, reason: 'Purchase order line not found.' }
  const can = canActOnCommitment('close', po)
  if (!can.ok) return { ok: false, freed: 0, reason: can.reason }
  if (po.lines[i]!.closed) return { ok: false, freed: 0, reason: 'This line is already closed.' }
  const freed = closePOLine(poId, i, reason)
  syncPurchaseOrderRecord(po)
  return { ok: true, freed }
}

/** Close the whole PO, all lines or none (FG7-AC2): every open line must release, or nothing closes. */
export function closePOAs(poId: string, reason: string): { ok: boolean; freed: number; reason?: string } {
  const po = poById(poId)
  if (!po) return { ok: false, freed: 0, reason: 'Purchase order not found.' }
  const can = canActOnCommitment('close', po)
  if (!can.ok) return { ok: false, freed: 0, reason: can.reason }
  const failing = po.lines.findIndex((l) => !l.closed && !lineById(l.lineId))
  if (failing >= 0) return { ok: false, freed: 0, reason: `Line ${failing + 1} could not release its commitment. No line was closed.` }
  if (po.lines.every((l) => l.closed)) return { ok: false, freed: 0, reason: 'Every line is already closed.' }
  const freed = closePO(poId, reason)
  syncPurchaseOrderRecord(po)
  return { ok: true, freed }
}

/** Reopen re-runs the check; a block returns the gap for the inline message (FG7-AC3). */
export function reopenPOLineAs(poId: string, i: number): { ok: boolean; gap: number; amount: number; reason?: string } {
  const po = poById(poId)
  if (!po || !po.lines[i]) return { ok: false, gap: 0, amount: 0, reason: 'Purchase order line not found.' }
  const can = canActOnCommitment('reopen', po)
  if (!can.ok) return { ok: false, gap: 0, amount: 0, reason: can.reason }
  const l = po.lines[i]!
  if (!l.closed) return { ok: false, gap: 0, amount: 0, reason: 'This line is open.' }
  const amount = Math.max(0, l.amount - l.invoiced)
  const res = reopenPOLine(poId, i)
  if (!res.ok) {
    const b = res.check.blocker
    return { ok: false, gap: b?.yearShort ?? 0, amount, reason: b?.message ?? 'Not enough budget to reopen this line.' }
  }
  syncPurchaseOrderRecord(po)
  return { ok: true, gap: 0, amount }
}

export function markFullyOrderedAs(prId: string): { ok: boolean; freed: number; reason?: string } {
  const can = canActOnCommitment('fully-ordered')
  if (!can.ok) return { ok: false, freed: 0, reason: can.reason }
  const pr = prById(prId)
  if (!pr || pr.status !== 'Approved') return { ok: false, freed: 0, reason: 'Only an approved request can be marked fully ordered.' }
  return { ok: true, freed: markFullyOrdered(prId) }
}

// ── Commitments page figures ──

export interface CommitmentLineRow {
  key: string; poId: string; poNumber: string; purchaseOrderId: string | null; vendor: string
  lineIndex: number; lineId: string; lineTitle: string; description: string
  amount: number; invoiced: number; open: number; closed: boolean; closeReason: string | null
  lastActivity: string; idle: boolean; idleDays: number
}
export function commitmentLines(): CommitmentLineRow[] {
  return budget.pos.flatMap((po) => po.lines.map((l, i) => {
    const bl = lineById(l.lineId)
    return {
      key: `${po.id}:${i}`, poId: po.id, poNumber: po.number, purchaseOrderId: po.purchaseOrderId ?? null, vendor: po.vendor,
      lineIndex: i, lineId: l.lineId, lineTitle: bl ? lineTitle(bl) : '-', description: l.description,
      amount: l.amount, invoiced: l.invoiced, open: poOpen(po, i), closed: l.closed, closeReason: l.closeReason,
      lastActivity: po.lastActivity, idle: isIdlePO(po), idleDays: poIdleDays(po),
    }
  }))
}

export interface HeldRequestRow { key: string; prId: string; number: string; purchaseRequestId: string | null; requester: string; date: string; lineIndex: number; lineId: string | null; lineTitle: string; description: string; held: number }
/** Approved requests still holding money on a line (FG-2.3). */
export function heldRequests(): HeldRequestRow[] {
  return budget.prs.filter((pr) => pr.status === 'Approved').flatMap((pr) => pr.lines.map((l, i) => {
    const bl = lineById(l.lineId)
    return { key: `${pr.id}:${i}`, prId: pr.id, number: pr.number, purchaseRequestId: pr.purchaseRequestId, requester: pr.requester, date: pr.date, lineIndex: i, lineId: l.lineId, lineTitle: bl ? lineTitle(bl) : '-', description: l.description, held: prRemaining(pr.id, i) }
  })).filter((r) => r.held > 0)
}

export interface CommitmentSummary {
  requestsHeld: number; requestCount: number
  poOpen: number; poCount: number
  idleOpen: number; idleCount: number
  overrunShort: number; overrunCount: number
}
export function commitmentSummary(): CommitmentSummary {
  const held = heldRequests()
  const openPOs = budget.pos.filter((p) => p.status === 'Open' && poOpenTotal(p) > 0)
  const idle = budget.pos.filter(isIdlePO)
  const over = overrunBills()
  return {
    requestsHeld: held.reduce((s, r) => s + r.held, 0), requestCount: new Set(held.map((r) => r.prId)).size,
    poOpen: openPOs.reduce((s, p) => s + poOpenTotal(p), 0), poCount: openPOs.length,
    idleOpen: idle.reduce((s, p) => s + poOpenTotal(p), 0), idleCount: idle.length,
    overrunShort: over.reduce((s, b) => s + overrunShort(b), 0), overrunCount: over.length,
  }
}

// ── The check on a PO raised from a request (LR-3: excess only) ──

export interface POPreviewRow { prId: string | null; prNumber: string; prLine: number | null; lineId: string | null; lineTitle: string; description: string; amount: number; held: number; excess: number; result: LineCheck['result'] | null; message: string }
/**
 * The check a PO from requests runs before it saves: each line uses what its
 * request still holds and is checked only on the excess, combined per budget line.
 */
export function previewPOFromRequests(lines: { prId: string | null; prLine: number | null; lineId: string | null; description: string; amount: number }[], date: string): { rows: POPreviewRow[]; check: CheckResult } {
  const month = Number(date.slice(5, 7)) - 1
  const rows: POPreviewRow[] = lines.map((l) => {
    const pr = prById(l.prId)
    const held = pr && l.prLine !== null ? prRemaining(pr.id, l.prLine) : 0
    const bl = lineById(l.lineId)
    return { prId: l.prId, prNumber: pr?.number ?? '', prLine: l.prLine, lineId: l.lineId, lineTitle: bl ? lineTitle(bl) : 'No budget line', description: l.description, amount: l.amount, held, excess: Math.max(0, l.amount - held), result: null, message: '' }
  })
  const check = checkSpend(rows.map((r) => {
    const bl = lineById(r.lineId)
    const src = prById(r.prId)?.lines[r.prLine ?? -1]
    return { lineId: r.lineId, account: bl?.account ?? src?.account ?? '', dept: bl?.dept ?? src?.dept ?? '', project: bl?.project ?? src?.project ?? null, amount: r.excess }
  }), month)
  for (const r of rows) {
    const lc = check.lines.find((c) => c.lineId === r.lineId)
    if (lc) { r.result = lc.result; r.message = lc.message }
  }
  return { rows, check }
}

// ── The check on a purchase invoice (mirrors postBill without posting) ──

export type BillInput = Parameters<typeof postBill>[0]
export interface BillPreviewRow { lineId: string | null; lineTitle: string; amount: number; open: number; excess: number }
/**
 * What posting would do, without posting: a block on a PO excess or a split
 * project refuses; a no-PO bill over available posts and lands on the
 * over-budget list with the short amount postBill records.
 */
export function previewBill(input: BillInput): { ok: boolean; message?: string; check: CheckResult; rows: BillPreviewRow[]; overBudget: boolean; overBudgetShort: number } {
  const month = Number(input.date.slice(5, 7)) - 1
  const empty: CheckResult = { result: 'Pass', lines: [], blocker: null, monthWarning: false }
  if (new Set(input.lines.map((l) => l.project)).size > 1) {
    return { ok: false, message: 'One invoice books one project. Split this invoice by project.', check: { ...empty, result: 'Block' }, rows: [], overBudget: false, overBudgetShort: 0 }
  }
  const po = poById(input.poId)
  const rows: BillPreviewRow[] = input.lines.map((l) => {
    const lineId = po && l.poLine !== null ? po.lines[l.poLine]!.lineId : findLine(l.account, l.dept, l.project)?.id ?? null
    const bl = lineById(lineId)
    if (!po || l.poLine === null) return { lineId, lineTitle: bl ? lineTitle(bl) : 'No budget line', amount: l.amount, open: 0, excess: l.amount }
    const open = poOpen(po, l.poLine)
    const tol = Math.round(po.lines[l.poLine]!.amount * budget.settings.invoiceTolerancePct / 100)
    return { lineId, lineTitle: bl ? lineTitle(bl) : 'No budget line', amount: l.amount, open, excess: Math.max(0, l.amount - open - tol) }
  })
  const check = checkSpend(rows.map((r, i) => ({ lineId: r.lineId, account: input.lines[i]!.account, dept: input.lines[i]!.dept, project: input.lines[i]!.project, amount: r.excess })), month)
  if (po && check.result === 'Block') return { ok: false, message: check.blocker?.message, check, rows, overBudget: false, overBudgetShort: 0 }
  const overBudget = !po && !!check.blocker
  return { ok: true, check, rows, overBudget, overBudgetShort: overBudget ? check.blocker!.yearShort : 0 }
}

/** Post a purchase invoice for the acting person; Final invoice is AP Staff's call (FG-7.6). */
export function postBillAs(input: BillInput): ReturnType<typeof postBill> {
  if (input.final) {
    const can = canActOnCommitment('final-invoice')
    if (!can.ok) return { ok: false, check: { result: 'Block', lines: [], blocker: null, monthWarning: false }, message: can.reason }
  }
  const res = postBill(input)
  if (res.ok && res.bill?.poId) { const po = poById(res.bill.poId); if (po) syncPurchaseOrderRecord(po) }
  return res
}
/** What an over-budget bill is short: the gap on its line, or the whole bill when no line exists. */
export function overrunShort(b: BudgetBill): number {
  if (!b.overBudget) return 0
  return b.overBudget.lineId ? b.overBudget.short : b.lines.reduce((s, l) => s + l.amount, 0)
}
export function billByNumber(number: string): BudgetBill | undefined { return budget.bills.find((b) => b.number === number) }

// ── Purchases module records for budget POs ──

const PO_RECORDS_KEY = 'purchase-orders-created'
function recordStatus(po: BudgetPO): PurchaseOrderRecordStatus {
  if (po.status === 'Closed') return 'closed'
  return po.lines.some((l) => l.invoiced > 0) ? 'partially-processed' : 'open'
}
function recordBalance(po: BudgetPO): number {
  return po.status === 'Closed' ? 0 : Math.round(po.lines.reduce((s, l) => s + (l.closed ? 0 : Math.max(0, l.amount - l.invoiced)), 0) * 1.11)
}
/** Keep the Purchases record's status and balance in step with the budget PO. */
export function syncPurchaseOrderRecord(po: BudgetPO): void {
  const rec = purchaseOrderRecords.find((r) => r.id === po.purchaseOrderId)
  if (!rec) return
  rec.status = recordStatus(po)
  rec.balance = recordBalance(po)
  saveCreatedRecords(PO_RECORDS_KEY, [...loadCreatedRecords<PurchaseOrderRecord>(PO_RECORDS_KEY).filter((x) => x.id !== rec.id), { ...rec }])
}

/** Create a Purchases record for each budget PO that has none, so both screens name the same document. */
export function linkBudgetPurchaseOrders(): void {
  for (const po of budget.pos) {
    let rec = purchaseOrderRecords.find((r) => r.id === po.purchaseOrderId) ?? purchaseOrderRecords.find((r) => r.number === po.number)
    if (!rec) {
      const id = `po-b-${po.number.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
      const vendorId = `budget-${po.vendor.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
      const total = Math.round(poAmountTotal(po) * 1.11)
      rec = { id, number: po.number, vendor: { id: vendorId, name: po.vendor }, date: po.date, dueDate: po.date, total, balance: recordBalance(po), status: recordStatus(po), itemCount: po.lines.length, tags: ['Budget'] }
      addPurchaseOrder(rec)
    }
    po.purchaseOrderId = rec.id
  }
}

// A snapshot saved before records were linked gets them on load.
if (budget.pos.some((p) => !p.purchaseOrderId || !purchaseOrderRecords.some((r) => r.id === p.purchaseOrderId))) linkBudgetPurchaseOrders()

// ── pr additions ──
// Purchase request screens (FG-3): who may act on a request, and the approval
// path every screen uses so the hold and the re-check run the same way (LR-3).

/** The step waiting on a pending request, if any. */
export function prWaitingStep(pr: BudgetPR | undefined): ChainStep | undefined {
  return pr && pr.status === 'Pending' ? pr.approvalChain.find((s) => s.status === 'Waiting') : undefined
}

/** True when the waiting step is the last one: approving it holds the money. */
export function isFinalPRStep(pr: BudgetPR): boolean {
  return pr.approvalChain.filter((s) => s.status === 'Waiting').length <= 1
}

/** LR-8 for requests: the requester never approves, and only the waiting step's approver acts. */
export function canApprovePR(pr: BudgetPR | undefined, person = actingPerson()): { ok: boolean; reason?: string } {
  if (!pr) return { ok: false, reason: 'This request has no budget record.' }
  if (pr.status !== 'Pending') return { ok: false, reason: 'This request is not waiting for approval.' }
  if (person === pr.requester) return { ok: false, reason: 'You raised this request. Someone else approves it.' }
  const step = prWaitingStep(pr)
  if (!step) return { ok: false, reason: 'No step is waiting.' }
  if (step.approver !== person) return { ok: false, reason: `Waiting for ${step.approver} (${step.role}).` }
  return { ok: true }
}

/** What an approved request still holds across its lines. */
export function prHeld(pr: BudgetPR): number {
  return pr.lines.reduce((s, _l, i) => s + prRemaining(pr.id, i), 0)
}

/**
 * Approve as a person. Refuses the requester and anyone but the waiting step's
 * approver. The final step may cut amounts (never raise them) and holds the money.
 */
export function approvePRAs(id: string, person = actingPerson(), amounts?: number[]):
  { ok: boolean; final: boolean; reason?: string; held?: number; next?: ChainStep } {
  const pr = prById(id)
  const can = canApprovePR(pr, person)
  if (!can.ok || !pr) return { ok: false, final: false, reason: can.reason }
  const final = isFinalPRStep(pr)
  if (final && amounts) {
    if (amounts.length !== pr.lines.length || amounts.some((a) => !Number.isFinite(a) || a < 0)) return { ok: false, final, reason: 'Enter an approved amount for every line.' }
    if (amounts.some((a, i) => a > pr.lines[i]!.amount)) return { ok: false, final, reason: 'An approved amount cannot be more than the request.' }
    if (amounts.every((a) => a === 0)) return { ok: false, final, reason: 'Approve at least one line, or reject the request.' }
  }
  const res = approvePR(id, { amounts: final ? amounts : undefined, finalStep: final })
  if (!res.ok) return { ok: false, final, reason: res.message }
  if (!final) {
    const next = prWaitingStep(pr)
    if (next) notify(next.approver, `${pr.number} waits for your approval.`, prLink(pr))
    return { ok: true, final, next }
  }
  return { ok: true, final, held: prHeld(pr) }
}

/** Reject as a person; a reason is required. */
export function rejectPRAs(id: string, note: string, person = actingPerson()): { ok: boolean; reason?: string } {
  const pr = prById(id)
  const can = canApprovePR(pr, person)
  if (!can.ok) return can
  if (!note.trim()) return { ok: false, reason: 'Add a reason for the rejection.' }
  rejectPR(id, note.trim())
  return { ok: true }
}

/** The requester or the Budget Controller can cancel a request that is not closed. */
export function canCancelPR(pr: BudgetPR | undefined, person = actingPerson()): { ok: boolean; reason?: string } {
  if (!pr) return { ok: false, reason: 'This request has no budget record.' }
  if (pr.status === 'Cancelled' || pr.status === 'Closed') return { ok: false, reason: `This request is already ${pr.status.toLowerCase()}.` }
  if (person !== pr.requester && person !== BUDGET_CONTROLLER_NAME) return { ok: false, reason: `Only ${pr.requester} or the Budget Controller can cancel this request.` }
  return { ok: true }
}

/** Cancel as a person; returns what the request held and has now freed. */
export function cancelPRAs(id: string, person = actingPerson()): { ok: boolean; freed: number; reason?: string } {
  const pr = prById(id)
  const can = canCancelPR(pr, person)
  if (!can.ok || !pr) return { ok: false, freed: 0, reason: can.reason }
  const freed = pr.status === 'Approved' ? prHeld(pr) : 0
  cancelPR(id)
  return { ok: true, freed }
}

/** Keep a draft's date (and so its check month) in step with its purchase request. */
export function updatePRDate(id: string, date: string): void {
  const pr = prById(id)
  if (!pr || (pr.status !== 'Draft' && pr.status !== 'Rejected')) return
  pr.date = date
  pr.month = Number(date.slice(5, 7)) - 1
}
