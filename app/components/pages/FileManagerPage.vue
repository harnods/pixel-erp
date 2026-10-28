<script setup lang="ts">
/**
 * File manager (Other lists) — every file attached to a transaction, in one
 * list. Built on the shared ErpTablePage + useTableState index pattern, with
 * ErpFilterSelect for the Page filter (rule/select-erpfilterselect). Files can
 * also be dropped anywhere on the page — GlobalFileDropOverlay catches the
 * drag at the window and those files upload straight away, unattached.
 */
import type { Ref } from 'vue'
import {
  MpIcon, MpButton, MpButtonGroup, MpTooltip,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpFormControl, MpFormLabel, MpAutocomplete,
  toast,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import ScenarioFab from '~/components/patterns/ScenarioFab.vue'
import AddFileDrawer, { type AddFileResult } from '~/components/patterns/AddFileDrawer.vue'
import GlobalFileDropOverlay from '~/components/patterns/GlobalFileDropOverlay.vue'
import {
  managedFiles, addManagedFile, removeManagedFile, persistManagedFiles, filePages, fileIconName,
  setPendingAttachments,
  type ManagedFile,
} from '~/data'

const { t } = useLocale()
const toggleAirene = inject<() => void>('toggleAirene')

const columns: TableColumn[] = [
  { key: 'uploadedAt',    label: t('Upload date'),   kind: 'datetime',            sortable: true, sortType: 'date' },
  { key: 'transactionNo', label: t('Number'),        kind: 'number',              sortType: 'text' },
  { key: 'page',          label: t('Page'),                                       sortType: 'text' },
  { key: 'fileName',      label: t('Filename'),                                   sortable: true, sortType: 'text' },
  { key: 'contact',   label: t('Contact'),       kind: 'name',                sortType: 'text' },
]

type Row = ManagedFile

const previewMode = ref<'data' | 'empty'>('data')
const dataVersion = ref(0)

const rows = computed<Row[]>(() => {
  void dataVersion.value
  return previewMode.value === 'empty' ? [] : [...managedFiles]
})

const pageFilter = ref('')
const PAGE_OPTIONS = computed(() => filePages().map(p => ({ value: p, label: t(p) })))

const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState(rows, {
  filterFn: (row: Row, s) =>
    (!s
      || row.fileName.toLowerCase().includes(s)
      || row.transactionNo.toLowerCase().includes(s)
      || row.contact.toLowerCase().includes(s))
    && (!pageFilter.value || row.page === pageFilter.value),
})

// useTableState only watches its own statusFilter — the Page dropdown has to
// reset the page itself or a filtered result can land on an empty page.
watch(pageFilter, () => setPage(1))

const pad2 = (n: number) => String(n).padStart(2, '0')

function formatUploadedAt(iso: string) {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
  const time = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  return `${date}, ${time}`
}

const allCols: TableColumn[] = [...columns]
const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(allCols.map(c => [c.key, true])))
const columnItems = allCols.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => allCols.filter(c => columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }

const emptyIllustration = '/illustrations/empty-folder.png'
function clearFilters() { search.value = ''; statusFilter.value = ''; pageFilter.value = '' }

// ─── Add file ───────────────────────────────────────────────────────────────
// Opened from the page title bar, which lives in pages/[...slug].vue and
// signals through an injected counter (same pattern as contactAddSignal).
const addOpen = ref(false)
const addSignal = inject<Ref<number>>('fileManagerAddSignal', ref(0))
watch(addSignal, () => { addOpen.value = true })


/**
 * The one upload path — used by the Add file drawer and by dropping files
 * onto the page. A drop lands unfiled (no transaction, no page) and the row
 * menu is where it gets attached; the drawer can file it on the way in.
 */
