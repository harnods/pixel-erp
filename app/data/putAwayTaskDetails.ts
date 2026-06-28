import { putAwayTasks, type PutAwayTask } from './putAwayTasks'
import { getReceivingTask } from './receivingTasks'
import { BINS } from './receiptLineItems'
import { CATALOG } from './catalog'

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
}

function strSeed(s: string): number {
  return s.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
}

const CATALOG_BY_SKU = new Map(CATALOG.map((p) => [p.sku, p]))

/**
 * Put-away line items = the SKUs received by the bundled receiving task(s), with
 * the received qty as the qty to put away. Derived from the real receiving-task
 * items so the put-away's SKU count always matches its source(s).
 */
export function getPutAwayLineItems(taskId: string): PutAwayLineItem[] {
  const task = putAwayTasks.find((t) => t.id === taskId)
  if (!task) return []

  // When completed via the page, use the saved rows (preserves splits).
  if (task.status === 'completed' && task.completedItems?.length) {
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
        binLocation: BINS[(seed + i * 3) % BINS.length]!,
        unit: it.unit || p?.unit || 'Unit',
        receivingTaskNo: rt.taskNo,
      })
      i++
    }
  }
  return out
}

export function allPutAwayTasksFlat(): PutAwayTask[] {
  return [...putAwayTasks]
}
