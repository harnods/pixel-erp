<script setup lang="ts">
/**
 * Subcon order report — Reports › Production › Subcon order.
 *
 * One row per subcontracting work order, with the R19 columns (PRD Rev 5). The
 * table and the Excel download read the same rows (`subconReportRows`), so what
 * is on screen is what lands in the file — filters and search included.
 *
 * The period filters on the work order's plan start date and defaults to the
 * current year of the mock timeline (TODAY), since a subcon run spans weeks.
 *
 * Full-bleed (rendered via detailMatch in [...slug].vue), so it draws its own
 * 72px title bar with the Reports breadcrumb, same as the Dual unit report.
 */
import { ref, computed, watch, onMounted } from 'vue'
import { MpButton, MpIcon, MpTooltip } from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import AdvanceDateFilter from '~/components/patterns/AdvanceDateFilter.vue'
import { formatDate } from '~/utils/date'
import { resolveDateFilterRange, toIso, type DateFilterValue } from '~/utils/dateFilter'
import { TODAY, TODAY_ISO } from '~/data/master'
import { workOrders, type WorkOrderStatus } from '~/data/workOrders'
import { SUBCON_METHOD_LABEL } from '~/data/subcon'
import {
  subconReportRows, toSubconExportRows, downloadSubconExport,
  WORK_ORDER_STATUS_LABEL, type SubconReportRow,
} from '~/data/subconExport'

const { t } = useLocale()
const router = useRouter()

const TITLE = 'Subcon order report'

// ── Columns (R19, in order) ─────────────────────────────────────────────────────
const columns: TableColumn[] = [
  { key: 'number',       label: 'WO number',     kind: 'number', sortable: true },
  { key: 'product',      label: 'Product',       kind: 'name',   sortable: true },
  { key: 'bomNumber',    label: 'BOM',           kind: 'number' },
  { key: 'vendor',       label: 'Subcon vendor', kind: 'name',   sortable: true },
  { key: 'method',       label: 'Method' },
  { key: 'scope',        label: 'Scope' },
  { key: 'plannedQty',   label: 'Qty',           align: 'right', sortable: true },
  { key: 'receivedQty',  label: 'Received',      align: 'right' },
  { key: 'promisedDate', label: 'Promised date', kind: 'date',   sortable: true },
  { key: 'status',       label: 'Status',        kind: 'status' },
]

// ── Filters ─────────────────────────────────────────────────────────────────────
const dateFilter = ref<DateFilterValue>({ mode: 'year', date: TODAY_ISO })
const range = computed(() =>
  resolveDateFilterRange(dateFilter.value, TODAY)
  ?? resolveDateFilterRange({ mode: 'year', date: TODAY_ISO }, TODAY)!)
const fromIso = computed(() => toIso(range.value.start))
const toIsoDate = computed(() => toIso(range.value.end))

const allRows = computed<SubconReportRow[]>(() => subconReportRows(workOrders))

const vendorFilter = ref('')
const vendorOptions = computed(() => {
  const seen = new Map<string, string>()
  for (const r of allRows.value) seen.set(r.vendorId, r.vendor)
  return [...seen].map(([value, label]) => ({ value, label }))
})
const methodFilter = ref('')
const methodOptions = Object.values(SUBCON_METHOD_LABEL).map(m => ({ value: m, label: t(m) }))
const statusFilter = ref('')
const statusOptions = computed(() => {
  const present = new Set(allRows.value.map(r => r.status))
  return (Object.keys(WORK_ORDER_STATUS_LABEL) as WorkOrderStatus[])
    .filter(s => present.has(s))
    .map(s => ({ value: s, label: t(WORK_ORDER_STATUS_LABEL[s]) }))
})

const inRange = computed(() => allRows.value.filter(r =>
  r.planStartDate >= fromIso.value && r.planStartDate <= toIsoDate.value))

const {
  filtered, search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort,
} = useTableState<SubconReportRow>(inRange, {
  perPage: 25,
  defaultSort: { key: 'number', dir: 'desc' },
  filterFn: (row, s) => {
    const matchesSearch = !s
      || row.number.toLowerCase().includes(s)
      || row.product.toLowerCase().includes(s)
      || row.vendor.toLowerCase().includes(s)
    return matchesSearch
      && (!vendorFilter.value || row.vendorId === vendorFilter.value)
      && (!methodFilter.value || row.method === methodFilter.value)
      && (!statusFilter.value || row.status === statusFilter.value)
  },
})
watch([dateFilter, vendorFilter, methodFilter, statusFilter], () => setPage(1))

const hasActiveFilter = computed(() =>
  !!search.value || !!vendorFilter.value || !!methodFilter.value || !!statusFilter.value)
function clearFilters() {
  search.value = ''
  vendorFilter.value = ''
  methodFilter.value = ''
  statusFilter.value = ''
}

// ── Export — exactly the rows the table holds after filters + search ────────────
function onExport() {
  void downloadSubconExport(toSubconExportRows(filtered.value))
}

// ── Cells ───────────────────────────────────────────────────────────────────────
const qtyFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 })
function viewWorkOrder(row: SubconReportRow) { router.push(`/work-orders/${row.id}`) }

const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 600) })
const emptyIllustration = '/illustrations/empty-folder.png'
</script>

