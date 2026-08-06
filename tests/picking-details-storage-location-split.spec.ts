// @vitest-environment happy-dom
/**
 * PM audit (mirrors PickItemsPage.vue's same fix): the read-only "Picking
 * list details" table must ALSO split Storage location/Qty to pick/Picked
 * qty per bin once a batch/serial-tracked group's committed picks span 2+
 * DIFFERENT bins, merging Product/SKU/Outstanding/Unit/View button via
 * rowspan. Previously this page didn't show Storage location for tracked
 * SKUs in the main table AT ALL (just a "view via drawer" placeholder) —
 * this drives an actual pick-and-save through PickItemsPage.vue first, then
 * verifies the COMMITTED result renders correctly on the details page.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed } from 'vue'
import PickItemsPage from '~/components/pages/PickItemsPage.vue'
import PickingTaskDetailsPage from '~/components/pages/PickingTaskDetailsPage.vue'
import { addOutgoing, type OutgoingOrder } from '~/data/outgoing'
import { addPickingTask, getPickingTask } from '~/data/pickingTasks'
import { getWarehouseDetail, registerNewBatch } from '~/data/warehouseDetails'
import { warehouses } from '~/data/warehouses'
import '~/data/outgoing'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
vi.stubGlobal('computed', computed) // ErpStatusBadge relies on the Nuxt auto-import
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

/** Same construction as tests/pick-items-storage-location-split.spec.ts — see
 *  that file for why registerNewBatch (not a location override) is what
 *  actually lands 2 new batches in 2 different bins. */
let seq = 0
function twoBinBatchSku() {
  let found: { warehouseId: string; warehouseName: string; sku: string } | null = null
  for (const wh of warehouses) {
    const item = getWarehouseDetail(wh.id)?.stock.find((s) => (s.batches?.length ?? 0) > 0 && s.bins.length >= 2)
    if (item) { found = { warehouseId: wh.id, warehouseName: wh.name, sku: item.sku }; break }
  }
  if (!found) throw new Error('no warehouse/SKU with 2+ storage bins found')
  seq++
  const batchA = `Batch #TEST-${seq}-A`
  const batchB = `Batch #TEST-${seq}-B`
  // Register each batch into a DISTINCT existing bin — the model now keeps a
  // registered batch in the bin it was added to (no round-robin spreading), so
  // the two-bin scenario must place them explicitly.
  const twoBins = getWarehouseDetail(found.warehouseId)!.stock.find((s) => s.sku === found!.sku)!.bins.map((b) => b.location)
  registerNewBatch(found.warehouseId, found.sku, { batchNo: batchA, expiryDate: '2027-01-01', onHand: 10, location: twoBins[0] })
  registerNewBatch(found.warehouseId, found.sku, { batchNo: batchB, expiryDate: '2027-01-01', onHand: 10, location: twoBins[1] })
  const refreshed = getWarehouseDetail(found.warehouseId)!.stock.find((s) => s.sku === found!.sku)!
  const b1 = refreshed.batches!.find((b) => b.batchNo === batchA)!
  const b2 = refreshed.batches!.find((b) => b.batchNo === batchB)!
  if (b1.location === b2.location) throw new Error('fixture batches ended up in the same bin — pick a different SKU')
  return { warehouseId: found.warehouseId, warehouseName: found.warehouseName, sku: found.sku, batches: [b1, b2] }
}

function makeOrderAndTask(warehouseId: string, warehouseName: string, sku: string, qty: number, salesNo: string): string {
  const order: OutgoingOrder = addOutgoing({
    salesNo, source: 'Manual',
    warehouseId, warehouseName,
    skuQty: 1, orderQty: qty,
    shippedQty: 0, status: 'open', dueDate: '2026-08-01',
    lines: [{ sku, productName: sku, desc: '', img: '', unit: 'Unit', qty }],
  })
  const task = addPickingTask({
    salesOrderIds: [order.id], salesNos: [order.salesNo],
    warehouseId, warehouseName, assignee: 'Test Operator',
  })
  return task.id
}

async function scan(wrapper: ReturnType<typeof mount>, value: string) {
  const input = wrapper.find('.scan-bar-input')
  await input.setValue(value)
  await input.trigger('keydown.enter')
  await flushPromises()
}

