import type { SalesOrder, SalesOrderItem, SalesOrderStatus } from './types'

/**
 * Mock sales orders for a wholesale + retail coffee business
 * (coffee beans, machines, accessories). 100 records, generated deterministically.
 *
 * This file is the **single source of truth**: each order's line items drive its
 * subtotal → tax → total, and the status drives the balance due. The detail page
 * ([salesOrderDetails.ts](salesOrderDetails.ts)) reuses these items + `computeTotals`
 * so the index row and the detail view always agree.
 */

const CUSTOMERS: { id: string; name: string }[] = [
  { id: 'C001', name: 'Anomali Coffee' },
  { id: 'C002', name: 'Tanamera Coffee Roastery' },
  { id: 'C003', name: 'Hotel Mulia Senayan' },
  { id: 'C004', name: 'Fore Coffee Thamrin' },
  { id: 'C005', name: 'Djournal Coffee' },
  { id: 'C006', name: 'Kopi Kenangan Pusat' },
  { id: 'C007', name: 'Common Grounds PIK' },
  { id: 'C008', name: 'Titik Temu Coffee' },
  { id: 'C009', name: 'Maxx Coffee Lippo Mall' },
  { id: 'C010', name: 'Janji Jiwa Kemang' },
  { id: 'C011', name: 'Tuku Coffee Cipete' },
  { id: 'C012', name: 'Coffee Cult Bali' },
  { id: 'C013', name: 'Excelso Grand Indonesia' },
  { id: 'C014', name: 'GoWork Office Tower' },
  { id: 'C015', name: 'Distributor Sentra Boga' },
  { id: 'C016', name: 'Warung Kopi Modern' },
  { id: 'C017', name: 'Santika Premiere Hotel' },
  { id: 'C018', name: 'Kopi Nako Bintaro' },
  { id: 'C019', name: 'Retail Mart Segar' },
  { id: 'C020', name: 'Toko Mesin Kopi Bandung' },
  { id: 'C021', name: 'Resto Bumbu Desa' },
  { id: 'C022', name: 'Cafe Halaman Jogja' },
  { id: 'C023', name: 'Filosofi Kopi Melawai' },
  { id: 'C024', name: 'One Eighty Coffee' },
  { id: 'C025', name: 'Pochi Coffee Roasters' },
]

const STATUSES: SalesOrderStatus[] = ['open', 'partially processed', 'closed', 'voided']

const TAG_SETS: string[][] = [
  ['Wholesale', 'Beans'],
  ['Retail', 'Machines'],
  ['Wholesale', 'Machines'],
  ['Retail', 'Beans'],
  ['Wholesale', 'Beans', 'Subscription'],
  ['Wholesale', 'Machines', 'Priority'],
  ['Retail', 'Beans', 'Sample'],
  ['Wholesale'],
]

/** Product catalogue — beans, machines, accessories, merch. */
const PRODUCTS: Omit<SalesOrderItem, 'qty' | 'discountPct' | 'amount'>[] = [
  { product: 'Myanmar Mya Ze Di Natural',         sku: 'BN-1790', description: 'Whole bean, natural process, 1 kg',     unit: 'kg',   unitPrice: 320_000    },
  { product: 'Bolivia Caranavi Sol de la Mañana', sku: 'BN-1580', description: 'Whole bean, washed, light roast, 1 kg', unit: 'kg',   unitPrice: 480_000    },
  { product: 'Ethiopia Yirgacheffe G1',           sku: 'BN-2210', description: 'Whole bean, washed, floral, 1 kg',      unit: 'kg',   unitPrice: 450_000    },
  { product: 'Brazil Santos Green Bean',          sku: 'BN-3050', description: 'Green bean, bulk sack, 30 kg',          unit: 'sack', unitPrice: 2_400_000  },
  { product: 'House Blend Retail 250g',           sku: 'BN-1002', description: 'Medium roast, retail bag, 250 g',       unit: 'pcs',  unitPrice: 85_000     },
  { product: 'Cold Brew Concentrate 1L',          sku: 'BV-0440', description: 'Ready-to-dilute, 1 L bottle',           unit: 'btl',  unitPrice: 120_000    },
  { product: 'La Marzocco Linea Mini',            sku: 'MC-0420', description: 'Espresso machine, 1 group',             unit: 'unit', unitPrice: 92_000_000 },
  { product: 'Mahlkönig EK43 Grinder',            sku: 'MC-0231', description: 'Commercial flat-burr grinder',          unit: 'unit', unitPrice: 38_500_000 },
  { product: 'Fellow Stagg EKG Kettle',           sku: 'AC-0810', description: 'Electric pour-over kettle, 0.9 L',      unit: 'unit', unitPrice: 2_350_000  },
  { product: 'Ceramic V60 Dripper 02',            sku: 'AC-0155', description: 'Pour-over dripper, ceramic',            unit: 'pcs',  unitPrice: 165_000    },
  { product: 'Paper Filter V60 (100s)',           sku: 'AC-0160', description: 'Box of 100 filters',                   unit: 'box',  unitPrice: 75_000     },
  { product: 'Branded Ceramic Mug',               sku: 'MD-0900', description: 'Logo mug, 250 ml',                     unit: 'pcs',  unitPrice: 55_000     },
]

