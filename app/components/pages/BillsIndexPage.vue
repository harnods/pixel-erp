<script setup lang="ts">
import { type Ref } from 'vue'
import {
  MpSelect, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, MpIcon, MpButton, MpTooltip, MpRadio, MpCheckbox,
  MpModal, MpModalContent, MpModalHeader, MpModalCloseButton, MpModalBody, MpModalFooter, MpModalOverlay,
  css, toast,
} from '@mekari/pixel3'
import type jsPDF from 'jspdf'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import PdfPreviewModal from '~/components/patterns/PdfPreviewModal.vue'
import { lastUpdatedFor } from '~/utils/lastUpdated'
import { generateBillAttachmentPreviewPdf } from '~/utils/billAttachmentPdf'
import { generateBillsBulkPdf } from '~/utils/billsBulkPdf'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { bills, duplicateBill, deleteBills } from '~/data'
import type { Bill, BillStatus } from '~/data'

const router = useRouter()
function goDetail(id: string) { router.push(`/expenses/${id}`) }
function addPayment(id: string) { router.push(`/expenses/${id}/payment`) }
function duplicate(id: string) {
  duplicateBill(id)
  toast.notify({ variant: 'success', title: 'Expense duplicated' })
}
// "Set as recurring" isn't built yet — kept in the row-kebab markup below (per design)
// but hidden until the feature ships.
const showSetAsRecurring = false

const toggleAirene = inject<() => void>('toggleAirene')
const aireneOpen = inject<Ref<boolean>>('aireneOpen')
const showMekariCardUpsell = ref(true)

// Empty-state illustration — public path (same asset used across other index pages)
const emptyIllustration = '/illustrations/empty-folder.png'

// ─── Attachment preview (reuses the same PdfPreviewModal used for print previews) ──
const attachmentPreviewOpen = ref(false)
const attachmentPreviewDoc = ref<jsPDF | null>(null)
const attachmentPreviewFilename = ref('')
const attachmentPreviewTitle = ref('')
function previewAttachments(bill: Bill) {
  if (!bill.attachments?.length) return
  attachmentPreviewDoc.value = generateBillAttachmentPreviewPdf(bill, bill.attachments)
  attachmentPreviewFilename.value = `Expense #${String(bill.number).padStart(5, '0')} - attachments.pdf`
  attachmentPreviewTitle.value = `Expense #${String(bill.number).padStart(5, '0')} — attachment${bill.attachments.length !== 1 ? 's' : ''}`
  attachmentPreviewOpen.value = true
}

// ─── Export modal (mirrors ProductsPage's export modal pattern) ────────────────
const selectedCount = ref(0)
const exportModalOpen = ref(false)

type ExportScope = 'all' | 'page' | 'selected'
const exportScope = ref<ExportScope>('all')

const exportColumnGroups: { key: string; label: string }[][] = [
  [
    { key: 'date', label: 'Date' },
    { key: 'number', label: 'Number' },
    { key: 'beneficiaryName', label: 'Beneficiary' },
    { key: 'category', label: 'Category' },
    { key: 'dueDate', label: 'Due date' },
  ],
  [
    { key: 'status', label: 'Status' },
    { key: 'balanceDue', label: 'Balance due' },
    { key: 'total', label: 'Total' },
    { key: 'tags', label: 'Tags' },
    { key: 'lastUpdated', label: 'Last updated' },
  ],
]
const exportColumnKeys = exportColumnGroups.flat().map(c => c.key)
const exportColumnChecked = reactive<Record<string, boolean>>(
  Object.fromEntries(exportColumnKeys.map(k => [k, true])),
)
const exportColumnSearch = ref('')