<template>
  <div class="sor-page" data-devchange="subcon-order-report">
    <div class="sor-titlebar">
      <MpButton class="sor-breadcrumb" variant="textLink" size="sm" @click="router.push('/production-report')">{{ t('Reports') }}</MpButton>
      <h1 class="sor-title">{{ t(TITLE) }}</h1>
    </div>

    <div class="sor-stage">
      <ErpTablePage
        :columns="columns"
        :rows="(paginated as unknown as Record<string, unknown>[])"
        :total="total"
        :current-page="currentPage"
        :per-page="perPage"
        :sort-key="sortKey"
        :sort-dir="sortDir"
        :loading="loading"
        :has-active-filter="hasActiveFilter"
        :search="search"
        filter-empty-label="subcon order"
        @page-change="setPage"
        @per-page-change="setPerPage"
        @sort="toggleSort"
        @clear-filters="clearFilters"
      >
        <template #filters>
          <div class="filter-left">
            <div class="sor-date">
              <AdvanceDateFilter
                id="sor-date"
                v-model="dateFilter"
                :today="TODAY"
                :clearable="false"
                :placeholder="t('Select date')"
              />
            </div>
            <ErpFilterSelect
              id="sor-vendor-filter"
              :model-value="vendorFilter"
              :placeholder="t('Vendor')"
              :options="vendorOptions"
              width="200px"
              @update:model-value="(v: string) => (vendorFilter = v)"
            />
            <ErpFilterSelect
              id="sor-method-filter"
              :model-value="methodFilter"
              :placeholder="t('Method')"
              :options="methodOptions"
              @update:model-value="(v: string) => (methodFilter = v)"
            />
            <ErpFilterSelect
              id="sor-status-filter"
              :model-value="statusFilter"
              :placeholder="t('Status')"
              :options="statusOptions"
              width="200px"
              @update:model-value="(v: string) => (statusFilter = v)"
            />
          </div>

          <div class="filter-right">
            <MpTooltip id="tt-sor-export" :label="t('Export')" placement="bottom" use-portal>
              <MpButton class="filter-icon-btn" variant="ghost" :aria-label="t('Export')" data-devchange="subcon-order-report-export" @click="onExport">
                <MpIcon name="download" size="md" />
              </MpButton>
            </MpTooltip>
            <div class="filter-search">
              <MpIcon name="search" size="md" />
              <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search WO number, product or vendor')" />
              <MpIcon v-if="search" name="close" size="sm" class="search-clear" role="button" :aria-label="t('Clear search')" @click="search = ''" />
            </div>
          </div>
        </template>

        <template #cell-number="{ value, row }">
          <a class="cell-link cell-text" @click.stop="viewWorkOrder(row as unknown as SubconReportRow)">{{ value }}</a>
        </template>
        <template #cell-product="{ value }"><span class="sor-wrap">{{ value }}</span></template>
        <template #cell-vendor="{ value }"><span class="sor-wrap">{{ value }}</span></template>
        <template #cell-bomNumber="{ value }">{{ value || '—' }}</template>
        <template #cell-method="{ value }">{{ t(value as string) }}</template>
        <template #cell-scope="{ value }">{{ t(value as string) }}</template>
        <template #cell-plannedQty="{ row }">
          {{ qtyFormat.format((row as unknown as SubconReportRow).plannedQty) }} {{ (row as unknown as SubconReportRow).unit }}
        </template>
        <template #cell-receivedQty="{ row }">
          {{ qtyFormat.format((row as unknown as SubconReportRow).receivedQty) }}/{{ qtyFormat.format((row as unknown as SubconReportRow).plannedQty) }}
        </template>
        <template #cell-promisedDate="{ value }">{{ formatDate(value as string) }}</template>
        <template #cell-status="{ value }">
          <ErpStatusBadge :status="(value as string)" :label="t(WORK_ORDER_STATUS_LABEL[value as WorkOrderStatus] ?? (value as string))" />
        </template>

        <!-- First run: no subcon work order in the period at all. -->
        <template #empty>
          <div class="empty-full">
            <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
            <p class="empty-full-title">{{ t('No subcon order') }}</p>
            <p class="empty-full-desc">{{ t('Subcon orders will appear here.') }}</p>
          </div>
        </template>
      </ErpTablePage>
    </div>
  </div>
</template>

<style scoped>
.sor-page { display: flex; flex-direction: column; height: 100%; min-height: 0; }

/* ── Title bar (matches page-title-bar: 72px, neutral-subtle) ── */
.sor-titlebar {
  height: var(--mp-sizes-18, 72px);
  background: var(--mp-background-neutral-subtle);
  display: flex; flex-direction: column; justify-content: center;
  padding: 0 var(--mp-spacing-6); flex-shrink: 0;
}
.sor-breadcrumb {
  align-self: flex-start; padding: 0;
  font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm, 16px);
}
.sor-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}

/* ── Stage ── */
.sor-stage {
  flex: 1; min-height: 0; overflow-y: auto;
  background: var(--mp-background-stage, #fff);
  border-top-left-radius: var(--mp-radii-lg, 12px);
  padding: var(--mp-spacing-6);
  display: flex; flex-direction: column;
}

/* ── Filter bar ── */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.sor-date { width: 230px; flex-shrink: 0; }
.sor-date :deep(.adf-trigger) { width: 100%; }
.filter-icon-btn {
  display: flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  padding: var(--mp-spacing-2); border: none; background: transparent;
  border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-default);
}
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  width: 280px; padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle);
}
.filter-search-input {
  flex: 1; border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default); min-width: 0;
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear { color: var(--mp-icon-default); cursor: pointer; flex: none; }

/* ── Cells ── */
.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.sor-wrap { white-space: normal; }

/* ── Empty state ── */
.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.empty-full-desc {
  margin-top: var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
</style>
