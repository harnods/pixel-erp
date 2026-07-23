/**
 * D7 allocation step — reducing a SKU spread across multiple picking tasks.
 * Covers AC#1–AC#5 + edge cases (multi-order shared tasks, partial/started tasks,
 * multi-SKU tasks, override validation, removable cap).
 */
import { describe, it, expect } from 'vitest'
import { addOutgoing, releaseReservedForCancelledOrder, outgoingOrders, type OutgoingOrder } from '~/data/outgoing'
import { editOutboundOrder, proposeSkuReduction, cancelOutboundOrder } from '~/data/outboundSync'
import { addPickingTask, buildPickingLines, getPickingTask, getPickingForOrder, startPicking, type PickingLine } from '~/data/pickingTasks'
import { getReservationsForOrder } from '~/data/warehouseDetails'

const WH = 'wh-006', WH_NAME = 'Gudang Makassar Selatan', A = '3004', B = '3005'
function resFor(orderId: string, sku: string) {
  return getReservationsForOrder(orderId, sku).reduce((s, r) => s + (r.serials?.length ?? r.qty), 0)
}
function orderQty(id: string) { return outgoingOrders.find((o) => o.id === id)!.orderQty }
function makeOrder(lines: { sku: string; qty: number }[]): OutgoingOrder {
  return addOutgoing({
    salesNo: 'ALLOC', source: 'Manual', warehouseId: WH, warehouseName: WH_NAME,
    skuQty: lines.length, orderQty: lines.reduce((s, l) => s + l.qty, 0), shippedQty: 0,
    status: 'pending', dueDate: '2026-08-01',
    lines: lines.map((l) => ({ sku: l.sku, productName: 'T', desc: '', img: '', unit: 'Unit', qty: l.qty })),
  })
}
/** A picking line for (order, sku) with an explicit qty (partial). */
function line(o: OutgoingOrder, sku: string, qty: number): PickingLine {
  const base = buildPickingLines([o.id], [o.salesNo]).find((l) => l.sku === sku)!
  return { ...base, qty }
}
/** Build a (possibly partial / shared / multi-SKU) picking task from explicit lines. */
function mkTask(lines: PickingLine[]) {
  const orderIds = [...new Set(lines.map((l) => l.orderId))]
  const salesNos = orderIds.map((id) => outgoingOrders.find((o) => o.id === id)!.salesNo)
  return addPickingTask({
    salesOrderIds: orderIds, salesNos, warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op',
    lines, skuQty: new Set(lines.map((l) => l.sku)).size, toPickQty: lines.reduce((s, l) => s + l.qty, 0),
  })
}
function taskQtyForSku(taskId: string, orderId: string, sku: string) {
  const t = getPickingTask(taskId)!
  return (t.lines ?? []).filter((l) => l.orderId === orderId && l.sku === sku).reduce((s, l) => s + l.qty, 0)
}
function cleanup(...os: OutgoingOrder[]) {
  for (const o of os) {
    const c = outgoingOrders.find((x) => x.id === o.id)
    if (c && c.status !== 'canceled' && (c.shippedQty ?? 0) === 0) cancelOutboundOrder(o.id)
    releaseReservedForCancelledOrder(o.id)
  }
}

describe('D7 allocation — AC#1 trigger', () => {
  it('single pending task → direct reduction, no allocation step needed', () => {
    const o = makeOrder([{ sku: A, qty: 5 }])
    const pt = mkTask([line(o, A, 5)])
    expect(editOutboundOrder(o.id, [{ sku: A, qty: 3 }]).ok).toBe(true)
    expect(taskQtyForSku(pt.id, o.id, A)).toBe(3)  // task reduced
    expect(orderQty(o.id)).toBe(3)
    expect(resFor(o.id, A)).toBe(3)
    cleanup(o)
  })
})

