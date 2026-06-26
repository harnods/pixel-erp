import type { Receipt } from './receipts'
import { CATALOG } from './catalog'

export interface ReceiptLineItem {
  productId: string
  productName: string
  productDesc: string
  sku: string
  colorHue: number
  image: string
  unit: string
  purchaseQty: number
  storageLocation: string
}

export const BINS = [
  'A-01-01', 'A-01-02', 'A-02-01', 'A-02-03', 'A-03-02',
  'B-01-01', 'B-01-04', 'B-02-02', 'B-03-01', 'B-03-03',
  'C-01-02', 'C-02-01', 'C-02-04', 'C-03-03', 'C-04-01',
  'D-01-03', 'D-02-01', 'D-02-02', 'D-03-04', 'D-04-02',
] as const

export function lineItemsForReceipt(receipt: Receipt): ReceiptLineItem[] {
  const seed = receipt.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const count = Math.min(receipt.skuQty, CATALOG.length)
  const used = new Set<number>()
  const picks: (typeof CATALOG)[number][] = []

  for (let i = 0; i < count; i++) {
    let idx = (seed * 3 + i * 7) % CATALOG.length
    while (used.has(idx)) idx = (idx + 1) % CATALOG.length
    used.add(idx)
    picks.push(CATALOG[idx]!)
  }

  // Distribute purchaseQty with variance so not all items have the same qty
  const weights = picks.map((_, i) => 1 + ((seed * 17 + i * 11) % 7) * 0.3)
  const totalW = weights.reduce((a, b) => a + b, 0)
  const qtys: number[] = []
  let remaining = receipt.purchaseQty

  for (let i = 0; i < count; i++) {
    if (i === count - 1) {
      qtys.push(Math.max(1, remaining))
    } else {
      const q = Math.max(1, Math.round(receipt.purchaseQty * weights[i]! / totalW))
      qtys.push(q)
      remaining -= q
    }
  }

  return picks.map((p, i) => ({
    productId: p.id,
    productName: p.name,
    productDesc: p.desc,
    sku: p.sku,
    colorHue: p.hue,
    image: p.img,
    unit: p.unit,
    purchaseQty: qtys[i]!,
    storageLocation: BINS[(seed + i * 5) % BINS.length]!,
  }))
}
