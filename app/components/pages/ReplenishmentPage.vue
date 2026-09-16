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
  toast, MpBadge, MpSelect, MpIcon, MpTooltip,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ClampText from '~/components/patterns/ClampText.vue'
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
import { lastRun } from '~/data/replenishmentRuns'
import { setTracked } from '~/data/replenishmentSettings'
import { createPurchaseRequests } from '~/data/replenishmentPurchaseRequest'
import { REPL_ASOF_ISO } from '~/data/replenishmentConfig'
import { CATALOG } from '~/data/catalog'
import { vendors } from '~/data/vendors'
import { ALL_WAREHOUSES } from '~/composables/useReplenishmentWarehouse'
import { formatDate } from '~/utils/date'
import { infoToast } from '~/utils/toasts'

const router = useRouter()
const { t } = useLocale()

// ─── First-load skeleton (matches the other index pages) ─────────────────────
const loading = ref(true)
onMounted(() => {
  // Plant backdated runs so FSN hysteresis/dwell is real rather than dead code.
  ensureRunHistory()
  setTimeout(() => { loading.value = false }, 1200)
})

// ─── Warehouse scope ─────────────────────────────────────────────────────────
// A scope selector, not a filter: one value is always in force, so it is excluded
// from "active filters" (there is nothing to clear).
const { options: whOptions, canSelectAll, warehouseId, isAllWarehouses, setWarehouse } =
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
      description: result.reclassified
        ? `${result.reclassified} ${t('products changed movement class.')}`
        : undefined,
      maxWidth: 'max-content',
    })
  }, 900)
}
if (recalcSignal) watch(recalcSignal, () => recalculate())

const asOfLabel = computed(() => formatDate(REPL_ASOF_ISO))
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

const baseRows = computed<WorklistRow[]>(() => worklist.value.rows)

// ─── Filters ─────────────────────────────────────────────────────────────────
const fsnFilter = ref('')
const filtersOpen = ref(false)
const appliedFilters = ref<ReplenishmentFiltersValue>(emptyReplenishmentFilters())
const drawerFilterCount = computed(() => countReplenishmentFilters(appliedFilters.value))

const vendorOptions = computed(() => vendors.map((v) => ({ id: v.id, name: v.name })))
const categoryOptions = computed(() =>
  [...new Set(CATALOG.map((c) => c.category))].sort().map((c) => ({ id: c, name: c })),
)

const FSN_OPTIONS = [
  { id: 'fast', name: 'Fast' },
  { id: 'slow', name: 'Slow' },
  { id: 'non-moving', name: 'Non-moving' },
]

function matchesDrawer(row: WorklistRow): boolean {
  const f = appliedFilters.value
  if (f.keyword) {
    const k = f.keyword.toLowerCase()
    if (!row.sku.toLowerCase().includes(k) && !row.productName.toLowerCase().includes(k)) return false
  }
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
    if (signal === 'oversold' && !row.flags.oversold) return false
    if (signal === 'below-lead' && !row.flags.belowLeadTime) return false
    if (signal === 'no-vendor' && row.vendorItem) return false
    if (signal === 'volatile' && !row.flags.volatile) return false
    if (signal === 'moq-adjusted' && !(row.suggestion.raisedByMoq || row.suggestion.raisedByPack)) return false
  }
  return true
}

