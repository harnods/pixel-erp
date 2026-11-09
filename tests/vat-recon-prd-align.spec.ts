// @vitest-environment happy-dom
/**
 * VAT reconciliation — PRD alignment (OD-001 v1.0, FE tickets VR-3…VR-7), 2026-11-05.
 *
 *  US-016 AC-07/08  per-period Accounts used; Re-run warns when setup changed
 *  US-002 AC-01     Re-run shows "Reconciling…", then "from X → Y" on moved rows
 *  US-020 AC-03/04  footer counts — view-level "Showing", period-level counts
 *  US-019           Changed since reconciled — a flag, never a status; Re-run clears it
 *  US-003           duplicate reference picker, latest pengganti Suggested
 *  US-013           Remarks — reason + notes ≤ 500, row icon
 *  §5.1 row 13      not-approved faktur: Draft in To match, Batal/Rejected filter-only
 *  VR-4 / VR-6      no NPWP in row detail; no free-text reason on manual match
 *
 * The order of the describes matters: a Re-run is module state, so the
 * period-level checks that need the un-run seeds come first.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, computed, reactive, watch, watchEffect, onMounted, onUnmounted, nextTick, inject, provide, useSlots } from 'vue'
import { useTableState } from '~/composables/useTableState'
import {
  pairsForPeriod, candidatesFor, undoManualMatch, manualMatchOf, footerCounts, setWaitingOnBuyer,
  saveVatSetup, periodAccountCodes, periodSetupChange, runPeriod, reconPeriodRows,
  changedSinceReconciled, periodChangeCount, canRemark, saveRemark, remarkOf, REMARK_MAX_CHARS,
  hiddenNotApprovedFor, isNotApproved, workspaceTabRows, compareFields, RERUN_SIMULATED_MS,
  outputPairs, reconTotals, SIDE_LABELS, type ReconPair,
} from '~/data/vatReconciliation'
import { AIRENE_SUGGEST_ENABLED } from '~/data/vatReconFlags'

const route = { query: { masa: '2027-02', tab: 'To match' } as Record<string, string> }
vi.stubGlobal('useRoute', () => route)
vi.stubGlobal('useRouter', () => ({ push: vi.fn(), replace: vi.fn() }))
vi.stubGlobal('useLocale', () => ({ t: (s: string) => s }))
vi.stubGlobal('useNavigation', () => ({ currentPageKey: ref('Faktur keluaran') }))
vi.stubGlobal('useTaxSubmissionPermission', () => ({ canSubmitTaxDocument: ref(true), setCanSubmitTaxDocument: vi.fn() }))
for (const [k, v] of Object.entries({ ref, computed, reactive, watch, watchEffect, onMounted, onUnmounted, nextTick, inject, useSlots, useTableState })) vi.stubGlobal(k, v)
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

// The current setup: the default chart's VAT Out account only.
saveVatSetup({ outputAccountCodes: ['2-20500'] })

async function mountWorkspace(masa: string, tab = 'To match') {
  route.query = { masa, tab }
  const { default: Page } = await import('~/components/pages/VatReconciliationWorkspacePage.vue')
  const Host = { setup() { provide('vatFinalize', ref(0)); return {} }, components: { Page }, template: '<Page />' }
  const w = mount(Host, { attachTo: document.body, global: { stubs: { NuxtLink: { template: '<a><slot /></a>' } } } })
  await flushPromises()
  return w
}
type W = Awaited<ReturnType<typeof mountWorkspace>>
const bodyButtons = (label: string) =>
  [...document.body.querySelectorAll('button')].filter(b => b.textContent?.trim() === label)
async function clickRerun(w: W) {
  await w.find('[data-test-id="vr-rerun"]').trigger('click')
  await flushPromises()
}
/** Lets the simulated Re-run finish. */
async function finishRerun() {
  vi.advanceTimersByTime(RERUN_SIMULATED_MS + 10)
  vi.useRealTimers()
  await flushPromises()
}

const dup = outputPairs.find(p => p.match === 'duplicate-reference')!
afterEach(() => { vi.useRealTimers(); undoManualMatch(dup.id) })

