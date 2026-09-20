/**
 * Subcontracting — vendor price basis, as tests.
 *
 * The numbers are the agreed fixtures from SUBCONTRACTING-PRICE-BASIS-BRIEF.md §5,
 * not illustrations. `app/data/subconPricing.ts` has to reproduce them exactly.
 *
 * The two load-bearing invariants:
 *   1. On a Net basis the vendor receives exactly what was agreed — `S - WHT`
 *      equals the contract value.
 *   2. Withholding never reaches product cost. It is a tax remitted on the
 *      vendor's behalf, not a cost of the goods.
 */
import { describe, it, expect } from 'vitest'
import {
  priceSubconOrder,
  subconCostPerUnit,
  withholdingRate,
  isVatCreditable,
  type SubconPricingInput,
} from '../app/data/subconPricing'

// ── Fixture: BOM "Kemeja Formal Pria" #10087, 500 pcs ────────────────────────

const OUTPUT_QTY = 500
const BOM_MATERIAL = 9_700_000
const CONTRACT = 13_100_000

const LINES = [
  { id: 'svc-sew', name: 'Jahit & assembly', contractValue: 12_500_000 },
  { id: 'svc-handling', name: 'Subcon handling & freight', contractValue: 600_000 },
]

function input(over: Partial<SubconPricingInput> = {}): SubconPricingInput {
  return {
    method: 'resupply',
    basis: 'gross',
    vendorHasNpwp: true,
    lines: LINES,
    vatRate: 0.11,
    vatCreditable: true,
    bomMaterialValue: BOM_MATERIAL,
    ...over,
  }
}

describe('the withholding rate is derived, never entered', () => {
  it('is 2% on toll manufacturing with an NPWP', () => {
    expect(withholdingRate('resupply', true)).toBe(0.02)
    expect(withholdingRate('dropship', true)).toBe(0.02)
  })

  it('is 4% on toll manufacturing without one', () => {
    expect(withholdingRate('resupply', false)).toBe(0.04)
  })

  it('is 0 on Basic — a purchase of goods, not jasa maklon', () => {
    expect(withholdingRate('basic', true)).toBe(0)
    expect(withholdingRate('basic', false)).toBe(0)
  })
})

// ── §5 — the reference table ─────────────────────────────────────────────────

describe('Gross basis — the price already contains the withholding', () => {
  const p = priceSubconOrder(input({ basis: 'gross' }))

  it('does not gross anything up', () => {
    expect(p.factor).toBe(1)
    expect(p.serviceValue).toBe(13_100_000)
    expect(p.grossUp).toBe(0)
  })

  it('reproduces the published figures', () => {
    expect(p.vat).toBe(1_441_000)
    expect(p.withholding).toBe(262_000)
    expect(p.documentTotal).toBe(14_541_000)
    expect(p.paidToVendor).toBe(14_279_000)
    expect(p.productCost).toBe(22_800_000)
    expect(subconCostPerUnit(p, OUTPUT_QTY)).toBe(45_600)
  })

  it('still withholds — the basis changes who bears it, not whether it exists', () => {
    expect(p.tollManufacturing).toBe(true)
    expect(p.withholding).toBeGreaterThan(0)
  })
})

describe('Net basis — the vendor receives the agreed price in full', () => {
  const p = priceSubconOrder(input({ basis: 'net' }))

  it('grosses up by 1/(1-t)', () => {
    expect(p.factor).toBeCloseTo(1.020408163, 9)
    expect(p.serviceValue).toBe(13_367_347)
    expect(p.grossUp).toBe(267_347)
  })

  it('reproduces the published figures', () => {
    expect(p.vat).toBe(1_470_408)
    expect(p.withholding).toBe(267_347)
    expect(p.documentTotal).toBe(14_837_755)
    expect(p.paidToVendor).toBe(14_570_408)
    expect(p.productCost).toBe(23_067_347)
    expect(subconCostPerUnit(p, OUTPUT_QTY)).toBeCloseTo(46_134.69, 2)
  })

  it('spreads the gross-up per line, so the cost drivers stay intact', () => {
    // Each line keeps its own share rather than the whole gross-up landing on one.
    expect(p.lines[0]!.grossedValue).toBeCloseTo(12_755_102.04, 2)
    expect(p.lines[1]!.grossedValue).toBeCloseTo(612_244.90, 2)
    expect(p.lines.every(l => l.grossUp > 0)).toBe(true)
  })
})

