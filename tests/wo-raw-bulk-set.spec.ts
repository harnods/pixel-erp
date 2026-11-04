// @vitest-environment happy-dom
/**
 * UC-01 C-2 — New work order › Raw materials: tick components (or all of them) and
 * the header row turns into a bulk bar that sets ONE warehouse or ONE required date
 * on every ticked component (rule/table-bulk-actions-bar). Replaces the old
 * "Bulk set warehouse" tickbox, which was wired to nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed } from 'vue'
import CreateWorkOrderPage from '~/components/pages/CreateWorkOrderPage.vue'
import { billOfMaterials } from '~/data/billOfMaterials'

vi.stubGlobal('computed', computed)
vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

// Bill of Materials #10003 — four components, so "some" and "all" differ.
const BOM = billOfMaterials.find(b => b.id === 'bom-10003')!

type Vm = {
  rawRows: { id: number; productId: string; warehouseId: string; requiredDate: string; batchSelection: unknown[] }[]
  selectedRaw: Set<number>
  toggleRaw: (id: number) => void
  toggleAllRaw: () => void
  bulkSetRawWarehouse: (id: string) => void
  bulkSetRawDate: (d: string) => void
}

async function mountWithBom() {
  vi.useFakeTimers()
  vi.stubGlobal('useRoute', () => ({ query: { bomId: BOM.id } }))
  const wrapper = mount(CreateWorkOrderPage, { attachTo: document.body })
  vi.advanceTimersByTime(700) // the BOM "loads" for 600 ms
  vi.useRealTimers()
  await flushPromises()
  return { wrapper, vm: wrapper.vm as unknown as Vm }
}

describe('New work order — bulk set warehouse / required date (C-2)', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('drops the old "Bulk set warehouse" tickbox and gives every component row a tickbox', async () => {
    const { wrapper } = await mountWithBom()
    expect(wrapper.text()).not.toContain('Bulk set warehouse')
    // The trailing empty row (where a new component is typed) has no tickbox.
    expect(wrapper.findAll('[id^="raw-sel-"]')).toHaveLength(BOM.rawMaterials.length)
    expect(wrapper.find('#raw-select-all').exists()).toBe(true)
    wrapper.unmount()
  })

  // The bulk affordance is an "Apply to N" ROW at the top of the body, in the
  // columns it sets — the product-variant pattern — not a bar that replaces the
  // header. The header has to keep its labels: they are what say which column
  // the warehouse picker in the row below is setting.
  it('ticking a row adds an apply row and leaves the header labelled', async () => {
    const { wrapper, vm } = await mountWithBom()
    vm.toggleRaw(vm.rawRows[0]!.id)
    await flushPromises()

    const applyRow = wrapper.find('.wo-tr--apply')
    expect(applyRow.exists()).toBe(true)
    expect(applyRow.text()).toContain('Apply to 1 component')

    // The header survives, select-all included.
    const header = wrapper.find('thead')
    expect(header.text()).toContain('Warehouse')
    expect(header.text()).toContain('Required date')
    expect(wrapper.find('#raw-select-all').exists()).toBe(true)
    expect(wrapper.find('.wo-bulk-bar').exists()).toBe(false)
    wrapper.unmount()
  })

  it('drops the apply row again once nothing is ticked', async () => {
    const { wrapper, vm } = await mountWithBom()
    vm.toggleRaw(vm.rawRows[0]!.id)
    await flushPromises()
    expect(wrapper.find('.wo-tr--apply').exists()).toBe(true)
    vm.toggleRaw(vm.rawRows[0]!.id)
    await flushPromises()
    expect(wrapper.find('.wo-tr--apply').exists()).toBe(false)
    wrapper.unmount()
  })

  it('select-all ticks every component row, and again clears them', async () => {
    const { wrapper, vm } = await mountWithBom()
    vm.toggleAllRaw()
    expect(vm.selectedRaw.size).toBe(BOM.rawMaterials.length)
    vm.toggleAllRaw()
    expect(vm.selectedRaw.size).toBe(0)
    wrapper.unmount()
  })

  it('sets one warehouse and one required date on the ticked rows only', async () => {
    const { wrapper, vm } = await mountWithBom()
    const [a, b, c] = vm.rawRows
    const untouched = { warehouseId: c!.warehouseId, requiredDate: c!.requiredDate }
    a!.batchSelection = [{ batchNo: 'B-1', qty: 1 }]
    vm.toggleRaw(a!.id)
    vm.toggleRaw(b!.id)

    vm.bulkSetRawWarehouse('wh-002')
    vm.bulkSetRawDate('20/12/2026')

    for (const r of [a!, b!]) {
      expect(r.warehouseId).toBe('wh-002')
      expect(r.requiredDate).toBe('20/12/2026')
    }
    // A batch pick belonged to the old warehouse, so it goes with it.
    expect(a!.batchSelection).toEqual([])
    expect({ warehouseId: c!.warehouseId, requiredDate: c!.requiredDate }).toEqual(untouched)
    // The selection stays, so the other field can be set next.
    expect(vm.selectedRaw.size).toBe(2)
    wrapper.unmount()
  })

  it('Esc deselects', async () => {
    const { wrapper, vm } = await mountWithBom()
    vm.toggleAllRaw()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(vm.selectedRaw.size).toBe(0)
    wrapper.unmount()
  })
})