describe('US-019 — changed since reconciled (before any Re-run of 01/2027)', () => {
  it('flags two 01/2027 rows; the index row counts them; status is untouched', () => {
    const flagged = pairsForPeriod('2027-01', 'output').filter(p => changedSinceReconciled(p))
    expect(flagged.map(p => p.id)).toEqual(['2027-01-output-03', '2027-01-output-07'])
    for (const p of flagged) expect(p.match).toBe('matched')
    const row = reconPeriodRows().find(r => r.periodId === '2027-01' && r.side === 'output')!
    expect(row.changes).toBe(2)
    expect(row.status).toBe('reconciled')
  })

  it('the Matched table shows the tag on both rows', async () => {
    const w = await mountWorkspace('2027-01', 'Matched')
    expect(w.findAll('[data-test-id="vrk-changed"]').length).toBe(2)
    w.unmount()
  })

  it('Re-run clears the flag and re-evaluates: one row stays Reconciled, one becomes Invoice edited', () => {
    runPeriod('2027-01')
    const pairs = pairsForPeriod('2027-01', 'output')
    expect(pairs.some(p => changedSinceReconciled(p))).toBe(false)
    expect(periodChangeCount('2027-01')).toBe(0)
    expect(pairs.find(p => p.id === '2027-01-output-03')!.match).toBe('matched')
    expect(pairs.find(p => p.id === '2027-01-output-07')!.match).toBe('invoice-edited')
    expect(reconPeriodRows().find(r => r.periodId === '2027-01')!.status).toBe('partially reconciled')
  })
})

describe('US-016 — Accounts used + Re-run warning when setup changed', () => {
  it('11/2026 ran with a different account set than the current setup', () => {
    expect(periodAccountCodes('2026-11')).toEqual(['2-20500', '2-20200'])
    expect(periodSetupChange('2026-11')).toEqual({ was: ['2-20500', '2-20200'], now: ['2-20500'] })
    expect(periodSetupChange('2026-12')).toBeNull()
  })

  it('header shows Last sync and Accounts used; Cancel does nothing; Confirm re-runs with the current setup', async () => {
    const w = await mountWorkspace('2026-11', 'Matched')
    const meta = w.find('[data-test-id="vr-meta"]').text()
    expect(meta).toContain('Last sync:')
    expect(meta).toContain('Accounts used:')
    expect(w.find('[data-test-id="vr-accounts-used"]').text()).toContain('2-20200')

    await clickRerun(w)
    expect(document.body.textContent).toContain('Account setup changed since this period was reconciled.')
    expect(document.body.textContent).toMatch(/Was: .*2-20200.*Now: .*2-20500/)
    bodyButtons('Cancel').at(-1)!.click()
    await flushPromises()
    expect(w.find('[data-test-id="vr-reconciling"]').exists()).toBe(false)
    expect(periodAccountCodes('2026-11')).toEqual(['2-20500', '2-20200'])

    await clickRerun(w)
    vi.useFakeTimers()
    bodyButtons('Re-run').at(-1)!.click()
    await nextTick()
    expect(w.find('[data-test-id="vr-reconciling"]').text()).toContain('Reconciling…')
    await finishRerun()
    expect(w.find('[data-test-id="vr-reconciling"]').exists()).toBe(false)
    expect(periodAccountCodes('2026-11')).toEqual(['2-20500'])
    expect(periodSetupChange('2026-11')).toBeNull()
    expect(w.find('[data-test-id="vr-accounts-used"]').text()).not.toContain('2-20200')
    w.unmount()
  })
})

describe('US-020 — footer counts', () => {
  it('"Showing" follows search; the four counts stay period-level; waiting rows leave need review', async () => {
    const w = await mountWorkspace('2027-02', 'To match')
    const pairs = pairsForPeriod('2027-02', 'output')
    const fc = footerCounts(pairs)
    const footer = () => w.find('[data-test-id="vr-footer"]').text().replace(/\s+/g, ' ')
    const shown = w.findAll('.vr-item').length
    expect(footer()).toContain(`Showing ${shown} of ${pairs.length} pairs`)
    expect(footer()).toContain(`${fc.matched} matched · ${fc.review} need review · ${fc.unmatched} unmatched · ${fc.waiting} waiting on buyer`)

    await w.find('.filter-search-input').setValue('Erajaya')
    await flushPromises()
    expect(footer()).toContain(`Showing 1 of ${pairs.length} pairs`)
    expect(footer()).toContain(`${fc.matched} matched · ${fc.review} need review`)

    const ret = pairs.find(p => p.match === 'return-not-reflected')!
    setWaitingOnBuyer(ret, true)
    await flushPromises()
    expect(footer()).toContain(`${fc.review - 1} need review · ${fc.unmatched} unmatched · ${fc.waiting + 1} waiting on buyer`)
    setWaitingOnBuyer(ret, false)
    w.unmount()
  })
})

