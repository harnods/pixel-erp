/**
 * Coherence checks for the "Create tax document" drawer's Foreign lane
 * (Sales ▸ Sales invoices ▸ :id ▸ Actions ▸ Create tax document ▸ Scenario
 * state ▸ Foreign). Unlike vatCodes.ts, there's no reference implementation
 * for this lane's Summary — it rests on a stated domain assumption (exports
 * are zero-rated, so PPN is always Rp0) rather than supplied data, so this
 * spec exists to pin that assumption explicitly rather than let it drift.
 */
import { describe, it, expect } from 'vitest'
import { FOREIGN_TRANSACTION_DETAILS, computeForeignTaxDocumentSummary } from '~/data/foreignTransactionDetails'

describe('Foreign transaction-detail catalogue', () => {
  it('has exactly the 3 documented codes, 11 through 13', () => {
    expect(FOREIGN_TRANSACTION_DETAILS.map(c => c.code)).toEqual(['11', '12', '13'])
  })

  it('only code 11 asks for a PEB reference; 12 and 13 ask for export notice + classification code', () => {
    expect(FOREIGN_TRANSACTION_DETAILS.find(c => c.code === '11')!.fields).toBe('peb')
    expect(FOREIGN_TRANSACTION_DETAILS.find(c => c.code === '12')!.fields).toBe('export-notice')
    expect(FOREIGN_TRANSACTION_DETAILS.find(c => c.code === '13')!.fields).toBe('export-notice')
  })
})

describe('computeForeignTaxDocumentSummary', () => {
  const TOTAL = 1_120_000
  const DPP = 1_007_207   // some tax-exclusive base ≠ TOTAL, to prove dpp is passed through untouched

  it('PPN, DPP lain, and PPnBM are always zero — exports are zero-rated', () => {
    const s = computeForeignTaxDocumentSummary(TOTAL, DPP)
    expect(s.ppn).toBe(0)
    expect(s.dppLain).toBeNull()
    expect(s.ppnbm).toBe(0)
  })

  it('sales invoice total and DPP pass through exactly as given', () => {
    const s = computeForeignTaxDocumentSummary(TOTAL, DPP)
    expect(s.salesInvoiceTotal).toBe(TOTAL)
    expect(s.dpp).toBe(DPP)
  })
})
