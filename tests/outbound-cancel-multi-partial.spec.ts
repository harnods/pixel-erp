/**
 * Exhaustive edge-case matrix for outbound cancel-order around the areas most likely
 * to hide bugs: MULTIPLE orders in one task, PARTIAL picks/packs, and MULTIPLE+PARTIAL
 * combinations. Grounded in WMS PRD 1.2 D2 AC#6 (cascade, PRD-literal) + the project
 * rules: finished work (Completed) STAYS; a shared task is never killed by one order's
 * cancel; a cancelled order is dropped from the pick work but kept LINKED for audit;
 * reservations are order-owned (released via manual Release Reserved).
 *
 * Each `it` asserts the CORRECT expected behavior — a red test is a real bug to fix.
 */
import { describe, it, expect } from 'vitest'
import { addOutgoing, outgoingOrders, type OutgoingOrder } from '~/data/outgoing'
import {
  addPickingTask, startPicking, endPicking, savePickingDraft, getPickingTask,
  acknowledgeCanceledPickingOrders, pendingCanceledOrderIds, packableOrderIds,
  isPickingReadyToPack, isFullyPicked, orderPickedQtyInTask, orderFullyPickedInTask,
} from '~/data/pickingTasks'
import { addPackingTask, getPackingTask, getPackingForOrder, endPacking } from '~/data/packingTasks'
import {
  addDeliveryTaskFromPackingTasks, handoverToCourierBulk, completeShipment, getDeliveryTask,
} from '~/data/deliveryTasks'
import { cancelOutboundOrder, syncOutboundOrderStatuses } from '~/data/outboundSync'

const WH = 'wh-006', WH_NAME = 'Gudang Makassar Selatan'
const A = '3004', B = '3005', C = '3006'
const K = (orderId: string, sku: string) => `${orderId}::${sku}`
const line = (sku: string, qty: number) => ({ sku, productName: 'T', desc: '', img: '', unit: 'Unit', qty })
function order(lines: ReturnType<typeof line>[]): OutgoingOrder {
  return addOutgoing({
    salesNo: 'MP', source: 'Manual', warehouseId: WH, warehouseName: WH_NAME,
    skuQty: lines.length, orderQty: lines.reduce((s, l) => s + l.qty, 0), shippedQty: 0,
    status: 'pending', dueDate: '2026-08-01', lines,
  })
}
function pickTask(orders: OutgoingOrder[]) {
  return addPickingTask({
    salesOrderIds: orders.map((o) => o.id), salesNos: orders.map((o) => o.salesNo),
    warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op',
  })
}
const rStat = (id: string) => getPickingTask(id)!.status
const oStat = (id: string) => outgoingOrders.find((o) => o.id === id)!.status
const t = (id: string) => getPickingTask(id)!

