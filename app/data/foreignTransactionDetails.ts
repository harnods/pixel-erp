/**
 * "Transaction detail" codes for the "Create tax document" drawer's Foreign
 * lane (Figma node 4223:28322, State=Foreign) — the export-classification
 * radio that replaces Domestic's "VAT Code" select. Each code reveals its own
 * nested reference field(s), per the Form Control reference page (node
 * 4252:38269): 11 asks for a PEB reference; 12/13 ask for an export notice
 * reference plus a classification code.
 *
 * Unlike vatCodes.ts, this file has no reference implementation to port —
 * there's no VAT Code equivalent for exports because exports are zero-rated:
 * PPN is always Rp0 regardless of which code is picked. That's a domain
 * assumption (Indonesian export of goods/services is VAT-exempt at a 0%
 * rate), not something confirmed by a Figma summary state or supplied data —
 * flagged for review.
 */
import type { TaxDocumentSummary } from './vatCodes'

export type ForeignFieldSet = 'peb' | 'export-notice'

export interface ForeignTransactionDetail {
  code: '11' | '12' | '13'
  label: string
  /** Which nested reference field(s) this code reveals. */
  fields: ForeignFieldSet
  /** 12/13 only — Classification code is pre-filled & locked to this text
   *  instead of being freely typed. */
  fixedClassificationCode?: string
}

export const FOREIGN_TRANSACTION_DETAILS: ForeignTransactionDetail[] = [
  { code: '11', label: '11 - Export of Tangible Goods',   fields: 'peb'            },
  {
    code: '12', label: '12 - Export of Intangible Goods', fields: 'export-notice',
    fixedClassificationCode: 'Notification of Export of Intangible Taxable Goods',
  },
  {
    code: '13', label: '13 - Export of Services',         fields: 'export-notice',
    fixedClassificationCode: 'Notification of Export of Taxable Services (JKP)s',
  },
]

/** Export transactions are zero-rated — PPN, DPP lain, and PPnBM are always
 *  Rp0 no matter which transaction-detail code is selected; only the DPP
 *  (the invoice's own tax-exclusive base) carries a real number. */
export function computeForeignTaxDocumentSummary(invoiceTotal: number, dpp: number): TaxDocumentSummary {
  return { salesInvoiceTotal: invoiceTotal, dpp, dppLain: null, ppn: 0, ppnbm: 0 }
}
