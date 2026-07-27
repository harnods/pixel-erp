<script setup lang="ts">
import {
  MpSelect, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, MpIcon, MpTooltip, MpCheckbox, MpBadge,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton, MpRadio, css, toast,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { warehouses, archiveWarehouses, unarchiveWarehouses } from '~/data'
import type { Warehouse } from '~/data'

const toggleAirene = inject<() => void>('toggleAirene')

const router = useRouter()
function goToDetail(id: string) { router.push(`/warehouses/${id}`) }
function goEdit(id: string) { router.push(`/warehouses/${id}/edit`) }
function goConfigure(id: string) { router.push(`/warehouses/${id}/configure`) }

// ─── Column definitions ───────────────────────────────────────────────────────
const allColumns: TableColumn[] = [
  { key: 'name',        label: 'Name',         width: '155px', sortType: 'text' },
  { key: 'code',        label: 'Code',         width: '78px',  sortType: 'text' },
  { key: 'skuTotal',    label: 'SKU qty',      width: '78px', align: 'right', sortType: 'number' },
  { key: 'pics',        label: 'PIC',          width: '108px' },
  { key: 'address',     label: 'Address',      width: '90px',  sortType: 'text' },
  { key: 'status',      label: 'Status',       width: '90px',  sortType: 'text' },
  { key: 'lastUpdated', label: 'Last updated', width: '120px' },
]

// Column settings — Name is always on and cannot be hidden
const columnItems = [
  { key: 'name',        label: 'Name',         disabled: true  },
  { key: 'code',        label: 'Code',         disabled: false },
  { key: 'skuTotal',    label: 'SKU qty',      disabled: false },
  { key: 'pics',        label: 'PIC',          disabled: false },
  { key: 'address',     label: 'Address',      disabled: false },
  { key: 'status',      label: 'Status',       disabled: false },
  { key: 'lastUpdated', label: 'Last updated', disabled: false },
]

const columnVisibility = reactive<Record<string, boolean>>({
  name:        true,
  code:        true,
  skuTotal:    true,
  pics:        true,
  address:     true,
  status:      true,
  lastUpdated: false,
})

const columns = computed<TableColumn[]>(() =>
  allColumns.filter(col => columnVisibility[col.key]),
)

// The sort menu's "Hide column" flips visibility off; the Column settings popover turns it back on.
function hideColumn(key: string) { columnVisibility[key] = false }

function formatUpdatedAt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

// ─── Table state ──────────────────────────────────────────────────────────────
const rows = computed<Warehouse[]>(() => warehouses)

const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<Warehouse>(rows, {
  perPage: 25,
  filterFn: (row, s, status) =>
    (row.name.toLowerCase().includes(s) || row.code.toLowerCase().includes(s)) &&
    (!status || row.status === status),
})

// Default filter to active warehouses
statusFilter.value = 'active'

// ─── Filter options ───────────────────────────────────────────────────────────
const statusOptions = [
  { label: 'Active',   value: 'active'   },
  { label: 'Archived', value: 'archived' },
]

const statusLabel = computed(
  () => statusOptions.find(o => o.value === statusFilter.value)?.label ?? '',
)

// ─── Row disabled (default warehouse cannot be bulk-selected) ─────────────────
function isRowDisabled(row: Record<string, unknown>): boolean {
  return !!(row as unknown as Warehouse).isDefault
}

// ─── Delete confirmation ──────────────────────────────────────────────────────
const deleteModalOpen = ref(false)
const warehouseToDelete = ref<Warehouse | null>(null)

function openDeleteModal(row: Warehouse) {
  warehouseToDelete.value = row
  deleteModalOpen.value = true
}

function closeDeleteModal() {
  deleteModalOpen.value = false
  warehouseToDelete.value = null
}

// ─── Archive confirmation ─────────────────────────────────────────────────────
const archiveModalOpen = ref(false)
const warehouseToArchive = ref<Warehouse | null>(null)

function openArchiveModal(row: Warehouse) {
  warehouseToArchive.value = row
  archiveModalOpen.value = true
}

function closeArchiveModal() {
  archiveModalOpen.value = false
  warehouseToArchive.value = null
}

function confirmArchive() {
  if (!warehouseToArchive.value) return
  archiveWarehouses([warehouseToArchive.value.id])
  toast.notify({ variant: 'success', title: `${warehouseToArchive.value.name} archived` , maxWidth: 'max-content'})
  closeArchiveModal()
}

/** Unarchive is a low-friction, reversible action — no confirmation needed. */
function unarchive(row: Warehouse) {
  unarchiveWarehouses([row.id])
  toast.notify({ variant: 'success', title: `${row.name} unarchived` , maxWidth: 'max-content'})
}

// ─── Bulk delete confirmation ─────────────────────────────────────────────────
const bulkDeleteModalOpen = ref(false)
const bulkDeleteCount = ref(0)

function openBulkDeleteModal(count: number) {
  bulkDeleteCount.value = count
  bulkDeleteModalOpen.value = true
}

function closeBulkDeleteModal() {
  bulkDeleteModalOpen.value = false
}

// ─── Bulk archive confirmation ────────────────────────────────────────────────
const bulkArchiveModalOpen = ref(false)
const bulkArchiveIds = ref<string[]>([])
const bulkArchiveCount = computed(() => bulkArchiveIds.value.length)
let bulkArchiveDeselect: (() => void) | null = null

function openBulkArchiveModal(sel: Set<number>, deselectAll: () => void) {
  bulkArchiveIds.value = [...sel]
    .map((i) => (paginated.value[i] as unknown as Warehouse)?.id)
    .filter(Boolean) as string[]
  bulkArchiveDeselect = deselectAll
  bulkArchiveModalOpen.value = true
}

function closeBulkArchiveModal() {
  bulkArchiveModalOpen.value = false
}

function confirmBulkArchive() {
  const count = bulkArchiveCount.value
  archiveWarehouses(bulkArchiveIds.value)
  toast.notify({ variant: 'success', title: `${count} warehouse${count !== 1 ? 's' : ''} archived` , maxWidth: 'max-content'})
  bulkArchiveDeselect?.()
  closeBulkArchiveModal()
}

// ─── Export modal ─────────────────────────────────────────────────────────────
const exportModalOpen = ref(false)
const selectedCount = ref(0)

type ExportScope = 'all' | 'page' | 'selected'
const exportScope = ref<ExportScope>('all')

const exportColumnKeys = ['name', 'code', 'skuTotal', 'pics', 'address', 'status'] as const
const exportColumnLabels: Record<string, string> = {
  name: 'Name', code: 'Code', skuTotal: 'SKU qty',
  pics: 'PIC', address: 'Address', status: 'Status',
}
const exportColumnChecked = reactive<Record<string, boolean>>(
  Object.fromEntries(exportColumnKeys.map(k => [k, true]))
)
const exportColumnSearch = ref('')

const visibleExportColumns = computed(() =>
  exportColumnKeys.filter(k =>
    exportColumnLabels[k].toLowerCase().includes(exportColumnSearch.value.toLowerCase())
  )
)
const allExportColumnsChecked = computed(() =>
  exportColumnKeys.every(k => exportColumnChecked[k])
)
const someExportColumnsChecked = computed(() =>
  exportColumnKeys.some(k => exportColumnChecked[k]) && !allExportColumnsChecked.value
)

function toggleAllExportColumns() {
  const next = !allExportColumnsChecked.value
  exportColumnKeys.forEach(k => { exportColumnChecked[k] = next })
}

function openExportModal() {
  exportScope.value = selectedCount.value > 0 ? 'selected' : 'all'
  exportColumnSearch.value = ''
  exportColumnKeys.forEach(k => { exportColumnChecked[k] = true })
  exportModalOpen.value = true
}

function closeExportModal() {
  exportModalOpen.value = false
}

// ─── First-load skeleton ──────────────────────────────────────────────────────
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })

// ─── Actions ──────────────────────────────────────────────────────────────────
function clearFilters() {
  search.value = ''
  statusFilter.value = 'active'
}

// ─── Empty state — illustrated (matches every other index page); the status tab
// (Active/Archived) has its own tailored copy, not the generic "adjust your filters"
// text (that's reserved for an actual search miss, via hasActiveFilter below). ────────
const emptyIllustration = '/illustrations/empty-folder.png'
const emptyTitle = computed(() => statusFilter.value === 'archived' ? 'No archived warehouses' : 'No warehouses')
const emptyDesc = computed(() =>
  statusFilter.value === 'archived' ? 'Warehouses you archive will appear here.' : 'Warehouses will appear here once created.',
)
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
    :has-active-filter="!!search"
    has-checkbox
    :row-disabled="isRowDisabled"
    bulk-label="warehouse"
    :context-label="(row) => `${row.name}`"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
    @selection-change="count => selectedCount = count"
  >

    <!-- ── Bulk actions ── -->
    <template #bulk-actions="{ count, selectedRows, deselectAll }">
      <button
        class="btn-enterprise btn-enterprise--primary btn-enterprise--sm"
        @click="openBulkArchiveModal(selectedRows as Set<number>, deselectAll)"
      >
        Archive
      </button>
      <button
        class="btn-enterprise btn-enterprise--plain btn-enterprise--sm"
        @click="openBulkDeleteModal(count)"
      >
        Delete
      </button>
    </template>

    <!-- ── Filter bar ── -->
    <template #filters>
      <div class="filter-left">
        <MpPopover id="wh-status-filter" is-close-on-select>
          <MpPopoverTrigger>
            <MpSelect
              id="wh-status-select"
              placeholder="Status"
              :model-value="statusFilter"
              is-clearable
              :class="css({ width: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })"
              @mousedown.prevent
              @clear="statusFilter = ''"
            >
              <option v-if="statusFilter" :value="statusFilter">{{ statusLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', maxWidth: '320px' })">
            <MpPopoverList>
              <MpPopoverListItem
                v-for="opt in statusOptions"
                :key="opt.value"
                :is-active="opt.value === statusFilter"
                @click="statusFilter = opt.value"
              >
                {{ opt.label }}
              </MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

      </div>

      <div class="filter-right">
        <div class="filter-btn-group">
          <!-- Airene -->
          <MpTooltip id="tt-wh-airene" label="Ask Airene" placement="bottom" use-portal>
            <button class="filter-icon-btn filter-icon-btn--airene" aria-label="Ask Airene" @click="toggleAirene?.()">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
              </svg>
            </button>
          </MpTooltip>
          <!-- Column settings -->
          <MpPopover id="wh-col-settings" placement="bottom-end" use-portal>
            <MpPopoverTrigger>
              <button class="filter-icon-btn" aria-label="Column settings">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path fill-rule="evenodd" clip-rule="evenodd" d="M6.97345 1.26335C7.1777 1.25434 7.38659 1.25 7.6 1.25H12.4C12.6134 1.25 12.8223 1.25434 13.0265 1.26335C13.0315 1.26352 13.0365 1.26374 13.0415 1.26401C14.8152 1.34425 16.2378 1.77715 17.2303 2.76967C18.3398 3.87914 18.75 5.52603 18.75 7.6V12.4C18.75 14.474 18.3398 16.1209 17.2303 17.2303C16.2378 18.2229 14.8152 18.6558 13.0415 18.736C13.0365 18.7363 13.0316 18.7365 13.0266 18.7367C12.8223 18.7457 12.6134 18.75 12.4 18.75H7.6C7.38658 18.75 7.17769 18.7457 6.97344 18.7367C6.96845 18.7365 6.96347 18.7363 6.95851 18.736C5.1848 18.6557 3.76219 18.2228 2.76967 17.2303C1.6602 16.1209 1.25 14.474 1.25 12.4V7.6C1.25 5.52603 1.6602 3.87914 2.76967 2.76967C3.76219 1.77715 5.18479 1.34425 6.9585 1.26401C6.96347 1.26374 6.96845 1.26352 6.97345 1.26335ZM6.25 2.82736C5.10607 2.97282 4.34147 3.31919 3.83033 3.83033C3.1398 4.52086 2.75 5.67397 2.75 7.6V12.4C2.75 14.326 3.1398 15.4791 3.83033 16.1697C4.34147 16.6808 5.10607 17.0272 6.25 17.1726V2.82736ZM7.75 17.25V2.75H12.25V17.25H7.75ZM13.75 17.1726C14.8939 17.0272 15.6585 16.6808 16.1697 16.1697C16.8602 15.4791 17.25 14.326 17.25 12.4V7.6C17.25 5.67397 16.8602 4.52086 16.1697 3.83033C15.6585 3.31919 14.8939 2.97282 13.75 2.82736V17.1726Z" fill="currentColor"/>
                </svg>
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', padding: '0' })">
              <ul class="col-settings-list">
                <li
                  v-for="item in columnItems"
                  :key="item.key"
                  class="col-settings-item"
                  :class="{ 'col-settings-item--disabled': item.disabled }"
                  @click="!item.disabled && (columnVisibility[item.key] = !columnVisibility[item.key])"
                >
                  <span @click.stop>
                    <MpCheckbox
                      :id="`col-chk-${item.key}`"
                      :is-checked="columnVisibility[item.key]"
                      :is-disabled="item.disabled"
                      @change="() => { if (!item.disabled) columnVisibility[item.key] = !columnVisibility[item.key] }"
                    />
                  </span>
                  <span class="col-settings-label">{{ item.label }}</span>
                </li>
              </ul>
            </MpPopoverContent>
          </MpPopover>
          <!-- Export -->
          <MpTooltip id="tt-wh-export" label="Export" placement="bottom" use-portal>
            <button class="filter-icon-btn" aria-label="Export" @click="openExportModal">
              <MpIcon name="download" size="md" />
            </button>
          </MpTooltip>
        </div>

        <!-- Pill search -->
        <div class="filter-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input
            v-model="search"
            class="filter-search-input"
            type="text"
            placeholder="Search warehouse name..."
          />
        </div>
      </div>
    </template>

    <!-- ── Cell: Name — "View details" chip on row hover ── -->
    <template #cell-name="{ value, row }">
      <div class="cell-with-action">
        <span class="cell-text">{{ value }}</span>
        <MpBadge v-if="(row as unknown as Warehouse).isDefault" for="tableStatus" type="announcement" size="sm" class="badge-wh-default">DEFAULT</MpBadge>
        <button class="row-hover-btn" @click.stop="goToDetail((row as unknown as Warehouse).id)">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="row-hover-btn__label">VIEW DETAILS</span>
        </button>
      </div>
    </template>

    <!-- ── Cell: SKU Total ── -->
    <template #cell-skuTotal="{ value }">
      {{ (value as number).toLocaleString('id-ID') }}
    </template>

    <!-- ── Cell: PIC — tag chips, wrapping ── -->
    <template #cell-pics="{ value }">
      <div class="pic-tags">
        <span v-for="pic in (value as Warehouse['pics'])" :key="pic.id" class="pic-tag">
          {{ pic.name }}
        </span>
      </div>
    </template>

    <!-- ── Cell: Address — truncated single line ── -->
    <template #cell-address="{ value }">
      <div class="cell-with-action">
        <span class="cell-address">{{ value }}</span>
      </div>
    </template>

    <!-- ── Cell: Status ── -->
    <template #cell-status="{ value }">
      <ErpStatusBadge :status="value as string" />
    </template>

    <!-- ── Cell: Last updated — date + person below ── -->
    <template #cell-lastUpdated="{ row }">
      <div class="cell-last-updated">
        <span class="cell-last-updated__date">{{ formatUpdatedAt((row as Warehouse).updatedAt) }}</span>
        <span class="cell-last-updated__by">{{ (row as Warehouse).updatedBy }}</span>
      </div>
    </template>

    <!-- ── Actions kebab ── -->
    <template #actions="{ row }">
      <MpPopover :id="`wh-actions-${row.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <button class="row-kebab" aria-label="More actions">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="goToDetail((row as unknown as Warehouse).id)">View details</MpPopoverListItem>
            <MpPopoverListItem @click="goEdit((row as unknown as Warehouse).id)">Edit</MpPopoverListItem>
            <template v-if="!(row as unknown as Warehouse).isDefault">
              <MpPopoverListItem
                v-if="(row as unknown as Warehouse).status === 'active'"
                @click="openArchiveModal(row as unknown as Warehouse)"
              >
                Archive
              </MpPopoverListItem>
              <MpPopoverListItem v-else @click="unarchive(row as unknown as Warehouse)">
                Unarchive
              </MpPopoverListItem>
              <MpPopoverListItem
                v-if="!(row as unknown as Warehouse).hasTransactions"
                :class="css({ color: 'var(--mp-text-critical)' })"
                @click="openDeleteModal(row as unknown as Warehouse)"
              >
                Delete
              </MpPopoverListItem>
            </template>
            <div class="wh-menu-divider" role="separator" style="height:1px;margin:4px 0;background:var(--mp-border-default);" />
            <MpPopoverListItem @click="goConfigure((row as unknown as Warehouse).id)">Configure warehouse</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Full empty state (no active-search result — status tab genuinely has none) ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ emptyTitle }}</p>
        <p class="empty-full-desc">{{ emptyDesc }}</p>
      </div>
    </template>

  </ErpTablePage>

  <!-- ── Delete confirmation modal ── -->
  <MpModal
    id="wh-delete-modal"
    :is-open="deleteModalOpen"
    size="md"
    is-close-on-esc
    is-close-on-overlay-click
    :is-keep-alive="false"
    @close="closeDeleteModal"
  >
    <MpModalContent>
      <MpModalHeader>
        Delete warehouse?
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        Deleted warehouse cannot be restored.
      </MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--ghost" @click="closeDeleteModal">Cancel</button>
          <button class="btn-enterprise btn-enterprise--danger" @click="closeDeleteModal">Delete</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <!-- ── Archive confirmation modal ── -->
  <MpModal
    id="wh-archive-modal"
    :is-open="archiveModalOpen"
    size="md"
    is-close-on-esc
    is-close-on-overlay-click
    :is-keep-alive="false"
    @close="closeArchiveModal"
  >
    <MpModalContent>
      <MpModalHeader>
        Archive warehouse?
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <div class="archive-modal-body">
          <p>Archiving this warehouse will:</p>
          <ul>
            <li>Hide it from all transaction forms.</li>
            <li>Stop recurring transactions in Sales and Purchases.</li>
            <li>Block draft transactions linked to this warehouse from being approved.</li>
            <li>Disable multilevel storage.</li>
            <li>May cause sync issues with Moka POS.</li>
          </ul>
          <p class="archive-modal-body__note">To avoid disruption, reassign open transactions to another warehouse before archiving.</p>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--ghost" @click="closeArchiveModal">Cancel</button>
          <button class="btn-enterprise btn-enterprise--primary" @click="confirmArchive">Archive</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <!-- ── Bulk archive confirmation modal ── -->
  <MpModal
    id="wh-bulk-archive-modal"
    :is-open="bulkArchiveModalOpen"
    size="md"
    is-close-on-esc
    is-close-on-overlay-click
    :is-keep-alive="false"
    @close="closeBulkArchiveModal"
  >
    <MpModalContent>
      <MpModalHeader>
        Archive {{ bulkArchiveCount }} warehouse{{ bulkArchiveCount !== 1 ? 's' : '' }}?
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        Archived warehouses will no longer appear in the active list. You can unarchive them at any time.
      </MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--ghost" @click="closeBulkArchiveModal">Cancel</button>
          <button class="btn-enterprise btn-enterprise--primary" @click="confirmBulkArchive">Archive</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <!-- ── Export modal ── -->
  <MpModal
    id="wh-export-modal"
    :is-open="exportModalOpen"
    size="lg"
    is-close-on-esc
    is-close-on-overlay-click
    :is-keep-alive="false"
    @close="closeExportModal"
  >
    <MpModalContent>
      <MpModalHeader>
        Export warehouses
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <div class="export-modal-body">

          <!-- Export scope -->
          <div class="export-section">
            <p class="export-section__label">Export scope</p>
            <div class="export-radio-group">
              <label class="export-radio-item">
                <MpRadio
                  id="export-scope-all"
                  name="export-scope"
                  value="all"
                  :is-checked="exportScope === 'all'"
                  @change="exportScope = 'all'"
                />
                <span>All warehouses ({{ total }})</span>
              </label>
              <label class="export-radio-item">
                <MpRadio
                  id="export-scope-page"
                  name="export-scope"
                  value="page"
                  :is-checked="exportScope === 'page'"
                  @change="exportScope = 'page'"
                />
                <span>Current page</span>
              </label>
              <label class="export-radio-item" :class="{ 'export-radio-item--disabled': selectedCount === 0 }">
                <MpRadio
                  id="export-scope-selected"
                  name="export-scope"
                  value="selected"
                  :is-checked="exportScope === 'selected'"
                  :is-disabled="selectedCount === 0"
                  @change="selectedCount > 0 && (exportScope = 'selected')"
                />
                <span>Selected {{ selectedCount }} warehouse{{ selectedCount !== 1 ? 's' : '' }}</span>
              </label>
            </div>
          </div>

          <!-- Select columns -->
          <div class="export-section">
            <p class="export-section__label">Select columns to export</p>

            <!-- Search -->
            <div class="export-col-search">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              <input
                v-model="exportColumnSearch"
                class="export-col-search__input"
                type="text"
                placeholder="Search columns..."
              />
              <button v-if="exportColumnSearch" class="search-clear-btn" type="button" aria-label="Clear search" @click="exportColumnSearch = ''">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                </svg>
              </button>
            </div>

            <!-- All columns toggle -->
            <div class="export-col-all">
              <MpCheckbox
                id="export-col-all"
                :is-checked="allExportColumnsChecked"
                :is-indeterminate="someExportColumnsChecked"
                @change="toggleAllExportColumns"
                @click.stop
              />
              <span class="export-col-label">All columns</span>
            </div>

            <!-- Column list -->
            <div class="export-col-list">
              <label
                v-for="key in visibleExportColumns"
                :key="key"
                class="export-col-item"
              >
                <MpCheckbox
                  :id="`export-col-${key}`"
                  :is-checked="exportColumnChecked[key]"
                  @change="exportColumnChecked[key] = !exportColumnChecked[key]"
                  @click.stop
                />
                <span class="export-col-label">{{ exportColumnLabels[key] }}</span>
              </label>
            </div>
          </div>

        </div>
      </MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--ghost" @click="closeExportModal">Cancel</button>
          <button class="btn-enterprise btn-enterprise--primary" @click="closeExportModal">Export</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <!-- ── Bulk delete confirmation modal ── -->
  <MpModal
    id="wh-bulk-delete-modal"
    :is-open="bulkDeleteModalOpen"
    size="md"
    is-close-on-esc
    is-close-on-overlay-click
    :is-keep-alive="false"
    @close="closeBulkDeleteModal"
  >
    <MpModalContent>
      <MpModalHeader>
        Delete {{ bulkDeleteCount }} warehouse{{ bulkDeleteCount !== 1 ? 's' : '' }}?
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        Deleted warehouses cannot be restored.
      </MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--ghost" @click="closeBulkDeleteModal">Cancel</button>
          <button class="btn-enterprise btn-enterprise--danger" @click="closeBulkDeleteModal">Delete</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
