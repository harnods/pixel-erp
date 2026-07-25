/**
 * D7 — Edit Outbound. editOutboundOrder applies new SKU lines with the AC#4 gates:
 *  - a SKU locked into a STARTED picking task can't be removed/reduced (SKU_LOCKED),
 *    but can still be increased;
 *  - an increase that can't be reserved rejects the WHOLE edit (NO_ALLOCATABLE_STOCK),
 *    nothing committed;
 *  - a reduction/removal releases its reservation back to Available;
 *  - a shipped/cancelled order isn't editable (NOT_EDITABLE).
 */
import { describe, it, expect } from 'vitest'
import {
  addOutgoing, canEditOutboundOrder, releaseReservedForCancelledOrder, outgoingOrders, type OutgoingOrder,
} from '~/data/outgoing'
import { editOutboundOrder, cancelOutboundOrder, syncOutboundOrderStatuses } from '~/data/outboundSync'
import { addPickingTask, startPicking, endPicking, getPickingTask } from '~/data/pickingTasks'
import { addPackingTask, endPacking, getPackingTask } from '~/data/packingTasks'
import { addDeliveryTaskFromPackingTasks, handoverToCourierBulk, completeShipment } from '~/data/deliveryTasks'
import { getWarehouseDetail, reservedQtyForTask, getReservationsForOrder } from '~/data/warehouseDetails'

const WH = 'wh-006'
const WH_NAME = 'Gudang Makassar Selatan'
const A = '3004'
const B = '3005'

function availOf(sku: string) { return getWarehouseDetail(WH)!.stock.find((s) => s.sku === sku)!.available }
function orderQty(id: string) { return outgoingOrders.find((o) => o.id === id)!.orderQty }
function resFor(orderId: string, sku: string) {
  return getReservationsForOrder(orderId, sku).reduce((s, r) => s + (r.serials?.length ?? r.qty), 0)
}
function makeOrder(lines: { sku: string; qty: number }[]): OutgoingOrder {
  return addOutgoing({
    salesNo: 'EDIT Test', source: 'Manual', warehouseId: WH, warehouseName: WH_NAME,
    skuQty: lines.length, orderQty: lines.reduce((s, l) => s + l.qty, 0), shippedQty: 0,
    status: 'pending', dueDate: '2026-08-01',
    lines: lines.map((l) => ({ sku: l.sku, productName: 'Test', desc: '', img: '', unit: 'Unit', qty: l.qty })),
  })
}
const K = (orderId: string, sku: string) => `${orderId}::${sku}`

describe('D7 — edit a PENDING order', () => {
  it('increase qty reserves more; decrease releases back to Available', () => {
    const o = makeOrder([{ sku: A, qty: 2 }])
    expect(resFor(o.id, A)).toBe(2)
    const availAfterCreate = availOf(A)

    expect(editOutboundOrder(o.id, [{ sku: A, qty: 4 }]).ok).toBe(true)
    expect(orderQty(o.id)).toBe(4)
    expect(resFor(o.id, A)).toBe(4)                 // +2 reserved
    expect(availOf(A)).toBe(availAfterCreate - 2)   // 2 more taken from Available

    expect(editOutboundOrder(o.id, [{ sku: A, qty: 1 }]).ok).toBe(true)
    expect(orderQty(o.id)).toBe(1)
    expect(resFor(o.id, A)).toBe(1)                 // released 3
    expect(availOf(A)).toBe(availAfterCreate + 1)   // net +1 vs the qty-2 baseline
    cancelOutboundOrder(o.id); releaseReservedForCancelledOrder(o.id)
  })

  it('add a new SKU reserves it; removing a SKU releases it', () => {
    const o = makeOrder([{ sku: A, qty: 2 }])
    expect(editOutboundOrder(o.id, [{ sku: A, qty: 2 }, { sku: B, qty: 3 }]).ok).toBe(true)
    expect(outgoingOrders.find((x) => x.id === o.id)!.skuQty).toBe(2)
    expect(resFor(o.id, B)).toBe(3)

    const availBbefore = availOf(B)
    expect(editOutboundOrder(o.id, [{ sku: A, qty: 2 }]).ok).toBe(true) // drop B
    expect(resFor(o.id, B)).toBe(0)                 // B reservation released
    expect(availOf(B)).toBe(availBbefore + 3)
    cancelOutboundOrder(o.id); releaseReservedForCancelledOrder(o.id)
  })

  it('increase beyond Available is rejected with NO_ALLOCATABLE_STOCK — nothing committed', () => {
    const o = makeOrder([{ sku: A, qty: 2 }])
    const over = availOf(A) + 2 + 100 // way past what's free
    const res = editOutboundOrder(o.id, [{ sku: A, qty: over }])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('NO_ALLOCATABLE_STOCK')
    expect(orderQty(o.id)).toBe(2)   // unchanged
    expect(resFor(o.id, A)).toBe(2)  // unchanged
    cancelOutboundOrder(o.id); releaseReservedForCancelledOrder(o.id)
  })
})

