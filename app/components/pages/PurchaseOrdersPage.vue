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
import { MpIcon, MpButton, MpSelect } from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { purchaseOrders } from '~/data'
import type { PurchaseOrder } from '~/data'

const toggleAirene       = inject<() => void>('toggleAirene')
const aireneOpen         = inject<Ref<boolean>>('aireneOpen')
const activeTab          = inject<Ref<string>>('purchaseOrdersTab')
const openPurchaseOrder  = inject<(id: string) => void>('openPurchaseOrder')

// ─── Column definitions ───────────────────────────────────────────────────────
const columns: TableColumn[] = [
  { key: 'date',       label: 'Date',        width: '120px'                                  },
  { key: 'number',     label: 'Number',      width: '200px', sortable: true                  },
  { key: 'attachment', label: '',            width: '40px',  noHeader: true, align: 'center' },
  { key: 'vendorName', label: 'Vendor',      width: '240px', sortable: true                  },
  { key: 'dueDate',    label: 'Due date',    width: '108px'                                  },
  { key: 'status',     label: 'Status',      width: '160px'                                  },
  { key: 'balance',    label: 'Balance due', width: '160px', align: 'right', sortable: true  },
  { key: 'total',      label: 'Total',       width: '160px', align: 'right', sortable: true  },
  { key: 'tags',       label: 'Tags',        width: '160px'                                  },
]

// ─── Tab → status set mapping ─────────────────────────────────────────────────
const TAB_STATUSES: Record<string, string[]> = {
  all:      ['open', 'partially-processed', 'closed'],
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
const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort,
} = useTableState(rows, {
  filterFn: (row: Row, s, tabFilter) => {
    const allowed = TAB_STATUSES[tabFilter] ?? TAB_STATUSES.all
    const matchesTab    = allowed.includes(row.status)
    const matchesSearch = !s || row.number.toLowerCase().includes(s) || row.vendorName.toLowerCase().includes(s)
    return matchesTab && matchesSearch
  },
})

// Sync tab → statusFilter
watch(
  () => activeTab?.value ?? 'all',
  (tab) => { statusFilter.value = tab },
  { immediate: true },
)

// ─── Status dropdown (within-tab secondary filter) ────────────────────────────
// Not used for tab switching — kept as a future hook
const statusOptions = computed(() => {
  const tab = activeTab?.value ?? 'all'
  if (tab === 'all') return [
    { label: 'All status',            value: 'all' },
    { label: 'Open',                  value: 'all' },
    { label: 'Partially processed',   value: 'all' },
    { label: 'Closed',                value: 'all' },
  ]
  return []
})

