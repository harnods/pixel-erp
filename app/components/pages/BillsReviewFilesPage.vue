<script setup lang="ts">
import {
  MpIcon, MpButton, MpSelect, MpSkeleton, MpSpinner, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, css, toast,
  MpModal, MpModalContent, MpModalHeader, MpModalCloseButton, MpModalBody, MpModalFooter,
} from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import ErpDropzone from '~/components/patterns/ErpDropzone.vue'
import { lastUpdatedFor } from '~/utils/lastUpdated'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import {
  reviewFiles, purchaseInvoiceReviewFiles, bankStatementDropboxFiles, deleteReviewFiles,
  moveReviewFilesToPurchaseInvoice, moveReviewFilesToExpenses,
} from '~/data'
import { startUpload, uploadCenterOpen } from '~/data/uploadCenter'
import type { ReviewFile, FileClassification } from '~/data'

/** Which surface's review queue this table is showing. Expenses, Purchase
 *  invoices and Cash management (bank statements) each have a "Dropbox" tab over
 *  the same table; only the underlying queue and the review route differ. */
const props = withDefaults(defineProps<{ surface?: 'expenses' | 'purchase-invoices' | 'bank-statement' }>(), {
  surface: 'expenses',
})

const { t } = useLocale()
const router = useRouter()
const toggleAirene = inject<() => void>('toggleAirene')

const queue = computed(() =>
  props.surface === 'purchase-invoices' ? purchaseInvoiceReviewFiles
  : props.surface === 'bank-statement' ? bankStatementDropboxFiles
  : reviewFiles)
const reviewBase = computed(() =>
  props.surface === 'purchase-invoices' ? '/purchase-invoices/review'
  : props.surface === 'bank-statement' ? '/cash-management/review'
  : '/expenses/review')

// The full-width dropzone above the filter bar is the single drop target for this
// tab (replaces the old drag-anywhere overlay). It behaves EXACTLY like the
// "Upload bills"/"Upload vendor invoices" modal: files go through the header upload
// monitor (startUpload) and land as file-name-only rows — OCR is NOT run yet, so
// the other columns stay empty until the file is scanned.
function onDropzoneFiles(fileList: FileList) {
  const files = Array.from(fileList)
  if (!files.length) return
  startUpload(files, props.surface, props.surface === 'purchase-invoices' ? 'Upload vendor invoices' : props.surface === 'bank-statement' ? 'Upload bank statement' : 'Upload bills')
  uploadCenterOpen.value = true
}

// ─── Column definitions ───────────────────────────────────────────────────────
const columns: TableColumn[] = [
  { key: 'file',            label: 'File',           kind: 'name', sortable: true,                 sortType: 'text'   },
  { key: 'number',          label: 'Number',         kind: 'number', sortable: true,                 sortType: 'text'   },
  { key: 'beneficiaryName', label: 'Vendor',          kind: 'name', sortable: true,                 sortType: 'text'   },
  { key: 'confidence',      label: 'Confidence',     sortable: true,                 sortType: 'number' },
  { key: 'classification',  label: 'Classification', kind: 'status',                                 sortType: 'text'   },
  { key: 'date',            label: 'Date',           kind: 'date',                                   sortType: 'date'   },
  { key: 'amount',          label: 'Amount',         kind: 'amount', align: 'right', sortable: true,  sortType: 'number' },
]

// ─── Row type ─────────────────────────────────────────────────────────────────

type Row = ReviewFile & {
  beneficiaryName: string
  fileIcon: string
}

// File icon by extension — mirrors Pixel's per-filetype document icons.
function iconForFile(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'pdf-document'
  if (ext === 'xlsx' || ext === 'csv') return 'excel-document'
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') return 'image-document'
  return 'attachment'
}

// ─── Flatten + enrich ─────────────────────────────────────────────────────────

const rows = computed<Row[]>(() =>
  queue.value.map(rf => ({
    ...rf,
    beneficiaryName: rf.beneficiary.name,
    fileIcon: iconForFile(rf.file),
  }))
)

// ─── Table state ──────────────────────────────────────────────────────────────
// Classification drives the status-filter dropdown per spec.

const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState(rows, {
  filterFn: (row: Row, s, status) =>
    (row.file.toLowerCase().includes(s) || row.beneficiaryName.toLowerCase().includes(s)) &&
    (!status || row.classification === status),
})

