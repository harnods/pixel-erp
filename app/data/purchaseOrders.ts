import { reactive } from 'vue'
import type { PurchaseOrder, PurchaseOrderStatus } from './types'
import { vendors } from './vendors'
import { SIM_SPAN_DAYS, simDay, daysUntil } from './simClock'
import type { RecurringSchedule } from './salesInvoices'
import { loadSnapshot, saveSnapshot } from './persist'

/**
 * Purchase orders — a deterministic TIME SERIES spanning 1 Jan 2026 → today
 * (22 Aug 2026), coherent with the rest of the production-ready mock DB. Vendors
 * come from the shared `vendors` master (coffee suppliers) so a vendor id means
 * the same supplier across Purchases and AP. Status spreads across the tabs:
 *   • all      → open / partially-processed / closed
 *   • awaiting → draft
 *   • rejected → rejected
 * Everything is a pure function of the index → same data every load, real dates.
 */
const PO_COUNT = 60
const AMOUNTS = [
  7_200_000, 18_500_000, 42_000_000, 9_800_000, 63_000_000, 12_400_000,
  28_500_000, 155_000_000, 5_600_000, 88_000_000, 34_000_000, 21_000_000,
]
const TAG_POOL = [['Import', 'Raw material'], ['Packaging'], ['Equipment'], ['Logistics'], ['Office supply'], ['Utilities']]

function buildPurchaseOrders(): PurchaseOrder[] {
  const out: PurchaseOrder[] = []
  for (let i = 0; i < PO_COUNT; i++) {
    const offset = Math.floor((i * SIM_SPAN_DAYS) / PO_COUNT)
    const date = simDay(offset)
    const dueDate = simDay(offset + 30)
    const vendor = vendors[i % vendors.length]!
    const total = AMOUNTS[i % AMOUNTS.length]! + (i % 4) * 1_100_000
    const dueIn = daysUntil(dueDate)

    // Status: recent orders are still moving (draft/open/partial); older ones are
    // received (awaiting invoice) then closed; a few are voided/rejected.
    let status: PurchaseOrderStatus
    if (i % 19 === 0) status = 'voided'
    else if (i % 17 === 0) status = 'rejected'
    else if (dueIn > 7 && i % 4 === 0) status = 'draft'          // recent, awaiting approval
    else if (dueIn >= 0) status = i % 3 === 0 ? 'partially-processed' : 'open'
    else status = i % 6 === 0 ? 'awaiting invoice' : (i % 5 === 0 ? 'open' : 'closed')

    const balance = (status === 'closed' || status === 'voided') ? 0
      : status === 'partially-processed' ? Math.round(total / 2)
      : total

    const po: PurchaseOrder = {
      id: `po-${String(i + 1).padStart(3, '0')}`,
      number: `PO-2026-${String(i + 1).padStart(4, '0')}`,
      vendor: { id: vendor.id, name: vendor.name },
      date,
      dueDate,
      total,
      balance,
      status,
      itemCount: 1 + (i % 8),
      hasAttachment: i % 3 === 0,
      tags: TAG_POOL[i % TAG_POOL.length],
    }
    if (status === 'rejected') {
      po.rejection = { user: 'You', date: simDay(offset + 2), reason: 'Budget not approved for this period.' }
    }
    out.push(po)
  }
  return out.reverse() // newest first
}

const K_PO = 'purchase-orders-v1'

export const purchaseOrders: PurchaseOrder[] = reactive<PurchaseOrder[]>(
  loadSnapshot<PurchaseOrder>(K_PO) ?? buildPurchaseOrders(),
)

export function persistPurchaseOrders(): void {
  saveSnapshot(K_PO, purchaseOrders)
}

// ── Recurring Purchase Orders ──────────────────────────────────────────────────

export interface RecurringPOHistoryEntry {
  orderNumber: string
  date: string
  amount: number
  status: string
}

export interface RecurringPOLineItem {
  product: string
  sku: string
  description: string
  qty: number
  unit: string
  unitPrice: number
  discountPct: number
  amount: number
}

export interface RecurringPOTotals {
  subtotal: number
  discountPerLine: number
  globalDiscount: number
  taxLabel: string
  taxAmount: number
  shippingFee: number
  total: number
}

export interface RecurringPurchaseOrder {
  id: string
  templateName: string
  vendor: { id: string; name: string }
  frequency: string
  amount: number
  nextDate: string
  status: 'active' | 'completed'
  createdCount: number
  schedule?: RecurringSchedule
  history?: RecurringPOHistoryEntry[]
  email: string[]
  billingAddress: string
  shipTo: string
  paymentTerms: string
  warehouse: string
  referenceNo: string
  tags: string[]
  lineItems: RecurringPOLineItem[]
  message: string
  memo: string
  totals: RecurringPOTotals
  lastUpdatedBy: string
  lastUpdatedAt: string
}

function recurringPOEmail(name: string): string[] {
  const slug = name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12) || 'vendor'
  return [`hello@${slug}.com`, `finance@${slug}.com`]
}

