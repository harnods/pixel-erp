// @vitest-environment happy-dom
/**
 * D5 AC#1 (#5): a Ready-to-Ship task that already carries a courier from the order
 * — including a marketplace order whose channel pre-assigned it — must be
 * RE-ROUTABLE by the shipper while creating the shipment (before a shipment doc
 * exists). It only locks once the doc is created (Out for Delivery), which is a
 * separate read-only screen.
 *
 * This asserts the courier column renders the editable picker (.ho-courier-trigger)
 * for a marketplace delivery, while its tracking no. stays channel-locked
 * (disabled). Before the fix the marketplace courier was a disabled input.
 */
import { describe, it, expect, vi } from 'vitest'
import { computed } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import HandoverToCourierPage from '~/components/pages/HandoverToCourierPage.vue'
import { addOutgoing, isMarketplaceOrder, outgoingOrders } from '~/data/outgoing'
import { addPickingTask, startPicking, endPicking } from '~/data/pickingTasks'
import { addPackingTask, startPacking, endPacking, getPackingTask } from '~/data/packingTasks'
import { addDeliveryTaskFromPackingTasks } from '~/data/deliveryTasks'
import '~/data/outgoing'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
vi.stubGlobal('computed', computed)
vi.stubGlobal('useWarehouseContext', () => ({
  activeWarehouse: computed(() => ({ id: 'wh-006', name: 'Gudang Makassar Selatan' })),
  hasWarehouseContext: computed(() => true),
}))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const WH = 'wh-006', WH_NAME = 'Gudang Makassar Selatan'
let seq = 0

// A marketplace ready-to-ship delivery: order source is "{Marketplace}: {store}",
// and the channel already assigned a courier + tracking no.
function marketplaceReadyDelivery(courier: string, trackingNo: string) {
  seq++
  const o = addOutgoing({
    salesNo: `MP Req ${seq}`, source: 'Shopee: Central Perk', warehouseId: WH, warehouseName: WH_NAME,
    skuQty: 1, orderQty: 1, shippedQty: 0, status: 'open', dueDate: '2026-08-01',
    lines: [{ sku: '3004', productName: 'Coffee Scale 2kg / 0.1g', desc: '', img: '', unit: 'Unit', qty: 1 }],
  })
  const pick = addPickingTask({ salesOrderIds: [o.id], salesNos: [o.salesNo], warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
  startPicking(pick.id); endPicking(pick.id, { [`${o.id}::3004`]: 1 })
  const pack = addPackingTask({ salesOrderId: o.id, salesNo: o.salesNo, pickingTaskId: pick.id, pickingTaskNo: pick.taskNo, warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
  startPacking(pack.id); endPacking(pack.id, { [`${o.id}::3004`]: 1 })
  return addDeliveryTaskFromPackingTasks([getPackingTask(pack.id)!], { assignee: 'Op', courier, trackingNo })
}

function mountPage(deliveryIds: string) {
  vi.stubGlobal('useRoute', () => ({ query: { deliveryIds } }))
  return mount(HandoverToCourierPage)
}

describe('Handover — marketplace courier re-route + Others fallback (D5 AC#1 #5)', () => {
  it('recognised channel courier: editable picker, channel AWB stays locked', async () => {
    const del = marketplaceReadyDelivery('JNE REG', 'TRK00099') // JNE REG is in the master
    expect(isMarketplaceOrder(outgoingOrders.find(o => o.id === del.salesOrderId))).toBe(true)

    const wrapper = mountPage(del.id)
    await flushPromises()

    // Courier is the editable picker (was a disabled input before the fix), value = the channel courier.
    expect(wrapper.find('.ho-courier-trigger').exists()).toBe(true)
    expect((wrapper.find('.ho-courier-input').element as HTMLInputElement).value).toBe('JNE REG')
    // Tracking stays locked to the channel-issued AWB while the recognised courier is selected.
    const trk = wrapper.find('.ho-text-input').element as HTMLInputElement
    expect(trk.value).toBe('TRK00099')
    expect(trk.disabled).toBe(true)

    wrapper.unmount()
  })

  it('unrecognised channel courier ("SPX Extra") → Others (Lainnya), AWB editable + cleared', async () => {
    // Shopee sends a courier WMS doesn't have in its master.
    const del = marketplaceReadyDelivery('SPX Extra', 'TRK00088')
    const wrapper = mountPage(del.id)
    await flushPromises()

    // Falls into "Lainnya" (Others) for the shipper to re-route.
    expect((wrapper.find('.ho-courier-input').element as HTMLInputElement).value).toBe('Lainnya')
    // The channel AWB no longer applies: the tracking field is editable and cleared.
    const trk = wrapper.find('.ho-text-input').element as HTMLInputElement
    expect(trk.disabled).toBe(false)
    expect(trk.value).toBe('')

    wrapper.unmount()
  })
})