const visibleExportColumnGroups = computed(() =>
  exportColumnGroups.map(group =>
    group.filter(c => c.label.toLowerCase().includes(exportColumnSearch.value.toLowerCase())),
  ),
)
const allExportColumnsChecked = computed(() => exportColumnKeys.every(k => exportColumnChecked[k]))
const someExportColumnsChecked = computed(
  () => exportColumnKeys.some(k => exportColumnChecked[k]) && !allExportColumnsChecked.value,
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
function closeExportModal() { exportModalOpen.value = false }

// ─── Column definitions ───────────────────────────────────────────────────────
const columns: TableColumn[] = [
  { key: 'date',          label: 'Date',          width: '120px',                                 sortType: 'date'   },
  { key: 'number',        label: 'Number',        width: '160px', sortable: true,                 sortType: 'number' },
  { key: 'attachment',    label: '',              width: '52px',  noHeader: true, align: 'center' },
  { key: 'beneficiaryName', label: 'Beneficiary', width: '220px', sortable: true,                 sortType: 'text'   },
  { key: 'category',      label: 'Category',      width: '160px', sortable: true,                 sortType: 'text'   },
  { key: 'dueDate',       label: 'Due date',      width: '108px',                                 sortType: 'date'   },
  { key: 'status',        label: 'Status',        width: '160px',                                 sortType: 'text'   },
  { key: 'balanceDue',    label: 'Balance due',   width: '160px', align: 'right', sortable: true,  sortType: 'number' },
  { key: 'total',         label: 'Total',         width: '160px', align: 'right', sortable: true,  sortType: 'number' },
  { key: 'tags',          label: 'Tags',          width: '160px'                                  },
]

// ─── Row type ─────────────────────────────────────────────────────────────────

type Row = Bill & {
  beneficiaryName: string
  attachment: boolean
  overdueLabel: string | null
  displayStatus: 'open' | 'overdue' | 'paid' | BillStatus
}

// ─── Flatten + enrich ─────────────────────────────────────────────────────────

const rows = computed<Row[]>(() =>
  bills.map(bill => {
    const isOverdue = bill.status === 'unpaid' && new Date(bill.dueDate).getTime() < Date.now()
    const overdueLabel = isOverdue
      ? (() => {
          const days = Math.floor((Date.now() - new Date(bill.dueDate).getTime()) / 86_400_000)
          return days > 0 ? `${days} day${days !== 1 ? 's' : ''}` : null
        })()
      : null

    const displayStatus: Row['displayStatus'] =
      bill.status === 'unpaid' ? (overdueLabel ? 'overdue' : 'open') : bill.status

    return {
      ...bill,
      beneficiaryName: bill.beneficiary.name,
      attachment: (bill.attachments?.length ?? 0) > 0,
      overdueLabel,
      displayStatus,
    }
  })
)

// ─── Table state ──────────────────────────────────────────────────────────────

const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState(rows, {
  filterFn: (row: Row, s, status) =>
    (String(row.number).includes(s) || row.beneficiaryName.toLowerCase().includes(s)) &&
    (!status || row.displayStatus === status),
})

const hasActiveFilter = computed(() => !!search.value || !!statusFilter.value)
function clearFilters() {
  search.value = ''
  statusFilter.value = ''
}

// ─── Filter options ───────────────────────────────────────────────────────────

const statusOptions = [
  { label: 'Open',    value: 'open'    },
  { label: 'Overdue', value: 'overdue' },
  { label: 'Paid',    value: 'paid'    },
]

const statusLabel = computed(
  () => statusOptions.find(o => o.value === statusFilter.value)?.label ?? '',
)

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatIDR(amount: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 2,
  }).format(amount).replace(/^(Rp)\s/, '$1')
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(iso))
}

function formatNumber(n: number) {
  return `Expense #${String(n).padStart(5, '0')}`
}

// ─── Stats ────────────────────────────────────────────────────────────────────

const overdueBills = computed(() => rows.value.filter(r => r.overdueLabel))
const unpaidBills = computed(() => rows.value.filter(r => r.status === 'unpaid'))
const paidBills = computed(() => rows.value.filter(r => r.status === 'paid'))

const overdueTotal = computed(() => overdueBills.value.reduce((sum, r) => sum + r.balanceDue, 0))
const unpaidTotal = computed(() => unpaidBills.value.reduce((sum, r) => sum + r.balanceDue, 0))
const paidTotal = computed(() => paidBills.value.reduce((sum, r) => sum + r.total, 0))

// Column show/hide (first column always on; Last updated appended, hidden by default)
const allCols: TableColumn[] = [...columns, { key: 'lastUpdated', label: 'Last updated', width: '200px' }]
const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(allCols.map(c => [c.key, c.key !== 'lastUpdated'])))
const columnItems = allCols
  .filter(c => c.label && !c.noHeader)
  .map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => allCols.filter(c => columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }

// ─── Bulk actions (selection bar) — mirrors WarehousesPage's bulk pattern ──────

function bulkSelectedBills(selectedRows: Set<number>): Row[] {
  return [...selectedRows].map(i => paginated.value[i] as Row).filter(Boolean)
}
function allSelectedUnpaid(selectedRows: Set<number>): boolean {
  const selected = bulkSelectedBills(selectedRows)
  return selected.length > 0 && selected.every(b => b.status === 'unpaid')
}

