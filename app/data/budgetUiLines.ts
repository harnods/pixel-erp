/**
 * Budget lines screens (PRD FG-1): view state shared by the title bar and the
 * page, role scope, row building, filters, sample import files and version
 * compare. Every figure reads from budgetStore; nothing here stores an amount.
 */
import { reactive } from 'vue'
import {
  budget, BUDGET_YEAR, BUDGET_TODAY, lineClass, lineTitle, lineTotal, yearFigures, isLocked, yearState,
  currentVersion, lineAtVersion, lineVersionNo, prById, poById, changeById, isSavingLine, canManageBudgetLines,
  type BudgetLine, type ImportRow, type LedgerEntry, type BudgetVersion, type EntryType,
} from './budgetStore'
import {
  BUDGET_DEPARTMENTS, BUDGET_PROJECTS, BUDGET_ACCOUNTS, SAVING_ACCOUNT, deptName, projectName, accountLabel,
  personFor, type BudgetRole,
} from './budgetMaster'

// ── Years and the title-bar action bus ──────────────────────────────────────

export const BUDGET_LINE_YEARS = [BUDGET_YEAR, BUDGET_YEAR + 1]

export type LinesAction = 'new' | 'import' | 'lock' | 'compare'
let nonce = 0
export const linesUi = reactive<{ year: number; request: { action: LinesAction; nonce: number } | null }>({
  year: BUDGET_YEAR,
  request: null,
})
export function requestLinesAction(action: LinesAction): void { linesUi.request = { action, nonce: ++nonce } }

export function yearStatusLabel(year: number): 'Locked' | 'Draft' { return isLocked(year) ? 'Locked' : 'Draft' }

// ── Who sees what (FG-1.6) ──────────────────────────────────────────────────

export interface LineAccess {
  /** Create lines, import, lock, raise revisions. */
  manage: boolean
  /** Sees reserved, committed, actual, ledger and versions; false = balance only. */
  detail: boolean
  /** Department the role is limited to, or null for every line. */
  dept: string | null
}

export function lineAccess(role: BudgetRole = budget.viewAs): LineAccess {
  const p = personFor(role)
  if (role === 'Requester') return { manage: false, detail: false, dept: p.deptId }
  if (role === 'Line Manager' || role.startsWith('Budget holder')) return { manage: false, detail: true, dept: p.deptId }
  return { manage: canManageBudgetLines(role), detail: true, dept: null }
}

export function canReadLine(l: BudgetLine, role: BudgetRole = budget.viewAs): boolean {
  const a = lineAccess(role)
  return !a.dept || l.dept === a.dept
}

// ── Rows ────────────────────────────────────────────────────────────────────

export interface LineRow {
  id: string
  dept: string
  project: string | null
  account: string
  deptLabel: string
  projectLabel: string
  accountLabel: string
  classLabel: string
  budget: number
  reserved: number
  committed: number
  actual: number
  available: number
  versionLabel: string
  title: string
}

export function versionLabel(no: number | null): string { return no === null ? 'Draft' : `Version ${no}` }

export function lineRow(l: BudgetLine): LineRow {
  const f = yearFigures(l.id)
  return {
    id: l.id, dept: l.dept, project: l.project, account: l.account,
    deptLabel: deptName(l.dept),
    projectLabel: projectName(l.project),
    accountLabel: accountLabel(l.account),
    classLabel: lineClass(l) ?? (isSavingLine(l) ? 'Saving' : '-'),
    budget: lineTotal(l),
    reserved: f.reserved, committed: f.committed, actual: f.actual, available: f.available,
    versionLabel: versionLabel(lineVersionNo(l.id)),
    title: lineTitle(l),
  }
}

const sortKey = (l: BudgetLine) => [
  isSavingLine(l) ? 1 : 0,
  BUDGET_DEPARTMENTS.findIndex((d) => d.id === l.dept),
  l.project ? BUDGET_PROJECTS.findIndex((p) => p.id === l.project) : 99,
  BUDGET_ACCOUNTS.findIndex((a) => a.code === l.account),
]

