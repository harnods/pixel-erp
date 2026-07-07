import { reactive } from 'vue'
import { warehouses } from './warehouses'
import { warehouseProducts, PRODUCTS } from './inventory'
import { applyStockCount, applyStockInOut } from './warehouseDetails'
import { loadSnapshot, saveSnapshot } from './persist'
import { TODAY } from './master'
import {
  accountForCategory, accountCodeFor,
  type AdjustmentKind, type AdjustmentCategory, type AdjustmentStatus,
  type StockAdjustment, type AdjustmentInput, type AdjustmentLine,
  IN_OUT_CATEGORIES, adjustmentLineItems,
} from './stockAdjustments'

export type { AdjustmentKind, AdjustmentCategory, AdjustmentStatus, StockAdjustment, AdjustmentInput, AdjustmentLine }

/**
 * WMS stock adjustments — separate data store from ERP. No approval workflow:
 * records are created directly as 'completed' and stock is applied immediately.
 */

const WMS_WAREHOUSES = warehouses.filter((w) => !w.isDefault && w.status === 'active')
const WMS_COUNT_WAREHOUSES = WMS_WAREHOUSES.filter((w) => w.hasStorageLocations !== false)

function hash100(i: number): number {
  let x = ((i + 1) * 2654435761) >>> 0
  x ^= x >>> 15
  x = (x * 2246822519) >>> 0
  x ^= x >>> 13
  return (x >>> 0) % 100
}

