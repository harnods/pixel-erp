import { describe, it, expect } from 'vitest'
import {
  resolvePurchaseRule, vendorPkpStatus, purchasePkpConflict, isPpnTax, priceRules,
  createPriceRule, deletePriceRule, emptyPriceRuleInput,
} from '~/data/priceRules'

// Purchase Price Rule engine (one-pager PD 51412239134 §5 / AC1-AC5).
describe('purchase price rule engine', () => {
  it('vendor + product beats vendor only (AC1, AC3)', () => {
    const m = resolvePurchaseRule('V003', 'p01', 3_200_000)!
    expect(m.rule.id).toBe('PRL-102')
    expect(m.tier).toBe(1)
    expect(m.discountPct).toBe(10)
  })
  it('falls back to vendor only for a product outside the rule', () => {
    const m = resolvePurchaseRule('Gayo Highland Exporters', 'p13', 85_000_000)!
    expect(m.rule.id).toBe('PRL-101')
    expect(m.tier).toBe(2)
    expect(m.discountPct).toBe(5)
  })
  it('vendor only beats product only', () => {
    expect(resolvePurchaseRule('V003', 'p24', 85_000)!.rule.id).toBe('PRL-101')
  })
  it('product-only value rule converts Rp/unit to % for other vendors', () => {
    const m = resolvePurchaseRule('V006', 'p24', 85_000)!
    expect(m.tier).toBe(3)
    expect(m.discountPct).toBe(5.88)
  })
  it('no rule for another vendor (AC2)', () => {
    expect(resolvePurchaseRule('V005', 'p01', 3_200_000)).toBeNull()
  })
  it('PKP status per vendor (AC4, AC5)', () => {
    expect(vendorPkpStatus('V003')).toBe(true)
    expect(vendorPkpStatus('V016')).toBe(false)
    expect(vendorPkpStatus('V005')).toBeNull()
  })
  it('blocks a conflicting PKP status for the same vendor', () => {
    expect(purchasePkpConflict(['V003'], false)?.rule.vendorPkp).toBe(true)
    expect(purchasePkpConflict(['V003'], true)).toBeNull()
    expect(purchasePkpConflict(['V016'], false, 'PRL-103')).toBeNull()
  })
  it('ignores sales rules and inactive rules', () => {
    expect(resolvePurchaseRule('V001', 'p09', 280_000)).toBeNull()
    const r = createPriceRule({ ...emptyPriceRuleInput('purchase'), name: 'Off', amount: 50, productIds: ['p09'], status: 'inactive' })
    expect(resolvePurchaseRule('V001', 'p09', 280_000)).toBeNull()
    deletePriceRule(r.id)
  })
  it('normalises PKP to null on all-vendor and sales rules', () => {
    const r = createPriceRule({ ...emptyPriceRuleInput('purchase'), name: 'All', amount: 1, productIds: ['p20'], vendorPkp: false })
    expect(r.vendorPkp).toBeNull()
    deletePriceRule(r.id)
    expect(priceRules().every((x) => x.transactionType === 'purchase' || x.vendorPkp === null)).toBe(true)
  })
  it('PPN detection', () => {
    expect(isPpnTax('PPN 11%')).toBe(true)
    expect(isPpnTax('PPh 23 2%')).toBe(false)
  })
})
