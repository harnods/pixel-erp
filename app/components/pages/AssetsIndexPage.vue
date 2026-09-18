<script setup lang="ts">
/**
 * Assets — the fixed-asset register.
 *
 * Accounting › Fixed assets › Assets. The spine of the module: every other
 * asset screen links back here.
 *
 * What makes this table unlike the other ERP index pages is that it carries two
 * sets of numbers for the same asset. The commercial book follows the economics
 * (how long the company expects to use the asset); the fiscal book follows
 * Pasal 11 of the Income Tax Law (a statutory group and a statutory life). They
 * rarely agree, and the difference is what the annual tax return reports. The
 * book switcher lets the reader see either or both.
 *
 * Three rules from the approved design that the code below enforces:
 *
 *  1. An absent fiscal figure is never 0. FA-0077 has no tax group, so its
 *     fiscal book value reads "Not computed" — a zero would read as an
 *     unfinished calculation rather than an unanswerable one.
 *  2. FA-0077 is surfaced, not filtered out. It is excluded from the fiscal
 *     book, the difference total and Lampiran 9, and the screen says so with a
 *     banner that offers the two ways to fix it.
 *  3. Disposed assets are excluded from the totals — they are no longer held —
 *     and show "—" for book value rather than a stale number.
 */
import { computed, ref } from 'vue'
import { MpButton, MpIcon, MpTooltip, MpButtonGroup, MpSegmentedControl, MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem } from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import { infoToast, successToast } from '~/utils/toasts'
import {
  fixedAssets,
  assetClasses,
  assetBranches,
  assetTaxGroups,
  registerTotals,
  fiscalAbsenceReason,
  type FixedAsset,
} from '~/data/fixedAssets'

const { t } = useLocale()
const toggleAirene = inject<() => void>('toggleAirene')

// ── Which book is on screen ─────────────────────────────────────────────────
// Both is the default: the whole point of the register is that the two numbers
// differ, and hiding one hides the reason this module exists.
type BookView = 'both' | 'commercial' | 'fiscal'
const book = ref<BookView>('both')
/** Shape MpSegmentedControl expects: an id and a value per option. */
const bookOptions = [
  { id: 'book-both', value: 'both', label: 'Both books' },
  { id: 'book-commercial', value: 'commercial', label: 'Commercial' },
  { id: 'book-fiscal', value: 'fiscal', label: 'Fiscal' },
]

// ── Filters ─────────────────────────────────────────────────────────────────
// Two filters stay inline; branch and tax group live in the All filters drawer
// (rule/filter-bar-anatomy — the left group is inline filters + All filters,
// and four dropdowns plus the book switcher will not fit on one row).
const search = ref('')
const classFilter = ref('')
const branchFilter = ref('')
const statusFilter = ref('')
const taxGroupFilter = ref('')
const filtersOpen = ref(false)

const statusOptions = ['Active', 'Impaired', 'Disposed', 'Fully depreciated', 'Incomplete']

/** How many of the drawer-held filters are set, for the button's count. */
const activeDrawerFilters = computed(() =>
  [branchFilter.value, taxGroupFilter.value].filter(Boolean).length,
)

const hasActiveFilter = computed(() =>
  !!(search.value || classFilter.value || branchFilter.value || statusFilter.value || taxGroupFilter.value),
)
function clearFilters() {
  search.value = ''
  classFilter.value = ''
  branchFilter.value = ''
  statusFilter.value = ''
  taxGroupFilter.value = ''
}

// ── Rows ────────────────────────────────────────────────────────────────────
const filtered = computed<FixedAsset[]>(() => {
  const q = search.value.trim().toLowerCase()
  return fixedAssets.filter((a) => {
    if (classFilter.value && a.class !== classFilter.value) return false
    if (branchFilter.value && a.branch !== branchFilter.value) return false
    if (statusFilter.value && a.status !== statusFilter.value) return false
    if (taxGroupFilter.value && a.taxGroup !== taxGroupFilter.value) return false
    if (!q) return true
    return (
      a.name.toLowerCase().includes(q) ||
      a.id.toLowerCase().includes(q) ||
      (a.tag ?? '').toLowerCase().includes(q) ||
      (a.custodian ?? '').toLowerCase().includes(q)
    )
  })
})

