import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import { getWorkPackage, getPhase, getProject, phaseWorkPackages, projectWorkPackages } from './projects'
import { COGM_ACCOUNT, wpBudget, phaseTotal, projectBudgetTotal, getBudget } from './projectBudgets'
import { projectPolicy } from './projectPolicy'

/**
 * Pegged cost — everything the project's Budget and Cost tracking tabs roll up.
 *
 *   • Cost lines come from real ERP documents (PR, PO, Expense, Timesheet,
 *     Purchase invoice) with the Project at line level (PRD §4, §9).
 *   • Production cost is absorbed ONLY through a work order into Cost of
 *     production / COGM (D1). A project WO's set-aside is its committed amount
 *     (D7); unused set-aside is released at completion.
 *   • Journal entries generated from a WO carry no project dimension —
 *     attribution is by document reference (see woJournal()).
 */

export type CostDocType = 'PR' | 'PO' | 'Purchase invoice' | 'Expense' | 'Timesheet'

export interface CostLine {
  id: string
  projectId: string
  wpId: string
  account: string
  docType: CostDocType
  docNo: string
  date: string
  description: string
  amount: number
  /** committed = open PR/PO; actual = posted */
  kind: 'committed' | 'actual'
  vendor?: string
  dimensions?: { branch?: string; department?: string; costCenter?: string; fundingSource?: string }
  /** scrap, consumables, factory overhead must be classified before counting toward actual */
  ambiguous?: 'scrap' | 'consumables' | 'factory overhead'
  classification?: 'project' | 'overhead'
  /** T&M billing (timesheets on a T&M project) */
  tm?: { hours: number; billRate: number; decision: 'pending' | 'bill' | 'write_down' | 'write_up'; billAmount?: number; invoiceNo?: string; person: string }
}

export type ProjectWoStatus = 'Draft' | 'Released' | 'In progress' | 'Completed'

export interface ProjectWoLine {
  kind: 'material' | 'labor' | 'overhead' | 'other'
  name: string
  qty: number
  unit: string
  unitCost: number
  /** standard estimate = qty × unitCost */
  estimate: number
  /** line budget (Story 18) — suggested, editable */
  budget: number
}

export interface ProjectWorkOrder {
  id: string
  number: string
  projectId: string
  wpId: string
  status: ProjectWoStatus
  qty: number
  unit: string
  /** budget set aside on Cost of production — the WO baseline and its committed amount (D7) */
  budgetSetAside: number
  /** standard cost estimate — named but not what's committed */
  estimate: number
  actual: number
  /** set-aside released on completion (setAside − actual) */
  released?: number
  customBomId?: string
  bomVersion?: number
  lines: ProjectWoLine[]
  createdAt: string
  createdBy: string
  completedAt?: string
  /** budget-check override when the set-aside exceeded available */
  override?: { reason: string; overBy: number; by: string }
}

/** A document created through the project flow (New document) — posted, held for Finance, or ordinary expense. */
export interface PeggedDocument {
  id: string
  docType: 'PR' | 'PO' | 'Expense' | 'Timesheet'
  docNo: string
  date: string
  vendor?: string
  /** posted = lines hit the project · held = waiting for Finance · ordinary = no project on any line · draft = MRP suggestion, never firm */
  status: 'posted' | 'held' | 'ordinary' | 'rejected' | 'draft'
  lines: { description: string; account: string; amount: number; wpId?: string }[]
  override?: { reason: string; by: string; overBy: number; overPct: number }
  createdBy: string
}

// ─── Seed ───────────────────────────────────────────────────────────────────────

let seq = 0
const cl = (l: Omit<CostLine, 'id'>): CostLine => ({ ...l, id: `cl-${++seq}` })
const IPB_DIM = { branch: 'Bogor', department: 'Project delivery', costCenter: 'CC-Interior', fundingSource: 'APBN' }

