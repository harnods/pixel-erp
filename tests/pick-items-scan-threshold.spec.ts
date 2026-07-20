// @vitest-environment happy-dom
/**
 * Barcode scan threshold, enforced at picking execution: a plain (non-batch,
 * non-serial) SKU line's qty at or below the warehouse's scanThresholdValue
 * (default 50) must be reached by scanning — manual qty entry is disabled.
 * Above the threshold, manual entry works exactly as before.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PickItemsPage from '~/components/pages/PickItemsPage.vue'
import { addOutgoing, type OutgoingOrder } from '~/data/outgoing'
import { addPickingTask } from '~/data/pickingTasks'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const WAREHOUSE_ID = 'wh-006'
const WAREHOUSE_NAME = 'Gudang Makassar Selatan'
const PLAIN_SKU = '3004' // Coffee Scale 2kg / 0.1g — plain, non-tracked

function makeOrderAndTask(qty: number): string {
  const order: OutgoingOrder = addOutgoing({
    salesNo: `Test Threshold ${qty}`, source: 'Manual',
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
    skuQty: 1, orderQty: qty,
    shippedQty: 0, status: 'open', dueDate: '2026-08-01',
    lines: [{ sku: PLAIN_SKU, productName: PLAIN_SKU, desc: '', img: '', unit: 'Unit', qty }],
  })
  const task = addPickingTask({
    salesOrderIds: [order.id], salesNos: [order.salesNo],
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
  })
  return task.id
}

describe('PickItemsPage — barcode scan threshold gates manual qty entry', () => {
  it('qty at the default threshold (50): the qty input is disabled', async () => {
    const taskId = makeOrderAndTask(50)
    const wrapper = mount(PickItemsPage, { props: { orderId: taskId } })
    await flushPromises()

    const input = wrapper.find('input.pik-qty-input')
    expect(input.exists()).toBe(true)
    expect(input.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('qty above the default threshold (51): the qty input stays enabled and typable', async () => {
    const taskId = makeOrderAndTask(51)
    const wrapper = mount(PickItemsPage, { props: { orderId: taskId } })
    await flushPromises()

    const input = wrapper.find('input.pik-qty-input')
    expect(input.exists()).toBe(true)
    expect(input.attributes('disabled')).toBeUndefined()

    await input.setValue('30')
    expect(wrapper.text()).toContain('30')
    wrapper.unmount()
  })
})