// ── Sorting ─────────────────────────────────────────────────────────────────
const sortKey = ref('name')
const sortDir = ref<'asc' | 'desc'>('asc')
function toggleSort(key: string) {
  if (sortKey.value === key) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else { sortKey.value = key; sortDir.value = 'asc' }
}
function setSort(key: string, dir: 'asc' | 'desc') { sortKey.value = key; sortDir.value = dir }

/** dd/mm/yyyy → sortable yyyymmdd. The register displays Indonesian date order. */
function dateOrder(d: string): number {
  const [dd, mm, yyyy] = d.split('/')
  return Number(`${yyyy}${mm}${dd}`)
}

const sorted = computed<FixedAsset[]>(() => {
  const rows = [...filtered.value]
  const dir = sortDir.value === 'asc' ? 1 : -1
  rows.sort((a, b) => {
    switch (sortKey.value) {
      case 'acquired': return (dateOrder(a.acquired) - dateOrder(b.acquired)) * dir
      case 'cost': return (a.cost - b.cost) * dir
      case 'bookValueCommercial': return (a.bookValueCommercial - b.bookValueCommercial) * dir
      // Unclassified assets have no fiscal value to compare. They sort last in
      // either direction rather than being treated as zero, which would put
      // them among the fully-depreciated assets and imply something untrue.
      case 'bookValueFiscal': {
        if (a.bookValueFiscal === null) return 1
        if (b.bookValueFiscal === null) return -1
        return (a.bookValueFiscal - b.bookValueFiscal) * dir
      }
      default: {
        const av = String(a[sortKey.value as keyof FixedAsset] ?? '')
        const bv = String(b[sortKey.value as keyof FixedAsset] ?? '')
        return av.localeCompare(bv) * dir
      }
    }
  })
  return rows
})

// ── Pagination ──────────────────────────────────────────────────────────────
const currentPage = ref(1)
const perPage = ref(25)
const total = computed(() => sorted.value.length)
const paginated = computed(() =>
  sorted.value.slice((currentPage.value - 1) * perPage.value, currentPage.value * perPage.value),
)
function setPage(p: number) { currentPage.value = p }
function setPerPage(n: number) { perPage.value = n; currentPage.value = 1 }

// ── Columns ─────────────────────────────────────────────────────────────────
// The fiscal columns come and go with the book switcher rather than being
// blanked, so a reader in Commercial view is never looking at an empty column
// wondering whether the data is missing.
const columnVisibility = ref<Record<string, boolean>>({})
function hideColumn(key: string) { columnVisibility.value[key] = false }

const allColumns = computed<TableColumn[]>(() => {
  const cols: TableColumn[] = [
    { key: 'name', label: t('Asset'), kind: 'name', sortable: true, sortType: 'text' },
    { key: 'class', label: t('Class'), kind: 'default', sortable: true, sortType: 'text' },
    { key: 'acquired', label: t('Acquired'), kind: 'date', sortable: true, sortType: 'date', align: 'left' },
    { key: 'cost', label: t('Acquisition cost'), kind: 'amount', sortable: true, sortType: 'number', align: 'right' },
  ]
  if (book.value !== 'fiscal') {
    cols.push({ key: 'bookValueCommercial', label: t('Book value'), kind: 'amount', sortable: true, sortType: 'number', align: 'right' })
  }
  if (book.value !== 'commercial') {
    cols.push({ key: 'bookValueFiscal', label: t('Fiscal book value'), kind: 'amount', sortable: true, sortType: 'number', align: 'right' })
    cols.push({ key: 'taxGroup', label: t('Tax group'), kind: 'default', sortable: true, sortType: 'text' })
  }
  cols.push({ key: 'branch', label: t('Branch'), kind: 'default', sortable: true, sortType: 'text' })
  cols.push({ key: 'status', label: t('Status'), kind: 'status', sortable: true, sortType: 'text' })
  return cols
})
const visibleColumns = computed(() => allColumns.value.filter((c) => columnVisibility.value[c.key] !== false))
const columnItems = computed(() => allColumns.value.map((c) => ({ key: c.key, label: c.label })))

