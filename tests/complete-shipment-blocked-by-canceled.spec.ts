// @vitest-environment happy-dom
/**
 * A shipment that still has a CANCELED delivery attached (needsCancelAck) cannot be
 * completed — the operator must acknowledge (detach) the canceled order first, so
 * completion posts only what actually shipped. The "Complete shipment" button on
 * Shipment details stays clickable but blocks navigation (no-disabled-buttons rule)
 * with an error toast until the cancel is acknowledged.
 */
import { describe, it, expect, vi } from 'vitest'
import { computed } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import ShipmentDetailsPage from '~/components/pages/ShipmentDetailsPage.vue'
import { addOutgoing } from '~/data/outgoing'
import { cancelOutboundOrder } from '~/data/outboundSync'
import { addPickingTask, startPicking, endPicking } from '~/data/pickingTasks'
import { addPackingTask, startPacking, endPacking, getPackingTask } from '~/data/packingTasks'
import { addDeliveryTaskFromPackingTasks, handoverToCourierBulk, completeShipment, acknowledgeCanceledShipment, getShipment } from '~/data/deliveryTasks'
import '~/data/outgoing'

const push = vi.fn()
vi.stubGlobal('useRouter', () => ({ push }))
vi.stubGlobal('computed', computed) // ErpStatusBadge relies on the Nuxt auto-import
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const WH = 'wh-006', WH_NAME = 'Gudang Makassar Selatan', SKU = '3004'
let n = 0
function readyDelivery() {
  n++
  const o = addOutgoing({ salesNo: `ShipCancel ${n}`, source: 'Manual', warehouseId: WH, warehouseName: WH_NAME, skuQty: 1, orderQty: 1, shippedQty: 0, status: 'open', dueDate: '2026-08-01', lines: [{ sku: SKU, productName: 'Coffee Scale', desc: '', img: '', unit: 'Unit', qty: 1 }] })
  const pk = addPickingTask({ salesOrderIds: [o.id], salesNos: [o.salesNo], warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
  startPicking(pk.id); endPicking(pk.id, { [`${o.id}::${SKU}`]: 1 })
  const pa = addPackingTask({ salesOrderId: o.id, salesNo: o.salesNo, pickingTaskId: pk.id, pickingTaskNo: pk.taskNo, warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
  startPacking(pa.id); endPacking(pa.id, { [`${o.id}::${SKU}`]: 1 })
  return { order: o, del: addDeliveryTaskFromPackingTasks([getPackingTask(pa.id)!], { assignee: 'Op', courier: 'JNE' }) }
}
const completeBtn = (w: ReturnType<typeof mount>) => w.findAll('button').find(b => b.text().trim() === 'Complete shipment')

describe('Complete shipment — blocked while a canceled delivery is unacknowledged', () => {
  it('does NOT navigate to the complete form when the shipment needsCancelAck', async () => {
    const A = readyDelivery(), B = readyDelivery() // same courier → one shipment
    const [res] = handoverToCourierBulk([A.del.id, B.del.id], { assignee: 'Op', transactionDate: '2026-07-28' })
    const seq = res!.shipmentSeq
    cancelOutboundOrder(B.order.id, 'cancel B') // → shipment.needsCancelAck = true

    push.mockClear()
    const wrapper = mount(ShipmentDetailsPage, { props: { orderId: seq } })
    await flushPromises()

    await completeBtn(wrapper)!.trigger('click')
    await flushPromises()

    // Blocked — never navigated to the complete form.
    expect(push.mock.calls.some(c => String(c[0]).includes('/complete'))).toBe(false)
    wrapper.unmount()
  })

  it('navigates to the complete form when there is no unacknowledged cancel', async () => {
    const A = readyDelivery()
    const [res] = handoverToCourierBulk([A.del.id], { assignee: 'Op', transactionDate: '2026-07-28' })
    const seq = res!.shipmentSeq

    push.mockClear()
    const wrapper = mount(ShipmentDetailsPage, { props: { orderId: seq } })
    await flushPromises()

    await completeBtn(wrapper)!.trigger('click')
    await flushPromises()

    expect(push.mock.calls.some(c => String(c[0]) === `/outbound-delivery/shipment/${seq}/complete`)).toBe(true)
    wrapper.unmount()
  })

  // Data-layer guard — the real bug: completeShipment itself let a needs-ack
  // shipment through, so ANY path that reached it (the old Shipments-index modal,
  // a direct URL) completed successfully despite the unacknowledged cancel. The UI
  // guard on Shipment details alone was not enough. This test would have caught it.
  it('completeShipment refuses while a canceled delivery is still attached, then succeeds once acknowledged', () => {
    const A = readyDelivery(), B = readyDelivery() // same courier → one shipment
    const [res] = handoverToCourierBulk([A.del.id, B.del.id], { assignee: 'Op', transactionDate: '2026-07-28' })
    const seq = res!.shipmentSeq
    cancelOutboundOrder(B.order.id, 'cancel B') // → shipment.needsCancelAck = true

    // Blocked at the data layer — nothing posts, the live delivery stays open.
    const blocked = completeShipment(seq, { receivedDate: '2026-07-28', receivedBy: 'Rina' })
    expect(blocked.ok).toBe(false)
    expect(blocked.reason).toBe('needs-cancel-ack')
    expect(getShipment(seq)!.status).toBe('open')
    expect(getShipment(seq)!.deliveries.find(d => d.id === A.del.id)!.shipmentStatus).not.toBe('completed')

    // Acknowledge (detach the canceled order) → now completion is allowed.
    acknowledgeCanceledShipment(seq)
    const okRes = completeShipment(seq, { receivedDate: '2026-07-28', receivedBy: 'Rina' })
    expect(okRes.ok).toBe(true)
    expect(getShipment(seq)!.status).toBe('completed')
  })
})
