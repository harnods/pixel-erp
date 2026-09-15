<script setup lang="ts">
/**
 * Batch Traceability Report — the By transaction search (PRD stories 4, 5; plan Phase 2).
 *
 * Two stacked results:
 *  1. Transactions matching the filters, one line per transaction, newest first. Lines
 *     are ticked to pick them.
 *  2. Batches in the selected transactions, one line per transaction + product + batch,
 *     carrying the attribute values RECORDED on that transaction and its signed mutation.
 *
 * Selection is kept here, keyed by transaction number, not by ErpTablePage: its own
 * checkboxes track row positions on the current page and clear whenever the rows
 * change. The PRD needs the opposite — the selection survives paging, "select all"
 * picks every transaction in the filter result (not just this page), and it resets only
 * when a filter or the search changes. So the checkbox is drawn in the first cell and
 * the select-all in that column's header slot (rule/table-checkbox-first-cell).
 *
 * Filters, search, sort, page and the selection live in useBatchTraceabilityReportState,
 * so a batch's detail page can send the user back here exactly as they left it
 * (story 7); switching modes resets that state (story 6).
 *
 * Deliberate departures from docs/design/RULES.md:
 * - No row [...] actions and no row hover on either table (a report line has nothing to
 *   act on) — rule/table-actions-column, rule/table-no-hover-no-actions.
 * - The batches table keeps the PRD's Product A–Z, Batch A–Z order instead of
 *   rule/table-default-newest-first; its date column is named `transactionDate` so
 *   useTableState doesn't re-sort it newest first.
 * - Empty states have no CTA (rule/empty-state-structure): a report has nothing to
 *   create, and the selection hint IS the next action.
 * - Transaction numbers are plain text for now: the seeded report transactions aren't
 *   records in the Sales/Purchase/Inventory modules, so a link would open "not found".
 */
import { computed, nextTick, onMounted, ref, toRef, watch } from 'vue'
import { MpButton, MpButtonGroup, MpCheckbox, MpIcon, MpTooltip } from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import MultiSelectDropdown from '~/components/patterns/MultiSelectDropdown.vue'
import DateConditionField from '~/components/patterns/DateConditionField.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import ExportModal from '~/components/patterns/ExportModal.vue'
import BatchTransactionFiltersDrawer, {
  countTransactionDrawerFilters, type TransactionDrawerFiltersValue,
} from '~/components/patterns/BatchTransactionFiltersDrawer.vue'
import {
  TRACE_TX_TYPES, searchTransactions, batchesInTransactions,
  type DateCondition, type TraceTxType, type TraceabilityAccess,
  type TransactionRow, type TransactionBatchRow, type TransactionSearchFilter,
} from '~/data/batchTraceability'
import { TRACE_ATTRIBUTE_COLUMNS, useTraceabilityCells } from '~/composables/useTraceabilityCells'
import { productIndexRows } from '~/data/productsIndex'
import { warehouses } from '~/data/warehouses'
import { formatDate, formatDateTime } from '~/utils/date'
import { customerName } from '~/data/customers'
import {
  buildExportDocument, describeDateCondition, downloadExport,
  type ExportFilter, type ExportFormat, type ExportSection,
} from '~/utils/traceabilityExport'
import { successToast } from '~/utils/toasts'
import { useBatchTraceabilityReportState } from '~/composables/useBatchTraceabilityReportState'

const props = defineProps<{
  access: TraceabilityAccess
  /** The Empty state demo scenario — no transactions at all. */
  empty: boolean
}>()

const { t } = useLocale()
const router = useRouter()
const { attributeSortValue, attributeText, mutationText, vendorName } = useTraceabilityCells()

const activeWarehouses = computed(() => warehouses.filter((w) => !w.isDefault && w.status === 'active'))
function warehouseName(id: string | null): string {
  return id ? warehouses.find((w) => w.id === id)?.name ?? id : ''
}

