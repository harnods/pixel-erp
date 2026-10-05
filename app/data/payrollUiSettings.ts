/**
 * Payroll settings screen helpers (FG-1). Read-only views over payrollStore:
 * last-run figures per pay item, values Talenta has sent per field, the
 * "Matches N employees" rule preview with the shadowed-rule check, the dry-run
 * report (totals against Talenta, groups, old-route split) and the cut-over
 * timeline. Nothing here writes the payroll state; every figure is computed
 * from the stored sends, the settings and the posted journals.
 */
import {
  payroll, runs, runStatus, currentVersionOf, mappingFor, payItemKey, payrollAccount,
  liveJournals, monthLabel, periodLabel, tagsLabel, accountLabel, nextMonthOf, today,
  type Run, type RunVersion, type PayRole, type RuleCondition, type Draft, type JournalLine, type Tags,
} from './payrollStore'
import type { TalentaEmployee, PaySection, PayrollAccountType } from './payrollMaster'
import { coaRecords } from './chartOfAccounts'

const cents = (x: number) => Math.round(x * 100)
const whole = (c: number) => (c >= 0 ? Math.floor((c + 50) / 100) : -Math.floor((-c + 50) / 100))
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()
const SECTIONS: [PaySection, 'allowances' | 'deductions' | 'benefits'][] = [['allowance', 'allowances'], ['deduction', 'deductions'], ['benefit', 'benefits']]
/** Roles whose cost side an allocation rule may move (same list as the engine). */
const COST_ROLES: PayRole[] = ['Earning', 'Employer contribution', 'Reimbursement', 'THR', 'Severance']

export const isCostAccount = (code: string | null) => { const t = payrollAccount(code)?.type; return t === 'expense' || t === 'cogs' }

// ── Sends ───────────────────────────────────────────────────────────────────

/** The send a run is read from: its current version, else its latest. */
export function sendOf(run: Run): RunVersion | undefined {
  return currentVersionOf(run) ?? run.versions[run.versions.length - 1]
}
/** Staff Jurnal books: the send's employees less the Other entity groups. */
export function staffOfSend(v: RunVersion): TalentaEmployee[] {
  const oe = payroll.settings.otherEntity
  return v.payload.employees.filter((e) => !oe.some((x) => (e[x.field] ?? '') === x.value))
}
/** The newest regular run Talenta has sent. */
export function latestRegularRun(): Run | undefined {
  return runs.value.find((r) => r.kind === 'Regular' && !!sendOf(r))
}
export function runOptionLabel(r: Run): string {
  const kind = r.kind === 'Regular' ? '' : ` · ${r.label}`
  return `${periodLabel(r.start, r.end)}${kind} · ${runStatus(r)}`
}

export function fieldValueOf(e: TalentaEmployee, field: string): string {
  if (field === 'custom:BusinessUnit') return e.custom_fields?.BusinessUnit ?? ''
  if (field === 'cost_center_category') return payroll.settings.costCenterCategory[e.cost_center_name] ?? ''
  return String((e as unknown as Record<string, unknown>)[field] ?? '')
}

/** Every value Talenta has sent for a field (all runs) plus values accepted in Jurnal. */
export function valuesSeen(field: string): string[] {
  if (field === 'cost_center_category') return ['Direct', 'In-direct']
  const out = new Set<string>(payroll.settings.knownValues[field] ?? [])
  for (const r of payroll.runs) for (const v of r.versions) for (const e of v.payload.employees) { const x = fieldValueOf(e, field).trim(); if (x) out.add(x) }
  return [...out].sort((a, b) => a.localeCompare(b))
}

/** Staff per value of a grouping field in the newest regular send. */
export function staffByValue(field: 'organization_name' | 'branch_name' | 'cost_center_name'): Record<string, number> {
  const r = latestRegularRun(), v = r && sendOf(r)
  const out: Record<string, number> = {}
  if (!v) return out
  const seen = new Set<string>()
  for (const e of v.payload.employees) {
    const k = `${e.employee_id}|${e[field]}`
    if (seen.has(k)) continue
    seen.add(k)
    out[e[field]] = (out[e[field]] ?? 0) + 1
  }
  return out
}
/** Staff and allowance total per value in the newest regular send (Other entity summary). */
export function groupSummary(field: 'organization_name' | 'branch_name', value: string): { staff: number; amount: number } {
  const r = latestRegularRun(), v = r && sendOf(r)
  if (!v) return { staff: 0, amount: 0 }
  const emps = v.payload.employees.filter((e) => e[field] === value)
  return { staff: new Set(emps.map((e) => e.employee_id)).size, amount: whole(emps.reduce((s, e) => s + cents(e.total_allowances), 0)) }
}

