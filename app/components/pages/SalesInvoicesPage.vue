<script setup lang="ts">
import { type Ref } from 'vue'
import { formatIDR } from '~/utils/currency'
import {
  MpIcon, MpButton, MpButtonGroup, MpTooltip, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpModal, MpModalContent, MpModalHeader, MpModalCloseButton, MpModalBody, MpModalFooter, MpModalOverlay,
  css, toast,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import { lastUpdatedFor } from '~/utils/lastUpdated'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import SalesInvoiceFiltersDrawer, { emptySalesInvoiceFilters, type SalesInvoiceFiltersValue } from '~/components/patterns/SalesInvoiceFiltersDrawer.vue'
import type { AmountComparator } from '~/components/patterns/AmountComparatorField.vue'
import { salesInvoices, deleteSalesInvoices } from '~/data'
import type { SalesInvoice } from '~/data'
import { getTaxDocumentsForInvoice, formatTaxDocumentNumber, updateTaxDocumentStatus, DJP_STATUS_CONFIG, type TaxDocumentStatus } from '~/data/taxDocuments'

const toggleAirene = inject<() => void>('toggleAirene')
const aireneOpen = inject<Ref<boolean>>('aireneOpen')
const { t } = useLocale()

// ─── Column definitions — match Figma Sales Invoices table exactly ────────────
//
//  Figma structure (left → right):
//  [checkbox 36px] DATE 120px | NUMBER 200px | attachment 40px |
//  CUSTOMER 240px | DUE DATE 108px | STATUS 160px |
//  BALANCE DUE 160px ← right | TOTAL 160px ← right |
//  TAGS 160px | [actions 44px sticky]

const columns: TableColumn[] = [
  { key: 'date',         label: t('Date'),        kind: 'date',                                   sortType: 'date'   },
  { key: 'number',       label: t('Number'),      kind: 'number', sortable: true,                 sortType: 'text'   },
  { key: 'attachment',   label: '',            width: '40px',  noHeader: true, align: 'center' },
  { key: 'customerName', label: t('Customer'),    kind: 'name', sortable: true,                 sortType: 'text'   },
  { key: 'dueDate',      label: t('Due date'),    kind: 'date',                                   sortType: 'date'   },
  { key: 'status',       label: t('Status'),      kind: 'status',                                 sortType: 'text'   },
  { key: 'djpStatus',    label: t('DJP status'),  kind: 'status',                                 sortType: 'text'   },
  { key: 'balance',      label: t('Balance due'), kind: 'amount', align: 'right', sortable: true,  sortType: 'number' },
  { key: 'total',        label: t('Total'),       kind: 'amount', align: 'right', sortable: true,  sortType: 'number' },
  { key: 'tags',         label: t('Tags'),        kind: 'tags'                                    },
]

// ─── Row type ─────────────────────────────────────────────────────────────────

type Row = SalesInvoice & {
  customerName: string
  attachment: boolean
  hasTaxDocument: boolean
  /** most recent tax document's status, or 'not-generated' when it has none. */
  djpStatus: TaxDocumentStatus | 'not-generated'
  overdueLabel: string | null
}

// ─── Flatten + enrich ─────────────────────────────────────────────────────────

const rows = computed<Row[]>(() =>
  salesInvoices.map(inv => {
    const overdueLabel = inv.status === 'overdue'
      ? (() => {
          const days = Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / 86_400_000)
          return days > 0 ? `${days} ${days !== 1 ? t('days') : t('day')}` : null
        })()
      : null
    const taxDocs = getTaxDocumentsForInvoice(inv.id)

    return {
      ...inv,
      customerName: inv.customer.name,
      attachment:   inv.hasAttachment ?? false,
      hasTaxDocument: taxDocs.length > 0,
      djpStatus: taxDocs.length > 0 ? taxDocs[0]!.status : 'not-generated',
      overdueLabel,
    }
  })
)

// ─── "All filters" drawer — a second, independent filter layer, ANDed with the
// toolbar's own Status select + search below (same pattern as TasksTablePage's
// InboxFiltersDrawer wiring). ───────────────────────────────────────────────
const filtersOpen = ref(false)
const appliedFilters = reactive<SalesInvoiceFiltersValue>(emptySalesInvoiceFilters())

