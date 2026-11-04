// @vitest-environment happy-dom
/**
 * Work order › Material consume & return › New record — PRD v0.6 P-1 … P-5.
 *
 *   • P-4 Consume: On hand · Needed · Reserved for this WO · Consumed. The limit,
 *     min(remaining reserved, on hand), is not a column — the inline error names it.
 *   • P-5 Return: Needed · Reserved (informational) · Consumed · Max returnable,
 *     and the form says returned qty goes to available stock.
 *   • P-1 / P-2: qty above the limit is refused inline, naming it.
 *   • Each line uses its own destination warehouse — no record-level picker.
 *   • A work order created with reservation off (S-0) shows no Reserved column, and
 *     its limit is on hand (P-3).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed } from 'vue'
import NewMaterialRecordPage from '~/components/pages/NewMaterialRecordPage.vue'
import { workOrders } from '~/data/workOrders'
import { workOrderMaterials, onHandAt } from '~/data/stockRequests'
import { warehouses } from '~/data/warehouses'

vi.stubGlobal('computed', computed)
vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

// Work order #0008 — in progress, partly reserved (e.g. 2 of 4 on its first line).
const WO = workOrders.find(w => w.id === 'wo-8')!

async function mountRecord(type: 'consume' | 'return' = 'consume') {
  vi.stubGlobal('useRoute', () => ({ query: { type } }))
  const wrapper = mount(NewMaterialRecordPage, { props: { orderId: WO.id }, attachTo: document.body })
  await flushPromises()
  return wrapper
}

const headers = (w: Awaited<ReturnType<typeof mountRecord>>) =>
  w.findAll('thead th').map(th => th.text()).filter(Boolean)
/** Cell text by column header; + 1 for the unlabeled checkbox column. */
const cell = (w: Awaited<ReturnType<typeof mountRecord>>, row: number, header: string) =>
  w.findAll('tbody tr')[row]!.findAll('td')[headers(w).indexOf(header) + 1]!.text()

describe('New material record — P-4 / P-5 columns and the P-1 limit', () => {
  beforeEach(() => { document.body.innerHTML = '' })
  afterEach(() => { WO.reservation = undefined })

  it('Consume shows the P-4 columns, On hand first and Reserved right after Needed', async () => {
    const wrapper = await mountRecord()
    expect(headers(wrapper)).toEqual([
      'Product', 'SKU', 'Warehouse', 'On hand qty', 'Needed qty', 'Reserved qty', 'Consumed qty',
      'Qty to consume', 'Unit',
    ])
    wrapper.unmount()
  })

  it('reads each line at its own warehouse: what is still reserved, and on hand there', async () => {
    const wrapper = await mountRecord()
    const materials = workOrderMaterials(WO)
    expect(materials.some(m => m.remainingReserved > 0 && m.remainingReserved < m.needed)).toBe(true)
    materials.forEach((m, i) => {
      const onHand = onHandAt(m.productId, m.warehouseId)
      expect(cell(wrapper, i, 'Warehouse')).toBe(warehouses.find(w => w.id === m.warehouseId)!.name)
      expect(cell(wrapper, i, 'Reserved qty')).toBe(String(m.remainingReserved))
      expect(cell(wrapper, i, 'On hand qty')).toBe(String(onHand))
    })
    wrapper.unmount()
  })

  it('has no record-level warehouse picker — rows load straight away', async () => {
    const wrapper = await mountRecord()
    expect(wrapper.find('#mr-warehouse').exists()).toBe(false)
    expect(wrapper.findAll('tbody tr').length).toBe(workOrderMaterials(WO).length)
    wrapper.unmount()
  })

  it('refuses a qty above the limit inline, naming it (P-2)', async () => {
    const wrapper = await mountRecord()
    // An untracked line — a tracked one's qty is its batch / serial pick.
    const i = wrapper.findAll('tbody tr').findIndex(tr => !tr.find('.mr-tracking').exists())
    expect(i).toBeGreaterThanOrEqual(0)
    // P-1 — the limit is the lower of what is still reserved and what is on hand.
    const max = Math.min(Number(cell(wrapper, i, 'Reserved qty')), Number(cell(wrapper, i, 'On hand qty')))
    await wrapper.findAll('tbody tr')[i]!.find('input[type="number"]').setValue(String(max + 1))
    expect(wrapper.find('.mr-field-error').text()).toContain(`Max ${max}`)
    wrapper.unmount()
  })

  it('Return shows the P-5 columns and says returned qty goes to available stock', async () => {
    const wrapper = await mountRecord('return')
    expect(headers(wrapper)).toEqual([
      'Product', 'SKU', 'Warehouse', 'Needed qty', 'Reserved qty', 'Consumed qty',
      'Max returnable', 'Qty to return', 'Unit',
    ])
    expect(wrapper.text()).toContain('Returned qty goes to available stock')
    wrapper.unmount()
  })

  it('a work order created with reservation off has no Reserved column, and on hand is the limit (P-3)', async () => {
    WO.reservation = { on: false, method: 'one-step' }
    const wrapper = await mountRecord()
    expect(headers(wrapper)).not.toContain('Reserved qty')
    // Untracked line, typed one over on hand → the error names on hand as the max.
    const i = wrapper.findAll('tbody tr').findIndex(tr => !tr.find('.mr-tracking').exists())
    const onHand = Number(cell(wrapper, i, 'On hand qty'))
    await wrapper.findAll('tbody tr')[i]!.find('input[type="number"]').setValue(String(onHand + 1))
    expect(wrapper.find('.mr-field-error').text()).toContain(`Max ${onHand}`)
    wrapper.unmount()
  })
})
