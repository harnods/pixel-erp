<script setup lang="ts">
/**
 * Multidimensional report — Reports › Financials › Multidimensional.
 * Figma "Multidimensional Report" 4836-56598 (Reports / Cost & Profit Center).
 *
 * A profit & loss sliced by ONE dimension: accounts down the rows, the chosen
 * dimension's values across the columns, TOTAL on the right. The first column is
 * sticky so the account tree stays readable while the value columns scroll.
 *
 * State machine matches the four Figma frames:
 *   idle    → illustration + "Report data will appear here"
 *   loading → skeleton rows
 *   ready   → the pivot table
 * Nothing is generated until Apply — picking a period or a dimension only stages
 * it (same contract as the Credit Memo report, CreditMemoReportPage.vue).
 *
 * Compare (the toggle under the toolbar) is shown off in every Figma frame; when
 * switched on it appends a comparison-period TOTAL and a change % column at the
 * far right rather than doubling every dimension column.
 */
import { ref, computed, reactive, watch, nextTick, onBeforeUnmount } from 'vue'
import { useReportFullscreen } from '~/composables/useReportFullscreen'
import { useAireneBridge } from '~/composables/useAireneBridge'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import {
  MpIcon, MpTooltip, MpToggle, MpSkeleton, MpSelect,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css, toast,
} from '@mekari/pixel3'
import AdvancedDateRangePicker from '~/components/patterns/AdvancedDateRangePicker.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import MultidimensionalFiltersDrawer from '~/components/patterns/MultidimensionalFiltersDrawer.vue'
import MultidimensionalCompareDrawer from '~/components/patterns/MultidimensionalCompareDrawer.vue'
import { formatIDR } from '~/utils/currency'
import { infoToast } from '~/utils/toasts'
import {
  MD_SECTIONS, reportDimensions, getReportDimension, usingDemoDimensions, mdAmount, mdSectionTotal, mdProfitLines,
  emptyMdFilters, emptyCompareSettings, comparePeriodLabel, comparePeriodCount,
  multidimensionalViews, addMdView, updateMdView, deleteMdView,
  type MdAccount, type MdFilters, type MdSavedView, type MdCompareSettings,
} from '~/data/multidimensionalReport'

const { t } = useLocale()
const router = useRouter()

// ── Period ───────────────────────────────────────────────────────────────────
function d(y: number, m: number, day: number) { return new Date(y, m, day) }
const pendingRange = ref<Date[]>([d(2026, 11, 1), d(2026, 11, 31)])
const appliedRange = ref<Date[]>([d(2026, 11, 1), d(2026, 11, 31)])
const formError = ref('')
function onPendingChange(v: Date[]) { pendingRange.value = v; formError.value = '' }

// ── Dimension ────────────────────────────────────────────────────────────────
const dimensionOptions = computed(() => reportDimensions())
// The picker falls back to a sample Branch/Cost centre/Project set while the
// tenant has no reportable dimensions of its own — say so, so nobody reads the
// sample columns as their own data.
const isDemoDimensions = computed(() => usingDemoDimensions())
const pendingDimensionId = ref('')
const appliedDimensionId = ref('')
const pendingDimensionName = computed(() => getReportDimension(pendingDimensionId.value)?.name ?? '')
const appliedDimension = computed(() => getReportDimension(appliedDimensionId.value))
function pickDimension(id: string) { pendingDimensionId.value = id; formError.value = '' }

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
  const [s, e] = pendingRange.value
  if (!s || !e) { formError.value = t('You must fill in date range'); return }
  if (s > e) { formError.value = t('Start date cannot be after end date.'); return }
  if (!pendingDimensionId.value) { formError.value = t('You must fill in dimension'); return }
  formError.value = ''
  appliedRange.value = [...pendingRange.value]
  appliedDimensionId.value = pendingDimensionId.value
  syncColumnVisibility()
  generate()
}

// ── Compare (Comparison drawer, Figma 4836-67530) ────────────────────────────
// Comparison is off until the drawer is applied: clicking the control opens the
// drawer, and only its Apply switches it on. Toggling an active comparison off
// keeps the last settings, so re-enabling it doesn't ask again.
const compareOn = ref(false)
const compareDrawerOpen = ref(false)
const compareSettings = reactive<MdCompareSettings>(emptyCompareSettings())

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
  `${t(comparePeriodLabel(compareSettings.period))}, ${t(compareSettings.groupBy === 'period' ? 'by period' : 'by dimension')}`)

/** Period key handed to the amount generator — one number set per window. */
function periodKey(range: Date[]): string {
  const [s, e] = range
  return s && e ? `${s.toISOString().slice(0, 10)}..${e.toISOString().slice(0, 10)}` : ''
}

/** One comparable window: the applied period first, then the earlier ones. */
interface MdPeriod { label: string; key: string; range: Date[] }
function shiftYears(range: Date[], n: number): Date[] {
  const [s, e] = range
  return [new Date(s!.getFullYear() - n, s!.getMonth(), s!.getDate()), new Date(e!.getFullYear() - n, e!.getMonth(), e!.getDate())]
}
/** True when the window is exactly one calendar month (1st → last day). */
function isWholeMonth(range: Date[]): boolean {
  const [s, e] = range
  return !!s && !!e && s.getDate() === 1 && e.getMonth() === s.getMonth() && e.getFullYear() === s.getFullYear()
    && e.getDate() === new Date(s.getFullYear(), s.getMonth() + 1, 0).getDate()
}
/** Slide a window back n times. Whole months step by calendar month (so December
 *  is preceded by November, not by "31 Oct – 30 Nov"); anything else steps by the
 *  window's own inclusive length. */
function shiftPeriods(range: Date[], n: number): Date[] {
  const [s, e] = range
  if (isWholeMonth(range)) {
    const start = new Date(s!.getFullYear(), s!.getMonth() - n, 1)
    return [start, new Date(start.getFullYear(), start.getMonth() + 1, 0)]
  }
  const span = e!.getTime() - s!.getTime() + 86_400_000
  return [new Date(s!.getTime() - span * n), new Date(e!.getTime() - span * n)]
}
/** "DEC 2026" for a whole-calendar-month window, otherwise the short range. */
function periodLabel(range: Date[]): string {
  const [s, e] = range
  if (!s || !e) return ''
  return isWholeMonth(range) ? `${MONTHS[s.getMonth()]} ${s.getFullYear()}` : `${fmtDay(s)} - ${fmtDay(e)}`
}
function toPeriod(range: Date[]): MdPeriod { return { label: periodLabel(range), key: periodKey(range), range } }

