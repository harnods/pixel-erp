// @vitest-environment happy-dom
/**
 * PM ask: when 2 picking lists are selected for a new packing task, a list
 * whose order isn't packable yet (e.g. a marketplace order not fully picked)
 * should still show up in the picking-lists table — never silently vanish —
 * with an explanation of why it can't be packed.
 *
 * One badge covers every kind of trouble — "Some not packable", i.e. not all of what
 * this list picked can go into a packing task — and the tooltip names which orders
 * and why, since a list can bundle several.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { MpTooltip } from '@mekari/pixel3'
import CreatePackingPage from '~/components/pages/CreatePackingPage.vue'
import { addOutgoing, type OutgoingOrder } from '~/data/outgoing'
import { addPickingTask, endPicking } from '~/data/pickingTasks'
import { addPackingTask } from '~/data/packingTasks'
import { cancelOutboundOrder } from '~/data/outboundSync'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const WAREHOUSE_ID = 'wh-006'
const WAREHOUSE_NAME = 'Gudang Makassar Selatan'
const SKU = '3004' // Coffee Scale 2kg / 0.1g — plain, non-tracked

function makeOrder(salesNo: string, source: string, qty: number): OutgoingOrder {
  return addOutgoing({
    salesNo, source,
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
    skuQty: 1, orderQty: qty,
    shippedQty: 0, status: 'open', dueDate: '2026-08-01',
    lines: [{ sku: SKU, productName: SKU, desc: '', img: '', unit: 'Unit', qty }],
  })
}

describe('CreatePackingPage — a selected-but-not-packable picking list stays visible with a reason', () => {
  it('shows both picking lists; the not-fully-picked marketplace one is badged "Some not packable" with a reason, the fully-picked plain one "Ready to pack"', async () => {
    const orderA = makeOrder('Test Pack A', 'Manual', 10) // plain, non-marketplace
    const taskA = addPickingTask({
      salesOrderIds: [orderA.id], salesNos: [orderA.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    endPicking(taskA.id, { [`${orderA.id}::${SKU}`]: 10 }) // fully picked

    const orderB = makeOrder('Test Pack B', 'Shopee: Test Store', 10) // marketplace
    const taskB = addPickingTask({
      salesOrderIds: [orderB.id], salesNos: [orderB.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    endPicking(taskB.id, { [`${orderB.id}::${SKU}`]: 4 }) // partially picked (4 of 10)

    vi.stubGlobal('useRoute', () => ({ query: { pickingIds: `${taskA.id},${taskB.id}` } }))

    const wrapper = mount(CreatePackingPage)
    await flushPromises()

    // Both selected picking lists must appear — the blocked one must NOT vanish.
    expect(wrapper.text()).toContain(taskA.taskNo)
    expect(wrapper.text()).toContain(taskB.taskNo)

    expect(wrapper.text()).toContain('Ready to pack')
    expect(wrapper.text()).toContain('Some not packable')

    // The reason names the blocked order and explains why (marketplace, not fully picked).
    const reasonTooltip = wrapper.findAllComponents(MpTooltip).find((t) =>
      typeof t.props('label') === 'string' && (t.props('label') as string).includes(orderB.salesNo),
    )
    expect(reasonTooltip).toBeTruthy()
    expect(reasonTooltip!.props('label')).toContain('every SKU on it is picked in full')

    wrapper.unmount()
  })

  it('a shared picking whose one order was cancelled shows "Ready to pack" (the cancelled order never blocks the live one)', async () => {
    // Mirrors the reported case: Picking #30500 with 2 SOs, SO#1 cancelled, then
    // continue picking + create packing — the list must not read "Not packable".
    const SKU = '3004'
    const live = addOutgoing({
      salesNo: 'Shared Live', source: 'Manual', warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
      skuQty: 1, orderQty: 5, shippedQty: 0, status: 'open', dueDate: '2026-08-01',
      lines: [{ sku: SKU, productName: SKU, desc: '', img: '', unit: 'Unit', qty: 5 }],
    })
    const toCancel = addOutgoing({
      salesNo: 'Shared Cancelled', source: 'Manual', warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
      skuQty: 1, orderQty: 3, shippedQty: 0, status: 'open', dueDate: '2026-08-01',
      lines: [{ sku: SKU, productName: SKU, desc: '', img: '', unit: 'Unit', qty: 3 }],
    })
    const task = addPickingTask({
      salesOrderIds: [live.id, toCancel.id], salesNos: [live.salesNo, toCancel.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    endPicking(task.id, { [`${live.id}::${SKU}`]: 5 }) // live order fully picked → packable
    expect(cancelOutboundOrder(toCancel.id).ok).toBe(true) // SO#1 cancelled

    vi.stubGlobal('useRoute', () => ({ query: { pickingIds: task.id } }))
    const wrapper = mount(CreatePackingPage)
    await flushPromises()

    // The cancelled order must NOT drag the list to a blocked badge — the live order packs.
    expect(wrapper.text()).toContain('Ready to pack')
    expect(wrapper.text()).not.toContain('Some not packable')
    wrapper.unmount()
  })

  it('a list where only SOME orders can be packed is badged, and the rest explain themselves', async () => {
    // A picking list bundles several orders. Order 1 went out on an earlier packing
    // task, order 2 is still here to pack — the badge says "some", and the page goes
    // on to pack order 2.
    const packedAlready = makeOrder('Mixed Packed', 'Manual', 4)
    const stillToPack = makeOrder('Mixed Open', 'Manual', 6)
    const task = addPickingTask({
      salesOrderIds: [packedAlready.id, stillToPack.id], salesNos: [packedAlready.salesNo, stillToPack.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    endPicking(task.id, { [`${packedAlready.id}::${SKU}`]: 4, [`${stillToPack.id}::${SKU}`]: 6 })
    // Order 1's SKUs went out on an earlier packing task; order 2's are still here.
    addPackingTask({
      salesOrderId: packedAlready.id, salesNo: packedAlready.salesNo,
      pickingTaskId: task.id, pickingTaskNo: task.taskNo,
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })

    vi.stubGlobal('useRoute', () => ({ query: { pickingIds: task.id } }))
    const wrapper = mount(CreatePackingPage)
    await flushPromises()

    // "Some" is the whole point here: order 2 packs, order 1 doesn't.
    expect(wrapper.text()).toContain('Some not packable')
    // …and the excluded order is still accounted for, by name.
    expect(wrapper.text()).toContain(`${packedAlready.salesNo} already has a packing task`)
    expect(wrapper.text()).toContain(stillToPack.salesNo) // the one being packed
    wrapper.unmount()
  })

  it('badges the same way whether nothing or only part of an order was picked', async () => {
    const order = makeOrder('Nothing Picked', 'Shopee: Test Store', 6)
    const t1 = addPickingTask({
      salesOrderIds: [order.id], salesNos: [order.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })
    endPicking(t1.id, { [`${order.id}::${SKU}`]: 0 })

    vi.stubGlobal('useRoute', () => ({ query: { pickingIds: t1.id } }))
    let wrapper = mount(CreatePackingPage)
    await flushPromises()
    expect(wrapper.text()).toContain('Some not packable')
    wrapper.unmount()

    // Part-picked but still short of the full marketplace pick: same badge, and the
    // tooltip is what tells the operator there is picking left to finish.
    endPicking(t1.id, { [`${order.id}::${SKU}`]: 2 })
    wrapper = mount(CreatePackingPage)
    await flushPromises()
    expect(wrapper.text()).toContain('Some not packable')
    const tip = wrapper.findAllComponents(MpTooltip).find(t =>
      typeof t.props('label') === 'string' && (t.props('label') as string).includes(order.salesNo))
    expect(tip!.props('label')).toContain('every SKU on it is picked in full')
    wrapper.unmount()
  })
})