const SEED_LINES: CostLine[] = [
  // ── PS-2603 IPB ──
  cl({ projectId: 'ps-2603', wpId: 'wp-2603-11', account: '5-50200', docType: 'Timesheet', docNo: 'TS/2026/0412', date: '2026-04-20', description: 'Tim survei & mobilisasi (3 orang × 12 hari)', amount: 9_200_000, kind: 'actual', dimensions: IPB_DIM }),
  cl({ projectId: 'ps-2603', wpId: 'wp-2603-11', account: '5-50500', docType: 'Purchase invoice', docNo: 'PI/2026/0355', date: '2026-04-15', description: 'Sewa scaffolding & genset', amount: 6_000_000, kind: 'actual', vendor: 'CV Sarana Alat', dimensions: IPB_DIM }),
  cl({ projectId: 'ps-2603', wpId: 'wp-2603-11', account: '5-50600', docType: 'Expense', docNo: 'EXP/2026/0198', date: '2026-04-18', description: 'Direksi keet, listrik kerja, keamanan', amount: 8_100_000, kind: 'actual', dimensions: IPB_DIM }),
  cl({ projectId: 'ps-2603', wpId: 'wp-2603-21', account: '5-50300', docType: 'Purchase invoice', docNo: 'PI/2026/0402', date: '2026-05-06', description: 'Gypsum board, rangka hollow, compound', amount: 33_200_000, kind: 'actual', vendor: 'PT Jaya Gypsum', dimensions: IPB_DIM }),
  cl({ projectId: 'ps-2603', wpId: 'wp-2603-21', account: '5-50400', docType: 'Purchase invoice', docNo: 'PI/2026/0441', date: '2026-05-25', description: 'Mandor partisi & plafon (borongan)', amount: 24_400_000, kind: 'actual', vendor: 'CV Karya Plafon', dimensions: IPB_DIM }),
  cl({ projectId: 'ps-2603', wpId: 'wp-2603-22', account: '5-50300', docType: 'Purchase invoice', docNo: 'PI/2026/0428', date: '2026-05-14', description: 'Vinyl plank 3 mm 640 m²', amount: 21_300_000, kind: 'actual', vendor: 'PT Lantai Prima', dimensions: IPB_DIM }),
  cl({ projectId: 'ps-2603', wpId: 'wp-2603-22', account: '5-50400', docType: 'Purchase invoice', docNo: 'PI/2026/0450', date: '2026-05-28', description: 'Pemasangan vinyl (borongan)', amount: 18_000_000, kind: 'actual', vendor: 'CV Lantai Rapi', dimensions: IPB_DIM }),
  cl({ projectId: 'ps-2603', wpId: 'wp-2603-31', account: '5-50200', docType: 'Timesheet', docNo: 'TS/2026/0507', date: '2026-06-19', description: 'Supervisi pengiriman & penataan furnitur (non-produksi)', amount: 3_100_000, kind: 'actual', dimensions: IPB_DIM }),
  cl({ projectId: 'ps-2603', wpId: 'wp-2603-31', account: '5-50700', docType: 'Expense', docNo: 'EXP/2026/0266', date: '2026-06-17', description: 'Rework 6 meja — HPL terkelupas saat kirim', amount: 1_450_000, kind: 'actual', dimensions: IPB_DIM }),
  cl({ projectId: 'ps-2603', wpId: 'wp-2603-31', account: '5-50300', docType: 'Expense', docNo: 'EXP/2026/0271', date: '2026-06-22', description: 'Lem, amplas, thinner (consumables workshop)', amount: 850_000, kind: 'actual', ambiguous: 'consumables', dimensions: IPB_DIM }),
  cl({ projectId: 'ps-2603', wpId: 'wp-2603-32', account: '5-50200', docType: 'Timesheet', docNo: 'TS/2026/0511', date: '2026-06-23', description: 'Pengukuran ulang lemari tanam di lokasi', amount: 1_200_000, kind: 'actual', dimensions: IPB_DIM }),
  cl({ projectId: 'ps-2603', wpId: 'wp-2603-41', account: '5-50300', docType: 'PO', docNo: 'PO/2026/0588', date: '2026-06-18', description: 'Kabel NYM, MCB, armatur LED 180 titik', amount: 16_800_000, kind: 'committed', vendor: 'PT Terang Elektrik', dimensions: IPB_DIM }),
  cl({ projectId: 'ps-2603', wpId: 'wp-2603-41', account: '5-50400', docType: 'Purchase invoice', docNo: 'PI/2026/0512', date: '2026-06-24', description: 'Instalasi listrik termin 1 (40%)', amount: 9_600_000, kind: 'actual', vendor: 'CV Daya Instalasi', dimensions: IPB_DIM }),
  cl({ projectId: 'ps-2603', wpId: 'wp-2603-42', account: '5-50400', docType: 'PR', docNo: 'PR/2026/0213', date: '2026-06-09', description: 'Instalasi ducting & pipa refrigeran', amount: 31_500_000, kind: 'committed', dimensions: IPB_DIM }),

  // ── PS-2604 T&M service ──
  cl({ projectId: 'ps-2604', wpId: 'wp-2604-auto', account: '5-50200', docType: 'Timesheet', docNo: 'TS/2026/0431', date: '2026-05-29', description: 'Review SPT Tahunan badan — Mei', amount: 11_200_000, kind: 'actual', tm: { person: 'Dewi Lestari', hours: 32, billRate: 750_000, decision: 'bill', billAmount: 24_000_000, invoiceNo: 'INV/2026/1012' } }),
  cl({ projectId: 'ps-2604', wpId: 'wp-2604-auto', account: '5-50200', docType: 'Timesheet', docNo: 'TS/2026/0432', date: '2026-05-29', description: 'Rekonsiliasi PPN masukan — Mei', amount: 8_400_000, kind: 'actual', tm: { person: 'Fajar Nugroho', hours: 28, billRate: 600_000, decision: 'bill', billAmount: 16_800_000, invoiceNo: 'INV/2026/1012' } }),
  cl({ projectId: 'ps-2604', wpId: 'wp-2604-auto', account: '5-50200', docType: 'Timesheet', docNo: 'TS/2026/0520', date: '2026-06-26', description: 'Persiapan dokumen transfer pricing — Juni', amount: 12_600_000, kind: 'actual', tm: { person: 'Dewi Lestari', hours: 36, billRate: 750_000, decision: 'pending' } }),
  cl({ projectId: 'ps-2604', wpId: 'wp-2604-auto', account: '5-50200', docType: 'Timesheet', docNo: 'TS/2026/0521', date: '2026-06-26', description: 'Pendampingan pemeriksaan pajak — Juni', amount: 6_000_000, kind: 'actual', tm: { person: 'Fajar Nugroho', hours: 20, billRate: 600_000, decision: 'pending' } }),
  cl({ projectId: 'ps-2604', wpId: 'wp-2604-auto', account: '5-50200', docType: 'Timesheet', docNo: 'TS/2026/0522', date: '2026-06-26', description: 'Koreksi draf memo (rework internal)', amount: 2_100_000, kind: 'actual', tm: { person: 'Sari Wulandari', hours: 7, billRate: 500_000, decision: 'pending' } }),
  cl({ projectId: 'ps-2604', wpId: 'wp-2604-auto', account: '5-50600', docType: 'Expense', docNo: 'EXP/2026/0240', date: '2026-06-11', description: 'Transport & akomodasi pemeriksaan', amount: 1_750_000, kind: 'actual' }),

  // ── PS-2606 kitchen set ──
  cl({ projectId: 'ps-2606', wpId: 'wp-2606-21', account: '5-50400', docType: 'Purchase invoice', docNo: 'PI/2026/0498', date: '2026-06-20', description: 'Tukang instalasi kitchen set (18 unit)', amount: 14_000_000, kind: 'actual', vendor: 'CV Pasang Rapi' }),
  cl({ projectId: 'ps-2606', wpId: 'wp-2606-21', account: '5-50200', docType: 'Timesheet', docNo: 'TS/2026/0490', date: '2026-06-20', description: 'Supervisi instalasi Tower B', amount: 5_000_000, kind: 'actual' }),
  cl({ projectId: 'ps-2606', wpId: 'wp-2606-11', account: '5-50700', docType: 'Expense', docNo: 'EXP/2026/0231', date: '2026-06-05', description: 'Sisa potongan multiplek (scrap)', amount: 620_000, kind: 'actual', ambiguous: 'scrap' }),

  // ── PS-2601 closed ──
  cl({ projectId: 'ps-2601', wpId: 'wp-2601-auto', account: '5-50200', docType: 'Timesheet', docNo: 'TS/2026/0110', date: '2026-03-27', description: 'Fieldwork audit internal', amount: 27_500_000, kind: 'actual', tm: { person: 'Dewi Lestari', hours: 60, billRate: 700_000, decision: 'bill', billAmount: 42_000_000, invoiceNo: 'INV/2026/0301' } }),
  cl({ projectId: 'ps-2601', wpId: 'wp-2601-auto', account: '5-50600', docType: 'Expense', docNo: 'EXP/2026/0077', date: '2026-02-14', description: 'Transport tim audit', amount: 1_900_000, kind: 'actual' }),
]