// ─── Formatters ───────────────────────────────────────────────────────────────
function formatIDR(amount: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', minimumFractionDigits: 2,
  }).format(amount)
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(iso))
}

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
    has-checkbox
    has-ai-chat
    :context-label="(row) => `Purchase Order · ${row.number}`"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
  >

    <!-- ═════ Filter toolbar ═════ -->
    <template #filters>
      <div class="filter-left">
        <div class="filter-select-wrap">
          <MpSelect class="filter-select">
            <option value="">Status</option>
          </MpSelect>
          <svg class="filter-select-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <MpButton class="filter-all-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 6h18M7 12h10M11 18h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          All filters
        </MpButton>
      </div>

      <div class="filter-right">
        <div class="filter-btn-group">
          <MpButton class="filter-icon-btn filter-icon-btn--airene" aria-label="Ask Airene" @click="toggleAirene?.()">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
              <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
            </svg>
          </MpButton>
          <button class="filter-icon-btn" aria-label="Column settings">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path fill-rule="evenodd" clip-rule="evenodd" d="M6.97345 1.26335C7.1777 1.25434 7.38659 1.25 7.6 1.25H12.4C12.6134 1.25 12.8223 1.25434 13.0265 1.26335C13.0315 1.26352 13.0365 1.26374 13.0415 1.26401C14.8152 1.34425 16.2378 1.77715 17.2303 2.76967C18.3398 3.87914 18.75 5.52603 18.75 7.6V12.4C18.75 14.474 18.3398 16.1209 17.2303 17.2303C16.2378 18.2229 14.8152 18.6558 13.0415 18.736C13.0365 18.7363 13.0316 18.7365 13.0266 18.7367C12.8223 18.7457 12.6134 18.75 12.4 18.75H7.6C7.38658 18.75 7.17769 18.7457 6.97344 18.7367C6.96845 18.7365 6.96347 18.7363 6.95851 18.736C5.1848 18.6557 3.76219 18.2228 2.76967 17.2303C1.6602 16.1209 1.25 14.474 1.25 12.4V7.6C1.25 5.52603 1.6602 3.87914 2.76967 2.76967C3.76219 1.77715 5.18479 1.34425 6.9585 1.26401C6.96347 1.26374 6.96845 1.26352 6.97345 1.26335ZM6.25 2.82736C5.10607 2.97282 4.34147 3.31919 3.83033 3.83033C3.1398 4.52086 2.75 5.67397 2.75 7.6V12.4C2.75 14.326 3.1398 15.4791 3.83033 16.1697C4.34147 16.6808 5.10607 17.0272 6.25 17.1726V2.82736ZM7.75 17.25V2.75H12.25V17.25H7.75ZM13.75 17.1726C14.8939 17.0272 15.6585 16.6808 16.1697 16.1697C16.8602 15.4791 17.25 14.326 17.25 12.4V7.6C17.25 5.67397 16.8602 4.52086 16.1697 3.83033C15.6585 3.31919 14.8939 2.97282 13.75 2.82736V17.1726Z" fill="currentColor"/>
            </svg>
          </button>
          <button class="filter-icon-btn" aria-label="Export">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path fill-rule="evenodd" clip-rule="evenodd" d="M9.46959 1.46967C9.76249 1.17678 10.2374 1.17678 10.5303 1.46967L13.2103 4.14967C13.5031 4.44256 13.5031 4.91744 13.2103 5.21033C12.9174 5.50322 12.4425 5.50322 12.1496 5.21033L10.7499 3.81066L10.7499 14C10.7499 14.4142 10.4141 14.75 9.99992 14.75C9.58571 14.75 9.24992 14.4142 9.24992 14L9.24992 3.81066L7.85025 5.21033C7.55736 5.50322 7.08249 5.50322 6.78959 5.21033C6.4967 4.91744 6.4967 4.44256 6.78959 4.14967L9.46959 1.46967ZM6.74991 7.59397C6.75618 8.00814 6.42551 8.34896 6.01134 8.35523C4.89312 8.37214 4.40103 8.44902 4.04508 8.63928C3.61773 8.8677 3.26772 9.21772 3.03929 9.64507C2.91834 9.87135 2.83764 10.1672 2.79453 10.674C2.75063 11.1901 2.75 11.8532 2.75 12.8C2.75 13.338 2.75031 14.0116 2.79529 14.6356C2.81773 14.947 2.85042 15.232 2.89613 15.4717C2.94371 15.7212 2.99719 15.8761 3.03929 15.9549C3.26772 16.3823 3.61773 16.7323 4.04508 16.9607C4.27137 17.0816 4.56722 17.1623 5.07403 17.2055C5.59016 17.2494 6.25324 17.25 7.2 17.25H12.8C13.7468 17.25 14.4098 17.2494 14.926 17.2055C15.4328 17.1623 15.7286 17.0816 15.9549 16.9607C16.3823 16.7323 16.7323 16.3823 16.9607 15.9549C17.0028 15.8761 17.0563 15.7212 17.1039 15.4717C17.1496 15.232 17.1823 14.947 17.2047 14.6356C17.2497 14.0116 17.25 13.338 17.25 12.8C17.25 11.8532 17.2494 11.1901 17.2055 10.674C17.1624 10.1672 17.0817 9.87135 16.9607 9.64507C16.7323 9.21772 16.3823 8.8677 15.9549 8.63928C15.599 8.44902 15.1069 8.37214 13.9887 8.35523C13.5745 8.34896 13.2438 8.00814 13.2501 7.59397C13.2564 7.17981 13.5972 6.84914 14.0113 6.8554C15.1044 6.87193 15.9457 6.93351 16.662 7.3164C17.351 7.68467 17.9153 8.24898 18.2836 8.93797C18.5405 9.41859 18.6487 9.94312 18.7001 10.5469C18.75 11.1341 18.75 11.861 18.75 12.7662V12.81C18.75 13.3388 18.75 14.0612 18.7008 14.7434C18.676 15.0874 18.6379 15.4351 18.5773 15.7527C18.5186 16.0605 18.4304 16.3873 18.2836 16.662C17.9153 17.351 17.351 17.9153 16.662 18.2836C16.1814 18.5405 15.6569 18.6487 15.0531 18.7001C14.4659 18.75 13.7389 18.75 12.8337 18.75H7.16634C6.26106 18.75 5.53409 18.75 4.9469 18.7001C4.34314 18.6487 3.81861 18.5405 3.33798 18.2836C2.64899 17.9153 2.08468 17.351 1.71641 16.662C1.56958 16.3873 1.48138 16.0605 1.42268 15.7527C1.36213 15.4351 1.32396 15.0874 1.29917 14.7434C1.25 14.0612 1.25 13.3388 1.25 12.81L1.25 12.7663C1.24999 11.861 1.24999 11.1341 1.29993 10.5469C1.35129 9.94312 1.45951 9.41859 1.71641 8.93797C2.08468 8.24898 2.64899 7.68467 3.33798 7.3164C4.05432 6.93351 4.89561 6.87193 5.98866 6.8554C6.40282 6.84914 6.74365 7.17981 6.74991 7.59397Z" fill="currentColor"/>
            </svg>
          </button>
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

    <!-- ═════ Cell: Number ═════ -->
    <template #cell-number="{ row, value }">
      <div class="cell-with-action">
        <button class="cell-link" @click.stop="openPurchaseOrder?.((row as Row).id)">{{ value }}</button>
        <button class="row-hover-btn" @click.stop="openPurchaseOrder?.((row as Row).id)">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="#656f80" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="#656f80" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="row-hover-btn__label">VIEW DETAILS</span>
        </button>
      </div>
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
      <div class="cell-with-action">
        <span class="cell-text">{{ value }}</span>
        <button class="row-hover-btn" @click.stop>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <rect x="1.5" y="1.5" width="9" height="9" rx="1" stroke="#656f80" stroke-width="1.2"/>
            <path d="M4.5 1.5v9" stroke="#656f80" stroke-width="1.2" stroke-linecap="round"/>
          </svg>
          <span class="row-hover-btn__label">OPEN PREVIEW</span>
        </button>
      </div>
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
    <template #actions>
      <button class="row-kebab" aria-label="More actions">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>
    </template>

  </ErpTablePage>
