import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'

/**
 * Project MTO — the one project object (PRD "Project Structure — Project MTO").
 *
 * Three levels with fixed meaning, depth opted into:
 *   L1 Project      — commercial/financial container (always)
 *   L2 Phase        — work grouping + carrier of the Output progress weight (optional)
 *   L3 Work package — executable unit; budget bucket, custom BOM, units (always ≥ 1)
 *
 * A depth-1 project (service engagement) still owns one auto phase + one auto
 * work package so cost has somewhere to land; adding the first real phase
 * promotes it to depth 3 without migrating cost (the auto work package is
 * re-parented under the new phase).
 *
 * "WBS" is never user-facing — codes use the PS- prefix.
 */

export type ProjectStatus = 'draft' | 'active' | 'closed'
export type RecognitionMethod = 'tm' | 'input' | 'output'
export type OutputMeasure = 'milestone' | 'unit'
export type WorkPackageType = 'production' | 'service'
export type WorkPackageStatus = 'not_started' | 'in_progress' | 'technically_complete'

export interface ProjectDimensions {
  branch?: string
  department?: string
  costCenter?: string
  fundingSource?: string
}

export interface Project {
  id: string
  /** PS-2603 */
  code: string
  name: string
  customer: string
  /** linked contract / sales order number — carries the billing terms */
  salesOrderNo?: string
  /** production job (BOM, MRP, WO, reservations light up) vs service engagement */
  isProduction: boolean
  depth: 1 | 3
  method: RecognitionMethod
  /** only meaningful when method = output */
  measure?: OutputMeasure
  contractValue: number
  pm: string
  priority: 'high' | 'medium' | 'low'
  longTerm: boolean
  defaultWarehouse?: string
  dimensions: ProjectDimensions
  /** per-project override of the company escalation threshold (%) — undefined = company default */
  escalationThresholdPct?: number
  status: ProjectStatus
  /** set at approval — method, measure and production flag are locked from then */
  approvedAt?: string
  approvedBy?: string
  startDate: string
  endDate: string
  createdAt: string
  /** set when a change order altered contract value on Output·milestone — unverified weights must be reconfirmed to 100% */
  reweightRequired?: boolean
  closedAt?: string
  /** long-term project — asset created at technical completion */
  assetNo?: string
}

export interface Phase {
  id: string
  projectId: string
  name: string
  /** auto-created node on a depth-1 project — hidden, never weighted, never deletable */
  auto: boolean
  /** Output·milestone progress weight (% of contract), undefined when not weighted */
  progressWeightPct?: number
  /** RAB (contract-side) value of this phase — the source of the weight suggestion */
  rabValue?: number
  /** BAST per phase recorded → the phase's weight is recognised */
  verifiedAt?: string
  bastNo?: string
  order: number
}

export interface WorkPackage {
  id: string
  projectId: string
  phaseId: string
  code: string
  name: string
  type: WorkPackageType
  auto: boolean
  /** custom BOM copied from a master at registration (production only) */
  customBomId?: string
  plannedUnits?: number
  confirmedUnits?: number
  unit?: string
  site?: string
  workCenter?: string
  planStart?: string
  planEnd?: string
  actualStart?: string
  actualEnd?: string
  status: WorkPackageStatus
  /** accepted percentage from the latest BAST (0–100) */
  bastPct: number
  order: number
}

// ─── Seed ───────────────────────────────────────────────────────────────────────

