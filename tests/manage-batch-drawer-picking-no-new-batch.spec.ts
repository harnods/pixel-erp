// @vitest-environment happy-dom
/**
 * Outbound (picking) may only take batches from existing stock — never create
 * a brand-new one. That's a receiving/count concern. Two entry points used to
 * let a new batch slip through in picking mode: the "Select batch" popover's
 * "Add new batch" item (gated only against kind==='transfer', not 'picking'),
 * and handleDrawerScan()'s "genuinely unrecognized code" fallback, which had
 * no kind check at all and silently registered any unknown scan as a new row.
 */
import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ManageBatchDrawer from '~/components/patterns/ManageBatchDrawer.vue'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import '~/data/outgoing'

const WAREHOUSE_ID = 'wh-006'

function firstBatchTrackedStock() {
  const stock = getWarehouseDetail(WAREHOUSE_ID)!.stock
  const item = stock.find((s) => (s.batches?.length ?? 0) > 0 && s.batches!.some((b) => b.available > 0))!
  return { sku: item.sku, batch: item.batches!.find((b) => b.available > 0)! }
}

function mountDrawer(props: Record<string, unknown>) {
  return mount(ManageBatchDrawer, {
    props: { open: true, warehouseId: WAREHOUSE_ID, modelValue: [], ...props },
  })
}

function rowCount(wrapper: ReturnType<typeof mount>): number {
  return wrapper.findAll('tbody tr.mbd-tr').length
}

async function scan(value: string) {
  const input = document.body.querySelector('.scan-bar-input') as HTMLInputElement
  input.value = value
  input.dispatchEvent(new Event('input'))
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await flushPromises()
}

describe('ManageBatchDrawer — picking mode never registers a brand-new batch', () => {
  it('scanning a genuinely unrecognized code is rejected, not added as a new row', async () => {
    const { sku } = firstBatchTrackedStock()
    const wrapper = mount(ManageBatchDrawer, {
      props: { open: true, warehouseId: WAREHOUSE_ID, sku, kind: 'picking', targetCount: 5, modelValue: [] },
      attachTo: document.body,
    })
    await flushPromises()
    const before = rowCount(wrapper)

    await scan('FAKE-UNKNOWN-BATCH-001')

    expect(rowCount(wrapper)).toBe(before)
    expect(wrapper.text()).not.toContain('FAKE-UNKNOWN-BATCH-001')
    wrapper.unmount()
  })

  it('scanning a real existing batch still works (picking from existing stock is allowed)', async () => {
    const { sku, batch } = firstBatchTrackedStock()
    const wrapper = mount(ManageBatchDrawer, {
      props: { open: true, warehouseId: WAREHOUSE_ID, sku, kind: 'picking', targetCount: 5, modelValue: [] },
      attachTo: document.body,
    })
    await flushPromises()
    const before = rowCount(wrapper)

    await scan(batch.batchNo)

    expect(rowCount(wrapper)).toBe(before + 1)
    expect(wrapper.text()).toContain(batch.batchNo)
    wrapper.unmount()
  })

  it('the "Select batch" popover has no "Add new batch" option', async () => {
    const { sku } = firstBatchTrackedStock()
    const wrapper = mount(ManageBatchDrawer, {
      props: { open: true, warehouseId: WAREHOUSE_ID, sku, kind: 'picking', targetCount: 5, modelValue: [] },
      attachTo: document.body,
    })
    await flushPromises()

    const trigger = document.body.querySelector('.mbd-batch-trigger') as HTMLElement
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(document.body.textContent).not.toContain('Add new batch')
    wrapper.unmount()
  })

  it('sanity: count mode (non-outbound) can still add a genuinely new batch by scan', async () => {
    const { sku } = firstBatchTrackedStock()
    const wrapper = mount(ManageBatchDrawer, {
      props: { open: true, warehouseId: WAREHOUSE_ID, sku, kind: 'count', targetCount: 5, modelValue: [] },
      attachTo: document.body,
    })
    await flushPromises()
    const before = rowCount(wrapper)

    await scan('FAKE-NEW-COUNT-BATCH-001')

    expect(rowCount(wrapper)).toBe(before + 1)
    // A brand-new row's batch number is an editable input, not static text —
    // the first mbd-cell-input in the row (the second is the description field).
    const newRowInput = wrapper.findAll('input.mbd-cell-input').at(0)
    expect((newRowInput!.element as HTMLInputElement).value).toBe('FAKE-NEW-COUNT-BATCH-001')
    wrapper.unmount()
  })
})
