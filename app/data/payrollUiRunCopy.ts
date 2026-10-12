/**
 * UI copy for the payroll inbox and run page: plain labels for engine values that the
 * engine still names in its own words (run modes, statuses, pay item roles). Display only;
 * the engine values, filters and tests keep the original strings.
 */

/** Run statuses as the inbox and run page show them. */
const STATUS_LABEL: Record<string, string> = {
  'Revision ready': 'New version',
  'Dry run': 'No start month',
  'Before go-live': 'Before start month',
  'Waiting for your choice': 'Choose how to use it',
  'Confirm source': 'Confirm the source',
  Received: 'Received',
}
export const statusLabel = (s: string) => STATUS_LABEL[s] ?? s

/** Run modes that never post, as a one-line label over their draft review. */
export function notPostedLabel(mode: string): string {
  if (mode === 'Before go-live') return 'Before start month, not posted'
  if (mode === 'Dry run') return 'No start month set yet, not posted'
  return ''
}

/** Next step per status where the engine text uses old terms. */
const NEXT_STEP: Record<string, string> = {
  'Dry run': 'Set the start month in Payroll settings to start posting.',
  'Before go-live': 'Months before the start month are not posted.',
  'Waiting for your choice': 'Choose: same run again, or a separate run.',
  'Revision ready': 'Talenta sent this period again. Review it and repost.',
  'Awaiting approval': 'Waiting for the approver.',
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
  THR: 'THR (holiday bonus)',
  Severance: 'Severance',
  'Advance offset': 'Advance repaid',
}
export const roleLabel = (r: string | null | undefined) => (r ? ROLE_LABEL[r] ?? r : '')