const SEED_PROJECTS: Project[] = [
  {
    id: 'ps-2603', code: 'PS-2603', name: 'Interior Gedung Pascasarjana IPB',
    customer: 'Institut Pertanian Bogor', salesOrderNo: 'SO/2026/0412',
    isProduction: true, depth: 3, method: 'output', measure: 'milestone',
    contractValue: 835_227_502, pm: 'Rizal Candra', priority: 'high', longTerm: false,
    defaultWarehouse: 'Workshop Cileungsi',
    dimensions: { branch: 'Bogor', department: 'Project delivery', costCenter: 'CC-Interior', fundingSource: 'APBN' },
    status: 'active', approvedAt: '2026-04-02', approvedBy: 'Maya Kartika',
    startDate: '2026-04-06', endDate: '2026-09-30', createdAt: '2026-03-27',
  },
  {
    id: 'ps-2604', code: 'PS-2604', name: 'Pendampingan Pajak Tahunan PT Sinar Abadi',
    customer: 'PT Sinar Abadi', salesOrderNo: 'SO/2026/0388',
    isProduction: false, depth: 1, method: 'tm',
    contractValue: 120_000_000, pm: 'Dewi Lestari', priority: 'medium', longTerm: false,
    dimensions: { branch: 'Jakarta', department: 'Advisory', costCenter: 'CC-Tax' },
    status: 'active', approvedAt: '2026-05-04', approvedBy: 'Maya Kartika',
    startDate: '2026-05-06', endDate: '2026-12-31', createdAt: '2026-05-02',
  },
  {
    id: 'ps-2605', code: 'PS-2605', name: 'Karoseri Box Truck 8 Unit — CV Mitra Logistik',
    customer: 'CV Mitra Logistik', salesOrderNo: 'SO/2026/0467',
    isProduction: true, depth: 3, method: 'input',
    contractValue: 1_450_000_000, pm: 'Rizal Candra', priority: 'medium', longTerm: false,
    defaultWarehouse: 'Workshop Cileungsi',
    dimensions: { branch: 'Bogor', department: 'Fabrication', costCenter: 'CC-Karoseri' },
    status: 'draft',
    startDate: '2026-07-06', endDate: '2026-10-30', createdAt: '2026-06-22',
  },
  {
    id: 'ps-2606', code: 'PS-2606', name: 'Kitchen Set Apartemen Grand Kamala',
    customer: 'PT Kamala Properti', salesOrderNo: 'SO/2026/0421',
    isProduction: true, depth: 3, method: 'output', measure: 'unit',
    contractValue: 649_800_000, pm: 'Andi Pratama', priority: 'low', longTerm: false,
    defaultWarehouse: 'Workshop Cileungsi',
    dimensions: { branch: 'Jakarta', department: 'Fabrication', costCenter: 'CC-Interior' },
    status: 'active', approvedAt: '2026-04-20', approvedBy: 'Maya Kartika',
    startDate: '2026-04-27', endDate: '2026-08-28', createdAt: '2026-04-15',
  },
  {
    id: 'ps-2601', code: 'PS-2601', name: 'Audit Internal Q1 — Koperasi Sejahtera',
    customer: 'Koperasi Sejahtera', salesOrderNo: 'SO/2026/0102',
    isProduction: false, depth: 1, method: 'tm',
    contractValue: 45_000_000, pm: 'Dewi Lestari', priority: 'low', longTerm: false,
    dimensions: { branch: 'Jakarta', department: 'Advisory', costCenter: 'CC-Audit' },
    status: 'closed', approvedAt: '2026-01-12', approvedBy: 'Maya Kartika',
    startDate: '2026-01-15', endDate: '2026-03-31', createdAt: '2026-01-10',
  },
]

