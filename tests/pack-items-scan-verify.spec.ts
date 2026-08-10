// @vitest-environment happy-dom
/**
 * Match-order verification at packing (stage 1 + 2).
 *
 * Packing a batch/serial-tracked line no longer just counts by SKU — each unit
 * must be scanned so we confirm the exact SN/batch picked matches the order:
 *   - A serial that WAS picked verifies (+1); a serial not picked is rejected;
 *     the same serial can't be scanned twice.
 *   - A batch that WAS picked verifies up to its picked qty; over-scanning or a
 *     batch not picked is rejected.
 *   - Finish is blocked until every tracked line is fully verified.
 *   - The same verification works from the in-drawer scan bar (stage 2), and the
 *     serial drawer shows a "Verified" badge for scanned serials.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PackItemsPage from '~/components/pages/PackItemsPage.vue'
import { addOutgoing, type OutgoingOrder } from '~/data/outgoing'
import { addPickingTask, getPickingTask } from '~/data/pickingTasks'
import { addPackingTask } from '~/data/packingTasks'
import { getWarehouseDetail, registerNewBatch } from '~/data/warehouseDetails'
import '~/data/outgoing'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const WH = 'wh-006', WH_NAME = 'Gudang Makassar Selatan'
const SERIAL_SKU = '2004' // Espresso Machine — serial-tracked
const BATCH_SKU = '1001'   // batch-tracked
let seq = 0

function order(qty: number, sku: string): OutgoingOrder {
  seq++
  return addOutgoing({
    salesNo: `Pack Verify ${seq}`, source: 'Manual', warehouseId: WH, warehouseName: WH_NAME,
    skuQty: 1, orderQty: qty, shippedQty: 0, status: 'open', dueDate: '2026-08-01',
    lines: [{ sku, productName: sku, desc: '', img: '', unit: 'Unit', qty }],
  })
}

/** A completed picking→packing task for a serial line, seeded with `n` real serials.
 *  Returns the packing task id and the exact serials picked (+ one spare that was
 *  NOT picked, for the reject case). Picks are set directly on the picking task —
 *  the same construction other packing tests use — bypassing reservation logic. */
