<script setup lang="ts">
/**
 * VAT reconciliation — period index (Reports › Tax › VAT reconciliation).
 *
 * The module's entry point, and the only place the multi-period picture exists:
 * the workspace reconciles one masa pajak at a time behind a dropdown, which
 * hides which masa are still open.
 *
 * Shape follows the equivalent Klikpajak screen, so the two products read the
 * same: **one row per masa × side**, told apart by a `Jenis faktur` column, with
 * the ERP column and the Coretax column side by side and their `Selisih` between
 * them. Keluaran and masukan share the table but never share a row — they're
 * separate pieces of reconciliation work.
 *
 * The two amount columns each carry a record-count badge, because "Rp450.000
 * across 3 faktur" and "Rp450.000 across 10 faktur" are different situations
 * even when the totals agree.
 */
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpIcon, MpTooltip, MpButton, MpButtonGroup,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ExportModal from '~/components/patterns/ExportModal.vue'
import ReconciliationFiltersDrawer, {
  emptyReconciliationFilters, type ReconciliationFiltersValue,
} from '~/components/patterns/ReconciliationFiltersDrawer.vue'
// formatAmountPlain, not formatIDR: each header already carries "(Rp)", so the
// symbol on every cell is redundant — see docs/patterns/currency-format.md, a
// labelled money column is not a currency display.
import {
  reconPeriodRows, reconPeriodOptions, formatAmountPlain, loadVatSetup, reconVersion,
  reconSides, type ReconPeriodRow,
} from '~/data/vatReconciliation'

const toggleAirene = inject<() => void>('toggleAirene')
const { t } = useLocale()
const router = useRouter()
const route = useRoute()

/**
 * Page-level tab = the *scope* of the list, per docs/patterns/tabs.md: `All
 * reconciliations` is the full calendar, `Needs attention` is everything not
 * finished. Narrowing within a scope is the filter bar's job, which is why the
 * masa and the two quick filters are not tabs.
 */
const isAttentionScope = computed(() => route.query.tab === 'Needs attention')

/**
 * Setup gate (US-016). Reconciliation pulls the ERP side by tax code, so until
 * somebody has said which codes count as PPN Keluaran there is nothing honest to
 * put in this table — an index built from the wrong codes is worse than no
 * index. First run therefore shows the gate, not an empty state: an empty state
 * says "nothing here yet", and that would be a lie.
 */
const isSetUp = ref(true)
onMounted(() => { isSetUp.value = !!loadVatSetup() })

// ─── Columns ──────────────────────────────────────────────────────────────────
// Amount columns are right-aligned; the count badge rides along inside the cell
// so it stays tied to the figure it qualifies.
// Widths come from the semantic `kind` (rule/table-column-kind, columnWidths.ts)
// — never a per-table pixel width.
// "Reconciliation" is dropped from both headers that carried it: on a page
// titled VAT reconciliation it's redundant three times over, and spelling it out
// clipped the headers at any width the table could afford.
// The Invoice type column earns its place only when there is more than one
// kind — under VAT Out only it would repeat the same value down every row.
const columns = computed<TableColumn[]>(() => [
  { key: 'masa',        label: t('Tax period'),    kind: 'number', sortable: true,                 sortType: 'text'   },
  { key: 'reconciledAt',label: t('Reconciled on'), kind: 'date',   sortable: true,                 sortType: 'date'   },
  ...(showJenisFilter.value
    ? [{ key: 'jenis', label: t('Invoice type'), sortType: 'text' } as TableColumn]
    : []),
  // "Sales/purchase" only earns the slash when both sides are in scope; under
  // VAT Out the second half names a document that isn't in the table (US-018).
  { key: 'erpAmount',
    label: showJenisFilter.value ? t('Sales/purchase invoice (Rp)') : t('Sales invoice (Rp)'),
    kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'djpAmount',   label: t('Tax invoice (Rp)'), kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'selisih',     label: t('Difference (Rp)'),  kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'status',      label: t('Status'),           kind: 'status',                                sortType: 'text'   },
])

// reconVersion is read so a period reconciled in the workspace updates its row
// here too — status, matched count and Reconciled on all move together.
const rows = computed<ReconPeriodRow[]>(() => {
  void reconVersion.value
  return reconPeriodRows()
})

