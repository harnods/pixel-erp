import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import { approvalWorkflows, check_approval_required, syncApprovalProjects, type ProjectActionType } from './approvalWorkflows'
import { users } from './users'

/**
 * Project accounting — projects that earn revenue over time (typed `Engagement` in code).
 *
 * Ported from the "Project Accounting" Claude Design prototype. The whole module
 * hangs off one idea: an engagement declares HOW it earns, and that choice picks
 * the recognition engine used for the rest of its life.
 *
 *   tm     — Cost plus margin. Revenue = allowed cost × (1 + agreed margin).
 *            No percentage of progress; the client reimburses cost and pays a margin.
 *            (What accountants call cost-plus.) Consulting, audit, retainers.
 *   input  — Percentage of completion. Progress = cost spent ÷ cost planned; revenue = that
 *            percentage × contract value. Billing runs on its own schedule, and the
 *            gap is reported as unbilled revenue or billed in advance.
 *   output — Milestones. Revenue arrives only when a weighted milestone is
 *            physically verified. Verifying earns AND queues its invoice.
 *
 * Two rules drive most of the surprising behaviour here:
 *
 *   1. The contract is FROZEN at creation. It is never edited in place — a revised
 *      value is an append-only, dated addendum. When a Settings › Approval workflows
 *      rule matches, an approver other than the submitter decides it; otherwise it
 *      applies at once. Rejected addenda stay on the list on purpose.
 *   2. Whether added scope is DISTINCT (PSAK 72) — not how the project earns —
 *      decides whether revenue already recognized is trued up. The system cannot
 *      infer it; someone has to say which it is. See approveAddendum().
 *
 * Money is a plain number of rupiah; pages format with Intl.NumberFormat('id-ID', …)
 * per DESIGN.md → Number format (IDR). Hours are analytical only — they never enter
 * an amount, they only explain one.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type RecognitionMethod = 'tm' | 'input' | 'output'

/** Stage doubles as the detail page's tab key. */
export type EngagementStage = 'setup' | 'execution' | 'recognition' | 'billing' | 'closed'

/**
 * What the client is charged for a cost line. `null` = not yet reviewed, which is
 * cost incurred but NOT yet revenue.
 *   bill   — cost + the agreed margin
 *   atcost — margin waived, cost only          (needs a reason)
 *   absorb — not charged to the client at all  (needs a reason)
 */
export type CostDecision = 'bill' | 'atcost' | 'absorb' | null

export type CostSource = 'Expense' | 'Purchase' | 'Sales'

export interface CostEntry {
  id: string
  category: string
  description: string
  vendor: string
  /** ISO yyyy-mm-dd */
  date: string
  amount: number
  markupPct: number
  src: CostSource
  docNo: string
  decision: CostDecision
  invoiced: boolean
  /** Optional, analytical only — never part of the amount. */
  hours: number | null
}

export interface Milestone {
  /** Set when verified: date, who verified, supporting document. */
  verifiedAt?: string | null
  verifiedBy?: string | null
  document?: string | null
  id: string
  label: string
  pct: number
  verified: boolean
  invId: string | null
  /** Frozen at verification, so a later addendum never restates it. */
  recognized: number
}

export type BillingStatus = 'notdue' | 'invoiced' | 'paid'

export interface BillingMilestone {
  id: string
  label: string
  pct: number
  status: BillingStatus
  invId: string | null
  paidDate: string | null
}

export interface ProjectInvoice {
  id: string
  label: string
  amount: number
  date: string
  status: 'unpaid' | 'paid'
  paidDate: string | null
}

export type AddendumStatus = 'Pending' | 'Approved' | 'Rejected'

export interface Addendum {
  /** Set on rejection: who rejected and the required reason. */
  rejectedBy?: string | null
  rejectReason?: string | null
  id: string
  date: string
  reason: string
  oldValue: number
  newValue: number
  status: AddendumStatus
  /** PSAK 72: distinct scope is prospective; not-distinct is a cumulative catch-up. */
  distinct: boolean
  raisedBy: string
  approvedBy: string | null
  /** Catch-up recognised in the current period at approval. */
  adjustment: number
}

export interface BudgetLine {
  id: string
  account: string
  amount: number
}

export interface BudgetLines {
  revenue: BudgetLine[]
  cost: BudgetLine[]
}

export interface Engagement {
  id: string
  name: string
  client: string
  pm: string
  method: RecognitionMethod
  markupPct: number
  stage: EngagementStage
  /** tm only — the estimated fee. Non-tm engagements keep 0 here. */
  feeEstimate: number
  /** input / output only. tm engagements keep 0 here. */
  contractValue: number
  /** null = never set at Setup, so cost variance cannot be computed. */
  budget: number | null
  /**
   * The budget line (budgetStore) this engagement draws against, picked at
   * Setup. null = none linked; the `budget` figure then stands on its own.
   */
  budgetLineId: string | null
  budgetLines: BudgetLines | null
  /** Assigned team members, by name. The PM is held separately in `pm`. */
  team: string[]
  entries: CostEntry[]
  invoices: ProjectInvoice[]
  milestones: Milestone[] | null
  billing: BillingMilestone[] | null
  vos: Addendum[]
  /** input only — revenue frozen at a distinct-scope addendum. */
  recognizedBase: number
  /** input only — the % complete at that same moment. */
  pctAtVO: number
  weightsNeedConfirm: boolean
  closedAt: string | null
  /** output only — a distinct addendum owes the contract its own milestone. */
  scopePending: { voId: string; added: number } | null
  /** Open approval requests raised by Settings › Approval workflows rules. Decided
   *  requests leave this list (their outcome is written to the record they gate). */
  approvals?: PendingApproval[]
  /** Who closed / reopened the project, for the audit line on Project health. */
  closedBy?: string | null
  reopenLog?: { date: string; by: string; reason: string }[]
  /** Decided approval requests, for the audit line on each gated record. */
  approvalLog?: ApprovalDecisionLog[]
}

// ── Approval contract (shared by engine, detail page, forms, settings) ─────────
export type ProjectApprovalAction = 'project-creation' | 'addendum' | 'milestone-verification'

export interface PendingApproval {
  id: string
  action: ProjectApprovalAction
  /** The gated record: milestone id, addendum id, or null for project creation. */
  refId: string | null
  ruleId: string
  ruleName: string
  amount: number | null
  submittedBy: string
  submittedAt: string
  /** Names allowed to decide this request (from the matched rule's levels). */
  approvers: string[]
  /** milestone-verification only: the verification details applied on approval. */
  verification?: MilestoneVerificationInput | null
  /**
   * project-creation only: a rejected creation request stays on the project (status
   * stays Pending approval) with who rejected it and why. canDecide() refuses it.
   */
  rejectedBy?: string | null
  rejectReason?: string | null
  rejectedAt?: string | null
}

/** Audit trail of decided approval requests (approved or rejected), newest last. */
export interface ApprovalDecisionLog {
  approvalId: string
  action: ProjectApprovalAction
  refId: string | null
  decision: 'approved' | 'rejected'
  by: string
  date: string
  submittedBy: string
  reason: string | null
}

export interface MilestoneVerificationInput {
  date: string
  verifiedBy: string
  /** Supporting document name (BAST, progress report), optional. */
  document: string | null
}

export type ProjectStatusKey = 'pending approval' | 'rejected' | 'in progress' | 'closed'

/**
 * The prototype's "today". Fixed rather than `new Date()` so the seed's aging
 * buckets (0–30 / 31–60 / 61–90 / 90+ days) and every test stay deterministic —
 * a drifting clock would silently reshuffle which lines look overdue.
 */
export const TODAY = '2026-08-03'

export const COST_ACCOUNTS = [
  '5-10000 Cost of materials',
  '5-10001 Subcontractor expense',
  '6-10001 Direct labor',
  '6-10002 Site expense',
]

export const REVENUE_ACCOUNT = '4-10000 Project revenue'

