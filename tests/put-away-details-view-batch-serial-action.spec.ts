// @vitest-environment happy-dom
/**
 * Same PM request as receiving: on the put-away task details page, batch/serial-
 * tracked SKU rows get a rightmost "View batch"/"View serial number" icon button
 * (read-only drawer). Unlike receiving (where nothing exists until you actually
 * start receiving) and unlike this page's own Storage location column (genuinely
 * undecided until put-away happens), a put-away's batch/serial identity is
 * already a settled fact inherited from its source receiving task — so the
 * button shows regardless of status, including 'Open'.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed } from 'vue'
import PutAwayDetailsPage from '~/components/pages/PutAwayDetailsPage.vue'
import { addReceipt } from '~/data/receipts'
import { lineItemsForReceipt } from '~/data/receiptLineItems'
import { createReceivingTask, startReceiving, endReceiving } from '~/data/receivingTasks'
import { addPutAwayTask, startPutAway, savePutAwayDraft, endPutAway, cancelPutAway } from '~/data/putAwayTasks'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
vi.stubGlobal('computed', computed) // ErpStatusBadge relies on the Nuxt auto-import
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const WAREHOUSE_ID = 'wh-006'
const WAREHOUSE_NAME = 'Gudang Makassar Selatan'

/** SKU numbering (see app/data/catalog.ts): 10xx/11xx = batch-tracked, 20xx/21xx/22xx
 *  = serial-tracked. addReceipt's single-line SKU is hash-derived from the fresh
 *  receipt id, so retry until the prefix lands in the wanted category. */
function freshPendingPutAway(prefixes: string[], batchOrSerial: 'batchLines' | 'serialNumbers', payload: unknown) {
  for (let i = 0; i < 40; i++) {
    const receipt = addReceipt({
      purchaseNo: `PO-TEST-PA-VIEWACTION-${i}`,
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
      skuQty: 1, purchaseQty: 20, receivedQty: 0,
      status: 'on the way',
      estimatedArrival: '2026-08-01',
      trackingNos: [],
    })
    const sku = lineItemsForReceipt(receipt)[0]!.sku
    if (!prefixes.some(p => sku.startsWith(p))) continue
    const rt = createReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator', skus: [sku] })!
    startReceiving(rt.id)
    endReceiving(rt.id, { [sku]: 20 }, { [sku]: { [batchOrSerial]: payload } as never })
    const pa = addPutAwayTask({
      receivingTaskIds: [rt.id], receivingTaskNos: [rt.taskNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    return { paId: pa.id, sku }
  }
  throw new Error('Could not find a fresh receipt landing on the wanted SKU category')
}

describe('PutAwayDetailsPage — View batch/serial action column', () => {
  it('an Open task already shows "View batch", since batch identity is inherited from receiving, not decided by put-away itself', async () => {
    const { paId } = freshPendingPutAway(['10', '11'], 'batchLines', [
      { batchNo: 'BATCH-TEST-OPEN', expiryDate: '2027-01-01', desc: 'Test batch', qty: 20, unit: 'Sack' },
    ])

    const wrapper = mount(PutAwayDetailsPage, { props: { orderId: paId } })
    await flushPromises()

    // The main items table's own Storage location column genuinely isn't decided
    // yet on an Open task — stays hidden (unlike the Batch/SN action button).
    const tableHeaders = wrapper.findAll('table.detail-items th.detail-th').map(h => h.text())
    expect(tableHeaders).not.toContain('Storage location')

    const btn = wrapper.find('button[aria-label="View batch"]')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('BATCH-TEST-OPEN')
    wrapper.unmount()
  })

  it('an in-progress task with a batch-tracked SKU shows "View batch", opening a read-only drawer with the assigned location + "Put-away qty"', async () => {
    const { paId, sku } = freshPendingPutAway(['10', '11'], 'batchLines', [
      { batchNo: 'BATCH-TEST-01', expiryDate: '2027-01-01', desc: 'Test batch', qty: 20, unit: 'Sack' },
    ])
    startPutAway(paId)
    savePutAwayDraft(paId, [{ skuCode: sku, qty: 20, binLocation: 'A-01-01' }], {
      batchAssignments: { [sku]: [{ batchNo: 'BATCH-TEST-01', expiryDate: '2027-01-01', desc: 'Test batch', qty: 20, unit: 'Sack', destLocations: [{ locationId: 'A-01-01', qty: 12 }] }] },
    })

    const wrapper = mount(PutAwayDetailsPage, { props: { orderId: paId } })
    await flushPromises()

    const btn = wrapper.find('button[aria-label="View batch"]')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Put-away qty')
    expect(wrapper.text()).toContain('BATCH-TEST-01')
    expect(wrapper.text()).toContain('A-01-01')
    wrapper.unmount()
  })

  it('a completed task with a serial-tracked SKU shows "View serial number", opening a read-only drawer with the assigned destinations', async () => {
    const { paId, sku } = freshPendingPutAway(['20', '21', '22'], 'serialNumbers', ['SNTEST-0001', 'SNTEST-0002'])
    startPutAway(paId)
    endPutAway(paId, [{ skuCode: sku, qty: 20, binLocation: 'B-02-01' }], {
      serialAssignments: { [sku]: [{ serial: 'SNTEST-0001', destLocationId: 'B-02-01' }, { serial: 'SNTEST-0002' }] },
    })

    const wrapper = mount(PutAwayDetailsPage, { props: { orderId: paId } })
    await flushPromises()

    const btn = wrapper.find('button[aria-label="View serial number"]')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('SNTEST-0001')
    expect(wrapper.text()).toContain('SNTEST-0002')
    wrapper.unmount()
  })

  it('a canceled task still shows the action button for a batch-tracked SKU, even with nothing stored yet', async () => {
    const { paId } = freshPendingPutAway(['10', '11'], 'batchLines', [
      { batchNo: 'BATCH-TEST-CANCEL', expiryDate: '2027-01-01', desc: 'Test batch', qty: 20, unit: 'Sack' },
    ])
    cancelPutAway(paId, 'Created by mistake')

    const wrapper = mount(PutAwayDetailsPage, { props: { orderId: paId } })
    await flushPromises()

    expect(wrapper.find('button[aria-label="View batch"]').exists()).toBe(true)
    wrapper.unmount()
  })
})
