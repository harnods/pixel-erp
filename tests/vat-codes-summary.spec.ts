/**
 * Coherence checks for the "Create tax document" drawer's VAT-code logic
 * (Sales ▸ Sales invoices ▸ :id ▸ Actions ▸ Create tax document, Domestic lane).
 *
 * The rules here were ported from a reference implementation the user supplied
 * (a standalone page demonstrating "if I select X VAT code, then summary will
 * be ..."), not derived independently — this spec pins that behavior so it
 * doesn't drift as the drawer evolves.
 */
import { describe, it, expect } from 'vitest'
import { VAT_CODES, computeTaxDocumentSummary, REDUCED_PPN_RATE, DPP_LAIN_FACTOR } from '~/data/vatCodes'

const DPP = 1_120_000
const STANDARD_PPN = 112_200   // as computed by the invoice's own 11% totals
const TOTAL = DPP + STANDARD_PPN

function codeFor(code: string) {
  const c = VAT_CODES.find(v => v.code === code)
  if (!c) throw new Error(`missing VAT code ${code}`)
  return c
}

describe('VAT code catalogue', () => {
  it('has exactly the 10 documented codes, 01 through 10', () => {
    expect(VAT_CODES.map(c => c.code)).toEqual(
      ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'],
    )
  })

  it('only code 04 carries the DPP lain flag', () => {
    const withDppLain = VAT_CODES.filter(c => c.hasDppLain).map(c => c.code)
    expect(withDppLain).toEqual(['04'])
  })

  it('only code 05 uses the reduced rate; only 07/08 collect no PPN', () => {
    expect(VAT_CODES.filter(c => c.ppnRate === 'reduced').map(c => c.code)).toEqual(['05'])
    expect(VAT_CODES.filter(c => c.ppnRate === 'none').map(c => c.code)).toEqual(['07', '08'])
  })
})

describe('computeTaxDocumentSummary', () => {
  it('standard-rate codes reuse the invoice total, DPP, and PPN as-is', () => {
    for (const code of ['01', '02', '03', '06', '09', '10']) {
      const s = computeTaxDocumentSummary(codeFor(code), TOTAL, DPP, STANDARD_PPN)
      expect(s.salesInvoiceTotal).toBe(TOTAL)
      expect(s.dpp).toBe(DPP)
      expect(s.ppn).toBe(STANDARD_PPN)
      expect(s.dppLain).toBeNull()
      expect(s.ppnbm).toBe(0)
    }
  })

  it('code 04 adds a DPP lain row on top of the standard PPN', () => {
    const s = computeTaxDocumentSummary(codeFor('04'), TOTAL, DPP, STANDARD_PPN)
    expect(s.ppn).toBe(STANDARD_PPN)
    expect(s.dppLain).toBe(Math.round(DPP * DPP_LAIN_FACTOR))
  })

  it('code 05 uses the reduced rate instead of the standard PPN', () => {
    const s = computeTaxDocumentSummary(codeFor('05'), TOTAL, DPP, STANDARD_PPN)
    expect(s.ppn).toBe(Math.round(DPP * REDUCED_PPN_RATE))
    expect(s.ppn).not.toBe(STANDARD_PPN)
    expect(s.dppLain).toBeNull()
  })

  it('codes 07 and 08 zero out PPN entirely', () => {
    for (const code of ['07', '08']) {
      const s = computeTaxDocumentSummary(codeFor(code), TOTAL, DPP, STANDARD_PPN)
      expect(s.ppn).toBe(0)
    }
  })

  it('PPnBM is always zero — no luxury-goods items modeled', () => {
    for (const code of VAT_CODES) {
      expect(computeTaxDocumentSummary(code, TOTAL, DPP, STANDARD_PPN).ppnbm).toBe(0)
    }
  })
})
