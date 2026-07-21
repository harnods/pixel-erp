<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch, inject } from 'vue'
import {
  MpIcon, MpTooltip, MpSelect, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpCheckbox,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton, css, toast,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ClampText from '~/components/patterns/ClampText.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ApprovalLogModal from '~/components/patterns/ApprovalLogModal.vue'
import { formatDate, formatDateTime } from '~/utils/date'

function formatAging(startIso?: string, endIso?: string): string {
  if (!startIso) return '—'
  const start = new Date(startIso).getTime()
  const end = endIso ? new Date(endIso).getTime() : Date.now()
  const totalMin = Math.max(0, Math.floor((end - start) / 60000))
  const days = Math.floor(totalMin / 1440)
  const hrs  = Math.floor((totalMin % 1440) / 60)
  const min  = totalMin % 60
  if (days > 0) return hrs > 0 ? `${days}d ${hrs}h` : `${days}d`
  if (hrs > 0)  return min > 0 ? `${hrs}h ${min}m` : `${hrs}h`
  return `${min}m`
}
import {
  stockAdjustments, adjustmentWarehouseOptions, adjustmentMemo, adjustmentUpdatedBy, adjustmentUpdatedAt,
  adjustmentApprovalLog, canCancelAdjustment, cancelAdjustment, approveAdjustment, ADJUSTMENT_CATEGORIES,
  type StockAdjustment, type ApprovalLog,
} from '~/data/stockAdjustments'
import {
  wmsStockAdjustments, wmsAdjustmentWarehouseOptions, canCancelWmsAdjustment, cancelWmsAdjustment, startWmsCount,
} from '~/data/wmsStockAdjustments'
import { useApprovalViewAs } from '~/composables/useApprovalViewAs'

const route = useRoute()
const router = useRouter()
const toggleAirene = inject<() => void>('toggleAirene')

const { currentPageKey } = useNavigation()
// WMS sub-pages use their own data store; ERP uses the shared stock adjustments store.
const kindFilter = computed<'count' | 'in-out' | null>(() => {
  if (currentPageKey.value === 'Cycle counts') return 'count'
  if (currentPageKey.value === 'Stock counts') return 'count'
  if (currentPageKey.value === 'Stock inout') return 'in-out'
  return null
})
// Only Cycle counts and Stock inout pages use the WMS dataset; Stock counts is ERP.
const isWmsPage  = computed(() => currentPageKey.value === 'Cycle counts' || currentPageKey.value === 'Stock inout')
// ERP Stock counts is a unified stock-adjustment ledger (count + in/out together) —
// unlike WMS Cycle counts, it doesn't restrict to kind==='count' or show task fields.
const isErpStockCounts = computed(() => currentPageKey.value === 'Stock counts')
const activeList    = computed(() => isWmsPage.value ? wmsStockAdjustments : stockAdjustments)
const activeWhOpts  = computed(() => isWmsPage.value ? wmsAdjustmentWarehouseOptions() : adjustmentWarehouseOptions())
function canCancel(a: StockAdjustment): boolean { return isWmsPage.value ? canCancelWmsAdjustment(a) : canCancelAdjustment(a) }
function activeCancel(ids: string[]): void {
  const fn = isWmsPage.value ? cancelWmsAdjustment : cancelAdjustment
  for (const id of ids) fn(id)
}

// ─── Approval view — demo toggle: "As user" (no Approve) vs "As manager" ──────
const { viewAs, setViewAs } = useApprovalViewAs()
const viewAsOptions: { value: 'user' | 'manager'; label: string }[] = [
  { value: 'user', label: 'As user' },
  { value: 'manager', label: 'As manager' },
]

// ─── Columns (checkbox is rendered by ErpTablePage as the first column) ──────────
const columns: TableColumn[] = [
  { key: 'number',        label: 'Number',       width: '230px', sortable: true, sortType: 'text' },
  { key: 'date',          label: 'Date',         width: '130px', sortable: true, sortType: 'date' },
  { key: 'warehouseName', label: 'Warehouse',    width: '200px', sortType: 'text' },
  { key: 'category',      label: 'Category',     width: '170px', sortType: 'text' },
  { key: 'account',       label: 'Account',      width: '190px', sortType: 'text' },
  { key: 'tags',          label: 'Tags',         width: '200px' },
  { key: 'lastUpdated',   label: 'Last updated', width: '220px' },
  { key: 'startDate',     label: 'Start date',   width: '170px', sortType: 'date' },
  { key: 'endDate',       label: 'End date',     width: '200px', sortType: 'date' },
  { key: 'assignee',      label: 'Assignee',     width: '160px', sortType: 'text' },
  { key: 'status',        label: 'Status',       width: '130px', sortType: 'text' },
]

// Column show/hide — first column stays on; the sort menu's "Hide column" flips
// these off, the ColumnSettings menu turns them back on. "Last updated" is opt-in
// (off by default); "Memo" is a settings-only toggle — not its own column, it
// surfaces the memo under the adjustment number.
const colVis = reactive<Record<string, boolean>>({
  ...Object.fromEntries(columns.map(c => [c.key, true])),
  lastUpdated: kindFilter.value === 'in-out',
  memo: false,
})
const visibleColumns = computed(() =>
  columns.filter(c =>
    colVis[c.key]
    && !(kindFilter.value && c.key === 'account')
    && !(kindFilter.value === 'count' && !isErpStockCounts.value && c.key === 'category')
    && !(kindFilter.value === 'count' && !isErpStockCounts.value && c.key === 'tags')
    && !(kindFilter.value === 'count' && !isErpStockCounts.value && !isAwaiting.value && c.key === 'date')
    && !((kindFilter.value !== 'count' || isErpStockCounts.value) && (c.key === 'assignee' || c.key === 'status' || c.key === 'startDate' || c.key === 'endDate'))
    && !(isAwaiting.value && kindFilter.value === 'count' && (c.key === 'startDate' || c.key === 'endDate' || c.key === 'assignee'))
  )
)
// "Memo" sits directly under "Number" — it surfaces the memo beneath the number cell.
const columnItems = [
  { key: 'number', label: 'Number', disabled: true },
  { key: 'memo', label: 'Memo' },
  ...columns.slice(1).map(c => ({ key: c.key, label: c.label })),
]
function hideColumn(key: string) { colVis[key] = false }

// ─── Tab: "All stock adjustments" vs "Awaiting approval" (driven by ?tab=) ────────
const isAwaiting = computed(() => route.query.tab === 'Awaiting approval')
const showCheckbox = computed(() => !(isAwaiting.value && viewAs.value === 'user'))
const actionsWidth = computed(() => {
  if (!isAwaiting.value) return undefined
  return viewAs.value === 'manager' ? '236px' : '148px'
})

// ─── Demo scenario state (FAB) + first-load skeleton ─────────────────────────────
type DemoState = 'data' | 'empty'
const demoState = ref<DemoState>('data')
const demoStates: { value: DemoState; label: string }[] = [
  { value: 'data', label: 'With data' },
  { value: 'empty', label: 'Empty state' },
]
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })
function setDemoState(s: DemoState) {
  demoState.value = s
  if (s === 'data') { loading.value = true; setTimeout(() => { loading.value = false }, 1200) }
}

