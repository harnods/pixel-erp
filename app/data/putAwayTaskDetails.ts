import {
  putAwayTasks, type PutAwayTask,
  type PutAwayBatchAssignment, type PutAwaySerialAssignment,
} from './putAwayTasks'
import { getReceivingTask } from './receivingTasks'
import { CATALOG } from './catalog'
import { binForSku } from './warehouseDetails'

export interface PutAwayLineItem {
  productName: string
  productDesc: string
  skuCode: string
  image: string
  qty: number
  stored: number
  binLocation: string
  unit: string
  /** Every bundled receiving task that contributed to this SKU's qty — a SKU
   *  shared by 2+ bundled receiving tasks is ONE merged row, not split per
   *  source, since put-away doesn't care which receiving task a unit came
   *  from once it's all going into the same bin(s). Shown for traceability
   *  only (e.g. "Receiving #30001, #30002"). */
  receivingTaskNos: string[]
  /** Batch-tracked SKUs only — undefined if the SKU isn't batch-tracked. */
  batchLines?: PutAwayBatchAssignment[]
  /** Serial-tracked SKUs only — undefined if the SKU isn't serial-tracked. */
  serialAssignments?: PutAwaySerialAssignment[]
}

const CATALOG_BY_SKU = new Map(CATALOG.map((p) => [p.sku, p]))

/** The source ReceivingItem for a SKU — the first bundled receiving task that
 *  has it. Used only for display fallbacks (product name/unit); actual qty is
 *  summed across every bundled task in getPutAwayLineItems below. */
function sourceReceivingItem(task: PutAwayTask, skuCode: string) {
  for (const rtId of task.receivingTaskIds) {
    const rt = getReceivingTask(rtId)
    const it = rt?.items.find((x) => x.sku === skuCode)
    if (it) return it
  }
  return undefined
}

/** Batch destination assignments for a SKU — saved progress wins, else the
 *  union of every bundled receiving task's own recorded batches for it. Two
 *  bundled tasks can both report the SAME physical batch number (e.g. one PO
 *  split across receiving tasks) — that must appear as ONE row with qty
 *  summed, not duplicated; a genuinely different batch number stays its own
 *  row. */
function batchLinesFor(task: PutAwayTask, skuCode: string): PutAwayBatchAssignment[] | undefined {
  const saved = task.batchAssignments?.[skuCode]
  if (saved) return saved
  const byBatchNo = new Map<string, PutAwayBatchAssignment>()
  for (const rtId of task.receivingTaskIds) {
    const it = getReceivingTask(rtId)?.items.find((x) => x.sku === skuCode)
    for (const b of it?.batchLines ?? []) {
      const existing = byBatchNo.get(b.batchNo)
      if (!existing) {
        byBatchNo.set(b.batchNo, { ...b, destLocations: b.destLocations?.map((d) => ({ ...d })) })
        continue
      }
      existing.qty += b.qty
      for (const d of b.destLocations ?? []) {
        const dest = existing.destLocations ?? (existing.destLocations = [])
        const match = dest.find((x) => x.locationId === d.locationId)
        if (match) match.qty += d.qty
        else dest.push({ ...d })
      }
    }
  }
  return byBatchNo.size ? [...byBatchNo.values()] : undefined
}

/** Serial destination assignments for a SKU — saved progress wins, else the
 *  union of every bundled receiving task's own recorded serials for it. */
function serialAssignmentsFor(task: PutAwayTask, skuCode: string): PutAwaySerialAssignment[] | undefined {
  const saved = task.serialAssignments?.[skuCode]
  if (saved) return saved
  const merged: PutAwaySerialAssignment[] = []
  for (const rtId of task.receivingTaskIds) {
    const it = getReceivingTask(rtId)?.items.find((x) => x.sku === skuCode)
    if (it?.serialNumbers?.length) merged.push(...it.serialNumbers.map((serial) => ({ serial })))
  }
  return merged.length ? merged : undefined
}

/**
 * Put-away line items = the SKUs received by the bundled receiving task(s), with
 * the received qty as the qty to put away. A SKU shared by 2+ bundled receiving
 * tasks is ONE merged row (qty summed, receivingTaskNos collected) — put-away
 * doesn't need to track which specific receiving task a unit came from, only
 * which bin it ends up in.
 */
