// @vitest-environment happy-dom
/**
 * AIRENE_SUGGEST_ENABLED = false → no Airene anywhere (today's behaviour):
 * no request, no list, and the NPWP/amount heuristic still proposes "Match found".
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, computed, reactive, watch, watchEffect, onMounted, onUnmounted, nextTick, inject, provide, useSlots } from 'vue'
import { useTableState } from '~/composables/useTableState'

vi.mock('~/data/vatReconFlags', () => ({ VAT_IN_ENABLED: false, AIRENE_SUGGEST_ENABLED: false }))

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

describe('flag off — no Airene anywhere', () => {
  it('nothing is eligible, nothing is requested, and the heuristic still proposes', async () => {
    const { pairsForPeriod, candidatesFor } = await import('~/data/vatReconciliation')
    const { isAireneEligible, requestSuggestions, suggestionState, suggestTimings } = await import('~/data/vatReconSuggest')
    suggestTimings.delayMs = 5
    const si103 = pairsForPeriod('2027-03', 'output').find(p => p.erp?.salesInvoiceId === 'SI103')!
    expect(isAireneEligible(si103)).toBe(false)
    requestSuggestions(si103)
    expect(suggestionState(si103)).toBeUndefined()
    expect(candidatesFor(si103)[0]?.pairId).toBe('2027-03-output-f1')

    route.query = { masa: '2027-03', tab: 'To match' }
    const { default: Page } = await import('~/components/pages/VatReconciliationWorkspacePage.vue')
    const Host = { setup() { provide('vatFinalize', ref(0)); return {} }, components: { Page }, template: '<Page />' }
    const w = mount(Host, { attachTo: document.body, global: { stubs: { NuxtLink: { template: '<a><slot /></a>' } } } })
    await flushPromises()
    const row = w.find(`.vr-item[data-pair-id="${si103.id}"]`)
    expect(row.text()).toContain('Match found')
    await row.find('.vr-line').trigger('click')
    await new Promise(r => setTimeout(r, 30)); await flushPromises()
    expect(w.find('.vas').exists()).toBe(false)
    expect(w.text()).not.toContain('Airene')
    w.unmount()
  })
})
