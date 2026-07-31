/**
 * Integrity guard — courier delete.
 *
 * A courier master record can only be deleted when nothing in-flight still
 * references it. `deliveriesUsingCourier(name)` counts deliveries travelling
 * under that courier name whose status is neither 'shipped' nor 'canceled'
 * (i.e. 'ready to ship' / 'out for delivery'). While at least one such
 * delivery exists, `canDeleteCourier` is false and `deleteCourierSafe` refuses
 * with a COURIER_IN_USE reason (leaving the courier untouched). A courier no
 * in-flight shipment references is deletable.
 */
import { describe, it, expect } from 'vitest'
import {
  canDeleteCourier, deleteCourierSafe, deliveriesUsingCourier,
} from '~/data/integrityGuards'
import { couriers, addCourier } from '~/data/couriers'
import { addOutgoing } from '~/data/outgoing'
import { addPickingTask, startPicking, endPicking } from '~/data/pickingTasks'
import { addPackingTask, startPacking, endPacking, getPackingTask } from '~/data/packingTasks'
import { addDeliveryTaskFromPackingTasks } from '~/data/deliveryTasks'
import '~/data/warehouseDetails'

const WH = 'wh-006'
const WH_NAME = 'Gudang Makassar Selatan'
const SKU = '3004'

let n = 0
/** A ready-to-ship delivery (via the real picking→packing→delivery pipeline)
 *  handed to `courier`, so a courier of that name has one active shipment. */
function makeReadyToShipDelivery(courier: string) {
  n++
  const order = addOutgoing({
    salesNo: `Guard Courier ${courier}-${n}`, source: 'Manual',
    warehouseId: WH, warehouseName: WH_NAME,
    skuQty: 1, orderQty: 1, shippedQty: 0, status: 'open', dueDate: '2026-08-01',
    lines: [{ sku: SKU, productName: 'Coffee Scale', desc: '', img: '', unit: 'Unit', qty: 1 }],
  })
  const pick = addPickingTask({
    salesOrderIds: [order.id], salesNos: [order.salesNo],
    warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op',
  })
  startPicking(pick.id)
  endPicking(pick.id, { [`${order.id}::${SKU}`]: 1 })
  const pack = addPackingTask({
    salesOrderId: order.id, salesNo: order.salesNo,
    pickingTaskId: pick.id, pickingTaskNo: pick.taskNo,
    warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op',
  })
  startPacking(pack.id)
  endPacking(pack.id, { [`${order.id}::${SKU}`]: 1 })
  return addDeliveryTaskFromPackingTasks([getPackingTask(pack.id)!], { assignee: 'Op', courier })
}

describe('Integrity guard — courier delete', () => {
  it('a courier with an active (ready-to-ship) delivery cannot be deleted', () => {
    const name = `Guard Courier In Use ${Date.now()}`
    addCourier(name)
    const courier = couriers.find((c) => c.name === name)!
    expect(courier).toBeTruthy()

    const delivery = makeReadyToShipDelivery(name)
    expect(delivery.status).toBe('ready to ship')
    expect(deliveriesUsingCourier(name)).toBeGreaterThanOrEqual(1)

    expect(canDeleteCourier(courier.id)).toBe(false)
    const res = deleteCourierSafe(courier.id)
    expect(res.ok).toBe(false)
    expect(res.ok === false && res.reason).toContain('COURIER_IN_USE')

    // Refused — the courier is still in the master list.
    expect(couriers.some((c) => c.id === courier.id)).toBe(true)
  })

  it('a courier with no in-flight shipment can be deleted', () => {
    const name = `Guard Courier Free ${Date.now()}`
    addCourier(name)
    const courier = couriers.find((c) => c.name === name)!
    expect(courier).toBeTruthy()
    expect(deliveriesUsingCourier(name)).toBe(0)

    expect(canDeleteCourier(courier.id)).toBe(true)
    const res = deleteCourierSafe(courier.id)
    expect(res.ok).toBe(true)

    // Actually removed from the master list.
    expect(couriers.some((c) => c.id === courier.id)).toBe(false)
  })

  it('deleting an unknown courier id is refused with NOT_FOUND', () => {
    expect(canDeleteCourier('crt-does-not-exist')).toBe(false)
    const res = deleteCourierSafe('crt-does-not-exist')
    expect(res.ok).toBe(false)
    expect(res.ok === false && res.reason).toContain('NOT_FOUND')
  })
})
