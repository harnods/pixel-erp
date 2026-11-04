import { reactive } from 'vue'

/**
 * Activity log (Other lists) — the company-wide audit trail
 * (Figma Other-Lists 4215-21752).
 *
 * Same shape the CRM already renders (`CrmActivityEntry` in crm.ts), contextualised
 * for the ERP: features are ERP modules, numbers use "<Feature> #NNNNN", and an
 * update detail reads old → new. A busy entry carries many detail lines; the page
 * shows the first 3 with a "+N more" toggle (rule/activity-log-structure).
 *
 * `recordLink` points at the module index, not a record: these numbers are the
 * Figma's, not ids from the real stores, so a per-record route would 404. Entries
 * for modules with no route at all (Journal entry, Product conversion) carry no
 * link and render as plain text rather than a dead one.
 */

export const ACTIVITY_ACTIONS = ['Create', 'Update', 'Delete', 'Send email', 'Recurring', 'Login'] as const
export type ActivityAction = typeof ACTIVITY_ACTIONS[number]

/** ERP modules that generate activity, in the order the Figma lists them. */
export const ACTIVITY_FEATURES = [
  'Sales invoice', 'Sales quote', 'Purchase invoice', 'Warehouse transfer',
  'Stock adjustment', 'Bank deposit', 'Bank withdrawal', 'Product conversion',
  'Journal entry', 'Product',
] as const

/** One detail line: a plain `text`, or a labelled `from → to` edit. */
export interface ActivityDetail { label?: string; from?: string; to?: string; text?: string }

export interface ActivityEntry {
  id: string
  /** ISO datetime — the column renders it with formatDateTime. */
  date: string
  /** Actor, or 'System' for anything the app did on its own. */
  user: string
  action: ActivityAction
  /** '' when the action isn't about a record (Login). */
  feature: string
  /** NUMBER column, e.g. 'Sales invoice #10129'. */
  recordLabel?: string
  /** Module index route, when one exists. */
  recordLink?: string
  details: ActivityDetail[]
}

const SEED: ActivityEntry[] = [
  { id: 'AL-0001', date: '2026-01-30T11:00:00', user: 'Rizal Candra', action: 'Create', feature: 'Sales invoice',
    recordLabel: 'Sales invoice #10129', recordLink: '/sales-invoices',
    details: [{ text: 'Draft created' }] },
  { id: 'AL-0002', date: '2026-01-30T11:00:00', user: 'Rizal Candra', action: 'Create', feature: 'Warehouse transfer',
    recordLabel: 'Warehouse transfer #22382', recordLink: '/warehouse-transfers',
    details: [{ label: 'Warehouse', from: 'Unassigned', to: 'Tanjung Priok Warehouse' }] },
  // The Figma's "+3 more" row. Six lines, so three show and the toggle reads
  // "+3 more" — the rule caps the visible lines at three, not at one.
  { id: 'AL-0003', date: '2026-01-30T11:00:00', user: 'Fajar Nugraha', action: 'Update', feature: 'Purchase invoice',
    recordLabel: 'Purchase invoice #48874', recordLink: '/purchase-invoices',
    details: [
      { label: 'Vendor', from: 'PT. Central Perk Indonesia', to: 'PT. Central Perk Food' },
      { label: 'Due date', from: '28/02/2026', to: '15/03/2026' },
      { label: 'Payment terms', from: 'Net 30', to: 'Net 45' },
      { label: 'Tags', from: 'Operational', to: 'Operational, Priority' },
      { label: 'Memo', from: '—', to: 'Revised after vendor merger' },
      { label: 'Total', from: 'Rp12.400.000', to: 'Rp13.100.000' },
    ] },
  { id: 'AL-0004', date: '2026-01-22T08:00:00', user: 'Rizal Candra', action: 'Update', feature: 'Stock adjustment',
    recordLabel: 'Stock adjustment #10112', recordLink: '/stock-adjustments',
    details: [{ label: 'Stock', from: '102 Pcs', to: '110 Pcs' }] },
  { id: 'AL-0005', date: '2026-01-19T13:30:00', user: 'Evelyn Belinda', action: 'Send email', feature: 'Sales quote',
    recordLabel: 'Sales quote #16554', recordLink: '/sales-quotes',
    details: [{ label: 'Sent to', text: 'joko@centralperk.com, rizalcandra@centralperk.com' }] },
  { id: 'AL-0006', date: '2026-01-15T13:30:00', user: 'System', action: 'Recurring', feature: 'Sales invoice',
    recordLabel: 'Sales invoice #22348', recordLink: '/sales-invoices',
    details: [{ text: '1 transaction created' }] },
  { id: 'AL-0007', date: '2026-01-12T16:45:00', user: 'Evelyn Belinda', action: 'Delete', feature: 'Bank withdrawal',
    recordLabel: 'Bank withdrawal #12212', recordLink: '/cash-management',
    details: [] },
  { id: 'AL-0008', date: '2026-01-12T16:45:00', user: 'Fajar Nugraha', action: 'Create', feature: 'Bank deposit',
    recordLabel: 'Bank deposit #73632', recordLink: '/cash-management',
    details: [{ label: 'Stock', from: '3 Pcs', to: '10 Pcs' }] },
  { id: 'AL-0009', date: '2026-01-05T17:15:00', user: 'Bunga Setianingsih', action: 'Create', feature: 'Product conversion',
    recordLabel: 'Product conversion #93022',
    details: [] },
  { id: 'AL-0010', date: '2026-01-01T09:15:00', user: 'Rizal Candra', action: 'Login', feature: '', details: [] },
  { id: 'AL-0011', date: '2026-01-01T10:00:00', user: 'Bunga Setianingsih', action: 'Update', feature: 'Journal entry',
    recordLabel: 'Journal entry #84222',
    details: [{ label: 'Account', from: '4002 Sales Revenue', to: '4003 Monthly Recurring Revenue' }] },
  { id: 'AL-0012', date: '2026-01-01T10:00:00', user: 'Bunga Setianingsih', action: 'Login', feature: '', details: [] },
  { id: 'AL-0013', date: '2026-01-01T10:00:00', user: 'Fajar Nugraha', action: 'Create', feature: 'Product',
    recordLabel: 'Coffee Table 01', recordLink: '/products',
    details: [] },
]

// Read-only: nothing in the app writes to the audit trail, so there is no
// snapshot to persist or restore.
export const activityLog = reactive<ActivityEntry[]>([...SEED])

/** The Feature filter's options — every feature present in the log. */
export function activityFeatures(): string[] {
  return [...new Set(activityLog.map(e => e.feature).filter(Boolean))]
}

/** The All-filters drawer's User options. */
export function activityUsers(): string[] {
  return [...new Set(activityLog.map(e => e.user))].sort()
}
