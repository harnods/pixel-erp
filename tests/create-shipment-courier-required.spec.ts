// @vitest-environment happy-dom
/**
 * Creating a shipment requires a courier on every delivery; tracking no. stays
 * optional. Non-marketplace deliveries start without a courier, so "Save" must be
 * blocked until one is picked — a delivery WITH a courier (and no tracking no.)
 * passes validation.
 *
 * (HandoverToCourierPage and NewShipmentPage share the same validate() rule; this
 * covers it via HandoverToCourierPage, which sources its rows from a deliveryIds
 * query so no scanning is needed to populate the table.)
 */
import { describe, it, expect, vi } from 'vitest'
import { computed } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import HandoverToCourierPage from '~/components/pages/HandoverToCourierPage.vue'
import { addOutgoing } from '~/data/outgoing'
import { addPickingTask, startPicking, endPicking } from '~/data/pickingTasks'
import { addPackingTask, startPacking, endPacking, getPackingTask } from '~/data/packingTasks'
import { addDeliveryTaskFromPackingTasks, getDeliveryTask } from '~/data/deliveryTasks'
import '~/data/outgoing'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
vi.stubGlobal('computed', computed)
// Scope the signed-in user to wh-006 so the assignee auto-fills — that leaves the
// courier as the ONLY thing standing between the operator and a valid Save.
vi.stubGlobal('useWarehouseContext', () => ({
  activeWarehouse: computed(() => ({ id: 'wh-006', name: 'Gudang Makassar Selatan' })),
  hasWarehouseContext: computed(() => true),
}))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const WH = 'wh-006', WH_NAME = 'Gudang Makassar Selatan'
let seq = 0

function readyDelivery(courier: string) {
  seq++
  const o = addOutgoing({
    salesNo: `Courier Req ${seq}`, source: 'Manual', warehouseId: WH, warehouseName: WH_NAME,
    skuQty: 1, orderQty: 1, shippedQty: 0, status: 'open', dueDate: '2026-08-01',
    lines: [{ sku: '3004', productName: 'Coffee Scale 2kg / 0.1g', desc: '', img: '', unit: 'Unit', qty: 1 }],
  })
  const pick = addPickingTask({ salesOrderIds: [o.id], salesNos: [o.salesNo], warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
  startPicking(pick.id); endPicking(pick.id, { [`${o.id}::3004`]: 1 })
  const pack = addPackingTask({ salesOrderId: o.id, salesNo: o.salesNo, pickingTaskId: pick.id, pickingTaskNo: pick.taskNo, warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
  startPacking(pack.id); endPacking(pack.id, { [`${o.id}::3004`]: 1 })
  return addDeliveryTaskFromPackingTasks([getPackingTask(pack.id)!], { assignee: 'Op', courier })
}

function mountPage(deliveryIds: string) {
  vi.stubGlobal('useRoute', () => ({ query: { deliveryIds } }))
  return mount(HandoverToCourierPage)
}
const saveBtn = (w: ReturnType<typeof mount>) => w.findAll('button').find(b => /^Save/.test(b.text().trim()))!

describe('Create shipment — courier is required, tracking no. is optional', () => {
  it('blocks Save when a delivery has no courier, and flags the courier cell', async () => {
    const del = readyDelivery('') // non-marketplace, no courier yet
    const wrapper = mountPage(del.id)
    await flushPromises()

    await saveBtn(wrapper).trigger('click')
    await flushPromises()

    // Not handed over — still ready to ship, no shipment number assigned.
    expect(getDeliveryTask(del.id)!.status).toBe('ready to ship')
    expect(getDeliveryTask(del.id)!.shipmentNo).toBeUndefined()
    // The courier cell is flagged as the error.
    expect(wrapper.find('.ho-td--input--error').exists()).toBe(true)
    wrapper.unmount()
  })

  it('passes validation with a courier set and NO tracking no. (tracking optional)', async () => {
    const del = readyDelivery('JNE') // courier set, tracking left empty
    const wrapper = mountPage(del.id)
    await flushPromises()

    const btn = saveBtn(wrapper)
    await btn.trigger('click')
    await flushPromises()

    // Courier rule satisfied → no courier error, and Save proceeded (entered the
    // saving state, disabling the button) rather than being blocked.
    expect(wrapper.find('.ho-td--input--error').exists()).toBe(false)
    expect((btn.element as HTMLButtonElement).disabled).toBe(true)
    wrapper.unmount()
  })
})