function woLines(sets: number, mat: [string, number, string, number][], prod: [ProjectWoLine['kind'], string, number][]): ProjectWoLine[] {
  const m = mat.map(([name, perUnit, unit, unitCost]) => {
    const qty = Math.round(perUnit * sets * 100) / 100
    const estimate = Math.round(qty * unitCost)
    return { kind: 'material' as const, name, qty, unit, unitCost, estimate, budget: estimate }
  })
  const p = prod.map(([kind, name, perUnit]) => {
    const estimate = perUnit * sets
    return { kind, name, qty: sets, unit: 'Set', unitCost: perUnit, estimate, budget: estimate }
  })
  return [...m, ...p]
}

const FURNITURE_MAT: [string, number, string, number][] = [
  ['Multiplek 18 mm', 1.5, 'Lembar', 285_000],
  ['HPL motif walnut', 1, 'Lembar', 210_000],
  ['Rangka besi hollow', 1, 'Set', 320_000],
  ['Edging PVC 2 mm', 8, 'Meter', 6_500],
  ['Aksesoris (baut, engsel)', 1, 'Set', 45_000],
]
const FURNITURE_PROD: [ProjectWoLine['kind'], string, number][] = [
  ['labor', 'Tenaga kerja produksi', 230_000],
  ['overhead', 'Overhead workshop', 95_000],
  ['other', 'Finishing & packing', 21_000],
]
const CABINET_MAT: [string, number, string, number][] = [
  ['Multiplek 18 mm', 5, 'Lembar', 285_000],
  ['HPL motif walnut', 3, 'Lembar', 210_000],
  ['Rel laci & engsel soft-close', 1, 'Set', 480_000],
]
const CABINET_PROD: [ProjectWoLine['kind'], string, number][] = [
  ['labor', 'Tenaga kerja produksi', 1_150_000],
  ['overhead', 'Overhead workshop', 380_000],
]
const KITCHEN_MAT: [string, number, string, number][] = [
  ['Multiplek 18 mm', 9, 'Lembar', 285_000],
  ['HPL motif walnut', 6, 'Lembar', 210_000],
  ['Top table granit', 1, 'Set', 3_200_000],
  ['Rel laci & engsel soft-close', 2, 'Set', 480_000],
]
const KITCHEN_PROD: [ProjectWoLine['kind'], string, number][] = [
  ['labor', 'Tenaga kerja produksi', 1_900_000],
  ['overhead', 'Overhead workshop', 690_000],
]
const sumEst = (l: ProjectWoLine[]) => l.reduce((s, x) => s + x.estimate, 0)

