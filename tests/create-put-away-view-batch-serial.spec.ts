// @vitest-environment happy-dom
/**
 * Same as put-away details: batch/serial identity is a settled fact from
 * receiving, so the "New put-away" form (before the put-away task even exists
 * yet) should already offer a "View batch"/"View serial number" action for the
 * SKUs it's about to bundle.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import CreatePutAwayPage from '~/components/pages/CreatePutAwayPage.vue'
import { addReceipt } from '~/data/receipts'
import { lineItemsForReceipt } from '~/data/receiptLineItems'
import { createReceivingTask, startReceiving, endReceiving } from '~/data/receivingTasks'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
vi.stubGlobal('useRoute', () => ({ query: {} }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const WAREHOUSE_ID = 'wh-006'
const WAREHOUSE_NAME = 'Gudang Makassar Selatan'

/** SKU numbering (see app/data/catalog.ts): 10xx/11xx = batch-tracked, 20xx/21xx/22xx
 *  = serial-tracked. addReceipt's single-line SKU is hash-derived from the fresh
 *  receipt id, so retry until the prefix lands in the wanted category. */
function freshPendingReceivingTask(prefixes: string[], batchOrSerial: 'batchLines' | 'serialNumbers', payload: unknown) {
  for (let i = 0; i < 40; i++) {
    const receipt = addReceipt({
      purchaseNo: `PO-TEST-NEWPA-${i}`,
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
    return { rt, sku }
  }
  throw new Error('Could not find a fresh receipt landing on the wanted SKU category')
}

describe('CreatePutAwayPage — View batch/serial action column', () => {
  it('a batch-tracked SKU on a selected receiving task shows "View batch", opening a read-only drawer with the recorded batch', async () => {
    const { rt, sku } = freshPendingReceivingTask(['10', '11'], 'batchLines', [
      { batchNo: 'BATCH-NEWPA-01', expiryDate: '2027-01-01', desc: 'Test batch', qty: 20, unit: 'Sack' },
    ])

    const wrapper = mount(CreatePutAwayPage, {
      props: {},
    })
    await flushPromises()
    // Drive the component's own reactive state directly (warehouse + task
    // selection) rather than simulating MpAutocomplete's internal dropdown UI.
    const vm = wrapper.vm as unknown as { warehouseId: string; selectedIds: Set<string> }
    vm.warehouseId = WAREHOUSE_ID
    await flushPromises()
    vm.selectedIds = new Set([rt.id])
    await flushPromises()

    const btn = wrapper.find('button[aria-label="View batch"]')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('BATCH-NEWPA-01')
    expect(wrapper.text()).toContain(sku)
    wrapper.unmount()
  })

  it('a serial-tracked SKU on a selected receiving task shows "View serial number", opening a read-only drawer with the recorded serials', async () => {
    const { rt } = freshPendingReceivingTask(['20', '21', '22'], 'serialNumbers', ['SNNEWPA-0001', 'SNNEWPA-0002'])

    const wrapper = mount(CreatePutAwayPage, { props: {} })
    await flushPromises()
    const vm = wrapper.vm as unknown as { warehouseId: string; selectedIds: Set<string> }
    vm.warehouseId = WAREHOUSE_ID
    await flushPromises()
    vm.selectedIds = new Set([rt.id])
    await flushPromises()

    const btn = wrapper.find('button[aria-label="View serial number"]')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('SNNEWPA-0001')
    expect(wrapper.text()).toContain('SNNEWPA-0002')
    wrapper.unmount()
  })
})
