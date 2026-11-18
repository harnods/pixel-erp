/**
 * Purchase/sales returns and in-transit (corrected model).
 *
 * In-transit is added ONLY by an approved PO and by WMS Inbound, and reduced ONLY
 * when the PO is received (Purchase Delivery) or WMS Inbound completes. A purchase or
 * sales return — including one marked "replacement expected" — never touches in-transit,
 * and never touches lead time.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { onOrderFor, invalidateReplenishmentCaches } from '~/data/replenishment'
import { purchaseReturns } from '~/data/purchaseReturns'

describe('returns never affect in-transit', () => {
  it('a replacement-expected return does NOT re-open qty as in transit', () => {
    invalidateReplenishmentCaches()
    const ret = purchaseReturns.find((r) => r.replacementExpected)!
    // The return's (fully received) receipt line is NOT incoming again: returns add nothing.
    const doc = onOrderFor(ret.sku, ret.warehouseId).find((d) => d.receiptId === ret.receiptId)
    expect(doc).toBeUndefined()
  })

  it('a plain return re-opens nothing either', () => {
    invalidateReplenishmentCaches()
    const ret = purchaseReturns.find((r) => !r.replacementExpected)!
    const doc = onOrderFor(ret.sku, ret.warehouseId).find((d) => d.receiptId === ret.receiptId)
    expect(doc).toBeUndefined()
  })

  it('the in-transit engine never reads purchase returns at all', () => {
    const src = readFileSync(join(process.cwd(), 'app/data/replenishment.ts'), 'utf8')
    expect(src).not.toMatch(/purchaseReturns/)
  })

  it('lead time never reads purchase returns (the first receipt stands)', () => {
    const src = readFileSync(join(process.cwd(), 'app/data/leadTimeHistory.ts'), 'utf8')
    expect(src).not.toMatch(/purchaseReturns/)
  })
})