function serialPackingTask(n: number) {
  // Draw from the SKU's whole serial universe (available + reserved). resolveScan
  // resolves a serial from either list, and verification checks against the pick
  // record we set below — not reservation ownership — so this stays valid even as
  // earlier tests reserve serials (the two lists shift but the total is stable).
  const s = getWarehouseDetail(WH)!.stock.find(x => x.sku === SERIAL_SKU)!.serials!
  const universe = [...s.available, ...s.reserved]
  expect(universe.length).toBeGreaterThan(n) // seed has enough distinct serials + a spare
  const picks = universe.slice(0, n).map(u => ({ serial: u.serial, location: u.location }))
  const spare = universe[n]!.serial
  const o = order(n, SERIAL_SKU)
  const pt = addPickingTask({ salesOrderIds: [o.id], salesNos: [o.salesNo], warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
  const key = `${o.id}::${SERIAL_SKU}`
  const pick = getPickingTask(pt.id)!
  pick.serialPicks = { [key]: picks }
  pick.pickedByKey = { [key]: n }
  pick.status = 'completed'
  const pk = addPackingTask({ salesOrderId: o.id, salesNo: o.salesNo, pickingTaskId: pt.id, pickingTaskNo: pt.taskNo, warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
  return { pkId: pk.id, serials: picks.map(p => p.serial), spare }
}

/** A completed picking→packing task for a batch line, seeded with `qty` from one
 *  freshly-registered batch. Returns the packing task id and that batch no. */
function batchPackingTask(qty: number) {
  seq++
  const batchNo = `Batch #VER-${seq}`
  registerNewBatch(WH, BATCH_SKU, { batchNo, expiryDate: '2027-01-01', onHand: qty + 10 })
  const stock = getWarehouseDetail(WH)!.stock.find(s => s.sku === BATCH_SKU)!
  const b = stock.batches!.find(x => x.batchNo === batchNo)!
  const o = order(qty, BATCH_SKU)
  const pt = addPickingTask({ salesOrderIds: [o.id], salesNos: [o.salesNo], warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
  const key = `${o.id}::${BATCH_SKU}`
  const pick = getPickingTask(pt.id)!
  pick.batchPicks = { [key]: [{ batchNo, expiryDate: b.expiryDate, desc: '', qty, unit: 'kg', location: b.location }] }
  pick.pickedByKey = { [key]: qty }
  pick.status = 'completed'
  const pk = addPackingTask({ salesOrderId: o.id, salesNo: o.salesNo, pickingTaskId: pt.id, pickingTaskNo: pt.taskNo, warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
  return { pkId: pk.id, batchNo }
}

async function scan(wrapper: ReturnType<typeof mount>, value: string, sel = '.scan-bar-input') {
  const input = wrapper.find(sel)
  await input.setValue(value)
  await input.trigger('keydown.enter')
  await flushPromises()
}
const packedInput = (wrapper: ReturnType<typeof mount>) =>
  (wrapper.find('input[type="number"]').element as HTMLInputElement).value

describe('PackItemsPage — match-order SN/batch verification (page scan bar)', () => {
  it('a serial that was picked verifies and increments packed qty', async () => {
    const { pkId, serials } = serialPackingTask(2)
    const wrapper = mount(PackItemsPage, { props: { orderId: pkId } })
    await flushPromises()

    expect(packedInput(wrapper)).toBe('0')
    await scan(wrapper, serials[0]!)
    expect(packedInput(wrapper)).toBe('1')
    await scan(wrapper, serials[1]!)
    expect(packedInput(wrapper)).toBe('2')
    wrapper.unmount()
  })

  it('a serial NOT picked for this order is rejected', async () => {
    const { pkId, spare } = serialPackingTask(1)
    const wrapper = mount(PackItemsPage, { props: { orderId: pkId } })
    await flushPromises()

    await scan(wrapper, spare) // exists in stock, but not picked for this order
    expect(packedInput(wrapper)).toBe('0')
    wrapper.unmount()
  })

  it('the same serial cannot be scanned twice (no double count)', async () => {
    const { pkId, serials } = serialPackingTask(2)
    const wrapper = mount(PackItemsPage, { props: { orderId: pkId } })
    await flushPromises()

    await scan(wrapper, serials[0]!)
    await scan(wrapper, serials[0]!) // duplicate → rejected
    expect(packedInput(wrapper)).toBe('1')
    wrapper.unmount()
  })

  it('a batch verifies up to its picked qty, then over-scans are rejected', async () => {
    const { pkId, batchNo } = batchPackingTask(2)
    const wrapper = mount(PackItemsPage, { props: { orderId: pkId } })
    await flushPromises()

    await scan(wrapper, batchNo)
    expect(packedInput(wrapper)).toBe('1')
    await scan(wrapper, batchNo)
    expect(packedInput(wrapper)).toBe('2')
    await scan(wrapper, batchNo) // beyond picked qty → rejected
    expect(packedInput(wrapper)).toBe('2')
    wrapper.unmount()
  })
})

describe('PackItemsPage — Finish is blocked until tracked lines are fully verified', () => {
  it('blocks Finish while a tracked line is only partially verified', async () => {
    const { pkId, serials } = serialPackingTask(2)
    const wrapper = mount(PackItemsPage, { props: { orderId: pkId } })
    await flushPromises()

    await scan(wrapper, serials[0]!) // 1 of 2 verified
    await wrapper.find('.pak-btn--primary').trigger('click')
    await flushPromises()

    expect(wrapper.find('.pak-finish-error').exists()).toBe(true)
    expect(wrapper.find('.pak-finish-error').text()).toMatch(/verify/i)
    wrapper.unmount()
  })

  it('allows Finish (no verify error) once every unit is verified', async () => {
    const { pkId, serials } = serialPackingTask(2)
    const wrapper = mount(PackItemsPage, { props: { orderId: pkId } })
    await flushPromises()

    await scan(wrapper, serials[0]!)
    await scan(wrapper, serials[1]!) // 2 of 2 verified
    await wrapper.find('.pak-btn--primary').trigger('click')
    await flushPromises()

    expect(wrapper.find('.pak-finish-error').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('PackItemsPage — in-drawer scan verification (stage 2)', () => {
  it('scanning a serial inside the View drawer verifies it and shows the Verified badge', async () => {
    const { pkId, serials } = serialPackingTask(2)
    const wrapper = mount(PackItemsPage, { props: { orderId: pkId } })
    await flushPromises()

    // Open the serial drawer from the row action.
    await wrapper.find('button[aria-label="View serial number"]').trigger('click')
    await flushPromises()
    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.exists()).toBe(true)

    // Scan inside the drawer's own scan bar.
    await scan(wrapper, serials[0]!, '[role="dialog"] .scan-bar-input')
    expect(packedInput(wrapper)).toBe('1')                 // page state updated
    expect(wrapper.find('[role="dialog"]').text()).toContain('Verified') // badge shown
    wrapper.unmount()
  })
})
