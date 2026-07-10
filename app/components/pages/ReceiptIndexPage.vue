<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import {
  MpSelect, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, MpIcon, MpTooltip, MpDatePicker, MpCheckbox,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton, MpInput, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import { formatDate } from '~/utils/date'
import { useTableState } from '~/composables/useTableState'
import { receiptsForStages, receiptStage, cancelReceipt, isManualReceipt, deleteReceipt, RECEIPT_TODAY, type Receipt } from '~/data/receipts'
import { warehouses } from '~/data/warehouses'
import { canCreateReceivingTask } from '~/data/receivingTasks'

const toggleAirene = inject<() => void>('toggleAirene')

// ─── Demo scenario state (FAB) ─────────────────────────────────────────────────
// Default screen shows the populated table; the FAB flips to the empty (first-run)
// state. Skeleton loading is part of the populated screen (first load + page change),
// not a separate scenario.
type DemoState = 'empty' | 'data'
const demoState = ref<DemoState>('data')
const demoStates: { value: DemoState; label: string }[] = [
  { value: 'data', label: 'With data' },
  { value: 'empty', label: 'Empty state' },
]
// First-load skeleton on the populated screen; re-runs when switching back to data.
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
  { key: 'purchaseNo',       label: 'Number',            width: '260px', sortType: 'text' },
  { key: 'warehouseName',    label: 'Warehouse',         width: '180px', sortType: 'text' },
  { key: 'vendor',           label: 'Vendor',            width: '200px', sortType: 'text' },
  { key: 'status',           label: 'Status',            width: '150px', sortType: 'text' },
  { key: 'trackingNos',      label: 'Tracking no.',      width: '150px' },
  { key: 'skuQty',           label: 'SKU qty',           width: '100px', align: 'right', sortType: 'number' },
  { key: 'purchaseQty',      label: 'Purchase qty',      width: '120px', align: 'right', sortType: 'number' },
  { key: 'estimatedArrival', label: 'Estimated arrival', width: '150px', sortType: 'date' },
]
// Column show/hide — first column stays on; the sort menu's "Hide column" flips
// these off, the ColumnSettings menu turns them back on.
// trackingNos is hidden by default — user can enable it via column settings.
// `memo` is a sub-row of Number, not a real column, so it lives in colVis only.
const colVis = reactive<Record<string, boolean>>({
  ...Object.fromEntries(columns.map(c => [c.key, c.key !== 'trackingNos'])),
  memo: true,
})
const visibleColumns = computed(() => columns.filter(c => colVis[c.key]))
const baseColumnItems = columns.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const columnItems = [baseColumnItems[0]!, { key: 'memo', label: 'Memo' }, ...baseColumnItems.slice(1)]
function hideColumn(key: string) { colVis[key] = false }

// ─── Filters ───────────────────────────────────────────────────────────────────
// Status — multi-select. Completed & Canceled are terminal, hidden by default, so
// the default view shows only the actionable stages.
const STATUS_OPTIONS = ['On the way', 'Partial reception', 'Completed', 'Canceled']
const DEFAULT_STATUSES = ['On the way', 'Partial reception']
// Display label per stage value — "On the way" shows as "Open" (value stays internal).
const STATUS_LABELS: Record<string, string> = { 'On the way': 'Open' }
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
const arrivalPreset = ref('') // '' | today | tomorrow | next7 | thismonth | custom
const customFrom = ref('')    // DD/MM/YYYY
const customTo = ref('')

// Scenario scoping: WMS Ops users only see receipts for their assigned warehouse(s);
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

const arrivalPresets = [
  { label: 'Today',            value: 'today' },
  { label: 'Tomorrow',         value: 'tomorrow' },
  { label: 'Next 7 days',      value: 'next7' },
  { label: 'This month',       value: 'thismonth' },
  { label: 'Custom date range', value: 'custom' },
]

const warehouseLabel = computed(() => warehouseOptions.value.find(o => o.value === warehouseFilter.value)?.label ?? '')
const arrivalLabel = computed(() => {
  if (arrivalPreset.value === 'custom') {
    return customFrom.value && customTo.value ? `${customFrom.value} – ${customTo.value}` : 'Custom date range'
  }
  return arrivalPresets.find(o => o.value === arrivalPreset.value)?.label ?? ''
})

// date-only helpers anchored to the mock "today"
function dayStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function parseDMY(s: string): Date | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
}

