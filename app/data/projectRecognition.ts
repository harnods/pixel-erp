import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import { getProject, projectPhases, projectWorkPackages, type Project } from './projects'
import { projectBudgetTotal } from './projectBudgets'
import { projectActual, projectCostLines } from './projectTransactions'
import { projectPolicy } from './projectPolicy'

/**
 * Recognition & billing — two separate postings on two independent clocks
 * (PRD §6, superseded-decision 5, P1). Verifying progress recognises revenue;
 * issuing a term invoice bills the customer. WIP = recognised − billed is the
 * reconciling balance: positive = underbilled (asset), negative = overbilled
 * (liability). Billing terms live on the contract / SO, never on the structure.
 */

export interface BillingTerm {
  id: string
  projectId: string
  label: string
  pct: number
  /** signing = on contract signing · progress = cumulative progress ≥ triggerPct · handover = at close */
  trigger: 'signing' | 'progress' | 'handover'
  triggerPct?: number
}

export interface RecognitionPosting {
  id: string
  no: string
  projectId: string
  date: string
  kind: 'milestone' | 'unit' | 'input' | 'tm' | 'catch_up'
  description: string
  /** cumulative % complete after this posting (undefined for T&M) */
  cumulativePct?: number
  amount: number
  phaseId?: string
  by: string
}

export interface ProjectInvoice {
  id: string
  no: string
  projectId: string
  date: string
  termId?: string
  description: string
  amount: number
  status: 'unpaid' | 'paid'
}

const SEED_TERMS: BillingTerm[] = [
  // IPB: DP 30% / progress 50% / settlement 20% — terms never align with the five phases
  { id: 'bt-2603-1', projectId: 'ps-2603', label: 'Uang muka (DP) 30%', pct: 30, trigger: 'signing' },
  { id: 'bt-2603-2', projectId: 'ps-2603', label: 'Termin progres 50%', pct: 50, trigger: 'progress', triggerPct: 50 },
  { id: 'bt-2603-3', projectId: 'ps-2603', label: 'Pelunasan 20%', pct: 20, trigger: 'handover' },
  { id: 'bt-2606-1', projectId: 'ps-2606', label: 'Uang muka (DP) 20%', pct: 20, trigger: 'signing' },
  { id: 'bt-2606-2', projectId: 'ps-2606', label: 'Termin progres 40%', pct: 40, trigger: 'progress', triggerPct: 40 },
  { id: 'bt-2606-3', projectId: 'ps-2606', label: 'Pelunasan 40%', pct: 40, trigger: 'handover' },
  { id: 'bt-2605-1', projectId: 'ps-2605', label: 'Uang muka (DP) 30%', pct: 30, trigger: 'signing' },
  { id: 'bt-2605-2', projectId: 'ps-2605', label: 'Termin progres 40%', pct: 40, trigger: 'progress', triggerPct: 60 },
  { id: 'bt-2605-3', projectId: 'ps-2605', label: 'Pelunasan 30%', pct: 30, trigger: 'handover' },
]

const SEED_RECOGNITION: RecognitionPosting[] = [
  { id: 'rec-1', no: 'REC-2603-01', projectId: 'ps-2603', date: '2026-04-24', kind: 'milestone', phaseId: 'ph-2603-1', description: 'Phase achieved: Persiapan (BAST/IPB/01) — weight 2,0%', cumulativePct: 2, amount: 16_704_550, by: 'Rizal Candra' },
  { id: 'rec-2', no: 'REC-2603-02', projectId: 'ps-2603', date: '2026-05-29', kind: 'milestone', phaseId: 'ph-2603-2', description: 'Phase achieved: Pekerjaan sipil (BAST/IPB/02) — weight 15,0%', cumulativePct: 17, amount: 125_284_125, by: 'Rizal Candra' },
  { id: 'rec-3', no: 'REC-2606-01', projectId: 'ps-2606', date: '2026-05-31', kind: 'unit', description: 'Recognition run — 24 of 80 units confirmed', cumulativePct: 30, amount: 192_000_000, by: 'Maya Kartika' },
  // VO-2606-01 (not distinct) approved 12 Jun: 30% × Rp649.800.000 − Rp192.000.000 recognised = one-time catch-up
  { id: 'rec-6', no: 'REC-2606-02', projectId: 'ps-2606', date: '2026-06-12', kind: 'catch_up', description: 'Cumulative catch-up — VO-2606-01 (30% × new contract value)', cumulativePct: 30, amount: 2_940_000, by: 'Maya Kartika' },
  { id: 'rec-4', no: 'REC-2604-01', projectId: 'ps-2604', date: '2026-05-31', kind: 'tm', description: 'T&M — 2 entries billed (INV/2026/1012)', amount: 40_800_000, by: 'Maya Kartika' },
  { id: 'rec-5', no: 'REC-2601-01', projectId: 'ps-2601', date: '2026-03-31', kind: 'tm', description: 'T&M — final billing (INV/2026/0301)', amount: 42_000_000, by: 'Maya Kartika' },
]

