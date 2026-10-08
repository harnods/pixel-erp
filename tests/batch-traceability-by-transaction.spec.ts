// @vitest-environment happy-dom
/**
 * Batch Traceability Report — By transaction (PRD stories 4, 5, plan Phase 2).
 *
 * Filter-first: nothing lists until a transaction type or date is picked and Filter is
 * clicked. The result is the By batch grouped table — one parent row per transaction,
 * its batches as child rows (signed per the sign rule: a Work order's output is +, its
 * raw materials −), paged by transaction.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import * as vue from 'vue'
import { useTableState } from '~/composables/useTableState'
import BatchTraceabilityByTransaction from '~/components/patterns/BatchTraceabilityByTransaction.vue'
import ErpPagination from '~/components/patterns/ErpPagination.vue'
import {
  emptyTransactionFilters, type TransactionFiltersValue,
} from '~/components/patterns/BatchTransactionFiltersDrawer.vue'
import { searchTransactions, batchesInTransactions, FULL_ACCESS, TRACE_TX_TYPES } from '~/data/batchTraceability'
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
// Filters live in a module-level store (so the report survives a trip to a batch's
// detail page) — reset it so each test starts from a fresh report.
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  useBatchTraceabilityReportState().resetTransactionSearch()
})

/** Set filters in the All filters drawer and click Filter — every filter lives there. */
async function setFilters(w: VueWrapper, patch: Partial<TransactionFiltersValue>) {
  const drawer = w.findComponent({ name: 'BatchTransactionFiltersDrawer' })
  drawer.vm.$emit('apply', { ...emptyTransactionFilters(), ...patch })
  await flushPromises()
}

async function filterBy(w: VueWrapper, types: string[] | 'all') {
  await setFilters(w, { typeLabels: types === 'all' ? [...TRACE_TX_TYPES] : types })
  await w.find('.btx-filter-btn').trigger('click')
  await flushPromises()
  // The first-load skeleton runs on a timer; under a busy full-suite run it can outlast
  // the fixed wait below, so wait for the real rows instead.
  for (let i = 0; i < 40 && w.find('.btx-parent--skeleton').exists(); i++) {
    await new Promise((r) => setTimeout(r, 50))
    await flushPromises()
  }
}

async function mountView(types: string[] | 'all' | null = 'all') {
  wrapper = mount(BatchTraceabilityByTransaction, { props: { access: FULL_ACCESS, empty: false } })
  // The view shows a first-load skeleton for 400ms before rendering rows.
  await new Promise((r) => setTimeout(r, 450))
  await flushPromises()
  if (types) await filterBy(wrapper, types)
  return wrapper
}

const parents = (w: VueWrapper) => w.findAll('.btx-parent:not(.btx-parent--skeleton)')

describe('By transaction — filter first', () => {
  it('lists nothing until Filter is clicked', async () => {
    const w = await mountView(null)
    expect(parents(w)).toHaveLength(0)
    expect(w.text()).toContain('Filter to see transactions')
  })

  it('asks for at least one filter when Filter is clicked with none', async () => {
    const w = await mountView(null)
    await w.find('.btx-filter-btn').trigger('click')
    await flushPromises()
    expect(w.find('.btx-filter-error').text()).toContain('Select at least one filter')
    expect(parents(w)).toHaveLength(0)
  })

  it('filters by date alone', async () => {
    const w = await mountView(null)
    const date = { op: 'after' as const, date: '2026-01-01' }
    await setFilters(w, { dateCondition: date })
    await w.find('.btx-filter-btn').trigger('click')
    await flushPromises()
    expect(w.findComponent(ErpPagination).props('total')).toBe(searchTransactions({ date }).length)
  })

  it('keeps showing the applied result while the bar is edited, until Filter again', async () => {
    const w = await mountView('all')
    const total = searchTransactions().length
    await setFilters(w, { typeLabels: ['Work order'] })
    expect(w.findComponent(ErpPagination).props('total')).toBe(total)
  })
})

describe('By transaction — All filters drawer', () => {
  it('applies the drawer only on Filter, and counts it as a filter on its own', async () => {
    const w = await mountView(null)
    const numbers = searchTransactions().slice(0, 2).map((t) => t.number)
    await setFilters(w, { numbers })
    // Nothing lists yet — the drawer edits the draft, Filter applies it.
    expect(parents(w)).toHaveLength(0)

    await w.find('.btx-filter-btn').trigger('click')
    await flushPromises()
    expect(w.find('.btx-filter-error').exists()).toBe(false)
    expect(parents(w).map((p) => p.find('.btx-tx-number').text()).sort()).toEqual([...numbers].sort())
  })
})

describe('By transaction — grouped rows', () => {
  it('pages by transaction, newest first, 25 to a page', async () => {
    const w = await mountView('all')
    const all = searchTransactions()
    expect(w.findComponent(ErpPagination).props('total')).toBe(all.length)
    const numbers = parents(w).map((p) => p.find('.btx-tx-number').text())
    expect(numbers).toHaveLength(25)
    const newest = [...all].sort((a, b) => b.date.localeCompare(a.date))[0]!
    expect(numbers[0]).toBe(newest.number)
  })

  it('starts folded, and a transaction row opens its batches', async () => {
    const w = await mountView('all')
    const first = parents(w)[0]!
    const number = first.find('.btx-tx-number').text()
    const lines = batchesInTransactions([number])
    // Folded by default — the result reads as a transaction list until one is opened.
    expect(w.findAll('.btx-child')).toHaveLength(0)
    expect(first.text()).toContain(lines.length === 1 ? '1 batch' : `${lines.length} batches`)

    await first.find('.btx-parent-cell').trigger('click')
    expect(w.findAll('.btx-child')).toHaveLength(lines.length)
    // The product leads each child row, merged across its batches.
    const products = new Set(lines.map((l) => l.sku))
    expect(w.findAll('.btx-child-product')).toHaveLength(products.size)

    await first.find('.btx-parent-cell').trigger('click')
    expect(w.findAll('.btx-child')).toHaveLength(0)
  })

  it('names the attributes on the transaction row — the union of its products\' sets', async () => {
    const w = await mountView(['Sales delivery'])
    const multi = parents(w).find((p) => /[2-9] batches/.test(p.text()))!
    const names = multi.findAll('.btx-attr-name').map((c) => c.text())
    expect(names.length).toBeGreaterThan(0)
    expect(new Set(names).size).toBe(names.length)
    // Batch rows carry values only — the names live on the transaction row.
    expect(w.find('.btx-child .btx-attr-name').exists()).toBe(false)
  })

  it('shows a Work order output as + and its raw materials as −', async () => {
    const w = await mountView(['Work order'])
    await parents(w)[0]!.find('.btx-parent-cell').trigger('click')
    const number = parents(w)[0]!.find('.btx-tx-number').text()
    const signs = batchesInTransactions([number]).map((l) => l.baseDelta)
    expect(signs.some((d) => d > 0)).toBe(true)
    expect(signs.some((d) => d < 0)).toBe(true)
    const cells = w.findAll('.btx-child .bt-num').map((c) => c.text())
    expect(cells.some((text) => text.startsWith('+'))).toBe(true)
    expect(cells.some((text) => text.startsWith('−'))).toBe(true)
  })
})
