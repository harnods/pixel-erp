// @vitest-environment happy-dom
/**
 * PM audit: Picking's barcode scan should be the reverse of Put-away's
 * active-bin model — scan a bin barcode first to make it "active", then a
 * batch/serial/SKU scan only counts as picked once it's confirmed coming FROM
 * that same bin. Previously, PickItemsPage's page-level scan bar had no bin
 * concept at all: it resolved a batch/serial code straight to its SKU and
 * incremented the picked qty immediately, with no location confirmation step
 * — so an operator could mark a unit picked while standing at the wrong bin.
 *
 * This mirrors PutAwayItemsPage.vue's handleScan (destination bin, freely
 * chosen) but in reverse: the origin bin is NOT freely chosen — each
 * batch/serial already has a known, fixed location, so the scanned bin must
 * actually match it, not just be any valid warehouse location.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PickItemsPage from '~/components/pages/PickItemsPage.vue'
import { addOutgoing, type OutgoingOrder } from '~/data/outgoing'
import { addPickingTask } from '~/data/pickingTasks'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { stockLocationPaths } from '~/data/storageLocations'
import '~/data/outgoing'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const WAREHOUSE_ID = 'wh-006'
const WAREHOUSE_NAME = 'Gudang Makassar Selatan'
const BATCH_SKU = '1001' // Green Beans Arabica Gayo Grade 1 — batch-tracked

function makeOrderAndTask(sku: string, qty: number, salesNo: string): string {
  const order: OutgoingOrder = addOutgoing({
    salesNo, source: 'Manual',
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
    skuQty: 1, orderQty: qty,
    shippedQty: 0, status: 'open', dueDate: '2026-08-01',
    lines: [{ sku, productName: sku, desc: '', img: '', unit: 'Unit', qty }],
  })
  const task = addPickingTask({
    salesOrderIds: [order.id], salesNos: [order.salesNo],
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
  })
  return task.id
}

async function scan(wrapper: ReturnType<typeof mount>, value: string) {
  const input = wrapper.find('.scan-bar-input')
  await input.setValue(value)
  await input.trigger('keydown.enter')
  await flushPromises()
}

function pickedQtyStat(wrapper: ReturnType<typeof mount>): string {
  const stat = wrapper.findAll('.pik-stat').find((s) => s.text().includes('Picked qty'))!
  return stat.find('.pik-stat-val').text()
}

describe('PickItemsPage — active-bin scan model (reverse of put-away)', () => {
  it('scanning a batch barcode before any bin is scanned is rejected — no qty change', async () => {
    const batch = getWarehouseDetail(WAREHOUSE_ID)!.stock.find((s) => s.sku === BATCH_SKU)!.batches![0]!
    const taskId = makeOrderAndTask(BATCH_SKU, 3, 'Test ActiveBin 1')
    const wrapper = mount(PickItemsPage, { props: { orderId: taskId } })
    await flushPromises()

    await scan(wrapper, batch.batchNo)

    expect(pickedQtyStat(wrapper)).toBe('0')
    wrapper.unmount()
  })

  it('scanning the batch\'s own bin, then the batch, marks it picked', async () => {
    const batch = getWarehouseDetail(WAREHOUSE_ID)!.stock.find((s) => s.sku === BATCH_SKU)!.batches![0]!
    const taskId = makeOrderAndTask(BATCH_SKU, 3, 'Test ActiveBin 2')
    const wrapper = mount(PickItemsPage, { props: { orderId: taskId } })
    await flushPromises()

    await scan(wrapper, batch.location)
    expect(wrapper.text()).toContain(batch.location) // active-bin chip shown

    await scan(wrapper, batch.batchNo)

    expect(pickedQtyStat(wrapper)).toBe('1')
    wrapper.unmount()
  })

  it('scanning a DIFFERENT bin than the batch\'s own location, then the batch, is rejected', async () => {
    const batch = getWarehouseDetail(WAREHOUSE_ID)!.stock.find((s) => s.sku === BATCH_SKU)!.batches![0]!
    const wrongBin = stockLocationPaths(WAREHOUSE_ID).find((p) => p !== batch.location)!
    const taskId = makeOrderAndTask(BATCH_SKU, 3, 'Test ActiveBin 3')
    const wrapper = mount(PickItemsPage, { props: { orderId: taskId } })
    await flushPromises()

    await scan(wrapper, wrongBin)
    await scan(wrapper, batch.batchNo)

    expect(pickedQtyStat(wrapper)).toBe('0') // rejected — wrong bin, no assignment made
    wrapper.unmount()
  })

  it('a plain (untracked) SKU scan also requires an active bin first', async () => {
    const PLAIN_SKU = '3004' // Coffee Scale 2kg / 0.1g — plain, non-tracked
    const taskId = makeOrderAndTask(PLAIN_SKU, 51, 'Test ActiveBin Plain') // above scan threshold is irrelevant — scanning always works
    const wrapper = mount(PickItemsPage, { props: { orderId: taskId } })
    await flushPromises()

    await scan(wrapper, PLAIN_SKU)
    expect(pickedQtyStat(wrapper)).toBe('0') // rejected — no bin active yet

    const anyBin = stockLocationPaths(WAREHOUSE_ID)[0]!
    await scan(wrapper, anyBin)
    await scan(wrapper, PLAIN_SKU)
    expect(pickedQtyStat(wrapper)).toBe('1') // any valid bin is fine — no fixed origin to match for plain SKUs
    wrapper.unmount()
  })
})
