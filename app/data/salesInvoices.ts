import { reactive } from 'vue'
import type { SalesInvoice } from './types'
import { customers, EXPORT_CUSTOMER_ID } from './customers'
import { loadSnapshot, saveSnapshot } from './persist'
import { SIM_SPAN_DAYS, simDay, daysUntil } from './simClock'

/**
 * Sales invoices — a deterministic TIME SERIES spanning 1 Jan 2026 → today
 * (22 Aug 2026), the AR backbone of the production-ready Cowork demo. Customers
 * come from the shared `customers` master (coffee accounts), so a customer id
 * means the same company across Sales, WMS outbound and CRM. Status is derived
 * from the due date vs "today":
 *   • due date passed + unpaid  → overdue
 *   • due date passed + paid     → paid (balance 0)
 *   • not yet due                → open (unpaid) or paid-early
 * Everything is a pure function of the index → same data every load, real dates.
 */
const INVOICE_COUNT = 150
// Coffee-wholesale invoice sizes (IDR) — cycled with a per-index tweak for spread.
const AMOUNTS = [
  4_500_000, 12_000_000, 8_900_000, 23_750_000, 6_800_000, 44_000_000, 15_200_000,
  98_000_000, 3_200_000, 67_000_000, 34_500_000, 125_000_000, 9_000_000, 55_300_000, 210_000_000,
]

/**
 * The pool the seed walks by index. The export customer is excluded: this
 * assignment is positional, so admitting it would shift every invoice's buyer
 * by one and silently rewrite 150 rows of demo data.
 */
const CYCLE_CUSTOMERS = customers.filter((c) => c.id !== EXPORT_CUSTOMER_ID)

/**
 * The invoices sold abroad. Named rather than derived, so the export buyer
 * lands on invoices that can actually raise a tax document (PPN present, every
 * product DJP-classified, no seeded faktur of their own) — the state the
 * export form needs to be reachable from.
 */
const EXPORT_INVOICE_IDS = ['SI121', 'SI110', 'SI062']

function buildSalesInvoices(): SalesInvoice[] {
  const out: SalesInvoice[] = []
  for (let i = 0; i < INVOICE_COUNT; i++) {
    const offset = Math.floor((i * SIM_SPAN_DAYS) / INVOICE_COUNT) // 1 Jan → today
    const date = simDay(offset)
    const dueDate = simDay(offset + 30)
    const cust = CYCLE_CUSTOMERS[i % CYCLE_CUSTOMERS.length]!
    const total = AMOUNTS[i % AMOUNTS.length]! + (i % 5) * 1_300_000
    const duePassed = daysUntil(dueDate) < 0

    let status: SalesInvoice['status']
    let balance: number
    if (duePassed) {
      const unpaid = i % 6 === 0 || i % 13 === 0
      status = unpaid ? 'overdue' : 'paid'
      balance = unpaid ? total : 0
    } else {
      const paidEarly = i % 5 === 0
      status = paidEarly ? 'paid' : 'open'
      balance = paidEarly ? 0 : total
    }

    const tags: string[] = []
    if (total >= 100_000_000) tags.push('VIP')
    if (i % 4 === 0) tags.push('B2B')

    out.push({
      id: `SI${String(i + 1).padStart(3, '0')}`,
      number: 40001 + i,
      customer: { id: cust.id, name: cust.name },
      date,
      dueDate,
      total,
      balance,
      status,
      itemCount: 1 + (i % 12),
      hasPpn: i % 9 !== 0,
      hasAttachment: i % 3 === 0,
      ...(tags.length ? { tags } : {}),
    })
  }
  // The export buyer is attached after the cycle has run, so it never disturbs
  // the positional assignment above.
  const exportCustomer = customers.find((c) => c.id === EXPORT_CUSTOMER_ID)
  if (exportCustomer) {
    for (const id of EXPORT_INVOICE_IDS) {
      const inv = out.find((o) => o.id === id)
      if (inv) inv.customer = { id: exportCustomer.id, name: exportCustomer.name }
    }
  }

  // Link some invoices to recurring templates for demo purposes.
  const recurringLinks: Record<string, string> = { SI150: 'RSI001', SI145: 'RSI003', SI140: 'RSI005' }
  for (const inv of out) {
    if (recurringLinks[inv.id]) inv.recurringId = recurringLinks[inv.id]
  }

  // Newest first (matches how the Sales Invoices page reads best).
  return out.reverse()
}

export const salesInvoices = reactive<SalesInvoice[]>(buildSalesInvoices())

/** Delete one or more sales invoices from the list (bulk or single). Returns the count actually removed. */
export function deleteSalesInvoices(ids: string[]): number {
  const idSet = new Set(ids)
  let removed = 0
  for (let i = salesInvoices.length - 1; i >= 0; i--) {
    if (idSet.has(salesInvoices[i]!.id)) {
      salesInvoices.splice(i, 1)
      removed++
    }
  }
  return removed
}

