// @vitest-environment happy-dom
/**
 * Page-level picking scan-bar BATCH guard (BUG 3, adversarial scan audit):
 * addOrIncrementBatch capped only at the order's expectedQty, never at the batch's
 * available — so scanning a batch repeatedly could pick MORE units than the batch
 * actually has free, eating into stock reserved for other orders (oversell). Now
 * capped at the batch's free available + this order's own reserved units of it.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PickItemsPage from '~/components/pages/PickItemsPage.vue'
import { addOutgoing, type OutgoingOrder } from '~/data/outgoing'
import { addPickingTask } from '~/data/pickingTasks'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import '~/data/outgoing'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const WH = 'wh-006', WH_NAME = 'Gudang Makassar Selatan'
const BATCH_SKU = '1001' // Green Beans — batch-tracked

async function scan(wrapper: ReturnType<typeof mount>, value: string) {
  const input = wrapper.find('.scan-bar-input')
  await input.setValue(value)
  await input.trigger('keydown.enter')
  await flushPromises()
}
const pickedStat = (wrapper: ReturnType<typeof mount>) =>
  Number(wrapper.findAll('.pik-stat').find((s) => s.text().includes('Picked qty'))!.find('.pik-stat-val').text())

describe('PickItemsPage — page-level batch scan guard', () => {
  it('BUG 3: batch scan cannot pick more units than the batch physically has', async () => {
    const batch = getWarehouseDetail(WH)!.stock.find((s) => s.sku === BATCH_SKU)!.batches![0]!
    const onHand = batch.onHand
    const orderQty = onHand + 6 // deliberately ask for more than the batch physically holds

    const o: OutgoingOrder = addOutgoing({
      salesNo: 'Batch Overpick', source: 'Manual', warehouseId: WH, warehouseName: WH_NAME,
      skuQty: 1, orderQty, shippedQty: 0, status: 'open', dueDate: '2026-08-01',
      lines: [{ sku: BATCH_SKU, productName: BATCH_SKU, desc: '', img: '', unit: 'Sack', qty: orderQty }],
    })
    const task = addPickingTask({ salesOrderIds: [o.id], salesNos: [o.salesNo], warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    const wrapper = mount(PickItemsPage, { props: { orderId: task.id } })
    await flushPromises()

    await scan(wrapper, batch.location) // active bin
    for (let i = 0; i < orderQty; i++) await scan(wrapper, batch.batchNo)

    const picked = pickedStat(wrapper)
    expect(picked).toBeLessThanOrEqual(onHand) // never more than physically exists
    expect(picked).toBeLessThan(orderQty)      // a batch-level cap kicked in (not just order-qty)
    wrapper.unmount()
  })
})
