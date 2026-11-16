// @vitest-environment happy-dom
/**
 * VAT reconciliation workspace — design-review P0 + P1 fixes.
 *
 *  P0  A match whose two sides differ is confirmed in a modal; it is never one click.
 *      (No free-text reason since VR-6 — reasons are Remarks, US-013.)
 *  P1  Manual matches are saved and drive every count; Unmatch reverts them.
 *  P1  The detail drawer opens the shared Activity log, built from real records.
 *  P1  To match pages (50 by default) instead of rendering every pair.
 *  —   Candidates are records that exist in the masa; a match consumes its counterpart.
 *  P1  Drafts can be selected and submitted to DJP in bulk.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, computed, reactive, watch, onMounted, onUnmounted, nextTick, inject, watchEffect, useSlots } from 'vue'
import { useTableState } from '~/composables/useTableState'
import {
  pairsForPeriod, candidatesFor, confirmManualMatch, undoManualMatch, manualMatchOf,
  pairActivity, footerCounts, reconTotals, erpFakturOf,
} from '~/data/vatReconciliation'
import { addTaxDocument, removeTaxDocument, getTaxDocument } from '~/data/taxDocuments'

const route = { query: { masa: '2027-02', tab: 'To match' } as Record<string, string> }
vi.stubGlobal('useRoute', () => route)
vi.stubGlobal('useRouter', () => ({ push: vi.fn(), replace: vi.fn() }))
vi.stubGlobal('useLocale', () => ({ t: (s: string) => s }))
vi.stubGlobal('useNavigation', () => ({ currentPageKey: ref('Faktur keluaran') }))
vi.stubGlobal('useTaxSubmissionPermission', () => ({ canSubmitTaxDocument: ref(true), setCanSubmitTaxDocument: vi.fn() }))
for (const [k, v] of Object.entries({ ref, computed, reactive, watch, onMounted, onUnmounted, nextTick, inject, watchEffect, useSlots, useTableState })) vi.stubGlobal(k, v)
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

// 02/2027 carries real candidates: invoice 40122 (SI122, Tax document not found) has
// an exact Coretax-only faktur (o-17) and a near miss Rp500.000 higher (o-18).
const PERIOD = '2027-02'
const ROW = 'SI122'
const rowFor = (invoiceId: string, period = PERIOD) =>
  pairsForPeriod(period, 'output').find(p => p.erp?.salesInvoiceId === invoiceId)!

afterEach(() => { for (const per of ['2027-02', '2027-03']) for (const p of pairsForPeriod(per, 'output')) undoManualMatch(p.id) })

async function mountWorkspace(masa = PERIOD, tab = 'To match') {
  route.query = { masa, tab }
  const { default: Page } = await import('~/components/pages/VatReconciliationWorkspacePage.vue')
  const w = mount(Page, { attachTo: document.body, global: { stubs: { NuxtLink: { template: '<a><slot /></a>' } } } })
  await flushPromises()
  return w
}
type W = Awaited<ReturnType<typeof mountWorkspace>>
/** A To match row by its pair id (o-07 = invoice 40122's own row). */
const itemFor = (w: W, pairId: string) => w.find(`.vr-item[data-pair-id="${pairId}"]`)
const bodyButtons = (label: string) =>
  [...document.body.querySelectorAll('button')].filter(b => b.textContent?.trim() === label)
/** Expand the row, then "Find another tax document" opens the shared detail drawer. */
async function openDrawer(w: W, pairId: string) {
  await itemFor(w, pairId).find('.vr-line').trigger('click')
  await itemFor(w, pairId).findAll('button').find(b => b.text() === 'Find another tax document')!.trigger('click')
  await flushPromises()
}

describe('candidates are real records only', () => {
  it('offers the exact faktur first, then the near miss — both exist in the masa', () => {
    const c = candidatesFor(rowFor(ROW))
    expect(c.map(x => x.pairId)).toEqual(['o-17', 'o-18'])
    expect(c[0]!.total).toBe(rowFor(ROW).erp!.total)
    expect(c[1]!.total - rowFor(ROW).erp!.total).toBe(500_000)
  })

  // 03/2027 now carries Approved tax documents with no transaction (the Airene
  // seeds, US-014), so its candidates are those — still only records that exist.
  it('a candidate is always an open, Approved tax document in the same masa', () => {
    const all = pairsForPeriod('2027-03', 'output')
    for (const p of all.filter(x => x.match === 'not-in-coretax')) {
      for (const c of candidatesFor(p)) {
        const other = all.find(x => x.id === c.pairId)!
        expect(other.match).toBe('no-match-in-erp')
        expect(other.djp?.approved).toBe(true)
      }
    }
  })
})

