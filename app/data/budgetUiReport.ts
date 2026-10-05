/**
 * Budget report (FG-6): one row per budget line with budget, moved in and out,
 * reserved, committed, actual, available, saving and money held by idle POs,
 * for a month, year to date or the full year.
 *
 * Every figure is read from the budget ledger in budgetStore on each call; this
 * module only filters, groups and totals. Spend with no budget line and
 * journals the ledger does not count show on their own rows, so the actual
 * total ties to the counted general-ledger postings (LR-4).
 */
import {
  budget, figures, movedIn, movedOut, docsBehind, lineClass, lineTitle, lineById, prById, prLink, poById,
  isIdlePO, poOpen, runTieOut, BUDGET_YEAR, BUDGET_CURRENT_MONTH,
  type BudgetLine, type Scope, type GLPosting, type ReportFilter, type TieOutRun, type DocKind,
} from './budgetStore'
import {
  budgetAccount, accountLabel, deptName, projectName, personFor, MONTH_NAMES,
  type BudgetClass, type BudgetRole,
} from './budgetMaster'

// ── Period ──────────────────────────────────────────────────────────────────

export type PeriodKind = 'month' | 'ytd' | 'year'
export interface ReportPeriod { kind: PeriodKind; month: number }
export const DEFAULT_PERIOD: ReportPeriod = { kind: 'ytd', month: BUDGET_CURRENT_MONTH }
export const PERIOD_KINDS: { value: PeriodKind; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'ytd', label: 'Year to date' },
  { value: 'year', label: 'Full year' },
]

export function periodScope(p: ReportPeriod): Scope {
  if (p.kind === 'month') return { from: p.month, to: p.month }
  if (p.kind === 'ytd') return { from: 0, to: p.month }
  return { from: 0, to: 11 }
}
const inScope = (m: number, s: Scope) => m >= (s.from ?? 0) && m <= (s.to ?? 11)

export function periodLabel(p: ReportPeriod, year = BUDGET_YEAR): string {
  if (p.kind === 'month') return `${MONTH_NAMES[p.month]} ${year}`
  if (p.kind === 'ytd') return p.month === 0 ? `January ${year}` : `January to ${MONTH_NAMES[p.month]} ${year}`
  return `January to December ${year}`
}

// ── Grouping ────────────────────────────────────────────────────────────────

export type GroupBy = 'none' | 'dept' | 'project' | 'account' | 'class'
export const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'none', label: 'No grouping' },
  { value: 'dept', label: 'Department' },
  { value: 'project', label: 'Project' },
  { value: 'account', label: 'Account' },
  { value: 'class', label: 'Class' },
]

// ── Access (FG-6.6) ─────────────────────────────────────────────────────────

/** A department head sees their own department only; everyone else sees all lines. */
export function viewerDept(role: BudgetRole): string | null {
  return role.startsWith('Budget holder') ? personFor(role).deptId : null
}

/** Roles that can open purchase requests. Others see the document number and amount only. */
const NO_PURCHASE_REQUEST_ACCESS: BudgetRole[] = ['AP Staff', 'Finance Admin']
export function canOpenPurchaseRequests(role: BudgetRole): boolean {
  return !NO_PURCHASE_REQUEST_ACCESS.includes(role)
}

export function canRunTieOut(role: BudgetRole): boolean { return role === 'Budget Controller' }

/** Run the tie-out on behalf of the viewer. Refused for anyone but the Budget Controller. */
export function runTieOutAs(role: BudgetRole): { ok: true; run: TieOutRun } | { ok: false; reason: string } {
  if (!canRunTieOut(role)) return { ok: false, reason: 'Only the Budget Controller can run the tie-out.' }
  return { ok: true, run: runTieOut() }
}

/** Filter values that cannot match anything (a department outside the viewer's scope). */
const OUT_OF_SCOPE = '__out_of_scope__'

/**
 * The filter the report actually applies. A department set through the URL can
 * narrow the viewer's scope but never widen it: asking for a department outside
 * scope returns no rows.
 */
export function effectiveFilter(requested: ReportFilter, role: BudgetRole): ReportFilter {
  const own = viewerDept(role)
  if (!own) return requested
  const depts = requested.depts.length ? requested.depts.filter((d) => d === own) : [own]
  return { ...requested, depts: depts.length ? depts : [OUT_OF_SCOPE] }
}

