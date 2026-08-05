/**
 * Regression guard for a reported bug: a sales order with 2 SKUs, a picking task
 * created for SKU 1 only and left "open" (never started/saved), then a SECOND
 * picking task created for the same order — SKU 1 must NOT be selectable again,
 * even though the first task hasn't picked anything yet.
 *
 * Root cause: CreatePickingPage.vue's orderLines() only excluded a SKU once it
 * had actually been PICKED (pickedQtyForOrderSku, driven by pickedByKey — which
 * stays undefined until a task is started/draft-saved/finished). It never
 * consulted pickedKeysForOrder(), the function that already correctly treats a
 * SKU on any unfinished (open/in progress) task as "covered" — that function was
 * only wired into canPickOrder() (the order-level gate), not the per-SKU line
 * builder. Fixed by having orderLines() also skip SKUs pickedKeysForOrder()
 * reports as covered.
 */
import { describe, it, expect } from 'vitest'
import { addOutgoing } from '~/data/outgoing'
import { addPickingTask, pickedKeysForOrder, pickedQtyForOrderSku, committedQtyForOrderSku, canPickOrder, type PickingLine } from '~/data/pickingTasks'

const WAREHOUSE_ID = 'wh-006'
const WAREHOUSE_NAME = 'Gudang Makassar Selatan'
const SKU_1 = '3004' // Coffee Scale 2kg / 0.1g — plain, real catalog SKU
const SKU_2 = '3001' // Milk Frothing Pitcher 600ml — plain, real catalog SKU

