import { describe, it, expect } from 'vitest'
import {
  resolvePurchaseRule, purchaseRuleOptions, vendorPkpStatus, isPpnTax, priceRules,
  createPriceRule, deletePriceRule, emptyPriceRuleInput, PRICE_RULE_TYPES_BY_TRANSACTION,
} from '~/data/priceRules'

// Purchase Price Rule engine (one-pager PD 51412239134 v4).
const line = (vendorIdOrName: string, productId: string, baseCost: number, extra: Partial<Parameters<typeof resolvePurchaseRule>[0]> = {}) =>
  resolvePurchaseRule({ vendorIdOrName, productId, baseCost, qty: 1, docSubtotal: baseCost, ...extra })

describe('purchase price rule engine (v4)', () => {
  it('customer and vendor rules offer the same rule types', () => {
    expect(PRICE_RULE_TYPES_BY_TRANSACTION.purchase).toEqual(PRICE_RULE_TYPES_BY_TRANSACTION.sales)
  })
  it('automatic: vendor + product beats vendor only', () => {
    const m = line('V003', 'p01', 3_200_000)!
    expect(m.rule.id).toBe('PRL-102')
    expect(m.picked).toBe(false)
    expect(m.discountPct).toBe(10)
    expect(line('Gayo Highland Exporters', 'p13', 85_000_000)!.rule.id).toBe('PRL-101')
  })
  it('picked rule (outlet deal) wins on the lines it covers', () => {
    const m = line('V003', 'p01', 3_200_000, { pick: 'PRL-105' })!
    expect(m.rule.id).toBe('PRL-105')
    expect(m.picked).toBe(true)
    expect(m.discountPct).toBe(12)
  })
  it('picked rule that does not cover the product falls back to automatic', () => {
    expect(line('V003', 'p13', 85_000_000, { pick: 'PRL-105' })!.rule.id).toBe('PRL-101')
  })
  it('"none" applies no rule', () => {
    expect(line('V003', 'p01', 3_200_000, { pick: 'none' })).toBeNull()
  })
  it('header options list the vendor rules plus all-vendor rules', () => {
    const ids = purchaseRuleOptions('V003').map((r) => r.id)
    expect(ids).toEqual(expect.arrayContaining(['PRL-101', 'PRL-102', 'PRL-104', 'PRL-105']))
    expect(ids).not.toContain('PRL-103')
  })
  it('product-only value rule converts Rp/unit to %', () => {
    const m = line('V005', 'p24', 85_000)!
    expect(m.tier).toBe(3)
    expect(m.discountPct).toBe(5.88)
  })
  it('quantity tiers on a vendor rule, locked on the transaction', () => {
    expect(line('V006', 'p24', 85_000, { qty: 5 })!.discountPct).toBe(0)
    const m = line('V006', 'p24', 85_000, { qty: 60 })!
    expect(m.discountPct).toBe(8)
    expect(m.editable).toBe(false)
  })
  it('markup and last price set the unit cost', () => {
    const mk = createPriceRule({ ...emptyPriceRuleInput('purchase'), name: 'Markup', ruleType: 'markup_percent', amount: 10, contactIds: ['V007'] })
    expect(line('V007', 'p13', 85_000_000)!.unitCost).toBe(93_500_000)
    deletePriceRule(mk.id)
    const lp = createPriceRule({ ...emptyPriceRuleInput('purchase'), name: 'Fixed', ruleType: 'end_discount', amount: 80_000_000, contactIds: ['V007'], productIds: ['p13'] })
    expect(line('V007', 'p13', 85_000_000)!.unitCost).toBe(80_000_000)
    deletePriceRule(lp.id)
  })
  it('PKP comes from the vendor master', () => {
    expect(vendorPkpStatus('V003')).toBe(true)
    expect(vendorPkpStatus('Bajawa Ngada Cooperative')).toBe(false)
    expect(vendorPkpStatus('nope')).toBeNull()
  })
  it('ignores sales rules and inactive rules', () => {
    expect(line('V001', 'p09', 280_000)).toBeNull()
    const r = createPriceRule({ ...emptyPriceRuleInput('purchase'), name: 'Off', amount: 50, productIds: ['p09'], status: 'inactive' })
    expect(line('V001', 'p09', 280_000)).toBeNull()
    deletePriceRule(r.id)
    expect(priceRules().every((x) => x.allowOverride !== undefined)).toBe(true)
  })
  it('PPN detection', () => {
    expect(isPpnTax('PPN 11%')).toBe(true)
    expect(isPpnTax('PPh 23 2%')).toBe(false)
  })
})
