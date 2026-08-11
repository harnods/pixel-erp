/**
 * Coherence checks for the Sales Invoice detail (Sales ▸ Sales invoices ▸ :id).
 *
 * Unlike sales orders, sales invoices are authored with a hand-written `total`
 * and no line items — salesInvoiceDetails.ts derives the items *from* that
 * total. This spec pins the invariant that makes the derivation safe: what the
 * index row shows and what the detail page's totals block adds up to are the
 * same number, for every seeded invoice.
 *
 * Uses the failure-collection pattern (collect issues, assert length 0) so a
 * single run surfaces every mismatch at once.
 */
import { describe, it, expect } from 'vitest'
import { salesInvoices } from '~/data/salesInvoices'
import { getSalesInvoiceDetail, MIN_CATALOG_PRICE } from '~/data/salesInvoiceDetails'
import { CATALOG } from '~/data/catalog'

/** SKU → real catalogue price. Derived line items must never invent a price. */
const catalogPrice = new Map(CATALOG.map(p => [p.sku, p.price]))

describe('Sales invoice detail ↔ index row coherence', () => {
  it('the detail totals reproduce the invoice total exactly', () => {
    const failures: string[] = []
    for (const inv of salesInvoices) {
      const detail = getSalesInvoiceDetail(inv.id)
      if (detail.totals.total !== inv.total) {
        failures.push(`${inv.number}: detail total ${detail.totals.total} ≠ index total ${inv.total}`)
      }
    }
    if (failures.length) console.error('\nTOTAL MISMATCHES:\n' + failures.map(f => '  • ' + f).join('\n'))
    expect(failures).toHaveLength(0)
  })

  it('every line reconciles: qty × unit price, less line discount, equals the amount', () => {
    const failures: string[] = []
    for (const inv of salesInvoices) {
      const detail = getSalesInvoiceDetail(inv.id)
      detail.lineItems.forEach((it, i) => {
        const expected = Math.round(it.qty * it.unitPrice * (1 - it.discountPct / 100))
        if (it.amount !== expected) {
          failures.push(`${inv.number} line ${i + 1} (${it.sku}): amount ${it.amount} ≠ ${expected}`)
        }
        if (it.qty < 1 || it.unitPrice < 1) {
          failures.push(`${inv.number} line ${i + 1} (${it.sku}): non-positive qty/unit price`)
        }
      })
    }
    if (failures.length) console.error('\nLINE MISMATCHES:\n' + failures.map(f => '  • ' + f).join('\n'))
    expect(failures).toHaveLength(0)
  })

  it('every line is priced at its real CATALOG price — no synthesised prices', () => {
    const failures: string[] = []
    for (const inv of salesInvoices) {
      const detail = getSalesInvoiceDetail(inv.id)
      for (const it of detail.lineItems) {
        const real = catalogPrice.get(it.sku)
        if (real === undefined) {
          failures.push(`${inv.number}: SKU ${it.sku} is not in CATALOG`)
        } else if (it.unitPrice !== real) {
          failures.push(`${inv.number}: ${it.sku} priced ${it.unitPrice}, CATALOG says ${real}`)
        }
      }
    }
    if (failures.length) console.error('\nPRICE MISMATCHES:\n' + failures.map(f => '  • ' + f).join('\n'))
    expect(failures).toHaveLength(0)
  })

  /**
   * The balancing discount is bounded by construction: the closing line is a
   * whole number of units of some catalogue SKU, so the leftover it introduces
   * is always less than the cheapest unit price in the catalogue.
   */
  it('the balancing global discount stays under one cheapest-unit, never a headline deduction', () => {
    const failures: string[] = []
    for (const inv of salesInvoices) {
      const { globalDiscount } = getSalesInvoiceDetail(inv.id).totals
      if (globalDiscount < 0) {
        failures.push(`${inv.number}: negative global discount ${globalDiscount}`)
      } else if (globalDiscount >= MIN_CATALOG_PRICE) {
        failures.push(`${inv.number}: global discount ${globalDiscount} ≥ cheapest unit ${MIN_CATALOG_PRICE}`)
      }
    }
    if (failures.length) console.error('\nDISCOUNT OUTLIERS:\n' + failures.map(f => '  • ' + f).join('\n'))
    expect(failures).toHaveLength(0)
  })

  it('amount paid + balance due equals the total', () => {
    const failures: string[] = []
    for (const inv of salesInvoices) {
      const detail = getSalesInvoiceDetail(inv.id)
      if (detail.amountPaid + detail.balance !== detail.totals.total) {
        failures.push(`${inv.number}: paid ${detail.amountPaid} + balance ${detail.balance} ≠ ${detail.totals.total}`)
      }
    }
    if (failures.length) console.error('\nSETTLEMENT MISMATCHES:\n' + failures.map(f => '  • ' + f).join('\n'))
    expect(failures).toHaveLength(0)
  })

  it('an unknown id falls back to the first invoice rather than throwing', () => {
    expect(getSalesInvoiceDetail('nope').id).toBe(salesInvoices[0]!.id)
  })

  it('a no-PPN invoice carries zero tax but still totals correctly', () => {
    const failures: string[] = []
    for (const inv of salesInvoices.filter(i => !i.hasPpn)) {
      const detail = getSalesInvoiceDetail(inv.id)
      if (detail.totals.taxAmount !== 0) {
        failures.push(`${inv.number}: expected taxAmount 0, got ${detail.totals.taxAmount}`)
      }
      if (detail.totals.total !== inv.total) {
        failures.push(`${inv.number}: total ${detail.totals.total} ≠ index total ${inv.total}`)
      }
      if (detail.lineItems.some(it => it.taxLabel !== 'No PPN')) {
        failures.push(`${inv.number}: a line item still carries a PPN tax label`)
      }
    }
    expect(salesInvoices.some(i => !i.hasPpn)).toBe(true)   // fixture sanity: the case actually exists
    if (failures.length) console.error('\nNO-PPN MISMATCHES:\n' + failures.map(f => '  • ' + f).join('\n'))
    expect(failures).toHaveLength(0)
  })

  it('a PPN invoice still uses the standard label and a positive tax amount', () => {
    const failures: string[] = []
    for (const inv of salesInvoices.filter(i => i.hasPpn)) {
      const detail = getSalesInvoiceDetail(inv.id)
      if (detail.totals.taxAmount <= 0) {
        failures.push(`${inv.number}: expected a positive taxAmount, got ${detail.totals.taxAmount}`)
      }
      if (detail.totals.taxLabel !== 'PPN 11%') {
        failures.push(`${inv.number}: unexpected taxLabel "${detail.totals.taxLabel}"`)
      }
    }
    if (failures.length) console.error('\nPPN MISMATCHES:\n' + failures.map(f => '  • ' + f).join('\n'))
    expect(failures).toHaveLength(0)
  })
})