// ── Pay items ───────────────────────────────────────────────────────────────

export interface PayItemFigure { amount: number; staff: number; runId: string; runLabel: string }
/** Per pay item: its total in the newest run that carried it. */
export function lastRunFigures(): Record<string, PayItemFigure> {
  const out: Record<string, PayItemFigure> = {}
  for (const r of runs.value) {
    const v = sendOf(r)
    if (!v) continue
    const here: Record<string, { c: number; staff: Set<string> }> = {}
    for (const e of staffOfSend(v)) for (const [section, list] of SECTIONS) for (const it of e[list]) {
      const k = payItemKey(it.name, section)
      const x = (here[k] ??= { c: 0, staff: new Set() })
      x.c += cents(it.amount); x.staff.add(e.employee_id)
    }
    for (const [k, x] of Object.entries(here)) if (!out[k]) out[k] = { amount: whole(x.c), staff: x.staff.size, runId: r.id, runLabel: periodLabel(r.start, r.end) }
  }
  return out
}

// ── Allocation rules (OD-08) ────────────────────────────────────────────────

export interface RuleDraft { id?: string; conditions: RuleCondition[]; roles: PayRole[]; active: boolean }
function matches(e: TalentaEmployee, conditions: RuleCondition[]): boolean {
  return conditions.every((c) => {
    const v = norm(fieldValueOf(e, c.field))
    const hit = c.values.some((x) => norm(x) === v)
    return c.op === 'is' ? hit : !hit
  })
}
export interface RulePreview { employees: number; amount: number; wins: number; shadowed: boolean; runLabel: string | null }
/**
 * "Matches N employees, Rp…" on the newest regular send. The amount is the cost
 * the rule governs: items whose role the rule lists and whose debit is a cost
 * account. A rule is shadowed when every employee it matches is already taken,
 * for each of its roles, by an earlier active rule (the engine takes the first match).
 */
export function rulePreview(rule: RuleDraft): RulePreview {
  const r = latestRegularRun(), v = r && sendOf(r)
  if (!r || !v || !rule.conditions.length) return { employees: 0, amount: 0, wins: 0, shadowed: false, runLabel: r ? periodLabel(r.start, r.end) : null }
  const list = payroll.settings.rules
  const idx = rule.id ? list.findIndex((x) => x.id === rule.id) : list.length
  const earlier = list.slice(0, idx < 0 ? list.length : idx).filter((x) => x.active)
  const roles = rule.roles.length ? rule.roles : (['Earning', 'Employer contribution'] as PayRole[])
  let employees = 0, wins = 0, c = 0
  const seen = new Set<string>()
  for (const e of staffOfSend(v)) {
    if (!matches(e, rule.conditions)) continue
    if (!seen.has(e.employee_id)) { employees++; seen.add(e.employee_id) }
    const won = roles.some((role) => !earlier.some((x) => x.roles.includes(role) && matches(e, x.conditions)))
    if (won) wins++
    for (const [section, key] of SECTIONS) for (const it of e[key]) {
      const m = mappingFor(it.name, section)
      if (m?.role && roles.includes(m.role) && COST_ROLES.includes(m.role) && isCostAccount(m.debit)) c += cents(it.amount)
    }
  }
  return { employees, amount: whole(c), wins, shadowed: employees > 0 && wins === 0 && rule.active, runLabel: periodLabel(r.start, r.end) }
}

// ── Dry run (OD-10) ─────────────────────────────────────────────────────────

export interface DryRunResult { runId: string; versionNo: number | null; at: string; snapshotId: string; holds: { code: string; message: string }[]; draft: Draft | null }