describe('P0 — a match with a difference is confirmed, never one click (no free-text reason, VR-6)', () => {
  it('difference 0 saves straight away', () => {
    const pair = rowFor(ROW)
    const exact = candidatesFor(pair)[0]!
    expect(confirmManualMatch({ pair, periodId: PERIOD, side: 'output', candidate: exact })).toBe(true)
    expect(manualMatchOf(pair.id)?.difference).toBe(0)
  })

  it('a difference saves without a reason — the BE stores none on a manual match', () => {
    const pair = rowFor(ROW)
    const off = candidatesFor(pair)[1]! // +Rp500.000
    expect(confirmManualMatch({ pair, periodId: PERIOD, side: 'output', candidate: off })).toBe(true)
    expect(manualMatchOf(pair.id)).toMatchObject({ difference: -500_000 })
    expect(manualMatchOf(pair.id)?.reason).toBeUndefined()
  })

  it('in the UI, Match this on a differing candidate opens the modal with no reason field; Confirm saves', async () => {
    const w = await mountWorkspace()
    await openDrawer(w, rowFor(ROW).id)
    bodyButtons('Match this')[1]!.click() // +Rp500.000
    await flushPromises()
    expect(document.body.textContent).toContain('Confirm match with a difference?')
    expect(document.body.querySelector('#vmc-reason')).toBeNull()
    expect(manualMatchOf(rowFor(ROW).id)).toBeUndefined()
    const confirm = [...document.body.querySelectorAll('button')].filter(b => b.textContent?.trim() === 'Confirm match').at(-1)!
    confirm.click()
    await flushPromises()
    expect(manualMatchOf(rowFor(ROW).id)).toMatchObject({ difference: -500_000 })
    w.unmount()
  })
})

describe('P1 — saved manual matches drive every count', () => {
  it('the pair becomes Reconciled (manual), its counterpart row is consumed, Unmatch reverts', () => {
    const before = pairsForPeriod(PERIOD, 'output')
    const pair = rowFor(ROW)
    const exact = candidatesFor(pair)[0]!
    confirmManualMatch({ pair, periodId: PERIOD, side: 'output', candidate: exact })

    const after = pairsForPeriod(PERIOD, 'output')
    expect(rowFor(ROW).match).toBe('matched')
    expect(rowFor(ROW).matchedBy).toBe('manual')
    expect(rowFor(ROW).djp?.ref).toBe(exact.ref)
    // One pair now, not two: the Coretax-only row is gone and nothing is counted twice.
    expect(after.some(p => p.id === exact.pairId)).toBe(false)
    expect(after.length).toBe(before.length - 1)
    expect(reconTotals(after, 'djp').total).toBe(reconTotals(before, 'djp').total)
    expect(footerCounts(after).matched).toBe(footerCounts(before).matched + 1)

    expect(undoManualMatch(pair.id)).toBe(true)
    expect(rowFor(ROW).match).toBe('not-in-coretax')
    expect(pairsForPeriod(PERIOD, 'output').some(p => p.id === exact.pairId)).toBe(true)
  })

  it('Activity records the match with its difference', () => {
    const pair = rowFor(ROW)
    const off = candidatesFor(pair)[1]!
    confirmManualMatch({ pair, periodId: PERIOD, side: 'output', candidate: off })
    const a = pairActivity(rowFor(ROW), PERIOD)
    expect(a[0]!.label).toBe('Matched manually with a difference')
    expect(a[0]!.detail).toContain(off.ref)
    expect(a[0]!.detail).toContain('500.000')
    expect(a.some(e => e.label === 'Tax documents synced')).toBe(true)
  })

  it('a row with a tax document shows it in Activity', () => {
    const draftRow = rowFor('SI061', '2027-03')
    if (erpFakturOf(draftRow)?.doc) {
      expect(pairActivity(draftRow, '2027-03').some(e => e.label === 'Tax document')).toBe(true)
    }
  })
})

describe('P1 — the detail opens the shared Activity log', () => {
  it('a "Last updated by" link opens ActivityLogModal with the pair\'s entries', async () => {
    const w = await mountWorkspace()
    await openDrawer(w, rowFor(ROW).id)
    const link = document.body.querySelector('a.detail-updated') as HTMLElement
    expect(link.textContent).toContain('Last updated by')
    link.click()
    await flushPromises()
    expect(document.body.textContent).toContain('Activity log')
    expect(document.body.textContent).toContain('Flagged for review by matching engine')
    w.unmount()
  })
})

describe('P1 — pagination (To match)', () => {
  it('renders one page of rows and resets to page 1 on search', async () => {
    const { default: ErpPagination } = await import('~/components/patterns/ErpPagination.vue')
    const w = await mountWorkspace('2027-03')
    const total = w.findAll('.vr-item').length
    expect(total).toBeGreaterThan(5)

    w.findComponent(ErpPagination).vm.$emit('perPageChange', 5)
    await flushPromises()
    expect(w.findAll('.vr-item').length).toBe(5)

    w.findComponent(ErpPagination).vm.$emit('pageChange', 2)
    await flushPromises()
    expect(w.findAll('.vr-item').length).toBe(Math.min(5, total - 5))

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
      const w = await mountWorkspace('2027-03')
      // ErpTablePage bulk-bar anatomy: select-all, then Submit to DJP from Actions.
      await w.find('.vr-bulk input[type="checkbox"]').setValue(true)
      await flushPromises()
      expect(w.find('.vr-bulk').text()).toMatch(/\d+ drafts? selected/)
      await w.find('.vr-bulk').findAll('button').find(b => b.text() === 'Actions')!.trigger('click')
      await flushPromises()
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