const TAX_RATE = 0.11

// Item count per order — mostly small, a few big; index 0 is the 50-item demo order.
const ITEM_COUNTS = [3, 1, 2, 5, 1, 4, 2, 8, 1, 6, 2, 3, 1, 7, 2, 1, 4, 2, 10, 1, 3, 5, 1, 2, 6]

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function buildItems(i: number): SalesOrderItem[] {
  const count = i === 0 ? 50 : ITEM_COUNTS[i % ITEM_COUNTS.length]
  const items: SalesOrderItem[] = []
  for (let j = 0; j < count; j++) {
    const p = PRODUCTS[(i * 5 + j * 7) % PRODUCTS.length]
    // machines/sacks come in small qty; consumables in larger qty
    const big = p.unitPrice >= 2_000_000
    const qty = big ? 1 + ((i + j) % 2) : 1 + ((i + j * 3) % 12)
    const discountPct = (j % 5 === 3) ? 10 : (j % 7 === 5 ? 5 : 0)
    const amount = Math.round(qty * p.unitPrice * (1 - discountPct / 100))
    items.push({ ...p, qty, discountPct, amount })
  }
  return items
}

export interface SalesOrderTotals {
  subtotal: number
  discountPerLine: number
  globalDiscount: number
  taxLabel: string
  taxAmount: number
  shippingFee: number
  total: number
}

/** Derive the totals breakdown from line items — shared by the index and the detail. */
export function computeTotals(items: SalesOrderItem[], globalDiscount: number, shippingFee: number): SalesOrderTotals {
  const subtotal = items.reduce((s, it) => s + it.qty * it.unitPrice, 0)
  const discountPerLine = items.reduce((s, it) => s + (it.qty * it.unitPrice - it.amount), 0)
  const taxBase = subtotal - discountPerLine - globalDiscount
  const taxAmount = Math.round(taxBase * TAX_RATE)
  const total = taxBase + taxAmount + shippingFee
  return { subtotal, discountPerLine, globalDiscount, taxLabel: 'PPN 11%', taxAmount, shippingFee, total }
}

function build(): SalesOrder[] {
  const out: SalesOrder[] = []
  for (let i = 0; i < 100; i++) {
    const number = 10090 + i
    const customer = CUSTOMERS[i % CUSTOMERS.length]
    const status = STATUSES[i % STATUSES.length]
    const date = addDays('2026-01-02', i)        // one order per day
    const dueDate = addDays(date, 30)

    const items = buildItems(i)
    const globalDiscount = i % 6 === 0 ? 100_000 : 0
    const shippingFee = i % 3 === 0 ? 100_000 : i % 3 === 1 ? 0 : 150_000
    const { total } = computeTotals(items, globalDiscount, shippingFee)

    // Balance reflects how far the order has been invoiced/paid:
    //  open → nothing invoiced (full balance); partially → ~half; closed/voided → settled.
    const balanceDue =
      status === 'closed' || status === 'voided' ? 0
      : status === 'partially processed' ? Math.round(total / 2 / 50_000) * 50_000
      : total

    out.push({
      id: `SO${String(i + 1).padStart(3, '0')}`,
      number,
      customer,
      date,
      dueDate,
      status,
      balanceDue,
      total,
      tags: TAG_SETS[i % TAG_SETS.length],
      items,
      globalDiscount,
      shippingFee,
    })
  }
  return out
}

export const salesOrders: SalesOrder[] = build()
