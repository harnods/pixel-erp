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
  /**
   * Whether a down-payment / settlement (faktur termin) may be raised under this
   * code. False for 06/07/08 — R-FK-1 blocks the termin block entirely there.
   *
   * Not to be confused with the OTHER "creditable": `isUncreditable()` = {02,07,08}
   * is about whether the BUYER can credit the input tax, which belongs to the
   * inbound side and plays no part in this form (§3.1).
   */
  creditable: boolean
  /**
   * Whether DPP Nilai Lain may differ from DPP. False only for 01, where
   * R-FK-2 forces them equal and the column is disabled.
   */
  otherDppAllowed: boolean
  /** Whether total PPN is derived and locked. True for 01, 04, 09 (R-FK-4). */
  ppnLocked: boolean
}

/** Reduced-rate codes (currently just "05") use this instead of the standard 11%. */
export const REDUCED_PPN_RATE = 0.06
/** "DPP lain" value = DPP × 11/12 (PMK 131/2024), per the reference implementation. */
export const DPP_LAIN_FACTOR = 11 / 12

/**
 * The ten transaction-detail codes, per §3.1 of the eFaktur keluaran spec.
 *
 * Labels follow the spec's own descriptions. Note 06 is "Penyerahan lainnya"
 * (other delivery) — the earlier "VAT refund for tourist" label here was wrong
 * and is corrected to match the enum the backend validates against.
 *
 * `hasDppLain` stays separate from `otherDppAllowed`: the first says whether the
 * Summary grows a "DPP lain" ROW (only 04 shows it as its own number), the
 * second says whether the FIELD may diverge from DPP at all (everything but 01).
 */
export const VAT_CODES: VatCode[] = [
  { code: '01', label: '01 — Delivery to a party that is not a VAT collector',          note: 'Standard rate, PPN collected by seller',             ppnRate: 'standard', hasDppLain: false, creditable: true,  otherDppAllowed: false, ppnLocked: true  },
  { code: '02', label: '02 — Delivery to a government treasurer VAT collector',          note: 'Collected by government VAT collector',              ppnRate: 'standard', hasDppLain: false, creditable: true,  otherDppAllowed: true,  ppnLocked: false },
  { code: '03', label: '03 — Delivery to a VAT collector other than a treasurer',        note: 'Collected by other VAT collector (e.g. BUMN)',       ppnRate: 'standard', hasDppLain: false, creditable: true,  otherDppAllowed: true,  ppnLocked: false },
  { code: '04', label: '04 — DPP nilai lain',                                            note: 'DPP nilai lain applies (PMK 131/2024)',              ppnRate: 'standard', hasDppLain: true,  creditable: true,  otherDppAllowed: true,  ppnLocked: true  },
  { code: '05', label: '05 — Besaran tertentu (Art. 9A(1))',                             note: 'Specific amount, not the standard rate',             ppnRate: 'reduced',  hasDppLain: false, creditable: true,  otherDppAllowed: true,  ppnLocked: false },
  { code: '06', label: '06 — Other delivery',                                            note: 'Other delivery; no down payment or settlement',      ppnRate: 'standard', hasDppLain: false, creditable: false, otherDppAllowed: true,  ppnLocked: false },
  { code: '07', label: '07 — Delivery where PPN is not collected',                       note: 'PPN not collected; requires additional remarks',     ppnRate: 'none',     hasDppLain: false, creditable: false, otherDppAllowed: true,  ppnLocked: false },
  { code: '08', label: '08 — Delivery exempt from PPN',                                  note: 'Exempt from PPN; requires additional remarks',       ppnRate: 'none',     hasDppLain: false, creditable: false, otherDppAllowed: true,  ppnLocked: false },
  { code: '09', label: '09 — Delivery of assets under Art. 16D',                         note: 'Sale of an asset not originally for resale',         ppnRate: 'standard', hasDppLain: false, creditable: true,  otherDppAllowed: true,  ppnLocked: true  },
  { code: '10', label: '10 — Other rate',                                                note: 'Other delivery, non-standard rate',                  ppnRate: 'standard', hasDppLain: false, creditable: true,  otherDppAllowed: true,  ppnLocked: false },
]

export function findVatCode(code: string): VatCode | undefined {
  return VAT_CODES.find(c => c.code === code)
}

/** Dropdown options for the ten codes — shared by FK and by DK transaction code 5. */
export function vatCodeOptions(): { value: string; label: string }[] {
  return VAT_CODES.map(c => ({ value: c.code, label: c.label }))
}

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
