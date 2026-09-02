<script setup lang="ts">
/**
 * XpmTransactionsPage · XPM (Mekari Expense) transactions ledger.
 *
 * Index page built on the shared ErpTablePage + useTableState pattern. Section
 * tabs (All / Card / Reimbursement / Cash advance / Bill / Travel) are supplied by
 * the shell (`[...slug].vue` › pageTabs) · this page just reads the active tab from
 * the URL and filters `xpmTransactions` by `source`. Export lives in the filter bar
 * (no title-bar create action).
 */
import { MpIcon } from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { xpmTransactions, xpmBadgeType, type XpmTransaction } from '~/data/xpm'
import { formatIDR } from '~/utils/currency'
import { formatDateTime } from '~/utils/date'
import { infoToast } from '~/utils/toasts'

const route = useRoute()
const activeTab = computed(() => (route.query.tab as string) || 'All')

// Section tab → ledger, filtered by transaction source (All shows everything).
const rows = computed<XpmTransaction[]>(() =>
  activeTab.value === 'All'
    ? xpmTransactions
    : xpmTransactions.filter(t => t.source === activeTab.value),
)

// ── Summary cards (scenario "today" = Tue 21 Jul 2026) ──
const stats = [
  { caption: 'Total out · Jul', value: 457400000 },
  { caption: 'Card spend',      value: 44664000 },
  { caption: 'Reimbursed',      value: 12513585 },
  { caption: 'Bills paid',      value: 380462009 },
]

// ── Filter bar ──
const accountOptions = ['Main account', 'Operational account']
const searchPlaceholder = 'Search description or name…'

const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort,
} = useTableState(rows, {
  perPage: 25,
  filterFn: (row, s, st) =>
    (row.description.toLowerCase().includes(s) || row.name.toLowerCase().includes(s)) &&
    (!st || row.account === st),
})

const columns: TableColumn[] = [
  { key: 'date',        label: 'Date',        kind: 'date', sortable: true, sortType: 'date' },
  { key: 'source',      label: 'Source' },
  { key: 'description', label: 'Description', kind: 'address' },
  { key: 'name',        label: 'Name',        kind: 'name' },
  { key: 'account',     label: 'Account',     kind: 'name' },
  { key: 'status',      label: 'Status',      kind: 'status' },
  { key: 'amount',      label: 'Amount',      kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
]
</script>

<template>
  <ErpTablePage
    :columns="columns"
    :rows="paginated"
    :total="total"
    :current-page="currentPage"
    :per-page="perPage"
    :sort-key="sortKey"
    :sort-dir="sortDir"
    :has-active-search="!!search"
    :has-active-filter="!!statusFilter"
    :search="search"
    filter-empty-label="transaction"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
  >
    <!-- ── Summary cards ── -->
    <template #stats>
      <div class="xpm-stats">
        <div v-for="s in stats" :key="s.caption" class="xpm-stat">
          <span class="xpm-stat__caption">{{ s.caption }}</span>
          <span class="xpm-stat__value">{{ formatIDR(s.value) }}</span>
        </div>
      </div>
    </template>

    <!-- ── Filter bar ── -->
    <template #filters>
      <div class="filter-left">
        <div class="filter-select-wrap">
          <select class="filter-select" v-model="statusFilter">
            <option value="">Account</option>
            <option v-for="o in accountOptions" :key="o" :value="o">{{ o }}</option>
          </select>
          <svg class="filter-select-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <button class="filter-all-btn"><MpIcon name="filter" size="md" /> All filters</button>
      </div>
      <div class="filter-right">
        <div class="filter-btn-group">
          <button class="filter-icon-btn" aria-label="Export" @click="infoToast('Export · coming soon')"><MpIcon name="download" size="md" /></button>
        </div>
        <div class="filter-search">
          <MpIcon name="search" size="md" />
          <input v-model="search" class="filter-search-input" type="text" :placeholder="searchPlaceholder" />
          <button v-if="search" class="search-clear-btn" type="button" aria-label="Clear search" @click="search = ''"><MpIcon name="close" size="sm" /></button>
        </div>
      </div>
    </template>

    <!-- ── Cells ── -->
    <template #cell-date="{ value }">{{ formatDateTime(value as string) }}</template>
    <template #cell-status="{ row }">
      <ErpStatusBadge :status="(row as any).status" :label="(row as any).status" :type="xpmBadgeType((row as any).status)" />
    </template>
    <template #cell-amount="{ value }">{{ formatIDR(value as number) }}</template>
  </ErpTablePage>
</template>

<style scoped>
/* ── Summary cards ── */
.xpm-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--mp-spacing-4);
}
.xpm-stat {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral);
}
.xpm-stat__caption {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}
.xpm-stat__value {
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
@media (max-width: 900px) {
  .xpm-stats { grid-template-columns: repeat(2, 1fr); }
}

/* ── Filter bar (canonical ERP markup) ── */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-select-wrap { position: relative; display: inline-flex; align-items: center; width: 160px; background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.filter-select { appearance: none; background: transparent; border: none; outline: none; width: 100%; padding: var(--mp-spacing-2) var(--mp-spacing-10) var(--mp-spacing-2) var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); cursor: pointer; }
.filter-select-chevron { position: absolute; right: var(--mp-spacing-2); pointer-events: none; color: var(--mp-text-default); width: 20px; height: 20px; }
.filter-all-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral); border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-md); color: var(--mp-text-secondary); cursor: pointer; white-space: nowrap; }
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered); }
.filter-btn-group { display: flex; align-items: center; }
.filter-icon-btn { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; padding: var(--mp-spacing-2); border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-default); }
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
.filter-search { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 248px; padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle); }
.filter-search-input { flex: 1; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); min-width: 0; }
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 18px; height: 18px; padding: 0; border: none; background: none; cursor: pointer; color: var(--mp-text-secondary); border-radius: var(--mp-radii-full, 999px); }
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }
</style>
