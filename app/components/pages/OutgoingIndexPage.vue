<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  MpSelect, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, MpIcon, MpTooltip, MpDatePicker, MpCheckbox,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import { formatDate, formatDateTime } from '~/utils/date'
import { useTableState } from '~/composables/useTableState'
import { outgoingForStages, outgoingStage, OUTGOING_TODAY, type OutgoingOrder } from '~/data/outgoing'
import { canPickOrder } from '~/data/pickingTasks'
import { syncOutboundOrderStatuses } from '~/data/outboundSync'
import { warehouses } from '~/data/warehouses'

// Keep each order's status in sync with its actual picking/packing/delivery tasks.
syncOutboundOrderStatuses()

const toggleAirene = inject<() => void>('toggleAirene')

// ─── Demo scenario state (FAB) ─────────────────────────────────────────────────
type DemoState = 'empty' | 'data'
const demoState = ref<DemoState>('data')
const demoStates: { value: DemoState; label: string }[] = [
  { value: 'data', label: 'With data' },
  { value: 'empty', label: 'Empty state' },
]
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })
function setDemoState(s: DemoState) {
  demoState.value = s
  if (s === 'data') {
    loading.value = true
    setTimeout(() => { loading.value = false }, 1200)
  }
}

// ─── Columns ───────────────────────────────────────────────────────────────────
const columns: TableColumn[] = [
  { key: 'salesNo',       label: 'Number',    width: '220px', sortType: 'text' },
  { key: 'source',        label: 'Source',    width: '180px', sortType: 'text' },
  { key: 'warehouseName', label: 'Warehouse', width: '180px', sortType: 'text' },
  { key: 'status',        label: 'Status',    width: '150px', sortType: 'text' },
  { key: 'skuQty',        label: 'SKU qty',   width: '100px', align: 'right', sortType: 'number' },
  { key: 'orderQty',      label: 'Order qty', width: '120px', align: 'right', sortType: 'number' },
  { key: 'dueDate',       label: 'Due date',  width: '180px', sortType: 'date' },
]
// Column show/hide — Number stays on; the sort menu's "Hide column" flips these off,
// the ColumnSettings menu turns them back on.
const colVis = reactive<Record<string, boolean>>(Object.fromEntries(columns.map(c => [c.key, true])))
const visibleColumns = computed(() => columns.filter(c => colVis[c.key]))
const columnItems = columns.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
function hideColumn(key: string) { colVis[key] = false }

// ─── Filters ───────────────────────────────────────────────────────────────────
// Status — multi-select. Completed & Canceled are terminal, hidden by default, so
// the default view shows only the actionable stages.
const STATUS_OPTIONS = ['Open', 'In process', 'Partially shipped', 'Completed', 'Canceled']
const DEFAULT_STATUSES = ['Open', 'In process', 'Partially shipped']
const STATUS_LABELS: Record<string, string> = {}
function statusOptionLabel(s: string) { return STATUS_LABELS[s] ?? s }
const statusFilter = ref<string[]>([...DEFAULT_STATUSES])
function toggleStatus(s: string) {
  statusFilter.value = statusFilter.value.includes(s)
    ? statusFilter.value.filter(x => x !== s)
    : [...statusFilter.value, s]
}
const statusLabel = computed(() => {
  const n = statusFilter.value.length
  if (n === 0) return ''
  if (n === STATUS_OPTIONS.length) return 'All statuses'
  if (n === 1) return statusOptionLabel(statusFilter.value[0])
  return `${n} statuses`
})
const statusIsDefault = computed(() =>
  statusFilter.value.length === DEFAULT_STATUSES.length
  && DEFAULT_STATUSES.every(s => statusFilter.value.includes(s)),
)
function resetStatus() { statusFilter.value = [...DEFAULT_STATUSES] }

const warehouseFilter = ref('')
const duePreset = ref('') // '' | today | tomorrow | next7 | thismonth | custom
const customFrom = ref('') // DD/MM/YYYY
const customTo = ref('')

// Scenario scoping: WMS Ops users only see orders for their assigned warehouse(s);
// ERP / WMS Standalone see all. Driven by useWarehouseContext.
const { assignedWarehouses } = useWarehouseContext()
const scopedWarehouseIds = computed(() => assignedWarehouses.value.map(w => w.id))
const isScoped = computed(() => scopedWarehouseIds.value.length > 0)

const warehouseOptions = computed(() => {
  const src = isScoped.value
    ? warehouses.filter(w => scopedWarehouseIds.value.includes(w.id))
    : warehouses.filter(w => !w.isDefault && w.status === 'active')
  return src.map(w => ({ label: w.name, value: w.id }))
})