export const EXPENSE_ACCOUNT_OPTIONS = [
  'Cost of materials',
  'Subcontractor expense',
  'Site expense',
  'Equipment rental',
  'Professional fees',
]

export const TAX_OPTIONS = ['No tax', 'PPN 11%']

export const PAYMENT_TERMS_OPTIONS = ['Net 30', 'Net 14', 'Due on receipt']

// ── Seed ─────────────────────────────────────────────────────────────────────

let uidCounter = 0
function uid(prefix: string): string {
  uidCounter += 1
  return `${prefix}-${uidCounter}-${Math.random().toString(36).slice(2, 7)}`
}

function cost(
  category: string,
  description: string,
  vendor: string,
  date: string,
  amount: number,
  src: CostSource = 'Expense',
  docNo = 'EXP-0000',
  markupPct = 0,
  decision: CostDecision = null,
  invoiced = false,
  hours: number | null = null,
): CostEntry {
  return { id: uid('c'), category, description, vendor, date, amount, markupPct, src, docNo, decision, invoiced, hours }
}

/**
 * Cost plans differ by work type: construction buys materials, a service
 * project buys hours. The plan is frozen at Setup — it is a baseline, so a
 * later addendum never restates it.
 */
const BUILD_PLAN: [string, number][] = [
  ['5-10000 Cost of materials', 0.45],
  ['5-10001 Subcontractor expense', 0.30],
  ['6-10001 Direct labor', 0.15],
  ['6-10002 Site expense', 0.10],
]
const SERVICE_PLAN: [string, number][] = [
  ['6-10001 Direct labor', 0.85],
  ['6-10002 Site expense', 0.15],
]

export function defaultBudgetLines(value: number, budget: number | null, method: RecognitionMethod): BudgetLines {
  const plan = method === 'tm' ? SERVICE_PLAN : BUILD_PLAN
  return {
    revenue: [{ id: 'br1', account: REVENUE_ACCOUNT, amount: Math.round(value || 0) }],
    cost: plan.map((a, i) => ({ id: `bc${i}`, account: a[0], amount: Math.round((budget || 0) * a[1]) })),
  }
}

function withPlan(list: Engagement[]): Engagement[] {
  return list.map((e) => {
    if (e.budget === null) return e
    e.budgetLines = defaultBudgetLines(e.method === 'tm' ? e.feeEstimate : e.contractValue, e.budget, e.method)
    return e
  })
}

function baseEngagement(partial: Partial<Engagement> & Pick<Engagement, 'id' | 'name' | 'client' | 'pm' | 'method' | 'stage'>): Engagement {
  return {
    markupPct: 0,
    feeEstimate: 0,
    contractValue: 0,
    budget: null,
    budgetLineId: null,
    budgetLines: null,
    team: [],
    entries: [],
    invoices: [],
    milestones: null,
    billing: null,
    vos: [],
    recognizedBase: 0,
    pctAtVO: 0,
    weightsNeedConfirm: false,
    closedAt: null,
    scopePending: null,
    ...partial,
  }
}

function seed(): Engagement[] {
  return withPlan([
    baseEngagement({
      id: 'e1', name: 'Financial Statement Audit 2025', client: 'PT Sinar Abadi Textile', pm: 'Rina Wulandari',
      method: 'tm', markupPct: 20, stage: 'recognition', feeEstimate: 185_000_000, budget: 96_000_000,
      entries: [
        cost('Labor', 'Rina Wulandari — audit fieldwork', 'Internal payroll', '2026-07-05', 5_700_000, 'Expense', 'EXP-1102', 20, null, false, 15),
        cost('Labor', 'Yoga Prasetyo — tax position review', 'Internal payroll', '2026-06-28', 1_500_000, 'Expense', 'EXP-1088', 20, null, false, 6),
        cost('Labor', 'Rina Wulandari — audit fieldwork', 'Internal payroll', '2026-06-15', 3_040_000, 'Expense', 'EXP-1071', 20, null, false, 8),
        cost('Labor', 'Rina Wulandari — opening balance testing', 'Internal payroll', '2026-05-10', 4_560_000, 'Expense', 'EXP-1024', 20, null, false, 12),
        cost('Labor', 'Made Ardika — schedule preparation', 'Internal payroll', '2026-04-20', 2_000_000, 'Expense', 'EXP-0991', 20, null, false, 10),
      ],
    }),
    baseEngagement({
      id: 'e2', name: 'Annual Tax Consulting', client: 'CV Makmur Jaya', pm: 'Yoga Prasetyo',
      method: 'tm', markupPct: 20, stage: 'execution', feeEstimate: 60_000_000, budget: 28_000_000,
      entries: [
        cost('Labor', 'Yoga Prasetyo — annual return preparation', 'Internal payroll', '2026-07-22', 2_250_000, 'Expense', 'EXP-1178', 20, null, false, 9),
        cost('Labor', 'Yoga Prasetyo — tax reconciliation', 'Internal payroll', '2026-06-30', 2_750_000, 'Expense', 'EXP-1090', 20, null, false, 11),
        cost('Labor', 'Dewi Kusuma — document collation', 'Internal payroll', '2026-06-10', 1_050_000, 'Expense', 'EXP-1065', 20, null, false, 7),
      ],
    }),
    baseEngagement({
      id: 'e3', name: 'Monthly Retainer', client: 'PT Global Teknindo', pm: 'Made Ardika',
      method: 'tm', markupPct: 20, stage: 'billing', feeEstimate: 25_000_000, budget: null,
      entries: [
        cost('Labor', 'Made Ardika — monthly bookkeeping', 'Internal payroll', '2026-07-05', 4_000_000, 'Expense', 'EXP-1105', 20, 'bill', true, 20),
        cost('Labor', 'Dewi Kusuma — payroll processing', 'Internal payroll', '2026-07-10', 1_800_000, 'Expense', 'EXP-1112', 20, 'bill', true, 12),
        cost('Labor', 'Made Ardika — monthly bookkeeping', 'Internal payroll', '2026-07-26', 1_200_000, 'Expense', 'EXP-1190', 20, null, false, 6),
        cost('Labor', 'Dewi Kusuma — VAT filing', 'Internal payroll', '2026-07-18', 750_000, 'Expense', 'EXP-1175', 20, null, false, 5),
      ],
      invoices: [{ id: 'INV-2198', label: 'Progress billing', amount: 6_960_000, date: '2026-07-12', status: 'unpaid', paidDate: null }],
    }),
    baseEngagement({
      id: 'e5', name: 'Home Terrace Renovation', client: 'Mr. Hendra Wijaya', pm: 'Made Ardika',
      method: 'input', stage: 'execution', contractValue: 45_000_000, budget: 30_000_000,
      entries: [
        cost('Material', 'Floor tiling, 25 m²', 'Jaya Building Supplies', '2026-07-12', 8_500_000, 'Expense', 'EXP-1181'),
        cost('Material', 'Cement & sand', 'Jaya Building Supplies', '2026-07-13', 2_200_000, 'Expense', 'EXP-1184'),
        cost('Subcontractor', 'Builders — 6 days', 'Slamet (foreman)', '2026-07-20', 6_000_000, 'Purchase', 'PO-0442'),
        cost('Material', 'Exterior paint & finishing', 'UD Sejahtera Paints', '2026-07-25', 1_800_000, 'Expense', 'EXP-1192'),
      ],
      // The paid down payment is a real invoice, so the schedule row, billed and
      // collected all tell the same story (billingStatusOf reads the invoice).
      invoices: [{ id: 'INV-2190', label: 'Down payment (30%)', amount: 13_500_000, date: '2026-07-06', status: 'paid', paidDate: '2026-07-10' }],
      billing: [
        { id: 'b1', label: 'Down payment (30%)', pct: 30, status: 'paid', invId: 'INV-2190', paidDate: '2026-07-10' },
        { id: 'b2', label: 'Final payment (70%)', pct: 70, status: 'notdue', invId: null, paidDate: null },
      ],
    }),
    baseEngagement({
      id: 'e6', name: 'Wedding Organizer — Amanda & Reza', client: 'Susanto Family', pm: 'Dewi Kusuma',
      method: 'output', stage: 'billing', contractValue: 120_000_000, budget: 95_000_000,
      entries: [
        cost('Subcontractor', 'Catering 300 pax', 'Bunda Ratu Catering', '2026-07-15', 45_000_000, 'Purchase', 'PO-0455'),
        cost('Subcontractor', 'Venue & decoration rental', 'Grand Ballroom Hotel', '2026-07-18', 38_000_000, 'Expense', 'EXP-1201'),
        cost('Subcontractor', 'Sound system & MC', 'Harmoni Production', '2026-07-20', 12_000_000, 'Expense', 'EXP-1205'),
        cost('Labor', 'Dewi Kusuma — event coordination', 'Internal payroll', '2026-07-01', 2_400_000, 'Expense', 'EXP-1150', 0, null, false, 16),
      ],
      invoices: [{ id: 'INV-2205', label: 'Down payment', amount: 36_000_000, date: '2026-06-05', status: 'paid', paidDate: '2026-06-08' }],
      milestones: [{ id: 'm1', label: 'Event delivered (single deliverable)', pct: 100, verified: false, invId: null, recognized: 0 }],
    }),
    baseEngagement({
      id: 'e7', name: 'Cikarang Warehouse Construction', client: 'PT Anugerah Logistik', pm: 'Rina Wulandari',
      method: 'output', stage: 'recognition', contractValue: 2_400_000_000, budget: 1_850_000_000,
      entries: [
        cost('Material', 'WF 250 structural steel', 'PT Baja Utama', '2026-06-11', 420_000_000, 'Purchase', 'PO-0398'),
        cost('Subcontractor', 'Roof truss fabrication', 'CV Karya Logam', '2026-06-28', 310_000_000, 'Purchase', 'PO-0410'),
        cost('Expense', 'Crane rental, 2 weeks', 'PT Alat Berat Nusantara', '2026-07-09', 85_000_000, 'Expense', 'EXP-1174'),
      ],
      milestones: [
        { id: 'm1', label: 'Fabrication complete', pct: 40, verified: false, invId: null, recognized: 0 },
        { id: 'm2', label: 'Delivery to site', pct: 30, verified: false, invId: null, recognized: 0 },
        { id: 'm3', label: 'Installation & commissioning', pct: 30, verified: false, invId: null, recognized: 0 },
      ],
      // One open approval so the flow is visible on load: Rina raised it, the
      // Addendum rule (change above Rp25.000.000) routes it to Rizal Candra.
      vos: [{
        id: 'v-e7-1', date: '2026-08-01', reason: 'Two additional loading dock bays on the east wall',
        oldValue: 2_400_000_000, newValue: 2_520_000_000, status: 'Pending', distinct: true,
        raisedBy: 'Rina Wulandari', approvedBy: null, adjustment: 0, rejectedBy: null, rejectReason: null,
      }],
      approvals: [{
        id: 'apr-e7-1', action: 'addendum', refId: 'v-e7-1', ruleId: 'awf-006', ruleName: 'Addendum Rule 001',
        amount: 120_000_000, submittedBy: 'Rina Wulandari', submittedAt: '2026-08-01', approvers: ['Rizal Candra'],
      }],
    }),
  ])
}