// ─── Filters ────────────────────────────────────────────────────────────────────
// Transaction type sits in the bar as translated labels; mapped back to the type key.
const typeByLabel = computed(() => new Map(TRACE_TX_TYPES.map((type) => [t(type), type])))
const typeOptions = computed(() => [...typeByLabel.value.keys()])
const { state: reportState, resetTransactionSearch } = useBatchTraceabilityReportState()
const typeLabels = toRef(reportState.transaction, 'typeLabels')
const dateCondition = toRef(reportState.transaction, 'dateCondition')
const drawerFilters = toRef(reportState.transaction, 'drawerFilters')
const filtersOpen = ref(false)
const drawerFilterCount = computed(() => countTransactionDrawerFilters(drawerFilters.value))

function applyDrawerFilters(v: TransactionDrawerFiltersValue) { drawerFilters.value = v }

/** None ticked = no constraint; every active warehouse ticked = All warehouse. */
function warehouseQuery(ids: string[]): 'all' | string[] | undefined {
  if (!ids.length) return undefined
  return ids.length === activeWarehouses.value.length ? 'all' : ids
}

const query = computed<TransactionSearchFilter>(() => ({
  types: typeLabels.value.map((label) => typeByLabel.value.get(label)).filter((type): type is TraceTxType => !!type),
  numbers: drawerFilters.value.numbers,
  customerIds: drawerFilters.value.customerIds,
  vendorIds: drawerFilters.value.vendorIds,
  date: dateCondition.value ?? undefined,
  originWarehouseIds: warehouseQuery(drawerFilters.value.originWarehouseIds),
  destinationWarehouseIds: warehouseQuery(drawerFilters.value.destinationWarehouseIds),
}))

// ─── Transactions table ─────────────────────────────────────────────────────────
interface TxRow extends Record<string, unknown> {
  source: TransactionRow
  /** Named `date` on purpose: useTableState's default newest-first applies (PRD story 5). */
  date: string
  number: string
  type: string
  originWarehouse: string
  destinationWarehouse: string
}

const txRows = computed<TxRow[]>(() => {
  if (props.empty) return []
  return searchTransactions(query.value).map((r) => ({
    source: r,
    date: r.date,
    number: r.number,
    type: t(r.type),
    originWarehouse: warehouseName(r.originWarehouseId),
    destinationWarehouse: warehouseName(r.destinationWarehouseId),
  }))
})

function matchesSearch(row: TxRow, s: string): boolean {
  return !s || row.number.toLowerCase().includes(s)
}

const {
  search, currentPage: txPage, paginated: txPaginated, total: txTotal, perPage: txPerPage,
  setPage: setTxPage, setPerPage: setTxPerPage, sortKey: txSortKey, sortDir: txSortDir,
  toggleSort: toggleTxSort, setSort: setTxSort,
} = useTableState<TxRow>(txRows, { perPage: 25, filterFn: (row, s) => matchesSearch(row, s) })

// Restore the transactions table as the user left it, then keep the store in step. The
// page comes back a tick later: restoring search / per-page resets it to 1 first.
{
  const saved = { ...reportState.transaction.table }
  search.value = saved.search
  txSortKey.value = saved.sortKey
  txSortDir.value = saved.sortDir
  txPerPage.value = saved.perPage
  void nextTick(() => { txPage.value = saved.page })
}
watch([search, txSortKey, txSortDir, txPage, txPerPage], ([s, key, dir, page, size]) => {
  Object.assign(reportState.transaction.table, { search: s, sortKey: key, sortDir: dir, page, perPage: size })
})

const txColumns = computed<TableColumn[]>(() => [
  // The label is the select-all checkbox's own label (header slot), so no plain header.
  { key: 'date', label: t('Transaction date'), kind: 'date', sortable: true, sortType: 'date', noHeader: true },
  { key: 'number', label: t('Transaction number'), kind: 'number', sortable: true, sortType: 'text' },
  { key: 'type', label: t('Transaction type'), sortable: true, sortType: 'text' },
  { key: 'originWarehouse', label: t('Warehouse origin'), kind: 'name', sortable: true, sortType: 'text' },
  { key: 'destinationWarehouse', label: t('Warehouse destination'), kind: 'name', sortable: true, sortType: 'text' },
])

const hasFilter = computed(() => typeLabels.value.length > 0 || dateCondition.value !== null || drawerFilterCount.value > 0)

