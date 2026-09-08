import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import { billOfMaterials } from './billOfMaterials'

/**
 * Project MTO — job costing for custom make-to-order work.
 *
 * Source: [PRD] Project Structure — Project MTO (Job Costing for Custom
 * Make-to-Order), v5 (8 Sep 2026). The PRD leads the 2 Sep prototype; where the
 * two disagree the PRD is the specification (see its Prototype Alignment section).
 *
 * ── The object model (PRD §1 "Structure — depth optional in use, semantics fixed")
 *
 *   Level 1 · Project       — always present. The commercial/financial container:
 *                             contract value, recognition method + measure, PM
 *                             owner, production flag, escalation threshold.
 *   Level 2 · Phase         — optional. A work grouping AND, when Output is
 *                             measured by milestone, the carrier of the
 *                             `progressWeight`. Only exists at depth 3.
 *   Level 3 · Work package  — mandatory in substance. The executable unit: budget
 *                             bucket, custom BOM (production) or resource lines
 *                             (service), planned units, site, status.
 *
 * Depth is opted into, semantics are fixed: a service engagement is a project of
 * `depth: 1` with a single auto-created work package (`isAuto`) and no phase
 * shown. Adding the first phase promotes it to depth 3 WITHOUT migrating cost.
 *
 * "WBS" is never user-facing — projects carry a `PS-` number.
 */

// ─── Enums ────────────────────────────────────────────────────────────────────

/** Draft consumes no budget; approval locks method/measure/production flag (Story 7). */
export type ProjectStatus = 'draft' | 'active' | 'closed'

/** Production lights up BOM / MRP / work-order / reservation features (Story 1). */
export type ProjectShape = 'production' | 'service'

/** One method per project, locked at approval, no mixing (Story 8). */
export type RecognitionMethod = 'tm' | 'input' | 'output'

/**
 * Only Output carries a measure, and it decides where progress lives:
 *   milestone → progress weight on the PHASE (level 2)
 *   unit      → planned/confirmed units on the WORK PACKAGE (level 3)
 */
export type RecognitionMeasure = 'milestone' | 'unit' | null

/** Story 20 — edit/delete are permitted only while status is 'not started'. */
export type WorkPackageStatus = 'not started' | 'in progress' | 'completed'

export type WorkPackageType = 'production' | 'service'

// ─── Level 3 · Work package ───────────────────────────────────────────────────

export interface WorkPackage {
  id: string
  /** WP-0001 — displayed beside the name. */
  number: string
  name: string
  type: WorkPackageType
  status: WorkPackageStatus
  /**
   * The auto-created node every project gets so cost always has somewhere to
   * land. On a depth-1 project it cannot be deleted (Story 20).
   */
  isAuto?: boolean
  /** Budget bucket for this node, in IDR. `undefined` renders "Not set", never Rp 0. */
  budget?: number
  /** Custom BOM copied from a master at registration (Story 19); production only. */
  bomId?: string
  bomName?: string
  bomVersion?: number
  /** Output · measure = unit — % complete = confirmed ÷ planned (Story 8). */
  plannedUnits?: number
  confirmedUnits?: number
  site?: string
  /** Committed = open PR + PO + WO on this node (the budget-check pool). */
  committed: number
  /** Posted actual on this node. */
  actual: number
  /** Blocks edit/delete when > 0 even at status 'not started' (Story 20). */
  transactionCount: number
}

// ─── Level 2 · Phase ──────────────────────────────────────────────────────────

export interface Phase {
  id: string
  name: string
  /**
   * Output · measure = milestone — the phase's share of contract value, as a
   * percentage. Suggested as `phase RAB ÷ total RAB`, editable, and the set must
   * total exactly 100% before progress can be verified (Story 9).
   *
   * PRD v5 P2: the prototype still keeps this on a separate project-level
   * milestone list. This model follows the PRD (D3) — the weight lives here.
   */
  progressWeight?: number
  /** Achieved by BAST per phase — third-party evidence, not a PM's judgement. */
  isVerified?: boolean
  /** Auto-created node on a depth-1 project — never rendered as a phase row. */
  isAuto?: boolean
  workPackages: WorkPackage[]
}

// ─── Level 1 · Project ────────────────────────────────────────────────────────

