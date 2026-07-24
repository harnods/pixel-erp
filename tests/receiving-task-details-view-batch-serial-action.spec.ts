// @vitest-environment happy-dom
/**
 * PM request: on the receiving task details page, batch/serial-tracked SKU rows
 * should get a rightmost "View batch"/"View serial number" icon button (opening
 * a read-only drawer) once the task's status is anything but 'Open' — Open tasks
 * haven't recorded anything yet, so there's nothing to view.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed } from 'vue'
import ReceivingTaskDetailsPage from '~/components/pages/ReceivingTaskDetailsPage.vue'
import { addReceipt } from '~/data/receipts'
import { lineItemsForReceipt } from '~/data/receiptLineItems'
import { createReceivingTask, startReceiving, saveReceivingDraft, endReceiving, cancelReceivingTask } from '~/data/receivingTasks'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
vi.stubGlobal('computed', computed) // ErpStatusBadge relies on the Nuxt auto-import
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

/** SKU numbering (see app/data/catalog.ts): 10xx/11xx = batch-tracked, 20xx/21xx/22xx
 *  = serial-tracked, 30xx = plain. addReceipt's single-line SKU is hash-derived from
 *  the fresh receipt id, so retry until the prefix lands in the wanted category. */
function freshReceiptWithSkuPrefix(prefixes: string[]) {
  for (let i = 0; i < 40; i++) {
    const receipt = addReceipt({
      purchaseNo: `PO-TEST-VIEWACTION-${i}`,
      warehouseId: 'wh-006', warehouseName: 'Gudang Makassar Selatan',
      skuQty: 1, purchaseQty: 20, receivedQty: 0,
      status: 'on the way',
      estimatedArrival: '2026-08-01',
      trackingNos: [],
    })
    const sku = lineItemsForReceipt(receipt)[0]!.sku
    if (prefixes.some(p => sku.startsWith(p))) return { receiptId: receipt.id, sku }
  }
  throw new Error('Could not find a fresh receipt landing on the wanted SKU category')
}

describe('ReceivingTaskDetailsPage — View batch/serial action column', () => {
  it('a found task never shows the "Receiving task not found." fallback text', async () => {
    // Regression guard: the new ViewBatchDrawer/ViewSerialDrawer were briefly placed
    // between the page's `v-if="task && po"` div and its `v-else` not-found fallback,
    // breaking their adjacency — Vue then renders v-else unconditionally alongside
    // the real content instead of treating it as mutually exclusive.
    const { receiptId, sku } = freshReceiptWithSkuPrefix(['10', '11'])
    const task = createReceivingTask({ receiptId, assignee: 'Test Operator', skus: [sku] })!

    const wrapper = mount(ReceivingTaskDetailsPage, { props: { orderId: task.id } })
    await flushPromises()

    expect(wrapper.text()).not.toContain('Receiving task not found.')
    wrapper.unmount()
  })

  it('an Open task shows no view-action button at all, even for a batch-tracked SKU', async () => {
    const { receiptId, sku } = freshReceiptWithSkuPrefix(['10', '11'])
    const task = createReceivingTask({ receiptId, assignee: 'Test Operator', skus: [sku] })!

    const wrapper = mount(ReceivingTaskDetailsPage, { props: { orderId: task.id } })
    await flushPromises()

    expect(wrapper.find('button.rtd-view-btn').exists()).toBe(false)
    wrapper.unmount()
  })

  it('an in-progress task with a batch-tracked SKU shows "View batch", opening a read-only drawer with the saved batch + "Received qty"', async () => {
    const { receiptId, sku } = freshReceiptWithSkuPrefix(['10', '11'])
    const task = createReceivingTask({ receiptId, assignee: 'Test Operator', skus: [sku] })!
    startReceiving(task.id)
    saveReceivingDraft(task.id, { [sku]: 8 }, {
      [sku]: { batchLines: [{ batchNo: 'BATCH-TEST-01', expiryDate: '2027-01-01', desc: 'Test batch', qty: 8, unit: 'Sack' }] },
    })

    const wrapper = mount(ReceivingTaskDetailsPage, { props: { orderId: task.id } })
    await flushPromises()

    const btn = wrapper.find('button[aria-label="View batch"]')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Received qty')
    expect(wrapper.text()).toContain('BATCH-TEST-01')
    wrapper.unmount()
  })

  it('a completed task with a serial-tracked SKU shows "View serial number", opening a read-only drawer with the saved serials', async () => {
    const { receiptId, sku } = freshReceiptWithSkuPrefix(['20', '21', '22'])
    const task = createReceivingTask({ receiptId, assignee: 'Test Operator', skus: [sku] })!
    startReceiving(task.id)
    endReceiving(task.id, { [sku]: 3 }, {
      [sku]: { serialNumbers: ['SNTEST-0001', 'SNTEST-0002', 'SNTEST-0003'] },
    })

    const wrapper = mount(ReceivingTaskDetailsPage, { props: { orderId: task.id } })
    await flushPromises()

    const btn = wrapper.find('button[aria-label="View serial number"]')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('SNTEST-0001')
    wrapper.unmount()
  })

  it('a canceled task still shows the action button for a batch-tracked SKU, even with nothing recorded', async () => {
    const { receiptId, sku } = freshReceiptWithSkuPrefix(['10', '11'])
    const task = createReceivingTask({ receiptId, assignee: 'Test Operator', skus: [sku] })!
    cancelReceivingTask(task.id, 'Created by mistake')

    const wrapper = mount(ReceivingTaskDetailsPage, { props: { orderId: task.id } })
    await flushPromises()

    expect(wrapper.find('button[aria-label="View batch"]').exists()).toBe(true)
    wrapper.unmount()
  })
})
