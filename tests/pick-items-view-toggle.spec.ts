// @vitest-environment happy-dom
/**
 * "Combined / By orders" toggle on PickItemsPage.vue (the live "Start picking"
 * screen) — mirrors the same toggle already on PickingTaskDetailsPage.vue and
 * CreatePickingPage.vue. Combined stays the only place picking actually
 * happens (scan, manual qty, batch/serial drawers); By orders is a read-only
 * breakdown of the same live draft state, split per contributing sales order.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PickItemsPage from '~/components/pages/PickItemsPage.vue'
import { addOutgoing, type OutgoingOrder } from '~/data/outgoing'
import { addPickingTask } from '~/data/pickingTasks'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const WAREHOUSE_ID = 'wh-006'
const WAREHOUSE_NAME = 'Gudang Makassar Selatan'
const SKU_A = '3004' // Coffee Scale 2kg / 0.1g — plain, untracked
const SKU_B = '3001' // Milk Frothing Pitcher 600ml — plain, untracked

function makeOrder(salesNo: string, customer: string, source: string, lines: { sku: string; qty: number }[]): OutgoingOrder {
  return addOutgoing({
    salesNo, source, customer,
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
    skuQty: lines.length, orderQty: lines.reduce((s, l) => s + l.qty, 0),
    shippedQty: 0, status: 'open', dueDate: '2026-08-01',
    lines: lines.map((l) => ({ sku: l.sku, productName: l.sku, desc: '', img: '', unit: 'Unit', qty: l.qty })),
  })
}

describe('PickItemsPage — Combined / By orders toggle', () => {
  it('defaults to Combined (editable), By orders is read-only and shows each order\'s own qty', async () => {
    const order1 = makeOrder('Pick Toggle Order 1', 'Anomali Coffee', 'Manual', [
      { sku: SKU_A, qty: 5 }, { sku: SKU_B, qty: 2 },
    ])
    const order2 = makeOrder('Pick Toggle Order 2', 'Tanamera Coffee Roastery', 'Shopee: Central Perk', [
      { sku: SKU_A, qty: 3 },
    ])
    const task = addPickingTask({
      salesOrderIds: [order1.id, order2.id],
      salesNos: [order1.salesNo, order2.salesNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })

    const wrapper = mount(PickItemsPage, { props: { orderId: task.id } })
    await flushPromises()

    // Combined (default): SKU_A merged across both orders → one editable row, qty 8 (5+3).
    expect(wrapper.find('.detail-loc-toggle-btn--active').text()).toBe('Combined')
    const combinedRow = wrapper.findAll('.pik-items tbody tr').find(r => r.text().includes(SKU_A))!
    expect(combinedRow.find('input.pik-qty-input').exists()).toBe(true)
    expect(wrapper.findAll('.pik-order-block')).toHaveLength(0)

    // Enter a picked qty in Combined for SKU_A (merged 8) and SKU_B (order1 only, 2).
    const skuAInput = combinedRow.find('input.pik-qty-input')
    await skuAInput.setValue('8')
    const skuBRow = wrapper.findAll('.pik-items tbody tr').find(r => r.text().includes(SKU_B))!
    await skuBRow.find('input.pik-qty-input').setValue('2')
    await flushPromises()

    // Switch to By orders.
    await wrapper.findAll('.detail-loc-toggle-btn').find(b => b.text() === 'By orders')!.trigger('click')
    await flushPromises()
    expect(wrapper.find('.detail-loc-toggle-btn--active').text()).toBe('By orders')

    // Read-only: no inputs anywhere in this view.
    expect(wrapper.find('.pik-orders-scroll input').exists()).toBe(false)

    const orderBlocks = wrapper.findAll('.pik-order-block')
    expect(orderBlocks).toHaveLength(2)

    const block1 = orderBlocks.find(b => b.find('.pik-order-no').text() === 'Pick Toggle Order 1')!
    expect(block1.find('.pik-order-cust').text()).toBe('Anomali Coffee')
    const block2 = orderBlocks.find(b => b.find('.pik-order-no').text() === 'Pick Toggle Order 2')!
    expect(block2.find('.pik-order-cust').text()).toBe('Tanamera Coffee Roastery')

    // Order 1's own picked qty for SKU_A must be its OWN share (5), not the merged 8 —
    // same fill-order rule scanning/qty entry already uses (first order filled first).
    const block1Rows = block1.findAll('table tbody tr td.pik-td--num')
    expect(block1Rows.map(c => c.text())).toContain('5')

    // Order 2's own picked qty for SKU_A is the remainder (3).
    const block2Rows = block2.findAll('table tbody tr td.pik-td--num')
    expect(block2Rows.map(c => c.text())).toContain('3')

    wrapper.unmount()
  })
})