const duePresets = [
  { label: 'Today',            value: 'today' },
  { label: 'Tomorrow',         value: 'tomorrow' },
  { label: 'Next 7 days',      value: 'next7' },
  { label: 'This month',       value: 'thismonth' },
  { label: 'Custom date range', value: 'custom' },
]

const warehouseLabel = computed(() => warehouseOptions.value.find(o => o.value === warehouseFilter.value)?.label ?? '')
const dueLabel = computed(() => {
  if (duePreset.value === 'custom') {
    return customFrom.value && customTo.value ? `${customFrom.value} – ${customTo.value}` : 'Custom date range'
  }
  return duePresets.find(o => o.value === duePreset.value)?.label ?? ''
})

// date-only helpers anchored to the mock "today"
function dayStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function parseDMY(s: string): Date | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
}

// [start, end] inclusive date-only range for the active due-date filter, or null
const dueRange = computed<[Date, Date] | null>(() => {
  const today = dayStart(OUTGOING_TODAY)
  switch (duePreset.value) {
    case 'today': return [today, today]
    case 'tomorrow': { const t = addDays(today, 1); return [t, t] }
    case 'next7': return [today, addDays(today, 7)]
    case 'thismonth': return [
      new Date(today.getFullYear(), today.getMonth(), 1),
      new Date(today.getFullYear(), today.getMonth() + 1, 0),
    ]
    case 'custom': {
      const from = parseDMY(customFrom.value)
      const to = parseDMY(customTo.value)
      return from && to ? [dayStart(from), dayStart(to)] : null
    }
    default: return null
  }
})

function clearDue() {
  duePreset.value = ''
  customFrom.value = ''
  customTo.value = ''
}

// ─── Table state ─────────────────────────────────────────────────────────────
// Unified Outgoing list — all order stages (Open / In progress / Partially shipped /
// Completed / Canceled); the Status filter narrows which show (warehouse-scoped).
const scopedOrders = computed<OutgoingOrder[]>(() =>
  outgoingForStages(STATUS_OPTIONS, isScoped.value ? scopedWarehouseIds.value : undefined),
)
const rows = computed<OutgoingOrder[]>(() => (demoState.value === 'data' ? scopedOrders.value : []))

const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<OutgoingOrder>(rows, {
  perPage: 25,
  filterFn: (row, s) => {
    const matchesSearch = !s
      || row.salesNo.toLowerCase().includes(s)
      || row.warehouseName.toLowerCase().includes(s)
    const matchesStatus = statusFilter.value.includes(outgoingStage(row))
    const matchesWarehouse = !warehouseFilter.value || row.warehouseId === warehouseFilter.value
    let matchesDue = true
    const range = dueRange.value
    if (range) {
      const d = dayStart(new Date(row.dueDate))
      matchesDue = d >= range[0] && d <= range[1]
    }
    return matchesSearch && matchesStatus && matchesWarehouse && matchesDue
  },
})

// reset to page 1 when the extra (non-built-in) filters change
watch([statusFilter, warehouseFilter, dueRange], () => setPage(1))

const hasActiveFilter = computed(
  () => !!search.value || !statusIsDefault.value || !!warehouseFilter.value || !!duePreset.value,
)
function clearFilters() {
  search.value = ''
  resetStatus()
  warehouseFilter.value = ''
  clearDue()
}

// ─── Formatters ────────────────────────────────────────────────────────────────
function formatNum(n: number) { return n.toLocaleString('id-ID') }
// Marketplace (Desty) orders carry a due time → show date+time, and flag those due
// within 24h with an "Expire in N hours" danger caption.
function isMarketplaceDue(o: OutgoingOrder) { return typeof o.dueDate === 'string' && o.dueDate.includes('T') }
function dueDisplay(o: OutgoingOrder) { return isMarketplaceDue(o) ? formatDateTime(o.dueDate) : formatDate(o.dueDate) }
function expireHours(o: OutgoingOrder): number | null {
  if (!isMarketplaceDue(o)) return null
  const h = (new Date(o.dueDate).getTime() - OUTGOING_TODAY.getTime()) / 3_600_000
  return h > 0 && h < 24 ? Math.max(1, Math.ceil(h)) : null
}

// ─── Row actions ─────────────────────────────────────────────────────────────
const router = useRouter()
function viewDetails(row: OutgoingOrder) { router.push(`/barang-keluar/${row.id}`) }