// ── Totals ──────────────────────────────────────────────────────────────────
const totals = computed(() => registerTotals(filtered.value))

// ── The unclassified asset ──────────────────────────────────────────────────
// Surfaced rather than filtered: an asset that cannot be depreciated on the tax
// basis is a blocker for the whole fiscal output, so the register is where it
// has to be visible and where it will be fixed.
const unclassified = computed(() => fixedAssets.filter((a) => a.taxGroup === null))

function assignTaxGroup() {
  infoToast(t('Assigning a tax group is not part of this screen yet.'))
}
function applyClassDefault() {
  infoToast(t('Applying the class default is not part of this screen yet.'))
}

// ── Row actions ─────────────────────────────────────────────────────────────
const router = useRouter()
function openAsset(a: FixedAsset) {
  // The asset record is the next screen in this module; until it exists the
  // row still behaves like a link so the interaction reads correctly.
  infoToast(t(`${a.id} — the asset record is not part of this screen yet.`))
}
function runDepreciation() {
  successToast(t('Depreciation run queued for September 2026.'))
}

/** Fiscal book value, or the reason there is not one. Never a zero. */
function fiscalBookValue(a: FixedAsset): { text: string; muted: boolean } {
  if (a.status === 'Disposed') return { text: '—', muted: true }
  if (a.bookValueFiscal === null) return { text: t(fiscalAbsenceReason(a)), muted: false }
  return { text: formatIDR(a.bookValueFiscal), muted: false }
}
function commercialBookValue(a: FixedAsset): { text: string; muted: boolean } {
  // A disposed asset has no book value — the company no longer holds it, which
  // is a different statement from holding something worth nothing.
  if (a.status === 'Disposed' || a.bookValueCommercial === null) {
    return { text: '—', muted: true }
  }
  return { text: formatIDR(a.bookValueCommercial), muted: false }
}
</script>

