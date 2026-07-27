// @vitest-environment happy-dom
/**
 * PM ask: when 2 picking lists are selected for a new packing task, a list
 * whose order isn't packable yet (e.g. a marketplace order not fully picked)
 * should still show up in the picking-lists table — never silently vanish —
 * with an explanation of why it can't be packed.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { MpTooltip } from '@mekari/pixel3'
import CreatePackingPage from '~/components/pages/CreatePackingPage.vue'
import { addOutgoing, type OutgoingOrder } from '~/data/outgoing'
import { addPickingTask, endPicking } from '~/data/pickingTasks'
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
  it('shows both picking lists; the not-fully-picked marketplace one is badged "Not packable" with a reason, the fully-picked plain one "Ready to pack"', async () => {
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
    expect(wrapper.text()).toContain('Not packable')

    // The reason names the blocked order and explains why (marketplace, not fully picked).
    const reasonTooltip = wrapper.findAllComponents(MpTooltip).find((t) =>
      typeof t.props('label') === 'string' && (t.props('label') as string).includes(orderB.salesNo),
    )
    expect(reasonTooltip).toBeTruthy()
    expect(reasonTooltip!.props('label')).toContain('marketplace')

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

    // The cancelled order must NOT drag the list to "Not packable" — the live order packs.
    expect(wrapper.text()).toContain('Ready to pack')
    expect(wrapper.text()).not.toContain('Not packable')
    wrapper.unmount()
  })
})
