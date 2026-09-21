/**
 * Vendor last purchase price — DERIVED, never maintained.
 *
 * PRD "Vendor Supply Profile" (v1.0, 18 Sep 2026), rules 5–11. The figure a buyer
 * sees on the vendor's Products tab is not a price anybody typed: it is read back
 * off the approved Supplier Invoice that produced it. That distinction is the whole
 * feature — `vendorItems.unitCost` is the *agreed* price the replenishment engine
 * orders at, this is the *paid* price the buyer negotiates against.
 *
 * What the rules force into this shape:
 *   • Rule 5  — an approved Supplier Invoice is the ONLY source. No PO, no PD.
 *   • Rule 6  — gross unit price: before line discount, before doc discount, before tax.
 *   • Rule 7  — stored and shown in the UoM OF THE INVOICE LINE, with no conversion.
 *               So `uom` here can differ from the row's own `purchaseUnit`, and the
 *               UI must render the two together or the number means nothing.
 *   • Rule 9  — "latest" is the invoice transaction date; history is append-only.
 *   • Rule 18 — original currency is retained; a USD vendor is not flattened to IDR.
 *
 * A pair with no approved invoice yet has NO price. That is an explicit state
 * ("no purchase yet"), not a zero and not a blank — see `lastPriceFor` returning
 * `null` and US-06 AC-02. Zero would read as "free", which is a different fact.
 *
 * Deterministic: seeded from hashStr, never Math.random, so the same vendor/SKU
 * renders the same price on every load and across SSR.
 */
import { hashStr } from './cycleCountRecommendations'
import { productBySku } from './inventory'
import { largestUnitFor } from './productUnits'
import { purchaseInvoices } from './purchaseInvoices'
import { simDaysAgo } from './simClock'

export interface VendorPriceRecord {
  /** Gross unit price before every discount and before tax (Rule 6). */
  grossUnitPrice: number
  /** ISO 4217. IDR renders 0 decimals, everything else 2 (Rule 19). */
  currency: string
  /** The UoM ON THE INVOICE LINE — not converted, not the row's purchase unit (Rule 7). */
  uom: string
  /** Invoice transaction date, ISO yyyy-mm-dd. Decides "latest" (Rule 9). */
  date: string
  /** Source document, for the drill-through (TS-007). */
  invoiceId: string
  invoiceNumber: string
  /** Rule 25 — the price is visible even when the invoice behind it is not. */
  invoiceAccessible: boolean
}

/** Pairs the user added by hand this session. They have no invoice, so no price. */
const manuallyAdded = new Set<string>()

/** Pairs whose price the user should never see as "priced" regardless of seed. */
export function markManuallyAdded(vendorId: string, sku: string): void {
  manuallyAdded.add(`${vendorId}|${sku}`)
}

/** Invoices belonging to a vendor, newest first (purchaseInvoices is already reversed). */
function invoicesForVendor(vendorId: string) {
  return purchaseInvoices.filter((inv) => inv.vendor.id === vendorId)
}

/**
 * The last approved-invoice price for a vendor/SKU pair, or `null` when the pair
 * has never been invoiced.
 *
 * `null` is a real answer, not a failure: a product added by hand (TS-002) or one
 * the backfill found no history for legitimately has no price. Callers must render
 * that as its own state and must not coerce it to 0.
 */
