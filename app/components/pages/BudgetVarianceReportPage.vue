<script setup lang="ts">
/**
 * Budget Variance (P&L Budgeting) report — Reports › Financials › Budget Variance.
 * Figma "Report / Profit and Loss Budgeting" 4481-243948.
 *
 * The P&L tree run against a budget, bucketed by period. Each period band holds
 * BUDGET / ACTUAL / VARIANCE / VARIANCE (%); a negative variance renders red in
 * parentheses with an "Exceeds budget" caption, per the design.
 *
 * Turning Compare on (the shared Comparison drawer, MultidimensionalCompareDrawer)
 * slices the report by a dimension: the header gains an outer band per dimension
 * value, and each period drops to BUDGET / ACTUAL — matching Figma 4481:243957.
 *
 * Same shell as the other Financials reports: idle → loading → ready, saved
 * views, All filters, Airene, Export, full screen.
 */
import { ref, computed, reactive, watch, nextTick, onBeforeUnmount } from 'vue'
import { useReportFullscreen } from '~/composables/useReportFullscreen'
import { useAireneBridge } from '~/composables/useAireneBridge'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import {
  MpIcon, MpTooltip, MpToggle, MpSkeleton, MpSelect,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css, toast,
} from '@mekari/pixel3'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import BudgetVarianceFiltersDrawer from '~/components/patterns/BudgetVarianceFiltersDrawer.vue'
import MultidimensionalCompareDrawer from '~/components/patterns/MultidimensionalCompareDrawer.vue'
import { formatIDR } from '~/utils/currency'
import { infoToast } from '~/utils/toasts'
import {
  BUDGETS, BUDGET_FROM_OPTIONS, SHOW_EVERY_OPTIONS, BV_SECTIONS, isContra,
  bvBudget, bvActual, bvSectionTotals, bvProfitLines, emptyBvFilters,
  budgetFromMonths, showEveryMonths, type BvFilters,
} from '~/data/budgetVarianceReport'
import { reportDimensions, usingDemoDimensions, emptyCompareSettings, comparePeriodLabel, type MdAccount, type MdCompareSettings } from '~/data/multidimensionalReport'

const { t } = useLocale()
const router = useRouter()

// ── Budget selection (title-bar dropdown) ────────────────────────────────────
const budgetId = ref(BUDGETS[0]!.id)
const budget = computed(() => BUDGETS.find((b) => b.id === budgetId.value) ?? BUDGETS[0]!)

// ── Controls: Budget ends in · Budget from · Show every ──────────────────────
/** Month the budget window ends on — the report walks backwards from here. */
const pendingEndMonth = ref(new Date(2026, 1, 1))
const appliedEndMonth = ref(new Date(2026, 1, 1))
const pendingFrom = ref('3m')
const appliedFrom = ref('3m')
const pendingEvery = ref('1m')
const appliedEvery = ref('1m')
const formError = ref('')

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const endMonthLabel = computed(() => `${MONTHS_LONG[pendingEndMonth.value.getMonth()]} ${pendingEndMonth.value.getFullYear()}`)
const fromLabel = computed(() => BUDGET_FROM_OPTIONS.find((o) => o.value === pendingFrom.value)?.label ?? '')
const everyLabel = computed(() => SHOW_EVERY_OPTIONS.find((o) => o.value === pendingEvery.value)?.label ?? '')

/** Month picker — a 12-month grid with year steppers, like the date picker's per-month view. */
const monthPickerYear = ref(pendingEndMonth.value.getFullYear())
function pickMonth(m: number) { pendingEndMonth.value = new Date(monthPickerYear.value, m, 1); formError.value = '' }

// ── Report generation — idle (prompt) → loading (skeleton) → ready ───────────
const reportState = ref<'idle' | 'loading' | 'ready'>('idle')
let genTimer: ReturnType<typeof setTimeout> | null = null
function generate() {
  reportState.value = 'loading'
  if (genTimer) clearTimeout(genTimer)
  genTimer = setTimeout(() => { reportState.value = 'ready' }, 1100)
}
onBeforeUnmount(() => { if (genTimer) clearTimeout(genTimer) })

function applyReport() {
  if (budgetFromMonths(pendingFrom.value) < showEveryMonths(pendingEvery.value)) {
    formError.value = t('The bucket size cannot be longer than the budget window.')
    return
  }
  formError.value = ''
  appliedEndMonth.value = new Date(pendingEndMonth.value)
  appliedFrom.value = pendingFrom.value
  appliedEvery.value = pendingEvery.value
  generate()
}

// ── Buckets — the period columns the report is split into ────────────────────
interface BvBucket { label: string; key: string; months: number; start: Date; end: Date }
const buckets = computed<BvBucket[]>(() => {
  const span = budgetFromMonths(appliedFrom.value)
  const size = showEveryMonths(appliedEvery.value)
  const end = appliedEndMonth.value
  const count = Math.max(1, Math.floor(span / size))
  // Oldest bucket first, ending on the applied month.
  return Array.from({ length: count }, (_, i) => {
    const bucketEndMonth = end.getMonth() - (count - 1 - i) * size
    const start = new Date(end.getFullYear(), bucketEndMonth - (size - 1), 1)
    const last = new Date(end.getFullYear(), bucketEndMonth + 1, 0)
    const label = size === 1
      ? `${MONTHS_LONG[start.getMonth()]} ${start.getFullYear()}`
      : `${MONTHS[start.getMonth()]} ${start.getFullYear()} - ${MONTHS[last.getMonth()]} ${last.getFullYear()}`
    return { label, key: `${start.getFullYear()}-${start.getMonth()}|${size}`, months: size, start, end: last }
  })
})
const rangeCaption = computed(() => {
  const first = buckets.value[0]; const last = buckets.value[buckets.value.length - 1]
  if (!first || !last) return ''
  const f = (x: Date) => `${x.getDate()} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`
  return `${f(first.start)} - ${f(last.end)}`
})
const lastUpdated = (() => {
  const now = new Date()
  return `Last updated on ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}, ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} (GMT+7)`
})()

// ── Compare — slices the whole report by one dimension ───────────────────────
const compareOn = ref(false)
const compareDrawerOpen = ref(false)
const compareSettings = reactive<MdCompareSettings>(emptyCompareSettings())
/** Compare needs a dimension to slice by; the first reportable one is used
 *  (the Comparison drawer has no dimension picker of its own). */
