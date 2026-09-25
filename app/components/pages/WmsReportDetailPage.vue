<script setup lang="ts">
/**
 * WMS Report detail — the row-level raw-data table for one of the four WMS reports
 * (docs/prd/wms-reports-analytics-prd.md, Stories 11–14). Config-driven: the
 * `orderId` slug selects a ReportDef from wmsReports.ts (title + columns + a pure
 * rows(filter) builder over the live mini-DB). Full-bleed (rendered via detailMatch
 * in [...slug].vue), so it draws its own title bar with a back link + Export (CSV).
 */
import { ref, reactive, computed, watch, inject, onMounted, onUnmounted } from 'vue'
import { MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpTooltip, MpIcon, MpCheckbox, MpButton, css } from '@mekari/pixel3'
import ErpColumnSortMenu from '~/components/patterns/ErpColumnSortMenu.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ErpPagination from '~/components/patterns/ErpPagination.vue'
import { formatDate, formatDateTime } from '~/utils/date'
import { warehouses } from '~/data/warehouses'
import { TODAY } from '~/data/master'
import { operatorOptionsMulti } from '~/data/wmsAnalytics'
import { WMS_REPORTS, INBOUND_SOURCE_OPTIONS, OUTBOUND_SOURCE_OPTIONS, inboundAccuracyFilterOptions, outboundAccuracyFilterOptions, type ReportColumn, type ReportFilter, type ReportRow } from '~/data/wmsReports'
import WmsReportFiltersDrawer, { type WmsReportFiltersValue } from '~/components/patterns/WmsReportFiltersDrawer.vue'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()
const toggleAirene = inject<() => void>('toggleAirene')

// WMS Standalone has no Reports index page (reports open straight from the nav
// panel), so the "Reports" breadcrumb has nowhere to go — hide it there.
const { activeScenario } = useScenario()
const showBreadcrumb = computed(() => activeScenario.value !== 'WMS Standalone')

// ── Report definition for this slug ─────────────────────────────────────────────
const def = computed(() => WMS_REPORTS[props.orderId])
const title = computed(() => def.value?.title ?? 'Report')

// ── Filters ─────────────────────────────────────────────────────────────────────
const warehouseFilter = ref<string[]>([])   // empty = all warehouses
const operatorFilter = ref<string[]>([])     // empty = all operators
const search = ref('')

// ── "All filters" drawer — the two accuracy reports (inbound + outbound) ─────────
const isInboundAccuracy = computed(() => props.orderId === 'inbound-accuracy')
const isOutboundAccuracy = computed(() => props.orderId === 'outbound-accuracy')
const isAccuracy = computed(() => isInboundAccuracy.value || isOutboundAccuracy.value)
const isFiltersDrawerOpen = ref(false)
const keywordFilter = ref('')
const keywordColumnFilter = ref('all')
const skuFilter = ref<string[]>([])
const sourceFilter = ref<string[]>([])
const receiveStateFilter = ref<string[]>([])
// Completion state — received-vs-expected inbound, shipped-vs-order outbound.
const receiveStateOptions = computed(() =>
  isOutboundAccuracy.value
    ? [
        { id: 'match', name: 'Match order qty' },
        { id: 'short', name: 'Short of order qty' },
        { id: 'over', name: 'Over order qty' },
      ]
    : [
        { id: 'match', name: 'Match expected' },
        { id: 'short', name: 'Short expected' },
        { id: 'over', name: 'Over expected' },
      ],
)
// Source is a fixed set of origin types per direction (id === name, matched directly).
const sourceOptions = computed(() =>
  (isOutboundAccuracy.value ? OUTBOUND_SOURCE_OPTIONS : INBOUND_SOURCE_OPTIONS).map((s) => ({ id: s, name: s })),
)
const accOptions = computed(() =>
  isInboundAccuracy.value ? inboundAccuracyFilterOptions()
    : isOutboundAccuracy.value ? outboundAccuracyFilterOptions()
    : { skus: [] },
)
const drawerValue = computed<WmsReportFiltersValue>(() => ({
  keyword: keywordFilter.value,
  keywordColumn: keywordColumnFilter.value,
  skus: skuFilter.value,
  sources: sourceFilter.value,
  receiveStates: receiveStateFilter.value,
}))
function applyDrawerFilters(v: WmsReportFiltersValue) {
  keywordFilter.value = v.keyword
  keywordColumnFilter.value = v.keywordColumn
  skuFilter.value = v.skus
  sourceFilter.value = v.sources
  receiveStateFilter.value = v.receiveStates
}
// Number of active drawer-filter groups — shown in the button label.
const drawerFilterCount = computed(() =>
  (keywordFilter.value.trim() ? 1 : 0) + (skuFilter.value.length ? 1 : 0)
    + (sourceFilter.value.length ? 1 : 0) + (receiveStateFilter.value.length ? 1 : 0),
)
// Reset drawer filters when switching to another report (button only shows on inbound-accuracy).
watch(() => props.orderId, () => {
  keywordFilter.value = ''; keywordColumnFilter.value = 'all'
  skuFilter.value = []; sourceFilter.value = []; receiveStateFilter.value = []
})

