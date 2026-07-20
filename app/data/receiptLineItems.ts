import type { Receipt } from './receipts'
import { CATALOG } from './catalog'
import { binForSku } from './warehouseDetails'

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

// Hand-crafted line items for the demo inbound receipt (rcv-demo-001, see receipts.ts)
// — pins the exact SKU mix (1 batch-tracked, 1 serial-tracked, 1 plain) and per-SKU
// qty so the receiving/put-away flow (including partial receiving) has known, stable
// values to assert against, instead of the hash-derived mix every other receipt gets.
export const DEMO_RECEIPT_ID = 'rcv-demo-001'
const DEMO_INBOUND_SPECS: { sku: string; qty: number }[] = [
  { sku: '1001', qty: 2 }, // batch-tracked — Green Beans Arabica Gayo Grade 1
  { sku: '2004', qty: 2 }, // serial-tracked — Espresso Machine Lever Manual 1-Group
  { sku: '3004', qty: 2 }, // plain/untracked — Coffee Scale 2kg / 0.1g
]
function demoInboundLines(receipt: Receipt): ReceiptLineItem[] {
  return DEMO_INBOUND_SPECS.map(({ sku, qty }) => {
    const p = CATALOG.find((c) => c.sku === sku)!
    return {
      productId: p.id,
      productName: p.name,
      productDesc: p.desc,
      sku: p.sku,
      colorHue: p.hue,
      image: p.img,
      unit: p.unit,
      purchaseQty: qty,
      storageLocation: binForSku(receipt.warehouseId, p.sku),
    }
  })
}

export function lineItemsForReceipt(receipt: Receipt): ReceiptLineItem[] {
  if (receipt.id === DEMO_RECEIPT_ID) return demoInboundLines(receipt)
  // A user-created receipt carries its REAL entered products — use those
  // instead of fabricating an unrelated mix from skuQty/purchaseQty alone
  // (the bug: what was actually entered on Create receipt never matched what
  // the details page showed, because this function never looked at it).
  if (receipt.lineItems?.length) {
    return receipt.lineItems.map(({ productId, qty }) => {
      const p = CATALOG.find((c) => c.id === productId)
      return {
        productId,
        productName: p?.name ?? '',
        productDesc: p?.desc ?? '',
        sku: p?.sku ?? '',
        colorHue: p?.hue ?? 0,
        image: p?.img ?? '',
        unit: p?.unit ?? '',
        purchaseQty: qty,
        storageLocation: binForSku(receipt.warehouseId, p?.sku ?? ''),
      }
    })
  }
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
    storageLocation: binForSku(receipt.warehouseId, p.sku),
  }))
}
