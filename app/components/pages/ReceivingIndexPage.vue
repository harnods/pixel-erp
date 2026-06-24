<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import {
  MpSelect, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, MpIcon, MpTooltip,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton, css,
} from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { receivingQueuePOs, taskAgingDays, type ReceivingPO, type ReceivingTask } from '~/data/receivingTasks'
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

// ─── Filters ───────────────────────────────────────────────────────────────────
const search = ref('')
const warehouseFilter = ref('')
const assigneeFilter = ref('')
const statusFilter = ref('') // '' | open | completed

const basePOs = computed<ReceivingPO[]>(() =>
  demoState.value === 'data'
    ? receivingQueuePOs(isScoped.value ? scopedWarehouseIds.value : undefined)
    : [],
)

const warehouseOptions = computed(() => {
  const src = isScoped.value
    ? warehouses.filter(w => scopedWarehouseIds.value.includes(w.id))
    : warehouses.filter(w => !w.isDefault && w.status === 'active')
  return src.map(w => ({ label: w.name, value: w.id }))
})
const assigneeOptions = computed(() =>
  [...new Set(basePOs.value.flatMap(po => po.tasks.map(t => t.assignee)))].map(a => ({ label: a, value: a })),
)
const statusOptions = [
  { label: 'Open',      value: 'open' },
  { label: 'Completed', value: 'completed' },
]
const warehouseLabel = computed(() => warehouseOptions.value.find(o => o.value === warehouseFilter.value)?.label ?? '')
const assigneeLabel = computed(() => assigneeOptions.value.find(o => o.value === assigneeFilter.value)?.label ?? '')
const statusLabel = computed(() => statusOptions.find(o => o.value === statusFilter.value)?.label ?? '')

// PO list with tasks filtered by the active criteria; drop POs left with no tasks.
const filteredPOs = computed<ReceivingPO[]>(() => {
  const s = search.value.toLowerCase().trim()
  return basePOs.value
    .filter(po => !warehouseFilter.value || po.warehouseId === warehouseFilter.value)
    .map(po => ({
      ...po,
      tasks: po.tasks.filter(t =>
        (!assigneeFilter.value || t.assignee === assigneeFilter.value) &&
        (!statusFilter.value || t.status === statusFilter.value),
      ),
    }))
    .filter(po => po.tasks.length > 0)
    .filter(po =>
      !s
      || po.purchaseNo.toLowerCase().includes(s)
      || po.tasks.some(t => t.taskNo.toLowerCase().includes(s) || t.assignee.toLowerCase().includes(s)),
    )
})

const hasActiveFilter = computed(
  () => !!search.value || !!statusFilter.value || !!warehouseFilter.value || !!assigneeFilter.value,
)
function clearFilters() {
  search.value = ''; statusFilter.value = ''; warehouseFilter.value = ''; assigneeFilter.value = ''
}

// number of columns for colspans (Assignee hidden for Ops)
const colCount = computed(() => (isScoped.value ? 7 : 8))

// ─── Accordion expand state (default: all expanded) ────────────────────────────
const expanded = reactive<Record<string, boolean>>({})
// Undefined = not yet toggled → treated as open; only an explicit false collapses.
const isExpanded = (id: string) => expanded[id] !== false
function toggle(id: string) { expanded[id] = !isExpanded(id) }

// ─── PO roll-ups ───────────────────────────────────────────────────────────────
function poSkuTotal(po: ReceivingPO) { return po.tasks.reduce((n, t) => n + t.skuCount, 0) }
function poPurchaseQty(po: ReceivingPO) { return po.tasks.reduce((n, t) => n + t.purchaseQty, 0) }
function poReceivedQty(po: ReceivingPO) { return po.tasks.reduce((n, t) => n + t.receivedQty, 0) }
function fmt(n: number) { return n.toLocaleString('id-ID') }
function formatDate(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}
// Aging shows only when a task ran longer than a day.
function aging(t: ReceivingTask) {
  const d = taskAgingDays(t)
  return d > 1 ? d : 0
}

// ─── Row actions ─────────────────────────────────────────────────────────────
function viewDetails(_t: ReceivingTask) { /* task detail (scan/manual) TBD */ }
const deleteModalOpen = ref(false)
const taskToDelete = ref<ReceivingTask | null>(null)
function openDeleteModal(t: ReceivingTask) { taskToDelete.value = t; deleteModalOpen.value = true }
function closeDeleteModal() { deleteModalOpen.value = false; taskToDelete.value = null }

