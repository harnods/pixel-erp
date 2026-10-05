<!-- prod-parity: jurnal-frontend-app/src/pages/reports/cash_flow (+ quickbook ReportCustomLayoutPresenter default layouts) -->
<script setup lang="ts">
/**
 * Cash flow report — Reports › Financials › Cash flow.
 *
 * Prod structure: Start date / End date / Period + Show, a Filter drawer (Period,
 * Compare period + order, Show accounts), the Template menu (Direct Layout /
 * Indirect Layout + Add new template) and Export. The table groups prod's
 * default layout lines under operating / investing / financing activities, then
 * the cash summary (Increase (decrease) in cash, Net bank revaluation, Beginning
 * and Ending cash balance).
 *
 * Figures come from the canonical ledger (data/cashFlowTrialBalance.ts →
 * chartOfAccounts.ts) and are asserted there: net change = closing − opening
 * Cash & bank balance for every column.
 */
import { ref, computed, reactive, watch, onBeforeUnmount } from 'vue'
import { MpIcon, MpCheckbox, MpRadio, MpFormControl, MpFormLabel, MpSkeleton, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css } from '@mekari/pixel3'
import AdvancedDateRangePicker from '~/components/patterns/AdvancedDateRangePicker.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { infoToast } from '~/utils/toasts'
import { loadCreated, saveCreated } from '~/data/persist'
import {
  CF_PERIODS, CF_COMPARE_COUNTS, CF_LAYOUTS, tbPeriodRange, cfComparisonRanges, cfBuildReport, cfRangeLabel,
  type CfLayout, type CfDateRange,
} from '~/data/cashFlowTrialBalance'

const { t } = useLocale()
const router = useRouter()

// ── User settings (chosen template + Show accounts) survive a reload ─────────
interface CfSettings { layout: CfLayout; showAccounts: boolean }
const SETTINGS_KEY = 'cash-flow-report-settings'
const saved = loadCreated<CfSettings>(SETTINGS_KEY)[0]
const layout = ref<CfLayout>(saved?.layout ?? 'direct')
const showAccounts = ref(saved?.showAccounts ?? false)
watch([layout, showAccounts], () => saveCreated<CfSettings>(SETTINGS_KEY, [{ layout: layout.value, showAccounts: showAccounts.value }]))
const layoutDef = computed(() => CF_LAYOUTS.find(l => l.id === layout.value)!)

// ── Period ───────────────────────────────────────────────────────────────────
const toDate = (s: string) => new Date(s + 'T00:00:00')
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const period = ref('last_month')
const pendingRange = ref<Date[]>((() => { const r = tbPeriodRange('last_month')!; return [toDate(r.start), toDate(r.end)] })())
const formError = ref('')
function onPendingChange(v: Date[]) { pendingRange.value = v; period.value = 'custom'; formError.value = '' }
function onPeriodChange(v: string) {
  period.value = v || 'custom'
  const r = tbPeriodRange(period.value)
  if (r) pendingRange.value = [toDate(r.start), toDate(r.end)]
}

const compareCount = ref('0')
const periodOrder = ref<'asc' | 'desc'>('desc')
const applied = reactive<{ range: CfDateRange | null; compare: number; order: 'asc' | 'desc' }>({ range: null, compare: 0, order: 'desc' })

// ── idle → loading → ready ───────────────────────────────────────────────────
const reportState = ref<'idle' | 'loading' | 'ready'>('idle')
let timer: ReturnType<typeof setTimeout> | null = null
function generate() {
  reportState.value = 'loading'
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { reportState.value = 'ready' }, 700)
}
onBeforeUnmount(() => { if (timer) clearTimeout(timer) })

function showReport() {
  const [s, e] = pendingRange.value
  if (!s || !e) { formError.value = t('You must fill in date range'); return }
  if (s > e) { formError.value = t('Start date cannot be after end date.'); return }
  formError.value = ''
  // Prod: "Each month this year" compares the last month with the previous 11.
  if (period.value === 'this_financial_year' && compareCount.value === '0') compareCount.value = '11'
  applied.range = { start: toIso(s), end: toIso(e) }
  applied.compare = Number(compareCount.value)
  applied.order = periodOrder.value
  generate()
}