const RPO_ADDRESSES = [
  'Jl. Anggrek No. 25, Kebayoran Baru, Jakarta Selatan, 12130, DKI Jakarta',
  'Jl. Gatot Subroto Kav. 18, Setiabudi, Jakarta Selatan, 12950, DKI Jakarta',
  'Jl. Diponegoro No. 4, Menteng, Jakarta Pusat, 10310, DKI Jakarta',
  'Jl. Asia Afrika No. 8, Sudirman, Jakarta Pusat, 10270, DKI Jakarta',
]
const RPO_SHIP_TO = [
  'Jl. Sindang III/5, Kompleks Pertamina, DKI Jakarta 12820',
  'Gudang Blok C No. 12, Kawasan Industri Pulogadung, Jakarta Timur',
  'Jl. Raya Bogor KM 30, Cibinong, Bogor, Jawa Barat',
  'Ruko Sentra Niaga No. 7, Bintaro, Tangerang Selatan',
]
const RPO_WAREHOUSES = ['Default warehouse', 'Cibinong warehouse', 'Pulogadung DC', 'Bandung hub']
const RPO_PAYMENT_TERMS = ['Net 30', 'Net 14', 'Cash on delivery', 'Net 45']

function buildRecurringPOLineItems(amount: number, idx: number): RecurringPOLineItem[] {
  const count = 1 + (idx % 4)
  const items: RecurringPOLineItem[] = []
  const products = [
    { product: 'Green Beans Arabica Gayo Grade 1', sku: '1001', description: 'Aceh highlands, fully washed, screen 18, 60 kg jute sack', unit: 'Sack', unitPrice: 3_200_000 },
    { product: 'Green Beans Robusta Temanggung', sku: '1008', description: 'Central Java, dry process, 60 kg sack', unit: 'Sack', unitPrice: 2_200_000 },
    { product: 'Espresso Machine Dual Boiler 2-Group', sku: '2001', description: 'Commercial, stainless body, PID control', unit: 'Unit', unitPrice: 85_000_000 },
    { product: 'Coffee Grinder Single Dose 64mm', sku: '2005', description: 'Single dose, bellows, low retention', unit: 'Unit', unitPrice: 9_800_000 },
  ]
  const taxRate = 0.11
  const baseAmount = Math.round(amount / (1 + taxRate))
  let remaining = baseAmount
  for (let i = 0; i < count; i++) {
    const p = products[i % products.length]!
    const isLast = i === count - 1
    const lineAmount = isLast ? remaining : Math.round(baseAmount / count)
    remaining -= lineAmount
    const qty = Math.max(1, Math.round(lineAmount / p.unitPrice))
    items.push({
      product: p.product,
      sku: p.sku,
      description: p.description,
      qty,
      unit: p.unit,
      unitPrice: p.unitPrice,
      discountPct: 0,
      amount: lineAmount,
    })
  }
  return items
}

function buildRecurringPOTotals(amount: number): RecurringPOTotals {
  const taxRate = 0.11
  const subtotal = Math.round(amount / (1 + taxRate))
  const taxAmount = amount - subtotal
  return { subtotal, discountPerLine: 0, globalDiscount: 0, taxLabel: 'PPN 11%', taxAmount, shippingFee: 0, total: amount }
}

function buildRecurringPOTemplate(
  base: { id: string; templateName: string; vendor: typeof vendors[0]; frequency: string; amount: number; nextDate: string; status: 'active' | 'completed'; createdCount: number; schedule: RecurringSchedule; history?: RecurringPOHistoryEntry[] },
  idx: number,
): RecurringPurchaseOrder {
  return {
    ...base,
    vendor: base.vendor!,
    email: recurringPOEmail(base.vendor!.name),
    billingAddress: RPO_ADDRESSES[idx % RPO_ADDRESSES.length]!,
    shipTo: RPO_SHIP_TO[idx % RPO_SHIP_TO.length]!,
    paymentTerms: RPO_PAYMENT_TERMS[idx % RPO_PAYMENT_TERMS.length]!,
    warehouse: RPO_WAREHOUSES[idx % RPO_WAREHOUSES.length]!,
    referenceNo: `SI #${30080 + idx}`,
    tags: idx % 3 === 0 ? ['Import'] : idx % 5 === 0 ? ['Raw material'] : [],
    lineItems: buildRecurringPOLineItems(base.amount, idx),
    message: 'This is an automatically generated recurring purchase order.',
    memo: `Recurring template ${base.id}`,
    totals: buildRecurringPOTotals(base.amount),
    lastUpdatedBy: 'Rizal Candra',
    lastUpdatedAt: simDay(-3),
  }
}

