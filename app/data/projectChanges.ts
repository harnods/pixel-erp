import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import type { BomComponent, BomProdCost } from './projectBoms'

/**
 * Changes — commercial (change order / VO) and engineering (ECO), both in MVP
 * scope (PRD §8, Stories 11, 12, 17).
 *
 * Change order: reason required; distinct / not-distinct flag (PSAK 72, default
 * not distinct → one-time cumulative catch-up in the current period); PM raises,
 * Finance approves; never changes the recognition method; only a VO may change
 * contract value.
 *
 * ECO: approval gate reusing the inbox; immutable versioning with revert; diff
 * with per-line and total cost delta; explicit effectivity scope required
 * before approval, never defaulted.
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

export type EcoStatus = 'draft' | 'pending' | 'approved' | 'rejected'
export type EcoEffectivity = 'new_only' | 'all_open' | 'specific'

export interface EngineeringChange {
  id: string
  no: string
  projectId: string
  wpId: string
  customBomId: string
  title: string
  reason: string
  status: EcoStatus
  /** required before approval, never defaulted */
  effectivity?: EcoEffectivity
  specificWoIds: string[]
  baseVersion: number
  proposed: { components: BomComponent[]; productionCost: BomProdCost[] }
  /** customer-funded change → references a VO (only a VO changes contract value) */
  voId?: string
  raisedBy: string
  createdAt: string
  decidedBy?: string
  decidedAt?: string
  resultVersion?: number
}

const SEED_VO: ChangeOrder[] = [
  { id: 'vo-1', no: 'VO-2603-01', projectId: 'ps-2603', wpId: 'wp-2603-31', title: 'Tambah panel akustik ruang auditorium', description: 'Dosen minta 14 panel akustik di dinding belakang auditorium lantai 3.', requestedBy: 'Dr. Hendra (Kaprodi)', capturedBy: 'Agus Wibowo', source: 'site', status: 'requested', executed: false, distinct: false, createdAt: '2026-06-24', photoCount: 2 },
  { id: 'vo-2', no: 'VO-2603-02', projectId: 'ps-2603', wpId: 'wp-2603-31', title: 'Ganti HPL ke motif kayu jati', description: 'Seluruh meja kuliah sisa produksi memakai HPL motif jati sesuai permintaan rektorat.', requestedBy: 'Bagian Sarpras IPB', capturedBy: 'Rizal Candra', source: 'office', status: 'raised', executed: false, cost: 11_200_000, price: 18_500_000, distinct: false, reason: 'Customer requested finish change after mock-up review.', createdAt: '2026-06-15', raisedBy: 'Rizal Candra', raisedAt: '2026-06-16' },
  { id: 'vo-3', no: 'VO-2603-03', projectId: 'ps-2603', wpId: 'wp-2603-41', title: 'Pindah posisi 4 titik lampu ruang dosen', description: 'Titik lampu dipindah mengikuti layout meja baru. Sudah dikerjakan tukang di lokasi.', requestedBy: 'Bagian Sarpras IPB', capturedBy: 'Agus Wibowo', source: 'site', status: 'requested', executed: true, price: 3_800_000, distinct: false, createdAt: '2026-06-20', photoCount: 3 },
  { id: 'vo-4', no: 'VO-2606-01', projectId: 'ps-2606', wpId: 'wp-2606-11', title: 'Top table solid surface (tipe A)', description: 'Upgrade top table dari granit ke solid surface untuk sisa unit tipe A.', requestedBy: 'PT Kamala Properti', capturedBy: 'Andi Pratama', source: 'office', status: 'approved', executed: false, cost: 6_300_000, price: 9_800_000, distinct: false, reason: 'Customer upgrade request, priced per unit.', createdAt: '2026-06-10', raisedBy: 'Andi Pratama', raisedAt: '2026-06-10', decidedBy: 'Maya Kartika', decidedAt: '2026-06-12', catchUp: 3_920_000 },
]

const SEED_ECO: EngineeringChange[] = [
  { id: 'eco-1', no: 'ECO-2603-01', projectId: 'ps-2603', wpId: 'wp-2603-31', customBomId: 'cbom-2603-31', title: 'HPL motif jati + edging 1 mm', reason: 'Follows VO-2603-02 (finish change). Edging reduced to 1 mm to match new HPL supplier spec.', status: 'pending', effectivity: 'all_open', specificWoIds: [], baseVersion: 1,
    proposed: {
      components: [
        { name: 'Multiplek 18 mm', qty: 1.5, unit: 'Lembar', unitCost: 285_000 },
        { name: 'HPL motif jati', qty: 1, unit: 'Lembar', unitCost: 245_000 },
        { name: 'Rangka besi hollow', qty: 1, unit: 'Set', unitCost: 320_000 },
        { name: 'Edging PVC 1 mm', qty: 8, unit: 'Meter', unitCost: 4_500 },
        { name: 'Aksesoris (baut, engsel)', qty: 1, unit: 'Set', unitCost: 45_000 },
      ],
      productionCost: [
        { kind: 'labor', name: 'Tenaga kerja produksi', perUnit: 230_000 },
        { kind: 'overhead', name: 'Overhead workshop', perUnit: 95_000 },
        { kind: 'other', name: 'Finishing & packing', perUnit: 21_000 },
      ],
    },
    voId: 'vo-2', raisedBy: 'Rizal Candra', createdAt: '2026-06-16' },
  { id: 'eco-2', no: 'ECO-2606-01', projectId: 'ps-2606', wpId: 'wp-2606-11', customBomId: 'cbom-2606-11', title: 'Top table solid surface', reason: 'Customer upgrade (VO-2606-01).', status: 'approved', effectivity: 'new_only', specificWoIds: [], baseVersion: 1,
    proposed: { components: [], productionCost: [] }, voId: 'vo-4', raisedBy: 'Andi Pratama', createdAt: '2026-06-11', decidedBy: 'Maya Kartika', decidedAt: '2026-06-18', resultVersion: 2 },
]

const K_V = 'pm-change-orders', K_E = 'pm-ecos'
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
    ecos: projectEcos(projectId).filter(e => e.status === 'pending' || e.status === 'draft'),
  }
}

export function nextVoNo(projectCode: string): string {
  const code = projectCode.replace('PS-', '')
  const n = changeOrders.filter(v => v.no.startsWith(`VO-${code}`)).length + 1
  return `VO-${code}-${String(n).padStart(2, '0')}`
}
export function nextEcoNo(projectCode: string): string {
  const code = projectCode.replace('PS-', '')
  const n = engineeringChanges.filter(e => e.no.startsWith(`ECO-${code}`)).length + 1
  return `ECO-${code}-${String(n).padStart(2, '0')}`
}
