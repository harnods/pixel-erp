<script setup lang="ts">
/**
 * Work orders — Production module index. Lists manufacturing work orders (Assembly
 * / Disassembly of a BOM) with their production plan + progress.
 *
 * Column rules (per spec):
 *   • Start date — hidden ("—") when status is "not started" or "canceled".
 *   • End date   — hidden ("—") when status is "not started", "in progress" or
 *                  "partially produced".
 */
import {
  MpSelect, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, MpIcon, MpTooltip, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import WorkOrderFiltersDrawer, { type WorkOrderFiltersValue } from '~/components/patterns/WorkOrderFiltersDrawer.vue'
import { formatDate } from '~/utils/date'
import { workOrders, type WorkOrder, type WorkOrderStatus } from '~/data/workOrders'

const toggleAirene = inject<() => void>('toggleAirene')

// ─── Columns ───────────────────────────────────────────────────────────────────
const columns: TableColumn[] = [
  { key: 'number',          label: 'Number',               width: '160px', sortable: true  },
  { key: 'bomName',         label: 'BOM name',             width: '200px', sortable: true  },
  { key: 'category',        label: 'Category',             width: '120px'                  },
  { key: 'type',            label: 'Type',                 width: '140px'                  },
  { key: 'trackRouting',    label: 'Track routing',        width: '130px'                  },
  { key: 'status',          label: 'Status',               width: '170px'                  },
  { key: 'parentNumber',    label: 'Parent work order',    width: '170px'                  },
  { key: 'producedQty',     label: 'Produced qty',         width: '130px', align: 'right'  },
  { key: 'productionPlan',  label: 'Production plan dates', width: '230px'                  },
  { key: 'startDate',       label: 'Start date',           width: '130px'                  },
  { key: 'endDate',         label: 'End date',             width: '130px'                  },
]

// ─── Filters ───────────────────────────────────────────────────────────────────
// Type — Assembly / Disassembly. Clearing (x) resets to show-all.
const TYPE_OPTIONS = [
  { label: 'Assembly',    value: 'Assembly'    },
  { label: 'Disassembly', value: 'Disassembly' },
]
const typeFilter = ref('')
const typeLabel = computed(() => TYPE_OPTIONS.find(o => o.value === typeFilter.value)?.label ?? '')

// Status — the six work-order statuses. Clearing (x) resets to show-all.
const STATUS_OPTIONS: { label: string; value: WorkOrderStatus }[] = [
  { label: 'Not started',          value: 'not started'          },
  { label: 'In progress',          value: 'in progress'          },
  { label: 'Partially produced',   value: 'partially produced'   },
  { label: 'Partially completed',  value: 'partially completed'  },
  { label: 'Completed',            value: 'completed'            },
  { label: 'Canceled',             value: 'canceled'             },
]
const statusFilter = ref('')
const statusLabel = computed(() => STATUS_OPTIONS.find(o => o.value === statusFilter.value)?.label ?? '')

// Start date / End date — exact-day match against the work order's actual start/end
// date (the same fields the Start date / End date columns show). Cleared by default.
const startDateFilter = ref('')   // DD/MM/YYYY
const endDateFilter = ref('')     // DD/MM/YYYY

function dayStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function parseDMY(s: string): Date | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
}

// ─── All filters drawer ─────────────────────────────────────────────────────────
const isFiltersDrawerOpen = ref(false)
const drawerTypeOptions = computed(() => TYPE_OPTIONS.map(o => ({ id: o.value, name: o.label })))
const drawerStatusOptions = computed(() => STATUS_OPTIONS.map(o => ({ id: o.value, name: o.label })))
const drawerValue = computed<WorkOrderFiltersValue>(() => ({
  keyword: search.value,
  type: typeFilter.value,
  status: statusFilter.value,
  startDate: startDateFilter.value,
  endDate: endDateFilter.value,
}))
function applyDrawerFilters(v: WorkOrderFiltersValue) {
  search.value = v.keyword
  typeFilter.value = v.type
  statusFilter.value = v.status
  startDateFilter.value = v.startDate
  endDateFilter.value = v.endDate
}

// ─── Rows / table state ─────────────────────────────────────────────────────────
// Prototype preview toggle (FAB, bottom-right): data vs empty-state view
const previewMode = ref<'data' | 'empty'>('data')
const rows = computed<WorkOrder[]>(() => (previewMode.value === 'empty' ? [] : workOrders))

