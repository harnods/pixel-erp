<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import {
  MpSelect, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, MpIcon, MpTooltip, MpDatePicker, MpCheckbox,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton, MpAutocomplete, MpFormControl, MpFormLabel, MpFormErrorMessage,
  toast, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import SourceLabel from '~/components/patterns/SourceLabel.vue'
import { formatDate, formatDateTime } from '~/utils/date'
import { useTableState } from '~/composables/useTableState'
import { outgoingForStages, outgoingStage, OUTGOING_TODAY, isMarketplaceOrder, canCancelOutboundOrder, canReleaseReservedForOrder, releaseReservedForCancelledOrder, type OutgoingOrder } from '~/data/outgoing'
import { canPickOrder, getPickingForOrder } from '~/data/pickingTasks'
import { addPackingTaskFromOrder, canCreatePackingDirectlyForOrder, getPackingForOrder } from '~/data/packingTasks'
import { getDeliveryForOrder } from '~/data/deliveryTasks'
import { syncOutboundOrderStatuses, cancelOutboundOrder } from '~/data/outboundSync'
import { warehouses } from '~/data/warehouses'
import { getWarehouseOperators } from '~/data/warehouseTeam'

// Keep each order's status in sync with its actual picking/packing/delivery tasks.
syncOutboundOrderStatuses()

const toggleAirene = inject<() => void>('toggleAirene')
const { t } = useLocale()

// ─── Demo scenario state (FAB) ─────────────────────────────────────────────────
type DemoState = 'empty' | 'data'
const demoState = ref<DemoState>('data')
const demoStates: { value: DemoState; label: string }[] = [
  { value: 'data', label: t('With data') },
  { value: 'empty', label: t('Empty state') },
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
  { key: 'salesNo',       label: 'Number',    kind: 'number', sortType: 'text' },
  { key: 'source',        label: 'Source',    sortType: 'text' },
  { key: 'warehouseName', label: 'Warehouse', kind: 'name', sortType: 'text' },
  { key: 'status',        label: 'Status',    kind: 'status', sortType: 'text' },
  { key: 'icons',         label: '',          width: '100px', noHeader: true },
  { key: 'skuQty',        label: 'SKU qty',   align: 'right', sortType: 'number' },
  { key: 'orderQty',      label: 'Order qty', align: 'right', sortType: 'number' },
  { key: 'dueDate',       label: 'Due date',  kind: 'date', sortType: 'date' },
]
// Column show/hide — Number stays on; the sort menu's "Hide column" flips these off,
// the ColumnSettings menu turns them back on. `memo` is a sub-row of Number, not a
// real column, so it lives in colVis only (not in columns/visibleColumns).
const colVis = reactive<Record<string, boolean>>({
  ...Object.fromEntries(columns.map(c => [c.key, true])),
  memo: true,
})
const visibleColumns = computed(() => columns.filter(c => colVis[c.key]))
const baseColumnItems = columns.filter(c => !c.noHeader).map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const columnItems = [baseColumnItems[0]!, { key: 'memo', label: 'Memo' }, ...baseColumnItems.slice(1)]
function hideColumn(key: string) { colVis[key] = false }

// ─── Filters ───────────────────────────────────────────────────────────────────
// Status — multi-select, nothing pre-selected: the default view shows ALL statuses
// (empty filter = show everything). Pick specific statuses to narrow it down.
const STATUS_OPTIONS = ['Pending', 'Open', 'In process', 'Partially shipped', 'Completed', 'Canceled']
const STATUS_LABELS: Record<string, string> = {}
function statusOptionLabel(s: string) { return STATUS_LABELS[s] ?? s }
const statusFilter = ref<string[]>([])
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
const statusIsDefault = computed(() => statusFilter.value.length === 0)
function resetStatus() { statusFilter.value = [] }

const warehouseFilter = ref<string[]>([])
// Mirror into the shared singleton so the tab bar's count badges (Requests (N),
// Picking (N), etc.) scope to whatever warehouse this table is actually
// filtered to, instead of always counting every warehouse.
const activeWarehouseFilter = useActiveWarehouseFilter()
watch(warehouseFilter, (v) => { activeWarehouseFilter.value = v }, { immediate: true })
onUnmounted(() => { activeWarehouseFilter.value = [] })
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
    const matchesStatus = !statusFilter.value.length || statusFilter.value.includes(outgoingStage(row))
    const matchesWarehouse = !warehouseFilter.value.length || warehouseFilter.value.includes(row.warehouseId)
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
  () => !!search.value || !statusIsDefault.value || warehouseFilter.value.length > 0 || !!duePreset.value,
)
function clearFilters() {
  search.value = ''
  resetStatus()
  warehouseFilter.value = []
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

// ─── Icon indicators ─────────────────────────────────────────────────────────
function hasPickingList(orderId: string): boolean {
  return getPickingForOrder(orderId).some(t => t.status !== 'canceled')
}
function hasPackingTask(orderId: string): boolean {
  return getPackingForOrder(orderId).some(t => t.status !== 'canceled')
}
function hasShipment(orderId: string): boolean {
  return getDeliveryForOrder(orderId).some(t => t.status === 'shipped')
}

// ─── Row actions ─────────────────────────────────────────────────────────────
const router = useRouter()
const route = useRoute()
// Deep-link from WMS Overview: ?status=Pending|Open|Completed pre-filters the list.
onMounted(() => {
  const s = route.query.status
  if (typeof s === 'string' && STATUS_OPTIONS.includes(s)) {
    statusFilter.value = [s]
  }
})
function viewDetails(row: OutgoingOrder) { router.push(`/outbound-delivery/${row.id}`) }

// Create a picking list for a single order → prefill the create form (warehouse
// locked + order preselected). Supervisor can then trim SKUs / qty.
function createPicking(row: OutgoingOrder) {
  router.push({ path: '/outbound-delivery/picking/create', query: { warehouseId: row.warehouseId, orderIds: row.id, from: 'requests' } })
}

// ─── Direct-to-packing (Picking disabled for the order's warehouse) ─────────────
// No picking step to review — just confirm an assignee and create the packing
// task straight from the order's full SKU demand.
const ASSIGNEES = computed(() => getWarehouseOperators(directPackOrder.value?.warehouseId ?? ''))
const directPackOrder = ref<OutgoingOrder | null>(null)
const directPackModalOpen = ref(false)
const directPackAssigneeId = ref('')
const directPackAssigneeError = ref(false)
watch(directPackAssigneeId, (v) => { if (v) directPackAssigneeError.value = false })

// Marketplace orders are all-or-nothing (nothing to review) → quick assignee-only
// modal, straight to creation. Non-marketplace orders can be packed partially, so
// they go through the full "New packing" page instead.
function openDirectPacking(row: OutgoingOrder) {
  if (!isMarketplaceOrder(row)) {
    router.push({ path: '/outbound-delivery/packing/create', query: { orderId: row.id } })
    return
  }
  directPackOrder.value = row
  directPackAssigneeId.value = ''
  directPackAssigneeError.value = false
  directPackModalOpen.value = true
}
function closeDirectPacking() {
  directPackModalOpen.value = false
  directPackOrder.value = null
}
function confirmDirectPacking() {
  if (!directPackAssigneeId.value) { directPackAssigneeError.value = true; return }
  const order = directPackOrder.value
  if (!order) return
  const assignee = ASSIGNEES.value.find(a => a.id === directPackAssigneeId.value)?.name ?? ''
  const task = addPackingTaskFromOrder({
    salesOrderId: order.id,
    salesNo: order.salesNo,
    warehouseId: order.warehouseId,
    warehouseName: order.warehouseName,
    assignee,
  })
  closeDirectPacking()
  toast.notify({ variant: 'success', title: t('Packing task created'), maxWidth: 'max-content' })
  router.push(`/packing/${task.id}`)
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
// Explains why "Create picking list" is missing when it's specifically the
// multi-warehouse rule that's blocking it (as opposed to none being pickable).
function selectionSpansMultipleWarehouses(selectedRows: Set<number>): boolean {
  const whs = new Set(selectedOrdersOf(selectedRows).map(o => o.warehouseId))
  return whs.size > 1
}
// Bulk → create one picking list from the pickable orders in that (single) warehouse.
function bulkCreatePicking(selectedRows: Set<number>, deselectAll: () => void) {
  if (!bulkPickable(selectedRows)) return
  const eligible = selectedOrdersOf(selectedRows).filter(canPickOrder)
  const wh = eligible[0]!.warehouseId
  deselectAll()
  router.push({ path: '/outbound-delivery/picking/create', query: { warehouseId: wh, orderIds: eligible.map(o => o.id).join(','), from: 'requests' } })
}

// Only orders with no work started yet can be cancelled (previously just "open" —
// now split into Pending/Open, both still count as "nothing started").
// D2 AC#5 — cancellable as long as nothing has shipped (pending/open/in-progress);
// blocked once partially shipped or completed.
function canCancelOrder(o: OutgoingOrder) { return canCancelOutboundOrder(o) }
function cancelableSelection(selectedRows: Set<number>) { return selectedOrdersOf(selectedRows).filter(canCancelOrder) }
function bulkCancelable(selectedRows: Set<number>) { return cancelableSelection(selectedRows).length > 0 }

// Bulk cancel → confirm via alert modal first (only the open orders are cancelled).
const bulkCancelOpen = ref(false)
const bulkCancelCount = ref(0)
let _bulkCancelOrders: OutgoingOrder[] = []
let _bulkDeselect: (() => void) | null = null
function askBulkCancel(selectedRows: Set<number>, deselectAll: () => void) {
  _bulkCancelOrders = cancelableSelection(selectedRows)
  bulkCancelCount.value = _bulkCancelOrders.length
  _bulkDeselect = deselectAll
  bulkCancelOpen.value = true
}
function confirmBulkCancel() {
  const n = _bulkCancelOrders.length
  for (const o of _bulkCancelOrders) cancelOutboundOrder(o.id)
  toast.notify({ variant: 'success', title: `${n} order${n > 1 ? 's' : ''} cancelled`, maxWidth: 'max-content' })
  _bulkCancelOrders = []
  _bulkDeselect?.()
  _bulkDeselect = null
  bulkCancelOpen.value = false
}

const cancelModalOpen = ref(false)
const orderToCancel = ref<OutgoingOrder | null>(null)
function releaseReserved(row: OutgoingOrder) {
  if (releaseReservedForCancelledOrder(row.id)) {
    toast.notify({ variant: 'success', title: `Reserved stock released back to available for ${row.number}`, maxWidth: 'max-content' })
  }
}
function openCancelModal(row: OutgoingOrder) { orderToCancel.value = row; cancelModalOpen.value = true }
function closeCancelModal() { cancelModalOpen.value = false; orderToCancel.value = null }
function confirmCancelOrder() {
  if (orderToCancel.value) {
    const res = cancelOutboundOrder(orderToCancel.value.id)
    if (res.ok) {
      toast.notify({ variant: 'success', title: `Order ${orderToCancel.value.number} cancelled`, maxWidth: 'max-content' })
    } else {
      toast.notify({ variant: 'error', title: t('Cannot cancel — a package has already shipped'), maxWidth: 'max-content' })
    }
  }
  closeCancelModal()
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
        {{ t('Create picking list') }}
      </button>
      <span v-else-if="selectionSpansMultipleWarehouses(selectedRows as Set<number>)" class="out-bulk-hint">
        {{ t('Select orders from a single warehouse to create a picking list') }}
      </span>
      <button
        v-if="bulkCancelable(selectedRows as Set<number>)"
        class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm"
        :class="css({ color: 'var(--mp-text-critical, var(--mp-text-danger))' })"
        @click="askBulkCancel(selectedRows as Set<number>, deselectAll)"
      >
        {{ t('Cancel order') }}
      </button>
    </template>
    <!-- ── Filter bar ── -->
    <template #filters>
      <div class="filter-left">
        <!-- Warehouse — multi-select (hidden in WMS Ops — already scoped to the user's warehouse) -->
        <MpPopover v-if="!isScoped" id="out-wh-filter" :is-close-on-select="false">
          <MpPopoverTrigger>
            <MpSelect
              id="out-wh-select" :placeholder="t('Warehouse')"
              :model-value="warehouseFilter.length ? '__selected__' : undefined" is-clearable
              :class="css({ width: '180px' })" @mousedown.prevent @clear="warehouseFilter = []"
            >
              <option v-if="warehouseFilter.length" value="__selected__">{{ warehouseLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', maxWidth: '320px' })">
            <div class="checkbox-filter-list">
              <label v-for="opt in warehouseOptions" :key="opt.value" class="checkbox-filter-item">
                <MpCheckbox
                  :id="`out-wh-${opt.value}`"
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

        <!-- Status — multi-select (Completed & Canceled hidden by default) -->
        <MpPopover id="out-status-filter" :is-close-on-select="false">
          <MpPopoverTrigger>
            <MpSelect
              id="out-status-select" :placeholder="t('Status')" :model-value="statusFilter.length ? 'set' : ''" is-clearable
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
                >
                  {{ statusOptionLabel(s) }}
                </MpCheckbox>
              </label>
            </div>
          </MpPopoverContent>
        </MpPopover>

        <!-- Due date -->
        <MpPopover id="out-due-filter" :is-close-on-select="false">
          <MpPopoverTrigger>
            <MpSelect
              id="out-due-select" :placeholder="t('Due date')" :model-value="duePreset" is-clearable
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
              <MpDatePicker id="out-due-from" v-model="customFrom" :placeholder="t('From')" format="DD/MM/YYYY" use-portal />
              <MpDatePicker id="out-due-to" v-model="customTo" :placeholder="t('To')" format="DD/MM/YYYY" use-portal />
            </div>
          </MpPopoverContent>
        </MpPopover>
      </div>

      <div class="filter-right">
        <div class="filter-btn-group">
          <MpTooltip id="tt-out-airene" :label="t('Ask Airene')" placement="bottom" use-portal>
            <button class="filter-icon-btn filter-icon-btn--airene" :aria-label="t('Ask Airene')" @click="toggleAirene?.()">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
              </svg>
            </button>
          </MpTooltip>
          <ColumnSettingsMenu id="out-col-settings" :items="columnItems" :visibility="colVis" />
          <MpTooltip id="tt-out-export" :label="t('Export')" placement="bottom" use-portal>
            <button class="filter-icon-btn" :aria-label="t('Export')">
              <MpIcon name="download" size="md" />
            </button>
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

    <!-- ── Cell: Sales no. — View details chip on hover ── -->
    <template #cell-salesNo="{ value, row }">
      <span class="out-so">
        <a class="cell-link cell-text out-so__no" @click.stop="viewDetails(row as unknown as OutgoingOrder)">{{ value }}</a>
        <span v-if="colVis.memo && (row as unknown as OutgoingOrder).memo" class="out-so__memo">{{ (row as unknown as OutgoingOrder).memo }}</span>
      </span>
    </template>

    <!-- ── Source (ERP Sales Order / Manual / Desty marketplace) ── -->
    <template #cell-source="{ value }">
      <span class="out-source"><SourceLabel :source="value as string" /></span>
    </template>

    <!-- ── Warehouse — wrap to 2 lines instead of bleeding; View details chip on hover ── -->
    <template #cell-warehouseName="{ value, row }">
      <a class="cell-link out-warehouse" @click.stop="router.push(`/warehouses/${(row as unknown as OutgoingOrder).warehouseId}`)">{{ value }}</a>
    </template>

    <!-- ── Status badge ── -->
    <template #cell-status="{ value }">
      <ErpStatusBadge :status="(value as string)" :type="value === 'pending' ? 'announcement' : undefined" />
    </template>

    <!-- ── Icon indicators — picking list + packing task badges ── -->
    <template #cell-icons="{ row }">
      <div class="out-icons-cell">
        <MpTooltip
          v-if="hasPickingList((row as unknown as OutgoingOrder).id)"
          :id="`tt-picklist-${row.id}`"
          :label="t('Picking list created')"
          placement="top"
          use-portal
        >
          <span class="out-icon-indicator" :aria-label="t('Picking list created')">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <g clip-path="url(#pl-clip)">
              <path d="M11.2305 1.52879C11.2305 1.11458 10.8947 0.778794 10.4805 0.778794C10.0663 0.778794 9.73054 1.11458 9.73054 1.52879H10.4805H11.2305ZM10.8468 6.44705L10.5573 5.75519L10.5573 5.7552L10.8468 6.44705ZM12.5409 5.73816L12.2514 5.04628L12.2513 5.0463L12.5409 5.73816ZM12.7449 5.73816L13.0344 5.04629L13.0344 5.04628L12.7449 5.73816ZM14.4389 6.44705L14.1494 7.13892L14.1494 7.13892L14.4389 6.44705ZM15.5552 1.52883C15.5552 1.11461 15.2195 0.778826 14.8052 0.778826C14.391 0.778826 14.0552 1.11461 14.0552 1.52883H14.8052H15.5552ZM1.59144 8.79663C1.17802 8.8222 0.863606 9.17809 0.889184 9.59151C0.914763 10.0049 1.27064 10.3193 1.68407 10.2938L1.63775 9.54519L1.59144 8.79663ZM2.57986 9.48691L2.62617 10.2355H2.62618L2.57986 9.48691ZM5.8146 9.78686L5.99778 9.05957L5.99777 9.05957L5.8146 9.78686ZM7.37888 10.1808L7.1957 10.9081L7.19571 10.9081L7.37888 10.1808ZM8.70263 12.0717L9.4487 12.1484V12.1484L8.70263 12.0717ZM6.63788 13.6275L6.50596 14.3658L6.50596 14.3658L6.63788 13.6275ZM5.16212 13.3638L5.29403 12.6255C4.88637 12.5527 4.49682 12.824 4.42385 13.2317C4.35088 13.6393 4.62212 14.029 5.02974 14.1021L5.16212 13.3638ZM10.3654 14.2969L10.233 15.0351C10.3344 15.0533 10.4384 15.0504 10.5386 15.0266L10.3654 14.2969ZM15.7548 13.0178L15.5816 12.288L15.5816 12.288L15.7548 13.0178ZM17.7343 14.2021L18.4592 14.0098L18.4592 14.0098L17.7343 14.2021ZM16.7588 16.1576L17.0412 16.8524L17.0412 16.8524L16.7588 16.1576ZM12.4478 17.9092L12.1655 17.2143L12.1655 17.2143L12.4478 17.9092ZM5.8803 18.0591L6.13061 17.3521L6.13061 17.3521L5.8803 18.0591ZM1.66102 15.7697C1.27055 15.6315 0.841954 15.836 0.703714 16.2264C0.565475 16.6169 0.769943 17.0455 1.16041 17.1837L1.41071 16.4767L1.66102 15.7697ZM17.7251 10.5913C17.6949 11.0044 18.0053 11.3638 18.4184 11.394C18.8315 11.4242 19.1909 11.1138 19.2211 10.7007L18.4731 10.646L17.7251 10.5913ZM18.2536 2.67622L18.9956 2.56653L18.9956 2.56647L18.2536 2.67622ZM17.3966 1.8055L17.2799 2.54637L17.2799 2.54638L17.3966 1.8055ZM7.88887 1.8055L8.0055 2.54638H8.0055L7.88887 1.8055ZM7.03183 2.6763L7.77377 2.786L7.77377 2.786L7.03183 2.6763ZM5.94741 7.09672C5.9444 7.51093 6.27774 7.84915 6.69194 7.85216C7.10614 7.85517 7.44436 7.52183 7.44737 7.10763L6.69739 7.10218L5.94741 7.09672ZM10.4805 1.52879H9.73054V6.20326H10.4805H11.2305V1.52879H10.4805ZM10.4805 6.20326H9.73054C9.73054 6.92772 10.4681 7.41859 11.1364 7.13891L10.8468 6.44705L10.5573 5.7552C10.8773 5.62127 11.2305 5.85633 11.2305 6.20326H10.4805ZM10.8468 6.44705L11.1364 7.13892L12.8304 6.43002L12.5409 5.73816L12.2513 5.0463L10.5573 5.75519L10.8468 6.44705ZM12.5409 5.73816L12.8303 6.43004C12.7104 6.48022 12.5754 6.48022 12.4554 6.43003L12.7449 5.73816L13.0344 5.04628C12.7839 4.94147 12.5019 4.94147 12.2514 5.04628L12.5409 5.73816ZM12.7449 5.73816L12.4554 6.43002L14.1494 7.13892L14.4389 6.44705L14.7285 5.75519L13.0344 5.04629L12.7449 5.73816ZM14.4389 6.44705L14.1494 7.13892C14.8178 7.41858 15.5552 6.92767 15.5552 6.20326H14.8052H14.0552C14.0552 5.85638 14.4084 5.62128 14.7284 5.75518L14.4389 6.44705ZM14.8052 6.20326H15.5552V1.52883H14.8052H14.0552V6.20326H14.8052ZM1.63775 9.54519L1.68407 10.2938L2.62617 10.2355L2.57986 9.48691L2.53355 8.73834L1.59144 8.79663L1.63775 9.54519ZM2.57986 9.48691L2.62618 10.2355C3.6363 10.173 4.65002 10.267 5.63143 10.5141L5.8146 9.78686L5.99777 9.05957C4.86648 8.77465 3.69794 8.66629 2.53354 8.73834L2.57986 9.48691ZM5.8146 9.78686L5.63142 10.5141L7.1957 10.9081L7.37888 10.1808L7.56206 9.45355L5.99778 9.05957L5.8146 9.78686ZM7.37888 10.1808L7.19571 10.9081C7.68407 11.0311 8.0081 11.494 7.95657 11.995L8.70263 12.0717L9.4487 12.1484C9.57648 10.9062 8.77302 9.75854 7.56205 9.45355L7.37888 10.1808ZM8.70263 12.0717L7.95657 11.995C7.89624 12.5814 7.35015 12.9929 6.76979 12.8892L6.63788 13.6275L6.50596 14.3658C7.94501 14.6229 9.2991 13.6026 9.4487 12.1484L8.70263 12.0717ZM6.63788 13.6275L6.76979 12.8892L5.29403 12.6255L5.16212 13.3638L5.0302 14.1021L6.50596 14.3658L6.63788 13.6275ZM5.16212 13.3638L5.02974 14.1021L10.233 15.0351L10.3654 14.2969L10.4978 13.5587L5.2945 12.6256L5.16212 13.3638ZM10.3654 14.2969L10.5386 15.0266L15.928 13.7475L15.7548 13.0178L15.5816 12.288L10.1922 13.5672L10.3654 14.2969ZM15.7548 13.0178L15.928 13.7475C16.4043 13.6345 16.8839 13.9214 17.0094 14.3945L17.7343 14.2021L18.4592 14.0098C18.1252 12.7509 16.8491 11.9873 15.5816 12.288L15.7548 13.0178ZM17.7343 14.2021L17.0094 14.3945C17.126 14.834 16.8977 15.2916 16.4765 15.4628L16.7588 16.1576L17.0412 16.8524C18.1621 16.3969 18.7695 15.1792 18.4592 14.0098L17.7343 14.2021ZM16.7588 16.1576L16.4765 15.4628L12.1655 17.2143L12.4478 17.9092L12.7301 18.604L17.0412 16.8524L16.7588 16.1576ZM12.4478 17.9092L12.1655 17.2143C10.2385 17.9973 8.09131 18.0463 6.13061 17.3521L5.8803 18.0591L5.62999 18.7661C7.93679 19.5829 10.463 19.5251 12.7301 18.604L12.4478 17.9092ZM5.8803 18.0591L6.13061 17.3521L1.66102 15.7697L1.41071 16.4767L1.16041 17.1837L5.62999 18.7661L5.8803 18.0591ZM18.4731 10.646L19.2211 10.7007C19.3041 9.56623 19.3392 8.43576 19.3392 7.41072H18.5892H17.8392C17.8392 8.40316 17.8052 9.49691 17.7251 10.5913L18.4731 10.646ZM18.5892 7.41072H19.3392C19.3392 5.71951 19.2439 4.24599 18.9956 2.56653L18.2536 2.67622L17.5117 2.78591C17.7481 4.38495 17.8392 5.78461 17.8392 7.41072H18.5892ZM18.2536 2.67622L18.9956 2.56647C18.8823 1.80107 18.2889 1.18673 17.5132 1.06462L17.3966 1.8055L17.2799 2.54638C17.3962 2.56469 17.4928 2.65811 17.5117 2.78598L18.2536 2.67622ZM17.3966 1.8055L17.5132 1.06463C15.9657 0.820997 14.3106 0.714272 12.6427 0.714272V1.46427V2.21427C14.2496 2.21427 15.8249 2.3173 17.2799 2.54637L17.3966 1.8055ZM12.6427 1.46427V0.714272C10.9749 0.714272 9.31981 0.820997 7.77224 1.06462L7.88887 1.8055L8.0055 2.54638C9.46062 2.3173 11.0358 2.21427 12.6427 2.21427V1.46427ZM7.88887 1.8055L7.77224 1.06462C6.9965 1.18675 6.40305 1.80126 6.2899 2.56661L7.03183 2.6763L7.77377 2.786C7.79268 2.65811 7.88928 2.56467 8.0055 2.54638L7.88887 1.8055ZM7.03183 2.6763L6.2899 2.5666C6.05718 4.14053 5.95877 5.53415 5.94741 7.09672L6.69739 7.10218L7.44737 7.10763C7.45827 5.60924 7.55204 4.28556 7.77377 2.786L7.03183 2.6763Z" fill="currentColor"/>
            </g>
            <defs>
              <clipPath id="pl-clip"><rect width="20" height="20" fill="white"/></clipPath>
            </defs>
          </svg>
        </span>
        </MpTooltip>
        <MpTooltip
          v-if="hasPackingTask((row as unknown as OutgoingOrder).id)"
          :id="`tt-packtask-${row.id}`"
          :label="t('Packing task created')"
          placement="top"
          use-portal
        >
          <span class="out-icon-indicator" :aria-label="t('Packing task created')">
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
        <MpTooltip
          v-if="hasShipment((row as unknown as OutgoingOrder).id)"
          :id="`tt-shipment-${row.id}`"
          :label="t('Shipment created')"
          placement="top"
          use-portal
        >
          <span class="out-icon-indicator" :aria-label="t('Shipment created')">
            <MpIcon name="truck" size="20px" />
          </span>
        </MpTooltip>
      </div>
    </template>

    <!-- ── Numeric cells ── -->
    <template #cell-skuQty="{ value }">{{ formatNum(value as number) }}</template>
    <template #cell-orderQty="{ value }">{{ formatNum(value as number) }}</template>

    <!-- ── Due date (marketplace orders show time + expiry caption) ── -->
    <template #cell-dueDate="{ row }">
      <span class="out-due">
        <span>{{ dueDisplay(row as unknown as OutgoingOrder) }}</span>
        <span v-if="expireHours(row as unknown as OutgoingOrder) !== null" class="out-due-expire">
          {{ t('Expire in') }} {{ expireHours(row as unknown as OutgoingOrder) }} {{ t('hours') }}
        </span>
      </span>
    </template>

    <!-- ── Actions kebab ── -->
    <template #actions="{ row }">
      <MpPopover :id="`out-actions-${row.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <button class="row-kebab" :aria-label="t('More actions')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="viewDetails(row as unknown as OutgoingOrder)">{{ t('View details') }}</MpPopoverListItem>
            <MpPopoverListItem
              v-if="canPickOrder(row as unknown as OutgoingOrder)"
              @click="createPicking(row as unknown as OutgoingOrder)"
            >{{ t('Create picking list') }}</MpPopoverListItem>
            <MpPopoverListItem
              v-if="canCreatePackingDirectlyForOrder(row as unknown as OutgoingOrder)"
              @click="openDirectPacking(row as unknown as OutgoingOrder)"
            >{{ t('Create packing') }}</MpPopoverListItem>
            <MpPopoverListItem
              v-if="canCancelOrder(row as unknown as OutgoingOrder)"
              :class="css({ color: 'var(--mp-text-critical, var(--mp-text-danger))' })"
              @click="openCancelModal(row as unknown as OutgoingOrder)"
            >{{ t('Cancel order') }}</MpPopoverListItem>
            <MpPopoverListItem
              v-if="canReleaseReservedForOrder((row as unknown as OutgoingOrder).id)"
              @click="releaseReserved(row as unknown as OutgoingOrder)"
            >{{ t('Release reserved') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Full empty state (first run) ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('No outgoing orders') }}</p>
        <p class="empty-full-desc">{{ t('Outgoing orders will appear here.') }}</p>
      </div>
    </template>
  </ErpTablePage>

  <!-- ── Cancel confirmation modal ── -->
  <MpModal
    id="out-cancel-modal" :is-open="cancelModalOpen" size="md"
    is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="closeCancelModal"
  >
    <MpModalContent>
      <MpModalHeader>{{ t('Cancel order?') }}<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        {{ t('Order') }} {{ orderToCancel?.number }} {{ t("will be cancelled. This can't be undone.") }}
      </MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--secondary" @click="closeCancelModal">{{ t('Keep order') }}</button>
          <button class="btn-enterprise btn-enterprise--danger" @click="confirmCancelOrder">{{ t('Cancel order') }}</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <!-- ── Bulk cancel confirmation modal ── -->
  <MpModal
    id="out-bulk-cancel-modal" :is-open="bulkCancelOpen" size="md"
    is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="bulkCancelOpen = false"
  >
    <MpModalContent>
      <MpModalHeader>Cancel {{ bulkCancelCount }} order{{ bulkCancelCount > 1 ? 's' : '' }}?<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        The selected order{{ bulkCancelCount > 1 ? 's' : '' }} will be cancelled. This can't be undone.
      </MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--secondary" @click="bulkCancelOpen = false">{{ t('Keep orders') }}</button>
          <button class="btn-enterprise btn-enterprise--danger" @click="confirmBulkCancel">Cancel order{{ bulkCancelCount > 1 ? 's' : '' }}</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <!-- ── Direct-to-packing modal — marketplace orders only (Picking disabled for
       this order's warehouse; non-marketplace orders go to the full create page
       instead, since they can be packed partially). ── -->
  <MpModal
    id="out-direct-pack-modal" :is-open="directPackModalOpen" size="md"
    is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="closeDirectPacking"
  >
    <MpModalContent>
      <MpModalHeader>{{ t('Create packing?') }}<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <p class="out-direct-pack-desc">
          {{ t('Order') }} {{ directPackOrder?.number }}{{ t("'s full quantity will go into a packing task.") }}
        </p>
        <MpFormControl id="out-direct-pack-assignee" is-required :is-invalid="directPackAssigneeError">
          <MpFormLabel>{{ t('Assignee') }}</MpFormLabel>
          <MpAutocomplete
            id="out-direct-pack-assignee-ac"
            v-model="directPackAssigneeId"
            :data="ASSIGNEES"
            label-prop="name"
            value-prop="id"
            :placeholder="t('Select assignee')"
            is-searchable is-clearable use-portal is-full-width
            :is-invalid="directPackAssigneeError"
          />
          <MpFormErrorMessage>{{ t('You must select assignee') }}</MpFormErrorMessage>
        </MpFormControl>
      </MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--ghost" @click="closeDirectPacking">{{ t('Cancel') }}</button>
          <button class="btn-enterprise btn-enterprise--primary" @click="confirmDirectPacking">{{ t('Create packing') }}</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <!-- ── Demo scenario FAB (bottom-right) ── -->
  <MpPopover id="out-demo-fab" is-close-on-select use-portal placement="top-end">
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
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }

/* Status multi-select list */
.status-filter-list { display: flex; flex-direction: column; padding: var(--mp-spacing-1); }
.status-filter-item {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) 10px; border-radius: var(--mp-radii-md);
  cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.status-filter-item:hover { background: var(--mp-background-neutral-subtle); }

/* Warehouse multi-select list */
.checkbox-filter-list { display: flex; flex-direction: column; padding: var(--mp-spacing-1); }
.checkbox-filter-item {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) 10px; border-radius: var(--mp-radii-md);
  cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.checkbox-filter-item:hover { background: var(--mp-background-neutral-subtle); }

/* Due-date custom range */
.due-custom {
  display: flex; flex-direction: column; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-3);
  border-top: 1px solid var(--mp-border-default);
}

/* Number cell — the value links to the record's detail */
.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }

/* Warehouse — wrap to 2 lines (clamp) instead of overflowing into the next column */
.out-warehouse {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  white-space: normal;
}

/* Sales no. + memo subtitle */
.out-so { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: 0; }
.out-so__no { color: var(--mp-text-default); }
.out-so__memo {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-secondary);
  white-space: normal;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

/* Due date + expiry caption */
.out-due { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.out-due-expire {
  font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-danger, #c0392b); font-weight: var(--mp-font-weights-medium, 500);
}

/* Icon indicators cell — picking list + packing task */
.out-icons-cell {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: var(--mp-spacing-2);
}
.out-icon-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--mp-text-subtle);
}

/* Bulk-bar hint — explains why the create action is missing */
.out-bulk-hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }

/* Source */
.out-source {
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
  overflow: hidden; white-space: normal; color: var(--mp-text-default);
}

/* Kebab — 20px tall so the actions cell stays within the 40px text-only row
   (10px vertical padding + 20px control = 40px → row stays middle-aligned). */
.row-kebab {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px);
  margin-left: auto; /* keep it right-aligned in the actions cell */
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-text-secondary);
}
/* block svg → no inline descender, so the cell stays within the 40px row */
.row-kebab svg { display: block; width: var(--mp-sizes-5, 20px); height: var(--mp-sizes-5, 20px); }
.row-kebab:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-default); }

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
.out-direct-pack-desc { margin: 0 0 var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

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
