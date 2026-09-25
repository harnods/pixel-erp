/**
 * A "Create shipment" / "Handover to courier" batch can mix deliveries bound for
 * DIFFERENT couriers (e.g. 2 packages via JNE, 1 via the internal fleet). A
 * shipment doc travels with one courier at a time, so `handoverToCourierBulk`
 * must split the batch into one shipment per distinct courier — not lump every
 * selected delivery under a single shared shipment no.
 */
import { describe, it, expect } from 'vitest'
import { addOutgoing } from '~/data/outgoing'
import { addPickingTask, startPicking, endPicking } from '~/data/pickingTasks'
import { addPackingTask, startPacking, endPacking, getPackingTask } from '~/data/packingTasks'
import { addDeliveryTaskFromPackingTasks, handoverToCourierBulk, getDeliveryTask } from '~/data/deliveryTasks'

const WAREHOUSE_ID = 'wh-006'
const WAREHOUSE_NAME = 'Gudang Makassar Selatan'

function makeReadyToShipDelivery(sku: string, productName: string, unit: string, qty: number, courier: string) {
  const order = addOutgoing({
    salesNo: `Test Courier Split Order ${sku}-${courier}`, source: 'Manual',
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
    skuQty: 1, orderQty: qty, shippedQty: 0, status: 'open', dueDate: '2026-08-01',
    lines: [{ sku, productName, desc: '', img: '', unit, qty }],
  })
  const pick = addPickingTask({
    salesOrderIds: [order.id], salesNos: [order.salesNo],
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
  })
  startPicking(pick.id)
  endPicking(pick.id, { [`${order.id}::${sku}`]: qty })
  const pack = addPackingTask({
    salesOrderId: order.id, salesNo: order.salesNo,
    pickingTaskId: pick.id, pickingTaskNo: pick.taskNo,
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
  })
  startPacking(pack.id)
  endPacking(pack.id, { [`${order.id}::${sku}`]: qty })
  return addDeliveryTaskFromPackingTasks([getPackingTask(pack.id)!], { assignee: 'Test Operator', courier })
}

describe('handoverToCourierBulk — splits a mixed-courier batch into separate shipments', () => {
  it('creates one shipment per distinct courier, not one shipment for the whole batch', () => {
    const jne1 = makeReadyToShipDelivery('3004', 'Coffee Scale 2kg / 0.1g', 'Unit', 1, 'JNE')
    const jne2 = makeReadyToShipDelivery('3004', 'Coffee Scale 2kg / 0.1g', 'Unit', 1, 'JNE')
    const internal = makeReadyToShipDelivery('3004', 'Coffee Scale 2kg / 0.1g', 'Unit', 1, 'Internal fleet')

    const results = handoverToCourierBulk([jne1.id, jne2.id, internal.id], {
      assignee: 'Test Operator',
      transactionDate: '2026-07-13',
    })

    expect(results).toHaveLength(2)
    expect(new Set(results.map((r) => r.shipmentNo)).size).toBe(2)

    const jneShipment = results.find((r) => r.courier === 'JNE')!
    const internalShipment = results.find((r) => r.courier === 'Internal fleet')!
    expect(jneShipment).toBeDefined()
    expect(internalShipment).toBeDefined()
    expect(jneShipment.shippedCount).toBe(2)
    expect(internalShipment.shippedCount).toBe(1)
    expect(jneShipment.shipmentNo).not.toBe(internalShipment.shipmentNo)

    // The actual delivery tasks agree with the returned grouping.
    expect(getDeliveryTask(jne1.id)!.shipmentNo).toBe(jneShipment.shipmentNo)
    expect(getDeliveryTask(jne2.id)!.shipmentNo).toBe(jneShipment.shipmentNo)
    expect(getDeliveryTask(internal.id)!.shipmentNo).toBe(internalShipment.shipmentNo)
  })

  it('keeps a single-courier batch as one shipment', () => {
    const a = makeReadyToShipDelivery('3004', 'Coffee Scale 2kg / 0.1g', 'Unit', 1, 'SiCepat')
    const b = makeReadyToShipDelivery('3004', 'Coffee Scale 2kg / 0.1g', 'Unit', 1, 'SiCepat')

    const results = handoverToCourierBulk([a.id, b.id], {
      assignee: 'Test Operator',
      transactionDate: '2026-07-13',
    })

    expect(results).toHaveLength(1)
    expect(results[0]!.shippedCount).toBe(2)
    expect(getDeliveryTask(a.id)!.shipmentNo).toBe(getDeliveryTask(b.id)!.shipmentNo)
  })
})

/**
 * The seeded demo for this flow: five ready-to-ship packages sitting in ONE
 * warehouse under THREE couriers, so the New shipment screen can be walked as the
 * operator actually works — scan whatever is in front of you into one draft, save
 * once, get one document per courier. Guarding the seed as well as the mechanism,
 * because the demo is only useful if the mix is actually there to scan.
 */
describe('seeded demo: one warehouse, mixed couriers, one draft', () => {
  it('ships five ready-to-ship packages that split 2 / 2 / 1 on save', async () => {
    await import('~/data/seedCoverage')
    const { deliveryTasks } = await import('~/data/deliveryTasks')

    const demo = deliveryTasks.filter(t => t.salesNo.startsWith('SHIP-SPLIT-'))
    expect(demo, 'the split demo should be seeded').toHaveLength(5)
    expect(demo.every(t => t.status === 'ready to ship')).toBe(true)
    // One warehouse — a shipment batch never spans two.
    expect(new Set(demo.map(t => t.warehouseId)).size).toBe(1)
    // …but three couriers, which is what forces the split.
    expect(new Set(demo.map(t => t.courier)).size).toBe(3)

    const results = handoverToCourierBulk(demo.map(t => t.id), {
      assignee: 'Test Operator',
      transactionDate: '2026-09-18',
    })

    expect(results).toHaveLength(3)
    expect(results.map(r => r.shippedCount).sort()).toEqual([1, 2, 2])
    // Every document is one courier's, and no two share a number.
    expect(new Set(results.map(r => r.shipmentNo)).size).toBe(3)
    for (const r of results) {
      const inDoc = demo.filter(t => t.shipmentNo === r.shipmentNo)
      expect(new Set(inDoc.map(t => t.courier)).size, r.courier).toBe(1)
    }
  })
})