// ─── Warehouse / Category filters (independent MpSelect dropdowns) ────────────────
const warehouseFilter = ref<string[]>([])
const categoryFilter = ref<string[]>([])
const statusFilter = ref('')
const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed',   label: 'Completed'   },
]
const whOptions = computed(() => activeWhOpts.value)
const warehouseLabel = computed(() => {
  const n = warehouseFilter.value.length
  if (n === 0) return ''
  if (n === 1) return whOptions.value.find(o => o.value === warehouseFilter.value[0])?.label ?? ''
  return `${n} warehouses`
})
function toggleWarehouse(id: string) {
  const idx = warehouseFilter.value.indexOf(id)
  if (idx >= 0) warehouseFilter.value = warehouseFilter.value.filter(v => v !== id)
  else warehouseFilter.value = [...warehouseFilter.value, id]
}
const categoryLabel = computed(() => {
  const n = categoryFilter.value.length
  if (n === 0) return ''
  if (n === 1) return categoryFilter.value[0]
  return `${n} categories`
})
function toggleCategory(cat: string) {
  const idx = categoryFilter.value.indexOf(cat)
  if (idx >= 0) categoryFilter.value = categoryFilter.value.filter(v => v !== cat)
  else categoryFilter.value = [...categoryFilter.value, cat]
}

