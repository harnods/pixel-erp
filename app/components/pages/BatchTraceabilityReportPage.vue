<script setup lang="ts">
/**
 * Batch Traceability Report — Reports › Inventory › Batch traceability
 * (PRD "[PRD] INV - Batch Traceability Report", plan docs/prd/batch-traceability-plan.md).
 *
 * One report, two searches. The pill switch picks the mode — By batch or By transaction
 * — and switching resets every filter, because the two searches can't be combined
 * (PRD story 6). Phase 1 builds By batch; By transaction arrives in Phase 2.
 *
 * By batch (stories 2, 3): Product, Batch number and Warehouse sit in the filter bar; the
 * attribute filters (Vendor, Grade, the three dates) live behind All filters. Rows come
 * straight from `searchBatches()` — this page only maps, searches, sorts and exports.
 *
 * Full-bleed (resolved via detailMatch in [...slug].vue), so it draws its own title bar
 * and stage, like DualUnitInventoryReportPage.
 *
 * Deliberate departures from docs/design/RULES.md:
 * - No row [...] actions column (rule/table-actions-column): a report line has nothing to
 *   act on. Rows don't hover either (rule/table-no-hover-no-actions); the batch number
 *   is the link.
 * - Default order is Product A–Z then Batch A–Z, as the PRD specifies — the table keeps
 *   the data layer's order until the user sorts a column.
 * - A greyed-out filter for a missing add-on (PRD story 1) — not a disabled button for
 *   validation (rule/btn-no-disabled-validation), but an entitlement the user can't lift.
 * - Until the detail page ships (Phase 3), the batch number opens the product's existing
 *   Batch details page.
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { MpButton, MpButtonGroup, MpIcon, MpSegmentedControl, MpTooltip } from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import MultiSelectDropdown from '~/components/patterns/MultiSelectDropdown.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import ExportModal from '~/components/patterns/ExportModal.vue'
import ScenarioFab from '~/components/patterns/ScenarioFab.vue'
import BatchTraceabilityFiltersDrawer, {
  emptyBatchAttributeFilters, countBatchAttributeFilters, type BatchAttributeFiltersValue,
} from '~/components/patterns/BatchTraceabilityFiltersDrawer.vue'
import {
  searchBatches, traceProductOptions, traceBatchNumberOptions,
  type AttributeCell, type BatchSearchFilter, type BatchSearchRow, type TraceabilityAccess,
} from '~/data/batchTraceability'
import { formatExpiry, expiryEffectiveDate, type BatchAttributeKey } from '~/data/batchAttributes'
import { productIndexRows } from '~/data/productsIndex'
import { warehouses } from '~/data/warehouses'
import { vendors } from '~/data/vendors'
import { gradeById } from '~/data/grades'
import { formatDate } from '~/utils/date'
import { successToast } from '~/utils/toasts'

const { t } = useLocale()
const router = useRouter()

// ─── Scenario (demo) ────────────────────────────────────────────────────────────
// The two entitlement scenarios preview what a Jurnal company sees (PRD story 1).
const scenario = ref('data')
const scenarios = [
  { label: 'Default', value: 'data' },
  { label: 'Empty state', value: 'empty' },
  { label: 'Without Batch Attribute add-on', value: 'no-batch-attribute' },
  { label: 'Without Dual Unit Inventory', value: 'no-dual-unit' },
]
const access = computed<TraceabilityAccess>(() => ({
  batchAttribute: scenario.value !== 'no-batch-attribute',
  dualUnit: scenario.value !== 'no-dual-unit',
}))

// ─── Mode ───────────────────────────────────────────────────────────────────────
type Mode = 'batch' | 'transaction'
const mode = ref<Mode>('batch')
const modeOptions = [
  { id: 'bt-mode-batch', label: t('By batch'), value: 'batch' },
  { id: 'bt-mode-transaction', label: t('By transaction'), value: 'transaction' },
]
function setMode(next: string) {
  if (next === mode.value) return
  mode.value = next as Mode
  resetFilters()
}

// ─── Filters ────────────────────────────────────────────────────────────────────
// MultiSelectDropdown works in option strings, so selections are held as names and
// mapped back to ids for the query.
const productOptions = computed(() => traceProductOptions())
const productOptionNames = computed(() => productOptions.value.map((p) => p.name))
const batchNumberOptions = computed(() => traceBatchNumberOptions())
const activeWarehouses = computed(() => warehouses.filter((w) => !w.isDefault && w.status === 'active'))
const warehouseOptionNames = computed(() => activeWarehouses.value.map((w) => w.name))

const productNames = ref<string[]>([])
const batchNos = ref<string[]>([])
// Empty or every warehouse ticked = All warehouse: one summed line per batch.
const warehouseNames = ref<string[]>([])
const attributeFilters = reactive<BatchAttributeFiltersValue>(emptyBatchAttributeFilters())
const filtersOpen = ref(false)
const drawerFilterCount = computed(() => countBatchAttributeFilters(attributeFilters, access.value))

function applyAttributeFilters(v: BatchAttributeFiltersValue) { Object.assign(attributeFilters, v) }

const query = computed<BatchSearchFilter>(() => {
  const skuByName = new Map(productOptions.value.map((p) => [p.name, p.sku]))
  const idByName = new Map(activeWarehouses.value.map((w) => [w.name, w.id]))
  const allWarehouses = warehouseNames.value.length === 0 || warehouseNames.value.length === warehouseOptionNames.value.length
  return {
    productSkus: productNames.value.map((n) => skuByName.get(n)).filter((s): s is string => !!s),
    batchNos: batchNos.value,
    warehouseIds: allWarehouses ? 'all' : warehouseNames.value.map((n) => idByName.get(n)).filter((s): s is string => !!s),
    vendorIds: attributeFilters.vendorIds,
    gradeIds: attributeFilters.gradeIds,
    expiry: attributeFilters.expiry ?? undefined,
    manufacturing: attributeFilters.manufacturing ?? undefined,
    bestBefore: attributeFilters.bestBefore ?? undefined,
  }
})

const hasBarFilter = computed(() => productNames.value.length > 0 || batchNos.value.length > 0 || warehouseNames.value.length > 0)

// ─── Rows ───────────────────────────────────────────────────────────────────────
/** Attribute columns, in the PRD's order. */
const ATTRIBUTE_COLUMNS: { column: string; key: BatchAttributeKey; label: string }[] = [
  { column: 'expiryDate', key: 'expiry_date', label: 'Expiry date' },
  { column: 'manufacturingDate', key: 'manufacturing_date', label: 'Manufacturing date' },
  { column: 'bestBeforeDate', key: 'best_before_date', label: 'Best before date' },
  { column: 'vendor', key: 'supplier', label: 'Vendor' },
  { column: 'grade', key: 'grade', label: 'Grade' },
]

