<script setup lang="ts">
/**
 * Batch Traceability Report — the By transaction search (PRD stories 4, 5; plan Phase 2).
 *
 * Same grouped table as By batch (the Production request structure): one parent row per
 * transaction — number, date, type, warehouses — and its batches as child rows under an
 * empty lane, each with the attribute values RECORDED on that transaction and its signed
 * mutation. A parent row folds its batches away; pagination counts transactions.
 *
 * Attribute columns are Attribute 1–N, named on the transaction row (as By batch names
 * them on the product row). One transaction can carry products with different attribute
 * sets, so its row names the UNION of its batches' attributes; a batch whose product
 * doesn't use one shows NA there (the PRD's "not used" state). N is the widest
 * transaction in the result.
 *
 * Filter-first, like By batch: Transaction type (with "All transaction type") and the
 * date edit a draft, and nothing lists until Filter applies it. Filter needs at least
 * one of them — without, it shows an inline error, never a disabled button
 * (rule/btn-no-disabled-validation, rule/form-errors-inline).
 *
 * Filters, search, page and folded rows live in useBatchTraceabilityReportState, so a
 * batch's detail page can send the user back here exactly as they left it (story 7);
 * switching modes resets that state (story 6).
 *
 * Deliberate departures from docs/design/RULES.md:
 * - Hand-rolled grouped <table>, not ErpTablePage (rule/table-use-erptablepage) — the
 *   parent/child rows ErpTablePage can't draw; widths still follow rule/table-column-kind.
 * - No row [...] actions (a report line has nothing to act on) — rule/table-actions-column.
 * - Newest transaction first; batches within one keep Product A–Z, Batch A–Z. No
 *   per-column sort on grouped rows (as By batch).
 * - Transaction numbers are plain text for now: the seeded report transactions aren't
 *   records in the Sales/Purchase/Inventory modules, so a link would open "not found".
 */
