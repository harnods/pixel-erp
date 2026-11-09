// @vitest-environment happy-dom
/**
 * VAT reconciliation — Airene match suggestions (US-014, PM 2026-11-06).
 *
 * 03/2027 seeds one outcome each (vatReconSuggest.ts):
 *   SI103  Tier 1 (reference with extra text) + a 1_to_n group candidate that is dropped
 *   SI013  Tier 1 + Tier 2 (name differs)
 *   SI002  Tier 2 only (DPP and PPN differ)
 *   f5     no_candidates
 *   f6     timeout → no_candidates (fail open)
 */
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, computed, reactive, watch, watchEffect, onMounted, onUnmounted, nextTick, inject, provide, useSlots } from 'vue'
import { useTableState } from '~/composables/useTableState'
import {
  pairsForPeriod, manualMatchOf, undoManualMatch, pairActivity, outputPairs, type ReconPair,
} from '~/data/vatReconciliation'
import {
  suggestFor, suggestTimings, isAireneEligible, shownSuggestions, requestSuggestions, suggestionState,
  clearSuggestionCache, differencesOf, tierOf,
} from '~/data/vatReconSuggest'

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

const PERIOD = '2027-03'
const pairs = () => pairsForPeriod(PERIOD, 'output')
const bySI = (si: string) => pairs().find(p => p.erp?.salesInvoiceId === si)!
const byId = (id: string) => pairs().find(p => p.id === id)!
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

beforeAll(() => { suggestTimings.delayMs = 5; suggestTimings.timeoutMs = 60 })
afterEach(() => {
  for (const p of pairs()) undoManualMatch(p.id)
  clearSuggestionCache()
})

async function mountWorkspace(tab = 'To match') {
  route.query = { masa: PERIOD, tab }
  const { default: Page } = await import('~/components/pages/VatReconciliationWorkspacePage.vue')
  const Host = { setup() { provide('vatFinalize', ref(0)); return {} }, components: { Page }, template: '<Page />' }
  const w = mount(Host, { attachTo: document.body, global: { stubs: { NuxtLink: { template: '<a><slot /></a>' } } } })
  await flushPromises()
  return w
}
type W = Awaited<ReturnType<typeof mountWorkspace>>
const item = (w: W, p: ReconPair) => w.find(`.vr-item[data-pair-id="${p.id}"]`)
async function expandAndSettle(w: W, p: ReconPair, ms = 30) {
  await item(w, p).find('.vr-line').trigger('click')
  await flushPromises()
  await wait(ms)
  await flushPromises()
  return item(w, p)
}

describe('eligibility — only "Tax document not found" (no tax document) and "Transaction not found"', () => {
  it('asks for none-state invoices and Transaction not found rows only', () => {
    expect(isAireneEligible(bySI('SI103'))).toBe(true)
    expect(isAireneEligible(byId('2027-03-output-f5'))).toBe(true)
    // draft / awaiting DJP / rejected — never
    for (const si of ['SI061', 'SI043', 'SI050']) expect(isAireneEligible(bySI(si)), si).toBe(false)
    // duplicate reference, return netted, Not reconciled — never
    for (const m of ['duplicate-reference', 'return-netted', 'invoice-edited'] as const) {
      expect(isAireneEligible(outputPairs.find(p => p.match === m)!), m).toBe(false)
    }
  })

  it('a draft / awaiting / rejected row shows no Airene when expanded', async () => {
    const w = await mountWorkspace()
    for (const si of ['SI061', 'SI043', 'SI050']) {
      const it = await expandAndSettle(w, bySI(si))
      expect(it.find('.vas').exists(), si).toBe(false)
      expect(it.text()).not.toContain('Airene')
      expect(suggestionState(bySI(si))).toBeUndefined()
    }
    w.unmount()
  })
})

