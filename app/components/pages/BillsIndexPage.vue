<script setup lang="ts">
import { type Ref } from 'vue'
import { formatIDR } from '~/utils/currency'
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, MpIcon, MpButton, MpButtonGroup, MpTooltip, MpRadio, MpCheckbox,
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
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import BillsFiltersDrawer, { emptyBillsFilters, type BillsFiltersValue } from '~/components/patterns/BillsFiltersDrawer.vue'
import ScenarioFab from '~/components/patterns/ScenarioFab.vue'
import CopyLinkDrawer from '~/components/patterns/CopyLinkDrawer.vue'
import ShareViaEmailModal from '~/components/patterns/ShareViaEmailModal.vue'
import type { AmountComparator } from '~/components/patterns/AmountComparatorField.vue'
import { bills, deleteBills } from '~/data'
import type { Bill, BillStatus } from '~/data'

const { t } = useLocale()
const router = useRouter()
function goDetail(id: string) { router.push(`/expenses/${id}`) }
function addPayment(id: string) { router.push(`/expenses/${id}/payment`) }
// Duplicate — opens the New expense form pre-filled from the source bill (minus
// payment); nothing is saved until the user submits.
function duplicate(id: string) {
  router.push({ path: '/expenses/new', query: { duplicate: id } })
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
  { key: 'date',          label: 'Date',          kind: 'date',                                 sortType: 'date'   },
  { key: 'number',        label: 'Number',        kind: 'number', sortable: true,                 sortType: 'number' },
  { key: 'attachment',    label: '',              width: '52px',  noHeader: true, align: 'center' },
  { key: 'beneficiaryName', label: 'Beneficiary', kind: 'name', sortable: true,                 sortType: 'text'   },
  { key: 'category',      label: 'Category',      sortable: true,                 sortType: 'text'   },
  { key: 'dueDate',       label: 'Due date',      kind: 'date',                                 sortType: 'date'   },
  { key: 'status',        label: 'Status',        kind: 'status',                                 sortType: 'text'   },
  { key: 'balanceDue',    label: 'Balance due',   kind: 'amount', align: 'right', sortable: true,  sortType: 'number' },
  { key: 'total',         label: 'Total',         kind: 'amount', align: 'right', sortable: true,  sortType: 'number' },
  { key: 'tags',          label: 'Tags',          kind: 'tags'                                  },
]

// ─── Row type ─────────────────────────────────────────────────────────────────

type Row = Bill & {
  beneficiaryName: string
  attachment: boolean
  overdueLabel: string | null
  displayStatus: 'open' | 'overdue' | 'paid' | BillStatus
}

// ─── Flatten + enrich ─────────────────────────────────────────────────────────

// Prototype preview toggle (ScenarioFab, bottom-right): data vs empty-state view
const previewMode = ref<'data' | 'empty'>('data')

