// @vitest-environment happy-dom
/**
 * Page-level picking scan-bar serial guards — regressions found in an adversarial
 * scan audit. The page's own addSerialPick had weaker guards than ManageSerialDrawer:
 *   BUG 1 — a serial already picked for ANOTHER order on the SAME shared picking task
 *           was accepted again (one physical unit double-counted across two orders).
 *   BUG 2 — a serial RESERVED for a different order could be scanned/picked here
 *           (the drawer rejects this; the page did not) — an oversell.
 * Both now mirror ManageSerialDrawer's guards (task-wide dedupe + reservation owner).
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
const SERIAL_SKU = '2004' // Espresso Machine — serial-tracked

function order(salesNo: string, qty: number): OutgoingOrder {
  return addOutgoing({
    salesNo, source: 'Manual', warehouseId: WH, warehouseName: WH_NAME,
    skuQty: 1, orderQty: qty, shippedQty: 0, status: 'open', dueDate: '2026-08-01',
    lines: [{ sku: SERIAL_SKU, productName: SERIAL_SKU, desc: '', img: '', unit: 'Unit', qty }],
  })
}
async function scan(wrapper: ReturnType<typeof mount>, value: string) {
  const input = wrapper.find('.scan-bar-input')
  await input.setValue(value)
  await input.trigger('keydown.enter')
  await flushPromises()
}
const pickedStat = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll('.pik-stat').find((s) => s.text().includes('Picked qty'))!.find('.pik-stat-val').text()

describe('PickItemsPage — page-level serial scan guards', () => {
  it('BUG 1: the same serial cannot be picked twice across two orders on one shared picking', async () => {
    const avail = getWarehouseDetail(WH)!.stock.find((s) => s.sku === SERIAL_SKU)!.serials!.available
    const sn = avail[0]!.serial, bin = avail[0]!.location
    const oA = order('Ser Dup A', 1)
    const oB = order('Ser Dup B', 1)
    const task = addPickingTask({ salesOrderIds: [oA.id, oB.id], salesNos: [oA.salesNo, oB.salesNo], warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    const wrapper = mount(PickItemsPage, { props: { orderId: task.id } })
    await flushPromises()

    await scan(wrapper, bin)   // active bin
    await scan(wrapper, sn)    // fills order A
    await scan(wrapper, sn)    // must be REJECTED (same physical unit), not fill order B

    expect(pickedStat(wrapper)).toBe('1') // one unique serial → one unit, never two
    wrapper.unmount()
  })

  it('BUG 2: a serial reserved for another order cannot be picked here', async () => {
    const reserved = getWarehouseDetail(WH)!.stock.find((s) => s.sku === SERIAL_SKU)!.serials!.reserved
    // Skip only if the seed genuinely has no foreign-reserved serial (keeps the test honest).
    expect(reserved.length).toBeGreaterThan(0)
    const sn = reserved[0]!.serial, bin = reserved[0]!.location

    const oY = order('Ser Reserved Y', 1)
    const task = addPickingTask({ salesOrderIds: [oY.id], salesNos: [oY.salesNo], warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
    const wrapper = mount(PickItemsPage, { props: { orderId: task.id } })
    await flushPromises()

    await scan(wrapper, bin)  // active bin (the reserved unit's own location)
    await scan(wrapper, sn)   // reserved for another order → must be rejected

    expect(pickedStat(wrapper)).toBe('0')
    wrapper.unmount()
  })
})
