// @vitest-environment happy-dom
/**
 * Bug: buildItemsAndAssignments() (PutAwayItemsPage.vue) only pushed a
 * completedItems entry PER ASSIGNED BIN for batch/serial-tracked rows. A row
 * nobody had assigned a bin to yet (untouched) produced ZERO entries, so
 * saving a draft after only partially working through a multi-SKU put-away
 * silently dropped every untouched SKU from the task entirely. Fixed by
 * always pushing exactly one entry per row (using its own total qty),
 * regardless of how many bins (including zero) are actually assigned.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed } from 'vue'
import PutAwayItemsPage from '~/components/pages/PutAwayItemsPage.vue'
import { addReceipt } from '~/data/receipts'
import { lineItemsForReceipt } from '~/data/receiptLineItems'
import { CATALOG } from '~/data/catalog'
import { createReceivingTask, startReceiving, endReceiving } from '~/data/receivingTasks'
import { addPutAwayTask, startPutAway } from '~/data/putAwayTasks'
import { getPutAwayLineItems } from '~/data/putAwayTaskDetails'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
vi.stubGlobal('computed', computed)
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const WAREHOUSE_ID = 'wh-006'
const WAREHOUSE_NAME = 'Gudang Makassar Selatan'
const CATEGORY_BY_SKU = new Map(CATALOG.map(p => [p.sku, p.category]))
const BATCH_CATS = new Set(['Green Beans', 'Roasted Beans'])

async function scan(wrapper: ReturnType<typeof mount>, value: string) {
  const input = wrapper.find('.scan-bar-input')
  await input.setValue(value)
  await input.trigger('keydown.enter')
  await flushPromises()
}

describe('PutAwayItemsPage — Save as draft must not drop untouched SKUs', () => {
  it('a batch-tracked SKU nobody assigned a bin to yet still exists after Save as draft', async () => {
    const receipt = addReceipt({
      purchaseNo: 'PO-TEST-DRAFT-KEEP', warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
      skuQty: CATALOG.length, purchaseQty: 300, receivedQty: 0, status: 'on the way',
      estimatedArrival: '2026-08-01', trackingNos: [],
    })
    const lines = lineItemsForReceipt(receipt)
    const plainSku = lines.find(l => !BATCH_CATS.has(CATEGORY_BY_SKU.get(l.sku) ?? ''))!.sku
    const batchSku = lines.find(l => BATCH_CATS.has(CATEGORY_BY_SKU.get(l.sku) ?? ''))!.sku

    const rt = createReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator', skus: [plainSku, batchSku] })!
    startReceiving(rt.id)
    endReceiving(rt.id, { [plainSku]: 1, [batchSku]: 5 }, {
      [batchSku]: { batchLines: [{ batchNo: 'BATCH-DRAFT-01', expiryDate: '2027-01-01', desc: '', qty: 5, unit: 'Sack' }] },
    })
    const pa = addPutAwayTask({
      receivingTaskIds: [rt.id], receivingTaskNos: [rt.taskNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    startPutAway(pa.id)

    // Sanity: both SKUs present before any draft is saved.
    expect(getPutAwayLineItems(pa.id).map(i => i.skuCode).sort()).toEqual([batchSku, plainSku].sort())

    const wrapper = mount(PutAwayItemsPage, { props: { orderId: pa.id } })
    await flushPromises()

    // Only touch the plain SKU — the batch-tracked SKU is left completely
    // untouched (no bin assigned), exactly like an operator partially working
    // through a multi-SKU put-away before saving a draft.
    await scan(wrapper, plainSku)

    const saveDraftBtn = Array.from(wrapper.findAll('button')).find(b => b.text() === 'Save as draft')!
    await saveDraftBtn.trigger('click')
    await flushPromises()

    const afterSave = getPutAwayLineItems(pa.id)
    expect(afterSave.map(i => i.skuCode).sort()).toEqual([batchSku, plainSku].sort())
    const batchRow = afterSave.find(i => i.skuCode === batchSku)!
    expect(batchRow.qty).toBe(5) // received qty preserved, not dropped to 0/undefined
    expect(batchRow.stored).toBe(0) // genuinely untouched — nothing assigned yet

    wrapper.unmount()
  })
})
