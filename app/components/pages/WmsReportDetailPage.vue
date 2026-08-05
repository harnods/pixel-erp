<script setup lang="ts">
/**
 * WMS Report detail — the row-level raw-data table for one of the four WMS reports
 * (docs/prd/wms-reports-analytics-prd.md, Stories 11–14). Config-driven: the
 * `orderId` slug selects a ReportDef from wmsReports.ts (title + columns + a pure
 * rows(filter) builder over the live mini-DB). Full-bleed (rendered via detailMatch
 * in [...slug].vue), so it draws its own title bar with a back link + Export (CSV).
 */
import { ref, reactive, computed, watch, inject, onMounted, onUnmounted } from 'vue'
import { MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpTooltip, MpIcon, MpCheckbox, MpDatePicker, css } from '@mekari/pixel3'
import ErpColumnSortMenu from '~/components/patterns/ErpColumnSortMenu.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ErpPagination from '~/components/patterns/ErpPagination.vue'
import { formatDate, formatDateTime } from '~/utils/date'
import { warehouses } from '~/data/warehouses'
import { TODAY } from '~/data/master'
import { operatorOptionsMulti } from '~/data/wmsAnalytics'
import { WMS_REPORTS, type ReportColumn, type ReportFilter, type ReportRow } from '~/data/wmsReports'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()
const toggleAirene = inject<() => void>('toggleAirene')

// ── Report definition for this slug ─────────────────────────────────────────────
const def = computed(() => WMS_REPORTS[props.orderId])
const title = computed(() => def.value?.title ?? 'Report')

// ── Filters ─────────────────────────────────────────────────────────────────────
const warehouseFilter = ref<string[]>([])   // empty = all warehouses
const operatorFilter = ref<string[]>([])     // empty = all operators
const search = ref('')

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
const operatorList = computed(() => def.value ? operatorOptionsMulti(def.value.direction, warehouseFilter.value) : [])
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
const periodPreset = ref<'7' | '30' | '90' | 'custom'>('30')
const customFrom = ref('') // DD/MM/YYYY
const customTo = ref('')
function parseDMY(s: string): Date | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
}
function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// Active custom range as inclusive ISO strings, or null when incomplete/not custom.
const customRange = computed<{ from: string; to: string } | null>(() => {
  if (periodPreset.value !== 'custom') return null
  const from = parseDMY(customFrom.value)
  const to = parseDMY(customTo.value)
  return from && to ? { from: toIso(from), to: toIso(to) } : null
})

function rangeLabel(days: number): string {
  const from = new Date(TODAY.getTime() - days * 86_400_000)
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
  return `${fmt(from)} – ${fmt(TODAY)} ${TODAY.getFullYear()}`
}
const periodOptions = [
  { value: '7' as const, label: 'Last 7 days' },
  { value: '30' as const, label: 'Last 30 days' },
  { value: '90' as const, label: 'Last 90 days' },
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
const filter = computed<ReportFilter>(() => ({
  warehouseIds: warehouseFilter.value,
  operators: operatorFilter.value,
  periodDays: Number(periodPreset.value) || 30,
  customRange: customRange.value,
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
watch([warehouseFilter, operatorFilter, periodPreset, customFrom, customTo, search, () => props.orderId, perPage], () => { currentPage.value = 1 })

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

const hasFilter = computed(() => warehouseFilter.value.length > 0 || operatorFilter.value.length > 0 || periodPreset.value !== '30')
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
      <!-- Filter bar: filters on the left; Search + Export always on the right.
           AI + Column-settings icons drop out in compact (narrow) mode. -->
      <div ref="filterBarEl" class="rpt-filter-bar">
        <div class="rpt-filter-left">
        <!-- Date — presets + custom range -->
        <MpPopover :id="`rpt-period-${orderId}`" :is-close-on-select="false">
          <MpPopoverTrigger>
            <button type="button" class="filter-trigger" :style="{ width: '210px' }">
              <svg class="cal-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 2.5v3M16 2.5v3M3.5 9.5h17M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V6A1.5 1.5 0 0 1 5 4.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              <span class="filter-trigger-label">{{ periodLabel }}</span>
              <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '260px', width: 'max-content' })">
            <MpPopoverList>
              <MpPopoverListItem v-for="opt in periodOptions" :key="opt.value"
                :is-active="opt.value === periodPreset" @click="periodPreset = opt.value">
                <span class="period-opt"><span>{{ t(opt.label) }}</span><span class="period-opt-range">{{ rangeLabel(Number(opt.value)) }}</span></span>
              </MpPopoverListItem>
              <MpPopoverListItem :is-active="periodPreset === 'custom'" @click="periodPreset = 'custom'">
                {{ t('Custom range…') }}
              </MpPopoverListItem>
            </MpPopoverList>
            <div v-if="periodPreset === 'custom'" class="period-custom">
              <MpDatePicker :id="`rpt-period-from-${orderId}`" v-model="customFrom" :placeholder="t('From')" format="DD/MM/YYYY" use-portal />
              <MpDatePicker :id="`rpt-period-to-${orderId}`" v-model="customTo" :placeholder="t('To')" format="DD/MM/YYYY" use-portal />
            </div>
          </MpPopoverContent>
        </MpPopover>

        <!-- Warehouse — multi-select -->
        <MpPopover :id="`rpt-wh-${orderId}`" :is-close-on-select="false">
          <MpPopoverTrigger>
            <button type="button" class="filter-trigger" :style="{ width: '200px' }">
              <span class="filter-trigger-label">{{ warehouseLabel }}</span>
              <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
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

        <!-- Operator — multi-select, scoped to the selected warehouses -->
        <MpPopover :id="`rpt-op-${orderId}`" :is-close-on-select="false">
          <MpPopoverTrigger>
            <button type="button" class="filter-trigger" :style="{ width: '190px' }">
              <span class="filter-trigger-label">{{ operatorLabel }}</span>
              <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
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
        </div>

        <div class="rpt-filter-right">
          <div class="filter-btn-group">
            <MpTooltip v-if="!compact" id="tt-rpt-airene" :label="t('Ask Airene')" placement="bottom" use-portal>
              <button class="filter-icon-btn filter-icon-btn--airene" type="button" :aria-label="t('Ask Airene')" @click="toggleAirene?.()">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                  <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
                </svg>
              </button>
            </MpTooltip>
            <ColumnSettingsMenu v-if="!compact" :id="`rpt-col-settings-${orderId}`" :items="columnItems" :visibility="colVis" />
            <MpTooltip id="tt-rpt-export" :label="t('Export')" placement="bottom" use-portal>
              <button class="filter-icon-btn" type="button" :aria-label="t('Export')" @click="exportCsv"><MpIcon name="download" size="md" /></button>
            </MpTooltip>
          </div>
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
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full, 999px);
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
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
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
/* Custom date range inputs (mirrors ReceiptIndexPage .arrival-custom) */
.period-custom {
  display: flex; flex-direction: column; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-3);
  border-top: 1px solid var(--mp-border-default);
}

/* Multi-select checkbox filter list (mirrors ReceivingIndexPage) */
.checkbox-filter-list { display: flex; flex-direction: column; padding: var(--mp-spacing-1); }
.checkbox-filter-item {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) 10px; border-radius: var(--mp-radii-md);
  cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.checkbox-filter-item:hover { background: var(--mp-background-neutral-subtle); }

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