describe('US-002 AC-01 — Re-run shows what moved', () => {
  it('02/2027: invoice 40153 goes from Date order → Reconciled, shown on the row until reload', async () => {
    expect(pairsForPeriod('2027-02', 'output').find(p => p.id === 'o-13')!.match).toBe('faktur-predates')
    const w = await mountWorkspace('2027-02', 'Matched')
    expect(w.findAll('[data-test-id="vrk-change"]').length).toBe(0)
    vi.useFakeTimers()
    await clickRerun(w) // setup unchanged for 02/2027 → no warning, runs straight away
    expect(w.find('[data-test-id="vr-reconciling"]').exists()).toBe(true)
    await finishRerun()
    const changes = w.findAll('[data-test-id="vrk-change"]')
    expect(changes.length).toBe(1)
    expect(changes[0]!.text().replace(/\s+/g, ' ')).toBe('from Date order → Reconciled')
    w.unmount()
    // Client-side only: a fresh mount (≈ reload) keeps the new status, not the note.
    const again = await mountWorkspace('2027-02', 'Matched')
    expect(again.findAll('[data-test-id="vrk-change"]').length).toBe(0)
    again.unmount()
  })
})

describe('US-003 — duplicate reference picker', () => {
  it('lists every faktur; only the latest pengganti is Suggested', () => {
    const c = candidatesFor(dup)
    expect(c.length).toBe(2)
    expect(c.map(x => !!x.suggested)).toEqual([false, true])
  })

  it('✓ opens the picker; Select faktur reconciles the pair (manual) with the picked faktur', async () => {
    const w = await mountWorkspace('2027-02', 'To match')
    const item = () => w.find(`.vr-item[data-pair-id="${dup.id}"]`)
    await item().find('.vr-confirm').trigger('click')
    expect(manualMatchOf(dup.id)).toBeUndefined()
    const rows = item().findAll('.vr-dup-row')
    expect(rows.length).toBe(2)
    expect(rows[1]!.find('[data-test-id="vr-dup-suggested"]').exists()).toBe(true)
    expect(rows[0]!.find('[data-test-id="vr-dup-suggested"]').exists()).toBe(false)
    const pengganti = candidatesFor(dup)[1]!
    await rows[1]!.findAll('button').find(b => b.text() === 'Select faktur')!.trigger('click')
    await flushPromises()
    const after = pairsForPeriod('2027-02', 'output').find(p => p.id === dup.id)!
    expect(after.match).toBe('matched')
    expect(after.matchedBy).toBe('manual')
    expect(after.djp!.ref).toBe(pengganti.ref)
    w.unmount()
  })
})

describe('US-013 — Remarks', () => {
  it('offered on every row except Reconciled (auto)', () => {
    const pairs = pairsForPeriod('2026-12', 'output')
    const auto = pairs.find(p => p.match === 'matched' && p.matchedBy === 'auto')!
    const manual = pairs.find(p => p.match === 'matched' && p.matchedBy === 'manual')!
    expect(canRemark(auto)).toBe(false)
    expect(canRemark(manual)).toBe(true)
    expect(canRemark(outputPairs.find(p => p.match === 'invoice-edited')!)).toBe(true)
  })

  it('validates reason and length at the data layer', () => {
    const p = outputPairs.find(x => x.match === 'invoice-voided')!
    expect(saveRemark(p, 'Because', 'x')).toBe(false)
    expect(saveRemark(p, 'Timing', 'x'.repeat(REMARK_MAX_CHARS + 1))).toBe(false)
    expect(saveRemark(p, 'Timing', 'x'.repeat(REMARK_MAX_CHARS))).toBe(true)
    expect(saveRemark(p, 'Rounding', 'Rp1 rounding on PPN')).toBe(true)
    expect(remarkOf(p)).toMatchObject({ reason: 'Rounding', text: 'Rp1 rounding on PPN' })
  })

  it('the row shows a remark icon with reason + text', async () => {
    const w = await mountWorkspace('2027-02', 'Not reconciled')
    const icon = w.find('[data-test-id="vrk-remark"]')
    expect(icon.exists()).toBe(true)
    expect(icon.attributes('aria-label')).toBe('Remarks: Rounding: Rp1 rounding on PPN')
    w.unmount()
  })

  it('modal: Save is never disabled — over 500 it errors inline and saves nothing; missing reason errors inline', async () => {
    const { default: Modal } = await import('~/components/patterns/VatReconciliationRemarkModal.vue')
    const pair = outputPairs.find(x => x.match === 'faktur-predates')! as ReconPair
    const w = mount(Modal, { attachTo: document.body, props: { isOpen: true, pair, rowRef: 'X' } })
    await flushPromises()
    const save = () => document.body.querySelector('[data-test-id="vrm-save"]') as HTMLButtonElement
    const textarea = document.body.querySelector('#vrm-text') as HTMLTextAreaElement
      ?? document.body.querySelector('textarea') as HTMLTextAreaElement
    textarea.value = 'x'.repeat(REMARK_MAX_CHARS + 1)
    textarea.dispatchEvent(new Event('input'))
    await flushPromises()
    expect(document.body.querySelector('[data-test-id="vrm-count"]')!.textContent).toContain(`${REMARK_MAX_CHARS + 1} / ${REMARK_MAX_CHARS}`)
    expect(save().disabled).toBe(false)
    expect(document.body.textContent).not.toContain('Notes can be up to 500 characters.')
    save().click() // rule/btn-no-disabled-validation: pressing it explains
    await flushPromises()
    expect(document.body.textContent).toContain('Notes can be up to 500 characters.')
    expect(remarkOf(pair)).toBeUndefined()

    textarea.value = 'ok'
    textarea.dispatchEvent(new Event('input'))
    await flushPromises()
    expect(document.body.textContent).not.toContain('Notes can be up to 500 characters.')
    expect(save().disabled).toBe(false)
    save().click()
    await flushPromises()
    expect(document.body.textContent).toContain('Select a reason.')
    expect(remarkOf(pair)).toBeUndefined()
    w.unmount()
  })
})

