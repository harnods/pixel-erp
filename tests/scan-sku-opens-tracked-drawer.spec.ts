// @vitest-environment happy-dom
/**
 * Bug: scanning a batch/serial-tracked SKU's OWN barcode (not a specific
 * batch/serial number) should open its Manage/View drawer directly, matching
 * Receiving and Picking's existing behavior — instead of PutAwayItemsPage
 * rejecting it as "Barcode not found" (its SKU-scan branch explicitly
 * excluded tracked rows) and PackItemsPage silently incrementing packed qty
 * with no indication of which batch/serial it came from.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PutAwayItemsPage from '~/components/pages/PutAwayItemsPage.vue'
import PackItemsPage from '~/components/pages/PackItemsPage.vue'
import { addReceipt } from '~/data/receipts'
import { lineItemsForReceipt } from '~/data/receiptLineItems'
import { CATALOG } from '~/data/catalog'
import { createReceivingTask, startReceiving, endReceiving } from '~/data/receivingTasks'
import { addPutAwayTask, startPutAway } from '~/data/putAwayTasks'
import { addOutgoing, type OutgoingOrder } from '~/data/outgoing'
import { addPackingTaskFromOrder, startPacking } from '~/data/packingTasks'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const WAREHOUSE_ID = 'wh-006'
const WAREHOUSE_NAME = 'Gudang Makassar Selatan'
const CATEGORY_BY_SKU = new Map(CATALOG.map(p => [p.sku, p.category]))
const BATCH_CATS = new Set(['Green Beans', 'Roasted Beans'])
const BATCH_SKU = '1001' // Green Beans Arabica Gayo Grade 1 — batch-tracked

async function scan(wrapper: ReturnType<typeof mount>, value: string) {
  const input = wrapper.find('.scan-bar-input')
  await input.setValue(value)
  await input.trigger('keydown.enter')
  await flushPromises()
}

describe('Scanning a tracked SKU\'s own barcode opens its drawer directly', () => {
  it('PutAwayItemsPage: scanning the SKU opens Manage batch, not "Barcode not found"', async () => {
    const receipt = addReceipt({
      purchaseNo: 'PO-TEST-SCAN-DRAWER-PUTAWAY', warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
      skuQty: CATALOG.length, purchaseQty: 300, receivedQty: 0, status: 'on the way',
      estimatedArrival: '2026-08-01', trackingNos: [],
    })
    const sku = lineItemsForReceipt(receipt).find(l => BATCH_CATS.has(CATEGORY_BY_SKU.get(l.sku) ?? ''))!.sku
    const rt = createReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator', skus: [sku] })!
    startReceiving(rt.id)
    endReceiving(rt.id, { [sku]: 10 }, { [sku]: { batchLines: [{ batchNo: 'BATCH-SCAN-01', expiryDate: '2027-01-01', desc: '', qty: 10, unit: 'Sack' }] } })
    const pa = addPutAwayTask({
      receivingTaskIds: [rt.id], receivingTaskNos: [rt.taskNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    startPutAway(pa.id)

    const wrapper = mount(PutAwayItemsPage, { props: { orderId: pa.id } })
    await flushPromises()

    await scan(wrapper, sku)

    expect(wrapper.text()).not.toContain('Barcode not found')
    expect(wrapper.text()).toContain('Manage batch')
    expect(wrapper.text()).toContain('BATCH-SCAN-01')
    wrapper.unmount()
  })

  it('PackItemsPage: scanning the SKU opens View batch, not a silent qty increment', async () => {
    const order: OutgoingOrder = addOutgoing({
      salesNo: 'Test Scan Drawer Pack', source: 'Manual',
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
      skuQty: 1, orderQty: 5,
      shippedQty: 0, status: 'open', dueDate: '2026-08-01',
      lines: [{ sku: BATCH_SKU, productName: BATCH_SKU, desc: '', img: '', unit: 'Sack', qty: 5 }],
    })
    const task = addPackingTaskFromOrder({
      salesOrderId: order.id, salesNo: order.salesNo,
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    startPacking(task.id)
    const wrapper = mount(PackItemsPage, { props: { orderId: task.id } })
    await flushPromises()

    const draftQtyBefore = wrapper.vm as unknown as { draftQty: Record<string, number> }
    const before = { ...draftQtyBefore.draftQty }

    await scan(wrapper, BATCH_SKU)

    expect(wrapper.text()).not.toContain('Barcode not found')
    expect(wrapper.text()).toContain('Batch detail') // the View batch drawer's own title
    // Packed qty must NOT have silently incremented — the scan opened the
    // drawer instead of blindly counting an unidentified batch.
    const draftQtyAfter = wrapper.vm as unknown as { draftQty: Record<string, number> }
    expect(draftQtyAfter.draftQty).toEqual(before)
    wrapper.unmount()
  })
})