import { computed, nextTick, onMounted, ref, toRef, watch } from 'vue'
import { MpButton, MpButtonGroup, MpIcon, MpSkeleton, MpTooltip } from '@mekari/pixel3'
import type { TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpPagination from '~/components/patterns/ErpPagination.vue'
import { columnWidth } from '~/components/patterns/columnWidths'
import MultiSelectDropdown from '~/components/patterns/MultiSelectDropdown.vue'
import DateConditionField from '~/components/patterns/DateConditionField.vue'
import ExportModal from '~/components/patterns/ExportModal.vue'
import {
  TRACE_TX_TYPES, searchTransactions, batchesInTransactions, productTraceAttributes,
  type TraceTxType, type TraceabilityAccess,
  type TransactionRow, type TransactionBatchRow, type TransactionSearchFilter,
} from '~/data/batchTraceability'
import { MAX_BATCH_ATTRIBUTES, batchAttributeDef, type BatchAttributeKey } from '~/data/batchAttributes'
import { TRACE_ATTRIBUTE_COLUMNS, useTraceabilityCells } from '~/composables/useTraceabilityCells'
import { productIndexRows } from '~/data/productsIndex'
import { warehouses } from '~/data/warehouses'
import { formatDate, formatDateTime } from '~/utils/date'
import {
  buildExportDocument, describeDateCondition, downloadExport, type ExportFilter, type ExportFormat,
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
const { attributeText, mutationText } = useTraceabilityCells()

function warehouseName(id: string | null): string {
  return id ? warehouses.find((w) => w.id === id)?.name ?? id : ''
}

// ─── Filters (draft → Filter → applied) ─────────────────────────────────────────
// Transaction type sits in the bar as translated labels; mapped back to the type key.
const typeByLabel = computed(() => new Map(TRACE_TX_TYPES.map((type) => [t(type), type])))
const typeOptions = computed(() => [...typeByLabel.value.keys()])
const { state: reportState, resetTransactionSearch } = useBatchTraceabilityReportState()
const typeLabels = toRef(reportState.transaction, 'typeLabels')
const dateCondition = toRef(reportState.transaction, 'dateCondition')
/** What the last Filter click applied — null until the user has filtered once. */
const applied = toRef(reportState.transaction, 'applied')

const filterError = ref('')
const hasDraftFilter = computed(() => typeLabels.value.length > 0 || dateCondition.value !== null)
function runFilter() {
  if (!hasDraftFilter.value) {
    filterError.value = t('Select at least one filter, then click Filter.')
    return
  }
  filterError.value = ''
  applied.value = {
    typeLabels: [...typeLabels.value],
    dateCondition: dateCondition.value ? { ...dateCondition.value } : null,
  }
  search.value = ''
  currentPage.value = 1
}
watch(hasDraftFilter, (has) => { if (has) filterError.value = '' })

/** The applied selection as a search; null before the first Filter. */
const query = computed<TransactionSearchFilter | null>(() => {
  const a = applied.value
  if (!a) return null
  return {
    types: a.typeLabels.map((label) => typeByLabel.value.get(label)).filter((type): type is TraceTxType => !!type),
    date: a.dateCondition ?? undefined,
  }
})

// ─── Rows: transactions, each with its batches ──────────────────────────────────
interface BatchLine {
  key: string
  source: TransactionBatchRow
  productImg: string
}
interface TxGroup {
  number: string
  /** Named `date` on purpose: useTableState's default newest-first applies (PRD story 5). */
  date: string
  source: TransactionRow
  lines: BatchLine[]
  /** Union of the lines' products' attribute sets, first-seen order — Attribute 1–N. */
  attributes: BatchAttributeKey[]
}

const imageBySku = computed(() => new Map(productIndexRows().map((r) => [r.sku, r.img])))
const transactions = computed(() => (props.empty || !query.value ? [] : searchTransactions(query.value)))

const groups = computed<TxGroup[]>(() => {
  const list = transactions.value
  const bySku = new Map<string, BatchAttributeKey[]>()
  const linesByNumber = new Map<string, BatchLine[]>()
  for (const r of batchesInTransactions(list.map((tx) => tx.number), props.access)) {
    if (!bySku.has(r.sku)) bySku.set(r.sku, productTraceAttributes(r.sku, props.access))
    const line: BatchLine = { key: r.key, source: r, productImg: imageBySku.value.get(r.sku) ?? '' }
    linesByNumber.set(r.number, [...(linesByNumber.get(r.number) ?? []), line])
  }
  return list.map((tx) => {
    const lines = linesByNumber.get(tx.number) ?? []
    const attributes = [...new Set(lines.flatMap((l) => bySku.get(l.source.sku) ?? []))]
    return { number: tx.number, date: tx.date, source: tx, lines, attributes }
  })
})

function matchesSearch(g: TxGroup, s: string): boolean {
  return !s || g.number.toLowerCase().includes(s) || g.lines.some((l) => l.source.batchNo.toLowerCase().includes(s))
}

const {
  search, currentPage, paginated, total, perPage, setPage, setPerPage, sortKey, sortDir,
} = useTableState<TxGroup>(groups, { perPage: 25, filterFn: (g, s) => matchesSearch(g, s) })
const pagedGroups = computed(() => paginated.value as TxGroup[])
const matchingGroups = computed(() => {
  const s = search.value.trim().toLowerCase()
  return groups.value.filter((g) => matchesSearch(g, s)).sort((a, b) => b.date.localeCompare(a.date))
})

// Restore the table as the user left it, then keep the store in step. The page comes
// back a tick later: restoring search / per-page resets it to 1 first.
{
  const saved = { ...reportState.transaction.table }
  search.value = saved.search
  sortKey.value = saved.sortKey
  sortDir.value = saved.sortDir
  perPage.value = saved.perPage
  void nextTick(() => { currentPage.value = saved.page })
}
watch([search, sortKey, sortDir, currentPage, perPage], ([s, key, dir, page, size]) => {
  Object.assign(reportState.transaction.table, { search: s, sortKey: key, sortDir: dir, page, perPage: size })
})

function resetFilters() {
  resetTransactionSearch()
  search.value = ''
}

// ─── Expand / collapse ──────────────────────────────────────────────────────────
// Open by default, like By batch; the folded ones are kept in the report state.
const collapsed = toRef(reportState.transaction, 'collapsed')
function isOpen(number: string) { return !collapsed.value.includes(number) }
function toggleGroup(number: string) {
  collapsed.value = isOpen(number) ? [...collapsed.value, number] : collapsed.value.filter((n) => n !== number)
}

// ─── Columns ────────────────────────────────────────────────────────────────────
/** As many Attribute columns as the widest transaction in the result (at least 3). */
const attributeSlots = computed(() => {
  const widest = Math.max(MAX_BATCH_ATTRIBUTES, ...groups.value.map((g) => g.attributes.length))
  return Array.from({ length: widest }, (_, i) => i)
})
const slotKey = (i: number) => `attribute${i + 1}`
/** The columns after the merged Transaction / Batch number column. */
const valueColumns = computed<TableColumn[]>(() => [
  { key: 'productName', label: t('Product'), kind: 'name' },
  { key: 'date', label: t('Transaction date'), kind: 'date' },
  { key: 'type', label: t('Transaction type') },
  { key: 'originWarehouse', label: t('Warehouse origin'), kind: 'name' },
  { key: 'destinationWarehouse', label: t('Warehouse destination'), kind: 'name' },
  ...attributeSlots.value.map((i): TableColumn => ({ key: slotKey(i), label: `${t('Attribute')} ${i + 1}` })),
  { key: 'mutation', label: t('Mutation'), align: 'right' },
  { key: 'mutationSecondary', label: t('Mutation (secondary unit)'), align: 'right' },
])
const mainColWidth = columnWidth('number').maxWidth
function colWidth(c: TableColumn): string { return columnWidth(c.kind).maxWidth }

/** The attribute a slot column holds for this transaction, if it has that many. */
function slotAttribute(g: TxGroup, column: string): BatchAttributeKey | null {
  const i = attributeSlots.value.findIndex((n) => slotKey(n) === column)
  return i < 0 ? null : g.attributes[i] ?? null
}

/** Parent row: the transaction's own fields and its attribute names; batch columns blank. */
function parentCell(g: TxGroup, column: string): string {
  const slot = slotAttribute(g, column)
  if (slot) return t(batchAttributeDef(slot).label)
  if (column === 'date') return formatDate(g.date)
  if (column === 'type') return t(g.source.type)
  if (column === 'originWarehouse') return warehouseName(g.source.originWarehouseId)
  if (column === 'destinationWarehouse') return warehouseName(g.source.destinationWarehouseId)
  return ''
}
function secondaryMutationText(line: BatchLine): string {
  const cell = line.source.secondaryDelta
  if (cell.state !== 'value') return t('NA')
  return mutationText(line.source.direction, cell.value, line.source.secondaryUnit)
}
function isNa(g: TxGroup, line: BatchLine, column: string): boolean {
  const slot = slotAttribute(g, column)
  if (slot) return line.source.attributes[slot].state === 'na'
  return column === 'mutationSecondary' && line.source.secondaryDelta.state === 'na'
}

/** Opens the batch's traceability detail with this transaction highlighted in its journey. */
function openBatch(line: BatchLine) {
  router.push({
    path: `/inventory-report/batch-traceability/${line.source.sku}/${encodeURIComponent(line.source.batchNo)}`,
    query: { transaction: line.source.number },
  })
}

// ─── Loading (first paint of a result) ──────────────────────────────────────────
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 400) })

