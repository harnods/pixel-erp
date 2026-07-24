// @vitest-environment happy-dom
/**
 * Picking Manage batch drawer: scanning a batch must stop once picked qty reaches
 * the qty to pick (the reserved ceiling). Before the fix, handleDrawerScan kept
 * incrementing counted past targetCount — an operator could over-pick by scanning.
 * (User can still manually select a different batch to re-allocate within the ceiling.)
 */
import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ManageBatchDrawer from '~/components/patterns/ManageBatchDrawer.vue'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import '~/data/outgoing'

const WAREHOUSE_ID = 'wh-006'

async function scan(wrapper: ReturnType<typeof mount>, value: string) {
  const input = wrapper.find('.scan-bar-input')
  await input.setValue(value)
  await input.trigger('keydown.enter')
  await flushPromises()
}
const pickedInputs = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll('input[type="number"]').map((i) => (i.element as HTMLInputElement).value)

describe('ManageBatchDrawer (picking) — scan stops at qty to pick', () => {
  it('scanning the reserved batch past the qty to pick is rejected (caps at targetCount)', async () => {
    const item = getWarehouseDetail(WAREHOUSE_ID)!.stock.find(
      (s) => (s.batches?.length ?? 0) > 0 && s.batches!.some((b) => b.available >= 2),
    )!
    const batch = item.batches!.find((b) => b.available >= 2)!
    const TARGET = 2

    const wrapper = mount(ManageBatchDrawer, {
      props: {
        open: true, warehouseId: WAREHOUSE_ID, sku: item.sku, kind: 'picking',
        targetCount: TARGET,
        // reserved batch pre-shown as the plan, uncounted until scanned
        modelValue: [{
          key: batch.batchNo, batchNo: batch.batchNo, expiryDate: batch.expiryDate,
          onHand: batch.available, counted: null, unit: item.unit, location: batch.location,
        }],
        originLocationPaths: [batch.location],
      },
    })
    await flushPromises()

    await scan(wrapper, batch.location)   // active bin
    await scan(wrapper, batch.batchNo)    // picked 1
    await scan(wrapper, batch.batchNo)    // picked 2 (== qty to pick)
    await scan(wrapper, batch.batchNo)    // over the ceiling → must be rejected

    // The batch row's picked qty caps at the qty to pick, never 3.
    expect(pickedInputs(wrapper)).toContain(String(TARGET))
    expect(pickedInputs(wrapper)).not.toContain('3')
    wrapper.unmount()
  })
})
