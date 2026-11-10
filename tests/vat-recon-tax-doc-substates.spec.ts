// @vitest-environment happy-dom
/**
 * VAT reconciliation — "Tax document not found" sub-states (PM, 2026-11-05).
 *
 * Status #3 splits by the transaction's OWN tax document, because the fix
 * differs. 03/2027 seeds one of each (plus a second submitted one):
 *
 *   SI103  none       Tax document not found   Find another · Create tax document
 *                     (SI013 and SI002 are 'none' too)
 *   SI061  draft      Tax document in draft     Edit · Submit tax document
 *   SI043  submitted  Awaiting DJP approval     Refresh status → approved → reconciled
 *   SI097  submitted  Awaiting DJP approval     Refresh status → still processing
 *   SI050  rejected   Tax document rejected     View tax document (only)
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, computed, reactive, watch, watchEffect, onMounted, onUnmounted, nextTick, inject, provide, useSlots } from 'vue'
import { useTableState } from '~/composables/useTableState'
import {
  pairsForPeriod, taxDocSubState, statusLabelOf, statusBadgeOf, statusReasonOf, statusBadgeTypeOf, erpFakturOf,
  TAX_DOC_SUBSTATES, TAX_DOC_SUBSTATE_META, REFRESH_SIMULATED_MS, MATCH_META, reconTotals,
} from '~/data/vatReconciliation'
import { updateTaxDocumentStatus, getTaxDocument } from '~/data/taxDocuments'

const route = { query: { masa: '2027-03', tab: 'To match' } as Record<string, string> }
vi.stubGlobal('useRoute', () => route)
vi.stubGlobal('useRouter', () => ({ push: vi.fn(), replace: vi.fn() }))
vi.stubGlobal('useLocale', () => ({ t: (s: string) => s }))
vi.stubGlobal('useNavigation', () => ({ currentPageKey: ref('Faktur keluaran') }))
vi.stubGlobal('useTaxSubmissionPermission', () => ({ canSubmitTaxDocument: ref(true), setCanSubmitTaxDocument: vi.fn() }))
for (const [k, v] of Object.entries({ ref, computed, reactive, watch, watchEffect, onMounted, onUnmounted, nextTick, inject, useSlots, useTableState })) vi.stubGlobal(k, v)
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)
const open = vi.fn()
vi.stubGlobal('open', open)

const PERIOD = '2027-03'
const rowFor = (si: string) => pairsForPeriod(PERIOD, 'output').find(p => p.erp?.salesInvoiceId === si)!

async function mountWorkspace() {
  route.query = { masa: PERIOD, tab: 'To match' }
  const { default: Page } = await import('~/components/pages/VatReconciliationWorkspacePage.vue')
  const Host = { setup() { provide('vatFinalize', ref(0)); return {} }, components: { Page }, template: '<Page />' }
  const w = mount(Host, { attachTo: document.body, global: { stubs: { NuxtLink: { template: '<a><slot /></a>' } } } })
  await flushPromises()
  return w
}
type W = Awaited<ReturnType<typeof mountWorkspace>>
const item = (w: W, si: string) => w.find(`.vr-item[data-pair-id="${rowFor(si).id}"]`)
async function expand(w: W, si: string) {
  await item(w, si).find('.vr-line').trigger('click')
  await flushPromises()
  return item(w, si)
}
/** The right (Tax document) column of an expanded row. */
const taxDocCol = (it: ReturnType<typeof item>) => it.findAll('.vr-detail-col')[1]!
const buttons = (el: { findAll: (s: string) => { text: () => string }[] }) => el.findAll('button').map(b => b.text()).filter(Boolean)

afterEach(() => {
  vi.useRealTimers()
  open.mockClear()
  updateTaxDocumentStatus('taxdoc-seed-si061-draft', 'draft')
  updateTaxDocumentStatus('taxdoc-seed-si043-submitted', 'awaiting-approval')
})

