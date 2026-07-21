<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  MpSelect, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, MpIcon, MpTooltip, MpCheckbox,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton, toast, css,
} from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpPagination from '~/components/patterns/ErpPagination.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import { formatDateTime } from '~/utils/date'
import {
  receivingPOsFor, taskAgingDays, canCancelReceivingTask, cancelReceivingTask, startReceiving,
  type ReceivingPO, type ReceivingTask,
} from '~/data/receivingTasks'
import { putAwayTasksFor } from '~/data/putAwayTasks'
import { warehouses } from '~/data/warehouses'

const toggleAirene = inject<() => void>('toggleAirene')

// ─── Demo scenario state (FAB) ─────────────────────────────────────────────────
type DemoState = 'empty' | 'data'
const demoState = ref<DemoState>('data')
const demoStates: { value: DemoState; label: string }[] = [
  { value: 'data', label: 'With data' },
  { value: 'empty', label: 'Empty state' },
]

// ─── Scenario scoping (Ops = assigned warehouse(s)) ────────────────────────────
const { assignedWarehouses } = useWarehouseContext()
const scopedWarehouseIds = computed(() => assignedWarehouses.value.map(w => w.id))
const isScoped = computed(() => scopedWarehouseIds.value.length > 0)

// ─── Columns ───────────────────────────────────────────────────────────────────
const baseColumnItems = [
  { key: 'taskNo', label: 'Receiving task no.', disabled: true },
  { key: 'purchaseNo', label: 'Purchase order no.' },
  { key: 'warehouseName', label: 'Warehouse' },
  { key: 'assignee', label: 'Assignee' },
  { key: 'skuCount', label: 'Sku qty' },
  { key: 'expectedQty', label: 'Expected qty' },
  { key: 'receivedQty', label: 'Received qty' },
  { key: 'status', label: 'Status' },
  { key: 'startDate', label: 'Start date' },
  { key: 'endDate', label: 'End date' },
]
const columnItems = computed(() => isScoped.value ? baseColumnItems.filter(c => c.key !== 'assignee') : baseColumnItems)
const colVis = reactive<Record<string, boolean>>(Object.fromEntries(baseColumnItems.map(c => [c.key, true])))

// ─── Filters ───────────────────────────────────────────────────────────────────
const search = ref('')
const warehouseFilter = ref<string[]>([])
// Mirror into the shared singleton so the tab bar's count badges (Receipts (N),
// Receiving (N), Put-away (N)) scope to whatever warehouse this table is
// actually filtered to, instead of always counting every warehouse.
const activeWarehouseFilter = useActiveWarehouseFilter()
watch(warehouseFilter, (v) => { activeWarehouseFilter.value = v }, { immediate: true })
onUnmounted(() => { activeWarehouseFilter.value = [] })
const assigneeFilter = ref('')
const statusFilter = ref<string[]>([])

// Bumped after a bulk status mutation so the (plain-data) queue recomputes.
const dataVersion = ref(0)
const basePOs = computed<ReceivingPO[]>(() => {
  void dataVersion.value
  return demoState.value === 'data'
    ? receivingPOsFor(isScoped.value ? scopedWarehouseIds.value : undefined)
    : []
})
// Flat task list — receiving tasks are no longer grouped/merged by PO in this table.
const baseTasks = computed<ReceivingTask[]>(() => basePOs.value.flatMap(po => po.tasks))

