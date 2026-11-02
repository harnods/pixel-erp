import { reactive } from 'vue'
import type { PurchaseInvoice } from './types'
import { vendors } from './vendors'
import { SIM_SPAN_DAYS, simDay, daysUntil } from './simClock'
import { loadSnapshot, saveSnapshot } from './persist'

/**
 * Vendor invoices (AP) — a deterministic TIME SERIES spanning 1 Jan 2026 → today
 * (22 Aug 2026), using the shared `vendors` master so AP reconciles to one vendor
 * identity. Status is derived from the due date vs "today":
 *   • due passed + unpaid → overdue   • due passed + paid → paid   • not due → open
 *
 * Reactive + persisted so the debit-memo overlay can write derived balance/status
 * back (mirrors the sales-invoice pattern for credit memos).
 */
const PINV_COUNT = 80
const AMOUNTS = [
  1_800_000, 6_400_000, 16_900_000, 9_200_000, 37_500_000, 12_000_000,
  24_800_000, 74_000_000, 3_300_000, 52_000_000, 28_000_000, 18_500_000,
]

function buildPurchaseInvoices(): PurchaseInvoice[] {
  const out: PurchaseInvoice[] = []
  for (let i = 0; i < PINV_COUNT; i++) {
    const offset = Math.floor((i * SIM_SPAN_DAYS) / PINV_COUNT)
    const date = simDay(offset)
    const dueDate = simDay(offset + 30)
    const vendor = vendors[i % vendors.length]!
    const amount = AMOUNTS[i % AMOUNTS.length]! + (i % 4) * 900_000

    const duePassed = daysUntil(dueDate) < 0
    let status: PurchaseInvoice['status']
    if (duePassed) status = (i % 7 === 0 || i % 12 === 0) ? 'overdue' : 'paid'
    else status = 'open'

    const balance = status === 'paid' ? 0 : amount

    const tags: string[] = []
    if (amount >= 50_000_000) tags.push('Import')
    if (i % 5 === 0) tags.push('Raw material')

    out.push({
      id: `PI${String(i + 1).padStart(3, '0')}`,
      number: `PINV-2026-${String(i + 1).padStart(3, '0')}`,
      vendor: { id: vendor.id, name: vendor.name },
      date,
      dueDate,
      amount,
      total: amount,
      balance,
      status,
      itemCount: 1 + (i % 6),
      hasAttachment: i % 3 === 0,
      ...(tags.length ? { tags } : {}),
    })
  }
  return out.reverse() // newest first
}

const K_PI = 'purchase-invoices-v1'

export const purchaseInvoices = reactive<PurchaseInvoice[]>(
  loadSnapshot<PurchaseInvoice>(K_PI) ?? buildPurchaseInvoices(),
)

export function persistPurchaseInvoices(): void {
  saveSnapshot(K_PI, purchaseInvoices)
}

/**
 * Awaiting-approval subset — a realistic handful of the newest invoices pending
 * sign-off, NOT the whole ledger. The "Awaiting approval" tab and its tab-count
 * badge read from this; the full `purchaseInvoices` still backs the "All purchase
 * invoices" tab and receipt review.
 */
export const purchaseInvoicesAwaitingApproval: PurchaseInvoice[] = purchaseInvoices.slice(0, 8)

// ── Recurring purchase invoices ─────────────────────────────────────────────

import type { RecurringSchedule, RecurringHistoryEntry, RecurringLineItem } from './salesInvoices'
export type { RecurringSchedule, RecurringHistoryEntry, RecurringLineItem }

export interface RecurringPurchaseInvoice {
  id: string
  templateName: string
  vendor: { id: string; name: string }
  frequency: string
  amount: number
  nextDate: string
  status: 'active' | 'completed'
  createdCount: number
  schedule?: RecurringSchedule
  history?: RecurringHistoryEntry[]
  email: string[]
  billingAddress: string
  shipTo: string
  paymentTerms: string
  warehouse: string
  referenceNo: string
  tags: string[]
  lineItems: RecurringLineItem[]
  message: string
  memo: string
  totals: { subtotal: number; taxLabel: string; taxAmount: number; total: number }
  lastUpdatedBy: string
  lastUpdatedAt: string
}

function recurringPIEmail(name: string): string[] {
  const slug = name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12) || 'vendor'
  return [`ap@${slug}.com`, `finance@${slug}.com`]
}

