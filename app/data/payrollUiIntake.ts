/**
 * Payroll intake and posting: read models for the inbox and the run record
 * (FG-2, FG-3). Built on payrollStore; changes no engine behaviour.
 *
 *   runRow(run)                     one inbox row: period, version, staff, take-home pay, status, reason, next step.
 *   versionFigures(v)               staff, take-home pay and gross of one version's send.
 *   needsFinanceConfirm(runId)      the MLP stopgap (TN-24): override in the draft, or settings changed since the last posted run.
 *   taxRuleRows(runId)              the one PPh 21 rule (LR-10) against the draft's tax lines.
 *   headcountMonths() / latestHeadcountMonth()   months with a regular run plus the current month.
 *   monthHeadcount(month)           the month's run against the previous posted run by group: new, not in this run, moved ids.
 *   hrMessage(ids, period)          the "Copy message for HR" text: employee_id values only.
 */
import {
  payroll, runs, runById, currentVersionOf, runStatus, runHolds, draftOf, liveJournals, journalsOf, headcountChanges,
  snapshotById, today, wib, periodLabel, monthLabel, addDays, lastDayOf, nextMonthOf, monthOf,
  type Run, type RunVersion, type RunStatus, type JournalLine,
} from './payrollStore'

const round = (x: number) => Math.round(x)

export function versionFigures(v: RunVersion | undefined) {
  if (!v) return { staff: 0, takeHome: 0, gross: 0 }
  const emps = v.payload.employees
  return {
    staff: new Set(emps.map((e) => e.employee_id)).size,
    takeHome: round(emps.reduce((s, e) => s + e.take_home_pay, 0)),
    gross: round(emps.reduce((s, e) => s + e.total_allowances, 0)),
  }
}

/** Badge colour per run or log status. */
export function statusType(s: string): 'completed' | 'announcement' | 'information' | 'warning' | 'critical' {
  switch (s) {
    case 'Posted': return 'completed'
    case 'Held': case 'Failed': case 'Blocked': case 'Missing send': return 'critical'
    case 'Changed': case 'Check': return 'warning'
    case 'Waiting for your choice': case 'Confirm source': case 'Revised': case 'Looks partial': return 'warning'
    case 'Ready to post': case 'Received': case 'Current': return 'information'
    case 'No change': case 'Expected': return 'completed'
    default: return 'announcement'
  }
}

const NEXT_STEP: Partial<Record<RunStatus, string>> = {
  'Confirm source': 'The Jurnal Owner confirms the source.',
  'Waiting for your choice': 'Pick Revision of the posted run or Separate run.',
  'Ready to post': 'Review the draft and post.',
  Revised: 'Compare the versions and fix the posted journal.',
  Reversed: 'Repost the current version.',
  'Dry run': 'Nothing posts from a dry run.',
  'Before go-live': 'Nothing posts before the first live period.',
  'Nothing to post': 'Nothing to do.',
  Received: 'Nothing to do.',
}

export function runRow(run: Run) {
  const v = currentVersionOf(run)
  const latest = run.versions[run.versions.length - 1]
  const status = runStatus(run)
  const holds = runHolds(run)
  const live = liveJournals(run.id)
  const f = versionFigures(v)
  return {
    id: run.id,
    period: periodLabel(run.start, run.end),
    month: run.month,
    monthLabel: monthLabel(run.month),
    type: run.kind === 'Regular' ? 'Regular' : `${run.kind}: ${run.label}`,
    key: run.key,
    version: v ? `v${v.no}` : '',
    versions: run.versions.length,
    latestNo: latest?.no ?? null,
    staff: f.staff,
    takeHome: f.takeHome,
    status,
    reason: holds[0]?.message ?? (live.length ? `Posted as ${live.map((j) => j.number).join(', ')}` : ''),
    nextStep: holds.length ? '' : (NEXT_STEP[status] ?? (status === 'Posted' ? 'Record the salary payment on payday.' : '')),
    received: latest ? wib(latest.receivedAt) : '',
    receivedAt: latest?.receivedAt ?? '',
  }
}

export const inboxRows = () => runs.value.map(runRow)

/** TN-24 stopgap: Post needs a Finance Manager confirm when the draft uses an override or settings moved since the last posted run. */
export function needsFinanceConfirm(runId: string): boolean {
  const run = runById(runId)
  const d = run ? draftOf(run) : null
  if (!d) return false
  const s = snapshotById(d.snapshotId)?.settings ?? payroll.settings
  const override = s.mapping.some((m) => m.override && d.lines.some((l) => l.sources.some((x) => x.item === m.name)))
  const lastPosted = [...payroll.journals].reverse().find((j) => j.type === 'Payroll' && j.snapshotId)
  return override || (!!lastPosted && lastPosted.snapshotId !== d.snapshotId)
}

