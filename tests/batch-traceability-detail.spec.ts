// @vitest-environment happy-dom
/**
 * Batch traceability detail page (PRD stories 7, 8, 10; plan Phase 3).
 *
 * Mounts the page for a real seeded batch and checks what the report promises:
 * Batch information above the section tabs, the Journey / History table switch, the Received − Issued = On hand line, the journey
 * expanding to the values recorded on a transaction, the entry-point highlight,
 * and related-batch drill-through keeping the breadcrumb chain.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import * as vue from 'vue'
import BatchTraceabilityDetailPage from '~/components/pages/BatchTraceabilityDetailPage.vue'
import { batchJourney, batchStockPosition, relatedBatches } from '~/data/batchTraceability'

const push = vi.fn()
let query: Record<string, string> = {}

for (const name of [
  'computed', 'reactive', 'ref', 'shallowRef', 'toRef', 'watch', 'watchEffect', 'nextTick',
  'inject', 'provide', 'useSlots', 'useAttrs', 'onMounted', 'onUnmounted', 'onBeforeUnmount',
] as const) {
  vi.stubGlobal(name, vue[name])
}
vi.stubGlobal('useRouter', () => ({ push }))
vi.stubGlobal('useRoute', () => ({ query }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

// Surface any Vue runtime error with its full stack instead of a silent render.
const vueErrors: unknown[] = []

let wrapper: VueWrapper | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  push.mockReset()
  query = {}
  vueErrors.length = 0
})

async function mountPage(orderId: string) {
  wrapper = mount(BatchTraceabilityDetailPage, {
    props: { orderId },
    global: { config: { errorHandler: (err) => { vueErrors.push(err) } } },
  })
  await flushPromises()
  return wrapper
}

describe('Batch traceability detail', () => {
  it('renders Batch information above the three section tabs with no runtime errors', async () => {
    const w = await mountPage('1001::Batch #001')
    expect(w.findAll('.btd-section-title').map((h) => h.text())).toEqual(['Batch information'])
    expect(w.findAllComponents({ name: 'MpTab' }).map((tab) => tab.text())).toEqual([
      'Stock position', 'Batch journey', 'Related batch',
    ])
    // Opens on Stock position, with the journey showing the diagram.
    expect(w.findComponent({ name: 'MpTabs' }).props('modelValue')).toBe(0)
    expect(w.find('.btd-journey-row').exists()).toBe(false)
    expect(vueErrors).toEqual([])
  })

  it('reconciles Total received − Total issued with on hand', async () => {
    const w = await mountPage('1001::Batch #001')
    const position = batchStockPosition('1001', 'Batch #001')!
    const fields = w.find('.btd-reconcile').findAll('.content-list').map((f) => f.text().replace(/\s+/g, ' '))
    expect(fields).toContain(`Total received${position.received} Sack`)
    expect(fields).toContain(`Total issued${position.issued} Sack`)
    expect(fields).toContain(`Total on hand${position.received - position.issued} Sack`)
    expect(w.find('.btd-mismatch').exists()).toBe(false)
  })

  it('switches Batch journey to the History table, which lists every line and expands one', async () => {
    const w = await mountPage('1001::Batch #001')
    w.findComponent({ name: 'MpSegmentedControl' }).vm.$emit('update:modelValue', 'history')
    await flushPromises()
    const rows = w.findAll('.btd-journey-row')
    expect(rows).toHaveLength(batchJourney('1001', 'Batch #001').length)
    expect(w.find('.btd-snapshot-row').exists()).toBe(false)

    await rows[0]!.trigger('click')
    expect(w.find('.btd-snapshot-row').exists()).toBe(true)
    expect(w.find('.btd-snapshot-row').text()).toContain('Recorded values')
  })

  it('highlights the transaction the user came from', async () => {
    const number = batchJourney('1001', 'Batch #001')[1]!.number
    query = { transaction: number }
    const w = await mountPage('1001::Batch #001')
    // A transaction entry opens Batch journey on the History table.
    expect(w.findComponent({ name: 'MpTabs' }).props('modelValue')).toBe(1)
    const highlighted = w.findAll('.btd-journey-row.btd-row--highlight')
    expect(highlighted).toHaveLength(1)
    expect(highlighted[0]!.text()).toContain(number)
  })

  it('opens a related batch and keeps the breadcrumb chain', async () => {
    const w = await mountPage('1101::Batch #001')
    const source = relatedBatches('1101', 'Batch #001').sources[0]!
    await w.find('.btd-related .cell-link').trigger('click')
    expect(push).toHaveBeenCalledWith({
      path: `/inventory-report/batch-traceability/${source.sku}/${encodeURIComponent(source.batchNo)}`,
      query: { trail: '1101::Batch #001' },
    })
  })

  it('shows a not-found state for an unknown batch', async () => {
    const w = await mountPage('1001::Nope')
    expect(w.find('.btd-notfound').exists()).toBe(true)
    expect(w.text()).toContain('Batch not found')
  })
})

describe('Batch traceability detail — export', () => {
  it('builds one section per picked part of the page, each with its own table', async () => {
    const w = await mountPage('1101::Batch #001')
    const buildSections = (w.vm as unknown as { buildSections: (keys: string[]) => { name: string; columns: string[]; rows: (string | number)[][] }[] }).buildSections
    const sections = buildSections(['information', 'position', 'journey', 'related'])
    expect(sections.map((s) => s.name)).toEqual(['Batch information', 'Stock position', 'Batch journey', 'Related batch'])

    const [information, position, journey, related] = sections
    expect(information!.rows).toHaveLength(1)
    expect(information!.rows[0]!.slice(0, 3)).toEqual(['Roasted Beans House Blend Medium', '1101', 'Batch #001'])

    const stock = batchStockPosition('1101', 'Batch #001')!
    expect(position!.rows.map((r) => r[0])).toEqual(expect.arrayContaining(['Total on hand', 'Total received', 'Total issued']))
    expect(position!.rows).toContainEqual(['Total received', `${stock.received} Bag`])

    expect(journey!.rows).toHaveLength(batchJourney('1101', 'Batch #001').length)
    expect(journey!.columns.length).toBe(journey!.rows[0]!.length)

    const sources = relatedBatches('1101', 'Batch #001').sources
    expect(related!.rows.filter((r) => r[0] === 'Source batch')).toHaveLength(sources.length)
    expect(vueErrors).toEqual([])
  })

  it('only builds the sections that were picked', async () => {
    const w = await mountPage('1101::Batch #001')
    const buildSections = (w.vm as unknown as { buildSections: (keys: string[]) => { name: string }[] }).buildSections
    expect(buildSections(['information', 'journey']).map((s) => s.name)).toEqual(['Batch information', 'Batch journey'])
  })
})

describe('Batch traceability detail — attribute change trail', () => {
  it('shows the regrade as a marker line between transactions, hidden by the toggle', async () => {
    query = { view: 'history' }
    const w = await mountPage('1001::Batch #001')
    const markers = w.findAll('.btd-change-row')
    expect(markers).toHaveLength(1)
    expect(markers[0]!.text()).toContain('Attribute change')
    expect(markers[0]!.text()).toContain('Grade:')
    expect(markers[0]!.text()).toContain('Web')
    // Movements are untouched: every journey line still renders.
    expect(w.findAll('.btd-journey-row')).toHaveLength(batchJourney('1001', 'Batch #001').length)

    const toggle = w.findAllComponents({ name: 'MpCheckbox' }).find((c) => (c.vm.$props as { id?: string }).id === 'btd-show-changes')!
    toggle.vm.$emit('change')
    await flushPromises()
    expect(w.findAll('.btd-change-row')).toHaveLength(0)
    expect(w.findAll('.btd-journey-row')).toHaveLength(batchJourney('1001', 'Batch #001').length)
    expect(vueErrors).toEqual([])
  })

  it('has no marker or toggle for a batch whose attributes never changed', async () => {
    query = { view: 'history' }
    const w = await mountPage('1004::Batch #001')
    expect(w.findAll('.btd-change-row')).toHaveLength(0)
    expect(w.find('#btd-show-changes').exists()).toBe(false)
  })

  it('exports the change trail with the journey', async () => {
    const w = await mountPage('1001::Batch #001')
    const buildSections = (w.vm as unknown as { buildSections: (keys: string[]) => { name: string; rows: (string | number)[][] }[] }).buildSections
    const trail = buildSections(['information', 'journey']).find((s) => s.name === 'Attribute changes')!
    expect(trail.rows).toHaveLength(1)
    expect(trail.rows[0]).toEqual(expect.arrayContaining(['Web', 'Grade']))
  })
})

import { batchJourneyGraph } from '~/data/batchTraceability'

describe('Batch traceability detail — visual journey', () => {
  it('draws came from, this batch and went to, one node per transaction group', async () => {
    const w = await mountPage('1101::Batch #001')
    const graph = batchJourneyGraph('1101', 'Batch #001')
    expect(w.findAll('.bjd-col-title').map((e) => e.text())).toEqual(['Came from', 'This batch', 'Went to'])
    expect(w.findAll('.bjd-col--in .bjd-node')).toHaveLength(graph.incoming.length)
    expect(w.findAll('.bjd-col--center .bjd-node')).toHaveLength(graph.internal.length)
    expect(w.findAll('.bjd-col--out .bjd-node')).toHaveLength(graph.outgoing.length)
    expect(w.find('.bjd-batch-card').text()).toContain('Batch #001')
    expect(vueErrors).toEqual([])
  })

  it('expands a node to the transactions it groups', async () => {
    const w = await mountPage('1101::Batch #001')
    const first = batchJourneyGraph('1101', 'Batch #001').incoming[0]!
    expect(w.find('.bjd-tx').exists()).toBe(false)
    await w.find('.bjd-col--in .bjd-node-head').trigger('click')
    expect(w.findAll('.bjd-col--in .bjd-tx')).toHaveLength(first.count)
    expect(w.find('.bjd-col--in .bjd-tx').text()).toContain(first.transactions[0]!.number)
  })

  it('opens a source batch from the Work order node, keeping the breadcrumb chain', async () => {
    const w = await mountPage('1101::Batch #001')
    const source = relatedBatches('1101', 'Batch #001').sources[0]!
    await w.find('.bjd-col--in .bjd-batch').trigger('click')
    expect(push).toHaveBeenCalledWith({
      path: `/inventory-report/batch-traceability/${source.sku}/${encodeURIComponent(source.batchNo)}`,
      query: { trail: '1101::Batch #001' },
    })
  })
})

describe('Batch traceability detail — access (story 1)', () => {
  it('shows a no-access page instead of the batch for a viewer without the role', async () => {
    const w = await mountPage('1001::Batch #001')
    expect(w.find('.btd-no-access').exists()).toBe(false)
    const fab = w.findAllComponents({ name: 'ScenarioFab' })[0]!
    fab.vm.$emit('update:modelValue', 'no-access')
    await flushPromises()
    expect(w.find('.btd-no-access').exists()).toBe(true)
    expect(w.text()).toContain("You don't have access to this report")
    expect(w.find('.btd-section-title').exists()).toBe(false)
    expect(vueErrors).toEqual([])
  })
})