/* Full empty state (illustrated — matches every other index page) */
.empty-full { display: flex; flex-direction: column; align-items: center; padding: var(--mp-spacing-10, 40px) 0; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin-top: var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* Filter bar layout — reused from other index pages */
.filter-left {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
}


.filter-right {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
}

.filter-btn-group {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-1);
}

.filter-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-9, 36px);
  height: var(--mp-sizes-9, 36px);
  border: none;
  background: none;
  border-radius: var(--mp-radii-md);
  cursor: pointer;
  color: var(--mp-text-secondary);
  padding: var(--mp-spacing-2);
}
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
.filter-icon-btn--airene { color: var(--mp-airene-default); }

.filter-search {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral);
  color: var(--mp-text-secondary);
  min-width: 200px;
}

.filter-search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default);
  line-height: var(--mp-line-heights-md);
  outline: none;
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }

/* Cell styles */
.cell-with-action {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
}

.cell-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-hover-btn {
  position: absolute;
  right: 0;
  top: var(--mp-spacing-2\.5, 10px);
  transform: translateY(-50%);
  display: none;
  align-items: center;
  gap: var(--mp-spacing-1\.5);
  padding: var(--mp-spacing-1) var(--mp-spacing-1\.5);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-sm);
  cursor: pointer;
  white-space: nowrap;
  line-height: 1;
}