// Print PDF — same PdfPreviewModal used for row-level attachment previews, but
// combined into one multi-page doc across every selected bill.
const bulkPdfPreviewOpen = ref(false)
const bulkPdfPreviewDoc = ref<jsPDF | null>(null)
const bulkPdfPreviewFilename = ref('')
const bulkPdfPreviewCount = ref(0)
function printBulkPdf(selectedRows: Set<number>) {
  const selected = bulkSelectedBills(selectedRows)
  if (!selected.length) return
  bulkPdfPreviewDoc.value = generateBillsBulkPdf(selected)
  bulkPdfPreviewFilename.value = `Expenses (${selected.length}).pdf`
  bulkPdfPreviewCount.value = selected.length
  bulkPdfPreviewOpen.value = true
}

// Pay with Mekari Pay — reuses the single-bill "Add payment" flow, seeded from
// the first selected unpaid bill (that page auto-adds any other unpaid bills
// owed to the same payee).
function payWithMekariPay(selectedRows: Set<number>) {
  const selected = bulkSelectedBills(selectedRows)
  if (!selected.length) return
  addPayment(selected[0]!.id)
}

// Delete
const bulkDeleteModalOpen = ref(false)
const bulkDeleteIds = ref<string[]>([])
const bulkDeleteCount = computed(() => bulkDeleteIds.value.length)
let bulkDeleteDeselect: (() => void) | null = null

