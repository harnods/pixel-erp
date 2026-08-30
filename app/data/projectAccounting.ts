import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'

/**
 * Project accounting — engagements that earn revenue over time.
 *
 * Ported from the "Project Accounting" Claude Design prototype. The whole module
 * hangs off one idea: an engagement declares HOW it earns, and that choice picks
 * the recognition engine used for the rest of its life.
 *
 *   tm     — Input by Simplified Cost. Revenue = allowed cost × (1 + agreed margin).
 *            No percentage of progress; the client reimburses cost and pays a margin.
 *            (What accountants call cost-plus.) Consulting, audit, retainers.
 *   input  — Input by Cost. Progress = cost spent ÷ cost planned; revenue = that
 *            percentage × contract value. Billing runs on its own schedule, and the
 *            gap is reported as unbilled (asset) or overbilled (liability).
 *   output — Output by Milestone. Revenue arrives only when a weighted milestone is
 *            physically verified. Verifying earns AND queues its invoice.
 *
 * Two rules drive most of the surprising behaviour here:
 *
 *   1. The contract is FROZEN at creation. It is never edited in place — a revised
 *      value is an append-only, dated addendum that Finance approves separately from
 *      the PM who raised it. Rejected addenda stay on the list on purpose.
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
  /** Catch-up recognized in the current period at approval. */
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
  budgetLines: BudgetLines | null
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
}

/**
 * The prototype's "today". Fixed rather than `new Date()` so the seed's ageing
 * buckets (0–30 / 31–60 / 61–90 / 90+ days) and every test stay deterministic —
 * a drifting clock would silently reshuffle which lines look overdue.
 */
export const TODAY = '2026-08-03'

export const COST_ACCOUNTS = [
  '5-10000 Cost of materials',
  '5-10001 Subcontractor expense',
  '6-10001 Direct labour',
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
 * engagement buys hours. The plan is frozen at Setup — it is a baseline, so a
 * later addendum never restates it.
 */
const BUILD_PLAN: [string, number][] = [
  ['5-10000 Cost of materials', 0.45],
  ['5-10001 Subcontractor expense', 0.30],
  ['6-10001 Direct labour', 0.15],
  ['6-10002 Site expense', 0.10],
]
const SERVICE_PLAN: [string, number][] = [
  ['6-10001 Direct labour', 0.85],
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
    budgetLines: null,
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
        cost('Labour', 'Rina Wulandari — audit fieldwork', 'Internal payroll', '2026-07-05', 5_700_000, 'Expense', 'EXP-1102', 20, null, false, 15),
        cost('Labour', 'Yoga Prasetyo — tax position review', 'Internal payroll', '2026-06-28', 1_500_000, 'Expense', 'EXP-1088', 20, null, false, 6),
        cost('Labour', 'Rina Wulandari — audit fieldwork', 'Internal payroll', '2026-06-15', 3_040_000, 'Expense', 'EXP-1071', 20, null, false, 8),
        cost('Labour', 'Rina Wulandari — opening balance testing', 'Internal payroll', '2026-05-10', 4_560_000, 'Expense', 'EXP-1024', 20, null, false, 12),
        cost('Labour', 'Made Ardika — schedule preparation', 'Internal payroll', '2026-04-20', 2_000_000, 'Expense', 'EXP-0991', 20, null, false, 10),
      ],
    }),
    baseEngagement({
      id: 'e2', name: 'Annual Tax Consulting', client: 'CV Makmur Jaya', pm: 'Yoga Prasetyo',
      method: 'tm', markupPct: 20, stage: 'execution', feeEstimate: 60_000_000, budget: 28_000_000,
      entries: [
        cost('Labour', 'Yoga Prasetyo — annual return preparation', 'Internal payroll', '2026-07-22', 2_250_000, 'Expense', 'EXP-1178', 20, null, false, 9),
        cost('Labour', 'Yoga Prasetyo — tax reconciliation', 'Internal payroll', '2026-06-30', 2_750_000, 'Expense', 'EXP-1090', 20, null, false, 11),
        cost('Labour', 'Dewi Kusuma — document collation', 'Internal payroll', '2026-06-10', 1_050_000, 'Expense', 'EXP-1065', 20, null, false, 7),
      ],
    }),
    baseEngagement({
      id: 'e3', name: 'Monthly Retainer', client: 'PT Global Teknindo', pm: 'Made Ardika',
      method: 'tm', markupPct: 20, stage: 'billing', feeEstimate: 25_000_000, budget: null,
      entries: [
        cost('Labour', 'Made Ardika — monthly bookkeeping', 'Internal payroll', '2026-07-05', 4_000_000, 'Expense', 'EXP-1105', 20, 'bill', true, 20),
        cost('Labour', 'Dewi Kusuma — payroll processing', 'Internal payroll', '2026-07-10', 1_800_000, 'Expense', 'EXP-1112', 20, 'bill', true, 12),
        cost('Labour', 'Made Ardika — monthly bookkeeping', 'Internal payroll', '2026-07-26', 1_200_000, 'Expense', 'EXP-1190', 20, null, false, 6),
        cost('Labour', 'Dewi Kusuma — VAT filing', 'Internal payroll', '2026-07-18', 750_000, 'Expense', 'EXP-1175', 20, null, false, 5),
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
      billing: [
        { id: 'b1', label: 'Down payment (30%)', pct: 30, status: 'paid', invId: null, paidDate: '2026-07-10' },
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
        cost('Labour', 'Dewi Kusuma — event coordination', 'Internal payroll', '2026-07-01', 2_400_000, 'Expense', 'EXP-1150', 0, null, false, 16),
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
    }),
  ])
}

