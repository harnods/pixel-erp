// @vitest-environment happy-dom
/**
 * VAT reconciliation — four gaps against PRD OD-001 v1.0, fixed:
 *
 *  1. US-020 AC-02  Tax difference = |PPN Sales − PPN Faktur| (was DPP + PPN).
 *  2. US-020 AC-04  The list follows the filter; the summary stays period-level.
 *  3. US-002 AC-05  A Finalized masa refuses Match / Unmatch, not only Re-run.
 *  4. US-012 AC-02  Waiting on buyer is a per-row toggle; only toggled rows
 *                   leave "need review", and the status never changes.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, computed, reactive, watch, onMounted, onUnmounted, nextTick, inject, watchEffect, useSlots } from 'vue'
import { useTableState } from '~/composables/useTableState'
import {
  pairsForPeriod, reconTotals, footerCounts, isWaitingOnBuyer, setWaitingOnBuyer,
  canWaitOnBuyer, outputPairs, waitingOnBuyerMark, CURRENT_USER, restoreAutoMatch,
} from '~/data/vatReconciliation'
import { formatIDR } from '~/utils/currency'

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

async function mountWorkspace(masa: string, tab = 'To match') {
  route.query = { masa, tab }
  const { default: Page } = await import('~/components/pages/VatReconciliationWorkspacePage.vue')
  const w = mount(Page, { attachTo: document.body, global: { stubs: { NuxtLink: { template: '<a><slot /></a>' } } } })
  await flushPromises()
  return w
}

const returnRow = () => outputPairs.find(p => p.match === 'return-not-reflected')!
afterEach(() => {
  setWaitingOnBuyer(returnRow(), false)
  restoreAutoMatch(outputPairs.find(p => p.match === 'matched')!.id)
})

describe('1 — Tax difference is PPN only (US-020 AC-02)', () => {
  it('the card shows |PPN Faktur − PPN Sales|, not the DPP + PPN gap', async () => {
    const pairs = pairsForPeriod('2027-02', 'output')
    const ppnGap = Math.abs(reconTotals(pairs, 'djp').ppn - reconTotals(pairs, 'erp').ppn)
    const dppPlusPpnGap = Math.abs(
      (reconTotals(pairs, 'djp').dpp + reconTotals(pairs, 'djp').ppn)
      - (reconTotals(pairs, 'erp').dpp + reconTotals(pairs, 'erp').ppn))
    expect(ppnGap).not.toBe(dppPlusPpnGap) // the fixture actually tells them apart

    const w = await mountWorkspace('2027-02')
    // The summary strip's last column is Tax difference.
    const cell = w.findAll('.vr-sum').at(-1)!
    expect(cell.find('.vr-sum-value').text()).toBe(formatIDR(ppnGap))
    w.unmount()
  })
})

describe('2 — The list follows the filter, the summary does not (US-020 AC-04)', () => {
  it('searching narrows the Matched table to one row; the summary is unchanged', async () => {
    const w = await mountWorkspace('2027-02', 'Matched')
    const summaryBefore = w.findAll('.vr-sum-value').map(c => c.text())
    const one = pairsForPeriod('2027-02', 'output').find(p => p.match === 'matched' && p.erp)!
    await w.find('.filter-search-input').setValue(one.erp!.ref)
    await flushPromises()
    expect(w.findAll('tbody tr').filter(r => r.text().includes(one.erp!.ref))).toHaveLength(1)
    expect(w.findAll('tbody tr').filter(r => r.find('.cell-link').exists())).toHaveLength(1)
    expect(w.findAll('.vr-sum-value').map(c => c.text())).toEqual(summaryBefore)
    w.unmount()
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

    // The return row lives on Not reconciled; parked, it carries the tag beside its status.
    const w = await mountWorkspace('2027-02', 'Not reconciled')
    const row = w.findAll('tbody tr').find(r => r.text().includes(returnRow().erp!.ref))!
    expect(row.find('.vr-status').html()).toContain('Waiting on buyer')
    w.unmount()

    await btn().trigger('click')
    expect(btn().text()).toBe('Waiting on buyer')
  })
})
