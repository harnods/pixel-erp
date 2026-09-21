import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'

/**
 * Project custom BOMs (PRD §7, Stories 19 & 23, §8 ECO).
 *
 *   • Picking a master BOM on a production work package duplicates it into a
 *     linked custom BOM v1. The master is untouched; later master edits never
 *     propagate to the copy.
 *   • Versions are immutable. An approved ECO appends a version; revert appends
 *     a new version restoring earlier content — history is never overwritten.
 */

export interface BomComponent { name: string; qty: number; unit: string; unitCost?: number }
export interface BomProdCost { kind: 'labor' | 'overhead' | 'other'; name: string; perUnit: number }

export interface MasterBom {
  id: string
  number: string
  name: string
  /** increments whenever the master is edited — stored on the copy to detect divergence */
  version: number
  archived: boolean
  components: BomComponent[]
  productionCost: BomProdCost[]
}

export interface BomVersion {
  version: number
  createdAt: string
  createdBy: string
  source: 'copy' | 'eco' | 'revert'
  note: string
  refNo?: string
  components: BomComponent[]
  productionCost: BomProdCost[]
}

export interface CustomBom {
  id: string
  projectId: string
  wpId: string
  name: string
  masterBomId: string
  masterName: string
  masterVersionAtCopy: number
  copiedAt: string
  versions: BomVersion[]
  archived?: { at: string; reason: string }
}

const FURNITURE: BomComponent[] = [
  { name: 'Multiplek 18 mm', qty: 1.5, unit: 'Lembar', unitCost: 285_000 },
  { name: 'HPL motif walnut', qty: 1, unit: 'Lembar', unitCost: 210_000 },
  { name: 'Rangka besi hollow', qty: 1, unit: 'Set', unitCost: 320_000 },
  { name: 'Edging PVC 2 mm', qty: 8, unit: 'Meter', unitCost: 6_500 },
  { name: 'Aksesoris (baut, engsel)', qty: 1, unit: 'Set', unitCost: 45_000 },
]
const FURNITURE_COST: BomProdCost[] = [
  { kind: 'labor', name: 'Tenaga kerja produksi', perUnit: 230_000 },
  { kind: 'overhead', name: 'Overhead workshop', perUnit: 95_000 },
  { kind: 'other', name: 'Finishing & packing', perUnit: 21_000 },
]
const CABINET: BomComponent[] = [
  { name: 'Multiplek 18 mm', qty: 5, unit: 'Lembar', unitCost: 285_000 },
  { name: 'HPL motif walnut', qty: 3, unit: 'Lembar', unitCost: 210_000 },
  { name: 'Rel laci & engsel soft-close', qty: 1, unit: 'Set', unitCost: 480_000 },
]
const CABINET_COST: BomProdCost[] = [
  { kind: 'labor', name: 'Tenaga kerja produksi', perUnit: 1_150_000 },
  { kind: 'overhead', name: 'Overhead workshop', perUnit: 380_000 },
]
const KITCHEN: BomComponent[] = [
  { name: 'Multiplek 18 mm', qty: 9, unit: 'Lembar', unitCost: 285_000 },
  { name: 'HPL motif walnut', qty: 6, unit: 'Lembar', unitCost: 210_000 },
  { name: 'Top table granit', qty: 1, unit: 'Set', unitCost: 3_200_000 },
  { name: 'Rel laci & engsel soft-close', qty: 2, unit: 'Set', unitCost: 480_000 },
]
const KITCHEN_COST: BomProdCost[] = [
  { kind: 'labor', name: 'Tenaga kerja produksi', perUnit: 1_900_000 },
  { kind: 'overhead', name: 'Overhead workshop', perUnit: 690_000 },
]
const BOX: BomComponent[] = [
  { name: 'Plat aluminium 2 mm', qty: 24, unit: 'Lembar', unitCost: 1_450_000 },
  { name: 'Hollow aluminium 40×40', qty: 36, unit: 'Batang', unitCost: 310_000 },
  { name: 'Engsel & kunci pintu box', qty: 1, unit: 'Set', unitCost: 2_600_000 },
  { name: 'Lampu marker LED', qty: 8, unit: 'Pcs', unitCost: 85_000 },
]
const BOX_COST: BomProdCost[] = [
  { kind: 'labor', name: 'Tenaga las & perakitan', perUnit: 9_500_000 },
  { kind: 'overhead', name: 'Overhead workshop', perUnit: 3_200_000 },
]

