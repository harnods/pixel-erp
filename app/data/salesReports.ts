/**
 * Sales reports — Sales list, Sales by customer, Sales by product
 * (Reports › Sales). Read-only views over the SAME records the Sales invoices
 * screens show, so every number on a report can be clicked through to the
 * invoice it came from:
 *   • header rows  ← salesInvoices.ts            (date, customer, status, total, balance, tags)
 *   • line rows    ← salesInvoiceDetails.ts       (the detail page's own lineItems + totals,
 *                                                  which come from salesInvoiceLineItems' algorithm)
 *   • products     ← catalog.ts                   (SKU, category)
 *
 * Copies prod `jurnal-frontend-app/src/pages/reports/{sales_list,sales_by_customer,sales_by_product}`:
 *   - Sales list (default "Sales Invoice" template): Date · Transaction Type · Transaction Number ·
 *     Display Name · Status By Today · Memo · Total · Balance Due; the "Sales Invoice Detail"
 *     template adds Due Date · Gross Amount · Total Tax · Payment. TOTAL footer.
 *   - Sales by customer: grouped by customer → transaction lines, a tax line after the
 *     product lines (prod adds tax lines, see person_transaction_service_improvement.rb),
 *     Subtotal per customer, grand Total — includes tax, so it equals the list's Total.
 *   - Sales by product: per product Sales qty · Return qty · Unit · Sales value · Return value ·
 *     Average sales value (tax-exclusive line amounts, as prod sums transaction_lines.amount);
 *     detailed version nests the transactions under each product.
 *
 * Tie-out (asserted in dev, see `assertSalesReportsTie`): for the same period + filters
 *   Σ by-customer = Σ sales-list Total
 *   Σ by-product sales value − Σ invoice discounts + Σ tax = Σ sales-list Total
 *   Σ by-product sales value = Σ by-customer product lines
 */
import { salesInvoices } from './salesInvoices'
import { getSalesInvoiceDetail } from './salesInvoiceDetails'
import { CATALOG } from './catalog'
import { contacts } from './contacts'
import { SIM_TODAY_ISO } from './simClock'
import type { InvoiceStatus } from './types'