/** A flat row: sortable plain values per column, with the source line kept for cells. */
interface ReportRow extends Record<string, unknown> {
  key: string
  source: BatchSearchRow
  productName: string
  productImg: string
  batchNo: string
  expiryDate: string
  manufacturingDate: string
  bestBeforeDate: string
  vendor: string
  grade: string
  warehouse: string
  onHand: number
  onHandSecondary: number | null
}

const imageBySku = computed(() => new Map(productIndexRows().map((r) => [r.sku, r.img])))

function vendorName(id: string): string { return vendors.find((v) => v.id === id)?.name ?? id }
function gradeName(id: string): string { return gradeById(id)?.name ?? id }

/** What a date / name column sorts on — ISO for dates, the display name otherwise. */
function sortValue(cell: AttributeCell, key: BatchAttributeKey): string {
  if (cell.state !== 'value') return ''
  if (key === 'expiry_date') return expiryEffectiveDate(cell.value)
  if (key === 'supplier') return vendorName(cell.value)
  if (key === 'grade') return gradeName(cell.value)
  return cell.value
}

const rows = computed<ReportRow[]>(() => {
  if (scenario.value === 'empty') return []
  return searchBatches(query.value, access.value).map((r) => {
    const row: ReportRow = {
      key: r.key,
      source: r,
      productName: r.productName,
      productImg: imageBySku.value.get(r.sku) ?? '',
      batchNo: r.batchNo,
      expiryDate: '',
      manufacturingDate: '',
      bestBeforeDate: '',
      vendor: '',
      grade: '',
      warehouse: r.warehouseId ? activeWarehouses.value.find((w) => w.id === r.warehouseId)?.name ?? r.warehouseId : t('All warehouse'),
      onHand: r.onHandBase.state === 'value' ? r.onHandBase.value : 0,
      onHandSecondary: r.onHandSecondary.state === 'value' ? r.onHandSecondary.value : null,
    }
    for (const a of ATTRIBUTE_COLUMNS) row[a.column] = sortValue(r.attributes[a.key], a.key)
    return row
  })
})

function matchesSearch(row: ReportRow, s: string): boolean {
  return !s
    || row.productName.toLowerCase().includes(s)
    || row.source.sku.toLowerCase().includes(s)
    || row.batchNo.toLowerCase().includes(s)
}

