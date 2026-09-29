import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'

/**
 * Changes — commercial (change order / VO) and engineering (ECO), both in MVP
 * scope (PRD §8, Stories 11, 12, 17).
 *
 * Change order: reason required; distinct / not-distinct flag (PSAK 72, default
 * not distinct → one-time cumulative catch-up in the current period); PM raises,
 * Finance approves; never changes the recognition method; only a VO may change
 * contract value.
 *
 * ECO: see the block above EngineeringChange — raised by publishing a version of
 * a locked project BOM, decided by the PM for existing work orders only.
 */

export type VoStatus = 'requested' | 'priced' | 'raised' | 'approved' | 'rejected'

export interface ChangeOrder {
  id: string
  no: string
  projectId: string
  wpId: string
  title: string
  description: string
  requestedBy: string
  capturedBy: string
  source: 'site' | 'office'
  status: VoStatus
  /** work was executed in the field — without sign-off this is executed-but-unbilled exposure */
  executed: boolean
  cost?: number
  price?: number
  distinct: boolean
  reason?: string
  createdAt: string
  raisedBy?: string
  raisedAt?: string
  decidedBy?: string
  decidedAt?: string
  catchUp?: number
  photoCount?: number
}

/**
 * Engineering change order (PRD v6.2 §7 · BOM Versioning & ECO-lite P-05…P-11).
 *
 *   • Production edits a locked project BOM → version vN+1 publishes and is Active
 *     at once; every work order created afterwards uses it. Nobody gates issuance.
 *   • The publish raises ONE ECO. Its only decision is the PM's: which EXISTING
 *     work orders adopt the new version — none · selected · all open.
 *   • The route per adopted work order is computed from its status, never picked.
 *   • Lifecycle: Open → (Pending approval above the escalation threshold) →
 *     Decided → Implemented (every disposition posted) → Closed.
 *   • One ECO at a time per project BOM: a further edit is refused while one is open.
 */
export type EcoStatus = 'open' | 'pending_approval' | 'decided' | 'implemented' | 'closed'
export type EcoReason = 'customer_request' | 'internal_design' | 'material_substitution' | 'data_correction'
export type EcoAdoption = 'none' | 'selected' | 'all_open'
export type EcoRoute = 'repin' | 'cancel_recreate' | 'adjust' | 'split_cutover' | 'untouched'
export type EcoDisposition = 'use_as_is' | 'rework' | 'scrap'

export const ECO_REASON_LABELS: Record<EcoReason, string> = {
  customer_request: 'Customer request',
  internal_design: 'Internal design / quality',
  material_substitution: 'Material substitution',
  data_correction: 'Data correction',
}
export const ECO_ROUTE_LABELS: Record<EcoRoute, string> = {
  repin: 'Repin in place',
  cancel_recreate: 'Cancel and recreate',
  adjust: 'Adjust in place',
  split_cutover: 'Split and cutover',
  untouched: 'Untouched — built as is',
}
export const ECO_ROUTE_HINTS: Record<EcoRoute, string> = {
  repin: 'Draft with no reservation — the pin moves to the new version.',
  cancel_recreate: 'Not started but reserved — cancelled and recreated on the new version; reservations return to the project.',
  adjust: 'In progress, nothing completed yet — the pin stays and the delta is documented with this ECO as reason.',
  split_cutover: 'In progress with completed units — built units close on the old version, the rest move to a new work order.',
  untouched: 'Completed — the as-built record stays on its version. Shown for information.',
}
export const ECO_DISPOSITION_LABELS: Record<EcoDisposition, string> = {
  use_as_is: 'Use as is',
  rework: 'Rework',
  scrap: 'Scrap',
}

/** The PM's decision for one existing work order, frozen at decision time. */
export interface EcoWoDecision {
  woId: string
  woNumber: string
  route: EcoRoute
  fromVersion: number
  /** units that take the new version (remaining units for adjust / split) */
  units: number
  delta: number
  /** work order created by cancel & recreate or split & cutover (cross-reference) */
  newWoId?: string
}

/** One affected on-hand line — ECO can't reach Implemented while any is undecided. */
export interface EcoDispositionLine {
  id: string
  itemName: string
  unit: string
  qty: number
  /** where the material sits: already issued to the floor, or released back to project stock */
  source: 'issued' | 'project_stock'
  unitCost?: number
  disposition?: EcoDisposition
  postedAt?: string
}

