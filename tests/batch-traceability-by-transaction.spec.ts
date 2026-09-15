// @vitest-environment happy-dom
/**
 * Batch Traceability Report — By transaction selection rules (PRD story 5, plan Phase 2).
 *
 * The selection lives in BatchTraceabilityByTransaction, not ErpTablePage, precisely so
 * it can behave the way the PRD asks:
 *   • "select all" picks every transaction in the filter result, not just this page
 *   • the selection survives paging
 *   • changing a filter resets it
 * and the second table lists the batches of whatever is selected, signed per the sign
 * rule (a Work order's output is +, its raw materials −).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import * as vue from 'vue'
import { MpCheckbox } from '@mekari/pixel3'
import { useTableState } from '~/composables/useTableState'
import BatchTraceabilityByTransaction from '~/components/patterns/BatchTraceabilityByTransaction.vue'
import ErpTablePage from '~/components/patterns/ErpTablePage.vue'
import MultiSelectDropdown from '~/components/patterns/MultiSelectDropdown.vue'
import { searchTransactions, batchesInTransactions, FULL_ACCESS } from '~/data/batchTraceability'
import { useBatchTraceabilityReportState } from '~/composables/useBatchTraceabilityReportState'

const { nextTick } = vue

// Nuxt auto-imports the components and composables rely on (Vitest has no auto-import
// layer): the Vue APIs used bare across ErpTablePage, the filter fields and drawers,
// plus useTableState and useRouter.
for (const name of [
  'computed', 'reactive', 'ref', 'shallowRef', 'toRef', 'watch', 'watchEffect', 'nextTick',
  'inject', 'provide', 'useSlots', 'useAttrs', 'onMounted', 'onUnmounted', 'onBeforeUnmount',
] as const) {
  vi.stubGlobal(name, vue[name])
}
vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
vi.stubGlobal('useTableState', useTableState)
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

let wrapper: VueWrapper | null = null
// Filters and the selection live in a module-level store (so the report survives a trip
// to a batch's detail page) — reset it so each test starts from a fresh report.
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  useBatchTraceabilityReportState().resetTransactionSearch()
})

async function mountView() {
  wrapper = mount(BatchTraceabilityByTransaction, { props: { access: FULL_ACCESS, empty: false } })
  // The view shows a first-load skeleton for 400ms before rendering rows.
  await new Promise((r) => setTimeout(r, 450))
  await flushPromises()
  return wrapper
}

function tables(w: VueWrapper) {
  return w.findAllComponents(ErpTablePage)
}

function checkbox(w: VueWrapper, id: string) {
  const found = w.findAllComponents(MpCheckbox).find((c) => (c.vm.$props as { id?: string }).id === id)
  if (!found) throw new Error(`checkbox ${id} not rendered`)
  return found
}

async function tick(w: VueWrapper, id: string) {
  checkbox(w, id).vm.$emit('change')
  await nextTick()
  await flushPromises()
}

function selectedText(w: VueWrapper): string {
  return w.find('.btx-selected').exists() ? w.find('.btx-selected').text() : ''
}

describe('By transaction — selection', () => {
  it('lists every matching transaction, one page at a time', async () => {
    const w = await mountView()
    const all = searchTransactions()
    expect(all.length).toBeGreaterThan(25)
    const [txTable] = tables(w)
    expect(txTable!.props('total')).toBe(all.length)
    expect((txTable!.props('rows') as unknown[]).length).toBe(25)
  })

  it('starts with nothing selected and the batches table on its hint', async () => {
    const w = await mountView()
    expect(selectedText(w)).toBe('')
    expect(tables(w)[1]!.props('total')).toBe(0)
    expect(w.text()).toContain('Select a transaction to see its batches.')
  })

  it('select all picks every transaction in the filter result, not just the page', async () => {
    const w = await mountView()
    await tick(w, 'btx-select-all')
    const all = searchTransactions()
    expect(selectedText(w)).toBe(`${all.length} transactions selected`)
    expect(tables(w)[1]!.props('total')).toBe(batchesInTransactions(all.map((r) => r.number)).length)
  })

  it('keeps the selection when paging', async () => {
    const w = await mountView()
    const first = (tables(w)[0]!.props('rows') as { number: string }[])[0]!
    await tick(w, `btx-row-${first.number}`)
    expect(selectedText(w)).toBe('1 transaction selected')

    tables(w)[0]!.vm.$emit('pageChange', 2)
    await flushPromises()
    expect(selectedText(w)).toBe('1 transaction selected')

    tables(w)[0]!.vm.$emit('pageChange', 1)
    await flushPromises()
    expect((checkbox(w, `btx-row-${first.number}`).vm.$props as { isChecked?: boolean }).isChecked).toBe(true)
  })

  it('resets the selection when a filter changes', async () => {
    const w = await mountView()
    const first = (tables(w)[0]!.props('rows') as { number: string }[])[0]!
    await tick(w, `btx-row-${first.number}`)
    expect(selectedText(w)).toBe('1 transaction selected')

    const typeFilter = w.findAllComponents(MultiSelectDropdown).find((c) => c.props('id') === 'btx-type')!
    typeFilter.vm.$emit('update:modelValue', ['Work order'])
    await flushPromises()

    expect(selectedText(w)).toBe('')
    const rows = tables(w)[0]!.props('rows') as { type: string }[]
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.type === 'Work order')).toBe(true)
  })

  it('shows a Work order output as + and its raw materials as −', async () => {
    const w = await mountView()
    const typeFilter = w.findAllComponents(MultiSelectDropdown).find((c) => c.props('id') === 'btx-type')!
    typeFilter.vm.$emit('update:modelValue', ['Work order'])
    await flushPromises()

    const wo = (tables(w)[0]!.props('rows') as { number: string }[])[0]!
    await tick(w, `btx-row-${wo.number}`)

    const cells = tables(w)[1]!.findAll('.bt-num').map((c) => c.text())
    expect(cells.some((text) => text.startsWith('+'))).toBe(true)
    expect(cells.some((text) => text.startsWith('−'))).toBe(true)
  })
})