const keywordColumns = [
  { key: 'number',       label: t('Number')   },
  { key: 'customerName', label: t('Customer') },
  { key: 'tags',         label: t('Tags')     },
]
const tagOptions = computed(() => [...new Set(salesInvoices.flatMap(inv => inv.tags ?? []))].sort())
// DJP status is only a real column/filter when at least one invoice on the
// table has a tax document — otherwise every row would just show "Not
// generated" and the column/filter would be dead weight.
const hasAnyTaxDocument = computed(() => rows.value.some(r => r.hasTaxDocument))
// Empty (and the drawer's DJP status field hidden) until the table has at
// least one invoice with a tax document — see hasAnyTaxDocument below.
const djpStatusOptions = computed(() => hasAnyTaxDocument.value
  ? (Object.keys(DJP_STATUS_CONFIG) as TaxDocumentStatus[]).map(value => ({ value, label: t(DJP_STATUS_CONFIG[value].label) }))
  : [])

function applyDrawerFilters(v: SalesInvoiceFiltersValue) { Object.assign(appliedFilters, v) }

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
    const matchesSearch = String(row.number).includes(s) || row.customerName.toLowerCase().includes(s)
    const matchesStatus = !status || row.status === status

    // ── Drawer filters (independent of the toolbar's Status select / search) ──
    const f = appliedFilters
    const kw = f.keyword.toLowerCase().trim()
    const matchesKeyword = !kw || (
      f.keywordColumn === 'all'
        ? String(row.number).includes(kw) || row.customerName.toLowerCase().includes(kw) || (row.tags ?? []).some(tg => tg.toLowerCase().includes(kw))
        : f.keywordColumn === 'number' ? String(row.number).includes(kw)
        : f.keywordColumn === 'customerName' ? row.customerName.toLowerCase().includes(kw)
        : (row.tags ?? []).some(tg => tg.toLowerCase().includes(kw))
    )
    const matchesTransactionDate = matchesDateRange(row.date, f.transactionDate)
    const matchesDueDate = matchesDateRange(row.dueDate, f.dueDate)
    const matchesDrawerStatus = f.status.length === 0 || f.status.includes(row.status)
    const matchesTotal = matchesAmountFilter(row.total, f.totalComparator, f.totalValue, f.totalMin, f.totalMax)
    const rowTags = row.tags ?? []
    const matchesTags = f.tags.length === 0
      || (f.tagsComparator === 'isAnyOf' ? f.tags.some(tg => rowTags.includes(tg))
        : f.tagsComparator === 'isAllOf' ? f.tags.every(tg => rowTags.includes(tg))
        : f.tags.every(tg => !rowTags.includes(tg)))
    const matchesDjpStatus = f.djpStatus.length === 0 || f.djpStatus.includes(row.djpStatus)

    return matchesSearch && matchesStatus
      && matchesKeyword && matchesTransactionDate && matchesDueDate && matchesDrawerStatus
      && matchesTotal && matchesTags && matchesDjpStatus
  },
})

watch(appliedFilters, () => setPage(1))

const isDrawerFilterActive = computed(() => {
  const f = appliedFilters
  return !!f.keyword || !!f.transactionDate || !!f.dueDate || f.status.length > 0
    || f.totalValue !== '' || f.totalMin !== '' || f.totalMax !== ''
    || f.tags.length > 0 || f.djpStatus.length > 0
})

// Empty-state wiring: filtered-empty shows "Clear all filters"; full-empty shows the illustration.
const emptyIllustration = '/illustrations/empty-folder.png'
function clearFilters() {
  search.value = ''
  statusFilter.value = ''
  Object.assign(appliedFilters, emptySalesInvoiceFilters())
}

// ─── Filter options ───────────────────────────────────────────────────────────

const statusOptions = [
  { label: t('All status'), value: ''        },
  { label: t('Paid'),       value: 'paid'    },
  { label: t('Open'),       value: 'open'    },
  { label: t('Overdue'),    value: 'overdue' },
]
const drawerStatusOptions = [
  { label: t('Open'),    value: 'open'    },
  { label: t('Paid'),    value: 'paid'    },
  { label: t('Overdue'), value: 'overdue' },
]

// ─── Navigation ───────────────────────────────────────────────────────────────

const router = useRouter()
function viewDetails(id: string) {
  router.push(`/sales-invoices/${id}`)
}

// ─── Tax document popover (attachment-column icon) ─────────────────────────────
function taxDocumentsFor(id: string) {
  return getTaxDocumentsForInvoice(id)
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(iso))
}


