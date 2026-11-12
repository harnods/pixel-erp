/**
 * Partial & progress invoicing of deliveries — the billing engine.
 *
 * The numbers are case C5 of partial-invoicing-simulation-v2.xlsx (PRD PD
 * 51301744716): order goods 9.123.750 after line discounts, transaction discount
 * 300.000, shipping 150.000, delivered in SD105 (4/12/2/30) and SD106 (6/8/3/20).
 * Termin 1 (30%) is the seeded Sales Invoice #40202; termin 2 (40%) splits oldest
 * delivery first; termin 3 (30%) closes the order exactly.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { salesInvoices } from '~/data/salesInvoices'
import { salesDeliveries } from '~/data/salesDeliveries'
import { getSalesInvoiceDetail } from '~/data/salesInvoiceDetails'
import {
  planBilling, commitBilling, resetDeliveryBilling, deliveryDiscounts, deliveryShipping,
  deliveryBillingStatus, isBillable, billableDeliveries, fullyBilledDeliveries, manualFromPlan,
  remainingInputs, type BillingInput,
} from '~/data/deliveryBilling'

const ALL = (pct: number): Record<number, number> => ({ 0: pct, 1: pct, 2: pct, 3: pct })
const base = (over: Partial<BillingInput> = {}): BillingInput => ({
  orderId: 'SO104', deliveryIds: ['SD105', 'SD106'], basis: 'percent', lineInputs: ALL(40), split: 'auto', ...over,
})
const cell = (plan: ReturnType<typeof planBilling>, d: string, i: number) =>
  plan.deliveries.find(x => x.deliveryId === d)!.cells.find(c => c.orderLineIndex === i)!.billNow

afterEach(() => resetDeliveryBilling())

describe('delivery header amounts (Rule 10)', () => {
  it('spreads the transaction discount by goods value; the completing delivery takes the rest', () => {
    const D = deliveryDiscounts('SO104')
    expect(D.SD105).toBeCloseTo(300_000 * 4_068_250 / 9_123_750, 6)   // 133.769,01
    expect(D.SD105! + D.SD106!).toBeCloseTo(300_000, 6)
  })
  it('puts the order shipping on the first delivery', () => {
    expect(deliveryShipping('SO104')).toEqual({ SD105: 150_000, SD106: 0 })
  })
})

describe('termin 1 — the seeded Sales Invoice #40202 (30% of every line)', () => {
  it('is exactly what the engine produces for 30% from SD105', () => {
    const p = planBilling(base({ deliveryIds: ['SD105'], lineInputs: ALL(30), excludeInvoiceId: 'SI201' }))
    expect(p.errors).toEqual([])
    expect(p.lines.map(l => l.qty)).toEqual([3, 6, 1.5, 15])
    expect(p.goods).toBe(2_737_125)
    expect(p.globalDiscount).toBe(90_000)
    expect(p.taxBase).toBe(2_647_125)          // the DPP quoted in the PRD thread
    expect(p.shipping).toBe(150_000)
    const seed = salesInvoices.find(s => s.id === 'SI201')!
    expect(seed.total).toBe(p.total)
    expect(seed.globalDiscount).toBe(p.globalDiscount)
    expect(seed.shippingFee).toBe(p.shipping)
    expect(seed.items!.map(it => it.amount)).toEqual(p.lines.map(l => l.amount))
  })
  it('renders on the invoice detail with the same totals', () => {
    const d = getSalesInvoiceDetail('SI201')
    expect(d.totals.total).toBe(3_088_309)
    expect(d.linkedTransactions.filter(l => l.type === 'Sales Delivery').map(l => l.number)).toEqual(['#20105'])
  })
})

describe('termin 2 — 40% splits oldest delivery first (Rule 5)', () => {
  it('takes what SD105 has left, then SD106', () => {
    const p = planBilling(base())
    expect(p.errors).toEqual([])
    expect([0, 1, 2, 3].map(i => cell(p, 'SD105', i))).toEqual([1, 6, 0.5, 15])
    expect([0, 1, 2, 3].map(i => cell(p, 'SD106', i))).toEqual([3, 2, 1.5, 5])
    expect(p.goods).toBe(3_649_500)            // 40% of 9.123.750
    expect(p.globalDiscount).toBe(120_000)     // 40% of the transaction discount
    expect(p.shipping).toBe(0)                 // SD105 shipping went on termin 1
    expect(p.deliveries.find(d => d.deliveryId === 'SD105')!.clears).toBe(true)
  })
  it('orders by creation time, not by the order the user ticked them', () => {
    const p = planBilling(base({ deliveryIds: ['SD106', 'SD105'] }))
    expect(cell(p, 'SD105', 0)).toBe(1)
    expect(cell(p, 'SD106', 0)).toBe(3)
  })
})

describe('termin 3 — the last 30% closes the order exactly', () => {
  it('sums every termin back to the order (goods, discount, shipping)', () => {
    const p2 = planBilling(base())
    commitBilling(p2, { id: 'SI-T2', number: 49002 })
    // SD105 is fully billed now, so the form no longer offers it.
    const p3 = planBilling(base({ deliveryIds: ['SD106'], lineInputs: ALL(30) }))
    expect(p3.errors).toEqual([])
    expect(p3.deliveries.every(d => d.clears)).toBe(true)
    expect(2_737_125 + p2.goods + p3.goods).toBe(9_123_750)
    expect(90_000 + p2.globalDiscount + p3.globalDiscount).toBe(300_000)
    expect(150_000 + p2.shipping + p3.shipping).toBe(150_000)
    expect(p3.deliveries.every(d => Math.abs(d.leftAfter) < 0.01)).toBe(true)
  })
})

describe('caps (Rules 3 and 4)', () => {
  it('rejects a line billed beyond the selected deliveries, naming the line and its maximum', () => {
    const p = planBilling(base({ deliveryIds: ['SD105'] }))
    // SD105 delivered 4 grinders, 3 are billed: 1 unit = 10% of the 10 ordered.
    expect(p.errors).toContain('Grinder Kopi Komersial: max 10% / 1 unit')
    expect(p.lines.find(l => l.orderLineIndex === 0)!.overCap).toBe(true)
    // B: 12 delivered, 6 billed → 6 kg = 30% left, so 40% is over too.
    expect(p.errors).toContain('Biji Kopi Arabika Gayo: max 30% / 6 kg')
  })
  it('caps by quantity too', () => {
    const p = planBilling(base({ basis: 'qty', lineInputs: { 0: 8, 1: 0, 2: 0, 3: 0 } }))
    expect(p.errors).toEqual(['Grinder Kopi Komersial: max 7 unit'])
  })
  it('splits a quantity oldest-first as well', () => {
    const p = planBilling(base({ basis: 'qty', lineInputs: { 0: 5, 1: 0, 2: 0, 3: 0 } }))
    expect(cell(p, 'SD105', 0)).toBe(1)
    expect(cell(p, 'SD106', 0)).toBe(4)
  })
})

describe('set per delivery (F-07 manual split)', () => {
  it('starts from the automatic split and lets the user move quantity between deliveries', () => {
    const auto = planBilling(base({ basis: 'qty', lineInputs: { 0: 3, 1: 0, 2: 0, 3: 0 } }))
    const manual = manualFromPlan(auto)
    manual.SD105![0] = 0
    manual.SD106![0] = 3
    const p = planBilling(base({ basis: 'qty', lineInputs: { 0: 3, 1: 0, 2: 0, 3: 0 }, split: 'manual', manual }))
    expect(p.errors).toEqual([])
    expect(p.lines.find(l => l.orderLineIndex === 0)!.qty).toBe(3)
    expect(cell(p, 'SD106', 0)).toBe(3)
    // Nothing from SD105 now, so its line keeps its own discount share for later.
    expect(p.deliveries.find(d => d.deliveryId === 'SD105')!.discountNow).toBe(0)
  })
  it('rejects a delivery cell above what that delivery has left', () => {
    const p = planBilling(base({ basis: 'qty', lineInputs: {}, split: 'manual', manual: { SD105: { 0: 2 } } }))
    expect(p.errors).toEqual(['Grinder Kopi Komersial: max 1 unit on Sales Delivery #20105'])
  })
})

describe('the percentage that lands on 100% takes the exact remainder', () => {
  it('bills Bill remaining as the exact quantity left', () => {
    const p = planBilling(base({ lineInputs: {} }))
    const rem = remainingInputs(p)
    expect(rem[0]).toBeCloseTo(70, 6)
    const full = planBilling(base({ lineInputs: rem }))
    expect(full.lines.map(l => l.qty)).toEqual([7, 14, 3.5, 35])
  })
})

describe('billing status and what can be billed (F-07, F-09)', () => {
  it('derives each delivery status from its billing records', () => {
    expect(deliveryBillingStatus('SD105')).toBe('partially invoiced')
    expect(deliveryBillingStatus('SD106')).toBe('unbilled')
    commitBilling(planBilling(base()), { id: 'SI-T2', number: 49002 })
    expect(deliveryBillingStatus('SD105')).toBe('invoiced')
    expect(deliveryBillingStatus('SD106')).toBe('partially invoiced')
    expect(salesDeliveries.find(d => d.id === 'SD105')!.billingStatus).toBe('invoiced')
    expect(isBillable('SD105')).toBe(false)
    expect(fullyBilledDeliveries('SO104').map(d => d.id)).toEqual(['SD105'])
  })
  it('treats a delivery invoiced by the old one-shot flow as billed in full', () => {
    expect(isBillable('SD101')).toBe(false)   // invoiced before billing records existed
    expect(isBillable('SD102')).toBe(true)
  })
  it('offers only deliveries with something left, grouped by sales order', () => {
    const groups = billableDeliveries('C008')
    expect(groups.map(g => g.orderId)).toEqual(['SO104'])
    expect(groups[0]!.deliveries.map(d => d.id)).toEqual(['SD105', 'SD106'])
  })
})