describe('PickingTaskDetailsPage — Storage location splits per bin once a group spans 2+ bins (committed data)', () => {
  it('shows one row per bin for a committed pick spanning 2 different bins, other columns merged', async () => {
    const { warehouseId, warehouseName, sku, batches } = twoBinBatchSku()
    const taskId = makeOrderAndTask(warehouseId, warehouseName, sku, 2, 'Test Details Split Two Bins')

    // Drive a real pick + save through the execution page first.
    const pickWrapper = mount(PickItemsPage, { props: { orderId: taskId } })
    await flushPromises()
    await scan(pickWrapper, batches[0]!.location)
    await scan(pickWrapper, batches[0]!.batchNo)
    await scan(pickWrapper, batches[1]!.location)
    await scan(pickWrapper, batches[1]!.batchNo)
    await pickWrapper.find('button.pik-btn--secondary').trigger('click')
    await flushPromises()
    pickWrapper.unmount()

    // Now check the read-only details view for the same task.
    const wrapper = mount(PickingTaskDetailsPage, { props: { orderId: taskId } })
    await flushPromises()

    const rows = wrapper.find('table.detail-items').findAll('tbody tr.detail-item-row')
    expect(rows.length).toBe(2)

    const row1cells = rows[0]!.findAll('td')
    const row2cells = rows[1]!.findAll('td')
    expect(row1cells.length).toBe(8)
    expect(row2cells.length).toBe(3) // only the per-bin cells (Storage location/Qty to pick/Picked qty)

    expect(row1cells[0]!.attributes('rowspan')).toBe('2') // Product
    expect(row1cells[1]!.attributes('rowspan')).toBe('2') // SKU
    expect(row1cells[2]!.text()).toBe(batches[0]!.location)
    expect(row1cells[3]!.text()).toBe('1') // Qty to pick = this bin's own picked qty
    expect(row1cells[4]!.text()).toBe('1') // Picked qty = same
    expect(row1cells[5]!.attributes('rowspan')).toBe('2') // Outstanding qty
    expect(row1cells[6]!.attributes('rowspan')).toBe('2') // Unit

    expect(row2cells[0]!.text()).toBe(batches[1]!.location)
    expect(row2cells[1]!.text()).toBe('1')
    expect(row2cells[2]!.text()).toBe('1')

    expect(wrapper.findAll('button[aria-label="View batch"]').length).toBe(1) // merged action

    wrapper.unmount()
  })

  it('a fresh, untouched task never splits rows even if its RESERVATION naturally spans 2 bins — Picked qty must read 0, not the reservation qty', async () => {
    // task.batchPicks/serialPicks are populated with the reservation plan's own
    // qty from creation (addPickingTask clones them into plannedBatchPicks too)
    // — pickedByKey (undefined here) is the only real signal of actual
    // progress. Without gating on it, this scenario would incorrectly split
    // rows and show the RESERVATION qty as if it were already picked.
    //
    // Constructs the 2-bin reservation directly on the task rather than
    // relying on the automatic reservation algorithm (autoSelectBatches),
    // which sorts by the warehouse's batch-selection rule and may prefer
    // pre-existing seed batches over the 2 freshly-registered ones — not
    // deterministic enough to guarantee it lands on exactly these 2 bins.
    const { warehouseId, warehouseName, sku, batches } = twoBinBatchSku()
    const taskId = makeOrderAndTask(warehouseId, warehouseName, sku, 15, 'Test Details Plan Two Bins Untouched')
    const task = getPickingTask(taskId)!
    const key = `${task.salesOrderIds[0]}::${sku}`
    const reservation = [
      { batchNo: batches[0]!.batchNo, expiryDate: batches[0]!.expiryDate, desc: '', qty: 10, unit: 'kg', location: batches[0]!.location },
      { batchNo: batches[1]!.batchNo, expiryDate: batches[1]!.expiryDate, desc: '', qty: 5, unit: 'kg', location: batches[1]!.location },
    ]
    task.batchPicks = { [key]: reservation }
    task.plannedBatchPicks = { [key]: reservation.map((r) => ({ ...r })) }

    const wrapper = mount(PickingTaskDetailsPage, { props: { orderId: taskId } })
    await flushPromises()

    const rows = wrapper.find('table.detail-items').findAll('tbody tr.detail-item-row')
    expect(rows.length).toBe(1) // no split — nothing has actually been picked yet (pickedByKey is undefined)

    const cells = rows[0]!.findAll('td')
    // Storage location shows BOTH planned bins (stacked list), not "—"
    expect(cells[2]!.text()).toContain(batches[0]!.location)
    expect(cells[2]!.text()).toContain(batches[1]!.location)
    expect(cells[3]!.text()).toBe('15') // Qty to pick = group total (unchanged)
    expect(cells[4]!.text()).toBe('0') // Picked qty = 0, NOT the reservation qty (10+5=15)

    wrapper.unmount()
  })
})