function seedWo(o: Omit<ProjectWorkOrder, 'estimate'>): ProjectWorkOrder {
  return { ...o, estimate: sumEst(o.lines) }
}

const SEED_WOS: ProjectWorkOrder[] = [
  seedWo({ id: 'pwo-1', number: 'WO-PS-0001', projectId: 'ps-2603', wpId: 'wp-2603-31', status: 'In progress', qty: 64, unit: 'Set', budgetSetAside: 90_000_000, actual: 61_400_000, customBomId: 'cbom-2603-31', bomVersion: 1, lines: woLines(64, FURNITURE_MAT, FURNITURE_PROD), createdAt: '2026-06-01', createdBy: 'Rizal Candra' }),
  seedWo({ id: 'pwo-2', number: 'WO-PS-0002', projectId: 'ps-2603', wpId: 'wp-2603-31', status: 'Released', qty: 56, unit: 'Set', budgetSetAside: 60_000_000, actual: 0, customBomId: 'cbom-2603-31', bomVersion: 1, lines: woLines(40, FURNITURE_MAT, FURNITURE_PROD), createdAt: '2026-06-22', createdBy: 'Rizal Candra' }),
  seedWo({ id: 'pwo-3', number: 'WO-PS-0003', projectId: 'ps-2603', wpId: 'wp-2603-32', status: 'In progress', qty: 12, unit: 'Unit', budgetSetAside: 54_000_000, actual: 22_750_000, customBomId: 'cbom-2603-32', bomVersion: 1, lines: woLines(12, CABINET_MAT, CABINET_PROD), createdAt: '2026-06-15', createdBy: 'Rizal Candra' }),
  seedWo({ id: 'pwo-4', number: 'WO-PS-0004', projectId: 'ps-2606', wpId: 'wp-2606-11', status: 'Completed', qty: 14, unit: 'Unit', budgetSetAside: 150_000_000, actual: 142_000_000, released: 8_000_000, customBomId: 'cbom-2606-11', bomVersion: 1, lines: woLines(14, KITCHEN_MAT, KITCHEN_PROD), createdAt: '2026-04-28', createdBy: 'Andi Pratama', completedAt: '2026-06-19' }),
  seedWo({ id: 'pwo-5', number: 'WO-PS-0005', projectId: 'ps-2606', wpId: 'wp-2606-11', status: 'In progress', qty: 14, unit: 'Unit', budgetSetAside: 130_000_000, actual: 60_000_000, customBomId: 'cbom-2606-11', bomVersion: 1, lines: woLines(14, KITCHEN_MAT, KITCHEN_PROD), createdAt: '2026-06-20', createdBy: 'Andi Pratama' }),
  seedWo({ id: 'pwo-6', number: 'WO-PS-0006', projectId: 'ps-2606', wpId: 'wp-2606-12', status: 'In progress', qty: 12, unit: 'Unit', budgetSetAside: 70_000_000, actual: 38_000_000, customBomId: 'cbom-2606-12', bomVersion: 1, lines: woLines(6, KITCHEN_MAT, KITCHEN_PROD), createdAt: '2026-05-19', createdBy: 'Andi Pratama' }),
  seedWo({ id: 'pwo-7', number: 'WO-PS-0007', projectId: 'ps-2605', wpId: 'wp-2605-21', status: 'Draft', qty: 8, unit: 'Unit', budgetSetAside: 0, actual: 0, customBomId: 'cbom-2605-21', bomVersion: 1, lines: [], createdAt: '2026-06-23', createdBy: 'Rizal Candra' }),
]

