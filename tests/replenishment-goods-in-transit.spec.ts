/**
 * Goods-in-Transit invoices (Vendor Supply Profile RS-020 / Rule 32).
 *
 * A supplier invoice billed before receipt is a money event, not a stock event:
 *  • the qty stays in transit (In-Transit drops only on received qty);
 *  • the invoice never counts as a receipt for lead time (PO → first receipt).
 * The engine guarantees both by construction; the invoice only tags the document so
 * the worklist and drawer can say "invoiced, not received".
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { onOrderFor, invalidateReplenishmentCaches } from '~/data/replenishment'
import { goodsInTransitInvoices, goodsInTransitInvoiceFor } from '~/data/goodsInTransitInvoices'

describe('Goods-in-Transit invoice (RS-020)', () => {
  it('tags the billed, unreceived document and keeps its full outstanding qty in transit', () => {
    invalidateReplenishmentCaches()
    const inv = goodsInTransitInvoices[0]!
    const docs = onOrderFor('1102', 'wh-002')
    const billed = docs.filter((d) => d.purchaseNo === inv.purchaseNo)
    expect(billed.length).toBeGreaterThan(0)
    for (const d of billed) {
      expect(d.invoicedBeforeReceipt).toBe(inv.number)
      expect(d.outstanding).toBeGreaterThan(0)
    }
    // Documents from other purchases are untouched.
    for (const d of docs.filter((x) => x.purchaseNo !== inv.purchaseNo)) {
      expect(d.invoicedBeforeReceipt).toBeUndefined()
    }
  })

  it('looks invoices up by purchase number only', () => {
    expect(goodsInTransitInvoiceFor('Purchase Order #10091')?.number).toBe('PINV-2026-GIT-001')
    expect(goodsInTransitInvoiceFor('Purchase Order #99999')).toBeUndefined()
    expect(goodsInTransitInvoiceFor(undefined)).toBeUndefined()
  })

  it('lead time never reads invoices — it is measured PO → receipt (Rule 32)', () => {
    const src = readFileSync(join(process.cwd(), 'app/data/leadTimeHistory.ts'), 'utf8')
    expect(src).not.toMatch(/purchaseInvoices|goodsInTransitInvoices/)
  })
})
