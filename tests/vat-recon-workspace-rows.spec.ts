// @vitest-environment happy-dom
/**
 * VAT reconciliation workspace — bank-reconciliation style rows.
 *
 * Rows are grouped by date (newest first), each pair is one compact line with
 * the tax-document actions on it, detail opens inline, and the round ✓ means
 * "reconciled" (filled) or "confirm match" (outline) — pressed without a pick
 * it asks inline instead of being disabled.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, computed, reactive, watch, onMounted, onUnmounted, nextTick, inject } from 'vue'
import { groupPairsByDate, pairsForPeriod, reconDateValue, candidatesFor, outputPairs } from '~/data/vatReconciliation'

const route = { query: { masa: '2027-03', tab: 'All faktur' } as Record<string, string> }
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
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

async function mountWorkspace(masa: string) {
  route.query = { masa, tab: 'All faktur' }
  const { default: Page } = await import('~/components/pages/VatReconciliationWorkspacePage.vue')
  const wrapper = mount(Page, { global: { stubs: { NuxtLink: { template: '<a><slot /></a>' } } } })
  await flushPromises()
  return wrapper
}

const lineFor = (wrapper: Awaited<ReturnType<typeof mountWorkspace>>, ref: string) =>
  wrapper.findAll('.vr-item').find(i => i.find('.vr-erp').text().includes(ref))!

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

describe('VatReconciliationWorkspacePage — rows', () => {
  it('renders date groups and collapses one', async () => {
    const w = await mountWorkspace('2027-03')
    const heads = w.findAll('.vr-group-head')
    expect(heads.length).toBeGreaterThan(1)
    const before = w.findAll('.vr-item').length
    await heads[0]!.trigger('click')
    expect(w.findAll('.vr-item').length).toBeLessThan(before)
  })

  it('a draft row carries Edit + Submit to DJP on the line, without expanding', async () => {
    const w = await mountWorkspace('2027-03')
    const row = lineFor(w, '40061')
    expect(row.find('.vr-detail').exists()).toBe(false)
    const labels = row.find('.vr-line').findAll('button').map(b => b.text())
    expect(labels).toContain('Edit tax document')
    expect(labels).toContain('Submit to DJP')
  })

  it('✓ on an open row with nothing picked opens the detail with an inline error', async () => {
    const w = await mountWorkspace('2027-03')
    const row = lineFor(w, '40103')
    await row.find('.vr-confirm').trigger('click')
    expect(row.find('.vr-detail').exists()).toBe(true)
    expect(row.find('.vr-pick-error').text()).toBe('Select a match first, then confirm.')
  })

  it('picking a candidate fills Selected total and zeroes the Difference', async () => {
    const w = await mountWorkspace('2027-03')
    const row = lineFor(w, '40103')
    await row.find('.vr-erp').trigger('click')
    await row.findAll('.vr-cand input')[0]!.setValue(true)
    await row.findAll('.vr-cand input')[0]!.trigger('change')
    expect(row.find('.vr-cand-sum .is-ok').exists()).toBe(true)
  })

  it('a matched row shows the filled reconciled ✓', async () => {
    const w = await mountWorkspace('2027-02')
    const matched = w.findAll('.vr-item').find(i => i.find('.vr-confirm.is-done').exists())
    expect(matched).toBeTruthy()
  })
})