// ─── Filter options ───────────────────────────────────────────────────────────

// OCR can classify an uploaded file as any of the four types no matter which
// surface it landed on (see reviewFiles.ts), so both tabs filter across all
// four rather than just the surface's "native" classification.
const classificationOptions: { label: string; value: FileClassification | '' }[] = [
  { label: t('Expenses'),        value: 'bill'         },
  { label: t('Invoice'),         value: 'invoice'      },
  { label: t('Payment receipt'), value: 'receipt'      },
  { label: t('Other documents'), value: 'unclassified' },
]

const classificationLabel = computed(
  () => classificationOptions.find(o => o.value === statusFilter.value)?.label ?? '',
)

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(iso))
}

function formatNumber(n: string | undefined) {
  return n ?? '—'
}

function confidenceLabel(score: number): 'High' | 'Medium' | 'Low' {
  if (score >= 85) return 'High'
  if (score >= 60) return 'Medium'
  return 'Low'
}

// Last updated = the real upload time + uploader for freshly-uploaded files;
// seed rows have no audit fields, so fall back to the deterministic mock.
function lastUpdatedInfo(row: Row): { at: string; by: string } {
  return row.uploadedAt ? { at: row.uploadedAt, by: row.uploadedBy || '—' } : lastUpdatedFor(row.id)
}

// Column show/hide (first column always on; Last updated shown by default)
const allCols: TableColumn[] = [...columns, { key: 'lastUpdated', label: 'Last updated', kind: 'date' }]
// Last updated (upload date/time + uploader) is shown by default on the Dropbox tab.
const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(allCols.map(c => [c.key, true])))
const columnItems = allCols.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => allCols.filter(c => columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }

// ─── Bulk actions (selection bar) — mirrors BillsIndexPage's bulk pattern ──────

function bulkSelectedReviewFiles(selectedRows: Set<number>): Row[] {
  return [...selectedRows].map(i => paginated.value[i] as Row).filter(Boolean)
}
// Each surface's own classification — 'bill' reviews as an Expense here,
// 'invoice' as a Purchase invoice there. A file OCR reads as anything else
// doesn't belong to this surface and needs to be moved out via bulk action.
const nativeClassification = computed<FileClassification>(() => (props.surface === 'purchase-invoices' ? 'invoice' : 'bill'))

/** All selected rows share one classification, and it isn't this surface's
 *  native one (i.e. all Receipt, all Invoice/Expenses, or all Unclassified)
 *  — these can be reviewed or moved elsewhere. Mixed selections, and
 *  all-native selections, fall back to Review + Delete only. */
function allSelectedSameNonNativeClassification(selectedRows: Set<number>): boolean {
  const selected = bulkSelectedReviewFiles(selectedRows)
  if (!selected.length) return false
  const first = selected[0]!.classification
  return first !== nativeClassification.value && selected.every(rf => rf.classification === first)
}

// Review — opens the file-review page on the first selected file; the page's own
// "Save & next" / "Skip without saving" walk the rest of the queue from there.
function openReviewFiles(files: ReviewFile[]) {
  const first = files[0]
  if (first) router.push(`${reviewBase.value}/${first.id}`)
}
function reviewSelected(selectedRows: Set<number>) {
  openReviewFiles(bulkSelectedReviewFiles(selectedRows))
}
// Row click (File cell) — same review stub as the bulk "Review" action, single file.
function openRowReview(row: Row) {
  if (row.processing) return
  openReviewFiles([row])
}

// Move to the other surface's queue — handles the case where an uploaded
// file turns out to belong to Purchase invoices while sitting in Expenses'
// queue, or vice versa. Each tab only ever moves out towards the other one.
const moveActionLabel = computed(() => (props.surface === 'purchase-invoices' ? 'Move files to Expenses' : 'Move files to Purchase invoice'))
const movedToastLabel = computed(() => (props.surface === 'purchase-invoices' ? 'moved to Expenses' : 'moved to Purchase invoice'))

function moveSelectedToOtherSurface(selectedRows: Set<number>, deselectAll: () => void) {
  const ids = bulkSelectedReviewFiles(selectedRows).map(rf => rf.id)
  const count = props.surface === 'purchase-invoices'
    ? moveReviewFilesToExpenses(ids)
    : moveReviewFilesToPurchaseInvoice(ids)
  toast.notify({
    variant: 'success',
    title: `${count} ${t(count !== 1 ? 'files' : 'file')} ${t(movedToastLabel.value)}`,
    rootProps: { class: 'toast-enterprise' },
  })
  deselectAll()
}

