import { putAwayTasks, type PutAwayTask } from './putAwayTasks'
import { BINS } from './receiptLineItems'
import { CATALOG } from './catalog'

export interface PutAwayLineItem {
  productName: string
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

export function getPutAwayLineItems(taskId: string): PutAwayLineItem[] {
  const task = putAwayTasks.find(t => t.id === taskId)
  if (!task) return []

  const seed = strSeed(taskId)
  const count = Math.min(3 + (seed % 4), CATALOG.length) // 3–6 items

  const used = new Set<number>()
  const picks: (typeof CATALOG)[number][] = []
  for (let i = 0; i < count; i++) {
    let idx = (seed * 3 + i * 7) % CATALOG.length
    while (used.has(idx)) idx = (idx + 1) % CATALOG.length
    used.add(idx)
    picks.push(CATALOG[idx]!)
  }

  const weights = picks.map((_, i) => 1 + ((seed * 17 + i * 11) % 7) * 0.3)
  const totalW = weights.reduce((a, b) => a + b, 0)
  const qtys: number[] = []
  let remaining = task.itemQty
  for (let i = 0; i < count; i++) {
    if (i === count - 1) { qtys.push(Math.max(1, remaining)) }
    else { const q = Math.max(1, Math.round(task.itemQty * weights[i]! / totalW)); qtys.push(q); remaining -= q }
  }

  return picks.map((p, i) => {
    const qty = qtys[i]!
    let stored = 0
    if (task.status === 'completed') {
      stored = qty
    } else if (task.status === 'in progress') {
      const pct = 0.3 + ((seed * 13 + i * 5) % 5) * 0.1
      stored = Math.min(qty - 1, Math.max(0, Math.round(qty * pct)))
    }
    const rtNo = task.receivingTaskNos[(seed + i) % task.receivingTaskNos.length]
    return {
      productName: p.name,
      skuCode: p.sku,
      image: p.img,
      qty,
      stored,
      binLocation: BINS[(seed + i * 3) % BINS.length]!,
      unit: p.unit,
      receivingTaskNo: rtNo!,
    }
  })
}

export function allPutAwayTasksFlat(): PutAwayTask[] {
  return [...putAwayTasks]
}
