/**
 * UI copy for the payroll screens: plain labels for engine values the engine still names in its
 * own words (run statuses, version states, sync results, pay item roles), and ONE status badge
 * map so a status reads the same word and the same colour on every payroll screen.
 * Display only; the engine values, filters and tests keep the original strings.
 */

export type BadgeType = 'completed' | 'announcement' | 'information' | 'warning' | 'critical'

/**
 * Status -> label and colour. One meaning per colour across payroll:
 *   critical (red)      stops posting or money is late: Held, Rejected, Overdue, Needs account
 *   warning (yellow)    waits on a person: Sent again, Choose, Partly paid,
 *                       a New group (posts to the Everyone else account until set up), No group
 *   information (blue)  ready for the next step: Ready to post, Current, Duplicate
 *   completed (green)   done: Posted, Paid, Accepted, Connected, No change, Expected
 *   announcement (gray) nothing to do here: Superseded, Open
 */
const STATUS: Record<string, { label: string; type: BadgeType }> = {
  // Run statuses
  Held: { label: 'Held', type: 'critical' },
  'Confirm source': { label: 'Confirm company', type: 'warning' },
  'Waiting for your choice': { label: 'Choose how to use it', type: 'warning' },
  'Revision ready': { label: 'Sent again', type: 'warning' },
  'Ready to post': { label: 'Ready to post', type: 'information' },
  Posted: { label: 'Posted', type: 'completed' },
  Reversed: { label: 'Reversed, not reposted', type: 'critical' },
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
  // A group nobody set up no longer holds the run: its cost posts to the Everyone else account, so it waits
  // on the Accountant (yellow), not red. 'no-group' is the run warning for those staff.
  'new-group': { label: 'New', type: 'warning' },
  'no-group': { label: 'No group', type: 'warning' },
}

/** Label and colour for any payroll status. Unknown values keep their text, gray. */
export function statusBadge(s: string): { label: string; type: BadgeType } {
  return STATUS[s] ?? { label: s, type: 'announcement' }
}
export const statusLabel = (s: string) => statusBadge(s).label
export const statusType = (s: string): BadgeType => statusBadge(s).type


/** Next step per status, in glossary words (the engine text may still use old terms). */
const NEXT_STEP: Record<string, string> = {
  'Confirm source': 'The Owner or a user with LM confirms this is your company.',
  'Waiting for your choice': 'Choose: use it as a new version, or make a separate run.',
  'Ready to post': 'Check the draft journal, then post it.',
  'Revision ready': 'Talenta sent this period again. Check what changed, then repost.',
  Reversed: 'Post the current version again.',
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