// ─── Filters ──────────────────────────────────────────────────────────────────
// Two quick filters, the documented maximum — Invoice type first because it's
// the axis people actually work along (keluaran and masukan are different jobs),
// Status second. Everything else (masa pajak, has-a-difference) lives behind
// All filters.
const jenisFilter = ref('')
const filtersOpen = ref(false)
const appliedFilters = reactive<ReconciliationFiltersValue>(emptyReconciliationFilters())
const periodOptions = reconPeriodOptions()

function applyDrawerFilters(v: ReconciliationFiltersValue) { Object.assign(appliedFilters, v) }

const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<ReconPeriodRow>(rows, {
  perPage: 25,
  filterFn: (row, s, status) =>
    (row.masa.includes(s) || row.jenis.toLowerCase().includes(s))
    // Tab scope is ANDed with everything else, so a filter can narrow within
    // the scope but never widen past it.
    && (!isAttentionScope.value || (row.status !== 'reconciled' && row.status !== 'finalized'))
    && (!jenisFilter.value || row.side === jenisFilter.value)
    && (!status || row.status === status)
    && (appliedFilters.periods.length === 0 || appliedFilters.periods.includes(row.periodId))
    && (!appliedFilters.withDifferenceOnly || row.selisih > 0),
})

watch(jenisFilter, () => setPage(1))
watch(appliedFilters, () => setPage(1))
// Switching scope resets narrowing: the two scopes hold different rows, so a
// filter carried across can land the user on an empty table for no visible reason.
watch(isAttentionScope, () => {
  search.value = ''
  statusFilter.value = ''
  jenisFilter.value = ''
  Object.assign(appliedFilters, emptyReconciliationFilters())
  setPage(1)
})

/**
 * Status options are scoped to the tab, so the two controls can't contradict
 * each other — no "Needs attention + Reconciled" dead end.
 */
const statusOptions = computed(() => {
  const all = [
    { label: t('Not reconciled'),       value: 'not reconciled'       },
    { label: t('Partially reconciled'), value: 'partially reconciled' },
    { label: t('Reconciled'),           value: 'reconciled'           },
    { label: t('Finalized'),            value: 'finalized'            },
  ]
  // A finished period is finished whichever way it got there, so Needs attention
  // hides both of the done states rather than only one.
  return isAttentionScope.value
    ? all.filter(o => o.value !== 'reconciled' && o.value !== 'finalized')
    : all
})
/**
 * Only the sides in scope. With VAT Out only there is nothing to choose between,
 * so the filter hides itself rather than offering a control with one option.
 */
const jenisOptions = computed(() => {
  void reconVersion.value
  const all = [
    { label: t('Output tax invoice'), value: 'output' },
    { label: t('Input tax invoice'),  value: 'input'  },
  ]
  return all.filter(o => reconSides().includes(o.value as 'output' | 'input'))
})
const showJenisFilter = computed(() => jenisOptions.value.length > 1)

// "All filters (N)" — one per active drawer filter row
// (rule/filter-all-filters-active-count, same as BillsIndexPage).
const activeFilterCount = computed(
  () => (appliedFilters.periods.length > 0 ? 1 : 0) + (appliedFilters.withDifferenceOnly ? 1 : 0),
)
const isDrawerFilterActive = computed(() => activeFilterCount.value > 0)
const hasAnyFilter = computed(
  () => !!search.value || !!statusFilter.value || !!jenisFilter.value || isDrawerFilterActive.value,
)

function clearFilters() {
  search.value = ''
  statusFilter.value = ''
  jenisFilter.value = ''
  Object.assign(appliedFilters, emptyReconciliationFilters())
}

// ─── Formatters ───────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })
    .format(new Date(iso))
}

// ─── Navigation ───────────────────────────────────────────────────────────────
// The workspace reads ?masa= to open on the right period (see its `period` ref);
// the row's own side decides which of the two workspaces to open.
function openWorkspace(row: ReconPeriodRow) {
  router.push(`/faktur-${row.side === 'input' ? 'masukan' : 'keluaran'}?masa=${row.periodId}`)
}

/**
 * The issue queue belongs to the period, so it's reached from the row rather
 * than from a module-level tab — scoped to this masa and this side.
 */
function openIssues(row: ReconPeriodRow) {
  router.push(`/unmatched-and-discrepancies?masa=${row.periodId}&jenis=${row.side}`)
}