// Create a picking list for a single order → prefill the create form (warehouse
// locked + order preselected). Supervisor can then trim SKUs / qty.
function createPicking(row: OutgoingOrder) {
  router.push({ path: '/barang-keluar/picking/create', query: { warehouseId: row.warehouseId, orderIds: row.id } })
}

function selectedOrdersOf(selectedRows: Set<number>): OutgoingOrder[] {
  return [...selectedRows].map(i => paginated.value[i]).filter(Boolean) as OutgoingOrder[]
}
// Show "Create picking list" only when EVERY selected order is from the same
// warehouse (a picking list is single-warehouse) AND ≥1 of them is still pickable.
// If any selected row is from a different warehouse, the button is hidden.
function bulkPickable(selectedRows: Set<number>): boolean {
  const rows = selectedOrdersOf(selectedRows)
  if (!rows.length) return false
  const wh = rows[0]!.warehouseId
  if (!rows.every(o => o.warehouseId === wh)) return false
  return rows.some(canPickOrder)
}
// Bulk → create one picking list from the pickable orders in that (single) warehouse.
function bulkCreatePicking(selectedRows: Set<number>, deselectAll: () => void) {
  if (!bulkPickable(selectedRows)) return
  const eligible = selectedOrdersOf(selectedRows).filter(canPickOrder)
  const wh = eligible[0]!.warehouseId
  deselectAll()
  router.push({ path: '/barang-keluar/picking/create', query: { warehouseId: wh, orderIds: eligible.map(o => o.id).join(',') } })
}

// Only open orders can be cancelled.
function canCancelOrder(o: OutgoingOrder) { return o.status === 'open' }
function cancelableSelection(selectedRows: Set<number>) { return selectedOrdersOf(selectedRows).filter(canCancelOrder) }
function bulkCancelable(selectedRows: Set<number>) { return cancelableSelection(selectedRows).length > 0 }

// Bulk cancel → confirm via alert modal first (only the open orders are cancelled).
const bulkCancelOpen = ref(false)
const bulkCancelCount = ref(0)
let _bulkDeselect: (() => void) | null = null
function askBulkCancel(selectedRows: Set<number>, deselectAll: () => void) {
  bulkCancelCount.value = cancelableSelection(selectedRows).length
  _bulkDeselect = deselectAll
  bulkCancelOpen.value = true
}
function confirmBulkCancel() {
  // (stub) cancel the selected orders
  _bulkDeselect?.()
  _bulkDeselect = null
  bulkCancelOpen.value = false
}

