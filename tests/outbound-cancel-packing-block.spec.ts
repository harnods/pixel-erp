/**
 * Regression for the two reported "cancelled order still blocks packing" bugs:
 *   Bug 1 — Multiple orders in ONE picking; cancel one → the picking must still be
 *           able to proceed to packing for the remaining live order(s).
 *   Bug 2 — Multiple orders across MULTIPLE pickings; when creating a packing task
 *           with one order cancelled, the live order(s) must still be packable/saveable.
 *
 * Root cause was in the create-packing UI (CreatePackingPage.handleCreate), which
 * hard-blocked the whole Save if ANY linked order was cancelled — and cancelled
 * orders stay linked to the picking for audit, so the live orders could never pack.
 * These tests pin the DATA-LAYER invariant the UI must honour: a cancelled order is
 * excluded from packable/ready-to-pack, never a blocker for its co-listed live orders.
 */
import { describe, it, expect } from 'vitest'
import { addOutgoing, outgoingOrders, type OutgoingOrder } from '~/data/outgoing'
import {
  addPickingTask, startPicking, endPicking, getPickingTask,
  acknowledgeCanceledPickingOrders, packableOrderIds, isPickingReadyToPack,
} from '~/data/pickingTasks'
import { cancelOutboundOrder } from '~/data/outboundSync'

const WH = 'wh-006', WH_NAME = 'Gudang Makassar Selatan'
const A = '3004', B = '3005'
const K = (orderId: string, sku: string) => `${orderId}::${sku}`
const line = (sku: string, qty: number) => ({ sku, productName: 'T', desc: '', img: '', unit: 'Unit', qty })
function order(lines: ReturnType<typeof line>[]): OutgoingOrder {
  return addOutgoing({
    salesNo: 'CANCBlk', source: 'Manual', warehouseId: WH, warehouseName: WH_NAME,
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
const oStat = (id: string) => outgoingOrders.find((o) => o.id === id)!.status

describe('Outbound cancel — cancelled order must not block packing', () => {
  it('Bug 1: shared picking, cancel one order → other order still packable & task ready to pack', () => {
    const a = order([line(A, 2)])
    const b = order([line(B, 3)])
    const pt = pickTask([a, b])
    startPicking(pt.id)

    // Cancel A while the shared picking is in progress → needs ack.
    expect(cancelOutboundOrder(a.id).ok).toBe(true)
    const t = getPickingTask(pt.id)!
    expect(t.status).not.toBe('canceled') // shared task keeps running for B
    // Operator acks the cancelled order → A's lines drop out of the pick work.
    acknowledgeCanceledPickingOrders(pt.id)

    // Finish picking B (A must NOT be required — that was the bug).
    endPicking(pt.id, { [K(b.id, B)]: 3 })
    expect(getPickingTask(pt.id)!.status).toBe('completed')

    // A is cancelled → never packable; B is live and picked → packable.
    expect(isPickingReadyToPack(getPickingTask(pt.id)!)).toBe(true)
    expect(packableOrderIds(getPickingTask(pt.id)!)).toEqual([b.id])
    expect(oStat(a.id)).toBe('canceled')
  })

  it('Bug 1b: cancel one order in shared picking BEFORE start (Open) → auto-drops, B packable', () => {
    const a = order([line(A, 2)])
    const b = order([line(B, 3)])
    const pt = pickTask([a, b]) // still Open
    expect(cancelOutboundOrder(a.id).ok).toBe(true)
    startPicking(pt.id)
    endPicking(pt.id, { [K(b.id, B)]: 3 })
    expect(getPickingTask(pt.id)!.status).toBe('completed')
    expect(packableOrderIds(getPickingTask(pt.id)!)).toEqual([b.id])
  })

  it('Bug 2: two pickings, cancel the order on one → the other picking still packs', () => {
    const a = order([line(A, 2)])
    const b = order([line(B, 3)])
    const pa = pickTask([a]); startPicking(pa.id); endPicking(pa.id, { [K(a.id, A)]: 2 })
    const pb = pickTask([b]); startPicking(pb.id); endPicking(pb.id, { [K(b.id, B)]: 3 })

    expect(cancelOutboundOrder(a.id).ok).toBe(true)

    // A's picking: cancelled → not packable. B's picking: live → packable.
    expect(packableOrderIds(getPickingTask(pa.id)!)).toEqual([]) // A dropped
    expect(packableOrderIds(getPickingTask(pb.id)!)).toEqual([b.id]) // B still good
    expect(isPickingReadyToPack(getPickingTask(pb.id)!)).toBe(true)
  })
})
