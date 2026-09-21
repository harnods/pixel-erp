<script setup lang="ts">
/**
 * Batch Traceability Report — Reports › Inventory › Batch traceability
 * (PRD "[PRD] INV - Batch Traceability Report", plan docs/prd/batch-traceability-plan.md).
 *
 * One report, two searches. The pill switch picks the mode — By batch or By transaction
 * — and switching resets every filter, because the two searches can't be combined
 * (PRD story 6). By transaction lives in BatchTraceabilityByTransaction. Both searches
 * keep their filters, search, sort and page in useBatchTraceabilityReportState, so the
 * detail page's breadcrumb returns to the report exactly as it was (story 7).
 *
 * By batch (stories 2, 3) is filter-first, like General ledger: pick Product, Batch number
 * (each has an "All" option) or Warehouse — at least one — then click Filter; a filter left
 * empty means all of it. Nothing lists before that.
 * The bar edits a draft; Filter applies it. The attribute filters (Vendor, Grade, the three
 * dates) were dropped from this search (product decision, 2026-09-21). Rows come straight
 * from `searchBatches()` — this page only maps, searches and exports.
 *
 * Full-bleed (resolved via detailMatch in [...slug].vue), so it draws its own title bar
 * and stage, like DualUnitInventoryReportPage.
 *
 * Deliberate departures from docs/design/RULES.md:
 * - No row [...] actions column (rule/table-actions-column): a report line has nothing to
 *   act on. Rows don't hover either (rule/table-no-hover-no-actions); the batch number
 *   is the link.
 * - Hand-rolled grouped <table>, not ErpTablePage (rule/table-use-erptablepage): rows group
 *   by product the way the Production request table does (ProductionRequestIndexPage) —
 *   a product parent row with the on-hand totals, its batch lines as child rows under an
 *   empty thumbnail lane, pagination by product. ErpTablePage has no parent/child rows.
 *   Widths still come from the column-kind standard (columnWidths.ts).
 * - Order is fixed at Product A–Z then Batch A–Z, as the PRD specifies — grouped rows
 *   don't sort by column (neither does the Production request table).
 * - A Filter button instead of All filters (rule/filter-bar-all-filters-drawer): the
 *   search runs on demand. It's never disabled — clicking it with no filter picked shows an
 *   inline error (rule/btn-no-disabled-validation, rule/form-errors-inline).
 */