// ── Filter drawer (prod more-filter) ─────────────────────────────────────────
const drawerOpen = ref(false)
const draft = reactive({ period: 'last_month', compare: '0', order: 'desc' as 'asc' | 'desc', showAccounts: false })
function openDrawer() {
  Object.assign(draft, { period: period.value, compare: compareCount.value, order: periodOrder.value, showAccounts: showAccounts.value })
  drawerOpen.value = true
}
function resetDraft() { Object.assign(draft, { period: 'last_month', compare: '0', order: 'desc', showAccounts: false }) }
function applyDrawer() {
  if (draft.period !== period.value) onPeriodChange(draft.period)
  compareCount.value = draft.compare || '0'
  periodOrder.value = draft.order
  showAccounts.value = draft.showAccounts
  drawerOpen.value = false
  showReport()
}
const isMoreFilterActive = computed(() => compareCount.value !== '0' || showAccounts.value)

// ── Template (layout) menu ───────────────────────────────────────────────────
function chooseLayout(id: CfLayout) {
  layout.value = id
  if (reportState.value !== 'idle') generate()
}
function notInPrototype() { infoToast(t('Not in this prototype')) }

// ── Report ───────────────────────────────────────────────────────────────────
const report = computed(() => {
  if (reportState.value === 'idle' || !applied.range) return null
  return cfBuildReport(layout.value, cfComparisonRanges(applied.range, applied.compare, applied.order))
})
const columnCount = computed(() => report.value?.ranges.length ?? 1)

/** Figures render without the currency unit (prod to_currency_wo_unit); negatives in parentheses. */
const NUM = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function num(n: number) { return n < 0 ? `(${NUM.format(-n)})` : NUM.format(n) }

const summaryRows = computed(() => {
  const r = report.value
  if (!r) return []
  return [
    { label: 'Increase (decrease) in cash', amounts: r.netChange },
    { label: 'Net bank revaluation', amounts: r.bankRevaluation },
    { label: 'Beginning cash balance', amounts: r.opening },
    { label: 'Ending cash balance', amounts: r.closing },
  ]
})

function openAccount(id: string) { router.push(`/chart-of-accounts/${id}`) }
</script>