describe('pickedKeysForOrder — an order SKU already on an OPEN picking task must not be pickable again', () => {
  it('covers SKU 1 (on the open task) but not SKU 2 (untouched) after creating an open, single-SKU picking task', () => {
    const order = addOutgoing({
      salesNo: 'Test Double-Commit Order', source: 'Manual',
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
      skuQty: 2, orderQty: 5, shippedQty: 0, status: 'open', dueDate: '2026-08-01',
      lines: [
        { sku: SKU_1, productName: 'Coffee Scale 2kg / 0.1g', desc: '', img: '', unit: 'Unit', qty: 2 },
        { sku: SKU_2, productName: 'Milk Frothing Pitcher 600ml', desc: '', img: '', unit: 'Unit', qty: 3 },
      ],
    })

    // Before any picking task exists, neither SKU is covered.
    expect(pickedKeysForOrder(order.id).has(`${order.id}::${SKU_1}`)).toBe(false)
    expect(pickedKeysForOrder(order.id).has(`${order.id}::${SKU_2}`)).toBe(false)

    // Create a picking task for SKU 1 ONLY — mirrors CreatePickingPage.vue passing
    // a `lines` array containing only the operator-selected rows. Left untouched
    // (no startPicking/savePickingDraft/endPicking) → status stays "open".
    const line: PickingLine = {
      key: `${order.id}::${SKU_1}`, orderId: order.id, salesNo: order.salesNo,
      sku: SKU_1, product: 'Coffee Scale 2kg / 0.1g', desc: '', img: '', unit: 'Unit', bin: '-', qty: 2,
    }
    const task1 = addPickingTask({
      salesOrderIds: [order.id], salesNos: [order.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
      lines: [line],
    })
    expect(task1.status).toBe('open')
    expect(pickedQtyForOrderSku(order.id, SKU_1)).toBe(0) // nothing actually picked yet

    // SKU 1 must now be covered (claimed by the open task) even though nothing's
    // been picked — this is exactly the reported bug. SKU 2 remains free.
    const covered = pickedKeysForOrder(order.id)
    expect(covered.has(`${order.id}::${SKU_1}`)).toBe(true)
    expect(covered.has(`${order.id}::${SKU_2}`)).toBe(false)

    // Order-level "Create picking" gate must still allow a second list (SKU 2 left).
    expect(canPickOrder(order)).toBe(true)
  })

  it('does NOT cover a SKU whose only picking task is canceled', () => {
    const order = addOutgoing({
      salesNo: 'Test Canceled-Task Order', source: 'Manual',
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
      skuQty: 1, orderQty: 2, shippedQty: 0, status: 'open', dueDate: '2026-08-01',
      lines: [{ sku: SKU_1, productName: 'Coffee Scale 2kg / 0.1g', desc: '', img: '', unit: 'Unit', qty: 2 }],
    })
    const line: PickingLine = {
      key: `${order.id}::${SKU_1}`, orderId: order.id, salesNo: order.salesNo,
      sku: SKU_1, product: 'Coffee Scale 2kg / 0.1g', desc: '', img: '', unit: 'Unit', bin: '-', qty: 2,
    }
    const task = addPickingTask({
      salesOrderIds: [order.id], salesNos: [order.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
      lines: [line],
    })
    task.status = 'canceled'

    expect(pickedKeysForOrder(order.id).has(`${order.id}::${SKU_1}`)).toBe(false)
    expect(canPickOrder(order)).toBe(true)
  })

  it('does NOT cover the un-picked remainder of a FINISHED "partially picked" task (short pick can be topped up)', () => {
    const order = addOutgoing({
      salesNo: 'Test Partial-Pick Order', source: 'Manual',
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
      skuQty: 1, orderQty: 5, shippedQty: 0, status: 'open', dueDate: '2026-08-01',
      lines: [{ sku: SKU_1, productName: 'Coffee Scale 2kg / 0.1g', desc: '', img: '', unit: 'Unit', qty: 5 }],
    })
    const key = `${order.id}::${SKU_1}`
    const line: PickingLine = {
      key, orderId: order.id, salesNo: order.salesNo,
      sku: SKU_1, product: 'Coffee Scale 2kg / 0.1g', desc: '', img: '', unit: 'Unit', bin: '-', qty: 5,
    }
    const task = addPickingTask({
      salesOrderIds: [order.id], salesNos: [order.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
      lines: [line],
    })
    // Finish short: only 2 of 5 picked → status "partially picked" (finished, not open).
    task.pickedByKey = { [key]: 2 }
    task.pickedQty = 2
    task.status = 'partially picked'

    expect(pickedKeysForOrder(order.id).has(key)).toBe(false) // 3 left → still pickable
    expect(canPickOrder(order)).toBe(true)
  })

  // PRD 1.2 D3 (allow_partial_picking = TRUE — wh-006's default): an OPEN task that
  // claims only PART of a SKU's qty leaves the remainder claimable on a second list,
  // so a SKU can be split across two Open picking tasks (4 + 3 of 7). Coverage is
  // qty-aware, not whole-line, when partial picking is on.
  it('partial picking: an open task claiming only part of a SKU leaves the remainder pickable', () => {
    const order = addOutgoing({
      salesNo: 'Test Partial-Split Order', source: 'Manual',
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
      skuQty: 1, orderQty: 7, shippedQty: 0, status: 'open', dueDate: '2026-08-01',
      lines: [{ sku: SKU_1, productName: 'Coffee Scale 2kg / 0.1g', desc: '', img: '', unit: 'Unit', qty: 7 }],
    })
    const key = `${order.id}::${SKU_1}`
    const mkLine = (qty: number): PickingLine => ({
      key, orderId: order.id, salesNo: order.salesNo,
      sku: SKU_1, product: 'Coffee Scale 2kg / 0.1g', desc: '', img: '', unit: 'Unit', bin: '-', qty,
    })

    // Picking-1 claims 4 of 7 (Open). 3 still unclaimed → NOT covered, second list allowed.
    addPickingTask({ salesOrderIds: [order.id], salesNos: [order.salesNo], warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Op', lines: [mkLine(4)] })
    expect(committedQtyForOrderSku(order.id, SKU_1)).toBe(4)
    expect(pickedKeysForOrder(order.id).has(key)).toBe(false)
    expect(canPickOrder(order)).toBe(true)

    // Picking-2 claims the remaining 3 (Open). Now fully committed → covered, no third list.
    addPickingTask({ salesOrderIds: [order.id], salesNos: [order.salesNo], warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Op', lines: [mkLine(3)] })
    expect(committedQtyForOrderSku(order.id, SKU_1)).toBe(7)
    expect(pickedKeysForOrder(order.id).has(key)).toBe(true)
    expect(canPickOrder(order)).toBe(false)
  })
})