export interface EngineeringChange {
  id: string
  no: string
  projectId: string
  wpId: string
  customBomId: string
  /** what changed, in the publisher's words */
  title: string
  reason: EcoReason
  note: string
  fromVersion: number
  toVersion: number
  status: EcoStatus
  /** linked SO addendum (a project sales order with isAddendum) — required before existing work
   *  orders adopt a customer-request ECO (v6.2 key decision 3: SO addendum + ECO, no VO object) */
  addendumSoId?: string
  /** adopt without a linked addendum — flags the project as added scope not yet under contract */
  addendumOverride?: string
  publishedBy: string
  publishedAt: string
  adoption?: EcoAdoption
  decisions: EcoWoDecision[]
  decisionNote?: string
  decidedBy?: string
  decidedAt?: string
  approvedBy?: string
  dispositions: EcoDispositionLine[]
  budgetRevisionAmount?: number
  implementedBy?: string
  implementedAt?: string
  closedBy?: string
  closedAt?: string
}

/** An ECO still waiting on the PM, Finance or its dispositions. */
export function ecoIsActive(e: Pick<EngineeringChange, 'status'>): boolean {
  return e.status !== 'closed'
}
/** Blocks a further edit to the same BOM (serialised — OQ22). */
export function ecoBlocksEdits(e: Pick<EngineeringChange, 'status'>): boolean {
  return e.status === 'open' || e.status === 'pending_approval'
}

const SEED_VO: ChangeOrder[] = [
  { id: 'vo-1', no: 'VO-2603-01', projectId: 'ps-2603', wpId: 'wp-2603-31', title: 'Tambah panel akustik ruang auditorium', description: 'Dosen minta 14 panel akustik di dinding belakang auditorium lantai 3.', requestedBy: 'Dr. Hendra (Kaprodi)', capturedBy: 'Agus Wibowo', source: 'site', status: 'requested', executed: false, distinct: false, createdAt: '2026-06-24', photoCount: 2 },
  { id: 'vo-2', no: 'VO-2603-02', projectId: 'ps-2603', wpId: 'wp-2603-31', title: 'Ganti HPL ke motif kayu jati', description: 'Seluruh meja kuliah sisa produksi memakai HPL motif jati sesuai permintaan rektorat.', requestedBy: 'Bagian Sarpras IPB', capturedBy: 'Rizal Candra', source: 'office', status: 'raised', executed: false, cost: 11_200_000, price: 18_500_000, distinct: false, reason: 'Customer requested finish change after mock-up review.', createdAt: '2026-06-15', raisedBy: 'Rizal Candra', raisedAt: '2026-06-16' },
  { id: 'vo-3', no: 'VO-2603-03', projectId: 'ps-2603', wpId: 'wp-2603-41', title: 'Pindah posisi 4 titik lampu ruang dosen', description: 'Titik lampu dipindah mengikuti layout meja baru. Sudah dikerjakan tukang di lokasi.', requestedBy: 'Bagian Sarpras IPB', capturedBy: 'Agus Wibowo', source: 'site', status: 'requested', executed: true, price: 3_800_000, distinct: false, createdAt: '2026-06-20', photoCount: 3 },
  { id: 'vo-4', no: 'VO-2606-01', projectId: 'ps-2606', wpId: 'wp-2606-11', title: 'Top table solid surface (tipe A)', description: 'Upgrade top table dari granit ke solid surface untuk sisa unit tipe A.', requestedBy: 'PT Kamala Properti', capturedBy: 'Andi Pratama', source: 'office', status: 'approved', executed: false, cost: 6_300_000, price: 9_800_000, distinct: false, reason: 'Customer upgrade request, priced per unit.', createdAt: '2026-06-10', raisedBy: 'Andi Pratama', raisedAt: '2026-06-10', decidedBy: 'Maya Kartika', decidedAt: '2026-06-12', catchUp: 2_940_000 },
]