const SEED_MASTERS: MasterBom[] = [
  { id: 'mbom-1', number: 'BOM-M-1001', name: 'Meja kuliah lipat + kursi', version: 3, archived: false, components: FURNITURE, productionCost: FURNITURE_COST },
  { id: 'mbom-2', number: 'BOM-M-1002', name: 'Lemari tanam 2 pintu', version: 1, archived: false, components: CABINET, productionCost: CABINET_COST },
  { id: 'mbom-3', number: 'BOM-M-1003', name: 'Kitchen set L 3 m', version: 2, archived: false, components: KITCHEN, productionCost: KITCHEN_COST },
  { id: 'mbom-4', number: 'BOM-M-1004', name: 'Box aluminium truk engkel', version: 1, archived: false, components: BOX, productionCost: BOX_COST },
  { id: 'mbom-5', number: 'BOM-M-1005', name: 'Rak arsip (template kosong)', version: 1, archived: false, components: [], productionCost: [] },
]

const v1 = (at: string, by: string, masterName: string, c: BomComponent[], p: BomProdCost[]): BomVersion => ({
  version: 1, createdAt: at, createdBy: by, source: 'copy', note: `Copied from ${masterName}`, components: structuredClone(c), productionCost: structuredClone(p),
})

const SEED_CUSTOM: CustomBom[] = [
  // master mbom-1 is now v3 but the copy took v2 → divergence badge
  { id: 'cbom-2603-31', projectId: 'ps-2603', wpId: 'wp-2603-31', name: 'Meja kuliah lipat + kursi — PS-2603', masterBomId: 'mbom-1', masterName: 'Meja kuliah lipat + kursi', masterVersionAtCopy: 2, copiedAt: '2026-05-25', versions: [v1('2026-05-25', 'Rizal Candra', 'Meja kuliah lipat + kursi', FURNITURE, FURNITURE_COST)] },
  { id: 'cbom-2603-32', projectId: 'ps-2603', wpId: 'wp-2603-32', name: 'Lemari tanam 2 pintu — PS-2603', masterBomId: 'mbom-2', masterName: 'Lemari tanam 2 pintu', masterVersionAtCopy: 1, copiedAt: '2026-06-08', versions: [v1('2026-06-08', 'Rizal Candra', 'Lemari tanam 2 pintu', CABINET, CABINET_COST)] },
  { id: 'cbom-2606-11', projectId: 'ps-2606', wpId: 'wp-2606-11', name: 'Kitchen set L 3 m — tipe A', masterBomId: 'mbom-3', masterName: 'Kitchen set L 3 m', masterVersionAtCopy: 2, copiedAt: '2026-04-21',
    versions: [
      v1('2026-04-21', 'Andi Pratama', 'Kitchen set L 3 m', KITCHEN, KITCHEN_COST),
      { version: 2, createdAt: '2026-06-18', createdBy: 'Andi Pratama', source: 'eco', refNo: 'ECO-2606-01', note: 'Customer asked for solid-surface top instead of granite (new work orders only)',
        components: KITCHEN.map(c => c.name === 'Top table granit' ? { name: 'Top table solid surface', qty: 1, unit: 'Set', unitCost: 3_650_000 } : { ...c }), productionCost: structuredClone(KITCHEN_COST) },
    ] },
  { id: 'cbom-2606-12', projectId: 'ps-2606', wpId: 'wp-2606-12', name: 'Kitchen set L 3 m — tipe B', masterBomId: 'mbom-3', masterName: 'Kitchen set L 3 m', masterVersionAtCopy: 2, copiedAt: '2026-05-12', versions: [v1('2026-05-12', 'Andi Pratama', 'Kitchen set L 3 m', KITCHEN, KITCHEN_COST)] },
  { id: 'cbom-2605-21', projectId: 'ps-2605', wpId: 'wp-2605-21', name: 'Box aluminium truk engkel — PS-2605', masterBomId: 'mbom-4', masterName: 'Box aluminium truk engkel', masterVersionAtCopy: 1, copiedAt: '2026-06-22', versions: [v1('2026-06-22', 'Rizal Candra', 'Box aluminium truk engkel', BOX, BOX_COST)] },
]

