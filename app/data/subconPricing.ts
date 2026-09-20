/**
 * Subcontracting — vendor price basis, and the cost that follows from it.
 *
 * PURE: no Vue, no stores, no side effects. Every screen reads from here and no
 * component recomputes, so the purchase order and the work order can never
 * disagree about what the run costs.
 *
 * ── What the basis actually changes ──────────────────────────────────────────
 * Withholding tax (PPh 23) is deducted on toll manufacturing — Resupply and
 * Dropship. Basic is a purchase of goods and carries none.
 *
 * The basis changes who BEARS that tax, never whether it exists:
 *
 *   • `gross` — the agreed price already contains the withholding. The vendor
 *     receives less than the contract value; our cost is the contract value.
 *   • `net`   — the vendor must receive the agreed price in full, so the price is
 *     grossed up before the tax is deducted. Our cost is the contract value plus
 *     that gross-up.
 *
 * Which is why withholding is shown on BOTH bases and only the gross-up line is
 * conditional. Hiding withholding on a Gross order would silently drop a
 * deduction that is still happening.
 *
 * ── OPEN QUESTIONS ──────────────────────────────────────────────────────────
 *
 *  1. Rounding order. The brief spreads the gross-up per line at 2 decimals — so
 *     cost drivers stay intact and each line remains auditable — and then takes
 *     VAT and withholding from the TOTAL. Those two rules do not quite meet: the
 *     2-decimal line sum is 13,367,346.94 on the reference fixture, and
 *     `S - WHT` then lands 0.06 short of the contract value rather than exactly
 *     on it, which the same brief requires. This module therefore keeps the
 *     per-line spread at 2 decimals for display and rounds the TOTAL to the
 *     rupiah before deriving anything from it. That reproduces every published
 *     figure exactly and makes the invariant hold. Finance has not confirmed the
 *     rounding order, and a tax invoice may have its own rule.
 *
 *  2. Whether changing the basis on a purchase order needs approval. Implemented
 *     as no approval — see `SUBCON_PRICING_SETTINGS.priceBasisChangeNeedsApproval`.
 */

import type { SubconMethod, SubconPriceBasis } from './subcon'

// ── Settings still open with Finance ──────────────────────────────────────────

export interface SubconPricingSettings {
  /**
   * Whether changing a purchase order's price basis has to be approved. Off:
   * the basis is a commercial term the buyer owns. Open with Finance — it moves
   * real money, so it may warrant the same gate as a price change.
   */
  priceBasisChangeNeedsApproval: boolean
  /** PPh 23 on toll manufacturing, vendor NPWP-registered. */
  withholdingRateWithNpwp: number
  /** PPh 23 on toll manufacturing, vendor not NPWP-registered. */
  withholdingRateWithoutNpwp: number
}

export const SUBCON_PRICING_SETTINGS: SubconPricingSettings = {
  priceBasisChangeNeedsApproval: false,
  withholdingRateWithNpwp: 0.02,
  withholdingRateWithoutNpwp: 0.04,
}

// ── The withholding rate ──────────────────────────────────────────────────────

/**
 * The PPh 23 rate. DERIVED — never an input field anywhere in the UI.
 *
 * Basic is a purchase of goods under PMK 141/2015: the vendor supplies the
 * materials and owns the output until handover, so no withholding applies.
 */
export function withholdingRate(
  method: SubconMethod,
  vendorHasNpwp: boolean,
  settings: SubconPricingSettings = SUBCON_PRICING_SETTINGS,
): number {
  if (method === 'basic') return 0
  return vendorHasNpwp ? settings.withholdingRateWithNpwp : settings.withholdingRateWithoutNpwp
}

/** True when this order is toll manufacturing, and so carries withholding at all. */
export function isTollManufacturing(method: SubconMethod): boolean {
  return method !== 'basic'
}

// ── Input ─────────────────────────────────────────────────────────────────────

export interface SubconPriceLine {
  id: string
  name: string
  /** The contract value for this line — what was agreed, before any gross-up. */
  contractValue: number
}

export interface SubconPricingInput {
  method: SubconMethod
  basis: SubconPriceBasis
  vendorHasNpwp: boolean
  /** Service lines at their agreed values. */
  lines: SubconPriceLine[]
  /** VAT rate on the document. */
  vatRate: number
  /** Whether that VAT can be credited. Non-creditable VAT lands in product cost. */
  vatCreditable: boolean
  /** Material value the VENDOR supplies — Basic only, zero otherwise. */
  vendorMaterialValue?: number
  /** Material value from the BOM — our own components. */
  bomMaterialValue?: number
  settings?: Partial<SubconPricingSettings>
}

// ── Output ────────────────────────────────────────────────────────────────────

export interface SubconPricedLine extends SubconPriceLine {
  /** Contract value grossed up. Equals the contract value on a Gross basis. */
  grossedValue: number
  /** What this line contributes to the gross-up. Zero on a Gross basis. */
  grossUp: number
}

export interface SubconPricing {
  basis: SubconPriceBasis
  /** The derived PPh 23 rate — 0 on Basic. */
  withholdingRate: number
  /** True when withholding applies at all, whatever the basis. */
  tollManufacturing: boolean
  /** The gross-up multiplier: 1 on Gross, 1/(1-t) on Net. */
  factor: number

