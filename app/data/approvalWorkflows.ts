/**
 * Approval workflows — configurable rules that decide which transactions need
 * approval, from whom, and in how many stages. Settings > Approval workflows
 * (see CreateApprovalWorkflowPage.vue / ApprovalWorkflowsPage.vue). This is the
 * mock DB for that feature; SEED rules illustrate a few real modules already
 * wired for approval elsewhere in the app (bills, sales invoices, warehouse
 * transfers) but nothing here drives their actual approval logic — it's just
 * the rule configuration surface.
 */
import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import { users } from './users'

export type ApprovalTransactionType =
  | 'sales-invoice' | 'sales-order' | 'purchase-order' | 'purchase-invoice'
  | 'bill' | 'stock-adjustment' | 'warehouse-transfer'

export const TRANSACTION_TYPE_OPTIONS: { value: ApprovalTransactionType; label: string }[] = [
  { value: 'sales-invoice',     label: 'Sales invoice' },
  { value: 'sales-order',       label: 'Sales order' },
  { value: 'purchase-order',    label: 'Purchase order' },
  { value: 'purchase-invoice',  label: 'Purchase invoice' },
  { value: 'bill',              label: 'Bill' },
  { value: 'stock-adjustment',  label: 'Stock adjustment' },
  { value: 'warehouse-transfer', label: 'Warehouse transfer' },
]

export function transactionTypeLabel(type: string): string {
  return TRANSACTION_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type
}

/** What a rule's conditions are evaluated against — a transaction document, or a project action. */
export type ApprovalAppliesTo = 'transaction' | 'project'

/**
 * Exactly 3 gateable Project Accounting actions — Milestone Reversal, Write-off, T&M/Input
 * Billing Run, and Credit Note are deliberately excluded from approval gating (see spec
 * "Out of scope"): reversal/write-off resolve existing exposure rather than creating new
 * exposure, and billing run/credit note inherit whatever Transaction Type rule already
 * exists for their native Sales Invoice / Credit Note record. Never add them here.
 */
export type ProjectAction = 'project-creation' | 'variation-order' | 'milestone-verification'

export const PROJECT_ACTION_OPTIONS: { value: ProjectAction; label: string }[] = [
  { value: 'project-creation',       label: 'Project creation' },
  { value: 'variation-order',        label: 'Variation order' },
  { value: 'milestone-verification', label: 'Milestone verification' },
]

export function projectActionLabel(action: string): string {
  return PROJECT_ACTION_OPTIONS.find((o) => o.value === action)?.label ?? action
}

/** action_type string used by check_approval_required — the wire-format identifier consuming
 *  modules (Project Creation / Variation Order / Milestone Verification flows) call with. */
export type ProjectActionType = 'project.creation' | 'project.variation_order' | 'project.milestone_verification'

const PROJECT_ACTION_TYPE_MAP: Record<ProjectActionType, ProjectAction> = {
  'project.creation': 'project-creation',
  'project.variation_order': 'variation-order',
  'project.milestone_verification': 'milestone-verification',
}

/** Per-action field visibility (spec §3) — amount condition presence + label, and whether the
 *  rule can be scoped to specific projects. Milestone verification never has an amount
 *  condition; project creation never has a project scope (the project doesn't exist yet at
 *  submission time). */
export function amountFieldVisible(appliesTo: ApprovalAppliesTo, projectAction: ProjectAction | ''): boolean {
  if (appliesTo === 'transaction') return true
  return projectAction === 'project-creation' || projectAction === 'variation-order'
}

export function amountFieldLabel(appliesTo: ApprovalAppliesTo, projectAction: ProjectAction | ''): string {
  if (appliesTo === 'transaction') return 'Amount higher than'
  if (projectAction === 'project-creation') return 'Contract value higher than'
  if (projectAction === 'variation-order') return 'Variation delta higher than'
  return ''
}

export function projectScopeFieldVisible(appliesTo: ApprovalAppliesTo, projectAction: ProjectAction | ''): boolean {
  // Transaction-type rules can also be scoped to specific projects (e.g. a Purchase order
  // rule that only gates POs billed to certain projects). Project Action rules show it for
  // variation-order and milestone-verification only — project-creation has no project yet.
  if (appliesTo === 'transaction') return true
  return projectAction === 'variation-order' || projectAction === 'milestone-verification'
}

/** Lightweight project directory backing the "Some projects" picker — this prototype has no
 *  Projects module yet, so this is standalone mock data (not shared with any other feature). */
export interface Project {
  id: string
  name: string
}

