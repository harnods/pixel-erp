import { receivingPOs, saveReceivingDraft, type ReceivingTask, type ReceivingPO, type ReceivingBatchLine } from './receivingTasks'
import { putAwayTasks } from './putAwayTasks'
import { CATALOG } from './catalog'
import { binForSku } from './warehouseDetails'

export interface TaskLineItem {
  productName: string
  productDesc: string
  skuCode:     string
  image:       string
  colorHue:    number
  binLocation: string
  expectedQty: number
  /** "Expected qty" shown in the UI — see ReceivingItem.targetQty. */
  targetQty: number
  receivedQty: number
  unit:        string
  /** Per-batch breakdown already recorded for this line (batch-tracked SKUs only). */
  batchLines?: ReceivingBatchLine[]
  /** Serials already recorded for this line (serial-tracked SKUs only). */
  serialNumbers?: string[]
}

const CATALOG_BY_SKU = new Map(CATALOG.map((p) => [p.sku, p]))

/** Save received qty per SKU for a task (kept name for callers) → persists as draft. */
export function setTaskReceived(taskId: string, received: Record<string, number>): void {
  saveReceivingDraft(taskId, received)
}

/**
 * Line items for a receiving task — the task's own per-SKU items (the source of
 * truth), enriched with product image/colour/unit from the shared catalog.
 */
export function getTaskLineItems(task: ReceivingTask): TaskLineItem[] {
  return task.items.map((it) => {
    const p = CATALOG_BY_SKU.get(it.sku)
    return {
      productName: it.productName || p?.name || it.sku,
      productDesc: p?.desc ?? '',
      skuCode:     it.sku,
      image:       p?.img ?? '',
      colorHue:    p?.hue ?? 200,
      binLocation: binForSku(task.warehouseId, it.sku),
      expectedQty: it.expectedQty,
      targetQty:   it.targetQty,
      receivedQty: it.receivedQty,
      unit:        it.unit || p?.unit || 'Unit',
      batchLines:    it.batchLines,
      serialNumbers: it.serialNumbers,
    }
  })
}

/** A put-away task linked to a receiving task (the next step after receiving). */
export interface PutAwayLink {
  id: string
  taskNo: string
  assignee: string
  itemQty: number
  destination: string
  status: 'open' | 'in progress' | 'completed' | 'canceled'
  startDate?: string
  endDate?: string
}

/**
 * Put-away task(s) linked to a receiving task — looks up real put-away tasks by task ID.
 * Only completed/pending-put-away tasks have had a put-away created.
 */
export function getPutAwayForTask(task: ReceivingTask): PutAwayLink[] {
  if (task.status !== 'completed' && task.status !== 'pending put-away') return []
  // A canceled put-away is not a live downstream transaction — once it's canceled the
  // receiving task reverts to "pending put-away" and awaits a fresh put-away, so the
  // canceled one shouldn't linger in the linked-transactions list.
  const matching = putAwayTasks.filter((pt) => pt.receivingTaskIds.includes(task.id) && pt.status !== 'canceled')
  return matching.map((pt) => ({
    id: pt.id,
    taskNo: pt.taskNo,
    assignee: pt.assignee,
    itemQty: pt.itemQty,
    destination: pt.destination,
    status: pt.status,
    startDate: pt.startDate,
    endDate: pt.endDate,
  }))
}

/** Find a task and its parent PO. Returns null if not found. */
export function findTaskWithPO(taskId: string): { task: ReceivingTask; po: ReceivingPO } | null {
  for (const po of receivingPOs) {
    const task = po.tasks.find(t => t.id === taskId)
    if (task) return { task, po }
  }
  return null
}

/** All tasks across all POs (flat), for the jump switcher. */
export function allTasksFlat(): Array<ReceivingTask & { purchaseNo: string; warehouseName: string }> {
  return receivingPOs.flatMap(po =>
    po.tasks.map(t => ({ ...t, purchaseNo: po.purchaseNo, warehouseName: po.warehouseName })),
  )
}