const periods = computed<MdPeriod[]>(() => {
  const base = toPeriod(appliedRange.value)
  if (!compareOn.value || !compareSettings.period) return [base]
  if (compareSettings.period === 'prev-year') return [base, toPeriod(shiftYears(appliedRange.value, 1))]
  const n = comparePeriodCount(compareSettings.period)
  return [base, ...Array.from({ length: n }, (_, i) => toPeriod(shiftPeriods(appliedRange.value, i + 1)))]
})
const primaryKey = computed(() => periods.value[0]?.key ?? '')

// ── Filters ──────────────────────────────────────────────────────────────────
const filters = reactive<MdFilters>(emptyMdFilters())
const drawerOpen = ref(false)
function onApplyFilters(v: MdFilters) {
  filters.values = [...v.values]
  filters.accountKeyword = v.accountKeyword
  filters.showZero = v.showZero
  syncColumnVisibility()
  if (reportState.value !== 'idle') generate()
}
const activeFilterCount = computed(() =>
  filters.values.length + (filters.accountKeyword ? 1 : 0) + (filters.showZero ? 0 : 1))
function resetFilters() { filters.values = []; filters.accountKeyword = ''; filters.showZero = true; syncColumnVisibility() }
function removeValue(v: string) { filters.values = filters.values.filter((x) => x !== v) }

// ── Columns (dimension values + TOTAL) ───────────────────────────────────────
/** Values kept by the filter drawer — empty selection means "all of them". */
const filteredValues = computed(() => {
  const all = appliedDimension.value?.values ?? []
  return filters.values.length ? all.filter((v) => filters.values.includes(v)) : all
})
const colVis = reactive<Record<string, boolean>>({ total: true })
/** Re-seed visibility whenever the column set changes (new dimension / filter). */
function syncColumnVisibility() {
  for (const v of appliedDimension.value?.values ?? []) if (colVis[v] === undefined) colVis[v] = true
  if (colVis.total === undefined) colVis.total = true
}
const columnItems = computed(() => [
  ...filteredValues.value.map((v) => ({ key: v, label: v })),
  { key: 'total', label: t('Total') },
])
/** Value columns actually rendered. */
const valueColumns = computed(() => filteredValues.value.filter((v) => colVis[v] !== false))
const showTotal = computed(() => colVis.total !== false)

// ── Rows ─────────────────────────────────────────────────────────────────────
function matchesKeyword(a: MdAccount) {
  const q = filters.accountKeyword.trim().toLowerCase()
  if (!q) return true
  return a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
}
/** An account row is dropped when the "no activity" toggle is off and every
 *  visible column is zero. */
function hasActivity(a: MdAccount) {
  return valueColumns.value.some((v) => mdAmount(a.code, v, primaryKey.value) !== 0)
}
function accountFilter(a: MdAccount) { return matchesKeyword(a) && (filters.showZero || hasActivity(a)) }

const sections = computed(() =>
  MD_SECTIONS
    .map((s) => ({ ...s, accounts: s.accounts.filter(accountFilter) }))
    .filter((s) => s.accounts.length > 0))

const hasRows = computed(() => sections.value.length > 0 && valueColumns.value.length > 0)

// ── Amounts ──────────────────────────────────────────────────────────────────
function amount(code: string, value: string, key: string) { return mdAmount(code, value, key) }
function rowTotal(code: string, key: string) {
  return valueColumns.value.reduce((sum, v) => sum + mdAmount(code, v, key), 0)
}
function sectionAmount(sectionKey: string, value: string, key: string) {
  const s = MD_SECTIONS.find((x) => x.key === sectionKey)!
  return mdSectionTotal(s, value, key, accountFilter)
}
function sectionTotal(sectionKey: string, key: string) {
  return valueColumns.value.reduce((sum, v) => sum + sectionAmount(sectionKey, v, key), 0)
}
type ProfitKey = 'grossProfit' | 'operatingProfit' | 'netProfit'
function profit(which: ProfitKey, value: string, key: string) {
  return mdProfitLines(value, key, accountFilter)[which]
}
function profitTotal(which: ProfitKey, key: string) {
  return valueColumns.value.reduce((sum, v) => sum + profit(which, v, key), 0)
}
/** The profit line printed immediately after a section's subtotal, if any —
 *  gross profit closes cost of sales, operating profit closes opex, net profit
 *  closes other income. */
const PROFIT_AFTER: Record<string, { key: ProfitKey; label: string }> = {
  'cost-of-sales': { key: 'grossProfit', label: 'Gross profit' },
  'operating-expenses': { key: 'operatingProfit', label: 'Operating profit' },
  'other-income': { key: 'netProfit', label: 'Net profit (loss)' },
}
function profitAfter(sectionKey: string) { return PROFIT_AFTER[sectionKey] }

/** Money cell: negatives render in parentheses, per the Figma. */
function money(n: number): string {
  return n < 0 ? `(${formatIDR(Math.abs(n))})` : formatIDR(n)
}
/** Period-over-period change; null when the comparison base is zero. The caret
 *  carries the direction, so the label itself is unsigned. */
function changePct(now: number, before: number): number | null {
  if (!before) return null
  return ((now - before) / Math.abs(before)) * 100
}
function fmtPct(p: number | null): string {
  return p === null ? '—' : `${Math.round(Math.abs(p))}%`
}

// ── Column model ─────────────────────────────────────────────────────────────
// Every body cell is addressed by (dimension value, period). `TOTAL_VALUE` is a
// pseudo-value that sums across the visible dimension columns, so the TOTAL
// column needs no special-casing anywhere below.
const TOTAL_VALUE = '__total__'
/** One rendered column: an amount, or the change against the applied period. */
interface MdCol { id: string; label: string; kind: 'amount' | 'delta'; value: string; periodIdx: number }
/** A band of columns under one header (a dimension value, or a period). */
interface MdGroup { id: string; label: string; cols: MdCol[] }

