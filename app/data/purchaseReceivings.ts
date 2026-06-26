import { reactive } from 'vue'
import { receipts } from './receipts'
import { receivingTaskRefsForWarehouse } from './receivingTasks'
import { picForWarehouse } from './warehouses'

export interface PurchaseReceiving {
  id: string
  receiptId: string
  taskId: string
  receivingNo: string
  date: string          // task creation/assignment date (ISO)
  assignee: string
  skuScope: string      // e.g. "5 SKUs"
  purchaseQty: number
  receivedQty: number
  skuCount: number
  status: 'open' | 'in progress' | 'pending put-away' | 'completed'
  startDate?: string    // ISO — undefined when task hasn't started yet (open)
  endDate?: string      // ISO — undefined when not yet completed
}


function hash(s: string): number {
  return s.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
}

function shiftDays(iso: string, days: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// Fallback task numbers (used only when a warehouse has no receiving tasks of
// its own) — kept in the rtask-10090… range so they never collide.
function taskNo(h: number, offset = 0): string {
  return `Receiving #${10090 + ((h + offset) % 30)}`
}
function taskId(h: number, offset = 0): string {
  return `rtask-${10090 + ((h + offset) % 30)}`
}

// Counter only used for dynamically-added entries (via addPurchaseReceiving).
let prSeq = 20000
function nextPrNo(): string { return `Receiving #${prSeq++}` }

function generateInitial(): PurchaseReceiving[] {
  const out: PurchaseReceiving[] = []

  receipts.forEach((r) => {
    if (r.status !== 'completed' && r.status !== 'partial reception') return
    const h = hash(r.id)
    const base = r.estimatedArrival

    // A receipt's purchase-receiving tasks are real receiving tasks in the
    // receipt's own warehouse (so number, assignee and links all stay in-warehouse).
    // Prefer tasks whose goods have actually been received so a "completed"
    // purchase-receiving row never links to a still-in-progress receiving task.
    const allRefs = receivingTaskRefsForWarehouse(r.warehouseId)
    const receivedRefs = allRefs.filter(
      (t) => t.status === 'completed' || t.status === 'pending put-away',
    )
    const refs = receivedRefs.length ? receivedRefs : allRefs
    const refA = refs.length ? refs[h % refs.length]! : undefined
    const refB = refs.length ? refs[(h + 1) % refs.length]! : undefined
    const taskIdA = refA?.id ?? taskId(h)
    const taskNoA = refA?.no ?? taskNo(h)
    const taskIdB = refB?.id ?? taskId(h, 4)
    const taskNoB = refB?.no ?? taskNo(h, 4)

    if (r.status === 'partial reception') {
      // A partial PO always has at least 1 completed task.
      // Variants (by h % 3):
      //   0 → 2 tasks: 1st completed (batch A done), 2nd still open (batch B not yet started)
      //   1 → 2 tasks: 1st completed (batch A done), 2nd in progress (actively receiving batch B)
      //   2 → 1 task: completed, but received qty < purchase qty (supplier short-shipped, accepted)
      const variant = h % 3

      if (variant === 0) {
        // Batch A completed, Batch B open
        const skuA = Math.max(1, Math.ceil(r.skuQty * 0.6))
        const skuB = r.skuQty - skuA
        const qtyA = Math.round(r.purchaseQty * 0.6)
        const dateA = shiftDays(base, -5)
        out.push({
          id: `pr-${r.id}-1`,
          receiptId: r.id,
          taskId: taskIdA,
          receivingNo: taskNoA,
          date: dateA,
          assignee: picForWarehouse(r.warehouseId, 0),
          skuScope: `${skuA} SKUs`,
          purchaseQty: qtyA,
          receivedQty: Math.round(r.receivedQty * 0.6),
          skuCount: skuA,
          status: 'completed',
          startDate: dateA,
          endDate: shiftDays(dateA, 2),
        })
        out.push({
          id: `pr-${r.id}-2`,
          receiptId: r.id,
          taskId: taskIdB,
          receivingNo: taskNoB,
          date: shiftDays(base, -2),
          assignee: picForWarehouse(r.warehouseId, 1),
          skuScope: `${skuB} SKUs`,
          purchaseQty: r.purchaseQty - qtyA,
          receivedQty: 0,
          skuCount: skuB,
          status: 'open',
          startDate: undefined,
          endDate: undefined,
        })
      } else if (variant === 1) {
        // Batch A completed, Batch B in progress
        const skuA = Math.max(1, Math.floor(r.skuQty * 0.55))
        const skuB = r.skuQty - skuA
        const qtyA = Math.round(r.purchaseQty * 0.55)
        const dateA = shiftDays(base, -4)
        const dateB = shiftDays(base, -1)
        out.push({
          id: `pr-${r.id}-1`,
          receiptId: r.id,
          taskId: taskIdA,
          receivingNo: taskNoA,
          date: dateA,
          assignee: picForWarehouse(r.warehouseId, 0),
          skuScope: `${skuA} SKUs`,
          purchaseQty: qtyA,
          receivedQty: Math.round(r.receivedQty * 0.55),
          skuCount: skuA,
          status: 'completed',
          startDate: dateA,
          endDate: shiftDays(dateA, 1),
        })
        out.push({
          id: `pr-${r.id}-2`,
          receiptId: r.id,
          taskId: taskIdB,
          receivingNo: taskNoB,
          date: dateB,
          assignee: picForWarehouse(r.warehouseId, 1),
          skuScope: `${skuB} SKUs`,
          purchaseQty: r.purchaseQty - qtyA,
          receivedQty: Math.round((r.purchaseQty - qtyA) * 0.4),
          skuCount: skuB,
          status: 'in progress',
          startDate: dateB,
          endDate: undefined,
        })
      } else {
        // Single task: completed but short-received (supplier delivered less than ordered)
        const dateA = shiftDays(base, -(h % 3 + 2))
        out.push({
          id: `pr-${r.id}-1`,
          receiptId: r.id,
          taskId: taskIdA,
          receivingNo: taskNoA,
          date: dateA,
          assignee: picForWarehouse(r.warehouseId, 0),
          skuScope: `${r.skuQty} SKUs`,
          purchaseQty: r.purchaseQty,
          receivedQty: r.receivedQty,
          skuCount: r.skuQty,
          status: 'completed',
          startDate: dateA,
          endDate: shiftDays(dateA, 1),
        })
      }
    } else {
      // Completed PO: all tasks are completed and goods are fully received.
      // Variants (by h % 2):
      //   0 → 1 task: completed, full qty (single-delivery PO)
      //   1 → 2 tasks: both completed (split into two batches, both done)
      const variant = h % 2

      if (variant === 0) {
        const taskDate = shiftDays(base, -(h % 3 + 2))
        out.push({
          id: `pr-${r.id}-1`,
          receiptId: r.id,
          taskId: taskIdA,
          receivingNo: taskNoA,
          date: taskDate,
          assignee: picForWarehouse(r.warehouseId, 0),
          skuScope: `${r.skuQty} SKUs`,
          purchaseQty: r.purchaseQty,
          receivedQty: r.receivedQty,
          skuCount: r.skuQty,
          status: 'completed',
          startDate: taskDate,
          endDate: shiftDays(taskDate, 1),
        })
      } else {
        // Split into 2 batches, both completed
        const skuA = Math.ceil(r.skuQty * 0.55)
        const skuB = r.skuQty - skuA
        const qtyA = Math.round(r.purchaseQty * 0.55)
        const dateA = shiftDays(base, -(h % 4 + 4))
        const dateB = shiftDays(dateA, 2)
        out.push({
          id: `pr-${r.id}-1`,
          receiptId: r.id,
          taskId: taskIdA,
          receivingNo: taskNoA,
          date: dateA,
          assignee: picForWarehouse(r.warehouseId, 0),
          skuScope: `${skuA} SKUs`,
          purchaseQty: qtyA,
          receivedQty: Math.round(r.receivedQty * 0.55),
          skuCount: skuA,
          status: 'completed',
          startDate: dateA,
          endDate: shiftDays(dateA, 1),
        })
        out.push({
          id: `pr-${r.id}-2`,
          receiptId: r.id,
          taskId: taskIdB,
          receivingNo: taskNoB,
          date: dateB,
          assignee: picForWarehouse(r.warehouseId, 1),
          skuScope: `${skuB} SKUs`,
          purchaseQty: r.purchaseQty - qtyA,
          receivedQty: r.receivedQty - Math.round(r.receivedQty * 0.55),
          skuCount: skuB,
          status: 'completed',
          startDate: dateB,
          endDate: shiftDays(dateB, 1),
        })
      }
    }
  })

  return out
}

export const purchaseReceivings = reactive<PurchaseReceiving[]>(generateInitial())

export function getPurchaseReceivingsForReceipt(receiptId: string): PurchaseReceiving[] {
  return purchaseReceivings.filter((pr) => pr.receiptId === receiptId)
}

export function addPurchaseReceiving(
  data: Omit<PurchaseReceiving, 'id' | 'receivingNo'>,
): PurchaseReceiving {
  const pr: PurchaseReceiving = {
    ...data,
    id: `pr-${data.receiptId}-${purchaseReceivings.length + 1}`,
    receivingNo: nextPrNo(),
  }
  purchaseReceivings.push(pr)
  return pr
}
