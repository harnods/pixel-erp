// @vitest-environment happy-dom
/**
 * A picking list / packing task / put-away task is always single-warehouse.
 * All three bulk "create" actions (Outgoing → Create picking list, Picking →
 * Create packing, Receiving → Create put-away) already hide their button once
 * the selection spans more than one warehouse (bulkPickable/bulkPackable/
 * canCreatePutAway all require every selected row to share one warehouseId).
 *
 * This adds the missing piece: when that's the reason the button is gone, a
 * caption in the table header explains why, instead of the button just
 * silently disappearing with no explanation.
 *
 * These mount the real index pages — none of Nuxt's auto-imports (ref,
 * reactive, useSlots, inject, useRouter, useWarehouseContext,
 * useActiveWarehouseFilter, ...) are available outside the real Nuxt runtime,
 * so every one the page (or a composable/pattern it uses) relies on without
 * its own explicit `import ... from 'vue'` has to be stubbed globally here.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, computed, reactive, watch, onMounted, onUnmounted, nextTick, useSlots } from 'vue'
import OutgoingIndexPage from '~/components/pages/OutgoingIndexPage.vue'
import PickingIndexPage from '~/components/pages/PickingIndexPage.vue'
import ReceivingIndexPage from '~/components/pages/ReceivingIndexPage.vue'

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
vi.stubGlobal('useWarehouseContext', () => ({ assignedWarehouses: computed(() => []) }))
vi.stubGlobal('useActiveWarehouseFilter', () => ref([]))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

async function mountLoaded(Component: unknown) {
  vi.useFakeTimers()
  const wrapper = mount(Component as never)
  await vi.advanceTimersByTimeAsync(1300) // demoState's loading-skeleton timeout
  await flushPromises()
  vi.useRealTimers()
  return wrapper
}

/** Dispatching the real DOM event (not @vue/test-utils' .trigger) — MpCheckbox
 *  binds its Vue `change` emit straight to the native input's onChange. */
function check(row: any) {
  row.find('input[type="checkbox"]').element.dispatchEvent(new Event('change', { bubbles: true }))
}

/** Groups a table's rows by a per-row warehouse-name cell's text, so a test
 *  can pick 2 rows guaranteed to differ (or match) without hardcoding seed data. */
function groupRowsByCellText(rows: any[], cellSelector: string): Map<string, any[]> {
  const groups = new Map<string, any[]>()
  for (const row of rows) {
    const cell = row.find(cellSelector)
    if (!cell.exists()) continue
    const text = cell.text()
    const list = groups.get(text) ?? []
    list.push(row)
    groups.set(text, list)
  }
  return groups
}

function pickTwoDifferentWarehouseRows(groups: Map<string, any[]>): [any, any] {
  const whs = [...groups.keys()]
  return [groups.get(whs[0]!)![0], groups.get(whs[1]!)![0]]
}

function pickTwoSameWarehouseRows(groups: Map<string, any[]>): [any, any] {
  for (const list of groups.values()) {
    if (list.length >= 2) return [list[0], list[1]]
  }
  throw new Error('No warehouse with 2+ rows found in seed data')
}

describe('OutgoingIndexPage — bulk "Create picking list" explains itself when the selection spans warehouses', () => {
  it('selecting orders from 2 different warehouses shows the hint, not the button', async () => {
    const wrapper = await mountLoaded(OutgoingIndexPage)
    const rows = wrapper.findAll('tr.erp-tr')
    const groups = groupRowsByCellText(rows, '.out-warehouse')
    const [a, b] = pickTwoDifferentWarehouseRows(groups)

    check(a)
    await flushPromises()
    check(b)
    await flushPromises()

    const thead = wrapper.find('thead')
    expect(thead.text()).toContain('Select orders from a single warehouse to create a picking list')
    expect(thead.text()).not.toContain('Create picking list')
    wrapper.unmount()
  })

  it('selecting 2 orders from the same warehouse shows no hint', async () => {
    const wrapper = await mountLoaded(OutgoingIndexPage)
    const rows = wrapper.findAll('tr.erp-tr')
    const groups = groupRowsByCellText(rows, '.out-warehouse')
    const [a, b] = pickTwoSameWarehouseRows(groups)

    check(a)
    await flushPromises()
    check(b)
    await flushPromises()

    const thead = wrapper.find('thead')
    expect(thead.text()).not.toContain('Select orders from a single warehouse')
    wrapper.unmount()
  })
})

describe('PickingIndexPage — bulk "Create packing" explains itself when the selection spans warehouses', () => {
  it('selecting picking lists from 2 different warehouses shows the hint, not the button', async () => {
    const wrapper = await mountLoaded(PickingIndexPage)
    const rows = wrapper.findAll('tr.erp-tr')
    const groups = groupRowsByCellText(rows, '.pick-warehouse')
    const [a, b] = pickTwoDifferentWarehouseRows(groups)

    check(a)
    await flushPromises()
    check(b)
    await flushPromises()

    const thead = wrapper.find('thead')
    expect(thead.text()).toContain('Select picking lists from a single warehouse to create packing')
    expect(thead.text()).not.toContain('Create packing')
    wrapper.unmount()
  })
})

describe('ReceivingIndexPage — bulk "Create put-away" explains itself when the selection spans warehouses', () => {
  it('selecting receiving tasks from 2 different warehouses shows the hint, not the button', async () => {
    const wrapper = await mountLoaded(ReceivingIndexPage)
    const rows = wrapper.findAll('tr.rcvg-task-row, tbody tr')
    const groups = groupRowsByCellText(rows, '.rcvg-td--warehouse')
    const [a, b] = pickTwoDifferentWarehouseRows(groups)

    check(a)
    await flushPromises()
    check(b)
    await flushPromises()

    const thead = wrapper.find('thead')
    expect(thead.text()).toContain('Select tasks from a single warehouse to create put-away')
    expect(thead.text()).not.toContain('Create put-away')
    wrapper.unmount()
  })

  it('selecting 2 tasks from the same warehouse shows no hint', async () => {
    const wrapper = await mountLoaded(ReceivingIndexPage)
    const rows = wrapper.findAll('tr.rcvg-task-row, tbody tr')
    const groups = groupRowsByCellText(rows, '.rcvg-td--warehouse')
    const [a, b] = pickTwoSameWarehouseRows(groups)

    check(a)
    await flushPromises()
    check(b)
    await flushPromises()

    const thead = wrapper.find('thead')
    expect(thead.text()).not.toContain('Select tasks from a single warehouse')
    wrapper.unmount()
  })
})