function amountCol(value: string, label: string, periodIdx: number): MdCol {
  return { id: `${value}|${periodIdx}`, label, kind: 'amount', value, periodIdx }
}
function deltaCol(value: string, periodIdx: number): MdCol {
  return { id: `${value}|${periodIdx}|d`, label: '', kind: 'delta', value, periodIdx }
}
/** Value columns plus the TOTAL pseudo-column, when TOTAL is visible. */
const valuesWithTotal = computed(() => (showTotal.value ? [...valueColumns.value, TOTAL_VALUE] : valueColumns.value))
function valueLabel(v: string) { return v === TOTAL_VALUE ? t('Total') : v }

/**
 * Compare off  → one unbanded group: a column per dimension value (+ TOTAL).
 * Group by dimension → a band per dimension value; inside it, one column per
 *   period, each earlier period trailed by its change column.
 * Group by period → a band per period; inside it, one column per dimension
 *   value, each earlier period's values trailed by their change column.
 */
const columnGroups = computed<MdGroup[]>(() => {
  if (!compareOn.value || periods.value.length < 2) {
    return [{ id: 'all', label: '', cols: valuesWithTotal.value.map((v) => amountCol(v, valueLabel(v), 0)) }]
  }
  if (compareSettings.groupBy === 'period') {
    return periods.value.map((p, i) => ({
      id: `p-${i}`,
      label: p.label,
      cols: valuesWithTotal.value.flatMap((v) => (i === 0 ? [amountCol(v, valueLabel(v), i)] : [amountCol(v, valueLabel(v), i), deltaCol(v, i)])),
    }))
  }
  return valuesWithTotal.value.map((v) => ({
    id: `v-${v}`,
    label: valueLabel(v),
    cols: periods.value.flatMap((p, i) => (i === 0 ? [amountCol(v, p.label, i)] : [amountCol(v, p.label, i), deltaCol(v, i)])),
  }))
})
/** Flattened columns, in render order — the body iterates this. */
const flatColumns = computed(() => columnGroups.value.flatMap((g) => g.cols))
const grouped = computed(() => compareOn.value && periods.value.length > 1)

/** Resolves one row's amount for any (value, period) pair. */
type RowAmount = (value: string, key: string) => number
function accountRow(code: string): RowAmount {
  return (v, k) => (v === TOTAL_VALUE ? rowTotal(code, k) : amount(code, v, k))
}
function subtotalRow(sectionKey: string): RowAmount {
  return (v, k) => (v === TOTAL_VALUE ? sectionTotal(sectionKey, k) : sectionAmount(sectionKey, v, k))
}
function profitRow(which: ProfitKey): RowAmount {
  return (v, k) => (v === TOTAL_VALUE ? profitTotal(which, k) : profit(which, v, k))
}
/**
 * Cell text for a column — an amount, or the applied period's change against the
 * earlier period it sits next to (the usual "vs prior period" reading, so a
 * green caret means the current period is up on that one).
 */
function cellText(f: RowAmount, col: MdCol): string {
  const key = periods.value[col.periodIdx]?.key ?? ''
  if (col.kind === 'amount') return money(f(col.value, key))
  return fmtPct(changePct(f(col.value, primaryKey.value), f(col.value, key)))
}
/** 1 up, -1 down, 0 flat/unknown — drives the delta caret and its color. */
function cellTrend(f: RowAmount, col: MdCol): number {
  if (col.kind !== 'delta') return 0
  const before = f(col.value, periods.value[col.periodIdx]?.key ?? '')
  if (!before) return 0
  const now = f(col.value, primaryKey.value)
  return now > before ? 1 : now < before ? -1 : 0
}

// ── Captions ─────────────────────────────────────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtDay(x: Date) { return `${x.getDate()} ${MONTHS[x.getMonth()]} ${x.getFullYear()}` }
function fmtRange(r: Date[]) { const [s, e] = r; return s && e ? `${fmtDay(s)} - ${fmtDay(e)}` : '' }
const rangeCaption = computed(() => fmtRange(appliedRange.value))
const lastUpdated = (() => {
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  return `Last updated on ${fmtDay(now)}, ${hh}:${mm} (GMT+7)`
})()

// ── Saved views ──────────────────────────────────────────────────────────────
const activeViewId = ref('default')
function selectView(id: string) {
  activeViewId.value = id
  const v = multidimensionalViews.find((x) => x.id === id)
  if (v) {
    filters.values = [...v.filters.values]
    filters.accountKeyword = v.filters.accountKeyword
    filters.showZero = v.filters.showZero
    if (getReportDimension(v.dimensionId)) {
      pendingDimensionId.value = v.dimensionId
      appliedDimensionId.value = v.dimensionId
    }
    syncColumnVisibility()
    generate()
  } else {
    resetFilters()
    if (reportState.value !== 'idle') generate()
  }
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
  const v = addMdView({ name, dimensionId: appliedDimensionId.value || pendingDimensionId.value, filters: { ...filters, values: [...filters.values] } })
  activeViewId.value = v.id
  toast.notify({ variant: 'success', title: t('View saved'), rootProps: { class: 'toast-enterprise' } })
}
function cancelAddView() { addingView.value = false }

const editingViewId = ref('')
const editViewName = ref('')
function startEditView(v: MdSavedView) {
  editingViewId.value = v.id; editViewName.value = v.name
  nextTick(() => { const el = document.querySelector('.mdr-view-edit') as HTMLInputElement | null; el?.focus(); el?.select() })
}
function commitEditView() {
  if (!editingViewId.value) return
  const name = editViewName.value.trim()
  const id = editingViewId.value
  editingViewId.value = ''
  if (name) { updateMdView(id, { name }); toast.notify({ variant: 'success', title: t('View renamed'), rootProps: { class: 'toast-enterprise' } }) }
}
function cancelEditView() { editingViewId.value = '' }

const delViewOpen = ref(false)
const delViewTarget = ref<MdSavedView | null>(null)
function askDeleteView(v: MdSavedView) { delViewTarget.value = v; delViewOpen.value = true }
function confirmDeleteView() {
  const v = delViewTarget.value; if (!v) return
  deleteMdView(v.id)
  if (activeViewId.value === v.id) activeViewId.value = 'default'
  delViewTarget.value = null
  toast.notify({ variant: 'success', title: t('View deleted'), rootProps: { class: 'toast-enterprise' } })
}
/** "All views" — a drawer listing every saved view (Figma link in the tab row). */
const allViewsOpen = ref(false)

// ── Full screen ──────────────────────────────────────────────────────────────
const fullscreen = ref(false)
const { isReportFullscreen } = useReportFullscreen()
watch(fullscreen, (v) => { isReportFullscreen.value = v })
onBeforeUnmount(() => { isReportFullscreen.value = false })

