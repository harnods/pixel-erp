<script setup lang="ts">
/**
 * Inventory › Replenishment — the "what do I reorder today, and how much" worklist
 * (PRD OD-004, the action hub for problem statement #5).
 *
 * Structure follows CycleCountRecommendationPage.vue, the repo's other derived
 * recommendation list: ErpTablePage + useTableState + a warehouse scope selector +
 * a bulk action that hands the selection to a create flow. Every number comes from
 * `~/data/replenishment`, which the tab badges in [...slug].vue also read, so the
 * table and its badge can never disagree.
 */
import { ref, reactive, computed, onMounted, onUnmounted, watch, inject, type Ref } from 'vue'
import {
  toast, MpBadge, MpIcon, MpTooltip, MpBanner, MpBannerDescription, MpButton, MpButtonGroup,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import SuggestionBreakdownDrawer from '~/components/patterns/SuggestionBreakdownDrawer.vue'
import CreatePurchaseRequestModal from '~/components/patterns/CreatePurchaseRequestModal.vue'
import SkuReplenishmentSettingsDrawer from '~/components/patterns/SkuReplenishmentSettingsDrawer.vue'
import VendorItemDrawer from '~/components/patterns/VendorItemDrawer.vue'
import ReplenishmentFiltersDrawer, {
  emptyReplenishmentFilters, countReplenishmentFilters, type ReplenishmentFiltersValue,
} from '~/components/patterns/ReplenishmentFiltersDrawer.vue'
import {
  replenishmentWorklist, recalculateReplenishment, ensureRunHistory,
  invalidateReplenishmentCaches, type WorklistRow,
} from '~/data/replenishment'
import { lastRun, isRunStale } from '~/data/replenishmentRuns'
import { setTracked } from '~/data/replenishmentSettings'
import { createPurchaseRequests } from '~/data/replenishmentPurchaseRequest'
import { REPL_ASOF_ISO } from '~/data/replenishmentConfig'
import { readStore, writeStore } from '~/data/replenishmentStore'
import { downloadCsv, splitCsv, type CsvRow } from '~/utils/csv'
import { CATALOG } from '~/data/catalog'
import { vendors } from '~/data/vendors'
import { ALL_WAREHOUSES } from '~/composables/useReplenishmentWarehouse'
import { formatDate } from '~/utils/date'

const router = useRouter()
const { t } = useLocale()

// ─── First-load skeleton (matches the other index pages) ─────────────────────
const loading = ref(true)
onMounted(() => {
  // Seed a run on first load so the "as of / last recalculated" line has a stamp.
  ensureRunHistory()
  setTimeout(() => { loading.value = false }, 1200)
})

// ─── Warehouse scope ─────────────────────────────────────────────────────────
// A scope selector, not a filter: one value is always in force, so it is excluded
// from "active filters" (there is nothing to clear).
const { options: whOptions, canSelectAll, warehouseId, isAllWarehouses, setWarehouse, resetFrom } =
  useReplenishmentWarehouse()

// Mirror the scope into the shared singleton so the tab badges in [...slug].vue
// count exactly the rows this table is showing. Cleared on unmount.
const activeWarehouseFilter = useActiveWarehouseFilter()
watch(warehouseId, (id) => {
  activeWarehouseFilter.value = id && id !== ALL_WAREHOUSES ? [id] : []
}, { immediate: true })
onUnmounted(() => { activeWarehouseFilter.value = [] })

const anyWarehouseEnabled = computed(() => whOptions.value.length > 0)

// ─── Recalculation ───────────────────────────────────────────────────────────
// The Recalculate button lives in the shell's title bar, so it signals through a
// provided ref (same mechanism as the other title-bar actions).
const recalcSignal = inject<Ref<number> | null>('replenishRecalcSignal', null)
const recalcTick = ref(0)
const recalculating = ref(false)

function recalculate() {
  recalculating.value = true
  loading.value = true
  invalidateReplenishmentCaches()
  const result = recalculateReplenishment(isAllWarehouses.value ? 'all' : warehouseId.value)
  setTimeout(() => {
    recalcTick.value++
    loading.value = false
    recalculating.value = false
    toast.notify({
      variant: 'success',
      title: t('Replenishment recalculated.'),
      description: `${result.due} ${t('products to order.')}`,
      maxWidth: 'max-content',
    })
  }, 900)
}
if (recalcSignal) watch(recalcSignal, () => recalculate())

const asOfLabel = computed(() => formatDate(REPL_ASOF_ISO))

/**
 * Stale numbers (US-013 VR-02 / EH-01): no recalculation within the nightly window.
 * The worklist still loads — a banner says so, and "Stale velocity" filters it.
 */
const isStale = computed(() => {
  void recalcTick.value
  return isRunStale(REPL_ASOF_ISO)
})
const lastRunLabel = computed(() => {
  void recalcTick.value
  const run = lastRun()
  if (!run) return ''
  return new Date(run.ranAt).toLocaleString('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
})

// ─── Worklist ────────────────────────────────────────────────────────────────
const worklist = computed(() => {
  void recalcTick.value // recompute after a recalculation
  return replenishmentWorklist(isAllWarehouses.value ? 'all' : warehouseId.value)
})

/**
 * Rows with their sort keys flattened to the top level BEFORE useTableState sees
 * them — it sorts the whole filtered set on plain keys, so a key that only existed
 * on the displayed page (the old post-pagination projection) compared '' vs '' and
 * sorting did nothing, and could only ever reorder within one page.
 */
type SortableRow = WorklistRow & {
  fsnClass: string
  onHandQty: number
  reservedQty: number
  availableQty: number
  onOrderQty: number
  coverValue: number
  velocityValue: number
  vendorName: string
  suggestedQty: number
}

const baseRows = computed<SortableRow[]>(() =>
  worklist.value.rows.map((row) => ({
    ...row,
    fsnClass: row.fsn.committed,
    onHandQty: row.atp.onHand,
    reservedQty: row.atp.reserved,
    availableQty: row.atp.available,
    onOrderQty: row.atp.onOrder,
    // Null cover must sort last in both directions rather than read as 0.
    coverValue: row.cover.coverDays ?? Number.POSITIVE_INFINITY,
    velocityValue: row.velocity.avgDailySales,
    vendorName: row.vendor?.name ?? '',
    // The number the cell shows (the stock-unit need), not the PO-rounded figure.
    suggestedQty: row.suggestion.rawQty,
  })),
)

// ─── Filters ─────────────────────────────────────────────────────────────────
const fsnFilter = ref('')
const filtersOpen = ref(false)
const appliedFilters = ref<ReplenishmentFiltersValue>(emptyReplenishmentFilters())
const drawerFilterCount = computed(() => countReplenishmentFilters(appliedFilters.value))

const vendorOptions = computed(() => vendors.map((v) => ({ id: v.id, name: v.name })))
const categoryOptions = computed(() =>
  [...new Set(CATALOG.map((c) => c.category))].sort().map((c) => ({ id: c, name: c })),
)

const warehouseSelectOptions = computed(() => [
  ...(canSelectAll.value ? [{ value: ALL_WAREHOUSES, label: t('All warehouses') }] : []),
  ...whOptions.value.map((wh) => ({ value: wh.id, label: wh.name })),
])

const FSN_OPTIONS = [
  { id: 'fast', name: 'Fast' },
  { id: 'slow', name: 'Slow' },
  { id: 'non-moving', name: 'Non-moving' },
]

function matchesDrawer(row: WorklistRow): boolean {
  const f = appliedFilters.value
  if (f.vendorIds.length && (!row.vendor || !f.vendorIds.includes(row.vendor.id))) return false
  if (f.categories.length && !f.categories.includes(row.category)) return false

  const from = f.coverFrom === '' ? null : Number(f.coverFrom)
  const to = f.coverTo === '' ? null : Number(f.coverTo)
  if (from !== null || to !== null) {
    // A row with no cover figure cannot satisfy a numeric range — exclude it rather
    // than silently treating "unknown" as 0 or infinity.
    if (row.cover.coverDays === null) return false
    if (from !== null && row.cover.coverDays < from) return false
    if (to !== null && row.cover.coverDays > to) return false
  }

  for (const signal of f.signals) {
    if (signal === 'volatile' && !row.flags.volatile) return false
    if (signal === 'provisional' && !row.flags.provisional) return false
    if (signal === 'estimated-lead' && !row.flags.leadTimeEstimated) return false
    if (signal === 'waiting-lead' && row.leadTimeTier !== 'none') return false
    if (signal === 'below-lead' && !row.flags.belowLeadTime) return false
    // Velocity is only as fresh as the last run, so staleness applies to every row.
    if (signal === 'stale' && !isStale.value) return false
  }
  return true
}

/** Search covers SKU, product, vendor and warehouse name (US-013 AC-01). */
function matchesSearch(row: SortableRow, s: string): boolean {
  if (!s) return true
  return [row.sku, row.productName, row.vendor?.name ?? '', row.warehouseName]
    .some((v) => v.toLowerCase().includes(s))
}

/** One predicate for the table AND the stat cards, so they can never disagree. */
function matchesAll(row: SortableRow, s: string): boolean {
  if (!matchesSearch(row, s)) return false
  // The FSN quick filter is read straight from its own ref rather than through
  // useTableState's generic `status` slot — it is a class, not a status.
  if (fsnFilter.value && row.fsn.committed !== fsnFilter.value) return false
  return matchesDrawer(row)
}

const {
  search, currentPage, paginated, sorted, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<SortableRow>(baseRows, { filterFn: matchesAll })

/**
 * Stat cards follow the warehouse scope AND every active filter (US-013 AC-01:
 * "from the filtered warehouse in the worklist index"), so the numbers above the
 * table always describe the rows in it.
 */
const cardStats = computed(() => {
  const s = search.value.trim().toLowerCase()
  const rows = baseRows.value.filter((r) => matchesAll(r, s))
  return {
    // Unique SKUs, not SKU-warehouse pairs — one SKU short in two warehouses is
    // still one product to order.
    toOrderSkus: new Set(rows.map((r) => r.sku)).size,
    stocksOut: rows.filter((r) => r.flags.belowLeadTime).length,
    noVendor: rows.filter((r) => !r.vendor).length,
  }
})

watch(fsnFilter, () => setPage(1))
watch(appliedFilters, () => setPage(1))
watch(warehouseId, () => setPage(1))

// Default: most urgent first.
sortKey.value = 'urgency'
sortDir.value = 'desc'

const hasActiveFilter = computed(() => !!search.value || !!fsnFilter.value || drawerFilterCount.value > 0)
function clearFilters() {
  // The warehouse scope is deliberately NOT cleared — one is always in force.
  search.value = ''
  fsnFilter.value = ''
  appliedFilters.value = emptyReplenishmentFilters()
}

// ─── Columns ─────────────────────────────────────────────────────────────────
// Widths come from each column's `kind` (rule/table-column-kind). Quantity and
// day-count columns have no semantic kind, so they take the `default` range.
const ALL_COLUMNS: TableColumn[] = [
  { key: 'productName',   label: 'Product',         kind: 'name',   sortable: true, sortType: 'text' },
  { key: 'sku',           label: 'SKU',                             sortable: true, sortType: 'text' },
  { key: 'fsnClass',      label: 'FSN',             kind: 'status', sortable: true, sortType: 'text' },
  // General signals (US-013 AC-01 §4): how reliable / early the numbers behind the
  // recommendation are — the demand read (Provisional / Volatile demand) AND the
  // lead-time basis (Estimated lead time / Waiting for real lead time). Distinct
  // from FSN's movement class, so it gets its own column.
  { key: 'signals',       label: 'Signals',         kind: 'tags' },
  { key: 'warehouseName', label: 'Warehouse',       kind: 'name',   sortable: true, sortType: 'text' },
  // The stock group, in StockTables.vue's vocabulary so it reads as the same table
  // the user already knows. `available` is what days-of-cover divides;
  // `available + onOrder` is what the reorder trigger compares — both derivable
  // from these four, and spelled out in the trust drawer.
  { key: 'onHandQty',     label: 'On hand qty',     sortable: true, sortType: 'number', align: 'right' },
  { key: 'reservedQty',   label: 'Reserved qty',    sortable: true, sortType: 'number', align: 'right' },
  { key: 'availableQty',  label: 'Available qty',   sortable: true, sortType: 'number', align: 'right' },
  { key: 'onOrderQty',    label: 'In transit qty',  sortable: true, sortType: 'number', align: 'right' },
  { key: 'unit',          label: 'Unit',            kind: 'unit' },
  { key: 'coverValue',    label: 'Days of cover',   sortable: true, sortType: 'number', align: 'right' },
  { key: 'suggestedQty',  label: 'Suggested qty',   sortable: true, sortType: 'number', align: 'right' },
  { key: 'vendorName',    label: 'Vendor',          kind: 'name',   sortable: true, sortType: 'text' },
  { key: 'reorderPoint',  label: 'Reorder point',   sortable: true, sortType: 'number', align: 'right' },
  { key: 'leadTimeDays',  label: 'Lead time',       sortable: true, sortType: 'number', align: 'right' },
  { key: 'velocityValue', label: 'Demand velocity', sortable: true, sortType: 'number', align: 'right' },
  { key: 'safetyDays',    label: 'Safety days',     sortable: true, sortType: 'number', align: 'right' },
]

/**
 * Column settings (US-013 AC-01): every column shows by default; Product,
 * Suggested qty, Days of cover, Warehouse and Vendor can never be hidden; and the
 * choice is remembered, so the user lands on the same set on every visit.
 */
const LOCKED_COLUMNS = new Set(['productName', 'suggestedQty', 'coverValue', 'warehouseName', 'vendorName'])
for (const c of ALL_COLUMNS) if (LOCKED_COLUMNS.has(c.key)) c.lockHide = true
const COLUMNS_STORAGE_KEY = 'erp-db:replenishment-worklist-columns'
const savedColumns = readStore<Record<string, boolean>>(COLUMNS_STORAGE_KEY, {})
const columnVisibility = reactive<Record<string, boolean>>(
  Object.fromEntries(ALL_COLUMNS.map((c) => [
    c.key, LOCKED_COLUMNS.has(c.key) ? true : (savedColumns[c.key] ?? true),
  ])),
)
watch(columnVisibility, (v) => writeStore(COLUMNS_STORAGE_KEY, { ...v }), { deep: true })
const columns = computed(() => ALL_COLUMNS.filter((c) => columnVisibility[c.key]))
const columnItems = computed(() =>
  ALL_COLUMNS.map((c) => ({ key: c.key, label: t(c.label), disabled: LOCKED_COLUMNS.has(c.key) })),
)
function hideColumn(key: string) { if (!LOCKED_COLUMNS.has(key)) columnVisibility[key] = false }

// ─── Export (US-013 AC-01) ───────────────────────────────────────────────────
/**
 * Exports the WHOLE filtered, sorted worklist — not just the visible page — in
 * files of at most 1,000 rows each, so a large list downloads as several files.
 */
const EXPORT_MAX_ROWS = 1000
function exportWorklist() {
  const header: CsvRow = [
    'Product', 'SKU', 'Warehouse', 'FSN', 'Signals', 'On hand qty', 'Reserved qty',
    'Available qty', 'In transit qty', 'Unit', 'Days of cover', 'Suggested qty', 'Vendor',
    'Reorder point', 'Lead time (days)', 'Demand velocity (per day)', 'Safety days',
  ]
  const rows: CsvRow[] = sorted.value.map((r) => [
    r.productName, r.sku, r.warehouseName, r.fsn.committed,
    [
      r.flags.provisional ? 'Provisional' : '', r.flags.volatile ? 'Volatile demand' : '',
      r.flags.leadTimeEstimated ? 'Estimated lead time' : '',
      r.leadTimeTier === 'none' ? 'Waiting for real lead time' : '',
    ].filter(Boolean).join('; '),
    r.atp.onHand, r.atp.reserved, r.atp.available, r.atp.onOrder, r.unit,
    r.cover.coverDays === null ? '' : r.cover.coverDays.toFixed(1),
    r.suggestion.rawQty, r.vendor?.name ?? '',
    r.reorderPointSource === 'none' ? '' : r.reorderPoint, r.leadTimeDays,
    r.velocity.avgDailySales.toFixed(2), r.safetyDays,
  ])
  const files = splitCsv(header, rows, EXPORT_MAX_ROWS)
  files.forEach((lines, i) => {
    downloadCsv(lines, files.length > 1
      ? `replenishment-worklist-${REPL_ASOF_ISO}-part${i + 1}.csv`
      : `replenishment-worklist-${REPL_ASOF_ISO}.csv`)
  })
  toast.notify({
    variant: 'success',
    title: files.length > 1
      ? `${t('Worklist exported in')} ${files.length} ${t('files')}.`
      : t('Worklist exported.'),
    maxWidth: 'max-content',
  })
}

// ─── Formatting ──────────────────────────────────────────────────────────────
const num = (v: number, digits = 0) =>
  v.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits })

const FSN_BADGE: Record<string, { type: string; label: string }> = {
  // FSN is an attention filter, not a state (PRD decision D4) — so Fast is blue
  // `information`, never green `completed`, which would read as "this SKU is fine".
  fast: { type: 'information', label: 'Fast' },
  slow: { type: 'warning', label: 'Slow' },
  'non-moving': { type: 'announcement', label: 'Non-moving' },
  unclassified: { type: 'announcement', label: 'Unclassified' },
}

/**
 * What this vendor's terms WOULD make of the need, shown as secondary detail.
 *
 * The primary number is the need itself, in stock units, because that is what a
 * Purchase Request carries (decision D12) — rounding happens later, at PO time,
 * against whichever vendor purchasing actually binds. Showing the rounded figure
 * as the headline would put a different number here than on the request the user
 * is about to raise, for the same row.
 */
function adjustmentNote(row: WorklistRow): string {
  const vi = row.vendorItem
  if (!vi || row.suggestion.purchaseQty <= 0) return ''
  const at = `${row.suggestion.purchaseQty} ${vi.purchaseUnit} ${t('at PO')}`
  if (row.suggestion.raisedByMoq && row.suggestion.raisedByPack) {
    return `${t('MOQ')} ${vi.moq} + ${t('pack of')} ${vi.packSize} → ${at}`
  }
  if (row.suggestion.raisedByMoq) return `${t('MOQ')} ${vi.moq} → ${at}`
  if (row.suggestion.raisedByPack) return `${t('Pack of')} ${vi.packSize} → ${at}`
  return at
}

// ─── Row actions ─────────────────────────────────────────────────────────────
const breakdownRow = ref<WorklistRow | null>(null)
const breakdownOpen = ref(false)
const settingsRow = ref<WorklistRow | null>(null)
const settingsOpen = ref(false)
const poRows = ref<WorklistRow[]>([])
const poOpen = ref(false)
/** Inline error inside the PR modal when creating the requests fails. */
const prError = ref('')
watch(poOpen, (open) => { if (open) prError.value = '' })
const muteRow = ref<WorklistRow | null>(null)
const muteOpen = ref(false)
const vendorSku = ref<string | null>(null)
const vendorOpen = ref(false)
let clearSelection: (() => void) | null = null

function viewProduct(sku: string) { router.push(`/product-list/${sku}`) }
function viewWarehouse(id: string) { router.push(`/warehouses/${id}`) }

function openBreakdown(row: WorklistRow) {
  breakdownRow.value = row
  breakdownOpen.value = true
}

function openSettings(row: WorklistRow) {
  settingsRow.value = row
  settingsOpen.value = true
}

function openVendors(sku: string) {
  vendorSku.value = sku
  vendorOpen.value = true
}

function openPoForRows(rows: WorklistRow[], deselect?: () => void) {
  // Both guards are unreachable from the UI (the bulk bar only offers the action
  // for a non-empty, single-warehouse selection) — they stay as silent no-ops, not
  // error toasts (rule/toast-success-only).
  if (!rows.length) return
  // A PO has one ship-to, so a selection spanning warehouses cannot be expressed.
  if (new Set(rows.map((r) => r.warehouseId)).size > 1) return
  poRows.value = rows
  clearSelection = deselect ?? null
  poOpen.value = true
}

function selectedWorklistRows(sel: Set<number>): WorklistRow[] {
  // A selected index is a position in the displayed page.
  return [...sel].map((i) => paginated.value[i]).filter(Boolean) as WorklistRow[]
}

/**
 * A purchase request is per warehouse (one PO has one ship-to), and letting a bulk
 * selection span warehouses would fan out into many POs — the heavy back-end path
 * we avoid. So "Request to purchase" is offered only when every selected row is in
 * the same warehouse; otherwise the bulk bar explains what to do instead.
 */
function selectionSpansWarehouses(sel: Set<number>): boolean {
  return new Set(selectedWorklistRows(sel).map((r) => r.warehouseId)).size > 1
}

function bulkCreatePr(sel: Set<number>, deselectAll: () => void) {
  openPoForRows(selectedWorklistRows(sel), deselectAll)
}

function confirmPr(payload: {
  overrides: Record<string, number>
  vendorChoices: Record<string, string | null>
}) {
  // Nothing is closed or cleared until the requests exist: on failure the modal
  // stays open with every edit intact and an inline error (US-017 EH-01,
  // rule/form-errors-inline — never an error toast over a closed form).
  let result: ReturnType<typeof createPurchaseRequests>
  try {
    result = createPurchaseRequests(poRows.value, payload.overrides, payload.vendorChoices)
  } catch {
    prError.value = t('The purchase request could not be saved. Try again.')
    return
  }
  const created = result.created.length
  if (!created) {
    prError.value = t('The purchase request could not be saved. Try again.')
    return
  }

  poOpen.value = false
  clearSelection?.()
  clearSelection = null
  invalidateReplenishmentCaches()
  recalcTick.value++
  // Names the next owner, because the requester does not place the order —
  // purchasing decides which requests become POs (US-020 AC-03).
  const unsourced = result.created.filter((c) => !c.vendorId).length
  const parts: string[] = []
  if (result.skipped.length) {
    parts.push(`${result.skipped.length} ${result.skipped.length === 1 ? t('line skipped') : t('lines skipped')}.`)
  }
  if (unsourced) parts.push(t('Purchasing will source the unassigned lines.'))
  toast.notify({
    variant: 'success',
    title: created === 1 ? t('Purchase request created.') : `${created} ${t('purchase requests created.')}`,
    description: parts.length ? parts.join(' ') : t('Purchasing will review and decide which become orders.'),
    maxWidth: 'max-content',
  })
  // Land on the requests, where they are waiting for purchasing.
  router.push({ path: '/purchase-requests' })
}

function askMute(row: WorklistRow) {
  muteRow.value = row
  muteOpen.value = true
}

function confirmMute() {
  const row = muteRow.value
  if (!row) return
  setTracked(row.sku, row.warehouseId, false)
  recalcTick.value++
  toast.notify({ variant: 'success', title: t('Tracking turned off.'), maxWidth: 'max-content' })
}

/**
 * Bulk "Turn off tracking" confirms first, with the count, exactly like the
 * single-row action — it removes rows from the worklist (reachable-states ›
 * destructive; US-010 VR-02 "confirm dialog with count").
 */
const bulkMuteRows = ref<WorklistRow[]>([])
const bulkMuteOpen = ref(false)
let bulkMuteDeselect: (() => void) | null = null

function askBulkMute(sel: Set<number>, deselectAll: () => void) {
  const rows = selectedWorklistRows(sel)
  if (!rows.length) return
  bulkMuteRows.value = rows
  bulkMuteDeselect = deselectAll
  bulkMuteOpen.value = true
}

function confirmBulkMute() {
  const rows = bulkMuteRows.value
  for (const row of rows) setTracked(row.sku, row.warehouseId, false)
  bulkMuteDeselect?.()
  bulkMuteDeselect = null
  recalcTick.value++
  toast.notify({
    variant: 'success',
    title: `${t('Tracking turned off for')} ${rows.length} ${rows.length === 1 ? t('product') : t('products')}.`,
    maxWidth: 'max-content',
  })
}

function onSettingsSaved() {
  invalidateReplenishmentCaches()
  recalcTick.value++
}

const aireneToggle = inject<(() => void) | null>('toggleAirene', null)
</script>

<template>
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
    :has-checkbox="anyWarehouseEnabled"
    bulk-label="product"
    filter-empty-label="product"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
  >
    <!-- ── Stats + freshness ── -->
    <template #stats>
      <div class="rp-stats-wrap">
        <div class="stats-section">
          <div class="stat-card stat-card--bordered">
            <div class="stat-title">{{ t('To order') }}</div>
            <div class="stat-period">{{ t('At or below reorder point') }}</div>
            <div class="stat-amount stat-amount--warning">{{ cardStats.toOrderSkus }}</div>
            <span class="stat-asof">{{ t('of') }} {{ worklist.totals.skus }} {{ t('stocked products') }}</span>
          </div>
          <div class="stat-card stat-card--bordered">
            <div class="stat-title">{{ t('Stocks out before resupply') }}</div>
            <div class="stat-period">{{ t('Cover below lead time + safety days') }}</div>
            <div class="stat-amount stat-amount--danger">{{ cardStats.stocksOut }}</div>
            <span class="stat-asof">{{ t('on the worklist') }}</span>
          </div>
          <div class="stat-card stat-card--bordered">
            <div class="stat-title">{{ t('Needs setup') }}</div>
            <div class="stat-period">{{ t('Missing lead time, or tracking turned off') }}</div>
            <div class="stat-amount">{{ worklist.totals.needsSetup + worklist.notTracked.length }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-title">{{ t('No vendor') }}</div>
            <div class="stat-period">{{ t('Due but not orderable') }}</div>
            <div class="stat-amount">{{ cardStats.noVendor }}</div>
          </div>
        </div>
        <!-- US-014 EH-01: a remembered warehouse that is gone resets the scope, visibly. -->
        <MpBanner v-if="resetFrom" variant="info">
          <MpBannerDescription>
            {{ t('A saved filter was reset') }} ({{ resetFrom }} {{ t('is no longer available') }}). {{ t('Pick a warehouse to save a new one.') }}
          </MpBannerDescription>
        </MpBanner>
        <!-- US-013 EH-01: stale numbers never block the worklist — they are called out. -->
        <MpBanner v-if="isStale" variant="warning">
          <MpBannerDescription>
            {{ t('Data as of') }} {{ lastRunLabel || asOfLabel }} — {{ t('refresh pending. Recalculate to update demand and suggested quantities.') }}
          </MpBannerDescription>
        </MpBanner>
        <div class="rp-freshness">
          <span>{{ t('As of') }} {{ asOfLabel }}</span>
          <span v-if="lastRunLabel" class="rp-freshness-sep">·</span>
          <span v-if="lastRunLabel">{{ t('Last recalculated') }} {{ lastRunLabel }}</span>
          <span v-if="recalculating">· {{ t('Recalculating…') }}</span>
        </div>
      </div>
    </template>

    <!-- ── Filter bar ── -->
    <template #filters>
      <div class="filter-left">
        <!-- Warehouse: a scope SELECTOR, not a filter. It always holds exactly one
             value and is never clearable, so it carries no placeholder — an empty
             "Warehouse" option would offer a state the worklist cannot be in, and
             picking it left the control reading "Warehouse" while the table went
             on showing every warehouse. The FSN control below is a filter and
             keeps its placeholder, because "no FSN filter" is a real state.
             "All warehouses" still lists rows per SKU-warehouse and never blends
             them into a total (US-025 AC-02). -->
        <ErpFilterSelect
          id="rp-warehouse-select"
          :model-value="warehouseId"
          :placeholder="t('Warehouse')"
          :options="warehouseSelectOptions"
          width="220px"
          :is-clearable="false"
          @update:model-value="(v: string) => setWarehouse(v)"
        />

        <!-- rule/select-erpfilterselect: an MpPopover menu, clearable — never MpSelect. -->
        <ErpFilterSelect
          id="rp-fsn-select"
          :model-value="fsnFilter"
          :placeholder="t('FSN class')"
          :options="FSN_OPTIONS.map((o) => ({ value: o.id, label: t(o.name) }))"
          width="170px"
          @update:model-value="(v: string) => { fsnFilter = v }"
        />

        <button class="filter-all-btn" type="button" @click="filtersOpen = true">
          <MpIcon name="filter" size="sm" />
          {{ t('All filters') }}<template v-if="drawerFilterCount"> ({{ drawerFilterCount }})</template>
        </button>
      </div>

      <div class="filter-right">
        <!-- rule/filter-bar-icon-group: ghost icon MpButtons in one MpButtonGroup, each
             with a tooltip; Airene uses the purple airene-brand icon. -->
        <MpButtonGroup class="filter-btn-group">
          <MpTooltip :label="t('Ask Airene')" placement="bottom">
            <MpButton class="filter-airene-btn" variant="ghost" left-icon="airene-brand" :aria-label="t('Ask Airene')" is-rounded @click="aireneToggle?.()" />
          </MpTooltip>
          <ColumnSettingsMenu
            id="rp-col-settings"
            :items="columnItems"
            :visibility="columnVisibility"
            :tooltip="t('Column settings')"
          />
          <MpTooltip :label="t('Export')" placement="bottom">
            <MpButton variant="ghost" left-icon="download" :aria-label="t('Export')" is-rounded @click="exportWorklist" />
          </MpTooltip>
        </MpButtonGroup>
        <div class="filter-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search product, vendor or warehouse')" />
          <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>
    </template>

    <!-- ── Bulk actions ── -->
    <template #bulk-actions="{ deselectAll, selectedRows }">
      <!-- A PO has one ship-to. Requesting across warehouses would fan out into many
           POs, so it is only offered for a single-warehouse selection. -->
      <span v-if="selectionSpansWarehouses(selectedRows as Set<number>)" class="rp-bulk-info">
        <MpIcon name="info" size="sm" />
        {{ t('Select replenishment from the same warehouse to create a purchase request.') }}
      </span>
      <button
        v-else
        class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm"
        @click="bulkCreatePr(selectedRows as Set<number>, deselectAll)"
      >{{ t('Request to purchase') }}</button>
      <button
        class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm"
        @click="askBulkMute(selectedRows as Set<number>, deselectAll)"
      >{{ t('Turn off tracking') }}</button>
    </template>

    <!-- ── Product ── -->
    <template #cell-productName="{ row }">
      <!-- rule/table-product-cell: 40px photo + name + 2-line clamped description. -->
      <ProductCell
        :name="(row as any).productName"
        :desc="(row as any).productDesc"
        :image="(row as any).img"
        linkable
        @name-click="viewProduct((row as any).sku)"
      />
    </template>

    <!-- ── FSN ── -->
    <template #cell-fsnClass="{ row }">
      <div class="rp-badges">
        <MpBadge
          for="tableStatus"
          :type="FSN_BADGE[(row as any).fsn.committed]?.type ?? 'announcement'"
        >{{ t(FSN_BADGE[(row as any).fsn.committed]?.label ?? 'Unclassified') }}</MpBadge>
      </div>
    </template>

    <!-- General signals (US-013 AC-01 §4): the demand read AND the lead-time basis,
         separate from FSN's movement class. -->
    <template #cell-signals="{ row }">
      <div
        v-if="(row as any).flags.provisional || (row as any).flags.volatile
          || (row as any).flags.leadTimeEstimated || (row as any).leadTimeTier === 'none'"
        class="rp-badges"
      >
        <MpBadge v-if="(row as any).flags.provisional" for="tableStatus" type="information">
          {{ t('Provisional') }}
        </MpBadge>
        <MpBadge v-if="(row as any).flags.volatile" for="tableStatus" type="information">
          {{ t('Volatile demand') }}
        </MpBadge>
        <MpBadge v-if="(row as any).flags.leadTimeEstimated" for="tableStatus" type="information">
          {{ t('Estimated lead time') }}
        </MpBadge>
        <MpBadge v-if="(row as any).leadTimeTier === 'none'" for="tableStatus" type="warning">
          {{ t('Waiting for real lead time') }}
        </MpBadge>
      </div>
      <span v-else class="rp-signal-none">—</span>
    </template>

    <!-- ── Warehouse ── -->
    <template #cell-warehouseName="{ row }">
      <a class="cell-link cell-text" @click.stop="viewWarehouse((row as any).warehouseId)">
        {{ (row as any).warehouseName }}
      </a>
    </template>

    <!-- ── Stock group: bare numbers, unit shown once in its own column ── -->
    <template #cell-onHandQty="{ value }">{{ num(value as number) }}</template>
    <template #cell-reservedQty="{ value }">{{ num(value as number) }}</template>
    <template #cell-onOrderQty="{ value }">{{ num(value as number) }}</template>

    <!-- Available is the number days-of-cover divides, so it is the one that
         carries emphasis — and the Oversold flag when reserved exceeds on hand. -->
    <template #cell-availableQty="{ row }">
      <div class="rp-num">
        <span
          class="rp-num-value"
          :class="{ 'rp-num-value--critical': (row as any).atp.oversold }"
        >{{ num((row as any).atp.available) }}</span>
        <MpBadge v-if="(row as any).atp.oversold" for="tableStatus" type="critical">
          {{ t('Oversold') }}
        </MpBadge>
      </div>
    </template>

    <!-- ── Days of cover — three states (US-019) ── -->
    <template #cell-coverValue="{ row }">
      <div class="rp-num">
        <template v-if="(row as any).cover.coverDays === null">
          <span class="rp-num-value rp-num-value--muted">—</span>
          <span class="rp-num-sub">{{ t('No recent sales') }}</span>
        </template>
        <template v-else>
          <span
            class="rp-num-value"
            :class="{ 'rp-num-value--critical': (row as any).cover.belowLeadTime }"
            :title="(row as any).cover.belowLeadTime
              ? `${t('Stocks out before resupply')} — ${t('lead time + safety days')}: ${(row as any).leadTimeDays + (row as any).safetyDays} ${t('days')}`
              : undefined"
          >{{ num((row as any).cover.coverDays, 1) }}</span>
        </template>
      </div>
    </template>

    <!-- ── Suggested qty — the number, and what shaped it ── -->
    <template #cell-suggestedQty="{ row }">
      <div class="rp-num">
        <a class="cell-link rp-num-value" @click.stop="openBreakdown(row as unknown as WorklistRow)">
          {{ num((row as any).suggestion.rawQty) }} {{ (row as any).unit }}
        </a>
        <!-- US-004 AC-03: due, but an open PO already covers the gap. -->
        <span v-if="(row as any).suggestion.coveredBy.length" class="rp-num-sub">
          {{ t('Covered by') }} {{ (row as any).suggestion.coveredBy.join(', ') }}
        </span>
        <span v-else-if="adjustmentNote(row as unknown as WorklistRow)" class="rp-num-sub">
          {{ adjustmentNote(row as unknown as WorklistRow) }}
        </span>
      </div>
    </template>

    <!-- ── Vendor ── -->
    <template #cell-vendorName="{ row }">
      <template v-if="(row as any).vendor">
        <div class="rp-vendor">
          <span class="cell-text">{{ (row as any).vendor.name }}</span>
          <span v-if="(row as any).alternates.length" class="rp-vendor-sub">
            +{{ (row as any).alternates.length }}
            {{ (row as any).alternates.length === 1 ? t('more vendor') : t('more vendors') }}
          </span>
          <!-- US-001 EH-01: lead time fell back to the next listed vendor. -->
          <span v-if="(row as any).inactivePreferredVendor" class="rp-vendor-sub rp-vendor-sub--warning">
            {{ t('Preferred vendor is inactive') }}
          </span>
        </div>
      </template>
      <MpBadge v-else for="tableStatus" type="warning">{{ t('No vendor') }}</MpBadge>
    </template>

    <!-- ── Optional numeric columns ── -->
    <template #cell-reorderPoint="{ row }">
      {{ (row as any).reorderPointSource === 'none' ? '—' : `${num((row as any).reorderPoint)} ${(row as any).unit}` }}
    </template>
    <template #cell-leadTimeDays="{ row }">
      {{ (row as any).leadTimeDays }} {{ t('days') }}
    </template>
    <template #cell-velocityValue="{ row }">
      {{ num((row as any).velocity.avgDailySales, 2) }} {{ (row as any).unit }}/{{ t('day') }}
    </template>
    <template #cell-safetyDays="{ row }">
      {{ (row as any).safetyDays }} {{ t('days') }}
    </template>

    <!-- ── Row actions ── -->
    <template #actions="{ row }">
      <MpPopover
        :id="`rp-actions-${(row as any).warehouseId}-${(row as any).sku}`"
        is-close-on-select
        use-portal
        :is-keep-alive="false"
        placement="bottom-end"
      >
        <MpPopoverTrigger>
          <button class="row-kebab" :aria-label="t('More actions')">
            <MpIcon name="menu-kebab" size="md" />
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '210px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="viewProduct((row as any).sku)">{{ t('View details') }}</MpPopoverListItem>
            <MpPopoverListItem @click="openBreakdown(row as unknown as WorklistRow)">
              {{ t('Why this number') }}
            </MpPopoverListItem>
            <MpPopoverListItem @click="openVendors((row as any).sku)">
              {{ t('Vendors, lead time and MOQ') }}
            </MpPopoverListItem>
            <MpPopoverListItem @click="openPoForRows([row as unknown as WorklistRow])">
              {{ t('Request to purchase') }}
            </MpPopoverListItem>
            <MpPopoverListItem @click="openSettings(row as unknown as WorklistRow)">
              {{ t('Replenishment settings') }}
            </MpPopoverListItem>
            <MpPopoverListItem @click="askMute(row as unknown as WorklistRow)">
              {{ t('Turn off tracking') }}
            </MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Empty state — distinguishes "not set up" from "nothing due" ── -->
    <template #empty>
      <div class="empty-full">
        <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">
          {{ !anyWarehouseEnabled ? t('Replenishment not set up') : t('No products to order') }}
        </p>
        <p class="empty-full-desc">
          {{ !anyWarehouseEnabled
            ? t('Turn on the replenishment worklist in Configure warehouse to see which products to reorder.')
            : t('Every tracked product is above its reorder point.') }}
        </p>
        <!-- rule/empty-state-structure: the "not set up" state names the fix, so it
             links to it — Configure warehouse is opened per warehouse from the list. -->
        <button
          v-if="!anyWarehouseEnabled"
          class="btn-enterprise btn-enterprise--secondary empty-full-cta"
          type="button"
          @click="router.push('/warehouses')"
        >{{ t('Go to Warehouses') }}</button>
      </div>
    </template>
  </ErpTablePage>

  <!-- ── Overlays ── -->
  <ReplenishmentFiltersDrawer
    v-model:is-open="filtersOpen"
    :model-value="appliedFilters"
    :vendor-options="vendorOptions"
    :category-options="categoryOptions"
    @apply="(v) => { appliedFilters = v }"
  />

  <SuggestionBreakdownDrawer
    v-model:is-open="breakdownOpen"
    :row="breakdownRow"
    @create-purchase-request="(row) => { breakdownOpen = false; openPoForRows([row]) }"
    @edit-settings="(row) => { breakdownOpen = false; openSettings(row) }"
    @edit-vendors="(row) => { breakdownOpen = false; openVendors(row.sku) }"
  />

  <CreatePurchaseRequestModal
    v-model:is-open="poOpen"
    :rows="poRows"
    :submit-error="prError"
    @confirm="confirmPr"
    @assign-vendor="(sku) => { poOpen = false; openVendors(sku) }"
  />

  <SkuReplenishmentSettingsDrawer
    v-model:is-open="settingsOpen"
    :row="settingsRow"
    @saved="onSettingsSaved"
  />

  <!-- Read-only: the worklist is a stockist surface; vendor terms are edited by
       purchasing in the Vendors module. -->
  <VendorItemDrawer
    v-model:is-open="vendorOpen"
    :sku="vendorSku"
    readonly
    @saved="onSettingsSaved"
  />

  <ConfirmModal
    v-model:is-open="muteOpen"
    :title="t('Turn off tracking for this product?')"
    :description="t('It stops appearing in the replenishment worklist. Its reorder point and safety days are kept, so turning tracking back on restores them. Existing purchase orders are not affected.')"
    :confirm-label="t('Turn off tracking')"
    :is-danger="false"
    @confirm="confirmMute"
  />

  <ConfirmModal
    v-model:is-open="bulkMuteOpen"
    :title="`${t('Turn off tracking for')} ${bulkMuteRows.length} ${bulkMuteRows.length === 1 ? t('product') : t('products')}?`"
    :description="t('They stop appearing in the replenishment worklist. Their reorder points and safety days are kept, so turning tracking back on restores them. Existing purchase orders are not affected.')"
    :confirm-label="t('Turn off tracking')"
    :is-danger="false"
    @confirm="confirmBulkMute"
  />
</template>

<style scoped>
/* ── Stats (mirrors ProductsPage exactly) ── */
.rp-stats-wrap { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.stats-section { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.stat-card {
  flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1);
  padding-right: var(--mp-spacing-6); align-self: stretch;
}
.stat-card--bordered { border-right: 1px solid var(--mp-border-default, #e3e7e9); }
.stat-title {
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  line-height: var(--mp-line-heights-md); white-space: nowrap;
}
.stat-period {
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-sm, 16px); white-space: normal;
}
.stat-amount {
  font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); line-height: var(--mp-line-heights-2xl, 32px); white-space: nowrap;
}
.stat-amount--warning { color: var(--mp-colors-text-warning); }
.stat-amount--danger { color: var(--mp-text-danger); }
.stat-asof { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }

.rp-freshness {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}
.rp-freshness-sep { color: var(--mp-text-subtle); }

/* ── Filter bar (mirrored from CycleCountRecommendationPage) ── */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-2); margin-left: auto; }
.filter-all-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-1\.5);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral, #ffffff); color: var(--mp-text-default);
  font-size: var(--mp-font-sizes-md); cursor: pointer;
}
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral, #ffffff); color: var(--mp-text-secondary); min-width: 220px;
}
.filter-search-input {
  flex: 1; border: none; background: transparent; outline: none;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  line-height: var(--mp-line-heights-md);
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-colors-icon-default);
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }

/* ── Row actions ── */
.row-kebab {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px); margin-left: auto;
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-text-secondary);
}
.row-kebab:hover { background: var(--mp-background-neutral-hovered, #eef0f3); color: var(--mp-text-default); }

/* ── Numeric two-line cells ── */
.rp-num { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.rp-num-value { color: var(--mp-text-default); white-space: nowrap; font-variant-numeric: tabular-nums; }
.rp-num-value--critical { color: var(--mp-text-danger); font-weight: var(--mp-font-weights-semi-bold); }
.rp-num-value--muted { color: var(--mp-text-subtle); }
.rp-num-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); text-align: right; }
.rp-num-sub--critical { color: var(--mp-text-danger); }

.rp-vendor { display: flex; flex-direction: column; min-width: 0; }
.rp-vendor-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.rp-vendor-sub--warning { color: var(--mp-colors-text-warning); }
.filter-airene-btn :deep(svg) { color: var(--mp-airene-default); }
.rp-badges { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.rp-signal-none { color: var(--mp-text-subtle); }

/* Bulk bar guidance when a selection spans warehouses — no cross-warehouse PR. */
.rp-bulk-info {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-1\.5, 6px);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}
.rp-bulk-info :deep(svg) { color: var(--mp-colors-icon-subtle); flex-shrink: 0; }


/* ── Empty state ── */
.empty-full { display: flex; flex-direction: column; align-items: center; padding: var(--mp-spacing-10, 40px) 0; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.empty-full-desc {
  margin-top: var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary); max-width: 400px; text-align: center;
}
.empty-full-cta { margin-top: var(--mp-spacing-4); }
</style>