export const projects: Project[] = [
  { id: 'proj-1', name: 'Menara Sudirman Renovation' },
  { id: 'proj-2', name: 'Gudang Bekasi Expansion' },
  { id: 'proj-3', name: 'ERP Rollout Phase 2' },
  { id: 'proj-4', name: 'Cikarang Plant Retrofit' },
  { id: 'proj-5', name: 'Jakarta HQ Fit-out' },
]

export function getProjectById(id: string): Project | undefined {
  return projects.find((p) => p.id === id)
}

export function findProjectByName(name: string): Project | undefined {
  return projects.find((p) => p.name === name)
}

export interface ApprovalWorkflowLevel {
  id: string
  /** "Any" = one approver in this level is enough; "All" = every approver must approve. */
  matchType: 'any' | 'all'
  approverIds: string[]
}

export interface ApprovalWorkflowRule {
  id: string
  name: string
  description?: string
  appliesTo: ApprovalAppliesTo
  /** Meaningful when appliesTo === 'transaction'. */
  transactionType: ApprovalTransactionType | ''
  /** Meaningful when appliesTo === 'project'. */
  projectAction: ProjectAction | ''
  /** Meaningful when projectScopeFieldVisible(appliesTo, projectAction) — shown for the
   *  Transaction path and for variation-order/milestone-verification; project-creation has no
   *  project to scope to yet. */
  projectScope: 'all' | 'some'
  /** Meaningful when projectScopeFieldVisible(...) && projectScope === 'some'. */
  projectIds: string[]
  /** Amount/contract-value/variation-delta threshold, in IDR — label and presence depend on
   *  appliesTo + projectAction, see amountFieldLabel/amountFieldVisible. null only when the
   *  action has no amount condition (milestone-verification). 0 = applies regardless of amount. */
  minAmount: number | null
  /** Never shown for Project Action rules (appliesTo === 'project') — omitted from that form
   *  entirely, not shown-disabled. Stays at its default ('all' / []) for those rules. */
  createdByScope: 'all' | 'some'
  createdByUserIds: string[]
  levels: ApprovalWorkflowLevel[]
  applyToDraft: boolean
  isActive: boolean
  updatedAt: string
  updatedBy: string
}

const ACTING_USER = 'Rizal Candra'

function idOf(name: string): string {
  return users.find((u) => u.name === name)?.id ?? ''
}

function projIdOf(name: string): string {
  return projects.find((p) => p.name === name)?.id ?? ''
}

const SEED_APPROVAL_WORKFLOWS: ApprovalWorkflowRule[] = [
  {
    id: 'awf-001',
    name: 'Sales Invoice Rule 001',
    description: 'Requires manager approval for large sales invoices',
    appliesTo: 'transaction',
    transactionType: 'sales-invoice',
    projectAction: '',
    projectScope: 'all',
    projectIds: [],
    minAmount: 5_000_000,
    createdByScope: 'all',
    createdByUserIds: [],
    levels: [
      { id: 'lvl-1', matchType: 'any', approverIds: [idOf('Rizal Candra')].filter(Boolean) },
    ],
    applyToDraft: true,
    isActive: true,
    updatedAt: '2026-07-02T10:15:00',
    updatedBy: 'Rizal Candra',
  },
  {
    id: 'awf-002',
    name: 'Bill Rule 001',
    description: 'Two-level approval for large bills',
    appliesTo: 'transaction',
    transactionType: 'bill',
    projectAction: '',
    projectScope: 'all',
    projectIds: [],
    minAmount: 10_000_000,
    createdByScope: 'all',
    createdByUserIds: [],
    levels: [
      { id: 'lvl-1', matchType: 'any', approverIds: [idOf('Budi Santoso')].filter(Boolean) },
      { id: 'lvl-2', matchType: 'all', approverIds: [idOf('Rizal Candra')].filter(Boolean) },
    ],
    applyToDraft: true,
    isActive: true,
    updatedAt: '2026-06-20T09:00:00',
    updatedBy: 'Rizal Candra',
  },
  {
    id: 'awf-003',
    name: 'Warehouse Transfer Rule 001',
    appliesTo: 'transaction',
    transactionType: 'warehouse-transfer',
    projectAction: '',
    projectScope: 'all',
    projectIds: [],
    minAmount: 0,
    createdByScope: 'some',
    createdByUserIds: [idOf('Dewi Rahayu')].filter(Boolean),
    levels: [
      { id: 'lvl-1', matchType: 'any', approverIds: [idOf('Sari Indah')].filter(Boolean) },
    ],
    applyToDraft: false,
    isActive: false,
    updatedAt: '2026-05-11T14:20:00',
    updatedBy: 'Rizal Candra',
  },
  {
    id: 'awf-004',
    name: 'Milestone Verification Rule 001',
    description: 'Requires PM sign-off before a milestone is marked verified',
    appliesTo: 'project',
    transactionType: '',
    projectAction: 'milestone-verification',
    projectScope: 'some',
    projectIds: [projIdOf('Menara Sudirman Renovation'), projIdOf('Gudang Bekasi Expansion')].filter(Boolean),
    minAmount: null,
    createdByScope: 'all',
    createdByUserIds: [],
    levels: [
      { id: 'lvl-1', matchType: 'any', approverIds: [idOf('Rizal Candra')].filter(Boolean) },
    ],
    applyToDraft: true,
    isActive: true,
    updatedAt: '2026-08-01T08:30:00',
    updatedBy: 'Rizal Candra',
  },
  {
    id: 'awf-005',
    name: 'Project Creation Rule 001',
    description: 'Large contracts require director approval before a project is created',
    appliesTo: 'project',
    transactionType: '',
    projectAction: 'project-creation',
    projectScope: 'all',
    projectIds: [],
    minAmount: 500_000_000,
    createdByScope: 'all',
    createdByUserIds: [],
    levels: [
      { id: 'lvl-1', matchType: 'all', approverIds: [idOf('Rizal Candra'), idOf('Budi Santoso')].filter(Boolean) },
    ],
    applyToDraft: true,
    isActive: true,
    updatedAt: '2026-08-10T11:00:00',
    updatedBy: 'Rizal Candra',
  },
  {
    id: 'awf-006',
    name: 'Variation Order Rule 001',
    description: 'Variation orders that grow scope beyond the original contract need sign-off',
    appliesTo: 'project',
    transactionType: '',
    projectAction: 'variation-order',
    projectScope: 'all',
    projectIds: [],
    minAmount: 25_000_000,
    createdByScope: 'all',
    createdByUserIds: [],
    levels: [
      { id: 'lvl-1', matchType: 'any', approverIds: [idOf('Rizal Candra')].filter(Boolean) },
    ],
    applyToDraft: true,
    isActive: true,
    updatedAt: '2026-08-05T13:45:00',
    updatedBy: 'Rizal Candra',
  },
]