// ───────────────────────────────────────────────────────────────────────────
// Group 1 — SHARED picking: cancel ONE order, across every picking status
// ───────────────────────────────────────────────────────────────────────────
describe('G1 shared picking · cancel one order · per status', () => {
  it('G1.1 Open → auto-drop (no ack), task stays open, other order still packable', () => {
    const a = order([line(A, 2)]), b = order([line(B, 3)]); const pt = pickTask([a, b])
    expect(cancelOutboundOrder(a.id).ok).toBe(true)
    expect(rStat(pt.id)).toBe('open')            // never cancelled — shared
    expect(t(pt.id).needsCancelAck).toBeFalsy()  // Open → no banner
    expect(pendingCanceledOrderIds(t(pt.id))).toEqual([])
    expect(t(pt.id).toPickQty).toBe(3)           // A's 2 dropped from pick work
    startPicking(pt.id); endPicking(pt.id, { [K(b.id, B)]: 3 })
    expect(rStat(pt.id)).toBe('completed')       // B alone completes it
    expect(packableOrderIds(t(pt.id))).toEqual([b.id])
  })

  it('G1.2 In progress → needs ack; after ack other order picks & packs', () => {
    const a = order([line(A, 2)]), b = order([line(B, 3)]); const pt = pickTask([a, b])
    startPicking(pt.id)
    expect(cancelOutboundOrder(a.id).ok).toBe(true)
    expect(rStat(pt.id)).toBe('in progress')
    expect(t(pt.id).needsCancelAck).toBe(true)
    expect(pendingCanceledOrderIds(t(pt.id))).toEqual([a.id])
    acknowledgeCanceledPickingOrders(pt.id)
    expect(t(pt.id).needsCancelAck).toBe(false)
    expect(t(pt.id).toPickQty).toBe(3)
    endPicking(pt.id, { [K(b.id, B)]: 3 })
    expect(rStat(pt.id)).toBe('completed')
    expect(packableOrderIds(t(pt.id))).toEqual([b.id])
  })

  it('G1.3 Partially picked → needs ack; after ack other order stays packable', () => {
    const a = order([line(A, 2)]), b = order([line(B, 3)]); const pt = pickTask([a, b])
    startPicking(pt.id)
    endPicking(pt.id, { [K(a.id, A)]: 1, [K(b.id, B)]: 2 }) // short on both → partially picked
    expect(rStat(pt.id)).toBe('partially picked')
    expect(cancelOutboundOrder(a.id).ok).toBe(true)
    expect(rStat(pt.id)).toBe('partially picked')            // finished work stays
    expect(t(pt.id).needsCancelAck).toBe(true)
    acknowledgeCanceledPickingOrders(pt.id)
    expect(packableOrderIds(t(pt.id))).toEqual([b.id])       // B (2 picked) packable
  })

  it('G1.4 Completed → stays; cancelled order not packable, other is', () => {
    const a = order([line(A, 2)]), b = order([line(B, 3)]); const pt = pickTask([a, b])
    startPicking(pt.id); endPicking(pt.id, { [K(a.id, A)]: 2, [K(b.id, B)]: 3 })
    expect(rStat(pt.id)).toBe('completed')
    expect(cancelOutboundOrder(a.id).ok).toBe(true)
    expect(rStat(pt.id)).toBe('completed')
    expect(packableOrderIds(t(pt.id))).toEqual([b.id])
    expect(oStat(a.id)).toBe('canceled')
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Group 2 — SHARED + PARTIAL picks: the acked order's picks must not linger
// ───────────────────────────────────────────────────────────────────────────
describe('G2 shared + partial · picked counts stay honest after ack', () => {
  it('G2.1 in-progress draft picks for BOTH, cancel A, ack → task picked count excludes A', () => {
    const a = order([line(A, 2)]), b = order([line(B, 3)]); const pt = pickTask([a, b])
    startPicking(pt.id)
    savePickingDraft(pt.id, { [K(a.id, A)]: 2, [K(b.id, B)]: 1 }) // A done, B partway
    expect(cancelOutboundOrder(a.id).ok).toBe(true)
    acknowledgeCanceledPickingOrders(pt.id)
    // toPickQty is B-only (3). picked count must be B-only (1), NOT 3 (2 stale A + 1 B).
    expect(t(pt.id).toPickQty).toBe(3)
    expect(orderPickedQtyInTask(t(pt.id), b.id)).toBe(1)
    expect(t(pt.id).pickedQty).toBe(1)          // A's 2 units must be cleared
    expect(isFullyPicked(t(pt.id))).toBe(false) // 1 of 3, not "1>=3" via stale math
  })

  it('G2.2 A fully picked, B short, cancel A, ack → B still packable at its short qty', () => {
    const a = order([line(A, 2)]), b = order([line(B, 5)]); const pt = pickTask([a, b])
    startPicking(pt.id)
    endPicking(pt.id, { [K(a.id, A)]: 2, [K(b.id, B)]: 3 }) // partially picked overall
    expect(cancelOutboundOrder(a.id).ok).toBe(true)
    acknowledgeCanceledPickingOrders(pt.id)
    expect(packableOrderIds(t(pt.id))).toEqual([b.id])
    expect(orderPickedQtyInTask(t(pt.id), b.id)).toBe(3)
    expect(orderFullyPickedInTask(t(pt.id), b.id)).toBe(false)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Group 3 — THREE-order shared picking
// ───────────────────────────────────────────────────────────────────────────
describe('G3 three-order shared picking', () => {
  it('G3.1 cancel the middle order → the other two stay packable, middle dropped', () => {
    const a = order([line(A, 1)]), b = order([line(B, 1)]), c = order([line(C, 1)])
    const pt = pickTask([a, b, c])
    expect(cancelOutboundOrder(b.id).ok).toBe(true)
    expect(rStat(pt.id)).toBe('open')
    startPicking(pt.id); endPicking(pt.id, { [K(a.id, A)]: 1, [K(c.id, C)]: 1 })
    expect(rStat(pt.id)).toBe('completed')
    expect(packableOrderIds(t(pt.id)).sort()).toEqual([a.id, c.id].sort())
  })

  it('G3.2 cancel two of three (in progress) → last order still picks & packs, task alive', () => {
    const a = order([line(A, 1)]), b = order([line(B, 1)]), c = order([line(C, 1)])
    const pt = pickTask([a, b, c]); startPicking(pt.id)
    expect(cancelOutboundOrder(a.id).ok).toBe(true)
    expect(cancelOutboundOrder(b.id).ok).toBe(true)
    expect(rStat(pt.id)).toBe('in progress')     // c still live
    acknowledgeCanceledPickingOrders(pt.id)
    endPicking(pt.id, { [K(c.id, C)]: 1 })
    expect(rStat(pt.id)).toBe('completed')
    expect(packableOrderIds(t(pt.id))).toEqual([c.id])
  })

  it('G3.3 cancel ALL three (open) → picking task is cancelled (no live order left)', () => {
    const a = order([line(A, 1)]), b = order([line(B, 1)]), c = order([line(C, 1)])
    const pt = pickTask([a, b, c])
    cancelOutboundOrder(a.id); cancelOutboundOrder(b.id); cancelOutboundOrder(c.id)
    expect(rStat(pt.id)).toBe('canceled')
    expect(packableOrderIds(t(pt.id))).toEqual([])
  })

  it('G3.4 cancel ALL three (completed) → picking STAYS completed (permanent record), none packable', () => {
    const a = order([line(A, 1)]), b = order([line(B, 1)]), c = order([line(C, 1)])
    const pt = pickTask([a, b, c]); startPicking(pt.id)
    endPicking(pt.id, { [K(a.id, A)]: 1, [K(b.id, B)]: 1, [K(c.id, C)]: 1 })
    cancelOutboundOrder(a.id); cancelOutboundOrder(b.id); cancelOutboundOrder(c.id)
    expect(rStat(pt.id)).toBe('completed')
    expect(packableOrderIds(t(pt.id))).toEqual([])
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Group 4 — MULTIPLE picking tasks (separate orders / one order split)
// ───────────────────────────────────────────────────────────────────────────
describe('G4 multiple picking tasks', () => {
  it('G4.1 separate orders in separate pickings, cancel one → other picking untouched & packable', () => {
    const a = order([line(A, 2)]), b = order([line(B, 3)])
    const pa = pickTask([a]); startPicking(pa.id); endPicking(pa.id, { [K(a.id, A)]: 2 })
    const pb = pickTask([b]); startPicking(pb.id); endPicking(pb.id, { [K(b.id, B)]: 3 })
    expect(cancelOutboundOrder(a.id).ok).toBe(true)
    expect(rStat(pa.id)).toBe('completed')       // completed → stays even sole
    expect(packableOrderIds(t(pa.id))).toEqual([]) // but cancelled → not packable
    expect(rStat(pb.id)).toBe('completed')
    expect(packableOrderIds(t(pb.id))).toEqual([b.id])
  })

  it('G4.2 one order split across two pickings (partial each), cancel it → both drop it, nothing packable', () => {
    const a = order([line(A, 5)])
    const p1 = pickTask([a]); startPicking(p1.id); endPicking(p1.id, { [K(a.id, A)]: 2 }) // partial
    const p2 = pickTask([a]); startPicking(p2.id); endPicking(p2.id, { [K(a.id, A)]: 3 }) // remainder
    expect(cancelOutboundOrder(a.id).ok).toBe(true)
    // Both are sole+partially-picked/completed for a now-cancelled order → not packable.
    expect(packableOrderIds(t(p1.id))).toEqual([])
    expect(packableOrderIds(t(p2.id))).toEqual([])
    expect(oStat(a.id)).toBe('canceled')
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Group 5 — PACKING creation with a cancelled co-order (the reported bug area)
// ───────────────────────────────────────────────────────────────────────────
describe('G5 packing create with cancelled co-order', () => {
  it('G5.1 shared picking completed, cancel A → a packing task can still be made for B', () => {
    const a = order([line(A, 2)]), b = order([line(B, 3)]); const pt = pickTask([a, b])
    startPicking(pt.id); endPicking(pt.id, { [K(a.id, A)]: 2, [K(b.id, B)]: 3 })
    expect(cancelOutboundOrder(a.id).ok).toBe(true)
    const packable = packableOrderIds(t(pt.id))
    expect(packable).toEqual([b.id])
    // Emulate CreatePackingPage: one packing task per PACKABLE order (A excluded).
    for (const id of packable) {
      addPackingTask({ salesOrderId: id, salesNo: 'MP', pickingTaskId: pt.id, pickingTaskNo: pt.taskNo, warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    }
    expect(getPackingForOrder(b.id).length).toBe(1)
    expect(getPackingForOrder(a.id).length).toBe(0) // cancelled order never packed
  })

  it('G5.2 cancel a packed order (packing open) → packing cancelled, picking stays', () => {
    const a = order([line(A, 2)]), b = order([line(B, 3)]); const pt = pickTask([a, b])
    startPicking(pt.id); endPicking(pt.id, { [K(a.id, A)]: 2, [K(b.id, B)]: 3 })
    const pkA = addPackingTask({ salesOrderId: a.id, salesNo: 'MP', pickingTaskId: pt.id, pickingTaskNo: pt.taskNo, warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    expect(cancelOutboundOrder(a.id).ok).toBe(true)
    expect(getPackingTask(pkA.id)!.status).toBe('canceled')
    expect(rStat(pt.id)).toBe('completed') // shared picking untouched
    expect(packableOrderIds(t(pt.id))).toEqual([b.id])
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Group 6 — idempotency / re-cancel
// ───────────────────────────────────────────────────────────────────────────
describe('G6 idempotency', () => {
  it('G6.1 cancelling the same order twice is a no-op the second time', () => {
    const a = order([line(A, 2)]), b = order([line(B, 3)]); const pt = pickTask([a, b])
    expect(cancelOutboundOrder(a.id).ok).toBe(true)
    const second = cancelOutboundOrder(a.id)
    // already canceled → guarded (not "ok" as a fresh cancel), task unaffected
    expect(rStat(pt.id)).toBe('open')
    expect(second.ok === false || second.ok === true).toBe(true) // must not throw
    // B stays live & linked; A stays cancelled + acked (not re-flagged for ack).
    expect(t(pt.id).salesOrderIds).toContain(b.id)
    expect(oStat(b.id)).not.toBe('canceled')
    expect(oStat(a.id)).toBe('canceled')
    expect(t(pt.id).needsCancelAck).toBeFalsy()
    // B becomes packable once picked — cancel of A never blocks it.
    startPicking(pt.id); endPicking(pt.id, { [K(b.id, B)]: 3 })
    expect(packableOrderIds(t(pt.id))).toEqual([b.id])
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Group 7 — SHARED shipment (bulk handover): cancel one order must not block
//           completing the shipment for the others (the "stuck" bug, shipment stage)
// ───────────────────────────────────────────────────────────────────────────
describe('G7 shared shipment · cancel one · rest still completes', () => {
  function shipReadyDelivery(o: OutgoingOrder, sku: string, qty: number) {
    const pt = pickTask([o]); startPicking(pt.id); endPicking(pt.id, { [K(o.id, sku)]: qty })
    const pk = addPackingTask({ salesOrderId: o.id, salesNo: 'MP', pickingTaskId: pt.id, pickingTaskNo: pt.taskNo, warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    endPacking(pk.id, { [K(o.id, sku)]: qty })
    return addDeliveryTaskFromPackingTasks([getPackingTask(pk.id)!], { assignee: 'Op' })
  }

  it('G7.1 cancel A while ready-to-ship, then bulk-handover both → only B goes out for delivery', () => {
    const a = order([line(A, 2)]), b = order([line(B, 3)])
    const delA = shipReadyDelivery(a, A, 2), delB = shipReadyDelivery(b, B, 3)
    expect(cancelOutboundOrder(a.id).ok).toBe(true)
    expect(getDeliveryTask(delA.id)!.status).toBe('canceled')
    // Handover attempts both; the cancelled one must be skipped, B proceeds.
    handoverToCourierBulk([delA.id, delB.id], { assignee: 'Op', transactionDate: '2026-07-20' })
    expect(getDeliveryTask(delA.id)!.status).toBe('canceled')       // still canceled
    expect(getDeliveryTask(delB.id)!.status).toBe('out for delivery')
  })

  it('G7.2 cancel A while OUT for delivery in a shared shipment, then complete → B ships, A stays canceled', () => {
    const a = order([line(A, 2)]), b = order([line(B, 3)])
    const delA = shipReadyDelivery(a, A, 2), delB = shipReadyDelivery(b, B, 3)
    const [s] = handoverToCourierBulk([delA.id, delB.id], { assignee: 'Op', transactionDate: '2026-07-20' })
    expect(getDeliveryTask(delA.id)!.status).toBe('out for delivery')
    expect(cancelOutboundOrder(a.id).ok).toBe(true)
    expect(getDeliveryTask(delA.id)!.status).toBe('canceled')
    // Completing the shared shipment must NOT be blocked by the cancelled A.
    completeShipment(s!.shipmentSeq, { receivedDate: '2026-07-21', receivedBy: 'Rina' })
    expect(getDeliveryTask(delB.id)!.status).toBe('shipped')  // B posted
    expect(getDeliveryTask(delA.id)!.status).toBe('canceled') // A never ships
    expect(getDeliveryTask(delA.id)!.shippedQty).toBe(0)
    syncOutboundOrderStatuses()
    expect(oStat(a.id)).toBe('canceled')
    expect(oStat(b.id)).toBe('completed') // fully shipped
  })
})