import { computed, nextTick, onMounted, reactive, ref, toRef, watch } from 'vue'
import { MpButton, MpButtonGroup, MpIcon, MpSegmentedControl, MpSkeleton, MpTooltip } from '@mekari/pixel3'
import type { TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpPagination from '~/components/patterns/ErpPagination.vue'
import { columnWidth } from '~/components/patterns/columnWidths'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import MultiSelectDropdown from '~/components/patterns/MultiSelectDropdown.vue'
import ExportModal from '~/components/patterns/ExportModal.vue'
import ScenarioFab from '~/components/patterns/ScenarioFab.vue'
import BatchTraceabilityByTransaction from '~/components/patterns/BatchTraceabilityByTransaction.vue'
import {
  searchBatches, traceProductOptions, traceBatchNumberOptions, canViewBatchTraceability, productTraceAttributes,
  type BatchSearchFilter, type BatchSearchRow, type TraceabilityAccess,
} from '~/data/batchTraceability'
import {
  MAX_BATCH_ATTRIBUTES, batchAttributeDef, type BatchAttributeKey,
} from '~/data/batchAttributes'
import { TRACE_ATTRIBUTE_COLUMNS, useTraceabilityCells } from '~/composables/useTraceabilityCells'
import { productIndexRows } from '~/data/productsIndex'
import { warehouses } from '~/data/warehouses'
import { successToast } from '~/utils/toasts'
import { useBatchTraceabilityReportState } from '~/composables/useBatchTraceabilityReportState'
import {
  buildExportDocument, downloadExport, type ExportFilter, type ExportFormat,
} from '~/utils/traceabilityExport'
import { formatDateTime } from '~/utils/date'

const { t } = useLocale()
const router = useRouter()
const { attributeSortValue, attributeText, qtyText, qtyCellText } = useTraceabilityCells()

// ─── Scenario (demo) ────────────────────────────────────────────────────────────
// The two entitlement scenarios preview what a Jurnal company sees (PRD story 1).
const scenario = ref('data')
const scenarios = [
  { label: 'Default', value: 'data' },
  { label: 'Empty state', value: 'empty' },
  { label: 'Without Batch Attribute add-on', value: 'no-batch-attribute' },
  { label: 'Without Dual Unit Inventory', value: 'no-dual-unit' },
  { label: 'Without report access', value: 'no-access' },
]
// Story 1: only Owner, Ultimate and Stockist can open the report. The prototype has
// no signed-in ERP role, so the demo viewer is an Owner unless the scenario says not.
const canView = computed(() => canViewBatchTraceability(scenario.value === 'no-access' ? [] : ['owner']))
const access = computed<TraceabilityAccess>(() => ({
  batchAttribute: scenario.value !== 'no-batch-attribute',
  dualUnit: scenario.value !== 'no-dual-unit',
}))

// ─── Mode & report state ────────────────────────────────────────────────────────
// Filters, search, sort and page live in useBatchTraceabilityReportState so a batch's
// detail page can send the user back to the report exactly as they left it (story 7).
type Mode = 'batch' | 'transaction'
const { state: reportState, setMode: setReportMode, resetBatchSearch } = useBatchTraceabilityReportState()
const mode = computed<Mode>(() => reportState.mode)
const modeOptions = [
  { id: 'bt-mode-batch', label: t('By batch'), value: 'batch' },
  { id: 'bt-mode-transaction', label: t('By transaction'), value: 'transaction' },
]
/** Both searches reset on a mode switch (story 6) — the store does it. */
function setMode(next: string) {
  setReportMode(next as Mode)
}

// ─── Filters ────────────────────────────────────────────────────────────────────
// MultiSelectDropdown works in option strings, so selections are held as names and
// mapped back to ids for the query.
const productOptions = computed(() => traceProductOptions())
const productOptionNames = computed(() => productOptions.value.map((p) => p.name))
const batchNumberOptions = computed(() => traceBatchNumberOptions(draftSkus.value))
const activeWarehouses = computed(() => warehouses.filter((w) => !w.isDefault && w.status === 'active'))
const warehouseOptionNames = computed(() => activeWarehouses.value.map((w) => w.name))

const productNames = toRef(reportState.batch, 'productNames')
const batchNos = toRef(reportState.batch, 'batchNos')
// Empty or every warehouse ticked = All warehouse: one summed line per batch.
const warehouseNames = toRef(reportState.batch, 'warehouseNames')
/** What the last Filter click applied — null until the user has filtered once. */
const applied = toRef(reportState.batch, 'applied')

// Batch numbers follow the products picked; a batch that no longer fits drops out.
const draftSkus = computed(() => {
  const skuByName = new Map(productOptions.value.map((p) => [p.name, p.sku]))
  return productNames.value.map((n) => skuByName.get(n)).filter((s): s is string => !!s)
})
watch(batchNumberOptions, (options) => {
  const kept = batchNos.value.filter((b) => options.includes(b))
  if (kept.length !== batchNos.value.length) batchNos.value = kept
})

/** Filter — apply the bar. Needs at least one filter; one left empty means all of it. */
const filterError = ref('')
const hasDraftFilter = computed(() => productNames.value.length > 0 || batchNos.value.length > 0 || warehouseNames.value.length > 0)
function runFilter() {
  if (!hasDraftFilter.value) {
    filterError.value = t('Select at least one filter, then click Filter.')
    return
  }
  filterError.value = ''
  applied.value = { productNames: [...productNames.value], batchNos: [...batchNos.value], warehouseNames: [...warehouseNames.value] }
  search.value = ''
  currentPage.value = 1
}
watch(hasDraftFilter, (has) => { if (has) filterError.value = '' })

/** The applied selection as a search — "All" (every option ticked) searches everything. */
const query = computed<BatchSearchFilter | null>(() => {
  const a = applied.value
  if (!a) return null
  const skuByName = new Map(productOptions.value.map((p) => [p.name, p.sku]))
  const idByName = new Map(activeWarehouses.value.map((w) => [w.name, w.id]))
  const allWarehouses = a.warehouseNames.length === 0 || a.warehouseNames.length === warehouseOptionNames.value.length
  const allProducts = !a.productNames.length || a.productNames.length === productOptionNames.value.length
  return {
    productSkus: allProducts ? [] : a.productNames.map((n) => skuByName.get(n)).filter((s): s is string => !!s),
    batchNos: a.batchNos,
    warehouseIds: allWarehouses ? 'all' : a.warehouseNames.map((n) => idByName.get(n)).filter((s): s is string => !!s),
  }
})

// ─── Rows ───────────────────────────────────────────────────────────────────────
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

const rows = computed<ReportRow[]>(() => {
  if (scenario.value === 'empty' || !query.value) return []
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
    for (const a of TRACE_ATTRIBUTE_COLUMNS) row[a.column] = attributeSortValue(r.attributes[a.key], a.key)
    return row
  })
})

