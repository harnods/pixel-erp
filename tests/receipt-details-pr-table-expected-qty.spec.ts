// @vitest-environment happy-dom
/**
 * The "Purchase receiving tasks" sub-table on PO/receipt detail pages showed
 * Purchase qty (whole-PO scope) — less relevant here than Expected qty
 * (targetQty), what each linked receiving task is actually going after. This
 * is distinct from the page's OWN line-items table, which stays "Purchase qty"
 * (genuinely PO-scoped) and must not change.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, computed, reactive, watch, onMounted, onUnmounted, nextTick } from 'vue'
import ReceiptDetailsPage from '~/components/pages/ReceiptDetailsPage.vue'
import { addReceipt } from '~/data/receipts'
import { lineItemsForReceipt } from '~/data/receiptLineItems'
import { createReceivingTask } from '~/data/receivingTasks'

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

describe('ReceiptDetailsPage — "Purchase receiving tasks" table shows Expected qty, not Purchase qty', () => {
  it('renders "Expected qty" as the header (not duplicated "Purchase qty"), and the cell shows the task\'s targetQty sum', async () => {
    const receipt = addReceipt({
      purchaseNo: 'PO-TEST-DETAILS-EXPECTED',
      warehouseId: 'wh-006', warehouseName: 'Gudang Makassar Selatan',
      skuQty: 1, purchaseQty: 10, receivedQty: 0,
      status: 'on the way',
      estimatedArrival: '2026-08-01',
      trackingNos: [],
    })
    const sku = lineItemsForReceipt(receipt)[0]!.sku
    const task = createReceivingTask({
      receiptId: receipt.id, assignee: 'Test Operator', skus: [sku],
      targetQtyBySku: { [sku]: 6 }, // Expected qty 6, well below Purchase qty 10
    })!

    const wrapper = mount(ReceiptDetailsPage, { props: { orderId: receipt.id } })
    await flushPromises()

    // The page's OWN line-items table keeps "Purchase qty" — genuinely PO-scoped.
    const ownHeaders = wrapper.findAll('table.detail-items th.detail-th').map((h) => h.text())
    expect(ownHeaders).toContain('Purchase qty')

    // The linked "Purchase receiving tasks" table swaps to "Expected qty".
    const linkedHeaders = wrapper.findAll('table.detail-linked th.detail-th').map((h) => h.text())
    expect(linkedHeaders).toContain('Expected qty')
    expect(linkedHeaders.indexOf('Expected qty')).toBe(linkedHeaders.indexOf('Received qty') - 1)

    const row = wrapper.findAll('table.detail-linked tr.detail-item-row').find((r) => r.text().includes(task.taskNo))!
    const numCells = row.findAll('td.detail-td--num').map((c) => c.text())
    expect(numCells[0]).toBe('6') // Expected qty (targetQty), not Purchase qty (10)
    wrapper.unmount()
  })
})
