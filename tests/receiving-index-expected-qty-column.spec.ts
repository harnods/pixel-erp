// @vitest-environment happy-dom
/**
 * The receiving task list's qty column showed Purchase qty (whole-PO scope) —
 * less relevant here than Expected qty (targetQty), what each task is actually
 * going after. Swapped the column (header + cell) to show Expected qty,
 * summed across the task's own lines.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, computed, reactive, watch, onMounted, onUnmounted, nextTick, useSlots } from 'vue'
import ReceivingIndexPage from '~/components/pages/ReceivingIndexPage.vue'
import { addReceipt } from '~/data/receipts'
import { lineItemsForReceipt } from '~/data/receiptLineItems'
import { createReceivingTask } from '~/data/receivingTasks'

vi.stubGlobal('inject', () => undefined)
vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('watch', watch)
vi.stubGlobal('onMounted', onMounted)
vi.stubGlobal('onUnmounted', onUnmounted)
vi.stubGlobal('nextTick', nextTick)
vi.stubGlobal('useSlots', useSlots)
vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
vi.stubGlobal('useRoute', () => ({ query: {} }))
vi.stubGlobal('useWarehouseContext', () => ({ assignedWarehouses: computed(() => []) }))
vi.stubGlobal('useActiveWarehouseFilter', () => ref([]))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

async function mountLoaded() {
  vi.useFakeTimers()
  const wrapper = mount(ReceivingIndexPage as never)
  await vi.advanceTimersByTimeAsync(1300) // demoState's loading-skeleton timeout
  await flushPromises()
  vi.useRealTimers()
  return wrapper
}

describe('ReceivingIndexPage — qty column shows Expected qty, not Purchase qty', () => {
  it('renders "Expected qty" as the header (not "Purchase qty"), and the cell sums targetQty, not the Purchase qty total', async () => {
    const receipt = addReceipt({
      purchaseNo: 'PO-TEST-INDEX-EXPECTED',
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

    const wrapper = await mountLoaded()

    const headers = wrapper.findAll('th.rcvg-th').map((h) => h.text())
    expect(headers).toContain('Expected qty')
    expect(headers).not.toContain('Purchase qty')

    const row = wrapper.findAll('tr.rcvg-task-row').find((r) => r.text().includes(task.taskNo))!
    const numCells = row.findAll('td.rcvg-td--right').map((c) => c.text())
    expect(numCells[0]).toBe('6') // Expected qty total, not Purchase qty (10)
    wrapper.unmount()
  })
})
