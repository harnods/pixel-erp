import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import { projectPhases, phaseWorkPackages, getWorkPackage } from './projects'

/**
 * Project budget baseline — node × account, maintained ONLY in the Budget setup
 * module (PRD §3, D5). The project page renders it read-only.
 *
 *   • Lines are amounts by GL account per work package, plus a revenue figure (RAB).
 *   • Phase Allocated = SUM(child work-package lines) — locked, never typed.
 *   • Phase Reserve   = the only free-text amount.
 *   • Phase Total     = Allocated + Reserve.
 *   • A missing budget is not a zero budget — it renders "not set".
 *
 * Two non-overlapping cost lines separate production from other labour (D1):
 * Cost of production (COGM, consumed by work orders) and Direct labour.
 */

export interface CostAccount {
  code: string
  name: string
  /** COGM is consumed only through work orders */
  role: 'cogm' | 'labour' | 'cost'
}

export const COST_ACCOUNTS: CostAccount[] = [
  { code: '5-50100', name: 'Cost of production', role: 'cogm' },
  { code: '5-50200', name: 'Direct labour', role: 'labour' },
  { code: '5-50300', name: 'Project materials', role: 'cost' },
  { code: '5-50400', name: 'Subcontractor', role: 'cost' },
  { code: '5-50500', name: 'Equipment rental', role: 'cost' },
  { code: '5-50600', name: 'Site overhead', role: 'cost' },
  { code: '5-50700', name: 'Scrap & rework', role: 'cost' },
]
export const COGM_ACCOUNT = '5-50100'
export const LABOUR_ACCOUNT = '5-50200'

export function accountName(code: string): string {
  return COST_ACCOUNTS.find(a => a.code === code)?.name ?? code
}

export interface BudgetLine { wpId: string; account: string; amount: number }

export interface BudgetRevisionChange { wpId?: string; phaseId?: string; account?: string; field: 'line' | 'reserve' | 'revenue'; from: number; to: number }

export interface BudgetRevision {
  id: string
  no: number
  date: string
  by: string
  reason: string
  source: 'manual' | 'change order' | 'engineering change' | 'overage'
  refNo?: string
  changes: BudgetRevisionChange[]
}

export interface ProjectBudget {
  projectId: string
  /** reference to the approved plan document (RAB/RAP) */
  planRef: string
  revenue: number
  approvedBy: string
  approvedAt: string
  lines: BudgetLine[]
  /** phaseId → reserve amount */
  reserves: Record<string, number>
  revisions: BudgetRevision[]
}

// ─── Seed (IPB real figures: RAP Rp528.035.550 + 10% Rp52.803.555 = Rp580.839.105) ──

const SEED: ProjectBudget[] = [
  {
    projectId: 'ps-2603',
    planRef: 'RAB_IPB_Pascasarjana.pdf · RAP_Pasca_sarjana.pdf',
    revenue: 835_227_502,
    approvedBy: 'Maya Kartika', approvedAt: '2026-04-02',
    lines: [
      { wpId: 'wp-2603-11', account: '5-50200', amount: 8_500_000 },
      { wpId: 'wp-2603-11', account: '5-50500', amount: 6_000_000 },
      { wpId: 'wp-2603-11', account: '5-50600', amount: 7_000_000 },
      { wpId: 'wp-2603-21', account: '5-50300', amount: 34_000_000 },
      { wpId: 'wp-2603-21', account: '5-50400', amount: 24_400_000 },
      { wpId: 'wp-2603-22', account: '5-50300', amount: 22_000_000 },
      { wpId: 'wp-2603-22', account: '5-50400', amount: 18_000_000 },
      { wpId: 'wp-2603-31', account: '5-50100', amount: 168_135_550 },
      { wpId: 'wp-2603-31', account: '5-50200', amount: 8_000_000 },
      { wpId: 'wp-2603-32', account: '5-50100', amount: 108_000_000 },
      { wpId: 'wp-2603-32', account: '5-50200', amount: 6_000_000 },
      { wpId: 'wp-2603-41', account: '5-50300', amount: 18_000_000 },
      { wpId: 'wp-2603-41', account: '5-50400', amount: 24_000_000 },
      { wpId: 'wp-2603-42', account: '5-50400', amount: 30_000_000 },
      { wpId: 'wp-2603-51', account: '5-50300', amount: 12_000_000 },
      { wpId: 'wp-2603-51', account: '5-50400', amount: 22_000_000 },
      { wpId: 'wp-2603-52', account: '5-50200', amount: 7_000_000 },
      { wpId: 'wp-2603-52', account: '5-50600', amount: 5_000_000 },
    ],
    // RAP's own "biaya tidak terhitung 10%" — field confirmation of the phase Reserve
    reserves: { 'ph-2603-1': 2_150_000, 'ph-2603-2': 9_840_000, 'ph-2603-3': 29_013_555, 'ph-2603-4': 7_200_000, 'ph-2603-5': 4_600_000 },
    revisions: [
      { id: 'rev-2603-1', no: 1, date: '2026-05-18', by: 'Maya Kartika', reason: 'Re-split civil works after site survey: flooring scope confirmed at 40 jt.', source: 'manual',
        changes: [{ wpId: 'wp-2603-22', account: '5-50300', field: 'line', from: 20_000_000, to: 22_000_000 }, { wpId: 'wp-2603-21', account: '5-50300', field: 'line', from: 36_000_000, to: 34_000_000 }] },
    ],
  },
  {
    projectId: 'ps-2604', planRef: 'Proposal fee PT Sinar Abadi', revenue: 120_000_000,
    approvedBy: 'Maya Kartika', approvedAt: '2026-05-04',
    lines: [
      { wpId: 'wp-2604-auto', account: '5-50200', amount: 70_000_000 },
      { wpId: 'wp-2604-auto', account: '5-50600', amount: 5_000_000 },
    ],
    reserves: {}, revisions: [],
  },
  {
    projectId: 'ps-2606', planRef: 'RAB/RAP Grand Kamala rev.1', revenue: 649_800_000,
    approvedBy: 'Maya Kartika', approvedAt: '2026-04-20',
    lines: [
      { wpId: 'wp-2606-11', account: '5-50100', amount: 286_300_000 },
      { wpId: 'wp-2606-11', account: '5-50200', amount: 8_000_000 },
      { wpId: 'wp-2606-12', account: '5-50100', amount: 132_000_000 },
      { wpId: 'wp-2606-12', account: '5-50200', amount: 4_000_000 },
      { wpId: 'wp-2606-21', account: '5-50400', amount: 36_000_000 },
      { wpId: 'wp-2606-21', account: '5-50200', amount: 12_000_000 },
      { wpId: 'wp-2606-21', account: '5-50600', amount: 8_000_000 },
    ],
    reserves: { 'ph-2606-1': 10_000_000 },
    revisions: [
      { id: 'rev-2606-1', no: 1, date: '2026-06-12', by: 'Maya Kartika', reason: 'Change order VO-2606-01: Top table solid surface (tipe A)', source: 'change order', refNo: 'VO-2606-01',
        changes: [{ wpId: 'wp-2606-11', account: '5-50100', field: 'line', from: 280_000_000, to: 286_300_000 }, { field: 'revenue', from: 640_000_000, to: 649_800_000 }] },
    ],
  },
  {
    projectId: 'ps-2601', planRef: 'Engagement letter Koperasi Sejahtera', revenue: 45_000_000,
    approvedBy: 'Maya Kartika', approvedAt: '2026-01-12',
    lines: [
      { wpId: 'wp-2601-auto', account: '5-50200', amount: 28_000_000 },
      { wpId: 'wp-2601-auto', account: '5-50600', amount: 2_000_000 },
    ],
    reserves: {}, revisions: [],
  },
  // PS-2605 intentionally has no budget — renders "not set"
]

