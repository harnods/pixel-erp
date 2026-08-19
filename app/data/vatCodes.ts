/**
 * VAT (PPN) codes for the "Create tax document" drawer's Domestic lane —
 * sourced from a reference implementation the user provided (a standalone
 * HTML page demonstrating exactly this "VAT code drives the Summary" logic).
 * Each code determines which Summary rows appear and how PPN is calculated;
 * see computeTaxDocumentSummary below.
 */

export type PpnRate = 'standard' | 'reduced' | 'none'

export interface VatCode {
  code: string        // '01'..'10'
  label: string        // full select-option label, e.g. "01 — Standard delivery, ..."
  /** Helper text shown under the VAT Code select once this code is chosen. */
  note: string
  ppnRate: PpnRate
  /** Only code 04 (DPP nilai lain) sets this — adds the "DPP lain" summary row. */
  hasDppLain: boolean
}

/** Reduced-rate codes (currently just "05") use this instead of the standard 11%. */
export const REDUCED_PPN_RATE = 0.06
/** "DPP lain" value = DPP × 11/12 (PMK 131/2024), per the reference implementation. */
export const DPP_LAIN_FACTOR = 11 / 12

export const VAT_CODES: VatCode[] = [
  { code: '01', label: '01 — Standard delivery, PPN collected by seller',              note: 'Standard rate, PPN collected by seller',            ppnRate: 'standard', hasDppLain: false },
  { code: '02', label: '02 — Delivery to government VAT collector',                     note: 'Collected by government VAT collector',             ppnRate: 'standard', hasDppLain: false },
  { code: '03', label: '03 — Delivery to other VAT collector (e.g. BUMN)',              note: 'Collected by other VAT collector (BUMN)',           ppnRate: 'standard', hasDppLain: false },
  { code: '04', label: '04 — Delivery using DPP nilai lain',                            note: 'DPP nilai lain applies (PMK 131/2024)',              ppnRate: 'standard', hasDppLain: true  },
  { code: '05', label: '05 — PPN collected at a specific rate',                         note: 'Special PPN rate, not the standard rate',            ppnRate: 'reduced',  hasDppLain: false },
  { code: '06', label: '06 — VAT refund for tourist',                                   note: 'VAT refund scheme for foreign tourists',             ppnRate: 'standard', hasDppLain: false },
  { code: '07', label: '07 — PPN not collected / government-borne facility',            note: 'PPN not collected / government-borne',               ppnRate: 'none',     hasDppLain: false },
  { code: '08', label: '08 — Delivery exempt from PPN/PPnBM',                           note: 'Exempt from PPN and PPnBM',                          ppnRate: 'none',     hasDppLain: false },
  { code: '09', label: '09 — Delivery of asset not originally for sale (Art. 16D)',     note: 'Sale of asset not originally for resale',            ppnRate: 'standard', hasDppLain: false },
  { code: '10', label: '10 — Other delivery, special rate outside Art. 7(1)',           note: 'Other delivery, non-standard rate',                  ppnRate: 'standard', hasDppLain: false },
]

export interface TaxDocumentSummary {
  salesInvoiceTotal: number
  dpp: number
  /** null when the selected code doesn't carry a "DPP lain" row (all but code 04). */
  dppLain: number | null
  ppn: number
  ppnbm: number
}

/**
 * Derive the Summary block for a selected VAT code, given the invoice's own
 * total and tax-exclusive base (dpp) plus its already-computed standard PPN
 * (avoids re-deriving 11% and drifting from the invoice's own ledger by a
 * rounding unit — codes that use the standard rate just reuse that number).
 */
export function computeTaxDocumentSummary(
  vatCode: VatCode, invoiceTotal: number, dpp: number, standardPpn: number,
): TaxDocumentSummary {
  const ppn =
    vatCode.ppnRate === 'none' ? 0
    : vatCode.ppnRate === 'reduced' ? Math.round(dpp * REDUCED_PPN_RATE)
    : standardPpn
  return {
    salesInvoiceTotal: invoiceTotal,
    dpp,
    dppLain: vatCode.hasDppLain ? Math.round(dpp * DPP_LAIN_FACTOR) : null,
    ppn,
    ppnbm: 0,   // no luxury-goods (PPnBM) items are modeled in this dataset
  }
}