// ── Warehouse (multi-select) ─────────────────────────────────────────────────────
const warehouseOptions = computed(() =>
  warehouses.filter((w) => !w.isDefault && w.status === 'active').map((w) => ({ value: w.id, label: w.name })),
)
const warehouseLabel = computed(() => {
  const n = warehouseFilter.value.length
  if (n === 0) return t('All warehouses')
  if (n === 1) return warehouseOptions.value.find((o) => o.value === warehouseFilter.value[0])?.label ?? ''
  return `${n} ${t('warehouses')}`
})
function toggleWarehouse(id: string) {
  warehouseFilter.value = warehouseFilter.value.includes(id)
    ? warehouseFilter.value.filter((v) => v !== id)
    : [...warehouseFilter.value, id]
}

// ── Operator (multi-select, scoped to the selected warehouses) ────────────────────
const operatorList = computed(() => def.value?.direction ? operatorOptionsMulti(def.value.direction, warehouseFilter.value) : [])
const operatorLabel = computed(() => {
  const n = operatorFilter.value.length
  if (n === 0) return t('All operators')
  if (n === 1) return operatorFilter.value[0]
  return `${n} ${t('operators')}`
})
function toggleOperator(name: string) {
  operatorFilter.value = operatorFilter.value.includes(name)
    ? operatorFilter.value.filter((v) => v !== name)
    : [...operatorFilter.value, name]
}
// When the warehouse selection narrows the operator pool, drop any now-invalid picks.
watch(operatorList, (pool) => {
  const kept = operatorFilter.value.filter((n) => pool.includes(n))
  if (kept.length !== operatorFilter.value.length) operatorFilter.value = kept
})

// ── Date (presets + custom range) ─────────────────────────────────────────────────
type PeriodPreset = '7' | '14' | '30' | 'custom'
// Initial preset comes from the report def (all WMS reports default to 7 days).
const defaultPreset = () => String(def.value?.defaultPeriodDays ?? 30) as PeriodPreset
const periodPreset = ref<PeriodPreset>(defaultPreset())
const customFrom = ref('') // DD/MM/YYYY
const customTo = ref('')
// Custom range is a two-click start→end pick across two months, so pendingStart
// holds the first click until the second completes the range.
const pendingStart = ref<string | null>(null) // ISO yyyy-mm-dd
// Left-hand month of the two-month calendar (right-hand is always the next month).
const calYear = ref(TODAY.getFullYear())
const calMonth = ref(TODAY.getMonth())
// Switching to another report resets the date range to that report's default.
watch(() => props.orderId, () => {
  periodPreset.value = defaultPreset(); customFrom.value = ''; customTo.value = ''
  pendingStart.value = null; calYear.value = TODAY.getFullYear(); calMonth.value = TODAY.getMonth()
})
function parseDMY(s: string): Date | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
}
function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function isoToDMY(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
// Active custom range as inclusive ISO strings, or null when incomplete/not custom.
const customRange = computed<{ from: string; to: string } | null>(() => {
  if (periodPreset.value !== 'custom') return null
  const from = parseDMY(customFrom.value)
  const to = parseDMY(customTo.value)
  return from && to ? { from: toIso(from), to: toIso(to) } : null
})

// ── Two-month range calendar (Figma node 4167-29317) ──────────────────────────────
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_LABEL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
interface CalCell { iso: string; dayNum: number; inMonth: boolean }
function buildCells(year: number, month: number): CalCell[] {
  const first = new Date(year, month, 1)
  const gridStart = new Date(year, month, 1 - first.getDay())
  const cells: CalCell[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i)
    cells.push({ iso: toIso(d), dayNum: d.getDate(), inMonth: d.getMonth() === month })
  }
  return cells
}
// Right-hand month = left month + 1 (rolls into the next year in December).
const rightYear = computed(() => (calMonth.value === 11 ? calYear.value + 1 : calYear.value))
const rightMonth = computed(() => (calMonth.value + 1) % 12)
const leftCells = computed(() => buildCells(calYear.value, calMonth.value))
const rightCells = computed(() => buildCells(rightYear.value, rightMonth.value))
const leftTitle = computed(() => `${MONTH_LABEL[calMonth.value]} ${calYear.value}`)
const rightTitle = computed(() => `${MONTH_LABEL[rightMonth.value]} ${rightYear.value}`)
const todayIso = computed(() => toIso(TODAY))
function calPrevMonth() { if (calMonth.value === 0) { calMonth.value = 11; calYear.value-- } else calMonth.value-- }
function calNextMonth() { if (calMonth.value === 11) { calMonth.value = 0; calYear.value++ } else calMonth.value++ }

