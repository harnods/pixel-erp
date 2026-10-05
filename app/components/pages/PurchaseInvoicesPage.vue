<!-- prod-parity-aligned: jurnal-transaction-frontend/src/modules/purchase-invoices/views/panels/PurchaseInvoiceListPanel.vue -->
<script setup lang="ts">
import { type Ref } from 'vue'
import { formatIDR } from '~/utils/currency'
import {
  MpIcon, MpButton, MpButtonGroup, MpTooltip,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
  MpModal, MpModalContent, MpModalHeader, MpModalCloseButton, MpModalBody, MpModalFooter, MpModalOverlay, toast,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import { lastUpdatedFor } from '~/utils/lastUpdated'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ScenarioFab from '~/components/patterns/ScenarioFab.vue'
import ExportModal from '~/components/patterns/ExportModal.vue'
import CopyLinkDrawer from '~/components/patterns/CopyLinkDrawer.vue'
import ShareViaEmailModal from '~/components/patterns/ShareViaEmailModal.vue'
import SalesInvoiceFiltersDrawer, { emptySalesInvoiceFilters, type SalesInvoiceFiltersValue } from '~/components/patterns/SalesInvoiceFiltersDrawer.vue'
import type { AmountComparator } from '~/components/patterns/AmountComparatorField.vue'
import { infoToast } from '~/utils/toasts'
import { purchaseInvoices } from '~/data'
import { createdPurchaseInvoices } from '~/data/purchaseInvoices'
import type { PurchaseInvoice } from '~/data'

const { t } = useLocale()
const toggleAirene = inject<() => void>('toggleAirene')
const aireneOpen = inject<Ref<boolean>>('aireneOpen')

// ─── Column definitions ───────────────────────────────────────────────────────
const columns: TableColumn[] = [
  { key: 'date',       label: 'Date',       kind: 'date',                                 sortType: 'date'   },
  { key: 'number',     label: 'Number',     kind: 'number', sortable: true,                 sortType: 'text'   },
  { key: 'attachment', label: '',           width: '40px',  noHeader: true, align: 'center' },
  { key: 'vendorName', label: 'Vendor',     kind: 'name', sortable: true,                 sortType: 'text'   },
  { key: 'dueDate',    label: 'Due date',   kind: 'date',                                 sortType: 'date'   },
  { key: 'status',     label: 'Status',     kind: 'status',                                 sortType: 'text'   },
  { key: 'balanceDue', label: 'Balance due', kind: 'amount', align: 'right', sortable: true,  sortType: 'number' },
  { key: 'amount',     label: 'Total',      kind: 'amount', align: 'right', sortable: true,  sortType: 'number' },
  { key: 'tags',       label: 'Tags',       kind: 'tags'                                  },
]

// ─── Row type ─────────────────────────────────────────────────────────────────

type Row = PurchaseInvoice & {
  vendorName: string
  attachment: boolean
  overdueLabel: string | null
  /** Paid invoices owe nothing; open/overdue still owe the full total. */
  balanceDue: number
}

// ─── Flatten + enrich ─────────────────────────────────────────────────────────

// Prototype preview toggle (ScenarioFab, bottom-right): data vs empty-state view
const previewMode = ref<'data' | 'empty'>('data')

// Session-only bulk delete: hides rows without touching the seed (reports read it).
const deletedIds = ref(new Set<string>())

const rows = computed<Row[]>(() =>
  previewMode.value === 'empty'
    ? []
    : [...createdPurchaseInvoices, ...purchaseInvoices].filter(inv => !deletedIds.value.has(inv.id)).map(({ detail: _d, ...inv }: PurchaseInvoice & { detail?: unknown }) => {
    const overdueLabel = inv.status === 'overdue'
      ? (() => {
          const days = Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / 86_400_000)
          return days > 0 ? (days === 1 ? t('Overdue by 1 day') : `${t('Overdue by')} ${days} ${t('days')}`) : null
        })()
      : null

    return {
      ...inv,
      vendorName: inv.vendor.name,
      attachment: inv.hasAttachment ?? false,
      overdueLabel,
      balanceDue: inv.status === 'paid' ? 0 : inv.amount,
    }
  })
)