function resetFilters() {
  resetTransactionSearch()
  search.value = ''
}

// ─── Selection ──────────────────────────────────────────────────────────────────
const selected = ref(new Set<string>(reportState.transaction.selected))

/** Every transaction the filters + search match — what "select all" picks. */
const matchingNumbers = computed(() => {
  const s = search.value.trim().toLowerCase()
  return txRows.value.filter((r) => matchesSearch(r, s)).map((r) => r.number)
})
const allSelected = computed(() => matchingNumbers.value.length > 0 && matchingNumbers.value.every((n) => selected.value.has(n)))
const someSelected = computed(() => selected.value.size > 0 && !allSelected.value)

function toggleAll() {
  selected.value = allSelected.value ? new Set() : new Set(matchingNumbers.value)
}
function toggleOne(number: string) {
  const next = new Set(selected.value)
  if (next.has(number)) next.delete(number)
  else next.add(number)
  selected.value = next
}
function clearSelection() { selected.value = new Set() }

// Changing a filter or the search resets the selection; paging and sorting don't. The
// selection is mirrored into the report state so it survives a trip to a batch's page.
watch([query, search], clearSelection)
watch(selected, (s) => { reportState.transaction.selected = [...s] })

const selectedLabel = computed(() => {
  const n = selected.value.size
  return n === 1 ? t('1 transaction selected') : t('{n} transactions selected').replace('{n}', String(n))
})

// ─── Batches in selected transactions ───────────────────────────────────────────
interface BatchLine extends Record<string, unknown> {
  key: string
  source: TransactionBatchRow
  transactionDate: string
  transactionNumber: string
  productName: string
  productImg: string
  batchNo: string
  expiryDate: string
  manufacturingDate: string
  bestBeforeDate: string
  vendor: string
  grade: string
  mutation: number
  mutationSecondary: number | null
}

const imageBySku = computed(() => new Map(productIndexRows().map((r) => [r.sku, r.img])))

const batchLines = computed<BatchLine[]>(() =>
  batchesInTransactions([...selected.value], props.access).map((r) => {
    const line: BatchLine = {
      key: r.key,
      source: r,
      transactionDate: r.date,
      transactionNumber: r.number,
      productName: r.productName,
      productImg: imageBySku.value.get(r.sku) ?? '',
      batchNo: r.batchNo,
      expiryDate: '',
      manufacturingDate: '',
      bestBeforeDate: '',
      vendor: '',
      grade: '',
      mutation: r.baseDelta,
      mutationSecondary: r.secondaryDelta.state === 'value' ? r.secondaryDelta.value : null,
    }
    for (const a of TRACE_ATTRIBUTE_COLUMNS) line[a.column] = attributeSortValue(r.attributes[a.key], a.key)
    return line
  }),
)

const {
  currentPage: batchPage, paginated: batchPaginated, total: batchTotal, perPage: batchPerPage,
  setPage: setBatchPage, setPerPage: setBatchPerPage, sortKey: batchSortKey, sortDir: batchSortDir,
  toggleSort: toggleBatchSort,
} = useTableState<BatchLine>(batchLines, { perPage: 25 })

// No filter bar on this table, so no sort menu either — its "Hide column" could never
// be undone. Header clicks still sort (PRD: sortable per column).
const batchColumns = computed<TableColumn[]>(() => [
  { key: 'transactionDate', label: t('Transaction date'), kind: 'date', sortable: true },
  { key: 'transactionNumber', label: t('Transaction number'), kind: 'number', sortable: true },
  { key: 'productName', label: t('Product'), kind: 'name', sortable: true },
  { key: 'batchNo', label: t('Batch number'), kind: 'number', sortable: true },
  ...TRACE_ATTRIBUTE_COLUMNS.map((a): TableColumn => ({
    key: a.column, label: t(a.label), kind: a.key === 'supplier' ? 'name' : a.key === 'grade' ? undefined : 'date', sortable: true,
  })),
  { key: 'mutation', label: t('Mutation'), align: 'right', sortable: true },
  { key: 'mutationSecondary', label: t('Mutation (secondary unit)'), align: 'right', sortable: true },
])

