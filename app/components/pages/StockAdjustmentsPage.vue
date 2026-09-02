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
import StockAdjustmentsFiltersDrawer, { type StockAdjustmentsFiltersValue } from '~/components/patterns/StockAdjustmentsFiltersDrawer.vue'
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
  adjustmentApprovalLog, adjustmentLineItems, canCancelAdjustment, cancelAdjustment, approveAdjustment, ADJUSTMENT_CATEGORIES,
  type StockAdjustment, type ApprovalLog,
} from '~/data/stockAdjustments'
import {
  wmsStockAdjustments, wmsAdjustmentWarehouseOptions, canCancelWmsAdjustment, cancelWmsAdjustment, startWmsCount, approveWmsAdjustment,
  canCloseWmsCount, closeWmsCount,
} from '~/data/wmsStockAdjustments'
import { useApprovalViewAs } from '~/composables/useApprovalViewAs'
import { useScenario } from '~/composables/useScenario'

const route = useRoute()
const router = useRouter()
const { t } = useLocale()
const toggleAirene = inject<() => void>('toggleAirene')

const { currentPageKey } = useNavigation()
// WMS sub-pages use their own data store; ERP uses the shared stock adjustments store.
// (/stock-counts is retired — pathToLabel() aliases it to "Stock adjustments", so
// this page never sees a "Stock counts" key any more.)
const kindFilter = computed<'count' | 'in-out' | null>(() => {
  if (currentPageKey.value === 'Cycle counts') return 'count'
  if (currentPageKey.value === 'Stock inout') return 'in-out'
  return null
})
const isWmsPage  = computed(() => currentPageKey.value === 'Cycle counts' || currentPageKey.value === 'Stock inout')
const activeList    = computed(() => isWmsPage.value ? wmsStockAdjustments : stockAdjustments)
const activeWhOpts  = computed(() => isWmsPage.value ? wmsAdjustmentWarehouseOptions() : adjustmentWarehouseOptions())
function canCancel(a: StockAdjustment): boolean { return isWmsPage.value ? canCancelWmsAdjustment(a) : canCancelAdjustment(a) }
function activeCancel(ids: string[]): void {
  const fn = isWmsPage.value ? cancelWmsAdjustment : cancelAdjustment
  for (const id of ids) fn(id)
}

// ─── Role — closing a cycle count task is a warehouse manager's call ─────────
// The WMS Ops / WMS Ops 2 scenarios preview a warehouse operator, who can count
// but never close someone's task; ERP and WMS Standalone preview the manager.
const { activeScenario } = useScenario()
const isWarehouseOperator = computed(() => activeScenario.value === 'WMS Ops' || activeScenario.value === 'WMS Ops 2')
const isCycleCounts = computed(() => currentPageKey.value === 'Cycle counts')
// Cycle counts swap the row/bulk "Cancel" action for "Close task" — same
// eligibility (not yet submitted for approval), manager-only.
function canCloseRow(row: StockAdjustment): boolean {
  return isCycleCounts.value && !isWarehouseOperator.value && canCloseWmsCount(row)
}

// ─── Approval view — demo toggle: "As user" (no Approve) vs "As manager" ──────
const { viewAs, setViewAs } = useApprovalViewAs()
const viewAsOptions: { value: 'user' | 'manager'; label: string }[] = [
  { value: 'user', label: t('As user') },
  { value: 'manager', label: t('As manager') },
]

