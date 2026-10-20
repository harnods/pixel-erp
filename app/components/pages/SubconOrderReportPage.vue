<script setup lang="ts">
/**
 * Subcon order report — Reports › Production › Subcon order.
 *
 * Recreates the first Subcon orders page (65e92e69, 16 Sep 2026) on today's
 * data: subcon work orders replaced the separate subcon order record, so each
 * row is one subcon work order, and Status is the work order's own (R22).
 *
 * Carried over from that page: Product over its BOM, the method chip, Received
 * muted until something comes back, the overdue day count beside the promised
 * date, Method + Status filters, the Airene / columns / export group, the row
 * kebab, and the export dialog. The dialog writes a real .xlsx (R19 headings)
 * of the rows on screen, or only the current page.
 *
 * Full-bleed (rendered via detailMatch in [...slug].vue), so it draws its own
 * 72px title bar with the Reports breadcrumb, same as the Dual unit report.
 */
import { ref, computed, watch, reactive, inject, onMounted } from 'vue'
import {
  MpButton, MpButtonGroup, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, MpIcon, MpTooltip, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ScenarioFab from '~/components/patterns/ScenarioFab.vue'
import ExportModal from '~/components/patterns/ExportModal.vue'
import SubconMethodChip from '~/components/patterns/SubconMethodChip.vue'
import { formatDate } from '~/utils/date'
import { TODAY_ISO } from '~/data/master'
import { workOrders, type WorkOrderStatus } from '~/data/workOrders'
import { SUBCON_METHOD_LABEL, type SubconMethod } from '~/data/subcon'
import {
  subconReportRows, toSubconExportRows, downloadSubconExport,
  SUBCON_EXPORT_COLUMNS, WORK_ORDER_STATUS_LABEL, type SubconReportRow,
} from '~/data/subconExport'

const toggleAirene = inject<() => void>('toggleAirene')
const { t } = useLocale()
const router = useRouter()

const TITLE = 'Subcon order report'

// ─── Columns ───────────────────────────────────────────────────────────────────
const columns: TableColumn[] = [
  { key: 'number',       label: t('Number'),        kind: 'number', sortable: true, sortType: 'text' },
  { key: 'product',      label: t('Product'),       kind: 'name',   sortable: true, sortType: 'text' },
  { key: 'vendor',       label: t('Subcon vendor'), kind: 'name',   sortable: true, sortType: 'text' },
  { key: 'methodId',     label: t('Method')                                                          },
  { key: 'scope',        label: t('Scope')                                                           },
  { key: 'plannedQty',   label: t('Qty'),           align: 'right', sortable: true, sortType: 'number' },
  { key: 'receivedQty',  label: t('Received'),      align: 'right'                                   },
  { key: 'promisedDate', label: t('Promised date'), kind: 'date',   sortable: true, sortType: 'date' },
  { key: 'status',       label: t('Status'),        kind: 'status'                                   },
]

// ─── Filters ───────────────────────────────────────────────────────────────────
const METHOD_OPTIONS = (Object.keys(SUBCON_METHOD_LABEL) as SubconMethod[])
  .map(m => ({ value: m, label: t(SUBCON_METHOD_LABEL[m]) }))
const STATUS_OPTIONS = (Object.keys(WORK_ORDER_STATUS_LABEL) as WorkOrderStatus[])
  .map(s => ({ value: s, label: t(WORK_ORDER_STATUS_LABEL[s]) }))

const methodFilter = ref('')
const statusFilter = ref('')

// ─── Rows / table state ────────────────────────────────────────────────────────
const previewMode = ref<'data' | 'empty'>('data')
const rows = computed<SubconReportRow[]>(() => (previewMode.value === 'empty' ? [] : subconReportRows(workOrders)))

const {
  filtered, search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort,
} = useTableState<SubconReportRow>(rows, {
  perPage: 25,
  defaultSort: { key: 'number', dir: 'desc' },
  filterFn: (row, s) => {
    const matchesSearch = !s
      || row.number.toLowerCase().includes(s)
      || row.product.toLowerCase().includes(s)
      || row.vendor.toLowerCase().includes(s)
      || row.bomNumber.toLowerCase().includes(s)
    const matchesMethod = !methodFilter.value || row.methodId === methodFilter.value
    const matchesStatus = !statusFilter.value || row.status === statusFilter.value
    return matchesSearch && matchesMethod && matchesStatus
  },
})

watch([methodFilter, statusFilter], () => setPage(1))

const hasActiveFilter = computed(() => !!search.value || !!methodFilter.value || !!statusFilter.value)
function clearFilters() {
  search.value = ''
  methodFilter.value = ''
  statusFilter.value = ''
}

// ─── Column show/hide ──────────────────────────────────────────────────────────
const columnVisibility = reactive<Record<string, boolean>>(
  Object.fromEntries(columns.map(c => [c.key, true])),
)
const columnItems = columns.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => columns.filter(c => columnVisibility[c.key]))

