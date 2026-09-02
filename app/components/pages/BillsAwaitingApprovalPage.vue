<script setup lang="ts">
import {
  MpIcon, MpButton, MpTooltip, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css, toast,
} from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import { lastUpdatedFor } from '~/utils/lastUpdated'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import BillsFiltersDrawer, { emptyBillsFilters, type BillsFiltersValue } from '~/components/patterns/BillsFiltersDrawer.vue'
import type { AmountComparator } from '~/components/patterns/AmountComparatorField.vue'
import { bills } from '~/data'
import type { Bill } from '~/data'

const { t } = useLocale()
const router = useRouter()
const toggleAirene = inject<() => void>('toggleAirene')

// This tab shows every bill relabeled as "Draft" (awaiting approval) — not the
// bill's real status — so the detail page is told via query, not bill.status.
function goDetail(id: string) { router.push({ path: `/expenses/${id}`, query: { approval: '1' } }) }
function duplicate(id: string) {
  router.push({ path: '/expenses/new', query: { duplicate: id } })
}

// ─── Column definitions ───────────────────────────────────────────────────────
const columns: TableColumn[] = [
  { key: 'date',            label: 'Date',        kind: 'date',                                 sortType: 'date'   },
  { key: 'number',          label: 'Number',      kind: 'number', sortable: true,                 sortType: 'number' },
  { key: 'beneficiaryName', label: 'Beneficiary', kind: 'name', sortable: true,                 sortType: 'text'   },
  { key: 'category',        label: 'Category',    sortable: true,                 sortType: 'text'   },
  { key: 'dueDate',         label: 'Due date',    kind: 'date',                                 sortType: 'date'   },
  { key: 'status',          label: 'Status',      kind: 'status',                                 sortType: 'text'   },
  { key: 'balanceDue',      label: 'Balance due', kind: 'amount', align: 'right', sortable: true,  sortType: 'number' },
  { key: 'tags',            label: 'Tags',        kind: 'tags'                                  },
]

// ─── Row type ─────────────────────────────────────────────────────────────────

type Row = Bill & {
  beneficiaryName: string
}

// ─── Flatten + enrich ─────────────────────────────────────────────────────────
// Every bill here is awaiting approval — not yet paid, so status is always
// 'draft' and the balance due is the full total (nothing paid out yet).

const rows = computed<Row[]>(() =>
  bills.map(bill => ({
    ...bill,
    beneficiaryName: bill.beneficiary.name,
    status: 'draft' as const,
    balanceDue: bill.total,
  }))
)

// ─── All-filters drawer (same BillsFiltersDrawer as the Bills index) ────────────
// Every row here is a "draft" awaiting approval, so the Status (Open/Paid/Overdue)
// section doesn't apply — passing no status options hides it in the drawer.
const filtersOpen = ref(false)
const appliedFilters = reactive<BillsFiltersValue>(emptyBillsFilters())
const keywordColumns = [
  { key: 'number',          label: t('Number')      },
  { key: 'beneficiaryName', label: t('Beneficiary') },
  { key: 'category',        label: t('Category')    },
  { key: 'tags',            label: t('Tags')        },
]
const tagOptions = computed(() => [...new Set(bills.flatMap(b => b.tags ?? []))].sort())
function applyDrawerFilters(v: BillsFiltersValue) { Object.assign(appliedFilters, v) }

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
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState(rows, {
  filterFn: (row: Row, s) => {
    const matchesSearch = String(row.number).includes(s) || row.beneficiaryName.toLowerCase().includes(s)

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
    const matchesTotal = matchesAmountFilter(row.total, f.totalComparator, f.totalValue, f.totalMin, f.totalMax)
    const matchesTags = f.tags.length === 0
      || (f.tagsComparator === 'isAnyOf' ? f.tags.some(tg => rowTags.includes(tg))
        : f.tagsComparator === 'isAllOf' ? f.tags.every(tg => rowTags.includes(tg))
        : f.tags.every(tg => !rowTags.includes(tg)))

    return matchesSearch && matchesKeyword && matchesTransactionDate && matchesDueDate && matchesTotal && matchesTags
  },
})

watch(appliedFilters, () => setPage(1))