const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<WorklistRow>(baseRows, {
  // The FSN quick filter is read straight from its own ref rather than through
  // useTableState's generic `status` slot — it is a class, not a status, and the
  // closure stays reactive either way.
  filterFn: (row, s) => {
    if (s && !row.sku.toLowerCase().includes(s) && !row.productName.toLowerCase().includes(s)) return false
    if (fsnFilter.value && row.fsn.committed !== fsnFilter.value) return false
    return matchesDrawer(row)
  },
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
const ALL_COLUMNS: TableColumn[] = [
  { key: 'productName',   label: 'Product',        width: '280px', sortable: true, sortType: 'text' },
  { key: 'sku',           label: 'SKU',            width: '104px', sortable: true, sortType: 'text' },
  { key: 'fsnClass',      label: 'FSN',            width: '116px', sortable: true, sortType: 'text' },
  { key: 'warehouseName', label: 'Warehouse',      width: '170px', sortable: true, sortType: 'text' },
  // The stock group, in StockTables.vue's vocabulary and widths so it reads as
  // the same table the user already knows. `available` is what days-of-cover
  // divides; `available + onOrder` is what the reorder trigger compares — both
  // derivable from these four, and spelled out in the trust drawer.
  { key: 'onHandQty',     label: 'On hand qty',    width: '120px', sortable: true, sortType: 'number', align: 'right' },
  { key: 'reservedQty',   label: 'Reserved qty',   width: '124px', sortable: true, sortType: 'number', align: 'right' },
  { key: 'availableQty',  label: 'Available qty',  width: '128px', sortable: true, sortType: 'number', align: 'right' },
  { key: 'onOrderQty',    label: 'On order qty',   width: '124px', sortable: true, sortType: 'number', align: 'right' },
  { key: 'unit',          label: 'Unit',           width: '88px' },
  { key: 'coverValue',    label: 'Days of cover',  width: '148px', sortable: true, sortType: 'number', align: 'right' },
  { key: 'suggestedQty',  label: 'Suggested qty',  width: '164px', sortable: true, sortType: 'number', align: 'right' },
  { key: 'vendorName',    label: 'Vendor',         width: '190px', sortable: true, sortType: 'text' },
  { key: 'reorderPoint',  label: 'Reorder point',         width: '148px', sortable: true, sortType: 'number', align: 'right' },
  { key: 'leadTimeDays',  label: 'Lead time',             width: '124px', sortable: true, sortType: 'number', align: 'right' },
  { key: 'velocityValue', label: 'Demand velocity',       width: '164px', sortable: true, sortType: 'number', align: 'right' },
  { key: 'safetyDays',    label: 'Safety days',           width: '128px', sortable: true, sortType: 'number', align: 'right' },
]

// Hidden by default — the eight visible columns already answer "what and how much".
const HIDDEN_BY_DEFAULT = new Set(['reorderPoint', 'leadTimeDays', 'velocityValue', 'safetyDays'])
const columnVisibility = reactive<Record<string, boolean>>(
  Object.fromEntries(ALL_COLUMNS.map((c) => [c.key, !HIDDEN_BY_DEFAULT.has(c.key)])),
)
const columns = computed(() => ALL_COLUMNS.filter((c) => columnVisibility[c.key]))
const columnItems = computed(() =>
  ALL_COLUMNS.map((c, i) => ({ key: c.key, label: t(c.label), disabled: i === 0 })),
)
function hideColumn(key: string) { columnVisibility[key] = false }

/** Rows flattened for sorting — useTableState sorts on plain top-level keys. */
const sortableRows = computed(() =>
  paginated.value.map((row) => ({
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
    suggestedQty: row.suggestion.purchaseQty,
  })),
)

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
  if (row.suggestion.cappedByMaxLevel) {
    return `${t('Order up to max level')} · ${row.suggestion.purchaseQty} ${vi.purchaseUnit} ${t('at PO')}`
  }
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
  if (!rows.length) {
    toast.notify({ variant: 'error', title: t('You must select at least one product'), maxWidth: 'max-content' })
    return
  }
  // A PO has one ship-to, so a selection spanning warehouses cannot be expressed.
  if (new Set(rows.map((r) => r.warehouseId)).size > 1) {
    toast.notify({ variant: 'error', title: t('Select products from a single warehouse'), maxWidth: 'max-content' })
    return
  }
  poRows.value = rows
  clearSelection = deselect ?? null
  poOpen.value = true
}

function selectedWorklistRows(sel: Set<number>): WorklistRow[] {
  // `sortableRows` is a same-order projection of `paginated`, so a selected index
  // maps straight back to the real row object.
  return [...sel].map((i) => paginated.value[i]).filter(Boolean) as WorklistRow[]
}

function bulkCreatePr(sel: Set<number>, deselectAll: () => void) {
  openPoForRows(selectedWorklistRows(sel), deselectAll)
}

function confirmPr(payload: {
  overrides: Record<string, number>
  vendorChoices: Record<string, string | null>
}) {
  const result = createPurchaseRequests(poRows.value, payload.overrides, payload.vendorChoices)
  poOpen.value = false
  clearSelection?.()
  clearSelection = null
  invalidateReplenishmentCaches()
  recalcTick.value++

  const created = result.created.length
  if (!created) {
    toast.notify({ variant: 'error', title: t('No purchase request could be created.'), maxWidth: 'max-content' })
    return
  }
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

function bulkMute(sel: Set<number>, deselectAll: () => void) {
  const rows = selectedWorklistRows(sel)
  if (!rows.length) return
  for (const row of rows) setTracked(row.sku, row.warehouseId, false)
  deselectAll()
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
    :rows="(sortableRows as unknown as Record<string, unknown>[])"
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
            <div class="stat-amount stat-amount--warning">{{ worklist.totals.due }}</div>
            <span class="stat-asof">{{ t('of') }} {{ worklist.totals.pairs }} {{ t('stocked products') }}</span>
          </div>
          <div class="stat-card stat-card--bordered">
            <div class="stat-title">{{ t('Stocks out before resupply') }}</div>
            <div class="stat-period">{{ t('Cover shorter than lead time') }}</div>
            <div class="stat-amount stat-amount--danger">{{ worklist.totals.belowLeadTime }}</div>
            <span class="stat-asof">{{ t('across all stocked products') }}</span>
          </div>
          <div class="stat-card stat-card--bordered">
            <div class="stat-title">{{ t('Needs setup') }}</div>
            <div class="stat-period">{{ t('Missing demand, lead time or vendor') }}</div>
            <div class="stat-amount">{{ worklist.totals.needsSetup }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-title">{{ t('No vendor') }}</div>
            <div class="stat-period">{{ t('Due but not orderable') }}</div>
            <div class="stat-amount">{{ worklist.totals.noVendor }}</div>
          </div>
        </div>
        <div class="rp-freshness">
          <span>{{ t('As of') }} {{ asOfLabel }}</span>
          <span v-if="lastRunLabel" class="rp-freshness-sep">·</span>
          <span v-if="lastRunLabel">{{ t('Last recalculated') }} {{ lastRunLabel }}</span>
          <a class="rp-freshness-link" @click="recalculate">
            {{ recalculating ? t('Recalculating…') : t('Recalculate') }}
          </a>
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
        <MpSelect
          id="rp-warehouse-select"
          :model-value="warehouseId"
          :class="css({ width: '220px' })"
          @update:model-value="(v: string) => setWarehouse(v)"
        >
          <option v-if="canSelectAll" :value="ALL_WAREHOUSES">{{ t('All warehouses') }}</option>
          <option v-for="wh in whOptions" :key="wh.id" :value="wh.id">{{ wh.name }}</option>
        </MpSelect>

        <!-- Short option labels, so a plain MpSelect is enough — the MpPopover
             idiom exists for labels that have to truncate. -->
        <MpSelect
          id="rp-fsn-select"
          :model-value="fsnFilter"
          :placeholder="t('FSN class')"
          is-clearable
          :class="css({ width: '170px' })"
          @update:model-value="(v: string) => { fsnFilter = v }"
        >
          <option v-for="o in FSN_OPTIONS" :key="o.id" :value="o.id">{{ t(o.name) }}</option>
        </MpSelect>

        <button class="filter-all-btn" type="button" @click="filtersOpen = true">
          <MpIcon name="filter" size="sm" />
          {{ t('All filters') }}<template v-if="drawerFilterCount"> ({{ drawerFilterCount }})</template>
        </button>
      </div>

      <div class="filter-right">
        <div class="filter-btn-group">
          <MpTooltip :label="t('Ask Airene')" placement="bottom">
            <button class="filter-icon-btn" type="button" :aria-label="t('Ask Airene')" @click="aireneToggle?.()">
              <MpIcon name="sparkle" size="md" />
            </button>
          </MpTooltip>
          <ColumnSettingsMenu
            id="rp-col-settings"
            :items="columnItems"
            :visibility="columnVisibility"
            :tooltip="t('Column settings')"
          />
          <MpTooltip :label="t('Export')" placement="bottom">
            <button
              class="filter-icon-btn"
              type="button"
              :aria-label="t('Export')"
              @click="infoToast(t('Export is not available in this prototype.'))"
            >
              <MpIcon name="download" size="md" />
            </button>
          </MpTooltip>
        </div>
        <div class="filter-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search product or SKU')" />
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
      <button
        class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm"
        @click="bulkCreatePr(selectedRows as Set<number>, deselectAll)"
      >{{ t('Request to purchase') }}</button>
      <button
        class="btn-enterprise btn-enterprise--ghost btn-enterprise--sm"
        @click="bulkMute(selectedRows as Set<number>, deselectAll)"
      >{{ t('Turn off tracking') }}</button>
    </template>

    <!-- ── Product ── -->
    <template #cell-productName="{ row }">
      <div class="rp-product">
        <img
          v-if="(row as any).img"
          class="rp-thumb"
          :src="(row as any).img"
          :alt="(row as any).productName"
          loading="lazy"
        />
        <span v-else class="rp-thumb rp-thumb--empty" />
        <span class="rp-product-text">
          <a class="cell-link rp-product-name" @click.stop="viewProduct((row as any).sku)">
            {{ (row as any).productName }}
          </a>
          <ClampText v-if="(row as any).productDesc" class="rp-product-sub" :text="(row as any).productDesc" />
        </span>
      </div>
    </template>

    <!-- ── FSN ── -->
    <template #cell-fsnClass="{ row }">
      <div class="rp-badges">
        <MpBadge
          for="additionalInformation"
          :type="FSN_BADGE[(row as any).fsn.committed]?.type ?? 'announcement'"
        >{{ t(FSN_BADGE[(row as any).fsn.committed]?.label ?? 'Unclassified') }}</MpBadge>
        <MpBadge v-if="(row as any).flags.volatile" for="additionalInformation" type="information">
          {{ t('Volatile') }}
        </MpBadge>
      </div>
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
              ? `${t('Stocks out before resupply')} — ${t('lead time')} ${(row as any).leadTimeDays} ${t('days')}`
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
        <span v-if="adjustmentNote(row as unknown as WorklistRow)" class="rp-num-sub">
          {{ adjustmentNote(row as unknown as WorklistRow) }}
        </span>
      </div>
    </template>

    <!-- ── Vendor ── -->
    <template #cell-vendorName="{ row }">
      <template v-if="(row as any).vendor">
        <div class="rp-vendor">
          <span class="cell-text">{{ (row as any).vendor.name }}</span>
          <span v-if="(row as any).alternates.length" class="rp-num-sub">
            +{{ (row as any).alternates.length }}
            {{ (row as any).alternates.length === 1 ? t('more vendor') : t('more vendors') }}
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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
            </svg>
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
    @confirm="confirmPr"
    @assign-vendor="(sku) => { poOpen = false; openVendors(sku) }"
  />

  <SkuReplenishmentSettingsDrawer
    v-model:is-open="settingsOpen"
    :row="settingsRow"
    @saved="onSettingsSaved"
  />

  <VendorItemDrawer
    v-model:is-open="vendorOpen"
    :sku="vendorSku"
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
</template>

<style scoped>
/* ── Stats (mirrors ProductsPage exactly) ── */
.rp-stats-wrap { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.stats-section { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.stat-card {
  flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1);
  padding-right: var(--mp-spacing-6); align-self: stretch;
}
.stat-card--bordered { border-right: 1px solid var(--mp-border-default); }
.stat-title {
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  line-height: var(--mp-line-heights-md); white-space: nowrap;
}
.stat-period {
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-sm, 16px); white-space: nowrap;
}
.stat-amount {
  font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); line-height: var(--mp-line-heights-2xl, 32px); white-space: nowrap;
}
.stat-amount--warning { color: var(--mp-text-warning); }
.stat-amount--danger { color: var(--mp-text-danger); }
.stat-asof { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }

.rp-freshness {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}
.rp-freshness-sep { color: var(--mp-text-subtle); }
.rp-freshness-link { color: var(--mp-text-link); cursor: pointer; }

/* ── Filter bar (mirrored from CycleCountRecommendationPage) ── */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-2); margin-left: auto; }
.filter-btn-group { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.filter-icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default, var(--mp-text-secondary));
}
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
.filter-all-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-1\.5);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral); color: var(--mp-text-default);
  font-size: var(--mp-font-sizes-md); cursor: pointer;
}
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered); }
.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral); color: var(--mp-text-secondary); min-width: 220px;
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
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }

