// @vitest-environment happy-dom
/**
 * OD-001 revised: the input method is one choice for the whole delivery table,
 * set above it — Qty delivered is still typed per line. The lock and its release
 * cover the whole sales order (orderLock / releaseInputBasis, tested in
 * sales-delivery-percentage.spec.ts); this file mounts the form.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive, ref, computed, watch, onMounted, onUnmounted, nextTick, inject, provide } from 'vue'
import { salesOrders } from '~/data/salesOrders'
import { salesDeliveries } from '~/data/salesDeliveries'

const query = reactive<Record<string, string>>({})
vi.stubGlobal('useRouter', () => ({ push: vi.fn(), back: vi.fn() }))
vi.stubGlobal('useRoute', () => ({ path: '/sales-deliveries/new', query }))
vi.stubGlobal('navigateTo', vi.fn())
for (const [k, v] of Object.entries({ ref, computed, reactive, watch, onMounted, onUnmounted, nextTick, inject, provide })) vi.stubGlobal(k, v)
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

async function mountForOrder(orderId: string) {
  query.order = orderId
  const { default: Page } = await import('~/components/pages/NewSalesDeliveryPage.vue')
  const w = mount(Page, { props: {}, global: { stubs: { Teleport: true } } })
  await flushPromises()
  return w
}

describe('sales delivery form — one input method for the table', () => {
  it('has no per-line Input method column; the method sits above the table', async () => {
    const w = await mountForOrder('SO101')
    const heads = w.findAll('thead th').map(th => th.text())
    expect(heads).not.toContain('Input method')
    expect(heads).toContain('Qty delivered')
    expect(w.find('.sd-method').exists()).toBe(true)
    w.unmount()
  })

  it('opens a percent-locked order in Percentage, locked, naming the delivery that set it', async () => {
    const w = await mountForOrder('SO101')
    const method = w.find('.sd-method')
    expect(method.text()).toContain('Locked by Sales Delivery #20101')
    expect((method.find('input').element as HTMLInputElement).value).toBe('Percentage')
    // Every order line takes a percentage: each Qty delivered cell carries the % addon.
    const rows = w.findAll('tbody tr').filter(r => r.find('.sd-ordered').exists())
    expect(rows.length).toBe(salesOrders.find(o => o.id === 'SO101')!.items.length)
    for (const r of rows) expect(r.text()).toContain('%')
    w.unmount()
  })

  it('opens an order with no deliveries in Quantity, unlocked', async () => {
    const free = salesOrders.find(o => !salesDeliveries.some(d => d.orderId === o.id) && o.status !== 'closed')!
    const w = await mountForOrder(free.id)
    expect(w.find('.sd-method').text()).not.toContain('Locked by')
    expect((w.find('.sd-method input').element as HTMLInputElement).value).toBe('Quantity')
    w.unmount()
  })

  it('reads Qty ordered progress label-left, figure-right', async () => {
    const w = await mountForOrder('SO101')
    const line = w.find('.sd-progress-line')
    const parts = line.findAll(':scope > span')
    expect(parts).toHaveLength(2)
    expect(parts[0]!.text()).toBe('Delivered')
    expect(parts[1]!.text()).toMatch(/\(\d+(,\d+)?%\)$/)
    w.unmount()
  })
})