const KEY = 'project-accounting-v1'
const snap = loadSnapshot<Engagement>(KEY)
export const engagements = reactive<Engagement[]>(snap ?? seed())

function persist(): void { saveSnapshot(KEY, engagements) }

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
  return { tm: 'Input by Simplified Cost', input: 'Input by Cost', output: 'Output by Milestone' }[m]
}

export function methodFormal(m: RecognitionMethod): string {
  return {
    tm: 'Cost incurred plus agreed margin',
    input: 'Cost spent ÷ cost planned',
    output: 'Verified milestones, each weighted',
  }[m]
}

export const STAGES: { key: EngagementStage; label: string; sub: string }[] = [
  { key: 'setup', label: 'Setup & contract', sub: 'Recognition method, cost budget, contract history' },
  { key: 'execution', label: 'Costs', sub: 'Every cost tagged to this project' },
  { key: 'recognition', label: 'Revenue recognition', sub: 'How the work becomes recognised revenue' },
  { key: 'billing', label: 'Invoices & payments', sub: 'Sent to the client, and collected' },
  { key: 'closed', label: 'Project health', sub: 'Budget variance, margin, closing' },
]

export function stageIndex(k: EngagementStage): number {
  return STAGES.findIndex(s => s.key === k)
}

/**
 * Lifecycle status is deliberately separate from the tab labels — renaming a tab
 * must not rename a status.
 */
export function lifecycleLabel(k: EngagementStage): string {
  return { setup: 'Setup', execution: 'In progress', recognition: 'In progress', billing: 'Billing', closed: 'Closed' }[k]
}

export function daysAgo(date: string, today: string = TODAY): number {
  return Math.round((new Date(today).getTime() - new Date(date).getTime()) / 86_400_000)
}

/** Cost + the agreed margin — what the client could be charged if the line is allowed. */
export function entryAmount(e: CostEntry): number {
  return Math.round(e.amount * (1 + (e.markupPct || 0) / 100))
}

/** What the client is actually charged, once reviewed. */
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
 * Revenue recognised to date. One function, three engines — this is the single
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

/** Net position: positive = unbilled (asset), negative = overbilled (liability). */
export function wipNet(e: Engagement): number {
  return revenue(e) - billed(e)
}

export function canClose(e: Engagement): boolean {
  if (pendingVos(e).length) return false
  const invoicesOk = e.invoices.length > 0 && e.invoices.every(i => i.status === 'paid')
  if (e.method === 'tm') return e.entries.every(x => x.decision) && readyToInvoice(e).length === 0 && invoicesOk
  if (e.method === 'input') return pocPct(e) >= 100 && invoicesOk && (e.billing ?? []).every(m => m.status === 'paid')
  return (e.milestones ?? []).every(m => m.verified) && invoicesOk
}

export function closeHint(e: Engagement): string {
  if (pendingVos(e).length) return 'Every addendum must be approved or rejected before closing.'
  if (canClose(e)) return 'Recognition final, every invoice collected, no open addendum.'
  if (e.method === 'tm') return 'Review every worked line, invoice it, and collect every invoice first.'
  if (e.method === 'input') return '% complete must reach 100 and every milestone invoice must be paid.'
  return 'Every milestone must be verified and every invoice collected.'
}

/** Unbilled worked value by age — a collection risk, not a recognition question. */
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
  if (x.category === 'Labour') return '6-10001 Direct labour'
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
  budget: number | null
  actual: number
  variance: number | null
  pct: number | null
  /** true when the variance is unfavourable (over budget / below plan). */
  adverse: boolean
  note: string
  kind: 'revenue' | 'cost' | null
}

/**
 * Budget variance — same shape as the Financials budget-variance report, scoped to
 * one project. Cost variance is favourable when budget exceeds actual; revenue
 * variance is favourable the other way round.
 */