function selectPreset(v: Exclude<PeriodPreset, 'custom'>) {
  periodPreset.value = v; pendingStart.value = null; customFrom.value = ''; customTo.value = ''
}
function selectCustom() { periodPreset.value = 'custom'; pendingStart.value = null }

// Resolved date range for a preset row (inclusive, N calendar days ending today) —
// e.g. "20 Jun - 26 Jun 2026". Shown beside each preset in the list.
function presetRangeLabel(days: number): string {
  const start = new Date(TODAY.getTime() - (days - 1) * 86_400_000)
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return `${fmt(start)} - ${fmt(TODAY)} ${TODAY.getFullYear()}`
}

// Calendar highlight (Custom mode only): mid-pick start, or the committed range.
const rangeBounds = computed<{ s: string; e: string } | null>(() => {
  if (pendingStart.value) return { s: pendingStart.value, e: pendingStart.value }
  const from = parseDMY(customFrom.value), to = parseDMY(customTo.value)
  return from && to ? { s: toIso(from), e: toIso(to) } : null
})
function calCellInRange(iso: string): boolean {
  const b = rangeBounds.value
  return !!b && iso >= b.s && iso <= b.e // yyyy-mm-dd sorts lexicographically
}
function calCellIsEnd(iso: string): boolean {
  const b = rangeBounds.value
  return !!b && (iso === b.s || iso === b.e)
}
function onCalDayClick(cell: CalCell) {
  // Clicking the calendar always drives a custom range.
  if (periodPreset.value !== 'custom' || !pendingStart.value || (customFrom.value && customTo.value)) {
    periodPreset.value = 'custom'; pendingStart.value = cell.iso; customFrom.value = ''; customTo.value = ''
    return
  }
  // Second click: order the two ends and commit (filter applies live).
  const s = cell.iso < pendingStart.value ? cell.iso : pendingStart.value
  const e = cell.iso < pendingStart.value ? pendingStart.value : cell.iso
  customFrom.value = isoToDMY(s); customTo.value = isoToDMY(e)
  pendingStart.value = null
}

const periodOptions = [
  { value: '7' as const, label: 'Last 7 days' },
  { value: '14' as const, label: 'Last 14 days' },
  { value: '30' as const, label: 'Last 30 days' },
]
const periodLabel = computed(() => {
  if (periodPreset.value === 'custom') {
    const r = customRange.value
    if (!r) return t('Custom range…')
    const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
    return `${fmt(r.from)} – ${fmt(r.to)} ${new Date(r.to).getFullYear()}`
  }
  return t(periodOptions.find((o) => o.value === periodPreset.value)?.label ?? '')
})
// Stock reports opt out of the date and/or operator dimension (see ReportDef).
const showDate = computed(() => !def.value?.hideDate)
const showOperator = computed(() => !def.value?.hideOperator)
const filter = computed<ReportFilter>(() => ({
  warehouseIds: warehouseFilter.value,
  operators: operatorFilter.value,
  // A snapshot report has no period — pass a window wide enough to be a no-op for
  // any inPeriod() call its rows builder might still make.
  periodDays: showDate.value ? (Number(periodPreset.value) || 30) : 36_500,
  customRange: showDate.value ? customRange.value : null,
  // Drawer filters apply to the accuracy reports only; the timeliness reports ignore them.
  ...(isAccuracy.value
    ? { skus: skuFilter.value, sources: sourceFilter.value, receiveStates: receiveStateFilter.value as ('match' | 'short' | 'over')[] }
    : {}),
}))

// ── Columns (with hide support via the shared sort menu) ─────────────────────────
const columns = computed<ReportColumn[]>(() => def.value?.columns ?? [])
const colVis = reactive<Record<string, boolean>>({})
watch(columns, (cols) => { for (const c of cols) if (colVis[c.key] === undefined) colVis[c.key] = true }, { immediate: true })
const visibleColumns = computed(() => columns.value.filter((c) => colVis[c.key] !== false))
function hideColumn(key: string) { colVis[key] = false }
// Column settings menu items — first column stays on (can't be hidden).
const columnItems = computed(() => columns.value.map((c, i) => ({ key: c.key, label: t(c.label), disabled: i === 0 })))

