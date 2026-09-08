import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import { findProject, projects, projectWorkPackages, type Project } from './projects'

/**
 * Project budget baseline + production monitoring — the two panels of the
 * project's Budget tab.
 *
 * Source: [PRD] Project MTO v5, §3 "Budget — node × account, maintained in a
 * separate module (D5, D7)" and Story 2.
 *
 * ── Two things this model deliberately encodes ────────────────────────────────
 *
 * 1 · The baseline is FROZEN and READ-ONLY here. An approved RAB/RAP plan is the
 *     baseline; creation and revision live in a separate budget-setup module. The
 *     project page never edits it. (That module does not exist yet — PRD v5
 *     records this as gap P4 — so the Budget tab links out and says so rather
 *     than quietly offering an edit affordance the spec forbids.)
 *
 * 2 · A missing budget is NOT a zero budget. `baselineAmount` is optional and the
 *     UI must render "Not set", never Rp 0.
 *
 * The plan carries two non-overlapping cost lines (D1): **Cost of production**,
 * which work orders consume and which absorbs ALL production cost, and **Direct
 * labour**, for non-production labour that still names a project. Work-order cost
 * appears only in the Cost of production line and never again in an ordinary
 * cost-account row, so no amount is counted twice (Story 13).
 *
 * Note on naming: the PRD resolves the COGM/Cost of production divergence in
 * favour of "Cost of production" as the ACCOUNT name (COGM stays prose only), so
 * that is the label stored here.
 */

// ─── Budget detail (P&L by account) ───────────────────────────────────────────

export interface ProjectBudgetLine {
  /** Chart-of-accounts code — postings are read by account code, never a bare name. */
  accountCode: string
  accountName: string
  /**
   * The approved baseline for this account. `undefined` means this account has
   * actuals but NO baseline line — an unbudgeted row, surfaced rather than
   * silently absorbed (Story 2).
   */
  baselineAmount?: number
  actual: number
  /** True for the single line work orders consume (D1). */
  isCostOfProduction?: boolean
}

export interface ProjectBudget {
  projectId: string
  /** Revenue figure from the approved RAB. */
  baselineRevenue: number
  /** Who approved the plan and when — accountability is visible, not implied. */
  approvedBy: string
  approvedAt: string
  /** The source plan documents, named so the baseline is traceable. */
  sourceDocuments: string[]
  lines: ProjectBudgetLine[]
}

/** A line with actuals but no baseline (Story 2) — rendered as a flagged row. */
export function isUnbudgeted(line: ProjectBudgetLine): boolean {
  return line.baselineAmount === undefined && line.actual > 0
}

/** Baseline − actual. Null for an unbudgeted line: there is nothing to vary against. */
export function lineVariance(line: ProjectBudgetLine): number | null {
  return line.baselineAmount === undefined ? null : line.baselineAmount - line.actual
}

export function budgetTotals(b: ProjectBudget): { baseline: number; actual: number; variance: number } {
  const baseline = b.lines.reduce((s, l) => s + (l.baselineAmount ?? 0), 0)
  const actual = b.lines.reduce((s, l) => s + l.actual, 0)
  return { baseline, actual, variance: baseline - actual }
}

// ─── Production monitoring ────────────────────────────────────────────────────

/** Derived from firm + realisation, per PRD §3. */
export type ProjectWorkOrderStatus = 'draft' | 'released' | 'in progress' | 'completed'

export interface ProjectWorkOrderLine {
  id: string
  /** Links to the real work-order detail page — /work-orders/:id. */
  workOrderId: string
  number: string
  workPackageId: string
  status: ProjectWorkOrderStatus
  /**
   * D7 — the baseline is the budget SET ASIDE on the work order, not its cost
   * estimate. Variance therefore reads actual against set-aside; estimating
   * accuracy is a different question and is not measured here.
   */
  budgetSetAside: number
  /** Kept alongside so both figures are visible, per Story 3. */
  costEstimate: number
  actual: number
  /** True once a completed WO's unused set-aside has been released (Story 3). */
  setAsideReleased?: boolean
  /** Recorded when the WO was saved over Available with a PM override (Story 6). */
  overrideReason?: string
}

/** Actual against the set-aside — never against the estimate (D7). */
export function workOrderVariance(wo: ProjectWorkOrderLine): number {
  return wo.budgetSetAside - wo.actual
}

// ─── Budget check (Stories 3 & 6) ─────────────────────────────────────────────

export interface BudgetCheck {
  /** The project's Cost of production baseline — the production budget pool. */
  total: number
  /** Consumed by other work orders, committed or posted. */
  committed: number
  /** total − committed. The gate uses exactly the figure it displays. */
  available: number
}

/**
 * The Step-1 gate figures for a work package.
 *
 * `Total − Committed = Available` must always hold on screen AND the gate must
 * use the same Available it displays (Story 3) — which is why one function
 * returns all three rather than the caller computing any of them separately.
 */