const SEED_ECO: EngineeringChange[] = [
  // PRJ-A · PRD Scenario B, door 1 — the customer asked for a dark-walnut finish. Production
  // published PRJ-A-BOM-MJ-001 v2 (+1 wood stain @ Rp85.000/unit); SO-0231-A1 prices it.
  // The five PRJ-A work orders on v1 each compute a different adoption route.
  { id: 'eco-prja-1', no: 'ECO-PRJ-A-01', projectId: 'prj-a', wpId: 'wp-prja-1', customBomId: 'cbom-prja-mj', title: 'Dark walnut finish — wood stain added',
    reason: 'customer_request', note: 'Pak Budi changed the finish to dark walnut after the sample review. One coat of wood stain per unit.',
    fromVersion: 1, toVersion: 2, status: 'open', addendumSoId: 'so-0231-a1', publishedBy: 'Dewi Lestari', publishedAt: '2026-09-24', decisions: [], dispositions: [] },
  { id: 'eco-1', no: 'ECO-2603-01', projectId: 'ps-2603', wpId: 'wp-2603-31', customBomId: 'cbom-2603-31', title: 'HPL motif jati + edging 1 mm',
    reason: 'customer_request', note: 'Follows VO-2603-02 (finish change). Edging reduced to 1 mm to match the new HPL supplier spec.',
    fromVersion: 1, toVersion: 2, status: 'open', publishedBy: 'Dewi Lestari', publishedAt: '2026-06-16', decisions: [], dispositions: [] },
  { id: 'eco-2', no: 'ECO-2606-01', projectId: 'ps-2606', wpId: 'wp-2606-11', customBomId: 'cbom-2606-11', title: 'Top table solid surface',
    reason: 'customer_request', note: 'Customer upgrade (VO-2606-01) — new work orders build with solid surface.',
    fromVersion: 1, toVersion: 2, status: 'closed', publishedBy: 'Dewi Lestari', publishedAt: '2026-06-18',
    adoption: 'none', decisions: [], decisionNote: 'WO-PS-0005 is already cutting granite tops — it stays on v1; only new work orders take the upgrade.',
    decidedBy: 'Andi Pratama', decidedAt: '2026-06-18', dispositions: [], implementedBy: 'Andi Pratama', implementedAt: '2026-06-18', closedBy: 'Andi Pratama', closedAt: '2026-06-19' },
]

// ECO key bumped for the v6.2 model — an older snapshot has a different shape.
const K_V = 'pm-change-orders', K_E = 'pm-ecos-v62b'
export const changeOrders = reactive<ChangeOrder[]>(loadSnapshot<ChangeOrder>(K_V) ?? structuredClone(SEED_VO))
export const engineeringChanges = reactive<EngineeringChange[]>(loadSnapshot<EngineeringChange>(K_E) ?? structuredClone(SEED_ECO))
export function persistChanges(): void {
  saveSnapshot(K_V, changeOrders)
  saveSnapshot(K_E, engineeringChanges)
}

export function projectChangeOrders(projectId: string) { return changeOrders.filter(v => v.projectId === projectId) }
export function projectEcos(projectId: string) { return engineeringChanges.filter(e => e.projectId === projectId) }

/** Executed in the field without sign-off → unbilled exposure (priced value, or 0 when not priced yet). */
export function coExposure(projectId: string): number {
  return projectChangeOrders(projectId).filter(v => v.executed && v.status !== 'approved' && v.status !== 'rejected').reduce((s, v) => s + (v.price ?? 0), 0)
}
export function pendingChanges(projectId: string) {
  return {
    vos: projectChangeOrders(projectId).filter(v => v.status !== 'approved' && v.status !== 'rejected'),
    ecos: projectEcos(projectId).filter(ecoIsActive),
  }
}
/** ECOs live under their project (v6.2 §3.1 — reached from the Production tab). */
export function ecoPath(e: Pick<EngineeringChange, 'id' | 'projectId'>): string {
  return `/projects/${e.projectId}/engineering-changes/${e.id}`
}
export function getEco(id?: string) { return id ? engineeringChanges.find(e => e.id === id) : undefined }
/** The ECO that currently blocks edits to a project BOM, if any. */
export function blockingEco(customBomId: string) {
  return engineeringChanges.find(e => e.customBomId === customBomId && ecoBlocksEdits(e))
}

export function nextVoNo(projectCode: string): string {
  const code = projectCode.replace('PS-', '')
  const n = changeOrders.filter(v => v.no.startsWith(`VO-${code}`)).length + 1
  return `VO-${code}-${String(n).padStart(2, '0')}`
}
export function nextEcoNo(projectCode: string): string {
  // PS-2603 → ECO-2603-nn (legacy seeds) · PRJ-A → ECO-PRJ-A-nn
  const code = projectCode.startsWith('PS-') ? projectCode.slice(3) : projectCode
  let max = 0
  for (const e of engineeringChanges) {
    const m = e.no.match(new RegExp(`^ECO-${code}-(\\d+)$`))
    if (m) max = Math.max(max, parseInt(m[1]!, 10))
  }
  return `ECO-${code}-${String(max + 1).padStart(2, '0')}`
}