const compareDimension = computed(() => reportDimensions()[0])
/** True while falling back to the sample dimension set — surfaced in the bar. */
const isDemoDimensions = computed(() => usingDemoDimensions())
function onCompareControl() {
  if (compareOn.value) compareOn.value = false
  else compareDrawerOpen.value = true
}
function onApplyCompare(v: MdCompareSettings) {
  compareSettings.period = v.period
  compareSettings.groupBy = v.groupBy
  compareOn.value = true
  if (reportState.value !== 'idle') generate()
}
const compareCaption = computed(() =>
  compareSettings.groupBy === 'period'
    ? t('By period')
    : `${t('By dimension')}${compareDimension.value ? ` · ${compareDimension.value.name}` : ''}`)
/** Dimension values that own an outer band while comparing. */
const compareValues = computed(() => (compareOn.value ? compareDimension.value?.values ?? [] : []))

// ── Filters ──────────────────────────────────────────────────────────────────
const filters = reactive<BvFilters>(emptyBvFilters())
const drawerOpen = ref(false)
function onApplyFilters(v: BvFilters) {
  filters.accountKeyword = v.accountKeyword
  filters.onlyExceeding = v.onlyExceeding
  filters.showZero = v.showZero
  if (reportState.value !== 'idle') generate()
}
const activeFilterCount = computed(() => (filters.accountKeyword ? 1 : 0) + (filters.onlyExceeding ? 1 : 0) + (filters.showZero ? 0 : 1))
function resetFilters() { filters.accountKeyword = ''; filters.onlyExceeding = false; filters.showZero = true }

// ── Columns ──────────────────────────────────────────────────────────────────
// Variance and Variance (%) are dropped while comparing — with a dimension band
// on top the table already carries two header levels (Figma 4481:243957).
const METRICS = [
  { key: 'budget', label: 'Budget' },
  { key: 'actual', label: 'Actual' },
  { key: 'variance', label: 'Variance' },
  { key: 'variancePct', label: 'Variance (%)' },
] as const
type MetricKey = typeof METRICS[number]['key']
const colVis = reactive<Record<string, boolean>>({ budget: true, actual: true, variance: true, variancePct: true })
const columnItems = computed(() => METRICS.map((m) => ({ key: m.key, label: t(m.label), disabled: m.key === 'budget' || m.key === 'actual' })))
const metrics = computed<MetricKey[]>(() =>
  METRICS.filter((m) => colVis[m.key] !== false && !(compareOn.value && (m.key === 'variance' || m.key === 'variancePct')))
    .map((m) => m.key))

/** One rendered column: a metric inside a bucket, optionally inside a dimension band. */
interface BvCol { id: string; label: string; metric: MetricKey; bucket: BvBucket; value: string }
/** Second-level header band: a bucket (compare off) or a bucket inside a value. */
interface BvBand { id: string; label: string; cols: BvCol[] }
/** Top-level band, only while comparing: one per dimension value. */
interface BvGroup { id: string; label: string; bands: BvBand[] }

const columnGroups = computed<BvGroup[]>(() => {
  const mk = (value: string) => buckets.value.map((b) => ({
    id: `${value}|${b.key}`,
    label: b.label.toUpperCase(),
    cols: metrics.value.map((m) => ({ id: `${value}|${b.key}|${m}`, label: METRICS.find((x) => x.key === m)!.label, metric: m, bucket: b, value })),
  }))
  if (!compareOn.value || !compareValues.value.length) return [{ id: 'all', label: '', bands: mk('') }]
  return compareValues.value.map((v) => ({ id: `v-${v}`, label: v.toUpperCase(), bands: mk(v) }))
})
const bands = computed(() => columnGroups.value.flatMap((g) => g.bands))
const flatColumns = computed(() => bands.value.flatMap((b) => b.cols))
const banded = computed(() => compareOn.value && compareValues.value.length > 0)

// ── Rows ─────────────────────────────────────────────────────────────────────
function matchesKeyword(a: MdAccount) {
  const q = filters.accountKeyword.trim().toLowerCase()
  if (!q) return true
  return a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
}
/** Did this account overrun its budget in any rendered column? */
function exceedsBudget(a: MdAccount) {
  return flatColumns.value.some((c) => varianceOf(a.code, c) < 0)
}
function hasPlan(a: MdAccount) {
  return flatColumns.value.some((c) => bvBudget(a.code, c.bucket.key, c.bucket.months, c.value) !== 0 || bvActual(a.code, c.bucket.key, c.bucket.months, c.value) !== 0)
}
function accountFilter(a: MdAccount) {
  return matchesKeyword(a) && (filters.showZero || hasPlan(a)) && (!filters.onlyExceeding || exceedsBudget(a))
}
const sections = computed(() =>
  BV_SECTIONS.map((s) => ({ ...s, accounts: s.accounts.filter(accountFilter) })).filter((s) => s.accounts.length > 0))
const hasRows = computed(() => sections.value.length > 0 && flatColumns.value.length > 0)

// ── Amounts ──────────────────────────────────────────────────────────────────
/** Budget/actual pair for a row in one column. */
type RowPair = (col: BvCol) => { budget: number; actual: number }
function accountPair(code: string): RowPair {
  return (c) => ({ budget: bvBudget(code, c.bucket.key, c.bucket.months, c.value), actual: bvActual(code, c.bucket.key, c.bucket.months, c.value) })
}
function sectionPair(sectionKey: string): RowPair {
  const s = BV_SECTIONS.find((x) => x.key === sectionKey)!
  return (c) => bvSectionTotals(s, c.bucket.key, c.bucket.months, c.value, accountFilter)
}
type ProfitKey = 'grossProfit' | 'operatingProfit' | 'netProfit'
function profitPair(which: ProfitKey): RowPair {
  return (c) => bvProfitLines(c.bucket.key, c.bucket.months, c.value, accountFilter)[which]
}
/** Variance for an account in one column — always `actual - budget` (Figma). */
function varianceOf(code: string, c: BvCol) {
  return bvActual(code, c.bucket.key, c.bucket.months, c.value) - bvBudget(code, c.bucket.key, c.bucket.months, c.value)
}