const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<ReportRow>(rows, { perPage: 25, filterFn: (row, s) => matchesSearch(row, s) })

function resetFilters() {
  productNames.value = []
  batchNos.value = []
  warehouseNames.value = []
  Object.assign(attributeFilters, emptyBatchAttributeFilters())
  search.value = ''
}

// ─── Columns ────────────────────────────────────────────────────────────────────
const allColumns = computed<TableColumn[]>(() => [
  { key: 'productName', label: t('Product'), kind: 'name', sortable: true, sortType: 'text' },
  { key: 'batchNo', label: t('Batch number'), kind: 'number', sortable: true, sortType: 'text' },
  { key: 'expiryDate', label: t('Expiry date'), kind: 'date', sortable: true, sortType: 'date' },
  { key: 'manufacturingDate', label: t('Manufacturing date'), kind: 'date', sortable: true, sortType: 'date' },
  { key: 'bestBeforeDate', label: t('Best before date'), kind: 'date', sortable: true, sortType: 'date' },
  { key: 'vendor', label: t('Vendor'), kind: 'name', sortable: true, sortType: 'text' },
  { key: 'grade', label: t('Grade'), sortable: true, sortType: 'text' },
  { key: 'warehouse', label: t('Warehouse'), kind: 'name', sortable: true, sortType: 'text' },
  { key: 'onHand', label: t('On hand'), align: 'right', sortable: true, sortType: 'number' },
  { key: 'onHandSecondary', label: t('On hand (secondary unit)'), align: 'right', sortable: true, sortType: 'number' },
])
const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(allColumns.value.map((c) => [c.key, true])))
const columnItems = computed(() => allColumns.value.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 })))
const visibleColumns = computed(() => allColumns.value.filter((c) => columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }

// ─── Cells ──────────────────────────────────────────────────────────────────────
const qtyFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 })

/** An attribute cell as shown: "NA" when not used / no access, blank when used but
 *  empty, otherwise the formatted value (PRD story 3). */
function attributeText(cell: AttributeCell, key: BatchAttributeKey): string {
  if (cell.state === 'na') return t('NA')
  if (cell.state === 'empty') return ''
  switch (key) {
    case 'expiry_date': return formatExpiry(cell.value, 'table')
    case 'manufacturing_date':
    case 'best_before_date': return formatDate(cell.value)
    case 'supplier': return vendorName(cell.value)
    case 'grade': return gradeName(cell.value)
  }
}

function onHandText(row: ReportRow): string {
  const cell = row.source.onHandBase
  return cell.state === 'value' ? `${qtyFormat.format(cell.value)} ${row.source.unit}` : ''
}
function secondaryText(row: ReportRow): string {
  const cell = row.source.onHandSecondary
  if (cell.state === 'na') return t('NA')
  return cell.state === 'value' ? `${qtyFormat.format(cell.value)} ${row.source.secondaryUnit ?? ''}` : ''
}

/** Plain text per column — what the table shows and what the export writes. */
function cellText(row: ReportRow, column: string): string {
  const attribute = ATTRIBUTE_COLUMNS.find((a) => a.column === column)
  if (attribute) return attributeText(row.source.attributes[attribute.key], attribute.key)
  if (column === 'onHand') return onHandText(row)
  if (column === 'onHandSecondary') return secondaryText(row)
  return String(row[column] ?? '')
}

function isNa(row: ReportRow, column: string): boolean {
  const attribute = ATTRIBUTE_COLUMNS.find((a) => a.column === column)
  if (attribute) return row.source.attributes[attribute.key].state === 'na'
  return column === 'onHandSecondary' && row.source.onHandSecondary.state === 'na'
}

const asRow = (row: unknown) => row as ReportRow

function openBatch(row: ReportRow) {
  // Phase 3 replaces this with the Batch traceability detail page.
  router.push(`/product-list/${row.source.sku}/batches/${encodeURIComponent(row.batchNo)}`)
}

// ─── Loading (first paint) ─────────────────────────────────────────────────────
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 600) })

// ─── Export ─────────────────────────────────────────────────────────────────────
const exportOpen = ref(false)
const exportColumns = computed(() => allColumns.value.map((c, i) => ({ key: c.key, label: c.label, required: i < 2 })))