<template>
  <div class="cfr">
    <!-- ── Title bar ── -->
    <header class="cfr-titlebar">
      <div class="cfr-titlebar-left">
        <button class="cfr-breadcrumb" type="button" @click="router.push('/financial-report')">{{ t('Financials') }}</button>
        <h1 class="cfr-title">{{ t('Cash flow') }} <span class="cfr-title-cur">(IDR)</span></h1>
      </div>
    </header>

    <div class="cfr-stage">
      <!-- ── Filter area ── -->
      <div class="cfr-controls">
        <div class="cfr-controls-left">
          <div class="cfr-datefield">
            <span class="cfr-field-label">{{ t('Start date - End date') }}</span>
            <AdvancedDateRangePicker
              id="cfr-date"
              :model-value="pendingRange"
              is-full-width
              period-mode
              hide-label
              :placeholder="t('Select date')"
              @update:model-value="onPendingChange"
            />
          </div>
          <ErpFilterSelect id="cfr-period" :model-value="period" :placeholder="t('Period')" :options="CF_PERIODS" width="200px" :is-clearable="false" @update:model-value="onPeriodChange" />
          <button class="btn-enterprise btn-enterprise--primary" type="button" @click="showReport">{{ t('Show') }}</button>
          <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" type="button" @click="openDrawer">
            <MpIcon name="filter" size="sm" /> {{ t('Filter') }}
            <span v-if="isMoreFilterActive" class="cfr-filter-dot" />
          </button>
        </div>

        <div class="cfr-controls-right">
          <MpPopover id="cfr-template" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <button class="btn-enterprise btn-enterprise--secondary cfr-menu-btn" type="button">
                {{ t('Template') }}
                <MpIcon name="caret-down" size="sm" />
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '240px', width: 'max-content' })">
              <MpPopoverList>
                <MpPopoverListItem v-for="l in CF_LAYOUTS" :key="l.id" :is-active="l.id === layout" @click="chooseLayout(l.id)">{{ t(l.name) }}</MpPopoverListItem>
                <MpPopoverListItem @click="notInPrototype">{{ t('Add new template') }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>

          <MpPopover id="cfr-export" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <button class="btn-enterprise btn-enterprise--secondary cfr-menu-btn" type="button">
                {{ t('Export') }}
                <MpIcon name="caret-down" size="sm" />
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content' })">
              <MpPopoverList>
                <MpPopoverListItem @click="notInPrototype">PDF</MpPopoverListItem>
                <MpPopoverListItem @click="notInPrototype">XLSX</MpPopoverListItem>
                <MpPopoverListItem @click="notInPrototype">CSV</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>
      <p v-if="formError" class="cfr-form-error">{{ formError }}</p>

      <!-- ── Report ── -->
      <div class="cfr-report">
        <!-- Initial state (prod initial-state) -->
        <div v-if="reportState === 'idle'" class="cfr-empty">
          <img src="/illustrations/report-empty.png" alt="" class="cfr-empty-img" width="240" height="200" />
          <p class="cfr-empty-title">{{ t('Report will appear here') }}</p>
          <p class="cfr-empty-desc">{{ t('Select date or period, then click Show button.') }}</p>
        </div>

        <!-- Loading -->
        <div v-else-if="reportState === 'loading'" class="cfr-table-wrap">
          <table class="cfr-table">
            <thead><tr><th class="cfr-th">{{ t('Account name & category') }}</th><th v-for="n in columnCount" :key="n" class="cfr-th cfr-th--num" /></tr></thead>
            <tbody>
              <tr v-for="n in 8" :key="n">
                <td class="cfr-td"><MpSkeleton class="cfr-skel" height="10px" width="220px" rounded="sm" duration="0s" /></td>
                <td v-for="c in columnCount" :key="c" class="cfr-td cfr-td--num"><MpSkeleton class="cfr-skel" height="10px" width="96px" rounded="sm" duration="0s" /></td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Ready -->
        <template v-else-if="report">
          <div class="cfr-table-wrap">
            <table class="cfr-table">
              <thead>
                <tr>
                  <th class="cfr-th cfr-th--name">{{ t('Account name & category') }}</th>
                  <th v-for="(r, i) in report.ranges" :key="i" class="cfr-th cfr-th--num">{{ cfRangeLabel(r) }}</th>
                </tr>
              </thead>
              <tbody v-for="s in report.sections" :key="s.activity">
                <tr class="cfr-row--band">
                  <td class="cfr-td cfr-td--band" :colspan="columnCount + 1">{{ t(s.title) }}</td>
                </tr>
                <template v-for="l in s.lines" :key="l.label">
                  <!-- Line only (Show accounts off) -->
                  <tr v-if="!showAccounts || l.netIncome" class="cfr-row">
                    <td class="cfr-td cfr-indent-1">{{ t(l.label) }}</td>
                    <td v-for="(v, i) in l.amounts" :key="i" class="cfr-td cfr-td--num">{{ num(v) }}</td>
                  </tr>
                  <!-- Line → accounts → total (Show accounts on) -->
                  <template v-else>
                    <tr class="cfr-row">
                      <td class="cfr-td cfr-indent-1" :colspan="columnCount + 1">{{ t(l.label) }}</td>
                    </tr>
                    <tr v-for="a in l.accounts" :key="a.id" class="cfr-row">
                      <td class="cfr-td cfr-indent-2">
                        <span class="cfr-link" role="link" tabindex="0" @click="openAccount(a.id)" @keydown.enter="openAccount(a.id)">
                          <span class="cfr-acc-code">{{ a.code }}</span>{{ a.name }}
                        </span>
                      </td>
                      <td v-for="(v, i) in a.amounts" :key="i" class="cfr-td cfr-td--num">{{ num(v) }}</td>
                    </tr>
                    <tr class="cfr-row cfr-row--subtotal">
                      <td class="cfr-td cfr-indent-1">{{ t('Total') }} {{ t(l.label).toLowerCase() }}</td>
                      <td v-for="(v, i) in l.amounts" :key="i" class="cfr-td cfr-td--num">{{ num(v) }}</td>
                    </tr>
                  </template>
                </template>
                <tr class="cfr-row cfr-row--total">
                  <td class="cfr-td">{{ t(s.netLabel) }}</td>
                  <td v-for="(v, i) in s.amounts" :key="i" class="cfr-td cfr-td--num">{{ num(v) }}</td>
                </tr>
              </tbody>
              <tbody>
                <tr class="cfr-row cfr-row--spacer"><td class="cfr-td" :colspan="columnCount + 1" /></tr>
                <tr v-for="row in summaryRows" :key="row.label" class="cfr-row cfr-row--total">
                  <td class="cfr-td">{{ t(row.label) }}</td>
                  <td v-for="(v, i) in row.amounts" :key="i" class="cfr-td cfr-td--num">{{ num(v) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="cfr-method">{{ t('This report is displayed based on') }} {{ t(layoutDef.method) }}</p>
        </template>
      </div>
    </div>

    <!-- ── Report filter drawer (prod more-filter) ── -->
    <Transition name="cff">
      <div v-if="drawerOpen" class="cff-overlay" @click.self="drawerOpen = false">
        <div class="cff-panel" role="dialog" :aria-label="t('Report filter')">
          <header class="cff-head">
            <span class="cff-title">{{ t('Report filter') }}</span>
            <button class="cff-close" type="button" :aria-label="t('Close')" @click="drawerOpen = false"><MpIcon name="close" size="md" /></button>
          </header>
          <div class="cff-body">
            <MpFormControl id="cff-period-fc">
              <MpFormLabel>{{ t('Period') }}</MpFormLabel>
              <ErpFilterSelect id="cff-period" v-model="draft.period" :placeholder="t('Period')" :options="CF_PERIODS" width="100%" :is-clearable="false" />
            </MpFormControl>
            <MpFormControl id="cff-compare-fc">
              <MpFormLabel>{{ t('Compare period') }}</MpFormLabel>
              <ErpFilterSelect id="cff-compare" v-model="draft.compare" :placeholder="t('Compare period')" :options="CF_COMPARE_COUNTS" width="100%" :is-clearable="false" />
              <div v-if="draft.compare !== '0'" class="cff-radios">
                <MpRadio id="cff-asc" name="cff-order" :is-checked="draft.order === 'asc'" @change="draft.order = 'asc'">{{ t('Ascending') }}</MpRadio>
                <MpRadio id="cff-desc" name="cff-order" :is-checked="draft.order === 'desc'" @change="draft.order = 'desc'">{{ t('Descending') }}</MpRadio>
              </div>
            </MpFormControl>
            <MpCheckbox id="cff-show-account" :is-checked="draft.showAccounts" @change="draft.showAccounts = !draft.showAccounts">{{ t('Show accounts') }}</MpCheckbox>
          </div>
          <footer class="cff-foot">
            <button class="cff-reset" type="button" @click="resetDraft">{{ t('Reset filter') }}</button>
            <div class="cff-foot-actions">
              <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="drawerOpen = false">{{ t('Cancel') }}</button>
              <button class="btn-enterprise btn-enterprise--primary" type="button" @click="applyDrawer">{{ t('Apply') }}</button>
            </div>
          </footer>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.cfr { display: flex; flex-direction: column; height: 100%; min-height: 0; }

.cfr-titlebar { flex-shrink: 0; min-height: 72px; background: var(--mp-background-neutral-subtle); display: flex; align-items: center; padding: 0 var(--mp-spacing-6); }
.cfr-titlebar-left { display: flex; flex-direction: column; justify-content: center; }
.cfr-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm, 12px); line-height: var(--mp-line-heights-sm, 16px); color: var(--mp-text-link); font-family: inherit; }
.cfr-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.cfr-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.cfr-title-cur { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); }