export function budgetReport(e: Engagement): BudgetReportRow[] {
  const b = budgetOf(e)
  const hasBudget = e.budget !== null
  const recognized = revenue(e)
  const revTotalBudget = b.revenue.reduce((a, l) => a + l.amount, 0)
  const rows: BudgetReportRow[] = []

  const mk = (label: string, bud: number, act: number, kind: 'revenue' | 'cost'): BudgetReportRow => {
    const measurable = hasBudget || kind === 'revenue'
    if (!measurable) {
      return { label, budget: null, actual: act, variance: null, pct: null, adverse: false, note: '', kind }
    }
    const variance = kind === 'cost' ? bud - act : act - bud
    return {
      label,
      budget: bud,
      actual: act,
      variance,
      pct: bud > 0 ? (variance / bud) * 100 : null,
      adverse: variance < 0,
      note: variance < 0 ? (kind === 'cost' ? 'Over budget' : 'Below plan') : '',
      kind,
    }
  }

  rows.push({ label: 'Revenue', header: true, budget: null, actual: 0, variance: null, pct: null, adverse: false, note: '', kind: null })
  b.revenue.forEach((l, i) => {
    const share = revTotalBudget > 0 ? l.amount / revTotalBudget : (i === 0 ? 1 : 0)
    rows.push(mk(l.account, l.amount, Math.round(recognized * share), 'revenue'))
  })
  rows.push({ ...mk('Total revenue', revTotalBudget, recognized, 'revenue'), total: true })

  rows.push({ label: 'Project cost', header: true, budget: null, actual: 0, variance: null, pct: null, adverse: false, note: '', kind: null })
  let costActualTotal = 0
  b.cost.forEach((l) => {
    const act = e.entries.filter(x => accountForEntry(x) === l.account).reduce((a, x) => a + x.amount, 0)
    costActualTotal += act
    rows.push(mk(l.account, l.amount, act, 'cost'))
  })
  const costBudgetTotal = b.cost.reduce((a, l) => a + l.amount, 0)
  rows.push({ ...mk('Total project cost', costBudgetTotal, costActualTotal, 'cost'), total: true })

  const gpBudget = revTotalBudget - costBudgetTotal
  const gpActual = recognized - costActualTotal
  const gp: BudgetReportRow = hasBudget
    ? { ...mk('Gross margin', gpBudget, gpActual, 'revenue'), total: true }
    : { label: 'Gross margin', budget: null, actual: gpActual, variance: null, pct: null, adverse: false, note: '', kind: null, total: true }
  rows.push(gp)

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
  markup: string
  milestones: DraftMilestone[]
  budgetLines: { revenue: { id: string; account: string; amount: string }[]; cost: { id: string; account: string; amount: string }[] }
}

export function draftWeightSum(d: EngagementDraft): number {
  return d.milestones.reduce((s, m) => s + (Number(m.pct) || 0), 0)
}

export function createEngagement(d: EngagementDraft): Engagement {
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
    pm: d.pm.trim() || 'Unassigned',
    method: d.method,
    stage: 'execution',
    feeEstimate: d.method === 'tm' ? Number(d.value) || 0 : 0,
    contractValue: d.method === 'tm' ? 0 : Number(d.value) || 0,
    markupPct: d.method === 'tm' ? (d.markup === '' ? 20 : Number(d.markup) || 0) : 0,
    // An itemised cost plan wins over the single estimated-cost figure.
    budget: costPlan > 0 ? costPlan : (d.budget === '' ? null : Number(d.budget) || 0),
    budgetLines: hasLines ? lines : null,
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

export function addAddendum(id: string, newValue: number, reason: string, distinct: boolean): void {
  const e = findEngagement(id)
  if (!e) return
  const oldValue = e.method === 'tm' ? e.feeEstimate : e.contractValue
  e.vos.push({
    id: uid('v'),
    date: TODAY,
    reason: reason.trim(),
    oldValue,
    newValue,
    status: 'Pending',
    distinct,
    raisedBy: `${e.pm} · Project Manager`,
    approvedBy: null,
    adjustment: 0,
  })
  persist()
}

/**
 * Approve an addendum. The contract value moves here — and PSAK 72's distinct test
 * decides what happens to revenue already recognized:
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
export function approveAddendum(id: string, voId: string): void {
  const e = findEngagement(id)
  if (!e) return
  const vo = e.vos.find(v => v.id === voId)
  if (!vo) return

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
  vo.approvedBy = 'Anggun Prakoso · Finance Controller'
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
  persist()
}

export function rejectAddendum(id: string, voId: string): void {
  const e = findEngagement(id)
  const vo = e?.vos.find(v => v.id === voId)
  if (!vo) return
  vo.status = 'Rejected'
  persist()
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

/** Recognizes the milestone's share of contract value and queues it for billing. */
export function verifyMilestone(id: string, mid: string): number {
  const e = findEngagement(id)
  if (!e || !e.milestones || e.weightsNeedConfirm) return 0
  const m = e.milestones.find(x => x.id === mid)
  if (!m || m.verified) return 0
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
    if (m) { m.status = 'invoiced'; m.invId = inv.id }
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
  e.billing?.forEach((m) => {
    if (m.invId === invId) { m.status = 'paid'; m.paidDate = TODAY }
  })
  persist()
}

export function closeEngagement(id: string): boolean {
  const e = findEngagement(id)
  if (!e || !canClose(e)) return false
  e.stage = 'closed'
  e.closedAt = TODAY
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
 * association. Returns which engagements were touched.
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

/** Projects selectable on a transaction line — closed engagements are not taggable. */
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