const cancelModalOpen = ref(false)
const orderToCancel = ref<OutgoingOrder | null>(null)
function openCancelModal(row: OutgoingOrder) { orderToCancel.value = row; cancelModalOpen.value = true }
function closeCancelModal() { cancelModalOpen.value = false; orderToCancel.value = null }

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
    bulk-label="order"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
  >
    <!-- ── Bulk actions ── -->
    <template #bulk-actions="{ deselectAll, selectedRows }">
      <!-- Create picking list only when the selection is pickable AND single-warehouse.
           When warehouses differ, only Cancel remains. -->
      <button
        v-if="bulkPickable(selectedRows as Set<number>)"
        class="btn-enterprise btn-enterprise--primary btn-enterprise--sm"
        @click="bulkCreatePicking(selectedRows as Set<number>, deselectAll)"
      >
        Create picking list
      </button>
      <button
        v-if="bulkCancelable(selectedRows as Set<number>)"
        class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm"
        :class="css({ color: 'var(--mp-text-critical)' })"
        @click="askBulkCancel(selectedRows as Set<number>, deselectAll)"
      >
        Cancel order
      </button>
    </template>
    <!-- ── Filter bar ── -->
    <template #filters>
      <div class="filter-left">
        <!-- Warehouse (hidden in WMS Ops — already scoped to the user's warehouse) -->
        <MpPopover v-if="!isScoped" id="out-wh-filter" is-close-on-select>
          <MpPopoverTrigger>
            <MpSelect
              id="out-wh-select" placeholder="Warehouse" :model-value="warehouseFilter" is-clearable
              :class="css({ width: '180px' })" @mousedown.prevent @clear="warehouseFilter = ''"
            >
              <option v-if="warehouseFilter" :value="warehouseFilter">{{ warehouseLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', maxWidth: '320px' })">
            <MpPopoverList>
              <MpPopoverListItem
                v-for="opt in warehouseOptions" :key="opt.value"
                :is-active="opt.value === warehouseFilter" @click="warehouseFilter = opt.value"
              >{{ opt.label }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <!-- Status — multi-select (Completed & Canceled hidden by default) -->
        <MpPopover id="out-status-filter" :is-close-on-select="false">
          <MpPopoverTrigger>
            <MpSelect
              id="out-status-select" placeholder="Status" :model-value="statusFilter.length ? 'set' : ''" is-clearable
              :class="css({ width: '180px' })" @mousedown.prevent @clear="resetStatus"
            >
              <option v-if="statusFilter.length" value="set">{{ statusLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content' })">
            <div class="status-filter-list">
              <label v-for="s in STATUS_OPTIONS" :key="s" class="status-filter-item">
                <MpCheckbox
                  :id="`out-status-${s}`"
                  :is-checked="statusFilter.includes(s)"
                  @change="toggleStatus(s)"
                  @click.stop
                />
                <span>{{ statusOptionLabel(s) }}</span>
              </label>
            </div>
          </MpPopoverContent>
        </MpPopover>

        <!-- Due date -->
        <MpPopover id="out-due-filter" :is-close-on-select="false">
          <MpPopoverTrigger>
            <MpSelect
              id="out-due-select" placeholder="Due date" :model-value="duePreset" is-clearable
              :class="css({ width: '200px' })" @mousedown.prevent @clear="clearDue"
            >
              <option v-if="duePreset" :value="duePreset">{{ dueLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '220px', width: 'max-content' })">
            <MpPopoverList>
              <MpPopoverListItem
                v-for="opt in duePresets" :key="opt.value"
                :is-active="opt.value === duePreset"
                @click="duePreset = opt.value"
              >{{ opt.label }}</MpPopoverListItem>
            </MpPopoverList>
            <!-- Custom date range inputs -->
            <div v-if="duePreset === 'custom'" class="due-custom">
              <MpDatePicker id="out-due-from" v-model="customFrom" placeholder="From" format="DD/MM/YYYY" use-portal />
              <MpDatePicker id="out-due-to" v-model="customTo" placeholder="To" format="DD/MM/YYYY" use-portal />
            </div>
          </MpPopoverContent>
        </MpPopover>
      </div>

      <div class="filter-right">
        <div class="filter-btn-group">
          <ColumnSettingsMenu id="out-col-settings" :items="columnItems" :visibility="colVis" />
          <MpTooltip id="tt-out-airene" label="Ask Airene" placement="bottom" use-portal>
            <button class="filter-icon-btn filter-icon-btn--airene" aria-label="Ask Airene" @click="toggleAirene?.()">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
              </svg>
            </button>
          </MpTooltip>
          <MpTooltip id="tt-out-export" label="Export" placement="bottom" use-portal>
            <button class="filter-icon-btn" aria-label="Export">
              <MpIcon name="download" size="md" />
            </button>
          </MpTooltip>
        </div>

        <div class="filter-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input v-model="search" class="filter-search-input" type="text" placeholder="Search..." />
        </div>
      </div>
    </template>

    <!-- ── Cell: Sales no. — View details chip on hover ── -->
    <template #cell-salesNo="{ value, row }">
      <div class="cell-with-action">
        <span class="out-so">
          <span class="cell-text out-so__no">{{ value }}</span>
        </span>
        <button class="row-hover-btn" @click.stop="viewDetails(row as unknown as OutgoingOrder)">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="row-hover-btn__label">VIEW DETAILS</span>
        </button>
      </div>
    </template>

    <!-- ── Source (ERP Sales Order / Manual / Desty marketplace) ── -->
    <template #cell-source="{ value }">
      <span class="out-source">{{ value }}</span>
    </template>

    <!-- ── Warehouse — wrap to 2 lines instead of bleeding ── -->
    <template #cell-warehouseName="{ value }">
      <span class="out-warehouse">{{ value }}</span>
    </template>

    <!-- ── Status badge ── -->
    <template #cell-status="{ value }">
      <ErpStatusBadge :status="(value as string)" />
    </template>

    <!-- ── Numeric cells ── -->
    <template #cell-skuQty="{ value }">{{ formatNum(value as number) }}</template>
    <template #cell-orderQty="{ value }">{{ formatNum(value as number) }}</template>

    <!-- ── Due date (marketplace orders show time + expiry caption) ── -->
    <template #cell-dueDate="{ row }">
      <span class="out-due">
        <span>{{ dueDisplay(row as unknown as OutgoingOrder) }}</span>
        <span v-if="expireHours(row as unknown as OutgoingOrder) !== null" class="out-due-expire">
          Expire in {{ expireHours(row as unknown as OutgoingOrder) }} hours
        </span>
      </span>
    </template>

    <!-- ── Actions kebab ── -->
    <template #actions="{ row }">
      <MpPopover :id="`out-actions-${row.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <button class="row-kebab" aria-label="More actions">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="viewDetails(row as unknown as OutgoingOrder)">View details</MpPopoverListItem>
            <MpPopoverListItem
              v-if="canPickOrder(row as unknown as OutgoingOrder)"
              @click="createPicking(row as unknown as OutgoingOrder)"
            >Create picking list</MpPopoverListItem>
            <MpPopoverListItem
              v-if="canCancelOrder(row as unknown as OutgoingOrder)"
              :class="css({ color: 'var(--mp-text-critical)' })"
              @click="openCancelModal(row as unknown as OutgoingOrder)"
            >Cancel order</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Full empty state (first run) ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">No outgoing orders</p>
        <p class="empty-full-desc">Outgoing orders will appear here.</p>
      </div>
    </template>
  </ErpTablePage>

  <!-- ── Cancel confirmation modal ── -->
  <MpModal
    id="out-cancel-modal" :is-open="cancelModalOpen" size="sm"
    is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="closeCancelModal"
  >
    <MpModalContent>
      <MpModalHeader>Cancel order?<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        Order {{ orderToCancel?.number }} will be cancelled. This can't be undone.
      </MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--secondary" @click="closeCancelModal">Keep order</button>
          <button class="btn-enterprise btn-enterprise--danger" @click="closeCancelModal">Cancel order</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <!-- ── Bulk cancel confirmation modal ── -->
  <MpModal
    id="out-bulk-cancel-modal" :is-open="bulkCancelOpen" size="sm"
    is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="bulkCancelOpen = false"
  >
    <MpModalContent>
      <MpModalHeader>Cancel {{ bulkCancelCount }} order{{ bulkCancelCount > 1 ? 's' : '' }}?<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        The selected order{{ bulkCancelCount > 1 ? 's' : '' }} will be cancelled. This can't be undone.
      </MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--secondary" @click="bulkCancelOpen = false">Keep orders</button>
          <button class="btn-enterprise btn-enterprise--danger" @click="confirmBulkCancel">Cancel order{{ bulkCancelCount > 1 ? 's' : '' }}</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <!-- ── Demo scenario FAB (bottom-right) ── -->
  <MpPopover id="out-demo-fab" is-close-on-select use-portal placement="top-end">
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
    </MpPopoverContent>
  </MpPopover>
</template>

<style scoped>
/* Filter bar — reused from index pages */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
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

/* Status multi-select list */
.status-filter-list { display: flex; flex-direction: column; padding: var(--mp-spacing-1); }
.status-filter-item {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) 10px; border-radius: var(--mp-radii-md);
  cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.status-filter-item:hover { background: var(--mp-background-neutral-subtle); }

/* Due-date custom range */
.due-custom {
  display: flex; flex-direction: column; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-3);
  border-top: 1px solid var(--mp-border-default);
}

/* Number cell hover chip */
.cell-with-action { position: relative; display: flex; align-items: center; width: 100%; min-width: 0; }
.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }

/* Warehouse — wrap to 2 lines (clamp) instead of overflowing into the next column */
.out-warehouse {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  white-space: normal;
}

/* Sales no. */
.out-so { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: 0; }
.out-so__no { color: var(--mp-text-default); }

/* Due date + expiry caption */
.out-due { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.out-due-expire {
  font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-danger, #c0392b); font-weight: var(--mp-font-weights-medium);
}

/* Source */
.out-source {
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
  overflow: hidden; white-space: normal; color: var(--mp-text-default);
}
.row-hover-btn {
  position: absolute; right: 0; top: 50%; transform: translateY(-50%); display: none;
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

/* Kebab — 20px tall so the actions cell stays within the 40px text-only row
   (10px vertical padding + 20px control = 40px → row stays middle-aligned). */
.row-kebab {
  display: flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-5, 20px);
  margin-left: auto; /* keep it right-aligned in the actions cell */
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-text-secondary);
}
/* block svg → no inline descender, so the cell stays within the 40px row */
.row-kebab svg { display: block; width: var(--mp-sizes-5, 20px); height: var(--mp-sizes-5, 20px); }
.row-kebab:hover { background: var(--mp-background-neutral-hovered); }

/* Empty state */
.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.empty-full-desc {
  margin-top: var(--mp-spacing-0\.5);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}

/* Modal footer */
.modal-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }

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
.demo-fab-heading {
  padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}
</style>