// ─── Export (story 12) ──────────────────────────────────────────────────────────
// Flat: one line per transaction + batch, one column per attribute type (the file mixes
// products, so Attribute 1–3 would mean different things per line).
const exportOpen = ref(false)
const EXPORT_FORMATS: ExportFormat[] = ['xlsx', 'csv']
const exportColumnDefs = computed(() => [
  { key: 'date', label: t('Transaction date') },
  { key: 'number', label: t('Transaction number') },
  { key: 'type', label: t('Transaction type') },
  { key: 'originWarehouse', label: t('Warehouse origin') },
  { key: 'destinationWarehouse', label: t('Warehouse destination') },
  { key: 'productName', label: t('Product') },
  { key: 'batchNo', label: t('Batch number') },
  ...TRACE_ATTRIBUTE_COLUMNS.map((a) => ({ key: a.column, label: t(a.label) })),
  { key: 'mutation', label: t('Mutation') },
  { key: 'mutationSecondary', label: t('Mutation (secondary unit)') },
])
const exportColumns = computed(() => exportColumnDefs.value.map((c, i) => ({ ...c, required: i < 2 })))

function exportCell(g: TxGroup, line: BatchLine, key: string): string {
  const attribute = TRACE_ATTRIBUTE_COLUMNS.find((a) => a.column === key)
  if (attribute) return attributeText(line.source.attributes[attribute.key], attribute.key)
  if (key === 'number') return g.number
  if (key === 'productName') return line.source.productName
  if (key === 'batchNo') return line.source.batchNo
  if (key === 'mutation') return mutationText(line.source.direction, line.source.qty, line.source.unit)
  if (key === 'mutationSecondary') return secondaryMutationText(line)
  return parentCell(g, key)
}

