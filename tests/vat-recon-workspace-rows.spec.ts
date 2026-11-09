// @vitest-environment happy-dom
/**
 * VAT reconciliation workspace — Jurnal bank Reconciliations layout.
 *
 * To match = bank-style rows (one per open pair; a Coretax-only row that is an
 * invoice's suggestion folds into it), solid / dashed ✓ ring, ⋮ menus per side
 * carrying the tax-document actions, only drafts selectable. Not reconciled and
 * Matched are ErpTablePage tables; Matched shows Method (Auto / Manual).
 * groupPairsByDate / candidatesFor stay covered as data helpers.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, computed, reactive, watch, onMounted, onUnmounted, nextTick, inject, watchEffect, useSlots } from 'vue'
import { useTableState } from '~/composables/useTableState'

// These rows exercise the NPWP/amount heuristic ("Match found", folding, solid ✓),
// which is what the workspace does with Airene off; Airene has its own specs.
vi.mock('~/data/vatReconFlags', () => ({ VAT_IN_ENABLED: false, AIRENE_SUGGEST_ENABLED: false }))
import {
  groupPairsByDate, pairsForPeriod, reconDateValue, candidatesFor, outputPairs, workspaceTabRows,
} from '~/data/vatReconciliation'

const route = { query: { masa: '2027-03', tab: 'To match' } as Record<string, string> }
vi.stubGlobal('useRoute', () => route)
vi.stubGlobal('useRouter', () => ({ push: vi.fn(), replace: vi.fn() }))
vi.stubGlobal('useLocale', () => ({ t: (s: string) => s }))
vi.stubGlobal('useNavigation', () => ({ currentPageKey: ref('Faktur keluaran') }))
vi.stubGlobal('useTaxSubmissionPermission', () => ({ canSubmitTaxDocument: ref(true), setCanSubmitTaxDocument: vi.fn() }))
vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('watch', watch)
vi.stubGlobal('onMounted', onMounted)
vi.stubGlobal('onUnmounted', onUnmounted)
vi.stubGlobal('nextTick', nextTick)
vi.stubGlobal('inject', inject)
vi.stubGlobal('watchEffect', watchEffect)
vi.stubGlobal('useSlots', useSlots)
vi.stubGlobal('useTableState', useTableState)
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

async function mountWorkspace(masa: string, tab = 'To match') {
  route.query = { masa, tab }
  const { default: Page } = await import('~/components/pages/VatReconciliationWorkspacePage.vue')
  const wrapper = mount(Page, { attachTo: document.body, global: { stubs: { NuxtLink: { template: '<a><slot /></a>' } } } })
  await flushPromises()
  return wrapper
}

type W = Awaited<ReturnType<typeof mountWorkspace>>
/** A To match row by the invoice number on its ERP side. */
const itemFor = (w: W, ref: string) => w.findAll('.vr-item').find(i => i.find('.vr-erp').text().includes(ref))!

describe('groupPairsByDate', () => {
  it('groups by row date, newest first, every pair exactly once', () => {
    const pairs = pairsForPeriod('2027-02', 'output')
    const groups = groupPairsByDate(pairs)
    const keys = groups.map(g => Number(g.key))
    expect(keys).toEqual([...keys].sort((a, b) => b - a))
    expect(groups.flatMap(g => g.pairs).length).toBe(pairs.length)
    for (const g of groups) {
      for (const p of g.pairs) expect(String(reconDateValue(p.erp?.date ?? p.djp!.date))).toBe(g.key)
    }
  })

  it('candidates are about the row: the first one totals exactly the row', () => {
    const open = outputPairs.find(p => p.match === 'not-in-coretax')!
    expect(candidatesFor(open)[0]!.total).toBe(open.erp!.total)
    expect(candidatesFor(outputPairs.find(p => p.match === 'matched')!)).toEqual([])
  })
})

describe('VatReconciliationWorkspacePage — To match', () => {
  it('lists one row per open pair; a Coretax-only suggestion folds into its invoice', async () => {
    const w = await mountWorkspace('2027-03')
    expect(w.findAll('.vr-item').length).toBe(workspaceTabRows(pairsForPeriod('2027-03', 'output'), 'To match').length)
    w.unmount()
    const feb = await mountWorkspace('2027-02')
    const ids = feb.findAll('.vr-item').map(i => i.attributes('data-pair-id'))
    expect(ids).toContain('o-07')       // invoice 40122, suggesting faktur o-17
    expect(ids).not.toContain('o-17')   // …so o-17 is not listed again
    feb.unmount()
  })

  it('✓ ring is solid when there is a match to confirm, dashed when there is none', async () => {
    const w = await mountWorkspace('2027-02')
    const ring = (id: string) => w.find(`.vr-item[data-pair-id="${id}"] .vr-confirm`)
    expect(ring('o-07').classes()).not.toContain('is-dashed') // Match found
    expect(ring('o-09').classes()).toContain('is-dashed')     // No match found
    w.unmount()
  })

  it('only a draft tax document row is selectable', async () => {
    const w = await mountWorkspace('2027-03')
    expect(itemFor(w, '40061').find('.vr-draft-check').exists()).toBe(true)
    expect(itemFor(w, '40103').find('.vr-draft-check').exists()).toBe(false)
    w.unmount()
  })

  it('the invoice side ⋮ menu offers Edit + Submit tax document for a draft', async () => {
    const w = await mountWorkspace('2027-03')
    await itemFor(w, '40061').find('.vr-line').trigger('click')
    await itemFor(w, '40061').find('.vr-detail button[aria-label="More actions"]').trigger('click')
    await flushPromises()
    const items = [...document.body.querySelectorAll('*')].filter(el => el.children.length === 0).map(el => el.textContent?.trim())
    expect(items).toContain('Edit tax document')
    expect(items).toContain('Submit tax document')
    w.unmount()
  })

  it('Find another tax document opens the shared detail drawer with the real candidates', async () => {
    const w = await mountWorkspace('2027-02')
    const row = () => w.find('.vr-item[data-pair-id="o-07"]')
    await row().find('.vr-line').trigger('click')
    await row().findAll('button').find(b => b.text() === 'Find another tax document')!.trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('Other match candidates')
    expect(document.body.textContent).toContain('Match this')
    w.unmount()
  })
})

describe('VatReconciliationWorkspacePage — tables', () => {
  it('Not reconciled lists the root-cause pairs as table rows', async () => {
    const w = await mountWorkspace('2027-02', 'Not reconciled')
    const n = workspaceTabRows(pairsForPeriod('2027-02', 'output'), 'Not reconciled').length
    expect(w.findAll('tbody tr').filter(r => r.find('.cell-link').exists())).toHaveLength(n)
    w.unmount()
  })

  it('Matched shows Method — Auto for the engine, Manual for a person', async () => {
    const w = await mountWorkspace('2027-02', 'Matched')
    const text = w.text()
    expect(text).toContain('Auto')
    expect(text).toContain('Manual')
    w.unmount()
  })
})