.row-hover-btn__label {
  font-size: var(--mp-font-sizes-2xs, 10px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xs, 12px);
  color: var(--mp-text-secondary);
  text-transform: uppercase;
  letter-spacing: var(--mp-letter-spacings-normal);
}

:global(.erp-tr:hover .row-hover-btn) {
  display: flex;
}

.cell-address {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  white-space: normal;
  flex: 1;
  min-width: 0;
}

/* DEFAULT badge — 12px semibold override */
:global(.badge-wh-default) {
  font-size: 12px !important;
  font-weight: var(--mp-font-weights-semi-bold) !important;
  margin-left: var(--mp-spacing-1);
  flex-shrink: 0;
}

/* PIC tags */
.pic-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--mp-spacing-1);
}

.pic-tag {
  display: inline-flex;
  align-items: center;
  padding: var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full);
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
  white-space: nowrap;
}

/* Column settings popover */
.col-settings-list {
  list-style: none;
  margin: 0;
  padding: var(--mp-spacing-1) 0;
}

.col-settings-item {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  cursor: pointer;
  user-select: none;
}
.col-settings-item:hover { background: var(--mp-background-neutral-hovered); }
.col-settings-item--disabled { cursor: default; opacity: 0.5; }
.col-settings-item--disabled:hover { background: none; }

