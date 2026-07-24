/**
 * Reported case: an operator picks from a batch the warehouse never logged (e.g.
 * physically found/counted stock under an unrecognized batch no.) instead of the
 * batch the order actually reserved. That new batch must get registered into the
 * warehouse's real inventory (visible on Warehouse Details) — not silently vanish
 * into a reservation record that points at nothing.
 *
 * registerNewBatch() + getWarehouseDetail()'s overlay merge are tested directly
 * (data-layer only), then the full integration through endPicking() — the exact
 * path an operator's real "Finish picking" hits when the drawer's Manage batch
 * "Add new batch" flow is used.
 */
import { describe, it, expect } from 'vitest'
import { addOutgoing, type OutgoingOrder } from '~/data/outgoing'
import { addPickingTask, startPicking, endPicking, type PickingAssignments } from '~/data/pickingTasks'
import { getWarehouseDetail, registerNewBatch } from '~/data/warehouseDetails'

const WAREHOUSE_ID = 'wh-006'
const WAREHOUSE_NAME = 'Gudang Makassar Selatan'
const BATCH_SKU = '1001' // batch-tracked (Green Beans)

function batchItem() {
  return getWarehouseDetail(WAREHOUSE_ID)!.stock.find((s) => s.sku === BATCH_SKU)!
}

describe('registerNewBatch() — data-layer overlay merge', () => {
  it('adds a brand-new batch to the warehouse\'s real inventory, bumping item totals by the same amount', () => {
    const before = batchItem()
    expect(before.batches!.some((b) => b.batchNo === 'Batch #ZZZ001')).toBe(false)
    const onHandBefore = before.onHand
    const availableBefore = before.available

    registerNewBatch(WAREHOUSE_ID, BATCH_SKU, { batchNo: 'Batch #ZZZ001', expiryDate: '2027-01-01', onHand: 3 })

    const after = batchItem()
    const nb = after.batches!.find((b) => b.batchNo === 'Batch #ZZZ001')
    expect(nb).toBeTruthy()
    expect(nb!.onHand).toBe(3)
    expect(nb!.reserved).toBe(0)
    expect(nb!.available).toBe(3)
    expect(after.onHand).toBe(onHandBefore + 3)
    expect(after.available).toBe(availableBefore + 3)

    // Batch totals must still sum to item totals (data-integrity invariant).
    const batchOnHandSum = after.batches!.reduce((s, b) => s + b.onHand, 0)
    expect(batchOnHandSum).toBe(after.onHand)
  })

  it('is idempotent — registering the same batchNo twice does not duplicate it', () => {
    registerNewBatch(WAREHOUSE_ID, BATCH_SKU, { batchNo: 'Batch #ZZZ002', expiryDate: '2027-01-01', onHand: 2 })
    const onHandAfterFirst = batchItem().onHand
    registerNewBatch(WAREHOUSE_ID, BATCH_SKU, { batchNo: 'Batch #ZZZ002', expiryDate: '2027-01-01', onHand: 2 })
    const after = batchItem()
    expect(after.batches!.filter((b) => b.batchNo === 'Batch #ZZZ002')).toHaveLength(1)
    expect(after.onHand).toBe(onHandAfterFirst) // second call was a no-op
  })
})

describe('endPicking() with a never-before-seen batchNo — full integration', () => {
  it('registers the new batch AND correctly reserves it, releasing the originally auto-reserved batch', () => {
    const order = addOutgoing({
      salesNo: 'Test New Batch Order',
      source: 'Manual',
      warehouseId: WAREHOUSE_ID,
      warehouseName: WAREHOUSE_NAME,
      skuQty: 1,
      orderQty: 2,
      shippedQty: 0,
      status: 'open',
      dueDate: '2026-08-01',
      lines: [{ sku: BATCH_SKU, productName: 'Green Beans Arabica Gayo Grade 1', desc: '', img: '', unit: 'Sack', qty: 2 }],
    })
    // order reserves 2 units against whichever REAL, already-existing batch(es) it can.

    const task = addPickingTask({
      salesOrderIds: [order.id], salesNos: [order.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    startPicking(task.id)
    const lineKey = `${order.id}::${BATCH_SKU}`

    expect(batchItem().batches!.some((b) => b.batchNo === 'Batch #NEWFOUND')).toBe(false)
    // Total reserved for this SKU right before Finish picking — includes whatever
    // batch(es) this order's own reservation landed on PLUS any unrelated
    // reservations already sitting on other batches from other seed orders.
    const reservedBeforeFinish = batchItem().reserved

    // Operator picked from a batch the system never logged instead of the
    // auto-reserved one.
    const assignments: PickingAssignments = {
      batchPicks: {
        [lineKey]: [{ batchNo: 'Batch #NEWFOUND', expiryDate: '2027-06-01', desc: '', qty: 2, unit: 'Sack', location: '' }],
      },
    }
    endPicking(task.id, { [lineKey]: 2 }, assignments)

    const item = batchItem()
    const newBatch = item.batches!.find((b) => b.batchNo === 'Batch #NEWFOUND')
    expect(newBatch).toBeTruthy() // now visible in Warehouse Details
    expect(newBatch!.onHand).toBe(2)
    expect(newBatch!.reserved).toBe(2) // fully claimed by this order's re-pinned reservation
    expect(newBatch!.available).toBe(0)

    // Net item-level reserved must be UNCHANGED from right before finish — this
    // order's original 2-unit claim (on whatever batch reserveOrder picked) was
    // released, and the SAME 2 units landed on the new batch instead. If release
    // had silently failed, this would be 2 units higher (double-reserved);
    // if the new batch's reservation had failed, it'd be 2 lower.
    expect(item.reserved).toBe(reservedBeforeFinish)

    // Batch sums must still match item totals (no silent divergence introduced).
    expect(item.batches!.reduce((s, b) => s + b.onHand, 0)).toBe(item.onHand)
    expect(item.batches!.reduce((s, b) => s + b.available, 0)).toBe(item.available)
    expect(item.batches!.reduce((s, b) => s + b.reserved, 0)).toBe(item.reserved)
  })
})
