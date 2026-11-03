/**
 * Status → badge intent for the Projects module, rendered through ErpStatusBadge
 * (rule/badge-single-mpbadge — the sanctioned mapper, not a second badge). Each entry
 * is { type, label } where label is the English copy key passed through t().
 */
export type BadgeType = 'completed' | 'announcement' | 'information' | 'warning' | 'critical'
export interface BadgeSpec { type: BadgeType; label: string }

const MAP: Record<string, BadgeSpec> = {
  // project
  'project:draft': { type: 'announcement', label: 'Draft' },
  'project:active': { type: 'completed', label: 'Active' },
  'project:closed': { type: 'information', label: 'Closed' },
  // work package
  'wp:not_started': { type: 'announcement', label: 'Not started' },
  'wp:in_progress': { type: 'warning', label: 'In progress' },
  'wp:technically_complete': { type: 'completed', label: 'Technically complete' },
  // project work order
  'wo:Draft': { type: 'announcement', label: 'Draft' },
  'wo:Released': { type: 'information', label: 'Released' },
  'wo:In progress': { type: 'warning', label: 'In progress' },
  'wo:Completed': { type: 'completed', label: 'Completed' },
  // change order
  'vo:requested': { type: 'announcement', label: 'Requested' },
  'vo:priced': { type: 'announcement', label: 'Priced' },
  'vo:raised': { type: 'warning', label: 'Awaiting Finance' },
  'vo:approved': { type: 'completed', label: 'Approved' },
  'vo:rejected': { type: 'critical', label: 'Rejected' },
  // engineering change
  'eco:draft': { type: 'announcement', label: 'Draft' },
  'eco:pending': { type: 'warning', label: 'Awaiting approval' },
  'eco:approved': { type: 'completed', label: 'Approved' },
  'eco:rejected': { type: 'critical', label: 'Rejected' },
  // approval request
  'approval:pending': { type: 'warning', label: 'Pending' },
  'approval:approved': { type: 'completed', label: 'Approved' },
  'approval:rejected': { type: 'critical', label: 'Rejected' },
  // reservation
  'res:reserved': { type: 'information', label: 'Reserved' },
  'res:picked': { type: 'warning', label: 'Picked' },
  'res:issued': { type: 'completed', label: 'Issued' },
  'res:released': { type: 'announcement', label: 'Released' },
  // pegged document
  'doc:posted': { type: 'completed', label: 'Posted to project' },
  'doc:held': { type: 'warning', label: 'Held for Finance' },
  'doc:ordinary': { type: 'announcement', label: 'Ordinary expense' },
  'doc:rejected': { type: 'critical', label: 'Rejected' },
  'doc:draft': { type: 'information', label: 'Draft' },
  // invoice / cost line / punch item
  'invoice:paid': { type: 'completed', label: 'Paid' },
  'invoice:unpaid': { type: 'warning', label: 'Unpaid' },
  'cost:actual': { type: 'completed', label: 'Actual' },
  'cost:committed': { type: 'information', label: 'Committed' },
  'punch:open': { type: 'warning', label: 'Open' },
  'punch:closed': { type: 'completed', label: 'Closed' },
  // misc flags
  'flag:verified': { type: 'completed', label: 'Verified' },
  'flag:unbudgeted': { type: 'warning', label: 'Unbudgeted' },
  'flag:over-budget': { type: 'critical', label: 'Over budget' },
  'flag:exposure': { type: 'warning', label: 'CO exposure' },
  'flag:pending': { type: 'information', label: 'pending' },
  'flag:contention': { type: 'critical', label: 'Contention' },
  'flag:executed': { type: 'critical', label: 'Executed — not signed off' },
  'flag:catch-up': { type: 'warning', label: 'Catch-up' },
  'flag:master-changed': { type: 'information', label: 'Master changed' },
  'flag:current': { type: 'completed', label: 'Current' },
  'flag:trigger-met': { type: 'completed', label: 'Trigger met' },
  'flag:not-set': { type: 'warning', label: 'Not set' },
  'flag:approved-baseline': { type: 'completed', label: 'Approved baseline' },
  'priority:high': { type: 'critical', label: 'High' },
  'priority:medium': { type: 'warning', label: 'Medium' },
  'priority:low': { type: 'announcement', label: 'Low' },
  'kind:change_order': { type: 'information', label: 'Change order' },
  'kind:overage': { type: 'critical', label: 'Transaction overage' },
  'kind:budget_revision': { type: 'warning', label: 'Budget revision' },
  'kind:eco': { type: 'information', label: 'Engineering change' },
  'kind:stock_release': { type: 'announcement', label: 'Stock release' },
}

export function badge(domain: string, status: string): BadgeSpec {
  return MAP[`${domain}:${status}`] ?? { type: 'announcement', label: status }
}

/** Props for <ErpStatusBadge v-bind="badgeProps('wp', wp.status, t)" /> — label translated. */
export function badgeProps(domain: string, status: string, t: (s: string) => string) {
  const b = badge(domain, status)
  return { status, type: b.type, label: t(b.label) }
}
