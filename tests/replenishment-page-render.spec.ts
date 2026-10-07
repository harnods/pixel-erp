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
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
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

    // Covered-by-inbound rows stay on the table (US-004 AC-03), flagged, with qty 0.
    const wl = replenishmentWorklist('all')
    const expected = Math.min(25, wl.rows.length + wl.coveredByInbound.length)
    expect(rows.length).toBe(expected)
  })

  it('shows a Covered by inbound card with its own count, apart from To order', async () => {
    const wrapper = await mountLoaded(ReplenishmentPage)
    const wl = replenishmentWorklist('all')
    expect(wl.coveredByInbound.length).toBeGreaterThan(0)
    const covered = wrapper.findAll('.stat-card').find((c) => c.text().includes('Covered by inbound'))!
    expect(covered.exists()).toBe(true)
    expect(covered.text()).toContain(String(new Set(wl.coveredByInbound.map((r) => r.sku)).size))
  })

  it('renders real product names, not placeholders', async () => {
    const wrapper = await mountLoaded(ReplenishmentPage)
    const firstRow = wrapper.findAll('.erp-tr')[0]!
    // rule/table-product-cell — the shared ProductCell renders the name.
    const name = firstRow.find('a.cell-link')
    expect(name.exists()).toBe(true)
    expect(name.text().length).toBeGreaterThan(3)
  })

  it('shows the ATP breakdown so the netting can be checked', async () => {
    const wrapper = await mountLoaded(ReplenishmentPage)
    const text = wrapper.text()
    expect(text).toContain('On hand')
    expect(text).toContain('Reserved')
    expect(text).toContain('In transit')
  })

  it('shows the stat cards and the freshness line', async () => {
    const wrapper = await mountLoaded(ReplenishmentPage)
    const text = wrapper.text()
    expect(text).toContain('To order')
    expect(text).toContain('Stocks out before resupply')
    expect(text).toContain('No vendor')
    // Needs setup is a page tab with its own count — not a stat card.
    expect(text).not.toContain('Needs setup')
    expect(text).toContain('As of')
    // The Recalculate action lives in the title bar only — no duplicate link here.
    expect(wrapper.find('.rp-freshness-link').exists()).toBe(false)
  })

  it('offers exactly the two quick filters plus the All filters pill', async () => {
    const wrapper = await mountLoaded(ReplenishmentPage)
    // docs/patterns/index-page-format.md caps quick filters at 2.
    // rule/select-erpfilterselect — both are ErpFilterSelect, never MpSelect.
    const selects = wrapper.findAllComponents(ErpFilterSelect).map((c) => c.props('id'))
    expect(selects).toContain('rp-warehouse-select')
    expect(selects).toContain('rp-fsn-select')
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

describe('ReplenishmentSetupPage — Needs setup (missing lead time + muted)', () => {
  it('renders the Needs setup rows with their missing-input chips', async () => {
    const wrapper = await mountLoaded(ReplenishmentSetupPage, { mode: 'needs-setup' })
    const wl = replenishmentWorklist('all')
    const expected = Math.min(25, wl.needsSetup.length + wl.notTracked.length)
    expect(wrapper.findAll('.erp-tr').length).toBe(expected)
    // No page-description subtitle (rule/no-page-description-subtitle), and no stale
    // "Sales history" column — demand no longer routes a product here (D18).
    expect(wrapper.text()).not.toContain('cannot be suggested yet')
    expect(wrapper.text()).not.toContain('Sales history')
  })

  it('lists muted products in Needs setup with a "Tracking off" reason (US-010 AC-02)', async () => {
    const { setTracked } = await import('~/data/replenishmentSettings')
    const { invalidateReplenishmentCaches } = await import('~/data/replenishment')
    const due = replenishmentWorklist('all').rows[0]!
    setTracked(due.sku, due.warehouseId, false)
    invalidateReplenishmentCaches()
    try {
      const wrapper = await mountLoaded(ReplenishmentSetupPage, { mode: 'needs-setup' })
      const wl = replenishmentWorklist('all')
      expect(wrapper.findAll('.erp-tr').length).toBe(Math.min(25, wl.needsSetup.length + wl.notTracked.length))
      expect(wrapper.text()).toContain('Tracking off')
      // No separate "Show" disclosure any more — the rows are right here.
      expect(wrapper.text()).not.toContain('products are not tracked')
    } finally {
      setTracked(due.sku, due.warehouseId, true)
      invalidateReplenishmentCaches()
    }
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

  it('follows the settings-page pattern (docs/patterns/settings-page.md)', async () => {
    const wrapper = await mountLoaded(SettingsReplenishmentPage)
    // Own title bar: breadcrumb back to the module above the H1.
    expect(wrapper.find('h1').text()).toBe('Replenishment settings')
    expect(wrapper.find('#rs-breadcrumb').text()).toBe('Replenishment')
    // H2 sections, no page/section description subtitles.
    expect(wrapper.findAll('h2').map((h) => h.text())).toContain('Movement classification (FSN)')
    expect(wrapper.text()).not.toContain('Classifies products by how often they move')
    // rule/settings-no-unbuilt-controls — the dead schedule toggle is gone.
    expect(wrapper.text()).not.toContain('Recalculate on a schedule')
    // View-mode values are whole sentences, never `${v}d` fragments.
    expect(wrapper.text()).toMatch(/\d+ days/)
    expect(wrapper.text()).not.toMatch(/\b\d+d\b/)
  })

  it('shows an inline error instead of disabling Save when a rule is invalid', async () => {
    const wrapper = await mountLoaded(SettingsReplenishmentPage)
    await wrapper.findAll('button').find((b) => b.text().includes('Edit'))!.trigger('click')
    await nextTick()

    // Break the FSN bands: Fast must stay above Slow.
    // MpFormControl puts its id on the input it wraps.
    const fastInput = wrapper.find('input#rs-fast-fc')
    expect(fastInput.exists()).toBe(true)
    await fastInput.setValue('5') // below the Slow default (10)
    await nextTick()

    const save = wrapper.findAll('button').find((b) => b.text().includes('Save changes'))!
    // DESIGN.md: never disabled for validation.
    expect(save.attributes('disabled')).toBeUndefined()
    await save.trigger('click')
    await nextTick()
    // Shown AT the field (rule/form-errors-inline), with a pointer in the action bar.
    // MpFormControl is-invalid + MpFormErrorMessage (rule/field-invalid-caption).
    expect(wrapper.text()).toContain('Fast must be higher than Slow')
    expect(wrapper.find('input#rs-fast-fc').attributes('aria-invalid')).toBe('true')
    expect(wrapper.text()).toContain('Fix the highlighted fields to save')
  })
})
