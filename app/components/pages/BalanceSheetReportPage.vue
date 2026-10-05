<!-- prod-parity: jurnal-frontend-app/src/pages/reports/balance_sheet/balance_sheet.vue -->
<script setup lang="ts">
/**
 * Balance sheet — Reports › Financials › Balance Sheet (/financial-report/balance-sheet).
 *
 * Prod structure: As of + Filter by period, Filter / More filters (drawer with
 * Compare by period · Periods · Ascending/Descending · Filter by account depth),
 * table density, full screen, Export. Table: Assets (Current assets, Fixed
 * assets, Depreciation & amortization, Other assets → Total assets) then
 * Liability & equity (Current liability, Long term liability → Total liability;
 * Equity incl. Earnings up to Last Period + Current Period Earnings → Total
 * equity → Total liability & equity). Account rows open the account's
 * transactions for the period (prod /accounts/:id?q[transaction_date_*]).
 *
 * Figures: financialStatements.ts → canonical COA ledger (asserts assets =
 * liabilities + equity and that Current Period Earnings = P&L net profit).
 */
import { MpIcon, MpTooltip, MpDatePicker, MpCheckbox, MpRadio, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpSkeleton, css } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import { useReportFullscreen } from '~/composables/useReportFullscreen'
import { formatIDR } from '~/utils/currency'
import { infoToast } from '~/utils/toasts'
import { loadCreated, saveCreated } from '~/data/persist'
import { SIM_TODAY_ISO } from '~/data/simClock'
import {
  bsReport, bsAssertTiesToPl, bsBuildDates, bsEachMonthDates, bsPeriodDate, bsPlMaxDepth, bsPlChangePct,
  bsPlAccountLink, bsPlLedgerStart, bsPlDayLabel, bsPlMonthLabel,
  BS_PERIOD_OPTIONS, BS_COMPARE_OPTIONS, BS_PL_COMPARE_COUNT_OPTIONS,
  type BsPeriodKey, type BsCompareBy, type BsPlAccountRow, type BsSection,
} from '~/data/financialStatements'

const { t } = useLocale()
const router = useRouter()

// ── Saved user settings (filters/columns only — the report itself is read-only) ──
interface BsSettings {
  period: BsPeriodKey; compareBy: BsCompareBy; compareCount: string; order: 'asc' | 'desc'
  depth: string; density: 'default' | 'compact'; showCode: boolean; showChange: boolean
}
const SETTINGS_KEY = 'bs-report-settings'
const DEFAULTS: BsSettings = { period: 'today', compareBy: '', compareCount: '0', order: 'desc', depth: '', density: 'default', showCode: true, showChange: true }
const saved = { ...DEFAULTS, ...(loadCreated<BsSettings>(SETTINGS_KEY)[0] ?? {}) }
const settings = reactive<BsSettings>(saved)
watch(settings, (v) => saveCreated(SETTINGS_KEY, [{ ...v }]), { deep: true })

// ── Filter bar ───────────────────────────────────────────────────────────────
const toDmy = (iso: string) => iso.split('-').reverse().join('/')
const toIso = (dmy: string) => dmy.split('/').reverse().join('-')
const isDmy = (s: string) => /^\d{2}\/\d{2}\/\d{4}$/.test(s)

const asOf = ref(toDmy(settings.period === 'custom' ? SIM_TODAY_ISO : bsPeriodDate(settings.period)))
const period = ref<BsPeriodKey>(settings.period)
const formError = ref('')
const periodOptions = computed(() => BS_PERIOD_OPTIONS.map(o => ({ value: o.value, label: t(o.label) })))

function onPeriod(v: string) {
  const key = (v || 'today') as BsPeriodKey
  period.value = key
  if (key !== 'custom') asOf.value = toDmy(bsPeriodDate(key))
  formError.value = ''
}
function onDate(v: string) {
  asOf.value = v
  formError.value = ''
  const iso = isDmy(v) ? toIso(v) : ''
  const match = BS_PERIOD_OPTIONS.find(o => o.value !== 'custom' && o.value !== 'this_financial_year' && bsPeriodDate(o.value) === iso)
  if (period.value !== 'this_financial_year' || iso !== bsPeriodDate('this_financial_year')) period.value = match?.value ?? 'custom'
}

// ── Applied state: idle → loading → ready (house report shell) ──────────────
interface Applied { asOf: string; period: BsPeriodKey; compareBy: BsCompareBy; count: number; order: 'asc' | 'desc' }
const applied = ref<Applied | null>(null)
const state = ref<'idle' | 'loading' | 'ready'>('idle')
let timer: ReturnType<typeof setTimeout> | null = null
onBeforeUnmount(() => { if (timer) clearTimeout(timer) })

