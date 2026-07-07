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
  receivingTaskNo: string
  /** Batch-tracked SKUs only — undefined if the SKU isn't batch-tracked. */
  batchLines?: PutAwayBatchAssignment[]
  /** Serial-tracked SKUs only — undefined if the SKU isn't serial-tracked. */
  serialAssignments?: PutAwaySerialAssignment[]
}

function strSeed(s: string): number {
  return s.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
}

const CATALOG_BY_SKU = new Map(CATALOG.map((p) => [p.sku, p]))

/** The source ReceivingItem for a SKU, across this put-away's bundled receiving tasks. */
function sourceReceivingItem(task: PutAwayTask, skuCode: string) {
  for (const rtId of task.receivingTaskIds) {
    const rt = getReceivingTask(rtId)
    const it = rt?.items.find((x) => x.sku === skuCode)
    if (it) return it
  }
  return undefined
}

/** Batch destination assignments for a SKU — saved progress wins, else fresh from receiving. */
function batchLinesFor(task: PutAwayTask, skuCode: string): PutAwayBatchAssignment[] | undefined {
  const saved = task.batchAssignments?.[skuCode]
  if (saved) return saved
  const src = sourceReceivingItem(task, skuCode)?.batchLines
  return src?.length ? src.map((b) => ({ ...b })) : undefined
}

/** Serial destination assignments for a SKU — saved progress wins, else fresh from receiving. */
function serialAssignmentsFor(task: PutAwayTask, skuCode: string): PutAwaySerialAssignment[] | undefined {
  const saved = task.serialAssignments?.[skuCode]
  if (saved) return saved
  const src = sourceReceivingItem(task, skuCode)?.serialNumbers
  return src?.length ? src.map((serial) => ({ serial })) : undefined
}

/**
 * Put-away line items = the SKUs received by the bundled receiving task(s), with
 * the received qty as the qty to put away. Derived from the real receiving-task
 * items so the put-away's SKU count always matches its source(s).
 */
export function getPutAwayLineItems(taskId: string): PutAwayLineItem[] {
  const task = putAwayTasks.find((t) => t.id === taskId)
  if (!task) return []

  // When completed or draft-saved, use the saved rows (preserves splits and draft locations).
  if ((task.status === 'completed' || task.status === 'in progress') && task.completedItems?.length) {
    // Build a sku → product+receiving info lookup from the source receiving tasks.
    const skuMeta = new Map<string, {
      productName: string; productDesc: string; image: string
      unit: string; receivingTaskNo: string
    }>()
    for (const rtId of task.receivingTaskIds) {
      const rt = getReceivingTask(rtId)
      if (!rt) continue
      for (const it of rt.items) {
        if (!skuMeta.has(it.sku)) {
          const p = CATALOG_BY_SKU.get(it.sku)
          skuMeta.set(it.sku, {
            productName: it.productName || p?.name || it.sku,
            productDesc: p?.desc ?? '',
            image: p?.img ?? '',
            unit: it.unit || p?.unit || 'Unit',
            receivingTaskNo: rt.taskNo,
          })
        }
      }
    }
    return task.completedItems.map((ci) => {
      const m = skuMeta.get(ci.skuCode)
      return {
        productName: m?.productName ?? ci.skuCode,
        productDesc: m?.productDesc ?? '',
        skuCode: ci.skuCode,
        image: m?.image ?? '',
        qty: ci.qty,
        stored: ci.qty,
        binLocation: ci.binLocation,
        unit: m?.unit ?? 'Unit',
        receivingTaskNo: m?.receivingTaskNo ?? '',
        batchLines: batchLinesFor(task, ci.skuCode),
        serialAssignments: serialAssignmentsFor(task, ci.skuCode),
      }
    })
  }

  // Fallback: derive from receiving tasks (seed data / in-progress).
  const seed = strSeed(taskId)
  const out: PutAwayLineItem[] = []
  let i = 0
  for (const rtId of task.receivingTaskIds) {
    const rt = getReceivingTask(rtId)
    if (!rt) continue
    for (const it of rt.items) {
      const qty = it.receivedQty
      if (qty <= 0) continue
      const p = CATALOG_BY_SKU.get(it.sku)
      let stored = 0
      if (task.status === 'completed') stored = qty
      else if (task.status === 'in progress') {
        const pct = 0.3 + ((seed * 13 + i * 5) % 5) * 0.1
        stored = Math.min(qty - 1, Math.max(0, Math.round(qty * pct)))
      }
      out.push({
        productName: it.productName || p?.name || it.sku,
        productDesc: p?.desc ?? '',
        skuCode: it.sku,
        image: p?.img ?? '',
        qty,
        stored,
        binLocation: binForSku(task.warehouseId, it.sku),
        unit: it.unit || p?.unit || 'Unit',
        receivingTaskNo: rt.taskNo,
        batchLines: batchLinesFor(task, it.sku),
        serialAssignments: serialAssignmentsFor(task, it.sku),
      })
      i++
    }
  }
  return out
}

export function allPutAwayTasksFlat(): PutAwayTask[] {
  return [...putAwayTasks]
}
