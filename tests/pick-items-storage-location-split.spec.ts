// @vitest-environment happy-dom
/**
 * PM audit (mirrors receiving/put-away's already-fixed pattern): in the
 * "Start picking" table, a batch/serial-tracked SKU picked from 2+ DIFFERENT
 * bins (because the group bundles 2+ batches/serials that happen to live in
 * different locations — a batch/serial always sits in exactly ONE fixed bin,
 * never split like put-away's destination bins) must split Storage
 * location/Qty to pick/Picked qty into one row per bin. Outstanding qty,
 * Unit, Product, SKU, and the Manage batch/serial button stay merged
 * (rowspan) across the split rows. Nothing changes when 0 or 1 bin is used.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PickItemsPage from '~/components/pages/PickItemsPage.vue'
import { addOutgoing, type OutgoingOrder } from '~/data/outgoing'
import { addPickingTask } from '~/data/pickingTasks'
import { getWarehouseDetail, registerNewBatch } from '~/data/warehouseDetails'
import { warehouses } from '~/data/warehouses'
import '~/data/outgoing'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

/** Register 2 brand-new batches on an existing batch-tracked SKU that has 2+
 *  bins configured for its storage tree (searched across every warehouse —
 *  not every warehouse's storage config gives a SKU more than 1 bin) —
 *  getWarehouseDetail() assigns every batch's real `.location` post-hoc by
 *  index into `item.bins` (any location passed to registerNewBatch is
 *  overwritten by that step), so 2 NEW batches (indices 0 and 1) land in 2
 *  DIFFERENT bins automatically as long as the SKU's own bin count supports
 *  it. Generous onHand + a unique batchNo prefix per call keeps every test's
 *  fixture independent and immune to seed data's real batches usually
 *  sharing one bin / running low on `available`. */
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
  registerNewBatch(found.warehouseId, found.sku, { batchNo: batchA, expiryDate: '2027-01-01', onHand: 10 })
  registerNewBatch(found.warehouseId, found.sku, { batchNo: batchB, expiryDate: '2027-01-01', onHand: 10 })
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

function productRow(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('tbody tr.pik-row')
}

describe('PickItemsPage — Storage location splits per bin once a group spans 2+ bins', () => {
  it('picking from a single bin renders exactly as before — one row, no split', async () => {
    const { warehouseId, warehouseName, sku, batches } = twoBinBatchSku()
    const taskId = makeOrderAndTask(warehouseId, warehouseName, sku, 1, 'Test Split Single Bin')
    const wrapper = mount(PickItemsPage, { props: { orderId: taskId } })
    await flushPromises()

    await scan(wrapper, batches[0]!.location)
    await scan(wrapper, batches[0]!.batchNo)

    const rows = productRow(wrapper)
    expect(rows.length).toBe(1)
    expect(rows[0]!.text()).toContain(batches[0]!.location)
    wrapper.unmount()
  })

  it('picking from 2 different bins splits into 2 rows: Storage location + Qty to pick + Picked qty per bin', async () => {
    const { warehouseId, warehouseName, sku, batches } = twoBinBatchSku()
    const taskId = makeOrderAndTask(warehouseId, warehouseName, sku, 2, 'Test Split Two Bins')
    const wrapper = mount(PickItemsPage, { props: { orderId: taskId } })
    await flushPromises()

    await scan(wrapper, batches[0]!.location)
    await scan(wrapper, batches[0]!.batchNo)
    await scan(wrapper, batches[1]!.location)
    await scan(wrapper, batches[1]!.batchNo)

    const rows = productRow(wrapper)
    expect(rows.length).toBe(2)

    const row1cells = rows[0]!.findAll('td')
    const row2cells = rows[1]!.findAll('td')
    // Columns: Product(merged), SKU(merged), Storage location, Qty to pick, Picked qty,
    // Outstanding(merged), Unit(merged), Action(merged) — row 2 renders only the
    // per-bin cells (Storage location/Qty to pick/Picked qty), 3 <td>s total.
    expect(row1cells.length).toBe(8)
    expect(row2cells.length).toBe(3)

    // Row 1: Product/SKU still present (rowspan owner)
    expect(row1cells[0]!.attributes('rowspan')).toBe('2')
    expect(row1cells[1]!.attributes('rowspan')).toBe('2')
    expect(row1cells[2]!.text()).toBe(batches[0]!.location) // Storage location
    expect(row1cells[3]!.text()).toBe('1') // Qty to pick = this bin's own picked qty
    expect(row1cells[4]!.text()).toBe('1') // Picked qty = same

    // Row 2: only the per-bin cells
    expect(row2cells[0]!.text()).toBe(batches[1]!.location)
    expect(row2cells[1]!.text()).toBe('1')
    expect(row2cells[2]!.text()).toBe('1')

    wrapper.unmount()
  })

  it('Outstanding qty and Unit stay merged (rowspan) across the split rows', async () => {
    const { warehouseId, warehouseName, sku, batches } = twoBinBatchSku()
    const taskId = makeOrderAndTask(warehouseId, warehouseName, sku, 3, 'Test Split Outstanding Merge')
    const wrapper = mount(PickItemsPage, { props: { orderId: taskId } })
    await flushPromises()

    await scan(wrapper, batches[0]!.location)
    await scan(wrapper, batches[0]!.batchNo)
    await scan(wrapper, batches[1]!.location)
    await scan(wrapper, batches[1]!.batchNo)

    const rows = productRow(wrapper)
    expect(rows.length).toBe(2)
    const row1cells = rows[0]!.findAll('td')
    // Outstanding qty is the 6th cell (index 5), Unit the 7th (index 6) in row 1
    expect(row1cells[5]!.attributes('rowspan')).toBe('2')
    expect(row1cells[5]!.text()).toBe('1') // 3 total - 2 picked = 1 outstanding
    expect(row1cells[6]!.attributes('rowspan')).toBe('2')
    // Row 2 has no Outstanding/Unit cell of its own (merged away)
    expect(rows[1]!.findAll('td').length).toBe(3)

    wrapper.unmount()
  })

  it('the Manage batch button stays a single, merged action for the whole split group', async () => {
    const { warehouseId, warehouseName, sku, batches } = twoBinBatchSku()
    const taskId = makeOrderAndTask(warehouseId, warehouseName, sku, 2, 'Test Split Action Merge')
    const wrapper = mount(PickItemsPage, { props: { orderId: taskId } })
    await flushPromises()

    await scan(wrapper, batches[0]!.location)
    await scan(wrapper, batches[0]!.batchNo)
    await scan(wrapper, batches[1]!.location)
    await scan(wrapper, batches[1]!.batchNo)

    expect(wrapper.findAll('button.pik-manage-icon-btn').length).toBe(1)
    wrapper.unmount()
  })
})