const rows = computed<Row[]>(() =>
  previewMode.value === 'empty'
    ? []
    // Newest created on top by default (transactional log) — highest number first;
    // newly-added bills (higher number) surface at the top automatically.
    : [...bills].sort((a, b) => b.number - a.number).map(bill => {
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

// ─── "All filters" drawer — a second, independent filter layer, ANDed with the
// toolbar's own Status select + search below (same pattern as SalesInvoicesPage's
// SalesInvoiceFiltersDrawer wiring). ─────────────────────────────────────────
const filtersOpen = ref(false)
const appliedFilters = reactive<BillsFiltersValue>(emptyBillsFilters())

// Curated keyword-scope columns (real bills table columns worth text-matching).
const keywordColumns = [
  { key: 'number',          label: t('Number')      },
  { key: 'beneficiaryName', label: t('Beneficiary') },
  { key: 'category',        label: t('Category')    },
  { key: 'tags',            label: t('Tags')        },
]
const drawerStatusOptions = [
  { label: t('Open'),    value: 'open'    },
  { label: t('Paid'),    value: 'paid'    },
  { label: t('Overdue'), value: 'overdue' },
]
const tagOptions = computed(() => [...new Set(bills.flatMap(b => b.tags ?? []))].sort())

function applyDrawerFilters(v: BillsFiltersValue) { Object.assign(appliedFilters, v) }

function dayStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
// AdvancedDateRangePicker emits a [start, end] Date pair (or null = not applied).
function matchesDateRange(iso: string, range: Date[] | null): boolean {
  if (!range) return true
  const t = dayStart(new Date(iso)).getTime()
  return t >= dayStart(range[0]!).getTime() && t <= dayStart(range[1]!).getTime()
}
// "Is greater than"/"Is less than" read a single value field, "Is between" reads the min/max pair.
function matchesAmountFilter(amount: number, comparator: AmountComparator, value: string, min: string, max: string): boolean {
  if (comparator === 'gt') return value === '' || amount > Number(value)
  if (comparator === 'lt') return value === '' || amount < Number(value)
  const lo = min === '' ? -Infinity : Number(min)
  const hi = max === '' ? Infinity : Number(max)
  return amount >= lo && amount <= hi
}

// ─── Table state ──────────────────────────────────────────────────────────────

const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState(rows, {
  filterFn: (row: Row, s, status) => {
    const matchesSearch = String(row.number).includes(s) || row.beneficiaryName.toLowerCase().includes(s)
    const matchesStatus = !status || row.displayStatus === status

    // ── Drawer filters (independent of the toolbar's Status select / search) ──
    const f = appliedFilters
    const kw = f.keyword.toLowerCase().trim()
    const rowTags = row.tags ?? []
    const matchesKeyword = !kw || (
      f.keywordColumn === 'all'
        ? String(row.number).includes(kw) || row.beneficiaryName.toLowerCase().includes(kw) || row.category.toLowerCase().includes(kw) || rowTags.some(tg => tg.toLowerCase().includes(kw))
        : f.keywordColumn === 'number' ? String(row.number).includes(kw)
        : f.keywordColumn === 'beneficiaryName' ? row.beneficiaryName.toLowerCase().includes(kw)
        : f.keywordColumn === 'category' ? row.category.toLowerCase().includes(kw)
        : rowTags.some(tg => tg.toLowerCase().includes(kw))
    )
    const matchesTransactionDate = matchesDateRange(row.date, f.transactionDate)
    const matchesDueDate = matchesDateRange(row.dueDate, f.dueDate)
    const matchesDrawerStatus = f.status.length === 0 || f.status.includes(row.displayStatus)
    const matchesTotal = matchesAmountFilter(row.total, f.totalComparator, f.totalValue, f.totalMin, f.totalMax)
    const matchesTags = f.tags.length === 0
      || (f.tagsComparator === 'isAnyOf' ? f.tags.some(tg => rowTags.includes(tg))
        : f.tagsComparator === 'isAllOf' ? f.tags.every(tg => rowTags.includes(tg))
        : f.tags.every(tg => !rowTags.includes(tg)))

    return matchesSearch && matchesStatus
      && matchesKeyword && matchesTransactionDate && matchesDueDate && matchesDrawerStatus
      && matchesTotal && matchesTags
  },
})

watch(appliedFilters, () => setPage(1))

// Number of active filter FIELDS in the drawer (mirrors ProductsPage's
// activeFilterCount → "(n)" suffix on the All-filters trigger). The toolbar's
// own search/status pill have their own controls and are not counted here.
const activeFilterCount = computed(() => {
  const f = appliedFilters
  return (f.keyword ? 1 : 0)
    + (f.transactionDate ? 1 : 0)
    + (f.dueDate ? 1 : 0)
    + (f.status.length > 0 ? 1 : 0)
    + ((f.totalValue !== '' || f.totalMin !== '' || f.totalMax !== '') ? 1 : 0)
    + (f.tags.length > 0 ? 1 : 0)
})
const isDrawerFilterActive = computed(() => activeFilterCount.value > 0)

const hasActiveFilter = computed(() => !!search.value || !!statusFilter.value || isDrawerFilterActive.value)
function clearFilters() {
  search.value = ''
  statusFilter.value = ''
  Object.assign(appliedFilters, emptyBillsFilters())
}

// ─── Filter options ───────────────────────────────────────────────────────────

const statusOptions = [
  { label: t('Open'),    value: 'open'    },
  { label: t('Overdue'), value: 'overdue' },
  { label: t('Paid'),    value: 'paid'    },
]

// ─── Copy link / Share via email (shared patterns) ─────────────────────────────
const copyOpen = ref(false)
const shareOpen = ref(false)
const copyItems = ref<{ title: string; subtitle?: string; url: string }[]>([])
const shareTitle = ref('')
const shareSubject = ref('')
const shareAttachment = ref('')
function recordLink(id: string) { return `https://mkrierp.id/${id}` }
function openCopyLinks(rows: Row[]) {
  copyItems.value = rows.map(r => ({ title: `${t('Bill')} #${String(r.number).padStart(5, '0')}`, subtitle: r.beneficiaryName ?? r.beneficiary?.name, url: recordLink(r.id) }))
  copyOpen.value = true
}
function openShare(r: Row) {
  shareTitle.value = `${t('Bill')} #${String(r.number).padStart(5, '0')}`
  shareSubject.value = shareTitle.value
  shareAttachment.value = `BILL-${String(r.number).padStart(5, '0')}.pdf`
  shareOpen.value = true
}
function openShareBulk(selectedRows: Set<number>) {
  const rows = bulkSelectedBills(selectedRows)
  if (rows.length) openShare(rows[0]!)
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(iso))
}

function formatNumber(n: number) {
  return `${t('Expense')} #${String(n).padStart(5, '0')}`
}

// ─── Stats ────────────────────────────────────────────────────────────────────

const overdueBills = computed(() => rows.value.filter(r => r.overdueLabel))
const unpaidBills = computed(() => rows.value.filter(r => r.status === 'unpaid'))
const paidBills = computed(() => rows.value.filter(r => r.status === 'paid'))

const overdueTotal = computed(() => overdueBills.value.reduce((sum, r) => sum + r.balanceDue, 0))
const unpaidTotal = computed(() => unpaidBills.value.reduce((sum, r) => sum + r.balanceDue, 0))
const paidTotal = computed(() => paidBills.value.reduce((sum, r) => sum + r.total, 0))

// Column show/hide (first column always on; Last updated appended, hidden by default)
const allCols: TableColumn[] = [...columns, { key: 'lastUpdated', label: 'Last updated', kind: 'date' }]
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
  toast.notify({ variant: 'success', title: `${count} ${t(count !== 1 ? 'expenses' : 'expense')} ${t('deleted')}` })
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
    <template #bulk-actions="{ selectedRows }">
      <!-- Bulk bar = single secondary-sm "Actions" dropdown (never primary); no Delete (rule/bulk-actions-no-delete) -->
      <MpPopover id="bills-bulk-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
        <MpPopoverTrigger>
          <MpButton size="sm" variant="secondary" right-icon="chevrons-down" is-rounded>{{ t('Actions') }}</MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent class="erp-dropdown-menu">
          <MpPopoverList>
            <MpPopoverListItem v-if="allSelectedUnpaid(selectedRows as Set<number>)" @click="payWithMekariPay(selectedRows as Set<number>)">{{ t('Pay with Mekari Pay') }}</MpPopoverListItem>
            <MpPopoverListItem @click="printBulkPdf(selectedRows as Set<number>)">{{ t('Print PDF') }}</MpPopoverListItem>
            <MpPopoverListItem @click="openShareBulk(selectedRows as Set<number>)">{{ t('Share via email') }}</MpPopoverListItem>
            <MpPopoverListItem @click="openCopyLinks(bulkSelectedBills(selectedRows as Set<number>))">{{ t('Copy link') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Stats section ── -->
    <template #stats>
      <div class="stats-section">

        <!-- Card 1: Overdue -->
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">{{ t('Overdue') }}</div>
          <div class="stat-period">{{ t('As of today') }}</div>
          <div class="stat-amount stat-amount--danger">{{ formatIDR(overdueTotal) }}</div>
          <a class="stat-link">{{ overdueBills.length }} {{ t(overdueBills.length !== 1 ? 'expenses' : 'expense') }}</a>
        </div>

        <!-- Card 2: Unpaid -->
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">{{ t('Unpaid') }}</div>
          <div class="stat-period">{{ t('As of today') }}</div>
          <div class="stat-amount">{{ formatIDR(unpaidTotal) }}</div>
          <a class="stat-link">{{ unpaidBills.length }} {{ t(unpaidBills.length !== 1 ? 'expenses' : 'expense') }}</a>
        </div>

        <!-- Card 3: Paid -->
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">{{ t('Paid') }}</div>
          <div class="stat-period">{{ t('Last 30 days') }}</div>
          <div class="stat-amount">{{ formatIDR(paidTotal) }}</div>
          <a class="stat-link">{{ paidBills.length }} {{ t(paidBills.length !== 1 ? 'expenses' : 'expense') }}</a>
        </div>

        <!-- Card 4: Upsell — Mekari Card — hidden when Airene panel is open or dismissed -->
        <div v-if="!aireneOpen && showMekariCardUpsell" class="stat-card stat-card--upsell">
          <button
            type="button"
            class="upsell-dismiss"
            :aria-label="t('Dismiss')"
            @click="showMekariCardUpsell = false"
          >
            <MpIcon name="close" size="sm" />
          </button>
          <div class="upsell-content">
            <div class="upsell-icon">
              <MpIcon name="billing" size="md" variant="fill" />
            </div>
            <div class="upsell-copy">
              <p class="upsell-title">{{ t('Control business spend with Mekari Card') }}</p>
              <p class="upsell-desc">{{ t('Manage expenses easily with Mekari physical or virtual corporate cards. Say goodbye to manual reimbursement claims.') }}</p>
            </div>
          </div>
          <div class="upsell-actions">
            <button type="button" class="btn-enterprise btn-enterprise--secondary">
              {{ t('Start set up') }}
            </button>
          </div>
        </div>

      </div>
    </template>

    <!-- ── Filter bar ── -->
    <template #filters>
      <!-- Left: status single-select (ErpFilterSelect — MpPopover menu, never native) + All filters -->
      <div class="filter-left">
        <ErpFilterSelect id="bills-status" v-model="statusFilter" :placeholder="t('Status')" :options="statusOptions" />

        <MpButton class="filter-all-btn" :class="{ 'filter-all-btn--active': isDrawerFilterActive }" @click="filtersOpen = true">
          <MpIcon name="filter" size="sm" />
          {{ t('All filters') }}{{ activeFilterCount > 0 ? ` (${activeFilterCount})` : '' }}
        </MpButton>
      </div>

      <!-- Right: icon buttons + search -->
      <div class="filter-right">
        <!-- Icon tools = ghost icon MpButtons in one MpButtonGroup + tooltips (rule/filter-bar-icon-group) -->
        <MpButtonGroup class="filter-btn-group">
          <MpTooltip :label="t('Ask Airene')" placement="bottom">
            <MpButton class="filter-airene-btn" variant="ghost" left-icon="airene-brand" :aria-label="t('Ask Airene')" is-rounded @click="toggleAirene?.()" />
          </MpTooltip>
          <ColumnSettingsMenu id="tt-columns" :items="columnItems" :visibility="columnVisibility" />
          <MpTooltip :label="t('Export')" placement="bottom">
            <MpButton variant="ghost" left-icon="download" :aria-label="t('Export')" is-rounded @click="openExportModal" />
          </MpTooltip>
        </MpButtonGroup>

        <!-- Pill search (sanctioned ErpFilterBar pill; icons are MpIcon) -->
        <div class="filter-search">
          <MpIcon name="search" size="sm" />
          <input
            v-model="search"
            class="filter-search-input"
            type="text"
            :placeholder="t('Search...')"
          />
          <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''">
            <MpIcon name="close" size="sm" />
          </button>
        </div>
      </div>
    </template>

    <!-- ── Cell: Date ── -->
    <template #cell-date="{ value }">
      {{ formatDate(value as string) }}
    </template>

    <!-- ── Cell: Number (text link → detail; erp.css .cell-link) ── -->
    <template #cell-number="{ value, row }">
      <span class="cell-link cell-text" @click.stop="goDetail((row as Row).id)">{{ formatNumber(value as number) }}</span>
    </template>

    <!-- ── Cell: Attachment icon (narrow column, no header) — same icons-cell
         pattern as OutgoingIndexPage's #cell-icons: centered flex wrapper +
         a plain icon-indicator, just clickable here to open the preview. ── -->
    <template #cell-attachment="{ value, row }">
      <div v-if="value" class="attachment-icons-cell">
        <MpTooltip
          :id="`bill-attachment-tt-${(row as Row).id}`"
          :label="t('Attachment')"
          placement="bottom"
          use-portal
        >
          <button
            type="button"
            class="attachment-icon-indicator"
            :aria-label="t('View attachment')"
            @click.stop="previewAttachments(row as Row)"
          >
            <MpIcon name="attachment" size="sm" />
          </button>
        </MpTooltip>
      </div>
    </template>

    <!-- ── Cell: Beneficiary (text link → detail, where the file preview lives) ── -->
    <template #cell-beneficiaryName="{ value, row }">
      <span class="cell-link cell-text" @click.stop="goDetail((row as Row).id)">{{ value }}</span>
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
          <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
        </MpPopoverTrigger>
        <MpPopoverContent class="erp-dropdown-menu">
          <MpPopoverList>
            <MpPopoverListItem @click="goDetail((row as Row).id)">{{ t('View details') }}</MpPopoverListItem>
            <MpPopoverListItem v-if="(row as Row).status === 'unpaid'" @click="addPayment((row as Row).id)">{{ t('Add payment') }}</MpPopoverListItem>
            <MpPopoverListItem v-if="showSetAsRecurring">{{ t('Set as recurring') }}</MpPopoverListItem>
            <MpPopoverListItem @click="duplicate((row as Row).id)">{{ t('Duplicate') }}</MpPopoverListItem>
          </MpPopoverList>
          <div :class="css({ height: 'var(--mp-sizes-px, 1px)', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
          <MpPopoverList>
            <MpPopoverListItem @click="openShare(row as Row)">{{ t('Share via email') }}</MpPopoverListItem>
            <MpPopoverListItem @click="openCopyLinks([row as Row])">{{ t('Copy link') }}</MpPopoverListItem>
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
        <p class="empty-full-title">{{ t('No expenses') }}</p>
        <p class="empty-full-desc">{{ t('Expenses will appear here.') }}</p>
      </div>
    </template>
  </ErpTablePage>

  <BillsFiltersDrawer
    id="bills-allfilters"
    :is-open="filtersOpen"
    :model-value="appliedFilters"
    :columns="keywordColumns"
    :status-options="drawerStatusOptions"
    :tag-options="tagOptions"
    @update:is-open="filtersOpen = $event"
    @apply="applyDrawerFilters"
  />

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
    :title="t('Expenses preview')"
    :print-label="`${t('Print')} (${bulkPdfPreviewCount})`"
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
        {{ t('Delete') }} {{ bulkDeleteCount }} {{ t(bulkDeleteCount !== 1 ? 'expenses' : 'expense') }}?
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        {{ t('Deleted expenses cannot be restored.') }}
      </MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--ghost" @click="closeBulkDeleteModal">{{ t('Cancel') }}</button>
          <button class="btn-enterprise btn-enterprise--danger" @click="confirmBulkDelete">{{ t('Delete') }}</button>
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
        {{ t('Export expenses') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <div class="export-modal-body">

          <!-- Export scope -->
          <div class="export-section">
            <p class="export-section__label">{{ t('Export scope') }}</p>
            <div class="export-radio-group">
              <label class="export-radio-item">
                <MpRadio
                  id="export-scope-all"
                  name="export-scope"
                  value="all"
                  :is-checked="exportScope === 'all'"
                  @change="exportScope = 'all'"
                />
                <span>{{ t('All expenses') }} ({{ total }})</span>
              </label>
              <label class="export-radio-item">
                <MpRadio
                  id="export-scope-page"
                  name="export-scope"
                  value="page"
                  :is-checked="exportScope === 'page'"
                  @change="exportScope = 'page'"
                />
                <span>{{ t('Current page') }}</span>
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
                <span>{{ t('Selected') }} {{ selectedCount }} {{ t(selectedCount !== 1 ? 'expenses' : 'expense') }}</span>
              </label>
            </div>
          </div>

          <!-- Select columns -->
          <div class="export-section">
            <p class="export-section__label">{{ t('Select columns to export') }}</p>

            <!-- Search -->
            <div class="export-col-search">
              <MpIcon name="search" size="sm" />
              <input
                v-model="exportColumnSearch"
                class="export-col-search__input"
                type="text"
                :placeholder="t('Search column')"
              />
              <MpButton v-if="exportColumnSearch" class="search-clear-btn" :aria-label="t('Clear search')" @click="exportColumnSearch = ''">
                <MpIcon name="close" size="sm" />
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
              <span class="export-col-label">{{ t('All columns') }}</span>
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
          <button class="btn-enterprise btn-enterprise--ghost" @click="closeExportModal">{{ t('Cancel') }}</button>
          <button class="btn-enterprise btn-enterprise--primary" @click="closeExportModal">{{ t('Export') }}</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <!-- ── Copy link / Share via email (shared patterns) ── -->
  <CopyLinkDrawer :open="copyOpen" :items="copyItems" @close="copyOpen = false" @download-csv="copyOpen = false" />
  <ShareViaEmailModal
    :open="shareOpen"
    :title="shareTitle"
    :subject="shareSubject"
    :attachment-name="shareAttachment"
    :attachment-size-k-b="128"
    sender-email="rizal.candra@centralperk.co.id"
    @close="shareOpen = false"
    @send="shareOpen = false"
  />

  <!-- ── Prototype scenario FAB (bottom-right): toggle data vs empty-state view ── -->
  <ScenarioFab v-model="previewMode" />
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
  /* Mekari Card brand tones (exact) — undefined tokens so the hex fallback always wins. */
  background: var(--mekari-card-icon-bg, #EBFFFC);
  color: var(--mekari-card-icon-color, #075056);
}
.upsell-icon :deep(svg) { color: var(--mekari-card-icon-color, #075056); fill: var(--mekari-card-icon-color, #075056); }

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
/* Active = drawer filters applied (mirrors SalesInvoicesPage's --active). */
.filter-all-btn--active {
  background: var(--mp-background-neutral-subtle) !important;
  border-color: var(--mp-colors-border-bold, #8c9596) !important;
  color: var(--mp-text-selected, var(--mp-text-information)) !important;
}

.filter-btn-group {
  display: flex;
  align-items: center;
}
/* icon tools sit 8px apart (MpButtonGroup default) — rule/btn-group-gap-8 */
.filter-btn-group :deep(.mp-pixel-button-group) { gap: var(--mp-spacing-2); }
.filter-airene-btn :deep(svg) { color: var(--mp-airene-default, #6938ef); }

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

.filter-search { display: flex; align-items: center; gap: var(--mp-spacing-2); width: var(--filter-search-w, 248px);
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
.empty-illustration { width: var(--empty-illo-w, 288px); height: var(--empty-illo-h, 240px); object-fit: contain; }
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

/* ── Responsive stats (audit): keep the row horizontal on small screens and let
   it scroll/swipe instead of stacking (home stacks; index pages scroll). ── */
@media (max-width: 640px) {
  .stats-section { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .stat-card { flex: 0 0 auto; }
}
</style>