// ── Sort ─────────────────────────────────────────────────────────────────────────
const sortKey = ref('')
const sortDir = ref<'asc' | 'desc'>('asc')
function onSortChange(key: string, dir: 'asc' | 'desc') { sortKey.value = key; sortDir.value = dir }

const isBlank = (v: unknown) =>
  v === '' || v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))
function sortValue(row: ReportRow, col: ReportColumn): string | number {
  const v = row[col.key]
  if (isBlank(v)) return col.sortType === 'text' ? '' : NaN
  if (col.sortType === 'date') { const t2 = new Date(v as string).getTime(); return Number.isNaN(t2) ? NaN : t2 }
  if (col.sortType === 'number') return Number(v)
  return String(v)
}

// ── Rows: build → sort ─────────────────────────────────────────────────────────
const baseRows = computed<ReportRow[]>(() => def.value ? def.value.rows(filter.value) : [])
// Free-text search across every visible column's rendered cell text, then the
// drawer's Keywords filter (all columns, or a single column) — applied as AND.
const searchedRows = computed<ReportRow[]>(() => {
  let rows = baseRows.value
  const q = search.value.trim().toLowerCase()
  const cols = visibleColumns.value
  if (q) rows = rows.filter((row) => cols.some((c) => cellText(row, c).toLowerCase().includes(q)))
  const kw = keywordFilter.value.trim().toLowerCase()
  if (kw) {
    const scoped = keywordColumnFilter.value === 'all'
      ? cols
      : cols.filter((c) => c.key === keywordColumnFilter.value)
    rows = rows.filter((row) => scoped.some((c) => cellText(row, c).toLowerCase().includes(kw)))
  }
  return rows
})
const sortedRows = computed<ReportRow[]>(() => {
  if (!sortKey.value) return searchedRows.value
  const col = columns.value.find((c) => c.key === sortKey.value)
  if (!col) return searchedRows.value
  const dir = sortDir.value === 'asc' ? 1 : -1
  return [...searchedRows.value].sort((a, b) => {
    const av = sortValue(a, col); const bv = sortValue(b, col)
    const aB = isBlank(av) || (typeof av === 'number' && Number.isNaN(av))
    const bB = isBlank(bv) || (typeof bv === 'number' && Number.isNaN(bv))
    if (aB && bB) return 0
    if (aB) return 1
    if (bB) return -1
    const cmp = (col.sortType === 'number' || col.sortType === 'date')
      ? (av as number) - (bv as number)
      : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' })
    return cmp * dir
  })
})

// ── Pagination ───────────────────────────────────────────────────────────────────
const currentPage = ref(1)
const perPage = ref(25)
const total = computed(() => sortedRows.value.length)
const pagedRows = computed(() => {
  const start = (currentPage.value - 1) * perPage.value
  return sortedRows.value.slice(start, start + perPage.value)
})
watch([warehouseFilter, operatorFilter, periodPreset, customFrom, customTo, search, keywordFilter, keywordColumnFilter, skuFilter, sourceFilter, receiveStateFilter, () => props.orderId, perPage], () => { currentPage.value = 1 })

// ── Cell rendering ────────────────────────────────────────────────────────────────
function fmtNum(n: number): string { return n.toLocaleString('id-ID') }
function fmtDateCell(v: unknown, col: ReportColumn): string {
  return col.dateOnly ? formatDate(v as string | undefined) : formatDateTime(v as string | undefined)
}
function cellText(row: ReportRow, col: ReportColumn): string {
  const v = row[col.key]
  if (col.sortType === 'date') return fmtDateCell(v, col)
  if (col.sortType === 'number') return v === null || v === undefined ? '—' : fmtNum(Number(v))
  return v === undefined || v === null || v === '' ? '—' : String(v)
}
/** Raw CSV value — table timestamp for dates, plain number for qty, text otherwise. */
function cellCsv(row: ReportRow, col: ReportColumn): string {
  const v = row[col.key]
  if (isBlank(v)) return ''
  if (col.sortType === 'date') return fmtDateCell(v, col)
  return String(v)
}

