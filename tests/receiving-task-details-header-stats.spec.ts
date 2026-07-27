// @vitest-environment happy-dom
/**
 * The header summary stats were missing "Expected qty" (shown in the line
 * items table's own column, but not summed/surfaced in the header next to
 * Purchase qty/Received qty/Outstanding qty), and the "SKUs" label was
 * ambiguous (it's a count, i.e. "SKU qty") next to the other *qty stats.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed } from 'vue'
import ReceivingTaskDetailsPage from '~/components/pages/ReceivingTaskDetailsPage.vue'
import { addReceipt } from '~/data/receipts'
import { createReceivingTask, startReceiving, saveReceivingDraft } from '~/data/receivingTasks'

// ErpStatusBadge (rendered by this page) relies on Nuxt's `computed` auto-import,
// unavailable outside the real Nuxt runtime.
vi.stubGlobal('computed', computed)
vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

function statValue(wrapper: ReturnType<typeof mount>, label: string): string {
  const stat = wrapper.findAll('.rcvgd-progress-stat').find((s) => s.text().includes(label))!
  return stat.find('.rcvgd-progress-val').text()
}

describe('ReceivingTaskDetailsPage — header summary stats', () => {
  it('shows "SKU qty" (not "SKUs") and an "Expected qty" stat matching the table\'s own targetQty total', async () => {
    const receipt = addReceipt({
      purchaseNo: 'PO-TEST-HEADER-STATS',
      warehouseId: 'wh-006', warehouseName: 'Gudang Makassar Selatan',
      skuQty: 1, purchaseQty: 10, receivedQty: 0,
      status: 'pending',
      estimatedArrival: '2026-08-01',
      trackingNos: [],
    })
    const sku = (await import('~/data/receiptLineItems')).lineItemsForReceipt(receipt)[0]!.sku
    const task = createReceivingTask({
      receiptId: receipt.id, assignee: 'Test Operator', skus: [sku],
      targetQtyBySku: { [sku]: 6 },
    })!

    const wrapper = mount(ReceivingTaskDetailsPage, { props: { orderId: task.id } })
    await flushPromises()

    const labels = wrapper.findAll('.rcvgd-progress-label').map((l) => l.text())
    expect(labels).toContain('SKU qty')
    expect(labels).not.toContain('SKUs')
    expect(labels).toContain('Expected qty')
    expect(labels.indexOf('Expected qty')).toBe(labels.indexOf('Purchase qty') + 1)

    expect(statValue(wrapper, 'Purchase qty')).toBe('10')
    expect(statValue(wrapper, 'Expected qty')).toBe('6')
    wrapper.unmount()
  })
})

describe('ReceivingTaskDetailsPage — Outstanding qty is Expected qty minus Received qty, not Purchase qty minus Received qty', () => {
  it('shows the shortfall against Expected qty (targetQty) in both the header stat and the per-row column', async () => {
    const receipt = addReceipt({
      purchaseNo: 'PO-TEST-OUTSTANDING',
      warehouseId: 'wh-006', warehouseName: 'Gudang Makassar Selatan',
      skuQty: 1, purchaseQty: 10, receivedQty: 0,
      status: 'pending',
      estimatedArrival: '2026-08-01',
      trackingNos: [],
    })
    const sku = (await import('~/data/receiptLineItems')).lineItemsForReceipt(receipt)[0]!.sku
    const task = createReceivingTask({
      receiptId: receipt.id, assignee: 'Test Operator', skus: [sku],
      targetQtyBySku: { [sku]: 6 }, // Expected qty 6, well below Purchase qty 10
    })!
    startReceiving(task.id)
    saveReceivingDraft(task.id, { [sku]: 4 }) // 4 of 6 received so far

    const wrapper = mount(ReceivingTaskDetailsPage, { props: { orderId: task.id } })
    await flushPromises()

    // 6 (Expected qty) - 4 (Received) = 2 — NOT 10 (Purchase qty) - 4 = 6.
    expect(statValue(wrapper, 'Remaining qty to receive')).toBe('2')

    const row = wrapper.find('tr.detail-item-row')
    const numCells = row.findAll('td.detail-td--num').map((c) => c.text())
    // Purchase qty, Expected qty, Received qty, Outstanding qty, in that order.
    expect(numCells).toEqual(['10', '6', '4', '2'])
    wrapper.unmount()
  })

  it('is floored at 0, never negative, once Received qty reaches or exceeds Expected qty', async () => {
    const receipt = addReceipt({
      purchaseNo: 'PO-TEST-OUTSTANDING-FLOOR',
      warehouseId: 'wh-006', warehouseName: 'Gudang Makassar Selatan',
      skuQty: 1, purchaseQty: 10, receivedQty: 0,
      status: 'pending',
      estimatedArrival: '2026-08-01',
      trackingNos: [],
    })
    const sku = (await import('~/data/receiptLineItems')).lineItemsForReceipt(receipt)[0]!.sku
    const task = createReceivingTask({
      receiptId: receipt.id, assignee: 'Test Operator', skus: [sku],
      targetQtyBySku: { [sku]: 6 },
    })!
    startReceiving(task.id)
    saveReceivingDraft(task.id, { [sku]: 8 }) // past Expected qty (6), still within Purchase qty (10)

    const wrapper = mount(ReceivingTaskDetailsPage, { props: { orderId: task.id } })
    await flushPromises()

    expect(statValue(wrapper, 'Remaining qty to receive')).toBe('0')
    const row = wrapper.find('tr.detail-item-row')
    const numCells = row.findAll('td.detail-td--num').map((c) => c.text())
    expect(numCells).toEqual(['10', '6', '8', '0'])
    wrapper.unmount()
  })
})