const warehouseOptions = computed(() => {
  const src = isScoped.value
    ? warehouses.filter(w => scopedWarehouseIds.value.includes(w.id))
    : warehouses.filter(w => !w.isDefault && w.status === 'active')
  return src.map(w => ({ label: w.name, value: w.id }))
})
const assigneeOptions = computed(() =>
  [...new Set(baseTasks.value.map(t => t.assignee))].map(a => ({ label: a, value: a })),
)
const statusOptions = [
  { label: 'Open',             value: 'open' },
  { label: 'In process',      value: 'in progress' },
  { label: 'Pending put-away', value: 'pending put-away' },
  { label: 'Completed',        value: 'completed' },
  { label: 'Canceled',        value: 'canceled' },
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
const assigneeLabel = computed(() => assigneeOptions.value.find(o => o.value === assigneeFilter.value)?.label ?? '')
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

// Flat task list filtered by the active criteria.
const filteredTasks = computed<ReceivingTask[]>(() => {
  const s = search.value.toLowerCase().trim()
  return baseTasks.value
    .filter(t => !warehouseFilter.value.length || warehouseFilter.value.includes(t.warehouseId))
    .filter(t => !assigneeFilter.value || t.assignee === assigneeFilter.value)
    .filter(t => !statusFilter.value.length || statusFilter.value.includes(t.status))
    .filter(t =>
      !s
      || t.purchaseNo.toLowerCase().includes(s)
      || t.taskNo.toLowerCase().includes(s)
      || t.assignee.toLowerCase().includes(s),
    )
})

const hasActiveFilter = computed(
  () => !!search.value || statusFilter.value.length > 0 || warehouseFilter.value.length > 0 || !!assigneeFilter.value,
)
function clearFilters() {
  search.value = ''; statusFilter.value = []; warehouseFilter.value = []; assigneeFilter.value = ''
}

// ─── Pagination ───────────────────────────────────────────────────────────────
const currentPage = ref(1)
const perPage     = ref(25)
const totalTasks  = computed(() => filteredTasks.value.length)
const pagedTasks  = computed(() => {
  const start = (currentPage.value - 1) * perPage.value
  return filteredTasks.value.slice(start, start + perPage.value)
})
watch([search, warehouseFilter, assigneeFilter, statusFilter, perPage], () => { currentPage.value = 1 })

// Total columns currently rendered (toggleable columns still visible, plus the
// always-on Task no./icons/actions columns) — for the bulk bar colspan.
const colCount = computed(() => columnItems.value.filter(c => colVis[c.key]).length + 2)

// ─── Icon indicator — put-away task badge ───────────────────────────────────
function hasPutAwayTask(taskId: string): boolean {
  return putAwayTasksFor().some((pa) => pa.receivingTaskIds.includes(taskId) && pa.status !== 'canceled')
}

// ─── Bulk select (tasks) ───────────────────────────────────────────────────────
// Any task can be selected. The available bulk action depends on the selection:
//   all "pending put-away" → Create put-away · anything not yet finished (open/in
//   progress) → Cancel. Pending put-away / completed / already-canceled tasks are
//   never cancelable — receiving on them is already done (or was never started).
const selectedTasks = ref(new Set<string>())
const allTaskIds = computed(() => pagedTasks.value.map(t => t.id))
const allSelected = computed(() => allTaskIds.value.length > 0 && allTaskIds.value.every(id => selectedTasks.value.has(id)))
const someSelected = computed(() => selectedTasks.value.size > 0 && !allSelected.value)
const bulkCountLabel = computed(() => {
  const n = selectedTasks.value.size
  return `${n} ${n === 1 ? 'task' : 'tasks'} selected`
})
const selectedTaskObjs = computed(() =>
  filteredTasks.value.filter(t => selectedTasks.value.has(t.id)),
)
// Create put-away: all selected tasks must be pending put-away AND from the same warehouse.
const selectedPutAwayWarehouseId = computed<string | null>(() => {
  const objs = selectedTaskObjs.value
  if (!objs.length || !objs.every(t => t.status === 'pending put-away')) return null
  const whs = new Set(objs.map(t => t.warehouseId))
  return whs.size === 1 ? [...whs][0]! : null
})
const canCreatePutAway = computed(() => selectedPutAwayWarehouseId.value !== null)
// Explains why "Create put-away" is missing when it's specifically the
// multi-warehouse rule that's blocking it (as opposed to none being pending put-away).
const selectedTasksSpanMultipleWarehouses = computed(() => {
  const whs = new Set(selectedTaskObjs.value.map(t => t.warehouseId))
  return whs.size > 1
})
function toggleTask(id: string) {
  const s = new Set(selectedTasks.value)
  s.has(id) ? s.delete(id) : s.add(id)
  selectedTasks.value = s
}
function toggleAll() {
  selectedTasks.value = allSelected.value ? new Set() : new Set(allTaskIds.value)
}
function deselectAll() { selectedTasks.value = new Set() }
function bulkCreatePutAway() {
  const wh = selectedPutAwayWarehouseId.value
  if (!wh) return
  router.push({
    path: '/inbound-delivery/put-away/create',
    query: { warehouseId: wh, taskIds: [...selectedTasks.value].join(',') },
  })
}
// Bulk cancel — confirmation alert, only for not-yet-finished tasks in the selection.
const cancelableTaskObjs = computed(() => selectedTaskObjs.value.filter(canCancelReceivingTask))
const bulkCancelable = computed(() => cancelableTaskObjs.value.length > 0)
const bulkCancelOpen = ref(false)
function confirmBulkCancel() {
  const ids = cancelableTaskObjs.value.map(t => t.id)
  for (const id of ids) cancelReceivingTask(id)
  bulkCancelOpen.value = false
  toast.notify({ variant: 'success', title: `${ids.length} ${ids.length === 1 ? 'task' : 'tasks'} canceled` , maxWidth: 'max-content'})
  deselectAll()
}
function onEsc(e: KeyboardEvent) { if (e.key === 'Escape' && selectedTasks.value.size) deselectAll() }

// Sticky action column shadow — only visible when table is scrolled right
const tableWrapEl = ref<HTMLElement | null>(null)
const tableScrolled = ref(false)
function onTableScroll() { tableScrolled.value = (tableWrapEl.value?.scrollLeft ?? 0) > 0 }

onMounted(() => { window.addEventListener('keydown', onEsc) })
onUnmounted(() => { window.removeEventListener('keydown', onEsc) })

function fmt(n: number) { return n.toLocaleString('id-ID') }
// Expected qty (targetQty) summed across the task's own lines — more relevant
// here than Purchase qty (t.purchaseQty, whole-PO scope): this list is about
// what each task is actually going after, not the PO's total demand.
function expectedQtyTotal(t: ReceivingTask): number {
  return t.items.reduce((s, it) => s + it.targetQty, 0)
}
// Aging shows only when a task ran longer than a day.
function aging(t: ReceivingTask) {
  const d = taskAgingDays(t)
  return d > 1 ? d : 0
}

// ─── Row actions ─────────────────────────────────────────────────────────────
const router = useRouter()
function viewDetails(t: ReceivingTask) { router.push(`/receiving/${t.id}`) }
function startReceivingAndNavigate(t: ReceivingTask) {
  startReceiving(t.id)
  router.push(`/receiving/${t.id}/receive`)
}
function continueReceiving(t: ReceivingTask) { router.push(`/receiving/${t.id}/receive`) }
function createPutAway(t: ReceivingTask) {
  router.push({ path: '/inbound-delivery/put-away/create', query: { warehouseId: t.warehouseId, taskId: t.id } })
}
const cancelModalOpen = ref(false)
const taskToCancel = ref<ReceivingTask | null>(null)
function openCancelModal(t: ReceivingTask) { taskToCancel.value = t; cancelModalOpen.value = true }
function closeCancelModal() { cancelModalOpen.value = false; taskToCancel.value = null }
function confirmCancelTask() {
  if (!taskToCancel.value) return
  cancelReceivingTask(taskToCancel.value.id)
  toast.notify({ variant: 'success', title: `${taskToCancel.value.taskNo} canceled`, maxWidth: 'max-content' })
  closeCancelModal()
}

const emptyIllustration = '/illustrations/empty-folder.png'
</script>

<template>
  <div class="rcvg-page">
    <!-- ── Filter bar ── -->
    <div class="filter-bar">
      <div class="filter-left">
        <MpPopover v-if="!isScoped" id="rcvg-wh-filter" :is-close-on-select="false">
          <MpPopoverTrigger>
            <MpSelect id="rcvg-wh-select" placeholder="Warehouse"
              :model-value="warehouseFilter.length ? '__selected__' : undefined" is-clearable
              :class="css({ width: '180px' })" @mousedown.prevent @clear="warehouseFilter = []">
              <option v-if="warehouseFilter.length" value="__selected__">{{ warehouseLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', maxWidth: '320px' })">
            <div class="checkbox-filter-list">
              <label v-for="opt in warehouseOptions" :key="opt.value" class="checkbox-filter-item">
                <MpCheckbox
                  :id="`rcvg-wh-${opt.value}`"
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

        <MpPopover v-if="!isScoped" id="rcvg-assignee-filter" is-close-on-select>
          <MpPopoverTrigger>
            <MpSelect id="rcvg-assignee-select" placeholder="Assignee" :model-value="assigneeFilter" is-clearable
              :class="css({ width: '170px' })" @mousedown.prevent @clear="assigneeFilter = ''">
              <option v-if="assigneeFilter" :value="assigneeFilter">{{ assigneeLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '170px', width: 'max-content', maxWidth: '320px' })">
            <MpPopoverList>
              <MpPopoverListItem v-for="opt in assigneeOptions" :key="opt.value"
                :is-active="opt.value === assigneeFilter" @click="assigneeFilter = opt.value">{{ opt.label }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <MpPopover id="rcvg-status-filter" :is-close-on-select="false">
          <MpPopoverTrigger>
            <MpSelect id="rcvg-status-select" placeholder="Status" :model-value="statusFilter.length ? 'set' : ''" is-clearable
              :class="css({ width: '160px' })" @mousedown.prevent @clear="statusFilter = []">
              <option v-if="statusFilter.length" value="set">{{ statusLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content' })">
            <div class="checkbox-filter-list">
              <label v-for="opt in statusOptions" :key="opt.value" class="checkbox-filter-item">
                <MpCheckbox
                  :id="`rcvg-status-${opt.value}`"
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
          <MpTooltip id="tt-rcvg-airene" label="Ask Airene" placement="bottom" use-portal>
            <button class="filter-icon-btn filter-icon-btn--airene" aria-label="Ask Airene" @click="toggleAirene?.()">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
              </svg>
            </button>
          </MpTooltip>
          <ColumnSettingsMenu id="rcvg-col-settings" :items="columnItems" :visibility="colVis" />
          <MpTooltip id="tt-rcvg-export" label="Export" placement="bottom" use-portal>
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
    </div>

    <!-- ── Table + pagination (no gap between them) ── -->
    <div v-if="filteredTasks.length" class="rcvg-table-section">
    <div ref="tableWrapEl" class="rcvg-table-wrap" :class="{ 'rcvg-table-wrap--scrolled': tableScrolled }" @scroll.passive="onTableScroll">
      <table class="rcvg-table">
        <colgroup>
          <col style="width: 200px" />
          <col v-if="colVis.purchaseNo" style="width: 220px" />
          <col v-if="colVis.warehouseName" style="width: 150px" />
          <col v-if="!isScoped && colVis.assignee" style="width: 140px" />
          <col v-if="colVis.skuCount" style="width: 100px" />
          <col v-if="colVis.expectedQty" style="width: 120px" />
          <col v-if="colVis.receivedQty" style="width: 100px" />
          <col v-if="colVis.status" style="width: 130px" />
          <col style="width: 100px" />
          <col v-if="colVis.startDate" style="width: 180px" />
          <col v-if="colVis.endDate" style="width: 200px" />
          <col style="width: 44px" />
        </colgroup>
        <thead>
          <!-- Bulk bar — replaces the header row when tasks are selected -->
          <tr v-if="selectedTasks.size > 0" class="rcvg-tr-bulk">
            <th :colspan="colCount" class="rcvg-th rcvg-th--bulk">
              <div class="rcvg-bulk-bar">
                <div class="rcvg-bulk-bar__left">
                  <MpCheckbox id="rcvg-bulk-all" :is-checked="allSelected" :is-indeterminate="someSelected" @change="toggleAll" @click.stop />
                  <span class="rcvg-bulk-bar__count">{{ bulkCountLabel }}</span>
                  <button v-if="canCreatePutAway" class="btn-enterprise btn-enterprise--primary btn-enterprise--sm" @click="bulkCreatePutAway">Create put-away</button>
                  <span v-else-if="selectedTasksSpanMultipleWarehouses" class="rcvg-bulk-bar__hint">
                    Select tasks from a single warehouse to create put-away
                  </span>
                  <button
                    v-if="bulkCancelable"
                    class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm"
                    :class="css({ color: 'var(--mp-text-critical)' })"
                    @click="bulkCancelOpen = true"
                  >Cancel receiving task</button>
                </div>
                <div class="rcvg-bulk-bar__right">
                  <span>Press</span><kbd class="rcvg-bulk-bar__kbd">Esc</kbd><span>to deselect</span>
                </div>
              </div>
            </th>
          </tr>
          <tr v-else>
            <th class="rcvg-th">
              <div class="rcvg-num-head">
                <MpCheckbox id="rcvg-head-all" :is-checked="allSelected" :is-indeterminate="someSelected" @change="toggleAll" @click.stop />
                <span>Receiving task no.</span>
              </div>
            </th>
            <th v-if="colVis.purchaseNo" class="rcvg-th">Purchase order no.</th>
            <th v-if="colVis.warehouseName" class="rcvg-th">Warehouse</th>
            <th v-if="!isScoped && colVis.assignee" class="rcvg-th">Assignee</th>
            <th v-if="colVis.skuCount" class="rcvg-th">Sku qty</th>
            <th v-if="colVis.expectedQty" class="rcvg-th rcvg-th--right">Expected qty</th>
            <th v-if="colVis.receivedQty" class="rcvg-th rcvg-th--right">Received qty</th>
            <th v-if="colVis.status" class="rcvg-th">Status</th>
            <th class="rcvg-th" />
            <th v-if="colVis.startDate" class="rcvg-th">Start date</th>
            <th v-if="colVis.endDate" class="rcvg-th">End date</th>
            <th class="rcvg-th rcvg-th--actions" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="t in pagedTasks"
            :key="t.id"
            class="rcvg-task-row"
            :class="{ 'rcvg-task-row--selected': selectedTasks.has(t.id) }"
          >
            <!-- Receiving task cell (first column) -->
            <td class="rcvg-td rcvg-td--task">
              <div class="rcvg-task-cell">
                <span class="rcvg-check" @click.stop>
                  <MpCheckbox :id="`rcvg-task-${t.id}`" :is-checked="selectedTasks.has(t.id)" @change="toggleTask(t.id)" />
                </span>
                <span class="rcvg-task-no">{{ t.taskNo }}</span>
                <button class="row-hover-btn" @click.stop="viewDetails(t)">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  <span class="row-hover-btn__label">VIEW DETAILS</span>
                </button>
              </div>
            </td>
            <td v-if="colVis.purchaseNo" class="rcvg-td rcvg-td--po">
              <div class="rcvg-po-cell">
                <span class="rcvg-po-no">{{ t.purchaseNo }}</span>
                <button class="row-hover-btn" @click.stop="router.push(`/inbound-delivery/${t.receiptId}`)">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  <span class="row-hover-btn__label">VIEW DETAILS</span>
                </button>
              </div>
            </td>
            <td v-if="colVis.warehouseName" class="rcvg-td rcvg-td--warehouse">
              <div class="rcvg-wh-cell">
                <span>{{ t.warehouseName }}</span>
                <button class="row-hover-btn" @click.stop="router.push(`/warehouses/${t.warehouseId}`)">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  <span class="row-hover-btn__label">VIEW DETAILS</span>
                </button>
              </div>
            </td>
            <td v-if="!isScoped && colVis.assignee" class="rcvg-td rcvg-td--assignee">{{ t.assignee }}</td>
            <td v-if="colVis.skuCount" class="rcvg-td">{{ t.skuCount }}</td>
            <td v-if="colVis.expectedQty" class="rcvg-td rcvg-td--right">{{ fmt(expectedQtyTotal(t)) }}</td>
            <td v-if="colVis.receivedQty" class="rcvg-td rcvg-td--right">{{ fmt(t.receivedQty) }}</td>
            <td v-if="colVis.status" class="rcvg-td"><ErpStatusBadge :status="t.status" /></td>
            <td class="rcvg-td">
              <div class="rcvg-icons-cell">
                <MpTooltip
                  v-if="hasPutAwayTask(t.id)"
                  :id="`tt-putaway-${t.id}`"
                  label="Put-away task created"
                  placement="top"
                  use-portal
                >
                  <span class="rcvg-icon-indicator" aria-label="Put-away task created">
                    <MpIcon name="doc" size="20px" />
                  </span>
                </MpTooltip>
              </div>
            </td>
            <td v-if="colVis.startDate" class="rcvg-td">{{ formatDateTime(t.startDate) }}</td>
              <td v-if="colVis.endDate" class="rcvg-td">
                <span class="rcvg-end">
                  <span v-if="t.endDate">{{ formatDateTime(t.endDate) }}</span>
                  <span v-else class="rcvg-end__ongoing">—</span>
                  <span v-if="aging(t)" class="rcvg-aging">{{ aging(t) }} days</span>
                </span>
              </td>
              <td class="rcvg-td rcvg-td--actions">
                <MpPopover :id="`rcvg-actions-${t.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                  <MpPopoverTrigger>
                    <button class="row-kebab" aria-label="More actions" @click.stop>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
                      </svg>
                    </button>
                  </MpPopoverTrigger>
                  <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
                    <MpPopoverList>
                      <MpPopoverListItem @click="viewDetails(t)">View details</MpPopoverListItem>
                      <MpPopoverListItem v-if="t.status === 'open'" @click="startReceivingAndNavigate(t)">Start receiving</MpPopoverListItem>
                      <MpPopoverListItem v-else-if="t.status === 'in progress'" @click="continueReceiving(t)">Continue receiving</MpPopoverListItem>
                      <MpPopoverListItem v-if="t.status === 'pending put-away'" @click="createPutAway(t)">Create put-away</MpPopoverListItem>
                      <MpPopoverListItem
                        v-if="canCancelReceivingTask(t)"
                        :class="css({ color: 'var(--mp-text-critical)' })"
                        @click="openCancelModal(t)"
                      >Cancel</MpPopoverListItem>
                    </MpPopoverList>
                  </MpPopoverContent>
                </MpPopover>
              </td>
            </tr>
        </tbody>
      </table>
    </div>
    <ErpPagination
      :current-page="currentPage"
      :per-page="perPage"
      :total="totalTasks"
      @page-change="currentPage = $event"
      @per-page-change="perPage = $event"
    />
    </div>

    <!-- ── Empty state ── -->
    <div v-else class="empty-full">
      <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
      <p class="empty-full-title">{{ hasActiveFilter ? 'No receiving tasks found' : 'No receiving tasks' }}</p>
      <p class="empty-full-desc">{{ hasActiveFilter ? 'Try adjusting your filters.' : 'Receiving tasks will appear here.' }}</p>
    </div>
  </div>

  <!-- ── Cancel confirmation modal ── -->
  <MpModal id="rcvg-cancel-modal" :is-open="cancelModalOpen" size="md"
    is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="closeCancelModal">
    <MpModalContent>
      <MpModalHeader>Cancel {{ taskToCancel?.taskNo }}?<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        This receiving task will be canceled and can no longer be continued. This can't be undone.
      </MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--secondary" @click="closeCancelModal">Keep task</button>
          <button class="btn-enterprise btn-enterprise--danger" @click="confirmCancelTask">Cancel task</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <!-- ── Bulk cancel confirmation modal ── -->
  <MpModal id="rcvg-bulk-cancel-modal" :is-open="bulkCancelOpen" size="md"
    is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="bulkCancelOpen = false">
    <MpModalContent>
      <MpModalHeader>Cancel {{ cancelableTaskObjs.length }} {{ cancelableTaskObjs.length === 1 ? 'task' : 'tasks' }}?<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        The selected receiving tasks will be canceled and can no longer be continued. This can't be undone.
      </MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--secondary" @click="bulkCancelOpen = false">Keep tasks</button>
          <button class="btn-enterprise btn-enterprise--danger" @click="confirmBulkCancel">Cancel tasks</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <!-- ── Demo scenario FAB ── -->
  <MpPopover id="rcvg-demo-fab" is-close-on-select use-portal placement="top-end">
    <MpPopoverTrigger>
      <button class="demo-fab" aria-label="Change scenario state"><MpIcon name="sliders" size="md" color="icon.inverse" /></button>
    </MpPopoverTrigger>
    <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content' })">
      <p class="demo-fab-heading">Scenario state</p>
      <MpPopoverList>
        <MpPopoverListItem v-for="s in demoStates" :key="s.value" :is-active="s.value === demoState" @click="demoState = s.value">{{ s.label }}</MpPopoverListItem>
      </MpPopoverList>
    </MpPopoverContent>
  </MpPopover>
</template>

<style scoped>
.rcvg-page { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }

/* Filter bar */
.filter-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); }
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-2); }
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

/* Table */
.rcvg-table-section { display: flex; flex-direction: column; }
.rcvg-table-wrap { overflow-x: auto; }
.rcvg-table { width: 100%; border-collapse: collapse; }
.rcvg-th {
  position: sticky; top: 0;
  height: var(--mp-sizes-7, 28px);
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; color: var(--mp-text-secondary); text-align: left; white-space: nowrap;
}
.rcvg-th--right { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }

/* Checkbox column + bulk bar */
/* Checkbox lives inside the Number column, next to the number */
.rcvg-num-head { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.rcvg-check { display: inline-flex; align-items: center; flex-shrink: 0; }
.rcvg-tr-bulk .rcvg-th--bulk {
  /* zero vertical padding → same 28px row height as the normal header (no table shift).
     left padding matches the normal header so the select-all checkbox stays put. */
  padding: 0 var(--mp-spacing-3) 0 var(--mp-spacing-2); text-transform: none; font-weight: var(--mp-font-weights-regular);
}
.rcvg-bulk-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); height: var(--mp-sizes-7, 28px); }
.rcvg-bulk-bar__left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.rcvg-bulk-bar__count { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); white-space: nowrap; }
.rcvg-bulk-bar__hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }
.rcvg-bulk-bar__right { display: flex; align-items: center; gap: var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }
.rcvg-bulk-bar__kbd {
  display: inline-flex; align-items: center; padding: 0 var(--mp-spacing-1\.5);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-sm);
  font-size: var(--mp-font-sizes-xs); font-family: inherit; color: var(--mp-text-secondary);
}