  lines: SubconPricedLine[]
  /** Sum of the agreed contract values — what the BOM holds. */
  contractValue: number
  /** `S` — the service value the vendor is billed for, to the rupiah. */
  serviceValue: number
  /** `S - contractValue`. Zero on a Gross basis; the company bears this. */
  grossUp: number

  vendorMaterialValue: number
  vat: number
  vatCreditable: boolean
  withholding: number

  documentTotal: number
  paidToVendor: number
  /** What capitalises into the product. Withholding NEVER appears here. */
  productCost: number
}

/** Round to whole rupiah. */
const rp = (n: number) => Math.round(n)
/** Round to 2 decimals — the per-line spread, so cost drivers stay intact. */
const cents = (n: number) => Math.round(n * 100) / 100

/**
 * Price a subcon order.
 *
 * The order of operations matters and is the subject of OPEN QUESTION 1: the
 * gross-up is spread across the lines at 2 decimals for display, but the service
 * value is rounded to the rupiah BEFORE VAT, withholding and product cost are
 * taken from it. Deriving them from the unrounded sum instead leaves `S - WHT`
 * a few cents short of the contract value, which is the one thing a Net basis
 * exists to guarantee.
 */
export function priceSubconOrder(input: SubconPricingInput): SubconPricing {
  const settings = { ...SUBCON_PRICING_SETTINGS, ...input.settings }
  const t = withholdingRate(input.method, input.vendorHasNpwp, settings)
  // On Gross the price already contains the tax, so there is nothing to add.
  // On Basic t is 0, which makes the factor 1 whatever the basis — no special case.
  const factor = input.basis === 'net' && t < 1 ? 1 / (1 - t) : 1

  const lines: SubconPricedLine[] = input.lines.map(l => ({
    ...l,
    grossedValue: cents(l.contractValue * factor),
    grossUp: cents(l.contractValue * factor) - l.contractValue,
  }))

  const contractValue = input.lines.reduce((s, l) => s + l.contractValue, 0)
  const serviceValue = rp(lines.reduce((s, l) => s + l.grossedValue, 0))
  const grossUp = serviceValue - contractValue

  const vendorMaterialValue = input.vendorMaterialValue ?? 0
  const bomMaterialValue = input.bomMaterialValue ?? 0

  // VAT and withholding come from the TOTAL, never summed per line.
  const vat = rp((serviceValue + vendorMaterialValue) * input.vatRate)
  const withholding = rp(serviceValue * t)

  const documentTotal = serviceValue + vendorMaterialValue + vat
  const paidToVendor = documentTotal - withholding

  // Withholding is a tax we remit on the vendor's behalf, not a cost of the
  // goods — it never capitalises. Non-creditable VAT does.
  const productCost = bomMaterialValue + serviceValue + vendorMaterialValue
    + (input.vatCreditable ? 0 : vat)

  return {
    basis: input.basis,
    withholdingRate: t,
    tollManufacturing: isTollManufacturing(input.method),
    factor,
    lines,
    contractValue,
    serviceValue,
    grossUp,
    vendorMaterialValue,
    vat,
    vatCreditable: input.vatCreditable,
    withholding,
    documentTotal,
    paidToVendor,
    productCost,
  }
}

/** Cost per unit of output, at whatever precision the caller wants to show. */
export function subconCostPerUnit(pricing: SubconPricing, outputQty: number): number {
  return outputQty > 0 ? pricing.productCost / outputQty : 0
}

// ── Display helpers ───────────────────────────────────────────────────────────

export const SUBCON_PRICE_BASIS_LABEL: Record<SubconPriceBasis, string> = {
  net: 'Net of withholding — vendor receives the full amount',
  gross: 'Gross — price already includes what we withhold',
}

/** The short form, for a table cell or a chip. */
export const SUBCON_PRICE_BASIS_SHORT: Record<SubconPriceBasis, string> = {
  net: 'Net basis',
  gross: 'Gross basis',
}

/** "PPh 23 · 2% of the service value", or the Basic case. */
export function withholdingCaption(pricing: SubconPricing): string {
  if (!pricing.tollManufacturing) return 'Not applicable — purchase of goods'
  return `PPh 23 · ${(pricing.withholdingRate * 100).toFixed(0)}% of the service value`
}

/**
 * A tax code's creditability. VAT that cannot be credited is a real cost and
 * capitalises into the product; creditable VAT is reclaimed and does not.
 */
export function isVatCreditable(taxLabel: string): boolean {
  return /ppn/i.test(taxLabel) && !/non/i.test(taxLabel)
}

/**
 * Where the figure on a work order stands, since the order usually exists before
 * the purchase order does.
 *  • `estimated` — no PO yet; computed from the vendor's default basis.
 *  • `committed` — a PO exists; the figure follows it.
 *  • `actual`    — the vendor has invoiced; the figure is final.
 */
export type SubconPriceState = 'estimated' | 'committed' | 'actual'

export const SUBCON_PRICE_STATE_LABEL: Record<SubconPriceState, string> = {
  estimated: 'Estimated',
  committed: 'Committed',
  actual: 'Actual',
}
