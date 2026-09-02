<script setup lang="ts">
import {
  MpSelect, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, MpIcon, MpTooltip, css,
} from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import { lastUpdatedFor } from '~/utils/lastUpdated'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import SalesDeliveryFiltersDrawer, { emptySalesDeliveryFilters, type SalesDeliveryFiltersValue } from '~/components/patterns/SalesDeliveryFiltersDrawer.vue'
import type { AmountComparator } from '~/components/patterns/AmountComparatorField.vue'
import { salesDeliveries } from '~/data'
import type { SalesDelivery } from '~/data'

const toggleAirene = inject<() => void>('toggleAirene')
const { t } = useLocale()

// ─── Column definitions ───────────────────────────────────────────────────────
const columns: TableColumn[] = [
  { key: 'date',              label: t('Date'),              kind: 'date',                                sortType: 'date'   },
  { key: 'number',            label: t('Number'),            kind: 'number', sortable: true,                sortType: 'number' },
  { key: 'processed',         label: '',                  width: '44px',  align: 'center', noHeader: true },
  { key: 'customerName',      label: t('Customer'),          kind: 'name', sortable: true,                sortType: 'text'   },
  { key: 'fulfillmentStatus', label: t('Fulfillment status'),kind: 'status',                                sortType: 'text'   },
  { key: 'billingStatus',     label: t('Billing status'),    kind: 'status',                                sortType: 'text'   },
  { key: 'total',             label: t('Total'),             kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'tags',              label: t('Tags'),              kind: 'tags'                                 },
]

// ─── Row type + flatten ─────────────────────────────────────────────────────────
type Row = SalesDelivery & { customerName: string }

// Prototype preview toggle (FAB, bottom-right): data vs empty-state view
const previewMode = ref<'data' | 'empty'>('data')

const rows = computed<Row[]>(() =>
  previewMode.value === 'empty'
    ? []
    : salesDeliveries.map(sd => ({ ...sd, customerName: sd.customer.name })),
)

// ─── Second quick filter (Billing status) — combined inside filterFn ────────────
// useTableState owns a single `statusFilter` (used here for Fulfillment status);
// Billing status is a local ref read inside filterFn so the `filtered` computed
// tracks it reactively.
const billingFilter = ref('')

// ─── "All filters" drawer — a second, independent filter layer, ANDed with the
// toolbar's own Fulfillment + Billing selects + search (same pattern as
// BillsIndexPage). ────────────────────────────────────────────────────────────
const filtersOpen = ref(false)
const appliedFilters = reactive<SalesDeliveryFiltersValue>(emptySalesDeliveryFilters())

const keywordColumns = [
  { key: 'number',       label: t('Number')   },
  { key: 'customerName', label: t('Customer') },
  { key: 'tags',         label: t('Tags')     },
]
const tagOptions = computed(() => [...new Set(salesDeliveries.flatMap(sd => sd.tags ?? []))].sort())

function applyDrawerFilters(v: SalesDeliveryFiltersValue) { Object.assign(appliedFilters, v) }

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
  filterFn: (row, s, fulfillment) => {
    const matchesSearch = String(row.number).includes(s) || row.customerName.toLowerCase().includes(s)
    const matchesToolbar = (!fulfillment || row.fulfillmentStatus === fulfillment)
      && (!billingFilter.value || row.billingStatus === billingFilter.value)

    // ── Drawer filters (independent of the toolbar's selects / search) ──
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
    const matchesDeliveryDate = matchesDateRange(row.date, f.deliveryDate)
    const matchesFulfillment = f.fulfillmentStatus.length === 0 || f.fulfillmentStatus.includes(row.fulfillmentStatus)
    const matchesBilling = f.billingStatus.length === 0 || f.billingStatus.includes(row.billingStatus)
    const matchesTotal = matchesAmountFilter(row.total, f.totalComparator, f.totalValue, f.totalMin, f.totalMax)
    const matchesTags = f.tags.length === 0
      || (f.tagsComparator === 'isAnyOf' ? f.tags.some(tg => rowTags.includes(tg))
        : f.tagsComparator === 'isAllOf' ? f.tags.every(tg => rowTags.includes(tg))
        : f.tags.every(tg => !rowTags.includes(tg)))

    return matchesSearch && matchesToolbar
      && matchesKeyword && matchesDeliveryDate && matchesFulfillment && matchesBilling
      && matchesTotal && matchesTags
  },
})

