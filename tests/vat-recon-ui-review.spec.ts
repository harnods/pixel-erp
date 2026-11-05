// @vitest-environment happy-dom
/**
 * VAT reconciliation — UI review fixes (2026-11-04).
 *
 * Bugs:  duplicate reference lists the faktur (not invoices) and a pick keeps the
 *        faktur chosen; no red Difference before a pick; Finalize is never
 *        disabled and explains itself.
 * Rules: every screen reuses the shared patterns — ErpTablePage + column kinds,
 *        ErpFilterSelect, ExportModal, ErpDrawer shell, one primary per screen.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ref, computed, reactive, watch, watchEffect, onMounted, onUnmounted, nextTick, inject, provide, useSlots } from 'vue'
import { useTableState } from '~/composables/useTableState'
import {
  outputPairs, candidatesFor, confirmManualMatch, undoManualMatch, pairsForPeriod, activePeriodId,
  finalizePeriod, unfinalizePeriod,
} from '~/data/vatReconciliation'

const route = { query: { masa: '2027-02', tab: 'Needs attention' } as Record<string, string> }
const push = vi.fn()
vi.stubGlobal('useRoute', () => route)
vi.stubGlobal('useRouter', () => ({ push, replace: vi.fn() }))
vi.stubGlobal('useLocale', () => ({ t: (s: string) => s }))
vi.stubGlobal('useNavigation', () => ({ currentPageKey: ref('Faktur keluaran') }))
vi.stubGlobal('useTaxSubmissionPermission', () => ({ canSubmitTaxDocument: ref(true), setCanSubmitTaxDocument: vi.fn() }))
for (const [k, v] of Object.entries({ ref, computed, reactive, watch, watchEffect, onMounted, onUnmounted, nextTick, inject, useSlots, useTableState })) vi.stubGlobal(k, v)
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const src = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf8')
const dup = outputPairs.find(p => p.match === 'duplicate-reference')!

afterEach(() => { undoManualMatch(dup.id) })

describe('duplicate reference (US-003)', () => {
  it('offers the Approved faktur carrying the number, not sales invoices', () => {
    const refs = candidatesFor(dup).map(c => c.ref)
    expect(refs).toEqual([dup.djp!.ref, ...dup.duplicates!.map(d => d.ref)])
    for (const r of refs) expect(r).toMatch(/^\d{17}$/) // Coretax nomor faktur
  })

  it('confirming the pengganti keeps that faktur on the pair', () => {
    const pengganti = candidatesFor(dup)[1]!
    expect(confirmManualMatch({ pair: dup, periodId: activePeriodId, side: 'output', candidate: pengganti })).toBe(true)
    const after = pairsForPeriod(activePeriodId, 'output').find(p => p.id === dup.id)!
    expect(after.match).toBe('matched')
    expect(after.djp!.ref).toBe(pengganti.ref)
  })
})

describe('workspace', () => {
  async function mountWorkspace(finalizeSignal = ref(0), query: Record<string, string> = { masa: '2027-02', tab: 'To match' }) {
    route.query = query
    const { default: Page } = await import('~/components/pages/VatReconciliationWorkspacePage.vue')
    const Host = { setup() { provide('vatFinalize', finalizeSignal); return {} }, components: { Page }, template: '<Page />' }
    const w = mount(Host, { attachTo: document.body, global: { stubs: { NuxtLink: { template: '<a><slot /></a>' } } } })
    await flushPromises()
    return w
  }

  it('a duplicate reference shows its faktur and offers Find another faktur — no premature Difference', async () => {
    const w = await mountWorkspace()
    const item = w.find(`.vr-item[data-pair-id="${dup.id}"]`)
    await item.find('.vr-line').trigger('click')
    expect(item.text()).toContain(dup.djp!.ref)
    expect(item.text()).not.toContain('Difference')
    expect(item.findAll('button').some(b => b.text() === 'Find another faktur')).toBe(true)
    w.unmount()
  })

  it('Finalize on an unreconciled masa explains itself instead of doing nothing', async () => {
    const signal = ref(0)
    const w = await mountWorkspace(signal)
    signal.value++
    await flushPromises()
    expect(document.body.textContent).toContain('is not ready to finalize')
    w.unmount()
  })

  // ── Pass 2 ──
  it('a fully reconciled masa opens to an all-clear state, not "no match"', async () => {
    const w = await mountWorkspace(ref(0), { masa: '2027-01', tab: 'To match' })
    expect(w.text()).toContain('Nothing to match')
    expect(w.text()).not.toContain('No faktur match your filters')
    expect(w.findAll('button').some(b => b.text() === 'View matched')).toBe(true)
    w.unmount()
  })

  it('Re-run on a finalized masa refuses inline in the banner; no second Unfinalize', async () => {
    finalizePeriod('2027-01')
    try {
      const w = await mountWorkspace(ref(0), { masa: '2027-01', tab: 'To match' })
      expect(w.findAll('button').filter(b => b.text() === 'Unfinalize')).toHaveLength(0)
      await w.findAll('button').find(b => b.text() === 'Re-run')!.trigger('click')
      expect(w.find('.vr-finalized-error').text()).toContain('Unfinalize it first')
      w.unmount()
    } finally {
      unfinalizePeriod('2027-01')
    }
  })

  it('a return row (Not reconciled) shows the linked sales return in its detail', async () => {
    const ret = outputPairs.find(p => p.match === 'return-not-reflected')!
    const w = await mountWorkspace(ref(0), { masa: '2027-02', tab: 'Not reconciled' })
    const row = w.findAll('tbody tr').find(r => r.text().includes(ret.erp!.ref))!
    await row.find('.cell-link').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('Sales return')
    expect(document.body.textContent).toContain(ret.erp!.returnRef!)
    w.unmount()
  })
})

describe('index: one list, no tabs', () => {
  it('the index registers no tabs and no tab badge', () => {
    const slug = src('app/pages/[...slug].vue')
    expect(slug).not.toContain("'Vat reconciliation': ['All reconciliations', 'Needs attention']")
    expect(slug).not.toContain("'All reconciliations': VatReconciliationPeriodsPage")
  })

  it('periods that need attention come first, newest first within each group', async () => {
    route.query = {}
    const { default: Page } = await import('~/components/pages/VatReconciliationPeriodsPage.vue')
    const { saveVatSetup, loadVatSetup } = await import('~/data/vatReconciliation')
    const had = loadVatSetup()
    if (!had) saveVatSetup({ outputAccountCodes: ['2-20500'] })
    vi.useFakeTimers()
    const w = mount(Page, { attachTo: document.body, global: { stubs: { NuxtLink: { template: '<a><slot /></a>' } } } })
    await vi.advanceTimersByTimeAsync(1300) // first-load skeleton
    vi.useRealTimers()
    await flushPromises()
    const masas = w.findAll('tbody tr').map(r => r.text().match(/\d{2}\/\d{4}/)?.[0]).filter(Boolean)
    expect(masas.slice(0, 2)).toEqual(['03/2027', '02/2027'])
    expect(masas.slice(2)).toEqual(['01/2027', '12/2026', '11/2026', '10/2026'])
    w.unmount()
  })

  it('tax period checklist sits in a scrolling box (StockAdjustments pattern)', () => {
    const s = src('app/components/patterns/ReconciliationFiltersDrawer.vue')
    expect(s).toContain('rf-checklist--boxed')
    expect(s).toMatch(/\.rf-checklist--boxed \{[^}]*overflow-y: auto/)
  })
})

describe('pass 2 — data and copy', () => {
  it('02/2027 fixture reasons only name dates in the masa (no stale January)', () => {
    for (const p of outputPairs) expect(p.reason ?? '', p.id).not.toMatch(/\b\d{2} Jan\b/)
  })

  it('setup card is a bordered "Last saved" card with the shared date format', () => {
    const s = src('app/components/pages/VatMatchingRulesPage.vue')
    expect(s).not.toContain('toLocaleString')
    expect(s).not.toContain('--mp-background-surface-bold')
    expect(s).toContain('formatDateTimeLong(saved.savedAt)')
  })
})

describe('shared patterns (static)', () => {
  it('Unmatched page renders through ErpTablePage with column kinds', () => {
    const s = src('app/components/pages/VatReconciliationUnmatchedPage.vue')
    expect(s).toContain('<ErpTablePage')
    expect(s).not.toMatch(/grid-template-columns:\s*120px/)
    expect(s).toContain("kind: 'amount'")
  })

  it('index columns use kinds, not pixel widths', () => {
    const s = src('app/components/pages/VatReconciliationPeriodsPage.vue')
    const cols = s.slice(s.indexOf('const columns = computed'), s.indexOf('// reconVersion is read'))
    expect(cols).not.toMatch(/width:\s*'\d+px'/)
    expect(s).toContain('#bulk-actions')
  })

  it('no silent export and no native/MpSelect quick filters anywhere in the module', () => {
    for (const f of [
      'app/components/pages/VatReconciliationPeriodsPage.vue',
      'app/components/pages/VatReconciliationUnmatchedPage.vue',
      'app/components/pages/VatReconciliationWorkspacePage.vue',
    ]) {
      const s = src(f)
      expect(s, f).not.toContain("t('Export started')")
      expect(s, f).not.toMatch(/<MpSelect\b/)
      expect(s, f).toContain('ExportModal')
    }
  })

  it('detail drawer is the ErpDrawer shell (closes only via ×)', () => {
    const s = src('app/components/patterns/ReconciliationDetailDrawer.vue')
    expect(s).toContain('<ErpDrawer')
    expect(s).not.toMatch(/<MpDrawer\b/)
    expect(s).not.toContain('is-close-on-overlay-click')
  })

  it('title bar: no Export on the workspace, Finalize never disabled', () => {
    const s = src('app/pages/[...slug].vue')
    const block = s.slice(s.indexOf("currentPageKey === 'Faktur keluaran' || currentPageKey === 'Faktur masukan'\" class=\"page-title-actions\""))
    const ws = block.slice(0, block.indexOf("currentPageKey === 'Matching rules'"))
    expect(ws).not.toContain("t('Export')")
    expect(ws).not.toContain(':disabled')
  })
})

describe('expanded row + drawer title (2026-11-05)', () => {
  it('the reason banner sits above the two detail columns', () => {
    const s = src('app/components/pages/VatReconciliationWorkspacePage.vue')
    const detail = s.slice(s.indexOf('class="vr-detail"'))
    expect(detail.indexOf('class="vr-reason"')).toBeGreaterThan(-1)
    expect(detail.indexOf('class="vr-reason"')).toBeLessThan(detail.indexOf('class="vr-detail-col"'))
  })

  it('the detail drawer title is the reference only — no icon, no sub-line', () => {
    const s = src('app/components/patterns/ReconciliationDetailDrawer.vue')
    expect(s).not.toContain('<template #title>')
    expect(s).not.toContain('rdd-state-icon')
    expect(s).not.toContain("t('Reconciliation detail')")
  })
})