function runFilter() {
  if (!isDmy(asOf.value)) { formError.value = t('You must fill in the date'); return }
  formError.value = ''
  settings.period = period.value
  applied.value = { asOf: toIso(asOf.value), period: period.value, compareBy: settings.compareBy, count: Number(settings.compareCount) || 0, order: settings.order }
  state.value = 'loading'
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { state.value = 'ready' }, 700)
}

// ── More filters drawer (prod BalanceSheetSidebar) ──────────────────────────
const drawerOpen = ref(false)
const draft = reactive({ asOf: '', period: 'today' as BsPeriodKey, compareBy: '' as BsCompareBy, compareCount: '0', order: 'desc' as 'asc' | 'desc', depth: '' })
const draftError = ref('')
function openDrawer() {
  Object.assign(draft, { asOf: asOf.value, period: period.value, compareBy: settings.compareBy, compareCount: settings.compareCount, order: settings.order, depth: settings.depth || String(maxDepth.value) })
  draftError.value = ''
  drawerOpen.value = true
}
function onDraftPeriod(v: string) {
  draft.period = (v || 'today') as BsPeriodKey
  if (draft.period !== 'custom') draft.asOf = toDmy(bsPeriodDate(draft.period))
}
function onDraftCompare(v: string) {
  draft.compareBy = v as BsCompareBy
  if (!v) draft.compareCount = '0'
  else if (draft.compareCount === '0') draft.compareCount = '1'
}
const compareOptions = computed(() => BS_COMPARE_OPTIONS.map(o => ({ value: o.value || 'none', label: t(o.label) })))
const countOptions = computed(() => (draft.compareBy === 'yearly' ? BS_PL_COMPARE_COUNT_OPTIONS.slice(0, 4) : BS_PL_COMPARE_COUNT_OPTIONS).map(o => ({ value: o.value, label: t(o.label) })))
function clearDrawer() {
  Object.assign(draft, { asOf: toDmy(SIM_TODAY_ISO), period: 'today', compareBy: '', compareCount: '0', order: 'desc', depth: String(maxDepth.value) })
  draftError.value = ''
}
function applyDrawer() {
  if (!isDmy(draft.asOf)) { draftError.value = t('You must fill in the date'); return }
  asOf.value = draft.asOf
  period.value = draft.period
  settings.compareBy = draft.compareBy
  settings.compareCount = draft.compareBy ? draft.compareCount : '0'
  settings.order = draft.order
  settings.depth = draft.depth
  drawerOpen.value = false
  runFilter()
}
const moreFilterActive = computed(() => !!settings.compareBy || (!!settings.depth && Number(settings.depth) < maxDepth.value))

// ── Report data ──────────────────────────────────────────────────────────────
const dates = computed<string[]>(() => {
  const a = applied.value
  if (!a) return []
  if (a.period === 'this_financial_year') return bsEachMonthDates(Number(a.asOf.slice(0, 4)), a.order === 'desc' ? 'desc' : 'asc')
  return bsBuildDates(a.asOf, a.compareBy, a.count, a.order)
})
const report = computed(() => (dates.value.length ? bsReport(dates.value) : null))
// Statements tie check for the as-of date (throws in dev if they ever drift).
watch(applied, (a) => { if (a) bsAssertTiesToPl(a.asOf) })

const isMonthly = computed(() => applied.value?.period === 'this_financial_year')
const headLabel = (d: string) => (isMonthly.value ? bsPlMonthLabel(d) : bsPlDayLabel(d))
const isCompare = computed(() => dates.value.length > 1)

const maxDepth = computed(() => {
  const r = report.value ?? bsReport([SIM_TODAY_ISO])
  return Math.max(...[...r.assets, ...r.liabilities, r.equity].map(s => bsPlMaxDepth(s.rows)))
})
const depthOptions = computed(() => Array.from({ length: maxDepth.value }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })))
const depthLimit = computed(() => Number(settings.depth) || maxDepth.value)

interface FlatRow { row: BsPlAccountRow; level: number }
function flatten(rows: BsPlAccountRow[]): FlatRow[] {
  const out: FlatRow[] = []
  const walk = (r: BsPlAccountRow) => { out.push({ row: r, level: r.level }); if (r.level < depthLimit.value) r.children.forEach(walk) }
  rows.forEach(walk)
  return out
}