// ─── Export (rule/export-modal) ───────────────────────────────────────────────
// Every export — the filter-bar icon, a row's download, the bulk action — opens
// the shared ExportModal (PurchaseOrdersPage pattern); never a silent download.
const exportOpen = ref(false)
const exportTitle = ref('')
const exportSelected = ref<number | undefined>(undefined)
const exportColumns = computed(() => [
  { key: 'masa', label: t('Tax period'), required: true },
  { key: 'pair', label: t('Pair') },
  { key: 'status', label: t('Status'), required: true },
  { key: 'erpRef', label: t('Sales invoice') },
  { key: 'djpRef', label: t('Tax invoice') },
  { key: 'dpp', label: 'DPP' },
  { key: 'ppn', label: 'PPN' },
  { key: 'remarks', label: t('Remarks') },
])
function openExport(title = t('Export VAT reconciliation'), selected?: number) {
  exportTitle.value = title
  exportSelected.value = selected
  exportOpen.value = true
}
function exportPeriod(row: ReconPeriodRow) {
  openExport(`${t('Export')} ${row.label}`)
}
const emptyIllustration = '/illustrations/empty-folder.png'

// ─── First-load skeleton ──────────────────────────────────────────────────────
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })

// Column show/hide (first column always on). Keyed off `columns`, which is now
// scope-dependent, so a column that isn't offered can't be left hidden-but-on.
const columnVisibility = reactive<Record<string, boolean>>({})
watchEffect(() => {
  for (const c of columns.value) if (!(c.key in columnVisibility)) columnVisibility[c.key] = true
})
const columnItems = computed(() =>
  columns.value.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 })))
const visibleColumns = computed<TableColumn[]>(() =>
  columns.value.filter(c => columnVisibility[c.key] !== false))
function hideColumn(key: string) { columnVisibility[key] = false }
</script>

