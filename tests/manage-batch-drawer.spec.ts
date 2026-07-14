// @vitest-environment happy-dom
/**
 * Regression guard for the "Qty to pick" column ManageBatchDrawer.vue gained
 * next to "Available qty" in picking-execution mode. This column shows the
 * ORIGINAL per-batch plan (plannedBatches), distinct from "Available qty" (what's
 * physically in the batch) and from the editable "Picked qty" input. It must only
 * ever appear for kind="picking" + executionMode + a plannedBatches prop actually
 * given — every other combination (planning mode, other kinds, or the prop simply
 * omitted) must render exactly as before.
 */
import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ManageBatchDrawer from '~/components/patterns/ManageBatchDrawer.vue'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import '~/data/outgoing'

const WAREHOUSE_ID = 'wh-006'

function firstBatchTrackedStock() {
  const stock = getWarehouseDetail(WAREHOUSE_ID)!.stock
  const item = stock.find((s) => (s.batches?.length ?? 0) > 0)!
  return { sku: item.sku, batch: item.batches![0]! }
}

function mountDrawer(props: Record<string, unknown>) {
  return mount(ManageBatchDrawer, {
    props: {
      open: true,
      warehouseId: WAREHOUSE_ID,
      modelValue: [],
      ...props,
    },
  })
}

/** A row shaped like what PickItemsPage.vue actually feeds in (execution mode
 *  starts every row uncounted — `counted: null` — until scanned/typed). */
function committedRowFor(batch: { batchNo: string; expiryDate: string; onHand: number; location: string }) {
  return {
    key: batch.batchNo,
    batchNo: batch.batchNo,
    expiryDate: batch.expiryDate,
    desc: '',
    onHand: batch.onHand,
    counted: null,
    unit: 'Unit',
    location: batch.location,
  }
}

describe('ManageBatchDrawer — "Qty to pick" column (picking + executionMode + plannedBatches)', () => {
  it('renders the column with the correct per-batch qty when planned batches are given', async () => {
    const { sku, batch } = firstBatchTrackedStock()
    const wrapper = mountDrawer({
      sku,
      kind: 'picking',
      executionMode: true,
      targetCount: 1,
      modelValue: [committedRowFor(batch)],
      plannedBatches: [{ batchNo: batch.batchNo, qty: 2 }],
    })
    await flushPromises()

    expect(wrapper.find('th.mbd-th--planned').exists()).toBe(true)
    const row = wrapper.findAll('tbody tr').find((r) => r.text().includes(batch.batchNo))
    expect(row?.find('td.mbd-td--planned').text()).toBe('2')
    wrapper.unmount()
  })

  it('does not render the column when plannedBatches is omitted (existing callers unaffected)', async () => {
    const { sku, batch } = firstBatchTrackedStock()
    const wrapper = mountDrawer({
      sku,
      kind: 'picking',
      executionMode: true,
      targetCount: 1,
      modelValue: [committedRowFor(batch)],
    })
    await flushPromises()

    expect(wrapper.find('th.mbd-th--planned').exists()).toBe(false)
    expect(wrapper.find('td.mbd-td--planned').exists()).toBe(false)
    wrapper.unmount()
  })

  it('does not render the column in planning mode (kind=picking, no executionMode), even if plannedBatches were passed', async () => {
    const { sku, batch } = firstBatchTrackedStock()
    const wrapper = mountDrawer({
      sku,
      kind: 'picking',
      targetCount: 1,
      modelValue: [committedRowFor(batch)],
      plannedBatches: [{ batchNo: batch.batchNo, qty: 2 }],
    })
    await flushPromises()

    expect(wrapper.find('th.mbd-th--planned').exists()).toBe(false)
    expect(wrapper.find('td.mbd-td--planned').exists()).toBe(false)
    wrapper.unmount()
  })

  it('does not render the column for a non-picking kind, even with plannedBatches passed', async () => {
    const { sku, batch } = firstBatchTrackedStock()
    const wrapper = mountDrawer({
      sku,
      kind: 'count',
      modelValue: [committedRowFor(batch)],
      plannedBatches: [{ batchNo: batch.batchNo, qty: 2 }],
    })
    await flushPromises()

    expect(wrapper.find('th.mbd-th--planned').exists()).toBe(false)
    expect(wrapper.find('td.mbd-td--planned').exists()).toBe(false)
    wrapper.unmount()
  })
})