// ─── Rows (demo state → tab → warehouse/category filter; search handled below) ────
const baseRows = computed<StockAdjustment[]>(() => {
  if (demoState.value === 'empty') return []
  let list = [...activeList.value]
  if (isAwaiting.value) list = list.filter(a => a.status === 'draft')
  else list = list.filter(a => a.status !== 'draft')
  if (kindFilter.value && !isErpStockCounts.value) list = list.filter(a => a.kind === kindFilter.value)
  if (warehouseFilter.value.length) list = list.filter(a => warehouseFilter.value.includes(a.warehouseId))
  if (categoryFilter.value.length) list = list.filter(a => categoryFilter.value.includes(a.category))
  if (statusFilter.value) list = list.filter(a => a.status === statusFilter.value)
  return list
})

const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<StockAdjustment>(baseRows, {
  filterFn: (row, s) =>
    !s
    || row.number.toLowerCase().includes(s)
    || row.warehouseName.toLowerCase().includes(s)
    || row.category.toLowerCase().includes(s)
    || (!kindFilter.value && row.account.toLowerCase().includes(s))
    || (kindFilter.value === 'count' && (row.assignee ?? '').toLowerCase().includes(s)),
})

const hasActiveFilter = computed(() => !!search.value || warehouseFilter.value.length > 0 || categoryFilter.value.length > 0 || !!statusFilter.value)
function clearFilters() { search.value = ''; warehouseFilter.value = []; categoryFilter.value = []; statusFilter.value = '' }
watch([warehouseFilter, categoryFilter, statusFilter, isAwaiting], () => setPage(1))

// ─── Row actions ─────────────────────────────────────────────────────────────────
function viewDetails(row: StockAdjustment) { router.push(`/stock-adjustments/${row.id}`) }
function editAdjustment(row: StockAdjustment) { router.push(`/stock-adjustments/${row.id}/edit`) }
function viewWarehouse(id: string) { router.push(`/warehouses/${id}`) }
// WMS cycle counts only — Stock counts (ERP) and Stock in/out have no counting flow.
function startCountingAndNavigate(row: StockAdjustment) {
  if (row.status === 'not_started') startWmsCount(row.id)
  router.push(`/stock-adjustments/${row.id}/count`)
}
function newAdjustment(kind: 'count' | 'in-out') {
  router.push({ path: '/stock-adjustments/new', query: { type: kind } })
}
function approve(row: StockAdjustment) {
  approveAdjustment(row.id)
  toast.notify({ variant: 'success', title: `${row.number} approved` , maxWidth: 'max-content'})
}

// ─── Approval log modal ──────────────────────────────────────────────────────
const approvalLogSubject = ref('')
const approvalLogData = ref<ApprovalLog | null>(null)
const approvalLogOpen = ref(false)
function openApprovalLog(row: StockAdjustment) {
  approvalLogSubject.value = row.number
  approvalLogData.value = adjustmentApprovalLog(row)
  approvalLogOpen.value = true
}

// ─── Bulk approve (Awaiting approval tab, manager view) ──────────────────────
function selectedAdjustmentsOf(sel: Set<number>): StockAdjustment[] {
  return [...sel].map(i => paginated.value[i]).filter(Boolean) as StockAdjustment[]
}
function bulkApprove(sel: Set<number>, deselectAll: () => void) {
  const rows = selectedAdjustmentsOf(sel)
  for (const row of rows) approveAdjustment(row.id)
  deselectAll()
  toast.notify({ variant: 'success', title: `${rows.length} adjustment${rows.length > 1 ? 's' : ''} approved` , maxWidth: 'max-content'})
}