function attributeCellText(line: BatchLine, column: string): string {
  const a = TRACE_ATTRIBUTE_COLUMNS.find((c) => c.column === column)!
  return attributeText(line.source.attributes[a.key], a.key)
}
function isNa(line: BatchLine, column: string): boolean {
  const a = TRACE_ATTRIBUTE_COLUMNS.find((c) => c.column === column)
  if (a) return line.source.attributes[a.key].state === 'na'
  return column === 'mutationSecondary' && line.source.secondaryDelta.state === 'na'
}
function secondaryMutationText(line: BatchLine): string {
  const cell = line.source.secondaryDelta
  if (cell.state !== 'value') return t('NA')
  return mutationText(line.source.direction, cell.value, line.source.secondaryUnit)
}

/** Opens the batch's traceability detail with this transaction highlighted in its journey. */
function openBatch(line: BatchLine) {
  router.push({
    path: `/inventory-report/batch-traceability/${line.source.sku}/${encodeURIComponent(line.batchNo)}`,
    query: { transaction: line.transactionNumber },
  })
}

const asTx = (row: unknown) => row as TxRow
const asLine = (row: unknown) => row as BatchLine

// ─── Loading (first paint) ─────────────────────────────────────────────────────
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 400) })

// ─── Export (story 12) ──────────────────────────────────────────────────────────
// The transactions list (all / page / selected), plus — when anything is selected —
// the batches in the selected transactions. File header lists the applied filters.
const exportOpen = ref(false)
const exportColumns = computed(() => txColumns.value.map((c, i) => ({ key: c.key, label: c.label, required: i < 2 })))
const EXPORT_FORMATS: ExportFormat[] = ['xlsx', 'csv']

function warehouseListText(ids: string[]): string {
  return ids.length === activeWarehouses.value.length ? t('All warehouse') : ids.map(warehouseName).join(', ')
}

/** The filters behind the current result, as the file header lists them. */
const appliedFilters = computed<ExportFilter[]>(() => {
  const d = drawerFilters.value
  const dateLabels = { between: t('Is between'), before: t('Is before'), after: t('Is after') }
  const out: ExportFilter[] = []
  if (typeLabels.value.length) out.push({ label: t('Transaction type'), value: typeLabels.value.join(', ') })
  if (dateCondition.value) out.push({ label: t('Transaction date'), value: describeDateCondition(dateCondition.value, dateLabels, formatDate) })
  if (d.numbers.length) out.push({ label: t('Transaction number'), value: d.numbers.join(', ') })
  if (d.customerIds.length) out.push({ label: t('Customer'), value: d.customerIds.map(customerName).join(', ') })
  if (d.vendorIds.length) out.push({ label: t('Vendor'), value: d.vendorIds.map(vendorName).join(', ') })
  if (d.originWarehouseIds.length) out.push({ label: t('Warehouse origin'), value: warehouseListText(d.originWarehouseIds) })
  if (d.destinationWarehouseIds.length) out.push({ label: t('Warehouse destination'), value: warehouseListText(d.destinationWarehouseIds) })
  if (search.value.trim()) out.push({ label: t('Search keyword'), value: search.value.trim() })
  return out
})

function txCellText(row: TxRow, key: string): string {
  return key === 'date' ? formatDate(row.date) : String(row[key] ?? '')
}
function batchLineText(line: BatchLine, key: string): string {
  if (key === 'transactionDate') return formatDate(line.transactionDate)
  if (key === 'mutation') return mutationText(line.source.direction, line.source.qty, line.source.unit)
  if (key === 'mutationSecondary') return secondaryMutationText(line)
  if (TRACE_ATTRIBUTE_COLUMNS.some((a) => a.column === key)) return attributeCellText(line, key)
  return String(line[key] ?? '')
}

