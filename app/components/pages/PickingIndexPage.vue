<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  MpSelect, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, MpIcon, MpTooltip, MpCheckbox,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton, css, toast,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import PdfPreviewModal from '~/components/patterns/PdfPreviewModal.vue'
import { useTableState } from '~/composables/useTableState'
import { usePrintShippingLabel } from '~/composables/usePrintShippingLabel'
import { ordersByIds, anyLabelAvailable } from '~/data/shippingLabels'
import {
  pickingTasksFor, pickingTaskAgingDays, isPickingReadyToPack, packableOrderIds, startPicking,
  canCancelPickingTask, cancelPickingTask, type PickingTask,
} from '~/data/pickingTasks'
import { getPackingForOrder, pickingTaskHasPacking } from '~/data/packingTasks'
import { warehouses } from '~/data/warehouses'
import { formatDateTime } from '~/utils/date'

const toggleAirene = inject<() => void>('toggleAirene')
const { t } = useLocale()

// ─── Demo scenario state (FAB) ─────────────────────────────────────────────────
type DemoState = 'empty' | 'data'
const demoState = ref<DemoState>('data')
const demoStates: { value: DemoState; label: string }[] = [
  { value: 'data', label: t('With data') },
  { value: 'empty', label: t('Empty state') },
]
const route = useRoute()

const loading = ref(true)
onMounted(() => {
  setTimeout(() => { loading.value = false }, 1200)
  if (route.query.saved === '1') {
    toast.notify({ variant: 'success', title: t('Picking task saved') , maxWidth: 'max-content'})
    router.replace({ query: { ...route.query, saved: undefined } })
  }
})
function setDemoState(s: DemoState) {
  demoState.value = s
  if (s === 'data') { loading.value = true; setTimeout(() => { loading.value = false }, 1200) }
}

// ─── Scenario scoping ──────────────────────────────────────────────────────────
const { assignedWarehouses } = useWarehouseContext()
const scopedWarehouseIds = computed(() => assignedWarehouses.value.map(w => w.id))
const isScoped = computed(() => scopedWarehouseIds.value.length > 0)

// ─── Columns ───────────────────────────────────────────────────────────────────
const columns: TableColumn[] = [
  { key: 'taskNo',        label: 'Number',       width: '180px', sortType: 'text' },
  { key: 'salesNos',      label: 'Sales orders', width: '240px' },
  { key: 'warehouseName', label: 'Warehouse',    width: '180px', sortType: 'text' },
  { key: 'assignee',      label: 'Assignee',     width: '160px', sortType: 'text' },
  { key: 'skuQty',        label: 'SKU qty',      width: '100px', align: 'right', sortType: 'number' },
  { key: 'toPickQty',     label: 'To pick',      width: '100px', align: 'right', sortType: 'number' },
  { key: 'pickedQty',     label: 'Picked qty',   width: '100px', align: 'right', sortType: 'number' },
  { key: 'status',        label: 'Status',       width: '140px', sortType: 'text' },
  { key: 'icons',         label: '',             width: '48px',  align: 'center', noHeader: true },
  { key: 'startDate',     label: 'Start date',   width: '170px', sortType: 'date' },
  { key: 'endDate',       label: 'End date',     width: '190px', sortType: 'date' },
]
// Column show/hide — Number stays on; the sort menu's "Hide column" flips these off,
// the ColumnSettings menu turns them back on.
const colVis = reactive<Record<string, boolean>>(Object.fromEntries(columns.map(c => [c.key, true])))
const visibleColumns = computed(() => columns.filter(c => colVis[c.key]))
const columnItems = columns.filter(c => !c.noHeader).map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
function hideColumn(key: string) { colVis[key] = false }

// ─── Filters — max 2 quick filters: Status + Warehouse (hidden when scoped) ───
const warehouseFilter = ref<string[]>([])
// Mirror into the shared singleton so the tab bar's count badges (Requests (N),
// Picking (N), etc.) scope to whatever warehouse this table is actually
// filtered to, instead of always counting every warehouse.
const activeWarehouseFilter = useActiveWarehouseFilter()
watch(warehouseFilter, (v) => { activeWarehouseFilter.value = v }, { immediate: true })
onUnmounted(() => { activeWarehouseFilter.value = [] })
const statusFilter = ref<string[]>([])
// Deep-link from WMS Overview: ?status=<task status> pre-filters the list.
onMounted(() => {
  const s = route.query.status
  if (typeof s === 'string' && statusOptions.some(o => o.value === s)) {
    statusFilter.value = [s]
  }
})