<template>
  <!-- US-016 — no index until setup is saved -->
  <div v-if="!isSetUp" class="vp-setup-gate">
    <div class="vp-setup-icon"><MpIcon name="sliders" size="32px" color="icon.information" /></div>
    <h2 class="vp-setup-title">{{ t('Set up VAT reconciliation') }}</h2>
    <p class="vp-setup-body">
      {{ t('Choose the accounts that record PPN. Reconciliation pulls every transaction posted to them — sales invoices, journal entries and bank deposits.') }}
    </p>
    <MpButton variant="primary" is-rounded @click="router.push('/matching-rules')">
      {{ t('Start setup') }}
    </MpButton>
  </div>

  <ErpTablePage
    v-else
    :columns="visibleColumns"
    :rows="(paginated as unknown as Record<string, unknown>[])"
    :total="total"
    :current-page="currentPage"
    :per-page="perPage"
    :sort-key="sortKey"
    :sort-dir="sortDir"
    :loading="loading"
    :has-active-filter="hasAnyFilter"
    :search="search"
    has-checkbox
    bulk-label="tax period"
    :context-label="(row) => `${t('Tax period')} ${row.masa} · ${row.jenis}`"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
  >
    <!-- ── Bulk actions (rule/table-checkbox-implies-bulk) — one secondary-sm
         "Actions" dropdown, PurchaseOrdersPage pattern; no Delete. ── -->
    <template #bulk-actions="{ selectedRows }">
      <MpPopover id="vp-bulk-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
        <MpPopoverTrigger>
          <MpButton size="sm" variant="secondary" right-icon="chevrons-down" is-rounded>{{ t('Actions') }}</MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent class="erp-dropdown-menu">
          <MpPopoverList>
            <MpPopoverListItem @click="openExport(t('Export VAT reconciliation'), (selectedRows as Set<number>).size)">{{ t('Export') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Filter bar (PurchaseOrdersPage anatomy) ── -->
    <template #filters>
      <div class="filter-left" data-devchange="vat-recon-ui-review">
        <!-- Quick filters = ErpFilterSelect (rule/select-erpfilterselect). Invoice
             type only exists when both sides are in scope. -->
        <ErpFilterSelect
          v-if="showJenisFilter"
          id="vp-jenis-filter"
          v-model="jenisFilter"
          :placeholder="t('Invoice type')"
          :options="jenisOptions"
        />
        <ErpFilterSelect
          id="vp-status-filter"
          v-model="statusFilter"
          :placeholder="t('Status')"
          :options="statusOptions"
        />

        <!-- Everything past the quick slots: masa pajak, has-a-difference. -->
        <MpButton variant="secondary" left-icon="filter" is-rounded class="filter-all-btn" @click="filtersOpen = true">
          {{ t('All filters') }}{{ activeFilterCount > 0 ? ` (${activeFilterCount})` : '' }}
        </MpButton>
      </div>

      <div class="filter-right">
        <!-- Icon tools = ghost icon MpButtons in one MpButtonGroup + tooltips
             (rule/filter-bar-icon-group) -->
        <MpButtonGroup class="filter-btn-group">
          <MpTooltip id="vp-tt-airene" :label="t('Ask Airene')" placement="bottom">
            <MpButton class="filter-airene-btn" variant="ghost" left-icon="airene-brand" :aria-label="t('Ask Airene')" is-rounded @click="toggleAirene?.()" />
          </MpTooltip>
          <ColumnSettingsMenu id="vp-tt-columns" :items="columnItems" :visibility="columnVisibility" />
          <MpTooltip id="vp-tt-export" :label="t('Export')" placement="bottom">
            <MpButton variant="ghost" left-icon="download" :aria-label="t('Export')" is-rounded @click="openExport()" />
          </MpTooltip>
        </MpButtonGroup>

        <!-- Pill search (sanctioned ErpFilterBar pill) -->
        <div class="filter-search">
          <MpIcon name="search" size="sm" />
          <input
            v-model="search"
            class="filter-search-input"
            type="text"
            :placeholder="t('Search tax period')"
          />
          <MpButton v-if="search" class="search-clear-btn" variant="ghost" type="button" :aria-label="t('Clear search')" left-icon="close" @click="search = ''" />
        </div>
      </div>
    </template>

    <!-- ── Masa pajak — the identifier column; text link to its workspace ── -->
    <template #cell-masa="{ row }">
      <a class="cell-link cell-text" @click.stop="openWorkspace(row as unknown as ReconPeriodRow)">
        {{ (row as unknown as ReconPeriodRow).masa }}
      </a>
    </template>

    <!-- Never run → em dash, not a fabricated date. -->
    <template #cell-reconciledAt="{ value }">
      <span v-if="value">{{ formatDate(value as string) }}</span>
      <span v-else class="vp-muted">—</span>
    </template>

    <!-- ── The two amount columns, each with its record count ── -->
    <template #cell-erpAmount="{ row }">
      <span class="vp-amount">
        <span class="vp-amount-value">{{ formatAmountPlain((row as unknown as ReconPeriodRow).erpAmount) }}</span>
        <span class="vp-count">{{ (row as unknown as ReconPeriodRow).erpCount }}</span>
      </span>
    </template>

    <template #cell-djpAmount="{ row }">
      <span class="vp-amount">
        <span class="vp-amount-value">{{ formatAmountPlain((row as unknown as ReconPeriodRow).djpAmount) }}</span>
        <span class="vp-count">{{ (row as unknown as ReconPeriodRow).djpCount }}</span>
      </span>
    </template>

    <!-- A non-zero selisih is the whole point of the row — red, never muted, and
         a link into that period's own issue queue since it's the number you'd
         click to find out why. -->
    <template #cell-selisih="{ row, value }">
      <a
        v-if="(value as number) > 0"
        class="cell-link vp-selisih"
        @click.stop="openIssues(row as unknown as ReconPeriodRow)"
      >{{ formatAmountPlain(value as number) }}</a>
      <span v-else>{{ formatAmountPlain(value as number) }}</span>
    </template>

    <template #cell-status="{ value }">
      <ErpStatusBadge :status="value as string" />
    </template>

    <!-- Periods come from the tax calendar, so the list is never genuinely empty
         and there is nothing to create — no "+ New" CTA here. -->
    <!-- Illustration + title + caption (rule/empty-state-structure,
         PurchaseOrdersPage pattern). -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('No tax periods') }}</p>
        <p class="empty-full-desc">{{ t('Tax periods will appear here.') }}</p>
      </div>
    </template>

    <!-- ── Row actions — the standard [...] kebab (rule/table-actions-column,
         PurchaseOrdersPage pattern); Export opens the ExportModal. ── -->
    <template #actions="{ row }">
      <MpPopover :id="`vp-row-actions-${row.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
        </MpPopoverTrigger>
        <MpPopoverContent class="erp-dropdown-menu">
          <MpPopoverList>
            <MpPopoverListItem @click="openWorkspace(row as unknown as ReconPeriodRow)">{{ t('View details') }}</MpPopoverListItem>
            <MpPopoverListItem @click="exportPeriod(row as unknown as ReconPeriodRow)">{{ t('Export') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>
  </ErpTablePage>

  <ExportModal
    :open="exportOpen"
    :title="exportTitle"
    :entity-label="t('tax periods')"
    :columns="exportColumns"
    :total="total"
    :selected-count="exportSelected ?? 0"
    @close="exportOpen = false"
    @export="exportOpen = false"
  />

  <ReconciliationFiltersDrawer
    id="vp-allfilters"
    :is-open="filtersOpen"
    :model-value="appliedFilters"
    :period-options="periodOptions"
    @update:is-open="filtersOpen = $event"
    @apply="applyDrawerFilters"
  />
</template>

<style scoped>
/* Custom spacing tokens (pixel-police compliant). */
:scope { --vp-icon-sz: 64px; --vp-search-w: 248px; --vp-clear-sz: 18px; --vp-illus-w: 288px; --vp-illus-h: 240px; }

/* First-run gate — centred, one action, no table chrome behind it. */
.vp-setup-gate {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-10) var(--mp-spacing-6);
  max-width: 520px;
  margin: 0 auto;
}
.vp-setup-icon {
  display: grid;
  place-items: center;
  width: var(--vp-icon-sz);
  height: var(--vp-icon-sz);
  border-radius: var(--mp-radii-full);
  background: var(--mp-colors-blue-100);
}
.vp-setup-title {
  margin: 0;
  font-size: var(--mp-font-sizes-xl);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.vp-setup-body {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
}

/* ── Cells ──────────────────────────────────────────────────────────────── */
.cell-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.vp-muted { color: var(--mp-text-subtle); }

/* Amount + its record count: figure first, badge pinned to the column's right
   edge. The fixed badge width keeps the figures at a constant offset, so their
   decimal points still line up down the table. */
.vp-amount {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-3);
  justify-content: flex-end;
  width: 100%;
}
.vp-amount-value {
  font-variant-numeric: tabular-nums;
  order: 1;
}
/* Record count — a plain read-only tally, not a status, so it is neutral gray
   (rule/tag-gray-only): an orange chip read as a warning on every reconciled row. */
.vp-count {
  order: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--mp-sizes-5, 20px);
  padding: 0 var(--mp-spacing-1\.5);
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral-subtle);
  color: var(--mp-text-secondary);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-regular);
  font-variant-numeric: tabular-nums;
}

