// @vitest-environment happy-dom
/**
 * Reported bug: a picking task spanning 2 sales orders that share one batch- (or
 * serial-) tracked SKU shows it as ONE merged row ("qty to pick 3"). Opening
 * "Manage batch"/"Manage serial numbers" for that row picked from whichever
 * underlying per-order LINE still had room — so once the first order's own line
 * filled up, the SAME button silently jumped to the second order's line next,
 * which starts uncounted. From the operator's view: "I picked 2, saved, reopened
 * — the 2 are gone, back to 0" (the 2 weren't actually lost, they'd just become
 * unreachable from that button).
 *
 * Fix: Manage batch/serial now operates on the merged GROUP as a whole (matching
 * what the row shows), distributing the result back across member lines on save
 * (first order's line filled first, same rule as plain qty entry/scanning) so the
 * per-order data model — needed for packing attribution — stays intact.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PickItemsPage from '~/components/pages/PickItemsPage.vue'
import { addOutgoing, type OutgoingOrder } from '~/data/outgoing'
import { addPickingTask } from '~/data/pickingTasks'
import { getWarehouseDetail } from '~/data/warehouseDetails'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
class FakeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const WAREHOUSE_ID = 'wh-006'
const WAREHOUSE_NAME = 'Gudang Makassar Selatan'
const SKU_BATCH = '1001' // Green Beans Arabica Gayo Grade 1 — batch-tracked
const SKU_SERIAL = '2004' // serial-tracked, has available serial stock at wh-006

function makeOrder(salesNo: string, sku: string, qty: number): OutgoingOrder {
  return addOutgoing({
    salesNo, source: 'Manual',
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
    skuQty: 1, orderQty: qty,
    shippedQty: 0, status: 'open', dueDate: '2026-08-01',
    lines: [{ sku, productName: sku, desc: '', img: '', unit: 'Unit', qty }],
  })
}

/** Scan the batch barcode `count` times (+1 counted per scan) — this test's qty (3)
 *  is below the default barcode-scan threshold (50), so manual typing into the
 *  drawer is disabled by that unrelated feature; scanning is the sanctioned path. */
async function scanBatchAndSave(wrapper: ReturnType<typeof mount>, batchNo: string, count: number) {
  // Scoped to the drawer specifically — the page behind it has its own ScanBar too.
  const scanInput = wrapper.find('.mbd-panel .scan-bar-input')
  for (let i = 0; i < count; i++) {
    await scanInput.setValue(batchNo)
    await scanInput.trigger('keydown.enter')
  }
  await flushPromises()
  const saveBtn = wrapper.find('button.btn-enterprise--primary')
  await saveBtn.trigger('click')
  await new Promise((r) => setTimeout(r, 700))
  await flushPromises()
}

describe('Picking task spanning 2 orders — Manage batch on the merged row', () => {
  it('reopening after picking the full amount for order 1 shows the group total, not a reset-to-0 different line', async () => {
    const order1 = makeOrder('Test MB Order 1', SKU_BATCH, 2)
    const order2 = makeOrder('Test MB Order 2', SKU_BATCH, 1)
    const task = addPickingTask({
      salesOrderIds: [order1.id, order2.id],
      salesNos: [order1.salesNo, order2.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })

    const wrapper = mount(PickItemsPage, { props: { orderId: task.id } })
    await flushPromises()

    const manageBtn = wrapper.find('button.pik-manage-icon-btn')
    expect(manageBtn.exists()).toBe(true)

    // 1st open: the drawer must show the GROUP total (3), not one order's slice.
    await manageBtn.trigger('click')
    await flushPromises()
    const statsBefore = wrapper.findAll('.mbd-stat-value').map((n) => n.text())
    expect(statsBefore[1]).toBe('3') // Qty to pick = group total
    expect(statsBefore[2]).toBe('0') // Picked qty = 0

    // Pick 2 of the batch (by scanning — qty is below the scan threshold, so
    // manual typing is disabled) and save.
    const batchNo = getWarehouseDetail(WAREHOUSE_ID)!.stock.find((s) => s.sku === SKU_BATCH)!.batches![0]!.batchNo
    await scanBatchAndSave(wrapper, batchNo, 2)

    // Page-level header must reflect 2 picked.
    expect(wrapper.text()).toContain('2')

    // 2nd open on the SAME button — must still show the group total (3) and the
    // previously picked 2, NOT reset to a smaller "qty to pick" with 0 picked.
    await manageBtn.trigger('click')
    await flushPromises()
    const statsAfter = wrapper.findAll('.mbd-stat-value').map((n) => n.text())
    expect(statsAfter[1]).toBe('3')
    expect(statsAfter[2]).toBe('2')

    wrapper.unmount()
  })

  it('reopening after picking the full amount for order 1 (serial-tracked SKU) preserves the group total', async () => {
    const order1 = makeOrder('Test MS Order 1', SKU_SERIAL, 1)
    const order2 = makeOrder('Test MS Order 2', SKU_SERIAL, 1)
    const task = addPickingTask({
      salesOrderIds: [order1.id, order2.id],
      salesNos: [order1.salesNo, order2.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })

    const wrapper = mount(PickItemsPage, { props: { orderId: task.id } })
    await flushPromises()

    const manageBtn = wrapper.find('button.pik-manage-icon-btn')
    expect(manageBtn.exists()).toBe(true)

    await manageBtn.trigger('click')
    await flushPromises()
    const statsBefore = wrapper.findAll('.msn-stat-value').map((n) => n.text())
    expect(statsBefore[1]).toContain('2') // Qty to pick = group total (1+1)
    expect(statsBefore[2]).toContain('0') // Picked qty

    // Pick 1 serial (the first row's toggle button) and save.
    const firstToggle = wrapper.find('.msn-table tbody tr button.msn-toggle-btn')
    expect(firstToggle.exists()).toBe(true)
    await firstToggle.trigger('click')
    await flushPromises()

    const saveBtn = wrapper.find('button.btn-enterprise--primary')
    await saveBtn.trigger('click')
    await new Promise((r) => setTimeout(r, 700))
    await flushPromises()

    await manageBtn.trigger('click')
    await flushPromises()
    const statsAfter = wrapper.findAll('.msn-stat-value').map((n) => n.text())
    expect(statsAfter[1]).toContain('2')
    expect(statsAfter[2]).toContain('1')

    wrapper.unmount()
  })
})
