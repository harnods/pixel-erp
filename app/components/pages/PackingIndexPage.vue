<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import {
  MpSelect, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, MpIcon, MpTooltip,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton, MpFormControl, MpFormLabel, MpAutocomplete, MpInput, MpButton,
  css, toast,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import { useTableState } from '~/composables/useTableState'
import { packingTasksFor, packingTaskAgingDays, type PackingTask } from '~/data/packingTasks'
import { addDeliveryTask, orderHasDelivery } from '~/data/deliveryTasks'
import { getDeliveryForPackingTask } from '~/data/packingTaskDetails'
import { warehouses } from '~/data/warehouses'
import { outgoingOrders, isMarketplaceOrder } from '~/data/outgoing'
import { formatDateTime } from '~/utils/date'

const toggleAirene = inject<() => void>('toggleAirene')

// ─── Demo scenario state (FAB) ─────────────────────────────────────────────────
type DemoState = 'empty' | 'data'
const demoState = ref<DemoState>('data')
const demoStates: { value: DemoState; label: string }[] = [
  { value: 'data', label: 'With data' },
  { value: 'empty', label: 'Empty state' },
]
const route = useRoute()

const loading = ref(true)
onMounted(() => {
  setTimeout(() => { loading.value = false }, 1200)
  if (route.query.saved === '1') {
    toast.notify({ variant: 'success', title: 'Packing task saved' })
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
// Packing is per sales order — one task = one order (no bundling).
const columns: TableColumn[] = [
  { key: 'taskNo',        label: 'Number',      width: '180px', sortType: 'text' },
  { key: 'salesNo',       label: 'Sales order', width: '200px', sortType: 'text' },
  { key: 'warehouseName', label: 'Warehouse',   width: '180px', sortType: 'text' },
  { key: 'assignee',      label: 'Assignee',    width: '160px', sortType: 'text' },
  { key: 'skuQty',        label: 'SKU qty',     width: '100px', align: 'right', sortType: 'number' },
  { key: 'toPackQty',     label: 'To pack',     width: '100px', align: 'right', sortType: 'number' },
  { key: 'packedQty',     label: 'Packed qty',  width: '100px', align: 'right', sortType: 'number' },
  { key: 'status',        label: 'Status',      width: '140px', sortType: 'text' },
  { key: 'startDate',     label: 'Start date',  width: '170px', sortType: 'date' },
  { key: 'endDate',       label: 'End date',    width: '190px', sortType: 'date' },
]
// Column show/hide — Number stays on; the sort menu's "Hide column" flips these off,
// the ColumnSettings menu turns them back on.
const colVis = reactive<Record<string, boolean>>(Object.fromEntries(columns.map(c => [c.key, true])))
const visibleColumns = computed(() => columns.filter(c => colVis[c.key]))
const columnItems = columns.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
function hideColumn(key: string) { colVis[key] = false }

// ─── Filters — Status + Warehouse (hidden when scoped) ───
const warehouseFilter = ref('')
const statusFilter = ref('')

const baseTasks = computed<PackingTask[]>(() =>
  demoState.value === 'data'
    ? packingTasksFor(isScoped.value ? scopedWarehouseIds.value : undefined)
    : [],
)

const warehouseOptions = computed(() => {
  const src = isScoped.value
    ? warehouses.filter(w => scopedWarehouseIds.value.includes(w.id))
    : warehouses.filter(w => !w.isDefault && w.status === 'active')
  return src.map(w => ({ label: w.name, value: w.id }))
})
const statusOptions = [
  { label: 'Open',        value: 'open' },
  { label: 'In process',  value: 'in progress' },
  { label: 'Completed',   value: 'completed' },
  { label: 'Canceled',    value: 'canceled' },
]
const warehouseLabel = computed(() => warehouseOptions.value.find(o => o.value === warehouseFilter.value)?.label ?? '')
const statusLabel    = computed(() => statusOptions.find(o => o.value === statusFilter.value)?.label ?? '')

const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<PackingTask>(baseTasks, {
  perPage: 25,
  filterFn: (row, s) => {
    const matchesSearch = !s
      || row.taskNo.toLowerCase().includes(s)
      || row.salesNo.toLowerCase().includes(s)
      || row.warehouseName.toLowerCase().includes(s)
    const matchesWarehouse = !warehouseFilter.value || row.warehouseId === warehouseFilter.value
    const matchesStatus    = !statusFilter.value    || row.status === statusFilter.value
    return matchesSearch && matchesWarehouse && matchesStatus
  },
})
watch([warehouseFilter, statusFilter], () => setPage(1))

const hasActiveFilter = computed(() => !!search.value || !!warehouseFilter.value || !!statusFilter.value)
function clearFilters() { search.value = ''; warehouseFilter.value = ''; statusFilter.value = '' }

// ─── Formatters ────────────────────────────────────────────────────────────────
function formatNum(n: number) { return n.toLocaleString('id-ID') }
function agingDays(t: PackingTask) { return packingTaskAgingDays(t) }

// ─── Row actions ──────────────────────────────────────────────────────────────
const router = useRouter()
function viewDetails(row: PackingTask) { router.push(`/packing/${row.id}`) }

// A completed packing task can create a delivery only if its sales order doesn't
// already have a live delivery — one delivery per order (an order already being
// delivered/shipped can't spawn another, even from a different packing task).
function canCreateShipping(t: PackingTask) {
  return t.status === 'completed'
    && getDeliveryForPackingTask(t.id).length === 0
    && !orderHasDelivery(t.salesOrderId)
}
// A completed task whose order already has a delivery can't be selected for the
// bulk "Create delivery" action — so a duplicate can't be started from bulk.
function rowNotSelectable(row: Record<string, unknown>) {
  const t = row as unknown as PackingTask
  return t.status === 'completed'
    && (getDeliveryForPackingTask(t.id).length > 0 || orderHasDelivery(t.salesOrderId))
}

// ── Create delivery → pick an assignee, then make a delivery per packing task ──
const ASSIGNEES = [
  { id: 'u01', name: 'Budi Santoso',    initials: 'BS', hue: 210 },
  { id: 'u02', name: 'Dewi Rahayu',     initials: 'DR', hue: 145 },
  { id: 'u03', name: 'Rizki Pratama',   initials: 'RP', hue: 30  },
  { id: 'u04', name: 'Agus Firmansyah', initials: 'AF', hue: 280 },
  { id: 'u05', name: 'Sari Indah',      initials: 'SI', hue: 320 },
  { id: 'u06', name: 'Hendra Wijaya',   initials: 'HW', hue: 170 },
  { id: 'u07', name: 'Citra Kusuma',    initials: 'CK', hue: 55  },
  { id: 'u08', name: 'Galih Nugraha',   initials: 'GN', hue: 100 },
]
const shipModalOpen = ref(false)
const shipQueue = ref<PackingTask[]>([])
const shipAssigneeId = ref('')
const shipAssigneeError = ref(false)
const shipAssigneeLabel = computed(() => ASSIGNEES.find(a => a.id === shipAssigneeId.value)?.name ?? '')
// Courier + tracking captured here for a single shipment (scan label auto-fills);
// for bulk they're filled later at handover (per package).
const shipScan = ref('')
const shipCourier = ref('')
const shipTracking = ref('')
const shipSingle = computed(() => shipQueue.value.length === 1)
const SHIP_COURIERS = ['JNE', 'SiCepat', 'J&T Express', 'AnterAja', 'Internal fleet']
function marketplaceShipInfo(salesNo: string) {
  let h = 0; for (const c of salesNo) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return { courier: SHIP_COURIERS[h % 4]!, trackingNo: 'SD' + (1_000_000 + (h % 9_000_000)) }
}
// A single marketplace shipment already carries courier + tracking (fixed) → show them
// locked; other single shipments let the user fill them in (not required).
const shipHasFixedCourier = computed(() =>
  shipSingle.value && isMarketplaceOrder(outgoingOrders.find(o => o.id === shipQueue.value[0]?.salesOrderId)),
)

function openShipModal(tasks: PackingTask[]) {
  shipQueue.value = tasks
  shipAssigneeId.value = ''
  shipAssigneeError.value = false
  const single = tasks.length === 1 ? tasks[0] : undefined
  const order = single ? outgoingOrders.find(o => o.id === single.salesOrderId) : undefined
  if (single && isMarketplaceOrder(order)) {
    const info = marketplaceShipInfo(single.salesNo)
    shipCourier.value = info.courier
    shipTracking.value = info.trackingNo
    shipScan.value = info.trackingNo
  } else {
    shipScan.value = ''
    shipCourier.value = ''
    shipTracking.value = ''
  }
  shipModalOpen.value = true
}
// Scanning a shipping label (issued by OMS) → auto-fills courier + tracking (dummy random).
function applyShipScan() {
  if (shipHasFixedCourier.value) return // fixed
  shipCourier.value = SHIP_COURIERS[Math.floor(Math.random() * SHIP_COURIERS.length)]!
  shipTracking.value = 'SD' + Math.floor(1_000_000 + Math.random() * 9_000_000)
  if (!shipScan.value.trim()) shipScan.value = shipTracking.value
}
function createShipping(t: PackingTask) { openShipModal([t]) }
// Bulk → one delivery per selected completed packing task (delivery is per order).
function bulkCreateShipping(selectedRows: Set<number>, deselectAll: () => void) {
  const rows = [...selectedRows].map(i => paginated.value[i]).filter(Boolean) as PackingTask[]
  const eligible = rows.filter(canCreateShipping)
  deselectAll()
  if (eligible.length) {
    openShipModal(eligible)
  } else {
    toast.notify({ variant: 'error', title: 'Delivery already exists', description: 'The selected order(s) already have a delivery task.' })
  }
}
function confirmShipping() {
  if (!shipAssigneeId.value) { shipAssigneeError.value = true; return }
  let created = 0
  for (const t of shipQueue.value) {
    // Skip orders that already have a live delivery — including duplicates within
    // this same batch (addDeliveryTask updates the store immediately).
    if (orderHasDelivery(t.salesOrderId)) continue
    created++
    addDeliveryTask({
      salesOrderId: t.salesOrderId, salesNo: t.salesNo,
      packingTaskId: t.id, packingTaskNo: t.taskNo,
      warehouseId: t.warehouseId, warehouseName: t.warehouseName,
      assignee: shipAssigneeLabel.value, skuQty: t.skuQty, toShipQty: t.packedQty,
      deliveryMethod: (shipSingle.value && (shipHasFixedCourier.value || shipCourier.value.trim())) ? 'online' : (shipSingle.value ? 'self' : 'online'),
      courier: shipSingle.value ? (shipCourier.value.trim() || undefined) : undefined,
      trackingNo: shipSingle.value ? (shipTracking.value.trim() || undefined) : undefined,
    })
  }
  shipModalOpen.value = false
  if (!created) {
    toast.notify({ variant: 'error', title: 'Delivery already exists', description: 'The selected order(s) already have a delivery task.' })
    return
  }
  router.push({ path: '/outbound-delivery', query: { tab: 'Delivery', saved: '1' } })
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
    :row-disabled="rowNotSelectable"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
  >
    <!-- ── Bulk actions ── -->
    <template #bulk-actions="{ deselectAll, selectedRows }">
      <button
        class="btn-enterprise btn-enterprise--primary btn-enterprise--sm"
        @click="bulkCreateShipping(selectedRows as Set<number>, deselectAll)"
      >
        Create delivery
      </button>
    </template>
    <!-- ── Filter bar ── -->
    <template #filters>
      <div class="filter-left">
        <MpPopover v-if="!isScoped" id="pack-wh-filter" is-close-on-select>
          <MpPopoverTrigger>
            <MpSelect
              id="pack-wh-select" placeholder="Warehouse" :model-value="warehouseFilter" is-clearable
              :class="css({ width: '160px' })" @mousedown.prevent @clear="warehouseFilter = ''"
            >
              <option v-if="warehouseFilter" :value="warehouseFilter">{{ warehouseLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', maxWidth: '320px' })">
            <MpPopoverList>
              <MpPopoverListItem
                v-for="opt in warehouseOptions" :key="opt.value"
                :is-active="opt.value === warehouseFilter" @click="warehouseFilter = opt.value"
              >{{ opt.label }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <MpPopover id="pack-status-filter" is-close-on-select>
          <MpPopoverTrigger>
            <MpSelect
              id="pack-status-select" placeholder="Status" :model-value="statusFilter" is-clearable
              :class="css({ width: '160px' })" @mousedown.prevent @clear="statusFilter = ''"
            >
              <option v-if="statusFilter" :value="statusFilter">{{ statusLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content' })">
            <MpPopoverList>
              <MpPopoverListItem
                v-for="opt in statusOptions" :key="opt.value"
                :is-active="opt.value === statusFilter" @click="statusFilter = opt.value"
              >{{ opt.label }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>

      <div class="filter-right">
        <div class="filter-btn-group">
          <ColumnSettingsMenu id="pack-col-settings" :items="columnItems" :visibility="colVis" />
          <MpTooltip id="tt-pack-airene" label="Ask Airene" placement="bottom" use-portal>
            <button class="filter-icon-btn filter-icon-btn--airene" aria-label="Ask Airene" @click="toggleAirene?.()">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
              </svg>
            </button>
          </MpTooltip>
          <MpTooltip id="tt-pack-export" label="Export" placement="bottom" use-portal>
            <button class="filter-icon-btn" aria-label="Export"><MpIcon name="download" size="md" /></button>
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

    <!-- ── Number — View details chip on hover ── -->
    <template #cell-taskNo="{ value, row }">
      <div class="cell-with-action">
        <span class="cell-text pack-no">{{ value }}</span>
        <button class="row-hover-btn" @click.stop="viewDetails(row as unknown as PackingTask)">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="row-hover-btn__label">VIEW DETAILS</span>
        </button>
      </div>
    </template>

    <!-- ── Sales order (single) ── -->
    <template #cell-salesNo="{ value }">
      <span class="pack-so">{{ value }}</span>
    </template>

    <!-- ── Warehouse ── -->
    <template #cell-warehouseName="{ value }">
      <span class="pack-warehouse">{{ value }}</span>
    </template>

    <!-- ── Numeric cells ── -->
    <template #cell-skuQty="{ value }">{{ formatNum(value as number) }}</template>
    <template #cell-toPackQty="{ value }">{{ formatNum(value as number) }}</template>
    <template #cell-packedQty="{ value }">{{ formatNum(value as number) }}</template>

    <!-- ── Status ── -->
    <template #cell-status="{ value }"><ErpStatusBadge :status="value as string" /></template>

    <!-- ── Start / End date + aging ── -->
    <template #cell-startDate="{ value }">{{ value ? formatDateTime(value as string) : '—' }}</template>
    <template #cell-endDate="{ row }">
      <span class="pack-end">
        <span v-if="(row as unknown as PackingTask).endDate">{{ formatDateTime((row as unknown as PackingTask).endDate) }}</span>
        <span v-else class="pack-end__ongoing">—</span>
        <span v-if="agingDays(row as unknown as PackingTask) > 1" class="pack-aging">{{ agingDays(row as unknown as PackingTask) }} days</span>
      </span>
    </template>

    <!-- ── Actions kebab ── -->
    <template #actions="{ row }">
      <MpPopover :id="`pack-actions-${row.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <button class="row-kebab" aria-label="More actions">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="viewDetails(row as unknown as PackingTask)">View details</MpPopoverListItem>
            <MpPopoverListItem
              v-if="canCreateShipping(row as unknown as PackingTask)"
              @click="createShipping(row as unknown as PackingTask)"
            >Create delivery</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Full empty state ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">No packing tasks</p>
        <p class="empty-full-desc">Picked orders waiting to be packed will appear here.</p>
      </div>
    </template>
  </ErpTablePage>

  <!-- ── Demo scenario FAB ── -->
  <MpPopover id="pack-demo-fab" is-close-on-select use-portal placement="top-end">
    <MpPopoverTrigger>
      <button class="demo-fab" aria-label="Change scenario state"><MpIcon name="sliders" size="md" color="icon.inverse" /></button>
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

  <!-- ── Create delivery: pick assignee ── -->
  <MpModal id="pack-ship-modal" :is-open="shipModalOpen" size="lg" is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="shipModalOpen = false">
    <MpModalContent>
      <MpModalHeader>Create delivery<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <MpFormControl id="pack-ship-assignee" is-required :is-invalid="shipAssigneeError" :class="css({ marginBottom: shipSingle ? '16px' : '0' })">
          <MpFormLabel>Assignee</MpFormLabel>
          <MpAutocomplete
            id="pack-ship-assignee-ac"
            v-model="shipAssigneeId"
            :data="ASSIGNEES"
            label-prop="name"
            value-prop="id"
            placeholder="Select assignee"
            is-searchable is-clearable use-portal is-full-width
            :is-invalid="shipAssigneeError"
          />
        </MpFormControl>

        <!-- Courier + AWB (single shipment): fixed & disabled when the order carries
             them, else the user can fill them (not required) -->
        <template v-if="shipSingle">
          <MpFormControl v-if="!shipHasFixedCourier" id="pack-ship-scan" :class="css({ marginBottom: '16px' })">
            <MpFormLabel>Scan shipping label</MpFormLabel>
            <div class="ship-scan-field">
              <MpInput id="pack-ship-scan-input" v-model="shipScan" placeholder="Scan or paste label…" is-full-width @keyup.enter="applyShipScan" />
              <MpButton variant="secondary" is-rounded class="erp-outline-btn" @click="applyShipScan">Apply</MpButton>
            </div>
          </MpFormControl>
          <div class="ship-modal-grid">
            <MpFormControl id="pack-ship-courier">
              <MpFormLabel>Courier</MpFormLabel>
              <MpInput id="pack-ship-courier-input" v-model="shipCourier" placeholder="e.g. JNE, SiCepat" is-full-width :is-disabled="shipHasFixedCourier" />
            </MpFormControl>
            <MpFormControl id="pack-ship-tracking">
              <MpFormLabel>AWB / tracking no.</MpFormLabel>
              <MpInput id="pack-ship-tracking-input" v-model="shipTracking" placeholder="e.g. SD0009583" is-full-width :is-disabled="shipHasFixedCourier" />
            </MpFormControl>
          </div>
        </template>
      </MpModalBody>
      <MpModalFooter>
        <div class="ship-modal-footer">
          <MpButton variant="ghost" is-rounded @click="shipModalOpen = false">Cancel</MpButton>
          <MpButton variant="primary" is-rounded @click="confirmShipping">Create delivery</MpButton>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.filter-left  { display: flex; align-items: center; gap: var(--mp-spacing-2); }
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

/* Number cell — View details chip on hover */
.cell-with-action { position: relative; display: flex; align-items: center; width: 100%; min-width: 0; }
.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.pack-no { color: var(--mp-text-default); }
.pack-so { color: var(--mp-text-default); }
.row-hover-btn {
  position: absolute; right: 0; top: 50%; transform: translateY(-50%); display: none;
  align-items: center; gap: var(--mp-spacing-1\.5);
  padding: var(--mp-spacing-1) var(--mp-spacing-1\.5);
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-sm); cursor: pointer; white-space: nowrap; line-height: 1; color: var(--mp-text-secondary);
}
.row-hover-btn__label {
  font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xs, 12px); color: var(--mp-text-secondary); text-transform: uppercase;
}
:global(.erp-tr:hover .row-hover-btn) { display: flex; }

.pack-warehouse {
  white-space: normal; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden;
}

/* Start/End date + aging badge */
.pack-end { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.pack-end__ongoing { color: var(--mp-text-secondary); }
.pack-aging {
  display: inline-flex; align-items: center; padding: 0 var(--mp-spacing-1\.5);
  border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral-subtle, #f1f5f9);
  color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-lg, 20px); white-space: nowrap;
}

.row-kebab {
  display: flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-5, 20px); margin-left: auto;
  border: none; background: none; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-secondary);
}
.row-kebab svg { display: block; width: var(--mp-sizes-5, 20px); height: var(--mp-sizes-5, 20px); }
.row-kebab:hover { background: var(--mp-background-neutral-hovered); }

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
.ship-modal-footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }
/* secondary/outline button: gray-bold border + default text */
:deep(.erp-outline-btn) { border-color: var(--mp-border-bold) !important; color: var(--mp-text-default) !important; }
.ship-modal-note { margin: 0 0 var(--mp-spacing-4); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-md); }
.ship-scan-field { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.ship-scan-field > :first-child { flex: 1; min-width: 0; }
.ship-modal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-4); }
</style>