export function linesForYear(year: number, role: BudgetRole = budget.viewAs): BudgetLine[] {
  return budget.lines
    .filter((l) => l.year === year && canReadLine(l, role))
    .sort((a, b) => {
      const ka = sortKey(a), kb = sortKey(b)
      for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i]! - kb[i]!
      return 0
    })
}

// ── Filters: values in one dimension OR, dimensions AND (FG1-AC3) ───────────

export interface LineFilters { depts: string[]; projects: (string | null)[]; accounts: string[]; classes: string[] }
export const emptyLineFilters = (): LineFilters => ({ depts: [], projects: [], accounts: [], classes: [] })

export function matchesLineFilters(r: Pick<LineRow, 'dept' | 'project' | 'account' | 'classLabel'>, f: LineFilters): boolean {
  return (!f.depts.length || f.depts.includes(r.dept))
    && (!f.projects.length || f.projects.includes(r.project))
    && (!f.accounts.length || f.accounts.includes(r.account))
    && (!f.classes.length || f.classes.includes(r.classLabel))
}
export function lineFilterCount(f: LineFilters): number {
  return f.depts.length + f.projects.length + f.accounts.length + f.classes.length
}

export const DEPT_OPTIONS = BUDGET_DEPARTMENTS.map((d) => ({ value: d.id, label: d.name }))
export const PROJECT_OPTIONS: { value: string | null; label: string }[] = [
  ...BUDGET_PROJECTS.map((p) => ({ value: p.id as string | null, label: p.name })),
  { value: null, label: projectName(null) },
]
export const ACCOUNT_OPTIONS = BUDGET_ACCOUNTS.filter((a) => a.class).map((a) => ({ value: a.code, label: `${a.code} ${a.name}` }))
export const CLASS_OPTIONS = ['Opex', 'Capex']

export interface LineTotals { lines: number; budget: number; reserved: number; committed: number; actual: number; available: number }
export function totalsOf(rows: LineRow[]): LineTotals {
  return rows.reduce((t, r) => ({
    lines: t.lines + 1, budget: t.budget + r.budget, reserved: t.reserved + r.reserved,
    committed: t.committed + r.committed, actual: t.actual + r.actual, available: t.available + r.available,
  }), { lines: 0, budget: 0, reserved: 0, committed: 0, actual: 0, available: 0 })
}

// ── Sample import files (FG-1.4: the import loads a sample file) ────────────

const jt = 1_000_000
const m = (...v: number[]) => v.map((x) => x * jt)
const flat = (v: number) => Array(12).fill(v * jt) as number[]

export interface SampleFile { name: string; rows: ImportRow[] }

/** The approved 2027 budget, keyed to master data. */
export function sample2027(): SampleFile {
  return {
    name: 'Budget 2027 - approved.xlsx',
    rows: [
      { row: 2, account: '6-60120', dept: 'NW', project: 'PA', months: m(10, 0, 25, 5, 5, 5, 5, 5, 5, 5, 5, 5) },
      { row: 3, account: '6-60103', dept: 'NW', project: 'PA', months: flat(10) },
      { row: 4, account: '6-60130', dept: 'NW', project: 'PA', months: flat(6) },
      { row: 5, account: '1-17010', dept: 'NW', project: 'PA', months: flat(150) },
      { row: 6, account: '6-60120', dept: 'NW', project: 'PB', months: flat(8) },
      { row: 7, account: '6-60111', dept: 'NW', project: '', months: flat(2) },
      { row: 8, account: '6-60120', dept: 'OP', project: '', months: flat(6) },
      { row: 9, account: '6-60130', dept: 'OP', project: '', months: flat(4) },
      { row: 10, account: '1-15020', dept: 'IT', project: '', months: flat(45) },
    ],
  }
}

/** The same file with the mistakes Finance makes offline: unknown codes, text, decimals, no class. */
export function sample2027WithErrors(): SampleFile {
  const rows = sample2027().rows.map((r) => ({ ...r, months: [...r.months] as (number | string)[] }))
  rows[1]!.account = '6-60199'
  rows[3]!.months[4] = 'Rp150jt'
  rows[5]!.months[0] = 2_000_000.5
  rows.push({ row: 11, account: '6-60140', dept: 'FN', project: '', months: flat(3) })
  rows.push({ row: 12, account: '6-60120', dept: 'MK', project: 'PA', months: flat(4) })
  return { name: 'Budget 2027 - draft v3.xlsx', rows }
}