const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort,
} = useTableState<WorkOrder>(rows, {
  perPage: 25,
  filterFn: (row, s) => {
    const matchesSearch = !s
      || row.number.toLowerCase().includes(s)
      || row.bomName.toLowerCase().includes(s)
      || (row.parentNumber?.toLowerCase().includes(s) ?? false)
    const matchesType = !typeFilter.value || row.type === typeFilter.value
    const matchesStatus = !statusFilter.value || row.status === statusFilter.value
    const startFilterDate = parseDMY(startDateFilter.value)
    const matchesStart = !startFilterDate
      || (!!row.startDate && dayStart(new Date(row.startDate)).getTime() === dayStart(startFilterDate).getTime())
    const endFilterDate = parseDMY(endDateFilter.value)
    const matchesEnd = !endFilterDate
      || (!!row.endDate && dayStart(new Date(row.endDate)).getTime() === dayStart(endFilterDate).getTime())
    return matchesSearch && matchesType && matchesStatus && matchesStart && matchesEnd
  },
})

// Reset to page 1 when the extra (non-built-in) filters change
watch([typeFilter, statusFilter, startDateFilter, endDateFilter], () => setPage(1))

const hasActiveFilter = computed(() =>
  !!search.value || !!typeFilter.value || !!statusFilter.value || !!startDateFilter.value || !!endDateFilter.value,
)
function clearFilters() {
  search.value = ''
  typeFilter.value = ''
  statusFilter.value = ''
  startDateFilter.value = ''
  endDateFilter.value = ''
}

// ─── Column show/hide ───────────────────────────────────────────────────────────
const columnVisibility = reactive<Record<string, boolean>>(
  Object.fromEntries(columns.map(c => [c.key, true])),
)
const columnItems = columns.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => columns.filter(c => columnVisibility[c.key]))

// ─── Display rules ──────────────────────────────────────────────────────────────
// Start date hidden until the WO has actually started (not for not-started/canceled).
const START_HIDDEN: WorkOrderStatus[] = ['not started', 'canceled']
// End date hidden until the WO is closed (not for not-started/in-progress/partially-produced).
const END_HIDDEN: WorkOrderStatus[] = ['not started', 'in progress', 'partially produced']

function showStart(row: WorkOrder) { return !START_HIDDEN.includes(row.status) }
function showEnd(row: WorkOrder) { return !END_HIDDEN.includes(row.status) }

function formatNum(n: number) { return n.toLocaleString('id-ID') }

// ─── First-load skeleton (pagination skeleton handled by ErpTablePage) ───────────
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })

const router = useRouter()
function viewDetails(row: WorkOrder) { router.push(`/work-orders/${row.id}`) }

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
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @clear-filters="clearFilters"
  >
    <!-- ── Filter bar ── -->
    <template #filters>
      <!-- Left: Type + Status + All filters -->
      <div class="filter-left">
        <MpPopover id="wo-type-filter" is-close-on-select>
          <MpPopoverTrigger>
            <MpSelect
              id="wo-type-select"
              placeholder="Select type"
              :model-value="typeFilter"
              is-clearable
              :class="css({ width: '160px' })"
              @mousedown.prevent
              @clear="typeFilter = ''"
            >
              <option v-if="typeFilter" :value="typeFilter">{{ typeLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content' })">
            <MpPopoverList>
              <MpPopoverListItem
                v-for="opt in TYPE_OPTIONS"
                :key="opt.value"
                :is-active="opt.value === typeFilter"
                @click="typeFilter = opt.value"
              >{{ opt.label }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <MpPopover id="wo-status-filter" is-close-on-select>
          <MpPopoverTrigger>
            <MpSelect
              id="wo-status-select"
              placeholder="Select status"
              :model-value="statusFilter"
              is-clearable
              :class="css({ width: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })"
              @mousedown.prevent
              @clear="statusFilter = ''"
            >
              <option v-if="statusFilter" :value="statusFilter">{{ statusLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', maxWidth: '320px' })">
            <MpPopoverList>
              <MpPopoverListItem
                v-for="opt in STATUS_OPTIONS"
                :key="opt.value"
                :is-active="opt.value === statusFilter"
                @click="statusFilter = opt.value"
              >{{ opt.label }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <button class="filter-all-btn" type="button" @click="isFiltersDrawerOpen = true">
          <MpIcon name="filter" size="sm" />
          All filters
        </button>
      </div>

      <!-- Right: icon buttons + search -->
      <div class="filter-right">
        <div class="filter-btn-group">
          <ColumnSettingsMenu id="wo-columns" :items="columnItems" :visibility="columnVisibility" />
          <MpTooltip id="tt-wo-export" label="Export" placement="bottom" use-portal>
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

    <!-- ── Number — View details on row hover ── -->
    <template #cell-number="{ value, row }">
      <div class="cell-with-action">
        <span class="cell-text">{{ value }}</span>
        <button class="row-hover-btn" @click.stop="viewDetails(row as unknown as WorkOrder)">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="row-hover-btn__label">VIEW DETAILS</span>
        </button>
      </div>
    </template>

    <!-- ── BOM name — wraps to multiple lines (real BOM names can be long) ── -->
    <template #cell-bomName="{ value }">
      <span class="wo-bom-name">{{ value }}</span>
    </template>

    <!-- ── Track routing — Yes / No ── -->
    <template #cell-trackRouting="{ value }">{{ value ? 'Yes' : 'No' }}</template>

    <!-- ── Status badge ── -->
    <template #cell-status="{ value }">
      <ErpStatusBadge
        :status="(value as string)"
        :label="value === 'in progress' ? 'In progress' : undefined"
      />
    </template>

    <!-- ── Parent work order — em dash when top-level ── -->
    <template #cell-parentNumber="{ value }">
      <span :class="{ 'wo-muted': !value }">{{ value || '—' }}</span>
    </template>

    <!-- ── Produced qty ── -->
    <template #cell-producedQty="{ value }">{{ formatNum(value as number) }}</template>

    <!-- ── Production plan date — planned start – end range ── -->
    <template #cell-productionPlan="{ row }">
      {{ formatDate((row as unknown as WorkOrder).planStartDate) }} – {{ formatDate((row as unknown as WorkOrder).planEndDate) }}
    </template>

    <!-- ── Start date — hidden for not started / canceled ── -->
    <template #cell-startDate="{ row }">
      <span :class="{ 'wo-muted': !showStart(row as unknown as WorkOrder) }">
        {{ showStart(row as unknown as WorkOrder) ? formatDate((row as unknown as WorkOrder).startDate) : '—' }}
      </span>
    </template>

    <!-- ── End date — hidden for not started / in progress / partially produced ── -->
    <template #cell-endDate="{ row }">
      <span :class="{ 'wo-muted': !showEnd(row as unknown as WorkOrder) }">
        {{ showEnd(row as unknown as WorkOrder) ? formatDate((row as unknown as WorkOrder).endDate) : '—' }}
      </span>
    </template>

    <!-- ── Actions kebab (sticky right) ── -->
    <template #actions="{ row }">
      <MpPopover :id="`wo-actions-${row.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <button class="row-kebab" aria-label="More actions">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="viewDetails(row as unknown as WorkOrder)">View details</MpPopoverListItem>
            <MpPopoverListItem>Duplicate</MpPopoverListItem>
            <!-- Cancel — only a not-started WO can be canceled (nothing produced yet) -->
            <MpPopoverListItem
              v-if="(row as unknown as WorkOrder).status === 'not started'"
              :class="css({ color: 'var(--mp-text-critical)' })"
            >Cancel</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Full empty state (first run) ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">No work orders</p>
        <p class="empty-full-desc">Work orders will appear here</p>
      </div>
    </template>
  </ErpTablePage>

  <!-- ── All filters drawer ── -->
  <WorkOrderFiltersDrawer
    v-model:is-open="isFiltersDrawerOpen"
    :model-value="drawerValue"
    :type-options="drawerTypeOptions"
    :status-options="drawerStatusOptions"
    @apply="applyDrawerFilters"
  />

  <!-- ── Demo scenario FAB (bottom-right) ── -->
  <MpPopover id="wo-demo-fab" is-close-on-select use-portal placement="top-end">
    <MpPopoverTrigger>
      <button class="demo-fab" aria-label="Change scenario state">
        <MpIcon name="sliders" size="md" color="icon.inverse" />
      </button>
    </MpPopoverTrigger>
    <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content' })">
      <p class="demo-fab-heading">Scenario state</p>
      <MpPopoverList>
        <MpPopoverListItem :is-active="previewMode === 'data'" @click="previewMode = 'data'">With data</MpPopoverListItem>
        <MpPopoverListItem :is-active="previewMode === 'empty'" @click="previewMode = 'empty'">Empty state</MpPopoverListItem>
      </MpPopoverList>
    </MpPopoverContent>
  </MpPopover>
</template>

<style scoped>
/* ── Filter bar ─────────────────────────────────────────────────────────── */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }

.filter-all-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md); color: var(--mp-text-secondary);
  cursor: pointer; white-space: nowrap;
}
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered); }

.filter-btn-group { display: flex; align-items: center; }
.filter-icon-btn {
  display: flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  padding: var(--mp-spacing-2); border: none; background: transparent;
  border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-default);
}
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered); }

.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  width: 248px; padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle);
}
.filter-search-input {
  flex: 1; border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default); min-width: 0;
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }

/* ── Cells ──────────────────────────────────────────────────────────────── */
.wo-muted { color: var(--mp-text-secondary); }
.wo-bom-name { white-space: normal; }

/* Number cell hover chip */
.cell-with-action { position: relative; display: flex; align-items: center; width: 100%; min-width: 0; }
.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
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

/* Kebab — 20px tall so the actions cell stays within the 40px text-only row */
.row-kebab {
  display: flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-5, 20px);
  margin: 0 auto; border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-text-secondary);
}
.row-kebab svg { display: block; width: var(--mp-sizes-5, 20px); height: var(--mp-sizes-5, 20px); }
.row-kebab:hover { background: var(--mp-background-neutral-hovered); }

/* Empty state */
.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.empty-full-desc {
  margin-top: var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}

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