const KEY = 'project-accounting-v2'
const snap = loadSnapshot<Engagement>(KEY)
export const engagements = reactive<Engagement[]>(snap ?? seed())

function persist(): void {
  saveSnapshot(KEY, engagements)
  syncApprovalProjects(engagements)
}

// Stored schedule statuses are a cache of the linked invoice; re-derive them on
// load so an older snapshot can never show a Paid row without a paid invoice.
engagements.forEach(syncBilling)
syncApprovalProjects(engagements)

let invoiceCounter = engagements.reduce((max, e) => {
  const local = e.invoices.reduce((m, i) => Math.max(m, Number(i.id.replace('INV-', '')) || 0), 0)
  return Math.max(max, local)
}, 2300) + 1

export function findEngagement(id: string): Engagement | undefined {
  return engagements.find(e => e.id === id)
}

// ── Formatting ───────────────────────────────────────────────────────────────

const IDR = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2 })

/** "Rp9.000.000,00" — DESIGN.md → Number format (IDR). The replace drops Intl's space. */
export function formatIdr(n: number): string {
  return IDR.format(Math.round(n || 0)).replace(/^(Rp)\s/, '$1')
}

/** Same currency, no decimals — for dense inline notes like a per-hour rate. */
export function formatIdrShort(n: number): string {
  return `Rp${Math.round(n || 0).toLocaleString('id-ID')}`
}

/** Negatives render in accounting parentheses: (Rp1.000,00). */
export function formatIdrSigned(n: number): string {
  return n < 0 ? `(${formatIdr(-n)})` : formatIdr(n)
}

// ── Derived figures ──────────────────────────────────────────────────────────

export function methodLabel(m: RecognitionMethod): string {
  return { tm: 'Cost plus margin', input: 'Percentage of completion', output: 'Milestones' }[m]
}

export function methodFormal(m: RecognitionMethod): string {
  return {
    tm: 'Reviewed cost plus the agreed margin',
    input: 'Progress measured by cost spent',
    output: 'Earned as milestones are verified',
  }[m]
}

export const STAGES: { key: EngagementStage; label: string }[] = [
  { key: 'setup', label: 'Setup & contract' },
  { key: 'execution', label: 'Costs' },
  { key: 'recognition', label: 'Revenue recognition' },
  { key: 'billing', label: 'Invoices & payments' },
  { key: 'closed', label: 'Project health' },
]

export function stageIndex(k: EngagementStage): number {
  return STAGES.findIndex(s => s.key === k)
}

/**
 * Stage-based label, kept for old callers only. Screens show projectStatusLabel().
 * @deprecated use projectStatusLabel(e)
 */
export function lifecycleLabel(k: EngagementStage): string {
  return { setup: 'Setup', execution: 'In progress', recognition: 'In progress', billing: 'Billing', closed: 'Closed' }[k]
}

export function daysAgo(date: string, today: string = TODAY): number {
  return Math.round((new Date(today).getTime() - new Date(date).getTime()) / 86_400_000)
}

/** Cost + the agreed margin — what the customer could be charged if the line is allowed. */
export function entryAmount(e: CostEntry): number {
  return Math.round(e.amount * (1 + (e.markupPct || 0) / 100))
}

/** What the customer is actually charged, once reviewed. */
export function entryFinal(e: CostEntry): number {
  if (e.decision === 'atcost') return e.amount
  if (e.decision === 'absorb') return 0
  return entryAmount(e)
}

export function entryLabel(e: CostEntry): string {
  return `${e.category}: ${e.description}`
}

export function actualCost(e: Engagement): number {
  return e.entries.reduce((s, x) => s + x.amount, 0)
}

/** Percentage of completion, cost-to-cost. Capped at 100 — progress cannot exceed done. */
export function pocPct(e: Engagement): number {
  if (!e.budget) return 0
  return Math.min((actualCost(e) / e.budget) * 100, 100)
}

/**
 * Revenue recognized to date. One function, three engines — this is the single
 * place the recognition method actually changes the numbers.
 */
export function revenue(e: Engagement): number {
  if (e.method === 'tm') {
    return e.entries.filter(x => x.decision).reduce((s, x) => s + entryFinal(x), 0)
  }
  if (e.method === 'input') {
    // recognizedBase / pctAtVO are 0 unless a DISTINCT addendum froze them, in which
    // case only progress made after the addendum is measured on the new value.
    return e.recognizedBase + (Math.max(0, pocPct(e) - e.pctAtVO) / 100) * e.contractValue
  }
  return (e.milestones ?? []).filter(m => m.verified).reduce((s, m) => s + m.recognized, 0)
}

export function billed(e: Engagement): number {
  return e.invoices.reduce((s, i) => s + i.amount, 0)
}

export function collected(e: Engagement): number {
  return e.invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0)
}

