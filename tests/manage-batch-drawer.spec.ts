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
import { MpTooltip } from '@mekari/pixel3'
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

describe('ManageBatchDrawer — put-away: "Put away qty" header and storage-location validation', () => {
  function committedBatchRow(overrides: Record<string, unknown> = {}) {
    return {
      key: 'BATCH-001', batchNo: 'BATCH-001', expiryDate: '2027-01-01', desc: '', onHand: 5, counted: 5, unit: 'Sack',
      ...overrides,
    }
  }

  it('table header reads "Put away qty", not "Received qty"', async () => {
    const wrapper = mountDrawer({ sku: '1001', kind: 'put-away', modelValue: [committedBatchRow()] })
    await flushPromises()

    const headers = wrapper.findAll('th').map((h) => h.text())
    expect(headers).toContain('Put away qty')
    expect(headers).not.toContain('Received qty')
    wrapper.unmount()
  })

  it('entering a qty without picking a storage location blocks Save and marks the location cell as an error', async () => {
    const wrapper = mountDrawer({
      sku: '1001', kind: 'put-away',
      modelValue: [committedBatchRow()],
      destLocationPaths: ['A-01-01', 'A-01-02'],
    })
    await flushPromises()
    expect(wrapper.find('td.mbd-td--pa-loc-error').exists()).toBe(false) // no error before any attempt

    await wrapper.find('td.mbd-td--pa-qty input').setValue('3')
    await wrapper.findAll('button').find((b) => b.text() === 'Save')!.trigger('click')
    await flushPromises()

    expect(wrapper.emitted('save')).toBeUndefined() // blocked, nothing silently dropped
    expect(wrapper.find('td.mbd-td--pa-loc-error').exists()).toBe(true)
    wrapper.unmount()
  })

  it('the error tooltip explaining the missing location only appears once Save was attempted', async () => {
    // Checked via the MpTooltip component instance/props rather than its rendered
    // portal content — floating-ui's position computation isn't fully supported
    // by happy-dom, so asserting on the actual tooltip popup DOM is unreliable here.
    const wrapper = mountDrawer({
      sku: '1001', kind: 'put-away',
      modelValue: [committedBatchRow()],
      destLocationPaths: ['A-01-01', 'A-01-02'],
    })
    await flushPromises()
    await wrapper.find('td.mbd-td--pa-qty input').setValue('3')
    await flushPromises()
    expect(
      wrapper.findAllComponents(MpTooltip).some((t) => t.props('label') === 'Select a storage location for the qty entered'),
    ).toBe(false) // not yet — Save hasn't been attempted

    await wrapper.findAll('button').find((b) => b.text() === 'Save')!.trigger('click')
    await flushPromises()

    expect(
      wrapper.findAllComponents(MpTooltip).some((t) => t.props('label') === 'Select a storage location for the qty entered'),
    ).toBe(true)
    wrapper.unmount()
  })

  it('clearing the qty back to 0 clears the error and lets Save proceed', async () => {
    const wrapper = mountDrawer({
      sku: '1001', kind: 'put-away',
      modelValue: [committedBatchRow()],
      destLocationPaths: ['A-01-01', 'A-01-02'],
    })
    await flushPromises()

    await wrapper.find('td.mbd-td--pa-qty input').setValue('3')
    const saveBtn = wrapper.findAll('button').find((b) => b.text() === 'Save')!
    await saveBtn.trigger('click')
    await flushPromises()
    expect(wrapper.find('td.mbd-td--pa-loc-error').exists()).toBe(true)

    await wrapper.find('td.mbd-td--pa-qty input').setValue('0')
    await saveBtn.trigger('click')
    await new Promise((r) => setTimeout(r, 650)) // handleSave's real 600ms "Saving…" delay
    await flushPromises()

    expect(wrapper.emitted('save')).toBeTruthy()
    expect(wrapper.find('td.mbd-td--pa-loc-error').exists()).toBe(false)
    wrapper.unmount()
  })
})