// ── Columns / density ────────────────────────────────────────────────────────
const colVis = reactive<Record<string, boolean>>({ name: true, code: settings.showCode, change: settings.showChange })
watch(colVis, (v) => { settings.showCode = !!v.code; settings.showChange = !!v.change })
const columnItems = computed(() => [
  { key: 'name', label: t('Account name'), disabled: true },
  { key: 'code', label: t('Account code') },
  { key: 'change', label: t('Percentage change') },
])
const showChange = computed(() => isCompare.value && colVis.change)
const valueCols = computed(() => dates.value.length * (showChange.value ? 2 : 1))
const totalCols = computed(() => 1 + valueCols.value)

/** Money: negatives in parentheses, as prod's config_amount. */
function money(n: number): string { return n < 0 ? `(${formatIDR(Math.abs(n))})` : formatIDR(n) }
/** Prod percentage cell: change vs the next column (the earlier period when descending). */
function change(amounts: number[], i: number): { text: string; up: boolean } | null {
  const prevIdx = applied.value?.order === 'asc' ? i - 1 : i + 1
  const pct = bsPlChangePct(amounts[i]!, amounts[prevIdx])
  if (pct === null) return null
  const abs = Math.abs(pct)
  return { text: `${abs > 100 ? '>100' : abs.toFixed(1)}%`, up: pct > 0 }
}

function openAccount(row: BsPlAccountRow, colDate?: string) {
  const end = colDate ?? applied.value?.asOf ?? SIM_TODAY_ISO
  router.push(bsPlAccountLink(row.id, bsPlLedgerStart(), end))
}

const sections = computed(() => {
  const r = report.value
  if (!r) return null
  return { assets: r.assets, liabilities: r.liabilities, equity: r.equity }
})
const hasSectionRows = (s: BsSection) => s.rows.length > 0

// ── Full screen ──────────────────────────────────────────────────────────────
const fullscreen = ref(false)
const { isReportFullscreen } = useReportFullscreen()
watch(fullscreen, (v) => { isReportFullscreen.value = v })
onBeforeUnmount(() => { isReportFullscreen.value = false })

function notInPrototype() { infoToast(t('Not in this prototype')) }

const lastUpdated = computed(() => `${t('Last updated on')} ${bsPlDayLabel(SIM_TODAY_ISO)}`)
const notes = computed(() => t('Notes: Inventory account is calculated based on Average Cost method'))
</script>