/** Cost lines still awaiting a review decision — incurred, but not yet revenue. */
export function openEntries(e: Engagement): CostEntry[] {
  return e.entries.filter(x => !x.decision)
}

export function readyToInvoice(e: Engagement): CostEntry[] {
  return e.entries.filter(x => x.decision && x.decision !== 'absorb' && !x.invoiced)
}

export function pendingVos(e: Engagement): Addendum[] {
  return e.vos.filter(v => v.status === 'Pending')
}

/** Billing position: positive = unbilled revenue, negative = billed in advance. */
export function wipNet(e: Engagement): number {
  return revenue(e) - billed(e)
}

export function canClose(e: Engagement): boolean {
  if (e.closedAt) return false
  if (pendingVos(e).length || (e.approvals ?? []).length) return false
  const invoicesOk = e.invoices.length > 0 && e.invoices.every(i => i.status === 'paid')
  // Every method: what was earned is exactly what was billed (nothing unbilled, nothing
  // billed in advance), and every invoice is paid.
  const settled = invoicesOk && Math.abs(wipNet(e)) < 1
  if (e.method === 'tm') return e.entries.every(x => x.decision) && readyToInvoice(e).length === 0 && settled
  if (e.method === 'input') return pocPct(e) >= 100 && settled && (e.billing ?? []).every(m => billingStatusOf(e, m) === 'paid')
  return (e.milestones ?? []).every(m => m.verified && m.invId) && settled
}

export function closeHint(e: Engagement): string {
  if (pendingVos(e).length) return 'Approve or reject every pending addendum before closing.'
  if ((e.approvals ?? []).length) return 'Decide every pending approval before closing.'
  if (canClose(e)) return 'Ready to close. Revenue is final, every invoice is paid and no addendum is pending.'
  if (e.method === 'tm') return 'To close, review and invoice every cost line, then record payment for every invoice.'
  if (e.method === 'input') return 'To close, the project must be 100% complete and every billing milestone paid.'
  if (e.method === 'output' && (e.milestones ?? []).every(m => m.verified) && wipNet(e) > 0) {
    return `To close, invoice the ${formatIdr(wipNet(e))} of recognized revenue not yet billed, then record payment.`
  }
  return 'To close, verify and invoice every milestone, then record payment for every invoice.'
}

/** Cost lines awaiting review, by age ("Awaiting review"). Keys are the bucket labels. */
export function ageBuckets(e: Engagement, today: string = TODAY): Record<string, number> {
  const buckets: Record<string, number> = { '0–30 days': 0, '31–60 days': 0, '61–90 days': 0, '90+ days': 0 }
  openEntries(e).forEach((x) => {
    const d = daysAgo(x.date, today)
    const k = d <= 30 ? '0–30 days' : d <= 60 ? '31–60 days' : d <= 90 ? '61–90 days' : '90+ days'
    buckets[k]! += entryAmount(x)
  })
  return buckets
}

export function accountForEntry(x: CostEntry): string {
  // 'Labour' kept for records written before the US-spelling pass.
  if (x.category === 'Labor' || x.category === 'Labour') return '6-10001 Direct labor'
  if (x.category === 'Material') return '5-10000 Cost of materials'
  if (x.category === 'Subcontractor') return '5-10001 Subcontractor expense'
  return '6-10002 Site expense'
}

export function budgetOf(e: Engagement): BudgetLines {
  return e.budgetLines ?? defaultBudgetLines(e.method === 'tm' ? e.feeEstimate : e.contractValue, e.budget, e.method)
}

export interface BudgetReportRow {
  label: string
  header?: boolean
  total?: boolean
  /** Budget TO DATE: the lifetime budget scaled to progress (see budgetReport). */
  budget: number | null
  /** The whole-of-project budget the to-date figure is scaled from. */
  lifetimeBudget?: number | null
  actual: number
  variance: number | null
  pct: number | null
  /** Kept for old callers: equals tone === 'adverse'. */
  adverse: boolean
  note: string
  kind: 'revenue' | 'cost' | null
  /** Display tone owned by the engine: 'adverse' only for a real overrun. */
  tone?: 'adverse' | 'default' | 'positive'
}

/**
 * How far through the project it is, 0–1, for scaling the lifetime budget to date.
 *   input  — percentage of completion (cost-to-cost)
 *   output — verified milestone weight ÷ total weight
 *   tm     — null: cost IS the progress measure, so cost is judged against lifetime
 */
export function budgetProgress(e: Engagement): number | null {
  if (e.method === 'input') return pocPct(e) / 100
  if (e.method === 'output') {
    const ms = e.milestones ?? []
    const total = ms.reduce((a, m) => a + m.pct, 0)
    return total > 0 ? ms.filter(m => m.verified).reduce((a, m) => a + m.pct, 0) / total : 0
  }
  return null
}

/**
 * Share of the work done, measured one way for every method: cost to date over
 * budgeted cost (capped at 100%). null when there is no budget to measure against.
 */
export function workDoneShare(e: Engagement): number | null {
  if (!e.budget) return null
  return Math.min(actualCost(e) / e.budget, 1)
}

/**
 * Budget variance — same shape as the Financials budget-variance report, scoped to
 * one project. One rule for every method:
 *   - Cost is compared with the lifetime budget (the whole job's cost plan).
 *   - Revenue and margin are compared with what the work done so far should have
 *     earned: lifetime plan × workDoneShare. A gap there is timing (not yet
 *     reviewed, verified or billed), so it is reported but never red.
 *   - Red (tone 'adverse') only for a real loss: a cost line or the total over its
 *     lifetime budget, or a projected loss at completion on the margin row.
 * No budget: nothing can be measured, every row shows actuals only.
 */
export function budgetReport(e: Engagement): BudgetReportRow[] {
  const b = budgetOf(e)
  const hasBudget = e.budget !== null
  const recognized = revenue(e)
  const share = workDoneShare(e)
  const revLifetimeTotal = b.revenue.reduce((a, l) => a + l.amount, 0)
  const rows: BudgetReportRow[] = []

  const none = (label: string, act: number, kind: BudgetReportRow['kind'], total = false): BudgetReportRow =>
    ({ label, budget: null, lifetimeBudget: null, actual: act, variance: null, pct: null, adverse: false, note: '', kind, tone: 'default', ...(total ? { total } : {}) })
  const header = (label: string): BudgetReportRow => ({ ...none(label, 0, null), header: true })

  const revRow = (label: string, lifetime: number, act: number, total = false): BudgetReportRow => {
    if (!hasBudget || share === null) return none(label, act, 'revenue', total)
    const toDate = Math.round(lifetime * share)
    const variance = act - toDate
    return {
      label, budget: toDate, lifetimeBudget: lifetime, actual: act, variance,
      pct: toDate > 0 ? (variance / toDate) * 100 : null, adverse: false,
      note: variance < 0 ? 'Not yet recognized' : '', kind: 'revenue',
      tone: variance > 0 ? 'positive' : 'default', ...(total ? { total } : {}),
    }
  }
  const costRow = (label: string, lifetime: number, act: number, total = false): BudgetReportRow => {
    if (!hasBudget) return none(label, act, 'cost', total)
    const variance = lifetime - act
    const over = act > lifetime
    return {
      label, budget: lifetime, lifetimeBudget: lifetime, actual: act, variance,
      pct: lifetime > 0 ? (variance / lifetime) * 100 : null, adverse: over,
      note: over ? 'Over budget' : '', kind: 'cost',
      tone: over ? 'adverse' : 'default', ...(total ? { total } : {}),
    }
  }

  rows.push(header('Revenue'))
  b.revenue.forEach((l, i) => {
    const part = revLifetimeTotal > 0 ? l.amount / revLifetimeTotal : (i === 0 ? 1 : 0)
    rows.push(revRow(l.account, l.amount, Math.round(recognized * part)))
  })
  rows.push(revRow('Total revenue', revLifetimeTotal, recognized, true))

  rows.push(header('Project cost'))
  // Every cost line lands on a plan row; a category the plan does not carry still
  // counts in the total so the report always ties to Cost incurred.
  const planned = new Set(b.cost.map(l => l.account))
  b.cost.forEach((l) => {
    const act = e.entries.filter(x => accountForEntry(x) === l.account).reduce((a, x) => a + x.amount, 0)
    rows.push(costRow(l.account, l.amount, act))
  })
  const unplanned = e.entries.filter(x => !planned.has(accountForEntry(x))).reduce((a, x) => a + x.amount, 0)
  if (unplanned > 0) rows.push(costRow('Not in the cost plan', 0, unplanned))
  const costLifetimeTotal = b.cost.reduce((a, l) => a + l.amount, 0)
  const costActualTotal = actualCost(e)
  rows.push(costRow('Total project cost', costLifetimeTotal, costActualTotal, true))

  const gpActual = recognized - costActualTotal
  if (hasBudget && share !== null) {
    const gpLifetime = revLifetimeTotal - costLifetimeTotal
    const gpToDate = Math.round(revLifetimeTotal * share) - costActualTotal
    const variance = gpActual - gpToDate
    const projectedLoss = (projectedMargin(e).value ?? 0) < 0
    rows.push({
      label: 'Gross margin', total: true, budget: gpToDate, lifetimeBudget: gpLifetime, actual: gpActual, variance,
      pct: gpToDate !== 0 ? (variance / Math.abs(gpToDate)) * 100 : null, adverse: projectedLoss,
      note: projectedLoss ? 'Loss at completion' : variance < 0 ? 'Not yet recognized' : '',
      kind: 'revenue', tone: projectedLoss ? 'adverse' : variance > 0 ? 'positive' : 'default',
    })
  } else {
    rows.push(none('Gross margin', gpActual, null, true))
  }

  return rows
}