// Column show/hide (first column always on; Last updated appended, hidden by default;
// DJP status also starts hidden — only shown once activated from column settings)
const HIDDEN_BY_DEFAULT = new Set(['lastUpdated', 'djpStatus'])
const allCols = computed<TableColumn[]>(() => [
  ...columns.filter(c => c.key !== 'djpStatus' || hasAnyTaxDocument.value),
  { key: 'lastUpdated', label: t('Last updated'), kind: 'date' },
])
const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(allCols.value.map(c => [c.key, !HIDDEN_BY_DEFAULT.has(c.key)])))
const columnItems = computed(() => allCols.value.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 })))
const visibleColumns = computed<TableColumn[]>(() => allCols.value.filter(c => columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }

// ─── Bulk actions (selection bar) — mirrors BillsIndexPage's bulk pattern ──────

function bulkSelectedInvoices(selectedRows: Set<number>): Row[] {
  return [...selectedRows].map(i => paginated.value[i] as Row).filter(Boolean)
}

// "Submit to DJP" only shows once every selected invoice has a tax document
// AND that document's DJP status is Draft or Rejected — anything already
// awaiting approval or approved has nothing left to (re-)submit.
const SUBMITTABLE_DJP_STATUSES: TaxDocumentStatus[] = ['draft', 'rejected']
function allSelectedSubmittableToDjp(selectedRows: Set<number>): boolean {
  const selected = bulkSelectedInvoices(selectedRows)
  return selected.length > 0 && selected.every(inv =>
    inv.hasTaxDocument && SUBMITTABLE_DJP_STATUSES.includes(inv.djpStatus as TaxDocumentStatus),
  )
}
function submitBulkToDjp(selectedRows: Set<number>, deselectAll: () => void) {
  const selected = bulkSelectedInvoices(selectedRows)
  if (!selected.length) return
  for (const inv of selected) {
    const doc = getTaxDocumentsForInvoice(inv.id)[0]
    if (doc) updateTaxDocumentStatus(doc.id, 'awaiting-approval')
  }
  toast.notify({ variant: 'success', title: `${selected.length} ${t(selected.length !== 1 ? 'tax documents' : 'tax document')} ${t('submitted to DJP')}` })
  deselectAll()
}

// Delete
const bulkDeleteModalOpen = ref(false)
const bulkDeleteIds = ref<string[]>([])
const bulkDeleteCount = computed(() => bulkDeleteIds.value.length)
let bulkDeleteDeselect: (() => void) | null = null

function openBulkDeleteModal(selectedRows: Set<number>, deselectAll: () => void) {
  bulkDeleteIds.value = bulkSelectedInvoices(selectedRows).map(inv => inv.id)
  bulkDeleteDeselect = deselectAll
  bulkDeleteModalOpen.value = true
}
function closeBulkDeleteModal() { bulkDeleteModalOpen.value = false }
function confirmBulkDelete() {
  const count = deleteSalesInvoices(bulkDeleteIds.value)
  toast.notify({ variant: 'success', title: `${count} ${t(count !== 1 ? 'sales invoices' : 'sales invoice')} ${t('deleted')}` })
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
    has-ai-chat
    bulk-label="sales invoice"
    :search="search"
    filter-empty-label="sales invoice"
    :has-active-filter="isDrawerFilterActive || !!statusFilter"
    :has-active-search="!!search"
    :context-label="(row) => `${t('Sales Invoice')} #${row.number}`"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
    @clear-all="clearFilters"
  >

    <!-- ── Bulk actions ── -->
    <template #bulk-actions="{ selectedRows, deselectAll }">
      <!-- Bulk bar = single secondary-sm "Actions" dropdown (never primary); Delete folded in -->
      <MpPopover id="si-bulk-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
        <MpPopoverTrigger>
          <MpButton size="sm" variant="secondary" right-icon="chevrons-down" is-rounded>{{ t('Actions') }}</MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent class="erp-dropdown-menu">
          <MpPopoverList>
            <MpPopoverListItem
              v-if="allSelectedSubmittableToDjp(selectedRows as Set<number>)"
              @click="submitBulkToDjp(selectedRows as Set<number>, deselectAll)"
            >{{ t('Submit to DJP') }}</MpPopoverListItem>
            <MpPopoverListItem>{{ t('Print PDF') }}</MpPopoverListItem>
            <MpPopoverListItem>{{ t('Share via email') }}</MpPopoverListItem>
            <MpPopoverListItem>{{ t('Copy link') }}</MpPopoverListItem>
            <MpPopoverListItem @click="openBulkDeleteModal(selectedRows as Set<number>, deselectAll)">{{ t('Delete') }}</MpPopoverListItem>
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
          <div class="stat-amount stat-amount--danger">Rp10.000.000,00</div>
          <a class="stat-link">{{ t('1 invoice') }}</a>
          <div class="stat-ai-banner">
            <MpIcon name="airene-brand" size="sm" class="stat-ai-icon" />
            <span>{{ t('The Daily Grind Co. is 2 days overdue. Send a reminder?') }}</span>
          </div>
        </div>

        <!-- Card 2: Unpaid -->
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">{{ t('Unpaid') }}</div>
          <div class="stat-period">{{ t('As of today') }}</div>
          <div class="stat-amount">Rp20.000.000,00</div>
          <a class="stat-link">{{ t('3 invoices') }}</a>
          <div class="stat-ai-banner">
            <MpIcon name="airene-brand" size="sm" class="stat-ai-icon" />
            <span>{{ t('3 customers owe Rp20M. The oldest is 25 days past due. Send reminders to all?') }}</span>
          </div>
        </div>

        <!-- Card 3: Payment received -->
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">{{ t('Payment received') }}</div>
          <div class="stat-period">{{ t('Last 30 days') }}</div>
          <div class="stat-amount">Rp12.000.000,00</div>
          <a class="stat-link">{{ t('1 invoice') }}</a>
          <div class="stat-ai-banner">
            <MpIcon name="airene-brand" size="sm" class="stat-ai-icon" />
            <span>{{ t('Payment from') }} <strong>UBlack Drop Espresso Bar</strong> {{ t('matched. Reconcile now?') }}</span>
          </div>
        </div>

        <!-- Card 4: Mekari Pay — hidden when Airene panel is open -->
        <div v-if="!aireneOpen" class="stat-card stat-card--pay">
          <div class="stat-pay-icon">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M0 6C0 2.68629 2.68629 0 6 0H42C45.3137 0 48 2.68629 48 6V42C48 45.3137 45.3137 48 42 48H6C2.68629 48 0 45.3137 0 42V6Z" fill="#E1F6FF"/>
              <path d="M19.2572 10H28.7428C31.198 10 33.5526 10.9833 35.2886 12.7337C37.0247 14.484 38 16.858 38 19.3333C38 21.8087 37.0247 24.1827 35.2886 25.933C33.5526 27.6833 31.198 28.6667 28.7428 28.6667H10V19.3333C10 16.858 10.9753 14.484 12.7114 12.7337C14.4474 10.9833 16.8021 10 19.2572 10Z" fill="#40C3FF"/>
              <path d="M16.1715 28.6667C12.7648 28.6667 10 30.5956 10 32.9663V28.6667L16.1715 28.6667Z" fill="#40C3FF"/>
              <path d="M16.1715 28.6667C12.7648 28.6667 10 30.5956 10 32.9663L10.0003 33.7005C10.0003 36.0712 12.7651 38.0001 16.1718 38.0001H18.6404C18.9057 37.9995 19.1673 37.9375 19.4051 37.819C19.6429 37.7005 19.8506 37.5285 20.0121 37.3164C20.1737 37.1042 20.2848 36.8575 20.3369 36.5952C20.3891 36.333 20.3808 36.0622 20.3129 35.8036L18.3935 28.6667L16.1715 28.6667Z" fill="currentColor"/>
            </svg>
          </div>
          <div class="stat-pay-content">
            <div class="stat-title">{{ t('Payments via Mekari Pay') }}</div>
            <div class="stat-period">{{ t('Last 30 days') }}</div>
            <div class="stat-amount">Rp15.200.000,00</div>
            <a class="stat-link">{{ t('Open Mekari Pay') }}</a>
          </div>
        </div>

      </div>
    </template>

    <!-- ── Filter bar ── -->
    <template #filters>
      <!-- Left: Status select + All filters -->
      <div class="filter-left">
        <ErpFilterSelect id="si-status" v-model="statusFilter" :placeholder="t('Status')" :options="statusOptions.slice(1)" />

        <MpButton variant="secondary" left-icon="filter" is-rounded class="filter-all-btn" :class="{ 'filter-all-btn--active': isDrawerFilterActive }" @click="filtersOpen = true">{{ t('All filters') }}</MpButton>
      </div>

      <!-- Right: icon buttons + search -->
      <div class="filter-right">
        <!-- Icon tools = ghost icon MpButtons in one MpButtonGroup + tooltips (rule/filter-bar-icon-group) -->
        <MpButtonGroup class="filter-btn-group">
          <MpTooltip :label="t('Ask Airene')">
            <MpButton class="filter-airene-btn" variant="ghost" left-icon="airene-brand" :aria-label="t('Ask Airene')" is-rounded @click="toggleAirene?.()" />
          </MpTooltip>
          <ColumnSettingsMenu id="tt-columns" :items="columnItems" :visibility="columnVisibility" />
          <MpTooltip :label="t('Export')">
            <MpButton variant="ghost" left-icon="download" :aria-label="t('Export')" is-rounded />
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

    <!-- ── Cell: Number ── -->
    <template #cell-number="{ row, value }">
      <a class="cell-link cell-text cell-number" @click.stop="viewDetails((row as Row).id)">{{ t('Sales Invoice') }} #{{ value }}</a>
    </template>

    <!-- ── Cell: Attachment icon (narrow column, no header) — tax-document icon
         stacks above it when the invoice has one or more tax documents ── -->
    <template #cell-attachment="{ row, value }">
      <div class="attachment-cell">
        <MpPopover v-if="(row as Row).hasTaxDocument" :id="`si-taxdoc-${(row as Row).id}`" use-portal :is-keep-alive="false" placement="bottom-start">
          <MpPopoverTrigger>
            <MpButton class="taxdoc-icon-btn" :aria-label="t('Tax document')" @click.stop>
              <MpIcon name="doc" size="sm" />
            </MpButton>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ width: '480px', padding: 'var(--mp-spacing-6)' })">
            <div class="taxdoc-popover">
              <div class="taxdoc-popover-head">
                <h3 class="taxdoc-popover-title">{{ t('Tax Document') }}</h3>
                <p class="taxdoc-popover-subtitle">{{ t('Sales Invoice') }} #{{ (row as Row).number }}</p>
              </div>
              <table class="taxdoc-popover-table">
                <colgroup>
                  <col class="taxdoc-popover-col-label" />
                  <col />
                </colgroup>
                <thead>
                  <tr>
                    <th>{{ t('Date') }}</th>
                    <th>
                      <span class="taxdoc-popover-th">
                        {{ t('Number') }}
                        <MpTooltip :id="`si-taxdoc-number-tt-${(row as Row).id}`" :label="t('Draft, awaiting approval, or rejected documents have no DJP number yet')" placement="top" use-portal>
                          <MpIcon name="info" size="sm" />
                        </MpTooltip>
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="doc in taxDocumentsFor((row as Row).id)" :key="doc.id">
                    <td>{{ doc.date }}</td>
                    <td>{{ formatTaxDocumentNumber(doc) }}</td>
                  </tr>
                </tbody>
              </table>
              <div class="taxdoc-popover-footer">
                <button type="button" class="btn-enterprise btn-enterprise--secondary" @click="viewDetails((row as Row).id)">
                  {{ t('View details') }}
                </button>
              </div>
            </div>
          </MpPopoverContent>
        </MpPopover>
        <MpIcon v-if="value" name="attachment" size="sm" class="attachment-icon" />
        <!-- render empty placeholder so Vue never falls back to the raw boolean -->
        <span v-if="!(row as Row).hasTaxDocument && !value" />
      </div>
    </template>

    <!-- ── Cell: Customer ── -->
    <template #cell-customerName="{ value }">
      <a class="cell-link cell-text" @click.stop>{{ value }}</a>
    </template>

    <!-- ── Cell: Due Date ── -->
    <template #cell-dueDate="{ value }">
      {{ formatDate(value as string) }}
    </template>

    <!-- ── Cell: Status (badge + optional overdue sub-label) ── -->
    <template #cell-status="{ row, value }">
      <div class="status-cell">
        <ErpStatusBadge :status="value as string" />
        <span v-if="(row as Row).overdueLabel" class="status-sub-label">
          {{ (row as Row).overdueLabel }}
        </span>
      </div>
    </template>

    <!-- ── Cell: DJP status — only rendered once a tax document has actually
         been generated for the invoice; otherwise shows an em dash. ── -->
    <template #cell-djpStatus="{ row }">
      <ErpStatusBadge
        v-if="(row as Row).hasTaxDocument"
        :status="(row as Row).djpStatus"
        :label="DJP_STATUS_CONFIG[(row as Row).djpStatus as TaxDocumentStatus].label"
        :type="DJP_STATUS_CONFIG[(row as Row).djpStatus as TaxDocumentStatus].type"
      />
      <!-- em dash (not raw 'not-generated') so Vue never falls back to the raw sentinel value -->
      <span v-else>—</span>
    </template>

    <!-- ── Cell: Balance Due ── -->
    <template #cell-balance="{ value }">
      {{ formatIDR(value as number) }}
    </template>

    <!-- ── Cell: Total ── -->
    <template #cell-total="{ value }">
      {{ formatIDR(value as number) }}
    </template>

    <!-- ── Cell: Tags — ErpTagList (MpTag chips, 2-line clamp + More) ── -->
    <template #cell-tags="{ value }">
      <ErpTagList :tags="(value as string[])" />
    </template>

    <!-- ── Actions ── row kebab = real MpPopover menu (ghost icon + tooltip) ── -->
    <template #actions="{ row }">
      <MpPopover :id="`si-row-${(row as Row).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpTooltip :label="t('More actions')">
            <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
          </MpTooltip>
        </MpPopoverTrigger>
        <MpPopoverContent class="erp-dropdown-menu">
          <MpPopoverList>
            <MpPopoverListItem @click="navigateTo(`/sales-invoices/${(row as Row).id}`)">{{ t('View details') }}</MpPopoverListItem>
            <MpPopoverListItem @click="navigateTo(`/sales-invoices/${(row as Row).id}`)">{{ t('Edit') }}</MpPopoverListItem>
            <MpPopoverListItem>{{ t('Print PDF') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <template #cell-lastUpdated="{ row }">
      <LastUpdatedCell v-bind="lastUpdatedFor((row as Record<string, unknown>).id as string)" />
    </template>

    <!-- Full empty (no data ever): illustration + title + caption + secondary CTA -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('No sales invoices yet') }}</p>
        <p class="empty-full-desc">{{ t('Create your first sales invoice to see it here.') }}</p>
        <MpButton variant="secondary" left-icon="add" is-rounded @click="navigateTo('/sales-invoices/new')">{{ t('New sales invoice') }}</MpButton>
      </div>
    </template>
  </ErpTablePage>

  <SalesInvoiceFiltersDrawer
    id="si-allfilters"
    :is-open="filtersOpen"
    :model-value="appliedFilters"
    :columns="keywordColumns"
    :status-options="drawerStatusOptions"
    :tag-options="tagOptions"
    :djp-status-options="djpStatusOptions"
    @update:is-open="filtersOpen = $event"
    @apply="applyDrawerFilters"
  />

  <!-- ── Bulk delete confirmation modal (same pattern as BillsIndexPage) ── -->
  <MpModal
    id="si-bulk-delete-modal"
    :is-open="bulkDeleteModalOpen"
    size="md"
    is-close-on-esc
    is-close-on-overlay-click
    :is-keep-alive="false"
    @close="closeBulkDeleteModal"
  >
    <MpModalContent>
      <MpModalHeader>
        {{ t('Delete') }} {{ bulkDeleteCount }} {{ t(bulkDeleteCount !== 1 ? 'sales invoices' : 'sales invoice') }}?
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        {{ t('Deleted sales invoices cannot be restored.') }}
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup class="erp-action-footer">
          <MpButton variant="ghost" is-rounded @click="closeBulkDeleteModal">{{ t('Cancel') }}</MpButton>
          <MpButton variant="danger" is-rounded @click="confirmBulkDelete">{{ t('Delete') }} {{ bulkDeleteCount }} {{ t(bulkDeleteCount !== 1 ? 'sales invoices' : 'sales invoice') }}</MpButton>
        </MpButtonGroup>
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