describe('Tier 1 — SI103, reference with extra text', () => {
  it('the response keeps the contract; the group candidate is never rendered', async () => {
    const res = await suggestFor(bySI('SI103'))
    expect(res.suggestion_status).toBe('candidates_found')
    expect(res.candidates.map(c => c.pattern)).toEqual(['1_to_1', '1_to_n'])
    const shown = shownSuggestions(bySI('SI103'), res)
    expect(shown).toHaveLength(1)
    expect(shown[0]).toMatchObject({ tier: 1, suggested: true })
    expect(shown[0]!.match.pairId).toBe('2027-03-output-f1')
  })

  it('collapsed: no Airene marker and no heuristic "Match found"; expanded: loading, then the suggestion', async () => {
    const w = await mountWorkspace()
    const p = bySI('SI103')
    expect(item(w, p).text()).not.toContain('Match found')
    expect(item(w, p).text()).not.toContain('Airene')
    // The seed tax document is its own row, not folded into the invoice.
    expect(item(w, byId('2027-03-output-f1')).exists()).toBe(true)

    await item(w, p).find('.vr-line').trigger('click')
    await nextTick()
    expect(item(w, p).find('[data-test-id="vas-loading"]').text()).toContain('Airene is looking for matches…')
    await wait(30); await flushPromises()
    const it = item(w, p)
    expect(it.findAll('[data-test-id="vas-item"]')).toHaveLength(1)
    expect(it.find('[data-test-id="vas-suggested"]').text()).toContain('Suggested by Airene')
    expect(it.text()).toContain('The reference matches, with extra text around it. Name and amounts match.')
    expect(it.find('[data-test-id="vas-caption"]').text()).toBe('Airene responses can be inaccurate or misleading.')
    expect(it.findAll('button').some(b => b.text() === 'Find another tax document')).toBe(true)

    await it.find('[data-test-id="vas-item"]').findAll('button').find(b => b.text() === 'Confirm match')!.trigger('click')
    await flushPromises()
    const m = manualMatchOf(p.id)!
    expect(m.origin).toBe('ai_suggested_human_confirmed')
    expect(m.aiReasonCode).toBe('REFERENCE_EXTRA_TEXT')
    const after = bySI('SI103')
    expect(after).toMatchObject({ match: 'matched', matchedBy: 'manual', matchOrigin: 'ai_suggested_human_confirmed' })
    expect(pairs().some(x => x.id === '2027-03-output-f1')).toBe(false) // consumed
    expect(pairActivity(after, PERIOD)[0]!.label).toBe('Matched with Airene suggestion')
    w.unmount()

    const matched = await mountWorkspace('Matched')
    expect(matched.find('[data-test-id="vr-method-airene"]').text()).toBe('Airene')
    matched.unmount()
  })

  it('one call per row: the answer is cached for the session', () => {
    const p = bySI('SI103')
    requestSuggestions(p)
    const first = suggestionState(p)
    requestSuggestions(p)
    expect(suggestionState(p)).toBe(first)
  })
})

describe('Tier 1 + Tier 2 — SI013', () => {
  it('rank order; only the Tier 1 is suggested; the Tier 2 says the name differs', async () => {
    const w = await mountWorkspace()
    const it = await expandAndSettle(w, bySI('SI013'))
    const items = it.findAll('[data-test-id="vas-item"]')
    // Not a separator-only difference — the engine normalizes those (PM, 2026-11-09).
    expect(items[0]!.find('.vas-reason').text()).toBe('The reference has the same number in a different order or prefix. Name and amounts match.')
    expect(items.map(i => i.attributes('data-tier'))).toEqual(['1', '2'])
    expect(items[0]!.find('[data-test-id="vas-suggested"]').exists()).toBe(true)
    expect(items[1]!.find('[data-test-id="vas-suggested"]').exists()).toBe(false)
    expect(items[1]!.findAll('[data-test-id="vas-diff"]').map(d => d.text())).toEqual(['Name differs'])
    w.unmount()
  })
})

describe('Tier 2 only — SI002, DPP and PPN differ', () => {
  it('never suggested; differences stated plainly; confirming goes through the difference modal', async () => {
    const res = await suggestFor(bySI('SI002'))
    expect(tierOf(res.candidates[0]!)).toBe(2)
    expect(differencesOf(res.candidates[0]!)).toEqual([
      { label: 'DPP differs', amount: 500_000 }, { label: 'PPN differs', amount: 55_000 },
    ])
    const w = await mountWorkspace()
    const p = bySI('SI002')
    const it = await expandAndSettle(w, p)
    expect(it.find('[data-test-id="vas-suggested"]').exists()).toBe(false)
    expect(it.findAll('[data-test-id="vas-diff"]').map(d => d.text())).toEqual(['DPP differs Rp500.000,00', 'PPN differs Rp55.000,00'])
    await it.find('[data-test-id="vas-item"]').findAll('button').find(b => b.text() === 'Confirm match')!.trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('Confirm match with a difference?')
    expect(manualMatchOf(p.id)).toBeUndefined()
    ;[...document.body.querySelectorAll('button')].filter(b => b.textContent?.trim() === 'Confirm match').at(-1)!.click()
    await flushPromises()
    expect(manualMatchOf(p.id)).toMatchObject({ origin: 'ai_suggested_human_confirmed', difference: -555_000 })
    w.unmount()
  })
})

