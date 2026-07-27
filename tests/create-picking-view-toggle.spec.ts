// @vitest-environment happy-dom
/**
 * "Combined / By orders" toggle on CreatePickingPage.vue — mirrors the same
 * toggle on PickingTaskDetailsPage.vue. Combined stays the single editable
 * view (qty overrides, exclude, batch/serial); By orders is a read-only
 * breakdown of those same rows split per contributing sales order.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed } from 'vue'
import CreatePickingPage from '~/components/pages/CreatePickingPage.vue'
import { addOutgoing, type OutgoingOrder } from '~/data/outgoing'

vi.stubGlobal('computed', computed)
vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const WAREHOUSE_ID = 'wh-006'
const SKU_A = '1001' // Green Beans Arabica Gayo Grade 1
const SKU_B = '3004' // Coffee Scale 2kg / 0.1g

function makeOrder(salesNo: string, customer: string, source: string, lines: { sku: string; qty: number }[]): OutgoingOrder {
  return addOutgoing({
    salesNo, source, customer,
    warehouseId: WAREHOUSE_ID, warehouseName: 'Gudang Makassar Selatan',
    skuQty: lines.length, orderQty: lines.reduce((s, l) => s + l.qty, 0),
    shippedQty: 0, status: 'open', dueDate: '2026-08-01',
    lines: lines.map((l) => ({ sku: l.sku, productName: l.sku, desc: '', img: '', unit: 'Unit', qty: l.qty })),
  })
}

describe('CreatePickingPage — Combined / By orders toggle', () => {
  it('defaults to Combined, and By orders splits the same merged SKU back per order with its own qty', async () => {
    const order1 = makeOrder('Create Toggle Order 1', 'Anomali Coffee', 'Manual', [
      { sku: SKU_A, qty: 5 }, { sku: SKU_B, qty: 2 },
    ])
    const order2 = makeOrder('Create Toggle Order 2', 'Tanamera Coffee Roastery', 'Shopee: Central Perk', [
      { sku: SKU_A, qty: 3 },
    ])

    vi.stubGlobal('useRoute', () => ({
      query: { warehouseId: WAREHOUSE_ID, orderIds: `${order1.id},${order2.id}` },
    }))

    const wrapper = mount(CreatePickingPage)
    await flushPromises()

    // Combined (default): SKU A merged across both orders → one row, qty 8 (5+3).
    expect(wrapper.find('.detail-loc-toggle-btn--active').text()).toBe('Combined')
    const combinedSkuCells = wrapper.findAll('.pk-items tbody td.pk-td span.pk-sku-text').map(c => c.text())
    expect(combinedSkuCells).toContain(SKU_A)
    expect(combinedSkuCells).toContain(SKU_B)
    expect(wrapper.findAll('.pk-order-block')).toHaveLength(0)

    // Switch to By orders.
    const byOrdersBtn = wrapper.findAll('.detail-loc-toggle-btn').find(b => b.text() === 'By orders')!
    await byOrdersBtn.trigger('click')
    await flushPromises()

    expect(wrapper.find('.detail-loc-toggle-btn--active').text()).toBe('By orders')

    const orderBlocks = wrapper.findAll('.pk-order-block')
    expect(orderBlocks).toHaveLength(2)

    const block1 = orderBlocks.find(b => b.find('.pk-order-no').text() === 'Create Toggle Order 1')!
    expect(block1.find('.pk-order-cust').text()).toBe('Anomali Coffee')

    const block2 = orderBlocks.find(b => b.find('.pk-order-no').text() === 'Create Toggle Order 2')!
    expect(block2.find('.pk-order-cust').text()).toBe('Tanamera Coffee Roastery')

    // Each order's own table shows its OWN qty for SKU A — NOT the merged 8.
    const order1ToPick = block1.findAll('table tbody tr td.pk-td--num').map(c => c.text())
    expect(order1ToPick).toContain('5') // order1's own SKU A to-pick qty

    const order2ToPick = block2.findAll('table tbody tr td.pk-td--num').map(c => c.text())
    expect(order2ToPick).toContain('3') // order2's own SKU A to-pick qty

    wrapper.unmount()
  })

  it('By orders is read-only: editing/removing a shared SKU in Combined cascades into the per-order split shown there', async () => {
    // SKU_B (3004, Accessory) is shared by both orders with different qty each:
    // 4 from the regular order, 3 from the marketplace one — combined 7.
    const order1 = makeOrder('Cascade Order 1', 'Djournal Coffee', 'Manual', [
      { sku: SKU_B, qty: 4 },
    ])
    const order2 = makeOrder('Cascade Order 2', 'Kopi Kenangan HQ', 'Lazada: Central Perk', [
      { sku: SKU_B, qty: 3 },
    ])

    vi.stubGlobal('useRoute', () => ({
      query: { warehouseId: WAREHOUSE_ID, orderIds: `${order1.id},${order2.id}` },
    }))

    const wrapper = mount(CreatePickingPage)
    await flushPromises()

    // Combined default: SKU_B merged → 4 + 3 = 7. Edit it down to 5.
    const combinedRow = wrapper.findAll('.pk-items tbody tr').find(r => r.text().includes(SKU_B))!
    expect(combinedRow.find('input.pk-qty-input').element.value).toBe('7')
    await combinedRow.find('input.pk-qty-input').setValue('5')
    await flushPromises()

    // Switch to By orders — no inputs, no remove buttons anywhere (read-only).
    await wrapper.findAll('.detail-loc-toggle-btn').find(b => b.text() === 'By orders')!.trigger('click')
    await flushPromises()
    expect(wrapper.find('input.pk-qty-input').exists()).toBe(false)
    expect(wrapper.find('.pk-td--remove').exists()).toBe(false)

    // Both order blocks' own qty for SKU_B must sum back to the edited total (5),
    // via the same fill-order split doCreate() saves — not the original 4 + 3.
    const block1 = wrapper.findAll('.pk-order-block').find(b => b.find('.pk-order-no').text() === 'Cascade Order 1')!
    const block2 = wrapper.findAll('.pk-order-block').find(b => b.find('.pk-order-no').text() === 'Cascade Order 2')!
    // td.pk-td--num order per row: Order qty, [Picked qty if hasPriorPicks], Qty to pick.
    // No prior picks in this scenario, so Qty to pick is the second td--num (index 1).
    const qty1 = Number(block1.findAll('tbody tr').find(r => r.text().includes(SKU_B))!.findAll('td.pk-td--num')[1]!.text())
    const qty2 = Number(block2.findAll('tbody tr').find(r => r.text().includes(SKU_B))!.findAll('td.pk-td--num')[1]!.text())
    expect(qty1 + qty2).toBe(5)

    // Removing the SKU entirely from Combined marks it excluded in BOTH order
    // blocks (row-level — By orders can't remove just one order's line).
    await wrapper.findAll('.detail-loc-toggle-btn').find(b => b.text() === 'Combined')!.trigger('click')
    await flushPromises()
    await wrapper.findAll('.pk-item-row').find(r => r.text().includes(SKU_B))!.find('.pk-td--remove button').trigger('click')
    await flushPromises()

    await wrapper.findAll('.detail-loc-toggle-btn').find(b => b.text() === 'By orders')!.trigger('click')
    await flushPromises()
    const row1After = wrapper.findAll('.pk-order-block').find(b => b.find('.pk-order-no').text() === 'Cascade Order 1')!
      .findAll('tbody tr').find(r => r.text().includes(SKU_B))!
    const row2After = wrapper.findAll('.pk-order-block').find(b => b.find('.pk-order-no').text() === 'Cascade Order 2')!
      .findAll('tbody tr').find(r => r.text().includes(SKU_B))!
    expect(row1After.classes()).toContain('pk-item-row--off')
    expect(row2After.classes()).toContain('pk-item-row--off')

    wrapper.unmount()
  })
})
