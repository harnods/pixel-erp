// @vitest-environment happy-dom
/**
 * Opsi 3: a batch registered into a bin the SKU didn't stock before must genuinely
 * live in that bin — item.bins gains it (with the batch's qty), the batch keeps that
 * location (no round-robin overwrite), and the batch-sum / bin-sum invariants hold.
 * Previously the registered location was discarded (round-robined onto a primary
 * bin), so item.bins never gained the bin and picking from it errored.
 */
import { describe, it, expect } from 'vitest'
import { getWarehouseDetail, registerNewBatch } from '~/data/warehouseDetails'
import { stockLocationPaths } from '~/data/storageLocations'

describe('registerNewBatch persists the batch in the bin it was added to', () => {
  it('adds the new bin to item.bins and keeps the batch there (invariants intact)', () => {
    const WH = 'wh-001'
    const SKU = '1001' // batch-tracked
    const before = getWarehouseDetail(WH)!.stock.find((s) => s.sku === SKU)!
    const newBin = stockLocationPaths(WH).find((p) => p && !before.bins.some((b) => b.location === p))!
    expect(newBin).toBeTruthy()
    const onHandBefore = before.onHand

    registerNewBatch(WH, SKU, { batchNo: 'Batch #OPSI3-PERSIST', expiryDate: '2027-01-01', onHand: 5, location: newBin })

    const after = getWarehouseDetail(WH)!.stock.find((s) => s.sku === SKU)!
    const nb = after.batches!.find((b) => b.batchNo === 'Batch #OPSI3-PERSIST')!
    expect(nb.location).toBe(newBin)                                   // stays where registered
    expect(after.bins.find((b) => b.location === newBin)?.onHand).toBe(5) // its qty lands in that bin
    expect(after.locations).toContain(newBin)
    // invariants: bin sum and batch sum both equal the item total
    expect(after.bins.reduce((s, b) => s + b.onHand, 0)).toBe(after.onHand)
    expect(after.batches!.reduce((s, b) => s + b.onHand, 0)).toBe(after.onHand)
    expect(after.onHand).toBe(onHandBefore + 5)
    const binLocs = new Set(after.bins.map((b) => b.location))
    expect(after.batches!.every((b) => binLocs.has(b.location))).toBe(true) // every batch in a real bin
  })
})
