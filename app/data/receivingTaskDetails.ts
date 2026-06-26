import { receivingPOs, type ReceivingTask, type ReceivingPO } from './receivingTasks'
import { putAwayTasks } from './putAwayTasks'
import { BINS } from './receiptLineItems'
import { CATALOG } from './catalog'

export interface TaskLineItem {
  productName: string
  skuCode:     string
  image:       string
  colorHue:    number
  binLocation: string
  expectedQty: number
  receivedQty: number
  unit:        string
}

// Per-task received-qty overrides, recorded when a user ends a receiving session.
// Keyed by taskId → { [skuCode]: receivedQty }. Lets the detail table reflect the
// exact quantities entered (instead of the derived front-fill) for the rest of the
// SPA session, so the demo stays consistent across navigation.
const receivedOverrides: Record<string, Record<string, number>> = {}

export function setTaskReceived(taskId: string, received: Record<string, number>): void {
  receivedOverrides[taskId] = { ...received }
}

function strSeed(s: string): number {
  return s.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
}

/** Distribute received units front-filling (first SKUs are scanned first). */
function distributeReceived(expectedQtys: number[], totalReceived: number): number[] {
  const received = Array(expectedQtys.length).fill(0)
  let rem = totalReceived
  for (let i = 0; i < expectedQtys.length; i++) {
    if (rem <= 0) break
    const take = Math.min(expectedQtys[i]!, rem)
    received[i] = take
    rem -= take
  }
  return received
}

/**
 * Generate line items for a receiving task using the shared product catalog.
 * Products are selected deterministically from the PO's purchaseNo seed so
 * the same PO always shows the same set of products everywhere in the app.
 */
export function getTaskLineItems(task: ReceivingTask, purchaseNo: string): TaskLineItem[] {
  const seed = strSeed(purchaseNo)
  const count = Math.min(task.skuCount, CATALOG.length)

  // Pick products the same way receiptLineItems does — seed * 3 + i * 7 pattern.
  const used = new Set<number>()
  const picks: (typeof CATALOG)[number][] = []
  for (let i = 0; i < count; i++) {
    let idx = (seed * 3 + i * 7) % CATALOG.length
    while (used.has(idx)) idx = (idx + 1) % CATALOG.length
    used.add(idx)
    picks.push(CATALOG[idx]!)
  }

  // Distribute expected qty across SKUs with slight variance.
  const weights = picks.map((_, i) => 1 + ((seed * 17 + i * 11) % 7) * 0.3)
  const totalW = weights.reduce((a, b) => a + b, 0)
  const expectedQtys: number[] = []
  let rem = task.purchaseQty
  for (let i = 0; i < count; i++) {
    if (i === count - 1) {
      expectedQtys.push(Math.max(1, rem))
    } else {
      const q = Math.max(1, Math.round(task.purchaseQty * weights[i]! / totalW))
      expectedQtys.push(q)
      rem -= q
    }
  }

  const receivedQtys = distributeReceived(expectedQtys, task.receivedQty)
  const override = receivedOverrides[task.id]

  return picks.map((p, i) => ({
    productName: p.name,
    skuCode:     p.sku,
    image:       p.img,
    colorHue:    p.hue,
    binLocation: BINS[(seed + i * 5) % BINS.length]!,
    expectedQty: expectedQtys[i]!,
    // Exact per-SKU qty if the user has saved a receiving session; else derived.
    receivedQty: override ? (override[p.sku] ?? 0) : receivedQtys[i]!,
    unit:        p.unit,
  }))
}

/** A put-away task linked to a receiving task (the next step after receiving). */
export interface PutAwayLink {
  id: string
  taskNo: string
  assignee: string
  itemQty: number
  destination: string
  status: 'open' | 'in progress' | 'completed'
  startDate?: string
  endDate?: string
}

/**
 * Put-away task(s) linked to a receiving task — looks up real put-away tasks by task ID.
 * Only completed/pending-put-away tasks have had a put-away created.
 */
export function getPutAwayForTask(task: ReceivingTask): PutAwayLink[] {
  if (task.status !== 'completed' && task.status !== 'pending put-away') return []
  const matching = putAwayTasks.filter((pt) => pt.receivingTaskIds.includes(task.id))
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