function matchesSearch(row: ReportRow, s: string): boolean {
  return !s
    || row.productName.toLowerCase().includes(s)
    || row.source.sku.toLowerCase().includes(s)
    || row.batchNo.toLowerCase().includes(s)
}

// ─── Product groups (Production request table structure) ──────────────────────
/** One parent row per product; its batch lines are the child rows. */
interface ProductGroup {
  sku: string
  productName: string
  productImg: string
  /** The product's own attribute set, in its order — fills Attribute 1–3. */
  attributes: BatchAttributeKey[]
  lines: ReportRow[]
}


const groups = computed<ProductGroup[]>(() => {
  const bySku = new Map<string, ProductGroup>()
  for (const row of rows.value) {
    let g = bySku.get(row.source.sku)
    if (!g) {
      g = { sku: row.source.sku, productName: row.productName, productImg: row.productImg, attributes: productTraceAttributes(row.source.sku, access.value), lines: [] }
      bySku.set(row.source.sku, g)
    }
    g.lines.push(row)
  }
  return [...bySku.values()]
})

// Search matches a product (every batch stays) or a batch number (only those batches).
// Pagination counts products, like the Production request table.
const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir,
} = useTableState<ProductGroup>(groups, {
  perPage: 25,
  filterFn: (g, s) => g.lines.some((r) => matchesSearch(r, s)),
})

function visibleLines(g: ProductGroup): ReportRow[] {
  const s = search.value.trim().toLowerCase()
  if (!s || g.productName.toLowerCase().includes(s) || g.sku.toLowerCase().includes(s)) return g.lines
  return g.lines.filter((r) => r.batchNo.toLowerCase().includes(s))
}
const pagedGroups = computed(() => (paginated.value as ProductGroup[]).map((g) => ({ ...g, lines: visibleLines(g) })))
/** Every line the search keeps, product by product — what "All" exports. */
const matchingLines = computed(() => {
  const s = search.value.trim().toLowerCase()
  return groups.value.filter((g) => g.lines.some((r) => matchesSearch(r, s))).flatMap(visibleLines)
})

// ─── Expand / collapse ──────────────────────────────────────────────────────────
// A report is read, so products open expanded; a parent row folds its batches away.
const closedSkus = ref(new Set<string>())
function isOpen(sku: string) { return !closedSkus.value.has(sku) }
function toggleGroup(sku: string) {
  const next = new Set(closedSkus.value)
  if (next.has(sku)) next.delete(sku)
  else next.add(sku)
  closedSkus.value = next
}

// Restore the table as the user left it, then keep the store in step. The page comes
// back a tick later: restoring search / per-page makes useTableState reset it to 1 first.
{
  const saved = { ...reportState.batch.table }
  search.value = saved.search
  sortKey.value = saved.sortKey
  sortDir.value = saved.sortDir
  perPage.value = saved.perPage
  void nextTick(() => { currentPage.value = saved.page })
}
watch([search, sortKey, sortDir, currentPage, perPage], ([s, key, dir, page, size]) => {
  Object.assign(reportState.batch.table, { search: s, sortKey: key, sortDir: dir, page, perPage: size })
})