async function onExport(payload: { scope: 'all' | 'page' | 'selected'; columns: string[]; format?: ExportFormat }) {
  exportOpen.value = false
  const s = search.value.trim().toLowerCase()
  const lines = payload.scope === 'page'
    ? (txPaginated.value as TxRow[])
    : payload.scope === 'selected'
      ? txRows.value.filter((r) => selected.value.has(r.number))
      : txRows.value.filter((r) => matchesSearch(r, s))
  const cols = txColumns.value.filter((c) => payload.columns.includes(c.key))
  const sections: ExportSection[] = [
    { name: t('Transactions'), columns: cols.map((c) => c.label), rows: lines.map((r) => cols.map((c) => txCellText(r, c.key))) },
  ]
  if (selected.value.size) {
    sections.push({
      name: t('Batches in selected transactions'),
      columns: batchColumns.value.map((c) => c.label),
      rows: batchLines.value.map((line) => batchColumns.value.map((c) => batchLineText(line, c.key))),
    })
  }
  const doc = buildExportDocument({
    title: `${t('Batch traceability')} — ${t('By transaction')}`,
    exportedOn: formatDateTime(new Date().toISOString()),
    filters: appliedFilters.value,
    labels: { exportedOn: t('Exported on'), appliedFilters: t('Applied filters'), noFilters: t('No filters applied') },
    sections,
  })
  await downloadExport(doc, 'batch-traceability-by-transaction', payload.format ?? 'xlsx')
  successToast(t('Transactions exported'))
}

const emptyIllustration = '/illustrations/empty-folder.png'
</script>