<template>
  <ErpTablePage
    :columns="visibleColumns"
    :rows="(paginated as unknown as Record<string, unknown>[])"
    :total="total"
    :current-page="currentPage"
    :per-page="perPage"
    :sort-key="sortKey"
    :sort-dir="sortDir"
    has-checkbox
    filter-empty-label="asset"
    bulk-label="asset"
    :search="search"
    :has-active-filter="hasActiveFilter"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
  >
    <!-- ── Filters ── -->
    <!-- rule/filter-bar-anatomy — left: inline filters + All filters.
         right: icon tools, then search as the rightmost element.
         The book switcher is deliberately NOT here: at three segments it is
         306px wide and the bar has no room for it beside two filters, the
         All filters button and the search pill. It sits above the table with
         the totals it governs, where it also reads as what it is — a choice
         about which figures the whole screen reports. -->
    <template #filters>
      <div class="filter-left">
        <ErpFilterSelect id="asset-class" v-model="classFilter" :placeholder="t('Class')" :options="assetClasses" />
        <ErpFilterSelect id="asset-status" v-model="statusFilter" :placeholder="t('Status')" :options="statusOptions" />
        <MpButton class="filter-all-btn" is-rounded variant="secondary" @click="filtersOpen = true">
          {{ t('All filters') }}{{ activeDrawerFilters ? ` (${activeDrawerFilters})` : '' }}
        </MpButton>
      </div>

      <div class="filter-right">
        <MpButtonGroup class="filter-btn-group">
          <MpTooltip :label="t('Ask Airene')" placement="bottom">
            <MpButton class="filter-airene-btn" variant="ghost" left-icon="airene-brand" :aria-label="t('Ask Airene')" is-rounded @click="toggleAirene?.()" />
          </MpTooltip>
          <ColumnSettingsMenu id="asset-columns" :items="columnItems" :visibility="columnVisibility" />
          <MpTooltip :label="t('Export')" placement="bottom">
            <MpButton variant="ghost" left-icon="download" :aria-label="t('Export')" is-rounded @click="infoToast(t('Export is not part of this screen yet.'))" />
          </MpTooltip>
        </MpButtonGroup>

        <div class="filter-search">
          <MpIcon name="search" size="sm" />
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search asset, tag, custodian…')" />
        </div>
      </div>
    </template>

    <!-- ── The blocking condition, stated rather than hidden ── -->
    <template #stats>
      <div v-if="unclassified.length" class="asset-alert">
        <MpBanner id="asset-unclassified-banner" variant="warning">
          <MpBannerIcon id="asset-unclassified-icon" />
          <MpBannerTitle>
            {{ unclassified.length }}
            {{ t(unclassified.length === 1 ? 'asset cannot be depreciated on the tax basis' : 'assets cannot be depreciated on the tax basis') }}
          </MpBannerTitle>
          <MpBannerDescription>
            {{ unclassified.map((a) => `${a.id} ${a.name}`).join(', ') }}
            {{ t(unclassified.length === 1 ? 'has no tax group, so it is excluded from the fiscal book, from the difference total, and from Lampiran 9.' : 'have no tax group, so they are excluded from the fiscal book, from the difference total, and from Lampiran 9.') }}
          </MpBannerDescription>
        </MpBanner>
        <!-- The two ways out sit under the banner as real buttons. As banner
             links they read as body copy and nobody finds them. -->
        <div class="asset-alert__actions">
          <MpButton variant="secondary" is-rounded @click="assignTaxGroup">{{ t('Assign a tax group') }}</MpButton>
          <MpButton variant="secondary" is-rounded @click="applyClassDefault">{{ t('Apply the class default') }}</MpButton>
        </div>
      </div>

      <!-- Totals in a card, with the book switcher above them: the switcher
           governs which of these figures appear, so it reads as a heading for
           them rather than as another filter. Two rows, because four large
           figures and a three-segment switcher do not fit on one. -->
      <div class="asset-summary">
        <div class="asset-summary__switch">
          <MpSegmentedControl
            id="asset-book-switch"
            name="asset-book-switch"
            v-model="book"
            :data="bookOptions"
          />
        </div>
        <div class="asset-totals">
          <div class="asset-total">
            <div class="asset-total__label">{{ t('Assets') }}</div>
            <div class="asset-total__value">{{ totals.count }}</div>
          </div>
          <div class="asset-total">
            <div class="asset-total__label">{{ t('Acquisition cost') }}</div>
            <div class="asset-total__value">{{ formatIDR(totals.cost) }}</div>
          </div>
          <div v-if="book !== 'fiscal'" class="asset-total">
            <div class="asset-total__label">{{ t('Book value') }}</div>
            <div class="asset-total__value">{{ formatIDR(totals.bookValueCommercial) }}</div>
          </div>
          <div v-if="book !== 'commercial'" class="asset-total">
            <div class="asset-total__label">{{ t('Fiscal book value') }}</div>
            <div class="asset-total__value">{{ formatIDR(totals.bookValueFiscal) }}</div>
            <!-- A fiscal total that silently omits an asset is the same mistake
                 as a fiscal cell showing 0. Say what is missing and why. -->
            <div v-if="totals.unclassified" class="asset-total__note">
              {{ t('excludes') }} {{ totals.unclassified }}
              {{ t(totals.unclassified === 1 ? 'asset with no tax group' : 'assets with no tax group') }}
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ── Cells ── -->
    <template #cell-name="{ row }">
      <!-- rule/table-name-link-span — a clickable name in a cell is a span
           styled as a link, not a button and not MpTextlink. -->
      <span class="asset-name" @click="openAsset(row as unknown as FixedAsset)">
        <span class="asset-name__label">{{ (row as unknown as FixedAsset).name }}</span>
        <span class="asset-name__sub">
          {{ (row as unknown as FixedAsset).id }}
          <template v-if="(row as unknown as FixedAsset).tag"> · {{ (row as unknown as FixedAsset).tag }}</template>
        </span>
      </span>
    </template>

    <template #cell-cost="{ row }">
      {{ formatIDR((row as unknown as FixedAsset).cost) }}
    </template>

    <template #cell-bookValueCommercial="{ row }">
      <span :class="{ 'cell-muted': commercialBookValue(row as unknown as FixedAsset).muted }">
        {{ commercialBookValue(row as unknown as FixedAsset).text }}
      </span>
    </template>

    <!-- An absent fiscal figure states why. Never a zero. -->
    <template #cell-bookValueFiscal="{ row }">
      <span
        :class="{
          'cell-muted': fiscalBookValue(row as unknown as FixedAsset).muted,
          'cell-absent': (row as unknown as FixedAsset).bookValueFiscal === null && (row as unknown as FixedAsset).status !== 'Disposed',
        }"
      >{{ fiscalBookValue(row as unknown as FixedAsset).text }}</span>
    </template>

    <template #cell-taxGroup="{ row }">
      <span v-if="(row as unknown as FixedAsset).taxGroup">{{ (row as unknown as FixedAsset).taxGroup }}</span>
      <span v-else class="cell-absent">{{ t('Not set') }}</span>
    </template>

    <template #cell-status="{ row }">
      <ErpStatusBadge :status="(row as unknown as FixedAsset).status.toLowerCase()" />
    </template>

    <!-- ── Row actions ── -->
    <template #actions="{ row }">
      <MpPopover :id="`asset-row-${(row as unknown as FixedAsset).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
        </MpPopoverTrigger>
        <MpPopoverContent class="erp-dropdown-menu">
          <MpPopoverList>
            <MpPopoverListItem @click="openAsset(row as unknown as FixedAsset)">{{ t('View asset') }}</MpPopoverListItem>
            <MpPopoverListItem @click="infoToast(t('Depreciation schedule is not part of this screen yet.'))">{{ t('Depreciation schedule') }}</MpPopoverListItem>
            <MpPopoverListItem v-if="!(row as unknown as FixedAsset).taxGroup" @click="assignTaxGroup">{{ t('Assign tax group') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Bulk ── -->
    <template #bulk-actions>
      <MpPopover id="asset-bulk-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
        <MpPopoverTrigger>
          <MpButton size="sm" variant="secondary" right-icon="chevrons-down" is-rounded>{{ t('Actions') }}</MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent class="erp-dropdown-menu">
          <MpPopoverList>
            <MpPopoverListItem @click="assignTaxGroup">{{ t('Assign tax group') }}</MpPopoverListItem>
            <MpPopoverListItem @click="infoToast(t('Export is not part of this screen yet.'))">{{ t('Export selected') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <template #empty>
      <div class="asset-empty">
        <div class="asset-empty__title">{{ t('Nothing matches these filters') }}</div>
        <MpButton variant="secondary" is-rounded @click="clearFilters">{{ t('Clear filters') }}</MpButton>
      </div>
    </template>
  </ErpTablePage>
</template>

<style scoped>
/* rule/filter-bar-anatomy — left: inline filters + All filters; right: tools
   then search. rule/filter-bar-left-gap — the left gap is always 16px. */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); flex: 0 1 auto; min-width: 0; }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-2); margin-left: auto; flex: none; }