/** Money cell: negatives render in parentheses, per the Figma. */
function money(n: number): string { return n < 0 ? `(${formatIDR(Math.abs(n))})` : formatIDR(n) }
/** Variance % against budget; a zero budget has no meaningful ratio → "-". */
function pctText(variance: number, budgetAmount: number): string {
  if (!budgetAmount) return '-'
  const p = Math.round((variance / Math.abs(budgetAmount)) * 100)
  return p < 0 ? `(${Math.abs(p)}%)` : `${p}%`
}
/** The value + whether it overran, so the cell can flag "Exceeds budget". */
function cell(f: RowPair, c: BvCol): { text: string; over: boolean } {
  const { budget: b, actual: a } = f(c)
  const variance = a - b
  if (c.metric === 'budget') return { text: money(b), over: false }
  if (c.metric === 'actual') return { text: money(a), over: false }
  if (c.metric === 'variance') return { text: money(variance), over: variance < 0 }
  return { text: pctText(variance, b), over: variance < 0 }
}
/** The profit line printed immediately after a section's subtotal, if any. */
const PROFIT_AFTER: Record<string, { key: ProfitKey; label: string }> = {
  'cost-of-sales': { key: 'grossProfit', label: 'Gross profit' },
  'operating-expenses': { key: 'operatingProfit', label: 'Operating profit' },
  'other-income': { key: 'netProfit', label: 'Net profit' },
}
function profitAfter(sectionKey: string) { return PROFIT_AFTER[sectionKey] }
/** Contra accounts display as magnitudes; the label notes the deduction. */
function accountLabel(a: MdAccount) { return `${a.code} ${a.name}` }
function isContraAccount(a: MdAccount) { return isContra(a) }

// ── Saved views ──────────────────────────────────────────────────────────────
interface BvView { id: string; name: string; filters: BvFilters }
const views = reactive<BvView[]>([])
const activeViewId = ref('default')
function selectView(id: string) {
  activeViewId.value = id
  const v = views.find((x) => x.id === id)
  if (v) { filters.accountKeyword = v.filters.accountKeyword; filters.onlyExceeding = v.filters.onlyExceeding; filters.showZero = v.filters.showZero }
  else resetFilters()
  if (reportState.value !== 'idle') generate()
}
const addingView = ref(false)
const newViewName = ref('')
const newViewInput = ref<HTMLInputElement | null>(null)
function startAddView() { addingView.value = true; newViewName.value = ''; nextTick(() => newViewInput.value?.focus()) }
function commitAddView() {
  if (!addingView.value) return
  const name = newViewName.value.trim()
  addingView.value = false
  if (!name) return
  const v: BvView = { id: `bvview-${Date.now()}`, name, filters: { ...filters } }
  views.push(v)
  activeViewId.value = v.id
  toast.notify({ variant: 'success', title: t('View saved'), rootProps: { class: 'toast-enterprise' } })
}
function cancelAddView() { addingView.value = false }

const editingViewId = ref('')
const editViewName = ref('')
function startEditView(v: BvView) {
  editingViewId.value = v.id; editViewName.value = v.name
  nextTick(() => { const el = document.querySelector('.bvr-view-edit') as HTMLInputElement | null; el?.focus(); el?.select() })
}
function commitEditView() {
  if (!editingViewId.value) return
  const name = editViewName.value.trim()
  const v = views.find((x) => x.id === editingViewId.value)
  editingViewId.value = ''
  if (name && v) { v.name = name; toast.notify({ variant: 'success', title: t('View renamed'), rootProps: { class: 'toast-enterprise' } }) }
}
function cancelEditView() { editingViewId.value = '' }

const delViewOpen = ref(false)
const delViewTarget = ref<BvView | null>(null)
function askDeleteView(v: BvView) { delViewTarget.value = v; delViewOpen.value = true }
function confirmDeleteView() {
  const v = delViewTarget.value; if (!v) return
  const i = views.findIndex((x) => x.id === v.id)
  if (i !== -1) views.splice(i, 1)
  if (activeViewId.value === v.id) activeViewId.value = 'default'
  delViewTarget.value = null
  toast.notify({ variant: 'success', title: t('View deleted'), rootProps: { class: 'toast-enterprise' } })
}
const allViewsOpen = ref(false)

// ── Full screen ──────────────────────────────────────────────────────────────
const fullscreen = ref(false)
const { isReportFullscreen } = useReportFullscreen()
watch(fullscreen, (v) => { isReportFullscreen.value = v })
onBeforeUnmount(() => { isReportFullscreen.value = false })

// ── Airene — grounded on this report ─────────────────────────────────────────
const aireneBridge = useAireneBridge()
const AIRENE_SUGGESTIONS = [
  'Which accounts are over budget?',
  'Where is the biggest variance this period?',
  'Is the budget on track for net profit?',
  'Summarise this report in 3 bullets',
]
function buildReportGround(): string {
  if (reportState.value !== 'ready') {
    return 'Budget Variance report (Reports › Financials › Budget Variance), IDR. No report generated yet — the user has not applied a budget window.'
  }
  const lines = sections.value.flatMap((s) => s.accounts.map((a) => {
    const parts = buckets.value.map((b) => {
      const bud = bvBudget(a.code, b.key, b.months)
      const act = bvActual(a.code, b.key, b.months)
      return `${b.label}: budget ${formatIDR(bud)}, actual ${formatIDR(act)}, variance ${formatIDR(act - bud)}`
    })
    return `- ${accountLabel(a)}${isContra(a) ? ' (contra — deducted)' : ''} — ${parts.join('; ')}`
  }))
  return `Budget Variance report (Reports › Financials › Budget Variance), IDR, read-only. `
    + `Budget "${budget.value.name}" for ${rangeCaption.value}, bucketed every ${showEveryMonths(appliedEvery.value)} month(s).`
    + `${compareOn.value ? ` Sliced by the "${compareDimension.value?.name}" dimension (${comparePeriodLabel(compareSettings.period)}).` : ''}\n`
    + `${lines.join('\n')}\n`
    + `Variance is actual minus budget; a negative variance is flagged "Exceeds budget". `
    + `Amounts in parentheses are negative.`
}
function openAirene() { aireneBridge.openWithContext(buildReportGround(), 'Budget Variance report', AIRENE_SUGGESTIONS) }