const SEED_PHASES: Phase[] = [
  // PS-2603 IPB — weights = phase RAB ÷ total RAB (2,0 / 15,0 / 50,8 / 24,0 / 8,2)
  { id: 'ph-2603-1', projectId: 'ps-2603', name: 'Persiapan', auto: false, progressWeightPct: 2.0, rabValue: 16_704_550, verifiedAt: '2026-04-24', bastNo: 'BAST/IPB/01', order: 1 },
  { id: 'ph-2603-2', projectId: 'ps-2603', name: 'Pekerjaan sipil', auto: false, progressWeightPct: 15.0, rabValue: 125_284_125, verifiedAt: '2026-05-29', bastNo: 'BAST/IPB/02', order: 2 },
  { id: 'ph-2603-3', projectId: 'ps-2603', name: 'Interior', auto: false, progressWeightPct: 50.8, rabValue: 424_295_571, order: 3 },
  { id: 'ph-2603-4', projectId: 'ps-2603', name: 'Mekanikal & elektrikal', auto: false, progressWeightPct: 24.0, rabValue: 200_454_600, order: 4 },
  { id: 'ph-2603-5', projectId: 'ps-2603', name: 'Finishing & serah terima', auto: false, progressWeightPct: 8.2, rabValue: 68_488_656, order: 5 },
  // PS-2604 service, depth 1 → one auto phase
  { id: 'ph-2604-auto', projectId: 'ps-2604', name: 'Pendampingan Pajak Tahunan PT Sinar Abadi', auto: true, order: 1 },
  // PS-2605 karoseri, Input
  { id: 'ph-2605-1', projectId: 'ps-2605', name: 'Persiapan sasis', auto: false, order: 1 },
  { id: 'ph-2605-2', projectId: 'ps-2605', name: 'Fabrikasi box', auto: false, order: 2 },
  // PS-2606 kitchen set, Output·unit
  { id: 'ph-2606-1', projectId: 'ps-2606', name: 'Produksi', auto: false, order: 1 },
  { id: 'ph-2606-2', projectId: 'ps-2606', name: 'Instalasi', auto: false, order: 2 },
  // PS-2601 closed audit
  { id: 'ph-2601-auto', projectId: 'ps-2601', name: 'Audit Internal Q1 — Koperasi Sejahtera', auto: true, order: 1 },
]