export interface Project {
  id: string
  /** PS-2603 — one series for both shapes (Story 1). */
  number: string
  name: string
  customerName: string
  shape: ProjectShape
  status: ProjectStatus
  /** 1 = single auto node (service); 3 = phases + work packages. */
  depth: 1 | 3
  method: RecognitionMethod
  measure: RecognitionMeasure
  /** Contract value (RAB). Only a VO may change this — never an ECO. */
  contractValue: number
  pmOwner: string
  /** First real use is reservation contention (PRD §7); 1 = highest. */
  priority: number
  /** Per-project override of the company escalation threshold, in % (default 20). */
  escalationThreshold: number
  phases: Phase[]

  // ── Portfolio roll-ups (Story 15) ──
  /** Sum of the approved baseline's cost lines. `undefined` → "Not set". */
  budget?: number
  billed: number
  /** Value executed on unsigned change orders — exposure, not revenue (Story 11). */
  changeOrderExposure: number

  // ── Provenance ──
  createdBy: string
  createdAt: string
  updatedBy: string
  updatedAt: string
  /** Set once the draft is approved — the moment method/measure lock (Story 7). */
  approvedBy?: string
  approvedAt?: string
}

// ─── Derived roll-ups ─────────────────────────────────────────────────────────
// Committed/actual/% complete are never stored on the project — they are summed
// from the work packages so a node total can never silently disagree with its
// children (the same principle Story 4 applies to phase Allocated).

export function projectWorkPackages(p: Project): WorkPackage[] {
  return p.phases.flatMap(ph => ph.workPackages)
}

export function projectCommitted(p: Project): number {
  return projectWorkPackages(p).reduce((s, wp) => s + wp.committed, 0)
}

export function projectActual(p: Project): number {
  return projectWorkPackages(p).reduce((s, wp) => s + wp.actual, 0)
}

/**
 * % complete per the project's own recognition method (Story 8):
 *   Input             → actual cost ÷ budget
 *   Output · milestone → Σ progress weight of VERIFIED phases
 *   Output · unit      → Σ confirmed units ÷ Σ planned units
 *   T&M                → no % complete exists; billing follows time incurred
 *
 * Returns null for T&M and wherever the denominator is missing — the caller
 * renders "—", never a misleading 0%.
 */
export function projectPercentComplete(p: Project): number | null {
  if (p.method === 'tm') return null
  if (p.method === 'input') {
    if (!p.budget) return null
    return Math.min(100, (projectActual(p) / p.budget) * 100)
  }
  if (p.measure === 'milestone') {
    return p.phases.filter(ph => ph.isVerified).reduce((s, ph) => s + (ph.progressWeight ?? 0), 0)
  }
  const wps = projectWorkPackages(p)
  const planned = wps.reduce((s, wp) => s + (wp.plannedUnits ?? 0), 0)
  if (!planned) return null
  return (wps.reduce((s, wp) => s + (wp.confirmedUnits ?? 0), 0) / planned) * 100
}

/** Recognised revenue = % complete × contract value. Null wherever % complete is. */
export function projectRecognised(p: Project): number | null {
  const pct = projectPercentComplete(p)
  return pct === null ? null : (pct / 100) * p.contractValue
}

/**
 * WIP is the reconciling balance between the two independent clocks (Story 8,
 * superseded-decision 5): recognition runs on progress, billing runs on the
 * contract's own schedule.
 *
 *   positive → underbilled  (contract asset — work done, not yet invoiced)
 *   negative → overbilled   (contract liability — the Indonesian DP case)
 */
export function projectWip(p: Project): number | null {
  const recognised = projectRecognised(p)
  return recognised === null ? null : recognised - p.billed
}

/** Over budget once posted actual alone exceeds the baseline. */
export function isOverBudget(p: Project): boolean {
  return p.budget !== undefined && projectActual(p) > p.budget
}

/**
 * The progress-weight total across phases. Verification is blocked while this is
 * not exactly 100 (Story 9) — only meaningful for Output · milestone.
 */
export function progressWeightTotal(p: Project): number {
  return p.phases.filter(ph => !ph.isAuto).reduce((s, ph) => s + (ph.progressWeight ?? 0), 0)
}

// ─── Edit / delete gates (Story 20) ───────────────────────────────────────────
// Both return a REASON string when the action is refused, so the UI can print it
// where the button is rather than silently disabling the control. Null = allowed.

export function workPackageLockReason(wp: WorkPackage): string | null {
  if (wp.status !== 'not started') return 'work has started on it'
  if (wp.transactionCount > 0) return 'it has transactions'
  if (wp.committed > 0) return 'it has open commitments'
  if ((wp.confirmedUnits ?? 0) > 0) return 'units have been confirmed'
  return null
}

