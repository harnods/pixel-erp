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
import ExportModal from '~/components/patterns/ExportModal.vue'
import { infoToast, successToast } from '~/utils/toasts'
import AssetFiltersDrawer from '~/components/patterns/AssetFiltersDrawer.vue'
import NewAssetDrawer from '~/components/patterns/NewAssetDrawer.vue'
import { fixedAssets, canSeeFinancials, viewAs } from '~/data/assetStore'
import { conditionOf, unassignedAssets } from '~/data/assetCustody'
import { newAssetDrawerOpen } from '~/data/fixedAssetSession'
import {
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
// Accounting is the default. It is the day-to-day view, and showing both books
// at once puts two large IDR figures on every row for a comparison most
// readers are not making.
//
// The labels name what each number is FOR, not the method behind it:
// "accounting" goes in the financial statements, "tax" goes in the tax return.
// The statutory vocabulary (komersial / fiskal) is correct but names the
// method, which only a tax preparer reads fluently — and the register is where
// general affairs, internal audit and accounting all land.
type BookView = 'accounting' | 'tax' | 'both'
const book = ref<BookView>('accounting')
/** Shape MpSegmentedControl expects: an id and a value per option. */
const bookOptions = [
  { id: 'book-accounting', value: 'accounting', label: 'Accounting' },
  { id: 'book-tax', value: 'tax', label: 'Tax' },
  { id: 'book-both', value: 'both', label: 'Both' },
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

function onApplyFilters(v: { branch: string; taxGroup: string }) {
  branchFilter.value = v.branch
  taxGroupFilter.value = v.taxGroup
  filtersOpen.value = false
}

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

/**
 * Whether the count above is a filtered subset rather than the whole register.
 *
 * The "Show all" link only means something while something is hidden — shown
 * unconditionally it is a link that does nothing, which is worse than no link.
 */
const isFiltered = computed(() =>
  !!(search.value || classFilter.value || branchFilter.value || statusFilter.value || taxGroupFilter.value),
)

// ── Rows ────────────────────────────────────────────────────────────────────
const filtered = computed<FixedAsset[]>(() => {
  const q = search.value.trim().toLowerCase()
  return fixedAssets.value.filter((a) => {
    if (classFilter.value && a.class !== classFilter.value) return false
    if (branchFilter.value && a.branch !== branchFilter.value) return false
    if (statusFilter.value && a.status !== statusFilter.value) return false
    if (taxGroupFilter.value && a.taxGroup !== taxGroupFilter.value) return false
    if (!q) return true
    return (
      a.name.toLowerCase().includes(q) ||
      a.id.toLowerCase().includes(q) ||
      (a.tag ?? '').toLowerCase().includes(q) ||
      (a.custodian ?? '').toLowerCase().includes(q) ||
      // TS-05: location and condition are searchable too, so "Medan
      // Warehouse" or "damaged" finds what sits there or needs attention.
      (a.location ?? '').toLowerCase().includes(q) ||
      (conditionOf(a) ?? '').toLowerCase() === q
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
  ]
  // LR-6: a role scoped to the physical pane sees no cost or book value at all.
  if (!canSeeFinancials.value) {
    cols.push({ key: 'location', label: t('Location'), kind: 'default', sortable: true, sortType: 'text' })
    cols.push({ key: 'custodian', label: t('Custodian'), kind: 'default', sortable: true, sortType: 'text' })
    cols.push({ key: 'condition', label: t('Condition'), kind: 'default' })
    cols.push({ key: 'branch', label: t('Branch'), kind: 'default', sortable: true, sortType: 'text' })
    cols.push({ key: 'status', label: t('Status'), kind: 'status', sortable: true, sortType: 'text' })
    return cols
  }
  cols.push({ key: 'cost', label: t('Cost'), kind: 'amount', sortable: true, sortType: 'number', align: 'right' })
  // The tax column only appears when the tax view is on, so a reader in the
  // accounting view is never looking at an empty column wondering whether the
  // data failed to load.
  if (book.value !== 'tax') {
    cols.push({ key: 'bookValueCommercial', label: t('Book value'), kind: 'amount', sortable: true, sortType: 'number', align: 'right' })
  }
  if (book.value !== 'accounting') {
    cols.push({ key: 'bookValueFiscal', label: t('Tax book value'), kind: 'amount', sortable: true, sortType: 'number', align: 'right' })
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
// Reported in the stats row rather than in a banner: it is one row out of
// twenty-four, and the place to act on it is the filtered table.
const unclassified = computed(() => fixedAssets.value.filter((a) => a.taxGroup === null))

/** Filter the table down to the assets the fiscal total had to leave out. */
function showUnclassified() {
  clearFilters()
  statusFilter.value = 'Incomplete'
}

/**
 * Setting the statutory group is a per-asset fix, so it lives on the row and in
 * the bulk bar — not as a page-level button. One asset's problem does not need
 * a control at the top of the screen.
 */
function assignTaxGroup() {
  infoToast(t('Assigning a tax group is done on the asset record.'))
}

// rule/export-modal — export opens the shared modal, never a silent download.
const exportOpen = ref(false)
const exportColumns = [
  { key: 'id', label: t('Asset number') },
  { key: 'name', label: t('Asset') },
  { key: 'class', label: t('Class') },
  { key: 'acquired', label: t('Acquired') },
  { key: 'cost', label: t('Acquisition cost') },
  { key: 'bookValueCommercial', label: t('Book value') },
  { key: 'bookValueFiscal', label: t('Tax book value') },
  { key: 'taxGroup', label: t('Tax group') },
  { key: 'branch', label: t('Branch') },
  { key: 'status', label: t('Status') },
  { key: 'custodian', label: t('Custodian') },
  { key: 'tag', label: t('Physical tag') },
]
function onExport() {
  exportOpen.value = false
  successToast(t('Export ready — check your downloads'))
}

// ── Row actions ─────────────────────────────────────────────────────────────
const router = useRouter()
function openAsset(a: FixedAsset) {
  router.push(`/assets/${a.id}`)
}
function onCreated(id: string) {
  newAssetDrawerOpen.value = false
  successToast(t(`${id} created. It is in the register and the schedule`))
  router.push(`/assets/${id}`)
}
function runDepreciation() {
  router.push('/depreciation-schedule')
}

/** Fiscal book value, or the reason there is not one. Never a zero. */
function fiscalBookValue(a: FixedAsset): { text: string; muted: boolean } {
  if (a.status === 'Disposed' || a.status === 'Split') return { text: '—', muted: true }
  if (a.bookValueFiscal === null) return { text: t(fiscalAbsenceReason(a)), muted: false }
  return { text: formatIDR(a.bookValueFiscal), muted: false }
}
function commercialBookValue(a: FixedAsset): { text: string; muted: boolean } {
  // A disposed asset has no book value — the company no longer holds it, which
  // is a different statement from holding something worth nothing.
  if (a.status === 'Disposed' || a.status === 'Split' || a.bookValueCommercial === null) {
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
        <!-- Appears only while a filter is actually hiding rows — sitting
             beside the controls that caused the filtering, not up in the
             stats where a reader has to work out what it undoes. -->
        <MpButton v-if="isFiltered" class="filter-clear-btn" is-rounded variant="ghost" @click="clearFilters">
          {{ t('Clear filters') }}
        </MpButton>
      </div>

      <div class="filter-right">
        <MpButtonGroup class="filter-btn-group">
          <MpTooltip :label="t('Ask Airene')" placement="bottom">
            <MpButton class="filter-airene-btn" variant="ghost" left-icon="airene-brand" :aria-label="t('Ask Airene')" is-rounded @click="toggleAirene?.()" />
          </MpTooltip>
          <ColumnSettingsMenu id="asset-columns" :items="columnItems" :visibility="columnVisibility" />
          <MpTooltip :label="t('Export')" placement="bottom">
            <MpButton variant="ghost" left-icon="download" :aria-label="t('Export')" is-rounded @click="exportOpen = true" />
          </MpTooltip>
        </MpButtonGroup>

        <div class="filter-search">
          <MpIcon name="search" size="sm" />
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search asset, tag, custodian, location…')" />
        </div>
      </div>
    </template>

    <!-- ── Stats ── -->
    <!-- Divider-separated columns on the stage, matching Expenses and Cash
         management. No card: no other index page boxes its stats.
         The unclassified asset is reported here as a drillable link rather
         than as a banner — it is one row out of 24, and the place to act on
         it is the filtered table, not a page-level alert. -->
    <template #stats>
      <!-- The switcher sits above the figures it governs. Four IDR amounts and
           a three-segment control do not fit on one row at this width, and
           shrinking the amounts to fit would make the register's primary
           numbers the smallest thing on the screen. -->
      <div class="stats-wrap">
        <div v-if="canSeeFinancials" class="stats-switch">
          <MpSegmentedControl
            id="asset-book-switch"
            name="asset-book-switch"
            v-model="book"
            :data="bookOptions"
          />
        </div>

        <div class="stats-section">
          <div class="stat-card stat-card--bordered">
            <div class="stat-title">{{ t('Assets') }}</div>
            <div class="stat-period">{{ isFiltered ? t('Matching the filters') : t('In the register') }}</div>
            <div class="stat-amount">{{ totals.count }}</div>
          </div>

          <div v-if="!canSeeFinancials" class="stat-card stat-card--bordered" data-tour="reg-view">
            <div class="stat-title">{{ t(`Viewing as ${viewAs}`) }}</div>
            <div class="stat-period">{{ t('Cost and book values are not shown to this role') }}</div>
          </div>
          <div v-if="!canSeeFinancials" class="stat-card">
            <div class="stat-title">{{ t('Custody gaps') }}</div>
            <div class="stat-period">{{ t('No custodian or no location') }}</div>
            <div class="stat-amount">{{ unassignedAssets.length }}</div>
            <span v-if="unassignedAssets.length" class="stat-link stat-link--warn" @click="router.push('/custody-and-counts')">{{ t('Assign on Custody and counts') }}</span>
          </div>

          <div v-if="canSeeFinancials" class="stat-card stat-card--bordered">
            <div class="stat-title">{{ t('Cost') }}</div>
            <div class="stat-period">{{ t('Held assets') }}</div>
            <div class="stat-amount">{{ formatIDR(totals.cost) }}</div>
          </div>

          <div v-if="canSeeFinancials && book !== 'tax'" class="stat-card stat-card--bordered">
            <div class="stat-title">{{ t('Book value') }}</div>
            <div class="stat-period">{{ t('Accounting · at 30/09/2026') }}</div>
            <div class="stat-amount">{{ formatIDR(totals.bookValueCommercial) }}</div>
          </div>

          <div v-if="canSeeFinancials && book !== 'accounting'" class="stat-card">
            <div class="stat-title">{{ t('Tax book value') }}</div>
            <div class="stat-period">{{ t('Tax basis · at 30/09/2026') }}</div>
            <!-- When every filtered asset is unclassified there is no fiscal
                 total to state. Rp0,00 would claim the population is worth
                 nothing on the tax basis; it has no tax basis at all. -->
            <div v-if="totals.count && !totals.unclassified || totals.bookValueFiscal" class="stat-amount">
              {{ formatIDR(totals.bookValueFiscal) }}
            </div>
            <div v-else class="stat-amount stat-amount--absent">{{ t('Not computed') }}</div>
            <!-- The exclusion is the link, so naming the problem and reaching it
                 are the same action. -->
            <span
              v-if="totals.unclassified"
              class="stat-link stat-link--warn"
              @click="showUnclassified"
            >
              {{ totals.unclassified }}
              {{ t(totals.unclassified === 1 ? 'asset excluded, no tax group' : 'assets excluded, no tax group') }}
            </span>
          </div>
        </div>

        <!-- The book switcher moved above the figures; see the comment there. -->
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

    <!-- FG-4.3: a missing custodian or location is a named gap, not a blank. -->
    <template #cell-location="{ row }">
      <span v-if="(row as unknown as FixedAsset).location">{{ (row as unknown as FixedAsset).location }}</span>
      <span v-else class="cell-absent">{{ t('Not recorded') }}</span>
    </template>
    <template #cell-custodian="{ row }">
      <span v-if="(row as unknown as FixedAsset).custodian">{{ (row as unknown as FixedAsset).custodian }}</span>
      <span v-else-if="(row as unknown as FixedAsset).type === 'Tangible'" class="cell-absent">{{ t('Unassigned') }}</span>
      <span v-else class="cell-muted">{{ t('Not physical') }}</span>
    </template>
    <template #cell-condition="{ row }">
      <span v-if="conditionOf(row as unknown as FixedAsset)">{{ t(conditionOf(row as unknown as FixedAsset)!) }}</span>
      <span v-else class="cell-muted">{{ t('Not physical') }}</span>
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
            <MpPopoverListItem v-if="canSeeFinancials" @click="router.push('/depreciation-schedule')">{{ t('Depreciation schedule') }}</MpPopoverListItem>
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

  <AssetFiltersDrawer
    :is-open="filtersOpen"
    :branch="branchFilter"
    :tax-group="taxGroupFilter"
    @close="filtersOpen = false"
    @apply="onApplyFilters"
  />

  <NewAssetDrawer :is-open="newAssetDrawerOpen" @close="newAssetDrawerOpen = false" @created="onCreated" />

  <ExportModal
    :open="exportOpen"
    :title="t('Export assets')"
    :entity-label="t('assets')"
    :columns="exportColumns"
    :total="total"
    @close="exportOpen = false"
    @export="onExport"
  />
</template>

<style scoped>
/* rule/filter-bar-anatomy — left: inline filters + All filters; right: tools
   then search. rule/filter-bar-left-gap — the left gap is always 16px. */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); flex: 0 1 auto; min-width: 0; }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-2); margin-left: auto; flex: none; }

/* Stats — divider-separated columns, matching BillsIndexPage and
   CashManagementPage. No card: index pages do not box their stats. */
.stats-wrap { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.stats-switch { display: flex; }
/* erp.css gives segments `flex: 1 1 0; min-width: 0` so they share the track
   equally. With a long label ("Accounting" needs 110px including the pill's
   own padding) the zero floor lets the segment shrink under its text, and the
   root's `width: fit-content` then measures the collapsed basis rather than
   the content — the label renders wider than its own pill. Flooring each
   segment at its content width keeps the equal-width behaviour and stops the
   overflow. */
.stats-switch :deep(.mp-segmented-control__item) { min-width: max-content; }
.stats-section { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.stat-card {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
  padding-right: var(--mp-spacing-6);
  align-self: stretch;
}
.stat-card--bordered { border-right: 1px solid var(--mp-border-default); }
.stat-title {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  line-height: var(--mp-line-heights-md);
  white-space: nowrap;
}
.stat-period {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-sm);
  white-space: nowrap;
}
.stat-amount {
  font-size: var(--mp-font-sizes-xl);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  line-height: var(--mp-line-heights-2xl);
  white-space: nowrap;
}
/* A total that cannot be computed says so. Never Rp0,00. */
.stat-amount--absent { color: var(--mp-text-danger); }
.stat-link {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-link);
  line-height: var(--mp-line-heights-sm);
  cursor: pointer;
  white-space: nowrap;
}
.stat-link:hover { text-decoration: underline; }
/* The exclusion reads as something to act on, not as decoration. */
.stat-link--warn { color: var(--mp-text-danger); }

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
.cell-absent { color: var(--mp-text-danger); font-weight: var(--mp-font-weights-semi-bold); }
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