.cfr-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage, #fff); border-top-left-radius: var(--mp-radii-lg, 12px); padding: var(--mp-spacing-5, 20px) var(--mp-spacing-6, 24px) var(--mp-spacing-6, 24px); display: flex; flex-direction: column; gap: var(--mp-spacing-3, 12px); }

.cfr-controls { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.cfr-controls-left { display: flex; align-items: flex-end; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.cfr-controls-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.cfr-field-label { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-default); }
.cfr-datefield { display: flex; flex-direction: column; gap: var(--mp-spacing-1); width: 260px; }
.cfr-filter-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--mp-text-danger, #c62828); margin-left: 2px; }
.cfr-menu-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); }
.cfr-form-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #c62828); }

.cfr-report { display: flex; flex-direction: column; min-width: 0; }
.cfr-table-wrap { overflow-x: auto; }
.cfr-table { width: 100%; min-width: 720px; border-collapse: collapse; }
.cfr-th {
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral-subtle, #f4f5f7);
  border-top: 1px solid var(--mp-border-default);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; letter-spacing: 0.3px; color: var(--mp-text-secondary);
  text-align: left; white-space: nowrap;
}
.cfr-th--num { text-align: right; }
.cfr-th--name { min-width: 320px; }
.cfr-td {
  height: var(--mp-sizes-10); padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-default);
  vertical-align: middle;
}
.cfr-td--num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.cfr-td--band { background: var(--mp-background-neutral-subtle, #f4f5f7); height: 32px; font-weight: var(--mp-font-weights-semi-bold, 600); }
.cfr-indent-1 { padding-left: var(--mp-spacing-6, 24px); }
.cfr-indent-2 { padding-left: var(--mp-spacing-10, 40px); }
.cfr-row--subtotal .cfr-td { border-top: 1px solid var(--mp-border-default); }
.cfr-row--total .cfr-td { font-weight: var(--mp-font-weights-semi-bold, 600); border-top: 1px solid var(--mp-border-default); }
.cfr-row--spacer .cfr-td { height: 16px; padding: 0; border-bottom: none; }
.cfr-row:not(.cfr-row--spacer):hover .cfr-td { background: var(--mp-background-neutral-subtle, #f8f9f9); }
.cfr-link { color: var(--mp-text-link); cursor: pointer; }
.cfr-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.cfr-acc-code { display: inline-block; min-width: 88px; margin-right: var(--mp-spacing-3); }
.cfr-method { margin: var(--mp-spacing-3) 0 0; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }

.cfr-empty { display: flex; flex-direction: column; align-items: center; padding: 72px 0 64px; }
.cfr-empty-img { width: 240px; height: 200px; object-fit: contain; }
.cfr-empty-title { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cfr-empty-desc { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.cfr-skel { display: inline-block; background-color: var(--mp-border-default) !important; background-image: none !important; animation: none !important; }

/* Report filter drawer — same shell as GeneralLedgerFiltersDrawer. */
.cff-enter-active, .cff-leave-active { transition: background-color 250ms ease; }
.cff-enter-from, .cff-leave-to { background-color: transparent; }
.cff-enter-active .cff-panel { transition: transform 350ms ease-out; }
.cff-leave-active .cff-panel { transition: transform 250ms ease-in; }
.cff-enter-from .cff-panel, .cff-leave-to .cff-panel { transform: translateX(calc(100% + 12px)); }
.cff-overlay { position: fixed; inset: 0; z-index: 1300; background: var(--mp-colors-overlay); display: flex; justify-content: flex-end; }
.cff-panel { margin: var(--mp-spacing-3); width: min(420px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); border-radius: 24px; overflow: hidden; }
.cff-head { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); }
.cff-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cff-close { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: none; background: none; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.cff-close:hover { background: var(--mp-background-neutral-hovered); }
.cff-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: var(--mp-spacing-4); padding: var(--mp-spacing-4); }
.cff-radios { display: flex; gap: var(--mp-spacing-4); margin-top: var(--mp-spacing-2); }
.cff-foot { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-4); }
.cff-foot-actions { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.cff-reset { border: none; background: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); font-family: inherit; }
.cff-reset:hover { text-decoration: underline; }
</style>