const SEED_INVOICES: ProjectInvoice[] = [
  { id: 'inv-1', no: 'INV/2026/0831', projectId: 'ps-2603', date: '2026-04-08', termId: 'bt-2603-1', description: 'Uang muka (DP) 30%', amount: 250_568_251, status: 'paid' },
  { id: 'inv-2', no: 'INV/2026/0902', projectId: 'ps-2606', date: '2026-04-22', termId: 'bt-2606-1', description: 'Uang muka (DP) 20%', amount: 128_000_000, status: 'paid' },
  { id: 'inv-3', no: 'INV/2026/1140', projectId: 'ps-2606', date: '2026-06-22', termId: 'bt-2606-2', description: 'Termin progres 40%', amount: 259_920_000, status: 'unpaid' },
  { id: 'inv-4', no: 'INV/2026/1012', projectId: 'ps-2604', date: '2026-05-31', description: 'Jasa pendampingan pajak — Mei (60 jam)', amount: 40_800_000, status: 'paid' },
  { id: 'inv-5', no: 'INV/2026/0301', projectId: 'ps-2601', date: '2026-03-31', description: 'Audit internal Q1 — final', amount: 42_000_000, status: 'paid' },
]

const K_T = 'pm-billing-terms', K_R = 'pm-recognition', K_I = 'pm-invoices'
export const billingTerms = reactive<BillingTerm[]>(loadSnapshot<BillingTerm>(K_T) ?? structuredClone(SEED_TERMS))
export const recognitionPostings = reactive<RecognitionPosting[]>(loadSnapshot<RecognitionPosting>(K_R) ?? structuredClone(SEED_RECOGNITION))
export const projectInvoices = reactive<ProjectInvoice[]>(loadSnapshot<ProjectInvoice>(K_I) ?? structuredClone(SEED_INVOICES))
export function persistRecognition(): void {
  saveSnapshot(K_T, billingTerms)
  saveSnapshot(K_R, recognitionPostings)
  saveSnapshot(K_I, projectInvoices)
}

// ─── Selectors ──────────────────────────────────────────────────────────────────

export function projectTerms(projectId: string) { return billingTerms.filter(t => t.projectId === projectId) }
export function projectRecognition(projectId: string) { return recognitionPostings.filter(r => r.projectId === projectId) }
export function projectInvoiceList(projectId: string) { return projectInvoices.filter(i => i.projectId === projectId) }
export function termInvoice(termId: string) { return projectInvoices.find(i => i.termId === termId) }

export function recognisedToDate(projectId: string): number {
  return projectRecognition(projectId).reduce((s, r) => s + r.amount, 0)
}
export function billedToDate(projectId: string): number {
  return projectInvoiceList(projectId).reduce((s, i) => s + i.amount, 0)
}
/** WIP = recognised − billed. > 0 underbilled (asset), < 0 overbilled (liability). */
export function wipPosition(projectId: string): number {
  return recognisedToDate(projectId) - billedToDate(projectId)
}

/** Unit-measured Output: confirmed ÷ planned units across work packages (OQ6 option A/B). */
export function unitProgress(projectId: string) {
  const wps = projectWorkPackages(projectId).filter(w => w.plannedUnits && (projectPolicy.qtyPocOption === 'A' || w.type === 'production'))
  const planned = wps.reduce((s, w) => s + (w.plannedUnits ?? 0), 0)
  const confirmed = wps.reduce((s, w) => s + (w.confirmedUnits ?? 0), 0)
  return { planned, confirmed, pct: planned ? (confirmed / planned) * 100 : 0 }
}

/** Live % complete per the project's locked method. undefined = cannot be computed (e.g. budget not set, T&M). */
export function percentComplete(p: Project): number | undefined {
  if (p.method === 'tm') return undefined
  if (p.method === 'input') {
    const budget = projectBudgetTotal(p.id)
    if (!budget) return undefined
    return Math.min((projectActual(p.id) / budget) * 100, 100)
  }
  if (p.measure === 'unit') return unitProgress(p.id).pct
  return projectPhases(p.id).filter(ph => ph.verifiedAt).reduce((s, ph) => s + (ph.progressWeightPct ?? 0), 0)
}

/** Revenue that should be recognised now minus what's posted (Input / Output·unit recognition runs). */
export function recognitionDue(p: Project): number {
  const pct = percentComplete(p)
  if (pct === undefined) return 0
  return Math.round((pct / 100) * p.contractValue) - recognisedToDate(p.id)
}

/** T&M — unbilled entries awaiting a bill / write-down / write-up decision. */
export function tmEntries(projectId: string) {
  return projectCostLines(projectId).filter(l => l.tm)
}

export function nextRecNo(projectId: string): string {
  const code = getProject(projectId)?.code.replace('PS-', '') ?? '0000'
  return `REC-${code}-${String(projectRecognition(projectId).length + 1).padStart(2, '0')}`
}
export function nextInvoiceNo(): string {
  const max = projectInvoices.reduce((m, i) => Math.max(m, Number(i.no.split('/').pop()) || 0), 1140)
  return `INV/2026/${String(max + 1).padStart(4, '0')}`
}
