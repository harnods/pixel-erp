// @vitest-environment happy-dom
/**
 * Bug: for an 'in progress' put-away task that was never actually draft-saved
 * (no completedItems), getPutAwayLineItems's fallback path used to fabricate
 * "Put-away qty" via a cosmetic percentage formula, completely disconnected from
 * the real per-batch/serial destination assignments the View drawers read — the
 * table could show "10 put away" while the drawer showed 0 and everything still
 * "Received"/unassigned. Fixed by deriving `stored` from the REAL assignment
 * data (batchLines' destLocations / serialAssignments' destLocationId) instead.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed } from 'vue'
import PutAwayDetailsPage from '~/components/pages/PutAwayDetailsPage.vue'
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

function freshReceipt(tag: string) {
  return addReceipt({
    purchaseNo: `PO-TEST-REALSTORED-${tag}`,
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
    skuQty: CATALOG.length, purchaseQty: 300, receivedQty: 0,
    status: 'on the way',
    estimatedArrival: '2026-08-01',
    trackingNos: [],
  })
}

describe('Put-away — an in-progress, never-draft-saved task shows REAL stored qty, never a fake percentage', () => {
  it('batch-tracked SKU: table\'s Put-away qty is 0 (nothing really assigned yet), matching the View batch drawer', async () => {
    const receipt = freshReceipt('batch')
    const sku = lineItemsForReceipt(receipt).find(l => CATEGORY_BY_SKU.get(l.sku) === 'Green Beans' || CATEGORY_BY_SKU.get(l.sku) === 'Roasted Beans')!.sku
    const rt = createReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator', skus: [sku] })!
    startReceiving(rt.id)
    endReceiving(rt.id, { [sku]: 40 }, { [sku]: { batchLines: [{ batchNo: 'BATCH-REAL-01', expiryDate: '2027-01-01', desc: '', qty: 40, unit: 'Sack' }] } })
    const pa = addPutAwayTask({
      receivingTaskIds: [rt.id], receivingTaskNos: [rt.taskNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    startPutAway(pa.id) // status becomes 'in progress', but no draft is ever saved

    const lineItems = getPutAwayLineItems(pa.id)
    const row = lineItems.find(it => it.skuCode === sku)!
    expect(row.stored).toBe(0)

    const wrapper = mount(PutAwayDetailsPage, { props: { orderId: pa.id } })
    await flushPromises()
    const btn = wrapper.find('button[aria-label="View batch"]')
    await btn.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Put-away qty')
    // The drawer's own "Put-away qty" stat must read 0 too — matching the table.
    const stat = wrapper.findAll('.vbd-stat').find(s => s.text().startsWith('Put-away qty'))
    expect(stat?.find('.vbd-stat-value').text()).toBe('0')
    wrapper.unmount()
  })

  it('serial-tracked SKU: table\'s Put-away qty is 0, and every serial in the View drawer reads "Received" (none "Assigned")', async () => {
    const receipt = freshReceipt('serial')
    const sku = lineItemsForReceipt(receipt).find(l => CATEGORY_BY_SKU.get(l.sku) === 'Espresso Machine' || CATEGORY_BY_SKU.get(l.sku) === 'Grinder' || CATEGORY_BY_SKU.get(l.sku) === 'Equipment')!.sku
    const rt = createReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator', skus: [sku] })!
    startReceiving(rt.id)
    endReceiving(rt.id, { [sku]: 3 }, { [sku]: { serialNumbers: ['SNREAL-0001', 'SNREAL-0002', 'SNREAL-0003'] } })
    const pa = addPutAwayTask({
      receivingTaskIds: [rt.id], receivingTaskNos: [rt.taskNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    startPutAway(pa.id)

    const lineItems = getPutAwayLineItems(pa.id)
    const row = lineItems.find(it => it.skuCode === sku)!
    expect(row.stored).toBe(0)

    const wrapper = mount(PutAwayDetailsPage, { props: { orderId: pa.id } })
    await flushPromises()
    const btn = wrapper.find('button[aria-label="View serial number"]')
    await btn.trigger('click')
    await flushPromises()
    expect(wrapper.text()).not.toContain('Assigned')
    expect(wrapper.text()).toContain('Received')
    wrapper.unmount()
  })
})
