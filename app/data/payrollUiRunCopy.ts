/**
 * UI copy for the payroll screens: plain labels for engine values the engine still names in its
 * own words (run statuses, version states, sync results, pay item roles), and ONE status badge
 * map so a status reads the same word and the same colour on every payroll screen.
 * Display only; the engine values, filters and tests keep the original strings.
 */

export type BadgeType = 'completed' | 'announcement' | 'information' | 'warning' | 'critical'

/**
 * Status -> label and colour. One meaning per colour across payroll:
 *   critical (red)      stops posting or money is late: Held, Rejected, Overdue, New group, Needs account
 *   warning (yellow)    waits on a person: Awaiting approval, Sent again, Choose, Partly paid
 *   information (blue)  ready for the next step: Ready to post, Current, Duplicate
 *   completed (green)   done: Posted, Paid, Accepted, Connected, No change, Expected
 *   announcement (gray) nothing to do here: Before start month, Superseded, Open
 */
const STATUS: Record<string, { label: string; type: BadgeType }> = {
  // Run statuses
  Held: { label: 'Held', type: 'critical' },
  'Confirm source': { label: 'Confirm company', type: 'warning' },
  'Waiting for your choice': { label: 'Choose how to use it', type: 'warning' },
  'Awaiting approval': { label: 'Awaiting approval', type: 'warning' },
  'Revision ready': { label: 'Sent again', type: 'warning' },
  'Ready to post': { label: 'Ready to post', type: 'information' },
  Posted: { label: 'Posted', type: 'completed' },
  Reversed: { label: 'Reversed, not reposted', type: 'critical' },
  'Dry run': { label: 'Before start month', type: 'announcement' },
  'Before go-live': { label: 'Before start month', type: 'announcement' },
  'Nothing to post': { label: 'Nothing to post', type: 'announcement' },
  Received: { label: 'Received', type: 'announcement' },
  // Version states (Versions tab, compare pickers)
  Current: { label: 'Current', type: 'information' },
  'Looks partial': { label: 'Looks like part of the run', type: 'warning' },
  Rejected: { label: 'Rejected', type: 'critical' },
  'Superseded, not posted': { label: 'Replaced, not posted', type: 'announcement' },
  'Moved to a separate run': { label: 'Moved to a separate run', type: 'announcement' },
  // Sync log results
  Accepted: { label: 'Accepted', type: 'completed' },
  Duplicate: { label: 'Duplicate', type: 'information' },
  // Journals
  Reversal: { label: 'Reversal', type: 'announcement' },
  // Month headcount
  'No change': { label: 'No change', type: 'completed' },
  Expected: { label: 'Expected', type: 'completed' },
  Check: { label: 'Check', type: 'warning' },
  Changed: { label: 'Changed', type: 'warning' },
  'Missing send': { label: 'Not sent, past payday', type: 'critical' },
  'Not sent yet': { label: 'Not sent yet', type: 'announcement' },
  'No earlier run': { label: 'No earlier run', type: 'announcement' },
  // Payables
  Open: { label: 'Open', type: 'announcement' },
  'Partly paid': { label: 'Partly paid', type: 'warning' },
  Paid: { label: 'Paid', type: 'completed' },
  'Paid late': { label: 'Paid late', type: 'information' },
  Overdue: { label: 'Overdue', type: 'critical' },
  Overpaid: { label: 'Overpaid', type: 'warning' },
  // Settings
  Connected: { label: 'Connected', type: 'completed' },
  'Waiting for first send': { label: 'Waiting for first send', type: 'warning' },
  Ended: { label: 'Disconnected', type: 'announcement' },
  'Not connected': { label: 'Not connected', type: 'announcement' },
  'needs-account': { label: 'Needs account', type: 'critical' },
  'new-group': { label: 'New', type: 'critical' },
}

/** Label and colour for any payroll status. Unknown values keep their text, gray. */
export function statusBadge(s: string): { label: string; type: BadgeType } {
  return STATUS[s] ?? { label: s, type: 'announcement' }
}
export const statusLabel = (s: string) => statusBadge(s).label
export const statusType = (s: string): BadgeType => statusBadge(s).type

/** Run modes that never post, as a one-line label over their draft review. */
export function notPostedLabel(mode: string): string {
  if (mode === 'Before go-live' || mode === 'Dry run') return 'Before start month, not posted'
  return ''
}

/** Next step per status, in glossary words (the engine text may still use old terms). */
const NEXT_STEP: Record<string, string> = {
  'Confirm source': 'The Owner or an Ultimate + LM confirms this is your company.',
  'Waiting for your choice': 'Choose: use it as a new version, or make a separate run.',
  'Ready to post': 'Check the draft journal, then post it.',
  'Revision ready': 'Talenta sent this period again. Check what changed, then repost.',
  'Awaiting approval': 'Waiting for the approver in Inbox > Awaiting approval.',
  Reversed: 'Post the current version again.',
  'Dry run': 'Months before the start month are not posted.',
  'Before go-live': 'Months before the start month are not posted.',
  'Nothing to post': 'Nothing to do.',
  Received: 'Nothing to do.',
}
export const nextStepLabel = (status: string, engineText: string) => NEXT_STEP[status] ?? engineText

/** Pay item roles in plain words (the engine keeps its role names). */
const ROLE_LABEL: Record<string, string> = {
  Earning: 'Salary or allowance',
  'Employee deduction': 'Deduction from pay',
  'Employer contribution': 'Company contribution',
  Tax: 'Tax',
  Loan: 'Loan repayment',
  Reimbursement: 'Reimbursement',
  THR: 'THR (religious holiday bonus)',
  Severance: 'Severance',
  'Advance offset': 'Advance repaid',
}
export const roleLabel = (r: string | null | undefined) => (r ? ROLE_LABEL[r] ?? r : '')

/** Payslip sections as one word each, the same on every payroll screen. */
export const SECTION_LABEL: Record<string, string> = { allowance: 'Allowance', deduction: 'Deduction', benefit: 'Benefit', tax: 'Tax' }
export const sectionLabel = (s: string) => SECTION_LABEL[s] ?? s
