// @vitest-environment happy-dom
/**
 * Picking execution: scanning a batch/serial-tracked SKU's own barcode (not
 * yet a known batch number/serial) auto-opens the matching Manage batch /
 * Manage serial number drawer — picked qty for these lines is only ever
 * entered through that drawer, never the manual qty input.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PickItemsPage from '~/components/pages/PickItemsPage.vue'
import { addOutgoing, type OutgoingOrder } from '~/data/outgoing'
import { addPickingTask } from '~/data/pickingTasks'
// Side-effect import: reserveAllPickableOrders() runs at outgoing.ts's module top
// level, which is what actually populates stockReservations — without this,
// reserved units in seed data never get created.
import '~/data/outgoing'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const WAREHOUSE_ID = 'wh-006'
const WAREHOUSE_NAME = 'Gudang Makassar Selatan'
const BATCH_SKU = '1001'  // Green Beans Arabica Gayo Grade 1 — batch-tracked
const SERIAL_SKU = '2004' // Espresso Machine Lever Manual 1-Group — serial-tracked

function makeOrderAndTask(sku: string, qty: number): string {
  const order: OutgoingOrder = addOutgoing({
    salesNo: `Test Scan Drawer ${sku}`, source: 'Manual',
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
    skuQty: 1, orderQty: qty,
    shippedQty: 0, status: 'open', dueDate: '2026-08-01',
    lines: [{ sku, productName: sku, desc: '', img: '', unit: 'Unit', qty }],
  })
  const task = addPickingTask({
    salesOrderIds: [order.id], salesNos: [order.salesNo],
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
  })
  return task.id
}

async function scan(wrapper: ReturnType<typeof mount>, value: string) {
  const input = wrapper.find('.scan-bar-input')
  await input.setValue(value)
  await input.trigger('keydown.enter')
  await flushPromises()
}

describe('PickItemsPage — scanning a batch-tracked SKU barcode auto-opens Manage batch', () => {
  it('opens the Manage batch drawer for the scanned SKU', async () => {
    const taskId = makeOrderAndTask(BATCH_SKU, 1)
    const wrapper = mount(PickItemsPage, { props: { orderId: taskId } })
    await flushPromises()

    expect(wrapper.find('[role="dialog"][aria-label="Manage batch"]').exists()).toBe(false)

    await scan(wrapper, BATCH_SKU)

    const drawer = wrapper.find('[role="dialog"][aria-label="Manage batch"]')
    expect(drawer.exists()).toBe(true)
    wrapper.unmount()
  })
})

describe('PickItemsPage — scanning a serial-tracked SKU barcode auto-opens Manage serial number', () => {
  it('opens the Manage serial number drawer for the scanned SKU', async () => {
    const taskId = makeOrderAndTask(SERIAL_SKU, 1)
    const wrapper = mount(PickItemsPage, { props: { orderId: taskId } })
    await flushPromises()

    expect(wrapper.find('[role="dialog"][aria-label="Manage serial number"]').exists()).toBe(false)

    await scan(wrapper, SERIAL_SKU)

    const drawer = wrapper.find('[role="dialog"][aria-label="Manage serial number"]')
    expect(drawer.exists()).toBe(true)
    wrapper.unmount()
  })
})