// ─── Columns (checkbox is rendered by ErpTablePage as the first column) ──────────
const columns: TableColumn[] = [
  { key: 'number',        label: 'Number',       kind: 'number', sortable: true, sortType: 'text' },
  { key: 'date',          label: 'Date',         kind: 'date', sortable: true, sortType: 'date' },
  { key: 'warehouseName', label: 'Warehouse',    kind: 'name', sortType: 'text' },
  { key: 'category',      label: 'Category',     sortType: 'text' },
  { key: 'account',       label: 'Account',      kind: 'name', sortType: 'text' },
  { key: 'tags',          label: 'Tags',         kind: 'tags' },
  { key: 'lastUpdated',   label: 'Last updated', kind: 'date' },
  { key: 'totalSku',      label: 'Total SKU',    sortType: 'number', align: 'right' },
  { key: 'startDate',     label: 'Start date',   kind: 'date', sortType: 'date' },
  { key: 'endDate',       label: 'End date',     kind: 'date', sortType: 'date' },
  { key: 'assignee',      label: 'Assignee',     kind: 'name', sortType: 'text' },
  { key: 'status',        label: 'Status',       kind: 'status', sortType: 'text' },
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
    && !(kindFilter.value === 'count' && c.key === 'category')
    && !(kindFilter.value === 'count' && c.key === 'tags')
    && !(kindFilter.value === 'count' && !isAwaiting.value && c.key === 'date')
    && !(kindFilter.value !== 'count' && (c.key === 'assignee' || c.key === 'status' || c.key === 'startDate' || c.key === 'endDate'))
    && !(isAwaiting.value && kindFilter.value === 'count' && (c.key === 'startDate' || c.key === 'endDate' || c.key === 'assignee'))
    && !(c.key === 'totalSku' && currentPageKey.value !== 'Cycle counts')
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
// ERP's "Awaiting approval" (draft → manager approval) is a different workflow from
// Cycle counts' "Awaiting approval" (counted → manager review) — kept separate so
// the ERP-only manager UI (Approve button, approval log) never shows on Cycle counts,
// which reuses the exact same table as its "Count task" tab, just filtered by status.
const isAwaiting = computed(() => route.query.tab === 'Awaiting approval' && currentPageKey.value !== 'Cycle counts')
const isCycleAwaiting = computed(() => currentPageKey.value === 'Cycle counts' && route.query.tab === 'Awaiting approval')
// Drives the approval-actions UI (sticky actions column, Approve button, checkbox) —
// shared by both awaiting-approval flavors; column visibility stays keyed to
// `isAwaiting` alone so Cycle counts keeps the same columns as its Count task tab.
const isAnyAwaiting = computed(() => isAwaiting.value || isCycleAwaiting.value)
const showCheckbox = computed(() => !(isAnyAwaiting.value && viewAs.value === 'user'))
const actionsWidth = computed(() => {
  if (!isAnyAwaiting.value) return undefined
  return viewAs.value === 'manager' ? '236px' : '148px'
})

// ─── Demo scenario state (FAB) + first-load skeleton ─────────────────────────────
type DemoState = 'data' | 'empty'
const demoState = ref<DemoState>('data')
const demoStates: { value: DemoState; label: string }[] = [
  { value: 'data', label: t('With data') },
  { value: 'empty', label: t('Empty state') },
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
const statusFilter = ref<string[]>([])
const assigneeFilter = ref<string[]>([])
// 'counted' is a real, filterable state on the Count task tab — a counted task
// stays listed there (the operator who counted it can't see the Awaiting
// approval tab, so hiding it would make the task vanish for them) while also
// appearing under Awaiting approval for the manager to review. The Awaiting
// approval tab hides this filter entirely — every row there is already Counted.
const STATUS_OPTIONS = [
  { value: 'not_started', label: t('Open') },
  { value: 'in_progress', label: t('In progress') },
  { value: 'counted',     label: t('Counted')     },
  { value: 'completed',   label: t('Completed')   },
  { value: 'closed',      label: t('Closed')      },
]
const whOptions = computed(() => activeWhOpts.value)
const warehouseLabel = computed(() => {
  const n = warehouseFilter.value.length
  if (n === 0) return ''
  if (n === 1) return whOptions.value.find(o => o.value === warehouseFilter.value[0])?.label ?? ''
  return `${n} ${t('warehouses')}`
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
  return `${n} ${t('categories')}`
})
function toggleCategory(cat: string) {
  const idx = categoryFilter.value.indexOf(cat)
  if (idx >= 0) categoryFilter.value = categoryFilter.value.filter(v => v !== cat)
  else categoryFilter.value = [...categoryFilter.value, cat]
}
const statusLabel = computed(() => {
  const n = statusFilter.value.length
  if (n === 0) return ''
  if (n === 1) return STATUS_OPTIONS.find(o => o.value === statusFilter.value[0])?.label ?? ''
  return `${n} ${t('statuses')}`
})
function toggleStatus(id: string) {
  const idx = statusFilter.value.indexOf(id)
  if (idx >= 0) statusFilter.value = statusFilter.value.filter(v => v !== id)
  else statusFilter.value = [...statusFilter.value, id]
}

// ─── "All filters" drawer — wraps keyword/warehouse/assignee/status filters ───────
const isFiltersDrawerOpen = ref(false)
const drawerWarehouseOptions = computed(() => whOptions.value.map(o => ({ id: o.value, name: o.label })))
const drawerStatusOptions = computed(() => STATUS_OPTIONS.map(o => ({ id: o.value, name: o.label })))
const assigneeOptions = computed(() => {
  const names = new Set<string>()
  for (const a of activeList.value) { if (a.assignee) names.add(a.assignee) }
  return [...names].sort().map(name => ({ id: name, name }))
})
const drawerValue = computed<StockAdjustmentsFiltersValue>(() => ({
  keyword: search.value,
  warehouseIds: warehouseFilter.value,
  assignees: assigneeFilter.value,
  statuses: statusFilter.value,
}))
function applyDrawerFilters(v: StockAdjustmentsFiltersValue) {
  search.value = v.keyword
  warehouseFilter.value = v.warehouseIds
  assigneeFilter.value = v.assignees
  statusFilter.value = v.statuses
}

// ─── Rows (demo state → tab → warehouse/category filter; search handled below) ────
const baseRows = computed<StockAdjustment[]>(() => {
  if (demoState.value === 'empty') return []
  let list = [...activeList.value]
  if (isAwaiting.value) list = list.filter(a => a.status === 'draft')
  else if (isCycleAwaiting.value) list = list.filter(a => a.status === 'counted')
  // Cycle counts' "Count task" tab lists every task at every stage, Counted
  // included: a counted task also shows under Awaiting approval for the manager,
  // but the operator who counted it only has the Count task tab — dropping it
  // there would make the task disappear the moment they finished counting.
  else if (currentPageKey.value === 'Cycle counts') { /* no status filter */ }
  else list = list.filter(a => a.status !== 'draft')
  if (kindFilter.value) list = list.filter(a => a.kind === kindFilter.value)
  if (warehouseFilter.value.length) list = list.filter(a => warehouseFilter.value.includes(a.warehouseId))
  if (categoryFilter.value.length) list = list.filter(a => categoryFilter.value.includes(a.category))
  if (statusFilter.value.length) list = list.filter(a => statusFilter.value.includes(a.status))
  if (assigneeFilter.value.length) list = list.filter(a => a.assignee && assigneeFilter.value.includes(a.assignee))
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

const hasActiveFilter = computed(() => !!search.value || warehouseFilter.value.length > 0 || categoryFilter.value.length > 0 || statusFilter.value.length > 0 || assigneeFilter.value.length > 0)
function clearFilters() { search.value = ''; warehouseFilter.value = []; categoryFilter.value = []; statusFilter.value = []; assigneeFilter.value = [] }
watch([warehouseFilter, categoryFilter, statusFilter, assigneeFilter, isAwaiting, isCycleAwaiting], () => setPage(1))
// The Status filter is hidden on the Awaiting approval tab (every row is already
// "Counted") — drop any leftover value so it can't silently zero out the table.
watch(isCycleAwaiting, (v) => { if (v) statusFilter.value = [] })

// ─── Row actions ─────────────────────────────────────────────────────────────────
// WMS cycle count tasks live under /cycle-counts/:id (not /stock-adjustments/:id)
// so the sidebar and breadcrumb reflect where they actually belong.
function basePathFor(row: StockAdjustment): string {
  return (isWmsPage.value && row.kind === 'count') ? '/cycle-counts' : '/stock-adjustments'
}
// A Counted cycle count clicked from the Count task tab (not Awaiting approval)
// is the operator's own task, not a manager review — the detail page reads
// this flag to render like In progress (Update counting) instead of the
// manager review layout. Only meaningful for that exact case; harmless as a
// no-op query param otherwise.
function viewDetails(row: StockAdjustment) {
  const fromCountTask = isWmsPage.value && row.kind === 'count' && row.status === 'counted' && !isCycleAwaiting.value
  router.push({ path: `${basePathFor(row)}/${row.id}`, query: fromCountTask ? { from: 'count-task' } : undefined })
}
function editAdjustment(row: StockAdjustment) { router.push(`${basePathFor(row)}/${row.id}/edit`) }
function viewWarehouse(id: string) { router.push(`/warehouses/${id}`) }
// WMS cycle counts only — Stock adjustments and Stock in/out have no counting flow.
function startCountingAndNavigate(row: StockAdjustment) {
  if (row.status === 'not_started') startWmsCount(row.id)
  router.push(`${basePathFor(row)}/${row.id}/count`)
}
function newAdjustment(kind: 'count' | 'in-out') {
  router.push({ path: '/stock-adjustments/new', query: { type: kind } })
}
function activeApprove(id: string) { isWmsPage.value ? approveWmsAdjustment(id) : approveAdjustment(id) }
function approve(row: StockAdjustment) {
  activeApprove(row.id)
  toast.notify({ variant: 'success', title: `${row.number} ${t('approved')}` , maxWidth: 'max-content'})
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
  for (const row of rows) activeApprove(row.id)
  deselectAll()
  toast.notify({ variant: 'success', title: `${rows.length} ${t('adjustment')}${rows.length > 1 ? 's' : ''} ${t('approved')}` , maxWidth: 'max-content'})
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
  toast.notify({ variant: 'success', title: `${n} ${t('adjustment')}${n > 1 ? 's' : ''} ${t('canceled')}`, maxWidth: 'max-content' })
}

// ─── Close task (Cycle counts, manager only) → confirmation modal ─────────────
// Distinct from Cancel: any quantities counted so far are discarded and the task
// becomes a terminal, read-only "Closed" record — same action as the one on the
// count task's detail page.
function closableSelection(sel: Set<number>): StockAdjustment[] {
  return selectedAdjustmentsOf(sel).filter(canCloseRow)
}
function bulkClosable(sel: Set<number>): boolean {
  return closableSelection(sel).length > 0
}
const closeOpen = ref(false)
const closeIds = ref<string[]>([])
let _closeDeselect: (() => void) | null = null
function askCloseRow(row: StockAdjustment) {
  closeIds.value = [row.id]
  _closeDeselect = null
  closeOpen.value = true
}
function askBulkClose(sel: Set<number>, deselectAll: () => void) {
  closeIds.value = closableSelection(sel).map(a => a.id)
  _closeDeselect = deselectAll
  closeOpen.value = true
}
function confirmClose() {
  const n = closeIds.value.length
  for (const id of closeIds.value) closeWmsCount(id)
  _closeDeselect?.()
  closeOpen.value = false
  toast.notify({ variant: 'success', title: `${n} ${n > 1 ? t('tasks') : t('task')} ${t('closed')}`, maxWidth: 'max-content' })
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
    :search="search"
    :actions-width="actionsWidth"
    :sticky-actions="!isCycleAwaiting"
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
              id="sa-warehouse-select" :placeholder="t('Warehouse')"
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

        <!-- Category — multi-select (hidden for WMS stock count) -->
        <MpPopover v-if="kindFilter !== 'count'" id="sa-category-filter" :is-close-on-select="false">
          <MpPopoverTrigger>
            <MpSelect
              id="sa-category-select" :placeholder="t('Category')"
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

        <!-- Status — multi-select (WMS stock count only; not on the Awaiting approval tab — every row there is already "Counted") -->
        <MpPopover v-if="kindFilter === 'count' && !isCycleAwaiting" id="sa-status-filter" :is-close-on-select="false">
          <MpPopoverTrigger>
            <MpSelect
              id="sa-status-select" :placeholder="t('Status')"
              :model-value="statusFilter.length ? '__selected__' : undefined" is-clearable
              :class="css({ width: '150px' })" @mousedown.prevent @clear="statusFilter = []"
            >
              <option v-if="statusFilter.length" value="__selected__">{{ statusLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', maxWidth: '320px' })">
            <div class="checkbox-filter-list">
              <label v-for="opt in STATUS_OPTIONS" :key="opt.value" class="checkbox-filter-item">
                <MpCheckbox
                  :id="`sa-status-${opt.value}`"
                  :is-checked="statusFilter.includes(opt.value)"
                  @change="toggleStatus(opt.value)"
                  @click.stop
                >
                  {{ opt.label }}
                </MpCheckbox>
              </label>
            </div>
          </MpPopoverContent>
        </MpPopover>

        <button class="filter-all-btn" type="button" @click="isFiltersDrawerOpen = true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 6h18M7 12h10M11 18h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          {{ t('All filters') }}
        </button>
      </div>

      <div class="filter-right">
        <div class="filter-btn-group">
          <MpTooltip id="tt-sa-airene" :label="t('Ask Airene')" placement="bottom" use-portal>
            <button class="filter-icon-btn filter-icon-btn--airene" :aria-label="t('Ask Airene')" @click="toggleAirene?.()">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
              </svg>
            </button>
          </MpTooltip>
          <ColumnSettingsMenu id="sa-col-settings" :items="columnItems" :visibility="colVis" />
          <MpTooltip id="tt-sa-export" :label="t('Export')" placement="bottom" use-portal>
            <button class="filter-icon-btn" :aria-label="t('Export')"><MpIcon name="download" size="md" /></button>
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
    </template>

    <!-- ── Bulk bar → approve (manager, awaiting tab) + cancel / close task ── -->
    <template #bulk-actions="{ deselectAll, selectedRows }">
      <button
        v-if="isAnyAwaiting && viewAs === 'manager'"
        class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm"
        @click="bulkApprove(selectedRows as Set<number>, deselectAll)"
      >
        {{ t('Approve') }}
      </button>
      <button
        v-if="isCycleCounts ? bulkClosable(selectedRows as Set<number>) : false"
        class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm"
        :class="css({ color: 'var(--mp-text-critical)' })"
        @click="askBulkClose(selectedRows as Set<number>, deselectAll)"
      >
        {{ t('Close task') }}
      </button>
      <button
        v-if="!isCycleCounts && bulkCancelable(selectedRows as Set<number>)"
        class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm"
        :class="css({ color: 'var(--mp-text-critical)' })"
        @click="askBulkCancel(selectedRows as Set<number>, deselectAll)"
      >
        {{ t('Cancel') }}
      </button>
    </template>

    <!-- ── Number — View details chip on hover; memo below when the toggle is on ── -->
    <template #cell-number="{ value, row }">
      <div class="sa-number-cell">
        <a class="cell-link cell-text sa-link" @click.stop="viewDetails(row as unknown as StockAdjustment)">{{ value }}</a>
        <ClampText v-if="colVis.memo" :text="adjustmentMemo(row as unknown as StockAdjustment)" :lines="2" class="sa-memo" />
      </div>
    </template>

    <template #cell-date="{ value }">{{ formatDate(value as string) }}</template>

    <!-- ── Warehouse — View details chip → warehouse detail ── -->
    <template #cell-warehouseName="{ value, row }">
      <a class="cell-link cell-text" @click.stop="viewWarehouse((row as unknown as StockAdjustment).warehouseId)">{{ value }}</a>
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

    <template #cell-totalSku="{ row }">{{ adjustmentLineItems(row as unknown as StockAdjustment).length }}</template>

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
      <div v-if="isAnyAwaiting && viewAs === 'manager'" class="sa-approval-actions">
        <button
          class="btn-enterprise btn-enterprise--secondary"
          :class="isCycleAwaiting ? 'btn-enterprise--xs' : 'btn-enterprise--sm'"
          @click.stop="approve(row as unknown as StockAdjustment)"
        >{{ t('Approve') }}</button>
        <!-- Cycle counts ship without approval log / comments for now — Approve only. -->
        <MpTooltip v-if="!isCycleAwaiting" :id="`sa-tt-log-${row.id}`" :label="t('Approval log')" placement="top" use-portal>
          <button class="row-icon-ghost" :aria-label="t('Approval log')" @click.stop="openApprovalLog(row as unknown as StockAdjustment)">
            <MpIcon name="task-todo" size="md" />
          </button>
        </MpTooltip>
        <MpTooltip v-if="!isCycleAwaiting" :id="`sa-tt-comment-${row.id}`" :label="t('Comments')" placement="top" use-portal>
          <button class="row-icon-ghost" :aria-label="t('Comments')" @click.stop><MpIcon name="comment" size="md" /></button>
        </MpTooltip>
        <MpPopover :id="`sa-actions-${row.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <button class="row-kebab" :aria-label="t('More actions')">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
              </svg>
            </button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
            <MpPopoverList>
              <MpPopoverListItem @click="viewDetails(row as unknown as StockAdjustment)">{{ t('View details') }}</MpPopoverListItem>
              <MpPopoverListItem
                v-if="isWmsPage && kindFilter === 'count' && (row as unknown as StockAdjustment).status === 'not_started'"
                @click="startCountingAndNavigate(row as unknown as StockAdjustment)"
              >{{ t('Start counting') }}</MpPopoverListItem>
              <MpPopoverListItem
                v-else-if="isWmsPage && kindFilter === 'count' && (row as unknown as StockAdjustment).status === 'in_progress'"
                @click="startCountingAndNavigate(row as unknown as StockAdjustment)"
              >{{ t('Continue counting') }}</MpPopoverListItem>
              <MpPopoverListItem v-if="canCancel(row as unknown as StockAdjustment)" @click="editAdjustment(row as unknown as StockAdjustment)">{{ t('Edit') }}</MpPopoverListItem>
              <MpPopoverListItem
                v-if="canCloseRow(row as unknown as StockAdjustment)"
                :class="css({ color: 'var(--mp-text-critical)' })"
                @click="askCloseRow(row as unknown as StockAdjustment)"
              >{{ t('Close task') }}</MpPopoverListItem>
              <MpPopoverListItem
                v-if="!isCycleCounts && canCancel(row as unknown as StockAdjustment)"
                :class="css({ color: 'var(--mp-text-critical)' })"
                @click="askCancelRow(row as unknown as StockAdjustment)"
              >{{ t('Cancel') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>

      <!-- Awaiting approval, AS USER — Approval log + Comments + View details -->
      <div v-else-if="isAnyAwaiting" class="sa-approval-actions">
        <!-- Cycle counts ship without approval log / comments for now — View details only. -->
        <MpTooltip v-if="!isCycleAwaiting" :id="`sa-tt-log-${row.id}`" :label="t('Approval log')" placement="top" use-portal>
          <button class="row-icon-ghost" :aria-label="t('Approval log')" @click.stop="openApprovalLog(row as unknown as StockAdjustment)">
            <MpIcon name="task-todo" size="md" />
          </button>
        </MpTooltip>
        <MpTooltip v-if="!isCycleAwaiting" :id="`sa-tt-comment-${row.id}`" :label="t('Comments')" placement="top" use-portal>
          <button class="row-icon-ghost" :aria-label="t('Comments')" @click.stop><MpIcon name="comment" size="md" /></button>
        </MpTooltip>
        <MpTooltip :id="`sa-tt-view-${row.id}`" :label="t('View details')" placement="top" use-portal>
          <button class="row-icon-ghost" :aria-label="t('View details')" @click.stop="viewDetails(row as unknown as StockAdjustment)">
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
          <button class="row-kebab" :aria-label="t('More actions')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="viewDetails(row as unknown as StockAdjustment)">{{ t('View details') }}</MpPopoverListItem>
            <MpPopoverListItem v-if="canCancel(row as unknown as StockAdjustment)" @click="editAdjustment(row as unknown as StockAdjustment)">{{ t('Edit') }}</MpPopoverListItem>
            <MpPopoverListItem
              v-if="canCloseRow(row as unknown as StockAdjustment)"
              :class="css({ color: 'var(--mp-text-critical)' })"
              @click="askCloseRow(row as unknown as StockAdjustment)"
            >{{ t('Close task') }}</MpPopoverListItem>
            <MpPopoverListItem
              v-if="!isCycleCounts && canCancel(row as unknown as StockAdjustment)"
              :class="css({ color: 'var(--mp-text-critical)' })"
              @click="askCancelRow(row as unknown as StockAdjustment)"
            >{{ t('Cancel') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Full empty state (first run) ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">
          {{ kindFilter === 'count' ? t('No stock counts') : kindFilter === 'in-out' ? t('No stock in/out') : t('No stock adjustments') }}
        </p>
        <p class="empty-full-desc">
          {{ kindFilter === 'count' ? t('Record on-hand stock counts for your warehouse. Create your first stock count to get started.')
           : kindFilter === 'in-out' ? t('Record manual stock movements in or out of your warehouse. Create your first entry to get started.')
           : t('Correct on-hand stock from counts or manual in/out. Create your first stock adjustment to get started.') }}
        </p>
        <template v-if="kindFilter === 'count'">
          <button class="btn-enterprise btn-enterprise--secondary empty-full-cta" @click="newAdjustment('count')">{{ t('New stock count') }}</button>
        </template>
        <template v-else-if="kindFilter === 'in-out'">
          <button class="btn-enterprise btn-enterprise--secondary empty-full-cta" @click="newAdjustment('in-out')">{{ t('New stock in/out') }}</button>
        </template>
        <template v-else>
          <MpPopover id="sa-empty-new" is-close-on-select use-portal placement="bottom">
            <MpPopoverTrigger>
              <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-after empty-full-cta">
                {{ t('New stock adjustment') }}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content' })">
              <MpPopoverList>
                <MpPopoverListItem @click="newAdjustment('count')">{{ t('Stock count') }}</MpPopoverListItem>
                <MpPopoverListItem @click="newAdjustment('in-out')">{{ t('Stock in/out') }}</MpPopoverListItem>
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
      <MpModalHeader>{{ t('Cancel') }} {{ cancelIds.length > 1 ? cancelIds.length + ' ' + t('stock adjustments') : t('stock adjustment') }}?<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <p>{{ cancelIds.length > 1 ? t('These adjustments') : t('This adjustment') }} {{ t('will be canceled and can no longer be approved. This cannot be undone.') }}</p>
      </MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--ghost" @click="cancelOpen = false">{{ t('Keep') }} {{ cancelIds.length > 1 ? t('adjustments') : t('adjustment') }}</button>
          <button class="btn-enterprise btn-enterprise--danger" @click="confirmCancel">{{ t('Cancel') }} {{ cancelIds.length > 1 ? t('adjustments') : t('adjustment') }}</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <!-- ── Close task confirmation (Cycle counts) ── -->
  <MpModal
    id="sa-close" :is-open="closeOpen" size="md"
    is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="closeOpen = false"
  >
    <MpModalContent>
      <MpModalHeader>{{ closeIds.length > 1 ? `${t('Close')} ${closeIds.length} ${t('count tasks')}?` : t('Close this count task?') }}<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <p>{{ t("Counted data will be canceled and can't be resumed. This task will become read-only with a Closed status.") }}</p>
      </MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--ghost" @click="closeOpen = false">{{ t('Cancel') }}</button>
          <button class="btn-enterprise btn-enterprise--danger" @click="confirmClose">{{ t('Close') }}</button>
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

  <!-- ── All filters drawer ── -->
  <StockAdjustmentsFiltersDrawer
    v-model:is-open="isFiltersDrawerOpen"
    :model-value="drawerValue"
    :warehouse-options="drawerWarehouseOptions"
    :assignee-options="assigneeOptions"
    :status-options="drawerStatusOptions"
    :show-status="!isCycleAwaiting"
    @apply="applyDrawerFilters"
  />

  <!-- ── Demo scenario FAB (bottom-right) ── -->
  <MpPopover id="sa-demo-fab" is-close-on-select use-portal placement="top-end">
    <MpPopoverTrigger>
      <button class="demo-fab" :aria-label="t('Change scenario state')">
        <MpIcon name="sliders" size="md" color="icon.inverse" />
      </button>
    </MpPopoverTrigger>
    <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content' })">
      <p class="demo-fab-heading">{{ t('Scenario state') }}</p>
      <MpPopoverList>
        <MpPopoverListItem
          v-for="s in demoStates" :key="s.value"
          :is-active="s.value === demoState" @click="setDemoState(s.value)"
        >{{ s.label }}</MpPopoverListItem>
      </MpPopoverList>
      <div style="height:1px;background:var(--mp-border-default);margin:var(--mp-spacing-1) 0;" />
      <p class="demo-fab-heading">{{ t('Approval view') }}</p>
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

/* Number / Warehouse cells — the value links to the record's detail */
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