function uploadFiles(
  names: string[],
  filed: { page: string; transactionNo: string; contact: string }
    = { page: '', transactionNo: '', contact: '' },
) {
  if (!names.length) return
  // Local wall-clock, not UTC: the column renders the stamp with id-ID
  // formatting, so toISOString() would show an upload made at 13.28 as 06.28.
  const now = new Date()
  const uploadedAt = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}T${pad2(now.getHours())}:${pad2(now.getMinutes())}`
  for (const name of names) {
    addManagedFile({
      uploadedAt,
      uploadedBy: 'Rizal Candra',
      transactionNo: filed.transactionNo,
      page: filed.page,
      fileName: name,
      contact: filed.contact,
    })
  }
  const n = names.length
  dataVersion.value++
  toast.notify({ variant: 'success', title: `${n} ${n === 1 ? t('file') : t('files')} ${t('uploaded')}` })
}

/**
 * Continue from the Add file drawer. Attaching files them against a
 * transaction that already exists; creating leaves them unfiled and hands
 * them to that page's create form, which opens with them already attached.
 */
function onAddFileSubmit(r: AddFileResult) {
  // Creating files nothing yet: the transaction does not exist, and a row with
  // no transaction number shows no page either (the rule the row menu keys off).
  const filed = r.mode === 'attach'
    ? { page: r.page, transactionNo: r.transactionNo, contact: r.contact }
    : { page: '', transactionNo: '', contact: '' }
  uploadFiles(r.files.map(f => f.name), filed)
  addOpen.value = false
  if (r.mode === 'create' && r.newRoute) {
    setPendingAttachments(r.files)
    navigateTo(r.newRoute)
  }
}

// Dropped straight onto the page: no modal, no staging — the files are in the
// list by the time the overlay fades.
function onGlobalFileDrop(fileList: FileList) {
  uploadFiles(Array.from(fileList).map(f => f.name))
}

// ─── Attach / change page ───────────────────────────────────────────────────
// Choosing the transaction a file belongs to. Same drawer either way; the row
// menu decides whether it reads as attaching or as moving.
const attachOpen = ref(false)
const attachTarget = ref<Row | null>(null)
const attachPage = ref('')
function askAttach(row: Row) {
  attachTarget.value = row
  attachPage.value = row.page
  attachOpen.value = true
}
function confirmAttach() {
  const row = attachTarget.value
  if (row && attachPage.value) {
    row.page = attachPage.value
    persistManagedFiles()
    dataVersion.value++
    toast.notify({ variant: 'success', title: t('File attached') })
  }
  attachOpen.value = false
  attachTarget.value = null
}

// ─── Bulk actions ───────────────────────────────────────────────────────────
// The same four things the row menu offers, applied to every selected row.
// Attach / Create reuse AddFileDrawer in its existing-files mode, so the
// Application section behaves identically however it is reached.
const bulkDrawerOpen = ref(false)
const bulkDrawerMode = ref<'attach' | 'create'>('attach')
const bulkRows = ref<Row[]>([])
// Size isn't recorded on a ManagedFile, so it stays 0 and the row shows no
// subtitle rather than a wrong "0 KB".
const bulkFiles = computed(() => bulkRows.value.map(r => ({ name: r.fileName, sizeKB: 0 })))
let bulkDeselect: (() => void) | null = null

function selectedRowsOf(sel: Set<number>): Row[] {
  return [...sel].map(i => paginated.value[i] as Row | undefined).filter(Boolean) as Row[]
}

function openBulkDrawer(mode: 'attach' | 'create', sel: Set<number>, deselectAll: () => void) {
  bulkRows.value = selectedRowsOf(sel)
  if (!bulkRows.value.length) return
  bulkDrawerMode.value = mode
  bulkDeselect = deselectAll
  bulkDrawerOpen.value = true
}

function onBulkApply(r: AddFileResult) {
  if (r.mode === 'attach') {
    for (const row of bulkRows.value) {
      row.page = r.page
      row.transactionNo = r.transactionNo
      row.contact = r.contact
    }
    persistManagedFiles()
    dataVersion.value++
    const n = bulkRows.value.length
    toast.notify({ variant: 'success', title: `${n} ${n === 1 ? t('file') : t('files')} ${t('attached')}` })
  } else if (r.newRoute) {
    // The files already exist; they only need to ride to the new form.
    setPendingAttachments(bulkRows.value.map(row => ({ name: row.fileName, sizeKB: 0 })))
  }
  bulkDrawerOpen.value = false
  bulkDeselect?.()
  bulkDeselect = null
  if (r.mode === 'create' && r.newRoute) navigateTo(r.newRoute)
}

// Demo files carry no bytes — same honest fallback the CRM deal files use.
function bulkDownload(sel: Set<number>, deselectAll: () => void) {
  const n = selectedRowsOf(sel).length
  if (!n) return
  toast.notify({ variant: 'info', title: t('This demo file has no downloadable content.') })
  deselectAll()
}

const bulkDeleteOpen = ref(false)
const bulkDeleteRows = ref<Row[]>([])
let bulkDeleteDeselect: (() => void) | null = null
function askBulkDelete(sel: Set<number>, deselectAll: () => void) {
  bulkDeleteRows.value = selectedRowsOf(sel)
  if (!bulkDeleteRows.value.length) return
  bulkDeleteDeselect = deselectAll
  bulkDeleteOpen.value = true
}
function confirmBulkDelete() {
  let n = 0
  for (const row of bulkDeleteRows.value) if (removeManagedFile(row.id)) n++
  if (n) dataVersion.value++
  bulkDeleteRows.value = []
  bulkDeleteDeselect?.()
  bulkDeleteDeselect = null
  toast.notify({ variant: 'success', title: `${n} ${n === 1 ? t('file') : t('files')} ${t('deleted')}` })
}

// ─── Delete ─────────────────────────────────────────────────────────────────
const deleteOpen = ref(false)
const deleteTarget = ref<Row | null>(null)
function askDelete(row: Row) { deleteTarget.value = row; deleteOpen.value = true }
function confirmDelete() {
  const row = deleteTarget.value
  if (row && removeManagedFile(row.id)) {
    dataVersion.value++
    toast.notify({ variant: 'success', title: t('File deleted') })
  }
  deleteTarget.value = null
}
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
    has-checkbox
    bulk-label="file"
    :search="search"
    :has-active-filter="!!search || !!pageFilter"
    filter-empty-label="file"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
  >

    <!-- ── Bulk actions ──
         One secondary-sm "Actions" dropdown, the repo default for a bulk bar
         (rule/btn-sm-secondary-only). Same four entries as the row menu.
         Delete is last and danger-styled, behind a ConfirmModal that names the
         count (rule/bulk-actions-delete-confirmed). -->
    <template #bulk-actions="{ selectedRows, deselectAll }">
      <MpPopover id="fm-bulk-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
        <MpPopoverTrigger>
          <MpButton size="sm" variant="secondary" right-icon="chevrons-down" is-rounded>{{ t('Actions') }}</MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent class="erp-dropdown-menu">
          <MpPopoverList>
            <MpPopoverListItem @click="bulkDownload(selectedRows as Set<number>, deselectAll)">
              {{ t('Download') }}
            </MpPopoverListItem>
            <MpPopoverListItem @click="openBulkDrawer('attach', selectedRows as Set<number>, deselectAll)">
              {{ t('Attach to an existing transaction') }}
            </MpPopoverListItem>
            <MpPopoverListItem @click="openBulkDrawer('create', selectedRows as Set<number>, deselectAll)">
              {{ t('Create a new transaction') }}
            </MpPopoverListItem>
            <MpPopoverListItem class="row-menu-item--danger" @click="askBulkDelete(selectedRows as Set<number>, deselectAll)">
              {{ t('Delete') }}
            </MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Filter bar: Feature | tools + search ── -->
    <template #filters>
      <div class="filter-left">
        <ErpFilterSelect
          id="fm-page-filter"
          v-model="pageFilter"
          :placeholder="t('Page')"
          :options="PAGE_OPTIONS"
          width="200px"
          data-devchange="file-manager-index"
        />
      </div>

      <div class="filter-right">
        <MpButtonGroup class="filter-btn-group">
          <MpTooltip :label="t('Ask Airene')" placement="bottom">
            <MpButton class="filter-airene-btn" variant="ghost" left-icon="airene-brand" :aria-label="t('Ask Airene')" is-rounded @click="toggleAirene?.()" />
          </MpTooltip>
          <ColumnSettingsMenu id="fm-columns" :items="columnItems" :visibility="columnVisibility" />
        </MpButtonGroup>

        <div class="filter-search">
          <MpIcon name="search" size="sm" />
          <input
            v-model="search"
            class="filter-search-input"
            type="text"
            :placeholder="t('Search...')"
          />
          <MpButton v-if="search" variant="secondary" class="search-clear-btn" type="button" left-icon="close" :aria-label="t('Clear search')" @click="search = ''" />
        </div>
      </div>
    </template>

    <!-- ── Cell: Upload date — date and time over the uploader ── -->
    <template #cell-uploadedAt="{ row, value }">
      <span class="fm-stack">
        <span class="fm-stack-main">{{ formatUploadedAt(value as string) }}</span>
        <span class="fm-stack-sub">{{ t('by') }} {{ (row as Row).uploadedBy }}</span>
      </span>
    </template>

    <!-- ── Cell: Number ── -->
    <template #cell-transactionNo="{ value }">
      <a v-if="value" class="cell-link cell-text" @click.stop>{{ value }}</a>
      <span v-else>—</span>
    </template>

    <!-- ── Cell: Page — blank until the file is attached to a transaction ── -->
    <template #cell-page="{ value }">
      <template v-if="value">{{ t(value as string) }}</template>
      <span v-else>—</span>
    </template>

    <!-- ── Cell: File — type icon beside the name ── -->
    <template #cell-fileName="{ value }">
      <span class="fm-file">
        <MpIcon :name="fileIconName(value as string)" size="md" class="fm-file-icon" />
        <span class="cell-text">{{ value }}</span>
      </span>
    </template>

    <!-- ── Cell: Contact ── -->
    <template #cell-contact="{ value }">
      <a v-if="value" class="cell-link cell-text" @click.stop>{{ value }}</a>
      <span v-else>—</span>
    </template>

    <!-- ── Row actions ── -->
    <template #actions="{ row }">
      <MpPopover :id="`fm-row-${(row as Row).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
        </MpPopoverTrigger>
        <MpPopoverContent class="erp-dropdown-menu">
          <MpPopoverList>
            <MpPopoverListItem>{{ t('Download') }}</MpPopoverListItem>
            <!-- A file with no page yet can be attached or can start a new
                 transaction; once it has one, it can only be moved. -->
            <template v-if="!(row as Row).page">
              <MpPopoverListItem @click="askAttach(row as Row)">{{ t('Attach to an existing transaction') }}</MpPopoverListItem>
              <MpPopoverListItem @click="askAttach(row as Row)">{{ t('Create a new transaction') }}</MpPopoverListItem>
            </template>
            <MpPopoverListItem v-else @click="askAttach(row as Row)">{{ t('Change page') }}</MpPopoverListItem>
            <MpPopoverListItem class="row-menu-item--danger" @click="askDelete(row as Row)">{{ t('Delete') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Full empty state ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('No files yet') }}</p>
        <p class="empty-full-desc">{{ t('Files attached to your transactions will appear here.') }}</p>
      </div>
    </template>
  </ErpTablePage>

  <!-- ── Delete confirm ── -->
  <ConfirmModal
    v-model:is-open="deleteOpen"
    :title="t('Delete file?')"
    :description="deleteTarget ? `${deleteTarget.fileName} ${t('will be permanently deleted. This cannot be undone.')}` : ''"
    :confirm-label="t('Delete')"
    @confirm="confirmDelete"
  />

  <!-- ── Attach to a transaction / change page ── -->
  <MpModal
    id="fm-attach-modal"
    :is-close-on-esc="false"
    :is-close-on-overlay-click="false"
    :is-open="attachOpen"
    size="md"
    :is-keep-alive="false"
    @close="attachOpen = false"
  >
    <MpModalContent>
      <MpModalHeader>
        {{ attachTarget?.page ? t('Change page') : t('Attach to an existing transaction') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <p class="fm-attach-hint">{{ attachTarget?.fileName }}</p>
        <MpFormControl id="fm-attach-page">
          <MpFormLabel>{{ t('Page') }}</MpFormLabel>
          <MpAutocomplete
            id="fm-attach-page-ac"
            v-model="attachPage"
            :data="PAGE_OPTIONS"
            label-prop="label" value-prop="value"
            is-searchable is-clearable is-full-width
            :placeholder="t('Select page')"
          />
        </MpFormControl>
      </MpModalBody>
      <MpModalFooter>
        <div class="fm-footer-btns">
          <MpButton class="btn-enterprise btn-enterprise--ghost" @click="attachOpen = false">{{ t('Cancel') }}</MpButton>
          <MpButton class="btn-enterprise btn-enterprise--primary" @click="confirmAttach">{{ t('Save') }}</MpButton>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <!-- ── Bulk: file the selected rows (same drawer, existing-files mode) ── -->
  <AddFileDrawer
    :is-open="bulkDrawerOpen"
    :existing-files="bulkFiles"
    :initial-mode="bulkDrawerMode"
    @close="bulkDrawerOpen = false"
    @submit="onBulkApply"
  />

  <ConfirmModal
    v-model:is-open="bulkDeleteOpen"
    :title="t('Delete files?')"
    :description="`${bulkDeleteRows.length} ${bulkDeleteRows.length === 1 ? t('file') : t('files')} ${t('will be permanently deleted. This cannot be undone.')}`"
    :confirm-label="t('Delete')"
    @confirm="confirmBulkDelete"
  />

  <!-- ── Add file (drawer, Figma 4243:42724) ── -->
  <AddFileDrawer
    data-devchange="file-manager-add-drawer"
    :is-open="addOpen"
    @close="addOpen = false"
    @submit="onAddFileSubmit"
  />

  <!-- Drop files anywhere on the page to upload them (window-level listener). -->
  <GlobalFileDropOverlay data-devchange="file-manager-drop" @drop="onGlobalFileDrop" />

  <ScenarioFab v-model="previewMode" />
</template>

<style scoped>
.cell-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

/* Upload date stacks the timestamp over the uploader, as the design shows. */
.fm-stack { display: flex; flex-direction: column; min-width: 0; }
.fm-stack-main { color: var(--mp-text-default); }
.fm-stack-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.fm-file { display: flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; }
.fm-file-icon { flex-shrink: 0; }

.row-menu-item--danger { color: var(--mp-text-critical, var(--mp-text-danger)); }

.empty-full { display: flex; flex-direction: column; align-items: center; text-align: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-9) var(--mp-spacing-4); }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { font-size: var(--mp-font-sizes-lg, 1rem); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); margin-bottom: var(--mp-spacing-2); }

/* ── Filter bar ── */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-btn-group { display: flex; align-items: center; }
.filter-btn-group :deep(.mp-pixel-button-group) { gap: var(--mp-spacing-2); }
.filter-airene-btn :deep(svg) { color: var(--mp-airene-default, #6938ef); }

.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2); width: 248px;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px);
  color: var(--mp-text-subtle);
}
.filter-search-input {
  flex: 1; border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default); min-width: 0;
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

/* ── Add file modal ── */
.fm-attach-hint { margin: 0 0 var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.fm-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }
</style>