/** The filters behind the current result (the applied ones), as the file header lists them. */
const appliedFilters = computed<ExportFilter[]>(() => {
  const a = applied.value
  const out: ExportFilter[] = []
  if (!a) return out
  const dateLabels = { between: t('Is between'), before: t('Is before'), after: t('Is after') }
  if (a.typeLabels.length) {
    out.push({
      label: t('Transaction type'),
      value: a.typeLabels.length === typeOptions.value.length ? t('All transaction type') : a.typeLabels.join(', '),
    })
  }
  if (a.dateCondition) out.push({ label: t('Transaction date'), value: describeDateCondition(a.dateCondition, dateLabels, formatDate) })
  if (search.value.trim()) out.push({ label: t('Search keyword'), value: search.value.trim() })
  return out
})

async function onExport(payload: { scope: 'all' | 'page' | 'selected'; columns: string[]; format?: ExportFormat }) {
  exportOpen.value = false
  const list = payload.scope === 'page' ? pagedGroups.value : matchingGroups.value
  const cols = exportColumnDefs.value.filter((c) => payload.columns.includes(c.key))
  const doc = buildExportDocument({
    title: `${t('Batch traceability')} — ${t('By transaction')}`,
    exportedOn: formatDateTime(new Date().toISOString()),
    filters: appliedFilters.value,
    labels: { exportedOn: t('Exported on'), appliedFilters: t('Applied filters'), noFilters: t('No filters applied') },
    sections: [{
      name: t('Transactions'),
      columns: cols.map((c) => c.label),
      rows: list.flatMap((g) => g.lines.map((line) => cols.map((c) => exportCell(g, line, c.key)))),
    }],
  })
  await downloadExport(doc, 'batch-traceability-by-transaction', payload.format ?? 'xlsx')
  successToast(t('Transactions exported'))
}

function countText(n: number): string {
  return n === 1 ? t('1 batch') : t('{n} batches').replace('{n}', String(n))
}

const emptyIllustration = '/illustrations/empty-folder.png'
</script>