export const EMPTY_FILTER: ReportFilter = { depts: [], projects: [], accounts: [], classes: [] }
export function filterCount(f: ReportFilter): number {
  return f.depts.length + f.projects.length + f.accounts.length + f.classes.length
}

interface Dims { account: string; dept: string; project: string | null }
/** Values in one dimension combine with OR; dimensions combine with AND. */
export function matchesDims(d: Dims, f: ReportFilter): boolean {
  const cls = budgetAccount(d.account)?.class ?? null
  return (!f.depts.length || f.depts.includes(d.dept))
    && (!f.projects.length || f.projects.includes(d.project ?? null))
    && (!f.accounts.length || f.accounts.includes(d.account))
    && (!f.classes.length || (cls !== null && f.classes.includes(cls)))
}

// ── Filter options (only the dimensions in the budget key) ────────────────────

function yearLines(): BudgetLine[] { return budget.lines.filter((l) => l.year === BUDGET_YEAR) }
const uniq = <T>(xs: T[]) => [...new Set(xs)]

export interface ReportOption<V = string> { value: V; label: string }
export function filterOptions(role: BudgetRole) {
  const own = viewerDept(role)
  const lines = yearLines().filter((l) => !own || l.dept === own)
  const depts = uniq(lines.map((l) => l.dept)).map((d) => ({ value: d, label: deptName(d) }))
  const projects: ReportOption<string | null>[] = uniq(lines.map((l) => l.project ?? null))
    .sort((a, b) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b)))
    .map((p) => ({ value: p, label: projectName(p) }))
  const accounts = uniq(lines.map((l) => l.account)).sort().map((a) => ({ value: a, label: accountLabel(a) }))
  const classes = uniq(lines.map((l) => lineClass(l)).filter((c): c is BudgetClass => c !== null)).sort()
    .map((c) => ({ value: c, label: c }))
  return { depts, projects, accounts, classes }
}

// ── Figures ─────────────────────────────────────────────────────────────────

export interface ReportFigures {
  budget: number
  movedIn: number
  movedOut: number
  reserved: number
  committed: number
  actual: number
  available: number
  saving: number
  idle: number
}
export const FIGURE_KEYS: (keyof ReportFigures)[] = ['budget', 'movedIn', 'movedOut', 'reserved', 'committed', 'actual', 'available', 'saving', 'idle']
export const zeroFigures = (): ReportFigures => ({ budget: 0, movedIn: 0, movedOut: 0, reserved: 0, committed: 0, actual: 0, available: 0, saving: 0, idle: 0 })
export function addFigures(a: ReportFigures, b: ReportFigures): ReportFigures {
  const out = zeroFigures()
  for (const k of FIGURE_KEYS) out[k] = a[k] + b[k]
  return out
}

/** Saving moved from this line to the saving bucket in the period. */
export function savingInScope(lineId: string, scope: Scope): number {
  return budget.changes
    .filter((c) => c.kind === 'Saving fill' && c.status === 'Approved' && c.donor?.lineId === lineId && inScope(c.month, scope))
    .reduce((s, c) => s + (c.donor?.amount ?? 0), 0)
}

/** Open commitment on POs idle 90 days or more, for POs dated in the period. */
export function idleInScope(lineId: string, scope: Scope): number {
  return budget.pos.filter((po) => isIdlePO(po) && inScope(po.month, scope))
    .reduce((s, po) => s + po.lines.reduce((t, l, i) => t + (l.lineId === lineId ? poOpen(po, i) : 0), 0), 0)
}

export function lineFigures(lineId: string, scope: Scope): ReportFigures {
  const f = figures(lineId, scope)
  return {
    budget: f.budget,
    movedIn: movedIn(lineId, scope),
    movedOut: movedOut(lineId, scope),
    reserved: f.reserved,
    committed: f.committed,
    actual: f.actual,
    available: f.available,
    saving: savingInScope(lineId, scope),
    idle: idleInScope(lineId, scope),
  }
}

// ── The report ──────────────────────────────────────────────────────────────