// ── Export ───────────────────────────────────────────────────────────────────
const exporting = ref(false)
function exportExcel() {
  if (exporting.value || reportState.value !== 'ready') { infoToast(t('Generate the report first.')); return }
  exporting.value = true
  toast.notify({ variant: 'information', title: t('Your file is being prepared. You’ll be notified when it’s ready to download.'), rootProps: { class: 'toast-enterprise' } })
  window.setTimeout(() => {
    exporting.value = false
    const esc = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const cols = flatColumns.value
    const row = (label: string, f: RowPair) => [label, ...cols.map((c) => cell(f, c).text)].map(esc).join(',')
    const lines = [
      `Budget Variance — ${budget.value.name} — ${rangeCaption.value}`,
      ['', ...cols.map((c) => (banded.value ? c.value.toUpperCase() : ''))].map(esc).join(','),
      ['', ...cols.map((c) => c.bucket.label.toUpperCase())].map(esc).join(','),
      ['Account', ...cols.map((c) => c.label)].map(esc).join(','),
    ]
    for (const s of sections.value) {
      lines.push(esc(s.label.toUpperCase()))
      for (const a of s.accounts) lines.push(row(accountLabel(a), accountPair(a.code)))
      lines.push(row(s.totalLabel, sectionPair(s.key)))
      const after = profitAfter(s.key)
      if (after) lines.push(row(after.label, profitPair(after.key)))
    }
    const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' })
    const el = document.createElement('a'); el.href = URL.createObjectURL(blob); el.download = 'budget-variance.csv'; el.click(); URL.revokeObjectURL(el.href)
    toast.notify({ variant: 'success', title: t('File ready to download'), description: t('Saved to Export history for 7 days.'), rootProps: { class: 'toast-enterprise' } })
  }, 1600)
}
function exportPdf() { infoToast(t('PDF export — coming soon')) }
</script>