function resetFilters() {
  resetBatchSearch()
  search.value = ''
}

// ─── Columns ────────────────────────────────────────────────────────────────────
// Each product has its own attribute set, so the table heads the attribute columns
// Attribute 1–3 and names them on the product row. The export stays flat — one column
// per attribute type (allColumns) — since its rows mix products.
const ATTRIBUTE_SLOTS = Array.from({ length: MAX_BATCH_ATTRIBUTES }, (_, i) => i)
const slotKey = (i: number) => `attribute${i + 1}`
const tableColumns = computed<TableColumn[]>(() => [
  { key: 'productName', label: t('Product'), kind: 'name' },
  { key: 'batchNo', label: t('Batch number'), kind: 'number' },
  ...ATTRIBUTE_SLOTS.map((i): TableColumn => ({ key: slotKey(i), label: `${t('Attribute')} ${i + 1}` })),
  { key: 'warehouse', label: t('Warehouse'), kind: 'name' },
  { key: 'onHand', label: t('On hand'), align: 'right' },
  { key: 'onHandSecondary', label: t('On hand (secondary unit)'), align: 'right' },
])
/** The attribute a slot column holds for this product, if it has that many. */
function slotAttribute(g: ProductGroup, column: string): BatchAttributeKey | null {
  const i = ATTRIBUTE_SLOTS.findIndex((n) => slotKey(n) === column)
  return i < 0 ? null : g.attributes[i] ?? null
}
const allColumns = computed<TableColumn[]>(() => [
  { key: 'productName', label: t('Product'), kind: 'name' },
  { key: 'batchNo', label: t('Batch number'), kind: 'number' },
  { key: 'expiryDate', label: t('Expiry date'), kind: 'date' },
  { key: 'manufacturingDate', label: t('Manufacturing date'), kind: 'date' },
  { key: 'bestBeforeDate', label: t('Best before date'), kind: 'date' },
  { key: 'vendor', label: t('Vendor'), kind: 'name' },
  { key: 'grade', label: t('Grade') },
  { key: 'warehouse', label: t('Warehouse'), kind: 'name' },
  { key: 'onHand', label: t('On hand'), align: 'right' },
  { key: 'onHandSecondary', label: t('On hand (secondary unit)'), align: 'right' },
])
const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(tableColumns.value.map((c) => [c.key, true])))
// Product and Batch number share the first column (product on the parent, batch on
// the child), so neither can be hidden.
const columnItems = computed(() => tableColumns.value.map((c, i) => ({ key: c.key, label: c.label, disabled: i < 2 })))
/** colgroup width — the column-kind standard's max (the table is layout-fixed). */
function colWidth(c: TableColumn): string { return columnWidth(c.kind).maxWidth }
const productColWidth = columnWidth('name').maxWidth
/** The value columns after the merged Product / Batch number column. */
const valueColumns = computed(() => tableColumns.value.slice(2).filter((c) => columnVisibility[c.key]))

/** Parent row: each attribute slot's name, and on hand summed per unit. */
function parentCell(g: ProductGroup, column: string): string {
  const slot = slotAttribute(g, column)
  if (slot) return t(batchAttributeDef(slot).label)
  const first = g.lines[0]
  if (!first) return ''
  if (column === 'onHand') return qtyText(g.lines.reduce((sum, r) => sum + r.onHand, 0), first.source.unit)
  if (column === 'onHandSecondary') {
    if (g.lines.every((r) => r.source.onHandSecondary.state === 'na')) return t('NA')
    return qtyText(g.lines.reduce((sum, r) => sum + (r.onHandSecondary ?? 0), 0), first.source.secondaryUnit)
  }
  return ''
}
function parentIsNa(g: ProductGroup, column: string): boolean {
  return column === 'onHandSecondary' && g.lines.every((r) => r.source.onHandSecondary.state === 'na')
}