describe('derivation, labels and badges', () => {
  it('03/2027 seeds one row per sub-state, all still "not-in-coretax" in To match', () => {
    expect(taxDocSubState(rowFor('SI103'))).toBe('none')
    expect(taxDocSubState(rowFor('SI061'))).toBe('draft')
    expect(taxDocSubState(rowFor('SI043'))).toBe('submitted')
    expect(taxDocSubState(rowFor('SI097'))).toBe('submitted')
    expect(taxDocSubState(rowFor('SI050'))).toBe('rejected')
    for (const si of ['SI103', 'SI061', 'SI043', 'SI097', 'SI050']) expect(rowFor(si).match).toBe('not-in-coretax')
  })

  it('full labels, ≤ 2-word badges and reasons follow the PM table', () => {
    expect(TAX_DOC_SUBSTATES.map(s => TAX_DOC_SUBSTATE_META[s].label))
      .toEqual(['Tax document not found', 'Tax document in draft', 'Awaiting DJP approval', 'Tax document rejected'])
    expect(TAX_DOC_SUBSTATES.map(s => TAX_DOC_SUBSTATE_META[s].badge))
      .toEqual(['Not issued', 'Draft', 'Awaiting approval', 'Rejected'])
    for (const s of TAX_DOC_SUBSTATES) expect(TAX_DOC_SUBSTATE_META[s].badge.split(' ').length).toBeLessThanOrEqual(2)
    expect(MATCH_META['no-match-in-erp'].label).toBe('Not recorded')
    expect(statusLabelOf(rowFor('SI050'))).toBe('Tax document rejected')
    expect(statusBadgeOf(rowFor('SI050'))).toBe('Rejected')
    expect(statusReasonOf(rowFor('SI050'))).toBe('DJP rejected this tax document.')
    // Tone follows the fix: missing/rejected critical; draft and waiting on DJP warning
    // (waiting on DJP moved from info to warning — design review 2026-11-09).
    expect(['SI103', 'SI061', 'SI043', 'SI050'].map(si => statusBadgeTypeOf(rowFor(si))))
      .toEqual(['critical', 'warning', 'warning', 'critical'])
  })

  it('the Status filter offers each sub-state by its full label', async () => {
    const { default: ErpFilterSelect } = await import('~/components/patterns/ErpFilterSelect.vue')
    const w = await mountWorkspace()
    const labels = (w.findAllComponents(ErpFilterSelect)[0]!.props('options') as { label: string }[]).map(o => o.label)
    for (const l of ['Tax document not found (3)', 'Tax document in draft (1)', 'Awaiting DJP approval (2)', 'Tax document rejected (1)']) {
      expect(labels).toContain(l)
    }
    w.unmount()
  })
})

describe('none — Tax document not found', () => {
  it('Find another tax document + Create tax document; Create opens the invoice\'s create flow', async () => {
    const w = await mountWorkspace()
    expect(item(w, 'SI103').find('.vr-state').text()).toBe('Tax document not found')
    const it = await expand(w, 'SI103')
    const col = taxDocCol(it)
    expect(col.text()).toContain("Don't see the correct tax document?")
    expect(buttons(col)).toEqual(expect.arrayContaining(['Find another tax document', 'Create tax document']))
    expect(col.find('[data-test-id="vr-own-tax-doc"]').exists()).toBe(false)
    await col.findAll('button').find(b => b.text() === 'Create tax document')!.trigger('click')
    expect(open).toHaveBeenCalledWith('/sales-invoices/SI103?action=create-tax-document', '_blank', 'noopener')
    w.unmount()
  })
})

describe('draft — Tax document in draft', () => {
  it('shows its own tax document with Edit + Submit; Submit moves it to Awaiting DJP approval', async () => {
    const w = await mountWorkspace()
    expect(item(w, 'SI061').find('.vr-state').text()).toBe('Tax document in draft')
    const it = await expand(w, 'SI061')
    const col = taxDocCol(it)
    expect(col.find('[data-test-id="vr-own-tax-doc"]').text()).toContain('Draft')
    expect(col.text()).not.toContain('Find another tax document')
    expect(buttons(col)).toEqual(expect.arrayContaining(['Edit tax document', 'Submit tax document']))
    expect(it.text()).toContain('Submit the tax document to reconcile this transaction.')

    await col.findAll('button').find(b => b.text() === 'Edit tax document')!.trigger('click')
    expect(open).toHaveBeenCalledWith('/sales-invoices/SI061?action=edit-tax-document&taxDocument=taxdoc-seed-si061-draft', '_blank', 'noopener')

    await col.findAll('button').find(b => b.text() === 'Submit tax document')!.trigger('click')
    await flushPromises()
    ;[...document.body.querySelectorAll('button')].filter(b => b.textContent?.trim() === 'Submit tax document').at(-1)!.click()
    await flushPromises()
    expect(getTaxDocument('taxdoc-seed-si061-draft')?.status).toBe('awaiting-approval')
    expect(taxDocSubState(rowFor('SI061'))).toBe('submitted')
    expect(item(w, 'SI061').find('.vr-state').text()).toBe('Awaiting DJP approval')
    w.unmount()
  })
})