<template>
  <div class="bvr" :class="{ 'bvr--full': fullscreen }">
    <!-- ── Title bar — the budget is switchable from the title itself ── -->
    <header v-if="!fullscreen" class="bvr-titlebar">
      <div class="bvr-titlebar-left">
        <button class="bvr-breadcrumb" type="button" @click="router.push('/financial-report')">{{ t('Financials') }}</button>
        <div class="bvr-title-row">
          <h1 class="bvr-title">{{ t('Budget Variance') }}: {{ budget.name }} <span class="bvr-title-cur">(IDR)</span></h1>
          <MpPopover id="bvr-budget" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
            <MpPopoverTrigger>
              <button class="bvr-title-caret" type="button" :aria-label="t('Switch budget')"><MpIcon name="caret-down" size="sm" /></button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '220px', width: 'max-content' })">
              <MpPopoverList>
                <MpPopoverListItem v-for="b in BUDGETS" :key="b.id" :is-active="b.id === budgetId" @click="budgetId = b.id">{{ b.name }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>
    </header>

    <div class="bvr-stage">
      <!-- ── Controls ── -->
      <div v-if="!fullscreen" class="bvr-controls">
        <div class="bvr-controls-left">
          <div class="bvr-field">
            <span class="bvr-field-label">{{ t('Budget ends in') }}</span>
            <MpPopover id="bvr-endmonth" use-portal :is-keep-alive="false" placement="bottom-start">
              <MpPopoverTrigger>
                <button class="bvr-monthfield" type="button">
                  <span>{{ endMonthLabel }}</span>
                  <MpIcon name="calendar" size="sm" />
                </button>
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ width: 'max-content', padding: '12px' })">
                <div class="bvr-monthgrid-head">
                  <button class="bvr-monthnav" type="button" :aria-label="t('Previous year')" @click="monthPickerYear--"><MpIcon name="caret-left" size="sm" /></button>
                  <span class="bvr-monthgrid-year">{{ monthPickerYear }}</span>
                  <button class="bvr-monthnav" type="button" :aria-label="t('Next year')" @click="monthPickerYear++"><MpIcon name="caret-right" size="sm" /></button>
                </div>
                <div class="bvr-monthgrid">
                  <button
                    v-for="(m, i) in MONTHS"
                    :key="m"
                    class="bvr-monthcell"
                    :class="{ 'is-active': pendingEndMonth.getFullYear() === monthPickerYear && pendingEndMonth.getMonth() === i }"
                    type="button"
                    @click="pickMonth(i)"
                  >{{ m }}</button>
                </div>
              </MpPopoverContent>
            </MpPopover>
          </div>

          <div class="bvr-field">
            <span class="bvr-field-label">{{ t('Budget from') }}</span>
            <MpPopover id="bvr-from" is-close-on-select use-portal :is-keep-alive="false">
              <MpPopoverTrigger>
                <MpSelect id="bvr-from-select" :model-value="pendingFrom" :class="css({ width: '160px' })" @mousedown.prevent>
                  <option :value="pendingFrom">{{ t(fromLabel) }}</option>
                </MpSelect>
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content' })">
                <MpPopoverList>
                  <MpPopoverListItem v-for="o in BUDGET_FROM_OPTIONS" :key="o.value" :is-active="o.value === pendingFrom" @click="pendingFrom = o.value; formError = ''">{{ t(o.label) }}</MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
          </div>

          <div class="bvr-field">
            <span class="bvr-field-label">{{ t('Show every') }}</span>
            <MpPopover id="bvr-every" is-close-on-select use-portal :is-keep-alive="false">
              <MpPopoverTrigger>
                <MpSelect id="bvr-every-select" :model-value="pendingEvery" :class="css({ width: '140px' })" @mousedown.prevent>
                  <option :value="pendingEvery">{{ t(everyLabel) }}</option>
                </MpSelect>
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ minWidth: '140px', width: 'max-content' })">
                <MpPopoverList>
                  <MpPopoverListItem v-for="o in SHOW_EVERY_OPTIONS" :key="o.value" :is-active="o.value === pendingEvery" @click="pendingEvery = o.value; formError = ''">{{ t(o.label) }}</MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
          </div>

          <button class="bvr-apply" type="button" @click="applyReport">{{ t('Apply') }}</button>
          <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" type="button" @click="drawerOpen = true">
            <MpIcon name="filter" size="sm" /> {{ t('All filters') }}
            <span v-if="activeFilterCount" class="bvr-allfilters-count">{{ activeFilterCount }}</span>
          </button>
        </div>

        <div class="bvr-controls-right">
          <MpTooltip id="bvr-airene" :label="t('Ask Airene')" placement="bottom" use-portal>
            <button class="bvr-icon-btn bvr-icon-btn--airene" type="button" :aria-label="t('Ask Airene')" @click="openAirene">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
              </svg>
            </button>
          </MpTooltip>

          <ColumnSettingsMenu id="bvr-columns" :items="columnItems" :visibility="colVis" :tooltip="t('Column settings')" />

          <MpPopover id="bvr-export" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <button class="btn-enterprise btn-enterprise--secondary bvr-export" type="button">
                {{ t('Export') }}
                <MpIcon name="caret-down" size="sm" />
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content' })">
              <MpPopoverList>
                <MpPopoverListItem @click="exportExcel">{{ t('Export to Excel') }}</MpPopoverListItem>
                <MpPopoverListItem @click="exportPdf">{{ t('Export to PDF') }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>

      <!-- ── Compare — opens the shared Comparison drawer ── -->
      <div v-if="!fullscreen" class="bvr-comparebar">
        <MpToggle id="bvr-compare" :is-checked="compareOn" @change="onCompareControl" />
        <button class="bvr-compare-trigger" type="button" @click="compareDrawerOpen = true">
          <span :class="{ 'bvr-compare-label': compareOn }">{{ t('Compare') }}{{ compareOn ? ':' : '' }}</span>
          <span v-if="compareOn" class="bvr-compare-basis">{{ compareCaption }}</span>
          <MpIcon name="caret-down" size="sm" />
        </button>
      </div>
      <p v-if="!fullscreen && formError" class="bvr-form-error">{{ formError }}</p>
      <p v-if="!fullscreen && compareOn && isDemoDimensions" class="bvr-demo-note">
        {{ t('Showing sample dimensions.') }}
        <a class="bvr-demo-link" @click="router.push('/dimensions')">{{ t('Set up your dimensions') }}</a>
      </p>

      <!-- Active-filter badges -->
      <div v-if="!fullscreen && activeFilterCount" class="bvr-badges">
        <span v-if="filters.accountKeyword" class="bvr-fbadge">“{{ filters.accountKeyword }}”<button type="button" :aria-label="t('Remove')" @click="filters.accountKeyword = ''"><MpIcon name="close" size="sm" /></button></span>
        <span v-if="filters.onlyExceeding" class="bvr-fbadge">{{ t('Only accounts exceeding budget') }}<button type="button" :aria-label="t('Remove')" @click="filters.onlyExceeding = false"><MpIcon name="close" size="sm" /></button></span>
        <span v-if="!filters.showZero" class="bvr-fbadge">{{ t('Hiding accounts with no budget') }}<button type="button" :aria-label="t('Remove')" @click="filters.showZero = true"><MpIcon name="close" size="sm" /></button></span>
        <button class="bvr-reset" type="button" @click="resetFilters">{{ t('Reset filter') }}</button>
      </div>

      <!-- ── View tabs ── -->
      <div v-if="!fullscreen" class="bvr-viewbar">
        <div class="bvr-views">
          <button class="bvr-viewtab" :class="{ 'is-active': activeViewId === 'default' }" type="button" @click="selectView('default')">{{ t('Default view') }}</button>

          <template v-for="v in views" :key="v.id">
            <span v-if="editingViewId === v.id" class="bvr-viewtab bvr-viewtab--editing">
              <input v-model="editViewName" class="bvr-viewtab-input bvr-view-edit" @keydown.enter.prevent="commitEditView" @keydown.esc="cancelEditView" @blur="commitEditView" />
            </span>
            <span v-else class="bvr-viewtab-wrap">
              <button class="bvr-viewtab" :class="{ 'is-active': activeViewId === v.id }" type="button" @click="selectView(v.id)">{{ v.name }}</button>
              <MpPopover :id="`bvr-view-${v.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
                <MpPopoverTrigger>
                  <button class="bvr-view-kebab" type="button" :aria-label="t('View options')"><MpIcon name="menu-kebab" size="sm" /></button>
                </MpPopoverTrigger>
                <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content' })">
                  <MpPopoverList>
                    <MpPopoverListItem @click="startEditView(v)">{{ t('Edit view name') }}</MpPopoverListItem>
                    <MpPopoverListItem @click="askDeleteView(v)">{{ t('Delete') }}</MpPopoverListItem>
                  </MpPopoverList>
                </MpPopoverContent>
              </MpPopover>
            </span>
          </template>

          <span v-if="addingView" class="bvr-viewtab bvr-viewtab--editing">
            <input ref="newViewInput" v-model="newViewName" class="bvr-viewtab-input" :placeholder="t('View name')" @keydown.enter.prevent="commitAddView" @keydown.esc="cancelAddView" @blur="commitAddView" />
          </span>
          <button v-else class="bvr-addview" type="button" @click="startAddView"><MpIcon name="add" size="sm" /> {{ t('Add view') }}</button>

          <button class="bvr-allviews" type="button" @click="allViewsOpen = true">{{ t('All views') }}</button>
        </div>
        <div class="bvr-viewbar-right">
          <MpTooltip id="bvr-fs-enter" :label="t('Full screen')" placement="bottom-end" use-portal>
            <button class="bvr-fs-btn" type="button" :aria-label="t('Full screen')" @click="fullscreen = true"><MpIcon name="full-screen" size="md" /></button>
          </MpTooltip>
        </div>
      </div>

      <!-- ── Report ── -->
      <div class="bvr-report">
        <div v-if="fullscreen" class="bvr-fs-topbar">
          <span class="bvr-fs-title">{{ t('Budget Variance') }}: {{ budget.name }} <span class="bvr-title-cur">(IDR)</span></span>
          <MpTooltip id="bvr-fs-exit" :label="t('Exit full screen')" placement="bottom-end" use-portal>
            <button class="bvr-fs-btn" type="button" :aria-label="t('Exit full screen')" @click="fullscreen = false"><MpIcon name="minimize" size="md" /></button>
          </MpTooltip>
        </div>

        <!-- Idle -->
        <div v-if="reportState === 'idle'" class="bvr-empty bvr-empty--idle">
          <img src="/illustrations/report-empty.png" alt="" class="bvr-empty-img" width="240" height="200" />
          <p class="bvr-empty-title">{{ t('Report data will appear here') }}</p>
          <p class="bvr-empty-desc">{{ t('Select a budget window, then click Apply button.') }}</p>
        </div>

        <template v-else>
          <div class="bvr-report-head">
            <span class="bvr-report-range">{{ rangeCaption }}</span>
            <span class="bvr-report-updated">{{ lastUpdated }}</span>
          </div>

          <!-- Loading skeleton -->
          <div v-if="reportState === 'loading'" class="bvr-table-wrap">
            <table class="bvr-table">
              <thead>
                <tr>
                  <th class="bvr-th bvr-th--account" />
                  <th v-for="c in flatColumns" :key="c.id" class="bvr-th bvr-th--num"><MpSkeleton class="bvr-skel" height="10px" width="56px" rounded="sm" duration="0s" /></th>
                </tr>
              </thead>
              <tbody>
                <tr class="bvr-row bvr-row--section">
                  <td class="bvr-td bvr-td--account bvr-td--section"><MpSkeleton class="bvr-skel" height="10px" width="72px" rounded="sm" duration="0s" /></td>
                  <td v-for="c in flatColumns" :key="c.id" class="bvr-td bvr-td--section" />
                </tr>
                <tr v-for="n in 4" :key="n" class="bvr-row">
                  <td class="bvr-td bvr-td--account"><MpSkeleton class="bvr-skel" height="10px" width="200px" rounded="sm" duration="0s" /></td>
                  <td v-for="c in flatColumns" :key="c.id" class="bvr-td bvr-td--num"><MpSkeleton class="bvr-skel" height="10px" width="88px" rounded="sm" duration="0s" /></td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Ready + data -->
          <div v-else-if="hasRows" class="bvr-table-wrap">
            <table class="bvr-table">
              <thead>
                <!-- Dimension band — only while comparing (Figma 4481:243957) -->
                <tr v-if="banded">
                  <th class="bvr-th bvr-th--account bvr-th--band" />
                  <th v-for="g in columnGroups" :key="g.id" class="bvr-th bvr-th--band" :colspan="g.bands.reduce((n, b) => n + b.cols.length, 0)">{{ g.label }}</th>
                </tr>
                <!-- Period band -->
                <tr>
                  <th class="bvr-th bvr-th--account bvr-th--band" />
                  <th v-for="b in bands" :key="b.id" class="bvr-th bvr-th--band" :colspan="b.cols.length">{{ b.label }}</th>
                </tr>
                <!-- Metrics -->
                <tr>
                  <th class="bvr-th bvr-th--account" />
                  <th v-for="c in flatColumns" :key="c.id" class="bvr-th bvr-th--num">{{ t(c.label) }}</th>
                </tr>
              </thead>

              <tbody>
                <template v-for="s in sections" :key="s.key">
                  <!-- Section header -->
                  <tr class="bvr-row bvr-row--section">
                    <td class="bvr-td bvr-td--account bvr-td--section">{{ t(s.label).toUpperCase() }}</td>
                    <td v-for="c in flatColumns" :key="c.id" class="bvr-td bvr-td--section" />
                  </tr>

                  <!-- Accounts -->
                  <tr v-for="a in s.accounts" :key="a.code" class="bvr-row">
                    <td class="bvr-td bvr-td--account">
                      <a class="bvr-account-link" @click="infoToast(`${accountLabel(a)} — ${t('opening general ledger')}`)">{{ accountLabel(a) }}</a>
                      <span v-if="isContraAccount(a)" class="bvr-contra" :title="t('Deducted from its section subtotal')">−</span>
                    </td>
                    <td v-for="c in flatColumns" :key="c.id" class="bvr-td bvr-td--num" :class="{ 'bvr-over': cell(accountPair(a.code), c).over }">
                      {{ cell(accountPair(a.code), c).text }}
                      <span v-if="cell(accountPair(a.code), c).over && c.metric !== 'budget' && c.metric !== 'actual'" class="bvr-over-note">{{ t('Exceeds budget') }}</span>
                    </td>
                  </tr>

                  <!-- Section subtotal -->
                  <tr class="bvr-row bvr-row--subtotal">
                    <td class="bvr-td bvr-td--account bvr-strong">{{ t(s.totalLabel) }}</td>
                    <td v-for="c in flatColumns" :key="c.id" class="bvr-td bvr-td--num bvr-strong" :class="{ 'bvr-over': cell(sectionPair(s.key), c).over }">
                      {{ cell(sectionPair(s.key), c).text }}
                    </td>
                  </tr>

                  <!-- Derived profit line -->
                  <tr v-if="profitAfter(s.key)" class="bvr-row bvr-row--profit">
                    <td class="bvr-td bvr-td--account bvr-strong">{{ t(profitAfter(s.key)!.label) }}</td>
                    <td v-for="c in flatColumns" :key="c.id" class="bvr-td bvr-td--num bvr-strong" :class="{ 'bvr-over': cell(profitPair(profitAfter(s.key)!.key), c).over }">
                      {{ cell(profitPair(profitAfter(s.key)!.key), c).text }}
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>

          <!-- Ready, but nothing matches -->
          <div v-else class="bvr-empty">
            <img src="/illustrations/empty-folder.png" alt="" class="bvr-empty-img" width="240" height="200" />
            <p class="bvr-empty-title">{{ t('No data matches this filter.') }}</p>
            <button class="bvr-empty-cta" type="button" @click="resetFilters">{{ t('Reset filter') }}</button>
          </div>
        </template>
      </div>
    </div>

    <!-- ── All filters drawer ── -->
    <BudgetVarianceFiltersDrawer v-model:is-open="drawerOpen" :model-value="filters" @apply="onApplyFilters" />

    <!-- ── Comparison drawer (shared with the Multidimensional report) ── -->
    <MultidimensionalCompareDrawer v-model:is-open="compareDrawerOpen" :model-value="compareSettings" @apply="onApplyCompare" />

    <!-- ── All views drawer ── -->
    <Transition name="bvr-vd">
      <div v-if="allViewsOpen" class="bvr-vd-overlay" @click.self="allViewsOpen = false">
        <div class="bvr-vd-panel" role="dialog" :aria-label="t('All views')">
          <header class="bvr-vd-head">
            <span class="bvr-vd-title">{{ t('All views') }}</span>
            <button class="bvr-vd-close" type="button" :aria-label="t('Close')" @click="allViewsOpen = false"><MpIcon name="close" size="md" /></button>
          </header>
          <div class="bvr-vd-body">
            <button class="bvr-view-item" :class="{ 'is-active': activeViewId === 'default' }" type="button" @click="selectView('default'); allViewsOpen = false">{{ t('Default view') }}</button>
            <div v-for="v in views" :key="v.id" class="bvr-view-item-row">
              <button class="bvr-view-item" :class="{ 'is-active': activeViewId === v.id }" type="button" @click="selectView(v.id); allViewsOpen = false">{{ v.name }}</button>
              <button class="bvr-view-del" type="button" :aria-label="t('Delete')" @click="askDeleteView(v)"><MpIcon name="trash" size="sm" /></button>
            </div>
            <p v-if="!views.length" class="bvr-vd-hint">{{ t('Saved views will appear here.') }}</p>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ── Delete view confirmation ── -->
    <ConfirmModal
      v-model:is-open="delViewOpen"
      :title="t('Delete view')"
      :description="`“${delViewTarget?.name}” ${t('will be permanently deleted.')}`"
      :confirm-label="t('Delete')"
      :cancel-label="t('Cancel')"
      is-danger
      @confirm="confirmDeleteView"
    />
  </div>
</template>

<style scoped>
.bvr { display: flex; flex-direction: column; height: 100%; min-height: 0; }

.bvr-titlebar { flex-shrink: 0; min-height: 72px; background: var(--mp-background-neutral-subtle); display: flex; align-items: center; padding: 0 var(--mp-spacing-6); }
.bvr-titlebar-left { display: flex; flex-direction: column; justify-content: center; }
.bvr-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm, 12px); line-height: var(--mp-line-heights-sm, 16px); color: var(--mp-text-link); font-family: inherit; }
.bvr-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.bvr-title-row { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.bvr-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.bvr-title-cur { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); }
.bvr-title-caret { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border: none; background: none; border-radius: var(--mp-radii-sm, 4px); cursor: pointer; color: var(--mp-icon-default, #536062); }
.bvr-title-caret:hover { background: var(--mp-background-neutral-hovered); }

.bvr-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage, #fff); border-top-left-radius: var(--mp-radii-lg, 12px); padding: var(--mp-spacing-5, 20px) var(--mp-spacing-6, 24px) var(--mp-spacing-6, 24px); display: flex; flex-direction: column; gap: var(--mp-spacing-3, 12px); }

.bvr-controls { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.bvr-controls-left { display: flex; align-items: flex-end; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.bvr-controls-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.bvr-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.bvr-field-label { font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-text-default); line-height: var(--mp-line-heights-sm, 16px); }

/* Month field — matches the date picker's trigger, with a calendar affordance. */
.bvr-monthfield {
  display: inline-flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2);
  width: 180px; height: 36px; padding: 0 var(--mp-spacing-3);
  background: var(--mp-background-neutral, #fff);
  border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16));
  border-radius: var(--mp-radii-md, 6px);
  font-family: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); cursor: pointer;
}
.bvr-monthfield:hover { border-color: var(--mp-border-bold); }
.bvr-monthgrid-head { display: flex; align-items: center; justify-content: space-between; padding-bottom: var(--mp-spacing-2); }
.bvr-monthgrid-year { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bvr-monthnav { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: none; background: none; border-radius: var(--mp-radii-sm, 4px); cursor: pointer; color: var(--mp-icon-default); }
.bvr-monthnav:hover { background: var(--mp-background-neutral-subtle); }
.bvr-monthgrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; width: 240px; }
.bvr-monthcell { height: 32px; border: none; background: none; border-radius: var(--mp-radii-md, 6px); cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.bvr-monthcell:hover { background: var(--mp-background-neutral-subtle); }
.bvr-monthcell.is-active { background: var(--mp-background-brand-bold, #0a6e4e); color: #fff; font-weight: var(--mp-font-weights-semi-bold); }

.bvr-apply { height: 36px; padding: 0 var(--mp-spacing-4); border: none; border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-brand-bold, #0a6e4e); color: #fff; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold, 600); cursor: pointer; font-family: inherit; }
.bvr-apply:hover { background: var(--mp-background-brand-bold-hovered, #095c41); }
.bvr-allfilters-count { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 5px; margin-left: 2px; border-radius: 999px; background: var(--mp-background-brand-bold, #0a6e4e); color: #fff; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); }
.bvr-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-default); }
.bvr-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
.bvr-icon-btn--airene { color: var(--mp-airene-default, #7c3aed); }
.bvr-export { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); }

.bvr-comparebar { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.bvr-compare-trigger { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); border: none; background: none; padding: 0; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.bvr-compare-label { font-weight: var(--mp-font-weights-semi-bold, 600); }
.bvr-compare-basis { color: var(--mp-text-secondary); }
.bvr-form-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #c62828); }
.bvr-demo-note { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.bvr-demo-link { color: var(--mp-text-link); cursor: pointer; }
.bvr-demo-link:hover { text-decoration: underline; text-underline-offset: 2px; }

.bvr-badges { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.bvr-fbadge { display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 var(--mp-spacing-2) 0 var(--mp-spacing-3); border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral-subtle, #eceef0); font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-default); }
.bvr-fbadge button { display: inline-flex; align-items: center; border: none; background: none; cursor: pointer; color: var(--mp-icon-subtle, #97a0af); padding: 0; }
.bvr-fbadge button:hover { color: var(--mp-text-default); }
.bvr-reset { border: none; background: none; cursor: pointer; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); text-decoration: underline; text-underline-offset: 2px; font-family: inherit; }

.bvr-viewbar { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--mp-border-default); }
.bvr-views { display: flex; align-items: center; gap: var(--mp-spacing-5); }
.bvr-viewtab { position: relative; border: none; background: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); padding: var(--mp-spacing-3) 0; }
.bvr-viewtab:not(.is-active):hover { color: var(--mp-text-default); }
.bvr-viewtab.is-active { color: var(--mp-text-selected); font-weight: var(--mp-font-weights-semi-bold); }
.bvr-viewtab.is-active::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: var(--mp-text-selected); border-radius: 2px 2px 0 0; }
.bvr-addview { display: inline-flex; align-items: center; gap: 4px; border: none; background: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); padding: var(--mp-spacing-3) 0; }
.bvr-addview:hover { color: var(--mp-text-link); }
.bvr-allviews { border: none; background: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); padding: var(--mp-spacing-3) 0; text-decoration: underline; text-underline-offset: 2px; }
.bvr-viewtab-wrap { display: inline-flex; align-items: center; gap: 2px; }
.bvr-viewtab-wrap .bvr-viewtab { padding-right: 0; }
.bvr-view-kebab { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border: none; background: none; cursor: pointer; color: var(--mp-icon-subtle, #97a0af); border-radius: var(--mp-radii-sm, 4px); visibility: hidden; }
.bvr-viewtab-wrap:hover .bvr-view-kebab,
.bvr-viewtab-wrap:focus-within .bvr-view-kebab { visibility: visible; }
.bvr-view-kebab:hover { background: var(--mp-background-neutral-subtle); color: var(--mp-text-default); }
.bvr-viewtab--editing { display: inline-flex; align-items: center; padding: var(--mp-spacing-2) 0; }
.bvr-viewtab-input { width: 140px; height: 28px; padding: 0 8px; border: 1px solid var(--mp-border-brand, #0a6e4e); border-radius: var(--mp-radii-md, 6px); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none; font-family: inherit; }
.bvr-viewbar-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.bvr-fs-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default, #536062); }
.bvr-fs-btn:hover { background: var(--mp-background-neutral-subtle); }

.bvr-report { display: flex; flex-direction: column; min-width: 0; }
.bvr-fs-topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--mp-spacing-2); }
.bvr-fs-title { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bvr-report-head { display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-2) 0; }
.bvr-report-range, .bvr-report-updated { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }

/* Table — the account column is sticky so it survives horizontal scroll. */
.bvr-table-wrap { overflow-x: auto; }
.bvr-table { width: 100%; border-collapse: separate; border-spacing: 0; }
.bvr-th {
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral, #fff);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; letter-spacing: 0.3px; color: var(--mp-text-secondary);
  text-align: right; white-space: nowrap;
}
.bvr-th--num { min-width: 160px; }
.bvr-th--account { position: sticky; left: 0; z-index: 3; width: 260px; min-width: 260px; text-align: left; border-right: 1px solid var(--mp-border-default); }
/* Band rows — the dimension value and the period each column set belongs to. */
.bvr-th--band { text-align: left; border-left: 1px solid var(--mp-border-default); }
.bvr-th--band.bvr-th--account { border-left: none; }

.bvr-td {
  height: 40px; padding: var(--mp-spacing-2\.5, 10px) var(--mp-spacing-3);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-default);
  vertical-align: middle; white-space: nowrap; background: var(--mp-background-neutral, #fff);
}
.bvr-td--num { text-align: right; font-variant-numeric: tabular-nums; }
.bvr-td--account { position: sticky; left: 0; z-index: 1; width: 260px; min-width: 260px; border-right: 1px solid var(--mp-border-default); overflow: hidden; text-overflow: ellipsis; }
.bvr-strong { font-weight: var(--mp-font-weights-semi-bold, 600); }

/* Over-budget cell — red figure with the "Exceeds budget" caption beneath. */
.bvr-over { color: var(--mp-text-danger, #a8352d); }
.bvr-over-note { display: block; font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-regular, 400); color: var(--mp-text-danger, #a8352d); }

.bvr-account-link { color: var(--mp-text-link); cursor: pointer; }
.bvr-account-link:hover { text-decoration: underline; text-underline-offset: 2px; }
/* Contra marker — this account is deducted by its section subtotal. */
.bvr-contra { margin-left: 4px; color: var(--mp-text-secondary); cursor: help; }

.bvr-row--section .bvr-td { background: var(--mp-background-neutral-subtle, #f4f5f7); }
.bvr-td--section { font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold, 600); text-transform: uppercase; letter-spacing: 0.3px; color: var(--mp-text-secondary); height: 32px; }
.bvr-row:hover .bvr-td:not(.bvr-td--section) { background: var(--mp-background-neutral-subtle, #f8f9f9); }
.bvr-row--profit .bvr-td { border-top: 1px solid var(--mp-border-default); }

.bvr-empty { display: flex; flex-direction: column; align-items: center; padding: var(--mp-spacing-10, 40px) 0; }
.bvr-empty--idle { padding: 72px 0 64px; }
.bvr-empty-img { width: 240px; height: 200px; object-fit: contain; }
.bvr-empty-title { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bvr-empty-desc { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.bvr-empty-cta { margin-top: var(--mp-spacing-3); height: 36px; padding: 0 var(--mp-spacing-4); border: 1px solid var(--mp-border-bold); background: var(--mp-background-neutral); border-radius: var(--mp-radii-full, 999px); cursor: pointer; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-text-default); font-family: inherit; }
.bvr-skel { display: inline-block; background-color: var(--mp-border-default) !important; background-image: none !important; animation: none !important; }

/* All-views drawer */
.bvr-vd-enter-active, .bvr-vd-leave-active { transition: background-color 200ms ease; }
.bvr-vd-enter-from, .bvr-vd-leave-to { background-color: transparent; }
.bvr-vd-enter-active .bvr-vd-panel { transition: transform 300ms ease-out; }
.bvr-vd-enter-from .bvr-vd-panel, .bvr-vd-leave-to .bvr-vd-panel { transform: translateX(calc(100% + 12px)); }
.bvr-vd-overlay { position: fixed; inset: 0; z-index: 1300; background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45)); display: flex; justify-content: flex-end; }
.bvr-vd-panel { margin: var(--mp-spacing-3); width: min(400px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); border-radius: 24px; overflow: hidden; }
.bvr-vd-head { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); }
.bvr-vd-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bvr-vd-close { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: none; background: none; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.bvr-vd-close:hover { background: var(--mp-background-neutral-hovered); }
.bvr-vd-body { flex: 1; overflow-y: auto; padding: var(--mp-spacing-4); display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.bvr-vd-hint { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.bvr-view-item { text-align: left; padding: var(--mp-spacing-2) var(--mp-spacing-3); border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); flex: 1; font-family: inherit; }
.bvr-view-item:hover { background: var(--mp-background-neutral-subtle); }
.bvr-view-item.is-active { background: var(--mp-background-brand-subtle, #e8f5f0); color: var(--mp-text-brand, #0a6e4e); font-weight: var(--mp-font-weights-medium, 500); }
.bvr-view-item-row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.bvr-view-del { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-subtle, #97a0af); }
.bvr-view-del:hover { background: var(--mp-background-danger-subtle, #fdecec); color: var(--mp-text-danger, #c62828); }

.bvr--full .bvr-stage { border-radius: 0; padding-top: var(--mp-spacing-4); }
</style>
