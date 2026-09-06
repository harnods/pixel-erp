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
import ScenarioFab from '~/components/patterns/ScenarioFab.vue'
import ExportModal from '~/components/patterns/ExportModal.vue'
import CopyLinkDrawer from '~/components/patterns/CopyLinkDrawer.vue'
import ShareViaEmailModal from '~/components/patterns/ShareViaEmailModal.vue'
import SalesDeliveryFiltersDrawer, { emptySalesDeliveryFilters, type SalesDeliveryFiltersValue } from '~/components/patterns/SalesDeliveryFiltersDrawer.vue'
import type { AmountComparator } from '~/components/patterns/AmountComparatorField.vue'
import { purchaseDeliveries } from '~/data'
import type { PurchaseDelivery } from '~/data'

const toggleAirene = inject<() => void>('toggleAirene')
const { t } = useLocale()

// ─── Column definitions ───────────────────────────────────────────────────────
const columns: TableColumn[] = [
  { key: 'date',              label: t('Date'),              kind: 'date',                                sortType: 'date'   },
  { key: 'number',            label: t('Number'),            kind: 'number', sortable: true,                sortType: 'number' },
  { key: 'processed',         label: '',                  width: '44px',  align: 'center', noHeader: true },
  { key: 'vendorName',        label: t('Vendor'),            kind: 'name', sortable: true,                sortType: 'text'   },
  { key: 'fulfillmentStatus', label: t('Fulfillment status'),kind: 'status',                                sortType: 'text'   },
  { key: 'billingStatus',     label: t('Billing status'),    kind: 'status',                                sortType: 'text'   },
  { key: 'total',             label: t('Total'),             kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'tags',              label: t('Tags'),              kind: 'tags'                                 },
]

// ─── Row type + flatten ─────────────────────────────────────────────────────────
type Row = PurchaseDelivery & { vendorName: string }

// Prototype preview toggle (FAB, bottom-right): data vs empty-state view
const previewMode = ref<'data' | 'empty'>('data')

