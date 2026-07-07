<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch, inject } from 'vue'
import {
  MpIcon, MpTooltip, MpSelect, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton, css, toast,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import ClampText from '~/components/patterns/ClampText.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ApprovalLogModal from '~/components/patterns/ApprovalLogModal.vue'
import { formatDate, formatDateTime } from '~/utils/date'
import {
  warehouseTransfers, transferWarehouseOptions, transferMemo, transferUpdatedBy, transferUpdatedAt,
  transferApprovalLog, deleteTransfers, duplicateTransfer, approveTransfer,
  type WarehouseTransfer, type ApprovalLog,
} from '~/data/warehouseTransfers'
import { useApprovalViewAs } from '~/composables/useApprovalViewAs'

const route = useRoute()
const router = useRouter()
const toggleAirene = inject<() => void>('toggleAirene')

// ─── Approval view — demo toggle: "As user" (no Approve) vs "As manager" (can approve).
// Shared with the transfer detail page (module-level singleton) so it carries over. ────
const { viewAs, setViewAs } = useApprovalViewAs()
const viewAsOptions: { value: 'user' | 'manager'; label: string }[] = [
  { value: 'user', label: 'As user' },
  { value: 'manager', label: 'As manager' },
]

// ─── Columns (checkbox is rendered by ErpTablePage as the first column) ──────────
const columns: TableColumn[] = [
  { key: 'number',          label: 'Number',      width: '240px', sortable: true, sortType: 'text' },
  { key: 'date',            label: 'Date',        width: '130px', sortable: true, sortType: 'date' },
  { key: 'originName',      label: 'Origin',      width: '220px', sortType: 'text' },
  { key: 'destinationName', label: 'Destination', width: '220px', sortType: 'text' },
  { key: 'tags',            label: 'Tags',        width: '220px' },
  { key: 'lastUpdated',     label: 'Last updated', width: '220px' },
]

// Column show/hide — first column stays on; the sort menu's "Hide column" flips
// these off, the ColumnSettings menu turns them back on. "Last updated" is an opt-in
// column (off by default); "Memo" is a settings-only toggle — not its own column, it
// surfaces the memo under the transfer number.
const colVis = reactive<Record<string, boolean>>({
  ...Object.fromEntries(columns.map(c => [c.key, true])),
  lastUpdated: false,
  memo: false,
})
const visibleColumns = computed(() => columns.filter(c => colVis[c.key]))
// "Memo" sits directly under "Number" — it surfaces the memo beneath the number cell.
const columnItems = [
  { key: 'number', label: 'Number', disabled: true },
  { key: 'memo', label: 'Memo' },
  ...columns.slice(1).map(c => ({ key: c.key, label: c.label })),
]
function hideColumn(key: string) { colVis[key] = false }

// ─── Tab: "All warehouse transfers" vs "Awaiting approval" (driven by ?tab=) ──────
const isAwaiting = computed(() => route.query.tab === 'Awaiting approval')
// A regular user has no bulk/approve capability on the Awaiting approval tab — hide
// the row checkboxes entirely so there's nothing to select.
const showCheckbox = computed(() => !(isAwaiting.value && viewAs.value === 'user'))
// Sticky actions column width — wide enough for whichever button set the row shows:
// manager = Approve + 2 icons + kebab (4); user = Approval log + Comment + View details (3).
const actionsWidth = computed(() => {
  if (!isAwaiting.value) return undefined
  return viewAs.value === 'manager' ? '236px' : '148px'
})

// ─── Demo scenario state (FAB) + first-load skeleton ─────────────────────────────
type DemoState = 'data' | 'empty'
const demoState = ref<DemoState>('data')
const demoStates: { value: DemoState; label: string }[] = [
  { value: 'data', label: 'With data' },
  { value: 'empty', label: 'Empty state' },
]
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })
function setDemoState(s: DemoState) {
  demoState.value = s
  if (s === 'data') { loading.value = true; setTimeout(() => { loading.value = false }, 1200) }
}

// ─── Origin / Destination filters (independent MpSelect dropdowns) ────────────────
const originFilter = ref('')
const destFilter = ref('')
const whOptions = computed(() => transferWarehouseOptions())
const originLabel = computed(() => whOptions.value.find(o => o.value === originFilter.value)?.label ?? '')
const destLabel = computed(() => whOptions.value.find(o => o.value === destFilter.value)?.label ?? '')

