import { purchaseInvoices } from './purchaseInvoices'
import { getPurchaseInvoiceDetail, type PurchaseInvoiceDetail } from './purchaseInvoiceDetails'
import { products } from './products'
import { vendors } from './vendors'
import type { PurchaseInvoice } from './types'

/**
 * Reports › Purchases — Purchase List, Purchase by vendor, Purchase by product.
 *
 * Every number is derived from the purchase-invoice mock (`purchaseInvoices.ts`
 * + the line items synthesised in `purchaseInvoiceDetails.ts`), so a report row
 * always matches the invoice the user clicks through to. Nothing here is a
 * second dataset.
 *
 * Tie-outs (asserted in dev at module load, see `assertPurchaseReportsTie`):
 *   • Purchase List "Total"            = Σ invoice amounts (incl. tax)
 *   • Purchase by vendor grand total   = Purchase List "Total"
 *     (prod lists each line plus a "Tax" line per transaction)
 *   • Purchase by product purchase value = Purchase List "Gross Amount"
 *     (prod's value_sell = qty × price, pre-tax), and
 *     Gross Amount + Total Tax = Total.
 */

export type PurRptStatus = 'open' | 'partial' | 'partially_sent' | 'paid' | 'overdue' | 'closed'
export type PurRptDateBy = 'transaction_date' | 'due_date'
export type PurRptLogic = 'and' | 'or'

/** Purchase List › More filter › Transaction type (prod `transaction_type_options`). */
export const PUR_RPT_LIST_TRANSACTION_TYPES = [
  'Purchase Invoice', 'Purchase Order', 'Purchase Quotation', 'Purchase Order Payment',
  'Purchase Payment', 'Purchase Return', 'Purchase Invoice Payment',
] as const
/** Purchase by vendor / by product › Transaction type. */
export const PUR_RPT_VENDOR_TRANSACTION_TYPES = ['Purchase invoice', 'Purchase order', 'Purchase quotation'] as const

/** Status options (prod `statuses`, "All" = no status filter). */
export const PUR_RPT_STATUSES: { id: PurRptStatus; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'partial', label: 'Partial' },
  { id: 'partially_sent', label: 'Partially Sent' },
  { id: 'paid', label: 'Paid' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'closed', label: 'Closed' },
]
const STATUS_LABEL: Record<string, string> = Object.fromEntries(PUR_RPT_STATUSES.map((s) => [s.id, s.label]))

/**
 * Vendor → contact group. The vendor master carries no group, so the three
 * vendor groups seeded in `contactGroups.ts` are assigned by what the vendor
 * supplies (importers / packaging / distribution).
 */
const VENDOR_GROUP: Record<string, string> = {
  V001: 'Green bean importers', V002: 'Green bean importers', V003: 'Green bean importers',
  V004: 'Green bean importers', V005: 'Green bean importers',
  V006: 'Packaging suppliers',
  V008: 'Distributor',
}
export const PUR_RPT_VENDOR_GROUPS = ['Distributor', 'Green bean importers', 'Packaging suppliers']
export const purRptVendorNames = vendors.map((v) => v.name)
export const purRptProductCategories = [...new Set(products.map((p) => p.category))].sort()
export const purRptProductNames = products.map((p) => p.name)
export const purRptTags = [...new Set(purchaseInvoices.flatMap((i) => i.tags ?? []))].sort()

