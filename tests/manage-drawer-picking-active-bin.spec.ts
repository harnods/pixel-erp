// @vitest-environment happy-dom
/**
 * PM audit: picking's Manage batch/serial drawers should require the reverse
 * of put-away's active-bin scan model — scan the origin bin barcode first,
 * then a batch/serial scan only counts as picked once confirmed coming from
 * that same bin. This file specifically proves the gate is load-bearing (a
 * batch/serial scan with NO active bin is rejected, not silently accepted),
 * which the broader behavior tests elsewhere don't isolate on their own.
 */
import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ManageBatchDrawer from '~/components/patterns/ManageBatchDrawer.vue'
import ManageSerialDrawer from '~/components/patterns/ManageSerialDrawer.vue'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import '~/data/outgoing'

const WAREHOUSE_ID = 'wh-006'

function firstBatchTrackedStock() {
  const stock = getWarehouseDetail(WAREHOUSE_ID)!.stock
  const item = stock.find((s) => (s.batches?.length ?? 0) > 0 && s.batches!.some((b) => b.available > 0))!
  return { sku: item.sku, batch: item.batches!.find((b) => b.available > 0)! }
}

function firstSerialTrackedStock() {
  const stock = getWarehouseDetail(WAREHOUSE_ID)!.stock
  const item = stock.find((s) => (s.serials?.available.length ?? 0) > 0)!
  return { sku: item.sku, unit: item.serials!.available[0]! }
}

async function scan(wrapper: ReturnType<typeof mount>, value: string) {
  const input = wrapper.find('.scan-bar-input')
  await input.setValue(value)
  await input.trigger('keydown.enter')
  await flushPromises()
}

describe('ManageBatchDrawer (picking) — batch scan requires an active bin', () => {
  it('rejects a batch scan with no bin scanned yet — no qty change', async () => {
    const { sku, batch } = firstBatchTrackedStock()
    const wrapper = mount(ManageBatchDrawer, {
      props: {
        open: true, warehouseId: WAREHOUSE_ID, sku, kind: 'picking', targetCount: 5, modelValue: [],
        originLocationPaths: [batch.location],
      },
    })
    await flushPromises()
    const before = wrapper.findAll('tbody tr.mbd-tr').length

    await scan(wrapper, batch.batchNo)

    expect(wrapper.findAll('tbody tr.mbd-tr').length).toBe(before)
    expect(wrapper.text()).not.toContain(batch.batchNo)
    wrapper.unmount()
  })

  it('accepts the batch once its own bin has been scanned', async () => {
    const { sku, batch } = firstBatchTrackedStock()
    const wrapper = mount(ManageBatchDrawer, {
      props: {
        open: true, warehouseId: WAREHOUSE_ID, sku, kind: 'picking', targetCount: 5, modelValue: [],
        originLocationPaths: [batch.location],
      },
    })
    await flushPromises()
    const before = wrapper.findAll('tbody tr.mbd-tr').length

    await scan(wrapper, batch.location)
    await scan(wrapper, batch.batchNo)

    expect(wrapper.findAll('tbody tr.mbd-tr').length).toBe(before + 1)
    expect(wrapper.text()).toContain(batch.batchNo)
    wrapper.unmount()
  })
})

describe('ManageSerialDrawer (picking) — serial scan requires an active bin', () => {
  it('rejects a serial scan with no bin scanned yet', async () => {
    const { sku, unit } = firstSerialTrackedStock()
    const wrapper = mount(ManageSerialDrawer, {
      props: {
        open: true, warehouseId: WAREHOUSE_ID, sku, kind: 'picking', targetCount: 1, executionMode: true,
        modelValue: [], plannedSerials: [], originLocationPaths: [unit.location],
      },
    })
    await flushPromises()

    await scan(wrapper, unit.serial)

    const pickedStat = wrapper.findAll('.msn-stat').find((s) => s.text().includes('Picked qty'))
    expect(pickedStat?.text()).toMatch(/Picked qty\s*0/)
    wrapper.unmount()
  })

  it('accepts the serial once its own bin has been scanned', async () => {
    const { sku, unit } = firstSerialTrackedStock()
    const wrapper = mount(ManageSerialDrawer, {
      props: {
        open: true, warehouseId: WAREHOUSE_ID, sku, kind: 'picking', targetCount: 1, executionMode: true,
        modelValue: [], plannedSerials: [], originLocationPaths: [unit.location],
      },
    })
    await flushPromises()

    await scan(wrapper, unit.location)
    await scan(wrapper, unit.serial)

    const pickedStat = wrapper.findAll('.msn-stat').find((s) => s.text().includes('Picked qty'))
    expect(pickedStat?.text()).toMatch(/Picked qty\s*1/)
    wrapper.unmount()
  })
})
