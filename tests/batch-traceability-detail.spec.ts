// @vitest-environment happy-dom
/**
 * Batch traceability detail page (PRD stories 7, 8, 10; plan Phase 3).
 *
 * Mounts the page for a real seeded batch and checks what the report promises:
 * the four sections in order, the Received − Issued = On hand line, the journey
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
  it('renders the four sections in order with no runtime errors', async () => {
    const w = await mountPage('1001::Batch #001')
    expect(w.findAll('.btd-section-title').map((h) => h.text())).toEqual([
      'Batch information', 'Stock position', 'Batch journey', 'Related batch',
    ])
    expect(vueErrors).toEqual([])
  })

  it('reconciles Total received − Total issued with on hand', async () => {
    const w = await mountPage('1001::Batch #001')
    const position = batchStockPosition('1001', 'Batch #001')!
    const line = w.find('.btd-reconcile').text().replace(/\s+/g, ' ')
    expect(line).toContain(`Total received ${position.received} Sack`)
    expect(line).toContain(`Total issued ${position.issued} Sack`)
    expect(w.find('.btd-mismatch').exists()).toBe(false)
  })

  it('lists every journey line and expands one to its recorded values', async () => {
    const w = await mountPage('1001::Batch #001')
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