function openBulkDeleteModal(selectedRows: Set<number>, deselectAll: () => void) {
  bulkDeleteIds.value = bulkSelectedBills(selectedRows).map(b => b.id)
  bulkDeleteDeselect = deselectAll
  bulkDeleteModalOpen.value = true
}
function closeBulkDeleteModal() { bulkDeleteModalOpen.value = false }
function confirmBulkDelete() {
  const count = deleteBills(bulkDeleteIds.value)
  toast.notify({ variant: 'success', title: `${count} expense${count !== 1 ? 's' : ''} deleted` })
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
    actions-width="52px"
    filter-empty-label="expense"
    bulk-label="expense"
    :search="search"
    :has-active-filter="hasActiveFilter"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
    @selection-change="count => selectedCount = count"
  >

    <!-- ── Bulk actions ── -->
    <template #bulk-actions="{ selectedRows, deselectAll }">
      <template v-if="allSelectedUnpaid(selectedRows as Set<number>)">
        <MpPopover id="bills-bulk-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
          <MpPopoverTrigger>
            <button class="btn-enterprise btn-enterprise--primary btn-enterprise--sm btn-enterprise--icon-after">
              Actions
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
            <MpPopoverList>
              <MpPopoverListItem @click="payWithMekariPay(selectedRows as Set<number>)">Pay with Mekari Pay</MpPopoverListItem>
              <MpPopoverListItem @click="printBulkPdf(selectedRows as Set<number>)">Print PDF</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </template>
      <button
        v-else
        class="btn-enterprise btn-enterprise--primary btn-enterprise--sm"
        @click="printBulkPdf(selectedRows as Set<number>)"
      >
        Print PDF
      </button>
      <button
        class="btn-enterprise btn-enterprise--ghost btn-enterprise--sm"
        @click="openBulkDeleteModal(selectedRows as Set<number>, deselectAll)"
      >
        Delete
      </button>
    </template>

    <!-- ── Stats section ── -->
    <template #stats>
      <div class="stats-section">

        <!-- Card 1: Overdue -->
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">Overdue</div>
          <div class="stat-period">As of today</div>
          <div class="stat-amount stat-amount--danger">{{ formatIDR(overdueTotal) }}</div>
          <a class="stat-link">{{ overdueBills.length }} bill{{ overdueBills.length !== 1 ? 's' : '' }}</a>
        </div>

        <!-- Card 2: Unpaid -->
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">Unpaid</div>
          <div class="stat-period">As of today</div>
          <div class="stat-amount">{{ formatIDR(unpaidTotal) }}</div>
          <a class="stat-link">{{ unpaidBills.length }} bill{{ unpaidBills.length !== 1 ? 's' : '' }}</a>
        </div>

        <!-- Card 3: Paid -->
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">Paid</div>
          <div class="stat-period">Last 30 days</div>
          <div class="stat-amount">{{ formatIDR(paidTotal) }}</div>
          <a class="stat-link">{{ paidBills.length }} bill{{ paidBills.length !== 1 ? 's' : '' }}</a>
        </div>

        <!-- Card 4: Upsell — Mekari Card — hidden when Airene panel is open or dismissed -->
        <div v-if="!aireneOpen && showMekariCardUpsell" class="stat-card stat-card--upsell">
          <button
            type="button"
            class="upsell-dismiss"
            aria-label="Dismiss"
            @click="showMekariCardUpsell = false"
          >
            <MpIcon name="close" size="sm" />
          </button>
          <div class="upsell-content">
            <div class="upsell-icon">
              <MpIcon name="billing" size="md" variant="fill" color="icon.success" />
            </div>
            <div class="upsell-copy">
              <p class="upsell-title">Control business spend with Mekari Card</p>
              <p class="upsell-desc">Manage expenses easily with Mekari physical or virtual corporate cards. Say goodbye to manual reimbursement claims.</p>
            </div>
          </div>
          <div class="upsell-actions">
            <button type="button" class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm">
              Start set up
            </button>
          </div>
        </div>

      </div>
    </template>

    <!-- ── Filter bar ── -->
    <template #filters>
      <!-- Left: status select (MpSelect + MpPopover) + All filters -->
      <div class="filter-left">
        <MpPopover id="bills-status-filter" is-close-on-select>
          <!-- placeholder = filter name ("Status"); is-clearable shows (x) when a
               value is picked → @clear resets to show-all. -->
          <MpPopoverTrigger>
            <MpSelect
              id="bills-status-select"
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
          <!-- min-width = MpSelect width (160px) so the dropdown matches the select;
               width:max-content lets it hug/grow when an option is longer. -->
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

        <MpButton class="filter-all-btn">
          <MpIcon name="filter" size="sm" />
          All filters
        </MpButton>
      </div>

      <!-- Right: icon buttons + search -->
      <div class="filter-right">
        <div class="filter-btn-group">
          <!-- Airene -->
          <MpTooltip id="tt-bills-airene" label="Ask Airene" placement="bottom" use-portal>
            <MpButton class="filter-icon-btn filter-icon-btn--airene" aria-label="Ask Airene" @click="toggleAirene?.()">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
              </svg>
            </MpButton>
          </MpTooltip>
          <!-- Column settings -->
          <ColumnSettingsMenu id="tt-columns" :items="columnItems" :visibility="columnVisibility" />
          <!-- Export -->
          <MpTooltip id="bills-tt-export" label="Export" placement="bottom" use-portal>
            <MpButton class="filter-icon-btn" aria-label="Export" @click="openExportModal">
              <MpIcon name="download" size="md" />
            </MpButton>
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
            placeholder="Search..."
          />
        </div>
      </div>
    </template>

    <!-- ── Cell: Date ── -->
    <template #cell-date="{ value }">
      {{ formatDate(value as string) }}
    </template>

    <!-- ── Cell: Number (text link → detail; erp.css .cell-link) ── -->
    <template #cell-number="{ value, row }">
      <a class="cell-link cell-text" @click.stop="goDetail((row as Row).id)">{{ formatNumber(value as number) }}</a>
    </template>

    <!-- ── Cell: Attachment icon (narrow column, no header) — same icons-cell
         pattern as OutgoingIndexPage's #cell-icons: centered flex wrapper +
         a plain icon-indicator, just clickable here to open the preview. ── -->
    <template #cell-attachment="{ value, row }">
      <div v-if="value" class="attachment-icons-cell">
        <MpTooltip
          :id="`bill-attachment-tt-${(row as Row).id}`"
          label="Attachment"
          placement="top"
          use-portal
        >
          <button
            type="button"
            class="attachment-icon-indicator"
            aria-label="View attachment"
            @click.stop="previewAttachments(row as Row)"
          >
            <MpIcon name="attachment" size="sm" />
          </button>
        </MpTooltip>
      </div>
    </template>

    <!-- ── Cell: Beneficiary (text link → detail, where the file preview lives) ── -->
    <template #cell-beneficiaryName="{ value, row }">
      <a class="cell-link cell-text" @click.stop="goDetail((row as Row).id)">{{ value }}</a>
    </template>

    <!-- ── Cell: Due Date ── -->
    <template #cell-dueDate="{ value }">
      {{ formatDate(value as string) }}
    </template>

    <!-- ── Cell: Status ── -->
    <template #cell-status="{ row }">
      <div class="status-cell">
        <ErpStatusBadge :status="(row as Row).displayStatus" />
        <span v-if="(row as Row).overdueLabel" class="status-sub-label">
          {{ (row as Row).overdueLabel }}
        </span>
      </div>
    </template>

    <!-- ── Cell: Balance due ── -->
    <template #cell-balanceDue="{ value }">
      {{ formatIDR(value as number) }}
    </template>

    <!-- ── Cell: Total ── -->
    <template #cell-total="{ value }">
      {{ formatIDR(value as number) }}
    </template>

    <!-- ── Cell: Tags ── -->
    <template #cell-tags="{ value }">
      <div v-if="(value as string[])?.length" class="tags-cell">
        <span v-for="tag in (value as string[])" :key="tag" class="erp-tag">{{ tag }}</span>
      </div>
    </template>

    <!-- ── Actions ── -->
    <template #actions="{ row }">
      <MpPopover :id="`bill-row-actions-${(row as Row).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton class="row-kebab" aria-label="More actions">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="goDetail((row as Row).id)">View details</MpPopoverListItem>
            <MpPopoverListItem v-if="(row as Row).status === 'unpaid'" @click="addPayment((row as Row).id)">Add payment</MpPopoverListItem>
            <MpPopoverListItem v-if="showSetAsRecurring">Set as recurring</MpPopoverListItem>
            <MpPopoverListItem @click="duplicate((row as Row).id)">Duplicate</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <template #cell-lastUpdated="{ row }">
      <LastUpdatedCell v-bind="lastUpdatedFor((row as Record<string, unknown>).id as string)" />
    </template>

    <!-- ── Full empty state (no bills yet) ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">No expenses</p>
        <p class="empty-full-desc">Expenses will appear here.</p>
      </div>
    </template>
  </ErpTablePage>

  <PdfPreviewModal
    :open="attachmentPreviewOpen"
    :doc="attachmentPreviewDoc"
    :filename="attachmentPreviewFilename"
    :title="attachmentPreviewTitle"
    @close="attachmentPreviewOpen = false"
  />

  <!-- ── Bulk Print PDF preview ── -->
  <PdfPreviewModal
    :open="bulkPdfPreviewOpen"
    :doc="bulkPdfPreviewDoc"
    :filename="bulkPdfPreviewFilename"
    title="Expenses preview"
    :print-label="`Print (${bulkPdfPreviewCount})`"
    @close="bulkPdfPreviewOpen = false"
  />

  <!-- ── Bulk delete confirmation modal (same pattern as WarehousesPage) ── -->
  <MpModal
    id="bills-bulk-delete-modal"
    :is-open="bulkDeleteModalOpen"
    size="md"
    is-close-on-esc
    is-close-on-overlay-click
    :is-keep-alive="false"
    @close="closeBulkDeleteModal"
  >
    <MpModalContent>
      <MpModalHeader>
        Delete {{ bulkDeleteCount }} expense{{ bulkDeleteCount !== 1 ? 's' : '' }}?
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        Deleted expenses cannot be restored.
      </MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--ghost" @click="closeBulkDeleteModal">Cancel</button>
          <button class="btn-enterprise btn-enterprise--danger" @click="confirmBulkDelete">Delete</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <!-- ── Export modal (same pattern as ProductsPage's export modal) ── -->
  <MpModal
    id="bills-export-modal"
    :is-open="exportModalOpen"
    size="lg"
    is-close-on-esc
    is-close-on-overlay-click
    :is-keep-alive="false"
    @close="closeExportModal"
  >
    <MpModalContent>
      <MpModalHeader>
        Export expenses
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
                <span>All expenses ({{ total }})</span>
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
                <span>Selected {{ selectedCount }} expense{{ selectedCount !== 1 ? 's' : '' }}</span>
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
                placeholder="Search column"
              />
              <MpButton v-if="exportColumnSearch" class="search-clear-btn" aria-label="Clear search" @click="exportColumnSearch = ''">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                </svg>
              </MpButton>
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

            <!-- Column list — 2 fixed groups (Date→Due date, Status→Last updated) -->
            <div class="export-col-groups">
              <div v-for="(group, gi) in visibleExportColumnGroups" :key="gi" class="export-col-group">
                <label v-for="col in group" :key="col.key" class="export-col-item">
                  <MpCheckbox
                    :id="`export-col-${col.key}`"
                    :is-checked="exportColumnChecked[col.key]"
                    @change="exportColumnChecked[col.key] = !exportColumnChecked[col.key]"
                    @click.stop
                  />
                  <span class="export-col-label">{{ col.label }}</span>
                </label>
              </div>
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
</template>

<style scoped>
/* ── Stats section ──────────────────────────────────────────────────────── */

.stats-section {
  display: flex;
  gap: var(--mp-spacing-6);
  align-items: flex-start;
}

.stat-card {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
  padding-right: var(--mp-spacing-6);
  align-self: stretch;
}

.stat-card--bordered {
  border-right: 1px solid var(--mp-border-default);
}

.stat-title {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default);
  line-height: var(--mp-line-heights-md);
  white-space: nowrap;
}

.stat-period {
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-sm, 16px);
  white-space: nowrap;
}