describe('§5.1 row 13 — not-approved faktur placement (03/2027)', () => {
  const pairs = () => pairsForPeriod('2027-03', 'output')

  it('Draft, no SI: in To match, Coretax side only, excluded from matching', () => {
    const draft = pairs().find(p => p.id === '2027-03-output-x1')!
    expect(draft.erp).toBeNull()
    expect(draft.djp!.coretaxStatus).toBe('Draft')
    // Its own status — never "Transaction not found", which is for an Approved faktur.
    expect(draft.match).toBe('not-approved')
    expect(isNotApproved(draft)).toBe(true)
    expect(candidatesFor(draft)).toEqual([])
    expect(workspaceTabRows(pairs(), 'To match').some(p => p.id === draft.id)).toBe(true)
    // ...and nothing proposes it as a counterpart either
    for (const p of pairs()) expect(candidatesFor(p).some(c => c.pairId === draft.id)).toBe(false)
  })

  it('Batal, no SI: in no tab and no count — only the Not approved filter lists it', () => {
    const hidden = hiddenNotApprovedFor('2027-03', 'output')
    expect(hidden.map(p => p.djp!.coretaxStatus)).toEqual(['Batal'])
    expect(pairs().some(p => p.id === hidden[0]!.id)).toBe(false)
  })

  it('not-approved faktur are in none of the footer counts and none of the faktur totals', () => {
    const all = pairs()
    const drafts = all.filter(isNotApproved)
    expect(drafts.length).toBe(1)
    const fc = footerCounts(all)
    expect(fc.unmatched).toBe(all.filter(p => p.match === 'not-in-coretax' || p.match === 'no-match-in-erp').length)
    expect(fc.matched + fc.review + fc.unmatched + fc.waiting).toBe(all.length - drafts.length)
    // The Coretax column counts Approved tax documents only — the Draft one is out.
    const approved = all.filter(p => p.djp && p.djp.approved !== false)
    expect(reconTotals(all, 'djp').count).toBe(approved.length)
    expect(reconTotals(all, 'djp').total).toBe(approved.reduce((a, p) => a + p.djp!.total, 0))
    const row = reconPeriodRows().find(r => r.periodId === '2027-03')!
    expect(row.djpCount).toBe(approved.length)
    expect(row.selisih).toBe(Math.abs(row.erpAmount - row.djpAmount))
  })

  it('02/2027: the Draft faktur (o-16) is out of the Coretax totals', () => {
    const live = pairsForPeriod('2027-02', 'output')
    const o16 = live.find(p => p.id === 'o-16')!
    expect(o16.match).toBe('not-approved')
    const approved = live.filter(p => p.djp && p.djp.approved !== false)
    expect(reconTotals(live, 'djp').count).toBe(approved.length)
    expect(reconTotals(live, 'djp').total).toBe(approved.reduce((a, p) => a + p.djp!.total, 0))
  })

  it('in the UI: Draft row tagged Not approved; Batal row appears only under the filter', async () => {
    const { default: ErpFilterSelect } = await import('~/components/patterns/ErpFilterSelect.vue')
    const w = await mountWorkspace('2027-03', 'To match')
    const draftRow = w.find('.vr-item[data-pair-id="2027-03-output-x1"]')
    expect(draftRow.exists()).toBe(true)
    expect(draftRow.find('[data-test-id="vr-not-approved"]').exists()).toBe(true)
    expect(draftRow.text()).toContain('Draft')
    expect(draftRow.find('.vr-state').exists()).toBe(false) // no red status label
    expect(draftRow.text()).not.toContain('Transaction not found')
    expect(w.find('.vr-item[data-pair-id="2027-03-output-x2"]').exists()).toBe(false)

    const filter = w.findAllComponents(ErpFilterSelect).find(c => c.attributes('id') === 'vr-status-filter' || c.props('options'))!
    const opts = filter.props('options') as { value: string; label: string }[]
    expect(opts.find(o => o.value === 'not-approved')!.label).toBe('Not approved (2)')
    filter.vm.$emit('update:modelValue', 'not-approved')
    await flushPromises()
    const ids = w.findAll('.vr-item').map(i => i.attributes('data-pair-id'))
    expect(ids.sort()).toEqual(['2027-03-output-x1', '2027-03-output-x2'])
    const batal = w.find('.vr-item[data-pair-id="2027-03-output-x2"]')
    expect(batal.text()).toContain('Batal')
    expect(batal.find('[data-test-id="vr-not-approved"]').exists()).toBe(true)
    expect(batal.find('.vr-state').exists()).toBe(false)
    w.unmount()
  })

})