describe('D7 allocation — AC#3 default proposal (drain smallest first)', () => {
  it('3/2/5 remove 4 → P2 emptied+cancelled, P1→1, P3 untouched', () => {
    const o = makeOrder([{ sku: A, qty: 10 }])
    const p1 = mkTask([line(o, A, 3)]), p2 = mkTask([line(o, A, 2)]), p3 = mkTask([line(o, A, 5)])

    // proposal preview matches PRD example
    const prop = proposeSkuReduction(o.id, A, 4)
    expect(prop.exceedsRemovable).toBe(false)
    const byId = Object.fromEntries(prop.taskReductions.map((t) => [t.taskId, t.reduceBy]))
    expect(byId[p2.id]).toBe(2)  // smallest drained first
    expect(byId[p1.id]).toBe(2)
    expect(byId[p3.id]).toBeUndefined() // untouched (not in the list)

    expect(editOutboundOrder(o.id, [{ sku: A, qty: 6 }]).ok).toBe(true)
    expect(getPickingTask(p2.id)!.status).toBe('canceled') // AC#5 emptied → auto-cancel
    expect(taskQtyForSku(p1.id, o.id, A)).toBe(1)          // 3 → 1
    expect(taskQtyForSku(p3.id, o.id, A)).toBe(5)          // untouched
    expect(orderQty(o.id)).toBe(6)
    expect(resFor(o.id, A)).toBe(6)                        // released 4
    cleanup(o)
  })
})

describe('D7 allocation — AC#4 user override', () => {
  it('override: take all 4 from P3 → P1 & P2 intact', () => {
    const o = makeOrder([{ sku: A, qty: 10 }])
    const p1 = mkTask([line(o, A, 3)]), p2 = mkTask([line(o, A, 2)]), p3 = mkTask([line(o, A, 5)])
    const res = editOutboundOrder(o.id, [{ sku: A, qty: 6 }], undefined, { [A]: [{ taskId: p3.id, reduceBy: 4 }] })
    expect(res.ok).toBe(true)
    expect(taskQtyForSku(p1.id, o.id, A)).toBe(3)  // intact
    expect(taskQtyForSku(p2.id, o.id, A)).toBe(2)  // intact
    expect(taskQtyForSku(p3.id, o.id, A)).toBe(1)  // 5 → 1
    expect(orderQty(o.id)).toBe(6)
    cleanup(o)
  })

  it('override rejected when the per-task reductions don’t sum to N (no partial apply)', () => {
    const o = makeOrder([{ sku: A, qty: 10 }])
    const p1 = mkTask([line(o, A, 3)]); mkTask([line(o, A, 2)]); mkTask([line(o, A, 5)])
    const res = editOutboundOrder(o.id, [{ sku: A, qty: 6 }], undefined, { [A]: [{ taskId: p1.id, reduceBy: 2 }] }) // sums to 2, need 4
    expect(res.ok).toBe(false); if (!res.ok) expect(res.reason).toBe('INVALID_ALLOCATION')
    expect(orderQty(o.id)).toBe(10); expect(taskQtyForSku(p1.id, o.id, A)).toBe(3) // unchanged
    cleanup(o)
  })

  it('override rejected when a task reduction exceeds that task’s qty', () => {
    const o = makeOrder([{ sku: A, qty: 10 }])
    const p1 = mkTask([line(o, A, 3)]); mkTask([line(o, A, 2)]); mkTask([line(o, A, 5)])
    const res = editOutboundOrder(o.id, [{ sku: A, qty: 6 }], undefined, { [A]: [{ taskId: p1.id, reduceBy: 4 }] }) // p1 only has 3
    expect(res.ok).toBe(false); if (!res.ok) expect(res.reason).toBe('INVALID_ALLOCATION')
    cleanup(o)
  })
})

