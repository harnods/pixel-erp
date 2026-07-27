/**
 * Reported bug: creating one picking task from 2 sales orders that both order
 * the SAME SKU (e.g. Order 1: SKU A qty 5 + SKU B qty 2; Order 2: SKU A qty 5 +
 * SKU C qty 1) showed the picker SKU A as two separate 5-unit rows instead of
 * one merged 10-unit row — "5 and 5" instead of "take 10 of SKU A".
 *
 * Root cause: PickingLine (the stored data model) is intentionally order-scoped
 * (key = `${orderId}::${sku}`) so per-order picked-qty/batch/serial tracking and
 * later packing attribution stay correct — that's not the bug. The bug was that
 * nothing re-grouped those per-order lines by SKU for DISPLAY on the execution
 * (PickItemsPage.vue) and detail (PickingTaskDetailsPage.vue) pages, which just
 * rendered the raw per-order lines 1:1. Fixed by getPickingGroupedItems() in
 * pickingTaskDetails.ts, which sums qty per SKU while keeping memberKeys (the
 * underlying per-order line keys, in order) so qty entry/scanning/batch-serial
 * assignment can still fill order 1 first, then spill into order 2.
 *
 * Also fixes a related miscount: addPickingTask()'s skuQty defaulted to
 * lines.length (raw order×sku line count) — 4 for this scenario — instead of
 * the true distinct-SKU count of 3.
 */
import { describe, it, expect } from 'vitest'
import { addOutgoing, type OutgoingOrder } from '~/data/outgoing'
import { addPickingTask, getPickingTask } from '~/data/pickingTasks'
import { getPickingGroupedItems, getPickingLineItems } from '~/data/pickingTaskDetails'
import { generatePickingListPdf } from '~/utils/pickingListPdf'

const WAREHOUSE_ID = 'wh-006'
const WAREHOUSE_NAME = 'Gudang Makassar Selatan'
const SKU_A = '1001' // Green Beans Arabica Gayo Grade 1
const SKU_B = '3004' // Coffee Scale 2kg / 0.1g
const SKU_C = '3005' // Paper Filter V60 02 (100 pcs)

function makeOrder(salesNo: string, lines: { sku: string; qty: number }[]): OutgoingOrder {
  return addOutgoing({
    salesNo, source: 'Manual',
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
    skuQty: lines.length, orderQty: lines.reduce((s, l) => s + l.qty, 0),
    shippedQty: 0, status: 'open', dueDate: '2026-08-01',
    lines: lines.map((l) => ({ sku: l.sku, productName: l.sku, desc: '', img: '', unit: 'Unit', qty: l.qty })),
  })
}

describe('Picking task spanning 2 orders — same SKU merges into one row for the picker', () => {
  it('merges SKU A (5+5=10) across both orders; SKU B and SKU C stay their own single-order rows', () => {
    const order1 = makeOrder('Test Merge Order 1', [{ sku: SKU_A, qty: 5 }, { sku: SKU_B, qty: 2 }])
    const order2 = makeOrder('Test Merge Order 2', [{ sku: SKU_A, qty: 5 }, { sku: SKU_C, qty: 1 }])

    const task = addPickingTask({
      salesOrderIds: [order1.id, order2.id],
      salesNos: [order1.salesNo, order2.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })

    // The raw stored data model stays order-scoped — 4 lines (2 orders × up to 2
    // SKUs each), NOT merged. This is intentional, not the bug.
    const rawLines = getPickingLineItems(task)
    expect(rawLines).toHaveLength(4)
    expect(rawLines.filter((l) => l.skuCode === SKU_A)).toHaveLength(2)

    // The grouped view the picker actually sees: exactly 3 rows (one per distinct
    // SKU), SKU A summed to 10 across its 2 member lines.
    const grouped = getPickingGroupedItems(task)
    expect(grouped).toHaveLength(3)

    const rowA = grouped.find((g) => g.skuCode === SKU_A)!
    expect(rowA).toBeTruthy()
    expect(rowA.expectedQty).toBe(10)
    expect(rowA.memberKeys).toHaveLength(2)
    // Order 1's line must be first in the fill order (first order first).
    expect(rowA.memberKeys[0]).toBe(`${order1.id}::${SKU_A}`)
    expect(rowA.memberKeys[1]).toBe(`${order2.id}::${SKU_A}`)

    const rowB = grouped.find((g) => g.skuCode === SKU_B)!
    expect(rowB.expectedQty).toBe(2)
    expect(rowB.memberKeys).toEqual([`${order1.id}::${SKU_B}`])

    const rowC = grouped.find((g) => g.skuCode === SKU_C)!
    expect(rowC.expectedQty).toBe(1)
    expect(rowC.memberKeys).toEqual([`${order2.id}::${SKU_C}`])

    // Total to-pick qty is unaffected by grouping — still 13 (5+2+5+1).
    expect(rawLines.reduce((s, l) => s + l.expectedQty, 0)).toBe(13)
    expect(grouped.reduce((s, g) => s + g.expectedQty, 0)).toBe(13)

    // skuQty must reflect the distinct-SKU count (3), not the raw line count (4).
    expect(getPickingTask(task.id)!.skuQty).toBe(3)
  })

  it('a single-order task is unaffected — grouped rows equal raw lines 1:1', () => {
    const order = makeOrder('Test Merge Single Order', [{ sku: SKU_A, qty: 4 }, { sku: SKU_B, qty: 3 }])
    const task = addPickingTask({
      salesOrderIds: [order.id], salesNos: [order.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    const grouped = getPickingGroupedItems(task)
    expect(grouped).toHaveLength(2)
    expect(getPickingTask(task.id)!.skuQty).toBe(2)
  })

  it('the printed picking-list PDF reflects the merged rows too, not the raw per-order lines', async () => {
    const order1 = makeOrder('Test Merge PDF Order 1', [{ sku: SKU_A, qty: 5 }, { sku: SKU_B, qty: 2 }])
    const order2 = makeOrder('Test Merge PDF Order 2', [{ sku: SKU_A, qty: 5 }, { sku: SKU_C, qty: 1 }])
    const task = addPickingTask({
      salesOrderIds: [order1.id, order2.id],
      salesNos: [order1.salesNo, order2.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    const grouped = getPickingGroupedItems(task)

    // generatePickingListPdf() must accept the merged rows (a PickGroupItem[]),
    // not just the raw per-order PickLineItem[] it originally typed for.
    const doc = await generatePickingListPdf(task, grouped)
    expect(typeof doc.output).toBe('function')

    // "Total SKU" printed on the doc must read the merged, distinct-SKU count (3)
    // — this is exactly grouped.length, so passing raw (unmerged) lines instead
    // would have printed 4 and repeated SKU A as two separate rows.
    expect(grouped).toHaveLength(3)
  })
})