// ── The invariants ───────────────────────────────────────────────────────────

describe('invariant 1 — on Net, the vendor receives exactly what was agreed', () => {
  it('holds at 2%', () => {
    const p = priceSubconOrder(input({ basis: 'net', vendorHasNpwp: true }))
    expect(p.serviceValue - p.withholding).toBe(CONTRACT)
  })

  it('holds at 4%', () => {
    const p = priceSubconOrder(input({ basis: 'net', vendorHasNpwp: false }))
    expect(p.serviceValue - p.withholding).toBe(CONTRACT)
  })
})

describe('invariant 2 — withholding never reaches product cost', () => {
  it.each([
    ['Gross', 'gross'] as const,
    ['Net', 'net'] as const,
  ])('%s basis — product cost is materials + service, and nothing else', (_name, basis) => {
    const p = priceSubconOrder(input({ basis }))
    expect(p.productCost).toBe(BOM_MATERIAL + p.serviceValue)
  })

  it('a different withholding rate does not move product cost on a Gross basis', () => {
    // The behavioural proof: on Gross the price is fixed, so switching the vendor
    // from 2% to 4% changes what we REMIT and nothing about what the goods cost.
    // If withholding had leaked into product cost, this would differ.
    const withNpwp = priceSubconOrder(input({ basis: 'gross', vendorHasNpwp: true }))
    const without = priceSubconOrder(input({ basis: 'gross', vendorHasNpwp: false }))

    expect(without.withholding).not.toBe(withNpwp.withholding)
    expect(without.productCost).toBe(withNpwp.productCost)
  })
})

// ── §5 — the degenerate cases, which must need no special-casing ─────────────

describe('degenerate — Basic', () => {
  it('has no withholding and no gross-up, whatever the basis', () => {
    for (const basis of ['gross', 'net'] as const) {
      const p = priceSubconOrder(input({ method: 'basic', basis }))
      expect(p.withholdingRate).toBe(0)
      expect(p.factor).toBe(1)
      expect(p.grossUp).toBe(0)
      expect(p.withholding).toBe(0)
      expect(p.tollManufacturing).toBe(false)
    }
  })

  it('bills the vendor’s own materials alongside the service', () => {
    // Basic folds the material value into the vendor's charge — it is the
    // vendor's stock, so VAT is taken on service + material together.
    const p = priceSubconOrder(input({
      method: 'basic', basis: 'gross',
      vendorMaterialValue: BOM_MATERIAL, bomMaterialValue: 0,
    }))
    expect(p.vat).toBe(Math.round((CONTRACT + BOM_MATERIAL) * 0.11))
    expect(p.productCost).toBe(CONTRACT + BOM_MATERIAL)
  })
})

describe('degenerate — vendor without an NPWP, Net basis', () => {
  const p = priceSubconOrder(input({ basis: 'net', vendorHasNpwp: false }))

  it('grosses up at 4%', () => {
    expect(p.withholdingRate).toBe(0.04)
    expect(p.factor).toBeCloseTo(1.0416666, 6)
    expect(p.serviceValue).toBe(13_645_833)
    expect(p.withholding).toBe(545_833)
  })

  it('still pays the vendor the contract value', () => {
    expect(p.serviceValue - p.withholding).toBe(CONTRACT)
  })
})

describe('degenerate — non-creditable VAT, Gross basis', () => {
  it('capitalises the VAT into product cost', () => {
    const p = priceSubconOrder(input({ basis: 'gross', vatCreditable: false }))
    expect(p.productCost).toBe(24_241_000)
    // …which is materials + service + the VAT that cannot be reclaimed.
    expect(p.productCost).toBe(BOM_MATERIAL + CONTRACT + p.vat)
  })

  it('leaves creditable VAT out of it', () => {
    const p = priceSubconOrder(input({ basis: 'gross', vatCreditable: true }))
    expect(p.productCost).toBe(BOM_MATERIAL + CONTRACT)
  })
})

// ── Tax code creditability ───────────────────────────────────────────────────

describe('VAT creditability is read from the tax code', () => {
  it('treats PPN as creditable and Non-PPN as not', () => {
    expect(isVatCreditable('PPN 11%')).toBe(true)
    expect(isVatCreditable('Non-PPN')).toBe(false)
  })
})