<template>
  <section class="btx">
    <!-- ── Filter bar ── -->
    <div class="btx-filter-bar">
      <div class="filter-left">
        <MultiSelectDropdown
          id="btx-type" v-model="typeLabels" :options="typeOptions" :placeholder="t('Transaction type')"
          :select-all-label="t('All transaction type')" :all-selected-label="t('All transaction type')"
        />
        <div class="btx-date">
          <DateConditionField id="btx-date" v-model="dateCondition" />
        </div>
        <button type="button" class="btn-enterprise btn-enterprise--primary btx-filter-btn" @click="runFilter">{{ t('Filter') }}</button>
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
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search transaction or batch number')">
          <MpButton
            v-if="search" variant="ghost" class="filter-search-clear"
            left-icon="close" :aria-label="t('Clear search')" @click="search = ''"
          />
        </div>
      </div>
    </div>

    <p v-if="filterError" class="btx-filter-error" role="alert">
      <MpIcon name="warning-triangle" size="sm" />{{ filterError }}
    </p>

    <!-- ── No transactions at all ── -->
    <div v-if="props.empty" class="empty-full">
      <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240">
      <p class="empty-full-title">{{ t('No transactions') }}</p>
      <p class="empty-full-desc">{{ t('Transactions that moved batch stock will appear here.') }}</p>
    </div>

    <!-- ── Filter first — nothing lists until Filter is clicked ── -->
    <div v-else-if="!applied" class="empty-full">
      <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240">
      <p class="empty-full-title">{{ t('Filter to see transactions') }}</p>
      <p class="empty-full-desc">{{ t('Select a transaction type or date, then click Filter.') }}</p>
    </div>

    <!-- ── Grouped table: transaction parent rows, batch child rows ── -->
    <template v-else-if="loading || pagedGroups.length">
      <div class="btx-table-wrap">
        <table class="btx-table">
          <colgroup>
            <col style="width: 56px">
            <col :style="{ width: mainColWidth }">
            <col v-for="c in valueColumns" :key="c.key" :style="{ width: colWidth(c) }">
          </colgroup>
          <thead>
            <tr>
              <th class="btx-th" colspan="2">{{ t('Transaction number') }}/{{ t('Batch number') }}</th>
              <th
                v-for="c in valueColumns" :key="c.key"
                class="btx-th" :class="{ 'btx-th--right': c.align === 'right' }"
              >{{ c.label }}</th>
            </tr>
          </thead>
          <tbody>
            <!-- Loading — 3 solid skeleton rows, one bar per column (ErpTablePage standard) -->
            <template v-if="loading">
              <tr v-for="n in 3" :key="`sk-${n}`" class="btx-parent btx-parent--skeleton">
                <td class="btx-td" colspan="2">
                  <MpSkeleton class="btx-skel" height="14px" rounded="sm" duration="0s" width="72px" />
                </td>
                <td v-for="c in valueColumns" :key="c.key" class="btx-td" :class="{ 'btx-td--right': c.align === 'right' }">
                  <MpSkeleton class="btx-skel" height="14px" rounded="sm" duration="0s" :width="c.align === 'right' ? '56px' : '72px'" />
                </td>
              </tr>
            </template>

            <template v-for="g in pagedGroups" v-else :key="g.number">
              <!-- Parent (transaction) row — the number cell folds its batches -->
              <tr class="btx-parent">
                <td
                  class="btx-td btx-parent-cell" colspan="2" role="button" tabindex="0"
                  :aria-expanded="isOpen(g.number)"
                  @click="toggleGroup(g.number)" @keydown.enter="toggleGroup(g.number)"
                >
                  <div class="btx-tx">
                    <div class="btx-tx-main">
                      <span class="btx-tx-number">{{ g.number }}</span>
                      <span class="btx-expand" :class="{ 'btx-expand--open': isOpen(g.number) }" aria-hidden="true">
                        <MpIcon name="chevrons-down" size="sm" />
                      </span>
                    </div>
                    <span class="btx-tx-meta">{{ countText(g.lines.length) }}</span>
                  </div>
                </td>
                <td
                  v-for="c in valueColumns" :key="c.key"
                  class="btx-td" :class="{ 'btx-td--right': c.align === 'right', 'btx-attr-name': !!slotAttribute(g, c.key) }"
                >
                  {{ parentCell(g, c.key) }}
                </td>
              </tr>

              <!-- Child (batch) rows under an empty lane -->
              <template v-if="isOpen(g.number)">
                <tr v-for="(line, li) in g.lines" :key="line.key" class="btx-child">
                  <td v-if="li === 0" class="btx-td btx-child-lane" :rowspan="g.lines.length" />
                  <td class="btx-td btx-child-td">
                    <span
                      class="cell-link" role="button" tabindex="0"
                      @click.stop="openBatch(line)" @keydown.enter="openBatch(line)"
                    >{{ line.source.batchNo }}</span>
                  </td>
                  <td
                    v-for="c in valueColumns" :key="c.key"
                    class="btx-td btx-child-td" :class="{ 'btx-td--right bt-num': c.align === 'right', 'bt-na': isNa(g, line, c.key) }"
                  >
                    <div v-if="c.key === 'productName'" class="btx-product">
                      <img v-if="line.productImg" class="btx-thumb" :src="line.productImg" :alt="line.source.productName" loading="lazy" width="32" height="32">
                      <div class="btx-product-body">
                        <span class="btx-product-name">{{ line.source.productName }}</span>
                        <span class="btx-product-sku">SKU: {{ line.source.sku }}</span>
                      </div>
                    </div>
                    <!-- The attribute is named on the transaction row above. -->
                    <template v-else-if="slotAttribute(g, c.key)">{{ attributeText(line.source.attributes[slotAttribute(g, c.key)!], slotAttribute(g, c.key)!) }}</template>
                    <template v-else-if="c.key === 'mutation'">{{ mutationText(line.source.direction, line.source.qty, line.source.unit) }}</template>
                    <template v-else-if="c.key === 'mutationSecondary'">{{ secondaryMutationText(line) }}</template>
                  </td>
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

    <!-- ── Filtered empty — the filter or search found no transaction ── -->
    <div v-else class="empty-full">
      <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240">
      <p class="empty-full-title">{{ search.trim() ? `"${search.trim()}" ${t('not found')}` : t('No transactions match your filters') }}</p>
      <p class="empty-full-desc">{{ search.trim() ? t('Recheck the keywords you have typed and try searching again.') : t('Recheck the filters you have applied and try filtering again.') }}</p>
      <a class="empty-clear" @click="resetFilters">{{ t('Clear all filters') }}</a>
    </div>

    <ExportModal
      :open="exportOpen"
      :formats="EXPORT_FORMATS"
      :title="t('Export transactions')"
      :entity-label="t('transactions')"
      :columns="exportColumns"
      :total="matchingGroups.length"
      @close="exportOpen = false"
      @export="onExport"
    />
  </section>
