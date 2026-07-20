// @vitest-environment happy-dom
/**
 * Receiving execution: scanning a batch/serial-tracked SKU's own barcode (not
 * yet a known batch number) auto-opens the matching Manage batch / Manage
 * serial number drawer — received qty for these lines is only ever entered
 * through that drawer, never the manual qty input.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ReceiveItemsPage from '~/components/pages/ReceiveItemsPage.vue'
import { receipts } from '~/data/receipts'
import { DEMO_RECEIPT_ID } from '~/data/receiptLineItems'
import { createReceivingTask, startReceiving } from '~/data/receivingTasks'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const BATCH_SKU = '1001'  // Green Beans Arabica Gayo Grade 1 — batch-tracked
const SERIAL_SKU = '2004' // Espresso Machine Lever Manual 1-Group — serial-tracked

async function scan(wrapper: ReturnType<typeof mount>, value: string) {
  const input = wrapper.find('.scan-bar-input')
  await input.setValue(value)
  await input.trigger('keydown.enter')
  await flushPromises()
}

describe('ReceiveItemsPage — scanning a batch-tracked SKU barcode auto-opens Manage batch', () => {
  it('opens the Manage batch drawer for the scanned SKU', async () => {
    const receipt = receipts.find((r) => r.id === DEMO_RECEIPT_ID)!
    const task = createReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator', skus: [BATCH_SKU] })!
    startReceiving(task.id)

    const wrapper = mount(ReceiveItemsPage, { props: { orderId: task.id } })
    await flushPromises()

    expect(wrapper.find('[role="dialog"][aria-label="Manage batch"]').exists()).toBe(false)

    await scan(wrapper, BATCH_SKU)

    const drawer = wrapper.find('[role="dialog"][aria-label="Manage batch"]')
    expect(drawer.exists()).toBe(true)
    wrapper.unmount()
  })
})

describe('ReceiveItemsPage — scanning a serial-tracked SKU barcode auto-opens Manage serial number', () => {
  it('opens the Manage serial number drawer for the scanned SKU', async () => {
    const receipt = receipts.find((r) => r.id === DEMO_RECEIPT_ID)!
    const task = createReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator', skus: [SERIAL_SKU] })!
    startReceiving(task.id)

    const wrapper = mount(ReceiveItemsPage, { props: { orderId: task.id } })
    await flushPromises()

    expect(wrapper.find('[role="dialog"][aria-label="Manage serial number"]').exists()).toBe(false)

    await scan(wrapper, SERIAL_SKU)

    const drawer = wrapper.find('[role="dialog"][aria-label="Manage serial number"]')
    expect(drawer.exists()).toBe(true)
    wrapper.unmount()
  })
})
