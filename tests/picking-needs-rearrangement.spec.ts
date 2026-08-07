/**
 * D7 AC#8–#10 — touched Open picking tasks freeze into "Needs Re-arrangement" after
 * an outbound qty reduction, blocking Start/Continue picking until a Warehouse
 * Manager clears it. Builds on the AC#1–#7 allocation fixtures in
 * outbound-edit-order-allocation.spec.ts.
 */
import { describe, it, expect } from 'vitest'
import { addOutgoing, releaseReservedForCancelledOrder, outgoingOrders, type OutgoingOrder } from '~/data/outgoing'
import { editOutboundOrder, cancelOutboundOrder } from '~/data/outboundSync'
import {
  addPickingTask, buildPickingLines, getPickingTask, startPicking, isPickingFrozen,
  clearPickingRearrangement, type PickingLine,
} from '~/data/pickingTasks'

const WH = 'wh-006', WH_NAME = 'Gudang Makassar Selatan', A = '3004'

function makeOrder(lines: { sku: string; qty: number }[]): OutgoingOrder {
  return addOutgoing({
    salesNo: 'REARR', source: 'Manual', warehouseId: WH, warehouseName: WH_NAME,
    skuQty: lines.length, orderQty: lines.reduce((s, l) => s + l.qty, 0), shippedQty: 0,
    status: 'pending', dueDate: '2026-08-01',
    lines: lines.map((l) => ({ sku: l.sku, productName: 'T', desc: '', img: '', unit: 'Unit', qty: l.qty })),
  })
}
function line(o: OutgoingOrder, sku: string, qty: number): PickingLine {
  const base = buildPickingLines([o.id], [o.salesNo]).find((l) => l.sku === sku)!
  return { ...base, qty }
}
function mkTask(lines: PickingLine[]) {
  const orderIds = [...new Set(lines.map((l) => l.orderId))]
  const salesNos = orderIds.map((id) => outgoingOrders.find((o) => o.id === id)!.salesNo)
  return addPickingTask({
    salesOrderIds: orderIds, salesNos, warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op',
    lines, skuQty: new Set(lines.map((l) => l.sku)).size, toPickQty: lines.reduce((s, l) => s + l.qty, 0),
  })
}
function cleanup(...os: OutgoingOrder[]) {
  for (const o of os) {
    const c = outgoingOrders.find((x) => x.id === o.id)
    if (c && c.status !== 'canceled' && (c.shippedQty ?? 0) === 0) cancelOutboundOrder(o.id)
    releaseReservedForCancelledOrder(o.id)
  }
}

describe('D7 AC#8 — touched Open tasks freeze, untouched ones don\'t', () => {
  it('3/2/5 remove 4: survivor P1 freezes, cancelled P2 doesn\'t matter, untouched P3 stays startable', () => {
    const o = makeOrder([{ sku: A, qty: 10 }])
    const p1 = mkTask([line(o, A, 3)]), p2 = mkTask([line(o, A, 2)]), p3 = mkTask([line(o, A, 5)])
    expect(editOutboundOrder(o.id, [{ sku: A, qty: 6 }]).ok).toBe(true)

    expect(getPickingTask(p1.id)!.status).toBe('open')
    expect(isPickingFrozen(getPickingTask(p1.id)!)).toBe(true) // survivor (3→1) freezes

    expect(getPickingTask(p2.id)!.status).toBe('canceled')      // emptied → auto-cancelled
    expect(isPickingFrozen(getPickingTask(p2.id)!)).toBe(false)

    expect(getPickingTask(p3.id)!.status).toBe('open')
    expect(isPickingFrozen(getPickingTask(p3.id)!)).toBe(false) // never touched → not frozen
    cleanup(o)
  })

  it('single-task direct reduction (AC#1, no allocation step) still freezes the sole task', () => {
    const o = makeOrder([{ sku: A, qty: 5 }])
    const pt = mkTask([line(o, A, 5)])
    expect(editOutboundOrder(o.id, [{ sku: A, qty: 3 }]).ok).toBe(true)
    expect(getPickingTask(pt.id)!.status).toBe('open')
    expect(isPickingFrozen(getPickingTask(pt.id)!)).toBe(true)
    cleanup(o)
  })

  it('a task emptied entirely by the reduction never freezes (it\'s cancelled, not startable anyway)', () => {
    const o = makeOrder([{ sku: A, qty: 5 }])
    const pt = mkTask([line(o, A, 5)])
    expect(editOutboundOrder(o.id, [{ sku: A, qty: 0 }]).ok).toBe(true)
    const t = getPickingTask(pt.id)!
    expect(t.status).toBe('canceled')
    expect(isPickingFrozen(t)).toBe(false)
    cleanup(o)
  })
})

describe('D7 AC#9 — Warehouse Manager clears the freeze', () => {
  it('clearPickingRearrangement resets the flag and stamps actor + timestamp; task is startable again', () => {
    const o = makeOrder([{ sku: A, qty: 5 }])
    const pt = mkTask([line(o, A, 5)])
    editOutboundOrder(o.id, [{ sku: A, qty: 3 }])
    expect(isPickingFrozen(getPickingTask(pt.id)!)).toBe(true)

    clearPickingRearrangement(pt.id, 'Rizal Candra')
    const cleared = getPickingTask(pt.id)!
    expect(isPickingFrozen(cleared)).toBe(false)
    expect(cleared.rearrangementClearedBy).toBe('Rizal Candra')
    expect(cleared.rearrangementClearedDate).toBeTruthy()
    // Startable again — nothing else on the task blocks it.
    expect(() => startPicking(pt.id)).not.toThrow()
    cleanup(o)
  })

  it('clearing an already-unfrozen task is a harmless no-op', () => {
    const o = makeOrder([{ sku: A, qty: 5 }])
    const pt = mkTask([line(o, A, 5)])
    clearPickingRearrangement(pt.id)
    expect(getPickingTask(pt.id)!.rearrangementClearedBy).toBeUndefined()
    cleanup(o)
  })
})

describe('D7 AC#10 — freeze + claim interaction', () => {
  it('freezing only flips the flag — the task\'s remaining lines/reservation are untouched', () => {
    const o = makeOrder([{ sku: A, qty: 10 }])
    const p1 = mkTask([line(o, A, 3)]), p2 = mkTask([line(o, A, 2)]), p3 = mkTask([line(o, A, 5)])
    editOutboundOrder(o.id, [{ sku: A, qty: 6 }]) // drains P2 to 0 (cancel), P1 3→1

    const frozen = getPickingTask(p1.id)!
    expect(isPickingFrozen(frozen)).toBe(true)
    // Its remaining line (qty 1) is still there — freezing didn't return it to any pool.
    expect((frozen.lines ?? []).filter((l) => l.orderId === o.id && l.sku === A).reduce((s, l) => s + l.qty, 0)).toBe(1)
    // Only the auto-cancelled task actually emptied its lines.
    expect((getPickingTask(p2.id)!.lines ?? []).length).toBe(0)
    // The untouched task is fully intact too.
    expect((getPickingTask(p3.id)!.lines ?? []).filter((l) => l.sku === A).reduce((s, l) => s + l.qty, 0)).toBe(5)
    cleanup(o)
  })
})