// ─── Display helpers ───────────────────────────────────────────────────────────
function formatNum(n: number) { return n.toLocaleString('id-ID') }

/** Days past the promised return date, for an order that is still open. */
const CLOSED: WorkOrderStatus[] = ['completed', 'canceled']
function lateDays(row: SubconReportRow): number {
  if (!row.promisedDate || CLOSED.includes(row.status) || row.promisedDate >= TODAY_ISO) return 0
  return Math.round((Date.parse(TODAY_ISO) - Date.parse(row.promisedDate)) / 86_400_000)
}

// ─── Export — the dialog picks scope and columns; the file is real .xlsx ───────
const exportOpen = ref(false)
const exportColumns = SUBCON_EXPORT_COLUMNS.map(c => ({ key: c, label: t(c), required: c === 'WO number' }))
function onExport(payload: { scope: 'all' | 'page' | 'selected'; columns: string[] }) {
  const source = payload.scope === 'page' ? paginated.value : filtered.value
  const picked = SUBCON_EXPORT_COLUMNS.filter(c => payload.columns.includes(c))
  void downloadSubconExport(toSubconExportRows(source), new Date(), picked)
  exportOpen.value = false
}

// ─── First-load skeleton ───────────────────────────────────────────────────────
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 900) })

function viewDetails(row: SubconReportRow) { router.push(`/work-orders/${row.id}`) }

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
        :columns="visibleColumns"
        :rows="(paginated as unknown as Record<string, unknown>[])"
        :total="total"
        :current-page="currentPage"
        :per-page="perPage"
        :sort-key="sortKey"
        :sort-dir="sortDir"
        :loading="loading"
        :has-active-filter="hasActiveFilter"
        :search="search"
        @page-change="setPage"
        @per-page-change="setPerPage"
        @sort="toggleSort"
        @clear-filters="clearFilters"
      >
        <!-- ── Filter bar ── -->
        <template #filters>
          <div class="filter-left">
            <ErpFilterSelect id="sor-method" v-model="methodFilter" :placeholder="t('Method')" :options="METHOD_OPTIONS" />
            <ErpFilterSelect id="sor-status" v-model="statusFilter" :placeholder="t('Status')" :options="STATUS_OPTIONS" width="200px" />
          </div>

          <div class="filter-right">
            <MpButtonGroup class="filter-btn-group">
              <MpTooltip :label="t('Ask Airene')" placement="bottom">
                <MpButton class="filter-airene-btn" variant="ghost" left-icon="airene-brand" :aria-label="t('Ask Airene')" is-rounded @click="toggleAirene?.()" />
              </MpTooltip>
              <ColumnSettingsMenu id="sor-columns" :items="columnItems" :visibility="columnVisibility" />
              <MpTooltip :label="t('Export')" placement="bottom">
                <MpButton variant="ghost" left-icon="download" :aria-label="t('Export')" is-rounded data-devchange="subcon-order-report-export" @click="exportOpen = true" />
              </MpTooltip>
            </MpButtonGroup>

            <div class="filter-search">
              <MpIcon name="search" size="sm" />
              <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')" />
              <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''">
                <MpIcon name="close" size="sm" />
              </button>
            </div>
          </div>
        </template>

        <!-- ── Number — opens the work order ── -->
        <template #cell-number="{ value, row }">
          <span class="cell-link cell-text" @click.stop="viewDetails(row as unknown as SubconReportRow)">{{ value }}</span>
        </template>

        <!-- ── Product — name over the BOM it was built from ── -->
        <template #cell-product="{ value, row }">
          <div class="sc-stack">
            <span class="sc-stack__name">{{ value }}</span>
            <span class="sc-stack__sub">{{ (row as unknown as SubconReportRow).bomNumber }}</span>
          </div>
        </template>

        <!-- ── Method — Basic / Resupply / Dropship ── -->
        <template #cell-methodId="{ value }">
          <SubconMethodChip :method="(value as SubconMethod)" />
        </template>

        <!-- ── Scope ── -->
        <template #cell-scope="{ value }">{{ t(value as string) }}</template>

        <!-- ── Qty ── -->
        <template #cell-plannedQty="{ value, row }">
          {{ formatNum(value as number) }} {{ (row as unknown as SubconReportRow).unit }}
        </template>

        <!-- ── Received — received / ordered, muted until something comes back ── -->
        <template #cell-receivedQty="{ row }">
          <span :class="{ 'sc-muted': (row as unknown as SubconReportRow).receivedQty === 0 }">
            {{ formatNum((row as unknown as SubconReportRow).receivedQty) }} / {{ formatNum((row as unknown as SubconReportRow).plannedQty) }}
          </span>
        </template>

        <!-- ── Promised date — em dash when unset; overdue count when late ── -->
        <template #cell-promisedDate="{ row }">
          <span v-if="!(row as unknown as SubconReportRow).promisedDate" class="sc-muted">—</span>
          <span v-else class="sc-promised">
            {{ formatDate((row as unknown as SubconReportRow).promisedDate) }}
            <span v-if="lateDays(row as unknown as SubconReportRow) > 0" class="sc-late" data-devchange="subcon-order-report-late">
              +{{ lateDays(row as unknown as SubconReportRow) }}d
            </span>
          </span>
        </template>

        <!-- ── Status badge — the work order's own status ── -->
        <template #cell-status="{ value }">
          <ErpStatusBadge :status="(value as string)" :label="t(WORK_ORDER_STATUS_LABEL[value as WorkOrderStatus] ?? (value as string))" />
        </template>

        <!-- ── Actions kebab (sticky right) ── -->
        <template #actions="{ row }">
          <MpPopover :id="`sor-actions-${row.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList>
                <MpPopoverListItem @click="viewDetails(row as unknown as SubconReportRow)">{{ t('View details') }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </template>

        <!-- ── Full empty state (first run) ── -->
        <template #empty>
          <div class="empty-full">
            <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
            <p class="empty-full-title">{{ t('No subcon order') }}</p>
            <p class="empty-full-desc">{{ t('Subcon orders will appear here.') }}</p>
          </div>
        </template>
      </ErpTablePage>
    </div>

    <ExportModal
      :open="exportOpen"
      :title="t('Export subcon orders')"
      entity-label="subcon orders"
      :columns="exportColumns"
      :total="total"
      :show-column-search="false"
      @close="exportOpen = false"
      @export="onExport"
    />

    <ScenarioFab v-model="previewMode" />
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

/* ── Filter bar ─────────────────────────────────────────────────────────── */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-btn-group { display: flex; align-items: center; }
.filter-btn-group :deep(.mp-pixel-button-group) { gap: var(--mp-spacing-2); }
.filter-airene-btn :deep(svg) { color: var(--mp-airene-default, #6938ef); }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: var(--mp-sizes-4\.5, 18px); height: var(--mp-sizes-4\.5, 18px);
  padding: 0; border: none; background: transparent; cursor: pointer;
  color: var(--mp-text-subtle, #75808f);
}
.search-clear-btn:hover { color: var(--mp-text-default); }

/* ── Cells ──────────────────────────────────────────────────────────────── */
.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.sc-muted { color: var(--mp-text-secondary); }

/* Product cell — name over the source BOM */
.sc-stack { display: flex; flex-direction: column; min-width: 0; }
.sc-stack__name { color: var(--mp-text-default); white-space: normal; }
.sc-stack__sub {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm, 16px);
  color: var(--mp-text-secondary);
}

/* Promised date — the overdue count rides beside the date */
.sc-promised { display: inline-flex; align-items: center; gap: var(--mp-spacing-1\.5); }
.sc-late {
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-critical, var(--mp-text-danger, #a8352d));
}

/* ── Full empty state ───────────────────────────────────────────────────── */
.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title {
  margin: 0 0 var(--mp-spacing-0\.5);
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.empty-full-desc {
  margin: 0 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}
</style>