// ─── Cancel (row kebab + bulk) → confirmation modal ────────────────────────────────
// Only draft (ERP) / not-started-or-in-progress cycle counts (WMS) are cancelable —
// once approved/finished, real stock has already been applied (approveAdjustment /
// finishWmsCount), so there's nothing left to safely void.
function cancelableSelection(sel: Set<number>): StockAdjustment[] {
  return selectedAdjustmentsOf(sel).filter(canCancel)
}
function bulkCancelable(sel: Set<number>): boolean {
  return cancelableSelection(sel).length > 0
}
const cancelOpen = ref(false)
const cancelIds = ref<string[]>([])
let _bulkDeselect: (() => void) | null = null
function askCancelRow(row: StockAdjustment) {
  cancelIds.value = [row.id]
  _bulkDeselect = null
  cancelOpen.value = true
}
function askBulkCancel(sel: Set<number>, deselectAll: () => void) {
  cancelIds.value = cancelableSelection(sel).map(a => a.id)
  _bulkDeselect = deselectAll
  cancelOpen.value = true
}
function confirmCancel() {
  const n = cancelIds.value.length
  activeCancel(cancelIds.value)
  _bulkDeselect?.()
  cancelOpen.value = false
  toast.notify({ variant: 'success', title: `${n} adjustment${n > 1 ? 's' : ''} canceled`, maxWidth: 'max-content' })
}

const emptyIllustration = '/illustrations/empty-folder.png'
</script>