.stat-card--pay {
  flex-direction: row;
  gap: var(--mp-spacing-3);
  padding-right: 0;
}

.stat-pay-icon {
  flex-shrink: 0;
}

.stat-pay-content {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
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

.stat-ai-banner {
  display: flex;
  gap: var(--mp-spacing-3);
  align-items: flex-start;
  background: var(--mp-airene-banner-bg);
  border-radius: var(--mp-radii-md);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
}

.stat-ai-icon {
  flex-shrink: 0;
  margin-top: var(--mp-spacing-0\.5);
  color: var(--mp-airene-default);
}

.stat-ai-banner span {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm, 16px);
  color: var(--mp-airene-banner-text);
  flex: 1;
  min-width: 0;
}

.stat-ai-banner strong {
  font-weight: var(--mp-font-weights-regular);
}

.cell-number {
  color: var(--mp-text-default);
}

.cell-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

/* Attachment icon — the tax-document icon (when present) stacks above it */
.attachment-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--mp-spacing-1);
}
.attachment-icon {
  color: var(--mp-text-subtle);
}
.taxdoc-icon-btn {
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-6, 24px) !important;
  height: var(--mp-sizes-6, 24px) !important;
  min-width: 0 !important;
  padding: 0 !important;
  border: none !important;
  background: transparent !important;
  border-radius: var(--mp-radii-sm);
  cursor: pointer;
  color: var(--mp-text-subtle);
}
.taxdoc-icon-btn:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-default); }

