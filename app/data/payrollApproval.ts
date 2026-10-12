/**
 * Payroll journals through Jurnal's existing Approval workflows (Settings > Approval workflows,
 * transaction type "Payroll journal"). Post journal and Use vN and repost ask this module first:
 * when an active rule matches (amount above the threshold, created-by scope), the draft goes to
 * Inbox > Awaiting approval instead of posting ("Send for approval"), and an approver on the rule
 * uses Approve and post or Reject.
 *
 * People in payroll are the View as people (payrollMaster.ts); the rule stores users.ts ids,
 * so both sides are matched by name.
 */
import { checkTransactionApprovalRequired } from './approvalWorkflows'
import { findUserByName, getUserById } from './users'

export interface PayrollApprovalCheck {
  required: boolean
  ruleId: string | null
  ruleName: string | null
  /** Approver names from every level of the matched rule. */
  approvers: string[]
}

/** Does posting a payroll journal of `amount` by `actor` need approval? */
export function checkApprovalRequired(amount: number, actor: string): PayrollApprovalCheck {
  const createdBy = findUserByName(actor)?.id ?? null
  const r = checkTransactionApprovalRequired('payroll-journal', amount, createdBy)
  if (!r.approval_required) return { required: false, ruleId: null, ruleName: null, approvers: [] }
  const approvers = [...new Set(r.approval_levels.flatMap((l) => l.approver_ids).map((id) => getUserById(id)?.name).filter((n): n is string => !!n))]
  return { required: true, ruleId: r.rule_id, ruleName: r.rule_name, approvers }
}
