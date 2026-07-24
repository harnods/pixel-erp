// @vitest-environment happy-dom
/**
 * PM ask: when creating a new packing task from a completed picking task, the
 * "items to pack" table (per sales order) needs a Storage location column too
 * — mirroring the same fix already applied to the read-only Packing/Picking
 * details pages. Splits into one row per bin once a line's real picks
 * (batchPicks/serialPicks) span 2+ different bins; Product/SKU/Order qty/
 * Unit/Action stay merged (rowspan). Direct mode (picking skipped for the
 * warehouse) has no batch/serial pick data at all, so the column doesn't
 * render there.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import CreatePackingPage from '~/components/pages/CreatePackingPage.vue'
import { addOutgoing, type OutgoingOrder } from '~/data/outgoing'
import { addPickingTask, endPicking } from '~/data/pickingTasks'
import { getWarehouseDetail, registerNewBatch, binForSku } from '~/data/warehouseDetails'
import { warehouses } from '~/data/warehouses'
import '~/data/outgoing'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

/** Same construction as tests/picking-details-storage-location-split.spec.ts. */
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

function tableRows(wrapper: ReturnType<typeof mount>) {
  return wrapper.find('table.pk-items').findAll('tbody tr.pk-item-row')
}

describe('CreatePackingPage — Storage location column in "items to pack"', () => {
  it('splits Storage location + Picked qty per bin; Order qty/Unit/Action stay merged', async () => {
    const { warehouseId, warehouseName, sku, batches } = twoBinBatchSku()
    const order: OutgoingOrder = addOutgoing({
      salesNo: `Test Create Packing Split ${seq}`, source: 'Manual',
      warehouseId, warehouseName,
      skuQty: 1, orderQty: 15, shippedQty: 0, status: 'open', dueDate: '2026-08-01',
      lines: [{ sku, productName: sku, desc: '', img: '', unit: 'Unit', qty: 15 }],
    })
    const task = addPickingTask({
      salesOrderIds: [order.id], salesNos: [order.salesNo],
      warehouseId, warehouseName, assignee: 'Test Operator',
    })
    const key = `${order.id}::${sku}`
    endPicking(task.id, { [key]: 15 }, {
      batchPicks: {
        [key]: [
          { batchNo: batches[0]!.batchNo, expiryDate: batches[0]!.expiryDate, desc: '', qty: 10, unit: 'kg', location: batches[0]!.location },
          { batchNo: batches[1]!.batchNo, expiryDate: batches[1]!.expiryDate, desc: '', qty: 5, unit: 'kg', location: batches[1]!.location },
        ],
      },
    })

    vi.stubGlobal('useRoute', () => ({ query: { pickingId: task.id } }))
    const wrapper = mount(CreatePackingPage)
    await flushPromises()

    const rows = tableRows(wrapper)
    expect(rows.length).toBe(2)

    const row1cells = rows[0]!.findAll('td')
    const row2cells = rows[1]!.findAll('td')
    // Product(merged), SKU(merged), Storage location, Order qty(merged), Picked
    // qty, Unit(merged), Action(merged) = 7 cells on row 1; row 2 only renders
    // the 2 per-bin cells (Storage location, Picked qty).
    expect(row1cells.length).toBe(7)
    expect(row2cells.length).toBe(2)

    expect(row1cells[0]!.attributes('rowspan')).toBe('2') // Product
    expect(row1cells[1]!.attributes('rowspan')).toBe('2') // SKU
    expect(row1cells[2]!.text()).toBe(batches[0]!.location)
    expect(row1cells[3]!.attributes('rowspan')).toBe('2') // Order qty — merged
    expect(row1cells[3]!.text()).toBe('15')
    expect(row1cells[4]!.text()).toBe('10') // Picked qty = this bin's own qty
    expect(row1cells[5]!.attributes('rowspan')).toBe('2') // Unit — merged

    expect(row2cells[0]!.text()).toBe(batches[1]!.location)
    expect(row2cells[1]!.text()).toBe('5')

    expect(wrapper.findAll('button[aria-label="View batch"]').length).toBe(1) // merged action

    wrapper.unmount()
  })

  it('a single-bin pick renders one row with the real bin shown', async () => {
    const { warehouseId, warehouseName, sku, batches } = twoBinBatchSku()
    const order: OutgoingOrder = addOutgoing({
      salesNo: `Test Create Packing Single Bin ${seq}`, source: 'Manual',
      warehouseId, warehouseName,
      skuQty: 1, orderQty: 3, shippedQty: 0, status: 'open', dueDate: '2026-08-01',
      lines: [{ sku, productName: sku, desc: '', img: '', unit: 'Unit', qty: 3 }],
    })
    const task = addPickingTask({
      salesOrderIds: [order.id], salesNos: [order.salesNo],
      warehouseId, warehouseName, assignee: 'Test Operator',
    })
    const key = `${order.id}::${sku}`
    endPicking(task.id, { [key]: 3 }, {
      batchPicks: { [key]: [{ batchNo: batches[0]!.batchNo, expiryDate: batches[0]!.expiryDate, desc: '', qty: 3, unit: 'kg', location: batches[0]!.location }] },
    })

    vi.stubGlobal('useRoute', () => ({ query: { pickingId: task.id } }))
    const wrapper = mount(CreatePackingPage)
    await flushPromises()

    const rows = tableRows(wrapper)
    expect(rows.length).toBe(1)
    expect(rows[0]!.text()).toContain(batches[0]!.location)

    wrapper.unmount()
  })

  it('a plain (untracked) SKU shows its real assigned bin, not a hardcoded "—"', async () => {
    const PLAIN_SKU = '3006' // Knock Box Drawer Stainless — plain, non-tracked
    const WAREHOUSE_ID = 'wh-006'
    const WAREHOUSE_NAME = 'Gudang Makassar Selatan'
    const order: OutgoingOrder = addOutgoing({
      salesNo: `Test Create Packing Plain SKU ${seq}`, source: 'Manual',
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
      skuQty: 1, orderQty: 3, shippedQty: 0, status: 'open', dueDate: '2026-08-01',
      lines: [{ sku: PLAIN_SKU, productName: PLAIN_SKU, desc: '', img: '', unit: 'Unit', qty: 3 }],
    })
    const task = addPickingTask({
      salesOrderIds: [order.id], salesNos: [order.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    endPicking(task.id, { [`${order.id}::${PLAIN_SKU}`]: 3 })

    vi.stubGlobal('useRoute', () => ({ query: { pickingId: task.id } }))
    const wrapper = mount(CreatePackingPage)
    await flushPromises()

    const rows = tableRows(wrapper)
    expect(rows.length).toBe(1)
    const expectedBin = binForSku(WAREHOUSE_ID, PLAIN_SKU)
    expect(expectedBin).not.toBe('—')
    expect(rows[0]!.text()).toContain(expectedBin)
    expect(rows[0]!.text()).not.toContain('—')

    wrapper.unmount()
  })
})