const RPI_ADDRESSES = [
  'Jl. Anggrek No. 25, Kebayoran Baru, Jakarta Selatan, 12130, DKI Jakarta',
  'Jl. Gatot Subroto Kav. 18, Setiabudi, Jakarta Selatan, 12950, DKI Jakarta',
  'Jl. Diponegoro No. 4, Menteng, Jakarta Pusat, 10310, DKI Jakarta',
  'Jl. Asia Afrika No. 8, Sudirman, Jakarta Pusat, 10270, DKI Jakarta',
]
const RPI_SHIP_TO = [
  'Jl. Sindang III/5, Kompleks Pertamina, DKI Jakarta 12820',
  'Gudang Blok C No. 12, Kawasan Industri Pulogadung, Jakarta Timur',
  'Jl. Raya Bogor KM 30, Cibinong, Bogor, Jawa Barat',
  'Ruko Sentra Niaga No. 7, Bintaro, Tangerang Selatan',
]
const RPI_WAREHOUSES = ['Default warehouse', 'Cibinong warehouse', 'Pulogadung DC', 'Bandung hub']
const RPI_PAYMENT_TERMS = ['Net 30', 'Net 14', 'Cash on delivery', 'Net 45']

function buildRecurringPILineItems(amount: number, idx: number): RecurringLineItem[] {
  const count = 1 + (idx % 4)
  const items: RecurringLineItem[] = []
  const products = [
    { product: 'Green Beans Arabica Gayo Grade 1', sku: '1001', description: 'Aceh highlands, fully washed, screen 18, 60 kg jute sack', unit: 'Sack', unitPrice: 3_200_000 },
    { product: 'Green Beans Robusta Temanggung', sku: '1008', description: 'Central Java, dry process, 60 kg sack', unit: 'Sack', unitPrice: 2_200_000 },
    { product: 'Packaging Film 120 mic', sku: '3010', description: 'Industrial grade packaging, 500m roll', unit: 'Roll', unitPrice: 1_500_000 },
    { product: 'Jute Sack 60kg', sku: '3020', description: 'Heavy-duty export-grade jute sack', unit: 'Pcs', unitPrice: 85_000 },
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
      taxLabel: 'PPN 11%',
      amount: lineAmount,
    })
  }
  return items
}

function buildRecurringPITotals(amount: number) {
  const taxRate = 0.11
  const subtotal = Math.round(amount / (1 + taxRate))
  const taxAmount = amount - subtotal
  return { subtotal, taxLabel: 'PPN 11%', taxAmount, total: amount }
}

function buildRecurringPITemplate(
  base: { id: string; templateName: string; vendor: typeof vendors[0]; frequency: string; amount: number; nextDate: string; status: 'active' | 'completed'; createdCount: number; schedule: RecurringSchedule; history?: RecurringHistoryEntry[] },
  idx: number,
): RecurringPurchaseInvoice {
  return {
    ...base,
    vendor: base.vendor!,
    email: recurringPIEmail(base.vendor!.name),
    billingAddress: RPI_ADDRESSES[idx % RPI_ADDRESSES.length]!,
    shipTo: RPI_SHIP_TO[idx % RPI_SHIP_TO.length]!,
    paymentTerms: RPI_PAYMENT_TERMS[idx % RPI_PAYMENT_TERMS.length]!,
    warehouse: RPI_WAREHOUSES[idx % RPI_WAREHOUSES.length]!,
    referenceNo: `PO #${20080 + idx}`,
    tags: idx % 3 === 0 ? ['Import'] : idx % 5 === 0 ? ['Raw material'] : [],
    lineItems: buildRecurringPILineItems(base.amount, idx),
    message: 'This is an automatically generated recurring purchase invoice.',
    memo: `Recurring template ${base.id}`,
    totals: buildRecurringPITotals(base.amount),
    lastUpdatedBy: 'Rizal Candra',
    lastUpdatedAt: simDay(-3),
  }
}