/* Palette tokens, since the semantic --mp-text-danger family is not emitted in
   this app (it resolves to nothing). Same red as MATCH_META. */
/* .cell-link sets its colour with !important (erp.css), so the selisih needs the
   higher-specificity pair + !important to stay red as a link. */
.cell-link.vp-selisih {
  color: var(--mp-colors-red-800) !important;
  font-weight: var(--mp-font-weights-semi-bold);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  text-decoration: none;
}
.vp-selisih:hover { text-decoration: underline; }

/* ── Full empty state (PurchaseOrdersPage pattern) ─────────────────────── */
.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: var(--vp-illus-w); height: var(--vp-illus-h); object-fit: contain; }
.empty-full-title {
  margin: 0;
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.empty-full-desc {
  margin: var(--mp-spacing-0\.5) 0 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
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
/* "All filters" — secondary MpButton restyled like PurchaseOrdersPage; stays
   neutral when active, the "(N)" is the signal (rule/filter-all-filters-active-count). */
.filter-all-btn {
  display: inline-flex !important;
  align-items: center;
  gap: var(--mp-spacing-2);
  width: auto !important;
  height: auto !important;
  min-width: 0 !important;
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3) !important;
  background: var(--mp-background-neutral) !important;
  border: 1px solid var(--mp-border-bold) !important;
  border-radius: var(--mp-radii-full) !important;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
  white-space: nowrap;
}
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered) !important; }

.filter-btn-group { display: flex; align-items: center; }
/* icon tools sit 8px apart (MpButtonGroup default) — rule/btn-group-gap-8 */
.filter-btn-group :deep(.mp-pixel-button-group) { gap: var(--mp-spacing-2); }
.filter-airene-btn :deep(svg) { color: var(--mp-airene-default); }

.filter-search {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  width: var(--vp-search-w);
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: var(--vp-clear-sz);
  height: var(--vp-clear-sz);
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--mp-text-secondary);
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }
</style>
