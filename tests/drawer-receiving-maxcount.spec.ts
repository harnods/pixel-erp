// @vitest-environment happy-dom
/**
 * Regression guard for receiving-mode enforcement of the real Purchase-qty
 * ceiling (`maxCount`) in ManageBatchDrawer.vue / ManageSerialDrawer.vue,
 * added alongside the "Expected qty" feature. `targetCount` is now a softer
 * target (Expected qty) that received qty may exceed; `maxCount` (falls back
 * to `targetCount` when omitted) is the hard ceiling (Purchase qty) that may
 * never be exceeded. These tests deliberately set `maxCount` HIGHER than
 * `targetCount` to prove the cap tracks maxCount, not targetCount.
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

describe('ManageBatchDrawer — receiving mode Save is capped by maxCount (Purchase qty), not targetCount (Expected qty)', () => {
  it('a counted qty above maxCount blocks Save, even though targetCount is lower', async () => {
    const { sku, batch } = firstBatchTrackedStock()
    const wrapper = mountBatchDrawer({
      // targetCount kept above the scan threshold (50) so the input isn't the
      // separate scan-required-disabled variant — that's a different feature.
      sku, kind: 'receiving', targetCount: 51, maxCount: 53,
      modelValue: [committedRowFor(batch)],
    })
    await flushPromises()

    const input = wrapper.find('td.mbd-td--counted input.mbd-qty-input')
    await input.setValue(60) // > maxCount (53)
    await flushPromises()

    expect(wrapper.find('td.mbd-td--counted').classes()).toContain('mbd-td--counted-error')

    await wrapper.findAll('button').find((b) => b.text() === 'Save')!.trigger('click')
    await flushPromises()
    expect(wrapper.emitted('save')).toBeUndefined() // blocked, nothing silently dropped
    wrapper.unmount()
  })

  it('a counted qty at/below maxCount lets Save proceed, even though it is above targetCount', async () => {
    const { sku, batch } = firstBatchTrackedStock()
    const wrapper = mountBatchDrawer({
      sku, kind: 'receiving', targetCount: 51, maxCount: 53,
      modelValue: [committedRowFor(batch)],
    })
    await flushPromises()

    const input = wrapper.find('td.mbd-td--counted input.mbd-qty-input')
    await input.setValue(52) // > targetCount (51), <= maxCount (53)
    await flushPromises()

    expect(wrapper.find('td.mbd-td--counted').classes()).not.toContain('mbd-td--counted-error')

    const saveBtn = wrapper.findAll('button').find((b) => b.text() === 'Save')!
    await saveBtn.trigger('click')
    await new Promise((r) => setTimeout(r, 650)) // handleSave's real 600ms "Saving…" delay
    await flushPromises()
    expect(wrapper.emitted('save')).toBeTruthy()
    wrapper.unmount()
  })

  it('without maxCount, receiving mode falls back to capping against targetCount itself', async () => {
    const { sku, batch } = firstBatchTrackedStock()
    const wrapper = mountBatchDrawer({
      sku, kind: 'receiving', targetCount: 51,
      modelValue: [committedRowFor(batch)],
    })
    await flushPromises()

    const input = wrapper.find('td.mbd-td--counted input.mbd-qty-input')
    await input.setValue(55) // > targetCount (51), no maxCount given
    await flushPromises()

    expect(wrapper.find('td.mbd-td--counted').classes()).toContain('mbd-td--counted-error')
    await wrapper.findAll('button').find((b) => b.text() === 'Save')!.trigger('click')
    await flushPromises()
    expect(wrapper.emitted('save')).toBeUndefined()
    wrapper.unmount()
  })
})

describe('ManageSerialDrawer — receiving mode scan/paste are capped by maxCount (Purchase qty), not targetCount (Expected qty)', () => {
  it('scanning a genuinely new serial past maxCount is rejected, even though targetCount was already exceeded', async () => {
    const wrapper = mountSerialDrawer({ kind: 'receiving', targetCount: 1, maxCount: 2, modelValue: [] })
    await flushPromises()

    await scan(wrapper, 'MAXCOUNT-SN-001') // 1st — under maxCount (2)
    await flushPromises()
    expect(rowCount(wrapper)).toBe(1)

    await scan(wrapper, 'MAXCOUNT-SN-002') // 2nd — reaches maxCount (2), still allowed
    await flushPromises()
    expect(rowCount(wrapper)).toBe(2)

    await scan(wrapper, 'MAXCOUNT-SN-003') // 3rd — exceeds maxCount (2) — rejected
    await flushPromises()
    expect(rowCount(wrapper)).toBe(2)
    expect(wrapper.text()).not.toContain('MAXCOUNT-SN-003')
    wrapper.unmount()
  })

  it('bulk-paste adds only as many serials as fit under maxCount and reports the rest as skipped', async () => {
    // targetCount kept above the scan threshold (50) so the bulk-paste textarea
    // isn't the separate scan-required-disabled variant — a different feature.
    const wrapper = mountSerialDrawer({ kind: 'receiving', targetCount: 51, maxCount: 2, modelValue: [] })
    await flushPromises()

    const textarea = wrapper.find('textarea.msn-textarea')
    await textarea.setValue('PASTE-SN-001,PASTE-SN-002,PASTE-SN-003')
    await wrapper.findAll('button').find((b) => b.text() === 'Add to list')!.trigger('click')
    await flushPromises()

    expect(rowCount(wrapper)).toBe(2) // only 2 fit under maxCount
    const rowSerials = wrapper.findAll('tbody tr').map((r) => r.text())
    expect(rowSerials.some((t) => t.includes('PASTE-SN-001'))).toBe(true)
    expect(rowSerials.some((t) => t.includes('PASTE-SN-002'))).toBe(true)
    expect(rowSerials.some((t) => t.includes('PASTE-SN-003'))).toBe(false) // never became a row
    expect(wrapper.text()).toContain('Exceeds purchase qty, not added: PASTE-SN-003')
    wrapper.unmount()
  })
})