// ── Periods (prod constants/periods.ts PERIODS_RANGE, anchored on the sim "today") ──
export interface PeriodOption { id: string; label: string }
export const PERIOD_OPTIONS: PeriodOption[] = [
  { id: 'today', label: 'Today' },
  { id: 'this_week', label: 'This week' },
  { id: 'this_month', label: 'This month' },
  { id: 'this_quarter', label: 'This quarter' },
  { id: 'this_year', label: 'This year' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last_week', label: 'Last week' },
  { id: 'last_month', label: 'Last month' },
  { id: 'last_quarter', label: 'Last quarter' },
  { id: 'last_year', label: 'Last year' },
  { id: 'custom', label: 'Custom' },
]

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/** ISO yyyy-mm-dd → DD/MM/YYYY (the MpDatePicker `format` value). */
export function isoToDmy(s: string): string { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}` }
/** DD/MM/YYYY → ISO yyyy-mm-dd ('' when unparsable). */
export function dmyToIso(s: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s ?? '')
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}

/** [start, end] ISO for a period id, relative to the simulated today. */
export function salesPeriodRange(id: string): [string, string] | null {
  const t = new Date(`${SIM_TODAY_ISO}T00:00:00`)
  const y = t.getFullYear(), m = t.getMonth(), q = Math.floor(m / 3)
  const add = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
  const weekStart = add(t, -t.getDay())
  switch (id) {
    case 'today': return [iso(t), iso(t)]
    case 'yesterday': return [iso(add(t, -1)), iso(add(t, -1))]
    case 'this_week': return [iso(weekStart), iso(add(weekStart, 6))]
    case 'last_week': return [iso(add(weekStart, -7)), iso(add(weekStart, -1))]
    case 'this_month': return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))]
    case 'last_month': return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))]
    case 'this_quarter': return [iso(new Date(y, q * 3, 1)), iso(new Date(y, q * 3 + 3, 0))]
    case 'last_quarter': return [iso(new Date(y, q * 3 - 3, 1)), iso(new Date(y, q * 3, 0))]
    case 'this_year': return [iso(new Date(y, 0, 1)), iso(new Date(y, 11, 31))]
    case 'last_year': return [iso(new Date(y - 1, 0, 1)), iso(new Date(y - 1, 11, 31))]
    default: return null
  }
}
/** The period whose range is exactly [start, end], else 'custom' (prod set_period_by_date). */
export function periodForRange(start: string, end: string): string {
  return PERIOD_OPTIONS.find((p) => { const r = salesPeriodRange(p.id); return r && r[0] === start && r[1] === end })?.id ?? 'custom'
}
export function salesPeriodLabel(id: string): string { return PERIOD_OPTIONS.find((p) => p.id === id)?.label ?? 'Custom' }

// ── Filter option lists (prod wording) ───────────────────────────────────────
/** Sales list › Transaction type (prod transaction_type_options). Only Sales Invoice has data here. */
export const LIST_TRANSACTION_TYPES = [
  'Sales Invoice', 'Sales Order', 'Sales Quotation', 'Sales Order Payment',
  'Receive Payment', 'Sales Return', 'Sales Invoice Payment',
]
/** Sales by customer / product › Transaction type. */
export const REPORT_TRANSACTION_TYPES = ['Sales invoice', 'Sales order', 'Sales quotation']
/** Sales list › Status (prod statuses, minus the "All" pseudo-option = leave empty). */
export const LIST_STATUSES = ['Open', 'Partial', 'Partially Sent', 'Paid', 'Overdue', 'Closed']
const STATUS_LABEL: Record<InvoiceStatus, string> = { open: 'Open', paid: 'Paid', overdue: 'Overdue' }

export const CUSTOMER_SORT_OPTIONS = [
  { value: 'total_sales', label: 'Total sales' },
  { value: 'customer_name', label: 'Customer' },
]
export const PRODUCT_SORT_OPTIONS = [
  { value: 'product_name', label: 'Product name' },
  { value: 'product_code', label: 'Product code' },
  { value: 'product_qty', label: 'Qty' },
  { value: 'product_qty_return', label: 'Return qty' },
  { value: 'total_value_sold', label: 'Sales value' },
  { value: 'avg_sell_price', label: 'Average sales value' },
]
export const PRODUCT_DETAIL_SORT_OPTIONS = [
  { value: 'product_name', label: 'Product name' },
  { value: 'product_code', label: 'Product code' },
  { value: 'product_qty', label: 'Qty' },
  { value: 'price', label: 'Total price' },
  { value: 'total', label: 'Final price' },
]

// ── Filters ──────────────────────────────────────────────────────────────────
export interface SalesReportFilters {
  start: string            // DD/MM/YYYY
  end: string              // DD/MM/YYYY
  period: string           // PERIOD_OPTIONS id
  transactionType: string
  dateBy: 'transaction_date' | 'due_date'
  customerType: 'individual' | 'group'
  customers: string[]      // customer names
  groups: string[]         // contact group names
  statuses: string[]       // LIST_STATUSES labels
  tags: string[]
  tagLogic: 'and' | 'or'
  categories: string[]
  categoryLogic: 'and' | 'or'
  products: string[]       // product names
  showDetail: boolean
  sortBy: string
  sortLogic: 'asc' | 'desc'
}

/** Defaults. Prod opens on "Today"; this prototype opens on This year so the
 *  first Filter/Show click lands on the seeded Jan → Aug invoice history. */
export function defaultSalesReportFilters(kind: 'list' | 'customer' | 'product'): SalesReportFilters {
  const [s, e] = salesPeriodRange('this_year')!
  return {
    start: isoToDmy(s), end: isoToDmy(e), period: 'this_year',
    transactionType: kind === 'list' ? 'Sales Invoice' : 'Sales invoice',
    dateBy: 'transaction_date', customerType: 'individual',
    customers: [], groups: [], statuses: [], tags: [], tagLogic: 'and',
    categories: [], categoryLogic: 'and', products: [], showDetail: false,
    sortBy: kind === 'customer' ? 'customer_name' : 'product_name', sortLogic: 'asc',
  }
}

/** How many "more filter" fields differ from the defaults (drives the red dot). */
export function moreFilterActive(f: SalesReportFilters): boolean {
  return !!(f.customers.length || f.groups.length || f.statuses.length || f.tags.length
    || f.categories.length || f.products.length || f.showDetail || f.dateBy !== 'transaction_date')
}

// ── Base rows ────────────────────────────────────────────────────────────────
export interface SalesListRow {
  id: string
  date: string
  dueDate: string
  type: string
  number: string
  customerId: string
  customerName: string
  status: string
  memo: string
  gross: number
  tax: number
  total: number
  payment: number
  balance: number
  tags: string[]
}

export interface SalesLine {
  key: string
  invoiceId: string
  date: string
  type: string
  number: string
  customerId: string
  customerName: string
  productId: string
  sku: string
  productName: string
  category: string
  description: string
  qty: number
  unit: string
  unitPrice: number
  discountPct: number
  /** qty × unit price, before the line discount */
  totalPrice: number
  /** after the line discount, tax-exclusive (prod transaction_lines.amount) */
  amount: number
  /** this line's share of the invoice-level discount and of the tax (largest remainder, sums exactly) */
  discountShare: number
  taxShare: number
}

interface InvoiceBundle { row: SalesListRow; lines: SalesLine[]; discount: number; tax: number }

/** Split `total` across `weights` proportionally, in whole rupiah, summing exactly. */
function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0)
  if (!total || !sum) return weights.map(() => 0)
  const raw = weights.map((w) => (total * w) / sum)
  const out = raw.map(Math.floor)
  let rest = total - out.reduce((s, v) => s + v, 0)
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac)
  for (let k = 0; rest > 0 && k < order.length; k++, rest--) out[order[k]!.i]! += 1
  return out
}

let cache: { stamp: string; bundles: InvoiceBundle[] } | null = null

/** One bundle per invoice — rebuilt when the invoice store changes (e.g. a delete). */
function bundles(): InvoiceBundle[] {
  const stamp = salesInvoices.map((i) => `${i.id}:${i.total}:${i.balance}:${i.status}`).join('|')
  if (cache && cache.stamp === stamp) return cache.bundles
  const out: InvoiceBundle[] = salesInvoices.map((inv) => {
    const det = getSalesInvoiceDetail(inv.id)
    const t = det.totals
    const number = String(inv.number)
    const row: SalesListRow = {
      id: inv.id, date: inv.date, dueDate: inv.dueDate, type: 'Sales Invoice', number,
      customerId: inv.customer.id, customerName: inv.customer.name,
      status: STATUS_LABEL[inv.status], memo: det.memo,
      gross: t.subtotal - t.discountPerLine - t.globalDiscount, tax: t.taxAmount,
      total: inv.total, payment: inv.total - inv.balance, balance: inv.balance,
      tags: inv.tags ?? [],
    }
    const amounts = det.lineItems.map((li) => li.amount)
    const dShare = allocate(t.globalDiscount, amounts)
    const tShare = allocate(t.taxAmount, amounts)
    const lines: SalesLine[] = det.lineItems.map((li, j) => {
      const p = CATALOG.find((c) => c.sku === li.sku)
      return {
        key: `${inv.id}-${j}`, invoiceId: inv.id, date: inv.date, type: 'Sales Invoice', number,
        customerId: inv.customer.id, customerName: inv.customer.name,
        productId: p?.id ?? li.sku, sku: li.sku, productName: li.product, category: p?.category ?? '',
        description: li.description, qty: li.qty, unit: li.unit, unitPrice: li.unitPrice,
        discountPct: li.discountPct, totalPrice: li.qty * li.unitPrice, amount: li.amount,
        discountShare: dShare[j]!, taxShare: tShare[j]!,
      }
    })
    return { row, lines, discount: t.globalDiscount, tax: t.taxAmount }
  })
  cache = { stamp, bundles: out }
  return out
}

// ── Filtering ────────────────────────────────────────────────────────────────
const groupsByCustomerName = new Map(contacts.map((c) => [c.displayName, c.groups ?? []]))
/** Contact detail route for a customer, when the contact master has them. */
export function customerLink(name: string): string | null {
  const c = contacts.find((x) => x.displayName === name)
  return c ? `/customers/${c.id}` : null
}
export function productLink(sku: string): string { return `/product-list/${sku}` }
export function invoiceLink(id: string): string { return `/sales-invoices/${id}` }

function inRange(f: SalesReportFilters, date: string): boolean {
  const s = dmyToIso(f.start), e = dmyToIso(f.end)
  return (!s || date >= s) && (!e || date <= e)
}
function passesHeader(f: SalesReportFilters, r: SalesListRow, kind: 'list' | 'customer' | 'product'): boolean {
  if (!inRange(f, kind === 'list' && f.dateBy === 'due_date' ? r.dueDate : r.date)) return false
  if (kind === 'list' && f.customerType === 'group') {
    if (f.groups.length && !(groupsByCustomerName.get(r.customerName) ?? []).some((g) => f.groups.includes(g))) return false
  } else if (f.customers.length && !f.customers.includes(r.customerName)) return false
  if (kind === 'list' && f.statuses.length && !f.statuses.includes(r.status)) return false
  if (f.tags.length) {
    const ok = f.tagLogic === 'and' ? f.tags.every((t) => r.tags.includes(t)) : f.tags.some((t) => r.tags.includes(t))
    if (!ok) return false
  }
  return true
}
function passesLine(f: SalesReportFilters, l: SalesLine, kind: 'customer' | 'product'): boolean {
  // Prod's tooltips describe both Include all and Either as showing data of every
  // selected category — a line has one category, so both behave as "any of".
  if (f.categories.length && !f.categories.includes(l.category)) return false
  if (kind === 'product' && f.products.length && !f.products.includes(l.productName)) return false
  return true
}

// ── Sales list ───────────────────────────────────────────────────────────────
export interface SalesListResult { rows: SalesListRow[]; totals: { gross: number; tax: number; total: number; payment: number; balance: number } }
export function salesListReport(f: SalesReportFilters): SalesListResult {
  const rows = bundles().map((b) => b.row).filter((r) => passesHeader(f, r, 'list'))
    .sort((a, b) => (a.date === b.date ? Number(a.number) - Number(b.number) : a.date < b.date ? -1 : 1))
  const sum = (k: 'gross' | 'tax' | 'total' | 'payment' | 'balance') => rows.reduce((s, r) => s + r[k], 0)
  return { rows, totals: { gross: sum('gross'), tax: sum('tax'), total: sum('total'), payment: sum('payment'), balance: sum('balance') } }
}

// ── Sales by customer ────────────────────────────────────────────────────────
export interface CustomerTxnRow {
  key: string
  kind: 'product' | 'discount' | 'tax'
  invoiceId: string
  date: string
  type: string
  number: string
  productName: string
  sku: string
  description: string
  qty: number | null
  unit: string
  unitPrice: number | null
  amount: number
  /** running total within the customer (prod "Total amount due") */
  running: number
}
export interface CustomerGroup { customerId: string; customerName: string; rows: CustomerTxnRow[]; subtotal: number }
export interface SalesByCustomerResult { groups: CustomerGroup[]; total: number }

export function salesByCustomerReport(f: SalesReportFilters): SalesByCustomerResult {
  const map = new Map<string, CustomerGroup>()
  const list = bundles().filter((b) => passesHeader(f, b.row, 'customer'))
    .sort((a, b) => (a.row.date === b.row.date ? Number(a.row.number) - Number(b.row.number) : a.row.date < b.row.date ? -1 : 1))
  for (const b of list) {
    const lines = b.lines.filter((l) => passesLine(f, l, 'customer'))
    if (!lines.length) continue
    let g = map.get(b.row.customerId)
    if (!g) { g = { customerId: b.row.customerId, customerName: b.row.customerName, rows: [], subtotal: 0 }; map.set(b.row.customerId, g) }
    const base = { invoiceId: b.row.id, date: b.row.date, type: b.row.type, number: b.row.number }
    const push = (r: Omit<CustomerTxnRow, 'running'>) => { g!.subtotal += r.amount; g!.rows.push({ ...r, running: g!.subtotal }) }
    for (const l of lines) {
      push({ ...base, key: l.key, kind: 'product', productName: l.productName, sku: l.sku, description: l.description, qty: l.qty, unit: l.unit, unitPrice: l.unitPrice, amount: l.amount })
    }
    const disc = lines.reduce((s, l) => s + l.discountShare, 0)
    const tax = lines.reduce((s, l) => s + l.taxShare, 0)
    if (disc) push({ ...base, key: `${b.row.id}-disc`, kind: 'discount', productName: 'Discount', sku: '', description: '', qty: null, unit: '', unitPrice: null, amount: -disc })
    if (tax) push({ ...base, key: `${b.row.id}-tax`, kind: 'tax', productName: 'PPN 11%', sku: '', description: '', qty: null, unit: '', unitPrice: null, amount: tax })
  }
  const dir = f.sortLogic === 'desc' ? -1 : 1
  const groups = [...map.values()].sort((a, b) =>
    f.sortBy === 'total_sales' ? (a.subtotal - b.subtotal) * dir : a.customerName.localeCompare(b.customerName) * dir)
  return { groups, total: groups.reduce((s, g) => s + g.subtotal, 0) }
}

// ── Sales by product ─────────────────────────────────────────────────────────
export interface ProductGroup {
  productId: string
  sku: string
  productName: string
  unit: string
  lines: SalesLine[]
  salesQty: number
  returnQty: number
  salesValue: number
  returnValue: number
  avgValue: number
  totalPrice: number
  /** invoice-level discount + tax carried by these lines (for the tie-out only) */
  discountShare: number
  taxShare: number
}
export interface SalesByProductResult {
  products: ProductGroup[]
  totals: { salesQty: number; returnQty: number; salesValue: number; returnValue: number; totalPrice: number }
}

export function salesByProductReport(f: SalesReportFilters): SalesByProductResult {
  const map = new Map<string, ProductGroup>()
  for (const b of bundles()) {
    if (!passesHeader(f, b.row, 'product')) continue
    for (const l of b.lines) {
      if (!passesLine(f, l, 'product')) continue
      let g = map.get(l.sku)
      if (!g) {
        g = { productId: l.productId, sku: l.sku, productName: l.productName, unit: l.unit, lines: [], salesQty: 0, returnQty: 0, salesValue: 0, returnValue: 0, avgValue: 0, totalPrice: 0, discountShare: 0, taxShare: 0 }
        map.set(l.sku, g)
      }
      g.lines.push(l)
      g.salesQty += l.qty; g.salesValue += l.amount; g.totalPrice += l.totalPrice
      g.discountShare += l.discountShare; g.taxShare += l.taxShare
    }
  }
  const products = [...map.values()]
  for (const g of products) {
    g.avgValue = g.salesQty ? g.salesValue / g.salesQty : 0
    g.lines.sort((a, b) => (a.date === b.date ? Number(a.number) - Number(b.number) : a.date < b.date ? -1 : 1))
  }
  const dir = f.sortLogic === 'desc' ? -1 : 1
  const key: Record<string, (g: ProductGroup) => number | string> = {
    product_name: (g) => g.productName, product_code: (g) => g.sku, product_qty: (g) => g.salesQty,
    product_qty_return: (g) => g.returnQty, total_value_sold: (g) => g.salesValue, avg_sell_price: (g) => g.avgValue,
    price: (g) => g.totalPrice, total: (g) => g.salesValue,
  }
  const k = key[f.sortBy] ?? key.product_name!
  products.sort((a, b) => {
    const x = k(a), y = k(b)
    return (typeof x === 'string' ? x.localeCompare(y as string) : x - (y as number)) * dir
  })
  const sum = (fn: (g: ProductGroup) => number) => products.reduce((s, g) => s + fn(g), 0)
  return {
    products,
    totals: { salesQty: sum((g) => g.salesQty), returnQty: 0, salesValue: sum((g) => g.salesValue), returnValue: 0, totalPrice: sum((g) => g.totalPrice) },
  }
}

// ── Tie-out ──────────────────────────────────────────────────────────────────
/**
 * Dev-time arithmetic check (same spirit as consolidation's assertReportBalances):
 * totals equal the sum of their rows, and the three reports agree for the same
 * period + header filters. Throws on the first mismatch.
 */
export function assertSalesReportsTie(f: SalesReportFilters): { list: number; byCustomer: number; byProduct: number; discount: number; tax: number } {
  const fail = (m: string) => { throw new Error(`[salesReports] ${m}`) }
  // The list has no product/category filters — compare on header filters only.
  const hf: SalesReportFilters = { ...f, categories: [], products: [], statuses: [], groups: [], customerType: 'individual', dateBy: 'transaction_date' }
  const list = salesListReport(hf)
  const cust = salesByCustomerReport(hf)
  const prod = salesByProductReport(hf)
  if (list.rows.reduce((s, r) => s + r.total, 0) !== list.totals.total) fail('sales list TOTAL ≠ Σ rows')
  for (const r of list.rows) if (r.gross + r.tax !== r.total) fail(`invoice ${r.number}: gross + tax ≠ total`)
  for (const g of cust.groups) {
    if (g.rows.reduce((s, r) => s + r.amount, 0) !== g.subtotal) fail(`${g.customerName}: subtotal ≠ Σ rows`)
    if (g.rows.at(-1)?.running !== g.subtotal) fail(`${g.customerName}: running total ≠ subtotal`)
  }
  if (cust.groups.reduce((s, g) => s + g.subtotal, 0) !== cust.total) fail('by-customer Total ≠ Σ subtotals')
  if (cust.total !== list.totals.total) fail(`by-customer Total ${cust.total} ≠ sales list Total ${list.totals.total}`)
  const discount = prod.products.reduce((s, g) => s + g.discountShare, 0)
  const tax = prod.products.reduce((s, g) => s + g.taxShare, 0)
  if (prod.products.reduce((s, g) => s + g.salesValue, 0) !== prod.totals.salesValue) fail('by-product total ≠ Σ products')
  if (prod.totals.salesValue - discount + tax !== list.totals.total) fail(`by-product ${prod.totals.salesValue} − discount ${discount} + tax ${tax} ≠ sales list Total ${list.totals.total}`)
  if (tax !== list.totals.tax) fail('by-product tax share ≠ sales list Total Tax')
  const custProductLines = cust.groups.reduce((s, g) => s + g.rows.filter((r) => r.kind === 'product').reduce((a, r) => a + r.amount, 0), 0)
  if (custProductLines !== prod.totals.salesValue) fail(`by-customer product lines ${custProductLines} ≠ by-product Total sales value ${prod.totals.salesValue}`)
  if (prod.totals.salesValue - discount !== list.totals.gross) fail('by-product net of discounts ≠ sales list Gross Amount')
  return { list: list.totals.total, byCustomer: cust.total, byProduct: prod.totals.salesValue, discount, tax }
}

if (import.meta.dev) {
  for (const p of ['this_year', 'this_month', 'last_month', 'this_quarter', 'today']) {
    const f = defaultSalesReportFilters('list')
    const [s, e] = salesPeriodRange(p)!
    f.start = isoToDmy(s); f.end = isoToDmy(e); f.period = p
    assertSalesReportsTie(f)
    assertSalesReportsTie({ ...f, tags: ['B2B'] })
  }
}