export function budgetCheckFor(projectId: string, excludeWorkOrderId?: string): BudgetCheck {
  const cop = findProjectBudget(projectId)?.lines.find(l => l.isCostOfProduction)
  const total = cop?.baselineAmount ?? 0
  // A completed WO whose unused set-aside was released no longer consumes the
  // pool — otherwise the Cost of production line stays apparently consumed after
  // the work is done (PRD §5, Story 3).
  const committed = workOrdersForProject(projectId)
    .filter(wo => wo.id !== excludeWorkOrderId)
    .reduce((s, wo) => s + (wo.setAsideReleased ? wo.actual : wo.budgetSetAside), 0)
  return { total, committed, available: total - committed }
}

/** The verdict a requested set-aside gets against the gate (Stories 3 & 6). */
export type GateVerdict =
  /** Within Available — proceed, nothing to record. */
  | { kind: 'ok'; available: number }
  /** Over Available but at/under the threshold — the PM may override with a reason. */
  | { kind: 'override'; excess: number; available: number }
  /** Over Available AND over the threshold — held for Finance sign-off. */
  | { kind: 'escalate'; excess: number; available: number; thresholdPct: number }

/**
 * Phase 1 ships warn + override with a mandatory reason for every document type;
 * hard block is deferred (D6). The honest framing: the promise is not "commitments
 * cannot exceed budget" but "no budget overrun goes unrecorded".
 *
 * At or under the effective threshold the PM overrides with a reason; above it the
 * document is held for Finance and appears in the Approvals inbox.
 */
