// @vitest-environment happy-dom
/**
 * Regression guard for receiving-mode enforcement of the Expected-qty ceiling
 * (`targetCount`) in ManageBatchDrawer.vue / ManageSerialDrawer.vue. Expected
 * qty is the HARD cap a task may never receive past (PRD over-receipt guard,
 * allow_receive_exceed_order = FALSE). `maxCount` (Purchase qty) is only a
 * reference number shown in the drawer, NOT a receivable ceiling — so these
 * tests deliberately set `maxCount` HIGHER than `targetCount` to prove the cap
 * tracks targetCount, not maxCount.
 */
import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ManageBatchDrawer from '~/components/patterns/ManageBatchDrawer.vue'
import ManageSerialDrawer from '~/components/patterns/ManageSerialDrawer.vue'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import '~/data/outgoing'

const WAREHOUSE_ID = 'wh-006'
const SERIAL_SKU = '2004' // Espresso Machine — serial-tracked

function firstBatchTrackedStock() {
  const stock = getWarehouseDetail(WAREHOUSE_ID)!.stock
  const item = stock.find((s) => (s.batches?.length ?? 0) > 0)!
  return { sku: item.sku, batch: item.batches![0]! }
}

function mountBatchDrawer(props: Record<string, unknown>) {
  return mount(ManageBatchDrawer, {
    props: { open: true, warehouseId: WAREHOUSE_ID, modelValue: [], ...props },
  })
}

function mountSerialDrawer(props: Record<string, unknown>) {
  return mount(ManageSerialDrawer, {
    props: {
      open: true, sku: SERIAL_SKU, warehouseId: WAREHOUSE_ID, targetCount: 1, modelValue: [],
      ...props,
    },
  })
}

function committedRowFor(batch: { batchNo: string; expiryDate: string; onHand: number; location: string }) {
  return {
    key: batch.batchNo, batchNo: batch.batchNo, expiryDate: batch.expiryDate,
    desc: '', onHand: batch.onHand, counted: null, unit: 'Unit', location: batch.location,
  }
}

async function scan(wrapper: ReturnType<typeof mount>, value: string) {
  const input = wrapper.find('.scan-bar-input')
  await input.setValue(value)
  await input.trigger('keydown.enter')
}

function rowCount(wrapper: ReturnType<typeof mount>): number {
  return wrapper.findAll('tbody tr').filter((r) => !r.classes().includes('msn-tr--empty')).length
}

describe('ManageBatchDrawer — receiving mode Save is capped by targetCount (Expected qty), not maxCount (Purchase qty)', () => {
  it('a counted qty above targetCount blocks Save, even though maxCount is higher', async () => {
    const { sku, batch } = firstBatchTrackedStock()
    const wrapper = mountBatchDrawer({
      // targetCount kept above the scan threshold (50) so the input isn't the
      // separate scan-required-disabled variant — that's a different feature.
      sku, kind: 'receiving', targetCount: 51, maxCount: 60,
      modelValue: [committedRowFor(batch)],
    })
    await flushPromises()

    const input = wrapper.find('td.mbd-td--counted input.mbd-qty-input')
    await input.setValue(52) // > targetCount (51), still < maxCount (60)
    await flushPromises()

    expect(wrapper.find('td.mbd-td--counted').classes()).toContain('mbd-td--counted-error')

    await wrapper.findAll('button').find((b) => b.text() === 'Save')!.trigger('click')
    await flushPromises()
    expect(wrapper.emitted('save')).toBeUndefined() // blocked, nothing silently dropped
    wrapper.unmount()
  })

  it('a counted qty at/below targetCount lets Save proceed', async () => {
    const { sku, batch } = firstBatchTrackedStock()
    const wrapper = mountBatchDrawer({
      sku, kind: 'receiving', targetCount: 51, maxCount: 60,
      modelValue: [committedRowFor(batch)],
    })
    await flushPromises()

    const input = wrapper.find('td.mbd-td--counted input.mbd-qty-input')
    await input.setValue(51) // == targetCount (Expected qty)
    await flushPromises()

    expect(wrapper.find('td.mbd-td--counted').classes()).not.toContain('mbd-td--counted-error')

    const saveBtn = wrapper.findAll('button').find((b) => b.text() === 'Save')!
    await saveBtn.trigger('click')
    await new Promise((r) => setTimeout(r, 650)) // handleSave's real 600ms "Saving…" delay
    await flushPromises()
    expect(wrapper.emitted('save')).toBeTruthy()
    wrapper.unmount()
  })
})

describe('ManageSerialDrawer — receiving mode scan/paste are capped by targetCount (Expected qty), not maxCount (Purchase qty)', () => {
  it('scanning a genuinely new serial past targetCount is rejected, even though maxCount is higher', async () => {
    const wrapper = mountSerialDrawer({ kind: 'receiving', targetCount: 2, maxCount: 5, modelValue: [] })
    await flushPromises()

    await scan(wrapper, 'CAP-SN-001') // 1st — under targetCount (2)
    await flushPromises()
    expect(rowCount(wrapper)).toBe(1)

    await scan(wrapper, 'CAP-SN-002') // 2nd — reaches targetCount (2), still allowed
    await flushPromises()
    expect(rowCount(wrapper)).toBe(2)

    await scan(wrapper, 'CAP-SN-003') // 3rd — exceeds targetCount (2) — rejected
    await flushPromises()
    expect(rowCount(wrapper)).toBe(2)
    expect(wrapper.text()).not.toContain('CAP-SN-003')
    wrapper.unmount()
  })

  it('bulk-paste adds only as many serials as fit under targetCount and reports the rest as skipped', async () => {
    // targetCount kept above the scan threshold (50) so the bulk-paste textarea
    // isn't the separate scan-required-disabled variant — a different feature.
    // maxCount is set far higher to prove the cap tracks targetCount.
    const wrapper = mountSerialDrawer({ kind: 'receiving', targetCount: 51, maxCount: 90, modelValue: [] })
    await flushPromises()

    const serials = Array.from({ length: 52 }, (_, i) => `PASTE-SN-${String(i + 1).padStart(3, '0')}`)
    const textarea = wrapper.find('textarea.msn-textarea')
    await textarea.setValue(serials.join(','))
    await wrapper.findAll('button').find((b) => b.text() === 'Add to list')!.trigger('click')
    await flushPromises()

    // Table paginates at 20 rows, so assert on the "Showing X of Y" total, not
    // the rendered row count: only 51 of the 52 pasted serials were committed.
    expect(wrapper.text()).toContain('of 51 serial numbers')
    expect(wrapper.text()).toContain('Exceeds expected qty, not added: PASTE-SN-052')
    wrapper.unmount()
  })
})