const SEED_DOCS: PeggedDocument[] = [
  { id: 'doc-po-0602', docType: 'PO', docNo: 'PO/2026/0602', date: '2026-06-25', vendor: 'PT Dingin Sejuk', status: 'held', createdBy: 'Rizal Candra',
    lines: [{ description: 'Unit AC split duct 6 PK', account: '5-50300', amount: 58_000_000, wpId: 'wp-2603-42' }],
    override: { reason: 'AC units were in the RAB but procured outside the RAP. Customer is paying for them under the contract — margin is on the revenue side.', by: 'Rizal Candra', overBy: 59_500_000, overPct: 198.3 } },
]

const K_LINES = 'pm-cost-lines'
const K_DOCS = 'pm-documents'
const K_WOS = 'pm-work-orders'
export const costLines = reactive<CostLine[]>(loadSnapshot<CostLine>(K_LINES) ?? structuredClone(SEED_LINES))
export const projectWorkOrders = reactive<ProjectWorkOrder[]>(loadSnapshot<ProjectWorkOrder>(K_WOS) ?? structuredClone(SEED_WOS))
export const peggedDocuments = reactive<PeggedDocument[]>(loadSnapshot<PeggedDocument>(K_DOCS) ?? structuredClone(SEED_DOCS))
export function persistLedger(): void {
  saveSnapshot(K_DOCS, peggedDocuments)
  saveSnapshot(K_LINES, costLines)
  saveSnapshot(K_WOS, projectWorkOrders)
}

// ─── Rollups ────────────────────────────────────────────────────────────────────

/** A line counts toward project actual unless it's ambiguous-and-unclassified or absorbed as overhead. */
export function countsAsProjectCost(l: CostLine): boolean {
  if (l.classification === 'overhead') return false
  if (l.ambiguous && l.classification !== 'project') return false
  return true
}