export function evaluateGate(requested: number, check: BudgetCheck, thresholdPct: number): GateVerdict {
  if (requested <= check.available) return { kind: 'ok', available: check.available }
  const excess = requested - check.available
  // The threshold is a percentage of the pool being drawn on, not of the request.
  const allowance = (check.total * thresholdPct) / 100
  return excess <= allowance
    ? { kind: 'override', excess, available: check.available }
    : { kind: 'escalate', excess, available: check.available, thresholdPct }
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

function buildBudgetSeed(): ProjectBudget[] {
  return [
    {
      projectId: 'ps-2603',
      baselineRevenue: 4_312_000_000,
      approvedBy: 'Sari Wulandari',
      approvedAt: '2026-06-09',
      sourceDocuments: ['RAB Tronton Dump Body 12 unit', 'RAP-2603 rev.1'],
      lines: [
        { accountCode: '5-10000', accountName: 'Cost of production', baselineAmount: 3_205_000_000, actual: 1_480_000_000, isCostOfProduction: true },
        { accountCode: '5-20000', accountName: 'Direct labour',       baselineAmount: 280_000_000,   actual: 172_400_000 },
        { accountCode: '6-10000', accountName: 'Site overhead',       baselineAmount: 120_000_000,   actual: 68_900_000 },
        // Actuals landed on an account the approved plan never carried — flagged,
        // never folded into another line (Story 2).
        { accountCode: '6-40000', accountName: 'Freight & handling',  baselineAmount: undefined,     actual: 27_600_000 },
      ],
    },
    {
      projectId: 'ps-2604',
      // The real IPB figures named in the PRD: RAP Rp528.035.550 + 10%
      // contingency Rp52.803.555. That contingency line is field confirmation of
      // the Level-2 Reserve concept.
      baselineRevenue: 835_227_502,
      approvedBy: 'Sari Wulandari',
      approvedAt: '2026-07-18',
      sourceDocuments: ['RAB_IPB_Pascasarjana.pdf', 'RAP_Pasca_sarjana.pdf'],
      lines: [
        { accountCode: '5-10000', accountName: 'Cost of production', baselineAmount: 0,           actual: 0, isCostOfProduction: true },
        { accountCode: '5-20000', accountName: 'Direct labour',      baselineAmount: 214_800_000, actual: 118_300_000 },
        { accountCode: '5-30000', accountName: 'Subcontractor',      baselineAmount: 262_235_550, actual: 139_412_400 },
        { accountCode: '6-10000', accountName: 'Site overhead',      baselineAmount: 51_000_000,  actual: 11_200_000 },
        { accountCode: '6-90000', accountName: 'Contingency (10%)',  baselineAmount: 52_803_555,  actual: 0 },
      ],
    },
    {
      projectId: 'ps-2606',
      baselineRevenue: 264_000_000,
      approvedBy: 'Sari Wulandari',
      approvedAt: '2026-01-12',
      sourceDocuments: ['RAP retainer audit 2026'],
      lines: [
        { accountCode: '5-10000', accountName: 'Cost of production', baselineAmount: 0,           actual: 0, isCostOfProduction: true },
        { accountCode: '5-20000', accountName: 'Direct labour',      baselineAmount: 176_000_000, actual: 112_400_000 },
        { accountCode: '6-10000', accountName: 'Site overhead',      baselineAmount: 22_000_000,  actual: 9_100_000 },
      ],
    },
    {
      projectId: 'ps-2602',
      baselineRevenue: 2_180_000_000,
      approvedBy: 'Sari Wulandari',
      approvedAt: '2026-03-16',
      sourceDocuments: ['RAB Box Pendingin 6 unit', 'RAP-2602'],
      lines: [
        { accountCode: '5-10000', accountName: 'Cost of production', baselineAmount: 1_540_000_000, actual: 1_698_000_000, isCostOfProduction: true },
        { accountCode: '5-20000', accountName: 'Direct labour',      baselineAmount: 168_000_000,   actual: 94_600_000 },
        { accountCode: '6-10000', accountName: 'Site overhead',      baselineAmount: 52_000_000,    actual: 23_400_000 },
      ],
    },
    {
      projectId: 'ps-2601',
      baselineRevenue: 1_120_000_000,
      approvedBy: 'Sari Wulandari',
      approvedAt: '2026-01-26',
      sourceDocuments: ['RAP-2601'],
      lines: [
        { accountCode: '5-10000', accountName: 'Cost of production', baselineAmount: 760_000_000, actual: 748_200_000, isCostOfProduction: true },
        { accountCode: '5-20000', accountName: 'Direct labour',      baselineAmount: 98_000_000,  actual: 91_800_000 },
        { accountCode: '6-10000', accountName: 'Site overhead',      baselineAmount: 32_000_000,  actual: 31_400_000 },
      ],
    },
    // PS-2605 is deliberately absent: a draft project with no approved plan yet.
    // Its Budget tab must render "not set" — proving a missing budget is a real
    // state, not a zero.
  ]
}

function buildWorkOrderSeed(): ProjectWorkOrderLine[] {
  return [
    {
      id: 'pwo-1', workOrderId: 'wo-5', number: 'WO-2026-0005', workPackageId: 'wp-2603-2',
      status: 'in progress', budgetSetAside: 890_000_000, costEstimate: 842_500_000, actual: 842_000_000,
    },
    {
      id: 'pwo-2', workOrderId: 'wo-9', number: 'WO-2026-0009', workPackageId: 'wp-2603-1',
      status: 'completed', budgetSetAside: 660_000_000, costEstimate: 631_000_000, actual: 638_000_000,
      setAsideReleased: true,
    },
    {
      id: 'pwo-3', workOrderId: 'wo-1', number: 'WO-2026-0001', workPackageId: 'wp-2603-4',
      status: 'draft', budgetSetAside: 180_000_000, costEstimate: 196_400_000, actual: 0,
    },
    {
      id: 'pwo-4', workOrderId: 'wo-13', number: 'WO-2026-0013', workPackageId: 'wp-2602-1',
      status: 'completed', budgetSetAside: 1_060_000_000, costEstimate: 1_012_000_000, actual: 1_124_000_000,
      setAsideReleased: true,
      overrideReason: 'Harga plat baja naik 14% setelah PO vendor utama dibatalkan.',
    },
    {
      id: 'pwo-5', workOrderId: 'wo-17', number: 'WO-2026-0017', workPackageId: 'wp-2602-2',
      status: 'in progress', budgetSetAside: 640_000_000, costEstimate: 618_000_000, actual: 692_000_000,
    },
    {
      id: 'pwo-6', workOrderId: 'wo-21', number: 'WO-2026-0021', workPackageId: 'wp-2601-1',
      status: 'completed', budgetSetAside: 780_000_000, costEstimate: 764_000_000, actual: 748_200_000,
      setAsideReleased: true,
    },
  ]
}

const budgetSnapshot = loadSnapshot<ProjectBudget>('projectBudgets')
export const projectBudgets = reactive<ProjectBudget[]>(budgetSnapshot ?? buildBudgetSeed())

const projectWoSnapshot = loadSnapshot<ProjectWorkOrderLine>('projectWorkOrders')
export const projectWorkOrders = reactive<ProjectWorkOrderLine[]>(projectWoSnapshot ?? buildWorkOrderSeed())

export function persistProjectBudgets(): void {
  saveSnapshot('projectBudgets', projectBudgets)
}
export function persistProjectWorkOrders(): void {
  saveSnapshot('projectWorkOrders', projectWorkOrders)
}

export function findProjectBudget(projectId: string): ProjectBudget | undefined {
  return projectBudgets.find(b => b.projectId === projectId)
}

/** Which project a work package belongs to. */
export function projectOfWorkPackage(workPackageId: string): Project | undefined {
  return projects.find(p => projectWorkPackages(p).some(wp => wp.id === workPackageId))
}

export function workOrdersForProject(projectId: string): ProjectWorkOrderLine[] {
  const project = findProject(projectId)
  if (!project) return []
  const wpIds = new Set(projectWorkPackages(project).map(wp => wp.id))
  return projectWorkOrders.filter(wo => wpIds.has(wo.workPackageId))
}

export function addProjectWorkOrder(line: Omit<ProjectWorkOrderLine, 'id'>): ProjectWorkOrderLine {
  const wo: ProjectWorkOrderLine = { ...line, id: `pwo-new-${projectWorkOrders.length + 1}` }
  projectWorkOrders.unshift(wo)
  persistProjectWorkOrders()
  return wo
}
