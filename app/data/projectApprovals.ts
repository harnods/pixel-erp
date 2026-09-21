import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'

/**
 * One Approvals inbox for five request kinds (PRD §9): change order ·
 * transaction overage · budget revision · engineering change · stock release.
 * PM raises (and overrides within threshold); Finance/Controller approves.
 * The raiser can never approve their own request.
 */

export type ApprovalKind = 'change_order' | 'overage' | 'budget_revision' | 'eco' | 'stock_release'

export const APPROVAL_KIND_LABELS: Record<ApprovalKind, string> = {
  change_order: 'Change order',
  overage: 'Transaction overage',
  budget_revision: 'Budget revision',
  eco: 'Engineering change',
  stock_release: 'Stock release',
}

export interface ApprovalItem {
  id: string
  kind: ApprovalKind
  projectId: string
  /** id of the referenced record (VO, ECO, held document, release request, budget request) */
  refId: string
  refNo: string
  title: string
  requestedBy: string
  requestedAt: string
  /** overage: requested amount / available at the tightest node */
  requested?: number
  available?: number
  overPct?: number
  amount?: number
  reason?: string
  status: 'pending' | 'approved' | 'rejected'
  decidedBy?: string
  decidedAt?: string
  decisionNote?: string
  /** budget_revision raised from Budget setup: the full proposed baseline, applied on approval */
  payload?: { lines: { wpId: string; account: string; amount: number }[]; reserves: Record<string, number>; revenue: number }
}

const SEED: ApprovalItem[] = [
  { id: 'ap-1', kind: 'overage', projectId: 'ps-2603', refId: 'doc-po-0602', refNo: 'PO/2026/0602', title: 'Unit AC split duct 6 PK × 8 — Tata udara (HVAC)', requestedBy: 'Rizal Candra', requestedAt: '2026-06-25', requested: 58_000_000, available: -1_500_000, overPct: 198.3, reason: 'AC units were in the RAB but procured outside the RAP. Customer is paying for them under the contract — margin is on the revenue side.', status: 'pending' },
  { id: 'ap-2', kind: 'change_order', projectId: 'ps-2603', refId: 'vo-2', refNo: 'VO-2603-02', title: 'Ganti HPL ke motif kayu jati', requestedBy: 'Rizal Candra', requestedAt: '2026-06-16', amount: 18_500_000, reason: 'Customer requested finish change after mock-up review.', status: 'pending' },
  { id: 'ap-3', kind: 'eco', projectId: 'ps-2603', refId: 'eco-1', refNo: 'ECO-2603-01', title: 'HPL motif jati + edging 1 mm — Furnitur ruang kuliah', requestedBy: 'Rizal Candra', requestedAt: '2026-06-16', reason: 'Follows VO-2603-02 (finish change).', status: 'pending' },
  { id: 'ap-4', kind: 'stock_release', projectId: 'ps-2606', refId: 'rr-1', refNo: 'RR-0001', title: '10 lembar HPL motif walnut — PS-2606 → PS-2603', requestedBy: 'Rizal Candra', requestedAt: '2026-06-25', reason: 'WO-PS-0002 starts Monday; HPL delivery from vendor slipped 2 weeks.', status: 'pending' },
  { id: 'ap-5', kind: 'budget_revision', projectId: 'ps-2606', refId: 'brq-1', refNo: 'BR-2606-01', title: 'Move Rp6.000.000 from Produksi reserve to 2.1 Subcontractor', requestedBy: 'Andi Pratama', requestedAt: '2026-06-24', amount: 6_000_000, reason: 'Tower B requires extra installers for the 18th-floor units (no service lift).', status: 'pending' },
  { id: 'ap-6', kind: 'change_order', projectId: 'ps-2606', refId: 'vo-4', refNo: 'VO-2606-01', title: 'Top table solid surface (tipe A)', requestedBy: 'Andi Pratama', requestedAt: '2026-06-10', amount: 9_800_000, status: 'approved', decidedBy: 'Maya Kartika', decidedAt: '2026-06-12' },
]

const KEY = 'pm-approvals'
export const approvals = reactive<ApprovalItem[]>(loadSnapshot<ApprovalItem>(KEY) ?? structuredClone(SEED))
export function persistApprovals(): void { saveSnapshot(KEY, approvals) }

export function addApproval(item: Omit<ApprovalItem, 'id' | 'status'>): ApprovalItem {
  const a: ApprovalItem = { ...item, id: `ap-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, status: 'pending' }
  approvals.unshift(a)
  persistApprovals()
  return a
}

export function pendingApprovals(projectId?: string) {
  return approvals.filter(a => a.status === 'pending' && (!projectId || a.projectId === projectId))
}
