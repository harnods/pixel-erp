<script setup lang="ts">
/**
 * Unmatched & discrepancies — a flat cross-cut over both reconciliation sides.
 *
 * Everything the engine couldn't settle, output and input together, so finance
 * can work one queue instead of two screens. Summary tiles up top, then the
 * table.
 *
 * Narrowing by match state is an in-page **Status select**, not a row of tabs.
 * Two reasons: the module's `?tab=` now selects the *view* (Tax periods vs this
 * queue), so it can't also mean match state; and per
 * docs/patterns/index-page-format.md §A.3 status narrowing is a quick filter
 * anyway — the four summary tiles above already give the at-a-glance breakdown
 * the tabs were carrying.
 *
 * Rows open the same detail drawer the workspace uses.
 *
 * Rendered with the shared ErpTablePage + useTableState (rule/table-use-erptablepage),
 * filter bar anatomy as PurchaseOrdersPage: Status quick filter (ErpFilterSelect),
 * Export icon group (ExportModal) and the pill search. Rows open the detail drawer
 * from the identifier cell, a link-styled span (rule/table-name-link-span). Sorted
 * by tax exposure descending, not by date: over a real masa pajak the rows that
 * matter are the biggest money differences, and date order buries them.
 */
import { MpIcon, MpBadge, MpButton, MpButtonGroup, MpTooltip } from '@mekari/pixel3'
import { infoToast } from '~/utils/toasts'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ExportModal from '~/components/patterns/ExportModal.vue'
import ReconciliationDetailDrawer from '~/components/patterns/ReconciliationDetailDrawer.vue'
import {
  MATCH_META, ATTENTION_STATES, reconIssues, issueRows, formatAmountPlain, periodLabelById, reconSides,
  activePeriodId, isPeriodFinalized, reconVersion,
  type ReconIssue, type MatchState, type ReconSide, type ReconIssueRow,
} from '~/data/vatReconciliation'

const { t } = useLocale()

const route = useRoute()

/**
 * The queue belongs to a masa pajak, not to the module: it's opened from a row
 * on the period index, so `?masa=` and `?jenis=` scope it to that period and
 * side. Without them it falls back to everything, which is what a direct link
 * or an old bookmark gets.
 */
const scopedSide = computed<ReconSide | null>(() => {
  const jenis = route.query.jenis
  return jenis === 'input' || jenis === 'output' ? jenis : null
})
// The queue belongs to a masa — it is only ever reached from a period row, so
// both the feed and the scope line read the same ?masa=.
const scopedPeriodId = computed(() => String(route.query.masa ?? activePeriodId))
const scopedPeriod = computed(() => periodLabelById(String(route.query.masa ?? '')))

// reconVersion is read so a match made in the drawer moves the row off the queue.
const issues = computed(() => {
  void reconVersion.value
  return reconIssues(scopedPeriodId.value).filter(i => !scopedSide.value || i.side === scopedSide.value)
})
const rows = computed(() => {
  void reconVersion.value
  return issueRows(scopedPeriodId.value).filter(r => !scopedSide.value || r.side === scopedSide.value)
})

/**
 * Status select options — real values only, no "All issues" entry: clearing the
 * select (x) is what shows everything (docs/patterns/Form.md → Select).
 */
const STATUS_OPTIONS: { label: string; value: MatchState }[] =
  ATTENTION_STATES.map(v => ({ label: t(MATCH_META[v].chipLabel), value: v }))

const {
  search, statusFilter, currentPage, perPage, paginated, total,
  setPage, setPerPage, setSort, sortKey, sortDir, toggleSort,
} = useTableState<ReconIssueRow>(rows, {
  perPage: 25,
  filterFn: (row, s, status) =>
    (!s || `${row.ref} ${row.party} ${row.npwp}`.toLowerCase().includes(s.toLowerCase()))
    && (!status || row.match === status),
})

// Biggest exposure first — the useTableState default is unsorted (dataset order).
setSort('exposure', 'desc')

function clearFilters() { search.value = ''; statusFilter.value = '' }

const partyLabel = computed(() => {
  if (scopedSide.value) return scopedSide.value === 'input' ? t('Vendor') : t('Customer')
  return reconSides().length > 1 ? t('Customer / vendor') : t('Customer')
})

const showSide = computed(() => !scopedSide.value && reconSides().length > 1)

// Semantic kinds, never pixel widths (rule/table-column-kind).
const columns = computed<TableColumn[]>(() => [
  { key: 'ref',      label: t('Number'),   kind: 'number' },
  { key: 'match',    label: t('Status'),   kind: 'status' },
  // Side only earns a column when the queue mixes both (index hides Invoice type the same way).
  ...(showSide.value ? [{ key: 'side', label: t('Side') } as TableColumn] : []),
  // The party is a customer on the output side, a vendor on the input side.
  { key: 'party',    label: partyLabel.value, kind: 'name' },
  { key: 'npwp',     label: 'NPWP',        kind: 'number' },
  { key: 'date',     label: t('Date'),     kind: 'date' },
  { key: 'exposure', label: t('Exposure'), kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'ppn',      label: 'PPN',         kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'total',    label: t('Total'),    kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
])

// ── Export (rule/export-modal) ────────────────────────────────────────────────
const exportOpen = ref(false)
const exportColumns = computed(() => columns.value.map((c, i) => ({ key: c.key, label: c.label, ...(i < 2 ? { required: true } : {}) })))

const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 600) })
const emptyIllustration = '/illustrations/empty-folder.png'

