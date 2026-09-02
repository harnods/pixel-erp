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
  MpIcon, MpButton, MpSelect, MpTooltip,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css, toast,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import { infoToast } from '~/utils/toasts'
import { purchaseOrders } from '~/data'
import type { PurchaseOrder } from '~/data'

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

const rows = computed<Row[]>(() =>
  purchaseOrders.map(po => ({
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
const statusLabel = computed(() => statusOptions.find(o => o.value === statusFilter.value)?.label ?? '')
// Reset any status pick when the tab changes (awaiting/rejected have their own set).
watch(() => activeTab?.value, () => { statusFilter.value = '' })

// ─── Row actions ──────────────────────────────────────────────────────────────
function markCompleted(id: string) {
  const o = purchaseOrders.find(x => x.id === id)
  if (o) { o.status = 'closed'; o.balance = 0 }
  toast.notify({ variant: 'success', title: 'Purchase order marked as completed' })
}
function copyLink(id: string) {
  const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/purchase-orders/${id}`
  navigator.clipboard?.writeText(url)
  toast.notify({ variant: 'success', title: 'Link copied' })
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

    <!-- ═════ Filter toolbar (mirrors the Expenses index) ═════ -->
    <template #filters>
      <div class="filter-left">
        <MpPopover id="po-status-filter" is-close-on-select>
          <MpPopoverTrigger>
            <MpSelect
              id="po-status-select"
              placeholder="Status"
              :model-value="statusFilter"
              is-clearable
              :class="css({ width: '160px' })"
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
        <MpButton class="filter-all-btn">
          <MpIcon name="filter" size="sm" />
          All filters
        </MpButton>
      </div>

      <div class="filter-right">
        <div class="filter-btn-group">
          <!-- Airene -->
          <MpTooltip id="po-tt-airene" label="Ask Airene" placement="bottom" use-portal>
            <button class="filter-icon-btn filter-icon-btn--airene" type="button" aria-label="Ask Airene" @click="toggleAirene?.()">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
              </svg>
            </button>
          </MpTooltip>
          <!-- Column settings -->
          <ColumnSettingsMenu id="po-tt-columns" :items="columnItems" :visibility="columnVisibility" />
          <!-- Export -->
          <MpTooltip id="po-tt-export" label="Export" placement="bottom" use-portal>
            <button class="filter-icon-btn" type="button" aria-label="Export" @click="infoToast('Export — coming soon')">
              <MpIcon name="download" size="md" />
            </button>
          </MpTooltip>
        </div>
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

    <!-- ═════ Cell: Date ═════ -->
    <template #cell-date="{ value }">
      {{ formatDate(value as string) }}
    </template>

    <!-- ═════ Cell: Number (matches Expenses/Sales: "{label} #{5-digit}") ═════ -->
    <template #cell-number="{ row, value }">
      <a class="cell-link cell-text cell-number" @click.stop="openPurchaseOrder?.((row as Row).id)">Purchase order #{{ seqNo(value as string) }}</a>
    </template>

    <!-- ═════ Cell: Attachment ═════ -->
    <template #cell-attachment="{ row, value }">
      <div class="icon-col">
        <svg v-if="(row as Row).fulfillment" class="fulfillment-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-label="Sent to fulfillment">
          <path d="M3 16V6a1 1 0 011-1h9a1 1 0 011 1v10M3 16h11M3 16H1.5M14 16h3.5l3-4v-3a1 1 0 00-1-1h-5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="7" cy="18.5" r="1.75" stroke="currentColor" stroke-width="1.5"/>
          <circle cx="17" cy="18.5" r="1.75" stroke="currentColor" stroke-width="1.5"/>
        </svg>
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
          <button class="row-kebab" aria-label="More actions">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="openPurchaseOrder?.((row as Row).id)">View details</MpPopoverListItem>
            <MpPopoverListItem @click="infoToast('Create purchase delivery — coming soon')">Create purchase delivery</MpPopoverListItem>
            <MpPopoverListItem @click="infoToast('Create purchase invoice — coming soon')">Create purchase invoice</MpPopoverListItem>
            <MpPopoverListItem @click="markCompleted((row as Row).id)">Mark as completed</MpPopoverListItem>
            <MpPopoverListItem @click="duplicatePurchaseOrder?.((row as Row).id)">Duplicate</MpPopoverListItem>
            <div role="separator" style="height:1px;margin:4px 0;background:var(--mp-border-default);" />
            <MpPopoverListItem @click="infoToast('Share via WhatsApp — coming soon')">Share via WhatsApp</MpPopoverListItem>
            <MpPopoverListItem @click="infoToast('Share via email — coming soon')">Share via email</MpPopoverListItem>
            <MpPopoverListItem @click="copyLink((row as Row).id)">Copy link</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ═════ Full empty state (no purchase orders yet) ═════ -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">No purchase orders</p>
        <p class="empty-full-desc">Purchase orders will appear here.</p>
      </div>
    </template>

  </ErpTablePage>
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

/* Status MpSelect: keep the root at the control width (160px) so the chevron
   stays INSIDE the box, not floating out to the right. */
.filter-left :deep(.mp-select__root) { width: 160px; flex: 0 0 auto; }

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
</style>