// ── Mutations ────────────────────────────────────────────────────────────────

/** Stages only ever move forward — jumping back to a tab must not rewind the record. */
export function advanceStage(id: string, key: EngagementStage): void {
  const e = findEngagement(id)
  if (!e) return
  if (stageIndex(key) > stageIndex(e.stage)) {
    e.stage = key
    persist()
  }
}

export interface DraftMilestone { id: string; label: string; pct: string }

export interface EngagementDraft {
  name: string
  client: string
  pm: string
  method: RecognitionMethod
  /** Fee estimate (tm) or contract value (input/output), as typed. */
  value: string
  budget: string
  /** Linked budget line id, or '' when none is picked. Optional: drafts built
   *  before the Setup form gained the field simply carry no budget link. */
  budgetLineId?: string
  /** Assigned team members, by name. Optional for the same reason. */
  team?: string[]
  markup: string
  milestones: DraftMilestone[]
  budgetLines: { revenue: { id: string; account: string; amount: string }[]; cost: { id: string; account: string; amount: string }[] }
}

export function draftWeightSum(d: EngagementDraft): number {
  return d.milestones.reduce((s, m) => s + (Number(m.pct) || 0), 0)
}

/**
 * Create a project. When a Project creation rule matches the contract value (or fee
 * estimate), the project is created with an open approval and reads Pending approval
 * until an approver other than the submitter approves it.
 */
export function createEngagement(d: EngagementDraft, submittedBy?: string): Engagement {
  const id = uid('e')
  const lines: BudgetLines = {
    revenue: d.budgetLines.revenue.map(l => ({ id: l.id, account: l.account, amount: Number(l.amount) || 0 })),
    cost: d.budgetLines.cost.map(l => ({ id: l.id, account: l.account, amount: Number(l.amount) || 0 })),
  }
  const costPlan = lines.cost.reduce((a, l) => a + l.amount, 0)
  const hasLines = costPlan > 0 || lines.revenue.some(l => l.amount > 0)

  const e = baseEngagement({
    id,
    name: d.name.trim(),
    client: d.client.trim(),
    pm: d.pm.trim() || submittedBy?.trim() || 'Unassigned',
    method: d.method,
    stage: 'execution',
    feeEstimate: d.method === 'tm' ? Number(d.value) || 0 : 0,
    contractValue: d.method === 'tm' ? 0 : Number(d.value) || 0,
    markupPct: d.method === 'tm' ? (d.markup === '' ? 20 : Number(d.markup) || 0) : 0,
    // An itemised cost plan wins over the single estimated-cost figure.
    budget: costPlan > 0 ? costPlan : (d.budget === '' ? null : Number(d.budget) || 0),
    budgetLineId: d.budgetLineId || null,
    budgetLines: hasLines ? lines : null,
    team: (d.team ?? []).filter(Boolean),
    milestones: d.method === 'output'
      ? d.milestones.map(m => ({ id: m.id, label: m.label.trim() || 'Milestone', pct: Number(m.pct) || 0, verified: false, invId: null, recognized: 0 }))
      : null,
    billing: d.method === 'input'
      ? [
          { id: 'b1', label: 'Down payment (30%)', pct: 30, status: 'notdue' as BillingStatus, invId: null, paidDate: null },
          { id: 'b2', label: 'Final payment (70%)', pct: 70, status: 'notdue' as BillingStatus, invId: null, paidDate: null },
        ]
      : null,
  })
  const value = e.method === 'tm' ? e.feeEstimate : e.contractValue
  const rule = matchRule('project-creation', value, null)
  if (rule) e.approvals = [newApproval('project-creation', null, rule, value, submittedBy?.trim() || e.pm)]
  engagements.push(e)
  persist()
  return e
}

/** Record what the client is charged for the selected cost lines. */
export function decideEntries(id: string, entryIds: string[], decision: Exclude<CostDecision, null>): number {
  const e = findEngagement(id)
  if (!e) return 0
  let total = 0
  e.entries.forEach((x) => {
    if (!entryIds.includes(x.id)) return
    x.decision = decision
    total += entryFinal(x)
  })
  persist()
  return total
}

/**
 * Raise an addendum. A matching Addendum rule (value change above its threshold)
 * opens an approval and the addendum waits as Pending; with no matching rule it is
 * applied at once. Returns the new addendum id and what happened to it.
 */
export function addAddendum(id: string, newValue: number, reason: string, distinct: boolean, submittedBy?: string):
  { voId: string; status: 'approved' | 'pending'; approval?: PendingApproval } | null {
  const e = findEngagement(id)
  if (!e) return null
  const by = submittedBy?.trim() || e.pm
  const oldValue = e.method === 'tm' ? e.feeEstimate : e.contractValue
  const vo: Addendum = {
    id: uid('v'),
    date: TODAY,
    reason: reason.trim(),
    oldValue,
    newValue,
    status: 'Pending',
    distinct,
    raisedBy: by,
    approvedBy: null,
    adjustment: 0,
    rejectedBy: null,
    rejectReason: null,
  }
  e.vos.push(vo)
  const change = Math.abs(newValue - oldValue)
  const rule = matchRule('addendum', change, e.id)
  if (rule) {
    const approval = newApproval('addendum', vo.id, rule, change, by)
    e.approvals = [...(e.approvals ?? []), approval]
    persist()
    return { voId: vo.id, status: 'pending', approval }
  }
  applyAddendum(e, vo, null)
  persist()
  return { voId: vo.id, status: 'approved' }
}

/**
 * Approve an addendum. The contract value moves here — and PSAK 72's distinct test
 * decides what happens to revenue already recognised:
 *
 *   input  + not distinct → same partially-satisfied obligation, so the whole thing
 *                           is remeasured on the new value: a one-time cumulative
 *                           catch-up lands in the current period.
 *   input  + distinct     → prospective. Freeze what is earned, measure the rest on
 *                           the new value.
 *   output + not distinct → verified milestones stay locked (a physical sign-off is
 *                           never reopened); the unverified weights must be
 *                           reconfirmed before anything else can be verified.
 *   output + distinct     → every existing milestone keeps the money it is already
 *                           worth (weights restate against the larger contract), and
 *                           the addition owes the contract its own milestone.
 *   tm                    → the fee estimate is replaced; reviewed/billed work is
 *                           never restated.
 */
