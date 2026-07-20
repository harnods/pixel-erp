// @vitest-environment happy-dom
/**
 * Batch/serial-tracked SKUs used to show a bare "—" in the Storage location
 * column (both on PutAwayDetailsPage.vue and PutAwayItemsPage.vue), forcing the
 * operator to open the Manage/View batch/serial drawer just to see WHICH bin(s)
 * are already in use. Fixed by showing the real assigned bin(s) directly in the
 * row — the drawer is only needed for the specific batch/serial identities.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed } from 'vue'
import PutAwayDetailsPage from '~/components/pages/PutAwayDetailsPage.vue'
import PutAwayItemsPage from '~/components/pages/PutAwayItemsPage.vue'
import { addReceipt } from '~/data/receipts'
import { lineItemsForReceipt } from '~/data/receiptLineItems'
import { CATALOG } from '~/data/catalog'
import { createReceivingTask, startReceiving, endReceiving } from '~/data/receivingTasks'
import { addPutAwayTask, startPutAway, savePutAwayDraft } from '~/data/putAwayTasks'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
vi.stubGlobal('computed', computed)
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const WAREHOUSE_ID = 'wh-006'
const WAREHOUSE_NAME = 'Gudang Makassar Selatan'
const CATEGORY_BY_SKU = new Map(CATALOG.map(p => [p.sku, p.category]))

function freshReceipt(tag: string) {
  return addReceipt({
    purchaseNo: `PO-TEST-BINSUMMARY-${tag}`,
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
    skuQty: CATALOG.length, purchaseQty: 300, receivedQty: 0,
    status: 'on the way',
    estimatedArrival: '2026-08-01',
    trackingNos: [],
  })
}

describe('Put-away — batch/serial Storage location shows real assigned bin(s), not a bare placeholder', () => {
  it('PutAwayDetailsPage.vue: batch split across 2 bins shows BOTH bin names in the Storage location column', async () => {
    const receipt = freshReceipt('details-batch')
    const sku = lineItemsForReceipt(receipt).find(l => CATEGORY_BY_SKU.get(l.sku) === 'Green Beans' || CATEGORY_BY_SKU.get(l.sku) === 'Roasted Beans')!.sku
    const rt = createReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator', skus: [sku] })!
    startReceiving(rt.id)
    endReceiving(rt.id, { [sku]: 40 }, { [sku]: { batchLines: [{ batchNo: 'BATCH-BIN-01', expiryDate: '2027-01-01', desc: '', qty: 40, unit: 'Sack' }] } })
    const pa = addPutAwayTask({
      receivingTaskIds: [rt.id], receivingTaskNos: [rt.taskNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    startPutAway(pa.id)
    savePutAwayDraft(pa.id, [
      { skuCode: sku, receivingTaskId: rt.id, qty: 30, binLocation: 'A-01-01' },
    ], {
      batchAssignments: {
        [sku]: [{ batchNo: 'BATCH-BIN-01', expiryDate: '2027-01-01', desc: '', qty: 40, unit: 'Sack', destLocations: [{ locationId: 'A-01-01', qty: 25 }, { locationId: 'A-02-01', qty: 5 }] }],
      },
    })

    const wrapper = mount(PutAwayDetailsPage, { props: { orderId: pa.id } })
    await flushPromises()

    const bodyText = wrapper.find('tbody').text()
    expect(bodyText).toContain('A-01-01')
    expect(bodyText).toContain('A-02-01')
    wrapper.unmount()
  })

  it('PutAwayItemsPage.vue: serial-tracked SKU with an assigned bin shows the bin directly, no drawer needed', async () => {
    const receipt = freshReceipt('items-serial')
    const sku = lineItemsForReceipt(receipt).find(l => CATEGORY_BY_SKU.get(l.sku) === 'Espresso Machine' || CATEGORY_BY_SKU.get(l.sku) === 'Grinder' || CATEGORY_BY_SKU.get(l.sku) === 'Equipment')!.sku
    const rt = createReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator', skus: [sku] })!
    startReceiving(rt.id)
    endReceiving(rt.id, { [sku]: 2 }, { [sku]: { serialNumbers: ['SN-BIN-0001', 'SN-BIN-0002'] } })
    const pa = addPutAwayTask({
      receivingTaskIds: [rt.id], receivingTaskNos: [rt.taskNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    startPutAway(pa.id)
    savePutAwayDraft(pa.id, [], {
      serialAssignments: {
        [sku]: [{ serial: 'SN-BIN-0001', destLocationId: 'B-03-01' }, { serial: 'SN-BIN-0002' }],
      },
    })

    const wrapper = mount(PutAwayItemsPage, { props: { orderId: pa.id } })
    await flushPromises()

    expect(wrapper.text()).toContain('B-03-01')
    wrapper.unmount()
  })

  it('PutAwayItemsPage.vue: nothing assigned yet shows "—", not a stale/wrong bin', async () => {
    const receipt = freshReceipt('items-empty')
    const sku = lineItemsForReceipt(receipt).find(l => CATEGORY_BY_SKU.get(l.sku) === 'Green Beans' || CATEGORY_BY_SKU.get(l.sku) === 'Roasted Beans')!.sku
    const rt = createReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator', skus: [sku] })!
    startReceiving(rt.id)
    endReceiving(rt.id, { [sku]: 20 }, { [sku]: { batchLines: [{ batchNo: 'BATCH-EMPTY-01', expiryDate: '2027-01-01', desc: '', qty: 20, unit: 'Sack' }] } })
    const pa = addPutAwayTask({
      receivingTaskIds: [rt.id], receivingTaskNos: [rt.taskNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })

    const wrapper = mount(PutAwayItemsPage, { props: { orderId: pa.id } })
    await flushPromises()

    const cell = wrapper.find('td.pi-td--location-summary')
    expect(cell.exists()).toBe(true)
    expect(cell.text()).toBe('—')
    wrapper.unmount()
  })
})