.col-settings-label {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}

/* Last updated cell */
.cell-last-updated {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-0\.5);
}
.cell-last-updated__date {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  white-space: nowrap;
}
.cell-last-updated__by {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
  white-space: nowrap;
}

/* Archive modal body */
.archive-modal-body {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
}

.archive-modal-body p {
  margin: 0;
}

.archive-modal-body ul {
  margin: 0;
  padding-left: var(--mp-spacing-5);
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
}

.archive-modal-body li {
  list-style: disc;
}

.archive-modal-body__note {
  color: var(--mp-text-default);
}

/* Export modal body */
.export-modal-body {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-5);
}

.export-section {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
}

.export-section__label {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
}

/* Radio group */
.export-radio-group {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-2);
}

.export-radio-item {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
  cursor: pointer;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
  user-select: none;
}

.export-radio-item--disabled {
  color: var(--mp-text-disabled);
  cursor: default;
}

/* Column search */
.export-col-search {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral);
  color: var(--mp-text-secondary);
}

.export-col-search__input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default);
  line-height: var(--mp-line-heights-md);
  outline: none;
}

.export-col-search__input::placeholder { color: var(--mp-text-placeholder); }

.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }

/* All columns row */
.export-col-all {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
  margin-top: var(--mp-spacing-4);
}

/* Column checkbox list */
.export-col-list {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--mp-spacing-2) var(--mp-spacing-4);
}

.export-col-item {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
  cursor: pointer;
  user-select: none;
}

.export-col-label {
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
}

/* Modal footer button row */
.modal-footer-btns {
  display: flex;
  justify-content: flex-end;
  gap: var(--mp-spacing-2);
  width: 100%;
}

/* Kebab button — always visible */
.row-kebab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-8, 32px);
  height: var(--mp-sizes-8, 32px);
  border: none;
  background: none;
  border-radius: var(--mp-radii-md);
  cursor: pointer;
  color: var(--mp-text-secondary);
}

.row-kebab:hover {
  background: var(--mp-background-neutral-hovered);
}
</style>