<template>
  <ErpTablePage
    :columns="visibleColumns"
    :rows="(paginated as Record<string, unknown>[])"
    :total="total"
    :current-page="currentPage"
    :per-page="perPage"
    :sort-key="sortKey"
    :sort-dir="sortDir"
    :loading="loading"
    :has-active-filter="hasActiveFilter"
    :actions-width="actionsWidth"
    :has-checkbox="showCheckbox"
    :bulk-label="kindFilter === 'count' ? 'stock count' : kindFilter === 'in-out' ? 'stock in/out' : 'stock adjustment'"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
  >
    <!-- ── Filter bar ── -->
    <template #filters>
      <div class="filter-left">
        <!-- Warehouse — multi-select (checkbox list, mirrors OutgoingIndexPage's Status filter) -->
        <MpPopover id="sa-warehouse-filter" :is-close-on-select="false">
          <MpPopoverTrigger>
            <MpSelect
              id="sa-warehouse-select" placeholder="Warehouse"
              :model-value="warehouseFilter.length ? '__selected__' : undefined" is-clearable
              :class="css({ width: '180px' })" @mousedown.prevent @clear="warehouseFilter = []"
            >
              <option v-if="warehouseFilter.length" value="__selected__">{{ warehouseLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', maxWidth: '320px' })">
            <div class="checkbox-filter-list">
              <label v-for="opt in whOptions" :key="opt.value" class="checkbox-filter-item">
                <MpCheckbox
                  :id="`sa-wh-${opt.value}`"
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

        <!-- Category — multi-select (hidden for WMS stock count; shown for ERP Stock counts, which mixes count + in/out) -->
        <MpPopover v-if="kindFilter !== 'count' || isErpStockCounts" id="sa-category-filter" :is-close-on-select="false">
          <MpPopoverTrigger>
            <MpSelect
              id="sa-category-select" placeholder="Category"
              :model-value="categoryFilter.length ? '__selected__' : undefined" is-clearable
              :class="css({ width: '180px' })" @mousedown.prevent @clear="categoryFilter = []"
            >
              <option v-if="categoryFilter.length" value="__selected__">{{ categoryLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', maxWidth: '320px' })">
            <div class="checkbox-filter-list">
              <label v-for="opt in ADJUSTMENT_CATEGORIES" :key="opt" class="checkbox-filter-item">
                <MpCheckbox
                  :id="`sa-cat-${opt}`"
                  :is-checked="categoryFilter.includes(opt)"
                  @change="toggleCategory(opt)"
                  @click.stop
                >
                  {{ opt }}
                </MpCheckbox>
              </label>
            </div>
          </MpPopoverContent>
        </MpPopover>

        <!-- Status (WMS stock count only) -->
        <MpPopover v-if="kindFilter === 'count' && !isErpStockCounts" id="sa-status-filter" is-close-on-select>
          <MpPopoverTrigger>
            <MpSelect
              id="sa-status-select" placeholder="Status" :model-value="statusFilter" is-clearable
              :class="css({ width: '150px' })" @mousedown.prevent @clear="statusFilter = ''"
            >
              <option v-if="statusFilter" :value="statusFilter">{{ STATUS_OPTIONS.find(o => o.value === statusFilter)?.label }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', maxWidth: '320px' })">
            <MpPopoverList>
              <MpPopoverListItem
                v-for="opt in STATUS_OPTIONS" :key="opt.value"
                :is-active="opt.value === statusFilter" @click="statusFilter = opt.value"
              >{{ opt.label }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <button class="filter-all-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 6h18M7 12h10M11 18h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          All filters
        </button>
      </div>

      <div class="filter-right">
        <div class="filter-btn-group">
          <MpTooltip id="tt-sa-airene" label="Ask Airene" placement="bottom" use-portal>
            <button class="filter-icon-btn filter-icon-btn--airene" aria-label="Ask Airene" @click="toggleAirene?.()">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
              </svg>
            </button>
          </MpTooltip>
          <ColumnSettingsMenu id="sa-col-settings" :items="columnItems" :visibility="colVis" />
          <MpTooltip id="tt-sa-export" label="Export" placement="bottom" use-portal>
            <button class="filter-icon-btn" aria-label="Export"><MpIcon name="download" size="md" /></button>
          </MpTooltip>
        </div>
        <div class="filter-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input v-model="search" class="filter-search-input" type="text" placeholder="Search..." />
          <button v-if="search" class="search-clear-btn" type="button" aria-label="Clear search" @click="search = ''">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>
    </template>

    <!-- ── Bulk bar → approve (manager, awaiting tab) + cancel ── -->
    <template #bulk-actions="{ deselectAll, selectedRows }">
      <button
        v-if="isAwaiting && viewAs === 'manager'"
        class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm"
        @click="bulkApprove(selectedRows as Set<number>, deselectAll)"
      >
        Approve
      </button>
      <button
        v-if="bulkCancelable(selectedRows as Set<number>)"
        class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm"
        :class="css({ color: 'var(--mp-text-critical)' })"
        @click="askBulkCancel(selectedRows as Set<number>, deselectAll)"
      >
        Cancel
      </button>
    </template>

    <!-- ── Number — View details chip on hover; memo below when the toggle is on ── -->
    <template #cell-number="{ value, row }">
      <div class="sa-number-cell">
        <div class="cell-with-action">
          <span class="cell-text sa-link">{{ value }}</span>
          <button class="row-hover-btn" @click.stop="viewDetails(row as unknown as StockAdjustment)">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span class="row-hover-btn__label">VIEW DETAILS</span>
          </button>
        </div>
        <ClampText v-if="colVis.memo" :text="adjustmentMemo(row as unknown as StockAdjustment)" :lines="2" class="sa-memo" />
      </div>
    </template>

    <template #cell-date="{ value }">{{ formatDate(value as string) }}</template>

    <!-- ── Warehouse — View details chip → warehouse detail ── -->
    <template #cell-warehouseName="{ value, row }">
      <div class="cell-with-action">
        <span class="cell-text">{{ value }}</span>
        <button class="row-hover-btn" @click.stop="viewWarehouse((row as unknown as StockAdjustment).warehouseId)">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="row-hover-btn__label">VIEW DETAILS</span>
        </button>
      </div>
    </template>

    <template #cell-tags="{ value }"><ErpTagList :tags="(value as string[])" /></template>

    <template #cell-startDate="{ value }">{{ value ? formatDateTime(value as string) : '—' }}</template>
    <template #cell-endDate="{ row }">
      <span class="sa-end">
        <span v-if="(row as unknown as StockAdjustment).endDate">{{ formatDateTime((row as unknown as StockAdjustment).endDate) }}</span>
        <span v-else class="sa-end__ongoing">—</span>
        <span v-if="(row as unknown as StockAdjustment).startDate" class="sa-aging">
          {{ formatAging((row as unknown as StockAdjustment).startDate, (row as unknown as StockAdjustment).endDate) }}
        </span>
      </span>
    </template>

    <template #cell-assignee="{ value }">{{ value ?? '—' }}</template>

    <template #cell-status="{ value }">
      <ErpStatusBadge :status="value as string" />
    </template>

    <!-- ── Last updated — timestamp + who (opt-in column) ── -->
    <template #cell-lastUpdated="{ row }">
      <div class="sa-updated">
        <span class="sa-updated-date">{{ formatDateTime(adjustmentUpdatedAt(row as unknown as StockAdjustment)) }}</span>
        <span class="sa-updated-by">{{ adjustmentUpdatedBy(row as unknown as StockAdjustment) }}</span>
      </div>
    </template>

    <!-- ── Actions ── -->
    <template #actions="{ row }">
      <!-- Awaiting approval, AS MANAGER — Approve + icon actions + kebab -->
      <div v-if="isAwaiting && viewAs === 'manager'" class="sa-approval-actions">
        <button
          class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm"
          @click.stop="approve(row as unknown as StockAdjustment)"
        >Approve</button>
        <MpTooltip :id="`sa-tt-log-${row.id}`" label="Approval log" placement="top" use-portal>
          <button class="row-icon-ghost" aria-label="Approval log" @click.stop="openApprovalLog(row as unknown as StockAdjustment)">
            <MpIcon name="task-todo" size="md" />
          </button>
        </MpTooltip>
        <MpTooltip :id="`sa-tt-comment-${row.id}`" label="Comments" placement="top" use-portal>
          <button class="row-icon-ghost" aria-label="Comments" @click.stop><MpIcon name="comment" size="md" /></button>
        </MpTooltip>
        <MpPopover :id="`sa-actions-${row.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <button class="row-kebab" aria-label="More actions">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
              </svg>
            </button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
            <MpPopoverList>
              <MpPopoverListItem @click="viewDetails(row as unknown as StockAdjustment)">View details</MpPopoverListItem>
              <MpPopoverListItem
                v-if="isWmsPage && kindFilter === 'count' && (row as unknown as StockAdjustment).status === 'not_started'"
                @click="startCountingAndNavigate(row as unknown as StockAdjustment)"
              >Start counting</MpPopoverListItem>
              <MpPopoverListItem
                v-else-if="isWmsPage && kindFilter === 'count' && (row as unknown as StockAdjustment).status === 'in_progress'"
                @click="startCountingAndNavigate(row as unknown as StockAdjustment)"
              >Continue counting</MpPopoverListItem>
              <MpPopoverListItem v-if="canCancel(row as unknown as StockAdjustment)" @click="editAdjustment(row as unknown as StockAdjustment)">Edit</MpPopoverListItem>
              <MpPopoverListItem
                v-if="canCancel(row as unknown as StockAdjustment)"
                :class="css({ color: 'var(--mp-text-critical)' })"
                @click="askCancelRow(row as unknown as StockAdjustment)"
              >Cancel</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>

      <!-- Awaiting approval, AS USER — Approval log + Comments + View details -->
      <div v-else-if="isAwaiting" class="sa-approval-actions">
        <MpTooltip :id="`sa-tt-log-${row.id}`" label="Approval log" placement="top" use-portal>
          <button class="row-icon-ghost" aria-label="Approval log" @click.stop="openApprovalLog(row as unknown as StockAdjustment)">
            <MpIcon name="task-todo" size="md" />
          </button>
        </MpTooltip>
        <MpTooltip :id="`sa-tt-comment-${row.id}`" label="Comments" placement="top" use-portal>
          <button class="row-icon-ghost" aria-label="Comments" @click.stop><MpIcon name="comment" size="md" /></button>
        </MpTooltip>
        <MpTooltip :id="`sa-tt-view-${row.id}`" label="View details" placement="top" use-portal>
          <button class="row-icon-ghost" aria-label="View details" @click.stop="viewDetails(row as unknown as StockAdjustment)">
            <svg width="20" height="20" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </MpTooltip>
      </div>

      <!-- All stock adjustments — kebab only -->
      <MpPopover v-else :id="`sa-actions-${row.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <button class="row-kebab" aria-label="More actions">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="viewDetails(row as unknown as StockAdjustment)">View details</MpPopoverListItem>
            <MpPopoverListItem v-if="canCancel(row as unknown as StockAdjustment)" @click="editAdjustment(row as unknown as StockAdjustment)">Edit</MpPopoverListItem>
            <MpPopoverListItem
              v-if="canCancel(row as unknown as StockAdjustment)"
              :class="css({ color: 'var(--mp-text-critical)' })"
              @click="askCancelRow(row as unknown as StockAdjustment)"
            >Cancel</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Full empty state (first run) ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">
          {{ kindFilter === 'count' ? 'No stock counts' : kindFilter === 'in-out' ? 'No stock in/out' : 'No stock adjustments' }}
        </p>
        <p class="empty-full-desc">
          {{ kindFilter === 'count' ? 'Record on-hand stock counts for your warehouse. Create your first stock count to get started.'
           : kindFilter === 'in-out' ? 'Record manual stock movements in or out of your warehouse. Create your first entry to get started.'
           : 'Correct on-hand stock from counts or manual in/out. Create your first stock adjustment to get started.' }}
        </p>
        <template v-if="kindFilter === 'count'">
          <button class="btn-enterprise btn-enterprise--secondary empty-full-cta" @click="newAdjustment('count')">New stock count</button>
        </template>
        <template v-else-if="kindFilter === 'in-out'">
          <button class="btn-enterprise btn-enterprise--secondary empty-full-cta" @click="newAdjustment('in-out')">New stock in/out</button>
        </template>
        <template v-else>
          <MpPopover id="sa-empty-new" is-close-on-select use-portal placement="bottom">
            <MpPopoverTrigger>
              <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-after empty-full-cta">
                New stock adjustment
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content' })">
              <MpPopoverList>
                <MpPopoverListItem @click="newAdjustment('count')">Stock count</MpPopoverListItem>
                <MpPopoverListItem @click="newAdjustment('in-out')">Stock in/out</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </template>
      </div>
    </template>
  </ErpTablePage>

  <!-- ── Cancel confirmation ── -->
  <MpModal
    id="sa-cancel" :is-open="cancelOpen" size="md"
    is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="cancelOpen = false"
  >
    <MpModalContent>
      <MpModalHeader>Cancel {{ cancelIds.length > 1 ? cancelIds.length + ' stock adjustments' : 'stock adjustment' }}?<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <p>{{ cancelIds.length > 1 ? 'These adjustments' : 'This adjustment' }} will be canceled and can no longer be approved. This can't be undone.</p>
      </MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--ghost" @click="cancelOpen = false">Keep {{ cancelIds.length > 1 ? 'adjustments' : 'adjustment' }}</button>
          <button class="btn-enterprise btn-enterprise--danger" @click="confirmCancel">Cancel {{ cancelIds.length > 1 ? 'adjustments' : 'adjustment' }}</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <ApprovalLogModal
    :is-open="approvalLogOpen"
    :subject="approvalLogSubject"
    :log="approvalLogData"
    @close="approvalLogOpen = false"
  />

  <!-- ── Demo scenario FAB (bottom-right) ── -->
  <MpPopover id="sa-demo-fab" is-close-on-select use-portal placement="top-end">
    <MpPopoverTrigger>
      <button class="demo-fab" aria-label="Change scenario state">
        <MpIcon name="sliders" size="md" color="icon.inverse" />
      </button>
    </MpPopoverTrigger>
    <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content' })">
      <p class="demo-fab-heading">Scenario state</p>
      <MpPopoverList>
        <MpPopoverListItem
          v-for="s in demoStates" :key="s.value"
          :is-active="s.value === demoState" @click="setDemoState(s.value)"
        >{{ s.label }}</MpPopoverListItem>
      </MpPopoverList>
      <div style="height:1px;background:var(--mp-border-default);margin:var(--mp-spacing-1) 0;" />
      <p class="demo-fab-heading">Approval view</p>
      <MpPopoverList>
        <MpPopoverListItem
          v-for="v in viewAsOptions" :key="v.value"
          :is-active="v.value === viewAs" @click="setViewAs(v.value)"
        >{{ v.label }}</MpPopoverListItem>
      </MpPopoverList>
    </MpPopoverContent>
  </MpPopover>
</template>

<style scoped>
/* Filter bar */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.filter-btn-group { display: flex; align-items: center; gap: var(--mp-spacing-1); }

.filter-all-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary); cursor: pointer; white-space: nowrap;
}
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered); }

.filter-icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-text-secondary); padding: var(--mp-spacing-2);
}
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
.filter-icon-btn--airene { color: var(--mp-airene-default); }

.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral); color: var(--mp-text-secondary); min-width: 200px;
}
.filter-search-input {
  flex: 1; border: none; background: transparent; outline: none;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-md);
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