const RECURRING_PI_TEMPLATES: RecurringPurchaseInvoice[] = [
  buildRecurringPITemplate({ id: 'RPI001', templateName: 'Monthly raw beans supply', vendor: vendors[0]!, frequency: 'Monthly', amount: 16_900_000, nextDate: simDay(SIM_SPAN_DAYS + 5), status: 'active', createdCount: 6, schedule: { repeatInterval: 1, repeatUnit: 'month', endRepeat: 'never', startDate: simDay(-180), sendAutoEmail: true }, history: [
    { invoiceNumber: 80060, date: simDay(-5), amount: 16_900_000, status: 'Paid' },
    { invoiceNumber: 80050, date: simDay(-35), amount: 16_900_000, status: 'Paid' },
    { invoiceNumber: 80040, date: simDay(-65), amount: 16_900_000, status: 'Paid' },
  ] }, 0),
  buildRecurringPITemplate({ id: 'RPI002', templateName: 'Weekly packaging delivery', vendor: vendors[1]!, frequency: 'Weekly', amount: 6_400_000, nextDate: simDay(SIM_SPAN_DAYS + 2), status: 'active', createdCount: 24, schedule: { repeatInterval: 1, repeatUnit: 'week', endRepeat: 'never', startDate: simDay(-168), sendAutoEmail: false }, history: [
    { invoiceNumber: 80059, date: simDay(-2), amount: 6_400_000, status: 'Open' },
    { invoiceNumber: 80048, date: simDay(-9), amount: 6_400_000, status: 'Paid' },
  ] }, 1),
  buildRecurringPITemplate({ id: 'RPI003', templateName: 'Quarterly equipment maintenance', vendor: vendors[2]!, frequency: 'Quarterly', amount: 37_500_000, nextDate: simDay(SIM_SPAN_DAYS + 30), status: 'active', createdCount: 3, schedule: { repeatInterval: 3, repeatUnit: 'month', endRepeat: 'after', endAfterCount: 8, startDate: simDay(-270), sendAutoEmail: true }, history: [
    { invoiceNumber: 80055, date: simDay(-10), amount: 37_500_000, status: 'Open' },
  ] }, 2),
  buildRecurringPITemplate({ id: 'RPI004', templateName: 'Bi-weekly logistics', vendor: vendors[3]!, frequency: 'Bi-weekly', amount: 9_200_000, nextDate: simDay(SIM_SPAN_DAYS + 8), status: 'active', createdCount: 10, schedule: { repeatInterval: 2, repeatUnit: 'week', endRepeat: 'never', startDate: simDay(-140), sendAutoEmail: false } }, 3),
  buildRecurringPITemplate({ id: 'RPI005', templateName: 'Annual insurance premium', vendor: vendors[4]!, frequency: 'Yearly', amount: 74_000_000, nextDate: simDay(SIM_SPAN_DAYS + 60), status: 'active', createdCount: 1, schedule: { repeatInterval: 1, repeatUnit: 'year', endRepeat: 'never', startDate: simDay(-365), sendAutoEmail: true } }, 4),
  buildRecurringPITemplate({ id: 'RPI006', templateName: 'Monthly filter subscription', vendor: vendors[5]!, frequency: 'Monthly', amount: 3_300_000, nextDate: simDay(SIM_SPAN_DAYS + 12), status: 'completed', createdCount: 12, schedule: { repeatInterval: 1, repeatUnit: 'month', endRepeat: 'after', endAfterCount: 12, startDate: simDay(-365), sendAutoEmail: false } }, 5),
  buildRecurringPITemplate({ id: 'RPI007', templateName: 'Weekly cleaning supply', vendor: vendors[6]!, frequency: 'Weekly', amount: 1_800_000, nextDate: simDay(SIM_SPAN_DAYS + 1), status: 'active', createdCount: 18, schedule: { repeatInterval: 1, repeatUnit: 'week', endRepeat: 'never', startDate: simDay(-126), sendAutoEmail: true } }, 6),
  buildRecurringPITemplate({ id: 'RPI008', templateName: 'Monthly premium blend supply', vendor: vendors[7]!, frequency: 'Monthly', amount: 24_800_000, nextDate: simDay(SIM_SPAN_DAYS + 15), status: 'active', createdCount: 4, schedule: { repeatInterval: 1, repeatUnit: 'month', endRepeat: 'on', endOnDate: simDay(365), startDate: simDay(-120), sendAutoEmail: true } }, 7),
]

const K_RPI = 'recurring-purchase-invoices-v1'

export const recurringPurchaseInvoices = reactive<RecurringPurchaseInvoice[]>(
  loadSnapshot<RecurringPurchaseInvoice>(K_RPI) ?? [...RECURRING_PI_TEMPLATES],
)
export function recurringPurchaseInvoicesCount(): number { return recurringPurchaseInvoices.filter(r => r.status === 'active').length }
export function persistRecurringPurchaseInvoices(): void { saveSnapshot(K_RPI, recurringPurchaseInvoices) }
export function getRecurringForPurchaseInvoice(recurringId: string): RecurringPurchaseInvoice | undefined {
  return recurringPurchaseInvoices.find(r => r.id === recurringId)
}