export function phaseLockReason(phase: Phase): string | null {
  if (phase.isVerified) return 'it has been verified by BAST'
  const started = phase.workPackages.find(wp => workPackageLockReason(wp) !== null)
  return started ? 'a work package beneath it has started' : null
}

/** A depth-1 project's auto node is the only place cost can land — never deletable. */
export function canDeleteWorkPackage(p: Project, wp: WorkPackage): string | null {
  if (p.depth === 1 && wp.isAuto) return 'a project always needs one work package'
  return workPackageLockReason(wp)
}

// ─── Labels ───────────────────────────────────────────────────────────────────

export const METHOD_LABEL: Record<RecognitionMethod, string> = {
  tm: 'T&M',
  input: 'Input',
  output: 'Output',
}

/** "Output · Milestone" / "Input" — measure only exists on Output. */
export function methodLabel(p: Project): string {
  const base = METHOD_LABEL[p.method]
  if (p.method !== 'output' || !p.measure) return base
  return `${base} · ${p.measure === 'milestone' ? 'Milestone' : 'Unit'}`
}

export const SHAPE_LABEL: Record<ProjectShape, string> = {
  production: 'Production',
  service: 'Service',
}

// ─── Seed ─────────────────────────────────────────────────────────────────────
// Figures follow the PRD's own worked examples. PS-2604 uses the REAL IPB
// Pascasarjana documents named in the PRD (RAB Rp835.227.502; RAP Rp528.035.550
// + 10% contingency Rp52.803.555 = Rp580.839.105) — that data is deliberate: it
// carries anomalies synthetic figures cannot produce, including the
// negative-margin preparation phase the PRD calls out.

/**
 * A production work package's custom BOM is a COPY of a company master, taken at
 * registration (Story 19). The id/name resolve against the real BOM catalog so a
 * work package never points at a BOM that does not exist.
 */
function seedBom(index: number): { bomId: string; bomName: string } | Record<string, never> {
  const bom = billOfMaterials[index % billOfMaterials.length]
  return bom ? { bomId: bom.id, bomName: bom.name } : {}
}