const SEED_WPS: WorkPackage[] = [
  // PS-2603
  { id: 'wp-2603-11', projectId: 'ps-2603', phaseId: 'ph-2603-1', code: '1.1', name: 'Survei lokasi & mobilisasi', type: 'service', auto: false, site: 'Kampus IPB Dramaga', planStart: '2026-04-06', planEnd: '2026-04-22', actualStart: '2026-04-06', actualEnd: '2026-04-23', status: 'technically_complete', bastPct: 100, order: 1 },
  { id: 'wp-2603-21', projectId: 'ps-2603', phaseId: 'ph-2603-2', code: '2.1', name: 'Partisi & plafon', type: 'service', auto: false, site: 'Kampus IPB Dramaga', planStart: '2026-04-27', planEnd: '2026-05-22', actualStart: '2026-04-27', actualEnd: '2026-05-26', status: 'technically_complete', bastPct: 100, order: 1 },
  { id: 'wp-2603-22', projectId: 'ps-2603', phaseId: 'ph-2603-2', code: '2.2', name: 'Lantai vinyl', type: 'service', auto: false, site: 'Kampus IPB Dramaga', planStart: '2026-05-11', planEnd: '2026-05-27', actualStart: '2026-05-11', actualEnd: '2026-05-28', status: 'technically_complete', bastPct: 100, order: 2 },
  { id: 'wp-2603-31', projectId: 'ps-2603', phaseId: 'ph-2603-3', code: '3.1', name: 'Furnitur ruang kuliah', type: 'production', auto: false, customBomId: 'cbom-2603-31', plannedUnits: 120, confirmedUnits: 64, unit: 'Set', site: 'Workshop Cileungsi', workCenter: 'Kayu & finishing', planStart: '2026-06-01', planEnd: '2026-07-31', actualStart: '2026-06-02', status: 'in_progress', bastPct: 0, order: 1 },
  { id: 'wp-2603-32', projectId: 'ps-2603', phaseId: 'ph-2603-3', code: '3.2', name: 'Lemari tanam', type: 'production', auto: false, customBomId: 'cbom-2603-32', plannedUnits: 24, confirmedUnits: 6, unit: 'Unit', site: 'Workshop Cileungsi', workCenter: 'Kayu & finishing', planStart: '2026-06-15', planEnd: '2026-08-07', actualStart: '2026-06-16', status: 'in_progress', bastPct: 0, order: 2 },
  { id: 'wp-2603-41', projectId: 'ps-2603', phaseId: 'ph-2603-4', code: '4.1', name: 'Instalasi listrik & pencahayaan', type: 'service', auto: false, site: 'Kampus IPB Dramaga', planStart: '2026-06-22', planEnd: '2026-08-14', actualStart: '2026-06-22', status: 'in_progress', bastPct: 0, order: 1 },
  { id: 'wp-2603-42', projectId: 'ps-2603', phaseId: 'ph-2603-4', code: '4.2', name: 'Tata udara (HVAC)', type: 'service', auto: false, site: 'Kampus IPB Dramaga', planStart: '2026-07-13', planEnd: '2026-08-21', status: 'not_started', bastPct: 0, order: 2 },
  { id: 'wp-2603-51', projectId: 'ps-2603', phaseId: 'ph-2603-5', code: '5.1', name: 'Pengecatan & finishing', type: 'service', auto: false, site: 'Kampus IPB Dramaga', planStart: '2026-08-17', planEnd: '2026-09-11', status: 'not_started', bastPct: 0, order: 1 },
  { id: 'wp-2603-52', projectId: 'ps-2603', phaseId: 'ph-2603-5', code: '5.2', name: 'Pembersihan & serah terima', type: 'service', auto: false, site: 'Kampus IPB Dramaga', planStart: '2026-09-14', planEnd: '2026-09-30', status: 'not_started', bastPct: 0, order: 2 },
  // PS-2604 (auto work package mirrors the project)
  { id: 'wp-2604-auto', projectId: 'ps-2604', phaseId: 'ph-2604-auto', code: '1', name: 'Pendampingan Pajak Tahunan PT Sinar Abadi', type: 'service', auto: true, planStart: '2026-05-06', planEnd: '2026-12-31', actualStart: '2026-05-06', status: 'in_progress', bastPct: 0, order: 1 },
  // PS-2605
  { id: 'wp-2605-11', projectId: 'ps-2605', phaseId: 'ph-2605-1', code: '1.1', name: 'Modifikasi sasis', type: 'production', auto: false, plannedUnits: 8, confirmedUnits: 0, unit: 'Unit', site: 'Workshop Cileungsi', workCenter: 'Las & perakitan', planStart: '2026-07-06', planEnd: '2026-07-31', status: 'not_started', bastPct: 0, order: 1 },
  { id: 'wp-2605-21', projectId: 'ps-2605', phaseId: 'ph-2605-2', code: '2.1', name: 'Box aluminium', type: 'production', auto: false, customBomId: 'cbom-2605-21', plannedUnits: 8, confirmedUnits: 0, unit: 'Unit', site: 'Workshop Cileungsi', workCenter: 'Las & perakitan', planStart: '2026-08-03', planEnd: '2026-10-23', status: 'not_started', bastPct: 0, order: 1 },
  // PS-2606
  { id: 'wp-2606-11', projectId: 'ps-2606', phaseId: 'ph-2606-1', code: '1.1', name: 'Kitchen set tipe A', type: 'production', auto: false, customBomId: 'cbom-2606-11', plannedUnits: 28, confirmedUnits: 14, unit: 'Unit', site: 'Workshop Cileungsi', workCenter: 'Kayu & finishing', planStart: '2026-04-27', planEnd: '2026-07-24', actualStart: '2026-04-28', status: 'in_progress', bastPct: 0, order: 1 },
  { id: 'wp-2606-12', projectId: 'ps-2606', phaseId: 'ph-2606-1', code: '1.2', name: 'Kitchen set tipe B', type: 'production', auto: false, customBomId: 'cbom-2606-12', plannedUnits: 12, confirmedUnits: 4, unit: 'Unit', site: 'Workshop Cileungsi', workCenter: 'Kayu & finishing', planStart: '2026-05-18', planEnd: '2026-07-31', actualStart: '2026-05-19', status: 'in_progress', bastPct: 0, order: 2 },
  { id: 'wp-2606-21', projectId: 'ps-2606', phaseId: 'ph-2606-2', code: '2.1', name: 'Instalasi di unit apartemen', type: 'service', auto: false, plannedUnits: 40, confirmedUnits: 18, unit: 'Unit', site: 'Grand Kamala Tower B', planStart: '2026-06-15', planEnd: '2026-08-28', actualStart: '2026-06-17', status: 'in_progress', bastPct: 0, order: 1 },
  // PS-2601
  { id: 'wp-2601-auto', projectId: 'ps-2601', phaseId: 'ph-2601-auto', code: '1', name: 'Audit Internal Q1 — Koperasi Sejahtera', type: 'service', auto: true, planStart: '2026-01-15', planEnd: '2026-03-31', actualStart: '2026-01-15', actualEnd: '2026-03-27', status: 'technically_complete', bastPct: 100, order: 1 },
]