// Billing filter change → back to page 1 (useTableState already watches statusFilter)
watch(billingFilter, () => setPage(1))
watch(appliedFilters, () => setPage(1))

const isDrawerFilterActive = computed(() => {
  const f = appliedFilters
  return !!f.keyword || !!f.deliveryDate || f.fulfillmentStatus.length > 0 || f.billingStatus.length > 0
    || f.totalValue !== '' || f.totalMin !== '' || f.totalMax !== '' || f.tags.length > 0
})

// ─── Filter options ───────────────────────────────────────────────────────────
// Quick-filter options — NO "All …" entry; clearing (x) resets to show-all.
const fulfillmentOptions = [
  { label: t('In transit'), value: 'in transit' },
  { label: t('Direct'),     value: 'direct'     },
  { label: t('Delivered'),  value: 'delivered'  },
]

const billingOptions = [
  { label: t('Unbilled'), value: 'unbilled' },
  { label: t('Invoiced'), value: 'invoiced' },
]

const fulfillmentLabel = computed(
  () => fulfillmentOptions.find(o => o.value === statusFilter.value)?.label ?? '',
)
const billingLabel = computed(
  () => billingOptions.find(o => o.value === billingFilter.value)?.label ?? '',
)

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
  billingFilter.value = ''
  Object.assign(appliedFilters, emptySalesDeliveryFilters())
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
    :has-active-filter="!!search || !!statusFilter || !!billingFilter || isDrawerFilterActive"
    :search="search"
    has-checkbox
    :context-label="(row) => `${t('Sales Delivery')} #${row.number}`"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
  >

    <!-- ── Filter bar ── -->
    <template #filters>
      <!-- Left: Fulfillment + Billing status selects (MpSelect + MpPopover) + All filters -->
      <div class="filter-left">
        <!-- Fulfillment status -->
        <MpPopover id="sd-fulfillment-filter" is-close-on-select>
          <MpPopoverTrigger>
            <MpSelect
              id="sd-fulfillment-select"
              :placeholder="t('Fulfillment status')"
              :model-value="statusFilter"
              is-clearable
              :class="css({ width: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })"
              @mousedown.prevent
              @clear="statusFilter = ''"
            >
              <option v-if="statusFilter" :value="statusFilter">{{ fulfillmentLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', maxWidth: '320px' })">
            <MpPopoverList>
              <MpPopoverListItem
                v-for="opt in fulfillmentOptions"
                :key="opt.value"
                :is-active="opt.value === statusFilter"
                @click="statusFilter = opt.value"
              >
                {{ opt.label }}
              </MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <!-- Billing status -->
        <MpPopover id="sd-billing-filter" is-close-on-select>
          <MpPopoverTrigger>
            <MpSelect
              id="sd-billing-select"
              :placeholder="t('Billing status')"
              :model-value="billingFilter"
              is-clearable
              :class="css({ width: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })"
              @mousedown.prevent
              @clear="billingFilter = ''"
            >
              <option v-if="billingFilter" :value="billingFilter">{{ billingLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', maxWidth: '320px' })">
            <MpPopoverList>
              <MpPopoverListItem
                v-for="opt in billingOptions"
                :key="opt.value"
                :is-active="opt.value === billingFilter"
                @click="billingFilter = opt.value"
              >
                {{ opt.label }}
              </MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <button class="filter-all-btn" :class="{ 'filter-all-btn--active': isDrawerFilterActive }" @click="filtersOpen = true">
          <MpIcon name="filter" size="sm" />
          {{ t('All filters') }}
        </button>
      </div>

      <!-- Right: icon buttons + search -->
      <div class="filter-right">
        <div class="filter-btn-group">
          <!-- Airene -->
          <MpTooltip id="tt-airene" :label="t('Ask Airene')" placement="bottom" use-portal>
          <button class="filter-icon-btn filter-icon-btn--airene" :aria-label="t('Ask Airene')" @click="toggleAirene?.()">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
              <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
            </svg>
          </button>
          </MpTooltip>
          <!-- Column settings -->
          <ColumnSettingsMenu id="tt-columns" :items="columnItems" :visibility="columnVisibility" />
          <!-- Export -->
          <MpTooltip id="tt-export" :label="t('Export')" placement="bottom" use-portal>
          <button class="filter-icon-btn" :aria-label="t('Export')">
            <MpIcon name="download" size="md" />
          </button>
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
          <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>
    </template>

    <!-- ── Cell: Date ── -->
    <template #cell-date="{ value }">
      {{ formatDate(value as string) }}
    </template>

    <!-- ── Cell: Number — "View details" on row hover (record has a detail page) ── -->
    <template #cell-number="{ value }">
      <a class="cell-link cell-text cell-number" @click.stop>{{ t('Sales Delivery') }} #{{ value }}</a>
    </template>

    <!-- ── Cell: Processed in fulfillment — icon-only column (no header), tooltip on hover.
         Hidden for "Direct" deliveries (handed over directly, no fulfillment step). ── -->
    <template #cell-processed="{ row }">
      <MpTooltip
        v-if="row.fulfillmentStatus !== 'direct'"
        :id="`tt-fulfillment-${row.id}`"
        :label="t('Processed in fulfillment')"
        placement="top"
        use-portal
      >
        <button class="row-truck-btn" :aria-label="t('Processed in fulfillment')">
          <MpIcon name="truck" size="sm" />
        </button>
      </MpTooltip>
    </template>

    <!-- ── Cell: Customer — "Open preview" on row hover (customer/vendor always previewable) ── -->
    <template #cell-customerName="{ value }">
      <a class="cell-link cell-text" @click.stop>{{ value }}</a>
    </template>

    <!-- ── Cell: Fulfillment status ── -->
    <template #cell-fulfillmentStatus="{ value }">
      <ErpStatusBadge :status="value as string" />
    </template>

    <!-- ── Cell: Billing status ── -->
    <template #cell-billingStatus="{ value }">
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

    <!-- ── Full empty state (no sales deliveries yet) — illustration + title + CTA ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('No sales deliveries') }}</p>
        <p class="empty-full-desc">{{ t('Sales deliveries will appear here.') }}</p>
        <button class="empty-cta">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          {{ t('New sales delivery') }}
        </button>
      </div>
    </template>

    <!-- ── Actions — kebab → MpPopover dropdown (View details always first;
         share-via group separated by a divider) ── -->
    <template #actions="{ row }">
      <MpPopover :id="`sd-actions-${row.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <button class="row-kebab" :aria-label="t('More actions')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem>{{ t('View details') }}</MpPopoverListItem>
            <MpPopoverListItem>{{ t('Create sales invoice') }}</MpPopoverListItem>
          </MpPopoverList>
          <div :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
          <MpPopoverList>
            <MpPopoverListItem>{{ t('Share via WhatsApp') }}</MpPopoverListItem>
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

  <SalesDeliveryFiltersDrawer
    id="sd-allfilters"
    :is-open="filtersOpen"
    :model-value="appliedFilters"
    :columns="keywordColumns"
    :fulfillment-options="fulfillmentOptions"
    :billing-options="billingOptions"
    :tag-options="tagOptions"
    @update:is-open="filtersOpen = $event"
    @apply="applyDrawerFilters"
  />

  <!-- ── Prototype preview FAB (bottom-right): toggle data vs empty-state view ── -->
  <div class="preview-fab-wrap">
    <MpPopover id="preview-fab" placement="top-end" use-portal :is-keep-alive="false">
      <MpPopoverTrigger>
        <button class="preview-fab" :aria-label="t('Preview options')">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M2 12C2 12 5 5 12 5C19 5 22 12 22 12C22 12 19 19 12 19C5 19 2 12 2 12Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5"/>
          </svg>
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

/* Cell with hover action button (View details / Open preview) */
.cell-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

/* Truck icon button — "Processed in Fulfillment" column */
.row-truck-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-7, 28px);
  height: var(--mp-sizes-7, 28px);
  padding: var(--mp-spacing-1);
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--mp-radii-sm);
  color: var(--mp-text-subtle);
}
.row-truck-btn:hover {
  background: var(--mp-background-neutral-hovered);
  color: var(--mp-text-default);
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
  align-items: center;
}
.empty-illustration {
  width: auto;
  height: 240px;
  object-fit: contain;
  margin-bottom: 0;
}
.empty-full-title {
  margin: 0 0 var(--mp-spacing-0\.5);
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.empty-full-desc {
  margin: 0 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}
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
