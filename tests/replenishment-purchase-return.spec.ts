/**
 * Purchase returns and in-transit (Vendor Supply Profile RS-009 / Rule 52).
 *
 *  • A plain return leaves the receipt line received — nothing re-opens.
 *  • A return marked "replacement expected" re-opens its qty as in transit.
 *  • A return never touches lead time.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { onOrderFor, invalidateReplenishmentCaches } from '~/data/replenishment'
import { purchaseReturns } from '~/data/purchaseReturns'

describe('Rule 52 — purchase returns', () => {
  it('a return with a replacement expected re-opens exactly its qty as in transit', () => {
    invalidateReplenishmentCaches()
    const ret = purchaseReturns.find((r) => r.replacementExpected)!
    const doc = onOrderFor(ret.sku, ret.warehouseId).find((d) => d.receiptId === ret.receiptId)
    expect(doc, 'the fully received line is incoming again').toBeTruthy()
    expect(doc!.replacementReturn).toEqual({ number: ret.number, qty: ret.qty })
    expect(doc!.outstanding).toBe(ret.qty)
  })

  it('a plain return re-opens nothing', () => {
    invalidateReplenishmentCaches()
    const ret = purchaseReturns.find((r) => !r.replacementExpected)!
    const doc = onOrderFor(ret.sku, ret.warehouseId).find((d) => d.receiptId === ret.receiptId)
    expect(doc).toBeUndefined()
  })

  it('lead time never reads purchase returns (the first receipt stands)', () => {
    const src = readFileSync(join(process.cwd(), 'app/data/leadTimeHistory.ts'), 'utf8')
    expect(src).not.toMatch(/purchaseReturns/)
  })
})