export interface PunchItem {
  id: string
  projectId: string
  wpId: string
  description: string
  reworkCost: number
  status: 'open' | 'closed'
  closedAt?: string
}

const SEED_PUNCH: PunchItem[] = [
  { id: 'pi-1', projectId: 'ps-2603', wpId: 'wp-2603-21', description: 'Retak rambut sambungan gypsum koridor lt. 2', reworkCost: 650_000, status: 'open' },
  { id: 'pi-2', projectId: 'ps-2603', wpId: 'wp-2603-22', description: 'Vinyl terangkat di depan lift (3 keping)', reworkCost: 420_000, status: 'open' },
  { id: 'pi-3', projectId: 'ps-2603', wpId: 'wp-2603-11', description: 'Bekas direksi keet belum dibongkar', reworkCost: 0, status: 'closed', closedAt: '2026-05-02' },
]

// ─── Stores ─────────────────────────────────────────────────────────────────────

const K_PROJECTS = 'pm-projects'
const K_PHASES = 'pm-phases'
const K_WPS = 'pm-work-packages'
const K_PUNCH = 'pm-punch'

export const projects = reactive<Project[]>(loadSnapshot<Project>(K_PROJECTS) ?? structuredClone(SEED_PROJECTS))
export const phases = reactive<Phase[]>(loadSnapshot<Phase>(K_PHASES) ?? structuredClone(SEED_PHASES))
export const workPackages = reactive<WorkPackage[]>(loadSnapshot<WorkPackage>(K_WPS) ?? structuredClone(SEED_WPS))

export const punchItems = reactive<PunchItem[]>(loadSnapshot<PunchItem>(K_PUNCH) ?? structuredClone(SEED_PUNCH))

export function persistProjects(): void {
  saveSnapshot(K_PUNCH, punchItems)
  saveSnapshot(K_PROJECTS, projects)
  saveSnapshot(K_PHASES, phases)
  saveSnapshot(K_WPS, workPackages)
}

// ─── Selectors ──────────────────────────────────────────────────────────────────

export function getProject(id: string): Project | undefined {
  return projects.find(p => p.id === id || p.code === id)
}
export function projectPhases(projectId: string): Phase[] {
  return phases.filter(p => p.projectId === projectId).sort((a, b) => a.order - b.order)
}
export function phaseWorkPackages(phaseId: string): WorkPackage[] {
  return workPackages.filter(w => w.phaseId === phaseId).sort((a, b) => a.order - b.order)
}
export function projectWorkPackages(projectId: string): WorkPackage[] {
  const order = new Map(projectPhases(projectId).map((p, i) => [p.id, i]))
  return workPackages
    .filter(w => w.projectId === projectId)
    .sort((a, b) => (order.get(a.phaseId)! - order.get(b.phaseId)!) || a.order - b.order)
}
export function getWorkPackage(id: string): WorkPackage | undefined {
  return workPackages.find(w => w.id === id)
}
export function getPhase(id: string): Phase | undefined {
  return phases.find(p => p.id === id)
}

/** Human label for a pegging target: "PS-2603 · 3.1 Furnitur ruang kuliah" */
export function nodeLabel(wpId: string): string {
  const wp = getWorkPackage(wpId)
  if (!wp) return '—'
  const p = getProject(wp.projectId)
  return wp.auto ? `${p?.code} · ${p?.name}` : `${p?.code} · ${wp.code} ${wp.name}`
}

/** Every peggable node (work package) across open projects, for Project dropdowns. */
export function peggableNodes(opts: { includeDraft?: boolean } = {}) {
  return projects
    .filter(p => p.status === 'active' || (opts.includeDraft && p.status === 'draft'))
    .flatMap(p => projectWorkPackages(p.id).map(w => ({ id: w.id, projectId: p.id, label: nodeLabel(w.id) })))
}

