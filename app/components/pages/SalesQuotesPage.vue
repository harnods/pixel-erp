<script setup lang="ts">
import {
  MpButton, MpButtonGroup, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, MpIcon, MpTooltip, css,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { formatIDR } from '~/utils/currency'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import { lastUpdatedFor } from '~/utils/lastUpdated'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import SalesQuoteFiltersDrawer, { emptySalesQuoteFilters, type SalesQuoteFiltersValue } from '~/components/patterns/SalesQuoteFiltersDrawer.vue'
import type { AmountComparator } from '~/components/patterns/AmountComparatorField.vue'
import { salesQuotes } from '~/data'
import type { SalesQuote } from '~/data'

const toggleAirene = inject<() => void>('toggleAirene')
const { t } = useLocale()

// ─── Column definitions ───────────────────────────────────────────────────────
const columns: TableColumn[] = [
  { key: 'date',           label: t('Date'),            kind: 'date',                                sortType: 'date'   },
  { key: 'number',         label: t('Number'),          kind: 'number', sortable: true,                sortType: 'number' },
  { key: 'customerName',   label: t('Customer'),        kind: 'name', sortable: true,                sortType: 'text'   },
  { key: 'expirationDate', label: t('Valid until'),      kind: 'date',                                sortType: 'date'   },
  { key: 'status',         label: t('Status'),          kind: 'status',                                sortType: 'text'   },
  { key: 'total',          label: t('Total'),           kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'tags',           label: t('Tags'),            kind: 'tags'                                 },
]

// ─── Row type + flatten ─────────────────────────────────────────────────────────
type Row = SalesQuote & { customerName: string }

// Prototype preview toggle (FAB, bottom-right): data vs empty-state view
const previewMode = ref<'data' | 'empty'>('data')

const rows = computed<Row[]>(() =>
  previewMode.value === 'empty'
    ? []
    : salesQuotes.map(sq => ({ ...sq, customerName: sq.customer.name })),
)

// ─── "All filters" drawer — a second, independent filter layer, ANDed with the
// toolbar's own Status select + search (same pattern as BillsIndexPage). ──────
const filtersOpen = ref(false)
const appliedFilters = reactive<SalesQuoteFiltersValue>(emptySalesQuoteFilters())

const keywordColumns = [
  { key: 'number',       label: t('Number')   },
  { key: 'customerName', label: t('Customer') },
  { key: 'tags',         label: t('Tags')     },
]
const tagOptions = computed(() => [...new Set(salesQuotes.flatMap(sq => sq.tags ?? []))].sort())

function applyDrawerFilters(v: SalesQuoteFiltersValue) { Object.assign(appliedFilters, v) }

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
} = useTableState<Row>(rows, {
  perPage: 25,
  filterFn: (row, s, status) => {
    const matchesSearch = String(row.number).includes(s) || row.customerName.toLowerCase().includes(s)
    const matchesStatus = !status || row.status === status

    // ── Drawer filters (independent of the toolbar's Status select / search) ──
    const f = appliedFilters
    const kw = f.keyword.toLowerCase().trim()
    const rowTags = row.tags ?? []
    const matchesKeyword = !kw || (
      f.keywordColumn === 'all'
        ? String(row.number).includes(kw) || row.customerName.toLowerCase().includes(kw) || rowTags.some(tg => tg.toLowerCase().includes(kw))
        : f.keywordColumn === 'number' ? String(row.number).includes(kw)
        : f.keywordColumn === 'customerName' ? row.customerName.toLowerCase().includes(kw)
        : rowTags.some(tg => tg.toLowerCase().includes(kw))
    )
    const matchesTransactionDate = matchesDateRange(row.date, f.transactionDate)
    const matchesValidUntil = matchesDateRange(row.expirationDate, f.validUntil)
    const matchesDrawerStatus = f.status.length === 0 || f.status.includes(row.status)
    const matchesTotal = matchesAmountFilter(row.total, f.totalComparator, f.totalValue, f.totalMin, f.totalMax)
    const matchesTags = f.tags.length === 0
      || (f.tagsComparator === 'isAnyOf' ? f.tags.some(tg => rowTags.includes(tg))
        : f.tagsComparator === 'isAllOf' ? f.tags.every(tg => rowTags.includes(tg))
        : f.tags.every(tg => !rowTags.includes(tg)))

    return matchesSearch && matchesStatus
      && matchesKeyword && matchesTransactionDate && matchesValidUntil && matchesDrawerStatus
      && matchesTotal && matchesTags
  },
})

watch(appliedFilters, () => setPage(1))

