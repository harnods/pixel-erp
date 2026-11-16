/**
 * Purchase request screens × Advanced Budgeting (PRD FG-3).
 *
 * Read-side helpers for the request form, detail and approval queue. Every
 * figure comes from budgetStore (yearFigures / monthFigures / checkSpend); this
 * file only groups request lines by budget mix and shapes the result.
 */
import {
  BUDGET_ACCOUNTS, BUDGET_DEPARTMENTS, BUDGET_PROJECTS, SAVING_ACCOUNT,
  budgetAccount, deptName, projectName,
} from './budgetMaster'
import {
  budget, findLine, yearFigures, monthFigures, checkSpend, isLocked, prForPurchaseRequest,
  type BudgetPR, type Figures, type CheckResult, type PRStatus,
} from './budgetStore'
import { purchaseRequests, updatePurchaseRequest } from './purchaseRequests'

export const budgetDeptOptions = BUDGET_DEPARTMENTS.map((d) => ({ value: d.id, label: d.name }))
export const budgetProjectOptions = BUDGET_PROJECTS.filter((p) => p.status === 'Active').map((p) => ({ value: p.id, label: p.name }))
/** Budget accounts a request line can charge (never the saving bucket). */
export const budgetAccountOptions = BUDGET_ACCOUNTS
  .filter((a) => a.code !== SAVING_ACCOUNT && !a.savingOnly)
  .map((a) => ({ value: a.code, label: `${a.code} ${a.name}` }))

export interface MixInput { account: string; dept: string; project: string | null; amount: number }

export type PanelState = 'ok' | 'warn' | 'short' | 'not-controlled' | 'no-line' | 'not-locked' | 'blocked'

export interface PanelRow {
  key: string
  account: string
  dept: string
  project: string | null
  label: string
  lineId: string | null
  amount: number
  state: PanelState
  message: string
  year: Figures | null
  month: Figures | null
  afterYear: number | null
  afterMonth: number | null
  yearShort: number
  monthShort: number
}

export interface PanelResult {
  rows: PanelRow[]
  result: CheckResult['result']
  monthWarning: boolean
}

export function mixKey(m: { account: string; dept: string; project: string | null }): string {
  return `${m.account}|${m.dept}|${m.project ?? ''}`
}

export function mixLabel(m: { account: string; dept: string; project: string | null }): string {
  return `${deptName(m.dept)} × ${projectName(m.project)} × ${budgetAccount(m.account)?.name ?? m.account}`
}

/**
 * The budget panel: one row per budget mix the request touches, amounts on the
 * same mix combined (FG-3.3). Lines without a department or account are skipped.
 */
export function budgetPanel(items: MixInput[], month: number): PanelResult {
  const groups = new Map<string, MixInput>()
  for (const it of items) {
    if (!it.account || !it.dept) continue
    const k = mixKey(it)
    const prev = groups.get(k)
    if (prev) prev.amount += Math.max(0, it.amount || 0)
    else groups.set(k, { account: it.account, dept: it.dept, project: it.project || null, amount: Math.max(0, it.amount || 0) })
  }
  const rows: PanelRow[] = []
  const toCheck: { lineId: string | null; account: string; dept: string; project: string | null; amount: number }[] = []
  for (const [key, g] of groups) {
    const acct = budgetAccount(g.account)
    const lineId = findLine(g.account, g.dept, g.project)?.id ?? null
    const lc = checkSpend([{ lineId, ...g }], month).lines[0]!
    const row: PanelRow = {
      key, account: g.account, dept: g.dept, project: g.project, label: mixLabel(g), lineId, amount: g.amount,
      state: 'ok', message: lc.message, year: null, month: null, afterYear: null, afterMonth: null,
      yearShort: lc.yearShort, monthShort: lc.monthShort,
    }
    if (!acct?.controlled) row.state = 'not-controlled'
    else if (acct.savingOnly) row.state = 'blocked'
    else if (!isLocked()) row.state = 'not-locked'
    else if (!lineId) row.state = 'no-line'
    else {
      row.year = yearFigures(lineId)
      row.month = monthFigures(lineId, month)
      row.afterYear = row.year.available - g.amount
      row.afterMonth = row.month.available - g.amount
      row.yearShort = Math.max(0, -row.afterYear)
      row.monthShort = Math.max(0, -row.afterMonth)
      row.state = lc.result === 'Block' ? 'short' : lc.result === 'Warn' ? 'warn' : 'ok'
    }
    rows.push(row)
    toCheck.push({ lineId, ...g })
  }
  const all = checkSpend(toCheck, month)
  return { rows, result: rows.length ? all.result : 'Pass', monthWarning: all.monthWarning }
}

/** "Request a new line": a mid-year insert for the missing mix. */
export function newLineRoute(m: { account: string; dept: string; project: string | null }): string {
  const q = new URLSearchParams({ kind: 'Mid-year insert', account: m.account, dept: m.dept })
  if (m.project) q.set('project', m.project)
  return `/budget-changes/new?${q.toString().replace(/\+/g, '%20')}`
}

/** The budget record behind a purchase request (by link, then by number). */
export function budgetPRForRequest(purchaseRequestId: string): BudgetPR | undefined {
  const linked = prForPurchaseRequest(purchaseRequestId)
  if (linked) return linked
  const rec = purchaseRequests.find((r) => r.id === purchaseRequestId)
  if (!rec) return undefined
  return budget.prs.find((p) => p.number === `#${rec.number}` && !p.purchaseRequestId)
}

/** ErpStatusBadge key for a budget request status. */
export function prStatusKey(s: PRStatus): string { return s.toLowerCase() }

/** Month index (0-based) from a DD/MM/YYYY or ISO date. */
export function monthOf(date: string): number {
  if (/^\d{4}-\d{2}/.test(date)) return Number(date.slice(5, 7)) - 1
  const parts = date.split('/')
  return parts.length === 3 ? Number(parts[1]) - 1 : 0
}

/**
 * The budget record decides the approval state of a linked purchase request:
 * it sits in the approval queue while Pending, and it is voided only when the
 * budget request is cancelled. Keeps the queue right after "Reset sample data".
 */
export function syncLinkedRequests(): void {
  for (const pr of budget.prs) {
    if (!pr.purchaseRequestId) continue
    const rec = purchaseRequests.find((r) => r.id === pr.purchaseRequestId)
    if (!rec) continue
    const awaiting = pr.status === 'Pending'
    const patch: { awaitingApproval?: boolean; status?: 'open' | 'voided' } = {}
    if (!!rec.awaitingApproval !== awaiting) patch.awaitingApproval = awaiting
    if (pr.status === 'Cancelled' && rec.status !== 'voided') patch.status = 'voided'
    if (pr.status !== 'Cancelled' && rec.status === 'voided') patch.status = 'open'
    if (Object.keys(patch).length) updatePurchaseRequest(rec.id, patch)
  }
}