// ── Filters ──────────────────────────────────────────────────────────────────
export interface PurRptFilters {
  dateBy: PurRptDateBy
  tags: string[]
  tagLogic: PurRptLogic
  vendors: string[]
  vendorGroups: string[]
  statuses: PurRptStatus[]
  productCategories: string[]
  productCategoryLogic: PurRptLogic
  products: string[]
}
export function emptyPurRptFilters(): PurRptFilters {
  return {
    dateBy: 'transaction_date', tags: [], tagLogic: 'and', vendors: [], vendorGroups: [],
    statuses: [], productCategories: [], productCategoryLogic: 'and', products: [],
  }
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function inRange(dateIso: string, range: Date[]): boolean {
  const [s, e] = range
  if (!s || !e) return false
  return dateIso >= iso(s) && dateIso <= iso(e)
}
function categoryOf(sku: string): string {
  return products.find((p) => p.code === sku)?.category ?? ''
}

/** Invoices in the period that pass the header-level filters (vendor, group, tag, status). */
function invoicesFor(range: Date[], f: PurRptFilters): { inv: PurchaseInvoice; detail: PurchaseInvoiceDetail }[] {
  return purchaseInvoices
    .filter((inv) => inRange(f.dateBy === 'due_date' ? inv.dueDate : inv.date, range))
    .filter((inv) => !f.vendors.length || f.vendors.includes(inv.vendor.name))
    .filter((inv) => !f.vendorGroups.length || f.vendorGroups.includes(VENDOR_GROUP[inv.vendor.id] ?? ''))
    .filter((inv) => {
      if (!f.tags.length) return true
      const t = inv.tags ?? []
      return f.tagLogic === 'and' ? f.tags.every((x) => t.includes(x)) : f.tags.some((x) => t.includes(x))
    })
    .filter((inv) => !f.statuses.length || f.statuses.includes(inv.status as PurRptStatus))
    .map((inv) => ({ inv, detail: getPurchaseInvoiceDetail(inv.id) }))
    .sort((a, b) => a.inv.date.localeCompare(b.inv.date) || a.inv.number.localeCompare(b.inv.number))
}

// ── Purchase List ────────────────────────────────────────────────────────────
export interface PurRptListRow {
  id: string
  date: string
  transactionType: string
  number: string
  displayName: string
  status: string
  memo: string
  dueDate: string
  grossAmount: number
  totalTax: number
  total: number
  payment: number
  balanceDue: number
  link: string
}
export function purchasesListRows(range: Date[], f: PurRptFilters): PurRptListRow[] {
  return invoicesFor(range, f).map(({ inv, detail }) => {
    const balanceDue = inv.status === 'paid' ? 0 : inv.amount
    return {
      id: inv.id,
      date: inv.date,
      transactionType: 'Purchase Invoice',
      number: inv.number,
      displayName: inv.vendor.name,
      status: STATUS_LABEL[inv.status] ?? inv.status,
      memo: detail.memo,
      dueDate: inv.dueDate,
      grossAmount: detail.totals.subtotal,
      totalTax: detail.totals.taxAmount,
      total: inv.amount,
      payment: inv.amount - balanceDue,
      balanceDue,
      link: `/purchase-invoices/${inv.id}`,
    }
  })
}
export function purRptSum<T>(rows: T[], key: keyof T): number {
  return rows.reduce((s, r) => s + (Number(r[key]) || 0), 0)
}

// ── Purchase by vendor ───────────────────────────────────────────────────────
export interface PurRptVendorLine {
  key: string
  invoiceId: string
  date: string
  type: string
  number: string
  productName: string
  productSku: string | null   // null = the transaction's "Tax" line
  description: string
  quantity: number
  unit: string
  unitPrice: number
  amount: number
  total: number               // running total within the vendor (prod `total`)
  link: string
}
export interface PurRptVendorGroup { vendorId: string; vendorName: string; lines: PurRptVendorLine[]; subtotal: number }

function lineCategoryOk(sku: string | null, f: PurRptFilters): boolean {
  if (!f.productCategories.length) return true
  if (sku === null) return true // tax line follows its transaction
  return f.productCategories.includes(categoryOf(sku))
}

export function purchasesByVendor(range: Date[], f: PurRptFilters, sortBy: 'vendor_name' | 'total_purchases', sortLogic: 'asc' | 'desc'): PurRptVendorGroup[] {
  const byVendor = new Map<string, PurRptVendorGroup>()
  for (const { inv, detail } of invoicesFor(range, f)) {
    const items = detail.lineItems.filter((li) => lineCategoryOk(li.sku, f))
    if (!items.length) continue
    let g = byVendor.get(inv.vendor.id)
    if (!g) { g = { vendorId: inv.vendor.id, vendorName: inv.vendor.name, lines: [], subtotal: 0 }; byVendor.set(inv.vendor.id, g) }
    const base = { invoiceId: inv.id, date: inv.date, type: 'Purchase Invoice', number: inv.number, link: `/purchase-invoices/${inv.id}` }
    items.forEach((li, i) => {
      g!.subtotal += li.amount
      g!.lines.push({ ...base, key: `${inv.id}-${i}`, productName: li.product, productSku: li.sku, description: li.description, quantity: li.qty, unit: li.unit, unitPrice: li.unitPrice, amount: li.amount, total: g!.subtotal })
    })
    // Tax line — prorated when a category filter drops some of the lines.
    const fullSub = detail.lineItems.reduce((s, li) => s + li.amount, 0)
    const keptSub = items.reduce((s, li) => s + li.amount, 0)
    const tax = keptSub === fullSub ? detail.totals.taxAmount : Math.round(detail.totals.taxAmount * (keptSub / fullSub))
    if (tax > 0) {
      g.subtotal += tax
      g.lines.push({ ...base, key: `${inv.id}-tax`, productName: 'Tax', productSku: null, description: '', quantity: 0, unit: '', unitPrice: 0, amount: tax, total: g.subtotal })
    }
  }
  const out = [...byVendor.values()]
  const dir = sortLogic === 'asc' ? 1 : -1
  out.sort((a, b) => dir * (sortBy === 'vendor_name' ? a.vendorName.localeCompare(b.vendorName) : a.subtotal - b.subtotal))
  return out
}

// ── Purchase by product ──────────────────────────────────────────────────────
export interface PurRptProductRow {
  sku: string
  name: string
  category: string
  purchaseQty: number
  returnQty: number
  unit: string
  purchaseValue: number
  returnValue: number
  avgPurchaseValue: number
}
export interface PurRptProductDetailLine {
  key: string
  invoiceId: string
  date: string
  type: string
  number: string
  vendor: string
  quantity: number
  unit: string
  pricePerUnit: number
  totalPrice: number
  discount: string
  finalPrice: number
  link: string
}
export interface PurRptProductGroup { sku: string; name: string; lines: PurRptProductDetailLine[]; subQty: number; subPrice: number; subFinal: number }

export type PurRptProductSort = 'product_name_pbp' | 'product_code_pbp' | 'product_qty_pbp' | 'product_qty_return_pbp'
  | 'total_value_bought_pbp' | 'avg_buy_price_pbp' | 'price_pbp' | 'total_pbp'

function productLines(range: Date[], f: PurRptFilters) {
  const out: { inv: PurchaseInvoice; li: PurchaseInvoiceDetail['lineItems'][number]; i: number }[] = []
  for (const { inv, detail } of invoicesFor(range, f)) {
    detail.lineItems.forEach((li, i) => {
      if (!lineCategoryOk(li.sku, f)) return
      if (f.products.length && !f.products.includes(li.product)) return
      out.push({ inv, li, i })
    })
  }
  return out
}

export function purchasesByProduct(range: Date[], f: PurRptFilters, sortBy: PurRptProductSort, sortLogic: 'asc' | 'desc'): PurRptProductRow[] {
  const m = new Map<string, PurRptProductRow>()
  for (const { li } of productLines(range, f)) {
    let r = m.get(li.sku)
    if (!r) { r = { sku: li.sku, name: li.product, category: categoryOf(li.sku), purchaseQty: 0, returnQty: 0, unit: li.unit, purchaseValue: 0, returnValue: 0, avgPurchaseValue: 0 }; m.set(li.sku, r) }
    r.purchaseQty += li.qty
    r.purchaseValue += li.amount
  }
  const rows = [...m.values()].map((r) => ({ ...r, avgPurchaseValue: r.purchaseQty ? r.purchaseValue / r.purchaseQty : 0 }))
  const dir = sortLogic === 'asc' ? 1 : -1
  const key = (r: PurRptProductRow): string | number => ({
    product_name_pbp: r.name, product_code_pbp: r.sku, product_qty_pbp: r.purchaseQty, product_qty_return_pbp: r.returnQty,
    total_value_bought_pbp: r.purchaseValue, avg_buy_price_pbp: r.avgPurchaseValue, price_pbp: r.avgPurchaseValue, total_pbp: r.purchaseValue,
  } as Record<PurRptProductSort, string | number>)[sortBy]
  rows.sort((a, b) => { const x = key(a), y = key(b); return dir * (typeof x === 'string' ? x.localeCompare(String(y)) : x - Number(y)) })
  return rows
}

export function purchasesByProductDetail(range: Date[], f: PurRptFilters, sortBy: PurRptProductSort, sortLogic: 'asc' | 'desc'): PurRptProductGroup[] {
  const m = new Map<string, PurRptProductGroup>()
  for (const { inv, li, i } of productLines(range, f)) {
    let g = m.get(li.sku)
    if (!g) { g = { sku: li.sku, name: li.product, lines: [], subQty: 0, subPrice: 0, subFinal: 0 }; m.set(li.sku, g) }
    const totalPrice = li.qty * li.unitPrice
    g.lines.push({
      key: `${inv.id}-${i}`, invoiceId: inv.id, date: inv.date, type: 'Purchase Invoice', number: inv.number, vendor: inv.vendor.name,
      quantity: li.qty, unit: li.unit, pricePerUnit: li.unitPrice, totalPrice, discount: `${li.discountPct}%`, finalPrice: li.amount,
      link: `/purchase-invoices/${inv.id}`,
    })
    g.subQty += li.qty; g.subPrice += totalPrice; g.subFinal += li.amount
  }
  const groups = [...m.values()]
  const dir = sortLogic === 'asc' ? 1 : -1
  const key = (g: PurRptProductGroup): string | number => sortBy === 'product_code_pbp' ? g.sku
    : sortBy === 'product_qty_pbp' ? g.subQty : sortBy === 'price_pbp' ? g.subPrice : sortBy === 'total_pbp' ? g.subFinal : g.name
  groups.sort((a, b) => { const x = key(a), y = key(b); return dir * (typeof x === 'string' ? x.localeCompare(String(y)) : x - Number(y)) })
  return groups
}

// ── Integrity ────────────────────────────────────────────────────────────────
/**
 * Throws when the three Purchases reports disagree for the same period and
 * header filters. Run against the seed at load (dev only) and by each report
 * page whenever it regenerates.
 */
export function assertPurchaseReportsTie(range: Date[], f: PurRptFilters = emptyPurRptFilters()): void {
  const fail = (m: string) => { throw new Error(`[purchaseReports] ${m}`) }
  const header = { ...f, productCategories: [], products: [] }
  const list = purchasesListRows(range, header)
  const listTotal = purRptSum(list, 'total')
  const listGross = purRptSum(list, 'grossAmount')
  const listTax = purRptSum(list, 'totalTax')
  if (Math.abs(listGross + listTax - listTotal) > 0.5) fail(`list gross ${listGross} + tax ${listTax} ≠ total ${listTotal}`)
  const vend = purchasesByVendor(range, header, 'vendor_name', 'asc')
  for (const g of vend) {
    if (Math.abs(purRptSum(g.lines, 'amount') - g.subtotal) > 0.5) fail(`vendor ${g.vendorName} subtotal ≠ Σ lines`)
  }
  const vendTotal = purRptSum(vend, 'subtotal')
  if (Math.abs(vendTotal - listTotal) > 0.5) fail(`by-vendor total ${vendTotal} ≠ list total ${listTotal}`)
  const prod = purchasesByProduct(range, header, 'product_name_pbp', 'asc')
  const prodTotal = purRptSum(prod, 'purchaseValue')
  if (Math.abs(prodTotal - listGross) > 0.5) fail(`by-product purchase value ${prodTotal} ≠ list gross amount ${listGross}`)
  const det = purchasesByProductDetail(range, header, 'product_name_pbp', 'asc')
  const detTotal = purRptSum(det, 'subFinal')
  if (Math.abs(detTotal - prodTotal) > 0.5) fail(`by-product detail ${detTotal} ≠ summary ${prodTotal}`)
}

if (import.meta.dev) {
  const y = 2026
  for (let m = 0; m < 8; m++) assertPurchaseReportsTie([new Date(y, m, 1), new Date(y, m + 1, 0)])
  assertPurchaseReportsTie([new Date(y, 0, 1), new Date(y, 11, 31)])
  assertPurchaseReportsTie([new Date(y, 0, 1), new Date(y, 11, 31)], { ...emptyPurRptFilters(), tags: ['Import'], tagLogic: 'or' })
}