const isDrawerFilterActive = computed(() => {
  const f = appliedFilters
  return !!f.keyword || !!f.transactionDate || !!f.validUntil || f.status.length > 0
    || f.totalValue !== '' || f.totalMin !== '' || f.totalMax !== '' || f.tags.length > 0
})

// ─── Filter options ───────────────────────────────────────────────────────────
// Quick-filter options — NO "All status" entry; clearing (x) resets to show-all.
const statusOptions = [
  { label: t('Open'),     value: 'open'     },
  { label: t('Closed'),   value: 'closed'   },
  { label: t('Declined'), value: 'declined' },
]

// ─── Formatters ───────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(iso))
}

// ─── First-load skeleton (pagination skeleton is handled by ErpTablePage) ────
const loading = ref(true)
onMounted(() => {
  setTimeout(() => { loading.value = false }, 1200)
})

// Empty-state illustration — public path (drop the file at app/public/illustrations/)
const emptyIllustration = '/illustrations/empty-folder.png'

// Reset all filters (from the inline "Clear all filters" empty-state link)
function clearFilters() {
  search.value = ''
  statusFilter.value = ''
  Object.assign(appliedFilters, emptySalesQuoteFilters())
}

// Column show/hide (first column always on; Last updated appended, hidden by default)
const allCols: TableColumn[] = [...columns, { key: 'lastUpdated', label: t('Last updated'), kind: 'date' }]
const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(allCols.map(c => [c.key, c.key !== 'lastUpdated'])))
const columnItems = allCols.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => allCols.filter(c => columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }
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
    :loading="loading"
    :has-active-filter="!!search || !!statusFilter || isDrawerFilterActive"
    :search="search"
    has-checkbox
    :context-label="(row) => `${t('Sales Quote')} #${row.number}`"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
  >

    <!-- ── Bulk actions ── -->
    <template #bulk-actions>
      <MpPopover id="sq-bulk-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
        <MpPopoverTrigger>
          <MpButton size="sm" variant="secondary" right-icon="chevrons-down" is-rounded>{{ t('Actions') }}</MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent class="erp-dropdown-menu">
          <MpPopoverList>
            <MpPopoverListItem>{{ t('Convert to sales order') }}</MpPopoverListItem>
            <MpPopoverListItem>{{ t('Print PDF') }}</MpPopoverListItem>
            <MpPopoverListItem>{{ t('Share via email') }}</MpPopoverListItem>
            <MpPopoverListItem>{{ t('Delete') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Filter bar ── -->
    <template #filters>
      <!-- Left: Status select + All filters -->
      <div class="filter-left">
        <ErpFilterSelect id="sq-status" v-model="statusFilter" :placeholder="t('Status')" :options="statusOptions" />

        <MpButton variant="secondary" left-icon="filter" is-rounded class="filter-all-btn" :class="{ 'filter-all-btn--active': isDrawerFilterActive }" @click="filtersOpen = true">{{ t('All filters') }}</MpButton>
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

    <!-- ── Cell: Number — "View details" on row hover (record has a detail page) ── -->
    <template #cell-number="{ row, value }">
      <span class="cell-link cell-text cell-number" @click.stop="navigateTo(`/sales-quotes/${(row as Row).id}`)">{{ t('Sales Quote') }} #{{ value }}</span>
    </template>

    <!-- ── Cell: Customer — "Open preview" on row hover (customer/vendor always previewable) ── -->
    <template #cell-customerName="{ value }">
      <span class="cell-link cell-text" @click.stop>{{ value }}</span>
    </template>

    <!-- ── Cell: Expiration date ── -->
    <template #cell-expirationDate="{ value }">
      {{ formatDate(value as string) }}
    </template>

    <!-- ── Cell: Status ── -->
    <template #cell-status="{ value }">
      <ErpStatusBadge :status="value as string" />
    </template>

    <!-- ── Cell: Total ── -->
    <template #cell-total="{ value }">
      {{ formatIDR(value as number) }}
    </template>

    <!-- ── Cell: Tags — clamped to 2 lines, "More" link on overflow ── -->
    <template #cell-tags="{ value }">
      <ErpTagList :tags="(value as string[])" />
    </template>

    <!-- ── Full empty state (no sales quotes yet) — illustration + title + CTA ── -->
    <template #empty>
      <div class="empty-full">
        <!-- dynamic :src → runtime public path (not a build-time import).
             Save the attached illustration to app/public/illustrations/empty-folder.png -->
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('No sales quotes') }}</p>
        <p class="empty-full-desc">{{ t('Sales quotes will appear here.') }}</p>
        <MpButton variant="secondary" left-icon="add" is-rounded @click="navigateTo('/sales-quotes/new')">{{ t('New sales quote') }}</MpButton>
      </div>
    </template>

    <!-- ── Actions — kebab → MpPopover dropdown (View details always first;
         share-via group separated by a divider) ── -->
    <template #actions="{ row }">
      <MpPopover :id="`sq-actions-${row.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
        </MpPopoverTrigger>
        <!-- min-width 160px, width hugs content, labels never wrap -->
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem>{{ t('View details') }}</MpPopoverListItem>
            <MpPopoverListItem>{{ t('Create sales order') }}</MpPopoverListItem>
            <MpPopoverListItem>{{ t('Create sales invoice') }}</MpPopoverListItem>
            <MpPopoverListItem>{{ t('Mark as declined') }}</MpPopoverListItem>
            <MpPopoverListItem>{{ t('Duplicate') }}</MpPopoverListItem>
          </MpPopoverList>
          <div :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
          <MpPopoverList>
            <MpPopoverListItem>{{ t('Share via email') }}</MpPopoverListItem>
            <MpPopoverListItem>{{ t('Copy link') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <template #cell-lastUpdated="{ row }">
      <LastUpdatedCell v-bind="lastUpdatedFor((row as Record<string, unknown>).id as string)" />
    </template>
  </ErpTablePage>

  <SalesQuoteFiltersDrawer
    id="sq-allfilters"
    :is-open="filtersOpen"
    :model-value="appliedFilters"
    :columns="keywordColumns"
    :status-options="statusOptions"
    :tag-options="tagOptions"
    @update:is-open="filtersOpen = $event"
    @apply="applyDrawerFilters"
  />

  <!-- ── Prototype preview FAB (bottom-right): toggle data vs empty-state view ── -->
  <div class="preview-fab-wrap">
    <MpPopover id="preview-fab" placement="top-end" use-portal :is-keep-alive="false">
      <MpPopoverTrigger>
        <button class="preview-fab" :aria-label="t('Preview options')">
          <MpIcon name="show" size="md" />
        </button>
      </MpPopoverTrigger>
      <MpPopoverContent is-dark is-close-on-select :class="css({ minWidth: '220px' })">
        <MpPopoverList>
          <MpPopoverListItem
            :class="css({ color: 'white', _hover: { background: 'transparent' } })"
            @click="previewMode = 'data'"
          >
            {{ t('View table with data') }}
          </MpPopoverListItem>
          <MpPopoverListItem
            :class="css({ color: 'white', _hover: { background: 'transparent' } })"
            @click="previewMode = 'empty'"
          >
            {{ t('View empty state') }}
          </MpPopoverListItem>
        </MpPopoverList>
      </MpPopoverContent>
    </MpPopover>
  </div>
</template>

<style scoped>
/* ── Cell helpers ───────────────────────────────────────────────────────── */
.cell-number {
  color: var(--mp-text-default);
}

.cell-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

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

/* ── Prototype preview FAB ──────────────────────────────────────────────── */
.preview-fab-wrap {
  position: fixed;
  right: var(--mp-spacing-6);
  bottom: var(--mp-spacing-6);
  z-index: 1000;
}
.preview-fab {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-12, 48px);
  height: var(--mp-sizes-12, 48px);
  border: none;
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-inverse);
  color: var(--mp-text-inverse);
  box-shadow: var(--mp-shadows-lg);
  cursor: pointer;
  transition: transform 0.1s ease;
}
.preview-fab:hover { transform: scale(1.05); }

/* ── Full empty state ───────────────────────────────────────────────────── */
.empty-full {
  display: flex;
  flex-direction: column;
  align-items: center;   /* no flex gap — spacing set per element below */
}
.empty-illustration {
  width: auto;
  height: 240px;   /* natural 288×240 → keep aspect ratio */
  object-fit: contain;
  margin-bottom: 0;   /* no gap → title */
}
.empty-full-title {
  margin: 0 0 var(--mp-spacing-0\.5);    /* 2px → description */
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.empty-full-desc {
  margin: 0 0 var(--mp-spacing-3);       /* 12px → button */
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}
/* Secondary button */
.empty-cta {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  color: var(--mp-text-secondary);
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  cursor: pointer;
}
.empty-cta:hover { background: var(--mp-background-neutral-hovered); }

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
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
  cursor: pointer;
  white-space: nowrap;
}
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered); }
.filter-all-btn--active {
  background: var(--mp-background-selected, var(--mp-background-information));
  border-color: var(--mp-border-selected, var(--mp-border-information));
  color: var(--mp-text-selected, var(--mp-text-information));
}

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
</style>
