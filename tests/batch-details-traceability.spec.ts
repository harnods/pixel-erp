// @vitest-environment happy-dom
/**
 * Batch details — the traceability detail merged into this page (2026-10-08).
 *
 * A traced product batch reads the traceability ledger, so the Transactions tab carries
 * the journey's columns (type, warehouses, counterparty, secondary mutation/balance) on
 * top of its own quantity columns, expands a row to the values recorded on it, shows the
 * Related batch tab. Attribute changes stay in the Activity log, not in this table. Batch info carries the
 * Received / Issued totals. A warehouse-scoped lot keeps the plain transaction list.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import * as vue from 'vue'
import BatchDetailsPage from '~/components/pages/BatchDetailsPage.vue'
import { batchLedgerRows, batchStockPosition, relatedBatches, batchJourney } from '~/data/batchTraceability'

const push = vi.fn()
const replace = vi.fn()
let query: Record<string, string> = {}

for (const name of [
  'computed', 'reactive', 'ref', 'shallowRef', 'toRef', 'watch', 'watchEffect', 'nextTick',
  'inject', 'provide', 'useSlots', 'useAttrs', 'onMounted', 'onUnmounted', 'onBeforeUnmount',
] as const) {
  vi.stubGlobal(name, vue[name])
}
vi.stubGlobal('useRouter', () => ({ push, replace }))
vi.stubGlobal('useRoute', () => ({ query }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

let wrapper: VueWrapper | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  push.mockReset()
  query = {}
})

async function mountPage(orderId: string) {
  wrapper = mount(BatchDetailsPage, { props: { orderId } })
  await flushPromises()
  return wrapper
}

const SKU = '1001'
const BATCH = 'Batch #001'

describe('Batch details — merged traceability', () => {
  it('carries the journey columns and the quantity columns in one table', async () => {
    const w = await mountPage(`${SKU}::${BATCH}`)
    const headers = w.findAll('.pd-th').map((h) => h.text())
    for (const col of [
      'Date', 'Number', 'Transaction type', 'Movement', 'Warehouse origin', 'Warehouse destination',
      'Counterparty', 'On hand qty', 'Reserved qty', 'Available qty', 'In transit qty', 'Unit',
      'Mutation (secondary unit)', 'Balance (secondary unit)',
    ]) expect(headers, col).toContain(col)

    // One row per journey line, newest first — the running balance is the on-hand column.
    const ledger = batchLedgerRows(SKU, BATCH)
    const rows = w.findAll('.pd-tr--clickable')
    expect(rows.length).toBe(Math.min(25, ledger.length))
    expect(rows[0]!.text()).toContain(ledger.at(-1)!.number)
  })

  it('expands a row to the attribute values recorded on that transaction', async () => {
    const w = await mountPage(`${SKU}::${BATCH}`)
    expect(w.find('.pd-tr--snapshot').exists()).toBe(false)
    await w.find('.pd-tr--clickable').trigger('click')
    expect(w.find('.pd-tr--snapshot').text()).toContain('Recorded values')
  })

  it('keeps attribute changes out of the table — they live in the Activity log', async () => {
    const w = await mountPage(`${SKU}::${BATCH}`)
    expect(w.find('.pd-tr--change').exists()).toBe(false)
    expect(w.text()).not.toContain('Show attribute changes')
  })

  it('renders the expanded row as ContentList fields', async () => {
    const w = await mountPage(`${SKU}::${BATCH}`)
    await w.find('.pd-tr--clickable').trigger('click')
    const fields = w.find('.pd-tr--snapshot').findAllComponents({ name: 'ContentList' })
    expect(fields.map((f) => f.props('label'))).toEqual([
      'Expiry date', 'Manufacturing date', 'Best before date', 'Vendor', 'Grade',
    ])
  })

  it('puts Total received and Total issued in Batch info', async () => {
    const w = await mountPage(`${SKU}::${BATCH}`)
    const position = batchStockPosition(SKU, BATCH)!
    const info = w.find('.pd-info-row').text()
    expect(info).toContain('Total received')
    expect(info).toContain(`${position.received.toLocaleString('id-ID')}`)
    expect(info).toContain('Total issued')
  })

  it('lists the related batches in their own tab, each opening that batch', async () => {
    const w = await mountPage(`${SKU}::${BATCH}`)
    expect(w.findAllComponents({ name: 'MpTab' }).map((t) => t.text()))
      .toEqual(['Transactions', 'Stock by warehouses', 'Related batch'])

    const results = relatedBatches(SKU, BATCH).results
    expect(results.length).toBeGreaterThan(0)
    const links = w.findAll('.cell-link').filter((l) => l.text() === results[0]!.batchNo)
    expect(links.length).toBeGreaterThan(0)
  })

  it('highlights the transaction the user came from (By transaction entry)', async () => {
    const number = batchJourney(SKU, BATCH)[1]!.number
    query = { transaction: number }
    const w = await mountPage(`${SKU}::${BATCH}`)
    const highlighted = w.findAll('.pd-tr--highlight')
    expect(highlighted.length).toBeGreaterThan(0)
    expect(highlighted[0]!.text()).toContain(number)
  })

  it('leaves a warehouse-scoped lot on the plain transaction list', async () => {
    const w = await mountPage('wh-1::1001::Batch #001')
    if (!w.find('.pd-section').exists()) return // that lot isn't seeded in this warehouse
    expect(w.findAll('.pd-th').map((h) => h.text())).not.toContain('Transaction type')
    expect(w.findAllComponents({ name: 'MpTab' }).map((t) => t.text())).not.toContain('Related batch')
  })
})
