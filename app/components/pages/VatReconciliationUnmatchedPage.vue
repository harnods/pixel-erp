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
 * Paginated at 25/page via useTableState + ErpPagination (see
 * docs/patterns/index-page-format.md). Sorted by tax exposure descending, not by
 * date: over a real masa pajak the rows that matter are the biggest money
 * differences, and date order buries them.
 */
import {
  MpIcon, MpBadge, MpSelect, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import { infoToast } from '~/utils/toasts'
import ReconciliationDetailDrawer from '~/components/patterns/ReconciliationDetailDrawer.vue'
import ErpPagination from '~/components/patterns/ErpPagination.vue'
import {
  MATCH_META, reconIssues, issueRows, formatAmountPlain, periodLabelById, SIDE_LABELS,
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
const scopedPeriod = computed(() => periodLabelById(String(route.query.masa ?? '')))

const issues = computed(() =>
  reconIssues().filter(i => !scopedSide.value || i.side === scopedSide.value),
)
const rows = computed(() =>
  issueRows().filter(r => !scopedSide.value || r.side === scopedSide.value),
)

/**
 * Status select options — real values only, no "All issues" entry: clearing the
 * select (x) is what shows everything (docs/patterns/Form.md → Select).
 */
const STATUS_OPTIONS: { label: string; value: MatchState }[] = [
  { label: t('Suggested'),    value: 'suggested'   },
  { label: t('Discrepancy'),  value: 'discrepancy' },
  { label: t('ERP only'),     value: 'erp-only'    },
  { label: t('Coretax only'), value: 'djp-only'    },
]

const {
  statusFilter, currentPage, perPage, paginated, total, setPage, setPerPage, setSort,
} = useTableState<ReconIssueRow>(rows, {
  perPage: 25,
  filterFn: (row, _search, status) => !status || row.match === status,
})

// Biggest exposure first — the useTableState default is unsorted (dataset order).
setSort('exposure', 'desc')

const statusLabel = computed(
  () => STATUS_OPTIONS.find(o => o.value === statusFilter.value)?.label ?? '',
)

const counts = computed(() => ({
  all: issues.value.length,
  suggested: issues.value.filter(i => i.match === 'suggested').length,
  discrepancy: issues.value.filter(i => i.match === 'discrepancy').length,
  'erp-only': issues.value.filter(i => i.match === 'erp-only').length,
  'djp-only': issues.value.filter(i => i.match === 'djp-only').length,
}))

/**
 * `iconColor` is MpIcon's `color` prop, not CSS: MpIcon inline-styles
 * `--mp-icon-color` on its own <svg>, so the tile's `color` never reaches it and
 * the icon renders grey #536062 on every tile. The prop takes a dot-path into
 * `--mp-colors-*` (`icon.danger` → `--mp-colors-icon-danger`).
 */
const tiles = computed(() => [
  { label: 'Need review', sub: 'Suggested matches', value: counts.value.suggested, accent: 'info', icon: 'magic', iconColor: 'icon.information' },
  { label: 'Discrepancies', sub: 'Amount or date diffs', value: counts.value.discrepancy, accent: 'warning', icon: 'warning-triangle', iconColor: 'icon.warning' },
  { label: 'ERP only', sub: 'No faktur in Coretax', value: counts.value['erp-only'], accent: 'critical', icon: 'database', iconColor: 'icon.danger' },
  { label: 'Coretax only', sub: 'Not recorded in ERP', value: counts.value['djp-only'], accent: 'critical', icon: 'cloud', iconColor: 'icon.danger' },
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
  <div class="vu-page">
    <!-- Summary tiles -->
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

    <!-- Scope line — says which masa and side this queue belongs to, since it's
         opened from a period row rather than from the sidebar. -->
    <p v-if="scopedPeriod || scopedSide" class="vu-scope">
      <span v-if="scopedPeriod">{{ scopedPeriod }}</span>
      <span v-if="scopedPeriod && scopedSide" class="vu-scope-sep">·</span>
      <span v-if="scopedSide">{{ SIDE_LABELS[scopedSide].title }}</span>
    </p>

    <!-- Filter bar — one quick filter (Status). Replaces the old section tabs;
         match state is a filter, not a scope. -->
    <div class="vu-filters">
      <MpPopover id="vu-status-filter" is-close-on-select>
        <MpPopoverTrigger>
          <MpSelect
            id="vu-status-select"
            :placeholder="t('Status')"
            :model-value="statusFilter"
            is-clearable
            :class="css({ width: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })"
            @mousedown.prevent
            @clear="statusFilter = ''"
          >
            <option v-if="statusFilter" :value="statusFilter">{{ statusLabel }}</option>
          </MpSelect>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', maxWidth: '320px' })">
          <MpPopoverList>
            <MpPopoverListItem
              v-for="opt in STATUS_OPTIONS"
              :key="opt.value"
              :is-active="opt.value === statusFilter"
              @click="statusFilter = opt.value"
            >
              {{ opt.label }}
            </MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </div>

    <!-- Table -->
    <div class="vu-table">
      <div class="vu-head">
        <span>{{ t('Status') }}</span>
        <span>{{ t('Side / source') }}</span>
        <span>{{ t('Party · NPWP') }}</span>
        <span>{{ t('Date') }}</span>
        <span class="vu-num">{{ t('Exposure') }}</span>
        <span class="vu-num">PPN</span>
        <span class="vu-num">{{ t('Total') }}</span>
        <span />
      </div>

      <div class="vu-rows">
        <div v-if="total === 0" class="vu-empty">
          <MpIcon name="done" size="32px" color="icon.success" />
          <div class="vu-empty-title">{{ t('All clear in this category') }}</div>
          <div class="vu-empty-body">{{ t('Nothing to review here for this period.') }}</div>
        </div>

        <button
          v-for="row in paginated"
          :key="row.id"
          type="button"
          class="vu-row"
          @click="openDetail(row.issue)"
        >
          <span>
            <MpBadge :type="MATCH_META[row.match].badgeType" for="tableStatus" size="sm">
              {{ t(MATCH_META[row.match].chipLabel) }}
            </MpBadge>
          </span>
          <span>
            <span class="vu-cell-strong">{{ sourceLabel(row.side) }}</span>
            <span class="vu-cell-sub">{{ row.ref }}</span>
          </span>
          <span>
            <span class="vu-cell-strong">{{ row.party }}</span>
            <span class="vu-cell-sub">{{ row.npwp }}</span>
          </span>
          <span class="vu-cell-plain">{{ toTableDate(row.date) }}</span>
          <span class="vu-num vu-cell-exposure">{{ formatAmountPlain(row.exposure) }}</span>
          <span class="vu-num vu-cell-plain">{{ formatAmountPlain(row.ppn) }}</span>
          <span class="vu-num vu-cell-total">{{ formatAmountPlain(row.total) }}</span>
          <span class="vu-chevron"><MpIcon name="chevrons-right" size="sm" /></span>
        </button>
      </div>

      <ErpPagination
        :total="total"
        :current-page="currentPage"
        :per-page="perPage"
        @page-change="setPage"
        @per-page-change="setPerPage"
      />
    </div>

    <ReconciliationDetailDrawer
      v-model:is-open="drawerOpen"
      :pair="activeIssue"
      :side="activeSide"
      @action="infoToast"
    />
  </div>
</template>

<style scoped>
.vu-page { display: flex; flex-direction: column; gap: var(--mp-spacing-4); min-height: 0; }

/* ── Scope line ── */
.vu-scope {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}
.vu-scope-sep { margin: 0 var(--mp-spacing-2); color: var(--mp-text-subtle); }

/* ── Filter bar ── */
.vu-filters { display: flex; align-items: center; gap: var(--mp-spacing-4); }

/* ── Summary tiles ── */
.vu-tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--mp-spacing-3); }
.vu-tile {
  border-radius: var(--mp-radii-md); padding: var(--mp-spacing-3) var(--mp-spacing-4);
  display: flex; align-items: flex-start; gap: var(--mp-spacing-3);
  border: 1px solid transparent;
}
.vu-tile.is-info { background: var(--mp-airene-badge-bg); border-color: var(--mp-airene-badge-border); color: var(--mp-airene-bold); }
.vu-tile.is-warning { background: var(--mp-colors-orange-100); border-color: var(--mp-colors-orange-200); color: var(--mp-colors-orange-800); }
.vu-tile.is-critical { background: var(--mp-colors-red-100); border-color: var(--mp-colors-red-200); color: var(--mp-colors-red-800); }
.vu-tile-icon {
  width: 36px; height: 36px; border-radius: var(--mp-radii-md);
  background: var(--mp-background-surface);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  color: inherit;
}
.vu-tile-body { flex: 1; min-width: 0; }
.vu-tile-label {
  font-size: 10px; font-weight: var(--mp-font-weights-bold);
  letter-spacing: 0.06em; text-transform: uppercase; color: inherit;
}
.vu-tile-value {
  font-size: 26px; font-weight: var(--mp-font-weights-bold);
  color: var(--mp-text-default); letter-spacing: -0.01em; line-height: 1.2;
}
.vu-tile-sub { font-size: var(--mp-font-sizes-xs); color: var(--mp-text-subtle); }

/* ── Table ── */
.vu-table {
  flex: 1; min-height: 0;
  background: var(--mp-background-surface);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  display: flex; flex-direction: column; overflow: hidden;
}
.vu-head, .vu-row {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr) minmax(0, 1.5fr) 110px 130px 140px 140px 40px;
  gap: var(--mp-spacing-2);
}
.vu-head {
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: 10px; font-weight: var(--mp-font-weights-bold);
  letter-spacing: 0.04em; text-transform: uppercase; color: var(--mp-text-default);
}
.vu-rows { flex: 1; min-height: 0; overflow: auto; }
.vu-row {
  all: unset;
  box-sizing: border-box;
  width: 100%;
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr) minmax(0, 1.5fr) 110px 130px 140px 140px 40px;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default);
  align-items: center; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default);
  text-align: left;
}
.vu-row:hover { background: var(--mp-background-neutral-subtle); }
.vu-cell-strong {
  display: block;
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.vu-cell-sub {
  display: block;
  font-size: var(--mp-font-sizes-xs); color: var(--mp-text-subtle);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.vu-cell-plain { color: var(--mp-text-default); }
.vu-num { text-align: right; font-variant-numeric: tabular-nums; }
.vu-cell-total { font-weight: var(--mp-font-weights-semi-bold); }
/* The sort key — emphasised so the row order is self-evident. */
.vu-cell-exposure {
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-colors-red-800);
}
.vu-chevron { text-align: right; color: var(--mp-text-subtle); }

/* ── Empty ── */
.vu-empty {
  padding: var(--mp-spacing-20) var(--mp-spacing-6);
  display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-2);
  text-align: center;
}
.vu-empty-title {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.vu-empty-body { font-size: var(--mp-font-sizes-md); color: var(--mp-text-subtle); }
</style>