// ─── "All filters" drawer (prod FilterDrawer: Keywords, Transaction date, Due
// date, Status, Total, Tags) — ANDed with the toolbar Status select + search. ──
const filtersOpen = ref(false)
const appliedFilters = reactive<SalesInvoiceFiltersValue>(emptySalesInvoiceFilters())
const keywordColumns = [
  { key: 'number',     label: t('Number') },
  { key: 'vendorName', label: t('Vendor') },
  { key: 'tags',       label: t('Tags') },
]
const tagOptions = computed(() => [...new Set(purchaseInvoices.flatMap(inv => inv.tags ?? []))].sort())
function applyDrawerFilters(v: SalesInvoiceFiltersValue) {
  Object.assign(appliedFilters, v)
  toast.notify({ variant: 'success', title: t('Filters applied'), rootProps: { class: 'toast-enterprise' } })
}
function dayStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function matchesDateRange(iso: string, range: Date[] | null): boolean {
  if (!range) return true
  const ts = dayStart(new Date(iso)).getTime()
  return ts >= dayStart(range[0]!).getTime() && ts <= dayStart(range[1]!).getTime()
}
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
    const f = appliedFilters
    const kw = f.keyword.toLowerCase().trim()
    const rowTags = row.tags ?? []
    const matchesKeyword = !kw || (
      f.keywordColumn === 'all'
        ? row.number.toLowerCase().includes(kw) || row.vendorName.toLowerCase().includes(kw) || rowTags.some(tg => tg.toLowerCase().includes(kw))
        : f.keywordColumn === 'number' ? row.number.toLowerCase().includes(kw)
        : f.keywordColumn === 'vendorName' ? row.vendorName.toLowerCase().includes(kw)
        : rowTags.some(tg => tg.toLowerCase().includes(kw))
    )
    const matchesTags = f.tags.length === 0
      || (f.tagsComparator === 'isAnyOf' ? f.tags.some(tg => rowTags.includes(tg))
        : f.tagsComparator === 'isAllOf' ? f.tags.every(tg => rowTags.includes(tg))
        : f.tags.every(tg => !rowTags.includes(tg)))
    return (row.number.toLowerCase().includes(s) || row.vendorName.toLowerCase().includes(s))
      && (!status || row.status === status)
      && matchesKeyword
      && matchesDateRange(row.date, f.transactionDate)
      && matchesDateRange(row.dueDate, f.dueDate)
      && (f.status.length === 0 || f.status.includes(row.status))
      && matchesAmountFilter(row.amount, f.totalComparator, f.totalValue, f.totalMin, f.totalMax)
      && matchesTags
  },
})
watch(appliedFilters, () => setPage(1))
const activeFilterCount = computed(() => {
  const f = appliedFilters
  let n = 0
  if (f.keyword) n++
  if (f.transactionDate) n++
  if (f.dueDate) n++
  if (f.status.length > 0) n++
  if (f.totalValue !== '' || f.totalMin !== '' || f.totalMax !== '') n++
  if (f.tags.length > 0) n++
  return n
})

// ─── Filter options ───────────────────────────────────────────────────────────

// Prod order: Open, Overdue, Paid, Partially paid, Voided, Unpaid.
const statusOptions = [
  { label: t('All status'),     value: ''        },
  { label: t('Open'),           value: 'open'    },
  { label: t('Overdue'),        value: 'overdue' },
  { label: t('Paid'),           value: 'paid'    },
  { label: t('Partially paid'), value: 'partial' },
  { label: t('Voided'),         value: 'voided'  },
  { label: t('Unpaid'),         value: 'unpaid'  },
]
const drawerStatusOptions = statusOptions.slice(1)

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(iso))
}
// Number column matches Expenses/Sales: "{label} #{5-digit}".
function seqNo(num: string) {
  const last = String(num).split('-').pop() ?? num
  const n = parseInt(String(last).replace(/\D/g, ''), 10)
  return Number.isNaN(n) ? last : String(n).padStart(5, '0')
}


// Column show/hide (first column always on; Last updated appended, hidden by default)
const allCols: TableColumn[] = [...columns, { key: 'lastUpdated', label: 'Last updated', kind: 'date' }]
const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(allCols.map(c => [c.key, c.key !== 'lastUpdated'])))
const columnItems = allCols.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => allCols.filter(c => columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }

// ─── First-load skeleton (pagination skeleton is handled by ErpTablePage) ─────
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })

const emptyIllustration = '/illustrations/empty-folder.png'
function clearFilters() { search.value = ''; statusFilter.value = ''; Object.assign(appliedFilters, emptySalesInvoiceFilters()) }