function csvEscape(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function onExport(payload: { scope: 'all' | 'page' | 'selected'; columns: string[] }) {
  exportOpen.value = false
  const s = search.value.trim().toLowerCase()
  const lines = payload.scope === 'page' ? (paginated.value as ReportRow[]) : rows.value.filter((r) => matchesSearch(r, s))
  const cols = allColumns.value.filter((c) => payload.columns.includes(c.key))
  const csv = [
    cols.map((c) => csvEscape(c.label)).join(','),
    ...lines.map((r) => cols.map((c) => csvEscape(cellText(r, c.key))).join(',')),
  ].join('\r\n')
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'batch-traceability-by-batch.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  successToast(t('Batches exported'))
}

const emptyIllustration = '/illustrations/empty-folder.png'
</script>

<template>
  <div class="bt-page">
    <!-- ── Title bar (full-bleed report) ── -->
    <header class="bt-titlebar">
      <div class="bt-titlebar-left">
        <MpButton variant="textLink" is-rounded class="bt-breadcrumb" @click="router.push('/inventory-report')">{{ t('Reports') }}</MpButton>
        <h1 class="bt-title">{{ t('Batch traceability') }}</h1>
      </div>
    </header>

    <!-- ── Stage ── -->
    <div class="bt-stage">
      <MpSegmentedControl
        id="bt-mode" name="bt-mode" class="bt-mode"
        :model-value="mode" :data="modeOptions" @update:model-value="setMode"
      />

      <ErpTablePage
        v-if="mode === 'batch'"
        :columns="visibleColumns"
        :rows="(paginated as unknown as Record<string, unknown>[])"
        :total="total"
        :current-page="currentPage"
        :per-page="perPage"
        :sort-key="sortKey"
        :sort-dir="sortDir"
        :loading="loading"
        :search="search"
        :has-active-search="!!search.trim()"
        :has-active-filter="hasBarFilter || drawerFilterCount > 0 || !!search.trim()"
        filter-empty-label="batches"
        no-row-hover
        @page-change="setPage"
        @per-page-change="setPerPage"
        @sort="toggleSort"
        @sort-change="setSort"
        @hide-column="hideColumn"
        @clear-filters="resetFilters"
      >
        <!-- ── Filter bar ── -->
        <template #filters>
          <div class="filter-left">
            <MultiSelectDropdown id="bt-product" v-model="productNames" :options="productOptionNames" :placeholder="t('Product')" />
            <MultiSelectDropdown id="bt-batch-number" v-model="batchNos" :options="batchNumberOptions" :placeholder="t('Batch number')" />
            <MultiSelectDropdown
              id="bt-warehouse" v-model="warehouseNames" :options="warehouseOptionNames"
              :placeholder="t('All warehouse')" :select-all-label="t('All warehouse')" :all-selected-label="t('All warehouse')"
            />
            <MpButton is-rounded class="bt-all-filters" :class="{ 'bt-all-filters--active': drawerFilterCount > 0 }" @click="filtersOpen = true">
              <MpIcon name="filter" size="sm" />
              {{ t('All filters') }}{{ drawerFilterCount > 0 ? ` (${drawerFilterCount})` : '' }}
            </MpButton>
          </div>

          <div class="filter-right">
            <!-- rule/filter-bar-icon-group: ghost icon tools in one group, each tooltipped. -->
            <MpButtonGroup class="filter-btn-group">
              <ColumnSettingsMenu id="bt-columns" :items="columnItems" :visibility="columnVisibility" :tooltip="t('Column settings')" />
              <MpTooltip id="tt-bt-export" :label="t('Export')" placement="bottom" use-portal>
                <MpButton
                  variant="ghost" is-rounded class="filter-icon-btn"
                  left-icon="download" :aria-label="t('Export')" @click="exportOpen = true"
                />
              </MpTooltip>
            </MpButtonGroup>

            <div class="filter-search">
              <MpIcon name="search" size="sm" />
              <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search product or batch')">
              <MpButton
                v-if="search" variant="ghost" class="filter-search-clear"
                left-icon="close" :aria-label="t('Clear search')" @click="search = ''"
              />
            </div>
          </div>
        </template>

        <!-- ── Cells ── -->
        <template #cell-productName="{ row }">
          <ProductCell :name="asRow(row).productName" :desc="asRow(row).source.sku" :image="asRow(row).productImg" />
        </template>

        <template #cell-batchNo="{ row }">
          <span
            class="cell-link" role="button" tabindex="0"
            @click.stop="openBatch(asRow(row))" @keydown.enter="openBatch(asRow(row))"
          >{{ asRow(row).batchNo }}</span>
        </template>

        <template v-for="a in ATTRIBUTE_COLUMNS" :key="a.column" #[`cell-${a.column}`]="{ row }">
          <span :class="{ 'bt-na': isNa(asRow(row), a.column) }">{{ cellText(asRow(row), a.column) }}</span>
        </template>

        <template #cell-onHand="{ row }">
          <span class="bt-num">{{ cellText(asRow(row), 'onHand') }}</span>
        </template>

        <template #cell-onHandSecondary="{ row }">
          <span class="bt-num" :class="{ 'bt-na': isNa(asRow(row), 'onHandSecondary') }">{{ cellText(asRow(row), 'onHandSecondary') }}</span>
        </template>

        <!-- ── Empty state (no batch stock at all) ── -->
        <template #empty>
          <div class="empty-full">
            <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240">
            <p class="empty-full-title">{{ t('No batches') }}</p>
            <p class="empty-full-desc">{{ t('Batches with stock will appear here.') }}</p>
            <MpButton variant="secondary" is-rounded @click="router.push('/product-list')">{{ t('View products') }}</MpButton>
          </div>
        </template>
      </ErpTablePage>

      <!-- ── By transaction — Phase 2 ── -->
      <div v-else class="empty-full bt-coming-soon">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240">
        <p class="empty-full-title">{{ t('Search by transaction') }}</p>
        <p class="empty-full-desc">{{ t('Coming soon') }}</p>
      </div>
    </div>

    <BatchTraceabilityFiltersDrawer
      id="bt-filters"
      v-model:is-open="filtersOpen"
      :model-value="attributeFilters"
      :access="access"
      @apply="applyAttributeFilters"
    />

    <ExportModal
      :open="exportOpen"
      :title="t('Export batches')"
      :entity-label="t('batches')"
      :columns="exportColumns"
      :total="total"
      @close="exportOpen = false"
      @export="onExport"
    />

    <ScenarioFab v-model="scenario" :scenarios="scenarios" />
  </div>
</template>

<style scoped>
.bt-page { display: flex; flex-direction: column; height: 100%; min-height: 0; }

/* ── Title bar (page-title-bar: 72px, neutral-subtle) ── */
.bt-titlebar {
  height: var(--mp-sizes-18, 72px); flex-shrink: 0;
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 var(--mp-spacing-6);
}
.bt-titlebar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.bt-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm, 16px); color: var(--mp-text-link);
}
.bt-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.bt-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}

