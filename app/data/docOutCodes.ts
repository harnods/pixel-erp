/**
 * DK — Dokumen Lain Keluaran ("Other output document"), §4 of the eFaktur
 * keluaran spec.
 *
 * Where an FK (Faktur Keluaran) asks for ONE code, a DK cascades three levels:
 *
 *     Transaction code  →  Transaction detail  →  Transaction document
 *          4 / 5              11..13 / 01..10        auto / 3 options
 *
 * Transaction code 5 is a domestic delivery on a document treated as equivalent
 * to a faktur: its ten details are the SAME ten codes an FK uses (see
 * VAT_CODES in vatCodes.ts — "makna identik dengan kode FK"), so they're reused
 * rather than restated here.
 *
 * Transaction code 4 is an export. Its three details each force their own
 * transaction document, and 12/13 additionally force an invoice code — forced
 * meaning the user sees the value but cannot change it (R-DK-4).
 *
 * This file supersedes foreignTransactionDetails.ts, whose 11/12/13 list was
 * the export lane before the DK cascade existed.
 */

export type DocOutTransactionCode = '4' | '5'
export type DocOutExportDetail = '11' | '12' | '13'

export interface DocOutTransactionCodeDef {
  code: DocOutTransactionCode
  label: string
}

/** §4.1 / §4.2 — the top level of the cascade. */
export const DOC_OUT_TRANSACTION_CODES: DocOutTransactionCodeDef[] = [
  { code: '5', label: '5 — Domestic delivery (document equivalent to a tax invoice)' },
  { code: '4', label: '4 — Foreign delivery / export' },
]

/** §4.1 — the three documents a transaction code 5 may be raised on. The user
 *  picks one; unlike code 4 nothing is forced. */
export const DOC_OUT_DOMESTIC_DOCUMENTS: { value: string; label: string }[] = [
  { value: 'OSD.00601', label: 'Document treated as equivalent to a tax invoice' },
  { value: 'OSD.00602', label: 'Tobacco excise document' },
  { value: 'OSD.00603', label: 'Bonded zone document' },
]

export interface DocOutExportDetailDef {
  code: DocOutExportDetail
  label: string
  /** Forced transaction document — shown, never chosen (R-DK-4). */
  documentCode: string
  documentLabel: string
  /** Forced invoice code, details 12/13 only. */
  invoiceCode?: string
  /** Which item kind the document may carry; 11 carries no items at all (R-DK-7). */
  itemKind?: 'GOODS' | 'SERVICES'
  /** Reference is required for 12/13 and must be empty otherwise (R-DK-5). */
  referenceRequired: boolean
  /** Document number is required except for 12/13 (R-DK-6). */
  documentNumberRequired: boolean
}

/** §4.2 — transaction code 4's three export details. */
export const DOC_OUT_EXPORT_DETAILS: DocOutExportDetailDef[] = [
  {
    code: '11', label: '11 — Export of tangible goods',
    documentCode: 'OSD.00604', documentLabel: 'Export declaration (PEB)',
    referenceRequired: false, documentNumberRequired: true,
  },
  {
    code: '12', label: '12 — Export of intangible goods',
    documentCode: 'OSD.00605', documentLabel: 'Notification of export of services / intangible goods',
    invoiceCode: 'EBKPTB_GOODS', itemKind: 'GOODS',
    referenceRequired: true, documentNumberRequired: false,
  },
  {
    code: '13', label: '13 — Export of services',
    documentCode: 'OSD.00605', documentLabel: 'Notification of export of services / intangible goods',
    invoiceCode: 'EJKP_SERVICE', itemKind: 'SERVICES',
    referenceRequired: true, documentNumberRequired: false,
  },
]

export function findExportDetail(code: string): DocOutExportDetailDef | undefined {
  return DOC_OUT_EXPORT_DETAILS.find(d => d.code === code)
}

/**
 * R-DK-1 — a domestic DK must carry the buyer's NPWP; an export must not.
 * The prototype has no buyer-NPWP input on this form (it comes from the
 * contact), so this drives a read-only line rather than a field.
 */
export function buyerNpwpRequired(trx: DocOutTransactionCode): boolean {
  return trx === '5'
}

/** R-DK-2 — an export forces total PPN to zero rather than merely validating it. */
export function exportForcesZeroVat(trx: DocOutTransactionCode): boolean {
  return trx === '4'
}