const RPO_TEMPLATES: RecurringPurchaseOrder[] = [
  buildRecurringPOTemplate({ id: 'RPO001', templateName: 'Monthly raw material supply', vendor: vendors[0]!, frequency: 'Monthly', amount: 18_500_000, nextDate: simDay(SIM_SPAN_DAYS + 5), status: 'active', createdCount: 6, schedule: { repeatInterval: 1, repeatUnit: 'month', endRepeat: 'never', startDate: simDay(-180), sendAutoEmail: true }, history: [
    { orderNumber: 'PO-2026-0060', date: simDay(-5), amount: 18_500_000, status: 'Closed' },
    { orderNumber: 'PO-2026-0055', date: simDay(-35), amount: 18_500_000, status: 'Closed' },
    { orderNumber: 'PO-2026-0050', date: simDay(-65), amount: 18_500_000, status: 'Closed' },
  ] }, 0),
  buildRecurringPOTemplate({ id: 'RPO002', templateName: 'Weekly packaging order', vendor: vendors[1]!, frequency: 'Weekly', amount: 7_200_000, nextDate: simDay(SIM_SPAN_DAYS + 2), status: 'active', createdCount: 24, schedule: { repeatInterval: 1, repeatUnit: 'week', endRepeat: 'never', startDate: simDay(-168), sendAutoEmail: false }, history: [
    { orderNumber: 'PO-2026-0059', date: simDay(-2), amount: 7_200_000, status: 'Open' },
    { orderNumber: 'PO-2026-0054', date: simDay(-9), amount: 7_200_000, status: 'Closed' },
  ] }, 1),
  buildRecurringPOTemplate({ id: 'RPO003', templateName: 'Quarterly equipment procurement', vendor: vendors[2]!, frequency: 'Quarterly', amount: 63_000_000, nextDate: simDay(SIM_SPAN_DAYS + 30), status: 'active', createdCount: 3, schedule: { repeatInterval: 3, repeatUnit: 'month', endRepeat: 'after', endAfterCount: 8, startDate: simDay(-270), sendAutoEmail: true }, history: [
    { orderNumber: 'PO-2026-0058', date: simDay(-10), amount: 63_000_000, status: 'Open' },
  ] }, 2),
  buildRecurringPOTemplate({ id: 'RPO004', templateName: 'Bi-weekly office supply', vendor: vendors[3]!, frequency: 'Bi-weekly', amount: 9_800_000, nextDate: simDay(SIM_SPAN_DAYS + 8), status: 'active', createdCount: 10, schedule: { repeatInterval: 2, repeatUnit: 'week', endRepeat: 'never', startDate: simDay(-140), sendAutoEmail: false } }, 3),
  buildRecurringPOTemplate({ id: 'RPO005', templateName: 'Annual maintenance contract', vendor: vendors[4]!, frequency: 'Yearly', amount: 155_000_000, nextDate: simDay(SIM_SPAN_DAYS + 60), status: 'active', createdCount: 1, schedule: { repeatInterval: 1, repeatUnit: 'year', endRepeat: 'never', startDate: simDay(-365), sendAutoEmail: true } }, 4),
  buildRecurringPOTemplate({ id: 'RPO006', templateName: 'Monthly logistics contract', vendor: vendors[5 % vendors.length]!, frequency: 'Monthly', amount: 12_400_000, nextDate: simDay(SIM_SPAN_DAYS + 12), status: 'completed', createdCount: 12, schedule: { repeatInterval: 1, repeatUnit: 'month', endRepeat: 'after', endAfterCount: 12, startDate: simDay(-365), sendAutoEmail: false } }, 5),
  buildRecurringPOTemplate({ id: 'RPO007', templateName: 'Weekly utility supply', vendor: vendors[6 % vendors.length]!, frequency: 'Weekly', amount: 5_600_000, nextDate: simDay(SIM_SPAN_DAYS + 1), status: 'active', createdCount: 18, schedule: { repeatInterval: 1, repeatUnit: 'week', endRepeat: 'never', startDate: simDay(-126), sendAutoEmail: true } }, 6),
  buildRecurringPOTemplate({ id: 'RPO008', templateName: 'Monthly premium blend beans', vendor: vendors[7 % vendors.length]!, frequency: 'Monthly', amount: 28_500_000, nextDate: simDay(SIM_SPAN_DAYS + 15), status: 'active', createdCount: 4, schedule: { repeatInterval: 1, repeatUnit: 'month', endRepeat: 'on', endOnDate: simDay(365), startDate: simDay(-120), sendAutoEmail: true } }, 7),
]

const K_RPO = 'recurring-purchase-orders-v1'

export const recurringPurchaseOrders = reactive<RecurringPurchaseOrder[]>(
  loadSnapshot<RecurringPurchaseOrder>(K_RPO) ?? [...RPO_TEMPLATES],
)
export function recurringPurchaseOrdersCount(): number { return recurringPurchaseOrders.filter(r => r.status === 'active').length }
export function persistRecurringPurchaseOrders(): void { saveSnapshot(K_RPO, recurringPurchaseOrders) }
export function getRecurringForPurchaseOrder(recurringId: string): RecurringPurchaseOrder | undefined {
  return recurringPurchaseOrders.find(r => r.id === recurringId)
}
