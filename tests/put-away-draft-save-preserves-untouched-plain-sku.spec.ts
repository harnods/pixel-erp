// @vitest-environment happy-dom
/**
 * Bug: savePutAwayDraft()/endPutAway() dropped every completedItems row with
 * qty === 0 (`items.filter((it) => it.qty > 0)`), meant to strip an abandoned
 * "Split storage location" row the operator never filled in. But a plain SKU's
 * draft row always starts at qty 0 until the operator actually enters a
 * put-away qty for it — so an untouched plain SKU got wiped from the task
 * exactly like a genuinely-abandoned split row would, the moment ANY other SKU
 * in the same put-away was saved. Fixed by only dropping a qty=0 row when a
 * sibling sharing the same (SKU, receivingTaskId) key already carries the
 * real qty — proving THAT row, not the SKU itself, is the abandoned one.
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
const TRACKED_CATS = new Set(['Green Beans', 'Roasted Beans', 'Espresso Machine', 'Grinder', 'Equipment'])

async function scan(wrapper: ReturnType<typeof mount>, value: string) {
  const input = wrapper.find('.scan-bar-input')
  await input.setValue(value)
  await input.trigger('keydown.enter')
  await flushPromises()
}

describe('PutAwayItemsPage — Save as draft must not drop untouched PLAIN SKUs', () => {
  it('an untouched plain SKU survives a draft save that only fills in a different plain SKU', async () => {
    const receipt = addReceipt({
      purchaseNo: 'PO-TEST-DRAFT-KEEP-PLAIN', warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
      skuQty: CATALOG.length, purchaseQty: 300, receivedQty: 0, status: 'on the way',
      estimatedArrival: '2026-08-01', trackingNos: [],
    })
    const plainSkus = lineItemsForReceipt(receipt)
      .filter(l => !TRACKED_CATS.has(CATEGORY_BY_SKU.get(l.sku) ?? ''))
      .slice(0, 2)
      .map(l => l.sku)
    expect(plainSkus.length).toBe(2)
    const [touchedSku, untouchedSku] = plainSkus

    const rt = createReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator', skus: plainSkus })!
    startReceiving(rt.id)
    endReceiving(rt.id, { [touchedSku]: 1, [untouchedSku]: 2 }, {})
    const pa = addPutAwayTask({
      receivingTaskIds: [rt.id], receivingTaskNos: [rt.taskNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    startPutAway(pa.id)

    expect(getPutAwayLineItems(pa.id).map(i => i.skuCode).sort()).toEqual([touchedSku, untouchedSku].sort())

    const wrapper = mount(PutAwayItemsPage, { props: { orderId: pa.id } })
    await flushPromises()

    // Only touch one plain SKU — the other is left completely untouched (qty
    // still 0), exactly like an operator partially working through a
    // multi-SKU put-away before saving a draft.
    await scan(wrapper, touchedSku)

    const saveDraftBtn = Array.from(wrapper.findAll('button')).find(b => b.text() === 'Save as draft')!
    await saveDraftBtn.trigger('click')
    await flushPromises()

    const afterSave = getPutAwayLineItems(pa.id)
    expect(afterSave.map(i => i.skuCode).sort()).toEqual([touchedSku, untouchedSku].sort())
    const untouchedRow = afterSave.find(i => i.skuCode === untouchedSku)!
    expect(untouchedRow.qty).toBe(2) // received qty preserved
    expect(untouchedRow.stored).toBe(0) // genuinely untouched

    wrapper.unmount()
  })
})