// ── Airene — open the panel already grounded on THIS report ──────────────────
const aireneBridge = useAireneBridge()
const AIRENE_SUGGESTIONS = [
  'Which value of this dimension is the most profitable?',
  'Where is operating expense out of line with revenue?',
  'Summarise this report in 3 bullets',
  'What drives the gap between gross and net profit?',
]
function buildReportGround(): string {
  const dim = appliedDimension.value
  if (!dim || reportState.value !== 'ready') {
    return 'Multidimensional report (Reports › Financials › Multidimensional), IDR. No report generated yet — the user has not applied a period and dimension.'
  }
  const lines = valueColumns.value.map((v) => {
    const p = mdProfitLines(v, primaryKey.value, accountFilter)
    return `- ${v}: revenue ${formatIDR(sectionAmount('revenue', v, primaryKey.value))}, `
      + `cost of sales ${formatIDR(sectionAmount('cost-of-sales', v, primaryKey.value))}, `
      + `operating expenses ${formatIDR(sectionAmount('operating-expenses', v, primaryKey.value))}, `
      + `gross profit ${formatIDR(p.grossProfit)}, operating profit ${formatIDR(p.operatingProfit)}, net profit ${formatIDR(p.netProfit)}`
  })
  return `Multidimensional report (Reports › Financials › Multidimensional), IDR, read-only. `
    + `Profit & loss for ${rangeCaption.value} sliced by the "${dim.name}" dimension.`
    + `${compareOn.value ? ` Compared against ${comparePeriodLabel(compareSettings.period).toLowerCase()} (${periods.value.slice(1).map((p) => p.label).join(', ')}), grouped by ${compareSettings.groupBy}.` : ''}\n`
    + `Per ${dim.name.toLowerCase()}:\n${lines.join('\n')}\n`
    + `Company total net profit ${formatIDR(profitTotal('netProfit', primaryKey.value))}. `
    + `Amounts in parentheses are negative (returns, discounts, charges).`
}
function openAirene() {
  aireneBridge.openWithContext(buildReportGround(), 'Multidimensional report', AIRENE_SUGGESTIONS)
}

// ── Export ───────────────────────────────────────────────────────────────────
const exporting = ref(false)
function exportExcel() {
  if (exporting.value || reportState.value !== 'ready') { infoToast(t('Generate the report first.')); return }
  exporting.value = true
  toast.notify({ variant: 'information', title: t('Your file is being prepared. You’ll be notified when it’s ready to download.'), rootProps: { class: 'toast-enterprise' } })
  window.setTimeout(() => {
    exporting.value = false
    const esc = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    // Same column model as the table, so a compared report exports its compare
    // columns too. Amount cells export raw numbers; change cells export the text.
    const cols = flatColumns.value
    const row = (label: string, f: RowAmount) => [
      label,
      ...cols.map((c) => (c.kind === 'amount' ? f(c.value, periods.value[c.periodIdx]?.key ?? '') : cellText(f, c))),
    ].map(esc).join(',')
    const lines = [
      `Multidimensional report — ${appliedDimension.value?.name ?? ''} — ${rangeCaption.value}${compareOn.value ? ` — ${compareCaption.value}` : ''}`,
      ['', ...cols.map((c) => (grouped.value ? columnGroups.value.find((g) => g.cols.includes(c))!.label : ''))].map(esc).join(','),
      ['Account', ...cols.map((c) => (c.kind === 'amount' ? c.label : 'Change'))].map(esc).join(','),
    ]
    for (const s of sections.value) {
      lines.push(esc(s.label.toUpperCase()))
      for (const a of s.accounts) lines.push(row(`${a.code} ${a.name}`, accountRow(a.code)))
      lines.push(row(s.totalLabel, subtotalRow(s.key)))
      const after = profitAfter(s.key)
      if (after) lines.push(row(after.label, profitRow(after.key)))
    }
    const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'multidimensional-report.csv'; a.click(); URL.revokeObjectURL(a.href)
    toast.notify({ variant: 'success', title: t('File ready to download'), description: t('Saved to Export history for 7 days.'), rootProps: { class: 'toast-enterprise' } })
  }, 1600)
}
function exportPdf() { infoToast(t('PDF export — coming soon')) }
</script>