const KEY = 'pm-budgets'
export const projectBudgets = reactive<ProjectBudget[]>(loadSnapshot<ProjectBudget>(KEY) ?? structuredClone(SEED))
export function persistBudgets(): void { saveSnapshot(KEY, projectBudgets) }

// ─── Selectors ──────────────────────────────────────────────────────────────────

export function getBudget(projectId: string): ProjectBudget | undefined {
  return projectBudgets.find(b => b.projectId === projectId)
}

/** Budget for one work package (all accounts, or one account). undefined = not set. */
export function wpBudget(wpId: string, account?: string): number | undefined {
  const wp = getWorkPackage(wpId)
  if (!wp) return undefined
  const b = getBudget(wp.projectId)
  if (!b) return undefined
  const lines = b.lines.filter(l => l.wpId === wpId && (!account || l.account === account))
  if (account && !lines.length) return undefined
  return lines.reduce((s, l) => s + l.amount, 0)
}

export function phaseAllocated(phaseId: string, projectId: string): number {
  const b = getBudget(projectId)
  if (!b) return 0
  const ids = new Set(phaseWorkPackages(phaseId).map(w => w.id))
  return b.lines.filter(l => ids.has(l.wpId)).reduce((s, l) => s + l.amount, 0)
}
export function phaseReserve(phaseId: string, projectId: string): number {
  return getBudget(projectId)?.reserves[phaseId] ?? 0
}
export function phaseTotal(phaseId: string, projectId: string): number {
  return phaseAllocated(phaseId, projectId) + phaseReserve(phaseId, projectId)
}

/** Total cost budget (allocated + reserves) for a project. undefined = not set. */
export function projectBudgetTotal(projectId: string): number | undefined {
  const b = getBudget(projectId)
  if (!b) return undefined
  return projectPhases(projectId).reduce((s, ph) => s + phaseTotal(ph.id, projectId), 0)
}

/** Baseline by account (project level), excluding reserves. */
export function budgetByAccount(projectId: string): Map<string, number> {
  const m = new Map<string, number>()
  for (const l of getBudget(projectId)?.lines ?? []) m.set(l.account, (m.get(l.account) ?? 0) + l.amount)
  return m
}

// ─── Mutations (Budget setup module only) ───────────────────────────────────────

export function setBudgetLine(projectId: string, wpId: string, account: string, amount: number): void {
  const b = getBudget(projectId)
  if (!b) return
  const line = b.lines.find(l => l.wpId === wpId && l.account === account)
  if (line) {
    if (amount) line.amount = amount
    else b.lines.splice(b.lines.indexOf(line), 1)
  } else if (amount) {
    b.lines.push({ wpId, account, amount })
  }
}

export function createBudget(data: Omit<ProjectBudget, 'revisions'>): ProjectBudget {
  const b: ProjectBudget = { ...data, revisions: [] }
  projectBudgets.push(b)
  persistBudgets()
  return b
}

export function addRevision(projectId: string, rev: Omit<BudgetRevision, 'id' | 'no'>): BudgetRevision | undefined {
  const b = getBudget(projectId)
  if (!b) return undefined
  const r: BudgetRevision = { ...rev, id: `rev-${Date.now().toString(36)}`, no: b.revisions.length + 1 }
  b.revisions.unshift(r)
  persistBudgets()
  return r
}
