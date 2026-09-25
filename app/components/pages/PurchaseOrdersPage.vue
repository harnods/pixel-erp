<!--
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Mekari ERP — Purchase Orders Index
  Source: Chat description
  Token mode: Pixel 2.4
  Patterns used: index-view, ErpTablePage, page-tabs (shell)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  STATES INCLUDED:
    - Happy path (all tabs)
    - Empty state: illustrated placeholder via PlaceholderPage fallback
    - Tabs: all (open/partially-processed/closed), awaiting approval (draft), rejected

  TAB FILTERING:
    Tab value is provided from index.vue shell as 'purchaseOrdersTab'.
    'all'      → status in [open, partially-processed, closed]
    'awaiting' → status = draft
    'rejected' → status = rejected
-->
<script setup lang="ts">
import { type Ref } from 'vue'
import { formatIDR } from '~/utils/currency'
import {
  MpIcon, MpButton, MpButtonGroup, MpTooltip,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css, toast,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ScenarioFab from '~/components/patterns/ScenarioFab.vue'
import ExportModal from '~/components/patterns/ExportModal.vue'
import CopyLinkDrawer from '~/components/patterns/CopyLinkDrawer.vue'
import ShareViaEmailModal from '~/components/patterns/ShareViaEmailModal.vue'
import { infoToast } from '~/utils/toasts'
import { purchaseOrders } from '~/data'
import type { PurchaseOrder } from '~/data'

const { t } = useLocale()
const toggleAirene           = inject<() => void>('toggleAirene')
const activeTab              = inject<Ref<string>>('purchaseOrdersTab')
const openPurchaseOrder      = inject<(id: string) => void>('openPurchaseOrder')
const duplicatePurchaseOrder = inject<(id: string) => void>('duplicatePurchaseOrder')

// ─── Column definitions (date/number widths match the Expenses index) ─────────
const columns: TableColumn[] = [
  { key: 'date',       label: 'Date',        kind: 'date',   sortType: 'date'                },
  { key: 'number',     label: 'Number',      kind: 'number', sortable: true, sortType: 'text' },
  { key: 'attachment', label: '',            width: '40px',  noHeader: true, align: 'center' },
  { key: 'vendorName', label: 'Vendor',      kind: 'name',   sortable: true                  },
  { key: 'dueDate',    label: 'Due date',    kind: 'date'                                    },
  { key: 'status',     label: 'Status',      kind: 'status'                                  },
  { key: 'balance',    label: 'Balance due', kind: 'amount', align: 'right', sortable: true  },
  { key: 'total',      label: 'Total',       kind: 'amount', align: 'right', sortable: true  },
  { key: 'tags',       label: 'Tags',        kind: 'tags'                                    },
]
// Column show/hide (first column always on).
const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(columns.map(c => [c.key, true])))
const columnItems = columns.filter(c => !c.noHeader).map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => columns.filter(c => columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }

// ─── Tab → status set mapping ─────────────────────────────────────────────────
const TAB_STATUSES: Record<string, string[]> = {
  all:      ['open', 'partially-processed', 'awaiting invoice', 'closed', 'voided'],
  awaiting: ['draft'],
  rejected: ['rejected'],
}

// ─── Flatten rows ─────────────────────────────────────────────────────────────
type Row = PurchaseOrder & { vendorName: string; attachment: boolean; fulfillment: boolean }

// Prototype preview toggle (ScenarioFab, bottom-right): data vs empty-state view
const previewMode = ref<'data' | 'empty'>('data')

const rows = computed<Row[]>(() =>
  previewMode.value === 'empty'
    ? []
    : purchaseOrders.map(po => ({
        ...po,
        vendorName: po.vendor.name,
        attachment: po.hasAttachment ?? false,
        fulfillment: po.sentToFulfillment ?? false,
      }))
)

// ─── Table state ──────────────────────────────────────────────────────────────
// `statusFilter` is the in-bar Status pick; the active tab is read directly from
// the injected `purchaseOrdersTab` (tracked reactively inside the filter).
const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort,
} = useTableState(rows, {
  filterFn: (row: Row, s, status) => {
    const allowed = TAB_STATUSES[activeTab?.value ?? 'all'] ?? TAB_STATUSES.all
    const matchesTab    = allowed.includes(row.status)
    const matchesStatus = !status || row.status === status
    const matchesSearch = !s || row.number.toLowerCase().includes(s) || row.vendorName.toLowerCase().includes(s)
    return matchesTab && matchesStatus && matchesSearch
  },
})

