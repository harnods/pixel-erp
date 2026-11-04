// @vitest-environment happy-dom
/**
 * VAT reconciliation workspace — design-review P0 + P1 fixes.
 *
 *  P0  A match whose two sides differ needs a reason; it is never one click.
 *  P1  Manual matches are saved and drive every count; Unmatch reverts them.
 *  P1  The expand shows Activity built from real records.
 *  P1  The list pages (50 by default) instead of rendering every pair.
 *  P1  Drafts can be selected and submitted to DJP in bulk.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, computed, reactive, watch, onMounted, onUnmounted, nextTick, inject } from 'vue'
import {
  pairsForPeriod, candidatesFor, confirmManualMatch, undoManualMatch, manualMatchOf,
  pairActivity, footerCounts, reconTotals, OUTPUT_NOT_IN_CORETAX_LINKS, erpFakturOf,
} from '~/data/vatReconciliation'
import { addTaxDocument, removeTaxDocument, getTaxDocument } from '~/data/taxDocuments'

const route = { query: { masa: '2027-03', tab: 'All faktur' } as Record<string, string> }
vi.stubGlobal('useRoute', () => route)
vi.stubGlobal('useRouter', () => ({ push: vi.fn(), replace: vi.fn() }))
vi.stubGlobal('useLocale', () => ({ t: (s: string) => s }))
vi.stubGlobal('useNavigation', () => ({ currentPageKey: ref('Faktur keluaran') }))
vi.stubGlobal('useTaxSubmissionPermission', () => ({ canSubmitTaxDocument: ref(true), setCanSubmitTaxDocument: vi.fn() }))
for (const [k, v] of Object.entries({ ref, computed, reactive, watch, onMounted, onUnmounted, nextTick, inject })) vi.stubGlobal(k, v)
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const PERIOD = '2027-03'
const rowFor = (invoiceId: string) =>
  pairsForPeriod(PERIOD, 'output').find(p => p.erp?.salesInvoiceId === invoiceId)!
const ROW = OUTPUT_NOT_IN_CORETAX_LINKS[PERIOD]![0]! // SI103 — no tax document

afterEach(() => { for (const p of pairsForPeriod(PERIOD, 'output')) undoManualMatch(p.id) })

async function mountWorkspace() {
  route.query = { masa: PERIOD, tab: 'All faktur' }
  const { default: Page } = await import('~/components/pages/VatReconciliationWorkspacePage.vue')
  const w = mount(Page, { attachTo: document.body, global: { stubs: { NuxtLink: { template: '<a><slot /></a>' } } } })
  await flushPromises()
  return w
}
const itemFor = (w: Awaited<ReturnType<typeof mountWorkspace>>, ref: string) =>
  w.findAll('.vr-item').find(i => i.find('.vr-erp').text().includes(ref))!

describe('P0 — a match with a difference needs a reason', () => {
  it('difference 0 saves without a reason', () => {
    const pair = rowFor(ROW)
    const exact = candidatesFor(pair)[0]!
    expect(confirmManualMatch({ pair, periodId: PERIOD, side: 'output', candidate: exact })).toBe(true)
    expect(manualMatchOf(pair.id)?.difference).toBe(0)
  })

  it('a difference without a reason is refused — even straight from the data layer', () => {
    const pair = rowFor(ROW)
    const off = candidatesFor(pair)[1]! // +Rp500.000
    expect(confirmManualMatch({ pair, periodId: PERIOD, side: 'output', candidate: off })).toBe(false)
    expect(confirmManualMatch({ pair, periodId: PERIOD, side: 'output', candidate: off, reason: '   ' })).toBe(false)
    expect(manualMatchOf(pair.id)).toBeUndefined()
    expect(confirmManualMatch({ pair, periodId: PERIOD, side: 'output', candidate: off, reason: 'Freight billed on the faktur' })).toBe(true)
    expect(manualMatchOf(pair.id)).toMatchObject({ difference: -500_000, reason: 'Freight billed on the faktur' })
  })

  it('in the UI, ✓ with a differing pick opens the modal; an empty reason errors inline', async () => {
    const w = await mountWorkspace()
    const ref = rowFor(ROW).erp!.ref
    const item = itemFor(w, ref)
    await item.find('.vr-erp').trigger('click')
    const radios = item.findAll('.vr-cand input')
    await radios[1]!.setValue(true)
    await radios[1]!.trigger('change')
    await item.find('.vr-confirm').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('Confirm match with a difference?')
    expect(manualMatchOf(rowFor(ROW).id)).toBeUndefined()
    // The modal's primary is the last "Confirm match" button in the document.
    const confirm = [...document.body.querySelectorAll('button')].filter(b => b.textContent?.trim() === 'Confirm match').at(-1)!
    confirm.click()
    await flushPromises()
    expect(document.body.textContent).toContain('Enter why this pair matches despite the difference.')
    expect(manualMatchOf(rowFor(ROW).id)).toBeUndefined()
    w.unmount()
  })
})

describe('P1 — saved manual matches drive every count', () => {
  it('the pair becomes Reconciled (manual), totals move, Unmatch reverts', () => {
    const before = pairsForPeriod(PERIOD, 'output')
    const djpBefore = reconTotals(before, 'djp').total
    const pair = rowFor(ROW)
    const exact = candidatesFor(pair)[0]!
    confirmManualMatch({ pair, periodId: PERIOD, side: 'output', candidate: exact })

    const after = rowFor(ROW)
    expect(after.match).toBe('matched')
    expect(after.matchedBy).toBe('manual')
    expect(after.djp?.ref).toBe(exact.ref)
    expect(reconTotals(pairsForPeriod(PERIOD, 'output'), 'djp').total).toBe(djpBefore + exact.total)
    expect(footerCounts(pairsForPeriod(PERIOD, 'output')).matched).toBe(footerCounts(before).matched + 1)

    expect(undoManualMatch(pair.id)).toBe(true)
    expect(rowFor(ROW).match).toBe('not-in-coretax')
  })

  it('Activity records the match with its difference and reason', () => {
    const pair = rowFor(ROW)
    const off = candidatesFor(pair)[1]!
    confirmManualMatch({ pair, periodId: PERIOD, side: 'output', candidate: off, reason: 'Freight' })
    const a = pairActivity(rowFor(ROW), PERIOD)
    expect(a[0]!.label).toBe('Matched manually with a difference')
    expect(a[0]!.detail).toContain(off.ref)
    expect(a[0]!.detail).toContain('Freight')
    expect(a.some(e => e.label === 'Synced from Coretax')).toBe(true)
  })

  it('a row with a tax document shows it in Activity', () => {
    const draftRow = rowFor('SI061')
    if (erpFakturOf(draftRow)?.doc) {
      expect(pairActivity(draftRow, PERIOD).some(e => e.label === 'Tax document')).toBe(true)
    }
  })
})

describe('P1 — the expand renders Activity', () => {
  it('shows up to 3 entries', async () => {
    const w = await mountWorkspace()
    const item = itemFor(w, rowFor(ROW).erp!.ref)
    await item.find('.vr-erp').trigger('click')
    expect(item.find('.vr-activity').exists()).toBe(true)
    expect(item.findAll('.vr-activity-row').length).toBeGreaterThan(0)
    expect(item.findAll('.vr-activity-row').length).toBeLessThanOrEqual(3)
    w.unmount()
  })
})

describe('P1 — pagination', () => {
  it('renders one page of rows and resets to page 1 on search', async () => {
    route.query = { masa: '2027-02', tab: 'All faktur' }
    const { default: Page } = await import('~/components/pages/VatReconciliationWorkspacePage.vue')
    const { default: ErpPagination } = await import('~/components/patterns/ErpPagination.vue')
    const w = mount(Page, { global: { stubs: { NuxtLink: { template: '<a><slot /></a>' } } } })
    await flushPromises()
    const total = pairsForPeriod('2027-02', 'output').length
    expect(total).toBeGreaterThan(10)
    expect(w.findAll('.vr-item').length).toBe(total) // fits the default 50

    const pg = w.findComponent(ErpPagination)
    pg.vm.$emit('perPageChange', 10)
    await flushPromises()
    expect(w.findAll('.vr-item').length).toBe(10)

    pg.vm.$emit('pageChange', 2)
    await flushPromises()
    expect(w.findAll('.vr-item').length).toBe(total - 10)

    await w.find('.filter-search-input').setValue('4')
    await flushPromises()
    expect(w.findComponent(ErpPagination).props('currentPage')).toBe(1)
    w.unmount()
  })
})

describe('P1 — bulk submit drafts', () => {
  it('selecting drafts shows the bar; submit moves them to awaiting approval', async () => {
    const extra = addTaxDocument({
      salesInvoiceId: 'SI103', date: '01/03/2027', documentType: 'Output tax invoice',
      lane: 'domestic', djpCode: '01', docKind: 'FK', status: 'draft',
    })
    const seeded = getTaxDocument('taxdoc-seed-si061-draft')
    const seededWasDraft = seeded?.status === 'draft'
    try {
      const w = await mountWorkspace()
      expect(w.find('.vr-bulk').exists()).toBe(true)
      // ErpTablePage bulk-bar anatomy (UI review 2026-11-04): select-all checkbox,
      // then "Submit to DJP" from the secondary-sm Actions dropdown.
      await w.find('.vr-bulk input[type="checkbox"]').setValue(true)
      expect(w.find('.vr-bulk-count').text()).toMatch(/^\d+ drafts selected$/)
      await w.findAll('.vr-bulk button').find(b => b.text() === 'Actions')!.trigger('click')
      await flushPromises()
      // The menu portals to <body>; skip the per-row "Submit to DJP" buttons and
      // click the list item itself (same lookup as the receipts bulk-menu spec).
      const leaf = [...document.body.querySelectorAll('*')].find(el =>
        el.children.length === 0 && el.textContent?.trim() === 'Submit to DJP' && !el.closest('.vr-item, .vr-bulk'))!
      const item = (leaf.closest('li, [role="menuitem"], [role="option"]') ?? leaf) as HTMLElement
      item.click()
      await flushPromises()
      const confirm = [...document.body.querySelectorAll('button')].filter(b => b.textContent?.trim() === 'Submit to DJP').at(-1)!
      confirm.click()
      await flushPromises()
      expect(getTaxDocument(extra.id)?.status).toBe('awaiting-approval')
      if (seededWasDraft) expect(getTaxDocument('taxdoc-seed-si061-draft')?.status).toBe('awaiting-approval')
      w.unmount()
    } finally {
      removeTaxDocument(extra.id)
    }
  })
})