/* ── Tax document popover (Figma: E-Faktur node 4223-16211) ── */
.taxdoc-popover { display: flex; flex-direction: column; gap: var(--mp-spacing-5); text-align: left; }
.taxdoc-popover-head { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.taxdoc-popover-title {
  margin: 0;
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.taxdoc-popover-subtitle {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}
.taxdoc-popover-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-lg, 8px);
  overflow: hidden;
}
.taxdoc-popover-col-label { width: var(--mp-spacing-35, 140px); }
.taxdoc-popover-table th {
  height: var(--mp-sizes-7, 28px);
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  text-transform: uppercase;
  text-align: left;
  border-bottom: 1px solid var(--mp-border-default);
}
.taxdoc-popover-th { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); }
.taxdoc-popover-table td {
  height: var(--mp-sizes-10, 40px);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-4) var(--mp-spacing-1\.5) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
}
.taxdoc-popover-table tr:last-child td { border-bottom: none; }
.taxdoc-popover-footer { display: flex; justify-content: flex-end; }

/* Status cell: badge stacked above overdue sub-label */
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
  padding-left: var(--mp-spacing-1\.5);   /* align "n days" with the "O" of the Overdue badge */
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

/* Row action kebab button — transparent, 20px icon, 32x32px hit target */
.row-kebab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-8, 32px);
  height: var(--mp-sizes-8, 32px);
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--mp-radii-sm);
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

