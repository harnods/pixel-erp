// @vitest-environment happy-dom
/**
 * UI side of the put-away layer of the inbound PO cancel cascade (see
 * inbound-cancel-cascade-putaway.spec.ts for the data-layer behavior). An
 * open/in-progress put-away whose source receiving task's PO was just
 * canceled must show the acknowledge banner — clicking its own Acknowledge
 * button acknowledges directly (no extra confirmation modal, matching the
 * receiving details page's own banner). Start/Continue put-away is still
 * blocked by a confirmation modal (reached only via that button, not the
 * banner). Acknowledging (from either path) cancels the put-away only — its
 * linked receiving task STAYS completed (done work is a permanent record) — and
 * stays on the current page (no navigation).
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed } from 'vue'
import PutAwayDetailsPage from '~/components/pages/PutAwayDetailsPage.vue'
import { addReceipt, type Receipt } from '~/data/receipts'
import { addReceivingTask, getReceivingTask, startReceiving, endReceiving } from '~/data/receivingTasks'
import { addPutAwayTask, getPutAwayTask, startPutAway } from '~/data/putAwayTasks'
import { cancelInboundReceipt } from '~/data/inboundSync'
import '~/data/warehouseDetails'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
vi.stubGlobal('computed', computed)
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const WAREHOUSE_ID = 'wh-001'
const WAREHOUSE_NAME = 'Gudang Jakarta Pusat'
const SKU_PLAIN = { productId: 'p20', sku: '3001' } // Milk Frothing Pitcher 600ml

let seq = 0
function makeReceipt(qty = 10): Receipt {
  seq++
  return addReceipt({
    purchaseNo: `Test Cancel PutAway UI PO ${seq}`,
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
    skuQty: 1, purchaseQty: qty,
    receivedQty: 0, status: 'open', estimatedArrival: '2026-08-01',
    trackingNos: [], lineItems: [{ productId: SKU_PLAIN.productId, qty }],
  })
}

function makeFlaggedPutAway() {
  const receipt = makeReceipt()
  const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
  startReceiving(task.id)
  endReceiving(task.id, { [SKU_PLAIN.sku]: 10 })
  const pa = addPutAwayTask({
    receivingTaskIds: [task.id], receivingTaskNos: [task.taskNo],
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
  })
  startPutAway(pa.id) // in-progress → flagged for ack (an open one auto-cancels outright)
  cancelInboundReceipt(receipt.id)
  return { receipt, task, pa }
}

function findModalButton(text: string): HTMLElement {
  const modal = document.querySelector('#modal-pad-ack-cancel')!
  const btn = Array.from(modal.querySelectorAll('button')).find((b) => b.textContent === text)
  if (!btn) throw new Error(`Button "${text}" not found in put-away ack-cancel modal`)
  return btn as HTMLElement
}

describe('PutAwayDetailsPage — canceled-PO acknowledge banner/modal', () => {
  it('shows the banner and blocks Continue put-away behind a confirmation modal', async () => {
    const { pa } = makeFlaggedPutAway()
    expect(getPutAwayTask(pa.id)!.needsCancelAck).toBe(true)

    const wrapper = mount(PutAwayDetailsPage, { props: { orderId: pa.id } })
    await flushPromises()

    expect(wrapper.find('.pad-cancel-banner').exists()).toBe(true)
    expect(document.querySelector('#modal-pad-ack-cancel')).toBeNull() // not opened yet

    const startBtn = wrapper.findAll('button').find((b) => b.text() === 'Continue put-away')!
    await startBtn.trigger('click')
    await flushPromises()

    const modal = document.querySelector('#modal-pad-ack-cancel')
    expect(modal).not.toBeNull()

    wrapper.unmount()
  })

  it('clicking Acknowledge in the banner acknowledges directly — no modal, stays on the page', async () => {
    const { pa, task } = makeFlaggedPutAway()

    const wrapper = mount(PutAwayDetailsPage, { props: { orderId: pa.id } })
    await flushPromises()

    await wrapper.find('.pad-cancel-banner-btn').trigger('click')
    await flushPromises()

    expect(document.querySelector('#modal-pad-ack-cancel')).toBeNull() // no confirmation modal
    const paAfter = getPutAwayTask(pa.id)!
    expect(paAfter.status).toBe('canceled')
    expect(paAfter.needsCancelAck).toBe(false)
    expect(getReceivingTask(task.id)!.status).toBe('completed') // done work stays completed

    wrapper.unmount()
  })

  it('confirming Acknowledge in the modal (reached via Continue put-away) cancels the put-away; receiving stays completed', async () => {
    const { pa, task } = makeFlaggedPutAway()

    const wrapper = mount(PutAwayDetailsPage, { props: { orderId: pa.id } })
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text() === 'Continue put-away')!.trigger('click')
    await flushPromises()

    findModalButton('Acknowledge').click()
    await flushPromises()

    const paAfter = getPutAwayTask(pa.id)!
    expect(paAfter.status).toBe('canceled')
    expect(getReceivingTask(task.id)!.status).toBe('completed') // done work stays completed

    wrapper.unmount()
  })

  it('clicking Review in the modal closes it without canceling anything', async () => {
    const { pa } = makeFlaggedPutAway()

    const wrapper = mount(PutAwayDetailsPage, { props: { orderId: pa.id } })
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text() === 'Continue put-away')!.trigger('click')
    await flushPromises()

    findModalButton('Review').click()
    await flushPromises()

    expect(getPutAwayTask(pa.id)!.status).toBe('in progress') // untouched
    expect(getPutAwayTask(pa.id)!.needsCancelAck).toBe(true) // still flagged

    wrapper.unmount()
  })

  it('no banner, no blocking for a normal put-away whose PO was never canceled', async () => {
    const receipt = makeReceipt()
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    endReceiving(task.id, { [SKU_PLAIN.sku]: 10 })
    const pa = addPutAwayTask({
      receivingTaskIds: [task.id], receivingTaskNos: [task.taskNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })

    const wrapper = mount(PutAwayDetailsPage, { props: { orderId: pa.id } })
    await flushPromises()

    expect(wrapper.find('.pad-cancel-banner').exists()).toBe(false)
    // Normal open put-away (PO never canceled) → button is "Start put-away".
    const startBtn = wrapper.findAll('button').find((b) => b.text() === 'Start put-away')!
    await startBtn.trigger('click')
    await flushPromises()
    expect(document.querySelector('#modal-pad-ack-cancel')).toBeNull()
    expect(getPutAwayTask(pa.id)!.status).toBe('in progress') // proceeded normally

    wrapper.unmount()
  })
})
