<script setup lang="ts">
/**
 * PurchaseInvoicesAwaitingApprovalPage — "Awaiting approval" tab on Purchase
 * invoices. Same approval-queue pattern as BillsAwaitingApprovalPage.vue: shows
 * every purchase invoice relabeled as Draft (awaiting approval), not its real
 * status, with an Approve action per row instead of a link into a detail page —
 * there is no purchase-invoice detail surface yet (see InvoiceReviewPage.vue).
 */
import {
  MpIcon, MpButton, MpTooltip, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css, toast,
} from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import { lastUpdatedFor } from '~/utils/lastUpdated'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { purchaseInvoicesAwaitingApproval } from '~/data'
import type { PurchaseInvoice } from '~/data'

const { t } = useLocale()
const toggleAirene = inject<() => void>('toggleAirene')

function approve() {
  toast.notify({ variant: 'success', title: t('Purchase invoice approved'), rootProps: { class: 'toast-enterprise' } })
}

// ─── Column definitions ───────────────────────────────────────────────────────
const columns: TableColumn[] = [
  { key: 'date',       label: 'Date',        kind: 'date',                                 sortType: 'date'   },
  { key: 'number',     label: 'Number',      kind: 'number', sortable: true,                 sortType: 'text'   },
  { key: 'vendorName', label: 'Vendor',      kind: 'name', sortable: true,                 sortType: 'text'   },
  { key: 'dueDate',    label: 'Due date',    kind: 'date',                                 sortType: 'date'   },
  { key: 'status',     label: 'Status',      kind: 'status',                                 sortType: 'text'   },
  { key: 'amount',     label: 'Balance due', kind: 'amount', align: 'right', sortable: true,  sortType: 'number' },
  { key: 'tags',       label: 'Tags',        kind: 'tags'                                  },
]

// Row-action buttons (Approve + Approval log + Comments) live in their own
// trailing data column so they sit flush-right yet scroll away on horizontal
// overflow — only the sticky #actions kebab stays pinned. Not sortable/hideable,
// so it's kept out of the column-settings menu (see visibleColumns below).
const rowActionsColumn: TableColumn = {
  key: 'rowActions', label: '', width: '188px', align: 'right', noHeader: true, noSkeleton: true, isTrailingAction: true,
}

// ─── Row type ─────────────────────────────────────────────────────────────────

type Row = PurchaseInvoice & {
  vendorName: string
}

// ─── Flatten + enrich ─────────────────────────────────────────────────────────
// Every invoice here is awaiting approval — not yet paid, so status is always
// 'draft' and the balance due is the full amount (nothing paid out yet).

const rows = computed<Row[]>(() =>
  purchaseInvoicesAwaitingApproval.map(inv => ({
    ...inv,
    vendorName: inv.vendor.name,
    status: 'draft' as const,
    amount: inv.amount,
  }))
)

// ─── Table state ──────────────────────────────────────────────────────────────

const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState(rows, {
  filterFn: (row: Row, s) =>
    row.number.toLowerCase().includes(s) || row.vendorName.toLowerCase().includes(s),
})

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
const visibleColumns = computed<TableColumn[]>(() => [...allCols.filter(c => columnVisibility[c.key]), rowActionsColumn])
function hideColumn(key: string) { columnVisibility[key] = false }

// ─── First-load skeleton (pagination skeleton is handled by ErpTablePage) ─────
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })

const emptyIllustration = '/illustrations/empty-folder.png'
function clearFilters() { search.value = '' }
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
    :has-active-filter="!!search"
    filter-empty-label="invoice"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
  >

    <!-- ── Filter bar ── -->
    <template #filters>
      <!-- Left: All filters -->
      <div class="filter-left">
        <MpButton class="filter-all-btn">
          <MpIcon name="filter" size="sm" />
          {{ t('All filters') }}
        </MpButton>
      </div>

      <!-- Right: icon buttons + search -->
      <div class="filter-right">
        <div class="filter-btn-group">
          <!-- Airene -->
          <MpTooltip id="tt-pi-awaiting-airene" :label="t('Ask Airene')" placement="bottom" use-portal>
            <button class="filter-icon-btn filter-icon-btn--airene" :aria-label="t('Ask Airene')" @click="toggleAirene?.()">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
              </svg>
            </button>
          </MpTooltip>
          <!-- Column settings -->
          <ColumnSettingsMenu id="tt-columns-pi-awaiting" :items="columnItems" :visibility="columnVisibility" />
          <!-- Export -->
          <MpTooltip id="tt-pi-awaiting-export" :label="t('Export')" placement="bottom" use-portal>
            <MpButton class="filter-icon-btn" :aria-label="t('Export')">
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
            :placeholder="t('Search...')"
          />
        </div>
      </div>
    </template>

    <!-- ── Cell: Date ── -->
    <template #cell-date="{ value }">
      {{ formatDate(value as string) }}
    </template>

    <!-- ── Cell: Number ── -->
    <template #cell-number="{ value }">
      <a class="cell-link cell-text cell-number" @click.stop>Purchase invoice #{{ seqNo(value as string) }}</a>
    </template>

    <!-- ── Cell: Vendor ── -->
    <template #cell-vendorName="{ value }">
      <a class="cell-link cell-text" @click.stop>{{ value }}</a>
    </template>

    <!-- ── Cell: Due Date ── -->
    <template #cell-dueDate="{ value }">
      {{ formatDate(value as string) }}
    </template>

    <!-- ── Cell: Status ── -->
    <template #cell-status="{ value }">
      <ErpStatusBadge :status="value as string" />
    </template>

    <!-- ── Cell: Balance due ── -->
    <template #cell-amount="{ value }">
      {{ formatIDR(value as number) }}
    </template>

    <!-- ── Cell: Tags ── -->
    <template #cell-tags="{ value }">
      <div v-if="(value as string[])?.length" class="tags-cell">
        <span v-for="tag in (value as string[])" :key="tag" class="erp-tag">{{ tag }}</span>
      </div>
    </template>

    <!-- ── Row actions (Approve + Approval log + Comments) — scroll away on overflow ── -->
    <template #cell-rowActions>
      <div class="row-actions">
        <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm" @click.stop="approve()">{{ t('Approve') }}</button>
        <div class="row-actions__icons">
          <MpButton class="row-icon-btn" :aria-label="t('Create task')" @click.stop>
            <MpIcon name="task-todo" size="md" />
          </MpButton>
          <MpButton class="row-icon-btn" :aria-label="t('Add comment')" @click.stop>
            <MpIcon name="comment" size="md" />
          </MpButton>
        </div>
      </div>
    </template>

    <!-- ── Actions — sticky right: only the [...] kebab stays pinned on horizontal scroll ── -->
    <template #actions="{ row }">
      <MpPopover :id="`pi-awaiting-row-actions-${(row as Row).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton class="row-icon-btn" :aria-label="t('More actions')" @click.stop>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click.stop>{{ t('View details') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <template #cell-lastUpdated="{ row }">
      <LastUpdatedCell v-bind="lastUpdatedFor((row as Record<string, unknown>).id as string)" />
    </template>

    <!-- ── Full empty state (no invoices awaiting approval) ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('No invoices awaiting approval') }}</p>
        <p class="empty-full-desc">{{ t('Purchase invoices awaiting approval will appear here.') }}</p>
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

/* Row actions: Approve button + icon button group — flush to the right edge,
   sitting just left of the sticky [...] kebab column */
.row-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--mp-spacing-6);
}

.row-actions__icons {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
}

.row-icon-btn {
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
.row-icon-btn:hover {
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
</style>