const APPROVAL_WORKFLOWS_KEY = 'approval-workflows-v3'
const snapshot = loadSnapshot<ApprovalWorkflowRule>(APPROVAL_WORKFLOWS_KEY)
export const approvalWorkflows = reactive<ApprovalWorkflowRule[]>(snapshot ?? [...SEED_APPROVAL_WORKFLOWS])

function persist(): void {
  saveSnapshot(APPROVAL_WORKFLOWS_KEY, approvalWorkflows)
}

let seq = approvalWorkflows.filter((r) => r.id.startsWith('awf-new-')).length

export function getApprovalWorkflowById(id: string): ApprovalWorkflowRule | undefined {
  return approvalWorkflows.find((r) => r.id === id)
}

export interface ApprovalWorkflowInput {
  name: string
  description?: string
  appliesTo: ApprovalAppliesTo
  transactionType: ApprovalTransactionType | ''
  projectAction: ProjectAction | ''
  projectScope: 'all' | 'some'
  projectIds: string[]
  minAmount: number | null
  createdByScope: 'all' | 'some'
  createdByUserIds: string[]
  levels: { matchType: 'any' | 'all'; approverIds: string[] }[]
  applyToDraft: boolean
}

function toLevels(levels: ApprovalWorkflowInput['levels']): ApprovalWorkflowLevel[] {
  return levels.map((l, i) => ({ id: `lvl-${i + 1}`, matchType: l.matchType, approverIds: l.approverIds }))
}

/** Create a workflow from the New approval workflow form — persists + shows in the list. */
export function addApprovalWorkflow(data: ApprovalWorkflowInput): ApprovalWorkflowRule {
  const n = seq++
  const rule: ApprovalWorkflowRule = {
    id: `awf-new-${n}`,
    name: data.name,
    description: data.description?.trim() || undefined,
    appliesTo: data.appliesTo,
    transactionType: data.transactionType,
    projectAction: data.projectAction,
    projectScope: data.projectScope,
    projectIds: data.projectIds,
    minAmount: data.minAmount,
    createdByScope: data.createdByScope,
    createdByUserIds: data.createdByUserIds,
    levels: toLevels(data.levels),
    applyToDraft: data.applyToDraft,
    isActive: true,
    updatedAt: new Date().toISOString(),
    updatedBy: ACTING_USER,
  }
  approvalWorkflows.unshift(rule)
  persist()
  return rule
}