// ─── Bulk delete (prod: Delete button in the selection bar + confirm modal) ───
const bulkDeleteOpen = ref(false)
const bulkDeleteIds = ref<string[]>([])
let bulkDeselect: (() => void) | null = null
function selectedFrom(sel: Set<number>): Row[] {
  return [...sel].map(i => (paginated.value as Row[])[i]).filter((r): r is Row => !!r)
}
function openBulkDelete(sel: Set<number>, deselectAll: () => void) {
  bulkDeleteIds.value = selectedFrom(sel).map(r => r.id)
  bulkDeselect = deselectAll
  bulkDeleteOpen.value = true
}
function confirmBulkDelete() {
  const n = bulkDeleteIds.value.length
  deletedIds.value = new Set([...deletedIds.value, ...bulkDeleteIds.value])
  toast.notify({ variant: 'success', title: n === 1 ? t('1 purchase invoice deleted') : `${n} ${t('purchase invoices deleted')}`, rootProps: { class: 'toast-enterprise' } })
  bulkDeselect?.()
  bulkDeleteOpen.value = false
}

// ─── Export / Copy link / Share via email (shared patterns) ────────────────────
const exportOpen = ref(false)
const copyOpen = ref(false)
const copyItems = ref<{ title: string; subtitle?: string; url: string }[]>([])
const shareOpen = ref(false)
const shareTitle = ref('')
const shareSubject = ref('')
const shareAttachment = ref('')
function recordLink(id: string) { return `https://mkrierp.id/${id}` }
function openExport() { exportOpen.value = true }
function openCopyLinks(rs: Row[]) {
  copyItems.value = rs.map(r => ({ title: `${t('Purchase Invoice')} #${r.number}`, subtitle: (r as any).vendorName ?? r.vendor?.name, url: recordLink(r.id) }))
  copyOpen.value = true
}
function openShare(r: Row) {
  shareTitle.value = `${t('Purchase Invoice')} #${r.number}`
  shareSubject.value = shareTitle.value
  shareAttachment.value = `PINV-${r.number}.pdf`
  shareOpen.value = true
}
// Prod export column list (PurchaseInvoiceListPanel exportColumns), same order.
const exportColumns = computed(() => [
  { key: 'date', label: t('Date') },
  { key: 'number', label: t('Number'), required: true },
  { key: 'vendor', label: t('Vendor') },
  { key: 'email', label: t('Email') },
  { key: 'dueDate', label: t('Due date') },
  { key: 'status', label: t('Status') },
  { key: 'balanceDue', label: t('Balance due') },
  { key: 'total', label: t('Total') },
  { key: 'tags', label: t('Tags') },
  { key: 'warehouse', label: t('Warehouse') },
  { key: 'referenceNo', label: t('Reference no.') },
  { key: 'paymentTerms', label: t('Payment terms') },
  { key: 'message', label: t('Message') },
  { key: 'memo', label: t('Memo') },
])
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
    :loading="loading"
    :search="search"
    :has-active-filter="!!search || !!statusFilter || activeFilterCount > 0"
    filter-empty-label="invoice"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
  >

    <!-- ── Bulk actions ── -->
    <template #bulk-actions="{ selectedRows, deselectAll }">
      <MpPopover id="pi-bulk-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
        <MpPopoverTrigger>
          <MpButton size="sm" variant="secondary" right-icon="chevrons-down" is-rounded>{{ t('Actions') }}</MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent class="erp-dropdown-menu">
          <MpPopoverList>
            <MpPopoverListItem @click="infoToast(t('Not in this prototype'))">{{ t('Pay with Mekari Pay') }}</MpPopoverListItem>
            <MpPopoverListItem @click="infoToast(t('Not in this prototype'))">{{ t('Print PDF') }}</MpPopoverListItem>
            <MpPopoverListItem @click="selectedFrom(selectedRows as Set<number>).length && openShare(selectedFrom(selectedRows as Set<number>)[0]!)">{{ t('Share via email') }}</MpPopoverListItem>
            <MpPopoverListItem @click="openCopyLinks(selectedFrom(selectedRows as Set<number>))">{{ t('Copy link') }}</MpPopoverListItem>
          </MpPopoverList>
          <div :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
          <MpPopoverList>
            <MpPopoverListItem @click="openBulkDelete(selectedRows as Set<number>, deselectAll)">{{ t('Delete') }}</MpPopoverListItem>
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
          <div class="stat-amount stat-amount--danger">Rp73.200.000,00</div>
          <a class="stat-link">{{ t('4 invoices') }}</a>
        </div>

        <!-- Card 2: Unpaid -->
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">{{ t('Open invoices') }}</div>
          <div class="stat-period">{{ t('As of today') }}</div>
          <div class="stat-amount">Rp602.150.000,00</div>
          <a class="stat-link">{{ t('12 invoices') }}</a>
        </div>

        <!-- Card 3: Payment made -->
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">{{ t('Payment sent') }}</div>
          <div class="stat-period">{{ t('Last 30 days') }}</div>
          <div class="stat-amount">Rp72.050.000,00</div>
          <a class="stat-link">{{ t('7 invoices') }}</a>
        </div>

        <!-- Card 4: Upcoming due — hidden when Airene panel is open -->
        <div v-if="!aireneOpen" class="stat-card">
          <div class="stat-title">{{ t('Due this week') }}</div>
          <div class="stat-period">{{ t('Next 7 days') }}</div>
          <div class="stat-amount">Rp245.000.000,00</div>
          <a class="stat-link">{{ t('5 invoices') }}</a>
        </div>

      </div>
    </template>

    <!-- ── Filter bar ── -->
    <template #filters>
      <!-- Left: Status select + All filters -->
      <div class="filter-left">
        <ErpFilterSelect id="pi-status" v-model="statusFilter" :placeholder="t('Status')" :options="statusOptions.slice(1)" />

        <MpButton variant="secondary" left-icon="filter" is-rounded class="filter-all-btn" @click="filtersOpen = true">{{ t('All filters') }}{{ activeFilterCount > 0 ? ` (${activeFilterCount})` : '' }}</MpButton>
      </div>

      <!-- Right: icon buttons + search -->
      <div class="filter-right">
        <MpButtonGroup class="filter-btn-group">
          <MpTooltip :label="t('Ask Airene')" placement="bottom">
            <MpButton class="filter-airene-btn" variant="ghost" left-icon="airene-brand" :aria-label="t('Ask Airene')" is-rounded @click="toggleAirene?.()" />
          </MpTooltip>
          <ColumnSettingsMenu id="tt-columns" :items="columnItems" :visibility="columnVisibility" />
          <MpTooltip :label="t('Export')" placement="bottom">
            <MpButton variant="ghost" left-icon="download" :aria-label="t('Export')" is-rounded @click="openExport" />
          </MpTooltip>
        </MpButtonGroup>

        <!-- Pill search -->
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

    <!-- ── Cell: Number (matches Expenses/Sales: "{label} #{5-digit}") ── -->
    <template #cell-number="{ row, value }">
      <span class="cell-link cell-text cell-number" @click.stop="navigateTo(`/purchase-invoices/${(row as Row).id}`)">{{ t('Purchase Invoice') }} #{{ seqNo(value as string) }}</span>
    </template>

    <!-- ── Cell: Attachment icon ── -->
    <template #cell-attachment="{ value }">
      <MpIcon v-if="value" name="attachment" size="sm" class="attachment-icon" />
      <span v-else />
    </template>

    <!-- ── Cell: Vendor ── -->
    <template #cell-vendorName="{ value }">
      <span class="cell-link cell-text" @click.stop>{{ value }}</span>
    </template>

    <!-- ── Cell: Due Date ── -->
    <template #cell-dueDate="{ value }">
      {{ formatDate(value as string) }}
    </template>

    <!-- ── Cell: Status ── -->
    <template #cell-status="{ row, value }">
      <div class="status-cell">
        <ErpStatusBadge :status="value as string" />
        <span v-if="(row as Row).overdueLabel" class="status-sub-label">
          {{ (row as Row).overdueLabel }}
        </span>
      </div>
    </template>

    <!-- ── Cell: Amount ── -->
    <template #cell-balanceDue="{ value }">
      {{ formatIDR(value as number) }}
    </template>

    <template #cell-amount="{ value }">
      {{ formatIDR(value as number) }}
    </template>

    <!-- ── Cell: Tags ── -->
    <template #cell-tags="{ value }">
      <div v-if="(value as string[])?.length" class="tags-cell">
        <span v-for="tag in (value as string[])" :key="tag" class="erp-tag">{{ tag }}</span>
      </div>
    </template>

    <!-- ── Actions — kebab → MpPopover dropdown (View details first; share-via
         group separated by a divider) ── -->
    <template #actions="{ row }">
      <MpPopover :id="`pi-actions-${(row as Row).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="navigateTo(`/purchase-invoices/${(row as Row).id}`)">{{ t('View details') }}</MpPopoverListItem>
            <MpPopoverListItem @click="infoToast(t('Not in this prototype'))">{{ t('Duplicate') }}</MpPopoverListItem>
          </MpPopoverList>
          <div :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
          <MpPopoverList>
            <MpPopoverListItem @click="infoToast(t('Not in this prototype'))">{{ t('Share via WhatsApp') }}</MpPopoverListItem>
            <MpPopoverListItem @click="openShare(row as Row)">{{ t('Share via email') }}</MpPopoverListItem>
            <MpPopoverListItem @click="openCopyLinks([row as Row])">{{ t('Copy link') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <template #cell-lastUpdated="{ row }">
      <LastUpdatedCell v-bind="lastUpdatedFor((row as Record<string, unknown>).id as string)" />
    </template>

    <!-- ── Full empty state (no purchase invoices yet) ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('No purchase invoices') }}</p>
        <p class="empty-full-desc">{{ t('Purchase invoices will appear here.') }}</p>
        <MpButton variant="secondary" left-icon="add" is-rounded @click="navigateTo('/purchase-invoices/new')">{{ t('New purchase invoice') }}</MpButton>
      </div>
    </template>
  </ErpTablePage>

  <!-- ── Export / Copy link / Share via email (shared patterns) ── -->
  <ExportModal :open="exportOpen" :title="t('Export purchase invoices')" entity-label="purchase invoices" :columns="exportColumns" :custom-fields="[t('Sample custom field 1'), t('Sample custom field 2')]" :total="total" @close="exportOpen = false" @export="exportOpen = false" />
  <CopyLinkDrawer :open="copyOpen" :items="copyItems" @close="copyOpen = false" @download-csv="copyOpen = false" />
  <ShareViaEmailModal :open="shareOpen" :title="shareTitle" :subject="shareSubject" :attachment-name="shareAttachment" :attachment-size-k-b="128" sender-email="rizal.candra@centralperk.co.id" @close="shareOpen = false" @send="shareOpen = false" />

  <SalesInvoiceFiltersDrawer
    id="pi-allfilters"
    :is-open="filtersOpen"
    :model-value="appliedFilters"
    :columns="keywordColumns"
    :status-options="drawerStatusOptions"
    :tag-options="tagOptions"
    :djp-status-options="[]"
    @update:is-open="filtersOpen = $event"
    @apply="applyDrawerFilters"
  />

  <MpModal id="pi-bulk-delete-modal" :is-open="bulkDeleteOpen" size="md" :is-keep-alive="false" :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="bulkDeleteOpen = false">
    <MpModalContent>
      <MpModalHeader>
        {{ bulkDeleteIds.length === 1 ? t('Delete purchase invoice?') : t('Delete purchase invoices?') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        {{ bulkDeleteIds.length === 1 ? t('Deleted purchase invoice cannot be restored.') : `${t('Deleted')} ${bulkDeleteIds.length} ${t('purchase invoices cannot be restored.')}` }}
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup class="erp-action-footer">
          <MpButton variant="ghost" is-rounded @click="bulkDeleteOpen = false">{{ t('Cancel') }}</MpButton>
          <MpButton variant="danger" is-rounded @click="confirmBulkDelete">{{ t('Delete') }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

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

/* ── Full empty state (mirrors the Expenses index) ──────────────────────── */
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

.cell-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.cell-number { color: var(--mp-text-default); }

/* Attachment icon */
.attachment-icon {
  color: var(--mp-text-subtle);
}

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

.filter-select-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 160px;
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
}

.filter-select {
  appearance: none;
  background: transparent;
  border: none;
  outline: none;
  width: 100%;
  padding: var(--mp-spacing-2) var(--mp-spacing-10) var(--mp-spacing-2) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-placeholder);
  cursor: pointer;
}

.filter-select:focus { outline: none; }

.filter-select-chevron {
  position: absolute;
  right: var(--mp-spacing-2);
  pointer-events: none;
  color: var(--mp-text-default);
  width: var(--mp-sizes-5, 20px);
  height: var(--mp-sizes-5, 20px);
}

/* All filters button — base pill look comes from .btn-enterprise--secondary
   (erp.css); only the asymmetric icon padding and the semibold weight differ. */
.filter-all-btn {
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3);
  font-weight: var(--mp-font-weights-semi-bold);
}

.filter-btn-group {
  display: flex;
  align-items: center;
}
/* icon tools sit 8px apart (MpButtonGroup default) — rule/btn-group-gap-8 */
.filter-btn-group :deep(.mp-pixel-button-group) { gap: var(--mp-spacing-2); }
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

/* ── Responsive stats (audit): keep the row horizontal on small screens and let
   it scroll/swipe instead of stacking (home stacks; index pages scroll). ── */
@media (max-width: 640px) {
  .stats-section { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .stat-card { flex: 0 0 auto; }
}
</style>
