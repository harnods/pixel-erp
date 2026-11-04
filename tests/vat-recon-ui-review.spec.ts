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
import { ref, computed, reactive, watch, onMounted, onUnmounted, nextTick, inject, provide } from 'vue'
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
for (const [k, v] of Object.entries({ ref, computed, reactive, watch, onMounted, onUnmounted, nextTick, inject })) vi.stubGlobal(k, v)
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
  async function mountWorkspace(finalizeSignal = ref(0), query: Record<string, string> = { masa: '2027-02', tab: 'All faktur' }) {
    route.query = query
    const { default: Page } = await import('~/components/pages/VatReconciliationWorkspacePage.vue')
    const Host = { setup() { provide('vatFinalize', finalizeSignal); return {} }, components: { Page }, template: '<Page />' }
    const w = mount(Host, { attachTo: document.body, global: { stubs: { NuxtLink: { template: '<a><slot /></a>' } } } })
    await flushPromises()
    return w
  }

  it('shows no Difference verdict until a candidate is picked', async () => {
    const w = await mountWorkspace()
    const item = w.findAll('.vr-item').find(i => i.find('.vr-djp').text().includes(dup.djp!.ref))!
    await item.find('.vr-chevron').trigger('click')
    expect(item.find('.vr-cand-sum').exists()).toBe(false)
    expect(item.text()).toContain('Select a match to see the difference.')
    expect(item.text()).toContain('Select the correct faktur')
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
    const w = await mountWorkspace(ref(0), { masa: '2027-01', tab: 'Needs attention' })
    expect(w.text()).toContain('Nothing needs attention')
    expect(w.text()).not.toContain('No faktur match your filters')
    expect(w.findAll('button').some(b => b.text() === 'View all faktur')).toBe(true)
    w.unmount()
  })

  it('Re-run on a finalized masa refuses inline in the banner; no second Unfinalize', async () => {
    finalizePeriod('2027-01')
    try {
      const w = await mountWorkspace(ref(0), { masa: '2027-01', tab: 'All faktur' })
      expect(w.findAll('button').filter(b => b.text() === 'Unfinalize')).toHaveLength(0)
      await w.findAll('button').find(b => b.text() === 'Re-run')!.trigger('click')
      expect(w.find('.vr-finalized-error').text()).toContain('Unfinalize it first')
      w.unmount()
    } finally {
      unfinalizePeriod('2027-01')
    }
  })

  it('a return row shows the linked sales return', async () => {
    const ret = outputPairs.find(p => p.match === 'return-not-reflected')!
    const w = await mountWorkspace()
    const item = w.findAll('.vr-item').find(i => i.find('.vr-erp').text().includes(ret.erp!.ref))!
    await item.find('.vr-chevron').trigger('click')
    expect(item.text()).toContain('Sales return')
    expect(item.text()).toContain(ret.erp!.returnRef!)
    w.unmount()
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
