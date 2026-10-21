// @vitest-environment happy-dom
/**
 * Sales invoices index — the Tax document status / DJP status columns.
 *
 * rule/efaktur-status-axes. Both columns start hidden (column settings) and both
 * disappear entirely when no invoice on the table has a tax document, so what is
 * pinned here is the DERIVED row value and the option lists the All-filters
 * drawer is fed — the parts a refactor can silently get wrong.
 *
 * Driven by taxDocuments.ts' seed: SI150 (a superseded Normal + its Pengganti),
 * SI149 (a cancelled Normal + a fresh re-issue), SI133 (rejected by DJP).
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { useTableState } from '~/composables/useTableState'

beforeAll(() => {
  Object.assign(globalThis, {
    useTableState,
    useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, resolve: (t: unknown) => ({ href: String(t) }) }),
    useRoute: () => ({ path: '/sales-invoices', params: {}, query: {}, hash: '' }),
    useHead: () => {},
    definePageMeta: () => {},
    navigateTo: () => {},
    useState: (_k: string, f: () => unknown) => ref(f?.()),
  })
})

type Opt = { value: string; label: string }
type Row = { id: string; hasTaxDocument: boolean; taxDocStatus: string; djpStatus: string }

async function mountIndex() {
  const Page = (await import('~/components/pages/SalesInvoicesPage.vue')).default
  const w = mount(Page, { global: { stubs: { Teleport: true } } })
  return w.vm as unknown as { taxDocStatusOptions: Opt[]; djpStatusOptions: Opt[]; rows: Row[] }
}

describe('Sales invoices index — tax status columns', () => {
  it('feeds the drawer a DJP list of approval states only', async () => {
    const { djpStatusOptions } = await mountIndex()
    expect(djpStatusOptions).toEqual([
      { value: 'draft', label: 'Draft' },
      { value: 'awaiting-approval', label: 'Processing at DJP' },
      { value: 'approved', label: 'Approved by DJP' },
      { value: 'rejected', label: 'Rejected by DJP' },
      { value: 'awaiting-from-buyer', label: 'Awaiting from buyer' },
    ])
  })

  it('feeds the drawer a tax document list of faktur states only', async () => {
    const { taxDocStatusOptions } = await mountIndex()
    expect(taxDocStatusOptions.map(o => o.value)).toEqual(
      ['normal', 'replacement', 'cancellation', 'replaced', 'cancelled', 'return-note'],
    )
  })

  it('reports both axes per row — a cancelled faktur is still Approved by DJP', async () => {
    const { rows } = await mountIndex()
    const si149 = rows.find(r => r.id === 'SI149')!
    // SI149's lineage ends in a fresh approved Normal re-issue, which is what
    // currentTaxDocument elects (the cancelled one is history).
    expect(si149.hasTaxDocument).toBe(true)
    expect(si149.taxDocStatus).toBe('normal')
    expect(si149.djpStatus).toBe('approved')

    const si133 = rows.find(r => r.id === 'SI133')!
    expect(si133.taxDocStatus).toBe('normal')
    expect(si133.djpStatus).toBe('rejected')

    // An invoice with no tax document reports the sentinel on both axes, which
    // the cells render as an em dash.
    const none = rows.find(r => !r.hasTaxDocument)!
    expect(none.taxDocStatus).toBe('not-generated')
    expect(none.djpStatus).toBe('not-generated')
  })
})