const counts = computed(() => {
  const by = (m: MatchState) => issues.value.filter(i => i.match === m).length
  return {
    all: issues.value.length,
    // The five tiles group the eleven statuses by what the user does next:
    // confirm something, correct something, or chase a missing document.
    pendingReview: by('return-netted') + by('duplicate-reference'),
    correction: by('invoice-edited') + by('invoice-voided'),
    dates: by('faktur-predates') + by('return-date-mismatch'),
    returns: by('return-not-reflected'),
    notInCoretax: by('not-in-coretax'),
    noMatchInErp: by('no-match-in-erp'),
  }
})

/**
 * `iconColor` is MpIcon's `color` prop, not CSS: MpIcon inline-styles
 * `--mp-icon-color` on its own <svg>, so the tile's `color` never reaches it and
 * the icon renders grey #536062 on every tile. The prop takes a dot-path into
 * `--mp-colors-*` (`icon.danger` → `--mp-colors-icon-danger`).
 */
const tiles = computed(() => [
  { label: 'Pending review', sub: 'You confirm the match', value: counts.value.pendingReview, accent: 'info', icon: 'magic', iconColor: 'icon.information' },
  { label: 'Needs correction', sub: 'Invoice edited or voided', value: counts.value.correction, accent: 'warning', icon: 'edit', iconColor: 'icon.warning' },
  { label: 'Date problems', sub: 'Dates out of order', value: counts.value.dates, accent: 'warning', icon: 'time', iconColor: 'icon.warning' },
  { label: 'Returns', sub: 'Return not reflected', value: counts.value.returns, accent: 'warning', icon: 'undo', iconColor: 'icon.warning' },
  { label: 'Not found in Coretax', sub: 'No faktur issued', value: counts.value.notInCoretax, accent: 'critical', icon: 'database', iconColor: 'icon.danger' },
  { label: 'No match in ERP', sub: 'Not recorded in Jurnal', value: counts.value.noMatchInErp, accent: 'critical', icon: 'cloud', iconColor: 'icon.danger' },
])

// ── Detail drawer ─────────────────────────────────────────────────────────────
const drawerOpen = ref(false)
const activeIssue = ref<ReconIssue | null>(null)
const activeSide = computed<ReconSide>(() => activeIssue.value?.side ?? 'output')

function openDetail(issue: ReconIssue) {
  activeIssue.value = issue
  drawerOpen.value = true
}