function isoOffset(days: number): string {
  const d = new Date(TODAY)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function isoOffsetTs(days: number, hour: number, minute: number): string {
  const d = new Date(TODAY)
  d.setDate(d.getDate() + days)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

const ASSIGNEES = ['Budi Santoso', 'Siti Rahayu', 'Andi Wijaya', 'Dewi Kusuma', 'Reza Pratama', 'Lina Handayani']

const TAG_POOL = ['Recount', 'Audit', 'Damaged', 'Expired', 'Promo', 'Year-end', 'Production', 'Correction']

function tagsFor(i: number): string[] {
  const n = hash100(i * 13) % 4
  const out: string[] = []
  for (let k = 0; k < n; k++) out.push(TAG_POOL[(hash100(i * 5 + k * 17)) % TAG_POOL.length]!)
  return [...new Set(out)]
}

function kindFor(i: number): AdjustmentKind {
  return hash100(i * 3 + 1) < 40 ? 'count' : 'in-out'
}

function categoryFor(i: number, kind: AdjustmentKind): AdjustmentCategory {
  if (kind === 'count') return 'Stock count'
  return IN_OUT_CATEGORIES[hash100(i * 11 + 5) % IN_OUT_CATEGORIES.length]!
}

function generate(count = 24): StockAdjustment[] {
  const out: StockAdjustment[] = []
  const whCount = WMS_WAREHOUSES.length
  const countWhCount = WMS_COUNT_WAREHOUSES.length
  if (!whCount) return out
  let countSeq = 20090
  let inoutSeq = 20090
  for (let i = 0; i < count; i++) {
    const kind = kindFor(i)
    const category = categoryFor(i, kind)
    const whPool = kind === 'count' && countWhCount > 0 ? WMS_COUNT_WAREHOUSES : WMS_WAREHOUSES
    const wh = whPool[hash100(i * 9 + 2) % whPool.length]!
    const seq = kind === 'count' ? countSeq++ : inoutSeq++
    const startDaysAgo = (hash100(i * 17) % 40) + 1
    const durationDays = (hash100(i * 7 + 3) % 5) + 1
    const record: StockAdjustment = {
      id: `wsa-${String(i + 1).padStart(3, '0')}`,
      kind,
      number: `${kind === 'count' ? 'Stock Count' : 'Stock In/Out'} #${seq}`,
      date: isoOffset(-startDaysAgo),
      warehouseId: wh.id,
      warehouseName: wh.name,
      category,
      account: accountForCategory(category),
      status: 'completed',
      tags: tagsFor(i),
    }
    if (kind === 'count') {
      record.assignee = ASSIGNEES[hash100(i * 19 + 7) % ASSIGNEES.length]
      const startHour = 7 + (hash100(i * 23 + 1) % 4)
      const startMin = (hash100(i * 29 + 2) % 4) * 15
      const endHour = 14 + (hash100(i * 31 + 3) % 5)
      const endMin = (hash100(i * 37 + 4) % 4) * 15
      record.startDate = isoOffsetTs(-startDaysAgo, startHour, startMin)
      record.endDate = isoOffsetTs(-startDaysAgo + durationDays, endHour, endMin)
    }
    out.push(record)
  }
  return out
}

const KEY = 'wms-stock-adjustments-v4'
const snapshot = loadSnapshot<StockAdjustment>(KEY)
export const wmsStockAdjustments = reactive<StockAdjustment[]>(snapshot ?? generate())

function persist(): void {
  saveSnapshot(KEY, wmsStockAdjustments)
}

export function getWmsAdjustment(id: string): StockAdjustment | undefined {
  return wmsStockAdjustments.find((a) => a.id === id)
}

export function wmsAdjustmentWarehouseOptions(): { value: string; label: string }[] {
  const seen = new Map<string, string>()
  for (const a of wmsStockAdjustments) seen.set(a.warehouseId, a.warehouseName)
  return [...seen.entries()].map(([value, label]) => ({ value, label }))
}

export function deleteWmsAdjustments(ids: string[]): void {
  const set = new Set(ids)
  for (let i = wmsStockAdjustments.length - 1; i >= 0; i--) {
    if (set.has(wmsStockAdjustments[i]!.id)) wmsStockAdjustments.splice(i, 1)
  }
  persist()
}

let addSeq = wmsStockAdjustments.length

function nextSeqFor(kind: AdjustmentKind): number {
  const prefix = kind === 'count' ? 'Stock Count' : 'Stock In/Out'
  const used = wmsStockAdjustments
    .filter((a) => a.number.startsWith(prefix))
    .map((a) => Number(a.number.replace(/\D/g, '')) || 0)
  return Math.max(20089, ...used) + 1
}

/** Create a WMS adjustment — applied to stock immediately, no approval step. */
export function addWmsAdjustment(input: AdjustmentInput): StockAdjustment {
  const n = addSeq++
  const adj: StockAdjustment = {
    id: `wsa-new-${n}`,
    kind: input.kind,
    number: `${input.kind === 'count' ? 'Stock Count' : 'Stock In/Out'} #${nextSeqFor(input.kind)}`,
    date: input.date,
    warehouseId: input.warehouseId,
    warehouseName: input.warehouseName,
    category: input.category,
    account: accountForCategory(input.category),
    status: 'completed',
    tags: input.tags,
    memo: input.memo,
    lines: input.lines,
    assignee: input.assignee,
    startDate: input.startDate,
    endDate: input.endDate,
  }
  // Apply stock changes immediately (no approval needed in WMS).
  if (input.kind === 'count') {
    applyStockCount(input.warehouseId, input.lines)
  } else {
    applyStockInOut(input.warehouseId, input.lines)
  }
  wmsStockAdjustments.unshift(adj)
  persist()
  return adj
}

export function updateWmsAdjustment(id: string, input: AdjustmentInput): StockAdjustment | undefined {
  const a = wmsStockAdjustments.find((x) => x.id === id)
  if (!a) return undefined
  Object.assign(a, {
    date: input.date,
    warehouseId: input.warehouseId,
    warehouseName: input.warehouseName,
    category: input.category,
    account: accountForCategory(input.category),
    tags: input.tags,
    memo: input.memo,
    lines: input.lines,
  })
  persist()
  return a
}

export { accountForCategory, accountCodeFor, adjustmentLineItems }
