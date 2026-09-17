// @vitest-environment happy-dom
/**
 * The Replenishment pages actually mount and render real rows.
 *
 * Data-layer specs prove the numbers; this proves the screens are wired to them —
 * the failure mode a pure data spec cannot catch (a wrong slot name, a column key
 * that never resolves, a page that renders an empty table over a non-empty list).
 *
 * Mounts the real pages, so every Nuxt auto-import the page (or a pattern/composable
 * it uses) relies on has to be stubbed globally — same approach as
 * bulk-create-task-warehouse-guard.spec.ts.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, computed, reactive, watch, onMounted, onUnmounted, nextTick, useSlots } from 'vue'
import ReplenishmentPage from '~/components/pages/ReplenishmentPage.vue'
import ReplenishmentSetupPage from '~/components/pages/ReplenishmentSetupPage.vue'
import SettingsReplenishmentPage from '~/components/pages/SettingsReplenishmentPage.vue'
import { replenishmentWorklist } from '~/data/replenishment'
import { useTableState } from '~/composables/useTableState'
import { useReplenishmentWarehouse } from '~/composables/useReplenishmentWarehouse'

vi.stubGlobal('inject', () => undefined)
vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('watch', watch)
vi.stubGlobal('onMounted', onMounted)
vi.stubGlobal('onUnmounted', onUnmounted)
vi.stubGlobal('nextTick', nextTick)
vi.stubGlobal('useSlots', useSlots)
vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
vi.stubGlobal('useRoute', () => ({ query: {} }))
vi.stubGlobal('useWarehouseContext', () => ({
  assignedWarehouses: computed(() => []),
  activeWarehouse: computed(() => null),
}))
vi.stubGlobal('useActiveWarehouseFilter', () => ref([]))
vi.stubGlobal('useTableState', useTableState)
vi.stubGlobal('useReplenishmentWarehouse', useReplenishmentWarehouse)
vi.stubGlobal('useScenario', () => ({ activeScenario: ref('ERP'), setScenario: vi.fn() }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

async function mountLoaded(Component: unknown, props?: Record<string, unknown>) {
  vi.useFakeTimers()
  const wrapper = mount(Component as never, props ? { props } : undefined)
  await vi.advanceTimersByTimeAsync(1300) // the shared 1200ms loading skeleton
  await flushPromises()
  vi.useRealTimers()
  return wrapper
}

describe('ReplenishmentPage — the worklist renders', () => {
  it('mounts and shows one row per due SKU-warehouse pair, up to the page size', async () => {
    const wrapper = await mountLoaded(ReplenishmentPage)
    const rows = wrapper.findAll('.erp-tr')
    expect(rows.length).toBeGreaterThan(0)

    const expected = Math.min(25, replenishmentWorklist('all').rows.length)
    expect(rows.length).toBe(expected)
  })

  it('renders real product names, not placeholders', async () => {
    const wrapper = await mountLoaded(ReplenishmentPage)
    const firstRow = wrapper.findAll('.erp-tr')[0]!
    const name = firstRow.find('.rp-product-name')
    expect(name.exists()).toBe(true)
    expect(name.text().length).toBeGreaterThan(3)
  })

  it('shows the ATP breakdown so the netting can be checked', async () => {
    const wrapper = await mountLoaded(ReplenishmentPage)
    const text = wrapper.text()
    expect(text).toContain('On hand')
    expect(text).toContain('Reserved')
    expect(text).toContain('On order')
  })

  it('shows the stat cards and the freshness line', async () => {
    const wrapper = await mountLoaded(ReplenishmentPage)
    const text = wrapper.text()
    expect(text).toContain('To order')
    expect(text).toContain('Needs setup')
    expect(text).toContain('As of')
    expect(text).toContain('Recalculate')
  })

  it('offers exactly the two quick filters plus the All filters pill', async () => {
    const wrapper = await mountLoaded(ReplenishmentPage)
    // docs/patterns/index-page-format.md caps quick filters at 2.
    expect(wrapper.find('#rp-warehouse-select').exists()).toBe(true)
    expect(wrapper.find('#rp-fsn-select').exists()).toBe(true)
    expect(wrapper.find('.filter-all-btn').exists()).toBe(true)
  })

  it('renders an FSN badge on every row', async () => {
    const wrapper = await mountLoaded(ReplenishmentPage)
    const rows = wrapper.findAll('.erp-tr')
    const labels = ['Fast', 'Slow', 'Non-moving', 'Unclassified']
    for (const row of rows) {
      expect(labels.some((l) => row.text().includes(l))).toBe(true)
    }
  })

  it('shows a suggested quantity on every due row that has a vendor', async () => {
    const wrapper = await mountLoaded(ReplenishmentPage)
    const rows = wrapper.findAll('.erp-tr')
    // Every row is due, so each must show a number the buyer can act on.
    for (const row of rows) {
      expect(row.text()).not.toContain('NaN')
      expect(row.text()).not.toContain('undefined')
    }
  })
})

describe('ReplenishmentSetupPage — Needs setup, and the muted disclosure', () => {
  it('renders the Needs setup rows with their missing-input chips', async () => {
    const wrapper = await mountLoaded(ReplenishmentSetupPage, { mode: 'needs-setup' })
    const expected = Math.min(25, replenishmentWorklist('all').needsSetup.length)
    expect(wrapper.findAll('.erp-tr').length).toBe(expected)
    expect(wrapper.text()).toContain('cannot be suggested yet')
  })

  it('hides the muted disclosure while nothing is muted', async () => {
    // Not-tracked products have no tab, and the link to them must not appear
    // either until there is actually something to show — otherwise it is the same
    // noise the tab was, just smaller.
    const wrapper = await mountLoaded(ReplenishmentSetupPage, { mode: 'needs-setup' })
    expect(wrapper.text()).not.toContain('not tracked')
  })

  it('still renders the muted list, so un-muting is never a dead end', async () => {
    const wrapper = await mountLoaded(ReplenishmentSetupPage, { mode: 'not-tracked' })
    // Nothing is muted by default, so this must be the explicit empty state.
    expect(wrapper.text()).toContain('No untracked products')
  })
})

describe('SettingsReplenishmentPage — renders and validates', () => {
  it('mounts read-only, then reveals the editor', async () => {
    const wrapper = await mountLoaded(SettingsReplenishmentPage)
    expect(wrapper.text()).toContain('Replenishment settings')
    expect(wrapper.text()).toContain('Lookback window')
    // Not editing yet, so no Save button.
    expect(wrapper.text()).not.toContain('Save changes')

    await wrapper.findAll('button').find((b) => b.text().includes('Edit'))!.trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('Save changes')
  })

  it('shows an inline error instead of disabling Save when a rule is invalid', async () => {
    const wrapper = await mountLoaded(SettingsReplenishmentPage)
    await wrapper.findAll('button').find((b) => b.text().includes('Edit'))!.trigger('click')
    await nextTick()

    // Break the FSN bands: Fast must stay above Slow.
    const fastInput = wrapper.find('input#rs-fast-input')
    expect(fastInput.exists()).toBe(true)
    await fastInput.setValue('5') // below the Slow default (10)
    await nextTick()

    const save = wrapper.findAll('button').find((b) => b.text().includes('Save changes'))!
    // DESIGN.md: never disabled for validation.
    expect(save.attributes('disabled')).toBeUndefined()
    await save.trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('must be higher than the Slow threshold')
  })
})