/* Status select */
/* All filters button — base pill look comes from .btn-enterprise--secondary
   (erp.css); only the asymmetric icon padding and the semibold weight differ. */
.filter-all-btn {
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3);
  font-weight: var(--mp-font-weights-semi-bold);
}
.filter-all-btn--active {
  background: var(--mp-background-selected, var(--mp-background-information)) !important;
  border-color: var(--mp-border-selected, var(--mp-border-information)) !important;
  color: var(--mp-text-selected, var(--mp-text-information));
}

/* Icon button group */
.filter-btn-group {
  display: flex;
  align-items: center;
}
/* icon buttons in the MpButtonGroup sit flush (0 gap) — rule/filter-bar-icon-group */
.filter-btn-group :deep(.mp-pixel-button-group) { gap: 0; }
.filter-airene-btn :deep(svg) { color: var(--mp-airene-default, #6938ef); }

.filter-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-9, 36px);
  height: var(--mp-sizes-9, 36px);
  padding: var(--mp-spacing-2);
  border: none;
  background: transparent;
  border-radius: var(--mp-radii-md);
  cursor: pointer;
  color: var(--mp-text-default);
}
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
.filter-icon-btn--airene { color: var(--mp-airene-default); }

/* Pill search */
/* full empty state — illustration + title + caption + secondary CTA */
.empty-full { display: flex; flex-direction: column; align-items: center; text-align: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-9) var(--mp-spacing-4); }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { font-size: var(--mp-font-sizes-lg, 1rem); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); margin-bottom: var(--mp-spacing-2); }

.filter-search {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  width: 248px;
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
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }

/* Bulk delete modal footer */
.modal-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }

/* ── Responsive stats (audit): keep the row horizontal on small screens and let
   it scroll/swipe instead of stacking (home stacks; index pages scroll). ── */
@media (max-width: 640px) {
  .stats-section { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .stat-card { flex: 0 0 auto; }
}
</style>
