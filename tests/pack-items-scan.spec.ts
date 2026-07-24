// @vitest-environment happy-dom
/**
 * Packing execution scan behavior (the gap: picking had scan tests, packing didn't).
 *  - Scanning a plain SKU's barcode increments that line's packed qty by 1.
 *  - It is capped at the picked qty (can't pack more than was picked).
 *  - Scanning a batch/serial-tracked SKU's barcode opens its read-only View drawer
 *    (packing doesn't re-decide batch/serial — that was fixed at picking).
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PackItemsPage from '~/components/pages/PackItemsPage.vue'
import { addOutgoing, type OutgoingOrder } from '~/data/outgoing'
import { addPickingTask, startPicking, endPicking } from '~/data/pickingTasks'
import { addPackingTask } from '~/data/packingTasks'
import '~/data/outgoing'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const WH = 'wh-006', WH_NAME = 'Gudang Makassar Selatan'
const PLAIN = '3004', BATCH = '1001'
const K = (orderId: string, sku: string) => `${orderId}::${sku}`

function pickedPackingTask(sku: string, qty: number): string {
  const o: OutgoingOrder = addOutgoing({
    salesNo: `Pack Scan ${sku}`, source: 'Manual', warehouseId: WH, warehouseName: WH_NAME,
    skuQty: 1, orderQty: qty, shippedQty: 0, status: 'open', dueDate: '2026-08-01',
    lines: [{ sku, productName: sku, desc: '', img: '', unit: 'Unit', qty }],
  })
  const pt = addPickingTask({ salesOrderIds: [o.id], salesNos: [o.salesNo], warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
  startPicking(pt.id)
  endPicking(pt.id, { [K(o.id, sku)]: qty })
  const pk = addPackingTask({ salesOrderId: o.id, salesNo: o.salesNo, pickingTaskId: pt.id, pickingTaskNo: pt.taskNo, warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
  return pk.id
}
async function scan(wrapper: ReturnType<typeof mount>, value: string) {
  const input = wrapper.find('.scan-bar-input')
  await input.setValue(value)
  await input.trigger('keydown.enter')
  await flushPromises()
}
const packedInput = (wrapper: ReturnType<typeof mount>) =>
  wrapper.find('input[type="number"]').element as HTMLInputElement

describe('PackItemsPage — scan behavior', () => {
  it('scanning a plain SKU increments packed qty, capped at picked qty', async () => {
    const pkId = pickedPackingTask(PLAIN, 2) // picked 2
    const wrapper = mount(PackItemsPage, { props: { orderId: pkId } })
    await flushPromises()

    expect(packedInput(wrapper).value).toBe('0')
    await scan(wrapper, PLAIN)
    expect(packedInput(wrapper).value).toBe('1')
    await scan(wrapper, PLAIN)
    expect(packedInput(wrapper).value).toBe('2') // now at picked qty
    await scan(wrapper, PLAIN)
    expect(packedInput(wrapper).value).toBe('2') // capped — can't pack more than picked
    wrapper.unmount()
  })

  it('scanning a batch-tracked SKU opens its read-only View batch drawer', async () => {
    const pkId = pickedPackingTask(BATCH, 2)
    const wrapper = mount(PackItemsPage, { props: { orderId: pkId } })
    await flushPromises()

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    await scan(wrapper, BATCH)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    wrapper.unmount()
  })
})
