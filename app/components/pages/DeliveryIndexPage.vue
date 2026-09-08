<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  MpSelect, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, MpIcon, MpTooltip, MpCheckbox, css, toast,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import SourceLabel from '~/components/patterns/SourceLabel.vue'
import { useTableState } from '~/composables/useTableState'
import { deliveryTasksFor, DELIVERY_COURIERS, type DeliveryTask } from '~/data/deliveryTasks'
import { outgoingOrders, deliveryPostingStatusOf, deliveryDocumentRoute, type DeliveryDocumentRef } from '~/data/outgoing'
import { posterKindFor, bindSeededDocument } from '~/data/deliveryDocuments'
import { warehouses } from '~/data/warehouses'
import { formatDateTime } from '~/utils/date'
import { assigneeDisplayName } from '~/data/users'

// A delivery's order source (Sales Order / Manual / marketplace channel) — looked
// up from the order since DeliveryTask itself doesn't carry it.
type DeliveryRow = DeliveryTask & { source: string }

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
    toast.notify({ variant: 'success', title: t('Delivery saved') , maxWidth: 'max-content'})
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
// Delivery is per sales order — one delivery = one order.
const columns: TableColumn[] = [
  { key: 'salesNo',       label: 'Sales order no.', kind: 'number', sortType: 'text' },
  { key: 'packingTaskNo', label: 'Packing no.',     kind: 'number', sortType: 'text' },
  { key: 'taskNo',        label: 'Delivery no.',    kind: 'number', sortType: 'text' },
  { key: 'source',        label: 'Source',          sortType: 'text' },
  { key: 'warehouseName', label: 'Warehouse',       kind: 'name', sortType: 'text' },
  { key: 'assignee',      label: 'Assignee',    kind: 'name', sortType: 'text' },
  { key: 'courier',       label: 'Courier',     kind: 'name', sortType: 'text' },
  { key: 'trackingNo',    label: 'Tracking no.', kind: 'number', sortType: 'text' },
  { key: 'skuQty',        label: 'SKU qty',     align: 'right', sortType: 'number' },
  { key: 'orderQty',      label: 'Order qty',   align: 'right', sortType: 'number' },
  { key: 'toShipQty',     label: 'To ship',     align: 'right', sortType: 'number' },
  // D5 "Delivery Document Details" — a WH manager needs to see WHICH shipped
  // outbound already has its Sales Delivery / Stock Movement Out, and which is
  // still holded waiting for the source to trigger it (A6 manual_trigger_delivery).
  { key: 'deliveryDoc',   label: 'Delivery document', kind: 'name', sortType: 'text' },
  { key: 'status',        label: 'Status',      kind: 'status', sortType: 'text' },
  { key: 'shippedDate',   label: 'Ship date',   kind: 'date', sortType: 'date' },
]
// Column show/hide — Delivery no. is hidden by default; Assignee is shown (the
// person handling the shipping task: the packer pre-handover, then the shipment
// creator once a shipment doc is made). The sort menu's "Hide column" flips others
// off, the ColumnSettings menu turns them back on.
const colVis = reactive<Record<string, boolean>>(
  Object.fromEntries(columns.map(c => [c.key, c.key !== 'taskNo'])),
)
const visibleColumns = computed(() => columns.filter(c => colVis[c.key]))
const columnItems = columns.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
function hideColumn(key: string) { colVis[key] = false }

// ─── Filters — Status + Warehouse (hidden when scoped) ───
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
const courierFilter = ref<string[]>([])

// ─── Delivery-document posting filter (D5) — "which shipping task already has a
// delivery document, and which is not yet (holded)". Physical status and posting
// status are separate fields (D1 AC#8), so this is its own filter rather than
// another Status value. ─────────────────────────────────────────────────────────
const postingFilter = ref<string[]>([])
const postingOptions = [
  { value: 'posted', label: t('Posted') },
  { value: 'held', label: t('Not yet posted') },
]
/** A shipping task's posting state, read from the outbound it belongs to. Only a
 *  SHIPPED task can have posted — nothing posts before the ship event. */
function postingStateOf(row: { salesOrderId: string; status: string }): 'posted' | 'held' {
  const order = outgoingOrders.find(o => o.id === row.salesOrderId)
  return order && deliveryPostingStatusOf(order) === 'posted' ? 'posted' : 'held'
}
/** The delivery document behind a shipped row, when one posted.
 *
 *  Prefers what the poster actually recorded. Orders that shipped in the seed have
 *  no record, so they fall back to a deterministic binding — the poster KIND is
 *  still decided by the package, which is why WMS Standalone never shows a Sales
 *  Delivery here even for a Sales Order source (no costing, no JE, so an accounting
 *  document can't be the poster). */