// ─── Rows (demo state → tab → origin/destination filter; search handled below) ────
const baseRows = computed<WarehouseTransfer[]>(() => {
  if (demoState.value === 'empty') return []
  let list = [...warehouseTransfers]
  if (isAwaiting.value) list = list.filter(t => t.status === 'draft')
  else list = list.filter(t => t.status !== 'draft')
  if (originFilter.value) list = list.filter(t => t.originId === originFilter.value)
  if (destFilter.value) list = list.filter(t => t.destinationId === destFilter.value)
  return list
})

const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<WarehouseTransfer>(baseRows, {
  filterFn: (row, s) =>
    !s
    || row.number.toLowerCase().includes(s)
    || row.originName.toLowerCase().includes(s)
    || row.destinationName.toLowerCase().includes(s),
})

const hasActiveFilter = computed(() => !!search.value || !!originFilter.value || !!destFilter.value)
function clearFilters() { search.value = ''; originFilter.value = ''; destFilter.value = '' }
watch([originFilter, destFilter, isAwaiting], () => setPage(1))

// ─── Row actions ─────────────────────────────────────────────────────────────────
function viewDetails(row: WarehouseTransfer) { router.push(`/warehouse-transfers/${row.id}`) }
function viewWarehouse(id: string) { router.push(`/warehouses/${id}`) }
function newTransfer() { router.push('/warehouse-transfers/new') }
function editTransfer(row: WarehouseTransfer) { router.push(`/warehouse-transfers/${row.id}/edit`) }
function duplicate(row: WarehouseTransfer) {
  const copy = duplicateTransfer(row.id)
  if (copy) router.push(`/warehouse-transfers/${copy.id}/edit`)
}
function approve(row: WarehouseTransfer) {
  approveTransfer(row.id)
  toast.notify({ variant: 'success', title: `${row.number} approved` , maxWidth: 'max-content'})
}

// ─── Approval log (single shared modal, keyed to whichever row's icon was clicked) ──
const approvalLogSubject = ref('')
const approvalLogData = ref<ApprovalLog | null>(null)
const approvalLogOpen = ref(false)
function openApprovalLog(row: WarehouseTransfer) {
  approvalLogSubject.value = row.number
  approvalLogData.value = transferApprovalLog(row)
  approvalLogOpen.value = true
}

// ─── Bulk approve (Awaiting approval tab, manager view) ───────────────────────────
function selectedTransfersOf(sel: Set<number>): WarehouseTransfer[] {
  return [...sel].map(i => paginated.value[i]).filter(Boolean) as WarehouseTransfer[]
}
function bulkApprove(sel: Set<number>, deselectAll: () => void) {
  const rows = selectedTransfersOf(sel)
  for (const row of rows) approveTransfer(row.id)
  deselectAll()
  toast.notify({ variant: 'success', title: `${rows.length} transfer${rows.length > 1 ? 's' : ''} approved` , maxWidth: 'max-content'})
}