/**
 * Table cells use DD/MM/YYYY; DD Mon YYYY is for everywhere else
 * (docs/patterns/date-format.md). The dataset stores the display form.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function toTableDate(display: string): string {
  const [d, mon, y] = display.split(' ')
  const m = MONTHS.indexOf(mon ?? '')
  if (!d || m === -1 || !y) return display
  return `${d.padStart(2, '0')}/${String(m + 1).padStart(2, '0')}/${y}`
}

function sourceLabel(side: ReconSide) {
  return side === 'output' ? t('Output · Sales') : t('Input · Purchases')
}
</script>

<template>
  <ErpTablePage
    :columns="columns"
    :rows="(paginated as unknown as Record<string, unknown>[])"
    :total="total"
    :current-page="currentPage"
    :per-page="perPage"
    :sort-key="sortKey"
    :sort-dir="sortDir"
    :loading="loading"
    :search="search"
    :has-active-filter="!!search || !!statusFilter"
    filter-empty-label="issue"
    data-devchange="vat-recon-ui-review"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @clear-filters="clearFilters"
  >
    <!-- Summary tiles + scope line ride in ErpTablePage's #stats slot. -->
    <template #stats>
      <div class="vu-stats">
        <div class="vu-tiles">
          <div v-for="tile in tiles" :key="tile.label" class="vu-tile" :class="`is-${tile.accent}`">
            <div class="vu-tile-icon"><MpIcon :name="tile.icon" size="md" :color="tile.iconColor" /></div>
            <div class="vu-tile-body">
              <div class="vu-tile-label">{{ t(tile.label) }}</div>
              <div class="vu-tile-value">{{ tile.value }}</div>
              <div class="vu-tile-sub">{{ t(tile.sub) }}</div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Filter bar (PurchaseOrdersPage anatomy) -->
    <template #filters>
      <div class="filter-left">
        <ErpFilterSelect
          id="vu-status-filter"
          v-model="statusFilter"
          :placeholder="t('Status')"
          :options="STATUS_OPTIONS"
          width="200px"
        />
      </div>
      <div class="filter-right">
        <MpButtonGroup class="filter-btn-group">
          <MpTooltip id="vu-tt-export" :label="t('Export')" placement="bottom">
            <MpButton variant="ghost" left-icon="download" :aria-label="t('Export')" is-rounded @click="exportOpen = true" />
          </MpTooltip>
        </MpButtonGroup>
        <div class="filter-search">
          <MpIcon name="search" size="sm" />
          <input
            v-model="search"
            class="filter-search-input"
            type="text"
            :placeholder="t('Search...')"
          />
          <MpButton v-if="search" class="search-clear-btn" variant="ghost" type="button" :aria-label="t('Clear search')" left-icon="close" @click="search = ''" />
        </div>
      </div>
    </template>

    <!-- Identifier opens the detail drawer (rule/table-name-link-span) -->
    <template #cell-ref="{ row }">
      <span class="cell-link cell-text" @click.stop="openDetail((row as unknown as ReconIssueRow).issue)">
        {{ (row as unknown as ReconIssueRow).ref }}
      </span>
    </template>
    <template #cell-match="{ row }">
      <!-- Badge = the short (≤2-word) label, same as the workspace; the full PRD
           name stays in the Status filter and the drawer header. -->
      <MpBadge :type="MATCH_META[(row as unknown as ReconIssueRow).match].badgeType" for="tableStatus">
        {{ t(MATCH_META[(row as unknown as ReconIssueRow).match].label) }}
      </MpBadge>
    </template>
    <template #cell-side="{ row }">{{ sourceLabel((row as unknown as ReconIssueRow).side) }}</template>
    <template #cell-date="{ value }">{{ toTableDate(value as string) }}</template>
    <template #cell-exposure="{ value }">
      <span class="vu-exposure">{{ formatAmountPlain(value as number) }}</span>
    </template>
    <template #cell-ppn="{ value }">{{ formatAmountPlain(value as number) }}</template>
    <template #cell-total="{ value }">{{ formatAmountPlain(value as number) }}</template>

    <!-- No issues at all (rule/empty-state-structure, PurchaseOrdersPage pattern) -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('All clear in this period') }}</p>
        <p class="empty-full-desc">{{ t('Nothing to review here for this period.') }}</p>
      </div>
    </template>
  </ErpTablePage>

  <ExportModal
    :open="exportOpen"
    :title="`${t('Export')} ${scopedPeriod ?? ''}`"
    :entity-label="t('issues')"
    :columns="exportColumns"
    :total="total"
    @close="exportOpen = false"
    @export="exportOpen = false"
  />

  <ReconciliationDetailDrawer
    v-model:is-open="drawerOpen"
    :pair="activeIssue"
    :finalized="isPeriodFinalized(scopedPeriodId)"
    :period-id="scopedPeriodId"
    :side="activeSide"
    @action="infoToast"
  />
</template>

<style scoped>
/* ── Summary tiles ── six across at desktop width; wraps evenly (3 + 3) below. */
.vu-stats { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.vu-tiles { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: var(--mp-spacing-3); }
@media (max-width: 1280px) { .vu-tiles { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.vu-tile {
  border-radius: var(--mp-radii-md); padding: var(--mp-spacing-3) var(--mp-spacing-4);
  display: flex; align-items: flex-start; gap: var(--mp-spacing-3);
  border: 1px solid transparent;
}
.vu-tile.is-info { background: var(--mp-airene-badge-bg); border-color: var(--mp-airene-badge-border); color: var(--mp-airene-bold); }
.vu-tile.is-warning { background: var(--mp-colors-orange-100); border-color: var(--mp-colors-orange-200); color: var(--mp-colors-orange-800); }
.vu-tile.is-critical { background: var(--mp-colors-red-100); border-color: var(--mp-colors-red-200); color: var(--mp-colors-red-800); }
.vu-tile-icon {
  --vu-icon-sz: 36px;
  width: var(--vu-icon-sz); height: var(--vu-icon-sz); border-radius: var(--mp-radii-md);
  background: var(--mp-background-surface);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  color: inherit;
}
.vu-tile-body { flex: 1; min-width: 0; }
.vu-tile-label {
  font-size: var(--mp-font-sizes-xs); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; color: inherit;
}
.vu-tile-value {
  font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.vu-tile-sub { font-size: var(--mp-font-sizes-xs); color: var(--mp-text-subtle); }

/* The sort key — emphasised so the row order is self-evident. */
.vu-exposure { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-red-800); }

/* ── Filter bar (PurchaseOrdersPage) ── */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-btn-group { display: flex; align-items: center; }
.filter-btn-group :deep(.mp-pixel-button-group) { gap: var(--mp-spacing-2); }

/* ── Full empty state (PurchaseOrdersPage) ── */
.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { --vu-illus-w: 288px; --vu-illus-h: 240px; width: var(--vu-illus-w); height: var(--vu-illus-h); object-fit: contain; }
.empty-full-title {
  margin: 0;
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.empty-full-desc {
  margin: var(--mp-spacing-0\.5) 0 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
</style>