export function weightTotal(projectId: string): number {
  const total = projectPhases(projectId).filter(p => !p.auto).reduce((s, p) => s + (p.progressWeightPct ?? 0), 0)
  return Math.round(total * 100) / 100
}

/** Output·milestone weight suggestion = phase RAB ÷ total RAB, rounded to 0,1%. */
export function suggestedWeight(phase: Phase): number | undefined {
  const all = projectPhases(phase.projectId).filter(p => !p.auto)
  const total = all.reduce((s, p) => s + (p.rabValue ?? 0), 0)
  if (!total || !phase.rabValue) return undefined
  return Math.round((phase.rabValue / total) * 1000) / 10
}

export function methodLabel(p: Pick<Project, 'method' | 'measure'>): string {
  if (p.method === 'tm') return 'T&M'
  if (p.method === 'input') return 'Input (cost-to-cost)'
  return p.measure === 'unit' ? 'Output · unit' : 'Output · milestone'
}

export function wpStatusLabel(s: WorkPackageStatus): string {
  return s === 'not_started' ? 'Not started' : s === 'in_progress' ? 'In progress' : 'Technically complete'
}

// ─── Mutations ──────────────────────────────────────────────────────────────────

function nextId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
}

export function nextProjectCode(): string {
  const max = projects.reduce((m, p) => Math.max(m, Number(p.code.replace('PS-', '')) || 0), 0)
  return `PS-${max + 1}`
}

export interface NewProjectInput {
  name: string
  customer: string
  salesOrderNo?: string
  isProduction: boolean
  method: RecognitionMethod
  measure?: OutputMeasure
  contractValue: number
  pm: string
  priority: Project['priority']
  longTerm: boolean
  defaultWarehouse?: string
  dimensions: ProjectDimensions
  startDate: string
  endDate: string
  phases: { name: string; progressWeightPct?: number; rabValue?: number; workPackages: { name: string; type: WorkPackageType; plannedUnits?: number; unit?: string }[] }[]
}

export function createProject(input: NewProjectInput, today: string): Project {
  const code = nextProjectCode()
  const id = code.toLowerCase()
  const depth: 1 | 3 = input.phases.length ? 3 : 1
  const project: Project = {
    id, code, name: input.name, customer: input.customer, salesOrderNo: input.salesOrderNo,
    isProduction: input.isProduction, depth, method: input.method,
    measure: input.method === 'output' ? input.measure : undefined,
    contractValue: input.contractValue, pm: input.pm, priority: input.priority, longTerm: input.longTerm,
    defaultWarehouse: input.defaultWarehouse, dimensions: input.dimensions,
    status: 'draft', startDate: input.startDate, endDate: input.endDate, createdAt: today,
  }
  projects.unshift(project)
  if (depth === 1) {
    const ph: Phase = { id: nextId('ph'), projectId: id, name: input.name, auto: true, order: 1 }
    phases.push(ph)
    workPackages.push({ id: nextId('wp'), projectId: id, phaseId: ph.id, code: '1', name: input.name, type: 'service', auto: true, status: 'not_started', bastPct: 0, order: 1, planStart: input.startDate, planEnd: input.endDate })
  } else {
    input.phases.forEach((p, pi) => {
      const ph: Phase = { id: nextId('ph'), projectId: id, name: p.name, auto: false, order: pi + 1, progressWeightPct: p.progressWeightPct, rabValue: p.rabValue }
      phases.push(ph)
      const wps = p.workPackages.length ? p.workPackages : [{ name: p.name, type: (input.isProduction ? 'production' : 'service') as WorkPackageType }]
      wps.forEach((w, wi) => {
        workPackages.push({
          id: nextId('wp'), projectId: id, phaseId: ph.id, code: `${pi + 1}.${wi + 1}`, name: w.name,
          type: input.isProduction ? w.type : 'service', auto: false, plannedUnits: w.plannedUnits, confirmedUnits: w.plannedUnits ? 0 : undefined,
          unit: w.unit, status: 'not_started', bastPct: 0, order: wi + 1,
        })
      })
    })
  }
  persistProjects()
  return project
}