// ── Export ────────────────────────────────────────────────────────────────────────
function csvEscape(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function exportCsv() {
  const cols = visibleColumns.value
  const header = cols.map((c) => csvEscape(t(c.label))).join(',')
  const body = sortedRows.value.map((row) => cols.map((c) => csvEscape(cellCsv(row, c))).join(','))
  const csv = [header, ...body].join('\r\n')
  const stamp = new Date().toISOString().slice(0, 10)
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${props.orderId}-${stamp}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Compact mode: when the filter bar gets narrow, drop the AI + Column-settings
// icon buttons so the right group stays on one line (no wrap). Export + Search stay.
const filterBarEl = ref<HTMLElement | null>(null)
const compact = ref(false)
function checkCompact() {
  const w = filterBarEl.value?.clientWidth ?? 9999
  compact.value = w < 1000
}
let filterRo: ResizeObserver | null = null
onMounted(() => {
  checkCompact()
  if (filterBarEl.value && 'ResizeObserver' in window) {
    filterRo = new ResizeObserver(checkCompact)
    filterRo.observe(filterBarEl.value)
  }
})
onUnmounted(() => filterRo?.disconnect())

const hasFilter = computed(() => warehouseFilter.value.length > 0 || operatorFilter.value.length > 0 || (showDate.value && periodPreset.value !== defaultPreset()) || drawerFilterCount.value > 0)
const emptyIllustration = '/illustrations/empty-folder.png'
</script>

<template>
  <div class="rpt-page">
    <!-- ── Title bar (full-bleed detail) ── -->
    <div class="rpt-titlebar">
      <div class="rpt-titlebar-left">
        <MpButton v-if="showBreadcrumb" class="rpt-breadcrumb" variant="ghost" @click="router.push('/wms-report')">{{ t('Reports') }}</MpButton>
        <h1 class="rpt-title">{{ t(title) }}</h1>
      </div>
    </div>

    <!-- ── Stage ── -->
    <div class="rpt-stage">
      <!-- Filter bar: filters on the left; Search + Export always on the right.
           AI + Column-settings icons drop out in compact (narrow) mode. -->
      <div ref="filterBarEl" class="rpt-filter-bar">
        <div class="rpt-filter-left">
        <!-- Date — Advance-date pattern: preset sidebar + calendar in one popover.
             Hidden on snapshot reports (Warehouse stock quantity). -->
        <MpPopover v-if="showDate" :id="`rpt-period-${orderId}`" :is-close-on-select="false">
          <MpPopoverTrigger>
            <MpButton type="button" class="filter-trigger" variant="ghost" :style="{ width: '210px' }">
              <svg class="cal-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 2.5v3M16 2.5v3M3.5 9.5h17M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V6A1.5 1.5 0 0 1 5 4.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              <span class="filter-trigger-label">{{ periodLabel }}</span>
              <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </MpButton>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ padding: '0', width: 'max-content' })">
            <div class="rpt-date-panel">
              <!-- Preset list. In preset mode each row shows its resolved date range;
                   in Custom mode the list collapses to plain labels beside the calendar. -->
              <div class="rpt-date-list" :class="{ 'rpt-date-list--compact': periodPreset === 'custom' }">
                <MpButton
                  v-for="opt in periodOptions" :key="opt.value" type="button"
                  class="rpt-date-item" variant="ghost" :class="{ 'rpt-date-item--active': periodPreset === opt.value }"
                  @click="selectPreset(opt.value)"
                >
                  <span class="rpt-date-item-label">{{ t(opt.label) }}</span>
                  <span v-if="periodPreset !== 'custom'" class="rpt-date-item-range">{{ presetRangeLabel(Number(opt.value)) }}</span>
                </MpButton>
                <div class="rpt-date-divider" />
                <MpButton
                  type="button"
                  class="rpt-date-item" variant="ghost" :class="{ 'rpt-date-item--active': periodPreset === 'custom' }"
                  @click="selectCustom"
                >
                  <span class="rpt-date-item-label">{{ t('Custom range') }}</span>
                </MpButton>
              </div>

              <!-- Two-month calendar — only in Custom range mode -->
              <template v-if="periodPreset === 'custom'">
              <div class="rpt-date-divider-v" />
              <div class="rpt-date-months">
                <div v-for="side in (['left', 'right'] as const)" :key="side" class="rpt-cal">
                  <div class="rpt-cal-header">
                    <MpButton class="rpt-cal-nav" variant="ghost" type="button" :aria-label="t('Previous month')" @click="calPrevMonth">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 6L9 12L15 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </MpButton>
                    <span class="rpt-cal-title">{{ side === 'left' ? leftTitle : rightTitle }}</span>
                    <MpButton class="rpt-cal-nav" variant="ghost" type="button" :aria-label="t('Next month')" @click="calNextMonth">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </MpButton>
                  </div>
                  <div class="rpt-cal-weekdays">
                    <span v-for="d in WEEKDAYS" :key="d">{{ d }}</span>
                  </div>
                  <div class="rpt-cal-days">
                    <MpButton
                      v-for="cell in (side === 'left' ? leftCells : rightCells)" :key="cell.iso" type="button"
                      class="rpt-cal-day" variant="ghost"
                      :class="{
                        'rpt-cal-day--muted': !cell.inMonth,
                        'rpt-cal-day--today': cell.inMonth && cell.iso === todayIso,
                        'rpt-cal-day--in-range': cell.inMonth && calCellInRange(cell.iso),
                        'rpt-cal-day--end': cell.inMonth && calCellIsEnd(cell.iso),
                      }"
                      @click="onCalDayClick(cell)"
                    >{{ cell.dayNum }}</MpButton>
                  </div>
                </div>
              </div>
              </template>
            </div>
          </MpPopoverContent>
        </MpPopover>

        <!-- Warehouse — multi-select -->
        <MpPopover :id="`rpt-wh-${orderId}`" :is-close-on-select="false">
          <MpPopoverTrigger>
            <MpButton type="button" class="filter-trigger" variant="ghost" :style="{ width: '200px' }">
              <span class="filter-trigger-label">{{ warehouseLabel }}</span>
              <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </MpButton>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', maxWidth: '320px' })">
            <div class="checkbox-filter-list">
              <label v-for="opt in warehouseOptions" :key="opt.value" class="checkbox-filter-item">
                <MpCheckbox
                  :id="`rpt-wh-${orderId}-${opt.value}`"
                  :is-checked="warehouseFilter.includes(opt.value)"
                  @change="toggleWarehouse(opt.value)"
                  @click.stop
                >
                  {{ opt.label }}
                </MpCheckbox>
              </label>
            </div>
          </MpPopoverContent>
        </MpPopover>

        <!-- Operator — multi-select, scoped to the selected warehouses (reports
             with an operator dimension only) -->
        <MpPopover v-if="showOperator" :id="`rpt-op-${orderId}`" :is-close-on-select="false">
          <MpPopoverTrigger>
            <MpButton type="button" class="filter-trigger" variant="ghost" :style="{ width: '190px' }">
              <span class="filter-trigger-label">{{ operatorLabel }}</span>
              <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </MpButton>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '190px', width: 'max-content', maxWidth: '320px' })">
            <div class="checkbox-filter-list">
              <label v-for="name in operatorList" :key="name" class="checkbox-filter-item">
                <MpCheckbox
                  :id="`rpt-op-${orderId}-${name}`"
                  :is-checked="operatorFilter.includes(name)"
                  @change="toggleOperator(name)"
                  @click.stop
                >
                  {{ name }}
                </MpCheckbox>
              </label>
            </div>
          </MpPopoverContent>
        </MpPopover>

        <!-- All filters — accuracy reports only (Keywords / Product name / Source / Completion state) -->
        <MpButton v-if="isAccuracy" class="filter-all-btn" variant="ghost" type="button" @click="isFiltersDrawerOpen = true">
          <MpIcon name="filter" size="sm" />
          {{ drawerFilterCount ? `${t('All filters')} (${drawerFilterCount})` : t('All filters') }}
        </MpButton>
        </div>

        <div class="rpt-filter-right">
          <div class="filter-btn-group">
            <MpTooltip v-if="!compact" id="tt-rpt-airene" :label="t('Ask Airene')" placement="bottom" use-portal>
              <MpButton class="filter-icon-btn filter-icon-btn--airene" variant="ghost" type="button" :aria-label="t('Ask Airene')" @click="toggleAirene?.()"><MpIcon name="airene-brand" size="md" /></MpButton>
            </MpTooltip>
            <ColumnSettingsMenu v-if="!compact" :id="`rpt-col-settings-${orderId}`" :items="columnItems" :visibility="colVis" />
            <MpTooltip id="tt-rpt-export" :label="t('Export')" placement="bottom" use-portal>
              <MpButton class="filter-icon-btn" variant="ghost" type="button" :aria-label="t('Export')" @click="exportCsv"><MpIcon name="download" size="md" /></MpButton>
            </MpTooltip>
          </div>
          <div class="filter-search">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')" />
            <MpButton v-if="search" class="search-clear-btn" variant="ghost" type="button" :aria-label="t('Clear search')" @click="search = ''">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
              </svg>
            </MpButton>
          </div>
        </div>
      </div>

      <!-- Table + pagination -->
      <div v-if="total" class="rpt-table-section">
        <div class="rpt-table-wrap">
          <table class="rpt-table">
            <thead>
              <tr>
                <th v-for="col in visibleColumns" :key="col.key" class="rpt-th" :class="{ 'rpt-th--right': col.align === 'right' }">
                  <span class="rpt-th-inner">
                    <span>{{ t(col.label) }}</span>
                    <ErpColumnSortMenu :col-key="col.key" :sort-type="col.sortType" :sort-key="sortKey" :sort-dir="sortDir"
                      @sort-change="onSortChange" @hide-column="hideColumn" />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in pagedRows" :key="i" class="rpt-row">
                <td v-for="col in visibleColumns" :key="col.key" class="rpt-td" :class="{ 'rpt-td--right': col.align === 'right', 'rpt-td--muted': cellText(row, col) === '—' }">
                  {{ cellText(row, col) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ErpPagination
          :current-page="currentPage"
          :per-page="perPage"
          :total="total"
          @page-change="currentPage = $event"
          @per-page-change="perPage = $event"
        />
      </div>

      <!-- Empty state -->
      <div v-else class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ hasFilter ? t('No report data found') : t('No report data') }}</p>
        <p class="empty-full-desc">{{ hasFilter ? t('Try adjusting your filters.') : t('Report data will appear here.') }}</p>
      </div>
    </div>

    <!-- ── All filters drawer (accuracy reports only) ── -->
    <WmsReportFiltersDrawer
      v-if="isAccuracy"
      v-model:is-open="isFiltersDrawerOpen"
      :model-value="drawerValue"
      :columns="columns"
      :sku-options="accOptions.skus"
      :source-options="sourceOptions"
      :receive-state-options="receiveStateOptions"
      @apply="applyDrawerFilters"
    />
  </div>