const baseTasks = computed<PickingTask[]>(() =>
  demoState.value === 'data'
    ? pickingTasksFor(isScoped.value ? scopedWarehouseIds.value : undefined)
    : [],
)

const warehouseOptions = computed(() => {
  const src = isScoped.value
    ? warehouses.filter(w => scopedWarehouseIds.value.includes(w.id))
    : warehouses.filter(w => !w.isDefault && w.status === 'active')
  return src.map(w => ({ label: w.name, value: w.id }))
})
const statusOptions = [
  { label: t('Open'),            value: 'open' },
  { label: t('In process'),      value: 'in progress' },
  { label: t('Partially picked'), value: 'partially picked' },
  { label: t('Completed'),       value: 'completed' },
  { label: t('Canceled'),        value: 'canceled' },
]
const warehouseLabel = computed(() => {
  const n = warehouseFilter.value.length
  if (n === 0) return ''
  if (n === 1) return warehouseOptions.value.find(o => o.value === warehouseFilter.value[0])?.label ?? ''
  return `${n} warehouses`
})
function toggleWarehouse(id: string) {
  const idx = warehouseFilter.value.indexOf(id)
  if (idx >= 0) warehouseFilter.value = warehouseFilter.value.filter(v => v !== id)
  else warehouseFilter.value = [...warehouseFilter.value, id]
}
const statusLabel = computed(() => {
  const n = statusFilter.value.length
  if (n === 0) return ''
  if (n === 1) return statusOptions.find(o => o.value === statusFilter.value[0])?.label ?? ''
  return `${n} statuses`
})
function toggleStatus(v: string) {
  const idx = statusFilter.value.indexOf(v)
  if (idx >= 0) statusFilter.value = statusFilter.value.filter(x => x !== v)
  else statusFilter.value = [...statusFilter.value, v]
}

const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<PickingTask>(baseTasks, {
  perPage: 25,
  filterFn: (row, s) => {
    const matchesSearch = !s
      || row.taskNo.toLowerCase().includes(s)
      || row.salesNos.some(n => n.toLowerCase().includes(s))
      || row.warehouseName.toLowerCase().includes(s)
    const matchesWarehouse = !warehouseFilter.value.length || warehouseFilter.value.includes(row.warehouseId)
    const matchesStatus    = !statusFilter.value.length || statusFilter.value.includes(row.status)
    return matchesSearch && matchesWarehouse && matchesStatus
  },
})
watch([warehouseFilter, statusFilter], () => setPage(1))

const hasActiveFilter = computed(() => !!search.value || warehouseFilter.value.length > 0 || statusFilter.value.length > 0)
function clearFilters() { search.value = ''; warehouseFilter.value = []; statusFilter.value = [] }

// ─── Formatters ────────────────────────────────────────────────────────────────
function formatNum(n: number) { return n.toLocaleString('id-ID') }
function agingDays(t: PickingTask) { return pickingTaskAgingDays(t) }

