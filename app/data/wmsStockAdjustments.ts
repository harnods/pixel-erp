import { reactive } from 'vue'
import { warehouses } from './warehouses'
import { operatorForWarehouse } from './warehouseTeam'
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

function countStatusFor(i: number): AdjustmentStatus {
  const v = hash100(i * 41 + 11)
  if (v < 25) return 'not_started'
  if (v < 55) return 'in_progress'
  if (v < 80) return 'counted'
  return 'completed'
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
    const status = kind === 'count' ? countStatusFor(i) : 'completed'
    const record: StockAdjustment = {
      id: `${kind === 'count' ? 'cc' : 'wsa'}-${String(i + 1).padStart(3, '0')}`,
      kind,
      number: `${kind === 'count' ? 'Cycle Count' : 'Stock In/Out'} #${seq}`,
      date: isoOffset(-startDaysAgo),
      warehouseId: wh.id,
      warehouseName: wh.name,
      category,
      account: accountForCategory(category),
      status,
      tags: tagsFor(i),
    }
    if (kind === 'count') {
      record.assignee = operatorForWarehouse(wh.id, hash100(i * 19 + 7))
      const startHour = 7 + (hash100(i * 23 + 1) % 4)
      const startMin = (hash100(i * 29 + 2) % 4) * 15
      const endHour = 14 + (hash100(i * 31 + 3) % 5)
      const endMin = (hash100(i * 37 + 4) % 4) * 15
      if (status === 'in_progress' || status === 'counted' || status === 'completed') {
        record.startDate = isoOffsetTs(-startDaysAgo, startHour, startMin)
      }
      if (status === 'counted' || status === 'completed') {
        record.endDate = isoOffsetTs(-startDaysAgo + durationDays, endHour, endMin)
      }
    }
    out.push(record)
  }
  return out
}

const KEY = 'wms-stock-adjustments-v7'
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

/** Count tasks still open (not yet counted or completed) — badge for the "Count task" tab. */
export function openWmsCountTaskCount(): number {
  return wmsStockAdjustments.filter((a) => a.kind === 'count' && a.status !== 'completed' && a.status !== 'counted').length
}

/** Count tasks counted but not yet reviewed by a manager — badge for the "Awaiting approval" tab. */
export function awaitingWmsCountApprovalCount(): number {
  return wmsStockAdjustments.filter((a) => a.kind === 'count' && a.status === 'counted').length
}

/** A WMS Stock In/Out record is completed the instant it's created (stock applies
 *  immediately, no draft window) — nothing is ever cancelable there. A Cycle Count
 *  task is cancelable while not yet started or still being counted; once finished,
 *  applyStockCount has already run and the record is a permanent one. */
export function canCancelWmsAdjustment(a: StockAdjustment): boolean {
  return a.kind === 'count' && (a.status === 'not_started' || a.status === 'in_progress')
}

/** Cancel a not-yet-finished cycle count — it never gets counted/applied. Terminal
 *  state; the record itself is kept (never deleted) so it stays in the audit trail. */
export function cancelWmsAdjustment(id: string, reason?: string): void {
  const a = wmsStockAdjustments.find((x) => x.id === id)
  if (!a || !canCancelWmsAdjustment(a)) return
  a.status = 'canceled'
  a.canceledDate = new Date().toISOString()
  if (reason) a.canceledReason = reason
  persist()
}

let addSeq = wmsStockAdjustments.length

function nextSeqFor(kind: AdjustmentKind): number {
  const prefix = kind === 'count' ? 'Cycle Count' : 'Stock In/Out'
  const used = wmsStockAdjustments
    .filter((a) => a.number.startsWith(prefix))
    .map((a) => Number(a.number.replace(/\D/g, '')) || 0)
  return Math.max(20089, ...used) + 1
}

/** Create a WMS adjustment — applied to stock immediately, no approval step. */
export function addWmsAdjustment(input: AdjustmentInput): StockAdjustment {
  const n = addSeq++
  const adj: StockAdjustment = {
    id: `${input.kind === 'count' ? 'cc' : 'wsa'}-new-${n}`,
    kind: input.kind,
    number: `${input.kind === 'count' ? 'Cycle Count' : 'Stock In/Out'} #${nextSeqFor(input.kind)}`,
    date: input.date,
    warehouseId: input.warehouseId,
    warehouseName: input.warehouseName,
    category: input.category,
    account: accountForCategory(input.category),
    status: input.kind === 'count' ? 'not_started' : 'completed',
    tags: input.tags,
    memo: input.memo,
    lines: input.lines,
    assignee: input.assignee,
    startDate: input.startDate,
    endDate: input.endDate,
  }
  // Count tasks: stock applied when counting is completed, not on creation.
  if (input.kind === 'in-out') {
    applyStockInOut(input.warehouseId, input.lines)
  }
  wmsStockAdjustments.unshift(adj)
  persist()
  return adj
}

export function startWmsCount(id: string): StockAdjustment | undefined {
  const a = wmsStockAdjustments.find(x => x.id === id)
  if (!a || a.kind !== 'count' || a.status !== 'not_started') return a
  a.status = 'in_progress'
  a.startDate = new Date().toISOString()
  persist()
  return a
}

export function saveWmsCountDraft(id: string, lines: { sku: string; qty: number; location?: string }[]): StockAdjustment | undefined {
  const a = wmsStockAdjustments.find(x => x.id === id)
  if (!a || a.kind !== 'count') return a
  a.lines = lines
  persist()
  return a
}

// Finishing a count doesn't apply stock yet — it moves the task to "Counted"
// (Awaiting approval tab) and waits for a manager to review it. Stock only
// changes once approveWmsAdjustment runs.
export function finishWmsCount(id: string, lines: { sku: string; qty: number; location?: string }[]): StockAdjustment | undefined {
  const a = wmsStockAdjustments.find(x => x.id === id)
  if (!a || a.kind !== 'count') return a
  a.status = 'counted'
  a.endDate = new Date().toISOString()
  a.lines = lines
  persist()
  return a
}

const ACTOR = 'Rizal Candra'

/** Manager approves a "Counted" task — applies the count to stock and marks it completed. */
export function approveWmsAdjustment(id: string): StockAdjustment | undefined {
  const a = wmsStockAdjustments.find((x) => x.id === id)
  if (!a || a.status !== 'counted') return a
  const lines = a.lines ?? adjustmentLineItems(a).map((l) => ({ sku: l.sku, qty: l.counted }))
  applyStockCount(a.warehouseId, lines)
  a.status = 'completed'
  a.approvedBy = ACTOR
  a.approvedAt = new Date().toISOString()
  persist()
  return a
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

export function activeWmsAdjustmentsFor(warehouseId: string, assignee: string): StockAdjustment[] {
  return wmsStockAdjustments.filter(
    (a) => a.warehouseId === warehouseId && a.assignee === assignee && a.status !== 'completed',
  );
}

export function reassignWmsAdjustments(warehouseId: string, fromName: string, toName: string): void {
  for (const a of activeWmsAdjustmentsFor(warehouseId, fromName)) a.assignee = toName;
  persist();
}

export { accountForCategory, accountCodeFor, adjustmentLineItems }