</template>

<style scoped>
.btx { display: flex; flex-direction: column; min-width: 0; }

/* ── Filter bar ── */
.btx-filter-bar {
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3);
  margin-bottom: var(--mp-spacing-5);
}
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
.btx-filter-btn { white-space: nowrap; }
.btx-filter-error {
  display: flex; align-items: center; gap: var(--mp-spacing-1);
  margin: calc(-1 * var(--mp-spacing-3)) 0 var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-critical, #d93b3b);
}

/* ── Grouped table (By batch / Production request structure) ── */
.btx-table-wrap { overflow-x: auto; }
.btx-table { width: 100%; min-width: max-content; border-collapse: collapse; table-layout: fixed; }
.btx-th {
  position: sticky; top: 0; z-index: 2;
  height: var(--mp-sizes-7, 28px);
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; color: var(--mp-text-default); text-align: left;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.btx-th--right { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.btx-td {
  height: var(--mp-sizes-10, 40px);
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-4) var(--mp-spacing-2\.5) var(--mp-spacing-2);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  vertical-align: middle; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  background: inherit;
}
.btx-td--right { text-align: right; padding: var(--mp-spacing-2\.5) var(--mp-spacing-2) var(--mp-spacing-2\.5) var(--mp-spacing-4); }
.btx-th, .btx-td { border-right: 1px solid var(--mp-border-default, #e3e7e9); }
.btx-th:last-child, .btx-td:last-child { border-right: none; }

.btx-parent--skeleton .btx-td { background: var(--mp-background-neutral, #ffffff); }
.btx-skel {
  display: inline-block; vertical-align: middle;
  background-image: none !important; background-color: var(--mp-border-default, #e3e7e9) !important; animation: none !important;
}

/* Parent (transaction) row — the number cell folds the group */
.btx-parent { background: var(--mp-background-neutral, #ffffff); }
.btx-parent:hover .btx-td { background: var(--mp-background-neutral-hovered, #eef0f3); }
.btx-parent-cell { white-space: normal; cursor: pointer; }
.btx-parent-cell:hover .btx-tx-number { color: var(--mp-text-selected); }
.btx-parent-cell:hover .btx-expand { color: var(--mp-text-default); }
.btx-tx { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: 0; }
.btx-tx-main { display: flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; }
.btx-tx-number {
  flex: 1; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-medium); color: var(--mp-text-default);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.btx-tx-meta { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }
.btx-expand {
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
  width: var(--mp-sizes-6, 24px); height: var(--mp-sizes-6, 24px);
  border-radius: var(--mp-radii-sm); color: var(--mp-text-secondary);
  transition: transform 120ms ease;
}
.btx-expand--open { transform: rotate(180deg); }

/* Child (batch) rows */
.btx-child > .btx-child-td { background: var(--mp-background-neutral, #ffffff); }
.btx-child:hover > .btx-child-td { background: var(--mp-background-neutral-hovered, #eef0f3); }
.btx-child-lane { background: var(--mp-background-neutral, #ffffff); }
.btx-product { display: flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; }
.btx-thumb {
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px); flex-shrink: 0; object-fit: cover;
  border-radius: var(--mp-radii-md); border: 1px solid var(--mp-border-subtle, #eef0f3);
}
.btx-product-body { display: flex; flex-direction: column; min-width: 0; }
.btx-product-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.btx-product-sku { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
/* Attribute name on the transaction row — labels the slot for its batches (as By batch). */
.btx-attr-name { font-weight: var(--mp-font-weights-semi-bold); }

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
.empty-clear { color: var(--mp-text-link); cursor: pointer; font-size: var(--mp-font-sizes-md); }
.empty-clear:hover { text-decoration: underline; text-underline-offset: 2px; }
</style>
