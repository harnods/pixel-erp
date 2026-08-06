/**
 * Create shipping document — the "Scan Barcode" resolves a ready-to-ship delivery
 * by ANY of the three codes an operator can scan on a packed order:
 *   1. the resi / tracking no.,
 *   2. the packing no.,
 *   3. the order no. (both the outbound OUT- number and the sales order no.).
 *
 * Matching is case/whitespace-insensitive (a physical barcode carries no case)
 * and warehouse-scoped. Covers the shared data-layer finder used by both the
 * New shipment and Handover-to-courier pages (findReadyToShipByScan).
 */
import { describe, it, expect } from 'vitest'
import { addOutgoing } from '~/data/outgoing'
import { addPickingTask, startPicking, endPicking } from '~/data/pickingTasks'
import { addPackingTask, startPacking, endPacking, getPackingTask } from '~/data/packingTasks'
import {
  addDeliveryTaskFromPackingTasks,
  findReadyToShipByScan,
  findReadyToShipByScanAnyWarehouse,
} from '~/data/deliveryTasks'
import '~/data/outgoing'

const WH = 'wh-006', WH_NAME = 'Gudang Makassar Selatan'
let seq = 0

/** Build a real ready-to-ship delivery (order → pick → pack → delivery) in WH,
 *  carrying the given tracking no. Returns the outbound order and the delivery. */
function readyDelivery(trackingNo: string) {
  seq++
  const order = addOutgoing({
    salesNo: `Scan SO ${seq}`, source: 'Manual', warehouseId: WH, warehouseName: WH_NAME,
    skuQty: 1, orderQty: 1, shippedQty: 0, status: 'open', dueDate: '2026-08-01',
    lines: [{ sku: '3004', productName: 'Coffee Scale 2kg / 0.1g', desc: '', img: '', unit: 'Unit', qty: 1 }],
  })
  const pick = addPickingTask({ salesOrderIds: [order.id], salesNos: [order.salesNo], warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
  startPicking(pick.id); endPicking(pick.id, { [`${order.id}::3004`]: 1 })
  const pack = addPackingTask({ salesOrderId: order.id, salesNo: order.salesNo, pickingTaskId: pick.id, pickingTaskNo: pick.taskNo, warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
  startPacking(pack.id); endPacking(pack.id, { [`${order.id}::3004`]: 1 })
  const del = addDeliveryTaskFromPackingTasks([getPackingTask(pack.id)!], { assignee: 'Op', courier: 'JNE', trackingNo })
  return { order, del }
}

describe('Create shipping document — scan by tracking / packing / order', () => {
  it('1. finds the delivery by its resi / tracking no.', () => {
    const { del } = readyDelivery('SD0009999')
    const r = findReadyToShipByScan(WH, 'SD0009999')
    expect(r?.task.id).toBe(del.id)
    expect(r?.kind).toBe('tracking')
  })

  it('2. finds the delivery by its packing no.', () => {
    const { del } = readyDelivery('SD0008888')
    const r = findReadyToShipByScan(WH, del.packingTaskNo)
    expect(r?.task.id).toBe(del.id)
    expect(r?.kind).toBe('packing')
  })

  it('3. finds the delivery by the outbound order no. AND the sales order no.', () => {
    const { order, del } = readyDelivery('SD0007777')
    const byOut = findReadyToShipByScan(WH, order.number)
    expect(byOut?.task.id).toBe(del.id)
    expect(byOut?.kind).toBe('order')
    const bySales = findReadyToShipByScan(WH, order.salesNo)
    expect(bySales?.task.id).toBe(del.id)
    expect(bySales?.kind).toBe('order')
  })

  it('matches case- and whitespace-insensitively', () => {
    const { del } = readyDelivery('SD0006666')
    const r = findReadyToShipByScan(WH, `  ${del.packingTaskNo.toLowerCase()}  `)
    expect(r?.task.id).toBe(del.id)
  })

  it('is warehouse-scoped: missed in the wrong warehouse, found ignoring warehouse', () => {
    const { del } = readyDelivery('SD0005555')
    expect(findReadyToShipByScan('wh-001', 'SD0005555')).toBeUndefined()
    const any = findReadyToShipByScanAnyWarehouse('SD0005555')
    expect(any?.task.id).toBe(del.id)
  })

  it('returns undefined for an unknown code', () => {
    readyDelivery('SD0004444')
    expect(findReadyToShipByScan(WH, 'NOPE-NOT-A-CODE')).toBeUndefined()
    expect(findReadyToShipByScanAnyWarehouse('NOPE-NOT-A-CODE')).toBeUndefined()
  })
})