export interface ReportRow {
  lineId: string
  name: string
  meta: string
  title: string
  figures: ReportFigures
}
export interface ReportGroup { key: string; label: string; rows: ReportRow[]; totals: ReportFigures }
export interface ReportResult {
  scope: Scope
  groups: ReportGroup[]
  rows: ReportRow[]
  /** Counted spend posted to a mix with no budget line. */
  noLine: { amount: number; postings: GLPosting[] }
  /** Postings the ledger does not count (reclass to fixed assets). */
  notCounted: { amount: number; postings: GLPosting[] }
  /** Sum of the line rows. */
  linesTotal: ReportFigures
  /** Line rows plus the no-line row: what ties to the counted general ledger. */
  total: ReportFigures
}

function groupKey(l: BudgetLine, by: GroupBy): { key: string; label: string } {
  if (by === 'dept') return { key: l.dept, label: deptName(l.dept) }
  if (by === 'project') return { key: l.project ?? '', label: projectName(l.project) }
  if (by === 'account') return { key: l.account, label: accountLabel(l.account) }
  if (by === 'class') { const c = lineClass(l); return { key: c ?? '', label: c ?? 'No class' } }
  return { key: 'all', label: '' }
}

export function lineMeta(l: BudgetLine): string {
  const cls = lineClass(l)
  return [l.account, deptName(l.dept), projectName(l.project), cls].filter(Boolean).join(' · ')
}

export function buildReport(requested: ReportFilter, period: ReportPeriod, groupBy: GroupBy, role: BudgetRole): ReportResult {
  const f = effectiveFilter(requested, role)
  const scope = periodScope(period)
  const rows: ReportRow[] = yearLines().filter((l) => matchesDims(l, f)).map((l) => ({
    lineId: l.id,
    name: budgetAccount(l.account)?.name ?? l.account,
    meta: lineMeta(l),
    title: lineTitle(l),
    figures: lineFigures(l.id, scope),
  }))
  const groupMap = new Map<string, ReportGroup>()
  for (const r of rows) {
    const g = groupKey(lineById(r.lineId)!, groupBy)
    if (!groupMap.has(g.key)) groupMap.set(g.key, { key: g.key, label: g.label, rows: [], totals: zeroFigures() })
    const grp = groupMap.get(g.key)!
    grp.rows.push(r)
    grp.totals = addFigures(grp.totals, r.figures)
  }
  const groups = [...groupMap.values()]
  if (groupBy !== 'none') groups.sort((a, b) => (a.key === '' ? 1 : b.key === '' ? -1 : a.label.localeCompare(b.label)))
  const linesTotal = rows.reduce((s, r) => addFigures(s, r.figures), zeroFigures())
  const gl = budget.gl.filter((g) => inScope(g.month, scope) && matchesDims(g, f))
  const noLinePostings = gl.filter((g) => g.counted && !g.lineId)
  const notCountedPostings = gl.filter((g) => !g.counted)
  const noLineAmount = noLinePostings.reduce((s, g) => s + g.amount, 0)
  const total = { ...linesTotal, actual: linesTotal.actual + noLineAmount }
  return {
    scope, groups, rows, linesTotal, total,
    noLine: { amount: noLineAmount, postings: noLinePostings },
    notCounted: { amount: notCountedPostings.reduce((s, g) => s + g.amount, 0), postings: notCountedPostings },
  }
}

/** Counted general-ledger postings in the period that the filter selects (the tie target). */
export function countedGL(requested: ReportFilter, period: ReportPeriod, role: BudgetRole): number {
  const f = effectiveFilter(requested, role)
  const scope = periodScope(period)
  return budget.gl.filter((g) => g.counted && inScope(g.month, scope) && matchesDims(g, f)).reduce((s, g) => s + g.amount, 0)
}

// ── Drill to documents ──────────────────────────────────────────────────────

export type DrillFigure = 'reserved' | 'committed' | 'actual'
const ENTRY_TYPE = { reserved: 'reserve', committed: 'commit', actual: 'actual' } as const
const KIND_LABEL: Record<DocKind, string> = {
  PR: 'Purchase request', PO: 'Purchase order', Bill: 'Purchase invoice', Journal: 'Manual journal', Change: 'Budget change',
}

