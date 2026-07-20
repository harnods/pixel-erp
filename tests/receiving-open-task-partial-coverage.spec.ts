// @vitest-environment happy-dom
/**
 * Reported bug: a PO with SKU A (qty 10) and SKU B (qty 5) — create a
 * receiving task for SKU A, qty 5 (partial), leaving it "open" (never
 * started/ended). Creating a SECOND receiving task for the same receipt then
 * showed only SKU B — SKU A had vanished entirely, even though only 5 of its
 * 10 units were ever claimed.
 *
 * Root cause: uncoveredLineItems()/canCreateReceivingTask() excluded a SKU
 * entirely the instant ANY open/in-progress task touched it at all
 * ("activelyCovered", a boolean), regardless of how much of the line's
 * Purchase qty that task actually targeted. Fixed via claimedQtyBySku(): a
 * SKU is only fully excluded once its cumulative claim (open/in-progress
 * tasks' own targetQty, plus ended tasks' real receivedQty) reaches its
 * Purchase qty — so a SKU only partially targeted by an open task still
 * offers its real remainder to a new one.
 */
import { describe, it, expect } from 'vitest'
import { addReceipt } from '~/data/receipts'
import {
  createReceivingTask, uncoveredLineItems, canCreateReceivingTask,
} from '~/data/receivingTasks'

function makeTwoLineReceipt() {
  // A brand-new receipt always lands its lines deterministically from a
  // fresh id — no seeded receiving-task claims to worry about (unlike the
  // app's seed receipts, which already have existing claims on nearly every
  // SKU once claimedQtyBySku accounts for open/in-progress tasks too).
  return addReceipt({
    purchaseNo: `PO-TEST-COVERAGE-${Math.random()}`,
    warehouseId: 'wh-006', warehouseName: 'Gudang Makassar Selatan',
    skuQty: 2, purchaseQty: 15, receivedQty: 0,
    status: 'on the way',
    estimatedArrival: '2026-08-01',
    trackingNos: [],
  })
}

describe('Receiving — a SKU only partially claimed by an OPEN task still offers its remainder to a new task', () => {
  it('uncoveredLineItems still lists SKU A (with its real outstanding remainder) while task 1 is open', () => {
    const receipt = makeTwoLineReceipt()
    const before = uncoveredLineItems(receipt.id)
    expect(before).toHaveLength(2) // both lines start fully uncovered
    const [lineA, lineB] = before
    const skuA = lineA!.sku
    const skuB = lineB!.sku

    // Task 1: SKU A, targeting HALF its Purchase qty — left open (never started/ended).
    const halfA = Math.floor(lineA!.purchaseQty / 2)
    const task1 = createReceivingTask({
      receiptId: receipt.id, assignee: 'Operator A', skus: [skuA],
      targetQtyBySku: { [skuA]: halfA },
    })!
    expect(task1.status).toBe('open')

    const after = uncoveredLineItems(receipt.id)
    const afterSkus = after.map((l) => l.sku)
    // The reported bug: SKU A used to vanish entirely here.
    expect(afterSkus).toContain(skuA)
    expect(afterSkus).toContain(skuB) // untouched line still fully offered too
  })

  it('a second task on SKU A defaults/caps its Expected qty to the real remainder, not the full Purchase qty again', () => {
    const receipt = makeTwoLineReceipt()
    const lines = uncoveredLineItems(receipt.id)
    const skuA = lines[0]!.sku
    const purchaseQtyA = lines[0]!.purchaseQty
    const halfA = Math.floor(purchaseQtyA / 2)

    createReceivingTask({
      receiptId: receipt.id, assignee: 'Operator A', skus: [skuA],
      targetQtyBySku: { [skuA]: halfA },
    })

    const task2 = createReceivingTask({ receiptId: receipt.id, assignee: 'Operator B', skus: [skuA] })!
    const item2 = task2.items.find((it) => it.sku === skuA)!
    expect(item2.expectedQty).toBe(purchaseQtyA) // Purchase qty — unchanged, whole-PO-scoped
    expect(item2.targetQty).toBe(purchaseQtyA - halfA) // real remainder, not the full Purchase qty again
  })

  it('canCreateReceivingTask stays true while SKU A is only partially claimed by the open task 1', () => {
    const receipt = makeTwoLineReceipt()
    const lines = uncoveredLineItems(receipt.id)
    const skuA = lines[0]!.sku
    const halfA = Math.floor(lines[0]!.purchaseQty / 2)

    createReceivingTask({
      receiptId: receipt.id, assignee: 'Operator A', skus: [skuA],
      targetQtyBySku: { [skuA]: halfA },
    })

    expect(canCreateReceivingTask(receipt.id)).toBe(true)
  })

  it('once a SKU\'s cumulative claim reaches its full Purchase qty (still via open tasks, nothing ended yet), it\'s finally excluded', () => {
    const receipt = makeTwoLineReceipt()
    const lines = uncoveredLineItems(receipt.id)
    const skuA = lines[0]!.sku
    const skuB = lines[1]!.sku
    const purchaseQtyA = lines[0]!.purchaseQty

    // Claim the FULL Purchase qty across two open tasks (never started/ended).
    const half = Math.ceil(purchaseQtyA / 2)
    createReceivingTask({ receiptId: receipt.id, assignee: 'Operator A', skus: [skuA], targetQtyBySku: { [skuA]: half } })
    createReceivingTask({ receiptId: receipt.id, assignee: 'Operator B', skus: [skuA], targetQtyBySku: { [skuA]: purchaseQtyA - half } })

    const after = uncoveredLineItems(receipt.id)
    const afterSkus = after.map((l) => l.sku)
    expect(afterSkus).not.toContain(skuA) // fully claimed now — correctly excluded
    expect(afterSkus).toContain(skuB) // the other line is still untouched
  })
})