/** Add a phase. On a depth-1 project this promotes it to depth 3: the auto phase
 *  becomes the new real phase and keeps its work package, so no cost migrates. */
export function addPhase(projectId: string, data: { name: string; progressWeightPct?: number; rabValue?: number }): Phase {
  const project = getProject(projectId)!
  const existing = projectPhases(projectId)
  const auto = existing.find(p => p.auto)
  if (project.depth === 1 && auto) {
    auto.auto = false
    auto.name = data.name
    auto.progressWeightPct = data.progressWeightPct
    auto.rabValue = data.rabValue
    for (const w of phaseWorkPackages(auto.id)) { w.auto = false; w.code = '1.1' }
    project.depth = 3
    persistProjects()
    return auto
  }
  const ph: Phase = { id: nextId('ph'), projectId, name: data.name, auto: false, order: existing.length + 1, progressWeightPct: data.progressWeightPct, rabValue: data.rabValue }
  phases.push(ph)
  persistProjects()
  return ph
}

export function updatePhase(id: string, data: Partial<Pick<Phase, 'name' | 'progressWeightPct' | 'rabValue'>>): void {
  const ph = getPhase(id)
  if (!ph) return
  Object.assign(ph, data)
  persistProjects()
}

/** Delete a phase. Deleting the last phase returns the project to an auto node. */
export function deletePhase(id: string): void {
  const ph = getPhase(id)
  if (!ph) return
  const project = getProject(ph.projectId)!
  const remaining = projectPhases(ph.projectId).filter(p => p.id !== id)
  for (const w of phaseWorkPackages(id)) workPackages.splice(workPackages.indexOf(w), 1)
  phases.splice(phases.indexOf(ph), 1)
  if (!remaining.length) {
    const auto: Phase = { id: nextId('ph'), projectId: project.id, name: project.name, auto: true, order: 1 }
    phases.push(auto)
    workPackages.push({ id: nextId('wp'), projectId: project.id, phaseId: auto.id, code: '1', name: project.name, type: 'service', auto: true, status: 'not_started', bastPct: 0, order: 1 })
    project.depth = 1
  } else {
    remaining.forEach((p, i) => { p.order = i + 1 })
  }
  persistProjects()
}

export function addWorkPackage(phaseId: string, data: Omit<WorkPackage, 'id' | 'projectId' | 'phaseId' | 'code' | 'auto' | 'status' | 'bastPct' | 'order'>): WorkPackage {
  const ph = getPhase(phaseId)!
  const siblings = phaseWorkPackages(phaseId)
  const wp: WorkPackage = {
    ...data, id: nextId('wp'), projectId: ph.projectId, phaseId,
    code: `${ph.order}.${siblings.length + 1}`, auto: false, status: 'not_started', bastPct: 0, order: siblings.length + 1,
    confirmedUnits: data.plannedUnits ? 0 : undefined,
  }
  workPackages.push(wp)
  persistProjects()
  return wp
}

export function updateWorkPackage(id: string, data: Partial<WorkPackage>): void {
  const wp = getWorkPackage(id)
  if (!wp) return
  Object.assign(wp, data)
  persistProjects()
}

export function deleteWorkPackage(id: string): void {
  const wp = getWorkPackage(id)
  if (!wp) return
  workPackages.splice(workPackages.indexOf(wp), 1)
  phaseWorkPackages(wp.phaseId).forEach((w, i) => { w.order = i + 1; w.code = `${getPhase(wp.phaseId)!.order}.${i + 1}` })
  persistProjects()
}

export function updateProject(id: string, data: Partial<Project>): void {
  const p = getProject(id)
  if (!p) return
  Object.assign(p, data)
  persistProjects()
}

/** Deep copy that works on Vue reactive proxies (structuredClone throws DataCloneError on them). */
export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

export function newId(prefix: string): string {
  return nextId(prefix)
}
