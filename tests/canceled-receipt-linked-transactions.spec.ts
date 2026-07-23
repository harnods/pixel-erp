// @vitest-environment happy-dom
/**
 * BUG: CanceledReceiptDetailsPage.vue was built assuming a canceled PO never
 * has any receiving history (its line-items table comment literally said
 * "nothing was received") — so it never had a "Linked transactions" section
 * at all, unlike ReceiptDetailsPage.vue. That assumption broke once PO
 * cancellation could cascade over a receiving task that already has real
 * receivedQty (an in-progress task, acknowledged after its PO was canceled) —
 * the receiving history would silently disappear the moment the PO's status
 * flipped to "canceled" and the page swapped over.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, computed, reactive, watch, onMounted, onUnmounted, nextTick } from 'vue'
import CanceledReceiptDetailsPage from '~/components/pages/CanceledReceiptDetailsPage.vue'
import { addReceipt, type Receipt } from '~/data/receipts'
import { addReceivingTask, startReceiving, saveReceivingDraft } from '~/data/receivingTasks'
import { cancelInboundReceipt } from '~/data/inboundSync'
import '~/data/warehouseDetails'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
// ErpStatusBadge and ActivityLogModal (children rendered by this page) rely on
// Nuxt's Vue Composition API auto-imports, absent when mounted outside Nuxt.
vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('watch', watch)
vi.stubGlobal('onMounted', onMounted)
vi.stubGlobal('onUnmounted', onUnmounted)
vi.stubGlobal('nextTick', nextTick)
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
    purchaseNo: `Test Linked Tx PO ${seq}`,
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
    skuQty: 1, purchaseQty: qty,
    receivedQty: 0, status: 'open', estimatedArrival: '2026-08-01',
    trackingNos: [], lineItems: [{ productId: SKU_A.productId, qty }],
  })
}

describe('CanceledReceiptDetailsPage — receiving history stays visible after cancel', () => {
  it('an auto-canceled OPEN task still shows up under Purchase receiving', async () => {
    const receipt = makeReceipt()
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    cancelInboundReceipt(receipt.id)
    expect(receipt.status).toBe('canceled')

    const wrapper = mount(CanceledReceiptDetailsPage, { props: { orderId: receipt.id } })
    await flushPromises()

    expect(wrapper.text()).toContain('Purchase receiving')
    expect(wrapper.text()).toContain(task.taskNo)
    wrapper.unmount()
  })

  it('an in-progress task with REAL receivedQty, later acknowledged/canceled, keeps its receivedQty visible', async () => {
    const receipt = makeReceipt()
    const task = addReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator' })!
    startReceiving(task.id)
    saveReceivingDraft(task.id, { [SKU_A.sku]: 7 })
    cancelInboundReceipt(receipt.id)
    // Simulate the operator acknowledging afterward (cancels the task, keeps receivedQty).
    const { acknowledgeCanceledReceipt, getReceivingTask } = await import('~/data/receivingTasks')
    acknowledgeCanceledReceipt(task.id)
    expect(getReceivingTask(task.id)!.status).toBe('canceled')
    expect(getReceivingTask(task.id)!.receivedQty).toBe(7)

    const wrapper = mount(CanceledReceiptDetailsPage, { props: { orderId: receipt.id } })
    await flushPromises()

    expect(wrapper.text()).toContain('Purchase receiving')
    expect(wrapper.text()).toContain(task.taskNo)
    expect(wrapper.text()).toContain('7') // received qty preserved and visible
    wrapper.unmount()
  })

  it('a receipt canceled with NO receiving task at all shows no Linked transactions section (nothing to show)', async () => {
    const receipt = makeReceipt()
    cancelInboundReceipt(receipt.id)

    const wrapper = mount(CanceledReceiptDetailsPage, { props: { orderId: receipt.id } })
    await flushPromises()

    expect(wrapper.find('.detail-tabs').exists()).toBe(false)
    wrapper.unmount()
  })
})