/** LR-10: one PPh 21 rule. Rows for the review's tax panel, from the send and the draft lines. */
export function taxRuleRows(runId: string) {
  const run = runById(runId)
  const v = run ? currentVersionOf(run) : undefined
  if (!run || !v) return null
  const oe = payroll.settings.otherEntity
  const staff = v.payload.employees.filter((e) => !oe.some((x) => (e[x.field] ?? '') === x.value))
  const sum = (k: 'PPh 21 Benefit' | 'PPh 21 Payment' | 'PPh 21 Resign Benefit' | 'PPh 26 Benefit' | 'Total PPh 21 DTP Received') => round(staff.reduce((s, e) => s + e[k], 0))
  const p = payroll.settings.taxPresets
  const lines: JournalLine[] = v.draft?.lines ?? (liveJournals(runId)[0]?.lines ?? [])
  const net = (code: string) => lines.filter((l) => l.account === code).reduce((s, l) => s + l.credit - l.debit, 0)
  const dtpLedger = lines.filter((l) => l.account === p.dtp).reduce((s, l) => s + l.debit - l.credit, 0)
  const benefit = sum('PPh 21 Benefit'), payment = sum('PPh 21 Payment'), dtp = sum('Total PPh 21 DTP Received')
  const expected = benefit + payment - dtp
  return {
    hasLines: lines.length > 0,
    benefit, payment, dtp, expected,
    rows: [
      { label: 'Regular PPh 21', account: p.pph21, rule: expected, ledger: net(p.pph21) },
      { label: 'PPh 21 on severance', account: p.resign, rule: sum('PPh 21 Resign Benefit'), ledger: p.resign === p.pph21 ? null : net(p.resign) },
      { label: 'PPh 26', account: p.pph26, rule: sum('PPh 26 Benefit'), ledger: net(p.pph26) },
      { label: 'PPh 21 DTP', account: p.dtp, rule: dtp, ledger: dtpLedger },
    ],
  }
}

// ── Month headcount (OD-02): the month's regular run against the previous posted one ──

/** Every month with a regular run, plus the current month, newest first. */
export function headcountMonths(): string[] {
  const set = new Set(payroll.runs.filter((r) => r.kind === 'Regular').map((r) => r.month))
  set.add(monthOf(today()))
  return [...set].sort().reverse()
}
/** The latest month whose regular run has arrived (the inbox stat tracks it). */
export function latestHeadcountMonth(): string {
  return headcountMonths().find((m) => payroll.runs.some((r) => r.kind === 'Regular' && r.month === m)) ?? monthOf(today())
}

/** Pay period of a month: the regular run's, else the same day pattern as the latest run. */
function periodOfMonth(month: string): { start: string; end: string; run: Run | undefined } {
  const run = payroll.runs.find((r) => r.kind === 'Regular' && r.month === month)
  if (run) return { start: run.start, end: run.end, run }
  const ref = [...payroll.runs].filter((r) => r.kind === 'Regular').sort((a, b) => b.end.localeCompare(a.end))[0]
  if (!ref) return { start: `${month}-01`, end: lastDayOf(month), run: undefined }
  const day = ref.end.slice(8)
  const end = `${month}-${day}` > lastDayOf(month) ? lastDayOf(month) : `${month}-${day}`
  const prevMonth = monthOf(addDays(`${month}-01`, -1))
  return { start: addDays(`${prevMonth}-${day}` > lastDayOf(prevMonth) ? lastDayOf(prevMonth) : `${prevMonth}-${day}`, 1), end, run: undefined }
}

/**
 * Staff in a month's regular run against the previous posted regular run, by group,
 * with the employee_ids that are new, not in the run, or moved (headcountChanges).
 */
export function monthHeadcount(month: string) {
  const { start, end, run } = periodOfMonth(month)
  const hc = run ? headcountChanges(run.id) : null
  const v: RunVersion | undefined = run ? currentVersionOf(run) : undefined
  const due = end <= today()
  const status = !run ? (due ? 'Missing send' : 'Not sent yet') : !hc?.previous ? 'No earlier run' : hc.flagged === 0 ? 'No change' : hc.unexpected ? 'Changed' : 'Expected'
  return {
    month, label: monthLabel(month), start, end, period: periodLabel(start, end), sent: !!run, status,
    runId: run?.id ?? null, runStatus: run ? runStatus(run) : null, version: v ? `v${v.no}` : null,
    previous: hc?.previous ?? null,
    last: hc?.last ?? null, current: hc?.current ?? 0,
    joined: hc?.joined ?? [], left: hc?.left ?? [], moved: hc?.moved ?? [],
    changed: (hc?.joined.length ?? 0) + (hc?.left.length ?? 0) + (hc?.moved.length ?? 0),
    groups: hc?.groups ?? [], flagged: hc?.flagged ?? 0, unexpected: hc?.unexpected ?? 0,
  }
}

export function hrMessage(ids: string[], period: string): string {
  return `Payroll ${period}: please check and re-send from Talenta. Employee IDs: ${ids.join(', ')}`
}

/** Journals of a run, newest first, with their totals. */
export function runJournals(runId: string) {
  return journalsOf(runId).slice().reverse().map((j) => ({
    ...j,
    debit: j.lines.reduce((s, l) => s + l.debit, 0),
    credit: j.lines.reduce((s, l) => s + l.credit, 0),
    live: !j.reversedById && !j.reversesId && (j.type === 'Payroll' || j.type === 'Difference'),
  }))
}

export { nextMonthOf }