<template>
  <div class="bsr" :class="{ 'bsr--full': fullscreen, 'bsr--compact': settings.density === 'compact' }">
    <header v-if="!fullscreen" class="bsr-titlebar">
      <div class="bsr-titlebar-left">
        <button class="bsr-breadcrumb" type="button" @click="router.push('/financial-report')">{{ t('Financials') }}</button>
        <h1 class="bsr-title">{{ t('Balance Sheet') }} <span class="bsr-title-cur">(IDR)</span></h1>
      </div>
    </header>

    <div class="bsr-stage">
      <!-- ── Filter area (prod filter-area.vue) ── -->
      <div v-if="!fullscreen" class="bsr-controls">
        <div class="bsr-controls-left">
          <div class="bsr-field">
            <label class="bsr-label" for="bsr-asof">{{ t('As of') }}</label>
            <MpDatePicker id="bsr-asof" :model-value="asOf" format="DD/MM/YYYY" value-type="format" use-portal :is-clearable="false" @update:model-value="onDate" />
          </div>
          <div class="bsr-field">
            <label class="bsr-label" for="bsr-period">{{ t('Filter by period') }}</label>
            <ErpFilterSelect id="bsr-period" :model-value="period" :placeholder="t('Filter by period')" :options="periodOptions" width="220px" :is-clearable="false" @update:model-value="onPeriod" />
          </div>
          <button class="btn-enterprise btn-enterprise--primary" type="button" @click="runFilter">{{ t('Filter') }}</button>
          <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" type="button" @click="openDrawer">
            <MpIcon name="filter" size="sm" /> {{ t('More filters') }}
            <span v-if="moreFilterActive" class="bsr-dot" />
          </button>
        </div>
        <div class="bsr-controls-right">
          <MpPopover id="bsr-density" use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <button class="bsr-icon-btn" type="button" :aria-label="t('Table density')"><MpIcon name="table-view-column" size="md" /></button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ width: '280px', padding: '16px' })">
              <p class="bsr-pop-title">{{ t('Density') }}</p>
              <label class="bsr-radio">
                <MpRadio id="bsr-density-default" name="bsr-density" value="default" :is-checked="settings.density === 'default'" @change="settings.density = 'default'" />
                <span><strong>{{ t('Default') }}</strong><br><span class="bsr-radio-desc">{{ t('This screen provides more space for transactions for ease of reading.') }}</span></span>
              </label>
              <label class="bsr-radio">
                <MpRadio id="bsr-density-compact" name="bsr-density" value="compact" :is-checked="settings.density === 'compact'" @change="settings.density = 'compact'" />
                <span><strong>{{ t('Compact') }}</strong><br><span class="bsr-radio-desc">{{ t('This screen loads more transactions on the screen, which is ideal for faster data checking.') }}</span></span>
              </label>
            </MpPopoverContent>
          </MpPopover>
          <ColumnSettingsMenu id="bsr-columns" :items="columnItems" :visibility="colVis" :tooltip="t('Column settings')" />
          <MpTooltip id="bsr-fs" :label="t('Full screen')" placement="bottom" use-portal>
            <button class="bsr-icon-btn" type="button" :aria-label="t('Full screen')" @click="fullscreen = true"><MpIcon name="full-screen" size="md" /></button>
          </MpTooltip>
          <MpPopover id="bsr-export" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <button class="btn-enterprise btn-enterprise--secondary bsr-export" type="button">{{ t('Export') }} <MpIcon name="caret-down" size="sm" /></button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content' })">
              <MpPopoverList>
                <MpPopoverListItem @click="notInPrototype">{{ t('PDF') }}</MpPopoverListItem>
                <MpPopoverListItem @click="notInPrototype">{{ t('XLS') }}</MpPopoverListItem>
                <MpPopoverListItem @click="notInPrototype">{{ t('CSV') }}</MpPopoverListItem>
                <MpPopoverListItem @click="notInPrototype">{{ t('Print') }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>
      <p v-if="!fullscreen && formError" class="bsr-error">{{ formError }}</p>

      <div class="bsr-report">
        <div v-if="fullscreen" class="bsr-fs-topbar">
          <span class="bsr-fs-title">{{ t('Balance Sheet') }} <span class="bsr-title-cur">(IDR)</span></span>
          <MpTooltip id="bsr-fs-exit" :label="t('Minimize')" placement="bottom-end" use-portal>
            <button class="bsr-icon-btn" type="button" :aria-label="t('Minimize')" @click="fullscreen = false"><MpIcon name="minimize" size="md" /></button>
          </MpTooltip>
        </div>

        <!-- Initial state -->
        <div v-if="state === 'idle'" class="bsr-empty">
          <img src="/illustrations/report-empty.png" alt="" class="bsr-empty-img" width="240" height="200" />
          <p class="bsr-empty-title">{{ t('Report data will appear here') }}</p>
          <p class="bsr-empty-desc">{{ t('Select a date, then click Filter button.') }}</p>
        </div>

        <!-- Loading -->
        <div v-else-if="state === 'loading'" class="bsr-table-wrap">
          <table class="bsr-table">
            <tbody>
              <tr v-for="n in 8" :key="n"><td class="bsr-td"><MpSkeleton class="bsr-skel" height="10px" width="220px" rounded="sm" duration="0s" /></td><td class="bsr-td bsr-num"><MpSkeleton class="bsr-skel" height="10px" width="120px" rounded="sm" duration="0s" /></td></tr>
            </tbody>
          </table>
        </div>

        <template v-else-if="report && sections">
          <div class="bsr-report-head">
            <span class="bsr-report-range">{{ t('As of') }} {{ bsPlDayLabel(applied!.asOf) }}</span>
            <span class="bsr-report-updated">{{ lastUpdated }}</span>
          </div>
          <div class="bsr-table-wrap">
            <table class="bsr-table">
              <thead>
                <tr>
                  <th class="bsr-th">
                    <span class="bsr-th-inner">{{ t('Account name') }}
                      <MpTooltip v-if="isCompare && !isMonthly" id="bsr-sort" :label="t('You can sort your report period in ascending or descending.')" placement="top" use-portal>
                        <button class="bsr-sort" type="button" :aria-label="t('Sort periods')" @click="settings.order = settings.order === 'asc' ? 'desc' : 'asc'; runFilter()">
                          <MpIcon name="caret-right" size="sm" :class="{ 'bsr-sort--desc': applied!.order === 'desc' }" />
                        </button>
                      </MpTooltip>
                    </span>
                  </th>
                  <template v-for="d in dates" :key="`h-${d}`">
                    <th class="bsr-th bsr-num">{{ headLabel(d) }}</th>
                    <th v-if="showChange" class="bsr-th bsr-pct" />
                  </template>
                </tr>
              </thead>

              <tbody>
                <!-- ═ Assets ═ -->
                <tr class="bsr-row--header"><td class="bsr-td" :colspan="totalCols">{{ t('Assets') }}</td></tr>
                <template v-for="s in sections.assets" :key="s.key">
                  <template v-if="hasSectionRows(s)">
                    <tr class="bsr-row--sub"><td class="bsr-td" :colspan="totalCols">{{ t(s.label) }}</td></tr>
                    <tr v-for="f in flatten(s.rows)" :key="`${s.key}-${f.row.id}`" class="bsr-row">
                      <td class="bsr-td" :style="{ paddingLeft: `calc(var(--mp-spacing-6) + ${(f.level - 1) * 16}px)` }">
                        <span class="bsr-acct" role="link" tabindex="0" @click="openAccount(f.row)" @keydown.enter="openAccount(f.row)">
                          <span v-if="colVis.code" class="bsr-code">{{ f.row.code }}</span>{{ f.row.name }}
                        </span>
                      </td>
                      <template v-for="(d, i) in dates" :key="`${f.row.id}-${d}`">
                        <td class="bsr-td bsr-num">{{ money(f.row.amounts[i]!) }}</td>
                        <td v-if="showChange" class="bsr-td bsr-pct">
                          <span v-if="change(f.row.amounts, i)" :class="change(f.row.amounts, i)!.up ? 'bsr-up' : 'bsr-down'"><MpIcon :name="change(f.row.amounts, i)!.up ? 'caret-up' : 'caret-down'" size="sm" />{{ change(f.row.amounts, i)!.text }}</span>
                        </td>
                      </template>
                    </tr>
                    <tr class="bsr-row--total">
                      <td class="bsr-td">{{ t(s.totalLabel) }}</td>
                      <template v-for="(d, i) in dates" :key="`${s.key}-t-${d}`">
                        <td class="bsr-td bsr-num">{{ money(s.totals[i]!) }}</td>
                        <td v-if="showChange" class="bsr-td bsr-pct" />
                      </template>
                    </tr>
                  </template>
                </template>
                <tr class="bsr-row--grand">
                  <td class="bsr-td">{{ t('Total assets') }}</td>
                  <template v-for="(d, i) in dates" :key="`ta-${d}`">
                    <td class="bsr-td bsr-num">{{ money(report.totalAssets[i]!) }}</td>
                    <td v-if="showChange" class="bsr-td bsr-pct" />
                  </template>
                </tr>

                <!-- ═ Liability & equity ═ -->
                <tr class="bsr-row--header"><td class="bsr-td" :colspan="totalCols">{{ t('Liability & equity') }}</td></tr>
                <template v-for="s in sections.liabilities" :key="s.key">
                  <template v-if="hasSectionRows(s)">
                    <tr class="bsr-row--sub"><td class="bsr-td" :colspan="totalCols">{{ t(s.label) }}</td></tr>
                    <tr v-for="f in flatten(s.rows)" :key="`${s.key}-${f.row.id}`" class="bsr-row">
                      <td class="bsr-td" :style="{ paddingLeft: `calc(var(--mp-spacing-6) + ${(f.level - 1) * 16}px)` }">
                        <span class="bsr-acct" role="link" tabindex="0" @click="openAccount(f.row)" @keydown.enter="openAccount(f.row)">
                          <span v-if="colVis.code" class="bsr-code">{{ f.row.code }}</span>{{ f.row.name }}
                        </span>
                      </td>
                      <template v-for="(d, i) in dates" :key="`${f.row.id}-${d}`">
                        <td class="bsr-td bsr-num">{{ money(f.row.amounts[i]!) }}</td>
                        <td v-if="showChange" class="bsr-td bsr-pct">
                          <span v-if="change(f.row.amounts, i)" :class="change(f.row.amounts, i)!.up ? 'bsr-up' : 'bsr-down'"><MpIcon :name="change(f.row.amounts, i)!.up ? 'caret-up' : 'caret-down'" size="sm" />{{ change(f.row.amounts, i)!.text }}</span>
                        </td>
                      </template>
                    </tr>
                    <tr class="bsr-row--total">
                      <td class="bsr-td">{{ t(s.totalLabel) }}</td>
                      <template v-for="(d, i) in dates" :key="`${s.key}-t-${d}`">
                        <td class="bsr-td bsr-num">{{ money(s.totals[i]!) }}</td>
                        <td v-if="showChange" class="bsr-td bsr-pct" />
                      </template>
                    </tr>
                  </template>
                </template>
                <tr class="bsr-row--grand">
                  <td class="bsr-td">{{ t('Total liability') }}</td>
                  <template v-for="(d, i) in dates" :key="`tl-${d}`">
                    <td class="bsr-td bsr-num">{{ money(report.totalLiabilities[i]!) }}</td>
                    <td v-if="showChange" class="bsr-td bsr-pct" />
                  </template>
                </tr>
                <tr class="bsr-row--spacer"><td :colspan="totalCols" /></tr>

                <tr class="bsr-row--sub"><td class="bsr-td" :colspan="totalCols">{{ t('Equity') }}</td></tr>
                <tr v-for="f in flatten(sections.equity.rows)" :key="`eq-${f.row.id}`" class="bsr-row">
                  <td class="bsr-td" :style="{ paddingLeft: `calc(var(--mp-spacing-6) + ${(f.level - 1) * 16}px)` }">
                    <span class="bsr-acct" role="link" tabindex="0" @click="openAccount(f.row)" @keydown.enter="openAccount(f.row)">
                      <span v-if="colVis.code" class="bsr-code">{{ f.row.code }}</span>{{ f.row.name }}
                    </span>
                  </td>
                  <template v-for="(d, i) in dates" :key="`${f.row.id}-${d}`">
                    <td class="bsr-td bsr-num">{{ money(f.row.amounts[i]!) }}</td>
                    <td v-if="showChange" class="bsr-td bsr-pct">
                      <span v-if="change(f.row.amounts, i)" :class="change(f.row.amounts, i)!.up ? 'bsr-up' : 'bsr-down'"><MpIcon :name="change(f.row.amounts, i)!.up ? 'caret-up' : 'caret-down'" size="sm" />{{ change(f.row.amounts, i)!.text }}</span>
                    </td>
                  </template>
                </tr>
                <!-- Synthetic equity lines (prod account_id -2 / -3): not linked -->
                <tr v-for="e in report.equityEarnings" :key="e.key" class="bsr-row">
                  <td class="bsr-td bsr-td--l1"><span v-if="colVis.code" class="bsr-code" />{{ t(e.name) }}</td>
                  <template v-for="(d, i) in dates" :key="`${e.key}-${d}`">
                    <td class="bsr-td bsr-num">{{ money(e.amounts[i]!) }}</td>
                    <td v-if="showChange" class="bsr-td bsr-pct">
                      <span v-if="change(e.amounts, i)" :class="change(e.amounts, i)!.up ? 'bsr-up' : 'bsr-down'"><MpIcon :name="change(e.amounts, i)!.up ? 'caret-up' : 'caret-down'" size="sm" />{{ change(e.amounts, i)!.text }}</span>
                    </td>
                  </template>
                </tr>
                <tr class="bsr-row--total">
                  <td class="bsr-td">{{ t('Total equity') }}</td>
                  <template v-for="(d, i) in dates" :key="`te-${d}`">
                    <td class="bsr-td bsr-num">{{ money(report.totalEquity[i]!) }}</td>
                    <td v-if="showChange" class="bsr-td bsr-pct" />
                  </template>
                </tr>
                <tr class="bsr-row--grand">
                  <td class="bsr-td">{{ t('Total liability & equity') }}</td>
                  <template v-for="(d, i) in dates" :key="`tle-${d}`">
                    <td class="bsr-td bsr-num">{{ money(report.totalLiabilitiesEquity[i]!) }}</td>
                    <td v-if="showChange" class="bsr-td bsr-pct" />
                  </template>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="bsr-notes">{{ notes }}</p>
        </template>
      </div>
    </div>

    <!-- ── More filters drawer (prod sidebar.vue: "Report filter") ── -->
    <Transition name="bsr-dr">
      <div v-if="drawerOpen" class="bsr-dr-overlay" @click.self="drawerOpen = false">
        <div class="bsr-dr-panel" role="dialog" :aria-label="t('Report filter')">
          <header class="bsr-dr-head">
            <span class="bsr-dr-title">{{ t('Report filter') }}</span>
            <button class="bsr-dr-close" type="button" :aria-label="t('Close')" @click="drawerOpen = false"><MpIcon name="close" size="md" /></button>
          </header>
          <div class="bsr-dr-body">
            <div class="bsr-field">
              <label class="bsr-label" for="bsr-dr-asof">{{ t('As of') }}</label>
              <MpDatePicker id="bsr-dr-asof" v-model="draft.asOf" format="DD/MM/YYYY" value-type="format" use-portal :is-clearable="false" @update:model-value="draft.period = 'custom'; draftError = ''" />
              <p v-if="draftError" class="bsr-error">{{ draftError }}</p>
            </div>
            <div class="bsr-field">
              <label class="bsr-label" for="bsr-dr-period">{{ t('Filter by period') }}</label>
              <ErpFilterSelect id="bsr-dr-period" :model-value="draft.period" :placeholder="t('Filter by period')" :options="periodOptions" width="100%" :is-clearable="false" @update:model-value="onDraftPeriod" />
            </div>
            <div class="bsr-field">
              <label class="bsr-label" for="bsr-dr-compare">{{ t('Compare By Period') }}</label>
              <ErpFilterSelect id="bsr-dr-compare" :model-value="draft.compareBy || 'none'" :placeholder="t('None')" :options="compareOptions" width="100%" :is-clearable="false" @update:model-value="(v: string) => onDraftCompare(v === 'none' ? '' : v)" />
            </div>
            <template v-if="draft.compareBy && draft.period !== 'this_financial_year'">
              <div class="bsr-field">
                <label class="bsr-label" for="bsr-dr-count">{{ t('Periods') }}</label>
                <ErpFilterSelect id="bsr-dr-count" v-model="draft.compareCount" :placeholder="t('None')" :options="countOptions" width="100%" :is-clearable="false" />
              </div>
              <div class="bsr-radios">
                <label class="bsr-radio bsr-radio--inline">
                  <MpRadio id="bsr-dr-asc" name="bsr-dr-order" value="asc" :is-checked="draft.order === 'asc'" @change="draft.order = 'asc'" /><span>{{ t('Ascending') }}</span>
                </label>
                <label class="bsr-radio bsr-radio--inline">
                  <MpRadio id="bsr-dr-desc" name="bsr-dr-order" value="desc" :is-checked="draft.order === 'desc'" @change="draft.order = 'desc'" /><span>{{ t('Descending') }}</span>
                </label>
              </div>
            </template>
            <div v-if="depthOptions.length > 1" class="bsr-field">
              <label class="bsr-label" for="bsr-dr-depth">{{ t('Filter by account depth') }}</label>
              <ErpFilterSelect id="bsr-dr-depth" v-model="draft.depth" :placeholder="t('Account depth')" :options="depthOptions" width="100%" :is-clearable="false" />
            </div>
            <label class="bsr-check">
              <MpCheckbox id="bsr-dr-mcv1" :is-checked="false" @change="notInPrototype">{{ t('Use Multi Currency V1') }}</MpCheckbox>
            </label>
          </div>
          <footer class="bsr-dr-foot">
            <button class="bsr-dr-clear" type="button" @click="clearDrawer">{{ t('Clear filter') }}</button>
            <div class="bsr-dr-actions">
              <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="drawerOpen = false">{{ t('Cancel') }}</button>
              <button class="btn-enterprise btn-enterprise--primary" type="button" @click="applyDrawer">{{ t('Filter') }}</button>
            </div>
          </footer>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.bsr { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.bsr-titlebar { flex-shrink: 0; min-height: 72px; background: var(--mp-background-neutral-subtle); display: flex; align-items: center; padding: 0 var(--mp-spacing-6); }
.bsr-titlebar-left { display: flex; flex-direction: column; justify-content: center; }
.bsr-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm, 12px); line-height: var(--mp-line-heights-sm, 16px); color: var(--mp-text-link); font-family: inherit; }
.bsr-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.bsr-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.bsr-title-cur { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); }