function deliveryDocOf(row: { salesOrderId: string; status: string; source: string }): DeliveryDocumentRef | undefined {
  if (postingStateOf(row) !== 'posted') return undefined
  const order = outgoingOrders.find(o => o.id === row.salesOrderId)
  if (!order) return undefined
  const recorded = order.deliveryDocument
  // A document recorded under the other package is not this package's poster.
  if (recorded && recorded.kind === posterKindFor(order)) return recorded
  return bindSeededDocument(order, posterKindFor(order))
}

/** Fallback text when there is no document to link: why there isn't one. */
function deliveryDocLabel(row: { salesOrderId: string; status: string; source: string }): string {
  return row.status === 'shipped' ? t('Held') : '—'
}
const postingLabel = computed(() => {
  const n = postingFilter.value.length
  if (!n) return ''
  if (n === 1) return postingOptions.find(o => o.value === postingFilter.value[0])?.label ?? ''
  return `${n} ${t('selected')}`
})
function togglePosting(v: string) {
  const idx = postingFilter.value.indexOf(v)
  if (idx >= 0) postingFilter.value = postingFilter.value.filter(x => x !== v)
  else postingFilter.value = [...postingFilter.value, v]
}

const baseTasks = computed<DeliveryRow[]>(() =>
  demoState.value === 'data'
    ? deliveryTasksFor(isScoped.value ? scopedWarehouseIds.value : undefined)
        .map(t => ({ ...t, source: outgoingOrders.find(o => o.id === t.salesOrderId)?.source ?? '' }))
    : [],
)

