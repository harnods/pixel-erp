/**
 * Sales order totals logic — salesOrders.ts is the single source of truth: each
 * order's line items drive subtotal → discount → tax (PPN 11%) → total, and the
 * status drives the balance due. The detail page (salesOrderDetails.ts) reuses the
 * same items + computeTotals so the index row and the detail view always agree.
 *
 * Rules validated:
 * 1. computeTotals math is internally consistent (recompute the breakdown by hand
 *    and compare against the returned fields).
 * 2. Each seed order's `total` equals computeTotals(items, globalDiscount, shippingFee).
 * 3. balanceDue follows the status rules (closed/voided → 0; partially processed →
 *    the ~half rounding rule; open → full total).
 * 4. salesOrderDetails reuses the same items + totals as the index.
 */

import { describe, it, expect } from 'vitest'
import { salesOrders, computeTotals } from '~/data/salesOrders'
import { getSalesOrderDetail } from '~/data/salesOrderDetails'

const TAX_RATE = 0.11

describe('computeTotals is internally consistent', () => {
  const failures: string[] = []

  for (const so of salesOrders) {
    const t = computeTotals(so.items, so.globalDiscount, so.shippingFee)

    const subtotal = so.items.reduce((s, it) => s + it.qty * it.unitPrice, 0)
    const discountPerLine = so.items.reduce((s, it) => s + (it.qty * it.unitPrice - it.amount), 0)
    const taxBase = subtotal - discountPerLine - so.globalDiscount
    const taxAmount = Math.round(taxBase * TAX_RATE)
    const total = taxBase + taxAmount + so.shippingFee

    if (t.subtotal !== subtotal) failures.push(`${so.id}: subtotal ${t.subtotal} ≠ ${subtotal}`)
    if (t.discountPerLine !== discountPerLine) failures.push(`${so.id}: discountPerLine ${t.discountPerLine} ≠ ${discountPerLine}`)
    if (t.globalDiscount !== so.globalDiscount) failures.push(`${so.id}: globalDiscount ${t.globalDiscount} ≠ ${so.globalDiscount}`)
    if (t.taxLabel !== 'PPN 11%') failures.push(`${so.id}: taxLabel "${t.taxLabel}" ≠ "PPN 11%"`)
    if (t.taxAmount !== taxAmount) failures.push(`${so.id}: taxAmount ${t.taxAmount} ≠ ${taxAmount}`)
    if (t.shippingFee !== so.shippingFee) failures.push(`${so.id}: shippingFee ${t.shippingFee} ≠ ${so.shippingFee}`)
    if (t.total !== total) failures.push(`${so.id}: total ${t.total} ≠ ${total}`)
  }

  it('breakdown recomputes to the same numbers', () => {
    if (failures.length) console.error('\nTOTALS MISMATCH:\n' + failures.map(f => '  • ' + f).join('\n'))
    expect(failures).toHaveLength(0)
  })
})

describe('Seed order total agrees with computeTotals', () => {
  const failures: string[] = []
  for (const so of salesOrders) {
    const { total } = computeTotals(so.items, so.globalDiscount, so.shippingFee)
    if (so.total !== total) failures.push(`${so.id}: stored total ${so.total} ≠ derived ${total}`)
  }
  it('index row total equals the derivation', () => {
    if (failures.length) console.error('\nINDEX TOTAL MISMATCH:\n' + failures.map(f => '  • ' + f).join('\n'))
    expect(failures).toHaveLength(0)
  })
})

describe('balanceDue follows the status rules', () => {
  const failures: string[] = []
  for (const so of salesOrders) {
    let expected: number
    if (so.status === 'closed' || so.status === 'voided') {
      expected = 0
    } else if (so.status === 'partially processed') {
      expected = Math.round(so.total / 2 / 50_000) * 50_000
    } else {
      // open
      expected = so.total
    }
    if (so.balanceDue !== expected) {
      failures.push(`${so.id} (${so.status}): balanceDue ${so.balanceDue} ≠ ${expected}`)
    }
  }

  it('closed/voided → 0, partially → ~half rounding, open → full total', () => {
    if (failures.length) console.error('\nBALANCE MISMATCH:\n' + failures.map(f => '  • ' + f).join('\n'))
    expect(failures).toHaveLength(0)
  })

  it('all four statuses are represented in the seed', () => {
    const statuses = new Set(salesOrders.map(so => so.status))
    expect([...statuses].sort()).toEqual(['closed', 'open', 'partially processed', 'voided'])
  })
})

describe('salesOrderDetails reuses the index items + totals', () => {
  const itemFailures: string[] = []
  const totalFailures: string[] = []

  for (const so of salesOrders) {
    const detail = getSalesOrderDetail(so.id)
    const derived = computeTotals(so.items, so.globalDiscount, so.shippingFee)

    // line items are the same items (plus a taxLabel field)
    if (detail.lineItems.length !== so.items.length) {
      itemFailures.push(`${so.id}: detail has ${detail.lineItems.length} lines ≠ ${so.items.length}`)
    } else {
      for (let j = 0; j < so.items.length; j++) {
        const a = so.items[j]!
        const b = detail.lineItems[j]!
        if (a.sku !== b.sku || a.qty !== b.qty || a.unitPrice !== b.unitPrice || a.amount !== b.amount) {
          itemFailures.push(`${so.id} line ${j}: detail item diverges (${b.sku}/${b.qty}/${b.amount} vs ${a.sku}/${a.qty}/${a.amount})`)
        }
      }
    }

    // totals block agrees with the shared derivation and the index total
    if (detail.totals.total !== derived.total) {
      totalFailures.push(`${so.id}: detail.totals.total ${detail.totals.total} ≠ derived ${derived.total}`)
    }
    if (detail.total !== so.total) {
      totalFailures.push(`${so.id}: detail.total ${detail.total} ≠ index ${so.total}`)
    }
  }

  it('detail line items match the index items', () => {
    if (itemFailures.length) console.error('\nDETAIL ITEM MISMATCH:\n' + itemFailures.map(f => '  • ' + f).join('\n'))
    expect(itemFailures).toHaveLength(0)
  })

  it('detail totals match the index / shared derivation', () => {
    if (totalFailures.length) console.error('\nDETAIL TOTAL MISMATCH:\n' + totalFailures.map(f => '  • ' + f).join('\n'))
    expect(totalFailures).toHaveLength(0)
  })
})
