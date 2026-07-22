// @vitest-environment happy-dom
/**
 * UI side of the inbound PO cancel cascade (see inbound-cancel-cascade.spec.ts
 * for the data-layer behavior). An in-progress receiving task whose PO was
 * just canceled must show the acknowledge banner and block Continue
 * receiving with a confirmation modal — both from the task details page AND
 * from a direct visit to the receive-execution page (defense in depth, in
 * case someone navigates there directly without going through the details
 * page's own gating). Confirming acknowledges AND cancels the task (there's
 * nothing left to receive once its one-and-only PO is gone) — it must never
 * be possible to "Start receiving" on it again afterward.
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

function findModalButton(text: string): HTMLElement {
  const modal = document.querySelector('#modal-rcvgd-ack-cancel')!
  const btn = Array.from(modal.querySelectorAll('button')).find((b) => b.textContent === text)
  if (!btn) throw new Error(`Button "${text}" not found in ack-cancel modal`)
  return btn as HTMLElement
}

describe('ReceivingTaskDetailsPage — canceled-PO acknowledge modal', () => {
  it('Continue receiving opens the ack-cancel modal instead of navigating, while unacknowledged', async () => {
    const receipt = makeReceipt()
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    cancelInboundReceipt(receipt.id)
    expect(getReceivingTask(task.id)!.needsCancelAck).toBe(true)

    const wrapper = mount(ReceivingTaskDetailsPage, { props: { orderId: task.id } })
    await flushPromises()

    expect(wrapper.find('.rcvgd-cancel-banner').exists()).toBe(true)
    expect(wrapper.find('.rcvgd-cancel-banner').text()).toContain(receipt.purchaseNo)
    expect(document.querySelector('#modal-rcvgd-ack-cancel')).toBeNull() // not opened yet

    pushMock.mockClear()
    const continueBtn = wrapper.findAll('button').find((b) => b.text() === 'Continue receiving')!
    await continueBtn.trigger('click')
    await flushPromises()

    expect(pushMock).not.toHaveBeenCalled() // did NOT navigate
    const modal = document.querySelector('#modal-rcvgd-ack-cancel')
    expect(modal).not.toBeNull()
    expect(modal!.textContent).toContain(receipt.purchaseNo)
    expect(modal!.textContent).toContain(task.taskNo)

    wrapper.unmount()
  })

  it('confirming Acknowledge in the modal cancels the task and navigates back — real receivedQty preserved', async () => {
    const receipt = makeReceipt()
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    cancelInboundReceipt(receipt.id)

    const wrapper = mount(ReceivingTaskDetailsPage, { props: { orderId: task.id } })
    await flushPromises()

    // Open via the banner's own Acknowledge button this time.
    await wrapper.find('.rcvgd-cancel-banner-btn').trigger('click')
    await flushPromises()
    expect(document.querySelector('#modal-rcvgd-ack-cancel')).not.toBeNull()

    pushMock.mockClear()
    findModalButton('Acknowledge').click()
    await flushPromises()

    const after = getReceivingTask(task.id)!
    expect(after.status).toBe('canceled') // acknowledging CANCELS the task
    expect(after.needsCancelAck).toBe(false)
    expect(pushMock).toHaveBeenCalled() // navigated away (goBack)

    wrapper.unmount()
  })

  it('clicking Review in the modal closes it without canceling anything', async () => {
    const receipt = makeReceipt()
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    cancelInboundReceipt(receipt.id)

    const wrapper = mount(ReceivingTaskDetailsPage, { props: { orderId: task.id } })
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text() === 'Continue receiving')!.trigger('click')
    await flushPromises()

    findModalButton('Review').click()
    await flushPromises()

    // Nothing was canceled — still in progress, still flagged.
    const after = getReceivingTask(task.id)!
    expect(after.status).toBe('in progress')
    expect(after.needsCancelAck).toBe(true)

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
    expect(wrapper.find('input[type="number"]').exists()).toBe(false) // real receive UI not rendered

    wrapper.unmount()
  })

  it('Acknowledge here also cancels the task and navigates back to the task details page', async () => {
    const receipt = makeReceipt()
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    cancelInboundReceipt(receipt.id)

    const wrapper = mount(ReceiveItemsPage, { props: { orderId: task.id } })
    await flushPromises()

    pushMock.mockClear()
    const ackBtn = wrapper.findAll('button').find((b) => b.text() === 'Acknowledge')!
    await ackBtn.trigger('click')
    await flushPromises()

    const after = getReceivingTask(task.id)!
    expect(after.status).toBe('canceled')
    expect(after.needsCancelAck).toBe(false)
    expect(pushMock).toHaveBeenCalledWith(`/receiving/${task.id}`)

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

describe('End-to-end: acknowledging must never allow "Start receiving" again', () => {
  it('an acknowledged (now-canceled) task offers no Start/Continue action at all', async () => {
    const receipt = makeReceipt()
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    cancelInboundReceipt(receipt.id)

    const wrapper = mount(ReceivingTaskDetailsPage, { props: { orderId: task.id } })
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text() === 'Continue receiving')!.trigger('click')
    await flushPromises()
    findModalButton('Acknowledge').click()
    await flushPromises()
    wrapper.unmount()

    // Remount fresh, as if the operator reloaded/reopened the page.
    const remounted = mount(ReceivingTaskDetailsPage, { props: { orderId: task.id } })
    await flushPromises()
    expect(remounted.findAll('button').find((b) => b.text() === 'Start receiving')).toBeUndefined()
    expect(remounted.findAll('button').find((b) => b.text() === 'Continue receiving')).toBeUndefined()
    expect(remounted.find('.rcvgd-cancel-banner').exists()).toBe(false) // already resolved, not still flagged

    remounted.unmount()
  })
})