const warehouseOptions = computed(() => {
  const src = isScoped.value
    ? warehouses.filter(w => scopedWarehouseIds.value.includes(w.id))
    : warehouses.filter(w => !w.isDefault && w.status === 'active')
  return src.map(w => ({ label: w.name, value: w.id }))
})
const statusOptions = [
  { label: t('Ready to ship'),     value: 'ready to ship' },
  { label: t('Out for delivery'),  value: 'out for delivery' },
  { label: t('Shipped'),           value: 'shipped' },
  { label: t('Canceled'),          value: 'canceled' },
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

const courierOptions = DELIVERY_COURIERS.map(c => ({ label: c, value: c }))
// Searchable courier filter — the list can be long, so filter by typed text
// (the popover itself caps the visible height to ~5 and scrolls; see CSS).
const courierSearch = ref('')
const filteredCourierOptions = computed(() => {
  const q = courierSearch.value.trim().toLowerCase()
  return q ? courierOptions.filter(o => o.label.toLowerCase().includes(q)) : courierOptions
})
const courierLabel = computed(() => {
  const n = courierFilter.value.length
  if (n === 0) return ''
  if (n === 1) return courierFilter.value[0] ?? ''
  return `${n} couriers`
})
function toggleCourier(v: string) {
  const idx = courierFilter.value.indexOf(v)
  if (idx >= 0) courierFilter.value = courierFilter.value.filter(x => x !== v)
  else courierFilter.value = [...courierFilter.value, v]
}

const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<DeliveryRow>(baseTasks, {
  perPage: 25,
  filterFn: (row, s) => {
    const matchesSearch = !s
      || row.taskNo.toLowerCase().includes(s)
      || row.salesNo.toLowerCase().includes(s)
      || row.warehouseName.toLowerCase().includes(s)
      || row.source.toLowerCase().includes(s)
    const matchesWarehouse = !warehouseFilter.value.length || warehouseFilter.value.includes(row.warehouseId)
    const matchesStatus    = !statusFilter.value.length || statusFilter.value.includes(row.status)
    const matchesCourier   = !courierFilter.value.length || courierFilter.value.includes(row.courier ?? '')
    const matchesPosting   = !postingFilter.value.length || postingFilter.value.includes(postingStateOf(row))
    return matchesSearch && matchesWarehouse && matchesStatus && matchesCourier && matchesPosting
  },
})
watch([warehouseFilter, statusFilter, courierFilter, postingFilter], () => setPage(1))

const hasActiveFilter = computed(() => !!search.value || warehouseFilter.value.length > 0 || statusFilter.value.length > 0 || courierFilter.value.length > 0 || postingFilter.value.length > 0)
function clearFilters() { search.value = ''; warehouseFilter.value = []; statusFilter.value = []; courierFilter.value = []; postingFilter.value = [] }

// ─── Create shipment for every ready-to-ship delivery under one courier — lets the
// user filter to a courier and hand the whole batch over without ticking rows one
// by one. Mirrors bulkHandoverable's same-warehouse rule since a handover batch
// ships from a single warehouse. ────────────────────────────────────────────────
const courierShipmentRows = computed<DeliveryRow[]>(() => {
  if (courierFilter.value.length !== 1) return []
  const c = courierFilter.value[0]!
  return baseTasks.value.filter(t =>
    t.status === 'ready to ship'
    && (t.courier ?? '') === c
    && (!warehouseFilter.value.length || warehouseFilter.value.includes(t.warehouseId)),
  )
})
const courierShipmentSameWarehouse = computed(() => {
  const rows = courierShipmentRows.value
  if (!rows.length) return false
  const wh = rows[0]!.warehouseId
  return rows.every(t => t.warehouseId === wh)
})
function createShipmentForCourier() {
  if (!courierShipmentSameWarehouse.value) return
  router.push({
    path: '/outbound-delivery/handover/create',
    query: { deliveryIds: courierShipmentRows.value.map(t => t.id).join(',') },
  })
}

// ─── Formatters ────────────────────────────────────────────────────────────────
function formatNum(n: number) { return n.toLocaleString('id-ID') }

// ─── Row actions ──────────────────────────────────────────────────────────────
const router = useRouter()
function viewDetails(row: DeliveryTask) { router.push(`/delivery/${row.id}`) }
function handoverRow(row: DeliveryTask) {
  router.push({ path: '/outbound-delivery/handover/create', query: { deliveryIds: row.id } })
}

// ─── Bulk → hand several ready-to-ship deliveries over to the courier at once ────
function selectedDeliveriesOf(sel: Set<number>): DeliveryTask[] {
  return [...sel].map(i => paginated.value[i]).filter(Boolean) as DeliveryTask[]
}
// A handover batch is single-warehouse — show the bulk action only when every
// selected delivery is ready to ship AND from the same warehouse.
function bulkHandoverable(sel: Set<number>): boolean {
  const rows = selectedDeliveriesOf(sel)
  if (!rows.length) return false
  const wh = rows[0]!.warehouseId
  return rows.every(t => t.warehouseId === wh && t.status === 'ready to ship')
}
function bulkCreateHandover(sel: Set<number>, deselectAll: () => void) {
  const rows = selectedDeliveriesOf(sel)
  if (!rows.length) return
  router.push({ path: '/outbound-delivery/handover/create', query: { deliveryIds: rows.map(t => t.id).join(',') } })
  deselectAll()
}
// Why "Create shipment" is hidden — a shipment batch is single-warehouse and only
// groups ready-to-ship deliveries, so tell the operator which rule blocked it.
function selectionSpansMultipleWarehouses(sel: Set<number>): boolean {
  return new Set(selectedDeliveriesOf(sel).map(t => t.warehouseId)).size > 1
}
function selectionHasNonReady(sel: Set<number>): boolean {
  return selectedDeliveriesOf(sel).some(t => t.status !== 'ready to ship')
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
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
  >
    <!-- ── Bulk bar → handover the selected ready-to-ship deliveries at once ── -->
    <template #bulk-actions="{ deselectAll, selectedRows }">
      <button
        v-if="bulkHandoverable(selectedRows as Set<number>)"
        class="btn-enterprise btn-enterprise--primary btn-enterprise--sm"
        @click="bulkCreateHandover(selectedRows as Set<number>, deselectAll)"
      >
        {{ t('Create shipment') }}
      </button>
      <span v-else-if="selectionSpansMultipleWarehouses(selectedRows as Set<number>)" class="del-bulk-hint">
        {{ t('Select deliveries from a single warehouse to create a shipment') }}
      </span>
      <span v-else-if="selectionHasNonReady(selectedRows as Set<number>)" class="del-bulk-hint">
        {{ t('Only ready-to-ship deliveries can be grouped into a shipment') }}
      </span>
    </template>

    <!-- ── Filter bar ── -->
    <template #filters>
      <div class="filter-left">
        <MpPopover v-if="!isScoped" id="del-wh-filter" :is-close-on-select="false">
          <MpPopoverTrigger>
            <MpSelect
              id="del-wh-select" :placeholder="t('Warehouse')"
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
                  :id="`del-wh-${opt.value}`"
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

        <MpPopover id="del-status-filter" :is-close-on-select="false">
          <MpPopoverTrigger>
            <MpSelect
              id="del-status-select" :placeholder="t('Status')" :model-value="statusFilter.length ? 'set' : ''" is-clearable
              :class="css({ width: '160px' })" @mousedown.prevent @clear="statusFilter = []"
            >
              <option v-if="statusFilter.length" value="set">{{ statusLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content' })">
            <div class="checkbox-filter-list">
              <label v-for="opt in statusOptions" :key="opt.value" class="checkbox-filter-item">
                <MpCheckbox
                  :id="`del-status-${opt.value}`"
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

        <MpPopover id="del-courier-filter" :is-close-on-select="false">
          <MpPopoverTrigger>
            <MpSelect
              id="del-courier-select" :placeholder="t('Courier')" :model-value="courierFilter.length ? 'set' : ''" is-clearable
              :class="css({ width: '160px' })" @mousedown.prevent @clear="courierFilter = []"
            >
              <option v-if="courierFilter.length" value="set">{{ courierLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', maxWidth: '280px' })">
            <div class="courier-filter">
              <div class="courier-filter-search">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                <input v-model="courierSearch" class="courier-filter-search-input" type="text" :placeholder="t('Search courier...')" @click.stop @keydown.stop />
              </div>
              <div class="courier-filter-scroll">
                <label v-for="opt in filteredCourierOptions" :key="opt.value" class="checkbox-filter-item">
                  <MpCheckbox
                    :id="`del-courier-${opt.value}`"
                    :is-checked="courierFilter.includes(opt.value)"
                    @change="toggleCourier(opt.value)"
                    @click.stop
                  >
                    {{ opt.label }}
                  </MpCheckbox>
                </label>
                <p v-if="!filteredCourierOptions.length" class="courier-filter-empty">{{ t('No couriers found') }}</p>
              </div>
            </div>
          </MpPopoverContent>
        </MpPopover>

        <!-- Delivery document (D5) — posted vs not yet (holded). Separate from
             Status: physical progress and posting never collapse (D1 AC#8). -->
        <MpPopover id="del-posting-filter" use-portal :is-keep-alive="false" placement="bottom-start">
          <MpPopoverTrigger>
            <MpSelect
              id="del-posting-select" :placeholder="t('Delivery document')" :model-value="postingFilter.length ? 'set' : ''" is-clearable
              :class="css({ width: '180px' })" @mousedown.prevent @clear="postingFilter = []"
            >
              <option v-if="postingFilter.length" value="set">{{ postingLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '190px', width: 'max-content' })">
            <div class="checkbox-filter-list">
              <div v-for="opt in postingOptions" :key="opt.value" class="checkbox-filter-item">
                <MpCheckbox
                  :id="`del-posting-${opt.value}`"
                  :is-checked="postingFilter.includes(opt.value)"
                  @change="togglePosting(opt.value)"
                  @click.stop
                >
                  {{ opt.label }}
                </MpCheckbox>
              </div>
            </div>
          </MpPopoverContent>
        </MpPopover>

        <button
          v-if="courierShipmentSameWarehouse"
          class="btn-enterprise btn-enterprise--primary btn-enterprise--sm"
          @click="createShipmentForCourier"
        >
          {{ t('Create shipment') }} ({{ courierShipmentRows.length }})
        </button>
      </div>

      <div class="filter-right">
        <div class="filter-btn-group">
          <MpTooltip id="tt-del-airene" :label="t('Ask Airene')" placement="bottom" use-portal>
            <button class="filter-icon-btn filter-icon-btn--airene" :aria-label="t('Ask Airene')" @click="toggleAirene?.()">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
              </svg>
            </button>
          </MpTooltip>
          <ColumnSettingsMenu id="del-col-settings" :items="columnItems" :visibility="colVis" />
          <MpTooltip id="tt-del-export" :label="t('Export')" placement="bottom" use-portal>
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

    <!-- ── Sales order no. — View details chip opens the sales order detail ── -->
    <template #cell-salesNo="{ value, row }">
      <a class="cell-link cell-text del-so" @click.stop="router.push(`/outbound-delivery/${(row as unknown as DeliveryTask).salesOrderId}`)">{{ value }}</a>
    </template>

    <!-- ── Packing no. — joins all covered packing tasks when a delivery bundles
         several; View details chip opens the (primary) packing task on hover ── -->
    <template #cell-packingTaskNo="{ value, row }">
      <a
        v-if="(row as unknown as DeliveryTask).packingTaskId"
        class="cell-link cell-text del-no"
        @click.stop="router.push(`/packing/${(row as unknown as DeliveryTask).packingTaskId}`)"
      >{{ (row as unknown as DeliveryTask).packingTaskNos?.length
          ? (row as unknown as DeliveryTask).packingTaskNos!.join(', ')
          : (value || '—') }}</a>
      <span v-else class="cell-text del-no">{{ (row as unknown as DeliveryTask).packingTaskNos?.length
          ? (row as unknown as DeliveryTask).packingTaskNos!.join(', ')
          : (value || '—') }}</span>
    </template>

    <!-- ── Delivery no. ── -->
    <template #cell-taskNo="{ value }">
      <span class="del-no">{{ value }}</span>
    </template>

    <!-- ── Source — wrap to 2 lines instead of bleeding ── -->
    <template #cell-source="{ value }">
      <span class="del-source"><SourceLabel :source="value as string" /></span>
    </template>

    <!-- ── Warehouse — View details chip on hover ── -->
    <template #cell-warehouseName="{ value, row }">
      <a class="cell-link del-warehouse" @click.stop="router.push(`/warehouses/${(row as unknown as DeliveryTask).warehouseId}`)">{{ value }}</a>
    </template>

    <!-- ── Assignee ── -->
    <template #cell-assignee="{ value }">{{ assigneeDisplayName(value as string) || t('Unassigned') }}</template>

    <!-- ── Delivery document (D5) — the document if it posted, "Held" once shipped
         without one, an em dash before the ship event. ── -->
    <template #cell-deliveryDoc="{ row }">
      <a
        v-if="deliveryDocOf(row as unknown as DeliveryRow)"
        class="cell-link cell-text"
        @click.stop="router.push(deliveryDocumentRoute(deliveryDocOf(row as unknown as DeliveryRow)!))"
      >{{ deliveryDocOf(row as unknown as DeliveryRow)!.number }}</a>
      <span v-else :class="{ 'del-doc-held': (row as unknown as DeliveryRow).status === 'shipped' }">
        {{ deliveryDocLabel(row as unknown as DeliveryRow) }}
      </span>
    </template>

    <!-- ── Numeric cells ── -->
    <template #cell-skuQty="{ value }">{{ formatNum(value as number) }}</template>
    <template #cell-orderQty="{ value }">{{ formatNum(value as number) }}</template>
    <template #cell-toShipQty="{ value }">{{ formatNum(value as number) }}</template>
    <template #cell-shippedQty="{ value }">{{ formatNum(value as number) }}</template>

    <!-- ── Status ── -->
    <template #cell-status="{ value }"><ErpStatusBadge :status="value as string" /></template>

    <!-- ── Courier / Tracking / Ship date ── -->
    <template #cell-courier="{ value }">{{ value || '—' }}</template>
    <template #cell-trackingNo="{ value }">{{ value || '—' }}</template>
    <template #cell-shippedDate="{ value }">{{ value ? formatDateTime(value as string) : '—' }}</template>

    <!-- ── Actions kebab ── -->
    <template #actions="{ row }">
      <MpPopover :id="`del-actions-${row.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <button class="row-kebab" :aria-label="t('More actions')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="viewDetails(row as unknown as DeliveryTask)">{{ t('View details') }}</MpPopoverListItem>
            <MpPopoverListItem
              v-if="(row as unknown as DeliveryTask).status === 'ready to ship'"
              @click="handoverRow(row as unknown as DeliveryTask)"
            >{{ t('Handover to courier') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Full empty state ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('No deliveries') }}</p>
        <p class="empty-full-desc">{{ t('Packed orders waiting to ship will appear here.') }}</p>
      </div>
    </template>
  </ErpTablePage>

  <!-- ── Demo scenario FAB ── -->
  <MpPopover id="del-demo-fab" is-close-on-select use-portal placement="top-end">
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
.del-doc-held { color: var(--mp-text-warning); }
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
.del-bulk-hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }

/* Courier filter — searchable (matches the table search box), capped to ~5
   options with scroll inside the popover. */
.courier-filter { display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding: var(--mp-spacing-2); min-width: 220px; }
.courier-filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral); color: var(--mp-text-secondary);
}
.courier-filter-search svg { flex-shrink: 0; }
.courier-filter-search-input {
  flex: 1; min-width: 0; border: none; background: transparent; outline: none;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-md);
}
.courier-filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.courier-filter-scroll { display: flex; flex-direction: column; max-height: 184px; overflow-y: auto; }
.courier-filter-empty { padding: var(--mp-spacing-2) 10px; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
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

/* Number cell — the value links to the record's detail */
.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.del-no { color: var(--mp-text-default); }
.del-so { color: var(--mp-text-default); }

.del-warehouse {
  white-space: normal; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden;
}
.del-source {
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
  overflow: hidden; white-space: normal; color: var(--mp-text-default);
}

.row-kebab {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px); margin-left: auto;
  border: none; background: none; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-secondary);
}
.row-kebab svg { display: block; width: var(--mp-sizes-5, 20px); height: var(--mp-sizes-5, 20px); }
.row-kebab:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-default); }

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
