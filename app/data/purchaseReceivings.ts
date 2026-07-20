import {
  receivingTasksForReceipt,
  createReceivingTask,
  type ReceivingTask,
} from './receivingTasks'

/**
 * "Purchase receiving" rows shown on a receipt's detail page.
 *
 * These are now a thin VIEW over the receipt's real receiving tasks (single
 * source of truth), so the PO detail, the Receiving queue, and the task detail
 * always agree. The shape is kept stable for the existing detail-page templates.
 */
export interface PurchaseReceiving {
  id: string
  receiptId: string
  taskId: string
  receivingNo: string
  date: string
  assignee: string
  skuScope: string
  purchaseQty: number
  /** Sum of this task's own targetQty ("Expected qty") across its lines —
   *  what the task is actually going after, distinct from purchaseQty
   *  (whole-PO scope). */
  expectedQty: number
  receivedQty: number
  skuCount: number
  status: 'open' | 'in progress' | 'pending put-away' | 'completed' | 'canceled'
  startDate?: string
  endDate?: string
}

function toRow(t: ReceivingTask): PurchaseReceiving {
  return {
    id: t.id,
    receiptId: t.receiptId,
    taskId: t.id,
    receivingNo: t.taskNo,
    date: (t.createdDate ?? t.startDate ?? t.endDate ?? '').slice(0, 10),
    assignee: t.assignee,
    skuScope: t.skuScope,
    purchaseQty: t.purchaseQty,
    expectedQty: t.items.reduce((s, it) => s + it.targetQty, 0),
    receivedQty: t.receivedQty,
    skuCount: t.skuCount,
    status: t.status,
    startDate: t.startDate,
    endDate: t.endDate,
  }
}

/** A receipt's receiving tasks, as purchase-receiving rows. */
export function getPurchaseReceivingsForReceipt(receiptId: string): PurchaseReceiving[] {
  return receivingTasksForReceipt(receiptId).map(toRow)
}

/**
 * Legacy create entry point (used by the unmounted PurchaseReceivingModal).
 * Delegates to the real task creator so it stays consistent if ever revived.
 */
export function addPurchaseReceiving(data: {
  receiptId: string
  assignee: string
  skus?: string[]
  // legacy fields accepted (and ignored) so the unmounted modal still type-checks
  date?: string
  skuScope?: string
  skuCount?: number
  purchaseQty?: number
  receivedQty?: number
  status?: string
  startDate?: string
  endDate?: string
  taskId?: string
}): PurchaseReceiving | null {
  const task = createReceivingTask({
    receiptId: data.receiptId,
    assignee: data.assignee,
    skus: data.skus ?? [],
  })
  return task ? toRow(task) : null
}