export function importRowTotal(r: ImportRow): number {
  return r.months.reduce<number>((s, v) => s + (typeof v === 'number' && Number.isFinite(v) ? v : 0), 0)
}

// ── Ledger and versions on the line record ──────────────────────────────────

export const ENTRY_TYPE_LABEL: Record<EntryType, string> = {
  'reserve': 'Reserved', 'commit': 'Committed', 'actual': 'Actual', 'transfer-hold': 'Held for transfers',
}

const SEED_STAMP = `${BUDGET_TODAY}T08:00:00+07:00`

/** When the entry happened. Sample entries carry the load time, so they take their document's date. */
export function entryDate(e: LedgerEntry): string {
  if (e.at !== SEED_STAMP) return e.at
  if (e.docKind === 'PR') return prById(e.docId)?.date ?? e.at
  if (e.docKind === 'PO') return poById(e.docId)?.date ?? e.at
  if (e.docKind === 'Bill') return budget.bills.find((b) => b.id === e.docId)?.date ?? e.at
  if (e.docKind === 'Change') return changeById(e.docId)?.submittedAt ?? e.at
  if (e.docKind === 'Journal') return `${yearOfLine(e.lineId)}-${String(e.month + 1).padStart(2, '0')}-28`
  return e.at
}
function yearOfLine(lineId: string): number { return budget.lines.find((l) => l.id === lineId)?.year ?? BUDGET_YEAR }

/** Where a ledger entry's document opens: the purchase request or the budget change. */
export function entryLink(e: LedgerEntry): string | null {
  if (e.docKind === 'PR') { const pr = prById(e.docId); return pr ? (pr.purchaseRequestId ? `/purchase-requests/${pr.purchaseRequestId}` : '/purchase-requests') : null }
  if (e.docKind === 'Change') return changeById(e.docId) ? `/budget-changes/${e.docId}` : null
  return null
}

export function versionLink(v: BudgetVersion): string | null {
  const c = budget.changes.find((x) => x.number === v.docNo)
  return c ? `/budget-changes/${c.id}` : null
}

export function versionDeltaOn(v: BudgetVersion, lineId: string): number {
  return v.changes.filter((c) => c.lineId === lineId).reduce((s, c) => s + c.delta, 0)
}

// ── Version compare ─────────────────────────────────────────────────────────

export function versionsOfYear(year: number): BudgetVersion[] {
  return budget.versions.filter((v) => v.year === year).sort((a, b) => a.no - b.no)
}

export interface CompareRow { lineId: string; title: string; a: number; b: number; diff: number }
export function compareVersions(year: number, a: number, b: number, lines: BudgetLine[]): CompareRow[] {
  return lines
    .map((l) => {
      const va = lineAtVersion(l.id, a, year), vb = lineAtVersion(l.id, b, year)
      return { lineId: l.id, title: lineTitle(l), a: va, b: vb, diff: vb - va }
    })
    .filter((r) => r.a !== 0 || r.b !== 0)
}

export function yearCaption(year: number): string {
  const ys = yearState(year)
  if (isLocked(year)) return `Locked · Version ${currentVersion(year)}`
  return ys ? 'Draft' : 'Draft · no lines yet'
}

export { SAVING_ACCOUNT }

// ── Amount fields ───────────────────────────────────────────────────────────

/** Read a typed rupiah amount: dots group thousands; a comma means decimals. Blank is 0. */
export function parseAmount(s: string): number {
  const v = s.replace(/rp/gi, '').replace(/\s/g, '')
  if (!v) return 0
  if (/,/.test(v)) return Number(v.replace(/\./g, '').replace(',', '.'))
  if (!/^-?[\d.]+$/.test(v)) return Number.NaN
  return Number(v.replace(/\./g, ''))
}
/** Digits grouped with dots, no currency sign: the way an amount field shows it. */
export function groupDigits(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "22 Sep 2026" from an ISO date or timestamp. */
export function shortDate(iso: string): string {
  const [y, mo, d] = iso.slice(0, 10).split('-').map(Number)
  return `${d} ${SHORT_MONTHS[(mo ?? 1) - 1]} ${y}`
}