<template>
  <div class="btx">
    <ErpTablePage
      :columns="txColumns"
      :rows="(txPaginated as unknown as Record<string, unknown>[])"
      :total="txTotal"
      :current-page="txPage"
      :per-page="txPerPage"
      :sort-key="txSortKey"
      :sort-dir="txSortDir"
      :loading="loading"
      :search="search"
      :has-active-search="!!search.trim()"
      :has-active-filter="hasFilter || !!search.trim()"
      filter-empty-label="transactions"
      no-row-hover
      @page-change="setTxPage"
      @per-page-change="setTxPerPage"
      @sort="toggleTxSort"
      @sort-change="setTxSort"
      @clear-filters="resetFilters"
    >
      <!-- ── Filter bar ── -->
      <template #filters>
        <div class="filter-left">
          <MultiSelectDropdown id="btx-type" v-model="typeLabels" :options="typeOptions" :placeholder="t('Transaction type')" />
          <div class="btx-date">
            <DateConditionField id="btx-date" v-model="dateCondition" />
          </div>
          <MpButton is-rounded class="bt-all-filters" :class="{ 'bt-all-filters--active': drawerFilterCount > 0 }" @click="filtersOpen = true">
            <MpIcon name="filter" size="sm" />
            {{ t('All filters') }}{{ drawerFilterCount > 0 ? ` (${drawerFilterCount})` : '' }}
          </MpButton>
        </div>

        <div class="filter-right">
          <MpButtonGroup class="filter-btn-group">
            <MpTooltip id="tt-btx-export" :label="t('Export')" placement="bottom" use-portal>
              <MpButton
                variant="ghost" is-rounded class="filter-icon-btn"
                left-icon="download" :aria-label="t('Export')" @click="exportOpen = true"
              />
            </MpTooltip>
          </MpButtonGroup>

          <div class="filter-search">
            <MpIcon name="search" size="sm" />
            <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search transaction number')">
            <MpButton
              v-if="search" variant="ghost" class="filter-search-clear"
              left-icon="close" :aria-label="t('Clear search')" @click="search = ''"
            />
          </div>
        </div>
      </template>

      <!-- ── Select all — the first column's own header, labelled like a header ── -->
      <template #header-date>
        <MpCheckbox
          id="btx-select-all" class="btx-head-check"
          :is-checked="allSelected" :is-indeterminate="someSelected"
          @change="toggleAll" @click.stop
        >{{ t('Transaction date') }}</MpCheckbox>
      </template>

      <template #cell-date="{ row }">
        <MpCheckbox
          :id="`btx-row-${asTx(row).number}`"
          :is-checked="selected.has(asTx(row).number)"
          @change="() => toggleOne(asTx(row).number)"
        >{{ formatDate(asTx(row).date) }}</MpCheckbox>
      </template>

      <template #empty>
        <div class="empty-full">
          <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240">
          <p class="empty-full-title">{{ t('No transactions') }}</p>
          <p class="empty-full-desc">{{ t('Transactions that moved batch stock will appear here.') }}</p>
        </div>
      </template>
    </ErpTablePage>

    <!-- ── Batches in the selected transactions ── -->
    <section class="btx-section">
      <div class="btx-section-head">
        <h2 class="btx-section-title">{{ t('Batches in selected transactions') }}</h2>
        <template v-if="selected.size">
          <span class="btx-selected">{{ selectedLabel }}</span>
          <MpButton variant="textLink" is-rounded class="btx-clear" @click="clearSelection">{{ t('Clear selection') }}</MpButton>
        </template>
      </div>

      <ErpTablePage
        :columns="batchColumns"
        :rows="(batchPaginated as unknown as Record<string, unknown>[])"
        :total="batchTotal"
        :current-page="batchPage"
        :per-page="batchPerPage"
        :sort-key="batchSortKey"
        :sort-dir="batchSortDir"
        no-row-hover
        @page-change="setBatchPage"
        @per-page-change="setBatchPerPage"
        @sort="toggleBatchSort"
      >
        <template #cell-transactionDate="{ row }">{{ formatDate(asLine(row).transactionDate) }}</template>

        <template #cell-productName="{ row }">
          <ProductCell :name="asLine(row).productName" :desc="asLine(row).source.sku" :image="asLine(row).productImg" />
        </template>

        <template #cell-batchNo="{ row }">
          <span
            class="cell-link" role="button" tabindex="0"
            @click.stop="openBatch(asLine(row))" @keydown.enter="openBatch(asLine(row))"
          >{{ asLine(row).batchNo }}</span>
        </template>

        <template v-for="a in TRACE_ATTRIBUTE_COLUMNS" :key="a.column" #[`cell-${a.column}`]="{ row }">
          <span :class="{ 'bt-na': isNa(asLine(row), a.column) }">{{ attributeCellText(asLine(row), a.column) }}</span>
        </template>

        <template #cell-mutation="{ row }">
          <span class="bt-num">{{ mutationText(asLine(row).source.direction, asLine(row).source.qty, asLine(row).source.unit) }}</span>
        </template>

        <template #cell-mutationSecondary="{ row }">
          <span class="bt-num" :class="{ 'bt-na': isNa(asLine(row), 'mutationSecondary') }">{{ secondaryMutationText(asLine(row)) }}</span>
        </template>

        <template #empty>
          <div class="empty-full">
            <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240">
            <p class="empty-full-title">{{ t('No transaction selected') }}</p>
            <p class="empty-full-desc">{{ t('Select a transaction to see its batches.') }}</p>
          </div>
        </template>
      </ErpTablePage>
    </section>

    <BatchTransactionFiltersDrawer
      id="btx-filters"
      v-model:is-open="filtersOpen"
      :model-value="drawerFilters"
      @apply="applyDrawerFilters"
    />

    <ExportModal
      :open="exportOpen"
      :formats="EXPORT_FORMATS"
      :selected-count="selected.size"
      :title="t('Export transactions')"
      :entity-label="t('transactions')"
      :columns="exportColumns"
      :total="txTotal"
      @close="exportOpen = false"
      @export="onExport"
    />
  </div>
</template>

<style scoped>
.btx { display: flex; flex-direction: column; gap: var(--mp-spacing-8, 32px); }

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
/* Comparator + picker sit side by side; fixed so picking a range never reflows the bar. */
.btx-date { width: 360px; flex-shrink: 0; }

/* All filters — secondary look; the (N) is the active signal (rule/filter-all-filters-active-count). */
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

/* Select-all label reads as the column header (rule/table-header-uppercase). */
.btx-head-check {
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; color: var(--mp-colors-text-secondary, #626b79);
}

/* ── Second table ── */
.btx-section { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.btx-section-head { display: flex; align-items: baseline; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.btx-section-title {
  margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-colors-text-default, #232933);
}
.btx-selected { font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-secondary, #626b79); }
.btx-clear { padding: 0 !important; }

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
.empty-full-desc {
  margin-top: var(--mp-spacing-0\.5); margin-bottom: var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-secondary, #626b79);
}
</style>