<template>
  <div class="mdr" :class="{ 'mdr--full': fullscreen }">
    <!-- ── Title bar ── -->
    <header v-if="!fullscreen" class="mdr-titlebar">
      <div class="mdr-titlebar-left">
        <button class="mdr-breadcrumb" type="button" @click="router.push('/financial-report')">{{ t('Financials') }}</button>
        <h1 class="mdr-title">{{ t('Multidimensional') }} <span class="mdr-title-cur">(IDR)</span></h1>
      </div>
    </header>

    <div class="mdr-stage">
      <!-- ── Controls: period + dimension + Apply + All filters | Airene · columns · Export ── -->
      <div v-if="!fullscreen" class="mdr-controls">
        <div class="mdr-controls-left">
          <div class="mdr-datefield">
            <AdvancedDateRangePicker
              id="mdr-date"
              :model-value="pendingRange"
              is-full-width
              period-mode
              label-prefix-mode
              :placeholder="t('Select date')"
              @update:model-value="onPendingChange"
            />
          </div>

          <div class="mdr-dimfield">
            <!-- No `for` — MpPopoverTrigger rewrites MpSelect's id, so the
                 select's own placeholder carries its accessible name. -->
            <span class="mdr-field-label">{{ t('Dimension') }}</span>
            <MpPopover id="mdr-dimension" is-close-on-select use-portal :is-keep-alive="false">
              <MpPopoverTrigger>
                <MpSelect
                  id="mdr-dimension-select"
                  :placeholder="t('Select dimension')"
                  :model-value="pendingDimensionId"
                  :class="css({ width: '180px' })"
                  @mousedown.prevent
                >
                  <option v-if="pendingDimensionId" :value="pendingDimensionId">{{ pendingDimensionName }}</option>
                </MpSelect>
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content' })">
                <MpPopoverList>
                  <MpPopoverListItem
                    v-for="opt in dimensionOptions"
                    :key="opt.id"
                    :is-active="opt.id === pendingDimensionId"
                    @click="pickDimension(opt.id)"
                  >
                    {{ opt.name }}
                  </MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
          </div>

          <button class="mdr-apply" type="button" @click="applyReport">{{ t('Apply') }}</button>
          <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before mdr-allfilters" type="button" @click="drawerOpen = true">
            <MpIcon name="filter" size="sm" /> {{ t('All filters') }}
            <span v-if="activeFilterCount" class="mdr-allfilters-count">{{ activeFilterCount }}</span>
          </button>
        </div>

        <div class="mdr-controls-right">
          <MpTooltip id="mdr-airene" :label="t('Ask Airene')" placement="bottom" use-portal>
            <button class="mdr-icon-btn mdr-icon-btn--airene" type="button" :aria-label="t('Ask Airene')" @click="openAirene">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
              </svg>
            </button>
          </MpTooltip>

          <ColumnSettingsMenu id="mdr-columns" :items="columnItems" :visibility="colVis" :tooltip="t('Column settings')" />

          <MpPopover id="mdr-export" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <button class="btn-enterprise btn-enterprise--secondary mdr-export" type="button">
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

      <!-- ── Compare — the control opens the Comparison drawer; only its Apply
           switches comparison on (Figma 4836-67530). ── -->
      <div v-if="!fullscreen" class="mdr-comparebar">
        <MpToggle id="mdr-compare" :is-checked="compareOn" @change="onCompareControl" />
        <button class="mdr-compare-trigger" type="button" @click="compareDrawerOpen = true">
          <span :class="{ 'mdr-compare-label': compareOn }">{{ t('Compare') }}{{ compareOn ? ':' : '' }}</span>
          <span v-if="compareOn" class="mdr-compare-basis">{{ compareCaption }}</span>
          <MpIcon name="caret-down" size="sm" />
        </button>
      </div>
      <p v-if="!fullscreen && formError" class="mdr-form-error">{{ formError }}</p>
      <p v-if="!fullscreen && isDemoDimensions" class="mdr-demo-note">
        {{ t('Showing sample dimensions.') }}
        <a class="mdr-demo-link" @click="router.push('/dimensions')">{{ t('Set up your dimensions') }}</a>
      </p>

      <!-- Active-filter badges -->
      <div v-if="!fullscreen && activeFilterCount" class="mdr-badges">
        <span v-if="filters.accountKeyword" class="mdr-fbadge">“{{ filters.accountKeyword }}”<button type="button" :aria-label="t('Remove')" @click="filters.accountKeyword = ''"><MpIcon name="close" size="sm" /></button></span>
        <span v-for="v in filters.values" :key="`v-${v}`" class="mdr-fbadge">{{ v }}<button type="button" :aria-label="t('Remove')" @click="removeValue(v)"><MpIcon name="close" size="sm" /></button></span>
        <span v-if="!filters.showZero" class="mdr-fbadge">{{ t('Hiding accounts with no activity') }}<button type="button" :aria-label="t('Remove')" @click="filters.showZero = true"><MpIcon name="close" size="sm" /></button></span>
        <button class="mdr-reset" type="button" @click="resetFilters">{{ t('Reset filter') }}</button>
      </div>

      <!-- ── View tabs ── -->
      <div v-if="!fullscreen" class="mdr-viewbar">
        <div class="mdr-views">
          <button class="mdr-viewtab" :class="{ 'is-active': activeViewId === 'default' }" type="button" @click="selectView('default')">{{ t('Default view') }}</button>

          <template v-for="v in multidimensionalViews" :key="v.id">
            <span v-if="editingViewId === v.id" class="mdr-viewtab mdr-viewtab--editing">
              <input v-model="editViewName" class="mdr-viewtab-input mdr-view-edit" @keydown.enter.prevent="commitEditView" @keydown.esc="cancelEditView" @blur="commitEditView" />
            </span>
            <span v-else class="mdr-viewtab-wrap">
              <button class="mdr-viewtab" :class="{ 'is-active': activeViewId === v.id }" type="button" @click="selectView(v.id)">{{ v.name }}</button>
              <MpPopover :id="`mdr-view-${v.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
                <MpPopoverTrigger>
                  <button class="mdr-view-kebab" type="button" :aria-label="t('View options')"><MpIcon name="menu-kebab" size="sm" /></button>
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

          <span v-if="addingView" class="mdr-viewtab mdr-viewtab--editing">
            <input ref="newViewInput" v-model="newViewName" class="mdr-viewtab-input" :placeholder="t('View name')" @keydown.enter.prevent="commitAddView" @keydown.esc="cancelAddView" @blur="commitAddView" />
          </span>
          <button v-else class="mdr-addview" type="button" @click="startAddView"><MpIcon name="add" size="sm" /> {{ t('Add view') }}</button>

          <button class="mdr-allviews" type="button" @click="allViewsOpen = true">{{ t('All views') }}</button>
        </div>
        <div class="mdr-viewbar-right">
          <MpTooltip id="mdr-fs-enter" :label="t('Full screen')" placement="bottom-end" use-portal>
            <button class="mdr-fs-btn" type="button" :aria-label="t('Full screen')" @click="fullscreen = true"><MpIcon name="full-screen" size="md" /></button>
          </MpTooltip>
        </div>
      </div>

      <!-- ── Report ── -->
      <div class="mdr-report">
        <div v-if="fullscreen" class="mdr-fs-topbar">
          <span class="mdr-fs-title">{{ t('Multidimensional') }} <span class="mdr-title-cur">(IDR)</span></span>
          <MpTooltip id="mdr-fs-exit" :label="t('Exit full screen')" placement="bottom-end" use-portal>
            <button class="mdr-fs-btn" type="button" :aria-label="t('Exit full screen')" @click="fullscreen = false"><MpIcon name="minimize" size="md" /></button>
          </MpTooltip>
        </div>

        <!-- Idle — nothing applied yet (Figma frame 1) -->
        <div v-if="reportState === 'idle'" class="mdr-empty mdr-empty--idle">
          <img src="/illustrations/report-empty.png" alt="" class="mdr-empty-img" width="240" height="200" />
          <p class="mdr-empty-title">{{ t('Report data will appear here') }}</p>
          <p class="mdr-empty-desc">{{ t('Select date range and dimension, then click Apply button.') }}</p>
        </div>

        <template v-else>
          <div class="mdr-report-head">
            <span class="mdr-report-range">{{ rangeCaption }}</span>
            <span class="mdr-report-updated">{{ lastUpdated }}</span>
          </div>

          <!-- Loading skeleton (Figma frame 3) -->
          <div v-if="reportState === 'loading'" class="mdr-table-wrap">
            <table class="mdr-table">
              <thead>
                <tr>
                  <th class="mdr-th mdr-th--account" />
                  <th v-for="c in flatColumns" :key="c.id" class="mdr-th mdr-th--num"><MpSkeleton class="mdr-skel" height="10px" width="56px" rounded="sm" duration="0s" /></th>
                </tr>
              </thead>
              <tbody>
                <tr class="mdr-row mdr-row--section">
                  <td class="mdr-td mdr-td--account mdr-td--section"><MpSkeleton class="mdr-skel" height="10px" width="72px" rounded="sm" duration="0s" /></td>
                  <td v-for="c in flatColumns" :key="c.id" class="mdr-td mdr-td--section" />
                </tr>
                <tr v-for="n in 4" :key="n" class="mdr-row">
                  <td class="mdr-td mdr-td--account"><MpSkeleton class="mdr-skel" height="10px" width="220px" rounded="sm" duration="0s" /></td>
                  <td v-for="c in flatColumns" :key="c.id" class="mdr-td mdr-td--num"><MpSkeleton class="mdr-skel" height="10px" width="88px" rounded="sm" duration="0s" /></td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Ready + data (Figma frames 2 & 4; grouped header per 4836-67530) -->
          <div v-else-if="hasRows" class="mdr-table-wrap">
            <table class="mdr-table">
              <thead>
                <!-- Band row — only when comparing: dimension value, or period. -->
                <tr v-if="grouped">
                  <th class="mdr-th mdr-th--account mdr-th--band" />
                  <th v-for="g in columnGroups" :key="g.id" class="mdr-th mdr-th--band" :colspan="g.cols.length">{{ g.label }}</th>
                </tr>
                <tr>
                  <th class="mdr-th mdr-th--account" />
                  <th v-for="c in flatColumns" :key="c.id" class="mdr-th mdr-th--num" :class="{ 'mdr-th--delta': c.kind === 'delta' }">{{ c.label }}</th>
                </tr>
              </thead>

              <tbody>
                <template v-for="s in sections" :key="s.key">
                  <!-- Section header -->
                  <tr class="mdr-row mdr-row--section">
                    <td class="mdr-td mdr-td--account mdr-td--section">{{ t(s.label).toUpperCase() }}</td>
                    <td v-for="c in flatColumns" :key="c.id" class="mdr-td mdr-td--section" />
                  </tr>

                  <!-- Accounts -->
                  <tr v-for="a in s.accounts" :key="a.code" class="mdr-row">
                    <td class="mdr-td mdr-td--account">
                      <a class="mdr-account-link" @click="infoToast(`${a.code} ${a.name} — ${t('opening general ledger')}`)">{{ a.code }} {{ a.name }}</a>
                    </td>
                    <td
                      v-for="c in flatColumns"
                      :key="c.id"
                      class="mdr-td mdr-td--num"
                      :class="{ 'mdr-td--delta': c.kind === 'delta' }"
                    >
                      <span v-if="c.kind === 'delta'" class="mdr-delta" :class="`mdr-delta--${cellTrend(accountRow(a.code), c)}`">
                        <MpIcon v-if="cellTrend(accountRow(a.code), c)" :name="cellTrend(accountRow(a.code), c) > 0 ? 'caret-up' : 'caret-down'" size="sm" />
                        {{ cellText(accountRow(a.code), c) }}
                      </span>
                      <template v-else>{{ cellText(accountRow(a.code), c) }}</template>
                    </td>
                  </tr>

                  <!-- Section subtotal -->
                  <tr class="mdr-row mdr-row--subtotal">
                    <td class="mdr-td mdr-td--account mdr-strong">{{ t(s.totalLabel) }}</td>
                    <td
                      v-for="c in flatColumns"
                      :key="c.id"
                      class="mdr-td mdr-td--num mdr-strong"
                      :class="{ 'mdr-td--delta': c.kind === 'delta' }"
                    >
                      <span v-if="c.kind === 'delta'" class="mdr-delta" :class="`mdr-delta--${cellTrend(subtotalRow(s.key), c)}`">
                        <MpIcon v-if="cellTrend(subtotalRow(s.key), c)" :name="cellTrend(subtotalRow(s.key), c) > 0 ? 'caret-up' : 'caret-down'" size="sm" />
                        {{ cellText(subtotalRow(s.key), c) }}
                      </span>
                      <template v-else>{{ cellText(subtotalRow(s.key), c) }}</template>
                    </td>
                  </tr>

                  <!-- Derived profit line printed after the section it closes -->
                  <tr v-if="profitAfter(s.key)" class="mdr-row mdr-row--profit">
                    <td class="mdr-td mdr-td--account mdr-strong">{{ t(profitAfter(s.key)!.label) }}</td>
                    <td
                      v-for="c in flatColumns"
                      :key="c.id"
                      class="mdr-td mdr-td--num mdr-strong"
                      :class="{ 'mdr-td--delta': c.kind === 'delta' }"
                    >
                      <span v-if="c.kind === 'delta'" class="mdr-delta" :class="`mdr-delta--${cellTrend(profitRow(profitAfter(s.key)!.key), c)}`">
                        <MpIcon v-if="cellTrend(profitRow(profitAfter(s.key)!.key), c)" :name="cellTrend(profitRow(profitAfter(s.key)!.key), c) > 0 ? 'caret-up' : 'caret-down'" size="sm" />
                        {{ cellText(profitRow(profitAfter(s.key)!.key), c) }}
                      </span>
                      <template v-else>{{ cellText(profitRow(profitAfter(s.key)!.key), c) }}</template>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>

          <!-- Ready, but nothing matches -->
          <div v-else class="mdr-empty">
            <img src="/illustrations/empty-folder.png" alt="" class="mdr-empty-img" width="240" height="200" />
            <p class="mdr-empty-title">{{ t('No data matches this filter.') }}</p>
            <button class="mdr-empty-cta" type="button" @click="resetFilters">{{ t('Reset filter') }}</button>
          </div>
        </template>
      </div>
    </div>

    <!-- ── All filters drawer ── -->
    <MultidimensionalFiltersDrawer
      v-model:is-open="drawerOpen"
      :model-value="filters"
      :dimension-name="appliedDimension?.name ?? pendingDimensionName"
      :value-options="(appliedDimension ?? getReportDimension(pendingDimensionId))?.values ?? []"
      @apply="onApplyFilters"
    />

    <!-- ── Comparison drawer ── -->
    <MultidimensionalCompareDrawer
      v-model:is-open="compareDrawerOpen"
      :model-value="compareSettings"
      @apply="onApplyCompare"
    />

    <!-- ── All views drawer ── -->
    <Transition name="mdr-vd">
      <div v-if="allViewsOpen" class="mdr-vd-overlay" @click.self="allViewsOpen = false">
        <div class="mdr-vd-panel" role="dialog" :aria-label="t('All views')">
          <header class="mdr-vd-head">
            <span class="mdr-vd-title">{{ t('All views') }}</span>
            <button class="mdr-vd-close" type="button" :aria-label="t('Close')" @click="allViewsOpen = false"><MpIcon name="close" size="md" /></button>
          </header>
          <div class="mdr-vd-body">
            <button class="mdr-view-item" :class="{ 'is-active': activeViewId === 'default' }" type="button" @click="selectView('default'); allViewsOpen = false">{{ t('Default view') }}</button>
            <div v-for="v in multidimensionalViews" :key="v.id" class="mdr-view-item-row">
              <button class="mdr-view-item" :class="{ 'is-active': activeViewId === v.id }" type="button" @click="selectView(v.id); allViewsOpen = false">{{ v.name }}</button>
              <button class="mdr-view-del" type="button" :aria-label="t('Delete')" @click="askDeleteView(v)"><MpIcon name="trash" size="sm" /></button>
            </div>
            <p v-if="!multidimensionalViews.length" class="mdr-vd-hint">{{ t('Saved views will appear here.') }}</p>
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
.mdr { display: flex; flex-direction: column; height: 100%; min-height: 0; }