// ─── Cells (formatting shared with By transaction — useTraceabilityCells) ────────
/** Plain text per column — what the table shows and what the export writes. */
function cellText(row: ReportRow, column: string): string {
  const attribute = TRACE_ATTRIBUTE_COLUMNS.find((a) => a.column === column)
  if (attribute) return attributeText(row.source.attributes[attribute.key], attribute.key)
  if (column === 'onHand') return qtyCellText(row.source.onHandBase, row.source.unit)
  if (column === 'onHandSecondary') return qtyCellText(row.source.onHandSecondary, row.source.secondaryUnit)
  return String(row[column] ?? '')
}

/** A batch row's cell — slot columns resolve to the product's attribute in that slot. */
function childCell(g: ProductGroup, row: ReportRow, column: string): string {
  const slot = slotAttribute(g, column)
  if (slot) return attributeText(row.source.attributes[slot], slot)
  return ATTRIBUTE_SLOTS.some((i) => slotKey(i) === column) ? '' : cellText(row, column)
}
function childIsNa(g: ProductGroup, row: ReportRow, column: string): boolean {
  const slot = slotAttribute(g, column)
  if (slot) return row.source.attributes[slot].state === 'na'
  return isNa(row, column)
}

function isNa(row: ReportRow, column: string): boolean {
  const attribute = TRACE_ATTRIBUTE_COLUMNS.find((a) => a.column === column)
  if (attribute) return row.source.attributes[attribute.key].state === 'na'
  return column === 'onHandSecondary' && row.source.onHandSecondary.state === 'na'
}

/** Opens the batch's traceability detail; a warehouse line highlights that warehouse there. */
function openBatch(row: ReportRow) {
  router.push({
    path: `/inventory-report/batch-traceability/${row.source.sku}/${encodeURIComponent(row.batchNo)}`,
    query: row.source.warehouseId ? { warehouse: row.source.warehouseId } : {},
  })
}

// ─── Loading (first paint) ─────────────────────────────────────────────────────
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 600) })

// ─── Export (story 12) ──────────────────────────────────────────────────────────
// xlsx or csv; the file header lists the filters behind the result (traceabilityExport).
const exportOpen = ref(false)
const exportColumns = computed(() => allColumns.value.map((c, i) => ({ key: c.key, label: c.label, required: i < 2 })))
const EXPORT_FORMATS: ExportFormat[] = ['xlsx', 'csv']

/** The filters behind the current result (the applied ones), as the file header lists them. */
const appliedFilters = computed<ExportFilter[]>(() => {
  const a = applied.value
  const out: ExportFilter[] = []
  if (!a) return out
  const all = (picked: string[], options: string[], label: string) =>
    !picked.length || picked.length === options.length ? label : picked.join(', ')
  out.push({ label: t('Product'), value: all(a.productNames, productOptionNames.value, t('All product')) })
  out.push({ label: t('Batch number'), value: all(a.batchNos, traceBatchNumberOptions(query.value?.productSkus ?? []), t('All batch')) })
  if (query.value?.warehouseIds !== 'all') out.push({ label: t('Warehouse'), value: a.warehouseNames.join(', ') })
  if (search.value.trim()) out.push({ label: t('Search keyword'), value: search.value.trim() })
  return out
})