// ─── Status filter (in the toolbar) — options for the "All" view ──────────────
const statusOptions = [
  { label: 'Open',                value: 'open'                },
  { label: 'Partially processed', value: 'partially-processed' },
  { label: 'Awaiting invoice',    value: 'awaiting invoice'    },
  { label: 'Closed',              value: 'closed'              },
  { label: 'Voided',              value: 'voided'              },
]
// Reset any status pick when the tab changes (awaiting/rejected have their own set).
watch(() => activeTab?.value, () => { statusFilter.value = '' })

// ─── Row actions ──────────────────────────────────────────────────────────────
function markCompleted(id: string) {
  const o = purchaseOrders.find(x => x.id === id)
  if (o) { o.status = 'closed'; o.balance = 0 }
  toast.notify({ variant: 'success', title: 'Purchase order marked as completed' })
}

// ─── Formatters ───────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(iso))
}
// Number column matches Expenses/Sales: "{label} #{5-digit}" — derive the running
// number from the last segment of the stored id (e.g. "PO-2026-0001" → "00001").
function seqNo(num: string) {
  const last = String(num).split('-').pop() ?? num
  const n = parseInt(String(last).replace(/\D/g, ''), 10)
  return Number.isNaN(n) ? last : String(n).padStart(5, '0')
}

// ─── First-load skeleton (pagination skeleton is handled by ErpTablePage) ─────
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })

const emptyIllustration = '/illustrations/empty-folder.png'
function clearFilters() { search.value = ''; statusFilter.value = '' }

// ─── Bulk selection helper ──────────────────────────────────────────────────
function bulkSelected(selectedRows: Set<number>): Row[] {
  return [...selectedRows].map(i => paginated.value[i] as Row).filter(Boolean)
}

