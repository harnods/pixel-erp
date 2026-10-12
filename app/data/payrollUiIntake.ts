/**
 * Payroll intake and posting: read models for the inbox and the run record
 * (FG-2, FG-3). Built on payrollStore; changes no engine behaviour.
 *
 *   runRow(run)                     one inbox row: period, version, staff, take-home pay, status, reason, next step.
 *   versionFigures(v)               staff, take-home pay and gross of one version's send.
 *   taxRuleRows(runId)              the one PPh 21 rule (LR-10) against the draft's tax lines.
 *   headcountMonths() / latestHeadcountMonth()   months with a regular run plus the current month.
 *   monthHeadcount(month)           the month's run against the previous posted run by group: new, not in this run, moved ids.
 *   hrMessage(ids, period)          the "Copy message for HR" text: employee_id values only.
 */
import {
  payroll, runs, currentVersionOf, runStatus, runHolds, liveJournals, journalsOf, headcountChanges, sendFigures, taxFigures,
  today, wib, periodLabel, monthLabel, addDays, lastDayOf, nextMonthOf, monthOf,
  type Run, type RunVersion, type RunStatus,
} from './payrollStore'

/** Staff, take-home pay (allowances - deductions) and gross allowances of one version's send. */
export function versionFigures(v: RunVersion | undefined) { return sendFigures(v) }

/** Badge colour per run or log status. */
export function statusType(s: string): 'completed' | 'announcement' | 'information' | 'warning' | 'critical' {
  switch (s) {
    case 'Posted': return 'completed'
    case 'Held': case 'Failed': case 'Blocked': case 'Missing send': return 'critical'
    case 'Changed': case 'Check': return 'warning'
    case 'Waiting for your choice': case 'Confirm source': case 'Correction ready': case 'Looks partial': return 'warning'
    case 'Ready to post': case 'Received': case 'Current': return 'information'
    case 'No change': case 'Expected': return 'completed'
    default: return 'announcement'
  }
}

const NEXT_STEP: Partial<Record<RunStatus, string>> = {
  'Confirm source': 'The Jurnal Owner confirms the source.',
  'Waiting for your choice': 'Pick Revision of the posted run or Separate run.',
  'Ready to post': 'Review the draft and post.',
  'Correction ready': 'Review the correction and post it.',
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
    nextStep: holds.length ? '' : (NEXT_STEP[status] ?? (status === 'Posted' ? 'The salary payable clears when the bank line is matched.' : '')),
    received: latest ? wib(latest.receivedAt) : '',
    receivedAt: latest?.receivedAt ?? '',
  }
}

export const inboxRows = () => runs.value.map(runRow)

/** LR-10: one PPh 21 rule. Rows for the review's tax panel, from the send's tax components and the draft lines. */
export function taxRuleRows(runId: string) {
  const f = taxFigures(runId)
  if (!f) return null
  const p = payroll.settings.taxPresets
  return {
    hasLines: f.hasLines,
    benefit: f.benefit, payment: f.payment, dtp: f.dtp, expected: f.rule,
    rows: [
      { label: 'Regular PPh 21', account: p.pph21, rule: f.rule, ledger: f.ledger },
      { label: 'PPh 21 on severance', account: p.resign, rule: f.resign, ledger: f.resignLedger },
      { label: 'PPh 26', account: p.pph26, rule: f.pph26, ledger: f.pph26Ledger },
      { label: 'PPh 21 DTP', account: p.dtp, rule: f.dtp, ledger: f.dtpLedger },
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
    live: !j.reversedById && !j.reversesId && (j.type === 'Payroll' || j.type === 'Correction'),
  }))
}

export { nextMonthOf }