export function getPutAwayLineItems(taskId: string): PutAwayLineItem[] {
  const task = putAwayTasks.find((t) => t.id === taskId)
  if (!task) return []

  // When completed or draft-saved, use the saved rows (preserves the draft's
  // qty/bin) — completedItems already has one entry per SKU.
  if ((task.status === 'completed' || task.status === 'in progress') && task.completedItems?.length) {
    return task.completedItems.map((ci) => {
      const it = sourceReceivingItem(task, ci.skuCode)
      const p = CATALOG_BY_SKU.get(ci.skuCode)
      const batchLines = batchLinesFor(task, ci.skuCode)
      const serialAssignments = serialAssignmentsFor(task, ci.skuCode)
      // Batch/serial-tracked rows save ci.qty as the row's TOTAL qty (not a
      // per-bin amount — see buildItemsAndAssignments), so "stored" (how much
      // is REALLY assigned to a bin so far) has to come from the real
      // destination data instead of just echoing ci.qty, same as the
      // never-draft-saved fallback below.
      let stored = ci.qty
      if (task.status !== 'completed') {
        if (batchLines?.length) {
          stored = batchLines.reduce((s, b) => s + (b.destLocations?.reduce((ss, d) => ss + d.qty, 0) ?? 0), 0)
        } else if (serialAssignments?.length) {
          stored = serialAssignments.filter((s) => s.destLocationId).length
        }
      }
      // ci.qty === 0 only ever happens for a row dropAbandonedZeroRows kept
      // specifically because it's the SOLE entry for its key (see
      // putAwayTasks.ts) — i.e. a genuinely untouched SKU, never a real
      // partial split (those always carry their own real, positive qty). Fall
      // back to the receiving task's own recorded qty so "Received qty" shows
      // the true fact of what came in, not "nothing entered into put-away yet".
      const qty = ci.qty > 0 ? ci.qty : (it?.receivedQty ?? 0)
      return {
        productName: it?.productName || p?.name || ci.skuCode,
        productDesc: p?.desc ?? '',
        skuCode: ci.skuCode,
        image: p?.img ?? '',
        qty,
        stored,
        binLocation: ci.binLocation,
        unit: it?.unit || p?.unit || 'Unit',
        receivingTaskNos: task.receivingTaskNos,
        batchLines,
        serialAssignments,
      }
    })
  }

  // Fallback: derive from receiving tasks (seed data / in-progress, never draft-saved).
  // Merge every bundled receiving task's own item for the same SKU into one row.
  const bySku = new Map<string, { qty: number; it: ReturnType<typeof sourceReceivingItem> }>()
  for (const rtId of task.receivingTaskIds) {
    const rt = getReceivingTask(rtId)
    if (!rt) continue
    for (const it of rt.items) {
      if (it.receivedQty <= 0) continue
      const existing = bySku.get(it.sku)
      if (existing) existing.qty += it.receivedQty
      else bySku.set(it.sku, { qty: it.receivedQty, it })
    }
  }

  const out: PutAwayLineItem[] = []
  for (const [sku, { qty, it }] of bySku) {
    const p = CATALOG_BY_SKU.get(sku)
    const batchLines = batchLinesFor(task, sku)
    const serialAssignments = serialAssignmentsFor(task, sku)
    // "Put-away qty" reflects REAL bin/serial assignments only, never a
    // cosmetic simulation — a genuinely untouched task (no completedItems
    // saved yet) has nothing assigned yet, so this is 0 until an operator
    // actually commits a destination (Manage batch/serial, or a saved draft).
    let stored = 0
    if (task.status === 'completed') {
      stored = qty
    } else if (batchLines?.length) {
      stored = batchLines.reduce((s, b) => s + (b.destLocations?.reduce((ss, d) => ss + d.qty, 0) ?? 0), 0)
    } else if (serialAssignments?.length) {
      stored = serialAssignments.filter((s) => s.destLocationId).length
    }
    out.push({
      productName: it?.productName || p?.name || sku,
      productDesc: p?.desc ?? '',
      skuCode: sku,
      image: p?.img ?? '',
      qty,
      stored,
      binLocation: binForSku(task.warehouseId, sku),
      unit: it?.unit || p?.unit || 'Unit',
      receivingTaskNos: task.receivingTaskNos,
      batchLines,
      serialAssignments,
    })
  }
  return out
}

export function allPutAwayTasksFlat(): PutAwayTask[] {
  return [...putAwayTasks]
}