/** Draft project WOs (and anything on a draft project) never consume budget. */
function woConsumes(w: ProjectWorkOrder): boolean {
  return w.status !== 'Draft' && getProject(w.projectId)?.status !== 'draft'
}
export function woCommitted(w: ProjectWorkOrder): number {
  if (!woConsumes(w) || w.status === 'Completed') return 0
  return Math.max(w.budgetSetAside - w.actual, 0)
}

export function wpActual(wpId: string, account?: string): number {
  const lines = costLines.filter(l => l.wpId === wpId && l.kind === 'actual' && countsAsProjectCost(l) && (!account || l.account === account))
  let sum = lines.reduce((s, l) => s + l.amount, 0)
  if (!account || account === COGM_ACCOUNT) sum += projectWorkOrders.filter(w => w.wpId === wpId && woConsumes(w)).reduce((s, w) => s + w.actual, 0)
  return sum
}

export function wpCommitted(wpId: string, account?: string): number {
  if (getWorkPackage(wpId) && getProject(getWorkPackage(wpId)!.projectId)?.status === 'draft') return 0
  let sum = costLines.filter(l => l.wpId === wpId && l.kind === 'committed' && (!account || l.account === account)).reduce((s, l) => s + l.amount, 0)
  if (!account || account === COGM_ACCOUNT) sum += projectWorkOrders.filter(w => w.wpId === wpId).reduce((s, w) => s + woCommitted(w), 0)
  return sum
}

export function phaseActual(phaseId: string): number {
  return phaseWorkPackages(phaseId).reduce((s, w) => s + wpActual(w.id), 0)
}
export function phaseCommitted(phaseId: string): number {
  return phaseWorkPackages(phaseId).reduce((s, w) => s + wpCommitted(w.id), 0)
}
export function projectActual(projectId: string, account?: string): number {
  return projectWorkPackages(projectId).reduce((s, w) => s + wpActual(w.id, account), 0)
}
export function projectCommitted(projectId: string, account?: string): number {
  return projectWorkPackages(projectId).reduce((s, w) => s + wpCommitted(w.id, account), 0)
}

export function projectCostLines(projectId: string): CostLine[] {
  return costLines.filter(l => l.projectId === projectId)
}
export function projectWos(projectId: string): ProjectWorkOrder[] {
  return projectWorkOrders.filter(w => w.projectId === projectId)
}

/** Accounts with actuals on this project (incl. COGM from WOs). */
export function actualByAccount(projectId: string): Map<string, number> {
  const m = new Map<string, number>()
  for (const l of projectCostLines(projectId)) {
    if (l.kind !== 'actual' || !countsAsProjectCost(l)) continue
    m.set(l.account, (m.get(l.account) ?? 0) + l.amount)
  }
  const cogm = projectWos(projectId).filter(woConsumes).reduce((s, w) => s + w.actual, 0)
  if (cogm) m.set(COGM_ACCOUNT, (m.get(COGM_ACCOUNT) ?? 0) + cogm)
  return m
}

// ─── Budget check (PRD §5) ──────────────────────────────────────────────────────

export interface BudgetCheckLevel {
  level: 'Work package' | 'Phase' | 'Project'
  label: string
  budget: number
  committed: number
  actual: number
  available: number
  overBy: number
  overPct: number
}

export interface BudgetCheckResult {
  verdict: 'no_project' | 'no_budget' | 'within' | 'override' | 'escalate' | 'off'
  requested: number
  threshold: number
  levels: BudgetCheckLevel[]
  /** the tightest failing level (largest overPct) */
  worst?: BudgetCheckLevel
}

export function effectiveThreshold(projectId: string): number {
  return getProject(projectId)?.escalationThresholdPct ?? projectPolicy.companyThresholdPct
}

/**
 * committed (open PR + PO + WO) + actual + this new amount vs the work package's
 * bucket and its rolled-up parents. Phase 1: warn + override with reason at or
 * under the effective threshold; above it the document is held for Finance.
 */