// ─── Bulk delete ─────────────────────────────────────────────────────────────────
const bulkDeleteOpen = ref(false)
const bulkDeleteIds = ref<string[]>([])
const deleteReason = ref('')
const deleteError = ref('')
const REASON_MAX = 256
let _bulkDeselect: (() => void) | null = null
function askBulkDelete(sel: Set<number>, deselectAll: () => void) {
  bulkDeleteIds.value = selectedTransfersOf(sel).map(t => t.id)
  _bulkDeselect = deselectAll
  deleteReason.value = ''
  deleteError.value = ''
  bulkDeleteOpen.value = true
}
// Keep the button clickable (no disabled buttons) — validate on click, show inline error.
function confirmBulkDelete() {
  if (!deleteReason.value.trim()) {
    deleteError.value = 'Enter a reason for deleting'
    return
  }
  deleteTransfers(bulkDeleteIds.value)
  _bulkDeselect?.()
  bulkDeleteOpen.value = false
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
    :actions-width="actionsWidth"
    :has-checkbox="showCheckbox"
    bulk-label="transfer"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
  >
    <!-- ── Filter bar ── -->
    <template #filters>
      <div class="filter-left">
        <!-- Origin -->
        <MpPopover id="wt-origin-filter" is-close-on-select>
          <MpPopoverTrigger>
            <MpSelect
              id="wt-origin-select" placeholder="Origin" :model-value="originFilter" is-clearable
              :class="css({ width: '180px' })" @mousedown.prevent @clear="originFilter = ''"
            >
              <option v-if="originFilter" :value="originFilter">{{ originLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', maxWidth: '320px' })">
            <MpPopoverList>
              <MpPopoverListItem
                v-for="opt in whOptions" :key="opt.value"
                :is-active="opt.value === originFilter" @click="originFilter = opt.value"
              >{{ opt.label }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <!-- Destination -->
        <MpPopover id="wt-dest-filter" is-close-on-select>
          <MpPopoverTrigger>
            <MpSelect
              id="wt-dest-select" placeholder="Destination" :model-value="destFilter" is-clearable
              :class="css({ width: '180px' })" @mousedown.prevent @clear="destFilter = ''"
            >
              <option v-if="destFilter" :value="destFilter">{{ destLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', maxWidth: '320px' })">
            <MpPopoverList>
              <MpPopoverListItem
                v-for="opt in whOptions" :key="opt.value"
                :is-active="opt.value === destFilter" @click="destFilter = opt.value"
              >{{ opt.label }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <button class="filter-all-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 6h18M7 12h10M11 18h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          All filters
        </button>
      </div>

      <div class="filter-right">
        <div class="filter-btn-group">
          <ColumnSettingsMenu id="wt-col-settings" :items="columnItems" :visibility="colVis" />
          <MpTooltip id="tt-wt-airene" label="Ask Airene" placement="bottom" use-portal>
            <button class="filter-icon-btn filter-icon-btn--airene" aria-label="Ask Airene" @click="toggleAirene?.()">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
              </svg>
            </button>
          </MpTooltip>
          <MpTooltip id="tt-wt-export" label="Export" placement="bottom" use-portal>
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

    <!-- ── Bulk bar → delete ── -->
    <template #bulk-actions="{ deselectAll, selectedRows }">
      <!-- Awaiting approval (manager view) — bulk Approve alongside Delete -->
      <button
        v-if="isAwaiting && viewAs === 'manager'"
        class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm"
        @click="bulkApprove(selectedRows as Set<number>, deselectAll)"
      >
        Approve
      </button>
      <button
        class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm"
        :class="css({ color: 'var(--mp-text-critical)' })"
        @click="askBulkDelete(selectedRows as Set<number>, deselectAll)"
      >
        Delete
      </button>
    </template>

    <!-- ── Number — View details chip on hover; memo below when the toggle is on ── -->
    <template #cell-number="{ value, row }">
      <div class="wt-number-cell">
        <div class="cell-with-action">
          <span class="cell-text wt-link">{{ value }}</span>
          <button class="row-hover-btn" @click.stop="viewDetails(row as unknown as WarehouseTransfer)">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span class="row-hover-btn__label">VIEW DETAILS</span>
          </button>
        </div>
        <ClampText v-if="colVis.memo" :text="transferMemo(row as unknown as WarehouseTransfer)" :lines="2" class="wt-memo" />
      </div>
    </template>

    <template #cell-date="{ value }">{{ formatDate(value as string) }}</template>

    <!-- ── Origin — View details chip → warehouse detail ── -->
    <template #cell-originName="{ value, row }">
      <div class="cell-with-action">
        <span class="cell-text">{{ value }}</span>
        <button class="row-hover-btn" @click.stop="viewWarehouse((row as unknown as WarehouseTransfer).originId)">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="row-hover-btn__label">VIEW DETAILS</span>
        </button>
      </div>
    </template>

    <!-- ── Destination — View details chip → warehouse detail ── -->
    <template #cell-destinationName="{ value, row }">
      <div class="cell-with-action">
        <span class="cell-text">{{ value }}</span>
        <button class="row-hover-btn" @click.stop="viewWarehouse((row as unknown as WarehouseTransfer).destinationId)">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="row-hover-btn__label">VIEW DETAILS</span>
        </button>
      </div>
    </template>

    <template #cell-tags="{ value }"><ErpTagList :tags="(value as string[])" /></template>

    <!-- ── Last updated — timestamp + who (opt-in column) ── -->
    <template #cell-lastUpdated="{ row }">
      <div class="wt-updated">
        <span class="wt-updated-date">{{ formatDateTime(transferUpdatedAt(row as unknown as WarehouseTransfer)) }}</span>
        <span class="wt-updated-by">{{ transferUpdatedBy(row as unknown as WarehouseTransfer) }}</span>
      </div>
    </template>

    <!-- ── Actions kebab ── -->
    <template #actions="{ row }">
      <!-- Awaiting approval, AS MANAGER — Approve (secondary) + Approval log / Comments
           (ghost icon) + kebab, all in the one sticky actions column. -->
      <div v-if="isAwaiting && viewAs === 'manager'" class="wt-approval-actions">
        <button
          class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm"
          @click.stop="approve(row as unknown as WarehouseTransfer)"
        >Approve</button>
        <MpTooltip :id="`wt-tt-log-${row.id}`" label="Approval log" placement="top" use-portal>
          <button class="row-icon-ghost" aria-label="Approval log" @click.stop="openApprovalLog(row as unknown as WarehouseTransfer)">
            <MpIcon name="task-todo" size="md" />
          </button>
        </MpTooltip>
        <MpTooltip :id="`wt-tt-comment-${row.id}`" label="Comments" placement="top" use-portal>
          <button class="row-icon-ghost" aria-label="Comments" @click.stop>
            <MpIcon name="comment" size="md" />
          </button>
        </MpTooltip>
        <MpPopover :id="`wt-actions-${row.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <button class="row-kebab" aria-label="More actions">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
              </svg>
            </button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
            <MpPopoverList>
              <MpPopoverListItem @click="viewDetails(row as unknown as WarehouseTransfer)">View details</MpPopoverListItem>
              <MpPopoverListItem @click="duplicate(row as unknown as WarehouseTransfer)">Duplicate</MpPopoverListItem>
              <MpPopoverListItem @click="editTransfer(row as unknown as WarehouseTransfer)">Edit</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>

      <!-- Awaiting approval, AS USER — no Approve: just Approval log / Comments / View
           details (ghost icon buttons only, no kebab — nothing else is editable). -->
      <div v-else-if="isAwaiting" class="wt-approval-actions">
        <MpTooltip :id="`wt-tt-log-${row.id}`" label="Approval log" placement="top" use-portal>
          <button class="row-icon-ghost" aria-label="Approval log" @click.stop="openApprovalLog(row as unknown as WarehouseTransfer)">
            <MpIcon name="task-todo" size="md" />
          </button>
        </MpTooltip>
        <MpTooltip :id="`wt-tt-comment-${row.id}`" label="Comments" placement="top" use-portal>
          <button class="row-icon-ghost" aria-label="Comments" @click.stop>
            <MpIcon name="comment" size="md" />
          </button>
        </MpTooltip>
        <MpTooltip :id="`wt-tt-view-${row.id}`" label="View details" placement="top" use-portal>
          <button class="row-icon-ghost" aria-label="View details" @click.stop="viewDetails(row as unknown as WarehouseTransfer)">
            <svg width="20" height="20" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </MpTooltip>
      </div>

      <!-- All warehouse transfers — kebab only -->
      <MpPopover v-else :id="`wt-actions-${row.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <button class="row-kebab" aria-label="More actions">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="viewDetails(row as unknown as WarehouseTransfer)">View details</MpPopoverListItem>
            <MpPopoverListItem @click="duplicate(row as unknown as WarehouseTransfer)">Duplicate</MpPopoverListItem>
            <MpPopoverListItem @click="editTransfer(row as unknown as WarehouseTransfer)">Edit</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Full empty state (first run) ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">No warehouse transfers</p>
        <p class="empty-full-desc">Move stock between your warehouses. Create your first warehouse transfer to get started.</p>
        <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before empty-full-cta" @click="newTransfer">
          <MpIcon name="add" size="md" />
          New warehouse transfer
        </button>
      </div>
    </template>
  </ErpTablePage>

  <ApprovalLogModal
    :is-open="approvalLogOpen"
    :subject="approvalLogSubject"
    :log="approvalLogData"
    @close="approvalLogOpen = false"
  />

  <!-- ── Bulk delete confirmation ── -->
  <MpModal
    id="wt-bulk-delete" :is-open="bulkDeleteOpen" size="md"
    is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="bulkDeleteOpen = false"
  >
    <MpModalContent>
      <MpModalHeader>Delete {{ bulkDeleteIds.length > 1 ? bulkDeleteIds.length + ' warehouse transfers' : 'warehouse transfer' }}?<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <p class="wt-del-intro">This action cannot be undone. Deleting {{ bulkDeleteIds.length > 1 ? 'these transfers' : 'this transfer' }} will:</p>
        <ul class="wt-del-list">
          <li>Remove the related journal entry</li>
          <li>Trigger recalculation that may affect COGS and product stock quantity</li>
        </ul>
        <div class="wt-del-field">
          <div class="wt-del-label-row">
            <label class="wt-del-label" for="wt-del-reason">Reason for deleting<span class="wt-del-req">*</span></label>
            <span class="wt-del-count">{{ deleteReason.length }} / {{ REASON_MAX }}</span>
          </div>
          <textarea
            id="wt-del-reason" class="wt-del-textarea" :class="{ 'wt-del-textarea--error': deleteError }"
            :maxlength="REASON_MAX" v-model="deleteReason" rows="3"
            @input="deleteError = ''"
          ></textarea>
          <p v-if="deleteError" class="wt-del-error">{{ deleteError }}</p>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--ghost" @click="bulkDeleteOpen = false">Cancel</button>
          <button class="btn-enterprise btn-enterprise--danger" @click="confirmBulkDelete">Delete</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <!-- ── Demo scenario FAB (bottom-right) ── -->
  <MpPopover id="wt-demo-fab" is-close-on-select use-portal placement="top-end">
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
      <p class="demo-fab-heading">Approval view</p>
      <MpPopoverList>
        <MpPopoverListItem
          v-for="v in viewAsOptions" :key="v.value"
          :is-active="v.value === viewAs" @click="setViewAs(v.value)"
        >{{ v.label }}</MpPopoverListItem>
      </MpPopoverList>
    </MpPopoverContent>
  </MpPopover>
</template>

<style scoped>
/* Filter bar */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.filter-btn-group { display: flex; align-items: center; gap: var(--mp-spacing-1); }

.filter-select-wrap {
  position: relative; display: inline-flex; align-items: center; width: 200px;
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
}
.filter-select {
  appearance: none; background: transparent; border: none; outline: none; width: 100%;
  padding: var(--mp-spacing-2) var(--mp-spacing-9) var(--mp-spacing-2) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-placeholder); cursor: pointer;
}
.filter-select:focus { outline: none; }
.filter-select-chevron {
  position: absolute; right: var(--mp-spacing-2); pointer-events: none;
  color: var(--mp-text-default); width: var(--mp-sizes-5, 20px); height: var(--mp-sizes-5, 20px);
}
.filter-all-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary); cursor: pointer; white-space: nowrap;
}
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered); }

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

/* Cell hover chip */
.cell-with-action { position: relative; display: flex; align-items: center; width: 100%; min-width: 0; }
.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.wt-link { color: var(--mp-text-default); }

/* Number cell with optional memo underneath */
.wt-number-cell { display: flex; flex-direction: column; gap: var(--mp-spacing-1); min-width: 0; }
.wt-memo { max-width: 100%; }

/* Last updated cell — timestamp + who */
.wt-updated { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: 0; }
.wt-updated-date { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; }
.wt-updated-by { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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

/* Kebab */
.row-kebab {
  display: flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-5, 20px); margin-left: auto;
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-text-secondary);
}
.row-kebab svg { display: block; width: var(--mp-sizes-5, 20px); height: var(--mp-sizes-5, 20px); }
.row-kebab:hover { background: var(--mp-background-neutral-hovered); }

/* Awaiting-approval row actions — Approve (secondary) + ghost icon buttons + kebab,
   grouped and right-aligned in the one sticky actions column. */
.wt-approval-actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-3); }
.wt-approval-actions .row-kebab { margin-left: 0; }
.row-icon-ghost {
  display: flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-5, 20px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-text-secondary); flex-shrink: 0;
}
.row-icon-ghost:hover { background: var(--mp-background-neutral-hovered); }

