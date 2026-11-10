// @vitest-environment happy-dom
/**
 * VAT reconciliation — VAT In hidden (2026-11-05).
 *
 * VAT In (OD-008) is a non-goal for the VAT Out MVP. It is hidden behind one
 * flag, VAT_IN_ENABLED (~/data/vatReconFlags), not deleted. This file runs with
 * the real flag (off) and pins that no screen offers the input side, and that a
 * stored scope of `both` can't bring it back. The OD-008 path itself stays
 * covered in vat-reconciliation-periods.spec.ts, which mocks the flag on.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { useTableState } from '~/composables/useTableState'
import { VAT_IN_ENABLED } from '~/data/vatReconFlags'
import {
  saveVatSetup, loadVatSetup, normalizeSetup, reconSides, isSideInScope,
  reconPeriodRows, reconIssues, activePeriodId, inputPairs, pairsForPeriod,
  SNAPSHOT_ACCOUNT_CODES,
} from '~/data/vatReconciliation'

const route = { query: {} as Record<string, string> }
const push = vi.fn()
const replace = vi.fn()
const pageKey = ref('Faktur keluaran')
vi.stubGlobal('useRoute', () => route)
vi.stubGlobal('useRouter', () => ({ push, replace }))
vi.stubGlobal('useLocale', () => ({ t: (s: string) => s }))
vi.stubGlobal('useNavigation', () => ({ currentPageKey: pageKey }))
vi.stubGlobal('useTaxSubmissionPermission', () => ({ canSubmitTaxDocument: ref(true), setCanSubmitTaxDocument: vi.fn() }))
vi.stubGlobal('useTableState', useTableState)
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const stubs = { NuxtLink: { template: '<a><slot /></a>' } }
// Every case starts from the state an old browser could hold: VAT In chosen.
const saveBoth = () => saveVatSetup({
  outputAccountCodes: SNAPSHOT_ACCOUNT_CODES.output,
  inputAccountCodes: SNAPSHOT_ACCOUNT_CODES.input,
  scope: 'both',
})

afterEach(() => {
  route.query = {}
  pageKey.value = 'Faktur keluaran'
  push.mockClear()
  replace.mockClear()
})

describe('the flag', () => {
  it('ships off', () => {
    expect(VAT_IN_ENABLED).toBe(false)
  })

  it('a stored scope of both reads as VAT Out', () => {
    expect(normalizeSetup({ outputAccountCodes: ['2-20500'], inputAccountCodes: ['1-10500'], scope: 'both' }).scope).toBe('out')
  })

  it('saving both saves VAT Out', () => {
    expect(saveBoth().scope).toBe('out')
    expect(loadVatSetup()?.scope).toBe('out')
    expect(reconSides()).toEqual(['output'])
    expect(isSideInScope('input')).toBe(false)
  })
})

describe('data — no input side anywhere', () => {
  it('the period index has output rows only, one per masa', () => {
    saveBoth()
    const rows = reconPeriodRows()
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every(r => r.side === 'output')).toBe(true)
    expect(new Set(rows.map(r => r.periodId)).size).toBe(rows.length)
  })

  it('the issue queue carries no input pairs (i-01…i-08)', () => {
    saveBoth()
    const ids = reconIssues(activePeriodId).map(i => i.id)
    expect(ids.some(id => id.startsWith('i-'))).toBe(false)
    expect(reconIssues(activePeriodId).every(i => i.side === 'output')).toBe(true)
  })

  it('the input fixtures are kept for OD-008, just not listed', () => {
    expect(inputPairs.map(p => p.id)).toEqual(['i-01', 'i-02', 'i-03', 'i-04', 'i-05', 'i-06', 'i-07', 'i-08'])
    expect(pairsForPeriod(activePeriodId, 'input')).toHaveLength(inputPairs.length)
  })
})

describe('setup page', () => {
  it('offers no VAT scope choice and no PPN Masukan accounts', async () => {
    saveBoth()
    const { default: Page } = await import('~/components/pages/VatMatchingRulesPage.vue')
    const w = mount(Page, { attachTo: document.body, global: { stubs } })
    await flushPromises()
    expect(w.find('#vm-seg-scope').exists()).toBe(false)
    expect(w.text()).not.toContain('VAT Out & VAT In')
    expect(w.text()).not.toContain('What to reconcile')
    expect(w.find('#vm-input-accounts').exists()).toBe(false)
    expect(w.text()).not.toContain('PPN Masukan')
    // The VAT Out picker and the scope line stay.
    expect(w.find('#vm-output-accounts').exists()).toBe(true)
    expect(w.text()).toContain('for VAT Out only.')
    w.unmount()
  })
})

describe('period index', () => {
  it('has no Invoice type column or filter, and the amount header names sales invoices', async () => {
    saveBoth()
    const { default: Page } = await import('~/components/pages/VatReconciliationPeriodsPage.vue')
    vi.useFakeTimers()
    const w = mount(Page, { attachTo: document.body, global: { stubs } })
    await vi.advanceTimersByTimeAsync(1300) // first-load skeleton
    vi.useRealTimers()
    await flushPromises()
    const headers = w.findAll('th').map(h => h.text())
    expect(headers.some(h => h.includes('Invoice type'))).toBe(false)
    expect(headers.some(h => h.includes('Invoice (Rp)') && !h.includes('Sales'))).toBe(false)
    expect(headers.some(h => h.includes('Transaction (Rp)'))).toBe(true)
    expect(w.find('#vp-jenis-filter').exists()).toBe(false)
    expect(w.text()).not.toContain('Input tax invoice')
    w.unmount()
  })
})

describe('issue queue', () => {
  it('ignores a stale ?jenis=input link — customers only, no Side column', async () => {
    saveBoth()
    route.query = { masa: activePeriodId, jenis: 'input' }
    const { default: Page } = await import('~/components/pages/VatReconciliationUnmatchedPage.vue')
    const w = mount(Page, { attachTo: document.body, global: { stubs } })
    await flushPromises()
    const headers = w.findAll('th').map(h => h.text())
    expect(headers.some(h => h.includes('Vendor'))).toBe(false)
    expect(headers.some(h => h === 'Side')).toBe(false)
    expect(headers.some(h => h.includes('Customer'))).toBe(true)
    w.unmount()
  })
})

describe('workspace', () => {
  it('a /faktur-masukan link lands on the output workspace, same masa and tab', async () => {
    saveBoth()
    pageKey.value = 'Faktur masukan'
    route.query = { masa: activePeriodId, tab: 'To match' }
    const { default: Page } = await import('~/components/pages/VatReconciliationWorkspacePage.vue')
    const w = mount(Page, { attachTo: document.body, global: { stubs } })
    await flushPromises()
    expect(replace).toHaveBeenCalledWith({ path: '/faktur-keluaran', query: { masa: activePeriodId, tab: 'To match' } })
    expect(w.text()).not.toContain('Purchase invoice')
    expect(w.text()).not.toContain('Vendor')
    w.unmount()
  })
})