export function approveAddendum(id: string, voId: string, approver?: string): boolean {
  const e = findEngagement(id)
  const vo = e?.vos.find(v => v.id === voId)
  if (!e || !vo || vo.status !== 'Pending') return false
  const gate = approvalFor(e, 'addendum', voId)
  // A rule-gated addendum is decided only by one of its approvers, never the submitter.
  if (gate) return approveRequest(id, gate.id, approver ?? '')
  applyAddendum(e, vo, approver?.trim() || null)
  persist()
  return true
}

/** Apply an addendum's value change. `approvedBy` is the deciding user (null when no rule gated it). */
function applyAddendum(e: Engagement, vo: Addendum, approvedBy: string | null): void {
  const voId = vo.id
  const before = revenue(e)

  if (e.method === 'input') {
    if (vo.distinct) {
      e.recognizedBase = before
      e.pctAtVO = pocPct(e)
    } else {
      e.recognizedBase = 0
      e.pctAtVO = 0
    }
  }

  if (e.method === 'tm') e.feeEstimate = vo.newValue
  else e.contractValue = vo.newValue

  const after = revenue(e)
  vo.status = 'Approved'
  vo.approvedBy = approvedBy
  vo.adjustment = Math.round(after - before)

  if (e.method === 'output' && e.milestones) {
    if (vo.distinct) {
      // Restate weights against the larger contract so every milestone — verified or
      // not — keeps exactly the money it was already worth.
      const scale = vo.oldValue / vo.newValue
      e.milestones.forEach((m) => { m.pct = m.pct * scale })
      e.scopePending = { voId, added: vo.newValue - vo.oldValue }
    } else {
      e.weightsNeedConfirm = true
    }
  }
}

/**
 * Reject an addendum. A rule-gated one goes through rejectRequest (approver must be
 * allowed to decide, reason required). It stays on the list as Rejected.
 */
export function rejectAddendum(id: string, voId: string, approver?: string, reason?: string): boolean {
  const e = findEngagement(id)
  const vo = e?.vos.find(v => v.id === voId)
  if (!e || !vo || vo.status !== 'Pending') return false
  const gate = approvalFor(e, 'addendum', voId)
  if (gate) return rejectRequest(id, gate.id, approver ?? '', reason ?? '')
  vo.status = 'Rejected'
  vo.rejectedBy = approver?.trim() || null
  vo.rejectReason = reason?.trim() || null
  persist()
  return true
}

/** The added distinct scope claims whatever weight the restatement left over. */
export function addScopeMilestone(id: string, label: string): number {
  const e = findEngagement(id)
  if (!e || !e.milestones || !e.scopePending) return 0
  const added = e.scopePending.added
  const used = e.milestones.reduce((a, m) => a + m.pct, 0)
  e.milestones.push({ id: uid('m'), label: label.trim(), pct: 100 - used, verified: false, invId: null, recognized: 0 })
  e.scopePending = null
  persist()
  return added
}

/** Returns false when the weights do not sum to 100 — nothing is written. */
export function confirmWeights(id: string, weights: { id: string; pct: string }[]): boolean {
  const e = findEngagement(id)
  if (!e || !e.milestones) return false
  const sum = weights.reduce((a, w) => a + (Number(w.pct) || 0), 0)
  if (sum !== 100) return false
  e.milestones.forEach((m) => {
    const w = weights.find(x => x.id === m.id)
    if (w) m.pct = Number(w.pct) || 0
  })
  e.weightsNeedConfirm = false
  persist()
  return true
}

/** Recognises the milestone's share of contract value and queues it for billing. */
export function verifyMilestone(id: string, mid: string): number {
  const e = findEngagement(id)
  if (!e || !e.milestones || e.weightsNeedConfirm) return 0
  const m = e.milestones.find(x => x.id === mid)
  if (!m || m.verified) return 0
  // An open approval request owns this milestone until it is decided.
  if (approvalFor(e, 'milestone-verification', mid)) return 0
  const amount = Math.round((e.contractValue * m.pct) / 100)
  m.verified = true
  m.recognized = amount
  advanceStage(id, 'billing')
  persist()
  return amount
}

/** Reversible only while still uninvoiced — an invoiced milestone is locked. */
export function unverifyMilestone(id: string, mid: string): boolean {
  const e = findEngagement(id)
  const m = e?.milestones?.find(x => x.id === mid)
  if (!e || !m || m.invId) return false
  m.verified = false
  m.recognized = 0
  m.verifiedAt = null
  m.verifiedBy = null
  m.document = null
  persist()
  return true
}

export interface InvoiceDraftLine {
  id: string
  product: string
  description: string
  qty: string
  unitPrice: string
  discount: string
  tax: string
  project: string
}

export type InvoiceKind = 'tm' | 'billing' | 'output' | 'adhoc'

export function invoiceLineAmount(l: InvoiceDraftLine): number {
  return Math.round((Number(l.qty) || 0) * (Number(l.unitPrice) || 0) * (1 - (Number(l.discount) || 0) / 100))
}

export function invoiceLineTax(l: InvoiceDraftLine): number {
  return l.tax === 'PPN 11%' ? Math.round(invoiceLineAmount(l) * 0.11) : 0
}

export function newInvoiceLine(product: string, description: string, unitPrice: number, project: string): InvoiceDraftLine {
  return { id: uid('il'), product, description, qty: '1', unitPrice: String(Math.round(unitPrice)), discount: '', tax: 'No tax', project }
}

export interface SaveInvoiceInput {
  engId: string
  kind: InvoiceKind
  label: string
  milestoneId: string | null
  entryIds: string[] | null
  date: string
  amount: number
}

/** Posts the invoice against the engagement and marks whatever it was raised from. */
export function saveInvoice(input: SaveInvoiceInput): ProjectInvoice | null {
  const e = findEngagement(input.engId)
  if (!e) return null
  const inv: ProjectInvoice = {
    id: `INV-${invoiceCounter}`,
    label: input.label || 'Invoice',
    amount: input.amount,
    date: input.date,
    status: 'unpaid',
    paidDate: null,
  }
  invoiceCounter += 1
  e.invoices.push(inv)

  if (input.kind === 'tm' && input.entryIds) {
    e.entries.forEach((x) => { if (input.entryIds!.includes(x.id)) x.invoiced = true })
  }
  if (input.kind === 'billing' && input.milestoneId && e.billing) {
    const m = e.billing.find(x => x.id === input.milestoneId)
    if (m) m.invId = inv.id
    syncBilling(e)
  }
  if (input.kind === 'output' && input.milestoneId && e.milestones) {
    const m = e.milestones.find(x => x.id === input.milestoneId)
    if (m) m.invId = inv.id
  }
  advanceStage(e.id, 'billing')
  persist()
  return inv
}

export function recordPayment(id: string, invId: string): void {
  const e = findEngagement(id)
  if (!e) return
  const inv = e.invoices.find(i => i.id === invId)
  if (inv) { inv.status = 'paid'; inv.paidDate = TODAY }
  syncBilling(e)
  persist()
}

export function closeEngagement(id: string, by?: string): boolean {
  const e = findEngagement(id)
  if (!e || !canClose(e)) return false
  e.stage = 'closed'
  e.closedAt = TODAY
  e.closedBy = by?.trim() || null
  persist()
  return true
}

export interface ExpenseDraftLine {
  id: string
  account: string
  description: string
  project: string
  hours: string
  tax: string
  amount: string
}

/**
 * Post an expense. Project is tagged PER LINE — one document can split cost across
 * several projects, and a line with no project posts normally with no project
 * association. Returns which projects were touched.
 */