/* Empty state */
.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin-top: var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); max-width: 360px; text-align: center; }
.empty-full-cta { margin-top: var(--mp-spacing-4); }

/* Modal footer */
.modal-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-3); width: 100%; }

/* Delete warehouse transfer modal */
.wt-del-intro { color: var(--mp-text-default); font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 24px); }
.wt-del-list {
  margin: var(--mp-spacing-2) 0 0; padding-left: 21px; list-style: disc;
  color: var(--mp-text-default); font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 24px);
}
.wt-del-field { margin-top: var(--mp-spacing-5, 20px); display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.wt-del-label-row { display: flex; align-items: center; gap: var(--mp-spacing-1); width: 100%; }
.wt-del-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.wt-del-req { color: var(--mp-text-danger, #a8352d); margin-left: 2px; }
.wt-del-count { margin-left: auto; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.wt-del-textarea {
  width: 100%; min-height: 80px; resize: vertical;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-form, rgba(29,31,36,0.16)); border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral, #fff); color: var(--mp-text-default);
  font-family: inherit; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md);
}
.wt-del-textarea:focus { outline: none; border-color: var(--mp-border-focus, var(--mp-text-selected)); }
.wt-del-textarea--error { border-color: var(--mp-border-danger, var(--mp-text-danger, #a8352d)); }
.wt-del-error { margin-top: var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #a8352d); }

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
.demo-fab-heading { padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