// Row kebab — same "not this surface's native classification" rule as the bulk
// action above, just for a single row instead of a selection.
function moveRowToOtherSurface(row: Row) {
  const count = props.surface === 'purchase-invoices'
    ? moveReviewFilesToExpenses([row.id])
    : moveReviewFilesToPurchaseInvoice([row.id])
  toast.notify({
    variant: 'success',
    title: `${count} ${t(count !== 1 ? 'files' : 'file')} ${t(movedToastLabel.value)}`,
    rootProps: { class: 'toast-enterprise' },
  })
}

// Delete
const bulkDeleteModalOpen = ref(false)
const bulkDeleteIds = ref<string[]>([])
const bulkDeleteCount = computed(() => bulkDeleteIds.value.length)
let bulkDeleteDeselect: (() => void) | null = null

function openBulkDeleteModal(selectedRows: Set<number>, deselectAll: () => void) {
  bulkDeleteIds.value = bulkSelectedReviewFiles(selectedRows).map(rf => rf.id)
  bulkDeleteDeselect = deselectAll
  bulkDeleteModalOpen.value = true
}
function closeBulkDeleteModal() { bulkDeleteModalOpen.value = false }
function confirmBulkDelete() {
  const count = deleteReviewFiles(bulkDeleteIds.value, props.surface)
  toast.notify({
    variant: 'success',
    title: `${count} ${t(count !== 1 ? 'files' : 'file')} ${t('deleted')}`,
    rootProps: { class: 'toast-enterprise' },
  })
  bulkDeleteDeselect?.()
  closeBulkDeleteModal()
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
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
  >

    <!-- ── Full-width drop target (above the filter bar) ── -->
    <template #stats>
      <ErpDropzone
        :id="`${surface}-inbox-dropzone`"
        class="inbox-dropzone"
        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.zip"
        hide-list
        @change="onDropzoneFiles"
      />
    </template>

    <!-- ── Bulk actions ── -->
    <template #bulk-actions="{ selectedRows, deselectAll }">
      <template v-if="allSelectedSameNonNativeClassification(selectedRows as Set<number>)">
        <MpPopover id="review-files-bulk-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
          <MpPopoverTrigger>
            <MpButton class="btn-enterprise btn-enterprise--primary btn-enterprise--sm btn-enterprise--icon-after" variant="primary" size="sm" right-icon="chevrons-down">
              {{ t('Actions') }}
            </MpButton>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
            <MpPopoverList>
              <MpPopoverListItem @click="reviewSelected(selectedRows as Set<number>)">{{ t('Review') }}</MpPopoverListItem>
              <MpPopoverListItem @click="moveSelectedToOtherSurface(selectedRows as Set<number>, deselectAll)">{{ t(moveActionLabel) }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </template>
      <MpButton
        v-else
        class="btn-enterprise btn-enterprise--primary btn-enterprise--sm"
        variant="primary" size="sm"
        @click="reviewSelected(selectedRows as Set<number>)"
      >
        {{ t('Review') }}
      </MpButton>
      <MpButton
        class="btn-enterprise btn-enterprise--ghost btn-enterprise--sm"
        variant="ghost" size="sm"
        @click="openBulkDeleteModal(selectedRows as Set<number>, deselectAll)"
      >
        {{ t('Delete') }}
      </MpButton>
    </template>

    <!-- ── Filter bar ── -->
    <template #filters>
      <!-- Left: classification select (MpSelect + MpPopover) + All filters -->
      <div class="filter-left">
        <MpPopover id="rf-classification-filter" is-close-on-select>
          <!-- placeholder = filter name ("Classification"); is-clearable shows (x) when a
               value is picked → @clear resets to show-all. -->
          <MpPopoverTrigger>
            <MpSelect
              id="rf-classification-select"
              :placeholder="t('Classification')"
              :model-value="statusFilter"
              is-clearable
              :class="css({ width: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })"
              @mousedown.prevent
              @clear="statusFilter = ''"
            >
              <option v-if="statusFilter" :value="statusFilter">{{ classificationLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <!-- min-width = MpSelect width (160px) so the dropdown matches the select;
               width:max-content lets it hug/grow when an option is longer. -->
          <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', maxWidth: '320px' })">
            <MpPopoverList>
              <MpPopoverListItem
                v-for="opt in classificationOptions"
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

      <!-- Right: icon buttons + search -->
      <div class="filter-right">
        <div class="filter-btn-group">
          <!-- Airene -->
          <MpButton class="filter-icon-btn filter-icon-btn--airene" variant="ghost" :aria-label="t('Ask Airene')" @click="toggleAirene?.()">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
              <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
            </svg>
          </MpButton>
          <!-- Column settings -->
          <ColumnSettingsMenu id="tt-columns-review" :items="columnItems" :visibility="columnVisibility" />
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
            :placeholder="t('Search...')"
          />
        </div>
      </div>
    </template>

    <!-- ── Cell: File (text link → review; erp.css .cell-link, same pattern as
         BillsIndexPage's Number/Beneficiary columns) ── -->
    <template #cell-file="{ row, value }">
      <div class="file-cell">
        <MpIcon :name="(row as Row).fileIcon" size="sm" class="file-cell__icon" />
        <a
          class="cell-text"
          :class="(row as Row).processing ? 'file-cell__name--processing' : 'cell-link'"
          @click.stop="openRowReview(row as Row)"
        >{{ value }}</a>
        <!-- AI OCR in progress — spinner + label next to the filename. -->
        <span v-if="(row as Row).scanning" class="file-cell__scanning">
          <MpSpinner class="file-cell__spinner" />
          {{ t('Scanning…') }}
        </span>
      </div>
    </template>

    <!-- ── Cell: Number ── -->
    <template #cell-number="{ row, value }">
      <MpSkeleton v-if="(row as Row).processing" class="review-skeleton" height="12px" rounded="md" duration="0s" width="100%" />
      <span v-else-if="(row as Row).scanned === false" class="rf-pending">—</span>
      <template v-else>{{ formatNumber(value as string | undefined) }}</template>
    </template>

    <!-- ── Cell: Vendor ── -->
    <template #cell-beneficiaryName="{ row, value }">
      <MpSkeleton v-if="(row as Row).processing" class="review-skeleton" height="12px" rounded="md" duration="0s" width="100%" />
      <span v-else-if="(row as Row).scanned === false" class="rf-pending">—</span>
      <span v-else class="cell-text">{{ value }}</span>
    </template>

    <!-- ── Cell: Confidence ── -->
    <template #cell-confidence="{ row, value }">
      <MpSkeleton v-if="(row as Row).processing" class="review-skeleton" height="12px" rounded="md" duration="0s" width="100%" />
      <span v-else-if="(row as Row).scanned === false" class="rf-pending">—</span>
      <template v-else>{{ t(confidenceLabel(value as number)) }}</template>
    </template>

    <!-- ── Cell: Classification ── -->
    <template #cell-classification="{ row, value }">
      <MpSkeleton v-if="(row as Row).processing" class="review-skeleton" height="12px" rounded="md" duration="0s" width="100%" />
      <span v-else-if="(row as Row).scanned === false" class="rf-pending">—</span>
      <ErpStatusBadge v-else :status="value as string" />
    </template>

    <!-- ── Cell: Date ── -->
    <template #cell-date="{ row, value }">
      <MpSkeleton v-if="(row as Row).processing" class="review-skeleton" height="12px" rounded="md" duration="0s" width="100%" />
      <span v-else-if="(row as Row).scanned === false" class="rf-pending">—</span>
      <template v-else>{{ formatDate(value as string) }}</template>
    </template>

    <!-- ── Cell: Amount ── -->
    <template #cell-amount="{ row, value }">
      <MpSkeleton v-if="(row as Row).processing" class="review-skeleton" height="12px" rounded="md" duration="0s" width="100%" />
      <span v-else-if="(row as Row).scanned === false" class="rf-pending">—</span>
      <template v-else>{{ formatIDR(value as number) }}</template>
    </template>

    <!-- ── Actions ── -->
    <template #actions="{ row }">
      <MpPopover
        v-if="!(row as Row).processing"
        :id="`review-files-row-actions-${(row as Row).id}`"
        is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end"
      >
        <MpPopoverTrigger>
          <MpButton class="row-kebab btn-enterprise" variant="ghost" :aria-label="t('More actions')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="openRowReview(row as Row)">{{ t('Review') }}</MpPopoverListItem>
            <MpPopoverListItem
              v-if="(row as Row).classification !== nativeClassification"
              @click="moveRowToOtherSurface(row as Row)"
            >
              {{ t(moveActionLabel) }}
            </MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <template #cell-lastUpdated="{ row }">
      <LastUpdatedCell v-bind="lastUpdatedInfo(row as Row)" />
    </template>
  </ErpTablePage>

  <!-- ── Bulk delete confirmation modal (same pattern as BillsIndexPage) ── -->
  <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false"
    id="review-files-bulk-delete-modal"
    :is-open="bulkDeleteModalOpen"
    size="md"
    :is-keep-alive="false"
    @close="closeBulkDeleteModal"
  >
    <MpModalContent>
      <MpModalHeader>
        {{ t('Delete') }} {{ bulkDeleteCount }} {{ t(bulkDeleteCount !== 1 ? 'files' : 'file') }}?
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        {{ t('Deleted files cannot be restored.') }}
      </MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <MpButton class="btn-enterprise btn-enterprise--ghost" variant="ghost" @click="closeBulkDeleteModal">{{ t('Cancel') }}</MpButton>
          <MpButton class="btn-enterprise btn-enterprise--danger" variant="danger" @click="confirmBulkDelete">{{ t('Delete') }}</MpButton>
        </div>
      </MpModalFooter>
    </MpModalContent>
  </MpModal>
</template>

<style scoped>
/* Full-width drop target above the filter bar (the tab's only drop zone). */
.inbox-dropzone { width: 100%; }

/* Processing-row skeleton bar — matches Figma's OCR "processing" row state
   (node 4260:65434): solid neutral-subtle bar, no shimmer, full cell width. */
/* Uploaded-but-not-yet-scanned rows show a muted dash in every OCR column. */
.rf-pending { color: var(--mp-text-placeholder, #9aa4ac); }

.review-skeleton {
  display: block !important;
  width: 100%;
  background-image: none !important;
  background-color: var(--mp-background-neutral-subtle, #ebebeb) !important;
  animation: none !important;
}

/* File cell */
.file-cell {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-1\.5);
  min-width: 0;
}

.file-cell__icon {
  flex-shrink: 0;
  color: var(--mp-text-subtle);
}

.cell-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

/* File cell while OCR is still processing — not yet reviewable, so no link affordance */
.file-cell__name--processing {
  color: var(--mp-text-default);
  cursor: default;
}

/* AI OCR-in-progress cue next to the filename. */
.file-cell__scanning {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
  white-space: nowrap;
}
.file-cell__spinner { width: 14px; height: 14px; }
.file-cell__spinner :deep(svg) { width: 14px; height: 14px; }

/* Row action kebab button */
.row-kebab {
  display: flex !important;
  align-items: center;
  justify-content: center;
  padding: var(--mp-spacing-1) !important;
  min-width: 0 !important;
  border: none !important;
  background: transparent !important;
  cursor: pointer;
  border-radius: var(--mp-radii-sm) !important;
  color: var(--mp-text-subtle);
}
.row-kebab:hover {
  background: var(--mp-background-neutral-hovered);
  color: var(--mp-text-default);
}

/* ── Filter bar ─────────────────────────────────────────────────────────── */

.filter-left {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-4);
}

.filter-right {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
}

.filter-all-btn {
  display: inline-flex !important;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3) !important;
  background: var(--mp-background-neutral) !important;
  border: 1px solid var(--mp-border-bold) !important;
  border-radius: var(--mp-radii-full, 999px) !important;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
  cursor: pointer;
  white-space: nowrap;
}
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered) !important; }

.filter-btn-group {
  display: flex;
  align-items: center;
}

.filter-icon-btn {
  display: flex !important;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-9, 36px) !important;
  height: var(--mp-sizes-9, 36px) !important;
  min-width: 0 !important;
  padding: var(--mp-spacing-2) !important;
  border: none !important;
  background: transparent !important;
  border-radius: var(--mp-radii-md) !important;
  cursor: pointer;
  color: var(--mp-text-default);
}
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered) !important; }
.filter-icon-btn--airene { color: var(--mp-airene-default); }

.filter-search { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 248px;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px);
  color: var(--mp-text-subtle);
}

.filter-search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
  min-width: 0;
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }

/* ── Bulk delete modal ─────────────────────────────────────────────────── */
.modal-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }
</style>