.rcvg-td {
  height: var(--mp-sizes-10, 40px);
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); vertical-align: middle; white-space: nowrap;
}
.rcvg-td--right { text-align: right; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); font-variant-numeric: tabular-nums; }
.rcvg-td--muted { color: var(--mp-text-secondary); }

/* Icon indicator cell — put-away task badge */
.rcvg-icons-cell {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: var(--mp-spacing-2);
}
.rcvg-icon-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--mp-text-subtle);
}
.rcvg-th--actions,
.rcvg-td--actions {
  position: sticky; right: 0; z-index: 1;
  text-align: right; padding-right: var(--mp-spacing-2);
}
.rcvg-th--actions { background: var(--mp-background-neutral-subtle); }
.rcvg-td--actions { background: var(--mp-background-default, #fff); }
.rcvg-task-row:hover .rcvg-td--actions { background: var(--mp-background-neutral-subtle); }
/* Shadow only when table is scrolled right */
.rcvg-table-wrap--scrolled .rcvg-th--actions,
.rcvg-table-wrap--scrolled .rcvg-td--actions { box-shadow: -1px 0 0 var(--mp-border-default); }

/* End date cell — date (or "In progress") + aging badge when > 1 day */
.rcvg-end { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.rcvg-end__ongoing { color: var(--mp-text-secondary); }
.rcvg-aging {
  display: inline-flex; align-items: center;
  padding: 0 var(--mp-spacing-1\.5); border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral-subtle, #f1f5f9);
  color: var(--mp-text-secondary);
  font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-lg, 20px); white-space: nowrap;
}

/* PO + Warehouse cells */
.rcvg-td--po { position: relative; }
.rcvg-td--warehouse { position: relative; }
.rcvg-po-cell { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.rcvg-wh-cell { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.rcvg-po-no { color: var(--mp-text-default); }

/* Task row */
.rcvg-task-row:hover .rcvg-td { background: var(--mp-background-neutral-subtle); }
.rcvg-td--task { position: relative; }
.rcvg-task-cell { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.rcvg-task-no { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

/* Task number — View details chip on row hover */
.row-hover-btn {
  position: absolute; right: var(--mp-spacing-2); top: 50%; transform: translateY(-50%); display: none;
  align-items: center; gap: var(--mp-spacing-1\.5);
  padding: var(--mp-spacing-1) var(--mp-spacing-1\.5);
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-sm); cursor: pointer; white-space: nowrap; line-height: 1; color: var(--mp-text-secondary);
}
.row-hover-btn__label {
  font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xs, 12px); color: var(--mp-text-secondary); text-transform: uppercase;
}
.rcvg-task-row:hover .row-hover-btn { display: flex; }

.row-kebab {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px); margin-left: auto;
  border: none; background: none; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-secondary);
}
.row-kebab svg { display: block; width: var(--mp-sizes-5, 20px); height: var(--mp-sizes-5, 20px); }
.row-kebab:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-default); }

/* Empty state */
.empty-full { display: flex; flex-direction: column; align-items: center; padding: var(--mp-spacing-10, 40px) 0; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin-top: var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.modal-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }

/* Demo FAB */
.demo-fab {
  position: fixed; right: var(--mp-spacing-6); bottom: var(--mp-spacing-6);
  width: var(--mp-spacing-12, 48px); height: var(--mp-spacing-12, 48px);
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-inverse, #080d0e); color: #fff; cursor: pointer; z-index: 1200;
  box-shadow: 0 4px 6px -2px rgba(0,0,0,0.1), 0 10px 15px -3px rgba(0,0,0,0.2);
}
.demo-fab:hover { opacity: 0.9; }
.demo-fab-heading { padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
