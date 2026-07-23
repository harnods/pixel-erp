// @vitest-environment happy-dom
/**
 * "Combined / By orders" toggle on PickingTaskDetailsPage.vue — lets the user
 * switch between the merged-by-SKU view (getPickingGroupedItems, one row per
 * SKU across all bundled orders) and a per-order view (one section per
 * contributing sales order, header mirrors CreatePackingPage.vue's order
 * grouping: order no. / customer / source), for a picking task that bundles
 * more than one sales order.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed } from 'vue'
import PickingTaskDetailsPage from '~/components/pages/PickingTaskDetailsPage.vue'
import { addOutgoing, type OutgoingOrder } from '~/data/outgoing'
import { addPickingTask } from '~/data/pickingTasks'

vi.stubGlobal('computed', computed)
vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const WAREHOUSE_ID = 'wh-006'
const WAREHOUSE_NAME = 'Gudang Makassar Selatan'
const SKU_A = '1001' // Green Beans Arabica Gayo Grade 1
const SKU_B = '3004' // Coffee Scale 2kg / 0.1g

function makeOrder(salesNo: string, customer: string, source: string, lines: { sku: string; qty: number }[]): OutgoingOrder {
  return addOutgoing({
    salesNo, source, customer,
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
    skuQty: lines.length, orderQty: lines.reduce((s, l) => s + l.qty, 0),
    shippedQty: 0, status: 'open', dueDate: '2026-08-01',
    lines: lines.map((l) => ({ sku: l.sku, productName: l.sku, desc: '', img: '', unit: 'Unit', qty: l.qty })),
  })
}

describe('PickingTaskDetailsPage — Combined / By orders toggle', () => {
  it('defaults to Combined (merged rows), and switches to a per-order breakdown with order no./customer/source headers', async () => {
    const order1 = makeOrder('Test Toggle Order 1', 'Anomali Coffee', 'Manual', [
      { sku: SKU_A, qty: 5 }, { sku: SKU_B, qty: 2 },
    ])
    const order2 = makeOrder('Test Toggle Order 2', 'Tanamera Coffee Roastery', 'Shopee: Central Perk', [
      { sku: SKU_A, qty: 3 },
    ])
    const task = addPickingTask({
      salesOrderIds: [order1.id, order2.id],
      salesNos: [order1.salesNo, order2.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })!

    const wrapper = mount(PickingTaskDetailsPage, { props: { orderId: task.id } })
    await flushPromises()

    // Combined (default): SKU A merged across both orders → one row, qty 8 (5+3).
    expect(wrapper.find('.detail-loc-toggle-btn--active').text()).toBe('Combined')
    const combinedSkuCells = wrapper.findAll('.detail-items-section table tbody td.detail-td').map(c => c.text())
    expect(combinedSkuCells).toContain(SKU_A)
    expect(wrapper.findAll('.pkd-order-block')).toHaveLength(0)

    // Switch to By orders.
    const buttons = wrapper.findAll('.detail-loc-toggle-btn')
    const byOrdersBtn = buttons.find(b => b.text() === 'By orders')!
    await byOrdersBtn.trigger('click')
    await flushPromises()

    expect(wrapper.find('.detail-loc-toggle-btn--active').text()).toBe('By orders')

    const orderBlocks = wrapper.findAll('.pkd-order-block')
    expect(orderBlocks).toHaveLength(2)

    const headOrder1 = orderBlocks[0]!.find('.pkd-order-head')
    expect(headOrder1.find('.pkd-order-no').text()).toBe('Test Toggle Order 1')
    expect(headOrder1.find('.pkd-order-cust').text()).toBe('Anomali Coffee')
    expect(headOrder1.text()).toContain('Manual')

    const headOrder2 = orderBlocks[1]!.find('.pkd-order-head')
    expect(headOrder2.find('.pkd-order-no').text()).toBe('Test Toggle Order 2')
    expect(headOrder2.find('.pkd-order-cust').text()).toBe('Tanamera Coffee Roastery')

    // Each order's own table shows its OWN qty for SKU A — NOT the merged 8.
    const order1Rows = orderBlocks[0]!.findAll('table tbody tr')
    const order1QtyCells = order1Rows.map(r => r.findAll('td.detail-td--num')[0]?.text())
    expect(order1QtyCells).toContain('5') // order1's own SKU A qty, not merged 8

    const order2Rows = orderBlocks[1]!.findAll('table tbody tr')
    const order2QtyCells = order2Rows.map(r => r.findAll('td.detail-td--num')[0]?.text())
    expect(order2QtyCells).toContain('3') // order2's own SKU A qty

    wrapper.unmount()
  })

  it('a single-order task shows one order block in By orders view, matching its Combined rows', async () => {
    const order = makeOrder('Test Toggle Single Order', 'Djournal Coffee', 'Manual', [
      { sku: SKU_A, qty: 4 }, { sku: SKU_B, qty: 1 },
    ])
    const task = addPickingTask({
      salesOrderIds: [order.id], salesNos: [order.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })!

    const wrapper = mount(PickingTaskDetailsPage, { props: { orderId: task.id } })
    await flushPromises()

    const byOrdersBtn = wrapper.findAll('.detail-loc-toggle-btn').find(b => b.text() === 'By orders')!
    await byOrdersBtn.trigger('click')
    await flushPromises()

    const orderBlocks = wrapper.findAll('.pkd-order-block')
    expect(orderBlocks).toHaveLength(1)
    expect(orderBlocks[0]!.find('.pkd-order-no').text()).toBe('Test Toggle Single Order')

    wrapper.unmount()
  })
})
