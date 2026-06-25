import { reactive } from 'vue'
import { receipts } from './receipts'

export interface PurchaseReceiving {
  id: string
  receiptId: string
  receivingNo: string
  date: string          // task creation/assignment date (ISO)
  assignee: string
  skuScope: string      // e.g. "5 SKUs"
  purchaseQty: number
  receivedQty: number
  skuCount: number
  status: 'open' | 'in progress' | 'completed'
  startDate?: string    // ISO — undefined when task hasn't started yet (open)
  endDate?: string      // ISO — undefined when not yet completed
}

const STAFF = [
  'Budi Santoso', 'Dewi Rahayu', 'Rizki Pratama', 'Agus Firmansyah',
  'Sari Indah', 'Hendra Wijaya', 'Citra Kusuma', 'Galih Nugraha',
]

function hash(s: string): number {
  return s.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
}

function shiftDays(iso: string, days: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

let seq = 10090
function nextNo(): string {
  return `Receiving #${seq++}`
}

function generateInitial(): PurchaseReceiving[] {
  const out: PurchaseReceiving[] = []

  receipts.forEach((r) => {
    if (r.status !== 'completed' && r.status !== 'partial reception') return
    const h = hash(r.id)
    const base = r.estimatedArrival

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
          receivingNo: nextNo(),
          date: dateA,
          assignee: STAFF[h % STAFF.length],
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
          receivingNo: nextNo(),
          date: shiftDays(base, -2),
          assignee: STAFF[(h + 2) % STAFF.length],
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
          receivingNo: nextNo(),
          date: dateA,
          assignee: STAFF[h % STAFF.length],
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
          receivingNo: nextNo(),
          date: dateB,
          assignee: STAFF[(h + 3) % STAFF.length],
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
          receivingNo: nextNo(),
          date: dateA,
          assignee: STAFF[(h + 1) % STAFF.length],
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
          receivingNo: nextNo(),
          date: taskDate,
          assignee: STAFF[h % STAFF.length],
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
          receivingNo: nextNo(),
          date: dateA,
          assignee: STAFF[h % STAFF.length],
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
          receivingNo: nextNo(),
          date: dateB,
          assignee: STAFF[(h + 3) % STAFF.length],
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
    receivingNo: nextNo(),
  }
  purchaseReceivings.push(pr)
  return pr
}
