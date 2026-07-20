// @vitest-environment happy-dom
/**
 * Refinement: put-away no longer tracks which specific bundled receiving task
 * a unit came from. The "SKU to put away" table on the New put-away form now
 * shows ONE row per SKU regardless of how many selected receiving tasks
 * contributed to it — qty summed, contributing tasks joined together for
 * traceability only (e.g. "Receiving #30001, Receiving #30002").
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import CreatePutAwayPage from '~/components/pages/CreatePutAwayPage.vue'
import { addReceipt } from '~/data/receipts'
import { createReceivingTask, startReceiving, endReceiving } from '~/data/receivingTasks'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
vi.stubGlobal('useRoute', () => ({ query: {} }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const WAREHOUSE_ID = 'wh-006'
const WAREHOUSE_NAME = 'Gudang Makassar Selatan'
const PLAIN_PRODUCT_ID = 'p23' // sku 3004 — Coffee Scale 2kg / 0.1g, plain/untracked

function freshReceivingTaskFor(productId: string, qty: number, tag: string) {
  const receipt = addReceipt({
    purchaseNo: `PO-TEST-PA-SKU-MERGE-${tag}`,
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
    skuQty: 1, purchaseQty: qty, receivedQty: 0,
    status: 'on the way',
    estimatedArrival: '2026-08-01',
    trackingNos: [],
    lineItems: [{ productId, qty }],
  })
  const rt = createReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator', skus: ['3004'] })!
  startReceiving(rt.id)
  endReceiving(rt.id, { '3004': qty }, {})
  return rt
}

describe('CreatePutAwayPage — SKU to put away table merges qty across selected receiving tasks into one row', () => {
  it('the same SKU from 2 selected receiving tasks is ONE row with qty summed and both tasks listed', async () => {
    const rtA = freshReceivingTaskFor(PLAIN_PRODUCT_ID, 2, 'A')
    const rtB = freshReceivingTaskFor(PLAIN_PRODUCT_ID, 5, 'B')

    const wrapper = mount(CreatePutAwayPage, { props: {} })
    await flushPromises()
    const vm = wrapper.vm as unknown as { warehouseId: string; selectedIds: Set<string> }
    vm.warehouseId = WAREHOUSE_ID
    await flushPromises()
    vm.selectedIds = new Set([rtA.id, rtB.id])
    await flushPromises()

    // Exactly one row for the shared SKU — not one per source.
    const skuCells = wrapper.findAll('.pa-sku-text').filter(el => el.text() === '3004')
    expect(skuCells).toHaveLength(1)

    // Received qty summed across both sources (2 + 5).
    const row = skuCells[0]!.element.closest('tr')!
    expect(row.textContent).toContain('7')

    // Both contributing receiving tasks listed together in the same cell.
    const taskRef = row.querySelector('.pa-task-ref')!
    expect(taskRef.textContent).toContain(rtA.taskNo)
    expect(taskRef.textContent).toContain(rtB.taskNo)

    wrapper.unmount()
  })
})