export function dryRunReport(run: Run, res: DryRunResult) {
  const v = (res.versionNo != null ? run.versions.find((x) => x.no === res.versionNo) : undefined) ?? sendOf(run)!
  const staff = staffOfSend(v)
  const s = payroll.settings
  const lines = res.draft?.lines ?? []
  const net = (code: string) => lines.filter((l) => l.account === code).reduce((x, l) => x + l.credit - l.debit, 0)
  // Pay item lines against Talenta's section totals (OD-04 basis).
  const sum = (section: PaySection, key: 'allowances' | 'deductions' | 'benefits', skipEmployer: boolean) => whole(staff.reduce((x, e) => x + e[key]
    .filter((i) => !(skipEmployer && mappingFor(i.name, section)?.role === 'Employer contribution'))
    .reduce((y, i) => y + cents(i.amount), 0), 0))
  const talenta = (k: 'total_allowances' | 'total_deductions' | 'total_benefits' | 'take_home_pay') => whole(staff.reduce((x, e) => x + cents(e[k]), 0))
  const basisWithout = s.deductionsBasis === 'without-employer'
  const totals = [
    { label: 'Allowances', lines: sum('allowance', 'allowances', false), talenta: talenta('total_allowances') },
    { label: 'Deductions', lines: sum('deduction', 'deductions', basisWithout), talenta: talenta('total_deductions') },
    { label: 'Benefits', lines: sum('benefit', 'benefits', false), talenta: talenta('total_benefits') },
    { label: `Take-home pay against ${accountLabel(s.hutangGaji)}`, lines: net(s.hutangGaji), talenta: talenta('take_home_pay') },
    {
      label: 'PPh 21 (PPh 21 Benefit + PPh 21 Payment - PPh 21 DTP)', lines: net(s.taxPresets.pph21),
      talenta: whole(staff.reduce((x, e) => x + cents(e['PPh 21 Benefit']) + cents(e['PPh 21 Payment']) - cents(e['Total PPh 21 DTP Received']), 0)),
    },
    { label: 'PPh 26', lines: net(s.taxPresets.pph26), talenta: whole(staff.reduce((x, e) => x + cents(e['PPh 26 Benefit']), 0)) },
  ].map((r) => ({ ...r, variance: r.talenta - r.lines }))
  // TN-31: does total_deductions include employer contributions?
  const withEmp = sum('deduction', 'deductions', false), withoutEmp = sum('deduction', 'deductions', true), td = talenta('total_deductions')
  const basis = { withEmployer: withEmp, withoutEmployer: withoutEmp, talenta: td, includesEmployer: td === withEmp ? true : td === withoutEmp ? false : null }
  // Groups: headcount and cost by account and tag.
  const groups = new Map<string, { account: string; tags: string; amount: number; staff: Set<string> }>()
  for (const l of lines) {
    if (!isCostAccount(l.account)) continue
    const k = `${l.account}|${tagsLabel(l.tags)}`
    const g = groups.get(k) ?? { account: l.account, tags: tagsLabel(l.tags), amount: 0, staff: new Set<string>() }
    g.amount += l.debit - l.credit
    for (const src of l.sources) for (const id of src.staff) g.staff.add(id)
    groups.set(k, g)
  }
  const groupRows = [...groups.values()].map((g) => ({ account: g.account, tags: g.tags, amount: g.amount, staff: g.staff.size }))
    .sort((a, b) => a.account.localeCompare(b.account) || a.tags.localeCompare(b.tags))
  // TN-30: account-class split against the old route, which booked one Expense per run.
  const cos = lines.filter((l) => payrollAccount(l.account)?.type === 'cogs').reduce((x, l) => x + l.debit - l.credit, 0)
  const exp = lines.filter((l) => payrollAccount(l.account)?.type === 'expense').reduce((x, l) => x + l.debit - l.credit, 0)
  const classes = [
    { label: 'Cost of sales', oldRoute: 0, setup: cos },
    { label: 'Expenses', oldRoute: cos + exp, setup: exp },
  ].map((r) => ({ ...r, change: r.setup - r.oldRoute }))
  const debit = lines.reduce((x, l) => x + l.debit, 0), credit = lines.reduce((x, l) => x + l.credit, 0)
  return { send: v, staff: new Set(staff.map((e) => e.employee_id)).size, totals, basis, groups: groupRows, classes, debit, credit, balanced: debit === credit && debit > 0 }
}

/** Lines that moved between two results, by account and tag. */
export function resultChanges(a: JournalLine[], b: JournalLine[]) {
  const key = (l: { account: string; tags: Tags }) => `${l.account}#${tagsLabel(l.tags)}`
  const m = new Map<string, { account: string; tags: string; old: number; now: number }>()
  for (const [list, side] of [[a, 'old'], [b, 'now']] as const) for (const l of list) {
    const x = m.get(key(l)) ?? { account: l.account, tags: tagsLabel(l.tags), old: 0, now: 0 }
    x[side] += l.debit - l.credit
    m.set(key(l), x)
  }
  return [...m.values()].filter((x) => x.old !== x.now).map((x) => ({ ...x, diff: x.now - x.old }))
}

export function nextPayNumberPreview(): string { return `PAY-${String(payroll.payNo + 1).padStart(4, '0')}` }

// ── Accounts (TS-03) ────────────────────────────────────────────────────────