.mdr-titlebar { flex-shrink: 0; min-height: 72px; background: var(--mp-background-neutral-subtle); display: flex; align-items: center; padding: 0 var(--mp-spacing-6); }
.mdr-titlebar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; }
.mdr-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm, 12px); line-height: var(--mp-line-heights-sm, 16px); color: var(--mp-text-link); font-family: inherit; }
.mdr-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.mdr-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.mdr-title-cur { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); }

.mdr-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage, #fff); border-top-left-radius: var(--mp-radii-lg, 12px); padding: var(--mp-spacing-5, 20px) var(--mp-spacing-6, 24px) var(--mp-spacing-6, 24px); display: flex; flex-direction: column; gap: var(--mp-spacing-3, 12px); }

/* Controls */
.mdr-controls { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.mdr-controls-left { display: flex; align-items: flex-end; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.mdr-controls-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.mdr-datefield { display: flex; flex-direction: column; gap: var(--mp-spacing-1); width: 220px; }
.mdr-dimfield { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.mdr-field-label { font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-text-default); line-height: var(--mp-line-heights-sm, 16px); }
.mdr-apply { height: 36px; padding: 0 var(--mp-spacing-4); border: none; border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-brand-bold, #0a6e4e); color: #fff; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold, 600); cursor: pointer; font-family: inherit; }
.mdr-apply:hover { background: var(--mp-background-brand-bold-hovered, #095c41); }
.mdr-allfilters-count { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 5px; margin-left: 2px; border-radius: 999px; background: var(--mp-background-brand-bold, #0a6e4e); color: #fff; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); }
.mdr-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-default); }
.mdr-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
.mdr-icon-btn--airene { color: var(--mp-airene-default, #7c3aed); }
.mdr-export { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); }

/* Compare */
.mdr-comparebar { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.mdr-compare-trigger { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); border: none; background: none; padding: 0; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.mdr-compare-label { font-weight: var(--mp-font-weights-semi-bold, 600); }
.mdr-compare-basis { color: var(--mp-text-secondary); }
.mdr-form-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #c62828); }
.mdr-demo-note { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.mdr-demo-link { color: var(--mp-text-link); cursor: pointer; }
.mdr-demo-link:hover { text-decoration: underline; text-underline-offset: 2px; }

/* Filter badges */
.mdr-badges { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.mdr-fbadge { display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 var(--mp-spacing-2) 0 var(--mp-spacing-3); border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral-subtle, #eceef0); font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-default); }
.mdr-fbadge button { display: inline-flex; align-items: center; border: none; background: none; cursor: pointer; color: var(--mp-icon-subtle, #97a0af); padding: 0; }
.mdr-fbadge button:hover { color: var(--mp-text-default); }
.mdr-reset { border: none; background: none; cursor: pointer; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); text-decoration: underline; text-underline-offset: 2px; font-family: inherit; }

/* View tabs */
.mdr-viewbar { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--mp-border-default); }
.mdr-views { display: flex; align-items: center; gap: var(--mp-spacing-5); }
.mdr-viewtab { position: relative; border: none; background: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); padding: var(--mp-spacing-3) 0; }
.mdr-viewtab:not(.is-active):hover { color: var(--mp-text-default); }
.mdr-viewtab.is-active { color: var(--mp-text-selected); font-weight: var(--mp-font-weights-semi-bold); }
.mdr-viewtab.is-active::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: var(--mp-text-selected); border-radius: 2px 2px 0 0; }
.mdr-addview { display: inline-flex; align-items: center; gap: 4px; border: none; background: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); padding: var(--mp-spacing-3) 0; }
.mdr-addview:hover { color: var(--mp-text-link); }
.mdr-allviews { border: none; background: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); padding: var(--mp-spacing-3) 0; text-decoration: underline; text-underline-offset: 2px; }
.mdr-viewtab-wrap { display: inline-flex; align-items: center; gap: 2px; }
.mdr-viewtab-wrap .mdr-viewtab { padding-right: 0; }
.mdr-view-kebab { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border: none; background: none; cursor: pointer; color: var(--mp-icon-subtle, #97a0af); border-radius: var(--mp-radii-sm, 4px); visibility: hidden; }
.mdr-viewtab-wrap:hover .mdr-view-kebab,
.mdr-viewtab-wrap:focus-within .mdr-view-kebab { visibility: visible; }
.mdr-view-kebab:hover { background: var(--mp-background-neutral-subtle); color: var(--mp-text-default); }
.mdr-viewtab--editing { display: inline-flex; align-items: center; padding: var(--mp-spacing-2) 0; }
.mdr-viewtab-input { width: 140px; height: 28px; padding: 0 8px; border: 1px solid var(--mp-border-brand, #0a6e4e); border-radius: var(--mp-radii-md, 6px); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none; font-family: inherit; }
.mdr-viewbar-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.mdr-fs-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default, #536062); }
.mdr-fs-btn:hover { background: var(--mp-background-neutral-subtle); }

/* Report */
.mdr-report { display: flex; flex-direction: column; min-width: 0; }
.mdr-fs-topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--mp-spacing-2); }
.mdr-fs-title { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.mdr-report-head { display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-2) 0; }
.mdr-report-range, .mdr-report-updated { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }

/* Pivot table — the account column is sticky so it survives horizontal scroll. */
.mdr-table-wrap { overflow-x: auto; }
.mdr-table { width: 100%; border-collapse: separate; border-spacing: 0; }

.mdr-th {
  position: sticky; top: 0; z-index: 2;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral, #fff);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; letter-spacing: 0.3px; color: var(--mp-text-secondary);
  text-align: right; white-space: nowrap;
}
.mdr-th--num { min-width: 160px; }
.mdr-th--account { left: 0; z-index: 3; width: 280px; min-width: 280px; text-align: left; border-right: 1px solid var(--mp-border-default); }
/* Comparison band row — the dimension value (or period) each column set belongs
   to, centred over its columns and separated from the next band. */
.mdr-th--band { top: 0; text-align: center; border-bottom: 1px solid var(--mp-border-default); border-left: 1px solid var(--mp-border-default); }
.mdr-th--band.mdr-th--account { border-left: none; }
/* The sub-header row sits below the band row, so it can't also stick at top: 0. */
.mdr-table thead tr:nth-child(2) .mdr-th { top: 33px; }
/* Change columns are narrow — they hold "▲ 12%", not money. */
.mdr-th--delta { min-width: 84px; }

.mdr-td {
  height: 40px; padding: var(--mp-spacing-2\.5, 10px) var(--mp-spacing-3);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-default);
  vertical-align: middle; white-space: nowrap; background: var(--mp-background-neutral, #fff);
}
.mdr-td--num { text-align: right; font-variant-numeric: tabular-nums; }
.mdr-td--account { position: sticky; left: 0; z-index: 1; width: 280px; min-width: 280px; border-right: 1px solid var(--mp-border-default); overflow: hidden; text-overflow: ellipsis; }
.mdr-strong { font-weight: var(--mp-font-weights-semi-bold, 600); }
/* Change cell — the caret carries the direction, so the figure stays unsigned. */
.mdr-td--delta { padding-left: var(--mp-spacing-1); }
.mdr-delta { display: inline-flex; align-items: center; gap: 2px; font-variant-numeric: tabular-nums; }
.mdr-delta--1 { color: var(--mp-text-success, #12805c); }
.mdr-delta--0 { color: var(--mp-text-secondary); }
.mdr-delta---1 { color: var(--mp-text-danger, #c62828); }

.mdr-account-link { color: var(--mp-text-link); cursor: pointer; }
.mdr-account-link:hover { text-decoration: underline; text-underline-offset: 2px; }

/* Section header row — gray band across every column. */
.mdr-row--section .mdr-td { background: var(--mp-background-neutral-subtle, #f4f5f7); }
.mdr-td--section { font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold, 600); text-transform: uppercase; letter-spacing: 0.3px; color: var(--mp-text-secondary); height: 32px; }
.mdr-row:hover .mdr-td:not(.mdr-td--section) { background: var(--mp-background-neutral-subtle, #f8f9f9); }
.mdr-row--profit .mdr-td { border-top: 1px solid var(--mp-border-default); }

/* Empty + skeleton */
.mdr-empty { display: flex; flex-direction: column; align-items: center; padding: var(--mp-spacing-10, 40px) 0; }
.mdr-empty--idle { padding: 72px 0 64px; }
.mdr-empty-img { width: 240px; height: 200px; object-fit: contain; }
.mdr-empty-title { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.mdr-empty-desc { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.mdr-empty-cta { margin-top: var(--mp-spacing-3); height: 36px; padding: 0 var(--mp-spacing-4); border: 1px solid var(--mp-border-bold); background: var(--mp-background-neutral); border-radius: var(--mp-radii-full, 999px); cursor: pointer; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-text-default); font-family: inherit; }
.mdr-skel { display: inline-block; background-color: var(--mp-border-default) !important; background-image: none !important; animation: none !important; }

/* All-views drawer */
.mdr-vd-enter-active, .mdr-vd-leave-active { transition: background-color 200ms ease; }
.mdr-vd-enter-from, .mdr-vd-leave-to { background-color: transparent; }
.mdr-vd-enter-active .mdr-vd-panel { transition: transform 300ms ease-out; }
.mdr-vd-enter-from .mdr-vd-panel, .mdr-vd-leave-to .mdr-vd-panel { transform: translateX(calc(100% + 12px)); }
.mdr-vd-overlay { position: fixed; inset: 0; z-index: 1300; background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45)); display: flex; justify-content: flex-end; }
.mdr-vd-panel { margin: var(--mp-spacing-3); width: min(400px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); border-radius: 24px; overflow: hidden; }
.mdr-vd-head { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); }
.mdr-vd-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.mdr-vd-close { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: none; background: none; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.mdr-vd-close:hover { background: var(--mp-background-neutral-hovered); }
.mdr-vd-body { flex: 1; overflow-y: auto; padding: var(--mp-spacing-4); display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.mdr-vd-hint { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.mdr-view-item { text-align: left; padding: var(--mp-spacing-2) var(--mp-spacing-3); border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); flex: 1; font-family: inherit; }
.mdr-view-item:hover { background: var(--mp-background-neutral-subtle); }
.mdr-view-item.is-active { background: var(--mp-background-brand-subtle, #e8f5f0); color: var(--mp-text-brand, #0a6e4e); font-weight: var(--mp-font-weights-medium, 500); }
.mdr-view-item-row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.mdr-view-del { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-subtle, #97a0af); }
.mdr-view-del:hover { background: var(--mp-background-danger-subtle, #fdecec); color: var(--mp-text-danger, #c62828); }

/* Full screen — the white stage fills the whole window edge-to-edge. */
.mdr--full .mdr-stage { border-radius: 0; padding-top: var(--mp-spacing-4); }
</style>