/* ── Stage ── */
.bt-stage {
  flex: 1; min-height: 0; overflow-y: auto;
  background: var(--mp-background-stage, #fff);
  border-top-left-radius: var(--mp-radii-lg, 12px);
  padding: var(--mp-spacing-6);
  display: flex; flex-direction: column; gap: var(--mp-spacing-5);
}
.bt-mode { align-self: flex-start; width: 320px; }

/* ── Filter bar ── */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); flex-wrap: wrap; }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); margin-left: auto; }
.filter-btn-group { display: flex; align-items: center; }
.filter-icon-btn {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important;
  min-width: 0 !important; padding: var(--mp-spacing-2) !important;
  color: var(--mp-colors-text-default, #232933);
}
.filter-search-input {
  flex: 1; min-width: 0; border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md);
  color: var(--mp-colors-text-default, #232933);
}
.filter-search-clear {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-5, 20px) !important; height: var(--mp-sizes-5, 20px) !important;
  min-width: 0 !important; padding: 0 !important;
}

/* All filters — secondary look; the (N) is the active signal, never a brand colour
   (rule/filter-all-filters-active-count). */
.bt-all-filters {
  display: inline-flex !important; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3) !important;
  background: var(--mp-background-neutral, #ffffff) !important;
  border: 1px solid var(--mp-colors-border-bold, #8c9596) !important;
  border-radius: var(--mp-radii-full, 999px) !important;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md); color: var(--mp-colors-text-default, #232933);
  white-space: nowrap; cursor: pointer;
}
.bt-all-filters:hover { background: var(--mp-background-neutral-hovered, #eef0f3) !important; }
.bt-all-filters--active { background: var(--mp-background-neutral-subtle, #f8f9f9) !important; }

/* ── Cells ── */
.bt-num { font-variant-numeric: tabular-nums; white-space: nowrap; }
.bt-na { color: var(--mp-colors-text-secondary, #626b79); }

/* ── Empty states ── */
.empty-full { display: flex; flex-direction: column; align-items: center; }
.bt-coming-soon { padding: var(--mp-spacing-10, 40px) 0; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-colors-text-default, #232933);
}
.empty-full-desc {
  margin-top: var(--mp-spacing-0\.5); margin-bottom: var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-secondary, #626b79);
}
</style>