/** Update an existing workflow from the Edit approval workflow form — persists the change. */
export function updateApprovalWorkflow(id: string, data: ApprovalWorkflowInput): ApprovalWorkflowRule | undefined {
  const rule = approvalWorkflows.find((r) => r.id === id)
  if (!rule) return undefined
  rule.name = data.name
  rule.description = data.description?.trim() || undefined
  rule.appliesTo = data.appliesTo
  rule.transactionType = data.transactionType
  rule.projectAction = data.projectAction
  rule.projectScope = data.projectScope
  rule.projectIds = data.projectIds
  rule.minAmount = data.minAmount
  rule.createdByScope = data.createdByScope
  rule.createdByUserIds = data.createdByUserIds
  rule.levels = toLevels(data.levels)
  rule.applyToDraft = data.applyToDraft
  rule.updatedAt = new Date().toISOString()
  rule.updatedBy = ACTING_USER
  persist()
  return rule
}

export function setApprovalWorkflowActive(id: string, isActive: boolean): void {
  const rule = approvalWorkflows.find((r) => r.id === id)
  if (!rule) return
  rule.isActive = isActive
  rule.updatedAt = new Date().toISOString()
  rule.updatedBy = ACTING_USER
  persist()
}

export function deleteApprovalWorkflow(id: string): void {
  const idx = approvalWorkflows.findIndex((r) => r.id === id)
  if (idx === -1) return
  approvalWorkflows.splice(idx, 1)
  persist()
}

// ─────────────────────────────────────────────────────────────────────────────
// check_approval_required — the interface contract Project Creation, Variation
// Order, and Milestone Verification flows call before executing their gated
// action (spec §5). Names/shape follow the spec verbatim rather than this
// file's usual camelCase so callers can match the contract directly.
//
// NOTE: this prototype has no Project Creation / Variation Order / Milestone
// Verification modules yet (no Projects feature exists in this app), so
// nothing calls this today — it exists to be correct and ready for those
// modules once built. `status` here reflects only "would a rule gate this
// action" (no_rule | pending); a real implementation would also need to look
// up an in-flight submission's actual status to report "approved".
// ─────────────────────────────────────────────────────────────────────────────

export interface ApprovalLevelResult {
  level: number
  requires: 'any' | 'all'
  approver_ids: string[]
}

export interface CheckApprovalRequiredResult {
  approval_required: boolean
  rule_id: string | null
  approval_levels: ApprovalLevelResult[]
  status: 'no_rule' | 'pending' | 'approved'
}

/**
 * Rule matching: action_type must match; if the matched action has an amount condition,
 * `amount` must strictly exceed the configured threshold; if the rule is scoped to "Some
 * projects", `project_id` must be in that list. Only active rules are considered. The first
 * matching rule wins — configuring more than one active rule for the same action/scope is a
 * configuration error the UI doesn't currently prevent.
 */
export function check_approval_required(
  action_type: ProjectActionType,
  amount: number | null,
  project_id: string | null,
): CheckApprovalRequiredResult {
  const projectAction = PROJECT_ACTION_TYPE_MAP[action_type]
  const rule = approvalWorkflows.find((r) => {
    if (!r.isActive || r.appliesTo !== 'project' || r.projectAction !== projectAction) return false
    if (r.minAmount != null) {
      if (amount == null || !(amount > r.minAmount)) return false
    }
    if (r.projectScope === 'some' && !(project_id && r.projectIds.includes(project_id))) return false
    return true
  })

  if (!rule) {
    return { approval_required: false, rule_id: null, approval_levels: [], status: 'no_rule' }
  }
  return {
    approval_required: true,
    rule_id: rule.id,
    approval_levels: rule.levels.map((l, i) => ({ level: i + 1, requires: l.matchType, approver_ids: l.approverIds })),
    status: 'pending',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Decision notification (spec §6) — once an approval chain fully clears or any
// level rejects, the service reports the outcome back to the calling module.
// It carries no business logic about what "approved" means downstream (activate
// project / revise budget / verify milestone) — that's the calling module's
// job. Implemented as a minimal pub/sub since this prototype has no real
// message bus; a module would call onApprovalDecision(...) once to subscribe.
// ─────────────────────────────────────────────────────────────────────────────

export interface ApprovalDecision {
  action_type: ProjectActionType
  entity_id: string
  decision: 'approved' | 'rejected'
  /** Present on rejection only — the rejecting approver's required note. */
  note?: string
}

type ApprovalDecisionListener = (decision: ApprovalDecision) => void

const decisionListeners: ApprovalDecisionListener[] = []

export function onApprovalDecision(listener: ApprovalDecisionListener): () => void {
  decisionListeners.push(listener)
  return () => {
    const idx = decisionListeners.indexOf(listener)
    if (idx !== -1) decisionListeners.splice(idx, 1)
  }
}

export function emitApprovalDecision(decision: ApprovalDecision): void {
  decisionListeners.forEach((listener) => listener(decision))
}
