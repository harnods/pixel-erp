<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import {
  MpSelect, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, MpIcon, MpTooltip, css, toast,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { useTableState } from '~/composables/useTableState'
import { pickingTasksFor, pickingTaskAgingDays, type PickingTask } from '~/data/pickingTasks'
import { warehouses } from '~/data/warehouses'
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
    toast.notify({ variant: 'success', title: 'Picking task saved' })
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
  { key: 'taskNo',        label: 'Number',       width: '180px' },
  { key: 'salesNos',      label: 'Sales orders', width: '240px' },
  { key: 'warehouseName', label: 'Warehouse',    width: '180px' },
  { key: 'assignee',      label: 'Assignee',     width: '160px' },
  { key: 'skuQty',        label: 'SKU qty',      width: '100px', align: 'right' },
  { key: 'toPickQty',     label: 'To pick',      width: '100px', align: 'right' },
  { key: 'pickedQty',     label: 'Picked qty',   width: '100px', align: 'right' },
  { key: 'status',        label: 'Status',       width: '140px' },
  { key: 'startDate',     label: 'Start date',   width: '170px' },
  { key: 'endDate',       label: 'End date',     width: '190px' },
]

// ─── Filters — max 2 quick filters: Status + Warehouse (hidden when scoped) ───
const warehouseFilter = ref('')
const statusFilter = ref('')

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
  { label: 'Open',        value: 'open' },
  { label: 'In process', value: 'in progress' },
  { label: 'Completed',   value: 'completed' },
  { label: 'Canceled',    value: 'canceled' },
]
const warehouseLabel = computed(() => warehouseOptions.value.find(o => o.value === warehouseFilter.value)?.label ?? '')
const statusLabel    = computed(() => statusOptions.find(o => o.value === statusFilter.value)?.label ?? '')

const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort,
} = useTableState<PickingTask>(baseTasks, {
  perPage: 25,
  filterFn: (row, s) => {
    const matchesSearch = !s
      || row.taskNo.toLowerCase().includes(s)
      || row.salesNos.some(n => n.toLowerCase().includes(s))
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
// A completed picking task can spawn packing tasks (one per sales order).
function createPacking(row: PickingTask) {
  router.push({ path: '/barang-keluar/packing/create', query: { pickingId: row.id } })
}

const emptyIllustration = '/illustrations/empty-folder.png'
</script>

<template>
  <ErpTablePage
    :columns="columns"
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
    @clear-filters="clearFilters"
  >
    <!-- ── Filter bar ── -->
    <template #filters>
      <div class="filter-left">
        <MpPopover v-if="!isScoped" id="pick-wh-filter" is-close-on-select>
          <MpPopoverTrigger>
            <MpSelect
              id="pick-wh-select" placeholder="Warehouse" :model-value="warehouseFilter" is-clearable
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

        <MpPopover id="pick-status-filter" is-close-on-select>
          <MpPopoverTrigger>
            <MpSelect
              id="pick-status-select" placeholder="Status" :model-value="statusFilter" is-clearable
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
          <MpTooltip id="tt-pick-airene" label="Ask Airene" placement="bottom" use-portal>
            <button class="filter-icon-btn filter-icon-btn--airene" aria-label="Ask Airene" @click="toggleAirene?.()">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
              </svg>
            </button>
          </MpTooltip>
          <MpTooltip id="tt-pick-export" label="Export" placement="bottom" use-portal>
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
        <span class="cell-text pick-no">{{ value }}</span>
        <button class="row-hover-btn" @click.stop="viewDetails(row as unknown as PickingTask)">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="row-hover-btn__label">VIEW DETAILS</span>
        </button>
      </div>
    </template>

    <!-- ── Sales orders — expandable list ── -->
    <template #cell-salesNos="{ value, row }">
      <span class="pick-orders">
        <template v-if="expandedRows.has((row as unknown as PickingTask).id)">
          <span v-for="no in (value as string[])" :key="no" class="pick-orders__item">{{ no }}</span>
          <button class="pick-orders__toggle" @click.stop="toggleExpand((row as unknown as PickingTask).id)">Show less</button>
        </template>
        <template v-else>
          <span class="pick-orders__item">{{ (value as string[])[0] }}</span>
          <button
            v-if="(value as string[]).length > 1"
            class="pick-orders__toggle"
            @click.stop="toggleExpand((row as unknown as PickingTask).id)"
          >+{{ (value as string[]).length - 1 }} more</button>
        </template>
      </span>
    </template>

    <!-- ── Warehouse ── -->
    <template #cell-warehouseName="{ value }">
      <span class="pick-warehouse">{{ value }}</span>
    </template>

    <!-- ── Numeric cells ── -->
    <template #cell-skuQty="{ value }">{{ formatNum(value as number) }}</template>
    <template #cell-toPickQty="{ value }">{{ formatNum(value as number) }}</template>
    <template #cell-pickedQty="{ value }">{{ formatNum(value as number) }}</template>

    <!-- ── Status ── -->
    <template #cell-status="{ value }"><ErpStatusBadge :status="value as string" /></template>

    <!-- ── Start / End date + aging ── -->
    <template #cell-startDate="{ value }">{{ value ? formatDateTime(value as string) : '—' }}</template>
    <template #cell-endDate="{ row }">
      <span class="pick-end">
        <span v-if="(row as unknown as PickingTask).endDate">{{ formatDateTime((row as unknown as PickingTask).endDate) }}</span>
        <span v-else class="pick-end__ongoing">—</span>
        <span v-if="agingDays(row as unknown as PickingTask) > 1" class="pick-aging">{{ agingDays(row as unknown as PickingTask) }} days</span>
      </span>
    </template>

    <!-- ── Actions kebab ── -->
    <template #actions="{ row }">
      <MpPopover :id="`pick-actions-${row.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <button class="row-kebab" aria-label="More actions">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="viewDetails(row as unknown as PickingTask)">View details</MpPopoverListItem>
            <MpPopoverListItem
              v-if="(row as unknown as PickingTask).status === 'completed'"
              @click="createPacking(row as unknown as PickingTask)"
            >Create packing</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Full empty state ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">No picking tasks</p>
        <p class="empty-full-desc">Orders waiting to be picked will appear here.</p>
      </div>
    </template>
  </ErpTablePage>

  <!-- ── Demo scenario FAB ── -->
  <MpPopover id="pick-demo-fab" is-close-on-select use-portal placement="top-end">
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
.pick-no { color: var(--mp-text-default); }
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
</style>