.stat-amount {
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  line-height: var(--mp-line-heights-2xl, 32px);
  white-space: nowrap;
}

.stat-amount--danger {
  color: var(--mp-text-danger);
}

.stat-link {
  display: inline-flex;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-link);
  line-height: var(--mp-line-heights-md);
  text-decoration: none;
  cursor: pointer;
  padding: 0 var(--mp-spacing-0\.5);
}

.stat-card--upsell {
  position: relative;
  gap: var(--mp-spacing-2);
  padding-right: var(--mp-spacing-10);
}

.upsell-dismiss {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--mp-spacing-1);
  border: none;
  background: transparent;
  border-radius: var(--mp-radii-sm);
  cursor: pointer;
  color: var(--mp-text-subtle);
}
.upsell-dismiss:hover {
  background: var(--mp-background-neutral-hovered);
  color: var(--mp-text-default);
}

.upsell-content {
  display: flex;
  gap: var(--mp-spacing-3);
  align-items: flex-start;
}

.upsell-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-12, 48px);
  height: var(--mp-sizes-12, 48px);
  border-radius: var(--mp-radii-md);
  background: var(--mp-background-success-subtle, #ebfffc);
  color: var(--mp-icon-success, #12a594);
}

.upsell-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
}

.upsell-title {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
}

