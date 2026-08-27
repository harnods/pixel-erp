<script setup lang="ts">
/**
 * BuzzCampaignsPage · Mekari Buzz (Marketing tool) campaigns index.
 *
 * A campaign is a project that groups many creatives (PRD §15). Built on the
 * shared ErpTablePage + useTableState pattern — gray header, pagination, the
 * standard filter bar (status dropdown + All filters left, Export + Search
 * right). Alphabetical default sort by name (project convention).
 */
import { MpIcon } from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { buzzCampaigns, buzzBrand, buzzBadgeType, type BuzzCampaign } from '~/data/buzz'
import { formatDate } from '~/utils/date'
import { infoToast } from '~/utils/toasts'

const rows = computed<BuzzCampaign[]>(() =>
  [...buzzCampaigns].sort((a, b) => a.name.localeCompare(b.name)))

const statusOptions = ['Draft', 'In review', 'Approved']

const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort,
} = useTableState(rows, {
  perPage: 25,
  filterFn: (row, s, st) =>
    (row.name.toLowerCase().includes(s) || row.owner.toLowerCase().includes(s) || (buzzBrand(row.brand)?.name ?? '').toLowerCase().includes(s)) &&
    (!st || row.status === st),
})

const columns: TableColumn[] = [
  { key: 'name', label: 'Campaign', width: '260px', sortable: true, sortType: 'string' },
  { key: 'brand', label: 'Brand', width: '160px', sortable: true, sortType: 'string' },
  { key: 'purpose', label: 'Purpose', width: '180px' },
  { key: 'creatives', label: 'Creatives', width: '110px', align: 'right', sortable: true, sortType: 'number' },
  { key: 'owner', label: 'Owner', width: '160px' },
  { key: 'status', label: 'Status', width: '150px' },
  { key: 'updatedAt', label: 'Last updated', width: '160px', sortable: true, sortType: 'date' },
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
    filter-empty-label="campaign"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
  >
    <template #filters>
      <div class="filter-left">
        <div class="filter-select-wrap">
          <select v-model="statusFilter" class="filter-select">
            <option value="">Status</option>
            <option v-for="o in statusOptions" :key="o" :value="o">{{ o }}</option>
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
          <input v-model="search" class="filter-search-input" type="text" placeholder="Search campaign or owner…" />
          <button v-if="search" class="search-clear-btn" type="button" aria-label="Clear search" @click="search = ''"><MpIcon name="close" size="sm" /></button>
        </div>
      </div>
    </template>

    <template #cell-name="{ row }">
      <span class="cell-link" @click="infoToast('Campaign workspace · coming soon')">{{ (row as BuzzCampaign).name }}</span>
    </template>
    <template #cell-brand="{ row }">
      <span class="brand-cell">
        <img :src="buzzBrand((row as BuzzCampaign).brand)?.logo" :alt="buzzBrand((row as BuzzCampaign).brand)?.name" class="brand-cell__logo" />
        {{ buzzBrand((row as BuzzCampaign).brand)?.name }}
      </span>
    </template>
    <template #cell-status="{ row }">
      <ErpStatusBadge :status="(row as BuzzCampaign).status" :label="(row as BuzzCampaign).status" :type="buzzBadgeType((row as BuzzCampaign).status)" />
    </template>
    <template #cell-updatedAt="{ value }">{{ formatDate(value as string) }}</template>
  </ErpTablePage>
</template>

<style scoped>
.brand-cell { display: inline-flex; align-items: center; gap: var(--mp-spacing-2, 8px); }
.brand-cell__logo { width: 20px; height: 20px; flex-shrink: 0; border-radius: 4px; object-fit: contain; }

/* ── Filter bar (verbatim ERP block) ── */
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
.cell-link { color: var(--mp-text-link); cursor: pointer; }
.cell-link:hover { text-decoration: underline; }
</style>