</template>

<style scoped>
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

.row-hover-btn {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  display: none;
  align-items: center;
  gap: var(--mp-spacing-1\.5, 6px);
  padding: var(--mp-spacing-1, 4px) var(--mp-spacing-1\.5, 6px);
  background: var(--mp-background-neutral, #ffffff);
  border: 1px solid var(--mp-border-bold, #758195);
  border-radius: var(--mp-radii-sm, 4px);
  cursor: pointer;
  white-space: nowrap;
  line-height: 1;
}

.row-hover-btn__label {
  font-size: 10px;
  font-weight: 600;
  line-height: 12px;
  color: var(--mp-text-secondary, #656f80);
  text-transform: uppercase;
}

:global(.erp-tr:hover .row-hover-btn) {
  display: flex;
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

.filter-select-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 160px;
  background: var(--mp-background-neutral, #ffffff);
  border: 1px solid rgba(29, 31, 36, 0.16);
  border-radius: var(--mp-radii-md, 6px);
}

.filter-select {
  width: 100% !important;
  min-width: 0 !important;
}
.filter-select :deep(.mp-select__control) {
  appearance: none;
  background: transparent !important;
  border: none !important;
  box-shadow: var(--mp-shadows-none, none) !important;
  outline: none;
  width: 100%;
  padding: 8px 36px 8px 12px;
  font-size: var(--mp-font-sizes-md, 14px);
  line-height: var(--mp-line-heights-md, 20px);
  color: var(--mp-text-placeholder, #8690a2);
  cursor: pointer;
}

.filter-select-chevron {
  position: absolute;
  right: 8px;
  pointer-events: none;
  color: var(--mp-text-default, #272b32);
}

.filter-all-btn {
  display: inline-flex !important;
  align-items: center;
  gap: var(--mp-spacing-2, 8px);
  width: auto !important;
  height: auto !important;
  min-width: 0 !important;
  padding: 8px 16px 8px 12px !important;
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
  width: 36px !important;
  height: 36px !important;
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
