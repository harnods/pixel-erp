/**
 * Budget changes screens (FG-4): view helpers over the budget store. Every
 * figure is read from the store on each call; nothing here holds a balance.
 */
import {
  budget, lineById, lineTitle, lineClass, isSavingLine, changeTotal, canApproveChange, findLine, prById,
  savingSlices, BUDGET_YEAR, BUDGET_TODAY,
  type ChangeDoc, type ChangeKind, type ChangeStatus, type ChangeReceiver, type BudgetLine, type SavingSlice,
} from './budgetStore'
import { accountLabel, budgetAccount, deptName, projectName, BUDGET_ACCOUNTS, BUDGET_DEPARTMENTS, BUDGET_PROJECTS, MONTH_NAMES } from './budgetMaster'

export const CHANGE_KINDS: ChangeKind[] = ['Transfer', 'Funding request', 'Mid-year insert', 'Revision', 'Saving fill', 'Saving draw']
/** Kinds the Budget Controller starts from the index page. */
export const NEW_CHANGE_KINDS: ChangeKind[] = ['Transfer', 'Revision', 'Mid-year insert']
export const FUNDING_REASON_CODES = ['Unplanned site work', 'Price increase', 'Scope change', 'Timing shift']
export const SAVING_TYPES = ['Procurement', 'Completion', 'Cancellation'] as const

export const WAITING_FOR_ME = 'waiting-for-me'
export const STATUS_FILTER_OPTIONS = [
  { value: WAITING_FOR_ME, label: 'Waiting for my approval' },
  { value: 'Draft', label: 'Draft' },
  { value: 'Pending', label: 'Pending' },
  { value: 'Approved', label: 'Approved' },
  { value: 'Rejected', label: 'Rejected' },
  { value: 'Withdrawn', label: 'Withdrawn' },
]

export function isChangeKind(v: unknown): v is ChangeKind {
  return typeof v === 'string' && (CHANGE_KINDS as string[]).includes(v)
}

export function monthLabel(m: number): string { return `${MONTH_NAMES[m] ?? '-'} ${BUDGET_YEAR}` }
export const MONTH_OPTIONS = MONTH_NAMES.map((n, i) => ({ value: String(i), label: `${n} ${BUDGET_YEAR}` }))

/** "Networking × Project A × Accommodation", or "-" when the line is gone. */
export function lineName(lineId: string | null | undefined): string {
  const l = lineById(lineId ?? null)
  if (!l) return '-'
  return isSavingLine(l) ? 'Saving bucket' : lineTitle(l)
}

export function receiverName(r: ChangeReceiver): string {
  if (r.lineId) return lineName(r.lineId)
  if (r.newLine) return `${deptName(r.newLine.dept)} × ${projectName(r.newLine.project)} × ${budgetAccount(r.newLine.account)?.name ?? r.newLine.account}`
  return '-'
}

/** Picker options: the year's lines, never the saving bucket. */
export function lineOptions(filter?: (l: BudgetLine) => boolean): { value: string; label: string }[] {
  return budget.lines
    .filter((l) => l.year === BUDGET_YEAR && !isSavingLine(l) && (!filter || filter(l)))
    .map((l) => ({ value: l.id, label: `${lineTitle(l)} · ${lineClass(l) ?? 'No class'}` }))
}

export const ACCOUNT_OPTIONS = BUDGET_ACCOUNTS.filter((a) => !a.savingOnly && a.controlled).map((a) => ({ value: a.code, label: accountLabel(a.code) }))
export const DEPARTMENT_OPTIONS = BUDGET_DEPARTMENTS.map((d) => ({ value: d.id, label: d.name }))
export const NO_PROJECT = 'none'
export const PROJECT_OPTIONS = [{ value: NO_PROJECT, label: '(no project)' }, ...BUDGET_PROJECTS.map((p) => ({ value: p.id, label: p.name }))]

export function sliceLabel(s: Pick<SavingSlice, 'dept' | 'project' | 'class' | 'type'>): string {
  return `${deptName(s.dept)} · ${projectName(s.project)} · ${s.class} · ${s.type}`
}
export function sliceOptions(): { value: string; label: string }[] {
  return savingSlices().filter((s) => s.balance > 0).map((s) => ({ value: s.key, label: sliceLabel(s) }))
}