async function onExport(payload: { scope: 'all' | 'page' | 'selected'; columns: string[]; format?: ExportFormat }) {
  exportOpen.value = false
  const lines = payload.scope === 'page' ? pagedGroups.value.flatMap((g) => g.lines) : matchingLines.value
  const cols = allColumns.value.filter((c) => payload.columns.includes(c.key))
  const doc = buildExportDocument({
    title: `${t('Batch traceability')} — ${t('By batch')}`,
    exportedOn: formatDateTime(new Date().toISOString()),
    filters: appliedFilters.value,
    labels: { exportedOn: t('Exported on'), appliedFilters: t('Applied filters'), noFilters: t('No filters applied') },
    sections: [{ name: t('Batches'), columns: cols.map((c) => c.label), rows: lines.map((r) => cols.map((c) => cellText(r, c.key))) }],
  })
  await downloadExport(doc, 'batch-traceability-by-batch', payload.format ?? 'xlsx')
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
    <!-- ── No access (story 1) — a page state, not a hidden route ── -->
    <div v-if="!canView" class="bt-stage">
      <div class="empty-full bt-no-access">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240">
        <p class="empty-full-title">{{ t("You don't have access to this report") }}</p>
        <p class="empty-full-desc">{{ t('Batch traceability is available to the Owner, Ultimate and Stockist roles. Ask your Owner to give you one of them.') }}</p>
        <MpButton variant="secondary" is-rounded @click="router.push('/inventory-report')">{{ t('Back to reports') }}</MpButton>
      </div>
    </div>

    <div v-else class="bt-stage">
      <MpSegmentedControl
        id="bt-mode" name="bt-mode" class="bt-mode"
        :model-value="mode" :data="modeOptions" @update:model-value="setMode"
      />

      <section v-if="mode === 'batch'" class="bt-section">
        <!-- ── Filter bar ── -->
        <div class="bt-filter-bar">
          <div class="filter-left">
            <MultiSelectDropdown
              id="bt-product" v-model="productNames" :options="productOptionNames" :placeholder="t('Product')"
              :select-all-label="t('All product')" :all-selected-label="t('All product')"
            />
            <MultiSelectDropdown
              id="bt-batch-number" v-model="batchNos" :options="batchNumberOptions" :placeholder="t('Batch number')"
              :select-all-label="t('All batch')" :all-selected-label="t('All batch')"
            />
            <MultiSelectDropdown
              id="bt-warehouse" v-model="warehouseNames" :options="warehouseOptionNames"
              :placeholder="t('All warehouse')" :select-all-label="t('All warehouse')" :all-selected-label="t('All warehouse')"
            />
            <button type="button" class="btn-enterprise btn-enterprise--primary bt-filter-btn" @click="runFilter">{{ t('Filter') }}</button>
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
        </div>

        <p v-if="filterError" class="bt-filter-error" role="alert">
          <MpIcon name="warning-triangle" size="sm" />{{ filterError }}
        </p>

        <!-- ── No batch stock at all ── -->
        <div v-if="scenario === 'empty'" class="empty-full">
          <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240">
          <p class="empty-full-title">{{ t('No batches') }}</p>
          <p class="empty-full-desc">{{ t('Batches with stock will appear here.') }}</p>
          <MpButton variant="secondary" is-rounded @click="router.push('/product-list')">{{ t('View products') }}</MpButton>
        </div>

        <!-- ── Filter first — nothing lists until Filter is clicked ── -->
        <div v-else-if="!applied" class="empty-full">
          <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240">
          <p class="empty-full-title">{{ t('Filter to see batches') }}</p>
          <p class="empty-full-desc">{{ t('Select a product, batch number or warehouse, then click Filter.') }}</p>
        </div>

        <!-- ── Grouped table: product parent rows, batch child rows ── -->
        <template v-else-if="loading || pagedGroups.length">
          <div class="bt-table-wrap">
            <table class="bt-table">
              <colgroup>
                <col style="width: 56px">
                <col :style="{ width: productColWidth }">
                <col v-for="c in valueColumns" :key="c.key" :style="{ width: colWidth(c) }">
              </colgroup>
              <thead>
                <tr>
                  <th class="bt-th" colspan="2">{{ t('Product') }}/{{ t('Batch number') }}</th>
                  <th
                    v-for="c in valueColumns" :key="c.key"
                    class="bt-th" :class="{ 'bt-th--right': c.align === 'right' }"
                  >{{ c.label }}</th>
                </tr>
              </thead>
              <tbody>
                <!-- Loading — 3 solid skeleton rows, one bar per column (ErpTablePage standard) -->
                <template v-if="loading">
                  <tr v-for="n in 3" :key="`sk-${n}`" class="bt-parent bt-parent--skeleton">
                    <td class="bt-td" colspan="2">
                      <MpSkeleton class="bt-skel" height="14px" rounded="sm" duration="0s" width="72px" />
                    </td>
                    <td v-for="c in valueColumns" :key="c.key" class="bt-td" :class="{ 'bt-td--right': c.align === 'right' }">
                      <MpSkeleton class="bt-skel" height="14px" rounded="sm" duration="0s" :width="c.align === 'right' ? '56px' : '72px'" />
                    </td>
                  </tr>
                </template>

                <template v-for="g in pagedGroups" v-else :key="g.sku">
                  <!-- Parent (product) row — the whole product cell folds its batches -->
                  <tr class="bt-parent">
                    <td
                      class="bt-td bt-parent-cell" colspan="2" role="button" tabindex="0"
                      :aria-expanded="isOpen(g.sku)"
                      @click="toggleGroup(g.sku)" @keydown.enter="toggleGroup(g.sku)"
                    >
                      <div class="bt-product">
                        <img class="bt-thumb" :src="g.productImg" :alt="g.productName" loading="lazy" width="40" height="40">
                        <div class="bt-product-body">
                          <div class="bt-product-main">
                            <span class="bt-product-name">{{ g.productName }}</span>
                            <span class="bt-expand" :class="{ 'bt-expand--open': isOpen(g.sku) }" aria-hidden="true">
                              <MpIcon name="chevrons-down" size="sm" />
                            </span>
                          </div>
                          <span class="bt-product-sku">SKU: {{ g.sku }} · {{ g.lines.length }} {{ g.lines.length === 1 ? t('batch') : t('batches') }}</span>
                        </div>
                      </div>
                    </td>
                    <td
                      v-for="c in valueColumns" :key="c.key"
                      class="bt-td"
                      :class="{ 'bt-td--right bt-num': c.align === 'right', 'bt-na': parentIsNa(g, c.key), 'bt-attr-name': !!slotAttribute(g, c.key) }"
                    >{{ parentCell(g, c.key) }}</td>
                  </tr>

                  <!-- Child (batch) rows under an empty thumbnail lane -->
                  <template v-if="isOpen(g.sku)">
                    <tr v-for="(r, ri) in g.lines" :key="r.key" class="bt-child">
                      <td v-if="ri === 0" class="bt-td bt-child-lane" :rowspan="g.lines.length" />
                      <td class="bt-td bt-child-td">
                        <span
                          class="cell-link" role="button" tabindex="0"
                          @click.stop="openBatch(r)" @keydown.enter="openBatch(r)"
                        >{{ r.batchNo }}</span>
                      </td>
                      <td
                        v-for="c in valueColumns" :key="c.key"
                        class="bt-td bt-child-td" :class="{ 'bt-td--right bt-num': c.align === 'right', 'bt-na': childIsNa(g, r, c.key) }"
                      >{{ childCell(g, r, c.key) }}</td>
                    </tr>
                  </template>
                </template>
              </tbody>
            </table>
          </div>

          <ErpPagination
            v-if="!loading"
            :current-page="currentPage" :per-page="perPage" :total="total"
            @page-change="setPage" @per-page-change="setPerPage"
          />
        </template>

        <!-- ── Filtered empty — the filter or search found no batch ── -->
        <div v-else class="empty-full">
          <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240">
          <p class="empty-full-title">{{ search.trim() ? `"${search.trim()}" ${t('not found')}` : t('No batches match your filters') }}</p>
          <p class="empty-full-desc">{{ search.trim() ? t('Recheck the keywords you have typed and try searching again.') : t('Recheck the filters you have applied and try filtering again.') }}</p>
          <a class="empty-clear" @click="resetFilters">{{ t('Clear all filters') }}</a>
        </div>

      </section>

      <!-- ── By transaction (stories 4, 5) ── -->
      <BatchTraceabilityByTransaction v-else :access="access" :empty="scenario === 'empty'" />
    </div>

    <ExportModal
      :open="exportOpen"
      :formats="EXPORT_FORMATS"
      :title="t('Export batches')"
      :entity-label="t('batches')"
      :columns="exportColumns"
      :total="matchingLines.length"
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

/* Filter — primary pill, applies the bar (btn-enterprise--primary from erp.css). */
.bt-filter-btn { white-space: nowrap; }
.bt-filter-error {
  display: flex; align-items: center; gap: var(--mp-spacing-1);
  margin: calc(-1 * var(--mp-spacing-3)) 0 var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-critical, #d93b3b);
}

/* ── By batch: filter bar above the grouped table ── */
.bt-section { display: flex; flex-direction: column; min-width: 0; }
.bt-filter-bar {
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3);
  margin-bottom: var(--mp-spacing-5);
}