.upsell-desc {
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-sm, 16px);
  color: var(--mp-text-secondary);
}

.upsell-actions {
  padding-left: calc(var(--mp-sizes-12, 48px) + var(--mp-spacing-3));
}

.cell-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

/* Attachment icon indicator — same icons-cell pattern as OutgoingIndexPage's
   #cell-icons (centered flex wrapper + plain icon, no button chrome). */
.attachment-icons-cell {
  display: flex;
  align-items: center;
  justify-content: center;
}
.attachment-icon-indicator {
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  padding: 0 !important;
  min-width: 0 !important;
  border: none !important;
  background: transparent !important;
  cursor: pointer;
  color: var(--mp-text-subtle);
}
.attachment-icon-indicator:hover { color: var(--mp-text-default); }

/* Status cell */
.status-cell {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--mp-spacing-0\.5);
  white-space: normal;
  width: fit-content;
}

.status-sub-label {
  font-size: var(--mp-font-sizes-xs, 11px);
  line-height: var(--mp-line-heights-xs);
  color: var(--mp-text-danger);
  padding-left: var(--mp-spacing-1\.5);
}

/* Tags */
.tags-cell {
  display: flex;
  gap: var(--mp-spacing-1);
  flex-wrap: wrap;
}

.erp-tag {
  display: inline-flex;
  align-items: center;
  background: var(--mp-background-neutral-subtle);
  color: var(--mp-text-secondary);
  font-size: var(--mp-font-sizes-md);
  padding: 0 var(--mp-spacing-1\.5);
  max-height: var(--mp-sizes-5, 20px);
  border-radius: var(--mp-radii-sm);
  white-space: nowrap;
}

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

/* Empty state */
.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.empty-full-desc {
  margin-top: var(--mp-spacing-0\.5);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}

/* ── Export modal (same pattern as ProductsPage's export modal) ── */
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

.export-col-all {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
  margin-top: var(--mp-spacing-4);
}

.export-col-groups {
  display: flex;
  gap: var(--mp-spacing-6);
  align-items: flex-start;
  width: 100%;
}
.export-col-group {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-2);
  flex: 1;
  min-width: 0;
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

.search-clear-btn {
  display: inline-flex !important; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px !important; height: 18px !important; min-width: 0 !important; padding: 0 !important;
  border: none !important; background: none !important; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px) !important;
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }

.modal-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }
</style>
