// @vitest-environment happy-dom
/**
 * UI side of the inbound PO cancel cascade (see inbound-cancel-cascade.spec.ts
 * for the data-layer behavior). An in-progress receiving task whose PO was
 * just canceled must show the acknowledge banner and block Continue
 * receiving — both from the task details page AND from a direct visit to the
 * receive-execution page (defense in depth, in case someone navigates there
 * directly without going through the details page's own gating).
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed } from 'vue'
import ReceivingTaskDetailsPage from '~/components/pages/ReceivingTaskDetailsPage.vue'
import ReceiveItemsPage from '~/components/pages/ReceiveItemsPage.vue'
import { addReceipt, type Receipt } from '~/data/receipts'
import { addReceivingTask, getReceivingTask, startReceiving } from '~/data/receivingTasks'
import { cancelInboundReceipt } from '~/data/inboundSync'
import '~/data/warehouseDetails'

vi.stubGlobal('computed', computed)
const pushMock = vi.fn()
vi.stubGlobal('useRouter', () => ({ push: pushMock }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const WAREHOUSE_ID = 'wh-006'
const WAREHOUSE_NAME = 'Gudang Makassar Selatan'
const SKU_A = { productId: 'p20', sku: '3001' } // Milk Frothing Pitcher 600ml

let seq = 0
function makeReceipt(qty = 10): Receipt {
  seq++
  return addReceipt({
    purchaseNo: `Test Cancel Cascade UI PO ${seq}`,
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
    skuQty: 1, purchaseQty: qty,
    receivedQty: 0, status: 'open', estimatedArrival: '2026-08-01',
    trackingNos: [], lineItems: [{ productId: SKU_A.productId, qty }],
  })
}

describe('ReceivingTaskDetailsPage — canceled-PO acknowledge banner', () => {
  it('shows the banner and blocks Continue receiving until acknowledged', async () => {
    const receipt = makeReceipt()
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    cancelInboundReceipt(receipt.id)
    expect(getReceivingTask(task.id)!.needsCancelAck).toBe(true)

    const wrapper = mount(ReceivingTaskDetailsPage, { props: { orderId: task.id } })
    await flushPromises()

    expect(wrapper.find('.rcvgd-cancel-banner').exists()).toBe(true)
    expect(wrapper.find('.rcvgd-cancel-banner').text()).toContain(receipt.purchaseNo)

    // Clicking Continue receiving must NOT navigate while unacknowledged.
    pushMock.mockClear()
    const continueBtn = wrapper.findAll('button').find((b) => b.text() === 'Continue receiving')!
    await continueBtn.trigger('click')
    expect(pushMock).not.toHaveBeenCalled()

    // Acknowledge — banner disappears, task still in progress.
    await wrapper.find('.rcvgd-cancel-banner-btn').trigger('click')
    await flushPromises()
    expect(wrapper.find('.rcvgd-cancel-banner').exists()).toBe(false)
    expect(getReceivingTask(task.id)!.needsCancelAck).toBe(false)

    // Continue receiving now navigates normally.
    pushMock.mockClear()
    const continueBtnAfter = wrapper.findAll('button').find((b) => b.text() === 'Continue receiving')!
    await continueBtnAfter.trigger('click')
    expect(pushMock).toHaveBeenCalledWith(`/receiving/${task.id}/receive`)

    wrapper.unmount()
  })

  it('no banner, no blocking for a normal in-progress task whose PO was never canceled', async () => {
    const receipt = makeReceipt()
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)

    const wrapper = mount(ReceivingTaskDetailsPage, { props: { orderId: task.id } })
    await flushPromises()

    expect(wrapper.find('.rcvgd-cancel-banner').exists()).toBe(false)
    pushMock.mockClear()
    const continueBtn = wrapper.findAll('button').find((b) => b.text() === 'Continue receiving')!
    await continueBtn.trigger('click')
    expect(pushMock).toHaveBeenCalledWith(`/receiving/${task.id}/receive`)

    wrapper.unmount()
  })
})

describe('ReceiveItemsPage — direct-URL guard for a canceled-PO task', () => {
  it('shows the blocked acknowledge screen instead of the receive UI when visited directly', async () => {
    const receipt = makeReceipt()
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    cancelInboundReceipt(receipt.id)

    const wrapper = mount(ReceiveItemsPage, { props: { orderId: task.id } })
    await flushPromises()

    expect(wrapper.find('.ri-not-found').exists()).toBe(true)
    expect(wrapper.text()).toContain(receipt.purchaseNo)
    expect(wrapper.find('.ScanBar, .scan-bar-input').exists()).toBe(false) // real receive UI not rendered
    expect(wrapper.find('input[type="number"]').exists()).toBe(false)

    const ackBtn = wrapper.findAll('button').find((b) => b.text() === 'Acknowledge')!
    await ackBtn.trigger('click')
    await flushPromises()

    expect(getReceivingTask(task.id)!.needsCancelAck).toBe(false)
    // Real receive UI now renders in place of the blocked screen.
    expect(wrapper.find('input[type="number"]').exists()).toBe(true)

    wrapper.unmount()
  })

  it('renders the normal receive UI directly when the PO was never canceled', async () => {
    const receipt = makeReceipt()
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)

    const wrapper = mount(ReceiveItemsPage, { props: { orderId: task.id } })
    await flushPromises()

    expect(wrapper.find('.ri-not-found').exists()).toBe(false)
    expect(wrapper.find('input[type="number"]').exists()).toBe(true)

    wrapper.unmount()
  })
})
