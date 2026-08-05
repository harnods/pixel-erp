<script setup lang="ts">
/**
 * WMS Report detail — the row-level raw-data table for one of the four WMS reports
 * (docs/prd/wms-reports-analytics-prd.md, Stories 11–14). Config-driven: the
 * `orderId` slug selects a ReportDef from wmsReports.ts (title + columns + a pure
 * rows(filter) builder over the live mini-DB). Full-bleed (rendered via detailMatch
 * in [...slug].vue), so it draws its own title bar with a back link + Export (CSV).
 */
import { ref, reactive, computed, watch } from 'vue'
import { MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css } from '@mekari/pixel3'
import ErpColumnSortMenu from '~/components/patterns/ErpColumnSortMenu.vue'
import ErpPagination from '~/components/patterns/ErpPagination.vue'
import { formatDate, formatDateTime } from '~/utils/date'
import { warehouses } from '~/data/warehouses'
import { TODAY } from '~/data/master'
import { operatorOptions } from '~/data/wmsAnalytics'
import { WMS_REPORTS, type ReportColumn, type ReportFilter, type ReportRow } from '~/data/wmsReports'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()

// ── Report definition for this slug ─────────────────────────────────────────────
const def = computed(() => WMS_REPORTS[props.orderId])
const title = computed(() => def.value?.title ?? 'Report')

// ── Filters ─────────────────────────────────────────────────────────────────────
const warehouseId = ref('all')
const operator = ref('all')
const periodDays = ref(30)
const search = ref('')

const filter = computed<ReportFilter>(() => ({
  warehouseId: warehouseId.value,
  operator: operator.value,
  periodDays: periodDays.value,
}))

const warehouseOptions = computed(() => [
  { value: 'all', label: t('All warehouses') },
  ...warehouses.filter((w) => !w.isDefault && w.status === 'active').map((w) => ({ value: w.id, label: w.name })),
])
const warehouseLabel = computed(() => warehouseOptions.value.find((o) => o.value === warehouseId.value)?.label ?? '')

const operatorList = computed(() => def.value ? operatorOptions(def.value.direction, warehouseId.value) : [])
const operatorOpts = computed(() => [{ value: 'all', label: t('All operators') }, ...operatorList.value.map((n) => ({ value: n, label: n }))])
const operatorLabel = computed(() => operator.value === 'all' ? t('All operators') : operator.value)
// Reset a now-invalid operator when the warehouse changes narrows the pool.
watch(warehouseId, () => {
  if (operator.value !== 'all' && !operatorList.value.includes(operator.value)) operator.value = 'all'
})

function rangeLabel(days: number): string {
  const from = new Date(TODAY.getTime() - days * 86_400_000)
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
  return `${fmt(from)} – ${fmt(TODAY)} ${TODAY.getFullYear()}`
}
const periodOptions = computed(() => [
  { value: 7, label: 'Last 7 days', range: rangeLabel(7) },
  { value: 30, label: 'Last 30 days', range: rangeLabel(30) },
  { value: 90, label: 'Last 90 days', range: rangeLabel(90) },
])
const periodLabel = computed(() => periodOptions.value.find((o) => o.value === periodDays.value)?.label ?? '')