// [start, end] inclusive date-only range for the active arrival filter, or null
const arrivalRange = computed<[Date, Date] | null>(() => {
  const today = dayStart(RECEIPT_TODAY)
  switch (arrivalPreset.value) {
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

function clearArrival() {
  arrivalPreset.value = ''
  customFrom.value = ''
  customTo.value = ''
}

// ─── Table state ─────────────────────────────────────────────────────────────
// Unified Receipts list — all receipt stages (On the way / Partial reception /
// Completed / Canceled); the Status filter narrows which show (warehouse-scoped).
const scopedReceipts = computed<Receipt[]>(() =>
  receiptsForStages(STATUS_OPTIONS, isScoped.value ? scopedWarehouseIds.value : undefined),
)
const rows = computed<Receipt[]>(() => (demoState.value === 'data' ? scopedReceipts.value : []))

const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<Receipt>(rows, {
  perPage: 25,
  filterFn: (row, s) => {
    const matchesSearch = !s
      || row.purchaseNo.toLowerCase().includes(s)
      || row.warehouseName.toLowerCase().includes(s)
      || (row.vendor ?? '').toLowerCase().includes(s)
    const matchesStatus = statusFilter.value.includes(receiptStage(row))
    const matchesWarehouse = !warehouseFilter.value || row.warehouseId === warehouseFilter.value
    let matchesArrival = true
    const range = arrivalRange.value
    if (range) {
      const d = dayStart(new Date(row.estimatedArrival))
      matchesArrival = d >= range[0] && d <= range[1]
    }
    return matchesSearch && matchesStatus && matchesWarehouse && matchesArrival
  },
})

// reset to page 1 when the extra (non-built-in) filters change
watch([statusFilter, warehouseFilter, arrivalRange], () => setPage(1))

const hasActiveFilter = computed(
  () => !!search.value || !statusIsDefault.value || !!warehouseFilter.value || !!arrivalPreset.value,
)
function clearFilters() {
  search.value = ''
  resetStatus()
  warehouseFilter.value = ''
  clearArrival()
}

// ─── Formatters ────────────────────────────────────────────────────────────────
function formatNum(n: number) { return n.toLocaleString('id-ID') }

// ─── Row actions ─────────────────────────────────────────────────────────────
const router = useRouter()
function viewDetails(row: Receipt) { router.push(`/inbound-delivery/${row.id}`) }

function purchaseReceiving(row: Receipt) { router.push(`/inbound-delivery/${row.id}/receive`) }

// Bulk actions (stubs) — clear the selection after acting.
function bulkPurchaseReceiving(deselectAll: () => void) { deselectAll() }

// A purchase receiving task is scoped to one warehouse, so bulk-creating one across
// receipts from different warehouses isn't valid. Once the selection spans more than
// one warehouse, every bulk action except Cancel is hidden (Cancel is warehouse-agnostic).
function selectionSpansWarehouses(selectedRows: Set<number>): boolean {
  const ids = new Set([...selectedRows].map(i => paginated.value[i]?.warehouseId).filter(Boolean))
  return ids.size > 1
}

// ─── Edit tracking no. modal (single row, or bulk grouped by PO) ────────────────
interface TrackingGroup { receipt: Receipt; nos: string[] }
const trackingModalOpen = ref(false)
const trackingGroups = ref<TrackingGroup[]>([])
const isSaving = ref(false)

function openTrackingModal(rowOrRows: Receipt | Receipt[]) {
  const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows]
  // each PO gets its own group; start with existing numbers, or one empty field
  trackingGroups.value = rows.map(r => ({
    receipt: r,
    nos: r.trackingNos.length ? [...r.trackingNos] : [''],
  }))
  trackingModalOpen.value = true
}
function closeTrackingModal() { trackingModalOpen.value = false; trackingGroups.value = [] }
function addTracking(gi: number) { trackingGroups.value[gi].nos.push('') }
function removeTracking(gi: number, i: number) { trackingGroups.value[gi].nos.splice(i, 1) }
async function saveTracking() {
  isSaving.value = true
  await new Promise(r => setTimeout(r, 600))
  for (const g of trackingGroups.value) {
    g.receipt.trackingNos = g.nos.map(t => t.trim()).filter(Boolean)
  }
  isSaving.value = false
  closeTrackingModal()
}

// Bulk "Edit tracking no." — open the same modal with all selected POs (grouped).
function bulkEditTracking(selectedRows: Set<number>, deselectAll: () => void) {
  const rows = [...selectedRows].map(i => paginated.value[i]).filter(Boolean) as Receipt[]
  if (rows.length) openTrackingModal(rows)
  deselectAll()
}

// Cancel confirmation — shared by the single-row action and the bulk action.
const cancelModalOpen = ref(false)
const receiptsToCancel = ref<Receipt[]>([])
function openCancelModal(row: Receipt) { receiptsToCancel.value = [row]; cancelModalOpen.value = true }
function openBulkCancelModal(selectedRows: Set<number>, deselectAll: () => void) {
  const rows = [...selectedRows].map(i => paginated.value[i]).filter(Boolean) as Receipt[]
  if (rows.length) { receiptsToCancel.value = rows; cancelModalOpen.value = true }
  deselectAll()
}
function closeCancelModal() { cancelModalOpen.value = false; receiptsToCancel.value = [] }
function confirmCancel() {
  for (const r of receiptsToCancel.value) cancelReceipt(r.id)
  closeCancelModal()
}

// Delete confirmation — manually-created receipts only (no real PO behind them).
const deleteModalOpen = ref(false)
const receiptToDelete = ref<Receipt | null>(null)
function openDeleteModal(row: Receipt) { receiptToDelete.value = row; deleteModalOpen.value = true }
function closeDeleteModal() { deleteModalOpen.value = false; receiptToDelete.value = null }
function confirmDelete() {
  if (receiptToDelete.value) deleteReceipt(receiptToDelete.value.id)
  closeDeleteModal()
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
    bulk-label="receipt"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
  >
    <!-- ── Bulk actions ── -->
    <!-- Purchase receiving is per-warehouse, so it's hidden for a mixed-warehouse selection.
         Edit tracking no. / Cancel don't care about warehouse. -->
    <template #bulk-actions="{ deselectAll, selectedRows }">
      <button
        v-if="!selectionSpansWarehouses(selectedRows as Set<number>)"
        class="btn-enterprise btn-enterprise--primary btn-enterprise--sm"
        @click="bulkPurchaseReceiving(deselectAll)"
      >
        Purchase receiving
      </button>
      <MpPopover id="rcv-bulk-actions" is-close-on-select placement="bottom-start" use-portal>
        <MpPopoverTrigger>
          <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm btn-enterprise--icon-after">
            Actions
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style="display:block">
              <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="bulkEditTracking(selectedRows as Set<number>, deselectAll)">Edit tracking no.</MpPopoverListItem>
            <MpPopoverListItem
              :class="css({ color: 'var(--mp-text-critical)' })"
              @click="openBulkCancelModal(selectedRows as Set<number>, deselectAll)"
            >Cancel receipt</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>
    <!-- ── Filter bar ── -->
    <template #filters>
      <div class="filter-left">
        <!-- Warehouse (hidden in WMS Ops — already scoped to the user's warehouse) -->
        <MpPopover v-if="!isScoped" id="rcv-wh-filter" is-close-on-select>
          <MpPopoverTrigger>
            <MpSelect
              id="rcv-wh-select" placeholder="Warehouse" :model-value="warehouseFilter" is-clearable
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
        <MpPopover id="rcv-status-filter" :is-close-on-select="false">
          <MpPopoverTrigger>
            <MpSelect
              id="rcv-status-select" placeholder="Status" :model-value="statusFilter.length ? 'set' : ''" is-clearable
              :class="css({ width: '180px' })" @mousedown.prevent @clear="resetStatus"
            >
              <option v-if="statusFilter.length" value="set">{{ statusLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content' })">
            <div class="status-filter-list">
              <label v-for="s in STATUS_OPTIONS" :key="s" class="status-filter-item">
                <MpCheckbox
                  :id="`rcv-status-${s}`"
                  :is-checked="statusFilter.includes(s)"
                  @change="toggleStatus(s)"
                  @click.stop
                />
                <span>{{ statusOptionLabel(s) }}</span>
              </label>
            </div>
          </MpPopoverContent>
        </MpPopover>

        <!-- Arrival date -->
        <MpPopover id="rcv-arrival-filter" :is-close-on-select="false">
          <MpPopoverTrigger>
            <MpSelect
              id="rcv-arrival-select" placeholder="Arrival date" :model-value="arrivalPreset" is-clearable
              :class="css({ width: '200px' })" @mousedown.prevent @clear="clearArrival"
            >
              <option v-if="arrivalPreset" :value="arrivalPreset">{{ arrivalLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '220px', width: 'max-content' })">
            <MpPopoverList>
              <MpPopoverListItem
                v-for="opt in arrivalPresets" :key="opt.value"
                :is-active="opt.value === arrivalPreset"
                @click="arrivalPreset = opt.value"
              >{{ opt.label }}</MpPopoverListItem>
            </MpPopoverList>
            <!-- Custom date range inputs -->
            <div v-if="arrivalPreset === 'custom'" class="arrival-custom">
              <MpDatePicker id="rcv-arrival-from" v-model="customFrom" placeholder="From" format="DD/MM/YYYY" use-portal />
              <MpDatePicker id="rcv-arrival-to" v-model="customTo" placeholder="To" format="DD/MM/YYYY" use-portal />
            </div>
          </MpPopoverContent>
        </MpPopover>
      </div>

      <div class="filter-right">
        <div class="filter-btn-group">
          <MpTooltip id="tt-rcv-airene" label="Ask Airene" placement="bottom" use-portal>
            <button class="filter-icon-btn filter-icon-btn--airene" aria-label="Ask Airene" @click="toggleAirene?.()">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
              </svg>
            </button>
          </MpTooltip>
          <ColumnSettingsMenu id="rcv-col-settings" :items="columnItems" :visibility="colVis" />
          <MpTooltip id="tt-rcv-export" label="Export" placement="bottom" use-portal>
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

    <!-- ── Cell: Purchase no. — View details chip on hover ── -->
    <template #cell-purchaseNo="{ value, row }">
      <div class="cell-with-action">
        <span class="rcv-po">
          <span class="cell-text rcv-po__no">{{ value }}</span>
          <span v-if="colVis.memo && (row as unknown as Receipt).memo" class="rcv-po__memo">{{ (row as unknown as Receipt).memo }}</span>
        </span>
        <button class="row-hover-btn" @click.stop="viewDetails(row as unknown as Receipt)">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="row-hover-btn__label">VIEW DETAILS</span>
        </button>
      </div>
    </template>

    <!-- ── Warehouse — wrap to 2 lines instead of bleeding ── -->
    <template #cell-warehouseName="{ value }">
      <span class="rcv-warehouse">{{ value }}</span>
    </template>

    <!-- ── Vendor ── -->
    <template #cell-vendor="{ value }">
      <span class="rcv-warehouse">{{ value ?? '—' }}</span>
    </template>

    <!-- ── Status badge ── -->
    <template #cell-status="{ value }">
      <ErpStatusBadge :status="(value as string)" />
    </template>

    <!-- ── Tracking no. (one PO may have several) — edit on hover ── -->
    <template #cell-trackingNos="{ value, row }">
      <div class="rcv-track-cell">
        <div v-if="(value as string[]).length" class="rcv-tracking">
          <span v-for="t in (value as string[])" :key="t" class="rcv-tracking__no">{{ t }}</span>
        </div>
        <span v-else class="rcv-tracking__empty">—</span>
        <button
          v-if="!isScoped"
          class="track-edit-btn"
          aria-label="Edit tracking no."
          @click.stop="openTrackingModal(row as unknown as Receipt)"
        >
          <MpIcon name="edit" size="sm" />
        </button>
      </div>
    </template>

    <!-- ── Numeric cells ── -->
    <template #cell-skuQty="{ value }">{{ formatNum(value as number) }}</template>
    <template #cell-purchaseQty="{ value }">{{ formatNum(value as number) }}</template>

    <!-- ── Estimated arrival ── -->
    <template #cell-estimatedArrival="{ value }">{{ formatDate(value as string) }}</template>

    <!-- ── Actions kebab ── -->
    <template #actions="{ row }">
      <MpPopover :id="`rcv-actions-${row.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <button class="row-kebab" aria-label="More actions">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="viewDetails(row as unknown as Receipt)">View details</MpPopoverListItem>
            <MpPopoverListItem
              v-if="canCreateReceivingTask((row as unknown as Receipt).id)"
              @click="purchaseReceiving(row as unknown as Receipt)"
            >Create purchase receiving</MpPopoverListItem>
            <!-- Manually-created receipts (New receipt form) have no real PO behind
                 them, so they can be deleted outright; PO-derived ones can only be
                 canceled. -->
            <MpPopoverListItem
              v-if="isManualReceipt(row as unknown as Receipt)"
              :class="css({ color: 'var(--mp-text-critical)' })"
              @click="openDeleteModal(row as unknown as Receipt)"
            >Delete</MpPopoverListItem>
            <MpPopoverListItem
              v-else
              :class="css({ color: 'var(--mp-text-critical)' })"
              @click="openCancelModal(row as unknown as Receipt)"
            >Cancel receipt</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Full empty state (first run) ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">No receipts</p>
        <p class="empty-full-desc">Receipts will appear here.</p>
      </div>
    </template>
  </ErpTablePage>

  <!-- ── Cancel confirmation modal ── -->
  <MpModal
    id="rcv-cancel-modal" :is-open="cancelModalOpen" size="sm"
    is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="closeCancelModal"
  >
    <MpModalContent>
      <MpModalHeader>Cancel receipt?<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <template v-if="receiptsToCancel.length === 1">
          Receipt {{ receiptsToCancel[0]?.number }} will be cancelled. This can't be undone.
        </template>
        <template v-else>
          {{ receiptsToCancel.length }} receipts will be cancelled. This can't be undone.
        </template>
      </MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--secondary" @click="closeCancelModal">Keep receipt</button>
          <button class="btn-enterprise btn-enterprise--danger" @click="confirmCancel">Cancel receipt</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <!-- ── Delete confirmation modal (manually-created receipts only) ── -->
  <MpModal
    id="rcv-delete-modal" :is-open="deleteModalOpen" size="sm"
    is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="closeDeleteModal"
  >
    <MpModalContent>
      <MpModalHeader>Delete receipt?<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        Receipt {{ receiptToDelete?.number }} will be permanently deleted. This can't be undone.
      </MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--secondary" @click="closeDeleteModal">Keep receipt</button>
          <button class="btn-enterprise btn-enterprise--danger" @click="confirmDelete">Delete</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <!-- ── Edit tracking no. modal (supports multiple) ── -->
  <MpModal
    id="rcv-tracking-modal" :is-open="trackingModalOpen" size="md"
    is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="closeTrackingModal"
  >
    <MpModalContent>
      <MpModalHeader>Edit tracking no.<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <div
          v-for="(g, gi) in trackingGroups"
          :key="g.receipt.id"
          class="track-modal__group"
        >
          <p class="track-modal__po">{{ g.receipt.purchaseNo }}</p>
          <div class="track-modal__list">
            <div v-for="(t, i) in g.nos" :key="i" class="track-modal__row">
              <MpInput
                :id="`rcv-track-${gi}-${i}`"
                v-model="g.nos[i]"
                placeholder="Example: SD0009583"
                is-full-width
              />
              <button class="track-modal__remove" aria-label="Remove tracking no." @click="removeTracking(gi, i)">
                <MpIcon name="minus-circular" size="sm" />
              </button>
            </div>
          </div>
          <button class="track-modal__add" @click="addTracking(gi)">
            <MpIcon name="add" size="sm" />
            Add tracking no.
          </button>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--ghost" @click="closeTrackingModal">Cancel</button>
          <button class="btn-enterprise btn-enterprise--primary" :disabled="isSaving" @click="saveTracking">{{ isSaving ? 'Saving…' : 'Save changes' }}</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>


  <!-- ── Demo scenario FAB (bottom-right) ── -->
  <MpPopover id="rcv-demo-fab" is-close-on-select use-portal placement="top-end">
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

/* Arrival custom range */
.arrival-custom {
  display: flex; flex-direction: column; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-3);
  border-top: 1px solid var(--mp-border-default);
}

/* Number cell hover chip */
.cell-with-action { position: relative; display: flex; align-items: center; width: 100%; min-width: 0; }
.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }

/* Warehouse — wrap to 2 lines (clamp) instead of overflowing into the next column */
.rcv-warehouse {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  white-space: normal;
}

/* Tracking no. — one or more, stacked; edit icon sits right next to the text (row hover) */
.rcv-track-cell { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); min-width: 0; }
.rcv-tracking { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: 0; }
.rcv-tracking__no { color: var(--mp-text-default); white-space: nowrap; }
.rcv-tracking__empty { color: var(--mp-text-secondary); }
.track-edit-btn {
  flex-shrink: 0;
  /* always laid out (space reserved) — only visibility toggles, so the row never shifts */
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-6, 24px); height: var(--mp-sizes-6, 24px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-text-secondary); visibility: hidden;
}
.track-edit-btn:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-default); }
:global(.erp-tr:hover .track-edit-btn) { visibility: visible; }

/* Edit tracking modal */
.track-modal__group + .track-modal__group {
  margin-top: var(--mp-spacing-4);
  padding-top: var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
}
.track-modal__po { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin-bottom: var(--mp-spacing-3); }
.track-modal__list { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.track-modal__row { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.track-modal__row > :first-child { flex: 1; min-width: 0; }
.track-modal__remove {
  flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-text-secondary);
}
.track-modal__remove:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-critical); }
.track-modal__add {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-1);
  margin-top: var(--mp-spacing-3); padding: 0;
  border: none; background: none; cursor: pointer;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-link, var(--mp-text-selected));
}

/* Purchase no. + memo subtitle */
.rcv-po { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: 0; }
.rcv-po__no { color: var(--mp-text-default); }
.rcv-po__memo {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-secondary);
  white-space: normal;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
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