.asset-alert { margin-bottom: var(--mp-spacing-3); }
.asset-alert__actions { display: flex; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-2); }

/* Totals read as a summary of the table, so they sit in the same kind of
   surface rather than floating on the page background. */
.asset-summary {
  padding: var(--mp-spacing-4);
  margin-bottom: var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral);
}
.asset-summary__switch { margin-bottom: var(--mp-spacing-4); }
.asset-totals {
  display: flex;
  gap: var(--mp-spacing-8);
  flex-wrap: wrap;
}
.asset-total__label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm); }
.asset-total__value { font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: var(--mp-line-heights-lg); font-variant-numeric: tabular-nums; }
.asset-total__note { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-critical); line-height: var(--mp-line-heights-sm); }

/* rule/table-name-link-span — a span styled as a link, not a button. */
.asset-name {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--mp-spacing-1);
  cursor: pointer;
  /* The name cell carries two lines. Without this the sub-line escapes the
     cell box and collides with the next column. */
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}
.asset-name__label {
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-link);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.asset-name:hover .asset-name__label { text-decoration: underline; }
.asset-name__sub {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* A figure that is absent for a stated reason, not a zero. Red carries the
   same weight as the Incomplete badge on the same row. */
.cell-absent { color: var(--mp-text-critical); font-weight: var(--mp-font-weights-semi-bold); }
/* A figure that no longer applies — a disposed asset has no book value. */
.cell-muted { color: var(--mp-text-subtle); }

.asset-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-10) 0;
}
.asset-empty__title { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