const emptyIllustration = '/illustrations/empty-folder.png'
</script>

<template>
  <div class="rcvg-page">
    <!-- ── Filter bar ── -->
    <div class="filter-bar">
      <div class="filter-left">
        <MpPopover v-if="!isScoped" id="rcvg-wh-filter" is-close-on-select>
          <MpPopoverTrigger>
            <MpSelect id="rcvg-wh-select" placeholder="Warehouse" :model-value="warehouseFilter" is-clearable
              :class="css({ width: '180px' })" @mousedown.prevent @clear="warehouseFilter = ''">
              <option v-if="warehouseFilter" :value="warehouseFilter">{{ warehouseLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', maxWidth: '320px' })">
            <MpPopoverList>
              <MpPopoverListItem v-for="opt in warehouseOptions" :key="opt.value"
                :is-active="opt.value === warehouseFilter" @click="warehouseFilter = opt.value">{{ opt.label }}</MpPopoverListItem>
            </MpPopoverList>
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

        <MpPopover id="rcvg-status-filter" is-close-on-select>
          <MpPopoverTrigger>
            <MpSelect id="rcvg-status-select" placeholder="Status" :model-value="statusFilter" is-clearable
              :class="css({ width: '160px' })" @mousedown.prevent @clear="statusFilter = ''">
              <option v-if="statusFilter" :value="statusFilter">{{ statusLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content' })">
            <MpPopoverList>
              <MpPopoverListItem v-for="opt in statusOptions" :key="opt.value"
                :is-active="opt.value === statusFilter" @click="statusFilter = opt.value">{{ opt.label }}</MpPopoverListItem>
            </MpPopoverList>
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
          <MpTooltip id="tt-rcvg-export" label="Export" placement="bottom" use-portal>
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
    </div>

    <!-- ── Accordion table ── -->
    <div v-if="filteredPOs.length" class="rcvg-table-wrap">
      <table class="rcvg-table">
        <colgroup>
          <col style="width: 260px" />
          <col style="width: 170px" />
          <col v-if="!isScoped" style="width: 150px" />
          <col style="width: 100px" />
          <col style="width: 120px" />
          <col style="width: 100px" />
          <col style="width: 130px" />
          <col style="width: 180px" />
          <col style="width: 230px" />
          <col style="width: 44px" />
        </colgroup>
        <thead>
          <tr>
            <th class="rcvg-th">Number</th>
            <th class="rcvg-th">Warehouse</th>
            <th v-if="!isScoped" class="rcvg-th">Assignee</th>
            <th class="rcvg-th">SKU scope</th>
            <th class="rcvg-th rcvg-th--right">Purchase qty</th>
            <th class="rcvg-th rcvg-th--right">Received</th>
            <th class="rcvg-th">Status</th>
            <th class="rcvg-th">Start date</th>
            <th class="rcvg-th">End date</th>
            <th class="rcvg-th" />
          </tr>
        </thead>
        <tbody>
          <template v-for="po in filteredPOs" :key="po.id">
            <!-- PO group row -->
            <tr class="rcvg-po-row" @click="toggle(po.id)">
              <td class="rcvg-td rcvg-td--po">
                <MpIcon :name="isExpanded(po.id) ? 'chevrons-down' : 'chevrons-right'" size="sm" />
                <span class="rcvg-po-no">{{ po.purchaseNo }}</span>
              </td>
              <td class="rcvg-td">{{ po.warehouseName }}</td>
              <td v-if="!isScoped" class="rcvg-td" />
              <td class="rcvg-td">{{ poSkuTotal(po) }} SKUs</td>
              <td class="rcvg-td rcvg-td--right">{{ fmt(poPurchaseQty(po)) }}</td>
              <td class="rcvg-td rcvg-td--right">{{ fmt(poReceivedQty(po)) }}</td>
              <td class="rcvg-td" />
              <td class="rcvg-td" />
              <td class="rcvg-td" />
              <td class="rcvg-td" />
            </tr>
            <!-- Task rows -->
            <template v-if="isExpanded(po.id)">
              <tr v-for="t in po.tasks" :key="t.id" class="rcvg-task-row">
                <td class="rcvg-td rcvg-td--task">
                  <span class="rcvg-task-no">{{ t.taskNo }}</span>
                  <button class="row-hover-btn" @click.stop="viewDetails(t)">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span class="row-hover-btn__label">VIEW DETAILS</span>
                  </button>
                </td>
                <td class="rcvg-td" />
                <td v-if="!isScoped" class="rcvg-td">{{ t.assignee }}</td>
                <td class="rcvg-td">{{ t.skuScope }}</td>
                <td class="rcvg-td rcvg-td--right">{{ fmt(t.purchaseQty) }}</td>
                <td class="rcvg-td rcvg-td--right">{{ fmt(t.receivedQty) }}</td>
                <td class="rcvg-td"><ErpStatusBadge :status="t.status" /></td>
                <td class="rcvg-td">{{ formatDate(t.startDate) }}</td>
                <td class="rcvg-td">
                  <span class="rcvg-end">
                    <span v-if="t.endDate">{{ formatDate(t.endDate) }}</span>
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
                        <MpPopoverListItem :class="css({ color: 'var(--mp-text-critical)' })" @click="openDeleteModal(t)">Delete</MpPopoverListItem>
                      </MpPopoverList>
                    </MpPopoverContent>
                  </MpPopover>
                </td>
              </tr>
            </template>
          </template>
        </tbody>
      </table>
    </div>

    <!-- ── Empty state ── -->
    <div v-else class="empty-full">
      <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
      <p class="empty-full-title">{{ hasActiveFilter ? 'No receiving tasks found' : 'No receiving tasks' }}</p>
      <p class="empty-full-desc">{{ hasActiveFilter ? 'Try adjusting your filters.' : 'Receiving tasks will appear here.' }}</p>
    </div>
  </div>

  <!-- ── Delete confirmation modal ── -->
  <MpModal id="rcvg-delete-modal" :is-open="deleteModalOpen" size="sm"
    is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="closeDeleteModal">
    <MpModalContent>
      <MpModalHeader>Delete {{ taskToDelete?.taskNo }}?<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <template v-if="taskToDelete && taskToDelete.receivedQty > 0">
          This task has {{ fmt(taskToDelete.receivedQty) }} units recorded.
          Deleting it will return those units to the purchase order.
        </template>
        <template v-else>
          This receiving task will be permanently deleted.
        </template>
      </MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--secondary" @click="closeDeleteModal">Keep task</button>
          <button class="btn-enterprise btn-enterprise--danger" @click="closeDeleteModal">Delete task</button>
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
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral); color: var(--mp-text-secondary); min-width: 200px;
}
.filter-search-input {
  flex: 1; border: none; background: transparent; outline: none;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-md);
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }

/* Table */
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

.rcvg-td {
  height: var(--mp-sizes-10, 40px);
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-4) var(--mp-spacing-2\.5) var(--mp-spacing-2);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); vertical-align: middle; white-space: nowrap;
}
.rcvg-td--right { text-align: right; padding: var(--mp-spacing-2\.5) var(--mp-spacing-2) var(--mp-spacing-2\.5) var(--mp-spacing-4); font-variant-numeric: tabular-nums; }
.rcvg-td--muted { color: var(--mp-text-secondary); }
.rcvg-td--actions { text-align: right; padding-right: var(--mp-spacing-2); }