export function saveExpense(input: { beneficiary: string; date: string; lines: ExpenseDraftLine[] }): { docNo: string; taggedIds: string[]; untagged: number } {
  const valid = input.lines.filter(l => Number(l.amount) > 0)
  const tagged = valid.filter(l => l.project)
  const docNo = `EXP-${1300 + Math.floor(Math.random() * 99)}`
  const taggedIds: string[] = []

  tagged.forEach((l) => {
    const e = findEngagement(l.project)
    if (!e) return
    const acct = l.account.toLowerCase()
    const category = acct.includes('material') ? 'Material' : acct.includes('subcontractor') ? 'Subcontractor' : 'Expense'
    e.entries.push(cost(
      category,
      l.description || l.account,
      input.beneficiary || 'Unnamed vendor',
      input.date,
      Number(l.amount),
      'Expense',
      docNo,
      e.markupPct || 0,
      null,
      false,
      Number(l.hours) || null,
    ))
    if (!taggedIds.includes(e.id)) taggedIds.push(e.id)
  })

  persist()
  return { docNo, taggedIds, untagged: valid.length - tagged.length }
}

/** Projects selectable on a transaction line — closed projects are not taggable. */
export function projectOptions(): { id: string; name: string }[] {
  return [{ id: '', name: 'No project' }, ...engagements.filter(e => e.stage !== 'closed').map(e => ({ id: e.id, name: e.name }))]
}

// ── Portfolio-level rollups (index page stats) ───────────────────────────────

export function portfolioTotals() {
  return {
    revenue: engagements.reduce((a, e) => a + revenue(e), 0),
    cost: engagements.reduce((a, e) => a + actualCost(e), 0),
    outstanding: engagements.reduce((a, e) => a + e.invoices.filter(i => i.status === 'unpaid').reduce((b, i) => b + i.amount, 0), 0),
    pendingAddenda: engagements.reduce((a, e) => a + pendingVos(e).length, 0),
  }
}


// ── Approvals, status, close/reopen ─────────────────────────────────────────

/** Engine action → the wire action_type check_approval_required expects. */
const ACTION_TYPE: Record<ProjectApprovalAction, ProjectActionType> = {
  'project-creation': 'project.creation',
  addendum: 'project.variation_order',
  'milestone-verification': 'project.milestone_verification',
}

interface MatchedRule { ruleId: string; ruleName: string; approvers: string[] }

function userName(id: string): string | null {
  return users.find(u => u.id === id)?.name ?? null
}

/** The Settings › Approval workflows rule that gates this action, with approver names. */
function matchRule(action: ProjectApprovalAction, amount: number | null, projectId: string | null): MatchedRule | null {
  const res = check_approval_required(ACTION_TYPE[action], amount, projectId)
  if (!res.approval_required || !res.rule_id) return null
  const rule = approvalWorkflows.find(r => r.id === res.rule_id)
  const names: string[] = []
  res.approval_levels.forEach(l => l.approver_ids.forEach((uid) => {
    const n = userName(uid)
    if (n && !names.includes(n)) names.push(n)
  }))
  return { ruleId: res.rule_id, ruleName: rule?.name ?? res.rule_id, approvers: names }
}

function newApproval(action: ProjectApprovalAction, refId: string | null, rule: MatchedRule, amount: number | null, submittedBy: string,
  verification: MilestoneVerificationInput | null = null): PendingApproval {
  return {
    id: uid('apr'), action, refId, ruleId: rule.ruleId, ruleName: rule.ruleName, amount,
    submittedBy, submittedAt: TODAY, approvers: rule.approvers, verification,
    rejectedBy: null, rejectReason: null, rejectedAt: null,
  }
}

function logDecision(e: Engagement, a: PendingApproval, decision: 'approved' | 'rejected', by: string, reason: string | null): void {
  e.approvalLog = [...(e.approvalLog ?? []), {
    approvalId: a.id, action: a.action, refId: a.refId, decision, by, date: TODAY, submittedBy: a.submittedBy, reason,
  }]
}

function dropApproval(e: Engagement, approvalId: string): void {
  e.approvals = (e.approvals ?? []).filter(x => x.id !== approvalId)
}

/** Re-derive every billing-schedule row from its linked invoice (billingStatusOf is the truth). */
function syncBilling(e: Engagement): void {
  e.billing?.forEach((b) => {
    const inv = b.invId ? e.invoices.find(i => i.id === b.invId) : undefined
    b.status = billingStatusOf(e, b)
    b.paidDate = inv?.status === 'paid' ? inv.paidDate : null
  })
}

/** Pending approval while a project-creation request is open (or was rejected); then In progress / Closed. */
export function projectStatusKey(e: Engagement): ProjectStatusKey {
  const creation = (e.approvals ?? []).find(a => a.action === 'project-creation')
  if (creation) return creation.rejectedBy ? 'rejected' : 'pending approval'
  return e.closedAt ? 'closed' : 'in progress'
}

export function projectStatusLabel(e: Engagement): string {
  return { 'pending approval': 'Pending approval', rejected: 'Rejected', 'in progress': 'In progress', closed: 'Closed' }[projectStatusKey(e)]
}

/** Approval request gating a record, if one is open. */
export function approvalFor(e: Engagement, action: ProjectApprovalAction, refId: string | null): PendingApproval | undefined {
  return (e.approvals ?? []).find(a => a.action === action && a.refId === refId)
}

/** Can `user` decide this request? Blocks self-approval, non-approvers and already-rejected requests. */
export function canDecide(a: PendingApproval, user: string): { ok: boolean; reason: string } {
  if (a.rejectedBy) return { ok: false, reason: `Rejected by ${a.rejectedBy}` }
  if (a.submittedBy === user) {
    const others = a.approvers.filter(n => n !== user)
    return { ok: false, reason: others.length ? `Waiting for ${others.join(', ')}` : 'You submitted this request, so another approver must decide it.' }
  }
  if (!a.approvers.includes(user)) return { ok: false, reason: `Waiting for ${a.approvers.join(', ') || 'an approver'}` }
  return { ok: true, reason: '' }
}

/** The most recent decision on a gated record (e.g. a rejected milestone verification and its reason). */
export function lastDecision(e: Engagement, action: ProjectApprovalAction, refId: string | null): ApprovalDecisionLog | undefined {
  return [...(e.approvalLog ?? [])].reverse().find(l => l.action === action && l.refId === refId)
}

function applyVerification(e: Engagement, mid: string, info: MilestoneVerificationInput): number {
  const amount = verifyMilestone(e.id, mid)
  const m = e.milestones?.find(x => x.id === mid)
  if (!amount || !m) return 0
  m.verifiedAt = info.date
  m.verifiedBy = info.verifiedBy.trim() || null
  m.document = info.document?.trim() || null
  return amount
}

/** Verify a milestone, or open an approval request when a Milestone verification rule matches. */
export function submitMilestoneVerification(id: string, mid: string, info: MilestoneVerificationInput, submittedBy: string):
  { status: 'verified'; amount: number } | { status: 'pending'; approval: PendingApproval } | { status: 'blocked' } {
  const e = findEngagement(id)
  const m = e?.milestones?.find(x => x.id === mid)
  if (!e || !m || m.verified || e.weightsNeedConfirm || e.closedAt) return { status: 'blocked' }
  if (approvalFor(e, 'milestone-verification', mid)) return { status: 'blocked' }
  const amount = Math.round((e.contractValue * m.pct) / 100)
  const rule = matchRule('milestone-verification', amount, e.id)
  if (rule) {
    const approval = newApproval('milestone-verification', mid, rule, amount, submittedBy.trim() || e.pm, {
      date: info.date, verifiedBy: info.verifiedBy.trim(), document: info.document?.trim() || null,
    })
    e.approvals = [...(e.approvals ?? []), approval]
    persist()
    return { status: 'pending', approval }
  }
  const done = applyVerification(e, mid, info)
  persist()
  return done ? { status: 'verified', amount: done } : { status: 'blocked' }
}

/**
 * Approve an open request and apply what it gated: verify the milestone with the
 * stored details, apply the addendum (approvedBy = approver), or start the project.
 * Refused (false) for the submitter, a non-approver, or an already-rejected request.
 */