const rows = computed<Row[]>(() =>
  previewMode.value === 'empty'
    ? []
    : purchaseDeliveries.map(pd => ({ ...pd, vendorName: pd.vendor.name })),
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
  { key: 'number',     label: t('Number') },
  { key: 'vendorName', label: t('Vendor') },
  { key: 'tags',       label: t('Tags')   },
]
const tagOptions = computed(() => [...new Set(purchaseDeliveries.flatMap(pd => pd.tags ?? []))].sort())

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
    const matchesSearch = String(row.number).includes(s) || row.vendorName.toLowerCase().includes(s)
    const matchesToolbar = (!fulfillment || row.fulfillmentStatus === fulfillment)
      && (!billingFilter.value || row.billingStatus === billingFilter.value)

    // ── Drawer filters (independent of the toolbar's selects / search) ──
    const f = appliedFilters
    const kw = f.keyword.toLowerCase().trim()
    const rowTags = row.tags ?? []
    const matchesKeyword = !kw || (
      f.keywordColumn === 'all'
        ? String(row.number).includes(kw) || row.vendorName.toLowerCase().includes(kw) || rowTags.some(tg => tg.toLowerCase().includes(kw))
        : f.keywordColumn === 'number' ? String(row.number).includes(kw)
        : f.keywordColumn === 'vendorName' ? row.vendorName.toLowerCase().includes(kw)
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
  copyItems.value = rs.map(r => ({ title: `${t('Purchase Delivery')} #${r.number}`, subtitle: r.vendorName, url: recordLink(r.id) }))
  copyOpen.value = true
}
function openShare(r: Row) {
  shareTitle.value = `${t('Purchase Delivery')} #${r.number}`
  shareSubject.value = `${t('Purchase Delivery')} #${r.number}`
  shareAttachment.value = `${r.number}.pdf`
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
    :loading="loading"
    :has-active-filter="!!search || !!statusFilter || !!billingFilter || isDrawerFilterActive"
    :search="search"
    has-checkbox
    :context-label="(row) => `${t('Purchase Delivery')} #${row.number}`"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
  >

    <!-- ── Bulk actions ── -->
    <template #bulk-actions>
      <MpPopover id="pd-bulk-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
        <MpPopoverTrigger>
          <MpButton size="sm" variant="secondary" right-icon="chevrons-down" is-rounded>{{ t('Actions') }}</MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent class="erp-dropdown-menu">
          <MpPopoverList>
            <MpPopoverListItem>{{ t('Process in fulfillment') }}</MpPopoverListItem>
            <MpPopoverListItem>{{ t('Create purchase invoice') }}</MpPopoverListItem>
            <MpPopoverListItem>{{ t('Print PDF') }}</MpPopoverListItem>
            <MpPopoverListItem @click="rows.length && openShare(rows[0])">{{ t('Share via email') }}</MpPopoverListItem>
            <MpPopoverListItem @click="openCopyLinks(rows.slice(0, 5) as Row[])">{{ t('Copy link') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Filter bar ── -->
    <template #filters>
      <!-- Left: Fulfillment + Billing status selects + All filters -->
      <div class="filter-left">
        <ErpFilterSelect id="pd-fulfillment-status" v-model="statusFilter" :placeholder="t('Fulfillment status')" :options="fulfillmentOptions" />

        <ErpFilterSelect id="pd-billing-status" v-model="billingFilter" :placeholder="t('Billing status')" :options="billingOptions" />

        <MpButton variant="secondary" left-icon="filter" is-rounded class="filter-all-btn" :class="{ 'filter-all-btn--active': isDrawerFilterActive }" @click="filtersOpen = true">{{ t('All filters') }}</MpButton>
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

    <!-- ── Cell: Number — "View details" on row hover (record has a detail page) ── -->
    <template #cell-number="{ row, value }">
      <span class="cell-link cell-text cell-number" @click.stop="navigateTo(`/purchase-deliveries/${(row as Row).id}`)">{{ t('Purchase Delivery') }} #{{ value }}</span>
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
        <MpButton variant="ghost" left-icon="truck" :aria-label="t('Processed in fulfillment')" is-rounded />
      </MpTooltip>
    </template>

    <!-- ── Cell: Vendor — "Open preview" on row hover (customer/vendor always previewable) ── -->
    <template #cell-vendorName="{ value }">
      <span class="cell-link cell-text" @click.stop>{{ value }}</span>
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

    <!-- ── Full empty state (no purchase deliveries yet) — illustration + title + CTA ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('No purchase deliveries') }}</p>
        <p class="empty-full-desc">{{ t('Purchase deliveries will appear here.') }}</p>
        <MpButton variant="secondary" left-icon="add" is-rounded @click="navigateTo('/purchase-deliveries/new')">{{ t('New purchase delivery') }}</MpButton>
      </div>
    </template>

    <!-- ── Actions — kebab → MpPopover dropdown (View details always first;
         share-via group separated by a divider) ── -->
    <template #actions="{ row }">
      <MpPopover :id="`pd-actions-${row.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem>{{ t('View details') }}</MpPopoverListItem>
            <MpPopoverListItem>{{ t('Create purchase invoice') }}</MpPopoverListItem>
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
    id="pd-allfilters"
    :is-open="filtersOpen"
    :model-value="appliedFilters"
    :columns="keywordColumns"
    :fulfillment-options="fulfillmentOptions"
    :billing-options="billingOptions"
    :tag-options="tagOptions"
    @update:is-open="filtersOpen = $event"
    @apply="applyDrawerFilters"
  />

  <ExportModal :open="exportOpen" :title="t('Export purchase deliveries')" entity-label="purchase deliveries" :columns="exportColumns" :custom-fields="[t('Sample custom field 1'), t('Sample custom field 2')]" :total="total" @close="exportOpen = false" @export="exportOpen = false" />
  <CopyLinkDrawer :open="copyOpen" :items="copyItems" @close="copyOpen = false" @download-csv="copyOpen = false" />
  <ShareViaEmailModal :open="shareOpen" :title="shareTitle" :subject="shareSubject" :attachment-name="shareAttachment" :attachment-size-k-b="128" sender-email="rizal.candra@centralperk.co.id" @close="shareOpen = false" @send="shareOpen = false" />

  <ScenarioFab v-model="previewMode" />
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
