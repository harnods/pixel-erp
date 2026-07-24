// @vitest-environment happy-dom
/**
 * PM report: while the put-away "Manage batch" drawer is open for SKU A,
 * scanning a batch barcode that actually belongs to a DIFFERENT SKU (B) must
 * be rejected — the drawer's own scan bar is scoped to SKU A only. That
 * rejection should happen ONLY for the drawer's own scan bar; the page-level
 * scan bar (PutAwayItemsPage's, "the front scanner") is a separate, correctly
 * global scan surface that's allowed to resolve any SKU's batch/serial while
 * a different SKU's drawer happens to be open elsewhere.
 *
 * This is a verification test, not a fix — handlePutAwayScan() in
 * ManageBatchDrawer.vue already resolves a scan that doesn't match any row in
 * THIS drawer against the warehouse's real stock (resolveScan) and rejects it
 * with "<code> belongs to SKU <other>, not <this>" whenever it belongs to a
 * different SKU. This test exists to make that behavior explicit and guarded
 * against regression, since no test previously covered the real-cross-SKU
 * case (existing put-away scan tests use a synthetic SKU not in real stock,
 * so resolveScan never actually found a different-SKU match for them).
 */
import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ManageBatchDrawer from '~/components/patterns/ManageBatchDrawer.vue'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import '~/data/outgoing'

const WAREHOUSE_ID = 'wh-006'
const BIN = 'Rak-01'

function twoBatchTrackedSkusWithDistinctBatches() {
  const stock = getWarehouseDetail(WAREHOUSE_ID)!.stock.filter((s) => (s.batches?.length ?? 0) > 0)
  const a = stock[0]!
  const b = stock.find((s) => s.sku !== a.sku)!
  return { skuA: a.sku, batchA: a.batches![0]!, skuB: b.sku, batchB: b.batches![0]! }
}

function mountDrawer(props: Record<string, unknown>) {
  return mount(ManageBatchDrawer, {
    props: {
      open: true, warehouseId: WAREHOUSE_ID,
      kind: 'put-away', destLocationPaths: [BIN],
      modelValue: [],
      ...props,
    },
  })
}

async function scan(wrapper: ReturnType<typeof mount>, value: string) {
  const input = wrapper.find('.scan-bar-input')
  await input.setValue(value)
  await input.trigger('keydown.enter')
  await flushPromises()
}

function destLocRowsInDom(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('tbody tr.mbd-tr').map((tr) => {
    const locInput = tr.find('.mbd-pa-loc-input')
    const qtyInput = tr.find('.mbd-qty-input')
    return {
      loc: locInput.exists() ? (locInput.element as HTMLInputElement).value : '',
      qty: qtyInput.exists() ? (qtyInput.element as HTMLInputElement).value : '',
    }
  })
}

describe('ManageBatchDrawer (put-away) — scanning a different SKU\'s batch is rejected', () => {
  it('rejects a batch barcode belonging to another SKU, with no assignment made', async () => {
    const { skuA, batchA, skuB, batchB } = twoBatchTrackedSkusWithDistinctBatches()
    const wrapper = mountDrawer({
      sku: skuA,
      modelValue: [{
        key: batchA.batchNo, batchNo: batchA.batchNo, expiryDate: batchA.expiryDate,
        desc: '', onHand: batchA.onHand, counted: null, unit: 'kg',
      }],
    })
    await flushPromises()

    await scan(wrapper, BIN)      // activate the bin first
    await scan(wrapper, batchB.batchNo) // scan SKU B's real batch number, while SKU A's drawer is open

    // Nothing got assigned in SKU A's drawer — the cross-SKU scan was rejected, not
    // silently absorbed as a new row or added to the existing one.
    expect(destLocRowsInDom(wrapper)).not.toContainEqual(expect.objectContaining({ qty: '1' }))
    expect(wrapper.text()).not.toContain(batchB.batchNo)
    wrapper.unmount()
  })

  it('still accepts a scan of the SKU\'s OWN batch number normally (sanity check)', async () => {
    const { skuA, batchA } = twoBatchTrackedSkusWithDistinctBatches()
    const wrapper = mountDrawer({
      sku: skuA,
      modelValue: [{
        key: batchA.batchNo, batchNo: batchA.batchNo, expiryDate: batchA.expiryDate,
        desc: '', onHand: batchA.onHand, counted: null, unit: 'kg',
      }],
    })
    await flushPromises()

    await scan(wrapper, BIN)
    await scan(wrapper, batchA.batchNo)

    expect(destLocRowsInDom(wrapper)).toContainEqual({ loc: BIN, qty: '1' })
    wrapper.unmount()
  })
})
