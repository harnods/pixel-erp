// @vitest-environment happy-dom
/**
 * PM audit: Packing details' Storage location column was showing a generic,
 * warehouse-wide default (binForSku()) — unrelated to which specific bin(s)
 * this line's units were actually picked from. Fixed to read the real
 * batchPicks/serialPicks location(s) instead (already a settled fact by
 * packing time — picking is already done, unlike Picking's own
 * plan-vs-actual ambiguity), splitting into one row per bin once a line's
 * picks span 2+ different bins. Packed qty/Outstanding qty/Unit stay merged
 * (rowspan) — packing has no per-bin PACKED breakdown anywhere in its data
 * model (packedByKey is a flat total per line), so only Storage
 * location/Picked qty can meaningfully split.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed } from 'vue'
import PackingTaskDetailsPage from '~/components/pages/PackingTaskDetailsPage.vue'
import { addOutgoing, type OutgoingOrder } from '~/data/outgoing'
import { addPickingTask, getPickingTask } from '~/data/pickingTasks'
import { addPackingTask } from '~/data/packingTasks'
import { getWarehouseDetail, registerNewBatch } from '~/data/warehouseDetails'
import { warehouses } from '~/data/warehouses'
import '~/data/outgoing'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
vi.stubGlobal('computed', computed) // ErpStatusBadge relies on the Nuxt auto-import
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

function makePackingTaskWithTwoBinPick(warehouseId: string, warehouseName: string, sku: string, batches: ReturnType<typeof twoBinBatchSku>['batches']) {
  const order: OutgoingOrder = addOutgoing({
    salesNo: `Test Packing Split ${seq}`, source: 'Manual',
    warehouseId, warehouseName,
    skuQty: 1, orderQty: 15, shippedQty: 0, status: 'open', dueDate: '2026-08-01',
    lines: [{ sku, productName: sku, desc: '', img: '', unit: 'Unit', qty: 15 }],
  })
  const pickTask = addPickingTask({
    salesOrderIds: [order.id], salesNos: [order.salesNo],
    warehouseId, warehouseName, assignee: 'Test Operator',
  })
  const key = `${order.id}::${sku}`
  const picks = [
    { batchNo: batches[0]!.batchNo, expiryDate: batches[0]!.expiryDate, desc: '', qty: 10, unit: 'kg', location: batches[0]!.location },
    { batchNo: batches[1]!.batchNo, expiryDate: batches[1]!.expiryDate, desc: '', qty: 5, unit: 'kg', location: batches[1]!.location },
  ]
  const pick = getPickingTask(pickTask.id)!
  pick.batchPicks = { [key]: picks }
  pick.pickedByKey = { [key]: 15 }
  pick.status = 'completed'

  const packTask = addPackingTask({
    salesOrderId: order.id, salesNo: order.salesNo,
    pickingTaskId: pickTask.id, pickingTaskNo: pickTask.taskNo,
    warehouseId, warehouseName, assignee: 'Test Operator',
  })
  return packTask.id
}

describe('PackingTaskDetailsPage — Storage location reflects real picked bin(s), split per bin when 2+', () => {
  it('splits Storage location + Picked qty per bin; Packed qty/Outstanding qty/Unit/Product/SKU/Action stay merged', async () => {
    const { warehouseId, warehouseName, sku, batches } = twoBinBatchSku()
    const taskId = makePackingTaskWithTwoBinPick(warehouseId, warehouseName, sku, batches)

    const wrapper = mount(PackingTaskDetailsPage, { props: { orderId: taskId } })
    await flushPromises()

    const rows = wrapper.find('table.detail-items').findAll('tbody tr.detail-item-row')
    expect(rows.length).toBe(2)

    const row1cells = rows[0]!.findAll('td')
    const row2cells = rows[1]!.findAll('td')
    // Product(merged), SKU(merged), Storage location, Picked qty, Packed qty(merged),
    // Outstanding qty(merged), Unit(merged), Action(merged) = 8 cells on row 1;
    // row 2 only renders the 2 per-bin cells (Storage location, Picked qty).
    expect(row1cells.length).toBe(8)
    expect(row2cells.length).toBe(2)

    expect(row1cells[0]!.attributes('rowspan')).toBe('2') // Product
    expect(row1cells[1]!.attributes('rowspan')).toBe('2') // SKU
    expect(row1cells[2]!.text()).toBe(batches[0]!.location)
    expect(row1cells[3]!.text()).toBe('10') // Picked qty = this bin's own qty
    expect(row1cells[4]!.attributes('rowspan')).toBe('2') // Packed qty — merged
    expect(row1cells[4]!.text()).toBe('0') // nothing packed yet
    expect(row1cells[5]!.attributes('rowspan')).toBe('2') // Outstanding qty — merged
    expect(row1cells[5]!.text()).toBe('15')
    expect(row1cells[6]!.attributes('rowspan')).toBe('2') // Unit — merged

    expect(row2cells[0]!.text()).toBe(batches[1]!.location)
    expect(row2cells[1]!.text()).toBe('5')

    expect(wrapper.findAll('button[aria-label="View batch"]').length).toBe(1) // merged action

    wrapper.unmount()
  })

  it('a single-bin pick renders exactly as before — one row, real bin shown (not the generic binForSku fallback)', async () => {
    const { warehouseId, warehouseName, sku, batches } = twoBinBatchSku()
    const order: OutgoingOrder = addOutgoing({
      salesNo: `Test Packing Single Bin ${seq}`, source: 'Manual',
      warehouseId, warehouseName,
      skuQty: 1, orderQty: 3, shippedQty: 0, status: 'open', dueDate: '2026-08-01',
      lines: [{ sku, productName: sku, desc: '', img: '', unit: 'Unit', qty: 3 }],
    })
    const pickTask = addPickingTask({
      salesOrderIds: [order.id], salesNos: [order.salesNo],
      warehouseId, warehouseName, assignee: 'Test Operator',
    })
    const key = `${order.id}::${sku}`
    const pick = getPickingTask(pickTask.id)!
    pick.batchPicks = { [key]: [{ batchNo: batches[0]!.batchNo, expiryDate: batches[0]!.expiryDate, desc: '', qty: 3, unit: 'kg', location: batches[0]!.location }] }
    pick.pickedByKey = { [key]: 3 }
    pick.status = 'completed'
    const packTask = addPackingTask({
      salesOrderId: order.id, salesNo: order.salesNo,
      pickingTaskId: pickTask.id, pickingTaskNo: pickTask.taskNo,
      warehouseId, warehouseName, assignee: 'Test Operator',
    })

    const wrapper = mount(PackingTaskDetailsPage, { props: { orderId: packTask.id } })
    await flushPromises()

    const rows = wrapper.find('table.detail-items').findAll('tbody tr.detail-item-row')
    expect(rows.length).toBe(1)
    expect(rows[0]!.text()).toContain(batches[0]!.location)

    wrapper.unmount()
  })
})