// "(n)" suffix + active state on the All-filters trigger (Status excluded — hidden here).
const activeFilterCount = computed(() =>
  (appliedFilters.keyword ? 1 : 0)
  + (appliedFilters.transactionDate ? 1 : 0)
  + (appliedFilters.dueDate ? 1 : 0)
  + ((appliedFilters.totalValue !== '' || appliedFilters.totalMin !== '' || appliedFilters.totalMax !== '') ? 1 : 0)
  + (appliedFilters.tags.length > 0 ? 1 : 0),
)
const isDrawerFilterActive = computed(() => activeFilterCount.value > 0)

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(iso))
}

function formatNumber(n: number) {
  return `${t('Expense')} #${String(n).padStart(5, '0')}`
}

// Column show/hide (first column always on; Last updated appended, hidden by default)
const allCols: TableColumn[] = [...columns, { key: 'lastUpdated', label: 'Last updated', kind: 'date' }]
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
    has-checkbox
    actions-width="228px"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
  >

    <!-- ── Filter bar ── -->
    <template #filters>
      <!-- Left: All filters -->
      <div class="filter-left">
        <MpButton class="filter-all-btn" :class="{ 'filter-all-btn--active': isDrawerFilterActive }" @click="filtersOpen = true">
          <MpIcon name="filter" size="sm" />
          {{ t('All filters') }}{{ activeFilterCount > 0 ? ` (${activeFilterCount})` : '' }}
        </MpButton>
      </div>

      <!-- Right: icon buttons + search -->
      <div class="filter-right">
        <div class="filter-btn-group">
          <!-- Airene -->
          <MpTooltip id="tt-bills-awaiting-airene" :label="t('Ask Airene')" placement="bottom" use-portal>
            <button class="filter-icon-btn filter-icon-btn--airene" :aria-label="t('Ask Airene')" @click="toggleAirene?.()">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
              </svg>
            </button>
          </MpTooltip>
          <!-- Column settings -->
          <ColumnSettingsMenu id="tt-columns-awaiting" :items="columnItems" :visibility="columnVisibility" />
          <!-- Export -->
          <MpTooltip id="tt-bills-awaiting-export" :label="t('Export')" placement="bottom" use-portal>
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

    <!-- ── Cell: Number (text link → detail; erp.css .cell-link) ── -->
    <template #cell-number="{ value, row }">
      <a class="cell-link cell-text" @click.stop="goDetail((row as Row).id)">{{ formatNumber(value as number) }}</a>
    </template>

    <!-- ── Cell: Beneficiary (text link → detail, where the file preview lives) ── -->
    <template #cell-beneficiaryName="{ value, row }">
      <a class="cell-link cell-text" @click.stop="goDetail((row as Row).id)">{{ value }}</a>
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
    <template #cell-balanceDue="{ value }">
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
      <div class="row-actions">
        <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm" @click.stop>{{ t('Approve') }}</button>
        <div class="row-actions__icons">
          <MpButton class="row-icon-btn" :aria-label="t('Create task')" @click.stop>
            <MpIcon name="task-todo" size="md" />
          </MpButton>
          <MpButton class="row-icon-btn" :aria-label="t('Add comment')" @click.stop>
            <MpIcon name="comment" size="md" />
          </MpButton>
          <MpPopover :id="`awaiting-row-actions-${(row as Row).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
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
                <MpPopoverListItem @click="goDetail((row as Row).id)">{{ t('View details') }}</MpPopoverListItem>
                <MpPopoverListItem @click="duplicate((row as Row).id)">{{ t('Duplicate') }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>
    </template>

    <template #cell-lastUpdated="{ row }">
      <LastUpdatedCell v-bind="lastUpdatedFor((row as Record<string, unknown>).id as string)" />
    </template>
  </ErpTablePage>

  <BillsFiltersDrawer
    id="bills-awaiting-allfilters"
    :is-open="filtersOpen"
    :model-value="appliedFilters"
    :columns="keywordColumns"
    :status-options="[]"
    :tag-options="tagOptions"
    @update:is-open="filtersOpen = $event"
    @apply="applyDrawerFilters"
  />
</template>

<style scoped>
.cell-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
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

/* Row actions: Approve button + icon button group */
.row-actions {
  display: flex;
  align-items: center;
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
.filter-all-btn--active {
  background: var(--mp-background-selected, var(--mp-background-information)) !important;
  border-color: var(--mp-border-selected, var(--mp-border-information)) !important;
  color: var(--mp-text-selected, var(--mp-text-information)) !important;
}

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