describe('Naming — the workspace is "VAT Out"', () => {
  it('the output side is titled VAT Out (index Invoice type, context labels)', () => {
    expect(SIDE_LABELS.output.title).toBe('VAT Out')
  })

  it('the title bar, document title and Indonesian copy say VAT Out / PPN Keluaran', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const slug = readFileSync(resolve(__dirname, '..', 'app/pages/[...slug].vue'), 'utf8')
    expect(slug).toMatch(/'Faktur keluaran':\s*\{[^}]*title: 'VAT Out'/)
    const { ID_TRANSLATIONS } = await import('~/data/translations')
    expect(ID_TRANSLATIONS['VAT Out']).toBe('PPN Keluaran')
  })
})

describe('Sides are Transaction / Tax document — no Coretax or ERP side names', () => {
  it('status labels and summary labels use the new names', async () => {
    const { MATCH_META } = await import('~/data/vatReconciliation')
    expect(MATCH_META['not-in-coretax'].chipLabel).toBe('Tax document not found')
    expect(MATCH_META['no-match-in-erp'].chipLabel).toBe('Transaction not found')
    expect([SIDE_LABELS.output.kpiErpDpp, SIDE_LABELS.output.kpiDjpDpp, SIDE_LABELS.output.kpiErpPpn, SIDE_LABELS.output.kpiDjpPpn])
      .toEqual(['Transaction DPP', 'Tax document DPP', 'Transaction PPN', 'Tax document PPN'])
    for (const m of Object.values(MATCH_META)) expect(`${m.label} ${m.longLabel} ${m.chipLabel}`).not.toMatch(/Coretax|\bERP\b/)
  })

  it('no reason a period shows names Coretax or ERP', () => {
    for (const per of ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03']) {
      for (const p of [...pairsForPeriod(per, 'output'), ...hiddenNotApprovedFor(per, 'output')]) {
        expect(p.reason ?? '', p.id).not.toMatch(/Coretax|\bERP\b/)
      }
    }
  })

  it('the workspace, an expanded row and the drawer never say Coretax or ERP', async () => {
    const w = await mountWorkspace('2027-02', 'To match')
    const item = w.find(`.vr-item[data-pair-id="${dup.id}"]`)
    await item.find('.vr-line').trigger('click')
    expect(item.text()).toContain('Transaction')
    expect(item.text()).toContain('Tax document')
    await item.findAll('button').find(b => b.text() === 'Find another tax document')!.trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('View tax document')
    expect(document.body.textContent).not.toMatch(/Coretax|\bERP\b|From ERP/)
    const sums = w.findAll('.vr-sum-label').map(x => x.text())
    expect(sums.slice(0, 4)).toEqual(['Transaction DPP', 'Tax document DPP', 'Transaction PPN', 'Tax document PPN'])
    w.unmount()
  })
})

describe('VR-4 / VR-6 / P2 removals', () => {
  it('no NPWP in the row detail fields', () => {
    expect(compareFields('output').map(f => f.key)).not.toContain('npwp')
  })

  it('the page-level "Review with Airene" button is gone (Airene suggests per row, US-014)', async () => {
    expect(AIRENE_SUGGEST_ENABLED).toBe(true)
    const w = await mountWorkspace('2027-02', 'To match')
    expect(w.find('#vr-airene-review').exists()).toBe(false)
    w.unmount()
  })
})