const K_M = 'pm-master-boms', K_C = 'pm-custom-boms'
export const masterBoms = reactive<MasterBom[]>(loadSnapshot<MasterBom>(K_M) ?? structuredClone(SEED_MASTERS))
export const customBoms = reactive<CustomBom[]>(loadSnapshot<CustomBom>(K_C) ?? structuredClone(SEED_CUSTOM))
export function persistBoms(): void {
  saveSnapshot(K_M, masterBoms)
  saveSnapshot(K_C, customBoms)
}

export function getCustomBom(id?: string): CustomBom | undefined {
  return id ? customBoms.find(b => b.id === id) : undefined
}
export function currentVersion(b: CustomBom): BomVersion {
  return b.versions[b.versions.length - 1]!
}
export function bomUnitCost(v: Pick<BomVersion, 'components' | 'productionCost'>): number {
  return v.components.reduce((s, c) => s + c.qty * (c.unitCost ?? 0), 0) + v.productionCost.reduce((s, p) => s + p.perUnit, 0)
}
export function masterDiverged(b: CustomBom): boolean {
  const m = masterBoms.find(x => x.id === b.masterBomId)
  return !!m && m.version > b.masterVersionAtCopy
}

/** Duplicate a master into a custom BOM v1 linked to the work package. */
export function copyMasterBom(masterId: string, projectId: string, wpId: string, projectCode: string, by: string, today: string): CustomBom | { error: string } {
  const m = masterBoms.find(x => x.id === masterId)
  if (!m) return { error: 'Master BOM not found' }
  if (!m.components.length) return { error: 'This master BOM has no components, so it can’t be used. Pick another BOM or leave it empty.' }
  const b: CustomBom = {
    id: `cbom-${Date.now().toString(36)}`, projectId, wpId, name: `${m.name} — ${projectCode}`,
    masterBomId: m.id, masterName: m.name, masterVersionAtCopy: m.version, copiedAt: today,
    versions: [{ version: 1, createdAt: today, createdBy: by, source: 'copy', note: `Copied from ${m.name}`, components: structuredClone(m.components), productionCost: structuredClone(m.productionCost) }],
  }
  customBoms.push(b)
  persistBoms()
  return b
}

export function appendVersion(bomId: string, v: Omit<BomVersion, 'version'>): BomVersion | undefined {
  const b = getCustomBom(bomId)
  if (!b) return undefined
  const nv: BomVersion = { ...structuredClone(v), version: b.versions.length + 1 }
  b.versions.push(nv)
  persistBoms()
  return nv
}

export interface BomDiffRow {
  name: string
  change: 'added' | 'removed' | 'changed' | 'same'
  fromQty?: number
  toQty?: number
  unit: string
  fromCost?: number
  toCost?: number
  /** per-unit cost delta; undefined when a component has no standard cost (excluded from total, warned) */
  delta?: number
  noStandardCost?: boolean
}

export function diffComponents(from: BomComponent[], to: BomComponent[]): BomDiffRow[] {
  const rows: BomDiffRow[] = []
  const names = new Set([...from.map(c => c.name), ...to.map(c => c.name)])
  for (const name of names) {
    const a = from.find(c => c.name === name)
    const b = to.find(c => c.name === name)
    const costA = a ? a.qty * (a.unitCost ?? 0) : 0
    const costB = b ? b.qty * (b.unitCost ?? 0) : 0
    const noStd = (!!a && a.unitCost === undefined) || (!!b && b.unitCost === undefined)
    const change = !a ? 'added' : !b ? 'removed' : (a.qty !== b.qty || a.unitCost !== b.unitCost) ? 'changed' : 'same'
    rows.push({ name, change, fromQty: a?.qty, toQty: b?.qty, unit: (b ?? a)!.unit, fromCost: a ? costA : undefined, toCost: b ? costB : undefined, delta: noStd ? undefined : costB - costA, noStandardCost: noStd })
  }
  return rows
}