const COA_TYPE: Record<number, PayrollAccountType> = { 3: 'cash', 1: 'asset', 2: 'asset', 8: 'liability', 10: 'liability', 11: 'liability', 15: 'cogs', 16: 'expense', 17: 'expense' }
/** Who already uses a code: the payroll set or the shared chart of accounts. */
export function codeHolder(code: string): string | null {
  const c = code.trim()
  const p = payrollAccount(c)
  if (p) return `${p.code} ${p.name}`
  const a = coaRecords.find((x) => x.code === c)
  return a ? `${a.code} ${a.name}` : null
}
/** The next free code after a taken one, same prefix (TS03-US01 AC-04). */
export function nextFreeCode(code: string): string | null {
  const m = /^(\d)-(\d{5})$/.exec(code.trim())
  if (!m) return null
  for (let n = Number(m[2]) + 1; n < 100000; n++) {
    const c = `${m[1]}-${String(n).padStart(5, '0')}`
    if (!codeHolder(c)) return c
  }
  return null
}
/** A chart account with the same name, offered as "Use existing" (TS03-US03). */
export function existingByName(name: string): { code: string; name: string; type: PayrollAccountType | null } | null {
  const n = norm(name)
  if (!n) return null
  const a = coaRecords.find((x) => norm(x.name) === n && !payrollAccount(x.code))
  return a ? { code: a.code, name: a.name, type: COA_TYPE[a.categoryId] ?? null } : null
}
export function mappingUses(code: string): number {
  return payroll.settings.mapping.filter((m) => m.debit === code || m.credit === code).length
}

// ── Cut-over (OD-11) ────────────────────────────────────────────────────────

const addMonths = (m: string, n: number) => { let x = m; for (let i = 0; i < n; i++) x = nextMonthOf(x); return x }
const prevMonth = (m: string) => { const [y, mm] = m.split('-').map(Number) as [number, number]; return mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, '0')}` }
/** Months a first live period can be: from the earliest run's month to three months ahead. */
export function cutoverMonths(): string[] {
  const first = [...payroll.runs].map((r) => r.month).sort()[0] ?? today().slice(0, 7)
  const last = addMonths(today().slice(0, 7), 3)
  const out: string[] = []
  for (let m = first; m <= last; m = nextMonthOf(m)) out.push(m)
  return out
}
export interface TimelineRow { month: string; label: string; route: 'Old sync' | 'Payroll page' | 'Not set'; runs: { id: string; label: string; status: string; journal: string | null }[]; oldSync: { passed: number; blocked: number; flagged: number }; warning: string | null }
/** One row per month: which route books payroll, the runs, the old-sync calls and any double or missing booking. */
export function cutoverTimeline(): TimelineRow[] {
  const c = payroll.settings.cutover
  const live = c.firstLive && c.confirmedBy ? c.firstLive : null
  const months = new Set<string>(payroll.runs.map((r) => r.month))
  for (const o of payroll.oldSync) months.add(o.date.slice(0, 7))
  if (c.firstLive) months.add(c.firstLive)
  const sorted = [...months].sort()
  if (!sorted.length) return []
  const all: string[] = []
  for (let m = prevMonth(sorted[0]!); m <= sorted[sorted.length - 1]!; m = nextMonthOf(m)) all.push(m)
  const now = today().slice(0, 7)
  return all.map((month) => {
    const rs = payroll.runs.filter((r) => r.month === month).map((r) => {
      const j = liveJournals(r.id)[0]
      return { id: r.id, label: `${periodLabel(r.start, r.end)}${r.kind === 'Regular' ? '' : ` · ${r.label}`}`, status: runStatus(r), journal: j?.number ?? null }
    })
    const calls = payroll.oldSync.filter((o) => o.date.slice(0, 7) === month && o.pattern === 'Payroll')
    const oldSync = { passed: calls.filter((o) => o.outcome === 'Passed').length, blocked: calls.filter((o) => o.outcome === 'Blocked').length, flagged: calls.filter((o) => o.outcome === 'Flagged').length }
    const route: TimelineRow['route'] = !live ? 'Not set' : month < live ? 'Old sync' : 'Payroll page'
    let warning: string | null = null
    if (route === 'Payroll page' && rs.some((r) => r.journal) && oldSync.passed + oldSync.flagged > 0) warning = 'Booked by both routes'
    else if (route === 'Payroll page' && month < now && !rs.length && oldSync.passed + oldSync.flagged === 0) warning = 'No payroll from either route'
    return { month, label: monthLabel(month), route, runs: rs, oldSync, warning }
  })
}