</template>

<style scoped>
.rpt-page { display: flex; flex-direction: column; height: 100%; min-height: 0; }

/* ── Title bar (matches page-title-bar: 72px, neutral-subtle) ── */
.rpt-titlebar {
  height: var(--mp-sizes-18, 72px);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 var(--mp-spacing-6); flex-shrink: 0;
}
.rpt-titlebar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.rpt-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px);
}
.rpt-breadcrumb:hover { text-decoration: underline; }
.rpt-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}

/* ── Stage ── */
.rpt-stage {
  flex: 1; min-height: 0; overflow-y: auto;
  background: var(--mp-background-stage, #fff);
  border-top-left-radius: var(--mp-radii-lg, 12px);
  padding: var(--mp-spacing-6);
  display: flex; flex-direction: column; gap: var(--mp-spacing-5);
}

/* ── Filter bar ── */
.rpt-filter-bar { display: flex; gap: var(--mp-spacing-3); align-items: center; justify-content: space-between; flex-wrap: wrap; }
.rpt-filter-left { display: flex; gap: var(--mp-spacing-3); align-items: center; flex-wrap: wrap; }
.rpt-filter-right { display: flex; gap: var(--mp-spacing-3); align-items: center; margin-left: auto; }
/* Search box — pill, same pattern as the ERP index tables' filter search. */
.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  height: 40px; padding: 0 var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral, #fff); color: var(--mp-text-secondary); min-width: 220px;
}
/* Filter-bar action icon buttons (Export) — same as ReceivingIndexPage. */
.filter-btn-group { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.filter-icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-text-secondary); padding: var(--mp-spacing-2);
}
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.filter-icon-btn--airene { color: var(--mp-airene-default); }
.filter-search-input {
  flex: 1; min-width: 0; border: none; background: transparent; outline: none;
  font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-default); line-height: var(--mp-line-heights-md, 20px);
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  border: none; background: none; color: var(--mp-icon-default); cursor: pointer; padding: 0; flex: none;
}
.search-clear-btn:hover { color: var(--mp-text-default); }
.filter-trigger {
  display: inline-flex; align-items: center; justify-content: space-between; gap: 8px;
  height: var(--mp-sizes-9\.5, 38px); padding: 0 12px;
  border: 1px solid var(--mp-colors-border-form, #1d1f2429); border-radius: 8px;
  background: var(--mp-background-default, #fff);
  font-size: 14px; color: var(--mp-text-default); cursor: pointer; text-align: left;
}
.filter-trigger:hover { border-color: var(--mp-border-bold); }
.filter-trigger-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.filter-trigger .chev { color: var(--mp-icon-default); flex: none; }
.filter-trigger .cal-ico { color: var(--mp-icon-default); flex: none; }
/* Date filter — two-month range picker (Figma 4167-29317): preset sidebar +
   two consecutive months. Enterprise green endpoints (#0f6d4d), light-green band
   (#d6f4e9), yellow today (#f5cd47). */
.rpt-date-panel { display: flex; align-items: stretch; padding: var(--mp-spacing-3); }
.rpt-date-list {
  display: flex; flex-direction: column; flex-shrink: 0; min-width: 300px;
}
/* Custom mode: list collapses to a plain-label sidebar beside the calendar. */
.rpt-date-list--compact { min-width: 140px; }
.rpt-date-item {
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
  width: 100%; text-align: left;
  padding: var(--mp-spacing-2) var(--mp-spacing-3); border-radius: var(--mp-radii-md);
  border: none; background: none; cursor: pointer;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default); line-height: var(--mp-line-heights-md);
}
.rpt-date-item:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.rpt-date-item--active,
.rpt-date-item--active:hover { background: var(--mp-background-neutral-subtle, #f0f1f3); }
.rpt-date-item-label { white-space: nowrap; }
.rpt-date-item-range { flex: 1; text-align: right; white-space: nowrap; color: var(--mp-text-default); }
.rpt-date-divider { height: 1px; margin: var(--mp-spacing-2) 0; background: var(--mp-border-default, #e3e7e9); }
.rpt-date-divider-v { width: 1px; flex-shrink: 0; margin: 0 var(--mp-spacing-3); background: var(--mp-border-default, #e3e7e9); }
.rpt-date-months { display: flex; gap: var(--mp-spacing-5); }
.rpt-cal { display: flex; flex-direction: column; }
.rpt-cal-header { display: flex; align-items: center; gap: var(--mp-spacing-1); margin-bottom: var(--mp-spacing-2); }
.rpt-cal-nav {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px);
  border: none; background: none; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-default);
}
.rpt-cal-nav:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.rpt-cal-title {
  flex: 1; text-align: center; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.rpt-cal-weekdays, .rpt-cal-days { display: grid; grid-template-columns: repeat(7, 36px); }
.rpt-cal-weekdays span {
  display: flex; align-items: center; justify-content: center; height: 36px;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}
.rpt-cal-day {
  display: flex; align-items: center; justify-content: center; height: 36px;
  border: none; background: none; border-radius: var(--mp-radii-sm); cursor: pointer;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.rpt-cal-day:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.rpt-cal-day--muted { color: var(--mp-text-disabled, rgba(29, 31, 36, 0.32)); }
/* Continuous light-green band between the two ends. */
.rpt-cal-day--in-range { background: var(--mp-background-brand-selected, #d6f4e9); border-radius: 0; color: var(--mp-text-default); }
.rpt-cal-day--today { background: var(--mp-background-warning-bold, #f5cd47); color: var(--mp-text-default); font-weight: var(--mp-font-weights-semi-bold); }
/* Range endpoints — solid Enterprise green, rounded, above the band. */
.rpt-cal-day--end {
  background: var(--mp-background-brand-bold-selected, #0f6d4d); color: var(--mp-text-inverse, #fff);
  border-radius: var(--mp-radii-sm); font-weight: var(--mp-font-weights-semi-bold);
}
.rpt-cal-day--end:hover { background: var(--mp-background-brand-bold-selected, #0f6d4d); }
.rpt-cal-day--end.rpt-cal-day--today { color: var(--mp-text-inverse, #fff); }

/* "All filters" button (mirrors BillOfMaterialsIndexPage) */
.filter-all-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  height: 40px;
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral, #ffffff);
  border: 1px solid var(--mp-border-bold, #8c9596);
  border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md); color: var(--mp-text-secondary);
  cursor: pointer; white-space: nowrap;
}
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }

/* Multi-select checkbox filter list (mirrors ReceivingIndexPage) */
.checkbox-filter-list { display: flex; flex-direction: column; padding: var(--mp-spacing-1); }
.checkbox-filter-item {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) 10px; border-radius: var(--mp-radii-md);
  cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.checkbox-filter-item:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); }

/* ── Table ── */
.rpt-table-section { display: flex; flex-direction: column; }
/* ERP tables have NO outer border box — the header (bg + bottom border) and row
   bottom-borders do the work; the wrapper is scroll-only. Same as .erp-table-wrapper. */
.rpt-table-wrap { overflow-x: auto; }
.rpt-table { width: 100%; border-collapse: collapse; white-space: nowrap; }
.rpt-th {
  position: sticky; top: 0;
  height: var(--mp-sizes-7, 28px);
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-3);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; color: var(--mp-text-secondary); text-align: left; white-space: nowrap;
}
.rpt-th--right { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-3) var(--mp-spacing-1) var(--mp-spacing-4); }
.rpt-th-inner { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); max-width: 100%; vertical-align: middle; }
.rpt-th--right .rpt-th-inner { flex-direction: row-reverse; }
.rpt-th:hover :deep(.erp-sort-btn) { visibility: visible; }

.rpt-td {
  height: var(--mp-sizes-10, 40px);
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-3);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); vertical-align: middle; white-space: nowrap;
}
.rpt-td--right { text-align: right; padding: 10px var(--mp-spacing-3) 10px var(--mp-spacing-4); font-variant-numeric: tabular-nums; }
.rpt-td--muted { color: var(--mp-text-secondary); }
.rpt-row:last-child .rpt-td { border-bottom: none; }
.rpt-row:hover .rpt-td { background: var(--mp-background-neutral-subtle, #f8f9f9); }

/* ── Empty state ── */
.empty-full { display: flex; flex-direction: column; align-items: center; padding: var(--mp-spacing-10, 40px) 0; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin-top: var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