describe('submitted — Awaiting DJP approval', () => {
  it('only Refresh status; the SI043 seed is approved on refresh and the row reconciles', async () => {
    const w = await mountWorkspace()
    const djpBefore = reconTotals(pairsForPeriod(PERIOD, 'output'), 'djp').count
    const it = await expand(w, 'SI043')
    const col = taxDocCol(it)
    expect(item(w, 'SI043').find('.vr-state').text()).toBe('Awaiting DJP approval')
    expect(buttons(col.find('.vrt-actions'))).toEqual(['Refresh status'])
    expect(col.text()).not.toContain('Find another tax document')
    vi.useFakeTimers()
    await col.findAll('button').find(b => b.text() === 'Refresh status')!.trigger('click')
    vi.advanceTimersByTime(REFRESH_SIMULATED_MS + 10)
    vi.useRealTimers()
    await flushPromises()
    expect(getTaxDocument('taxdoc-seed-si043-submitted')?.status).toBe('approved')
    const after = rowFor('SI043')
    expect(after.match).toBe('matched')
    expect(after.matchedBy).toBe('auto')
    expect(reconTotals(pairsForPeriod(PERIOD, 'output'), 'djp').count).toBe(djpBefore + 1)
    expect(item(w, 'SI043').exists()).toBe(false) // left To match
    w.unmount()
  })

  it('SI097 stays processing on refresh', async () => {
    const w = await mountWorkspace()
    const col = taxDocCol(await expand(w, 'SI097'))
    vi.useFakeTimers()
    await col.findAll('button').find(b => b.text() === 'Refresh status')!.trigger('click')
    vi.advanceTimersByTime(REFRESH_SIMULATED_MS + 10)
    vi.useRealTimers()
    await flushPromises()
    expect(getTaxDocument('taxdoc-seed-si097-submitted')?.status).toBe('awaiting-approval')
    expect(taxDocSubState(rowFor('SI097'))).toBe('submitted')
    w.unmount()
  })
})

describe('rejected — Tax document rejected', () => {
  it('only View tax document (no Edit); it opens the invoice\'s tax document tab', async () => {
    const w = await mountWorkspace()
    expect(item(w, 'SI050').find('.vr-state').text()).toBe('Tax document rejected')
    const it = await expand(w, 'SI050')
    const col = taxDocCol(it)
    expect(it.text()).toContain('DJP rejected this tax document.')
    expect(it.text()).not.toContain('Edit it and submit it again')
    expect(buttons(col.find('.vrt-actions'))).toEqual(['View tax document'])
    expect(col.find('[data-test-id="vr-own-tax-doc"]').text()).toContain('Rejected by DJP')
    await col.findAll('button').find(b => b.text() === 'View tax document')!.trigger('click')
    expect(open).toHaveBeenCalledWith('/sales-invoices/SI050?tab=tax-document', '_blank', 'noopener')
    w.unmount()
  })
})

describe('drawer', () => {
  it('lists other candidates only for "none"; past it, shows the own tax document', async () => {
    const { default: Drawer } = await import('~/components/patterns/ReconciliationDetailDrawer.vue')
    const { default: ErpDrawer } = await import('~/components/patterns/ErpDrawer.vue')
    const mk = (si: string) => mount(Drawer, {
      attachTo: document.body,
      props: { isOpen: true, pair: rowFor(si), side: 'output', periodId: PERIOD },
      global: { components: { ErpDrawer }, stubs: { Teleport: true } },
    })
    const draft = mk('SI061')
    await flushPromises()
    expect(draft.text()).toContain('Tax document in draft')
    expect(draft.text()).not.toContain('Other match candidates')
    expect(draft.text()).toContain('Submit tax document')
    draft.unmount()
    const none = mk('SI103')
    await flushPromises()
    expect(none.text()).toContain('Other match candidates')
    expect(none.text()).toContain('Create tax document')
    none.unmount()
  })

  it('erpFakturOf is unchanged for rows that are not "Tax document not found"', () => {
    const matched = pairsForPeriod('2027-02', 'output').find(p => p.match === 'matched')!
    expect(erpFakturOf(matched)).toBeNull()
    expect(taxDocSubState(matched)).toBeNull()
  })
})