function buildSeed(): Project[] {
  return [
    // ── Production · Output measured by milestone. The main demo record. ──
    {
      id: 'ps-2603',
      number: 'PS-2603',
      name: 'Karoseri Tronton — Dump Body 12 unit',
      customerName: 'PT Sumber Bakti Logistik',
      shape: 'production',
      status: 'active',
      depth: 3,
      method: 'output',
      measure: 'milestone',
      contractValue: 4_312_000_000,
      pmOwner: 'Andi Prasetyo',
      priority: 1,
      escalationThreshold: 20,
      budget: 3_605_000_000,
      billed: 1_293_600_000,
      changeOrderExposure: 84_000_000,
      createdBy: 'Andi Prasetyo',
      createdAt: '2026-06-02',
      updatedBy: 'Sari Wulandari',
      updatedAt: '2026-09-04',
      approvedBy: 'Sari Wulandari',
      approvedAt: '2026-06-09',
      phases: [
        {
          id: 'ph-2603-1',
          name: 'Persiapan & pengadaan',
          progressWeight: 12,
          isVerified: true,
          workPackages: [
            {
              id: 'wp-2603-1', number: 'WP-0001', name: 'Pengadaan chassis',
              type: 'production', status: 'completed',
              budget: 620_000_000, committed: 0, actual: 638_000_000, transactionCount: 7,
              site: 'Gudang Cakung', plannedUnits: 12, confirmedUnits: 12,
            },
          ],
        },
        {
          id: 'ph-2603-2',
          name: 'Fabrikasi rangka & body',
          progressWeight: 37,
          workPackages: [
            {
              id: 'wp-2603-2', number: 'WP-0002', name: 'Rangka & body',
              type: 'production', status: 'in progress',
              budget: 1_480_000_000, committed: 450_000_000, actual: 842_000_000, transactionCount: 14,
              ...seedBom(6), bomVersion: 2,
              site: 'Workshop Bekasi', plannedUnits: 12, confirmedUnits: 5,
            },
            {
              id: 'wp-2603-3', number: 'WP-0003', name: 'Pengecatan & finishing',
              type: 'production', status: 'not started',
              budget: 385_000_000, committed: 0, actual: 0, transactionCount: 0,
              site: 'Workshop Bekasi', plannedUnits: 12, confirmedUnits: 0,
            },
          ],
        },
        {
          id: 'ph-2603-3',
          name: 'Instalasi hidrolik & kelistrikan',
          progressWeight: 30,
          workPackages: [
            {
              id: 'wp-2603-4', number: 'WP-0004', name: 'Sistem hidrolik',
              type: 'production', status: 'not started',
              budget: 720_000_000, committed: 180_000_000, actual: 0, transactionCount: 2,
              site: 'Workshop Bekasi', plannedUnits: 12, confirmedUnits: 0,
            },
          ],
        },
        {
          id: 'ph-2603-4',
          name: 'Uji jalan & serah terima',
          progressWeight: 21,
          workPackages: [
            {
              id: 'wp-2603-5', number: 'WP-0005', name: 'Commissioning & BAST',
              type: 'service', status: 'not started',
              budget: 120_000_000, committed: 0, actual: 0, transactionCount: 0,
            },
          ],
        },
      ],
    },

    // ── Service · depth 1 · Input. The convergence case: a professional-services
    // engagement, same object, one auto node, no phase shown. ──
    {
      id: 'ps-2604',
      number: 'PS-2604',
      name: 'Fit-out Gedung Pascasarjana IPB',
      customerName: 'Institut Pertanian Bogor',
      shape: 'service',
      status: 'active',
      depth: 1,
      method: 'input',
      measure: null,
      contractValue: 835_227_502,
      pmOwner: 'Rina Kusuma',
      priority: 2,
      escalationThreshold: 20,
      budget: 580_839_105,
      billed: 417_613_751,
      changeOrderExposure: 0,
      createdBy: 'Rina Kusuma',
      createdAt: '2026-07-14',
      updatedBy: 'Rina Kusuma',
      updatedAt: '2026-09-01',
      approvedBy: 'Sari Wulandari',
      approvedAt: '2026-07-18',
      phases: [
        {
          id: 'ph-2604-auto',
          name: 'Fit-out Gedung Pascasarjana IPB',
          isAuto: true,
          workPackages: [
            {
              id: 'wp-2604-1', number: 'WP-0001', name: 'Fit-out Gedung Pascasarjana IPB',
              type: 'service', status: 'in progress', isAuto: true,
              budget: 580_839_105, committed: 96_400_000, actual: 268_912_400, transactionCount: 23,
            },
          ],
        },
      ],
    },

    // ── Draft · production · Output measured by unit. Nothing consumes budget yet
    // (Story 7), and no baseline exists — budget renders "Not set", never Rp 0. ──
    {
      id: 'ps-2605',
      number: 'PS-2605',
      name: 'Bak Dump Standar — 10 unit',
      customerName: 'CV Karya Mandiri',
      shape: 'production',
      status: 'draft',
      depth: 3,
      method: 'output',
      measure: 'unit',
      contractValue: 1_450_000_000,
      pmOwner: 'Andi Prasetyo',
      priority: 3,
      escalationThreshold: 25,
      budget: undefined,
      billed: 0,
      changeOrderExposure: 0,
      createdBy: 'Andi Prasetyo',
      createdAt: '2026-09-02',
      updatedBy: 'Andi Prasetyo',
      updatedAt: '2026-09-02',
      phases: [
        {
          id: 'ph-2605-1',
          name: 'Produksi',
          workPackages: [
            {
              id: 'wp-2605-1', number: 'WP-0001', name: 'Perakitan bak dump',
              type: 'production', status: 'not started',
              budget: undefined, committed: 0, actual: 0, transactionCount: 0,
              ...seedBom(8), bomVersion: 1,
              plannedUnits: 10, confirmedUnits: 0,
            },
          ],
        },
      ],
    },

    // ── T&M · service. No % complete exists at all; each unbilled entry carries a
    // bill / write-down / write-up decision before invoicing (Story 8). ──
    {
      id: 'ps-2606',
      number: 'PS-2606',
      name: 'Retainer audit internal 2026',
      customerName: 'PT Aneka Pangan Nusantara',
      shape: 'service',
      status: 'active',
      depth: 1,
      method: 'tm',
      measure: null,
      contractValue: 264_000_000,
      pmOwner: 'Rina Kusuma',
      priority: 4,
      escalationThreshold: 20,
      budget: 198_000_000,
      billed: 88_000_000,
      changeOrderExposure: 0,
      createdBy: 'Rina Kusuma',
      createdAt: '2026-01-08',
      updatedBy: 'Rina Kusuma',
      updatedAt: '2026-08-29',
      approvedBy: 'Sari Wulandari',
      approvedAt: '2026-01-12',
      phases: [
        {
          id: 'ph-2606-auto',
          name: 'Retainer audit internal 2026',
          isAuto: true,
          workPackages: [
            {
              id: 'wp-2606-1', number: 'WP-0001', name: 'Retainer audit internal 2026',
              type: 'service', status: 'in progress', isAuto: true,
              budget: 198_000_000, committed: 0, actual: 121_500_000, transactionCount: 31,
            },
          ],
        },
      ],
    },

    // ── Over budget + change-order exposure. The loss-making job the portfolio
    // exists to surface (Story 15). ──
    {
      id: 'ps-2602',
      number: 'PS-2602',
      name: 'Karoseri Box Pendingin — 6 unit',
      customerName: 'PT Segar Jaya Distribusi',
      shape: 'production',
      status: 'active',
      depth: 3,
      method: 'output',
      measure: 'milestone',
      contractValue: 2_180_000_000,
      pmOwner: 'Budi Hartono',
      priority: 2,
      escalationThreshold: 15,
      budget: 1_760_000_000,
      billed: 1_744_000_000,
      changeOrderExposure: 212_000_000,
      createdBy: 'Budi Hartono',
      createdAt: '2026-03-11',
      updatedBy: 'Budi Hartono',
      updatedAt: '2026-09-05',
      approvedBy: 'Sari Wulandari',
      approvedAt: '2026-03-16',
      phases: [
        {
          id: 'ph-2602-1',
          name: 'Fabrikasi box',
          progressWeight: 55,
          isVerified: true,
          workPackages: [
            {
              id: 'wp-2602-1', number: 'WP-0001', name: 'Panel & insulasi',
              type: 'production', status: 'completed',
              budget: 980_000_000, committed: 0, actual: 1_124_000_000, transactionCount: 19,
              plannedUnits: 6, confirmedUnits: 6,
            },
          ],
        },
        {
          id: 'ph-2602-2',
          name: 'Instalasi unit pendingin',
          progressWeight: 45,
          workPackages: [
            {
              id: 'wp-2602-2', number: 'WP-0002', name: 'Refrigeration unit',
              type: 'production', status: 'in progress',
              budget: 780_000_000, committed: 210_000_000, actual: 692_000_000, transactionCount: 11,
              plannedUnits: 6, confirmedUnits: 3,
            },
          ],
        },
      ],
    },

    // ── Closed. Kept so the portfolio's status filter has a terminal record and
    // the "no change order or ECO pending" close gate has an example (Story 16). ──
    {
      id: 'ps-2601',
      number: 'PS-2601',
      name: 'Modifikasi Trailer Lowbed',
      customerName: 'PT Baja Konstruksi Utama',
      shape: 'production',
      status: 'closed',
      depth: 3,
      method: 'input',
      measure: null,
      contractValue: 1_120_000_000,
      pmOwner: 'Budi Hartono',
      priority: 5,
      escalationThreshold: 20,
      budget: 890_000_000,
      billed: 1_120_000_000,
      changeOrderExposure: 0,
      createdBy: 'Budi Hartono',
      createdAt: '2026-01-20',
      updatedBy: 'Sari Wulandari',
      updatedAt: '2026-06-30',
      approvedBy: 'Sari Wulandari',
      approvedAt: '2026-01-26',
      phases: [
        {
          id: 'ph-2601-1',
          name: 'Modifikasi rangka',
          workPackages: [
            {
              id: 'wp-2601-1', number: 'WP-0001', name: 'Perkuatan rangka lowbed',
              type: 'production', status: 'completed',
              budget: 890_000_000, committed: 0, actual: 871_400_000, transactionCount: 26,
            },
          ],
        },
      ],
    },
  ]
}

// Persisted as a full snapshot (seed + user-created) — mirrors workOrders.ts.
const projectSnapshot = loadSnapshot<Project>('projects')
export const projects = reactive<Project[]>(projectSnapshot ?? buildSeed())

/** Persist the project snapshot (call after any mutation). */
export function persistProjects(): void {
  saveSnapshot('projects', projects)
}

export function findProject(id: string): Project | undefined {
  return projects.find(p => p.id === id || p.number === id)
}

export function findWorkPackage(p: Project, wpId: string): WorkPackage | undefined {
  return projectWorkPackages(p).find(wp => wp.id === wpId)
}

/** The phase a work package belongs to — needed for the structure breadcrumb. */
export function phaseOf(p: Project, wpId: string): Phase | undefined {
  return p.phases.find(ph => ph.workPackages.some(wp => wp.id === wpId))
}