export function approveRequest(id: string, approvalId: string, approver: string): boolean {
  const e = findEngagement(id)
  const a = e?.approvals?.find(x => x.id === approvalId)
  if (!e || !a || !canDecide(a, approver).ok) return false
  dropApproval(e, a.id)
  if (a.action === 'milestone-verification' && a.refId) {
    const info = a.verification ?? { date: TODAY, verifiedBy: a.submittedBy, document: null }
    if (!applyVerification(e, a.refId, info)) { e.approvals = [...(e.approvals ?? []), a]; return false }
  } else if (a.action === 'addendum' && a.refId) {
    const vo = e.vos.find(v => v.id === a.refId)
    if (!vo || vo.status !== 'Pending') { e.approvals = [...(e.approvals ?? []), a]; return false }
    applyAddendum(e, vo, approver)
  }
  // project-creation: removing the request is the approval; status becomes In progress.
  logDecision(e, a, 'approved', approver, null)
  persist()
  return true
}

/**
 * Reject an open request; reason is required. Addendum → Rejected with reason and
 * rejecter; milestone → stays unverified (reason kept in approvalLog, see lastDecision);
 * project creation → the project stays Pending approval with the rejection recorded on
 * the request (simpler than deleting a record the user may be looking at).
 */
export function rejectRequest(id: string, approvalId: string, approver: string, reason: string): boolean {
  const e = findEngagement(id)
  const a = e?.approvals?.find(x => x.id === approvalId)
  const why = reason.trim()
  if (!e || !a || !why || !canDecide(a, approver).ok) return false
  if (a.action === 'project-creation') {
    a.rejectedBy = approver
    a.rejectReason = why
    a.rejectedAt = TODAY
  } else {
    dropApproval(e, a.id)
    if (a.action === 'addendum') {
      const vo = e.vos.find(v => v.id === a.refId)
      if (vo) { vo.status = 'Rejected'; vo.rejectedBy = approver; vo.rejectReason = why }
    }
  }
  logDecision(e, a, 'rejected', approver, why)
  persist()
  return true
}

/** Final figures shown in the close confirmation. */
export function closeSummary(e: Engagement): { revenue: number; cost: number; margin: number; marginPct: number | null } {
  const r = revenue(e)
  const c = actualCost(e)
  return { revenue: r, cost: c, margin: r - c, marginPct: r > 0 ? ((r - c) / r) * 100 : null }
}

/** Who may reopen a closed project: approvers only (Owner / Finance). */
export function canReopen(user: string): boolean {
  const names = new Set<string>()
  approvalWorkflows
    .filter(r => r.isActive && r.appliesTo === 'project')
    .forEach(r => r.levels.forEach(l => l.approverIds.forEach((id) => { const n = userName(id); if (n) names.add(n) })))
  return names.has(user)
}

/** Reopen a closed project (audit-logged). Reason is required; the project returns to Invoices & payments. */
export function reopenEngagement(id: string, by: string, reason: string): boolean {
  const e = findEngagement(id)
  const why = reason.trim()
  if (!e || !e.closedAt || !why || !canReopen(by)) return false
  e.reopenLog = [...(e.reopenLog ?? []), { date: TODAY, by: by.trim() || 'Unknown user', reason: why }]
  e.stage = 'billing'
  e.closedAt = null
  e.closedBy = null
  persist()
  return true
}

/**
 * Projected margin at completion = contract value (fee estimate for Cost plus margin)
 * − the larger of budget and cost to date. null when there is no budget to project from.
 */
export function projectedMargin(e: Engagement): { value: number | null; pct: number | null } {
  if (e.budget === null) return { value: null, pct: null }
  const contract = e.method === 'tm' ? e.feeEstimate : e.contractValue
  const value = contract - Math.max(e.budget, actualCost(e))
  return { value, pct: contract > 0 ? (value / contract) * 100 : null }
}

/** Billing schedule status taken only from linked invoices. */
export function billingStatusOf(e: Engagement, b: BillingMilestone): BillingStatus {
  const inv = b.invId ? e.invoices.find(i => i.id === b.invId) : undefined
  if (!inv) return 'notdue'
  return inv.status === 'paid' ? 'paid' : 'invoiced'
}

/** Settings rule that would gate creating a project of this value, for the form hint. */
export function creationApprovalPreview(value: number): { ruleName: string; approvers: string[] } | null {
  if (!(value > 0)) return null
  const rule = matchRule('project-creation', value, null)
  return rule ? { ruleName: rule.ruleName, approvers: rule.approvers } : null
}

/** Settings rule that would gate verifying this milestone (for VerifyMilestoneModal needsApproval/approverNames). */
export function verificationApprovalPreview(e: Engagement, mid: string): { ruleName: string; approvers: string[] } | null {
  const m = e.milestones?.find(x => x.id === mid)
  if (!m) return null
  const rule = matchRule('milestone-verification', Math.round((e.contractValue * m.pct) / 100), e.id)
  return rule ? { ruleName: rule.ruleName, approvers: rule.approvers } : null
}

/** Settings rule that would gate an addendum to this value, for the addendum form hint. */
export function addendumApprovalPreview(e: Engagement, newValue: number): { ruleName: string; approvers: string[] } | null {
  const oldValue = e.method === 'tm' ? e.feeEstimate : e.contractValue
  const rule = matchRule('addendum', Math.abs(newValue - oldValue), e.id)
  return rule ? { ruleName: rule.ruleName, approvers: rule.approvers } : null
}

/** Contract (or fee estimate) value not yet invoiced; never negative. */
export function remainingToBill(e: Engagement): number {
  return Math.max(0, (e.method === 'tm' ? e.feeEstimate : e.contractValue) - billed(e))
}

/** A milestone can be invoiced only once verified and not already invoiced. */
export function milestoneBillable(e: Engagement, mid: string): boolean {
  const m = e.milestones?.find(x => x.id === mid)
  return !!m && m.verified && !m.invId
}

/**
 * Edit a rejected (or still pending) project and send it for approval again. The
 * old request is replaced; if the new value no longer matches a rule, the project
 * starts straight away. Only the person who submitted it may resubmit.
 */
export function resubmitEngagement(id: string, d: EngagementDraft, by: string): Engagement | null {
  const e = findEngagement(id)
  const old = e?.approvals?.find(a => a.action === 'project-creation')
  if (!e || !old || old.submittedBy !== by) return null
  const fresh = createEngagement(d, by)
  // createEngagement pushed a new record; fold it back into the original id.
  engagements.splice(engagements.indexOf(fresh), 1)
  const keep = { id: e.id, entries: e.entries, invoices: e.invoices, vos: e.vos, approvalLog: e.approvalLog ?? [] }
  // The new request (or none, under the threshold) replaces the rejected one.
  Object.assign(e, fresh, keep, { approvals: fresh.approvals ?? [] })
  persist()
  return e
}

/** Draft pre-filled from an existing project, for the resubmit form. */
export function draftFromEngagement(e: Engagement): EngagementDraft {
  const value = e.method === 'tm' ? e.feeEstimate : e.contractValue
  return {
    name: e.name, client: e.client, pm: e.pm, method: e.method,
    value: value ? String(value) : '', budget: e.budget === null ? '' : String(e.budget),
    budgetLineId: e.budgetLineId ?? '', team: [...e.team],
    markup: String(e.markupPct || 20),
    milestones: (e.milestones ?? []).map(m => ({ id: m.id, label: m.label, pct: String(m.pct) })),
    budgetLines: {
      revenue: (e.budgetLines?.revenue ?? [{ id: 'br1', account: REVENUE_ACCOUNT, amount: 0 }]).map(l => ({ id: l.id, account: l.account, amount: l.amount ? String(l.amount) : '' })),
      cost: (e.budgetLines?.cost ?? COST_ACCOUNTS.map((a, i) => ({ id: `bc${i}`, account: a, amount: 0 }))).map(l => ({ id: l.id, account: l.account, amount: l.amount ? String(l.amount) : '' })),
    },
  }
}

/** Put the sample projects back (prototype "Reset sample data"). */
export function resetProjectAccounting(): void {
  engagements.splice(0, engagements.length, ...seed())
  engagements.forEach(syncBilling)
  persist()
}