.bsr-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage, #fff); border-top-left-radius: var(--mp-radii-lg, 12px); padding: var(--mp-spacing-5, 20px) var(--mp-spacing-6, 24px) var(--mp-spacing-6, 24px); display: flex; flex-direction: column; gap: var(--mp-spacing-3, 12px); }
.bsr-controls { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.bsr-controls-left { display: flex; align-items: flex-end; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.bsr-controls-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.bsr-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.bsr-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bsr-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--mp-text-danger); }
.bsr-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
.bsr-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-colors-icon-default); }
.bsr-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
.bsr-export { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); }
.bsr-pop-title { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); letter-spacing: 0.3px; text-transform: uppercase; color: var(--mp-text-secondary); }
.bsr-radio { display: flex; align-items: flex-start; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); cursor: pointer; }
.bsr-radio-desc { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.bsr-radios { display: flex; gap: var(--mp-spacing-5); }
.bsr-radio--inline { padding: 0; align-items: center; }
.bsr-check { display: flex; }

.bsr-report { display: flex; flex-direction: column; min-width: 0; }
.bsr-fs-topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--mp-spacing-2); }
.bsr-fs-title { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bsr-report-head { display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-2) 0; }
.bsr-report-range, .bsr-report-updated { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.bsr-table-wrap { overflow-x: auto; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.bsr-table { width: 100%; min-width: 720px; border-collapse: collapse; }
.bsr-th { padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase; letter-spacing: 0.3px; color: var(--mp-text-secondary); text-align: left; white-space: nowrap; }
.bsr-th-inner { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.bsr-sort--desc { transform: rotate(180deg); }
.bsr-sort { display: inline-flex; align-items: center; border: none; background: none; padding: 0; cursor: pointer; color: var(--mp-colors-icon-default); }
.bsr-td { height: 40px; padding: var(--mp-spacing-2) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; vertical-align: middle; }
.bsr--compact .bsr-td { height: 28px; padding-top: var(--mp-spacing-1); padding-bottom: var(--mp-spacing-1); }
.bsr-num { text-align: right; font-variant-numeric: tabular-nums; }
.bsr-pct { width: 72px; text-align: left; font-size: var(--mp-font-sizes-sm); }
.bsr-td--l1 { padding-left: var(--mp-spacing-6); }
.bsr-row--header .bsr-td { background: var(--mp-background-neutral-subtle); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase; letter-spacing: 0.3px; font-size: var(--mp-font-sizes-sm); }
.bsr-row--sub .bsr-td { font-weight: var(--mp-font-weights-semi-bold); }
.bsr-row--total .bsr-td { font-weight: var(--mp-font-weights-semi-bold); border-top: 1px solid var(--mp-border-bold, var(--mp-border-default)); }
.bsr-row--grand .bsr-td { font-weight: var(--mp-font-weights-semi-bold); background: var(--mp-background-neutral-subtle); border-top: 1px solid var(--mp-border-bold, var(--mp-border-default)); }
.bsr-row--spacer td { height: var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default); }
.bsr-row:hover .bsr-td { background: var(--mp-background-neutral-subtle); }
.bsr-acct { color: var(--mp-text-link); cursor: pointer; }
.bsr-acct:hover { text-decoration: underline; text-underline-offset: 2px; }
.bsr-code { display: inline-block; min-width: 88px; margin-right: var(--mp-spacing-3); }
.bsr-up { display: inline-flex; align-items: center; color: var(--mp-colors-text-success); }
.bsr-down { display: inline-flex; align-items: center; color: var(--mp-text-danger); }
.bsr-notes { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.bsr-empty { display: flex; flex-direction: column; align-items: center; padding: 72px 0 64px; }
.bsr-empty-img { width: 240px; height: 200px; object-fit: contain; }
.bsr-empty-title { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bsr-empty-desc { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.bsr-skel { display: inline-block; background-color: var(--mp-border-default) !important; background-image: none !important; animation: none !important; }

.bsr-dr-enter-active, .bsr-dr-leave-active { transition: background-color 250ms ease; }
.bsr-dr-enter-from, .bsr-dr-leave-to { background-color: transparent; }
.bsr-dr-enter-active .bsr-dr-panel { transition: transform 350ms ease-out; }
.bsr-dr-leave-active .bsr-dr-panel { transition: transform 250ms ease-in; }
.bsr-dr-enter-from .bsr-dr-panel, .bsr-dr-leave-to .bsr-dr-panel { transform: translateX(calc(100% + 12px)); }
.bsr-dr-overlay { position: fixed; inset: 0; z-index: 1300; background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45)); display: flex; justify-content: flex-end; }
.bsr-dr-panel { margin: var(--mp-spacing-3); width: min(420px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); border-radius: 24px; overflow: hidden; }
.bsr-dr-head { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); }
.bsr-dr-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bsr-dr-close { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: none; background: none; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-colors-icon-default); }
.bsr-dr-close:hover { background: var(--mp-background-neutral-hovered); }
.bsr-dr-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: var(--mp-spacing-4); padding: var(--mp-spacing-4); }
.bsr-dr-foot { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
.bsr-dr-actions { display: flex; gap: var(--mp-spacing-2); }
.bsr-dr-clear { border: none; background: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); font-family: inherit; }
.bsr-dr-clear:hover { text-decoration: underline; }

.bsr--full .bsr-stage { border-radius: 0; padding-top: var(--mp-spacing-4); }
</style>