// ── Columns (with hide support via the shared sort menu) ─────────────────────────
const columns = computed<ReportColumn[]>(() => def.value?.columns ?? [])
const colVis = reactive<Record<string, boolean>>({})
watch(columns, (cols) => { for (const c of cols) if (colVis[c.key] === undefined) colVis[c.key] = true }, { immediate: true })
const visibleColumns = computed(() => columns.value.filter((c) => colVis[c.key] !== false))
function hideColumn(key: string) { colVis[key] = false }

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
// Free-text search across every visible column's rendered cell text.
const searchedRows = computed<ReportRow[]>(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return baseRows.value
  const cols = visibleColumns.value
  return baseRows.value.filter((row) => cols.some((c) => cellText(row, c).toLowerCase().includes(q)))
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
watch([warehouseId, operator, periodDays, search, () => props.orderId, perPage], () => { currentPage.value = 1 })

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

const hasFilter = computed(() => warehouseId.value !== 'all' || operator.value !== 'all' || periodDays.value !== 30)
const emptyIllustration = '/illustrations/empty-folder.png'
</script>

<template>
  <div class="rpt-page">
    <!-- ── Title bar (full-bleed detail) ── -->
    <div class="rpt-titlebar">
      <div class="rpt-titlebar-left">
        <button class="rpt-breadcrumb" @click="router.push('/wms-report')">{{ t('Reports') }}</button>
        <h1 class="rpt-title">{{ t(title) }}</h1>
      </div>
    </div>

    <!-- ── Stage ── -->
    <div class="rpt-stage">
      <!-- Filter bar: filters on the left; Search + Export always on the right. -->
      <div class="rpt-filter-bar">
        <div class="rpt-filter-left">
        <MpPopover :id="`rpt-period-${orderId}`" is-close-on-select>
          <MpPopoverTrigger>
            <button type="button" class="filter-trigger" :style="{ width: '210px' }">
              <svg class="cal-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 2.5v3M16 2.5v3M3.5 9.5h17M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V6A1.5 1.5 0 0 1 5 4.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              <span class="filter-trigger-label">{{ t(periodLabel) }}</span>
              <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '260px', width: 'max-content' })">
            <MpPopoverList>
              <MpPopoverListItem v-for="opt in periodOptions" :key="opt.value"
                :is-active="opt.value === periodDays" @click="periodDays = opt.value">
                <span class="period-opt"><span>{{ t(opt.label) }}</span><span class="period-opt-range">{{ opt.range }}</span></span>
              </MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <MpPopover :id="`rpt-wh-${orderId}`" is-close-on-select>
          <MpPopoverTrigger>
            <button type="button" class="filter-trigger" :style="{ width: '200px' }">
              <span class="filter-trigger-label">{{ warehouseLabel }}</span>
              <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', maxWidth: '320px' })">
            <MpPopoverList>
              <MpPopoverListItem v-for="opt in warehouseOptions" :key="opt.value"
                :is-active="opt.value === warehouseId" @click="warehouseId = opt.value">{{ opt.label }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <MpPopover :id="`rpt-op-${orderId}`" is-close-on-select>
          <MpPopoverTrigger>
            <button type="button" class="filter-trigger" :style="{ width: '190px' }">
              <span class="filter-trigger-label">{{ operatorLabel }}</span>
              <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '190px', width: 'max-content', maxWidth: '320px' })">
            <MpPopoverList>
              <MpPopoverListItem v-for="opt in operatorOpts" :key="opt.value"
                :is-active="opt.value === operator" @click="operator = opt.value">{{ opt.label }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
        </div>

        <div class="rpt-filter-right">
          <div class="filter-search">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')" />
            <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <button type="button" class="btn-enterprise btn-enterprise--secondary rpt-export" @click="exportCsv">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            {{ t('Export') }}
          </button>
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
  </div>
</template>

<style scoped>
.rpt-page { display: flex; flex-direction: column; height: 100%; min-height: 0; }

/* ── Title bar (matches page-title-bar: 72px, neutral-subtle) ── */
.rpt-titlebar {
  height: var(--mp-sizes-18, 72px);
  background: var(--mp-background-neutral-subtle);
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 var(--mp-spacing-6); flex-shrink: 0;
}
.rpt-titlebar-left { display: flex; flex-direction: column; gap: 2px; }
.rpt-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm, 13px); color: var(--mp-text-link); line-height: 1.4;
}
.rpt-breadcrumb:hover { text-decoration: underline; }
.rpt-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}
.rpt-export { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); flex-shrink: 0; }

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
/* Search box — same pattern as the WMS index tables' filter search. */
.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  height: 40px; padding: 0 var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: 8px;
  background: var(--mp-background-default, #fff); color: var(--mp-text-secondary); min-width: 220px;
}
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
  height: 40px; padding: 0 12px;
  border: 1px solid var(--mp-border-form, var(--mp-border-default)); border-radius: 8px;
  background: var(--mp-background-default, #fff);
  font-size: 14px; color: var(--mp-text-default); cursor: pointer; text-align: left;
}
.filter-trigger:hover { border-color: var(--mp-border-bold); }
.filter-trigger-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.filter-trigger .chev { color: var(--mp-icon-default); flex: none; }
.filter-trigger .cal-ico { color: var(--mp-icon-default); flex: none; }
.period-opt { display: flex; align-items: baseline; justify-content: space-between; gap: 24px; width: 100%; }
.period-opt-range { font-size: 12px; color: var(--mp-text-subtle); }

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
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
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
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); vertical-align: middle; white-space: nowrap;
}
.rpt-td--right { text-align: right; padding: 10px var(--mp-spacing-3) 10px var(--mp-spacing-4); font-variant-numeric: tabular-nums; }
.rpt-td--muted { color: var(--mp-text-secondary); }
.rpt-row:last-child .rpt-td { border-bottom: none; }
.rpt-row:hover .rpt-td { background: var(--mp-background-neutral-subtle); }

/* ── Empty state ── */
.empty-full { display: flex; flex-direction: column; align-items: center; padding: var(--mp-spacing-10, 40px) 0; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin-top: var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