export function lastPriceFor(vendorId: string, sku: string): VendorPriceRecord | null {
  if (manuallyAdded.has(`${vendorId}|${sku}`)) return null

  const seed = hashStr(`${vendorId}:${sku}:lastprice`)

  // ~18% of pairs carry no invoice history. These are the rows that exercise the
  // "no purchase yet" cell — without them the state would never be reachable.
  if (seed % 100 < 18) return null

  const invs = invoicesForVendor(vendorId)
  if (!invs.length) return null

  const product = productBySku(sku)
  if (!product) return null

  const invoice = invs[seed % invs.length]!

  // Rule 7 — the invoice line's UoM. Most lines are bought by the bulk unit, but
  // ~22% were invoiced in the product's base unit instead. That mismatch against
  // the row's own purchase unit is exactly why the UoM must sit beside the price.
  const bulk = largestUnitFor(sku)
  const invoicedInBaseUnit = seed % 100 < 22
  const uom = invoicedInBaseUnit ? product.unit : bulk.name
  const factor = invoicedInBaseUnit ? 1 : bulk.factor

  // Rule 18 — a small number of vendors invoice in USD; their history stays in USD.
  const currency = seed % 100 >= 92 ? 'USD' : 'IDR'

  // Gross price, ±12% around the catalogue buy price so two vendors never quote
  // the same SKU identically.
  // `>>>`, not `>>` — hashStr is unsigned, and a signed shift on a hash above
  // 2^31 yields a negative remainder, which would drag the skew below its band.
  const skew = 0.88 + ((seed >>> 3) % 25) / 100
  const grossIDR = product.buyPrice * factor * skew

  const grossUnitPrice = currency === 'USD'
    ? Math.round((grossIDR / 16_200) * 100) / 100
    : Math.round(grossIDR / 500) * 500

  return {
    grossUnitPrice,
    currency,
    uom,
    date: invoice.date,
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    // Rule 25 — ~10% of source invoices sit outside this user's access. The price
    // still shows; only the link is withheld, with its reason stated.
    invoiceAccessible: (seed >>> 7) % 10 !== 0,
  }
}

/**
 * Whether any Purchase Delivery or Supplier Invoice references this pair (Rule 2).
 *
 * This is what blocks removal. A pair that has been transacted is history and is
 * not rewritable; a mis-keyed pair that has never been used still is. The UI must
 * state which one it is looking at rather than greying the action out in silence.
 */
export function hasTransactionHistory(vendorId: string, sku: string): boolean {
  if (manuallyAdded.has(`${vendorId}|${sku}`)) return false
  return lastPriceFor(vendorId, sku) !== null
}

/**
 * Price history behind the last price, newest first (OD-003, append-only).
 *
 * Used by the price drill-through so a buyer can see the trend, not just the most
 * recent figure. Entries older than the last price are synthesised back in time
 * from the same seed, so the series is stable and the newest entry always equals
 * `lastPriceFor`.
 */
export function priceHistoryFor(vendorId: string, sku: string): VendorPriceRecord[] {
  const latest = lastPriceFor(vendorId, sku)
  if (!latest) return []

  const seed = hashStr(`${vendorId}:${sku}:history`)
  const invs = invoicesForVendor(vendorId)
  const count = 1 + (seed % 4) // 1–4 prior purchases

  const out: VendorPriceRecord[] = [latest]
  for (let i = 1; i <= count; i++) {
    const inv = invs[(seed + i * 7) % invs.length]
    if (!inv || inv.date >= latest.date) continue
    // Older purchases trend cheaper, so the series reads as a price increase over
    // time — the thing a buyer is looking for when they open this.
    out.push({
      ...latest,
      grossUnitPrice: latest.currency === 'IDR'
        ? Math.round((latest.grossUnitPrice * (1 - i * 0.035)) / 500) * 500
        : Math.round(latest.grossUnitPrice * (1 - i * 0.035) * 100) / 100,
      date: inv.date,
      invoiceId: inv.id,
      invoiceNumber: inv.number,
    })
  }
  return out.sort((a, b) => b.date.localeCompare(a.date))
}

/**
 * The 24-month backfill (OD-006) state for a vendor.
 *
 * While it is running the tab is legitimately incomplete, and saying so is the
 * difference between "this vendor has no history" and "we have not finished
 * reading it yet". The banner this drives exists so a half-populated tab is never
 * mistaken for a broken one.
 */
export function backfillPendingSince(): string {
  return simDaysAgo(1)
}
