// @vitest-environment happy-dom
/**
 * VAT reconciliation — four gaps against PRD OD-001 v1.0, fixed:
 *
 *  1. US-020 AC-02  Tax difference = |PPN Sales − PPN Faktur| (was DPP + PPN).
 *  2. US-020 AC-04  Footer counts follow the filter; the cards stay period-level.
 *  3. US-002 AC-05  A Finalized masa refuses Match / Unmatch, not only Re-run.
 *  4. US-012 AC-02  Waiting on buyer is a per-row toggle; only toggled rows
 *                   leave "need review", and the status never changes.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, computed, reactive, watch, onMounted, onUnmounted, nextTick, inject } from 'vue'
import {
  pairsForPeriod, reconTotals, footerCounts, isWaitingOnBuyer, setWaitingOnBuyer,
  canWaitOnBuyer, outputPairs, waitingOnBuyerMark, CURRENT_USER,
} from '~/data/vatReconciliation'
import { formatIDR } from '~/utils/currency'

const route = { query: { masa: '2027-02', tab: 'All faktur' } as Record<string, string> }
vi.stubGlobal('useRoute', () => route)
vi.stubGlobal('useRouter', () => ({ push: vi.fn(), replace: vi.fn() }))
vi.stubGlobal('useLocale', () => ({ t: (s: string) => s }))
vi.stubGlobal('useNavigation', () => ({ currentPageKey: ref('Faktur keluaran') }))
vi.stubGlobal('useTaxSubmissionPermission', () => ({ canSubmitTaxDocument: ref(true), setCanSubmitTaxDocument: vi.fn() }))
for (const [k, v] of Object.entries({ ref, computed, reactive, watch, onMounted, onUnmounted, nextTick, inject })) vi.stubGlobal(k, v)
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

async function mountWorkspace(masa: string) {
  route.query = { masa, tab: 'All faktur' }
  const { default: Page } = await import('~/components/pages/VatReconciliationWorkspacePage.vue')
  const w = mount(Page, { global: { stubs: { NuxtLink: { template: '<a><slot /></a>' } } } })
  await flushPromises()
  return w
}

const returnRow = () => outputPairs.find(p => p.match === 'return-not-reflected')!
afterEach(() => setWaitingOnBuyer(returnRow(), false))

describe('1 — Tax difference is PPN only (US-020 AC-02)', () => {
  it('the card shows |PPN Faktur − PPN Sales|, not the DPP + PPN gap', async () => {
    const pairs = pairsForPeriod('2027-02', 'output')
    const ppnGap = Math.abs(reconTotals(pairs, 'djp').ppn - reconTotals(pairs, 'erp').ppn)
    const dppPlusPpnGap = Math.abs(
      (reconTotals(pairs, 'djp').dpp + reconTotals(pairs, 'djp').ppn)
      - (reconTotals(pairs, 'erp').dpp + reconTotals(pairs, 'erp').ppn))
    expect(ppnGap).not.toBe(dppPlusPpnGap) // the fixture actually tells them apart

    const w = await mountWorkspace('2027-02')
    const card = w.findAll('.vr-kpi').at(-1)!
    expect(card.find('.vr-kpi-value').text()).toBe(formatIDR(ppnGap))
  })
})

describe('2 — Footer follows the filter (US-020 AC-04)', () => {
  it('searching narrows the footer counts but not the cards', async () => {
    const w = await mountWorkspace('2027-02')
    const cardsBefore = w.findAll('.vr-kpi-value').map(c => c.text())
    const one = pairsForPeriod('2027-02', 'output').find(p => p.match === 'matched' && p.erp)!
    await w.find('.filter-search-input').setValue(one.erp!.ref)
    const foot = w.find('.vr-foot').text()
    expect(foot).toContain('1 matched')
    expect(foot).toContain('0 need review')
    expect(foot).toContain('0 unmatched')
    expect(w.findAll('.vr-kpi-value').map(c => c.text())).toEqual(cardsBefore)
  })
})

describe('3 — Finalized masa refuses Match / Unmatch (US-002 AC-05)', () => {
  it('Unmatch in a finalized masa answers "Unfinalize first" instead of unmatching', async () => {
    const { default: Actions } = await import('~/components/patterns/VatReconciliationPairActions.vue')
    const matched = outputPairs.find(p => p.match === 'matched')!
    const w = mount(Actions, { props: { pair: matched, side: 'output', finalized: true } })
    await w.find('button').trigger('click')
    expect(w.emitted('action')![0]).toEqual(['Unfinalize first to change matches in this period', false])
  })

  it('an open masa still unmatches', async () => {
    const { default: Actions } = await import('~/components/patterns/VatReconciliationPairActions.vue')
    const matched = outputPairs.find(p => p.match === 'matched')!
    const w = mount(Actions, { props: { pair: matched, side: 'output', finalized: false } })
    await w.find('button').trigger('click')
    expect(w.emitted('action')![0]).toEqual(['Match canceled', true])
  })
})

describe('4 — Waiting on buyer is a per-row toggle (US-012 AC-02)', () => {
  it('only toggled rows count as waiting; status is unchanged', () => {
    const pairs = pairsForPeriod('2027-02', 'output')
    const row = returnRow()
    expect(footerCounts(pairs).waiting).toBe(0) // in that state, but not toggled
    const reviewBefore = footerCounts(pairs).review

    setWaitingOnBuyer(row, true)
    expect(isWaitingOnBuyer(row)).toBe(true)
    expect(row.match).toBe('return-not-reflected')
    expect(footerCounts(pairs).waiting).toBe(1)
    expect(footerCounts(pairs).review).toBe(reviewBefore - 1)

    setWaitingOnBuyer(row, false)
    expect(footerCounts(pairs).waiting).toBe(0)
  })

  // Persistence itself is checked in the browser — persist.ts is a no-op outside the client.
  it('records who set it and when', () => {
    setWaitingOnBuyer(returnRow(), true)
    const mark = waitingOnBuyerMark(returnRow())
    expect(mark?.by).toBe(CURRENT_USER)
    expect(Number.isNaN(Date.parse(mark!.at))).toBe(false)
  })

  it('only a "return not reflected" row can wait on the buyer', () => {
    const other = outputPairs.find(p => p.match === 'matched')!
    expect(canWaitOnBuyer(other)).toBe(false)
    setWaitingOnBuyer(other, true)
    expect(isWaitingOnBuyer(other)).toBe(false)
  })

  it('the row action toggles on and off, and the row shows the clock tag', async () => {
    const { default: Actions } = await import('~/components/patterns/VatReconciliationPairActions.vue')
    const a = mount(Actions, { props: { pair: returnRow(), side: 'output' } })
    const btn = () => a.findAll('button').find(b => /waiting on buyer/i.test(b.text()))!
    expect(btn().text()).toBe('Waiting on buyer')
    await btn().trigger('click')
    expect(btn().text()).toBe('Stop waiting on buyer')

    const w = await mountWorkspace('2027-02')
    const item = w.findAll('.vr-item').find(i => i.find('.vr-erp').text().includes(returnRow().erp!.ref))!
    expect(item.find('.vr-waiting-tag').exists()).toBe(true)

    await btn().trigger('click')
    expect(btn().text()).toBe('Waiting on buyer')
  })
})