/**
 * "Awaiting approval" queue — a deterministic subset (every 7th by number) that
 * feeds the Sales invoices › Awaiting approval tab. Prototype approval flow: the
 * same predicate drives both the tab's filtered list and its count badge.
 */
export function awaitingSalesInvoices(): SalesInvoice[] {
  return salesInvoices.filter(r => r.number % 7 === 0)
}
export function awaitingSalesInvoicesCount(): number { return awaitingSalesInvoices().length }

/**
 * Recurring sales invoices — scheduled templates that auto-generate invoices.
 * Each entry represents a recurring schedule, not a single transaction.
 */
export interface RecurringSchedule {
  repeatInterval: number
  repeatUnit: 'day' | 'week' | 'month' | 'year'
  endRepeat: 'never' | 'after' | 'on'
  endAfterCount?: number
  endOnDate?: string
  startDate: string
  sendAutoEmail: boolean
}

export interface RecurringHistoryEntry {
  invoiceNumber: number
  date: string
  amount: number
  status: string
}

export interface RecurringLineItem {
  product: string
  sku: string
  description: string
  qty: number
  unit: string
  unitPrice: number
  discountPct: number
  taxLabel: string
  amount: number
}

export interface RecurringSalesInvoice {
  id: string
  templateName: string
  customer: { id: string; name: string }
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

function recurringEmail(name: string): string[] {
  const slug = name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12) || 'customer'
  return [`hello@${slug}.com`, `finance@${slug}.com`]
}

const REC_ADDRESSES = [
  'Jl. Anggrek No. 25, Kebayoran Baru, Jakarta Selatan, 12130, DKI Jakarta',
  'Jl. Gatot Subroto Kav. 18, Setiabudi, Jakarta Selatan, 12950, DKI Jakarta',
  'Jl. Diponegoro No. 4, Menteng, Jakarta Pusat, 10310, DKI Jakarta',
  'Jl. Asia Afrika No. 8, Sudirman, Jakarta Pusat, 10270, DKI Jakarta',
]
const REC_SHIP_TO = [
  'Jl. Sindang III/5, Kompleks Pertamina, DKI Jakarta 12820',
  'Gudang Blok C No. 12, Kawasan Industri Pulogadung, Jakarta Timur',
  'Jl. Raya Bogor KM 30, Cibinong, Bogor, Jawa Barat',
  'Ruko Sentra Niaga No. 7, Bintaro, Tangerang Selatan',
]
const REC_WAREHOUSES = ['Default warehouse', 'Cibinong warehouse', 'Pulogadung DC', 'Bandung hub']
const REC_PAYMENT_TERMS = ['Net 30', 'Net 14', 'Cash on delivery', 'Net 45']

function buildRecurringLineItems(amount: number, idx: number): RecurringLineItem[] {
  const count = 1 + (idx % 4)
  const items: RecurringLineItem[] = []
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
      taxLabel: 'PPN 11%',
      amount: lineAmount,
    })
  }
  return items
}

function buildRecurringTotals(amount: number) {
  const taxRate = 0.11
  const subtotal = Math.round(amount / (1 + taxRate))
  const taxAmount = amount - subtotal
  return { subtotal, taxLabel: 'PPN 11%', taxAmount, total: amount }
}

function buildRecurringTemplate(
  base: { id: string; templateName: string; customer: typeof CYCLE_CUSTOMERS[0]; frequency: string; amount: number; nextDate: string; status: 'active' | 'completed'; createdCount: number; schedule: RecurringSchedule; history?: RecurringHistoryEntry[] },
  idx: number,
): RecurringSalesInvoice {
  return {
    ...base,
    customer: base.customer!,
    email: recurringEmail(base.customer!.name),
    billingAddress: REC_ADDRESSES[idx % REC_ADDRESSES.length]!,
    shipTo: REC_SHIP_TO[idx % REC_SHIP_TO.length]!,
    paymentTerms: REC_PAYMENT_TERMS[idx % REC_PAYMENT_TERMS.length]!,
    warehouse: REC_WAREHOUSES[idx % REC_WAREHOUSES.length]!,
    referenceNo: `SO #${10080 + idx}`,
    tags: idx % 3 === 0 ? ['B2B'] : idx % 5 === 0 ? ['VIP'] : [],
    lineItems: buildRecurringLineItems(base.amount, idx),
    message: 'Thank you for your continued business. This is an automatically generated recurring invoice.',
    memo: `Recurring template ${base.id}`,
    totals: buildRecurringTotals(base.amount),
    lastUpdatedBy: 'Rizal Candra',
    lastUpdatedAt: simDay(-3),
  }
}