export interface DrillDoc {
  docNo: string
  kind: string
  detail: string
  amount: number
  /** Route to open the document, or null when the viewer has no access to it. */
  link: string | null
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${d} ${MONTH_NAMES[(m ?? 1) - 1]?.slice(0, 3)} ${y}`
}

/** Documents behind a line figure; their amounts sum to the cell. */
export function drillLine(lineId: string, figure: DrillFigure, period: ReportPeriod, role: BudgetRole): DrillDoc[] {
  return docsBehind(lineId, ENTRY_TYPE[figure], periodScope(period)).map((d) => {
    let detail = ''
    let link: string | null = null
    if (d.docKind === 'PR') {
      const pr = prById(d.docId)
      if (pr) { detail = `${pr.requester} · ${fmtDate(pr.date)}`; if (canOpenPurchaseRequests(role)) link = prLink(pr) }
    } else if (d.docKind === 'PO') {
      const po = poById(d.docId)
      if (po) detail = `${po.vendor} · ${fmtDate(po.date)}`
    } else if (d.docKind === 'Bill') {
      const b = budget.bills.find((x) => x.id === d.docId)
      if (b) detail = `${b.vendor} · ${fmtDate(b.date)}`
    } else if (d.docKind === 'Journal') {
      const g = budget.gl.find((x) => x.docNo === d.docNo)
      if (g) detail = `${MONTH_NAMES[g.month]} ${BUDGET_YEAR}`
    }
    return { docNo: d.docNo, kind: KIND_LABEL[d.docKind], detail, amount: d.amount, link }
  })
}

/** Postings on the No budget line or Not counted row. */
export function drillPostings(postings: GLPosting[]): DrillDoc[] {
  return postings.map((g) => {
    const bill = budget.bills.find((b) => b.number === g.docNo)
    const mix = `${deptName(g.dept)} × ${projectName(g.project)} × ${budgetAccount(g.account)?.name ?? g.account}`
    return {
      docNo: g.docNo,
      kind: g.source,
      detail: bill ? `${bill.vendor} · ${fmtDate(bill.date)} · ${mix}` : `${MONTH_NAMES[g.month]} ${BUDGET_YEAR} · ${mix}`,
      amount: g.amount,
      link: null,
    }
  })
}

// ── URL query (a copied link keeps the filters) ────────────────────────────────

export interface ReportQueryState { filter: ReportFilter; period: ReportPeriod; groupBy: GroupBy }
type Query = Record<string, string | null | (string | null)[] | undefined>
const NO_PROJECT = 'none'

function list(q: Query, key: string): string[] {
  const v = q[key]
  const s = Array.isArray(v) ? v.join(',') : v ?? ''
  return s.split(',').map((x) => x.trim()).filter(Boolean)
}

export function parseReportQuery(q: Query): ReportQueryState {
  const kind = PERIOD_KINDS.some((p) => p.value === q.period) ? q.period as PeriodKind : DEFAULT_PERIOD.kind
  const m = Number(q.month)
  const month = Number.isInteger(m) && m >= 1 && m <= 12 ? m - 1 : DEFAULT_PERIOD.month
  const groupBy = GROUP_OPTIONS.some((g) => g.value === q.group) ? q.group as GroupBy : 'none'
  return {
    period: { kind, month },
    groupBy,
    filter: {
      depts: list(q, 'dept'),
      projects: list(q, 'project').map((p) => (p === NO_PROJECT ? null : p)),
      accounts: list(q, 'account'),
      classes: list(q, 'class').filter((c): c is BudgetClass => c === 'Opex' || c === 'Capex'),
    },
  }
}

export function toReportQuery(s: ReportQueryState): Record<string, string> {
  const q: Record<string, string> = {}
  if (s.period.kind !== DEFAULT_PERIOD.kind) q.period = s.period.kind
  if (s.period.month !== DEFAULT_PERIOD.month) q.month = String(s.period.month + 1)
  if (s.groupBy !== 'none') q.group = s.groupBy
  if (s.filter.depts.length) q.dept = s.filter.depts.join(',')
  if (s.filter.projects.length) q.project = s.filter.projects.map((p) => p ?? NO_PROJECT).join(',')
  if (s.filter.accounts.length) q.account = s.filter.accounts.join(',')
  if (s.filter.classes.length) q.class = s.filter.classes.join(',')
  return q
}