/* ── Row actions ── */
.row-kebab {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px); margin-left: auto;
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-text-secondary);
}
.row-kebab svg { display: block; width: var(--mp-sizes-5, 20px); height: var(--mp-sizes-5, 20px); }
.row-kebab:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-default); }

/* ── Product cell ── */
.rp-product { display: flex; align-items: flex-start; gap: var(--mp-spacing-3); min-width: 0; padding-right: var(--mp-spacing-2); }
.rp-thumb {
  flex-shrink: 0; width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px);
  border-radius: var(--mp-radii-sm); object-fit: cover;
  background: var(--mp-background-neutral-subtle); border: 1px solid var(--mp-border-default);
}
.rp-thumb--empty { display: inline-block; }
.rp-product-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.rp-product-name { color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rp-product-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); margin-top: 2px; }

/* ── Numeric two-line cells ── */
.rp-num { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.rp-num-value { color: var(--mp-text-default); white-space: nowrap; font-variant-numeric: tabular-nums; }
.rp-num-value--critical { color: var(--mp-text-danger); font-weight: var(--mp-font-weights-semi-bold); }
.rp-num-value--muted { color: var(--mp-text-subtle); }
.rp-num-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); text-align: right; }
.rp-num-sub--critical { color: var(--mp-text-danger); }

.rp-vendor { display: flex; flex-direction: column; min-width: 0; }
.rp-badges { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }

:deep(.erp-tr:hover .erp-td) { background: var(--mp-background-neutral); }

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
</style>
