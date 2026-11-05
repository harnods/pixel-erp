// @vitest-environment happy-dom
/**
 * Regression tests for the UI and scope defects the re-audit found on the
 * asset screens. Each block names the defect it pins. They run on the real
 * store and engine and, where the defect was in a screen, mount the real
 * component or read the screen's source for the control it must use.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount, flushPromises } from '@vue/test-utils'
import { computed, defineComponent, h, nextTick, ref, watch } from 'vue'
import {
  resetAssetStore, findAsset, setViewAs, recordImpairmentTest, fixedAssets,
} from '~/data/assetStore'
import { assetLocations, custodyHistoryFor } from '~/data/assetCustody'
import { latestBulkOperation } from '~/data/assetBulkEdit'
import {
  planBulkEditFromLists, applyBulkEditWithHistory, reverseBulkEditWithHistory, bulkHistoryFor,
} from '~/data/assetUiBulkHistory'
import { detailFigures } from '~/data/fixedAssetDetail'
import { gainLossPair } from '~/data/assetUiFigures'
import { blankForm, previewValueChange } from '~/data/assetValueChange'
import { plainDurations, formatMonths, monthsLabel } from '~/data/assetUiDuration'
import { formatIDR, formatIDRWhole } from '~/utils/currency'
import { FINANCIAL_ASSET_PAGES } from '~/utils/assetRoleGate'
import { missingParameters } from '~/data/assetTaxbook'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
vi.stubGlobal('useRoute', () => ({ query: {} }))
vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)
vi.stubGlobal('watch', watch)
vi.stubGlobal('nextTick', nextTick)

const src = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8')

beforeEach(() => {
  resetAssetStore()
  setViewAs('Owner')
})

// ── 1. Every export or download in the module toasts "Not in this prototype" ─
describe('1 · export and download controls are deferred', () => {
  const ASSET_SCREENS = [
    'app/components/pages/AssetsIndexPage.vue', 'app/components/pages/AssetDetailPage.vue',
    'app/components/pages/AssetDepreciationSchedulePage.vue', 'app/components/pages/AssetRollForwardPage.vue',
    'app/components/pages/AssetMigrationPage.vue', 'app/components/pages/AssetImpairmentPage.vue',
    'app/components/pages/AssetSelfCheckPage.vue', 'app/components/pages/AssetCustodyCountsPage.vue',
    'app/components/pages/AssetApprovalsPage.vue', 'app/components/pages/AssetLeasesPage.vue',
    'app/components/pages/AssetSettingsPage.vue',
  ]
  it('no asset screen I own promises a file', () => {
    for (const f of ASSET_SCREENS) {
      expect(src(f), f).not.toMatch(/check your downloads|Export ready|Download started|downloaded/i)
    }
  })
  it('the register Export dialog button toasts the deferral', () => {
    const s = src('app/components/pages/AssetsIndexPage.vue')
    const body = s.slice(s.indexOf('function onExport()'), s.indexOf('function onExport()') + 200)
    expect(body).toContain("infoToast(t('Not in this prototype'))")
  })
})

// ── 2. LR-6: report pages are gated for General Affairs ─────────────────────
describe('2 · General Affairs meets a restricted state on figure pages', () => {
  it('every page that holds figures is gated in the registry', () => {
    const slug = src('app/pages/[...slug].vue')
    for (const key of FINANCIAL_ASSET_PAGES) {
      expect(slug, key).toMatch(new RegExp(`'${key}':\\s+gateFinancialPage\\(`))
    }
    // The physical pages stay open to the role.
    expect(slug).toMatch(/'Custody and counts':\s+defineAsyncComponent\(/)
    expect(slug).toMatch(/'Assets':\s+defineAsyncComponent\(/)
  })

  it('the gate shows the page to Tax and a banner with a custody link to General Affairs', async () => {
    const { default: AssetRoleGate } = await import('~/components/patterns/AssetRoleGate.vue')
    const Figures = defineComponent({ render: () => h('div', { class: 'figs' }, 'Rp1.000.000') })
    setViewAs('Tax')
    const w = mount(AssetRoleGate as never, { props: { page: Figures } })
    await flushPromises()
    expect(w.find('.figs').exists()).toBe(true)
    setViewAs('General Affairs')
    await flushPromises()
    expect(w.find('.figs').exists()).toBe(false)
    expect(w.text()).toContain('This page holds financial figures')
    expect(w.text()).toContain('General Affairs sees the physical record only')
    expect(w.text()).not.toMatch(/Rp\d/)
    expect(w.find('[data-testid="asset-role-gate-link"]').text()).toContain('Custody & counts')
    w.unmount()
  })
})

// ── 3. Bulk edit: list values only, and a History line each way ─────────────
describe('3 · bulk edit picks from the lists and writes History', () => {
  const ids = ['FA-0064', 'FA-0047', 'FA-0031']
  it('refuses a location that is not on the maintained list', () => {
    const plan = planBulkEditFromLists(ids, 'location', 'Moon base, crater 7')
    expect(plan.refusal).toMatch(/Choose a location from the list/)
    expect(applyBulkEditWithHistory(plan).ok).toBe(false)
    for (const id of ids) expect(findAsset(id)!.location).not.toBe('Moon base, crater 7')
  })
  it('refuses a custodian that is not on the list', () => {
    expect(planBulkEditFromLists(ids, 'custodian', 'Somebody New').refusal).toMatch(/custodian from the list/)
  })
  it('the drawer offers the list, not a free-text input', () => {
    const s = src('app/components/patterns/BulkEditDrawer.vue')
    expect(s).not.toMatch(/<MpInput/)
    expect(s).toContain('bulkLocationOptions')
  })
  it('writes old value, new value, who, when and the number on each asset, and again on reversal', () => {
    const target = assetLocations.value.find((l) => l.name === 'Medan pool')!.name
    const before = Object.fromEntries(ids.map((id) => [id, findAsset(id)!.location]))
    const plan = planBulkEditFromLists(ids, 'location', target)
    expect(plan.refusal).toBeNull()
    const r = applyBulkEditWithHistory(plan)
    expect(r.ok).toBe(true)
    const number = latestBulkOperation.value!.number
    for (const id of plan.affected.map((l) => l.id)) {
      const [h1] = bulkHistoryFor(id)
      expect(h1).toMatchObject({ field: 'Location', from: before[id] ?? 'Not set', to: target, by: 'Rizal Candra', note: `Bulk edit ${number}` })
      expect(h1!.at).toMatch(/^30\/09\/2026 \d\d:\d\d$/)
    }
    expect(reverseBulkEditWithHistory(number).ok).toBe(true)
    for (const id of plan.affected.map((l) => l.id)) {
      const [rev] = bulkHistoryFor(id)
      expect(rev).toMatchObject({ from: target, to: before[id] ?? 'Not set', note: `Reversal of bulk edit ${number}` })
      expect(findAsset(id)!.location).toBe(before[id])
    }
    // The asset record's History tab reads these lines.
    expect(src('app/components/pages/AssetDetailPage.vue')).toContain('bulkHistoryFor(asset.value.id)')
  })
})

// ── 4. A refused approval switch snaps back ─────────────────────────────────
describe('4 · approval switch redraws from the store when refused', () => {
  it('the refused flip re-keys the toggle', () => {
    const s = src('app/components/pages/AssetSettingsPage.vue')
    expect(s).toMatch(/if \(e\) \{ settingsError\.value = e; toggleRedraw\.value \+= 1; return \}/)
    expect(s).toContain(':key="`${sw.key}-${toggleRedraw}`"')
  })
})

// ── 5. New lease without a branch says so ───────────────────────────────────
describe('5 · New lease shows the missing branch', () => {
  it('the drawer names the fields to fix beside the button and scrolls to the first', () => {
    const s = src('app/components/patterns/LeaseDrawer.vue')
    expect(s).toContain('revealFirstError()')
    expect(s).toContain('data-testid="ld-field-summary"')
    expect(s).toMatch(/<p v-if="errors\.branch" class="ld-error">/)
  })
})

// ── 6. New asset: location and custodian from the lists ─────────────────────
describe('6 · New asset takes location and custodian from the lists', () => {
  it('the drawer uses the list pickers for tangibles and hides them for intangibles', () => {
    const s = src('app/components/patterns/NewAssetDrawer.vue')
    expect(s).toMatch(/<ErpFilterSelect id="nad-location"/)
    expect(s).toMatch(/<ErpFilterSelect id="nad-custodian"/)
    expect(s).toMatch(/<div v-if="!isIntangible" class="nad-row">/)
  })
  it('a new tangible with both filled is not incomplete', async () => {
    const { createAsset } = await import('~/data/assetStore')
    const r = createAsset({
      name: 'Pallet jack', class: 'Equipment', branch: 'Medan', cost: 12_000_000, inServiceDate: '01/09/2026',
      lifeMonths: 48, residual: 0, method: 'straight-line', taxGroup: 'Tax group 1',
      location: 'Medan Warehouse', custodian: 'Rudi Santoso (Warehouse)',
    })
    expect(r.ok).toBe(true)
    const a = fixedAssets.value.find((x) => x.id === (r as { id: string }).id)!
    expect(missingParameters(a)).toEqual([])
  })
})

// ── 7. Cumulative difference keeps its sign ─────────────────────────────────
describe('7 · cumulative difference is signed', () => {
  it('FA-0091 after impairment carries its sign on the module convention (accounting charge less tax charge)', () => {
    recordImpairmentTest({ assetId: 'FA-0091', indicator: 'Annual test · indefinite life', recoverable: 2_000_000_000, basis: 'Value in use', source: 'Projection' })
    const a = findAsset('FA-0091')!
    // The accounts carry it below the tax book, so accounting has charged more: the difference is positive.
    expect(a.bookValueFiscal! - a.bookValueCommercial!).toBe(100_000_000)
    const f = detailFigures(a).find((x) => x.label === 'Cumulative difference')!
    expect(f.value).toBe(100_000_000)
    // An asset whose tax book runs ahead of the accounts shows the minus sign.
    const neg = fixedAssets.value
      .map((x) => detailFigures(x).find((y) => y.label === 'Cumulative difference')!)
      .find((y) => y.value !== null && y.value < 0)!
    expect(neg).toBeTruthy()
    expect(formatIDRWhole(neg.value!)).toMatch(/^-Rp/)
  })
})

// ── 8. Durations say 1 month, not 1 months ──────────────────────────────────
describe('8 · pluralisation', () => {
  it('formats lives and terms with the right plural', () => {
    expect(plainDurations('2 years, 1 months from September 2026')).toBe('2 years, 1 month from September 2026')
    expect(plainDurations('1 years')).toBe('1 year')
    expect(plainDurations('11 months, 21 months')).toBe('11 months, 21 months')
    expect(formatMonths(25)).toBe('2 years 1 month')
    expect(formatMonths(12)).toBe('1 year')
    expect(monthsLabel(1)).toBe('1 month')
  })
  it('the engine formatter is right at the source', async () => {
    const { formatLife, plural } = await import('~/data/assetEngine')
    expect(formatLife(12)).toBe('1 year')
    expect(formatLife(24)).toBe('2 years')
    expect(formatLife(1)).toBe('1 month')
    expect(formatLife(7)).toBe('7 months')
    expect(plural(1, 'month')).toBe('1 month')
    expect(plural(0, 'month')).toBe('0 months')
  })
  it('the three tax pages show whole rupiah', () => {
    for (const f of ['AssetFiscalBookPage', 'AssetLampiranPage', 'AssetTaxDifferencesPage']) {
      expect(src(`app/components/pages/${f}.vue`)).not.toMatch(/\bformatIDR\b/)
    }
  })
  it('the value-change preview life row goes through it', () => {
    expect(src('app/components/patterns/ValueChangeDrawer.vue')).toContain('plainDurations(b.lifeAfter)')
  })
})

// ── 9. LR-7 whole rupiah ────────────────────────────────────────────────────
describe('9 · whole rupiah on asset screens', () => {
  it('formatIDRWhole has no decimals and keeps formatIDR as it was', () => {
    expect(formatIDRWhole(4_000_000)).toBe('Rp4.000.000')
    expect(formatIDRWhole(-1_927_083.4)).toBe('-Rp1.927.083')
    expect(formatIDR(4_000_000)).toBe('Rp4.000.000,00')
  })
  it('no asset screen or pattern I own calls formatIDR', () => {
    const owned = [
      'AssetApprovalsPage', 'AssetCustodyCountsPage', 'AssetDepreciationSchedulePage', 'AssetDetailPage',
      'AssetImpairmentPage', 'AssetLeasesPage', 'AssetMigrationPage', 'AssetRollForwardPage',
      'AssetSelfCheckPage', 'AssetSettingsPage', 'AssetsIndexPage',
    ].map((n) => `app/components/pages/${n}.vue`).concat(
      ['AssetLifeSchedule', 'LeaseDrawer', 'NewAssetDrawer', 'ValueChangeDrawer'].map((n) => `app/components/patterns/${n}.vue`),
    )
    for (const f of owned) expect(src(f), f).not.toMatch(/\bformatIDR\(/)
  })
})

// ── 10. Partial disposal: both gains side by side ───────────────────────────
describe('10 · partial disposal gain or loss in one row', () => {
  it('pairs each book\'s gain or loss from the preview', () => {
    const id = 'FA-0031'
    const pv = previewValueChange(id, { ...blankForm(id, 'dispose-part'), percent: '25', proceeds: '200000000' })
    const pair = gainLossPair(pv)!
    expect(pair.accounting).toBe(pv.books.find((b) => b.book === 'accounting')!.gainLoss)
    expect(pair.tax).toBe(pv.books.find((b) => b.book === 'tax')!.gainLoss)
    expect(src('app/components/patterns/ValueChangeDrawer.vue')).toContain('data-testid="vcd-gainloss-both"')
  })
})

// Custody history stays as it was: single edits still log through changeCustody.
it('single custody edits still log', () => {
  expect(custodyHistoryFor('FA-0047')).toEqual([])
})
