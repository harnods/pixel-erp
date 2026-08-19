import { CATALOG } from './catalog'
import { salesInvoices } from './salesInvoices'
import { DJP_SKUS } from './productsIndex'
import type { SalesInvoiceLineItem, SalesInvoice, SILineItem } from './types'

/**
 * Mini "database" of sales invoice line items — the normalized table behind
 * the Sales Invoice detail page. Each row is just `{ invoiceId, productId,
 * qty, discountPct }`; name, SKU, unit, and unit price are never stored here,
 * they're joined from `CATALOG` (the product master) at read time via
 * `hydrateLineItem`. This is what keeps a sales invoice "connected to the
 * product db" instead of freezing a copy of the product's fields.
 *
 * The seed rows are generated (not hand-typed) so every invoice's items sum
 * to its own `total` exactly — see [salesInvoiceDetails.ts](salesInvoiceDetails.ts)
 * for how the tax-exclusive base is derived and reconciled.
 */

const TAX_RATE = 0.11

/** Smallest catalogue unit price — bounds how far a closing/balancing line can overshoot. */
export const MIN_CATALOG_PRICE = CATALOG.reduce((lo, p) => Math.min(lo, p.price), Infinity)

/**
 * The tax-exclusive base that reproduces `total` exactly under
 * `computeTotals` (total = base + round(base × 11%)). Starts from the
 * algebraic estimate and walks ±1 to absorb the rounding, so the invoice
 * total is hit on the nose.
 */
function baseForTotal(total: number): number {
  const start = Math.round(total / (1 + TAX_RATE))
  for (let delta = 0; delta <= 4; delta++) {
    for (const base of [start + delta, start - delta]) {
      if (base > 0 && base + Math.round(base * TAX_RATE) === total) return base
    }
  }
  return start
}

/** The whole-unit catalogue line that lands closest to `shortfall` without falling short. */
function closingLine(shortfall: number): { productId: string; qty: number } {
  let best: { productId: string; qty: number } | null = null
  let bestOvershoot = Infinity
  for (const p of CATALOG) {
    const qty = Math.max(1, Math.ceil(shortfall / p.price))
    const overshoot = qty * p.price - shortfall
    if (overshoot >= 0 && overshoot < bestOvershoot) {
      bestOvershoot = overshoot
      best = { productId: p.id, qty }
    }
  }
  return best!
}

/**
 * Fill up to `targetBase` with catalogue lines at their real catalogue
 * prices, added at natural quantities until the next one would overshoot;
 * `closingLine` then covers the shortfall. See salesInvoiceDetails.ts for how
 * the small overshoot is booked as the invoice's global discount.
 */
function buildRows(inv: SalesInvoice, idx: number, targetBase: number): SalesInvoiceLineItem[] {
  const count = Math.max(1, inv.itemCount)
  const rows: SalesInvoiceLineItem[] = []
  let acc = 0

  for (let j = 0; j < count - 1; j++) {
    const p = CATALOG[(idx * 5 + j * 7) % CATALOG.length]!
    const big = p.price >= 2_000_000
    const qty = big ? 1 + ((idx + j) % 2) : 1 + ((idx + j * 3) % 12)
    const discountPct = (j % 5 === 3) ? 10 : (j % 7 === 5 ? 5 : 0)
    const amount = Math.round(qty * p.price * (1 - discountPct / 100))
    if (acc + amount >= targetBase) continue
    rows.push({ invoiceId: inv.id, productId: p.id, qty, discountPct })
    acc += amount
  }

  const closing = closingLine(targetBase - acc)
  rows.push({ invoiceId: inv.id, productId: closing.productId, qty: closing.qty, discountPct: 0 })
  return rows
}

/** The seeded line-item table — one row per invoice line, every row FK'd to a real product. */
export const salesInvoiceLineItems: SalesInvoiceLineItem[] = salesInvoices.flatMap((inv, idx) => {
  const targetBase = inv.hasPpn ? baseForTotal(inv.total) : inv.total
  return buildRows(inv, idx, targetBase)
})

export function getLineItemsForInvoice(invoiceId: string): SalesInvoiceLineItem[] {
  return salesInvoiceLineItems.filter(li => li.invoiceId === invoiceId)
}

/** True when a product has both a DJP code and a DJP unit set — the e-Faktur
 *  eligibility rule. Reads off the same `DJP_SKUS` set the Products index
 *  displays (productsIndex.ts), keyed via the product's SKU, so this never
 *  drifts from what "DJP code" / "DJP unit" show on the product's own page. */
export function productHasDjpInfo(productId: string): boolean {
  const p = CATALOG.find(c => c.id === productId)
  if (!p) return false
  const info = DJP_SKUS.get(p.sku)
  return !!(info && info.djpCode && info.djpUnit)
}

/**
 * A tax document can only be generated for an invoice when EVERY line item's
 * product has DJP code + DJP unit set — one untaxed-classification line is
 * enough to block "Create tax document" for the whole invoice.
 */
export function canGenerateTaxDocument(invoiceId: string): boolean {
  const rows = getLineItemsForInvoice(invoiceId)
  return rows.length > 0 && rows.every(li => productHasDjpInfo(li.productId))
}

export interface MissingDjpProduct {
  productId: string
  name: string
  sku: string
  missingCode: boolean
  missingUnit: boolean
}

/** The distinct products on an invoice missing a DJP code and/or DJP unit —
 *  powers the "Cannot create tax document" drawer's Product tax info list
 *  (see CannotCreateTaxDocumentDrawer.vue). One entry per product even if it
 *  appears on multiple line items. */
export function getMissingDjpProducts(invoiceId: string): MissingDjpProduct[] {
  const seen = new Set<string>()
  const out: MissingDjpProduct[] = []
  for (const li of getLineItemsForInvoice(invoiceId)) {
    if (seen.has(li.productId)) continue
    const p = CATALOG.find(c => c.id === li.productId)
    if (!p) continue
    const info = DJP_SKUS.get(p.sku)
    const missingCode = !info?.djpCode
    const missingUnit = !info?.djpUnit
    if (!missingCode && !missingUnit) continue
    seen.add(li.productId)
    out.push({ productId: p.id, name: p.name, sku: p.sku, missingCode, missingUnit })
  }
  return out
}

/** Joins a stored row against the product catalogue and prices the line. */
export function hydrateLineItem(li: SalesInvoiceLineItem, taxLabel: string): SILineItem {
  const p = CATALOG.find(c => c.id === li.productId)!
  return {
    product: p.name,
    sku: p.sku,
    description: p.desc,
    unit: p.unit,
    unitPrice: p.price,
    qty: li.qty,
    discountPct: li.discountPct,
    amount: Math.round(li.qty * p.price * (1 - li.discountPct / 100)),
    taxLabel,
  }
}