// ─── Sales orders expand/collapse ──────────────────────────────────────────────
const expandedRows = ref(new Set<string>())
function toggleExpand(id: string) {
  const s = new Set(expandedRows.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expandedRows.value = s
}

// ─── Row actions ──────────────────────────────────────────────────────────────
const router = useRouter()
function viewDetails(row: PickingTask) { router.push(`/picking/${row.id}`) }
function startPickingAndNavigate(row: PickingTask) {
  startPicking(row.id)
  router.push(`/picking/${row.id}/pick`)
}
function continuePicking(row: PickingTask) { router.push(`/picking/${row.id}/pick`) }
// A completed picking task can spawn packing tasks (one per sales order).
function createPacking(row: PickingTask) {
  router.push({ path: '/outbound-delivery/packing/create', query: { pickingId: row.id } })
}

const cancelModalOpen = ref(false)
const taskToCancel = ref<PickingTask | null>(null)
function openCancelModal(t: PickingTask) { taskToCancel.value = t; cancelModalOpen.value = true }
function closeCancelModal() { cancelModalOpen.value = false; taskToCancel.value = null }
function confirmCancelTask() {
  if (!taskToCancel.value) return
  cancelPickingTask(taskToCancel.value.id)
  toast.notify({ variant: 'success', title: `${taskToCancel.value.taskNo} canceled`, maxWidth: 'max-content' })
  closeCancelModal()
}

// ─── Bulk → create packing tasks for several finished picking lists at once ───────
function selectedPickingsOf(sel: Set<number>): PickingTask[] {
  return [...sel].map(i => paginated.value[i]).filter(Boolean) as PickingTask[]
}
// A picking list can spawn packing tasks when its status allows it (open,
// partially picked, or completed) and has ≥1 packable order not already on a
// packing task — an open list is only actually eligible if another picking list
// already picked something for one of its orders, so this stays correctly hidden
// for a genuinely untouched open list.
function pickingEligibleForPacking(t: PickingTask): boolean {
  return isPickingReadyToPack(t) && packableOrderIds(t).some(id => getPackingForOrder(id).length === 0)
}
// Show "Create packing" only when EVERY selected list is the SAME warehouse and ≥1 is
// eligible (a packing batch is single-warehouse). Mixed warehouses ⇒ hidden.
function bulkPackable(sel: Set<number>): boolean {
  const rows = selectedPickingsOf(sel)
  if (!rows.length) return false
  const wh = rows[0]!.warehouseId
  if (!rows.every(t => t.warehouseId === wh)) return false
  return rows.some(pickingEligibleForPacking)
}
// Explains why "Create packing" is missing when it's specifically the
// multi-warehouse rule that's blocking it (as opposed to none being eligible).
function selectionSpansMultipleWarehouses(sel: Set<number>): boolean {
  const whs = new Set(selectedPickingsOf(sel).map(t => t.warehouseId))
  return whs.size > 1
}
// Open the multi-picking Create packing form for EVERY selected list, not just the
// eligible ones — the form itself shows a not-packable list with its reason instead
// of silently dropping it, so the operator can see why (button still only appears
// when ≥1 selected list is actually eligible, via bulkPackable above).
function bulkCreatePacking(sel: Set<number>, deselectAll: () => void) {
  const rows = selectedPickingsOf(sel)
  if (!rows.length) return
  router.push({ path: '/outbound-delivery/packing/create', query: { pickingIds: rows.map(t => t.id).join(',') } })
  deselectAll()
}

// ─── Print shipping label (source/marketplace or WMS label; D9 duplicate guard) ──
const { pdfOpen, pdfDoc, pdfFilename, printShippingLabels } = usePrintShippingLabel()
function ordersForPicking(t: PickingTask) { return ordersByIds(t.salesOrderIds) }
// Enabled unless every order behind the task is a marketplace order still waiting
// for its source label (then there's nothing printable).
function canPrintLabel(t: PickingTask): boolean { return anyLabelAvailable(ordersForPicking(t)) }
function bulkPrintLabels(sel: Set<number>, deselectAll: () => void) {
  const orders = ordersByIds(selectedPickingsOf(sel).flatMap(t => t.salesOrderIds))
  printShippingLabels(orders)
  deselectAll()
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
    has-checkbox
    bulk-label="picking list"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
  >
    <!-- ── Bulk bar → create packing / print shipping labels for the selected lists ── -->
    <template #bulk-actions="{ deselectAll, selectedRows }">
      <button
        v-if="bulkPackable(selectedRows as Set<number>)"
        class="btn-enterprise btn-enterprise--primary btn-enterprise--sm"
        @click="bulkCreatePacking(selectedRows as Set<number>, deselectAll)"
      >
        {{ t('Create packing') }}
      </button>
      <button
        class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm"
        @click="bulkPrintLabels(selectedRows as Set<number>, deselectAll)"
      >
        {{ t('Print shipping label') }}
      </button>
      <span v-if="selectionSpansMultipleWarehouses(selectedRows as Set<number>)" class="pick-bulk-hint">
        {{ t('Select picking lists from a single warehouse to create packing') }}
      </span>
    </template>

    <!-- ── Filter bar ── -->
    <template #filters>
      <div class="filter-left">
        <MpPopover v-if="!isScoped" id="pick-wh-filter" :is-close-on-select="false">
          <MpPopoverTrigger>
            <MpSelect
              id="pick-wh-select" :placeholder="t('Warehouse')"
              :model-value="warehouseFilter.length ? '__selected__' : undefined" is-clearable
              :class="css({ width: '160px' })" @mousedown.prevent @clear="warehouseFilter = []"
            >
              <option v-if="warehouseFilter.length" value="__selected__">{{ warehouseLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', maxWidth: '320px' })">
            <div class="checkbox-filter-list">
              <label v-for="opt in warehouseOptions" :key="opt.value" class="checkbox-filter-item">
                <MpCheckbox
                  :id="`pick-wh-${opt.value}`"
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

        <MpPopover id="pick-status-filter" :is-close-on-select="false">
          <MpPopoverTrigger>
            <MpSelect
              id="pick-status-select" :placeholder="t('Status')" :model-value="statusFilter.length ? 'set' : ''" is-clearable
              :class="css({ width: '160px' })" @mousedown.prevent @clear="statusFilter = []"
            >
              <option v-if="statusFilter.length" value="set">{{ statusLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content' })">
            <div class="checkbox-filter-list">
              <label v-for="opt in statusOptions" :key="opt.value" class="checkbox-filter-item">
                <MpCheckbox
                  :id="`pick-status-${opt.value}`"
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
      </div>

      <div class="filter-right">
        <div class="filter-btn-group">
          <MpTooltip id="tt-pick-airene" :label="t('Ask Airene')" placement="bottom" use-portal>
            <button class="filter-icon-btn filter-icon-btn--airene" :aria-label="t('Ask Airene')" @click="toggleAirene?.()">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
              </svg>
            </button>
          </MpTooltip>
          <ColumnSettingsMenu id="pick-col-settings" :items="columnItems" :visibility="colVis" />
          <MpTooltip id="tt-pick-export" :label="t('Export')" placement="bottom" use-portal>
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

    <!-- ── Number — View details chip on hover ── -->
    <template #cell-taskNo="{ value, row }">
      <a class="cell-link cell-text pick-no" @click.stop="viewDetails(row as unknown as PickingTask)">{{ value }}</a>
    </template>

    <!-- ── Sales orders — expandable list ── -->
    <template #cell-salesNos="{ value, row }">
      <span class="pick-orders">
        <template v-if="expandedRows.has((row as unknown as PickingTask).id)">
          <span v-for="no in (value as string[])" :key="no" class="pick-orders__item">{{ no }}</span>
          <button class="pick-orders__toggle" @click.stop="toggleExpand((row as unknown as PickingTask).id)">{{ t('Show less') }}</button>
        </template>
        <template v-else>
          <span class="pick-orders__item">{{ (value as string[])[0] }}</span>
          <button
            v-if="(value as string[]).length > 1"
            class="pick-orders__toggle"
            @click.stop="toggleExpand((row as unknown as PickingTask).id)"
          >+{{ (value as string[]).length - 1 }} {{ t('more') }}</button>
        </template>
      </span>
    </template>

    <!-- ── Warehouse — View details chip on hover ── -->
    <template #cell-warehouseName="{ value, row }">
      <a class="cell-link pick-warehouse" @click.stop="router.push(`/warehouses/${(row as unknown as PickingTask).warehouseId}`)">{{ value }}</a>
    </template>

    <!-- ── Numeric cells ── -->
    <template #cell-skuQty="{ value }">{{ formatNum(value as number) }}</template>
    <template #cell-toPickQty="{ value }">{{ formatNum(value as number) }}</template>
    <template #cell-pickedQty="{ value }">{{ formatNum(value as number) }}</template>

    <!-- ── Status ── -->
    <template #cell-status="{ value }"><ErpStatusBadge :status="value as string" /></template>

    <!-- ── Icon indicators — packing task created ── -->
    <template #cell-icons="{ row }">
      <div class="pick-icons-cell">
        <MpTooltip
          v-if="pickingTaskHasPacking((row as unknown as PickingTask).id)"
          :id="`tt-packtask-${row.id}`"
          :label="t('Packing task created')"
          placement="top"
          use-portal
        >
          <span class="pick-icon-indicator" :aria-label="t('Packing task created')">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <g clip-path="url(#pt-clip)">
                <path d="M2.40711 7.72822C2.75157 6.54028 3.29326 5.44152 3.82046 4.37214C4.08056 3.84458 4.33712 3.32416 4.56474 2.8037C4.76946 2.33564 5.20689 1.99844 5.72079 1.95301C7.1385 1.82768 8.30968 1.74107 9.99988 1.74107C11.6747 1.74107 12.8399 1.8261 14.2403 1.94959C14.7739 1.99665 15.2218 2.35856 15.4226 2.84938C15.6759 3.46852 15.9734 4.06607 16.2769 4.67586C16.7475 5.62099 17.2326 6.5955 17.5907 7.72528" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M9.99985 6.71288V1.74129" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M2.21244 16.7277C2.31101 17.3507 2.83008 17.8309 3.46628 17.8795C5.556 18.0392 7.74502 18.2588 9.99998 18.2588C12.2549 18.2588 14.444 18.0392 16.5337 17.8795C17.1698 17.8309 17.689 17.3507 17.7874 16.7277C18.003 15.3658 18.2589 13.9456 18.2589 12.4858C18.2589 11.026 18.003 9.60578 17.7874 8.24392C17.689 7.62086 17.1698 7.14058 16.5337 7.09199C14.444 6.93242 12.2549 6.71272 9.99998 6.71272C7.74502 6.71272 5.556 6.93242 3.46628 7.09199C2.83008 7.14058 2.31101 7.62086 2.21244 8.24392C1.99701 9.60578 1.74107 11.026 1.74107 12.4858C1.74107 13.9456 1.99701 15.3658 2.21244 16.7277Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M12.2367 14.7236H14.907" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </g>
              <defs>
                <clipPath id="pt-clip"><rect width="20" height="20" fill="white"/></clipPath>
              </defs>
            </svg>
          </span>
        </MpTooltip>
      </div>
    </template>

    <!-- ── Start / End date + aging ── -->
    <template #cell-startDate="{ value }">{{ value ? formatDateTime(value as string) : '—' }}</template>
    <template #cell-endDate="{ row }">
      <span class="pick-end">
        <span v-if="(row as unknown as PickingTask).endDate">{{ formatDateTime((row as unknown as PickingTask).endDate) }}</span>
        <span v-else class="pick-end__ongoing">—</span>
        <span v-if="agingDays(row as unknown as PickingTask) > 1" class="pick-aging">{{ agingDays(row as unknown as PickingTask) }} {{ t('days') }}</span>
      </span>
    </template>

    <!-- ── Actions kebab ── -->
    <template #actions="{ row }">
      <MpPopover :id="`pick-actions-${row.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <button class="row-kebab" :aria-label="t('More actions')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="viewDetails(row as unknown as PickingTask)">{{ t('View details') }}</MpPopoverListItem>
            <MpPopoverListItem
              v-if="(row as unknown as PickingTask).status === 'open'"
              @click="startPickingAndNavigate(row as unknown as PickingTask)"
            >{{ t('Start picking') }}</MpPopoverListItem>
            <MpPopoverListItem
              v-else-if="(row as unknown as PickingTask).status === 'in progress'"
              @click="continuePicking(row as unknown as PickingTask)"
            >{{ t('Continue picking') }}</MpPopoverListItem>
            <MpPopoverListItem
              v-if="pickingEligibleForPacking(row as unknown as PickingTask)"
              @click="createPacking(row as unknown as PickingTask)"
            >{{ t('Create packing') }}</MpPopoverListItem>
            <MpPopoverListItem
              v-if="canPrintLabel(row as unknown as PickingTask)"
              @click="printShippingLabels(ordersForPicking(row as unknown as PickingTask))"
            >{{ t('Print shipping label') }}</MpPopoverListItem>
            <MpPopoverListItem
              v-else
              :class="css({ opacity: 0.45, cursor: 'not-allowed' })"
              :title="t('Waiting for marketplace shipping label')"
            >{{ t('Print shipping label') }}</MpPopoverListItem>
            <MpPopoverListItem
              v-if="canCancelPickingTask(row as unknown as PickingTask)"
              :class="css({ color: 'var(--mp-text-critical)' })"
              @click="openCancelModal(row as unknown as PickingTask)"
            >{{ t('Cancel') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Full empty state ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('No picking tasks') }}</p>
        <p class="empty-full-desc">{{ t('Orders waiting to be picked will appear here.') }}</p>
      </div>
    </template>
  </ErpTablePage>

  <PdfPreviewModal
    :open="pdfOpen"
    :doc="pdfDoc"
    :filename="pdfFilename"
    :title="t('Shipping label preview')"
    @close="pdfOpen = false"
  />

  <!-- ── Cancel confirmation modal ── -->
  <MpModal id="pick-cancel-modal" :is-open="cancelModalOpen" size="md"
    is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="closeCancelModal">
    <MpModalContent>
      <MpModalHeader>{{ t('Cancel') }} {{ taskToCancel?.taskNo }}?<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        {{ t('This picking task will be canceled and can no longer be continued. This can\'t be undone.') }}
      </MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--secondary" @click="closeCancelModal">{{ t('Keep task') }}</button>
          <button class="btn-enterprise btn-enterprise--danger" @click="confirmCancelTask">{{ t('Cancel task') }}</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <!-- ── Demo scenario FAB ── -->
  <MpPopover id="pick-demo-fab" is-close-on-select use-portal placement="top-end">
    <MpPopoverTrigger>
      <button class="demo-fab" :aria-label="t('Change scenario state')"><MpIcon name="sliders" size="md" color="icon.inverse" /></button>
    </MpPopoverTrigger>
    <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content' })">
      <p class="demo-fab-heading">{{ t('Scenario state') }}</p>
      <MpPopoverList>
        <MpPopoverListItem
          v-for="s in demoStates" :key="s.value"
          :is-active="s.value === demoState" @click="setDemoState(s.value)"
        >{{ s.label }}</MpPopoverListItem>
      </MpPopoverList>
    </MpPopoverContent>
  </MpPopover>
</template>

<style scoped>
.filter-left  { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }

/* Warehouse multi-select list */
.checkbox-filter-list { display: flex; flex-direction: column; padding: var(--mp-spacing-1); }
.checkbox-filter-item {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) 10px; border-radius: var(--mp-radii-md);
  cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.checkbox-filter-item:hover { background: var(--mp-background-neutral-subtle); }
.filter-btn-group { display: flex; align-items: center; gap: var(--mp-spacing-1); }
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

/* Number cell — View details chip on hover */
.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.pick-no { color: var(--mp-text-default); }
.pick-bulk-hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }

/* Sales orders cell */
.pick-orders { display: flex; flex-direction: column; align-items: flex-start; gap: var(--mp-spacing-0\.5); }
.pick-orders__item  { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.pick-orders__toggle {
  border: none; background: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link, var(--mp-text-brand));
  line-height: var(--mp-line-heights-sm);
}
.pick-orders__toggle:hover { text-decoration: underline; }

.pick-warehouse {
  white-space: normal; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden;
}

/* Icon indicators cell — packing task created */
.pick-icons-cell { display: flex; align-items: center; justify-content: center; gap: var(--mp-spacing-2); }
.pick-icon-indicator { display: inline-flex; align-items: center; justify-content: center; color: var(--mp-text-subtle); }

/* Start/End date + aging badge */
.pick-end { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.pick-end__ongoing { color: var(--mp-text-secondary); }
.pick-aging {
  display: inline-flex; align-items: center; padding: 0 var(--mp-spacing-1\.5);
  border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral-subtle, #f1f5f9);
  color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-lg, 20px); white-space: nowrap;
}

.row-kebab {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px); margin-left: auto;
  border: none; background: none; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-secondary);
}
.row-kebab svg { display: block; width: var(--mp-sizes-5, 20px); height: var(--mp-sizes-5, 20px); }
.row-kebab:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-default); }

.modal-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }

.empty-full { display: flex; flex-direction: column; align-items: center; padding: var(--mp-spacing-10, 40px) 0; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc  { margin-top: var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.demo-fab {
  position: fixed; right: var(--mp-spacing-6); bottom: var(--mp-spacing-6);
  width: var(--mp-spacing-12, 48px); height: var(--mp-spacing-12, 48px);
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-inverse); color: var(--mp-text-inverse); cursor: pointer; z-index: 1200;
  box-shadow: 0 4px 6px -2px rgba(0,0,0,0.1), 0 10px 15px -3px rgba(0,0,0,0.2);
}
.demo-fab:hover { opacity: 0.9; }
.demo-fab-heading { padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