describe('D7 allocation — AC#2 removable cap (pending vs started)', () => {
  it('reduction beyond (pending + unassigned) is rejected with locked/removable info', () => {
    const o = makeOrder([{ sku: A, qty: 10 }])
    mkTask([line(o, A, 3)])                       // P1 pending = 3
    const started = mkTask([line(o, A, 5)]); startPicking(started.id) // 5 locked
    // order 10, locked 5, pending 3, unassigned 2 → removable 5
    const res = editOutboundOrder(o.id, [{ sku: A, qty: 4 }]) // reduce 6 > removable 5
    expect(res.ok).toBe(false)
    if (!res.ok) { expect(res.reason).toBe('REDUCTION_EXCEEDS_REMOVABLE'); expect(res.locked).toBe(5); expect(res.removable).toBe(5) }
    expect(orderQty(o.id)).toBe(10) // unchanged
    cleanup(o)
  })

  it('reduction exactly at removable (unassigned first, then pending) succeeds; started task untouched', () => {
    const o = makeOrder([{ sku: A, qty: 10 }])
    const p1 = mkTask([line(o, A, 3)])
    const started = mkTask([line(o, A, 5)]); startPicking(started.id)
    // reduce to 5 → N=5 = removable; drains unassigned 2 + P1 (3→0, cancel)
    expect(editOutboundOrder(o.id, [{ sku: A, qty: 5 }]).ok).toBe(true)
    expect(getPickingTask(p1.id)!.status).toBe('canceled') // P1 emptied
    expect(taskQtyForSku(started.id, o.id, A)).toBe(5)     // started task untouched
    expect(orderQty(o.id)).toBe(5)
    cleanup(o)
  })
})

describe('D7 allocation — AC#5 auto-cancel vs keep', () => {
  it('emptied pending task with ANOTHER SKU is kept — only the SKU line is removed', () => {
    const o = makeOrder([{ sku: A, qty: 3 }, { sku: B, qty: 2 }])
    const pt = mkTask([line(o, A, 3), line(o, B, 2)]) // one task, two SKUs
    expect(editOutboundOrder(o.id, [{ sku: B, qty: 2 }]).ok).toBe(true) // drop A entirely
    expect(getPickingTask(pt.id)!.status).toBe('open')        // NOT cancelled (still has B)
    expect(taskQtyForSku(pt.id, o.id, A)).toBe(0)             // A line gone
    expect(taskQtyForSku(pt.id, o.id, B)).toBe(2)             // B intact
    cleanup(o)
  })

  it('multi-ORDER shared pending task: reducing one order’s line keeps the task for the other', () => {
    const o1 = makeOrder([{ sku: A, qty: 3 }, { sku: B, qty: 1 }])
    const o2 = makeOrder([{ sku: A, qty: 2 }])
    const pt = mkTask([line(o1, A, 3), line(o2, A, 2)]) // shared: o1::A=3, o2::A=2
    expect(editOutboundOrder(o1.id, [{ sku: B, qty: 1 }]).ok).toBe(true) // o1 drops A
    const t = getPickingTask(pt.id)!
    expect(t.status).toBe('open')                    // task kept for o2
    expect(taskQtyForSku(pt.id, o1.id, A)).toBe(0)   // o1's A line gone
    expect(taskQtyForSku(pt.id, o2.id, A)).toBe(2)   // o2's A line intact
    expect(t.salesOrderIds).toEqual([o2.id])         // o1 dropped from the task
    cleanup(o1, o2)
  })
})

describe('D7 allocation — unassigned qty', () => {
  it('reduces UNASSIGNED (not-on-a-task) qty first, before touching a pending task', () => {
    const o = makeOrder([{ sku: A, qty: 10 }])
    const pt = mkTask([line(o, A, 4)]) // only 4 on a task; 6 unassigned
    expect(editOutboundOrder(o.id, [{ sku: A, qty: 3 }]).ok).toBe(true) // reduce 7: 6 unassigned + 1 from task
    expect(taskQtyForSku(pt.id, o.id, A)).toBe(3) // 4 → 3
    expect(orderQty(o.id)).toBe(3)
    expect(resFor(o.id, A)).toBe(3)
    cleanup(o)
  })
})