/* End date cell — date (or "In progress") + aging badge when > 1 day */
.rcvg-end { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.rcvg-end__ongoing { color: var(--mp-text-secondary); }
.rcvg-aging {
  display: inline-flex; align-items: center;
  padding: 0 var(--mp-spacing-1\.5); border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-warning-subtle, #fef3e6);
  color: var(--mp-text-warning, #a86400);
  font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-lg, 20px); white-space: nowrap;
}

/* PO group row — no hover state (it's just an expand/collapse header) */
.rcvg-po-row { cursor: pointer; background: var(--mp-background-neutral); }
.rcvg-td--po { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.rcvg-po-no { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.rcvg-task-count {
  padding: 0 var(--mp-spacing-1\.5); border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral-pressed); color: var(--mp-text-secondary);
  font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-lg, 24px);
}

/* Task row (indented under the PO) */
.rcvg-task-row:hover .rcvg-td { background: var(--mp-background-neutral-subtle); }
.rcvg-td--task { position: relative; padding-left: var(--mp-spacing-9, 36px); color: var(--mp-text-default); }

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
  display: flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-5, 20px); margin-left: auto;
  border: none; background: none; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-secondary);
}
.row-kebab svg { display: block; width: var(--mp-sizes-5, 20px); height: var(--mp-sizes-5, 20px); }
.row-kebab:hover { background: var(--mp-background-neutral-hovered); }

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
