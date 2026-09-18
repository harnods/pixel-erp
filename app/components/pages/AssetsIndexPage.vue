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
import { MpButton, MpIcon, MpTooltip, MpButtonGroup, MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription, MpBannerLink, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem } from '@mekari/pixel3'
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
const bookOptions: { value: BookView; label: string }[] = [
  { value: 'both', label: 'Both books' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'fiscal', label: 'Fiscal' },
]

// ── Filters ─────────────────────────────────────────────────────────────────
const search = ref('')
const classFilter = ref('')
const branchFilter = ref('')
const statusFilter = ref('')
const taxGroupFilter = ref('')

const statusOptions = ['Active', 'Impaired', 'Disposed', 'Fully depreciated', 'Incomplete']

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
  if (a.status === 'Disposed') return { text: '—', muted: true }
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
    <template #filters>
      <div class="filter-left">
        <ErpFilterSelect id="asset-class" v-model="classFilter" :placeholder="t('Class')" :options="assetClasses" />
        <ErpFilterSelect id="asset-branch" v-model="branchFilter" :placeholder="t('Branch')" :options="assetBranches" />
        <ErpFilterSelect id="asset-status" v-model="statusFilter" :placeholder="t('Status')" :options="statusOptions" />
        <ErpFilterSelect id="asset-taxgroup" v-model="taxGroupFilter" :placeholder="t('Tax group')" :options="assetTaxGroups" />
      </div>

      <div class="filter-right">
        <!-- The book switcher. Sits with the filters because that is what it is:
             it narrows what the table reports, not what it contains. -->
        <div class="book-switch" role="group" :aria-label="t('Book')">
          <button
            v-for="opt in bookOptions"
            :key="opt.value"
            type="button"
            class="book-switch__btn"
            :class="{ 'book-switch__btn--active': book === opt.value }"
            :aria-pressed="book === opt.value"
            @click="book = opt.value"
          >{{ t(opt.label) }}</button>
        </div>

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
        <MpBanner type="warning" is-rounded>
          <MpBannerIcon />
          <MpBannerTitle>
            {{ unclassified.length }}
            {{ t(unclassified.length === 1 ? 'asset cannot be depreciated on the tax basis' : 'assets cannot be depreciated on the tax basis') }}
          </MpBannerTitle>
          <MpBannerDescription>
            {{ unclassified.map((a) => `${a.id} ${a.name}`).join(', ') }}
            {{ t(unclassified.length === 1 ? 'has no tax group, so it is excluded from the fiscal book, from the difference total, and from Lampiran 9.' : 'have no tax group, so they are excluded from the fiscal book, from the difference total, and from Lampiran 9.') }}
          </MpBannerDescription>
          <MpBannerLink @click="assignTaxGroup">{{ t('Assign a tax group') }}</MpBannerLink>
          <MpBannerLink @click="applyClassDefault">{{ t('Apply the class default') }}</MpBannerLink>
        </MpBanner>
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
          <!-- A fiscal total that silently omits an asset is the same mistake as
               a fiscal cell showing 0. Say what is missing and why. -->
          <div v-if="totals.unclassified" class="asset-total__note">
            {{ t('excludes') }} {{ totals.unclassified }}
            {{ t(totals.unclassified === 1 ? 'asset with no tax group' : 'assets with no tax group') }}
          </div>
        </div>
      </div>
    </template>

    <!-- ── Cells ── -->
    <template #cell-name="{ row }">
      <button type="button" class="asset-name" @click="openAsset(row as unknown as FixedAsset)">
        <span class="asset-name__label">{{ (row as unknown as FixedAsset).name }}</span>
        <span class="asset-name__sub">
          {{ (row as unknown as FixedAsset).id }}
          <template v-if="(row as unknown as FixedAsset).tag"> · {{ (row as unknown as FixedAsset).tag }}</template>
        </span>
      </button>
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
          <MpButton variant="ghost" left-icon="ellipsis-vertical" :aria-label="t('Actions')" is-rounded size="sm" />
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
        <MpButton variant="secondary" size="sm" @click="clearFilters">{{ t('Clear filters') }}</MpButton>
      </div>
    </template>
  </ErpTablePage>
</template>

<style scoped>
.filter-left { display: flex; align-items: center; gap: 8px; }
.filter-right { display: flex; align-items: center; gap: 8px; margin-left: auto; }

/* Book switcher — a segmented control, because the three options are mutually
   exclusive views of the same rows rather than independent filters. */
.book-switch {
  display: inline-flex;
  border: 1px solid var(--mp-border-neutral, #e2e7ed);
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}
.book-switch__btn {
  border: 0;
  background: transparent;
  padding: 6px 12px;
  font-size: 13px;
  line-height: 20px;
  color: #3a4749;
  cursor: pointer;
  white-space: nowrap;
}
.book-switch__btn + .book-switch__btn { border-left: 1px solid var(--mp-border-neutral, #e2e7ed); }
.book-switch__btn:hover { background: #f4f6f8; }
.book-switch__btn--active { background: #e8f4ef; color: #027a4f; font-weight: 600; }

.asset-alert { margin-bottom: 12px; }

.asset-totals {
  display: flex;
  gap: 32px;
  padding: 12px 0 16px;
  flex-wrap: wrap;
}
.asset-total__label { font-size: 12px; color: #758195; line-height: 18px; }
.asset-total__value { font-size: 18px; font-weight: 600; color: #1e2e2b; line-height: 26px; }
.asset-total__note { font-size: 11px; color: #a8352d; line-height: 16px; }

.asset-name {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  border: 0;
  background: transparent;
  padding: 0;
  text-align: left;
  cursor: pointer;
  /* The name cell carries two lines. Without this the sub-line escapes the
     cell box and collides with the next column. */
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}
.asset-name__label {
  font-weight: 600;
  color: #1e2e2b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.asset-name:hover .asset-name__label { color: #027a4f; text-decoration: underline; }
.asset-name__sub {
  font-size: 12px;
  color: #758195;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* A figure that is absent for a stated reason, not a zero. Red carries the
   same weight as the Incomplete badge on the same row. */
.cell-absent { color: #a8352d; font-weight: 600; }
/* A figure that no longer applies — a disposed asset has no book value. */
.cell-muted { color: #9aa5b1; }

.asset-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 0;
}
.asset-empty__title { font-size: 14px; color: #758195; }
</style>