describe('D7 — edit vs picking state (AC#4 lock)', () => {
  it('a SKU on a STARTED picking task cannot be reduced or removed, but CAN be increased', () => {
    const o = makeOrder([{ sku: A, qty: 2 }])
    const pt = addPickingTask({ salesOrderIds: [o.id], salesNos: [o.salesNo], warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    startPicking(pt.id) // A now locked at 2

    // reduce → rejected
    let res = editOutboundOrder(o.id, [{ sku: A, qty: 1 }])
    expect(res.ok).toBe(false); if (!res.ok) expect(res.reason).toBe('REDUCTION_EXCEEDS_REMOVABLE')
    expect(orderQty(o.id)).toBe(2)
    // remove → rejected
    res = editOutboundOrder(o.id, [{ sku: B, qty: 1 }]) // A dropped
    expect(res.ok).toBe(false); if (!res.ok) expect(res.reason).toBe('REDUCTION_EXCEEDS_REMOVABLE')
    // increase → allowed
    expect(editOutboundOrder(o.id, [{ sku: A, qty: 5 }]).ok).toBe(true)
    expect(orderQty(o.id)).toBe(5)
    cancelOutboundOrder(o.id); releaseReservedForCancelledOrder(o.id)
  })

  it('an OPEN (not-yet-started) picking task does NOT lock — reduce is still allowed', () => {
    const o = makeOrder([{ sku: A, qty: 3 }])
    addPickingTask({ salesOrderIds: [o.id], salesNos: [o.salesNo], warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' }) // open, not started
    expect(editOutboundOrder(o.id, [{ sku: A, qty: 1 }]).ok).toBe(true) // open picking doesn't lock
    expect(orderQty(o.id)).toBe(1)
    cancelOutboundOrder(o.id); releaseReservedForCancelledOrder(o.id)
  })
})

describe('D7 — edit activity log (apa ke apa)', () => {
  function logOf(id: string) { return outgoingOrders.find((o) => o.id === id)!.editLog ?? [] }

  it('records a qty change as "old → new"', () => {
    const o = makeOrder([{ sku: A, qty: 2 }])
    expect(editOutboundOrder(o.id, [{ sku: A, qty: 5 }]).ok).toBe(true)
    const log = logOf(o.id)
    expect(log).toHaveLength(1)
    expect(log[0]!.by).toBe('Rizal Candra')
    expect(log[0]!.changes.some((c) => c.value === '2 → 5')).toBe(true)
    cancelOutboundOrder(o.id); releaseReservedForCancelledOrder(o.id)
  })

  it('records an added SKU and a removed SKU', () => {
    const o = makeOrder([{ sku: A, qty: 2 }])
    expect(editOutboundOrder(o.id, [{ sku: A, qty: 2 }, { sku: B, qty: 3 }]).ok).toBe(true)
    expect(logOf(o.id).at(-1)!.changes.some((c) => c.value === 'Added — qty 3')).toBe(true)
    expect(editOutboundOrder(o.id, [{ sku: A, qty: 2 }]).ok).toBe(true) // drop B
    expect(logOf(o.id).at(-1)!.changes.some((c) => c.value === 'Removed — was 3')).toBe(true)
    expect(logOf(o.id)).toHaveLength(2)
    cancelOutboundOrder(o.id); releaseReservedForCancelledOrder(o.id)
  })

  it('records header changes (customer / due date / memo)', () => {
    const o = makeOrder([{ sku: A, qty: 1 }])
    expect(editOutboundOrder(o.id, [{ sku: A, qty: 1 }], { customer: 'New Cust', dueDate: '2026-09-01', memo: 'rush' }).ok).toBe(true)
    const c = logOf(o.id).at(-1)!.changes
    expect(c.some((x) => x.label === 'Customer' && x.value.endsWith('→ New Cust'))).toBe(true)
    expect(c.some((x) => x.label === 'Estimated delivery' && x.value.endsWith('→ 2026-09-01'))).toBe(true)
    expect(c.some((x) => x.label === 'Memo' && x.value.endsWith('→ rush'))).toBe(true)
    cancelOutboundOrder(o.id); releaseReservedForCancelledOrder(o.id)
  })

  it('a no-op save records nothing', () => {
    const o = makeOrder([{ sku: A, qty: 2 }])
    expect(editOutboundOrder(o.id, [{ sku: A, qty: 2 }]).ok).toBe(true) // identical lines, no header
    expect(logOf(o.id)).toHaveLength(0)
    cancelOutboundOrder(o.id); releaseReservedForCancelledOrder(o.id)
  })
})

describe('D7 — not editable once shipped or cancelled', () => {
  it('a shipped order is NOT editable', () => {
    const o = makeOrder([{ sku: A, qty: 1 }])
    const pt = addPickingTask({ salesOrderIds: [o.id], salesNos: [o.salesNo], warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    startPicking(pt.id); endPicking(pt.id, { [K(o.id, A)]: 1 })
    const pk = addPackingTask({ salesOrderId: o.id, salesNo: o.salesNo, pickingTaskId: pt.id, pickingTaskNo: pt.taskNo, warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    endPacking(pk.id, { [K(o.id, A)]: 1 })
    const del = addDeliveryTaskFromPackingTasks([getPackingTask(pk.id)!], { assignee: 'Op' })
    const [s] = handoverToCourierBulk([del.id], { assignee: 'Op', transactionDate: '2026-07-20' })
    completeShipment(s!.shipmentSeq, { receivedDate: '2026-07-21', receivedBy: 'Rina' })
    syncOutboundOrderStatuses()
    expect(canEditOutboundOrder(outgoingOrders.find((x) => x.id === o.id)!)).toBe(false)
    const res = editOutboundOrder(o.id, [{ sku: A, qty: 2 }])
    expect(res.ok).toBe(false); if (!res.ok) expect(res.reason).toBe('NOT_EDITABLE')
    void getPickingTask(pt.id)
  })

  it('a cancelled order is NOT editable', () => {
    const o = makeOrder([{ sku: A, qty: 1 }])
    cancelOutboundOrder(o.id)
    expect(canEditOutboundOrder(outgoingOrders.find((x) => x.id === o.id)!)).toBe(false)
    expect(editOutboundOrder(o.id, [{ sku: A, qty: 2 }]).ok).toBe(false)
    releaseReservedForCancelledOrder(o.id)
  })
})