/* Checkbox multi-select filter list (mirrors OutgoingIndexPage's status-filter-list) */
.checkbox-filter-list { display: flex; flex-direction: column; padding: var(--mp-spacing-1); }
.checkbox-filter-item {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) 10px; border-radius: var(--mp-radii-md);
  cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.checkbox-filter-item:hover { background: var(--mp-background-neutral-subtle); }

/* Cell hover chip */
.cell-with-action { position: relative; display: flex; align-items: center; width: 100%; min-width: 0; }
.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.sa-link { color: var(--mp-text-default); }

/* Number cell with optional memo underneath */
.sa-number-cell { display: flex; flex-direction: column; gap: var(--mp-spacing-1); min-width: 0; }
.sa-memo { max-width: 100%; }

/* Last updated cell — timestamp + who */
.sa-end { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.sa-end__ongoing { color: var(--mp-text-secondary); }
.sa-aging {
  display: inline-flex; align-items: center; padding: 0 var(--mp-spacing-1\.5);
  border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral-subtle, #f1f5f9);
  color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-lg, 20px); white-space: nowrap;
}

.sa-updated { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: 0; }
.sa-updated-date { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; }
.sa-updated-by { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.row-hover-btn {
  position: absolute; right: 0; top: var(--mp-spacing-2\.5, 10px); transform: translateY(-50%); display: none;
  align-items: center; gap: var(--mp-spacing-1\.5);
  padding: var(--mp-spacing-1) var(--mp-spacing-1\.5);
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-sm); cursor: pointer; white-space: nowrap; line-height: 1;
}
.row-hover-btn__label {
  font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xs, 12px); color: var(--mp-text-secondary); text-transform: uppercase;
}
:global(.erp-tr:hover .row-hover-btn) { display: flex; }

