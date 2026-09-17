// @vitest-environment happy-dom
/**
 * Removing a product that a count task holds in MORE THAN ONE location.
 *
 * The delete button sits on a single location's row, but the product may be in
 * several of this task's locations. Removing it is then a task-wide action, so
 * it has to be confirmed and the confirmation has to name the locations —
 * otherwise the other location cards change behind the operator's back.
 *
 * The storage model currently tiles SKUs across bins (each SKU belongs to
 * exactly one bin), so this can't be reached through the UI yet — the guard is
 * defensive, and this spec is what proves it works. It drives the component's
 * own state rather than the picker, which is the only way to build a
 * multi-location draft today.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed } from 'vue'
import NewCountTaskPage from '~/components/pages/NewCountTaskPage.vue'

vi.stubGlobal('computed', computed)
vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
vi.stubGlobal('useRoute', () => ({ query: {} }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const SHARED_SKU = '1001'
const OTHER_SKU = '1002'

/** Three location cards, the shared SKU in all of them, another SKU in only one. */
function seedThreeLocations(vm: any) {
  vm.selectedLocations = ['Bin 01', 'Bin 02', 'Bin 03'].map((name, i) => ({
    locId: `loc-${i}`,
    fullPath: name,
    skuStart: 0,
    skuQty: 10,
    productDrawerOpen: false,
    rows: [
      { sku: SHARED_SKU, onHand: 5 },
      ...(i === 0 ? [{ sku: OTHER_SKU, onHand: 3 }] : []),
    ],
  }))
}

async function mountPage() {
  const wrapper = mount(NewCountTaskPage, { props: { orderId: 'new' } })
  await flushPromises()
  return wrapper
}

describe('NewCountTaskPage — removing a product held in several locations', () => {
  it('asks first, and names every location the product is counted in', async () => {
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    seedThreeLocations(vm)
    await flushPromises()

    vm.removeLocRow(vm.selectedLocations[0], SHARED_SKU)
    await flushPromises()

    // Nothing removed yet — the operator hasn't confirmed.
    expect(vm.removeSkuTarget).toBe(SHARED_SKU)
    expect(vm.selectedLocations.every((l: any) => l.rows.some((r: any) => r.sku === SHARED_SKU))).toBe(true)
    // Every location holding it is named, so the scope is visible before deciding.
    expect(vm.removeSkuLocations).toEqual(['Bin 01', 'Bin 02', 'Bin 03'])

    // …and that actually reaches the screen: the confirmation names the product,
    // the count, the bins, and an action button that says what it will do.
    const html = document.body.innerHTML + wrapper.html()
    expect(html).toContain('Remove this product from the count?')
    expect(html).toContain('Bin 01, Bin 02, Bin 03')
    expect(html).toContain('Remove from all locations')
  })

  it('removes the product from every location once confirmed', async () => {
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    seedThreeLocations(vm)
    await flushPromises()

    vm.removeLocRow(vm.selectedLocations[0], SHARED_SKU)
    vm.confirmRemoveSku()
    await flushPromises()

    for (const loc of vm.selectedLocations) {
      expect(loc.rows.some((r: any) => r.sku === SHARED_SKU)).toBe(false)
    }
    // Only the shared SKU goes — the other product stays exactly where it was.
    expect(vm.selectedLocations[0].rows.map((r: any) => r.sku)).toEqual([OTHER_SKU])
    expect(vm.removeSkuTarget).toBe(null)
  })

  it('drops the product from the Count-by-SKU selection too, so it cannot come back', async () => {
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    seedThreeLocations(vm)
    vm.bySkuSelected = [SHARED_SKU, OTHER_SKU]
    await flushPromises()

    vm.removeLocRow(vm.selectedLocations[0], SHARED_SKU)
    vm.confirmRemoveSku()
    await flushPromises()

    // Left in the picker selection, reopening it and saving would silently
    // rebuild the product into every location again.
    expect(vm.bySkuSelected).toEqual([OTHER_SKU])
  })

  it('cancelling leaves every location untouched', async () => {
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    seedThreeLocations(vm)
    await flushPromises()

    vm.removeLocRow(vm.selectedLocations[0], SHARED_SKU)
    vm.removeSkuTarget = null
    await flushPromises()

    expect(vm.selectedLocations.every((l: any) => l.rows.some((r: any) => r.sku === SHARED_SKU))).toBe(true)
  })

  it('removes straight away when the product is only in one location — nothing to warn about', async () => {
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    seedThreeLocations(vm)
    await flushPromises()

    vm.removeLocRow(vm.selectedLocations[0], OTHER_SKU)
    await flushPromises()

    expect(vm.removeSkuTarget).toBe(null)
    expect(vm.selectedLocations[0].rows.map((r: any) => r.sku)).toEqual([SHARED_SKU])
  })
})