/** Waiting step, if any. */
export function waitingStep(c: ChangeDoc) { return c.status === 'Pending' ? c.chain.find((s) => s.status === 'Waiting') ?? null : null }

/** When the change posted (version time), for approved changes. */
export function approvedAt(c: ChangeDoc): string | null {
  if (c.version === null) return null
  return budget.versions.find((v) => v.year === BUDGET_YEAR && v.no === c.version)?.at ?? null
}

export interface ChangeRow {
  id: string
  number: string
  kind: ChangeKind
  from: string
  to: string
  amount: number
  status: ChangeStatus
  waitingFor: string
  date: string
  mine: boolean
  preparedBy: string
}

export function changeRows(person: string): ChangeRow[] {
  return budget.changes.map((c) => {
    const step = waitingStep(c)
    return {
      id: c.id,
      number: c.number,
      kind: c.kind,
      from: c.donor ? lineName(c.donor.lineId) : '-',
      to: c.receivers.length ? c.receivers.map(receiverName).join('; ') : '-',
      amount: c.kind === 'Revision' ? c.receivers.reduce((s, r) => s + r.amount, 0) : changeTotal(c),
      status: c.status,
      waitingFor: step ? step.approver : '-',
      date: (c.submittedAt ?? c.createdAt).slice(0, 10),
      mine: canApproveChange(c, person).ok,
      preparedBy: c.preparedBy,
    }
  })
}

export function changeStats(person: string) {
  const pending = budget.changes.filter((c) => c.status === 'Pending')
  const month = BUDGET_TODAY.slice(0, 7)
  const approvedThisMonth = budget.changes.filter((c) => c.status === 'Approved' && (approvedAt(c) ?? '').slice(0, 7) === month)
  const mine = pending.filter((c) => canApproveChange(c, person).ok)
  const sum = (list: ChangeDoc[]) => list.reduce((s, c) => s + Math.abs(c.kind === 'Revision' ? c.receivers.reduce((t, r) => t + r.amount, 0) : changeTotal(c)), 0)
  return {
    pendingCount: pending.length,
    pendingAmount: sum(pending),
    approvedCount: approvedThisMonth.length,
    approvedAmount: sum(approvedThisMonth),
    mineCount: mine.length,
    mineAmount: sum(mine),
  }
}

/** Purchase requests a requester can raise a funding request for: drafts with a block. */
export function blockedRequests(person: string | null) {
  return budget.prs.filter((p) => p.status === 'Draft' && p.block && p.block.short > 0 && (!person || p.requester === person))
}

/** The gap a funding request covers and the cap on what it may ask. */
export function fundingGap(prId: string | null): { gap: number; cap: number } {
  const pr = prById(prId)
  const gap = pr?.block?.short ?? 0
  return { gap, cap: Math.round(gap * (1 + budget.settings.fundingCapPct / 100)) }
}

/** A new line on a mix that already has a line is not an insert. */
export function newLineClash(r: ChangeReceiver): string | null {
  if (!r.newLine || !r.newLine.account || !r.newLine.dept) return null
  const l = findLine(r.newLine.account, r.newLine.dept, r.newLine.project)
  return l ? `${lineTitle(l)} already exists. Pick it as the receiving line.` : null
}

/** Whole rupiah from typed text: digits only, a leading minus kept when allowed. */
export function parseRupiahInput(v: string | number, allowNegative = false): number {
  const s = String(v ?? '')
  const neg = allowNegative && s.trim().startsWith('-')
  const n = Number(s.replace(/\D/g, '') || '0')
  return neg ? -n : n
}
export function groupDigits(n: number): string {
  if (!n) return ''
  const sign = n < 0 ? '-' : ''
  return sign + Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** Badge colour per change status (Withdrawn is neutral, not informational). */
export function changeBadgeType(status: string): 'completed' | 'announcement' | 'information' | 'warning' | 'critical' {
  if (status === 'Approved') return 'completed'
  if (status === 'Pending') return 'warning'
  if (status === 'Rejected') return 'critical'
  return 'announcement'
}