export function checkBudget(wpId: string, amount: number, opts: { account?: string } = {}): BudgetCheckResult {
  const wp = getWorkPackage(wpId)
  if (!wp) return { verdict: 'no_project', requested: amount, threshold: 0, levels: [] }
  const threshold = effectiveThreshold(wp.projectId)
  if (!getBudget(wp.projectId)) return { verdict: 'no_budget', requested: amount, threshold, levels: [] }
  const phase = getPhase(wp.phaseId)!
  const project = getProject(wp.projectId)!

  const mk = (level: BudgetCheckLevel['level'], label: string, budget: number, committed: number, actual: number): BudgetCheckLevel => {
    const available = budget - committed - actual
    const overBy = Math.max(amount - available, 0)
    return { level, label, budget, committed, actual, available, overBy, overPct: budget ? (overBy / budget) * 100 : (overBy ? 100 : 0) }
  }

  const levels: BudgetCheckLevel[] = []
  if (opts.account) {
    levels.push(mk('Work package', `${wp.code} ${wp.name}`, wpBudget(wpId, opts.account) ?? 0, wpCommitted(wpId, opts.account), wpActual(wpId, opts.account)))
  } else {
    levels.push(mk('Work package', `${wp.code} ${wp.name}`, wpBudget(wpId) ?? 0, wpCommitted(wpId), wpActual(wpId)))
  }
  if (!phase.auto) levels.push(mk('Phase', phase.name, phaseTotal(phase.id, project.id), phaseCommitted(phase.id), phaseActual(phase.id)))
  levels.push(mk('Project', project.code, projectBudgetTotal(project.id) ?? 0, projectCommitted(project.id), projectActual(project.id)))

  // Rolled-up parents only fail when the node itself fails — reserves absorb the rest.
  const failing = levels.filter(l => l.overBy > 0)
  const worst = failing.sort((a, b) => b.overPct - a.overPct)[0]
  let verdict: BudgetCheckResult['verdict'] = 'within'
  if (worst) verdict = worst.overPct > threshold ? 'escalate' : 'override'
  return { verdict, requested: amount, threshold, levels, worst }
}

// ─── WO gate (PRD §5 step 1) ────────────────────────────────────────────────────

/** Total budget production (Cost of production line) − Committed = Available. Always the same definition on screen and in the gate. */
export function woGate(wpId: string) {
  const total = wpBudget(wpId, COGM_ACCOUNT)
  const committed = wpCommitted(wpId, COGM_ACCOUNT) + wpActual(wpId, COGM_ACCOUNT)
  return { total, committed, available: total === undefined ? undefined : total - committed }
}

// ─── Journal drill-down for a WO (project → WO → journal) ──────────────────────

export function woJournal(w: ProjectWorkOrder) {
  const mat = w.lines.filter(l => l.kind === 'material').reduce((s, l) => s + l.estimate, 0)
  const conv = w.lines.filter(l => l.kind !== 'material').reduce((s, l) => s + l.estimate, 0)
  const ratio = w.estimate ? w.actual / w.estimate : 0
  const m = Math.round(mat * ratio)
  const c = w.actual - m
  return [
    { account: '1-10500 Work in process', description: `${w.number} · raw material issued`, debit: m, credit: 0 },
    { account: '1-10300 Raw materials', description: `${w.number} · raw material issued`, debit: 0, credit: m },
    { account: '1-10500 Work in process', description: `${w.number} · labour & overhead absorbed`, debit: c, credit: 0 },
    { account: '2-20400 Accrued production cost', description: `${w.number} · labour & overhead absorbed`, debit: 0, credit: c },
    { account: '1-10400 Finished goods', description: `${w.number} · output received`, debit: w.actual, credit: 0 },
    { account: '1-10500 Work in process', description: `${w.number} · output received`, debit: 0, credit: w.actual },
    { account: '5-50100 Cost of production', description: `${w.number} · delivered to ${getProject(w.projectId)?.code} (by document reference)`, debit: w.actual, credit: 0 },
    { account: '1-10400 Finished goods', description: `${w.number} · delivered to site`, debit: 0, credit: w.actual },
  ].filter(r => r.debit || r.credit)
}

export function nextWoNumber(): string {
  const max = projectWorkOrders.reduce((m, w) => Math.max(m, Number(w.number.replace('WO-PS-', '')) || 0), 0)
  return `WO-PS-${String(max + 1).padStart(4, '0')}`
}