describe('no_candidates and timeout — the manual search, unchanged', () => {
  it('f5: nothing from Airene, no marker; Find another transaction is there', async () => {
    expect((await suggestFor(byId('2027-03-output-f5'))).suggestion_status).toBe('no_candidates')
    const w = await mountWorkspace()
    const it = await expandAndSettle(w, byId('2027-03-output-f5'))
    expect(it.find('.vas').exists()).toBe(false)
    expect(it.text()).not.toContain('Airene')
    expect(it.findAll('button').some(b => b.text() === 'Find another transaction')).toBe(true)
    w.unmount()
  })

  it('f6: loading while waiting, then fails open to the manual search', async () => {
    // A 60ms timeout raced the "still loading" check on slow CI runners — give
    // this one room, then wait for the fail-open instead of sleeping a fixed time.
    const prev = suggestTimings.timeoutMs
    suggestTimings.timeoutMs = 1000
    try {
      const w = await mountWorkspace()
      const p = byId('2027-03-output-f6')
      await item(w, p).find('.vr-line').trigger('click')
      await flushPromises()
      expect(item(w, p).find('[data-test-id="vas-loading"]').exists()).toBe(true)
      await vi.waitFor(() => expect(suggestionState(p)?.response?.suggestion_status).toBe('no_candidates'), { timeout: 10_000, interval: 25 })
      await flushPromises()
      expect(item(w, p).find('.vas').exists()).toBe(false)
      expect(item(w, p).findAll('button').some(b => b.text() === 'Find another transaction')).toBe(true)
      w.unmount()
    } finally {
      suggestTimings.timeoutMs = prev
    }
  })
})

describe('column title and seeds (PM, 2026-11-09)', () => {
  it('the missing column is titled by what Airene proposes; "No match" only when it has nothing', async () => {
    const w = await mountWorkspace()
    const titles = (p: ReconPair) => item(w, p).findAll('.vr-detail-title').map(x => x.text())
    // Tax document not found → right column; loading already counts.
    await item(w, bySI('SI013')).find('.vr-line').trigger('click')
    await nextTick()
    expect(titles(bySI('SI013')).slice(0, 2)).toEqual(['Transaction', 'Tax document'])
    await wait(30); await flushPromises()
    expect(titles(bySI('SI013')).slice(0, 2)).toEqual(['Transaction', 'Tax document'])
    // Transaction not found with no candidates → left column says No match.
    await expandAndSettle(w, byId('2027-03-output-f5'))
    expect(titles(byId('2027-03-output-f5')).slice(0, 2)).toEqual(['No match', 'Tax document'])
    // …and with candidates (f1 answers with SI103) → Transaction.
    await expandAndSettle(w, byId('2027-03-output-f1'))
    expect(titles(byId('2027-03-output-f1')).slice(0, 2)).toEqual(['Transaction', 'Tax document'])
    w.unmount()
  })

  it('no seed suggests a separator-only difference', async () => {
    const sources = pairs().filter(isAireneEligible)
    const codes = (await Promise.all(sources.filter(p => p.id !== '2027-03-output-f6').map(p => suggestFor(p))))
      .flatMap(r => r.candidates.map(c => c.reason_code))
    expect(codes).toContain('REFERENCE_PREFIX_ORDER')
    expect(codes).not.toContain('REFERENCE_SEPARATOR_DIFF')
  })
})

describe('drawer', () => {
  it('Find another opens the drawer with Airene on top and the manual list without repeats', async () => {
    const { default: Drawer } = await import('~/components/patterns/ReconciliationDetailDrawer.vue')
    const { default: ErpDrawer } = await import('~/components/patterns/ErpDrawer.vue')
    const w = mount(Drawer, {
      attachTo: document.body,
      props: { isOpen: true, pair: bySI('SI013'), side: 'output', periodId: PERIOD },
      global: { components: { ErpDrawer }, stubs: { Teleport: true } },
    })
    await flushPromises(); await wait(30); await flushPromises()
    expect(w.findAll('[data-test-id="vas-item"]')).toHaveLength(2)
    const aireneRefs = w.findAll('[data-test-id="vas-item"]').map(i => i.attributes('data-ref'))
    const manual = w.findAll('.rdd-candidate-ref').map(e => e.text())
    for (const r of aireneRefs) expect(manual.some(m => m.startsWith(r!))).toBe(false)
    w.unmount()
  })
})