/* Kebab */
.row-kebab {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px); margin-left: auto;
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-text-secondary);
}
.row-kebab svg { display: block; width: var(--mp-sizes-5, 20px); height: var(--mp-sizes-5, 20px); }
.row-kebab:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-default); }

/* Empty state */
.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin-top: var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); max-width: 360px; text-align: center; }
.empty-full-cta { margin-top: var(--mp-spacing-4); }

/* Modal footer */
.modal-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-3); width: 100%; }

/* Awaiting approval row actions */
.sa-approval-actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-3); }
.sa-approval-actions .row-kebab { margin-left: 0; }
.row-icon-ghost {
  display: flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-5, 20px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-text-secondary); flex-shrink: 0;
}
.row-icon-ghost:hover { background: var(--mp-background-neutral-hovered); }

/* Demo scenario FAB */
.demo-fab {
  position: fixed; right: var(--mp-spacing-6); bottom: var(--mp-spacing-6);
  width: var(--mp-spacing-12, 48px); height: var(--mp-spacing-12, 48px);
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-inverse, #080d0e); color: #fff;
  cursor: pointer; z-index: 1200;
  box-shadow: 0 4px 6px -2px rgba(0,0,0,0.1), 0 10px 15px -3px rgba(0,0,0,0.2);
}
.demo-fab:hover { opacity: 0.9; }
.demo-fab-heading { padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