// ─── Export / Copy link / Share via email (shared patterns) ─────────────────
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
  copyItems.value = rs.map(r => ({ title: `${t('Purchase Order')} #${r.number}`, subtitle: (r as any).vendorName ?? r.vendor?.name, url: recordLink(r.id) }))
  copyOpen.value = true
}
function openShare(r: Row) {
  shareTitle.value = `${t('Purchase Order')} #${r.number}`
  shareSubject.value = shareTitle.value
  shareAttachment.value = `PO-${r.number}.pdf`
  shareOpen.value = true
}
const exportColumns = computed(() => [
  ...columns
    .filter(c => c.label && !c.noHeader)
    .map(c => ({ key: c.key, label: c.label, ...(c.key === 'number' ? { required: true } : {}) })),
  { key: 'warehouse', label: t('Warehouse') },
  { key: 'referenceNo', label: t('Reference no.') },
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
    :has-active-filter="!!search || !!statusFilter"
    filter-empty-label="purchase order"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
  >

    <!-- ── Bulk actions ── -->
    <template #bulk-actions="{ selectedRows }">
      <!-- Bulk bar = single secondary-sm "Actions" dropdown (never primary); no Delete (rule/bulk-actions-no-delete) -->
      <MpPopover id="po-bulk-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
        <MpPopoverTrigger>
          <MpButton size="sm" variant="secondary" right-icon="chevrons-down" is-rounded>{{ t('Actions') }}</MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent class="erp-dropdown-menu">
          <MpPopoverList>
            <MpPopoverListItem>{{ t('Print PDF') }}</MpPopoverListItem>
            <MpPopoverListItem @click="bulkSelected(selectedRows as Set<number>).length && openShare(bulkSelected(selectedRows as Set<number>)[0]!)">{{ t('Share via email') }}</MpPopoverListItem>
            <MpPopoverListItem @click="openCopyLinks(bulkSelected(selectedRows as Set<number>).slice(0, 5))">{{ t('Copy link') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ═════ Filter toolbar (mirrors the Sales index) ═════ -->
    <template #filters>
      <div class="filter-left">
        <ErpFilterSelect id="po-status" v-model="statusFilter" :placeholder="t('Status')" :options="statusOptions" />

        <MpButton variant="secondary" left-icon="filter" is-rounded class="filter-all-btn">{{ t('All filters') }}</MpButton>
      </div>

      <div class="filter-right">
        <!-- Icon tools = ghost icon MpButtons in one MpButtonGroup + tooltips (rule/filter-bar-icon-group) -->
        <MpButtonGroup class="filter-btn-group">
          <MpTooltip :label="t('Ask Airene')" placement="bottom">
            <MpButton class="filter-airene-btn" variant="ghost" left-icon="airene-brand" :aria-label="t('Ask Airene')" is-rounded @click="toggleAirene?.()" />
          </MpTooltip>
          <ColumnSettingsMenu id="po-tt-columns" :items="columnItems" :visibility="columnVisibility" />
          <MpTooltip :label="t('Export')" placement="bottom">
            <MpButton variant="ghost" left-icon="download" :aria-label="t('Export')" is-rounded @click="openExport" />
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
          <MpButton v-if="search" class="search-clear-btn" variant="ghost" type="button" :aria-label="t('Clear search')" left-icon="close" @click="search = ''" />
        </div>
      </div>
    </template>

    <!-- ═════ Cell: Date ═════ -->
    <template #cell-date="{ value }">
      {{ formatDate(value as string) }}
    </template>

    <!-- ═════ Cell: Number (matches Expenses/Sales: "{label} #{5-digit}") ═════ -->
    <template #cell-number="{ row, value }">
      <span class="cell-link cell-text cell-number" @click.stop="openPurchaseOrder?.((row as Row).id)">{{ t('Purchase order') }} #{{ seqNo(value as string) }}</span>
    </template>

    <!-- ═════ Cell: Attachment ═════ -->
    <template #cell-attachment="{ row, value }">
      <div class="icon-col">
        <MpIcon v-if="(row as Row).fulfillment" name="truck" size="sm" class="fulfillment-icon" :aria-label="t('Sent to fulfillment')" />
        <MpIcon v-if="value" name="attachment" size="sm" class="attachment-icon" />
      </div>
    </template>

    <!-- ═════ Cell: Vendor ═════ -->
    <template #cell-vendorName="{ value }">
      <span class="cell-text">{{ value }}</span>
    </template>

    <!-- ═════ Cell: Due date ═════ -->
    <template #cell-dueDate="{ value }">
      {{ formatDate(value as string) }}
    </template>

    <!-- ═════ Cell: Status ═════ -->
    <template #cell-status="{ value }">
      <ErpStatusBadge :status="value as string" />
    </template>

    <!-- ═════ Cell: Balance due ═════ -->
    <template #cell-balance="{ value }">
      {{ formatIDR(value as number) }}
    </template>

    <!-- ═════ Cell: Total ═════ -->
    <template #cell-total="{ value }">
      {{ formatIDR(value as number) }}
    </template>

    <!-- ═════ Cell: Tags ═════ -->
    <template #cell-tags="{ value }">
      <div v-if="(value as string[])?.length" class="tags-cell">
        <span v-for="tag in (value as string[])" :key="tag" class="erp-tag">{{ tag }}</span>
      </div>
    </template>

    <!-- ═════ Row actions ═════ -->
    <template #actions="{ row }">
      <MpPopover :id="`po-row-actions-${(row as Row).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="openPurchaseOrder?.((row as Row).id)">{{ t('View details') }}</MpPopoverListItem>
            <MpPopoverListItem @click="infoToast('Create purchase delivery — coming soon')">{{ t('Create purchase delivery') }}</MpPopoverListItem>
            <MpPopoverListItem @click="infoToast('Create purchase invoice — coming soon')">{{ t('Create purchase invoice') }}</MpPopoverListItem>
            <MpPopoverListItem @click="markCompleted((row as Row).id)">{{ t('Mark as completed') }}</MpPopoverListItem>
            <MpPopoverListItem @click="duplicatePurchaseOrder?.((row as Row).id)">{{ t('Duplicate') }}</MpPopoverListItem>
            <div role="separator" style="height:1px;margin:4px 0;background:var(--mp-border-default);" />
            <MpPopoverListItem @click="infoToast('Share via WhatsApp — coming soon')">{{ t('Share via WhatsApp') }}</MpPopoverListItem>
            <MpPopoverListItem @click="openShare(row as Row)">{{ t('Share via email') }}</MpPopoverListItem>
            <MpPopoverListItem @click="openCopyLinks([row as Row])">{{ t('Copy link') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ═════ Full empty state (no purchase orders yet) ═════ -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('No purchase orders') }}</p>
        <p class="empty-full-desc">{{ t('Purchase orders will appear here.') }}</p>
      </div>
    </template>

  </ErpTablePage>

  <!-- ── Export / Copy link / Share via email (shared patterns) ── -->
  <ExportModal :open="exportOpen" :title="t('Export purchase orders')" entity-label="purchase orders" :columns="exportColumns" :custom-fields="[t('Sample custom field 1'), t('Sample custom field 2')]" :total="total" @close="exportOpen = false" @export="exportOpen = false" />
  <CopyLinkDrawer :open="copyOpen" :items="copyItems" @close="copyOpen = false" @download-csv="copyOpen = false" />
  <ShareViaEmailModal :open="shareOpen" :title="shareTitle" :subject="shareSubject" :attachment-name="shareAttachment" :attachment-size-k-b="128" sender-email="rizal.candra@centralperk.co.id" @close="shareOpen = false" @send="shareOpen = false" />

  <!-- ── Prototype scenario FAB (bottom-right): toggle data vs empty-state view ── -->
  <ScenarioFab v-model="previewMode" />
</template>

<style scoped>

.cell-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.cell-link {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-size: inherit;
  color: var(--mp-text-link, #4b61dc);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  text-align: left;
}
.cell-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.cell-number { color: var(--mp-text-default); }

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

.icon-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--mp-spacing-0\.5, 2px);
}

.attachment-icon {
  color: var(--mp-text-subtle);
}

.fulfillment-icon {
  color: var(--mp-icon-brand, #029861);
}

.tags-cell {
  display: flex;
  gap: var(--mp-spacing-1);
  flex-wrap: wrap;
}

.erp-tag {
  display: inline-flex;
  align-items: center;
  background: var(--mp-background-neutral-subtle, #f0f1f3);
  color: var(--mp-text-secondary, #656f80);
  font-size: var(--mp-font-sizes-md, 14px);
  padding: 0 6px;
  max-height: 20px;
  border-radius: var(--mp-radii-sm, 4px);
  white-space: nowrap;
}

.row-kebab {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--mp-radii-sm, 4px);
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
  gap: var(--mp-spacing-4, 16px);
}

.filter-right {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3, 12px);
}

.filter-all-btn {
  display: inline-flex !important;
  align-items: center;
  gap: var(--mp-spacing-2, 8px);
  width: auto !important;
  height: auto !important;
  min-width: 0 !important;
  padding: var(--mp-spacing-2, 8px) var(--mp-spacing-4, 16px) var(--mp-spacing-2, 8px) var(--mp-spacing-3, 12px) !important;
  background: var(--mp-background-neutral, #ffffff) !important;
  border: 1px solid var(--mp-border-bold, #758195) !important;
  border-radius: 999px !important;
  font-size: var(--mp-font-sizes-md, 14px);
  font-weight: var(--mp-font-weights-semi-bold, 600);
  line-height: var(--mp-line-heights-md, 20px);
  color: var(--mp-text-secondary, #656f80);
  cursor: pointer;
  white-space: nowrap;
}
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered, #f0f1f3); }

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
  padding: var(--mp-spacing-2, 8px) !important;
  border: none !important;
  background: transparent !important;
  border-radius: var(--mp-radii-md, 6px);
  cursor: pointer;
  color: var(--mp-text-default, #272b32);
}
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered, #f0f1f3); }
.filter-icon-btn--airene { color: var(--mp-airene-default, #651FFF); }

.filter-search {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2, 8px);
  width: 248px;
  padding: 8px 12px;
  background: var(--mp-background-neutral, #ffffff);
  border: 1px solid rgba(29, 31, 36, 0.16);
  border-radius: 999px;
  color: var(--mp-text-subtle, #8690a2);
}

.filter-search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: var(--mp-font-sizes-md, 14px);
  line-height: var(--mp-line-heights-md, 20px);
  color: var(--mp-text-default, #272b32);
  min-width: 0;
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder, #8690a2); }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }
</style>