/* ── Grouped table (Production request structure — ProductionRequestIndexPage) ── */
.bt-table-wrap { overflow-x: auto; }
/* max-content keeps the fixed column widths stable as groups fold and unfold. */
.bt-table { width: 100%; min-width: max-content; border-collapse: collapse; table-layout: fixed; }
.bt-th {
  position: sticky; top: 0; z-index: 2;
  height: var(--mp-sizes-7, 28px);
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; color: var(--mp-text-default); text-align: left; white-space: nowrap;
}
.bt-th--right { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.bt-td {
  height: var(--mp-sizes-10, 40px);
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-4) var(--mp-spacing-2\.5) var(--mp-spacing-2);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  vertical-align: middle; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  background: inherit;
}
.bt-td--right { text-align: right; padding: var(--mp-spacing-2\.5) var(--mp-spacing-2) var(--mp-spacing-2\.5) var(--mp-spacing-4); }
/* Merged (colspan / rowspan) cells → vertical separators on every column. */
.bt-th, .bt-td { border-right: 1px solid var(--mp-border-default, #e3e7e9); }
.bt-th:last-child, .bt-td:last-child { border-right: none; }

.bt-parent--skeleton .bt-td { background: var(--mp-background-neutral, #ffffff); }
.bt-skel {
  display: inline-block; vertical-align: middle;
  background-image: none !important; background-color: var(--mp-border-default, #e3e7e9) !important; animation: none !important;
}

/* Parent (product) row — the product cell folds the group */
.bt-parent { background: var(--mp-background-neutral, #ffffff); }
.bt-parent:hover .bt-td { background: var(--mp-background-neutral-hovered, #eef0f3); }
.bt-parent-cell { white-space: normal; cursor: pointer; }
.bt-parent-cell:hover .bt-product-name { color: var(--mp-text-selected); }
.bt-parent-cell:hover .bt-expand { color: var(--mp-text-default); }
.bt-product { display: flex; align-items: center; gap: var(--mp-spacing-3); min-width: 0; }
.bt-thumb {
  width: var(--mp-sizes-10, 40px); height: var(--mp-sizes-10, 40px);
  border-radius: var(--mp-radii-md); flex-shrink: 0; object-fit: cover;
  background: var(--mp-background-neutral, #ffffff); border: 1px solid var(--mp-border-subtle, #e5e7e7);
}
.bt-product-body { flex: 1; display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: 0; }
.bt-product-main { display: flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; }
.bt-product-name {
  flex: 1; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-medium); color: var(--mp-text-default);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.bt-product-sku { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }
.bt-expand {
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
  width: var(--mp-sizes-6, 24px); height: var(--mp-sizes-6, 24px);
  border-radius: var(--mp-radii-sm); color: var(--mp-text-secondary);
  transition: transform 120ms ease;
}
.bt-expand--open { transform: rotate(180deg); }

/* Attribute name on the product row — labels the slot for this product's batches */
.bt-attr-name { font-weight: var(--mp-font-weights-semi-bold); }

/* Child (batch) rows */
.bt-child > .bt-child-td { background: var(--mp-background-neutral, #ffffff); }
.bt-child:hover > .bt-child-td { background: var(--mp-background-neutral-hovered, #eef0f3); }
.bt-child-lane { background: var(--mp-background-neutral, #ffffff); }

/* ── Cells ── */
.bt-num { font-variant-numeric: tabular-nums; white-space: nowrap; }
.bt-na { color: var(--mp-colors-text-secondary, #626b79); }

/* ── Empty states ── */
.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-colors-text-default, #232933);
}
.bt-no-access { padding: var(--mp-spacing-10, 40px) 0; text-align: center; }
.empty-clear { color: var(--mp-text-link); cursor: pointer; font-size: var(--mp-font-sizes-md); }
.empty-clear:hover { text-decoration: underline; text-underline-offset: 2px; }
.empty-full-desc {
  margin-top: var(--mp-spacing-0\.5); margin-bottom: var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-secondary, #626b79);
}
</style>
