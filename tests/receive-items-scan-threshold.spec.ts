// @vitest-environment happy-dom
/**
 * Barcode scan threshold, enforced at receiving execution: a plain (non-batch,
 * non-serial) SKU line's outstanding qty at or below the warehouse's
 * scanThresholdValue (default 50) must be reached by scanning — manual qty
 * entry is disabled. The demo receipt's plain-SKU line is qty 2, well under
 * the default threshold, so this exercises the "must scan" case; the "above
 * threshold" case is already covered structurally by the shared
 * scanRequiredForQty unit tests plus PickItemsPage's end-to-end test.
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

const PLAIN_SKU = '3004' // Coffee Scale 2kg / 0.1g — plain, non-tracked, qty 2 on the demo receipt

describe('ReceiveItemsPage — barcode scan threshold gates manual qty entry', () => {
  it('outstanding qty (2) is below the default threshold (50): the qty input is disabled', async () => {
    const receipt = receipts.find((r) => r.id === DEMO_RECEIPT_ID)!
    const task = createReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator', skus: [PLAIN_SKU] })!
    startReceiving(task.id)

    const wrapper = mount(ReceiveItemsPage, { props: { orderId: task.id } })
    await flushPromises()

    const input = wrapper.find('input.ri-qty-input')
    expect(input.exists()).toBe(true)
    expect(input.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
})