const RECURRING_TEMPLATES: RecurringSalesInvoice[] = [
  buildRecurringTemplate({ id: 'RSI001', templateName: 'Monthly coffee supply', customer: CYCLE_CUSTOMERS[0]!, frequency: 'Monthly', amount: 12_000_000, nextDate: simDay(SIM_SPAN_DAYS + 5), status: 'active', createdCount: 6, schedule: { repeatInterval: 1, repeatUnit: 'month', endRepeat: 'never', startDate: simDay(-180), sendAutoEmail: true }, history: [
    { invoiceNumber: 40150, date: simDay(-5), amount: 12_000_000, status: 'Paid' },
    { invoiceNumber: 40120, date: simDay(-35), amount: 12_000_000, status: 'Paid' },
    { invoiceNumber: 40090, date: simDay(-65), amount: 12_000_000, status: 'Paid' },
  ] }, 0),
  buildRecurringTemplate({ id: 'RSI002', templateName: 'Weekly espresso delivery', customer: CYCLE_CUSTOMERS[1]!, frequency: 'Weekly', amount: 4_500_000, nextDate: simDay(SIM_SPAN_DAYS + 2), status: 'active', createdCount: 24, schedule: { repeatInterval: 1, repeatUnit: 'week', endRepeat: 'never', startDate: simDay(-168), sendAutoEmail: false }, history: [
    { invoiceNumber: 40149, date: simDay(-2), amount: 4_500_000, status: 'Open' },
    { invoiceNumber: 40140, date: simDay(-9), amount: 4_500_000, status: 'Paid' },
  ] }, 1),
  buildRecurringTemplate({ id: 'RSI003', templateName: 'Quarterly equipment lease', customer: CYCLE_CUSTOMERS[2]!, frequency: 'Quarterly', amount: 44_000_000, nextDate: simDay(SIM_SPAN_DAYS + 30), status: 'active', createdCount: 3, schedule: { repeatInterval: 3, repeatUnit: 'month', endRepeat: 'after', endAfterCount: 8, startDate: simDay(-270), sendAutoEmail: true }, history: [
    { invoiceNumber: 40148, date: simDay(-10), amount: 44_000_000, status: 'Open' },
  ] }, 2),
  buildRecurringTemplate({ id: 'RSI004', templateName: 'Bi-weekly roast batch', customer: CYCLE_CUSTOMERS[3]!, frequency: 'Bi-weekly', amount: 8_900_000, nextDate: simDay(SIM_SPAN_DAYS + 8), status: 'active', createdCount: 10, schedule: { repeatInterval: 2, repeatUnit: 'week', endRepeat: 'never', startDate: simDay(-140), sendAutoEmail: false } }, 3),
  buildRecurringTemplate({ id: 'RSI005', templateName: 'Annual maintenance', customer: CYCLE_CUSTOMERS[4]!, frequency: 'Yearly', amount: 98_000_000, nextDate: simDay(SIM_SPAN_DAYS + 60), status: 'active', createdCount: 1, schedule: { repeatInterval: 1, repeatUnit: 'year', endRepeat: 'never', startDate: simDay(-365), sendAutoEmail: true } }, 4),
  buildRecurringTemplate({ id: 'RSI006', templateName: 'Monthly bean subscription', customer: CYCLE_CUSTOMERS[5]!, frequency: 'Monthly', amount: 6_800_000, nextDate: simDay(SIM_SPAN_DAYS + 12), status: 'completed', createdCount: 12, schedule: { repeatInterval: 1, repeatUnit: 'month', endRepeat: 'after', endAfterCount: 12, startDate: simDay(-365), sendAutoEmail: false } }, 5),
  buildRecurringTemplate({ id: 'RSI007', templateName: 'Weekly pastry supply', customer: CYCLE_CUSTOMERS[6]!, frequency: 'Weekly', amount: 3_200_000, nextDate: simDay(SIM_SPAN_DAYS + 1), status: 'active', createdCount: 18, schedule: { repeatInterval: 1, repeatUnit: 'week', endRepeat: 'never', startDate: simDay(-126), sendAutoEmail: true } }, 6),
  buildRecurringTemplate({ id: 'RSI008', templateName: 'Monthly premium blend', customer: CYCLE_CUSTOMERS[7]!, frequency: 'Monthly', amount: 23_750_000, nextDate: simDay(SIM_SPAN_DAYS + 15), status: 'active', createdCount: 4, schedule: { repeatInterval: 1, repeatUnit: 'month', endRepeat: 'on', endOnDate: simDay(365), startDate: simDay(-120), sendAutoEmail: true } }, 7),
]

const K_RSI = 'recurring-sales-invoices-v1'

export const recurringSalesInvoices = reactive<RecurringSalesInvoice[]>(
  loadSnapshot<RecurringSalesInvoice>(K_RSI) ?? [...RECURRING_TEMPLATES],
)
export function recurringSalesInvoicesCount(): number { return recurringSalesInvoices.filter(r => r.status === 'active').length }
export function persistRecurringSalesInvoices(): void { saveSnapshot(K_RSI, recurringSalesInvoices) }
export function getRecurringForInvoice(recurringId: string): RecurringSalesInvoice | undefined {
  return recurringSalesInvoices.find(r => r.id === recurringId)
}
